import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocationTotal, isComplete, normalizeAllocation, profileAllocation, allocationByVehicle, equityShare, allocationWarnings, investedByProduct } from '../src/engine/allocation.js';
import { CATALOG } from '../src/data/catalog.js';
import { defaultState } from '../src/state.js';

const has = (warnings, re) => warnings.some(w => re.test(w.text));

test('total et complétude', () => {
  assert.equal(allocationTotal({ a: 60, b: 40, c: 0 }), 100);
  assert.ok(isComplete({ a: 60, b: 40.02 }));
  assert.ok(!isComplete({ a: 60, b: 39 }));
});

test('normalizeAllocation : totalise exactement 100 au dixième près', () => {
  const n = normalizeAllocation({ a: 1, b: 1, c: 1 });
  assert.equal(Math.round(allocationTotal(n) * 10) / 10, 100);
  assert.deepEqual(normalizeAllocation({}), {});
  assert.deepEqual(normalizeAllocation({ a: 30, b: 0 }), { a: 100 });
});

test('profileAllocation renvoie une copie modifiable', () => {
  const a = profileAllocation('dynamique');
  a['livret-a'] = 99;
  assert.notEqual(profileAllocation('dynamique')['livret-a'], 99);
});

test('répartition par enveloppe et part actions', () => {
  const alloc = { 'pea-monde': 50, 'livret-a': 30, 'av-uc-monde': 20 };
  assert.deepEqual(allocationByVehicle(alloc, CATALOG), { PEA: 50, LIVRET: 30, AV: 20 });
  assert.equal(equityShare(alloc, CATALOG), 70);
});

test('investedByProduct : capital + versements indexés', () => {
  const s = { ...defaultState(), capital: 1000, monthly: 100, horizon: 2, contributionGrowth: 0, allocations: { 'livret-a': 100 } };
  assert.deepEqual(investedByProduct(s), { 'livret-a': { initial: 1000, total: 3400 } });
});

test('alerte de dépassement du plafond du Livret A', () => {
  const s = { ...defaultState(), capital: 30_000, allocations: { 'livret-a': 100 } };
  assert.ok(has(allocationWarnings(s, CATALOG, null), /plafond réglementaire/));
});

test('alertes pédagogiques PEA < 5 ans et AV < 8 ans', () => {
  const s = { ...defaultState(), horizon: 3, allocations: { 'pea-monde': 50, 'av-fonds-euros': 50 } };
  const w = allocationWarnings(s, CATALOG, null);
  assert.ok(has(w, /PEA retiré avant 5 ans/));
  assert.ok(has(w, /avant 8 ans/));
  const s2 = { ...s, peaAnciennete: 5, avAnciennete: 8 };
  const w2 = allocationWarnings(s2, CATALOG, null);
  assert.ok(!has(w2, /PEA retiré avant/));
  assert.ok(!has(w2, /avant 8 ans/));
});

test('alertes crypto hors profil dynamique et actions à court terme', () => {
  const s = { ...defaultState(), risk: 'conservateur', horizon: 2, allocations: { 'crypto-btc': 10, 'pea-monde': 90 } };
  const w = allocationWarnings(s, CATALOG, null);
  assert.ok(has(w, /Crypto-actifs 10 %/));
  assert.ok(has(w, /Actions 90 %/));
});

test('alerte PER avec TMI faible et plafond de déduction dépassé', () => {
  const s = { ...defaultState(), tmi: 11, capital: 50_000, allocations: { 'per-uc-monde': 100 } };
  const w = allocationWarnings(s, CATALOG, null);
  assert.ok(has(w, /TMI de 0 ou 11 %/));
  assert.ok(has(w, /plafond de déduction/));
});

test('alerte d\'adéquation volatilité / profil', () => {
  const s = { ...defaultState(), risk: 'conservateur' };
  assert.ok(has(allocationWarnings(s, CATALOG, { sigma: 0.2 }), /supérieure à la plage/));
  assert.ok(has(allocationWarnings({ ...s, risk: 'dynamique' }, CATALOG, { sigma: 0.02 }), /inférieure à la plage/));
});
