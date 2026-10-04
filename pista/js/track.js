// The track: an endless list of short road segments (the classic pseudo-3D technique).
// Each segment has a curve value and two edge points (p1 near, p2 far) with a height.
// Sections (straights, curves, hills, jumps, loops) are generated ahead of the player
// and old segments behind the camera are dropped, so memory stays constant forever.

import { clamp, easeIn, easeInOut, easeOut, pick, rand, randInt } from './util.js';

export const SEG = 200;            // segment length in world units (1 segment = 1 meter)
export const ROAD_W = 2200;        // half the road width
export const LANES = 3;
export const LANE_X = [-2 / 3, 0, 2 / 3];
export const RUMBLE = 3;           // segments per color band
export const LEVEL_LEN = 2400;     // meters per level
export const WALL_H = 150;         // height of the orange side rails
export const PIECE = 10;           // segments per plastic track piece (a joint between pieces)
export const BANK_H = 900;         // how much the outer edge rises in a fully banked curve
export const TABLE_W = 4.2;        // table top half-width, in road half-widths
export const TABLE_DROP = 1500;    // from a table top down to the floor

// Jump section layout (segments from the start of the section): the track runs on a
// table, a ramp launches the car over the gap and the next table catches it.
export const JUMP = { tableFrom: 4, ramp: 34, gapFrom: 38, gapTo: 51, tableTo: 104 };

export const levelAt = (index) => 1 + Math.floor(index / LEVEL_LEN);

/** Difficulty knobs for a level (1-based). */
export function difficulty(level) {
  const d = level - 1;
  return {
    maxSpeed: Math.min(7800 + 950 * d, 14500),
    rowGap: Math.max(13, 30 - 3 * d),
    twoLanes: Math.min(0.12 + 0.12 * d, 0.6),
    holeChance: d >= 1 ? Math.min(0.12 + 0.05 * d, 0.3) : 0,
    oilChance: Math.min(0.12 + 0.03 * d, 0.25),
    trafficChance: Math.min(0.25 + 0.06 * d, 0.5),
    rivalSpeed: Math.min(0.42 + 0.04 * d, 0.68),
    rivalLaneChange: d >= 2,
    curve: Math.min(2.4 + 0.8 * d, 6.5),
    hill: Math.min(18 + 8 * d, 60) * SEG,
    nitroChance: 0.09,
  };
}

const MAX_HEIGHT = 55 * SEG;

export class Track {
  /** populate(track, fromIndex, toIndex, level, kind) fills a new section with items. */
  constructor(populate) {
    this.populate = populate;
    this.reset(false);
  }

  /** startIndex lets a run begin at a later level (dev flag ?level=N). */
  reset(menu, startIndex = 0) {
    this.menu = menu;
    this.segments = [];
    this.base = startIndex;
    this.sections = 0;
    this.loopLevels = new Set();
    this.addRoad(0, 90, 0, 0, 0);
    this.get(startIndex + 12).start = true;
    this.populate(this, startIndex, startIndex + 90, levelAt(startIndex), 'start');
  }

  get next() { return this.base + this.segments.length; }

  get(index) { return this.segments[index - this.base]; }

  find(z) { return this.get(Math.floor(z / SEG)); }

  lastY() {
    const n = this.segments.length;
    return n ? this.segments[n - 1].p2.world.y : 0;
  }

  addSegment(curve, y, bank = 0) {
    const index = this.next;
    const n = this.segments.length;
    const prevBank = n ? this.segments[n - 1].p2.bank : 0;
    const point = (py, pz, b) => ({ world: { x: 0, y: py, z: pz }, bank: b, camera: { x: 0, y: 0, z: 0 }, screen: { x: 0, y: 0, w: 0, b: 0, scale: 0 } });
    this.segments.push({
      index,
      p1: point(this.lastY(), index * SEG, prevBank),
      p2: point(y, (index + 1) * SEG, bank),
      curve,
      bank,
      band: Math.floor(index / RUMBLE) % 2,
      joint: index % PIECE === 0,
      items: [],
      hole: null,
      gap: false,
      table: false,
      face: false,
      baseY: null,
      start: false,
      fog: 0,
      visible: false,
    });
  }

  /**
   * Classic road builder: ease into a curve, hold it, ease out, while changing height by dy.
   * `banking` tilts the road into the curve (0 flat … 1 fully banked).
   */
  addRoad(enter, hold, leave, curve, dy, banking = 0.3) {
    const startY = this.lastY();
    const endY = startY + dy;
    const total = enter + hold + leave;
    const bankOf = (c) => clamp(c / 6, -1, 1) * banking;
    const add = (c, k) => this.addSegment(c, easeInOut(startY, endY, k), bankOf(c));
    for (let n = 0; n < enter; n++) add(easeIn(0, curve, n / enter), n / total);
    for (let n = 0; n < hold; n++) add(curve, (enter + n) / total);
    for (let n = 0; n < leave; n++) add(easeOut(curve, 0, n / leave), (enter + hold + n) / total);
  }

  /**
   * Jump between two tables: the floor under the gap is TABLE_DROP lower, and the
   * first segment of the far table rises steeply, which paints as the table's front.
   */
  shapeJump(from) {
    const tableY = this.get(from).p1.world.y;
    for (let i = from + JUMP.tableFrom; i < from + JUMP.tableTo; i++) {
      const seg = this.get(i);
      if (i >= from + JUMP.gapFrom && i < from + JUMP.gapTo) {
        seg.gap = true;
        seg.baseY = tableY;
        if (i > from + JUMP.gapFrom) seg.p1.world.y = tableY - TABLE_DROP;
        seg.p2.world.y = tableY - TABLE_DROP;
      } else {
        seg.table = true;
      }
    }
    const face = this.get(from + JUMP.gapTo);
    face.face = true;
    face.baseY = tableY;
    face.p1.world.y = tableY - TABLE_DROP;
  }

  /** A random height change that keeps the track within ±MAX_HEIGHT. */
  hill(size) {
    const y = this.lastY();
    return clamp(rand(-1, 1) * size - y * 0.35, -MAX_HEIGHT - y, MAX_HEIGHT - y);
  }

  /** Generate sections until the track reaches `index`. */
  ensure(index) {
    while (this.next < index) this.addSection();
  }

  /** Forget segments before `index` (in batches, to avoid shifting every frame). */
  trim(index) {
    const drop = index - this.base;
    if (drop > 120) {
      this.segments.splice(0, drop);
      this.base = index;
    }
  }

  addSection() {
    const from = this.next;
    const level = levelAt(from);
    const d = difficulty(level);
    const inLevel = from % LEVEL_LEN;
    this.sections++;

    let kind;
    if (!this.menu && inLevel > LEVEL_LEN * 0.4 && !this.loopLevels.has(level)) kind = 'loop';
    else if (this.sections % 6 === 0) kind = 'jump';
    else kind = pick(['straight', 'curve', 'curve', 'banked', 'scurve', 'hill', 'curvehill', 'curvehill']);

    const side = () => (Math.random() < 0.5 ? -1 : 1);
    switch (kind) {
      case 'loop':
        this.loopLevels.add(level);
        this.addRoad(20, 110, 20, 0, -this.lastY());
        break;
      case 'jump':
        this.addRoad(15, 80, 15, 0, 0);
        this.shapeJump(from);
        break;
      case 'straight':
        this.addRoad(10, randInt(30, 60), 10, 0, 0);
        break;
      case 'curve':
        this.addRoad(randInt(20, 35), randInt(35, 70), randInt(20, 35), side() * rand(0.55, 1) * d.curve, 0);
        break;
      case 'banked':
        // Tight, fully banked curve: stronger than a normal one, but the tilt holds the car.
        this.addRoad(25, randInt(50, 80), 25, side() * rand(1.1, 1.35) * d.curve, 0, 1);
        break;
      case 'scurve': {
        const s = side();
        this.addRoad(20, 40, 20, s * rand(0.5, 0.9) * d.curve, 0);
        this.addRoad(20, 40, 20, -s * rand(0.5, 0.9) * d.curve, 0);
        break;
      }
      case 'hill':
        this.addRoad(25, randInt(40, 70), 25, 0, this.hill(d.hill));
        break;
      default:
        this.addRoad(25, randInt(40, 70), 25, side() * rand(0.4, 0.9) * d.curve, this.hill(d.hill));
    }
    this.populate(this, from, this.next, level, kind);
  }
}
