import { buildMarketData } from '../src/market/builder.js';

// ----------------------------------------------------------------
// GET /api/market — fonction serverless Vercel (runtime Node.js)
// Agrège les données de marché (Yahoo Finance + BCE) et les sert au
// navigateur, qui ne peut pas interroger Yahoo directement (CORS).
// Réponse mise en cache 24 h sur le CDN Vercel, puis servie « stale »
// pendant 7 jours le temps d'être régénérée en arrière-plan : les
// sources amont sont appelées au plus une fois par jour et par région.
// ----------------------------------------------------------------
export async function GET() {
  try {
    const data = await buildMarketData();
    return Response.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    console.error('market data unavailable:', err);
    return Response.json(
      { error: 'market_unavailable', message: 'Données de marché momentanément indisponibles.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
