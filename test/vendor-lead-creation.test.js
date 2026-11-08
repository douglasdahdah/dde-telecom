'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {registerVendorLeadCreation}=require('../src/vendor-lead-creation');
const {onNewLead}=require('../src/lead-events');
async function setup(t,{active=true}={}) {
 const calls=[],app=express();app.use(express.json());
 const pool={query:async(sql,values)=>{calls.push({sql,values});return sql.startsWith('SELECT')?{rows:active?[{id:8,nome:'Indicadora de teste'}]:[]}:{rows:[{id:30,status:'novo',vendedor_id:8,vendedor:'Indicadora de teste',origem:'vendedor'}]};}};
 registerVendorLeadCreation(app,pool,{
  autenticar:(req,res,next)=>{if(!req.get('Authorization'))return res.sendStatus(401);req.usuario={id:8,perfil:req.get('Authorization')};next();},
  normalizarLead:body=>({nome:body.nome||'',telefone:body.telefone||'',interesse:body.interesse||'',cidade:body.cidade||'',metadadosMarketing:{utm_source:'indicacao'}}),
  validarLead:lead=>lead.nome&&lead.telefone&&lead.interesse?null:'Nome, telefone e plano são obrigatórios.'
 });
 app.use((error,req,res,next)=>res.sendStatus(500));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 return {calls,request:(body,perfil='vendedor')=>fetch(`http://127.0.0.1:${server.address().port}/api/vendedor/leads`,{method:'POST',headers:{'Content-Type':'application/json',...(perfil?{Authorization:perfil}:{})},body:JSON.stringify(body)})};
}
test('somente vendedor/indicador ativo cadastra pelo próprio acesso',async t=>{
 const f=await setup(t);
 assert.equal((await f.request({},null)).status,401);assert.equal((await f.request({},'admin')).status,403);assert.equal(f.calls.length,0);
 const inactive=await setup(t,{active:false});assert.equal((await inactive.request({nome:'TESTE'})).status,403);assert.equal(inactive.calls.length,1);
});
test('indicação entra como Novo e usa identidade autenticada mesmo com tentativa de forjar dono, origem e status',async t=>{
 const f=await setup(t);let kicks=0;const off=onNewLead(()=>{kicks++;});t.after(off);
 const response=await f.request({nome:'TESTE LOCAL',telefone:'16505550198',interesse:'Atendimento geral',cidade:'Uberaba',vendedor_id:99,vendedor:'Falso',status:'convertido',origem:'meta_lead_ads',metadados_marketing:{indicador_id:99}});
 assert.equal(response.status,201);assert.match(response.headers.get('cache-control'),/no-store/);
 const data=await response.json();assert.equal(data.lead.status,'novo');assert.equal(data.vendedor.id,8);
 const insert=f.calls[1];assert.match(insert.sql,/'vendedor','novo'/);assert.equal(insert.values[11],'Indicadora de teste');assert.equal(insert.values[12],8);
 const metadata=JSON.parse(insert.values[13]);assert.equal(metadata.indicador_id,8);assert.equal(metadata.indicador_nome,'Indicadora de teste');
 await new Promise(r=>setImmediate(r));assert.equal(kicks,1);
});
test('cadastro incompleto não grava lead nem dispara aviso',async t=>{
 const f=await setup(t);assert.equal((await f.request({nome:'TESTE'})).status,400);assert.equal(f.calls.length,1);
});
