'use strict';

const { createServer } = require('node:http');

const destino = 'https://ddetelecom.onrender.com';
const porta = Number(process.env.PORT || 3000);

const servidor = createServer((requisicao, resposta) => {
    const caminho = requisicao.url?.startsWith('/') ? requisicao.url : '/';
    resposta.writeHead(308, { Location: destino + caminho });
    resposta.end();
});

servidor.listen(porta, '0.0.0.0');
