// Keyboard and pointer input. Held keys give a steering direction; the mouse gives a target
// point; one-shot presses (start or restart, flare, pause, mute) are queued as bit flags and
// taken once by the loop, so a press between two frames is never lost and never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_FLARE = 2;
export const ACTION_PAUSE = 4;
export const ACTION_MUTE = 8;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Enter']);
const FLARE = new Set(['Space']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);

export function createInput(target) {
  let up = false;
  let down = false;
  let left = false;
  let right = false;
  let actions = 0;
  // The pointer's last position in CSS pixels; null until the mouse first moves.
  let pointerX = null;
  let pointerY = null;
  // True while the pointer is down; the lantern keeps chasing the pointer while held.
  let pointerDown = false;

  function press(code) {
    if (UP.has(code)) up = true;
    else if (DOWN.has(code)) down = true;
    else if (LEFT.has(code)) left = true;
    else if (RIGHT.has(code)) right = true;
    else if (CONFIRM.has(code)) actions |= ACTION_CONFIRM;
    else if (FLARE.has(code)) actions |= ACTION_FLARE;
    else if (PAUSE.has(code)) actions |= ACTION_PAUSE;
    else if (MUTE.has(code)) actions |= ACTION_MUTE;
    else return false;
    return true;
  }

  function release(code) {
    if (UP.has(code)) up = false;
    else if (DOWN.has(code)) down = false;
    else if (LEFT.has(code)) left = false;
    else if (RIGHT.has(code)) right = false;
  }

  window.addEventListener('keydown', (event) => {
    if (press(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    release(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    up = false;
    down = false;
    left = false;
    right = false;
  });
  target.addEventListener('pointermove', (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
  });
  target.addEventListener('pointerdown', (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    pointerDown = true;
    // A click is both a confirm (start / restart) and a flare while playing.
    actions |= ACTION_CONFIRM | ACTION_FLARE;
  });
  window.addEventListener('pointerup', () => {
    pointerDown = false;
  });

  return {
    /** -1, 0 or 1 on each axis, from the held movement keys. */
    steer() {
      return { x: (right ? 1 : 0) - (left ? 1 : 0), y: (down ? 1 : 0) - (up ? 1 : 0) };
    },
    /** The pointer's last position in CSS pixels, or null before the first move. */
    pointer() {
      return pointerX === null ? null : { x: pointerX, y: pointerY };
    },
    /** Whether the pointer is currently held down. */
    pointerHeld() {
      return pointerDown;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
