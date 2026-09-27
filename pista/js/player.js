// The player's car: lateral steering with inertia, curve push (centrifugal force),
// side walls, automatic acceleration, jumps and the timers for crash, skid and nitro.

import { CAR_W } from './obstacles.js';
import { ROAD_W } from './track.js';
import { approach, clamp, smooth } from './util.js';

const GRAVITY = 3400;
const CENTRIFUGAL = 0.28;
export const WALL_LIMIT = 1 - CAR_W / 2 / ROAD_W - 0.03;
export const NITRO_TIME = 3.2;
export const NITRO_BOOST = 1.4;

export class Player {
  constructor() {
    this.reset(0);
  }

  reset(car) {
    this.car = car;
    this.x = 0;
    this.vx = 0;
    this.alt = 0;
    this.vy = 0;
    this.speed = 0;
    this.lives = 3;
    this.invul = 0;
    this.skid = 0;
    this.nitro = 0;
    this.crash = 0;      // > 0 while the crash wobble plays
    this.fall = 0;       // > 0 while falling into a hole
    this.tilt = 0;
    this.scraping = false;
  }

  get airborne() { return this.alt > 0 || this.vy > 0; }

  get boosting() { return this.nitro > 0; }

  jump(power) {
    this.vy = Math.max(this.vy, power);
    this.alt = Math.max(this.alt, 1);
  }

  /**
   * steer: -1 … 1 from the input (or autopilot). curve: curve of the segment under the car.
   * Returns 'land' when the car touches the ground after a jump.
   */
  update(dt, steer, curve, maxSpeed, controllable = true) {
    let event = null;

    // Speed: the car accelerates by itself up to the level's top speed (more with nitro).
    const target = this.fall > 0 ? 0 : this.boosting ? maxSpeed * NITRO_BOOST : maxSpeed;
    if (this.speed < target) this.speed = Math.min(target, this.speed + (target * 0.24 + 900) * dt);
    else this.speed = approach(this.speed, target, 5200 * dt);

    // Steering with a little inertia; faster cars also steer faster so high levels stay fair.
    const ratio = this.speed / 10000;
    const steerRate = 2.2 + 0.75 * Math.min(ratio, 1.45);
    let input = controllable && this.fall <= 0 ? steer : 0;
    if (this.skid > 0) input = input * 0.25 + Math.sin(this.skid * 22) * 0.9;
    if (this.airborne) input *= 0.6;
    this.vx += (input * steerRate - this.vx) * smooth(12, dt);
    this.x += this.vx * dt;

    // Curves push the car outwards, harder the faster it goes.
    if (!this.airborne) this.x -= dt * curve * Math.min(ratio * ratio, 1.6) * CENTRIFUGAL;

    // Blue walls: the car scrapes along them and loses some speed.
    this.scraping = false;
    if (Math.abs(this.x) > WALL_LIMIT) {
      this.x = Math.sign(this.x) * WALL_LIMIT;
      this.vx *= -0.2;
      this.scraping = this.speed > 1500 && !this.airborne;
      if (this.scraping) this.speed = Math.max(maxSpeed * 0.45, this.speed - 2600 * dt);
    }

    // Jumps.
    if (this.alt > 0 || this.vy > 0) {
      this.vy -= GRAVITY * dt;
      this.alt += this.vy * dt;
      if (this.alt <= 0) {
        this.alt = 0;
        this.vy = 0;
        event = 'land';
      }
    }

    this.invul = Math.max(0, this.invul - dt);
    this.nitro = Math.max(0, this.nitro - dt);
    this.skid = Math.max(0, this.skid - dt);
    this.crash = Math.max(0, this.crash - dt);
    if (this.fall > 0) this.fall = Math.max(0, this.fall - dt);

    // Body roll for the sprite: leans into steering and against the curve.
    this.tilt += (clamp(this.vx / steerRate, -1, 1) * 0.09 - curve * 0.006 - this.tilt) * smooth(8, dt);
    return event;
  }
}
