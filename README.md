# DDE Telecom V11.1 — guia simples

Este pacote reúne a versão revisada do site e do sistema comercial da DDE Telecom. Você não precisa abrir um terminal nem executar comandos para guardar ou encaminhar este arquivo.

## Publicação e banco

O site da DDE é publicado pelo Render a partir da branch `main` deste repositório GitHub. Quando uma atualização chega à `main`, o Render inicia a publicação automaticamente. Preserve as configurações privadas que já estão cadastradas no Render.

A estrutura do banco Neon foi conferida em modo de leitura. Nenhuma alteração no banco faz parte desta atualização; não execute `sql/schema.sql` sem antes confirmar que há uma necessidade específica e fazer uma cópia de segurança.

## Se outra pessoa cuida da hospedagem

Envie o arquivo `DDE-Telecom-V11.1-corrigido.zip` e esta mensagem:

> Atualize o site da DDE Telecom usando este pacote. Antes, faça cópia de segurança do site e do banco Neon. Preserve as configurações privadas que já existem no Render. Confira se o esquema SQL precisa ser aplicado; não apague nem recrie tabelas. Depois, confirme o site, o login do administrador, o acesso individual dos vendedores e a identificação do responsável em cada lead.

## O que foi preparado

- O site público e sua identidade visual foram preservados.
- O acesso de administrador e o login individual dos vendedores foram revisados.
- Cada lead criado por um vendedor fica vinculado à conta autenticada desse vendedor.
- O painel do vendedor permite acompanhar seus próprios leads e atualizar o atendimento.
- As rotas de leads, usuários e planos foram revisadas para PostgreSQL.
- O pacote inclui um exemplo de configuração sem senhas ou chaves privadas.
- Arquivos privados, pastas do Git, dependências instaladas e cópias antigas foram excluídos.

## Banco e cópias de segurança

O banco Neon foi consultado apenas para leitura. A estrutura encontrada já corresponde ao esquema incluído, e nenhum comando de alteração foi executado no banco. O arquivo `sql/schema.sql` serve para preparar uma instalação ou completar uma estrutura ausente; a pessoa responsável deve conferir a situação e fazer backup antes de aplicá-lo.

O ZIP original foi preservado. O pacote V11.1 não contém o arquivo privado `.env`; as configurações atuais do Render devem ser mantidas durante a publicação. Se as senhas ou chaves do ZIP original ainda estiverem em uso, troque-as antes de continuar usando-as.

## Verificações

A sintaxe dos arquivos JavaScript e alguns caminhos principais foram conferidos localmente. Não foi possível testar o login real, as operações do site contra o banco ou uma publicação de ponta a ponta. Esses testes precisam ocorrer depois que o código estiver publicado com as configurações privadas corretas.
