// ----------------------------------------------------------------
// PARAMÈTRES FISCAUX FRANÇAIS — MILLÉSIME 2026
// Revenus et plus-values perçus à compter du 01/01/2026 (LFSS 2026,
// loi n° 2025-1403 du 30/12/2025) et taux d'épargne réglementée au
// 01/08/2026. Toute évolution législative se fait ici, en un seul
// endroit : le moteur fiscal (engine/tax.js) ne contient aucun taux
// en dur.
// ----------------------------------------------------------------
export const FISCAL = Object.freeze({
  millesime: 2026,
  miseAJour: '2026-09-30',

  /** Part impôt sur le revenu du prélèvement forfaitaire unique (PFU). */
  pfuIR: 0.128,

  /** Prélèvements sociaux (CSG + CRDS + prélèvement de solidarité). */
  ps: Object.freeze({
    /** Revenus du capital « standard » depuis 2026 : CSG 10,6 % → 18,6 %. */
    standard: 0.186,
    /** Assurance-vie : exclue de la hausse de CSG, reste à 17,2 %. */
    assuranceVie: 0.172,
    /** Revenus fonciers et plus-values immobilières : restent à 17,2 %. */
    foncier: 0.172,
  }),

  /** Taux marginaux du barème progressif de l'IR. */
  tmiBrackets: Object.freeze([0, 11, 30, 41, 45]),

  pea: Object.freeze({
    /** Ancienneté (années) à partir de laquelle les gains sont exonérés d'IR. */
    ageExoneration: 5,
    /** Plafond de versements d'un PEA classique. */
    plafondVersements: 150_000,
  }),

  assuranceVie: Object.freeze({
    /** Ancienneté (années) ouvrant droit à l'abattement et au taux réduit. */
    ageReduit: 8,
    /** Taux IR réduit sur la fraction des gains liée aux primes ≤ seuil. */
    tauxReduit: 0.075,
    /** Seuil d'encours de primes (tous contrats) pour le taux réduit. */
    seuilPrimes: 150_000,
    /** Abattement annuel sur les gains (IR seulement, pas sur les PS). */
    abattement: Object.freeze({ seul: 4_600, couple: 9_200 }),
  }),

  per: Object.freeze({
    /** Plafond maximal de déduction des versements (salarié, 2026). */
    plafondDeductionMax: 37_680,
    /** Plancher du plafond de déduction (10 % du PASS N-1). */
    plafondDeductionMin: 4_710,
  }),

  /** Plus-values immobilières (parts de SCPI détenues en direct). */
  plusValueImmo: Object.freeze({
    tauxIR: 0.19,
  }),

  /** Épargne réglementée — taux en vigueur au 01/08/2026, exonérés d'IR et de PS. */
  livrets: Object.freeze({
    'livret-a': Object.freeze({ taux: 0.017, plafond: 22_950 }),
    ldds: Object.freeze({ taux: 0.017, plafond: 12_000 }),
    lep: Object.freeze({ taux: 0.025, plafond: 10_000 }),
  }),

  sources: Object.freeze([
    { label: 'LFSS 2026 (loi n° 2025-1403) — prélèvements sociaux 18,6 % / 17,2 % : panorama', url: 'https://www.hagnere-patrimoine.fr/guides-patrimoine/comment-payer-moins-impots/lfss-2026-article-12-prelevements-sociaux' },
    { label: 'Service-public.fr — Imposition des revenus d\'un contrat d\'assurance-vie', url: 'https://www.service-public.fr/particuliers/vosdroits/F22414' },
    { label: 'Service-public.fr — Plan d\'épargne en actions (PEA)', url: 'https://www.service-public.fr/particuliers/vosdroits/F2385' },
    { label: 'Service-public.fr — Plan d\'épargne retraite (PER)', url: 'https://www.service-public.fr/particuliers/vosdroits/F34982' },
    { label: 'Service-public.fr — Plus-value immobilière', url: 'https://www.service-public.fr/particuliers/vosdroits/F10864' },
    { label: 'Ministère de l\'Économie — taux de l\'épargne réglementée au 01/08/2026', url: 'https://presse.economie.gouv.fr/?p=181486' },
  ]),
});

/**
 * Abattements pour durée de détention applicables aux plus-values
 * immobilières (CGI art. 150 VC), en fraction [0..1].
 * IR : 6 %/an de la 6e à la 21e année, 4 % la 22e → exonération à 22 ans.
 * PS : 1,65 %/an de la 6e à la 21e, 1,60 % la 22e, 9 %/an ensuite → 30 ans.
 */
export function abattementPlusValueImmo(years) {
  const n = Math.floor(Math.max(0, years));
  let ir;
  if (n < 6) ir = 0;
  else if (n <= 21) ir = (n - 5) * 0.06;
  else ir = 1;

  let ps;
  if (n < 6) ps = 0;
  else if (n <= 21) ps = (n - 5) * 0.0165;
  else ps = Math.min(1, 0.28 + (n - 22) * 0.09);

  return { ir: Math.min(1, ir), ps: Math.min(1, ps) };
}
