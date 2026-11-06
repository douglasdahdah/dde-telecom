# DDE Telecom V12

Este pacote acompanha a atualização do site e do sistema comercial da DDE Telecom.

## Situação atual

A V12 já está publicada em https://dde-telecom.onrender.com. A estrutura necessária foi atualizada e conferida no banco Neon. Os leads que já existiam foram preservados.

Você não precisa instalar este pacote nem executar comandos no banco. Guarde o ZIP como cópia da versão entregue. O ZIP original também foi preservado.

## O que foi atualizado

- O formulário do site registra a campanha de origem quando alguém chega por um link de divulgação com identificação da campanha.
- O sistema está preparado para receber leads dos formulários instantâneos do Facebook e Instagram.
- O site mostra o aviso de privacidade em https://dde-telecom.onrender.com/privacidade.html.
- O Instagram @ddetelecom.algar aparece conectado ao Metricool.

## O que falta para os formulários instantâneos

A conexão do Instagram ao Metricool permite trabalhar com publicações e métricas nessa plataforma. Sozinha, ela não dá ao CRM acesso aos formulários de leads da Meta.

Para receber esses leads no sistema, a pessoa que administra a Página do Facebook e a conta comercial da Meta precisa autorizar a integração do CRM. Depois, as configurações de acesso devem ser guardadas diretamente no Render por alguém responsável pela hospedagem. Não envie senhas ou códigos pelo chat, e não coloque segredos no GitHub ou neste ZIP.

Até essa autorização ser concluída, o formulário do próprio site continua sendo o caminho ativo para receber contatos.

## Se alguém for cuidar da hospedagem no futuro

Entregue este ZIP à pessoa responsável pelo site. Peça que ela faça uma cópia de segurança antes de qualquer mudança e preserve as configurações privadas que já existem no Render. Ela não deve apagar ou recriar o banco Neon.

## Conferências

As verificações de código e os testes locais passaram. A página e o aviso de privacidade foram abertos no site publicado. Ainda não foi enviado um formulário real da Meta para testar a entrada de um lead. Nenhum anúncio ou publicação foi criado por esta atualização.
