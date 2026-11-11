BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM public.usuarios GROUP BY lower(btrim(email)) HAVING count(*) > 1) THEN
        RAISE EXCEPTION 'Concilie e-mails duplicados antes da migração.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.usuarios WHERE nome IS NULL OR btrim(nome)='' OR email IS NULL OR btrim(email)='' OR senha_hash IS NULL OR senha_hash !~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$' OR perfil IS NULL OR perfil NOT IN ('admin','vendedor') OR ativo IS NULL) THEN
        RAISE EXCEPTION 'Concilie as contas inválidas antes da migração.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.leads l LEFT JOIN public.usuarios u ON u.id=l.vendedor_id WHERE l.vendedor_id IS NOT NULL AND u.id IS NULL) THEN
        RAISE EXCEPTION 'Concilie os responsáveis inexistentes antes da migração.';
    END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_normalizado_uidx ON public.usuarios(lower(btrim(email)));
ALTER TABLE public.leads ALTER COLUMN interesse TYPE varchar(150);
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='leads_vendedor_id_fkey' AND conrelid='public.leads'::regclass) THEN
        ALTER TABLE public.leads ADD CONSTRAINT leads_vendedor_id_fkey FOREIGN KEY(vendedor_id) REFERENCES public.usuarios(id) ON DELETE SET NULL NOT VALID;
    END IF;
END $$;
ALTER TABLE public.leads VALIDATE CONSTRAINT leads_vendedor_id_fkey;
CREATE TABLE IF NOT EXISTS public.lead_requisicoes (
    chave varchar(140) PRIMARY KEY,
    payload_hash char(64) NOT NULL,
    lead_id integer NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_requisicoes_payload_idx ON public.lead_requisicoes(payload_hash,criado_em DESC);
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    versao text PRIMARY KEY,
    aplicado_em timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.schema_migrations(versao) VALUES ('12.0.1') ON CONFLICT DO NOTHING;
COMMIT;
