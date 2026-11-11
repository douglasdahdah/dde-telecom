'use strict';

let planosDDE = [];
let tipoPlanoAtual = 'internet';
const iconePlano = nome => '<svg class="icon" aria-hidden="true"><use href="#i-' + nome + '"/></svg>';

document.addEventListener('DOMContentLoaded', async () => {
  document.querySelectorAll('.aba-plano').forEach(botao => botao.addEventListener('click', () => mostrarPlanos(botao.dataset.tipo)));
  document.querySelectorAll('[data-tipo-menu]').forEach(link => link.addEventListener('click', evento => {
    evento.preventDefault();
    mostrarPlanos(link.dataset.tipoMenu);
    document.getElementById('planos')?.scrollIntoView({behavior:'smooth',block:'start'});
  }));
  await carregarPlanosDDE();
});

async function carregarPlanosDDE() {
  const lista = document.getElementById('lista-planos');
  if (!lista) return;
  try {
    const resposta = await fetch('/api/planos');
    if (!resposta.ok) throw new Error('Falha ao consultar ofertas.');
    const dados = await resposta.json();
    if (!Array.isArray(dados)) throw new Error('Catálogo indisponível.');
    planosDDE = dados.filter(p => p && typeof p.nome === 'string' && Number.isFinite(Number(p.preco)));
    const escolha = document.getElementById('interesse');
    if (escolha?.tagName === 'SELECT') {
      const selecionado = escolha.value;
      escolha.replaceChildren(new Option('Quero ajuda para escolher', 'Atendimento geral'));
      planosDDE.forEach(p => escolha.add(new Option(p.nome, p.nome)));
      if (planosDDE.some(p => p.nome === selecionado)) escolha.value = selecionado;
    }
    mostrarPlanos(tipoPlanoAtual);
  } catch (erro) {
    console.warn('Não foi possível carregar as ofertas da DDE.');
    lista.innerHTML = '<p class="loading-plans">As ofertas não carregaram agora. <a href="#atendimento">Solicite atendimento à DDE</a> para conhecer as opções.</p>';
  }
}

function normalizarTipo(valor) {
  const tipo = String(valor || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return tipo.includes('controle') ? 'controle' : tipo.includes('pos') ? 'pos' : 'internet';
}

function mostrarPlanos(tipo) {
  tipoPlanoAtual = normalizarTipo(tipo);
  const lista = document.getElementById('lista-planos');
  if (!lista) return;
  document.querySelectorAll('.aba-plano').forEach(b => {
    const ativo = b.dataset.tipo === tipoPlanoAtual;
    b.classList.toggle('ativa', ativo);
    b.setAttribute('aria-pressed', String(ativo));
  });
  lista.replaceChildren();
  const planos = planosDDE.filter(p => normalizarTipo(p.tipo) === tipoPlanoAtual)
    .sort((a,b) => Number(a.ordem || 0) - Number(b.ordem || 0) || Number(a.id) - Number(b.id));
  lista.classList.toggle('single', planos.length === 1);
  if (!planos.length) {
    lista.innerHTML = '<p class="loading-plans">Consulte nossa equipe para conhecer as opções desta categoria. <a href="#atendimento">Quero atendimento</a></p>';
    return;
  }
  planos.forEach(plano => lista.appendChild(montarCardPlano(plano)));
}

function montarCardPlano(p) {
  const tipo = normalizarTipo(p.tipo);
  const combo = tipo === 'internet' && Boolean(p.franquia);
  const categoria = combo ? 'Fibra + celular' : tipo === 'internet' ? 'Internet Fibra Algar' : tipo === 'controle' ? 'Algar Controle' : 'Algar Pós-pago';
  const velocidade = obterVelocidade(p);
  const preco = Number(p.preco).toFixed(2).split('.');
  const beneficios = Array.isArray(p.beneficios) ? p.beneficios.filter(x => typeof x === 'string') : [];
  const card = document.createElement('article');
  card.className = 'plano-card' + (p.destaque ? ' destaque' : '') + (combo ? ' combo' : '');
  const selo = p.selo || (tipo === 'internet' ? 'Conexão para sua casa' : 'Conecte seu celular');
  const condicoes = p.observacoes || (p.fidelidade_meses ? 'Consulte as condições da oferta e de pagamento no atendimento.' : 'Consulte disponibilidade e condições no atendimento.');
  const periodo = p.promocional && p.oferta_valida_ate ? 'Oferta até ' + p.oferta_valida_ate.split('-').reverse().join('/') + '.' : '';
  const anterior = p.promocional && Number(p.preco_original) > Number(p.preco) ? 'De ' + Number(p.preco_original).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) + '. ' : '';
  card.innerHTML = '<div class="plano-selo">' + esc(selo) + '</div><div class="plano-card-conteudo">' +
    '<div class="plano-main"><div class="plano-category">' + iconePlano(tipo === 'internet' ? 'wifi' : 'phone') + esc(categoria) + '</div>' +
    '<div class="plano-velocidade' + (velocidade.unidade ? '' : ' ilimitado') + '"><strong>' + esc(velocidade.numero) + '</strong><span>' + esc(velocidade.unidade) + '</span></div>' +
    '<p class="plano-descricao">' + esc(combo ? p.nome : p.descricao || p.nome) + '</p>' +
    '<div class="plano-preco" aria-label="' + esc(Number(p.preco).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})) + ' por mês"><small>R$</small><strong>' + Number(preco[0]).toLocaleString('pt-BR') + '</strong><b>,' + preco[1] + '</b><span>/mês</span></div>' +
    '</div>' +
    '<details class="plano-detalhes"><summary>O que está incluído</summary><ul class="plano-beneficios">' + beneficios.map(b => '<li>' + iconePlano('check') + '<span>' + esc(b) + '</span></li>').join('') + '</ul></details>' +
    '<p class="plano-condicoes">' + esc([anterior + periodo,condicoes].filter(Boolean).join(' ')) + '</p>' +
    '<button type="button" class="btn btn-mint botao-plano" data-plano="' + esc(p.nome) + '" aria-label="Quero conhecer ' + esc(p.nome) + '">Quero esse plano ' + iconePlano('arrow') + '</button>' +
    '<p class="plano-fidelidade">' + (p.fidelidade_meses ? 'Fidelidade de ' + Number(p.fidelidade_meses) + ' meses.' : 'Condições confirmadas no atendimento.') + '</p></div>';
  return card;
}

function obterVelocidade(p) {
  const texto = String(normalizarTipo(p.tipo) === 'internet' ? p.velocidade || p.nome : p.franquia || p.nome).toUpperCase();
  if (texto.includes('ILIMITADO')) return {numero:'Ilimitado',unidade:''};
  let m = texto.match(/(\d+(?:[.,]\d+)?)\s*(GIGA|GBPS)/);
  if (m) return {numero:m[1],unidade:'GIGA'};
  m = texto.match(/(\d+(?:[.,]\d+)?)\s*(MEGA|MBPS|GB)/);
  return m ? {numero:m[1],unidade:m[2] === 'GB' ? 'GB' : 'MEGA'} : {numero:p.nome,unidade:''};
}

document.addEventListener('click', evento => {
  const botao = evento.target.closest('.botao-plano');
  if (!botao) return;
  const campo = document.getElementById('interesse');
  if (campo) { campo.value = botao.dataset.plano || 'Atendimento geral'; campo.dispatchEvent(new Event('change',{bubbles:true})); }
  document.getElementById('atendimento')?.scrollIntoView({behavior:'smooth',block:'start'});
  setTimeout(() => document.getElementById('nome')?.focus({preventScroll:true}), 450);
});

function esc(valor) { return String(valor ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }

