-- Uma confirmação expressa do titular é registrada separadamente do retorno da Meta.
-- O status recebido da Meta nunca é alterado para simular uma entrega.
ALTER TABLE public.whatsapp_alert_deliveries ADD COLUMN IF NOT EXISTS owner_confirmed_at timestamptz;
