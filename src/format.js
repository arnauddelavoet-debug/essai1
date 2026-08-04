/**
 * Formate un nombre en euros (fr-FR) — pour l'interface web.
 */
export function fmt(n) {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
}

/**
 * Formate un ratio [0..1] en pourcentage — pour l'interface web.
 */
export function fmtPct(p) {
  if (!Number.isFinite(p)) return '—';
  return (p * 100).toFixed(1) + ' %';
}

/**
 * Formateurs PDF-safe : séparateurs ASCII uniquement (pas d'espace insécable)
 * jsPDF avec polices Helvetica ne supporte pas les caractères Unicode avancés.
 */
export function fmtPdf(n) {
  if (!Number.isFinite(n)) return '-';
  const rounded = Math.round(n);
  const abs = Math.abs(rounded);
  const str = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (rounded < 0 ? '-' : '') + str + ' EUR';
}

export function fmtPctPdf(p) {
  if (!Number.isFinite(p)) return '-';
  return (p * 100).toFixed(1) + '%';
}
