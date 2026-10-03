import { fmt } from './format.js';

const charts = {};

export function renderGauge(probLoss) {
  const ctx = document.getElementById('gauge-chart').getContext('2d');
  if (charts.gauge) { charts.gauge.destroy(); charts.gauge = null; }

  const pct = Math.min(Math.max(probLoss, 0), 1);
  const color = pct < 0.1 ? '#16a34a' : pct < 0.3 ? '#d97706' : '#dc2626';

  charts.gauge = new Chart(ctx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [pct * 100, (1 - pct) * 100],
        backgroundColor: [color, '#e2e8f0'],
        borderWidth: 0,
        circumference: 180,
        rotation: 270,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      cutout: '70%',
      animation: { duration: 600 },
    },
  });

  const label = pct < 0.05 ? '🟢 Très faible'
    : pct < 0.15 ? '🟡 Faible'
    : pct < 0.30 ? '🟠 Modéré'
    : pct < 0.50 ? '🔴 Élevé'
    : '⛔ Très élevé';
  document.getElementById('gauge-label').textContent = label;
}

export function renderHistogram(finalValues, capital) {
  const ctx = document.getElementById('dist-chart').getContext('2d');
  if (charts.dist) { charts.dist.destroy(); charts.dist = null; }

  const min = finalValues[0];
  const max = finalValues[finalValues.length - 1];
  if (max === min) return;

  const BINS = 50;
  const binSize = (max - min) / BINS;
  const counts = new Array(BINS).fill(0);
  const labels = Array.from({ length: BINS }, (_, i) => min + i * binSize);

  finalValues.forEach(v => {
    const idx = Math.min(BINS - 1, Math.floor((v - min) / binSize));
    counts[idx]++;
  });

  const colors = labels.map(l => (l + binSize / 2) < capital ? 'rgba(220,38,38,.7)' : 'rgba(37,99,235,.6)');

  charts.dist = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.map(l => fmt(l)),
      datasets: [{ label: 'Simulations', data: counts, backgroundColor: colors, borderWidth: 0, borderRadius: 2 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.parsed.y} simulations`,
            title: ctx => `Valeur ≈ ${ctx[0].label}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { maxTicksLimit: 7, callback: (v, i) => i % 7 === 0 ? fmt(labels[i]) : '', font: { size: 9 } },
          grid: { display: false },
        },
        y: { ticks: { font: { size: 9 } }, grid: { color: '#f1f5f9' } },
      },
    },
  });
}

export function renderFanChart(pctPaths, horizon, capital) {
  const ctx = document.getElementById('fan-chart').getContext('2d');
  if (charts.fan) { charts.fan.destroy(); charts.fan = null; }

  const labels = Array.from({ length: horizon + 1 }, (_, i) => `An ${i}`);

  charts.fan = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: '10e pct.', data: pctPaths.p10, borderColor: 'rgba(220,38,38,.8)', backgroundColor: 'rgba(0,0,0,0)', borderWidth: 1.5, borderDash: [4, 3], pointRadius: 0, fill: false, tension: 0.3 },
        { label: '25e pct.', data: pctPaths.p25, borderColor: 'rgba(249,115,22,.6)', backgroundColor: 'rgba(249,115,22,.08)', borderWidth: 1, pointRadius: 0, fill: '+1', tension: 0.3 },
        { label: 'Médiane', data: pctPaths.p50, borderColor: 'rgba(37,99,235,1)', backgroundColor: 'rgba(37,99,235,.07)', borderWidth: 2.5, pointRadius: 3, fill: false, tension: 0.3 },
        { label: '75e pct.', data: pctPaths.p75, borderColor: 'rgba(34,197,94,.6)', backgroundColor: 'rgba(34,197,94,.08)', borderWidth: 1, pointRadius: 0, fill: '-1', tension: 0.3 },
        { label: '90e pct.', data: pctPaths.p90, borderColor: 'rgba(22,163,74,.8)', backgroundColor: 'rgba(0,0,0,0)', borderWidth: 1.5, borderDash: [4, 3], pointRadius: 0, fill: false, tension: 0.3 },
        { label: 'Capital initial', data: Array(horizon + 1).fill(capital), borderColor: 'rgba(100,116,139,.45)', borderWidth: 1, borderDash: [6, 4], pointRadius: 0, fill: false },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'bottom', labels: { font: { size: 10 }, boxWidth: 18 } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } },
      },
      scales: {
        x: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 9 } } },
        y: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 9 }, callback: v => v >= 1000 ? `${(v / 1000).toFixed(0)}k €` : `${v} €` } },
      },
    },
  });
}

export function renderDonut(allocations, products) {
  const ctx = document.getElementById('donut-chart').getContext('2d');
  if (charts.donut) { charts.donut.destroy(); charts.donut = null; }

  const PALETTE = ['#2563eb', '#7c3aed', '#16a34a', '#d97706', '#0891b2', '#dc2626', '#0d9488', '#9333ea', '#f59e0b', '#6366f1', '#ef4444', '#84cc16'];
  const labels = [], data = [], bgColors = [];
  let ci = 0;

  for (const [id, pct] of Object.entries(allocations)) {
    if (!pct) continue;
    const p = products.find(x => x.id === id);
    if (!p) continue;
    labels.push(`${p.icon} ${p.name}`);
    data.push(pct);
    bgColors.push(PALETTE[ci++ % PALETTE.length]);
  }

  charts.donut = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: bgColors, borderWidth: 2, borderColor: '#fff' }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.parsed} %` } },
      },
      cutout: '55%',
    },
  });
}

/** Redimensionne tous les charts actifs — appelé après affichage d'un onglet caché. */
export function resizeCharts() {
  Object.values(charts).forEach(c => { if (c) c.resize(); });
}

/** Retourne l'instance Chart.js active pour une clé donnée (gauge/dist/fan/donut), ou null si aucun chart n'est actif sous cette clé. */
export function getChartInstance(key) {
  return charts[key] || null;
}
