-- Ofertas verificadas na loja oficial Algar, Uberaba/MG, 07/11/2026.
-- Fontes: https://loja.algar.com.br/para-voce/internet/
-- https://loja.algar.com.br/para-voce/celular/pos-pago/
-- Preserva todos os leads e os registros de planos anteriores.
DO $dde_catalogo$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM planos WHERE id=3 AND nome='Internet 600 Mega') THEN RAISE EXCEPTION 'Catálogo divergente: plano 3'; END IF;
  UPDATE planos SET ativo=FALSE, atualizado_em=NOW() WHERE id=3;
  IF NOT EXISTS (SELECT 1 FROM planos WHERE id=4 AND nome='Internet 800 Mega') THEN RAISE EXCEPTION 'Catálogo divergente: plano 4'; END IF;
  UPDATE planos SET ativo=FALSE, atualizado_em=NOW() WHERE id=4;
  IF NOT EXISTS (SELECT 1 FROM planos WHERE id=5 AND nome='Internet 1 Giga') THEN RAISE EXCEPTION 'Catálogo divergente: plano 5'; END IF;
  UPDATE planos SET preco=129.9, descricao='Mais velocidade para uma rotina com vários dispositivos, trabalho e entretenimento.', destaque=FALSE, selo='Mais velocidade', ordem=3, beneficios='["1 Giga de internet fibra","Acesso ilimitado","Modem em comodato"]'::jsonb, fidelidade_meses=12, promocional=TRUE, observacoes='Valor por 12 meses com débito automático. Consulte disponibilidade e condições da oferta.', atualizado_em=NOW() WHERE id=5;
  IF NOT EXISTS (SELECT 1 FROM planos WHERE id=11 AND nome='Algar Controle Plus 55GB') THEN RAISE EXCEPTION 'Catálogo divergente: plano 11'; END IF;
  UPDATE planos SET preco=50, descricao='55 GB para navegar, com opção de portabilidade do seu número.', selo='Seu celular conectado', ordem=1, beneficios='["55 GB de internet móvel","Ligações ilimitadas com CSP 12","WhatsApp sem descontar a franquia*","Roaming conforme o plano"]'::jsonb, fidelidade_meses=12, promocional=TRUE, observacoes='Valor por 12 meses. 5G depende de cobertura e aparelho compatível. Links externos do WhatsApp usam a franquia de dados.', atualizado_em=NOW() WHERE id=11;
  IF NOT EXISTS (SELECT 1 FROM planos WHERE id=12 AND nome='Algar Pós Super 75GB') THEN RAISE EXCEPTION 'Catálogo divergente: plano 12'; END IF;
  UPDATE planos SET preco=75, descricao='75 GB para acompanhar sua rotina dentro e fora de casa.', selo='Mais dados para você', ordem=1, beneficios='["75 GB de internet móvel","Ligações ilimitadas com CSP 12","WhatsApp sem descontar a franquia*","Portabilidade disponível"]'::jsonb, fidelidade_meses=12, promocional=TRUE, observacoes='Valor por 12 meses. 5G depende de cobertura e aparelho compatível. Links externos do WhatsApp usam a franquia de dados.', atualizado_em=NOW() WHERE id=12;
  IF NOT EXISTS (SELECT 1 FROM planos WHERE id=13 AND nome='Algar Pós Ultra 100GB') THEN RAISE EXCEPTION 'Catálogo divergente: plano 13'; END IF;
  UPDATE planos SET preco=100, descricao='100 GB para quem precisa de mais internet no celular.', selo='Para usar mais', ordem=2, beneficios='["100 GB de internet móvel","Ligações ilimitadas com CSP 12","WhatsApp sem descontar a franquia*","Portabilidade disponível"]'::jsonb, fidelidade_meses=12, promocional=TRUE, observacoes='Valor por 12 meses. 5G depende de cobertura e aparelho compatível. Links externos do WhatsApp usam a franquia de dados.', atualizado_em=NOW() WHERE id=13;
  IF NOT EXISTS (SELECT 1 FROM planos WHERE id=14 AND nome='Algar Pós Top Ilimitado') THEN RAISE EXCEPTION 'Catálogo divergente: plano 14'; END IF;
  UPDATE planos SET preco=150, descricao='Internet móvel ilimitada para uso local. Consulte as regras de roaming e uso.', selo='Seu mundo conectado', ordem=3, beneficios='["Internet ilimitada para uso local","Ligações ilimitadas com CSP 12","Roaming conforme regulamento","Portabilidade disponível"]'::jsonb, fidelidade_meses=12, promocional=TRUE, observacoes='Valor por 12 meses. 5G depende de cobertura e aparelho compatível. Links externos do WhatsApp usam a franquia de dados.', atualizado_em=NOW() WHERE id=14;
  IF NOT EXISTS (SELECT 1 FROM planos WHERE nome='Internet 700 Mega') THEN
    INSERT INTO planos (nome,tipo,velocidade,franquia,preco,descricao,ativo,destaque,selo,ordem,beneficios,fidelidade_meses,promocional,observacoes) VALUES ('Internet 700 Mega','internet','700 Mega',NULL,99.9,'Fibra para estudar, trabalhar e aproveitar os momentos em casa.',TRUE,TRUE,'Oferta de fibra',1,'["700 Mega de internet fibra","Acesso ilimitado","Modem em comodato"]'::jsonb,12,TRUE,'Valor por 12 meses com débito automático. Consulte disponibilidade e condições da oferta.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM planos WHERE nome='Internet 700 Mega + Super Wi-Fi') THEN
    INSERT INTO planos (nome,tipo,velocidade,franquia,preco,descricao,ativo,destaque,selo,ordem,beneficios,fidelidade_meses,promocional,observacoes) VALUES ('Internet 700 Mega + Super Wi-Fi','internet','700 Mega',NULL,129.9,'700 Mega com 1 equipamento Super Wi-Fi de tecnologia Wi-Fi 6.',TRUE,FALSE,'Mais cobertura Wi-Fi',2,'["700 Mega de internet fibra","1 equipamento Super Wi-Fi","Tecnologia Wi-Fi 6 no Super Wi-Fi"]'::jsonb,12,TRUE,'Valor por 12 meses com débito automático. Consulte disponibilidade e condições da oferta.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM planos WHERE nome='Internet 700 Mega + Controle 55 GB') THEN
    INSERT INTO planos (nome,tipo,velocidade,franquia,preco,descricao,ativo,destaque,selo,ordem,beneficios,fidelidade_meses,promocional,observacoes) VALUES ('Internet 700 Mega + Controle 55 GB','internet','700 Mega','55 GB',149.9,'A conexão de casa e a do celular reunidas em um pacote.',TRUE,FALSE,'Fibra + celular',4,'["700 Mega de internet fibra","Celular Controle Plus 55 GB","Ligações ilimitadas com CSP 12"]'::jsonb,12,TRUE,'Valor por 12 meses com débito automático. Consulte disponibilidade e condições da oferta. Celular: roaming e uso de dados conforme o plano.');
  END IF;
END
$dde_catalogo$;
