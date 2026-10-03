import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMonthly, seriesStats, logReturns, correlationTable, pearson, maxDrawdown, sanitizeMarketData } from '../src/market/stats.js';
import { buildMarketData, fetchYahooMonthly, fetchEcbLatest, fetchEurostatInflation } from '../src/market/builder.js';
import { loadMarketData } from '../src/market/client.js';
import { GET } from '../api/market.js';

// ── Fixtures ────────────────────────────────────────────────────
const monthStart = (y, m) => Date.UTC(y, m, 1) / 1000;
function yahooPayload(monthlyGrowth, months = 121, start = [2016, 9]) {
  const timestamp = [], close = [];
  for (let i = 0; i < months; i++) {
    timestamp.push(monthStart(start[0], start[1] + i));
    close.push(100 * Math.exp(monthlyGrowth(i)));
  }
  return { chart: { result: [{ meta: { currency: 'EUR', longName: 'Test ETF' }, timestamp, indicators: { quote: [{ close }], adjclose: [{ adjclose: close }] } }] } };
}
const ecbPayload = (periods, values) => ({
  dataSets: [{ series: { '0:0:0': { observations: Object.fromEntries(values.map((v, i) => [String(i), [v]])) } } }],
  structure: { dimensions: { observation: [{ values: periods.map(id => ({ id })) }] } },
});
const eurostatPayload = { value: { 0: 2.0, 1: 2.6 }, dimension: { time: { category: { index: { '2026-07': 0, '2026-08': 1 } } } } };

function mockFetch(routes) {
  return async url => {
    for (const [pattern, body] of routes) {
      if (url.includes(pattern)) {
        if (body instanceof Error) throw body;
        if (typeof body === 'number') return { ok: false, status: body, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => body };
      }
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

// ── stats.js ────────────────────────────────────────────────────
test('toMonthly : garde la dernière cotation de chaque mois et ignore les points invalides', () => {
  const t = [monthStart(2024, 0), monthStart(2024, 0) + 86400 * 20, monthStart(2024, 1), monthStart(2024, 2)];
  const m = toMonthly(t, [10, 11, null, 12]);
  assert.deepEqual(m.map(x => [x.month, x.close]), [['2024-01', 11], ['2024-03', 12]]);
});

test('seriesStats : croissance constante → σ = 0, μ = taux continu, perf annualisée exacte', () => {
  const g = Math.log(1.08) / 12;
  const r = yahooPayload(i => g * i).chart.result[0];
  const s = seriesStats(toMonthly(r.timestamp, r.indicators.quote[0].close));
  assert.equal(s.months, 120);
  assert.ok(s.sigma < 1e-9);
  assert.ok(Math.abs(s.mu - Math.log(1.08)) < 1e-9);
  assert.ok(Math.abs(s.perf['10a'] - 0.08) < 1e-9);
  assert.ok(Math.abs(s.perf['1a'] - 0.08) < 1e-9);
  assert.equal(s.maxDrawdown, 0);
});

test('seriesStats : moins de 12 mois → μ et σ non calculés', () => {
  const r = yahooPayload(i => i * 0.01, 6).chart.result[0];
  const s = seriesStats(toMonthly(r.timestamp, r.indicators.quote[0].close));
  assert.equal(s.mu, null);
  assert.equal(s.perf['1a'], null);
});

test('maxDrawdown et pearson', () => {
  assert.ok(Math.abs(maxDrawdown([{ close: 100 }, { close: 50 }, { close: 120 }, { close: 90 }]) - 0.5) < 1e-12);
  assert.ok(Math.abs(pearson([1, 2, 3], [2, 4, 6]) - 1) < 1e-12);
  assert.ok(Math.abs(pearson([1, 2, 3], [3, 2, 1]) + 1) < 1e-12);
  assert.ok(Number.isNaN(pearson([1, 1, 1], [1, 2, 3])));
});

test('correlationTable : paires sur mois communs, seuil de recouvrement', () => {
  const a = new Map(), b = new Map(), c = new Map();
  for (let i = 0; i < 40; i++) {
    const k = `m${i}`;
    a.set(k, Math.sin(i)); b.set(k, 2 * Math.sin(i) + 0.1);
    if (i < 10) c.set(k, Math.cos(i));
  }
  const t = correlationTable({ A: a, B: b, C: c });
  assert.equal(t.A.B, 1);
  assert.equal(t.A.C, undefined); // 10 mois communs < 36
});

test('logReturns indexe les rendements par mois', () => {
  const r = logReturns([{ month: '2024-01', close: 100 }, { month: '2024-02', close: 110 }]);
  assert.ok(Math.abs(r.get('2024-02') - Math.log(1.1)) < 1e-12);
});

test('sanitizeMarketData : rejette les structures invalides et filtre les valeurs aberrantes', () => {
  assert.equal(sanitizeMarketData(null), null);
  assert.equal(sanitizeMarketData({ schema: 2, tickers: {} }), null);
  const d = sanitizeMarketData({
    schema: 1, generatedAt: '2026-09-30',
    tickers: { 'CW8.PA': { mu: 0.1, sigma: 99, months: 120, perf: { '1a': 0.1 } }, '<img>': { mu: 0.1 } },
    correlations: { 'CW8.PA': { 'CW8.PA': 2, 'X': 0.5 } },
    macro: { inflationFR: { value: 0.026, period: '2026-08' }, bad: { value: 'x' } },
  });
  assert.deepEqual(Object.keys(d.tickers), ['CW8.PA']);
  assert.equal(d.tickers['CW8.PA'].sigma, null);
  assert.deepEqual(d.correlations, {});
  assert.deepEqual(Object.keys(d.macro), ['inflationFR']);
});

// ── builder.js ──────────────────────────────────────────────────
test('fetchYahooMonthly : lit les cours ajustés', async () => {
  const f = mockFetch([['AAA', yahooPayload(i => i * 0.005)]]);
  const r = await fetchYahooMonthly('AAA', f);
  assert.equal(r.name, 'Test ETF');
  assert.equal(r.monthly.length, 121);
});

test('fetchEcbLatest et fetchEurostatInflation : dernière observation en fraction', async () => {
  const ecb = await fetchEcbLatest('EST/X', mockFetch([['EST/X', ecbPayload(['2026-09-28', '2026-09-29'], [2.40, 2.439])]]));
  assert.deepEqual(ecb, { value: 0.02439, period: '2026-09-29' });
  const eu = await fetchEurostatInflation('FR', mockFetch([['prc_hicp_minr', eurostatPayload]]));
  assert.deepEqual(eu, { value: 0.026, period: '2026-08' });
});

test('buildMarketData : agrège tickers, corrélations et macro ; consigne les échecs', async () => {
  const f = mockFetch([
    ['chart/AAA', yahooPayload(i => i * 0.005 + 0.03 * Math.sin(i))],
    ['chart/BBB', yahooPayload(i => i * 0.004 + 0.02 * Math.sin(i))],
    ['chart/CCC', 500],
    ['prc_hicp_minr', eurostatPayload],
    ['EST/', ecbPayload(['2026-09-29'], [2.439])],
    ['IRS/', new Error('timeout')],
  ]);
  const d = await buildMarketData({ fetchImpl: f, tickers: ['AAA', 'BBB', 'CCC'], now: new Date('2026-09-30T00:00:00Z') });
  assert.equal(d.schema, 1);
  assert.deepEqual(Object.keys(d.tickers).sort(), ['AAA', 'BBB']);
  assert.ok(d.correlations.AAA.BBB > 0.9);
  assert.equal(d.macro.inflationFR.value, 0.026);
  assert.equal(d.macro.estr.value, 0.02439);
  assert.ok(d.errors.some(e => e.startsWith('CCC')));
  assert.ok(d.errors.some(e => e.includes('oat10')));
  assert.ok(sanitizeMarketData(d), 'la sortie doit passer la validation client');
});

test('buildMarketData échoue si aucun ticker ne répond', async () => {
  await assert.rejects(buildMarketData({ fetchImpl: mockFetch([]), tickers: ['AAA'] }), /Aucune donnée/);
});

// ── api/market.js ───────────────────────────────────────────────
test('GET /api/market : 502 sans cache si les sources sont indisponibles', async () => {
  const original = globalThis.fetch;
  const originalError = console.error;
  globalThis.fetch = mockFetch([]);
  console.error = () => {};
  try {
    const res = await GET();
    assert.equal(res.status, 502);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal((await res.json()).error, 'market_unavailable');
  } finally {
    globalThis.fetch = original;
    console.error = originalError;
  }
});

test('GET /api/market : 200 avec cache CDN 24 h', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = mockFetch([['chart/', yahooPayload(i => i * 0.005)], ['prc_hicp_minr', eurostatPayload], ['EST/', ecbPayload(['2026-09-29'], [2.4])], ['IRS/', ecbPayload(['2026-08'], [4])]]);
  try {
    const res = await GET();
    assert.equal(res.status, 200);
    assert.match(res.headers.get('cache-control'), /s-maxage=86400/);
    const body = await res.json();
    assert.ok(Object.keys(body.tickers).length > 5);
  } finally {
    globalThis.fetch = original;
  }
});

// ── client.js ───────────────────────────────────────────────────
const validMarket = { schema: 1, generatedAt: '2026-09-30', tickers: { 'CW8.PA': { mu: 0.1, sigma: 0.13, months: 120, perf: {} } } };

test('loadMarketData : API live en priorité', async () => {
  const r = await loadMarketData(mockFetch([['api/market', validMarket]]));
  assert.equal(r.source, 'live');
});

test('loadMarketData : repli sur le snapshot si l\'API échoue', async () => {
  const r = await loadMarketData(mockFetch([['api/market', 502], ['market-snapshot.json', validMarket]]));
  assert.equal(r.source, 'snapshot');
});

test('loadMarketData : aucune source → hypothèses intégrées', async () => {
  const r = await loadMarketData(mockFetch([['api/market', new Error('offline')]]));
  assert.equal(r.source, 'none');
  assert.equal(r.data, null);
});

test('le snapshot versionné est valide et couvre les tickers du catalogue', async () => {
  const { readFile } = await import('node:fs/promises');
  const { MARKET_TICKERS } = await import('../src/market/builder.js');
  const raw = JSON.parse(await readFile(new URL('../data/market-snapshot.json', import.meta.url), 'utf8'));
  const d = sanitizeMarketData(raw);
  assert.ok(d);
  const covered = MARKET_TICKERS.filter(t => d.tickers[t]);
  assert.ok(covered.length >= MARKET_TICKERS.length - 2, `${covered.length}/${MARKET_TICKERS.length}`);
});

test('getJson : nouvelle tentative après une erreur serveur, pas après une 404', async () => {
  let calls = 0;
  const flaky = async url => {
    calls++;
    if (calls === 1) return { ok: false, status: 503, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ecbPayload(['2026-10-01'], [2.44]) };
  };
  assert.deepEqual(await fetchEcbLatest('EST/X', flaky), { value: 0.0244, period: '2026-10-01' });
  assert.equal(calls, 2);
  let calls404 = 0;
  await assert.rejects(fetchEcbLatest('EST/X', async () => { calls404++; return { ok: false, status: 404, json: async () => ({}) }; }), /404/);
  assert.equal(calls404, 1);
});
