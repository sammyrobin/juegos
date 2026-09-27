// Game loop: requestAnimationFrame + delta time, split into small fixed steps so physics
// and collisions behave the same at 30, 60 or 144 Hz. It also watches the frame time and
// asks for a lower render resolution when a device cannot keep up.

const MAX_FRAME = 0.1;     // after a hiccup, never simulate more than 100 ms at once
const STEP = 1 / 120;      // physics step

export class Loop {
  constructor(update, render, onSlow) {
    this.update = update;
    this.render = render;
    this.onSlow = onSlow;
    this.running = false;
    this.last = 0;
    this.avg = 1 / 60;
    this.slowFor = 0;
    this.fps = 60;
    this.updateMs = 0;
    this.renderMs = 0;
    this.frame = this.frame.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  frame(now) {
    if (!this.running) return;
    const dt = Math.min(MAX_FRAME, Math.max(0, (now - this.last) / 1000));
    this.last = now;

    const t0 = performance.now();
    let left = dt;
    while (left > 1e-6) {
      const step = Math.min(STEP, left);
      this.update(step);
      left -= step;
    }
    const t1 = performance.now();
    this.render(dt);
    const t2 = performance.now();
    this.updateMs += (t1 - t0 - this.updateMs) * 0.05;
    this.renderMs += (t2 - t1 - this.renderMs) * 0.05;

    // Exponential average of the frame time; 1.5 s under 45 FPS triggers onSlow once.
    this.avg += (dt - this.avg) * 0.05;
    this.fps = 1 / Math.max(this.avg, 1e-3);
    if (this.avg > 1 / 45) {
      this.slowFor += dt;
      if (this.slowFor > 1.5) {
        this.slowFor = -3; // give the new resolution time to settle
        this.onSlow?.();
      }
    } else if (this.slowFor > 0) {
      this.slowFor = 0;
    }

    this.raf = requestAnimationFrame(this.frame);
  }
}
