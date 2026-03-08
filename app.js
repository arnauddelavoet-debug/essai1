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

// ================================================================
// 0. CONFIGURATION GLOBALE — taux réglementés 2026 & sources
// ================================================================
const CONFIG_DEFAULTS = {
  livretA:    0.015,   // Livret A / LDDS  — 01/02/2026
  ldds:       0.015,
  lep:        0.025,   // LEP — 01/02/2026
  fondsEuro:  0.026,   // Fonds euros AV — rendement moyen marché 2024
  scpiTD:     0.0472,  // SCPI — TD moyen 2024 (ASPIM-IEIF)
  psMobilier: 0.186,   // PS revenus mobiliers 2026 (LFSS n°2025-1403)
  psAV:       0.172,   // PS assurance-vie (inchangé)
  psPEAgt5:   0.186,   // PS PEA ≥ 5 ans (LFSS 2026 s'applique)
  pfuIR:      0.128,   // IR flat-tax PFU
  avIR8:      0.075,   // IR réduit AV ≥ 8 ans
  avPFU:      0.300,   // PFU AV < 8 ans
  avAbattSingle: 4600,
  avAbattCouple: 9200,
};

let CONFIG = { ...CONFIG_DEFAULTS };

Object.defineProperties(CONFIG, {
  pfuTotal:   { get() { return this.pfuIR + this.psMobilier; }, enumerable: true },
  avTotal8:   { get() { return this.avIR8 + this.psAV;       }, enumerable: true },
});

const CONFIG_SOURCES = [
  { id: 'livret-bdf',  label: 'Livret A / LDDS — Taux',            detail: '1,50 % depuis 01/02/2026',                  url: 'https://www.economie.gouv.fr/actualites/epargne-reglementee-de-nouveaux-taux-pour-le-livret-et-le-lep-au-1er-fevrier-2026', date: '2026-02-01' },
  { id: 'lep-bdf',     label: 'LEP — Taux réglementé',              detail: '2,50 % depuis 01/02/2026',                  url: 'https://www.economie.gouv.fr/particuliers/lep-livret-epargne-populaire', date: '2026-02-01' },
  { id: 'ps-2026',     label: 'Prélèvements sociaux 2026',          detail: '18,6 % mobilier — 17,2 % AV (LFSS 2026)',   url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F2329', date: '2026-01-01' },
  { id: 'pfu-2026',    label: 'PFU 2026 (Flat Tax)',                detail: '31,4 % = 12,8 % IR + 18,6 % PS',           url: 'https://entreprendre.service-public.gouv.fr/actualites/A18796', date: '2026-01-01' },
  { id: 'lfss-2026',   label: 'LFSS 2026 — Hausse CSG',            detail: 'Loi n°2025-1403 du 30/12/2025',             url: 'https://www.banquetransatlantique.com/fr/actualites/loi-de-financement-de-la-securite-sociale-pour-2026-hausse-de-la-CSG.html', date: '2026-01-01' },
  { id: 'ir-2026',     label: 'Barème IR 2026',                     detail: '0 / 11 / 30 / 41 / 45 % (LFI 2026)',       url: 'https://www.service-public.gouv.fr/particuliers/actualites/A18045', date: '2026-02-19' },
  { id: 'av-fisca',    label: 'Assurance-vie — Fiscalité',          detail: 'Abattement 4 600 €/9 200 € après 8 ans',   url: 'https://www.economie.gouv.fr/particuliers/gerer-mon-argent/gerer-mon-budget-et-mon-epargne/quelle-est-la-fiscalite-de-lassurance', date: '2026-01-01' },
  { id: 'fonds-euro',  label: 'Fonds euros AV — Rendement 2024',   detail: 'Moyenne marché : 2,60 % (France Assureurs)', url: 'https://www.placement-direct.fr/actualites/assurance-vie-un-rendement-moyen-2024-a-260percent', date: '2025-03-26' },
  { id: 'scpi-td',     label: 'SCPI — Taux de distribution 2024',  detail: 'Moyenne ASPIM-IEIF : 4,72 %',               url: 'https://francescpi.com/meilleures-scpi/bilan-trimestriel-scpi-rendement-collecte/bilan-annuel-scpi-rendement-collecte-2024', date: '2025-01-01' },
  { id: 'srri-esma',   label: 'SRRI/SRI — Indicateurs de risque',  detail: 'Échelle 1–7 — UCITS KIID / PRIIPs KID',     url: 'https://fundkis.com/blog/priips-kid-sri.html', date: '2026-01-01' },
  { id: 'alloc-amf',   label: 'Grilles d\'allocation — Référence', detail: 'Standards MIF II — marché français',        url: 'https://www.amf-france.org/fr/espace-epargnants/comprendre-les-produits-financiers/investir-en-bourse/les-bases-de-linvestissement/profil-investisseur', date: '2026-01-01' },
  { id: 'pea-plafond', label: 'PEA — Plafond de versements',       detail: '150 000 € classique / 225 000 € PEA-PME',  url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F2385', date: '2026-01-01' },
];

// ================================================================
// 0b. GRILLES D'ALLOCATION PAR PROFIL × HORIZON
//     Source : standards marché MIF II — AMF
//     Horizon : court ≤ 3 ans | moyen 4–7 ans | long ≥ 8 ans
// ================================================================
const HORIZON_BUCKETS = ['court', 'moyen', 'long'];
const HORIZON_LABELS  = { court: '≤ 3 ans', moyen: '4–7 ans', long: '≥ 8 ans' };

function getHorizonBucket(h) {
  return h <= 3 ? 'court' : h <= 7 ? 'moyen' : 'long';
}

const ALLOC_GRIDS = {
  conservateur: {
    court: { 'livret-a': 30, 'ldds': 10, 'lep': 10, 'fonds-euro': 30, 'obligations-etat': 20 },
    moyen: { 'livret-a': 15, 'ldds': 5,  'lep': 5,  'fonds-euro': 40, 'obligations-etat': 20, 'uc-oblig': 15 },
    long:  { 'livret-a': 15, 'fonds-euro': 35, 'obligations-etat': 20, 'uc-oblig': 15, 'scpi': 15 },
  },
  modere: {
    court: { 'fonds-euro': 35, 'obligations-etat': 30, 'uc-oblig': 20, 'scpi': 15 },
    moyen: { 'fonds-euro': 20, 'uc-oblig': 15, 'scpi': 10, 'etf-europe': 30, 'etf-monde': 25 },
    long:  { 'fonds-euro': 10, 'scpi': 15, 'etf-europe': 25, 'etf-monde': 30, 'uc-actions': 20 },
  },
  dynamique: {
    court: { 'etf-monde': 35, 'etf-europe': 30, 'scpi': 20, 'uc-actions': 15 },
    moyen: { 'etf-monde': 40, 'etf-europe': 25, 'etf-emergents': 20, 'uc-actions': 15 },
    long:  { 'etf-monde': 40, 'etf-europe': 20, 'etf-emergents': 20, 'uc-actions': 15, 'crypto-btc': 5 },
  },
};

// ----------------------------------------------------------------
// 0c. PALETTE PRODUITS — couleurs partagées (stratégie + PDF)
// ----------------------------------------------------------------
const PALETTE_PRODUCTS = {
  'livret-a':         '#0891b2',
  'ldds':             '#06b6d4',
  'lep':              '#10b981',
  'fonds-euro':       '#16a34a',
  'obligations-etat': '#65a30d',
  'uc-oblig':         '#ca8a04',
  'scpi':             '#d97706',
  'etf-europe':       '#7c3aed',
  'etf-monde':        '#2563eb',
  'etf-emergents':    '#9333ea',
  'uc-actions':       '#4f46e5',
  'crypto-btc':       '#dc2626',
};

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
    mu: CONFIG.livretA,
    sigma: 0.0,
    guaranteed: true,
    minHorizon: 0,
    srri: 1,
    srriLabel: 'SRRI 1/7 — Capital garanti, aucune volatilité',
    riskProfile: ['conservateur', 'modere', 'dynamique'],
    description: 'Épargne réglementée garantie, taux 1,50 % (fév.–juil. 2026), plafond 22 950 €. Totalement exonérée d\'IR et de prélèvements sociaux.',
  },
  {
    id: 'ldds',
    name: 'LDDS',
    vehicle: 'Livret',
    vehicleLabel: 'LDDS',
    icon: '💚',
    mu: CONFIG.ldds,
    sigma: 0.0,
    guaranteed: true,
    minHorizon: 0,
    srri: 1,
    srriLabel: 'SRRI 1/7 — Capital garanti, aucune volatilité',
    riskProfile: ['conservateur', 'modere', 'dynamique'],
    description: 'Livret Développement Durable et Solidaire, taux 1,50 % (fév.–juil. 2026), plafond 12 000 €. Exonéré d\'IR et de prélèvements sociaux.',
  },
  {
    id: 'lep',
    name: 'LEP (Livret Épargne Populaire)',
    vehicle: 'Livret',
    vehicleLabel: 'LEP',
    icon: '💰',
    mu: CONFIG.lep,
    sigma: 0.0,
    guaranteed: true,
    minHorizon: 0,
    srri: 1,
    srriLabel: 'SRRI 1/7 — Capital garanti, aucune volatilité',
    riskProfile: ['conservateur', 'modere'],
    description: 'Livret d\'Épargne Populaire — meilleur taux garanti 2,50 % (fév.–juil. 2026), plafond 10 000 €. Réservé aux foyers à revenus modestes sous condition de ressources. Totalement exonéré d\'IR et de prélèvements sociaux.',
  },
  {
    id: 'fonds-euro',
    name: 'Fonds Euro Assurance-vie',
    vehicle: 'AV',
    vehicleLabel: 'Assurance-vie',
    icon: '🔒',
    mu: CONFIG.fondsEuro,
    sigma: 0.004,
    guaranteed: false,
    minHorizon: 3,
    srri: 2,
    srriLabel: 'SRRI 2/7 — Risque très faible, quasi-garanti',
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
    srri: 3,
    srriLabel: 'SRRI 3/7 — Risque faible (ETF obligations souveraines)',
    riskProfile: ['conservateur', 'modere'],
    description: 'Obligations souveraines européennes, faible risque, rendement ~3,5–4 %.',
  },
  {
    id: 'scpi',
    name: 'SCPI (Immobilier)',
    vehicle: 'CTO',
    vehicleLabel: 'CTO / AV',
    icon: '🏢',
    mu: CONFIG.scpiTD,
    sigma: 0.07,
    guaranteed: false,
    minHorizon: 8,
    srri: 3,
    srriLabel: 'SRI 3/7 — Risque modéré, illiquidité partielle',
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
    srri: 3,
    srriLabel: 'SRRI 3/7 — Risque faible à modéré',
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
    srri: 6,
    srriLabel: 'SRRI 6/7 — Risque élevé (actions zone euro)',
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
    srri: 4,
    srriLabel: 'SRRI 4/7 — Risque modéré (actions mondiales diversifiées)',
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
    srri: 6,
    srriLabel: 'SRRI 6/7 — Risque élevé (marchés émergents)',
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
    srri: 5,
    srriLabel: 'SRRI 5/7 — Risque élevé (UC actions monde)',
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
    srri: 7,
    srriLabel: 'SRI 7/7 — Risque maximal (PRIIPs), perte totale possible',
    riskProfile: ['dynamique'],
    description: 'BTC/ETH — très haute volatilité, risque de perte totale, potentiel élevé.',
  },
];

/** Allocations suggérées par profil de risque */
const SUGGESTIONS = {
  conservateur: {
    label: 'Profil conservateur recommandé',
    alloc: { 'livret-a': 30, 'ldds': 10, 'lep': 10, 'fonds-euro': 30, 'obligations-etat': 20 },
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

  // Show/hide param bar
  const paramBar = document.getElementById('param-bar');
  if (paramBar) {
    paramBar.hidden = (n === 1);
    if (n >= 2) renderParamBar();
  }

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

  // Réinitialise les allocations avec la grille du profil × horizon
  state.allocations = { ...ALLOC_GRIDS[risk][getHorizonBucket(horizon)] };

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
    const srriColor  = ['','#16a34a','#65a30d','#ca8a04','#d97706','#ea580c','#dc2626','#7f1d1d'][p.srri] || '#94a3b8';
    const pillSRRI   = `<span class="stat-pill srri" style="background:${srriColor};color:#fff" title="${p.srriLabel}">SRRI\u202f${p.srri}/7</span>`;

    // Construit le contenu du card de façon sûre via DOM
    card.innerHTML = `
      <div class="product-header">
        <span class="product-icon" aria-hidden="true"></span>
        <div class="product-info">
          <div class="product-name"></div>
          <span class="product-vehicle ${vehicleClass(p.vehicle)}"></span>
        </div>
      </div>
      <div class="product-stats">${pillReturn}${pillVol}${pillGuar}${pillMin}${pillSRRI}</div>
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
  const risk   = state.risk;
  const bucket = getHorizonBucket(state.horizon);
  const alloc  = ALLOC_GRIDS[risk][bucket];
  const bar    = document.getElementById('allocation-suggestions');
  if (!bar) return;

  // Construction DOM sans innerHTML direct
  bar.textContent = '';
  const strong = document.createElement('strong');
  const profileLabel = { conservateur: '🛡️ Conservateur', modere: '⚖️ Modéré', dynamique: '🚀 Dynamique' }[risk];
  strong.textContent = `${profileLabel} — horizon ${HORIZON_LABELS[bucket]}\u202f: `;
  bar.appendChild(strong);

  Object.entries(alloc).forEach(([id, pct], i) => {
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
  renderStrategyTab();
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

  const labels = [], data = [], bgColors = [];

  for (const [id, pct] of Object.entries(state.allocations)) {
    if (!pct) continue;
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) continue;
    labels.push(`${p.name}\u00a0${pct}\u202f%`);
    data.push(pct);
    bgColors.push(PALETTE_PRODUCTS[id] || '#94a3b8');
  }

  charts.donut = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: bgColors, borderWidth: 2, borderColor: '#fff' }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { size: 10 },
            boxWidth: 12,
            padding: 8,
            generateLabels(chart) {
              const ds = chart.data.datasets[0];
              return chart.data.labels.map((label, i) => ({
                text: label,
                fillStyle: ds.backgroundColor[i],
                strokeStyle: '#fff',
                lineWidth: 1,
                hidden: false,
                index: i,
              }));
            },
          },
        },
        tooltip: { callbacks: { label: ctx => `${ctx.label}` } },
      },
      cutout: '55%',
    },
  });
}

// ── Stratégie tab — grilles d'allocation par profil × horizon ──
// Stocke les instances Chart pour pouvoir les capturer en PDF
const _strategyCharts = {};

function renderStrategyTab() {
  const container = document.getElementById('tab-strategy');
  if (!container) return;
  container.innerHTML = '';

  // Détruit les anciens charts strategy
  Object.values(_strategyCharts).forEach(c => { try { c.destroy(); } catch (e) {} });
  Object.keys(_strategyCharts).forEach(k => delete _strategyCharts[k]);

  const section = document.createElement('div');
  section.className = 'strategy-section';

  // Source citation
  const srcNote = document.createElement('p');
  srcNote.className = 'strategy-source';
  srcNote.innerHTML = 'Grilles de référence MIF\u202fII — <a href="https://www.amf-france.org/fr/espace-epargnants/comprendre-les-produits-financiers/investir-en-bourse/les-bases-de-linvestissement/profil-investisseur" data-url="https://www.amf-france.org" class="admin-link" title="AMF — Profil investisseur">AMF</a> | Horizon : court ≤ 3 ans · moyen 4–7 ans · long ≥ 8 ans';
  section.appendChild(srcNote);

  const profiles = ['conservateur', 'modere', 'dynamique'];
  const profileLabels = { conservateur: '🛡️ Conservateur', modere: '⚖️ Modéré', dynamique: '🚀 Dynamique' };

  profiles.forEach(prof => {
    const profSection = document.createElement('div');
    profSection.className = 'strategy-profile';
    if (prof === state.risk) profSection.classList.add('strategy-profile--active');

    const h3 = document.createElement('h3');
    h3.textContent = profileLabels[prof];
    profSection.appendChild(h3);

    const chartsRow = document.createElement('div');
    chartsRow.className = 'strategy-charts-row';

    HORIZON_BUCKETS.forEach(bucket => {
      const alloc  = ALLOC_GRIDS[prof][bucket];
      const ids    = Object.keys(alloc);
      const vals   = Object.values(alloc);
      const colors = ids.map(id => PALETTE_PRODUCTS[id] || '#94a3b8');
      const names  = ids.map(id => { const p = PRODUCTS.find(x => x.id === id); return p ? p.name : id; });

      const block = document.createElement('div');
      block.className = 'strategy-chart-block';

      const lbl = document.createElement('p');
      lbl.className = 'strategy-horizon-label';
      lbl.textContent = HORIZON_LABELS[bucket];
      block.appendChild(lbl);

      const canvasId = `strategy-chart-${prof}-${bucket}`;
      const canvas = document.createElement('canvas');
      canvas.id = canvasId;
      canvas.height = 180;
      block.appendChild(canvas);
      chartsRow.appendChild(block);

      requestAnimationFrame(() => {
        try {
          const chartInst = new Chart(canvas.getContext('2d'), {
            type: 'doughnut',
            data: {
              labels: names.map((n, i) => `${n}\u00a0${vals[i]}\u202f%`),
              datasets: [{ data: vals, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              animation: { duration: 300 },
              plugins: {
                legend: {
                  display: true,
                  position: 'bottom',
                  labels: {
                    font: { size: 9 },
                    boxWidth: 10,
                    padding: 5,
                    generateLabels(chart) {
                      const ds = chart.data.datasets[0];
                      return chart.data.labels.map((label, i) => ({
                        text: label,
                        fillStyle: ds.backgroundColor[i],
                        strokeStyle: '#fff',
                        lineWidth: 1,
                        hidden: false,
                        index: i,
                      }));
                    },
                  },
                },
                tooltip: { callbacks: { label: ctx => `${ctx.label}` } },
              },
              cutout: '50%',
            },
          });
          _strategyCharts[canvasId] = chartInst;
        } catch (e) { /* ignore */ }
      });
    });

    profSection.appendChild(chartsRow);
    section.appendChild(profSection);
  });

  container.appendChild(section);
}

// ── Taux d'imposition estimé selon véhicule et horizon ────────
/**
 * Retourne le taux d'imposition applicable aux gains (PFU 2026).
 * Livret A/LDDS : 0 % (exonération totale).
 * PEA ≥ 5 ans : PS uniquement (CONFIG.psPEAgt5).
 * PEA < 5 ans : PFU total (CONFIG.pfuTotal).
 * AV ≥ 8 ans : IR réduit + PS (CONFIG.avTotal8).
 * AV < 8 ans : PFU AV (CONFIG.avPFU).
 * CTO : PFU total (CONFIG.pfuTotal).
 */
function getTaxRate(vehicle, horizon) {
  switch (vehicle) {
    case 'Livret': return 0;
    case 'PEA':    return horizon >= 5 ? CONFIG.psPEAgt5 : CONFIG.pfuTotal;
    case 'AV':     return horizon >= 8 ? CONFIG.avTotal8 : CONFIG.avPFU;
    case 'CTO':    return CONFIG.pfuTotal;
    default:       return CONFIG.pfuTotal;
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
 * Rend les graphiques donut des grilles d'allocation hors-écran
 * pour les capturer en image PNG destinée au PDF.
 * Retourne un objet { prof: { bucket: dataURL } }
 */
async function renderStrategyChartsForPDF() {
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;overflow:hidden;';
  document.body.appendChild(container);

  const imgs = {};
  const tempCharts = [];

  for (const prof of ['conservateur', 'modere', 'dynamique']) {
    imgs[prof] = {};
    for (const bucket of HORIZON_BUCKETS) {
      const alloc  = ALLOC_GRIDS[prof][bucket];
      const ids    = Object.keys(alloc);
      const vals   = Object.values(alloc);
      const colors = ids.map(id => PALETTE_PRODUCTS[id] || '#94a3b8');
      const names  = ids.map(id => { const p = PRODUCTS.find(x => x.id === id); return p ? p.name : id; });

      const canvas = document.createElement('canvas');
      canvas.width  = 300;
      canvas.height = 240;
      container.appendChild(canvas);

      try {
        const c = new Chart(canvas.getContext('2d'), {
          type: 'doughnut',
          data: {
            labels: names.map((n, i) => `${n} ${vals[i]}%`),
            datasets: [{ data: vals, backgroundColor: colors, borderWidth: 1, borderColor: '#fff' }],
          },
          options: {
            responsive:          false,
            animation:           false,
            plugins: {
              legend: {
                display:  true,
                position: 'bottom',
                labels: { font: { size: 9, family: "'Segoe UI',system-ui,sans-serif" }, boxWidth: 9, padding: 5 },
              },
              tooltip: { enabled: false },
            },
            cutout: '48%',
          },
        });
        tempCharts.push(c);
        // Deux frames pour garantir le rendu complet
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        imgs[prof][bucket] = canvas.toDataURL('image/png', 0.92);
      } catch (e) {
        imgs[prof][bucket] = null;
      }
    }
  }

  tempCharts.forEach(c => { try { c.destroy(); } catch (e) {} });
  document.body.removeChild(container);
  return imgs;
}

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
  if (!state.simResults) { showError('Lancez d\u2019abord une simulation.'); return; }
  if (!window.jspdf)     { showError('jsPDF non chargé — vérifiez votre connexion.'); return; }

  showLoading();
  // Pré-rendu des graphiques hors-écran pour la page Annexe
  const stratImgs = await renderStrategyChartsForPDF();
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
    // PAGE 5 — Annexe : Grilles d'allocation (graphiques + tableau)
    // ═══════════════════════════════════════════════════════════
    doc.addPage(); page++;
    header(); footer(page);
    y = 22;
    y = sectionTitle(y, 'ANNEXE — GRILLES D\'ALLOCATION PAR PROFIL ET HORIZON');

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text('Source : standards MIF\u202fII march\u00e9 fran\u00e7ais — AMF (amf-france.org) | \u00c9chelle SRRI/SRI : ESMA/PRIIPs', ML, y);
    y += 5;

    const PROF_LBLS_PDF = { conservateur: '🛡 Conservateur', modere: '⚖ Modéré', dynamique: '🚀 Dynamique' };
    const CHART_W  = (CW - 8) / 3;   // largeur donut (~57 mm)
    const CHART_H  = 50;              // hauteur donut
    const ROW_H    = CHART_H + 22;   // hauteur totale par profil

    for (const prof of ['conservateur', 'modere', 'dynamique']) {
      y = checkY(y, ROW_H + 16);
      // Titre profil
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...NAVY);
      doc.text(PROF_LBLS_PDF[prof], ML, y + 5);
      y += 8;

      // ── Graphiques donut pour chaque horizon ──────────────
      HORIZON_BUCKETS.forEach((bucket, bi) => {
        const img = stratImgs[prof] && stratImgs[prof][bucket];
        const bx  = ML + bi * (CHART_W + 4);
        // Label horizon
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(...NAVY);
        doc.text(HORIZON_LABELS[bucket], bx + CHART_W / 2, y, { align: 'center' });
        if (img) {
          doc.addImage(img, 'PNG', bx, y + 2, CHART_W, CHART_H);
        }
      });
      y += CHART_H + 6;

      // ── Tableau de détail texte ────────────────────────────
      const gridBody = HORIZON_BUCKETS.map(bucket => {
        const alloc = ALLOC_GRIDS[prof][bucket];
        const parts = Object.entries(alloc).map(([id, pct]) => {
          const p = PRODUCTS.find(x => x.id === id);
          return `${p ? p.name : id}\u00a0${pct}\u202f%`;
        });
        return [HORIZON_LABELS[bucket], parts.join(' | ')];
      });

      doc.autoTable({
        startY: y,
        head: [['Horizon', 'Répartition recommandée (% du portefeuille)']],
        body: gridBody,
        theme: 'grid',
        headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 7 },
        bodyStyles: { fontSize: 6.5, textColor: TEXT },
        alternateRowStyles: { fillColor: LIGHT },
        columnStyles: { 0: { cellWidth: 22, fontStyle: 'bold' } },
        margin: { left: ML, right: MR },
      });
      y = doc.lastAutoTable.finalY + 6;
    }

    // ── Légende SRRI/SRI ──────────────────────────────────────
    y = checkY(y, 30);
    y = sectionTitle(y, 'LÉGENDE DES INDICATEURS DE RISQUE (SRRI/SRI)');
    doc.autoTable({
      startY: y,
      head: [['Niveau', 'Qualification', 'Produits typiques']],
      body: [
        ['1/7', 'Risque très faible — Capital garanti',  'Livret A, LDDS, LEP'],
        ['2/7', 'Risque très faible — Quasi-garanti',    'Fonds euros assurance-vie'],
        ['3/7', 'Risque faible à modéré',                'Obligations d\'État, SCPI, UC obligataires'],
        ['4/7', 'Risque modéré',                         'ETF MSCI World (actions diversifiées)'],
        ['5/7', 'Risque élevé',                          'UC actions monde (AV)'],
        ['6/7', 'Risque élevé',                          'ETF actions Europe, ETF marchés émergents'],
        ['7/7', 'Risque maximal — Perte totale possible', 'Cryptomonnaies'],
      ],
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 7 },
      bodyStyles: { fontSize: 6.5, textColor: TEXT },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: { 0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' }, 1: { cellWidth: 60 }, 2: { cellWidth: 'auto' } },
      margin: { left: ML, right: MR },
    });
    y = doc.lastAutoTable.finalY + 6;

    // ═══════════════════════════════════════════════════════════
    // PAGE 6 — Avertissements & Empreinte d'authenticité
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

// ── Barre de paramètres persistante (étapes 2 et 3) ────────────
function renderParamBar() {
  const bar = document.getElementById('param-bar');
  if (!bar) return;
  bar.innerHTML = '';  // safe: data from state only

  const fields = [
    { id: 'pb-capital',  label: 'Capital',     value: state.capital,  unit: '€',    min: 100, max: 1000000, step: 1000 },
    { id: 'pb-horizon',  label: 'Horizon',     value: state.horizon,  unit: 'ans',  min: 1,   max: 30,      step: 1    },
    { id: 'pb-mensuel',  label: 'Versements',  value: state.mensuel,  unit: '€/mois', min: 0, max: 10000,   step: 50   },
  ];

  fields.forEach(f => {
    const wrap = document.createElement('div');
    wrap.className = 'pb-field';
    const lbl = document.createElement('label');
    lbl.htmlFor = f.id;
    lbl.textContent = f.label;
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.id = f.id;
    inp.value = f.value;
    inp.min = f.min;
    inp.max = f.max;
    inp.step = f.step;
    inp.className = 'pb-input';
    inp.setAttribute('inputmode', 'numeric');
    const unit = document.createElement('span');
    unit.className = 'pb-unit';
    unit.textContent = f.unit;
    wrap.appendChild(lbl);
    wrap.appendChild(inp);
    wrap.appendChild(unit);
    bar.appendChild(wrap);

    inp.addEventListener('input', () => syncParamBar());
    inp.addEventListener('change', () => syncParamBar());
  });

  // Profil selector
  const wrap = document.createElement('div');
  wrap.className = 'pb-field';
  const lbl = document.createElement('label');
  lbl.htmlFor = 'pb-risk';
  lbl.textContent = 'Profil';
  const sel = document.createElement('select');
  sel.id = 'pb-risk';
  sel.className = 'pb-select';
  [['conservateur','🛡️ Conservateur'],['modere','⚖️ Modéré'],['dynamique','🚀 Dynamique']].forEach(([v,t]) => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = t;
    if (v === state.risk) opt.selected = true;
    sel.appendChild(opt);
  });
  wrap.appendChild(lbl);
  wrap.appendChild(sel);
  bar.appendChild(wrap);
  sel.addEventListener('change', () => syncParamBar());
}

let _simTimer = null;

function syncParamBar() {
  const capitalEl  = document.getElementById('pb-capital');
  const horizonEl  = document.getElementById('pb-horizon');
  const mensuelEl  = document.getElementById('pb-mensuel');
  const riskEl     = document.getElementById('pb-risk');
  if (!capitalEl) return;

  const cap  = parseFloat(capitalEl.value) || state.capital;
  const hor  = parseInt(horizonEl.value, 10) || state.horizon;
  const men  = parseFloat(mensuelEl.value) || 0;
  const risk = riskEl ? riskEl.value : state.risk;

  // Validate ranges
  if (cap < 100 || cap > 1_000_000) return;
  if (hor < 1 || hor > 30) return;
  if (men < 0 || men > 10_000) return;

  state.capital  = cap;
  state.horizon  = hor;
  state.mensuel  = men;
  state.risk     = risk;

  // Sync step 1 inputs
  ['capital','horizon','mensuel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = state[id];
    const sl = document.getElementById(id + '-slider');
    if (sl) sl.value = state[id];
  });
  const riskRadio = document.querySelector(`input[name="risk"][value="${risk}"]`);
  if (riskRadio) riskRadio.checked = true;

  // If on step 3: schedule simulation
  const step3 = document.getElementById('step-3');
  if (step3 && step3.classList.contains('active')) {
    scheduleSimulation();
  }
  // If on step 2: re-render products
  const step2 = document.getElementById('step-2');
  if (step2 && step2.classList.contains('active')) {
    renderProducts();
  }
}

function scheduleSimulation() {
  if (_simTimer) clearTimeout(_simTimer);
  _simTimer = setTimeout(() => {
    _simTimer = null;
    if (!validateAllocations()) return;
    runSimulation();
  }, 600);
}

// ── Panneau d'administration des sources et taux ────────────────
function openAdmin() {
  renderAdminPanel();
  const m = document.getElementById('admin-modal');
  if (m) { m.hidden = false; document.body.classList.add('modal-open'); }
}

function closeAdmin() {
  const m = document.getElementById('admin-modal');
  if (m) { m.hidden = true; document.body.classList.remove('modal-open'); }
}

function renderAdminPanel() {
  // Rates tab
  const ratesEl = document.getElementById('admin-rates-content');
  if (!ratesEl) return;
  ratesEl.innerHTML = '';

  const rateFields = [
    { key: 'livretA',    label: 'Livret A / LDDS (taux réglementé — Banque de France)',  unit: '%', scale: 100 },
    { key: 'lep',        label: 'LEP — Livret Épargne Populaire (taux réglementé)',       unit: '%', scale: 100 },
    { key: 'fondsEuro',  label: 'Fonds euros AV (rendement moyen marché)',                unit: '%', scale: 100 },
    { key: 'scpiTD',     label: 'SCPI — Taux de distribution moyen (ASPIM-IEIF)',         unit: '%', scale: 100 },
    { key: 'psMobilier', label: 'PS revenus mobiliers (LFSS 2026)',                       unit: '%', scale: 100 },
    { key: 'psAV',       label: 'PS assurance-vie',                                       unit: '%', scale: 100 },
    { key: 'psPEAgt5',   label: 'PS PEA ≥ 5 ans',                                        unit: '%', scale: 100 },
    { key: 'pfuIR',      label: 'PFU — part IR (12,8 % std)',                             unit: '%', scale: 100 },
    { key: 'avIR8',      label: 'AV ≥ 8 ans — IR réduit (7,5 % std)',                    unit: '%', scale: 100 },
    { key: 'avPFU',      label: 'AV < 8 ans — PFU',                                      unit: '%', scale: 100 },
  ];

  const table = document.createElement('table');
  table.className = 'admin-table';
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>Paramètre</th><th>Valeur actuelle</th><th>Valeur 2026 par défaut</th></tr>';
  table.appendChild(thead);
  const tbody = document.createElement('tbody');

  rateFields.forEach(f => {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td');
    td1.textContent = f.label;
    const td2 = document.createElement('td');
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.id = `admin-${f.key}`;
    inp.value = (CONFIG[f.key] * f.scale).toFixed(2);
    inp.step = '0.01';
    inp.min = '0';
    inp.max = '100';
    inp.className = 'admin-input';
    const unitSpan = document.createElement('span');
    unitSpan.textContent = '\u202f' + f.unit;
    td2.appendChild(inp);
    td2.appendChild(unitSpan);
    const td3 = document.createElement('td');
    td3.textContent = (CONFIG_DEFAULTS[f.key] * f.scale).toFixed(2) + '\u202f%';
    td3.className = 'admin-default';
    tr.appendChild(td1);
    tr.appendChild(td2);
    tr.appendChild(td3);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  ratesEl.appendChild(table);

  const note = document.createElement('p');
  note.className = 'admin-note';
  note.textContent = '✓ Le taux LDDS est synchronisé avec le Livret A. Les taux des produits réglementés (Livret A, LEP) et le rendement SCPI sont mis à jour dans le moteur de simulation. Modifications appliquées à la prochaine simulation.';
  ratesEl.appendChild(note);

  // Sources tab
  renderAdminSources();
}

function renderAdminSources() {
  const srcEl = document.getElementById('admin-sources-content');
  if (!srcEl) return;
  srcEl.innerHTML = '';

  const table = document.createElement('table');
  table.className = 'admin-table';
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>Source</th><th>Détail</th><th>Date</th><th>Lien</th></tr>';
  table.appendChild(thead);
  const tbody = document.createElement('tbody');

  CONFIG_SOURCES.forEach(s => {
    const tr = document.createElement('tr');
    [s.label, s.detail, s.date].forEach(txt => {
      const td = document.createElement('td');
      td.textContent = txt;
      tr.appendChild(td);
    });
    const tdLink = document.createElement('td');
    const a = document.createElement('a');
    a.href = '#';  // CSP: no external nav from onclick — we just show the URL
    a.textContent = '🔗 Voir';
    a.className = 'admin-link';
    a.title = s.url;
    a.setAttribute('data-url', s.url);
    tdLink.appendChild(a);
    tr.appendChild(tdLink);
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  srcEl.appendChild(table);
}

function applyAdminRates() {
  const rateKeys = ['livretA','lep','fondsEuro','scpiTD','psMobilier','psAV','psPEAgt5','pfuIR','avIR8','avPFU'];
  rateKeys.forEach(key => {
    const inp = document.getElementById(`admin-${key}`);
    if (!inp) return;
    const val = parseFloat(inp.value);
    if (Number.isFinite(val) && val >= 0 && val <= 100) {
      CONFIG[key] = val / 100;
    }
  });
  // Sync ldds to livretA
  CONFIG.ldds = CONFIG.livretA;
  // Update PRODUCTS mu for regulated/variable-rate products
  const pLivretA = PRODUCTS.find(p => p.id === 'livret-a');
  const pLdds    = PRODUCTS.find(p => p.id === 'ldds');
  const pLep     = PRODUCTS.find(p => p.id === 'lep');
  const pFonds   = PRODUCTS.find(p => p.id === 'fonds-euro');
  const pScpi    = PRODUCTS.find(p => p.id === 'scpi');
  if (pLivretA) pLivretA.mu = CONFIG.livretA;
  if (pLdds)    pLdds.mu    = CONFIG.ldds;
  if (pLep)     pLep.mu     = CONFIG.lep;
  if (pFonds)   pFonds.mu   = CONFIG.fondsEuro;
  if (pScpi)    pScpi.mu    = CONFIG.scpiTD;
  closeAdmin();
  // Re-simulate if results are displayed
  if (state.simResults) scheduleSimulation();
  else if (document.getElementById('step-2').classList.contains('active')) renderProducts();
}

function resetAdminRates() {
  Object.assign(CONFIG, CONFIG_DEFAULTS);
  CONFIG.ldds = CONFIG.livretA;
  const pLivretA = PRODUCTS.find(p => p.id === 'livret-a');
  const pLdds    = PRODUCTS.find(p => p.id === 'ldds');
  const pLep     = PRODUCTS.find(p => p.id === 'lep');
  const pFonds   = PRODUCTS.find(p => p.id === 'fonds-euro');
  const pScpi    = PRODUCTS.find(p => p.id === 'scpi');
  if (pLivretA) pLivretA.mu = CONFIG.livretA;
  if (pLdds)    pLdds.mu    = CONFIG.ldds;
  if (pLep)     pLep.mu     = CONFIG.lep;
  if (pFonds)   pFonds.mu   = CONFIG.fondsEuro;
  if (pScpi)    pScpi.mu    = CONFIG.scpiTD;
  renderAdminPanel();
}

function switchAdminTab(name) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.toggle('active', t.dataset.panel === name));
  document.querySelectorAll('.admin-panel-content').forEach(p => { p.hidden = (p.id !== `admin-${name}-content`); });
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
// 14. CHART.JS — Polices et couleurs globales unifiées
// ----------------------------------------------------------------
(function setChartDefaults() {
  if (!window.Chart) return;
  const FONT = "'Segoe UI', system-ui, -apple-system, sans-serif";
  Chart.defaults.font.family = FONT;
  Chart.defaults.font.size   = 11;
  Chart.defaults.color       = '#64748b';
  Chart.defaults.borderColor = '#e2e8f0';
  Chart.defaults.plugins.tooltip.titleFont  = { family: FONT, size: 11, weight: 'bold' };
  Chart.defaults.plugins.tooltip.bodyFont   = { family: FONT, size: 10 };
  Chart.defaults.plugins.legend.labels.font = { family: FONT, size: 10 };
})();

// ----------------------------------------------------------------
// 15. INITIALISATION — event listeners (pas d'inline handlers)
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
    r.addEventListener('change', () => { state.risk = r.value; updateSuggestion(); });
  });

  // Horizon : met à jour la suggestion quand on change manuellement
  document.getElementById('horizon').addEventListener('input', () => {
    const v = parseInt(document.getElementById('horizon').value, 10);
    if (v >= 1 && v <= 30) { state.horizon = v; updateSuggestion(); }
  });
  document.getElementById('horizon-slider').addEventListener('input', () => {
    const v = parseInt(document.getElementById('horizon-slider').value, 10);
    if (v >= 1 && v <= 30) { state.horizon = v; updateSuggestion(); }
  });

  // Fermer le banner d'erreur au clic
  document.getElementById('error-banner').addEventListener('click', hideError);

  // Admin panel
  const btnAdmin = document.getElementById('btn-admin');
  if (btnAdmin) btnAdmin.addEventListener('click', openAdmin);
  const adminClose = document.getElementById('admin-close');
  if (adminClose) adminClose.addEventListener('click', closeAdmin);
  const adminApply = document.getElementById('admin-apply');
  if (adminApply) adminApply.addEventListener('click', applyAdminRates);
  const adminReset = document.getElementById('admin-reset');
  if (adminReset) adminReset.addEventListener('click', resetAdminRates);
  const adminModal = document.getElementById('admin-modal');
  if (adminModal) {
    adminModal.addEventListener('click', e => {
      if (e.target.id === 'admin-modal') closeAdmin();
    });
    adminModal.addEventListener('click', e => {
      const link = e.target.closest('.admin-link');
      if (link) {
        e.preventDefault();
        const url = link.getAttribute('data-url') || link.title;
        if (url && url.startsWith('http')) {
          try { window.open(url, '_blank', 'noopener,noreferrer'); }
          catch { /* ignore */ }
        }
      }
    });
  }

  // Admin tabs
  document.querySelectorAll('.admin-tab').forEach(t => {
    t.addEventListener('click', () => switchAdminTab(t.dataset.panel));
  });

  // Liens de sources dans l'onglet stratégie (délégation au niveau main)
  document.querySelector('main').addEventListener('click', e => {
    const link = e.target.closest('.admin-link');
    if (link && !e.target.closest('#admin-modal')) {
      e.preventDefault();
      const url = link.getAttribute('data-url') || link.title;
      if (url && url.startsWith('http')) {
        try { window.open(url, '_blank', 'noopener,noreferrer'); }
        catch { /* ignore */ }
      }
    }
  });

  // Step circle navigation
  document.querySelectorAll('.step').forEach(stepEl => {
    stepEl.style.cursor = 'pointer';
    stepEl.addEventListener('click', () => {
      const n = parseInt(stepEl.dataset.step, 10);
      if (n === 1) { goToStep(1); }
      else if (n === 2) { if (readStep1()) goToStep(2); }
      else if (n === 3) {
        if (!state.simResults) { showError('Lancez d\'abord une simulation.'); return; }
        goToStep(3);
      }
    });
  });

  // Initialise la barre de suggestion
  updateSuggestion();
});
