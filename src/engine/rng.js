// ----------------------------------------------------------------
// GÉNÉRATEUR PSEUDO-ALÉATOIRE À GRAINE
// Math.random() n'est pas reproductible : deux lancements avec les
// mêmes paramètres donnaient des résultats légèrement différents, ce
// qui empêchait de partager ou d'auditer une simulation. On utilise
// sfc32 (Small Fast Chaotic, période ≈ 2^128, excellente qualité
// statistique, très rapide en JS) initialisé par splitmix32.
// ----------------------------------------------------------------

function splitmix32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
}

/** Graine aléatoire (32 bits) pour une nouvelle simulation. */
export function randomSeed() {
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 2 ** 32) >>> 0;
}

/**
 * Crée un générateur reproductible.
 * @param {number} seed entier 32 bits
 * @returns {{ uniform(): number, normal(): number, chiSquare(df: number): number }}
 */
export function createRng(seed) {
  const init = splitmix32(seed);
  let a = init(), b = init(), c = init(), d = init();

  function next() {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const r = (t + d) | 0;
    c = (c + r) | 0;
    return r >>> 0;
  }

  // Préchauffage : élimine la corrélation résiduelle avec la graine.
  for (let i = 0; i < 15; i++) next();

  /** Uniforme sur ]0, 1[ (jamais 0, pour log()). */
  function uniform() {
    return (next() + 0.5) / 4294967296;
  }

  // Box-Muller : deux N(0,1) indépendantes par paire d'uniformes ; la
  // seconde est mise en cache (« spare ») pour diviser le coût par deux.
  let spare = null;
  function normal() {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    const mag = Math.sqrt(-2 * Math.log(uniform()));
    const angle = 2 * Math.PI * uniform();
    spare = mag * Math.sin(angle);
    return mag * Math.cos(angle);
  }

  /** Loi du χ² à df degrés de liberté (df entier) : somme de df carrés de N(0,1). */
  function chiSquare(df) {
    let s = 0;
    for (let i = 0; i < df; i++) {
      const z = normal();
      s += z * z;
    }
    return s;
  }

  return { uniform, normal, chiSquare };
}
