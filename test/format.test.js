import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmt, fmtPct, fmtPdf, fmtPctPdf } from '../src/format.js';

test('fmt formate un entier positif avec le signe euro et espace insécable', () => {
  assert.equal(fmt(10000), '10 000 €');
});

test('fmt retourne un tiret cadratin pour les valeurs non finies', () => {
  assert.equal(fmt(NaN), '—');
  assert.equal(fmt(Infinity), '—');
});

test('fmtPct formate un ratio en pourcentage avec une décimale', () => {
  assert.equal(fmtPct(0.153), '15.3 %');
});

test('fmtPct retourne un tiret cadratin pour les valeurs non finies', () => {
  assert.equal(fmtPct(NaN), '—');
});

test('fmtPdf formate avec séparateur espace ASCII et suffixe EUR (compatible jsPDF/Helvetica)', () => {
  assert.equal(fmtPdf(1234567), '1 234 567 EUR');
});

test('fmtPdf gère les valeurs négatives', () => {
  assert.equal(fmtPdf(-500), '-500 EUR');
});

test('fmtPdf retourne un tiret simple pour les valeurs non finies', () => {
  assert.equal(fmtPdf(NaN), '-');
});

test('fmtPctPdf formate un ratio en pourcentage ASCII', () => {
  assert.equal(fmtPctPdf(0.128), '12.8%');
});
