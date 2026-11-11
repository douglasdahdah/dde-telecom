"use strict";

function fail(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

function text(value, name, max, required = false) {
  if (value === undefined || value === null || value === "") {
    if (required) fail(`${name} é obrigatório.`);
    return null;
  }
  if (typeof value !== "string") fail(`${name} deve ser texto.`);
  const result = value.trim();
  if (result.length > max || /[\u0000-\u001f\u007f]/.test(result))
    fail(`${name} inválido: limite de ${max} caracteres.`);
  if (required && !result) fail(`${name} é obrigatório.`);
  return result || null;
}

function email(value, required = false) {
  const result = text(value, "E-mail", 150, required)?.toLowerCase() || null;
  if (result && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))
    fail("Informe um e-mail válido.");
  return result;
}

function password(value) {
  if (
    typeof value !== "string" ||
    value.length < 12 ||
    Buffer.byteLength(value, "utf8") > 72
  ) {
    fail("A senha deve ter pelo menos 12 caracteres e no máximo 72 bytes.");
  }
  return value;
}

function lead(body, seller = false) {
  const result = {
    nome: text(body.nome, "Nome", 150, true),
    telefone: text(body.telefone, "Telefone", 30, true),
    email: email(body.email),
    cep: text(body.cep, "CEP", 9),
    logradouro: text(body.logradouro, "Endereço", 150),
    numero: text(body.numero, "Número", 20),
    complemento: text(body.complemento, "Complemento", 100),
    bairro: text(body.bairro, "Bairro", 100),
    cidade: text(body.cidade, "Cidade", 100),
    estado: text(body.estado, "UF", 2)?.toUpperCase() || null,
    interesse: text(body.interesse, "Interesse", 150, seller),
  };
  if (!/^[+\d\s().-]+$/.test(result.telefone))
    fail("Informe um telefone brasileiro válido.");
  let digits = result.telefone.replace(/\D/g, "");
  if (/^55\d{10,11}$/.test(digits)) digits = digits.slice(2);
  if (!/^[1-9]\d[2-9]\d{7,8}$/.test(digits) || /^(\d)\1+$/.test(digits))
    fail("Informe um telefone brasileiro válido com DDD.");
  result.telefone = `55${digits}`;
  if (result.cep) {
    if (!/^\d{5}-?\d{3}$/.test(result.cep)) fail("Informe um CEP válido.");
    result.cep = result.cep
      .replace(/\D/g, "")
      .replace(/(\d{5})(\d{3})/, "$1-$2");
  }
  if (
    result.estado &&
    ![
      "AC",
      "AL",
      "AP",
      "AM",
      "BA",
      "CE",
      "DF",
      "ES",
      "GO",
      "MA",
      "MT",
      "MS",
      "MG",
      "PA",
      "PB",
      "PR",
      "PE",
      "PI",
      "RJ",
      "RN",
      "RS",
      "RO",
      "RR",
      "SC",
      "SP",
      "SE",
      "TO",
    ].includes(result.estado)
  )
    fail("UF inválida.");
  return result;
}

function boolean(value, name, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") fail(`${name} deve ser verdadeiro ou falso.`);
  return value;
}

function number(
  value,
  name,
  { optional = false, integer = false, max = 99999999.99 } = {},
) {
  if (value === null || value === undefined || value === "") {
    if (optional) return null;
    fail(`${name} é obrigatório.`);
  }
  if (
    !["number", "string"].includes(typeof value) ||
    (typeof value === "string" && !/^\d+(?:\.\d{1,2})?$/.test(value))
  )
    fail(`${name} inválido.`);
  const result = Number(value);
  if (
    !Number.isFinite(result) ||
    result < 0 ||
    result > max ||
    (integer && !Number.isInteger(result)) ||
    (!integer && Math.abs(result * 100 - Math.round(result * 100)) > 0.000001)
  )
    fail(`${name} inválido.`);
  return result;
}

function longText(value, name, max) {
  if (value == null || value === "") return null;
  if (
    typeof value !== "string" ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  )
    fail(`${name} inválido: limite de ${max} caracteres.`);
  return value.trim() || null;
}

function plan(body) {
  const result = {
    nome: text(body.nome, "Nome do plano", 150, true),
    tipo: text(body.tipo, "Tipo", 50, true),
    velocidade: text(body.velocidade, "Velocidade", 50),
    franquia: text(body.franquia, "Franquia", 50),
    preco: number(body.preco, "Preço"),
    descricao: longText(body.descricao, "Descrição", 5000),
    ativo: boolean(body.ativo, "Ativo", true),
    destaque: boolean(body.destaque, "Destaque", false),
    selo: text(body.selo, "Selo", 100),
    ordem: number(body.ordem ?? 0, "Ordem", { integer: true, max: 2147483647 }),
    fidelidade_meses: number(body.fidelidade_meses, "Fidelidade", {
      optional: true,
      integer: true,
      max: 120,
    }),
    preco_original: number(body.preco_original, "Preço original", {
      optional: true,
    }),
    promocional: boolean(body.promocional, "Promocional", false),
    oferta_valida_ate: text(body.oferta_valida_ate, "Validade da oferta", 10),
    observacoes: longText(body.observacoes, "Condições do plano", 5000),
  };
  if (!["internet", "controle", "pos"].includes(result.tipo))
    fail("Tipo de plano inválido.");
  let benefits = body.beneficios ?? [];
  if (typeof benefits === "string") {
    try {
      benefits = JSON.parse(benefits);
    } catch {
      benefits = benefits.split(/\r?\n/);
    }
  }
  if (!Array.isArray(benefits) || benefits.length > 20)
    fail("Informe até 20 benefícios.");
  result.beneficios = benefits.map((b) => text(b, "Benefício", 200, true));
  if (
    result.oferta_valida_ate &&
    (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(result.oferta_valida_ate) ||
      !Number.isFinite(Date.parse(result.oferta_valida_ate)) ||
      new Date(result.oferta_valida_ate).toISOString().slice(0, 10) !==
        result.oferta_valida_ate)
  )
    fail("Data de validade inválida.");
  if (
    result.promocional &&
    (result.preco_original === null ||
      result.preco_original <= result.preco ||
      !result.oferta_valida_ate)
  )
    fail("Promoção exige preço original maior e data de validade.");
  return result;
}

module.exports = { fail, text, email, password, lead, plan, longText };
