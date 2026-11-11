BEGIN;
SET LOCAL lock_timeout = '5s';

-- Fontes Algar: Liderança Varejo de novembro de 2026 (fibra) e os quatro
-- regulamentos de concessão de 01/09/2026 a 31/12/2026 (celular avulso).
-- https://loja.algar.com.br/para-voce/atendimento/regulamentos/
-- Os combos 16 e 17 seguem com preço sob consulta no catálogo público.
DO $$
DECLARE
    atualizados integer;
BEGIN
    WITH ofertas (id, preco_anterior, preco, adesao_ate, fidelidade_meses, descricao, observacoes, beneficios) AS (
        VALUES
            (5, 129.90, 129.90, DATE '2026-11-30', 12,
             'Internet fibra de 1 Giga para sua casa.',
             'R$ 129,90/mês com débito automático ou R$ 139,90/mês sem débito. Para pessoa física, em adesão ou migração. Sujeito à cobertura no endereço e à análise de crédito.',
             '["1 Giga de internet fibra", "Modem em comodato"]'::jsonb),
            (11, 50.00, 57.25, DATE '2026-12-31', NULL,
             '55 GB de internet móvel no plano Controle Plus avulso.',
             'Preço mensal por linha no plano avulso com serviços digitais, sem fidelidade. Disponível para adesão ou migração, sujeito à cobertura e à análise de crédito da Algar.',
             '["55 GB de internet móvel", "Ligações ilimitadas com CSP 12", "Skeelo eBooks"]'::jsonb),
            (12, 75.00, 78.08, DATE '2026-12-31', NULL,
             '75 GB de internet móvel no plano Pós Super avulso.',
             'Preço mensal por linha no plano avulso com serviços digitais, sem fidelidade. Disponível para adesão ou migração, sujeito à cobertura e à análise de crédito da Algar.',
             '["75 GB de internet móvel", "Ligações ilimitadas com CSP 12", "Skeelo Books e MiniBooks"]'::jsonb),
            (13, 100.00, 104.12, DATE '2026-12-31', NULL,
             '100 GB de internet móvel no plano Pós Ultra avulso.',
             'Preço mensal por linha no plano avulso com serviços digitais, sem fidelidade. Disponível para adesão ou migração, sujeito à cobertura e à análise de crédito da Algar.',
             '["100 GB de internet móvel", "Ligações ilimitadas com CSP 12", "Skeelo MiniBooks e AudioBooks"]'::jsonb),
            (14, 150.00, 229.07, DATE '2026-12-31', NULL,
             'Internet móvel ilimitada para uso local no plano Pós Top avulso.',
             'Preço mensal por linha no plano avulso com serviços digitais, sem fidelidade. Sujeito à cobertura, à análise de crédito e às regras de roaming e compartilhamento da Algar.',
             '["Internet móvel ilimitada para uso local", "20 GB em roaming", "Skeelo e Mediquo"]'::jsonb),
            (15, 99.90, 99.90, DATE '2026-11-30', 12,
             'Internet fibra de 700 Mega para sua casa.',
             'R$ 99,90/mês com débito automático ou R$ 109,90/mês sem débito. Para pessoa física, em adesão ou migração. Sujeito à cobertura no endereço e à análise de crédito.',
             '["700 Mega de internet fibra", "Modem em comodato"]'::jsonb)
    )
    UPDATE public.planos AS plano
    SET preco = oferta.preco,
        preco_original = NULL,
        promocional = FALSE,
        oferta_valida_ate = oferta.adesao_ate,
        fidelidade_meses = oferta.fidelidade_meses,
        descricao = oferta.descricao,
        observacoes = oferta.observacoes,
        beneficios = oferta.beneficios,
        atualizado_em = now()
    FROM ofertas AS oferta
    WHERE plano.id = oferta.id
      AND plano.ativo
      AND plano.promocional
      AND plano.preco = oferta.preco_anterior
      AND plano.preco_original IS NULL
      AND plano.oferta_valida_ate IS NULL
      AND plano.atualizado_em = TIMESTAMPTZ '2026-11-07 17:03:48.867203+00';

    GET DIAGNOSTICS atualizados = ROW_COUNT;
    IF atualizados <> 6 THEN
        RAISE EXCEPTION 'O catálogo mudou desde a revisão. Nenhum plano foi atualizado.';
    END IF;
END $$;

COMMIT;
