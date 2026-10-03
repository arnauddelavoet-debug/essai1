import { encodeParams } from '../state.js';
import { VEHICLES, VEHICLE_ORDER } from '../data/vehicles.js';
import { VERSION } from '../version.js';

// Export CSV au format attendu par Excel en français : séparateur « ; »,
// virgule décimale, BOM UTF-8. Les cellules texte commençant par un
// caractère de formule (= + - @) sont neutralisées (injection CSV).

const num = (v, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits).replace('.', ',') : '');

export function csvCell(v) {
  if (typeof v === 'number') return num(v);
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Construit le contenu CSV d'une simulation. */
export function buildCsv(s, r) {
  const rows = [];
  const add = (...cells) => rows.push(cells.map(csvCell).join(';'));
  add('SimuPortefeuille', `v${VERSION}`, new Date().toISOString());
  add();
  add('Paramètre', 'Valeur');
  add('Capital initial (€)', s.capital);
  add('Versement mensuel (€)', s.monthly);
  add('Horizon (ans)', s.horizon);
  add('TMI (%)', s.tmi);
  add('Inflation (%/an)', s.inflation * 100);
  add('Hypothèses', s.assumptionMode);
  add('Scénarios', r.meta.nSims);
  add('Graine', String(r.meta.seed));
  add();
  add('Indicateur', 'Brut (€)', 'Net (€)', 'Net euros constants (€)');
  for (const k of ['p5', 'p10', 'p25', 'p50', 'p75', 'p90', 'p95', 'mean']) add(k.toUpperCase(), r.gross[k], r.net[k], r.netReal[k]);
  add('Total versé (€)', r.invested);
  add('Probabilité de perte (%)', r.probLoss * 100);
  add('TRI net médian (%/an)', r.irr.p50 * 100);
  add('Impôts de sortie médians (€)', r.taxes.exitP50);
  add('Frais de gestion cumulés médians (€)', r.fees.managementP50);
  add();
  add('Année', 'Total versé (€)', 'P10 brut (€)', 'P25 brut (€)', 'Médiane brute (€)', 'P75 brut (€)', 'P90 brut (€)');
  r.pctPaths.p50.forEach((_, y) => add(String(y), r.investedPath[y], r.pctPaths.p10[y], r.pctPaths.p25[y], r.pctPaths.p50[y], r.pctPaths.p75[y], r.pctPaths.p90[y]));
  add();
  add('Support', 'Enveloppe', 'Allocation (%)', 'Rendement brut (%/an)', 'Frais (%/an)', 'Volatilité (%/an)', 'Source', 'Versé (€)', 'Valeur médiane (€)');
  for (const { product: p, assumption: a, fee } of s.plan.resolved) {
    add(p.name, VEHICLES[p.vehicle].short, s.allocations[p.id], a.mu * 100, fee * 100, a.sigma * 100, a.source, r.lines[p.id].invested, r.lines[p.id].p50);
  }
  add();
  add('Enveloppe', 'Versé (€)', 'Valeur médiane (€)', 'IR médian (€)', 'PS médians (€)', 'Net médian (€)');
  for (const v of VEHICLE_ORDER) {
    const d = r.vehicles[v];
    if (d) add(VEHICLES[v].label, d.invested, d.value, d.ir, d.ps, d.net);
  }
  return `﻿${rows.join('\r\n')}\r\n`;
}

export function downloadCsv(s, r) {
  const blob = new Blob([buildCsv(s, r)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `SimuPortefeuille_${s.horizon}ans_${r.meta.seed}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Lien de partage : paramètres + graine encodés dans le fragment (jamais envoyés au serveur). */
export function shareUrl(s, seed) {
  const url = new URL(window.location.href);
  url.hash = `p=${encodeParams({ ...s, seed })}&run=1`;
  return url.toString();
}
