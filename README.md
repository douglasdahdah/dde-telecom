# DDE Telecom — site e CRM

O site está publicado em https://dde-telecom.onrender.com.
Você não precisa instalar o ZIP nem executar comandos. Guarde-o como cópia da versão entregue.

## Atualização de 07/11/2026

- Visual renovado, com letras maiores, apresentação mais curta, ofertas e formulário de atendimento.
- Banner amplo da família e imagem original de atendimento preservados, com o WhatsApp atualizado. A paleta mantém azul, verde e laranja. Formulário mais estreito e campos compactos; os campos de contato e endereço continuam disponíveis.
- O site mostra apenas “Atendimento comercial”, sem dias ou horários.
- WhatsApp comercial: **(34) 99644-0163**. Marca parceira: **Algar**.
- Os dois links comerciais que saíam do site para a loja da Algar foram removidos.
- Preços comparados com a loja oficial, selecionando **Uberaba/MG**. Condições de promoção e fidelidade aparecem nos cards; a equipe confirma a contratação para cada cliente.
- Ofertas exclusivas do site da operadora não foram incluídas. A consulta pública não substitui uma tabela comercial específica de credenciadas.
- Leads, usuários, acessos de vendedores e integração Meta foram preservados. A atualização do catálogo modificou somente os planos, mantendo os antigos inativos para preservar o histórico.

## Recebimento de contatos

O formulário do site identifica o plano escolhido e os parâmetros de campanha do link de entrada. Em 08/11/2026, cinco cadastros reais da campanha paga foram recuperados da Meta e conferidos no CRM com nome, telefone e e-mail. A conexão anterior havia sido invalidada pela Meta; a autorização da Página foi renovada e guardada somente no Render.

O aviso da Meta dispara a importação assim que chega ao servidor. A fila é guardada no PostgreSQL antes da confirmação de recebimento. O servidor também verifica pendências a cada minuto e retoma falhas de autorização ou de comunicação após uma reinicialização. Essas falhas continuam aguardando recuperação, sem serem abandonadas depois de oito tentativas. O painel informa pendências e oferece acesso direto à Central de Leads da Meta para atendimento durante uma interrupção.

A Meta pode exigir nova autorização ou limitar sua API. Nenhum sistema pode garantir entrega instantânea durante essas interrupções. O administrador verifica o estado a cada 60 segundos; uma autorização recusada fica visível, sem confundir uma fila pendente com ausência de interessados.

Em 08/11/2026, com autorização do responsável, a hospedagem do serviço DDE foi atualizada para o plano contínuo de **US$ 7 por mês**, sujeito aos impostos e à conversão do cartão. A alteração foi confirmada no Render e o site foi conferido após sua aplicação. Esse plano remove as pausas por inatividade da hospedagem gratuita. A cobrança é separada dos anúncios da Meta.

O recebimento aceita plano de interesse, cidade, bairro e CEP quando essas informações são enviadas pelo formulário da Meta. As respostas originais também ficam nos metadados do cadastro e no Excel. Dados que não foram perguntados ao cliente permanecem vazios; não são inventados nem completados por suposição.

O novo formulário da campanha, salvo na Meta em 08/11/2026, pergunta o plano de interesse, a cidade de instalação e o bairro, além de nome, e-mail e telefone. A alteração foi vinculada ao anúncio existente de Facebook e Instagram, sem aumento do orçamento. Um envio pela ferramenta oficial de teste da Meta chegou ao CRM como lead 20. O teste revelou que a Meta identifica as perguntas como 0, 1 e 2; a associação foi corrigida especificamente para esse formulário. Os valores **700 Mega, Uberaba e Centro** foram conferidos no administrador publicado e no Excel baixado dele. As respostas originais permanecem preservadas; formulários desconhecidos não recebem associações por suposição.

## Avisos de novos leads por WhatsApp

O envio oficial da Meta está em configuração para **(34) 99644-0163**. A conta, o aplicativo e o modelo de mensagem foram preparados; a aprovação do modelo e a entrega do teste precisam ser confirmadas antes de declarar o canal ativo.

Os avisos mostram o número do lead e o acesso ao CRM. Os dados pessoais dos clientes ficam no CRM. O primeiro aviso será identificado como teste e não cria um lead fictício.

O código mantém uma fila no PostgreSQL, limita o envio a 100 mensagens potencialmente cobradas por mês, incluindo testes, e só libera os avisos após a confirmação de entrega do teste. O limite é conservador para o orçamento autorizado de R$ 10 por mês: a tarifa de Utilidade consultada é R$ 0,035 por mensagem entregue, antes dos impostos. Modelos reclassificados como Marketing são bloqueados. A tarifa deve ser revisada antes de janeiro de 2027; o envio pausa em 01/01/2027 até essa revisão.

Para manutenção: as tabelas e o gatilho estão em `sql/migrations/2026-11-07-whatsapp-alerts.sql`. A instalação preserva leads e usuários. O modo padrão é `off`; `test` verifica apenas o aviso de teste; `auto` libera os avisos depois que a Meta confirmar a entrega. As credenciais ficam no Render. O recebimento de confirmações usa `/api/whatsapp/webhook` com assinatura da Meta e chave de verificação. Não copie chaves para este arquivo nem para o GitHub.

## Painel do administrador

O painel usa a identidade do site de vendas: azul, verde e laranja, com o logotipo aprovado. Os contatos e os indicadores são atualizados automaticamente a cada 60 segundos enquanto a página está visível. Os filtros permanecem selecionados. Durante a edição de um atendimento, a atualização aguarda o fechamento da janela para preservar as anotações ainda não salvas.

Se a conexão falhar, os contatos já exibidos permanecem na tela e o painel tenta novamente. Os acessos e as permissões existentes continuam sendo conferidos pelo servidor.

Para baixar um relatório, entre como administrador e clique em **Baixar Excel**, na visão geral ou na tela de leads. O arquivo `.xlsx` contém todos os campos do cadastro, incluindo contato, endereço, plano, status, observações, datas, responsável e dados de origem/campanha. Na tela de leads, o relatório aplica a busca e o status selecionados; na visão geral, inclui todos os leads. As datas são exibidas no horário de Brasília. Telefones, CEPs e identificadores de anúncios permanecem como texto, preservando zeros e todos os dígitos.

A coluna **Vendedor indicado** é preenchida quando o responsável tem perfil de vendedor. Leads ainda sob responsabilidade de um administrador continuam com esse responsável identificado, e o campo de vendedor fica vazio. A atribuição é feita na opção já existente **Ver detalhes → Atribuir responsável**. O Excel é uma cópia para consulta; alterá-lo não modifica o CRM. A exportação é exclusiva de administradores, gera o arquivo no momento do download e não altera o banco.

Para excluir um cadastro, abra **Ver detalhes → Excluir lead** e confirme. Ele será movido para a **Lixeira**, acessível no topo do painel, e deixará de aparecer nas listas, indicadores e novos relatórios Excel. Para recuperá-lo, abra **Lixeira → Restaurar lead**. Os dados, o histórico de atendimento e o responsável são mantidos. Essa função é exclusiva do administrador; não há apagamento definitivo pelo painel. Um Excel já baixado continua sendo uma cópia anterior à exclusão.

## Cópia de segurança

O ZIP contém o código e um `.env.example` sem senhas. Ele não contém o banco de dados nem as chaves privadas do Render. O ZIP original deve continuar guardado.

Antes de uma alteração futura, a pessoa responsável deve guardar uma cópia do código, conferir o ponto de recuperação do Neon e preservar os segredos existentes no Render. Não apague ou recrie o banco. Não execute novamente o esquema inicial em um banco que já tem dados.

## Para quem for cuidar da hospedagem

O serviço existente no Render usa `npm install` para preparar o projeto e `node src/server.js` para iniciar. As configurações privadas permanecem no Render. O arquivo `.env.example` descreve as variáveis; ele não deve ser preenchido com credenciais no GitHub ou em pacotes compartilhados.

As mudanças de catálogo estão em `sql/migrations/2026-11-07-ofertas-uberaba.sql` e já foram aplicadas ao ambiente publicado após a conferência em uma ramificação separada do Neon. Não é necessário executá-las novamente. O arquivo não exclui leads ou usuários.

A lixeira acrescenta apenas as colunas opcionais `excluido_em` e `excluido_por`. A migração `sql/migrations/2026-11-08-lixeira-leads.sql` foi validada em uma ramificação separada do Neon e aplicada ao banco publicado preservando os seis cadastros existentes. Antes de publicar essa versão em outro ambiente, aplique essa migração ao banco correspondente; não recrie as tabelas.

## Conferências

Verificações de sintaxe passaram. Preços e links foram conferidos no site publicado. A revisão de apresentação não altera autenticação, permissões ou processamento de leads. Para reverter a apresentação, publique o commit anterior; não restaure um banco antigo por causa de uma alteração visual.

A fila do WhatsApp foi testada em uma ramificação separada do Neon: criação automática do aviso, bloqueio até a entrega do teste, limite mensal e prevenção de reenvio em falhas ambíguas. Nessa validação, as respostas de envio da Meta foram simuladas; não houve mensagem real. Os 16 testes automatizados também passaram. O teste real de entrega continua sendo uma etapa separada, dependente da liberação da Meta.
