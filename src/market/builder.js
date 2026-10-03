import { CATALOG } from '../data/catalog.js';
import { toMonthly, seriesStats, logReturns, correlationTable } from './stats.js';

// ----------------------------------------------------------------
// COLLECTE DES DONNÉES DE MARCHÉ (côté serveur uniquement)
//  • Yahoo Finance (API chart v8) : historique mensuel 10 ans des
//    supports cotés du catalogue, cours ajustés des dividendes.
//    Sans en-têtes CORS : interrogé depuis la fonction serverless ou
//    le script de snapshot, jamais depuis le navigateur.
//  • Eurostat (API publique, sans clé) : inflation IPCH France et zone
//    euro — jeu prc_hicp_minr (nomenclature ECOICOP v2, qui remplace
//    depuis 2026 l'ancien prc_hicp_manr arrêté à décembre 2025).
//  • BCE — Data Portal (API SDMX publique, sans clé) : €STR et taux à
//    10 ans de l'État français.
// `fetchImpl` est injectable pour les tests.
// ----------------------------------------------------------------

export const MARKET_TICKERS = Object.freeze([...new Set(CATALOG.map(p => p.marketTicker).filter(Boolean))]);

export const EUROSTAT_SERIES = Object.freeze({
  inflationFR: { geo: 'FR', label: 'Inflation IPCH France (glissement annuel)' },
  inflationEA: { geo: 'EA', label: 'Inflation IPCH zone euro (glissement annuel)' },
});

export const ECB_SERIES = Object.freeze({
  estr: { key: 'EST/B.EU000A2X2A25.WT', label: '€STR (taux monétaire au jour le jour)' },
  oat10: { key: 'IRS/M.FR.L.L40.CI.0000.EUR.N.Z', label: 'Taux de l\'État français à 10 ans' },
});

const YAHOO_URL = t => `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?range=10y&interval=1mo&includeAdjustedClose=true`;
const EUROSTAT_URL = geo => `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr?geo=${geo}&unit=RCH_A&coicop18=TOTAL&lastTimePeriod=3&format=JSON`;
const ECB_URL = key => `https://data-api.ecb.europa.eu/service/data/${key}?lastNObservations=3&format=jsondata`;
const TIMEOUT_MS = 6000;
const ATTEMPTS = 2;

/**
 * GET JSON avec délai maximal et une nouvelle tentative en cas d'échec
 * réseau, de délai dépassé ou d'erreur serveur (5xx, 429) : les API
 * publiques connaissent des lenteurs ponctuelles.
 */
async function getJson(url, fetchImpl, headers = {}) {
  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetchImpl(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.ok) return await res.json();
      lastError = new Error(`HTTP ${res.status}`);
      if (res.status < 500 && res.status !== 429) break;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

/** Historique mensuel d'un ticker Yahoo Finance. */
export async function fetchYahooMonthly(ticker, fetchImpl = fetch) {
  const json = await getJson(YAHOO_URL(ticker), fetchImpl, { 'User-Agent': 'Mozilla/5.0 (SimuPortefeuille market snapshot)' });
  const r = json && json.chart && json.chart.result && json.chart.result[0];
  if (!r || !Array.isArray(r.timestamp)) throw new Error('réponse Yahoo inattendue');
  const adj = r.indicators && r.indicators.adjclose && r.indicators.adjclose[0] && r.indicators.adjclose[0].adjclose;
  const close = r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close;
  const prices = Array.isArray(adj) && adj.some(Number.isFinite) ? adj : close;
  if (!Array.isArray(prices)) throw new Error('cours absents');
  return {
    name: r.meta && (r.meta.longName || r.meta.shortName) || ticker,
    currency: r.meta && r.meta.currency || null,
    monthly: toMonthly(r.timestamp, prices),
  };
}

/** Dernière observation d'une série SDMX de la BCE, convertie en fraction. */
export async function fetchEcbLatest(key, fetchImpl = fetch) {
  const json = await getJson(ECB_URL(key), fetchImpl);
  const series = json && json.dataSets && json.dataSets[0] && json.dataSets[0].series;
  const first = series && Object.values(series)[0];
  const periods = json && json.structure && json.structure.dimensions && json.structure.dimensions.observation
    && json.structure.dimensions.observation[0] && json.structure.dimensions.observation[0].values;
  if (!first || !first.observations || !Array.isArray(periods)) throw new Error('réponse BCE inattendue');
  let best = null;
  for (const [idx, obs] of Object.entries(first.observations)) {
    const value = Array.isArray(obs) ? obs[0] : null;
    const period = periods[Number(idx)] && periods[Number(idx)].id;
    if (!Number.isFinite(value) || !period) continue;
    if (!best || period > best.period) best = { value: Math.round(value * 1e4) / 1e6, period };
  }
  if (!best) throw new Error('aucune observation BCE');
  return best;
}

/** Dernier glissement annuel de l'IPCH (Eurostat), converti en fraction. */
export async function fetchEurostatInflation(geo, fetchImpl = fetch) {
  const json = await getJson(EUROSTAT_URL(geo), fetchImpl);
  const index = json && json.dimension && json.dimension.time && json.dimension.time.category && json.dimension.time.category.index;
  if (!index || !json.value) throw new Error('réponse Eurostat inattendue');
  let best = null;
  for (const [period, pos] of Object.entries(index)) {
    const value = json.value[String(pos)];
    if (!Number.isFinite(value)) continue;
    if (!best || period > best.period) best = { value: Math.round(value * 1e4) / 1e6, period };
  }
  if (!best) throw new Error('aucune observation Eurostat');
  return best;
}

/** Exécute des tâches asynchrones avec un parallélisme borné. */
async function pool(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try { results[i] = { ok: true, value: await task(items[i]) }; } catch (e) { results[i] = { ok: false, error: e }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Construit le jeu de données de marché complet (format schema 1).
 * Les échecs individuels sont consignés dans `errors` sans interrompre
 * la collecte ; une erreur n'est levée que si AUCUN ticker n'a répondu.
 */
export async function buildMarketData({ fetchImpl = fetch, tickers = MARKET_TICKERS, now = new Date() } = {}) {
  const errors = [];
  const out = { schema: 1, generatedAt: now.toISOString(), sources: {
    prices: 'Yahoo Finance — cours mensuels ajustés des dividendes (10 ans)',
    inflation: 'Eurostat — IPCH (prc_hicp_minr)',
    rates: 'Banque centrale européenne — ECB Data Portal',
  }, tickers: {}, correlations: {}, macro: {}, errors };

  const macroTasks = [
    ...Object.entries(EUROSTAT_SERIES).map(([k, s]) => ({ k, label: s.label, src: 'Eurostat', run: () => fetchEurostatInflation(s.geo, fetchImpl) })),
    ...Object.entries(ECB_SERIES).map(([k, s]) => ({ k, label: s.label, src: 'BCE', run: () => fetchEcbLatest(s.key, fetchImpl) })),
  ];
  // Cours et séries macro sont collectés en parallèle (sources distinctes).
  const [yahoo, macro] = await Promise.all([
    pool(tickers, 5, t => fetchYahooMonthly(t, fetchImpl)),
    pool(macroTasks, 4, t => t.run()),
  ]);

  const returns = {};
  yahoo.forEach((r, i) => {
    const t = tickers[i];
    if (!r.ok) { errors.push(`${t} : ${r.error.message}`); return; }
    if (r.value.monthly.length < 2) { errors.push(`${t} : historique insuffisant`); return; }
    const stats = seriesStats(r.value.monthly);
    out.tickers[t] = { name: r.value.name, currency: r.value.currency, ...roundStats(stats) };
    returns[t] = logReturns(r.value.monthly.slice(-121));
  });
  if (Object.keys(out.tickers).length === 0) throw new Error(`Aucune donnée de cours disponible (${errors.join(' ; ')})`);
  out.correlations = correlationTable(returns);

  macro.forEach((r, i) => {
    const { k, label, src } = macroTasks[i];
    if (!r.ok) { errors.push(`${src} ${k} : ${r.error.message}`); return; }
    out.macro[k] = { ...r.value, label };
  });
  return out;
}

function roundStats(s) {
  const r = v => (Number.isFinite(v) ? Math.round(v * 1e5) / 1e5 : null);
  return {
    months: s.months,
    mu: r(s.mu),
    sigma: r(s.sigma),
    lastPrice: r(s.lastPrice),
    lastDate: s.lastDate,
    firstDate: s.firstDate,
    maxDrawdown: r(s.maxDrawdown),
    perf: Object.fromEntries(Object.entries(s.perf).map(([k, v]) => [k, r(v)])),
  };
}
