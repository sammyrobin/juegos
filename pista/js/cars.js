// Original car designs drawn with Canvas paths (no real models, no brands).
// Every car has a rear view (in-game) and a side view (menu cards and the loop scene).
// Coordinates are in a 100 × 64 box (rear) or 120 × 48 box (side), scaled to any size.

import { makeCanvas, polygon, roundRect } from './util.js';

const INK = '#141414';
const TIRE = '#1E1E22';
const GLASS = '#1B2350';
const GLASS_HI = 'rgba(255,255,255,0.35)';
const LIGHT = '#FF2A2A';
const CHROME = '#C9CED6';

export const PLAYER_CARS = [
  { id: 'brasa', style: 'wedge', body: '#DD0200', dark: '#A30100', accent: '#FFCC00' },
  { id: 'marea', style: 'round', body: '#1F4BFF', dark: '#1535C2', accent: '#FFFFFF' },
  { id: 'chispa', style: 'buggy', body: '#FFCC00', dark: '#D9A800', accent: '#DD0200' },
  { id: 'eclipse', style: 'muscle', body: '#26262C', dark: '#141418', accent: '#FF3B3B', glow: '#3D7BFF' },
];

export const RIVAL_CARS = [
  { id: 'van', style: 'van', body: '#1E8A3C', dark: '#156B2D', accent: '#FFF3E3' },
  { id: 'compact', style: 'compact', body: '#7B3FE4', dark: '#5C2BB3', accent: '#FFCC00' },
  { id: 'pickup', style: 'pickup', body: '#F2F2F2', dark: '#C9C9C9', accent: '#1F9E9E' },
];

// ---------------------------------------------------------------------------
// Rear view
// ---------------------------------------------------------------------------

function tires(ctx, lw, big) {
  const y = big ? 26 : 38, h = 64 - y, w = big ? 22 : 17;
  for (const x of [big ? 1 : 5, big ? 77 : 78]) {
    roundRect(ctx, x, y, w, h, 5, TIRE, INK, lw);
    ctx.fillStyle = '#34343A';
    for (let i = y + 5; i < 62; i += 6) ctx.fillRect(x + 3, i, w - 6, 2);
  }
}

function tailLights(ctx, lw, shape, y = 34) {
  if (shape === 'round') {
    for (const x of [22, 78]) {
      ctx.beginPath(); ctx.arc(x, y + 3, 5, 0, Math.PI * 2);
      ctx.fillStyle = LIGHT; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke();
    }
    return;
  }
  if (shape === 'bar') {
    roundRect(ctx, 14, y, 72, 6, 3, LIGHT, INK, lw);
    return;
  }
  roundRect(ctx, 12, y, 19, 7, 3, LIGHT, INK, lw);
  roundRect(ctx, 69, y, 19, 7, 3, LIGHT, INK, lw);
}

function plate(ctx, lw, y = 42) {
  roundRect(ctx, 40, y, 20, 8, 2, '#FFF3E3', INK, lw * 0.7);
  ctx.fillStyle = INK;
  ctx.fillRect(43, y + 3, 14, 2);
}

function exhausts(ctx, lw, xs = [36, 64], y = 57) {
  for (const x of xs) {
    ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = '#50535A'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw * 0.7; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fillStyle = '#111'; ctx.fill();
  }
}

function glass(ctx, pts, lw) {
  polygon(ctx, pts, GLASS, INK, lw);
  // Diagonal highlight across the rear window.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = GLASS_HI;
  const minX = Math.min(...pts.filter((_, i) => i % 2 === 0));
  const minY = Math.min(...pts.filter((_, i) => i % 2 === 1));
  ctx.beginPath();
  ctx.moveTo(minX + 6, minY + 20); ctx.lineTo(minX + 16, minY - 2); ctx.lineTo(minX + 22, minY - 2); ctx.lineTo(minX + 12, minY + 20);
  ctx.fill();
  ctx.restore();
}

const REAR = {
  wedge(ctx, s, lw) {
    tires(ctx, lw);
    polygon(ctx, [6, 56, 94, 56, 96, 36, 84, 26, 16, 26, 4, 36], s.body, INK, lw);
    polygon(ctx, [30, 26, 36, 14, 64, 14, 70, 26], s.dark, INK, lw);
    glass(ctx, [34, 25, 39, 16, 61, 16, 66, 25], lw);
    ctx.fillStyle = s.accent; ctx.fillRect(46, 27, 8, 29);
    tailLights(ctx, lw, 'split');
    ctx.fillStyle = INK; ctx.fillRect(8, 49, 84, 4);
    plate(ctx, lw);
    exhausts(ctx, lw);
    // Rear wing on two posts.
    ctx.fillStyle = INK; ctx.fillRect(28, 8, 4, 20); ctx.fillRect(68, 8, 4, 20);
    roundRect(ctx, 6, 3, 88, 8, 3, s.dark, INK, lw);
    roundRect(ctx, 4, 0, 6, 14, 2, s.accent, INK, lw * 0.8);
    roundRect(ctx, 90, 0, 6, 14, 2, s.accent, INK, lw * 0.8);
  },
  round(ctx, s, lw) {
    tires(ctx, lw);
    ctx.beginPath();
    ctx.moveTo(6, 56); ctx.lineTo(94, 56); ctx.lineTo(95, 40);
    ctx.quadraticCurveTo(94, 24, 72, 24); ctx.lineTo(28, 24); ctx.quadraticCurveTo(6, 24, 5, 40); ctx.closePath();
    ctx.fillStyle = s.body; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke();
    // Bubble canopy.
    ctx.beginPath(); ctx.moveTo(28, 25); ctx.quadraticCurveTo(30, 6, 50, 6); ctx.quadraticCurveTo(70, 6, 72, 25); ctx.closePath();
    ctx.fillStyle = GLASS; ctx.fill(); ctx.stroke();
    ctx.fillStyle = GLASS_HI; ctx.beginPath(); ctx.ellipse(42, 13, 5, 3, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = s.accent; ctx.fillRect(40, 25, 5, 31); ctx.fillRect(55, 25, 5, 31);
    tailLights(ctx, lw, 'round');
    plate(ctx, lw, 44);
    exhausts(ctx, lw, [50], 58);
  },
  buggy(ctx, s, lw) {
    tires(ctx, lw, true);
    // Roll bar.
    ctx.strokeStyle = INK; ctx.lineWidth = lw * 2.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(26, 32); ctx.lineTo(30, 10); ctx.lineTo(70, 10); ctx.lineTo(74, 32); ctx.stroke();
    ctx.strokeStyle = CHROME; ctx.lineWidth = lw * 1.1; ctx.stroke();
    polygon(ctx, [18, 54, 82, 54, 84, 34, 72, 28, 28, 28, 16, 34], s.body, INK, lw);
    // Exposed engine with a chrome blower.
    roundRect(ctx, 36, 16, 28, 14, 3, CHROME, INK, lw);
    ctx.fillStyle = '#7C828C'; for (let x = 39; x < 62; x += 4) ctx.fillRect(x, 18, 2, 10);
    roundRect(ctx, 42, 8, 16, 9, 2, s.accent, INK, lw);
    tailLights(ctx, lw, 'split', 36);
    plate(ctx, lw, 44);
    ctx.strokeStyle = CHROME; ctx.lineWidth = lw * 1.4;
    ctx.beginPath(); ctx.moveTo(30, 54); ctx.lineTo(30, 60); ctx.moveTo(70, 54); ctx.lineTo(70, 60); ctx.stroke();
  },
  muscle(ctx, s, lw) {
    tires(ctx, lw);
    polygon(ctx, [5, 56, 95, 56, 96, 30, 90, 26, 10, 26, 4, 30], s.body, '#5A5A66', lw);
    polygon(ctx, [22, 26, 28, 12, 72, 12, 78, 26], s.dark, '#5A5A66', lw);
    glass(ctx, [26, 25, 31, 14, 69, 14, 74, 25], lw);
    ctx.fillStyle = s.dark; for (let y = 16; y < 24; y += 3) ctx.fillRect(31, y, 38, 1.2);
    ctx.fillStyle = s.accent; ctx.fillRect(40, 12, 6, 44); ctx.fillRect(54, 12, 6, 44);
    tailLights(ctx, lw, 'bar', 32);
    // Ducktail spoiler.
    polygon(ctx, [8, 27, 92, 27, 94, 23, 6, 23], s.dark, '#5A5A66', lw * 0.8);
    plate(ctx, lw, 43);
    exhausts(ctx, lw, [18, 82], 57);
  },
  van(ctx, s, lw) {
    tires(ctx, lw);
    roundRect(ctx, 8, 4, 84, 52, 6, s.body, INK, lw);
    glass(ctx, [16, 24, 16, 10, 47, 10, 47, 24], lw);
    glass(ctx, [53, 24, 53, 10, 84, 10, 84, 24], lw);
    ctx.fillStyle = INK; ctx.fillRect(49, 6, 2, 48);
    ctx.fillStyle = s.accent; ctx.fillRect(8, 28, 84, 4);
    tailLights(ctx, lw, 'split', 36);
    ctx.fillStyle = INK; ctx.fillRect(6, 50, 88, 6);
  },
  compact(ctx, s, lw) {
    tires(ctx, lw);
    ctx.beginPath();
    ctx.moveTo(8, 56); ctx.lineTo(92, 56); ctx.lineTo(92, 34); ctx.quadraticCurveTo(90, 10, 50, 10); ctx.quadraticCurveTo(10, 10, 8, 34); ctx.closePath();
    ctx.fillStyle = s.body; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke();
    glass(ctx, [22, 28, 28, 15, 72, 15, 78, 28], lw);
    tailLights(ctx, lw, 'round', 34);
    ctx.fillStyle = s.accent; ctx.fillRect(10, 42, 80, 3);
    plate(ctx, lw, 46);
  },
  pickup(ctx, s, lw) {
    tires(ctx, lw);
    roundRect(ctx, 24, 4, 52, 24, 5, s.body, INK, lw);
    glass(ctx, [29, 24, 29, 9, 71, 9, 71, 24], lw);
    roundRect(ctx, 6, 26, 88, 30, 4, s.body, INK, lw);
    ctx.fillStyle = s.accent; ctx.fillRect(6, 30, 88, 5);
    tailLights(ctx, lw, 'split', 38);
    ctx.fillStyle = INK; ctx.fillRect(6, 51, 88, 5);
    plate(ctx, lw, 43);
  },
};

/** Rear view sprite on its own canvas (width px). */
export function renderCarRear(spec, width) {
  const h = width * 0.64;
  const c = makeCanvas(width, h + width * 0.04);
  const ctx = c.getContext('2d');
  ctx.translate(width * 0.02, width * 0.02);
  ctx.scale((width * 0.96) / 100, (h * 0.96) / 64);
  REAR[spec.style](ctx, spec, 2.4);
  return c;
}

// ---------------------------------------------------------------------------
// Side view (facing right)
// ---------------------------------------------------------------------------

function wheel(ctx, x, y, r, lw, rimColor = CHROME) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = TIRE; ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, Math.PI * 2); ctx.fillStyle = rimColor; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 0.16, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
}

const SIDE = {
  wedge(ctx, s, lw) {
    polygon(ctx, [6, 36, 6, 24, 44, 20, 64, 11, 84, 11, 114, 25, 117, 33, 114, 38, 8, 38], s.body, INK, lw);
    polygon(ctx, [60, 20, 67, 13, 82, 13, 96, 20], GLASS, INK, lw);
    ctx.fillStyle = s.accent; ctx.fillRect(10, 28, 100, 3);
    ctx.fillStyle = INK; ctx.fillRect(8, 11, 3, 13);
    roundRect(ctx, 2, 7, 22, 5, 2, s.dark, INK, lw * 0.8);
    wheel(ctx, 28, 38, 9, lw); wheel(ctx, 94, 38, 9, lw);
  },
  round(ctx, s, lw) {
    ctx.beginPath();
    ctx.moveTo(8, 38); ctx.lineTo(6, 28); ctx.quadraticCurveTo(8, 20, 30, 20);
    ctx.quadraticCurveTo(50, 6, 70, 18); ctx.lineTo(100, 20); ctx.quadraticCurveTo(116, 22, 116, 32); ctx.lineTo(114, 38); ctx.closePath();
    ctx.fillStyle = s.body; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(40, 20); ctx.quadraticCurveTo(52, 9, 66, 19); ctx.closePath(); ctx.fillStyle = GLASS; ctx.fill(); ctx.stroke();
    ctx.fillStyle = s.accent; ctx.fillRect(12, 27, 100, 2.5); ctx.fillRect(12, 31, 100, 2.5);
    wheel(ctx, 28, 38, 9, lw); wheel(ctx, 94, 38, 9, lw);
  },
  buggy(ctx, s, lw) {
    ctx.strokeStyle = INK; ctx.lineWidth = lw * 2.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(34, 24); ctx.lineTo(44, 6); ctx.lineTo(70, 6); ctx.lineTo(78, 24); ctx.stroke();
    ctx.strokeStyle = CHROME; ctx.lineWidth = lw; ctx.stroke();
    polygon(ctx, [14, 34, 16, 24, 40, 22, 84, 22, 108, 28, 110, 34], s.body, INK, lw);
    roundRect(ctx, 18, 12, 22, 12, 3, CHROME, INK, lw);
    roundRect(ctx, 22, 5, 12, 8, 2, s.accent, INK, lw);
    wheel(ctx, 28, 34, 13, lw); wheel(ctx, 96, 36, 11, lw);
  },
  muscle(ctx, s, lw) {
    polygon(ctx, [4, 37, 4, 22, 34, 20, 48, 11, 80, 11, 94, 20, 116, 22, 117, 37], s.body, '#5A5A66', lw);
    polygon(ctx, [50, 19, 55, 13, 78, 13, 88, 19], GLASS, '#5A5A66', lw);
    ctx.fillStyle = s.accent; ctx.fillRect(6, 25, 108, 3);
    ctx.fillStyle = s.glow; ctx.globalAlpha = 0.5; ctx.fillRect(14, 41, 94, 3); ctx.globalAlpha = 1;
    wheel(ctx, 26, 37, 9, lw, '#8A8F99'); wheel(ctx, 96, 37, 9, lw, '#8A8F99');
  },
};

/** Side view sprite on its own canvas (width px). */
export function renderCarSide(spec, width) {
  const h = width * 0.42;
  const c = makeCanvas(width, h);
  const ctx = c.getContext('2d');
  ctx.scale(width / 120, h / 50);
  SIDE[spec.style](ctx, spec, 2.2);
  return c;
}
