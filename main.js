import { DEFAULT_SETTINGS, DIFFICULTIES, STORAGE_KEYS, TEXT } from './src/config.js?v=20260817o';
import { GameWorld } from './src/game.js?v=20260817o';

const elements = {
  titleScreen: document.getElementById('title-screen'),
  gameScreen: document.getElementById('game-screen'),
  resultScreen: document.getElementById('result-screen'),
  settingsScreen: document.getElementById('settings-screen'),
  canvas: document.getElementById('game-canvas'),
  start: document.getElementById('start-btn'),
  retry: document.getElementById('retry-btn'),
  returnTitle: document.getElementById('return-title-btn'),
  settings: document.getElementById('settings-btn'),
  closeSettings: document.getElementById('close-settings-btn'),
  pause: document.getElementById('pause-btn'),
  score: document.getElementById('score-value'),
  wave: document.getElementById('wave-value'),
  waveLabel: document.getElementById('wave-label'),
  hp: document.getElementById('hp-value'),
  toast: document.getElementById('message-toast'),
  resultTitle: document.getElementById('result-title'),
  resultKicker: document.getElementById('result-kicker'),
  resultCopy: document.getElementById('result-copy'),
  resultScore: document.getElementById('result-score'),
  resultHighScore: document.getElementById('result-high-score'),
  resultCombo: document.getElementById('result-combo'),
  newRecord: document.getElementById('new-record'),
  soundSlider: document.getElementById('sound-slider'),
  soundOutput: document.getElementById('sound-output'),
  shakeToggle: document.getElementById('shake-toggle'),
  difficultyCurrent: document.getElementById('difficulty-current'),
  resultDifficulty: document.getElementById('result-difficulty'),
  difficultyCards: [...document.querySelectorAll('[data-difficulty]')],
};

let settings = loadSettings();
let toastTimer = 0;

const game = new GameWorld(elements.canvas, {
  getSettings: () => settings,
  onHud: updateHud,
  onMessage: showMessage,
  onStateChange: handleGameState,
  onFinish: showResult,
});

game.setHighScore(getDifficultyHighScore());
applySettingsToUi();
renderDifficultySelection();
showScreen('title');

bindActivate(elements.start, startGame);
bindActivate(elements.retry, startGame);
bindActivate(elements.returnTitle, returnToTitle);
bindActivate(elements.settings, () => showScreen('settings'));
bindActivate(elements.closeSettings, () => showScreen('title'));
bindActivate(elements.pause, () => game.togglePause());
elements.difficultyCards.forEach((card) => {
  bindActivate(card, () => selectDifficulty(card.dataset.difficulty));
});

elements.soundSlider.addEventListener('input', () => {
  settings.sound = Number(elements.soundSlider.value) / 100;
  saveSettings();
  applySettingsToUi();
});

elements.shakeToggle.addEventListener('change', () => {
  settings.screenShake = elements.shakeToggle.checked;
  saveSettings();
});

bindTouchControls();
setupDemoMode();

document.addEventListener('visibilitychange', () => {
  if (document.hidden && ['intro', 'playing', 'bossWarning', 'boss'].includes(game.state)) game.togglePause();
});

function bindActivate(element, handler) {
  let lastTouchTime = -Infinity;
  element.addEventListener('touchend', (event) => {
    if (event.cancelable) event.preventDefault();
    lastTouchTime = performance.now();
    handler();
  }, { passive: false });
  element.addEventListener('click', (event) => {
    if (performance.now() - lastTouchTime < 700) {
      event.preventDefault();
      return;
    }
    handler();
  });
}

function startGame() {
  showScreen('game');
  game.start();
}

function returnToTitle() {
  game.reset();
  game.setHighScore(getDifficultyHighScore());
  renderDifficultySelection();
  showScreen('title');
}

function showScreen(name) {
  elements.titleScreen.classList.toggle('hidden', name !== 'title');
  elements.gameScreen.classList.toggle('hidden', name !== 'game');
  elements.resultScreen.classList.toggle('hidden', name !== 'result');
  elements.settingsScreen.classList.toggle('hidden', name !== 'settings');
}

function updateHud(snapshot) {
  elements.score.textContent = String(snapshot.score).padStart(7, '0');
  elements.waveLabel.textContent = `STAGE ${snapshot.stageIndex}/${snapshot.stageCount}`;
  elements.wave.textContent = `${String(snapshot.stageIndex).padStart(2, '0')}-${String(snapshot.wave).padStart(2, '0')}`;
  elements.hp.innerHTML = Array.from({ length: snapshot.maxHp }, (_, index) => `<span class="hp-pip ${index >= snapshot.hp ? 'empty' : ''}"></span>`).join('');
}

function handleGameState(state) {
  if (state === 'paused') {
    elements.pause.textContent = '▶';
    elements.pause.setAttribute('aria-label', '再開');
  } else {
    elements.pause.textContent = 'Ⅱ';
    elements.pause.setAttribute('aria-label', '一時停止');
  }
}

function showResult(result) {
  const cleared = result.result === 'clear';
  elements.resultKicker.textContent = cleared ? 'MISSION COMPLETE' : 'MISSION REPORT';
  elements.resultTitle.textContent = cleared ? '結界維持成功' : '結界崩壊';
  elements.resultCopy.textContent = cleared
    ? `第三結界までの穢れを浄化しました。月都の夜は、ひとまず静けさを取り戻します。全${result.stageCount}結界の復旧を確認。`
    : `第${result.stageIndex}結界で結界機《カグラ》が戦闘不能になりました。パターンを見極め、もう一度結界を展開してください。`;
  elements.resultScore.textContent = String(result.score).padStart(7, '0');
  elements.resultHighScore.textContent = String(result.highScore).padStart(7, '0');
  elements.resultCombo.textContent = `${result.combo}`;
  elements.resultDifficulty.textContent = `難易度: ${result.difficulty.shortLabel}　SCORE ×${result.difficulty.scoreMultiplier.toFixed(2)}`;
  elements.newRecord.classList.toggle('hidden', !result.isNewRecord);
  showScreen('result');
}

function showMessage(text, type = 'info') {
  clearTimeout(toastTimer);
  elements.toast.textContent = text;
  elements.toast.className = `message-toast ${type} show`;
  toastTimer = window.setTimeout(() => elements.toast.classList.remove('show'), 2500);
}

function bindTouchControls() {
  const touchCapable = navigator.maxTouchPoints > 0 || 'ontouchstart' in window || window.matchMedia('(pointer: coarse)').matches;
  document.documentElement.classList.toggle('touch-device', touchCapable);
  const usePointerEvents = 'PointerEvent' in window;

  document.querySelectorAll('[data-action]').forEach((button) => {
    const action = button.dataset.action;
    const activeInputs = new Set();
    const setHeld = (inputId, held) => {
      if (held) activeInputs.add(inputId);
      else activeInputs.delete(inputId);
      game.audio.unlock();
      game.input.setAction(action, activeInputs.size > 0);
      button.classList.toggle('is-held', activeInputs.size > 0);
    };
    const consume = (event) => {
      if (event.cancelable) event.preventDefault();
    };

    if (usePointerEvents) {
      const beginPointer = (event) => {
        consume(event);
        setHeld(`pointer-${event.pointerId}`, true);
        if (button.setPointerCapture) {
          try { button.setPointerCapture(event.pointerId); } catch { /* Safari may reject a stale pointer. */ }
        }
      };
      const endPointer = (event) => {
        consume(event);
        setHeld(`pointer-${event.pointerId}`, false);
      };
      button.addEventListener('pointerdown', beginPointer, { passive: false });
      button.addEventListener('pointerup', endPointer, { passive: false });
      button.addEventListener('pointercancel', endPointer, { passive: false });
      button.addEventListener('lostpointercapture', endPointer, { passive: false });
      window.addEventListener('pointerup', endPointer, { passive: false });
      window.addEventListener('pointercancel', endPointer, { passive: false });
    } else {
      const beginTouch = (event) => {
        consume(event);
        [...event.changedTouches].forEach((touch) => setHeld(`touch-${touch.identifier}`, true));
      };
      const endTouch = (event) => {
        consume(event);
        [...event.changedTouches].forEach((touch) => setHeld(`touch-${touch.identifier}`, false));
      };
      button.addEventListener('touchstart', beginTouch, { passive: false });
      button.addEventListener('touchend', endTouch, { passive: false });
      button.addEventListener('touchcancel', endTouch, { passive: false });
    }
    button.addEventListener('contextmenu', (event) => event.preventDefault());
  });

  bindCanvasTouchFallback(usePointerEvents);
  window.addEventListener('blur', () => game.input.clear());
}

function bindCanvasTouchFallback(usePointerEvents) {
  const activeTouches = new Map();
  const actionForPoint = (clientX) => {
    const rect = elements.canvas.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    if (ratio < 0.34) return 'moveLeft';
    if (ratio > 0.66) return 'moveRight';
    return 'fire';
  };
  const updateAction = (id, action, pressed) => {
    if (pressed) activeTouches.set(id, action);
    else activeTouches.delete(id);
    ['moveLeft', 'moveRight', 'fire'].forEach((name) => {
      game.input.setAction(name, [...activeTouches.values()].includes(name));
    });
    if (pressed) game.audio.unlock();
  };
  const consume = (event) => {
    if (event.cancelable) event.preventDefault();
  };

  if (usePointerEvents) {
    elements.canvas.addEventListener('pointerdown', (event) => {
      consume(event);
      updateAction(`canvas-${event.pointerId}`, actionForPoint(event.clientX), true);
      try { elements.canvas.setPointerCapture(event.pointerId); } catch { /* Browser fallback is handled by window events. */ }
    }, { passive: false });
    const releasePointer = (event) => updateAction(`canvas-${event.pointerId}`, '', false);
    elements.canvas.addEventListener('pointerup', releasePointer, { passive: false });
    elements.canvas.addEventListener('pointercancel', releasePointer, { passive: false });
    elements.canvas.addEventListener('lostpointercapture', releasePointer, { passive: false });
    window.addEventListener('pointerup', releasePointer, { passive: false });
    window.addEventListener('pointercancel', releasePointer, { passive: false });
  } else {
    elements.canvas.addEventListener('touchstart', (event) => {
      consume(event);
      [...event.changedTouches].forEach((touch) => updateAction(`canvas-${touch.identifier}`, actionForPoint(touch.clientX), true));
    }, { passive: false });
    const releaseTouch = (event) => {
      consume(event);
      [...event.changedTouches].forEach((touch) => updateAction(`canvas-${touch.identifier}`, '', false));
    };
    elements.canvas.addEventListener('touchend', releaseTouch, { passive: false });
    elements.canvas.addEventListener('touchcancel', releaseTouch, { passive: false });
  }
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) || '{}');
    const loaded = { ...DEFAULT_SETTINGS, ...saved };
    if (!DIFFICULTIES[loaded.difficulty]) loaded.difficulty = DEFAULT_SETTINGS.difficulty;
    return loaded;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
}

function applySettingsToUi() {
  const percent = Math.round(settings.sound * 100);
  elements.soundSlider.value = String(percent);
  elements.soundOutput.textContent = `${percent}%`;
  elements.shakeToggle.checked = settings.screenShake;
}

function currentDifficulty() {
  return DIFFICULTIES[settings.difficulty] || DIFFICULTIES.easy;
}

function getDifficultyHighScore() {
  return Number(localStorage.getItem(`${STORAGE_KEYS.highScore}-${currentDifficulty().key}`) || 0);
}

function selectDifficulty(key) {
  if (!DIFFICULTIES[key]) return;
  settings.difficulty = key;
  saveSettings();
  game.setHighScore(getDifficultyHighScore());
  renderDifficultySelection();
}

function renderDifficultySelection() {
  const difficulty = currentDifficulty();
  elements.difficultyCards.forEach((card) => {
    const selected = card.dataset.difficulty === difficulty.key;
    card.classList.toggle('is-selected', selected);
    card.setAttribute('aria-checked', String(selected));
  });
  elements.difficultyCurrent.textContent = difficulty.key === 'easy'
    ? `${difficulty.label} — 推奨`
    : `${difficulty.label} — SCORE ×${difficulty.scoreMultiplier.toFixed(2)}`;
}

function setupDemoMode() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('debug')) window.__kagekiriDebug = game;
  if (!params.has('demo')) return;
  const requestedDifficulty = params.get('difficulty');
  if (requestedDifficulty && DIFFICULTIES[requestedDifficulty]) selectDifficulty(requestedDifficulty);
  window.setTimeout(startGame, 180);
  const tick = (time) => {
    if (game.state === 'playing' || game.state === 'boss') {
      const direction = Math.sin(time / 980) > 0;
      game.input.setAction('moveLeft', !direction);
      game.input.setAction('moveRight', direction);
      game.input.setAction('fire', true);
      if (game.player.canSkill()) game.input.setAction('skill', true);
    } else {
      game.input.setAction('moveLeft', false);
      game.input.setAction('moveRight', false);
      game.input.setAction('fire', false);
      game.input.setAction('skill', false);
    }
    window.requestAnimationFrame(tick);
  };
  window.requestAnimationFrame(tick);
}

window.addEventListener('beforeunload', () => game.dispose());

document.title = `${TEXT.title} — ${TEXT.subtitle}`;
