# DDE Telecom V12 — integração com a Meta

Este pacote prepara o CRM da DDE para receber interessados dos dois caminhos: formulário do site e formulários instantâneos do Facebook/Instagram. O site e sua identidade visual foram preservados.

## O que acontece com os contatos

- Links de publicações podem identificar a campanha usando parâmetros `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` e `utm_term`.
- O formulário do site continua criando leads no CRM e mostra a origem/campanha para a equipe.
- Formulários instantâneos da Meta enviam uma notificação segura ao site. O CRM busca os dados autorizados na Meta, evita duplicar o mesmo contato e registra a origem como Facebook/Instagram.
- Leads recebidos da Meta entram para o administrador ativo, que pode encaminhá-los a um vendedor pelo painel.

## Banco e ativação

A migração da V12 foi aplicada e conferida no Neon de produção em 6 de novembro de 2026. Ela acrescentou uma coluna JSONB para a origem/campanha e uma tabela com índice para evitar duplicatas de notificações da Meta. Os leads existentes não foram alterados nem removidos; a nova tabela estava vazia após a mudança.

O recebimento de formulários instantâneos só será ativado depois que a Página e o aplicativo comercial da Meta forem autorizados e as configurações privadas forem cadastradas no Render. Até lá, o site continua usando o formulário normal e pode identificar campanhas pelos links com parâmetros UTM.

## O que falta para receber formulários instantâneos

A Página e o aplicativo comercial da Meta precisam ser autorizados para o CRM. O aplicativo deve encaminhar notificações `leadgen` para `https://dde-telecom.onrender.com/api/meta/webhook`, e a Página deve estar inscrita nessas notificações.

No Render, a integração usa estas configurações privadas:

- `META_WEBHOOK_VERIFY_TOKEN`
- `META_APP_SECRET`
- `META_PAGE_ACCESS_TOKEN`
- `META_GRAPH_API_VERSION`
- `META_PAGE_ID`

Os segredos ficam somente no Render; não devem ser enviados pelo chat, colocados no GitHub ou incluídos em ZIP. A versão do Graph API deve ser a ativa/configurada no aplicativo Meta. Nenhum anúncio, publicação ou gasto de campanha é criado automaticamente por este sistema.

O pacote inclui o aviso público em `public/privacidade.html`, com a razão social, o CNPJ e o e-mail informados pela empresa. Depois da publicação, a URL será `https://dde-telecom.onrender.com/privacidade.html`; esse é o endereço que pode ser usado no formulário instantâneo da Meta. O aviso descreve os dados tratados hoje no site e no CRM; revise-o caso os dados de contato ou o atendimento mudem.

## Banco, cópia de segurança e instalação

Para uma instalação nova, use `sql/schema.sql`. Para atualizar outro banco que já tenha leads, faça uma cópia de segurança e aplique apenas `sql/migrations/2026-11-06-meta-leads.sql`. Não execute `sql/schema.sql` sobre um banco de produção já existente nem apague/recrie o banco.

A publicação do site usa o Render e o repositório GitHub. Mantenha as configurações privadas já existentes no Render. Nunca apague nem recrie o banco Neon para instalar esta versão.

## Verificações realizadas

A sintaxe dos arquivos JavaScript foi conferida e os testes locais da assinatura do webhook, leitura das notificações, identificação de campos e versão da API passaram. Não foi feito teste com uma Página Meta real, nem teste de integração no banco de produção.

O pacote não inclui `.env` privado, credenciais, `.git`, `node_modules` ou backups antigos.
