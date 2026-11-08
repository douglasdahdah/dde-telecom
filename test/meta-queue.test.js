'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {registerMetaIntegration}=require('../src/meta-integration');

test('reinício recupera falha antiga, mantém autorização pendente e importa uma única vez na verificação periódica',async t=>{
    const previous={};
    const config={META_PAGE_ID:'page-local',META_PAGE_ACCESS_TOKEN:'token-apenas-de-teste',META_GRAPH_API_VERSION:'v27.0'};
    for(const [key,value] of Object.entries(config)){previous[key]=process.env[key];process.env[key]=value;}
    t.after(()=>{for(const key of Object.keys(config)){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}});
    let poll,intervalMs,leadFetches=0,insertions=0,insertedValues;
    t.mock.method(global,'setInterval',(fn,ms)=>{poll=fn;intervalMs=ms;return{unref(){}};});
    t.mock.method(global,'setTimeout',()=>({unref(){}}));
    t.mock.method(global,'fetch',async url=>{
        if(String(url).endsWith('/subscribed_apps'))return new Response('{"success":true}');
        leadFetches++;
        if(leadFetches===1)return new Response('{"error":{"code":190}}',{status:400});
        return new Response(JSON.stringify({id:'lead-local',field_data:[
            {name:'FULL_NAME',values:['TESTE LOCAL']},{name:'PHONE',values:['00000000000']},
            {name:'Qual plano de interesse?',values:['Plano de teste']},
            {name:'Cidade',values:['Cidade de teste']},{name:'Bairro',values:['Bairro de teste']}
        ]}));
    });
    const event={meta_lead_id:'lead-local',page_id:'page-local',status:'failed',attempts:8,last_error_code:'meta_api_190'};
    const pool={query:async(sql,values)=>{
        if(sql.includes('ANY($2::text[])')){
            assert.equal(values[0],'page-local');assert.ok(values[1].includes('meta_api_190'));
            event.status='pending';return{rows:[]};
        }
        if(sql.includes('WITH selecionados')){
            if(event.status!=='pending')return{rows:[]};
            event.status='processing';event.attempts++;return{rows:[{...event}]};
        }
        if(sql.includes('next_attempt_at = now() +')){
            event.status=values[1];event.last_error_code=values[3];return{rows:[]};
        }
        throw new Error('Consulta inesperada no teste');
    },connect:async()=>({query:async(sql,values)=>{
        if(sql.startsWith('SELECT status'))return{rows:[{status:event.status}]};
        if(sql.includes('SELECT id, nome FROM public.usuarios'))return{rows:[{id:1,nome:'Admin de teste'}]};
        if(sql.includes('INSERT INTO public.leads')){insertions++;insertedValues=values;return{rows:[{id:9001}]};}
        if(sql.includes("SET status = 'processed'")){event.status='processed';return{rows:[]};}
        return{rows:[]};
    },release(){}})};
    const worker=registerMetaIntegration({get(){},post(){}},pool);
    t.after(()=>worker.stop());
    for(let i=0;i<50&&!(event.status==='pending'&&event.attempts===9);i++)await new Promise(resolve=>setImmediate(resolve));
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(event.status,'pending');assert.equal(event.attempts,9);assert.equal(event.last_error_code,'meta_api_190');
    assert.equal(intervalMs,60000);
    await poll();
    assert.equal(event.status,'processed');assert.equal(insertions,1);
    assert.equal(insertedValues[3],'Plano de teste');
    assert.equal(insertedValues[7],'Cidade de teste');assert.equal(insertedValues[8],'Bairro de teste');
    assert.equal(JSON.parse(insertedValues[6]).respostas_formulario.length,5);
    await poll();assert.equal(insertions,1);
});
