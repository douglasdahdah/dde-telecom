'use strict';
(() => {
    const select = document.getElementById('responsavel-lead');
    const botao = document.getElementById('atribuir-lead');
    const aviso = document.getElementById('mensagem-atribuicao');
    const atual = document.getElementById('responsavel-atual');
    if (!select || !botao) return;
    let versao = 0;
    async function carregarResponsaveis() {
        const v = ++versao;
        const id = leadAtual?.id;
        select.replaceChildren(); select.disabled = true; botao.disabled = true; aviso.textContent = '';
        atual.textContent = `Atual: ${leadAtual?.vendedor || 'Não atribuído'}`;
        if (!id) return;
        try {
            const resposta = await fetch('/api/usuarios', { headers: headersAutenticados() });
            if (!verificarAutorizacao(resposta)) return;
            const usuarios = await resposta.json();
            if (!resposta.ok) throw new Error(usuarios.erro || 'Não foi possível carregar os responsáveis.');
            if (v !== versao || String(leadAtual?.id) !== String(id)) return;
            select.add(new Option('Selecione um responsável', ''));
            for (const u of usuarios.filter(u => u.ativo)) select.add(new Option(`${u.nome} — ${u.email}${u.perfil === 'admin' ? ' (Administrador)' : ''}`, u.id));
            select.value = String(leadAtual.vendedor_id || '');
            if (!select.value) select.value = '';
            select.disabled = false; botao.disabled = false;
        } catch (e) { if (v === versao) aviso.textContent = e.message; }
    }
    // Integra com o modal existente, inclusive após atualização de status/observações.
    const preencherOriginal = preencherModal;
    preencherModal = function (...args) { preencherOriginal(...args); carregarResponsaveis(); };
    botao.addEventListener('click', async () => {
        const id = leadAtual?.id, responsavel = select.value;
        if (!id || !responsavel) { aviso.textContent = 'Selecione um responsável.'; return; }
        botao.disabled = true; select.disabled = true; aviso.textContent = 'Salvando…';
        try {
            const resposta = await fetch(`/api/leads/${id}/vendedor`, {
                method: 'PATCH', headers: headersAutenticados(), body: JSON.stringify({ vendedor_id: Number(responsavel) })
            });
            if (!verificarAutorizacao(resposta)) return;
            const dados = await resposta.json();
            if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível atribuir o lead.');
            if (String(leadAtual?.id) === String(id)) {
                leadAtual = dados.lead; atual.textContent = `Atual: ${dados.lead.vendedor}`; aviso.textContent = dados.mensagem;
            }
            await carregarLeads();
        } catch (e) { if (String(leadAtual?.id) === String(id)) aviso.textContent = e.message; }
        finally { if (String(leadAtual?.id) === String(id)) { botao.disabled = false; select.disabled = false; } }
    });
})();
