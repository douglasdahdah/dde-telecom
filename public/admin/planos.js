// =====================================================
// DDE TELECOM - PLANOS ADMIN V20
// =====================================================


// =====================================================
// SESSAO
// =====================================================

const token =
    (localStorage.getItem('dde_admin_token') || localStorage.getItem('dde_admin_token'));


if (!token) {

    window.location.replace(
        '/admin/login.html'
    );
}


// =====================================================
// ELEMENTOS
// =====================================================

const lista =
    document.getElementById(
        'lista-planos-admin'
    );

const mensagem =
    document.getElementById(
        'mensagem-planos'
    );

const pesquisa =
    document.getElementById(
        'pesquisa-plano'
    );

const filtroTipo =
    document.getElementById(
        'filtro-tipo'
    );

const filtroAtivo =
    document.getElementById(
        'filtro-ativo'
    );

const totalPlanos =
    document.getElementById(
        'total-planos'
    );

const totalAtivos =
    document.getElementById(
        'total-ativos'
    );

const totalInativos =
    document.getElementById(
        'total-inativos'
    );

const totalCategorias =
    document.getElementById(
        'total-categorias'
    );

const nomeUsuario =
    document.getElementById(
        'nome-usuario'
    );

const sair =
    document.getElementById(
        'sair'
    );

const atualizar =
    document.getElementById(
        'atualizar-planos'
    );

const novoPlano =
    document.getElementById(
        'novo-plano'
    );


// =====================================================
// MODAL
// =====================================================

const modal =
    document.getElementById(
        'modal-plano'
    );

const modalFundo =
    document.getElementById(
        'modal-plano-fundo'
    );

const fecharModal =
    document.getElementById(
        'fechar-modal-plano'
    );

const tituloModal =
    document.getElementById(
        'titulo-modal-plano'
    );

const formulario =
    document.getElementById(
        'form-plano'
    );

const mensagemForm =
    document.getElementById(
        'mensagem-form-plano'
    );


// =====================================================
// CAMPOS
// =====================================================

const planoId =
    document.getElementById(
        'plano-id'
    );

const planoNome =
    document.getElementById(
        'plano-nome'
    );

const planoTipo =
    document.getElementById(
        'plano-tipo'
    );

const planoAtivo =
    document.getElementById(
        'plano-ativo'
    );

const planoVelocidade =
    document.getElementById(
        'plano-velocidade'
    );

const planoFranquia =
    document.getElementById(
        'plano-franquia'
    );

const planoPreco =
    document.getElementById(
        'plano-preco'
    );

const planoSelo =
    document.getElementById(
        'plano-selo'
    );

const planoOrdem =
    document.getElementById(
        'plano-ordem'
    );

const planoFidelidade =
    document.getElementById(
        'plano-fidelidade'
    );

const planoDestaque =
    document.getElementById(
        'plano-destaque'
    );

const planoDescricao =
    document.getElementById(
        'plano-descricao'
    );

const planoBeneficios =
    document.getElementById(
        'plano-beneficios'
    );


const planoPromocional=document.getElementById('plano-promocional');
const planoPrecoOriginal=document.getElementById('plano-preco-original');
const planoValidade=document.getElementById('plano-validade');
const planoCondicoes=document.getElementById('plano-condicoes');
let planos = [];


// =====================================================
// HEADERS
// =====================================================

function headersAutenticados() {

    return {

        'Content-Type':
            'application/json',

        'Authorization':
            `Bearer ${token}`

    };
}


// =====================================================
// LOGOUT
// =====================================================

function logout() {

    localStorage.removeItem(
        'dde_admin_token'
    );

    localStorage.removeItem(
        'dde_admin_usuario'
    );

    window.location.replace(
        '/admin/login.html'
    );
}


sair?.addEventListener(
    'click',
    logout
);


// =====================================================
// VALIDAR SESSAO
// =====================================================

async function validarSessao() {

    try {

        const resposta =
            await fetch(
                '/api/auth/me',
                {
                    headers: {
                        'Authorization':
                            `Bearer ${token}`
                    }
                }
            );


        if (
            resposta.status === 401 ||
            resposta.status === 403
        ) {

            logout();

            return false;
        }


        const dados =
            await resposta.json();


        if (!resposta.ok) {

            throw new Error(
                dados.erro ||
                'Nao foi possivel validar a sessao.'
            );
        }


        if (
            dados.usuario?.perfil !==
            'admin'
        ) {

            window.location.replace(
                '/admin/index.html'
            );

            return false;
        }


        if (nomeUsuario) {

            nomeUsuario.textContent =
                dados.usuario.nome ||
                dados.usuario.email ||
                'Administrador';
        }


        return true;

    } catch (erro) {

        console.error(
            'Erro ao validar sessao:',
            erro
        );


        logout();

        return false;
    }
}


// =====================================================
// CARREGAR PLANOS
// =====================================================

async function carregarPlanos() {

    if (mensagem) {

        mensagem.textContent =
            'Carregando planos...';
    }


    try {

        const resposta =
            await fetch(
                '/api/admin/planos',
                {
                    headers: {
                        'Authorization':
                            `Bearer ${token}`
                    }
                }
            );


        if (
            resposta.status === 401 ||
            resposta.status === 403
        ) {

            logout();

            return;
        }


        const dados =
            await resposta.json();


        if (!resposta.ok) {

            throw new Error(
                dados.erro ||
                'Nao foi possivel carregar os planos.'
            );
        }


        planos =
            Array.isArray(dados)
                ? dados
                : [];


        atualizarIndicadores();

        renderizarPlanos();


        if (mensagem) {

            mensagem.textContent = '';
        }

    } catch (erro) {

        console.error(
            'Erro ao carregar planos:',
            erro
        );


        if (mensagem) {

            mensagem.textContent =
                erro.message;
        }
    }
}


// =====================================================
// INDICADORES
// =====================================================

function atualizarIndicadores() {

    totalPlanos.textContent =
        planos.length;


    totalAtivos.textContent =
        planos.filter(
            plano =>
                plano.ativo === true
        ).length;


    totalInativos.textContent =
        planos.filter(
            plano =>
                plano.ativo === false
        ).length;


    const categorias =
        new Set(
            planos
                .map(
                    plano =>
                        plano.tipo
                )
                .filter(Boolean)
        );


    totalCategorias.textContent =
        categorias.size;
}


// =====================================================
// FILTROS
// =====================================================

function obterPlanosFiltrados() {

    const termo =
        pesquisa
            ? pesquisa.value
                .trim()
                .toLowerCase()
            : '';


    const tipo =
        filtroTipo
            ? filtroTipo.value
            : '';


    const ativo =
        filtroAtivo
            ? filtroAtivo.value
            : '';


    return planos.filter(
        plano => {

            const texto =
                [
                    plano.nome,
                    plano.tipo,
                    plano.velocidade,
                    plano.franquia,
                    plano.selo,
                    plano.descricao
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();


            const buscaOk =
                !termo ||
                texto.includes(
                    termo
                );


            const tipoOk =
                !tipo ||
                plano.tipo === tipo;


            const ativoOk =
                ativo === '' ||
                String(
                    plano.ativo
                ) === ativo;


            return (
                buscaOk &&
                tipoOk &&
                ativoOk
            );
        }
    );
}


// =====================================================
// RENDERIZAR
// =====================================================

function renderizarPlanos() {

    if (!lista) {
        return;
    }


    const dados =
        obterPlanosFiltrados();


    if (!dados.length) {

        lista.innerHTML = `

            <tr>

                <td colspan="6">
                    Nenhum plano encontrado.
                </td>

            </tr>

        `;

        return;
    }


    lista.innerHTML =
        dados
            .map(
                plano => {

                    const classeStatus =
                        plano.ativo
                            ? 'ativo'
                            : 'inativo';


                    const textoStatus =
                        plano.ativo
                            ? 'Ativo'
                            : 'Inativo';


                    const classeAcaoStatus =
                        plano.ativo
                            ? 'status-desativar'
                            : 'status-ativar';


                    const textoAcaoStatus =
                        plano.ativo
                            ? '\u23FB Desativar plano'
                            : '\u25B6 Ativar plano';


                    return `

                        <tr>

                            <td>

                                <strong>
                                    ${escapeHtml(
                                        plano.nome
                                    )}
                                </strong>

                                <small>
                                    ${escapeHtml(
                                        plano.selo ||
                                        plano.descricao ||
                                        ''
                                    )}
                                </small>

                            </td>


                            <td>

                                ${escapeHtml(
                                    textoTipo(
                                        plano.tipo
                                    )
                                )}

                            </td>


                            <td>

                                ${escapeHtml(
                                    plano.velocidade ||
                                    plano.franquia ||
                                    '-'
                                )}

                            </td>


                            <td>

                                <strong>
                                    ${formatarPreco(
                                        plano.preco
                                    )}
                                </strong>

                            </td>


                            <td>

                                <span
                                    class="
                                        status-plano
                                        ${classeStatus}
                                    "
                                >
                                    ${textoStatus}
                                </span>

                            </td>


                            <td>

                                <div class="acoes-plano">

                                    <button
                                        type="button"
                                        class="btn-editar-plano"
                                        data-acao="editar"
                                        data-id="${plano.id}"
                                    >
                                        Editar
                                    </button>


                                    <div class="menu-plano">

                                        <button
                                            type="button"
                                            class="btn-menu-plano"
                                            data-acao="menu"
                                            data-id="${plano.id}"
                                            aria-label="Mais acoes"
                                            title="Mais acoes"
                                        >
                                            &#8942;
                                        </button>


                                        <div
                                            class="menu-plano-lista"
                                            data-menu-id="${plano.id}"
                                        >

                                            <button
                                                type="button"
                                                class="
                                                    menu-plano-item
                                                    ${classeAcaoStatus}
                                                "
                                                data-acao="status"
                                                data-id="${plano.id}"
                                            >
                                                ${textoAcaoStatus}
                                            </button>


                                            <div class="menu-divisor"></div>


                                            <button
                                                type="button"
                                                class="
                                                    menu-plano-item
                                                    excluir
                                                "
                                                data-acao="excluir"
                                                data-id="${plano.id}"
                                            >
                                                \u2715 Excluir plano
                                            </button>

                                        </div>

                                    </div>

                                </div>

                            </td>

                        </tr>

                    `;
                }
            )
            .join('');
}


// =====================================================
// MENU DE ACOES
// =====================================================

function fecharMenus() {

    document
        .querySelectorAll(
            '.menu-plano-lista.aberto'
        )
        .forEach(
            menu => {

                menu.classList.remove(
                    'aberto'
                );
            }
        );


    document
        .querySelectorAll(
            '.btn-menu-plano.aberto'
        )
        .forEach(
            botao => {

                botao.classList.remove(
                    'aberto'
                );
            }
        );
}


document.addEventListener(
    'click',
    evento => {

        if (
            !evento.target.closest(
                '.menu-plano'
            )
        ) {

            fecharMenus();
        }
    }
);


// =====================================================
// CLIQUES DA TABELA
// =====================================================

lista?.addEventListener(
    'click',
    async evento => {

        const botao =
            evento.target.closest(
                'button[data-acao]'
            );


        if (!botao) {
            return;
        }


        const acao =
            botao.dataset.acao;


        const id =
            Number(
                botao.dataset.id
            );


        if (acao === 'menu') {

            const menu =
                document.querySelector(
                    `[data-menu-id="${id}"]`
                );


            if (!menu) {
                return;
            }


            const estavaAberto =
                menu.classList.contains(
                    'aberto'
                );


            fecharMenus();


            if (!estavaAberto) {

                menu.classList.add(
                    'aberto'
                );

                botao.classList.add(
                    'aberto'
                );
            }


            return;
        }


        fecharMenus();


        const plano =
            planos.find(
                item =>
                    Number(
                        item.id
                    ) === id
            );


        if (!plano) {
            return;
        }


        if (acao === 'editar') {

            preencherFormulario(
                plano
            );

            return;
        }


        if (acao === 'status') {

            await alterarStatus(
                plano
            );

            return;
        }


        if (acao === 'excluir') {

            await excluirPlano(
                plano
            );
        }
    }
);


// =====================================================
// NOVO PLANO
// =====================================================

novoPlano?.addEventListener(
    'click',
    () => {

        formulario.reset();


        planoId.value =
            '';


        planoAtivo.value =
            'true';


        planoOrdem.value =
            '0';


        planoFidelidade.value =
            '';


        planoDestaque.checked =
            false;


        tituloModal.textContent =
            'Novo plano';


        mensagemForm.textContent =
            '';


        abrirModal();


        setTimeout(
            () => {

                planoNome.focus();

            },
            100
        );
    }
);


// =====================================================
// EDITAR
// =====================================================

function preencherFormulario(plano) {
    planoPromocional.checked=plano.promocional===true;
    planoPrecoOriginal.value=plano.preco_original??'';
    planoValidade.value=plano.oferta_valida_ate||'';
    planoCondicoes.value=plano.observacoes||'';

    planoId.value =
        plano.id;


    planoNome.value =
        plano.nome ||
        '';


    planoTipo.value =
        plano.tipo ||
        '';


    planoAtivo.value =
        String(
            plano.ativo !== false
        );


    planoVelocidade.value =
        plano.velocidade ||
        '';


    planoFranquia.value =
        plano.franquia ||
        '';


    planoPreco.value =
        plano.preco ??
        '';


    planoSelo.value =
        plano.selo ||
        '';


    planoOrdem.value =
        plano.ordem ??
        0;


    planoFidelidade.value =
        plano.fidelidade_meses ??
        '';


    planoDestaque.checked =
        plano.destaque === true;


    planoDescricao.value =
        plano.descricao ||
        '';


    planoBeneficios.value =
        beneficiosParaTexto(
            plano.beneficios
        );


    tituloModal.textContent =
        'Editar plano';


    mensagemForm.textContent =
        '';


    abrirModal();
}


// =====================================================
// SALVAR
// =====================================================

formulario?.addEventListener(
    'submit',
    async evento => {

        evento.preventDefault();


        mensagemForm.textContent =
            'Salvando plano...';


        const id =
            planoId.value;


        const dados = {
            promocional:planoPromocional.checked,
            preco_original:planoPrecoOriginal.value===''?null:Number(planoPrecoOriginal.value),
            oferta_valida_ate:planoValidade.value||null,
            observacoes:planoCondicoes.value.trim()||null,

            nome:
                planoNome.value.trim(),

            tipo:
                planoTipo.value,

            velocidade:
                planoVelocidade.value.trim(),

            franquia:
                planoFranquia.value.trim(),

            preco:
                Number(
                    planoPreco.value
                ),

            descricao:
                planoDescricao.value.trim(),

            ativo:
                planoAtivo.value ===
                'true',

            selo:
                planoSelo.value.trim(),

            ordem:
                Number(
                    planoOrdem.value ||
                    0
                ),

            fidelidade_meses:
                planoFidelidade.value === ''
                    ? null
                    : Number(
                        planoFidelidade.value
                    ),

            destaque:
                planoDestaque.checked,

            beneficios:
                textoParaBeneficios(
                    planoBeneficios.value
                )

        };


        try {

            const resposta =
                await fetch(

                    id
                        ? `/api/admin/planos/${id}`
                        : '/api/admin/planos',

                    {

                        method:
                            id
                                ? 'PATCH'
                                : 'POST',

                        headers:
                            headersAutenticados(),

                        body:
                            JSON.stringify(
                                dados
                            )

                    }
                );


            const resultado =
                await resposta.json();


            if (
                resposta.status === 401 ||
                resposta.status === 403
            ) {

                logout();

                return;
            }


            if (!resposta.ok) {

                throw new Error(
                    resultado.erro ||
                    'Nao foi possivel salvar o plano.'
                );
            }


            mensagemForm.textContent =
                'Plano salvo com sucesso.';


            await carregarPlanos();


            setTimeout(
                fecharModalPlano,
                500
            );

        } catch (erro) {

            console.error(
                'Erro ao salvar plano:',
                erro
            );


            mensagemForm.textContent =
                erro.message;
        }
    }
);


// =====================================================
// ALTERAR STATUS
// =====================================================

async function alterarStatus(
    plano
) {

    const novoStatus =
        !plano.ativo;


    const confirmar =
        window.confirm(

            novoStatus

                ? `Ativar o plano "${plano.nome}"?`

                : `Desativar o plano "${plano.nome}"?`

        );


    if (!confirmar) {
        return;
    }


    try {

        const resposta =
            await fetch(

                `/api/admin/planos/${plano.id}/status`,

                {

                    method:
                        'PATCH',

                    headers:
                        headersAutenticados(),

                    body:
                        JSON.stringify({
                            ativo:
                                novoStatus
                        })

                }
            );


        const resultado =
            await resposta.json();


        if (!resposta.ok) {

            throw new Error(
                resultado.erro ||
                'Nao foi possivel alterar o plano.'
            );
        }


        await carregarPlanos();

    } catch (erro) {

        console.error(
            erro
        );


        alert(
            erro.message
        );
    }
}


// =====================================================
// EXCLUIR
// =====================================================

async function excluirPlano(
    plano
) {

    const confirmar =
        window.confirm(

            `Excluir definitivamente o plano "${plano.nome}"?\n\nEssa operacao nao podera ser desfeita.`

        );


    if (!confirmar) {
        return;
    }


    try {

        const resposta =
            await fetch(

                `/api/admin/planos/${plano.id}`,

                {

                    method:
                        'DELETE',

                    headers:
                        headersAutenticados()

                }
            );


        const resultado =
            await resposta.json();


        if (!resposta.ok) {

            throw new Error(
                resultado.erro ||
                'Nao foi possivel excluir o plano.'
            );
        }


        await carregarPlanos();

    } catch (erro) {

        console.error(
            erro
        );


        alert(
            erro.message
        );
    }
}


// =====================================================
// MODAL
// =====================================================

function abrirModal() {

    modal.classList.add(
        'aberto'
    );


    document.body.style.overflow =
        'hidden';
}


function fecharModalPlano() {

    modal.classList.remove(
        'aberto'
    );


    document.body.style.overflow =
        '';
}


fecharModal?.addEventListener(
    'click',
    fecharModalPlano
);


modalFundo?.addEventListener(
    'click',
    fecharModalPlano
);


document.addEventListener(
    'keydown',
    evento => {

        if (
            evento.key === 'Escape'
        ) {

            fecharMenus();


            if (
                modal?.classList.contains(
                    'aberto'
                )
            ) {

                fecharModalPlano();
            }
        }
    }
);


// =====================================================
// FILTROS
// =====================================================

pesquisa?.addEventListener(
    'input',
    renderizarPlanos
);


filtroTipo?.addEventListener(
    'change',
    renderizarPlanos
);


filtroAtivo?.addEventListener(
    'change',
    renderizarPlanos
);


atualizar?.addEventListener(
    'click',
    carregarPlanos
);


// =====================================================
// AUXILIARES
// =====================================================

function textoTipo(
    tipo
) {

    const mapa = {

        internet:
            'Internet Fibra',

        controle:
            'Controle',

        pos:
            'P\u00f3s-pago'

    };


    return (
        mapa[tipo] ||
        tipo ||
        '-'
    );
}


function formatarPreco(
    valor
) {

    return Number(
        valor ||
        0
    )
        .toLocaleString(
            'pt-BR',
            {

                style:
                    'currency',

                currency:
                    'BRL'

            }
        );
}


function beneficiosParaTexto(
    beneficios
) {

    if (
        Array.isArray(
            beneficios
        )
    ) {

        return beneficios
            .filter(Boolean)
            .join('\n');
    }


    if (
        typeof beneficios ===
        'string'
    ) {

        const texto =
            beneficios.trim();


        if (!texto) {
            return '';
        }


        try {

            const convertido =
                JSON.parse(
                    texto
                );


            if (
                Array.isArray(
                    convertido
                )
            ) {

                return convertido
                    .filter(Boolean)
                    .join('\n');
            }

        } catch (erro) {

            return texto;
        }


        return texto;
    }


    return '';
}


function textoParaBeneficios(
    texto
) {

    return String(
        texto ||
        ''
    )
        .split('\n')
        .map(
            item =>
                item.trim()
        )
        .filter(Boolean);
}


function escapeHtml(
    valor
) {

    return String(
        valor ??
        ''
    )
        .replaceAll(
            '&',
            '&amp;'
        )
        .replaceAll(
            '<',
            '&lt;'
        )
        .replaceAll(
            '>',
            '&gt;'
        )
        .replaceAll(
            '"',
            '&quot;'
        )
        .replaceAll(
            "'",
            '&#039;'
        );
}


// =====================================================
// INICIAR
// =====================================================

async function iniciar() {

    const sessaoValida =
        await validarSessao();


    if (!sessaoValida) {
        return;
    }


    await carregarPlanos();
}


iniciar();