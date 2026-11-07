# DDE Telecom — site e CRM

O site está publicado em https://dde-telecom.onrender.com.
Você não precisa instalar o ZIP nem executar comandos. Guarde-o como cópia da versão entregue.

## Atualização de 07/11/2026

- Visual renovado, com letras maiores, apresentação mais curta, ofertas e formulário de atendimento.
- Composição clara e contemporânea em azul, verde e laranja, com o logotipo aprovado. Formulário mais estreito e campos compactos; os campos de contato e endereço continuam disponíveis.
- O site mostra apenas “Atendimento comercial”, sem dias ou horários.
- WhatsApp comercial: **(34) 99644-0163**. Marca parceira: **Algar**.
- Os dois links comerciais que saíam do site para a loja da Algar foram removidos.
- Preços comparados com a loja oficial, selecionando **Uberaba/MG**. Condições de promoção e fidelidade aparecem nos cards; a equipe confirma a contratação para cada cliente.
- Ofertas exclusivas do site da operadora não foram incluídas. A consulta pública não substitui uma tabela comercial específica de credenciadas.
- Leads, usuários, acessos de vendedores e integração Meta foram preservados. A atualização do catálogo modificou somente os planos, mantendo os antigos inativos para preservar o histórico.

## Recebimento de contatos

O formulário identifica o plano escolhido e os parâmetros de campanha do link de entrada. A integração de formulários instantâneos da Meta foi verificada anteriormente com um lead sintético da ferramenta oficial, recebido no CRM. Isso não equivale ao teste de uma campanha paga real.

O formulário do site também foi conferido em uma prévia local com destino simulado; esse teste local não gravou novos contatos no Neon. Nenhuma campanha paga foi iniciada por esta atualização.

## Cópia de segurança

O ZIP contém o código e um `.env.example` sem senhas. Ele não contém o banco de dados nem as chaves privadas do Render. O ZIP original deve continuar guardado.

Antes de uma alteração futura, a pessoa responsável deve guardar uma cópia do código, conferir o ponto de recuperação do Neon e preservar os segredos existentes no Render. Não apague ou recrie o banco. Não execute novamente o esquema inicial em um banco que já tem dados.

## Para quem for cuidar da hospedagem

O serviço existente no Render usa `npm install` para preparar o projeto e `node src/server.js` para iniciar. As configurações privadas permanecem no Render. O arquivo `.env.example` descreve as variáveis; ele não deve ser preenchido com credenciais no GitHub ou em pacotes compartilhados.

As mudanças de catálogo estão em `sql/migrations/2026-11-07-ofertas-uberaba.sql` e já foram aplicadas ao ambiente publicado após a conferência em uma ramificação separada do Neon. Não é necessário executá-las novamente. O arquivo não exclui leads ou usuários.

## Conferências

Verificações de sintaxe passaram. Preços e links foram conferidos no site publicado. A revisão de apresentação não altera autenticação, permissões ou processamento de leads. Para reverter a apresentação, publique o commit anterior; não restaure um banco antigo por causa de uma alteração visual.
