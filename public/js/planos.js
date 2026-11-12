'use strict';

let planosDDE = [];
let tipoPlanoAtual = 'internet';
const iconePlano = nome => '<svg class="icon" aria-hidden="true"><use href="#i-' + nome + '"/></svg>';
const precosReferenciaAlgarUberaba = new Map([
  ['Internet 700 Mega + Super Wi-Fi', { preco: 129.90, condicoes: 'Valor exibido por 12 meses com débito automático.' }],
  ['Internet 700 Mega + Controle 55 GB', { preco: 149.90, condicoes: 'Valor exibido por 12 meses com débito automático.' }],
]);
const dataConsultaAlgarUberaba = '11/11/2026';
// Vende Junto Liderança Varejo, adesão ou migração em Uberaba de 03 a 30/11/2026.
const precosCelularNoCombo = new Map([
  ['Algar Controle Plus 55GB', 50],
  ['Algar Pós Super 75GB', 75],
  ['Algar Pós Ultra 100GB', 100],
  ['Algar Pós Top Ilimitado', 150],
]);
const dataComercial = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

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
    const resposta = await fetch('/api/planos?consulta=1');
    if (!resposta.ok) throw new Error('Falha ao consultar ofertas.');
    const dados = await resposta.json();
    if (!Array.isArray(dados)) throw new Error('Catálogo indisponível.');
    planosDDE = dados.filter(p => p && typeof p.nome === 'string' &&
      (p.sob_consulta === true || (p.preco != null && Number.isFinite(Number(p.preco)))));
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
  const categoria = combo ? 'Fibra + celular' : tipo === 'internet' ? 'Internet fibra' : tipo === 'controle' ? 'Celular controle' : 'Celular pós-pago';
  const velocidade = obterVelocidade(p);
  const consulta = p.sob_consulta === true;
  const referencia = consulta ? precosReferenciaAlgarUberaba.get(p.nome) : undefined;
  const valor = consulta ? referencia?.preco : Number(p.preco);
  const preco = valor === undefined ? '' : valor.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const celular = tipo !== 'internet';
  const hoje = dataComercial();
  const valorNoCombo = celular && hoje >= '2026-11-03' && hoje <= '2026-11-30'
    ? precosCelularNoCombo.get(p.nome) : undefined;
  const beneficios = Array.isArray(p.beneficios) ? p.beneficios.filter(b => typeof b === 'string') : [];
  const validade = p.oferta_valida_ate ? 'Adesão até ' + p.oferta_valida_ate.split('-').reverse().join('/') : '';
  const anterior = p.promocional && Number(p.preco_original) > valor
    ? 'De ' + Number(p.preco_original).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) : '';
  const condicoes = p.observacoes || 'Consulte disponibilidade e condições no atendimento.';
  const fidelidade = p.fidelidade_meses ? 'Fidelidade de ' + Number(p.fidelidade_meses) + ' meses' : '';
  const acao = consulta ? 'Solicitar consulta' : 'Quero esse plano';
  const card = document.createElement('article');
  card.className = 'plano-card oferta-card' + (p.destaque ? ' oferta-destaque' : '') + (consulta ? ' oferta-consulta' : '');
  card.innerHTML = `
    <header class="oferta-cabecalho">
      <div class="oferta-categoria">${iconePlano(tipo === 'internet' ? 'wifi' : 'phone')} ${esc(categoria)}</div>
      ${velocidade.numero === p.nome ? '' : `<div class="oferta-velocidade${velocidade.unidade ? '' : ' oferta-ilimitado'}">${esc(velocidade.numero)} <span>${esc(velocidade.unidade)}</span></div>`}
      <h3>${esc(p.nome)}</h3>
    </header>
    <div class="oferta-corpo">
      ${preco ? `<div class="oferta-valor${consulta ? ' plano-referencia' : ''}">
        ${celular ? '<span class="oferta-rotulo">Plano avulso de celular</span>'
          : consulta ? '<span class="oferta-rotulo">Referência de preço para Uberaba</span>' : ''}
        ${anterior ? '<s class="oferta-rotulo">' + esc(anterior) + '</s>' : ''}
        <div class="oferta-preco"><strong>${esc(preco)}</strong><span>${celular ? '/mês por linha' : '/mês'}</span></div>
      </div>` : ''}
      ${consulta ? `
        <p class="oferta-nota plano-sob-consulta">${celular ? 'Preço avulso e disponibilidade sob consulta.' : 'Preço e disponibilidade sob consulta.'}</p>
        ${referencia ? `<p class="oferta-condicoes">Consultado em ${dataConsultaAlgarUberaba}. ${esc(referencia.condicoes)}</p>` : ''}
      ` : `
        <p class="oferta-condicoes">${esc(condicoes)}</p>
        ${validade || fidelidade ? `<ul class="oferta-prazos">${[validade,fidelidade].filter(Boolean).map(prazo => '<li>' + esc(prazo) + '</li>').join('')}</ul>` : ''}
        ${p.descricao || beneficios.length ? `<details class="oferta-beneficios">
          <summary>O que está incluído</summary>
          ${p.descricao ? '<p>' + esc(p.descricao) + '</p>' : ''}
          ${beneficios.length ? '<ul>' + beneficios.map(b => '<li>' + iconePlano('check') + esc(b) + '</li>').join('') + '</ul>' : ''}
        </details>` : ''}
      `}
      ${valorNoCombo !== undefined ? `<div class="oferta-valor-combo">
        <span class="oferta-rotulo">Só no combo com internet</span>
        <div class="oferta-preco"><strong>${esc(valorNoCombo.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}))}</strong><span>/mês por linha</span></div>
        <p>Preço da linha de celular, válido por 12 meses. Consulte o total do combo. Adesão até 30/11/2026, com fidelidade de 12 meses e sujeita à viabilidade da internet.</p>
      </div>` : ''}
      <button type="button" class="btn botao-plano" data-plano="${esc(p.nome)}" aria-label="${consulta ? 'Solicitar consulta sobre ' : 'Quero conhecer '}${esc(p.nome)}">${acao} ${iconePlano('arrow')}</button>
    </div>`;
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

