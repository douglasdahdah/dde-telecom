-- Entrega independente para cada destino autorizado, sem alterar leads.
CREATE TABLE IF NOT EXISTS public.whatsapp_alert_deliveries (
 id bigserial PRIMARY KEY,
 alert_id bigint NOT NULL REFERENCES public.whatsapp_alerts(id),
 recipient varchar(20) NOT NULL CHECK(recipient IN ('5534996440163','5534996557353')),
 status varchar(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reserved','accepted','delivered','read','failed','uncertain','cancelled')),
 available_at timestamptz NOT NULL DEFAULT now(),
 reserved_at timestamptz,
 budget_month date,
 budget_counted boolean NOT NULL DEFAULT false,
 meta_message_id varchar(300) UNIQUE,
 error_code varchar(80),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(alert_id,recipient)
);
CREATE INDEX IF NOT EXISTS whatsapp_deliveries_pending ON public.whatsapp_alert_deliveries(status,available_at);
-- Preserva o estado de todo envio já tentado ao primeiro destino.
INSERT INTO public.whatsapp_alert_deliveries(alert_id,recipient,status,available_at,reserved_at,budget_month,budget_counted,meta_message_id,error_code,created_at,updated_at)
 SELECT id,'5534996440163',status,available_at,reserved_at,budget_month,budget_counted,meta_message_id,error_code,created_at,updated_at
 FROM public.whatsapp_alerts ON CONFLICT(alert_id,recipient) DO NOTHING;
