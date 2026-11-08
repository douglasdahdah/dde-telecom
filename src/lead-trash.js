'use strict';

function registerLeadTrash(app, pool, { autenticar, somenteAdmin }) {
    const privateResponse = (req,res,next) => { res.set('Cache-Control','private, no-store'); next(); };
    const validId = (req,res,next) => /^[1-9]\d*$/.test(req.params.id) && Number.isSafeInteger(Number(req.params.id))
        ? next() : res.status(400).json({erro:'ID de lead inválido.'});
    const run = fn => async(req,res,next) => { try { await fn(req,res); } catch(error) { next(error); } };

    app.get('/api/admin/leads/excluidos', privateResponse, autenticar, somenteAdmin, run(async(req,res) => {
        const {rows} = await pool.query(`SELECT id, nome, excluido_em
            FROM public.leads WHERE excluido_em IS NOT NULL ORDER BY excluido_em DESC, id DESC`);
        res.json(rows);
    }));
    app.delete('/api/leads/:id', privateResponse, autenticar, somenteAdmin, validId, run(async(req,res) => {
        const {rows} = await pool.query(`UPDATE public.leads SET excluido_em=now(), excluido_por=$2
            WHERE id=$1 AND excluido_em IS NULL RETURNING id, nome`, [req.params.id,req.usuario.id]);
        if (!rows.length) return res.status(404).json({erro:'Lead não encontrado ou já está na lixeira.'});
        res.json({mensagem:'Lead movido para a lixeira. Você pode restaurá-lo.',lead:rows[0]});
    }));
    app.post('/api/admin/leads/:id/restaurar', privateResponse, autenticar, somenteAdmin, validId, run(async(req,res) => {
        const {rows} = await pool.query(`UPDATE public.leads SET excluido_em=NULL, excluido_por=NULL
            WHERE id=$1 AND excluido_em IS NOT NULL RETURNING id, nome`, [req.params.id]);
        if (!rows.length) return res.status(404).json({erro:'Lead não encontrado na lixeira.'});
        res.json({mensagem:'Lead restaurado com os dados e o responsável anteriores.',lead:rows[0]});
    }));
}

module.exports = { registerLeadTrash };
