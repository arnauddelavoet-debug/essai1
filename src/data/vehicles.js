// ----------------------------------------------------------------
// ENVELOPPES FISCALES
// Chaque produit du catalogue est rattaché à une enveloppe. La
// fiscalité est calculée par enveloppe (compensation des gains et
// pertes entre lignes d'une même enveloppe), jamais par produit.
// ----------------------------------------------------------------
export const VEHICLES = Object.freeze({
  LIVRET: {
    label: 'Livrets réglementés',
    short: 'Livret',
    cssClass: 'vehicle-livret',
    rebalanceable: false,
    summary: 'Intérêts exonérés d\'impôt et de prélèvements sociaux. Capital garanti, disponible à tout moment, plafonné.',
  },
  PEA: {
    label: 'Plan d\'épargne en actions',
    short: 'PEA',
    cssClass: 'vehicle-pea',
    rebalanceable: true,
    summary: 'Après 5 ans : gains exonérés d\'IR, seuls les prélèvements sociaux (18,6 %) sont dus. Avant 5 ans : PFU 31,4 %. Plafond de versements 150 000 €.',
  },
  AV: {
    label: 'Assurance-vie',
    short: 'AV',
    cssClass: 'vehicle-av',
    rebalanceable: true,
    summary: 'Après 8 ans : abattement annuel de 4 600 € (9 200 € en couple) puis 7,5 % d\'IR (12,8 % au-delà de 150 000 € de primes) + PS 17,2 %. Avant 8 ans : 30 %.',
  },
  PER: {
    label: 'Plan d\'épargne retraite',
    short: 'PER',
    cssClass: 'vehicle-per',
    rebalanceable: true,
    summary: 'Versements déductibles du revenu imposable (économie = TMI). Sortie en capital : versements imposés au barème, gains au PFU 31,4 %. Bloqué jusqu\'à la retraite (sauf cas de déblocage anticipé).',
  },
  CTO: {
    label: 'Compte-titres ordinaire',
    short: 'CTO',
    cssClass: 'vehicle-cto',
    rebalanceable: false,
    summary: 'Aucun plafond ni avantage fiscal : plus-values au PFU 31,4 % (12,8 % IR + 18,6 % PS) ou, sur option, au barème progressif.',
  },
  CRYPTO: {
    label: 'Crypto-actifs',
    short: 'Crypto',
    cssClass: 'vehicle-crypto',
    rebalanceable: false,
    summary: 'Plus-values de cession au PFU 31,4 %. Pertes non imputables sur les plus-values de valeurs mobilières.',
  },
  SCPI: {
    label: 'SCPI en direct',
    short: 'SCPI',
    cssClass: 'vehicle-scpi',
    rebalanceable: false,
    summary: 'Loyers imposés chaque année comme revenus fonciers (TMI + 17,2 %). Plus-value à la revente : 19 % + 17,2 % avec abattements pour durée de détention.',
  },
});

export const VEHICLE_ORDER = Object.freeze(['LIVRET', 'PEA', 'AV', 'PER', 'CTO', 'CRYPTO', 'SCPI']);
