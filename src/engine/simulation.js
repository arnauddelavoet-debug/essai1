import { choleskyRegularized, applyCholesky } from './correlation.js';
import { createRng } from './rng.js';
import { computeTaxes, perDeductionSaving } from './tax.js';
import { summarize, sortedCopy, percentile, fractionBelow, tailMean, irr } from './stats.js';

// ----------------------------------------------------------------
// MOTEUR MONTE CARLO JOINT, CORRÉLÉ, À PAS MENSUEL
//
// Chaque scénario simule toutes les lignes du portefeuille ensemble :
//  1. chocs N(0,1) indépendants → corrélés par Cholesky ;
//  2. option « queues épaisses » : les chocs sont multipliés par un
//     facteur commun √((ν−2)/χ²ν) → loi de Student multivariée de
//     variance unitaire (krachs plus fréquents ET simultanés) ;
//  3. chaque ligne évolue selon un mouvement brownien géométrique
//     de dérive nette de frais (et de fiscalité annuelle éventuelle) ;
//  4. versements mensuels (indexés chaque année) répartis selon les
//     pondérations cibles, après frais d'entrée ;
//  5. rééquilibrage annuel optionnel à l'intérieur des enveloppes qui
//     le permettent sans fiscalité (PEA, AV, PER) ;
//  6. à l'horizon, fiscalité de sortie appliquée au gain réel de CE
//     scénario, enveloppe par enveloppe.
// Les distributions brutes, nettes et en euros constants proviennent
// donc toutes de la même famille de scénarios.
// ----------------------------------------------------------------

/**
 * @typedef {object} SimLine
 * @property {string} id
 * @property {string} vehicle      enveloppe fiscale
 * @property {number} weight       pondération cible (fraction, Σ = 1)
 * @property {number} mu           dérive annuelle nette de frais (arithmétique si sigma > 0,
 *                                 taux actuariel composé si sigma = 0)
 * @property {number} sigma        volatilité annuelle
 * @property {number} [fee]        frais annuels déjà déduits de mu (suivi des frais payés)
 * @property {number} [entryFee]   frais sur versements (fraction)
 * @property {number} [annualTax]  impôt annuel déjà déduit de mu (revenus fonciers), suivi
 */

/**
 * @param {object} p
 * @param {number} p.capital
 * @param {number} p.horizon                années (entier ≥ 1)
 * @param {number} [p.monthly]              versement mensuel de la 1re année
 * @param {number} [p.contributionGrowth]   indexation annuelle des versements
 * @param {SimLine[]} p.lines
 * @param {number[][]} [p.correlation]      matrice n×n (identité par défaut)
 * @param {object} p.tax                    { tmi, tmiRetraite, couple, peaAnciennete, avAnciennete, bareme, perCap }
 * @param {number} [p.inflation]
 * @param {number} [p.target]               objectif de valeur nette (euros nominaux)
 * @param {number} [p.nSims]
 * @param {number} [p.seed]
 * @param {'normal'|'student'} [p.distribution]
 * @param {number} [p.df]                   degrés de liberté de la loi de Student
 * @param {'none'|'annual'} [p.rebalancing]
 * @param {Set<string>|string[]} [p.rebalanceVehicles]
 * @param {(fraction: number) => void} [p.onProgress]
 */
export function runSimulation(p) {
  const {
    capital, horizon, monthly = 0, contributionGrowth = 0, lines,
    tax, inflation = 0, target = 0, nSims = 10_000, seed = 1,
    distribution = 'normal', df = 5, rebalancing = 'none', onProgress,
  } = p;

  validate(p);

  const n = lines.length;
  const correlation = p.correlation || identity(n);
  const { L, shrinkage } = choleskyRegularized(correlation);
  const rng = createRng(seed);
  const useStudent = distribution === 'student';
  const tScaleBase = df - 2;

  const months = horizon * 12;
  const dt = 1 / 12;
  const sqrtDt = Math.sqrt(dt);

  // Coefficients mensuels précalculés par ligne.
  const w = lines.map(l => l.weight);
  const stochastic = lines.map(l => l.sigma > 0);
  const detFactor = lines.map(l => Math.pow(1 + l.mu, dt));
  const driftTerm = lines.map(l => (l.mu - 0.5 * l.sigma * l.sigma) * dt);
  const volTerm = lines.map(l => l.sigma * sqrtDt);
  const feeMonthly = lines.map(l => (l.fee || 0) * dt);
  const annualTaxMonthly = lines.map(l => (l.annualTax || 0) * dt);
  const netEntry = lines.map(l => 1 - (l.entryFee || 0));

  // Enveloppes présentes et index ligne → enveloppe.
  const vehicles = [...new Set(lines.map(l => l.vehicle))];
  const vIndex = lines.map(l => vehicles.indexOf(l.vehicle));

  // Groupes de rééquilibrage (lignes d'une même enveloppe rééquilibrable).
  const rebalanceSet = new Set(p.rebalanceVehicles || ['PEA', 'AV', 'PER']);
  const groups = rebalancing === 'annual'
    ? vehicles
      .filter(v => rebalanceSet.has(v))
      .map(v => {
        const idx = lines.map((l, i) => (l.vehicle === v ? i : -1)).filter(i => i >= 0);
        const sw = idx.reduce((s, i) => s + w[i], 0);
        return { idx, share: idx.map(i => w[i] / sw) };
      })
      .filter(g => g.idx.length > 1)
    : [];

  // Échéancier des versements (déterministe) et montants investis.
  const contribByMonth = new Float64Array(months + 1);
  const yearlyContrib = new Array(horizon).fill(0);
  for (let m = 1; m <= months; m++) {
    const year = Math.floor((m - 1) / 12);
    contribByMonth[m] = monthly * Math.pow(1 + contributionGrowth, year);
    yearlyContrib[year] += contribByMonth[m];
  }
  const totalContrib = yearlyContrib.reduce((a, b) => a + b, 0);
  const invested = capital + totalContrib;
  const investedLine = w.map(wi => wi * invested);
  const investedVehicle = new Float64Array(vehicles.length);
  lines.forEach((_, i) => { investedVehicle[vIndex[i]] += investedLine[i]; });
  const entryFeesPaid = lines.reduce((s, l, i) => s + investedLine[i] * (l.entryFee || 0), 0);

  const investedPath = [capital];
  for (let y = 0; y < horizon; y++) investedPath.push(investedPath[y] + yearlyContrib[y]);

  const taxCtx = {
    tmi: tax.tmi,
    tmiRetraite: tax.tmiRetraite ?? tax.tmi,
    couple: !!tax.couple,
    peaAge: (tax.peaAnciennete || 0) + horizon,
    avAge: (tax.avAnciennete || 0) + horizon,
    holdingYears: horizon,
    bareme: tax.bareme || 'auto',
  };

  // Économie d'impôt PER à l'entrée (déterministe).
  const perWeight = lines.reduce((s, l) => s + (l.vehicle === 'PER' ? l.weight : 0), 0);
  const perSaving = perWeight > 0
    ? perDeductionSaving(yearlyContrib.map((c, y) => perWeight * (c + (y === 0 ? capital : 0))), tax.tmi, tax.perCap)
    : 0;

  // Buffers de résultats.
  const grossFinals = new Float64Array(nSims);
  const netFinals = new Float64Array(nSims);
  const exitTaxes = new Float64Array(nSims);
  const lifetimeTaxes = new Float64Array(nSims);
  const feesPaid = new Float64Array(nSims);
  const maxDrawdowns = new Float64Array(nSims);
  let baremeCount = 0;
  const lineFinals = lines.map(() => new Float64Array(nSims));
  const vehicleValues = vehicles.map(() => new Float64Array(nSims));
  const vehicleIr = vehicles.map(() => new Float64Array(nSims));
  const vehiclePs = vehicles.map(() => new Float64Array(nSims));
  const yearly = Array.from({ length: horizon }, () => new Float64Array(nSims));

  const values = new Float64Array(n);
  const shocks = new Float64Array(n);
  const correlated = new Float64Array(n);
  const progressStep = Math.max(1, Math.floor(nSims / 20));

  for (let s = 0; s < nSims; s++) {
    for (let i = 0; i < n; i++) values[i] = capital * w[i] * netEntry[i];
    let peak = capital;
    let maxDd = 0;
    let fees = 0;
    let lifeTax = 0;

    for (let m = 1; m <= months; m++) {
      for (let i = 0; i < n; i++) shocks[i] = rng.normal();
      applyCholesky(L, shocks, correlated);
      const scale = useStudent ? Math.sqrt(tScaleBase / rng.chiSquare(df)) : 1;

      const contrib = contribByMonth[m];
      let total = 0;
      for (let i = 0; i < n; i++) {
        let v = values[i];
        if (stochastic[i]) v *= Math.exp(driftTerm[i] + volTerm[i] * correlated[i] * scale);
        else v *= detFactor[i];
        fees += v * feeMonthly[i];
        lifeTax += v * annualTaxMonthly[i];
        v += contrib * w[i] * netEntry[i];
        values[i] = v;
        total += v;
      }

      if (total > peak) peak = total;
      else if (peak > 0) {
        const dd = 1 - total / peak;
        if (dd > maxDd) maxDd = dd;
      }

      if (m % 12 === 0) {
        yearly[m / 12 - 1][s] = total;
        for (const g of groups) {
          let gt = 0;
          for (const i of g.idx) gt += values[i];
          for (let k = 0; k < g.idx.length; k++) values[g.idx[k]] = gt * g.share[k];
        }
      }
    }

    // Agrégation par enveloppe et fiscalité de sortie de CE scénario.
    const buckets = {};
    for (let k = 0; k < vehicles.length; k++) buckets[vehicles[k]] = { value: 0, invested: investedVehicle[k] };
    let gross = 0;
    for (let i = 0; i < n; i++) {
      lineFinals[i][s] = values[i];
      buckets[lines[i].vehicle].value += values[i];
      gross += values[i];
    }
    const taxes = computeTaxes(buckets, taxCtx);
    if (taxes.regime === 'bareme') baremeCount++;
    for (let k = 0; k < vehicles.length; k++) {
      vehicleValues[k][s] = buckets[vehicles[k]].value;
      const t = taxes.byVehicle[vehicles[k]];
      vehicleIr[k][s] = t ? t.ir : 0;
      vehiclePs[k][s] = t ? t.ps : 0;
    }

    grossFinals[s] = gross;
    netFinals[s] = gross - taxes.total;
    exitTaxes[s] = taxes.total;
    lifetimeTaxes[s] = lifeTax;
    feesPaid[s] = fees;
    maxDrawdowns[s] = maxDd;

    if (onProgress && (s + 1) % progressStep === 0) onProgress((s + 1) / nSims);
  }

  // ── Agrégation statistique ──
  const deflator = Math.pow(1 + inflation, horizon);
  const sortedGross = sortedCopy(grossFinals);
  const sortedNet = sortedCopy(netFinals);
  const net = summarize(sortedNet);
  const netReal = scaleSummary(net, 1 / deflator);

  const irrOf = finalValue => {
    const flows = new Array(months + 1).fill(0);
    flows[0] = -capital;
    for (let m = 1; m <= months; m++) flows[m] = -contribByMonth[m];
    flows[months] += finalValue;
    return irr(flows);
  };

  const pctPaths = { p10: [capital], p25: [capital], p50: [capital], p75: [capital], p90: [capital] };
  for (let y = 0; y < horizon; y++) {
    const sorted = sortedCopy(yearly[y]);
    for (const k of Object.keys(pctPaths)) pctPaths[k].push(percentile(sorted, Number(k.slice(1))));
  }

  const lineStats = {};
  lines.forEach((l, i) => {
    lineStats[l.id] = { invested: investedLine[i], p50: percentile(sortedCopy(lineFinals[i]), 50) };
  });

  const vehicleStats = {};
  vehicles.forEach((v, k) => {
    const value = percentile(sortedCopy(vehicleValues[k]), 50);
    const ir = percentile(sortedCopy(vehicleIr[k]), 50);
    const ps = percentile(sortedCopy(vehiclePs[k]), 50);
    const nets = new Float64Array(nSims);
    for (let s = 0; s < nSims; s++) nets[s] = vehicleValues[k][s] - vehicleIr[k][s] - vehiclePs[k][s];
    vehicleStats[v] = { invested: investedVehicle[k], value, ir, ps, tax: ir + ps, net: percentile(sortedCopy(nets), 50) };
  });

  const sortedDd = sortedCopy(maxDrawdowns);

  return {
    meta: { nSims, horizon, months, seed, distribution, df, rebalancing, shrinkage, inflation },
    invested,
    capital,
    totalContrib,
    investedPath,
    deflator,
    gross: summarize(sortedGross),
    net,
    netReal,
    sortedGross,
    sortedNet,
    probLoss: fractionBelow(sortedNet, invested),
    probLossReal: fractionBelow(sortedNet, invested * deflator),
    probTarget: target > 0 ? 1 - fractionBelow(sortedNet, target) : null,
    target,
    cvar5: tailMean(sortedNet, 0.05),
    irr: { p10: irrOf(net.p10), p50: irrOf(net.p50), p90: irrOf(net.p90) },
    drawdown: { p50: percentile(sortedDd, 50), p90: percentile(sortedDd, 90) },
    pctPaths,
    lines: lineStats,
    vehicles: vehicleStats,
    taxes: {
      exitP50: percentile(sortedCopy(exitTaxes), 50),
      lifetimeP50: percentile(sortedCopy(lifetimeTaxes), 50),
      baremeShare: baremeCount / nSims,
      perSaving,
    },
    fees: {
      managementP50: percentile(sortedCopy(feesPaid), 50),
      entry: entryFeesPaid,
    },
  };
}

function scaleSummary(summary, k) {
  const out = {};
  for (const [key, v] of Object.entries(summary)) out[key] = v * k;
  return out;
}

function identity(n) {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
}

function validate(p) {
  if (!Array.isArray(p.lines) || p.lines.length === 0) {
    throw new Error('Aucun produit alloué — impossible de simuler.');
  }
  const sumW = p.lines.reduce((s, l) => s + l.weight, 0);
  if (Math.abs(sumW - 1) > 1e-6) throw new Error(`Les pondérations doivent totaliser 100 % (actuellement ${(sumW * 100).toFixed(2)} %).`);
  if (!Number.isInteger(p.horizon) || p.horizon < 1) throw new Error('L\'horizon doit être un nombre entier d\'années ≥ 1.');
  if (!(p.capital >= 0) || !((p.monthly ?? 0) >= 0)) throw new Error('Capital et versements doivent être positifs.');
  if (p.capital === 0 && !(p.monthly > 0)) throw new Error('Capital initial ou versements mensuels requis.');
  if (p.nSims !== undefined && (!Number.isInteger(p.nSims) || p.nSims < 100)) throw new Error('Le nombre de scénarios doit être un entier ≥ 100.');
  if (p.distribution === 'student' && !(Number.isInteger(p.df ?? 5) && (p.df ?? 5) > 2)) throw new Error('Degrés de liberté de Student : entier > 2.');
  if (!p.tax || !Number.isFinite(p.tax.tmi)) throw new Error('Contexte fiscal (TMI) manquant.');
  for (const l of p.lines) {
    if (!Number.isFinite(l.mu) || !Number.isFinite(l.sigma) || l.sigma < 0) {
      throw new Error(`Hypothèses invalides pour « ${l.id} ».`);
    }
  }
}
