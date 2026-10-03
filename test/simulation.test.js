import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSimulation } from '../src/engine/simulation.js';

const TAX = { tmi: 30, tmiRetraite: 30, couple: false, peaAnciennete: 0, avAnciennete: 0, bareme: 'pfu' };
const LIVRET = { id: 'livret', vehicle: 'LIVRET', weight: 1, mu: 0.017, sigma: 0 };
const WORLD = { id: 'world', vehicle: 'PEA', weight: 1, mu: 0.07, sigma: 0.15 };
const base = over => ({ capital: 10_000, horizon: 10, monthly: 0, lines: [LIVRET], tax: TAX, nSims: 500, seed: 42, ...over });

test('refuse une allocation vide', () => {
  assert.throws(() => runSimulation(base({ lines: [] })), /Aucun produit alloué/);
});

test('refuse des pondérations qui ne totalisent pas 100 %', () => {
  assert.throws(() => runSimulation(base({ lines: [{ ...LIVRET, weight: 0.5 }] })), /100 %/);
});

test('refuse un horizon non entier et un contexte fiscal manquant', () => {
  assert.throws(() => runSimulation(base({ horizon: 2.5 })), /horizon/);
  assert.throws(() => runSimulation(base({ tax: undefined })), /TMI/);
});

test('livret à 100 % : résultat déterministe égal à la capitalisation, net = brut', () => {
  const r = runSimulation(base());
  const expected = 10_000 * Math.pow(1.017, 10);
  assert.ok(Math.abs(r.gross.p10 - expected) < 1e-6);
  assert.ok(Math.abs(r.gross.p90 - expected) < 1e-6);
  assert.ok(Math.abs(r.net.p50 - expected) < 1e-6);
  assert.equal(r.probLoss, 0);
});

test('même graine → mêmes résultats ; graine différente → résultats différents', () => {
  const a = runSimulation(base({ lines: [WORLD], seed: 7 }));
  const b = runSimulation(base({ lines: [WORLD], seed: 7 }));
  const c = runSimulation(base({ lines: [WORLD], seed: 8 }));
  assert.equal(a.gross.p50, b.gross.p50);
  assert.deepEqual(Array.from(a.sortedNet), Array.from(b.sortedNet));
  assert.notEqual(a.gross.p50, c.gross.p50);
});

test('la médiane brute converge vers la formule fermée du MBG', () => {
  const r = runSimulation(base({ lines: [WORLD], nSims: 20_000 }));
  const theo = 10_000 * Math.exp((0.07 - 0.5 * 0.15 ** 2) * 10);
  assert.ok(Math.abs(r.gross.p50 - theo) / theo < 0.02, `${r.gross.p50} vs ${theo}`);
});

test('la moyenne brute converge vers capital × e^(μT)', () => {
  const r = runSimulation(base({ lines: [WORLD], nSims: 20_000 }));
  const theo = 10_000 * Math.exp(0.07 * 10);
  assert.ok(Math.abs(r.gross.mean - theo) / theo < 0.03);
});

test('queues épaisses (Student) : même variance, mais pire queue gauche à 1 %', () => {
  const normal = runSimulation(base({ lines: [WORLD], horizon: 1, nSims: 40_000 }));
  const student = runSimulation(base({ lines: [WORLD], horizon: 1, nSims: 40_000, distribution: 'student', df: 3 }));
  const q = (r, p) => r.sortedGross[Math.floor(r.sortedGross.length * p)];
  assert.ok(q(student, 0.001) < q(normal, 0.001), 'la queue extrême doit être plus épaisse');
});

test('les frais réduisent la valeur finale et sont comptabilisés', () => {
  const noFee = runSimulation(base({ lines: [{ ...LIVRET, mu: 0.03 }] }));
  const withFee = runSimulation(base({ lines: [{ ...LIVRET, mu: 0.03 - 0.01, fee: 0.01 }] }));
  assert.ok(withFee.gross.p50 < noFee.gross.p50);
  assert.ok(withFee.fees.managementP50 > 900 && withFee.fees.managementP50 < 1_300);
});

test('frais d\'entrée : prélevés sur chaque versement, base fiscale = montant versé', () => {
  const r = runSimulation(base({ lines: [{ ...LIVRET, mu: 0, entryFee: 0.05, vehicle: 'CTO' }] }));
  assert.ok(Math.abs(r.gross.p50 - 9_500) < 1e-6);
  assert.ok(Math.abs(r.fees.entry - 500) < 1e-6);
  assert.equal(r.taxes.exitP50, 0); // perte de 500 € : pas d'impôt
});

test('versements mensuels et indexation : total investi exact', () => {
  const r = runSimulation(base({ monthly: 100, contributionGrowth: 0.02, horizon: 3 }));
  const expected = 10_000 + 1_200 * (1 + 1.02 + 1.02 ** 2);
  assert.ok(Math.abs(r.invested - expected) < 1e-6);
  assert.equal(r.investedPath.length, 4);
  assert.ok(Math.abs(r.investedPath[3] - expected) < 1e-6);
});

test('le TRI médian d\'un placement déterministe égale son taux', () => {
  const r = runSimulation(base({ monthly: 100, lines: [{ ...LIVRET, mu: 0.03 }] }));
  assert.ok(Math.abs(r.irr.p50 - 0.03) < 1e-4, `TRI ${r.irr.p50}`);
});

test('fiscalité par scénario : compensation des gains et pertes au sein d\'une enveloppe', () => {
  const gain = { id: 'g', vehicle: 'CTO', weight: 0.5, mu: 0.05, sigma: 0 };
  const loss = { id: 'l', vehicle: 'CTO', weight: 0.5, mu: -0.05, sigma: 0 };
  const r = runSimulation(base({ lines: [gain, loss] }));
  const fg = 5_000 * 1.05 ** 10, fl = 5_000 * 0.95 ** 10;
  const tax = (fg + fl - 10_000) * 0.314;
  assert.ok(Math.abs(r.net.p50 - (fg + fl - tax)) < 1e-6);
});

test('net ≤ brut dans tous les scénarios', () => {
  const r = runSimulation(base({ lines: [WORLD], monthly: 200 }));
  for (const k of ['p10', 'p50', 'p90']) assert.ok(r.net[k] <= r.gross[k] + 1e-9);
});

test('euros constants : valeur nette déflatée de l\'inflation', () => {
  const r = runSimulation(base({ inflation: 0.02 }));
  assert.ok(Math.abs(r.netReal.p50 - r.net.p50 / 1.02 ** 10) < 1e-6);
});

test('probabilité d\'atteindre un objectif', () => {
  const r = runSimulation(base({ lines: [WORLD], target: 1 }));
  assert.equal(r.probTarget, 1);
  const r2 = runSimulation(base({ lines: [WORLD], target: 1e9 }));
  assert.equal(r2.probTarget, 0);
  assert.equal(runSimulation(base()).probTarget, null);
});

test('rééquilibrage annuel : restaure les pondérations au sein d\'une enveloppe', () => {
  const up = { id: 'up', vehicle: 'AV', weight: 0.5, mu: 0.10, sigma: 0 };
  const flat = { id: 'flat', vehicle: 'AV', weight: 0.5, mu: 0.0, sigma: 0 };
  const none = runSimulation(base({ lines: [up, flat], horizon: 1, rebalancing: 'none' }));
  const annual = runSimulation(base({ lines: [up, flat], horizon: 1, rebalancing: 'annual' }));
  assert.ok(none.lines.up.p50 > none.lines.flat.p50);
  assert.ok(Math.abs(annual.lines.up.p50 - annual.lines.flat.p50) < 1e-6);
  assert.ok(Math.abs(none.gross.p50 - annual.gross.p50) < 1e-6);
});

test('rééquilibrage : jamais entre enveloppes différentes', () => {
  const pea = { id: 'pea', vehicle: 'PEA', weight: 0.5, mu: 0.10, sigma: 0 };
  const av = { id: 'av', vehicle: 'AV', weight: 0.5, mu: 0.0, sigma: 0 };
  const r = runSimulation(base({ lines: [pea, av], horizon: 2, rebalancing: 'annual' }));
  assert.ok(r.lines.pea.p50 > r.lines.av.p50);
});

test('économie d\'impôt PER calculée sur les versements de chaque année', () => {
  const per = { id: 'per', vehicle: 'PER', weight: 1, mu: 0.02, sigma: 0 };
  const r = runSimulation(base({ lines: [per], monthly: 100, horizon: 2 }));
  assert.ok(Math.abs(r.taxes.perSaving - (10_000 + 1_200 + 1_200) * 0.30) < 1e-6);
});

test('SCPI : l\'impôt annuel sur les loyers est comptabilisé', () => {
  const scpi = { id: 's', vehicle: 'SCPI', weight: 1, mu: 0.04 - 0.02, sigma: 0, annualTax: 0.02 };
  const r = runSimulation(base({ lines: [scpi] }));
  assert.ok(r.taxes.lifetimeP50 > 2_000 && r.taxes.lifetimeP50 < 2_600);
});

test('corrélation : deux actifs parfaitement corrélés ont la même volatilité de portefeuille qu\'un seul', () => {
  const a = { ...WORLD, id: 'a', weight: 0.5 };
  const b = { ...WORLD, id: 'b', weight: 0.5 };
  const corr = runSimulation(base({ lines: [a, b], correlation: [[1, 0.999], [0.999, 1]], nSims: 5_000 }));
  const indep = runSimulation(base({ lines: [a, b], correlation: [[1, 0], [0, 1]], nSims: 5_000 }));
  const spread = r => r.gross.p90 - r.gross.p10;
  assert.ok(spread(corr) > spread(indep) * 1.2);
});

test('drawdown, CVaR et progression sont renseignés', () => {
  const calls = [];
  const r = runSimulation(base({ lines: [WORLD], onProgress: f => calls.push(f) }));
  assert.ok(r.drawdown.p50 > 0 && r.drawdown.p50 < 1);
  assert.ok(r.drawdown.p90 >= r.drawdown.p50);
  assert.ok(r.cvar5 <= r.net.p5 + 1e-9);
  assert.equal(calls.at(-1), 1);
});

test('performance : 10 000 scénarios × 30 ans × 8 lignes en moins de 8 s', () => {
  const lines = Array.from({ length: 8 }, (_, i) => ({ id: `l${i}`, vehicle: 'PEA', weight: 1 / 8, mu: 0.06, sigma: 0.15 }));
  const t0 = Date.now();
  runSimulation(base({ lines, horizon: 30, monthly: 300, nSims: 10_000 }));
  assert.ok(Date.now() - t0 < 8_000, `${Date.now() - t0} ms`);
});

test('TRI renseigné sur un horizon long avec versements (régression)', () => {
  const r = runSimulation(base({ lines: [WORLD], monthly: 200, horizon: 40, nSims: 300 }));
  for (const k of ['p10', 'p50', 'p90']) assert.ok(Number.isFinite(r.irr[k]), `${k} = ${r.irr[k]}`);
  assert.ok(r.irr.p10 < r.irr.p50 && r.irr.p50 < r.irr.p90);
});
