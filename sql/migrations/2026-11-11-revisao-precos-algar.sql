BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.planos ADD COLUMN IF NOT EXISTS preco_sob_consulta boolean NOT NULL DEFAULT false;

-- A loja Algar para Uberaba informa R$ 228,84 para o avulso e o regulamento,
-- R$ 229,07. O preço regulamentar permanece no CRM para referência interna.
DO $$
BEGIN
    UPDATE public.planos
    SET preco_sob_consulta = TRUE,
        observacoes = 'Plano avulso. Loja da Algar: R$ 228,84/mês. Regulamento: R$ 229,07/mês. Confirme a tarifa antes da contratação.',
        atualizado_em = now()
    WHERE id = 14 AND nome = 'Algar Pós Top Ilimitado' AND preco = 229.07
      AND ativo AND NOT preco_sob_consulta;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'O plano Pós Top mudou desde a revisão.';
    END IF;
END $$;

COMMIT;
