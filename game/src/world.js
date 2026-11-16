// The game's rules and state, with no drawing and no browser in it: the lantern and its light,
// the pool of shadow wisps, the golden motes, the flare, the waves, the score and the win/loss.
// step() advances one fixed step and returns what happened as bit flags, so the caller can
// react (sounds, announcements) without the world knowing about screens or sound. Nothing here
// allocates after createWorld returns: every wisp, mote, spark and ember comes from a pool.

import {
  CALM_MOTES,
  CALM_SECONDS,
  FIELD,
  LANTERN,
  MOTE,
  WAVE_CLEAR_POINTS,
  WAVES,
  WISP,
} from './config.js';
import { pickInt, range } from './random.js';

export const KIND_DRIFT = 0;
export const KIND_WEAVE = 1;
export const KIND_DART = 2;

export const EVENT_BURN = 1;
export const EVENT_MOTE = 2;
export const EVENT_HIT = 4;
export const EVENT_FLARE = 8;
export const EVENT_WAVE = 16;
export const EVENT_WIN = 32;
export const EVENT_OVER = 64;

export const STATUS_PLAYING = 'playing';
export const STATUS_WON = 'won';
export const STATUS_LOST = 'lost';

const EMBER_COUNT = 42;

function distance(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

export function createWorld(random) {
  const lantern = {
    x: FIELD.width / 2,
    y: FIELD.height / 2,
    light: LANTERN.startLight,
    flareCharges: LANTERN.flareStart,
  };

  const wisps = [];
  for (let index = 0; index < WISP.poolSize; index += 1) {
    wisps.push({
      active: false, kind: KIND_DRIFT, x: 0, y: 0, speed: 0,
      phase: 0, burn: 0, size: 0, pause: 0, lunging: 0, angle: 0,
    });
  }
  const motes = [];
  for (let index = 0; index < MOTE.poolSize; index += 1) {
    motes.push({ active: false, x: 0, y: 0, pulse: 0 });
  }
  const sparks = [];
  for (let index = 0; index < 24; index += 1) {
    sparks.push({ active: false, x: 0, y: 0, age: 0, life: 0, maxR: 0 });
  }
  const embers = [];
  for (let index = 0; index < EMBER_COUNT; index += 1) {
    embers.push({
      x: random() * FIELD.width, y: random() * FIELD.height,
      vx: range(random, -6, 6), vy: range(random, -22, -8),
      size: range(random, 1, 2.6), alpha: range(random, 0.15, 0.6),
      flicker: random() * Math.PI * 2,
    });
  }

  const state = {
    lantern, wisps, motes, sparks, embers,
    score: 0, wave: 1, waveState: 'fight', waveTimer: 0,
    spawnLeft: 0, spawnTimer: 0, moteTimer: MOTE.interval,
    motesCollected: 0, flaresUsed: 0, elapsed: 0,
    status: STATUS_PLAYING, flash: 0, shake: 0, ambientTimer: 0,
  };

  function lightRadius() {
    return LANTERN.radiusBase + lantern.light * LANTERN.radiusPerLight;
  }

  function freeWisp() {
    for (let index = 0; index < wisps.length; index += 1) {
      if (!wisps[index].active) return wisps[index];
    }
    return null;
  }

  function freeMote() {
    for (let index = 0; index < motes.length; index += 1) {
      if (!motes[index].active) return motes[index];
    }
    return null;
  }

  function freeSpark() {
    for (let index = 0; index < sparks.length; index += 1) {
      if (!sparks[index].active) return sparks[index];
    }
    return sparks[0];
  }

  function addSpark(x, y, maxR) {
    const spark = freeSpark();
    spark.active = true;
    spark.x = x;
    spark.y = y;
    spark.age = 0;
    spark.life = 0.45;
    spark.maxR = maxR;
  }

  function spawnEdgePoint() {
    const side = pickInt(random, 0, 3);
    const margin = 24;
    if (side === 0) return { x: range(random, 0, FIELD.width), y: -margin };
    if (side === 1) return { x: FIELD.width + margin, y: range(random, 0, FIELD.height) };
    if (side === 2) return { x: range(random, 0, FIELD.width), y: FIELD.height + margin };
    return { x: -margin, y: range(random, 0, FIELD.height) };
  }

  function spawnWisp() {
    const wisp = freeWisp();
    if (wisp === null) return;
    const point = spawnEdgePoint();
    const roll = random();
    wisp.active = true;
    wisp.kind = roll < 0.55 ? KIND_DRIFT : roll < 0.85 ? KIND_WEAVE : KIND_DART;
    wisp.x = point.x;
    wisp.y = point.y;
    const waveSpeed = 1 + WISP.speedPerWave * (state.wave - 1);
    wisp.speed = WISP.speed * waveSpeed * range(random, 0.85, 1.2);
    wisp.phase = random() * Math.PI * 2;
    wisp.burn = 0;
    wisp.size = range(random, 13, 19);
    wisp.pause = range(random, 0.2, WISP.dartPause);
    wisp.lunging = 0;
    wisp.angle = 0;
  }

  function spawnMote() {
    const mote = freeMote();
    if (mote === null) return;
    // Keep motes a little away from the lantern so collecting one is a small trip.
    for (let tries = 0; tries < 6; tries += 1) {
      const x = range(random, 50, FIELD.width - 50);
      const y = range(random, 50, FIELD.height - 50);
      if (distance(x, y, lantern.x, lantern.y) < 90) continue;
      mote.active = true;
      mote.x = x;
      mote.y = y;
      mote.pulse = random() * Math.PI * 2;
      return;
    }
    mote.active = true;
    mote.x = range(random, 50, FIELD.width - 50);
    mote.y = range(random, 50, FIELD.height - 50);
    mote.pulse = random() * Math.PI * 2;
  }

  function spawnInterval() {
    return Math.max(
      WISP.spawnIntervalMin,
      WISP.spawnInterval - WISP.spawnIntervalPerWave * (state.wave - 1),
    );
  }

  function activeWisps() {
    let count = 0;
    for (const wisp of wisps) if (wisp.active) count += 1;
    return count;
  }

  function activeMotes() {
    let count = 0;
    for (const mote of motes) if (mote.active) count += 1;
    return count;
  }

  function startWave(number) {
    state.wave = number;
    state.waveState = 'fight';
    state.spawnLeft = WISP.baseCount + WISP.perWave * number;
    state.spawnTimer = 0.6;
    lantern.flareCharges = Math.min(LANTERN.flareMax, lantern.flareCharges + 1);
  }

  function reset() {
    lantern.x = FIELD.width / 2;
    lantern.y = FIELD.height / 2;
    lantern.light = LANTERN.startLight;
    lantern.flareCharges = LANTERN.flareStart;
    for (const wisp of wisps) wisp.active = false;
    for (const mote of motes) mote.active = false;
    for (const spark of sparks) spark.active = false;
    state.score = 0;
    state.wave = 1;
    state.waveState = 'fight';
    state.waveTimer = 0;
    state.spawnLeft = 0;
    state.spawnTimer = 0;
    state.moteTimer = MOTE.interval;
    state.motesCollected = 0;
    state.flaresUsed = 0;
    state.elapsed = 0;
    state.status = STATUS_PLAYING;
    state.flash = 0;
    state.shake = 0;
    state.ambientTimer = 0;
    startWave(1);
    spawnMote();
    spawnMote();
  }

  function releaseFlare() {
    let events = 0;
    if (lantern.flareCharges <= 0) return events;
    lantern.flareCharges -= 1;
    state.flaresUsed += 1;
    state.flash = 0.35;
    const radius = LANTERN.flareRadius;
    for (const wisp of wisps) {
      if (!wisp.active) continue;
      if (distance(wisp.x, wisp.y, lantern.x, lantern.y) > radius) continue;
      wisp.active = false;
      state.score += WISP.flarePoints;
      addSpark(wisp.x, wisp.y, 30);
    }
    addSpark(lantern.x, lantern.y, radius);
    return EVENT_FLARE;
  }

  /**
   * One fixed step. `control` is where the lantern should head ({x, y} in field units) and
   * whether the player asked for a flare. With `harmless` set (the title screen's backdrop)
   * wisps drift and burn but nothing scores, nothing dims the light and the game never ends.
   */
  function step(dt, control, harmless) {
    let events = 0;
    if (state.status !== STATUS_PLAYING) return events;
    state.elapsed += dt;
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt);
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt);

    // The lantern chases its target at a fixed speed and never leaves the field.
    const dx = control.x - lantern.x;
    const dy = control.y - lantern.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const move = Math.min(dist, LANTERN.speed * dt);
    if (dist > 0.001) {
      lantern.x += (dx / dist) * move;
      lantern.y += (dy / dist) * move;
    }
    lantern.x = Math.min(FIELD.width - 20, Math.max(20, lantern.x));
    lantern.y = Math.min(FIELD.height - 20, Math.max(20, lantern.y));

    // The flame burns down just for staying lit; motes are the only way to feed it.
    if (!harmless) {
      lantern.light = Math.max(0, lantern.light - LANTERN.drainPerSecond * dt);
      if (lantern.light <= 0) {
        state.status = STATUS_LOST;
        return EVENT_OVER;
      }
    }

    if (control.flare && !harmless) events |= releaseFlare();

    // Motes appear on a slow timer, a few at most, and the lantern gathers them by touch.
    state.moteTimer -= dt;
    if (state.moteTimer <= 0) {
      state.moteTimer += MOTE.interval;
      if (activeMotes() < MOTE.maxOnField) spawnMote();
    }
    const radius = lightRadius();
    for (const mote of motes) {
      if (!mote.active) continue;
      mote.pulse += dt * 3;
      if (distance(mote.x, mote.y, lantern.x, lantern.y) < MOTE.collectRadius) {
        mote.active = false;
        if (!harmless) {
          lantern.light = Math.min(LANTERN.startLight, lantern.light + MOTE.light);
          state.score += MOTE.points;
          state.motesCollected += 1;
          events |= EVENT_MOTE;
        }
      }
    }

    // Waves: spawn the wave's wisps on a stagger, then rest while the field clears.
    // On the title screen (harmless) a few wisps drift in just for the backdrop.
    if (harmless) {
      state.ambientTimer -= dt;
      if (state.ambientTimer <= 0) {
        state.ambientTimer += 1.2;
        if (activeWisps() < 6) spawnWisp();
      }
    } else if (state.waveState === 'fight') {
        if (state.spawnLeft > 0) {
          state.spawnTimer -= dt;
          if (state.spawnTimer <= 0) {
            spawnWisp();
            state.spawnLeft -= 1;
            state.spawnTimer += spawnInterval();
          }
        } else if (activeWisps() === 0) {
          state.score += WAVE_CLEAR_POINTS * state.wave;
          events |= EVENT_WAVE;
          state.waveState = 'calm';
          state.waveTimer = CALM_SECONDS;
          for (let index = 0; index < CALM_MOTES; index += 1) spawnMote();
        }
      } else {
        state.waveTimer -= dt;
        if (state.waveTimer <= 0) {
          if (state.wave >= WAVES) {
            state.status = STATUS_WON;
            return events | EVENT_WIN;
          }
          startWave(state.wave + 1);
          events |= EVENT_WAVE;
        }
      }

    // Wisps hunt the lantern. Inside the light one starts to burn and is gone shortly after;
    // a fast one can still cross the glow and strike the core first.
    for (const wisp of wisps) {
      if (!wisp.active) continue;
      const toLanternX = lantern.x - wisp.x;
      const toLanternY = lantern.y - wisp.y;
      const toLantern = Math.sqrt(toLanternX * toLanternX + toLanternY * toLanternY) || 1;
      const ux = toLanternX / toLantern;
      const uy = toLanternY / toLantern;
      let speed = wisp.speed;

      if (wisp.kind === KIND_WEAVE) {
        wisp.phase += dt * WISP.weaveFrequency;
        const sway = Math.sin(wisp.phase) * WISP.weaveAmplitude * dt;
        wisp.x += -uy * sway;
        wisp.y += ux * sway;
      } else if (wisp.kind === KIND_DART) {
        if (wisp.lunging > 0) {
          wisp.lunging -= dt;
          speed = WISP.dartSpeed;
        } else {
          wisp.pause -= dt;
          speed = wisp.speed * 0.5;
          if (wisp.pause <= 0) {
            wisp.lunging = 0.55;
            wisp.pause = range(random, 0.5, WISP.dartPause + 0.4);
          }
        }
      }
      if (wisp.burn > 0) speed *= WISP.burnSlow;
      wisp.x += ux * speed * dt;
      wisp.y += uy * speed * dt;
      wisp.angle += dt * 1.5;

      if (toLantern < LANTERN.coreRadius) {
        wisp.active = false;
        if (!harmless) {
          lantern.light = Math.max(0, lantern.light - LANTERN.hitCost);
          state.shake = 0.3;
          events |= EVENT_HIT;
          if (lantern.light <= 0) {
            state.status = STATUS_LOST;
            return events | EVENT_OVER;
          }
        }
        continue;
      }
      if (wisp.burn > 0) {
        wisp.burn -= dt;
        if (wisp.burn <= 0) {
          wisp.active = false;
          if (!harmless) {
            state.score += WISP.burnPoints;
            events |= EVENT_BURN;
          }
          addSpark(wisp.x, wisp.y, 26);
        }
      } else if (toLantern < radius) {
        wisp.burn = WISP.burnSeconds;
      }
    }

    // Burn rings expand and fade; embers drift up and wrap around the field.
    for (const spark of sparks) {
      if (!spark.active) continue;
      spark.age += dt;
      if (spark.age >= spark.life) spark.active = false;
    }
    for (const ember of embers) {
      ember.x += ember.vx * dt;
      ember.y += ember.vy * dt;
      ember.flicker += dt * 2;
      if (ember.y < -4) {
        ember.y = FIELD.height + 4;
        ember.x = random() * FIELD.width;
      }
      if (ember.x < -4) ember.x = FIELD.width + 4;
      if (ember.x > FIELD.width + 4) ember.x = -4;
    }
    return events;
  }

  reset();
  return { state, reset, step, lightRadius, releaseFlare, activeWisps, activeMotes };
}
