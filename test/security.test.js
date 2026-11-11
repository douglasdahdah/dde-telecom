"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const v = require("../src/validation");
const { loadConfig } = require("../src/config");
const secret = crypto.randomBytes(48).toString("hex");

test("configuração recusa segredo fraco e origem de produção ausente/insegura", () => {
  assert.throws(() => loadConfig({ JWT_SECRET: "short" }));
  assert.throws(() =>
    loadConfig({ JWT_SECRET: secret, NODE_ENV: "production" }),
  );
  assert.throws(() =>
    loadConfig({
      JWT_SECRET: secret,
      NODE_ENV: "production",
      FRONTEND_URL: "http://example.invalid",
    }),
  );
  const config = loadConfig({
    JWT_SECRET: secret,
    NODE_ENV: "production",
    RENDER_EXTERNAL_URL: "https://app.example.invalid/",
  });
  assert.equal(config.origins.has("https://app.example.invalid"), true);
  assert.equal(config.origins.has("http://localhost:3000"), false);
});
test("normaliza telefone e CEP sem inventar dados do contato", () => {
  const lead = v.lead({
    nome: " Ana ",
    telefone: "+55 (34) 99999-0000",
    cep: "38400000",
    estado: "mg",
  });
  assert.equal(lead.nome, "Ana");
  assert.equal(lead.telefone, "5534999990000");
  assert.equal(lead.cep, "38400-000");
  assert.equal(lead.estado, "MG");
  assert.equal(v.lead({nome:'Ana',telefone:'34999990000',interesse:'A'.repeat(150)},true).interesse.length,150);
  assert.equal(
    v.lead({ nome: "Ana", telefone: "(34) 3333-0000" }).telefone,
    "553433330000",
  );
});
test("recusa formatos, tipos e comprimentos inválidos dos leads", () => {
  for (const payload of [
    { telefone: "abc" },
    { nome: "A".repeat(151) },
    { nome: {} },
    { email: "invalido" },
    { estado: "XX" },
    { cep: "123" },
    { logradouro: "A".repeat(151) },
    { telefone: "11111111111" },
  ]) {
    assert.throws(
      () => v.lead({ nome: "Ana", telefone: "34999990000", ...payload }),
      { status: 400 },
    );
  }
  assert.throws(() => v.lead({ nome: "Ana", telefone: "34999990000" }, true));
});
test("nova senha exige 12 caracteres e respeita limite em bytes do bcrypt", () => {
  assert.throws(() => v.password("12345678"));
  assert.throws(() => v.password("á".repeat(40)));
  assert.equal(v.password("FraseSegura123!"), "FraseSegura123!");
});
test("planos recusam preço vazio, coerções e promoções incompletas", () => {
  const base = { nome: "Plano", tipo: "internet", preco: 99.9 };
  for (const body of [
    { preco: "" },
    { preco: null },
    { preco: true },
    { preco: 1.234 },
    { ativo: "false" },
    { promocional: true },
    { beneficios: [{}] },
    { oferta_valida_ate: "2026-02-30" },
    { oferta_valida_ate: "0000-01-01" },
  ])
    assert.throws(() => v.plan({ ...base, ...body }));
  const p = v.plan({
    ...base,
    promocional: true,
    preco_original: 120,
    oferta_valida_ate: "2030-12-31",
    beneficios: ["Um", "Dois", "Três", "Quatro"],
  });
  assert.equal(p.beneficios.length, 4);
  assert.equal(p.preco_original, 120);
});
test("cartões respeitam destaque, condições e escapam HTML de cadastro", () => {
  const document = {
    addEventListener() {},
    createElement() {
      return {};
    },
  };
  const context = vm.createContext({ document, console });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../public/js/planos.js"), "utf8"),
    context,
  );
  assert.equal(
    vm.runInContext(
      "identificarDestaque({nome:'600 Mega',destaque:false},1,[{},{}])",
      context,
    ),
    false,
  );
  assert.equal(
    vm.runInContext("identificarDestaque({destaque:true})", context),
    true,
  );
  const html = vm.runInContext(
    `montarCardPlano({nome:'<img src=x onerror=alert(1)>',tipo:'internet',preco:99.9,destaque:true,selo:'<script>',beneficios:['1','2','3','4'],fidelidade_meses:12,observacoes:'<b>Condição</b>',promocional:true,preco_original:120,oferta_valida_ate:'2030-12-31'},0,[]).innerHTML`,
    context,
  );
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("<li>4</li>"));
  assert.ok(html.includes("31/12/2030"));
  assert.ok(html.includes("12 meses"));
  assert.ok(html.includes("&lt;b&gt;Condição&lt;/b&gt;"));
  assert.ok(!html.includes("MAIS CONTRATADO"));
});
