import { FISCAL, abattementPlusValueImmo } from '../config/fiscal.js';

// ----------------------------------------------------------------
// FISCALITÉ À LA SORTIE, PAR ENVELOPPE
//
// Hypothèse de modélisation : rachat total de chaque enveloppe à
// l'horizon, en une seule fois (sortie en capital pour le PER). Les
// gains et pertes des lignes d'une même enveloppe se compensent ; une
// perte nette sur une enveloppe ne génère pas de crédit d'impôt.
//
// Pour chaque enveloppe, on calcule l'IR sous deux régimes — PFU
// (12,8 %) et barème progressif (TMI) — puis on applique l'option
// globale : l'option pour le barème porte en France sur l'ensemble des
// revenus du capital de l'année, jamais enveloppe par enveloppe.
// ----------------------------------------------------------------

/**
 * @typedef {object} TaxContext
 * @property {number} tmi              TMI du foyer, en % (0, 11, 30, 41, 45)
 * @property {number} [tmiRetraite]    TMI à la retraite (PER), en % — défaut : tmi
 * @property {boolean} [couple]        imposition commune (abattement AV doublé)
 * @property {number} peaAge           ancienneté du PEA à la sortie (années)
 * @property {number} avAge            ancienneté de l'assurance-vie à la sortie (années)
 * @property {number} holdingYears     durée de détention des parts de SCPI (années)
 * @property {'auto'|'pfu'|'bareme'} [bareme]  régime d'imposition des revenus du capital
 */

const ZERO = Object.freeze({ gain: 0, ir: 0, ps: 0, total: 0, irPfu: 0, irBareme: 0 });

/**
 * Impôt d'une enveloppe, sous les deux régimes d'IR.
 * @param {string} vehicle
 * @param {{ value: number, invested: number }} bucket
 * @param {TaxContext} ctx
 * @returns {{ gain: number, ps: number, irPfu: number, irBareme: number }}
 */
export function vehicleTax(vehicle, { value, invested }, ctx) {
  const gain = value - invested;
  const tmi = ctx.tmi / 100;
  const pfu = FISCAL.pfuIR;

  if (vehicle === 'PER') {
    // Sortie en capital : la fraction « versements » (déduits à l'entrée)
    // est réintégrée au barème ; la fraction « gains » suit le régime des
    // revenus du capital (PFU ou barème) + PS au taux standard.
    const tmiRet = (ctx.tmiRetraite ?? ctx.tmi) / 100;
    const irCapital = Math.max(0, Math.min(value, invested)) * tmiRet;
    const g = Math.max(0, gain);
    return {
      gain,
      ps: g * FISCAL.ps.standard,
      irPfu: irCapital + g * pfu,
      irBareme: irCapital + g * tmiRet,
    };
  }

  if (gain <= 0 || vehicle === 'LIVRET') return { gain, ps: 0, irPfu: 0, irBareme: 0 };

  switch (vehicle) {
    case 'PEA': {
      const ps = gain * FISCAL.ps.standard;
      if (ctx.peaAge >= FISCAL.pea.ageExoneration) return { gain, ps, irPfu: 0, irBareme: 0 };
      return { gain, ps, irPfu: gain * pfu, irBareme: gain * tmi };
    }
    case 'AV': {
      // Les PS s'appliquent à la totalité du gain ; l'abattement ne
      // concerne que l'impôt sur le revenu.
      const av = FISCAL.assuranceVie;
      const ps = gain * FISCAL.ps.assuranceVie;
      if (ctx.avAge >= av.ageReduit) {
        const abattement = ctx.couple ? av.abattement.couple : av.abattement.seul;
        const taxable = Math.max(0, gain - abattement);
        const shareReduit = invested > 0 ? Math.min(1, av.seuilPrimes / invested) : 1;
        const rate = shareReduit * av.tauxReduit + (1 - shareReduit) * pfu;
        return { gain, ps, irPfu: taxable * rate, irBareme: taxable * tmi };
      }
      return { gain, ps, irPfu: gain * pfu, irBareme: gain * tmi };
    }
    case 'SCPI': {
      // Plus-value immobilière : régime propre, hors option barème.
      const ab = abattementPlusValueImmo(ctx.holdingYears);
      const ir = gain * (1 - ab.ir) * FISCAL.plusValueImmo.tauxIR;
      return { gain, ps: gain * (1 - ab.ps) * FISCAL.ps.foncier, irPfu: ir, irBareme: ir };
    }
    case 'CTO':
    case 'CRYPTO':
    default:
      return { gain, ps: gain * FISCAL.ps.standard, irPfu: gain * pfu, irBareme: gain * tmi };
  }
}

/**
 * Impôts de sortie de l'ensemble des enveloppes d'un scénario.
 * @param {Record<string, {value: number, invested: number}>} buckets
 * @param {TaxContext} ctx
 * @returns {{ total: number, ir: number, ps: number, regime: 'pfu'|'bareme', byVehicle: Record<string, {gain:number, ir:number, ps:number, total:number}> }}
 */
export function computeTaxes(buckets, ctx) {
  const raw = {};
  let sumPfu = 0, sumBareme = 0;
  for (const [v, bucket] of Object.entries(buckets)) {
    if (!bucket || (bucket.value === 0 && bucket.invested === 0)) continue;
    const t = vehicleTax(v, bucket, ctx);
    raw[v] = t;
    sumPfu += t.irPfu;
    sumBareme += t.irBareme;
  }

  let regime;
  if (ctx.bareme === 'bareme') regime = 'bareme';
  else if (ctx.bareme === 'pfu') regime = 'pfu';
  else regime = sumBareme < sumPfu ? 'bareme' : 'pfu';

  const byVehicle = {};
  let ir = 0, ps = 0;
  for (const [v, t] of Object.entries(raw)) {
    const vIr = regime === 'bareme' ? t.irBareme : t.irPfu;
    byVehicle[v] = { gain: t.gain, ir: vIr, ps: t.ps, total: vIr + t.ps };
    ir += vIr;
    ps += t.ps;
  }
  return { total: ir + ps, ir, ps, regime, byVehicle };
}

/** Impôt d'une enveloppe isolée (régime le plus favorable). */
export function singleVehicleTax(vehicle, bucket, ctx) {
  return computeTaxes({ [vehicle]: bucket }, ctx).byVehicle[vehicle] || { ...ZERO };
}

/**
 * Économie d'impôt procurée par la déduction des versements PER :
 * chaque année, versements × TMI dans la limite du plafond de déduction.
 * @param {number[]} yearlyContributions versements PER de chaque année
 * @param {number} tmi TMI en %
 * @param {number} [cap] plafond annuel de déduction
 */
export function perDeductionSaving(yearlyContributions, tmi, cap = FISCAL.per.plafondDeductionMax) {
  let saving = 0;
  for (const c of yearlyContributions) saving += Math.min(c, cap) * (tmi / 100);
  return saving;
}

/** Taux d'imposition annuel des revenus fonciers (SCPI en direct) : TMI + PS 17,2 %. */
export function landIncomeTaxRate(tmi) {
  return tmi / 100 + FISCAL.ps.foncier;
}
