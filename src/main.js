import { Game } from './game/game.js';
import { UI } from './game/ui.js';

const ui = new UI();
const canvas = document.getElementById('game-canvas');
const game = new Game(canvas, ui);

const startBtn = document.getElementById('start-btn');
const howToBtn = document.getElementById('how-to-btn');
const tutorialStart = document.getElementById('tutorial-start');
const pauseBtn = document.getElementById('pause-btn');
const muteBtn = document.getElementById('mute-btn');
const soundToggle = document.getElementById('sound-toggle');
const resumeBtn = document.getElementById('resume-btn');
const restartBtn = document.getElementById('restart-btn');
const quitBtn = document.getElementById('quit-btn');
const rematchBtn = document.getElementById('rematch-btn');
const menuBtn = document.getElementById('menu-btn');
const difficultyList = document.getElementById('difficulty-list');

let tutorialStartsMatch = false;

function setTutorialButtonLabel(label) {
  const text = tutorialStart.querySelector('span:first-child');
  if (text) text.textContent = label;
}

function openTutorial(startAfter) {
  tutorialStartsMatch = startAfter;
  setTutorialButtonLabel(startAfter ? '开始对打' : '知道了');
  ui.showTutorial();
  game.audio.init();
  game.audio.ui();
}

function startFromMenu() {
  ui.markTutorialSeen();
  ui.hideTutorial();
  game.startMatch(game.difficultyKey);
}

startBtn.addEventListener('click', () => {
  game.audio.init();
  game.audio.ui();
  if (!ui.tutorialSeen) {
    openTutorial(true);
  } else {
    startFromMenu();
  }
});

howToBtn.addEventListener('click', () => {
  openTutorial(false);
});

tutorialStart.addEventListener('click', () => {
  if (tutorialStartsMatch) {
    startFromMenu();
  } else {
    ui.markTutorialSeen();
    ui.hideTutorial();
    ui.showMenu();
  }
});

difficultyList.addEventListener('click', (event) => {
  const card = event.target.closest('.difficulty-card');
  if (!card) return;
  game.setDifficulty(card.dataset.difficulty);
  game.audio.init();
  game.audio.ui();
});

function toggleSound() {
  game.toggleMute();
  game.audio.ui();
}

muteBtn.addEventListener('click', toggleSound);
soundToggle.addEventListener('click', toggleSound);

pauseBtn.addEventListener('click', () => {
  game.pause();
});

resumeBtn.addEventListener('click', () => {
  game.resume();
  game.audio.ui();
});

restartBtn.addEventListener('click', () => {
  game.restart();
  game.audio.ui();
});

quitBtn.addEventListener('click', () => {
  game.quitToMenu();
  game.audio.ui();
});

rematchBtn.addEventListener('click', () => {
  game.restart();
  game.audio.ui();
});

menuBtn.addEventListener('click', () => {
  game.quitToMenu();
  game.audio.ui();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    if (game.state === 'paused') game.resume();
    else if (game.state === 'serve' || game.state === 'rally' || game.state === 'point') {
      game.pause();
    }
  }
  if (event.key === 'm' || event.key === 'M') {
    toggleSound();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && ['serve', 'rally', 'point'].includes(game.state)) {
    game.pause();
  }
});

window.addEventListener('blur', () => {
  if (['serve', 'rally', 'point'].includes(game.state)) {
    game.pause();
  }
});

ui.setMuted(false);
ui.setDifficulty(game.difficultyKey);
game.start();

requestAnimationFrame(() => {
  window.setTimeout(() => ui.loadingDone(), 220);
});

window.__pingpong = {
  game,
  start: (difficulty = 'normal') => game.startMatch(difficulty),
  pause: () => game.pause(),
  resume: () => game.resume(),
  state: () => game.getDebugState(),
  setMouse: (nx, ny) => game.input.setVirtualPosition(nx, ny),
  swingDown: () => {
    game.handlePointerDown();
  },
  swingUp: () => {
    game.handlePointerUp();
  },
  forceServe: () => {
    if (game.state !== 'serve' || game.server !== 'player') return false;
    if (game.serveState === 'waiting_player') game.startToss('player');
    else if (game.serveState === 'tossing_player') game.tryHitToss('player');
    return true;
  },
  advance: (seconds) => game.advance(seconds),
};
