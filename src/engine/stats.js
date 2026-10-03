/**
 * Percentile p (0–100) d'un tableau trié par ordre croissant, avec
 * interpolation linéaire entre les deux rangs encadrants (méthode
 * « type 7 », celle d'Excel CENTILE et de NumPy par défaut).
 */
export function percentile(sorted, p) {
  const n = sorted.length;
  if (!n) return 0;
  const pos = Math.min(Math.max(p, 0), 100) / 100 * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Trie une copie d'un tableau (ou Float64Array) par ordre croissant. */
export function sortedCopy(values) {
  return Float64Array.from(values).sort();
}

export function mean(values) {
  if (!values.length) return 0;
  let s = 0;
  for (let i = 0; i < values.length; i++) s += values[i];
  return s / values.length;
}

/** Résumé en percentiles usuels d'une distribution triée. */
export function summarize(sorted) {
  return {
    p5: percentile(sorted, 5),
    p10: percentile(sorted, 10),
    p25: percentile(sorted, 25),
    p50: percentile(sorted, 50),
    p75: percentile(sorted, 75),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
    mean: mean(sorted),
  };
}

/**
 * Moyenne des valeurs sous le quantile q (« Expected Shortfall » ou
 * CVaR) : la valeur finale moyenne des q % pires scénarios.
 */
export function tailMean(sorted, q) {
  const n = Math.max(1, Math.floor(sorted.length * q));
  let s = 0;
  for (let i = 0; i < n; i++) s += sorted[i];
  return s / n;
}

/** Fraction des valeurs strictement inférieures à un seuil (tableau trié). */
export function fractionBelow(sorted, threshold) {
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] < threshold) lo = mid + 1; else hi = mid;
  }
  return sorted.length ? lo / sorted.length : 0;
}

/**
 * Taux de rendement interne annualisé (TRI, « money-weighted return »)
 * d'une série de flux mensuels : flows[m] est le flux du mois m (négatif
 * = versement, positif = retrait / valeur finale). Résolution par
 * dichotomie sur le taux mensuel. Retourne NaN si aucune solution dans
 * ]-99 % ; +100 %[ par mois.
 * On annule la valeur FUTURE des flux (même signe que la valeur
 * actuelle) : actualiser à −99 %/mois sur plusieurs centaines de mois
 * ferait déborder 1/(1+r)^m vers l'infini.
 */
export function irr(flows) {
  const last = flows.length - 1;
  const futureValue = r => {
    let v = 0;
    for (let m = 0; m <= last; m++) v = v * (1 + r) + flows[m];
    return v;
  };
  let lo = -0.99, hi = 1;
  let fLo = futureValue(lo), fHi = futureValue(hi);
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) return NaN;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = futureValue(mid);
    if (Math.abs(fMid) < 1e-9 || hi - lo < 1e-12) {
      lo = hi = mid;
      break;
    }
    if (fLo * fMid < 0) { hi = mid; fHi = fMid; } else { lo = mid; fLo = fMid; }
  }
  const monthly = (lo + hi) / 2;
  return Math.pow(1 + monthly, 12) - 1;
}
