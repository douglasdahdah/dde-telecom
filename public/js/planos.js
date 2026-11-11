let planosDDE = [];
let tipoPlanoAtual = "internet";
document.addEventListener("DOMContentLoaded", async () => {
  configurarAbasPlanos();
  configurarMenuPlanos();
  await carregarPlanosDDE();
});
async function carregarPlanosDDE() {
  const lista = document.getElementById("lista-planos");
  if (!lista) return;
  lista.innerHTML = '<p class="loading-plans">Carregando planos...</p>';
  try {
    const r = await fetch("/api/planos");
    if (!r.ok) throw new Error("Não foi possível carregar os planos.");
    planosDDE = await r.json();
    mostrarPlanos("internet");
  } catch (e) {
    console.error(e);
    lista.innerHTML =
      '<p class="loading-plans">Não foi possível carregar os planos neste momento.</p>';
  }
}
function normalizarTipo(v) {
  let t = String(v || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (t.includes("controle")) return "controle";
  if (t.includes("pos")) return "pos";
  return "internet";
}
function mostrarPlanos(tipo) {
  tipoPlanoAtual = tipo;
  const lista = document.getElementById("lista-planos");
  if (!lista) return;
  atualizarAbas(tipo);
  const planos = planosDDE.filter((p) => normalizarTipo(p.tipo) === tipo);
  lista.innerHTML = "";
  if (!planos.length) {
    lista.innerHTML =
      '<p class="loading-plans">Nenhum plano disponível nesta categoria.</p>';
    return;
  }
  planos.forEach((p, i) => lista.appendChild(montarCardPlano(p, i, planos)));
}
function montarCardPlano(p, i, planos) {
  const card = document.createElement("article"),
    dest = identificarDestaque(p),
    v = obterVelocidade(p),
    pr = separarPreco(p.preco);
  card.className = dest ? "plano-card destaque" : "plano-card";
  const selo = dest
    ? '<div class="plano-selo-destaque">' + esc(p.selo || "DESTAQUE") + "</div>"
    : "";
  let condicoes = "";
  if (p.promocional)
    condicoes +=
      '<p class="plano-condicoes">De R$ ' +
      esc(Number(p.preco_original).toFixed(2).replace(".", ",")) +
      " • Oferta até " +
      esc(
        String(p.oferta_valida_ate || "")
          .split("-")
          .reverse()
          .join("/"),
      ) +
      "</p>";
  if (p.fidelidade_meses != null)
    condicoes +=
      '<p class="plano-condicoes">' +
      (p.fidelidade_meses === 0
        ? "Sem fidelidade"
        : "Fidelidade: " + esc(p.fidelidade_meses) + " meses") +
      "</p>";
  if (p.observacoes)
    condicoes += '<p class="plano-condicoes">' + esc(p.observacoes) + "</p>";
  card.innerHTML =
    selo +
    '<div class="plano-card-conteudo"><div class="plano-velocidade"><strong>' +
    esc(v.numero) +
    "</strong><span>" +
    esc(v.unidade) +
    '</span></div><p class="plano-descricao">' +
    esc(obterDescricao(p, v)) +
    '</p><div class="plano-preco-novo"><span class="plano-cifrao">R$</span><strong>' +
    esc(pr.inteiro) +
    '</strong><div class="plano-centavos"><b>,' +
    esc(pr.centavos) +
    "</b><small>/mês</small></div></div>" +
    condicoes +
    '<ul class="plano-beneficios">' +
    obterBeneficios(p)
      .map((x) => "<li>" + esc(x) + "</li>")
      .join("") +
    '</ul><button type="button" class="botao-plano" data-plano="' +
    esc(p.nome || "") +
    '">Quero esse plano →</button></div>';
  return card;
}
function identificarDestaque(p) {
  return p.destaque === true;
}
function obterVelocidade(p) {
  const t = String(p.velocidade || p.franquia || p.nome || "")
    .trim()
    .toUpperCase();
  let m = t.match(/(\d+(?:[.,]\d+)?)\s*(GIGA|GBPS)/);
  if (m) return { numero: m[1], unidade: "GIGA" };
  m = t.match(/(\d+(?:[.,]\d+)?)\s*(MEGA|MBPS|GB)/);
  if (m) return { numero: m[1], unidade: m[2] === "GB" ? "GB" : "MEGA" };
  m = t.match(/\d+(?:[.,]\d+)?/);
  return m
    ? {
        numero: m[0],
        unidade: normalizarTipo(p.tipo) === "internet" ? "MEGA" : "GB",
      }
    : { numero: p.nome || "Plano", unidade: "" };
}
function obterDescricao(p, v) {
  if (p.descricao && String(p.descricao).trim())
    return String(p.descricao).trim();
  const tipo = normalizarTipo(p.tipo);
  if (tipo === "controle") return "Controle para usar sem surpresas.";
  if (tipo === "pos") return "Mais internet móvel para sua rotina.";
  const n = Number(String(v.numero).replace(",", "."));
  if (n <= 600) return "Ideal para toda a família conectada.";
  return "Alta performance para vários dispositivos.";
}
function obterBeneficios(p) {
  if (Array.isArray(p.beneficios))
    return p.beneficios
      .filter((x) => typeof x === "string" && x.trim())
      .map((x) => x.trim());
  if (typeof p.beneficios === "string")
    return p.beneficios
      .split(/\n/)
      .map((x) => x.trim())
      .filter(Boolean);
  return [];
}
function separarPreco(v) {
  let n = Number(v || 0);
  if (!Number.isFinite(n)) n = 0;
  const a = n.toFixed(2).split(".");
  return { inteiro: Number(a[0]).toLocaleString("pt-BR"), centavos: a[1] };
}
function configurarAbasPlanos() {
  document
    .querySelectorAll(".aba-plano")
    .forEach((b) =>
      b.addEventListener("click", () => mostrarPlanos(b.dataset.tipo)),
    );
}
function atualizarAbas(tipo) {
  document
    .querySelectorAll(".aba-plano")
    .forEach((b) => b.classList.toggle("ativa", b.dataset.tipo === tipo));
}
function configurarMenuPlanos() {
  document.querySelectorAll("[data-tipo-menu]").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      mostrarPlanos(a.dataset.tipoMenu);
      document
        .getElementById("planos")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }),
  );
}
document.addEventListener("click", (e) => {
  const b = e.target.closest(".botao-plano");
  if (!b) return;
  e.preventDefault();
  const i = document.getElementById("interesse");
  if (i) i.value = b.dataset.plano || "";
  document
    .getElementById("atendimento")
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
  setTimeout(() => document.getElementById("nome")?.focus(), 600);
});
function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
