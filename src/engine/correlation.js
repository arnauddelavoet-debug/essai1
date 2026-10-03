/**
 * Lit ρ(a, b) dans une table de corrélations partielle { a: { b: ρ } },
 * quel que soit le sens dans lequel la paire est déclarée. Paires non
 * renseignées : 0.
 */
export function lookupRho(correlations, a, b) {
  if (a === b) return 1;
  const direct = correlations[a] && correlations[a][b];
  if (direct !== undefined) return direct;
  const reverse = correlations[b] && correlations[b][a];
  if (reverse !== undefined) return reverse;
  return 0;
}

/**
 * Construit la matrice de corrélation n×n restreinte à une liste
 * d'identifiants, à partir d'une table partielle. Diagonale à 1.
 */
export function buildCorrelationMatrix(ids, correlations) {
  return buildMatrix(ids.length, (i, j) => lookupRho(correlations, ids[i], ids[j]));
}

/** Construit une matrice symétrique n×n de diagonale 1 à partir de rho(i, j), i < j. */
export function buildMatrix(n, rho) {
  const m = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    m[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const r = Math.max(-1, Math.min(1, rho(i, j)));
      m[i][j] = r;
      m[j][i] = r;
    }
  }
  return m;
}

/**
 * Décomposition de Cholesky stricte : retourne L (triangulaire
 * inférieure, L·Lᵀ = matrix) ou null si la matrice n'est pas définie
 * positive.
 */
export function choleskyStrict(matrix, tolerance = 1e-10) {
  const n = matrix.length;
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = matrix[i][j];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) {
        if (sum <= tolerance) return null;
        L[i][j] = Math.sqrt(sum);
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }
  return L;
}

/**
 * Décomposition de Cholesky tolérante : si la matrice n'est pas définie
 * positive (corrélations saisies à la main ou estimées paire par paire
 * sur des historiques de longueurs différentes), elle est rétrécie vers
 * l'identité — ρ' = (1 − λ)·ρ — par pas de 2 %, jusqu'à ce qu'elle le
 * devienne. Cette régularisation préserve la structure relative des
 * corrélations (contrairement à un simple écrêtage des pivots) et le
 * facteur λ appliqué est retourné pour être affiché à l'utilisateur.
 * @returns {{ L: number[][], shrinkage: number }}
 */
export function choleskyRegularized(matrix) {
  const n = matrix.length;
  for (let step = 0; step <= 50; step++) {
    const lambda = step * 0.02;
    const m = lambda === 0 ? matrix : buildMatrix(n, (i, j) => (1 - lambda) * matrix[i][j]);
    const L = choleskyStrict(m);
    if (L) return { L, shrinkage: lambda };
  }
  // λ = 1 donne l'identité, toujours définie positive : jamais atteint en pratique.
  return { L: buildMatrix(n, () => 0), shrinkage: 1 };
}

/**
 * Conservé pour compatibilité : retourne uniquement L (voir
 * choleskyRegularized pour connaître la régularisation appliquée).
 */
export function cholesky(matrix) {
  return choleskyRegularized(matrix).L;
}

/**
 * Applique L à un vecteur de chocs indépendants N(0,1) pour produire des
 * chocs corrélés. Un buffer de sortie peut être fourni pour éviter une
 * allocation dans la boucle chaude de la simulation.
 */
export function applyCholesky(L, independentShocks, out) {
  const n = L.length;
  const result = out || new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const row = L[i];
    let sum = 0;
    for (let k = 0; k <= i; k++) sum += row[k] * independentShocks[k];
    result[i] = sum;
  }
  return result;
}
