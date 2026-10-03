import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCsv, csvCell } from '../src/ui/export.js';
import { runSimulation } from '../src/engine/simulation.js';
import { buildPlan } from '../src/engine/assumptions.js';
import { CATALOG } from '../src/data/catalog.js';
import { defaultState } from '../src/state.js';

test('csvCell : virgule décimale, échappement et neutralisation des formules', () => {
  assert.equal(csvCell(1234.5), '1234,50');
  assert.equal(csvCell('a;b'), '"a;b"');
  assert.equal(csvCell('dit "oui"'), '"dit ""oui"""');
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('+33'), "'+33");
  assert.equal(csvCell(undefined), '');
});

test('buildCsv : export complet d\'une simulation réelle', () => {
  const s = { ...defaultState(), nSims: 200 };
  s.plan = buildPlan(s, CATALOG, null);
  const r = runSimulation({
    capital: s.capital, horizon: s.horizon, monthly: s.monthly, lines: s.plan.lines, correlation: s.plan.correlation,
    tax: { tmi: s.tmi }, inflation: s.inflation, nSims: 200, seed: 1,
  });
  const csv = buildCsv(s, r);
  assert.ok(csv.startsWith('﻿SimuPortefeuille'));
  assert.match(csv, /Médiane brute/);
  assert.equal(csv.split('\r\n').filter(l => /^\d+;/.test(l)).length, s.horizon + 1);
  for (const { product } of s.plan.resolved) assert.ok(csv.includes(product.name));
});
