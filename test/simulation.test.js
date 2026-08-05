import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSimulation, blendedParams, percentile } from '../src/simulation.js';

const LIVRET = { id: 'livret-a', mu: 0.024, sigma: 0, vehicleFiscal: 'Livret' };
const VOLATILE = { id: 'etf-world', mu: 0.075, sigma: 0.155, vehicleFiscal: 'PEA' };
const AV_PRODUCT = { id: 'fonds-euro', mu: 0.025, sigma: 0.004, vehicleFiscal: 'AV' };

test('percentile retourne 0 pour un tableau vide et gère les bornes', () => {
  assert.equal(percentile([], 50), 0);
  const sorted = [1, 2, 3, 4, 5];
  assert.equal(percentile(sorted, 0), 1);
  assert.equal(percentile(sorted, 100), 5);
});

test('runSimulation leve une erreur si aucun produit n\'est alloue', () => {
  assert.throws(() => runSimulation({
    capital: 10000, horizon: 10, mensuel: 0, tmi: 30,
    alloc: {}, products: [LIVRET], correlations: {}, nSims: 100,
  }), /Aucun produit alloué/);
});

test('portefeuille 100% Livret (sigma=0) : tous les scenarios sont identiques (deterministe)', () => {
  const result = runSimulation({
    capital: 10000, horizon: 10, mensuel: 0, tmi: 30,
    alloc: { 'livret-a': 100 }, products: [LIVRET], correlations: {}, nSims: 500,
  });
  const expected = 10000 * Math.pow(1.024, 10);
  assert.ok(Math.abs(result.p10 - expected) < 1);
  assert.ok(Math.abs(result.p50 - expected) < 1);
  assert.ok(Math.abs(result.p90 - expected) < 1);
  assert.equal(result.probLoss, 0); // rendement positif garanti > capital initial
});

test('la mediane brute d\'un actif volatil converge vers la formule fermee du MBG (sans versements)', () => {
  const result = runSimulation({
    capital: 10000, horizon: 10, mensuel: 0, tmi: 30,
    alloc: { 'etf-world': 100 }, products: [VOLATILE], correlations: {}, nSims: 20000,
  });
  const theoreticalMedian = 10000 * Math.exp((VOLATILE.mu - 0.5 * VOLATILE.sigma * VOLATILE.sigma) * 10);
  const relErr = Math.abs(result.p50 - theoreticalMedian) / theoreticalMedian;
  assert.ok(relErr < 0.05, `mediane simulee ${result.p50} trop eloignee de la theorique ${theoreticalMedian}`);
});

test('la valeur nette est toujours inferieure ou egale a la valeur brute (l\'impot ne peut pas etre negatif)', () => {
  const result = runSimulation({
    capital: 10000, horizon: 10, mensuel: 200, tmi: 30,
    alloc: { 'fonds-euro': 100 }, products: [AV_PRODUCT], correlations: {}, nSims: 5000,
  });
  assert.ok(result.netP50 <= result.p50);
  assert.ok(result.netP10 <= result.p10);
});

test('les versements mensuels augmentent la valeur finale mediane par rapport a un capital seul', () => {
  const withoutContrib = runSimulation({
    capital: 10000, horizon: 10, mensuel: 0, tmi: 30,
    alloc: { 'livret-a': 100 }, products: [LIVRET], correlations: {}, nSims: 500,
  });
  const withContrib = runSimulation({
    capital: 10000, horizon: 10, mensuel: 200, tmi: 30,
    alloc: { 'livret-a': 100 }, products: [LIVRET], correlations: {}, nSims: 500,
  });
  assert.ok(withContrib.p50 > withoutContrib.p50);
});

test('fiscalByVehicle regroupe correctement le capital par vehicule fiscal', () => {
  const result = runSimulation({
    capital: 10000, horizon: 10, mensuel: 0, tmi: 30,
    alloc: { 'livret-a': 50, 'fonds-euro': 50 },
    products: [LIVRET, AV_PRODUCT], correlations: {}, nSims: 500,
  });
  assert.ok(Math.abs(result.fiscalByVehicle['Livret'].capital - 5000) < 1e-6);
  assert.ok(Math.abs(result.fiscalByVehicle['AV'].capital - 5000) < 1e-6);
  assert.equal(result.fiscalByVehicle['Livret'].tax, 0); // Livret jamais imposé
});

test('blendedParams : une correlation positive augmente la volatilite du portefeuille par rapport a une correlation nulle', () => {
  const products = [
    { id: 'a', mu: 0.07, sigma: 0.15 },
    { id: 'b', mu: 0.07, sigma: 0.15 },
  ];
  const alloc = { a: 50, b: 50 };
  const uncorrelated = blendedParams(alloc, products, {});
  const correlated = blendedParams(alloc, products, { a: { b: 0.9 } });
  assert.ok(correlated.sigma > uncorrelated.sigma);
});

test('blendedParams calcule mu comme la moyenne ponderee des rendements', () => {
  const products = [
    { id: 'a', mu: 0.02, sigma: 0 },
    { id: 'b', mu: 0.08, sigma: 0 },
  ];
  const { mu } = blendedParams({ a: 25, b: 75 }, products, {});
  assert.ok(Math.abs(mu - (0.25 * 0.02 + 0.75 * 0.08)) < 1e-9);
});
