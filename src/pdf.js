import { PRODUCTS, PROFILE_SIGMA_RANGES } from './products.js';
import { blendedParams } from './simulation.js';
import { CORRELATIONS } from './products.js';
import { fmtPdf, fmtPctPdf } from './format.js';
import { showError, showLoading, hideLoading } from './errors.js';
import { resizeCharts } from './charts.js';
import { state } from './state.js';
import { activateTab } from './ui.js';

const INFLATION = 0.022;

async function sha256(message) {
  try {
    const buf = new TextEncoder().encode(message);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return 'unavailable';
  }
}

function captureChart(canvasId) {
  try {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    const hiddenPanel = canvas.closest('.tab-panel[hidden]');
    if (hiddenPanel) {
      hiddenPanel.removeAttribute('hidden');
      resizeCharts();
    }

    const dataUrl = canvas.toDataURL('image/png', 1.0);

    if (hiddenPanel) hiddenPanel.setAttribute('hidden', '');
    return dataUrl;
  } catch {
    return null;
  }
}

export async function generatePDF() {
  if (!state.simResults) { showError('Lancez d\'abord une simulation.'); return; }
  if (!window.jspdf) { showError('jsPDF non chargé — vérifiez votre connexion.'); return; }

  showLoading();
  await new Promise(r => setTimeout(r, 80));

  try {
    const { jsPDF } = window.jspdf;
    const { capital, horizon, mensuel, risk, tmi, simResults } = state;
    const { p10, p25, p50, p75, p90, netP10, netP50, probLoss, probLossInvested, totalInvested, fiscalByVehicle, productMedians } = simResults;
    const { mu, sigma } = blendedParams(state.allocations, PRODUCTS, CORRELATIONS);

    const docId = Date.now().toString(36).toUpperCase();
    const fingerprint = await sha256(JSON.stringify({ capital, horizon, mensuel, risk, tmi, p50, netP50, mu, sigma, ts: docId }));

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', putOnlyUsedFonts: true, compress: true });

    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    doc.setProperties({
      title: 'SimuPortefeuille — Rapport de simulation',
      subject: 'Simulation Monte Carlo de portefeuille financier',
      author: 'SimuPortefeuille',
      keywords: 'simulation, portefeuille, Monte Carlo, MBG, risque, finance, fiscalite',
      creator: 'SimuPortefeuille — jsPDF 2.5.1',
    });
    doc.setLanguage('fr-FR');

    const W = 210, H = 297, ML = 14, MR = 14, CW = W - ML - MR;
    const NAVY = [28, 48, 83], GOLD = [197, 160, 40], WHITE = [255, 255, 255];
    const LIGHT = [245, 247, 250], MUTED = [100, 116, 139], TEXT = [30, 41, 59], RED = [184, 50, 50];

    let page = 1;

    function header() {
      doc.setFillColor(...NAVY);
      doc.rect(0, 0, W, 16, 'F');
      doc.setFillColor(...GOLD);
      doc.rect(0, 16, W, 1.2, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...WHITE);
      doc.text('SimuPortefeuille', ML, 11);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      doc.text('Rapport de simulation financière', W / 2, 11, { align: 'center' });
      doc.text(dateStr, W - MR, 11, { align: 'right' });
    }

    function footer(pg) {
      doc.setFillColor(...LIGHT);
      doc.rect(0, H - 13, W, 13, 'F');
      doc.setDrawColor(220, 228, 240); doc.setLineWidth(0.3);
      doc.line(0, H - 13, W, H - 13);
      doc.setFont('helvetica', 'italic'); doc.setFontSize(7); doc.setTextColor(...MUTED);
      doc.text('Simulation à titre indicatif — pas un conseil en investissement.', W / 2, H - 7, { align: 'center' });
      doc.text(`Page ${pg}`, W - MR, H - 4, { align: 'right' });
      doc.text(`Réf. ${docId}`, ML, H - 4);
    }

    function checkY(y, needed) {
      if (y + needed > H - 18) {
        doc.addPage(); page++;
        header(); footer(page);
        return 22;
      }
      return y;
    }

    function sectionTitle(y, text) {
      y = checkY(y, 12);
      doc.setFillColor(...NAVY);
      doc.rect(ML, y, CW, 7, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...WHITE);
      doc.text(text, ML + 3, y + 5);
      return y + 10;
    }

    // ── PAGE 1 — Couverture ──
    header(); footer(1);

    doc.setFillColor(...NAVY);
    doc.roundedRect(ML, 22, CW, 38, 4, 4, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...GOLD);
    doc.text('RAPPORT DE SIMULATION', W / 2, 36, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...WHITE);
    doc.text('Portefeuille financier — Analyse Monte Carlo corrélée', W / 2, 44, { align: 'center' });
    doc.text(`Généré le ${dateStr}`, W / 2, 51, { align: 'center' });

    let y = 68;
    y = sectionTitle(y, 'PARAMÈTRES DE LA SIMULATION');
    doc.autoTable({
      startY: y,
      head: [['Paramètre', 'Valeur']],
      body: [
        ['Capital initial', fmtPdf(capital)],
        ['Horizon de placement', `${horizon} ans`],
        ['Versements mensuels', fmtPdf(mensuel) + '/mois'],
        ['Capital total investi', fmtPdf(totalInvested)],
        ['Profil de risque', risk.charAt(0).toUpperCase() + risk.slice(1)],
        ['Tranche marginale d\'imposition (TMI)', tmi + ' %'],
        ['Rendement annuel moyen (mu)', fmtPctPdf(mu)],
        ['Volatilite annuelle (sigma), correlations incluses', fmtPctPdf(sigma)],
        ['Nombre de simulations', '10 000'],
        ['Modele', 'Mouvement Brownien Geometrique correle (pas mensuel)'],
      ],
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: TEXT },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 90 }, 1: { cellWidth: 'auto' } },
      margin: { left: ML, right: MR },
    });
    y = doc.lastAutoTable.finalY + 8;

    y = sectionTitle(y, 'ALLOCATION DU PORTEFEUILLE');
    const allocRows = Object.entries(state.allocations)
      .filter(([, pct]) => pct > 0)
      .map(([id, pct]) => {
        const p = PRODUCTS.find(x => x.id === id);
        return p ? [p.name, p.vehicleLabel, `${pct}%`, fmtPctPdf(p.mu - (p.ter || 0)), fmtPctPdf(p.sigma)] : null;
      })
      .filter(Boolean);
    doc.autoTable({
      startY: y,
      head: [['Support', 'Véhicule', 'Alloc.', 'Rdt μ', 'Vol. σ']],
      body: allocRows,
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { fontSize: 7.5, textColor: TEXT },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: { 0: { cellWidth: 65 }, 1: { cellWidth: 35 }, 2: { cellWidth: 18, halign: 'center' }, 3: { cellWidth: 20, halign: 'center' }, 4: { cellWidth: 20, halign: 'center' } },
      margin: { left: ML, right: MR },
    });

    // ── PAGE 2 — Indicateurs clés ──
    doc.addPage(); page++; header(); footer(page);
    y = 22;
    y = sectionTitle(y, 'INDICATEURS CLÉS DE PERFORMANCE (NET APRÈS FISCALITÉ)');

    const kpiData = [
      { label: 'Net median apres fiscalite', value: fmtPdf(netP50), color: [8, 145, 178] },
      { label: 'Probabilite de perte', value: fmtPctPdf(probLoss), color: [220, 38, 38] },
      { label: 'Net pessimiste (P10)', value: fmtPdf(netP10), color: [217, 119, 6] },
      { label: 'Brut median (P50, avant impots)', value: fmtPdf(p50), color: [22, 163, 74] },
    ];
    const bw = (CW - 6) / 2, bh = 22;
    kpiData.forEach((k, i) => {
      const bx = ML + (i % 2) * (bw + 6);
      const by = y + Math.floor(i / 2) * (bh + 4);
      doc.setFillColor(...k.color);
      doc.roundedRect(bx, by, bw, bh, 3, 3, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...WHITE);
      doc.text(k.label, bx + 4, by + 6.5);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
      doc.text(k.value, bx + 4, by + 16);
    });
    y += 2 * (bh + 4) + 8;

    const realNetP50 = netP50 / Math.pow(1 + INFLATION, horizon);
    doc.setFont('helvetica', 'italic'); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    doc.text(`Valeur nette médiane en euros constants (inflation ~2,2 %/an) : ${fmtPdf(realNetP50)}`, ML, y);
    y += 6;

    y = checkY(y, 12);
    y = sectionTitle(y, 'DISTRIBUTION DES PERCENTILES BRUTS (AVANT IMPÔTS)');
    doc.autoTable({
      startY: y,
      head: [['Percentile', 'Signification', 'Valeur finale brute']],
      body: [
        ['P10', '10% des scenarios sont inferieurs', fmtPdf(p10)],
        ['P25', '25% des scenarios sont inferieurs', fmtPdf(p25)],
        ['P50', 'Mediane - resultat le plus probable', fmtPdf(p50)],
        ['P75', '75% des scenarios sont inferieurs', fmtPdf(p75)],
        ['P90', '90% des scenarios sont inferieurs', fmtPdf(p90)],
      ],
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: TEXT },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: { 0: { cellWidth: 22, halign: 'center', fontStyle: 'bold' }, 1: { cellWidth: 115 }, 2: { cellWidth: 35, halign: 'right' } },
      margin: { left: ML, right: MR },
    });
    y = doc.lastAutoTable.finalY + 8;

    y = checkY(y, 20);
    const range = PROFILE_SIGMA_RANGES[risk];
    let matchStatus, borderColor;
    if (range) {
      if (sigma > range.max) { matchStatus = 'ATTENTION — Portefeuille plus risque que le profil declare'; borderColor = RED; }
      else if (sigma < range.min) { matchStatus = 'INFO — Portefeuille plus conservateur que le profil declare'; borderColor = [26, 90, 138]; }
      else { matchStatus = 'CONFORME — Portefeuille coherent avec le profil declare'; borderColor = [45, 106, 79]; }

      y = sectionTitle(y, 'ADÉQUATION PROFIL / PORTEFEUILLE');
      doc.setFillColor(...LIGHT);
      doc.rect(ML, y, CW, 14, 'F');
      doc.setFillColor(...borderColor);
      doc.rect(ML, y, 2, 14, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...borderColor);
      doc.text(matchStatus, ML + 5, y + 6);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...TEXT);
      doc.text(`Volatilite du portefeuille : ${fmtPctPdf(sigma)} — plage attendue profil ${risk} : ${fmtPctPdf(range.min)} a ${range.max >= 1 ? 'sans limite' : fmtPctPdf(range.max)}`, ML + 5, y + 11);
      y += 20;
    }

    // ── PAGE 3 — Graphiques ──
    doc.addPage(); page++; header(); footer(page);
    y = 22;
    y = sectionTitle(y, 'TRAJECTOIRES — ENVELOPPE DE PERCENTILES');

    const prevActiveTab = document.querySelector('.tab-btn.active')?.dataset.tab || 'kpi';
    activateTab('charts');
    await new Promise(r => requestAnimationFrame(r));

    const fanImg = captureChart('fan-chart');
    const distImg = captureChart('dist-chart');
    const donutImg = captureChart('donut-chart');

    activateTab(prevActiveTab);

    if (fanImg) {
      const fanCanvas = document.getElementById('fan-chart');
      const fanH = fanCanvas ? Math.round(CW * fanCanvas.height / fanCanvas.width) : 65;
      doc.addImage(fanImg, 'PNG', ML, y, CW, Math.min(fanH, 75));
      y += Math.min(fanH, 75) + 4;
    }
    if (distImg) {
      y = checkY(y, 12);
      y = sectionTitle(y, 'DISTRIBUTION DES VALEURS FINALES BRUTES (10 000 SIMULATIONS)');
      const distCanvas = document.getElementById('dist-chart');
      const distW = CW * 0.62;
      const distH = distCanvas ? Math.round(distW * distCanvas.height / distCanvas.width) : 52;
      doc.addImage(distImg, 'PNG', ML, y, distW, Math.min(distH, 60));
      if (donutImg) {
        const donutCanvas = document.getElementById('donut-chart');
        const donutW = CW * 0.33;
        const donutH = donutCanvas ? Math.round(donutW * donutCanvas.height / donutCanvas.width) : 52;
        doc.addImage(donutImg, 'PNG', ML + CW * 0.65, y, donutW, Math.min(donutH, 60));
      }
      y += Math.min(distH, 60) + 4;
    }

    // ── PAGE 4 — Détail par support + fiscalité ──
    doc.addPage(); page++; header(); footer(page);
    y = 22;
    y = sectionTitle(y, 'DÉTAIL PAR SUPPORT D\'INVESTISSEMENT');

    const detailRows = Object.entries(state.allocations)
      .filter(([, pct]) => pct > 0)
      .map(([id, pct]) => {
        const p = PRODUCTS.find(x => x.id === id);
        if (!p) return null;
        const muNet = p.mu - (p.ter || 0);
        return [p.name, p.vehicleLabel, `${pct} %`, fmtPctPdf(p.mu), fmtPctPdf(p.ter || 0), fmtPctPdf(muNet), fmtPctPdf(p.sigma), fmtPdf(productMedians[id])];
      })
      .filter(Boolean);
    doc.autoTable({
      startY: y,
      head: [['Support', 'Véhicule', 'Alloc.', 'Rdt brut', 'Frais TER', 'Rdt net', 'Vol. σ', 'Val. finale médiane']],
      body: detailRows,
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 7 },
      bodyStyles: { fontSize: 7, textColor: TEXT },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: { 0: { cellWidth: 46 }, 1: { cellWidth: 24 }, 2: { cellWidth: 14, halign: 'center' }, 3: { cellWidth: 18, halign: 'center' }, 4: { cellWidth: 16, halign: 'center' }, 5: { cellWidth: 16, halign: 'center' }, 6: { cellWidth: 16, halign: 'center' }, 7: { cellWidth: 32, halign: 'right' } },
      margin: { left: ML, right: MR },
    });
    y = doc.lastAutoTable.finalY + 6;

    doc.setFont('helvetica', 'italic'); doc.setFontSize(7); doc.setTextColor(...MUTED);
    const nonAddNote = doc.splitTextToSize(
      'Valeurs medianes indicatives par support, issues de la meme simulation jointe corrélée. Leur somme ne correspond pas exactement a la mediane globale du portefeuille (propriete statistique normale : la mediane d\'une somme differe de la somme des medianes).',
      CW
    );
    doc.text(nonAddNote, ML, y);
    y += nonAddNote.length * 3.5 + 6;

    y = checkY(y, 12);
    doc.setFont('helvetica', 'italic'); doc.setFontSize(7); doc.setTextColor(...MUTED);
    const fiscalNonAddNote = doc.splitTextToSize(
      'Valeurs medianes indicatives par vehicule, issues de la meme simulation jointe. Leur somme ne correspond pas exactement a la mediane globale du portefeuille (propriete statistique normale).',
      CW
    );
    doc.text(fiscalNonAddNote, ML, y);
    y += fiscalNonAddNote.length * 3.5 + 4;

    y = sectionTitle(y, 'RÉPARTITION FISCALE PAR VÉHICULE (VALEURS MÉDIANES)');
    const fiscalRows = [];
    for (const v of ['Livret', 'PEA', 'AV', 'CTO']) {
      const d = fiscalByVehicle[v];
      if (!d) continue;
      fiscalRows.push([v, fmtPdf(d.capital), fmtPdf(d.finalValue), d.irTax > 0 ? fmtPdf(d.irTax) : '-', d.psTax > 0 ? fmtPdf(d.psTax) : '-', fmtPdf(d.tax), fmtPdf(d.net)]);
    }
    doc.autoTable({
      startY: y,
      head: [['Véhicule', 'Capital', 'Val. fin. méd.', 'dont IR', 'dont PS', 'Total impôts', 'Net récupéré']],
      body: fiscalRows,
      theme: 'grid',
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5 },
      bodyStyles: { fontSize: 7.5, textColor: TEXT },
      alternateRowStyles: { fillColor: LIGHT },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 25 } },
      margin: { left: ML, right: MR },
    });
    y = doc.lastAutoTable.finalY + 8;

    // ── PAGE 5 — Méthodologie, fiscalité, avertissements ──
    doc.addPage(); page++; header(); footer(page);
    y = 22;
    y = sectionTitle(y, 'MÉTHODOLOGIE ET AVERTISSEMENTS RÉGLEMENTAIRES');

    const warnings = [
      'Ce document est produit a titre purement informatif et pedagogique. Il ne constitue pas un conseil en investissement au sens de la directive MIF II (2014/65/UE).',
      'Les performances passees ne prejugent pas des performances futures. Les projections resultent d\'un modele stochastique et ne constituent pas des garanties.',
      'Le Mouvement Brownien Geometrique suppose des rendements log-normalement distribues et une volatilite constante — approximation simplifiee de la realite des marches.',
      'Les correlations entre actifs risques sont desormais modelisees dans la simulation elle-meme (chocs correles par decomposition de Cholesky, tires a chaque pas mensuel), et non plus approximees a posteriori.',
      'La fiscalite est calculee scenario par scenario sur le gain reel de chaque vehicule dans ce scenario precis, ce qui garantit la coherence entre les valeurs brutes et nettes affichees.',
      'Les parametres (mu, sigma) utilises sont des estimations basees sur des donnees historiques moyennes et peuvent differer significativement sur votre horizon d\'investissement.',
      'La fiscalite francaise est susceptible d\'evoluer. Les calculs sont bases sur la legislation en vigueur au 01/01/2026 et constituent des estimations indicatives ne prenant pas en compte votre situation patrimoniale globale.',
      'Avant toute decision d\'investissement, consultez un conseiller en gestion de patrimoine (CGP) agree par l\'AMF.',
    ];
    doc.autoTable({
      startY: y,
      body: warnings.map((w, i) => [`${i + 1}.`, w]),
      theme: 'plain',
      bodyStyles: { fontSize: 7.5, textColor: TEXT, cellPadding: { top: 2, bottom: 2, left: 2, right: 4 } },
      columnStyles: { 0: { cellWidth: 8, fontStyle: 'bold', valign: 'top' } },
      margin: { left: ML, right: MR },
    });
    y = doc.lastAutoTable.finalY + 6;

    y = checkY(y, 50);
    y = sectionTitle(y, 'CERTIFICAT D\'AUTHENTICITÉ DU DOCUMENT');
    doc.setFillColor(...LIGHT);
    doc.roundedRect(ML, y, CW, 42, 3, 3, 'F');
    doc.setDrawColor(...NAVY); doc.setLineWidth(0.4);
    doc.roundedRect(ML, y, CW, 42, 3, 3, 'S');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...NAVY);
    doc.text('Empreinte numérique SHA-256 (paramètres de simulation)', ML + 4, y + 7);
    doc.setFont('courier', 'normal'); doc.setFontSize(8); doc.setTextColor(...TEXT);
    doc.text(fingerprint.slice(0, 32), ML + 4, y + 14);
    doc.text(fingerprint.slice(32), ML + 4, y + 20);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    doc.text(`Référence document : ${docId}`, ML + 4, y + 28);
    doc.text(`Date de génération : ${now.toISOString().replace('T', ' ').slice(0, 19)} UTC`, ML + 4, y + 34);
    doc.text('Produit par : SimuPortefeuille — Application cliente (aucune donnée transmise)', ML + 4, y + 40);

    const filename = `SimuPortefeuille_${risk}_${horizon}ans_${docId}.pdf`;
    doc.save(filename);
  } catch (err) {
    console.error('PDF generation error:', err);
    showError('Erreur lors de la génération du PDF. Réessayez ou contactez le support.');
  } finally {
    hideLoading();
  }
}
