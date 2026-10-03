import { sanitizeMarketData } from './stats.js';

// ----------------------------------------------------------------
// CHARGEMENT DES DONNÉES DE MARCHÉ DANS LE NAVIGATEUR
// Cascade : API live (/api/market, Vercel) → snapshot versionné
// (data/market-snapshot.json) → aucune donnée (hypothèses intégrées).
// L'application reste donc entièrement fonctionnelle hors ligne.
// ----------------------------------------------------------------

const SOURCES = [
  { url: 'api/market', kind: 'live', label: 'API de marché (temps réel, cache 24 h)', timeout: 12_000 },
  { url: 'data/market-snapshot.json', kind: 'snapshot', label: 'Instantané de marché intégré', timeout: 8_000 },
];

/**
 * @returns {Promise<{ data: object|null, source: 'live'|'snapshot'|'none', label: string }>}
 */
export async function loadMarketData(fetchImpl = globalThis.fetch) {
  for (const src of SOURCES) {
    try {
      const res = await fetchImpl(src.url, { signal: AbortSignal.timeout(src.timeout), headers: { Accept: 'application/json' } });
      if (!res.ok) continue;
      const data = sanitizeMarketData(await res.json());
      if (data && Object.keys(data.tickers).length > 0) return { data, source: src.kind, label: src.label };
    } catch {
      // Source suivante.
    }
  }
  return { data: null, source: 'none', label: 'Aucune donnée de marché — hypothèses prospectives intégrées' };
}
