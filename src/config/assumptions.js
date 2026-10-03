// ----------------------------------------------------------------
// HYPOTHÈSES DE MARCHÉ PROSPECTIVES PAR CLASSE D'ACTIFS
// Rendements nominaux en euros, annualisés, AVANT frais du support
// (TER) et avant fiscalité. μ est la dérive arithmétique du mouvement
// brownien géométrique (espérance de croissance annuelle ≈ e^μ − 1) ;
// le rendement médian (géométrique) vaut ≈ μ − σ²/2.
//
// Ordres de grandeur cohérents avec les « capital market assumptions »
// long terme publiées par les grandes sociétés de gestion (horizon
// 10–20 ans), arrondis et volontairement prudents. Ce ne sont PAS des
// prévisions : l'utilisateur peut les remplacer par les statistiques
// historiques issues des API de marché ou par ses propres valeurs.
// ----------------------------------------------------------------
export const ASSET_CLASSES = Object.freeze({
  monetaire:                  { label: 'Monétaire euro',                mu: 0.023, sigma: 0.006 },
  'oblig-etat-eur':           { label: 'Obligations d\'État zone euro', mu: 0.032, sigma: 0.060 },
  'oblig-entreprises-eur':    { label: 'Obligations d\'entreprises €',  mu: 0.037, sigma: 0.060 },
  'actions-monde':            { label: 'Actions monde développé',       mu: 0.070, sigma: 0.150 },
  'actions-us':               { label: 'Actions américaines',           mu: 0.070, sigma: 0.165 },
  'actions-tech-us':          { label: 'Actions technologiques US',     mu: 0.075, sigma: 0.220 },
  'actions-europe':           { label: 'Actions européennes',           mu: 0.070, sigma: 0.160 },
  'actions-small-europe':     { label: 'Petites capitalisations Europe', mu: 0.075, sigma: 0.190 },
  'actions-dividendes-europe': { label: 'Actions européennes à dividendes', mu: 0.065, sigma: 0.150 },
  'actions-emergents':        { label: 'Actions émergentes',            mu: 0.075, sigma: 0.195 },
  or:                         { label: 'Or physique',                   mu: 0.040, sigma: 0.150 },
  'immobilier-scpi':          { label: 'Immobilier (SCPI)',             mu: 0.042, sigma: 0.050 },
  crypto:                     { label: 'Crypto-actifs',                 mu: 0.100, sigma: 0.650 },
  // Classes à rendement déterministe (σ = 0) : le taux est porté par le produit.
  'fonds-euros':              { label: 'Fonds en euros (capital garanti)', mu: 0.026, sigma: 0 },
  livret:                     { label: 'Épargne réglementée',           mu: 0.017, sigma: 0 },
});

/** Corrélation retenue entre deux lignes d'une même classe (ex. ETF Monde en PEA et en AV). */
export const SAME_CLASS_RHO = 0.98;

// Corrélations prospectives entre classes risquées (triangle supérieur).
// Paires absentes = 0. La matrice complète est testée définie positive
// (test/catalog.test.js) : aucune régularisation n'est nécessaire avec
// ces valeurs par défaut.
export const CLASS_CORRELATIONS = Object.freeze({
  monetaire:               { 'oblig-etat-eur': 0.10, 'oblig-entreprises-eur': 0.10 },
  'oblig-etat-eur':        { 'oblig-entreprises-eur': 0.75, 'actions-monde': 0.00, 'actions-us': 0.00, 'actions-europe': 0.00, 'or': 0.25, 'immobilier-scpi': 0.15 },
  'oblig-entreprises-eur': { 'actions-monde': 0.30, 'actions-us': 0.28, 'actions-tech-us': 0.25, 'actions-europe': 0.32, 'actions-small-europe': 0.30, 'actions-dividendes-europe': 0.30, 'actions-emergents': 0.28, 'or': 0.20, 'immobilier-scpi': 0.15 },
  'actions-monde':         { 'actions-us': 0.95, 'actions-tech-us': 0.85, 'actions-europe': 0.85, 'actions-small-europe': 0.78, 'actions-dividendes-europe': 0.78, 'actions-emergents': 0.72, 'or': 0.10, 'immobilier-scpi': 0.25, crypto: 0.30 },
  'actions-us':            { 'actions-tech-us': 0.90, 'actions-europe': 0.72, 'actions-small-europe': 0.65, 'actions-dividendes-europe': 0.62, 'actions-emergents': 0.62, 'or': 0.08, 'immobilier-scpi': 0.20, crypto: 0.30 },
  'actions-tech-us':       { 'actions-europe': 0.60, 'actions-small-europe': 0.58, 'actions-dividendes-europe': 0.45, 'actions-emergents': 0.60, 'or': 0.05, 'immobilier-scpi': 0.15, crypto: 0.35 },
  'actions-europe':        { 'actions-small-europe': 0.88, 'actions-dividendes-europe': 0.90, 'actions-emergents': 0.68, 'or': 0.10, 'immobilier-scpi': 0.30, crypto: 0.25 },
  'actions-small-europe':  { 'actions-dividendes-europe': 0.78, 'actions-emergents': 0.62, 'or': 0.10, 'immobilier-scpi': 0.28, crypto: 0.25 },
  'actions-dividendes-europe': { 'actions-emergents': 0.58, 'or': 0.10, 'immobilier-scpi': 0.30, crypto: 0.20 },
  'actions-emergents':     { 'or': 0.20, 'immobilier-scpi': 0.20, crypto: 0.30 },
  or:                      { 'immobilier-scpi': 0.05, crypto: 0.15 },
  'immobilier-scpi':       { crypto: 0.05 },
});

/** Inflation annuelle long terme par défaut (cible BCE). */
export const DEFAULT_INFLATION = 0.02;
