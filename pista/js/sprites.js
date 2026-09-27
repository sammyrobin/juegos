// Pickups, obstacles and scenery, pre-rendered once to off-screen canvases so each frame
// only scales bitmaps. Every sprite gets one tinted copy per ambient (day, sunset, night).

import { AMBIENTS } from './palette.js';
import { PLAYER_CARS, RIVAL_CARS, renderCarRear } from './cars.js';
import { makeCanvas, polygon, rgb, roundRect } from './util.js';

const INK = '#141414';
const SYSTEM_BOLD = '"Arial Black", Impact, "Segoe UI", sans-serif';

function draw(w, h, fn) {
  const c = makeCanvas(w, h);
  fn(c.getContext('2d'), w, h);
  return c;
}

const BUILDERS = {
  coin: () => draw(128, 128, (g) => {
    g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2);
    g.fillStyle = '#FFCC00'; g.fill(); g.lineWidth = 8; g.strokeStyle = INK; g.stroke();
    g.beginPath(); g.arc(64, 64, 38, 0, Math.PI * 2); g.lineWidth = 5; g.strokeStyle = '#D9A800'; g.stroke();
    // Five-point star.
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 11 : 26, a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
    }
    polygon(g, pts, '#FFF3E3', INK, 4);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(44, 38, 12, 6, -0.7, 0, Math.PI * 2); g.fill();
  }),

  nitro: () => draw(128, 128, (g) => {
    g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2);
    g.fillStyle = '#1F4BFF'; g.fill(); g.lineWidth = 8; g.strokeStyle = INK; g.stroke();
    polygon(g, [74, 16, 34, 70, 60, 70, 48, 112, 94, 52, 66, 52, 82, 16], '#FFCC00', INK, 6);
  }),

  cone: () => draw(100, 128, (g) => {
    roundRect(g, 6, 106, 88, 18, 5, INK);
    polygon(g, [50, 6, 82, 108, 18, 108], '#DD0200', INK, 6);
    g.save(); g.beginPath(); g.moveTo(50, 6); g.lineTo(82, 108); g.lineTo(18, 108); g.closePath(); g.clip();
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 44, 100, 14); g.fillRect(0, 76, 100, 14);
    g.restore();
    polygon(g, [50, 6, 82, 108, 18, 108], null, INK, 6);
  }),

  tree: () => draw(256, 340, (g) => {
    roundRect(g, 112, 170, 32, 164, 10, '#FFF3E3', INK, 7);
    g.fillStyle = '#DD0200'; for (let y = 184; y < 330; y += 36) g.fillRect(115, y, 26, 14);
    g.beginPath(); g.arc(128, 116, 104, 0, Math.PI * 2); g.fillStyle = '#34A853'; g.fill(); g.lineWidth = 8; g.strokeStyle = INK; g.stroke();
    g.beginPath(); g.arc(128, 116, 70, 0.3, Math.PI * 1.6); g.lineWidth = 12; g.strokeStyle = '#7ED957'; g.stroke();
    g.beginPath(); g.arc(128, 116, 36, 2, Math.PI * 3.2); g.stroke();
  }),

  blocks: () => draw(256, 300, (g) => {
    const block = (x, y, s, color, letter) => {
      roundRect(g, x, y, s, s, 10, color, INK, 7);
      roundRect(g, x + 12, y + 12, s - 24, s - 24, 6, 'rgba(255,255,255,.18)');
      g.fillStyle = '#FFF3E3'; g.font = `900 ${s * 0.55}px ${SYSTEM_BOLD}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 6; g.strokeStyle = INK; g.strokeText(letter, x + s / 2, y + s / 2 + 3); g.fillText(letter, x + s / 2, y + s / 2 + 3);
    };
    block(8, 176, 118, '#1F4BFF', 'T');
    block(130, 176, 118, '#DD0200', 'P');
    block(66, 56, 124, '#FFCC00', '★');
  }),

  flag: () => draw(160, 360, (g) => {
    roundRect(g, 14, 10, 14, 346, 6, '#E8E8E8', INK, 6);
    const x0 = 28, y0 = 18, cw = 26, ch = 22;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      g.fillStyle = (r + c) % 2 ? INK : '#FFFFFF';
      g.fillRect(x0 + c * cw, y0 + r * ch + Math.sin(c * 0.9) * 6, cw, ch);
    }
    g.strokeStyle = INK; g.lineWidth = 6; g.strokeRect(x0, y0, cw * 5, ch * 5 + 4);
  }),

  sign: () => draw(520, 300, (g) => {
    roundRect(g, 90, 180, 26, 116, 6, '#8A8F99', INK, 6);
    roundRect(g, 404, 180, 26, 116, 6, '#8A8F99', INK, 6);
    roundRect(g, 6, 6, 508, 190, 22, '#FFCC00', INK, 10);
    roundRect(g, 22, 22, 476, 158, 14, '#FFF3E3', INK, 5);
    g.font = `italic 900 92px ${SYSTEM_BOLD}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.strokeStyle = INK; g.strokeText('TURBO', 260, 74); g.fillStyle = '#DD0200'; g.fillText('TURBO', 260, 74);
    g.font = `italic 900 64px ${SYSTEM_BOLD}`;
    g.strokeText('PISTA', 260, 142); g.fillStyle = '#1F4BFF'; g.fillText('PISTA', 260, 142);
  }),

  sign2: () => draw(520, 300, (g) => {
    roundRect(g, 240, 180, 40, 116, 6, '#8A8F99', INK, 6);
    roundRect(g, 6, 6, 508, 190, 22, '#1F4BFF', INK, 10);
    polygon(g, [110, 30, 60, 110, 96, 110, 80, 170, 144, 84, 108, 84, 128, 30], '#FFCC00', INK, 7);
    g.font = `900 70px ${SYSTEM_BOLD}`; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.lineWidth = 9; g.strokeStyle = INK; g.strokeText('NITRO', 176, 84); g.fillStyle = '#FFF3E3'; g.fillText('NITRO', 176, 84);
    g.font = `900 44px ${SYSTEM_BOLD}`; g.fillStyle = '#FFCC00'; g.strokeText('→ → →', 186, 150); g.fillText('→ → →', 186, 150);
  }),

  lamp: () => draw(140, 440, (g) => {
    roundRect(g, 60, 40, 18, 396, 6, '#50535A', INK, 6);
    roundRect(g, 40, 424, 58, 14, 4, '#50535A', INK, 5);
    roundRect(g, 14, 18, 110, 30, 12, '#50535A', INK, 6);
    roundRect(g, 26, 40, 86, 12, 5, '#FFF6C9', INK, 4);
  }),

  tires: () => draw(260, 220, (g) => {
    const tire = (x, y) => {
      g.beginPath(); g.ellipse(x, y, 60, 26, 0, 0, Math.PI * 2); g.fillStyle = '#26262C'; g.fill(); g.lineWidth = 6; g.strokeStyle = INK; g.stroke();
      g.beginPath(); g.ellipse(x, y - 2, 30, 11, 0, 0, Math.PI * 2); g.fillStyle = '#0E0E10'; g.fill();
    };
    for (const [x, y, c] of [[70, 190, '#DD0200'], [190, 190, '#FFFFFF'], [70, 150, '#FFFFFF'], [190, 150, '#DD0200'], [130, 110, '#DD0200'], [130, 70, '#FFFFFF']]) {
      g.fillStyle = c; g.fillRect(x - 60, y - 6, 120, 20); g.strokeStyle = INK; g.lineWidth = 6; g.strokeRect(x - 60, y - 6, 120, 20);
      tire(x, y - 8);
    }
  }),
};

/** World widths (road half-width is 2200) and whether night lights them. */
export const SPRITE_INFO = {
  coin: { w: 320 },
  nitro: { w: 420 },
  cone: { w: 250 },
  tree: { w: 1300 },
  blocks: { w: 1100 },
  flag: { w: 520 },
  sign: { w: 2200 },
  sign2: { w: 2200 },
  lamp: { w: 420, light: true },
  tires: { w: 900 },
};

export class SpriteBank {
  constructor() {
    this.base = {};
    this.variants = {};
    for (const [name, build] of Object.entries(BUILDERS)) this.base[name] = build();
    PLAYER_CARS.forEach((spec, i) => { this.base[`car${i}`] = renderCarRear(spec, 360); });
    RIVAL_CARS.forEach((spec, i) => { this.base[`rival${i}`] = renderCarRear(spec, 300); });
    for (const name of Object.keys(this.base)) {
      this.variants[name] = AMBIENTS.map((amb) => tint(this.base[name], amb.tint, amb.tintAlpha * (name.startsWith('car') ? 0.45 : 1)));
    }
  }

  get(name, ambientIndex) {
    return this.variants[name][ambientIndex] || this.base[name];
  }
}

function tint(src, color, alpha) {
  if (alpha <= 0) return src;
  const c = makeCanvas(src.width, src.height);
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = rgb(color, alpha);
  g.fillRect(0, 0, c.width, c.height);
  return c;
}
