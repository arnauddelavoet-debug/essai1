import { FISCAL } from '../config/fiscal.js';

// ----------------------------------------------------------------
// CATALOGUE DES SUPPORTS D'INVESTISSEMENT
//
// Champs :
//  id            identifiant stable (utilisé dans les URL de partage)
//  vehicle       enveloppe fiscale (voir data/vehicles.js)
//  assetClass    classe d'actifs (hypothèses + corrélations, config/assumptions.js)
//  example       exemple de support réel accessible à un particulier
//                (nom, ISIN, mnémonique) — illustratif, pas une recommandation
//  marketTicker  symbole Yahoo Finance utilisé pour l'historique de cours
//                (le support lui-même ou un proxy au long historique)
//  proxyTer      frais du support dont provient l'historique : ajoutés au
//                rendement historique, déjà net de ces frais, pour obtenir
//                un rendement brut comparable aux hypothèses prospectives
//  ter           frais courants annuels du support (TER, indicatifs)
//  envelopeFee   true si les frais de gestion de l'enveloppe (AV/PER, unités
//                de compte) s'ajoutent au TER
//  entryFee      frais prélevés sur chaque versement (fraction)
//  rate          taux déterministe (livrets, fonds en euros), net de frais
//  incomeYield   part du rendement distribuée chaque année (SCPI en direct)
//  plafond       plafond réglementaire de versements
//  sri           indicateur de risque 1–7 (échelle SRI du DIC PRIIPs, indicatif)
//  minHorizon    horizon minimal conseillé (années)
// ----------------------------------------------------------------
const L = FISCAL.livrets;

export const CATALOG = Object.freeze([
  // ── ÉPARGNE RÉGLEMENTÉE ──────────────────────────────────────
  {
    id: 'livret-a', name: 'Livret A', vehicle: 'LIVRET', assetClass: 'livret', icon: '🏦',
    rate: L['livret-a'].taux, ter: 0, entryFee: 0, plafond: L['livret-a'].plafond, sri: 1, minHorizon: 0,
    description: `Épargne de précaution garantie et disponible. Taux ${pct(L['livret-a'].taux)} depuis le 01/08/2026, plafond ${eur(L['livret-a'].plafond)}. Exonéré d'impôt et de prélèvements sociaux.`,
  },
  {
    id: 'ldds', name: 'LDDS', vehicle: 'LIVRET', assetClass: 'livret', icon: '💚',
    rate: L.ldds.taux, ter: 0, entryFee: 0, plafond: L.ldds.plafond, sri: 1, minHorizon: 0,
    description: `Livret de développement durable et solidaire : même taux que le Livret A (${pct(L.ldds.taux)}), plafond ${eur(L.ldds.plafond)}, cumulable avec lui.`,
  },
  {
    id: 'lep', name: 'LEP', vehicle: 'LIVRET', assetClass: 'livret', icon: '🟢',
    rate: L.lep.taux, ter: 0, entryFee: 0, plafond: L.lep.plafond, sri: 1, minHorizon: 0,
    description: `Livret d'épargne populaire : ${pct(L.lep.taux)}, plafond ${eur(L.lep.plafond)}. Réservé aux foyers dont le revenu fiscal de référence est sous un plafond.`,
  },

  // ── PEA ───────────────────────────────────────────────────────
  {
    id: 'pea-monde', name: 'ETF MSCI World (PEA)', vehicle: 'PEA', assetClass: 'actions-monde', icon: '🌍',
    example: { name: 'Amundi PEA Monde (MSCI World)', isin: 'FR001400U5Q4', ticker: 'DCAM' },
    marketTicker: 'CW8.PA', proxyTer: 0.0038, ter: 0.0020, entryFee: 0, sri: 4, minHorizon: 5,
    description: '≈ 1 300 grandes et moyennes capitalisations des pays développés, via un ETF synthétique éligible au PEA. Historique de cours : Amundi MSCI World (CW8).',
  },
  {
    id: 'pea-sp500', name: 'ETF S&P 500 (PEA)', vehicle: 'PEA', assetClass: 'actions-us', icon: '🇺🇸',
    example: { name: 'Amundi PEA S&P 500', isin: 'FR0011871128', ticker: 'PSP5' },
    marketTicker: 'PSP5.PA', ter: 0.0015, entryFee: 0, sri: 4, minHorizon: 5,
    description: 'Les 500 plus grandes capitalisations américaines, en euros, éligible PEA (réplication synthétique).',
  },
  {
    id: 'pea-nasdaq', name: 'ETF Nasdaq-100 (PEA)', vehicle: 'PEA', assetClass: 'actions-tech-us', icon: '💻',
    example: { name: 'Amundi PEA Nasdaq-100', isin: 'FR0011871110', ticker: 'PUST' },
    marketTicker: 'PUST.PA', ter: 0.0030, entryFee: 0, sri: 5, minHorizon: 7,
    description: '100 premières valeurs non financières du Nasdaq : très forte concentration technologique, volatilité élevée.',
  },
  {
    id: 'pea-europe', name: 'ETF Stoxx Europe 600 (PEA)', vehicle: 'PEA', assetClass: 'actions-europe', icon: '🇪🇺',
    example: { name: 'Amundi Core Stoxx Europe 600', isin: 'LU0908500753', ticker: 'MEUD' },
    marketTicker: 'EXSA.DE', proxyTer: 0.0020, ter: 0.0007, entryFee: 0, sri: 4, minHorizon: 5,
    description: '600 sociétés européennes de toutes tailles. Historique de cours : iShares Stoxx Europe 600 (EXSA).',
  },
  {
    id: 'pea-emergents', name: 'ETF Marchés émergents (PEA)', vehicle: 'PEA', assetClass: 'actions-emergents', icon: '🌏',
    example: { name: 'Amundi PEA Émergent (MSCI Emerging) ESG Transition', isin: 'FR0013412020', ticker: 'PAEEM' },
    marketTicker: 'PAEEM.PA', ter: 0.0030, entryFee: 0, sri: 5, minHorizon: 7,
    description: 'Chine, Inde, Taïwan, Brésil… accessibles dans le PEA par réplication synthétique. Potentiel et volatilité élevés.',
  },

  // ── ASSURANCE-VIE ─────────────────────────────────────────────
  {
    id: 'av-fonds-euros', name: 'Fonds en euros (AV)', vehicle: 'AV', assetClass: 'fonds-euros', icon: '🔒',
    rate: 0.026, ter: 0, entryFee: 0, sri: 1, minHorizon: 2,
    description: 'Capital garanti par l\'assureur (effet cliquet). Taux indicatif 2,6 %/an net de frais de gestion, brut de prélèvements sociaux (moyenne de marché 2025).',
  },
  {
    id: 'av-uc-monde', name: 'UC ETF Monde (AV)', vehicle: 'AV', assetClass: 'actions-monde', icon: '📈',
    example: { name: 'iShares Core MSCI World', isin: 'IE00B4L5Y983', ticker: 'IWDA' },
    marketTicker: 'IWDA.AS', ter: 0.0020, envelopeFee: true, entryFee: 0, sri: 4, minHorizon: 5,
    description: 'ETF actions mondiales logé en unité de compte d\'un contrat d\'assurance-vie en ligne. Frais de gestion du contrat en sus.',
  },
  {
    id: 'av-uc-oblig', name: 'UC Obligations entreprises € (AV)', vehicle: 'AV', assetClass: 'oblig-entreprises-eur', icon: '📄',
    example: { name: 'iShares Core € Corp Bond', isin: 'IE00B3F81R35', ticker: 'IEAC' },
    marketTicker: 'IEAC.AS', ter: 0.0009, envelopeFee: true, entryFee: 0, sri: 2, minHorizon: 3,
    description: 'Obligations d\'entreprises de la zone euro de qualité « investment grade », en unité de compte.',
  },
  {
    id: 'av-scpi', name: 'SCPI en unité de compte (AV)', vehicle: 'AV', assetClass: 'immobilier-scpi', icon: '🏘️',
    ter: 0, envelopeFee: true, entryFee: 0.02, sri: 3, minHorizon: 8,
    description: 'Parts de SCPI logées dans l\'assurance-vie : loyers capitalisés sans fiscalité annuelle, fiscalité de l\'AV à la sortie. Frais d\'entrée réduits, rendement légèrement inférieur à la détention directe.',
  },

  // ── PER ───────────────────────────────────────────────────────
  {
    id: 'per-fonds-euros', name: 'Fonds en euros (PER)', vehicle: 'PER', assetClass: 'fonds-euros', icon: '🧓',
    rate: 0.025, ter: 0, entryFee: 0, sri: 1, minHorizon: 5,
    description: 'Fonds en euros d\'un PER individuel : capital garanti, versements déductibles du revenu imposable.',
  },
  {
    id: 'per-uc-monde', name: 'UC ETF Monde (PER)', vehicle: 'PER', assetClass: 'actions-monde', icon: '🏖️',
    example: { name: 'iShares Core MSCI World', isin: 'IE00B4L5Y983', ticker: 'IWDA' },
    marketTicker: 'IWDA.AS', ter: 0.0020, envelopeFee: true, entryFee: 0, sri: 4, minHorizon: 8,
    description: 'ETF actions mondiales en unité de compte d\'un PER : déduction fiscale à l\'entrée, capital bloqué jusqu\'à la retraite.',
  },

  // ── COMPTE-TITRES ─────────────────────────────────────────────
  {
    id: 'cto-all-world', name: 'ETF FTSE All-World (CTO)', vehicle: 'CTO', assetClass: 'actions-monde', icon: '🗺️',
    example: { name: 'Vanguard FTSE All-World (Acc)', isin: 'IE00BK5BQT80', ticker: 'VWCE' },
    marketTicker: 'VWCE.DE', ter: 0.0019, entryFee: 0, sri: 4, minHorizon: 5,
    description: '≈ 3 700 actions de pays développés et émergents. Non éligible au PEA (ETF physique irlandais).',
  },
  {
    id: 'cto-emergents', name: 'ETF Émergents IMI (CTO)', vehicle: 'CTO', assetClass: 'actions-emergents', icon: '🌐',
    example: { name: 'iShares Core MSCI EM IMI', isin: 'IE00BKM4GZ66', ticker: 'IS3N' },
    marketTicker: 'IS3N.DE', ter: 0.0018, entryFee: 0, sri: 5, minHorizon: 7,
    description: 'Marchés émergents toutes capitalisations, réplication physique.',
  },
  {
    id: 'cto-small-europe', name: 'ETF Small Caps Europe (CTO)', vehicle: 'CTO', assetClass: 'actions-small-europe', icon: '📊',
    example: { name: 'SPDR MSCI Europe Small Cap', isin: 'IE00BKWQ0M75', ticker: 'SMC' },
    marketTicker: 'SMC.PA', ter: 0.0030, entryFee: 0, sri: 5, minHorizon: 7,
    description: 'Petites capitalisations européennes : prime de taille historique, volatilité supérieure aux grandes capitalisations.',
  },
  {
    id: 'cto-dividendes', name: 'ETF Dividendes Europe (CTO)', vehicle: 'CTO', assetClass: 'actions-dividendes-europe', icon: '💰',
    example: { name: 'SPDR S&P Euro Dividend Aristocrats', isin: 'IE00B5M1WJ87', ticker: 'SPYW' },
    marketTicker: 'SPYW.DE', ter: 0.0030, entryFee: 0, sri: 4, minHorizon: 5,
    description: 'Sociétés de la zone euro ayant augmenté ou maintenu leur dividende sur longue période.',
  },
  {
    id: 'cto-oblig-etat', name: 'ETF Obligations d\'État € (CTO)', vehicle: 'CTO', assetClass: 'oblig-etat-eur', icon: '🏛️',
    example: { name: 'iShares Core € Govt Bond', isin: 'IE00B4WXJJ64', ticker: 'IEGA' },
    marketTicker: 'IEGA.AS', ter: 0.0007, entryFee: 0, sri: 3, minHorizon: 3,
    description: 'Obligations souveraines de la zone euro, toutes maturités. Sensibles aux variations de taux d\'intérêt.',
  },
  {
    id: 'cto-monetaire', name: 'ETF Monétaire € (CTO)', vehicle: 'CTO', assetClass: 'monetaire', icon: '💶',
    example: { name: 'Amundi Smart Overnight Return', isin: 'LU1190417599', ticker: 'CSH2' },
    marketTicker: 'CSH2.PA', ter: 0.0005, entryFee: 0, sri: 1, minHorizon: 0,
    description: 'Réplique le taux au jour le jour de la zone euro (€STR) : alternative aux livrets au-delà des plafonds, mais fiscalisée.',
  },
  {
    id: 'cto-or', name: 'Or physique — ETC (CTO)', vehicle: 'CTO', assetClass: 'or', icon: '🥇',
    example: { name: 'Invesco Physical Gold ETC', isin: 'IE00B579F325', ticker: '8PSG' },
    marketTicker: '8PSG.DE', ter: 0.0012, entryFee: 0, sri: 4, minHorizon: 5,
    description: 'Or physique stocké en coffre. Diversifiant historique en période de crise, sans rendement courant.',
  },

  // ── CRYPTO-ACTIFS ─────────────────────────────────────────────
  {
    id: 'crypto-btc', name: 'Bitcoin ⚠️ satellite', vehicle: 'CRYPTO', assetClass: 'crypto', icon: '₿',
    marketTicker: 'BTC-EUR', ter: 0, entryFee: 0.01, sri: 7, minHorizon: 8,
    description: 'POCHE SATELLITE SPÉCULATIVE. Baisses historiques de −70 à −85 % (2018, 2022). Risque de perte totale : à limiter à quelques % d\'un patrimoine.',
  },
  {
    id: 'crypto-eth', name: 'Ethereum ⚠️ satellite', vehicle: 'CRYPTO', assetClass: 'crypto', icon: 'Ξ',
    marketTicker: 'ETH-EUR', ter: 0, entryFee: 0.01, sri: 7, minHorizon: 8,
    description: 'POCHE SATELLITE SPÉCULATIVE. Plus volatil encore que le bitcoin. Risque de perte totale.',
  },

  // ── SCPI EN DIRECT ────────────────────────────────────────────
  {
    id: 'scpi-direct', name: 'SCPI de rendement (direct)', vehicle: 'SCPI', assetClass: 'immobilier-scpi', icon: '🏢',
    ter: 0, entryFee: 0.08, incomeYield: 0.046, sri: 3, minHorizon: 8,
    description: 'Immobilier locatif mutualisé. Taux de distribution indicatif 4,6 %/an, imposé chaque année comme revenu foncier (TMI + 17,2 %). Frais de souscription ≈ 8 % : placement de long terme.',
  },
]);

export function findProduct(id) {
  return CATALOG.find(p => p.id === id) || null;
}

function pct(x) {
  return `${(x * 100).toFixed(1).replace('.', ',')} %`;
}

function eur(x) {
  return `${x.toLocaleString('fr-FR')} €`;
}
