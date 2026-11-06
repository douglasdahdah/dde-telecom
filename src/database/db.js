const { Pool } = require('pg');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

const config = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: isProduction ? { rejectUnauthorized: true } : false
      }
    : {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: isProduction ? { rejectUnauthorized: true } : false
      };

const pool = new Pool(config);

pool.on('error', (erro) => {
    console.error('Erro inesperado no PostgreSQL:', erro);
});

module.exports = pool;
