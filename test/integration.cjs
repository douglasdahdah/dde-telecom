"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { Pool } = require("pg"),
  bcrypt = require("bcrypt");
const { createApp } = require("../src/server");
const { loadConfig } = require("../src/config");
const localUrl = process.env.TEST_DATABASE_URL;

test(
  "regressões HTTP e PostgreSQL em base descartável local",
  { skip: !localUrl },
  async (t) => {
    const parsed = new URL(localUrl);
    assert.ok(
      ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname),
      "TEST_DATABASE_URL deve apontar para loopback",
    );
    assert.equal(
      parsed.pathname,
      "/postgres",
      "Use a base postgres de uma instância exclusiva de testes",
    );
    const control = new Pool({
      connectionString: localUrl,
      connectionTimeoutMillis: 3000,
    });
    const dbName = "dde_test_" + crypto.randomBytes(8).toString("hex");
    assert.match(dbName, /^dde_test_[a-f0-9]{16}$/);
    await control.query(`CREATE DATABASE ${dbName}`);
    parsed.pathname = "/" + dbName;
    const pool = new Pool({ connectionString: parsed.toString(), max: 10 });
    let server;
    t.after(async () => {
      if (server) await new Promise((r) => server.close(r));
      await pool.end();
      await control.query(`DROP DATABASE ${dbName}`);
      await control.end();
    });
    const schema = fs.readFileSync(
      path.join(__dirname, "../sql/schema.sql"),
      "utf8",
    );
    await t.test("migração em banco vazio e reaplicação", async () => {
      await pool.query(schema);
      await pool.query(schema);
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::integer AS n FROM schema_migrations WHERE versao='11.0.1'",
          )
        ).rows[0].n,
        1,
      );
    });
    const password = crypto.randomBytes(20).toString("hex"),
      hash = await bcrypt.hash(password, 12);
    await pool.query(
      "INSERT INTO usuarios(nome,email,senha_hash,perfil) VALUES('Admin','admin@example.invalid',$1,'admin')",
      [hash],
    );
    const config = loadConfig({
      JWT_SECRET: crypto.randomBytes(48).toString("hex"),
      FRONTEND_URL: "https://test.example.invalid",
    });
    server = createApp(pool, config).listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    const base = "http://127.0.0.1:" + server.address().port;
    async function req(method, url, body, token, headers = {}) {
      const r = await fetch(base + url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
          ...headers,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const text = await r.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
      return { status: r.status, data, headers: r.headers };
    }
    let admin, s1, s2, leadId, planId;
    const login = async (email) =>
      req("POST", "/api/auth/login", { email, senha: password });
    await t.test("login admin e prontidão do banco", async () => {
      const r = await login("admin@example.invalid");
      assert.equal(r.status, 200);
      admin = r.data.token;
      assert.equal((await req("GET", "/ready")).status, 200);
    });
    await t.test(
      "pré-validação somente leitura e migração manual protegida",
      async () => {
        const { spawnSync } = require("node:child_process");
        const env = {
          ...process.env,
          NODE_ENV: "development",
          DATABASE_URL: parsed.toString(),
          DATABASE_URL_UNPOOLED: parsed.toString(),
          ALLOW_SCHEMA_MIGRATION: "",
        };
        let result = spawnSync(
          process.execPath,
          [path.join(__dirname, "../scripts/preflight.js")],
          { env, encoding: "utf8" },
        );
        assert.equal(result.status, 0, result.stderr);
        const summary = JSON.parse(result.stdout);
        assert.equal(summary.hashesInvalidos, 0);
        assert.equal(summary.administradoresAtivos, 1);
        result = spawnSync(
          process.execPath,
          [path.join(__dirname, "../scripts/migrate.js")],
          { env, encoding: "utf8" },
        );
        assert.equal(result.status, 1);
        result = spawnSync(
          process.execPath,
          [path.join(__dirname, "../scripts/migrate.js")],
          {
            env: { ...env, ALLOW_SCHEMA_MIGRATION: "11.0.1" },
            encoding: "utf8",
          },
        );
        assert.equal(result.status, 0, result.stderr);
      },
    );
    await t.test(
      "bloqueia rebaixamento do último admin e mantém captação",
      async () => {
        const r = await req(
          "PATCH",
          "/api/usuarios/1",
          { nome: "Admin", email: "admin@example.invalid", perfil: "vendedor" },
          admin,
        );
        assert.equal(r.status, 409);
        assert.equal(
          (
            await pool.query(
              "SELECT count(*)::integer AS n FROM usuarios WHERE perfil='admin' AND ativo",
            )
          ).rows[0].n,
          1,
        );
      },
    );
    await t.test(
      "criação de vendedores, mínimo de senha e e-mail único",
      async () => {
        assert.equal(
          (
            await req(
              "POST",
              "/api/usuarios",
              {
                nome: "Short",
                email: "short@example.invalid",
                senha: "12345678",
              },
              admin,
            )
          ).status,
          400,
        );
        for (const n of [1, 2])
          assert.equal(
            (
              await req(
                "POST",
                "/api/usuarios",
                {
                  nome: "Vendedor " + n,
                  email: `s${n}@example.invalid`,
                  senha: password,
                },
                admin,
              )
            ).status,
            201,
          );
        assert.equal(
          (
            await req(
              "POST",
              "/api/usuarios",
              {
                nome: "Duplicado",
                email: "S1@EXAMPLE.INVALID",
                senha: password,
              },
              admin,
            )
          ).status,
          409,
        );
        s1 = (await login("s1@example.invalid")).data.token;
        s2 = (await login("s2@example.invalid")).data.token;
        assert.ok(s1 && s2);
      },
    );
    await t.test("RBAC e ausência de vazamento do hash", async () => {
      assert.equal((await req("GET", "/api/leads")).status, 401);
      assert.equal(
        (await req("GET", "/api/usuarios", undefined, s1)).status,
        403,
      );
      assert.equal(
        (await req("POST", "/api/admin/planos", { nome: "x" }, s1)).status,
        403,
      );
      assert.ok(
        !(await req("GET", "/api/usuarios", undefined, admin)).data.some(
          (u) => "senha_hash" in u,
        ),
      );
    });
    await t.test(
      "validação pública e vendedor rejeita entradas inválidas sem 500",
      async () => {
        for (const payload of [
          { telefone: "abc" },
          { nome: "A".repeat(151) },
          { nome: {} },
          { email: "errado" },
          { estado: "XX" },
          { cep: "123" },
        ])
          assert.equal(
            (
              await req("POST", "/api/leads", {
                nome: "Teste",
                telefone: "34999990000",
                ...payload,
              })
            ).status,
            400,
          );
        assert.equal(
          (
            await req(
              "POST",
              "/api/vendedor/leads",
              { nome: "Teste", telefone: "abc", interesse: "Fibra" },
              s1,
            )
          ).status,
          400,
        );
      },
    );
    let publicId;
    await t.test(
      "lead público recebe admin, sem devolver PII ou aceitar atribuição forjada",
      async () => {
        const r = await req(
          "POST",
          "/api/leads",
          { nome: "Publico", telefone: "34999990001", vendedor_id: 3 },
          undefined,
          { Origin: "https://test.example.invalid" },
        );
        assert.equal(r.status, 201);
        assert.ok(!r.data.lead);
        publicId = r.data.protocolo;
        assert.equal(
          (
            await pool.query("SELECT vendedor_id FROM leads WHERE id=$1", [
              publicId,
            ])
          ).rows[0].vendedor_id,
          1,
        );
        assert.equal(
          r.headers.get("access-control-allow-origin"),
          "https://test.example.invalid",
        );
      },
    );
    await t.test("idempotência concorrente e payload divergente", async () => {
      const headers = { "Idempotency-Key": crypto.randomUUID() },
        body = { nome: "Reenvio", telefone: "34999990002" };
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          req("POST", "/api/leads", body, undefined, headers),
        ),
      );
      assert.equal(results.filter((r) => r.status === 201).length, 1);
      assert.equal(results.filter((r) => r.status === 200).length, 3);
      assert.equal(new Set(results.map((r) => r.data.protocolo)).size, 1);
      assert.equal(
        (
          await req(
            "POST",
            "/api/leads",
            { ...body, nome: "Outro" },
            undefined,
            headers,
          )
        ).status,
        409,
      );
      assert.equal((await req("POST", "/api/leads", body)).status, 200);
    });
    await t.test(
      "seller usa identidade autenticada e isola leads",
      async () => {
        const r = await req(
          "POST",
          "/api/vendedor/leads",
          {
            nome: "Do vendedor",
            telefone: "34999990003",
            interesse: "Fibra",
            vendedor_id: 3,
          },
          s1,
        );
        assert.equal(r.status, 201);
        leadId = r.data.lead.id;
        assert.equal(r.data.lead.vendedor_id, 2);
        assert.equal(
          (await req("GET", "/api/leads", undefined, s2)).data.length,
          0,
        );
        assert.equal(
          (await req("GET", "/api/leads/" + leadId, undefined, s2)).status,
          404,
        );
        assert.equal(
          (
            await req(
              "PATCH",
              `/api/leads/${leadId}/status`,
              { status: "convertido" },
              s2,
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await req(
              "PATCH",
              `/api/leads/${leadId}/status`,
              { status: "atendimento" },
              s1,
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await req(
              "PATCH",
              `/api/leads/${leadId}/vendedor`,
              { vendedor_id: 3 },
              s1,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await req(
              "PATCH",
              `/api/leads/${leadId}/comercial`,
              { observacoes: "x", vendedor_id: 3 },
              s1,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await req(
              "PATCH",
              `/api/leads/${leadId}/comercial`,
              { observacoes: "Contato\nretornar amanhã" },
              s1,
            )
          ).status,
          200,
        );
      },
    );
    await t.test(
      "atribuição troca acesso e nome acompanha renomeação",
      async () => {
        assert.equal(
          (
            await req(
              "PATCH",
              `/api/leads/${leadId}/vendedor`,
              { vendedor_id: 3 },
              admin,
            )
          ).status,
          200,
        );
        assert.equal(
          (await req("GET", "/api/leads/" + leadId, undefined, s1)).status,
          404,
        );
        assert.equal(
          (await req("GET", "/api/leads/" + leadId, undefined, s2)).status,
          200,
        );
        assert.equal(
          (
            await req(
              "PATCH",
              "/api/usuarios/3",
              {
                nome: "Nome novo",
                email: "s2@example.invalid",
                perfil: "vendedor",
              },
              admin,
            )
          ).status,
          200,
        );
        assert.equal(
          (await req("GET", "/api/leads/" + leadId, undefined, s2)).data
            .vendedor,
          "Nome novo",
        );
      },
    );
    await t.test(
      "planos completos: promoção, preservação no PATCH, expiração e inativo",
      async () => {
        const r = await req(
          "POST",
          "/api/admin/planos",
          {
            nome: "Fibra",
            tipo: "internet",
            preco: 99.9,
            preco_original: 129.9,
            promocional: true,
            oferta_valida_ate: "2099-12-31",
            destaque: true,
            selo: "Recomendado",
            beneficios: ["1", "2", "3", "4"],
            observacoes: "Condição real",
          },
          admin,
        );
        assert.equal(r.status, 201);
        planId = r.data.plano.id;
        assert.equal(
          (
            await req(
              "PATCH",
              "/api/admin/planos/" + planId,
              { nome: "Fibra atualizada" },
              admin,
            )
          ).status,
          200,
        );
        let p = (await req("GET", "/api/planos")).data[0];
        assert.equal(p.nome, "Fibra atualizada");
        assert.equal(p.destaque, true);
        assert.equal(p.beneficios.length, 4);
        assert.equal(p.promocional, true);
        assert.equal(p.oferta_valida_ate, "2099-12-31");
        assert.equal(p.observacoes, "Condição real");
        assert.equal(
          (
            await req(
              "PATCH",
              "/api/admin/planos/" + planId,
              { oferta_valida_ate: "2000-01-01" },
              admin,
            )
          ).status,
          200,
        );
        p = (await req("GET", "/api/planos")).data[0];
        assert.equal(Number(p.preco), 129.9);
        assert.equal(p.promocional, false);
        assert.equal(
          (
            await req(
              "PATCH",
              `/api/admin/planos/${planId}/status`,
              { ativo: false },
              admin,
            )
          ).status,
          200,
        );
        assert.equal((await req("GET", "/api/planos")).data.length, 0);
        assert.equal(
          (
            await req(
              "POST",
              "/api/admin/planos",
              { nome: "Erro", tipo: "internet", preco: "" },
              admin,
            )
          ).status,
          400,
        );
      },
    );
    await t.test("CORS, CSP, JSON e compressão", async () => {
      assert.equal(
        (
          await req(
            "POST",
            "/api/leads",
            { nome: "Outro", telefone: "34999990000" },
            undefined,
            { Origin: "https://evil.example.invalid" },
          )
        ).status,
        403,
      );
      const home = await req("GET", "/");
      assert.equal(home.status, 200);
      assert.match(
        home.headers.get("content-security-policy"),
        /script-src 'self'/,
      );
      assert.equal((await req("POST", "/api/leads", [])).status, 400);
      const invalid = await fetch(base + "/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{invalid",
      });
      assert.equal(invalid.status, 400);
      const compressed = await fetch(base + "/api/leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Encoding": "gzip",
        },
        body: require("node:zlib").gzipSync(Buffer.from("{}")),
      });
      assert.equal(compressed.status, 415);
    });
    await t.test(
      "redefinição e desativação invalidam tokens existentes",
      async () => {
        assert.equal(
          (
            await req(
              "PATCH",
              "/api/usuarios/2/senha",
              { senha: crypto.randomBytes(20).toString("hex") },
              admin,
            )
          ).status,
          200,
        );
        assert.equal(
          (await req("GET", "/api/leads", undefined, s1)).status,
          401,
        );
        assert.equal(
          (
            await req(
              "PATCH",
              "/api/usuarios/3/status",
              { ativo: false },
              admin,
            )
          ).status,
          200,
        );
        assert.equal(
          (await req("GET", "/api/leads", undefined, s2)).status,
          401,
        );
        assert.equal(
          (
            await req(
              "PATCH",
              "/api/usuarios/1/status",
              { ativo: false },
              admin,
            )
          ).status,
          400,
        );
      },
    );
    await t.test(
      "duas mudanças simultâneas não removem todos os administradores",
      async () => {
        const admin2Id = (
          await pool.query(
            "INSERT INTO usuarios(nome,email,senha_hash,perfil) VALUES('Admin2','admin2@example.invalid',$1,'admin') RETURNING id",
            [hash],
          )
        ).rows[0].id;
        const admin2 = (await login("admin2@example.invalid")).data.token;
        const r = await Promise.all([
          req(
            "PATCH",
            "/api/usuarios/1",
            {
              nome: "Admin",
              email: "admin@example.invalid",
              perfil: "vendedor",
            },
            admin,
          ),
          req(
            "PATCH",
            "/api/usuarios/" + admin2Id,
            {
              nome: "Admin2",
              email: "admin2@example.invalid",
              perfil: "vendedor",
            },
            admin2,
          ),
        ]);
        assert.equal(r.filter((x) => x.status === 200).length, 1);
        assert.equal(r.filter((x) => x.status === 409).length, 1);
        assert.equal(
          (
            await pool.query(
              "SELECT count(*)::integer AS n FROM usuarios WHERE perfil='admin' AND ativo",
            )
          ).rows[0].n,
          1,
        );
      },
    );
    await t.test("limites de login e captação respondem 429", async () => {
      let r;
      for (let i = 0; i < 11; i++)
        r = await req("POST", "/api/auth/login", {
          email: "nobody@example.invalid",
          senha: "errada",
        });
      assert.equal(r.status, 429);
      for (let i = 0; i < 31; i++) r = await req("POST", "/api/leads", {});
      assert.equal(r.status, 429);
    });
    await t.test("prontidão informa indisponibilidade do esquema", async () => {
      await pool.query(
        "ALTER TABLE lead_requisicoes RENAME TO lead_requisicoes_test",
      );
      assert.equal((await req("GET", "/ready")).status, 503);
      await pool.query(
        "ALTER TABLE lead_requisicoes_test RENAME TO lead_requisicoes",
      );
    });
    await t.test(
      "migração preserva dados válidos e recusa duplicatas e órfãos sem apagar registros",
      async () => {
        for (const scenario of ["valid", "duplicate", "orphan"]) {
          const legacyName =
            "dde_test_" + crypto.randomBytes(8).toString("hex");
          assert.match(legacyName, /^dde_test_[a-f0-9]{16}$/);
          await control.query(`CREATE DATABASE ${legacyName}`);
          const url = new URL(localUrl);
          url.pathname = "/" + legacyName;
          const legacy = new Pool({ connectionString: url.toString(), max: 1 });
          try {
            await legacy.query(
              "CREATE TABLE usuarios(id serial PRIMARY KEY,nome varchar(120),email varchar(150),senha_hash varchar(255))",
            );
            await legacy.query(
              "INSERT INTO usuarios(nome,email,senha_hash) VALUES('Legado',' SAME@example.invalid ',$1)",
              [hash],
            );
            await legacy.query(
              "CREATE TABLE leads(id serial PRIMARY KEY,nome varchar(150),telefone varchar(20),vendedor_id integer)",
            );
            await legacy.query(
              "INSERT INTO leads(nome,telefone,vendedor_id) VALUES('Contato preservado','34999990000',$1)",
              [scenario === "orphan" ? 999 : 1],
            );
            if (scenario === "duplicate")
              await legacy.query(
                "INSERT INTO usuarios(nome,email,senha_hash) VALUES('Duplicado','same@example.invalid',$1)",
                [hash],
              );
            if (scenario === "valid") {
              await legacy.query(schema);
              await legacy.query(schema);
              assert.equal(
                (await legacy.query("SELECT email FROM usuarios")).rows[0]
                  .email,
                "same@example.invalid",
              );
              assert.equal(
                (await legacy.query("SELECT nome FROM leads")).rows[0].nome,
                "Contato preservado",
              );
              assert.equal(
                (
                  await legacy.query(
                    "SELECT convalidated FROM pg_constraint WHERE conname='leads_vendedor_id_fkey'",
                  )
                ).rows[0].convalidated,
                true,
              );
            } else {
              await assert.rejects(
                legacy.query(schema),
                new RegExp(
                  scenario === "duplicate"
                    ? "e-mails duplicados"
                    : "vendedor inexistente",
                ),
              );
              await legacy.query("ROLLBACK");
              assert.equal(
                (await legacy.query("SELECT count(*)::integer AS n FROM leads"))
                  .rows[0].n,
                1,
              );
              assert.equal(
                (
                  await legacy.query(
                    "SELECT count(*)::integer AS n FROM usuarios",
                  )
                ).rows[0].n,
                scenario === "duplicate" ? 2 : 1,
              );
            }
          } finally {
            await legacy.end();
            await control.query(`DROP DATABASE ${legacyName}`);
          }
        }
      },
    );
  },
);
