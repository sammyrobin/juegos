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

// Four original designs, identified only by color, race number and stats (1…5).
// Each one drives a little differently (see player.js).
export const PLAYER_CARS = [
  { num: '07', color: 'red', style: 'track', body: '#DD0200', dark: '#A30100', accent: '#FFFFFF', stats: { speed: 4, accel: 3, handling: 5 } },
  { num: '21', color: 'blue', style: 'muscle', body: '#1F4BFF', dark: '#1535C2', accent: '#FFFFFF', stats: { speed: 5, accel: 4, handling: 3 } },
  { num: '33', color: 'yellow', style: 'jdm', body: '#FFCC00', dark: '#D9A800', accent: '#141414', stats: { speed: 3, accel: 5, handling: 4 } },
  { num: '88', color: 'purple', style: 'hotrod', body: '#7B3FE4', dark: '#5A2BB0', accent: '#FF7A00', flame: '#FFCC00', stats: { speed: 5, accel: 5, handling: 2 } },
];

export const RIVAL_CARS = [
  { id: 'van', style: 'van', body: '#1E8A3C', dark: '#156B2D', accent: '#FFF3E3' },
  { id: 'compact', style: 'compact', body: '#FF5FA2', dark: '#D93F80', accent: '#FFF3E3' },
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

function tiresAt(ctx, lw, y, w, xs) {
  for (const x of xs) {
    roundRect(ctx, x, y, w, 64 - y, 5, TIRE, INK, lw);
    ctx.fillStyle = '#34343A';
    for (let i = y + 5; i < 62; i += 6) ctx.fillRect(x + 3, i, w - 6, 2);
  }
}

/** White race-number roundel. */
function raceNumber(ctx, num, x, y, r, lw) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw * 0.7; ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = '900 ' + r * 1.12 + 'px "Arial Black", Impact, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(num, x, y + r * 0.06);
}

const REAR = {
  // 07: modern track car. Very wide and low, light bar, diffuser and a tall wing.
  track(ctx, s, lw) {
    tiresAt(ctx, lw, 38, 20, [2, 78]);
    polygon(ctx, [2, 57, 98, 57, 99, 42, 91, 31, 9, 31, 1, 42], s.body, INK, lw);
    polygon(ctx, [6, 41, 17, 37, 17, 50, 6, 52], s.dark, INK, lw * 0.8);
    polygon(ctx, [94, 41, 83, 37, 83, 50, 94, 52], s.dark, INK, lw * 0.8);
    polygon(ctx, [35, 31, 40, 21, 60, 21, 65, 31], s.dark, INK, lw);
    glass(ctx, [38, 30, 42, 23, 58, 23, 62, 30], lw);
    roundRect(ctx, 12, 34, 76, 4, 2, LIGHT, INK, lw * 0.7);
    roundRect(ctx, 20, 50, 60, 7, 2, INK);
    ctx.fillStyle = s.dark; for (let x = 26; x < 76; x += 9) ctx.fillRect(x, 51, 3, 6);
    raceNumber(ctx, s.num, 50, 44, 5.4, lw);
    ctx.fillStyle = INK; ctx.fillRect(40, 12, 3, 20); ctx.fillRect(57, 12, 3, 20);
    roundRect(ctx, 3, 7, 94, 7, 3, s.dark, INK, lw);
    ctx.fillStyle = s.accent; ctx.fillRect(6, 9.5, 88, 2);
    roundRect(ctx, 0, 3, 6, 15, 2, s.body, INK, lw * 0.8);
    roundRect(ctx, 94, 3, 6, 15, 2, s.body, INK, lw * 0.8);
  },
  // 21: classic American muscle car. Boxy, twin stripes, chrome bumper, fat tires.
  muscle(ctx, s, lw) {
    tiresAt(ctx, lw, 36, 21, [2, 77]);
    polygon(ctx, [4, 56, 96, 56, 97, 30, 92, 24, 8, 24, 3, 30], s.body, INK, lw);
    polygon(ctx, [22, 24, 27, 10, 73, 10, 78, 24], s.dark, INK, lw);
    glass(ctx, [26, 23, 30, 12, 70, 12, 74, 23], lw);
    ctx.fillStyle = s.accent; ctx.fillRect(40, 10, 6, 46); ctx.fillRect(54, 10, 6, 46);
    polygon(ctx, [7, 25, 93, 25, 95, 21, 5, 21], s.dark, INK, lw * 0.8);
    roundRect(ctx, 9, 29, 30, 6, 2, LIGHT, INK, lw * 0.8);
    roundRect(ctx, 61, 29, 30, 6, 2, LIGHT, INK, lw * 0.8);
    raceNumber(ctx, s.num, 50, 40, 6, lw);
    roundRect(ctx, 1, 48, 98, 6, 3, CHROME, INK, lw * 0.8);
    exhausts(ctx, lw, [15, 85], 58);
  },
  // 33: smooth 90s Japanese-style coupe. Rounded body, oval lights, a small lip wing.
  jdm(ctx, s, lw) {
    tiresAt(ctx, lw, 38, 17, [5, 78]);
    ctx.beginPath();
    ctx.moveTo(5, 56); ctx.lineTo(95, 56); ctx.lineTo(96, 40); ctx.quadraticCurveTo(95, 28, 80, 27);
    ctx.lineTo(20, 27); ctx.quadraticCurveTo(5, 28, 4, 40); ctx.closePath();
    ctx.fillStyle = s.body; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(26, 28); ctx.quadraticCurveTo(30, 12, 50, 12); ctx.quadraticCurveTo(70, 12, 74, 28); ctx.closePath();
    ctx.fillStyle = s.dark; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(30, 27); ctx.quadraticCurveTo(33, 15, 50, 15); ctx.quadraticCurveTo(67, 15, 70, 27); ctx.closePath();
    ctx.fillStyle = GLASS; ctx.fill(); ctx.stroke();
    ctx.fillStyle = GLASS_HI; ctx.beginPath(); ctx.ellipse(40, 20, 5, 2.4, -0.4, 0, Math.PI * 2); ctx.fill();
    roundRect(ctx, 33, 33, 34, 6, 3, s.dark, INK, lw * 0.7);
    for (const x of [20, 80]) {
      ctx.beginPath(); ctx.ellipse(x, 36, 9, 3.6, 0, 0, Math.PI * 2);
      ctx.fillStyle = LIGHT; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw * 0.8; ctx.stroke();
    }
    ctx.fillStyle = s.accent; ctx.fillRect(6, 44, 22, 2); ctx.fillRect(72, 44, 22, 2);
    roundRect(ctx, 14, 23, 72, 4, 2, s.dark, INK, lw * 0.8);
    raceNumber(ctx, s.num, 50, 46, 5.4, lw);
    exhausts(ctx, lw, [73], 57);
  },
  // 88: fantasy hot rod. Giant rear tires, chopped cab, chrome blower and flames.
  hotrod(ctx, s, lw) {
    tiresAt(ctx, lw, 18, 26, [0, 74]);
    roundRect(ctx, 25, 8, 5, 22, 2, CHROME, INK, lw * 0.6);
    roundRect(ctx, 70, 8, 5, 22, 2, CHROME, INK, lw * 0.6);
    polygon(ctx, [24, 56, 76, 56, 78, 34, 70, 28, 30, 28, 22, 34], s.body, INK, lw);
    polygon(ctx, [24, 54, 24, 40, 29, 46, 31, 36, 35, 45, 39, 38, 40, 50, 34, 54], s.accent, INK, lw * 0.6);
    polygon(ctx, [76, 54, 76, 40, 71, 46, 69, 36, 65, 45, 61, 38, 60, 50, 66, 54], s.accent, INK, lw * 0.6);
    polygon(ctx, [26, 53, 27, 45, 30, 49, 32, 43, 35, 50, 31, 53], s.flame, null);
    polygon(ctx, [74, 53, 73, 45, 70, 49, 68, 43, 65, 50, 69, 53], s.flame, null);
    polygon(ctx, [32, 28, 35, 18, 65, 18, 68, 28], s.dark, INK, lw);
    glass(ctx, [36, 27, 38, 22, 62, 22, 64, 27], lw);
    roundRect(ctx, 40, 5, 20, 14, 3, CHROME, INK, lw);
    ctx.fillStyle = '#7C828C'; for (let x = 43; x < 58; x += 4) ctx.fillRect(x, 8, 2, 9);
    roundRect(ctx, 42, 0, 16, 6, 2, s.accent, INK, lw * 0.8);
    for (const x of [31, 69]) {
      ctx.beginPath(); ctx.arc(x, 41, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = LIGHT; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw * 0.8; ctx.stroke();
    }
    raceNumber(ctx, s.num, 50, 45, 6, lw);
    exhausts(ctx, lw, [40, 60], 58);
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
  track(ctx, s, lw) {
    polygon(ctx, [4, 37, 4, 27, 26, 25, 48, 17, 72, 16, 100, 24, 117, 30, 116, 37], s.body, INK, lw);
    polygon(ctx, [50, 24, 57, 18.5, 72, 18, 88, 24], GLASS, INK, lw);
    polygon(ctx, [34, 28, 45, 27, 43, 34, 34, 34], s.dark, INK, lw * 0.8);
    ctx.fillStyle = s.accent; ctx.fillRect(8, 33, 104, 2);
    ctx.fillStyle = INK; ctx.fillRect(10, 12, 3, 14);
    roundRect(ctx, 1, 8, 26, 5, 2, s.dark, INK, lw * 0.8);
    roundRect(ctx, 1, 4, 4, 12, 1.5, s.body, INK, lw * 0.7);
    raceNumber(ctx, s.num, 70, 29, 5.2, lw);
    wheel(ctx, 26, 38, 9, lw); wheel(ctx, 96, 38, 9, lw);
  },
  muscle(ctx, s, lw) {
    polygon(ctx, [3, 38, 3, 24, 10, 22, 36, 21, 50, 11, 70, 11, 84, 21, 116, 23, 118, 28, 117, 38], s.body, INK, lw);
    polygon(ctx, [52, 20, 56, 13.5, 68, 13.5, 80, 20], GLASS, INK, lw);
    polygon(ctx, [94, 21.5, 103, 18, 108, 22], s.dark, INK, lw * 0.8);
    ctx.fillStyle = s.accent; ctx.fillRect(6, 25, 108, 2.5);
    roundRect(ctx, 113, 29, 7, 6, 2, CHROME, INK, lw * 0.6);
    roundRect(ctx, 0, 29, 7, 6, 2, CHROME, INK, lw * 0.6);
    raceNumber(ctx, s.num, 62, 31, 6, lw);
    wheel(ctx, 24, 38, 10, lw); wheel(ctx, 97, 38, 10, lw);
  },
  jdm(ctx, s, lw) {
    ctx.beginPath();
    ctx.moveTo(4, 37); ctx.lineTo(4, 28); ctx.quadraticCurveTo(6, 22, 22, 21); ctx.lineTo(38, 20);
    ctx.quadraticCurveTo(52, 8, 72, 12); ctx.quadraticCurveTo(84, 15, 94, 22); ctx.lineTo(108, 24);
    ctx.quadraticCurveTo(118, 26, 117, 33); ctx.lineTo(116, 37); ctx.closePath();
    ctx.fillStyle = s.body; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(44, 20); ctx.quadraticCurveTo(54, 11.5, 70, 14); ctx.quadraticCurveTo(80, 16.5, 86, 21); ctx.closePath();
    ctx.fillStyle = GLASS; ctx.fill(); ctx.stroke();
    ctx.fillStyle = s.accent; ctx.fillRect(10, 31, 100, 2);
    ctx.fillStyle = INK; ctx.fillRect(9, 19, 2, 4);
    roundRect(ctx, 2, 16, 15, 3, 1.5, s.dark, INK, lw * 0.7);
    raceNumber(ctx, s.num, 62, 28, 5.2, lw);
    wheel(ctx, 26, 38, 9, lw); wheel(ctx, 94, 38, 9, lw);
  },
  hotrod(ctx, s, lw) {
    polygon(ctx, [14, 34, 14, 24, 40, 22, 44, 14, 64, 14, 66, 22, 110, 24, 114, 30, 112, 34], s.body, INK, lw);
    polygon(ctx, [112, 26, 98, 23.5, 92, 27, 84, 23.5, 78, 28, 70, 24.5, 64, 29.5, 78, 31, 90, 30, 104, 31.5, 112, 31], s.accent, INK, lw * 0.6);
    polygon(ctx, [111, 27.5, 100, 26, 95, 28.5, 88, 27, 84, 30, 96, 30.5, 110, 30], s.flame, null);
    polygon(ctx, [46, 21, 48, 16.5, 62, 16.5, 63, 21], GLASS, INK, lw * 0.8);
    roundRect(ctx, 72, 15, 24, 9, 2, CHROME, INK, lw * 0.8);
    roundRect(ctx, 76, 7, 14, 9, 2, CHROME, INK, lw * 0.8);
    roundRect(ctx, 77, 3.5, 12, 4, 1.5, s.accent, INK, lw * 0.7);
    ctx.strokeStyle = CHROME; ctx.lineWidth = lw * 1.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(75, 24); ctx.lineTo(70, 36); ctx.moveTo(81, 24); ctx.lineTo(78, 36); ctx.moveTo(87, 24); ctx.lineTo(86, 36); ctx.stroke();
    raceNumber(ctx, s.num, 54, 28, 5, lw);
    wheel(ctx, 28, 32, 14, lw); wheel(ctx, 104, 38, 7, lw);
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
