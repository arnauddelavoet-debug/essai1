import { state } from '../state.js';
import { VEHICLES, VEHICLE_ORDER } from '../data/vehicles.js';
import { PROFILES } from '../data/profiles.js';
import { FISCAL } from '../config/fiscal.js';
import { ASSUMPTION_MODES, portfolioStats } from '../engine/assumptions.js';
import { allocationWarnings } from '../engine/allocation.js';
import { CATALOG } from '../data/catalog.js';
import { VERSION } from '../version.js';
import { fmtPdf, fmtPctPdf } from './format.js';
import { chartImage } from './charts.js';
import { riskLevel } from './results.js';

// jsPDF (≈ 350 ko) n'est chargé qu'au premier export, avec contrôle
// d'intégrité (SRI) : la page reste légère pour qui n'exporte pas.
const LIBS = [
  { src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', integrity: 'sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk' },
  { src: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js', integrity: 'sha384-fCAW/rDWORTbQXSiB7mOg0QtQ5c+r0f544y6XoKjuVva0nMBlCpNUjiFeG5iMdS3' },
];

function loadScript({ src, integrity }) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.integrity = integrity;
    s.crossOrigin = 'anonymous';
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Chargement impossible : ${src}`));
    document.head.append(s);
  });
}

let loading = null;
export function ensurePdfLibs() {
  if (window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable) return Promise.resolve();
  loading ||= LIBS.reduce((p, lib) => p.then(() => loadScript(lib)), Promise.resolve()).catch(e => { loading = null; throw e; });
  return loading;
}

async function sha256(message) {
  try {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
    return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return 'indisponible';
  }
}

/** Remplace les caractères hors WinAnsi (polices standard jsPDF). */
const ascii = t => String(t).replace(/[  ]/g, ' ').replace(/[μ]/g, 'mu').replace(/[σ]/g, 'sigma').replace(/[−–]/g, '-').replace(/[’]/g, "'").replace(/[≈]/g, '~').replace(/[≥]/g, '>=').replace(/[≤]/g, '<=').replace(/[^\x20-\x7E -ÿ€]/g, '');

/**
 * Génère le rapport PDF. `captureCharts` doit redessiner les graphiques
 * en thème clair et renvoyer leurs images (voir app.js).
 */
export async function generatePDF(captureCharts) {
  await ensurePdfLibs();
  const { jsPDF } = window.jspdf;
  const s = state;
  const r = s.simResults;
  const stats = portfolioStats(s.plan.lines, s.plan.correlation);
  const images = await captureCharts();

  const docId = `${Date.now().toString(36)}-${r.meta.seed.toString(36)}`.toUpperCase();
  const fingerprint = await sha256(JSON.stringify({ v: VERSION, seed: r.meta.seed, capital: s.capital, monthly: s.monthly, horizon: s.horizon, alloc: s.allocations, p50: r.net.p50 }));

  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  doc.setProperties({ title: 'SimuPortefeuille - Rapport de simulation', subject: 'Simulation Monte Carlo de portefeuille', author: 'SimuPortefeuille', creator: `SimuPortefeuille ${VERSION}` });
  doc.setLanguage('fr-FR');

  const W = 210, H = 297, ML = 14, CW = W - 2 * ML;
  const NAVY = [29, 78, 216], GOLD = [197, 160, 40], WHITE = [255, 255, 255], LIGHT = [244, 246, 250], MUTED = [91, 107, 130], TEXT = [15, 23, 42];
  const header = () => {
    doc.setFillColor(...NAVY); doc.rect(0, 0, W, 15, 'F');
    doc.setFillColor(...GOLD); doc.rect(0, 15, W, 1, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...WHITE);
    doc.text('SimuPortefeuille', ML, 10);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text('Rapport de simulation', W / 2, 10, { align: 'center' });
    doc.text(dateStr, W - ML, 10, { align: 'right' });
  };
  const footer = () => {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(7); doc.setTextColor(...MUTED);
    doc.text('Outil pedagogique - ne constitue pas un conseil en investissement.', W / 2, H - 8, { align: 'center' });
    doc.text(`Page ${doc.getCurrentPageInfo().pageNumber}`, W - ML, H - 4, { align: 'right' });
    doc.text(`Ref. ${docId} - v${VERSION}`, ML, H - 4);
  };
  const newPage = () => { doc.addPage(); header(); footer(); return 22; };
  const ensure = (y, needed) => (y + needed > H - 16 ? newPage() : y);
  const section = (y, text) => {
    y = ensure(y, 14);
    doc.setFillColor(...NAVY); doc.rect(ML, y, CW, 7, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...WHITE);
    doc.text(ascii(text), ML + 3, y + 5);
    return y + 10;
  };
  const table = (y, head, body, opts = {}) => {
    doc.autoTable({
      startY: y, head: head ? [head.map(ascii)] : undefined, body: body.map(row => row.map(ascii)),
      theme: 'grid', margin: { left: ML, right: ML, top: 22, bottom: 16 },
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { fontSize: 7.5, textColor: TEXT }, alternateRowStyles: { fillColor: LIGHT },
      didDrawPage: () => { header(); footer(); },
      ...opts,
    });
    return doc.lastAutoTable.finalY + 7;
  };
  const para = (y, text, size = 8) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(size); doc.setTextColor(...TEXT);
    const lines = doc.splitTextToSize(ascii(text), CW);
    y = ensure(y, lines.length * size * 0.45);
    doc.text(lines, ML, y);
    return y + lines.length * size * 0.42 + 2;
  };

  // ── Page 1 : synthèse ──
  header(); footer();
  doc.setFillColor(...NAVY); doc.roundedRect(ML, 21, CW, 30, 3, 3, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(...GOLD);
  doc.text('RAPPORT DE SIMULATION', W / 2, 33, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...WHITE);
  doc.text(ascii(`Monte Carlo correle - fiscalite francaise ${FISCAL.millesime} - ${r.meta.nSims.toLocaleString('fr-FR')} scenarios`), W / 2, 41, { align: 'center' });
  doc.text(ascii(`Genere le ${dateStr}`), W / 2, 47, { align: 'center' });

  let y = 58;
  const lvl = riskLevel(r.probLoss);
  const kpis = [
    ['Valeur nette mediane', fmtPdf(r.net.p50), [29, 78, 216]],
    ['Total verse', fmtPdf(r.invested), [71, 85, 105]],
    ['Probabilite de perte', `${fmtPctPdf(r.probLoss)} (${lvl.label})`, [185, 28, 28]],
    ['Rendement annualise net median', `${fmtPctPdf(r.irr.p50)}/an`, [21, 128, 61]],
    ['Scenario defavorable (P10)', fmtPdf(r.net.p10), [180, 83, 9]],
    ['Scenario favorable (P90)', fmtPdf(r.net.p90), [21, 128, 61]],
  ];
  const bw = (CW - 6) / 2, bh = 18;
  kpis.forEach(([label, value, color], i) => {
    const bx = ML + (i % 2) * (bw + 6), by = y + Math.floor(i / 2) * (bh + 4);
    doc.setFillColor(...color); doc.roundedRect(bx, by, bw, bh, 2.5, 2.5, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...WHITE);
    doc.text(ascii(label), bx + 4, by + 6);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5);
    doc.text(ascii(value), bx + 4, by + 14);
  });
  y += 3 * (bh + 4) + 4;
  y = para(y, `En euros d'aujourd'hui (inflation ${fmtPctPdf(s.inflation)}/an), la valeur nette mediane represente ${fmtPdf(r.netReal.p50)}. Dans 8 cas sur 10, la valeur nette finale se situe entre ${fmtPdf(r.net.p10)} et ${fmtPdf(r.net.p90)}. Baisse temporaire mediane en cours de route : ${fmtPctPdf(r.drawdown.p50, 0)}.`);
  if (r.probTarget !== null) y = para(y, `Probabilite d'atteindre l'objectif de ${fmtPdf(s.target)}${s.targetReal ? " (euros d'aujourd'hui)" : ''} : ${fmtPctPdf(r.probTarget, 0)}.`);

  y = section(y + 2, 'PARAMETRES');
  y = table(y, ['Parametre', 'Valeur'], [
    ['Capital initial / versement mensuel', `${fmtPdf(s.capital)} / ${fmtPdf(s.monthly)} (indexation ${fmtPctPdf(s.contributionGrowth)}/an)`],
    ['Horizon', `${s.horizon} ans`],
    ['Profil declare', PROFILES[s.risk].label],
    ['Fiscalite', `TMI ${s.tmi} % (retraite ${s.tmiRetraite} %), ${s.couple ? 'couple' : 'personne seule'}, anciennete PEA ${s.peaAnciennete} an(s), AV ${s.avAnciennete} an(s)`],
    ['Hypotheses de rendement', ASSUMPTION_MODES[s.assumptionMode]],
    ['Portefeuille (analytique, net de frais)', `rendement ${fmtPctPdf(stats.mu)}/an, volatilite ${fmtPctPdf(stats.sigma)}`],
    ['Modele', `${r.meta.distribution === 'student' ? `Student (nu = ${r.meta.df})` : 'Loi normale'}, pas mensuel, reequilibrage ${r.meta.rebalancing === 'annual' ? 'annuel' : 'aucun'}, graine ${r.meta.seed}`],
  ], { columnStyles: { 0: { fontStyle: 'bold', cellWidth: 70 } } });

  // ── Page 2 : graphiques ──
  y = newPage();
  y = section(y, 'TRAJECTOIRES POSSIBLES (VALEUR BRUTE, PERCENTILES)');
  if (images.fan) { const h = Math.min(CW * images.fan.ratio, 85); doc.addImage(images.fan.data, 'PNG', ML, y, CW, h); y += h + 4; }
  y = section(y, 'DISTRIBUTION DE LA VALEUR NETTE FINALE ET REPARTITION');
  if (images.dist) { const w = CW * 0.58, h = Math.min(w * images.dist.ratio, 70); doc.addImage(images.dist.data, 'PNG', ML, y, w, h); }
  if (images.donut) { const w = CW * 0.38, h = Math.min(w * images.donut.ratio, 70); doc.addImage(images.donut.data, 'PNG', ML + CW * 0.62, y, w, h); }
  y += 74;
  y = section(y, 'PERCENTILES DE VALEUR FINALE');
  y = table(y, ['Percentile', 'Brut', 'Net', "Net en euros d'aujourd'hui"],
    ['p5', 'p10', 'p25', 'p50', 'p75', 'p90', 'p95'].map(k => [k.toUpperCase(), fmtPdf(r.gross[k]), fmtPdf(r.net[k]), fmtPdf(r.netReal[k])]),
    { columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } } });

  // ── Page 3 : allocation et fiscalité ──
  y = newPage();
  y = section(y, 'ALLOCATION ET HYPOTHESES PAR SUPPORT');
  y = table(y, ['Support', 'Env.', 'Alloc.', 'Rdt brut', 'Frais', 'Vol.', 'Source', 'Verse', 'Val. mediane'],
    s.plan.resolved.map(({ product: p, assumption: a, fee }) => [
      p.name, VEHICLES[p.vehicle].short, `${s.allocations[p.id]} %`, fmtPctPdf(a.mu), fmtPctPdf(fee, 2), a.sigma > 0 ? fmtPctPdf(a.sigma) : 'garanti',
      a.source, fmtPdf(r.lines[p.id].invested), fmtPdf(r.lines[p.id].p50),
    ]), { styles: { fontSize: 6.8 }, columnStyles: { 0: { cellWidth: 45 } } });
  y = section(y, 'FISCALITE PAR ENVELOPPE (VALEURS MEDIANES)');
  y = table(y, ['Enveloppe', 'Verse', 'Valeur finale', 'IR', 'PS', 'Net'],
    VEHICLE_ORDER.filter(v => r.vehicles[v]).map(v => {
      const d = r.vehicles[v];
      return [VEHICLES[v].label, fmtPdf(d.invested), fmtPdf(d.value), d.ir > 0.5 ? fmtPdf(d.ir) : '-', d.ps > 0.5 ? fmtPdf(d.ps) : '-', fmtPdf(d.net)];
    }));
  y = para(y, `Impots de sortie medians : ${fmtPdf(r.taxes.exitP50)}. Frais de gestion cumules medians : ${fmtPdf(r.fees.managementP50)}${r.fees.entry > 0 ? `, frais sur versements : ${fmtPdf(r.fees.entry)}` : ''}.${r.taxes.lifetimeP50 > 0 ? ` Impots payes en cours de route (revenus fonciers) : ${fmtPdf(r.taxes.lifetimeP50)}.` : ''}${r.taxes.perSaving > 0 ? ` Economie d'impot PER a l'entree : ${fmtPdf(r.taxes.perSaving)}.` : ''} Les medianes par colonne ne s'additionnent pas exactement (la mediane d'une somme n'est pas la somme des medianes).`, 7.5);

  const warnings = allocationWarnings(s, CATALOG, stats);
  if (warnings.length) {
    y = section(y + 2, 'POINTS D\'ATTENTION');
    for (const w of warnings) y = para(y, `- ${w.text}`, 7.5);
  }

  // ── Page 4 : méthodologie ──
  y = newPage();
  y = section(y, 'METHODOLOGIE ET AVERTISSEMENTS');
  const notes = [
    'Document produit a titre informatif et pedagogique ; il ne constitue pas un conseil en investissement au sens de la directive MIF II. Les performances passees ne prejugent pas des performances futures.',
    'Chaque support suit un mouvement brownien geometrique a pas mensuel, avec des chocs correles (decomposition de Cholesky). Livrets et fonds en euros evoluent a taux fixe. Les frais sont deduits du rendement chaque mois.',
    'La fiscalite de sortie est calculee scenario par scenario, par enveloppe, sur le gain reel de chaque scenario (rachat total a l\'horizon), selon les regles en vigueur en 2026 : PS 18,6 % (PEA, CTO, PER, crypto) ou 17,2 % (assurance-vie, revenus fonciers), PFU 12,8 % d\'IR, abattement AV de 4 600 / 9 200 EUR apres 8 ans.',
    `Hypotheses de rendement : ${ASSUMPTION_MODES[s.assumptionMode]}.${s.market ? ` Donnees de marche du ${new Date(s.market.generatedAt).toLocaleDateString('fr-FR')} (Yahoo Finance, Eurostat, BCE).` : ''} Ces parametres sont des estimations et peuvent differer fortement de la realite.`,
    'Limites : volatilites et correlations constantes, pas de retraits intermediaires, pas d\'effet de progressivite du bareme sur la sortie du PER, prelevements sociaux annuels des fonds en euros non modelises.',
    'Avant toute decision, consultez un conseiller en investissements financiers (CIF) ou un conseiller en gestion de patrimoine.',
  ];
  y = table(y, null, notes.map((n, i) => [`${i + 1}.`, n]), { theme: 'plain', columnStyles: { 0: { cellWidth: 8, fontStyle: 'bold' } } });

  y = section(ensure(y, 50), 'TRACABILITE');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...TEXT);
  doc.text(ascii(`Reference : ${docId} - SimuPortefeuille v${VERSION} - fiscalite ${FISCAL.millesime}`), ML, y + 2);
  doc.text(ascii(`Graine aleatoire : ${r.meta.seed} (reproduit exactement ces resultats avec les memes parametres)`), ML, y + 7);
  doc.text('Empreinte SHA-256 des parametres et du resultat :', ML, y + 12);
  doc.setFont('courier', 'normal');
  doc.text(fingerprint.slice(0, 32), ML, y + 17);
  doc.text(fingerprint.slice(32), ML, y + 21);
  doc.setFont('helvetica', 'normal');
  doc.text(ascii(`Genere le ${now.toISOString().replace('T', ' ').slice(0, 19)} UTC dans le navigateur - aucune donnee personnelle transmise.`), ML, y + 27);

  doc.save(`SimuPortefeuille_${s.horizon}ans_${docId}.pdf`);
}
