/* ================================================================
   SimuPortefeuille — Main Application Logic
   Monte Carlo simulation using Geometric Brownian Motion (GBM)
   ================================================================ */

'use strict';

// ----------------------------------------------------------------
// 1. PRODUCT CATALOGUE
// ----------------------------------------------------------------
const PRODUCTS = [
  {
    id: 'livret-a',
    name: 'Livret A',
    vehicle: 'Livret',
    vehicleLabel: 'Livret A',
    icon: '🏦',
    mu: 0.03,          // expected annual return
    sigma: 0.0,        // annual volatility
    guaranteed: true,
    minHorizon: 0,
    riskProfile: ['conservateur', 'modere', 'dynamique'],
    description: 'Épargne réglementée garantie à 3 % (taux 2024), plafond 22 950 €.',
  },
  {
    id: 'ldds',
    name: 'LDDS',
    vehicle: 'Livret',
    vehicleLabel: 'LDDS',
    icon: '💚',
    mu: 0.03,
    sigma: 0.0,
    guaranteed: true,
    minHorizon: 0,
    riskProfile: ['conservateur', 'modere', 'dynamique'],
    description: 'Livret Développement Durable et Solidaire, taux identique au Livret A.',
  },
  {
    id: 'fonds-euro',
    name: 'Fonds Euro Assurance-vie',
    vehicle: 'AV',
    vehicleLabel: 'Assurance-vie',
    icon: '🔒',
    mu: 0.025,
    sigma: 0.004,
    guaranteed: false,
    minHorizon: 3,
    riskProfile: ['conservateur', 'modere'],
    description: 'Capital quasi-garanti, rendement net ~2–2,5 % selon contrat.',
  },
  {
    id: 'obligations-etat',
    name: 'Obligations d\'État (ETF)',
    vehicle: 'CTO',
    vehicleLabel: 'CTO / AV',
    icon: '🏛️',
    mu: 0.038,
    sigma: 0.06,
    guaranteed: false,
    minHorizon: 2,
    riskProfile: ['conservateur', 'modere'],
    description: 'Obligations souveraines européennes, faible risque, rendement ~3,5–4 %.',
  },
  {
    id: 'scpi',
    name: 'SCPI (Immobilier)',
    vehicle: 'CTO',
    vehicleLabel: 'CTO / AV',
    icon: '🏢',
    mu: 0.045,
    sigma: 0.07,
    guaranteed: false,
    minHorizon: 8,
    riskProfile: ['conservateur', 'modere', 'dynamique'],
    description: 'Société civile de placement immobilier, rendement cible ~4–5 %.',
  },
  {
    id: 'uc-oblig',
    name: 'Unité de Compte Obligataire',
    vehicle: 'AV',
    vehicleLabel: 'Assurance-vie',
    icon: '📄',
    mu: 0.04,
    sigma: 0.08,
    guaranteed: false,
    minHorizon: 3,
    riskProfile: ['conservateur', 'modere'],
    description: 'UC investies en obligations d\'entreprises, rendement ~3,5–4,5 %.',
  },
  {
    id: 'etf-europe',
    name: 'ETF Actions Europe',
    vehicle: 'PEA',
    vehicleLabel: 'PEA',
    icon: '🇪🇺',
    mu: 0.07,
    sigma: 0.17,
    guaranteed: false,
    minHorizon: 5,
    riskProfile: ['modere', 'dynamique'],
    description: 'Indice Euro Stoxx 600, exposition actions européennes diversifiées.',
  },
  {
    id: 'etf-monde',
    name: 'ETF MSCI World',
    vehicle: 'PEA',
    vehicleLabel: 'PEA',
    icon: '🌍',
    mu: 0.075,
    sigma: 0.16,
    guaranteed: false,
    minHorizon: 5,
    riskProfile: ['modere', 'dynamique'],
    description: 'Exposition mondiale ~1 600 sociétés, moteur de performance long terme.',
  },
  {
    id: 'etf-emergents',
    name: 'ETF Marchés Émergents',
    vehicle: 'CTO',
    vehicleLabel: 'CTO',
    icon: '🌏',
    mu: 0.085,
    sigma: 0.22,
    guaranteed: false,
    minHorizon: 7,
    riskProfile: ['dynamique'],
    description: 'Asie, Amérique Latine, Moyen-Orient : fort potentiel, haute volatilité.',
  },
  {
    id: 'uc-actions',
    name: 'UC Actions Monde (AV)',
    vehicle: 'AV',
    vehicleLabel: 'Assurance-vie',
    icon: '📈',
    mu: 0.07,
    sigma: 0.16,
    guaranteed: false,
    minHorizon: 5,
    riskProfile: ['modere', 'dynamique'],
    description: 'Unités de compte en actions mondiales au sein d\'une assurance-vie.',
  },
  {
    id: 'crypto-btc',
    name: 'Cryptomonnaies (panier)',
    vehicle: 'CTO',
    vehicleLabel: 'CTO',
    icon: '₿',
    mu: 0.12,
    sigma: 0.60,
    guaranteed: false,
    minHorizon: 5,
    riskProfile: ['dynamique'],
    description: 'BTC/ETH — très haute volatilité, risque de perte totale, potentiel élevé.',
  },
];

// Suggested allocations by risk profile
const SUGGESTIONS = {
  conservateur: {
    label: 'Profil conservateur recommandé',
    alloc: { 'livret-a': 30, 'ldds': 10, 'fonds-euro': 40, 'obligations-etat': 20 },
  },
  modere: {
    label: 'Profil modéré recommandé',
    alloc: { 'fonds-euro': 20, 'uc-oblig': 15, 'scpi': 10, 'etf-europe': 30, 'etf-monde': 25 },
  },
  dynamique: {
    label: 'Profil dynamique recommandé',
    alloc: { 'etf-monde': 40, 'etf-europe': 25, 'etf-emergents': 20, 'uc-actions': 15 },
  },
};

// ----------------------------------------------------------------
// 2. STATE
// ----------------------------------------------------------------
let state = {
  capital: 10000,
  horizon: 10,
  risk: 'conservateur',
  mensuel: 0,
  allocations: {},     // { productId: pctValue }
  simResults: null,
};

let charts = {};

// ----------------------------------------------------------------
// 3. STEPPER
// ----------------------------------------------------------------
function goToStep(n) {
  if (n === 2) {
    readStep1();
    renderProducts();
  }
  if (n === 3) {
    if (!validateAllocations()) return;
  }

  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`step-${n}`).classList.add('active');

  document.querySelectorAll('.step').forEach(s => {
    const sn = parseInt(s.dataset.step);
    s.classList.toggle('active', sn === n);
    s.classList.toggle('done', sn < n);
  });

  document.querySelectorAll('.step-line').forEach((l, i) => {
    l.classList.toggle('done', i < n - 1);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ----------------------------------------------------------------
// 4. STEP 1 — Read inputs
// ----------------------------------------------------------------
function readStep1() {
  state.capital  = parseFloat(document.getElementById('capital').value)  || 10000;
  state.horizon  = parseInt(document.getElementById('horizon').value)    || 10;
  state.risk     = document.querySelector('input[name="risk"]:checked').value;
  state.mensuel  = parseFloat(document.getElementById('mensuel').value)  || 0;
}

function linkSlider(sliderId, inputId) {
  const slider = document.getElementById(sliderId);
  const input  = document.getElementById(inputId);
  slider.addEventListener('input', () => { input.value = slider.value; });
  input.addEventListener('input',  () => {
    slider.value = Math.min(Math.max(input.value, slider.min), slider.max);
  });
}

linkSlider('capital-slider',  'capital');
linkSlider('horizon-slider',  'horizon');
linkSlider('mensuel-slider',  'mensuel');

// Risk card highlighting
document.querySelectorAll('input[name="risk"]').forEach(r => {
  r.addEventListener('change', () => updateSuggestion());
});

// ----------------------------------------------------------------
// 5. STEP 2 — Product rendering
// ----------------------------------------------------------------
function vehicleClass(v) {
  if (v === 'PEA')    return 'vehicle-pea';
  if (v === 'Livret') return 'vehicle-livret';
  if (v === 'AV')     return 'vehicle-av';
  return 'vehicle-cto';
}

function renderProducts() {
  const risk    = document.querySelector('input[name="risk"]:checked').value;
  const horizon = parseInt(document.getElementById('horizon').value) || 10;
  const grid    = document.getElementById('products-grid');
  grid.innerHTML = '';

  const suggestion = SUGGESTIONS[risk];
  state.allocations = { ...suggestion.alloc };

  PRODUCTS.forEach(p => {
    const eligible = p.riskProfile.includes(risk) && p.minHorizon <= horizon;
    const pct      = state.allocations[p.id] || 0;

    const card = document.createElement('div');
    card.className = `product-card${pct > 0 ? ' active' : ''}${!eligible ? ' dimmed' : ''}`;
    card.id = `card-${p.id}`;

    card.innerHTML = `
      <div class="product-header">
        <span class="product-icon">${p.icon}</span>
        <div class="product-info">
          <div class="product-name">${p.name}</div>
          <span class="product-vehicle ${vehicleClass(p.vehicle)}">${p.vehicleLabel}</span>
        </div>
      </div>
      <div class="product-stats">
        <span class="stat-pill return">~${(p.mu * 100).toFixed(1)} % /an</span>
        <span class="stat-pill vol">σ ${(p.sigma * 100).toFixed(0)} %</span>
        ${p.guaranteed ? '<span class="stat-pill" style="color:var(--success);border-color:#bbf7d0;background:#f0fdf4">Garanti</span>' : ''}
        ${!eligible ? `<span class="stat-pill" style="color:var(--danger)">Horizon min. ${p.minHorizon} ans</span>` : ''}
      </div>
      <div class="product-pct-row">
        <label for="pct-${p.id}">Allocation :</label>
        <input type="number" id="pct-${p.id}" min="0" max="100" step="5" value="${pct}"
          ${!eligible ? 'disabled' : ''}
          onchange="updateAlloc('${p.id}', this.value)"
          oninput="updateAlloc('${p.id}', this.value)"
        />
        <span class="unit">%</span>
      </div>
    `;

    // tooltip
    card.title = p.description;
    grid.appendChild(card);
  });

  updateSuggestion();
  updateTotal();
}

function updateAlloc(id, val) {
  const v = Math.max(0, Math.min(100, parseFloat(val) || 0));
  state.allocations[id] = v;
  const card = document.getElementById(`card-${id}`);
  if (card) card.classList.toggle('active', v > 0);
  updateTotal();
}

function updateTotal() {
  const total = Object.values(state.allocations).reduce((a, b) => a + b, 0);
  const el    = document.getElementById('total-pct');
  el.textContent = `${Math.round(total)} %`;
  el.className = `total-pct ${total === 100 ? 'good' : total > 100 ? 'over' : 'neutral'}`;
  document.getElementById('simulate-btn').disabled = Math.round(total) !== 100;
}

function updateSuggestion() {
  const risk = document.querySelector('input[name="risk"]:checked').value;
  const s    = SUGGESTIONS[risk];
  const bar  = document.getElementById('allocation-suggestions');
  if (!bar) return;
  const parts = Object.entries(s.alloc)
    .map(([id, pct]) => {
      const p = PRODUCTS.find(x => x.id === id);
      return p ? `${p.icon} ${p.name} <strong>${pct} %</strong>` : '';
    }).join(' &nbsp;|&nbsp; ');
  bar.innerHTML = `<strong>${s.label} :</strong> ${parts}`;
}

function validateAllocations() {
  const total = Object.values(state.allocations).reduce((a, b) => a + b, 0);
  if (Math.round(total) !== 100) {
    alert(`L'allocation doit totaliser 100 % (actuellement ${Math.round(total)} %)`);
    return false;
  }
  return true;
}

// ----------------------------------------------------------------
// 6. MONTE CARLO ENGINE
// ----------------------------------------------------------------
const N_SIMS = 10000;

// Box-Muller transform — standard normal random
function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Simulate a single path for a blended portfolio using GBM.
 * Returns array of yearly portfolio values [V0, V1, ..., VT].
 */
function simulatePath(capital, mu, sigma, horizon, mensuel) {
  const dt = 1 / 12; // monthly steps
  const steps = Math.round(horizon * 12);
  let V = capital;
  const yearly = [capital];
  let monthInYear = 0;

  for (let i = 0; i < steps; i++) {
    // GBM step
    V = V * Math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * randn());
    // Monthly contribution
    V += mensuel;
    monthInYear++;
    if (monthInYear === 12) {
      yearly.push(V);
      monthInYear = 0;
    }
  }
  if (monthly => monthly && yearly.length < horizon + 1) yearly.push(V);
  return yearly;
}

/**
 * Compute blended portfolio parameters from allocations.
 */
function blendedParams(allocations) {
  let mu = 0;
  let varP = 0; // variance (assume independence)

  for (const [id, pct] of Object.entries(allocations)) {
    if (!pct) continue;
    const w = pct / 100;
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) continue;
    mu   += w * p.mu;
    varP += (w * p.sigma) ** 2;
  }

  return { mu, sigma: Math.sqrt(varP) };
}

function runSimulation() {
  if (!validateAllocations()) return;
  readStep1();

  const { mu, sigma } = blendedParams(state.allocations);
  const { capital, horizon, mensuel } = state;

  // Total invested (capital + contributions)
  const totalInvested = capital + mensuel * 12 * horizon;

  // Run Monte Carlo
  const finalValues = new Array(N_SIMS);
  const yearlyMedians = [];

  // collect full paths for percentile fan
  const pctPaths = { p10: [], p25: [], p50: [], p75: [], p90: [] };
  const allPaths = [];

  for (let i = 0; i < N_SIMS; i++) {
    const path = simulatePath(capital, mu, sigma, horizon, mensuel);
    finalValues[i] = path[path.length - 1];
    allPaths.push(path);
  }

  // Sort finals
  finalValues.sort((a, b) => a - b);

  // Percentile helper
  const pct = (arr, p) => {
    const i = Math.floor(p / 100 * (arr.length - 1));
    return arr[i];
  };

  // Per-year percentiles
  for (let t = 0; t <= horizon; t++) {
    const vals = allPaths.map(p => p[t]).sort((a, b) => a - b);
    pctPaths.p10.push(pct(vals, 10));
    pctPaths.p25.push(pct(vals, 25));
    pctPaths.p50.push(pct(vals, 50));
    pctPaths.p75.push(pct(vals, 75));
    pctPaths.p90.push(pct(vals, 90));
  }

  // Probability of loss
  const lossCount = finalValues.filter(v => v < capital).length;
  const probLoss  = lossCount / N_SIMS;

  // Probability of not recovering total invested (capital + contributions)
  const lossInvestedCount = finalValues.filter(v => v < totalInvested).length;
  const probLossInvested  = lossInvestedCount / N_SIMS;

  state.simResults = {
    mu, sigma,
    totalInvested,
    finalValues,
    pctPaths,
    probLoss,
    probLossInvested,
    p10: pct(finalValues, 10),
    p25: pct(finalValues, 25),
    p50: pct(finalValues, 50),
    p75: pct(finalValues, 75),
    p90: pct(finalValues, 90),
  };

  renderResults();
  goToStep(3);
}

// ----------------------------------------------------------------
// 7. RENDER RESULTS
// ----------------------------------------------------------------
function fmt(n) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
}

function fmtPct(p) {
  return (p * 100).toFixed(1) + ' %';
}

function renderResults() {
  const { mu, sigma, probLoss, probLossInvested, p10, p25, p50, p75, p90,
          finalValues, pctPaths, totalInvested } = state.simResults;
  const { capital, horizon, mensuel } = state;

  // Subtitle
  document.getElementById('sim-subtitle').textContent =
    `Capital : ${fmt(capital)} — Horizon : ${horizon} ans — ` +
    `Versements : ${fmt(mensuel)}/mois — Rendement moyen : ${fmtPct(mu)} — Volatilité : ${fmtPct(sigma)}`;

  // KPIs
  document.getElementById('kpi-loss').textContent  = fmtPct(probLoss);
  document.getElementById('kpi-loss-sub').textContent =
    `(ne pas récupérer le capital initial de ${fmt(capital)})`;

  document.getElementById('kpi-median').textContent  = fmt(p50);
  document.getElementById('kpi-median-sub').textContent =
    `+ ${fmtPct((p50 / capital - 1))} vs capital initial`;

  document.getElementById('kpi-p90').textContent     = fmt(p90);
  document.getElementById('kpi-p90-sub').textContent = `90 % des simulations sous ce seuil`;

  document.getElementById('kpi-p10').textContent     = fmt(p10);
  document.getElementById('kpi-p10-sub').textContent = `10 % des simulations sous ce seuil`;

  // Gauge
  renderGauge(probLoss);

  // Histogram
  renderHistogram(finalValues, capital, totalInvested);

  // Fan chart
  renderFanChart(pctPaths, horizon, capital);

  // Donut
  renderDonut();

  // Table
  renderTable(capital, horizon, mensuel);

  // Explainer
  renderExplainer(probLoss, probLossInvested, mu, sigma);
}

// ---- GAUGE ----
function renderGauge(probLoss) {
  const pct = Math.min(probLoss, 1);
  const startAngle = Math.PI;
  const endAngle   = 2 * Math.PI;
  const fillAngle  = startAngle + pct * Math.PI;

  const ctx = document.getElementById('gauge-chart').getContext('2d');

  if (charts.gauge) charts.gauge.destroy();

  // Color: green → yellow → red
  const color = pct < 0.1 ? '#16a34a'
              : pct < 0.3 ? '#d97706'
              : '#dc2626';

  charts.gauge = new Chart(ctx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [pct * 100, (1 - pct) * 100],
        backgroundColor: [color, '#e2e8f0'],
        borderWidth: 0,
        circumference: 180,
        rotation: 270,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
      },
      cutout: '70%',
    },
  });

  // Label
  const label = pct < 0.05 ? '🟢 Très faible'
              : pct < 0.15 ? '🟡 Faible'
              : pct < 0.30 ? '🟠 Modéré'
              : pct < 0.50 ? '🔴 Élevé'
              : '⛔ Très élevé';

  document.getElementById('gauge-label').textContent = label;
}

// ---- HISTOGRAM ----
function renderHistogram(finalValues, capital, totalInvested) {
  const ctx = document.getElementById('dist-chart').getContext('2d');
  if (charts.dist) charts.dist.destroy();

  const min = finalValues[0];
  const max = finalValues[finalValues.length - 1];
  const bins = 50;
  const binSize = (max - min) / bins;

  const counts = new Array(bins).fill(0);
  const labels = [];

  for (let i = 0; i < bins; i++) {
    labels.push(Math.round(min + i * binSize));
  }

  finalValues.forEach(v => {
    const idx = Math.min(bins - 1, Math.floor((v - min) / binSize));
    counts[idx]++;
  });

  // Color: red if below capital
  const colors = labels.map((l, i) => {
    const midPoint = l + binSize / 2;
    return midPoint < capital ? 'rgba(220,38,38,.7)' : 'rgba(37,99,235,.6)';
  });

  charts.dist = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.map(l => fmt(l)),
      datasets: [{
        label: 'Simulations',
        data: counts,
        backgroundColor: colors,
        borderWidth: 0,
        borderRadius: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.parsed.y} simulations`,
            title: ctx => `Valeur ≈ ${ctx[0].label}`,
          },
        },
        annotation: {},
      },
      scales: {
        x: {
          ticks: {
            maxTicksLimit: 8,
            callback: (v, i) => i % 6 === 0 ? fmt(labels[i]) : '',
            font: { size: 10 },
          },
          grid: { display: false },
        },
        y: {
          ticks: { font: { size: 10 } },
          grid: { color: '#f1f5f9' },
        },
      },
    },
  });
}

// ---- FAN CHART ----
function renderFanChart(pctPaths, horizon, capital) {
  const ctx = document.getElementById('fan-chart').getContext('2d');
  if (charts.fan) charts.fan.destroy();

  const labels = Array.from({ length: horizon + 1 }, (_, i) => `An ${i}`);

  charts.fan = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '10e percentile',
          data: pctPaths.p10,
          borderColor: 'rgba(220,38,38,.8)',
          backgroundColor: 'rgba(220,38,38,.05)',
          borderWidth: 1.5,
          borderDash: [4, 3],
          pointRadius: 0,
          fill: false,
          tension: 0.3,
        },
        {
          label: '25e percentile',
          data: pctPaths.p25,
          borderColor: 'rgba(249,115,22,.6)',
          backgroundColor: 'rgba(249,115,22,.07)',
          borderWidth: 1,
          pointRadius: 0,
          fill: '+1',
          tension: 0.3,
        },
        {
          label: 'Médiane (50e)',
          data: pctPaths.p50,
          borderColor: 'rgba(37,99,235,1)',
          backgroundColor: 'rgba(37,99,235,.08)',
          borderWidth: 2.5,
          pointRadius: 3,
          fill: false,
          tension: 0.3,
        },
        {
          label: '75e percentile',
          data: pctPaths.p75,
          borderColor: 'rgba(34,197,94,.6)',
          backgroundColor: 'rgba(34,197,94,.07)',
          borderWidth: 1,
          pointRadius: 0,
          fill: '-1',
          tension: 0.3,
        },
        {
          label: '90e percentile',
          data: pctPaths.p90,
          borderColor: 'rgba(22,163,74,.8)',
          backgroundColor: 'rgba(22,163,74,.05)',
          borderWidth: 1.5,
          borderDash: [4, 3],
          pointRadius: 0,
          fill: false,
          tension: 0.3,
        },
        {
          label: 'Capital initial',
          data: Array(horizon + 1).fill(capital),
          borderColor: 'rgba(100,116,139,.5)',
          borderWidth: 1,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: { font: { size: 11 }, boxWidth: 20 },
        },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 } } },
        y: {
          grid: { color: '#f1f5f9' },
          ticks: {
            font: { size: 10 },
            callback: v => v >= 1000 ? `${(v / 1000).toFixed(0)}k €` : `${v} €`,
          },
        },
      },
    },
  });
}

// ---- DONUT ----
function renderDonut() {
  const ctx = document.getElementById('donut-chart').getContext('2d');
  if (charts.donut) charts.donut.destroy();

  const labels = [];
  const data   = [];
  const colors = ['#2563eb','#7c3aed','#16a34a','#d97706','#0891b2','#dc2626','#0d9488','#9333ea','#f59e0b','#6366f1','#ef4444'];

  let ci = 0;
  const bgColors = [];

  for (const [id, pct] of Object.entries(state.allocations)) {
    if (!pct) continue;
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) continue;
    labels.push(`${p.icon} ${p.name}`);
    data.push(pct);
    bgColors.push(colors[ci++ % colors.length]);
  }

  charts.donut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: bgColors, borderWidth: 2, borderColor: '#fff' }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { size: 11 }, boxWidth: 14 },
        },
        tooltip: {
          callbacks: { label: ctx => `${ctx.label}: ${ctx.parsed} %` },
        },
      },
      cutout: '55%',
    },
  });
}

// ---- DETAIL TABLE ----
function renderTable(capital, horizon, mensuel) {
  const tbody = document.querySelector('#detail-table tbody');
  tbody.innerHTML = '';

  for (const [id, pct] of Object.entries(state.allocations)) {
    if (!pct) continue;
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) continue;

    const w = pct / 100;
    const allocated = capital * w;

    // Simulate median for this product alone
    const { p50 } = singleProductSim(allocated, p.mu, p.sigma, horizon, mensuel * w);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p.icon} <strong>${p.name}</strong></td>
      <td><span class="product-vehicle ${vehicleClass(p.vehicle)}">${p.vehicleLabel}</span></td>
      <td>${pct} %</td>
      <td>${fmtPct(p.mu)}</td>
      <td>${fmtPct(p.sigma)}</td>
      <td>${fmt(p50)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function singleProductSim(capital, mu, sigma, horizon, mensuel) {
  const N = 2000;
  const finals = [];
  for (let i = 0; i < N; i++) {
    const path = simulatePath(capital, mu, sigma, horizon, mensuel);
    finals.push(path[path.length - 1]);
  }
  finals.sort((a, b) => a - b);
  return { p50: finals[Math.floor(N / 2)] };
}

// ---- EXPLAINER ----
function renderExplainer(probLoss, probLossInvested, mu, sigma) {
  const { capital, horizon, mensuel, simResults } = state;
  const { p10, p50, p90 } = simResults;

  let riskLevel, riskColor, advice;

  if (probLoss < 0.05) {
    riskLevel = 'Très faible';
    riskColor = 'var(--success)';
    advice = 'Votre portefeuille présente un risque de perte en capital très limité. Ce profil convient aux investisseurs privilégiant la sécurité et la liquidité.';
  } else if (probLoss < 0.15) {
    riskLevel = 'Faible';
    riskColor = '#65a30d';
    advice = 'Le risque est contenu. L\'horizon de placement et la diversification protègent bien votre capital.';
  } else if (probLoss < 0.30) {
    riskLevel = 'Modéré';
    riskColor = 'var(--warning)';
    advice = 'Une part non négligeable des scénarios peut conduire à une perte. Vérifiez que votre horizon est suffisamment long.';
  } else if (probLoss < 0.50) {
    riskLevel = 'Élevé';
    riskColor = '#f97316';
    advice = 'Risque significatif. Renforcez la part de produits garantis ou allongez votre horizon si possible.';
  } else {
    riskLevel = 'Très élevé';
    riskColor = 'var(--danger)';
    advice = 'Plus d\'une simulation sur deux aboutit à une perte. Reconsidérez votre allocation ou votre horizon.';
  }

  const totalInvested = capital + mensuel * 12 * horizon;

  document.getElementById('risk-explainer').innerHTML = `
    <h4>Analyse du risque — <span style="color:${riskColor}">${riskLevel}</span></h4>
    <p>${advice}</p>
    <ul>
      <li>Probabilité de ne pas récupérer le capital initial (${fmt(capital)}) : <strong>${fmtPct(probLoss)}</strong></li>
      <li>Probabilité de ne pas récupérer le total investi (${fmt(totalInvested)}) : <strong>${fmtPct(probLossInvested)}</strong></li>
      <li>Rendement annuel moyen du portefeuille : <strong>${fmtPct(mu)}</strong></li>
      <li>Volatilité annuelle globale : <strong>${fmtPct(sigma)}</strong></li>
      <li>Fourchette de résultats à ${horizon} ans : de <strong>${fmt(p10)}</strong> (scén. pessimiste) à <strong>${fmt(p90)}</strong> (scén. optimiste)</li>
      <li>La méthode Monte Carlo simule ${N_SIMS.toLocaleString('fr-FR')} trajectoires via un Mouvement Brownien Géométrique.</li>
    </ul>
  `;
}

// ----------------------------------------------------------------
// 8. INIT
// ----------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  updateSuggestion();
});
