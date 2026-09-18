// =====================================================
// DDE TELECOM - SERVER V5.1
// SITE + API + POSTGRESQL + CRM + JWT + ADMINISTRADOR
// SEGURANCA DE PRODUCAO
// =====================================================

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

require('dotenv').config();

const pool = require('./database/db');

const app = express();


// =====================================================
// CONFIGURACOES DE SEGURANCA
// =====================================================

app.disable('x-powered-by');

if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

app.use(
    helmet({
        contentSecurityPolicy: false
    })
);


// =====================================================
// CORS
// =====================================================

const origensPermitidas = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    process.env.FRONTEND_URL
].filter(Boolean);

app.use(
    cors({
        origin: (origin, callback) => {

            if (!origin) {
                return callback(null, true);
            }

            if (origensPermitidas.includes(origin)) {
                return callback(null, true);
            }

            return callback(
                new Error('Origem nao autorizada pelo CORS.')
            );
        },

        methods: [
            'GET',
            'POST',
            'PATCH',
            'DELETE',
            'OPTIONS'
        ],

        allowedHeaders: [
            'Content-Type',
            'Authorization'
        ]
    })
);


// =====================================================
// CORPO DAS REQUISICOES
// =====================================================

app.use(
    express.json({
        limit: '100kb'
    })
);


// =====================================================
// PROTECAO DO LOGIN
// =====================================================

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,

    message: {
        erro:
            'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.'
    }
});


// =====================================================
// ARQUIVOS PUBLICOS
// =====================================================

app.use(
    express.static(
        path.join(__dirname, '..', 'public')
    )
);


// =====================================================
// AUTENTICACAO JWT
// =====================================================

function autenticarToken(req, res, next) {

    const authorization =
        req.headers.authorization;


    if (!authorization) {

        return res.status(401).json({
            erro: 'Token de autenticação não informado.'
        });
    }


    const partes =
        authorization.split(' ');


    if (
        partes.length !== 2 ||
        partes[0] !== 'Bearer' ||
        !partes[1]
    ) {

        return res.status(401).json({
            erro: 'Token de autenticação inválido.'
        });
    }


    try {

        const usuario =
            jwt.verify(
                partes[1],
                process.env.JWT_SECRET
            );


        req.usuario =
            usuario;


        next();

    } catch (erro) {

        return res.status(401).json({
            erro:
                'Sessão inválida ou expirada. Faça login novamente.'
        });
    }
}


// =====================================================
// SOMENTE ADMINISTRADOR
// =====================================================

function somenteAdmin(req, res, next) {

    if (
        !req.usuario ||
        req.usuario.perfil !== 'admin'
    ) {

        return res.status(403).json({
            erro:
                'Acesso permitido somente para administradores.'
        });
    }


    next();
}


// =====================================================
// HEALTH CHECK DO SERVIDOR
// =====================================================

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        empresa: 'DDE Telecom'
    });
});


// =====================================================
// STATUS DA API
// =====================================================

app.get('/api/status', async (req, res) => {

    try {

        const resultado =
            await pool.query(
                'SELECT NOW() AS data_hora'
            );


        res.json({
            status: 'online',
            empresa: 'DDE Telecom',
            banco: 'PostgreSQL conectado',
            dataHora:
                resultado.rows[0].data_hora
        });

    } catch (erro) {

        console.error(
            'Erro ao verificar status:',
            erro
        );


        res.status(500).json({
            status: 'erro',
            banco:
                'Falha na conexão com PostgreSQL'
        });
    }
});


// =====================================================
// LOGIN
// =====================================================

app.post('/api/auth/login', loginLimiter, async (req, res) => {

    try {

        const {
            email,
            senha
        } = req.body;


        if (!email || !senha) {

            return res.status(400).json({
                erro:
                    'E-mail e senha são obrigatórios.'
            });
        }


        const emailTratado =
            String(email)
                .trim()
                .toLowerCase();


        const resultado =
            await pool.query(
                `
                SELECT
                    id,
                    nome,
                    email,
                    senha_hash,
                    perfil,
                    ativo
                FROM usuarios
                WHERE LOWER(email) = $1
                LIMIT 1
                `,
                [
                    emailTratado
                ]
            );


        if (
            resultado.rows.length === 0
        ) {

            return res.status(401).json({
                erro:
                    'E-mail ou senha inválidos.'
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


        if (usuario.perfil !== 'admin') {

            return res.status(403).json({
                erro:
                    'Acesso permitido somente para o Administrador DDE.'
            });
        }


        const senhaCorreta =
            await bcrypt.compare(
                senha,
                usuario.senha_hash
            );


        if (!senhaCorreta) {

            return res.status(401).json({
                erro:
                    'E-mail ou senha inválidos.'
            });
        }


        if (!process.env.JWT_SECRET) {

            return res.status(500).json({
                erro:
                    'JWT_SECRET não configurado.'
            });
        }


        const token =
            jwt.sign(
                {
                    id: usuario.id,
                    email: usuario.email,
                    perfil: usuario.perfil
                },
                process.env.JWT_SECRET,
                {
                    expiresIn:
                        process.env.JWT_EXPIRES_IN ||
                        '8h'
                }
            );


        res.json({

            mensagem:
                'Login realizado com sucesso.',

            token,

            usuario: {
                id: usuario.id,
                nome: usuario.nome,
                email: usuario.email,
                perfil: usuario.perfil
            }
        });

    } catch (erro) {

        console.error(
            'Erro ao realizar login:',
            erro
        );


        res.status(500).json({
            erro:
                'Não foi possível realizar o login.'
        });
    }
});


// =====================================================
// USUÁRIO LOGADO
// =====================================================

app.get(
    '/api/auth/me',
    autenticarToken,
    async (req, res) => {

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


            if (usuario.perfil !== 'admin') {

                return res.status(403).json({
                    erro:
                        'Acesso permitido somente para o Administrador DDE.'
                });
            }


            res.json({
                usuario
            });

        } catch (erro) {

            console.error(
                'Erro ao validar sessão:',
                erro
            );


            res.status(500).json({
                erro:
                    'Não foi possível validar a sessão.'
            });
        }
    }
);


// =====================================================
// PLANOS - PÚBLICO
// =====================================================

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
                    fidelidade_meses
                FROM planos
                WHERE ativo = TRUE
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


// =====================================================
// PLANOS - ADMINISTRATIVO
// =====================================================

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


// =====================================================
// LISTAR TODOS OS PLANOS - ADMIN
// =====================================================

app.get(
    '/api/admin/planos',
    autenticarToken,
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
// BUSCAR UM PLANO - ADMIN
// =====================================================

app.get(
    '/api/admin/planos/:id',
    autenticarToken,
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


// =====================================================
// CRIAR PLANO - ADMIN
// =====================================================

app.post(
    '/api/admin/planos',
    autenticarToken,
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


// =====================================================
// EDITAR PLANO - ADMIN
// =====================================================

app.patch(
    '/api/admin/planos/:id',
    autenticarToken,
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


// =====================================================
// ATIVAR / DESATIVAR PLANO - ADMIN
// =====================================================

app.patch(
    '/api/admin/planos/:id/status',
    autenticarToken,
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


// =====================================================
// EXCLUIR PLANO - ADMIN
// =====================================================

app.delete(
    '/api/admin/planos/:id',
    autenticarToken,
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


// =====================================================
// CADASTRAR LEAD - PÚBLICO
// TODO LEAD ENTRA PARA O ADMINISTRADOR DDE
// =====================================================

app.post('/api/leads', async (req, res) => {

    try {

        const {
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
            interesse
        } = req.body;


        if (!nome || !telefone) {

            return res.status(400).json({
                erro:
                    'Nome e telefone são obrigatórios.'
            });
        }


        const administrador =
            await pool.query(
                `
                SELECT
                    id,
                    nome
                FROM usuarios
                WHERE
                    perfil = 'admin'
                    AND ativo = TRUE
                ORDER BY id
                LIMIT 1
                `
            );


        if (
            administrador.rows.length === 0
        ) {

            return res.status(500).json({
                erro:
                    'Administrador DDE não encontrado ou desativado.'
            });
        }


        const admin =
            administrador.rows[0];


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
                    vendedor_id
                )
                VALUES (
                    $1, $2, $3, $4, $5,
                    $6, $7, $8, $9, $10,
                    $11, $12, $13
                )
                RETURNING *
                `,
                [
                    nome.trim(),
                    telefone.trim(),
                    email?.trim() || null,
                    cep?.trim() || null,
                    logradouro?.trim() || null,
                    numero?.trim() || null,
                    complemento?.trim() || null,
                    bairro?.trim() || null,
                    cidade?.trim() || null,
                    estado?.trim().toUpperCase() || null,
                    interesse?.trim() || null,
                    admin.nome,
                    admin.id
                ]
            );


        res.status(201).json({
            mensagem:
                'Lead cadastrado com sucesso.',

            lead:
                resultado.rows[0]
        });

    } catch (erro) {

        console.error(
            'Erro ao cadastrar lead:',
            erro
        );


        res.status(500).json({
            erro:
                'Não foi possível cadastrar o lead.'
        });
    }
});


// =====================================================
// LISTAR LEADS - SOMENTE ADMINISTRADOR
// =====================================================

app.get(
    '/api/leads',
    autenticarToken,
    somenteAdmin,
    async (req, res) => {

        try {

            const resultado =
                await pool.query(`
                    SELECT *
                    FROM leads
                    ORDER BY id DESC
                `);


            res.json(
                resultado.rows
            );

        } catch (erro) {

            console.error(
                'Erro ao buscar leads:',
                erro
            );


            res.status(500).json({
                erro:
                    'Não foi possível carregar os leads.'
            });
        }
    }
);


// =====================================================
// BUSCAR LEAD - SOMENTE ADMINISTRADOR
// =====================================================

app.get(
    '/api/leads/:id',
    autenticarToken,
    somenteAdmin,
    async (req, res) => {

        try {

            const { id } =
                req.params;


            if (!/^\d+$/.test(id)) {

                return res.status(400).json({
                    erro:
                        'ID inválido.'
                });
            }


            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM leads
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [
                        id
                    ]
                );


            if (
                resultado.rows.length === 0
            ) {

                return res.status(404).json({
                    erro:
                        'Lead não encontrado.'
                });
            }


            res.json(
                resultado.rows[0]
            );

        } catch (erro) {

            console.error(
                'Erro ao buscar lead:',
                erro
            );


            res.status(500).json({
                erro:
                    'Não foi possível carregar o lead.'
            });
        }
    }
);


// =====================================================
// ALTERAR STATUS DO LEAD - SOMENTE ADMINISTRADOR
// =====================================================

app.patch(
    '/api/leads/:id/status',
    autenticarToken,
    somenteAdmin,
    async (req, res) => {

        try {

            const { id } =
                req.params;

            const {
                status
            } = req.body;


            if (!/^\d+$/.test(id)) {

                return res.status(400).json({
                    erro:
                        'ID inválido.'
                });
            }


            const statusPermitidos = [
                'novo',
                'atendimento',
                'convertido',
                'nao_convertido'
            ];


            if (
                !statusPermitidos.includes(
                    status
                )
            ) {

                return res.status(400).json({
                    erro:
                        'Status inválido.'
                });
            }


            const registrarContato =
                status !== 'novo';


            const resultado =
                await pool.query(
                    `
                    UPDATE leads

                    SET
                        status = $1,

                        ultimo_contato =
                            CASE
                                WHEN $2 = TRUE
                                THEN NOW()
                                ELSE ultimo_contato
                            END

                    WHERE id = $3

                    RETURNING *
                    `,
                    [
                        status,
                        registrarContato,
                        id
                    ]
                );


            if (
                resultado.rows.length === 0
            ) {

                return res.status(404).json({
                    erro:
                        'Lead não encontrado.'
                });
            }


            res.json({
                mensagem:
                    'Status atualizado com sucesso.',

                lead:
                    resultado.rows[0]
            });

        } catch (erro) {

            console.error(
                'Erro ao atualizar status:',
                erro
            );


            res.status(500).json({
                erro:
                    'Não foi possível atualizar o status.'
            });
        }
    }
);


// =====================================================
// ACOMPANHAMENTO COMERCIAL - SOMENTE ADMINISTRADOR
// =====================================================

app.patch(
    '/api/leads/:id/comercial',
    autenticarToken,
    somenteAdmin,
    async (req, res) => {

        try {

            const { id } =
                req.params;


            const {
                observacoes
            } = req.body;


            if (!/^\d+$/.test(id)) {

                return res.status(400).json({
                    erro:
                        'ID inválido.'
                });
            }


            const observacoesTratadas =
                typeof observacoes === 'string'
                    ? observacoes.trim()
                    : '';


            const resultado =
                await pool.query(
                    `
                    UPDATE leads

                    SET
                        vendedor = 'Administrador DDE',
                        vendedor_id = $1,
                        observacoes = $2,
                        ultimo_contato = NOW()

                    WHERE id = $3

                    RETURNING *
                    `,
                    [
                        req.usuario.id,
                        observacoesTratadas || null,
                        id
                    ]
                );


            if (
                resultado.rows.length === 0
            ) {

                return res.status(404).json({
                    erro:
                        'Lead não encontrado.'
                });
            }


            res.json({
                mensagem:
                    'Acompanhamento salvo com sucesso.',

                lead:
                    resultado.rows[0]
            });

        } catch (erro) {

            console.error(
                'Erro ao atualizar acompanhamento:',
                erro
            );


            res.status(500).json({
                erro:
                    'Não foi possível salvar o acompanhamento.'
            });
        }
    }
);


// =====================================================
// INICIAR SERVIDOR
// =====================================================

const PORT =
    process.env.PORT || 3000;


app.listen(PORT, () => {

    console.log(
        `DDE Telecom rodando na porta ${PORT}`
    );
});