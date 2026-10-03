import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, findProduct } from '../src/data/catalog.js';
import { VEHICLES } from '../src/data/vehicles.js';
import { PROFILES } from '../src/data/profiles.js';
import { ASSET_CLASSES, CLASS_CORRELATIONS } from '../src/config/assumptions.js';
import { FISCAL } from '../src/config/fiscal.js';
import { buildCorrelationMatrix, choleskyStrict } from '../src/engine/correlation.js';

test('identifiants uniques et findProduct', () => {
  const ids = CATALOG.map(p => p.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(findProduct('livret-a').name, 'Livret A');
  assert.equal(findProduct('inconnu'), null);
});

test('chaque produit référence une enveloppe et une classe connues, avec des frais plausibles', () => {
  for (const p of CATALOG) {
    assert.ok(p.vehicle in VEHICLES, `${p.id} : enveloppe ${p.vehicle}`);
    assert.ok(p.assetClass in ASSET_CLASSES, `${p.id} : classe ${p.assetClass}`);
    assert.ok(p.ter >= 0 && p.ter < 0.02, `${p.id} : TER`);
    assert.ok((p.entryFee ?? 0) >= 0 && (p.entryFee ?? 0) <= 0.12, `${p.id} : frais d'entrée`);
    assert.ok(p.sri >= 1 && p.sri <= 7, `${p.id} : SRI`);
    assert.ok(p.description.length > 20);
    if (p.example) assert.match(p.example.isin, /^[A-Z]{2}[A-Z0-9]{9}\d$/, `${p.id} : ISIN`);
    const deterministic = ASSET_CLASSES[p.assetClass].sigma === 0;
    assert.equal(p.rate !== undefined, deterministic, `${p.id} : taux déterministe ⇔ classe sans volatilité`);
  }
});

test('les livrets reprennent les taux et plafonds du millésime fiscal', () => {
  for (const id of ['livret-a', 'ldds', 'lep']) {
    assert.equal(findProduct(id).rate, FISCAL.livrets[id].taux);
    assert.equal(findProduct(id).plafond, FISCAL.livrets[id].plafond);
  }
});

test('les profils totalisent 100 % et ne référencent que des produits existants', () => {
  for (const [key, prof] of Object.entries(PROFILES)) {
    const total = Object.values(prof.alloc).reduce((a, b) => a + b, 0);
    assert.equal(total, 100, key);
    for (const id of Object.keys(prof.alloc)) assert.ok(findProduct(id), `${key} → ${id}`);
    assert.ok(prof.sigmaRange.min < prof.sigmaRange.max);
  }
});

test('la matrice de corrélation prospective entre classes risquées est définie positive', () => {
  const risky = Object.keys(ASSET_CLASSES).filter(k => ASSET_CLASSES[k].sigma > 0);
  const m = buildCorrelationMatrix(risky, CLASS_CORRELATIONS);
  assert.ok(choleskyStrict(m), 'Cholesky strict doit réussir sans régularisation');
  for (const [a, row] of Object.entries(CLASS_CORRELATIONS)) {
    assert.ok(a in ASSET_CLASSES, a);
    for (const [b, r] of Object.entries(row)) {
      assert.ok(b in ASSET_CLASSES, b);
      assert.ok(r >= -1 && r <= 1);
    }
  }
});
