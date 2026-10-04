// TURBO PISTA — game states and glue between the modules.
//
//   menu ──Arrancar──▶ countdown ──3·2·1·¡YA! (booster)──▶ play ◀──▶ paused
//     ▲                                          │
//     └──────────── Cambiar auto ◀── over ◀──────┘ (3 lives lost)
//
// In the menu the same world runs behind the panel with an autopilot (attract mode).

import { Sound } from './audio.js';
import { PLAYER_CARS, renderCarSide } from './cars.js';
import { Loop } from './engine.js';
import { t } from './i18n.js';
import { Input } from './input.js';
import { Obstacles } from './obstacles.js';
import { AMBIENTS, ambientIndexForLevel, blendAmbients } from './palette.js';
import { NITRO_TIME, Player } from './player.js';
import { DRAW_DISTANCE, PLAYER_Z, Particles, Renderer } from './render.js';
import { SpriteBank } from './sprites.js';
import { UI } from './ui.js';
import { load, save } from './storage.js';
import { LANE_X, LEVEL_LEN, PIECE, SEG, Track, difficulty, levelAt } from './track.js';
import { clamp, easeInOut, formatInt } from './util.js';

const LOOP_TIME = 2.6;          // seconds of loop cinematic
const COUNTDOWN_STEP = 0.8;
const KMH = 180 / 10000;        // 10 000 world units per second = 180 km/h
const params = new URLSearchParams(location.search);
const DEBUG_FPS = params.has('fps');
const AUTOPILOT = params.has('autopilot');   // dev flag: the AI also drives during a run
const START_LEVEL = Math.max(1, Number(params.get('level')) || 1); // dev flag: start at level N

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const canvas = document.getElementById('screen');
const saved = load();

const ui = new UI();
const sound = new Sound(saved.muted);
const sprites = new SpriteBank();
const renderer = new Renderer(canvas, sprites, reducedMotion.matches);
const obstacles = new Obstacles();
const track = new Track(obstacles.populate);
const player = new Player();
const particles = new Particles();
const sideCars = PLAYER_CARS.map((spec) => renderCarSide(spec, 520));

const S = {
  mode: 'menu',
  pausedFrom: null,
  position: 0,
  time: 0,
  distance: 0,
  coins: 0,
  bonus: 0,
  level: 1,
  ambFrom: 0, ambTo: 0, ambT: 1,
  shake: 0, flash: 0, flashColor: '#FFFFFF',
  countdown: 0, countStep: null,
  loop: null,
  overTimer: 0,
  fallPending: false,
  aiLane: 1, aiTimer: 0,
  launch: null,           // start booster: { pull } while arming, { fired } after the release
  zoom: 0,                // nitro "toy zoom" punch, 1 → 0
  lastPiece: 0, clackTimer: 0,
  best: saved.best,
};

// ---------------------------------------------------------------------------
// Runs and states
// ---------------------------------------------------------------------------

function newRun(menu) {
  const level = menu ? 1 : START_LEVEL;
  const startIndex = (level - 1) * LEVEL_LEN;
  track.reset(menu, startIndex);
  obstacles.reset();
  particles.clear();
  player.reset(ui.selectedCar());
  Object.assign(S, {
    position: startIndex * SEG, distance: 0, coins: 0, bonus: 0, level,
    ambFrom: ambientIndexForLevel(level), ambTo: ambientIndexForLevel(level), ambT: 1, shake: 0, flash: 0,
    loop: null, overTimer: 0, fallPending: false, aiLane: 1, aiTimer: 0, launch: null, zoom: 0,
    lastPiece: Math.floor((startIndex * SEG + PLAYER_Z) / (SEG * PIECE)), clackTimer: 0,
  });
  S.startIndex = startIndex;
  track.ensure(startIndex + DRAW_DISTANCE + 20);
  ui.resetHud();
}

function setMode(mode) {
  S.mode = mode;
  ui.setMode(mode);
  input.enabled = mode === 'play';
  if (mode !== 'play') input.releaseAll();
}

function goMenu() {
  newRun(true);
  setMode('menu');
  ui.show('start');
  ui.setBest(S.best);
  ui.countdown(null);
  sound.setScrape(false);
  sound.stopEngine();
}

function startRace() {
  sound.unlock();
  sound.click();
  save({ car: ui.selectedCar() });
  newRun(false);
  ui.show(null);
  setMode('countdown');
  S.countdown = 0;
  S.countStep = null;
  S.launch = { pull: 0 };
  document.activeElement?.blur?.();
  sound.startEngine();
}

function pause() {
  if (S.mode !== 'play' && S.mode !== 'countdown') return;
  S.pausedFrom = S.mode;
  setMode('paused');
  ui.show('pause');
  sound.setScrape(false);
  sound.suspend();
}

function resume() {
  if (S.mode !== 'paused') return;
  sound.resume();
  setMode(S.pausedFrom || 'play');
  ui.show(null);
  document.activeElement?.blur?.();
  loop.last = performance.now();
}

function gameOver() {
  const score = scoreNow();
  const record = score > S.best;
  if (record) S.best = score;
  save({ best: S.best, bestDistance: Math.max(saved.bestDistance || 0, Math.floor(S.distance)) });
  setMode('over');
  sound.setScrape(false);
  sound.stopEngine();
  sound.gameOver();
  ui.gameOver({ score, distance: S.distance, coins: S.coins, level: S.level, best: S.best, record });
  S.lastScore = score;
}

const scoreNow = () => Math.floor(S.distance) + S.bonus;

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

function update(dt) {
  if (S.mode === 'paused') return;
  S.time += dt;
  particles.update(dt);
  S.ambT = Math.min(1, S.ambT + dt / 3);
  S.shake = Math.max(0, S.shake - dt * 2.5);
  S.flash = Math.max(0, S.flash - dt * 2.2);
  S.zoom = Math.max(0, S.zoom - dt * 1.6);
  if (S.launch && S.launch.fired !== undefined) {
    S.launch.fired += dt;
    if (S.launch.fired > 0.8) S.launch = null;
  }

  if (S.mode === 'countdown') return updateCountdown(dt);
  if (S.loop) return updateLoop(dt);

  const d = difficulty(S.level);
  const seg = track.find(S.position + PLAYER_Z);
  const racing = S.mode === 'play';
  const menu = S.mode === 'menu';
  const alive = racing && S.overTimer <= 0;

  let steer = 0;
  if (menu || (AUTOPILOT && alive)) steer = autopilot(dt);
  else if (alive) steer = input.steer;

  const top = S.mode === 'over' || S.overTimer > 0 ? 0 : menu ? d.maxSpeed * 0.85 : d.maxSpeed;
  const ev = player.update(dt, steer, seg.curve, top, menu || alive, seg.bank);
  if (ev === 'land' && !menu) {
    sound.land();
    dust();
  }

  const prevZ = S.position + PLAYER_Z;
  S.position += player.speed * dt;
  const curZ = S.position + PLAYER_Z;
  obstacles.update(dt, track, curZ, S.level);

  const events = obstacles.collide(track, player, prevZ, curZ);
  for (const e of events) handle(e, menu);

  if (S.fallPending && player.fall <= 0) respawnAfterFall();

  S.distance = S.position / SEG - S.startIndex;
  const lvl = levelAt(Math.floor(curZ / SEG));
  if (lvl > S.level) levelUp(lvl, menu);

  // The wheels clack over every joint between two plastic track pieces.
  const piece = Math.floor(curZ / (SEG * PIECE));
  S.clackTimer -= dt;
  if (piece !== S.lastPiece) {
    S.lastPiece = piece;
    if (racing && !player.airborne && S.clackTimer <= 0) { sound.clack(); S.clackTimer = 0.07; }
  }

  if (racing) {
    if (player.scraping && !player.airborne) sparks();
    sound.setScrape(player.scraping);
    if (S.overTimer > 0) {
      S.overTimer -= dt;
      if (S.overTimer <= 0) gameOver();
    }
  }

  const index = Math.floor(S.position / SEG);
  track.ensure(index + DRAW_DISTANCE + 10);
  track.trim(index - 5);
}

function updateCountdown(dt) {
  S.countdown += dt;
  const step = S.countdown < COUNTDOWN_STEP ? 3 : S.countdown < COUNTDOWN_STEP * 2 ? 2 : S.countdown < COUNTDOWN_STEP * 3 ? 1 : 0;
  // The car is pulled back against the booster spring, one click per light.
  if (S.launch && S.launch.pull !== undefined) S.launch.pull = Math.min(1, S.countdown / (COUNTDOWN_STEP * 2.6));
  if (step !== S.countStep) {
    S.countStep = step;
    ui.countdown(step);
    sound.countdown(step === 0);
    if (step > 0) sound.ratchet();
    if (step === 0) {
      ui.announce(t.go);
      setMode('play');
      ui.setMode('play');
      launch();
      setTimeout(() => { if (S.countStep === 0) ui.countdown(null); }, 800);
    }
  }
}

/** ¡YA!: the booster fires the car off the line. */
function launch() {
  const d = difficulty(S.level);
  S.launch = { fired: 0 };
  player.speed = d.maxSpeed * 0.8 * player.feel.top;
  sound.spring();
  S.zoom = 0.7;
  const c = carScreen();
  particles.burst(c.x, c.y, 10, { color: 'rgba(255,243,227,.85)', size: 10, speed: 380, life: 0.5, g: -150 });
}

function updateLoop(dt) {
  S.loop.t += dt / LOOP_TIME;
  if (S.loop.t >= 1) {
    S.position = S.loop.exitZ - PLAYER_Z;
    S.loop = null;
    S.bonus += 500;
    player.invul = Math.max(player.invul, 1);
    popText('+500', '#FFCC00');
    const index = Math.floor(S.position / SEG);
    track.ensure(index + DRAW_DISTANCE + 10);
    track.trim(index - 5);
  }
}

/** React to something the car touched. In the menu only jumps and pickups matter. */
function handle(e, menu) {
  const c = carScreen();
  switch (e.type) {
    case 'coin':
    case 'air':
      if (menu) return;
      S.coins++;
      S.bonus += e.type === 'air' ? 20 : 10;
      sound.coin();
      particles.burst(c.x, c.y - c.h * 0.6, 7, { color: '#FFCC00', size: 5, speed: 420, life: 0.5, g: 900 });
      if (e.type === 'air') popText('+20', '#FFCC00');
      break;
    case 'nitro':
      player.nitro = NITRO_TIME;
      if (menu) return;
      sound.nitro();
      S.zoom = 1;
      S.flash = 0.5;
      S.flashColor = '#6C8CFF';
      popText(t.nitro, '#6C8CFF');
      break;
    case 'ramp': {
      const d = difficulty(S.level);
      if (e.item.full) player.speed = Math.max(player.speed, d.maxSpeed * 0.7);
      player.jump(e.item.full ? 1500 + player.speed * 0.1 : 1150 + player.speed * 0.08);
      if (menu) return;
      S.bonus += 50;
      sound.jump();
      popText(t.jump, '#FFFFFF');
      break;
    }
    case 'firering':
      if (menu) return;
      S.bonus += 150;
      sound.fireRing();
      popText(t.ring, '#FF9A1F');
      particles.burst(c.x, c.y - c.h * 0.8, 18, { color: '#FF7A00', size: 7, speed: 520, life: 0.6, g: 300 });
      particles.burst(c.x, c.y - c.h * 0.8, 10, { color: '#FFD23F', size: 5, speed: 380, life: 0.5, g: 200 });
      break;
    case 'loop':
      if (menu) return;
      S.loop = { t: 0, exitZ: (e.item.index + 40) * SEG };
      sound.loop();
      ui.announce(t.loop);
      break;
    case 'oil':
      if (menu || player.boosting) return;
      player.skid = 1;
      player.speed *= 0.75;
      sound.skid();
      break;
    case 'cone':
      if (menu) return;
      if (player.boosting) {
        S.bonus += 25;
        sound.knock();
        particles.burst(c.x, c.y - c.h * 0.4, 10, { color: '#DD0200', shape: 'rect', size: 12, speed: 650, lift: 400, life: 0.8, g: 1600 });
        popText('+25', '#FFFFFF');
      } else crash('cone');
      break;
    case 'rival':
      if (menu) return;
      if (player.boosting) {
        S.bonus += 50;
        sound.knock();
        e.rival.z += 30 * SEG;
        popText('+50', '#FFFFFF');
      } else crash('rival');
      break;
    case 'fall':
      if (menu) {
        // The autopilot never falls: nudge it back to the middle lane.
        player.x = 0;
        return;
      }
      crash('fall');
      break;
    default:
  }
}

function crash(kind) {
  if (player.invul > 0 || S.overTimer > 0 || player.fall > 0) return;
  player.lives--;
  player.invul = 2.2;
  player.speed *= kind === 'fall' ? 0.5 : 0.4;
  player.nitro = 0;
  S.shake = reducedMotion.matches ? 0 : 1;
  S.flash = 0.7;
  S.flashColor = '#DD0200';
  sound.crash();
  const c = carScreen();
  if (kind === 'fall') {
    player.fall = 0.8;
    S.fallPending = true;
  } else {
    player.crash = 0.7;
    const spec = PLAYER_CARS[player.car];
    particles.burst(c.x, c.y - c.h * 0.5, 16, { color: spec.body, shape: 'rect', size: 14, speed: 700, lift: 500, life: 0.9, g: 1800 });
    particles.burst(c.x, c.y - c.h * 0.5, 10, { color: '#141414', shape: 'rect', size: 9, speed: 600, lift: 300, life: 0.8, g: 1800 });
  }
  if (player.lives <= 0) S.overTimer = 1.3;
  else ui.announce(t.lifeLost(player.lives));
}

function respawnAfterFall() {
  S.fallPending = false;
  const seg = track.find(S.position + PLAYER_Z);
  // Back on the lane closest to where the car fell, outside the hole.
  const lanes = [...LANE_X].sort((a, b) => Math.abs(a - player.x) - Math.abs(b - player.x));
  player.x = lanes.find((x) => !(seg.hole && x > seg.hole.x1 && x < seg.hole.x2)) ?? 0;
  player.vx = 0;
  player.alt = 0;
  player.invul = 2.2;
}

function levelUp(level, menu) {
  S.level = level;
  const idx = ambientIndexForLevel(level);
  S.ambFrom = S.ambT >= 1 ? S.ambTo : S.ambFrom;
  S.ambTo = idx;
  S.ambT = 0;
  if (menu) return;
  ui.banner(t.level(level), t.ambient[AMBIENTS[idx].name]);
  sound.levelUp();
}

function autopilot(dt) {
  S.aiTimer -= dt;
  if (S.aiTimer <= 0) {
    S.aiTimer = 0.2;
    const z = S.position + PLAYER_Z;
    let best = S.aiLane, bestScore = Infinity;
    for (let lane = 0; lane < 3; lane++) {
      const score = obstacles.laneScore(track, z, lane) + Math.abs(lane - S.aiLane) * 0.35;
      if (score < bestScore) { bestScore = score; best = lane; }
    }
    S.aiLane = best;
  }
  return clamp((LANE_X[S.aiLane] - player.x) * 6, -1, 1);
}

// ---- small effects ----------------------------------------------------------

function carScreen() {
  return renderer.carBox || { x: renderer.W / 2, y: renderer.H * 0.86, w: 100, h: 60 };
}

function popText(text, color) {
  const c = carScreen();
  particles.spawn({ text, color, x: c.x, y: c.y - c.h * 1.2, vy: -160, life: 0.9, size: 46 });
}

/** Sparks streaking off the plastic rail the car is rubbing. */
function sparks() {
  const c = carScreen();
  const side = Math.sign(player.x) || 1;
  const n = reducedMotion.matches ? 1 : 3;
  for (let i = 0; i < n; i++) {
    particles.spawn({
      shape: 'streak', x: c.x + side * c.w * 0.48, y: c.y - c.h * (0.05 + Math.random() * 0.25),
      vx: -side * (150 + Math.random() * 450), vy: -150 - Math.random() * 450, g: 1500,
      life: 0.25 + Math.random() * 0.2, size: 2 + Math.random() * 2,
      color: ['#FFFFFF', '#FFE36B', '#FFB000'][i % 3],
    });
  }
}

function dust() {
  const c = carScreen();
  particles.burst(c.x, c.y, 8, { color: 'rgba(255,243,227,.8)', size: 9, speed: 300, life: 0.45, g: -200 });
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render(dt) {
  const k = easeInOut(0, 1, S.ambT);
  const pal = blendAmbients(AMBIENTS[S.ambFrom], AMBIENTS[S.ambTo], k);
  const amb = k < 0.5 ? S.ambFrom : S.ambTo;

  if (S.mode !== 'paused') {
    const seg = track.find(S.position + PLAYER_Z);
    if (seg && !S.loop) renderer.scroll(seg.curve, player.speed / 10000, dt);
  }

  if (S.loop) {
    renderer.loopScene(S.loop.t, pal, sideCars[player.car], S.time, t.loop, S.ambTo);
    const edge = Math.max(0, 1 - S.loop.t / 0.07, (S.loop.t - 0.93) / 0.07);
    if (edge > 0) {
      const ctx = renderer.ctx;
      ctx.fillStyle = '#FFF3E3';
      ctx.globalAlpha = edge * (reducedMotion.matches ? 0.5 : 1);
      ctx.fillRect(0, 0, renderer.W, renderer.H);
      ctx.globalAlpha = 1;
    }
  } else {
    const nitroLines = player.boosting ? Math.min(1, player.nitro * 2) : 0;
    const launchLines = S.launch && S.launch.fired !== undefined ? 1 - S.launch.fired / 0.8 : 0;
    renderer.frame({
      track, position: S.position, player, rivals: obstacles.bySegment, pal, amb,
      ambFrom: S.ambFrom, ambTo: S.ambTo, ambK: k,
      time: S.time, shake: S.shake, flash: S.flash, flashColor: S.flashColor, particles,
      speedLines: S.mode === 'menu' ? 0 : Math.max(nitroLines, launchLines),
      zoom: S.zoom, blur: S.mode === 'menu' ? 0 : player.boosting ? 0.55 + 0.45 * S.zoom : 0,
      launch: S.mode === 'menu' ? null : S.launch, showPlayer: true,
    });
  }

  if (DEBUG_FPS) {
    const ctx = renderer.ctx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, renderer.H - 28, 330, 28);
    ctx.fillStyle = '#0F0';
    ctx.font = '16px monospace';
    ctx.fillText(`${loop.fps.toFixed(0)} fps · q${renderer.quality.toFixed(2)} · u${loop.updateMs.toFixed(1)} r${loop.renderMs.toFixed(1)}ms`, 8, renderer.H - 9);
  }

  // Engine pitch follows the speed.
  if (S.mode === 'play' || S.mode === 'countdown') {
    const ratio = S.mode === 'countdown' ? 0.12 + 0.08 * Math.sin(S.time * 9) ** 2 : player.speed / 14500;
    sound.updateEngine(ratio, player.boosting, S.loop ? 1.3 : 1);
  }

  if (S.mode === 'play' || S.mode === 'countdown' || S.mode === 'paused') {
    ui.updateHud({
      score: scoreNow(), distance: S.distance, coins: S.coins, kmh: player.speed * KMH,
      best: Math.max(S.best, scoreNow()), level: S.level, lives: player.lives,
      nitro: player.boosting ? player.nitro / NITRO_TIME : 0,
    });
  }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

const input = new Input(document.getElementById('touch'), { left: document.getElementById('btn-left'), right: document.getElementById('btn-right') }, {
  onPause() {
    if (S.mode === 'play' || S.mode === 'countdown') { pause(); return true; }
    if (S.mode === 'paused') { resume(); return true; }
    return false;
  },
  onFirstTouch(type) { if (type === 'touch' || type === 'pen') ui.enableTouch(); },
});

const loop = new Loop(update, render, () => {
  if (renderer.quality > 0.55) {
    renderer.quality -= 0.15;
    renderer.resize();
  }
});

const on = (id, fn) => document.getElementById(id).addEventListener('click', fn);
on('btn-start', startRace);
on('btn-resume', () => { sound.click(); resume(); });
on('btn-restart', () => { sound.resume(); startRace(); });
on('btn-menu', () => { sound.resume(); sound.click(); goMenu(); });
on('btn-again', startRace);
on('btn-over-menu', () => { sound.click(); goMenu(); });
on('btn-pause', () => { if (S.mode === 'paused') resume(); else pause(); });
on('btn-share', share);
on('btn-sound', () => {
  const muted = !sound.muted;
  sound.unlock();
  sound.setMuted(muted);
  ui.setMuted(muted);
  save({ muted });
  if (!muted) sound.click();
});

document.querySelectorAll('input[name="car"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    player.setCar(ui.selectedCar());
    save({ car: player.car });
    // The blister pops open.
    sound.unlock();
    sound.crinkle();
  });
});

// Auto-pause when the tab is hidden or the window loses focus; stop drawing while hidden.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pause();
    loop.stop();
  } else {
    loop.start();
  }
});
window.addEventListener('blur', pause);

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => renderer.resize(), 80);
});

reducedMotion.addEventListener?.('change', (e) => { renderer.reducedMotion = e.matches; });

async function share() {
  const url = new URL('./', location.href).href;
  const text = t.shareText(formatInt(S.lastScore || 0, t.locale));
  if (navigator.share) {
    try {
      await navigator.share({ title: t.shareTitle, text, url });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    ui.toast(t.copied);
  } catch {
    ui.toast(t.shareFail);
  }
}

// Boot: menu with the attract mode running behind it.
ui.setSelectedCar(saved.car);
ui.setMuted(saved.muted);
ui.setBest(S.best);
renderer.resize();
goMenu();
loop.start();
// Redraw the car cards once the display font is ready (texts on the canvas use it).
document.fonts?.ready.then(() => ui.drawCarCards());
