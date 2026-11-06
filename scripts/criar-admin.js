require('dotenv').config();
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const bcrypt = require('bcrypt');
const pool = require('../src/database/db');

function senhaOculta(rotulo) {
    if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
        throw new Error('Execute este comando em um terminal interativo para inserir a senha com segurança.');
    }
    return new Promise((resolve, reject) => {
        stdout.write(rotulo);
        stdin.setEncoding('utf8');
        stdin.setRawMode(true);
        stdin.resume();
        let valor = '';
        const aoDigitar = caractere => {
            if (caractere === '\u0003') {
                stdin.setRawMode(false);
                stdin.pause();
                stdin.off('data', aoDigitar);
                stdout.write('\n');
                reject(new Error('Operação cancelada.'));
                return;
            }
            if (caractere === '\r' || caractere === '\n') {
                stdin.setRawMode(false);
                stdin.pause();
                stdin.off('data', aoDigitar);
                stdout.write('\n');
                resolve(valor);
                return;
            }
            if (caractere === '\u007f' || caractere === '\b') {
                valor = valor.slice(0, -1);
            } else if (caractere >= ' ') {
                valor += caractere;
            }
        };
        stdin.on('data', aoDigitar);
    });
}

async function main() {
    const io = readline.createInterface({ input: stdin, output: stdout });
    let client;
    try {
        const nome = (await io.question('Nome do administrador: ')).trim();
        const email = (await io.question('E-mail do administrador: ')).trim().toLowerCase();
        io.close();
        const senha = await senhaOculta('Senha (mínimo 12 caracteres): ');
        const confirmacao = await senhaOculta('Confirme a senha: ');
        if (!nome || nome.length > 120 || !email || email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new Error('Informe um nome e um e-mail válidos. O nome aceita até 120 caracteres e o e-mail até 150.');
        }
        if (senha !== confirmacao || senha.length < 12 || Buffer.byteLength(senha, 'utf8') > 72) {
            throw new Error('As senhas devem coincidir, ter pelo menos 12 caracteres e ocupar no máximo 72 bytes.');
        }
        client = await pool.connect();
        await client.query('BEGIN');
        await client.query("SELECT pg_advisory_xact_lock(hashtext('dde-telecom-initial-admin'))");
        const existente = await client.query("SELECT 1 FROM usuarios WHERE perfil = 'admin' LIMIT 1");
        if (existente.rowCount) throw new Error('Já existe uma conta administrativa. Nenhuma alteração foi feita.');
        const hash = await bcrypt.hash(senha, 12);
        await client.query(
            "INSERT INTO usuarios (nome, email, senha_hash, perfil, ativo) VALUES ($1, $2, $3, 'admin', TRUE)",
            [nome, email, hash]
        );
        await client.query('COMMIT');
        console.log('Conta administrativa criada. Guarde a senha em um gerenciador seguro.');
    } catch (erro) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        throw erro;
    } finally {
        client?.release();
        await pool.end();
    }
}

main().catch(erro => {
    console.error(erro.message);
    process.exitCode = 1;
});
