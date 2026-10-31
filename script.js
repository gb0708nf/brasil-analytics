/* ==========================================================================
   Brasil Analytics — script.js
   Autor do projeto: Gabriel Nunes Fernandes

   ARQUITETURA (um único arquivo, dividido em módulos por seção):
     1. Utilitários e formatação
     2. Ícones (SVG inline)
     3. Configuração e camada de dados (APIs BCB/IBGE + fallback simulado)
     4. Indicadores derivados (IPCA 12m etc.)
     5. Painel: cartões de indicadores + termômetro + fontes
     6. Gráficos interativos (zoom, período, PNG)
     7. Assistente Econômico (análises automáticas)
     8. Laboratório Econômico (simulador de cenários)
     9. Tendências (médias móveis + regressão linear)
    10. Mapa dos estados + rankings
    11. Setores, crises, governos e comparador internacional
    12. Exportação (CSV / PNG / PDF)
    13. Navegação, tema e inicialização

   Fluxo: init() → refreshData() → loadAll() (APIs ou simulação) → derive() → renderAll()
   Cada função render*() é idempotente: pode ser chamada de novo após atualização de dados ou troca de tema.
   ========================================================================== */
'use strict';

(function () {

/* ==========================================================================
   1. UTILITÁRIOS
   ========================================================================== */
const $  = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const pad = n => String(n).padStart(2, '0');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const fmt = (v, d = 2) => Number.isFinite(v)
  ? v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const COLORS = { blue: '#2563EB', green: '#10B981', red: '#EF4444', amber: '#F59E0B', violet: '#8B5CF6', slate: '#94A3B8', orange: '#F97316' };

/** Converte rótulos internos ('2025-03' ou '2025-T2') para exibição ('mar/25' / 'T2/25'). */
function pretty(l) {
  if (!l) return '';
  if (l.includes('-T')) { const [y, q] = l.split('-T'); return `T${q}/${y.slice(2)}`; }
  const [y, m] = l.split('-');
  return `${MESES[+m - 1]}/${y.slice(2)}`;
}
const ym = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const brDate = d => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const parseBR = s => { const [d, m, y] = s.split('/').map(Number); return new Date(y, m - 1, d); };

/** Gera os próximos n rótulos (mensais ou trimestrais) depois de `lastLabel`. */
function nextLabels(lastLabel, n) {
  const out = [];
  if (lastLabel.includes('-T')) {
    let [y, q] = lastLabel.split('-T').map(Number);
    for (let i = 0; i < n; i++) { q++; if (q > 4) { q = 1; y++; } out.push(`${y}-T${q}`); }
  } else {
    let [y, m] = lastLabel.split('-').map(Number);
    for (let i = 0; i < n; i++) { m++; if (m > 12) { m = 1; y++; } out.push(`${y}-${pad(m)}`); }
  }
  return out;
}

function download(url, name) {
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}

/* ==========================================================================
   2. ÍCONES (traços estilo "Lucide", SVG inline — sem dependências)
   ========================================================================== */
const ICONS = {
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  bot: '<rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><path d="M8 16h.01"/><path d="M16 16h.01"/>',
  flask: '<path d="M10 2v7.5L4.5 19a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 9.5V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/>',
  trend: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  map: '<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
  refresh: '<polyline points="23 4 23 10 17 10"/><path d="M20.5 15a9 9 0 1 1-2.1-9.4L23 10"/>',
  menu: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
  up: '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>',
  down: '<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>',
  flat: '<line x1="5" y1="12" x2="19" y2="12"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  printer: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><polyline points="3 3 3 8 8 8"/>',
  dollar: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  percent: '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
  landmark: '<line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  scale: '<path d="M16 16l3-8 3 8c-.9.7-1.9 1-3 1s-2.1-.3-3-1z"/><path d="M2 16l3-8 3 8c-.9.7-1.9 1-3 1s-2.1-.3-3-1z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>'
};
const icon = (n, s = 18) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;
function hydrateIcons(root = document) {
  $$('[data-icon]', root).forEach(el => { if (!el.dataset.done) { el.innerHTML = icon(el.dataset.icon, el.closest('.export-card') ? 30 : 18); el.dataset.done = 1; } });
}

/* ==========================================================================
   3. CONFIGURAÇÃO E CAMADA DE DADOS
   --------------------------------------------------------------------------
   Cada série tem: api() → busca real | sim() → dados simulados de reserva.
   Formato interno: { labels: ['2024-01', ...], values: [..], step: 1 (mensal) | 3 (trimestral) }
   >>> Para trocar/ajustar uma série, edite SOURCES. Códigos SGS: https://www3.bcb.gov.br/sgspub
   ========================================================================== */
const CFG = {
  REFRESH_MS: 30 * 60 * 1000,   // atualização automática a cada 30 min
  TIMEOUT_MS: 12000,
  YEARS: 10                      // janela histórica buscada nas APIs
};

const DATA = {};                 // séries carregadas: DATA[chave] = {labels, values, step, source, error}
const state = { theme: 'dark', view: 'painel', range: {}, uf: 'SP', mapMetric: 'pib', trendKey: 'ipca12', updatedAt: null, intl: null, intlSource: 'estimativas aproximadas' };
const charts = {};               // registro de instâncias Chart.js (para destruir/exportar)

async function fetchJSON(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), CFG.TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

/** Banco Central — SGS. Retorna pontos {date, v}. */
async function sgs(code, years = CFG.YEARS) {
  const end = new Date(), start = new Date(end);
  start.setFullYear(end.getFullYear() - years); start.setDate(start.getDate() + 3);
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${brDate(start)}&dataFinal=${brDate(end)}`;
  const raw = await fetchJSON(url);
  return raw.map(r => ({ date: parseBR(r.data), v: parseFloat(r.valor) })).filter(p => Number.isFinite(p.v));
}

/** Agrega pontos diários/mensais em série mensal ('last' = último valor do mês, 'mean' = média). */
function monthly(points, mode = 'last') {
  const map = new Map();
  points.forEach(p => { const k = ym(p.date); (map.get(k) || map.set(k, []).get(k)).push(p.v); });
  const labels = [...map.keys()].sort();
  return { labels, values: labels.map(k => { const a = map.get(k); return mode === 'mean' ? a.reduce((s, x) => s + x, 0) / a.length : a[a.length - 1]; }), step: 1 };
}

/** IBGE — SIDRA. kind 'm' = mensal (AAAAMM) | 'q' = trimestral (AAAAQQ). */
async function sidra(path, kind) {
  const raw = (await fetchJSON('https://apisidra.ibge.gov.br/values/' + path)).slice(1);
  const labels = [], values = [];
  raw.forEach(r => {
    const v = parseFloat(String(r.V).replace(',', '.'));
    if (!Number.isFinite(v)) return;
    const p = String(r.D3C);
    labels.push(kind === 'q' ? `${p.slice(0, 4)}-T${Number(p.slice(4))}` : `${p.slice(0, 4)}-${p.slice(4, 6)}`);
    values.push(v);
  });
  return { labels, values, step: kind === 'q' ? 3 : 1 };
}

/* ---- Dados simulados (reserva): interpolação entre âncoras + ruído com semente fixa ---- */
function rng(seed) { // mulberry32
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function monthLabels(n) {
  const out = [], d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (n - 1));
  for (let i = 0; i < n; i++) { out.push(ym(d)); d.setMonth(d.getMonth() + 1); }
  return out;
}
function quarterLabels(n) {
  const d = new Date(); let y = d.getFullYear(), q = Math.floor(d.getMonth() / 3); // último trimestre concluído
  if (q < 1) { q = 4; y--; }
  const out = [];
  for (let i = 0; i < n; i++) { out.unshift(`${y}-T${q}`); q--; if (q < 1) { q = 4; y--; } }
  return out;
}
function simSeries(seed, labels, anchors, noise, step = 1) {
  const r = rng(seed), n = labels.length; let e = 0;
  const values = labels.map((_, i) => {
    const x = i / (n - 1); let k = anchors.findIndex(a => a[0] >= x); if (k <= 0) k = 1;
    const [x0, y0] = anchors[k - 1], [x1, y1] = anchors[k];
    e = 0.6 * e + (r() - 0.5) * noise * 2;
    return y0 + (y1 - y0) * ((x - x0) / ((x1 - x0) || 1)) + e;
  });
  return { labels, values, step };
}
const simM = (seed, anchors, noise) => () => simSeries(seed, monthLabels(120), anchors, noise, 1);
const simQ = (seed, anchors, noise) => () => simSeries(seed, quarterLabels(40), anchors, noise, 3);

/* ---- Catálogo de séries ---- */
const SOURCES = {
  selic: { label: 'Selic (meta, % a.a.)', origem: 'BCB SGS 432',
    api: async () => monthly(await sgs(432), 'last'),
    sim: simM(11, [[0, 14.25], [.1, 14], [.25, 6.5], [.35, 4.5], [.5, 2], [.58, 9.25], [.65, 13.75], [.8, 10.75], [.9, 14.5], [1, 14.5]], 0.05),
    ok: s => s.values.every(v => v > 0 && v < 50) },
  ipca: { label: 'IPCA mensal (%)', origem: 'BCB SGS 433',
    api: async () => monthly(await sgs(433), 'last'),
    sim: simM(12, [[0, .5], [.15, .3], [.4, .2], [.58, .7], [.7, .5], [.85, .4], [1, .4]], 0.25),
    ok: s => s.values.every(v => Math.abs(v) < 30) },
  usd: { label: 'Dólar comercial (R$, média mensal)', origem: 'BCB SGS 1',
    api: async () => monthly(await sgs(1), 'mean'),
    sim: simM(13, [[0, 3.6], [.1, 3.2], [.3, 3.9], [.45, 5.2], [.6, 5.5], [.8, 5.0], [.9, 6.0], [1, 5.4]], 0.08),
    ok: s => s.values.every(v => v > .5 && v < 30) },
  des: { label: 'Taxa de desemprego (%)', origem: 'IBGE SIDRA 6381 (PNAD Contínua) → BCB SGS 24369',
    api: async () => { try { const s = await sidra('t/6381/n1/all/v/4099/p/last%20120', 'm'); if (s.values.length >= 24) return s; throw new Error('curta'); } catch (e) { return monthly(await sgs(24369), 'last'); } },
    sim: simM(14, [[0, 11.5], [.1, 12.5], [.25, 12], [.45, 14.5], [.6, 11], [.8, 7.8], [1, 5.6]], 0.15),
    ok: s => s.values.every(v => v > 0 && v < 40) },
  pib: { label: 'PIB (var. anual do trimestre, %)', origem: 'IBGE SIDRA 5932',
    api: async () => sidra('t/5932/n1/all/v/6564/p/last%2040/c11255/90707', 'q'),
    sim: simQ(15, [[0, -3.5], [.1, 1.3], [.3, 1.2], [.35, -10], [.4, 12], [.5, 3], [.7, 3], [.85, 2.5], [1, 2.2]], 0.2),
    ok: s => s.values.every(v => Math.abs(v) < 40) },
  div: { label: 'Dívida bruta / PIB (%)', origem: 'BCB SGS 13762',
    api: async () => monthly(await sgs(13762), 'last'),
    sim: simM(16, [[0, 69], [.2, 74], [.4, 86], [.5, 78], [.7, 72], [.85, 76], [1, 78]], 0.2),
    ok: s => s.values.every(v => v > 10 && v < 250) },
  prim: { label: 'Resultado primário (% PIB, 12m)', origem: 'BCB SGS 5793 (verifique o código no SGS)',
    api: async () => monthly(await sgs(5793), 'last'),
    sim: simM(17, [[0, -2.5], [.1, -2], [.3, -1.2], [.4, -9.5], [.5, -1.2], [.6, 1], [.8, -.3], [1, -.4]], 0.1),
    ok: s => s.values.every(v => Math.abs(v) < 20) },
  res: { label: 'Reservas internacionais (US$ milhões)', origem: 'BCB SGS 13621',
    api: async () => monthly(await sgs(13621), 'last'),
    sim: simM(18, [[0, 365000], [.4, 355000], [.6, 350000], [1, 355000]], 2500),
    ok: s => s.values.every(v => v > 1000) }
};
const META_EXTRA = { ipca12: { label: 'IPCA acumulado 12 meses (%)', origem: 'Derivado de BCB SGS 433' } };
const metaOf = k => SOURCES[k] || META_EXTRA[k];

async function loadSeries(key) {
  const src = SOURCES[key];
  try {
    const s = await src.api();
    if (!s || s.values.length < 12) throw new Error('série curta/vazia');
    if (src.ok && !src.ok(s)) throw new Error('valores fora do intervalo esperado');
    DATA[key] = { ...s, source: 'api' };
  } catch (e) {
    console.warn(`[Brasil Analytics] ${key}: usando dados simulados (${e.message})`);
    DATA[key] = { ...src.sim(), source: 'sim', error: e.message };
  }
}

/* Banco Mundial (opcional): atualiza o comparador internacional quando acessível */
async function loadWorldBank() {
  const ind = { growth: 'NY.GDP.MKTP.KD.ZG', infl: 'FP.CPI.TOTL.ZG', unemp: 'SL.UEM.TOTL.ZS', debt: 'GC.DOD.TOTL.GD.ZS' };
  const names = { BRA: 'Brasil', USA: 'EUA', CHN: 'China', DEU: 'Alemanha', IND: 'Índia' };
  const next = JSON.parse(JSON.stringify(INTL)); let hits = 0;
  await Promise.all(Object.entries(ind).map(async ([k, code]) => {
    try {
      const j = await fetchJSON(`https://api.worldbank.org/v2/country/BRA;USA;CHN;DEU;IND/indicator/${code}?format=json&mrnev=1&per_page=20`);
      (j[1] || []).forEach(r => { if (r.value != null && names[r.countryiso3code]) { next[names[r.countryiso3code]][k] = +r.value; hits++; } });
    } catch (e) { /* mantém estimativas */ }
  }));
  if (hits) { state.intl = next; state.intlSource = 'Banco Mundial (valor mais recente disponível; lacunas preenchidas com estimativas)'; }
}

async function loadAll() {
  await Promise.all(Object.keys(SOURCES).map(loadSeries));
  derive();
  state.updatedAt = new Date();
}

/* ==========================================================================
   4. INDICADORES DERIVADOS E ESTATÍSTICA BÁSICA
   ========================================================================== */
function derive() {
  // IPCA acumulado em 12 meses = produtório (1 + mensal) - 1
  const m = DATA.ipca, vals = [], labs = [];
  for (let i = 11; i < m.values.length; i++) {
    let p = 1; for (let j = i - 11; j <= i; j++) p *= 1 + m.values[j] / 100;
    vals.push((p - 1) * 100); labs.push(m.labels[i]);
  }
  DATA.ipca12 = { labels: labs, values: vals, step: 1, source: m.source };
}
const last = (k, back = 0) => { const s = DATA[k]; return s ? s.values[s.values.length - 1 - back] : NaN; };
const lastLabel = k => DATA[k].labels[DATA[k].labels.length - 1];

function linreg(y) {
  const n = y.length; let sx = 0, sy = 0, sxy = 0, sxx = 0;
  y.forEach((v, i) => { sx += i; sy += v; sxy += i * v; sxx += i * i; });
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx), intercept = (sy - slope * sx) / n;
  const sd = Math.sqrt(y.reduce((s, v, i) => s + (v - (intercept + slope * i)) ** 2, 0) / Math.max(n - 2, 1));
  return { slope, intercept, sd };
}
const sma = (arr, w) => arr.map((_, i) => i < w - 1 ? null : arr.slice(i - w + 1, i + 1).reduce((a, b) => a + b, 0) / w);
/** 'up' | 'down' | 'flat' com base na inclinação relativa dos últimos pontos. */
function trendDir(vals, n = 6) {
  const y = vals.slice(-n); const { slope } = linreg(y);
  const ref = Math.max(Math.abs(y.reduce((a, b) => a + b, 0) / y.length), 0.5);
  const rel = slope / ref;
  return rel > 0.004 ? 'up' : rel < -0.004 ? 'down' : 'flat';
}

/* ==========================================================================
   5. PAINEL — CARTÕES, TERMÔMETRO, FONTES
   ========================================================================== */
const CARDS = [
  { key: 'pib',  label: 'PIB (var. anual)',      icon: 'chart',    unit: '%',      good: 'up',      mode: 'pp',  ser: 'pib',    dig: 2, per: 'tri' },
  { key: 'ipca', label: 'IPCA (12 meses)',       icon: 'percent',  unit: '%',      good: 'down',    mode: 'pp',  ser: 'ipca12', dig: 2, per: 'mês' },
  { key: 'selic', label: 'Selic (meta)',         icon: 'landmark', unit: '% a.a.', good: 'neutral', mode: 'pp',  ser: 'selic',  dig: 2, per: 'mês' },
  { key: 'usd',  label: 'Dólar (R$)',            icon: 'dollar',   unit: '',       good: 'down',    mode: 'pct', ser: 'usd',    dig: 2, per: 'mês', prefix: 'R$ ' },
  { key: 'des',  label: 'Desemprego',            icon: 'users',    unit: '%',      good: 'down',    mode: 'pp',  ser: 'des',    dig: 1, per: 'mês' },
  { key: 'div',  label: 'Dívida Bruta / PIB',    icon: 'scale',    unit: '% PIB',  good: 'down',    mode: 'pp',  ser: 'div',    dig: 1, per: 'mês' },
  { key: 'prim', label: 'Resultado Primário',    icon: 'shield',   unit: '% PIB',  good: 'up',      mode: 'pp',  ser: 'prim',   dig: 2, per: 'mês' },
  { key: 'res',  label: 'Reservas Internacionais', icon: 'landmark', unit: 'US$ bi', good: 'up',    mode: 'pct', ser: 'res',    dig: 1, per: 'mês', tf: v => v / 1000 }
];

function countUp(el, to, dig, prefix = '') {
  const t0 = performance.now(), dur = 900;
  const step = t => { const p = clamp((t - t0) / dur, 0, 1), e = 1 - Math.pow(1 - p, 3); el.textContent = prefix + fmt(to * e, dig); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

function renderCards() {
  const wrap = $('#cards'); wrap.innerHTML = '';
  CARDS.forEach((c, i) => {
    const s = DATA[c.ser], tf = c.tf || (v => v);
    const vals = s.values.map(tf), cur = vals[vals.length - 1], prev = vals[vals.length - 2];
    const delta = c.mode === 'pct' ? (cur / prev - 1) * 100 : cur - prev;
    const dir = Math.abs(delta) < 0.005 ? 'flat' : delta > 0 ? 'up' : 'down';
    const cls = dir === 'flat' || c.good === 'neutral' ? 'neutral' : (dir === c.good ? 'good' : 'bad');
    const td = trendDir(vals);
    const tTxt = { up: 'Tendência de alta', down: 'Tendência de queda', flat: 'Tendência estável' }[td];
    const sub = c.key === 'ipca' ? ` · mensal ${fmt(last('ipca'))}%` : '';
    const el = document.createElement('article');
    el.className = 'card kpi'; el.style.setProperty('--i', i);
    el.innerHTML = `
      <div class="kpi-head"><span class="kpi-icon">${icon(c.icon, 16)}</span><span>${c.label}</span>
        <span class="badge ${s.source}" title="${metaOf(c.ser).origem}">${s.source === 'api' ? 'ao vivo' : 'simulado'}</span></div>
      <div class="kpi-value"><span class="num">0</span><small>${c.unit}</small></div>
      <div class="kpi-meta">
        <span class="delta ${cls}">${icon(dir, 13)} ${fmt(Math.abs(delta), 2)}${c.mode === 'pct' ? '%' : ' p.p.'}</span>
        <span class="muted">ref. ${pretty(s.labels[s.labels.length - 1])}</span>
      </div>
      <div class="kpi-trend">${icon(td, 14)} ${tTxt}${sub}</div>
      <div class="spark"><canvas id="sp-${c.key}"></canvas></div>`;
    wrap.appendChild(el);
    countUp($('.num', el), cur, c.dig, c.prefix || '');
    const sp = vals.slice(-24), color = cls === 'bad' ? COLORS.red : cls === 'good' ? COLORS.green : COLORS.blue;
    mk(`sp-${c.key}`, {
      type: 'line',
      data: { labels: sp.map((_, k) => k), datasets: [{ data: sp, borderColor: color, borderWidth: 2, tension: .35, pointRadius: 0, fill: true, backgroundColor: grad(color) }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } }, animation: { duration: 900 } }
    });
  });
}

/* ---- Termômetro: nota 0–100 combinando inflação, desemprego, crescimento e dívida ---- */
function thermometer() {
  const infl = last('ipca12'), des = last('des'), g = last('pib'), div = last('div');
  const parts = [
    { name: 'Inflação', w: .30, val: `${fmt(infl)}% em 12m`, score: 100 - clamp(Math.abs(infl - 3) / 5 * 100, 0, 100),
      txt: infl > 4.5 ? 'acima do teto da meta' : infl < 1.5 ? 'abaixo do piso da meta' : 'dentro da meta' },
    { name: 'Desemprego', w: .25, val: `${fmt(des, 1)}%`, score: clamp(100 - (des - 4) / 8 * 100, 0, 100),
      txt: des < 6.5 ? 'mercado de trabalho aquecido' : des < 9 ? 'nível moderado' : 'nível elevado' },
    { name: 'Crescimento', w: .25, val: `${fmt(g)}% a/a`, score: clamp(50 + g * 15, 0, 100),
      txt: g >= 2.5 ? 'atividade forte' : g >= 1 ? 'crescimento moderado' : g >= 0 ? 'atividade fraca' : 'contração' },
    { name: 'Dívida pública', w: .20, val: `${fmt(div, 1)}% do PIB`, score: clamp(100 - (div - 50) / 50 * 100, 0, 100),
      txt: div > 80 ? 'patamar elevado' : div > 65 ? 'patamar intermediário' : 'patamar confortável' }
  ];
  const score = parts.reduce((s, p) => s + p.score * p.w, 0);
  const lv = score < 20 ? ['Muito Fraco', COLORS.red] : score < 40 ? ['Fraco', COLORS.orange] : score < 60 ? ['Estável', COLORS.blue] : score < 80 ? ['Bom', '#34D399'] : ['Muito Bom', COLORS.green];
  const worst = [...parts].sort((a, b) => a.score - b.score)[0], best = [...parts].sort((a, b) => b.score - a.score)[0];
  const text = `Cenário classificado como <b>${lv[0]}</b> (${fmt(score, 0)}/100). O melhor componente é <b>${best.name.toLowerCase()}</b> (${best.txt}); o ponto de maior atenção é <b>${worst.name.toLowerCase()}</b> (${worst.txt}).`;
  return { score, label: lv[0], color: lv[1], parts, text };
}
function renderThermo() {
  const t = thermometer();
  $('#thermo').innerHTML = `
    <div class="thermo-top"><div class="thermo-score" style="color:${t.color}">${fmt(t.score, 0)}</div>
      <div><div class="thermo-label" style="color:${t.color}">${t.label}</div><div class="muted">índice composto de 0 a 100</div></div></div>
    <div class="thermo-bar"><span></span><span></span><span></span><span></span><span></span><i class="thermo-marker" style="left:0%"></i></div>
    <div class="thermo-scale"><span>Muito Fraco</span><span>Fraco</span><span>Estável</span><span>Bom</span><span>Muito Bom</span></div>
    <div class="thermo-parts">${t.parts.map(p => `
      <div class="part"><div class="part-row"><span>${p.name} <span class="muted">(peso ${p.w * 100}%)</span></span><span>${p.val}</span></div>
      <div class="part-bar"><i style="width:0%;background:${p.score > 60 ? COLORS.green : p.score > 35 ? COLORS.amber : COLORS.red}" data-w="${p.score}"></i></div></div>`).join('')}</div>
    <p class="thermo-text">${t.text}</p>`;
  requestAnimationFrame(() => { // dispara as transições CSS
    $('.thermo-marker').style.left = clamp(t.score, 2, 98) + '%';
    $$('.part-bar i').forEach(i => i.style.width = i.dataset.w + '%');
  });
}

function renderSources() {
  const keys = Object.keys(SOURCES), live = keys.filter(k => DATA[k].source === 'api').length;
  $('#sources').innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th>Série</th><th>Fonte</th><th>Último</th><th>Status</th></tr></thead><tbody>${keys.map(k =>
    `<tr><td>${SOURCES[k].label}</td><td class="muted" style="white-space:normal">${SOURCES[k].origem}</td><td>${pretty(lastLabel(k))}</td>
     <td><span class="badge ${DATA[k].source}" ${DATA[k].error ? `title="${DATA[k].error}"` : ''}>${DATA[k].source === 'api' ? 'ao vivo' : 'simulado'}</span></td></tr>`).join('')}</tbody></table></div>
    <p class="note">${live}/${keys.length} séries carregadas de APIs oficiais. As demais usam dados simulados temporários (estrutura pronta para atualização automática).</p>`;
  const ls = $('#liveStatus'); ls.textContent = `${live}/${keys.length} séries ao vivo`; ls.classList.toggle('ok', live > 0);
  $('#lastUpdate').textContent = 'Atualizado ' + state.updatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/* ==========================================================================
   6. GRÁFICOS INTERATIVOS
   ========================================================================== */
/** Cria (ou recria) um gráfico, mantendo registro para exportação. */
function mk(id, cfg) {
  if (charts[id]) charts[id].destroy();
  const el = document.getElementById(id); if (!el) return null;
  charts[id] = new Chart(el, cfg); return charts[id];
}
function grad(color) { // degradê vertical abaixo da linha
  return ctx => { const { chart } = ctx; if (!chart.chartArea) return color + '33'; const g = chart.ctx.createLinearGradient(0, chart.chartArea.top, 0, chart.chartArea.bottom); g.addColorStop(0, color + '55'); g.addColorStop(1, color + '00'); return g; };
}
function setChartDefaults() {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.color = css('--muted'); Chart.defaults.borderColor = css('--grid');
  Chart.defaults.font.family = "'Inter', system-ui, sans-serif"; Chart.defaults.font.size = 12;
}
/** Opções-base com zoom (roda / arrastar), pan (Shift+arrastar) e tooltip formatado. */
function baseOpts(unit = '', extra = {}) {
  return Object.assign({
    responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { usePointStyle: true, boxWidth: 8 } },
      tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.parsed.y)}${unit}` } },
      zoom: { zoom: { wheel: { enabled: true }, pinch: { enabled: true }, drag: { enabled: true, backgroundColor: 'rgba(37,99,235,.18)' }, mode: 'x' }, pan: { enabled: true, mode: 'x', modifierKey: 'shift' } }
    },
    scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 10, autoSkip: true } }, y: { grid: { color: css('--grid') } } }
  }, extra);
}
const RANGES = [['1A', 12], ['3A', 36], ['5A', 60], ['10A', 120], ['Tudo', 0]];
function slice(key, months) {
  const s = DATA[key], n = months ? Math.ceil(months / s.step) : s.values.length;
  return { labels: s.labels.slice(-n), values: s.values.slice(-n) };
}
const lineDS = (label, data, color, extra = {}) => Object.assign({ label, data, borderColor: color, backgroundColor: grad(color), borderWidth: 2, tension: .3, pointRadius: 0, pointHoverRadius: 4, fill: true }, extra);

const MAIN = {
  'ch-ipca': { title: 'Inflação — IPCA', sub: 'Mensal (barras) e acumulado em 12 meses (linha)', ser: 'ipca12', make(r) {
      const m = slice('ipca', r), a = slice('ipca12', r), idx = new Map(a.labels.map((l, i) => [l, a.values[i]]));
      return { type: 'bar', data: { labels: m.labels.map(pretty), datasets: [
        { type: 'line', label: 'Acumulado 12m (%)', data: m.labels.map(l => idx.get(l) ?? null), borderColor: COLORS.green, borderWidth: 2.5, tension: .3, pointRadius: 0, yAxisID: 'y1' },
        { label: 'Mensal (%)', data: m.values, backgroundColor: m.values.map(v => v >= 0 ? COLORS.blue + 'CC' : COLORS.red + 'CC'), borderRadius: 3, yAxisID: 'y' }] },
        options: baseOpts('%', { scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } }, y: { position: 'left', grid: { color: css('--grid') }, title: { display: true, text: 'Mensal (%)' } }, y1: { position: 'right', grid: { display: false }, title: { display: true, text: '12 meses (%)' } } } }) }; } },
  'ch-selic': { title: 'Juros — Selic', sub: 'Meta da taxa Selic (% a.a.)', ser: 'selic', make(r) {
      const s = slice('selic', r);
      return { type: 'line', data: { labels: s.labels.map(pretty), datasets: [lineDS('Selic (% a.a.)', s.values, COLORS.blue, { stepped: true, tension: 0 })] }, options: baseOpts('%') }; } },
  'ch-usd': { title: 'Câmbio — Dólar', sub: 'Média mensal (R$) e média móvel de 12 meses', ser: 'usd', make(r) {
      const full = DATA.usd, ma = sma(full.values, 12), s = slice('usd', r), n = s.values.length;
      return { type: 'line', data: { labels: s.labels.map(pretty), datasets: [lineDS('Dólar (R$)', s.values, COLORS.green), { label: 'Média móvel 12m', data: ma.slice(-n), borderColor: COLORS.amber, borderDash: [6, 4], borderWidth: 1.8, pointRadius: 0, tension: .3 }] }, options: baseOpts('') }; } },
  'ch-des': { title: 'Mercado de trabalho', sub: 'Taxa de desemprego (%)', ser: 'des', make(r) {
      const s = slice('des', r);
      return { type: 'line', data: { labels: s.labels.map(pretty), datasets: [lineDS('Desemprego (%)', s.values, COLORS.red)] }, options: baseOpts('%') }; } },
  'ch-pib': { title: 'Crescimento econômico — PIB', sub: 'Variação anual do trimestre (%)', ser: 'pib', make(r) {
      const s = slice('pib', r);
      return { type: 'bar', data: { labels: s.labels.map(pretty), datasets: [{ label: 'PIB (var. anual, %)', data: s.values, backgroundColor: s.values.map(v => v >= 0 ? COLORS.green + 'CC' : COLORS.red + 'CC'), borderRadius: 4 }] }, options: baseOpts('%') }; } }
};

function buildChartPanels() {
  const grid = $('#chartsGrid'); grid.innerHTML = '';
  Object.entries(MAIN).forEach(([id, c]) => {
    state.range[id] ??= id === 'ch-pib' ? 0 : 120;
    const art = document.createElement('article'); art.className = 'card'; art.dataset.chart = id;
    art.innerHTML = `<header class="card-h"><div><h2>${c.title}</h2><span class="muted">${c.sub}</span></div>
      <div class="toolbar"><div class="seg">${RANGES.map(([n, m]) => `<button data-range="${m}" class="${state.range[id] === m ? 'active' : ''}">${n}</button>`).join('')}</div>
      <button class="btn ghost sm" data-reset="${id}" title="Redefinir zoom">${icon('reset', 14)}</button>
      <button class="btn ghost sm" data-png="${id}" title="Salvar como PNG">${icon('image', 14)}PNG</button></div></header>
      <div class="chart-box"><canvas id="${id}"></canvas></div>
      <p class="chart-hint">Roda do mouse ou arrastar = zoom · Shift + arrastar = mover · botão ↺ = redefinir</p>`;
    grid.appendChild(art);
  });
}
function renderMainCharts() {
  Object.entries(MAIN).forEach(([id, c]) => {
    mk(id, c.make(state.range[id]));
    const badge = DATA[c.ser].source;
    const h = $(`[data-chart="${id}"] h2`); if (h && !$('.badge', h.parentElement)) h.insertAdjacentHTML('afterend', ` <span class="badge ${badge}">${badge === 'api' ? 'ao vivo' : 'simulado'}</span>`);
  });
}

/* ==========================================================================
   7. ASSISTENTE ECONÔMICO (análises automáticas baseadas em regras)
   ========================================================================== */
const pct = (a, b) => (a / b - 1) * 100;
const ANALYSES = {
  inflacao() {
    const v = last('ipca12'), m = last('ipca'), v6 = last('ipca12', 6), d = v - v6;
    const faixa = v > 4.5 ? 'acima do teto da meta (4,5%)' : v < 1.5 ? 'abaixo do piso da meta (1,5%)' : 'dentro do intervalo de tolerância da meta (1,5% a 4,5%)';
    return `<p>O IPCA acumulado em 12 meses encontra-se em <b>${fmt(v)}%</b>, ${faixa}. A meta central do Banco Central é de 3%, e o último resultado mensal foi de ${fmt(m)}%.</p>
    <p>${d > 0.3 ? 'A inflação acelerou nos últimos seis meses, o que corrói o poder de compra das famílias e tende a manter a política monetária mais restritiva.' : d < -0.3 ? 'A inflação desacelerou nos últimos seis meses, o que alivia o orçamento das famílias e abre espaço gradual para a redução dos juros.' : 'A inflação se mantém relativamente estável nos últimos seis meses.'}
    ${v > 4.5 ? ' Enquanto permanecer acima do teto, as expectativas de preços ficam menos ancoradas e o custo de combatê-la costuma recair sobre o crédito e a atividade.' : ''}</p>`;
  },
  juros() {
    const s = last('selic'), i = last('ipca12'), real = ((1 + s / 100) / (1 + i / 100) - 1) * 100;
    const perfil = s >= 10 ? 'Historicamente esse patamar contribui para o controle da inflação, porém tende a reduzir o ritmo de crescimento da atividade econômica, encarece o crédito e eleva o custo de rolagem da dívida pública.'
      : s >= 6 ? 'Esse patamar é considerado intermediário: ainda contém pressões de preços, mas com efeito menos intenso sobre o crédito e o investimento.'
      : 'Esse patamar é historicamente baixo: estimula crédito e investimento, mas exige atenção ao risco inflacionário e à pressão sobre o câmbio.';
    return `<p>A taxa Selic encontra-se em <b>${fmt(s)}% ao ano</b>. ${perfil}</p>
    <p>Descontada a inflação dos últimos 12 meses, o juro real ex-post é de aproximadamente <b>${fmt(real)}%</b> ao ano${real > 6 ? ' — um dos mais altos entre as grandes economias, o que reforça o caráter contracionista da política monetária' : real > 3 ? ' — nível considerado restritivo' : ' — nível próximo do neutro ou estimulativo'}.</p>`;
  },
  cambio() {
    const v = last('usd'), v12 = pct(v, last('usd', 12)), v3 = pct(v, last('usd', 3));
    return `<p>O dólar comercial está em <b>R$ ${fmt(v)}</b> (média mensal), variação de <b>${fmt(v12, 1)}%</b> em 12 meses e ${fmt(v3, 1)}% em 3 meses.</p>
    <p>${v > 5.8 ? 'Um câmbio depreciado encarece importados, insumos e combustíveis, pressionando a inflação, embora favoreça exportadores.' : v > 5 ? 'O câmbio está em patamar intermediário: exerce alguma pressão sobre preços de bens importados, sem choques relevantes.' : 'Um câmbio mais valorizado ajuda a conter preços de importados e a inflação, mas reduz a competitividade dos exportadores.'}
    ${v12 > 10 ? ' A forte alta recente tende a ser repassada aos preços ao consumidor com defasagem de alguns meses.' : v12 < -10 ? ' A forte queda recente pode aliviar a inflação nos próximos meses.' : ''}</p>`;
  },
  emprego() {
    const u = last('des'), u12 = u - last('des', 12);
    return `<p>A taxa de desemprego está em <b>${fmt(u, 1)}%</b>, ${u12 < -0.3 ? 'queda' : u12 > 0.3 ? 'alta' : 'estabilidade'} de ${fmt(Math.abs(u12), 1)} p.p. em relação a um ano atrás.</p>
    <p>${u < 6.5 ? 'Esse é um dos menores níveis da série histórica da PNAD Contínua, indicando mercado de trabalho aquecido. Isso sustenta renda e consumo, mas pode pressionar salários e serviços, dificultando a convergência da inflação.' : u < 9 ? 'O patamar é moderado: a atividade absorve trabalhadores, mas ainda há ociosidade no mercado de trabalho.' : 'O patamar é elevado e indica ociosidade relevante, o que reduz a renda das famílias e o consumo.'}</p>`;
  },
  pib() {
    const g = last('pib'), g4 = last('pib', 4);
    return `<p>O PIB cresceu <b>${fmt(g)}%</b> na comparação com o mesmo trimestre do ano anterior (${pretty(lastLabel('pib'))}).</p>
    <p>${g >= 2.5 ? 'O ritmo é robusto frente à média histórica recente, sustentado por consumo, serviços e agropecuária.' : g >= 1 ? 'O ritmo é moderado, próximo ao crescimento potencial estimado para a economia brasileira (em torno de 2%).' : g >= 0 ? 'O ritmo é fraco e sugere desaceleração da atividade.' : 'A economia está em contração na comparação anual.'}
    ${g < g4 - 0.8 ? ' Há desaceleração em relação a um ano atrás, compatível com juros altos restringindo crédito e investimento.' : g > g4 + 0.8 ? ' Há aceleração em relação a um ano atrás.' : ''}</p>`;
  },
  fiscal() {
    const d = last('div'), p = last('prim');
    return `<p>A dívida bruta do governo geral está em <b>${fmt(d, 1)}% do PIB</b> e o resultado primário acumulado é de <b>${fmt(p)}% do PIB</b>${p < 0 ? ' (déficit)' : ' (superávit)'}.</p>
    <p>${d > 80 ? 'A dívida em patamar elevado, combinada com juros altos, exige superávits primários para estabilizá-la e aumenta a sensibilidade a choques.' : d > 65 ? 'O endividamento é intermediário; a trajetória depende do saldo primário e do custo dos juros.' : 'O endividamento está em patamar confortável.'} ${p < -0.5 ? 'O déficit primário contribui para o crescimento da dívida.' : ''}</p>`;
  },
  resumo() {
    const t = thermometer();
    return `<p>Panorama geral: a economia é classificada como <b style="color:${t.color}">${t.label}</b> (índice ${fmt(t.score, 0)}/100).</p>
    <p>Inflação de ${fmt(last('ipca12'))}% em 12 meses, Selic em ${fmt(last('selic'))}% a.a., dólar a R$ ${fmt(last('usd'))}, desemprego de ${fmt(last('des'), 1)}%, PIB de ${fmt(last('pib'))}% a/a e dívida bruta de ${fmt(last('div'), 1)}% do PIB.</p><p>${t.text}</p>`;
  }
};
const TOPICS = [['inflacao', 'Inflação'], ['juros', 'Juros'], ['cambio', 'Câmbio'], ['emprego', 'Mercado de trabalho'], ['pib', 'PIB'], ['fiscal', 'Contas públicas'], ['resumo', 'Resumo geral']];

function askAssistant(topic, label) {
  const log = $('#chatLog');
  log.insertAdjacentHTML('beforeend', `<div class="msg user">${label}</div>`);
  const bot = document.createElement('div'); bot.className = 'msg bot'; bot.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  log.appendChild(bot); log.scrollTop = log.scrollHeight;
  setTimeout(() => { bot.innerHTML = ANALYSES[topic](); log.scrollTop = log.scrollHeight; }, 650);
}
function buildAssistant() {
  $('#chatChips').innerHTML = TOPICS.map(([k, l]) => `<button class="chip" data-topic="${k}">${l}</button>`).join('');
  $('#chatLog').innerHTML = '<div class="msg bot"><p>Olá! Sou o Assistente Econômico. Escolha um tema acima para gerar uma análise automática com os dados mais recentes.</p></div>';
}

/* ==========================================================================
   8. LABORATÓRIO ECONÔMICO — modelo didático simplificado
   --------------------------------------------------------------------------
   Os coeficientes abaixo são ILUSTRATIVOS (ordens de grandeza plausíveis), não estimados
   econometricamente. Cada variável converge ao alvo com defasagem: x(t) = base + (alvo - base)·(1 - e^(-t/3)).
   ========================================================================== */
const LAB_FIELDS = [
  { k: 'selic', label: 'Taxa Selic', unit: '% a.a.', min: 2, max: 30, step: .25 },
  { k: 'pib', label: 'Crescimento do PIB (tendência)', unit: '%', min: -5, max: 8, step: .1 },
  { k: 'gasto', label: 'Gastos públicos (cresc. real)', unit: '% a.a.', min: -5, max: 10, step: .1 },
  { k: 'carga', label: 'Carga tributária', unit: '% do PIB', min: 25, max: 45, step: .1 },
  { k: 'usd', label: 'Valor do dólar', unit: 'R$', min: 3, max: 9, step: .05 }
];
const LAB = { inputs: null };
function labBase() {
  const f = LAB_FIELDS, v = { selic: last('selic'), pib: last('pib'), gasto: 2.0, carga: 33.0, usd: last('usd') };
  f.forEach(x => v[x.k] = clamp(v[x.k], x.min, x.max)); return v;
}
function futureQuarters(n) { const d = new Date(); return nextLabels(`${d.getFullYear()}-T${Math.floor(d.getMonth() / 3) + 1}`, n); }

function labSimulate(inp, b) {
  const T = 8, ref = { ipca: last('ipca12'), des: last('des'), div: last('div'), prim: last('prim') };
  const dSel = inp.selic - b.selic, dGas = inp.gasto - b.gasto, dCar = inp.carga - b.carga, dUsd = pct(inp.usd, b.usd), dPib = inp.pib - b.pib;
  const tgt = {
    inf: ref.ipca + 0.08 * dUsd - 0.25 * dSel + 0.20 * dPib + 0.12 * dGas - 0.08 * dCar,
    pib: inp.pib - 0.30 * dSel + 0.10 * dGas - 0.12 * dCar - 0.01 * dUsd
  };
  tgt.des = ref.des - 0.40 * (tgt.pib - 2.0);
  tgt.prim = ref.prim + 0.70 * dCar - 0.18 * dGas + 0.10 * (tgt.pib - 2.0);
  const rows = []; let debt = ref.div;
  for (let t = 1; t <= T; t++) {
    const w = 1 - Math.exp(-t / 3), at = (a, z) => a + (z - a) * w;
    const inf = at(ref.ipca, tgt.inf), gr = at(b.pib, tgt.pib), des = clamp(at(ref.des, tgt.des), 2, 20), prim = at(ref.prim, tgt.prim);
    const selic = at(b.selic, inp.selic), i = 0.75 * selic;               // custo médio da dívida ≈ 75% da Selic (simplificação)
    debt = debt * (1 + i / 400) / (1 + (gr + inf) / 400) - prim / 4;       // dinâmica trimestral da dívida/PIB
    rows.push({ inf, gr, des, debt, prim });
  }
  return rows;
}

function renderLabControls() {
  const base = labBase(); LAB.inputs ??= { ...base };
  $('#labControls').innerHTML = LAB_FIELDS.map(f => `
    <div class="field"><div class="field-top"><label for="lab-${f.k}">${f.label}</label><output id="out-${f.k}">${fmt(LAB.inputs[f.k], 2)} ${f.unit}</output></div>
    <input type="range" id="lab-${f.k}" data-k="${f.k}" min="${f.min}" max="${f.max}" step="${f.step}" value="${LAB.inputs[f.k]}"></div>`).join('');
}
function renderLab() {
  const base = labBase(); LAB.inputs ??= { ...base };
  const sc = labSimulate(LAB.inputs, base), bs = labSimulate(base, base), lab = futureQuarters(8).map(pretty);
  const pair = (id, key, color, unit, type = 'line') => mk(id, {
    type, data: { labels: lab, datasets: [
      { label: 'Cenário base', data: bs.map(r => r[key]), borderColor: COLORS.slate, backgroundColor: COLORS.slate + '88', borderDash: [5, 4], borderWidth: 2, pointRadius: 0, tension: .3 },
      { label: 'Seu cenário', data: sc.map(r => r[key]), borderColor: color, backgroundColor: type === 'bar' ? color + 'CC' : color, borderWidth: 2.5, pointRadius: 3, tension: .3, borderRadius: 4 }] },
    options: baseOpts(unit, { plugins: { legend: { labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.parsed.y)}${unit}` } }, zoom: { zoom: { wheel: { enabled: false } } } } })
  });
  pair('lab-inf', 'inf', COLORS.amber, '%'); pair('lab-des', 'des', COLORS.red, '%');
  pair('lab-pib', 'gr', COLORS.green, '%'); pair('lab-div', 'debt', COLORS.blue, '%');
  const f = (r, k, d = 2) => fmt(r[k], d);
  $('#labTable').innerHTML = `<thead><tr><th>Trimestre</th><th>Inflação 12m</th><th>Desemprego</th><th>Crescimento</th><th>Dívida/PIB</th></tr></thead><tbody>${sc.map((r, i) =>
    `<tr><td>${lab[i]}</td><td>${f(r, 'inf')}%</td><td>${f(r, 'des', 1)}%</td><td>${f(r, 'gr')}%</td><td>${f(r, 'debt', 1)}%</td></tr>`).join('')}</tbody>`;
  // Interpretação automática: compara o cenário do usuário com o cenário base no último trimestre
  const e = sc[sc.length - 1], b = bs[bs.length - 1], d = { inf: e.inf - b.inf, des: e.des - b.des, gr: e.gr - b.gr, debt: e.debt - b.debt };
  const mv = (x, th, up, dn, eq) => Math.abs(x) < th ? eq : x > 0 ? up : dn;
  const chg = [];
  const I = LAB.inputs; if (Math.abs(I.selic - base.selic) > .01) chg.push(`Selic ${fmt(I.selic)}% (${I.selic > base.selic ? '+' : ''}${fmt(I.selic - base.selic)} p.p.)`);
  if (Math.abs(I.usd - base.usd) > .01) chg.push(`dólar R$ ${fmt(I.usd)}`); if (Math.abs(I.gasto - base.gasto) > .01) chg.push(`gastos ${fmt(I.gasto, 1)}% a.a.`);
  if (Math.abs(I.carga - base.carga) > .01) chg.push(`carga tributária ${fmt(I.carga, 1)}% do PIB`); if (Math.abs(I.pib - base.pib) > .01) chg.push(`PIB tendencial ${fmt(I.pib, 1)}%`);
  $('#labInterpret').innerHTML = `
    <p>${chg.length ? 'Alterações em relação ao cenário base: <b>' + chg.join('; ') + '</b>.' : 'Nenhum parâmetro foi alterado: o cenário coincide com a projeção-base.'} Em 2 anos (8 trimestres):</p>
    <ul>
      <li><b>Inflação:</b> ${fmt(e.inf)}% — ${mv(d.inf, .15, `${fmt(d.inf)} p.p. acima do cenário base (pressão de demanda/câmbio)`, `${fmt(-d.inf)} p.p. abaixo do cenário base (política mais restritiva ou câmbio favorável)`, 'em linha com o cenário base')}.</li>
      <li><b>Crescimento:</b> ${fmt(e.gr)}% a/a — ${mv(d.gr, .1, `${fmt(d.gr)} p.p. acima do base`, `${fmt(-d.gr)} p.p. abaixo do base (juros e tributos mais altos reduzem a atividade)`, 'em linha com o base')}.</li>
      <li><b>Desemprego:</b> ${fmt(e.des, 1)}% — ${mv(d.des, .1, `${fmt(d.des, 1)} p.p. acima do base`, `${fmt(-d.des, 1)} p.p. abaixo do base (atividade mais forte)`, 'em linha com o base')}.</li>
      <li><b>Dívida/PIB:</b> ${fmt(e.debt, 1)}% — ${mv(d.debt, .3, `${fmt(d.debt, 1)} p.p. acima do base (juros mais altos e/ou menor resultado primário)`, `${fmt(-d.debt, 1)} p.p. abaixo do base`, 'trajetória semelhante à do base')}.</li>
    </ul>
    <p class="note">Modelo didático com coeficientes ilustrativos. Ferramenta educacional. Não representa previsão oficial.</p>`;
}
const PRESETS = {
  aperto: b => ({ ...b, selic: clamp(b.selic + 2, 2, 30) }),
  fiscal: b => ({ ...b, gasto: 6, carga: b.carga - 1 }),
  cambio: b => ({ ...b, usd: clamp(b.usd * 1.2, 3, 9) }),
  reset: b => ({ ...b })
};

/* ==========================================================================
   9. TENDÊNCIAS — médias móveis + regressão linear simples
   ========================================================================== */
const TREND_ITEMS = [
  { key: 'ipca12', label: 'Inflação (IPCA 12m)', unit: '%', N: 24, maShort: 3, maLong: 6 },
  { key: 'usd', label: 'Dólar (R$)', unit: '', N: 24, maShort: 3, maLong: 6 },
  { key: 'des', label: 'Desemprego (%)', unit: '%', N: 24, maShort: 3, maLong: 6 },
  { key: 'pib', label: 'PIB (var. anual, %)', unit: '%', N: 12, maShort: 2, maLong: 4 }
];
function forecast(it) {
  const s = DATA[it.key], step = s.step, y = s.values.slice(-it.N), reg = linreg(y);
  const at = h => reg.intercept + reg.slope * (y.length - 1 + h);
  const lo = it.key === 'usd' ? 0.5 : 0;
  const n6 = Math.round(6 / step), n12 = Math.round(12 / step);
  const maL = sma(s.values, it.maLong), maNow = maL[maL.length - 1];
  return { reg, y, at, n6, n12, p6: Math.max(at(n6), lo), p12: Math.max(at(n12), lo), maNow, dir: trendDir(s.values, it.N > 12 ? 12 : 6), cur: s.values[s.values.length - 1] };
}
function renderTrends() {
  const sel = $('#trendSelect');
  if (!sel.options.length) sel.innerHTML = TREND_ITEMS.map(t => `<option value="${t.key}">${t.label}</option>`).join('');
  sel.value = state.trendKey;
  const it = TREND_ITEMS.find(t => t.key === state.trendKey), s = DATA[it.key], f = forecast(it);
  const histN = Math.min(s.values.length, it.key === 'pib' ? 20 : 36), hist = s.values.slice(-histN), hl = s.labels.slice(-histN);
  const fl = nextLabels(hl[hl.length - 1], f.n12), labels = hl.concat(fl);
  const pad_ = n => Array(n).fill(null);
  const maS = sma(s.values, it.maShort).slice(-histN), maL = sma(s.values, it.maLong).slice(-histN);
  // linha de regressão: ajustada na janela N e prolongada até o horizonte de 12 meses
  const startReg = histN - f.y.length;
  const regLine = pad_(startReg).concat(f.y.map((_, i) => f.reg.intercept + f.reg.slope * i), Array.from({ length: f.n12 }, (_, k) => Math.max(f.at(k + 1), it.key === 'usd' ? .5 : 0)));
  const proj = pad_(histN - 1).concat([hist[hist.length - 1]], Array.from({ length: f.n12 }, (_, k) => f.at(k + 1)));
  const up = proj.map((v, i) => v == null ? null : v + (i < histN ? 0 : f.reg.sd)), dn = proj.map((v, i) => v == null ? null : v - (i < histN ? 0 : f.reg.sd));
  mk('trend-chart', { type: 'line', data: { labels: labels.map(pretty), datasets: [
    { label: 'Banda ±1 desvio', data: up, borderColor: 'transparent', backgroundColor: COLORS.blue + '22', pointRadius: 0, fill: '+1' },
    { label: 'Banda inferior', data: dn, borderColor: 'transparent', pointRadius: 0, fill: false },
    { label: 'Observado', data: hist.concat(pad_(f.n12)), borderColor: COLORS.blue, borderWidth: 2.5, pointRadius: 0, tension: .25 },
    { label: `Média móvel ${it.maShort}`, data: maS.concat(pad_(f.n12)), borderColor: COLORS.green, borderWidth: 1.5, pointRadius: 0, tension: .25 },
    { label: `Média móvel ${it.maLong}`, data: maL.concat(pad_(f.n12)), borderColor: COLORS.amber, borderWidth: 1.5, pointRadius: 0, tension: .25 },
    { label: 'Tendência (regressão)', data: regLine, borderColor: COLORS.violet, borderWidth: 1.5, borderDash: [3, 3], pointRadius: 0 },
    { label: 'Projeção', data: proj, borderColor: COLORS.red, borderWidth: 2.5, borderDash: [7, 5], pointRadius: 0, tension: 0 }] },
    options: baseOpts(it.unit, { plugins: { legend: { labels: { usePointStyle: true, boxWidth: 8, filter: l => l.text !== 'Banda inferior' } }, tooltip: { callbacks: { label: c => c.parsed.y == null ? null : ` ${c.dataset.label}: ${fmt(c.parsed.y)}${it.unit}` } }, zoom: { zoom: { wheel: { enabled: true }, drag: { enabled: true }, mode: 'x' }, pan: { enabled: true, mode: 'x', modifierKey: 'shift' } } } }) });
  const tag = d => `<span class="tag ${d}">${{ up: 'Alta', down: 'Queda', flat: 'Estável' }[d]}</span>`;
  $('#trendTable').innerHTML = `<thead><tr><th>Indicador</th><th>Atual</th><th>Média móvel (longa)</th><th>Projeção 6 meses</th><th>Projeção 12 meses</th><th>Tendência</th></tr></thead><tbody>${TREND_ITEMS.map(t => {
    const x = forecast(t); const u = t.unit; return `<tr><td>${t.label}</td><td>${fmt(x.cur)}${u}</td><td>${fmt(x.maNow)}${u}</td><td><b>${fmt(x.p6)}${u}</b></td><td><b>${fmt(x.p12)}${u}</b></td><td>${tag(x.dir)}</td></tr>`;
  }).join('')}</tbody>`;
}

/* ==========================================================================
   10. MAPA DOS ESTADOS + RANKING (dados ilustrativos: ordens de grandeza do IBGE)
   Campos: pib (R$ bilhões) · pop (milhões) · des (%) · renda (R$/mês) · c,r = posição no cartograma
   ========================================================================== */
const STATES = [
  { uf: 'RR', n: 'Roraima', c: 2, r: 0, pib: 19, pop: .64, des: 7.4, renda: 2900 }, { uf: 'AP', n: 'Amapá', c: 4, r: 0, pib: 20, pop: .73, des: 10.5, renda: 2500 },
  { uf: 'AM', n: 'Amazonas', c: 1, r: 1, pib: 131, pop: 3.94, des: 8.5, renda: 2400 }, { uf: 'PA', n: 'Pará', c: 3, r: 1, pib: 262, pop: 8.12, des: 7.1, renda: 2200 },
  { uf: 'MA', n: 'Maranhão', c: 4, r: 1, pib: 124, pop: 6.78, des: 7.7, renda: 1900 }, { uf: 'PI', n: 'Piauí', c: 5, r: 1, pib: 66, pop: 3.27, des: 8.1, renda: 1900 },
  { uf: 'CE', n: 'Ceará', c: 6, r: 1, pib: 194, pop: 8.79, des: 7.9, renda: 2100 }, { uf: 'RN', n: 'Rio Grande do Norte', c: 7, r: 1, pib: 80, pop: 3.30, des: 8.0, renda: 2300 },
  { uf: 'AC', n: 'Acre', c: 1, r: 2, pib: 18, pop: .83, des: 7.8, renda: 2300 }, { uf: 'RO', n: 'Rondônia', c: 2, r: 2, pib: 62, pop: 1.58, des: 3.5, renda: 2700 },
  { uf: 'MT', n: 'Mato Grosso', c: 3, r: 2, pib: 233, pop: 3.66, des: 3.5, renda: 3100 }, { uf: 'TO', n: 'Tocantins', c: 4, r: 2, pib: 56, pop: 1.51, des: 6.5, renda: 2500 },
  { uf: 'BA', n: 'Bahia', c: 5, r: 2, pib: 352, pop: 14.14, des: 10.4, renda: 2200 }, { uf: 'PE', n: 'Pernambuco', c: 6, r: 2, pib: 224, pop: 9.06, des: 9.5, renda: 2200 },
  { uf: 'PB', n: 'Paraíba', c: 7, r: 2, pib: 77, pop: 3.97, des: 7.6, renda: 2100 },
  { uf: 'MS', n: 'Mato Grosso do Sul', c: 2, r: 3, pib: 142, pop: 2.76, des: 3.9, renda: 3000 }, { uf: 'GO', n: 'Goiás', c: 3, r: 3, pib: 323, pop: 7.06, des: 5.4, renda: 2900 },
  { uf: 'DF', n: 'Distrito Federal', c: 4, r: 3, pib: 304, pop: 2.82, des: 8.5, renda: 5200 }, { uf: 'MG', n: 'Minas Gerais', c: 5, r: 3, pib: 857, pop: 20.54, des: 5.3, renda: 2900 },
  { uf: 'SE', n: 'Sergipe', c: 6, r: 3, pib: 55, pop: 2.21, des: 8.2, renda: 2200 }, { uf: 'AL', n: 'Alagoas', c: 7, r: 3, pib: 66, pop: 3.13, des: 8.4, renda: 1900 },
  { uf: 'SP', n: 'São Paulo', c: 3, r: 4, pib: 2719, pop: 44.41, des: 6.6, renda: 3700 }, { uf: 'RJ', n: 'Rio de Janeiro', c: 4, r: 4, pib: 1050, pop: 16.06, des: 9.0, renda: 3400 },
  { uf: 'ES', n: 'Espírito Santo', c: 5, r: 4, pib: 200, pop: 3.83, des: 4.3, renda: 3000 },
  { uf: 'PR', n: 'Paraná', c: 3, r: 5, pib: 549, pop: 11.44, des: 4.3, renda: 3200 }, { uf: 'SC', n: 'Santa Catarina', c: 4, r: 5, pib: 450, pop: 7.61, des: 2.9, renda: 3500 },
  { uf: 'RS', n: 'Rio Grande do Sul', c: 3, r: 6, pib: 581, pop: 10.88, des: 5.0, renda: 3300 }
];
const MAP_METRICS = {
  pib: { label: 'PIB estadual', unit: 'R$ bi', fmt: v => 'R$ ' + fmt(v, 0) + ' bi', dig: 0 },
  pop: { label: 'População', unit: 'mi', fmt: v => fmt(v, 2) + ' mi', dig: 2 },
  des: { label: 'Desemprego', unit: '%', fmt: v => fmt(v, 1) + '%', dig: 1 },
  renda: { label: 'Renda média', unit: 'R$', fmt: v => 'R$ ' + fmt(v, 0), dig: 0 }
};
function renderMap() {
  const m = state.mapMetric, vals = STATES.map(s => s[m]), mn = Math.min(...vals), mx = Math.max(...vals);
  $('#mapMetric').value = m;
  $('#tilemap').innerHTML = STATES.map(s => {
    const t = (s[m] - mn) / (mx - mn || 1), a = .22 + .73 * Math.pow(t, .6);
    return `<button class="tile ${s.uf === state.uf ? 'sel' : ''}" data-uf="${s.uf}" style="--c:${s.c};--r:${s.r};background:rgba(37,99,235,${a.toFixed(2)})" title="${s.n}: ${MAP_METRICS[m].fmt(s[m])}">${s.uf}</button>`;
  }).join('');
  renderStateDetail();
}
function rankOf(uf, k, asc = false) { const sorted = [...STATES].sort((a, b) => asc ? a[k] - b[k] : b[k] - a[k]); return sorted.findIndex(s => s.uf === uf) + 1; }
function renderStateDetail() {
  const s = STATES.find(x => x.uf === state.uf), tot = STATES.reduce((a, b) => a + b.pib, 0);
  $('#stateDetail').innerHTML = `
    <div class="state-title"><h2>${s.n}</h2><span class="muted">${s.uf}</span></div>
    <div class="stat-grid">
      <div class="stat"><small>PIB estadual</small><b>${MAP_METRICS.pib.fmt(s.pib)}</b><br><em>${rankOf(s.uf, 'pib')}º do país · ${fmt(s.pib / tot * 100, 1)}% do total*</em></div>
      <div class="stat"><small>População</small><b>${MAP_METRICS.pop.fmt(s.pop)}</b><br><em>${rankOf(s.uf, 'pop')}º do país</em></div>
      <div class="stat"><small>Desemprego</small><b>${MAP_METRICS.des.fmt(s.des)}</b><br><em>${rankOf(s.uf, 'des', true)}º menor taxa</em></div>
      <div class="stat"><small>Renda média mensal</small><b>${MAP_METRICS.renda.fmt(s.renda)}</b><br><em>${rankOf(s.uf, 'renda')}ª maior renda</em></div>
    </div>
    <p class="note">PIB per capita aproximado: R$ ${fmt(s.pib / s.pop, 1)} mil por habitante/ano. *Participação sobre a soma dos 27 estados. Dados ilustrativos.</p>`;
}

/* ==========================================================================
   11. RANKINGS, SETORES, CRISES, GOVERNOS, COMPARADOR INTERNACIONAL
   ========================================================================== */
function renderRank() {
  const k = $('#rankMetric').value, asc = k === 'des', list = [...STATES].sort((a, b) => asc ? a[k] - b[k] : b[k] - a[k]);
  const mx = Math.max(...STATES.map(s => s[k]));
  $('#rankList').innerHTML = list.map((s, i) => `<div class="rank-row"><span class="muted">${i + 1}</span><span>${s.n}</span><div class="bar"><i style="width:${s[k] / mx * 100}%"></i></div><b>${MAP_METRICS[k].fmt(s[k])}</b></div>`).join('');
}

const SECTORS = [['Administração pública, educação e saúde', 17.5], ['Outros serviços', 17.3], ['Comércio', 12.5], ['Indústria de transformação', 11.0], ['Atividades imobiliárias', 9.0], ['Agropecuária', 6.8], ['Intermediação financeira e seguros', 5.5], ['Transporte e armazenagem', 4.9], ['Informação e comunicação', 4.3], ['Construção', 4.2], ['Indústrias extrativas', 4.0], ['Eletricidade, gás e água', 3.0]];
function renderSectors() {
  mk('sector-chart', { type: 'bar', data: { labels: SECTORS.map(s => s[0]), datasets: [{ label: 'Participação (%)', data: SECTORS.map(s => s[1]), backgroundColor: SECTORS.map((_, i) => `rgba(37,99,235,${1 - i * .055})`), borderRadius: 6 }] },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${fmt(c.parsed.x, 1)}% do valor adicionado` } } }, scales: { x: { grid: { color: css('--grid') }, ticks: { callback: v => v + '%' } }, y: { grid: { display: false } } } } });
}

const CRISES = [
  ['1983', 'Crise da dívida externa', 'Moratória, forte desvalorização cambial e inflação em alta: a chamada “década perdida”.'],
  ['1986–1991', 'Planos heterodoxos e hiperinflação', 'Cruzado, Bresser, Verão e Collor: congelamentos de preços e confisco de ativos, sem estabilização duradoura.'],
  ['1994', 'Plano Real', 'Estabilização monetária com a URV e ancoragem cambial; fim da hiperinflação.'],
  ['1999', 'Desvalorização do real', 'Fim da âncora cambial, adoção do câmbio flutuante e do regime de metas de inflação.'],
  ['2002', 'Crise de confiança', 'Incerteza eleitoral: o dólar superou R$ 3,90 e o risco-país disparou.'],
  ['2008–2009', 'Crise financeira global', 'Choque externo e queda do crédito; o PIB recuou cerca de 0,1% em 2009, com recuperação rápida em 2010.'],
  ['2014–2016', 'Recessão', 'Queda acentuada do PIB, inflação de dois dígitos em 2015 (10,7%) e desemprego acima de 12%.'],
  ['2020', 'Pandemia de COVID-19', 'PIB de −3,3%, auxílio emergencial e Selic na mínima histórica de 2% a.a.'],
  ['2021–2022', 'Inflação pós-pandemia e aperto monetário', 'IPCA de 10,06% em 2021; a Selic subiu de 2% para 13,75% a.a.']
];
function renderTimeline() { $('#timeline').innerHTML = CRISES.map(c => `<li><span class="yr">${c[0]}</span><b>${c[1]}</b><p>${c[2]}</p></li>`).join(''); }

const GOVS = [ // médias aproximadas por período — apenas descritivo/educacional
  { n: 'FHC (1995–2002)', pib: 2.3, ipca: 9.2, selic: 22 }, { n: 'Lula I–II (2003–2010)', pib: 4.1, ipca: 5.8, selic: 14.5 },
  { n: 'Dilma (2011–2016)', pib: 0.4, ipca: 6.9, selic: 11.2 }, { n: 'Temer (2017–2018)', pib: 1.6, ipca: 3.4, selic: 8.5 },
  { n: 'Bolsonaro (2019–2022)', pib: 1.4, ipca: 6.2, selic: 6.5 }, { n: 'Lula III (2023–2025)', pib: 3.0, ipca: 4.5, selic: 12.8 }
];
function renderGov() {
  const k = $('#govMetric').value, lbl = { pib: 'PIB médio (% a.a.)', ipca: 'IPCA médio (% a.a.)', selic: 'Selic média (% a.a.)' }[k];
  mk('gov-chart', { type: 'bar', data: { labels: GOVS.map(g => g.n), datasets: [{ label: lbl, data: GOVS.map(g => g[k]), backgroundColor: GOVS.map(g => g[k] >= 0 ? COLORS.blue + 'CC' : COLORS.red + 'CC'), borderRadius: 6 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${fmt(c.parsed.y, 1)}% a.a.` } } }, scales: { x: { grid: { display: false } }, y: { grid: { color: css('--grid') }, ticks: { callback: v => v + '%' } } } } });
  $('#govTable').innerHTML = `<thead><tr><th>Período</th><th>PIB médio</th><th>IPCA médio</th><th>Selic média</th></tr></thead><tbody>${GOVS.map(g => `<tr><td>${g.n}</td><td>${fmt(g.pib, 1)}%</td><td>${fmt(g.ipca, 1)}%</td><td>${fmt(g.selic, 1)}%</td></tr>`).join('')}</tbody>`;
}

const INTL = { // estimativas aproximadas (ordem de grandeza recente); o Banco Mundial sobrescreve quando disponível
  'Brasil':   { gdp: 2.2, growth: 3.4, infl: 4.4, unemp: 6.6, debt: 76 },
  'EUA':      { gdp: 29.2, growth: 2.8, infl: 2.9, unemp: 4.0, debt: 121 },
  'China':    { gdp: 18.7, growth: 5.0, infl: 0.2, unemp: 5.1, debt: 90 },
  'Alemanha': { gdp: 4.7, growth: -0.2, infl: 2.5, unemp: 3.4, debt: 63 },
  'Índia':    { gdp: 3.9, growth: 6.5, infl: 4.9, unemp: 4.2, debt: 82 }
};
const INTL_LBL = { growth: ['Crescimento do PIB', '%'], infl: ['Inflação', '%'], unemp: ['Desemprego', '%'], debt: ['Dívida pública/PIB', '%'], gdp: ['PIB nominal', ' tri US$'] };
function renderIntl() {
  const data = state.intl || INTL, k = $('#intlMetric').value, names = Object.keys(data);
  const cols = [COLORS.green, COLORS.blue, COLORS.red, COLORS.amber, COLORS.violet];
  mk('intl-chart', { type: 'bar', data: { labels: names, datasets: [{ label: INTL_LBL[k][0], data: names.map(n => data[n][k]), backgroundColor: cols.map(c => c + 'CC'), borderRadius: 8 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${fmt(c.parsed.y, 1)}${INTL_LBL[k][1]}` } } }, scales: { x: { grid: { display: false } }, y: { grid: { color: css('--grid') } } } } });
  $('#intlTable').innerHTML = `<thead><tr><th>País</th><th>PIB (US$ tri)</th><th>Cresc. PIB</th><th>Inflação</th><th>Desemprego</th><th>Dívida/PIB</th></tr></thead><tbody>${names.map(n => { const d = data[n]; return `<tr><td>${n}</td><td>${fmt(d.gdp, 1)}</td><td>${fmt(d.growth, 1)}%</td><td>${fmt(d.infl, 1)}%</td><td>${fmt(d.unemp, 1)}%</td><td>${fmt(d.debt, 0)}%</td></tr>`; }).join('')}</tbody>`;
  $('#intlNote').textContent = `Fonte: ${state.intlSource}. Conceitos de dívida e desemprego variam entre países; use para comparação de ordem de grandeza.`;
}

/* ==========================================================================
   12. EXPORTAÇÃO — CSV, PNG e PDF
   ========================================================================== */
function renderExportOptions() {
  const keys = [...Object.keys(SOURCES), 'ipca12'];
  $('#csvSelect').innerHTML = `<option value="__all">Todas as séries</option>` + keys.map(k => `<option value="${k}">${metaOf(k).label}</option>`).join('');
  const names = { 'ch-ipca': 'Inflação (IPCA)', 'ch-selic': 'Juros (Selic)', 'ch-usd': 'Câmbio (Dólar)', 'ch-des': 'Desemprego', 'ch-pib': 'PIB', 'trend-chart': 'Tendências', 'lab-inf': 'Laboratório — inflação', 'lab-des': 'Laboratório — desemprego', 'lab-pib': 'Laboratório — crescimento', 'lab-div': 'Laboratório — dívida', 'sector-chart': 'Setores', 'gov-chart': 'Governos', 'intl-chart': 'Comparador internacional' };
  $('#pngSelect').innerHTML = Object.entries(names).map(([id, n]) => `<option value="${id}">${n}</option>`).join('');
}
function exportCSV() {
  const v = $('#csvSelect').value, keys = v === '__all' ? [...Object.keys(SOURCES), 'ipca12'] : [v];
  const rows = ['indicador;periodo;valor;fonte'];
  keys.forEach(k => DATA[k].labels.forEach((l, i) => rows.push([metaOf(k).label, l, String(DATA[k].values[i]).replace('.', ','), DATA[k].source === 'api' ? metaOf(k).origem : 'simulado'].join(';'))));
  const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  download(URL.createObjectURL(blob), `brasil-analytics-${v === '__all' ? 'series' : v}.csv`);
}
function exportPNG(id) {
  const c = charts[id]; if (!c) return alert('Abra a seção do gráfico ao menos uma vez antes de exportar.');
  const off = document.createElement('canvas'); off.width = c.canvas.width; off.height = c.canvas.height;
  const x = off.getContext('2d'); x.fillStyle = css('--bg-solid'); x.fillRect(0, 0, off.width, off.height); x.drawImage(c.canvas, 0, 0);
  download(off.toDataURL('image/png'), `brasil-analytics-${id}.png`);
}
/** PDF = impressão do navegador ("Salvar como PDF"). Usa tema claro e exibe todas as seções. */
function exportPDF() {
  const prev = state.theme; document.body.classList.add('printing-all');
  $$('.view').forEach(v => v.style.display = 'block'); $$('.subview').forEach(v => v.style.display = 'block');
  applyTheme('light', false); renderAll();
  setTimeout(() => {
    window.print();
    $$('.view').forEach(v => v.style.display = ''); $$('.subview').forEach(v => v.style.display = '');
    document.body.classList.remove('printing-all'); applyTheme(prev, false); renderAll(); route();
  }, 700);
}

/* ==========================================================================
   13. NAVEGAÇÃO, TEMA E INICIALIZAÇÃO
   ========================================================================== */
const VIEWS = {
  painel: ['Painel', 'Indicadores macroeconômicos do Brasil'],
  graficos: ['Gráficos', 'Séries históricas interativas — zoom, período e exportação'],
  assistente: ['Assistente Econômico', 'Análises automáticas em linguagem natural'],
  laboratorio: ['Laboratório Econômico', 'Simule cenários de política econômica'],
  tendencias: ['Tendências', 'Médias móveis e regressão linear: projeções para 6 e 12 meses'],
  mapa: ['Mapa do Brasil', 'Indicadores por estado'],
  comparacoes: ['Rankings e Comparações', 'Estados, setores, crises, governos e países'],
  exportar: ['Exportar', 'CSV, PNG e PDF'],
  sobre: ['Sobre', 'O projeto']
};
function route() {
  const id = (location.hash || '#painel').slice(1); state.view = VIEWS[id] ? id : 'painel';
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + state.view));
  $$('#nav button').forEach(b => b.classList.toggle('active', b.dataset.view === state.view));
  $('#viewTitle').textContent = VIEWS[state.view][0]; $('#viewSub').textContent = VIEWS[state.view][1];
  closeMenu(); window.scrollTo({ top: 0 });
  requestAnimationFrame(() => Object.values(charts).forEach(c => c.resize())); // gráficos criados em abas ocultas
}
const closeMenu = () => { $('#sidebar').classList.remove('open'); $('#scrim').classList.remove('show'); };

function applyTheme(t, persist = true) {
  state.theme = t; document.documentElement.setAttribute('data-theme', t);
  if (persist) { try { localStorage.setItem('ba-theme', t); } catch (e) { /* storage indisponível */ } }
  $('#themeBtn').innerHTML = icon(t === 'dark' ? 'sun' : 'moon'); setChartDefaults();
}

function renderAll() {
  renderCards(); renderThermo(); renderSources(); renderMainCharts();
  renderLabControls(); renderLab(); renderTrends(); renderMap(); renderRank();
  renderSectors(); renderTimeline(); renderGov(); renderIntl(); renderExportOptions();
}

async function refreshData() {
  const btn = $('#refreshBtn'); btn.disabled = true; $('#liveStatus').textContent = 'Atualizando…';
  await loadAll();
  renderAll(); hydrateIcons();
  btn.disabled = false;
  loadWorldBank().then(renderIntl).catch(() => {});   // não bloqueia a tela principal
}

function bindUI() {
  $('#nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) location.hash = b.dataset.view; });
  window.addEventListener('hashchange', route);
  $('#menuBtn').onclick = () => { $('#sidebar').classList.add('open'); $('#scrim').classList.add('show'); };
  $('#scrim').onclick = closeMenu;
  $('#themeBtn').onclick = () => { applyTheme(state.theme === 'dark' ? 'light' : 'dark'); renderAll(); };
  $('#refreshBtn').onclick = refreshData;
  $('#chatChips').addEventListener('click', e => { const b = e.target.closest('[data-topic]'); if (b) askAssistant(b.dataset.topic, b.textContent); });

  // Gráficos principais: período, reset de zoom e PNG (delegação de eventos)
  document.body.addEventListener('click', e => {
    const r = e.target.closest('[data-range]');
    if (r) { const art = r.closest('[data-chart]'), id = art.dataset.chart; state.range[id] = +r.dataset.range; $$('[data-range]', art).forEach(b => b.classList.toggle('active', b === r)); mk(id, MAIN[id].make(state.range[id])); }
    const z = e.target.closest('[data-reset]'); if (z && charts[z.dataset.reset]) charts[z.dataset.reset].resetZoom();
    const p = e.target.closest('[data-png]'); if (p) exportPNG(p.dataset.png);
  });
  $('#chartsGrid').addEventListener('dblclick', e => { const a = e.target.closest('[data-chart]'); if (a) charts[a.dataset.chart].resetZoom(); });

  // Laboratório
  $('#labControls').addEventListener('input', e => {
    const k = e.target.dataset.k; if (!k) return;
    LAB.inputs[k] = +e.target.value; const f = LAB_FIELDS.find(x => x.k === k);
    $('#out-' + k).textContent = `${fmt(LAB.inputs[k], 2)} ${f.unit}`; renderLab();
  });
  $$('[data-preset]').forEach(b => b.onclick = () => { LAB.inputs = PRESETS[b.dataset.preset](labBase()); renderLabControls(); renderLab(); });

  // Tendências, mapa, comparações
  $('#trendSelect').onchange = e => { state.trendKey = e.target.value; renderTrends(); };
  $('#mapMetric').onchange = e => { state.mapMetric = e.target.value; renderMap(); };
  $('#tilemap').addEventListener('click', e => { const t = e.target.closest('[data-uf]'); if (t) { state.uf = t.dataset.uf; renderMap(); } });
  $('#rankMetric').onchange = renderRank; $('#govMetric').onchange = renderGov; $('#intlMetric').onchange = renderIntl;
  $('#cmpTabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    $$('#cmpTabs button').forEach(x => x.classList.toggle('active', x === b));
    $$('#view-comparacoes .subview').forEach(s => s.classList.toggle('active', s.id === 'tab-' + b.dataset.tab));
    requestAnimationFrame(() => Object.values(charts).forEach(c => c.resize()));
  });

  // Exportação
  $('#csvBtn').onclick = exportCSV; $('#pngBtn').onclick = () => exportPNG($('#pngSelect').value); $('#pdfBtn').onclick = exportPDF;
}

async function init() {
  if (typeof Chart === 'undefined') {
    document.body.insertAdjacentHTML('afterbegin', '<div class="banner">Não foi possível carregar o Chart.js (CDN). Verifique sua conexão com a internet e recarregue a página.</div>');
    return;
  }
  let t = 'dark';
  try { t = localStorage.getItem('ba-theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'); } catch (e) { /* ignora */ }
  applyTheme(t);
  hydrateIcons(); buildChartPanels(); buildAssistant(); bindUI();
  $('#cards').innerHTML = Array.from({ length: 8 }, () => '<div class="skeleton"></div>').join('');
  await refreshData();
  hydrateIcons(); route();
  setInterval(refreshData, CFG.REFRESH_MS);                       // atualização automática
  window.addEventListener('online', refreshData);                 // e ao reconectar
}
document.addEventListener('DOMContentLoaded', init);

})();
