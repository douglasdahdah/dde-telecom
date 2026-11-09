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

O envio oficial da Meta está configurado para **(34) 99644-0163** e **(34) 99655-7353**, conforme solicitado pelo responsável. A conta, o remetente e a credencial foram conferidos, e o modelo `dde_novo_lead_v1` está aprovado como Utilidade, em português. A permissão específica da conta “DDE Telecom — Avisos de Leads” foi autorizada pelo responsável e conferida como Acesso total na Meta. O titular confirmou o recebimento do teste no primeiro número; no segundo, a Meta confirmou a leitura do teste e de dois avisos reais.

**Pendência em 08/11/2026:** os envios seguintes foram recusados pela Meta com o código `131037`, que exige aprovação do nome do remetente 555 fornecido pelo WhatsApp (+1 555-731-8723). A solicitação foi corrigida para o nome exato **DDE Telecom** e aceita pela API; isso ainda não significa aprovação. A consulta retornou `name_status=AVAILABLE_WITHOUT_REVIEW`. A verificação empresarial foi iniciada com autorização do titular e os dados foram conferidos no registro oficial encontrado pela Meta. O titular informou não ter acesso ao telefone daquele registro; a alternativa de identidade oferecida pela Meta exige a pessoa diretora listada no cadastro. A verificação permanece com envio pendente. Não envie documentos pessoais por canais externos à tela oficial da Meta. Os avisos recusados permanecem na fila para nova tentativa; os cinco leads reais permanecem no CRM. O canal ainda não pode ser considerado plenamente operacional. Os dois números brasileiros são destinatários internos dos avisos, não foram transferidos do celular. A regra específica para números 555 está em https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview#555-business-phone-numbers.

Os avisos mostram o número do lead e o acesso ao CRM. Os dados pessoais dos clientes ficam no CRM. O primeiro aviso será identificado como teste e não cria um lead fictício.

O código mantém uma fila no PostgreSQL, limita o envio a 100 mensagens potencialmente cobradas por mês, incluindo testes, e só libera os avisos de cada destino após a confirmação de entrega do teste nesse número. O limite de 100 mensagens é compartilhado entre os dois números; cada lead gera duas mensagens quando ambos estão ativos. O limite é conservador para o orçamento autorizado de R$ 10 por mês: a tarifa de Utilidade consultada é R$ 0,035 por mensagem entregue, antes dos impostos. Modelos reclassificados como Marketing são bloqueados. A tarifa deve ser revisada antes de janeiro de 2027; o envio pausa em 01/01/2027 até essa revisão.

Para manutenção: as tabelas e o gatilho estão em `sql/migrations/2026-11-07-whatsapp-alerts.sql`. A instalação preserva leads e usuários. O modo padrão é `off`; `test` verifica apenas o aviso de teste; `auto` libera os avisos depois que a Meta confirmar a entrega. As credenciais ficam no Render. O recebimento de confirmações usa `/api/whatsapp/webhook` com assinatura da Meta e chave de verificação. Não copie chaves para este arquivo nem para o GitHub.

A migração `sql/migrations/2026-11-08-whatsapp-dois-destinos.sql` preserva os avisos anteriores e cria um registro de entrega por número em `whatsapp_alert_deliveries`. A confirmação de um número não libera o outro. Configure os dois destinos em `WHATSAPP_RECIPIENTS`, separados por vírgula. `WHATSAPP_RECIPIENT` é mantido para compatibilidade com a configuração anterior. O segundo número é um destino interno de avisos; o WhatsApp comercial do site continua sendo (34) 99644-0163.

Quando o titular confirma expressamente que recebeu um teste já aceito pela Meta, a confirmação pode ser registrada em `owner_confirmed_at`, criado pela migração `sql/migrations/2026-11-08-whatsapp-confirmacao-titular.sql`. Esse registro permite liberar aquele destino e permanece separado do status e do recibo originais da Meta. Uma falha explícita da Meta continua bloqueando a liberação. A confirmação nunca deve ser preenchida por suposição ou apenas porque a API aceitou o envio.

## Disparo na chegada do lead e avisos por e-mail

O servidor inicia o processamento dos avisos assim que confirma o cadastro de um lead do site, do vendedor ou da Meta. As filas são gravadas no banco junto com o cadastro; uma conferência a cada 15 segundos recupera avisos pendentes após falhas ou reinicializações. Não depende da tarefa do computador de três em três horas. A chegada ao celular ou à caixa de entrada também depende da disponibilidade da Meta e do Google.

O e-mail está ativo para envio direto a **ddetelecom@gmail.com**, usando o projeto Google da própria DDE “DDE Telecom — Avisos de Leads”. Em 08/11/2026, às 21h14 de Brasília, um teste disparado pelo servidor publicado chegou à caixa de entrada da DDE e foi confirmado também na fila do Neon. O teste não criou um cadastro de cliente. Após a conferência, o modo automático foi publicado no Render. O código do retransmissor está em `scripts/google-email-relay.gs`; a chave foi gerada nas propriedades privadas do projeto e guardada somente ali e no Render. Ele aceita apenas pedidos assinados, envia somente ao endereço fixo da DDE e mantém um controle para evitar mensagens repetidas. O aviso contém apenas número do lead, origem, horário e acesso ao CRM. Não pede leitura da caixa de e-mail.

Para manutenção: aplique `sql/migrations/2026-11-08-avisos-email.sql` antes de ativar o canal. Ela foi validada em uma cópia separada do Neon e aplicada ao banco publicado preservando todos os cadastros. Configure `EMAIL_RELAY_URL`, `EMAIL_RELAY_SECRET`, `EMAIL_RECIPIENT` e `EMAIL_SETUP_TEST_ID` no Render. Use `EMAIL_NOTIFICATIONS_MODE=test` durante a verificação e `auto` após confirmar a entrega. O padrão é `off`. O retransmissor usa a cota do Google; na consulta de 08/11/2026, contas Gmail comuns têm limite de 100 destinatários por dia. A fila preserva excedentes para nova tentativa; essa cota pode mudar. Referência: https://developers.google.com/apps-script/guides/services/quotas.

A tarefa anterior de e-mail de três em três horas foi pausada após a confirmação do teste e da publicação do modo automático, para evitar avisos duplicados. Se um envio ficar com resultado incerto, confira a caixa de e-mail antes de repetir; o sistema preserva esse estado para não duplicar um aviso já enviado. Leads na lixeira não geram novos avisos.

## Painel do administrador

O painel usa a identidade do site de vendas: azul, verde e laranja, com o logotipo aprovado. Os contatos e os indicadores são atualizados automaticamente a cada 60 segundos enquanto a página está visível. Os filtros permanecem selecionados. Durante a edição de um atendimento, a atualização aguarda o fechamento da janela para preservar as anotações ainda não salvas.

Se a conexão falhar, os contatos já exibidos permanecem na tela e o painel tenta novamente. Os acessos e as permissões existentes continuam sendo conferidos pelo servidor.

Para baixar um relatório, entre como administrador e clique em **Baixar Excel**, na visão geral ou na tela de leads. O arquivo `.xlsx` contém todos os campos do cadastro, incluindo contato, endereço, plano, status, observações, datas, responsável e dados de origem/campanha. Na tela de leads, o relatório aplica a busca e o status selecionados; na visão geral, inclui todos os leads. As datas são exibidas no horário de Brasília. Telefones, CEPs e identificadores de anúncios permanecem como texto, preservando zeros e todos os dígitos.

A coluna **Vendedor indicado** é preenchida quando o responsável tem perfil de vendedor. Leads ainda sob responsabilidade de um administrador continuam com esse responsável identificado, e o campo de vendedor fica vazio. A atribuição é feita na opção já existente **Ver detalhes → Atribuir responsável**. O Excel é uma cópia para consulta; alterá-lo não modifica o CRM. A exportação é exclusiva de administradores, gera o arquivo no momento do download e não altera o banco.

Para excluir um cadastro, abra **Ver detalhes → Excluir lead** e confirme. Ele será movido para a **Lixeira**, acessível no topo do painel, e deixará de aparecer nas listas, indicadores e novos relatórios Excel. Para recuperá-lo, abra **Lixeira → Restaurar lead**. Os dados, o histórico de atendimento e o responsável são mantidos. Essa função é exclusiva do administrador; não há apagamento definitivo pelo painel. Um Excel já baixado continua sendo uma cópia anterior à exclusão.

## Área comercial — vendedores e indicadores

O vendedor ou indicador entra em **Acesso do Vendedor** com seu acesso individual e escolhe **Cadastrar novo lead**. O formulário próprio pede os dados do cliente, plano de interesse e cidade, com bairro e endereço adicional disponíveis. Ele usa os planos existentes do catálogo; não cria ofertas ou preços novos.

Ao enviar, o cadastro aparece no administrador como **Novo**, com origem **Cadastro do vendedor** e identificação de quem indicou. A identidade vem da conta conectada; o formulário não pode escolher outro vendedor nem alterar o status inicial. O nome e o identificador da indicação original também ficam preservados nos metadados do lead, disponíveis nos detalhes e no Excel. O vendedor vê apenas os registros permitidos pelo seu acesso. Vendedores e indicadores usam o perfil Vendedor cadastrado pelo administrador em **Usuários/Vendedores**.

O cadastro também aciona as filas de avisos. O envio para WhatsApp e e-mail depende da ativação e confirmação de entrega de cada canal, descritas acima.

## Cópia de segurança

O ZIP contém o código e um `.env.example` sem senhas. Ele não contém o banco de dados nem as chaves privadas do Render. O ZIP original deve continuar guardado.

Antes de uma alteração futura, a pessoa responsável deve guardar uma cópia do código, conferir o ponto de recuperação do Neon e preservar os segredos existentes no Render. Não apague ou recrie o banco. Não execute novamente o esquema inicial em um banco que já tem dados.

## Para quem for cuidar da hospedagem

O serviço existente no Render usa `npm install` para preparar o projeto e `node src/server.js` para iniciar. As configurações privadas permanecem no Render. O arquivo `.env.example` descreve as variáveis; ele não deve ser preenchido com credenciais no GitHub ou em pacotes compartilhados.

As mudanças de catálogo estão em `sql/migrations/2026-11-07-ofertas-uberaba.sql` e já foram aplicadas ao ambiente publicado após a conferência em uma ramificação separada do Neon. Não é necessário executá-las novamente. O arquivo não exclui leads ou usuários.

A lixeira acrescenta apenas as colunas opcionais `excluido_em` e `excluido_por`. A migração `sql/migrations/2026-11-08-lixeira-leads.sql` foi validada em uma ramificação separada do Neon e aplicada ao banco publicado preservando os seis cadastros existentes. Antes de publicar essa versão em outro ambiente, aplique essa migração ao banco correspondente; não recrie as tabelas.

## Conferências

Verificações de sintaxe passaram. Preços e links foram conferidos no site publicado. A revisão de apresentação não altera autenticação, permissões ou processamento de leads. Para reverter a apresentação, publique o commit anterior; não restaure um banco antigo por causa de uma alteração visual.

A fila do WhatsApp foi testada em uma ramificação separada do Neon: criação automática do aviso, bloqueio até a entrega do teste por destinatário, confirmação expressa do titular, limite mensal e prevenção de reenvio em falhas ambíguas. Nessa validação, as respostas da Meta foram simuladas. Separadamente, os testes reais e os dois avisos reais lidos foram conferidos conforme descrito acima; a pendência posterior de aprovação do nome continua documentada. Os 46 testes automatizados e as verificações de sintaxe passaram. O teste real do e-mail foi disparado pelo Render e confirmado na caixa de entrada e no Neon; os testes automatizados de envio usam respostas simuladas.

A página administrativa `/admin/conectar-whatsapp.html` abre o fluxo oficial para conectar o WhatsApp Business existente, mantendo o aplicativo no celular. Ela exige uma sessão de administrador, usa apenas os IDs públicos do app/configuração e não altera o remetente do servidor. Uma autorização recebida é temporária, não é salva no navegador e ainda precisa de validação no servidor e configuração no Render antes dos testes de entrega. Não compartilhe o código temporário por mensagens. Escolha não compartilhar o histórico anterior; cancele se a Meta oferecer apenas excluir ou transferir a conta do celular.

Conferência real de 08/11/2026: a tentativa de envio das 22h13 aos dois destinos foi recusada pela Meta com `131037`; nenhum identificador de mensagem foi emitido para essas duas tentativas. O servidor continuava usando o remetente +1 555-731-8723. Na tentativa posterior de conectar o WhatsApp Business (34) 99655-7353 pelo fluxo oficial, a Meta exibiu **“ddetelecom.algar não pode integrar clientes no momento”**, antes de concluir a autorização. Nenhum número foi transferido, nenhum histórico foi compartilhado e nenhuma nova credencial foi obtida. A conexão depende da liberação da Meta; ter o aplicativo Business instalado no celular não confirma a conexão com o servidor. O e-mail instantâneo permanece ativo. A página de conexão foi publicada e os 49 testes automatizados passaram; isso não representa comprovação de entrega do WhatsApp.
