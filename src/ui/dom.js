// Petits utilitaires DOM. Tout texte dynamique passe par textContent :
// aucune donnée (catalogue, marché, URL partagée) n'est injectée en HTML.

/**
 * Crée un élément : el('td', { className: 'num' }, 'texte', autreNoeud).
 * Les clés `dataset`, `style` et `on*` (écouteurs) sont gérées.
 */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in node && k !== 'list') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

/**
 * Remplace le contenu d'un nœud. Contrairement à replaceChildren natif,
 * ignore null/undefined/false et aplatit les tableaux (sinon convertis
 * en texte « null » ou « [object HTMLElement] »).
 */
export function fill(node, ...children) {
  node.replaceChildren(...children.flat(Infinity)
    .filter(c => c !== null && c !== undefined && c !== false)
    .map(c => (c instanceof Node ? c : document.createTextNode(String(c)))));
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Bouton « ? » d'aide contextuelle. */
export function infoButton(tip) {
  return el('button', { type: 'button', className: 'info', dataset: { tip }, 'aria-label': `Aide : ${tip}` }, '?');
}

let toastTimer = null;
/** Message temporaire en bas d'écran. */
export function toast(message, kind = 'info', duration = 5000) {
  const t = $('#toast');
  t.textContent = message;
  t.className = `toast ${kind}`;
  t.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, duration);
}

export function showLoading(text = 'Simulation en cours…') {
  $('#loading-text').textContent = text;
  $('#progress-bar').style.width = '0%';
  $('#loading-overlay').hidden = false;
}

export function setProgress(fraction) {
  $('#progress-bar').style.width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
}

export function hideLoading() {
  $('#loading-overlay').hidden = true;
}

/**
 * Info-bulles accessibles pour tous les éléments [data-tip] : au survol
 * et au focus clavier, positionnées pour rester dans la fenêtre.
 */
export function initTooltips() {
  let tip = null;
  const show = target => {
    hide();
    tip = el('div', { className: 'tooltip', role: 'tooltip' }, target.dataset.tip);
    document.body.append(tip);
    const r = target.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
    let top = r.top - h - 8;
    if (top < 8) top = r.bottom + 8;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };
  const hide = () => { if (tip) { tip.remove(); tip = null; } };
  const find = e => e.target instanceof Element ? e.target.closest('[data-tip]') : null;
  document.addEventListener('mouseover', e => { const t = find(e); if (t) show(t); });
  document.addEventListener('mouseout', e => { if (find(e)) hide(); });
  document.addEventListener('focusin', e => { const t = find(e); if (t) show(t); });
  document.addEventListener('focusout', hide);
  document.addEventListener('click', e => { const t = find(e); if (t) { e.preventDefault(); show(t); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  window.addEventListener('scroll', hide, { passive: true });
}
