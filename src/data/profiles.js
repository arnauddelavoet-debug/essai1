// ----------------------------------------------------------------
// PROFILS D'INVESTISSEUR
// Allocations de départ proposées par profil : l'utilisateur peut
// ensuite les modifier librement ligne par ligne. Les plages de
// volatilité servent à l'alerte d'adéquation profil / portefeuille.
// ----------------------------------------------------------------
export const PROFILES = Object.freeze({
  conservateur: {
    label: 'Prudent',
    icon: '🛡️',
    pitch: 'Priorité à la préservation du capital. Faible volatilité.',
    sigmaRange: { min: 0.00, max: 0.06 },
    alloc: { 'livret-a': 20, ldds: 10, 'av-fonds-euros': 35, 'av-uc-oblig': 10, 'cto-oblig-etat': 15, 'pea-monde': 10 },
  },
  modere: {
    label: 'Équilibré',
    icon: '⚖️',
    pitch: 'Équilibre rendement / risque. Volatilité maîtrisée.',
    sigmaRange: { min: 0.05, max: 0.11 },
    alloc: { 'livret-a': 10, 'av-fonds-euros': 20, 'av-uc-oblig': 10, 'av-scpi': 5, 'cto-oblig-etat': 10, 'pea-monde': 30, 'pea-europe': 10, 'av-uc-monde': 5 },
  },
  dynamique: {
    label: 'Dynamique',
    icon: '🚀',
    pitch: 'Recherche de performance long terme. Accepte de fortes baisses temporaires.',
    sigmaRange: { min: 0.10, max: 1.00 },
    alloc: { 'livret-a': 5, 'pea-monde': 35, 'pea-sp500': 15, 'pea-nasdaq': 5, 'pea-emergents': 10, 'av-uc-monde': 15, 'cto-small-europe': 5, 'cto-or': 5, 'crypto-btc': 5 },
  },
});

export const PROFILE_ORDER = Object.freeze(['conservateur', 'modere', 'dynamique']);
