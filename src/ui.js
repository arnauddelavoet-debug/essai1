import { PRODUCTS, SUGGESTIONS, PROFILE_SIGMA_RANGES, CORRELATIONS, EQUITY_IDS } from './products.js';
import { runSimulation, blendedParams } from './simulation.js';
import { fmt, fmtPct } from './format.js';
import { showError, hideError, showLoading, hideLoading } from './errors.js';
import { renderGauge, renderHistogram, renderFanChart, renderDonut, resizeCharts } from './charts.js';
import { state } from './state.js';
import { generatePDF } from './pdf.js';

const INFLATION = 0.022;

// ----------------------------------------------------------------
// ALLOCATION DYNAMIQUE PAR PROFIL (avec exclusion de produits)
// ----------------------------------------------------------------
export function computeEffectiveAlloc() {
  const suggestion = SUGGESTIONS[state.risk].alloc;
  const included = {};
  let total = 0;

  for (const [id, basePct] of Object.entries(suggestion)) {
    if (!state.excludedProducts.has(id)) {
      included[id] = basePct;
      total += basePct;
    }
  }

  if (total === 0) return {};

  const ids = Object.keys(included);
  const result = {};
  let allocated = 0;

  for (let i = 0; i < ids.length - 1; i++) {
    result[ids[i]] = Math.round(included[ids[i]] / total * 100);
    allocated += result[ids[i]];
  }
  result[ids[ids.length - 1]] = 100 - allocated;
  return result;
}

export function toggleProduct(id) {
  if (state.excludedProducts.has(id)) {
    state.excludedProducts.delete(id);
  } else {
    state.excludedProducts.add(id);
  }
  state.allocations = computeEffectiveAlloc();
  updateProductCards();
  updateTotal();
}

function updateProductCards() {
  const suggestion = SUGGESTIONS[state.risk].alloc;
  for (const [id] of Object.entries(suggestion)) {
    const card = document.getElementById(`card-${id}`);
    if (!card) continue;
    const pct = state.allocations[id] || 0;
    const excluded = state.excludedProducts.has(id);

    card.classList.toggle('active', !excluded && pct > 0);
    card.classList.toggle('excluded', excluded);

    const pctEl = card.querySelector('.product-pct-display');
    if (pctEl) pctEl.textContent = excluded ? '0 %' : `${pct} %`;

    const btn = card.querySelector('.toggle-btn');
    if (btn) {
      btn.textContent = excluded ? '+ Inclure' : '× Exclure';
      btn.dataset.state = excluded ? 'excluded' : 'included';
    }
  }
}

// ----------------------------------------------------------------
// NAVIGATION PAR ÉTAPES
// ----------------------------------------------------------------
export function goToStep(n) {
  hideError();

  if (n === 2) {
    if (!readStep1()) return;
    renderProducts();
  }
  if (n === 3) {
    if (!validateAllocations()) return;
  }

  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`step-${n}`).classList.add('active');

  document.querySelectorAll('.step').forEach(s => {
    const sn = parseInt(s.dataset.step, 10);
    s.classList.toggle('active', sn === n);
    s.classList.toggle('done', sn < n);
    s.setAttribute('aria-current', sn === n ? 'step' : 'false');
  });

  document.querySelectorAll('.step-line').forEach((l, i) => {
    l.classList.toggle('done', i < n - 1);
  });

  const panel = document.getElementById(`step-${n}`);
  if (panel) panel.scrollTop = 0;
}

// ----------------------------------------------------------------
// ÉTAPE 1 — LECTURE & VALIDATION
// ----------------------------------------------------------------
function readStep1() {
  const capitalRaw = parseFloat(document.getElementById('capital').value);
  const horizonRaw = parseInt(document.getElementById('horizon').value, 10);
  const mensuelRaw = parseFloat(document.getElementById('mensuel').value);
  const tmiRaw = parseInt(document.getElementById('tmi').value, 10);
  const riskEl = document.querySelector('input[name="risk"]:checked');

  if (!Number.isFinite(capitalRaw) || capitalRaw < 100 || capitalRaw > 1_000_000) {
    showError('Capital invalide — saisissez un montant entre 100 € et 1 000 000 €.');
    document.getElementById('capital').focus();
    return false;
  }
  if (!Number.isInteger(horizonRaw) || horizonRaw < 1 || horizonRaw > 30) {
    showError('Horizon invalide — saisissez une durée entre 1 et 30 ans.');
    document.getElementById('horizon').focus();
    return false;
  }
  if (!Number.isFinite(mensuelRaw) || mensuelRaw < 0 || mensuelRaw > 10_000) {
    showError('Versements invalides — saisissez un montant entre 0 € et 10 000 €/mois.');
    document.getElementById('mensuel').focus();
    return false;
  }
  const VALID_TMI = [0, 11, 30, 41, 45];
  if (!VALID_TMI.includes(tmiRaw)) {
    showError('Tranche marginale d\'imposition invalide.');
    return false;
  }
  const VALID_RISKS = ['conservateur', 'modere', 'dynamique'];
  if (!riskEl || !VALID_RISKS.includes(riskEl.value)) {
    showError('Profil de risque invalide.');
    return false;
  }

  state.capital = capitalRaw;
  state.horizon = horizonRaw;
  state.risk = riskEl.value;
  state.mensuel = mensuelRaw;
  state.tmi = tmiRaw;
  return true;
}

export function linkSlider(sliderId, inputId, min, max) {
  const slider = document.getElementById(sliderId);
  const input = document.getElementById(inputId);
  if (!slider || !input) return;

  slider.addEventListener('input', () => { input.value = slider.value; });
  input.addEventListener('input', () => {
    const clamped = Math.min(Math.max(parseFloat(input.value) || min, min), max);
    slider.value = clamped;
  });
}

// ----------------------------------------------------------------
// ÉTAPE 2 — PRODUITS & ALLOCATION
// ----------------------------------------------------------------
function vehicleClass(v) {
  const map = { PEA: 'vehicle-pea', Livret: 'vehicle-livret', AV: 'vehicle-av' };
  return map[v] || 'vehicle-cto';
}

function renderProducts() {
  const risk = state.risk;
  const grid = document.getElementById('products-grid');
  grid.innerHTML = '';

  state.excludedProducts = new Set();
  state.allocations = computeEffectiveAlloc();

  const suggestion = SUGGESTIONS[risk].alloc;

  PRODUCTS.forEach(p => {
    const inSuggestion = p.id in suggestion;

    const card = document.createElement('div');
    card.id = `card-${p.id}`;
    card.setAttribute('role', 'listitem');

    const muNetDisplay = p.mu - (p.ter || 0);
    const pillReturn = `<span class="stat-pill return">~${(muNetDisplay * 100).toFixed(1)} %/an net</span>`;
    const pillVol = p.sigma > 0 ? `<span class="stat-pill vol">σ ${(p.sigma * 100).toFixed(0)} %</span>` : '';
    const pillGuar = p.guaranteed ? '<span class="stat-pill guaranteed">Garanti</span>' : '';

    if (inSuggestion) {
      const pct = state.allocations[p.id] || 0;
      card.className = 'product-card active';
      card.innerHTML = `
        <div class="product-header">
          <span class="product-icon" aria-hidden="true"></span>
          <div class="product-info">
            <div class="product-name"></div>
            <span class="product-vehicle ${vehicleClass(p.vehicle)}"></span>
          </div>
        </div>
        <div class="product-stats">${pillReturn}${pillVol}${pillGuar}</div>
        <div class="product-pct-row">
          <span class="alloc-label">Alloc.&nbsp;:</span>
          <span class="product-pct-display">${pct} %</span>
          <button type="button" class="toggle-btn" data-state="included" data-id="${p.id}">x Exclure</button>
        </div>
      `;
      card.querySelector('.product-icon').textContent = p.icon;
      card.querySelector('.product-name').textContent = p.name;
      card.querySelector('.product-vehicle').textContent = p.vehicleLabel;
      card.title = p.description;
      card.querySelector('.toggle-btn').addEventListener('click', () => toggleProduct(p.id));
    } else {
      const pillHors = `<span class="stat-pill min-hor">Hors profil ${risk}</span>`;
      card.className = 'product-card dimmed';
      card.innerHTML = `
        <div class="product-header">
          <span class="product-icon" aria-hidden="true"></span>
          <div class="product-info">
            <div class="product-name"></div>
            <span class="product-vehicle ${vehicleClass(p.vehicle)}"></span>
          </div>
        </div>
        <div class="product-stats">${pillReturn}${pillVol}${pillGuar}${pillHors}</div>
      `;
      card.querySelector('.product-icon').textContent = p.icon;
      card.querySelector('.product-name').textContent = p.name;
      card.querySelector('.product-vehicle').textContent = p.vehicleLabel;
      card.title = p.description;
    }

    grid.appendChild(card);
  });

  updateSuggestion();
  updateTotal();
}

function updateTotal() {
  const total = Object.values(state.allocations).reduce((a, b) => a + b, 0);
  const el = document.getElementById('total-pct');
  const rounded = Math.round(total);
  el.textContent = `${rounded} %`;
  el.className = `total-pct ${rounded === 100 ? 'good' : rounded === 0 ? 'over' : 'neutral'}`;
  document.getElementById('simulate-btn').disabled = rounded !== 100;
}

function updateSuggestion() {
  const riskEl = document.querySelector('input[name="risk"]:checked');
  if (!riskEl) return;
  const s = SUGGESTIONS[riskEl.value];
  const bar = document.getElementById('allocation-suggestions');
  if (!bar || !s) return;

  bar.textContent = '';
  const strong = document.createElement('strong');
  strong.textContent = `${s.label} — allocations verrouillées. `;
  bar.appendChild(strong);
  bar.appendChild(document.createTextNode('Cliquez "× Exclure" pour retirer un support (recalcul automatique).'));
}

function validateAllocations() {
  const total = Object.values(state.allocations).reduce((a, b) => a + b, 0);
  if (Math.round(total) === 0) {
    showError('Aucun support sélectionné — incluez au moins un produit.');
    return false;
  }
  if (Math.round(total) !== 100) {
    showError(`L'allocation doit totaliser 100 % (actuellement ${Math.round(total)} %).`);
    return false;
  }
  return true;
}

function qualitativeWarnings(allocations, risk, horizon, portSigma) {
  const warnings = [];

  const cryptoPct = allocations['crypto-btc'] || 0;
  if (cryptoPct > 0 && risk !== 'dynamique') {
    warnings.push(
      `⚠️ Crypto ${cryptoPct} % dans un profil ${risk} : poche satellite spéculative inadaptée. ` +
      'Drawdowns historiques BTC/ETH : -84 % (2018), -77 % (2022). Envisagez de la retirer ou de choisir le profil Dynamique.'
    );
  }

  const equityPct = EQUITY_IDS.reduce((sum, id) => sum + (allocations[id] || 0), 0);
  if (horizon < 5 && equityPct > 50) {
    warnings.push(
      `⚠️ Exposition actions ${equityPct} % pour un horizon de ${horizon} an${horizon > 1 ? 's' : ''} : ` +
      'risque de ne pas avoir le temps d\'attendre un rebond après un choc de marché (-25 à -35 %). ' +
      'Règle empirique : ≤ 40–50 % d\'actions à horizon < 5 ans.'
    );
  } else if (horizon < 3 && equityPct > 30) {
    warnings.push(
      `⚠️ Exposition actions ${equityPct} % pour un horizon très court (${horizon} an${horizon > 1 ? 's' : ''}) : ` +
      'fortement déconseillé. Privilégiez des produits garantis ou à faible volatilité.'
    );
  }

  const range = PROFILE_SIGMA_RANGES[risk];
  if (range && Number.isFinite(portSigma)) {
    if (portSigma > range.max) {
      warnings.push(
        `⚠️ Volatilité du portefeuille (${fmtPct(portSigma)}) supérieure à la borne haute du profil ${risk} ` +
        `(max ${fmtPct(range.max)}) : l'allocation correspond davantage à un profil plus dynamique que celui déclaré.`
      );
    } else if (portSigma < range.min) {
      warnings.push(
        `ℹ️ Volatilité du portefeuille (${fmtPct(portSigma)}) inférieure à la borne basse du profil ${risk} ` +
        `(min ${fmtPct(range.min)}) : vous sous-exploitez peut-être votre capacité de prise de risque.`
      );
    }
  }

  return warnings;
}

// ----------------------------------------------------------------
// LANCEMENT DE LA SIMULATION
// ----------------------------------------------------------------
async function runSimulationAndRender() {
  if (!validateAllocations()) return;

  showLoading();
  await new Promise(r => setTimeout(r, 60));

  try {
    const results = runSimulation({
      capital: state.capital,
      horizon: state.horizon,
      mensuel: state.mensuel,
      tmi: state.tmi,
      alloc: state.allocations,
      products: PRODUCTS,
      correlations: CORRELATIONS,
      nSims: 10000,
    });
    state.simResults = results;

    goToStep(3);
    activateTab('kpi');
    await new Promise(r => requestAnimationFrame(r));
    renderResults();
  } catch (err) {
    console.error('Simulation error:', err);
    showError('Une erreur est survenue pendant la simulation. Vérifiez vos paramètres et réessayez.');
  } finally {
    hideLoading();
  }
}

// ----------------------------------------------------------------
// RENDU DES RÉSULTATS
// ----------------------------------------------------------------
function renderResults() {
  const {
    probLoss, probLossInvested, p10, p50, p90, netP10, netP50,
    pctPaths, productMedians, fiscalByVehicle, totalInvested,
  } = state.simResults;
  const { capital, horizon, mensuel, tmi } = state;
  const { mu, sigma } = blendedParams(state.allocations, PRODUCTS, CORRELATIONS);

  const subtitle = document.getElementById('sim-subtitle');
  subtitle.textContent =
    `Capital : ${fmt(capital)} — Horizon : ${horizon} ans — Versements : ${fmt(mensuel)}/mois — ` +
    `TMI : ${tmi} % — μ : ${fmtPct(mu)} — σ : ${fmtPct(sigma)}`;

  document.getElementById('kpi-loss').textContent = fmtPct(probLoss);
  document.getElementById('kpi-loss-sub').textContent = `(capital initial : ${fmt(capital)})`;

  document.getElementById('kpi-median').textContent = fmt(netP50);
  document.getElementById('kpi-median-sub').textContent = `Net après fiscalité — brut : ${fmt(p50)}`;

  document.getElementById('kpi-p90').textContent = fmt(p90);
  document.getElementById('kpi-p90-sub').textContent = `10 % des simulations au-dessus (brut)`;

  document.getElementById('kpi-p10').textContent = fmt(netP10);
  document.getElementById('kpi-p10-sub').textContent = `Net pessimiste — brut : ${fmt(p10)}`;

  renderGauge(probLoss);
  renderHistogram(state.simResults.sortedGross, capital);
  renderFanChart(pctPaths, horizon, capital);
  renderDonut(state.allocations, PRODUCTS);
  renderTable(productMedians);
  renderFiscalTable(fiscalByVehicle);
  renderExplainer(probLoss, probLossInvested, mu, sigma, netP50, totalInvested);
}

function renderTable(productMedians) {
  const tbody = document.querySelector('#detail-table tbody');
  tbody.textContent = '';

  for (const [id, pct] of Object.entries(state.allocations)) {
    if (!pct) continue;
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) continue;

    const muNet = p.mu - (p.ter || 0);
    const med = productMedians[id];

    const tr = document.createElement('tr');
    const cells = [
      () => { const td = document.createElement('td'); const b = document.createElement('b'); b.textContent = `${p.icon} ${p.name}`; td.appendChild(b); return td; },
      () => { const td = document.createElement('td'); const sp = document.createElement('span'); sp.className = `product-vehicle ${vehicleClass(p.vehicle)}`; sp.textContent = p.vehicleLabel; td.appendChild(sp); return td; },
      () => { const td = document.createElement('td'); td.textContent = `${pct} %`; return td; },
      () => { const td = document.createElement('td'); td.textContent = fmtPct(muNet); return td; },
      () => { const td = document.createElement('td'); td.textContent = fmtPct(p.sigma); return td; },
      () => { const td = document.createElement('td'); td.textContent = fmt(med); return td; },
    ];
    cells.forEach(fn => tr.appendChild(fn()));
    tbody.appendChild(tr);
  }
}

function renderFiscalTable(fiscalByVehicle) {
  const tbody = document.querySelector('#fiscal-table tbody');
  tbody.textContent = '';

  for (const v of ['Livret', 'PEA', 'AV', 'CTO']) {
    const d = fiscalByVehicle[v];
    if (!d) continue;

    const tr = document.createElement('tr');
    const cells = [
      () => { const td = document.createElement('td'); td.textContent = v; return td; },
      () => { const td = document.createElement('td'); td.textContent = fmt(d.capital); return td; },
      () => { const td = document.createElement('td'); td.textContent = fmt(d.finalValue); return td; },
      () => { const td = document.createElement('td'); td.textContent = d.irTax > 0 ? fmt(d.irTax) : '—'; return td; },
      () => { const td = document.createElement('td'); td.textContent = d.psTax > 0 ? fmt(d.psTax) : '—'; return td; },
      () => { const td = document.createElement('td'); td.textContent = fmt(d.tax); return td; },
      () => { const td = document.createElement('td'); const b = document.createElement('b'); b.textContent = fmt(d.net); td.appendChild(b); return td; },
    ];
    cells.forEach(fn => tr.appendChild(fn()));
    tbody.appendChild(tr);
  }
}

function renderExplainer(probLoss, probLossInvested, mu, sigma, netP50, totalInvested) {
  const { capital, horizon } = state;

  const levels = [
    { max: 0.05, label: 'Très faible', cssClass: 'risk-text-vlow', advice: 'Votre portefeuille présente un risque de perte en capital très limité. Profil adapté aux investisseurs privilégiant la sécurité.' },
    { max: 0.15, label: 'Faible', cssClass: 'risk-text-low', advice: 'Le risque est contenu. L\'horizon et la diversification protègent bien votre capital.' },
    { max: 0.30, label: 'Modéré', cssClass: 'risk-text-mod', advice: 'Une part non négligeable des scénarios peut conduire à une perte. Vérifiez que votre horizon est suffisamment long.' },
    { max: 0.50, label: 'Élevé', cssClass: 'risk-text-high', advice: 'Risque significatif. Renforcez la part de produits garantis ou allongez votre horizon si possible.' },
    { max: Infinity, label: 'Très élevé', cssClass: 'risk-text-vhigh', advice: 'Plus d\'une simulation sur deux aboutit à une perte. Reconsidérez votre allocation ou votre horizon.' },
  ];
  const lvl = levels.find(l => probLoss < l.max);

  const container = document.getElementById('risk-explainer');
  container.textContent = '';

  const h4 = document.createElement('h4');
  h4.textContent = 'Analyse du risque — ';
  const span = document.createElement('span');
  span.className = lvl.cssClass;
  span.textContent = lvl.label;
  h4.appendChild(span);
  container.appendChild(h4);

  const p = document.createElement('p');
  p.textContent = lvl.advice;
  container.appendChild(p);

  const realNetP50 = netP50 / Math.pow(1 + INFLATION, horizon);

  const items = [
    `Probabilité de ne pas récupérer le capital initial (${fmt(capital)}) : ${fmtPct(probLoss)}`,
    `Probabilité de ne pas récupérer le total investi (${fmt(totalInvested)}) : ${fmtPct(probLossInvested)}`,
    `Rendement annuel moyen brut (μ), corrélations entre actifs incluses : ${fmtPct(mu)}`,
    `Volatilité annuelle globale (σ, corrélations intégrées) : ${fmtPct(sigma)}`,
    `Net médian après fiscalité : ${fmt(netP50)}`,
    `Valeur nette médiane en euros constants (inflation ~2,2 %/an) : ${fmt(realNetP50)}`,
    `Méthode : Monte Carlo joint corrélé (10 000 scénarios), pas mensuel, fiscalité appliquée scénario par scénario.`,
  ];

  const ul = document.createElement('ul');
  items.forEach(text => {
    const li = document.createElement('li');
    li.textContent = text;
    ul.appendChild(li);
  });
  container.appendChild(ul);

  const { sigma: portSigma } = blendedParams(state.allocations, PRODUCTS, CORRELATIONS);
  const qWarns = qualitativeWarnings(state.allocations, state.risk, horizon, portSigma);
  if (qWarns.length > 0) {
    const warnBox = document.createElement('div');
    warnBox.className = 'qualitative-warnings';
    qWarns.forEach(msg => {
      const p2 = document.createElement('p');
      p2.textContent = msg;
      warnBox.appendChild(p2);
    });
    container.appendChild(warnBox);
  }
}

// ----------------------------------------------------------------
// ONGLETS (step 3)
// ----------------------------------------------------------------
export function activateTab(name) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const isActive = btn.dataset.tab === name;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  document.querySelectorAll('.tab-panel').forEach(panel => {
    const show = panel.id === `tab-${name}`;
    panel.hidden = !show;
    panel.classList.toggle('active', show);
    if (show) panel.scrollTop = 0;
  });

  if (name === 'charts') {
    requestAnimationFrame(() => resizeCharts());
  }
}

// ----------------------------------------------------------------
// INITIALISATION
// ----------------------------------------------------------------
export function initUI() {
  linkSlider('capital-slider', 'capital', 100, 1_000_000);
  linkSlider('horizon-slider', 'horizon', 1, 30);
  linkSlider('mensuel-slider', 'mensuel', 0, 10_000);

  document.getElementById('btn-step1-next').addEventListener('click', () => goToStep(2));
  document.getElementById('btn-step2-back').addEventListener('click', () => goToStep(1));
  document.getElementById('simulate-btn').addEventListener('click', () => runSimulationAndRender());
  document.getElementById('btn-step3-back').addEventListener('click', () => goToStep(2));
  document.getElementById('btn-step3-restart').addEventListener('click', () => goToStep(1));
  document.getElementById('btn-pdf').addEventListener('click', () => generatePDF());

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });

  document.querySelectorAll('input[name="risk"]').forEach(r => {
    r.addEventListener('change', () => updateSuggestion());
  });

  document.getElementById('error-banner').addEventListener('click', hideError);

  updateSuggestion();
}
