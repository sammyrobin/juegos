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

// Eight original designs, identified only by color, race number and stats. Each one
// drives differently (see handlingOf in player.js):
//   kmh       top speed shown on the card and the speedometer
//   accel     1…5, how fast it gets there
//   handling  1…5, how quickly it steers and how well it holds the curves
//   unlock    best distance (m) in a single run that unlocks it (none = from the start)
//   lives     lives at the start (3 by default)
const CARS = [
  { num: '07', color: 'red', style: 'track', body: '#DD0200', dark: '#A30100', accent: '#FFFFFF', kmh: 220, accel: 3, handling: 4 },
  { num: '21', color: 'blue', style: 'muscle', body: '#1F4BFF', dark: '#1535C2', accent: '#FFFFFF', kmh: 230, accel: 4, handling: 2 },
  { num: '33', color: 'yellow', style: 'jdm', body: '#FFCC00', dark: '#D9A800', accent: '#141414', kmh: 240, accel: 3, handling: 3 },
  { num: '88', color: 'purple', style: 'hotrod', body: '#7B3FE4', dark: '#5A2BB0', accent: '#FF7A00', flame: '#FFCC00', kmh: 210, accel: 4, handling: 5 },
  { num: '12', color: 'green', style: 'rally', body: '#2BA84A', dark: '#1E7E36', accent: '#FFFFFF', flap: '#FF7A00', kmh: 260, accel: 4, handling: 4, unlock: 2000 },
  { num: '45', color: 'cyan', style: 'proto', body: '#12B5C9', dark: '#0B8796', accent: '#141414', kmh: 280, accel: 3, handling: 5, unlock: 5000 },
  { num: '64', color: 'silver', style: 'gt', body: '#AEB6C1', dark: '#7D8794', accent: '#1F4BFF', kmh: 310, accel: 4, handling: 3, unlock: 10000 },
  { num: '99', color: 'redStripe', style: 'super', body: '#E10600', dark: '#A80400', accent: '#FFD200', kmh: 350, accel: 5, handling: 4, unlock: 20000, lives: 5, punch: 1.3 },
];

/** Speed bar (1…5) from the top speed: 210 km/h ≈ 1, 350 km/h = 5. */
const speedPips = (kmh) => Math.max(1, Math.min(5, Math.round(1 + (kmh - 200) / 37.5)));

export const PLAYER_CARS = CARS.map((car) => ({
  lives: 3,
  unlock: 0,
  punch: 1,
  ...car,
  stats: { speed: speedPips(car.kmh), accel: car.accel, handling: car.handling },
}));

/** Indices of the cars available with this best single-run distance. */
export const unlockedCars = (bestDistance) => PLAYER_CARS.map((car, i) => (bestDistance >= car.unlock ? i : -1)).filter((i) => i >= 0);

export const RIVAL_CARS = [
  { id: 'van', style: 'van', body: '#1E8A3C', dark: '#156B2D', accent: '#FFF3E3' },
  { id: 'compact', style: 'compact', body: '#FF5FA2', dark: '#D93F80', accent: '#FFF3E3' },
  { id: 'pickup', style: 'pickup', body: '#F2F2F2', dark: '#C9C9C9', accent: '#1F9E9E' },
];

// ---------------------------------------------------------------------------
// Rear view
// ---------------------------------------------------------------------------

// Tire boxes drawn by the current renderCarRear() call (the renderer animates the tread).
let tireLog = null;

function tires(ctx, lw, big) {
  const y = big ? 26 : 38, w = big ? 22 : 17;
  tiresAt(ctx, lw, y, w, [big ? 1 : 5, big ? 77 : 78]);
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
    tireLog?.push([x + 3, y + 3, w - 6, 64 - y - 6]);
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
  // 12: dirt rally hatchback. Tall roof with a scoop, hatch spoiler and orange mud flaps.
  rally(ctx, s, lw) {
    tiresAt(ctx, lw, 36, 18, [4, 78]);
    polygon(ctx, [5, 56, 95, 56, 96, 32, 90, 26, 10, 26, 4, 32], s.body, INK, lw);
    polygon(ctx, [18, 26, 24, 9, 76, 9, 82, 26], s.dark, INK, lw);
    glass(ctx, [22, 25, 27, 12, 73, 12, 78, 25], lw);
    roundRect(ctx, 16, 5, 68, 5, 2, s.dark, INK, lw);
    roundRect(ctx, 40, 1, 20, 5, 2, s.body, INK, lw * 0.8);
    ctx.fillStyle = s.accent; ctx.fillRect(5, 37, 90, 4);
    roundRect(ctx, 8, 29, 8, 12, 2, LIGHT, INK, lw * 0.8);
    roundRect(ctx, 84, 29, 8, 12, 2, LIGHT, INK, lw * 0.8);
    raceNumber(ctx, s.num, 50, 46, 6, lw);
    roundRect(ctx, 6, 53, 14, 10, 1.5, s.flap, INK, lw * 0.7);
    roundRect(ctx, 80, 53, 14, 10, 1.5, s.flap, INK, lw * 0.7);
    exhausts(ctx, lw, [70], 57);
  },
  // 45: endurance prototype. Low bubble canopy, shark fin, fenders over the wheels, huge wing.
  proto(ctx, s, lw) {
    tiresAt(ctx, lw, 40, 19, [3, 78]);
    polygon(ctx, [1, 44, 6, 36, 24, 36, 26, 44], s.body, INK, lw);
    polygon(ctx, [99, 44, 94, 36, 76, 36, 74, 44], s.body, INK, lw);
    polygon(ctx, [6, 57, 94, 57, 95, 46, 84, 38, 16, 38, 5, 46], s.body, INK, lw);
    ctx.beginPath(); ctx.moveTo(36, 39); ctx.quadraticCurveTo(38, 22, 50, 22); ctx.quadraticCurveTo(62, 22, 64, 39); ctx.closePath();
    ctx.fillStyle = s.dark; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(40, 37); ctx.quadraticCurveTo(42, 26, 50, 26); ctx.quadraticCurveTo(58, 26, 60, 37); ctx.closePath();
    ctx.fillStyle = GLASS; ctx.fill(); ctx.stroke();
    roundRect(ctx, 48.5, 9, 3, 15, 1, s.accent, INK, lw * 0.5);
    roundRect(ctx, 2, 7, 96, 6, 2, s.accent, INK, lw);
    ctx.fillStyle = s.body; ctx.fillRect(5, 9, 90, 1.6);
    roundRect(ctx, 0, 3, 5, 16, 1.5, s.body, INK, lw * 0.8);
    roundRect(ctx, 95, 3, 5, 16, 1.5, s.body, INK, lw * 0.8);
    ctx.fillStyle = INK; ctx.fillRect(30, 12, 2.5, 27); ctx.fillRect(67.5, 12, 2.5, 27);
    roundRect(ctx, 14, 41, 72, 3, 1.5, LIGHT, INK, lw * 0.6);
    roundRect(ctx, 22, 50, 56, 7, 2, INK);
    ctx.fillStyle = s.dark; for (let x = 27; x < 75; x += 8) ctx.fillRect(x, 51, 2.5, 6);
    raceNumber(ctx, s.num, 50, 46, 4.6, lw);
  },
  // 64: grand tourer. Smooth fastback, slim light strips, twin stripes and a ducktail.
  gt(ctx, s, lw) {
    tiresAt(ctx, lw, 38, 18, [4, 78]);
    ctx.beginPath();
    ctx.moveTo(4, 56); ctx.lineTo(96, 56); ctx.lineTo(97, 42); ctx.quadraticCurveTo(96, 30, 84, 30);
    ctx.lineTo(16, 30); ctx.quadraticCurveTo(4, 30, 3, 42); ctx.closePath();
    ctx.fillStyle = s.body; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke();
    polygon(ctx, [26, 30, 32, 14, 68, 14, 74, 30], s.dark, INK, lw);
    glass(ctx, [29, 29, 34, 17, 66, 17, 71, 29], lw);
    ctx.fillStyle = s.accent; ctx.fillRect(43, 14, 3, 42); ctx.fillRect(54, 14, 3, 42);
    roundRect(ctx, 16, 27, 68, 4, 2, s.dark, INK, lw * 0.8);
    roundRect(ctx, 7, 34, 27, 4, 2, LIGHT, INK, lw * 0.7);
    roundRect(ctx, 66, 34, 27, 4, 2, LIGHT, INK, lw * 0.7);
    raceNumber(ctx, s.num, 50, 46, 5.4, lw);
    exhausts(ctx, lw, [28, 72], 57);
  },
  // 99: fantasy supercar. A wide wedge with engine louvres, a yellow stripe down the
  // middle, a full-width light bar and one hexagonal exhaust.
  super(ctx, s, lw) {
    tiresAt(ctx, lw, 40, 21, [1, 78]);
    polygon(ctx, [1, 57, 99, 57, 100, 44, 92, 35, 8, 35, 0, 44], s.body, INK, lw);
    polygon(ctx, [28, 35, 35, 19, 65, 19, 72, 35], s.dark, INK, lw);
    ctx.fillStyle = s.accent; ctx.fillRect(45, 19, 10, 38);
    ctx.fillStyle = INK; for (let x = 37; x < 64; x += 5) if (x < 44 || x > 55) ctx.fillRect(x, 23, 2, 9);
    polygon(ctx, [5, 35, 95, 35, 97, 31, 3, 31], s.dark, INK, lw * 0.8);
    roundRect(ctx, 5, 39, 90, 3, 1.5, LIGHT, INK, lw * 0.6);
    roundRect(ctx, 14, 49, 72, 8, 2, INK);
    ctx.fillStyle = s.dark; for (let x = 19; x < 84; x += 9) if (x < 42 || x > 56) ctx.fillRect(x, 50, 2.5, 7);
    const hex = [];
    for (let i = 0; i < 6; i++) hex.push(50 + Math.cos((i * Math.PI) / 3) * 5, 52.5 + Math.sin((i * Math.PI) / 3) * 4);
    polygon(ctx, hex, '#50535A', INK, lw * 0.7);
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(50, 52.5, 2.2, 0, Math.PI * 2); ctx.fill();
    raceNumber(ctx, s.num, 50, 27, 5, lw);
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

/**
 * Rear view sprite on its own canvas (width px). `canvas.tires` lists the tread boxes
 * in canvas pixels, so the renderer can make the wheels spin.
 */
export function renderCarRear(spec, width) {
  const h = width * 0.64;
  const c = makeCanvas(width, h + width * 0.04);
  const ctx = c.getContext('2d');
  const ox = width * 0.02, sx = (width * 0.96) / 100, sy = (h * 0.96) / 64;
  ctx.translate(ox, ox);
  ctx.scale(sx, sy);
  tireLog = [];
  REAR[spec.style](ctx, spec, 2.4);
  c.tires = tireLog.map(([x, y, w, th]) => [ox + x * sx, ox + y * sy, w * sx, th * sy]);
  tireLog = null;
  // Glossy plastic: a soft light from above over the top of the car.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  const shine = ctx.createLinearGradient(0, 0, 0, c.height);
  shine.addColorStop(0, 'rgba(255,255,255,.32)');
  shine.addColorStop(0.35, 'rgba(255,255,255,.08)');
  shine.addColorStop(0.36, 'rgba(255,255,255,0)');
  shine.addColorStop(0.85, 'rgba(0,0,0,0)');
  shine.addColorStop(1, 'rgba(0,0,0,.18)');
  ctx.fillStyle = shine;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'source-over';
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

SIDE.rally = (ctx, s, lw) => {
  polygon(ctx, [4, 36, 4, 24, 12, 20, 30, 19, 40, 9, 76, 9, 88, 19, 110, 21, 117, 27, 116, 36], s.body, INK, lw);
  polygon(ctx, [42, 18, 47, 11.5, 74, 11.5, 84, 18.5], GLASS, INK, lw);
  roundRect(ctx, 50, 5.5, 16, 4.5, 1.5, s.body, INK, lw * 0.7);
  roundRect(ctx, 2, 15, 12, 4, 1.5, s.dark, INK, lw * 0.7);
  ctx.fillStyle = s.accent; ctx.fillRect(6, 26, 108, 2.5);
  roundRect(ctx, 104, 15, 9, 6, 2, '#FFF3E3', INK, lw * 0.7);
  raceNumber(ctx, s.num, 62, 30, 6, lw);
  roundRect(ctx, 12, 36, 4, 9, 1, s.flap, INK, lw * 0.5);
  roundRect(ctx, 80, 36, 4, 9, 1, s.flap, INK, lw * 0.5);
  wheel(ctx, 26, 37, 10, lw); wheel(ctx, 96, 37, 10, lw);
};
SIDE.proto = (ctx, s, lw) => {
  polygon(ctx, [2, 37, 2, 29, 20, 27, 42, 24, 54, 14, 70, 13.5, 84, 22, 108, 26, 118, 31, 118, 37], s.body, INK, lw);
  polygon(ctx, [56, 22, 59, 16, 70, 15.5, 80, 22], GLASS, INK, lw);
  polygon(ctx, [20, 27, 30, 12, 50, 16, 46, 24], s.dark, INK, lw * 0.8);
  roundRect(ctx, 0, 6, 22, 4.5, 1.5, s.accent, INK, lw * 0.8);
  ctx.fillStyle = INK; ctx.fillRect(8, 10, 2.5, 18);
  ctx.fillStyle = s.accent; ctx.fillRect(4, 32, 112, 2);
  raceNumber(ctx, s.num, 40, 30.5, 5, lw);
  wheel(ctx, 24, 38, 8.5, lw); wheel(ctx, 98, 38, 8.5, lw);
  ctx.beginPath(); ctx.arc(24, 38, 11, Math.PI * 1.1, Math.PI * 1.9); ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke();
  ctx.beginPath(); ctx.arc(98, 38, 11, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
};
SIDE.gt = (ctx, s, lw) => {
  ctx.beginPath();
  ctx.moveTo(3, 37); ctx.lineTo(3, 28); ctx.quadraticCurveTo(6, 23, 18, 22.5); ctx.lineTo(30, 22);
  ctx.quadraticCurveTo(42, 11, 58, 12); ctx.quadraticCurveTo(70, 13, 78, 21); ctx.lineTo(108, 23);
  ctx.quadraticCurveTo(118, 25, 117, 31); ctx.lineTo(117, 37); ctx.closePath();
  ctx.fillStyle = s.body; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(36, 21); ctx.quadraticCurveTo(46, 13.5, 58, 14.5); ctx.quadraticCurveTo(66, 15.5, 72, 21); ctx.closePath();
  ctx.fillStyle = GLASS; ctx.fill(); ctx.stroke();
  polygon(ctx, [80, 26, 90, 25, 88, 30, 80, 30], s.dark, INK, lw * 0.7);
  ctx.fillStyle = s.accent; ctx.fillRect(5, 27.5, 110, 1.8);
  raceNumber(ctx, s.num, 56, 30, 5.4, lw);
  wheel(ctx, 24, 37, 9.5, lw); wheel(ctx, 96, 37, 9.5, lw);
};
SIDE.super = (ctx, s, lw) => {
  polygon(ctx, [3, 36, 3, 26, 22, 24, 46, 15, 66, 14, 86, 20, 108, 25, 118, 30, 117, 36], s.body, INK, lw);
  polygon(ctx, [48, 22, 54, 16.5, 66, 16, 80, 21], GLASS, INK, lw);
  polygon(ctx, [28, 25, 42, 23, 40, 31, 28, 31], s.dark, INK, lw * 0.8);
  ctx.fillStyle = s.accent; ctx.fillRect(4, 29, 113, 2.6);
  polygon(ctx, [2, 24, 18, 24, 18, 21, 2, 20], s.dark, INK, lw * 0.7);
  raceNumber(ctx, s.num, 62, 28, 5.4, lw);
  wheel(ctx, 24, 36, 9.5, lw); wheel(ctx, 96, 36, 9.5, lw);
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
