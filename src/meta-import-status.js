'use strict';

const META_IMPORT_STATUS_SQL = `
    SELECT
        count(*) FILTER (WHERE status = 'processed')::integer AS imported,
        count(*) FILTER (WHERE status IN ('pending', 'processing'))::integer AS pending,
        count(*) FILTER (WHERE status IN ('failed', 'needs_review'))::integer AS review,
        count(*) FILTER (
            WHERE status <> 'processed'
              AND last_error_code IN ('meta_api_190', 'meta_api_102', 'meta_api_10', 'meta_api_200')
        )::integer AS authorization_errors,
        min(received_at) FILTER (WHERE status <> 'processed') AS oldest_pending,
        max(processed_at) FILTER (WHERE status = 'processed') AS last_import
    FROM public.meta_lead_imports
    WHERE page_id = $1
`;

function importStatus(row = {}, pageId, now = Date.now()) {
    const pending = Number(row.pending) || 0;
    const review = Number(row.review) || 0;
    const authorizationErrors = Number(row.authorization_errors) || 0;
    const since = row.oldest_pending ? new Date(row.oldest_pending).getTime() : now;
    const delayed = pending > 0 && now - since >= 120000;
    const status = authorizationErrors ? 'authorization_required'
        : review ? 'needs_review' : delayed ? 'delayed' : pending ? 'receiving' : 'up_to_date';
    return {
        status, pending, review,
        lastImport: row.last_import || null,
        leadsCenterUrl: `https://business.facebook.com/latest/leads_center?asset_id=${encodeURIComponent(pageId)}`
    };
}

function registerMetaImportStatus(app, pool, { autenticar, somenteAdmin }) {
    app.get('/api/admin/integracoes/meta/status', autenticar, somenteAdmin, async (req, res) => {
        res.set('Cache-Control', 'private, no-store');
        const pageId = process.env.META_PAGE_ID || '';
        if (!pageId) return res.json({ status: 'not_configured', pending: 0, review: 0 });
        try {
            const { rows } = await pool.query(META_IMPORT_STATUS_SQL, [pageId]);
            return res.json(importStatus(rows[0], pageId));
        } catch {
            return res.status(503).json({ erro: 'Não foi possível conferir a importação da Meta.' });
        }
    });
}

module.exports = { META_IMPORT_STATUS_SQL, importStatus, registerMetaImportStatus };
