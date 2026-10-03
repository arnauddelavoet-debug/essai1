import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAssumption, buildPlan, portfolioStats, historicalStats, pairCorrelation } from '../src/engine/assumptions.js';
import { CATALOG, findProduct } from '../src/data/catalog.js';
import { ASSET_CLASSES, SAME_CLASS_RHO } from '../src/config/assumptions.js';
import { defaultState } from '../src/state.js';

const market = {
  tickers: {
    'CW8.PA': { mu: 0.12, sigma: 0.13, months: 120 },
    'IWDA.AS': { mu: 0.125, sigma: 0.13, months: 120 },
    'PSP5.PA': { mu: 0.15, sigma: 0.14, months: 30 }, // historique trop court
  },
  correlations: { 'CW8.PA': { 'IEAC.AS': 0.4 } },
};

test('prospectif : hypothèses de la classe d\'actifs', () => {
  const a = resolveAssumption(findProduct('pea-monde'), { mode: 'prospectif', market });
  assert.equal(a.mu, ASSET_CLASSES['actions-monde'].mu);
  assert.equal(a.source, 'prospectif');
});

test('historique : rendement de marché + frais du proxy rajoutés', () => {
  const a = resolveAssumption(findProduct('pea-monde'), { mode: 'historique', market });
  assert.ok(Math.abs(a.mu - (0.12 + 0.0038)) < 1e-12);
  assert.equal(a.sigma, 0.13);
  assert.equal(a.source, 'historique');
});

test('mixte : moyenne des deux sources', () => {
  const a = resolveAssumption(findProduct('pea-monde'), { mode: 'mixte', market });
  assert.ok(Math.abs(a.mu - (0.07 + 0.1238) / 2) < 1e-12);
});

test('historique trop court ou absent : repli sur le prospectif', () => {
  assert.equal(historicalStats(findProduct('pea-sp500'), market), null);
  const a = resolveAssumption(findProduct('pea-sp500'), { mode: 'historique', market });
  assert.equal(a.source, 'prospectif');
  assert.equal(resolveAssumption(findProduct('pea-monde'), { mode: 'historique', market: null }).source, 'prospectif');
});

test('produits à taux garanti : taux du produit, σ = 0, jamais d\'historique', () => {
  const a = resolveAssumption(findProduct('livret-a'), { mode: 'historique', market });
  assert.equal(a.sigma, 0);
  assert.equal(a.source, 'taux');
});

test('surcharge manuelle prioritaire, σ non modifiable sur un produit garanti', () => {
  const a = resolveAssumption(findProduct('pea-monde'), { mode: 'prospectif', market, override: { mu: 0.05, sigma: 0.2, ter: 0.01 } });
  assert.deepEqual([a.mu, a.sigma, a.ter, a.source], [0.05, 0.2, 0.01, 'manuel']);
  const l = resolveAssumption(findProduct('livret-a'), { mode: 'prospectif', market, override: { sigma: 0.2 } });
  assert.equal(l.sigma, 0);
});

test('buildPlan : dérive nette des frais du support et de l\'enveloppe', () => {
  const s = { ...defaultState(), allocations: { 'av-uc-monde': 60, 'livret-a': 40 } };
  const { lines } = buildPlan(s, CATALOG, null);
  const uc = lines.find(l => l.id === 'av-uc-monde');
  assert.ok(Math.abs(uc.mu - (0.07 - 0.002 - 0.005)) < 1e-12);
  assert.ok(Math.abs(uc.fee - 0.007) < 1e-12);
  assert.ok(Math.abs(lines.reduce((a, l) => a + l.weight, 0) - 1) < 1e-12);
});

test('buildPlan : SCPI en direct — impôt annuel sur les loyers déduit de la dérive', () => {
  const s = { ...defaultState(), tmi: 30, allocations: { 'scpi-direct': 100 } };
  const { lines } = buildPlan(s, CATALOG, null);
  assert.ok(Math.abs(lines[0].annualTax - 0.046 * 0.472) < 1e-12);
  assert.ok(Math.abs(lines[0].mu - (0.042 - 0.046 * 0.472)) < 1e-12);
  assert.equal(lines[0].entryFee, 0.08);
});

test('buildPlan : frais d\'entrée personnalisés', () => {
  const s = { ...defaultState(), allocations: { 'scpi-direct': 100 }, entryFees: { 'scpi-direct': 0.03 } };
  assert.equal(buildPlan(s, CATALOG, null).lines[0].entryFee, 0.03);
});

test('corrélations : même classe, classes différentes, lignes garanties', () => {
  const s = { ...defaultState(), allocations: { 'pea-monde': 40, 'av-uc-monde': 30, 'livret-a': 30 } };
  const { correlation, lines } = buildPlan(s, CATALOG, null);
  const i = lines.findIndex(l => l.id === 'pea-monde');
  const j = lines.findIndex(l => l.id === 'av-uc-monde');
  const k = lines.findIndex(l => l.id === 'livret-a');
  assert.equal(correlation[i][j], SAME_CLASS_RHO);
  assert.equal(correlation[i][k], 0);
});

test('corrélations historiques : utilisées en mode historique, moyennées en mode mixte', () => {
  const pa = { product: findProduct('pea-monde'), assumption: { sigma: 0.15 } };
  const pb = { product: findProduct('av-uc-oblig'), assumption: { sigma: 0.06 } };
  assert.equal(pairCorrelation(pa, pb, 'historique', market), 0.4);
  assert.ok(Math.abs(pairCorrelation(pa, pb, 'mixte', market) - (0.30 + 0.4) / 2) < 1e-12);
  assert.equal(pairCorrelation(pa, pb, 'prospectif', market), 0.30);
});

test('portfolioStats : volatilité analytique avec corrélations', () => {
  const lines = [{ weight: 0.5, mu: 0.06, sigma: 0.2 }, { weight: 0.5, mu: 0.02, sigma: 0.1 }];
  const r = portfolioStats(lines, [[1, 0.5], [0.5, 1]]);
  assert.ok(Math.abs(r.mu - 0.04) < 1e-12);
  const v = 0.25 * 0.04 + 0.25 * 0.01 + 2 * 0.25 * 0.5 * 0.2 * 0.1;
  assert.ok(Math.abs(r.sigma - Math.sqrt(v)) < 1e-12);
});
