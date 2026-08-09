# SimuPortefeuille

Simulateur Monte Carlo de portefeuille financier — moteur de calcul et interface web statique, sans build ni dépendance runtime.

## Démarrage

Aucune installation n'est nécessaire pour lancer l'application : ouvrez [index.html](index.html) directement dans un navigateur, ou servez le dossier avec un serveur statique local, par exemple :

```bash
npx serve .
```

## Tests

Le projet utilise le test runner natif de Node.js (aucune dépendance de test).

```bash
npm test
```

## Structure du projet

```
index.html          Page unique de l'application
style.css            Styles
src/
  main.js            Point d'entrée
  ui.js               Rendu de l'interface et interactions
  charts.js           Graphiques (Chart.js)
  pdf.js               Export PDF des résultats (jsPDF)
  simulation.js       Moteur Monte Carlo joint corrélé
  correlation.js      Décomposition de Cholesky
  tax.js               Fiscalité par véhicule (PEA, AV, CTO, livrets…)
  products.js          Catalogue des produits et hypothèses de marché
  format.js            Formatage des nombres (écran et PDF)
  state.js             État applicatif
  errors.js            Gestion des erreurs et indicateurs de chargement
test/                 Tests unitaires (node --test)
docs/                 Notes de conception et plans de refactorisation
```

## Dépendances

Aucune dépendance npm. Chart.js et jsPDF sont chargés depuis un CDN directement dans `index.html`.

## Déploiement

Le site est déployé automatiquement sur GitHub Pages à chaque push sur `main` (voir [.github/workflows/pages.yml](.github/workflows/pages.yml)).
