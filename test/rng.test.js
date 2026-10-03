import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, randomSeed } from '../src/engine/rng.js';

test('même graine → même séquence', () => {
  const a = createRng(123), b = createRng(123);
  for (let i = 0; i < 100; i++) assert.equal(a.uniform(), b.uniform());
});

test('graines différentes → séquences différentes', () => {
  assert.notEqual(createRng(1).uniform(), createRng(2).uniform());
});

test('uniform reste dans ]0, 1[ et a une moyenne ≈ 0,5', () => {
  const r = createRng(9);
  let s = 0;
  for (let i = 0; i < 100_000; i++) {
    const u = r.uniform();
    assert.ok(u > 0 && u < 1);
    s += u;
  }
  assert.ok(Math.abs(s / 100_000 - 0.5) < 0.005);
});

test('normal : moyenne ≈ 0, variance ≈ 1, kurtosis ≈ 3', () => {
  const r = createRng(2026);
  const N = 200_000;
  let m1 = 0, m2 = 0, m4 = 0;
  for (let i = 0; i < N; i++) {
    const z = r.normal();
    m1 += z; m2 += z * z; m4 += z ** 4;
  }
  m1 /= N; m2 /= N; m4 /= N;
  assert.ok(Math.abs(m1) < 0.01);
  assert.ok(Math.abs(m2 - 1) < 0.01);
  assert.ok(Math.abs(m4 / (m2 * m2) - 3) < 0.05);
});

test('chiSquare(df) a pour espérance df', () => {
  const r = createRng(5);
  let s = 0;
  for (let i = 0; i < 50_000; i++) s += r.chiSquare(5);
  assert.ok(Math.abs(s / 50_000 - 5) < 0.05);
});

test('randomSeed renvoie un entier 32 bits non signé', () => {
  const s = randomSeed();
  assert.ok(Number.isInteger(s) && s >= 0 && s < 2 ** 32);
});
