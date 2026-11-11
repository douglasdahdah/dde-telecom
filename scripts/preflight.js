"use strict";
// Somente leitura: não aplica o esquema nem modifica dados.
require("dotenv").config({ quiet: true });
if (process.env.DATABASE_URL_UNPOOLED)
  process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
const pool = require("../src/database/db");
(async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const counts = {};
    counts.emailsDuplicados = (
      await client.query(
        "SELECT count(*)::integer AS total FROM (SELECT lower(btrim(email)) FROM usuarios GROUP BY lower(btrim(email)) HAVING count(*)>1) d",
      )
    ).rows[0].total;
    counts.usuariosInvalidos = (
      await client.query(
        "SELECT count(*)::integer AS total FROM usuarios WHERE nome IS NULL OR btrim(nome)='' OR email IS NULL OR btrim(email)='' OR senha_hash IS NULL OR perfil IS NULL OR perfil NOT IN ('admin','vendedor') OR ativo IS NULL",
      )
    ).rows[0].total;
    counts.administradoresAtivos = (
      await client.query(
        "SELECT count(*)::integer AS total FROM usuarios WHERE perfil='admin' AND ativo=TRUE",
      )
    ).rows[0].total;
    counts.hashesInvalidos = (
      await client.query(
        "SELECT count(*)::integer AS total FROM usuarios WHERE senha_hash IS NULL OR senha_hash !~ '^\\$2[aby]\\$[0-9]{2}\\$[./A-Za-z0-9]{53}$'",
      )
    ).rows[0].total;
    counts.promocoesInvalidas = (
      await client.query(
        "SELECT count(*)::integer AS total FROM planos p WHERE (to_jsonb(p)->>'promocional')::boolean IS TRUE AND ((to_jsonb(p)->>'preco_original') IS NULL OR (to_jsonb(p)->>'oferta_valida_ate') IS NULL OR (to_jsonb(p)->>'preco_original')::numeric <= p.preco)",
      )
    ).rows[0].total;
    counts.leadsOrfaos = (
      await client.query(
        "SELECT count(*)::integer AS total FROM leads l LEFT JOIN usuarios u ON u.id=l.vendedor_id WHERE l.vendedor_id IS NOT NULL AND u.id IS NULL",
      )
    ).rows[0].total;
    await client.query("ROLLBACK");
    console.log(JSON.stringify(counts, null, 2));
    if (
      counts.emailsDuplicados ||
      counts.usuariosInvalidos ||
      counts.leadsOrfaos ||
      counts.hashesInvalidos ||
      counts.promocoesInvalidas ||
      !counts.administradoresAtivos
    )
      process.exitCode = 1;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(
      "Pré-validação incompleta. Verifique conexão e estrutura do banco. Código:",
      error.code || "config",
    );
    process.exitCode = 1;
  } finally {
    client.release();
  }
})()
  .catch(() => {
    console.error("Não foi possível conectar para pré-validação.");
    process.exitCode = 1;
  })
  .finally(() => pool.end());
