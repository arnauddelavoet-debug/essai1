import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCorrelationMatrix, cholesky, applyCholesky } from '../src/correlation.js';

test('buildCorrelationMatrix place 1 sur la diagonale et 0 pour les paires non renseignées', () => {
  const correlations = { a: { b: 0.5 } };
  const m = buildCorrelationMatrix(['a', 'b', 'c'], correlations);
  assert.equal(m[0][0], 1);
  assert.equal(m[1][1], 1);
  assert.equal(m[2][2], 1);
  assert.equal(m[0][1], 0.5);
  assert.equal(m[1][0], 0.5); // symétrie via la paire inverse
  assert.equal(m[0][2], 0);
  assert.equal(m[1][2], 0);
});

test('buildCorrelationMatrix lit la corrélation quel que soit le sens de la paire déclarée', () => {
  const correlations = { b: { a: 0.3 } }; // déclarée dans l'autre sens
  const m = buildCorrelationMatrix(['a', 'b'], correlations);
  assert.equal(m[0][1], 0.3);
  assert.equal(m[1][0], 0.3);
});

test('cholesky reconstruit la matrice d\'origine pour une matrice définie positive', () => {
  const matrix = [
    [1, 0.5],
    [0.5, 1],
  ];
  const L = cholesky(matrix);
  const reconstructed = [
    [L[0][0] * L[0][0], L[0][0] * L[1][0]],
    [L[1][0] * L[0][0], L[1][0] * L[1][0] + L[1][1] * L[1][1]],
  ];
  assert.ok(Math.abs(reconstructed[0][0] - matrix[0][0]) < 1e-9);
  assert.ok(Math.abs(reconstructed[0][1] - matrix[0][1]) < 1e-9);
  assert.ok(Math.abs(reconstructed[1][1] - matrix[1][1]) < 1e-9);
});

test('cholesky se régularise sans planter sur une matrice non définie positive', () => {
  const matrix = [
    [1, 0.9, 0.9],
    [0.9, 1, -0.9],
    [0.9, -0.9, 1],
  ];
  const L = cholesky(matrix);
  for (const row of L) {
    for (const v of row) {
      assert.ok(Number.isFinite(v), 'chaque terme de L doit être fini (pas de NaN)');
    }
  }
});

test('applyCholesky sur une matrice identité ne modifie pas les chocs (aucune corrélation)', () => {
  const L = cholesky([[1, 0], [0, 1]]);
  const shocks = [1.5, -0.7];
  const correlated = applyCholesky(L, shocks);
  assert.ok(Math.abs(correlated[0] - 1.5) < 1e-9);
  assert.ok(Math.abs(correlated[1] - (-0.7)) < 1e-9);
});

test('applyCholesky produit une corrélation empirique proche de la corrélation d\'entrée sur un grand échantillon', () => {
  const rho = 0.7;
  const L = cholesky([[1, rho], [rho, 1]]);
  const N = 20000;
  const xs = [];
  const ys = [];
  for (let i = 0; i < N; i++) {
    const [x, y] = applyCholesky(L, [randn(), randn()]);
    xs.push(x);
    ys.push(y);
  }
  const empiricalRho = sampleCorrelation(xs, ys);
  assert.ok(Math.abs(empiricalRho - rho) < 0.05, `corrélation empirique ${empiricalRho} trop éloignée de ${rho}`);
});

function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function sampleCorrelation(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxy / Math.sqrt(sxx * syy);
}
