import { calcTax } from './tax.js';
import { buildCorrelationMatrix, cholesky, applyCholesky } from './correlation.js';

const VEHICLES = ['Livret', 'PEA', 'AV', 'CTO'];

// Box-Muller produit deux variables N(0,1) indépendantes (cos et sin) par
// paire de tirages uniformes ; on met en cache la seconde ("spare") au lieu
// de la jeter, ce qui divise par deux le nombre de Math.random()/Math.log
// dans la boucle chaude de la simulation.
let spareRandn = null;

function randn() {
  if (spareRandn !== null) {
    const v = spareRandn;
    spareRandn = null;
    return v;
  }
  let u = 0, v1 = 0;
  while (u === 0) u = Math.random();
  while (v1 === 0) v1 = Math.random();
  const mag = Math.sqrt(-2 * Math.log(u));
  spareRandn = mag * Math.sin(2 * Math.PI * v1);
  return mag * Math.cos(2 * Math.PI * v1);
}

/** Retourne le percentile p (0–100) d'un tableau trié croissant. */
export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function getRho(idA, idB, correlations) {
  if (idA === idB) return 1;
  const direct = correlations[idA] && correlations[idA][idB];
  if (direct !== undefined) return direct;
  const reverse = correlations[idB] && correlations[idB][idA];
  if (reverse !== undefined) return reverse;
  return 0;
}

function resolveActive(alloc, products) {
  return Object.entries(alloc)
    .filter(([, pct]) => pct > 0)
    .map(([id, pct]) => ({ id, w: pct / 100, p: products.find(x => x.id === id) }))
    .filter(({ p }) => p);
}

/**
 * Paramètres analytiques (μ, σ) du portefeuille, pondérés par allocation
 * et corrélations — utilisé pour l'affichage synthétique (jauge de
 * risque), indépendamment de la simulation Monte Carlo.
 * σ_P = √(Σᵢ Σⱼ wᵢ wⱼ ρᵢⱼ σᵢ σⱼ)
 */
export function blendedParams(alloc, products, correlations) {
  const active = resolveActive(alloc, products);

  let mu = 0;
  for (const { w, p } of active) mu += w * p.mu;

  let varP = 0;
  for (const a of active) {
    for (const b of active) {
      const rho = getRho(a.id, b.id, correlations);
      varP += a.w * b.w * rho * a.p.sigma * b.p.sigma;
    }
  }
  return { mu, sigma: Math.sqrt(Math.max(0, varP)) };
}

/**
 * Moteur de simulation Monte Carlo joint et corrélé, à pas mensuel.
 * Chaque scénario simule tous les produits détenus ensemble (chocs
 * corrélés via décomposition de Cholesky), avec versements mensuels
 * répartis selon les pondérations cibles, puis applique la fiscalité
 * au gain réel de CE scénario — jamais à une médiane recalculée
 * séparément. Les percentiles bruts et nets proviennent donc de la
 * même famille de scénarios (cohérence statistique).
 */
export function runSimulation({ capital, horizon, mensuel, alloc, tmi, products, correlations, nSims = 10000 }) {
  const active = resolveActive(alloc, products);
  if (active.length === 0) {
    throw new Error('Aucun produit alloué — impossible de simuler.');
  }

  const ids = active.map(a => a.id);
  const corrMatrix = buildCorrelationMatrix(ids, correlations);
  const L = cholesky(corrMatrix);

  const dt = 1 / 12;
  const months = Math.round(horizon * 12);

  const grossFinals = new Float64Array(nSims);
  const netFinals = new Float64Array(nSims);

  const productFinals = {};
  ids.forEach(id => { productFinals[id] = new Float64Array(nSims); });

  const vehicleFinals = {};
  const vehicleCapital = {};
  VEHICLES.forEach(v => { vehicleFinals[v] = new Float64Array(nSims); vehicleCapital[v] = 0; });
  active.forEach(({ w, p }) => { vehicleCapital[p.vehicleFiscal] += capital * w; });

  const pctPaths = { p10: [capital], p25: [capital], p50: [capital], p75: [capital], p90: [capital] };
  const yearlySnapshots = Array.from({ length: horizon }, () => new Float64Array(nSims));

  // Buffers réutilisés à chaque mois × scénario (active.length est constant
  // pour toute la simulation) — évite ~3,6M allocations de petits tableaux
  // dans le cas typique (nSims=10000, horizon=30, plusieurs produits).
  const shocksBuf = new Float64Array(active.length);
  const correlatedBuf = new Float64Array(active.length);

  for (let s = 0; s < nSims; s++) {
    const values = active.map(({ w }) => capital * w);
    let monthInYear = 0;
    let yearIdx = 0;

    for (let m = 0; m < months; m++) {
      for (let k = 0; k < active.length; k++) shocksBuf[k] = randn();
      applyCholesky(L, shocksBuf, correlatedBuf);

      for (let i = 0; i < active.length; i++) {
        const { w, p } = active[i];
        if (p.sigma === 0) {
          values[i] *= Math.pow(1 + p.mu, dt);
        } else {
          values[i] *= Math.exp((p.mu - 0.5 * p.sigma * p.sigma) * dt + p.sigma * Math.sqrt(dt) * correlatedBuf[i]);
        }
        values[i] += mensuel * w;
      }

      monthInYear++;
      if (monthInYear === 12) {
        monthInYear = 0;
        const portfolioValue = values.reduce((a, b) => a + b, 0);
        yearlySnapshots[yearIdx][s] = portfolioValue;
        yearIdx++;
      }
    }

    // Fiscalité par scénario, agrégée par véhicule fiscal
    let grossTotal = 0;
    const gainByVehicle = {};
    VEHICLES.forEach(v => { gainByVehicle[v] = 0; });

    for (let i = 0; i < active.length; i++) {
      const { w, p } = active[i];
      const finalV = values[i];
      productFinals[p.id][s] = finalV;
      grossTotal += finalV;
      vehicleFinals[p.vehicleFiscal][s] += finalV;

      const invested = capital * w + mensuel * w * months;
      gainByVehicle[p.vehicleFiscal] += (finalV - invested);
    }

    let taxTotal = 0;
    for (const v of VEHICLES) {
      taxTotal += calcTax(gainByVehicle[v], v, horizon, tmi).total;
    }

    grossFinals[s] = grossTotal;
    netFinals[s] = grossTotal - taxTotal;
  }

  const sortedGross = Array.from(grossFinals).sort((a, b) => a - b);
  const sortedNet = Array.from(netFinals).sort((a, b) => a - b);

  const totalInvested = capital + mensuel * 12 * horizon;
  const probLoss = sortedGross.filter(v => v < capital).length / nSims;
  const probLossInvested = sortedGross.filter(v => v < totalInvested).length / nSims;

  for (let y = 0; y < horizon; y++) {
    const sorted = Array.from(yearlySnapshots[y]).sort((a, b) => a - b);
    pctPaths.p10.push(percentile(sorted, 10));
    pctPaths.p25.push(percentile(sorted, 25));
    pctPaths.p50.push(percentile(sorted, 50));
    pctPaths.p75.push(percentile(sorted, 75));
    pctPaths.p90.push(percentile(sorted, 90));
  }

  const productMedians = {};
  for (const id of ids) {
    const sorted = Array.from(productFinals[id]).sort((a, b) => a - b);
    productMedians[id] = percentile(sorted, 50);
  }

  const fiscalByVehicle = {};
  for (const v of VEHICLES) {
    if (vehicleCapital[v] <= 0) continue;
    const sortedV = Array.from(vehicleFinals[v]).sort((a, b) => a - b);
    const finalMed = percentile(sortedV, 50);
    const gain = Math.max(0, finalMed - vehicleCapital[v]);
    const taxDetail = calcTax(gain, v, horizon, tmi);
    fiscalByVehicle[v] = {
      capital: vehicleCapital[v],
      finalValue: finalMed,
      grossGain: gain,
      irTax: taxDetail.irTax,
      psTax: taxDetail.psTax,
      tax: taxDetail.total,
      net: finalMed - taxDetail.total,
    };
  }

  return {
    sortedGross,
    p5: percentile(sortedGross, 5),
    p10: percentile(sortedGross, 10),
    p25: percentile(sortedGross, 25),
    p50: percentile(sortedGross, 50),
    p75: percentile(sortedGross, 75),
    p90: percentile(sortedGross, 90),
    netP10: percentile(sortedNet, 10),
    netP50: percentile(sortedNet, 50),
    netP90: percentile(sortedNet, 90),
    probLoss,
    probLossInvested,
    totalInvested,
    pctPaths,
    productMedians,
    fiscalByVehicle,
  };
}
