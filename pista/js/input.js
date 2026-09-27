// Keyboard, touch and on-screen buttons, merged into one steering value (-1 … 1).
// Keyboard: ← → or A D, Space / P / Esc to pause.
// Touch: hold the left or right half of the screen, or drag the finger sideways.

const LEFT_KEYS = new Set(['ArrowLeft', 'KeyA']);
const RIGHT_KEYS = new Set(['ArrowRight', 'KeyD']);
const PAUSE_KEYS = new Set(['Space', 'KeyP', 'Escape']);
const DRAG_PX = 22;

export class Input {
  /**
   * surface: element that receives touches for steering (covers the game area).
   * buttons: { left, right } on-screen buttons.
   */
  constructor(surface, buttons, { onPause, onFirstTouch }) {
    this.keys = { left: false, right: false };
    this.buttons = { left: false, right: false };
    this.touches = new Map();
    this.onPause = onPause;
    this.onFirstTouch = onFirstTouch;
    this.enabled = false;

    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => this.releaseAll());

    surface.addEventListener('pointerdown', (e) => this.touchStart(e, surface));
    surface.addEventListener('pointermove', (e) => this.touchMove(e));
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      surface.addEventListener(type, (e) => this.touches.delete(e.pointerId));
    }

    for (const side of ['left', 'right']) {
      const btn = buttons[side];
      const on = (e) => { e.preventDefault(); this.buttons[side] = true; btn.classList.add('is-down'); btn.setPointerCapture?.(e.pointerId); };
      const off = () => { this.buttons[side] = false; btn.classList.remove('is-down'); };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
      btn.addEventListener('lostpointercapture', off);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  key(e, down) {
    const inControl = e.target instanceof HTMLElement && e.target.closest('button, a, input, select, textarea, summary');
    if (LEFT_KEYS.has(e.code)) {
      this.keys.left = down;
      if (this.enabled) e.preventDefault();
    } else if (RIGHT_KEYS.has(e.code)) {
      this.keys.right = down;
      if (this.enabled) e.preventDefault();
    } else if (down && PAUSE_KEYS.has(e.code) && !e.repeat) {
      // Space on a focused button must press the button, not toggle the pause.
      if (inControl && e.code === 'Space') return;
      if (this.onPause(e.code)) e.preventDefault();
    }
  }

  touchStart(e, surface) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.onFirstTouch?.(e.pointerType);
    surface.setPointerCapture?.(e.pointerId);
    this.touches.set(e.pointerId, { x0: e.clientX, x: e.clientX, width: surface.clientWidth, left: surface.getBoundingClientRect().left });
  }

  touchMove(e) {
    const t = this.touches.get(e.pointerId);
    if (!t) return;
    t.x = e.clientX;
    // Re-anchor after a long drag so a swipe back reverses quickly.
    if (Math.abs(t.x - t.x0) > DRAG_PX * 4) t.x0 = t.x - Math.sign(t.x - t.x0) * DRAG_PX * 4;
  }

  releaseAll() {
    this.keys.left = this.keys.right = false;
    this.buttons.left = this.buttons.right = false;
    this.touches.clear();
  }

  /** -1 (left) … 1 (right). */
  get steer() {
    let s = 0;
    if (this.keys.left || this.buttons.left) s -= 1;
    if (this.keys.right || this.buttons.right) s += 1;
    for (const t of this.touches.values()) {
      const drag = t.x - t.x0;
      if (Math.abs(drag) > DRAG_PX) s += Math.max(-1, Math.min(1, drag / (DRAG_PX * 3)));
      else s += t.x - t.left < t.width / 2 ? -1 : 1;
    }
    return Math.max(-1, Math.min(1, s));
  }
}
