// DOM interface: menus, HUD, countdown lights, level banner, toasts and focus handling.
// The canvas only draws the world; every text a player reads is real HTML (crisp and
// readable by screen readers).

import { PLAYER_CARS, renderCarSide } from './cars.js';
import { t } from './i18n.js';
import { formatInt } from './util.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.screens = { start: $('screen-start'), pause: $('screen-pause'), over: $('screen-over') };
    this.hud = $('hud');
    this.el = {
      score: $('hud-score'), dist: $('hud-dist'), coins: $('hud-coins'), speed: $('hud-speed'), best: $('hud-best'),
      level: $('hud-level'), lives: $('hud-lives'), nitro: $('hud-nitro'),
      startBest: $('start-best'), banner: $('banner'), countdown: $('countdown'), countText: $('count-text'),
      toast: $('toast'), announcer: $('announcer'), sound: $('btn-sound'), touch: $('touch-controls'),
      overScore: $('over-score'), overDist: $('over-dist'), overCoins: $('over-coins'), overLevel: $('over-level'),
      overBest: $('over-best'), overRecord: $('over-record'),
    };
    this.last = {};
    this.touchMode = window.matchMedia('(pointer: coarse)').matches;
    this.buildCars();
    this.drawCarCards();
  }

  /**
   * One blister pack per car: race number, the car under a plastic bubble and three
   * stat bars. No names: cars are told apart by color, number and stats.
   */
  buildCars() {
    const box = $('cars');
    box.textContent = '';
    PLAYER_CARS.forEach((spec, i) => {
      const label = document.createElement('label');
      label.className = 'car-option';
      label.style.setProperty('--car', spec.body);
      label.style.setProperty('--car-dark', spec.dark);
      const stats = ['speed', 'accel', 'handling'].map((k) => {
        const pips = Array.from({ length: 5 }, (_, n) => `<i${n < spec.stats[k] ? ' class="on"' : ''}></i>`).join('');
        return `<span class="stat"><span class="stat-name">${t.stats[k]}</span><span class="pips">${pips}</span></span>`;
      }).join('');
      label.innerHTML = `<input type="radio" name="car" value="${i}">`
        + '<span class="blister" aria-hidden="true"><span class="blister-hole"></span>'
        + `<span class="blister-num">${spec.num}</span>`
        + '<span class="blister-window"><canvas width="240" height="100"></canvas><span class="blister-bubble"></span></span>'
        + `<span class="stats">${stats}</span></span>`;
      label.querySelector('input').setAttribute('aria-label', t.carLabel(spec.num, t.colors[spec.color], spec.stats));
      box.append(label);
    });
  }

  drawCarCards() {
    document.querySelectorAll('.car-option').forEach((label, i) => {
      const canvas = label.querySelector('canvas');
      const ctx = canvas.getContext('2d');
      const img = renderCarSide(PLAYER_CARS[i], canvas.width * 0.92);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(0,0,0,.22)';
      ctx.beginPath();
      ctx.ellipse(canvas.width / 2, canvas.height * 0.9, canvas.width * 0.38, canvas.height * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(img, canvas.width * 0.04, canvas.height * 0.94 - img.height);
    });
  }

  selectedCar() {
    const checked = document.querySelector('input[name="car"]:checked');
    return checked ? Number(checked.value) : 0;
  }

  setSelectedCar(i) {
    const input = document.querySelector(`input[name="car"][value="${i}"]`);
    if (input) input.checked = true;
  }

  /** Show one of 'start' | 'pause' | 'over' (or null) and move focus into it. */
  show(name) {
    for (const [key, el] of Object.entries(this.screens)) el.hidden = key !== name;
    const target = name && this.screens[name].querySelector('.btn-primary');
    if (target) requestAnimationFrame(() => target.focus({ preventScroll: true }));
  }

  setMode(mode) {
    document.body.classList.toggle('is-menu', mode === 'menu');
    document.body.classList.toggle('is-countdown', mode === 'countdown');
    document.body.classList.toggle('is-playing', mode === 'play' || mode === 'paused');
    this.hud.hidden = !(mode === 'play' || mode === 'paused' || mode === 'countdown');
    this.el.touch.hidden = !(this.touchMode && mode === 'play');
  }

  enableTouch() {
    if (this.touchMode) return;
    this.touchMode = true;
    this.el.touch.hidden = !document.body.classList.contains('is-playing');
  }

  // ---- HUD (only touches the DOM when a value changes) ----------------------

  set(key, el, value) {
    if (this.last[key] === value) return;
    this.last[key] = value;
    el.textContent = value;
  }

  updateHud({ score, distance, coins, kmh, best, level, lives, nitro }) {
    const loc = t.locale;
    this.set('score', this.el.score, formatInt(score, loc));
    this.set('dist', this.el.dist, formatInt(distance, loc));
    this.set('coins', this.el.coins, formatInt(coins, loc));
    this.set('speed', this.el.speed, String(Math.round(kmh)));
    this.set('best', this.el.best, formatInt(best, loc));
    this.set('level', this.el.level, String(level));
    if (this.last.lives !== lives) {
      this.last.lives = lives;
      [...this.el.lives.children].forEach((s, i) => s.classList.toggle('lost', i >= lives));
      this.el.lives.setAttribute('aria-label', t.lifeLost(lives));
    }
    const on = nitro > 0;
    if (this.last.nitroOn !== on) { this.last.nitroOn = on; this.el.nitro.classList.toggle('on', on); }
    if (on) this.el.nitro.firstElementChild.style.transform = `scaleX(${nitro.toFixed(3)})`;
  }

  resetHud() { this.last = {}; }

  setBest(best) { this.el.startBest.textContent = formatInt(best, t.locale); }

  // ---- countdown lights ----------------------------------------------------

  countdown(step) {
    // step: 3, 2, 1 → one more red light each; 0 → all green "GO".
    const box = this.el.countdown;
    box.hidden = step === null;
    if (step === null) return;
    const lights = box.querySelector('.lights');
    const spans = lights.querySelectorAll('span');
    lights.classList.toggle('go', step === 0);
    spans.forEach((s, i) => s.classList.toggle('red', step > 0 && i < 4 - step));
    this.el.countText.textContent = step === 0 ? t.go : String(step);
  }

  banner(title, subtitle = '') {
    const b = this.el.banner;
    b.innerHTML = '';
    b.append(title);
    if (subtitle) {
      const small = document.createElement('small');
      small.textContent = subtitle;
      b.append(small);
    }
    b.classList.remove('show');
    void b.offsetWidth; // restart the CSS animation
    b.classList.add('show');
    this.announce(subtitle ? `${title} ${subtitle}` : title);
  }

  toast(message) {
    const el = this.el.toast;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  announce(message) {
    this.el.announcer.textContent = '';
    setTimeout(() => { this.el.announcer.textContent = message; }, 30);
  }

  setMuted(muted) {
    this.el.sound.setAttribute('aria-pressed', String(muted));
    this.el.sound.setAttribute('aria-label', muted ? t.soundOff : t.soundOn);
  }

  gameOver({ score, distance, coins, level, best, record }) {
    const loc = t.locale;
    this.el.overScore.textContent = formatInt(score, loc);
    this.el.overDist.textContent = formatInt(distance, loc);
    this.el.overCoins.textContent = formatInt(coins, loc);
    this.el.overLevel.textContent = String(level);
    this.el.overBest.textContent = formatInt(best, loc);
    this.el.overRecord.hidden = !record;
    this.el.overRecord.textContent = t.newRecord;
    this.show('over');
    this.announce(t.gameOver(formatInt(score, loc)));
  }
}
