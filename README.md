# SimuPortefeuille

Simulateur Monte Carlo **pédagogique** de portefeuille financier pour un épargnant français : il projette des milliers de futurs possibles, applique la **fiscalité française 2026** enveloppe par enveloppe (Livrets, PEA, assurance-vie, PER, compte-titres, crypto-actifs, SCPI) et s'appuie sur des **données de marché réelles** (Yahoo Finance, Eurostat, BCE).

**Application en ligne : <https://simulationportefeuille.vercel.app>**

> Outil d'information et d'apprentissage : il ne constitue pas un conseil en investissement.

## Fonctionnalités

| Domaine | Ce que fait le simulateur |
|---|---|
| **Projet** | Capital initial, versements mensuels indexables, horizon jusqu'à 50 ans, objectif de capital (en euros d'aujourd'hui ou nominaux) |
| **Allocation** | 24 supports réels (ETF avec ISIN et TER, livrets, fonds en euros, unités de compte, SCPI, crypto) répartis dans 7 enveloppes ; 3 profils de départ, allocation libre ligne par ligne |
| **Hypothèses** | 3 sources au choix — prospectif long terme, historique 10 ans issu des API, mixte — et surcharge manuelle du rendement, de la volatilité et des frais de chaque support |
| **Modèle** | Monte Carlo joint et corrélé à pas mensuel, loi normale ou à queues épaisses (Student), rééquilibrage annuel, frais de gestion et d'entrée, générateur aléatoire à graine (résultats reproductibles) |
| **Fiscalité 2026** | PS 18,6 % / 17,2 %, PFU 31,4 % / 30 %, option globale pour le barème, PEA 5 ans, AV 8 ans (abattement seul/couple, seuil 150 000 €), PER (déduction + sortie en capital), SCPI (revenus fonciers annuels + plus-value immobilière avec abattements pour durée), ancienneté des enveloppes |
| **Résultats** | Valeur nette médiane et en euros constants, probabilité de perte (nominale et en pouvoir d'achat), probabilité d'atteindre l'objectif, rendement annualisé (TRI), scénarios défavorable / favorable, CVaR 5 %, baisse maximale en cours de route, impôts et frais cumulés, comparaison « et si tout était dans une seule enveloppe ? » |
| **Pédagogie** | Guide intégré, info-bulles sur chaque notion, explication en langage courant des résultats, alertes réglementaires (plafonds, horizon, adéquation au profil) |
| **Exports** | Rapport PDF (4 pages, traçable par empreinte SHA-256), CSV compatible Excel, lien de partage qui reproduit exactement la simulation |
| **Confort** | Thème clair / sombre, mobile, accessible au clavier, calcul dans un Web Worker avec barre de progression |

## Démarrage

Aucune dépendance npm ni étape de build : l'application est un site statique en modules ES.

```bash
npm run serve          # serveur local sur http://localhost:8000
npm test               # 120+ tests (test runner natif de Node.js ≥ 20)
npm run market:update  # régénère data/market-snapshot.json depuis les API
```

Un serveur HTTP est nécessaire (les modules ES et le Web Worker ne fonctionnent pas en `file://`). En local, `/api/market` n'existe pas : l'application bascule automatiquement sur l'instantané de marché versionné.

## Données de marché

```
navigateur ──► /api/market (fonction Vercel, cache CDN 24 h) ──► Yahoo Finance · Eurostat · BCE
     │  échec
     ├────────► data/market-snapshot.json (instantané versionné, rafraîchi chaque lundi par GitHub Actions)
     │  échec
     └────────► hypothèses prospectives intégrées (fonctionne hors ligne)
```

| Source | Données | Accès |
|---|---|---|
| Yahoo Finance (API chart v8) | Cours mensuels 10 ans, dividendes réinvestis, des 16 supports cotés : performance 1/3/5/10 ans, rendement, volatilité, baisse maximale, corrélations | Côté serveur uniquement (pas de CORS) |
| Eurostat (`prc_hicp_minr`, ECOICOP v2) | Inflation IPCH France et zone euro | Public, sans clé |
| BCE — ECB Data Portal | €STR, taux de l'État français à 10 ans | Public, sans clé |

Les taux de l'épargne réglementée et les paramètres fiscaux sont fixés par la loi : ils sont centralisés et datés dans [src/config/fiscal.js](src/config/fiscal.js).

## Architecture

```
index.html, style.css      Page unique, thèmes clair/sombre
api/market.js              Fonction serverless Vercel (GET /api/market)
data/market-snapshot.json  Instantané de marché de repli
scripts/                   Génération de l'instantané
src/
  config/   fiscal.js        Paramètres fiscaux 2026 et sources légales
            assumptions.js   Hypothèses par classe d'actifs, corrélations
  data/     catalog.js       Catalogue des 24 supports
            vehicles.js      Enveloppes fiscales
            profiles.js      Profils de risque et allocations de départ
  engine/   simulation.js    Moteur Monte Carlo (pur, sans DOM)
            tax.js           Fiscalité de sortie par enveloppe
            assumptions.js   Résolution des hypothèses, plan de simulation
            allocation.js    Allocation et alertes réglementaires
            correlation.js   Cholesky et régularisation
            rng.js · stats.js Générateur à graine, percentiles, TRI
  market/   builder.js       Collecte Yahoo / Eurostat / BCE (serveur)
            stats.js         Statistiques de séries de cours (isomorphe)
            client.js        Chargement en cascade (navigateur)
  ui/       app.js           Navigation, simulation, exports
            step1.js · step2.js · results.js · charts.js · pdf.js · export.js · dom.js · format.js
  state.js                   État, validation, encodage des liens de partage
  worker.js                  Web Worker du moteur
test/                        Tests unitaires et d'intégration (node --test)
docs/                        Méthodologie et notes de conception
```

Le moteur (`src/engine`, `src/market/stats.js`) est indépendant du navigateur : il est testé sous Node et exécuté dans un Web Worker.

La méthodologie complète (formules, règles fiscales, hypothèses, limites) est décrite dans [docs/METHODOLOGIE.md](docs/METHODOLOGIE.md).

## Sécurité et vie privée

- 100 % côté client : aucune donnée saisie n'est envoyée à un serveur. Les liens de partage encodent les paramètres dans le fragment d'URL (`#…`), jamais transmis au serveur.
- Content-Security-Policy stricte, sans script inline ; bibliothèques CDN avec contrôle d'intégrité (SRI) ; en-têtes HTTP de sécurité dans [vercel.json](vercel.json).
- Aucun contenu dynamique n'est injecté en HTML (`textContent` uniquement) ; les paramètres d'URL et les données de marché sont validés par liste blanche et bornes.

## Déploiement

- **Vercel** (production) : déploiement automatique à chaque push sur la branche par défaut ; la fonction `api/market.js` est détectée automatiquement.
- **GitHub Pages** (miroir statique, sans API live) : [.github/workflows/pages.yml](.github/workflows/pages.yml).
- **CI** : tests sur Node 20, 22 et 24 à chaque push ([.github/workflows/test.yml](.github/workflows/test.yml)) ; instantané de marché rafraîchi chaque semaine ([.github/workflows/market-snapshot.yml](.github/workflows/market-snapshot.yml)).

Historique des versions : [CHANGELOG.md](CHANGELOG.md).
