const PS_RATE = 0.172; // CSG 9,2 % + CRDS 0,5 % + Prélèvement de solidarité 7,5 %

/**
 * Calcule l'impôt sur un gain brut selon le véhicule fiscal, l'horizon
 * de détention et la tranche marginale d'imposition (TMI) du foyer.
 * @returns {{irTax: number, psTax: number, total: number}}
 */
export function calcTax(grossGain, vehicle, horizon, tmi) {
  if (grossGain <= 0) return { irTax: 0, psTax: 0, total: 0 };
  if (vehicle === 'Livret') return { irTax: 0, psTax: 0, total: 0 };

  if (vehicle === 'PEA') {
    if (horizon >= 5) {
      return { irTax: 0, psTax: grossGain * PS_RATE, total: grossGain * PS_RATE };
    }
    return { irTax: grossGain * 0.128, psTax: grossGain * PS_RATE, total: grossGain * 0.30 };
  }

  if (vehicle === 'AV') {
    if (horizon >= 8) {
      const abattement = 4600;
      const taxable = Math.max(0, grossGain - abattement);
      const irRate = Math.min(0.075, tmi / 100);
      const irTax = taxable * irRate;
      const psTax = taxable * PS_RATE;
      return { irTax, psTax, total: irTax + psTax };
    }
    return { irTax: grossGain * 0.128, psTax: grossGain * PS_RATE, total: grossGain * 0.30 };
  }

  // CTO : PFU 30 % (IR 12,8 % + PS 17,2 %) ou barème TMI + PS si plus avantageux
  const flatTotal = grossGain * 0.30;
  const tmiTotal = grossGain * (tmi / 100 + PS_RATE);
  if (flatTotal <= tmiTotal) {
    return { irTax: grossGain * 0.128, psTax: grossGain * PS_RATE, total: flatTotal };
  }
  return { irTax: grossGain * (tmi / 100), psTax: grossGain * PS_RATE, total: tmiTotal };
}
