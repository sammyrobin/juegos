// localStorage wrapper: private windows, blocked storage or quota errors must never
// break the game, so every access is wrapped and falls back to defaults.

const KEY = 'juegos.turbo-pista.v1';

const DEFAULTS = {
  best: 0,
  bestDistance: 0,     // best distance in a single run: it unlocks the extra cars
  car: 0,
  musicVol: 0.6,       // "Música/Motor" channel
  sfxVol: 0.7,         // "Efectos" channel
  musicMuted: false,
  sfxMuted: false,
  nickname: '',        // last nickname used for the global ranking
};

let cache = null;

const unit = (v, d) => (Number.isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : d);

export function load() {
  if (cache) return cache;
  let data = {};
  try {
    data = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    data = {};
  }
  // Older versions had a single mute switch for everything.
  if (data.muted === true && data.musicMuted === undefined) data.musicMuted = data.sfxMuted = true;
  delete data.muted;
  cache = { ...DEFAULTS, ...data };
  cache.best = Number(cache.best) || 0;
  cache.bestDistance = Number(cache.bestDistance) || 0;
  cache.car = Math.min(7, Math.max(0, Number(cache.car) | 0));
  cache.musicVol = unit(cache.musicVol, DEFAULTS.musicVol);
  cache.sfxVol = unit(cache.sfxVol, DEFAULTS.sfxVol);
  cache.musicMuted = cache.musicMuted === true;
  cache.sfxMuted = cache.sfxMuted === true;
  cache.nickname = typeof cache.nickname === 'string' ? cache.nickname.slice(0, 12) : '';
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
