'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const zlib=require('node:zlib');
const express=require('express');
const {COLUMNS,XLSX_TYPE,reportQuery,sheetData,createLeadReport,registerLeadReports,brasiliaStamp}=require('../src/lead-reports');

// Leitura independente do ZIP/OOXML produzido pelo exportador, sem outra biblioteca de planilhas.
function unzip(buffer) {
    const end=buffer.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));
    assert.ok(end>=0,'diretório ZIP presente');
    let offset=buffer.readUInt32LE(end+16);const files={};
    for(let i=0;i<buffer.readUInt16LE(end+10);i++) {
        assert.equal(buffer.readUInt32LE(offset),0x02014b50);
        const method=buffer.readUInt16LE(offset+10),size=buffer.readUInt32LE(offset+20);
        const nameLength=buffer.readUInt16LE(offset+28),extra=buffer.readUInt16LE(offset+30),comment=buffer.readUInt16LE(offset+32);
        const name=buffer.subarray(offset+46,offset+46+nameLength).toString('utf8');
        const local=buffer.readUInt32LE(offset+42);
        const start=local+30+buffer.readUInt16LE(local+26)+buffer.readUInt16LE(local+28);
        const data=buffer.subarray(start,start+size);
        files[name]=(method===0?data:zlib.inflateRawSync(data)).toString('utf8');
        offset+=46+nameLength+extra+comment;
    }
    return files;
}
const time=new Date('2026-11-08T01:30:00.000Z');
const lead={id:15,nome:'TESTE LOCAL — José & Ana',telefone:'0340996440163',email:'teste@local.invalid',
    cep:'00000-001',logradouro:'Rua de teste',numero:'001',complemento:'Apto 02',bairro:'Bairro de teste',
    cidade:'Uberaba',estado:'MG',interesse:'Plano de teste',status:'atendimento',origem:'meta_lead_ads',
    vendedor:'Vendedora do teste',vendedor_id:3,responsavel_nome:'Vendedora do teste',responsavel_perfil:'vendedor',
    recebido_brasilia:'2026-11-07T22:30:00.000',contato_brasilia:null,
    observacoes:'=HYPERLINK("https://example.invalid","não executar")\nRetornar amanhã.',
    metadados_marketing:{utm_source:'instagram',utm_medium:'cpc',utm_campaign:'campanha de teste',utm_content:'card',utm_term:'fibra',
        page_id:'1392156240656542',form_id:'2339084680171532',ad_id:'120249758210820567',adgroup_id:'120249758210830567',meta_created_time:1794097800,extra:'preservar'}};

test('relatório completo preserva dados, vendedor, zeros, identificadores e texto de fórmulas',async()=>{
    const data=sheetData([lead],{q:'',status:''},time),row=data[5];
    const value=label=>row[COLUMNS.findIndex(c=>c[0]===label)];
    assert.equal(value('Vendedor indicado').value,'Vendedora do teste');
    assert.equal(value('Telefone / WhatsApp').value,'0340996440163');
    assert.equal(value('CEP').value,'00000-001');
    assert.equal(value('ID anúncio Meta').value,'120249758210820567');
    assert.equal(value('ID anúncio Meta').type,String);
    assert.equal(value('Observações').value,lead.observacoes);
    assert.equal(value('Observações').type,String);
    assert.equal(value('Recebido (Brasília)').value.toISOString(),'2026-11-07T22:30:00.000Z');
    assert.equal(value('Último contato (Brasília)').value,null);
    assert.deepEqual(JSON.parse(value('Metadados completos (JSON)').value),lead.metadados_marketing);
    const files=unzip(await createLeadReport([lead],{q:'',status:''},time));
    assert.ok(files['[Content_Types].xml'].includes('spreadsheetml'));
    const xml=files['xl/worksheets/sheet1.xml'];
    assert.match(xml,/xSplit="2"/);assert.match(xml,/ySplit="5"/);
    assert.doesNotMatch(xml,/<f[ >]/);
    const all=Object.values(files).join('\n');
    for(const expected of ['0340996440163','00000-001','120249758210820567','Vendedora do teste','TESTE LOCAL'])assert.ok(all.includes(expected),expected);
    assert.equal((xml.match(/<c\b/g)||[]).length>32,true);
});

test('administrador ou responsável ausente não é apresentado como vendedor indicado',()=>{
    const rows=sheetData([{...lead,responsavel_perfil:'admin'}, {...lead,vendedor:null,vendedor_id:null,responsavel_nome:null,responsavel_perfil:null}],{q:'',status:''},time);
    assert.equal(rows[5][2].value,null);assert.equal(rows[5][3].value,lead.vendedor);
    assert.equal(rows[5][4].value,'Administrador');assert.equal(rows[6][2].value,null);
});

test('exportação vazia mantém cabeçalhos e informa ausência, sem inventar lead',async()=>{
    const data=sheetData([],{q:'',status:''},time);
    assert.equal(data.length,6);assert.equal(data[4].length,32);
    assert.match(data[5][0].value,/Nenhum lead/);
    const files=unzip(await createLeadReport([],{q:'',status:''},time));
    assert.ok(files['xl/worksheets/sheet1.xml']);
});

test('busca literal e status usam parâmetros; entradas inválidas são rejeitadas',()=>{
    const query=reportQuery({q:"  %_'; DROP TABLE leads; -- ",status:'novo'});
    assert.deepEqual(query.values,["%_'; drop table leads; --",'novo']);
    assert.ok(query.text.includes('strpos('));assert.ok(!query.text.includes('DROP TABLE'));
    for(const value of [{q:[]},{q:'a'.repeat(301)},{status:'inexistente'},{status:['novo']}])assert.throws(()=>reportQuery(value),{status:400});
    assert.deepEqual(reportQuery().values,[]);
    assert.match(reportQuery().text,/WHERE l\.excluido_em IS NULL/);
    assert.equal(brasiliaStamp(time),'2026-11-07-223000');
});

test('campos longos falham explicitamente; caracteres inválidos de XML são removidos',()=>{
    assert.throws(()=>sheetData([{...lead,observacoes:'a'.repeat(32768)}],{q:'',status:''},time),{status:422});
    const data=sheetData([{...lead,nome:'José\u0000\u0001\tAna'}],{q:'',status:''},time);
    assert.equal(data[5][1].value,'José\tAna');
});

test('download exige administrador, retorna XLSX privado e não modifica o banco',async(t)=>{
    let queries=0;
    const pool={query:async(sql,values)=>{queries++;assert.ok(sql.startsWith('SELECT '));assert.deepEqual(values,['novo']);return {rows:[lead]};}};
    const app=express();
    registerLeadReports(app,pool,{
        autenticar:(req,res,next)=>{const role=req.get('Authorization');if(!role)return res.sendStatus(401);req.usuario={perfil:role};next();},
        somenteAdmin:(req,res,next)=>req.usuario.perfil==='admin'?next():res.sendStatus(403)
    });
    app.use((error,req,res,next)=>res.status(error.status||500).json({erro:error.message}));
    const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    t.after(()=>new Promise(resolve=>server.close(resolve)));
    const url=`http://127.0.0.1:${server.address().port}/api/admin/relatorios/leads.xlsx`;
    assert.equal((await fetch(url)).status,401);
    assert.equal((await fetch(url,{headers:{Authorization:'vendedor'}})).status,403);
    assert.equal(queries,0);
    assert.equal((await fetch(url+'?status=invalido',{headers:{Authorization:'admin'}})).status,400);
    assert.equal(queries,0);
    const result=await fetch(url+'?status=novo',{headers:{Authorization:'admin'}});
    assert.equal(result.status,200);assert.equal(result.headers.get('content-type'),XLSX_TYPE);
    assert.match(result.headers.get('content-disposition'),/attachment; filename="DDE-Leads-.*\.xlsx"/);
    assert.match(result.headers.get('cache-control'),/no-store/);
    assert.ok(unzip(Buffer.from(await result.arrayBuffer()))['xl/worksheets/sheet1.xml']);
    assert.equal(queries,1);
});

module.exports={unzip,lead};
