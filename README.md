# DDE Telecom V12 — integração com a Meta

Este pacote prepara o CRM da DDE para receber interessados dos dois caminhos: formulário do site e formulários instantâneos do Facebook/Instagram. O site e sua identidade visual foram preservados.

## O que acontece com os contatos

- Links de publicações podem identificar a campanha usando parâmetros `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` e `utm_term`.
- O formulário do site continua criando leads no CRM e mostra a origem/campanha para a equipe.
- Formulários instantâneos da Meta enviam uma notificação segura ao site. O CRM busca os dados autorizados na Meta, evita duplicar o mesmo contato e registra a origem como Facebook/Instagram.
- Leads recebidos da Meta entram para o administrador ativo, que pode encaminhá-los a um vendedor pelo painel.

## Situação da publicação

O site publicado continua na versão V11.1. Esta integração está preparada em uma branch separada e ainda depende da autorização para acrescentar a estrutura no banco Neon e da configuração da Página/aplicativo da Meta. O código novo não deve ser publicado antes da migração do banco: o formulário atual do site também passa a registrar a origem da campanha.

A migração é aditiva: acrescenta uma coluna JSONB para a origem/campanha e uma tabela nova para evitar duplicatas de notificações da Meta. Ela não apaga nem modifica os leads existentes. Deve ser aplicada uma vez, com cópia de segurança, antes da publicação do código.

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

O banco de produção foi inspecionado em leitura. A alteração descrita acima foi testada numa cópia temporária do Neon; o banco principal ainda não foi alterado. Não execute `sql/schema.sql` no banco publicado: esse arquivo serve para uma instalação nova. Para atualizar o site existente, aplique apenas `sql/migrations/2026-11-06-meta-leads.sql`, depois de confirmar a cópia de segurança.

A publicação do site usa o Render e o repositório GitHub. Mantenha as configurações privadas já existentes no Render. Nunca apague nem recrie o banco Neon para instalar esta versão.

## Verificações realizadas

A sintaxe dos arquivos JavaScript foi conferida e os testes locais da assinatura do webhook, leitura das notificações, identificação de campos e versão da API passaram. Não foi feito teste com uma Página Meta real, nem teste de integração no banco de produção.

O pacote não inclui `.env` privado, credenciais, `.git`, `node_modules` ou backups antigos.
