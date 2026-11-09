'use strict';

const crypto = require('node:crypto');
const { onNewLead } = require('./lead-events');
const { verifyMetaSignature, validateGraphApiVersion } = require('./meta-leads');
const ALLOWED_RECIPIENTS = new Set(['5534996440163','5534996557353']);
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
    const recipients = [...new Set(String(env.WHATSAPP_RECIPIENTS || env.WHATSAPP_RECIPIENT || '').split(',').map(x=>x.trim()).filter(Boolean))];
    const config = {
        mode, cap, validUntil, version,
        token: env.WHATSAPP_ACCESS_TOKEN || '',
        phoneId: env.WHATSAPP_PHONE_NUMBER_ID || '',
        accountId: env.WHATSAPP_ACCOUNT_ID || '',
        recipient: recipients[0] || '', recipients,
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
        /^\d+$/.test(config.accountId) && recipients.length > 0 && recipients.every(x=>ALLOWED_RECIPIENTS.has(x)) &&
        /^[a-z0-9_]{1,100}$/.test(config.template) &&
        /^[a-zA-Z0-9_-]{1,100}$/.test(config.testKey) &&
        Boolean(config.token && config.verifyToken && config.appSecret);
    // Uma mudança de remetente/modelo/destinatário exige nova prova de entrega.
    const seed = config.testKey;
    config.testKeys = Object.fromEntries(recipients.map(recipient=>[recipient,crypto.createHash('sha256').update(JSON.stringify([
        seed,config.phoneId,config.accountId,recipient,config.template
    ])).digest('hex')]));
    config.testKey = config.testKeys[config.recipient] || '';
    return config;
}

function payloadFor(alert, config) {
    const recipient = alert.recipient || config.recipient;
    if(!config.recipients.includes(recipient)) throw new Error('invalid_recipient');
    const label = alert.test_key ? 'TESTE DE ENTREGA (nenhum lead cadastrado)' : String(alert.lead_id);
    if (!alert.test_key && (!Number.isSafeInteger(Number(alert.lead_id)) || Number(alert.lead_id) < 1)) {
        throw new Error('invalid_lead_id');
    }
    return {
        messaging_product: 'whatsapp', to: recipient, type: 'template',
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
                const receipt={ id: status.id, status: status.status === 'sent' ? 'accepted' : status.status };
                if(status.status==='failed' && Number.isSafeInteger(status.errors?.[0]?.code)) receipt.error_code=`meta_${status.errors[0].code}`;
                result.push(receipt);
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
        UPDATE public.whatsapp_alert_deliveries a SET status = r.status,
            error_code=CASE WHEN r.status='failed' THEN r.error_code ELSE NULL END,updated_at = now()
        FROM public.whatsapp_alert_receipts r
        WHERE a.meta_message_id = r.message_id AND a.status <> 'read'
          AND (a.status <> 'delivered' OR r.status = 'read')
          AND (a.status IS DISTINCT FROM r.status OR (r.status='failed' AND a.error_code IS DISTINCT FROM r.error_code));
    `);
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
        const selected = await client.query(`
            WITH configured AS (SELECT * FROM unnest($1::text[],$2::text[]) AS r(recipient,test_key))
            SELECT d.id,a.lead_id,a.test_key,d.recipient FROM public.whatsapp_alert_deliveries d
            JOIN public.whatsapp_alerts a ON a.id=d.alert_id JOIN configured c ON c.recipient=d.recipient
            WHERE d.status='pending' AND d.available_at<=now()
             AND (a.test_key=c.test_key OR ($3 AND a.test_key IS NULL
               AND EXISTS(SELECT 1 FROM public.leads l WHERE l.id=a.lead_id AND l.excluido_em IS NULL)
               AND EXISTS(SELECT 1 FROM public.whatsapp_alert_deliveries proof
                 JOIN public.whatsapp_alerts p ON p.id=proof.alert_id
                 WHERE proof.recipient=d.recipient AND p.test_key=c.test_key
                   AND (proof.status IN ('delivered','read') OR
                     (proof.status='accepted' AND proof.owner_confirmed_at IS NOT NULL)))))
            ORDER BY (a.test_key IS NOT NULL) DESC,d.id LIMIT 1 FOR UPDATE OF d SKIP LOCKED
        `, [config.recipients,config.recipients.map(x=>config.testKeys[x]),config.mode==='auto']);
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
        await client.query(`UPDATE public.whatsapp_alert_deliveries SET status='reserved',reserved_at=now(),budget_month=$2,
            budget_counted=true,updated_at=now() WHERE id=$1`, [alert.id, month]);
        await client.query('COMMIT');
        return alert;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
}

async function rejectAlert(pool, id, code, retry) {
    // Uma resposta explícita de erro da Meta não pode gerar cobrança. Timeouts permanecem reservados.
    await pool.query(`WITH rejected AS (
        UPDATE public.whatsapp_alert_deliveries SET status=$2,error_code=$3,budget_counted=false,
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
            await pool.query(`UPDATE public.whatsapp_alert_deliveries SET status='uncertain',error_code='interrupted_request',updated_at=now()
                WHERE status='reserved' AND reserved_at < now()-interval '5 minutes'`);
            await reconcileReceipts(pool);
            for(const recipient of config.recipients) {
                const key=config.testKeys[recipient];
                await pool.query('INSERT INTO public.whatsapp_alerts(test_key) VALUES($1) ON CONFLICT(test_key) DO NOTHING', [key]);
                await pool.query(`INSERT INTO public.whatsapp_alert_deliveries(alert_id,recipient)
                    SELECT id,$2 FROM public.whatsapp_alerts WHERE test_key=$1 ON CONFLICT(alert_id,recipient) DO NOTHING`,[key,recipient]);
            }
            await pool.query(`INSERT INTO public.whatsapp_alert_deliveries(alert_id,recipient)
                SELECT a.id,r.recipient FROM public.whatsapp_alerts a JOIN public.leads l ON l.id=a.lead_id
                CROSS JOIN unnest($1::text[]) AS r(recipient)
                WHERE a.test_key IS NULL AND l.excluido_em IS NULL
                ON CONFLICT(alert_id,recipient) DO NOTHING`,[config.recipients]);
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
                        await pool.query(`UPDATE public.whatsapp_alert_deliveries SET status='accepted',meta_message_id=$2,updated_at=now()
                            WHERE id=$1 AND status='reserved'`, [alert.id, messageId]);
                        await reconcileReceipts(pool);
                        console.log('WhatsApp: aviso aceito pela Meta; aguardando confirmação de entrega.');
                    } else if (!result.ok && result.status >= 400 && result.status < 500 && Number.isSafeInteger(result.body?.error?.code)) {
                        const code = result.body.error.code;
                        await rejectAlert(pool, alert.id, `meta_${code}`, [130429,131000,131016,131031,131037,131042,132001].includes(code));
                    } else {
                        await pool.query("UPDATE public.whatsapp_alert_deliveries SET status='uncertain',error_code='ambiguous_response',updated_at=now() WHERE id=$1 AND status='reserved'", [alert.id]);
                    }
                } catch {
                    await pool.query("UPDATE public.whatsapp_alert_deliveries SET status='uncertain',error_code='network_or_storage_error',updated_at=now() WHERE id=$1 AND status='reserved'", [alert.id]);
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
                await pool.query(`INSERT INTO public.whatsapp_alert_receipts(message_id,status,error_code) VALUES($1,$2,$3)
                    ON CONFLICT(message_id) DO UPDATE SET status=CASE
                    WHEN whatsapp_alert_receipts.status='read' THEN 'read'
                    WHEN whatsapp_alert_receipts.status='delivered' AND EXCLUDED.status<>'read' THEN 'delivered'
                    ELSE EXCLUDED.status END,error_code=CASE WHEN EXCLUDED.status='failed' THEN EXCLUDED.error_code ELSE NULL END,received_at=now()`, [receipt.id,receipt.status,receipt.error_code||null]);
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
