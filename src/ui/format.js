// Formatage des nombres. Écran : conventions françaises (virgule
// décimale, espaces insécables). PDF : caractères ASCII uniquement, les
// polices standard de jsPDF ne couvrant pas les espaces fines insécables.

const NBSP = ' ';
const eurFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

/** Montant en euros arrondi à l'euro : « 12 345 € ». */
export function fmt(n) {
  if (!Number.isFinite(n)) return '—';
  return `${eurFormatter.format(Math.round(n))}${NBSP}€`;
}

/** Montant abrégé pour les axes de graphiques : « 850 € », « 12 k€ », « 1,2 M€ ». */
export function fmtCompact(n) {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}${NBSP}M€`;
  if (abs >= 1e3) return `${(n / 1e3).toLocaleString('fr-FR', { maximumFractionDigits: 0 })}${NBSP}k€`;
  return `${Math.round(n)}${NBSP}€`;
}

/** Ratio [0..1] en pourcentage : « 15,3 % ». */
export function fmtPct(p, digits = 1) {
  if (!Number.isFinite(p)) return '—';
  return `${(p * 100).toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}${NBSP}%`;
}

/** Pourcentage signé : « +4,2 % », « −1,0 % ». */
export function fmtPctSigned(p, digits = 1) {
  if (!Number.isFinite(p)) return '—';
  const s = fmtPct(Math.abs(p), digits);
  return p > 0 ? `+${s}` : p < 0 ? `−${s}` : s;
}

/** Montant PDF : « 1 234 567 EUR » (séparateur espace ASCII). */
export function fmtPdf(n) {
  if (!Number.isFinite(n)) return '-';
  const rounded = Math.round(n);
  const str = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${rounded < 0 ? '-' : ''}${str} EUR`;
}

/** Pourcentage PDF : « 12,8 % » (ASCII). */
export function fmtPctPdf(p, digits = 1) {
  if (!Number.isFinite(p)) return '-';
  return `${(p * 100).toFixed(digits).replace('.', ',')} %`;
}

/** Date ISO (AAAA-MM ou AAAA-MM-JJ ou horodatage) en français court. */
export function fmtDate(iso) {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})$/.exec(iso);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, 1)).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}
