// DOM interface: menus, HUD, countdown lights, level banner, toasts and focus handling.
// The canvas only draws the world; every text a player reads is real HTML (crisp and
// readable by screen readers).

import { PLAYER_CARS, renderCarSide } from './cars.js';
import { t } from './i18n.js';
import { formatInt } from './util.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.screens = { start: $('screen-start'), pause: $('screen-pause'), over: $('screen-over'), ranking: $('screen-ranking') };
    this.hud = $('hud');
    this.el = {
      score: $('hud-score'), dist: $('hud-dist'), coins: $('hud-coins'), speed: $('hud-speed'), best: $('hud-best'),
      level: $('hud-level'), lives: $('hud-lives'), nitro: $('hud-nitro'),
      startBest: $('start-best'), banner: $('banner'), countdown: $('countdown'), countText: $('count-text'),
      toast: $('toast'), announcer: $('announcer'), sound: $('btn-sound'), touch: $('touch-controls'),
      overScore: $('over-score'), overDist: $('over-dist'), overCoins: $('over-coins'), overLevel: $('over-level'),
      overBest: $('over-best'), overRecord: $('over-record'), overCar: $('over-car'), overUnlock: $('over-unlock'),
      speedo: $('speedo'), speedoFill: $('speedo-fill'), speedoNeedle: $('speedo-needle'),
    };
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.leaving = new Map();
    this.last = {};
    this.touchMode = window.matchMedia('(pointer: coarse)').matches;
    this.unlocked = PLAYER_CARS.map((_, i) => i);
  }

  /**
   * One blister pack per car: race number, top speed, the car under a plastic bubble and
   * three stat bars. No names: cars are told apart by color, number and stats. Locked
   * cars show as a silhouette with a padlock and the distance that unlocks them.
   */
  buildCars(unlocked = this.unlocked) {
    this.unlocked = unlocked;
    const box = $('cars');
    box.textContent = '';
    PLAYER_CARS.forEach((spec, i) => {
      const locked = !unlocked.includes(i);
      const label = document.createElement('label');
      label.className = 'car-option' + (locked ? ' is-locked' : '');
      label.style.setProperty('--car', spec.body);
      label.style.setProperty('--car-dark', spec.dark);
      const stats = ['speed', 'accel', 'handling'].map((k) => {
        const pips = Array.from({ length: 5 }, (_, n) => `<i${n < spec.stats[k] ? ' class="on"' : ''}></i>`).join('');
        return `<span class="stat"><span class="stat-name">${t.stats[k]}</span><span class="pips">${pips}</span></span>`;
      }).join('');
      const goal = formatInt(spec.unlock, t.locale);
      label.innerHTML = `<input type="radio" name="car" value="${i}"${locked ? ' disabled' : ''}>`
        + '<span class="blister" aria-hidden="true"><span class="blister-hole"></span>'
        + `<span class="blister-num">${spec.num}</span><span class="blister-kmh">${spec.kmh}<small> km/h</small></span>`
        + (spec.lives > 3 ? `<span class="blister-badge">${t.extraLives(spec.lives - 3)}</span>` : '')
        + '<span class="blister-window"><canvas width="240" height="100"></canvas><span class="blister-bubble"></span>'
        + (locked ? `<span class="blister-lock"><svg viewBox="0 0 24 24"><path d="M7 10V8a5 5 0 0 1 10 0v2"/><rect x="4.5" y="10" width="15" height="11" rx="2.5"/><path d="M12 14.5v2.5"/></svg><span class="blister-goal">${t.goal(goal)}</span></span>` : '')
        + `</span><span class="stats">${stats}</span></span>`;
      label.querySelector('input').setAttribute('aria-label', locked
        ? t.lockedLabel(spec.num, goal)
        : t.carLabel(spec.num, t.colors[spec.color], spec.stats, spec.kmh, spec.lives));
      box.append(label);
    });
    this.drawCarCards();
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
      if (label.classList.contains('is-locked')) {
        // Silhouette: the car's shape in solid ink.
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = '#1B1B22';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'source-over';
      }
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

  /**
   * Show one of 'start' | 'pause' | 'over' (or null) and move focus into it. The new
   * screen fades in (CSS); the old one fades out for 200 ms before it is hidden.
   */
  show(name) {
    for (const [key, el] of Object.entries(this.screens)) {
      clearTimeout(this.leaving.get(key));
      if (key === name) {
        el.classList.remove('is-leaving');
        el.hidden = false;
      } else if (!el.hidden && !this.reducedMotion.matches) {
        el.classList.add('is-leaving');
        this.leaving.set(key, setTimeout(() => { el.hidden = true; el.classList.remove('is-leaving'); }, 200));
      } else {
        el.hidden = true;
      }
    }
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

  updateHud({ score, distance, coins, kmh, kmhMax, best, level, lives, maxLives, nitro }) {
    const loc = t.locale;
    this.set('score', this.el.score, formatInt(score, loc));
    this.set('dist', this.el.dist, formatInt(distance, loc));
    this.set('coins', this.el.coins, formatInt(coins, loc));
    this.set('best', this.el.best, formatInt(best, loc));
    this.set('level', this.el.level, String(level));
    this.speedo(kmh, kmhMax, nitro > 0);
    if (this.last.maxLives !== maxLives) {
      // One heart per life (the fastest car starts with more).
      this.last.maxLives = maxLives;
      this.last.lives = undefined;
      this.el.lives.textContent = '';
      for (let i = 0; i < maxLives; i++) this.el.lives.append(document.createElement('span'));
    }
    if (this.last.lives !== lives) {
      const hearts = [...this.el.lives.children];
      hearts.forEach((s, i) => {
        s.classList.toggle('lost', i >= lives);
        s.classList.toggle('gain', this.last.lives !== undefined && i < lives && i >= this.last.lives);
      });
      this.last.lives = lives;
      this.el.lives.setAttribute('aria-label', t.lifeLost(lives));
    }
    const on = nitro > 0;
    if (this.last.nitroOn !== on) { this.last.nitroOn = on; this.el.nitro.classList.toggle('on', on); }
    if (on) this.el.nitro.firstElementChild.style.transform = `scaleX(${nitro.toFixed(3)})`;
  }

  /** Needle, arc and number of the speedometer (the DOM only changes with the value). */
  speedo(kmh, max, nitro) {
    const v = Math.round(kmh);
    if (this.last.kmh === v && this.last.nitroSpeedo === nitro) return;
    this.last.kmh = v;
    this.last.nitroSpeedo = nitro;
    const k = Math.max(0, Math.min(1, kmh / max));
    this.el.speed.textContent = String(v);
    this.el.speedoFill.style.strokeDasharray = `${(k * 100).toFixed(1)} 100`;
    this.el.speedoNeedle.style.transform = `rotate(${(-90 + k * 180).toFixed(1)}deg)`;
    this.el.speedo.classList.toggle('is-hot', k > 0.8 && !nitro);
    this.el.speedo.classList.toggle('is-nitro', nitro);
    if (v % 10 === 0) this.el.speedo.setAttribute('aria-label', t.speedLabel(v));
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
    if (b.classList.contains('is-unlock')) return; // never cut the unlock banner short
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

  // ---- global ranking ------------------------------------------------------

  /** The nickname form on the game over screen (only when the score makes the top 20). */
  showRankForm(nickname, focus = true) {
    const form = $('rank-form'), input = $('nick');
    form.hidden = false;
    form.classList.remove('is-busy');
    $('rank-form-title').textContent = t.rank.entered;
    $('nick-send').disabled = false;
    input.disabled = false;
    input.value = nickname || '';
    input.removeAttribute('aria-invalid');
    this.rankMessage('');
    // On phones the keyboard would pop up by itself: let the player tap the field.
    if (focus) requestAnimationFrame(() => input.focus({ preventScroll: true }));
  }

  /** The score cannot be sent any more (expired race, someone took the spot…). */
  rankClosed() {
    $('nick').disabled = true;
    $('nick-send').disabled = true;
  }

  hideRankForm() { $('rank-form').hidden = true; }

  rankBusy(busy) {
    $('rank-form').classList.toggle('is-busy', busy);
    if (busy) this.rankMessage(t.rank.sending);
  }

  /** kind: 'error' | 'ok' | '' */
  rankMessage(text, kind = '') {
    const msg = $('rank-msg');
    msg.textContent = text;
    msg.className = 'rank-msg' + (kind ? ` is-${kind}` : '');
    if (kind === 'error') $('nick').setAttribute('aria-invalid', 'true');
    else $('nick').removeAttribute('aria-invalid');
  }

  /** The score is in: the form stays as a confirmation, without the input. */
  rankDone(text) {
    this.rankMessage(text, 'ok');
    $('rank-form-title').textContent = t.rank.saved;
    $('nick').disabled = true;
    $('nick-send').disabled = true;
    $('btn-over-ranking').focus({ preventScroll: true });
  }

  /**
   * Fill the ranking screen. state: 'loading' | 'offline' | array of scores.
   * you: { name, score } highlights the player's own row.
   */
  renderRanking(state, you = null) {
    const body = $('ranking-body');
    body.textContent = '';
    if (!Array.isArray(state) || state.length === 0) {
      const p = document.createElement('p');
      p.className = 'ranking-note';
      p.textContent = state === 'loading' ? t.rank.loading : state === 'offline' ? t.rank.offline : t.rank.empty;
      body.append(p);
      return;
    }
    const loc = t.locale;
    const table = document.createElement('table');
    table.className = 'ranking-table';
    const c = t.rank.cols;
    table.innerHTML = `<caption class="visually-hidden">${t.rank.caption}</caption><thead><tr>`
      + `<th scope="col" class="rk-pos">${c.pos}</th><th scope="col">${c.name}</th><th scope="col" class="rk-score">${c.score}</th>`
      + `<th scope="col" class="rk-dist">${c.dist}</th><th scope="col" class="rk-date">${c.date}</th></tr></thead><tbody></tbody>`;
    const tbody = table.querySelector('tbody');
    let marked = false;
    state.forEach((row, i) => {
      const car = PLAYER_CARS[row.car] || PLAYER_CARS[0];
      const tr = document.createElement('tr');
      const mine = !marked && you && row.name === you.name && row.score === you.score;
      if (mine) { tr.className = 'is-you'; marked = true; }
      const date = new Date(row.date);
      const cells = [
        ['rk-pos', String(i + 1)],
        ['rk-name', null],
        ['rk-score', formatInt(row.score, loc)],
        ['rk-dist', `${formatInt(row.distance, loc)} m`],
        ['rk-date', Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(loc, { day: 'numeric', month: 'short' })],
      ];
      for (const [cls, text] of cells) {
        const td = document.createElement(cls === 'rk-pos' ? 'th' : 'td');
        if (cls === 'rk-pos') td.scope = 'row';
        td.className = cls;
        if (text !== null) td.textContent = text;
        else {
          // Car number chip in the car's color, then the nickname (always as text).
          const chip = document.createElement('span');
          chip.className = 'car-chip';
          chip.style.setProperty('--chip', car.body);
          chip.textContent = car.num;
          chip.title = t.rank.carTitle(car.num);
          td.append(chip, document.createTextNode(row.name));
          if (mine) td.append(` (${t.rank.you})`);
        }
        tr.append(td);
      }
      tbody.append(tr);
    });
    body.append(table);
    body.querySelector('.is-you')?.scrollIntoView({ block: 'nearest' });
  }

  /** A new car unlocked during the race: a bigger banner with the car itself. */
  unlockBanner(car) {
    const b = this.el.banner;
    b.innerHTML = '';
    const img = renderCarSide(car, 220);
    img.className = 'banner-car';
    const small = document.createElement('small');
    small.textContent = t.unlockSub;
    b.append(t.unlockTitle(car.num), img, small);
    b.classList.remove('show', 'is-unlock');
    void b.offsetWidth; // restart the CSS animation
    b.classList.add('show', 'is-unlock');
    this.announce(`${t.unlockTitle(car.num)} ${t.unlockSub}`);
    clearTimeout(this.unlockTimer);
    this.unlockTimer = setTimeout(() => b.classList.remove('is-unlock'), 3400);
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

  /** Sliders, mute buttons and the speaker icon follow the saved sound settings. */
  setSoundPrefs(p) {
    for (const ch of ['music', 'sfx']) {
      const vol = $(`vol-${ch}`), mute = $(`mute-${ch}`);
      vol.value = String(Math.round(p[`${ch}Vol`] * 100));
      mute.setAttribute('aria-pressed', String(p[`${ch}Muted`]));
    }
    const off = (p.musicMuted || p.musicVol <= 0) && (p.sfxMuted || p.sfxVol <= 0);
    this.el.sound.classList.toggle('is-off', off);
  }

  get soundPanelOpen() { return !$('sound-panel').hidden; }

  toggleSoundPanel(open = !this.soundPanelOpen) {
    $('sound-panel').hidden = !open;
    this.el.sound.setAttribute('aria-expanded', String(open));
    if (open) requestAnimationFrame(() => $('vol-music').focus({ preventScroll: true }));
  }

  gameOver({ score, distance, coins, level, best, record, car, unlocked = [] }) {
    const loc = t.locale;
    // The score counts up from zero (instantly with reduced motion).
    cancelAnimationFrame(this.countRaf);
    const start = performance.now(), dur = this.reducedMotion.matches ? 0 : 1100;
    const tick = (now) => {
      const k = dur ? Math.min(1, (now - start) / dur) : 1;
      this.el.overScore.textContent = formatInt(Math.round(score * (1 - (1 - k) ** 3)), loc);
      if (k < 1) this.countRaf = requestAnimationFrame(tick);
    };
    tick(start);
    // The car the player raced with, crossing the finish.
    const g = this.el.overCar.getContext('2d');
    const img = renderCarSide(PLAYER_CARS[car], this.el.overCar.width * 0.9);
    g.clearRect(0, 0, this.el.overCar.width, this.el.overCar.height);
    g.fillStyle = 'rgba(0,0,0,.2)';
    g.beginPath(); g.ellipse(180, 138, 150, 8, 0, 0, Math.PI * 2); g.fill();
    g.drawImage(img, 18, 140 - img.height);
    this.el.overUnlock.hidden = unlocked.length === 0;
    this.el.overUnlock.textContent = unlocked.length ? t.unlockedList(unlocked) : '';
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
