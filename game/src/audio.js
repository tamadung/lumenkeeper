// Procedural sound only: every effect is built from oscillators and filtered noise through
// the Web Audio API, so the game ships no sound files at all. The context is created on the
// first user gesture (browsers block audio before one) and every effect is a short, quiet
// envelope so nothing startles. M toggles mute.

export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (context !== null) return true;
    try {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      return true;
    } catch {
      return false;
    }
  }

  /** Call from a user gesture (click / key) so the browser allows sound. */
  function unlock() {
    if (!ensure()) return;
    if (context.state === 'suspended') context.resume().catch(() => {});
  }

  function tone(type, from, to, seconds, volume, delay) {
    if (!ensure() || muted) return;
    const start = context.currentTime + (delay ?? 0);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    if (to !== from) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + seconds);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + seconds + 0.05);
  }

  function noise(seconds, volume, filterFrom, filterTo, delay) {
    if (!ensure() || muted) return;
    const start = context.currentTime + (delay ?? 0);
    const length = Math.max(1, Math.floor(context.sampleRate * seconds));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFrom, start);
    if (filterTo !== filterFrom) filter.frequency.exponentialRampToValueAtTime(filterTo, start + seconds);
    filter.Q.value = 1.2;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start);
    source.stop(start + seconds + 0.05);
  }

  return {
    unlock,
    /** Mute or unmute every effect. */
    setMuted(value) {
      muted = value;
    },
    isMuted() {
      return muted;
    },
    /** A wisp burns in the light: a short zap and a falling blip. */
    zap() {
      noise(0.12, 0.25, 3200, 900);
      tone('square', 880, 220, 0.14, 0.12);
    },
    /** A mote is gathered: a bright three-note chime. */
    chime() {
      tone('sine', 659, 659, 0.18, 0.16);
      tone('sine', 880, 880, 0.18, 0.16, 0.06);
      tone('sine', 1319, 1319, 0.28, 0.14, 0.12);
    },
    /** A flare bursts: a rising rush of filtered noise. */
    whoosh() {
      noise(0.5, 0.3, 300, 3600);
      tone('sine', 180, 520, 0.4, 0.08);
    },
    /** A new wave begins: a low horn swell. */
    horn() {
      tone('sawtooth', 110, 165, 0.7, 0.1);
      tone('sawtooth', 165, 220, 0.7, 0.07, 0.08);
    },
    /** A wisp strikes the lantern's core: a dull low thud. */
    thud() {
      tone('sine', 140, 55, 0.25, 0.3);
      noise(0.1, 0.15, 300, 120);
    },
    /** The light goes out: a slow low drone that fades. */
    drone() {
      tone('sine', 98, 49, 1.6, 0.2);
      tone('sine', 147, 73, 1.6, 0.1, 0.1);
    },
    /** Ten waves survived: a small rising fanfare. */
    fanfare() {
      tone('triangle', 523, 523, 0.22, 0.16);
      tone('triangle', 659, 659, 0.22, 0.16, 0.14);
      tone('triangle', 784, 784, 0.22, 0.16, 0.28);
      tone('triangle', 1047, 1047, 0.5, 0.18, 0.42);
    },
  };
}
