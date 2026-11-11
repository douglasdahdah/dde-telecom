"use strict";
// Aplicação manual, nunca chamada no start/build da hospedagem.
require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
if (
  process.env.ALLOW_SCHEMA_MIGRATION !== "11.0.1" ||
  !process.env.DATABASE_URL_UNPOOLED
) {
  console.error(
    "Migração não iniciada. Após backup e ensaio, configure DATABASE_URL_UNPOOLED e ALLOW_SCHEMA_MIGRATION=11.0.1.",
  );
  process.exitCode = 1;
} else {
  process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
  const pool = require("../src/database/db");
  (async () => {
    const client = await pool.connect();
    try {
      await client.query(
        fs.readFileSync(path.join(__dirname, "../sql/schema.sql"), "utf8"),
      );
      console.log("Esquema 11.0.1 aplicado com sucesso.");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(
        "Migração revertida. Execute a pré-validação e confira uma cópia do banco. Código:",
        error.code || "migration",
      );
      process.exitCode = 1;
    } finally {
      client.release();
    }
  })()
    .catch(() => {
      console.error("Falha ao conectar para migração.");
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
