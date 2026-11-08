-- Guarda somente o código técnico, sem conteúdo ou dados do cliente.
ALTER TABLE public.whatsapp_alert_receipts ADD COLUMN IF NOT EXISTS error_code varchar(80);
