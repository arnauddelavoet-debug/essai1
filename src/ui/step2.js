import { state, LIMITS } from '../state.js';
import { CATALOG } from '../data/catalog.js';
import { VEHICLES, VEHICLE_ORDER } from '../data/vehicles.js';
import { PROFILES, PROFILE_ORDER } from '../data/profiles.js';
import { resolveAssumption, buildPlan, portfolioStats } from '../engine/assumptions.js';
import { allocationTotal, isComplete, normalizeAllocation, profileAllocation, allocationByVehicle, allocationWarnings } from '../engine/allocation.js';
import { el, fill, $, $$, infoButton } from './dom.js';
import { fmtPct, fmtPctSigned } from './format.js';

const cards = new Map();
let filter = 'ALL';

const SOURCE_LABEL = {
  prospectif: 'hyp. prospective',
  historique: 'historique 10 ans',
  mixte: 'mixte',
  manuel: 'saisie manuelle',
  taux: 'taux garanti',
};

/** Construit la barre d'outils et les cartes (une fois). */
export function buildStep2() {
  const presets = $('#preset-buttons');
  for (const key of PROFILE_ORDER) {
    presets.append(el('button', {
      type: 'button', className: 'chip',
      onclick: () => { state.allocations = profileAllocation(key); state.allocationCustomized = false; refreshStep2(); },
    }, `${PROFILES[key].icon} ${PROFILES[key].label}`));
  }
  $('#btn-clear-alloc').addEventListener('click', () => { state.allocations = {}; state.allocationCustomized = true; refreshStep2(); });
  $('#btn-normalize').addEventListener('click', () => { state.allocations = normalizeAllocation(state.allocations); state.allocationCustomized = true; refreshStep2(); });
  $('#only-allocated').addEventListener('change', applyFilter);

  const filters = $('#vehicle-filters');
  const addFilter = (key, label) => filters.append(el('button', {
    type: 'button', className: 'chip', dataset: { filter: key }, 'aria-pressed': String(key === filter),
    onclick: () => { filter = key; $$('#vehicle-filters .chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.filter === key))); applyFilter(); },
  }, label));
  addFilter('ALL', 'Toutes les enveloppes');
  for (const v of VEHICLE_ORDER) addFilter(v, VEHICLES[v].short);

  const container = $('#products-container');
  for (const v of VEHICLE_ORDER) {
    const products = CATALOG.filter(p => p.vehicle === v);
    if (!products.length) continue;
    const grid = el('div', { className: 'products-grid' });
    container.append(el('section', { className: 'vehicle-section', dataset: { vehicle: v } },
      el('h3', {}, el('span', { className: `badge ${VEHICLES[v].cssClass}` }, VEHICLES[v].short), VEHICLES[v].label, infoButton(VEHICLES[v].summary)),
      grid));
    for (const p of products) {
      const card = buildCard(p);
      grid.append(card.node);
      cards.set(p.id, card);
    }
  }
}

function numberField(label, { min, max, step, value, placeholder, onChange }) {
  const input = el('input', { type: 'number', min, max, step, inputmode: 'decimal', placeholder });
  if (value !== undefined) input.value = value;
  input.addEventListener('change', () => onChange(input));
  return { label: el('label', {}, label, input), input };
}

function buildCard(p) {
  const pctText = v => String(Math.round(v * 10000) / 100);
  const node = el('article', { className: 'product-card', dataset: { id: p.id, vehicle: p.vehicle }, 'aria-label': p.name });
  const example = p.example ? el('div', { className: 'product-example' }, `ex. ${p.example.name} · ${p.example.isin} · ${p.example.ticker}`) : null;
  const pills = el('div', { className: 'pills' });
  const marketLine = el('div', { className: 'market-line' });

  const slider = el('input', { type: 'range', min: 0, max: 100, step: 1, 'aria-label': `Allocation ${p.name} (curseur)` });
  const number = el('input', { type: 'number', min: 0, max: 100, step: 0.5, inputmode: 'decimal', 'aria-label': `Allocation ${p.name} en %` });
  const setAlloc = v => {
    const clean = Math.min(100, Math.max(0, Math.round((Number(v) || 0) * 10) / 10));
    if (clean > 0) state.allocations[p.id] = clean; else delete state.allocations[p.id];
    state.allocationCustomized = true;
    refreshAllocationUI();
  };
  slider.addEventListener('input', () => { number.value = slider.value; setAlloc(slider.value); });
  number.addEventListener('input', () => { slider.value = number.value; setAlloc(number.value); });

  // Hypothèses & frais personnalisables.
  const deterministic = p.rate !== undefined;
  const overrideFor = () => (state.overrides[p.id] ||= {});
  const cleanupOverride = () => { if (!Object.keys(state.overrides[p.id] || {}).length) delete state.overrides[p.id]; };
  const setOverride = (key, limits) => input => {
    const raw = input.value.trim();
    if (raw === '') delete overrideFor()[key];
    else {
      const v = Math.min(limits.max, Math.max(limits.min, Number(raw) / 100));
      if (Number.isFinite(v)) overrideFor()[key] = v;
    }
    cleanupOverride();
    updateCard(p.id);
    refreshAllocationUI();
  };
  const muField = numberField(deterministic ? 'Taux annuel (%)' : 'Rendement brut μ (%/an)', { step: 0.1, onChange: setOverride('mu', LIMITS.mu) });
  const sigmaField = deterministic ? null : numberField('Volatilité σ (%/an)', { step: 0.5, min: 0, onChange: setOverride('sigma', LIMITS.sigma) });
  const terField = numberField('Frais du support (%/an)', { step: 0.01, min: 0, onChange: setOverride('ter', LIMITS.ter) });
  const entryField = numberField('Frais sur versements (%)', {
    step: 0.5, min: 0,
    onChange: input => {
      const raw = input.value.trim();
      if (raw === '') delete state.entryFees[p.id];
      else state.entryFees[p.id] = Math.min(LIMITS.entryFee.max, Math.max(0, Number(raw) / 100));
      refreshAllocationUI();
    },
  });
  const resetBtn = el('button', {
    type: 'button', className: 'btn btn-small',
    onclick: () => { delete state.overrides[p.id]; delete state.entryFees[p.id]; syncOverrideFields(); updateCard(p.id); refreshAllocationUI(); },
  }, 'Valeurs par défaut');

  const syncOverrideFields = () => {
    const a = resolveAssumption(p, { mode: state.assumptionMode, market: state.market, override: state.overrides[p.id] });
    muField.input.placeholder = pctText(a.mu);
    muField.input.value = state.overrides[p.id]?.mu !== undefined ? pctText(state.overrides[p.id].mu) : '';
    if (sigmaField) {
      sigmaField.input.placeholder = pctText(a.sigma);
      sigmaField.input.value = state.overrides[p.id]?.sigma !== undefined ? pctText(state.overrides[p.id].sigma) : '';
    }
    terField.input.placeholder = pctText(p.ter || 0);
    terField.input.value = state.overrides[p.id]?.ter !== undefined ? pctText(state.overrides[p.id].ter) : '';
    entryField.input.placeholder = pctText(p.entryFee || 0);
    entryField.input.value = state.entryFees[p.id] !== undefined ? pctText(state.entryFees[p.id]) : '';
  };

  node.append(
    el('div', { className: 'product-header' },
      el('span', { className: 'product-icon', 'aria-hidden': 'true' }, p.icon),
      el('div', { className: 'product-info' },
        el('div', { className: 'product-name' }, p.name),
        example,
        el('div', { className: 'badges' },
          el('span', { className: `badge ${VEHICLES[p.vehicle].cssClass}` }, VEHICLES[p.vehicle].short),
          el('span', { className: 'badge badge-sri', dataset: { tip: 'Indicateur de risque SRI (1 = très faible, 7 = très élevé), indicatif.' } }, `Risque ${p.sri}/7`)))),
    pills,
    marketLine,
    el('div', { className: 'alloc-row' }, slider, el('div', { className: 'input-with-unit' }, number, el('span', { className: 'unit' }, '%'))),
    el('details', {},
      el('summary', {}, 'Hypothèses & frais'),
      el('div', { className: 'override-grid' }, muField.label, sigmaField && sigmaField.label, terField.label, entryField.label),
      el('p', { className: 'product-desc' }, p.description),
      resetBtn),
  );

  return { node, slider, number, pills, marketLine, syncOverrideFields, product: p };
}

/** Met à jour les pastilles d'hypothèses et la ligne de marché d'une carte. */
function updateCard(id) {
  const c = cards.get(id);
  const p = c.product;
  const a = resolveAssumption(p, { mode: state.assumptionMode, market: state.market, override: state.overrides[id] });
  const envFee = p.envelopeFee ? state.envelopeFees[p.vehicle] || 0 : 0;
  const fees = a.ter + envFee;
  const net = a.mu - fees;

  fill(c.pills, 
    el('span', { className: 'pill ret', dataset: { tip: 'Rendement annuel moyen retenu, net des frais du support et de l\'enveloppe, avant impôts.' } }, `${fmtPctSigned(net)}/an net`),
    a.sigma > 0 ? el('span', { className: 'pill vol', dataset: { tip: 'Volatilité : amplitude typique des variations annuelles. ±σ couvre environ 2 années sur 3.' } }, `σ ${fmtPct(a.sigma, 0)}`) : el('span', { className: 'pill' }, 'Capital garanti'),
    fees > 0 ? el('span', { className: 'pill fee', dataset: { tip: `Frais annuels : support ${fmtPct(a.ter, 2)}${envFee ? ` + enveloppe ${fmtPct(envFee, 2)}` : ''}.` } }, `frais ${fmtPct(fees, 2)}`) : null,
    (state.entryFees[id] ?? p.entryFee) > 0 ? el('span', { className: 'pill fee' }, `entrée ${fmtPct(state.entryFees[id] ?? p.entryFee, 1)}`) : null,
    el('span', { className: 'pill src' }, SOURCE_LABEL[a.source] || a.source),
  );

  const h = p.marketTicker && state.market && state.market.tickers[p.marketTicker];
  if (h) {
    const perf = (label, v, annual) => (v === null || v === undefined ? null
      : [` · ${label} `, el('b', { className: v >= 0 ? 'perf-pos' : 'perf-neg' }, `${fmtPctSigned(v)}${annual ? '/an' : ''}`)]);
    fill(c.marketLine, 
      `Historique ${p.marketTicker}`,
      perf('1 an', h.perf['1a'], false),
      perf('5 ans', h.perf['5a'], true),
      perf('10 ans', h.perf['10a'], true),
      h.maxDrawdown ? ` · baisse max ${fmtPctSigned(-h.maxDrawdown, 0)}` : null,
    );
    c.marketLine.hidden = false;
  } else {
    c.marketLine.hidden = true;
  }
}

function applyFilter() {
  const onlyAllocated = $('#only-allocated').checked;
  for (const section of $$('.vehicle-section')) {
    const matchVehicle = filter === 'ALL' || section.dataset.vehicle === filter;
    let visible = 0;
    for (const card of $$('.product-card', section)) {
      const show = matchVehicle && (!onlyAllocated || state.allocations[card.dataset.id] > 0);
      card.hidden = !show;
      if (show) visible++;
    }
    section.hidden = visible === 0;
  }
}

/** Synthèse, barre de répartition, alertes et bouton de simulation. */
function refreshAllocationUI() {
  const total = allocationTotal(state.allocations);
  const totalEl = $('#total-pct');
  totalEl.textContent = `${total.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
  totalEl.className = `total-pct ${isComplete(state.allocations) ? 'good' : 'bad'}`;
  $('#simulate-btn').disabled = !isComplete(state.allocations);
  $('#btn-normalize').hidden = total === 0 || isComplete(state.allocations);

  for (const [id, c] of cards) {
    const v = state.allocations[id] || 0;
    c.node.classList.toggle('allocated', v > 0);
    if (document.activeElement !== c.number) c.number.value = v ? String(v) : '';
    if (document.activeElement !== c.slider) c.slider.value = String(v);
  }

  const byVehicle = allocationByVehicle(state.allocations, CATALOG);
  fill($('#alloc-bar'), ...VEHICLE_ORDER.filter(v => byVehicle[v]).map(v => el('span', {
    className: VEHICLES[v].cssClass, style: { width: `${(byVehicle[v] / Math.max(100, total)) * 100}%` }, title: `${VEHICLES[v].short} ${byVehicle[v]} %`,
  })));

  let stats = null;
  if (total > 0) {
    const plan = buildPlan(state, CATALOG, state.market);
    stats = portfolioStats(plan.lines, plan.correlation);
    fill($('#alloc-metrics'), 
      `Rendement net espéré ${fmtPctSigned(stats.mu)}/an · volatilité ${fmtPct(stats.sigma)} · rendement médian ${fmtPctSigned(stats.median)}/an `,
      infoButton('Estimation analytique (avant impôts) qui tient compte des corrélations. Le rendement médian (μ − σ²/2) est celui d\'un scénario « typique » : la volatilité érode la croissance composée.'),
    );
  } else {
    $('#alloc-metrics').textContent = 'Aucune ligne allouée.';
  }

  const warnings = allocationWarnings(state, CATALOG, stats);
  fill($('#alloc-warnings'), ...warnings.map(w => el('div', { className: `warning ${w.level}` }, w.text)));
  if ($('#only-allocated').checked) applyFilter();
}

/** Rafraîchit toute l'étape 2 (après changement de mode, de données de marché, de profil…). */
export function refreshStep2() {
  for (const [id, c] of cards) {
    updateCard(id);
    c.syncOverrideFields();
  }
  refreshAllocationUI();
  applyFilter();
}

export function validateAllocation() {
  return isComplete(state.allocations);
}
