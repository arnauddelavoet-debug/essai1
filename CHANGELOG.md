# Historique des versions

## 2.0.0 — 2026-10-03

Refonte complète : simulateur hautement paramétrable, fiscalité française 2026, données de marché en direct.

### Ajouts
- **Données de marché** : fonction serverless `/api/market` (Yahoo Finance, Eurostat, BCE) avec cache CDN 24 h, instantané versionné de repli rafraîchi chaque semaine, fonctionnement hors ligne.
- **Catalogue de 24 supports réels** (ETF avec ISIN et TER, livrets, fonds en euros, unités de compte, SCPI, or, crypto-actifs) dans 7 enveloppes, avec performances historiques 1/5/10 ans et baisse maximale.
- **Trois sources d'hypothèses** (prospectif, historique, mixte) et surcharge manuelle du rendement, de la volatilité, des frais courants et des frais d'entrée de chaque support.
- **Allocation libre** ligne par ligne, profils comme point de départ, filtre par enveloppe, ajustement automatique à 100 %, synthèse rendement / volatilité en direct.
- **Fiscalité 2026** : prélèvements sociaux 18,6 % / 17,2 % (LFSS 2026), PFU 31,4 % / 30 %, option globale pour le barème, PER (déduction et sortie en capital), SCPI en direct (revenus fonciers et plus-value immobilière avec abattements pour durée), crypto-actifs, abattement AV en couple, seuil AV de 150 000 €, ancienneté des enveloppes.
- **Moteur** : générateur aléatoire à graine (résultats reproductibles), loi à queues épaisses (Student), rééquilibrage annuel intra-enveloppe, indexation des versements, frais d'entrée, Web Worker avec barre de progression, nombre de scénarios réglable (1 000 à 50 000).
- **Indicateurs** : euros constants, perte de pouvoir d'achat, probabilité d'atteindre un objectif, rendement annualisé (TRI), CVaR 5 %, baisse maximale en cours de route, impôts et frais cumulés, comparaison des enveloppes.
- **Pédagogie** : guide intégré, explication des résultats en langage courant, info-bulles accessibles, alertes réglementaires (plafonds, horizons fiscaux, PER à faible TMI, adéquation au profil).
- **Exports** : lien de partage reproduisant la simulation, CSV compatible Excel, rapport PDF refondu (chargé à la demande).
- Thème sombre, mise en page mobile, navigation au clavier dans les onglets.
- Documentation : [docs/METHODOLOGIE.md](docs/METHODOLOGIE.md), README réécrit.

### Corrections
- Les frais (TER, frais d'enveloppe) n'étaient qu'affichés : ils sont désormais déduits du rendement simulé.
- Le tableau fiscal par enveloppe ignorait les versements mensuels dans la base taxable (gain et impôt surestimés).
- Assurance-vie : les prélèvements sociaux étaient calculés après l'abattement ; ils s'appliquent à la totalité du gain.
- La probabilité de perte comparait la valeur finale au seul capital initial ; elle est comparée au total versé, en valeur nette.
- Le KPI « scénario optimiste » était brut alors que les autres étaient nets.
- SCPI imposées à tort comme un compte-titres (PFU) ; crypto-actifs compensés à tort avec les valeurs mobilières.
- Le script Vercel Analytics inline était bloqué par la CSP ; `frame-ancestors` (ignoré en balise meta) est désormais envoyé en en-tête HTTP.
- Taux de l'épargne réglementée mis à jour (Livret A / LDDS 1,7 %, LEP 2,5 % au 01/08/2026).

### Technique
- Architecture en couches `config / data / engine / market / ui` ; moteur pur testé sous Node.
- 124 tests (contre 34) ; CI sur Node 20, 22 et 24.
- Contrôle d'intégrité (SRI) des bibliothèques CDN, validation par liste blanche des paramètres d'URL et des données de marché, neutralisation de l'injection de formules dans le CSV.
- Plus aucune dépendance npm.

## 1.0.0 — 2026-08-14

Première version consolidée : moteur Monte Carlo joint corrélé, fiscalité par véhicule, export PDF, déploiement Vercel.
