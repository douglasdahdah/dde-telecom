'use strict';

const {
    fetchMetaLead,
    mapMetaLeadFields,
    metaRetryPolicy,
    RECOVERABLE_META_ERRORS,
    parseLeadgenEvents,
    validateGraphApiVersion,
    verifyMetaSignature
} = require('./meta-leads');

const emailValido = valor => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
let workerRunning = false;
let retryScheduled = false;

function scheduleMetaRetry(pool, delaySeconds) {
    if (retryScheduled) return;
    retryScheduled = true;
    const timer = setTimeout(() => {
        retryScheduled = false;
        processMetaQueue(pool);
    }, Math.max(1000, delaySeconds * 1000));
    timer.unref();
}

function metaConfig() {
    return {
        appSecret: process.env.META_APP_SECRET || '',
        verifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || '',
        pageAccessToken: process.env.META_PAGE_ACCESS_TOKEN || '',
        graphApiVersion: process.env.META_GRAPH_API_VERSION || '',
        pageId: process.env.META_PAGE_ID || ''
    };
}


async function ensureMetaPageSubscription(config) {
    if (!config.pageId || !config.pageAccessToken ||
        !validateGraphApiVersion(config.graphApiVersion)) return false;

    const url = new URL(
        `https://graph.facebook.com/${config.graphApiVersion}/${encodeURIComponent(config.pageId)}/subscribed_apps`
    );
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.pageAccessToken}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({ subscribed_fields: 'leadgen' }),
            signal: AbortSignal.timeout(10000)
        });
        let result = {};
        try { result = await response.json(); } catch {}
        if (!response.ok || result?.success !== true) {
            const apiCode = Number(result?.error?.code);
            const reason = Number.isSafeInteger(apiCode) ? `Meta ${apiCode}` : `HTTP ${response.status}`;
            console.error(`Inscrição de avisos de leads da Página recusada (${reason}).`);
            return false;
        }
        console.log('Avisos de novos leads da Página DDE Telecom estão inscritos.');
        return true;
    } catch {
        console.error('Não foi possível confirmar a inscrição de avisos de leads da Página (meta_network_error).');
        return false;
    }
}

function equalSecret(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && require('crypto').timingSafeEqual(left, right);
}

async function claimMetaImports(pool) {
    const { rows } = await pool.query(`
        WITH selecionados AS (
            SELECT meta_lead_id
            FROM public.meta_lead_imports
            WHERE (status = 'pending' AND next_attempt_at <= now())
               OR (status = 'processing' AND updated_at < now() - interval '5 minutes')
            ORDER BY received_at
            LIMIT 5
            FOR UPDATE SKIP LOCKED
        )
        UPDATE public.meta_lead_imports AS m
        SET status = 'processing', attempts = m.attempts + 1, updated_at = now()
        FROM selecionados AS s
        WHERE m.meta_lead_id = s.meta_lead_id
        RETURNING m.meta_lead_id, m.page_id, m.form_id, m.ad_id,
                  m.adgroup_id, m.meta_created_time, m.attempts
    `);
    return rows;
}

async function markForReview(pool, event, code) {
    await pool.query(`
        UPDATE public.meta_lead_imports
        SET status = 'needs_review', last_error_code = $2, updated_at = now()
        WHERE meta_lead_id = $1 AND status = 'processing'
    `, [event.meta_lead_id, code]);
}

async function processOneMetaImport(pool, event, config) {
    try {
        const metaLead = await fetchMetaLead(event.meta_lead_id, {
            accessToken: config.pageAccessToken,
            graphApiVersion: config.graphApiVersion
        });
        const contact = mapMetaLeadFields(metaLead.field_data);

        if (contact.email && !emailValido(contact.email)) contact.email = '';
        if (!contact.telefone && !contact.email) {
            await markForReview(pool, event, 'missing_contact_fields');
            return;
        }

        const metadata = {
            source: 'meta_lead_ads',
            page_id: event.page_id,
            form_id: event.form_id || metaLead.form_id || null,
            ad_id: event.ad_id || metaLead.ad_id || null,
            adgroup_id: event.adgroup_id || null,
            meta_created_time: event.meta_created_time || null,
            respostas_formulario: Array.isArray(metaLead.field_data)
                ? metaLead.field_data.map(field => ({
                    pergunta: String(field?.name || ''),
                    respostas: Array.isArray(field?.values) ? field.values.map(String) : []
                })) : []
        };

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const current = await client.query(
                'SELECT status FROM public.meta_lead_imports WHERE meta_lead_id = $1 FOR UPDATE',
                [event.meta_lead_id]
            );
            if (!current.rows.length || current.rows[0].status === 'processed') {
                await client.query('COMMIT');
                return;
            }

            const admins = await client.query(`
                SELECT id, nome FROM public.usuarios
                WHERE perfil = 'admin' AND ativo = TRUE
                ORDER BY id LIMIT 1
            `);
            if (!admins.rows.length) {
                const error = new Error('No active administrator for lead assignment.');
                error.code = 'admin_not_available';
                throw error;
            }
            const admin = admins.rows[0];
            const lead = await client.query(`
                INSERT INTO public.leads (
                    nome, telefone, email, interesse, vendedor, vendedor_id,
                    origem, metadados_marketing, cidade, bairro, cep, estado
                ) VALUES ($1, $2, $3, $4, $5, $6, 'meta_lead_ads', $7::jsonb, $8, $9, $10, $11)
                RETURNING id
            `, [
                contact.nome,
                contact.telefone,
                contact.email || null,
                contact.interesse || null,
                admin.nome,
                admin.id,
                JSON.stringify(metadata),
                contact.cidade || null,
                contact.bairro || null,
                contact.cep || null,
                contact.estado || null
            ]);

            await client.query(`
                UPDATE public.meta_lead_imports
                SET status = 'processed', lead_id = $2, processed_at = now(),
                    last_error_code = NULL, updated_at = now()
                WHERE meta_lead_id = $1
            `, [event.meta_lead_id, lead.rows[0].id]);
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        const attempts = Number(event.attempts) || 1;
        const safeCode = /^[a-z0-9_-]{1,80}$/i.test(String(error.code || ''))
            ? String(error.code)
            : 'processing_error';
        const { terminal, delaySeconds } = metaRetryPolicy(safeCode, attempts);
        try {
            await pool.query(`
                UPDATE public.meta_lead_imports
                SET status = $2,
                    next_attempt_at = now() + ($3 * interval '1 second'),
                    last_error_code = $4,
                    updated_at = now()
                WHERE meta_lead_id = $1 AND status = 'processing'
            `, [event.meta_lead_id, terminal ? 'failed' : 'pending', delaySeconds, safeCode]);
        } catch (databaseError) {
            console.error('Não foi possível atualizar o estado de importação da Meta.');
        }
        console.error(`Importação de lead Meta falhou (${safeCode}); tentativa ${attempts}${terminal ? ' encerrada' : ' será repetida'}.`);
        if (!terminal) scheduleMetaRetry(pool, delaySeconds);
    }
}

async function processMetaQueue(pool) {
    if (workerRunning) return;
    const config = metaConfig();
    if (!config.pageAccessToken || !validateGraphApiVersion(config.graphApiVersion)) return;

    workerRunning = true;
    try {
        const events = await claimMetaImports(pool);
        for (const event of events) await processOneMetaImport(pool, event, config);
        if (events.length === 5) setImmediate(() => processMetaQueue(pool));
    } catch (error) {
        const code = /^[a-z0-9_-]{1,80}$/i.test(String(error.code || '')) ? error.code : 'queue_error';
        console.error(`Fila de leads Meta indisponível (${code}).`);
        scheduleMetaRetry(pool, 60);
    } finally {
        workerRunning = false;
    }
}

function registerMetaIntegration(app, pool) {
    app.get('/api/meta/webhook', (req, res) => {
        const config = metaConfig();
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];
        if (!config.verifyToken) return res.status(503).send('Integração Meta ainda não configurada.');
        if (mode !== 'subscribe' || !equalSecret(String(token || ''), config.verifyToken)) {
            return res.sendStatus(403);
        }
        if (typeof challenge !== 'string' || challenge.length > 256) return res.sendStatus(400);
        return res.status(200).type('text/plain').send(challenge);
    });

    app.post('/api/meta/webhook', async (req, res) => {
        const config = metaConfig();
        if (!config.appSecret || !config.verifyToken || !config.pageAccessToken || !config.pageId ||
            !validateGraphApiVersion(config.graphApiVersion)) {
            return res.status(503).json({ erro: 'Integração Meta ainda não configurada.' });
        }
        if (!verifyMetaSignature(req.rawBody, req.get('x-hub-signature-256'), config.appSecret)) {
            return res.sendStatus(401);
        }

        const events = parseLeadgenEvents(req.body, config.pageId);
        if (!events.length) return res.sendStatus(200);

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            for (const event of events) {
                await client.query(`
                    INSERT INTO public.meta_lead_imports (
                        meta_lead_id, page_id, form_id, ad_id, adgroup_id,
                        meta_created_time, status
                    ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
                    ON CONFLICT (meta_lead_id) DO NOTHING
                `, [event.leadgenId, event.pageId, event.formId, event.adId,
                    event.adgroupId, event.createdTime]);
            }
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Webhook Meta recebido, mas não foi possível guardar o evento.');
            return res.status(503).json({ erro: 'Não foi possível registrar o evento da Meta.' });
        } finally {
            client.release();
        }

        res.sendStatus(200);
        setImmediate(() => processMetaQueue(pool));
    });

    // Retoma falhas temporárias de versões anteriores sem alterar leads já importados.
    const start = async () => {
        const config = metaConfig();
        if (!config.pageId || !config.pageAccessToken || !validateGraphApiVersion(config.graphApiVersion)) return;
        try {
            await pool.query(`
                UPDATE public.meta_lead_imports
                SET status = 'pending', next_attempt_at = now(), updated_at = now()
                WHERE status = 'failed' AND lead_id IS NULL AND page_id = $1
                  AND last_error_code = ANY($2::text[])
            `, [config.pageId, RECOVERABLE_META_ERRORS]);
        } catch {
            console.error('Não foi possível retomar importações pendentes da Meta.');
        }
        await processMetaQueue(pool);
    };
    setImmediate(start);
    // O webhook continua disparando a importação imediatamente. A verificação
    // periódica recupera reinícios, interrupções e tentativas que ficaram aguardando.
    const poller = setInterval(() => processMetaQueue(pool), 60000);
    poller.unref();
    setImmediate(() => ensureMetaPageSubscription(metaConfig()));
    return { stop: () => clearInterval(poller) };
}

module.exports = { registerMetaIntegration };
