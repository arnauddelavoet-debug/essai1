import { ASSET_CLASSES, CLASS_CORRELATIONS, SAME_CLASS_RHO } from '../config/assumptions.js';
import { lookupRho, buildMatrix } from './correlation.js';
import { landIncomeTaxRate } from './tax.js';

/** Historique minimal (mois) pour qu'une statistique de marché soit utilisée. */
export const MIN_HISTORY_MONTHS = 60;

export const ASSUMPTION_MODES = Object.freeze({
  prospectif: 'Prospectif (consensus long terme)',
  historique: 'Historique (données de marché)',
  mixte: 'Mixte (moyenne des deux)',
});

/**
 * Statistiques historiques exploitables d'un produit, ou null si le
 * produit n'a pas de cotation ou un historique trop court.
 */
export function historicalStats(product, market) {
  if (!product.marketTicker || !market || !market.tickers) return null;
  const h = market.tickers[product.marketTicker];
  if (!h || !Number.isFinite(h.mu) || !Number.isFinite(h.sigma) || (h.months || 0) < MIN_HISTORY_MONTHS) return null;
  // Le cours historique est déjà net des frais du fonds coté : on les
  // rajoute pour obtenir un rendement brut comparable aux hypothèses.
  const proxyTer = product.proxyTer ?? product.ter ?? 0;
  return { mu: h.mu + proxyTer, sigma: h.sigma, months: h.months, ticker: product.marketTicker };
}

/**
 * Hypothèses (μ brut de frais, σ) retenues pour un produit.
 * @param {object} product           entrée du catalogue
 * @param {object} ctx
 * @param {'prospectif'|'historique'|'mixte'} ctx.mode
 * @param {object|null} ctx.market   données de marché (snapshot ou API)
 * @param {{mu?: number, sigma?: number, ter?: number}} [ctx.override] saisie manuelle
 * @returns {{ mu: number, sigma: number, ter: number, source: string, prior: {mu:number, sigma:number}, hist: object|null }}
 */
export function resolveAssumption(product, { mode, market, override }) {
  const cls = ASSET_CLASSES[product.assetClass];
  if (!cls) throw new Error(`Classe d'actifs inconnue : ${product.assetClass}`);

  const deterministic = product.rate !== undefined;
  const prior = deterministic ? { mu: product.rate, sigma: 0 } : { mu: cls.mu, sigma: cls.sigma };
  const hist = deterministic ? null : historicalStats(product, market);

  let mu = prior.mu, sigma = prior.sigma, source = 'prospectif';
  if (hist && mode === 'historique') {
    mu = hist.mu; sigma = hist.sigma; source = 'historique';
  } else if (hist && mode === 'mixte') {
    mu = (prior.mu + hist.mu) / 2; sigma = (prior.sigma + hist.sigma) / 2; source = 'mixte';
  } else if (deterministic) {
    source = 'taux';
  }

  let ter = product.ter || 0;
  if (override) {
    if (Number.isFinite(override.mu)) { mu = override.mu; source = 'manuel'; }
    if (Number.isFinite(override.sigma) && !deterministic) { sigma = Math.max(0, override.sigma); source = 'manuel'; }
    if (Number.isFinite(override.ter)) { ter = Math.max(0, override.ter); source = 'manuel'; }
  }
  return { mu, sigma, ter, source, prior, hist };
}

/**
 * Transforme l'état utilisateur en plan de simulation : lignes nettes
 * de frais et de fiscalité annuelle, matrice de corrélation.
 * @param {object} s état (voir state.js)
 * @param {object[]} catalog
 * @param {object|null} market
 */
export function buildPlan(s, catalog, market) {
  const lines = [];
  const resolved = [];
  for (const [id, pct] of Object.entries(s.allocations)) {
    if (!(pct > 0)) continue;
    const product = catalog.find(p => p.id === id);
    if (!product) continue;
    const a = resolveAssumption(product, { mode: s.assumptionMode, market, override: s.overrides[id] });
    const envFee = product.envelopeFee ? (s.envelopeFees[product.vehicle] || 0) : 0;
    const annualTax = product.vehicle === 'SCPI' && product.incomeYield
      ? product.incomeYield * landIncomeTaxRate(s.tmi)
      : 0;
    const fee = a.ter + envFee;
    lines.push({
      id,
      vehicle: product.vehicle,
      weight: pct / 100,
      mu: a.mu - fee - annualTax,
      sigma: a.sigma,
      fee,
      annualTax,
      entryFee: s.entryFees[id] ?? product.entryFee ?? 0,
    });
    resolved.push({ product, assumption: a, envFee, fee, annualTax });
  }

  // Normalise les pondérations (arrondis de saisie) pour que Σ = 1 exactement.
  const sumW = lines.reduce((acc, l) => acc + l.weight, 0);
  if (sumW > 0) lines.forEach(l => { l.weight /= sumW; });

  const correlation = buildMatrix(lines.length, (i, j) =>
    pairCorrelation(resolved[i], resolved[j], s.assumptionMode, market));

  return { lines, resolved, correlation };
}

/** Corrélation entre deux lignes selon le mode d'hypothèses. */
export function pairCorrelation(a, b, mode, market) {
  if (a.assumption.sigma === 0 || b.assumption.sigma === 0) return 0;
  const pa = a.product, pb = b.product;
  const prior = pa.assetClass === pb.assetClass
    ? SAME_CLASS_RHO
    : lookupRho(CLASS_CORRELATIONS, pa.assetClass, pb.assetClass);
  if (mode === 'prospectif' || !market || !market.correlations) return prior;
  if (!pa.marketTicker || !pb.marketTicker) return prior;
  if (pa.marketTicker === pb.marketTicker) return SAME_CLASS_RHO;
  const hist = lookupHistRho(market.correlations, pa.marketTicker, pb.marketTicker);
  if (hist === null) return prior;
  return mode === 'historique' ? hist : (prior + hist) / 2;
}

function lookupHistRho(table, a, b) {
  const direct = table[a] && table[a][b];
  if (Number.isFinite(direct)) return direct;
  const reverse = table[b] && table[b][a];
  if (Number.isFinite(reverse)) return reverse;
  return null;
}

/**
 * Rendement et volatilité analytiques du portefeuille (nets de frais) :
 * μ_P = Σ wᵢ μᵢ ; σ_P = √(Σᵢ Σⱼ wᵢ wⱼ ρᵢⱼ σᵢ σⱼ).
 */
export function portfolioStats(lines, correlation) {
  let mu = 0, variance = 0;
  for (let i = 0; i < lines.length; i++) {
    mu += lines[i].weight * lines[i].mu;
    for (let j = 0; j < lines.length; j++) {
      variance += lines[i].weight * lines[j].weight * correlation[i][j] * lines[i].sigma * lines[j].sigma;
    }
  }
  const sigma = Math.sqrt(Math.max(0, variance));
  return { mu, sigma, median: mu - 0.5 * sigma * sigma };
}
