import { PROFILES } from './data/profiles.js';
import { CATALOG } from './data/catalog.js';
import { FISCAL } from './config/fiscal.js';
import { DEFAULT_INFLATION } from './config/assumptions.js';

/** Bornes de saisie — partagées par le formulaire, la validation et le décodage d'URL. */
export const LIMITS = Object.freeze({
  capital: { min: 0, max: 10_000_000 },
  horizon: { min: 1, max: 50 },
  monthly: { min: 0, max: 50_000 },
  contributionGrowth: { min: 0, max: 0.10 },
  inflation: { min: -0.02, max: 0.15 },
  target: { min: 0, max: 100_000_000 },
  anciennete: { min: 0, max: 50 },
  envelopeFee: { min: 0, max: 0.03 },
  entryFee: { min: 0, max: 0.15 },
  mu: { min: -0.5, max: 1 },
  sigma: { min: 0, max: 1.5 },
  ter: { min: 0, max: 0.05 },
  perCap: { min: 0, max: 100_000 },
  df: { min: 3, max: 30 },
});

export const NSIMS_CHOICES = Object.freeze([1_000, 5_000, 10_000, 20_000, 50_000]);

export function defaultState() {
  return {
    capital: 10_000,
    horizon: 15,
    monthly: 200,
    contributionGrowth: 0,
    risk: 'modere',
    tmi: 30,
    tmiRetraite: 30,
    couple: false,
    target: 0,
    targetReal: true,
    inflation: DEFAULT_INFLATION,
    peaAnciennete: 0,
    avAnciennete: 0,
    nSims: 10_000,
    distribution: 'normal',
    df: 5,
    rebalancing: 'annual',
    bareme: 'auto',
    seed: null,
    assumptionMode: 'prospectif',
    envelopeFees: { AV: 0.005, PER: 0.006 },
    perCap: FISCAL.per.plafondDeductionMax,
    allocations: { ...PROFILES.modere.alloc },
    overrides: {},
    entryFees: {},
  };
}

/** État global de l'application (paramètres + résultats de la dernière simulation). */
export const state = {
  ...defaultState(),
  allocationCustomized: false,
  market: null,
  marketSource: null,
  marketSourceLabel: '',
  plan: null,
  simResults: null,
  lastRun: null,
};

const clamp = (v, { min, max }) => Math.min(max, Math.max(min, v));
const num = v => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);

/**
 * Valide et normalise un objet de paramètres venant d'une source non
 * fiable (URL partagée, formulaire) : liste blanche des clés, bornes,
 * identifiants de produits connus. Retourne uniquement les clés valides.
 */
export function sanitizeParams(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  const knownIds = new Set(CATALOG.map(p => p.id));

  const setNum = (key, limits, { integer = false } = {}) => {
    const v = num(raw[key]);
    if (Number.isFinite(v)) out[key] = clamp(integer ? Math.round(v) : v, limits);
  };
  setNum('capital', LIMITS.capital);
  setNum('horizon', LIMITS.horizon, { integer: true });
  setNum('monthly', LIMITS.monthly);
  setNum('contributionGrowth', LIMITS.contributionGrowth);
  setNum('inflation', LIMITS.inflation);
  setNum('target', LIMITS.target);
  setNum('peaAnciennete', LIMITS.anciennete, { integer: true });
  setNum('avAnciennete', LIMITS.anciennete, { integer: true });
  setNum('perCap', LIMITS.perCap);
  setNum('df', LIMITS.df, { integer: true });

  if (FISCAL.tmiBrackets.includes(num(raw.tmi))) out.tmi = num(raw.tmi);
  if (FISCAL.tmiBrackets.includes(num(raw.tmiRetraite))) out.tmiRetraite = num(raw.tmiRetraite);
  if (NSIMS_CHOICES.includes(num(raw.nSims))) out.nSims = num(raw.nSims);
  if (raw.risk in PROFILES) out.risk = raw.risk;
  if (['normal', 'student'].includes(raw.distribution)) out.distribution = raw.distribution;
  if (['none', 'annual'].includes(raw.rebalancing)) out.rebalancing = raw.rebalancing;
  if (['auto', 'pfu', 'bareme'].includes(raw.bareme)) out.bareme = raw.bareme;
  if (['prospectif', 'historique', 'mixte'].includes(raw.assumptionMode)) out.assumptionMode = raw.assumptionMode;
  if (typeof raw.couple === 'boolean') out.couple = raw.couple;
  if (typeof raw.targetReal === 'boolean') out.targetReal = raw.targetReal;
  const seed = num(raw.seed);
  if (Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32) out.seed = seed;

  if (raw.envelopeFees && typeof raw.envelopeFees === 'object') {
    out.envelopeFees = {};
    for (const v of ['AV', 'PER']) {
      const f = num(raw.envelopeFees[v]);
      if (Number.isFinite(f)) out.envelopeFees[v] = clamp(f, LIMITS.envelopeFee);
    }
  }

  if (raw.allocations && typeof raw.allocations === 'object') {
    out.allocations = {};
    for (const [id, pct] of Object.entries(raw.allocations)) {
      const v = num(pct);
      if (knownIds.has(id) && Number.isFinite(v) && v > 0) out.allocations[id] = clamp(v, { min: 0, max: 100 });
    }
  }

  if (raw.overrides && typeof raw.overrides === 'object') {
    out.overrides = {};
    for (const [id, o] of Object.entries(raw.overrides)) {
      if (!knownIds.has(id) || !o || typeof o !== 'object') continue;
      const clean = {};
      for (const k of ['mu', 'sigma', 'ter']) {
        const v = num(o[k]);
        if (Number.isFinite(v)) clean[k] = clamp(v, LIMITS[k]);
      }
      if (Object.keys(clean).length) out.overrides[id] = clean;
    }
  }

  if (raw.entryFees && typeof raw.entryFees === 'object') {
    out.entryFees = {};
    for (const [id, f] of Object.entries(raw.entryFees)) {
      const v = num(f);
      if (knownIds.has(id) && Number.isFinite(v)) out.entryFees[id] = clamp(v, LIMITS.entryFee);
    }
  }
  return out;
}

const SHARED_KEYS = [
  'capital', 'horizon', 'monthly', 'contributionGrowth', 'risk', 'tmi', 'tmiRetraite', 'couple',
  'target', 'targetReal', 'inflation', 'peaAnciennete', 'avAnciennete', 'nSims', 'distribution',
  'df', 'rebalancing', 'bareme', 'seed', 'assumptionMode', 'envelopeFees', 'perCap',
  'allocations', 'overrides', 'entryFees',
];

/** Sérialise les paramètres (pas les résultats) en fragment d'URL base64url. */
export function encodeParams(s) {
  const subset = {};
  for (const k of SHARED_KEYS) subset[k] = s[k];
  const json = JSON.stringify(subset);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Décode un fragment produit par encodeParams ; retourne {} si invalide. */
export function decodeParams(fragment) {
  try {
    const b64 = fragment.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return sanitizeParams(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return {};
  }
}
