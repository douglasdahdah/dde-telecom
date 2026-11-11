'use strict';
const crypto = require('node:crypto');

async function registerLead(transaction, { scope, data, key, sellerId }, insert) {
    if (key && !/^[a-zA-Z0-9_-]{16,100}$/.test(key)) {
        throw Object.assign(new Error('Chave de solicitação inválida.'), { status: 400 });
    }
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ scope, data })).digest('hex');
    const requestKey = key ? `${scope}:${key}` : `${scope}:${crypto.randomUUID()}`;
    return transaction(async client => {
        if (key) await client.query('SELECT pg_advisory_xact_lock(12001, hashtext($1))', [requestKey]);
        await client.query('SELECT pg_advisory_xact_lock(12002, hashtext($1))', [fingerprint]);
        const { rows } = await client.query(`SELECT l.*, r.payload_hash, r.chave
            FROM lead_requisicoes r JOIN leads l ON l.id = r.lead_id
            WHERE r.chave = $1 OR (r.payload_hash = $2 AND r.criado_em > NOW() - INTERVAL '5 minutes')
            ORDER BY (r.chave = $1) DESC, r.criado_em DESC LIMIT 1`, [requestKey, fingerprint]);
        const prior = rows[0];
        if (prior && (prior.payload_hash !== fingerprint || prior.excluido_em || (sellerId && prior.vendedor_id !== sellerId))) {
            throw Object.assign(new Error('Solicitação já processada. Consulte o administrador.'), { status: 409 });
        }
        let lead = prior;
        if (!lead) lead = await insert(client);
        if (prior?.chave !== requestKey) {
            await client.query('INSERT INTO lead_requisicoes(chave,payload_hash,lead_id) VALUES ($1,$2,$3)', [requestKey, fingerprint, lead.id]);
        }
        if (prior) {
            const { payload_hash, chave, ...publicLead } = lead;
            lead = publicLead;
        }
        return { lead, duplicate: Boolean(prior) };
    });
}
module.exports = { registerLead };
