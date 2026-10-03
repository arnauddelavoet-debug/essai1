// ----------------------------------------------------------------
// STATISTIQUES DE MARCHÉ À PARTIR DE SÉRIES DE COURS
// Module pur, sans dépendance au navigateur ni à Node : utilisé par la
// fonction serverless /api/market, par le script de snapshot et par
// les tests.
// ----------------------------------------------------------------

/**
 * Rééchantillonne une série de cours (horodatages Unix en secondes) en
 * une valeur par mois calendaire : la dernière cotation disponible du
 * mois. Les points invalides (null, ≤ 0) sont ignorés.
 * @returns {{ month: string, time: number, close: number }[]} trié par date
 */
export function toMonthly(timestamps, closes) {
  const byMonth = new Map();
  for (let i = 0; i < timestamps.length; i++) {
    const c = closes[i];
    const t = timestamps[i];
    if (!Number.isFinite(c) || c <= 0 || !Number.isFinite(t)) continue;
    const d = new Date(t * 1000);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const prev = byMonth.get(key);
    if (!prev || t >= prev.time) byMonth.set(key, { month: key, time: t, close: c });
  }
  return [...byMonth.values()].sort((a, b) => a.time - b.time);
}

/** Rendements logarithmiques mensuels d'une série mensuelle, indexés par mois. */
export function logReturns(monthly) {
  const out = new Map();
  for (let i = 1; i < monthly.length; i++) {
    out.set(monthly[i].month, Math.log(monthly[i].close / monthly[i - 1].close));
  }
  return out;
}

/** Rendement annualisé entre la valeur d'il y a `years` ans et la dernière. */
function annualizedPerf(monthly, years) {
  const n = years * 12;
  if (monthly.length <= n) return null;
  const last = monthly[monthly.length - 1].close;
  const first = monthly[monthly.length - 1 - n].close;
  return Math.pow(last / first, 1 / years) - 1;
}

/**
 * Statistiques annualisées d'une série mensuelle (au plus maxMonths
 * derniers mois) :
 *  σ = écart-type des rendements log mensuels × √12
 *  μ = moyenne des rendements log × 12 + σ²/2  (dérive arithmétique du
 *      mouvement brownien géométrique, cohérente avec le moteur)
 */
export function seriesStats(monthly, { maxMonths = 120 } = {}) {
  const window = monthly.slice(-(maxMonths + 1));
  const rets = [];
  for (let i = 1; i < window.length; i++) rets.push(Math.log(window[i].close / window[i - 1].close));
  const months = rets.length;
  const last = monthly[monthly.length - 1];
  const base = {
    months,
    lastPrice: last ? last.close : null,
    lastDate: last ? last.month : null,
    firstDate: window.length ? window[0].month : null,
    perf: {
      '1a': annualizedPerf(monthly, 1),
      '3a': annualizedPerf(monthly, 3),
      '5a': annualizedPerf(monthly, 5),
      '10a': annualizedPerf(monthly, 10),
    },
    maxDrawdown: maxDrawdown(window),
  };
  if (months < 12) return { ...base, mu: null, sigma: null };
  const m = rets.reduce((a, b) => a + b, 0) / months;
  const variance = rets.reduce((a, r) => a + (r - m) * (r - m), 0) / (months - 1);
  const sigma = Math.sqrt(variance * 12);
  return { ...base, mu: m * 12 + (sigma * sigma) / 2, sigma };
}

/** Plus forte baisse depuis un plus haut (fraction positive) sur la série. */
export function maxDrawdown(monthly) {
  let peak = -Infinity, dd = 0;
  for (const { close } of monthly) {
    if (close > peak) peak = close;
    else dd = Math.max(dd, 1 - close / peak);
  }
  return dd;
}

/** Coefficient de corrélation de Pearson de deux échantillons de même taille. */
export function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2) return NaN;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
  mx /= n; my /= n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return NaN;
  return sxy / Math.sqrt(sxx * syy);
}

/**
 * Table de corrélations historiques { a: { b: ρ } } (triangle supérieur)
 * calculée paire par paire sur les mois communs (au moins minOverlap).
 * @param {Record<string, Map<string, number>>} returnsByTicker
 */
export function correlationTable(returnsByTicker, { minOverlap = 36 } = {}) {
  const tickers = Object.keys(returnsByTicker).sort();
  const table = {};
  for (let i = 0; i < tickers.length; i++) {
    for (let j = i + 1; j < tickers.length; j++) {
      const a = returnsByTicker[tickers[i]], b = returnsByTicker[tickers[j]];
      const xs = [], ys = [];
      for (const [month, ra] of a) {
        const rb = b.get(month);
        if (rb !== undefined) { xs.push(ra); ys.push(rb); }
      }
      if (xs.length < minOverlap) continue;
      const rho = pearson(xs, ys);
      if (!Number.isFinite(rho)) continue;
      (table[tickers[i]] ||= {})[tickers[j]] = Math.round(rho * 1000) / 1000;
    }
  }
  return table;
}

/**
 * Nettoie des données de marché venant du réseau : ne conserve que les
 * valeurs numériques plausibles. Retourne null si la structure est
 * inexploitable.
 */
export function sanitizeMarketData(raw) {
  if (!raw || typeof raw !== 'object' || raw.schema !== 1 || typeof raw.tickers !== 'object') return null;
  const finite = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);
  const str = v => (typeof v === 'string' && v.length <= 200 ? v : null);

  const tickers = {};
  for (const [t, d] of Object.entries(raw.tickers)) {
    if (!/^[A-Z0-9.^=-]{1,20}$/i.test(t) || !d || typeof d !== 'object') continue;
    const perf = {};
    for (const k of ['1a', '3a', '5a', '10a']) perf[k] = finite(d.perf && d.perf[k], -1, 10);
    tickers[t] = {
      name: str(d.name),
      currency: str(d.currency),
      months: finite(d.months, 0, 2000) ?? 0,
      mu: finite(d.mu, -1, 3),
      sigma: finite(d.sigma, 0, 5),
      lastPrice: finite(d.lastPrice, 0, 1e9),
      lastDate: str(d.lastDate),
      firstDate: str(d.firstDate),
      maxDrawdown: finite(d.maxDrawdown, 0, 1),
      perf,
    };
  }

  const correlations = {};
  if (raw.correlations && typeof raw.correlations === 'object') {
    for (const [a, row] of Object.entries(raw.correlations)) {
      if (!(a in tickers) || !row || typeof row !== 'object') continue;
      for (const [b, rho] of Object.entries(row)) {
        const r = finite(rho, -1, 1);
        if (b in tickers && r !== null) (correlations[a] ||= {})[b] = r;
      }
    }
  }

  const macro = {};
  if (raw.macro && typeof raw.macro === 'object') {
    for (const [k, v] of Object.entries(raw.macro)) {
      if (!/^[a-zA-Z0-9]{1,30}$/.test(k) || !v) continue;
      const value = finite(v.value, -0.5, 1);
      if (value !== null) macro[k] = { value, period: str(v.period), label: str(v.label) };
    }
  }

  return { schema: 1, generatedAt: str(raw.generatedAt), tickers, correlations, macro, errors: Array.isArray(raw.errors) ? raw.errors.filter(e => typeof e === 'string').slice(0, 50) : [] };
}
