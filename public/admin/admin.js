// =====================================================
// DDE TELECOM - ADMIN.JS V4.0
// PAINEL ADMINISTRADOR + LEADS + STATUS
// =====================================================


// =====================================================
// SESSÃO
// =====================================================

const token = (localStorage.getItem('dde_admin_token') || localStorage.getItem('dde_admin_token'));

if (!token) {
    window.location.replace('/admin/login.html');
}


// =====================================================
// ELEMENTOS
// =====================================================

const listaLeads =
    document.getElementById('lista-leads');

const mensagem =
    document.getElementById('mensagem');

const pesquisa =
    document.getElementById('pesquisa');

const filtroStatus =
    document.getElementById('filtro-status');

const botaoAtualizar =
    document.getElementById('atualizar');

const botaoSair =
    document.getElementById('sair');

const nomeUsuario =
    document.getElementById('nome-usuario');

const totalLeads =
    document.getElementById('total-leads');

const totalNovos =
    document.getElementById('total-novos');

const totalAtendimento =
    document.getElementById('total-atendimento');

const totalConvertidos =
    document.getElementById('total-convertidos');


// =====================================================
// MODAL
// =====================================================

const modal =
    document.getElementById('modal-lead');

const fecharModal =
    document.getElementById('fechar-modal');

const fecharModalSecundario =
    document.getElementById(
        'modal-fechar-secundario'
    );

const modalNome =
    document.getElementById('modal-nome');

const modalStatus =
    document.getElementById('modal-status');

const modalTelefone =
    document.getElementById('modal-telefone');

const modalEmail =
    document.getElementById('modal-email');

const modalInteresse =
    document.getElementById('modal-interesse');

const modalOrigem =
    document.getElementById('modal-origem');

const modalCep =
    document.getElementById('modal-cep');

const modalEndereco =
    document.getElementById('modal-endereco');

const modalUltimoContato =
    document.getElementById(
        'modal-ultimo-contato'
    );

const campoObservacoes =
    document.getElementById(
        'campo-observacoes'
    );

const salvarComercial =
    document.getElementById(
        'salvar-comercial'
    );

const mensagemComercial =
    document.getElementById(
        'mensagem-comercial'
    );

const mensagemStatus =
    document.getElementById(
        'mensagem-status'
    );

const botoesStatus =
    document.querySelectorAll(
        '.botao-status'
    );

const botaoWhatsapp =
    document.getElementById(
        'modal-whatsapp'
    );


let leads = [];
let leadAtual = null;
let pedidoLeads = null;
let atualizacaoAutomatica = null;
let sessaoEncerrada = false;
let painelPronto = false;
const estadoAtualizacao = document.getElementById('atualizacao-leads');


// =====================================================
// HEADERS
// =====================================================

function headersAutenticados() {

    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}


// =====================================================
// LOGOUT
// =====================================================

function encerrarSessao() {
    sessaoEncerrada = true;
    painelPronto = false;
    clearInterval(atualizacaoAutomatica);

    localStorage.removeItem('dde_admin_token');
    localStorage.removeItem('dde_admin_usuario');

    window.location.replace(
        '/admin/login.html'
    );
}


botaoSair?.addEventListener(
    'click',
    encerrarSessao
);


// =====================================================
// AUTORIZAÇÃO
// =====================================================

function verificarAutorizacao(resposta) {

    if (
        resposta.status === 401 ||
        resposta.status === 403
    ) {

        encerrarSessao();

        return false;
    }

    return true;
}


// =====================================================
// VALIDAR LOGIN
// SOMENTE ADMINISTRADOR
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
            !verificarAutorizacao(
                resposta
            )
        ) {
            return false;
        }


        if (!resposta.ok) {

            throw new Error(
                'Não foi possível validar a sessão.'
            );
        }


        const dados =
            await resposta.json();


        const usuario =
            dados.usuario;


        if (
            !usuario ||
            usuario.perfil !== 'admin'
        ) {

            encerrarSessao();

            return false;
        }


        localStorage.setItem(
            'dde_admin_usuario',
            JSON.stringify(usuario)
        );


        if (nomeUsuario) {

            nomeUsuario.textContent =
                usuario.nome ||
                'Administrador DDE';
        }


        return true;

    } catch (erro) {

        console.error(
            'Erro ao validar sessão:',
            erro
        );


        encerrarSessao();

        return false;
    }
}


// =====================================================
// CARREGAR LEADS
// =====================================================

function carregarLeads(opcoes = {}) {
    if (pedidoLeads) return pedidoLeads;
    if (sessaoEncerrada) return Promise.resolve(false);
    const silencioso = opcoes.silencioso === true;
    if (mensagem && !silencioso) mensagem.textContent = 'Carregando leads...';
    pedidoLeads = (async () => {
        try {
            const resposta = await fetch('/api/leads', {
                headers: { Authorization: `Bearer ${token}` },
                cache: 'no-store', signal: AbortSignal.timeout(12000)
            });
            if (!verificarAutorizacao(resposta)) return false;
            if (!resposta.ok) throw new Error('Não foi possível carregar os leads.');
            const dados = await resposta.json();
            if (!Array.isArray(dados)) throw new Error('Resposta de leads inválida.');
            if (sessaoEncerrada) return false;
            leads = dados;
            atualizarIndicadores();
            renderizarLeads();
            if (mensagem) mensagem.textContent = '';
            if (estadoAtualizacao) {
                const hora = new Date().toLocaleTimeString('pt-BR');
                estadoAtualizacao.textContent = `Atualizado às ${hora} · automático a cada 20 s`;
                estadoAtualizacao.classList.remove('atualizacao-falhou');
            }
            return true;
        } catch (erro) {
            console.error('Erro ao carregar leads:', erro);
            if (!silencioso && mensagem) mensagem.textContent = 'Não foi possível carregar os leads.';
            if (estadoAtualizacao && !sessaoEncerrada) {
                estadoAtualizacao.textContent = 'Conexão indisponível. Tentaremos atualizar novamente.';
                estadoAtualizacao.classList.add('atualizacao-falhou');
            }
            return false;
        }
    })().finally(() => { pedidoLeads = null; });
    return pedidoLeads;
}

function atualizarAutomaticamente() {
    if (!painelPronto || sessaoEncerrada || document.hidden || modal?.classList.contains('aberto')) return;
    // Mantém a seleção de controles eventualmente abertos dentro da lista.
    if (listaLeads?.contains(document.activeElement) &&
        ['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)) return;
    return carregarLeads({ silencioso: true });
}


// =====================================================
// INDICADORES
// =====================================================

function atualizarIndicadores() {

    if (totalLeads) {

        totalLeads.textContent =
            leads.length;
    }


    if (totalNovos) {

        totalNovos.textContent =
            leads.filter(
                lead =>
                    lead.status === 'novo'
            ).length;
    }


    if (totalAtendimento) {

        totalAtendimento.textContent =
            leads.filter(
                lead =>
                    lead.status ===
                    'atendimento'
            ).length;
    }


    if (totalConvertidos) {

        totalConvertidos.textContent =
            leads.filter(
                lead =>
                    lead.status ===
                    'convertido'
            ).length;
    }
}


// =====================================================
// FILTRAR LEADS
// =====================================================

function obterLeadsFiltrados() {

    const termo =
        pesquisa
            ? pesquisa.value
                .trim()
                .toLowerCase()
            : '';


    const status =
        filtroStatus
            ? filtroStatus.value
            : '';


    return leads.filter(
        lead => {

            const texto =
                [
                    lead.nome,
                    lead.telefone,
                    lead.email,
                    lead.cidade,
                    lead.estado,
                    lead.interesse
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();


            const buscaOk =
                !termo ||
                texto.includes(termo);


            const statusOk =
                !status ||
                lead.status === status;


            return (
                buscaOk &&
                statusOk
            );
        }
    );
}


// =====================================================
// RENDERIZAR LEADS
// =====================================================

function renderizarLeads() {

    if (!listaLeads) {
        return;
    }


    const lista =
        obterLeadsFiltrados();


    if (!lista.length) {

        listaLeads.innerHTML = `
            <tr>
                <td colspan="7">
                    Nenhum lead encontrado.
                </td>
            </tr>
        `;

        return;
    }


    listaLeads.innerHTML =
        lista
            .map(
                lead => `

                    <tr>

                        <td>

                            <strong>
                                ${escaparHtml(
                                    lead.nome ||
                                    'Não informado'
                                )}
                            </strong>

                            <small>
                                ${escaparHtml(
                                    lead.email ||
                                    'E-mail não informado'
                                )}
                            </small>

                        </td>


                        <td>
                            ${escaparHtml(
                                formatarTelefone(
                                    lead.telefone
                                )
                            )}
                        </td>


                        <td>
                            ${escaparHtml(
                                lead.interesse ||
                                '-'
                            )}
                        </td>


                        <td>
                            ${escaparHtml(
                                montarLocalidade(
                                    lead
                                )
                            )}
                        </td>


                        <td>
                            ${montarStatus(
                                lead.status
                            )}
                        </td>


                        <td>
                            ${formatarData(
                                lead.criado_em
                            )}
                        </td>


                        <td>

                            <button
                                type="button"
                                class="btn-detalhes"
                                data-id="${lead.id}"
                            >
                                Ver detalhes
                            </button>

                        </td>

                    </tr>
                `
            )
            .join('');
}


// =====================================================
// STATUS
// =====================================================

function montarStatus(status) {

    const configuracao = {

        novo: {
            texto: 'Novo',
            classe: 'status-novo',
            icone: '+'
        },

        atendimento: {
            texto: 'Em atendimento',
            classe: 'status-atendimento',
            icone: '◷'
        },

        convertido: {
            texto: 'Venda realizada',
            classe: 'status-convertido',
            icone: '✓'
        },

        nao_convertido: {
            texto: 'Não convertido',
            classe: 'status-nao-convertido',
            icone: '×'
        }
    };


    const item =
        configuracao[status] ||
        configuracao.novo;


    return `
        <span
            class="status-lead ${item.classe}"
        >
            <span class="status-icone">
                ${item.icone}
            </span>

            ${item.texto}
        </span>
    `;
}


function textoStatus(status) {

    const mapa = {

        novo:
            'Novo',

        atendimento:
            'Em atendimento',

        convertido:
            'Venda realizada',

        nao_convertido:
            'Não convertido'
    };


    return (
        mapa[status] ||
        'Novo'
    );
}


// =====================================================
// TELEFONE
// =====================================================

function formatarTelefone(telefone) {

    if (!telefone) {
        return '-';
    }


    const numeros =
        String(telefone)
            .replace(/\D/g, '');


    let numero =
        numeros;


    if (
        numero.length === 13 &&
        numero.startsWith('55')
    ) {

        numero =
            numero.slice(2);
    }


    if (numero.length === 11) {

        return (
            `(${numero.slice(0, 2)}) ` +
            `${numero.slice(2, 7)}-` +
            `${numero.slice(7)}`
        );
    }


    if (numero.length === 10) {

        return (
            `(${numero.slice(0, 2)}) ` +
            `${numero.slice(2, 6)}-` +
            `${numero.slice(6)}`
        );
    }


    return telefone;
}


// =====================================================
// LOCALIDADE
// =====================================================

function montarLocalidade(lead) {

    const cidade =
        String(
            lead.cidade || ''
        ).trim();


    const estado =
        String(
            lead.estado || ''
        )
            .trim()
            .toUpperCase();


    if (cidade && estado) {

        return `${cidade} - ${estado}`;
    }


    if (cidade) {
        return cidade;
    }


    if (estado) {
        return estado;
    }


    return 'Não informado';
}


// =====================================================
// ENDEREÇO
// =====================================================

function montarEndereco(lead) {

    const partes = [];


    if (lead.logradouro) {

        partes.push(
            lead.numero
                ? `${lead.logradouro}, ${lead.numero}`
                : lead.logradouro
        );
    }


    if (lead.complemento) {

        partes.push(
            lead.complemento
        );
    }


    if (lead.bairro) {

        partes.push(
            lead.bairro
        );
    }


    const localidade =
        montarLocalidade(lead);


    if (
        localidade !==
        'Não informado'
    ) {

        partes.push(
            localidade
        );
    }


    if (lead.cep) {

        partes.push(
            `CEP ${lead.cep}`
        );
    }


    return (
        partes.length
            ? partes.join(' - ')
            : 'Não informado'
    );
}


// =====================================================
// DATA
// =====================================================

function formatarData(data) {

    if (!data) {
        return '-';
    }


    const valor =
        new Date(data);


    if (
        Number.isNaN(
            valor.getTime()
        )
    ) {

        return '-';
    }


    return valor.toLocaleString(
        'pt-BR',
        {
            dateStyle: 'short',
            timeStyle: 'short'
        }
    );
}// =====================================================
// ABRIR DETALHES
// =====================================================

listaLeads?.addEventListener(
    'click',
    async evento => {

        const botao =
            evento.target.closest(
                '.btn-detalhes'
            );


        if (!botao) {
            return;
        }


        await abrirLead(
            botao.dataset.id
        );
    }
);


async function abrirLead(id) {

    try {

        const resposta =
            await fetch(
                `/api/leads/${id}`,
                {
                    headers: {
                        'Authorization':
                            `Bearer ${token}`
                    }
                }
            );


        if (
            !verificarAutorizacao(
                resposta
            )
        ) {
            return;
        }


        if (!resposta.ok) {

            throw new Error(
                'Não foi possível carregar o lead.'
            );
        }


        leadAtual =
            await resposta.json();


        preencherModal(
            leadAtual
        );


        modal?.classList.add(
            'aberto'
        );

    } catch (erro) {

        console.error(
            'Erro ao abrir lead:',
            erro
        );


        alert(
            'Não foi possível carregar os detalhes do lead.'
        );
    }
}


// =====================================================
// PREENCHER MODAL
// =====================================================

function preencherModal(lead) {

    if (!lead) {
        return;
    }


    if (modalNome) {

        modalNome.textContent =
            lead.nome ||
            'Cliente';
    }


    if (modalStatus) {

        modalStatus.textContent =
            textoStatus(
                lead.status
            );


        modalStatus.className =
            `modal-status modal-status-${lead.status || 'novo'}`;
    }


    if (modalTelefone) {

        modalTelefone.textContent =
            formatarTelefone(
                lead.telefone
            );
    }


    if (modalEmail) {

        modalEmail.textContent =
            lead.email ||
            'Não informado';
    }


    if (modalInteresse) {

        modalInteresse.textContent =
            lead.interesse ||
            'Não informado';
    }


    if (modalOrigem) {
        let metadados = lead.metadados_marketing || {};
        if (typeof metadados === 'string') {
            try { metadados = JSON.parse(metadados); }
            catch { metadados = {}; }
        }
        const nomesOrigem = {
            site: 'Site',
            vendedor: 'Cadastro do vendedor',
            meta_ads: 'Anúncio Facebook/Instagram',
            meta_social: 'Publicação Facebook/Instagram',
            meta_lead_ads: 'Formulário Facebook/Instagram'
        };
        const origem = nomesOrigem[lead.origem] || lead.origem || 'Site';
        const campanha = metadados.utm_campaign ||
            (metadados.ad_id ? `anúncio ${metadados.ad_id}` : '');
        modalOrigem.textContent = campanha ? `${origem} · ${campanha}` : origem;
    }


    if (modalCep) {

        modalCep.textContent =
            lead.cep ||
            'Não informado';
    }


    if (modalEndereco) {

        modalEndereco.textContent =
            montarEndereco(
                lead
            );
    }


    if (modalUltimoContato) {

        modalUltimoContato.textContent =
            lead.ultimo_contato
                ? formatarData(
                    lead.ultimo_contato
                )
                : 'Ainda não registrado';
    }


    if (campoObservacoes) {

        campoObservacoes.value =
            lead.observacoes ||
            '';
    }


    if (mensagemComercial) {

        mensagemComercial.textContent =
            '';
    }


    if (mensagemStatus) {

        mensagemStatus.textContent =
            '';
    }


    botoesStatus.forEach(
        botao => {

            botao.classList.toggle(
                'ativo',
                botao.dataset.status ===
                    lead.status
            );
        }
    );
}


// =====================================================
// FECHAR MODAL
// =====================================================

function fechar() {

    modal?.classList.remove(
        'aberto'
    );

    leadAtual = null;
    atualizarAutomaticamente();
}


fecharModal?.addEventListener(
    'click',
    fechar
);


fecharModalSecundario?.addEventListener(
    'click',
    fechar
);


modal?.addEventListener(
    'click',
    evento => {

        if (
            evento.target
                .classList
                .contains(
                    'modal-fundo'
                )
        ) {

            fechar();
        }
    }
);


// =====================================================
// SALVAR ACOMPANHAMENTO
// =====================================================

salvarComercial?.addEventListener(
    'click',
    async () => {

        if (!leadAtual) {
            return;
        }


        if (mensagemComercial) {

            mensagemComercial.textContent =
                'Salvando...';
        }


        try {

            const resposta =
                await fetch(
                    `/api/leads/${leadAtual.id}/comercial`,
                    {
                        method: 'PATCH',

                        headers:
                            headersAutenticados(),

                        body:
                            JSON.stringify({
                                observacoes:
                                    campoObservacoes
                                        ? campoObservacoes.value
                                        : ''
                            })
                    }
                );


            if (
                !verificarAutorizacao(
                    resposta
                )
            ) {
                return;
            }


            const dados =
                await resposta.json();


            if (!resposta.ok) {

                throw new Error(
                    dados.erro ||
                    'Não foi possível salvar.'
                );
            }


            leadAtual =
                dados.lead;


            if (mensagemComercial) {

                mensagemComercial.textContent =
                    'Acompanhamento salvo com sucesso.';
            }


            await carregarLeads();


            preencherModal(
                leadAtual
            );

        } catch (erro) {

            console.error(
                erro
            );


            if (mensagemComercial) {

                mensagemComercial.textContent =
                    erro.message;
            }
        }
    }
);


// =====================================================
// ALTERAR STATUS
// =====================================================

botoesStatus.forEach(
    botao => {

        botao.addEventListener(
            'click',
            async () => {

                if (!leadAtual) {
                    return;
                }


                const status =
                    botao.dataset.status;


                if (mensagemStatus) {

                    mensagemStatus.textContent =
                        'Atualizando status...';
                }


                try {

                    const resposta =
                        await fetch(
                            `/api/leads/${leadAtual.id}/status`,
                            {
                                method: 'PATCH',

                                headers:
                                    headersAutenticados(),

                                body:
                                    JSON.stringify({
                                        status
                                    })
                            }
                        );


                    if (
                        !verificarAutorizacao(
                            resposta
                        )
                    ) {
                        return;
                    }


                    const dados =
                        await resposta.json();


                    if (!resposta.ok) {

                        throw new Error(
                            dados.erro ||
                            'Erro ao atualizar status.'
                        );
                    }


                    leadAtual =
                        dados.lead;


                    if (mensagemStatus) {

                        mensagemStatus.textContent =
                            'Status alterado com sucesso.';
                    }


                    await carregarLeads();


                    preencherModal(
                        leadAtual
                    );

                } catch (erro) {

                    console.error(
                        erro
                    );


                    if (mensagemStatus) {

                        mensagemStatus.textContent =
                            erro.message;
                    }
                }
            }
        );
    }
);


// =====================================================
// WHATSAPP
// =====================================================

botaoWhatsapp?.addEventListener(
    'click',
    () => {

        if (
            !leadAtual ||
            !leadAtual.telefone
        ) {

            alert(
                'Telefone não informado.'
            );

            return;
        }


        const numero =
            String(
                leadAtual.telefone
            )
                .replace(
                    /\D/g,
                    ''
                );


        const numeroBrasil =
            numero.startsWith('55')
                ? numero
                : `55${numero}`;


        window.open(
            `https://wa.me/${numeroBrasil}`,
            '_blank'
        );
    }
);


// =====================================================
// PESQUISA / FILTROS
// =====================================================

pesquisa?.addEventListener(
    'input',
    renderizarLeads
);


filtroStatus?.addEventListener(
    'change',
    renderizarLeads
);


botaoAtualizar?.addEventListener(
    'click',
    carregarLeads
);


// =====================================================
// ESCAPAR HTML
// =====================================================

function escaparHtml(valor) {

    return String(
        valor ?? ''
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
// INICIALIZAÇÃO
// =====================================================

async function iniciarPainel() {
    if (!token || sessaoEncerrada) return;

    const sessaoValida =
        await validarSessao();


    if (!sessaoValida) {
        return;
    }


    painelPronto = true;
    await carregarLeads();
    if (sessaoEncerrada) return;
    atualizacaoAutomatica = setInterval(atualizarAutomaticamente, 20000);
}

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) atualizarAutomaticamente();
});
window.addEventListener('focus', atualizarAutomaticamente);
window.addEventListener('pagehide', () => clearInterval(atualizacaoAutomatica));
window.addEventListener('pageshow', evento => {
    if (evento.persisted && painelPronto && !sessaoEncerrada) {
        clearInterval(atualizacaoAutomatica);
        atualizacaoAutomatica = setInterval(atualizarAutomaticamente, 20000);
        atualizarAutomaticamente();
    }
});

iniciarPainel();
