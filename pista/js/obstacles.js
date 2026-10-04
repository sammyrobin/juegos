// Everything on (or next to) the road: coins, nitro, cones, oil, holes, ramps, loops,
// rival cars and scenery. Places them when a section is generated, moves the rivals
// and reports what the player touched.

import { AMBIENTS, ambientIndexForLevel } from './palette.js';
import { JUMP, LANE_X, LEVEL_LEN, ROAD_W, SEG, difficulty } from './track.js';
import { chance, pick, rand, randInt } from './util.js';

export const CAR_W = 540;          // player car width in world units
const RIVAL_W = 580;
const HAZARDS = new Set(['cone', 'oil', 'ramp']);

// Toys and giant things next to the track, per room. [sprite, world width]
const SCENERY = {
  room: [['books', 1500], ['blocks', 1100], ['crayon', 520], ['ball', 1000], ['tires', 900], ['flag', 520]],
  living: [['cushion', 1500], ['mug', 1000], ['plant', 1400], ['books', 1500], ['tires', 900]],
  kitchen: [['apple', 950], ['orange', 900], ['cereal', 1300], ['mug', 1000], ['flag', 520]],
  garden: [['flower', 1200], ['flower', 1200], ['mushroom', 1000], ['rock', 1100], ['tires', 900]],
};
export const RING_R = 560;         // fire ring radius (world units)
export const RING_ALT = 700;       // height of its center over the table top

export class Obstacles {
  constructor() {
    this.rivals = [];
    this.bySegment = new Map();
    this.populate = this.populate.bind(this);
  }

  reset() {
    this.rivals = [];
    this.bySegment.clear();
  }

  // ---- placement ---------------------------------------------------------

  populate(track, from, to, level, kind) {
    const d = difficulty(level);
    const add = (index, item) => { const seg = track.get(index); if (seg) seg.items.push({ hit: false, phase: Math.random() * 6.28, index, ...item }); };
    const coins = (start, count, lane, gap = 3) => { for (let n = 0; n < count; n++) add(start + n * gap, { kind: 'coin', x: LANE_X[lane], w: 320 }); };

    this.scenery(track, from, to, add, level);
    // A doorway into the next room at every level boundary.
    for (let i = from; i < to; i++) if (i > 0 && i % LEVEL_LEN === 0) add(i, { kind: 'door', x: 0, w: ROAD_W * 2, scenery: true });

    if (kind === 'start') {
      coins(from + 58, 8, 1);
      return;
    }
    if (kind === 'loop') {
      const at = from + 80;
      coins(at - 36, 10, 1, 3);
      add(at, { kind: 'loop', x: 0, w: ROAD_W * 2 });
      return;
    }
    if (kind === 'jump') {
      // Table to table: the gap floor is TABLE_DROP lower, so items over it are raised by it.
      const ramp = from + JUMP.ramp;
      coins(ramp - 22, 6, 1, 3);
      add(ramp, { kind: 'ramp', x: 0, w: ROAD_W * 2, full: true });
      const tableY = track.get(from).p1.world.y;
      const drop = (i) => tableY - track.get(i).p1.world.y;
      for (let n = 0; n < 9; n++) {
        if (n === 4) continue; // the fire ring is there
        const t = n / 8;
        const i = from + JUMP.gapFrom - 2 + n * 2;
        add(i, { kind: 'air', x: LANE_X[1], w: 320, alt: drop(i) + 250 + Math.sin(t * Math.PI) * 650 });
      }
      const ring = from + JUMP.gapFrom + 6;
      add(ring, { kind: 'firering', x: 0, w: RING_R * 2, alt: drop(ring) + RING_ALT });
      return;
    }

    const traffic = chance(d.trafficChance);
    let i = from + 14;
    let free = randInt(0, 2);
    let lastRivalLane = -1;
    while (i < to - 10) {
      if (traffic) {
        let lane = randInt(0, 2);
        if (lane === lastRivalLane) lane = (lane + randInt(1, 2)) % 3;
        lastRivalLane = lane;
        add(i, { kind: 'rivalSpawn', lane, style: randInt(0, 2), sectionEnd: to });
        if (chance(0.5)) coins(i + 4, 5, (lane + randInt(1, 2)) % 3);
        i += randInt(32, 48);
        continue;
      }

      const r = Math.random();
      if (r < d.nitroChance) {
        add(i, { kind: 'nitro', x: LANE_X[randInt(0, 2)], w: 420 });
        i += 16;
      } else if (r < 0.34) {
        coins(i, randInt(5, 8), randInt(0, 2));
        i += 26;
      } else if (r < 0.44) {
        // Optional lane ramp: jump for a line of airborne coins.
        const lane = randInt(0, 2);
        add(i, { kind: 'ramp', x: LANE_X[lane], w: ROAD_W * 0.56, full: false });
        for (let n = 0; n < 6; n++) add(i + 5 + n * 3, { kind: 'air', x: LANE_X[lane], w: 320, alt: 300 + Math.sin(((n + 1) / 7) * Math.PI) * 500 });
        i += 30;
      } else {
        // Obstacle row: always leave one free lane, next to the previous free one
        // so a two-lane change is never required in a short gap.
        free = Math.max(0, Math.min(2, free + randInt(-1, 1)));
        const blocked = [0, 1, 2].filter((l) => l !== free);
        if (!chance(d.twoLanes)) blocked.splice(randInt(0, 1), 1);
        let holeUsed = false;
        for (const lane of blocked) {
          const x = LANE_X[lane];
          if (!holeUsed && chance(d.holeChance)) {
            holeUsed = true;
            for (let k = 0; k < 9; k++) { const seg = track.get(i + k); if (seg) seg.hole = { x1: x - 0.3, x2: x + 0.3 }; }
          } else if (chance(d.oilChance)) {
            add(i, { kind: 'oil', x, w: 900 });
          } else {
            add(i, { kind: 'cone', x: x - 0.13, w: 250 });
            add(i, { kind: 'cone', x: x + 0.13, w: 250 });
          }
        }
        if (chance(0.45)) coins(i - 6, 3, free, 3);
        i += d.rowGap + randInt(0, 8);
      }
    }
  }

  scenery(track, from, to, add, level) {
    const room = AMBIENTS[ambientIndexForLevel(level)].name;
    const list = SCENERY[room];
    // Garden stake lights at night; indoors, toy marker posts along the rails.
    const post = room === 'garden' ? ['lamp', 420] : ['post', 300];
    for (let i = from; i < to; i++) {
      const seg = track.get(i);
      if (seg.gap || seg.face) continue;
      if (i % 24 === 0) {
        add(i, { kind: post[0], x: -1.22, w: post[1], scenery: true });
        add(i, { kind: post[0], x: 1.22, w: post[1], scenery: true });
      }
      if (i % 90 === 45) add(i, { kind: chance(0.5) ? 'sign' : 'sign2', x: pick([-1, 1]) * 1.75, w: 2200, scenery: true });
      else if (chance(0.2)) {
        const [kind, w] = pick(list);
        add(i, { kind, x: pick([-1, 1]) * rand(1.6, 3.6), w, scenery: true });
      }
    }
  }

  // ---- rivals --------------------------------------------------------------

  update(dt, track, playerZ, level) {
    const d = difficulty(level);
    // Wake up rival spawns once the player is close, so they meet where they were placed.
    const first = Math.floor(playerZ / SEG);
    for (let idx = first + 110; idx < first + 150; idx++) {
      const seg = track.get(idx);
      if (!seg) break;
      for (const item of seg.items) {
        if (item.kind !== 'rivalSpawn' || item.hit) continue;
        item.hit = true;
        this.rivals.push({
          z: idx * SEG, x: LANE_X[item.lane], lane: item.lane, targetX: LANE_X[item.lane],
          style: item.style, speed: d.maxSpeed * d.rivalSpeed * rand(0.9, 1.1),
          maxZ: item.sectionEnd * SEG, leaving: false, laneTimer: rand(2, 5), canChange: d.rivalLaneChange,
        });
      }
    }

    for (const r of this.rivals) {
      // At the end of their section rivals speed away instead of drifting into the next obstacles.
      if (r.z > r.maxZ) r.leaving = true;
      if (r.leaving) r.speed += 6000 * dt;
      r.z += r.speed * dt;
      if (r.canChange && !r.leaving) {
        r.laneTimer -= dt;
        if (r.laneTimer <= 0) {
          r.laneTimer = rand(2.5, 5);
          const lane = Math.max(0, Math.min(2, r.lane + pick([-1, 1])));
          const busy = this.rivals.some((o) => o !== r && o.lane === lane && Math.abs(o.z - r.z) < 30 * SEG);
          if (!busy) { r.lane = lane; r.targetX = LANE_X[lane]; }
        }
      }
      r.x += (r.targetX - r.x) * Math.min(1, dt * 1.6);
    }
    this.rivals = this.rivals.filter((r) => r.z > playerZ - 2 * SEG && r.z < playerZ + 400 * SEG);

    this.bySegment.clear();
    for (const r of this.rivals) {
      const idx = Math.floor(r.z / SEG);
      if (!this.bySegment.has(idx)) this.bySegment.set(idx, []);
      this.bySegment.get(idx).push(r);
    }
  }

  // ---- collisions ------------------------------------------------------------

  /**
   * Items whose segment start the player crossed between fromZ and toZ.
   * Returns a list of events for the game to react to.
   */
  collide(track, player, fromZ, toZ) {
    const events = [];
    const px = player.x;
    const airborne = player.alt > 120;
    for (let idx = Math.floor(fromZ / SEG) + 1; idx <= Math.floor(toZ / SEG); idx++) {
      const seg = track.get(idx);
      if (!seg) continue;
      for (const item of seg.items) {
        if (item.hit || item.scenery || item.kind === 'rivalSpawn') continue;
        const reach = (item.w / 2 + CAR_W / 2) / ROAD_W;
        const dx = Math.abs(item.x - px);
        if (item.kind === 'firering') {
          // Flying through the middle of the ring scores; missing it costs nothing.
          if (player.alt > 200 && Math.abs(item.x - px) < (RING_R * 0.62) / ROAD_W) { item.hit = true; events.push({ type: 'firering', item }); }
          continue;
        }
        const pickup = item.kind === 'coin' || item.kind === 'nitro' || item.kind === 'air';
        if (dx > reach * (pickup ? 1.1 : 0.8) && item.kind !== 'loop') continue;
        if (item.kind === 'coin' && airborne) continue;
        if (item.kind === 'air' && !airborne) continue;
        if (HAZARDS.has(item.kind) && airborne) continue;
        item.hit = true;
        events.push({ type: item.kind, item });
      }
    }

    // Holes and track gaps under the car.
    const under = track.find(toZ);
    if (under && player.alt <= 0) {
      if (under.gap) events.push({ type: 'fall' });
      else if (under.hole && px > under.hole.x1 + 0.05 && px < under.hole.x2 - 0.05) events.push({ type: 'fall' });
    }

    // Rival cars.
    if (player.alt < 220) {
      for (const r of this.rivals) {
        const dz = r.z - toZ;
        if (dz > -260 && dz < 300 && Math.abs(r.x - px) * ROAD_W < (CAR_W + RIVAL_W) * 0.42) {
          events.push({ type: 'rival', rival: r });
          r.z = toZ + 600;
          r.speed += 2500;
          break;
        }
      }
    }
    return events;
  }

  /** Danger score of a lane over the next segments (used by the menu autopilot). */
  laneScore(track, playerZ, lane) {
    const first = Math.floor(playerZ / SEG) + 1;
    const x = LANE_X[lane];
    let score = 0;
    for (let k = 0; k < 45; k++) {
      const seg = track.get(first + k);
      if (!seg) break;
      const weight = 1 - k / 50;
      if (seg.hole && x > seg.hole.x1 && x < seg.hole.x2) score += 6 * weight;
      for (const it of seg.items) {
        if (it.hit || it.scenery) continue;
        if (Math.abs(it.x - x) > 0.3 && !(it.kind === 'ramp' && it.full)) continue;
        if (it.kind === 'cone' || it.kind === 'oil') score += 5 * weight;
        if (it.kind === 'coin' || it.kind === 'nitro') score -= 0.6 * weight;
      }
      for (const r of this.bySegment.get(first + k) || []) if (Math.abs(r.x - x) < 0.4) score += 5 * weight;
    }
    return score;
  }
}
