import { runSimulation } from './engine/simulation.js';

// Exécute le moteur Monte Carlo hors du fil principal : l'interface
// reste fluide et une barre de progression peut être affichée.
self.onmessage = event => {
  const { id, params } = event.data;
  try {
    const result = runSimulation({ ...params, onProgress: fraction => self.postMessage({ id, type: 'progress', fraction }) });
    self.postMessage({ id, type: 'result', result });
  } catch (err) {
    self.postMessage({ id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
