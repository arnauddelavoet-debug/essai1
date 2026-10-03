import { fmt, fmtCompact } from './format.js';

// Graphiques Chart.js (chargé globalement via <script defer>). Les
// couleurs sont lues dans les variables CSS pour suivre le thème.

const charts = {};

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function alpha(color, a) {
  const hex = color.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return color;
  const n = parseInt(hex, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function theme() {
  return {
    text: css('--text'), muted: css('--muted'), grid: alpha(css('--border-strong'), 0.5),
    primary: css('--primary'), success: css('--success'), warning: css('--warning'), danger: css('--danger'),
    surface: css('--surface'), border: css('--border'),
  };
}

function replace(key, canvasId, config) {
  if (charts[key]) charts[key].destroy();
  if (typeof window.Chart === 'undefined') return null;
  const t = theme();
  window.Chart.defaults.color = t.muted;
  window.Chart.defaults.font.family = css('--font') || 'system-ui';
  charts[key] = new window.Chart(document.getElementById(canvasId), config);
  return charts[key];
}

export function chartsAvailable() {
  return typeof window.Chart !== 'undefined';
}

export function renderGauge(probLoss) {
  const t = theme();
  const p = Math.min(Math.max(probLoss, 0), 1);
  const color = p < 0.1 ? t.success : p < 0.3 ? t.warning : t.danger;
  replace('gauge', 'gauge-chart', {
    type: 'doughnut',
    data: { datasets: [{ data: [p * 100, 100 - p * 100], backgroundColor: [color, t.border], borderWidth: 0, circumference: 180, rotation: 270 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '72%', plugins: { legend: { display: false }, tooltip: { enabled: false } }, animation: { duration: 500 } },
  });
}

/**
 * Éventail des trajectoires (percentiles annuels de la valeur brute) et
 * total versé cumulé. `deflator(year)` convertit en euros constants.
 */
export function renderFanChart(paths, investedPath, deflator = () => 1) {
  const t = theme();
  const years = paths.p50.length;
  const labels = Array.from({ length: years }, (_, i) => (i === 0 ? 'Départ' : `An ${i}`));
  const d = arr => arr.map((v, i) => v / deflator(i));
  const band = (label, data, fill, color, extra = {}) => ({ label, data: d(data), borderColor: color, backgroundColor: alpha(color, 0.12), borderWidth: 1, pointRadius: 0, fill, tension: 0.25, ...extra });
  replace('fan', 'fan-chart', {
    type: 'line',
    data: {
      labels,
      datasets: [
        band('10e percentile', paths.p10, false, t.danger, { borderDash: [4, 3], borderWidth: 1.5 }),
        band('25e percentile', paths.p25, '-1', t.warning),
        band('Médiane', paths.p50, false, t.primary, { borderWidth: 2.5, backgroundColor: 'transparent' }),
        band('75e percentile', paths.p75, '-2', t.success),
        band('90e percentile', paths.p90, '-1', t.success, { borderDash: [4, 3], borderWidth: 1.5 }),
        { label: 'Total versé', data: d(investedPath), borderColor: t.muted, borderDash: [6, 4], borderWidth: 1.2, pointRadius: 0, fill: false },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 350 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 14, font: { size: 11 } } },
        tooltip: { callbacks: { label: c => `${c.dataset.label} : ${fmt(c.parsed.y)}` } },
      },
      scales: {
        x: { grid: { color: t.grid }, ticks: { maxTicksLimit: 12 } },
        y: { grid: { color: t.grid }, ticks: { callback: v => fmtCompact(v) } },
      },
    },
  });
}

/** Histogramme des valeurs nettes finales ; en rouge, les scénarios sous le total versé. */
export function renderHistogram(sortedValues, invested) {
  const t = theme();
  const n = sortedValues.length;
  // Bornes à 0,5 % / 99,5 % pour que quelques scénarios extrêmes n'écrasent pas le graphique.
  const lo = sortedValues[Math.floor(n * 0.005)];
  const hi = sortedValues[Math.min(n - 1, Math.floor(n * 0.995))];
  if (!(hi > lo)) { if (charts.dist) charts.dist.destroy(); return; }
  const BINS = 40;
  const size = (hi - lo) / BINS;
  const counts = new Array(BINS).fill(0);
  // Les valeurs hors bornes sont exclues (et non empilées dans les
  // classes extrêmes, ce qui y créerait de faux pics).
  for (let i = 0; i < n; i++) {
    const v = sortedValues[i];
    if (v < lo || v > hi) continue;
    counts[Math.min(BINS - 1, Math.floor((v - lo) / size))]++;
  }
  const centers = counts.map((_, i) => lo + (i + 0.5) * size);
  replace('dist', 'dist-chart', {
    type: 'bar',
    data: {
      labels: centers.map(c => fmtCompact(c)),
      datasets: [{ data: counts.map(c => (c / n) * 100), backgroundColor: centers.map(c => (c < invested ? alpha(t.danger, 0.75) : alpha(t.primary, 0.65))), borderWidth: 0, borderRadius: 2, barPercentage: 1, categoryPercentage: 1 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 350 },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: c => `Valeur nette ≈ ${fmt(centers[c[0].dataIndex])}`, label: c => `${c.parsed.y.toFixed(1).replace('.', ',')} % des scénarios` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 6, maxRotation: 0 } },
        y: { grid: { color: t.grid }, ticks: { callback: v => `${v} %` } },
      },
    },
  });
}

/** Anneau de répartition : items = [{ label, value, color }]. */
export function renderDonut(items) {
  const t = theme();
  replace('donut', 'donut-chart', {
    type: 'doughnut',
    data: { labels: items.map(i => i.label), datasets: [{ data: items.map(i => i.value), backgroundColor: items.map(i => i.color), borderColor: t.surface, borderWidth: 2 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '58%', animation: { duration: 350 },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10.5 } } },
        tooltip: { callbacks: { label: c => `${c.label} : ${c.parsed.toLocaleString('fr-FR')} %` } },
      },
    },
  });
}

export function resizeCharts() {
  Object.values(charts).forEach(c => c && c.resize());
}

/** Image PNG d'un graphique (pour le PDF), fond opaque. */
export function chartImage(key) {
  const c = charts[key];
  if (!c) return null;
  const src = c.canvas;
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(src, 0, 0);
  return { data: out.toDataURL('image/png'), ratio: src.height / src.width };
}

export const PALETTE = ['#1d4ed8', '#7c3aed', '#0f766e', '#c2410c', '#be185d', '#15803d', '#a16207', '#0e7490', '#4338ca', '#b91c1c', '#475569', '#65a30d', '#9333ea', '#0891b2', '#d97706', '#db2777'];
