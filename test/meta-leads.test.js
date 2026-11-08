'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
    mapMetaLeadFields,
    metaRetryPolicy,
    parseLeadgenEvents,
    validateGraphApiVersion,
    verifyMetaSignature
} = require('../src/meta-leads');

test('valida a assinatura SHA-256 do webhook Meta', () => {
    const body = Buffer.from('{"object":"page"}');
    const secret = 'segredo-de-teste';
    const digest = crypto.createHmac('sha256', secret).update(body).digest('hex');

    assert.equal(verifyMetaSignature(body, `sha256=${digest}`, secret), true);
    assert.equal(verifyMetaSignature(Buffer.from('alterado'), `sha256=${digest}`, secret), false);
    assert.equal(verifyMetaSignature(body, 'sha1=incorreto', secret), false);
});

test('extrai somente notificações leadgen da página configurada', () => {
    const eventos = parseLeadgenEvents({
        object: 'page',
        entry: [
            {
                id: 'page-123',
                changes: [
                    { field: 'leadgen', value: { leadgen_id: 'lead-1', form_id: 'form-1', ad_id: 'ad-1', created_time: 1700000000 } },
                    { field: 'leadgen', value: { leadgen_id: 'lead-3', page_id: 'page-456' } },
                    { field: 'feed', value: { id: 'post-1' } }
                ]
            },
            { id: 'page-456', changes: [{ field: 'leadgen', value: { leadgen_id: 'lead-2' } }] }
        ]
    }, 'page-123');

    assert.deepEqual(eventos, [{
        leadgenId: 'lead-1',
        pageId: 'page-123',
        formId: 'form-1',
        adId: 'ad-1',
        adgroupId: null,
        createdTime: 1700000000
    }]);
});

test('mapeia nome, telefone, e-mail e produto do formulário', () => {
    assert.deepEqual(mapMetaLeadFields([
        { name: 'full_name', values: ['Ana Silva'] },
        { name: 'phone_number', values: ['+55 34 99999-0000'] },
        { name: 'e-mail', values: ['ANA@example.com'] },
        { name: 'Qual plano você deseja?', values: ['Fibra 600 Mega'] }
    ]), {
        nome: 'Ana Silva',
        telefone: '+55 34 99999-0000',
        email: 'ana@example.com',
        interesse: 'Fibra 600 Mega',
        cidade: '', bairro: '', cep: '', estado: ''
    });
});

test('mantém plano e localidade das perguntas personalizadas e nomes em maiúsculas', () => {
    assert.deepEqual(mapMetaLeadFields([
        { name: 'FULL_NAME', values: ['Contato de teste'] },
        { name: 'EMAIL', values: ['TESTE@example.invalid'] },
        { name: 'PHONE', values: ['034000000000'] },
        { name: 'Qual plano você tem interesse?', values: ['700 Mega'] },
        { name: 'Em qual cidade deseja instalar?', values: ['Uberaba'] },
        { name: 'Qual o seu bairro?', values: ['Bairro de teste'] },
        { name: 'CEP do endereço', values: ['00000-001'] },
        { name: 'UF', values: ['mg'] }
    ]), {
        nome: 'Contato de teste', email: 'teste@example.invalid', telefone: '034000000000',
        interesse: '700 Mega', cidade: 'Uberaba', bairro: 'Bairro de teste', cep: '00000-001', estado: 'MG'
    });
});

test('autorização e falha temporária continuam pendentes depois de oito tentativas', () => {
    for (const code of ['meta_api_190', 'meta_api_102', 'meta_api_10', 'meta_api_200', 'meta_network_error', 'meta_api_4']) {
        assert.equal(metaRetryPolicy(code, 8).terminal, false, code);
        assert.equal(metaRetryPolicy(code, 10000).terminal, false, code);
    }
    assert.equal(metaRetryPolicy('meta_api_190', 10000).delaySeconds, 300);
    assert.equal(metaRetryPolicy('meta_network_error', 10000).delaySeconds, 1800);
    assert.equal(metaRetryPolicy('meta_api_100', 8).terminal, true);
});

test('aceita apenas versões explícitas do Graph API', () => {
    assert.equal(validateGraphApiVersion('v24.0'), true);
    assert.equal(validateGraphApiVersion('24.0'), false);
    assert.equal(validateGraphApiVersion('latest'), false);
});
