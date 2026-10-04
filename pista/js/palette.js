// Rooms: the toy track crosses the house, one room per level (then the cycle repeats,
// harder): bedroom (morning) → living room (evening lamp) → kitchen → garden (night).
// Colors are hex here and converted once to rgb triples so two rooms can be blended
// smoothly while the level banner is on screen.

import { hexToRgb, lerp, mixRgb, rgb, shade } from './util.js';

const ROAD = { roadA: '#FF8A1F', roadB: '#F7821A', groove: '#D9660A', seam: '#A84800', wallA: '#F07A12', wallB: '#E87010', wallTop: '#FFB45C' };

export const RAW = [
  {
    name: 'room', floor: 'planks',
    skyTop: '#A9D8F5', skyBottom: '#D3EEFB', sun: '#FFF4C2', sunY: 0.5, sunR: 0,
    trim: '#FFFFFF', furnA: '#E85D75', furnB: '#F2C14E', furnC: '#4F7CE0', wood: '#C98B4F',
    floorA: '#D9A066', floorB: '#CF965C', floorLine: '#A8703E', rug: '#3F73D8', rugEdge: '#FFF3E3', rugW: 2.1,
    ...ROAD,
    fog: '#D3EEFB', fogDensity: 3.0,
    tint: '#000000', tintAlpha: 0,
    night: 0, stars: 0,
  },
  {
    name: 'living', floor: 'planks',
    skyTop: '#E39A62', skyBottom: '#F6CFA0', sun: '#FFD166', sunY: 0.5, sunR: 0,
    trim: '#8A4B2A', furnA: '#2F8A78', furnB: '#7A3E2B', furnC: '#F2E3C6', wood: '#8A4B2A',
    floorA: '#9C5F37', floorB: '#935833', floorLine: '#6E3F20', rug: '#B8323F', rugEdge: '#F2C14E', rugW: 2.8,
    ...ROAD, roadA: '#F77F1A', roadB: '#EE7814',
    fog: '#F6CFA0', fogDensity: 3.4,
    tint: '#5A1E3C', tintAlpha: 0.12,
    night: 0.3, stars: 0,
  },
  {
    name: 'kitchen', floor: 'tiles',
    skyTop: '#C4EADF', skyBottom: '#E9F8F3', sun: '#FFFFFF', sunY: 0.5, sunR: 0,
    trim: '#2E8B7A', furnA: '#FAFAF5', furnB: '#E4572E', furnC: '#7FB3C8', wood: '#C98B4F',
    floorA: '#F4F1EA', floorB: '#EDE8DD', floorLine: '#34495E', rug: '#34495E', rugEdge: '#34495E', rugW: 0,
    ...ROAD,
    fog: '#E9F8F3', fogDensity: 3.0,
    tint: '#000000', tintAlpha: 0,
    night: 0, stars: 0,
  },
  {
    name: 'garden', floor: 'grass',
    skyTop: '#050818', skyBottom: '#1B2350', sun: '#F4F1DE', sunY: 0.32, sunR: 0.05,
    trim: '#5A4030', furnA: '#E85D9E', furnB: '#FFD84A', furnC: '#3E7BD6', wood: '#6B4A2E',
    floorA: '#1E3D2C', floorB: '#1A3627', floorLine: '#12291F', rug: '#4A3A2C', rugEdge: '#33271D', rugW: 1.55,
    ...ROAD, roadA: '#C9601A', roadB: '#C05A16', groove: '#9A4410', seam: '#6E2E06', wallA: '#BE5A12', wallB: '#B55410', wallTop: '#E08A3C',
    fog: '#1B2350', fogDensity: 4.6,
    tint: '#0A1030', tintAlpha: 0.5,
    night: 1, stars: 1,
  },
];

const COLOR_KEYS = Object.keys(RAW[0]).filter((k) => typeof RAW[0][k] === 'string' && RAW[0][k].startsWith('#'));

export const AMBIENTS = RAW.map((raw) => {
  const out = { ...raw };
  for (const k of COLOR_KEYS) out[k] = hexToRgb(raw[k]);
  return out;
});

/** Room used by a level (1-based): 1 bedroom, 2 living room, 3 kitchen, 4 garden, 5 bedroom… */
export const ambientIndexForLevel = (level) => (level - 1) % AMBIENTS.length;

/** Blend two rooms and add ready-to-use css strings (`css.skyTop`, …). */
export function blendAmbients(a, b, t) {
  const out = { css: {} };
  for (const k of Object.keys(a)) {
    const va = a[k], vb = b[k];
    if (typeof va === 'string') out[k] = t < 0.5 ? va : vb;
    else out[k] = Array.isArray(va) ? mixRgb(va, vb, t) : lerp(va, vb, t);
  }
  for (const k of COLOR_KEYS) out.css[k] = rgb(out[k]);
  out.css.wallOuter = rgb(shade(out.wallA, -0.3));
  out.css.floorDeep = rgb(shade(out.floorB, -0.35));
  return out;
}
