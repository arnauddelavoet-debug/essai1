import { state, decodeParams, encodeParams } from '../state.js';
import { CATALOG } from '../data/catalog.js';
import { VEHICLES, VEHICLE_ORDER } from '../data/vehicles.js';
import { FISCAL } from '../config/fiscal.js';
import { VERSION } from '../version.js';
import { buildPlan } from '../engine/assumptions.js';
import { runSimulation } from '../engine/simulation.js';
import { randomSeed } from '../engine/rng.js';
import { loadMarketData } from '../market/client.js';
import { el, fill, $, $$, toast, showLoading, hideLoading, setProgress, initTooltips } from './dom.js';
import { fmtDate } from './format.js';
import { buildStep1, writeStep1, readStep1, applyRiskProfile, resetAll, renderMarketStatus } from './step1.js';
import { buildStep2, refreshStep2, validateAllocation } from './step2.js';
import { renderResults, renderAllCharts, nominalTarget } from './results.js';
import { resizeCharts, chartImage, chartsAvailable } from './charts.js';
import { downloadCsv, shareUrl } from './export.js';

let currentStep = 1;

// ────────────────────────────────────────────────────────────────
// NAVIGATION
// ────────────────────────────────────────────────────────────────
/** Les résultats affichés correspondent-ils encore aux paramètres courants ? */
function resultsUpToDate() {
  return !!state.simResults && state.lastRun?.key === encodeParams({ ...state, seed: null });
}

function goToStep(n) {
  if (n >= 2 && currentStep === 1 && !readStep1()) return;
  if (n === 3 && !resultsUpToDate()) {
    if (state.simResults) toast('Paramètres modifiés depuis la dernière simulation : relancez-la.', 'info');
    if (currentStep !== 2) goToStep(2);
    return;
  }
  currentStep = n;
  for (let i = 1; i <= 3; i++) {
    const panel = $(`#step-${i}`);
    panel.hidden = i !== n;
    panel.classList.toggle('active', i === n);
  }
  $$('.step').forEach(btn => {
    const sn = Number(btn.dataset.step);
    btn.classList.toggle('active', sn === n);
    btn.classList.toggle('done', sn < n);
    if (sn === n) btn.setAttribute('aria-current', 'step'); else btn.removeAttribute('aria-current');
  });
  $$('.step-line').forEach((l, i) => l.classList.toggle('done', i < n - 1));
  $('.step[data-step="3"]').disabled = !resultsUpToDate();
  if (n === 2) refreshStep2();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  $(`#step-${n} h2`)?.focus?.({ preventScroll: true });
}

function activateTab(name) {
  $$('.tab-btn').forEach(btn => {
    const active = btn.dataset.tab === name;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
    btn.tabIndex = active ? 0 : -1;
  });
  $$('.tab-panel').forEach(p => {
    const show = p.id === `tab-${name}`;
    p.hidden = !show;
    p.classList.toggle('active', show);
  });
  if (name === 'charts') requestAnimationFrame(resizeCharts);
}

// ────────────────────────────────────────────────────────────────
// SIMULATION (Web Worker, repli sur le fil principal)
// ────────────────────────────────────────────────────────────────
let worker = null;
let workerBroken = false;
let runId = 0;

function simulateInWorker(params) {
  if (workerBroken || typeof Worker === 'undefined') return null;
  try {
    worker ||= new Worker(new URL('../worker.js', import.meta.url), { type: 'module' });
  } catch {
    workerBroken = true;
    return null;
  }
  const id = ++runId;
  return new Promise((resolve, reject) => {
    const onMessage = e => {
      if (e.data.id !== id) return;
      if (e.data.type === 'progress') setProgress(e.data.fraction);
      else {
        cleanup();
        if (e.data.type === 'result') resolve(e.data.result); else reject(new Error(e.data.message));
      }
    };
    const onError = e => {
      e.preventDefault?.();
      cleanup();
      workerBroken = true;
      worker = null;
      reject(Object.assign(new Error('worker indisponible'), { workerFailure: true }));
    };
    const cleanup = () => { worker?.removeEventListener('message', onMessage); worker?.removeEventListener('error', onError); };
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage({ id, params });
  });
}

async function simulateOnMainThread(params) {
  await new Promise(r => setTimeout(r, 30)); // laisse l'overlay s'afficher
  return runSimulation(params);
}

async function runAndRender({ newSeed = false } = {}) {
  if (!validateAllocation()) { toast('L\'allocation doit totaliser 100 %.', 'error'); return; }
  const plan = buildPlan(state, CATALOG, state.market);
  const seed = !newSeed && Number.isInteger(state.seed) ? state.seed : randomSeed();
  const params = {
    capital: state.capital, horizon: state.horizon, monthly: state.monthly, contributionGrowth: state.contributionGrowth,
    lines: plan.lines, correlation: plan.correlation,
    tax: { tmi: state.tmi, tmiRetraite: state.tmiRetraite, couple: state.couple, peaAnciennete: state.peaAnciennete, avAnciennete: state.avAnciennete, bareme: state.bareme, perCap: state.perCap },
    inflation: state.inflation, target: nominalTarget(state), nSims: state.nSims, seed,
    distribution: state.distribution, df: state.df, rebalancing: state.rebalancing,
  };

  showLoading(`Simulation de ${state.nSims.toLocaleString('fr-FR')} scénarios…`);
  try {
    let result;
    try {
      result = await (simulateInWorker(params) || simulateOnMainThread(params));
    } catch (err) {
      if (!err.workerFailure) throw err;
      result = await simulateOnMainThread(params);
    }
    state.plan = plan;
    state.simResults = result;
    state.lastRun = { at: new Date().toISOString(), seed, key: encodeParams({ ...state, seed: null }) };
    goToStep(3);
    activateTab('kpi');
    await new Promise(r => requestAnimationFrame(r));
    renderResults();
    if (!chartsAvailable()) toast('Graphiques indisponibles (bibliothèque non chargée) : les résultats chiffrés restent valides.', 'error', 7000);
  } catch (err) {
    console.error('Erreur de simulation :', err);
    toast(`Simulation impossible : ${err.message}`, 'error', 8000);
  } finally {
    hideLoading();
  }
}

// ────────────────────────────────────────────────────────────────
// EXPORTS
// ────────────────────────────────────────────────────────────────
/** Redessine les graphiques en thème clair le temps de les capturer pour le PDF. */
async function captureChartsLight() {
  const root = document.documentElement;
  const previous = root.getAttribute('data-theme');
  const chartsPanel = $('#tab-charts');
  const wasHidden = chartsPanel.hidden;
  root.setAttribute('data-theme', 'light');
  chartsPanel.hidden = false;
  renderAllCharts();
  await new Promise(r => setTimeout(r, 450)); // fin des animations
  const images = { fan: chartImage('fan'), dist: chartImage('dist'), donut: chartImage('donut') };
  if (previous) root.setAttribute('data-theme', previous); else root.removeAttribute('data-theme');
  chartsPanel.hidden = wasHidden;
  renderAllCharts();
  return images;
}

async function exportPdf() {
  if (!state.simResults) return;
  showLoading('Génération du rapport PDF…');
  try {
    const { generatePDF } = await import('./pdf.js');
    await generatePDF(captureChartsLight);
    toast('Rapport PDF téléchargé.', 'success');
  } catch (err) {
    console.error('Erreur PDF :', err);
    toast('Génération du PDF impossible (bibliothèque non chargée ?). Vérifiez votre connexion et réessayez.', 'error', 8000);
  } finally {
    hideLoading();
  }
}

async function share() {
  const url = shareUrl(state, state.simResults.meta.seed);
  try {
    await navigator.clipboard.writeText(url);
    toast('Lien copié : il reproduit exactement cette simulation (paramètres et graine).', 'success');
  } catch {
    window.prompt('Copiez ce lien :', url);
  }
}

// ────────────────────────────────────────────────────────────────
// DONNÉES DE MARCHÉ, THÈME, GUIDE
// ────────────────────────────────────────────────────────────────
async function initMarket() {
  const badge = $('#market-badge');
  const { data, source, label } = await loadMarketData();
  state.market = data;
  state.marketSource = source;
  state.marketSourceLabel = label;
  badge.dataset.state = source;
  badge.textContent = source === 'live' ? `Marché : en direct · ${fmtDate(data.generatedAt)}`
    : source === 'snapshot' ? `Marché : instantané du ${fmtDate(data.generatedAt)}`
      : 'Marché : hors ligne';
  badge.dataset.tip = label;
  renderMarketStatus();
  if (currentStep === 2) refreshStep2();
}

function initTheme() {
  const root = document.documentElement;
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') root.setAttribute('data-theme', saved);
  } catch { /* stockage indisponible */ }
  $('#btn-theme').addEventListener('click', () => {
    const dark = root.getAttribute('data-theme') === 'dark'
      || (!root.hasAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const next = dark ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch { /* stockage indisponible */ }
    renderAllCharts();
  });
}

function initGuide() {
  const dialog = $('#guide-dialog');
  const table = $('#guide-vehicles');
  if (table) {
    fill(table, ...VEHICLE_ORDER.map(v => el('tr', {},
      el('th', { scope: 'row' }, el('span', { className: `badge ${VEHICLES[v].cssClass}` }, VEHICLES[v].short), ' ', VEHICLES[v].label),
      el('td', {}, VEHICLES[v].summary))));
  }
  $('#btn-guide').addEventListener('click', () => dialog.showModal());
  $('#guide-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
}

function initTabs() {
  const tabs = $$('.tab-btn');
  tabs.forEach((btn, i) => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    btn.addEventListener('keydown', e => {
      const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!delta) return;
      const next = tabs[(i + delta + tabs.length) % tabs.length];
      next.focus();
      activateTab(next.dataset.tab);
    });
  });
}

/** Paramètres transmis par un lien partagé (#p=…&run=1). */
function applySharedLink() {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const p = hash.get('p');
  if (!p) return false;
  const params = decodeParams(p);
  if (!Object.keys(params).length) { toast('Lien de partage invalide : paramètres par défaut.', 'error'); return false; }
  Object.assign(state, params);
  if (params.allocations) state.allocationCustomized = true;
  writeStep1();
  history.replaceState(null, '', window.location.pathname + window.location.search);
  toast('Paramètres chargés depuis le lien partagé.', 'success');
  return hash.get('run') === '1';
}

// ────────────────────────────────────────────────────────────────
// INITIALISATION
// ────────────────────────────────────────────────────────────────
export async function initApp() {
  $('#app-version').textContent = `v${VERSION}`;
  $('#footer-version').textContent = `v${VERSION}`;
  $('#footer-fiscal').textContent = String(FISCAL.millesime);

  initTheme();
  initTooltips();
  initGuide();
  initTabs();

  buildStep1({
    onRiskChange: key => applyRiskProfile(key),
    onModeChange: mode => { state.assumptionMode = mode; },
  });
  buildStep2();
  writeStep1();

  $$('.step').forEach(btn => btn.addEventListener('click', () => goToStep(Number(btn.dataset.step))));
  $('#btn-step1-next').addEventListener('click', () => goToStep(2));
  $('#btn-step2-back').addEventListener('click', () => goToStep(1));
  $('#btn-step3-back').addEventListener('click', () => goToStep(2));
  $('#simulate-btn').addEventListener('click', () => runAndRender());
  $('#btn-rerun').addEventListener('click', () => runAndRender({ newSeed: true }));
  $('#btn-share').addEventListener('click', share);
  $('#btn-csv').addEventListener('click', () => downloadCsv(state, state.simResults));
  $('#btn-pdf').addEventListener('click', exportPdf);
  $('#btn-reset-params').addEventListener('click', () => { if (resetAll()) toast('Paramètres réinitialisés.', 'success'); });
  $('#fan-real').addEventListener('change', renderAllCharts);
  $('#donut-mode').addEventListener('change', renderAllCharts);
  $('#toast').addEventListener('click', () => { $('#toast').hidden = true; });

  const autoRun = applySharedLink();
  await initMarket();
  if (autoRun && readStep1() && validateAllocation()) await runAndRender();
}
