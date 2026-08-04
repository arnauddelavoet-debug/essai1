# Consolidation architecture & refonte du moteur de calcul — SimuPortefeuille

## Contexte

SimuPortefeuille est un simulateur Monte Carlo de portefeuille financier (100 % client, sans backend), déployé sur GitHub Pages. Le dépôt contient aujourd'hui deux implémentations parallèles et non synchronisées :

- `index.html` + `app.js` — architecture modulaire, plus simple, historiquement en retard sur les correctifs.
- `simuportefeuille-standalone.html` — fichier unique, fonctionnellement plus avancé (fiscalité par véhicule avec TMI, sélecteur de produits), mais ayant régressé sur d'autres points (voir audit ci-dessous).

Les deux fichiers sont publiés simultanément sur le même site, avec des résultats différents pour les mêmes paramètres — source de confusion et de duplication de l'effort de correction (les 3 derniers commits n'ont corrigé que le fichier standalone, laissant `app.js` avec des bugs déjà résolus ailleurs).

Ce projet est le premier d'une feuille de route plus large (sélection libre des univers d'investissement, connexion à des API de rendements de marché, mode de conseil guidé façon CGP pour utilisateur néophyte, auditabilité et conformité réglementaire renforcées). Ces chantiers suivants feront l'objet de specs séparées et ne sont pas couverts ici. L'utilisateur souhaite à terme empaqueter l'outil en applications de bureau (`.app` macOS, `.exe` Windows) via un outil type Electron ou Tauri — cet objectif n'est pas mis en œuvre dans ce projet mais oriente le choix d'architecture (voir ci-dessous).

Périmètre explicitement exclu de ce projet : exécution réelle d'ordres financiers. L'outil reste un outil de simulation/suivi ; l'utilisateur saisit ses paramètres, l'outil ne passe aucun ordre.

## Audit des calculs existants — constats

1. **Absence de corrélation entre actifs dans le Monte Carlo joint du portefeuille (standalone)** : chaque produit reçoit un choc aléatoire indépendant. Les ETF actions étant fortement corrélés (~0,85–0,95) dans la réalité, cela sous-estime le risque réel du portefeuille (probabilité de perte, borne basse P10). Régression par rapport à `app.js`, qui disposait d'une matrice de corrélation partielle (mais utilisée uniquement pour un résumé agrégé, pas dans la boucle de simulation complète).
2. **Incohérence méthodologique sur le KPI "Net médian"** : calculé comme la somme des médianes de chaque produit simulées indépendamment, alors que la médiane d'une somme de variables aléatoires n'est pas égale à la somme des médianes. Le chiffre affiché ne correspond à aucun scénario réellement simulé.
3. **Taux d'imposition moyen (dérivé du scénario médian) réappliqué au scénario pessimiste P10** : imprécis car l'abattement AV (4 600 €, montant fixe) et les seuils PEA rendent le taux effectif dépendant du niveau de gain.
4. **Versements mensuels absents du moteur standalone**, alors que présents dans `app.js`. Fonctionnalité centrale pour un outil de gestion de portefeuille réel (épargne programmée).
5. **Ajustement inflation erroné dans `app.js`** : la valeur en "euros constants" est recalculée via une formule déterministe théorique (`capital × (1 + mu − inflation)^horizon`) qui ignore les versements mensuels et ne déflate pas la vraie valeur médiane simulée. Fonctionnalité absente du standalone.

## Décisions d'architecture

- **Base unique modulaire** : le code de `simuportefeuille-standalone.html` est décomposé et fusionné dans l'architecture `index.html` + fichiers JS séparés par responsabilité :
  - `products.js` — catalogue de produits + matrice de corrélation
  - `simulation.js` — moteur Monte Carlo (risque + fiscalité)
  - `ui.js` — navigation, formulaires, rendu des allocations
  - `charts.js` — graphiques Chart.js
  - `pdf.js` — génération du rapport PDF
- `simuportefeuille-standalone.html` est **supprimé** du dépôt une fois la migration validée.
- Cette base modulaire devient la source unique pour le site web et pour les futurs packages desktop (Electron/Tauri n'imposent aucune contrainte sur le nombre de fichiers source).
- **Catalogue de produits fusionné** : union des deux catalogues existants (aucune fonctionnalité déjà livrée n'est perdue) — réintégration de Fonds Euro AV, SCPI, UC Obligataire, UC Actions Monde et Obligations d'État génériques (présents seulement dans `app.js`) dans le catalogue enrichi de `standalone` (LEP, S&P 500, Nasdaq 100, Small Cap Europe, Dividendes Europe...).
- **Matrice de corrélation étendue** à l'ensemble du catalogue fusionné. Les paires non renseignées restent à ρ = 0 (approximation documentée).

## Moteur de simulation

Principe : un seul Monte Carlo joint et corrélé, à pas mensuel, dont sortent à la fois le risque et la fiscalité — plus de recombinaison a posteriori de calculs issus de simulations séparées.

- **Pas de temps** : mensuel (`dt = 1/12`), nécessaire pour modéliser les versements récurrents.
- **Corrélation** : à chaque mois de chaque scénario, un vecteur de chocs corrélés est tiré via décomposition de Cholesky de la matrice de corrélation restreinte aux produits effectivement détenus. Si la submatrice n'est pas définie positive, elle est régularisée automatiquement (clipping des valeurs propres) plutôt que de provoquer une erreur.
- **Versements mensuels** : répartis chaque mois selon les pondérations cibles, ajoutés après application du rendement du mois (méthode déjà en place dans `app.js`).
- **Fiscalité par scénario** : pour chacun des `N_SIMS` scénarios, le gain réel de chaque produit *dans ce scénario* est agrégé par véhicule fiscal (Livret / PEA / AV / CTO), puis la fonction `calcTax` existante est appliquée à ce gain réel — jamais à une médiane recalculée séparément. Chaque scénario produit ainsi une valeur brute et une valeur nette mutuellement cohérentes.
- **Percentiles** : P10/P25/P50/P75/P90 bruts et nets sont calculés indépendamment sur les distributions de valeurs brutes et nettes obtenues (statistiquement correct — le P50 net ne provient pas nécessairement du même scénario que le P50 brut).
- **Tableau détail par produit** : le P50 par produit provient désormais des mêmes trajectoires corrélées jointes. La somme des médianes par produit reste différente de la médiane globale (propriété mathématique normale) — un libellé et une info-bulle le précisent explicitement pour éviter toute confusion utilisateur.
- **Euros constants (inflation)** : la valeur affichée est obtenue en déflatant la vraie valeur simulée (`valeur simulée / (1 + inflation)^horizon`), et non plus via une formule déterministe déconnectée de la simulation réelle.

## KPIs et affichage des résultats

- Les cartes KPI (probabilité de perte, médiane, P10/P90) s'appuient sur les valeurs **nettes** cohérentes issues du moteur joint. Le "Net médian" — KPI le plus visible du rapport — provient désormais d'une véritable percentile du portefeuille net simulé.
- Le tableau fiscal par véhicule et le tableau détail par produit portent une note explicite sur la non-additivité des médianes individuelles.
- La jauge de risque reflète une volatilité plus réaliste (les corrélations font remonter le risque affiché pour les portefeuilles concentrés en actions corrélées).
- La valeur en euros constants réapparaît (corrigée) dans l'explicatif à l'écran et dans le PDF.

## Gestion des erreurs

- Conservation du pattern existant : validation stricte des entrées (capital, horizon, versements, profil), `try/catch` autour de la simulation avec message générique côté utilisateur (aucune stack trace exposée), overlay de chargement pendant le calcul.
- Nouveau cas : régularisation silencieuse (log console uniquement) si la matrice de corrélation restreinte n'est pas définie positive.
- Performance : `N_SIMS` × jusqu'à 360 pas mensuels × plusieurs produits corrélés sera benchmarké pendant l'implémentation. Si trop lent, réduction de `N_SIMS` (ex. 5 000) plutôt que complexification de l'architecture (pas de Web Worker à ce stade).

## Tests

Introduction d'un outillage de test minimal (`node --test`, natif Node.js, zéro dépendance) couvrant :
- `calcTax` sur les cas limites réglementaires (PEA à 4/5 ans, AV à 7/8 ans avec et sans dépassement de l'abattement de 4 600 €, CTO PFU vs barème TMI).
- Convergence statistique de la corrélation empirique des tirages simulés vers la matrice de corrélation d'entrée.
- Cohérence du calcul de percentile et de la relation brut/net.

Cet outillage pose également les bases nécessaires pour l'empaquetage desktop futur (Electron/Tauri nécessitent Node/npm).

## Hors périmètre (chantiers futurs, specs séparées)

- Sélection libre des univers d'investissement (au-delà du sélecteur d'inclusion/exclusion déjà existant).
- Connexions API pour mise à jour des rendements de marché.
- Auditabilité et conformité réglementaire renforcées (traçabilité, journalisation).
- Mode de conseil guidé façon CGP pour utilisateur néophyte.
- Refonte UX/UI.
- Empaquetage desktop (`.app` / `.exe`).
