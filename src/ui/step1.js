import { state, LIMITS, NSIMS_CHOICES, sanitizeParams, defaultState } from '../state.js';
import { PROFILES, PROFILE_ORDER } from '../data/profiles.js';
import { FISCAL } from '../config/fiscal.js';
import { ASSUMPTION_MODES } from '../engine/assumptions.js';
import { profileAllocation } from '../engine/allocation.js';
import { el, $, toast } from './dom.js';
import { fmtPct, fmtDate } from './format.js';

// Champs numériques : [id du champ, clé d'état, facteur d'affichage].
// Les pourcentages sont stockés en fraction et affichés en %.
const NUMERIC = [
  ['capital', 'capital', 1],
  ['monthly', 'monthly', 1],
  ['horizon', 'horizon', 1],
  ['peaAnciennete', 'peaAnciennete', 1],
  ['avAnciennete', 'avAnciennete', 1],
  ['perCap', 'perCap', 1],
  ['df', 'df', 1],
  ['inflation', 'inflation', 100],
  ['contributionGrowth', 'contributionGrowth', 100],
];
const SELECTS = ['tmi', 'tmiRetraite', 'bareme', 'nSims', 'rebalancing', 'distribution', 'assumptionMode'];

/** Construit les éléments dynamiques du formulaire (options, cartes de profil). */
export function buildStep1({ onRiskChange, onModeChange }) {
  for (const id of ['tmi', 'tmiRetraite']) {
    const sel = $(`#${id}`);
    for (const t of FISCAL.tmiBrackets) sel.append(el('option', { value: String(t) }, t === 0 ? '0 % (non imposable)' : `${t} %`));
  }
  for (const n of NSIMS_CHOICES) $('#nSims').append(el('option', { value: String(n) }, n.toLocaleString('fr-FR')));
  for (const [k, label] of Object.entries(ASSUMPTION_MODES)) $('#assumptionMode').append(el('option', { value: k }, label));

  const cards = $('#risk-cards');
  for (const key of PROFILE_ORDER) {
    const p = PROFILES[key];
    const input = el('input', { type: 'radio', name: 'risk', value: key });
    input.addEventListener('change', () => onRiskChange(key));
    cards.append(el('label', { className: 'risk-card' },
      input,
      el('div', { className: 'risk-card-inner' },
        el('span', { className: 'risk-icon', 'aria-hidden': 'true' }, p.icon),
        el('strong', {}, p.label),
        el('p', {}, p.pitch),
        el('p', {}, `Volatilité cible : ${fmtPct(p.sigmaRange.min, 0)} à ${p.sigmaRange.max >= 1 ? '∞' : fmtPct(p.sigmaRange.max, 0)}`),
      )));
  }

  linkSlider('capital-slider', 'capital');
  linkSlider('monthly-slider', 'monthly');
  linkSlider('horizon-slider', 'horizon');
  $('#assumptionMode').addEventListener('change', () => onModeChange($('#assumptionMode').value));
  $('#distribution').addEventListener('change', syncDfField);
}

function linkSlider(sliderId, inputId) {
  const slider = $(`#${sliderId}`), input = $(`#${inputId}`);
  slider.addEventListener('input', () => { input.value = slider.value; });
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    if (Number.isFinite(v)) slider.value = String(Math.min(Number(slider.max), Math.max(Number(slider.min), v)));
  });
}

function syncDfField() {
  $('#df').disabled = $('#distribution').value !== 'student';
}

/** Recopie l'état dans le formulaire. */
export function writeStep1(s = state) {
  for (const [id, key, factor] of NUMERIC) {
    const v = s[key] * factor;
    $(`#${id}`).value = String(Math.round(v * 1000) / 1000);
  }
  for (const id of SELECTS) $(`#${id}`).value = String(s[id]);
  $('#couple').value = String(!!s.couple);
  $('#target').value = s.target > 0 ? String(s.target) : '';
  $('#targetReal').checked = !!s.targetReal;
  $('#feeAV').value = String(Math.round(s.envelopeFees.AV * 10000) / 100);
  $('#feePER').value = String(Math.round(s.envelopeFees.PER * 10000) / 100);
  $('#seed').value = Number.isInteger(s.seed) ? String(s.seed) : '';
  const radio = document.querySelector(`input[name="risk"][value="${s.risk}"]`);
  if (radio) radio.checked = true;
  for (const [sliderId, inputId] of [['capital-slider', 'capital'], ['monthly-slider', 'monthly'], ['horizon-slider', 'horizon']]) {
    $(`#${sliderId}`).value = $(`#${inputId}`).value;
  }
  syncDfField();
}

/**
 * Lit et valide le formulaire. En cas d'erreur, place le focus sur le
 * champ fautif et affiche un message ; l'état n'est alors pas modifié.
 * @returns {boolean}
 */
export function readStep1() {
  const raw = (id, factor = 1) => {
    const v = $(`#${id}`).value.trim();
    return v === '' ? NaN : Number(v) / factor;
  };
  const checks = [
    ['capital', raw('capital'), LIMITS.capital, 'Capital initial : entre 0 et 10 000 000 €.'],
    ['monthly', raw('monthly'), LIMITS.monthly, 'Versement mensuel : entre 0 et 50 000 €.'],
    ['horizon', raw('horizon'), LIMITS.horizon, 'Horizon : nombre entier d\'années entre 1 et 50.', true],
    ['peaAnciennete', raw('peaAnciennete'), LIMITS.anciennete, 'Ancienneté du PEA : entre 0 et 50 ans.', true],
    ['avAnciennete', raw('avAnciennete'), LIMITS.anciennete, 'Ancienneté de l\'assurance-vie : entre 0 et 50 ans.', true],
    ['inflation', raw('inflation', 100), LIMITS.inflation, 'Inflation : entre −2 % et 15 %.'],
    ['contributionGrowth', raw('contributionGrowth', 100), LIMITS.contributionGrowth, 'Indexation des versements : entre 0 et 10 %.'],
    ['feeAV', raw('feeAV', 100), LIMITS.envelopeFee, 'Frais de gestion AV : entre 0 et 3 %.'],
    ['feePER', raw('feePER', 100), LIMITS.envelopeFee, 'Frais de gestion PER : entre 0 et 3 %.'],
    ['perCap', raw('perCap'), LIMITS.perCap, 'Plafond de déduction PER : entre 0 et 100 000 €.'],
    ['df', raw('df'), LIMITS.df, 'Degrés de liberté : entier entre 3 et 30.', true],
  ];
  for (const [id, v, { min, max }, message, integer] of checks) {
    if (!Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) return fail(id, message);
  }
  if (raw('capital') === 0 && raw('monthly') === 0) return fail('capital', 'Indiquez un capital initial ou un versement mensuel.');

  const targetRaw = $('#target').value.trim();
  const target = targetRaw === '' ? 0 : Number(targetRaw);
  if (!Number.isFinite(target) || target < 0 || target > LIMITS.target.max) return fail('target', 'Objectif : montant positif (ou laissez vide).');

  const seedRaw = $('#seed').value.trim();
  const seed = seedRaw === '' ? null : Number(seedRaw);
  if (seed !== null && !(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32)) return fail('seed', 'Graine : entier entre 0 et 4 294 967 295, ou vide.');

  const riskEl = document.querySelector('input[name="risk"]:checked');
  const params = sanitizeParams({
    capital: raw('capital'), monthly: raw('monthly'), horizon: raw('horizon'),
    peaAnciennete: raw('peaAnciennete'), avAnciennete: raw('avAnciennete'),
    inflation: raw('inflation', 100), contributionGrowth: raw('contributionGrowth', 100),
    perCap: raw('perCap'), df: raw('df'), target,
    envelopeFees: { AV: raw('feeAV', 100), PER: raw('feePER', 100) },
    tmi: Number($('#tmi').value), tmiRetraite: Number($('#tmiRetraite').value),
    couple: $('#couple').value === 'true', targetReal: $('#targetReal').checked,
    bareme: $('#bareme').value, nSims: Number($('#nSims').value), rebalancing: $('#rebalancing').value,
    distribution: $('#distribution').value, assumptionMode: $('#assumptionMode').value,
    risk: riskEl && riskEl.value,
  });
  Object.assign(state, params, { seed });
  return true;
}

function fail(id, message) {
  toast(message, 'error');
  const field = $(`#${id}`);
  if (field) {
    field.closest('details')?.setAttribute('open', '');
    field.focus();
  }
  return false;
}

/** Changement de profil : pré-remplit l'allocation si elle n'a pas été personnalisée. */
export function applyRiskProfile(key) {
  state.risk = key;
  if (!state.allocationCustomized) {
    state.allocations = profileAllocation(key);
  } else {
    toast('Allocation personnalisée conservée : utilisez « Partir de » à l\'étape suivante pour repartir de ce profil.', 'info', 6000);
  }
}

/** Réinitialise tous les paramètres (après confirmation). */
export function resetAll() {
  if (!window.confirm('Réinitialiser tous les paramètres et l\'allocation ?')) return false;
  Object.assign(state, defaultState(), { allocationCustomized: false, simResults: null });
  writeStep1();
  return true;
}

/** Texte d'état des données de marché sous le sélecteur d'hypothèses + bouton inflation. */
export function renderMarketStatus() {
  const m = state.market;
  const status = $('#market-status');
  const btn = $('#btn-use-inflation');
  if (!m) {
    status.textContent = 'Aucune donnée de marché disponible : les modes « historique » et « mixte » utilisent les hypothèses prospectives.';
    btn.hidden = true;
    return;
  }
  const n = Object.keys(m.tickers).length;
  status.textContent = `${state.marketSourceLabel} — ${n} supports cotés, données du ${fmtDate(m.generatedAt)}.`;
  const infl = m.macro.inflationFR;
  if (infl) {
    btn.hidden = false;
    btn.textContent = `Inflation France observée : ${fmtPct(infl.value)} (${fmtDate(infl.period)})`;
    btn.dataset.tip = 'Glissement annuel de l\'IPCH (Eurostat). Une inflation ponctuelle n\'est pas forcément représentative du long terme : la cible de la BCE est 2 %.';
    btn.onclick = () => { $('#inflation').value = String(Math.round(infl.value * 1000) / 10); };
  }
}
