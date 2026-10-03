import { FISCAL } from '../config/fiscal.js';
import { PROFILES } from '../data/profiles.js';

/** Somme des pourcentages alloués. */
export function allocationTotal(alloc) {
  return Object.values(alloc).reduce((s, v) => s + (v > 0 ? v : 0), 0);
}

/** true si l'allocation totalise 100 % (à 0,05 point près). */
export function isComplete(alloc) {
  return Math.abs(allocationTotal(alloc) - 100) < 0.05;
}

/**
 * Remet l'allocation à l'échelle pour totaliser exactement 100 %, avec
 * des pourcentages arrondis au dixième ; l'écart d'arrondi est porté par
 * la plus grosse ligne.
 */
export function normalizeAllocation(alloc) {
  const entries = Object.entries(alloc).filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return {};
  const out = {};
  let acc = 0;
  for (const [id, v] of entries) {
    out[id] = Math.round((v / total) * 1000) / 10;
    acc += out[id];
  }
  const largest = entries.reduce((best, [id]) => (out[id] > out[best] ? id : best), entries[0][0]);
  out[largest] = Math.round((out[largest] + 100 - acc) * 10) / 10;
  return out;
}

/** Allocation de départ d'un profil (copie modifiable). */
export function profileAllocation(risk) {
  return { ...(PROFILES[risk] || PROFILES.modere).alloc };
}

/** Répartition de l'allocation par enveloppe fiscale. */
export function allocationByVehicle(alloc, catalog) {
  const out = {};
  for (const [id, pct] of Object.entries(alloc)) {
    const p = catalog.find(x => x.id === id);
    if (!p || !(pct > 0)) continue;
    out[p.vehicle] = (out[p.vehicle] || 0) + pct;
  }
  return out;
}

/** Part (en %) de l'allocation investie en actions. */
export function equityShare(alloc, catalog) {
  let s = 0;
  for (const [id, pct] of Object.entries(alloc)) {
    const p = catalog.find(x => x.id === id);
    if (p && p.assetClass.startsWith('actions-')) s += pct;
  }
  return s;
}

/**
 * Montants versés par ligne sur toute la durée (capital + versements
 * indexés), pour les contrôles de plafonds réglementaires.
 */
export function investedByProduct(s) {
  let contrib = 0;
  for (let y = 0; y < s.horizon; y++) contrib += 12 * s.monthly * Math.pow(1 + s.contributionGrowth, y);
  const total = s.capital + contrib;
  const out = {};
  for (const [id, pct] of Object.entries(s.allocations)) {
    if (pct > 0) out[id] = { initial: s.capital * pct / 100, total: total * pct / 100 };
  }
  return out;
}

/**
 * Alertes réglementaires et pédagogiques sur une allocation.
 * @param {object} s état
 * @param {object[]} catalog
 * @param {{sigma: number}|null} stats statistiques analytiques du portefeuille
 * @returns {{level: 'warn'|'info', text: string}[]}
 */
export function allocationWarnings(s, catalog, stats) {
  const out = [];
  const warn = text => out.push({ level: 'warn', text });
  const info = text => out.push({ level: 'info', text });
  const fmtEur = v => `${Math.round(v).toLocaleString('fr-FR')} €`;
  const invested = investedByProduct(s);
  const byVehicle = {};

  for (const [id, amounts] of Object.entries(invested)) {
    const p = catalog.find(x => x.id === id);
    if (!p) continue;
    byVehicle[p.vehicle] = (byVehicle[p.vehicle] || 0) + amounts.total;
    if (p.plafond && amounts.total > p.plafond) {
      warn(`${p.name} : ${fmtEur(amounts.total)} versés au total, au-delà du plafond réglementaire de ${fmtEur(p.plafond)}. Les versements excédentaires sont impossibles : réaffectez-les (LDDS, fonds en euros, ETF monétaire…).`);
    }
    if (p.minHorizon && s.horizon < p.minHorizon) {
      info(`${p.name} : horizon conseillé d'au moins ${p.minHorizon} ans (vous simulez ${s.horizon} an${s.horizon > 1 ? 's' : ''}).`);
    }
  }

  if ((byVehicle.PEA || 0) > FISCAL.pea.plafondVersements) {
    warn(`PEA : ${fmtEur(byVehicle.PEA)} versés, au-delà du plafond de ${fmtEur(FISCAL.pea.plafondVersements)}.`);
  }
  if (byVehicle.PEA && s.peaAnciennete + s.horizon < FISCAL.pea.ageExoneration) {
    info(`PEA retiré avant ${FISCAL.pea.ageExoneration} ans d'ancienneté : gains imposés au PFU de 31,4 % au lieu des seuls prélèvements sociaux.`);
  }
  if (byVehicle.AV && s.avAnciennete + s.horizon < FISCAL.assuranceVie.ageReduit) {
    info(`Assurance-vie rachetée avant ${FISCAL.assuranceVie.ageReduit} ans : pas d'abattement annuel, gains imposés à 30 %. Ouvrir un contrat tôt, même avec un petit versement, fait courir l'antériorité fiscale.`);
  }
  if (byVehicle.PER) {
    const perPct = allocationByVehicle(s.allocations, catalog).PER || 0;
    const annual = (s.capital + 12 * s.monthly) * perPct / 100;
    info('PER : capital bloqué jusqu\'à la retraite (hors cas de déblocage anticipé : achat de la résidence principale, accidents de la vie).');
    if (annual > s.perCap) {
      warn(`PER : ${fmtEur(annual)} versés la 1re année pour un plafond de déduction de ${fmtEur(s.perCap)} — l'excédent n'ouvre droit à aucune économie d'impôt.`);
    }
    if (s.tmi <= 11) {
      warn('PER avec une TMI de 0 ou 11 % : l\'économie d\'impôt à l\'entrée est faible alors que la sortie en capital est imposée — l\'assurance-vie est souvent plus adaptée.');
    }
  }
  if (byVehicle.SCPI && s.horizon < 8) {
    warn('SCPI détenue moins de 8 ans : les frais de souscription (≈ 8 %) ne sont généralement pas amortis.');
  }

  const cryptoPct = (s.allocations['crypto-btc'] || 0) + (s.allocations['crypto-eth'] || 0);
  if (cryptoPct > 0 && s.risk !== 'dynamique') {
    warn(`Crypto-actifs ${cryptoPct} % dans un profil ${s.risk === 'conservateur' ? 'prudent' : 'équilibré'} : poche spéculative inadaptée (baisses historiques de −70 à −85 %).`);
  } else if (cryptoPct > 10) {
    warn(`Crypto-actifs ${cryptoPct} % : au-delà de 5–10 %, une chute de −80 % amputerait lourdement le patrimoine.`);
  }

  const eq = equityShare(s.allocations, catalog);
  if (s.horizon < 3 && eq > 30) {
    warn(`Actions ${Math.round(eq)} % sur un horizon de ${s.horizon} an${s.horizon > 1 ? 's' : ''} : un krach (−30 à −50 %) n'aurait pas le temps d'être rattrapé.`);
  } else if (s.horizon < 5 && eq > 50) {
    warn(`Actions ${Math.round(eq)} % à moins de 5 ans : règle empirique ≤ 40–50 % d'actions sur un horizon court.`);
  }

  const range = PROFILES[s.risk]?.sigmaRange;
  if (stats && range) {
    const pctS = v => `${(v * 100).toFixed(1).replace('.', ',')} %`;
    if (stats.sigma > range.max) {
      warn(`Volatilité du portefeuille ${pctS(stats.sigma)} supérieure à la plage du profil ${PROFILES[s.risk].label} (max ${pctS(range.max)}).`);
    } else if (stats.sigma < range.min) {
      info(`Volatilité du portefeuille ${pctS(stats.sigma)} inférieure à la plage du profil ${PROFILES[s.risk].label} (min ${pctS(range.min)}) : l'allocation est plus prudente que le profil déclaré.`);
    }
  }

  if (s.allocations.lep > 0) info('LEP : réservé aux foyers dont le revenu fiscal de référence est inférieur à un plafond (≈ 23 000 € pour une part).');
  return out;
}
