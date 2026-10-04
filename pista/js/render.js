// Canvas 2D renderer for the pseudo-3D toy track.
//
// 1. Project every visible segment, near to far, accumulating the curve (x, dx) so the
//    road bends without any real 3D math. Banked curves tilt each edge up or down.
// 2. Paint far to near (painter's algorithm): each segment's floor band (planks, rug,
//    tiles or grass), table tops, the orange plastic track with its joints and rails,
//    holes, then the sprites standing on it. Hills and table edges hide what is behind
//    them for free, because nearer segments are painted on top.
// 3. Paint the player's car, the start booster, particles and speed effects on top.

import { CAR_W, RING_R } from './obstacles.js';
import { buildScene } from './scenes.js';
import { BANK_H, LANES, ROAD_W, SEG, TABLE_W, WALL_H } from './track.js';
import { clamp, easeIn, easeInOut, lerp, rgb, seeded, shade } from './util.js';

export const CAMERA_H = 1300;
export const FOV = 100;
export const DRAW_DISTANCE = 260;
const CAMERA_DEPTH = 1 / Math.tan(((FOV / 2) * Math.PI) / 180);
export const PLAYER_Z = CAMERA_H * CAMERA_DEPTH;
const RIVAL_W = 580;
const RAMP_H = 380;
const RAMP_LEN = 3;
const INK = '#141414';

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
        ctx.strokeStyle = INK;
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y);
      } else if (p.shape === 'streak') {
        // A spark: a short bright line along its velocity.
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, p.size * scale);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
        ctx.stroke();
      } else if (p.shape === 'puff') {
        // Smoke: a soft disc that grows while it fades.
        ctx.globalAlpha = k * (p.alpha ?? 0.5);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.size * scale * (1 + (p.age / p.life) * (p.grow ?? 2.5))), 0, Math.PI * 2);
        ctx.fill();
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
    this.scenes = new Map();

    const rnd = seeded(7);
    this.stars = Array.from({ length: 110 }, () => ({ x: rnd(), y: rnd() * 0.95, r: 0.6 + rnd() * 1.6, p: rnd() * 6.28 }));
    this.flies = Array.from({ length: 16 }, () => ({ x: rnd(), y: 0.55 + rnd() * 0.4, p: rnd() * 6.28, s: 0.5 + rnd() }));
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
    this.scenes.clear();
  }

  /** Room strips for this screen size, built on first use. */
  scene(amb) {
    if (!this.scenes.has(amb)) this.scenes.set(amb, buildScene(amb, this.W, this.horizon));
    return this.scenes.get(amb);
  }

  /** Background parallax follows the curves. */
  scroll(curve, speedRatio, dt) {
    const k = curve * speedRatio * dt;
    this.skyOffset += k * 0.0012;
    this.hillOffset += k * 0.0035;
  }

  project(p, camX, camY, camZ) {
    p.camera.x = p.world.x - camX;
    p.camera.y = p.world.y - camY;
    p.camera.z = p.world.z - camZ;
    const s = (p.screen.scale = CAMERA_DEPTH / p.camera.z);
    p.screen.x = this.W / 2 + s * p.camera.x * this.Sx;
    p.screen.y = this.horizon - s * p.camera.y * this.Sy;
    p.screen.w = s * ROAD_W * this.Sx;
    // Banking: the outer edge rises by |b| px; the inner edge stays on the floor, so a
    // banked road never dips under the next segment (see bankY).
    p.screen.b = s * BANK_H * p.bank * this.Sy;
  }

  // =========================================================================
  // World frame
  // =========================================================================

  /**
   * view: { track, position, player, rivals (Map segment → rivals), pal, amb, ambFrom,
   *         ambTo, ambK, time, shake, flash, flashColor, particles, speedLines (0..1),
   *         zoom (0..1 nitro punch), blur (0..1), launch, showPlayer }
   */
  frame(view) {
    const { ctx } = this;
    const { track, position, player, pal } = view;
    const W = this.W, H = this.H;

    const baseSeg = track.find(position);
    const basePercent = (position % SEG) / SEG;
    const playerSeg = track.find(position + PLAYER_Z);
    const playerPercent = ((position + PLAYER_Z) % SEG) / SEG;
    // Over a gap between tables the camera keeps the table height (the floor is lower).
    const playerY = playerSeg.baseY ?? lerp(playerSeg.p1.world.y, playerSeg.p2.world.y, playerPercent);
    view.playerY = playerY;
    view.playerSeg = playerSeg;
    view.playerBank = lerp(playerSeg.p1.bank, playerSeg.p2.bank, playerPercent);

    ctx.save();
    if (view.shake > 0) ctx.translate((Math.random() - 0.5) * view.shake * this.ui * 18, (Math.random() - 0.5) * view.shake * this.ui * 12);
    if (view.zoom > 0 && !this.reducedMotion) {
      // Toy zoom: the whole view punches in when the nitro fires.
      const z = 1 + 0.08 * easeIn(0, 1, view.zoom);
      ctx.translate(W / 2, this.horizon);
      ctx.scale(z, z);
      ctx.translate(-W / 2, -this.horizon);
    }

    this.background(pal, view, playerY);

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
    // Far plain segments thinner than ~3 px are merged into one piece.
    const pieces = [];
    for (let n = 0; n < list.length; n++) {
      const seg = list[n];
      if (!seg.visible) continue;
      const drawRoad = seg.p2.screen.y < seg.p1.screen.y;
      const near = seg.p1.screen.w > W * 0.03;
      const plain = !seg.hole && !seg.gap && !seg.face && !seg.start && !(seg.joint && near);
      const last = pieces[pieces.length - 1];
      if (drawRoad && plain && last && last.plain && last.drawRoad && last.table === seg.table && last.to === n - 1 && last.p1.y - seg.p2.screen.y < 3) {
        last.p2 = seg.p2.screen;
        last.to = n;
        last.fog = seg.fog;
        continue;
      }
      pieces.push({
        from: n, to: n, index: seg.index, p1: seg.p1.screen, p2: seg.p2.screen, band: seg.band, gap: seg.gap, face: seg.face,
        table: seg.table, joint: seg.joint, hole: seg.hole, start: seg.start, fog: seg.fog, plain, drawRoad,
      });
    }
    for (let i = pieces.length - 1; i >= 0; i--) {
      const piece = pieces[i];
      if (piece.drawRoad) this.segment(piece, pal);
      for (let n = piece.to; n >= piece.from; n--) this.segmentSprites(list[n], view, list, n);
    }

    if (pal.night > 0.5 && view.showPlayer) this.headlights(pal.night);
    if (view.showPlayer) this.car(view);
    if (view.launch) this.booster(view.launch);
    view.particles.draw(ctx, this.ui);
    if (view.speedLines > 0) this.speedLines(view.speedLines, view.time, this.W / 2, this.horizon);
    ctx.restore();

    if (view.blur > 0.02 && !this.reducedMotion) this.zoomBlur(view.blur);

    if (view.flash > 0) {
      ctx.fillStyle = view.flashColor || '#FFFFFF';
      ctx.globalAlpha = clamp(view.flash, 0, 1) * (this.reducedMotion ? 0.25 : 0.6);
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  /** Radial "zoom" smear towards the horizon while the nitro burns. */
  zoomBlur(amount) {
    const { ctx, canvas, W, H } = this;
    const cx = W / 2, cy = this.horizon;
    for (const [k, a] of [[1.035, 0.28], [1.075, 0.16]]) {
      ctx.globalAlpha = a * amount;
      ctx.drawImage(canvas, cx - cx * k, cy - cy * k, W * k, H * k);
    }
    ctx.globalAlpha = 1;
  }

  // ---- background: the room around the track --------------------------------

  background(pal, view, playerY) {
    const { ctx, W, H } = this;
    const hz = this.horizon;
    const lift = clamp(playerY / (55 * SEG), -1, 1) * this.Sy * 0.05;
    const base = hz + lift + 2;
    const k = view.ambK ?? 1;
    const same = view.ambFrom === view.ambTo || k >= 1;
    // Indoor strips are opaque and already hold the wall; only the garden sky is live.
    if (same && this.scene(view.ambTo).opaque) {
      ctx.fillStyle = pal.css.skyTop;
      ctx.fillRect(0, 0, W, base - hz + 2);
    } else {
      const wall = ctx.createLinearGradient(0, 0, 0, hz);
      wall.addColorStop(0, pal.css.skyTop);
      wall.addColorStop(1, pal.css.skyBottom);
      ctx.fillStyle = wall;
      ctx.fillRect(0, 0, W, hz + 2);
    }
    ctx.fillStyle = pal.css.floorB;
    ctx.fillRect(0, hz, W, H - hz);

    const wrap = (v) => ((v % 1) + 1) % 1;
    if (pal.stars > 0.02) {
      ctx.fillStyle = '#FFFFFF';
      for (const s of this.stars) {
        const tw = this.reducedMotion ? 0.8 : 0.55 + 0.45 * Math.sin(view.time * 2 + s.p);
        ctx.globalAlpha = pal.stars * tw;
        ctx.fillRect(wrap(s.x - this.skyOffset * 0.5) * W, s.y * hz * 0.7, s.r * this.ui * 2, s.r * this.ui * 2);
      }
      ctx.globalAlpha = 1;
    }
    if (pal.sunR > 0.005) {
      // The moon over the garden.
      const r = pal.sunR * Math.min(W, H * 1.6);
      const sx = wrap(0.72 - this.skyOffset * 0.8) * (W + r * 4) - r * 2;
      const sy = hz * pal.sunY;
      this.glow(sx, sy, r * 3.2, rgb(pal.sun, 0.35));
      ctx.fillStyle = pal.css.sun;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = pal.css.skyTop;
      ctx.beginPath(); ctx.arc(sx + r * 0.45, sy - r * 0.25, r * 0.85, 0, Math.PI * 2); ctx.fill();
    }

    if (!same) this.roomLayers(view.ambFrom, 1, base);
    if (k > 0 || same) this.roomLayers(view.ambTo, same ? 1 : k, base);

    if (pal.night > 0.7) this.fireflies(view.time, hz, pal.night);
  }

  /**
   * The room's three parallax strips (wall, furniture, giant things in front), each
   * scrolled with the curves at its own speed and tiled across the screen.
   */
  roomLayers(amb, alpha, base, offset = this.hillOffset * 1.2, scaleY = 1) {
    const { ctx, W } = this;
    const scene = this.scene(amb);
    ctx.globalAlpha = alpha;
    for (const [img, speed] of [[scene.wall, 0.55], [scene.mid, 1], [scene.front, 1.8]]) {
      const w = img.width * scaleY, h = img.height * scaleY;
      for (let x = -((((offset * speed * W * 1.6) % w) + w) % w); x < W; x += w) ctx.drawImage(img, x, base - h, w, h);
    }
    ctx.globalAlpha = 1;
  }

  fireflies(time, hz, night) {
    const { ctx, W } = this;
    const a = this.reducedMotion ? 0.7 : 1;
    for (const f of this.flies) {
      const x = ((f.x + Math.sin(time * 0.3 * f.s + f.p) * 0.03 - this.skyOffset * 0.9) % 1 + 1) % 1 * W;
      const y = hz * (f.y + Math.sin(time * 0.8 * f.s + f.p * 2) * 0.03);
      const blink = this.reducedMotion ? 0.8 : 0.5 + 0.5 * Math.sin(time * 3 * f.s + f.p);
      ctx.fillStyle = `rgba(255,236,120,${(0.25 * blink * night * a).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x, y, this.ui * 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,248,190,${(0.9 * blink * night).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x, y, this.ui * 2.6, 0, Math.PI * 2); ctx.fill();
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
    const x1 = p1.x, y1 = p1.y, w1 = p1.w, b1 = p1.b;
    const x2 = p2.x, y2 = p2.y - 0.6, w2 = p2.w, b2 = p2.b;
    const band = piece.band;
    const near = w1 > W * 0.04;
    // Quad between road fractions fa..fb (-1 left edge … 1 right edge), banked.
    const Q = (fa, fb, ta = 0, tb = 1) => {
      const xa = lerp(x1, x2, ta), ya = lerp(y1, y2, ta), wa = lerp(w1, w2, ta), ba = lerp(b1, b2, ta);
      const xb = lerp(x1, x2, tb), yb = lerp(y1, y2, tb), wb = lerp(w1, w2, tb), bb = lerp(b1, b2, tb);
      return [xa + wa * fa, bankY(ya, ba, fa), xa + wa * fb, bankY(ya, ba, fb), xb + wb * fb, bankY(yb, bb, fb), xb + wb * fa, bankY(yb, bb, fa)];
    };
    // Flat quad on the floor (not banked).
    const F = (fa, fb) => [x1 + w1 * fa, y1, x1 + w1 * fb, y1, x2 + w2 * fb, y2, x2 + w2 * fa, y2];

    // ---- floor band ----
    const top = y2;
    ctx.fillStyle = piece.gap ? pal.css.floorDeep : band ? pal.css.floorA : pal.css.floorB;
    ctx.fillRect(0, top, W, y1 - top + 1);
    if (!piece.gap) this.floorPattern(piece, pal, F, near, x1, w1);

    if (piece.face) {
      // Front of the far table: the apron, the shadow underneath and two legs.
      const apron = 0.2;
      const lerpY = (t) => lerp(y2, y1, t);
      const edge = (t) => [x1 - w1 * TABLE_W, lerpY(t), x1 + w1 * TABLE_W, lerpY(t)];
      const [ax, ay, bx] = edge(apron);
      this.fillQuads('rgba(0,0,0,.45)', [ax, ay, bx, ay, x1 + w1 * TABLE_W, y1, x1 - w1 * TABLE_W, y1]);
      const leg = (f0, f1) => [x1 + w1 * f0, ay, x1 + w1 * f1, ay, x1 + w1 * f1, y1, x1 + w1 * f0, y1];
      this.fillQuads(rgb(shade(pal.wood, -0.25)), leg(-TABLE_W, -TABLE_W + 0.35), leg(TABLE_W - 0.35, TABLE_W));
      this.fillQuads(pal.css.wood, [x2 - w2 * TABLE_W, y2, x2 + w2 * TABLE_W, y2, bx, ay, ax, ay]);
      this.fillQuads(INK, [ax, ay - 1, bx, ay - 1, bx, ay + Math.max(1, w1 * 0.01), ax, ay + Math.max(1, w1 * 0.01)]);
    } else if (!piece.gap) {
      if (piece.table) {
        this.fillQuads(band ? pal.css.wood : rgb(shade(pal.wood, 0.06)), F(-TABLE_W, TABLE_W));
        if (near) {
          const e = 0.05;
          this.fillQuads(INK, F(-TABLE_W, -TABLE_W + e), F(TABLE_W - e, TABLE_W));
        }
      }
      const r1 = w1 * 0.09, r2 = w2 * 0.09;
      const h1 = WALL_H * p1.scale * this.Sy, h2 = WALL_H * p2.scale * this.Sy;
      const lx1 = x1 - w1, ly1 = bankY(y1, b1, -1), rx1 = x1 + w1, ry1 = bankY(y1, b1, 1);
      const lx2 = x2 - w2, ly2 = bankY(y2, b2, -1), rx2 = x2 + w2, ry2 = bankY(y2, b2, 1);

      // Outer faces of the rails (seen in curves), then the orange plastic track.
      if (near) {
        this.fillQuads(pal.css.wallOuter,
          [lx1 - r1, ly1, lx1 - r1, ly1 - h1, lx2 - r2, ly2 - h2, lx2 - r2, ly2],
          [rx1 + r1, ry1, rx1 + r1, ry1 - h1, rx2 + r2, ry2 - h2, rx2 + r2, ry2]);
      }
      this.fillQuads(band ? pal.css.roadA : pal.css.roadB, Q(-1, 1));

      // Molded grooves between the lanes.
      if ((band || w1 > W * 0.03) && w1 > W * 0.01) {
        const g = 0.022;
        const grooves = [];
        for (let lane = 1; lane < LANES; lane++) {
          const f = -1 + (2 * lane) / LANES;
          grooves.push(Q(f - g, f + g));
        }
        if (near) grooves.push(Q(-1, -1 + 0.03), Q(1 - 0.03, 1));
        this.fillQuads(pal.css.groove, ...grooves);
        // Yellow lane marks, painted every other band like dashes.
        if (band && w1 > W * 0.015) {
          const m = 0.03, marks = [];
          for (let lane = 1; lane < LANES; lane++) {
            const f = -1 + (2 * lane) / LANES;
            marks.push(Q(f - m, f + m, 0.1, 0.9));
          }
          this.fillQuads(pal.css.mark, ...marks);
        }
      }

      if (piece.joint && near) {
        // Joint between two plastic pieces: a seam across and the connector tab.
        this.fillQuads(pal.css.seam, Q(-1, 1, 0, 0.1), Q(-0.07, 0.07, 0, 0.45));
        this.fillQuads(pal.css.tab, Q(-0.05, 0.05, 0.08, 0.38));
      }

      if (piece.hole) {
        const { x1: a, x2: b } = piece.hole;
        this.fillQuads('#1A0E06', Q(a, b));
        this.fillQuads(INK, Q(a - 0.025, a), Q(b, b + 0.025));
      }

      if (piece.start) {
        const cols = 10, dark = [], light = [];
        for (let c = 0; c < cols; c++) for (let r = 0; r < 2; r++) {
          const fa = -1 + (2 * c) / cols, fb = -1 + (2 * (c + 1)) / cols;
          ((c + r) % 2 ? dark : light).push(Q(fa, fb, r / 2, (r + 1) / 2));
        }
        this.fillQuads(INK, ...dark);
        this.fillQuads('#FFFFFF', ...light);
      }

      // Inner faces of the rails and their rounded tops.
      this.fillQuads(band ? pal.css.wallA : pal.css.wallB,
        [lx1, ly1, lx1, ly1 - h1, lx2, ly2 - h2, lx2, ly2],
        [rx1, ry1, rx1, ry1 - h1, rx2, ry2 - h2, rx2, ry2]);
      this.fillQuads(pal.css.wallTop,
        [lx1, ly1 - h1, lx2, ly2 - h2, lx2 - r2, ly2 - h2, lx1 - r1, ly1 - h1],
        [rx1, ry1 - h1, rx2, ry2 - h2, rx2 + r2, ry2 - h2, rx1 + r1, ry1 - h1]);
      if (piece.joint && near) {
        const s = Math.max(1, w1 * 0.012);
        this.fillQuads(pal.css.wallOuter,
          [lx1, ly1, lx1 + s, ly1, lx1 + s, ly1 - h1, lx1, ly1 - h1],
          [rx1 - s, ry1, rx1, ry1, rx1, ry1 - h1, rx1 - s, ry1 - h1]);
      }
    }

    if (piece.fog > 0.01) {
      const up = WALL_H * p2.scale * this.Sy + Math.abs(b2);
      ctx.globalAlpha = piece.fog;
      ctx.fillStyle = pal.css.fog;
      ctx.fillRect(0, y2 - up, W, y1 - y2 + up + 1);
      ctx.globalAlpha = 1;
    }
  }

  /** Planks, a rug, kitchen tiles or a garden path under the track. */
  floorPattern(piece, pal, F, near, x1, w1) {
    const { W } = this;
    if (w1 < W * 0.03) return;
    // Every extra fill per segment costs frames on phones: seams, tiles and the rug
    // border are only drawn close to the camera, where they can be seen.
    const close = w1 > W * 0.12;
    const rugW = pal.rugW;
    // Visible range of floor columns (in road half-widths).
    const fMin = Math.max(-30, (0 - x1) / w1), fMax = Math.min(30, (W - x1) / w1);
    if (pal.floor === 'planks' && close) {
      const seams = [], s = 0.014, step = 1.1;
      for (let f = Math.ceil(fMin / step) * step; f < fMax; f += step) if (Math.abs(f) > rugW) seams.push(F(f - s, f + s));
      if (seams.length) this.fillQuads(pal.css.floorLine, ...seams);
    } else if (pal.floor === 'tiles' && w1 > W * 0.07) {
      const row = Math.floor(piece.index / 6) % 2, step = 0.8, dark = [];
      for (let c = Math.floor(fMin / step); c * step < fMax; c++) if (((c % 2) + 2 + row) % 2 === 0) dark.push(F(c * step, (c + 1) * step));
      if (dark.length) this.fillQuads(pal.css.floorLine, ...dark);
    }
    if (rugW > 0.05 && w1 > W * 0.06) {
      // Rug and its border side by side (not stacked), so no seam shows between segments.
      const edge = close ? 0.14 : 0;
      if (close) this.fillQuads(pal.css.rugEdge, F(-rugW, -rugW + edge), F(rugW - edge, rugW));
      this.fillQuads(pal.css.rug, F(-rugW + edge, rugW - edge));
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
    this.fillQuads(color, [ax, ay, bx, by, cx, cy, dx, dy]);
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
    const night = view.pal.night;

    // Pickups and obstacles already behind the car are not drawn (they would fill the screen).
    const behind = seg.p1.camera.z < PLAYER_Z * 0.85;
    for (const item of seg.items) {
      if (item.hit && !item.scenery && item.kind !== 'loop' && item.kind !== 'firering') continue;
      if (behind && (!item.scenery || item.kind === 'door')) continue;
      const sx = p1.x + p1.scale * item.x * ROAD_W * this.Sx;
      // On the track, a banked road lifts or lowers the item; the floor next to it stays flat.
      const sy = Math.abs(item.x) <= 1 ? bankY(p1.y, p1.b, item.x) : p1.y;
      switch (item.kind) {
        case 'rivalSpawn':
          break;
        case 'coin':
        case 'air': {
          const spin = this.reducedMotion ? 1 : Math.abs(Math.cos(time * 4 + item.phase)) * 0.8 + 0.2;
          const alt = (item.alt || 130) + (this.reducedMotion ? 0 : Math.sin(time * 5 + item.phase) * 25);
          this.sprite(this.sprites.get('coin', amb), item.w, sx, sy, p1.scale, alt, spin, night > 0.4 ? '#FFD84A' : null);
          break;
        }
        case 'nitro': {
          const alt = 170 + (this.reducedMotion ? 0 : Math.sin(time * 4 + item.phase) * 50);
          this.sprite(this.sprites.get('nitro', amb), item.w, sx, sy, p1.scale, alt, 1, '#6C8CFF');
          break;
        }
        case 'oil':
          this.oil(sx, sy, seg, item);
          break;
        case 'ramp':
          this.ramp(item, seg, list, n);
          break;
        case 'loop':
          this.loopRing(seg, view.pal, time);
          break;
        case 'firering':
          ctx.globalAlpha = 1;
          this.fireRing(sx, sy, p1.scale, item, time);
          ctx.globalAlpha = alpha;
          break;
        case 'door':
          this.door(seg, view.pal);
          ctx.globalAlpha = alpha;
          break;
        default: {
          const img = this.sprites.get(item.kind, amb);
          this.sprite(img, item.w, sx, sy, p1.scale, 0, 1);
          if (item.kind === 'lamp' && night > 0.3) {
            const dw = item.w * p1.scale * this.Sx;
            this.glow(sx, sy - dw * (img.height / img.width) * 0.8, dw * 1.8, 'rgba(255,236,160,.55)', night);
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
        const y = bankY(lerp(p1.y, p2.y, t), lerp(p1.b, p2.b, t), r.x);
        this.shadow(x, y, RIVAL_W * scale * this.Sx * 0.52, 0);
        this.sprite(this.sprites.get(`rival${r.style}`, amb), RIVAL_W, x, y, scale, 0, 1);
        if (night > 0.5) {
          const dw = RIVAL_W * scale * this.Sx;
          this.glow(x - dw * 0.3, y - dw * 0.3, dw * 0.45, 'rgba(255,40,40,.7)', night);
          this.glow(x + dw * 0.3, y - dw * 0.3, dw * 0.45, 'rgba(255,40,40,.7)', night);
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
    ctx.drawImage(this.glowImage(color), x - radius, y - radius, radius * 2, radius * 2);
    ctx.globalCompositeOperation = prev;
    ctx.globalAlpha = prevA;
  }

  /** A soft radial light baked once per color (a new gradient every frame is slow). */
  glowImage(color) {
    this.glows ??= new Map();
    let img = this.glows.get(color);
    if (!img) {
      if (this.glows.size > 48) this.glows.clear();
      img = document.createElement('canvas');
      img.width = img.height = 64;
      const g = img.getContext('2d');
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      this.glows.set(color, img);
    }
    return img;
  }

  /** A soft shadow: a wide light ellipse and a darker core (smaller when airborne). */
  shadow(x, y, halfW, alt) {
    const { ctx } = this;
    const k = clamp(1 - alt / 1600, 0.35, 1);
    ctx.fillStyle = `rgba(0,0,0,${(0.2 * k).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(x, y, halfW * k * 1.12, Math.max(1, halfW * 0.2 * k), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(0,0,0,${(0.28 * k).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(x, y, halfW * k * 0.86, Math.max(1, halfW * 0.12 * k), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  oil(sx, sy, seg, item) {
    const { ctx } = this;
    const p1 = seg.p1.screen, p2 = seg.p2.screen;
    const rx = (item.w / 2) * p1.scale * this.Sx;
    const ry = Math.max(1, (p1.y - p2.y) * 2.4);
    const cy = sy - ry * 0.6;
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

  /** Jump ramp: a yellow plastic wedge rising over RAMP_LEN segments with red chevrons. */
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
    this.quad(blx, a.y, tlx, ty, tlx, b.y, blx, a.y, '#B38F00');
    this.quad(brx, a.y, trx, ty, trx, b.y, brx, a.y, '#B38F00');
    this.quad(blx, a.y, brx, a.y, trx, ty, tlx, ty, '#FFCC00');
    for (const [t0, t1] of [[0.18, 0.32], [0.5, 0.64], [0.82, 0.94]]) {
      const ly0 = lerp(a.y, ty, t0), ly1 = lerp(a.y, ty, t1);
      this.quad(lerp(blx, tlx, t0), ly0, lerp(brx, trx, t0), ly0, lerp(brx, trx, t1), ly1, lerp(blx, tlx, t1), ly1, '#DD0200');
    }
    const { ctx } = this;
    ctx.strokeStyle = INK;
    ctx.lineWidth = lw * 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(blx, a.y); ctx.lineTo(brx, a.y); ctx.lineTo(trx, ty); ctx.lineTo(tlx, ty); ctx.closePath();
    ctx.stroke();
  }

  /** The loop seen from behind: a giant orange plastic ring standing on the track. */
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
    ctx.lineWidth = Math.max(1, T * 0.08);
    ctx.strokeStyle = pal.css.groove;
    ctx.setLineDash([T * 0.8, T * 0.8]);
    ctx.lineDashOffset = -time * T * 4;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = Math.max(1, T * 0.12);
    ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.ellipse(cx, cy, R * 0.94 + T * 0.68, R + T * 0.68, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy, R * 0.94 - T * 0.68, R - T * 0.68, 0, 0, Math.PI * 2); ctx.stroke();
    if (pal.night > 0.3) this.glow(cx, cy - R, R * 0.6, 'rgba(255,204,0,.35)', pal.night);
  }

  /** Ring of fire over the gap between two tables: fly through the middle. */
  fireRing(sx, sy, scale, item, time) {
    const { ctx } = this;
    const r = RING_R * scale * this.Sx;
    if (r < 2) return;
    const cx = sx, cy = sy - item.alt * scale * this.Sy;
    const T = r * 0.13;
    const still = this.reducedMotion;
    this.glow(cx, cy, r * 1.7, 'rgba(255,140,0,.45)');
    // Flames: outer orange tongues, then inner yellow ones.
    const N = 22;
    for (const [color, len, width] of [['#FF6A00', 0.55, 0.2], ['#FFD23F', 0.32, 0.12]]) {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const flick = still ? 0.8 : 0.65 + 0.35 * Math.sin(time * 14 + i * 1.9) * Math.sin(time * 9 + i * 0.7);
        const l = r * len * flick + T;
        const ca = Math.cos(a), sa = Math.sin(a);
        const w = width;
        ctx.moveTo(cx + Math.cos(a - w) * r, cy + Math.sin(a - w) * r);
        ctx.quadraticCurveTo(cx + ca * (r + l * 0.6), cy + sa * (r + l * 0.6) - l * 0.25, cx + ca * (r + l), cy + sa * (r + l) - l * 0.35);
        ctx.quadraticCurveTo(cx + ca * (r + l * 0.4), cy + sa * (r + l * 0.4), cx + Math.cos(a + w) * r, cy + Math.sin(a + w) * r);
        ctx.closePath();
      }
      ctx.fill();
    }
    // The metal hoop.
    ctx.lineWidth = T;
    ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = T * 0.55;
    ctx.strokeStyle = '#8A8F99';
    ctx.stroke();
    // Stand under the ring.
    ctx.fillStyle = INK;
    ctx.fillRect(cx - T * 0.35, cy + r, T * 0.7, Math.max(0, sy - cy - r));
  }

  /** The doorway into the next room: the wall around it fades in as the car gets close. */
  door(seg, pal) {
    const { ctx, W } = this;
    const p = seg.p1.screen;
    const a = clamp(1.25 - seg.fog * 2.2, 0, 1);
    if (a <= 0 || p.w < 1) return;
    const ow = p.w * 2.1, oh = p.w * 2.6;
    const top = Math.max(-2, p.y - oh);
    ctx.globalAlpha = a;
    ctx.fillStyle = pal.css.skyBottom;
    ctx.beginPath();
    ctx.rect(0, -2, W, p.y + 2);
    ctx.rect(p.x - ow, top, ow * 2, p.y - top);
    ctx.fill('evenodd');
    // Frame and baseboard.
    const t = p.w * 0.14;
    ctx.fillStyle = pal.css.trim;
    ctx.fillRect(p.x - ow - t, p.y - oh - t, t, oh + t);
    ctx.fillRect(p.x + ow, p.y - oh - t, t, oh + t);
    ctx.fillRect(p.x - ow - t, p.y - oh - t, ow * 2 + t * 2, t);
    ctx.fillRect(0, p.y - t * 0.7, p.x - ow - t, t * 0.7);
    ctx.fillRect(p.x + ow + t, p.y - t * 0.7, W, t * 0.7);
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1, t * 0.12);
    ctx.strokeRect(p.x - ow - t, p.y - oh - t, ow * 2 + t * 2, oh + t);
    ctx.strokeRect(p.x - ow, p.y - oh, ow * 2, oh);
    ctx.globalAlpha = 1;
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
    let dw = (CAR_W * this.Sx) / CAMERA_H;
    const dh0 = dw * (img.height / img.width);
    const altPx = (player.alt * this.Sy) / CAMERA_H;
    let x = this.W / 2;
    let y = this.groundY;

    // Banked road: the car sits higher or lower with the road and leans with it.
    const bankPx = (BANK_H * (view.playerBank || 0) * this.Sy) / CAMERA_H;
    const halfRoad = (ROAD_W * this.Sx) / CAMERA_H;
    if (!player.airborne) y = bankY(y, bankPx, player.x);
    let rot = player.tilt + (player.airborne ? 0 : Math.atan2(bankPx / 2, halfRoad));

    // Pulled back against the booster spring before the start.
    const pull = view.launch ? view.launch.pull || 0 : 0;
    if (pull > 0) { y += pull * dh0 * 0.1; dw *= 1 + pull * 0.05; }
    const dh = dw * (img.height / img.width);

    // Blink while invulnerable (a steady half-alpha with reduced motion).
    let alpha = 1;
    if (player.invul > 0 && player.fall <= 0) alpha = this.reducedMotion ? 0.55 : Math.floor(time * 12) % 2 ? 0.25 : 1;

    let scale = 1;
    if (player.fall > 0) {
      const k = 1 - player.fall / 0.8;
      scale = 1 - k * 0.6;
      y += k * dh * 0.6;
      alpha = 1 - k * 0.7;
    }
    if (player.crash > 0 && !this.reducedMotion) rot += Math.sin(player.crash * 28) * 0.22 * player.crash;
    // Plastic wheels rattle a little on the track.
    if (!player.airborne && player.fall <= 0 && !this.reducedMotion) y += Math.sin(time * 38) * (player.speed / 14000) * dw * 0.008;

    if (player.fall <= 0) this.shadow(x, y + dh * 0.02, dw * 0.52, player.alt);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y - altPx);
    ctx.rotate(rot);
    ctx.scale(scale, scale);

    if (player.boosting && !this.reducedMotion) {
      // Turbo trail: fading copies of the car stretched towards the camera.
      for (let i = 3; i >= 1; i--) {
        const k = i / 3;
        ctx.globalAlpha = alpha * (0.32 - k * 0.08) * (0.6 + 0.4 * Math.min(1, player.nitro));
        ctx.drawImage(img, -dw * (1 + k * 0.16) / 2, -dh * (1 - k * 0.42), dw * (1 + k * 0.16), dh * (1 + k * 0.1));
      }
      ctx.globalAlpha = alpha;
    }
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
    if (img.tires && player.fall <= 0) this.spinTires(img, dw, dh, view.position);
    ctx.restore();

    if (view.pal.night > 0.5 && alpha > 0.3) {
      this.glow(x - dw * 0.3, y - altPx - dh * 0.42, dw * 0.35, 'rgba(255,40,40,.6)', view.pal.night);
      this.glow(x + dw * 0.3, y - altPx - dh * 0.42, dw * 0.35, 'rgba(255,40,40,.6)', view.pal.night);
    }
    this.carBox = { x, y: y - altPx, w: dw, h: dh };
  }

  /** Tread bars rolling over each tire, so the wheels spin with the speed. */
  spinTires(img, dw, dh, position) {
    const { ctx } = this;
    const kx = dw / img.width, ky = dh / img.height;
    const phase = this.reducedMotion ? 0 : (position * 0.0022) % 1;
    ctx.fillStyle = '#1E1E22';
    ctx.beginPath();
    for (const [tx, ty, tw, th] of img.tires) ctx.rect(-dw / 2 + tx * kx, -dh + ty * ky, tw * kx, th * ky);
    ctx.fill();
    ctx.fillStyle = '#3C3C44';
    ctx.beginPath();
    for (const [tx, ty, tw, th] of img.tires) {
      const x = -dw / 2 + tx * kx, y = -dh + ty * ky, w = tw * kx, h = th * ky;
      const step = Math.max(3, h / 4.5), bar = step * 0.38;
      for (let yy = y + h - ((phase * step) % step) - bar; yy > y - bar; yy -= step) {
        const top = Math.max(y, yy), bottom = Math.min(y + h, yy + bar);
        if (bottom > top) ctx.rect(x, top, w, bottom - top);
      }
    }
    ctx.fill();
  }

  /**
   * The start booster behind the car: a toy launcher with a spring and a plunger.
   * launch: { pull: 0…1 while arming } or { fired: seconds since the release }.
   */
  booster(launch) {
    const { ctx, H } = this;
    const c = this.carBox;
    if (!c) return;
    const fired = launch.fired ?? -1;
    if (fired > 0.7) return;
    const away = fired >= 0 ? easeIn(0, 1, fired / 0.7) : 0;
    const w = c.w, h = c.h;
    const lw = Math.max(1.5, w * 0.012);
    const cx = c.x;
    const housingTop = c.y + h * 0.34 + away * (H * 0.6);
    ctx.save();
    ctx.globalAlpha = 1 - away * 0.8;
    ctx.lineJoin = 'round';

    // Spring from the housing to the plunger pad under the car's rear bumper.
    const padY = fired >= 0 ? c.y - h * 0.08 - Math.min(1, fired / 0.12) * h * 0.1 : c.y - h * 0.08;
    const coils = 7;
    const len = housingTop - padY;
    if (len > 4) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = lw * 3;
      ctx.beginPath();
      for (let i = 0; i <= coils * 2; i++) {
        const px = cx + (i % 2 ? w * 0.14 : -w * 0.14);
        const py = padY + (len * i) / (coils * 2);
        if (i === 0) ctx.moveTo(cx, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.strokeStyle = '#C9CED6';
      ctx.lineWidth = lw * 1.6;
      ctx.stroke();
    }
    roundRectPath(ctx, cx - w * 0.2, padY - h * 0.08, w * 0.4, h * 0.14, h * 0.04);
    ctx.fillStyle = '#DD0200'; ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke();

    // Housing (closer to the camera, so wider at the bottom), with chevrons.
    const hy = housingTop, hh = h * 0.9;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.5, hy); ctx.lineTo(cx + w * 0.5, hy);
    ctx.lineTo(cx + w * 0.72, hy + hh); ctx.lineTo(cx - w * 0.72, hy + hh); ctx.closePath();
    ctx.fillStyle = '#FFCC00'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = lw * 1.4; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.5, hy); ctx.lineTo(cx + w * 0.5, hy);
    ctx.lineTo(cx + w * 0.54, hy + hh * 0.16); ctx.lineTo(cx - w * 0.54, hy + hh * 0.16); ctx.closePath();
    ctx.fillStyle = '#1F4BFF'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#DD0200';
    for (let i = 0; i < 3; i++) {
      const yy = hy + hh * (0.3 + i * 0.2);
      const ww = w * (0.12 + i * 0.02);
      ctx.beginPath(); ctx.moveTo(cx - ww, yy + hh * 0.12); ctx.lineTo(cx, yy); ctx.lineTo(cx + ww, yy + hh * 0.12);
      ctx.lineTo(cx + ww, yy + hh * 0.18); ctx.lineTo(cx, yy + hh * 0.06); ctx.lineTo(cx - ww, yy + hh * 0.18); ctx.closePath();
      ctx.fill();
    }
    // Release lever.
    ctx.fillStyle = INK;
    ctx.fillRect(cx + w * 0.52, hy - h * (fired >= 0 ? 0.05 : 0.3), lw * 2.5, h * (fired >= 0 ? 0.08 : 0.33));
    ctx.beginPath(); ctx.arc(cx + w * 0.52 + lw * 1.25, hy - h * (fired >= 0 ? 0.05 : 0.3), h * 0.07, 0, Math.PI * 2);
    ctx.fillStyle = '#DD0200'; ctx.fill(); ctx.stroke();
    ctx.restore();
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

  loopScene(t, pal, carImg, time, label, amb) {
    const { ctx, W, H } = this;
    const groundY = H * 0.8;
    const R = Math.min(W * 0.26, H * 0.3);
    const T = R * 0.16;
    const cx = W / 2, cy = groundY - T / 2 - R;

    // The room, seen from the side, scrolling fast.
    const wall = ctx.createLinearGradient(0, 0, 0, groundY);
    wall.addColorStop(0, pal.css.skyTop);
    wall.addColorStop(1, pal.css.skyBottom);
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, W, H);
    this.roomLayers(amb, 1, groundY, time * 0.2, groundY / this.horizon * 0.8);
    ctx.fillStyle = pal.css.floorA;
    ctx.fillRect(0, groundY, W, H - groundY);
    ctx.fillStyle = pal.css.floorB;
    const stripe = H * 0.04;
    for (let x = -((time * W * 1.2) % (stripe * 4)); x < W; x += stripe * 4) ctx.fillRect(x, groundY + T, stripe * 2, H);

    // Supports and track.
    ctx.strokeStyle = INK;
    ctx.lineWidth = T * 0.35;
    ctx.beginPath();
    ctx.moveTo(cx - R * 0.7, groundY); ctx.lineTo(cx - R * 0.3, cy);
    ctx.moveTo(cx + R * 0.7, groundY); ctx.lineTo(cx + R * 0.3, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-10, groundY - T / 2);
    ctx.lineTo(W + 10, groundY - T / 2);
    ctx.moveTo(cx + R, cy);
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.lineWidth = T * 1.5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.lineWidth = T * 1.25; ctx.strokeStyle = pal.css.wallA; ctx.stroke();
    ctx.lineWidth = T; ctx.strokeStyle = pal.css.roadA; ctx.stroke();
    ctx.setLineDash([T * 0.12, T * 2.2]);
    ctx.lineDashOffset = -time * T * 8;
    ctx.lineWidth = T; ctx.strokeStyle = pal.css.seam; ctx.stroke();
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
    ctx.strokeStyle = INK;
    ctx.globalAlpha = pop;
    ctx.strokeText(label, cx, H * 0.14);
    ctx.fillStyle = '#FFCC00';
    ctx.fillText(label, cx, H * 0.14);
    ctx.globalAlpha = 1;

    // Letterbox bars.
    const bar = H * 0.06;
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, bar * pop);
    ctx.fillRect(0, H - bar * pop, W, bar * pop);
  }
}

/** Screen y at road fraction f (-1 left … 1 right) of a road edge banked by b px. */
function bankY(y, b, f) {
  return y + (b * f - Math.abs(b)) / 2;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
