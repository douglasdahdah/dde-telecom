-- Fila durável. O envio contém somente o identificador e a origem do lead.
CREATE TABLE IF NOT EXISTS public.email_alerts (
 id bigserial PRIMARY KEY,
 lead_id integer UNIQUE REFERENCES public.leads(id) ON DELETE SET NULL,
 test_key varchar(100) UNIQUE,
 status varchar(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','sent','uncertain')),
 attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),
 reserved_at timestamptz,
 receipt_id varchar(100),
 error_code varchar(80),
 sent_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (lead_id IS NOT NULL OR test_key IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS email_alerts_pending ON public.email_alerts(status,available_at);
CREATE OR REPLACE FUNCTION public.queue_dde_email_alert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO public.email_alerts(lead_id) VALUES(NEW.id) ON CONFLICT(lead_id) DO NOTHING;
 RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER dde_email_new_lead AFTER INSERT ON public.leads
 FOR EACH ROW EXECUTE FUNCTION public.queue_dde_email_alert();
-- IDs 15 a 19 já tiveram avisos confirmados pelo Gmail; não reencaminhar.
INSERT INTO public.email_alerts(lead_id)
 SELECT id FROM public.leads WHERE id>19 AND excluido_em IS NULL ON CONFLICT(lead_id) DO NOTHING;
