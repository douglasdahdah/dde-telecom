# DDE Telecom — Projeto Limpo V10

Versão consolidada do site público + CRM/Admin.

## Rodar
1. Abra o terminal na pasta do projeto.
2. Execute `npm install` (somente se `node_modules` não existir).
3. Execute `npm start`.
4. Abra `http://localhost:3000`.

## Estrutura
- `public/index.html`: site público
- `public/css/site.css`: CSS público consolidado
- `public/js/app.js`: CEP, formulário e leads
- `public/js/planos.js`: planos dinâmicos
- `public/admin/`: CRM/Admin
- `src/server.js`: API/servidor
- `src/database/db.js`: PostgreSQL
- `sql/schema.sql`: estrutura do banco

Backups, versões antigas, CSS duplicado, imagens não usadas, READMEs históricos e `node_modules` foram removidos do pacote.
