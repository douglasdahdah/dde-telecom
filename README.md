# DDE Telecom — V11 corrigida, versão 11.0.1

Correção da pasta V11 (11.0.0) auditada localmente em 10/11/2026. Não incorpora a variante denominada V11.1 cujo package.json informa 12.0.0, nem modifica produção. O ZIP original citado na conversa não estava acessível.

## O que mudou

- Dependências atualizadas pelo lockfile; desenvolvimento com `node --watch`, sem nodemon.
- Proteção transacional do último administrador ativo, inclusive concorrência e revalidação de permissão após a trava.
- Senhas novas/redefinidas com mínimo de 12 caracteres e máximo de 72 bytes. Senhas existentes continuam válidas; redefinição invalida as sessões anteriores.
- Validação central de usuários, leads e planos, incluindo limites de tamanho, tipos, telefone brasileiro, e-mail, CEP e UF.
- Captação limitada a 30 solicitações por IP a cada 15 minutos; login a 10 falhas por IP no mesmo período. O armazenamento do limite é local ao processo.
- Leads com identidade de vendedor definida no servidor; atribuição permanece exclusiva do administrador. A resposta pública devolve só mensagem/protocolo, sem dados pessoais ou responsável.
- Reenvios idênticos em 5 minutos não criam outro lead. `Idempotency-Key` preserva o resultado por chave, inclusive em concorrência; mesma chave com payload diferente retorna 409. A chave não autoriza ler um lead transferido a outro vendedor.
- CSP ativa, erro de origem devolvendo 403, configuração obrigatória de segredo e origem pública, recusa de corpo comprimido, logs sem detalhes SQL privados e respostas da API sem cache.
- Planos respeitam destaque/selo e todos os benefícios cadastrados, sem inferir “mais contratado”. Editor e API suportam preço original, promoção, validade e condições; após a validade, o preço público volta ao original. Datas seguem America/Sao_Paulo.
- Pré-validação de migração, bloqueio de e-mails duplicados e leads órfãos, validação da FK, registro da versão e tabela de idempotência. Nenhuma conta é mesclada nem dado histórico é apagado automaticamente.
- `/ready` verifica banco, versão do esquema, tabela de idempotência e existência de administrador ativo; `/health` permanece apenas liveness. Encerramento gracioso e limites de conexão/consulta adicionados.

## Preparação e homologação

1. Use Node 24.x e PostgreSQL em ambiente separado de produção.
2. Instale com `npm ci`. O ZIP não inclui dependências instaladas nem `.env` real.
3. Copie `.env.example` para `.env` e preencha as configurações privadas em local seguro. Gere JWT_SECRET aleatório com pelo menos 32 caracteres. Nunca use segredo já distribuído em ZIP.
4. Em banco já existente, faça backup e restaure uma cópia para ensaio. Execute `npm run preflight` sobre essa cópia: apenas contagens, sem alterações ou listagem de dados pessoais. Se houver falha de estrutura, a pré-validação informa que está incompleta; não é certificação de compatibilidade universal.
5. Para banco novo ou cópia aprovada, defina DATABASE_URL_UNPOOLED e ALLOW_SCHEMA_MIGRATION=11.0.1 em ambiente privado e execute `npm run migrate`. A migração não é executada no build/start e requer conexão direta. Retire ALLOW_SCHEMA_MIGRATION depois do uso. Pode também aplicar sql/schema.sql por uma ferramenta PostgreSQL com parada em erro, sobre a mesma cópia aprovada.
6. Em instalação nova, execute `npm run criar-admin` em terminal interativo; ele solicita senha sem mostrá-la. Não cria outro admin se já houver uma conta administrativa. Uma instalação antiga sem administrador ativo precisa de recuperação controlada por quem administra o banco; o pacote não ativa contas ou redefine senhas automaticamente.
7. Execute `npm start` e teste o site e as áreas de acesso em localhost. A ausência de administrador ativo mantém `/ready` em 503 até o bootstrap.

Em produção NODE_ENV=production exige HTTPS em FRONTEND_URL ou RENDER_EXTERNAL_URL. Configure FRONTEND_URL com a origem exata do domínio próprio. O endereço padrão do Render é aceito também por RENDER_EXTERNAL_URL. O backend força TLS com verificação de certificado; URLs com sslmode=disable/no-verify são recusadas em produção. Parâmetros SSL da URL não substituem essa política. Em desenvolvimento a conexão é local sem SSL: não use esse modo para acessar o banco remoto.

## Testes locais

```text
npm run check
npm test
npm audit
npm audit --omit=dev
```

Os testes de integração exigem uma instância PostgreSQL exclusiva, local, e usuário com permissão de criar bases. Configure TEST_DATABASE_URL para a base `postgres` dessa instância em loopback. Execute `npm run test:integration`. O teste cria bases com nome aleatório dde_test_..., testa cenários e remove somente essas bases. Ele recusa hosts remotos e nomes de base iniciais diferentes de postgres. Não use uma instância que contenha dados de trabalho. Sem TEST_DATABASE_URL o teste fica explicitamente marcado como ignorado.

## Migração e publicação futura

Não faça deploy antes do ensaio sobre cópia do banco. E-mails duplicados, hashes inválidos, referências órfãs e promoções inconsistentes bloqueiam a migração com rollback, sem apagar ou escolher registros. Concilie os dados com seu responsável e repita o ensaio. Colunas históricas com estruturas inesperadas ainda podem exigir migração específica.

O render.yaml é uma configuração preparada, não aplicada. Auto-deploy fica desligado e a checagem usa `/ready`. Como `/ready` exige o esquema e o administrador, prepare o banco em homologação antes do primeiro deploy saudável. Preserve os segredos privados existentes que ainda forem válidos, domínio e conexão corretos. A aplicação usa a conexão normal DATABASE_URL; a ferramenta de migração usa DATABASE_URL_UNPOOLED.

Para uma futura publicação autorizada: identificar o commit/pacote, fazer backup do banco e código, ensaiar restauração, aplicar a migração aprovada, publicar manualmente, validar login, planos, lead público/vendedor e atribuição. Mantenha plano de retorno do código e avalie compatibilidade do banco antes de restaurar backup. Não sincronize um Blueprint com serviço existente sem conferir o destino.

## O que ainda falta

- Confirmação da versão realmente hospedada, comparação com o ZIP original e tratamento dos segredos originalmente distribuídos.
- Homologação do esquema/dados reais, TLS remoto, domínio, backup/restauração, operação Linux/Render e permissões do usuário do banco.
- WhatsApp Cloud API e aprovação da Meta não estão comprovados nem implementados nesta V11. Links wa.me continuam manuais; não equivalem a envio por API. Lead Ads da variante posterior não foi incorporado.
- Topo do site ainda usa arte ampla com áreas de clique e rolagem horizontal em telas pequenas; navegação mobile e acessibilidade integral precisam de revisão própria. Formulários e planos foram testados, sem redesenhar a identidade visual.
- Política de privacidade completa, retenção/exclusão de dados, trilha de auditoria comercial, paginação das listagens e distribuição automática de leads ainda precisam de definição/implementação.
- Tokens continuam em localStorage por compatibilidade com as telas. CSP reduz exposição, mas não substitui eventual migração para cookies HttpOnly/gestão de sessões. Logout individual não revoga no servidor um token já copiado; troca de senha/desativação revogam.
- Limites por IP em memória não são compartilhados entre múltiplas instâncias. Antes de escalar, usar proteção compartilhada e avaliar tráfego legítimo atrás do mesmo IP.
- A tabela lead_requisicoes cresce com a captação. Definir política de retenção/manutenção; ao remover chaves antigas, termina a garantia de idempotência dessas chaves. Não há tarefa de exclusão automática.

Consulte o relatório entregue junto ao ZIP para os resultados exatos e as limitações. Ausência de alertas no npm audit é um resultado pontual, não garantia de ausência de vulnerabilidades.
