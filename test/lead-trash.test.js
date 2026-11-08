'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {registerLeadTrash} = require('../src/lead-trash');

async function fixture(t, query) {
    const app=express();
    registerLeadTrash(app,{query},{
        autenticar:(req,res,next)=>{
            const perfil=req.get('Authorization');
            if(!perfil) return res.sendStatus(401);
            req.usuario={id:7,perfil};next();
        },
        somenteAdmin:(req,res,next)=>req.usuario.perfil==='admin'?next():res.sendStatus(403)
    });
    app.use((error,req,res,next)=>res.status(500).json({erro:'Falha ao acessar os dados.'}));
    const server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    t.after(()=>new Promise(resolve=>server.close(resolve)));
    return async(path,method='GET',perfil='admin')=>fetch(`http://127.0.0.1:${server.address().port}${path}`,{
        method,headers:perfil?{Authorization:perfil}:{}
    });
}

test('lixeira, exclusão e restauração negam visitantes e vendedores antes de acessar o banco',async t=>{
    let queries=0;
    const request=await fixture(t,async()=>{queries++;return {rows:[]};});
    for(const [path,method] of [['/api/admin/leads/excluidos','GET'],['/api/leads/20','DELETE'],['/api/admin/leads/20/restaurar','POST']]) {
        assert.equal((await request(path,method,null)).status,401);
        assert.equal((await request(path,method,'vendedor')).status,403);
    }
    assert.equal(queries,0);
});

test('IDs inválidos são rejeitados sem executar consulta',async t=>{
    let queries=0;
    const request=await fixture(t,async()=>{queries++;return {rows:[]};});
    for(const id of ['0','-1','20abc','1.5','9007199254740992']) {
        assert.equal((await request(`/api/leads/${id}`,'DELETE')).status,400);
        assert.equal((await request(`/api/admin/leads/${id}/restaurar`,'POST')).status,400);
    }
    assert.equal(queries,0);
});

test('exclusão guarda autor sem apagar cadastro; restauração altera apenas os marcadores da lixeira',async t=>{
    let deleted=false;
    const request=await fixture(t,async(sql,values)=>{
        assert.match(sql,/^UPDATE public\.leads SET /);
        assert.doesNotMatch(sql,/\bDELETE\b/i);
        const assignments=sql.split('SET ')[1].split(/\s+WHERE/)[0];
        assert.doesNotMatch(assignments,/\b(status|nome|telefone|email|vendedor|interesse|cidade|bairro)\s*=/);
        assert.equal(values[0],'20');
        if(assignments.includes('now()')) {
            assert.deepEqual(values,['20',7]);
            assert.match(sql,/WHERE id=\$1 AND excluido_em IS NULL/);
            if(deleted)return {rows:[]};deleted=true;
        } else {
            assert.match(assignments,/excluido_em=NULL, excluido_por=NULL/);
            assert.match(sql,/WHERE id=\$1 AND excluido_em IS NOT NULL/);
            if(!deleted)return {rows:[]};deleted=false;
        }
        return {rows:[{id:20,nome:'TESTE'}]};
    });
    let response=await request('/api/leads/20','DELETE');
    assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
    assert.match((await response.json()).mensagem,/lixeira/);
    assert.equal((await request('/api/leads/20','DELETE')).status,404);
    response=await request('/api/admin/leads/20/restaurar','POST');
    assert.equal(response.status,200);assert.match((await response.json()).mensagem,/responsável anteriores/);
    assert.equal((await request('/api/admin/leads/20/restaurar','POST')).status,404);
});

test('lista da lixeira é privada, ordenada e limitada aos campos necessários',async t=>{
    const request=await fixture(t,async sql=>{
        assert.match(sql,/SELECT id, nome, excluido_em/);
        assert.match(sql,/WHERE excluido_em IS NOT NULL ORDER BY excluido_em DESC, id DESC/);
        assert.doesNotMatch(sql,/SELECT \*/);
        return {rows:[{id:20,nome:'TESTE',excluido_em:'2026-11-08T22:00:00Z'}]};
    });
    const response=await request('/api/admin/leads/excluidos');
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
    assert.equal((await response.json())[0].id,20);
});

test('falhas de banco não retornam sucesso de exclusão ou restauração',async t=>{
    const request=await fixture(t,async()=>{throw new Error('unavailable');});
    assert.equal((await request('/api/leads/20','DELETE')).status,500);
    assert.equal((await request('/api/admin/leads/20/restaurar','POST')).status,500);
});
