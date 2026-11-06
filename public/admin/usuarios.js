'use strict';
(() => {
    const $ = id => document.getElementById(id);
    const token = (localStorage.getItem('dde_admin_token') || localStorage.getItem('dde_admin_token'));
    let usuarios = [], selecionado = null, modo = 'novo', pendente = false;
    const sair = () => {
        localStorage.removeItem('dde_admin_token');
        localStorage.removeItem('dde_admin_usuario');
        location.replace('/admin/login.html');
    };
    $('sair').addEventListener('click', sair);
    async function api(url, method = 'GET', body) {
        const resposta = await fetch(url, {
            method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
        if (resposta.status === 401) { sair(); throw new Error('Sua sessão expirou.'); }
        const dados = await resposta.json();
        if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível concluir a operação.');
        return dados;
    }
    function mensagem(texto, erro = false) { $('mensagem').textContent = texto; $('mensagem').dataset.erro = String(erro); }
    function desenhar() {
        const vendedores = usuarios.filter(u => u.perfil === 'vendedor');
        $('total').textContent = vendedores.length;
        $('ativos').textContent = vendedores.filter(u => u.ativo).length;
        $('inativos').textContent = vendedores.filter(u => !u.ativo).length;
        const busca = $('busca').value.trim().toLocaleLowerCase('pt-BR');
        const situacao = $('situacao').value;
        const filtrados = usuarios.filter(u =>
            `${u.nome} ${u.email}`.toLocaleLowerCase('pt-BR').includes(busca) &&
            (situacao === 'todos' || (situacao === 'ativos' ? u.ativo : !u.ativo))
        );
        $('usuarios').replaceChildren();
        for (const u of filtrados) {
            const tr = document.createElement('tr');
            for (const valor of [u.nome, u.email, u.perfil === 'admin' ? 'Administrador' : 'Vendedor']) {
                const td = document.createElement('td'); td.textContent = valor; tr.append(td);
            }
            const situacaoTd = document.createElement('td');
            const badge = document.createElement('span');
            badge.className = `equipe-status ${u.ativo ? 'ativo' : 'inativo'}`;
            badge.textContent = u.ativo ? 'Ativo' : 'Inativo'; situacaoTd.append(badge); tr.append(situacaoTd);
            const acoes = document.createElement('td');
            if (u.perfil === 'admin') { acoes.className = 'equipe-protegido'; acoes.textContent = 'Conta administrativa'; }
            else for (const [acao, label] of [['editar', 'Editar'], ['senha', 'Senha'], ['status', u.ativo ? 'Desativar' : 'Ativar']]) {
                const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
                b.className = acao === 'status' && u.ativo ? 'equipe-perigo' : 'equipe-secundario';
                b.addEventListener('click', () => abrir(acao, u)); acoes.append(b);
            }
            tr.append(acoes); $('usuarios').append(tr);
        }
        if (!filtrados.length) {
            const tr = document.createElement('tr'), td = document.createElement('td');
            td.colSpan = 5; td.textContent = 'Nenhum usuário encontrado para este filtro.'; tr.append(td); $('usuarios').append(tr);
        }
    }
    async function carregar() { usuarios = await api('/api/usuarios'); desenhar(); }
    function abrir(acao, u = null) {
        modo = acao; selecionado = u; $('formulario').reset(); $('erro-dialogo').textContent = '';
        const cadastro = acao === 'novo' || acao === 'editar';
        const senha = acao === 'novo' || acao === 'senha';
        $('campos-cadastro').hidden = !cadastro; $('campos-senha').hidden = !senha;
        for (const id of ['nome', 'email']) $(id).disabled = !cadastro;
        for (const id of ['senha', 'confirmar-senha']) $(id).disabled = !senha;
        $('nome').value = u?.nome || ''; $('email').value = u?.email || '';
        $('titulo-dialogo').textContent = acao === 'novo' ? 'Novo vendedor' : acao === 'editar' ? 'Editar vendedor' : acao === 'senha' ? 'Redefinir senha' : u.ativo ? 'Desativar vendedor' : 'Ativar vendedor';
        $('contexto-dialogo').textContent = acao === 'status'
            ? `${u.nome}: ${u.ativo ? 'o acesso será bloqueado. Os leads continuarão visíveis para o administrador e poderão ser repassados.' : 'o acesso será liberado com a senha cadastrada.'}`
            : acao === 'senha' ? `Defina a nova senha de ${u.nome}. As sessões anteriores serão encerradas.` : 'O vendedor terá acesso somente aos leads atribuídos a ele.';
        $('salvar').textContent = acao === 'status' ? 'Confirmar' : 'Salvar';
        $('dialogo').showModal();
    }
    function fechar() { if (!pendente) { $('dialogo').close(); $('formulario').reset(); } }
    $('cancelar').addEventListener('click', fechar); $('fechar').addEventListener('click', fechar);
    $('dialogo').addEventListener('cancel', e => { if (pendente) e.preventDefault(); });
    $('dialogo').addEventListener('close', () => $('formulario').reset());
    $('novo').addEventListener('click', () => abrir('novo'));
    $('busca').addEventListener('input', desenhar); $('situacao').addEventListener('change', desenhar);
    $('atualizar').addEventListener('click', async () => {
        $('atualizar').disabled = true;
        try { await carregar(); mensagem('Lista atualizada.'); }
        catch (e) { mensagem(e.message, true); }
        finally { $('atualizar').disabled = false; }
    });
    $('formulario').addEventListener('submit', async e => {
        e.preventDefault(); if (pendente) return;
        $('erro-dialogo').textContent = '';
        const body = {};
        if (modo === 'novo' || modo === 'editar') { body.nome = $('nome').value.trim(); body.email = $('email').value.trim(); body.perfil = 'vendedor'; }
        if (modo === 'novo' || modo === 'senha') {
            if ($('senha').value !== $('confirmar-senha').value) { $('erro-dialogo').textContent = 'As senhas não conferem.'; return; }
            body.senha = $('senha').value;
        }
        if (modo === 'status') body.ativo = !selecionado.ativo;
        const url = modo === 'novo' ? '/api/usuarios' : `/api/usuarios/${selecionado.id}${modo === 'senha' || modo === 'status' ? '/' + modo : ''}`;
        pendente = true; $('salvar').disabled = true; $('cancelar').disabled = true; $('fechar').disabled = true;
        try {
            const dados = await api(url, modo === 'novo' ? 'POST' : 'PATCH', body);
            // Atualização local confirma a gravação sem reenviar a operação em caso de falha de rede posterior.
            usuarios = usuarios.filter(u => String(u.id) !== String(dados.usuario.id));
            usuarios.push(dados.usuario); usuarios.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
            desenhar(); $('dialogo').close(); $('formulario').reset(); mensagem(dados.mensagem);
        } catch (erro) { $('erro-dialogo').textContent = erro.message; }
        finally { pendente = false; $('salvar').disabled = false; $('cancelar').disabled = false; $('fechar').disabled = false; }
    });
    (async () => {
        if (!token) return sair();
        try {
            const { usuario } = await api('/api/auth/me');
            if (usuario.perfil !== 'admin') { sair(); return; }
            $('nome-usuario').textContent = usuario.nome;
            await carregar(); $('novo').disabled = false; $('atualizar').disabled = false;
        } catch (erro) { mensagem(erro.message, true); }
    })();
})();
