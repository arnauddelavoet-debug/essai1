import { test } from 'node:test';
import assert from 'node:assert/strict';
import { percentile, summarize, tailMean, fractionBelow, irr, sortedCopy } from '../src/engine/stats.js';

test('percentile : bornes, interpolation linéaire, tableau vide', () => {
  assert.equal(percentile([], 50), 0);
  const s = [1, 2, 3, 4, 5];
  assert.equal(percentile(s, 0), 1);
  assert.equal(percentile(s, 100), 5);
  assert.equal(percentile(s, 50), 3);
  assert.equal(percentile(s, 10), 1.4);
  assert.equal(percentile([10, 20], 50), 15);
});

test('summarize renvoie les percentiles usuels et la moyenne', () => {
  const s = sortedCopy(Array.from({ length: 101 }, (_, i) => 100 - i));
  const r = summarize(s);
  assert.equal(r.p5, 5);
  assert.equal(r.p50, 50);
  assert.equal(r.p95, 95);
  assert.equal(r.mean, 50);
});

test('tailMean : moyenne des q % pires valeurs', () => {
  const s = sortedCopy(Array.from({ length: 100 }, (_, i) => i));
  assert.equal(tailMean(s, 0.05), 2);
});

test('fractionBelow : recherche dichotomique stricte', () => {
  const s = [1, 2, 2, 3];
  assert.equal(fractionBelow(s, 2), 0.25);
  assert.equal(fractionBelow(s, 0), 0);
  assert.equal(fractionBelow(s, 10), 1);
  assert.equal(fractionBelow([], 1), 0);
});

test('irr : placement unique à 5 %/an', () => {
  const flows = new Array(121).fill(0);
  flows[0] = -1000;
  flows[120] = 1000 * 1.05 ** 10;
  assert.ok(Math.abs(irr(flows) - 0.05) < 1e-6);
});

test('irr : perte totale → NaN (pas de solution au-dessus de −99 %/mois)', () => {
  assert.ok(Number.isNaN(irr([-1000, 0, 0])));
});

test('irr : horizon long (50 ans de versements mensuels) sans débordement numérique', () => {
  const flows = new Array(601).fill(-100);
  flows[0] = -10_000;
  let v = 10_000;
  for (let m = 1; m <= 600; m++) v = v * Math.pow(1.04, 1 / 12) + 100;
  flows[600] += v;
  assert.ok(Math.abs(irr(flows) - 0.04) < 1e-6, String(irr(flows)));
});
