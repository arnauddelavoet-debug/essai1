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
