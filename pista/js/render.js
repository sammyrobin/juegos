// Canvas 2D renderer for the pseudo-3D road.
//
// 1. Project every visible segment, near to far, accumulating the curve (x, dx) so the
//    road bends without any real 3D math.
// 2. Paint far to near (painter's algorithm): each segment's ground band, road, blue walls,
//    lane marks and holes, then the sprites standing on it. Hills hide what is behind them
//    for free, because nearer segments are painted on top.
// 3. Paint the player's car, lights, particles and speed effects on top.

import { CAR_W } from './obstacles.js';
import { LANES, ROAD_W, SEG, WALL_H } from './track.js';
import { clamp, easeInOut, lerp, rgb, seeded } from './util.js';

export const CAMERA_H = 1300;
export const FOV = 100;
export const DRAW_DISTANCE = 260;
const CAMERA_DEPTH = 1 / Math.tan(((FOV / 2) * Math.PI) / 180);
export const PLAYER_Z = CAMERA_H * CAMERA_DEPTH;
const RIVAL_W = 580;
const RAMP_H = 380;
const RAMP_LEN = 3;

// ---------------------------------------------------------------------------
// Particles (screen space): sparks, coin stars, cone debris and floating texts.
// ---------------------------------------------------------------------------

export class Particles {
  constructor() { this.list = []; }

  clear() { this.list.length = 0; }

  spawn(p) {
    if (this.list.length > 260) this.list.shift();
    this.list.push({ vx: 0, vy: 0, g: 0, life: 0.6, size: 6, color: '#FFCC00', rot: 0, vr: 0, ...p, age: 0 });
  }

  burst(x, y, count, opts) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (opts.speed || 400) * (0.4 + Math.random() * 0.8);
      this.spawn({ ...opts, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (opts.lift || 0), vr: (Math.random() - 0.5) * 12 });
    }
  }

  update(dt) {
    for (const p of this.list) {
      p.age += dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    this.list = this.list.filter((p) => p.age < p.life);
  }

  draw(ctx, scale) {
    for (const p of this.list) {
      const k = 1 - p.age / p.life;
      ctx.globalAlpha = Math.min(1, k * 1.6);
      if (p.text) {
        ctx.font = `900 ${Math.round(p.size * scale)}px "Big Shoulders Display", Impact, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = Math.max(2, 5 * scale);
        ctx.strokeStyle = '#141414';
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y);
      } else if (p.shape === 'rect') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        const s = p.size * scale;
        ctx.fillRect(-s / 2, -s / 2, s, s * 0.6);
        ctx.restore();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.size * scale * (0.4 + 0.6 * k)), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------------------

export class Renderer {
  constructor(canvas, sprites, reducedMotion) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.sprites = sprites;
    this.reducedMotion = reducedMotion;
    this.quality = 1;
    this.skyOffset = 0;
    this.hillOffset = 0;
    this.cityOffset = 0;

    const rnd = seeded(7);
    this.stars = Array.from({ length: 110 }, () => ({ x: rnd(), y: rnd() * 0.95, r: 0.6 + rnd() * 1.6, p: rnd() * 6.28 }));
    this.clouds = Array.from({ length: 9 }, () => ({ x: rnd(), y: 0.12 + rnd() * 0.45, s: 0.6 + rnd() * 0.9 }));
    this.hillsFar = Array.from({ length: 40 }, (_, i) => 0.35 + 0.65 * Math.abs(Math.sin(i * 1.7) * 0.6 + Math.sin(i * 0.53) * 0.4) * (0.6 + rnd() * 0.4));
    this.hillsNear = Array.from({ length: 28 }, (_, i) => 0.3 + 0.7 * Math.abs(Math.sin(i * 1.1 + 2) * 0.5 + Math.sin(i * 0.37) * 0.5));
    this.city = Array.from({ length: 34 }, () => ({ w: 0.5 + rnd(), h: 0.25 + rnd() * 0.75, round: rnd() < 0.35, win: Math.floor(rnd() * 1000) }));
  }

  /** Match the canvas bitmap to its CSS size (capped so phones keep 60 FPS). */
  resize() {
    const cssW = this.canvas.clientWidth || window.innerWidth;
    const cssH = this.canvas.clientHeight || window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2) * this.quality;
    const maxPixels = 2.3e6;
    if (cssW * cssH * dpr * dpr > maxPixels) dpr = Math.sqrt(maxPixels / (cssW * cssH));
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.layout();
  }

  layout() {
    const W = (this.W = this.canvas.width);
    const H = (this.H = this.canvas.height);
    // One scale for x and a smaller one for y keeps the road undistorted in portrait
    // and gives the classic flat arcade look in landscape.
    this.Sx = Math.max(W / 2, H * 0.32);
    this.Sy = Math.min(this.Sx * 1.15, H * 0.48);
    this.horizon = H * 0.86 - this.Sy;
    this.groundY = H * 0.86;
    this.ui = Math.min(W, H * 1.2) / 900; // scale for texts and particles
  }

  /** Background parallax follows the curves. */
  scroll(curve, speedRatio, dt) {
    const k = curve * speedRatio * dt;
    this.skyOffset += k * 0.0012;
    this.hillOffset += k * 0.0035;
    this.cityOffset += k * 0.006;
  }

  project(p, camX, camY, camZ) {
    p.camera.x = p.world.x - camX;
    p.camera.y = p.world.y - camY;
    p.camera.z = p.world.z - camZ;
    const s = (p.screen.scale = CAMERA_DEPTH / p.camera.z);
    p.screen.x = this.W / 2 + s * p.camera.x * this.Sx;
    p.screen.y = this.horizon - s * p.camera.y * this.Sy;
    p.screen.w = s * ROAD_W * this.Sx;
  }

  // =========================================================================
  // World frame
  // =========================================================================

  /**
   * view: { track, position, player, rivals (Map segment → rivals), pal, amb (ambient index),
   *         time, shake, flash, flashColor, particles, speedLines (0..1), showPlayer }
   */
  frame(view) {
    const { ctx } = this;
    const { track, position, player, pal } = view;
    const W = this.W, H = this.H;

    const baseSeg = track.find(position);
    const basePercent = (position % SEG) / SEG;
    const playerSeg = track.find(position + PLAYER_Z);
    const playerPercent = ((position + PLAYER_Z) % SEG) / SEG;
    const playerY = lerp(playerSeg.p1.world.y, playerSeg.p2.world.y, playerPercent);
    view.playerY = playerY;
    view.playerSeg = playerSeg;

    ctx.save();
    if (view.shake > 0) ctx.translate((Math.random() - 0.5) * view.shake * this.ui * 18, (Math.random() - 0.5) * view.shake * this.ui * 12);

    this.background(pal, view.time, playerY);

    // ---- projection pass (near → far) ----
    const camY = playerY + CAMERA_H;
    const camX = player.x * ROAD_W;
    let x = 0;
    let dx = -(baseSeg.curve * basePercent);
    const list = [];
    for (let n = 0; n < DRAW_DISTANCE; n++) {
      const seg = track.get(baseSeg.index + n);
      if (!seg) break;
      this.project(seg.p1, camX - x, camY, position);
      this.project(seg.p2, camX - x - dx, camY, position);
      x += dx;
      dx += seg.curve;
      const d = n / DRAW_DISTANCE;
      seg.fog = 1 - 1 / Math.exp(d * d * pal.fogDensity);
      seg.visible = seg.p1.camera.z > CAMERA_DEPTH * 40;
      list.push(seg);
    }

    // ---- paint pass (far → near) ----
    // Far plain segments thinner than ~2 px are merged into one piece.
    const pieces = [];
    for (let n = 0; n < list.length; n++) {
      const seg = list[n];
      if (!seg.visible) continue;
      const drawRoad = seg.p2.screen.y < seg.p1.screen.y;
      const plain = !seg.hole && !seg.gap && !seg.start;
      const last = pieces[pieces.length - 1];
      if (drawRoad && plain && last && last.plain && last.drawRoad && last.to === n - 1 && last.p1.y - seg.p2.screen.y < 2.2) {
        last.p2 = seg.p2.screen;
        last.to = n;
        last.fog = seg.fog;
        continue;
      }
      pieces.push({ from: n, to: n, p1: seg.p1.screen, p2: seg.p2.screen, band: seg.band, gap: seg.gap, hole: seg.hole, start: seg.start, fog: seg.fog, plain, drawRoad });
    }
    for (let i = pieces.length - 1; i >= 0; i--) {
      const piece = pieces[i];
      if (piece.drawRoad) this.segment(piece, pal);
      for (let n = piece.to; n >= piece.from; n--) this.segmentSprites(list[n], view, list, n);
    }

    if (pal.night > 0.3 && view.showPlayer) this.headlights(pal.night);
    if (view.showPlayer) this.car(view);
    view.particles.draw(ctx, this.ui);
    if (view.speedLines > 0) this.speedLines(view.speedLines, view.time, this.W / 2, this.horizon);
    ctx.restore();

    if (view.flash > 0) {
      ctx.fillStyle = view.flashColor || '#FFFFFF';
      ctx.globalAlpha = clamp(view.flash, 0, 1) * (this.reducedMotion ? 0.25 : 0.6);
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  // ---- background ----------------------------------------------------------

  background(pal, time, playerY) {
    const { ctx, W, H } = this;
    const hz = this.horizon;
    const sky = ctx.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, pal.css.skyTop);
    sky.addColorStop(1, pal.css.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, hz + 2);
    ctx.fillStyle = pal.css.grassB;
    ctx.fillRect(0, hz, W, H - hz);

    const wrap = (v) => ((v % 1) + 1) % 1;

    if (pal.stars > 0.02) {
      ctx.fillStyle = '#FFFFFF';
      for (const s of this.stars) {
        const tw = this.reducedMotion ? 0.8 : 0.55 + 0.45 * Math.sin(time * 2 + s.p);
        ctx.globalAlpha = pal.stars * tw;
        ctx.fillRect(wrap(s.x - this.skyOffset * 0.5) * W, s.y * hz * 0.92, s.r * this.ui * 2, s.r * this.ui * 2);
      }
      ctx.globalAlpha = 1;
    }

    // Sun (day, sunset) or moon (night), with a soft glow.
    const r = pal.sunR * Math.min(W, H * 1.6);
    const sx = wrap(0.68 - this.skyOffset * 0.8) * (W + r * 4) - r * 2;
    const sy = hz * pal.sunY;
    const glow = ctx.createRadialGradient(sx, sy, r * 0.5, sx, sy, r * 3.2);
    glow.addColorStop(0, rgb(pal.sun, 0.45));
    glow.addColorStop(1, rgb(pal.sun, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(sx - r * 3.2, sy - r * 3.2, r * 6.4, r * 6.4);
    ctx.fillStyle = pal.css.sun;
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
    if (pal.night > 0.7) {
      ctx.fillStyle = pal.css.skyTop;
      ctx.globalAlpha = (pal.night - 0.7) / 0.3;
      ctx.beginPath(); ctx.arc(sx + r * 0.45, sy - r * 0.25, r * 0.85, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (pal.clouds > 0.05) {
      ctx.fillStyle = `rgba(255,255,255,${(0.85 * pal.clouds).toFixed(3)})`;
      for (const c of this.clouds) {
        const cx = wrap(c.x - this.skyOffset - time * 0.004) * (W * 1.4) - W * 0.2;
        const cy = c.y * hz;
        const s = c.s * this.ui * 70;
        ctx.beginPath();
        ctx.ellipse(cx, cy, s * 1.6, s * 0.55, 0, 0, Math.PI * 2);
        ctx.ellipse(cx - s * 0.7, cy + s * 0.1, s * 0.8, s * 0.45, 0, 0, Math.PI * 2);
        ctx.ellipse(cx + s * 0.5, cy - s * 0.3, s * 0.9, s * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const lift = clamp(playerY / (55 * SEG), -1, 1) * this.Sy * 0.06;
    this.ridge(this.hillsFar, pal.css.hillFar, hz * 0.26, this.hillOffset, hz + lift + 2);
    this.skyline(pal, hz + lift + 2);
    this.ridge(this.hillsNear, pal.css.hillNear, hz * 0.12, this.hillOffset * 1.8, hz + lift + 4);
  }

  ridge(points, color, height, offset, base) {
    const { ctx, W } = this;
    const span = W * 1.6;
    const step = span / points.length;
    const shift = ((((offset * span) % span) + span) % span);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-step, base + 2);
    for (let i = -1; i <= points.length * 2; i++) {
      const px = i * step - shift;
      if (px > W + step) break;
      const h = points[((i % points.length) + points.length) % points.length];
      ctx.lineTo(px, base - h * height);
    }
    ctx.lineTo(W + step, base + 2);
    ctx.closePath();
    ctx.fill();
  }

  /** Far toy-block city: rounded towers with lit windows at night. */
  skyline(pal, base) {
    const { ctx, W } = this;
    const unit = this.ui * 46;
    const total = this.city.reduce((s, b) => s + b.w * unit + unit * 0.35, 0);
    let px = -((((this.cityOffset * total) % total) + total) % total);
    const maxH = this.horizon * 0.2;
    while (px < W) {
      for (const b of this.city) {
        const bw = b.w * unit, bh = b.h * maxH;
        if (px + bw > 0 && px < W) {
          ctx.fillStyle = pal.css.city;
          ctx.beginPath();
          if (b.round) ctx.roundRect(px, base - bh, bw, bh + 2, [bw / 2, bw / 2, 0, 0]);
          else ctx.rect(px, base - bh, bw, bh + 2);
          ctx.fill();
          if (pal.night > 0.5) {
            ctx.fillStyle = rgb([255, 214, 102], (pal.night - 0.5) * 1.6);
            const ws = unit * 0.12;
            for (let wy = base - bh + ws * 2; wy < base - ws; wy += ws * 2.4) {
              for (let wx = px + ws; wx < px + bw - ws; wx += ws * 2.2) {
                if ((b.win + Math.floor(wx * 7 + wy * 3)) % 3 === 0) ctx.fillRect(wx, wy, ws, ws);
              }
            }
          }
        }
        px += bw + unit * 0.35;
        if (px >= W) break;
      }
    }
  }

  // ---- road ----------------------------------------------------------------

  /**
   * Paint one road piece: a segment, or several far segments merged into one strip
   * (they are thinner than a pixel, and fewer fills keep phones at 60 FPS).
   * Quads of the same color are batched into a single path.
   */
  segment(piece, pal) {
    const { ctx, W } = this;
    const p1 = piece.p1, p2 = piece.p2;
    const x1 = p1.x, y1 = p1.y, w1 = p1.w;
    const x2 = p2.x, y2 = p2.y - 0.6, w2 = p2.w;
    const band = piece.band;
    const near = w1 > W * 0.04;

    ctx.fillStyle = band ? pal.css.grassA : pal.css.grassB;
    ctx.fillRect(0, y2, W, y1 - y2 + 1);

    if (piece.gap) {
      // Missing track piece: only its shadow on the floor.
      this.fillQuads('rgba(0,0,0,.28)', [x1 - w1 * 1.1, y1, x1 + w1 * 1.1, y1, x2 + w2 * 1.1, y2, x2 - w2 * 1.1, y2]);
    } else {
      const r1 = w1 * 0.09, r2 = w2 * 0.09;
      const h1 = WALL_H * p1.scale * this.Sy, h2 = WALL_H * p2.scale * this.Sy;

      // Outer faces (seen in curves), road, marks, then inner faces and rims.
      if (near) {
        this.fillQuads(pal.css.wallOuter,
          [x1 - w1 - r1, y1, x1 - w1 - r1, y1 - h1, x2 - w2 - r2, y2 - h2, x2 - w2 - r2, y2],
          [x1 + w1 + r1, y1, x1 + w1 + r1, y1 - h1, x2 + w2 + r2, y2 - h2, x2 + w2 + r2, y2]);
      }
      this.fillQuads(band ? pal.css.roadA : pal.css.roadB, [x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2]);

      const marks = [];
      if (band && w1 > W * 0.01) {
        const lw1 = w1 * 0.035, lw2 = w2 * 0.035;
        for (let lane = 1; lane < LANES; lane++) {
          const lx1 = x1 - w1 + (2 * w1 * lane) / LANES;
          const lx2 = x2 - w2 + (2 * w2 * lane) / LANES;
          marks.push([lx1 - lw1, y1, lx1 + lw1, y1, lx2 + lw2, y2, lx2 - lw2, y2]);
        }
      }
      if (near) {
        // Thin yellow edge lines along the walls.
        const e1 = w1 * 0.04, e2 = w2 * 0.04;
        marks.push([x1 - w1, y1, x1 - w1 + e1, y1, x2 - w2 + e2, y2, x2 - w2, y2]);
        marks.push([x1 + w1 - e1, y1, x1 + w1, y1, x2 + w2, y2, x2 + w2 - e2, y2]);
      }
      if (marks.length) this.fillQuads(pal.css.lane, ...marks);

      if (piece.hole) {
        const { x1: a, x2: b } = piece.hole;
        this.fillQuads('#1A0E06', [x1 + w1 * a, y1, x1 + w1 * b, y1, x2 + w2 * b, y2, x2 + w2 * a, y2]);
        const rim = w1 * 0.025, rim2 = w2 * 0.025;
        this.fillQuads('#141414',
          [x1 + w1 * a - rim, y1, x1 + w1 * a, y1, x2 + w2 * a, y2, x2 + w2 * a - rim2, y2],
          [x1 + w1 * b, y1, x1 + w1 * b + rim, y1, x2 + w2 * b + rim2, y2, x2 + w2 * b, y2]);
      }

      if (piece.start) {
        const cols = 10, dark = [], light = [];
        for (let c = 0; c < cols; c++) for (let r = 0; r < 2; r++) {
          const ta = c / cols, tb = (c + 1) / cols, ya = lerp(y1, y2, r / 2), yb = lerp(y1, y2, (r + 1) / 2);
          const wa = lerp(w1, w2, r / 2), wb = lerp(w1, w2, (r + 1) / 2), xa = lerp(x1, x2, r / 2), xb = lerp(x1, x2, (r + 1) / 2);
          ((c + r) % 2 ? dark : light).push([xa - wa + 2 * wa * ta, ya, xa - wa + 2 * wa * tb, ya, xb - wb + 2 * wb * tb, yb, xb - wb + 2 * wb * ta, yb]);
        }
        this.fillQuads('#141414', ...dark);
        this.fillQuads('#FFFFFF', ...light);
      }

      this.fillQuads(band ? pal.css.wallA : pal.css.wallB,
        [x1 - w1, y1, x1 - w1, y1 - h1, x2 - w2, y2 - h2, x2 - w2, y2],
        [x1 + w1, y1, x1 + w1, y1 - h1, x2 + w2, y2 - h2, x2 + w2, y2]);
      this.fillQuads(pal.css.wallTop,
        [x1 - w1, y1 - h1, x2 - w2, y2 - h2, x2 - w2 - r2, y2 - h2, x1 - w1 - r1, y1 - h1],
        [x1 + w1, y1 - h1, x2 + w2, y2 - h2, x2 + w2 + r2, y2 - h2, x1 + w1 + r1, y1 - h1]);
    }

    if (piece.fog > 0.01) {
      const top = WALL_H * p2.scale * this.Sy;
      ctx.globalAlpha = piece.fog;
      ctx.fillStyle = pal.css.fog;
      ctx.fillRect(0, y2 - top, W, y1 - y2 + top + 1);
      ctx.globalAlpha = 1;
    }
  }

  /** Fill several quads (8 numbers each) with one color in a single path. */
  fillQuads(color, ...quads) {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const q of quads) {
      ctx.moveTo(q[0], q[1]);
      ctx.lineTo(q[2], q[3]);
      ctx.lineTo(q[4], q[5]);
      ctx.lineTo(q[6], q[7]);
      ctx.closePath();
    }
    ctx.fill();
  }

  quad(ax, ay, bx, by, cx, cy, dx, dy, color) {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(cx, cy);
    ctx.lineTo(dx, dy);
    ctx.closePath();
    ctx.fill();
  }

  // ---- sprites -------------------------------------------------------------

  segmentSprites(seg, view, list, n) {
    const { ctx } = this;
    const p1 = seg.p1.screen;
    const alpha = 1 - seg.fog * 0.95;
    if (alpha <= 0.02) return;
    ctx.globalAlpha = alpha;
    const amb = view.amb;
    const time = view.time;

    // Pickups and obstacles already behind the car are not drawn (they would fill the screen).
    const behind = seg.p1.camera.z < PLAYER_Z * 0.85;
    for (const item of seg.items) {
      if (item.hit && !item.scenery && item.kind !== 'loop') continue;
      if (behind && !item.scenery) continue;
      const sx = p1.x + p1.scale * item.x * ROAD_W * this.Sx;
      switch (item.kind) {
        case 'rivalSpawn':
          break;
        case 'coin':
        case 'air': {
          const spin = this.reducedMotion ? 1 : Math.abs(Math.cos(time * 4 + item.phase)) * 0.8 + 0.2;
          const alt = (item.alt || 130) + (this.reducedMotion ? 0 : Math.sin(time * 5 + item.phase) * 25);
          this.sprite(this.sprites.get('coin', amb), item.w, sx, p1.y, p1.scale, alt, spin, view.pal.night > 0.4 ? '#FFD84A' : null);
          break;
        }
        case 'nitro': {
          const alt = 170 + (this.reducedMotion ? 0 : Math.sin(time * 4 + item.phase) * 50);
          this.sprite(this.sprites.get('nitro', amb), item.w, sx, p1.y, p1.scale, alt, 1, '#6C8CFF');
          break;
        }
        case 'oil':
          this.oil(sx, seg, item);
          break;
        case 'ramp':
          this.ramp(item, seg, list, n, view.pal);
          break;
        case 'loop':
          this.loopRing(seg, view.pal, time);
          break;
        default: {
          const img = this.sprites.get(item.kind, amb);
          this.sprite(img, item.w, sx, p1.y, p1.scale, 0, 1);
          if (item.kind === 'lamp' && view.pal.night > 0.3) {
            const dw = item.w * p1.scale * this.Sx;
            this.glow(sx, p1.y - dw * (img.height / img.width) * 0.9, dw * 1.6, `rgba(255,236,160,${0.55 * view.pal.night})`);
          }
        }
      }
    }

    const rivals = view.rivals.get(seg.index);
    if (rivals) {
      const p2 = seg.p2.screen;
      for (const r of rivals) {
        const t = (r.z % SEG) / SEG;
        const scale = lerp(p1.scale, p2.scale, t);
        const x = lerp(p1.x, p2.x, t) + scale * r.x * ROAD_W * this.Sx;
        const y = lerp(p1.y, p2.y, t);
        this.shadow(x, y, RIVAL_W * scale * this.Sx * 0.52, 0);
        this.sprite(this.sprites.get(`rival${r.style}`, amb), RIVAL_W, x, y, scale, 0, 1);
        if (view.pal.night > 0.3) {
          const dw = RIVAL_W * scale * this.Sx;
          this.glow(x - dw * 0.3, y - dw * 0.3, dw * 0.45, `rgba(255,40,40,${0.7 * view.pal.night})`);
          this.glow(x + dw * 0.3, y - dw * 0.3, dw * 0.45, `rgba(255,40,40,${0.7 * view.pal.night})`);
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  sprite(img, worldW, x, y, scale, alt, squeeze = 1, glowColor = null) {
    const dw = worldW * scale * this.Sx;
    if (dw < 1.5) return;
    const dh = dw * (img.height / img.width);
    const dy = y - dh - alt * scale * this.Sy;
    if (glowColor) this.glow(x, dy + dh / 2, dw * 1.3, glowColor, 0.5);
    this.ctx.drawImage(img, x - (dw * squeeze) / 2, dy, dw * squeeze, dh);
  }

  glow(x, y, radius, color, alpha = 1) {
    const { ctx } = this;
    if (radius < 2) return;
    const prev = ctx.globalCompositeOperation;
    const prevA = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = prevA * alpha;
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.globalCompositeOperation = prev;
    ctx.globalAlpha = prevA;
  }

  shadow(x, y, halfW, alt) {
    const { ctx } = this;
    const k = clamp(1 - alt / 1600, 0.35, 1);
    ctx.fillStyle = `rgba(0,0,0,${0.32 * k})`;
    ctx.beginPath();
    ctx.ellipse(x, y, halfW * k, Math.max(1, halfW * 0.16 * k), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  oil(sx, seg, item) {
    const { ctx } = this;
    const p1 = seg.p1.screen, p2 = seg.p2.screen;
    const rx = (item.w / 2) * p1.scale * this.Sx;
    const ry = Math.max(1, (p1.y - p2.y) * 2.4);
    const cy = p1.y - ry * 0.6;
    ctx.fillStyle = 'rgba(20,16,24,.88)';
    ctx.beginPath();
    ctx.ellipse(sx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.ellipse(sx - rx * 0.55, cy + ry * 0.2, rx * 0.5, ry * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(120,160,255,.35)';
    ctx.beginPath();
    ctx.ellipse(sx + rx * 0.2, cy - ry * 0.2, rx * 0.45, ry * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,120,220,.25)';
    ctx.beginPath();
    ctx.ellipse(sx - rx * 0.25, cy + ry * 0.1, rx * 0.3, ry * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Jump ramp: a yellow wedge rising over RAMP_LEN segments with red chevrons. */
  ramp(item, seg, list, n) {
    const far = list[n + RAMP_LEN];
    if (!far) return;
    const a = seg.p1.screen, b = far.p1.screen;
    const hw = item.w / 2 / ROAD_W;
    const lift = RAMP_H * b.scale * this.Sy;
    const blx = a.x + a.w * (item.x - hw), brx = a.x + a.w * (item.x + hw);
    const tlx = b.x + b.w * (item.x - hw), trx = b.x + b.w * (item.x + hw);
    const ty = b.y - lift;
    const lw = Math.max(1, a.w * 0.012);
    // Side faces.
    this.quad(blx, a.y, tlx, ty, tlx, b.y, blx, a.y, '#B38F00');
    this.quad(brx, a.y, trx, ty, trx, b.y, brx, a.y, '#B38F00');
    // Slope with stripes.
    this.quad(blx, a.y, brx, a.y, trx, ty, tlx, ty, '#FFCC00');
    for (const [t0, t1] of [[0.18, 0.32], [0.5, 0.64], [0.82, 0.94]]) {
      const ly0 = lerp(a.y, ty, t0), ly1 = lerp(a.y, ty, t1);
      this.quad(lerp(blx, tlx, t0), ly0, lerp(brx, trx, t0), ly0, lerp(brx, trx, t1), ly1, lerp(blx, tlx, t1), ly1, '#DD0200');
    }
    const { ctx } = this;
    ctx.strokeStyle = '#141414';
    ctx.lineWidth = lw * 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(blx, a.y); ctx.lineTo(brx, a.y); ctx.lineTo(trx, ty); ctx.lineTo(tlx, ty); ctx.closePath();
    ctx.stroke();
  }

  /** The loop seen from behind: a giant orange ring with blue edges standing on the road. */
  loopRing(seg, pal, time) {
    const { ctx } = this;
    const p = seg.p1.screen;
    const R = p.w * 1.08;
    if (R < 3) return;
    const cx = p.x, cy = p.y - R * 0.98;
    const T = R * 0.2;
    ctx.lineWidth = T * 1.35;
    ctx.strokeStyle = pal.css.wallA;
    ctx.beginPath(); ctx.ellipse(cx, cy, R * 0.94, R, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = T;
    ctx.strokeStyle = pal.css.roadA;
    ctx.stroke();
    ctx.lineWidth = Math.max(1, T * 0.1);
    ctx.strokeStyle = pal.css.lane;
    ctx.setLineDash([T * 0.8, T * 0.8]);
    ctx.lineDashOffset = -time * T * 4;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = Math.max(1, T * 0.12);
    ctx.strokeStyle = '#141414';
    ctx.beginPath(); ctx.ellipse(cx, cy, R * 0.94 + T * 0.68, R + T * 0.68, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy, R * 0.94 - T * 0.68, R - T * 0.68, 0, 0, Math.PI * 2); ctx.stroke();
    if (pal.night > 0.3) this.glow(cx, cy - R, R * 0.6, `rgba(255,204,0,${0.35 * pal.night})`);
  }

  // ---- player ----------------------------------------------------------------

  headlights(night) {
    const { ctx, W } = this;
    const gy = this.groundY;
    const carW = (CAR_W * this.Sx) / CAMERA_H;
    const top = this.horizon + this.Sy * 0.12;
    const g = ctx.createLinearGradient(0, gy, 0, top);
    g.addColorStop(0, `rgba(255,230,170,${0.32 * night})`);
    g.addColorStop(1, 'rgba(255,230,170,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(W / 2 - carW * 0.35, gy - carW * 0.2);
    ctx.lineTo(W / 2 + carW * 0.35, gy - carW * 0.2);
    ctx.lineTo(W / 2 + carW * 1.9, top);
    ctx.lineTo(W / 2 - carW * 1.9, top);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  car(view) {
    const { ctx } = this;
    const { player, time } = view;
    const img = this.sprites.get(`car${player.car}`, view.amb);
    const dw = (CAR_W * this.Sx) / CAMERA_H;
    const dh = dw * (img.height / img.width);
    const altPx = (player.alt * this.Sy) / CAMERA_H;
    let x = this.W / 2;
    let y = this.groundY;

    // Blink while invulnerable (a steady half-alpha with reduced motion).
    let alpha = 1;
    if (player.invul > 0 && player.fall <= 0) alpha = this.reducedMotion ? 0.55 : Math.floor(time * 12) % 2 ? 0.25 : 1;

    let scale = 1, rot = player.tilt;
    if (player.fall > 0) {
      const k = 1 - player.fall / 0.8;
      scale = 1 - k * 0.6;
      y += k * dh * 0.6;
      alpha = 1 - k * 0.7;
    }
    if (player.crash > 0 && !this.reducedMotion) rot += Math.sin(player.crash * 28) * 0.22 * player.crash;
    if (!player.airborne && player.fall <= 0 && !this.reducedMotion) y += Math.sin(time * 38) * (player.speed / 14000) * dw * 0.006;

    if (player.fall <= 0) this.shadow(x, y + dh * 0.02, dw * 0.52, player.alt);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y - altPx);
    ctx.rotate(rot);
    ctx.scale(scale, scale);

    if (player.boosting) {
      // Exhaust flames.
      const f = 0.7 + (this.reducedMotion ? 0.2 : Math.random() * 0.5);
      for (const ex of [-0.14, 0.14]) {
        ctx.fillStyle = '#6C8CFF';
        ctx.beginPath();
        ctx.moveTo(dw * ex - dw * 0.05, -dh * 0.12);
        ctx.lineTo(dw * ex + dw * 0.05, -dh * 0.12);
        ctx.lineTo(dw * ex, dh * 0.22 * f);
        ctx.fill();
        ctx.fillStyle = '#FFCC00';
        ctx.beginPath();
        ctx.moveTo(dw * ex - dw * 0.025, -dh * 0.1);
        ctx.lineTo(dw * ex + dw * 0.025, -dh * 0.1);
        ctx.lineTo(dw * ex, dh * 0.12 * f);
        ctx.fill();
      }
    }
    ctx.drawImage(img, -dw / 2, -dh, dw, dh);
    ctx.restore();

    if (view.pal.night > 0.3 && alpha > 0.3) {
      this.glow(x - dw * 0.3, y - altPx - dh * 0.42, dw * 0.35, `rgba(255,40,40,${0.6 * view.pal.night})`);
      this.glow(x + dw * 0.3, y - altPx - dh * 0.42, dw * 0.35, `rgba(255,40,40,${0.6 * view.pal.night})`);
    }
    this.carBox = { x, y: y - altPx, w: dw, h: dh };
  }

  speedLines(amount, time, cx, cy) {
    const { ctx, W, H } = this;
    const count = this.reducedMotion ? 10 : 42;
    const maxR = Math.hypot(W, H) * 0.7;
    ctx.save();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + i * 0.37;
      const p = (time * (this.reducedMotion ? 0.4 : 1.6) + i * 0.618) % 1;
      const r1 = maxR * (0.18 + p * 0.8);
      const r2 = r1 + maxR * (0.05 + p * 0.25);
      ctx.globalAlpha = amount * p * 0.55;
      ctx.lineWidth = Math.max(1, this.ui * (1 + p * 4));
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 0.7);
      ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2 * 0.7);
      ctx.stroke();
    }
    ctx.restore();
  }

  // =========================================================================
  // Loop cinematic (side view): the car goes around a full loop by itself.
  // =========================================================================

  loopScene(t, pal, carImg, time, label) {
    const { ctx, W, H } = this;
    const groundY = H * 0.8;
    const R = Math.min(W * 0.26, H * 0.3);
    const T = R * 0.16;
    const cx = W / 2, cy = groundY - T / 2 - R;

    // Sky, sun and fast parallax hills.
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, pal.css.skyTop);
    sky.addColorStop(1, pal.css.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    const saved = this.horizon;
    this.horizon = groundY;
    this.ridge(this.hillsFar, pal.css.hillFar, H * 0.22, time * 0.08, groundY);
    this.ridge(this.hillsNear, pal.css.hillNear, H * 0.1, time * 0.25, groundY);
    this.horizon = saved;
    ctx.fillStyle = pal.css.grassA;
    ctx.fillRect(0, groundY, W, H - groundY);
    ctx.fillStyle = pal.css.grassB;
    const stripe = H * 0.04;
    for (let x = -((time * W * 1.2) % (stripe * 4)); x < W; x += stripe * 4) ctx.fillRect(x, groundY + T, stripe * 2, H);

    // Supports and track.
    ctx.strokeStyle = '#141414';
    ctx.lineWidth = T * 0.35;
    ctx.beginPath();
    ctx.moveTo(cx - R * 0.7, groundY); ctx.lineTo(cx - R * 0.3, cy);
    ctx.moveTo(cx + R * 0.7, groundY); ctx.lineTo(cx + R * 0.3, cy);
    ctx.stroke();
    const trackPath = () => {
      ctx.beginPath();
      ctx.moveTo(-10, groundY - T / 2);
      ctx.lineTo(W + 10, groundY - T / 2);
      ctx.moveTo(cx + R, cy);
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
    };
    trackPath();
    ctx.lineWidth = T * 1.5; ctx.strokeStyle = '#141414'; ctx.stroke();
    ctx.lineWidth = T * 1.25; ctx.strokeStyle = pal.css.wallA; ctx.stroke();
    ctx.lineWidth = T; ctx.strokeStyle = pal.css.roadA; ctx.stroke();
    ctx.setLineDash([T * 0.9, T * 0.9]);
    ctx.lineDashOffset = -time * T * 8;
    ctx.lineWidth = T * 0.14; ctx.strokeStyle = pal.css.lane; ctx.stroke();
    ctx.setLineDash([]);

    // Car position along the path: in from the left, around the loop, out to the right.
    const carW = R * 0.85;
    const carH = carW * (carImg.height / carImg.width);
    const inner = R - T / 2 - carH * 0.42;
    const pose = (u) => {
      if (u < 0.22) {
        const k = u / 0.22;
        return { x: lerp(-carW, cx, easeInOut(0, 1, k) * 0.35 + k * 0.65), y: groundY - T / 2 - carH * 0.42 - (T / 2), a: 0 };
      }
      if (u < 0.8) {
        const th = ((u - 0.22) / 0.58) * Math.PI * 2;
        return { x: cx + Math.sin(th) * inner, y: cy + Math.cos(th) * inner, a: -th };
      }
      const k = (u - 0.8) / 0.2;
      return { x: lerp(cx, W + carW, k), y: groundY - T - carH * 0.42, a: 0 };
    };

    const trail = this.reducedMotion ? 0 : 5;
    for (let i = trail; i >= 0; i--) {
      const q = pose(Math.max(0, t - i * 0.012));
      ctx.save();
      ctx.globalAlpha = i === 0 ? 1 : 0.12 * (trail - i + 1) / trail;
      ctx.translate(q.x, q.y);
      ctx.rotate(q.a);
      ctx.drawImage(carImg, -carW / 2, -carH / 2, carW, carH);
      ctx.restore();
    }

    if (!this.reducedMotion) {
      ctx.strokeStyle = 'rgba(255,255,255,.6)';
      ctx.lineWidth = Math.max(1, this.ui * 3);
      for (let i = 0; i < 14; i++) {
        const y = (i / 14) * H * 0.75 + ((i * 37) % 23);
        const len = W * (0.08 + ((i * 13) % 7) / 40);
        const x = W - (((time * W * 2.4) + i * 211) % (W + len));
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.stroke();
      }
    }

    // Big label with a pop.
    const pop = t < 0.3 ? easeInOut(0, 1, clamp((t - 0.05) / 0.2, 0, 1)) : 1;
    const size = Math.round(H * 0.14 * (this.reducedMotion ? 1 : 0.6 + 0.4 * pop));
    ctx.font = `italic 900 ${size}px "Big Shoulders Display", Impact, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = size * 0.12;
    ctx.strokeStyle = '#141414';
    ctx.globalAlpha = pop;
    ctx.strokeText(label, cx, H * 0.14);
    ctx.fillStyle = '#FFCC00';
    ctx.fillText(label, cx, H * 0.14);
    ctx.globalAlpha = 1;

    // Letterbox bars.
    const bar = H * 0.06;
    ctx.fillStyle = '#141414';
    ctx.fillRect(0, 0, W, bar * pop);
    ctx.fillRect(0, H - bar * pop, W, bar * pop);
  }
}
