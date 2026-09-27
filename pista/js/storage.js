// localStorage wrapper: private windows, blocked storage or quota errors must never
// break the game, so every access is wrapped and falls back to defaults.

const KEY = 'juegos.turbo-pista.v1';

const DEFAULTS = { best: 0, bestDistance: 0, car: 0, muted: false };

let cache = null;

export function load() {
  if (cache) return cache;
  let data = {};
  try {
    data = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    data = {};
  }
  cache = { ...DEFAULTS, ...data };
  cache.best = Number(cache.best) || 0;
  cache.car = Math.min(3, Math.max(0, Number(cache.car) | 0));
  return cache;
}

export function save(patch) {
  cache = { ...load(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Storage unavailable: keep the values for this session only.
  }
  return cache;
}
