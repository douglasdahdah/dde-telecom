-- Exclusão recuperável: mantém o cadastro, responsável, respostas e histórico.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS excluido_em timestamp with time zone;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS excluido_por integer;
