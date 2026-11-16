// Drawing only: the world's state and the current screen in, pixels out. The 960x600
// playfield is scaled to fit the window and centred, the margin filled with the backdrop
// colour. The lantern is a warm radial glow, the wisps are dark blobs with violet eyes, the
// motes are pulsing golden stars, and every burn leaves an expanding orange ring.

import { FIELD, FONT, LANTERN, PALETTE, WAVES } from './config.js';
import { KIND_DART, KIND_WEAVE, STATUS_LOST, STATUS_WON } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_WIN = 'win';
export const SCREEN_OVER = 'over';

/** The panel's width; its height grows with its lines. */
const PANEL = { width: 640, top: 150, line: 32, bottom: 76 };
const BAR = { x: 24, y: 22, width: 220, height: 18 };

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

function formatTime(seconds) {
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('SCORE ');
  const waveLabel = cachedLabel('WAVE ');
  const bestLabel = cachedLabel('BEST ');
  const finalLabel = cachedLabel('SCORE ');
  const moteLabel = cachedLabel('MOTES ');
  const timeLabel = cachedLabel('TIME ');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  /** Convert a CSS-pixel pointer position to field units. */
  function toField(clientX, clientY) {
    const ratio = window.devicePixelRatio || 1;
    return {
      x: (clientX * ratio - view.x) / view.scale,
      y: (clientY * ratio - view.y) / view.scale,
    };
  }

  function drawBackground(state) {
    const gradient = context.createLinearGradient(0, 0, 0, FIELD.height);
    gradient.addColorStop(0, PALETTE.field);
    gradient.addColorStop(1, PALETTE.fieldEdge);
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    // Drifting embers: tiny warm sparks rising through the dark.
    for (const ember of state.embers) {
      const twinkle = 0.6 + 0.4 * Math.sin(ember.flicker);
      context.globalAlpha = ember.alpha * twinkle;
      context.fillStyle = PALETTE.ember;
      context.beginPath();
      context.arc(ember.x, ember.y, ember.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawMotes(state) {
    for (const mote of state.motes) {
      if (!mote.active) continue;
      const pulse = 1 + 0.25 * Math.sin(mote.pulse);
      const size = 11 * pulse;
      const glow = context.createRadialGradient(mote.x, mote.y, 0, mote.x, mote.y, size * 2.4);
      glow.addColorStop(0, 'rgba(255, 215, 106, 0.55)');
      glow.addColorStop(1, 'rgba(255, 215, 106, 0)');
      context.fillStyle = glow;
      context.beginPath();
      context.arc(mote.x, mote.y, size * 2.4, 0, Math.PI * 2);
      context.fill();
      // A four-point star.
      context.fillStyle = PALETTE.gold;
      context.beginPath();
      context.moveTo(mote.x, mote.y - size);
      context.quadraticCurveTo(mote.x, mote.y, mote.x + size, mote.y);
      context.quadraticCurveTo(mote.x, mote.y, mote.x, mote.y + size);
      context.quadraticCurveTo(mote.x, mote.y, mote.x - size, mote.y);
      context.quadraticCurveTo(mote.x, mote.y, mote.x, mote.y - size);
      context.fill();
      context.fillStyle = '#fff7dd';
      context.beginPath();
      context.arc(mote.x, mote.y, size * 0.28, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawWisps(state) {
    for (const wisp of state.wisps) {
      if (!wisp.active) continue;
      const burning = wisp.burn > 0;
      const shrink = burning ? 0.7 + 0.3 * (wisp.burn / 0.5) : 1;
      const size = wisp.size * shrink;
      // A wobbly dark blob: a circle whose edge breathes with the wisp's angle.
      context.beginPath();
      const points = 10;
      for (let index = 0; index <= points; index += 1) {
        const angle = (index / points) * Math.PI * 2;
        const wobble = 1 + 0.14 * Math.sin(angle * 3 + wisp.angle * 2);
        const px = wisp.x + Math.cos(angle) * size * wobble;
        const py = wisp.y + Math.sin(angle) * size * wobble;
        if (index === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.closePath();
      context.fillStyle = burning ? '#3d1c10' : PALETTE.wisp;
      context.fill();
      context.strokeStyle = burning ? PALETTE.ember : PALETTE.wispEdge;
      context.lineWidth = 2;
      context.stroke();
      // Two glowing violet eyes that watch the lantern.
      const eyeOffset = size * 0.34;
      const eyeY = wisp.y - size * 0.12;
      const eyeR = Math.max(2, size * 0.13);
      const glow = context.createRadialGradient(wisp.x, eyeY, 0, wisp.x, eyeY, size);
      glow.addColorStop(0, burning ? 'rgba(255, 122, 47, 0.5)' : 'rgba(139, 92, 246, 0.4)');
      glow.addColorStop(1, 'rgba(139, 92, 246, 0)');
      context.fillStyle = glow;
      context.beginPath();
      context.arc(wisp.x, eyeY, size, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = burning ? PALETTE.ember : PALETTE.violet;
      context.beginPath();
      context.arc(wisp.x - eyeOffset, eyeY, eyeR, 0, Math.PI * 2);
      context.arc(wisp.x + eyeOffset, eyeY, eyeR, 0, Math.PI * 2);
      context.fill();
      // Dart wisps show a small horn so the player can tell them apart.
      if (wisp.kind === KIND_DART) {
        context.fillStyle = PALETTE.violetDeep;
        context.beginPath();
        context.moveTo(wisp.x - size * 0.3, wisp.y - size * 0.8);
        context.lineTo(wisp.x, wisp.y - size * 1.35);
        context.lineTo(wisp.x + size * 0.3, wisp.y - size * 0.8);
        context.closePath();
        context.fill();
      } else if (wisp.kind === KIND_WEAVE) {
        // Weave wisps trail a faint violet ribbon.
        context.strokeStyle = 'rgba(139, 92, 246, 0.35)';
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(wisp.x - size, wisp.y + size * 0.5);
        context.quadraticCurveTo(wisp.x, wisp.y + size * 1.1, wisp.x + size, wisp.y + size * 0.5);
        context.stroke();
      }
    }
  }

  function drawLantern(state, lightRadius) {
    const lantern = state.lantern;
    // The lit ground: a soft pool of gold that follows the light's reach.
    const pool = context.createRadialGradient(lantern.x, lantern.y, 0, lantern.x, lantern.y, lightRadius);
    pool.addColorStop(0, 'rgba(255, 215, 106, 0.16)');
    pool.addColorStop(0.7, 'rgba(255, 215, 106, 0.07)');
    pool.addColorStop(1, 'rgba(255, 215, 106, 0)');
    context.fillStyle = pool;
    context.beginPath();
    context.arc(lantern.x, lantern.y, lightRadius, 0, Math.PI * 2);
    context.fill();
    // The glow itself: a warm halo around the orb.
    const halo = context.createRadialGradient(lantern.x, lantern.y, 0, lantern.x, lantern.y, 64);
    halo.addColorStop(0, 'rgba(255, 215, 106, 0.85)');
    halo.addColorStop(0.4, 'rgba(255, 170, 60, 0.35)');
    halo.addColorStop(1, 'rgba(255, 170, 60, 0)');
    context.fillStyle = halo;
    context.beginPath();
    context.arc(lantern.x, lantern.y, 64, 0, Math.PI * 2);
    context.fill();
    // The orb: a bright core with a little flame dancing on top.
    const core = context.createRadialGradient(
      lantern.x - 4, lantern.y - 5, 0, lantern.x, lantern.y, LANTERN.coreRadius,
    );
    core.addColorStop(0, '#fffbe8');
    core.addColorStop(0.55, PALETTE.gold);
    core.addColorStop(1, PALETTE.goldDeep);
    context.fillStyle = core;
    context.beginPath();
    context.arc(lantern.x, lantern.y, LANTERN.coreRadius - 6, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(60, 35, 5, 0.55)';
    context.lineWidth = 2;
    context.stroke();
    const flicker = Math.sin(state.elapsed * 9) * 2;
    context.fillStyle = PALETTE.ember;
    context.beginPath();
    context.moveTo(lantern.x, lantern.y - 30 + flicker);
    context.quadraticCurveTo(lantern.x + 7, lantern.y - 18, lantern.x + 3, lantern.y - 10);
    context.quadraticCurveTo(lantern.x, lantern.y - 6, lantern.x - 3, lantern.y - 10);
    context.quadraticCurveTo(lantern.x - 7, lantern.y - 18, lantern.x, lantern.y - 30 + flicker);
    context.fill();
  }

  function drawSparks(state) {
    for (const spark of state.sparks) {
      if (!spark.active) continue;
      const progress = spark.age / spark.life;
      const radius = 6 + progress * spark.maxR;
      context.globalAlpha = 1 - progress;
      context.strokeStyle = PALETTE.ember;
      context.lineWidth = 3 * (1 - progress) + 1;
      context.beginPath();
      context.arc(spark.x, spark.y, radius, 0, Math.PI * 2);
      context.stroke();
      context.globalAlpha = (1 - progress) * 0.7;
      context.fillStyle = PALETTE.gold;
      context.beginPath();
      context.arc(spark.x, spark.y, 3, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawFlameIcon(x, y, size, lit) {
    context.fillStyle = lit ? PALETTE.ember : 'rgba(147, 160, 189, 0.35)';
    context.beginPath();
    context.moveTo(x, y - size);
    context.quadraticCurveTo(x + size * 0.7, y - size * 0.2, x + size * 0.3, y + size * 0.5);
    context.quadraticCurveTo(x, y + size * 0.8, x - size * 0.3, y + size * 0.5);
    context.quadraticCurveTo(x - size * 0.7, y - size * 0.2, x, y - size);
    context.fill();
    if (lit) {
      context.fillStyle = PALETTE.gold;
      context.beginPath();
      context.arc(x, y + size * 0.1, size * 0.28, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawHud(state, lightRadius) {
    const lantern = state.lantern;
    const low = lantern.light < 30;
    context.textBaseline = 'top';
    // Light meter, top-left.
    text('LIGHT', BAR.x, BAR.y - 2, 15, low ? PALETTE.danger : PALETTE.muted, 'left');
    context.fillStyle = 'rgba(19, 26, 46, 0.9)';
    context.fillRect(BAR.x, BAR.y + 16, BAR.width, BAR.height);
    const fillWidth = (BAR.width * lantern.light) / 100;
    const barGradient = context.createLinearGradient(BAR.x, 0, BAR.x + BAR.width, 0);
    barGradient.addColorStop(0, PALETTE.goldDeep);
    barGradient.addColorStop(1, PALETTE.gold);
    context.fillStyle = low && Math.floor(state.elapsed * 4) % 2 === 0 ? PALETTE.danger : barGradient;
    if (fillWidth > 0) context.fillRect(BAR.x, BAR.y + 16, fillWidth, BAR.height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 1;
    context.strokeRect(BAR.x, BAR.y + 16, BAR.width, BAR.height);
    // Flare charges under the light meter.
    for (let index = 0; index < LANTERN.flareMax; index += 1) {
      drawFlameIcon(BAR.x + 12 + index * 26, BAR.y + 56, 9, index < lantern.flareCharges);
    }
    text('FLARE — SPACE / CLICK', BAR.x + 86, BAR.y + 48, 13, PALETTE.muted, 'left');
    // Wave, top-centre.
    text(waveLabel(state.wave) + ` / ${WAVES}`, FIELD.width / 2, BAR.y, 24, PALETTE.text, 'center');
    text(state.waveState === 'calm' ? 'CALM — GATHER MOTES' : 'THE DARK APPROACHES', FIELD.width / 2, BAR.y + 30, 13, PALETTE.muted, 'center');
    // Score and motes, top-right.
    text(scoreLabel(state.score), FIELD.width - 24, BAR.y, 24, PALETTE.text, 'right');
    text(moteLabel(state.motesCollected), FIELD.width - 24, BAR.y + 30, 15, PALETTE.gold, 'right');
    // A thin ring marks the light's reach when the light runs low.
    if (low) {
      context.globalAlpha = 0.35 + 0.2 * Math.sin(state.elapsed * 6);
      context.strokeStyle = PALETTE.danger;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(lantern.x, lantern.y, lightRadius, 0, Math.PI * 2);
      context.stroke();
      context.globalAlpha = 1;
    }
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(7, 10, 19, 0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 78, 46, PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 20, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 38, 22, PALETTE.gold, 'center');
  }

  function drawVignette() {
    const gradient = context.createRadialGradient(
      FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.42,
      FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.95,
    );
    gradient.addColorStop(0, 'rgba(7, 10, 19, 0)');
    gradient.addColorStop(1, 'rgba(7, 10, 19, 0.55)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  /** Paint one frame: the field, the lantern and its light, then the HUD or a panel. */
  function draw(state, screen, best, lightRadius) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * 6 * state.shake : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * 6 * state.shake : 0;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX, view.y + shakeY);
    drawBackground(state);
    drawMotes(state);
    drawWisps(state);
    drawLantern(state, lightRadius);
    drawSparks(state);
    drawVignette();
    if (state.flash > 0) {
      context.globalAlpha = state.flash * 0.9;
      context.fillStyle = '#ffe9a8';
      context.fillRect(0, 0, FIELD.width, FIELD.height);
      context.globalAlpha = 1;
    }
    if (screen === SCREEN_TITLE) {
      const lines = [
        'You are the keeper of the last lantern.',
        'Burn the dark. Gather the light. Survive 10 waves.',
        '',
        'Move the lantern with the mouse or WASD / arrows.',
        'Wisps burn in your light — but a fast one can strike your core.',
        'Motes feed the flame. Space or click fires a flare.',
        '',
        best > 0 ? bestLabel(best) : 'No keeper has scored yet.',
      ];
      drawPanel('LUMENKEEPER', lines, 'Press Space or click to start');
      return;
    }
    drawHud(state, lightRadius);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The dark waits for no one — except now.'], 'Press P to resume');
    } else if (screen === SCREEN_WIN) {
      const lines = [
        `The light endures. All ${WAVES} waves survived.`,
        '',
        finalLabel(state.score),
        timeLabel(formatTime(state.elapsed)),
        bestLabel(best),
      ];
      drawPanel('Victory', lines, 'Press Space or click to play again');
    } else if (screen === SCREEN_OVER) {
      const lines = [
        state.status === STATUS_LOST ? 'The dark takes the light.' : '',
        '',
        finalLabel(state.score),
        `Reached wave ${state.wave} of ${WAVES}.`,
        bestLabel(best),
      ];
      drawPanel('Game over', lines, 'Press Space or click to try again');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toField };
}
