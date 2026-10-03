import { state } from '../state.js';
import { CATALOG } from '../data/catalog.js';
import { VEHICLES, VEHICLE_ORDER } from '../data/vehicles.js';
import { PROFILES } from '../data/profiles.js';
import { FISCAL } from '../config/fiscal.js';
import { ASSUMPTION_MODES, portfolioStats } from '../engine/assumptions.js';
import { allocationWarnings } from '../engine/allocation.js';
import { singleVehicleTax, perDeductionSaving } from '../engine/tax.js';
import { el, fill, $, infoButton } from './dom.js';
import { fmt, fmtPct, fmtPctSigned, fmtDate } from './format.js';
import { renderGauge, renderHistogram, renderFanChart, renderDonut, PALETTE, chartsAvailable } from './charts.js';

export const RISK_LEVELS = [
  { max: 0.05, label: 'Très faible', css: 'risk-vlow', advice: 'Le risque de terminer sous vos versements est très limité.' },
  { max: 0.15, label: 'Faible', css: 'risk-low', advice: 'Le risque est contenu : l\'horizon et la diversification protègent vos versements dans la grande majorité des scénarios.' },
  { max: 0.30, label: 'Modéré', css: 'risk-mod', advice: 'Une part non négligeable des scénarios termine sous vos versements. Vérifiez que vous pourriez attendre plus longtemps en cas de marché baissier.' },
  { max: 0.50, label: 'Élevé', css: 'risk-high', advice: 'Risque significatif : renforcez la part garantie ou allongez l\'horizon si possible.' },
  { max: Infinity, label: 'Très élevé', css: 'risk-vhigh', advice: 'Plus d\'un scénario sur deux termine sous vos versements : l\'allocation est inadaptée à cet horizon.' },
];

export const riskLevel = p => RISK_LEVELS.find(l => p < l.max);

/** Objectif exprimé en euros nominaux à l'horizon. */
export function nominalTarget(s = state) {
  if (!(s.target > 0)) return 0;
  return s.targetReal ? s.target * Math.pow(1 + s.inflation, s.horizon) : s.target;
}

function kpi({ label, value, sub, tone = '', tip }) {
  return el('div', { className: `kpi-card ${tone ? `tone-${tone}` : ''}` },
    el('div', { className: 'kpi-label' }, label, tip ? infoButton(tip) : null),
    el('div', { className: 'kpi-value' }, value),
    sub ? el('div', { className: 'kpi-sub' }, sub) : null);
}

export function renderResults() {
  const r = state.simResults;
  const s = state;
  const stats = portfolioStats(state.plan.lines, state.plan.correlation);
  $('#sim-subtitle').textContent =
    `${fmt(s.capital)} + ${fmt(s.monthly)}/mois sur ${s.horizon} ans · TMI ${s.tmi} % · ` +
    `${r.meta.nSims.toLocaleString('fr-FR')} scénarios · ${ASSUMPTION_MODES[s.assumptionMode]} · graine ${r.meta.seed}`;

  renderKpis(r);
  renderExplainer(r, stats);
  renderResultWarnings(r, stats);
  renderFiscal(r);
  renderDetail(r);
  renderMethod(r, stats);
  renderAllCharts();
}

function renderKpis(r) {
  const gain = r.net.p50 - r.invested;
  const items = [
    kpi({ label: 'Valeur nette médiane', value: fmt(r.net.p50), tone: 'info',
      sub: `soit ${fmt(r.netReal.p50)} d'aujourd'hui · brut ${fmt(r.gross.p50)}`,
      tip: 'La moitié des scénarios fait mieux, la moitié moins bien. Valeur après impôts et prélèvements sociaux de sortie.' }),
    kpi({ label: 'Total versé', value: fmt(r.invested),
      sub: `${fmt(r.capital)} au départ + ${fmt(r.totalContrib)} de versements` }),
    kpi({ label: 'Gain net médian', value: fmt(gain), tone: gain >= 0 ? 'success' : 'danger',
      sub: `rendement annualisé net ${fmtPctSigned(r.irr.p50)}/an`,
      tip: 'Rendement annualisé : taux de rendement interne tenant compte de la date de chaque versement.' }),
    kpi({ label: 'Probabilité de perte', value: fmtPct(r.probLoss), tone: r.probLoss > 0.2 ? 'danger' : r.probLoss > 0.05 ? 'warning' : 'success',
      sub: `perte de pouvoir d'achat : ${fmtPct(r.probLossReal)}`,
      tip: 'Part des scénarios où la valeur nette finale est inférieure au total versé. « Pouvoir d\'achat » : même comparaison après inflation.' }),
    kpi({ label: 'Scénario défavorable', value: fmt(r.net.p10), tone: 'warning',
      sub: `1 cas sur 10 fait pire · moyenne des 5 % pires : ${fmt(r.cvar5)}`,
      tip: '10e percentile de la valeur nette. La moyenne des 5 % pires scénarios (« CVaR ») mesure la gravité des cas extrêmes.' }),
    kpi({ label: 'Scénario favorable', value: fmt(r.net.p90), tone: 'success',
      sub: `1 cas sur 10 fait mieux · ${fmtPctSigned(r.irr.p90)}/an` }),
    kpi({ label: 'Baisse en cours de route', value: fmtPctSigned(-r.drawdown.p50, 0), tone: 'warning',
      sub: `1 scénario sur 10 subit pire que ${fmtPctSigned(-r.drawdown.p90, 0)}`,
      tip: 'Plus forte baisse temporaire de la valeur du portefeuille depuis un sommet (« drawdown »), médiane des scénarios. Les versements l\'atténuent.' }),
  ];
  if (r.probTarget !== null) {
    items.splice(1, 0, kpi({ label: 'Objectif atteint', value: fmtPct(r.probTarget, 0), tone: r.probTarget >= 0.75 ? 'success' : r.probTarget >= 0.5 ? 'warning' : 'danger',
      sub: `objectif ${fmt(state.target)}${state.targetReal ? ` d'aujourd'hui (${fmt(r.target)} à l'horizon)` : ''}` }));
  }
  fill($('#kpi-grid'), ...items);
}

function renderExplainer(r, stats) {
  const lvl = riskLevel(r.probLoss);
  const n = r.meta.nSims.toLocaleString('fr-FR');
  const items = [
    `Sur ${n} futurs possibles, la moitié aboutit à plus de ${fmt(r.net.p50)} nets d'impôts, soit ${fmt(r.netReal.p50)} en euros d'aujourd'hui (inflation ${fmtPct(state.inflation)}/an).`,
    `Dans 8 cas sur 10, la valeur nette finale se situe entre ${fmt(r.net.p10)} et ${fmt(r.net.p90)}.`,
    `Vos ${fmt(r.invested)} de versements sont récupérés dans ${fmtPct(1 - r.probLoss, 0)} des scénarios ; leur pouvoir d'achat est préservé dans ${fmtPct(1 - r.probLossReal, 0)} des cas.`,
    `En chemin, attendez-vous à une baisse temporaire d'environ ${fmtPct(r.drawdown.p50, 0)} depuis un plus haut — et de plus de ${fmtPct(r.drawdown.p90, 0)} une fois sur dix. Ne pas vendre dans ces moments est la clé du résultat.`,
    `Portefeuille : rendement net espéré ${fmtPctSigned(stats.mu)}/an, volatilité ${fmtPct(stats.sigma)} (corrélations incluses).`,
  ];
  fill($('#risk-explainer'), 
    el('h4', {}, 'Ce que cela signifie — risque ', el('span', { className: lvl.css }, lvl.label.toLowerCase())),
    el('p', {}, lvl.advice),
    el('ul', {}, ...items.map(t => el('li', {}, t))),
  );
  $('#gauge-label').textContent = `${fmtPct(r.probLoss)} · ${lvl.label}`;
  $('#gauge-label').className = `gauge-label ${lvl.css}`;
}

function renderResultWarnings(r, stats) {
  const w = allocationWarnings(state, CATALOG, stats);
  if (state.assumptionMode !== 'prospectif') {
    w.unshift({ level: 'warn', text: 'Hypothèses fondées sur l\'historique : les 10 dernières années ont été exceptionnelles pour les actions (en particulier américaines et technologiques). Les extrapoler conduit souvent à des projections optimistes.' });
  }
  if (r.meta.shrinkage > 0) {
    w.push({ level: 'info', text: `Les corrélations saisies ou estimées n'étaient pas mutuellement cohérentes : elles ont été atténuées de ${fmtPct(r.meta.shrinkage, 0)} pour rester valides.` });
  }
  fill($('#result-warnings'), ...w.map(x => el('div', { className: `warning ${x.level}` }, x.text)));
}

function taxCtx() {
  return {
    tmi: state.tmi, tmiRetraite: state.tmiRetraite, couple: state.couple,
    peaAge: state.peaAnciennete + state.horizon, avAge: state.avAnciennete + state.horizon,
    holdingYears: state.horizon, bareme: state.bareme,
  };
}

function renderFiscal(r) {
  const cards = [
    kpi({ label: 'Impôts à la sortie', value: fmt(r.taxes.exitP50), tone: 'danger',
      sub: r.taxes.baremeShare > 0.5 ? 'option pour le barème retenue (plus favorable)' : 'prélèvement forfaitaire unique (PFU)',
      tip: 'Médiane des impôts et prélèvements sociaux dus lors du retrait total à l\'horizon.' }),
    kpi({ label: 'Frais de gestion cumulés', value: fmt(r.fees.managementP50), tone: 'warning',
      sub: r.fees.entry > 0 ? `+ ${fmt(r.fees.entry)} de frais sur versements` : 'aucun frais sur versements',
      tip: 'Somme des frais annuels (support + enveloppe) prélevés sur la durée, scénario médian. Ils se capitalisent : 1 %/an coûte environ 10 à 20 % du capital final sur 20 ans.' }),
  ];
  if (r.taxes.lifetimeP50 > 0) {
    cards.push(kpi({ label: 'Impôts payés en cours de route', value: fmt(r.taxes.lifetimeP50), tone: 'danger',
      sub: 'revenus fonciers des SCPI (TMI + 17,2 %)' }));
  }
  if (r.taxes.perSaving > 0) {
    cards.push(kpi({ label: 'Économie d\'impôt PER', value: fmt(r.taxes.perSaving), tone: 'success',
      sub: 'déduction des versements, non réinvestie dans la simulation',
      tip: 'Réduction d\'impôt sur le revenu obtenue l\'année de chaque versement (versement × TMI, dans la limite du plafond). À comparer à l\'impôt dû à la sortie.' }));
  }
  fill($('#fiscal-kpis'), ...cards);

  const rows = VEHICLE_ORDER.filter(v => r.vehicles[v]).map(v => {
    const d = r.vehicles[v];
    return el('tr', {},
      el('td', {}, el('span', { className: `badge ${VEHICLES[v].cssClass}` }, VEHICLES[v].short), ' ', VEHICLES[v].label),
      el('td', { className: 'num' }, fmt(d.invested)),
      el('td', { className: 'num' }, fmt(d.value)),
      el('td', { className: 'num' }, d.ir > 0.5 ? fmt(d.ir) : '—'),
      el('td', { className: 'num' }, d.ps > 0.5 ? fmt(d.ps) : '—'),
      el('td', { className: 'num' }, el('b', {}, fmt(d.net))));
  });
  fill($('#fiscal-table tbody'), ...rows);

  // Comparaison pédagogique : même performance brute médiane, enveloppes différentes.
  const ctx = taxCtx();
  const bucket = { value: r.gross.p50, invested: r.invested };
  const yearly = r.investedPath.slice(1).map((v, i) => v - r.investedPath[i] + (i === 0 ? r.capital : 0));
  const rules = {
    PEA: ctx.peaAge >= FISCAL.pea.ageExoneration ? 'PS 18,6 % seuls (≥ 5 ans)' : 'PFU 31,4 % (< 5 ans)',
    AV: ctx.avAge >= FISCAL.assuranceVie.ageReduit ? `abattement ${fmt(state.couple ? 9200 : 4600)}, 7,5 % + PS 17,2 %` : '12,8 % + PS 17,2 % (< 8 ans)',
    CTO: 'PFU 31,4 % ou barème',
    PER: `versements au barème (TMI ${state.tmiRetraite} %), gains PFU 31,4 %`,
  };
  const envelopes = ['PEA', 'AV', 'CTO', 'PER'].map(v => {
    const t = singleVehicleTax(v, bucket, ctx);
    const saving = v === 'PER' ? perDeductionSaving(yearly, state.tmi, state.perCap) : 0;
    return { v, tax: t.total, net: r.gross.p50 - t.total, saving, total: r.gross.p50 - t.total + saving };
  });
  const best = envelopes.reduce((a, b) => (b.total > a.total ? b : a));
  fill($('#envelope-table tbody'), ...envelopes.map(e => el('tr', { className: e === best ? 'best' : '' },
    el('td', {}, el('span', { className: `badge ${VEHICLES[e.v].cssClass}` }, VEHICLES[e.v].short), ' ', VEHICLES[e.v].label),
    el('td', { className: 'num' }, fmt(e.tax)),
    el('td', { className: 'num' }, el('b', {}, fmt(e.net)), e.saving > 0 ? ` (+ ${fmt(e.saving)} d'économie à l'entrée)` : ''),
    el('td', {}, rules[e.v]))));
}

function renderDetail(r) {
  const rows = state.plan.resolved.map(({ product: p, assumption: a, fee }) => {
    const line = r.lines[p.id];
    return el('tr', {},
      el('td', {}, `${p.icon} ${p.name}`),
      el('td', { className: 'num' }, `${state.allocations[p.id].toLocaleString('fr-FR')} %`),
      el('td', { className: 'num' }, fmtPct(a.mu)),
      el('td', { className: 'num' }, fee > 0 ? fmtPct(fee, 2) : '—'),
      el('td', { className: 'num' }, fmtPct(a.mu - fee)),
      el('td', { className: 'num' }, a.sigma > 0 ? fmtPct(a.sigma) : 'garanti'),
      el('td', {}, a.source === 'historique' || a.source === 'mixte' ? `${a.source} (${a.hist.ticker})` : a.source),
      el('td', { className: 'num' }, fmt(line.invested)),
      el('td', { className: 'num' }, el('b', {}, fmt(line.p50))));
  });
  fill($('#detail-table tbody'), ...rows);
}

function renderMethod(r) {
  const s = state;
  const m = s.market;
  const table = rows => el('table', {}, el('tbody', {}, ...rows.map(([k, v]) => el('tr', {}, el('th', { scope: 'row' }, k), el('td', {}, v)))));
  const link = (href, text) => el('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text);

  const macro = m ? Object.values(m.macro).map(x => el('li', {}, `${x.label} : ${fmtPct(x.value)} (${fmtDate(x.period)})`)) : [];

  fill($('#method-content'), 
    el('h3', {}, 'Paramètres de la simulation'),
    table([
      ['Capital initial / versement mensuel', `${fmt(s.capital)} / ${fmt(s.monthly)} (indexé de ${fmtPct(s.contributionGrowth)}/an)`],
      ['Horizon', `${s.horizon} ans`],
      ['Profil déclaré', PROFILES[s.risk].label],
      ['Fiscalité', `TMI ${s.tmi} % (retraite ${s.tmiRetraite} %), ${s.couple ? 'couple' : 'personne seule'}, PEA ouvert depuis ${s.peaAnciennete} an(s), AV depuis ${s.avAnciennete} an(s), régime ${{ auto: 'automatique', pfu: 'PFU', bareme: 'barème' }[s.bareme]}`],
      ['Frais d\'enveloppe (UC)', `AV ${fmtPct(s.envelopeFees.AV, 2)}/an, PER ${fmtPct(s.envelopeFees.PER, 2)}/an`],
      ['Inflation', `${fmtPct(s.inflation)}/an`],
      ['Hypothèses de rendement', ASSUMPTION_MODES[s.assumptionMode]],
      ['Modèle', `${r.meta.nSims.toLocaleString('fr-FR')} scénarios, pas mensuel, loi ${r.meta.distribution === 'student' ? `de Student (ν = ${r.meta.df})` : 'normale'}, rééquilibrage ${r.meta.rebalancing === 'annual' ? 'annuel' : 'aucun'}`],
      ['Graine aléatoire', `${r.meta.seed} — relancer avec cette graine reproduit exactement ces résultats`],
    ]),
    el('h3', {}, 'Données de marché'),
    m
      ? el('div', {},
        el('p', {}, `${s.marketSourceLabel}, générées le ${fmtDate(m.generatedAt)}. Cours : Yahoo Finance (mensuels, dividendes réinvestis, 10 ans). Inflation : Eurostat. Taux : BCE.`),
        el('ul', {}, ...macro))
      : el('p', {}, 'Aucune donnée de marché chargée : hypothèses prospectives intégrées.'),
    el('h3', {}, 'Modèle et formules'),
    el('ul', {},
      el('li', {}, 'Chaque support suit un mouvement brownien géométrique à pas mensuel : V(t+1) = V(t) · exp((μ − σ²/2)/12 + σ·√(1/12)·ε), où μ est net des frais et ε un choc aléatoire.'),
      el('li', {}, 'Les chocs des différents supports sont corrélés (décomposition de Cholesky de la matrice de corrélation). En loi de Student, un facteur commun rend les krachs plus fréquents et simultanés.'),
      el('li', {}, 'Livrets et fonds en euros : croissance déterministe à leur taux (capital garanti). SCPI en direct : les loyers sont imposés chaque année (TMI + 17,2 %), ce qui réduit la capitalisation.'),
      el('li', {}, 'La fiscalité de sortie est calculée scénario par scénario, enveloppe par enveloppe, sur le gain réel de ce scénario (rachat total à l\'horizon).'),
      el('li', {}, 'Rendement annualisé : taux de rendement interne (TRI) des flux mensuels. Euros constants : valeur divisée par (1 + inflation)^horizon.')),
    el('h3', {}, `Fiscalité — millésime ${FISCAL.millesime}`),
    el('ul', {}, ...FISCAL.sources.map(src => el('li', {}, link(src.url, src.label)))),
    el('h3', {}, 'Limites'),
    el('ul', {},
      el('li', {}, 'Les hypothèses de rendement sont des estimations : les marchés réels connaissent des régimes (inflation, taux, valorisations) que ce modèle ne représente pas.'),
      el('li', {}, 'Volatilités et corrélations constantes ; pas de retraits en cours de route ; rachat total à l\'horizon (pas de rachats fractionnés optimisant l\'abattement AV).'),
      el('li', {}, 'Prélèvements sociaux annuels des fonds en euros, impôt sur la fortune immobilière, succession et plafonnement global des niches ne sont pas modélisés.'),
      el('li', {}, 'La sortie en capital du PER est imposée au taux marginal indiqué, sans effet de progressivité du barème.')),
  );
}

/** (Re)dessine les graphiques de l'étape 3 (utile après changement de thème). */
export function renderAllCharts() {
  const r = state.simResults;
  if (!r || !chartsAvailable()) return;
  renderGauge(r.probLoss);
  const real = $('#fan-real').checked;
  const infl = state.inflation;
  renderFanChart(r.pctPaths, r.investedPath, real ? y => Math.pow(1 + infl, y) : () => 1);
  renderHistogram(r.sortedNet, r.invested);
  renderDonut(donutItems($('#donut-mode').value));
}

function donutItems(mode) {
  if (mode === 'vehicle') {
    const byV = {};
    for (const { product: p } of state.plan.resolved) byV[p.vehicle] = (byV[p.vehicle] || 0) + state.allocations[p.id];
    const colors = { LIVRET: '#0f766e', PEA: '#1d4ed8', AV: '#7c3aed', PER: '#c2410c', CTO: '#475569', CRYPTO: '#a16207', SCPI: '#be185d' };
    return VEHICLE_ORDER.filter(v => byV[v]).map(v => ({ label: VEHICLES[v].label, value: byV[v], color: colors[v] }));
  }
  return state.plan.resolved.map(({ product: p }, i) => ({ label: p.name, value: state.allocations[p.id], color: PALETTE[i % PALETTE.length] }));
}
