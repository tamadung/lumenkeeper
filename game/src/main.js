// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between five screens: title, play, paused, victory and game over. The lantern follows
// the mouse or the WASD / arrow keys; Space or a click fires a flare, P pauses, M mutes.
//
// ?seed=N fixes the spawn pattern. ?shot=start|play|win|end (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, LANTERN, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  EVENT_BURN,
  EVENT_FLARE,
  EVENT_HIT,
  EVENT_MOTE,
  EVENT_OVER,
  EVENT_WAVE,
  EVENT_WIN,
  STATUS_LOST,
  STATUS_WON,
  createWorld,
} from './world.js';
import {
  ACTION_CONFIRM,
  ACTION_FLARE,
  ACTION_MUTE,
  ACTION_PAUSE,
  createInput,
} from './input.js';
import {
  SCREEN_OVER,
  SCREEN_PAUSED,
  SCREEN_PLAY,
  SCREEN_TITLE,
  SCREEN_WIN,
  createRenderer,
} from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** How far ahead of the lantern a held movement key aims, so the keys drive at full speed. */
const KEY_AIM = 400;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const random = createRandom(seed);
const world = createWorld(random);
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world, random);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, world.lightRadius());
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Keep the light alive through 10 waves.');
  }

  function finishGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    if (won) {
      audio.fanfare();
      announce(`Victory. Score ${world.state.score}. Best ${best}.`);
    } else {
      audio.drone();
      announce(`Game over. Score ${world.state.score}. Best ${best}.`);
    }
  }

  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      announce(audio.isMuted() ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM) audio.unlock();
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      startGame();
      // The press that started the game is spent: it must not also fire a flare.
      return true;
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
    return false;
  }

  /** Where the lantern should head this step: keys first, then the mouse, then it stays put. */
  function aimTarget() {
    const lantern = world.state.lantern;
    const steer = input.steer();
    if (steer.x !== 0 || steer.y !== 0) {
      return { x: lantern.x + steer.x * KEY_AIM, y: lantern.y + steer.y * KEY_AIM };
    }
    const pointer = input.pointer();
    if (pointer !== null) return renderer.toField(pointer.x, pointer.y);
    return { x: lantern.x, y: lantern.y };
  }

  function step(actions) {
    if (screen === SCREEN_TITLE) {
      const target = aimTarget();
      world.step(STEP, { x: target.x, y: target.y, flare: false }, true);
      return;
    }
    const control = {
      ...aimTarget(),
      flare: Boolean(actions & ACTION_FLARE),
    };
    const events = world.step(STEP, control, false);
    if (events & EVENT_BURN) audio.zap();
    if (events & EVENT_MOTE) audio.chime();
    if (events & EVENT_HIT) {
      audio.thud();
      announce(`A wisp struck the lantern. Light ${Math.round(world.state.lantern.light)}.`);
    }
    if (events & EVENT_FLARE) audio.whoosh();
    if (events & EVENT_WAVE) audio.horn();
    if (events & EVENT_WIN) finishGame(true);
    else if (events & EVENT_OVER) finishGame(false);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    // One queue of presses per frame: the screen logic takes its share, and the first
    // fixed step takes the flare, so a press is never lost and never counted twice.
    const actions = input.takeActions();
    const justStarted = handleActions(actions);
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      let firstStep = true;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(firstStep && !justStarted ? actions : 0);
        firstStep = false;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, world.lightRadius());
  }

  // Leaving the tab pauses a running game rather than letting the dark close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Lumenkeeper. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
