/* ================================================================
   SimuPortefeuille — Application Logic v2
   Normes appliquées :
   • Sécurité  : validation stricte entrées, pas d'innerHTML avec
                 données utilisateur, CSP-compatible (pas d'eval),
                 erreurs sans exposition de stack
   • Fiabilité : try/catch simulation, état de chargement,
                 destruction propre des graphiques Chart.js,
                 gestion des cas limites (NaN, Inf, division zéro)
   • PDF/A     : métadonnées XMP, polices standard, pas de chiffrement,
                 pagination automatique, empreinte SHA-256
   ================================================================ */

'use strict';

// ----------------------------------------------------------------
// 1. CATALOGUE DE PRODUITS
// ----------------------------------------------------------------
const PRODUCTS = [
  {
    id: 'livret-a',
    name: 'Livret A',
    vehicle: 'Livret',
    vehicleLabel: 'Livret A',
    icon: '🏦',
    mu: 0.015,
    sigma: 0.0,
    guaranteed: true,
    minHorizon: 0,
    riskProfile: ['conservateur', 'modere', 'dynamique'],
    description: 'Épargne réglementée garantie, taux 1,50 % (fév.–juil. 2026), plafond 22 950 €. Totalement exonérée d\'IR et de prélèvements sociaux.',
  },
  {
    id: 'ldds',
    name: 'LDDS',
    vehicle: 'Livret',
    vehicleLabel: 'LDDS',
    icon: '💚',
    mu: 0.015,
    sigma: 0.0,
    guaranteed: true,
    minHorizon: 0,
    riskProfile: ['conservateur', 'modere', 'dynamique'],
    description: 'Livret Développement Durable et Solidaire, taux 1,50 % (fév.–juil. 2026), plafond 12 000 €. Exonéré d\'IR et de prélèvements sociaux.',
  },
  {
    id: 'fonds-euro',
    name: 'Fonds Euro Assurance-vie',
    vehicle: 'AV',
    vehicleLabel: 'Assurance-vie',
    icon: '🔒',
    mu: 0.026,
    sigma: 0.004,
    guaranteed: false,
    minHorizon: 3,
    riskProfile: ['conservateur', 'modere'],
    description: 'Capital quasi-garanti, rendement moyen 2,60 % net de frais (marché 2024). PS 17,2 % applicables uniquement au rachat.',
  },
  {
    id: 'obligations-etat',
    name: "Obligations d'État (ETF)",
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
    description: "UC investies en obligations d'entreprises, rendement ~3,5–4,5 %.",
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
    description: "Unités de compte en actions mondiales au sein d'une assurance-vie.",
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

/** Allocations suggérées par profil de risque */
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
// 2. ÉTAT GLOBAL
// ----------------------------------------------------------------
let state = {
  capital:     10000,
  horizon:     10,
  risk:        'conservateur',
  mensuel:     0,
  allocations: {},
  simResults:  null,
};

/** Instances Chart.js actives — détruits avant toute recréation */
const charts = {};

// ----------------------------------------------------------------
// 3. UTILITAIRES — FORMATAGE
// ----------------------------------------------------------------

/** Formate un nombre en euros (fr-FR) */
function fmt(n) {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + '\u202f€';
}

/** Formate un ratio [0..1] en pourcentage */
function fmtPct(p) {
  if (!Number.isFinite(p)) return '—';
  return (p * 100).toFixed(1) + '\u202f%';
}

// ----------------------------------------------------------------
// 4. GESTION DES ERREURS / CHARGEMENT
// ----------------------------------------------------------------

function showError(msg) {
  const el = document.getElementById('error-banner');
  el.textContent = msg;             // textContent : aucun risque XSS
  el.hidden = false;
  setTimeout(() => hideError(), 6000);
}

function hideError() {
  document.getElementById('error-banner').hidden = true;
}

function showLoading() {
  document.getElementById('loading-overlay').hidden = false;
}

function hideLoading() {
  document.getElementById('loading-overlay').hidden = true;
}

// ----------------------------------------------------------------
// 5. NAVIGATION PAR ÉTAPES
// ----------------------------------------------------------------

function goToStep(n) {
  hideError();

  if (n === 2) {
    if (!readStep1()) return;       // validation échoue → on reste à l'étape 1
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

  // Scroll interne de l'étape active remis en haut
  const panel = document.getElementById(`step-${n}`);
  if (panel) panel.scrollTop = 0;
}

// ----------------------------------------------------------------
// 6. ÉTAPE 1 — LECTURE & VALIDATION DES ENTRÉES
// ----------------------------------------------------------------

/**
 * Lit, valide et sanitise les entrées de l'étape 1.
 * Affiche une erreur et retourne false si invalide.
 */
function readStep1() {
  const capitalRaw  = parseFloat(document.getElementById('capital').value);
  const horizonRaw  = parseInt(document.getElementById('horizon').value, 10);
  const mensuelRaw  = parseFloat(document.getElementById('mensuel').value);
  const riskEl      = document.querySelector('input[name="risk"]:checked');

  // Validation
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
  const VALID_RISKS = ['conservateur', 'modere', 'dynamique'];
  if (!riskEl || !VALID_RISKS.includes(riskEl.value)) {
    showError('Profil de risque invalide.');
    return false;
  }

  state.capital  = capitalRaw;
  state.horizon  = horizonRaw;
  state.risk     = riskEl.value;
  state.mensuel  = mensuelRaw;
  return true;
}

/** Synchronise slider ↔ input numérique */
function linkSlider(sliderId, inputId, min, max) {
  const slider = document.getElementById(sliderId);
  const input  = document.getElementById(inputId);
  if (!slider || !input) return;

  slider.addEventListener('input', () => {
    input.value = slider.value;
  });
  input.addEventListener('input', () => {
    const clamped = Math.min(Math.max(parseFloat(input.value) || min, min), max);
    slider.value = clamped;
  });
}

// ----------------------------------------------------------------
// 7. ÉTAPE 2 — PRODUITS & ALLOCATION
// ----------------------------------------------------------------

function vehicleClass(v) {
  const map = { PEA: 'vehicle-pea', Livret: 'vehicle-livret', AV: 'vehicle-av' };
  return map[v] || 'vehicle-cto';
}

function renderProducts() {
  const risk    = state.risk;
  const horizon = state.horizon;
  const grid    = document.getElementById('products-grid');
  grid.innerHTML = '';

  // Réinitialise les allocations avec la suggestion du profil
  state.allocations = { ...SUGGESTIONS[risk].alloc };

  PRODUCTS.forEach(p => {
    const eligible = p.riskProfile.includes(risk) && p.minHorizon <= horizon;
    const pct      = state.allocations[p.id] || 0;

    const card = document.createElement('div');
    card.className = [
      'product-card',
      pct > 0 ? 'active' : '',
      !eligible ? 'dimmed' : '',
    ].filter(Boolean).join(' ');
    card.id = `card-${p.id}`;
    card.setAttribute('role', 'listitem');

    // Stat pills (données issues de constantes — pas d'input utilisateur)
    const pillReturn = `<span class="stat-pill return">~${(p.mu * 100).toFixed(1)}\u202f%/an</span>`;
    const pillVol    = p.sigma > 0 ? `<span class="stat-pill vol">Vol.\u202f${(p.sigma * 100).toFixed(0)}\u202f%</span>` : '';
    const pillGuar   = p.guaranteed ? '<span class="stat-pill guaranteed">Garanti</span>' : '';
    const pillMin    = !eligible ? `<span class="stat-pill min-hor">Horizon min.\u202f${p.minHorizon}\u202fans</span>` : '';

    // Construit le contenu du card de façon sûre via DOM
    card.innerHTML = `
      <div class="product-header">
        <span class="product-icon" aria-hidden="true"></span>
        <div class="product-info">
          <div class="product-name"></div>
          <span class="product-vehicle ${vehicleClass(p.vehicle)}"></span>
        </div>
      </div>
      <div class="product-stats">${pillReturn}${pillVol}${pillGuar}${pillMin}</div>
      <div class="product-pct-row">
        <label for="pct-${p.id}">Alloc.\u202f:</label>
        <input type="number" id="pct-${p.id}"
               min="0" max="100" step="5" value="${pct}"
               ${!eligible ? 'disabled aria-disabled="true"' : ''}
               inputmode="numeric" />
        <span class="unit">%</span>
      </div>
    `;

    // Injection textContent (pas innerHTML) pour les données potentiellement hétérogènes
    card.querySelector('.product-icon').textContent      = p.icon;
    card.querySelector('.product-name').textContent      = p.name;
    card.querySelector('.product-vehicle').textContent   = p.vehicleLabel;

    // Tooltip via attribut (pas inline style)
    card.title = p.description;

    // Listener allocation
    const input = card.querySelector(`#pct-${p.id}`);
    input.addEventListener('input', () => updateAlloc(p.id, input.value));
    input.addEventListener('change', () => updateAlloc(p.id, input.value));

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
  const rounded = Math.round(total);
  el.textContent = `${rounded}\u202f%`;
  el.className = `total-pct ${rounded === 100 ? 'good' : rounded > 100 ? 'over' : 'neutral'}`;
  document.getElementById('simulate-btn').disabled = rounded !== 100;
}

function updateSuggestion() {
  const riskEl = document.querySelector('input[name="risk"]:checked');
  if (!riskEl) return;
  const s   = SUGGESTIONS[riskEl.value];
  const bar = document.getElementById('allocation-suggestions');
  if (!bar || !s) return;

  // Construction DOM sans innerHTML direct
  bar.textContent = '';
  const strong = document.createElement('strong');
  strong.textContent = `${s.label}\u202f: `;
  bar.appendChild(strong);

  Object.entries(s.alloc).forEach(([id, pct], i) => {
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) return;
    if (i > 0) bar.appendChild(document.createTextNode('\u00a0|\u00a0'));
    bar.appendChild(document.createTextNode(`${p.icon} ${p.name} `));
    const b = document.createElement('strong');
    b.textContent = `${pct}\u202f%`;
    bar.appendChild(b);
  });
}

function validateAllocations() {
  const total = Object.values(state.allocations).reduce((a, b) => a + b, 0);
  if (Math.round(total) !== 100) {
    showError(`L'allocation doit totaliser 100\u202f% (actuellement ${Math.round(total)}\u202f%).`);
    return false;
  }
  return true;
}

// ----------------------------------------------------------------
// 8. MOTEUR MONTE CARLO — MBG
// ----------------------------------------------------------------
const N_SIMS = 10_000;

/**
 * Transformation de Box-Muller : génère une variable N(0,1).
 * Boucle while pour éviter log(0) si Math.random() retourne 0.
 */
function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Simule une trajectoire de portefeuille par MBG (pas mensuel).
 * @returns {number[]} Valeurs annuelles [V0, V1, …, VT]
 */
function simulatePath(capital, mu, sigma, horizon, mensuel) {
  const dt    = 1 / 12;
  const steps = Math.round(horizon * 12);
  let V = capital;
  const yearly = [capital];
  let monthInYear = 0;

  for (let i = 0; i < steps; i++) {
    V = V * Math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * randn());
    V += mensuel;
    monthInYear++;
    if (monthInYear === 12) {
      yearly.push(V);
      monthInYear = 0;
    }
  }
  if (yearly.length < horizon + 1) yearly.push(V);
  return yearly;
}

/**
 * Calcule le rendement moyen et la volatilité du portefeuille mixte.
 * Volatilité globale = racine carrée de la somme des variances pondérées — actifs supposés indépendants (borne haute du risque réel).
 */
function blendedParams(allocations) {
  let mu   = 0;
  let varP = 0;

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

/** Retourne le percentile p (0–100) d'un tableau trié croissant */
function pctile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

// ----------------------------------------------------------------
// 9. LANCEMENT DE LA SIMULATION (asynchrone — ne bloque pas l'UI)
// ----------------------------------------------------------------

async function runSimulation() {
  if (!validateAllocations()) return;
  if (!readStep1()) return;

  showLoading();

  // Donne la main au navigateur pour afficher l'overlay avant le calcul intensif
  await new Promise(r => setTimeout(r, 60));

  try {
    const { mu, sigma }        = blendedParams(state.allocations);
    const { capital, horizon, mensuel } = state;
    const totalInvested        = capital + mensuel * 12 * horizon;

    const finalValues   = new Float64Array(N_SIMS);
    const allPaths      = [];
    const pctPaths      = { p10: [], p25: [], p50: [], p75: [], p90: [] };

    for (let i = 0; i < N_SIMS; i++) {
      const path = simulatePath(capital, mu, sigma, horizon, mensuel);
      finalValues[i] = path[path.length - 1];
      allPaths.push(path);
    }

    // Tri des valeurs finales (copie Array pour sort natif)
    const sortedFinals = Array.from(finalValues).sort((a, b) => a - b);

    // Percentiles par année
    for (let t = 0; t <= horizon; t++) {
      const vals = allPaths.map(p => p[t]).sort((a, b) => a - b);
      pctPaths.p10.push(pctile(vals, 10));
      pctPaths.p25.push(pctile(vals, 25));
      pctPaths.p50.push(pctile(vals, 50));
      pctPaths.p75.push(pctile(vals, 75));
      pctPaths.p90.push(pctile(vals, 90));
    }

    const lossCount         = sortedFinals.filter(v => v < capital).length;
    const probLoss          = lossCount / N_SIMS;
    const lossInvestedCount = sortedFinals.filter(v => v < totalInvested).length;
    const probLossInvested  = lossInvestedCount / N_SIMS;

    state.simResults = {
      mu, sigma, totalInvested,
      finalValues: sortedFinals,
      pctPaths,
      probLoss, probLossInvested,
      p10: pctile(sortedFinals, 10),
      p25: pctile(sortedFinals, 25),
      p50: pctile(sortedFinals, 50),
      p75: pctile(sortedFinals, 75),
      p90: pctile(sortedFinals, 90),
    };

    renderResults();
    activateTab('kpi');
    goToStep(3);

  } catch (err) {
    // Pas d'exposition du stack trace à l'utilisateur
    console.error('Simulation error:', err);
    showError('Une erreur est survenue pendant la simulation. Vérifiez vos paramètres et réessayez.');
  } finally {
    hideLoading();
  }
}

// ----------------------------------------------------------------
// 10. RENDU DES RÉSULTATS
// ----------------------------------------------------------------

function renderResults() {
  const {
    mu, sigma, probLoss, probLossInvested,
    p10, p50, p90, finalValues, pctPaths, totalInvested,
  } = state.simResults;
  const { capital, horizon, mensuel } = state;

  // Sous-titre
  const subtitle = document.getElementById('sim-subtitle');
  subtitle.textContent =
    `Capital : ${fmt(capital)} — Horizon : ${horizon} ans — ` +
    `Versements : ${fmt(mensuel)}/mois — Rdt moy. : ${fmtPct(mu)} — Volatilité : ${fmtPct(sigma)}`;

  // KPIs
  document.getElementById('kpi-loss').textContent     = fmtPct(probLoss);
  document.getElementById('kpi-loss-sub').textContent =
    `(capital initial : ${fmt(capital)})`;

  document.getElementById('kpi-median').textContent     = fmt(p50);
  document.getElementById('kpi-median-sub').textContent =
    `+${fmtPct((p50 / capital - 1))} vs capital initial`;

  document.getElementById('kpi-p90').textContent     = fmt(p90);
  document.getElementById('kpi-p90-sub').textContent = `10\u202f% des simulations au-dessus`;

  document.getElementById('kpi-p10').textContent     = fmt(p10);
  document.getElementById('kpi-p10-sub').textContent = `10\u202f% des simulations en-dessous`;

  // Graphiques
  renderGauge(probLoss);
  renderHistogram(finalValues, capital);
  renderFanChart(pctPaths, horizon, capital);
  renderDonut();
  renderTable(capital, horizon, mensuel);
  renderExplainer(probLoss, probLossInvested, mu, sigma);
}

// ── Gauge ──────────────────────────────────────────────────────
function renderGauge(probLoss) {
  const ctx = document.getElementById('gauge-chart').getContext('2d');
  if (charts.gauge) { charts.gauge.destroy(); charts.gauge = null; }

  const pct   = Math.min(Math.max(probLoss, 0), 1);
  const color = pct < 0.1 ? '#16a34a' : pct < 0.3 ? '#d97706' : '#dc2626';

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
        legend:  { display: false },
        tooltip: { enabled: false },
      },
      cutout: '70%',
      animation: { duration: 600 },
    },
  });

  const label = pct < 0.05 ? '🟢 Très faible'
              : pct < 0.15 ? '🟡 Faible'
              : pct < 0.30 ? '🟠 Modéré'
              : pct < 0.50 ? '🔴 Élevé'
              : '⛔ Très élevé';
  document.getElementById('gauge-label').textContent = label;
}

// ── Histogramme ────────────────────────────────────────────────
function renderHistogram(finalValues, capital) {
  const ctx = document.getElementById('dist-chart').getContext('2d');
  if (charts.dist) { charts.dist.destroy(); charts.dist = null; }

  const min = finalValues[0];
  const max = finalValues[finalValues.length - 1];
  if (max === min) return;

  const BINS    = 50;
  const binSize = (max - min) / BINS;
  const counts  = new Array(BINS).fill(0);
  const labels  = Array.from({ length: BINS }, (_, i) => min + i * binSize);

  finalValues.forEach(v => {
    const idx = Math.min(BINS - 1, Math.floor((v - min) / binSize));
    counts[idx]++;
  });

  const colors = labels.map(l => (l + binSize / 2) < capital
    ? 'rgba(220,38,38,.7)'
    : 'rgba(37,99,235,.6)');

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
      animation: { duration: 400 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.parsed.y} simulations`,
            title: ctx => `Valeur ≈ ${ctx[0].label}`,
          },
        },
      },
      scales: {
        x: {
          ticks: {
            maxTicksLimit: 7,
            callback: (v, i) => i % 7 === 0 ? fmt(labels[i]) : '',
            font: { size: 9 },
          },
          grid: { display: false },
        },
        y: {
          ticks: { font: { size: 9 } },
          grid: { color: '#f1f5f9' },
        },
      },
    },
  });
}

// ── Fan chart ──────────────────────────────────────────────────
function renderFanChart(pctPaths, horizon, capital) {
  const ctx = document.getElementById('fan-chart').getContext('2d');
  if (charts.fan) { charts.fan.destroy(); charts.fan = null; }

  const labels = Array.from({ length: horizon + 1 }, (_, i) => `An ${i}`);

  charts.fan = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: '10e pct.',    data: pctPaths.p10, borderColor: 'rgba(220,38,38,.8)',  backgroundColor: 'rgba(0,0,0,0)', borderWidth: 1.5, borderDash: [4, 3], pointRadius: 0, fill: false, tension: 0.3 },
        { label: '25e pct.',    data: pctPaths.p25, borderColor: 'rgba(249,115,22,.6)', backgroundColor: 'rgba(249,115,22,.08)', borderWidth: 1, pointRadius: 0, fill: '+1', tension: 0.3 },
        { label: 'Médiane',     data: pctPaths.p50, borderColor: 'rgba(37,99,235,1)',   backgroundColor: 'rgba(37,99,235,.07)', borderWidth: 2.5, pointRadius: 3, fill: false, tension: 0.3 },
        { label: '75e pct.',    data: pctPaths.p75, borderColor: 'rgba(34,197,94,.6)',  backgroundColor: 'rgba(34,197,94,.08)', borderWidth: 1, pointRadius: 0, fill: '-1', tension: 0.3 },
        { label: '90e pct.',    data: pctPaths.p90, borderColor: 'rgba(22,163,74,.8)',  backgroundColor: 'rgba(0,0,0,0)', borderWidth: 1.5, borderDash: [4, 3], pointRadius: 0, fill: false, tension: 0.3 },
        { label: 'Capital initial', data: Array(horizon + 1).fill(capital), borderColor: 'rgba(100,116,139,.45)', borderWidth: 1, borderDash: [6, 4], pointRadius: 0, fill: false },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'bottom', labels: { font: { size: 10 }, boxWidth: 18 } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } },
      },
      scales: {
        x: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 9 } } },
        y: {
          grid: { color: '#f1f5f9' },
          ticks: { font: { size: 9 }, callback: v => v >= 1000 ? `${(v / 1000).toFixed(0)}k\u202f€` : `${v}\u202f€` },
        },
      },
    },
  });
}

// ── Donut ──────────────────────────────────────────────────────
function renderDonut() {
  const ctx = document.getElementById('donut-chart').getContext('2d');
  if (charts.donut) { charts.donut.destroy(); charts.donut = null; }

  const PALETTE = ['#2563eb','#7c3aed','#16a34a','#d97706','#0891b2','#dc2626','#0d9488','#9333ea','#f59e0b','#6366f1','#ef4444'];
  const labels = [], data = [], bgColors = [];
  let ci = 0;

  for (const [id, pct] of Object.entries(state.allocations)) {
    if (!pct) continue;
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) continue;
    labels.push(`${p.icon} ${p.name}`);
    data.push(pct);
    bgColors.push(PALETTE[ci++ % PALETTE.length]);
  }

  charts.donut = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: bgColors, borderWidth: 2, borderColor: '#fff' }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.parsed}\u202f%` } },
      },
      cutout: '55%',
    },
  });
}

// ── Taux d'imposition estimé selon véhicule et horizon ────────
/**
 * Retourne le taux d'imposition applicable aux gains (PFU 2026).
 * Livret A/LDDS : 0 % (exonération totale).
 * PEA ≥ 5 ans : 18,6 % PS uniquement.
 * PEA < 5 ans : PFU 31,4 % (12,8 % IR + 18,6 % PS).
 * AV ≥ 8 ans : 24,7 % (7,5 % IR + 17,2 % PS).
 * AV < 8 ans : PFU 30 %.
 * CTO : PFU 31,4 %.
 */
function getTaxRate(vehicle, horizon) {
  switch (vehicle) {
    case 'Livret': return 0;
    case 'PEA':    return horizon >= 5 ? 0.186 : 0.314;
    case 'AV':     return horizon >= 8 ? 0.247 : 0.30;
    case 'CTO':    return 0.314;
    default:       return 0.314;
  }
}

// ── Table détail ───────────────────────────────────────────────
function renderTable(capital, horizon, mensuel) {
  const tbody = document.querySelector('#detail-table tbody');
  tbody.textContent = ''; // sûr vs innerHTML = ''

  let totalBrut  = 0;
  let totalImpot = 0;
  let totalNette = 0;

  for (const [id, pct] of Object.entries(state.allocations)) {
    if (!pct) continue;
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) continue;

    const w          = pct / 100;
    const capInv     = capital * w + mensuel * w * 12 * horizon;
    const { p50 }    = singleProductSim(capital * w, p.mu, p.sigma, horizon, mensuel * w);
    const taxRate    = getTaxRate(p.vehicle, horizon);
    const gainBrut   = Math.max(0, p50 - capInv);
    const impot      = gainBrut * taxRate;
    const valNette   = p50 - impot;   // = capInv + gainBrut - impot

    totalBrut  += p50;
    totalImpot += impot;
    totalNette += valNette;

    const tr = document.createElement('tr');

    const mkTd = (text, align) => {
      const td = document.createElement('td');
      td.textContent = text;
      if (align) td.style.textAlign = align;
      return td;
    };

    const tdSupport = document.createElement('td');
    const b = document.createElement('b');
    b.textContent = `${p.icon} ${p.name}`;
    tdSupport.appendChild(b);

    const tdVehicle = document.createElement('td');
    const sp = document.createElement('span');
    sp.className = `product-vehicle ${vehicleClass(p.vehicle)}`;
    sp.textContent = p.vehicleLabel;
    tdVehicle.appendChild(sp);

    tr.appendChild(tdSupport);
    tr.appendChild(tdVehicle);
    tr.appendChild(mkTd(`${pct}\u202f%`, 'center'));
    tr.appendChild(mkTd(fmtPct(p.mu), 'center'));
    tr.appendChild(mkTd(fmtPct(p.sigma), 'center'));
    tr.appendChild(mkTd(fmt(p50), 'right'));
    tr.appendChild(mkTd(gainBrut > 0 ? fmt(gainBrut) : '—', 'right'));
    const tdImpot = mkTd(impot > 0 ? fmt(impot) : `${(taxRate * 100).toFixed(1)}\u202f% → 0\u202f€`, 'right');
    if (impot > 0) tdImpot.title = `Taux : ${(taxRate * 100).toFixed(1)}\u202f%`;
    tr.appendChild(tdImpot);
    const tdNette = mkTd(fmt(valNette), 'right');
    tdNette.style.fontWeight = '700';
    tr.appendChild(tdNette);

    tbody.appendChild(tr);
  }

  // Ligne TOTAL
  const trTotal = document.createElement('tr');
  trTotal.className = 'table-total-row';
  const mkTotalTd = (text, align, bold) => {
    const td = document.createElement('td');
    td.textContent = text;
    if (align) td.style.textAlign = align;
    if (bold) td.style.fontWeight = '700';
    return td;
  };
  const tdTotalLabel = document.createElement('td');
  tdTotalLabel.colSpan = 2;
  const bTotal = document.createElement('b');
  bTotal.textContent = 'TOTAL';
  tdTotalLabel.appendChild(bTotal);
  trTotal.appendChild(tdTotalLabel);
  trTotal.appendChild(mkTotalTd('100\u202f%', 'center', true));
  trTotal.appendChild(mkTotalTd('', 'center', false));
  trTotal.appendChild(mkTotalTd('', 'center', false));
  trTotal.appendChild(mkTotalTd(fmt(totalBrut), 'right', true));
  trTotal.appendChild(mkTotalTd(fmt(totalBrut - (capital + mensuel * 12 * horizon)), 'right', true));
  trTotal.appendChild(mkTotalTd(fmt(totalImpot), 'right', true));
  trTotal.appendChild(mkTotalTd(fmt(totalNette), 'right', true));
  tbody.appendChild(trTotal);
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

// ── Explainer ──────────────────────────────────────────────────
function renderExplainer(probLoss, probLossInvested, mu, sigma) {
  const { capital, horizon, mensuel, simResults } = state;
  const { p10, p50, p90 } = simResults;

  const levels = [
    { max: 0.05, label: 'Très faible', cssClass: 'risk-text-vlow',  advice: 'Votre portefeuille présente un risque de perte en capital très limité. Profil adapté aux investisseurs privilégiant la sécurité.' },
    { max: 0.15, label: 'Faible',      cssClass: 'risk-text-low',   advice: "Le risque est contenu. L'horizon et la diversification protègent bien votre capital." },
    { max: 0.30, label: 'Modéré',      cssClass: 'risk-text-mod',   advice: 'Une part non négligeable des scénarios peut conduire à une perte. Vérifiez que votre horizon est suffisamment long.' },
    { max: 0.50, label: 'Élevé',       cssClass: 'risk-text-high',  advice: 'Risque significatif. Renforcez la part de produits garantis ou allongez votre horizon si possible.' },
    { max: Infinity, label: 'Très élevé', cssClass: 'risk-text-vhigh', advice: "Plus d'une simulation sur deux aboutit à une perte. Reconsidérez votre allocation ou votre horizon." },
  ];

  const lvl = levels.find(l => probLoss < l.max);
  const totalInvested = capital + mensuel * 12 * horizon;

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

  const items = [
    `Probabilité de ne pas récupérer le capital initial (${fmt(capital)}) : ${fmtPct(probLoss)}`,
    `Probabilité de ne pas récupérer le total investi (${fmt(totalInvested)}) : ${fmtPct(probLossInvested)}`,
    `Rendement annuel moyen du portefeuille : ${fmtPct(mu)}`,
    `Volatilité annuelle globale du portefeuille : ${fmtPct(sigma)}`,
    `Fourchette à ${horizon} ans : de ${fmt(p10)} (pessimiste) à ${fmt(p90)} (optimiste) — médiane ${fmt(p50)}`,
    `Méthode : Mouvement Brownien Géométrique, ${N_SIMS.toLocaleString('fr-FR')} scénarios.`,
  ];

  const ul = document.createElement('ul');
  items.forEach(text => {
    const li = document.createElement('li');
    li.textContent = text;
    ul.appendChild(li);
  });
  container.appendChild(ul);
}

// ----------------------------------------------------------------
// 11. GESTION DES ONGLETS (step 3)
// ----------------------------------------------------------------

function activateTab(name) {
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
}

// ----------------------------------------------------------------
// 12. GÉNÉRATION PDF — PDF/A best-effort + empreinte SHA-256
// ----------------------------------------------------------------

/**
 * Calcule le SHA-256 d'une chaîne (Web Crypto API).
 * Retourne la représentation hexadécimale.
 */
async function sha256(message) {
  try {
    const buf  = new TextEncoder().encode(message);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return 'unavailable';
  }
}

/** Capture un canvas Chart.js sous forme d'image PNG (data URL) */
function captureChart(canvasId) {
  try {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    return canvas.toDataURL('image/png', 0.95);
  } catch {
    return null;
  }
}

async function generatePDF() {
  if (!state.simResults) { showError('Lancez d'abord une simulation.'); return; }
  if (!window.jspdf)     { showError('jsPDF non chargé — vérifiez votre connexion.'); return; }

  showLoading();
  await new Promise(r => setTimeout(r, 80));

  try {
    const { jsPDF } = window.jspdf;
    const { capital, horizon, mensuel, risk, simResults } = state;
    const { mu, sigma, p10, p25, p50, p75, p90, probLoss, probLossInvested, totalInvested } = simResults;

    // ── Empreinte d'authenticité ──────────────────────────────
    const docId       = Date.now().toString(36).toUpperCase();
    const fingerprint = await sha256(JSON.stringify({ capital, horizon, mensuel, risk, p50, mu, sigma, ts: docId }));

    // ── Initialisation jsPDF ──────────────────────────────────
    const doc = new jsPDF({
      orientation: 'portrait',
      unit:        'mm',
      format:      'a4',
      putOnlyUsedFonts: true,
      compress:    true,
    });

    // ── Métadonnées PDF/A-1b (best-effort) ───────────────────
    const now   = new Date();
    const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    doc.setProperties({
      title:    'SimuPortefeuille — Rapport de simulation',
      subject:  'Simulation Monte Carlo de portefeuille financier',
      author:   'SimuPortefeuille',
      keywords: 'simulation, portefeuille, Monte Carlo, MBG, risque, finance',
      creator:  'SimuPortefeuille v2 — jsPDF 2.5.1',
    });
    doc.setLanguage('fr-FR');

    // ── Dimensions A4 ─────────────────────────────────────────
    const W  = 210;  // mm
    const H  = 297;  // mm
    const ML = 14;   // marge gauche
    const MR = 14;   // marge droite
    const CW = W - ML - MR; // largeur contenu

    const NAVY  = [28,  48,  83];
    const GOLD  = [197, 160,  40];
    const WHITE = [255, 255, 255];
    const LIGHT = [245, 247, 250];
    const MUTED = [100, 116, 139];
    const TEXT  = [30,  41,  59];

    let page = 1;
    let pageCount = 5; // estimation

    // ── Helpers pagination ─────────────────────────────────────
    function header() {
      doc.setFillColor(...NAVY);
      doc.rect(0, 0, W, 16, 'F');
      doc.setFillColor(...GOLD);
      doc.rect(0, 16, W, 1.2, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...WHITE);
      doc.text('SimuPortefeuille', ML, 11);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text('Rapport de simulation financière', W / 2, 11, { align: 'center' });
      doc.text(dateStr, W - MR, 11, { align: 'right' });
    }

    function footer(pg) {
      doc.setFillColor(...LIGHT);
      doc.rect(0, H - 13, W, 13, 'F');
      doc.setDrawColor(220, 228, 240);
      doc.setLineWidth(0.3);
      doc.line(0, H - 13, W, H - 13);

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text('Simulation à titre indicatif — pas un conseil en investissement.', W / 2, H - 7, { align: 'center' });
      doc.text(`Page ${pg}`, W - MR, H - 4, { align: 'right' });
      doc.text(`Réf. ${docId}`, ML, H - 4);
    }

    /** Vérifie si on a assez de place, sinon newPage */
    function checkY(y, needed) {
      if (y + needed > H - 18) {
        doc.addPage();
        page++;
        header();
        footer(page);
        return 22;
      }
      return y;
    }

    function sectionTitle(y, text) {
      y = checkY(y, 12);
      doc.setFillColor(...NAVY);
      doc.rect(ML, y, CW, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...WHITE);
      doc.text(text, ML + 3, y + 5);
      return y + 10;
    }

    // ═══════════════════════════════════════════════════════════
    // PAGE 1 — Couverture
    // ═══════════════════════════════════════════════════════════
    header();
    footer(1);

    // Bloc titre
    doc.setFillColor(...NAVY);
    doc.roundedRect(ML, 22, CW, 38, 4, 4, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...GOLD);
    doc.text('RAPPORT DE SIMULATION', W / 2, 36, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...WHITE);
    doc.text('Portefeuille financier — Analyse Monte Carlo', W / 2, 44, { align: 'center' });
    doc.text(`Généré le ${dateStr}`, W / 2, 51, { align: 'center' });

    // Paramètres de simulation
    let y = 68;
    y = sectionTitle(y, 'PARAMÈTRES DE LA SIMULATION');

    doc.autoTable({
      startY: y,
      head: [['Paramètre', 'Valeur']],
      body: [
        ['Capital initial', fmt(capital)],
        ['Horizon de placement', `${horizon} ans`],
        ['Versements mensuels', fmt(mensuel) + '/mois'],
        ['Capital total investi', fmt(totalInvested)],
        ['Profil de risque', risk.charAt(0).toUpperCase() + risk.slice(1)],
        ['Rendement annuel moyen du portefeuille', fmtPct(mu)],
        ['Volatilité annuelle du portefeuille', fmtPct(sigma)],
        ['Nombre de simulations', N_SIMS.toLocaleString('fr-FR')],
        ['Modèle', 'Mouvement Brownien Géométrique (MBG)'],
      ],
      theme: 'grid',
      headStyles:   { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
      bodyStyles:   { fontSize: 8, textColor: TEXT },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 75 }, 1: { cellWidth: 'auto' } },
      margin: { left: ML, right: MR },
    });

    y = doc.lastAutoTable.finalY + 8;

    // Allocation
    y = checkY(y, 12);
    y = sectionTitle(y, 'ALLOCATION DU PORTEFEUILLE');

    const allocRows = Object.entries(state.allocations)
      .filter(([, pct]) => pct > 0)
      .map(([id, pct]) => {
        const p = PRODUCTS.find(x => x.id === id);
        return p ? [p.name, p.vehicleLabel, `${pct} %`, fmtPct(p.mu), fmtPct(p.sigma)] : null;
      })
      .filter(Boolean);

    doc.autoTable({
      startY: y,
      head: [['Support', 'Véhicule', 'Alloc.', 'Rdt/an', 'Volatilité']],
      body: allocRows,
      foot: [['TOTAL', '', '100 %', '', '']],
      theme: 'grid',
      headStyles:   { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles:   { fontSize: 7.5, textColor: TEXT },
      footStyles:   { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: { 0: { cellWidth: 65 }, 1: { cellWidth: 35 }, 2: { cellWidth: 18, halign: 'center' }, 3: { cellWidth: 20, halign: 'center' }, 4: { cellWidth: 20, halign: 'center' } },
      margin: { left: ML, right: MR },
    });

    // ═══════════════════════════════════════════════════════════
    // PAGE 2 — Indicateurs clés
    // ═══════════════════════════════════════════════════════════
    doc.addPage(); page++;
    header(); footer(page);

    y = 22;
    y = sectionTitle(y, 'INDICATEURS CLÉS DE PERFORMANCE');

    // KPI boxes 2×2
    const kpiData = [
      { label: 'Valeur médiane (P50)',       value: fmt(p50),         color: [8, 145, 178] },
      { label: 'Probabilité de perte',        value: fmtPct(probLoss), color: [220, 38, 38] },
      { label: 'Scénario optimiste (P90)',    value: fmt(p90),         color: [22, 163, 74] },
      { label: 'Scénario pessimiste (P10)',   value: fmt(p10),         color: [217, 119, 6] },
    ];

    const bw = (CW - 6) / 2;
    const bh = 22;
    kpiData.forEach((k, i) => {
      const bx = ML + (i % 2) * (bw + 6);
      const by = y  + Math.floor(i / 2) * (bh + 4);
      doc.setFillColor(...k.color);
      doc.roundedRect(bx, by, bw, bh, 3, 3, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...WHITE);
      doc.text(k.label, bx + 4, by + 6.5);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text(k.value, bx + 4, by + 16);
    });

    y += 2 * (bh + 4) + 8;

    // Distribution des percentiles
    y = checkY(y, 12);
    y = sectionTitle(y, 'DISTRIBUTION DES PERCENTILES');

    doc.autoTable({
      startY: y,
      head: [['Percentile', 'Signification', 'Valeur finale']],
      body: [
        ['P10', '10 % des scénarios sont inférieurs',     fmt(p10)],
        ['P25', '25 % des scénarios sont inférieurs',     fmt(p25)],
        ['P50', 'Médiane — résultat le plus probable',    fmt(p50)],
        ['P75', '75 % des scénarios sont inférieurs',     fmt(p75)],
        ['P90', '90 % des scénarios sont inférieurs',     fmt(p90)],
      ],
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
      bodyStyles:  { fontSize: 8, textColor: TEXT },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: { 0: { cellWidth: 22, halign: 'center', fontStyle: 'bold' }, 1: { cellWidth: 115 }, 2: { cellWidth: 35, halign: 'right' } },
      margin: { left: ML, right: MR },
    });

    y = doc.lastAutoTable.finalY + 8;

    // Risques
    y = checkY(y, 12);
    y = sectionTitle(y, 'ANALYSE DU RISQUE');

    const riskLevels = [[0.05,'Très faible'],[0.15,'Faible'],[0.30,'Modéré'],[0.50,'Élevé'],[1,'Très élevé']];
    const riskLabel  = riskLevels.find(([max]) => probLoss < max)[1];

    doc.autoTable({
      startY: y,
      head: [['Indicateur', 'Valeur']],
      body: [
        ['Niveau de risque global', riskLabel],
        ["Proba. de ne pas récupérer le capital initial", fmtPct(probLoss)],
        ["Proba. de ne pas récupérer le total investi",   fmtPct(probLossInvested)],
      ],
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
      bodyStyles:  { fontSize: 8, textColor: TEXT },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 115 } },
      margin: { left: ML, right: MR },
    });

    // ═══════════════════════════════════════════════════════════
    // PAGE 3 — Graphiques
    // ═══════════════════════════════════════════════════════════
    doc.addPage(); page++;
    header(); footer(page);

    y = 22;
    y = sectionTitle(y, 'TRAJECTOIRES — ENVELOPPE DE PERCENTILES');

    const fanImg  = captureChart('fan-chart');
    const distImg = captureChart('dist-chart');
    const donutImg = captureChart('donut-chart');

    if (fanImg) {
      doc.addImage(fanImg, 'PNG', ML, y, CW, 70);
      y += 74;
    }

    if (distImg) {
      y = checkY(y, 12);
      y = sectionTitle(y, 'DISTRIBUTION DES VALEURS FINALES (10 000 SIMULATIONS)');
      doc.addImage(distImg, 'PNG', ML, y, CW * 0.65, 55);
      if (donutImg) {
        doc.addImage(donutImg, 'PNG', ML + CW * 0.68, y, CW * 0.32, 55);
      }
      y += 59;
    }

    // ═══════════════════════════════════════════════════════════
    // PAGE 4 — Détail produit par produit
    // ═══════════════════════════════════════════════════════════
    doc.addPage(); page++;
    header(); footer(page);

    y = 22;
    y = sectionTitle(y, 'DÉTAIL PAR SUPPORT D\'INVESTISSEMENT');

    let pdfTotalBrut  = 0;
    let pdfTotalImpot = 0;
    let pdfTotalNette = 0;

    const detailRows = Object.entries(state.allocations)
      .filter(([, pct]) => pct > 0)
      .map(([id, pct]) => {
        const p = PRODUCTS.find(x => x.id === id);
        if (!p) return null;
        const w        = pct / 100;
        const capInv   = capital * w + mensuel * w * 12 * horizon;
        const { p50: med } = singleProductSim(capital * w, p.mu, p.sigma, horizon, mensuel * w);
        const taxRate  = getTaxRate(p.vehicle, horizon);
        const gainBrut = Math.max(0, med - capInv);
        const impot    = gainBrut * taxRate;
        const nette    = med - impot;
        pdfTotalBrut  += med;
        pdfTotalImpot += impot;
        pdfTotalNette += nette;
        return [
          p.name,
          p.vehicleLabel,
          `${pct} %`,
          fmtPct(p.mu),
          fmtPct(p.sigma),
          fmt(med),
          gainBrut > 0 ? fmt(gainBrut) : '—',
          impot > 0 ? `${fmt(impot)} (${(taxRate * 100).toFixed(1)} %)` : `0 € (exo.)`,
          fmt(nette),
        ];
      })
      .filter(Boolean);

    doc.autoTable({
      startY: y,
      head: [['Support', 'Véhicule', 'Alloc.', 'Rdt/an', 'Volatilité', 'Val. brute', 'Gain brut', 'Impôt est.', 'Val. nette']],
      body: detailRows,
      foot: [['TOTAL', '', '100 %', '', '', fmt(pdfTotalBrut), fmt(pdfTotalBrut - (capital + mensuel * 12 * horizon)), fmt(pdfTotalImpot), fmt(pdfTotalNette)]],
      theme: 'grid',
      headStyles:   { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 6.5 },
      bodyStyles:   { fontSize: 6.5, textColor: TEXT },
      footStyles:   { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 6.5 },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: {
        0: { cellWidth: 36 },
        1: { cellWidth: 22 },
        2: { cellWidth: 12, halign: 'center' },
        3: { cellWidth: 14, halign: 'center' },
        4: { cellWidth: 16, halign: 'center' },
        5: { cellWidth: 20, halign: 'right' },
        6: { cellWidth: 18, halign: 'right' },
        7: { cellWidth: 22, halign: 'right' },
        8: { cellWidth: 22, halign: 'right' },
      },
      margin: { left: ML, right: MR },
    });

    y = doc.lastAutoTable.finalY + 8;

    // ── Fiscalité indicative ──────────────────────────────────
    y = checkY(y, 12);
    y = sectionTitle(y, 'RÉGIME FISCAL INDICATIF PAR VÉHICULE');

    doc.autoTable({
      startY: y,
      head: [['Véhicule', 'Régime fiscal 2026', 'Taux sur gains']],
      body: [
        ['Livret A / LDDS',       'Exonération totale IR + prélèvements sociaux',                                        '0 %'],
        ['PEA ≥ 5 ans',           'Prélèvements sociaux uniquement (IR exonéré) — LFSS 2026',                            '18,6 %'],
        ['PEA < 5 ans',           'PFU (Prélèvement Forfaitaire Unique) — IR + prélèvements sociaux',                    '31,4 %'],
        ['Assurance-vie ≥ 8 ans', 'IR réduit + prélèvements sociaux après abattement (4 600 €/pers. ou 9 200 €/couple)', '24,7 %'],
        ['Assurance-vie < 8 ans', 'PFU complet — IR + prélèvements sociaux',                                            '30,0 %'],
        ['CTO',                   'PFU 2026 — IR + prélèvements sociaux (hausse CSG LFSS 2026)',                         '31,4 %'],
      ],
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles:  { fontSize: 7, textColor: TEXT },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: { 0: { cellWidth: 42, fontStyle: 'bold' }, 1: { cellWidth: 110 }, 2: { cellWidth: 20, halign: 'center', fontStyle: 'bold' } },
      margin: { left: ML, right: MR },
    });

    // ═══════════════════════════════════════════════════════════
    // PAGE 5 — Avertissements & Empreinte d'authenticité
    // ═══════════════════════════════════════════════════════════
    doc.addPage(); page++;
    header(); footer(page);

    y = 22;
    y = sectionTitle(y, 'AVERTISSEMENTS RÉGLEMENTAIRES');

    const warnings = [
      "Ce document est produit à titre purement informatif et pédagogique. Il ne constitue pas un conseil en investissement au sens de la directive MIF II.",
      "Les performances passées ne préjugent pas des performances futures. Les projections résultent d'un modèle stochastique et ne constituent pas des garanties.",
      "Le Mouvement Brownien Géométrique suppose des rendements log-normalement distribués et une volatilité constante, ce qui représente une approximation simplifiée de la réalité des marchés.",
      "Les paramètres de rendement moyen et de volatilité utilisés sont des estimations basées sur des données historiques moyennes et peuvent différer significativement sur votre horizon d'investissement.",
      "La corrélation entre actifs n'est pas modélisée dans cette version — la volatilité globale est estimée comme la racine carrée de la somme des variances pondérées (borne haute du risque réel).",
      "Avant toute décision d'investissement, consultez un conseiller en gestion de patrimoine (CGP) agréé par l'AMF.",
    ];

    doc.autoTable({
      startY: y,
      body: warnings.map((w, i) => [`${i + 1}.`, w]),
      theme: 'plain',
      bodyStyles: { fontSize: 7.5, textColor: TEXT, cellPadding: { top: 2, bottom: 2, left: 2, right: 4 } },
      columnStyles: { 0: { cellWidth: 8, fontStyle: 'bold', valign: 'top' } },
      margin: { left: ML, right: MR },
    });

    y = doc.lastAutoTable.finalY + 10;

    // ── Bloc d'authenticité ───────────────────────────────────
    y = checkY(y, 50);
    y = sectionTitle(y, 'CERTIFICAT D\'AUTHENTICITÉ DU DOCUMENT');

    doc.setFillColor(...LIGHT);
    doc.roundedRect(ML, y, CW, 42, 3, 3, 'F');
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.4);
    doc.roundedRect(ML, y, CW, 42, 3, 3, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...NAVY);
    doc.text('Empreinte numérique SHA-256 (paramètres de simulation)', ML + 4, y + 7);

    // Hash affiché en 2 lignes pour tenir dans la largeur
    const hashLine1 = fingerprint.slice(0, 32);
    const hashLine2 = fingerprint.slice(32);
    doc.setFont('courier', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT);
    doc.text(hashLine1, ML + 4, y + 14);
    doc.text(hashLine2, ML + 4, y + 20);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(`Référence document : ${docId}`, ML + 4, y + 28);
    doc.text(`Date de génération : ${now.toISOString().replace('T', ' ').slice(0, 19)} UTC`, ML + 4, y + 34);
    doc.text('Produit par : SimuPortefeuille v2 — Application cliente (aucune donnée transmise)', ML + 4, y + 40);

    // ── Numérotation finale corrigée ──────────────────────────
    // Repassage des pages pour corriger le total de pages
    // (non nécessaire avec jsPDF car on connaît le nombre de pages)

    // ── Sauvegarde ────────────────────────────────────────────
    const filename = `SimuPortefeuille_${risk}_${horizon}ans_${docId}.pdf`;
    doc.save(filename);

  } catch (err) {
    console.error('PDF generation error:', err);
    showError('Erreur lors de la génération du PDF. Réessayez ou contactez le support.');
  } finally {
    hideLoading();
  }
}

// ----------------------------------------------------------------
// 13. STYLES DYNAMIQUES — classes CSS (évite les inline styles)
// ----------------------------------------------------------------
(function injectRiskStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .risk-text-vlow  { color: #16a34a; }
    .risk-text-low   { color: #65a30d; }
    .risk-text-mod   { color: #d97706; }
    .risk-text-high  { color: #f97316; }
    .risk-text-vhigh { color: #dc2626; }
  `;
  document.head.appendChild(style);
})();

// ----------------------------------------------------------------
// 14. INITIALISATION — event listeners (pas d'inline handlers)
// ----------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {

  // Sliders
  linkSlider('capital-slider', 'capital',  100,    1_000_000);
  linkSlider('horizon-slider', 'horizon',  1,      30);
  linkSlider('mensuel-slider', 'mensuel',  0,      10_000);

  // Navigation étape 1 → 2
  document.getElementById('btn-step1-next').addEventListener('click', () => goToStep(2));

  // Navigation étape 2
  document.getElementById('btn-step2-back').addEventListener('click', () => goToStep(1));
  document.getElementById('simulate-btn').addEventListener('click',   () => runSimulation());

  // Navigation étape 3
  document.getElementById('btn-step3-back').addEventListener('click',    () => goToStep(2));
  document.getElementById('btn-step3-restart').addEventListener('click', () => goToStep(1));
  document.getElementById('btn-pdf').addEventListener('click',           () => generatePDF());

  // Onglets step 3
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });

  // Profil de risque : met à jour la suggestion
  document.querySelectorAll('input[name="risk"]').forEach(r => {
    r.addEventListener('change', () => updateSuggestion());
  });

  // Fermer le banner d'erreur au clic
  document.getElementById('error-banner').addEventListener('click', hideError);

  // Initialise la barre de suggestion
  updateSuggestion();
});
