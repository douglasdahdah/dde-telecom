'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),vm=require('node:vm'),fs=require('node:fs');
const {readEmailConfig,signedEmailPayload,createEmailWorker}=require('../src/email-notifications');
const {onNewLead,notifyNewLead}=require('../src/lead-events');
const env={EMAIL_NOTIFICATIONS_MODE:'auto',EMAIL_RELAY_URL:'https://script.google.com/macros/s/'+'x'.repeat(40)+'/exec',EMAIL_RELAY_SECRET:'a'.repeat(64),EMAIL_RECIPIENT:'ddetelecom@gmail.com',EMAIL_SETUP_TEST_ID:'email-test-20261108'};
const config=readEmailConfig(env),now=Date.now();
const lead={id:1,lead_id:20,origem:'meta_lead_ads',criado_em:new Date(now).toISOString(),nome:'Não transmitir',telefone:'Não transmitir',email:'Não transmitir'};
function relay() {
 const state=new Map();let sends=0,quota=100,fail=false;
 const context={console:{log(){}},Date,JSON,Math,Number,PropertiesService:{getScriptProperties:()=>({getProperty:k=>state.get(k),setProperty:(k,v)=>state.set(k,v)})},
  LockService:{getScriptLock:()=>({tryLock:()=>true,hasLock:()=>true,releaseLock(){}})},
  Utilities:{Charset:{UTF_8:'utf8'},computeHmacSha256Signature:(value,key)=>[...crypto.createHmac('sha256',key).update(value).digest()],getUuid:()=>crypto.randomUUID(),formatDate:()=> '08/11/2026 20:00:00'},
  ContentService:{MimeType:{JSON:'application/json'},createTextOutput:value=>({setMimeType:()=>JSON.parse(value)})},
  MailApp:{getRemainingDailyQuota:()=>quota,sendEmail:message=>{sends++;assert.equal(message.to,'ddetelecom@gmail.com');assert.doesNotMatch(message.htmlBody,/Não transmitir/);if(fail)throw new Error('uncertain');}}
 };
 vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../scripts/google-email-relay.gs'),'utf8'),context);
 state.set('DDE_ALERT_SECRET',config.secret);
 return {context,state,call:envelope=>context.doPost({postData:{contents:JSON.stringify(envelope)}}),get sends(){return sends;},quota:n=>quota=n,fail:()=>fail=true};
}
test('e-mail exige destino fixo, endereço Google e assinatura privada, com modo desligado por padrão',()=>{
 assert.equal(readEmailConfig({}).enabled,false);assert.equal(config.enabled,true);
 for(const change of [{EMAIL_RECIPIENT:'outro@example.com'},{EMAIL_RELAY_URL:'https://example.com/exec'},{EMAIL_RELAY_SECRET:''},{EMAIL_SETUP_TEST_ID:''}])assert.equal(readEmailConfig({...env,...change}).enabled,false);
 const payload=signedEmailPayload(lead,config,now),data=JSON.parse(payload.payload);
 assert.deepEqual(Object.keys(data).sort(),['createdAt','key','leadId','origin','timestamp','version']);
 assert.equal(data.key,'lead:20');assert.equal(payload.signature,crypto.createHmac('sha256',config.secret).update(payload.payload).digest('hex'));
 assert.doesNotMatch(JSON.stringify(payload),/Não transmitir/);
});
test('retransmissor recusa assinatura inválida e pedido expirado, sem enviar mensagens',()=>{
 const app=relay(),valid=signedEmailPayload(lead,config,now);
 assert.equal(app.call({...valid,signature:'0'.repeat(64)}).code,'unauthorized');
 assert.equal(app.call(signedEmailPayload(lead,config,now-600000)).code,'invalid_request');
 assert.equal(app.sends,0);
});
test('retransmissor deduplica lead e teste, mantém destinatário fixo e preserva cota diária',()=>{
 const app=relay(),envelope=signedEmailPayload(lead,config,now);
 const first=app.call(envelope),again=app.call(envelope);
 assert.equal(first.ok,true);assert.equal(again.ok,true);assert.equal(again.duplicate,true);assert.equal(first.receipt,again.receipt);assert.equal(app.sends,1);
 const probe=signedEmailPayload({test_key:config.testKey},config,now);
 assert.equal(app.call(probe).ok,true);assert.equal(app.sends,2);
 app.quota(0);const limited=app.call(signedEmailPayload({...lead,lead_id:21},config,now));
 assert.equal(limited.code,'daily_quota');assert.equal(limited.retry,true);assert.equal(app.sends,2);
});
test('resultado incerto de envio não é repetido automaticamente pelo retransmissor',()=>{
 const app=relay();app.fail();const envelope=signedEmailPayload(lead,config,now);
 assert.equal(app.call(envelope).code,'delivery_uncertain');assert.equal(app.call(envelope).code,'delivery_uncertain');assert.equal(app.sends,1);
});
test('novo lead dispara o processamento sem aguardar o intervalo; remover assinatura interrompe os disparos',async()=>{
 let events=0;const off=onNewLead(()=>{events++;});notifyNewLead();
 await new Promise(resolve=>setImmediate(resolve));assert.equal(events,1);off();notifyNewLead();
 await new Promise(resolve=>setImmediate(resolve));assert.equal(events,1);
});
test('fila recupera resposta perdida pela mesma chave e confirma envio somente com recibo válido',async()=>{
 const app=relay();let chosen=false,confirmed=0,retries=0;
 const pool={query:async(sql,values)=>{
  if(sql.startsWith('WITH selected')){if(chosen)return {rows:[]};chosen=true;return {rows:[lead]};}
  if(sql.includes("status='sent'")){confirmed++;assert.match(values[1],/^dde-email-/);}
  if(sql.includes('retry_with_deduplication'))retries++;
  return {rows:[]};
 }};
 const worker=createEmailWorker(pool,()=>config,async(url,options)=>{
  const result=app.call(JSON.parse(options.body));
  if(app.sends===1 && !result.duplicate)throw new Error('resposta perdida após envio');
  return {ok:true,json:async()=>result};
 });
 await worker();assert.equal(app.sends,1);assert.equal(retries,1);assert.equal(confirmed,0);
 chosen=false;await worker();assert.equal(app.sends,1);assert.equal(confirmed,1);
});
test('modo desligado não consulta banco nem envia; erro de autorização não é registrado como sucesso',async()=>{
 await createEmailWorker({query:()=>{throw new Error('não acessar');}},()=>({enabled:false}),()=>{throw new Error('não enviar');})();
 let chosen=false,state;
 const worker=createEmailWorker({query:async(sql,values)=>{
  if(sql.startsWith('WITH selected')){if(chosen)return {rows:[]};chosen=true;return {rows:[lead]};}
  if(sql.includes('status=$2'))state=values;
  return {rows:[]};
 }},()=>config,async()=>({ok:true,json:async()=>({ok:false,code:'unauthorized'})}));
 await worker();assert.deepEqual(state,[1,'uncertain','unauthorized']);
});
