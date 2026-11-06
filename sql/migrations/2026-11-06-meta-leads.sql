-- Integração Meta Lead Ads: apenas adiciona metadados e uma tabela de deduplicação.
-- Não altera nem remove leads existentes e não armazena as respostas pessoais da Meta nesta tabela.
BEGIN;

ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS metadados_marketing jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.meta_lead_imports (
    meta_lead_id varchar(120) PRIMARY KEY,
    page_id varchar(120) NOT NULL,
    form_id varchar(120),
    ad_id varchar(120),
    adgroup_id varchar(120),
    meta_created_time bigint,
    status varchar(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'processed', 'needs_review', 'failed')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at timestamp with time zone NOT NULL DEFAULT now(),
    last_error_code varchar(80),
    lead_id integer REFERENCES public.leads(id) ON DELETE SET NULL,
    received_at timestamp with time zone NOT NULL DEFAULT now(),
    processed_at timestamp with time zone,
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_lead_imports_pending
    ON public.meta_lead_imports(status, next_attempt_at, received_at);

COMMIT;
