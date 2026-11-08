'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { readConfig,brazilDate,payloadFor,deliveryReceipts,graph,createWorker,registerWhatsappNotifications } = require('../src/whatsapp-notifications');

// Todos os valores abaixo são fixtures locais sem validade na Meta.
const fixture = {
    WHATSAPP_NOTIFICATIONS_MODE:'auto', WHATSAPP_MAX_MESSAGES_PER_MONTH:'100',
    WHATSAPP_RATE_VALID_UNTIL:'2026-12-31', META_GRAPH_API_VERSION:'v25.0',
    WHATSAPP_ACCESS_TOKEN:'unit-test-not-a-credential', WHATSAPP_PHONE_NUMBER_ID:'123',
    WHATSAPP_ACCOUNT_ID:'456', WHATSAPP_RECIPIENT:'5534996440163',
    WHATSAPP_TEMPLATE_NAME:'dde_novo_lead_v1', WHATSAPP_SETUP_TEST_ID:'unit-test',
    WHATSAPP_WEBHOOK_VERIFY_TOKEN:'local-test-verification', META_APP_SECRET:'local-test-secret'
};
const config = changes => readConfig({...fixture,...changes},new Date('2026-11-07T18:00:00Z'));

test('envio exige configuração completa e modo explícito',()=>{
    assert.equal(readConfig({},new Date('2026-11-07')).enabled,false);
    assert.equal(config().enabled,true);
    for(const key of ['WHATSAPP_ACCESS_TOKEN','WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_ACCOUNT_ID',
        'WHATSAPP_WEBHOOK_VERIFY_TOKEN','META_APP_SECRET','WHATSAPP_SETUP_TEST_ID']) {
        assert.equal(config({[key]:''}).enabled,false,key);
    }
    for(const mode of ['off','LIVE','qualquer']) assert.equal(config({WHATSAPP_NOTIFICATIONS_MODE:mode}).enabled,false);
});
test('destino e capacidade não podem exceder a autorização',()=>{
    assert.equal(config({WHATSAPP_RECIPIENT:'5534999999999'}).enabled,false);
    for(const cap of ['0','101','1.5','abc','-1']) assert.equal(config({WHATSAPP_MAX_MESSAGES_PER_MONTH:cap}).enabled,false);
    assert.equal(config({WHATSAPP_MAX_MESSAGES_PER_MONTH:'1'}).enabled,true);
});

test('dois destinos autorizados são separados, sem duplicação nem inclusão de terceiros',()=>{
    const both=config({WHATSAPP_RECIPIENTS:'5534996440163,5534996557353,5534996440163'});
    assert.equal(both.enabled,true);
    assert.deepEqual(both.recipients,['5534996440163','5534996557353']);
    assert.equal(both.testKeys['5534996440163'],config().testKey);
    assert.notEqual(both.testKeys['5534996440163'],both.testKeys['5534996557353']);
    assert.equal(config({WHATSAPP_RECIPIENTS:'5534996440163,5534999999999'}).enabled,false);
    const second=payloadFor({lead_id:21,recipient:'5534996557353'},both);
    assert.equal(second.to,'5534996557353');
    assert.throws(()=>payloadFor({lead_id:21,recipient:'5534999999999'},both),/invalid_recipient/);
    assert.throws(()=>payloadFor({lead_id:21,recipient:'5534996557353'},config()),/invalid_recipient/);
});
test('tarifa expira no horário de Brasília e datas inválidas bloqueiam envio',()=>{
    assert.equal(brazilDate(new Date('2027-01-01T02:59:59Z')),'2026-12-31');
    assert.equal(readConfig(fixture,new Date('2027-01-01T02:59:59Z')).enabled,true);
    assert.equal(readConfig(fixture,new Date('2027-01-01T03:00:00Z')).enabled,false);
    for(const value of ['2026-02-31','2027-03-01','invalid']) assert.equal(config({WHATSAPP_RATE_VALID_UNTIL:value}).enabled,false);
});
test('troca de remetente ou modelo exige nova prova; rotação da chave preserva a prova',()=>{
    const base=config();
    for(const change of [{WHATSAPP_PHONE_NUMBER_ID:'789'},{WHATSAPP_ACCOUNT_ID:'789'},
        {WHATSAPP_TEMPLATE_NAME:'outro_modelo'},{WHATSAPP_SETUP_TEST_ID:'outro-teste'}]) {
        assert.notEqual(config(change).testKey,base.testKey);
    }
    assert.equal(config({WHATSAPP_ACCESS_TOKEN:'outro-token-local-sem-validade'}).testKey,base.testKey);
});
test('mensagem transmite somente número do lead; teste é identificado e não cria cadastro',()=>{
    const payload=payloadFor({lead_id:15,nome:'NAO_ENVIAR',telefone:'NAO_ENVIAR',email:'NAO_ENVIAR'},config());
    assert.equal(payload.to,'5534996440163');
    assert.equal(payload.template.components[0].parameters[0].text,'15');
    assert.ok(!JSON.stringify(payload).includes('NAO_ENVIAR'));
    assert.match(payloadFor({test_key:'test'},config()).template.components[0].parameters[0].text,/TESTE DE ENTREGA/);
    assert.throws(()=>payloadFor({lead_id:0},config()),/invalid_lead_id/);
});
test('confirmações ignoram outro remetente, mensagens recebidas e formatos inválidos',()=>{
    const body={object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{
        metadata:{phone_number_id:'123'},messages:[{text:{body:'DADO_NAO_AUTORIZADO'}}],
        statuses:[{id:'wamid.TEST123',status:'sent',recipient_id:'NAO_GUARDAR'},
            {id:'wamid.TEST123',status:'delivered'},{id:'invalid',status:'read'},
            {id:'wamid.TEST123',status:'unknown'}]
    }}]}]};
    assert.deepEqual(deliveryReceipts(body,'123'),[{id:'wamid.TEST123',status:'accepted'},{id:'wamid.TEST123',status:'delivered'}]);
    assert.deepEqual(deliveryReceipts(body,'999'),[]);
    assert.deepEqual(deliveryReceipts({...body,object:'page'},'123'),[]);
    assert.deepEqual(deliveryReceipts(null,'123'),[]);
});
test('credencial vai no cabeçalho e nunca no endereço da API',async()=>{
    let captured;
    const result=await graph('123/messages',config(),{method:'POST',body:'{}'},async(url,options)=>{
        captured={url,options};return{ok:true,status:200,json:async()=>({messages:[{id:'wamid.TEST'}]})};
    });
    assert.equal(result.ok,true);
    assert.ok(!captured.url.includes(fixture.WHATSAPP_ACCESS_TOKEN));
    assert.equal(captured.options.headers.Authorization,`Bearer ${fixture.WHATSAPP_ACCESS_TOKEN}`);
    assert.ok(captured.options.signal instanceof AbortSignal);
});
test('modo desligado não acessa banco nem API',async()=>{
    let calls=0;
    const worker=createWorker({query:async()=>{calls++;}},()=>({...config(),enabled:false}),async()=>{calls++;});
    await worker();assert.equal(calls,0);
});
for(const template of [
    {status:'PENDING',category:'UTILITY',language:'pt_BR'},
    {status:'APPROVED',category:'MARKETING',language:'pt_BR'},
    {status:'APPROVED',category:'UTILITY',language:'en_US'}
]) test(`não envia modelo ${template.status}/${template.category}/${template.language}`,async()=>{
    let sendCalls=0,connectCalls=0;
    const pool={query:async()=>({rows:[]}),connect:async()=>{connectCalls++;throw Error('não deve reservar');}};
    const worker=createWorker(pool,config,async(url,options)=>{
        if(options.method==='POST') sendCalls++;
        return{ok:true,status:200,json:async()=>({data:[{...template,name:fixture.WHATSAPP_TEMPLATE_NAME}]})};
    });
    await worker();assert.equal(sendCalls,0);assert.equal(connectCalls,0);
});
test('webhook inválido não toca no banco e verificação exige o segredo correto',async()=>{
    const old={...process.env};Object.assign(process.env,fixture,{WHATSAPP_NOTIFICATIONS_MODE:'off'});
    const routes={};let dbCalls=0;
    const app={get:(path,handler)=>{routes.get=handler;},post:(path,handler)=>{routes.post=handler;}};
    const service=registerWhatsappNotifications(app,{query:async()=>{dbCalls++;return{rows:[]};}});service.stop();
    const response=()=>({code:200,value:null,sendStatus(n){this.code=n;return this;},type(){return this;},send(v){this.value=v;return this;}});
    try {
        const rejected=response();routes.get({query:{'hub.mode':'subscribe','hub.verify_token':'wrong','hub.challenge':'x'}},rejected);
        assert.equal(rejected.code,403);
        const accepted=response();routes.get({query:{'hub.mode':'subscribe','hub.verify_token':fixture.WHATSAPP_WEBHOOK_VERIFY_TOKEN,'hub.challenge':'12345'}},accepted);
        assert.equal(accepted.value,'12345');
        const invalid=response();await routes.post({rawBody:Buffer.from('{}'),get:()=> 'sha256=invalid',body:{}},invalid);
        assert.equal(invalid.code,401);assert.equal(dbCalls,0);
        const body=Buffer.from('{"object":"whatsapp_business_account","entry":[]}');
        const signature='sha256='+crypto.createHmac('sha256',fixture.META_APP_SECRET).update(body).digest('hex');
        const valid=response();await routes.post({rawBody:body,get:()=>signature,body:JSON.parse(body)},valid);
        assert.equal(valid.code,200);
    } finally {
        for(const key of Object.keys(process.env)) if(!(key in old)) delete process.env[key];
        Object.assign(process.env,old);
    }
});
