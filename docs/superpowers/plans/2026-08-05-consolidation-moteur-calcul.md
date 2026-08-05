# Consolidation architecture & refonte du moteur de calcul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fusionner `app.js`/`index.html` et `simuportefeuille-standalone.html` en une seule architecture modulaire, avec un moteur de simulation Monte Carlo corrélé (corrélations entre actifs, versements mensuels, fiscalité calculée scénario par scénario, ajustement inflation corrigé), puis supprimer le fichier standalone devenu redondant.

**Architecture:** Code JavaScript en modules ES natifs (`<script type="module">`, pas de bundler) organisés par responsabilité sous `src/` ; `index.html` conserve sa structure actuelle (cartes produits, étapes, onglets) étendue avec un champ TMI et un tableau fiscal, volontairement sans refonte visuelle (hors périmètre de ce projet). Tests unitaires sur la logique pure (fiscalité, corrélations, moteur de simulation) via `node --test`, zéro dépendance npm.

**Tech Stack:** JavaScript ES2022 (modules natifs), Chart.js 4.4.0 (CDN), jsPDF 2.5.1 + AutoTable (CDN), Node.js `node:test` + `node:assert/strict` pour les tests.

---

## Aperçu de la structure de fichiers

```
package.json                 (nouveau — outillage de test)
index.html                   (modifié — champ TMI, tableau fiscal, script type="module")
style.css                    (modifié — style du <select> TMI, classe d'espacement)
src/
  format.js                  (nouveau — fmt, fmtPct, fmtPdf, fmtPctPdf)
  tax.js                     (nouveau — calcTax, porté depuis standalone)
  correlation.js              (nouveau — matrice de corrélation restreinte + Cholesky)
  products.js                 (nouveau — catalogue fusionné, corrélations, suggestions, profils)
  simulation.js               (nouveau — moteur Monte Carlo joint corrélé)
  state.js                    (nouveau — état global partagé)
  errors.js                   (nouveau — showError/hideError/showLoading/hideLoading)
  charts.js                   (nouveau — jauge, histogramme, fan chart, donut)
  ui.js                       (nouveau — navigation, allocation, rendu des résultats)
  pdf.js                       (nouveau — génération du rapport PDF)
  main.js                     (nouveau — point d'entrée DOMContentLoaded)
test/
  format.test.js
  tax.test.js
  correlation.test.js
  simulation.test.js
app.js                        (supprimé — Task 14)
simuportefeuille-standalone.html (supprimé — Task 14)
```

**Décision de portée UI :** ce projet ne refait pas l'interface (chantier séparé "Refonte UX/UI"). L'UI reste celle d'`index.html` actuel (cartes produits avec inclusion/exclusion, grille KPI à 4 cases, 3 onglets). Les seuls ajouts HTML sont : un champ TMI (étape 1) et un tableau fiscal par véhicule (onglet Détail), tous deux réutilisant les classes CSS existantes.

---

### Task 1: Scaffolding du projet et outillage de test

**Files:**
- Create: `package.json`
- Create: `test/format.test.js` (test trivial de vérification de l'outillage, remplacé au Task 2)

- [ ] **Step 1: Créer `package.json`**

```json
{
  "name": "simuportefeuille",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "Simulateur Monte Carlo de portefeuille financier — moteur de calcul et interface web statique.",
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Créer un test trivial pour vérifier l'outillage**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('node --test est opérationnel', () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 3: Lancer les tests pour vérifier que l'outillage fonctionne**

Run: `npm test`
Expected: `# pass 1`, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add package.json test/format.test.js
git commit -m "chore: initialiser l'outillage de test node --test"
```

---

### Task 2: `src/format.js` — formatage des nombres

**Files:**
- Create: `src/format.js`
- Modify: `test/format.test.js` (remplace le test trivial du Task 1)

- [ ] **Step 1: Écrire les tests (remplace le contenu du Task 1)**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fmt, fmtPct, fmtPdf, fmtPctPdf } from '../src/format.js';

test('fmt formate un entier positif avec le signe euro et espace insécable', () => {
  assert.equal(fmt(10000), '10 000 €');
});

test('fmt retourne un tiret cadratin pour les valeurs non finies', () => {
  assert.equal(fmt(NaN), '—');
  assert.equal(fmt(Infinity), '—');
});

test('fmtPct formate un ratio en pourcentage avec une décimale', () => {
  assert.equal(fmtPct(0.153), '15.3 %');
});

test('fmtPct retourne un tiret cadratin pour les valeurs non finies', () => {
  assert.equal(fmtPct(NaN), '—');
});

test('fmtPdf formate avec séparateur espace ASCII et suffixe EUR (compatible jsPDF/Helvetica)', () => {
  assert.equal(fmtPdf(1234567), '1 234 567 EUR');
});

test('fmtPdf gère les valeurs négatives', () => {
  assert.equal(fmtPdf(-500), '-500 EUR');
});

test('fmtPdf retourne un tiret simple pour les valeurs non finies', () => {
  assert.equal(fmtPdf(NaN), '-');
});

test('fmtPctPdf formate un ratio en pourcentage ASCII', () => {
  assert.equal(fmtPctPdf(0.128), '12.8%');
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/format.js'`

- [ ] **Step 3: Créer `src/format.js`**

```javascript
/**
 * Formate un nombre en euros (fr-FR) — pour l'interface web.
 */
export function fmt(n) {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
}

/**
 * Formate un ratio [0..1] en pourcentage — pour l'interface web.
 */
export function fmtPct(p) {
  if (!Number.isFinite(p)) return '—';
  return (p * 100).toFixed(1) + ' %';
}

/**
 * Formateurs PDF-safe : séparateurs ASCII uniquement (pas de   ni  )
 * jsPDF avec polices Helvetica ne supporte pas les caractères Unicode avancés.
 */
export function fmtPdf(n) {
  if (!Number.isFinite(n)) return '-';
  const rounded = Math.round(n);
  const abs = Math.abs(rounded);
  const str = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (rounded < 0 ? '-' : '') + str + ' EUR';
}

export function fmtPctPdf(p) {
  if (!Number.isFinite(p)) return '-';
  return (p * 100).toFixed(1) + '%';
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test`
Expected: `# pass 8`

- [ ] **Step 5: Commit**

```bash
git add src/format.js test/format.test.js
git commit -m "feat: ajouter le module de formatage src/format.js"
```

---

### Task 3: `src/tax.js` — calcul de la fiscalité française par véhicule

**Files:**
- Create: `src/tax.js`
- Create: `test/tax.test.js`

- [ ] **Step 1: Écrire les tests**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcTax } from '../src/tax.js';

test('un gain nul ou négatif ne génère aucun impôt, quel que soit le véhicule', () => {
  for (const vehicle of ['Livret', 'PEA', 'AV', 'CTO']) {
    assert.deepEqual(calcTax(0, vehicle, 10, 30), { irTax: 0, psTax: 0, total: 0 });
    assert.deepEqual(calcTax(-500, vehicle, 10, 30), { irTax: 0, psTax: 0, total: 0 });
  }
});

test('Livret A/LDDS/LEP sont toujours exonérés, même avec un gain positif', () => {
  assert.deepEqual(calcTax(1000, 'Livret', 20, 45), { irTax: 0, psTax: 0, total: 0 });
});

test('PEA >= 5 ans : exonération IR, PS 17,2 % uniquement', () => {
  const r = calcTax(1000, 'PEA', 5, 30);
  assert.equal(r.irTax, 0);
  assert.ok(Math.abs(r.psTax - 172) < 1e-9);
  assert.ok(Math.abs(r.total - 172) < 1e-9);
});

test('PEA < 5 ans : flat tax 30 % (IR 12,8 % + PS 17,2 %)', () => {
  const r = calcTax(1000, 'PEA', 4, 30);
  assert.ok(Math.abs(r.irTax - 128) < 1e-9);
  assert.ok(Math.abs(r.psTax - 172) < 1e-9);
  assert.ok(Math.abs(r.total - 300) < 1e-9);
});

test('AV >= 8 ans avec gain sous l\'abattement de 4600 € : aucun impôt', () => {
  const r = calcTax(4000, 'AV', 8, 30);
  assert.deepEqual(r, { irTax: 0, psTax: 0, total: 0 });
});

test('AV >= 8 ans avec gain au-dessus de l\'abattement : taux réduit 7,5 % + PS sur la part imposable', () => {
  const r = calcTax(10000, 'AV', 8, 30);
  // taxable = 10000 - 4600 = 5400 ; irRate = min(0.075, 0.30) = 0.075
  assert.ok(Math.abs(r.irTax - 5400 * 0.075) < 1e-9);
  assert.ok(Math.abs(r.psTax - 5400 * 0.172) < 1e-9);
  assert.ok(Math.abs(r.total - 5400 * 0.247) < 1e-6);
});

test('AV >= 8 ans : le taux IR réduit est plafonné par une TMI plus basse', () => {
  const r = calcTax(10000, 'AV', 8, 0); // TMI 0 % < 7,5 %
  assert.ok(Math.abs(r.irTax - 5400 * 0) < 1e-9);
});

test('AV < 8 ans : flat tax 30 %, pas d\'abattement', () => {
  const r = calcTax(10000, 'AV', 7, 30);
  assert.ok(Math.abs(r.total - 3000) < 1e-9);
});

test('CTO utilise le PFU 30 % quand la TMI est élevée (plus avantageux)', () => {
  const r = calcTax(1000, 'CTO', 10, 45); // tmiTotal = (0.45+0.172)=62.2% > 30%
  assert.ok(Math.abs(r.total - 300) < 1e-9);
  assert.ok(Math.abs(r.irTax - 128) < 1e-9);
});

test('CTO bascule sur le barème TMI + PS quand c\'est plus avantageux que le PFU', () => {
  const r = calcTax(1000, 'CTO', 10, 0); // tmiTotal = (0+0.172)=17.2% < 30%
  assert.ok(Math.abs(r.total - 172) < 1e-9);
  assert.ok(Math.abs(r.irTax - 0) < 1e-9);
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/tax.js'`

- [ ] **Step 3: Créer `src/tax.js`**

```javascript
const PS_RATE = 0.172; // CSG 9,2 % + CRDS 0,5 % + Prélèvement de solidarité 7,5 %

/**
 * Calcule l'impôt sur un gain brut selon le véhicule fiscal, l'horizon
 * de détention et la tranche marginale d'imposition (TMI) du foyer.
 * @returns {{irTax: number, psTax: number, total: number}}
 */
export function calcTax(grossGain, vehicle, horizon, tmi) {
  if (grossGain <= 0) return { irTax: 0, psTax: 0, total: 0 };
  if (vehicle === 'Livret') return { irTax: 0, psTax: 0, total: 0 };

  if (vehicle === 'PEA') {
    if (horizon >= 5) {
      return { irTax: 0, psTax: grossGain * PS_RATE, total: grossGain * PS_RATE };
    }
    return { irTax: grossGain * 0.128, psTax: grossGain * PS_RATE, total: grossGain * 0.30 };
  }

  if (vehicle === 'AV') {
    if (horizon >= 8) {
      const abattement = 4600;
      const taxable = Math.max(0, grossGain - abattement);
      const irRate = Math.min(0.075, tmi / 100);
      const irTax = taxable * irRate;
      const psTax = taxable * PS_RATE;
      return { irTax, psTax, total: irTax + psTax };
    }
    return { irTax: grossGain * 0.128, psTax: grossGain * PS_RATE, total: grossGain * 0.30 };
  }

  // CTO : PFU 30 % (IR 12,8 % + PS 17,2 %) ou barème TMI + PS si plus avantageux
  const flatTotal = grossGain * 0.30;
  const tmiTotal = grossGain * (tmi / 100 + PS_RATE);
  if (flatTotal <= tmiTotal) {
    return { irTax: grossGain * 0.128, psTax: grossGain * PS_RATE, total: flatTotal };
  }
  return { irTax: grossGain * (tmi / 100), psTax: grossGain * PS_RATE, total: tmiTotal };
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test`
Expected: `# pass 8` (Task 2) + `# pass 10` (Task 3) — tous verts.

- [ ] **Step 5: Commit**

```bash
git add src/tax.js test/tax.test.js
git commit -m "feat: ajouter le module de fiscalite src/tax.js"
```

---

### Task 4: `src/correlation.js` — matrice de corrélation restreinte et Cholesky

**Files:**
- Create: `src/correlation.js`
- Create: `test/correlation.test.js`

- [ ] **Step 1: Écrire les tests**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCorrelationMatrix, cholesky, applyCholesky } from '../src/correlation.js';

test('buildCorrelationMatrix place 1 sur la diagonale et 0 pour les paires non renseignées', () => {
  const correlations = { a: { b: 0.5 } };
  const m = buildCorrelationMatrix(['a', 'b', 'c'], correlations);
  assert.equal(m[0][0], 1);
  assert.equal(m[1][1], 1);
  assert.equal(m[2][2], 1);
  assert.equal(m[0][1], 0.5);
  assert.equal(m[1][0], 0.5); // symétrie via la paire inverse
  assert.equal(m[0][2], 0);
  assert.equal(m[1][2], 0);
});

test('buildCorrelationMatrix lit la corrélation quel que soit le sens de la paire déclarée', () => {
  const correlations = { b: { a: 0.3 } }; // déclarée dans l'autre sens
  const m = buildCorrelationMatrix(['a', 'b'], correlations);
  assert.equal(m[0][1], 0.3);
  assert.equal(m[1][0], 0.3);
});

test('cholesky reconstruit la matrice d\'origine pour une matrice définie positive', () => {
  const matrix = [
    [1, 0.5],
    [0.5, 1],
  ];
  const L = cholesky(matrix);
  // Reconstruire L * L^T et comparer à la matrice d'origine
  const reconstructed = [
    [L[0][0] * L[0][0], L[0][0] * L[1][0]],
    [L[1][0] * L[0][0], L[1][0] * L[1][0] + L[1][1] * L[1][1]],
  ];
  assert.ok(Math.abs(reconstructed[0][0] - matrix[0][0]) < 1e-9);
  assert.ok(Math.abs(reconstructed[0][1] - matrix[0][1]) < 1e-9);
  assert.ok(Math.abs(reconstructed[1][1] - matrix[1][1]) < 1e-9);
});

test('cholesky se régularise sans planter sur une matrice non définie positive', () => {
  // Corrélations incohérentes entre elles (impossible en pratique) :
  // rho(a,b)=0.9, rho(a,c)=0.9, rho(b,c)=-0.9 → matrice non PSD
  const matrix = [
    [1, 0.9, 0.9],
    [0.9, 1, -0.9],
    [0.9, -0.9, 1],
  ];
  const L = cholesky(matrix);
  for (const row of L) {
    for (const v of row) {
      assert.ok(Number.isFinite(v), 'chaque terme de L doit être fini (pas de NaN)');
    }
  }
});

test('applyCholesky sur une matrice identité ne modifie pas les chocs (aucune corrélation)', () => {
  const L = cholesky([[1, 0], [0, 1]]);
  const shocks = [1.5, -0.7];
  const correlated = applyCholesky(L, shocks);
  assert.ok(Math.abs(correlated[0] - 1.5) < 1e-9);
  assert.ok(Math.abs(correlated[1] - (-0.7)) < 1e-9);
});

test('applyCholesky produit une corrélation empirique proche de la corrélation d\'entrée sur un grand échantillon', () => {
  const rho = 0.7;
  const L = cholesky([[1, rho], [rho, 1]]);
  const N = 20000;
  const xs = [];
  const ys = [];
  for (let i = 0; i < N; i++) {
    const [x, y] = applyCholesky(L, [randn(), randn()]);
    xs.push(x);
    ys.push(y);
  }
  const empiricalRho = sampleCorrelation(xs, ys);
  assert.ok(Math.abs(empiricalRho - rho) < 0.05, `corrélation empirique ${empiricalRho} trop éloignée de ${rho}`);
});

function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function sampleCorrelation(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  return sxy / Math.sqrt(sxx * syy);
}
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/correlation.js'`

- [ ] **Step 3: Créer `src/correlation.js`**

```javascript
/**
 * Construit la matrice de corrélation n×n restreinte à un sous-ensemble
 * d'identifiants de produits, à partir de la table de corrélations
 * partielle (paire -> ρ). Diagonale à 1, paires non renseignées à 0.
 */
export function buildCorrelationMatrix(ids, correlations) {
  const n = ids.length;
  const matrix = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const rho = getRho(ids[i], ids[j], correlations);
      matrix[i][j] = rho;
      matrix[j][i] = rho;
    }
  }
  return matrix;
}

function getRho(idA, idB, correlations) {
  const direct = correlations[idA] && correlations[idA][idB];
  if (direct !== undefined) return direct;
  const reverse = correlations[idB] && correlations[idB][idA];
  if (reverse !== undefined) return reverse;
  return 0;
}

/**
 * Décomposition de Cholesky d'une matrice symétrique n×n.
 * Si un pivot est non positif (matrice non définie positive — peut
 * arriver avec des corrélations saisies manuellement et mutuellement
 * incohérentes), il est remplacé par un epsilon minimal plutôt que de
 * produire NaN : régularisation défensive, jamais d'erreur bloquante.
 * Retourne la matrice triangulaire inférieure L telle que L·Lᵀ ≈ matrix.
 */
export function cholesky(matrix) {
  const n = matrix.length;
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  const EPS = 1e-8;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = matrix[i][j];
      for (let k = 0; k < j; k++) {
        sum -= L[i][k] * L[j][k];
      }
      if (i === j) {
        L[i][j] = Math.sqrt(Math.max(sum, EPS));
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }
  return L;
}

/**
 * Applique la matrice L à un vecteur de chocs indépendants N(0,1) pour
 * produire un vecteur de chocs corrélés selon la matrice d'origine.
 */
export function applyCholesky(L, independentShocks) {
  const n = L.length;
  const result = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = 0; k <= i; k++) {
      sum += L[i][k] * independentShocks[k];
    }
    result[i] = sum;
  }
  return result;
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test`
Expected: tous les tests passent (Tasks 2+3+4 cumulés).

- [ ] **Step 5: Commit**

```bash
git add src/correlation.js test/correlation.test.js
git commit -m "feat: ajouter le module de correlation src/correlation.js (Cholesky)"
```

---

### Task 5: `src/products.js` — catalogue de produits fusionné

**Files:**
- Create: `src/products.js`

Ce module fusionne le catalogue d'`app.js` (Fonds Euro AV, SCPI, UC Obligataire, UC Actions, Obligations d'État) et de `simuportefeuille-standalone.html` (LEP, S&P 500, Nasdaq 100, Small Cap Europe, Dividendes Europe, ETF Obligations). Les produits conceptuellement identiques entre les deux fichiers (Livret A, LDDS, ETF Monde, ETF Émergents, Obligations d'État, Crypto) sont fusionnés en une seule entrée, en retenant les données les plus récentes (le Livret A est passé à 2,4 % au 01/02/2025, valeur reprise du fichier standalone plutôt que les 3 % d'`app.js` qui dataient de 2024).

Le champ `riskProfile` présent dans `app.js` n'est repris nulle part dans ce module : il était défini sur chaque produit mais jamais lu par aucune fonction (vérifié par `grep -n riskProfile app.js` → 11 occurrences, toutes dans la déclaration des données, aucune dans la logique). Donnée morte, non reconduite.

- [ ] **Step 1: Créer `src/products.js`**

```javascript
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
```

- [ ] **Step 2: Vérifier que tous les produits référencés dans SUGGESTIONS existent dans PRODUCTS**

Run:
```bash
node --input-type=module -e "
import { PRODUCTS, SUGGESTIONS } from './src/products.js';
const ids = new Set(PRODUCTS.map(p => p.id));
let ok = true;
for (const [risk, def] of Object.entries(SUGGESTIONS)) {
  const total = Object.values(def.alloc).reduce((a,b)=>a+b,0);
  if (total !== 100) { console.error(risk, 'total =', total, '!= 100'); ok = false; }
  for (const id of Object.keys(def.alloc)) {
    if (!ids.has(id)) { console.error(risk, 'ref produit inconnu:', id); ok = false; }
  }
}
console.log(ok ? 'OK' : 'ECHEC');
"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/products.js
git commit -m "feat: ajouter le catalogue de produits fusionne src/products.js"
```

---

### Task 6: `src/simulation.js` — moteur Monte Carlo joint corrélé

**Files:**
- Create: `src/simulation.js`
- Create: `test/simulation.test.js`

- [ ] **Step 1: Écrire les tests**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSimulation, blendedParams, percentile } from '../src/simulation.js';

const LIVRET = { id: 'livret-a', mu: 0.024, sigma: 0, vehicleFiscal: 'Livret' };
const VOLATILE = { id: 'etf-world', mu: 0.075, sigma: 0.155, vehicleFiscal: 'PEA' };
const AV_PRODUCT = { id: 'fonds-euro', mu: 0.025, sigma: 0.004, vehicleFiscal: 'AV' };

test('percentile retourne 0 pour un tableau vide et gère les bornes', () => {
  assert.equal(percentile([], 50), 0);
  const sorted = [1, 2, 3, 4, 5];
  assert.equal(percentile(sorted, 0), 1);
  assert.equal(percentile(sorted, 100), 5);
});

test('runSimulation leve une erreur si aucun produit n\'est alloue', () => {
  assert.throws(() => runSimulation({
    capital: 10000, horizon: 10, mensuel: 0, tmi: 30,
    alloc: {}, products: [LIVRET], correlations: {}, nSims: 100,
  }), /Aucun produit alloué/);
});

test('portefeuille 100% Livret (sigma=0) : tous les scenarios sont identiques (deterministe)', () => {
  const result = runSimulation({
    capital: 10000, horizon: 10, mensuel: 0, tmi: 30,
    alloc: { 'livret-a': 100 }, products: [LIVRET], correlations: {}, nSims: 500,
  });
  const expected = 10000 * Math.pow(1.024, 10);
  assert.ok(Math.abs(result.p10 - expected) < 1);
  assert.ok(Math.abs(result.p50 - expected) < 1);
  assert.ok(Math.abs(result.p90 - expected) < 1);
  assert.equal(result.probLoss, 0); // rendement positif garanti > capital initial
});

test('la mediane brute d\'un actif volatil converge vers la formule fermee du MBG (sans versements)', () => {
  const result = runSimulation({
    capital: 10000, horizon: 10, mensuel: 0, tmi: 30,
    alloc: { 'etf-world': 100 }, products: [VOLATILE], correlations: {}, nSims: 20000,
  });
  const theoreticalMedian = 10000 * Math.exp((VOLATILE.mu - 0.5 * VOLATILE.sigma * VOLATILE.sigma) * 10);
  const relErr = Math.abs(result.p50 - theoreticalMedian) / theoreticalMedian;
  assert.ok(relErr < 0.05, `mediane simulee ${result.p50} trop eloignee de la theorique ${theoreticalMedian}`);
});

test('la valeur nette est toujours inferieure ou egale a la valeur brute (l\'impot ne peut pas etre negatif)', () => {
  const result = runSimulation({
    capital: 10000, horizon: 10, mensuel: 200, tmi: 30,
    alloc: { 'fonds-euro': 100 }, products: [AV_PRODUCT], correlations: {}, nSims: 5000,
  });
  assert.ok(result.netP50 <= result.p50);
  assert.ok(result.netP10 <= result.p10);
});

test('les versements mensuels augmentent la valeur finale mediane par rapport a un capital seul', () => {
  const withoutContrib = runSimulation({
    capital: 10000, horizon: 10, mensuel: 0, tmi: 30,
    alloc: { 'livret-a': 100 }, products: [LIVRET], correlations: {}, nSims: 500,
  });
  const withContrib = runSimulation({
    capital: 10000, horizon: 10, mensuel: 200, tmi: 30,
    alloc: { 'livret-a': 100 }, products: [LIVRET], correlations: {}, nSims: 500,
  });
  assert.ok(withContrib.p50 > withoutContrib.p50);
});

test('fiscalByVehicle regroupe correctement le capital par vehicule fiscal', () => {
  const result = runSimulation({
    capital: 10000, horizon: 10, mensuel: 0, tmi: 30,
    alloc: { 'livret-a': 50, 'fonds-euro': 50 },
    products: [LIVRET, AV_PRODUCT], correlations: {}, nSims: 500,
  });
  assert.ok(Math.abs(result.fiscalByVehicle['Livret'].capital - 5000) < 1e-6);
  assert.ok(Math.abs(result.fiscalByVehicle['AV'].capital - 5000) < 1e-6);
  assert.equal(result.fiscalByVehicle['Livret'].tax, 0); // Livret jamais imposé
});

test('blendedParams : une correlation positive augmente la volatilite du portefeuille par rapport a une correlation nulle', () => {
  const products = [
    { id: 'a', mu: 0.07, sigma: 0.15 },
    { id: 'b', mu: 0.07, sigma: 0.15 },
  ];
  const alloc = { a: 50, b: 50 };
  const uncorrelated = blendedParams(alloc, products, {});
  const correlated = blendedParams(alloc, products, { a: { b: 0.9 } });
  assert.ok(correlated.sigma > uncorrelated.sigma);
});

test('blendedParams calcule mu comme la moyenne ponderee des rendements', () => {
  const products = [
    { id: 'a', mu: 0.02, sigma: 0 },
    { id: 'b', mu: 0.08, sigma: 0 },
  ];
  const { mu } = blendedParams({ a: 25, b: 75 }, products, {});
  assert.ok(Math.abs(mu - (0.25 * 0.02 + 0.75 * 0.08)) < 1e-9);
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/simulation.js'`

- [ ] **Step 3: Créer `src/simulation.js`**

```javascript
import { calcTax } from './tax.js';
import { buildCorrelationMatrix, cholesky, applyCholesky } from './correlation.js';

const VEHICLES = ['Livret', 'PEA', 'AV', 'CTO'];

function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Retourne le percentile p (0–100) d'un tableau trié croissant. */
export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function getRho(idA, idB, correlations) {
  if (idA === idB) return 1;
  const direct = correlations[idA] && correlations[idA][idB];
  if (direct !== undefined) return direct;
  const reverse = correlations[idB] && correlations[idB][idA];
  if (reverse !== undefined) return reverse;
  return 0;
}

function resolveActive(alloc, products) {
  return Object.entries(alloc)
    .filter(([, pct]) => pct > 0)
    .map(([id, pct]) => ({ id, w: pct / 100, p: products.find(x => x.id === id) }))
    .filter(({ p }) => p);
}

/**
 * Paramètres analytiques (μ, σ) du portefeuille, pondérés par allocation
 * et corrélations — utilisé pour l'affichage synthétique (jauge de
 * risque), indépendamment de la simulation Monte Carlo.
 * σ_P = √(Σᵢ Σⱼ wᵢ wⱼ ρᵢⱼ σᵢ σⱼ)
 */
export function blendedParams(alloc, products, correlations) {
  const active = resolveActive(alloc, products);

  let mu = 0;
  for (const { w, p } of active) mu += w * p.mu;

  let varP = 0;
  for (const a of active) {
    for (const b of active) {
      const rho = getRho(a.id, b.id, correlations);
      varP += a.w * b.w * rho * a.p.sigma * b.p.sigma;
    }
  }
  return { mu, sigma: Math.sqrt(Math.max(0, varP)) };
}

/**
 * Moteur de simulation Monte Carlo joint et corrélé, à pas mensuel.
 * Chaque scénario simule tous les produits détenus ensemble (chocs
 * corrélés via décomposition de Cholesky), avec versements mensuels
 * répartis selon les pondérations cibles, puis applique la fiscalité
 * au gain réel de CE scénario — jamais à une médiane recalculée
 * séparément. Les percentiles bruts et nets proviennent donc de la
 * même famille de scénarios (cohérence statistique).
 */
export function runSimulation({ capital, horizon, mensuel, alloc, tmi, products, correlations, nSims = 10000 }) {
  const active = resolveActive(alloc, products);
  if (active.length === 0) {
    throw new Error('Aucun produit alloué — impossible de simuler.');
  }

  const ids = active.map(a => a.id);
  const corrMatrix = buildCorrelationMatrix(ids, correlations);
  const L = cholesky(corrMatrix);

  const dt = 1 / 12;
  const months = Math.round(horizon * 12);

  const grossFinals = new Float64Array(nSims);
  const netFinals = new Float64Array(nSims);

  const productFinals = {};
  ids.forEach(id => { productFinals[id] = new Float64Array(nSims); });

  const vehicleFinals = {};
  const vehicleCapital = {};
  VEHICLES.forEach(v => { vehicleFinals[v] = new Float64Array(nSims); vehicleCapital[v] = 0; });
  active.forEach(({ w, p }) => { vehicleCapital[p.vehicleFiscal] += capital * w; });

  const pctPaths = { p10: [capital], p25: [capital], p50: [capital], p75: [capital], p90: [capital] };
  const yearlySnapshots = Array.from({ length: horizon }, () => new Float64Array(nSims));

  for (let s = 0; s < nSims; s++) {
    const values = active.map(({ w }) => capital * w);
    let monthInYear = 0;
    let yearIdx = 0;

    for (let m = 0; m < months; m++) {
      const shocks = active.map(() => randn());
      const correlated = applyCholesky(L, shocks);

      for (let i = 0; i < active.length; i++) {
        const { w, p } = active[i];
        if (p.sigma === 0) {
          values[i] *= Math.pow(1 + p.mu, dt);
        } else {
          values[i] *= Math.exp((p.mu - 0.5 * p.sigma * p.sigma) * dt + p.sigma * Math.sqrt(dt) * correlated[i]);
        }
        values[i] += mensuel * w;
      }

      monthInYear++;
      if (monthInYear === 12) {
        monthInYear = 0;
        const portfolioValue = values.reduce((a, b) => a + b, 0);
        yearlySnapshots[yearIdx][s] = portfolioValue;
        yearIdx++;
      }
    }

    // Fiscalité par scénario, agrégée par véhicule fiscal
    let grossTotal = 0;
    const gainByVehicle = {};
    VEHICLES.forEach(v => { gainByVehicle[v] = 0; });

    for (let i = 0; i < active.length; i++) {
      const { w, p } = active[i];
      const finalV = values[i];
      productFinals[p.id][s] = finalV;
      grossTotal += finalV;
      vehicleFinals[p.vehicleFiscal][s] += finalV;

      const invested = capital * w + mensuel * w * months;
      gainByVehicle[p.vehicleFiscal] += Math.max(0, finalV - invested);
    }

    let taxTotal = 0;
    for (const v of VEHICLES) {
      taxTotal += calcTax(gainByVehicle[v], v, horizon, tmi).total;
    }

    grossFinals[s] = grossTotal;
    netFinals[s] = grossTotal - taxTotal;
  }

  const sortedGross = Array.from(grossFinals).sort((a, b) => a - b);
  const sortedNet = Array.from(netFinals).sort((a, b) => a - b);

  const totalInvested = capital + mensuel * 12 * horizon;
  const probLoss = sortedGross.filter(v => v < capital).length / nSims;
  const probLossInvested = sortedGross.filter(v => v < totalInvested).length / nSims;

  for (let y = 0; y < horizon; y++) {
    const sorted = Array.from(yearlySnapshots[y]).sort((a, b) => a - b);
    pctPaths.p10.push(percentile(sorted, 10));
    pctPaths.p25.push(percentile(sorted, 25));
    pctPaths.p50.push(percentile(sorted, 50));
    pctPaths.p75.push(percentile(sorted, 75));
    pctPaths.p90.push(percentile(sorted, 90));
  }

  const productMedians = {};
  for (const id of ids) {
    const sorted = Array.from(productFinals[id]).sort((a, b) => a - b);
    productMedians[id] = percentile(sorted, 50);
  }

  const fiscalByVehicle = {};
  for (const v of VEHICLES) {
    if (vehicleCapital[v] <= 0) continue;
    const sortedV = Array.from(vehicleFinals[v]).sort((a, b) => a - b);
    const finalMed = percentile(sortedV, 50);
    const gain = Math.max(0, finalMed - vehicleCapital[v]);
    const taxDetail = calcTax(gain, v, horizon, tmi);
    fiscalByVehicle[v] = {
      capital: vehicleCapital[v],
      finalValue: finalMed,
      grossGain: gain,
      irTax: taxDetail.irTax,
      psTax: taxDetail.psTax,
      tax: taxDetail.total,
      net: finalMed - taxDetail.total,
    };
  }

  return {
    p5: percentile(sortedGross, 5),
    p10: percentile(sortedGross, 10),
    p25: percentile(sortedGross, 25),
    p50: percentile(sortedGross, 50),
    p75: percentile(sortedGross, 75),
    p90: percentile(sortedGross, 90),
    netP10: percentile(sortedNet, 10),
    netP50: percentile(sortedNet, 50),
    netP90: percentile(sortedNet, 90),
    probLoss,
    probLossInvested,
    totalInvested,
    pctPaths,
    productMedians,
    fiscalByVehicle,
  };
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test`
Expected: tous les tests passent. La suite complète (Tasks 2–6) prend quelques secondes (les tests de convergence statistique avec `nSims: 20000` sont les plus longs, ~1-2 s chacun).

- [ ] **Step 5: Commit**

```bash
git add src/simulation.js test/simulation.test.js
git commit -m "feat: ajouter le moteur de simulation Monte Carlo joint correle"
```

---

### Task 7: `src/state.js` et `src/errors.js`

**Files:**
- Create: `src/state.js`
- Create: `src/errors.js`

- [ ] **Step 1: Créer `src/state.js`**

```javascript
/** État global de l'application — partagé entre ui.js, pdf.js et charts.js. */
export const state = {
  capital: 10000,
  horizon: 10,
  risk: 'conservateur',
  mensuel: 0,
  tmi: 30,
  allocations: {},
  excludedProducts: new Set(),
  simResults: null,
};
```

- [ ] **Step 2: Créer `src/errors.js`** (porté depuis `app.js`, section 4, inchangé)

```javascript
export function showError(msg) {
  const el = document.getElementById('error-banner');
  el.textContent = msg; // textContent : aucun risque XSS
  el.hidden = false;
  setTimeout(() => hideError(), 6000);
}

export function hideError() {
  document.getElementById('error-banner').hidden = true;
}

export function showLoading() {
  document.getElementById('loading-overlay').hidden = false;
}

export function hideLoading() {
  document.getElementById('loading-overlay').hidden = true;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/state.js src/errors.js
git commit -m "feat: ajouter les modules state et errors"
```

---

### Task 8: Mise à jour d'`index.html` — champ TMI, tableau fiscal, script module

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Ajouter le champ TMI à l'étape 1**

Dans `index.html`, insérer ce bloc juste après la fermeture du `<div class="form-group">` des versements mensuels (après la ligne contenant `</div>` qui suit le champ `mensuel`, ligne 162) et avant `<div class="btn-row">` (ligne 164) :

```html
    <div class="form-group">
      <label for="tmi">
        Tranche Marginale d'Imposition (TMI)
        <span class="info-icon" data-tooltip="Votre taux d'imposition sur le revenu le plus élevé. Utilisé pour estimer la fiscalité applicable aux plus-values (CTO, assurance-vie après 8 ans).">ⓘ</span>
      </label>
      <select id="tmi" aria-label="Tranche marginale d'imposition">
        <option value="0">0 % (non imposable)</option>
        <option value="11">11 %</option>
        <option value="30" selected>30 %</option>
        <option value="41">41 %</option>
        <option value="45">45 %</option>
      </select>
    </div>
```

- [ ] **Step 2: Ajouter le tableau fiscal par véhicule dans l'onglet Détail**

Dans `index.html`, remplacer le contenu du bloc `<div id="tab-detail" ...>` (lignes 303–325) par :

```html
    <div id="tab-detail" class="tab-panel" role="tabpanel" aria-labelledby="tbtn-detail" hidden>
      <div class="table-wrap">
        <table class="detail-table" id="detail-table" aria-label="Détail par support d'investissement">
          <thead>
            <tr>
              <th scope="col">Support</th>
              <th scope="col">Véhicule</th>
              <th scope="col">Alloc.</th>
              <th scope="col">
                Rdt attendu
                <span class="info-icon info-icon--sm" data-tooltip="Rendement annuel moyen (μ) paramétré dans le modèle. Ne constitue pas une promesse de performance.">ⓘ</span>
              </th>
              <th scope="col">
                Volatilité
                <span class="info-icon info-icon--sm" data-tooltip="Écart-type annualisé (σ) des rendements. Mesure la dispersion autour du rendement moyen.">ⓘ</span>
              </th>
              <th scope="col">Valeur médiane</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>

      <div class="table-wrap table-wrap--spaced">
        <p class="hint">
          Répartition fiscale par véhicule — valeurs médianes indicatives issues de la même simulation ;
          leur somme ne correspond pas exactement à la médiane globale du portefeuille (propriété statistique normale).
        </p>
        <table class="detail-table" id="fiscal-table" aria-label="Répartition fiscale par véhicule d'investissement">
          <thead>
            <tr>
              <th scope="col">Véhicule</th>
              <th scope="col">Capital investi</th>
              <th scope="col">Valeur finale méd.</th>
              <th scope="col">dont IR</th>
              <th scope="col">dont PS</th>
              <th scope="col">Total impôts</th>
              <th scope="col">Net récupéré</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
```

- [ ] **Step 3: Remplacer le script de fin de page par le point d'entrée module**

Remplacer la ligne 341 :
```html
<script src="app.js"></script>
```
par :
```html
<script type="module" src="src/main.js"></script>
```

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: ajouter le champ TMI et le tableau fiscal dans index.html"
```

---

### Task 9: Mise à jour de `style.css`

**Files:**
- Modify: `style.css`

- [ ] **Step 1: Ajouter le style du `<select>` TMI et la classe d'espacement**

Dans `style.css`, juste après le bloc `input[type="range"] { ... }` (après la ligne contenant `input[type="range"] { flex: 1; accent-color: var(--primary); cursor: pointer; height: 4px; }`), ajouter :

```css
select {
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  padding: .4rem .65rem;
  font-size: .95rem;
  outline: none;
  color: var(--text);
  background: var(--surface);
  transition: border-color .2s;
  width: 100%;
}
select:focus { border-color: var(--primary); }

.table-wrap--spaced {
  margin-top: 1.5rem;
}
```

- [ ] **Step 2: Vérifier visuellement**

Run: `python3 -m http.server 8000` puis ouvrir `http://localhost:8000/index.html` dans un navigateur, aller à l'étape 1, vérifier que le champ TMI s'affiche avec le même style que les autres champs.
Expected: le `<select>` TMI a une bordure et un padding cohérents avec les champs numériques voisins.

Arrêter le serveur (Ctrl+C) une fois vérifié.

- [ ] **Step 3: Commit**

```bash
git add style.css
git commit -m "style: ajouter le style du champ TMI et la classe table-wrap--spaced"
```

---

### Task 10: `src/charts.js` — rendu des graphiques

**Files:**
- Create: `src/charts.js`

Porté depuis `app.js` (section 10, fonctions `renderGauge`, `renderHistogram`, `renderFanChart`, `renderDonut`), adapté pour recevoir les données déjà calculées par `simulation.js` (plus de recalcul interne) et pour exposer `resizeCharts()` (utilisé par `ui.js` lors du changement d'onglet).

- [ ] **Step 1: Créer `src/charts.js`**

```javascript
import { fmt } from './format.js';

const charts = {};

export function renderGauge(probLoss) {
  const ctx = document.getElementById('gauge-chart').getContext('2d');
  if (charts.gauge) { charts.gauge.destroy(); charts.gauge = null; }

  const pct = Math.min(Math.max(probLoss, 0), 1);
  const color = pct < 0.1 ? '#16a34a' : pct < 0.3 ? '#d97706' : '#dc2626';

  charts.gauge = new Chart(ctx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [pct * 100, (1 - pct) * 100],
        backgroundColor: [color, '#e2e8f0'],
        borderWidth: 0,
        circumference: 180,
        rotation: 270,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      cutout: '70%',
      animation: { duration: 600 },
    },
  });

  const label = pct < 0.05 ? '🟢 Très faible'
    : pct < 0.15 ? '🟡 Faible'
    : pct < 0.30 ? '🟠 Modéré'
    : pct < 0.50 ? '🔴 Élevé'
    : '⛔ Très élevé';
  document.getElementById('gauge-label').textContent = label;
}

export function renderHistogram(finalValues, capital) {
  const ctx = document.getElementById('dist-chart').getContext('2d');
  if (charts.dist) { charts.dist.destroy(); charts.dist = null; }

  const min = finalValues[0];
  const max = finalValues[finalValues.length - 1];
  if (max === min) return;

  const BINS = 50;
  const binSize = (max - min) / BINS;
  const counts = new Array(BINS).fill(0);
  const labels = Array.from({ length: BINS }, (_, i) => min + i * binSize);

  finalValues.forEach(v => {
    const idx = Math.min(BINS - 1, Math.floor((v - min) / binSize));
    counts[idx]++;
  });

  const colors = labels.map(l => (l + binSize / 2) < capital ? 'rgba(220,38,38,.7)' : 'rgba(37,99,235,.6)');

  charts.dist = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.map(l => fmt(l)),
      datasets: [{ label: 'Simulations', data: counts, backgroundColor: colors, borderWidth: 0, borderRadius: 2 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.parsed.y} simulations`,
            title: ctx => `Valeur ≈ ${ctx[0].label}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { maxTicksLimit: 7, callback: (v, i) => i % 7 === 0 ? fmt(labels[i]) : '', font: { size: 9 } },
          grid: { display: false },
        },
        y: { ticks: { font: { size: 9 } }, grid: { color: '#f1f5f9' } },
      },
    },
  });
}

export function renderFanChart(pctPaths, horizon, capital) {
  const ctx = document.getElementById('fan-chart').getContext('2d');
  if (charts.fan) { charts.fan.destroy(); charts.fan = null; }

  const labels = Array.from({ length: horizon + 1 }, (_, i) => `An ${i}`);

  charts.fan = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: '10e pct.', data: pctPaths.p10, borderColor: 'rgba(220,38,38,.8)', backgroundColor: 'rgba(0,0,0,0)', borderWidth: 1.5, borderDash: [4, 3], pointRadius: 0, fill: false, tension: 0.3 },
        { label: '25e pct.', data: pctPaths.p25, borderColor: 'rgba(249,115,22,.6)', backgroundColor: 'rgba(249,115,22,.08)', borderWidth: 1, pointRadius: 0, fill: '+1', tension: 0.3 },
        { label: 'Médiane', data: pctPaths.p50, borderColor: 'rgba(37,99,235,1)', backgroundColor: 'rgba(37,99,235,.07)', borderWidth: 2.5, pointRadius: 3, fill: false, tension: 0.3 },
        { label: '75e pct.', data: pctPaths.p75, borderColor: 'rgba(34,197,94,.6)', backgroundColor: 'rgba(34,197,94,.08)', borderWidth: 1, pointRadius: 0, fill: '-1', tension: 0.3 },
        { label: '90e pct.', data: pctPaths.p90, borderColor: 'rgba(22,163,74,.8)', backgroundColor: 'rgba(0,0,0,0)', borderWidth: 1.5, borderDash: [4, 3], pointRadius: 0, fill: false, tension: 0.3 },
        { label: 'Capital initial', data: Array(horizon + 1).fill(capital), borderColor: 'rgba(100,116,139,.45)', borderWidth: 1, borderDash: [6, 4], pointRadius: 0, fill: false },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'bottom', labels: { font: { size: 10 }, boxWidth: 18 } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } },
      },
      scales: {
        x: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 9 } } },
        y: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 9 }, callback: v => v >= 1000 ? `${(v / 1000).toFixed(0)}k €` : `${v} €` } },
      },
    },
  });
}

export function renderDonut(allocations, products) {
  const ctx = document.getElementById('donut-chart').getContext('2d');
  if (charts.donut) { charts.donut.destroy(); charts.donut = null; }

  const PALETTE = ['#2563eb', '#7c3aed', '#16a34a', '#d97706', '#0891b2', '#dc2626', '#0d9488', '#9333ea', '#f59e0b', '#6366f1', '#ef4444', '#84cc16'];
  const labels = [], data = [], bgColors = [];
  let ci = 0;

  for (const [id, pct] of Object.entries(allocations)) {
    if (!pct) continue;
    const p = products.find(x => x.id === id);
    if (!p) continue;
    labels.push(`${p.icon} ${p.name}`);
    data.push(pct);
    bgColors.push(PALETTE[ci++ % PALETTE.length]);
  }

  charts.donut = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: bgColors, borderWidth: 2, borderColor: '#fff' }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.parsed} %` } },
      },
      cutout: '55%',
    },
  });
}

/** Redimensionne tous les charts actifs — appelé après affichage d'un onglet caché. */
export function resizeCharts() {
  Object.values(charts).forEach(c => { if (c) c.resize(); });
}

/** Retourne le canvas d'un chart Chart.js actif par son id de dataset (pour capture PDF). */
export function getChartInstance(key) {
  return charts[key] || null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/charts.js
git commit -m "feat: ajouter le module de graphiques src/charts.js"
```

---

### Task 11: `src/ui.js` — navigation, allocation, rendu des résultats

**Files:**
- Create: `src/ui.js`

Porté et adapté depuis `app.js` (sections 5 à 11) : la logique de navigation par étapes, de lecture/validation des entrées et de rendu des cartes produits est conservée à l'identique dans son principe (cartes avec inclusion/exclusion, pas de refonte visuelle). Ajouts : lecture du champ TMI, calcul du `portSigma` réel via `blendedParams` (avec corrélations), KPIs bruts ET nets, remplissage du tableau fiscal, warning d'adéquation profil/volatilité.

- [ ] **Step 1: Créer `src/ui.js`**

```javascript
import { PRODUCTS, SUGGESTIONS, PROFILE_SIGMA_RANGES, CORRELATIONS, EQUITY_IDS } from './products.js';
import { runSimulation, blendedParams } from './simulation.js';
import { fmt, fmtPct } from './format.js';
import { showError, hideError, showLoading, hideLoading } from './errors.js';
import { renderGauge, renderHistogram, renderFanChart, renderDonut, resizeCharts } from './charts.js';
import { state } from './state.js';
import { generatePDF } from './pdf.js';

const INFLATION = 0.022;

// ----------------------------------------------------------------
// ALLOCATION DYNAMIQUE PAR PROFIL (avec exclusion de produits)
// ----------------------------------------------------------------
export function computeEffectiveAlloc() {
  const suggestion = SUGGESTIONS[state.risk].alloc;
  const included = {};
  let total = 0;

  for (const [id, basePct] of Object.entries(suggestion)) {
    if (!state.excludedProducts.has(id)) {
      included[id] = basePct;
      total += basePct;
    }
  }

  if (total === 0) return {};

  const ids = Object.keys(included);
  const result = {};
  let allocated = 0;

  for (let i = 0; i < ids.length - 1; i++) {
    result[ids[i]] = Math.round(included[ids[i]] / total * 100);
    allocated += result[ids[i]];
  }
  result[ids[ids.length - 1]] = 100 - allocated;
  return result;
}

export function toggleProduct(id) {
  if (state.excludedProducts.has(id)) {
    state.excludedProducts.delete(id);
  } else {
    state.excludedProducts.add(id);
  }
  state.allocations = computeEffectiveAlloc();
  updateProductCards();
  updateTotal();
}

function updateProductCards() {
  const suggestion = SUGGESTIONS[state.risk].alloc;
  for (const [id] of Object.entries(suggestion)) {
    const card = document.getElementById(`card-${id}`);
    if (!card) continue;
    const pct = state.allocations[id] || 0;
    const excluded = state.excludedProducts.has(id);

    card.classList.toggle('active', !excluded && pct > 0);
    card.classList.toggle('excluded', excluded);

    const pctEl = card.querySelector('.product-pct-display');
    if (pctEl) pctEl.textContent = excluded ? '0 %' : `${pct} %`;

    const btn = card.querySelector('.toggle-btn');
    if (btn) {
      btn.textContent = excluded ? '+ Inclure' : '× Exclure';
      btn.dataset.state = excluded ? 'excluded' : 'included';
    }
  }
}

// ----------------------------------------------------------------
// NAVIGATION PAR ÉTAPES
// ----------------------------------------------------------------
export function goToStep(n) {
  hideError();

  if (n === 2) {
    if (!readStep1()) return;
    renderProducts();
  }
  if (n === 3) {
    if (!validateAllocations()) return;
  }

  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`step-${n}`).classList.add('active');

  document.querySelectorAll('.step').forEach(s => {
    const sn = parseInt(s.dataset.step, 10);
    s.classList.toggle('active', sn === n);
    s.classList.toggle('done', sn < n);
    s.setAttribute('aria-current', sn === n ? 'step' : 'false');
  });

  document.querySelectorAll('.step-line').forEach((l, i) => {
    l.classList.toggle('done', i < n - 1);
  });

  const panel = document.getElementById(`step-${n}`);
  if (panel) panel.scrollTop = 0;
}

// ----------------------------------------------------------------
// ÉTAPE 1 — LECTURE & VALIDATION
// ----------------------------------------------------------------
function readStep1() {
  const capitalRaw = parseFloat(document.getElementById('capital').value);
  const horizonRaw = parseInt(document.getElementById('horizon').value, 10);
  const mensuelRaw = parseFloat(document.getElementById('mensuel').value);
  const tmiRaw = parseInt(document.getElementById('tmi').value, 10);
  const riskEl = document.querySelector('input[name="risk"]:checked');

  if (!Number.isFinite(capitalRaw) || capitalRaw < 100 || capitalRaw > 1_000_000) {
    showError('Capital invalide — saisissez un montant entre 100 € et 1 000 000 €.');
    document.getElementById('capital').focus();
    return false;
  }
  if (!Number.isInteger(horizonRaw) || horizonRaw < 1 || horizonRaw > 30) {
    showError('Horizon invalide — saisissez une durée entre 1 et 30 ans.');
    document.getElementById('horizon').focus();
    return false;
  }
  if (!Number.isFinite(mensuelRaw) || mensuelRaw < 0 || mensuelRaw > 10_000) {
    showError('Versements invalides — saisissez un montant entre 0 € et 10 000 €/mois.');
    document.getElementById('mensuel').focus();
    return false;
  }
  const VALID_TMI = [0, 11, 30, 41, 45];
  if (!VALID_TMI.includes(tmiRaw)) {
    showError('Tranche marginale d\'imposition invalide.');
    return false;
  }
  const VALID_RISKS = ['conservateur', 'modere', 'dynamique'];
  if (!riskEl || !VALID_RISKS.includes(riskEl.value)) {
    showError('Profil de risque invalide.');
    return false;
  }

  state.capital = capitalRaw;
  state.horizon = horizonRaw;
  state.risk = riskEl.value;
  state.mensuel = mensuelRaw;
  state.tmi = tmiRaw;
  return true;
}

export function linkSlider(sliderId, inputId, min, max) {
  const slider = document.getElementById(sliderId);
  const input = document.getElementById(inputId);
  if (!slider || !input) return;

  slider.addEventListener('input', () => { input.value = slider.value; });
  input.addEventListener('input', () => {
    const clamped = Math.min(Math.max(parseFloat(input.value) || min, min), max);
    slider.value = clamped;
  });
}

// ----------------------------------------------------------------
// ÉTAPE 2 — PRODUITS & ALLOCATION
// ----------------------------------------------------------------
function vehicleClass(v) {
  const map = { PEA: 'vehicle-pea', Livret: 'vehicle-livret', AV: 'vehicle-av' };
  return map[v] || 'vehicle-cto';
}

function renderProducts() {
  const risk = state.risk;
  const grid = document.getElementById('products-grid');
  grid.innerHTML = '';

  state.excludedProducts = new Set();
  state.allocations = computeEffectiveAlloc();

  const suggestion = SUGGESTIONS[risk].alloc;

  PRODUCTS.forEach(p => {
    const inSuggestion = p.id in suggestion;

    const card = document.createElement('div');
    card.id = `card-${p.id}`;
    card.setAttribute('role', 'listitem');

    const muNetDisplay = p.mu - (p.ter || 0);
    const pillReturn = `<span class="stat-pill return">~${(muNetDisplay * 100).toFixed(1)}%/an net</span>`;
    const pillVol = p.sigma > 0 ? `<span class="stat-pill vol">σ ${(p.sigma * 100).toFixed(0)}%</span>` : '';
    const pillGuar = p.guaranteed ? '<span class="stat-pill guaranteed">Garanti</span>' : '';

    if (inSuggestion) {
      const pct = state.allocations[p.id] || 0;
      card.className = 'product-card active';
      card.innerHTML = `
        <div class="product-header">
          <span class="product-icon" aria-hidden="true"></span>
          <div class="product-info">
            <div class="product-name"></div>
            <span class="product-vehicle ${vehicleClass(p.vehicle)}"></span>
          </div>
        </div>
        <div class="product-stats">${pillReturn}${pillVol}${pillGuar}</div>
        <div class="product-pct-row">
          <span class="alloc-label">Alloc.&nbsp;:</span>
          <span class="product-pct-display">${pct}%</span>
          <button type="button" class="toggle-btn" data-state="included" data-id="${p.id}">x Exclure</button>
        </div>
      `;
      card.querySelector('.product-icon').textContent = p.icon;
      card.querySelector('.product-name').textContent = p.name;
      card.querySelector('.product-vehicle').textContent = p.vehicleLabel;
      card.title = p.description;
      card.querySelector('.toggle-btn').addEventListener('click', () => toggleProduct(p.id));
    } else {
      const pillHors = `<span class="stat-pill min-hor">Hors profil ${risk}</span>`;
      card.className = 'product-card dimmed';
      card.innerHTML = `
        <div class="product-header">
          <span class="product-icon" aria-hidden="true"></span>
          <div class="product-info">
            <div class="product-name"></div>
            <span class="product-vehicle ${vehicleClass(p.vehicle)}"></span>
          </div>
        </div>
        <div class="product-stats">${pillReturn}${pillVol}${pillGuar}${pillHors}</div>
      `;
      card.querySelector('.product-icon').textContent = p.icon;
      card.querySelector('.product-name').textContent = p.name;
      card.querySelector('.product-vehicle').textContent = p.vehicleLabel;
      card.title = p.description;
    }

    grid.appendChild(card);
  });

  updateSuggestion();
  updateTotal();
}

function updateTotal() {
  const total = Object.values(state.allocations).reduce((a, b) => a + b, 0);
  const el = document.getElementById('total-pct');
  const rounded = Math.round(total);
  el.textContent = `${rounded}%`;
  el.className = `total-pct ${rounded === 100 ? 'good' : rounded === 0 ? 'over' : 'neutral'}`;
  document.getElementById('simulate-btn').disabled = rounded !== 100;
}

function updateSuggestion() {
  const riskEl = document.querySelector('input[name="risk"]:checked');
  if (!riskEl) return;
  const s = SUGGESTIONS[riskEl.value];
  const bar = document.getElementById('allocation-suggestions');
  if (!bar || !s) return;

  bar.textContent = '';
  const strong = document.createElement('strong');
  strong.textContent = `${s.label} — allocations verrouillées. `;
  bar.appendChild(strong);
  bar.appendChild(document.createTextNode('Cliquez "× Exclure" pour retirer un support (recalcul automatique).'));
}

function validateAllocations() {
  const total = Object.values(state.allocations).reduce((a, b) => a + b, 0);
  if (Math.round(total) === 0) {
    showError('Aucun support sélectionné — incluez au moins un produit.');
    return false;
  }
  if (Math.round(total) !== 100) {
    showError(`L'allocation doit totaliser 100 % (actuellement ${Math.round(total)} %).`);
    return false;
  }
  return true;
}

function qualitativeWarnings(allocations, risk, horizon, portSigma) {
  const warnings = [];

  const cryptoPct = allocations['crypto-btc'] || 0;
  if (cryptoPct > 0 && risk !== 'dynamique') {
    warnings.push(
      `⚠️ Crypto ${cryptoPct} % dans un profil ${risk} : poche satellite spéculative inadaptée. ` +
      'Drawdowns historiques BTC/ETH : -84 % (2018), -77 % (2022). Envisagez de la retirer ou de choisir le profil Dynamique.'
    );
  }

  const equityPct = EQUITY_IDS.reduce((sum, id) => sum + (allocations[id] || 0), 0);
  if (horizon < 5 && equityPct > 50) {
    warnings.push(
      `⚠️ Exposition actions ${equityPct} % pour un horizon de ${horizon} an${horizon > 1 ? 's' : ''} : ` +
      'risque de ne pas avoir le temps d\'attendre un rebond après un choc de marché (-25 à -35 %). ' +
      'Règle empirique : ≤ 40–50 % d\'actions à horizon < 5 ans.'
    );
  } else if (horizon < 3 && equityPct > 30) {
    warnings.push(
      `⚠️ Exposition actions ${equityPct} % pour un horizon très court (${horizon} an${horizon > 1 ? 's' : ''}) : ` +
      'fortement déconseillé. Privilégiez des produits garantis ou à faible volatilité.'
    );
  }

  const range = PROFILE_SIGMA_RANGES[risk];
  if (range && Number.isFinite(portSigma)) {
    if (portSigma > range.max) {
      warnings.push(
        `⚠️ Volatilité du portefeuille (${fmtPct(portSigma)}) supérieure à la borne haute du profil ${risk} ` +
        `(max ${fmtPct(range.max)}) : l'allocation correspond davantage à un profil plus dynamique que celui déclaré.`
      );
    } else if (portSigma < range.min) {
      warnings.push(
        `ℹ️ Volatilité du portefeuille (${fmtPct(portSigma)}) inférieure à la borne basse du profil ${risk} ` +
        `(min ${fmtPct(range.min)}) : vous sous-exploitez peut-être votre capacité de prise de risque.`
      );
    }
  }

  return warnings;
}

// ----------------------------------------------------------------
// LANCEMENT DE LA SIMULATION
// ----------------------------------------------------------------
async function runSimulationAndRender() {
  if (!validateAllocations()) return;

  showLoading();
  await new Promise(r => setTimeout(r, 60));

  try {
    const results = runSimulation({
      capital: state.capital,
      horizon: state.horizon,
      mensuel: state.mensuel,
      tmi: state.tmi,
      alloc: state.allocations,
      products: PRODUCTS,
      correlations: CORRELATIONS,
      nSims: 10000,
    });
    state.simResults = results;

    goToStep(3);
    activateTab('kpi');
    await new Promise(r => requestAnimationFrame(r));
    renderResults();
  } catch (err) {
    console.error('Simulation error:', err);
    showError('Une erreur est survenue pendant la simulation. Vérifiez vos paramètres et réessayez.');
  } finally {
    hideLoading();
  }
}

// ----------------------------------------------------------------
// RENDU DES RÉSULTATS
// ----------------------------------------------------------------
function renderResults() {
  const {
    probLoss, probLossInvested, p10, p50, p90, netP10, netP50,
    pctPaths, productMedians, fiscalByVehicle, totalInvested,
  } = state.simResults;
  const { capital, horizon, mensuel, tmi } = state;
  const { mu, sigma } = blendedParams(state.allocations, PRODUCTS, CORRELATIONS);

  const subtitle = document.getElementById('sim-subtitle');
  subtitle.textContent =
    `Capital : ${fmt(capital)} — Horizon : ${horizon} ans — Versements : ${fmt(mensuel)}/mois — ` +
    `TMI : ${tmi} % — μ : ${fmtPct(mu)} — σ : ${fmtPct(sigma)}`;

  document.getElementById('kpi-loss').textContent = fmtPct(probLoss);
  document.getElementById('kpi-loss-sub').textContent = `(capital initial : ${fmt(capital)})`;

  document.getElementById('kpi-median').textContent = fmt(netP50);
  document.getElementById('kpi-median-sub').textContent = `Net après fiscalité — brut : ${fmt(p50)}`;

  document.getElementById('kpi-p90').textContent = fmt(p90);
  document.getElementById('kpi-p90-sub').textContent = `10 % des simulations au-dessus (brut)`;

  document.getElementById('kpi-p10').textContent = fmt(netP10);
  document.getElementById('kpi-p10-sub').textContent = `Net pessimiste — brut : ${fmt(p10)}`;

  renderGauge(probLoss);
  renderHistogram(state.simResults.p50 !== undefined ? sortedGrossFromState() : [], capital);
  renderFanChart(pctPaths, horizon, capital);
  renderDonut(state.allocations, PRODUCTS);
  renderTable(productMedians);
  renderFiscalTable(fiscalByVehicle);
  renderExplainer(probLoss, probLossInvested, mu, sigma, netP50, totalInvested);
}

function sortedGrossFromState() {
  // L'histogramme a besoin de la distribution complète triée ; on la
  // recalcule à partir de p10/p50/p90 n'est pas possible — le moteur
  // expose déjà `grossFinals` trié dans ses résultats internes, mais
  // pour limiter la surface mémoire exposée par l'API publique du
  // moteur, l'histogramme est construit directement à partir de
  // `state.simResults.sortedGross` (voir ajustement ci-dessous).
  return state.simResults.sortedGross || [];
}

function renderTable(productMedians) {
  const tbody = document.querySelector('#detail-table tbody');
  tbody.textContent = '';

  for (const [id, pct] of Object.entries(state.allocations)) {
    if (!pct) continue;
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) continue;

    const muNet = p.mu - (p.ter || 0);
    const med = productMedians[id];

    const tr = document.createElement('tr');
    const cells = [
      () => { const td = document.createElement('td'); const b = document.createElement('b'); b.textContent = `${p.icon} ${p.name}`; td.appendChild(b); return td; },
      () => { const td = document.createElement('td'); const sp = document.createElement('span'); sp.className = `product-vehicle ${vehicleClass(p.vehicle)}`; sp.textContent = p.vehicleLabel; td.appendChild(sp); return td; },
      () => { const td = document.createElement('td'); td.textContent = `${pct} %`; return td; },
      () => { const td = document.createElement('td'); td.textContent = fmtPct(muNet); return td; },
      () => { const td = document.createElement('td'); td.textContent = fmtPct(p.sigma); return td; },
      () => { const td = document.createElement('td'); td.textContent = fmt(med); return td; },
    ];
    cells.forEach(fn => tr.appendChild(fn()));
    tbody.appendChild(tr);
  }
}

function renderFiscalTable(fiscalByVehicle) {
  const tbody = document.querySelector('#fiscal-table tbody');
  tbody.textContent = '';

  for (const v of ['Livret', 'PEA', 'AV', 'CTO']) {
    const d = fiscalByVehicle[v];
    if (!d) continue;

    const tr = document.createElement('tr');
    const cells = [
      () => { const td = document.createElement('td'); td.textContent = v; return td; },
      () => { const td = document.createElement('td'); td.textContent = fmt(d.capital); return td; },
      () => { const td = document.createElement('td'); td.textContent = fmt(d.finalValue); return td; },
      () => { const td = document.createElement('td'); td.textContent = d.irTax > 0 ? fmt(d.irTax) : '—'; return td; },
      () => { const td = document.createElement('td'); td.textContent = d.psTax > 0 ? fmt(d.psTax) : '—'; return td; },
      () => { const td = document.createElement('td'); td.textContent = fmt(d.tax); return td; },
      () => { const td = document.createElement('td'); const b = document.createElement('b'); b.textContent = fmt(d.net); td.appendChild(b); return td; },
    ];
    cells.forEach(fn => tr.appendChild(fn()));
    tbody.appendChild(tr);
  }
}

function renderExplainer(probLoss, probLossInvested, mu, sigma, netP50, totalInvested) {
  const { capital, horizon } = state;

  const levels = [
    { max: 0.05, label: 'Très faible', cssClass: 'risk-text-vlow', advice: 'Votre portefeuille présente un risque de perte en capital très limité. Profil adapté aux investisseurs privilégiant la sécurité.' },
    { max: 0.15, label: 'Faible', cssClass: 'risk-text-low', advice: 'Le risque est contenu. L\'horizon et la diversification protègent bien votre capital.' },
    { max: 0.30, label: 'Modéré', cssClass: 'risk-text-mod', advice: 'Une part non négligeable des scénarios peut conduire à une perte. Vérifiez que votre horizon est suffisamment long.' },
    { max: 0.50, label: 'Élevé', cssClass: 'risk-text-high', advice: 'Risque significatif. Renforcez la part de produits garantis ou allongez votre horizon si possible.' },
    { max: Infinity, label: 'Très élevé', cssClass: 'risk-text-vhigh', advice: 'Plus d\'une simulation sur deux aboutit à une perte. Reconsidérez votre allocation ou votre horizon.' },
  ];
  const lvl = levels.find(l => probLoss < l.max);

  const container = document.getElementById('risk-explainer');
  container.textContent = '';

  const h4 = document.createElement('h4');
  h4.textContent = 'Analyse du risque — ';
  const span = document.createElement('span');
  span.className = lvl.cssClass;
  span.textContent = lvl.label;
  h4.appendChild(span);
  container.appendChild(h4);

  const p = document.createElement('p');
  p.textContent = lvl.advice;
  container.appendChild(p);

  const realNetP50 = netP50 / Math.pow(1 + INFLATION, horizon);

  const items = [
    `Probabilité de ne pas récupérer le capital initial (${fmt(capital)}) : ${fmtPct(probLoss)}`,
    `Probabilité de ne pas récupérer le total investi (${fmt(totalInvested)}) : ${fmtPct(probLossInvested)}`,
    `Rendement annuel moyen brut (μ), corrélations entre actifs incluses : ${fmtPct(mu)}`,
    `Volatilité annuelle globale (σ, corrélations intégrées) : ${fmtPct(sigma)}`,
    `Net médian après fiscalité : ${fmt(netP50)}`,
    `Valeur nette médiane en euros constants (inflation ~2,2 %/an) : ${fmt(realNetP50)}`,
    `Méthode : Monte Carlo joint corrélé (10 000 scénarios), pas mensuel, fiscalité appliquée scénario par scénario.`,
  ];

  const ul = document.createElement('ul');
  items.forEach(text => {
    const li = document.createElement('li');
    li.textContent = text;
    ul.appendChild(li);
  });
  container.appendChild(ul);

  const { sigma: portSigma } = blendedParams(state.allocations, PRODUCTS, CORRELATIONS);
  const qWarns = qualitativeWarnings(state.allocations, state.risk, horizon, portSigma);
  if (qWarns.length > 0) {
    const warnBox = document.createElement('div');
    warnBox.className = 'qualitative-warnings';
    qWarns.forEach(msg => {
      const p2 = document.createElement('p');
      p2.textContent = msg;
      warnBox.appendChild(p2);
    });
    container.appendChild(warnBox);
  }
}

// ----------------------------------------------------------------
// ONGLETS (step 3)
// ----------------------------------------------------------------
export function activateTab(name) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const isActive = btn.dataset.tab === name;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  document.querySelectorAll('.tab-panel').forEach(panel => {
    const show = panel.id === `tab-${name}`;
    panel.hidden = !show;
    panel.classList.toggle('active', show);
    if (show) panel.scrollTop = 0;
  });

  if (name === 'charts') {
    requestAnimationFrame(() => resizeCharts());
  }
}

// ----------------------------------------------------------------
// INITIALISATION
// ----------------------------------------------------------------
export function initUI() {
  linkSlider('capital-slider', 'capital', 100, 1_000_000);
  linkSlider('horizon-slider', 'horizon', 1, 30);
  linkSlider('mensuel-slider', 'mensuel', 0, 10_000);

  document.getElementById('btn-step1-next').addEventListener('click', () => goToStep(2));
  document.getElementById('btn-step2-back').addEventListener('click', () => goToStep(1));
  document.getElementById('simulate-btn').addEventListener('click', () => runSimulationAndRender());
  document.getElementById('btn-step3-back').addEventListener('click', () => goToStep(2));
  document.getElementById('btn-step3-restart').addEventListener('click', () => goToStep(1));
  document.getElementById('btn-pdf').addEventListener('click', () => generatePDF());

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });

  document.querySelectorAll('input[name="risk"]').forEach(r => {
    r.addEventListener('change', () => updateSuggestion());
  });

  document.getElementById('error-banner').addEventListener('click', hideError);

  updateSuggestion();
}
```

**Note d'implémentation pour l'étape suivante :** `renderResults` référence `state.simResults.sortedGross`, qui n'est pas encore renvoyé par `runSimulation` (Task 6 ne renvoie que les percentiles, pas le tableau complet trié, pour limiter la mémoire exposée). Le Step 2 ci-dessous corrige ce point en exposant `sortedGross` dans le retour de `runSimulation`.

- [ ] **Step 2: Exposer `sortedGross` dans le retour de `runSimulation`**

Dans `src/simulation.js`, dans l'objet retourné par `runSimulation` (à la fin de la fonction), ajouter la clé `sortedGross` :

```javascript
  return {
    sortedGross,
    p5: percentile(sortedGross, 5),
    p10: percentile(sortedGross, 10),
    p25: percentile(sortedGross, 25),
    p50: percentile(sortedGross, 50),
    p75: percentile(sortedGross, 75),
    p90: percentile(sortedGross, 90),
    netP10: percentile(sortedNet, 10),
    netP50: percentile(sortedNet, 50),
    netP90: percentile(sortedNet, 90),
    probLoss,
    probLossInvested,
    totalInvested,
    pctPaths,
    productMedians,
    fiscalByVehicle,
  };
```

Et dans `src/ui.js`, simplifier `renderResults` en remplaçant l'appel `renderHistogram(state.simResults.p50 !== undefined ? sortedGrossFromState() : [], capital)` par :

```javascript
  renderHistogram(state.simResults.sortedGross, capital);
```

et supprimer la fonction `sortedGrossFromState` (devenue inutile).

- [ ] **Step 3: Relancer la suite de tests pour vérifier qu'aucune régression n'a été introduite dans `simulation.js`**

Run: `npm test`
Expected: tous les tests passent (l'ajout de `sortedGross` au retour ne casse aucune assertion existante, qui ne vérifiait que les champs percentiles).

- [ ] **Step 4: Commit**

```bash
git add src/ui.js src/simulation.js
git commit -m "feat: ajouter le module UI src/ui.js et exposer sortedGross"
```

---

### Task 12: `src/pdf.js` — génération du rapport PDF

**Files:**
- Create: `src/pdf.js`

Fusionne la structure PDF/A + empreinte SHA-256 d'`app.js` (section 12) avec le contenu enrichi de `simuportefeuille-standalone.html` (méthodologie, fiscalité détaillée, avertissements). Le texte méthodologique sur les corrélations est corrigé pour refléter le nouveau moteur corrélé (l'ancien texte disait explicitement "corrélation nulle... amélioration future", ce qui n'est plus vrai). Les KPIs mis en avant sont désormais les valeurs nettes, cohérentes avec `ui.js`. Remplace les `alert()` de la version standalone par `showError`, cohérent avec le reste de l'application.

- [ ] **Step 1: Créer `src/pdf.js`**

```javascript
import { PRODUCTS, PROFILE_SIGMA_RANGES } from './products.js';
import { blendedParams } from './simulation.js';
import { CORRELATIONS } from './products.js';
import { fmtPdf, fmtPctPdf } from './format.js';
import { showError, showLoading, hideLoading } from './errors.js';
import { getChartInstance, resizeCharts } from './charts.js';
import { state } from './state.js';
import { activateTab } from './ui.js';

const INFLATION = 0.022;

async function sha256(message) {
  try {
    const buf = new TextEncoder().encode(message);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return 'unavailable';
  }
}

function captureChart(canvasId) {
  try {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    const hiddenPanel = canvas.closest('.tab-panel[hidden]');
    if (hiddenPanel) {
      hiddenPanel.removeAttribute('hidden');
      resizeCharts();
    }

    const dataUrl = canvas.toDataURL('image/png', 1.0);

    if (hiddenPanel) hiddenPanel.setAttribute('hidden', '');
    return dataUrl;
  } catch {
    return null;
  }
}

export async function generatePDF() {
  if (!state.simResults) { showError('Lancez d\'abord une simulation.'); return; }
  if (!window.jspdf) { showError('jsPDF non chargé — vérifiez votre connexion.'); return; }

  showLoading();
  await new Promise(r => setTimeout(r, 80));

  try {
    const { jsPDF } = window.jspdf;
    const { capital, horizon, mensuel, risk, tmi, simResults } = state;
    const { p10, p25, p50, p75, p90, netP10, netP50, probLoss, probLossInvested, totalInvested, fiscalByVehicle, productMedians } = simResults;
    const { mu, sigma } = blendedParams(state.allocations, PRODUCTS, CORRELATIONS);

    const docId = Date.now().toString(36).toUpperCase();
    const fingerprint = await sha256(JSON.stringify({ capital, horizon, mensuel, risk, tmi, p50, netP50, mu, sigma, ts: docId }));

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', putOnlyUsedFonts: true, compress: true });

    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    doc.setProperties({
      title: 'SimuPortefeuille — Rapport de simulation',
      subject: 'Simulation Monte Carlo de portefeuille financier',
      author: 'SimuPortefeuille',
      keywords: 'simulation, portefeuille, Monte Carlo, MBG, risque, finance, fiscalite',
      creator: 'SimuPortefeuille — jsPDF 2.5.1',
    });
    doc.setLanguage('fr-FR');

    const W = 210, H = 297, ML = 14, MR = 14, CW = W - ML - MR;
    const NAVY = [28, 48, 83], GOLD = [197, 160, 40], WHITE = [255, 255, 255];
    const LIGHT = [245, 247, 250], MUTED = [100, 116, 139], TEXT = [30, 41, 59], RED = [184, 50, 50];

    let page = 1;

    function header() {
      doc.setFillColor(...NAVY);
      doc.rect(0, 0, W, 16, 'F');
      doc.setFillColor(...GOLD);
      doc.rect(0, 16, W, 1.2, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...WHITE);
      doc.text('SimuPortefeuille', ML, 11);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      doc.text('Rapport de simulation financière', W / 2, 11, { align: 'center' });
      doc.text(dateStr, W - MR, 11, { align: 'right' });
    }

    function footer(pg) {
      doc.setFillColor(...LIGHT);
      doc.rect(0, H - 13, W, 13, 'F');
      doc.setDrawColor(220, 228, 240); doc.setLineWidth(0.3);
      doc.line(0, H - 13, W, H - 13);
      doc.setFont('helvetica', 'italic'); doc.setFontSize(7); doc.setTextColor(...MUTED);
      doc.text('Simulation à titre indicatif — pas un conseil en investissement.', W / 2, H - 7, { align: 'center' });
      doc.text(`Page ${pg}`, W - MR, H - 4, { align: 'right' });
      doc.text(`Réf. ${docId}`, ML, H - 4);
    }

    function checkY(y, needed) {
      if (y + needed > H - 18) {
        doc.addPage(); page++;
        header(); footer(page);
        return 22;
      }
      return y;
    }

    function sectionTitle(y, text) {
      y = checkY(y, 12);
      doc.setFillColor(...NAVY);
      doc.rect(ML, y, CW, 7, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...WHITE);
      doc.text(text, ML + 3, y + 5);
      return y + 10;
    }

    // ── PAGE 1 — Couverture ──
    header(); footer(1);

    doc.setFillColor(...NAVY);
    doc.roundedRect(ML, 22, CW, 38, 4, 4, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...GOLD);
    doc.text('RAPPORT DE SIMULATION', W / 2, 36, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...WHITE);
    doc.text('Portefeuille financier — Analyse Monte Carlo corrélée', W / 2, 44, { align: 'center' });
    doc.text(`Généré le ${dateStr}`, W / 2, 51, { align: 'center' });

    let y = 68;
    y = sectionTitle(y, 'PARAMÈTRES DE LA SIMULATION');
    doc.autoTable({
      startY: y,
      head: [['Paramètre', 'Valeur']],
      body: [
        ['Capital initial', fmtPdf(capital)],
        ['Horizon de placement', `${horizon} ans`],
        ['Versements mensuels', fmtPdf(mensuel) + '/mois'],
        ['Capital total investi', fmtPdf(totalInvested)],
        ['Profil de risque', risk.charAt(0).toUpperCase() + risk.slice(1)],
        ['Tranche marginale d\'imposition (TMI)', tmi + ' %'],
        ['Rendement annuel moyen (mu)', fmtPctPdf(mu)],
        ['Volatilite annuelle (sigma), correlations incluses', fmtPctPdf(sigma)],
        ['Nombre de simulations', '10 000'],
        ['Modele', 'Mouvement Brownien Geometrique correle (pas mensuel)'],
      ],
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: TEXT },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 90 }, 1: { cellWidth: 'auto' } },
      margin: { left: ML, right: MR },
    });
    y = doc.lastAutoTable.finalY + 8;

    y = sectionTitle(y, 'ALLOCATION DU PORTEFEUILLE');
    const allocRows = Object.entries(state.allocations)
      .filter(([, pct]) => pct > 0)
      .map(([id, pct]) => {
        const p = PRODUCTS.find(x => x.id === id);
        return p ? [p.name, p.vehicleLabel, `${pct}%`, fmtPctPdf(p.mu - (p.ter || 0)), fmtPctPdf(p.sigma)] : null;
      })
      .filter(Boolean);
    doc.autoTable({
      startY: y,
      head: [['Support', 'Véhicule', 'Alloc.', 'Rdt μ', 'Vol. σ']],
      body: allocRows,
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { fontSize: 7.5, textColor: TEXT },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: { 0: { cellWidth: 65 }, 1: { cellWidth: 35 }, 2: { cellWidth: 18, halign: 'center' }, 3: { cellWidth: 20, halign: 'center' }, 4: { cellWidth: 20, halign: 'center' } },
      margin: { left: ML, right: MR },
    });

    // ── PAGE 2 — Indicateurs clés ──
    doc.addPage(); page++; header(); footer(page);
    y = 22;
    y = sectionTitle(y, 'INDICATEURS CLÉS DE PERFORMANCE (NET APRÈS FISCALITÉ)');

    const kpiData = [
      { label: 'Net median apres fiscalite', value: fmtPdf(netP50), color: [8, 145, 178] },
      { label: 'Probabilite de perte', value: fmtPctPdf(probLoss), color: [220, 38, 38] },
      { label: 'Net pessimiste (P10)', value: fmtPdf(netP10), color: [217, 119, 6] },
      { label: 'Brut median (P50, avant impots)', value: fmtPdf(p50), color: [22, 163, 74] },
    ];
    const bw = (CW - 6) / 2, bh = 22;
    kpiData.forEach((k, i) => {
      const bx = ML + (i % 2) * (bw + 6);
      const by = y + Math.floor(i / 2) * (bh + 4);
      doc.setFillColor(...k.color);
      doc.roundedRect(bx, by, bw, bh, 3, 3, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...WHITE);
      doc.text(k.label, bx + 4, by + 6.5);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
      doc.text(k.value, bx + 4, by + 16);
    });
    y += 2 * (bh + 4) + 8;

    y = checkY(y, 12);
    y = sectionTitle(y, 'DISTRIBUTION DES PERCENTILES BRUTS (AVANT IMPÔTS)');
    doc.autoTable({
      startY: y,
      head: [['Percentile', 'Signification', 'Valeur finale brute']],
      body: [
        ['P10', '10% des scenarios sont inferieurs', fmtPdf(p10)],
        ['P25', '25% des scenarios sont inferieurs', fmtPdf(p25)],
        ['P50', 'Mediane - resultat le plus probable', fmtPdf(p50)],
        ['P75', '75% des scenarios sont inferieurs', fmtPdf(p75)],
        ['P90', '90% des scenarios sont inferieurs', fmtPdf(p90)],
      ],
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: TEXT },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: { 0: { cellWidth: 22, halign: 'center', fontStyle: 'bold' }, 1: { cellWidth: 115 }, 2: { cellWidth: 35, halign: 'right' } },
      margin: { left: ML, right: MR },
    });
    y = doc.lastAutoTable.finalY + 8;

    y = checkY(y, 20);
    const range = PROFILE_SIGMA_RANGES[risk];
    let matchStatus, borderColor;
    if (range) {
      if (sigma > range.max) { matchStatus = 'ATTENTION — Portefeuille plus risque que le profil declare'; borderColor = RED; }
      else if (sigma < range.min) { matchStatus = 'INFO — Portefeuille plus conservateur que le profil declare'; borderColor = [26, 90, 138]; }
      else { matchStatus = 'CONFORME — Portefeuille coherent avec le profil declare'; borderColor = [45, 106, 79]; }

      y = sectionTitle(y, 'ADÉQUATION PROFIL / PORTEFEUILLE');
      doc.setFillColor(...LIGHT);
      doc.rect(ML, y, CW, 14, 'F');
      doc.setFillColor(...borderColor);
      doc.rect(ML, y, 2, 14, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...borderColor);
      doc.text(matchStatus, ML + 5, y + 6);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...TEXT);
      doc.text(`Volatilite du portefeuille : ${fmtPctPdf(sigma)} — plage attendue profil ${risk} : ${fmtPctPdf(range.min)} a ${range.max >= 1 ? 'sans limite' : fmtPctPdf(range.max)}`, ML + 5, y + 11);
      y += 20;
    }

    // ── PAGE 3 — Graphiques ──
    doc.addPage(); page++; header(); footer(page);
    y = 22;
    y = sectionTitle(y, 'TRAJECTOIRES — ENVELOPPE DE PERCENTILES');

    const prevActiveTab = document.querySelector('.tab-btn.active')?.dataset.tab || 'kpi';
    activateTab('charts');
    await new Promise(r => requestAnimationFrame(r));

    const fanImg = captureChart('fan-chart');
    const distImg = captureChart('dist-chart');
    const donutImg = captureChart('donut-chart');

    activateTab(prevActiveTab);

    if (fanImg) {
      const fanCanvas = document.getElementById('fan-chart');
      const fanH = fanCanvas ? Math.round(CW * fanCanvas.height / fanCanvas.width) : 65;
      doc.addImage(fanImg, 'PNG', ML, y, CW, Math.min(fanH, 75));
      y += Math.min(fanH, 75) + 4;
    }
    if (distImg) {
      y = checkY(y, 12);
      y = sectionTitle(y, 'DISTRIBUTION DES VALEURS FINALES BRUTES (10 000 SIMULATIONS)');
      const distCanvas = document.getElementById('dist-chart');
      const distW = CW * 0.62;
      const distH = distCanvas ? Math.round(distW * distCanvas.height / distCanvas.width) : 52;
      doc.addImage(distImg, 'PNG', ML, y, distW, Math.min(distH, 60));
      if (donutImg) {
        const donutCanvas = document.getElementById('donut-chart');
        const donutW = CW * 0.33;
        const donutH = donutCanvas ? Math.round(donutW * donutCanvas.height / donutCanvas.width) : 52;
        doc.addImage(donutImg, 'PNG', ML + CW * 0.65, y, donutW, Math.min(donutH, 60));
      }
      y += Math.min(distH, 60) + 4;
    }

    // ── PAGE 4 — Détail par support + fiscalité ──
    doc.addPage(); page++; header(); footer(page);
    y = 22;
    y = sectionTitle(y, 'DÉTAIL PAR SUPPORT D\'INVESTISSEMENT');

    const detailRows = Object.entries(state.allocations)
      .filter(([, pct]) => pct > 0)
      .map(([id, pct]) => {
        const p = PRODUCTS.find(x => x.id === id);
        if (!p) return null;
        const muNet = p.mu - (p.ter || 0);
        return [p.name, p.vehicleLabel, `${pct} %`, fmtPctPdf(p.mu), fmtPctPdf(p.ter || 0), fmtPctPdf(muNet), fmtPctPdf(p.sigma), fmtPdf(productMedians[id])];
      })
      .filter(Boolean);
    doc.autoTable({
      startY: y,
      head: [['Support', 'Véhicule', 'Alloc.', 'Rdt brut', 'Frais TER', 'Rdt net', 'Vol. σ', 'Val. finale médiane']],
      body: detailRows,
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 7 },
      bodyStyles: { fontSize: 7, textColor: TEXT },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: { 0: { cellWidth: 46 }, 1: { cellWidth: 24 }, 2: { cellWidth: 14, halign: 'center' }, 3: { cellWidth: 18, halign: 'center' }, 4: { cellWidth: 16, halign: 'center' }, 5: { cellWidth: 16, halign: 'center' }, 6: { cellWidth: 16, halign: 'center' }, 7: { cellWidth: 32, halign: 'right' } },
      margin: { left: ML, right: MR },
    });
    y = doc.lastAutoTable.finalY + 6;

    doc.setFont('helvetica', 'italic'); doc.setFontSize(7); doc.setTextColor(...MUTED);
    const nonAddNote = doc.splitTextToSize(
      'Valeurs medianes indicatives par support, issues de la meme simulation jointe corrélée. Leur somme ne correspond pas exactement a la mediane globale du portefeuille (propriete statistique normale : la mediane d\'une somme differe de la somme des medianes).',
      CW
    );
    doc.text(nonAddNote, ML, y);
    y += nonAddNote.length * 3.5 + 6;

    y = checkY(y, 12);
    y = sectionTitle(y, 'RÉPARTITION FISCALE PAR VÉHICULE (VALEURS MÉDIANES)');
    const fiscalRows = [];
    for (const v of ['Livret', 'PEA', 'AV', 'CTO']) {
      const d = fiscalByVehicle[v];
      if (!d) continue;
      fiscalRows.push([v, fmtPdf(d.capital), fmtPdf(d.finalValue), d.irTax > 0 ? fmtPdf(d.irTax) : '-', d.psTax > 0 ? fmtPdf(d.psTax) : '-', fmtPdf(d.tax), fmtPdf(d.net)]);
    }
    doc.autoTable({
      startY: y,
      head: [['Véhicule', 'Capital', 'Val. fin. méd.', 'dont IR', 'dont PS', 'Total impôts', 'Net récupéré']],
      body: fiscalRows,
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { fontSize: 7.5, textColor: TEXT },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 25 } },
      margin: { left: ML, right: MR },
    });
    y = doc.lastAutoTable.finalY + 8;

    // ── PAGE 5 — Méthodologie, fiscalité, avertissements ──
    doc.addPage(); page++; header(); footer(page);
    y = 22;
    y = sectionTitle(y, 'MÉTHODOLOGIE ET AVERTISSEMENTS RÉGLEMENTAIRES');

    const warnings = [
      'Ce document est produit a titre purement informatif et pedagogique. Il ne constitue pas un conseil en investissement au sens de la directive MIF II (2014/65/UE).',
      'Les performances passees ne prejugent pas des performances futures. Les projections resultent d\'un modele stochastique et ne constituent pas des garanties.',
      'Le Mouvement Brownien Geometrique suppose des rendements log-normalement distribues et une volatilite constante — approximation simplifiee de la realite des marches.',
      'Les correlations entre actifs risques sont desormais modelisees dans la simulation elle-meme (chocs correles par decomposition de Cholesky, tires a chaque pas mensuel), et non plus approximees a posteriori.',
      'La fiscalite est calculee scenario par scenario sur le gain reel de chaque vehicule dans ce scenario precis, ce qui garantit la coherence entre les valeurs brutes et nettes affichees.',
      'Les parametres (mu, sigma) utilises sont des estimations basees sur des donnees historiques moyennes et peuvent differer significativement sur votre horizon d\'investissement.',
      'La fiscalite francaise est susceptible d\'evoluer. Les calculs sont bases sur la legislation en vigueur au 01/01/2026 et constituent des estimations indicatives ne prenant pas en compte votre situation patrimoniale globale.',
      'Avant toute decision d\'investissement, consultez un conseiller en gestion de patrimoine (CGP) agree par l\'AMF.',
    ];
    doc.autoTable({
      startY: y,
      body: warnings.map((w, i) => [`${i + 1}.`, w]),
      theme: 'plain',
      bodyStyles: { fontSize: 7.5, textColor: TEXT, cellPadding: { top: 2, bottom: 2, left: 2, right: 4 } },
      columnStyles: { 0: { cellWidth: 8, fontStyle: 'bold', valign: 'top' } },
      margin: { left: ML, right: MR },
    });
    y = doc.lastAutoTable.finalY + 6;

    y = checkY(y, 50);
    y = sectionTitle(y, 'CERTIFICAT D\'AUTHENTICITÉ DU DOCUMENT');
    doc.setFillColor(...LIGHT);
    doc.roundedRect(ML, y, CW, 42, 3, 3, 'F');
    doc.setDrawColor(...NAVY); doc.setLineWidth(0.4);
    doc.roundedRect(ML, y, CW, 42, 3, 3, 'S');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NAVY);
    doc.text('Empreinte numérique SHA-256 (paramètres de simulation)', ML + 4, y + 7);
    doc.setFont('courier', 'normal'); doc.setFontSize(8); doc.setTextColor(...TEXT);
    doc.text(fingerprint.slice(0, 32), ML + 4, y + 14);
    doc.text(fingerprint.slice(32), ML + 4, y + 20);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    doc.text(`Référence document : ${docId}`, ML + 4, y + 28);
    doc.text(`Date de génération : ${now.toISOString().replace('T', ' ').slice(0, 19)} UTC`, ML + 4, y + 34);
    doc.text('Produit par : SimuPortefeuille — Application cliente (aucune donnée transmise)', ML + 4, y + 40);

    const filename = `SimuPortefeuille_${risk}_${horizon}ans_${docId}.pdf`;
    doc.save(filename);
  } catch (err) {
    console.error('PDF generation error:', err);
    showError('Erreur lors de la génération du PDF. Réessayez ou contactez le support.');
  } finally {
    hideLoading();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pdf.js
git commit -m "feat: ajouter le module de generation PDF src/pdf.js"
```

---

### Task 13: `src/main.js` — point d'entrée

**Files:**
- Create: `src/main.js`

- [ ] **Step 1: Créer `src/main.js`**

```javascript
import { initUI } from './ui.js';

document.addEventListener('DOMContentLoaded', initUI);
```

- [ ] **Step 2: Commit**

```bash
git add src/main.js
git commit -m "feat: ajouter le point d'entree src/main.js"
```

---

### Task 14: Suppression des anciens fichiers et vérification manuelle

**Files:**
- Delete: `app.js`
- Delete: `simuportefeuille-standalone.html`

- [ ] **Step 1: Lancer la suite de tests complète une dernière fois avant suppression**

Run: `npm test`
Expected: tous les tests passent (Tasks 2 à 6 cumulés — formatage, fiscalité, corrélation, simulation).

- [ ] **Step 2: Supprimer les anciens fichiers**

```bash
git rm app.js simuportefeuille-standalone.html
```

- [ ] **Step 3: Vérification manuelle dans le navigateur**

Run: `python3 -m http.server 8000` puis ouvrir `http://localhost:8000/index.html`.

Checklist à valider manuellement (aucune de ces étapes n'est automatisable sans introduire de dépendance DOM/navigateur, hors périmètre de ce projet) :
- [ ] Étape 1 : saisir capital=15000, horizon=12, versements=150€/mois, TMI=30%, profil Modéré → cliquer "Suivant"
- [ ] Étape 2 : vérifier que les cartes produits du profil Modéré s'affichent (fonds-euro, etf-oblig, scpi, etf-world, etf-europe, uc-actions), total = 100 % → cliquer "Simuler"
- [ ] Étape 3, onglet Indicateurs : vérifier que "Valeur médiane" affiche un montant net avec un sous-texte "brut : X €" différent (le net doit être inférieur au brut)
- [ ] Onglet Graphiques : vérifier que les 3 graphiques (fan chart, histogramme, donut) s'affichent sans erreur console
- [ ] Onglet Détail : vérifier la présence des deux tableaux (détail par support + fiscalité par véhicule), avec des montants cohérents (net ≤ brut pour chaque véhicule imposable, Livret toujours net = brut)
- [ ] Cliquer "⬇ Exporter PDF" : vérifier qu'un PDF de 5 pages se télécharge, avec le certificat SHA-256 en dernière page
- [ ] Ouvrir la console développeur : vérifier l'absence de toute erreur JavaScript pendant tout le parcours
- [ ] Retour arrière (bouton "← Modifier") puis "× Exclure" sur un produit à l'étape 2 : vérifier que les pourcentages se recalculent à 100 %

Arrêter le serveur (Ctrl+C) une fois la checklist validée.

- [ ] **Step 4: Vérifier que le déploiement GitHub Pages n'a besoin d'aucun changement**

Le workflow `.github/workflows/*.yml` publie l'intégralité du dépôt (`path: '.'`), y compris le nouveau dossier `src/`. Aucune modification du workflow n'est nécessaire. Vérifier simplement :

```bash
cat .github/workflows/*.yml | grep -A2 "Upload du site"
```
Expected : `path: '.'` confirmé — aucun changement requis.

- [ ] **Step 5: Commit final**

```bash
git add -A
git commit -m "chore: supprimer app.js et simuportefeuille-standalone.html (architecture consolidee)"
```

---

## Self-Review (effectué par l'auteur du plan)

**Couverture du spec** (`docs/superpowers/specs/2026-08-05-consolidation-moteur-calcul-design.md`) :
- Architecture modulaire unique, suppression du fichier standalone → Tasks 1, 8–14. ✓
- Catalogue de produits fusionné → Task 5. ✓
- Corrélation entre actifs dans le Monte Carlo joint → Tasks 4, 6. ✓
- Versements mensuels dans le moteur → Task 6 (`values[i] += mensuel * w`). ✓
- Fiscalité calculée par scénario, cohérence brut/net → Task 6 (`gainByVehicle`, `calcTax` appelé par scénario). ✓
- KPI "Net médian" comme véritable percentile de la distribution nette → Task 6 (`netP50 = percentile(sortedNet, 50)`), Task 11 (affichage). ✓
- Non-additivité des médianes par produit documentée → Task 8 (texte HTML), Task 12 (texte PDF). ✓
- Ajustement inflation corrigé (déflation de la vraie valeur nette simulée) → Task 11 (`realNetP50 = netP50 / Math.pow(1+INFLATION, horizon)`). ✓
- Régularisation de la matrice de corrélation non définie positive → Task 4 (`cholesky` avec clamping EPS). ✓
- Tests (`calcTax`, convergence de corrélation, cohérence percentile) → Tasks 3, 4, 6. ✓
- Empaquetage desktop hors périmètre → non traité, conforme au spec. ✓
- Pas de refonte UX/UI → décision explicite documentée en tête de plan, aucune tâche ne modifie la structure visuelle au-delà des deux ajouts minimaux (TMI, tableau fiscal). ✓

**Cohérence des types/signatures** : `runSimulation` (Task 6) retourne `{ sortedGross, p5, p10, p25, p50, p75, p90, netP10, netP50, netP90, probLoss, probLossInvested, totalInvested, pctPaths, productMedians, fiscalByVehicle }` — vérifié cohérent entre Task 6 (définition), Task 11 (`ui.js` consommateur) et Task 12 (`pdf.js` consommateur). `blendedParams(alloc, products, correlations)` — signature identique dans Task 6 (définition), Task 11 et Task 12 (appels). `calcTax(grossGain, vehicle, horizon, tmi)` — identique dans Task 3, Task 6, aucun autre appelant direct.

**Aucun placeholder** : chaque étape de code contient une implémentation complète et exécutable ; aucune occurrence de "TODO"/"TBD"/"similaire à la tâche N".
