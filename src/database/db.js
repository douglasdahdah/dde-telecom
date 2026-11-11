const { Pool } = require("pg");
require("dotenv").config({ quiet: true });

const isProduction = process.env.NODE_ENV === "production";

let connectionString = process.env.DATABASE_URL;
if (connectionString) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("DATABASE_URL inválida. Verifique a configuração privada.");
  }
  if (
    isProduction &&
    ["disable", "no-verify"].includes(url.searchParams.get("sslmode"))
  ) {
    throw new Error("SSL inseguro não é permitido em produção.");
  }
  // Parâmetros da URL não podem substituir a validação TLS definida abaixo.
  for (const key of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert"])
    url.searchParams.delete(key);
  connectionString = url.toString();
}
const config = connectionString
  ? {
      connectionString,
      ssl: isProduction ? { rejectUnauthorized: true } : false,
    }
  : {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: isProduction ? { rejectUnauthorized: true } : false,
    };

const pool = new Pool({
  ...config,
  max: 10,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  statement_timeout: 10000,
  application_name: "dde-telecom",
});

pool.on("error", (erro) => {
  console.error(
    "Erro inesperado no PostgreSQL:",
    erro.code || "connection_error",
  );
});

module.exports = pool;
