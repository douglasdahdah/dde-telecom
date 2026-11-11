"use strict";
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config({ quiet: true });
const { loadConfig } = require("./config");
const v = require("./validation");

function createApp(pool, config = loadConfig()) {
  const app = express();
  const wrap = (fn) => async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (e) {
      next(e);
    }
  };
  const fail = (status, message) => {
    const e = new Error(message);
    e.status = status;
    throw e;
  };
  const validId = (x) =>
    /^[1-9]\d*$/.test(String(x)) &&
    Number.isSafeInteger(Number(x)) &&
    Number(x) <= 2147483647;
  const id = (req, res, next) =>
    validId(req.params.id)
      ? next()
      : res.status(400).json({ erro: "ID inválido." });
  const version = (hash) =>
    crypto.createHash("sha256").update(hash).digest("hex");
  const publicUser = ({ id, nome, email, perfil, ativo }) => ({
    id,
    nome,
    email,
    perfil,
    ativo,
  });
  const userFields = "id,nome,email,perfil,ativo,criado_em,atualizado_em";
  async function transaction(fn) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }
  app.disable("x-powered-by");
  if (config.production) app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          scriptSrcAttr: ["'none'"],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
          ],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'", "https://viacep.com.br"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: config.production ? [] : null,
        },
      },
    }),
  );
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || config.origins.has(origin)) return callback(null, true);
        const e = new Error("Origem não autorizada.");
        e.status = 403;
        callback(e);
      },
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
    }),
  );
  app.use(express.json({ limit: "100kb", inflate: false }));
  app.use((req, res, next) => {
    if (
      req.body !== undefined &&
      (req.body === null ||
        typeof req.body !== "object" ||
        Array.isArray(req.body))
    )
      return res.status(400).json({ erro: "Envie um objeto JSON válido." });
    req.body ||= {};
    if (req.path.startsWith("/api/")) res.set("Cache-Control", "no-store");
    next();
  });
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { erro: "Muitas tentativas de login. Aguarde alguns minutos." },
  });
  const leadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { erro: "Muitas solicitações. Aguarde alguns minutos." },
  });
  async function authenticate(req, res, next) {
    try {
      const parts = (req.headers.authorization || "").split(" ");
      if (parts.length !== 2 || parts[0] !== "Bearer")
        fail(401, "Faça login para continuar.");
      let token;
      try {
        token = jwt.verify(parts[1], config.secret, { algorithms: ["HS256"] });
      } catch {
        fail(401, "Sessão inválida ou expirada.");
      }
      if (!validId(token.id)) fail(401, "Sessão inválida.");
      const user = (
        await pool.query(
          "SELECT id,nome,email,perfil,ativo,senha_hash FROM usuarios WHERE id=$1",
          [token.id],
        )
      ).rows[0];
      if (
        !user ||
        !user.ativo ||
        !["admin", "vendedor"].includes(user.perfil) ||
        token.sv !== version(user.senha_hash || "")
      )
        fail(
          401,
          "Conta indisponível ou sessão encerrada. Faça login novamente.",
        );
      req.usuario = publicUser(user);
      next();
    } catch (e) {
      next(e);
    }
  }
  const adminOnly = (req, res, next) =>
    req.usuario.perfil === "admin"
      ? next()
      : res
          .status(403)
          .json({ erro: "Acesso permitido somente para administradores." });
  const sellerOnly = (req, res, next) =>
    req.usuario.perfil === "vendedor"
      ? next()
      : res.status(403).json({ erro: "Acesso exclusivo para vendedores." });
  // Mesma trava do bootstrap; revalida o ator após esperar operações concorrentes.
  async function adminTransaction(actor, fn) {
    return transaction(async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('dde-telecom-initial-admin'))",
      );
      if (
        !(
          await client.query(
            "SELECT id FROM usuarios WHERE id=$1 AND ativo=TRUE AND perfil='admin'",
            [actor],
          )
        ).rowCount
      )
        fail(403, "Sua conta não possui mais acesso administrativo.");
      return fn(client);
    });
  }
  async function preserveAdmin(client, target, role, active) {
    if (
      target.perfil !== "admin" ||
      !target.ativo ||
      (role === "admin" && active)
    )
      return;
    const count = (
      await client.query(
        "SELECT count(*)::integer AS total FROM usuarios WHERE perfil='admin' AND ativo=TRUE",
      )
    ).rows[0].total;
    if (count <= 1) fail(409, "Mantenha pelo menos um administrador ativo.");
  }
  function account(body) {
    const user = {
      nome: v.text(body.nome, "Nome", 120, true),
      email: v.email(body.email, true),
      perfil: body.perfil ?? "vendedor",
    };
    if (!["admin", "vendedor"].includes(user.perfil))
      fail(400, "Perfil inválido.");
    return user;
  }
  app.get("/health", (req, res) =>
    res.json({ status: "ok", empresa: "DDE Telecom" }),
  );
  app.get(
    "/ready",
    wrap(async (req, res) => {
      try {
        const admins = await pool.query(
          "SELECT id FROM usuarios WHERE ativo=TRUE AND perfil='admin' LIMIT 1",
        );
        if (!admins.rowCount)
          return res.status(503).json({ status: "unavailable" });
        const migration = await pool.query(
          "SELECT versao FROM schema_migrations WHERE versao='11.0.1'",
        );
        if (!migration.rowCount)
          return res.status(503).json({ status: "unavailable" });
        await pool.query("SELECT 1 FROM lead_requisicoes LIMIT 1");
        res.json({ status: "ready" });
      } catch {
        res.status(503).json({ status: "unavailable" });
      }
    }),
  );
  app.get(
    "/api/status",
    wrap(async (req, res) => {
      const { rows } = await pool.query("SELECT NOW() AS data_hora");
      res.json({
        status: "online",
        empresa: "DDE Telecom",
        banco: "PostgreSQL conectado",
        dataHora: rows[0].data_hora,
      });
    }),
  );
  app.post(
    "/api/auth/login",
    loginLimiter,
    wrap(async (req, res) => {
      const email = v.email(req.body.email, true);
      if (
        typeof req.body.senha !== "string" ||
        !req.body.senha ||
        Buffer.byteLength(req.body.senha) > 72
      )
        fail(400, "Informe e-mail e senha válidos.");
      const user = (
        await pool.query(
          "SELECT id,nome,email,senha_hash,perfil,ativo FROM usuarios WHERE LOWER(email)=$1",
          [email],
        )
      ).rows[0];
      if (
        !user ||
        !(await bcrypt.compare(req.body.senha, user.senha_hash || ""))
      )
        fail(401, "E-mail ou senha inválidos.");
      if (!user.ativo || !["admin", "vendedor"].includes(user.perfil))
        fail(403, "Conta indisponível.");
      const token = jwt.sign(
        { id: user.id, sv: version(user.senha_hash) },
        config.secret,
        { algorithm: "HS256", expiresIn: config.expiresIn },
      );
      res.json({
        mensagem: "Login realizado com sucesso.",
        token,
        usuario: publicUser(user),
      });
    }),
  );
  app.get("/api/auth/me", authenticate, (req, res) =>
    res.json({ usuario: req.usuario }),
  );
  app.get("/api/vendedor/me", authenticate, sellerOnly, (req, res) =>
    res.json({ usuario: req.usuario }),
  );
  app.get(
    "/api/usuarios",
    authenticate,
    adminOnly,
    wrap(async (req, res) =>
      res.json(
        (
          await pool.query(
            `SELECT ${userFields} FROM usuarios ORDER BY perfil,nome`,
          )
        ).rows,
      ),
    ),
  );
  app.post(
    "/api/usuarios",
    authenticate,
    adminOnly,
    wrap(async (req, res) => {
      const user = account(req.body),
        hash = await bcrypt.hash(v.password(req.body.senha), 12);
      const result = await adminTransaction(
        req.usuario.id,
        async (c) =>
          (
            await c.query(
              `INSERT INTO usuarios(nome,email,senha_hash,perfil) VALUES($1,$2,$3,$4) RETURNING ${userFields}`,
              [user.nome, user.email, hash, user.perfil],
            )
          ).rows[0],
      );
      res
        .status(201)
        .json({ mensagem: "Usuário cadastrado.", usuario: result });
    }),
  );
  app.patch(
    "/api/usuarios/:id",
    authenticate,
    adminOnly,
    id,
    wrap(async (req, res) => {
      const user = account(req.body);
      const result = await adminTransaction(req.usuario.id, async (c) => {
        const target = (
          await c.query("SELECT * FROM usuarios WHERE id=$1 FOR UPDATE", [
            req.params.id,
          ])
        ).rows[0];
        if (!target) fail(404, "Usuário não encontrado.");
        await preserveAdmin(c, target, user.perfil, target.ativo);
        const result = (
          await c.query(
            `UPDATE usuarios SET nome=$1,email=$2,perfil=$3,atualizado_em=NOW() WHERE id=$4 RETURNING ${userFields}`,
            [user.nome, user.email, user.perfil, req.params.id],
          )
        ).rows[0];
        await c.query("UPDATE leads SET vendedor=$1 WHERE vendedor_id=$2", [
          user.nome,
          req.params.id,
        ]);
        return result;
      });
      res.json({ mensagem: "Usuário atualizado.", usuario: result });
    }),
  );
  app.patch(
    ["/api/usuarios/:id/status", "/api/usuarios/:id/ativo"],
    authenticate,
    adminOnly,
    id,
    wrap(async (req, res) => {
      if (typeof req.body.ativo !== "boolean") fail(400, "Status inválido.");
      if (Number(req.params.id) === req.usuario.id && !req.body.ativo)
        fail(400, "Você não pode desativar o próprio usuário.");
      const result = await adminTransaction(req.usuario.id, async (c) => {
        const target = (
          await c.query("SELECT * FROM usuarios WHERE id=$1 FOR UPDATE", [
            req.params.id,
          ])
        ).rows[0];
        if (!target) fail(404, "Usuário não encontrado.");
        await preserveAdmin(c, target, target.perfil, req.body.ativo);
        return (
          await c.query(
            `UPDATE usuarios SET ativo=$1,atualizado_em=NOW() WHERE id=$2 RETURNING ${userFields}`,
            [req.body.ativo, req.params.id],
          )
        ).rows[0];
      });
      res.json({ mensagem: "Status atualizado.", usuario: result });
    }),
  );
  app.patch(
    "/api/usuarios/:id/senha",
    authenticate,
    adminOnly,
    id,
    wrap(async (req, res) => {
      const hash = await bcrypt.hash(v.password(req.body.senha), 12);
      await adminTransaction(req.usuario.id, async (c) => {
        if (
          !(
            await c.query(
              "UPDATE usuarios SET senha_hash=$1,atualizado_em=NOW() WHERE id=$2 RETURNING id",
              [hash, req.params.id],
            )
          ).rowCount
        )
          fail(404, "Usuário não encontrado.");
      });
      res.json({
        mensagem: "Senha redefinida. As sessões anteriores foram encerradas.",
      });
    }),
  );
  const planOrder =
    "CASE tipo WHEN 'internet' THEN 1 WHEN 'controle' THEN 2 WHEN 'pos' THEN 3 ELSE 4 END,ordem,preco,id";
  app.get(
    "/api/planos",
    wrap(async (req, res) =>
      res.json(
        (
          await pool.query(`SELECT id,nome,tipo,velocidade,franquia,
        CASE WHEN promocional AND oferta_valida_ate < (NOW() AT TIME ZONE 'America/Sao_Paulo')::date THEN preco_original ELSE preco END AS preco,
        descricao,destaque,selo,ordem,beneficios,fidelidade_meses,preco_original,
        (promocional AND oferta_valida_ate >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::date) AS promocional,
        to_char(oferta_valida_ate,'YYYY-MM-DD') AS oferta_valida_ate,observacoes FROM planos WHERE ativo=TRUE ORDER BY ${planOrder}`)
        ).rows,
      ),
    ),
  );
  app.get(
    "/api/admin/planos",
    authenticate,
    adminOnly,
    wrap(async (req, res) =>
      res.json(
        (
          await pool.query(
            `SELECT *,to_char(oferta_valida_ate,'YYYY-MM-DD') AS oferta_valida_ate FROM planos ORDER BY ${planOrder}`,
          )
        ).rows,
      ),
    ),
  );
  app.get(
    "/api/admin/planos/:id",
    authenticate,
    adminOnly,
    id,
    wrap(async (req, res) => {
      const { rows } = await pool.query(
        "SELECT *,to_char(oferta_valida_ate,'YYYY-MM-DD') AS oferta_valida_ate FROM planos WHERE id=$1",
        [req.params.id],
      );
      if (!rows.length) fail(404, "Plano não encontrado.");
      res.json(rows[0]);
    }),
  );
  const columns = [
    "nome",
    "tipo",
    "velocidade",
    "franquia",
    "preco",
    "descricao",
    "ativo",
    "destaque",
    "selo",
    "ordem",
    "fidelidade_meses",
    "preco_original",
    "promocional",
    "oferta_valida_ate",
    "observacoes",
    "beneficios",
  ];
  async function savePlan(req, res) {
    let body = req.body;
    if (req.params.id) {
      const existing = (
        await pool.query(
          "SELECT *,to_char(oferta_valida_ate,'YYYY-MM-DD') AS oferta_valida_ate FROM planos WHERE id=$1",
          [req.params.id],
        )
      ).rows[0];
      if (!existing) fail(404, "Plano não encontrado.");
      body = { ...existing, ...body };
    }
    const plan = v.plan(body),
      values = columns.map((c) =>
        c === "beneficios" ? JSON.stringify(plan[c]) : plan[c],
      );
    const result = req.params.id
      ? await pool.query(
          `UPDATE planos SET ${columns.map((c, i) => `${c}=$${i + 1}`).join(",")} WHERE id=$${values.length + 1} RETURNING *`,
          [...values, req.params.id],
        )
      : await pool.query(
          `INSERT INTO planos(${columns.join(",")}) VALUES(${values.map((_, i) => `$${i + 1}`).join(",")}) RETURNING *`,
          values,
        );
    if (!result.rowCount) fail(404, "Plano não encontrado.");
    res
      .status(req.params.id ? 200 : 201)
      .json({ mensagem: "Plano salvo.", plano: result.rows[0] });
  }
  app.post("/api/admin/planos", authenticate, adminOnly, wrap(savePlan));
  app.patch(
    "/api/admin/planos/:id",
    authenticate,
    adminOnly,
    id,
    wrap(savePlan),
  );
  app.patch(
    "/api/admin/planos/:id/status",
    authenticate,
    adminOnly,
    id,
    wrap(async (req, res) => {
      if (typeof req.body.ativo !== "boolean") fail(400, "Status inválido.");
      const { rows } = await pool.query(
        "UPDATE planos SET ativo=$1 WHERE id=$2 RETURNING *",
        [req.body.ativo, req.params.id],
      );
      if (!rows.length) fail(404, "Plano não encontrado.");
      res.json({ mensagem: "Status atualizado.", plano: rows[0] });
    }),
  );
  app.delete(
    "/api/admin/planos/:id",
    authenticate,
    adminOnly,
    id,
    wrap(async (req, res) => {
      const { rows } = await pool.query(
        "DELETE FROM planos WHERE id=$1 RETURNING id,nome,tipo",
        [req.params.id],
      );
      if (!rows.length) fail(404, "Plano não encontrado.");
      res.json({ mensagem: "Plano excluído.", plano: rows[0] });
    }),
  );

  async function createLead(req, res) {
    const seller = req.usuario?.perfil === "vendedor",
      data = v.lead(req.body, seller),
      rawKey = req.get("Idempotency-Key");
    if (rawKey && !/^[a-zA-Z0-9_-]{16,100}$/.test(rawKey))
      fail(400, "Chave de solicitação inválida.");
    const scope = seller ? `vendedor:${req.usuario.id}` : "site";
    const fingerprint = crypto
        .createHash("sha256")
        .update(JSON.stringify({ scope, data }))
        .digest("hex"),
      key = rawKey ? `${scope}:${rawKey}` : null;
    const result = await transaction(async (c) => {
      if (key)
        await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [key]);
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        fingerprint,
      ]);
      if (key) {
        const saved = (
          await c.query(
            "SELECT payload_hash,lead_id FROM lead_requisicoes WHERE chave=$1",
            [key],
          )
        ).rows[0];
        if (saved) {
          if (saved.payload_hash !== fingerprint)
            fail(409, "Esta chave já foi usada para outra solicitação.");
          const lead = (
            await c.query("SELECT * FROM leads WHERE id=$1", [saved.lead_id])
          ).rows[0];
          if (lead && (!seller || lead.vendedor_id === req.usuario.id))
            return { lead, duplicate: true };
          fail(409, "Solicitação já processada. Consulte o administrador.");
        }
      }
      const duplicate = (
        await c.query(
          "SELECT l.* FROM lead_requisicoes r JOIN leads l ON l.id=r.lead_id WHERE r.payload_hash=$1 AND r.criado_em>NOW()-INTERVAL '5 minutes' ORDER BY r.criado_em DESC LIMIT 1",
          [fingerprint],
        )
      ).rows[0];
      if (duplicate && seller && duplicate.vendedor_id !== req.usuario.id)
        fail(409, "Solicitação já processada. Consulte o administrador.");
      const owner = seller
        ? (
            await c.query(
              "SELECT id,nome FROM usuarios WHERE id=$1 AND ativo=TRUE AND perfil='vendedor' FOR SHARE",
              [req.usuario.id],
            )
          ).rows[0]
        : (
            await c.query(
              "SELECT id,nome FROM usuarios WHERE perfil='admin' AND ativo=TRUE ORDER BY id LIMIT 1 FOR SHARE",
            )
          ).rows[0];
      if (!owner)
        fail(
          seller ? 403 : 503,
          "Atendimento temporariamente indisponível. Tente novamente mais tarde.",
        );
      let lead = duplicate;
      if (!lead) {
        const fields = Object.keys(data),
          values = [
            ...Object.values(data),
            owner.nome,
            owner.id,
            seller ? "vendedor" : "site",
          ];
        lead = (
          await c.query(
            `INSERT INTO leads(${fields.join(",")},vendedor,vendedor_id,origem) VALUES(${values.map((_, i) => `$${i + 1}`).join(",")}) RETURNING *`,
            values,
          )
        ).rows[0];
      }
      await c.query(
        "INSERT INTO lead_requisicoes(chave,payload_hash,lead_id) VALUES($1,$2,$3)",
        [key || `${scope}:${crypto.randomUUID()}`, fingerprint, lead.id],
      );
      return { lead, duplicate: !!duplicate };
    });
    // Rota pública não devolve PII nem dados internos de atribuição.
    res.status(result.duplicate ? 200 : 201).json({
      mensagem: "Solicitação recebida com sucesso.",
      duplicado: result.duplicate,
      ...(seller
        ? {
            lead: result.lead,
            vendedor: { id: req.usuario.id, nome: req.usuario.nome },
          }
        : { protocolo: result.lead.id }),
    });
  }
  app.post("/api/leads", leadLimiter, wrap(createLead));
  app.post(
    "/api/vendedor/leads",
    authenticate,
    sellerOnly,
    leadLimiter,
    wrap(createLead),
  );
  app.get(
    "/api/leads",
    authenticate,
    wrap(async (req, res) => {
      const admin = req.usuario.perfil === "admin";
      res.json(
        (
          await pool.query(
            `SELECT * FROM leads ${admin ? "" : "WHERE vendedor_id=$1"} ORDER BY id DESC`,
            admin ? [] : [req.usuario.id],
          )
        ).rows,
      );
    }),
  );
  app.get(
    "/api/leads/:id",
    authenticate,
    id,
    wrap(async (req, res) => {
      const admin = req.usuario.perfil === "admin";
      const { rows } = await pool.query(
        `SELECT * FROM leads WHERE id=$1 ${admin ? "" : "AND vendedor_id=$2"}`,
        admin ? [req.params.id] : [req.params.id, req.usuario.id],
      );
      if (!rows.length) fail(404, "Lead não encontrado ou sem permissão.");
      res.json(rows[0]);
    }),
  );
  app.patch(
    "/api/leads/:id/status",
    authenticate,
    id,
    wrap(async (req, res) => {
      if (
        !["novo", "atendimento", "convertido", "nao_convertido"].includes(
          req.body.status,
        )
      )
        fail(400, "Status inválido.");
      const admin = req.usuario.perfil === "admin",
        values = [req.body.status, req.body.status !== "novo", req.params.id];
      if (!admin) values.push(req.usuario.id);
      const { rows } = await pool.query(
        `UPDATE leads SET status=$1,ultimo_contato=CASE WHEN $2::boolean THEN NOW() ELSE ultimo_contato END WHERE id=$3 ${admin ? "" : "AND vendedor_id=$4"} RETURNING *`,
        values,
      );
      if (!rows.length) fail(404, "Lead não encontrado ou sem permissão.");
      res.json({ mensagem: "Status atualizado.", lead: rows[0] });
    }),
  );
  app.patch(
    "/api/leads/:id/comercial",
    authenticate,
    id,
    wrap(async (req, res) => {
      if (
        Object.hasOwn(req.body, "vendedor") ||
        Object.hasOwn(req.body, "vendedor_id")
      )
        fail(403, "Use a atribuição de responsável do administrador.");
      if (typeof req.body.observacoes !== "string")
        fail(400, "Informe as observações.");
      const observations = v.longText(
          req.body.observacoes,
          "Observações",
          20000,
        ),
        admin = req.usuario.perfil === "admin";
      const { rows } = await pool.query(
        `UPDATE leads SET observacoes=$1,ultimo_contato=NOW() WHERE id=$2 ${admin ? "" : "AND vendedor_id=$3"} RETURNING *`,
        admin
          ? [observations, req.params.id]
          : [observations, req.params.id, req.usuario.id],
      );
      if (!rows.length) fail(404, "Lead não encontrado ou sem permissão.");
      res.json({ mensagem: "Acompanhamento salvo.", lead: rows[0] });
    }),
  );
  app.patch(
    "/api/leads/:id/vendedor",
    authenticate,
    adminOnly,
    id,
    wrap(async (req, res) => {
      if (!validId(req.body.vendedor_id))
        fail(400, "Selecione um responsável válido.");
      const lead = await adminTransaction(req.usuario.id, async (c) => {
        const owner = (
          await c.query(
            "SELECT id,nome FROM usuarios WHERE id=$1 AND ativo=TRUE AND perfil IN ('admin','vendedor') FOR SHARE",
            [req.body.vendedor_id],
          )
        ).rows[0];
        if (!owner) fail(400, "Responsável não encontrado ou desativado.");
        const { rows } = await c.query(
          "UPDATE leads SET vendedor_id=$1,vendedor=$2 WHERE id=$3 RETURNING *",
          [owner.id, owner.nome, req.params.id],
        );
        if (!rows.length) fail(404, "Lead não encontrado.");
        return rows[0];
      });
      res.json({ mensagem: "Responsável atualizado.", lead });
    }),
  );
  app.use("/api", (req, res) =>
    res.status(404).json({ erro: "Recurso não encontrado." }),
  );
  app.use(express.static(path.join(__dirname, "..", "public")));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const mapped = {
      23505: [409, "Este cadastro já existe."],
      23503: [409, "Este registro possui vínculos ou referência inválida."],
      22001: [400, "Um campo excedeu o tamanho permitido."],
      "22P02": [400, "Valor inválido."],
      23514: [400, "Dados incompatíveis com as regras do cadastro."],
    }[error.code];
    const status = mapped?.[0] || error.status || 500;
    if (status >= 500)
      console.error("Falha na operação:", error.code || "internal");
    res.status(status).json({
      erro:
        mapped?.[1] ||
        (status >= 500
          ? "Não foi possível concluir a operação."
          : error.type === "entity.parse.failed"
            ? "JSON inválido."
            : error.message),
    });
  });
  return app;
}
if (require.main === module) {
  const config = loadConfig(),
    pool = require("./database/db");
  const server = createApp(pool, config).listen(process.env.PORT || 3000, () =>
    console.log("DDE Telecom iniciada."),
  );
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    const timer = setTimeout(() => process.exit(1), 10000);
    timer.unref();
    server.close(async () => {
      await pool.end();
      clearTimeout(timer);
    });
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
module.exports = { createApp };
