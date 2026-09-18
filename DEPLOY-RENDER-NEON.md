# DDE Telecom — publicação gratuita

## Arquitetura recomendada
- Aplicação Node.js/Express: Render Free Web Service
- PostgreSQL: Neon Free
- Frontend: servido pelo próprio Express
- HTTPS: fornecido pelo Render

## Antes de publicar
Este pacote NÃO contém `.env` nem senhas locais.
Nunca envie `.env` ao GitHub.

## 1. Banco no Neon
1. Crie um projeto PostgreSQL.
2. Copie a `DATABASE_URL`.
3. Abra o SQL Editor do Neon.
4. Execute `sql/schema.sql`.
5. Migre os dados locais necessários (planos, usuário administrador e demais registros).

## 2. GitHub
Crie um repositório privado e envie este projeto.
O `.gitignore` já exclui `.env` e `node_modules`.

## 3. Render
1. New > Web Service.
2. Conecte o repositório.
3. Plano: Free.
4. Build Command: `npm ci --omit=dev`
5. Start Command: `npm start`
6. Variáveis:
   - NODE_ENV=production
   - DATABASE_URL=<URL copiada do Neon>
   - JWT_SECRET=<segredo longo e aleatório>
   - JWT_EXPIRES_IN=8h
   - FRONTEND_URL=https://SEU-SITE.onrender.com
7. Health Check: `/health`

Depois do primeiro deploy, copie a URL final do Render para `FRONTEND_URL`
e faça um novo deploy.

## 4. Teste final
- `/`
- `/health`
- `/api/status`
- Internet / Controle / Pós-pago
- Consulta CEP
- Envio de lead
- `/admin/login.html`
- Login
- Leads
- Alteração de status
- Planos
- WhatsApp

## Observação
Render Free pode suspender o serviço quando fica ocioso; o primeiro acesso
após um período sem uso pode demorar. Para operação comercial contínua,
considere migrar o serviço para um plano pago quando o site entrar em produção.
