// Pickups, obstacles and scenery, pre-rendered once to off-screen canvases so each frame
// only scales bitmaps. Every sprite gets one tinted copy per room (the garden is at night).

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

  // ---- giant things of each room (the car is toy sized) ----
  books: () => draw(300, 250, (g) => {
    const books = [[260, 44, '#E85D75'], [230, 36, '#4F7CE0'], [270, 48, '#F2C14E'], [210, 34, '#34A853'], [245, 42, '#7B3FE4']];
    let y = 246;
    books.forEach(([w, h, c], i) => {
      const x = 20 + (i % 2) * 18;
      y -= h;
      roundRect(g, x, y, w, h, 6, c, INK, 6);
      g.fillStyle = '#FFF3E3'; g.fillRect(x + w - 40, y + 8, 24, h - 16);
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x + 14, y + h - 10, w - 60, 4);
    });
  }),

  crayon: () => draw(90, 360, (g) => {
    roundRect(g, 14, 90, 62, 266, 10, '#1F4BFF', INK, 6);
    polygon(g, [14, 92, 45, 8, 76, 92], '#1F4BFF', INK, 6);
    g.fillStyle = '#FFF3E3'; g.fillRect(17, 150, 56, 120);
    g.fillStyle = '#1F4BFF'; g.fillRect(17, 150, 56, 10); g.fillRect(17, 260, 56, 10);
    g.strokeStyle = INK; g.lineWidth = 6; g.strokeRect(14, 150, 62, 120);
    for (let y = 185; y < 250; y += 26) { g.beginPath(); g.arc(45, y, 7, 0, Math.PI * 2); g.fill(); }
  }),

  ball: () => draw(240, 240, (g) => {
    g.save(); g.beginPath(); g.arc(120, 120, 112, 0, Math.PI * 2); g.clip();
    const cols = ['#DD0200', '#FFFFFF', '#1F4BFF', '#FFFFFF', '#FFCC00', '#FFFFFF'];
    cols.forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.moveTo(120, 120); g.arc(120, 120, 120, (i / 6) * Math.PI * 2 - 0.3, ((i + 1) / 6) * Math.PI * 2 - 0.3); g.fill(); });
    g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.ellipse(80, 70, 30, 16, -0.6, 0, Math.PI * 2); g.fill();
    g.restore();
    g.beginPath(); g.arc(120, 120, 112, 0, Math.PI * 2); g.lineWidth = 7; g.strokeStyle = INK; g.stroke();
  }),

  cushion: () => draw(320, 200, (g) => {
    g.beginPath();
    g.moveTo(20, 40); g.quadraticCurveTo(160, 10, 300, 40); g.quadraticCurveTo(320, 110, 300, 180);
    g.quadraticCurveTo(160, 200, 20, 180); g.quadraticCurveTo(0, 110, 20, 40); g.closePath();
    g.fillStyle = '#2F8A78'; g.fill(); g.lineWidth = 7; g.strokeStyle = INK; g.stroke();
    g.fillStyle = '#F2C14E';
    for (let x = 60; x < 280; x += 60) for (let y = 70; y < 170; y += 50) { g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill(); }
  }),

  mug: () => draw(260, 240, (g) => {
    g.beginPath(); g.arc(200, 120, 44, -1.2, 1.2); g.lineWidth = 22; g.strokeStyle = INK; g.stroke();
    g.lineWidth = 12; g.strokeStyle = '#F2F2F2'; g.stroke();
    roundRect(g, 20, 24, 180, 210, 22, '#F2F2F2', INK, 7);
    g.beginPath(); g.ellipse(110, 30, 88, 16, 0, 0, Math.PI * 2); g.fillStyle = '#6B3A1E'; g.fill(); g.lineWidth = 6; g.stroke();
    g.fillStyle = '#DD0200'; g.fillRect(24, 110, 172, 30);
    g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(150, 50, 30, 170);
  }),

  plant: () => draw(260, 360, (g) => {
    for (const [a, l] of [[-0.9, 180], [-0.45, 220], [0, 240], [0.45, 215], [0.9, 170]]) {
      g.save(); g.translate(130, 220); g.rotate(a);
      g.beginPath(); g.ellipse(0, -l / 2, 28, l / 2, 0, 0, Math.PI * 2);
      g.fillStyle = '#34A853'; g.fill(); g.lineWidth = 6; g.strokeStyle = INK; g.stroke();
      g.beginPath(); g.moveTo(0, -8); g.lineTo(0, -l + 20); g.lineWidth = 4; g.strokeStyle = '#1E6B34'; g.stroke();
      g.restore();
    }
    polygon(g, [50, 220, 210, 220, 188, 354, 72, 354], '#D2693C', INK, 7);
    roundRect(g, 40, 212, 180, 26, 8, '#E07A4A', INK, 6);
  }),

  apple: () => draw(240, 250, (g) => {
    g.beginPath();
    g.moveTo(120, 62); g.bezierCurveTo(60, 20, 0, 70, 20, 150); g.bezierCurveTo(40, 230, 100, 250, 120, 226);
    g.bezierCurveTo(140, 250, 200, 230, 220, 150); g.bezierCurveTo(240, 70, 180, 20, 120, 62); g.closePath();
    g.fillStyle = '#DD0200'; g.fill(); g.lineWidth = 7; g.strokeStyle = INK; g.stroke();
    roundRect(g, 112, 16, 14, 52, 5, '#6B3A1E', INK, 5);
    g.beginPath(); g.ellipse(160, 40, 34, 14, -0.5, 0, Math.PI * 2); g.fillStyle = '#34A853'; g.fill(); g.lineWidth = 5; g.stroke();
    g.fillStyle = 'rgba(255,255,255,.45)'; g.beginPath(); g.ellipse(70, 110, 16, 30, 0.3, 0, Math.PI * 2); g.fill();
  }),

  orange: () => draw(240, 240, (g) => {
    g.beginPath(); g.arc(120, 128, 106, 0, Math.PI * 2); g.fillStyle = '#FF9500'; g.fill(); g.lineWidth = 7; g.strokeStyle = INK; g.stroke();
    g.fillStyle = 'rgba(0,0,0,.08)'; for (let i = 0; i < 30; i++) { g.beginPath(); g.arc(50 + (i * 37) % 140, 70 + (i * 53) % 120, 4, 0, Math.PI * 2); g.fill(); }
    g.beginPath(); g.ellipse(130, 26, 30, 12, 0.3, 0, Math.PI * 2); g.fillStyle = '#34A853'; g.fill(); g.lineWidth = 5; g.stroke();
    g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.ellipse(80, 90, 22, 14, -0.6, 0, Math.PI * 2); g.fill();
  }),

  cereal: () => draw(240, 330, (g) => {
    roundRect(g, 20, 10, 200, 316, 8, '#FFCC00', INK, 7);
    roundRect(g, 38, 40, 164, 110, 12, '#DD0200', INK, 6);
    const pts = [];
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 18 : 42, a = -Math.PI / 2 + (i * Math.PI) / 5; pts.push(120 + Math.cos(a) * r, 97 + Math.sin(a) * r); }
    polygon(g, pts, '#FFF3E3', INK, 6);
    g.beginPath(); g.ellipse(120, 240, 76, 44, 0, 0, Math.PI * 2); g.fillStyle = '#FFFFFF'; g.fill(); g.lineWidth = 6; g.stroke();
    for (const [x, y] of [[92, 230], [120, 222], [148, 234], [106, 252], [136, 254]]) { g.beginPath(); g.arc(x, y, 12, 0, Math.PI * 2); g.fillStyle = '#E8A33D'; g.fill(); g.lineWidth = 4; g.stroke(); }
  }),

  flower: () => draw(220, 380, (g) => {
    roundRect(g, 102, 110, 16, 266, 6, '#2E8B3A', INK, 5);
    g.beginPath(); g.ellipse(146, 250, 40, 14, -0.5, 0, Math.PI * 2); g.fillStyle = '#34A853'; g.fill(); g.lineWidth = 5; g.strokeStyle = INK; g.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.beginPath(); g.ellipse(110 + Math.cos(a) * 48, 100 + Math.sin(a) * 48, 36, 22, a, 0, Math.PI * 2);
      g.fillStyle = '#E85D9E'; g.fill(); g.lineWidth = 5; g.stroke();
    }
    g.beginPath(); g.arc(110, 100, 34, 0, Math.PI * 2); g.fillStyle = '#FFD84A'; g.fill(); g.lineWidth = 6; g.stroke();
  }),

  mushroom: () => draw(240, 230, (g) => {
    roundRect(g, 88, 100, 64, 126, 20, '#FFF3E3', INK, 6);
    g.beginPath(); g.moveTo(10, 118); g.quadraticCurveTo(120, -40, 230, 118); g.closePath();
    g.fillStyle = '#DD0200'; g.fill(); g.lineWidth = 7; g.strokeStyle = INK; g.stroke();
    for (const [x, y, r] of [[70, 80, 16], [130, 50, 18], [180, 90, 13], [110, 100, 10]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = '#FFFFFF'; g.fill(); }
  }),

  rock: () => draw(260, 170, (g) => {
    polygon(g, [10, 166, 30, 70, 90, 20, 170, 30, 230, 80, 252, 166], '#8A8F99', INK, 7);
    polygon(g, [90, 20, 110, 80, 170, 30], '#A5AAB3', null);
    g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(40, 130, 180, 8);
  }),

  // Toy marker post along the rails (indoors).
  post: () => draw(80, 300, (g) => {
    roundRect(g, 10, 272, 60, 24, 6, '#1F4BFF', INK, 5);
    roundRect(g, 30, 30, 20, 246, 6, '#FFFFFF', INK, 5);
    g.fillStyle = '#DD0200'; for (let y = 50; y < 270; y += 44) g.fillRect(33, y, 14, 20);
    polygon(g, [50, 32, 78, 44, 50, 58], '#FFCC00', INK, 4);
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

  // Garden stake light (the night level).
  lamp: () => draw(120, 300, (g) => {
    roundRect(g, 52, 90, 16, 206, 5, '#3A3A40', INK, 5);
    roundRect(g, 26, 40, 68, 60, 14, '#FFF6C9', INK, 6);
    roundRect(g, 18, 26, 84, 20, 8, '#3A3A40', INK, 5);
    g.fillStyle = 'rgba(0,0,0,.2)'; for (let x = 40; x < 90; x += 16) g.fillRect(x, 46, 4, 50);
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
