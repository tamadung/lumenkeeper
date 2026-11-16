// The screenshot scenes behind ?shot=start|play|win|end. Each one plays the real rules forward
// from a fresh world for a fixed stretch, steered by a simple autopilot, so the frame is what a
// short game really looks like and the same seed always gives the same frame. The good pilot
// chases motes when the light runs low, herds wisps into the glow otherwise, and flares when
// the dark closes in; the bad pilot wanders at random and never flares, so the light dies.
import { FIELD, LANTERN, STEP } from './config.js';
import { EVENT_OVER, EVENT_WIN, KIND_DART } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 26;
const LIMIT_SECONDS = 900;
const FLARE_MIN_WISPS = 5;

/** The nearest mote to the lantern, or null when the field holds none. */
function nearestMote(state) {
  const lantern = state.lantern;
  let best = null;
  let bestDistance = Infinity;
  for (const mote of state.motes) {
    if (!mote.active) continue;
    const dx = mote.x - lantern.x;
    const dy = mote.y - lantern.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDistance) {
      bestDistance = dist;
      best = mote;
    }
  }
  return best;
}

/** How many wisps are inside `radius` of the lantern right now. */
function wispsWithin(state, radius) {
  const lantern = state.lantern;
  let count = 0;
  for (const wisp of state.wisps) {
    if (!wisp.active) continue;
    const dx = wisp.x - lantern.x;
    const dy = wisp.y - lantern.y;
    if (dx * dx + dy * dy < radius * radius) count += 1;
  }
  return count;
}

/** The centre of the densest wisp cluster near the lantern, or null when the dark is thin. */
function clusterCentre(state) {
  const lantern = state.lantern;
  let best = null;
  let bestCount = 1;
  for (const wisp of state.wisps) {
    if (!wisp.active) continue;
    let count = 0;
    let sumX = 0;
    let sumY = 0;
    for (const other of state.wisps) {
      if (!other.active) continue;
      const dx = other.x - wisp.x;
      const dy = other.y - wisp.y;
      if (dx * dx + dy * dy < 90 * 90) {
        count += 1;
        sumX += other.x;
        sumY += other.y;
      }
    }
    if (count > bestCount) {
      bestCount = count;
      best = { x: sumX / count, y: sumY / count };
    }
  }
  // Only chase a cluster when it is close enough to matter.
  if (best === null) return null;
  const dx = best.x - lantern.x;
  const dy = best.y - lantern.y;
  if (dx * dx + dy * dy > 340 * 340) return null;
  return best;
}

/** A dart wisp closing in fast: the one threat the pilot answers by moving away from it. */
function nearestDart(state) {
  const lantern = state.lantern;
  let best = null;
  let bestDistance = Infinity;
  for (const wisp of state.wisps) {
    if (!wisp.active || wisp.kind !== KIND_DART || wisp.lunging <= 0) continue;
    const dx = wisp.x - lantern.x;
    const dy = wisp.y - lantern.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDistance) {
      bestDistance = dist;
      best = wisp;
    }
  }
  return bestDistance < 200 * 200 ? best : null;
}

/**
 * The good pilot: where the lantern should head and whether to flare. It feeds the flame
 * first, herds the dark into the glow second, and fires a flare when the dark closes in.
 */
function goodPilot(state) {
  const lantern = state.lantern;
  const flare = wispsWithin(state, LANTERN.flareRadius) >= FLARE_MIN_WISPS && lantern.flareCharges > 0;
  const dart = nearestDart(state);
  if (dart !== null) {
    // A lunging dart is the one thing the glow cannot stop in time: step aside.
    const dx = lantern.x - dart.x;
    const dy = lantern.y - dart.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: lantern.x + (dx / dist) * 160, y: lantern.y + (dy / dist) * 160, flare };
  }
  const mote = nearestMote(state);
  if (lantern.light < 75 && mote !== null) return { x: mote.x, y: mote.y, flare };
  const cluster = clusterCentre(state);
  if (cluster !== null) return { x: cluster.x, y: cluster.y, flare };
  if (mote !== null) return { x: mote.x, y: mote.y, flare };
  return { x: FIELD.width / 2, y: FIELD.height / 2, flare };
}

/** The bad pilot: a fresh random corner every little while, no flare, no mote chasing. */
function badPilot(state, random, memory) {
  memory.timer -= 1 / 60;
  if (memory.timer <= 0 || memory.target === null) {
    memory.timer = 0.6 + random() * 0.8;
    memory.target = { x: 60 + random() * (FIELD.width - 120), y: 60 + random() * (FIELD.height - 120) };
  }
  return { x: memory.target.x, y: memory.target.y, flare: false };
}

/**
 * Set `world` to the named scene (start, play, win or end; any other name is start) and return
 * the screen to draw over it and the best score to show.
 */
export function stageShot(name, world, random) {
  world.reset();
  if (name !== 'play' && name !== 'win' && name !== 'end') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) {
      world.step(STEP, { x: FIELD.width / 2, y: FIELD.height / 2, flare: false }, true);
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'play') {
    for (let index = 0; index < PLAY_SECONDS / STEP; index += 1) {
      const events = world.step(STEP, goodPilot(world.state), false);
      if (events & EVENT_OVER) break;
    }
    const over = world.state.status !== 'playing';
    return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
  }
  const bad = name === 'end';
  const memory = { timer: 0, target: null };
  for (let index = 0; index < LIMIT_SECONDS / STEP; index += 1) {
    const control = bad ? badPilot(world.state, random, memory) : goodPilot(world.state);
    const events = world.step(STEP, control, false);
    if (events & (EVENT_WIN | EVENT_OVER)) break;
  }
  if (world.state.status === 'won') return { screen: SCREEN_WIN, best: world.state.score };
  return { screen: SCREEN_OVER, best: world.state.score };
}
