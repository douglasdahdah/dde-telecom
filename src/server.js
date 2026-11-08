// DDE Telecom — servidor com acessos de administrador e vendedor.
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const pool = require('./database/db');
const { registerMetaIntegration } = require('./meta-integration');
const { registerWhatsappNotifications } = require('./whatsapp-notifications');
const { registerLeadReports } = require('./lead-reports');
const { registerMetaImportStatus } = require('./meta-import-status');
const { registerLeadTrash } = require('./lead-trash');
const app = express();

    
// =====================================================
// AUTENTICA??O JWT
// =====================================================


app.disable('x-powered-by');
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
const origens = new Set(
    ['http://localhost:3000', 'http://127.0.0.1:3000', process.env.FRONTEND_URL]
        .filter(Boolean)
        .map(origem => {
            try { return new URL(origem).origin; }
            catch { return origem.replace(/\/+$/, ''); }
        })
);
app.use(cors({
    // Uma chamada do próprio site pode trazer o cabeçalho Origin. Para uma
    // origem não listada, omitir os cabeçalhos CORS bloqueia a leitura entre
    // sites sem transformar acessos normais ao próprio site em erro 500.
    origin: (origin, callback) => callback(null, !origin || origens.has(origin)),
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({
    limit: '100kb',
    verify: (req, res, buffer) => { req.rawBody = Buffer.from(buffer); }
}));
app.use((req, res, next) => { req.body = req.body || {}; next(); });
app.use(express.static(path.join(__dirname, '..', 'public')));
registerMetaIntegration(app, pool);
registerWhatsappNotifications(app, pool);


const loginLimiter=rateLimit({

    windowMs:
        15*60*1000,

    limit:
        10,

    standardHeaders:
        'draft-8',

    legacyHeaders:
        false,

    skipSuccessfulRequests:
        true,

    skip:
        ()=>process.env.NODE_ENV!=='production',

    message:{
        erro:
            'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.'
    }
});

const camposUsuario = 'id, nome, email, perfil, ativo, criado_em, atualizado_em';
const texto = valor => typeof valor === 'string' ? valor.trim() : '';
const idValido = valor => /^[1-9]\d*$/.test(String(valor)) && Number.isSafeInteger(Number(valor));
const assinaturaSenha = hash => crypto.createHash('sha256').update(hash).digest('hex');
const usuarioPublico = u => ({ id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, ativo: u.ativo });
const camposMarketing = {
    utm_source: 80,
    utm_medium: 80,
    utm_campaign: 150,
    utm_content: 150,
    utm_term: 150
};
function normalizarMetadadosMarketing(valor) {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {};
    const metadados = {};
    for (const [campo, limite] of Object.entries(camposMarketing)) {
        const entrada = valor[campo];
        if (typeof entrada === 'string' && entrada.trim()) {
            metadados[campo] = entrada.trim().slice(0, limite);
        }
    }
    return metadados;
}
function origemDoLead(metadados) {
    const fonte = texto(metadados?.utm_source).toLowerCase();
    if (!['facebook', 'instagram', 'meta', 'fb', 'ig'].includes(fonte)) return 'site';
    const meio = texto(metadados?.utm_medium).toLowerCase();
    return /paid|cpc|ads|anuncio/.test(meio) ? 'meta_ads' : 'meta_social';
}
function normalizarLead(body = {}) {
    return {
        nome: texto(body.nome),
        telefone: texto(body.telefone),
        email: texto(body.email).toLowerCase(),
        cep: texto(body.cep),
        logradouro: texto(body.logradouro),
        numero: texto(body.numero),
        complemento: texto(body.complemento),
        bairro: texto(body.bairro),
        cidade: texto(body.cidade),
        estado: texto(body.estado).toUpperCase(),
        interesse: texto(body.interesse),
        metadadosMarketing: normalizarMetadadosMarketing(body.metadados_marketing)
    };
}
function validarLead(lead, exigirInteresse = false) {
    if (!lead.nome || !lead.telefone) return 'Nome e telefone são obrigatórios.';
    if (exigirInteresse && !lead.interesse) return 'Selecione o produto ou plano do cliente.';
    if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) return 'Informe um e-mail válido.';
    if (JSON.stringify(lead.metadadosMarketing).length > 1000) return 'Os dados de origem ultrapassam o limite permitido.';

    const limites = {
        nome: 150, telefone: 20, email: 150, cep: 9, logradouro: 150,
        numero: 20, complemento: 100, bairro: 100, cidade: 100,
        estado: 2, interesse: 100
    };
    const campoExcedido = Object.entries(limites).find(([campo, limite]) => lead[campo].length > limite);
    if (campoExcedido) return 'Um ou mais campos ultrapassam o limite permitido.';
    if (lead.estado && !/^[A-Z]{2}$/.test(lead.estado)) return 'Informe a UF com duas letras.';
    return null;
}
function falhar(status, mensagem) {
    const erro = new Error(mensagem);
    erro.status = status;
    throw erro;
}
const executar = fn => async (req, res, next) => {
    try { await fn(req, res); } catch (erro) { next(erro); }
};
async function transacao(fn) {
    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');
        const resultado = await fn(cliente);
        await cliente.query('COMMIT');
        return resultado;
    } catch (erro) {
        await cliente.query('ROLLBACK');
        throw erro;
    } finally {
        cliente.release();
    }
}
async function protegerUltimoAdministrador(cliente, id, novoPerfil, novoAtivo) {
    // Serializa alterações que poderiam remover o último administrador ativo.
    await cliente.query("SELECT pg_advisory_xact_lock(hashtext('dde-telecom-active-admin'))");
    const atual = await cliente.query(
        'SELECT perfil, ativo FROM usuarios WHERE id = $1 FOR UPDATE', [id]
    );
    if (!atual.rows.length) falhar(404, 'Usuário não encontrado.');

    const usuario = atual.rows[0];
    const removendoAdminAtivo = usuario.perfil === 'admin' && usuario.ativo &&
        ((novoPerfil !== undefined && novoPerfil !== 'admin') || novoAtivo === false);
    if (!removendoAdminAtivo) return;

    const total = await cliente.query(
        "SELECT COUNT(*) AS total FROM usuarios WHERE perfil = 'admin' AND ativo = TRUE"
    );
    if (Number(total.rows[0].total) <= 1) {
        falhar(400, 'Mantenha pelo menos um administrador ativo.');
    }
}
function validarId(req, res, next) {
    if (!idValido(req.params.id)) return res.status(400).json({ erro: 'ID inválido.' });
    next();
}

// O banco é consultado em cada acesso: desativar uma conta bloqueia sua sessão.
async function autenticar(req, res, next) {
    try {
    const partes = (req.headers.authorization || '').split(' ');
    if (partes.length !== 2 || partes[0] !== 'Bearer' || !partes[1]) {
        falhar(401, 'Faça login para continuar.');
    }
    let token;
    try { token = jwt.verify(partes[1], process.env.JWT_SECRET, { algorithms: ['HS256'] }); }
    catch { falhar(401, 'Sessão inválida ou expirada. Faça login novamente.'); }
    if (!idValido(token.id)) falhar(401, 'Sessão inválida.');
    const { rows } = await pool.query(
        'SELECT id, nome, email, perfil, ativo, senha_hash FROM usuarios WHERE id = $1', [token.id]
    );
    const usuario = rows[0];
    if (!usuario || !usuario.ativo || !['admin', 'vendedor'].includes(usuario.perfil)) {
        falhar(401, 'Conta indisponível. Entre em contato com o administrador.');
    }
    if (token.sv !== assinaturaSenha(usuario.senha_hash)) {
        falhar(401, 'Faça login novamente para atualizar sua sessão.');
    }
    req.usuario = usuarioPublico(usuario);
    next();
    } catch (erro) { next(erro); }
}

function somenteAdmin(req,res,next){

    if(
        !req.usuario
        ||
        req.usuario.perfil!=='admin'
    ){

        return res.status(403).json({
            erro:
                'Acesso permitido somente para administradores.'
        });
    }

    return next();
}

app.get('/health', (req, res) => res.json({ status: 'ok', empresa: 'DDE Telecom' }));
registerLeadReports(app, pool, { autenticar, somenteAdmin });
registerMetaImportStatus(app, pool, { autenticar, somenteAdmin });
registerLeadTrash(app, pool, { autenticar, somenteAdmin });

// ===== DDE USUARIOS REPARO BEGIN =====


// =====================================================
// LISTAR USUÁRIOS
// =====================================================

app.get(
    '/api/usuarios',
    autenticar,
    somenteAdmin,
    async (req,res)=>{

        try{

            const resultado=
                await pool.query(
                    "SELECT * FROM usuarios ORDER BY CASE WHEN perfil = 'admin' THEN 1 ELSE 2 END, nome"
                );


            return res.json(
                resultado.rows.map(
                    u=>({
                        id:
                            u.id,

                        nome:
                            u.nome,

                        email:
                            u.email,

                        perfil:
                            u.perfil,

                        ativo:
                            u.ativo,

                        criado_em:
                            u.criado_em
                            ||
                            null
                    })
                )
            );


        }catch(erro){

            console.error(
                'Erro ao listar usuários:',
                erro
            );


            return res.status(500).json({
                erro:
                    'Não foi possível carregar os usuários.'
            });
        }
    }
);


// =====================================================
// CRIAR USUÁRIO
// =====================================================

app.post(
    '/api/usuarios',
    autenticar,
    somenteAdmin,
    async (req,res)=>{

        try{

            const nome=
                String(
                    req.body.nome || ''
                ).trim();


            const email=
                String(
                    req.body.email || ''
                )
                .trim()
                .toLowerCase();


            const senha=
                String(
                    req.body.senha || ''
                );


            const perfil=
                String(
                    req.body.perfil
                    ||
                    'vendedor'
                )
                .trim()
                .toLowerCase();


            if(
                !nome
                ||
                !email
                ||
                !senha
            ){

                return res.status(400).json({
                    erro:
                        'Nome, e-mail e senha são obrigatórios.'
                });
            }

            if(
                nome.length > 120 ||
                email.length > 150 ||
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
            ){

                return res.status(400).json({
                    erro:
                        'Informe um nome e um e-mail válidos. O nome aceita até 120 caracteres e o e-mail até 150.'
                });
            }


            if(
                ![
                    'admin',
                    'vendedor'
                ].includes(
                    perfil
                )
            ){

                return res.status(400).json({
                    erro:
                        'Perfil inválido.'
                });
            }


            if(
                senha.length<8 ||
                Buffer.byteLength(senha, 'utf8') > 72
            ){

                return res.status(400).json({
                    erro:
                        'A senha deve ter pelo menos 8 caracteres.'
                });
            }


            const existente=
                await pool.query(
                    'SELECT id FROM usuarios WHERE LOWER(email) = $1 LIMIT 1',
                    [
                        email
                    ]
                );


            if(
                existente.rows.length
            ){

                return res.status(409).json({
                    erro:
                        'Já existe um usuário com este e-mail.'
                });
            }


            const hash=
                await bcrypt.hash(
                    senha,
                    10
                );


            const resultado=
                await pool.query(
                    'INSERT INTO usuarios (nome,email,senha_hash,perfil,ativo) VALUES ($1,$2,$3,$4,TRUE) RETURNING id,nome,email,perfil,ativo',
                    [
                        nome,
                        email,
                        hash,
                        perfil
                    ]
                );


            return res.status(201).json({

                mensagem:
                    'Usuário cadastrado com sucesso.',

                usuario:
                    resultado.rows[0]
            });


        }catch(erro){

            console.error(
                'Erro ao cadastrar usuário:',
                erro
            );


            const status = erro.code === '23505' ? 409 : (erro.status || 500);
            return res.status(status).json({
                erro: erro.status ? erro.message : erro.code === '23505'
                    ? 'Já existe um usuário com este e-mail.'
                    : 'Não foi possível cadastrar o usuário.'
            });
        }
    }
);


// =====================================================
// EDITAR USUÁRIO
// =====================================================

app.patch(
    '/api/usuarios/:id',
    autenticar,
    somenteAdmin,
    async (req,res)=>{

        try{

            const id=
                String(
                    req.params.id || ''
                );


            if(
                !/^\d+$/.test(id)
            ){

                return res.status(400).json({
                    erro:
                        'ID inválido.'
                });
            }


            const nome=
                String(
                    req.body.nome || ''
                ).trim();


            const email=
                String(
                    req.body.email || ''
                )
                .trim()
                .toLowerCase();


            const perfil=
                String(
                    req.body.perfil || ''
                )
                .trim()
                .toLowerCase();


            if(
                !nome
                ||
                !email
                ||
                ![
                    'admin',
                    'vendedor'
                ].includes(
                    perfil
                )
            ){

                return res.status(400).json({
                    erro:
                        'Dados inválidos.'
                });
            }

            if(
                nome.length > 120 ||
                email.length > 150 ||
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
            ){

                return res.status(400).json({
                    erro:
                        'Informe um nome e um e-mail válidos. O nome aceita até 120 caracteres e o e-mail até 150.'
                });
            }


            const existente=
                await pool.query(
                    'SELECT id FROM usuarios WHERE LOWER(email) = $1 AND id <> $2 LIMIT 1',
                    [
                        email,
                        id
                    ]
                );


            if(
                existente.rows.length
            ){

                return res.status(409).json({
                    erro:
                        'Já existe outro usuário com este e-mail.'
                });
            }


            const resultado = await transacao(async cliente => {
                await protegerUltimoAdministrador(cliente, id, perfil, undefined);
                return cliente.query(
                    'UPDATE usuarios SET nome=$1,email=$2,perfil=$3 WHERE id=$4 RETURNING id,nome,email,perfil,ativo',
                    [nome, email, perfil, id]
                );
            });


            if(
                !resultado.rows.length
            ){

                return res.status(404).json({
                    erro:
                        'Usuário não encontrado.'
                });
            }


            return res.json({

                mensagem:
                    'Usuário atualizado com sucesso.',

                usuario:
                    resultado.rows[0]
            });


        }catch(erro){

            console.error(
                'Erro ao atualizar usuário:',
                erro
            );


            const status = erro.code === '23505' ? 409 : (erro.status || 500);
            return res.status(status).json({
                erro: erro.status ? erro.message : erro.code === '23505'
                    ? 'Já existe outro usuário com este e-mail.'
                    : 'Não foi possível atualizar o usuário.'
            });
        }
    }
);


// =====================================================
// ATIVAR / DESATIVAR
// =====================================================

async function alterarStatusUsuarioDDE(
    req,
    res
){

    try{

        const id=
            String(
                req.params.id || ''
            );


        if(
            !/^\d+$/.test(id)
        ){

            return res.status(400).json({
                erro:
                    'ID inválido.'
            });
        }


        const ativo=
            req.body.ativo;


        if(
            typeof ativo !==
            'boolean'
        ){

            return res.status(400).json({
                erro:
                    'Status inválido.'
            });
        }


        if(
            Number(id) ===
                Number(
                    req.usuario.id
                )
            &&
            ativo === false
        ){

            return res.status(400).json({
                erro:
                    'Você não pode desativar o próprio usuário.'
            });
        }


        const resultado = await transacao(async cliente => {
            await protegerUltimoAdministrador(cliente, id, undefined, ativo);
            return cliente.query(
                'UPDATE usuarios SET ativo=$1 WHERE id=$2 RETURNING id,nome,email,perfil,ativo',
                [ativo, id]
            );
        });


        if(
            !resultado.rows.length
        ){

            return res.status(404).json({
                erro:
                    'Usuário não encontrado.'
            });
        }


        return res.json({

            mensagem:
                ativo
                    ?
                    'Usuário ativado com sucesso.'
                    :
                    'Usuário desativado com sucesso.',

            usuario:
                resultado.rows[0]
        });


    }catch(erro){

        console.error(
            'Erro ao alterar status do usuário:',
            erro
        );


        const status = erro.code === '23505' ? 409 : (erro.status || 500);
        return res.status(status).json({
            erro: erro.status ? erro.message : erro.code === '23505'
                ? 'Este cadastro já existe.'
                : 'Não foi possível alterar o usuário.'
        });
    }
}


app.patch(
    '/api/usuarios/:id/status',
    autenticar,
    somenteAdmin,
    alterarStatusUsuarioDDE
);


app.patch(
    '/api/usuarios/:id/ativo',
    autenticar,
    somenteAdmin,
    alterarStatusUsuarioDDE
);


// =====================================================
// REDEFINIR SENHA DE UM USUÁRIO
// SOMENTE QUANDO ADMINISTRADOR USAR ESSA FUNÇÃO
// =====================================================

app.patch(
    '/api/usuarios/:id/senha',
    autenticar,
    somenteAdmin,
    async (req,res)=>{

        try{

            const id=
                String(
                    req.params.id || ''
                );


            const senha=
                String(
                    req.body.senha || ''
                );


            if(
                !/^\d+$/.test(id)
            ){

                return res.status(400).json({
                    erro:
                        'ID inválido.'
                });
            }


            if(
                senha.length<8 ||
                Buffer.byteLength(senha, 'utf8') > 72
            ){

                return res.status(400).json({
                    erro:
                        'A senha deve ter pelo menos 8 caracteres.'
                });
            }


            const hash=
                await bcrypt.hash(
                    senha,
                    10
                );


            const resultado=
                await pool.query(
                    'UPDATE usuarios SET senha_hash=$1 WHERE id=$2 RETURNING id',
                    [
                        hash,
                        id
                    ]
                );


            if(
                !resultado.rows.length
            ){

                return res.status(404).json({
                    erro:
                        'Usuário não encontrado.'
                });
            }


            return res.json({
                mensagem:
                    'Senha redefinida com sucesso.'
            });


        }catch(erro){

            console.error(
                'Erro ao redefinir senha:',
                erro
            );


            return res.status(500).json({
                erro:
                    'Não foi possível redefinir a senha.'
            });
        }
    }
);


// ===== DDE USUARIOS REPARO END =====


app.get('/api/status', executar(async (req, res) => {
    const { rows } = await pool.query('SELECT NOW() AS data_hora');
    res.json({ status: 'online', empresa: 'DDE Telecom', banco: 'PostgreSQL conectado', dataHora: rows[0].data_hora });
}));
async function realizarLogin(req, res, perfilExigido) {
    const email = texto(req.body.email).toLowerCase();
    const senha = req.body.senha;
    if (!email || typeof senha !== 'string' || !senha || Buffer.byteLength(senha, 'utf8') > 72) {
        falhar(400, 'Informe e-mail e senha válidos.');
    }
    const { rows } = await pool.query(
        'SELECT id, nome, email, senha_hash, perfil, ativo FROM usuarios WHERE LOWER(email) = $1 LIMIT 1', [email]
    );
    const usuario = rows[0];
    if (!usuario || !(await bcrypt.compare(senha, usuario.senha_hash))) falhar(401, 'E-mail ou senha inválidos.');
    if (!usuario.ativo) falhar(403, 'Usuário desativado.');
    if (perfilExigido && usuario.perfil !== perfilExigido) falhar(403, 'Utilize a página de acesso correspondente ao seu perfil.');
    if (!process.env.JWT_SECRET) falhar(500, 'Autenticação não configurada no servidor.');
    const token = jwt.sign({
        id: usuario.id, email: usuario.email, perfil: usuario.perfil,
        sv: assinaturaSenha(usuario.senha_hash)
    }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
    res.json({ mensagem: 'Login realizado com sucesso.', token, usuario: usuarioPublico(usuario) });
}
app.post('/api/auth/login', loginLimiter, async (req, res) => realizarLogin(req, res));


app.get('/api/auth/me', autenticar, async (req, res) => {

    try {

        const resultado =
            await pool.query(
                `
                SELECT
                    id,
                    nome,
                    email,
                    perfil,
                    ativo

                FROM usuarios

                WHERE id = $1

                LIMIT 1
                `,
                [
                    req.usuario.id
                ]
            );


        if (
            resultado.rows.length === 0
        ) {

            return res.status(401).json({
                erro:
                    'Usuário não encontrado.'
            });
        }


        const usuario =
            resultado.rows[0];


        if (!usuario.ativo) {

            return res.status(403).json({
                erro:
                    'Usuário desativado.'
            });
        }


        if (
            ![
                'admin',
                'vendedor'
            ].includes(
                usuario.perfil
            )
        ) {

            return res.status(403).json({
                erro:
                    'Perfil de usuário não autorizado.'
            });
        }


        return res.json({
            usuario
        });


    } catch (erro) {

        console.error(
            'Erro ao validar sessão:',
            erro
        );


        return res.status(500).json({
            erro:
                'Não foi possível validar a sessão.'
        });
    }
});


app.get('/api/planos', async (req, res) => {
    try {
        const resultado =
            await pool.query(`
                SELECT
                    id,
                    nome,
                    tipo,
                    velocidade,
                    franquia,
                    preco,
                    descricao,
                    destaque,
                    selo,
                    ordem,
                    beneficios,
                    fidelidade_meses,
                    preco_original,
                    promocional,
                    oferta_valida_ate,
                    observacoes,
                    atualizado_em
                FROM planos
                WHERE ativo = TRUE
                  AND (oferta_valida_ate IS NULL OR oferta_valida_ate >= CURRENT_DATE)
                ORDER BY
                    CASE tipo
                        WHEN 'internet' THEN 1
                        WHEN 'controle' THEN 2
                        WHEN 'pos' THEN 3
                        ELSE 4
                    END,
                    ordem,
                    preco,
                    id
            `);
        res.json(
            resultado.rows
        );
    } catch (erro) {
        console.error(
            'Erro ao buscar planos:',
            erro
        );
        res.status(500).json({
            erro:
                'Não foi possível carregar os planos.'
        });
    }
});
const tiposPlanoPermitidos = [
    'internet',
    'controle',
    'pos'
];
function normalizarBeneficios(valor) {
    if (Array.isArray(valor)) {
        return valor
            .map(
                item =>
                    String(item || '').trim()
            )
            .filter(Boolean);
    }
    if (typeof valor === 'string') {
        const texto =
            valor.trim();
        if (!texto) {
            return [];
        }
        try {
            const convertido =
                JSON.parse(texto);
            if (Array.isArray(convertido)) {
                return convertido
                    .map(
                        item =>
                            String(item || '').trim()
                    )
                    .filter(Boolean);
            }
        } catch (erro) {
            return texto
                .split(/\r?\n/)
                .map(
                    item =>
                        item.trim()
                )
                .filter(Boolean);
        }
    }
    return [];
}
function normalizarPlano(body = {}) {
    const nome =
        typeof body.nome === 'string'
            ? body.nome.trim()
            : '';
    const tipo =
        typeof body.tipo === 'string'
            ? body.tipo.trim().toLowerCase()
            : '';
    const velocidade =
        typeof body.velocidade === 'string'
            ? body.velocidade.trim() || null
            : null;
    const franquia =
        typeof body.franquia === 'string'
            ? body.franquia.trim() || null
            : null;
    const descricao =
        typeof body.descricao === 'string'
            ? body.descricao.trim() || null
            : null;
    const selo =
        typeof body.selo === 'string'
            ? body.selo.trim() || null
            : null;
    const preco =
        Number(body.preco);
    const ativo =
        typeof body.ativo === 'boolean'
            ? body.ativo
            : true;
    const destaque =
        typeof body.destaque === 'boolean'
            ? body.destaque
            : false;
    const ordem =
        body.ordem === '' ||
        body.ordem === null ||
        body.ordem === undefined
            ? 0
            : Number(body.ordem);
    const fidelidadeMeses =
        body.fidelidade_meses === '' ||
        body.fidelidade_meses === null ||
        body.fidelidade_meses === undefined
            ? null
            : Number(body.fidelidade_meses);
    const beneficios =
        normalizarBeneficios(
            body.beneficios
        );
    return {
        nome,
        tipo,
        velocidade,
        franquia,
        preco,
        descricao,
        ativo,
        destaque,
        selo,
        ordem,
        beneficios,
        fidelidade_meses:
            fidelidadeMeses
    };
}
function validarPlano(plano) {
    if (!plano.nome) {
        return 'O nome do plano é obrigatório.';
    }
    if (!tiposPlanoPermitidos.includes(plano.tipo)) {
        return 'Tipo de plano inválido.';
    }
    if (
        !Number.isFinite(plano.preco) ||
        plano.preco < 0
    ) {
        return 'Informe um preço válido.';
    }
    if (
        !Number.isInteger(plano.ordem) ||
        plano.ordem < 0
    ) {
        return 'A ordem de exibição deve ser um número inteiro igual ou maior que zero.';
    }
    if (
        plano.fidelidade_meses !== null &&
        (
            !Number.isInteger(
                plano.fidelidade_meses
            ) ||
            plano.fidelidade_meses < 0
        )
    ) {
        return 'A fidelidade deve ser informada em meses.';
    }
    if (plano.nome.length > 150) {
        return 'O nome do plano é muito longo.';
    }
    if (
        plano.selo &&
        plano.selo.length > 100
    ) {
        return 'O selo do plano é muito longo.';
    }
    if (
        plano.beneficios.length > 20
    ) {
        return 'Informe no máximo 20 benefícios por plano.';
    }
    const beneficioMuitoLongo =
        plano.beneficios.some(
            item =>
                item.length > 200
        );
    if (beneficioMuitoLongo) {
        return 'Cada benefício deve ter no máximo 200 caracteres.';
    }
    return null;
}
app.get(
    '/api/admin/planos',
    autenticar,
    somenteAdmin,
    async (req, res) => {
        try {
            const resultado =
                await pool.query(`
                    SELECT
                        id,
                        nome,
                        tipo,
                        velocidade,
                        franquia,
                        preco,
                        descricao,
                        ativo,
                        destaque,
                        selo,
                        ordem,
                        beneficios,
                        fidelidade_meses,
                        preco_original,
                        promocional,
                        oferta_valida_ate,
                        observacoes,
                        criado_em,
                        atualizado_em
                    FROM planos
                    ORDER BY
                        CASE tipo
                            WHEN 'internet' THEN 1
                            WHEN 'controle' THEN 2
                            WHEN 'pos' THEN 3
                            ELSE 4
                        END,
                        ordem,
                        preco,
                        id
                `);
            res.json(
                resultado.rows
            );
        } catch (erro) {
            console.error(
                'Erro ao listar planos no painel:',
                erro
            );
            res.status(500).json({
                erro:
                    'Não foi possível carregar os planos.'
            });
        }
    }
);// =====================================================
app.get(
    '/api/admin/planos/:id',
    autenticar,
    somenteAdmin,
    async (req, res) => {
        try {
            const { id } =
                req.params;
            if (!/^\d+$/.test(id)) {
                return res.status(400).json({
                    erro: 'ID inválido.'
                });
            }
            const resultado =
                await pool.query(
                    `
                    SELECT
                        id,
                        nome,
                        tipo,
                        velocidade,
                        franquia,
                        preco,
                        descricao,
                        ativo,
                        destaque,
                        selo,
                        ordem,
                        beneficios,
                        fidelidade_meses,
                        preco_original,
                        promocional,
                        oferta_valida_ate,
                        observacoes,
                        criado_em,
                        atualizado_em
                    FROM planos
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [id]
                );
            if (resultado.rows.length === 0) {
                return res.status(404).json({
                    erro: 'Plano não encontrado.'
                });
            }
            res.json(
                resultado.rows[0]
            );
        } catch (erro) {
            console.error(
                'Erro ao buscar plano no painel:',
                erro
            );
            res.status(500).json({
                erro:
                    'Não foi possível carregar o plano.'
            });
        }
    }
);
app.post(
    '/api/admin/planos',
    autenticar,
    somenteAdmin,
    async (req, res) => {
        try {
            const plano =
                normalizarPlano(req.body);
            const erroValidacao =
                validarPlano(plano);
            if (erroValidacao) {
                return res.status(400).json({
                    erro: erroValidacao
                });
            }
            const resultado =
                await pool.query(
                    `
                    INSERT INTO planos (
                        nome,
                        tipo,
                        velocidade,
                        franquia,
                        preco,
                        descricao,
                        ativo,
                        destaque,
                        selo,
                        ordem,
                        beneficios,
                        fidelidade_meses
                    )
                    VALUES (
                        $1, $2, $3, $4, $5, $6,
                        $7, $8, $9, $10, $11::jsonb, $12
                    )
                    RETURNING *
                    `,
                    [
                        plano.nome,
                        plano.tipo,
                        plano.velocidade,
                        plano.franquia,
                        plano.preco,
                        plano.descricao,
                        plano.ativo,
                        plano.destaque,
                        plano.selo,
                        plano.ordem,
                        JSON.stringify(
                            plano.beneficios
                        ),
                        plano.fidelidade_meses
                    ]
                );
            res.status(201).json({
                mensagem:
                    'Plano criado com sucesso.',
                plano:
                    resultado.rows[0]
            });
        } catch (erro) {
            console.error(
                'Erro ao criar plano:',
                erro
            );
            res.status(500).json({
                erro:
                    'Não foi possível criar o plano.'
            });
        }
    }
);
app.patch(
    '/api/admin/planos/:id',
    autenticar,
    somenteAdmin,
    async (req, res) => {
        try {
            const { id } =
                req.params;
            if (!/^\d+$/.test(id)) {
                return res.status(400).json({
                    erro: 'ID inválido.'
                });
            }
            const plano =
                normalizarPlano(req.body);
            const erroValidacao =
                validarPlano(plano);
            if (erroValidacao) {
                return res.status(400).json({
                    erro: erroValidacao
                });
            }
            const resultado =
                await pool.query(
                    `
                    UPDATE planos
                    SET
                        nome = $1,
                        tipo = $2,
                        velocidade = $3,
                        franquia = $4,
                        preco = $5,
                        descricao = $6,
                        ativo = $7,
                        destaque = $8,
                        selo = $9,
                        ordem = $10,
                        beneficios = $11::jsonb,
                        fidelidade_meses = $12
                    WHERE id = $13
                    RETURNING *
                    `,
                    [
                        plano.nome,
                        plano.tipo,
                        plano.velocidade,
                        plano.franquia,
                        plano.preco,
                        plano.descricao,
                        plano.ativo,
                        plano.destaque,
                        plano.selo,
                        plano.ordem,
                        JSON.stringify(
                            plano.beneficios
                        ),
                        plano.fidelidade_meses,
                        id
                    ]
                );
            if (resultado.rows.length === 0) {
                return res.status(404).json({
                    erro: 'Plano não encontrado.'
                });
            }
            res.json({
                mensagem:
                    'Plano atualizado com sucesso.',
                plano:
                    resultado.rows[0]
            });
        } catch (erro) {
            console.error(
                'Erro ao atualizar plano:',
                erro
            );
            res.status(500).json({
                erro:
                    'Não foi possível atualizar o plano.'
            });
        }
    }
);
app.patch(
    '/api/admin/planos/:id/status',
    autenticar,
    somenteAdmin,
    async (req, res) => {
        try {
            const { id } =
                req.params;
            const { ativo } =
                req.body;
            if (!/^\d+$/.test(id)) {
                return res.status(400).json({
                    erro: 'ID inválido.'
                });
            }
            if (typeof ativo !== 'boolean') {
                return res.status(400).json({
                    erro:
                        'O campo ativo deve ser verdadeiro ou falso.'
                });
            }
            const resultado =
                await pool.query(
                    `
                    UPDATE planos
                    SET
                        ativo = $1
                    WHERE id = $2
                    RETURNING *
                    `,
                    [
                        ativo,
                        id
                    ]
                );
            if (resultado.rows.length === 0) {
                return res.status(404).json({
                    erro: 'Plano não encontrado.'
                });
            }
            res.json({
                mensagem:
                    ativo
                        ? 'Plano ativado com sucesso.'
                        : 'Plano desativado com sucesso.',
                plano:
                    resultado.rows[0]
            });
        } catch (erro) {
            console.error(
                'Erro ao alterar status do plano:',
                erro
            );
            res.status(500).json({
                erro:
                    'Não foi possível alterar o status do plano.'
            });
        }
    }
);
app.delete(
    '/api/admin/planos/:id',
    autenticar,
    somenteAdmin,
    async (req, res) => {
        try {
            const { id } =
                req.params;
            if (!/^\d+$/.test(id)) {
                return res.status(400).json({
                    erro: 'ID inválido.'
                });
            }
            const resultado =
                await pool.query(
                    `
                    DELETE FROM planos
                    WHERE id = $1
                    RETURNING
                        id,
                        nome,
                        tipo
                    `,
                    [id]
                );
            if (resultado.rows.length === 0) {
                return res.status(404).json({
                    erro: 'Plano não encontrado.'
                });
            }
            res.json({
                mensagem:
                    'Plano excluído com sucesso.',
                plano:
                    resultado.rows[0]
            });
        } catch (erro) {
            console.error(
                'Erro ao excluir plano:',
                erro
            );
            res.status(500).json({
                erro:
                    'Não foi possível excluir o plano.'
            });
        }
    }
);

// Novos contatos do site continuam chegando para o administrador.
// ===== DDE VENDEDOR REPARO BEGIN =====


// =====================================================
// VENDEDOR LOGADO
// =====================================================

app.get(
    '/api/vendedor/me',
    autenticar,
    async (req, res) => {

        try {

            if (
                req.usuario.perfil !==
                'vendedor'
            ) {

                return res.status(403).json({
                    erro:
                        'Acesso exclusivo para vendedores.'
                });
            }


            const resultado =
                await pool.query(
                    `
                    SELECT
                        id,
                        nome,
                        email,
                        perfil,
                        ativo

                    FROM usuarios

                    WHERE
                        id = $1
                        AND perfil = 'vendedor'

                    LIMIT 1
                    `,
                    [
                        req.usuario.id
                    ]
                );


            if (
                resultado.rows.length === 0
                ||
                !resultado.rows[0].ativo
            ) {

                return res.status(403).json({
                    erro:
                        'Vendedor não encontrado ou desativado.'
                });
            }


            return res.json({
                usuario:
                    resultado.rows[0]
            });


        } catch (erro) {

            console.error(
                'Erro ao validar vendedor:',
                erro
            );


            return res.status(500).json({
                erro:
                    'Não foi possível validar o vendedor.'
            });
        }
    }
);


// =====================================================
// CADASTRAR LEAD DO VENDEDOR
// =====================================================

app.post(
    '/api/vendedor/leads',
    autenticar,
    async (req, res) => {

        try {

            if (
                req.usuario.perfil !==
                'vendedor'
            ) {

                return res.status(403).json({
                    erro:
                        'Acesso exclusivo para vendedores.'
                });
            }


            const vendedorResultado =
                await pool.query(
                    `
                    SELECT
                        id,
                        nome,
                        email,
                        ativo

                    FROM usuarios

                    WHERE
                        id = $1
                        AND perfil = 'vendedor'

                    LIMIT 1
                    `,
                    [
                        req.usuario.id
                    ]
                );


            if (
                vendedorResultado.rows.length === 0
                ||
                !vendedorResultado.rows[0].ativo
            ) {

                return res.status(403).json({
                    erro:
                        'Vendedor não encontrado ou desativado.'
                });
            }


            const vendedor =
                vendedorResultado.rows[0];


            const lead = normalizarLead(req.body);
            const erroLead = validarLead(lead, true);
            if (erroLead) {
                return res.status(400).json({ erro: erroLead });
            }


            const resultado =
                await pool.query(
                    `
                    INSERT INTO leads (
                        nome,
                        telefone,
                        email,
                        cep,
                        logradouro,
                        numero,
                        complemento,
                        bairro,
                        cidade,
                        estado,
                        interesse,
                        vendedor,
                        vendedor_id,
                        origem,
                        metadados_marketing
                    )

                    VALUES (
                        $1,$2,$3,$4,$5,$6,$7,
                        $8,$9,$10,$11,$12,$13,'vendedor',$14::jsonb
                    )

                    RETURNING *
                    `,
                    [
                        lead.nome,
                        lead.telefone,
                        lead.email || null,
                        lead.cep || null,
                        lead.logradouro || null,
                        lead.numero || null,
                        lead.complemento || null,
                        lead.bairro || null,
                        lead.cidade || null,
                        lead.estado || null,
                        lead.interesse,

                        vendedor.nome,

                        vendedor.id,

                        JSON.stringify(lead.metadadosMarketing)
                    ]
                );


            return res.status(201).json({

                mensagem:
                    'Lead cadastrado com sucesso.',

                vendedor: {

                    id:
                        vendedor.id,

                    nome:
                        vendedor.nome
                },

                lead:
                    resultado.rows[0]
            });


        } catch (erro) {

            console.error(
                'Erro ao cadastrar lead do vendedor:',
                erro
            );


            return res.status(500).json({
                erro:
                    'Não foi possível cadastrar o lead.'
            });
        }
    }
);


// ===== DDE VENDEDOR REPARO END =====


app.post('/api/leads', executar(async (req, res) => {
    const lead = normalizarLead(req.body);
    const erroLead = validarLead(lead);
    if (erroLead) falhar(400, erroLead);
    const admins = await pool.query("SELECT id, nome FROM usuarios WHERE perfil = 'admin' AND ativo = TRUE ORDER BY id LIMIT 1");
    if (!admins.rows.length) falhar(500, 'Administrador não encontrado ou desativado.');
    const admin = admins.rows[0];
    const { rows } = await pool.query(`
        INSERT INTO leads (
            nome, telefone, email, cep, logradouro, numero, complemento, bairro,
            cidade, estado, interesse, vendedor, vendedor_id, origem, metadados_marketing
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
        RETURNING *`,
        [lead.nome, lead.telefone, lead.email || null, lead.cep || null,
            lead.logradouro || null, lead.numero || null, lead.complemento || null,
            lead.bairro || null, lead.cidade || null, lead.estado || null,
            lead.interesse || null, admin.nome, admin.id, origemDoLead(lead.metadadosMarketing),
            JSON.stringify(lead.metadadosMarketing)]
    );
    res.status(201).json({ mensagem: 'Lead cadastrado com sucesso.', lead: rows[0] });
}));
// A restrição por vendedor é aplicada dentro de cada consulta ao banco.

app.get(
    '/api/leads',
    autenticar,
    async(req,res)=>{

        try{

            if(
                req.usuario.perfil==='admin'
            ){

                const r=
                    await pool.query(
                        `
                        SELECT *
                        FROM leads
                        WHERE excluido_em IS NULL
                        ORDER BY id DESC
                        `
                    );

                return res.json(
                    r.rows
                );
            }


            if(
                req.usuario.perfil==='vendedor'
            ){

                const r=
                    await pool.query(
                        `
                        SELECT *
                        FROM leads
                        WHERE vendedor_id=$1 AND excluido_em IS NULL
                        ORDER BY id DESC
                        `,
                        [
                            req.usuario.id
                        ]
                    );

                return res.json(
                    r.rows
                );
            }


            return res.status(403).json({
                erro:
                    'Perfil sem permissão para visualizar leads.'
            });


        }catch(e){

            console.error(
                'Erro ao buscar leads:',
                e
            );

            return res.status(500).json({
                erro:
                    'Não foi possível carregar os leads.'
            });
        }
    }
);


app.get('/api/leads/:id', autenticar, validarId, executar(async (req, res) => {
    const admin = req.usuario.perfil === 'admin';
    const { rows } = await pool.query(
        `SELECT * FROM leads WHERE id = $1 AND excluido_em IS NULL ${admin ? '' : 'AND vendedor_id = $2'}`,
        admin ? [req.params.id] : [req.params.id, req.usuario.id]
    );
    if (!rows.length) falhar(404, 'Lead não encontrado ou sem permissão de acesso.');
    res.json(rows[0]);
}));
app.patch('/api/leads/:id/status', autenticar, validarId, executar(async (req, res) => {
    const status = req.body.status;
    if (!['novo', 'atendimento', 'convertido', 'nao_convertido'].includes(status)) falhar(400, 'Status inválido.');
    const admin = req.usuario.perfil === 'admin';
    const valores = [status, status !== 'novo', req.params.id];
    if (!admin) valores.push(req.usuario.id);
    const { rows } = await pool.query(`
        UPDATE leads SET status = $1, ultimo_contato = CASE WHEN $2::boolean THEN NOW() ELSE ultimo_contato END
        WHERE id = $3 AND excluido_em IS NULL ${admin ? '' : 'AND vendedor_id = $4'} RETURNING *`, valores);
    if (!rows.length) falhar(404, 'Lead não encontrado ou sem permissão de acesso.');
    res.json({ mensagem: 'Status atualizado com sucesso.', lead: rows[0] });
}));
app.patch('/api/leads/:id/comercial', autenticar, validarId, executar(async (req, res) => {
    // A atribuição tem uma rota própria e só pode ser feita pelo administrador.
    if (Object.hasOwn(req.body, 'vendedor') || Object.hasOwn(req.body, 'vendedor_id')) {
        falhar(403, 'Use a atribuição de responsável na área do administrador.');
    }
    if (typeof req.body.observacoes !== 'string' || req.body.observacoes.length > 20000) falhar(400, 'Informe observações com até 20.000 caracteres.');
    const admin = req.usuario.perfil === 'admin';
    const valores = [texto(req.body.observacoes) || null, req.params.id];
    if (!admin) valores.push(req.usuario.id);
    const { rows } = await pool.query(`
        UPDATE leads SET observacoes = $1, ultimo_contato = NOW()
        WHERE id = $2 AND excluido_em IS NULL ${admin ? '' : 'AND vendedor_id = $3'} RETURNING *`, valores);
    if (!rows.length) falhar(404, 'Lead não encontrado ou sem permissão de acesso.');
    res.json({ mensagem: 'Acompanhamento salvo com sucesso.', lead: rows[0] });
}));
app.patch('/api/leads/:id/vendedor', autenticar, somenteAdmin, validarId, executar(async (req, res) => {
    const id = req.body.vendedor_id;
    if (!idValido(id)) falhar(400, 'Selecione um responsável válido.');
    const lead = await transacao(async cliente => {
        const destino = await cliente.query(
            "SELECT id, nome FROM usuarios WHERE id = $1 AND ativo = TRUE AND perfil IN ('admin', 'vendedor') FOR SHARE", [id]
        );
        if (!destino.rows.length) falhar(400, 'Responsável não encontrado ou desativado.');
        const { rows } = await cliente.query(
            'UPDATE leads SET vendedor_id = $1, vendedor = $2 WHERE id = $3 AND excluido_em IS NULL RETURNING *',
            [destino.rows[0].id, destino.rows[0].nome, req.params.id]
        );
        if (!rows.length) falhar(404, 'Lead não encontrado.');
        return rows[0];
    });
    res.json({ mensagem: 'Responsável atualizado.', lead });
}));

app.use((erro, req, res, next) => {
    if (res.headersSent) return next(erro);
    const status = erro.status || (erro.code === '23505' ? 409 : 500);
    if (status >= 500) console.error('Erro no servidor:', erro.message);
    res.status(status).json({ erro: erro.code === '23505' ? 'Este cadastro já existe.' :
        status >= 500 ? 'Não foi possível concluir a operação.' : erro.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`DDE Telecom rodando na porta ${PORT}`));
