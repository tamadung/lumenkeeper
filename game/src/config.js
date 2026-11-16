// Every tuning number and colour in one place. The playfield is a fixed 960x600 logical
// area; the renderer scales it to fit the window, so no rule below depends on the screen size.
// You are the keeper of the last lantern: keep its light alive through 10 waves of shadow wisps.

export const FIELD = { width: 960, height: 600 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** How many waves a full game runs; surviving wave 10 is the victory. */
export const WAVES = 10;

/** Seconds of calm between waves, with a shower of motes to restock the light. */
export const CALM_SECONDS = 4;
export const CALM_MOTES = 5;

export const LANTERN = {
  /** Light level 0..100; the game starts full. */
  startLight: 100,
  /** Light burned every second, just for keeping the flame alive. */
  drainPerSecond: 0.9,
  /** Light lost when a wisp reaches the lantern's core. */
  hitCost: 9,
  /** Distance from the lantern's centre that counts as the core. */
  coreRadius: 26,
  /** The glow's radius follows the light: 70 + light * 0.9. */
  radiusBase: 70,
  radiusPerLight: 0.9,
  /** How fast the lantern chases the mouse / keys, units per second. */
  speed: 340,
  /** How quickly it settles onto the mouse position (1 = instant). */
  mouseEase: 14,
  /** Flare charges: start with 3, +1 at each wave's start, at most 3. */
  flareStart: 3,
  flareMax: 3,
  /** A flare burns every wisp inside this radius. */
  flareRadius: 260,
};

export const WISP = {
  /** Wave n spawns 6 + 3n wisps, staggered through the wave. */
  baseCount: 6,
  perWave: 3,
  /** Seconds between spawns at wave 1; it shrinks a little each wave. */
  spawnInterval: 1.0,
  spawnIntervalPerWave: 0.05,
  spawnIntervalMin: 0.45,
  /** Base drift speed, units per second; wave multiplier is 1 + 0.08 * (n - 1). */
  speed: 46,
  speedPerWave: 0.08,
  /** A wisp inside the light starts to burn and is gone this many seconds later. */
  burnSeconds: 0.35,
  /** While burning it crawls at this fraction of its speed. */
  burnSlow: 0.35,
  /** A dart wisp pauses this long, then lunges at this speed. */
  dartPause: 0.7,
  dartSpeed: 190,
  /** A weave wisp's sine wobble, in radians per second and units of sideways swing. */
  weaveFrequency: 2.2,
  weaveAmplitude: 34,
  /** Score for burning one wisp with the light, and for burning one with a flare. */
  burnPoints: 10,
  flarePoints: 5,
  /** How many wisps can exist at once; the pool is allocated once, at boot. */
  poolSize: 72,
};

export const MOTE = {
  /** A new mote appears about this often, at most this many on the field. */
  interval: 2.5,
  maxOnField: 5,
  /** Light and score a collected mote gives. */
  light: 12,
  points: 25,
  /** Distance from the lantern's centre that collects a mote. */
  collectRadius: 34,
  /** The pool is allocated once, at boot. */
  poolSize: 8,
};

/** Bonus score for clearing a wave: 25 * wave number. */
export const WAVE_CLEAR_POINTS = 25;

export const PALETTE = {
  backdrop: '#070a13',
  field: '#0a0e1a',
  fieldEdge: '#10182e',
  gold: '#ffd76a',
  goldDeep: '#e8a93c',
  ember: '#ff7a2f',
  violet: '#8b5cf6',
  violetDeep: '#5b21b6',
  wisp: '#171029',
  wispEdge: '#2e1a4d',
  panel: '#131a2e',
  panelEdge: '#2b3a5e',
  text: '#f5edd8',
  muted: '#93a0bd',
  danger: '#ff5d5d',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'lumenkeeper.best';
