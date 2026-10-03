import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, sanitizeParams, encodeParams, decodeParams, LIMITS } from '../src/state.js';

test('encodeParams / decodeParams : aller-retour sans perte', () => {
  const s = { ...defaultState(), capital: 25_000, seed: 12345, overrides: { 'pea-monde': { mu: 0.05 } }, couple: true };
  const d = decodeParams(encodeParams(s));
  assert.equal(d.capital, 25_000);
  assert.equal(d.seed, 12345);
  assert.equal(d.couple, true);
  assert.deepEqual(d.overrides, { 'pea-monde': { mu: 0.05 } });
  assert.deepEqual(d.allocations, s.allocations);
});

test('decodeParams : fragment invalide → objet vide', () => {
  assert.deepEqual(decodeParams('%%%pas-du-base64'), {});
  assert.deepEqual(decodeParams(''), {});
});

test('sanitizeParams : bornes, liste blanche, identifiants inconnus ignorés', () => {
  const r = sanitizeParams({
    capital: 1e12, horizon: 7.6, tmi: 33, risk: 'casino', nSims: 123,
    allocations: { 'livret-a': 50, 'produit-pirate': 50, ldds: -5 },
    overrides: { 'pea-monde': { mu: 5, sigma: 'x' }, inconnu: { mu: 0.1 } },
    __proto__: { polluted: true }, evil: '<script>',
  });
  assert.equal(r.capital, LIMITS.capital.max);
  assert.equal(r.horizon, 8);
  assert.equal(r.tmi, undefined);
  assert.equal(r.risk, undefined);
  assert.equal(r.nSims, undefined);
  assert.deepEqual(r.allocations, { 'livret-a': 50 });
  assert.deepEqual(r.overrides, { 'pea-monde': { mu: LIMITS.mu.max } });
  assert.equal(r.evil, undefined);
  assert.equal({}.polluted, undefined);
});

test('sanitizeParams accepte les nombres sous forme de chaînes (formulaires)', () => {
  assert.equal(sanitizeParams({ capital: '1500' }).capital, 1500);
  assert.equal(sanitizeParams({ capital: '' }).capital, undefined);
});

test('defaultState renvoie des objets indépendants', () => {
  const a = defaultState();
  a.allocations['livret-a'] = 99;
  a.envelopeFees.AV = 0.1;
  const b = defaultState();
  assert.notEqual(b.allocations['livret-a'], 99);
  assert.notEqual(b.envelopeFees.AV, 0.1);
});
