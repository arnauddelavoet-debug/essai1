import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmt, fmtPct, fmtPctSigned, fmtCompact, fmtPdf, fmtPctPdf, fmtDate } from '../src/ui/format.js';

const norm = s => s.replace(/[  ]/g, ' ');

test('fmt : euros arrondis, séparateurs français', () => {
  assert.equal(norm(fmt(10000)), '10 000 €');
  assert.equal(norm(fmt(-1234.6)), '-1 235 €');
  assert.equal(fmt(NaN), '—');
});

test('fmtPct et fmtPctSigned : virgule décimale', () => {
  assert.equal(norm(fmtPct(0.153)), '15,3 %');
  assert.equal(norm(fmtPct(0.153, 0)), '15 %');
  assert.equal(norm(fmtPctSigned(0.042)), '+4,2 %');
  assert.equal(norm(fmtPctSigned(-0.01)), '−1,0 %');
  assert.equal(fmtPct(Infinity), '—');
});

test('fmtCompact : axes de graphiques', () => {
  assert.equal(norm(fmtCompact(850)), '850 €');
  assert.equal(norm(fmtCompact(12_400)), '12 k€');
  assert.equal(norm(fmtCompact(1_250_000)), '1,3 M€');
});

test('formats PDF : ASCII uniquement', () => {
  assert.equal(fmtPdf(1234567), '1 234 567 EUR');
  assert.equal(fmtPdf(-500), '-500 EUR');
  assert.equal(fmtPdf(NaN), '-');
  assert.equal(fmtPctPdf(0.128), '12,8 %');
  assert.ok(/^[\x20-\x7E]+$/.test(fmtPdf(9876543.21) + fmtPctPdf(0.5)));
});

test('fmtDate : mois et dates ISO', () => {
  assert.equal(fmtDate('2026-08'), 'août 2026');
  assert.match(fmtDate('2026-09-30T10:00:00Z'), /30 septembre 2026/);
  assert.equal(fmtDate(null), '—');
});
