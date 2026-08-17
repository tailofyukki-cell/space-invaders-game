import { DEFAULT_SETTINGS, DIFFICULTIES, STORAGE_KEYS, TEXT } from './src/config.js';
import { GameWorld } from './src/game.js';

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

elements.start.addEventListener('click', startGame);
elements.retry.addEventListener('click', startGame);
elements.returnTitle.addEventListener('click', returnToTitle);
elements.settings.addEventListener('click', () => showScreen('settings'));
elements.closeSettings.addEventListener('click', () => showScreen('title'));
elements.pause.addEventListener('click', () => game.togglePause());
elements.difficultyCards.forEach((card) => {
  card.addEventListener('click', () => selectDifficulty(card.dataset.difficulty));
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
  document.querySelectorAll('[data-action]').forEach((button) => {
    const action = button.dataset.action;
    const begin = (event) => {
      event.preventDefault();
      game.audio.unlock();
      game.input.setAction(action, true);
      button.classList.add('is-held');
      if (button.setPointerCapture && event.pointerId !== undefined) button.setPointerCapture(event.pointerId);
    };
    const end = (event) => {
      event.preventDefault();
      game.input.setAction(action, false);
      button.classList.remove('is-held');
    };
    button.addEventListener('pointerdown', begin);
    button.addEventListener('pointerup', end);
    button.addEventListener('pointercancel', end);
    button.addEventListener('pointerleave', end);
    button.addEventListener('contextmenu', (event) => event.preventDefault());
  });
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
  if (!params.has('demo')) return;
  const requestedDifficulty = params.get('difficulty');
  if (requestedDifficulty && DIFFICULTIES[requestedDifficulty]) selectDifficulty(requestedDifficulty);
  if (params.has('debug')) window.__kagekiriDebug = game;
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
