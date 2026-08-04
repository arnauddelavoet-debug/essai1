import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcTax } from '../src/tax.js';

test('un gain nul ou négatif ne génère aucun impôt, quel que soit le véhicule', () => {
  for (const vehicle of ['Livret', 'PEA', 'AV', 'CTO']) {
    assert.deepEqual(calcTax(0, vehicle, 10, 30), { irTax: 0, psTax: 0, total: 0 });
    assert.deepEqual(calcTax(-500, vehicle, 10, 30), { irTax: 0, psTax: 0, total: 0 });
  }
});

test('Livret A/LDDS/LEP sont toujours exonérés, même avec un gain positif', () => {
  assert.deepEqual(calcTax(1000, 'Livret', 20, 45), { irTax: 0, psTax: 0, total: 0 });
});

test('PEA >= 5 ans : exonération IR, PS 17,2 % uniquement', () => {
  const r = calcTax(1000, 'PEA', 5, 30);
  assert.equal(r.irTax, 0);
  assert.ok(Math.abs(r.psTax - 172) < 1e-9);
  assert.ok(Math.abs(r.total - 172) < 1e-9);
});

test('PEA < 5 ans : flat tax 30 % (IR 12,8 % + PS 17,2 %)', () => {
  const r = calcTax(1000, 'PEA', 4, 30);
  assert.ok(Math.abs(r.irTax - 128) < 1e-9);
  assert.ok(Math.abs(r.psTax - 172) < 1e-9);
  assert.ok(Math.abs(r.total - 300) < 1e-9);
});

test('AV >= 8 ans avec gain sous l\'abattement de 4600 € : aucun impôt', () => {
  const r = calcTax(4000, 'AV', 8, 30);
  assert.deepEqual(r, { irTax: 0, psTax: 0, total: 0 });
});

test('AV >= 8 ans avec gain au-dessus de l\'abattement : taux réduit 7,5 % + PS sur la part imposable', () => {
  const r = calcTax(10000, 'AV', 8, 30);
  // taxable = 10000 - 4600 = 5400 ; irRate = min(0.075, 0.30) = 0.075
  assert.ok(Math.abs(r.irTax - 5400 * 0.075) < 1e-9);
  assert.ok(Math.abs(r.psTax - 5400 * 0.172) < 1e-9);
  assert.ok(Math.abs(r.total - 5400 * 0.247) < 1e-6);
});

test('AV >= 8 ans : le taux IR réduit est plafonné par une TMI plus basse', () => {
  const r = calcTax(10000, 'AV', 8, 0); // TMI 0 % < 7,5 %
  assert.ok(Math.abs(r.irTax - 5400 * 0) < 1e-9);
});

test('AV < 8 ans : flat tax 30 %, pas d\'abattement', () => {
  const r = calcTax(10000, 'AV', 7, 30);
  assert.ok(Math.abs(r.total - 3000) < 1e-9);
});

test('CTO utilise le PFU 30 % quand la TMI est élevée (plus avantageux)', () => {
  const r = calcTax(1000, 'CTO', 10, 45); // tmiTotal = (0.45+0.172)=62.2% > 30%
  assert.ok(Math.abs(r.total - 300) < 1e-9);
  assert.ok(Math.abs(r.irTax - 128) < 1e-9);
});

test('CTO bascule sur le barème TMI + PS quand c\'est plus avantageux que le PFU', () => {
  const r = calcTax(1000, 'CTO', 10, 0); // tmiTotal = (0+0.172)=17.2% < 30%
  assert.ok(Math.abs(r.total - 172) < 1e-9);
  assert.ok(Math.abs(r.irTax - 0) < 1e-9);
});
