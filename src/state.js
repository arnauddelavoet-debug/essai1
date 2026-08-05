/** État global de l'application — partagé entre ui.js, pdf.js et charts.js. */
export const state = {
  capital: 10000,
  horizon: 10,
  risk: 'conservateur',
  mensuel: 0,
  tmi: 30,
  allocations: {},
  excludedProducts: new Set(),
  simResults: null,
};
