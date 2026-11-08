'use strict';

const crypto = require('node:crypto');
const { onNewLead } = require('./lead-events');
const { verifyMetaSignature, validateGraphApiVersion } = require('./meta-leads');
const ALLOWED_RECIPIENT = '5534996440163';
const MODES = new Set(['off', 'test', 'auto']);
const MAX_MONTHLY_MESSAGES = 100;

function brazilDate(now = new Date()) {
    const p = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(now);
    const value = type => p.find(x => x.type === type).value;
    return `${value('year')}-${value('month')}-${value('day')}`;
}

function readConfig(env = process.env, now = new Date()) {
    const mode = env.WHATSAPP_NOTIFICATIONS_MODE || 'off';
    const cap = Number(env.WHATSAPP_MAX_MESSAGES_PER_MONTH || MAX_MONTHLY_MESSAGES);
    const validUntil = env.WHATSAPP_RATE_VALID_UNTIL || '';
    const version = env.WHATSAPP_GRAPH_API_VERSION || env.META_GRAPH_API_VERSION || '';
    const config = {
        mode, cap, validUntil, version,
        token: env.WHATSAPP_ACCESS_TOKEN || '',
        phoneId: env.WHATSAPP_PHONE_NUMBER_ID || '',
        accountId: env.WHATSAPP_ACCOUNT_ID || '',
        recipient: env.WHATSAPP_RECIPIENT || '',
        template: env.WHATSAPP_TEMPLATE_NAME || '',
        verifyToken: env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '',
        appSecret: env.META_APP_SECRET || '',
        testKey: env.WHATSAPP_SETUP_TEST_ID || ''
    };
    config.enabled = mode !== 'off' && MODES.has(mode) &&
        Number.isSafeInteger(cap) && cap > 0 && cap <= MAX_MONTHLY_MESSAGES &&
        /^\d{4}-\d{2}-\d{2}$/.test(validUntil) &&
        !Number.isNaN(Date.parse(`${validUntil}T00:00:00Z`)) &&
        new Date(`${validUntil}T00:00:00Z`).toISOString().slice(0, 10) === validUntil &&
        brazilDate(now) <= validUntil && validUntil <= '2026-12-31' &&
        validateGraphApiVersion(version) && /^\d+$/.test(config.phoneId) &&
        /^\d+$/.test(config.accountId) && config.recipient === ALLOWED_RECIPIENT &&
        /^[a-z0-9_]{1,100}$/.test(config.template) &&
        /^[a-zA-Z0-9_-]{1,100}$/.test(config.testKey) &&
        Boolean(config.token && config.verifyToken && config.appSecret);
    // Uma mudança de remetente/modelo/destinatário exige nova prova de entrega.
    config.testKey = crypto.createHash('sha256').update(JSON.stringify([
        config.testKey,config.phoneId,config.accountId,config.recipient,config.template
    ])).digest('hex');
    return config;
}

function payloadFor(alert, config) {
    const label = alert.test_key ? 'TESTE DE ENTREGA (nenhum lead cadastrado)' : String(alert.lead_id);
    if (!alert.test_key && (!Number.isSafeInteger(Number(alert.lead_id)) || Number(alert.lead_id) < 1)) {
        throw new Error('invalid_lead_id');
    }
    return {
        messaging_product: 'whatsapp', to: config.recipient, type: 'template',
        template: { name: config.template, language: { code: 'pt_BR' },
            components: [{ type: 'body', parameters: [{ type: 'text', text: label }] }] }
    };
}

function deliveryReceipts(body, phoneId) {
    const result = [];
    if (body?.object !== 'whatsapp_business_account') return result;
    for (const entry of (Array.isArray(body.entry) ? body.entry : []).slice(0, 20)) {
        for (const change of (Array.isArray(entry.changes) ? entry.changes : []).slice(0, 20)) {
            if (change.field !== 'messages' || String(change.value?.metadata?.phone_number_id) !== phoneId) continue;
            for (const status of (Array.isArray(change.value?.statuses) ? change.value.statuses : []).slice(0, 50)) {
                if (typeof status.id !== 'string' || !/^wamid\.[A-Za-z0-9_=+\/-]{1,290}$/.test(status.id)) continue;
                if (!['sent', 'delivered', 'read', 'failed'].includes(status.status)) continue;
                result.push({ id: status.id, status: status.status === 'sent' ? 'accepted' : status.status });
            }
        }
    }
    return result;
}

async function graph(path, config, options = {}, fetchImpl = fetch) {
    const response = await fetchImpl(`https://graph.facebook.com/${config.version}/${path}`, {
        ...options, headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(12000)
    });
    let body;
    try { body = await response.json(); } catch { body = {}; }
    return { ok: response.ok, status: response.status, body };
}

async function reconcileReceipts(pool) {
    await pool.query(`
        UPDATE public.whatsapp_alerts a SET status = r.status, updated_at = now()
        FROM public.whatsapp_alert_receipts r
        WHERE a.meta_message_id = r.message_id AND a.status <> 'read'
          AND (a.status <> 'delivered' OR r.status = 'read')
          AND a.status IS DISTINCT FROM r.status;
    `);
}

async function reserveAlert(pool, config) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const ready = await client.query(`SELECT EXISTS(SELECT 1 FROM public.whatsapp_alerts
            WHERE test_key=$1 AND status IN ('delivered','read')) AS confirmed`, [config.testKey]);
        const allowLeads = config.mode === 'auto' && ready.rows[0]?.confirmed === true;
        const selected = await client.query(`
            SELECT id, lead_id, test_key FROM public.whatsapp_alerts
            WHERE status = 'pending' AND available_at <= now()
              AND (test_key = $1 OR ($2 AND test_key IS NULL AND lead_id IS NOT NULL
                AND EXISTS(SELECT 1 FROM public.leads l WHERE l.id=whatsapp_alerts.lead_id AND l.excluido_em IS NULL)))
            ORDER BY (test_key IS NOT NULL) DESC, id LIMIT 1 FOR UPDATE SKIP LOCKED
        `, [config.testKey, allowLeads]);
        if (!selected.rows.length) { await client.query('COMMIT'); return null; }
        const { rows: months } = await client.query(`
            SELECT date_trunc('month',now() AT TIME ZONE 'America/Sao_Paulo')::date::text AS month
        `);
        const month = months[0].month;
        await client.query('INSERT INTO public.whatsapp_alert_usage(month) VALUES($1) ON CONFLICT DO NOTHING', [month]);
        const usage = await client.query('SELECT potential_deliveries FROM public.whatsapp_alert_usage WHERE month=$1 FOR UPDATE', [month]);
        if (usage.rows[0].potential_deliveries >= config.cap) { await client.query('ROLLBACK'); return null; }
        await client.query('UPDATE public.whatsapp_alert_usage SET potential_deliveries=potential_deliveries+1 WHERE month=$1', [month]);
        const alert = selected.rows[0];
        await client.query(`UPDATE public.whatsapp_alerts SET status='reserved',reserved_at=now(),budget_month=$2,
            budget_counted=true,updated_at=now() WHERE id=$1`, [alert.id, month]);
        await client.query('COMMIT');
        return alert;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
}

async function rejectAlert(pool, id, code, retry) {
    // Uma resposta explícita de erro da Meta não pode gerar cobrança. Timeouts permanecem reservados.
    await pool.query(`WITH rejected AS (
        UPDATE public.whatsapp_alerts SET status=$2,error_code=$3,budget_counted=false,
            available_at=now()+interval '15 minutes',updated_at=now()
        WHERE id=$1 AND status='reserved' AND budget_counted RETURNING budget_month
    ) UPDATE public.whatsapp_alert_usage SET potential_deliveries=greatest(0,potential_deliveries-1)
      WHERE month IN (SELECT budget_month FROM rejected)`, [id, retry ? 'pending' : 'failed', code]);
}

function createWorker(pool, getConfig = readConfig, fetchImpl = fetch) {
    let running = false;
    let rerun = false;
    let templateCheckedAt = 0;
    let templateReady = false;
    return async function run() {
        const config = getConfig();
        if (!config.enabled) return;
        if (running) { rerun = true; return; }
        running = true;
        try {
            await pool.query(`UPDATE public.whatsapp_alerts SET status='uncertain',error_code='interrupted_request',updated_at=now()
                WHERE status='reserved' AND reserved_at < now()-interval '5 minutes'`);
            await reconcileReceipts(pool);
            await pool.query('INSERT INTO public.whatsapp_alerts(test_key) VALUES($1) ON CONFLICT(test_key) DO NOTHING', [config.testKey]);
            if (Date.now() - templateCheckedAt > 60000) {
                templateReady = false;
                templateCheckedAt = Date.now();
                const result = await graph(`${config.accountId}/message_templates?fields=id,name,status,category,language&name=${encodeURIComponent(config.template)}`, config, {}, fetchImpl);
                templateReady = result.ok && Array.isArray(result.body.data) && result.body.data.some(t =>
                    t.name === config.template && t.language === 'pt_BR' && t.status === 'APPROVED' && t.category === 'UTILITY');
            }
            if (!templateReady) return;
            for (let i = 0; i < 5; i++) {
                const alert = await reserveAlert(pool, config);
                if (!alert) break;
                try {
                    const result = await graph(`${config.phoneId}/messages`, config,
                        { method: 'POST', body: JSON.stringify(payloadFor(alert, config)) }, fetchImpl);
                    const messageId = result.body?.messages?.[0]?.id;
                    if (result.ok && typeof messageId === 'string' && messageId.startsWith('wamid.') && messageId.length <= 300) {
                        await pool.query(`UPDATE public.whatsapp_alerts SET status='accepted',meta_message_id=$2,updated_at=now()
                            WHERE id=$1 AND status='reserved'`, [alert.id, messageId]);
                        await reconcileReceipts(pool);
                        console.log('WhatsApp: aviso aceito pela Meta; aguardando confirmação de entrega.');
                    } else if (!result.ok && result.status >= 400 && result.status < 500 && Number.isSafeInteger(result.body?.error?.code)) {
                        const code = result.body.error.code;
                        await rejectAlert(pool, alert.id, `meta_${code}`, [130429,131000,131016,131031,131037,131042,132001].includes(code));
                    } else {
                        await pool.query("UPDATE public.whatsapp_alerts SET status='uncertain',error_code='ambiguous_response',updated_at=now() WHERE id=$1 AND status='reserved'", [alert.id]);
                    }
                } catch {
                    await pool.query("UPDATE public.whatsapp_alerts SET status='uncertain',error_code='network_or_storage_error',updated_at=now() WHERE id=$1 AND status='reserved'", [alert.id]);
                }
            }
        } catch { console.error('WhatsApp: não foi possível processar a fila; ela permanece guardada.'); }
        finally { running = false; if(rerun) { rerun=false;setImmediate(run); } }
    };
}

function registerWhatsappNotifications(app, pool) {
    const run = createWorker(pool);
    const unsubscribe = onNewLead(run);
    app.get('/api/whatsapp/webhook', (req, res) => {
        const c = readConfig();
        const provided = String(req.query['hub.verify_token'] || '');
        const a = Buffer.from(provided), b = Buffer.from(c.verifyToken);
        if (!b.length) return res.sendStatus(503);
        if (req.query['hub.mode'] !== 'subscribe' || a.length !== b.length || !crypto.timingSafeEqual(a,b)) return res.sendStatus(403);
        const challenge = req.query['hub.challenge'];
        if (typeof challenge !== 'string' || challenge.length > 256) return res.sendStatus(400);
        return res.type('text/plain').send(challenge);
    });
    app.post('/api/whatsapp/webhook', async (req, res) => {
        const c = readConfig();
        if (!c.appSecret || !c.verifyToken) return res.sendStatus(503);
        if (!verifyMetaSignature(req.rawBody,req.get('x-hub-signature-256'),c.appSecret)) return res.sendStatus(401);
        try {
            for (const receipt of deliveryReceipts(req.body,c.phoneId)) {
                await pool.query(`INSERT INTO public.whatsapp_alert_receipts(message_id,status) VALUES($1,$2)
                    ON CONFLICT(message_id) DO UPDATE SET status=CASE
                    WHEN whatsapp_alert_receipts.status='read' THEN 'read'
                    WHEN whatsapp_alert_receipts.status='delivered' AND EXCLUDED.status<>'read' THEN 'delivered'
                    ELSE EXCLUDED.status END,received_at=now()`, [receipt.id,receipt.status]);
            }
            await reconcileReceipts(pool);
            res.sendStatus(200);
            setImmediate(run);
        } catch { res.sendStatus(503); }
    });
    const timer = setInterval(run,15000);
    timer.unref();
    setImmediate(run);
    return { stop: () => { clearInterval(timer); unsubscribe(); }, run };
}

module.exports = { readConfig, brazilDate, payloadFor, deliveryReceipts, graph, reserveAlert, rejectAlert, reconcileReceipts, createWorker, registerWhatsappNotifications };
