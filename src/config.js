"use strict";

function loadConfig(env = process.env) {
  const production = env.NODE_ENV === "production";
  const secret = env.JWT_SECRET || "";
  if (
    secret.length < 32 ||
    /^(.)\1+$/.test(secret) ||
    /^(secret|changeme|exemplo)/i.test(secret)
  )
    throw new Error(
      "Configure JWT_SECRET com um segredo aleatório de pelo menos 32 caracteres.",
    );
  const origins = new Set();
  for (const value of [env.FRONTEND_URL, env.RENDER_EXTERNAL_URL].filter(
    Boolean,
  )) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error("URL pública inválida na configuração.");
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      (production && url.protocol !== "https:")
    )
      throw new Error("Configure uma URL pública HTTPS válida.");
    origins.add(url.origin);
  }
  if (!production) {
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
  }
  if (production && !origins.size)
    throw new Error(
      "Configure FRONTEND_URL ou RENDER_EXTERNAL_URL para a origem pública HTTPS.",
    );
  const expiresIn = env.JWT_EXPIRES_IN || "8h";
  if (!/^\d+[smhd]$/.test(expiresIn))
    throw new Error(
      "JWT_EXPIRES_IN deve usar segundos, minutos, horas ou dias (ex.: 8h).",
    );
  return { production, secret, origins, expiresIn };
}

module.exports = { loadConfig };
