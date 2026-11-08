'use strict';

const crypto = require('crypto');

class MetaLeadError extends Error {
    constructor(code, message = 'Falha ao consultar um lead da Meta.') {
        super(message);
        this.name = 'MetaLeadError';
        this.code = code;
    }
}

// Autorizações e falhas temporárias não devem encerrar a recuperação do contato.
const RECOVERABLE_META_ERRORS = [
    'meta_api_190', 'meta_api_102', 'meta_api_10', 'meta_api_200',
    'meta_api_1', 'meta_api_2', 'meta_api_4', 'meta_api_17',
    'meta_api_32', 'meta_api_613', 'meta_network_error',
    'meta_api_error', 'meta_invalid_response'
];
function metaRetryPolicy(code, attempts) {
    const count = Math.max(1, Number(attempts) || 1);
    const recoverable = RECOVERABLE_META_ERRORS.includes(code);
    const authorization = /^meta_api_(190|102|10|200)$/.test(code);
    return {
        terminal: count >= 8 && !recoverable,
        delaySeconds: Math.min(30 * (2 ** Math.min(count - 1, 8)), authorization ? 300 : 1800)
    };
}

function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
    if (!Buffer.isBuffer(rawBody) || typeof appSecret !== 'string' || !appSecret) return false;
    const match = /^sha256=([a-f0-9]{64})$/i.exec(String(signatureHeader || ''));
    if (!match) return false;

    const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest();
    const supplied = Buffer.from(match[1], 'hex');
    return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function idString(value) {
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 120);
    if (Number.isSafeInteger(value) && value > 0) return String(value);
    return null;
}

function parseLeadgenEvents(payload, expectedPageId = '') {
    if (!payload || payload.object !== 'page' || !Array.isArray(payload.entry)) return [];
    const events = [];

    for (const entry of payload.entry) {
        const entryPageId = idString(entry?.id);
        if (expectedPageId && entryPageId !== expectedPageId) continue;
        if (!Array.isArray(entry?.changes)) continue;

        for (const change of entry.changes) {
            if (change?.field !== 'leadgen' || !change.value) continue;
            const value = change.value;
            const leadgenId = idString(value.leadgen_id || value.id);
            const pageId = idString(value.page_id || entryPageId);
            if (!leadgenId || !entryPageId || !pageId || pageId !== entryPageId) continue;
            if (expectedPageId && pageId !== expectedPageId) continue;

            const createdTime = Number(value.created_time);
            events.push({
                leadgenId,
                pageId,
                formId: idString(value.form_id),
                adId: idString(value.ad_id),
                adgroupId: idString(value.adgroup_id),
                createdTime: Number.isSafeInteger(createdTime) && createdTime > 0 ? createdTime : null
            });
        }
    }
    return events;
}

function normalizeFieldName(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function mapMetaLeadFields(fieldData) {
    const fields = new Map();
    if (Array.isArray(fieldData)) {
        for (const field of fieldData) {
            const key = normalizeFieldName(field?.name);
            const values = Array.isArray(field?.values) ? field.values : [];
            const value = values.map(v => String(v || '').trim()).filter(Boolean).join(' ').trim();
            if (key && value && !fields.has(key)) fields.set(key, value);
        }
    }

    const find = (exactKeys, labelWords = []) => {
        for (const key of exactKeys) if (fields.has(key)) return fields.get(key);
        for (const [key, value] of fields) {
            if (labelWords.some(word => key.includes(word))) return value;
        }
        return '';
    };

    const firstName = find(['first_name', 'nome'], ['primeiro_nome']);
    const lastName = find(['last_name', 'sobrenome'], ['ultimo_nome']);
    const fullName = find(['full_name', 'name', 'nome_completo', 'nome_e_sobrenome'], ['nome_completo']);
    const phone = find(
        ['phone_number', 'phone', 'telefone', 'whatsapp', 'mobile_phone'],
        ['telefone', 'whatsapp', 'phone']
    );
    const email = find(['email', 'e_mail', 'work_email'], ['email']);
    const interest = find(
        ['interest', 'interesse', 'product', 'produto', 'plan', 'plano'],
        ['interesse', 'produto', 'plano']
    );
    const city = find(['city', 'cidade', 'localidade', 'municipio'], ['cidade', 'localidade', 'municipio']);
    const neighborhood = find(['bairro', 'neighborhood', 'district'], ['bairro', 'neighborhood']);
    const postalCode = find(['cep', 'zip', 'zip_code', 'postal_code'], ['cep', 'postal_code']);
    const state = find(['state', 'estado', 'uf']).toUpperCase();

    return {
        nome: (fullName || [firstName, lastName].filter(Boolean).join(' ') || 'Contato Meta').slice(0, 150),
        telefone: phone.slice(0, 20),
        email: email.toLowerCase().slice(0, 150),
        interesse: interest.slice(0, 100),
        cidade: city.slice(0, 100),
        bairro: neighborhood.slice(0, 100),
        cep: postalCode.slice(0, 9),
        estado: /^[A-Z]{2}$/.test(state) ? state : ''
    };
}

function validateGraphApiVersion(version) {
    return typeof version === 'string' && /^v\d+\.\d+$/.test(version.trim());
}

async function fetchMetaLead(leadgenId, { accessToken, graphApiVersion }) {
    if (!validateGraphApiVersion(graphApiVersion)) throw new MetaLeadError('invalid_graph_version');
    if (!accessToken) throw new MetaLeadError('missing_page_token');

    const url = new URL(`https://graph.facebook.com/${graphApiVersion}/${encodeURIComponent(leadgenId)}`);
    url.searchParams.set('fields', 'id,created_time,ad_id,form_id,field_data');

    let response;
    try {
        response = await fetch(url, {
            method: 'GET',
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: AbortSignal.timeout(10000)
        });
    } catch {
        throw new MetaLeadError('meta_network_error');
    }

    let body;
    try { body = await response.json(); }
    catch { throw new MetaLeadError('meta_invalid_response'); }
    if (!response.ok || body?.error) {
        const apiCode = body?.error?.code;
        throw new MetaLeadError(apiCode ? `meta_api_${apiCode}` : 'meta_api_error');
    }
    return body;
}

module.exports = {
    MetaLeadError,
    RECOVERABLE_META_ERRORS,
    metaRetryPolicy,
    fetchMetaLead,
    mapMetaLeadFields,
    parseLeadgenEvents,
    validateGraphApiVersion,
    verifyMetaSignature
};
