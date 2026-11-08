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
const intervaloLeads = 60000;
const botaoExportar = document.getElementById('exportar-excel');
const mensagemRelatorio = document.getElementById('mensagem-relatorio');
let exportandoRelatorio = false;
let alterandoLixeira = false;
const botaoLixeira = document.getElementById('abrir-lixeira');
const painelLixeira = document.getElementById('painel-lixeira');
const listaLixeira = document.getElementById('lista-lixeira');
const botaoExcluirLead = document.getElementById('excluir-lead');
const mensagemExclusao = document.getElementById('mensagem-exclusao');
let pedidoStatusMeta = null;
const avisoMeta = document.getElementById('status-importacao-meta');
const textoStatusMeta = document.getElementById('texto-status-meta');
const linkCentralMeta = document.getElementById('link-central-meta');

function atualizarStatusMeta() {
    if (!avisoMeta || sessaoEncerrada) return Promise.resolve();
    if (pedidoStatusMeta) return pedidoStatusMeta;
    pedidoStatusMeta = (async () => {
        try {
            const resposta = await fetch('/api/admin/integracoes/meta/status', {
                headers: { Authorization: `Bearer ${token}` },
                cache: 'no-store', signal: AbortSignal.timeout(12000)
            });
            if (!verificarAutorizacao(resposta)) return;
            if (!resposta.ok) throw new Error('meta_status_unavailable');
            const dados = await resposta.json();
            if (sessaoEncerrada) return;
            const aguardando = (Number(dados.pending) || 0) + (Number(dados.review) || 0);
            const textos = {
                up_to_date: 'Formulários da Meta: nenhuma importação pendente.',
                receiving: `Recebendo ${aguardando} formulário(s) da Meta. A importação está em andamento.`,
                delayed: `${aguardando} formulário(s) da Meta aguardam importação há mais de 2 minutos. Consulte os contatos na Meta enquanto tentamos novamente.`,
                authorization_required: `A autorização da Meta precisa ser renovada. ${aguardando} formulário(s) aguardam importação. Acesse os contatos na Meta para atendê-los. O sistema continuará tentando.`,
                needs_review: `${aguardando} formulário(s) da Meta precisam de conferência. Consulte os contatos na Meta para atendê-los.`,
                not_configured: 'A entrada de formulários da Meta precisa ser configurada.'
            };
            if (!textos[dados.status]) throw new Error('meta_status_invalid');
            textoStatusMeta.textContent = textos[dados.status];
            avisoMeta.classList.toggle('meta-atencao', !['up_to_date', 'receiving'].includes(dados.status));
            avisoMeta.setAttribute('role', ['up_to_date', 'receiving'].includes(dados.status) ? 'status' : 'alert');
            if (/^https:\/\/business\.facebook\.com\/latest\/leads_center\?asset_id=\d+$/.test(dados.leadsCenterUrl || '')) {
                linkCentralMeta.href = dados.leadsCenterUrl;
                linkCentralMeta.hidden = false;
            }
        } catch {
            if (sessaoEncerrada) return;
            textoStatusMeta.textContent = 'Não foi possível conferir a importação da Meta. Tentaremos novamente; consulte os contatos na Meta se necessário.';
            avisoMeta.classList.add('meta-atencao');
            avisoMeta.setAttribute('role', 'alert');
        }
    })().finally(() => { pedidoStatusMeta = null; });
    return pedidoStatusMeta;
}


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
    atualizarStatusMeta();
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
                estadoAtualizacao.textContent = `Atualizado às ${hora} · automático a cada 60 s`;
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
    if (!painelPronto || sessaoEncerrada || document.hidden || alterandoLixeira) return;
    atualizarStatusMeta();
    if (modal?.classList.contains('aberto')) return;
    // Mantém a seleção de controles eventualmente abertos dentro da lista.
    if (listaLeads?.contains(document.activeElement) &&
        ['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)) return;
    return carregarLeads({ silencioso: true });
}

async function carregarLixeira() {
    if (!listaLixeira || sessaoEncerrada) return;
    listaLixeira.textContent = 'Carregando lixeira…';
    try {
        const resposta = await fetch('/api/admin/leads/excluidos', {
            headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(12000)
        });
        if (!verificarAutorizacao(resposta)) return;
        if (!resposta.ok) throw new Error('Não foi possível carregar a lixeira.');
        const itens = await resposta.json();
        if (!Array.isArray(itens)) throw new Error('Resposta da lixeira inválida.');
        listaLixeira.innerHTML = itens.length ? itens.map(item => `
            <article class="lixeira-item">
                <div><strong>${escaparHtml(item.nome)}</strong>
                <small>Lead ${Number(item.id)} · Excluído em ${escaparHtml(formatarData(item.excluido_em))}</small></div>
                <button type="button" class="botao-sair restaurar-lead" data-id="${Number(item.id)}">Restaurar lead ${Number(item.id)}</button>
            </article>`).join('') : '<p>Nenhum lead na lixeira.</p>';
    } catch (erro) { listaLixeira.textContent = erro.message || 'Não foi possível carregar a lixeira.'; }
}

botaoLixeira?.addEventListener('click', async () => {
    if (!painelPronto || sessaoEncerrada) return;
    painelLixeira.hidden = !painelLixeira.hidden;
    botaoLixeira.textContent = painelLixeira.hidden ? 'Lixeira' : 'Fechar lixeira';
    if (!painelLixeira.hidden) await carregarLixeira();
});

botaoExcluirLead?.addEventListener('click', async () => {
    if (!painelPronto || !leadAtual || alterandoLixeira || sessaoEncerrada) return;
    const lead = {id:leadAtual.id,nome:leadAtual.nome};
    if (!confirm(`Mover "${lead.nome}" (lead ${lead.id}) para a lixeira?\nO cadastro sairá da lista e do Excel. Você poderá restaurá-lo pela Lixeira.`)) return;
    alterandoLixeira = true; botaoExcluirLead.disabled = true;
    try {
        const resposta = await fetch(`/api/leads/${lead.id}`, {
            method:'DELETE',headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(12000)
        });
        if (!verificarAutorizacao(resposta)) return;
        const dados = await resposta.json().catch(()=>({}));
        if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível excluir o lead.');
        modal?.classList.remove('aberto'); leadAtual = null;
        if (pedidoLeads) await pedidoLeads;
        await carregarLeads();
        if (!painelLixeira.hidden) await carregarLixeira();
        mensagemExclusao.textContent = `Lead ${lead.id} movido para a lixeira. Para recuperar, abra a Lixeira e clique em Restaurar.`;
    } catch (erro) {
        mensagemExclusao.textContent = erro.name === 'TimeoutError'
            ? 'Não foi possível confirmar a exclusão. Confira a Lixeira antes de tentar novamente.' : erro.message;
        mensagemStatus.textContent = mensagemExclusao.textContent;
    } finally { alterandoLixeira = false; botaoExcluirLead.disabled = false; }
});

listaLixeira?.addEventListener('click', async evento => {
    const botao = evento.target.closest('.restaurar-lead');
    if (!botao || alterandoLixeira || sessaoEncerrada) return;
    alterandoLixeira = true; botao.disabled = true; botao.textContent = 'Restaurando…';
    try {
        const resposta = await fetch(`/api/admin/leads/${botao.dataset.id}/restaurar`, {
            method:'POST',headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(12000)
        });
        if (!verificarAutorizacao(resposta)) return;
        const dados = await resposta.json().catch(()=>({}));
        if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível restaurar o lead.');
        if (pedidoLeads) await pedidoLeads;
        await carregarLeads(); await carregarLixeira();
        mensagemExclusao.textContent = dados.mensagem;
    } catch (erro) {
        mensagemExclusao.textContent = erro.name === 'TimeoutError'
            ? 'Não foi possível confirmar a restauração. Atualize os dados antes de tentar novamente.' : erro.message;
        botao.disabled = false; botao.textContent = `Restaurar lead ${botao.dataset.id}`;
    } finally { alterandoLixeira = false; }
});


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
                    lead.interesse,
                    lead.vendedor
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
        const indicador = lead.origem === 'vendedor' && metadados.indicador_nome
            ? `Indicado por ${metadados.indicador_nome}` : '';
        modalOrigem.textContent = [origem,campanha,indicador].filter(Boolean).join(' · ');
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

botaoExportar?.addEventListener('click', async () => {
    if (!painelPronto || sessaoEncerrada || exportandoRelatorio) return;
    exportandoRelatorio = true;
    botaoExportar.disabled = true;
    botaoExportar.textContent = 'Gerando Excel…';
    mensagemRelatorio.textContent = 'Preparando o relatório com os dados atuais do cadastro…';
    mensagemRelatorio.classList.remove('relatorio-erro');
    try {
        const parametros = new URLSearchParams();
        if (pesquisa?.value.trim()) parametros.set('q',pesquisa.value.trim());
        if (filtroStatus?.value) parametros.set('status',filtroStatus.value);
        const resposta = await fetch(`/api/admin/relatorios/leads.xlsx?${parametros}`, {
            headers: {Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(60000)
        });
        if (!verificarAutorizacao(resposta)) return;
        if (!resposta.ok) {
            const dados = await resposta.json().catch(()=>({}));
            throw new Error(dados.erro || 'Não foi possível gerar o relatório. Tente novamente.');
        }
        const arquivo = await resposta.blob();
        const nome = resposta.headers.get('Content-Disposition')?.match(/filename="([a-zA-Z0-9._-]+)"/)?.[1] || 'DDE-Leads.xlsx';
        const endereco = URL.createObjectURL(arquivo);
        const link = document.createElement('a');
        link.href = endereco; link.download = nome;
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(()=>URL.revokeObjectURL(endereco),60000);
        mensagemRelatorio.textContent = 'Excel pronto. O download foi solicitado ao navegador.';
    } catch (erro) {
        mensagemRelatorio.textContent = erro.name==='TimeoutError' ? 'A geração demorou mais que o esperado. Tente novamente.' : erro.message;
        mensagemRelatorio.classList.add('relatorio-erro');
    } finally {
        exportandoRelatorio = false;
        botaoExportar.disabled = sessaoEncerrada;
        botaoExportar.textContent = '↓ Baixar Excel';
    }
});


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
    if (botaoExportar) botaoExportar.disabled = false;
    if (botaoLixeira) botaoLixeira.disabled = false;
    await carregarLeads();
    if (sessaoEncerrada) return;
    atualizacaoAutomatica = setInterval(atualizarAutomaticamente, intervaloLeads);
}

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) atualizarAutomaticamente();
});
window.addEventListener('focus', atualizarAutomaticamente);
window.addEventListener('pagehide', () => clearInterval(atualizacaoAutomatica));
window.addEventListener('pageshow', evento => {
    if (evento.persisted && painelPronto && !sessaoEncerrada) {
        clearInterval(atualizacaoAutomatica);
        atualizacaoAutomatica = setInterval(atualizarAutomaticamente, intervaloLeads);
        atualizarAutomaticamente();
    }
});

iniciarPainel();
