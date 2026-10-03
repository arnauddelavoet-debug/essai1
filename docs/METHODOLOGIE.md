# Méthodologie de SimuPortefeuille

Version 2.0.0 — fiscalité millésime 2026 — mise à jour du 30/09/2026.

Ce document décrit précisément ce que calcule le simulateur, avec quelles hypothèses et dans quelles limites. Chaque règle renvoie au fichier source qui l'implémente.

## 1. Vue d'ensemble

1. L'utilisateur décrit son projet (capital, versements, horizon, fiscalité du foyer) et une allocation entre supports.
2. Chaque support reçoit des hypothèses de rendement (μ), de volatilité (σ) et de frais ; les supports sont reliés par une matrice de corrélation ([src/engine/assumptions.js](../src/engine/assumptions.js)).
3. Le moteur simule N scénarios mensuels conjoints ([src/engine/simulation.js](../src/engine/simulation.js)).
4. À l'horizon, chaque scénario est imposé enveloppe par enveloppe ([src/engine/tax.js](../src/engine/tax.js)).
5. Les distributions brute, nette et en euros constants sont résumées en percentiles et indicateurs de risque.

## 2. Modèle de rendement

### 2.1 Dynamique d'un support risqué

Mouvement brownien géométrique à pas mensuel (Δt = 1/12) :

```
V(t+Δt) = V(t) · exp( (μ_net − σ²/2)·Δt + σ·√Δt·ε )      puis  V += versement × poids × (1 − frais d'entrée)
```

- `μ_net = μ − TER − frais d'enveloppe − impôt annuel éventuel` : les frais sont réellement déduits de la croissance (en v1 ils n'étaient qu'affichés).
- μ est une dérive **arithmétique** : l'espérance de croissance annuelle vaut e^μ − 1 ; le rendement **médian** (géométrique) vaut ≈ μ − σ²/2. Le simulateur affiche les deux pour rendre visible l'érosion due à la volatilité.

### 2.2 Supports à taux garanti

Livrets et fonds en euros (σ = 0) croissent de façon déterministe : `V(t+Δt) = V(t)·(1 + taux)^(1/12)`. Le taux du fonds en euros est indicatif (2,6 % net de frais de gestion, brut de prélèvements sociaux ; 2,5 % pour le PER).

### 2.3 Corrélations

Les chocs indépendants N(0,1) sont corrélés par la décomposition de Cholesky L de la matrice de corrélation R (L·Lᵀ = R) : `ε_corrélés = L · ε`.

- **Prospectif** : corrélations entre classes d'actifs ([src/config/assumptions.js](../src/config/assumptions.js)) ; deux lignes de la même classe (ex. ETF Monde en PEA et en AV) sont corrélées à 0,98. La matrice complète est testée définie positive.
- **Historique** : corrélations de Pearson des rendements logarithmiques mensuels sur 10 ans, calculées paire par paire sur les mois communs (minimum 36).
- **Mixte** : moyenne des deux.
- Si une matrice n'est pas définie positive (estimations paire par paire, saisie incohérente), elle est rétrécie vers l'identité, `R' = (1 − λ)·R + λ·I`, par pas de 2 % jusqu'à validité ; λ est affiché à l'utilisateur ([src/engine/correlation.js](../src/engine/correlation.js)).

### 2.4 Queues épaisses (option)

La loi normale sous-estime la fréquence des krachs. En option, le vecteur de chocs corrélés est multiplié par un facteur commun `√((ν − 2) / χ²_ν)` : on obtient une loi de Student multivariée de variance unitaire. À volatilité inchangée, les chocs extrêmes deviennent plus fréquents **et simultanés** sur tous les actifs risqués (ν = 5 par défaut, réglable de 3 à 30).

### 2.5 Rééquilibrage

Option annuelle : à chaque date anniversaire, les lignes d'une même enveloppe **PEA, AV ou PER** sont ramenées à leurs poids cibles (arbitrages internes non imposés). Il n'y a jamais de transfert entre enveloppes ; le CTO et les crypto-actifs ne sont pas rééquilibrés (cession imposable).

### 2.6 Générateur aléatoire

Générateur `sfc32` initialisé par `splitmix32`, normales par Box-Muller ([src/engine/rng.js](../src/engine/rng.js)). Une même graine et les mêmes paramètres reproduisent exactement les résultats ; la graine figure dans les résultats, le PDF, le CSV et les liens de partage. En mode « historique » ou « mixte », la reproductibilité suppose aussi les mêmes données de marché (datées dans les résultats).

## 3. Hypothèses de rendement

### 3.1 Prospectif (par défaut)

Ordres de grandeur long terme (10–20 ans), nominaux en euros, avant frais et impôts, cohérents avec les projections publiées par les grandes sociétés de gestion, arrondis et volontairement prudents :

| Classe d'actifs | μ | σ |
|---|---|---|
| Monétaire euro | 2,3 % | 0,6 % |
| Obligations d'État zone euro | 3,2 % | 6 % |
| Obligations d'entreprises € | 3,7 % | 6 % |
| Actions monde développé | 7,0 % | 15 % |
| Actions américaines | 7,0 % | 16,5 % |
| Actions technologiques US | 7,5 % | 22 % |
| Actions européennes | 7,0 % | 16 % |
| Petites capitalisations Europe | 7,5 % | 19 % |
| Actions européennes à dividendes | 6,5 % | 15 % |
| Actions émergentes | 7,5 % | 19,5 % |
| Or physique | 4,0 % | 15 % |
| Immobilier (SCPI) | 4,2 % | 5 % |
| Crypto-actifs | 10 % | 65 % |

### 3.2 Historique

Pour chaque support coté (ou son proxy au long historique), à partir des cours mensuels ajustés des dividendes sur 10 ans ([src/market/stats.js](../src/market/stats.js)) :

```
r_m = ln(P_m / P_{m−1})
σ   = écart-type(r_m) × √12
μ   = moyenne(r_m) × 12 + σ²/2 + TER du fonds coté
```

Le TER du fonds coté est rajouté car son cours est déjà net de ses frais ; le TER du support choisi est ensuite déduit, comme en mode prospectif. Un historique de moins de 60 mois n'est pas utilisé (repli sur le prospectif).

**Mise en garde affichée** : la décennie 2016–2026 a été exceptionnelle pour les actions américaines (≈ +15 %/an pour le S&P 500 en euros, ≈ +20 %/an pour le Nasdaq-100) ; l'extrapoler conduit à des projections optimistes.

### 3.3 Frais

| Frais | Valeur par défaut | Application |
|---|---|---|
| TER des ETF | 0,05 % à 0,38 % selon le support | Déduit du rendement chaque mois |
| Gestion AV (unités de compte) | 0,50 %/an | Idem, UC uniquement (le taux du fonds en euros est déjà net) |
| Gestion PER (unités de compte) | 0,60 %/an | Idem |
| Souscription SCPI | 8 % (direct), 2 % (en AV) | Prélevé sur chaque versement |
| Achat de crypto-actifs | 1 % | Idem |

Tous sont modifiables. Les frais cumulés (scénario médian) sont affichés dans les résultats.

## 4. Fiscalité française 2026

Paramètres centralisés dans [src/config/fiscal.js](../src/config/fiscal.js). Hypothèse de modélisation : **rachat total de chaque enveloppe à l'horizon**, en une fois (sortie en capital pour le PER).

### 4.1 Taux

| Élément | Taux 2026 |
|---|---|
| Prélèvements sociaux — revenus du capital (PEA, CTO, PER, crypto) | **18,6 %** (LFSS 2026 : CSG portée à 10,6 %) |
| Prélèvements sociaux — assurance-vie, revenus fonciers, plus-values immobilières | **17,2 %** (exclus de la hausse) |
| PFU — part impôt sur le revenu | 12,8 % (PFU global 31,4 %, ou 30 % pour l'AV) |
| Livret A / LDDS (au 01/08/2026) | 1,7 %, exonérés ; plafonds 22 950 € / 12 000 € |
| LEP (au 01/08/2026) | 2,5 %, exonéré ; plafond 10 000 € |

### 4.2 Règles par enveloppe

Soit `G = valeur finale − montants versés` (frais d'entrée inclus dans la base).

| Enveloppe | Impôt sur le revenu | Prélèvements sociaux |
|---|---|---|
| Livrets | 0 | 0 |
| PEA ≥ 5 ans d'ancienneté | 0 | 18,6 % × G |
| PEA < 5 ans | 12,8 % × G (ou TMI) | 18,6 % × G |
| AV ≥ 8 ans | (G − abattement 4 600 € / 9 200 € en couple) × [7,5 % sur la fraction liée aux primes ≤ 150 000 €, 12,8 % au-delà] (ou TMI) | 17,2 % × G (abattement non applicable) |
| AV < 8 ans | 12,8 % × G (ou TMI) | 17,2 % × G |
| CTO, crypto-actifs | 12,8 % × G (ou TMI) | 18,6 % × G |
| PER, sortie en capital | versements × TMI à la retraite + 12,8 % × G⁺ (ou TMI retraite) | 18,6 % × G⁺ |
| SCPI en direct | 19 % × G × (1 − abattement IR) | 17,2 % × G × (1 − abattement PS) |

- **Ancienneté** : l'ancienneté déjà acquise d'un PEA ou d'une assurance-vie s'ajoute à l'horizon.
- **Compensation** : gains et pertes se compensent au sein d'une enveloppe ; une perte nette ne crée pas de crédit d'impôt ; pas de compensation entre enveloppes (notamment crypto / valeurs mobilières).
- **Option pour le barème** : elle est **globale** en droit français. En mode automatique, le moteur compare dans chaque scénario la somme des IR au PFU et au barème (TMI) et retient la plus faible ; on peut aussi forcer l'un ou l'autre.
- **PER** : chaque année, l'économie d'impôt à l'entrée vaut `min(versements, plafond) × TMI` (plafond 2026 : 37 680 €, modifiable). Elle est affichée séparément et n'est pas réinvestie dans la simulation.
- **SCPI en direct** : la part distribuée (4,6 %/an) est imposée chaque année au titre des revenus fonciers (`TMI + 17,2 %`), ce qui réduit la dérive capitalisée ; l'impôt correspondant est cumulé et affiché. À la revente, abattements pour durée de détention : IR 6 %/an de la 6e à la 21e année puis 4 % la 22e (exonération à 22 ans) ; PS 1,65 %/an de la 6e à la 21e, 1,60 % la 22e, 9 %/an ensuite (exonération à 30 ans).

### 4.3 Sources

- LFSS 2026 (loi n° 2025-1403 du 30/12/2025) — prélèvements sociaux 18,6 % / 17,2 %
- Service-public.fr : [assurance-vie](https://www.service-public.fr/particuliers/vosdroits/F22414), [PEA](https://www.service-public.fr/particuliers/vosdroits/F2385), [PER](https://www.service-public.fr/particuliers/vosdroits/F34982), [plus-value immobilière](https://www.service-public.fr/particuliers/vosdroits/F10864)
- Ministère de l'Économie — [taux de l'épargne réglementée au 01/08/2026](https://presse.economie.gouv.fr/?p=181486)

## 5. Indicateurs

| Indicateur | Définition |
|---|---|
| Percentiles P5 … P95 | Interpolation linéaire entre rangs (méthode « type 7 », comme Excel `CENTILE`) |
| Valeur nette | Valeur brute − impôts de sortie, scénario par scénario |
| Euros constants | Valeur ÷ (1 + inflation)^horizon |
| Probabilité de perte | Part des scénarios où la valeur nette < total versé |
| Perte de pouvoir d'achat | Part des scénarios où la valeur nette en euros constants < total versé |
| Probabilité d'objectif | Part des scénarios où la valeur nette ≥ objectif (converti en euros nominaux s'il est exprimé en euros d'aujourd'hui) |
| Rendement annualisé | TRI des flux mensuels (versements datés, valeur nette finale), par dichotomie |
| CVaR 5 % | Moyenne des valeurs nettes des 5 % pires scénarios |
| Baisse en cours de route | Plus forte baisse depuis un plus haut de la valeur du portefeuille (médiane et 90e percentile des scénarios) ; les versements l'atténuent |
| Médianes par support / enveloppe | Calculées séparément : leur somme diffère de la médiane du portefeuille (la médiane d'une somme n'est pas la somme des médianes) |

## 6. Limites connues

- Hypothèses de rendement, volatilités et corrélations constantes : pas de régimes de marché (inflation, taux, valorisations), pas de retour à la moyenne.
- Pas de retraits en cours de route, pas de rachats fractionnés optimisant l'abattement annuel de l'assurance-vie, pas de phase de décumulation.
- La sortie du PER est imposée au taux marginal indiqué, sans effet de progressivité du barème sur un capital important.
- Non modélisés : prélèvements sociaux annuels sur les intérêts des fonds en euros (effet de capitalisation mineur), CSG déductible en cas d'option pour le barème, abattement de 40 % sur les dividendes, IFI, transmission, plafonnement global des niches fiscales, contribution exceptionnelle sur les hauts revenus.
- Les plafonds réglementaires (livrets, PEA, déduction PER) font l'objet d'alertes mais ne bornent pas les versements simulés.

## 7. Validation

Plus de 120 tests automatisés ([test/](../test)) vérifient notamment :

- la convergence de la médiane et de la moyenne simulées vers les formules fermées du mouvement brownien géométrique ;
- la corrélation empirique des chocs, l'épaississement des queues en loi de Student, la reproductibilité par graine ;
- chaque règle fiscale (seuils de 5 et 8 ans, abattements, seuil de 150 000 €, PER, plus-values immobilières, option globale pour le barème) ;
- le TRI sur 50 ans de versements, les frais, le rééquilibrage, l'économie d'impôt PER ;
- la collecte des données de marché (réponses simulées), la cascade de repli, la validation des données et des liens de partage.
