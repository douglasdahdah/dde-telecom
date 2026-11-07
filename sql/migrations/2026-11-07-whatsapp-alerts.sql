-- Avisos internos: guarda somente identificadores, sem dados de clientes.
BEGIN;
CREATE TABLE IF NOT EXISTS public.whatsapp_alerts (
    id bigserial PRIMARY KEY,
    lead_id integer UNIQUE REFERENCES public.leads(id) ON DELETE SET NULL,
    test_key varchar(100) UNIQUE,
    status varchar(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','reserved','accepted','delivered','read','failed','uncertain','cancelled')),
    available_at timestamptz NOT NULL DEFAULT now(),
    reserved_at timestamptz,
    budget_month date,
    budget_counted boolean NOT NULL DEFAULT false,
    meta_message_id varchar(300) UNIQUE,
    error_code varchar(80),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_alerts_pending ON public.whatsapp_alerts(status,available_at);
CREATE TABLE IF NOT EXISTS public.whatsapp_alert_usage (
    month date PRIMARY KEY,
    potential_deliveries integer NOT NULL DEFAULT 0 CHECK (potential_deliveries BETWEEN 0 AND 100)
);
CREATE TABLE IF NOT EXISTS public.whatsapp_alert_receipts (
    message_id varchar(300) PRIMARY KEY,
    status varchar(20) NOT NULL CHECK (status IN ('accepted','delivered','read','failed')),
    received_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.queue_dde_whatsapp_alert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO public.whatsapp_alerts(lead_id) VALUES(NEW.id)
    ON CONFLICT(lead_id) DO NOTHING;
    RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER dde_whatsapp_new_lead
    AFTER INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION public.queue_dde_whatsapp_alert();
-- O corte 14 corresponde aos contatos antigos excluídos com backup pelo titular.
-- Inclui somente eventuais contatos novos recebidos durante esta configuração.
INSERT INTO public.whatsapp_alerts(lead_id)
    SELECT id FROM public.leads WHERE id > 14 ON CONFLICT(lead_id) DO NOTHING;
COMMIT;
