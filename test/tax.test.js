import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vehicleTax, computeTaxes, singleVehicleTax, perDeductionSaving, landIncomeTaxRate } from '../src/engine/tax.js';
import { abattementPlusValueImmo } from '../src/config/fiscal.js';

const ctx = (over = {}) => ({ tmi: 30, tmiRetraite: 30, couple: false, peaAge: 10, avAge: 10, holdingYears: 10, bareme: 'pfu', ...over });
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('gain nul ou négatif : aucun impôt, quelle que soit l\'enveloppe (hors PER)', () => {
  for (const v of ['LIVRET', 'PEA', 'AV', 'CTO', 'CRYPTO', 'SCPI']) {
    const t = singleVehicleTax(v, { value: 9_000, invested: 10_000 }, ctx());
    assert.equal(t.total, 0, v);
  }
});

test('livrets réglementés : toujours exonérés', () => {
  assert.equal(singleVehicleTax('LIVRET', { value: 12_000, invested: 10_000 }, ctx({ tmi: 45 })).total, 0);
});

test('PEA ≥ 5 ans : exonération d\'IR, prélèvements sociaux 18,6 % (LFSS 2026)', () => {
  const t = singleVehicleTax('PEA', { value: 11_000, invested: 10_000 }, ctx({ peaAge: 5 }));
  close(t.ir, 0);
  close(t.ps, 186);
});

test('PEA < 5 ans : PFU 31,4 % (12,8 % + 18,6 %)', () => {
  const t = singleVehicleTax('PEA', { value: 11_000, invested: 10_000 }, ctx({ peaAge: 4 }));
  close(t.ir, 128);
  close(t.total, 314);
});

test('CTO et crypto : PFU 31,4 %', () => {
  close(singleVehicleTax('CTO', { value: 2_000, invested: 1_000 }, ctx()).total, 314);
  close(singleVehicleTax('CRYPTO', { value: 2_000, invested: 1_000 }, ctx()).total, 314);
});

test('AV < 8 ans : 12,8 % + PS 17,2 % (l\'AV est exclue de la hausse de CSG)', () => {
  const t = singleVehicleTax('AV', { value: 20_000, invested: 10_000 }, ctx({ avAge: 7 }));
  close(t.ir, 1_280);
  close(t.ps, 1_720);
});

test('AV ≥ 8 ans : abattement 4 600 € sur l\'IR uniquement, PS sur la totalité du gain', () => {
  const t = singleVehicleTax('AV', { value: 20_000, invested: 10_000 }, ctx({ avAge: 8 }));
  close(t.ir, (10_000 - 4_600) * 0.075);
  close(t.ps, 10_000 * 0.172);
});

test('AV ≥ 8 ans en couple : abattement de 9 200 €', () => {
  const t = singleVehicleTax('AV', { value: 20_000, invested: 10_000 }, ctx({ avAge: 8, couple: true }));
  close(t.ir, 800 * 0.075);
});

test('AV ≥ 8 ans : gain sous l\'abattement → seuls les PS sont dus', () => {
  const t = singleVehicleTax('AV', { value: 14_000, invested: 10_000 }, ctx({ avAge: 12 }));
  close(t.ir, 0);
  close(t.ps, 4_000 * 0.172);
});

test('AV ≥ 8 ans au-delà de 150 000 € de primes : 12,8 % sur la fraction excédentaire', () => {
  const t = singleVehicleTax('AV', { value: 400_000, invested: 300_000 }, ctx({ avAge: 10 }));
  const taxable = 100_000 - 4_600;
  close(t.ir, taxable * (0.5 * 0.075 + 0.5 * 0.128));
});

test('PER sortie en capital : versements au barème (TMI retraite), gains au PFU 31,4 %', () => {
  const t = singleVehicleTax('PER', { value: 15_000, invested: 10_000 }, ctx({ tmiRetraite: 11 }));
  close(t.ir, 10_000 * 0.11 + 5_000 * 0.128);
  close(t.ps, 5_000 * 0.186);
});

test('PER en perte : seule la valeur restante est imposée au barème', () => {
  const t = singleVehicleTax('PER', { value: 8_000, invested: 10_000 }, ctx({ tmiRetraite: 30 }));
  close(t.ir, 8_000 * 0.30);
  close(t.ps, 0);
});

test('SCPI en direct : plus-value immobilière 19 % + 17,2 % avec abattements pour durée', () => {
  const t = singleVehicleTax('SCPI', { value: 12_000, invested: 10_000 }, ctx({ holdingYears: 10 }));
  const ab = abattementPlusValueImmo(10);
  close(t.ir, 2_000 * (1 - ab.ir) * 0.19);
  close(t.ps, 2_000 * (1 - ab.ps) * 0.172);
});

test('abattements pour durée de détention : barème légal (22 ans IR, 30 ans PS)', () => {
  assert.deepEqual(abattementPlusValueImmo(5), { ir: 0, ps: 0 });
  close(abattementPlusValueImmo(6).ir, 0.06);
  close(abattementPlusValueImmo(6).ps, 0.0165);
  close(abattementPlusValueImmo(21).ir, 0.96);
  close(abattementPlusValueImmo(22).ir, 1);
  close(abattementPlusValueImmo(22).ps, 0.28);
  close(abattementPlusValueImmo(29).ps, 0.91);
  close(abattementPlusValueImmo(30).ps, 1);
  close(abattementPlusValueImmo(40).ps, 1);
});

test('option barème « auto » : retenue seulement si globalement plus favorable', () => {
  const buckets = { CTO: { value: 2_000, invested: 1_000 } };
  const lowTmi = computeTaxes(buckets, ctx({ tmi: 0, bareme: 'auto' }));
  assert.equal(lowTmi.regime, 'bareme');
  close(lowTmi.ir, 0);
  const highTmi = computeTaxes(buckets, ctx({ tmi: 41, bareme: 'auto' }));
  assert.equal(highTmi.regime, 'pfu');
  close(highTmi.ir, 128);
});

test('option barème : décision globale, pas enveloppe par enveloppe', () => {
  // TMI 11 % : le barème (11 %) bat le PFU (12,8 %) sur le CTO, mais pas sur
  // l'AV ≥ 8 ans (7,5 %). L'option étant globale, elle n'est retenue que si
  // l'IR total est plus faible ; ici l'AV pèse davantage → PFU partout.
  const buckets = { CTO: { value: 2_000, invested: 1_000 }, AV: { value: 30_000, invested: 10_000 } };
  const r = computeTaxes(buckets, ctx({ tmi: 11, avAge: 10, bareme: 'auto' }));
  const pfuIr = 1_000 * 0.128 + (20_000 - 4_600) * 0.075;
  const barIr = 1_000 * 0.11 + (20_000 - 4_600) * 0.11;
  assert.ok(pfuIr < barIr);
  assert.equal(r.regime, 'pfu');
  close(r.ir, pfuIr);
});

test('régime forcé : « bareme » applique la TMI même si défavorable', () => {
  const r = computeTaxes({ CTO: { value: 2_000, invested: 1_000 } }, ctx({ tmi: 45, bareme: 'bareme' }));
  close(r.ir, 450);
});

test('computeTaxes additionne les enveloppes sans compenser les pertes entre elles', () => {
  const r = computeTaxes({
    CTO: { value: 2_000, invested: 1_000 },
    CRYPTO: { value: 500, invested: 1_000 },
  }, ctx());
  close(r.total, 314);
  close(r.byVehicle.CRYPTO.total, 0);
});

test('vehicleTax expose les deux régimes d\'IR', () => {
  const t = vehicleTax('CTO', { value: 2_000, invested: 1_000 }, ctx({ tmi: 41 }));
  close(t.irPfu, 128);
  close(t.irBareme, 410);
});

test('économie d\'impôt PER : versements × TMI dans la limite du plafond annuel', () => {
  close(perDeductionSaving([5_000, 5_000], 30), 3_000);
  close(perDeductionSaving([50_000], 41, 37_680), 37_680 * 0.41);
});

test('taux annuel des revenus fonciers : TMI + 17,2 %', () => {
  close(landIncomeTaxRate(30), 0.472);
});
