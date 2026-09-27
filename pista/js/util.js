// Small math and color helpers shared by every module.

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeIn = (a, b, t) => a + (b - a) * t * t;
export const easeOut = (a, b, t) => a + (b - a) * (1 - (1 - t) * (1 - t));
export const easeInOut = (a, b, t) => a + (b - a) * (-Math.cos(t * Math.PI) / 2 + 0.5);

export const rand = (min, max) => min + Math.random() * (max - min);
export const randInt = (min, max) => Math.floor(rand(min, max + 1));
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const chance = (p) => Math.random() < p;

/** Move `value` towards `target` by at most `step`. */
export function approach(value, target, step) {
  return value < target ? Math.min(value + step, target) : Math.max(value - step, target);
}

/** Frame-rate independent exponential smoothing: 1 - e^(-rate * dt). */
export const smooth = (rate, dt) => 1 - Math.exp(-rate * dt);

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const mixRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export function rgb(c, alpha = 1) {
  const r = c[0] | 0, g = c[1] | 0, b = c[2] | 0;
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}

/** Darken (t < 0) or lighten (t > 0) an rgb triple. */
export const shade = (c, t) => (t < 0 ? mixRgb(c, [0, 0, 0], -t) : mixRgb(c, [255, 255, 255], t));

/** Deterministic pseudo random numbers (mulberry32) for scenery that must not flicker. */
export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function polygon(ctx, points, fill, stroke, lineWidth) {
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.lineJoin = 'round'; ctx.stroke(); }
}

export function roundRect(ctx, x, y, w, h, r, fill, stroke, lineWidth) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

export const formatInt = (n, locale) => Math.floor(n).toLocaleString(locale);

// Older Safari/Firefox lack ctx.roundRect: a minimal fallback with one radius.
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    const radius = Math.min(typeof r === 'number' ? r : 0, w / 2, h / 2);
    this.moveTo(x + radius, y);
    this.arcTo(x + w, y, x + w, y + h, radius);
    this.arcTo(x + w, y + h, x, y + h, radius);
    this.arcTo(x, y + h, x, y, radius);
    this.arcTo(x, y, x + w, y, radius);
    this.closePath();
  };
}
