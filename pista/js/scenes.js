// Giant furniture behind the track: every level is a different room of the house.
// Each room is drawn once per screen size into three wide strips, the parallax layers:
//   wall   – the wall and what hangs on it (slowest)
//   mid    – the furniture standing on the floor
//   front  – a few giant toys and flower pots closer to the camera (fastest)
// The renderer scrolls them with the curves, so each frame only copies three bitmaps.
//
// Sizes use one unit `u` (about half the wall height on screen), so a bed or a sofa looks
// huge next to the toy track.

import { RAW } from './palette.js';
import { hexToRgb, makeCanvas, polygon, rgb, roundRect, seeded, shade } from './util.js';

const INK = '#141414';
const dk = (hex, t) => rgb(shade(hexToRgb(hex), t));

// ---------------------------------------------------------------------------
// Small drawing helpers (all in strip pixels)
// ---------------------------------------------------------------------------

function box(g, x, y, w, h, fill, lw, r = 0) {
  roundRect(g, x, y, w, h, r, fill, INK, lw);
}

function circle(g, x, y, r, fill, lw) {
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (lw) { g.strokeStyle = INK; g.lineWidth = lw; g.stroke(); }
}

function star(g, x, y, r, fill, lw) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r, a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  polygon(g, pts, fill, lw ? INK : null, lw);
}

function letter(g, ch, x, y, size, fill, lw) {
  g.font = `900 ${size}px "Arial Black", Impact, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = lw; g.strokeStyle = INK; g.strokeText(ch, x, y);
  g.fillStyle = fill; g.fillText(ch, x, y);
}

function windowFrame(g, x, top, w, h, u, lw, skyA, skyB, trim, extra) {
  const sky = g.createLinearGradient(0, top, 0, top + h);
  sky.addColorStop(0, skyA); sky.addColorStop(1, skyB);
  box(g, x, top, w, h, sky, lw, u * 0.03);
  if (extra) { g.save(); g.beginPath(); g.rect(x, top, w, h); g.clip(); extra(); g.restore(); }
  g.fillStyle = trim;
  g.fillRect(x + w / 2 - u * 0.03, top, u * 0.06, h);
  g.fillRect(x, top + h / 2 - u * 0.03, w, u * 0.06);
  g.strokeStyle = trim; g.lineWidth = u * 0.07; g.strokeRect(x, top, w, h);
  g.strokeStyle = INK; g.lineWidth = lw; g.strokeRect(x - u * 0.035, top - u * 0.035, w + u * 0.07, h + u * 0.07);
  box(g, x - u * 0.1, top + h + u * 0.02, w + u * 0.2, u * 0.07, trim, lw, u * 0.02);
}

// Big things for the front parallax layer.
function flowerPot(g, x, b, u, lw, pot, bloom) {
  const cx = x + u * 0.5;
  for (const [a, l] of [[-0.7, 0.55], [-0.2, 0.7], [0.3, 0.65], [0.75, 0.5]]) {
    g.save(); g.translate(cx, b - u * 0.5); g.rotate(a);
    g.beginPath(); g.ellipse(0, -u * l * 0.5, u * 0.09, u * l * 0.5, 0, 0, Math.PI * 2);
    g.fillStyle = '#2E9E48'; g.fill(); g.strokeStyle = INK; g.lineWidth = lw; g.stroke();
    g.restore();
  }
  if (bloom) {
    for (const [dx, dy] of [[-0.18, 0.95], [0.12, 1.12], [0.3, 0.88]]) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        circle(g, cx + u * dx + Math.cos(a) * u * 0.07, b - u * dy + Math.sin(a) * u * 0.07, u * 0.06, bloom, lw * 0.6);
      }
      circle(g, cx + u * dx, b - u * dy, u * 0.045, '#FFD23F', lw * 0.6);
    }
  }
  polygon(g, [cx - u * 0.36, b - u * 0.52, cx + u * 0.36, b - u * 0.52, cx + u * 0.26, b, cx - u * 0.26, b], pot, INK, lw);
  box(g, cx - u * 0.4, b - u * 0.6, u * 0.8, u * 0.13, dk(pot, -0.15), lw, u * 0.03);
}

function beachBall(g, x, b, u, lw) {
  const r = u * 0.42, cx = x + u * 0.5, cy = b - r;
  const cols = ['#DD0200', '#FFFFFF', '#1F4BFF', '#FFFFFF', '#FFCC00', '#FFFFFF'];
  cols.forEach((col, i) => {
    g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r, (i / 6) * Math.PI * 2 - 0.3, ((i + 1) / 6) * Math.PI * 2 - 0.3); g.closePath();
    g.fillStyle = col; g.fill();
  });
  circle(g, cx, cy, r, null, lw);
  circle(g, cx, cy, r * 0.16, '#FFFFFF', lw * 0.7);
  g.fillStyle = 'rgba(255,255,255,.45)';
  g.beginPath(); g.ellipse(cx - r * 0.4, cy - r * 0.45, r * 0.22, r * 0.12, -0.6, 0, Math.PI * 2); g.fill();
}

function bigMug(g, x, b, u, lw, col) {
  g.strokeStyle = INK; g.lineWidth = u * 0.14;
  g.beginPath(); g.arc(x + u * 0.86, b - u * 0.42, u * 0.18, -Math.PI / 2, Math.PI / 2); g.stroke();
  g.strokeStyle = col; g.lineWidth = u * 0.08; g.stroke();
  box(g, x + u * 0.15, b - u * 0.75, u * 0.7, u * 0.75, col, lw, u * 0.08);
  g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + u * 0.25, b - u * 0.68, u * 0.08, u * 0.55);
  star(g, x + u * 0.5, b - u * 0.38, u * 0.14, '#FFF3E3', lw * 0.7);
}

const gap = (w) => [w, () => {}];

// ---------------------------------------------------------------------------
// Rooms. `wall` items hang on the wall (base = where the wall meets the floor);
// `furniture` items stand on the floor. [width in u, draw(g, x, base, u, c, lw)].
// ---------------------------------------------------------------------------

const ROOMS = {
  room: {
    wallpaper(g, w, h, u, c) {
      const rnd = seeded(3);
      g.fillStyle = dk(c.skyBottom, -0.07);
      for (let i = 0; i < (w * h) / (u * u) * 5; i++) star(g, rnd() * w, rnd() * h * 0.9, u * 0.035, g.fillStyle, 0);
    },
    wall: [
      [2.2, (g, x, b, u, c, lw) => {
        const top = b - u * 1.7, ww = u * 1.3, wh = u * 0.9, wx = x + u * 0.45;
        windowFrame(g, wx, top, ww, wh, u, lw, '#6EC6FF', '#CFF0FF', c.trim, () => {
          circle(g, wx + ww * 0.75, top + wh * 0.3, u * 0.12, '#FFE36B');
          g.fillStyle = '#FFFFFF';
          g.beginPath(); g.ellipse(wx + ww * 0.3, top + wh * 0.35, u * 0.2, u * 0.07, 0, 0, Math.PI * 2); g.fill();
          g.beginPath(); g.ellipse(wx + ww * 0.42, top + wh * 0.3, u * 0.12, u * 0.08, 0, 0, Math.PI * 2); g.fill();
        });
        // Curtains.
        for (const cx of [wx - u * 0.3, wx + ww + u * 0.05]) {
          polygon(g, [cx, top - u * 0.12, cx + u * 0.25, top - u * 0.12, cx + u * 0.2, top + wh + u * 0.15, cx + u * 0.02, top + wh + u * 0.15], c.furnA, INK, lw);
        }
        box(g, wx - u * 0.4, top - u * 0.17, ww + u * 0.8, u * 0.06, c.wood, lw, u * 0.03);
      }],
      [1.3, (g, x, b, u, c, lw) => {
        // Poster: a rocket among stars.
        g.save(); g.translate(x + u * 0.6, b - u * 1.2); g.rotate(-0.05);
        box(g, -u * 0.38, -u * 0.48, u * 0.76, u * 0.96, '#1B2350', lw, u * 0.02);
        star(g, -u * 0.2, -u * 0.3, u * 0.06, '#FFE36B', 0); star(g, u * 0.22, -u * 0.12, u * 0.05, '#FFE36B', 0); star(g, -u * 0.18, u * 0.28, u * 0.04, '#FFE36B', 0);
        polygon(g, [0, -u * 0.36, u * 0.12, -u * 0.12, u * 0.12, u * 0.18, -u * 0.12, u * 0.18, -u * 0.12, -u * 0.12], '#F2F2F2', INK, lw * 0.8);
        polygon(g, [-u * 0.12, u * 0.05, -u * 0.22, u * 0.24, -u * 0.12, u * 0.18], c.furnA, INK, lw * 0.8);
        polygon(g, [u * 0.12, u * 0.05, u * 0.22, u * 0.24, u * 0.12, u * 0.18], c.furnA, INK, lw * 0.8);
        polygon(g, [-u * 0.07, u * 0.18, u * 0.07, u * 0.18, 0, u * 0.36], '#FF8A1F', null);
        circle(g, 0, -u * 0.08, u * 0.05, '#6EC6FF', lw * 0.6);
        g.restore();
      }],
      [2.0, (g, x, b, u, c, lw) => {
        // Shelf with small toys.
        const y = b - u * 1.05;
        box(g, x + u * 0.1, y, u * 1.7, u * 0.07, c.wood, lw, u * 0.02);
        box(g, x + u * 0.25, y - u * 0.3, u * 0.22, u * 0.3, '#9AA3B5', lw, u * 0.03);
        box(g, x + u * 0.22, y - u * 0.44, u * 0.28, u * 0.16, '#9AA3B5', lw, u * 0.04);
        circle(g, x + u * 0.31, y - u * 0.36, u * 0.03, '#FF2A2A'); circle(g, x + u * 0.41, y - u * 0.36, u * 0.03, '#FF2A2A');
        circle(g, x + u * 0.85, y - u * 0.13, u * 0.14, '#B07A45', lw);
        circle(g, x + u * 0.85, y - u * 0.33, u * 0.1, '#B07A45', lw);
        circle(g, x + u * 0.77, y - u * 0.41, u * 0.04, '#B07A45', lw); circle(g, x + u * 0.93, y - u * 0.41, u * 0.04, '#B07A45', lw);
        polygon(g, [x + u * 1.3, y, x + u * 1.5, y, x + u * 1.46, y - u * 0.1, x + u * 1.34, y - u * 0.1], '#F2C14E', INK, lw);
        box(g, x + u * 1.28, y - u * 0.3, u * 0.24, u * 0.2, '#F2C14E', lw, u * 0.1);
      }],
      [1.0, () => {}],
    ],
    furniture: [
      [2.6, (g, x, b, u, c, lw) => {
        // Bed with a star blanket.
        box(g, x + u * 0.05, b - u * 1.0, u * 0.16, u * 1.0, c.wood, lw, u * 0.04);
        box(g, x + u * 2.35, b - u * 0.6, u * 0.14, u * 0.6, c.wood, lw, u * 0.04);
        box(g, x + u * 0.15, b - u * 0.42, u * 2.25, u * 0.2, c.wood, lw, u * 0.03);
        box(g, x + u * 0.18, b - u * 0.62, u * 2.2, u * 0.22, '#FFFFFF', lw, u * 0.06);
        box(g, x + u * 0.25, b - u * 0.78, u * 0.55, u * 0.2, '#FFFFFF', lw, u * 0.09);
        box(g, x + u * 0.75, b - u * 0.66, u * 1.72, u * 0.4, c.furnC, lw, u * 0.07);
        for (let i = 0; i < 5; i++) star(g, x + u * (0.95 + i * 0.32), b - u * (0.5 - (i % 2) * 0.1), u * 0.06, c.furnB, 0);
      }],
      [1.1, (g, x, b, u, c, lw) => {
        // Stack of giant books.
        const books = [[0.9, 0.16, c.furnA], [0.8, 0.13, c.furnC], [0.95, 0.15, c.furnB], [0.75, 0.12, '#34A853'], [0.85, 0.14, '#7B3FE4']];
        let y = b;
        books.forEach(([w, h, col], i) => {
          const bx = x + u * (0.05 + (i % 2) * 0.06);
          y -= u * h;
          box(g, bx, y, u * w, u * h, col, lw, u * 0.02);
          g.fillStyle = '#FFF3E3'; g.fillRect(bx + u * w * 0.82, y + u * h * 0.2, u * w * 0.12, u * h * 0.6);
        });
      }],
      [1.2, (g, x, b, u, c, lw) => {
        // Toy blocks.
        const s = u * 0.48;
        box(g, x, b - s, s, s, c.furnA, lw, u * 0.04); letter(g, 'A', x + s / 2, b - s / 2, s * 0.6, '#FFF3E3', lw);
        box(g, x + s + u * 0.04, b - s, s, s, c.furnC, lw, u * 0.04); letter(g, 'B', x + s * 1.5 + u * 0.04, b - s / 2, s * 0.6, '#FFF3E3', lw);
        box(g, x + s * 0.55, b - s * 2, s, s, c.furnB, lw, u * 0.04); letter(g, 'C', x + s * 1.05, b - s * 1.5, s * 0.6, '#FFF3E3', lw);
      }],
      [1.6, (g, x, b, u, c, lw) => {
        // Toy chest with a ball peeking out.
        circle(g, x + u * 1.05, b - u * 0.66, u * 0.2, c.furnA, lw);
        g.fillStyle = '#FFFFFF'; g.fillRect(x + u * 0.86, b - u * 0.7, u * 0.38, u * 0.06);
        box(g, x + u * 0.1, b - u * 0.6, u * 1.3, u * 0.6, c.furnB, lw, u * 0.05);
        box(g, x + u * 0.05, b - u * 0.68, u * 1.4, u * 0.14, dk(RAW[0].furnB, -0.15), lw, u * 0.05);
        star(g, x + u * 0.75, b - u * 0.3, u * 0.14, '#FFF3E3', lw * 0.7);
      }],
      [1.0, (g, x, b, u, c, lw) => {
        // Nightstand and lamp.
        box(g, x + u * 0.1, b - u * 0.55, u * 0.75, u * 0.55, c.wood, lw, u * 0.03);
        box(g, x + u * 0.18, b - u * 0.47, u * 0.59, u * 0.18, dk(RAW[0].wood, 0.15), lw, u * 0.02);
        circle(g, x + u * 0.475, b - u * 0.38, u * 0.03, INK);
        box(g, x + u * 0.44, b - u * 0.85, u * 0.07, u * 0.3, '#9AA3B5', lw);
        polygon(g, [x + u * 0.3, b - u * 0.85, x + u * 0.65, b - u * 0.85, x + u * 0.56, b - u * 1.1, x + u * 0.39, b - u * 1.1], c.furnB, INK, lw);
      }],
      [0.5, () => {}],
    ],
    front: [
      gap(1.4),
      [1.2, (g, x, b, u, c, lw) => {
        const s = u * 0.48;
        box(g, x, b - s, s, s, c.furnC, lw, u * 0.04); letter(g, 'D', x + s / 2, b - s / 2, s * 0.6, '#FFF3E3', lw);
        box(g, x + s * 0.5, b - s * 2, s, s, c.furnA, lw, u * 0.04); letter(g, 'E', x + s, b - s * 1.5, s * 0.6, '#FFF3E3', lw);
      }],
      gap(3.2),
      [1.0, (g, x, b, u, c, lw) => beachBall(g, x, b, u, lw)],
      gap(2.6),
    ],
  },

  living: {
    wallpaper(g, w, h, u, c) {
      g.fillStyle = dk(c.skyBottom, -0.05);
      for (let x = 0; x < w; x += u * 0.3) g.fillRect(x, 0, u * 0.12, h);
    },
    wall: [
      [1.4, (g, x, b, u, c, lw) => {
        const top = b - u * 1.55;
        box(g, x + u * 0.2, top, u * 1.0, u * 0.7, c.wood, lw, u * 0.02);
        const inner = g.createLinearGradient(0, top, 0, top + u * 0.7);
        inner.addColorStop(0, '#FFB35C'); inner.addColorStop(1, '#FFE2B8');
        box(g, x + u * 0.28, top + u * 0.08, u * 0.84, u * 0.54, inner, lw * 0.6);
        polygon(g, [x + u * 0.28, top + u * 0.62, x + u * 0.55, top + u * 0.3, x + u * 0.75, top + u * 0.5, x + u * 0.9, top + u * 0.36, x + u * 1.12, top + u * 0.62], '#6B3A6E', null);
      }],
      [2.2, (g, x, b, u, c, lw) => {
        // Window with the evening outside.
        const top = b - u * 1.7, ww = u * 1.4, wh = u * 0.95, wx = x + u * 0.4;
        windowFrame(g, wx, top, ww, wh, u, lw, '#3B2A77', '#FFB35C', c.trim, () => {
          circle(g, wx + ww * 0.3, top + wh * 0.8, u * 0.2, '#FFD166');
        });
        for (const cx of [wx - u * 0.28, wx + ww + u * 0.03]) box(g, cx, top - u * 0.1, u * 0.25, wh + u * 0.3, c.furnC, lw, u * 0.03);
      }],
      [1.0, (g, x, b, u, c, lw) => {
        // Wall clock.
        const cx = x + u * 0.5, cy = b - u * 1.3;
        circle(g, cx, cy, u * 0.26, c.furnC, lw);
        circle(g, cx, cy, u * 0.2, '#FFFFFF', lw * 0.6);
        g.strokeStyle = INK; g.lineWidth = lw; g.lineCap = 'round';
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy - u * 0.14); g.moveTo(cx, cy); g.lineTo(cx + u * 0.1, cy + u * 0.04); g.stroke();
      }],
      [1.2, (g, x, b, u, c, lw) => {
        const top = b - u * 1.5;
        box(g, x + u * 0.2, top, u * 0.7, u * 0.85, '#FFF3E3', lw, u * 0.02);
        circle(g, x + u * 0.45, top + u * 0.3, u * 0.15, c.furnA); circle(g, x + u * 0.62, top + u * 0.55, u * 0.12, '#FFD166');
        g.strokeStyle = INK; g.lineWidth = lw * 0.6; g.strokeRect(x + u * 0.2, top, u * 0.7, u * 0.85);
      }],
    ],
    furniture: [
      [3.0, (g, x, b, u, c, lw) => {
        // Big sofa with cushions.
        const col = c.furnA, dark = dk(RAW[1].furnA, -0.2);
        box(g, x + u * 0.25, b - u * 1.05, u * 2.5, u * 0.6, dark, lw, u * 0.12);
        for (let i = 0; i < 3; i++) box(g, x + u * (0.35 + i * 0.78), b - u * 0.95, u * 0.72, u * 0.5, col, lw, u * 0.1);
        box(g, x + u * 0.15, b - u * 0.5, u * 2.7, u * 0.32, col, lw, u * 0.08);
        box(g, x, b - u * 0.78, u * 0.35, u * 0.62, dark, lw, u * 0.12);
        box(g, x + u * 2.65, b - u * 0.78, u * 0.35, u * 0.62, dark, lw, u * 0.12);
        box(g, x + u * 0.25, b - u * 0.18, u * 0.1, u * 0.18, c.wood, lw);
        box(g, x + u * 2.65, b - u * 0.18, u * 0.1, u * 0.18, c.wood, lw);
        box(g, x + u * 1.9, b - u * 1.02, u * 0.4, u * 0.36, c.furnB, lw, u * 0.1);
      }],
      [0.9, (g, x, b, u, c, lw) => {
        // Floor lamp with warm glow.
        const cx = x + u * 0.45;
        const glow = g.createRadialGradient(cx, b - u * 1.5, 0, cx, b - u * 1.5, u * 0.9);
        glow.addColorStop(0, 'rgba(255,214,102,.55)'); glow.addColorStop(1, 'rgba(255,214,102,0)');
        g.fillStyle = glow; g.fillRect(cx - u * 0.9, b - u * 2.4, u * 1.8, u * 1.8);
        box(g, cx - u * 0.03, b - u * 1.45, u * 0.06, u * 1.4, '#50535A', lw);
        box(g, cx - u * 0.2, b - u * 0.06, u * 0.4, u * 0.06, '#50535A', lw, u * 0.03);
        polygon(g, [cx - u * 0.28, b - u * 1.35, cx + u * 0.28, b - u * 1.35, cx + u * 0.18, b - u * 1.7, cx - u * 0.18, b - u * 1.7], c.furnC, INK, lw);
      }],
      [1.0, (g, x, b, u, c, lw) => {
        // Potted plant.
        const cx = x + u * 0.5;
        for (const [a, l] of [[-0.9, 0.7], [-0.4, 0.85], [0.1, 0.9], [0.55, 0.8], [1.0, 0.65]]) {
          g.save(); g.translate(cx, b - u * 0.42); g.rotate(a);
          g.beginPath(); g.ellipse(0, -u * l * 0.5, u * 0.1, u * l * 0.5, 0, 0, Math.PI * 2);
          g.fillStyle = '#34A853'; g.fill(); g.strokeStyle = INK; g.lineWidth = lw; g.stroke();
          g.restore();
        }
        polygon(g, [cx - u * 0.28, b - u * 0.45, cx + u * 0.28, b - u * 0.45, cx + u * 0.2, b, cx - u * 0.2, b], '#D2693C', INK, lw);
      }],
      [2.1, (g, x, b, u, c, lw) => {
        // TV cabinet; the screen shows an orange track.
        box(g, x + u * 0.1, b - u * 0.5, u * 1.9, u * 0.5, c.furnB, lw, u * 0.03);
        box(g, x + u * 0.2, b - u * 0.4, u * 0.8, u * 0.3, dk(RAW[1].furnB, 0.15), lw, u * 0.02);
        box(g, x + u * 1.1, b - u * 0.4, u * 0.8, u * 0.3, dk(RAW[1].furnB, 0.15), lw, u * 0.02);
        box(g, x + u * 0.3, b - u * 1.35, u * 1.5, u * 0.82, '#1B1B22', lw, u * 0.04);
        box(g, x + u * 0.36, b - u * 1.29, u * 1.38, u * 0.7, '#2A3C8F', 0, u * 0.02);
        g.strokeStyle = '#FF8A1F'; g.lineWidth = u * 0.08; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x + u * 0.5, b - u * 0.66); g.quadraticCurveTo(x + u * 1.05, b - u * 1.4, x + u * 1.6, b - u * 0.66); g.stroke();
        box(g, x + u * 0.95, b - u * 0.53, u * 0.2, u * 0.05, '#50535A', lw);
      }],
      [1.6, (g, x, b, u, c, lw) => {
        // Armchair.
        const col = c.furnC;
        box(g, x + u * 0.2, b - u * 0.95, u * 1.2, u * 0.6, dk(RAW[1].furnC, -0.12), lw, u * 0.14);
        box(g, x + u * 0.1, b - u * 0.48, u * 1.4, u * 0.3, col, lw, u * 0.08);
        box(g, x, b - u * 0.7, u * 0.3, u * 0.55, dk(RAW[1].furnC, -0.12), lw, u * 0.1);
        box(g, x + u * 1.3, b - u * 0.7, u * 0.3, u * 0.55, dk(RAW[1].furnC, -0.12), lw, u * 0.1);
        box(g, x + u * 0.2, b - u * 0.18, u * 0.08, u * 0.18, c.wood, lw);
        box(g, x + u * 1.32, b - u * 0.18, u * 0.08, u * 0.18, c.wood, lw);
      }],
      [0.4, () => {}],
    ],
    front: [
      gap(1.0),
      [1.0, (g, x, b, u, c, lw) => flowerPot(g, x, b, u, lw, '#D2693C', null)],
      gap(3.4),
      [1.0, (g, x, b, u, c, lw) => flowerPot(g, x, b, u, lw, c.furnC, '#E85D75')],
      gap(2.4),
    ],
  },

  kitchen: {
    wallpaper(g, w, h, u, c, base) {
      // Tiled backsplash behind the counters.
      const top = base - u * 1.05, s = u * 0.18;
      g.fillStyle = '#FFFFFF';
      g.fillRect(0, top, w, u * 0.5);
      g.strokeStyle = dk(c.skyBottom, -0.15); g.lineWidth = Math.max(1, u * 0.012);
      g.beginPath();
      for (let y = top; y <= top + u * 0.5 + 1; y += s) { g.moveTo(0, y); g.lineTo(w, y); }
      for (let x = 0; x < w; x += s) { g.moveTo(x, top); g.lineTo(x, top + u * 0.5); }
      g.stroke();
    },
    wall: [
      [2.6, (g, x, b, u, c, lw) => {
        // Upper cabinets.
        for (let i = 0; i < 3; i++) {
          box(g, x + u * (0.1 + i * 0.8), b - u * 1.85, u * 0.76, u * 0.6, c.furnA, lw, u * 0.03);
          box(g, x + u * (0.42 + i * 0.8), b - u * 1.38, u * 0.14, u * 0.04, '#9AA3B5', lw * 0.6);
        }
      }],
      [2.0, (g, x, b, u, c, lw) => {
        const top = b - u * 1.85, ww = u * 1.3, wh = u * 0.7, wx = x + u * 0.35;
        windowFrame(g, wx, top, ww, wh, u, lw, '#6EC6FF', '#CFF0FF', c.trim, () => {
          circle(g, wx + ww * 0.25, top + wh * 0.35, u * 0.1, '#FFE36B');
        });
      }],
      [1.0, (g, x, b, u, c, lw) => {
        const cx = x + u * 0.5, cy = b - u * 1.55;
        circle(g, cx, cy, u * 0.2, c.furnB, lw);
        circle(g, cx, cy, u * 0.15, '#FFFFFF', lw * 0.6);
        g.strokeStyle = INK; g.lineWidth = lw; g.lineCap = 'round';
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + u * 0.09, cy); g.moveTo(cx, cy); g.lineTo(cx, cy - u * 0.11); g.stroke();
      }],
    ],
    furniture: [
      [3.3, (g, x, b, u, c, lw) => {
        // Counter with cabinets, a kettle and a fruit bowl.
        for (let i = 0; i < 4; i++) {
          box(g, x + u * (0.1 + i * 0.78), b - u * 0.72, u * 0.76, u * 0.72, c.furnA, lw, u * 0.02);
          box(g, x + u * (0.42 + i * 0.78), b - u * 0.6, u * 0.12, u * 0.04, '#9AA3B5', lw * 0.6);
        }
        box(g, x + u * 0.02, b - u * 0.82, u * 3.26, u * 0.11, '#50535A', lw, u * 0.02);
        box(g, x + u * 0.4, b - u * 1.12, u * 0.36, u * 0.3, c.furnB, lw, u * 0.12);
        g.strokeStyle = INK; g.lineWidth = lw * 1.4;
        g.beginPath(); g.arc(x + u * 0.58, b - u * 1.12, u * 0.12, Math.PI, 0); g.stroke();
        g.beginPath(); g.ellipse(x + u * 2.2, b - u * 0.86, u * 0.36, u * 0.12, 0, 0, Math.PI); g.fillStyle = c.furnC; g.fill(); g.lineWidth = lw; g.stroke();
        circle(g, x + u * 2.05, b - u * 0.95, u * 0.1, '#E4572E', lw * 0.8);
        circle(g, x + u * 2.25, b - u * 0.98, u * 0.1, '#FFB000', lw * 0.8);
        circle(g, x + u * 2.42, b - u * 0.94, u * 0.09, '#7ED957', lw * 0.8);
      }],
      [1.4, (g, x, b, u, c, lw) => {
        // Fridge with magnets.
        box(g, x + u * 0.1, b - u * 1.9, u * 1.15, u * 1.9, '#F2F4F7', lw, u * 0.08);
        g.fillStyle = INK; g.fillRect(x + u * 0.1, b - u * 1.25, u * 1.15, lw);
        box(g, x + u * 1.08, b - u * 1.7, u * 0.05, u * 0.3, '#9AA3B5', lw * 0.6);
        box(g, x + u * 1.08, b - u * 1.05, u * 0.05, u * 0.4, '#9AA3B5', lw * 0.6);
        star(g, x + u * 0.4, b - u * 1.55, u * 0.07, c.furnB, lw * 0.5);
        circle(g, x + u * 0.65, b - u * 1.45, u * 0.05, '#1F4BFF', lw * 0.5);
        box(g, x + u * 0.3, b - u * 0.95, u * 0.3, u * 0.22, '#FFF3E3', lw * 0.5);
      }],
      [2.6, (g, x, b, u, c, lw) => {
        // Table and two chairs.
        const chair = (cx, flip) => {
          box(g, cx - u * 0.25, b - u * 0.45, u * 0.5, u * 0.07, c.wood, lw);
          box(g, cx + (flip ? u * 0.18 : -u * 0.25), b - u * 1.0, u * 0.07, u * 1.0, c.wood, lw);
          box(g, cx + (flip ? -u * 0.25 : u * 0.18), b - u * 0.45, u * 0.07, u * 0.45, c.wood, lw);
        };
        chair(x + u * 0.35, false);
        chair(x + u * 2.25, true);
        box(g, x + u * 0.5, b - u * 0.78, u * 1.6, u * 0.09, dk(RAW[2].wood, 0.1), lw, u * 0.02);
        box(g, x + u * 0.62, b - u * 0.7, u * 0.08, u * 0.7, c.wood, lw);
        box(g, x + u * 1.9, b - u * 0.7, u * 0.08, u * 0.7, c.wood, lw);
        box(g, x + u * 1.0, b - u * 0.98, u * 0.2, u * 0.2, '#FFFFFF', lw, u * 0.03);
      }],
      [1.5, (g, x, b, u, c, lw) => {
        // Stove with a pot.
        box(g, x + u * 0.1, b - u * 0.8, u * 1.2, u * 0.8, '#E6E8EC', lw, u * 0.03);
        box(g, x + u * 0.25, b - u * 0.55, u * 0.9, u * 0.42, '#2B2B33', lw, u * 0.03);
        for (let i = 0; i < 4; i++) circle(g, x + u * (0.3 + i * 0.27), b - u * 0.7, u * 0.04, INK);
        box(g, x + u * 0.35, b - u * 1.1, u * 0.6, u * 0.3, c.furnC, lw, u * 0.05);
        box(g, x + u * 0.3, b - u * 1.14, u * 0.7, u * 0.06, dk(RAW[2].furnC, -0.2), lw, u * 0.03);
      }],
      [0.4, () => {}],
    ],
    front: [
      gap(1.6),
      [1.1, (g, x, b, u, c, lw) => bigMug(g, x, b, u, lw, c.furnB)],
      gap(3.0),
      [1.0, (g, x, b, u, c, lw) => flowerPot(g, x, b, u, lw, '#2E8B7A', null)],
      gap(2.2),
    ],
  },

  garden: {
    night: true,
    wallpaper() {},
    wall: [
      [3.4, (g, x, b, u, c, lw) => {
        // The house at night, windows lit.
        const col = '#0E1433';
        polygon(g, [x + u * 0.3, b, x + u * 0.3, b - u * 1.1, x + u * 1.5, b - u * 1.8, x + u * 2.7, b - u * 1.1, x + u * 2.7, b], col, null);
        g.fillStyle = '#FFD166';
        for (const [wx, wy] of [[0.6, 0.95], [2.0, 0.95], [1.3, 0.6]]) g.fillRect(x + u * wx, b - u * wy, u * 0.36, u * 0.3);
        g.fillStyle = col;
        for (const [wx, wy] of [[0.6, 0.95], [2.0, 0.95], [1.3, 0.6]]) {
          g.fillRect(x + u * (wx + 0.16), b - u * wy, u * 0.04, u * 0.3);
          g.fillRect(x + u * wx, b - u * (wy - 0.13), u * 0.36, u * 0.04);
        }
      }],
      [2.2, (g, x, b, u) => {
        g.fillStyle = '#0B1230';
        circle(g, x + u * 0.7, b - u * 0.9, u * 0.55, '#0B1230');
        circle(g, x + u * 1.3, b - u * 1.1, u * 0.65, '#0B1230');
        circle(g, x + u * 1.8, b - u * 0.8, u * 0.45, '#0B1230');
        g.fillRect(x + u * 1.2, b - u * 0.5, u * 0.2, u * 0.5);
      }],
    ],
    furniture: [
      [1.1, (g, x, b, u, c, lw) => {
        // Sunflower.
        const cx = x + u * 0.5, cy = b - u * 1.25;
        box(g, cx - u * 0.04, cy, u * 0.08, u * 1.25, '#2E8B3A', lw);
        g.beginPath(); g.ellipse(cx + u * 0.16, b - u * 0.6, u * 0.16, u * 0.06, -0.5, 0, Math.PI * 2); g.fillStyle = '#34A853'; g.fill(); g.strokeStyle = INK; g.lineWidth = lw; g.stroke();
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          g.beginPath(); g.ellipse(cx + Math.cos(a) * u * 0.22, cy + Math.sin(a) * u * 0.22, u * 0.13, u * 0.06, a, 0, Math.PI * 2);
          g.fillStyle = c.furnB; g.fill(); g.stroke();
        }
        circle(g, cx, cy, u * 0.16, '#7A4A1E', lw);
      }],
      [1.2, (g, x, b, u, c, lw) => {
        // Tulips.
        for (const [dx, h, col] of [[0.25, 0.8, c.furnA], [0.6, 1.0, '#FF6B3D'], [0.95, 0.75, c.furnA]]) {
          const cx = x + u * dx;
          box(g, cx - u * 0.025, b - u * h, u * 0.05, u * h, '#2E8B3A', lw * 0.8);
          polygon(g, [cx - u * 0.12, b - u * (h + 0.02), cx - u * 0.12, b - u * (h + 0.2), cx - u * 0.05, b - u * (h + 0.13), cx, b - u * (h + 0.22), cx + u * 0.05, b - u * (h + 0.13), cx + u * 0.12, b - u * (h + 0.2), cx + u * 0.12, b - u * (h + 0.02), cx, b - u * (h - 0.06)], col, INK, lw);
        }
      }],
      [1.4, (g, x, b, u, c, lw) => {
        // Watering can.
        box(g, x + u * 0.3, b - u * 0.6, u * 0.7, u * 0.6, c.furnC, lw, u * 0.08);
        polygon(g, [x + u * 0.95, b - u * 0.3, x + u * 1.35, b - u * 0.75, x + u * 1.4, b - u * 0.7, x + u * 1.0, b - u * 0.15], c.furnC, INK, lw);
        g.strokeStyle = INK; g.lineWidth = lw * 2.2;
        g.beginPath(); g.arc(x + u * 0.65, b - u * 0.6, u * 0.25, Math.PI, 0); g.stroke();
        g.strokeStyle = c.furnC; g.lineWidth = lw; g.stroke();
      }],
      [1.0, (g, x, b, u, c, lw) => {
        // Mushroom.
        box(g, x + u * 0.38, b - u * 0.45, u * 0.24, u * 0.45, '#FFF3E3', lw, u * 0.06);
        g.beginPath(); g.moveTo(x + u * 0.05, b - u * 0.42); g.quadraticCurveTo(x + u * 0.5, b - u * 1.05, x + u * 0.95, b - u * 0.42); g.closePath();
        g.fillStyle = '#DD0200'; g.fill(); g.strokeStyle = INK; g.lineWidth = lw; g.stroke();
        for (const [dx, dy, r] of [[0.3, 0.55, 0.06], [0.55, 0.7, 0.07], [0.72, 0.52, 0.05]]) circle(g, x + u * dx, b - u * dy, u * r, '#FFFFFF');
      }],
      [0.6, () => {}],
    ],
    front: [
      gap(0.8),
      [1.0, (g, x, b, u, c, lw) => flowerPot(g, x, b, u, lw, '#B5532E', c.furnA)],
      gap(2.6),
      [1.0, (g, x, b, u, c, lw) => flowerPot(g, x, b, u, lw, '#B5532E', c.furnB)],
      gap(1.2),
      [1.0, (g, x, b, u, c, lw) => flowerPot(g, x, b, u, lw, '#8A5A3C', '#FFFFFF')],
      gap(2.8),
    ],
    fence(g, w, b, u, lw) {
      const col = '#3A2A1E';
      g.fillStyle = col;
      g.fillRect(0, b - u * 0.75, w, u * 0.08);
      g.fillRect(0, b - u * 0.35, w, u * 0.08);
      for (let x = 0; x < w; x += u * 0.32) {
        polygon(g, [x, b, x, b - u * 0.95, x + u * 0.11, b - u * 1.05, x + u * 0.22, b - u * 0.95, x + u * 0.22, b], col, '#1A120C', lw * 0.6);
      }
    },
    grass(g, w, b, u) {
      const rnd = seeded(11);
      g.fillStyle = '#15301F';
      g.beginPath();
      for (let x = 0; x < w; x += u * 0.05) {
        const h = u * (0.08 + rnd() * 0.16);
        g.moveTo(x, b); g.lineTo(x + u * 0.025, b - h); g.lineTo(x + u * 0.05, b);
      }
      g.fill();
    },
  },
};

export const SCENE_NAMES = Object.keys(ROOMS);

/** Unit size for a screen: about half the wall height, but never too big on phones. */
export const sceneUnit = (W, horizon) => Math.max(8, Math.min(horizon * 0.55, W * 0.35));

function stripWidth(items, u) {
  return Math.ceil(items.reduce((s, [w]) => s + w, 0) * u);
}

/** Front objects are bigger: they stand closer to the camera. */
const FRONT_SCALE = 1.35;

function layer(w, h) {
  const canvas = makeCanvas(w, h);
  const g = canvas.getContext('2d');
  g.lineJoin = 'round';
  return { canvas, g };
}

function tintLayer(g, w, h, color, alpha) {
  if (alpha <= 0) return;
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = rgb(hexToRgb(color), alpha);
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
}

/**
 * Build one room as three strips as tall as the wall (their bottom is the floor line).
 * Indoors the wall strip is opaque; the garden leaves the sky transparent for the live
 * stars and moon. The other two layers are transparent between the objects.
 */
export function buildScene(ambIndex, W, horizon) {
  const c = RAW[ambIndex];
  const room = ROOMS[c.name];
  const u = sceneUnit(W, horizon);
  const lw = Math.max(1, u * 0.022);
  const h = Math.max(1, Math.ceil(horizon));
  const tintA = c.tintAlpha * (room.night ? 0.35 : 1);

  // Wall.
  const wallW = Math.max(stripWidth(room.wall, u), Math.ceil(W * 0.6));
  const wall = layer(wallW, h);
  if (!room.night) {
    const grad = wall.g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, c.skyTop);
    grad.addColorStop(1, c.skyBottom);
    wall.g.fillStyle = grad;
    wall.g.fillRect(0, 0, wallW, h);
  }
  room.wallpaper(wall.g, wallW, h, u, c, h);
  const decoW = stripWidth(room.wall, u);
  for (let x0 = 0; x0 < wallW; x0 += decoW) {
    let x = x0;
    for (const [iw, draw] of room.wall) { if (x < wallW) draw(wall.g, x, h, u, c, lw); x += iw * u; }
  }
  if (!room.night) {
    // Baseboard where the wall meets the floor.
    wall.g.fillStyle = c.trim;
    wall.g.fillRect(0, h - u * 0.09, wallW, u * 0.09);
    wall.g.fillStyle = INK;
    wall.g.fillRect(0, h - u * 0.09, wallW, Math.max(1, lw * 0.6));
  }
  tintLayer(wall.g, wallW, h, c.tint, tintA);

  // Furniture.
  const midW = Math.max(stripWidth(room.furniture, u), Math.ceil(W * 0.6));
  const mid = layer(midW, h);
  if (room.fence) room.fence(mid.g, midW, h, u, lw);
  let x = 0;
  for (const [iw, draw] of room.furniture) { draw(mid.g, x, h, u, c, lw); x += iw * u; }
  if (room.grass) room.grass(mid.g, midW, h, u);
  tintLayer(mid.g, midW, h, c.tint, tintA);

  // Giant things in front: bigger, a touch darker (in the shade of the track).
  const fu = u * FRONT_SCALE, flw = lw * FRONT_SCALE;
  const frontW = Math.max(stripWidth(room.front, fu), Math.ceil(W * 0.8));
  const front = layer(frontW, h);
  x = 0;
  for (const [iw, draw] of room.front) { draw(front.g, x, h, fu, c, flw); x += iw * fu; }
  tintLayer(front.g, frontW, h, room.night ? c.tint : '#000000', room.night ? 0.3 : 0.08);

  return { wall: wall.canvas, mid: mid.canvas, front: front.canvas, u, opaque: !room.night };
}
