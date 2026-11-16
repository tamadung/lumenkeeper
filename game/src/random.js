// A small seeded random number generator (mulberry32): the same seed gives the same game,
// which is what makes the screenshot scenes repeatable. The seed is a 32-bit integer; the
// generator returns a float in [0, 1) on every call.

export function createRandom(seed) {
  let state = seed | 0;
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random float in [min, max) from a generator. */
export function range(random, min, max) {
  return min + random() * (max - min);
}

/** A random integer in [min, max] from a generator. */
export function pickInt(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

/** One element of an array, picked uniformly. */
export function pickOne(random, list) {
  return list[Math.floor(random() * list.length)];
}
