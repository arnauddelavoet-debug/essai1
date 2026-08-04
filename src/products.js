// ----------------------------------------------------------------
// CATALOGUE DE PRODUITS (fusion app.js + simuportefeuille-standalone.html)
// ----------------------------------------------------------------
export const PRODUCTS = [
  // ── LIVRETS RÉGLEMENTÉS ──────────────────────────────────────
  {
    id: 'livret-a', name: 'Livret A',
    vehicle: 'Livret', vehicleLabel: 'Livret A', vehicleFiscal: 'Livret',
    icon: '🏦', mu: 0.024, sigma: 0, ter: 0, guaranteed: true, minHorizon: 0,
    description: 'Épargne réglementée garantie. Taux 2,4 % depuis le 01/02/2025. Plafond 22 950 €. Totalement exonéré d\'IR et de PS.',
  },
  {
    id: 'ldds', name: 'LDDS',
    vehicle: 'Livret', vehicleLabel: 'LDDS', vehicleFiscal: 'Livret',
    icon: '💚', mu: 0.024, sigma: 0, ter: 0, guaranteed: true, minHorizon: 0,
    description: 'Livret Développement Durable et Solidaire. Taux identique au Livret A (2,4 %). Plafond 12 000 €. Cumulable avec le Livret A.',
  },
  {
    id: 'lep', name: 'LEP',
    vehicle: 'Livret', vehicleLabel: 'LEP', vehicleFiscal: 'Livret',
    icon: '🟢', mu: 0.035, sigma: 0, ter: 0, guaranteed: true, minHorizon: 0,
    description: 'Livret d\'Épargne Populaire. Taux 3,5 % depuis le 01/02/2025. Plafond 10 000 €. Réservé aux foyers sous plafond de revenus.',
  },
  // ── ASSURANCE-VIE ─────────────────────────────────────────────
  {
    id: 'fonds-euro', name: 'Fonds Euro Assurance-vie',
    vehicle: 'AV', vehicleLabel: 'Assurance-vie', vehicleFiscal: 'AV',
    icon: '🔒', mu: 0.025, sigma: 0.004, ter: 0.006, guaranteed: false, minHorizon: 3,
    description: 'Capital quasi-garanti, rendement net ~2–2,5 % selon contrat (après frais AV ~0,6 %/an).',
  },
  {
    id: 'uc-oblig', name: 'Unité de Compte Obligataire',
    vehicle: 'AV', vehicleLabel: 'Assurance-vie', vehicleFiscal: 'AV',
    icon: '📄', mu: 0.04, sigma: 0.08, ter: 0.006, guaranteed: false, minHorizon: 3,
    description: 'UC investies en obligations d\'entreprises, rendement ~3,5–4,5 % (frais UC + AV ~0,6 %/an).',
  },
  {
    id: 'uc-actions', name: 'UC Actions Monde (AV)',
    vehicle: 'AV', vehicleLabel: 'Assurance-vie', vehicleFiscal: 'AV',
    icon: '📈', mu: 0.07, sigma: 0.16, ter: 0.007, guaranteed: false, minHorizon: 5,
    description: 'Unités de compte en actions mondiales au sein d\'une assurance-vie (frais UC + AV ~0,7 %/an).',
  },
  // ── ETF PEA ───────────────────────────────────────────────────
  {
    id: 'etf-world', name: 'ETF MSCI World (PEA)',
    vehicle: 'PEA', vehicleLabel: 'PEA', vehicleFiscal: 'PEA',
    icon: '🌍', mu: 0.075, sigma: 0.155, ter: 0.0015, guaranteed: false, minHorizon: 5,
    description: '~1 600 sociétés mondiales via ETF synthétique PEA-éligible. Ex : Amundi MSCI World UCITS ETF (CW8).',
  },
  {
    id: 'etf-sp500', name: 'ETF S&P 500 (PEA)',
    vehicle: 'PEA', vehicleLabel: 'PEA', vehicleFiscal: 'PEA',
    icon: '🇺🇸', mu: 0.082, sigma: 0.170, ter: 0, guaranteed: false, minHorizon: 5,
    description: '500 plus grandes capitalisations américaines. ETF synthétique PEA-éligible.',
  },
  {
    id: 'etf-nasdaq', name: 'ETF Nasdaq 100 (PEA)',
    vehicle: 'PEA', vehicleLabel: 'PEA', vehicleFiscal: 'PEA',
    icon: '💻', mu: 0.090, sigma: 0.220, ter: 0, guaranteed: false, minHorizon: 7,
    description: '100 plus grandes valeurs technologiques US. Forte concentration tech, volatilité élevée.',
  },
  {
    id: 'etf-europe', name: 'ETF Europe Stoxx 600 (PEA)',
    vehicle: 'PEA', vehicleLabel: 'PEA', vehicleFiscal: 'PEA',
    icon: '🇪🇺', mu: 0.068, sigma: 0.165, ter: 0.002, guaranteed: false, minHorizon: 5,
    description: '600 plus grandes sociétés européennes toutes capitalisations.',
  },
  {
    id: 'etf-smallcap-eu', name: 'ETF Small Cap Europe (PEA)',
    vehicle: 'PEA', vehicleLabel: 'PEA', vehicleFiscal: 'PEA',
    icon: '📊', mu: 0.072, sigma: 0.195, ter: 0, guaranteed: false, minHorizon: 7,
    description: 'Petites capitalisations européennes. Prime de risque historiquement supérieure aux larges caps.',
  },
  {
    id: 'etf-dividende', name: 'ETF Dividendes Europe (PEA)',
    vehicle: 'PEA', vehicleLabel: 'PEA', vehicleFiscal: 'PEA',
    icon: '💰', mu: 0.062, sigma: 0.145, ter: 0, guaranteed: false, minHorizon: 5,
    description: 'Entreprises européennes à dividendes élevés et stables. Rendement courant ~3–4 %.',
  },
  // ── ETF / AUTRES CTO ──────────────────────────────────────────
  {
    id: 'etf-emergents', name: 'ETF Marchés Émergents (CTO)',
    vehicle: 'CTO', vehicleLabel: 'CTO', vehicleFiscal: 'CTO',
    icon: '🌏', mu: 0.082, sigma: 0.215, ter: 0.004, guaranteed: false, minHorizon: 7,
    description: 'Asie, Amérique Latine, Moyen-Orient. Non éligible PEA. Fort potentiel, haute volatilité.',
  },
  {
    id: 'etf-oblig', name: 'ETF Obligations d\'État (CTO)',
    vehicle: 'CTO', vehicleLabel: 'CTO', vehicleFiscal: 'CTO',
    icon: '🏛️', mu: 0.036, sigma: 0.055, ter: 0.001, guaranteed: false, minHorizon: 2,
    description: 'Obligations souveraines européennes Investment Grade. Faible volatilité.',
  },
  {
    id: 'scpi', name: 'SCPI (Immobilier)',
    vehicle: 'CTO', vehicleLabel: 'CTO / AV', vehicleFiscal: 'CTO',
    icon: '🏢', mu: 0.045, sigma: 0.07, ter: 0.010, guaranteed: false, minHorizon: 8,
    description: 'Société civile de placement immobilier, rendement cible ~4–5 % (frais gestion ~1 %/an).',
  },
  {
    id: 'crypto-btc', name: 'Cryptomonnaies (panier BTC/ETH) ⚠️ Satellite',
    vehicle: 'CTO', vehicleLabel: 'CTO', vehicleFiscal: 'CTO',
    icon: '₿', mu: 0.12, sigma: 0.60, ter: 0, guaranteed: false, minHorizon: 5,
    description: 'POCHE SATELLITE SPÉCULATIVE. Drawdowns historiques : -84 % (2018), -77 % (2022). Risque de perte totale. À exclure d\'un profil modéré.',
  },
];

// ----------------------------------------------------------------
// MATRICE DE CORRÉLATION PARTIELLE ENTRE ACTIFS RISQUÉS
// Paires absentes = ρ = 0 (actifs supposés décorrélés — approximation
// documentée). Estimations qualitatives basées sur des corrélations
// historiques usuelles entre classes d'actifs, à affiner si des
// données de marché réelles sont branchées (chantier futur "API").
// ----------------------------------------------------------------
export const CORRELATIONS = {
  'etf-world':       { 'etf-sp500': 0.93, 'etf-nasdaq': 0.85, 'etf-europe': 0.85, 'etf-smallcap-eu': 0.75, 'etf-dividende': 0.80, 'uc-actions': 0.90, 'etf-emergents': 0.70, 'scpi': 0.25, 'crypto-btc': 0.15, 'etf-oblig': -0.10, 'uc-oblig': -0.05 },
  'etf-sp500':       { 'etf-nasdaq': 0.90, 'etf-europe': 0.70, 'etf-smallcap-eu': 0.60, 'etf-dividende': 0.65, 'uc-actions': 0.85, 'etf-emergents': 0.65, 'scpi': 0.20, 'crypto-btc': 0.20, 'etf-oblig': -0.10, 'uc-oblig': -0.05 },
  'etf-nasdaq':      { 'etf-europe': 0.55, 'etf-smallcap-eu': 0.50, 'etf-dividende': 0.45, 'uc-actions': 0.75, 'etf-emergents': 0.60, 'scpi': 0.15, 'crypto-btc': 0.25, 'etf-oblig': -0.05 },
  'etf-europe':      { 'etf-smallcap-eu': 0.85, 'etf-dividende': 0.88, 'uc-actions': 0.80, 'etf-emergents': 0.65, 'scpi': 0.30, 'crypto-btc': 0.15, 'etf-oblig': -0.10, 'uc-oblig': -0.05 },
  'etf-smallcap-eu': { 'etf-dividende': 0.70, 'uc-actions': 0.70, 'etf-emergents': 0.55, 'scpi': 0.25, 'crypto-btc': 0.10 },
  'etf-dividende':   { 'uc-actions': 0.75, 'etf-emergents': 0.50, 'scpi': 0.30, 'crypto-btc': 0.05 },
  'uc-actions':      { 'etf-emergents': 0.65, 'scpi': 0.25, 'crypto-btc': 0.15, 'etf-oblig': -0.10 },
  'etf-emergents':   { 'scpi': 0.20, 'crypto-btc': 0.20, 'etf-oblig': -0.05 },
  'scpi':            { 'crypto-btc': 0.05, 'etf-oblig': 0.05, 'uc-oblig': 0.05 },
  'etf-oblig':       { 'uc-oblig': 0.60, 'crypto-btc': -0.05 },
};

/** Allocations suggérées par profil de risque (table statique, IHM inchangée). */
export const SUGGESTIONS = {
  conservateur: {
    label: 'Profil conservateur recommandé',
    alloc: { 'livret-a': 25, 'ldds': 10, 'lep': 15, 'fonds-euro': 30, 'etf-oblig': 20 },
  },
  modere: {
    label: 'Profil modéré recommandé',
    alloc: { 'livret-a': 10, 'fonds-euro': 15, 'etf-oblig': 15, 'scpi': 10, 'etf-world': 25, 'etf-europe': 15, 'uc-actions': 10 },
  },
  dynamique: {
    label: 'Profil dynamique recommandé',
    alloc: { 'etf-world': 30, 'etf-sp500': 20, 'etf-nasdaq': 15, 'etf-emergents': 15, 'etf-smallcap-eu': 10, 'crypto-btc': 10 },
  },
};

/** Plage de volatilité annualisée attendue par profil (pour l'alerte d'adéquation). */
export const PROFILE_SIGMA_RANGES = {
  conservateur: { min: 0.00, max: 0.07 },
  modere: { min: 0.04, max: 0.17 },
  dynamique: { min: 0.12, max: 1.00 },
};

/** IDs des actifs "actions" pour l'analyse d'exposition vs horizon. */
export const EQUITY_IDS = [
  'etf-world', 'etf-sp500', 'etf-nasdaq', 'etf-europe',
  'etf-smallcap-eu', 'etf-dividende', 'etf-emergents', 'uc-actions',
];
