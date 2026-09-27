// Ambients: day → sunset → night, one per level (then the cycle repeats, harder).
// Colors are hex here and converted once to rgb triples so two ambients can be blended
// smoothly while the level banner is on screen.

import { hexToRgb, lerp, mixRgb, rgb, shade } from './util.js';

const RAW = [
  {
    name: 'day',
    skyTop: '#4FB3FF', skyBottom: '#D6F0FF',
    sun: '#FFE36B', sunY: 0.55, sunR: 0.07,
    hillFar: '#9ED88F', hillNear: '#5DB35A', city: '#7FC6E8',
    grassA: '#8FD16B', grassB: '#84C95F',
    roadA: '#FF8A1F', roadB: '#F77F12', lane: '#FFCC00',
    wallA: '#1F4BFF', wallB: '#3B63FF', wallTop: '#A8BCFF',
    fog: '#D6F0FF', fogDensity: 3.2,
    tint: '#000000', tintAlpha: 0,
    night: 0, stars: 0, clouds: 1,
  },
  {
    name: 'sunset',
    skyTop: '#3B2A77', skyBottom: '#FFB35C',
    sun: '#FFD166', sunY: 0.92, sunR: 0.14,
    hillFar: '#A0527A', hillNear: '#6B3A6E', city: '#8A4A7A',
    grassA: '#8FA35A', grassB: '#83974F',
    roadA: '#F2701A', roadB: '#E9660F', lane: '#FFD23F',
    wallA: '#2C3FBF', wallB: '#3A4FD6', wallTop: '#B7A6F0',
    fog: '#FFB35C', fogDensity: 3.8,
    tint: '#5A1E3C', tintAlpha: 0.22,
    night: 0.35, stars: 0.15, clouds: 0.8,
  },
  {
    name: 'night',
    skyTop: '#050818', skyBottom: '#1B2350',
    sun: '#F4F1DE', sunY: 0.35, sunR: 0.05,
    hillFar: '#18214A', hillNear: '#0F1533', city: '#141C44',
    grassA: '#1C3A2C', grassB: '#183426',
    roadA: '#C35A18', roadB: '#B75214', lane: '#FFD84A',
    wallA: '#1735B5', wallB: '#2344D0', wallTop: '#6C8CFF',
    fog: '#1B2350', fogDensity: 4.6,
    tint: '#0A1030', tintAlpha: 0.5,
    night: 1, stars: 1, clouds: 0.25,
  },
];

const COLOR_KEYS = Object.keys(RAW[0]).filter((k) => typeof RAW[0][k] === 'string' && RAW[0][k].startsWith('#'));

export const AMBIENTS = RAW.map((raw) => {
  const out = { ...raw };
  for (const k of COLOR_KEYS) out[k] = hexToRgb(raw[k]);
  return out;
});

/** Ambient used by a level (1-based): 1 day, 2 sunset, 3 night, 4 day… */
export const ambientIndexForLevel = (level) => (level - 1) % AMBIENTS.length;

/** Blend two ambients and add ready-to-use css strings (`css.skyTop`, …). */
export function blendAmbients(a, b, t) {
  const out = { css: {} };
  for (const k of Object.keys(a)) {
    if (k === 'name') continue;
    const va = a[k], vb = b[k];
    out[k] = Array.isArray(va) ? mixRgb(va, vb, t) : lerp(va, vb, t);
  }
  out.name = t < 0.5 ? a.name : b.name;
  for (const k of COLOR_KEYS) out.css[k] = rgb(out[k]);
  out.css.wallOuter = rgb(shade(out.wallA, -0.35));
  return out;
}
