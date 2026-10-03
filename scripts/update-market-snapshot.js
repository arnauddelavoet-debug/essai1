#!/usr/bin/env node
// Régénère data/market-snapshot.json — jeu de données de repli utilisé
// par le navigateur quand /api/market est indisponible (GitHub Pages,
// fichier ouvert en local, panne d'une source amont).
// Usage : npm run market:update
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildMarketData } from '../src/market/builder.js';

const target = fileURLToPath(new URL('../data/market-snapshot.json', import.meta.url));
const data = await buildMarketData();
await writeFile(target, JSON.stringify(data, null, 2) + '\n', 'utf8');

const n = Object.keys(data.tickers).length;
console.log(`Snapshot écrit : ${target} (${n} tickers, ${Object.keys(data.macro).length} séries macroéconomiques)`);
if (data.errors.length) {
  console.warn(`Avertissements (${data.errors.length}) :\n  - ${data.errors.join('\n  - ')}`);
}
