'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { importStatus, registerMetaImportStatus } = require('../src/meta-import-status');

test('pendências ficam visíveis mesmo quando ainda não existe lead no CRM', () => {
    const now = Date.parse('2026-11-08T20:00:00Z');
    assert.equal(importStatus({pending:5,authorization_errors:5}, '123', now).status, 'authorization_required');
    assert.equal(importStatus({pending:1,oldest_pending:'2026-11-08T19:57:00Z'}, '123', now).status, 'delayed');
    assert.equal(importStatus({pending:1,oldest_pending:'2026-11-08T19:59:50Z'}, '123', now).status, 'receiving');
    assert.equal(importStatus({review:1}, '123', now).status, 'needs_review');
    const healthy = importStatus({pending:0,review:0,last_import:'2026-11-08T19:59:50Z'}, '123', now);
    assert.equal(healthy.status, 'up_to_date');
    assert.match(healthy.leadsCenterUrl, /asset_id=123$/);
});

test('somente administrador consulta o estado, sem contatos, credenciais ou escrita no banco', async t => {
    const previous = process.env.META_PAGE_ID;
    process.env.META_PAGE_ID = '123';
    t.after(() => { if(previous === undefined) delete process.env.META_PAGE_ID; else process.env.META_PAGE_ID = previous; });
    let calls = 0;
    const pool = {query: async (sql,values) => {
        calls++;
        assert.match(sql.trim(), /^SELECT/);
        assert.deepEqual(values,['123']);
        return {rows:[{pending:5,review:0,authorization_errors:5}]};
    }};
    const app = express();
    registerMetaImportStatus(app,pool,{
        autenticar:(req,res,next)=> req.headers.authorization ? next() : res.sendStatus(401),
        somenteAdmin:(req,res,next)=> req.headers.authorization === 'admin' ? next() : res.sendStatus(403)
    });
    const server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    t.after(()=>new Promise(resolve=>server.close(resolve)));
    const url=`http://127.0.0.1:${server.address().port}/api/admin/integracoes/meta/status`;
    assert.equal((await fetch(url)).status,401);
    assert.equal((await fetch(url,{headers:{Authorization:'vendedor'}})).status,403);
    assert.equal(calls,0);
    const response=await fetch(url,{headers:{Authorization:'admin'}});
    assert.equal(response.status,200);
    assert.match(response.headers.get('cache-control'),/no-store/);
    const body=await response.json();
    assert.equal(body.status,'authorization_required');
    assert.equal(body.pending,5);
    assert.deepEqual(Object.keys(body).sort(),['lastImport','leadsCenterUrl','pending','review','status']);
    assert.equal(calls,1);
});
