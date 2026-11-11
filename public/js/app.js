// =========================================================
// DDE TELECOM - APP.JS
// HOME DEFINITIVA
// CEP + FORMULÁRIO + LEADS + MODAL DE COBERTURA
// =========================================================

const DDE_UTM_FIELDS = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term'
];

function obterAtribuicaoMarketingDDE() {
    const atribuicao = {};
    const parametros = new URLSearchParams(window.location.search);

    for (const campo of DDE_UTM_FIELDS) {
        let valor = parametros.get(campo);
        try {
            if (valor && valor.trim()) {
                sessionStorage.setItem(`dde_${campo}`, valor.trim().slice(0, 150));
            } else {
                valor = sessionStorage.getItem(`dde_${campo}`) || '';
            }
        } catch {
            valor = valor || '';
        }
        if (valor && valor.trim()) atribuicao[campo] = valor.trim().slice(0, 150);
    }
    return atribuicao;
}

document.addEventListener('DOMContentLoaded', () => {

    // =====================================================
    // ELEMENTOS DO FORMULÁRIO
    // =====================================================

    const formulario = document.getElementById('form-lead');
    let leadRequest;

    const campoNome = document.getElementById('nome');
    const campoTelefone = document.getElementById('telefone');
    const campoEmail = document.getElementById('email');
    const campoCep = document.getElementById('cep');

    const campoLogradouro = document.getElementById('logradouro');
    const campoNumero = document.getElementById('numero');
    const campoComplemento = document.getElementById('complemento');
    const campoBairro = document.getElementById('bairro');
    const campoCidade = document.getElementById('cidade');
    const campoEstado = document.getElementById('estado');
    const campoInteresse = document.getElementById('interesse');

    const mensagemFormulario =
        document.getElementById('mensagem-form');


    // =====================================================
    // ELEMENTOS DA CONSULTA RÁPIDA
    // =====================================================

    const cepConsultaRapida =
        document.getElementById('cep-consulta-rapida');

    const botaoConsultaRapida =
        document.getElementById('consultar-cep-rapido');


    // =====================================================
    // ELEMENTOS DO MODAL
    // =====================================================

    const modalCep =
        document.getElementById('modal-cep');

    const abrirModalCep =
        document.getElementById('abrir-consulta-cep');

    const fecharModalCep =
        document.getElementById('fechar-modal-cep');

    const fundoModalCep =
        modalCep?.querySelector('.modal-cep-fundo');

    const cepConsultaModal =
        document.getElementById('cep-consulta');

    const botaoConsultaModal =
        document.getElementById('consultar-cep-modal');

    const mensagemConsultaCep =
        document.getElementById('mensagem-consulta-cep');

    const resultadoCep =
        document.getElementById('resultado-cep');

    const resultadoLogradouro =
        document.getElementById('resultado-logradouro');

    const resultadoLocalidade =
        document.getElementById('resultado-localidade');

    const continuarComEndereco =
        document.getElementById('continuar-com-endereco');


    // =====================================================
    // ENDEREÇO TEMPORÁRIO DA CONSULTA
    // =====================================================

    let enderecoConsultado = null;


    // =====================================================
    // FUNÇÕES AUXILIARES
    // =====================================================

    function somenteNumeros(valor) {

        return String(valor || '')
            .replace(/\D/g, '');
    }


    function formatarCep(valor) {

        const numeros =
            somenteNumeros(valor)
                .slice(0, 8);

        if (numeros.length <= 5) {
            return numeros;
        }

        return (
            numeros.slice(0, 5) +
            '-' +
            numeros.slice(5)
        );
    }


    function formatarTelefone(valor) {

        const numeros =
            somenteNumeros(valor)
                .slice(0, 11);

        if (!numeros) {
            return '';
        }

        if (numeros.length <= 2) {
            return `(${numeros}`;
        }

        if (numeros.length <= 6) {

            return (
                `(${numeros.slice(0, 2)}) ` +
                numeros.slice(2)
            );
        }

        if (numeros.length <= 10) {

            return (
                `(${numeros.slice(0, 2)}) ` +
                `${numeros.slice(2, 6)}-` +
                numeros.slice(6)
            );
        }

        return (
            `(${numeros.slice(0, 2)}) ` +
            `${numeros.slice(2, 7)}-` +
            numeros.slice(7)
        );
    }


    function mostrarMensagemFormulario(
        texto,
        tipo = ''
    ) {

        if (!mensagemFormulario) {
            return;
        }

        mensagemFormulario.textContent =
            texto || '';

        mensagemFormulario.classList.remove(
            'sucesso',
            'erro'
        );

        if (tipo) {

            mensagemFormulario.classList.add(
                tipo
            );
        }
    }


    function mostrarMensagemCep(
        texto,
        tipo = ''
    ) {

        if (!mensagemConsultaCep) {
            return;
        }

        mensagemConsultaCep.textContent =
            texto || '';

        mensagemConsultaCep.classList.remove(
            'sucesso',
            'erro'
        );

        if (tipo) {

            mensagemConsultaCep.classList.add(
                tipo
            );
        }
    }


    function limparResultadoModal() {

        enderecoConsultado = null;

        resultadoCep?.classList.remove(
            'ativo'
        );

        continuarComEndereco?.classList.remove(
            'ativo'
        );

        if (resultadoLogradouro) {
            resultadoLogradouro.textContent = '';
        }

        if (resultadoLocalidade) {
            resultadoLocalidade.textContent = '';
        }
    }


    // =====================================================
    // CONSULTAR CEP
    // =====================================================

    async function consultarCep(valorCep) {

        const cep =
            somenteNumeros(valorCep);

        if (cep.length !== 8) {

            throw new Error(
                'Digite um CEP válido com 8 números.'
            );
        }

        const resposta =
            await fetch(
                `https://viacep.com.br/ws/${cep}/json/`
            );

        if (!resposta.ok) {

            throw new Error(
                'Não foi possível consultar o CEP.'
            );
        }

        const dados =
            await resposta.json();

        if (dados.erro) {

            throw new Error(
                'CEP não encontrado.'
            );
        }

        return {
            cep: formatarCep(dados.cep || cep),
            logradouro: dados.logradouro || '',
            complemento: dados.complemento || '',
            bairro: dados.bairro || '',
            cidade: dados.localidade || '',
            estado: dados.uf || ''
        };
    }


    // =====================================================
    // PREENCHER ENDEREÇO DO FORMULÁRIO
    // =====================================================

    function preencherEndereco(dados) {

        if (!dados) {
            return;
        }

        if (campoCep) {
            campoCep.value =
                formatarCep(dados.cep);
        }

        if (campoLogradouro) {
            campoLogradouro.value =
                dados.logradouro || '';
        }

        if (campoBairro) {
            campoBairro.value =
                dados.bairro || '';
        }

        if (campoCidade) {
            campoCidade.value =
                dados.cidade || '';
        }

        if (campoEstado) {
            campoEstado.value =
                String(
                    dados.estado || ''
                ).toUpperCase();
        }

        if (
            campoComplemento &&
            !campoComplemento.value &&
            dados.complemento
        ) {

            campoComplemento.value =
                dados.complemento;
        }
    }


    // =====================================================
    // CEP DO FORMULÁRIO
    // =====================================================

    if (campoCep) {

        campoCep.addEventListener(
            'input',
            () => {

                campoCep.value =
                    formatarCep(
                        campoCep.value
                    );
            }
        );


        campoCep.addEventListener(
            'blur',
            async () => {

                const cep =
                    somenteNumeros(
                        campoCep.value
                    );

                if (!cep) {
                    return;
                }

                if (cep.length !== 8) {

                    mostrarMensagemFormulario(
                        'Informe um CEP válido.',
                        'erro'
                    );

                    return;
                }

                mostrarMensagemFormulario(
                    'Localizando endereço...'
                );

                try {

                    const dados =
                        await consultarCep(cep);

                    preencherEndereco(dados);

                    mostrarMensagemFormulario(
                        'Endereço localizado. Complete o número do imóvel.',
                        'sucesso'
                    );

                    campoNumero?.focus();

                } catch (erro) {

                    mostrarMensagemFormulario(
                        erro.message ||
                        'Não foi possível localizar o CEP.',
                        'erro'
                    );
                }
            }
        );
    }


    // =====================================================
    // MÁSCARA DO TELEFONE
    // =====================================================

    if (campoTelefone) {

        campoTelefone.addEventListener(
            'input',
            () => {

                campoTelefone.value =
                    formatarTelefone(
                        campoTelefone.value
                    );
            }
        );
    }


    // =====================================================
    // CONSULTA RÁPIDA - SEÇÃO DE PLANOS
    // =====================================================

    if (cepConsultaRapida) {

        cepConsultaRapida.addEventListener(
            'input',
            () => {

                cepConsultaRapida.value =
                    formatarCep(
                        cepConsultaRapida.value
                    );
            }
        );


        cepConsultaRapida.addEventListener(
            'keydown',
            evento => {

                if (evento.key === 'Enter') {

                    evento.preventDefault();

                    botaoConsultaRapida?.click();
                }
            }
        );
    }


    if (botaoConsultaRapida) {

        botaoConsultaRapida.addEventListener(
            'click',
            async () => {

                const cep =
                    somenteNumeros(
                        cepConsultaRapida?.value
                    );

                if (cep.length !== 8) {

                    if (cepConsultaRapida) {
                        cepConsultaRapida.focus();
                    }

                    return;
                }

                botaoConsultaRapida.disabled =
                    true;

                const textoOriginal =
                    botaoConsultaRapida.innerHTML;

                botaoConsultaRapida.textContent =
                    'Consultando...';

                try {

                    const dados =
                        await consultarCep(cep);

                    preencherEndereco(dados);

                    document
                        .getElementById('atendimento')
                        ?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start'
                        });

                    setTimeout(
                        () => {

                            campoNumero?.focus();

                        },
                        650
                    );

                } catch (erro) {

                    alert(
                        erro.message ||
                        'Não foi possível localizar o CEP.'
                    );

                } finally {

                    botaoConsultaRapida.disabled =
                        false;

                    botaoConsultaRapida.innerHTML =
                        textoOriginal;
                }
            }
        );
    }


    // =====================================================
    // ABRIR MODAL
    // =====================================================

    function abrirModal() {

        if (!modalCep) {
            return;
        }

        modalCep.classList.add('ativo');

        modalCep.setAttribute(
            'aria-hidden',
            'false'
        );

        document.body.classList.add(
            'modal-aberto'
        );

        mostrarMensagemCep('');

        limparResultadoModal();

        setTimeout(
            () => {

                cepConsultaModal?.focus();

            },
            100
        );
    }


    // =====================================================
    // FECHAR MODAL
    // =====================================================

    function fecharModal() {

        if (!modalCep) {
            return;
        }

        modalCep.classList.remove('ativo');

        modalCep.setAttribute(
            'aria-hidden',
            'true'
        );

        document.body.classList.remove(
            'modal-aberto'
        );
    }


    abrirModalCep?.addEventListener(
        'click',
        abrirModal
    );


    fecharModalCep?.addEventListener(
        'click',
        fecharModal
    );


    fundoModalCep?.addEventListener(
        'click',
        fecharModal
    );


    document.addEventListener(
        'keydown',
        evento => {

            if (
                evento.key === 'Escape' &&
                modalCep?.classList.contains(
                    'ativo'
                )
            ) {

                fecharModal();
            }
        }
    );


    // =====================================================
    // CEP DO MODAL
    // =====================================================

    if (cepConsultaModal) {

        cepConsultaModal.addEventListener(
            'input',
            () => {

                cepConsultaModal.value =
                    formatarCep(
                        cepConsultaModal.value
                    );

                limparResultadoModal();

                mostrarMensagemCep('');
            }
        );


        cepConsultaModal.addEventListener(
            'keydown',
            evento => {

                if (evento.key === 'Enter') {

                    evento.preventDefault();

                    botaoConsultaModal?.click();
                }
            }
        );
    }


    // =====================================================
    // CONSULTAR CEP PELO MODAL
    // =====================================================

    if (botaoConsultaModal) {

        botaoConsultaModal.addEventListener(
            'click',
            async () => {

                const cep =
                    somenteNumeros(
                        cepConsultaModal?.value
                    );

                limparResultadoModal();

                if (cep.length !== 8) {

                    mostrarMensagemCep(
                        'Digite um CEP válido com 8 números.',
                        'erro'
                    );

                    cepConsultaModal?.focus();

                    return;
                }

                botaoConsultaModal.disabled =
                    true;

                const textoOriginal =
                    botaoConsultaModal.textContent;

                botaoConsultaModal.textContent =
                    'Consultando...';

                mostrarMensagemCep(
                    'Localizando endereço...'
                );

                try {

                    const dados =
                        await consultarCep(cep);

                    enderecoConsultado =
                        dados;

                    if (resultadoLogradouro) {

                        resultadoLogradouro.textContent =
                            dados.logradouro ||
                            'Endereço localizado';
                    }

                    if (resultadoLocalidade) {

                        const partes = [
                            dados.bairro,
                            dados.cidade,
                            dados.estado
                        ].filter(Boolean);

                        resultadoLocalidade.textContent =
                            partes.join(' - ');
                    }

                    resultadoCep?.classList.add(
                        'ativo'
                    );

                    continuarComEndereco
                        ?.classList.add(
                            'ativo'
                        );

                    mostrarMensagemCep(
                        'CEP localizado com sucesso.',
                        'sucesso'
                    );

                } catch (erro) {

                    mostrarMensagemCep(
                        erro.message ||
                        'Não foi possível localizar o CEP.',
                        'erro'
                    );

                } finally {

                    botaoConsultaModal.disabled =
                        false;

                    botaoConsultaModal.textContent =
                        textoOriginal;
                }
            }
        );
    }


    // =====================================================
    // CONTINUAR COM ENDEREÇO DO MODAL
    // =====================================================

    continuarComEndereco?.addEventListener(
        'click',
        () => {

            if (!enderecoConsultado) {
                return;
            }

            preencherEndereco(
                enderecoConsultado
            );

            fecharModal();

            document
                .getElementById('atendimento')
                ?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });

            setTimeout(
                () => {

                    campoNumero?.focus();

                },
                650
            );
        }
    );


    // =====================================================
    // ENVIO DO LEAD
    // =====================================================

    if (formulario) {

        formulario.addEventListener(
            'submit',
            async evento => {

                evento.preventDefault();

                mostrarMensagemFormulario('');


                // -----------------------------------------
                // VALIDAÇÃO BÁSICA
                // -----------------------------------------

                const nome =
                    campoNome?.value.trim() || '';

                const telefone =
                    campoTelefone?.value.trim() || '';

                const cep =
                    campoCep?.value.trim() || '';

                const numero =
                    campoNumero?.value.trim() || '';


                if (!nome) {

                    mostrarMensagemFormulario(
                        'Informe seu nome.',
                        'erro'
                    );

                    campoNome?.focus();

                    return;
                }


                if (
                    somenteNumeros(telefone)
                        .length < 10
                ) {

                    mostrarMensagemFormulario(
                        'Informe um WhatsApp válido.',
                        'erro'
                    );

                    campoTelefone?.focus();

                    return;
                }


                if (
                    somenteNumeros(cep)
                        .length !== 8
                ) {

                    mostrarMensagemFormulario(
                        'Informe um CEP válido.',
                        'erro'
                    );

                    campoCep?.focus();

                    return;
                }


                if (!numero) {

                    mostrarMensagemFormulario(
                        'Informe o número do endereço.',
                        'erro'
                    );

                    campoNumero?.focus();

                    return;
                }


                // -----------------------------------------
                // DADOS PARA A API
                // -----------------------------------------

                const dadosLead = {

                    nome,

                    telefone,

                    email:
                        campoEmail?.value.trim() ||
                        '',

                    cep:
                        formatarCep(cep),

                    logradouro:
                        campoLogradouro?.value.trim() ||
                        '',

                    numero,

                    complemento:
                        campoComplemento?.value.trim() ||
                        '',

                    bairro:
                        campoBairro?.value.trim() ||
                        '',

                    cidade:
                        campoCidade?.value.trim() ||
                        '',

                    estado:
                        campoEstado?.value.trim()
                            .toUpperCase() ||
                        '',

                    interesse:
                        campoInteresse?.value.trim() ||
                        '',

                    metadados_marketing:
                        obterAtribuicaoMarketingDDE()
                };


                // -----------------------------------------
                // BOTÃO DE ENVIO
                // -----------------------------------------

                const botaoEnviar =
                    formulario.querySelector(
                        'button[type="submit"]'
                    );

                const textoOriginal =
                    botaoEnviar?.innerHTML || '';


                if (botaoEnviar) {

                    botaoEnviar.disabled =
                        true;

                    botaoEnviar.textContent =
                        'Enviando...';
                }


                mostrarMensagemFormulario(
                    'Enviando sua solicitação...'
                );


                try {

                    const payload = JSON.stringify(dadosLead);
                    if (leadRequest?.payload !== payload) leadRequest = {payload,key:crypto.randomUUID()};
                    const resposta = await fetch('/api/leads',
                            {
                                method: 'POST',

                                headers: {
                                    'Content-Type':'application/json', 'Idempotency-Key':leadRequest.key
                                },

                                body:
                                    JSON.stringify(
                                        dadosLead
                                    )
                            }
                        );


                    let resultado = {};

                    try {

                        resultado =
                            await resposta.json();

                    } catch (erroJson) {

                        resultado = {};
                    }


                    if (!resposta.ok) {

                        throw new Error(
                            resultado.erro ||
                            'Não foi possível enviar sua solicitação.'
                        );
                    }


                    // -------------------------------------
                    // SUCESSO
                    // -------------------------------------

                    formulario.reset();
                    leadRequest = undefined;

                    mostrarMensagemFormulario(
                        'Solicitação enviada com sucesso! Nossa equipe entrará em contato.',
                        'sucesso'
                    );


                    if (campoNome) {

                        campoNome.focus();
                    }


                } catch (erro) {

                    console.error(
                        'Erro ao enviar lead:',
                        erro
                    );

                    mostrarMensagemFormulario(
                        erro.message ||
                        'Não foi possível enviar sua solicitação. Tente novamente.',
                        'erro'
                    );


                } finally {

                    if (botaoEnviar) {

                        botaoEnviar.disabled =
                            false;

                        botaoEnviar.innerHTML =
                            textoOriginal;
                    }
                }
            }
        );
    }

});
