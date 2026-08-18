import { COLORS, ENEMY_TYPES, GAME_HEIGHT, GAME_WIDTH, STAGES, STORAGE_KEYS, clamp, getDifficulty, rand, rectsOverlap } from './config.js';
import { Barrier, Boss, Enemy, SpecialPickup, Particle, Player } from './entities.js';

const TORII_GATE_LANES = Object.freeze([
  { x: 242, width: 112, gateX: 278, gateY: 228, scale: 0.86 },
  { x: 424, width: 112, gateX: 480, gateY: 196, scale: 1 },
  { x: 606, width: 112, gateX: 682, gateY: 228, scale: 0.86 },
]);

const SPRITE_SOURCES = Object.freeze({
  kagura: 'assets/sprites/kagura.png',
  oni: 'assets/sprites/oni.png',
  kitsune: 'assets/sprites/kitsune.png',
  chochin: 'assets/sprites/chochin.png',
  hebi: 'assets/sprites/hebi.png',
  tengu: 'assets/sprites/tengu.png',
  orochi: 'assets/sprites/orochi.png',
  kappa: 'assets/sprites/kappa.png',
  yatagarasu: 'assets/sprites/yatagarasu.png',
});

export class InputManager {
  constructor() {
    this.actions = {
      moveLeft: false,
      moveRight: false,
      fire: false,
      skill: false,
      pause: false,
    };
    this.keyMap = {
      ArrowLeft: 'moveLeft',
      KeyA: 'moveLeft',
      ArrowRight: 'moveRight',
      KeyD: 'moveRight',
      Space: 'fire',
      KeyZ: 'fire',
      ShiftLeft: 'skill',
      ShiftRight: 'skill',
      KeyX: 'skill',
      Escape: 'pause',
      KeyP: 'pause',
    };
    this.onPauseRequest = null;
    this.onInteract = null;
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp, { passive: false });
  }

  onKeyDown(event) {
    const action = this.keyMap[event.code];
    if (!action) return;
    event.preventDefault();
    if (action === 'pause' && !event.repeat) {
      this.onPauseRequest?.();
      return;
    }
    this.actions[action] = true;
    this.onInteract?.();
  }

  onKeyUp(event) {
    const action = this.keyMap[event.code];
    if (!action) return;
    event.preventDefault();
    if (action !== 'pause') this.actions[action] = false;
  }

  setAction(action, value) {
    if (action in this.actions && action !== 'pause') {
      this.actions[action] = value;
      if (value) this.onInteract?.();
    }
  }

  clear() {
    Object.keys(this.actions).forEach((key) => { this.actions[key] = false; });
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }
}

export class AudioManager {
  constructor(getSettings) {
    this.getSettings = getSettings;
    this.ctx = null;
  }

  unlock() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      this.ctx = new AudioContextClass();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  tone(freq, duration, type = 'sine', gain = 0.06, slide = 0) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const volume = this.getSettings().sound ?? 0.55;
    if (volume <= 0) return;
    const now = this.ctx.currentTime;
    const oscillator = this.ctx.createOscillator();
    const envelope = this.ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, now);
    if (slide !== 0) oscillator.frequency.exponentialRampToValueAtTime(Math.max(28, freq + slide), now + duration);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(gain * volume, now + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(envelope).connect(this.ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }

  shoot() { this.tone(520, 0.08, 'square', 0.06, 160); }
  hit() { this.tone(210, 0.15, 'sawtooth', 0.07, -100); }
  destroy() { this.tone(180, 0.22, 'triangle', 0.09, 280); }
  skill() { this.tone(150, 0.6, 'sine', 0.12, 760); }
  boss() { this.tone(90, 0.72, 'sawtooth', 0.11, 55); }
  clear() { this.tone(440, 0.75, 'triangle', 0.09, 450); }
  heal() { this.tone(330, 0.34, 'sine', 0.09, 520); }
  boost() { this.tone(470, 0.42, 'triangle', 0.1, 760); }
  shield() { this.tone(240, 0.54, 'sine', 0.11, 380); }
  shieldHit() { this.tone(680, 0.12, 'sine', 0.06, -210); }
  thunderCharge() { this.tone(180, 0.48, 'sawtooth', 0.07, 520); }
  thunderStrike() { this.tone(95, 0.24, 'square', 0.12, -48); }
}

export class GameWorld {
  constructor(canvas, { onHud, onMessage, onStateChange, onFinish, getSettings }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onHud = onHud;
    this.onMessage = onMessage;
    this.onStateChange = onStateChange;
    this.onFinish = onFinish;
    this.getSettings = getSettings;
    this.input = new InputManager();
    this.audio = new AudioManager(getSettings);
    this.input.onInteract = () => this.audio.unlock();
    this.input.onPauseRequest = () => this.togglePause();
    this.renderer = new CanvasRenderer(this.ctx);
    this.running = false;
    this.lastTime = 0;
    this.raf = 0;
    this.reset();
    this.resize();
    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
  }

  reset() {
    this.state = 'title';
    this.stageIndex = 0;
    this.stage = STAGES[this.stageIndex];
    this.waveIndex = 0;
    this.waveDelay = 0;
    this.difficulty = getDifficulty(this.getSettings().difficulty);
    this.player = new Player(this.difficulty);
    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.specialItems = [];
    this.barriers = [];
    this.boss = null;
    this.skillPulse = null;
    this.formation = { offsetX: 0, direction: 1, speed: 32, drop: 0, minX: 100, maxX: 860 };
    this.score = 0;
    this.scoreBoostTimer = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.highScore = 0;
    this.elapsed = 0;
    this.shake = 0;
    this.flash = 0;
    this.banner = null;
    this.bossWarning = 0;
    this.stageTransition = 0;
    this.stageIntroEffect = 0;
    this.bossEntranceEffect = 0;
    this.stageRestoreEffect = 0;
    this.warningPulse = 0;
    this.bossPhaseEffect = 0;
    this.bossDefeatEffect = 0;
    this.bossDefeatOrigin = null;
    this.toriiLightningEffect = null;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(GAME_WIDTH * dpr);
    this.canvas.height = Math.floor(GAME_HEIGHT * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
  }

  setHighScore(score) {
    this.highScore = score;
  }

  start() {
    this.audio.unlock();
    this.reset();
    this.state = 'intro';
    this.highScore = Number(localStorage.getItem(this.highScoreKey()) || 0);
    this.createBarriers();
    this.stageIntroEffect = 2.7;
    this.banner = { title: `${this.stage.chapter} — ${this.stage.name}`, text: this.stage.intro, time: 2.7, maxTime: 2.7 };
    this.onMessage?.(`${this.difficulty.label}任務を開始します。第一結界を維持してください。`, 'info');
    this.onStateChange?.('playing');
    this.ensureLoop();
  }

  createBarriers() {
    this.barriers = [150, 340, 530, 720].map((x) => new Barrier(x, this.difficulty));
  }

  highScoreKey() {
    return `${STORAGE_KEYS.highScore}-${this.difficulty.key}`;
  }

  ensureLoop() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame((time) => this.loop(time));
  }

  loop(time) {
    const dt = Math.min(0.033, Math.max(0, (time - this.lastTime) / 1000));
    this.lastTime = time;
    this.update(dt);
    this.renderer.render(this);
    this.raf = requestAnimationFrame((next) => this.loop(next));
  }

  update(dt) {
    if (this.state === 'paused' || this.state === 'title' || this.state === 'gameOver' || this.state === 'clear') {
      this.updateHud();
      return;
    }
    this.elapsed += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.shake = Math.max(0, this.shake - dt * 2.4);
    this.stageIntroEffect = Math.max(0, this.stageIntroEffect - dt);
    this.bossEntranceEffect = Math.max(0, this.bossEntranceEffect - dt);
    this.stageRestoreEffect = Math.max(0, this.stageRestoreEffect - dt);
    this.warningPulse = Math.max(0, this.warningPulse - dt);
    this.bossPhaseEffect = Math.max(0, this.bossPhaseEffect - dt);
    this.bossDefeatEffect = Math.max(0, this.bossDefeatEffect - dt);
    if (this.toriiLightningEffect) {
      this.toriiLightningEffect.time = Math.max(0, this.toriiLightningEffect.time - dt);
      if (this.toriiLightningEffect.time <= 0) this.toriiLightningEffect = null;
    }
    this.scoreBoostTimer = Math.max(0, this.scoreBoostTimer - dt);
    if (this.banner) {
      this.banner.time -= dt;
      if (this.banner.time <= 0) this.banner = null;
    }

    if (this.state === 'intro') {
      if (!this.banner) this.beginWave();
      this.updateHud();
      return;
    }

    if (this.state === 'bossWarning') {
      this.bossWarning -= dt;
      if (this.bossWarning <= 0) this.spawnBoss();
      this.updateHud();
      return;
    }

    if (this.state === 'stageClear') {
      this.stageTransition -= dt;
      if (this.stageTransition <= 0) this.beginNextStage();
      this.updateHud();
      return;
    }

    this.player.update(dt, this.input.actions);
    if (this.input.actions.fire && this.player.canFire()) this.playerFire();
    if (this.input.actions.skill && this.player.canSkill()) this.activateSkill();

    this.updateFormation(dt);
    this.updateEnemies(dt);
    this.updateBoss(dt);
    this.updateProjectiles(dt);
    this.updateSpecialItems(dt);
    this.updateSkill(dt);
    this.updateParticles(dt);
    this.resolveCollisions();
    this.cleanup();
    this.updateCombo(dt);
    this.checkProgress(dt);
    this.updateHud();
  }

  updateFormation(dt) {
    if (this.state !== 'playing' || this.enemies.length === 0) return;
    const active = this.enemies.filter((enemy) => !enemy.dead && !enemy.diving);
    if (active.length === 0) return;
    const left = Math.min(...active.map((enemy) => enemy.x));
    const right = Math.max(...active.map((enemy) => enemy.x + enemy.w));
    const speed = (this.formation.speed + (this.waveIndex * 7) + Math.min(55, (48 - active.length) * 1.1)) * this.difficulty.formationSpeed * this.stage.tuning.formation;
    if (right >= GAME_WIDTH - 48 && this.formation.direction > 0) {
      this.formation.direction = -1;
      this.formation.drop += 13;
    }
    if (left <= 42 && this.formation.direction < 0) {
      this.formation.direction = 1;
      this.formation.drop += 13;
    }
    this.formation.offsetX += speed * this.formation.direction * dt;
    if (this.formation.drop > 0) {
      this.enemies.forEach((enemy) => { enemy.homeY += 36; });
      this.formation.drop = 0;
    }
  }

  updateEnemies(dt) {
    this.enemies.forEach((enemy) => {
      if (enemy.dead) return;
      enemy.update(dt, this.formation);
      if (enemy.readyToFire() && (enemy.diving || Math.random() < 0.58)) {
        this.projectiles.push(...enemy.fire());
      }
      if (enemy.y + enemy.h >= this.player.y - 8 && !enemy.diving) {
        this.finish('gameOver');
      }
    });
  }

  updateBoss(dt) {
    if (!this.boss || this.boss.dead) return;
    const shots = this.boss.update(dt);
    if (shots.length) this.projectiles.push(...shots);
    this.boss.consumeEvents().forEach((event) => this.handleBossEvent(event));
  }

  handleBossEvent(event) {
    if (event.type === 'torii-telegraph') {
      this.banner = { title: '月喰みの門', text: '鳥居の点灯したレーンから退避せよ。', time: Math.min(1.15, event.duration + 0.25), maxTime: Math.min(1.15, event.duration + 0.25) };
      this.warningPulse = Math.max(this.warningPulse, event.duration);
      this.audio.thunderCharge();
      this.onMessage?.('《月喰みの門》— 点灯した鳥居の直下から退避してください。', 'danger');
      return;
    }
    if (event.type === 'torii-lightning') this.resolveToriiLightning(event.lane, event.damage);
  }

  resolveToriiLightning(laneIndex, damage) {
    const lane = TORII_GATE_LANES[laneIndex];
    if (!lane) return;
    this.toriiLightningEffect = { lane: laneIndex, time: 0.24, maxTime: 0.24 };
    const playerCenter = this.player.x + this.player.w / 2;
    if (playerCenter >= lane.x && playerCenter <= lane.x + lane.width) this.applyPlayerDamage(damage, lane.x + lane.width / 2, this.player.y + this.player.h / 2, '雷光');
    this.addParticles(lane.x + lane.width / 2, 210, COLORS.gold, 24, { life: 0.42, size: 4, vy: 95 });
    this.shake = Math.max(this.shake, 0.48);
    this.flash = Math.max(this.flash, 0.24);
    this.audio.thunderStrike();
  }

  applyPlayerDamage(damage, impactX, impactY, source = '敵弾') {
    if (this.player.isShielded()) {
      if (this.player.absorbBarrierHit()) {
        const x = this.player.x + this.player.w / 2;
        const y = this.player.y + this.player.h / 2;
        this.addParticles(x, y, COLORS.cyan, 18, { life: 0.38, size: 4 });
        this.shake = Math.max(this.shake, 0.16);
        this.audio.shieldHit();
      }
      return;
    }
    if (this.player.takeDamage(damage)) {
      this.shake = Math.max(this.shake, 0.45);
      this.flash = Math.max(this.flash, 0.2);
      this.combo = 0;
      this.addParticles(impactX, impactY, COLORS.crimson, 28, { life: 0.55, size: 4 });
      this.audio.hit();
      this.onMessage?.(`${source}を受けました。HPを確認してください。`, 'danger');
    }
  }

  updateProjectiles(dt) {
    this.projectiles.forEach((projectile) => projectile.update(dt));
  }

  updateSpecialItems(dt) {
    this.specialItems.forEach((item) => item.update(dt));
  }

  updateSkill(dt) {
    if (!this.skillPulse) return;
    this.skillPulse.time += dt;
    const p = this.skillPulse;
    p.radius = p.maxRadius * Math.min(1, p.time / p.duration);
    if (p.time >= p.duration) this.skillPulse = null;
  }

  updateParticles(dt) {
    this.particles.forEach((particle) => particle.update(dt));
  }

  getEffectiveScoreMultiplier() {
    return this.difficulty.scoreMultiplier * (this.scoreBoostTimer > 0 ? 2 : 1);
  }

  playerFire() {
    this.projectiles.push(...this.player.fire());
    this.addParticles(this.player.x + this.player.w / 2, this.player.y, COLORS.cyan, 4, { vy: 70, vx: 0, size: 2 });
    this.audio.shoot();
  }

  activateSkill() {
    this.input.actions.skill = false;
    this.skillPulse = this.player.useSkill();
    this.projectiles.filter((projectile) => projectile.faction === 'enemy').forEach((projectile) => {
      projectile.dead = true;
      this.addParticles(projectile.x, projectile.y, COLORS.violet, 3);
    });
    this.enemies.forEach((enemy) => {
      if (!enemy.dead && Math.abs(enemy.x - this.player.x) < 420 && enemy.y > 20) this.damageEnemy(enemy, 3.4, true);
    });
    if (this.boss && !this.boss.dead) this.damageBoss(14, true);
    this.addParticles(this.skillPulse.x, this.skillPulse.y, COLORS.cyan, 55, { life: 0.72, size: 4 });
    this.flash = 0.18;
    this.shake = 0.35;
    this.audio.skill();
    this.onMessage?.('結界解放 — 穢れを祓いました。', 'skill');
  }

  resolveCollisions() {
    const playerRect = this.player;
    this.projectiles.forEach((projectile) => {
      if (projectile.dead) return;
      if (projectile.faction === 'player') {
        for (const enemy of this.enemies) {
          if (!enemy.dead && rectsOverlap(projectile, enemy)) {
            projectile.dead = true;
            this.damageEnemy(enemy, projectile.damage, false);
            return;
          }
        }
        if (this.boss && !this.boss.dead && rectsOverlap(projectile, this.boss)) {
          projectile.dead = true;
          this.damageBoss(projectile.damage, false);
          return;
        }
      } else {
        if (rectsOverlap(projectile, playerRect)) {
          projectile.dead = true;
          this.applyPlayerDamage(projectile.damage, this.player.x + this.player.w / 2, this.player.y + this.player.h / 2, '敵弾');
          return;
        }
      }
      for (const barrier of this.barriers) {
        if (!barrier.dead && rectsOverlap(projectile, barrier)) {
          projectile.dead = true;
          barrier.hit(projectile.faction === 'enemy' ? 1 : 0.5);
          this.addParticles(projectile.x, projectile.y, COLORS.cyanDeep, 4, { size: 2 });
          return;
        }
      }
    });
    this.specialItems.forEach((item) => {
      if (item.dead || !rectsOverlap(item, playerRect)) return;
      const x = item.x + item.w / 2;
      const y = item.y + item.h / 2;
      if (item.kind === 'heal') {
        const healed = this.player.heal(1);
        item.dead = true;
        if (healed > 0) {
          this.addParticles(x, y, COLORS.gold, 18, { life: 0.6, size: 4 });
          this.addParticles(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2, '#8fffc3', 24, { life: 0.72, size: 3, vy: -45 });
          this.flash = Math.max(this.flash, 0.16);
          this.audio.heal();
          this.onMessage?.('結界修復札を取得 — HP +1', 'skill');
        }
        return;
      }
      item.dead = true;
      if (item.kind === 'score') {
        this.scoreBoostTimer = Math.min(12, this.scoreBoostTimer + this.difficulty.scoreBoostDuration);
        this.addParticles(x, y, COLORS.gold, 24, { life: 0.72, size: 4 });
        this.flash = Math.max(this.flash, 0.18);
        this.audio.boost();
        this.onMessage?.(`輝星増幅札を取得 — SCORE ×2 / ${this.scoreBoostTimer.toFixed(1)}秒`, 'skill');
      } else if (item.kind === 'shield') {
        this.player.grantBarrier(this.difficulty.shieldDuration);
        this.addParticles(x, y, COLORS.cyan, 28, { life: 0.72, size: 4 });
        this.flash = Math.max(this.flash, 0.2);
        this.audio.shield();
        this.onMessage?.(`無敵結界珠を取得 — BARRIER / ${this.player.barrierTimer.toFixed(1)}秒`, 'skill');
      }
    });
    if (this.player.dead) this.finish('gameOver');
  }

  damageEnemy(enemy, damage, skill) {
    const died = enemy.hit(damage);
    this.addParticles(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, enemy.type.accent, died ? 22 : 6, { life: died ? 0.6 : 0.2, size: died ? 4 : 2 });
    if (!died) return;
    this.score += Math.round(enemy.value * this.getEffectiveScoreMultiplier() * (1 + Math.min(this.combo, 75) * 0.012));
    this.combo += 1;
    this.comboTimer = 2.5;
    this.player.energy = clamp(this.player.energy + (skill ? 7 : 9) * this.difficulty.energyGain, 0, this.player.maxEnergy);
    this.trySpawnSpecialPickup(enemy);
    this.audio.destroy();
  }

  trySpawnSpecialPickup(enemy) {
    if (this.specialItems.length >= 2) return;
    const candidates = [];
    if (this.player.hp < this.player.maxHp) candidates.push({ kind: 'heal', chance: this.difficulty.healDropChance, color: COLORS.gold });
    candidates.push({ kind: 'score', chance: this.difficulty.scoreDropChance, color: COLORS.violet });
    candidates.push({ kind: 'shield', chance: this.difficulty.shieldDropChance, color: COLORS.cyan });
    const roll = Math.random();
    let cursor = 0;
    const selected = candidates.find((candidate) => { cursor += candidate.chance; return roll < cursor; });
    if (!selected) return;
    const x = enemy.x + enemy.w / 2;
    const y = enemy.y + enemy.h / 2;
    this.specialItems.push(new SpecialPickup(x, y, selected.kind));
    this.addParticles(x, y, selected.color, 10, { life: 0.45, size: 3 });
  }

  damageBoss(damage, skill) {
    const died = this.boss.hit(damage);
    const bossX = this.boss.x + this.boss.w / 2;
    const bossY = this.boss.y + this.boss.h / 2;
    this.addParticles(bossX, bossY, skill ? COLORS.cyan : COLORS.magenta, died ? 100 : 10, { life: died ? 1.2 : 0.3, size: died ? 6 : 3 });
    if (this.boss.enraged && !this.boss.phaseAnnounced) {
      this.boss.phaseAnnounced = true;
      this.bossPhaseEffect = 0.82;
      this.warningPulse = 0.82;
      this.projectiles.filter((projectile) => projectile.faction === 'enemy').forEach((projectile) => { projectile.dead = true; });
      this.addParticles(bossX, bossY, this.boss.accent, 72, { life: 0.84, size: 5 });
      this.banner = { title: `PHASE 02 — ${this.boss.name}`, text: this.boss.kind === 'orochi' ? '紅月結界、侵食率50%。雷光を回避せよ。' : this.boss.kind === 'kappa' ? '渦核暴走。水鏡の中心から離れろ。' : '狂月核、完全励起。六尾弾幕を警戒せよ。', time: 1.2, maxTime: 1.2 };
      this.shake = 0.68;
      this.flash = 0.45;
      this.audio.boss();
      this.onMessage?.(`${this.boss.name}が覚醒しました。`, 'danger');
    }
    if (!died) return;
    this.bossDefeatEffect = 1.55;
    this.bossDefeatOrigin = { x: bossX, y: bossY, kind: this.boss.kind, accent: this.boss.accent };
    this.projectiles.filter((projectile) => projectile.faction === 'enemy').forEach((projectile) => { projectile.dead = true; });
    this.score += Math.round((this.boss.score + this.combo * 35) * this.getEffectiveScoreMultiplier());
    this.audio.clear();
    this.shake = 1;
    this.flash = 0.6;
    this.banner = { title: 'PURIFICATION COMPLETE', text: `${this.boss.name}の穢れを浄化しました。`, time: 1.55, maxTime: 1.55 };
  }

  updateCombo(dt) {
    if (this.combo <= 0) return;
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo = 0;
  }

  checkProgress(dt) {
    if (this.state === 'playing' && this.enemies.filter((enemy) => !enemy.dead).length === 0) {
      if (this.waveDelay <= 0) {
        this.waveDelay = 1.45;
        this.banner = { title: `WAVE ${this.waveIndex + 1} CLEAR`, text: '霊力が回復しています。', time: 1.45, maxTime: 1.45 };
      }
      this.waveDelay -= dt;
      if (this.waveDelay <= 0) this.beginWave();
    }
    if (this.state === 'boss' && this.boss?.dead) {
      if (this.bossDefeatEffect > 0) return;
      if (this.stageIndex < STAGES.length - 1) this.completeStage();
      else this.finish('clear');
    }
  }

  beginWave() {
    const spec = this.stage.waves[this.waveIndex];
    if (!spec) {
      this.state = 'bossWarning';
      this.bossWarning = 2.1;
      this.warningPulse = 2.1;
      this.banner = { title: 'WARNING', text: `大型穢機《${this.stage.boss.name}》接近。結界を最大出力へ。`, time: 2.1, maxTime: 2.1 };
      this.audio.boss();
      return;
    }
    this.state = 'playing';
    this.waveDelay = 0;
    this.enemies = [];
    this.formation = { offsetX: 0, direction: 1, speed: ENEMY_TYPES[spec.type].speed, drop: 0, minX: 100, maxX: 860 };
    const formationWidth = (spec.cols - 1) * spec.gapX + 42;
    const startX = (GAME_WIDTH - formationWidth) / 2;
    const startY = 82;
    let slot = 0;
    for (let row = 0; row < spec.rows; row += 1) {
      for (let col = 0; col < spec.cols; col += 1) {
        this.enemies.push(new Enemy(spec.type, startX + col * spec.gapX, startY + row * spec.gapY, slot, formationWidth, this.difficulty, this.stage.tuning));
        slot += 1;
      }
    }
    this.banner = { title: `WAVE ${this.waveIndex + 1}`, text: `${ENEMY_TYPES[spec.type].label}編隊を迎撃せよ。`, time: 1.35, maxTime: 1.35 };
    this.waveIndex += 1;
  }

  spawnBoss() {
    this.state = 'boss';
    this.boss = new Boss(this.stage.boss, this.difficulty);
    this.bossEntranceEffect = 2.4;
    this.warningPulse = 1.35;
    this.banner = { title: `TARGET — ${this.stage.boss.name}`, text: this.boss.kind === 'orochi' ? '朱ノ結界、紅月反応を検出。' : this.boss.kind === 'kappa' ? '碧ノ水鏡、渦核の暴走を検出。' : '黒曜霊峰、狂月核の展開を確認。', time: 2.4, maxTime: 2.4 };
    this.shake = 0.28;
    this.audio.boss();
    this.onMessage?.(`${this.stage.boss.name}を確認。攻撃パターンを見極めてください。`, 'danger');
  }

  completeStage() {
    this.state = 'stageClear';
    this.stageTransition = 3.3;
    this.stageRestoreEffect = 3.3;
    this.input.clear();
    this.enemies = [];
    this.projectiles = [];
    this.specialItems = [];
    this.boss = null;
    this.createBarriers();
    this.player.energy = Math.max(this.player.energy, this.stage.restoreEnergy || 50);
    this.banner = { title: 'BARRIER RESTORED', text: this.stage.transitionText, time: 3.3, maxTime: 3.3 };
    this.flash = 0.34;
    this.shake = 0.52;
    this.audio.clear();
    this.onMessage?.(this.stage.transitionText, 'skill');
  }

  beginNextStage() {
    this.stageIndex += 1;
    this.stage = STAGES[this.stageIndex];
    this.waveIndex = 0;
    this.waveDelay = 0;
    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.boss = null;
    this.createBarriers();
    this.state = 'intro';
    this.stageIntroEffect = 2.8;
    this.banner = { title: `${this.stage.chapter} — ${this.stage.name}`, text: this.stage.intro, time: 2.8, maxTime: 2.8 };
    this.onMessage?.(`${this.stage.name}へ到達。結界を展開してください。`, 'info');
  }

  finish(result) {
    if (this.state === 'gameOver' || this.state === 'clear') return;
    this.state = result;
    this.input.clear();
    const currentHighScore = Number(localStorage.getItem(this.highScoreKey()) || 0);
    const isNewRecord = this.score > currentHighScore;
    if (isNewRecord) localStorage.setItem(this.highScoreKey(), String(this.score));
    this.onFinish?.({ result, score: this.score, highScore: Math.max(this.score, currentHighScore), isNewRecord, wave: this.waveIndex, stageIndex: this.stageIndex + 1, stageCount: STAGES.length, stage: this.stage, combo: this.combo, difficulty: this.difficulty });
  }

  togglePause() {
    if (!['intro', 'playing', 'bossWarning', 'boss', 'paused'].includes(this.state)) return;
    if (this.state === 'paused') {
      this.state = this.pausedFrom || 'playing';
      this.onStateChange?.('playing');
      this.onMessage?.('戦闘を再開しました。', 'info');
    } else {
      this.pausedFrom = this.state;
      this.state = 'paused';
      this.input.clear();
      this.onStateChange?.('paused');
    }
  }

  updateHud() {
    this.onHud?.({
      score: this.score,
      highScore: Math.max(this.highScore, this.score),
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      energy: this.player.energy,
      combo: this.combo,
      comboTimer: this.comboTimer,
      wave: Math.min(this.waveIndex + (this.state === 'boss' ? 1 : 0), this.stage.waves.length + 1),
      stageIndex: this.stageIndex + 1,
      stageCount: STAGES.length,
      stage: this.stage,
      boss: this.boss && !this.boss.dead ? { hp: this.boss.hp, maxHp: this.boss.maxHp, name: this.boss.name, kind: this.boss.kind } : null,
      difficulty: this.difficulty,
      state: this.state,
    });
  }

  addParticles(x, y, color, count, options = {}) {
    for (let i = 0; i < count; i += 1) {
      const varying = { ...options };
      if (options.vx === 0) varying.vx = rand(-80, 80);
      if (options.vy === 70) varying.vy = rand(-30, 100);
      this.particles.push(new Particle(x, y, color, varying));
    }
  }

  cleanup() {
    this.enemies = this.enemies.filter((enemy) => !enemy.dead);
    this.projectiles = this.projectiles.filter((projectile) => !projectile.dead);
    this.specialItems = this.specialItems.filter((item) => !item.dead);
    this.particles = this.particles.filter((particle) => !particle.dead);
    this.barriers = this.barriers.filter((barrier) => !barrier.dead);
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.input.dispose();
    window.removeEventListener('resize', this.onResize);
  }
}

class CanvasRenderer {
  constructor(ctx) {
    this.ctx = ctx;
    this.stars = Array.from({ length: 100 }, (_, index) => ({
      x: (index * 97) % GAME_WIDTH,
      y: (index * 53) % GAME_HEIGHT,
      s: 0.4 + (index % 3) * 0.35,
      a: 0.25 + (index % 5) * 0.1,
    }));
    this.sprites = this.loadSprites();
  }

  loadSprites() {
    const sprites = {};
    Object.entries(SPRITE_SOURCES).forEach(([key, source]) => {
      const image = new Image();
      image.decoding = 'async';
      image.src = source;
      sprites[key] = image;
    });
    return sprites;
  }

  drawSprite(key, centerX, centerY, size, options = {}) {
    const image = this.sprites[key];
    if (!image || !image.complete || image.naturalWidth === 0) return false;
    const { ctx } = this;
    const alpha = options.alpha ?? 1;
    const glow = options.glow ?? null;
    const glowBlur = options.glowBlur ?? 0;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (glow) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = glowBlur;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(image, centerX - size / 2, centerY - size / 2, size, size);
    ctx.restore();
    return true;
  }

  render(world) {
    const { ctx } = this;
    ctx.save();
    const shake = world.getSettings().screenShake ? world.shake * 9 : 0;
    if (shake > 0) ctx.translate(rand(-shake, shake), rand(-shake, shake));
    this.drawBackground(world);
    this.drawCinematicEffects(world);
    this.drawBarriers(world.barriers);
    this.drawParticles(world.particles);
    this.drawProjectiles(world.projectiles);
    world.enemies.forEach((enemy) => this.drawEnemy(enemy));
    if (world.boss && !world.boss.dead) this.drawBoss(world.boss);
    this.drawBossEffects(world);
    this.drawSpecialItems(world.specialItems);
    if (!world.player.dead && world.player.isShielded()) this.drawPlayerBarrier(world.player);
    if (!world.player.dead) this.drawPlayer(world.player);
    if (world.skillPulse) this.drawSkillPulse(world.skillPulse);
    this.drawCanvasHud(world);
    if (world.banner) this.drawBanner(world.banner);
    if (world.state === 'paused') this.drawPause();
    if (world.flash > 0) {
      ctx.fillStyle = `rgba(170, 240, 255, ${world.flash * 0.28})`;
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    }
    ctx.restore();
  }

  drawBackground(world) {
    if (world.stage.theme === 'water') this.drawWaterBackground(world);
    else if (world.stage.theme === 'mountain') this.drawMountainBackground(world);
    else this.drawToriiBackground(world);
    this.drawStageAtmosphere(world);
  }

  stagePressure(world) {
    if (world.state === 'boss') return 1;
    if (world.state === 'bossWarning') return 0.76;
    return 0;
  }

  drawStageAtmosphere(world) {
    const { ctx } = this;
    const pressure = this.stagePressure(world);
    const time = world.elapsed;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    if (world.stage.theme === 'water') {
      const horizon = 326;
      for (let i = 0; i < 7; i += 1) {
        const y = horizon + i * 27 + Math.sin(time * 2.4 + i) * 4;
        const width = 110 + ((i * 61) % 210) + pressure * 84;
        const x = (GAME_WIDTH / 2) - width / 2 + Math.sin(time * 1.15 + i) * 30;
        ctx.strokeStyle = `rgba(117, 255, 251, ${0.1 + pressure * 0.12})`;
        ctx.lineWidth = 1 + (i % 2);
        ctx.beginPath(); ctx.ellipse(x + width / 2, y, width / 2, 5 + i * .8, 0, 0, Math.PI * 2); ctx.stroke();
      }
      for (let i = 0; i < 8; i += 1) {
        const x = (i * 143 + time * 18) % (GAME_WIDTH + 80) - 40;
        const y = 235 + Math.sin(time * 1.7 + i) * 32;
        ctx.fillStyle = `rgba(157, 122, 255, ${0.12 + pressure * .12})`;
        ctx.beginPath(); ctx.ellipse(x, y, 4, 16 + (i % 3) * 8, 0, 0, Math.PI * 2); ctx.fill();
      }
    } else if (world.stage.theme === 'mountain') {
      for (let i = 0; i < 9; i += 1) {
        const y = 200 + i * 31 + Math.sin(time * .8 + i * .9) * 12;
        const alpha = 0.035 + pressure * .08;
        ctx.fillStyle = `rgba(230, 107, 201, ${alpha})`;
        ctx.beginPath(); ctx.ellipse(GAME_WIDTH / 2 + Math.sin(time * .45 + i) * 290, y, 250 - i * 9, 16, 0, 0, Math.PI * 2); ctx.fill();
      }
      for (let i = 0; i < 16; i += 1) {
        const x = (i * 79 + time * (22 + pressure * 48)) % (GAME_WIDTH + 90) - 45;
        const y = (i * 53 + time * (58 + pressure * 90)) % 340;
        ctx.strokeStyle = `rgba(255, 80, 151, ${0.09 + pressure * .15})`;
        ctx.lineWidth = 1 + (i % 2);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 16, y + 24); ctx.stroke();
      }
    } else {
      const moonX = 144; const moonY = 128;
      for (let i = 0; i < 9; i += 1) {
        const angle = time * (0.55 + pressure * .55) + i * (Math.PI * 2 / 9);
        const radius = 78 + (i % 3) * 19 + pressure * 28;
        const x = moonX + Math.cos(angle) * radius;
        const y = moonY + Math.sin(angle) * radius;
        ctx.save(); ctx.translate(x, y); ctx.rotate(angle + Math.PI / 2);
        ctx.fillStyle = `rgba(255, 107, 172, ${0.12 + pressure * .17})`;
        ctx.fillRect(-4, -9, 8, 18); ctx.restore();
      }
      if (pressure > 0) {
        ctx.strokeStyle = `rgba(255, 72, 131, ${0.18 + Math.sin(time * 7) * .08})`;
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i += 1) { ctx.beginPath(); ctx.arc(moonX, moonY, 88 + i * 18 + Math.sin(time * 4 + i) * 4, 0, Math.PI * 2); ctx.stroke(); }
      }
    }
    ctx.restore();
  }

  drawCinematicEffects(world) {
    const { ctx } = this;
    ctx.save();
    const stageColor = world.stage.theme === 'water' ? '98, 246, 255' : world.stage.theme === 'mountain' ? '255, 77, 142' : '127, 247, 255';
    if (world.stageIntroEffect > 0) {
      const alpha = Math.min(.3, world.stageIntroEffect * .12);
      ctx.fillStyle = `rgba(${stageColor}, ${alpha})`;
      for (let y = 0; y < GAME_HEIGHT; y += 18) ctx.fillRect(0, y + ((world.elapsed * 95) % 18), GAME_WIDTH, 1);
      const scanX = ((2.8 - world.stageIntroEffect) / 2.8) * GAME_WIDTH;
      ctx.fillStyle = `rgba(${stageColor}, .18)`; ctx.fillRect(Math.max(0, scanX - 42), 0, 84, GAME_HEIGHT);
    }
    if (world.warningPulse > 0) {
      const pulse = .38 + Math.sin(world.elapsed * 15) * .16;
      ctx.strokeStyle = `rgba(255, 62, 104, ${pulse})`;
      ctx.lineWidth = 5; ctx.strokeRect(4, 4, GAME_WIDTH - 8, GAME_HEIGHT - 8);
      ctx.fillStyle = `rgba(255, 45, 91, ${pulse * .08})`; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    }
    if (world.bossEntranceEffect > 0 && world.boss) {
      const progress = 1 - world.bossEntranceEffect / 2.4;
      const cx = world.boss.x + world.boss.w / 2;
      const cy = world.boss.y + world.boss.h / 2;
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = `rgba(${stageColor}, ${.55 * (1 - progress)})`;
      ctx.lineWidth = 3;
      for (let i = 0; i < 4; i += 1) { ctx.beginPath(); ctx.arc(cx, cy, 42 + progress * 300 + i * 22, 0, Math.PI * 2); ctx.stroke(); }
    }
    if (world.stageRestoreEffect > 0) {
      const progress = 1 - world.stageRestoreEffect / 3.3;
      const radius = progress * 760;
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = `rgba(${stageColor}, ${.78 * (1 - progress)})`;
      ctx.lineWidth = 9 - progress * 5;
      ctx.beginPath(); ctx.arc(GAME_WIDTH / 2, GAME_HEIGHT * .68, radius, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(${stageColor}, ${(1 - progress) * .08})`; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    }
    if (world.toriiLightningEffect) this.drawToriiLightning(world, world.toriiLightningEffect);
    ctx.restore();
  }

  drawToriiBackground(world) {
    const { ctx } = this;
    const gradient = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
    gradient.addColorStop(0, '#04051b');
    gradient.addColorStop(0.56, '#11123a');
    gradient.addColorStop(1, '#080a21');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const moonX = 144;
    const moonY = 128;
    const moonR = 74;
    const moon = ctx.createRadialGradient(moonX - 16, moonY - 18, 8, moonX, moonY, moonR);
    moon.addColorStop(0, 'rgba(240, 250, 255, .98)');
    moon.addColorStop(0.72, 'rgba(170, 207, 255, .77)');
    moon.addColorStop(1, 'rgba(151, 181, 255, 0)');
    ctx.fillStyle = moon;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(193, 221, 255, 0.55)';
    this.stars.forEach((star) => {
      const twinkle = Math.sin(world.elapsed * 1.8 + star.x) * 0.18;
      ctx.globalAlpha = star.a + twinkle;
      ctx.fillRect(star.x, star.y, star.s, star.s);
    });
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.globalAlpha = 0.48;
    this.drawSkyline(0, 335, COLORS.navy, 0.74);
    this.drawSkyline(0, 388, '#080d29', 1);
    ctx.restore();

    ctx.strokeStyle = 'rgba(70, 243, 255, .16)';
    ctx.lineWidth = 1;
    for (let y = 302; y < GAME_HEIGHT; y += 34) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(GAME_WIDTH, y);
      ctx.stroke();
    }
    for (let x = 0; x < GAME_WIDTH; x += 62) {
      ctx.beginPath();
      ctx.moveTo(x, 305);
      ctx.lineTo(x - 110, GAME_HEIGHT);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255, 75, 147, .21)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, 240);
    ctx.lineTo(40, 192);
    ctx.lineTo(98, 168);
    ctx.lineTo(157, 192);
    ctx.lineTo(157, 240);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(28, 191);
    ctx.lineTo(168, 191);
    ctx.stroke();
    this.drawToriiGateArray(world);

    for (let i = 0; i < 17; i += 1) {
      const y = ((world.elapsed * 85 + i * 44) % GAME_HEIGHT) - 30;
      const x = (i * 131 + 52) % GAME_WIDTH;
      ctx.strokeStyle = `rgba(86, 230, 255, ${0.1 + (i % 4) * 0.035})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 18 + (i % 3) * 12);
      ctx.stroke();
    }
  }

  drawToriiGateArray(world) {
    const { ctx } = this;
    const boss = world.boss?.kind === 'orochi' ? world.boss : null;
    const telegraphProgress = boss?.gateTelegraphMax ? 1 - boss.gateTelegraph / boss.gateTelegraphMax : 0;
    ctx.save();
    TORII_GATE_LANES.forEach((lane, index) => {
      const sequential = boss?.gateTelegraph > 0 ? clamp(telegraphProgress * 3 - index + 0.34, 0, 1) : 0;
      const targeted = boss?.gateTelegraph > 0 && boss.gateTarget === index;
      const pressure = this.stagePressure(world);
      const glow = targeted ? Math.max(sequential, .22) : sequential * .48 + pressure * .08;
      const width = 60 * lane.scale;
      const height = 78 * lane.scale;
      const topY = lane.gateY - height;
      const left = lane.gateX - width / 2;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = .12 + glow * .76;
      ctx.strokeStyle = targeted ? COLORS.gold : COLORS.crimson;
      ctx.shadowColor = targeted ? COLORS.gold : COLORS.crimson;
      ctx.shadowBlur = 10 + glow * 24;
      ctx.lineWidth = 2 + glow * 2;
      ctx.beginPath();
      ctx.moveTo(left + width * .16, lane.gateY);
      ctx.lineTo(left + width * .16, topY + 15);
      ctx.lineTo(left + width * .84, topY + 15);
      ctx.lineTo(left + width * .84, lane.gateY);
      ctx.moveTo(left, topY + 15);
      ctx.lineTo(left + width, topY + 15);
      ctx.moveTo(left + width * .1, topY + 3);
      ctx.lineTo(left + width * .9, topY + 3);
      ctx.stroke();
      if (targeted) {
        const pulse = .12 + Math.sin(world.elapsed * 18) * .06 + glow * .22;
        ctx.fillStyle = `rgba(255, 84, 137, ${pulse})`;
        ctx.fillRect(lane.x, topY + 24, lane.width, GAME_HEIGHT - topY - 24);
        ctx.strokeStyle = `rgba(255, 220, 120, ${.25 + glow * .5})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 7]);
        ctx.beginPath(); ctx.moveTo(lane.x + 8, topY + 24); ctx.lineTo(lane.x + 8, GAME_HEIGHT - 48); ctx.moveTo(lane.x + lane.width - 8, topY + 24); ctx.lineTo(lane.x + lane.width - 8, GAME_HEIGHT - 48); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    });
    ctx.restore();
  }

  drawToriiLightning(world, effect) {
    const { ctx } = this;
    const lane = TORII_GATE_LANES[effect.lane];
    if (!lane) return;
    const impact = effect.time / effect.maxTime;
    const cx = lane.x + lane.width / 2;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(255, 76, 139, ${impact * .16})`;
    ctx.fillRect(lane.x, 176, lane.width, GAME_HEIGHT - 176);
    for (let pass = 0; pass < 3; pass += 1) {
      ctx.strokeStyle = pass === 0 ? `rgba(255, 251, 205, ${.95 * impact})` : `rgba(255, 55, 132, ${.5 * impact})`;
      ctx.shadowColor = pass === 0 ? COLORS.gold : COLORS.crimson;
      ctx.shadowBlur = 12 + pass * 10;
      ctx.lineWidth = pass === 0 ? 5 : 12;
      ctx.beginPath(); ctx.moveTo(cx, 170);
      for (let y = 196; y < GAME_HEIGHT - 50; y += 31) {
        const jitter = Math.sin(y * .17 + world.elapsed * 50 + pass) * (12 + pass * 5);
        ctx.lineTo(cx + jitter, y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(255, 244, 182, ${.22 * impact})`;
    ctx.beginPath(); ctx.ellipse(cx, GAME_HEIGHT - 56, lane.width * .54, 20, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  drawWaterBackground(world) {
    const { ctx } = this;
    const sky = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
    sky.addColorStop(0, '#031826');
    sky.addColorStop(0.55, '#07536c');
    sky.addColorStop(1, '#031c31');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const moonX = GAME_WIDTH * 0.5;
    const moonY = 142;
    const moon = ctx.createRadialGradient(moonX - 18, moonY - 18, 12, moonX, moonY, 98);
    moon.addColorStop(0, 'rgba(226, 255, 255, .98)');
    moon.addColorStop(0.55, 'rgba(112, 247, 255, .82)');
    moon.addColorStop(1, 'rgba(71, 220, 255, 0)');
    ctx.fillStyle = moon;
    ctx.beginPath(); ctx.arc(moonX, moonY, 98, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = 'rgba(183, 246, 255, .42)';
    this.stars.slice(0, 52).forEach((star) => {
      const twinkle = Math.sin(world.elapsed * 1.4 + star.y) * 0.15;
      ctx.globalAlpha = star.a + twinkle;
      ctx.fillRect(star.x, star.y * .72, star.s, star.s);
    });
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(4, 22, 43, .74)';
    for (let i = 0; i < 10; i += 1) {
      const x = i * 108 - 35;
      const y = 282 + (i % 3) * 9;
      ctx.fillRect(x, y, 92, 74);
      ctx.beginPath(); ctx.moveTo(x - 12, y); ctx.lineTo(x + 46, y - 35); ctx.lineTo(x + 104, y); ctx.fill();
    }

    ctx.strokeStyle = 'rgba(255, 208, 103, .45)';
    ctx.lineWidth = 3;
    [116, 844].forEach((x) => {
      ctx.beginPath(); ctx.moveTo(x - 125, 319); ctx.quadraticCurveTo(x, 254, x + 125, 319); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 125, 321); ctx.lineTo(x + 125, 321); ctx.stroke();
      for (let n = -2; n <= 2; n += 1) {
        ctx.fillStyle = 'rgba(255, 209, 102, .72)';
        ctx.fillRect(x + n * 44 - 3, 299, 6, 12);
      }
    });

    const water = ctx.createLinearGradient(0, 315, 0, GAME_HEIGHT);
    water.addColorStop(0, 'rgba(13, 87, 118, .48)');
    water.addColorStop(1, 'rgba(2, 12, 32, .88)');
    ctx.fillStyle = water; ctx.fillRect(0, 315, GAME_WIDTH, GAME_HEIGHT - 315);
    for (let i = 0; i < 24; i += 1) {
      const y = 326 + i * 13;
      const width = 90 + (i * 57) % 290;
      const x = (i * 133 + 36) % (GAME_WIDTH - width);
      ctx.strokeStyle = `rgba(84, 235, 255, ${0.14 + (i % 4) * .06})`;
      ctx.lineWidth = 1 + (i % 2);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + width, y); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(112, 244, 255, .17)';
    for (let i = 0; i < 7; i += 1) {
      const y = 375 + i * 25;
      ctx.beginPath(); ctx.ellipse(moonX, y, 140 - i * 11, 8, 0, 0, Math.PI * 2); ctx.stroke();
    }

    for (let i = 0; i < 12; i += 1) {
      const x = (i * 137 + 65) % GAME_WIDTH;
      const y = 55 + ((world.elapsed * 24 + i * 76) % 360);
      ctx.fillStyle = `rgba(190, 103, 255, ${0.22 + (i % 3) * .1})`;
      ctx.beginPath(); ctx.ellipse(x, y, 5 + (i % 3) * 2, 9 + (i % 4) * 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(195, 119, 255, .38)'; ctx.beginPath(); ctx.moveTo(x, y + 7); ctx.lineTo(x, y + 26 + (i % 3) * 8); ctx.stroke();
    }
  }

  drawMountainBackground(world) {
    const { ctx } = this;
    const sky = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
    sky.addColorStop(0, '#160821');
    sky.addColorStop(0.48, '#481039');
    sky.addColorStop(1, '#0c071d');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const moonX = GAME_WIDTH * 0.5;
    const moonY = 123;
    ctx.save();
    ctx.shadowColor = COLORS.crimson; ctx.shadowBlur = 32;
    ctx.fillStyle = '#be214c'; ctx.beginPath(); ctx.arc(moonX, moonY, 104, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#120618'; ctx.beginPath(); ctx.arc(moonX + 12, moonY + 3, 90, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.fillStyle = 'rgba(246, 144, 192, .42)';
    this.stars.slice(0, 70).forEach((star) => {
      ctx.globalAlpha = star.a + Math.sin(world.elapsed * 1.6 + star.x) * .15;
      ctx.fillRect(star.x, star.y * .82, star.s, star.s);
    });
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#110b22';
    for (let i = 0; i < 13; i += 1) {
      const x = i * 82 - 36;
      const h = 78 + (i * 41) % 142;
      ctx.beginPath(); ctx.moveTo(x, 348); ctx.lineTo(x + 42, 348 - h); ctx.lineTo(x + 94, 348); ctx.fill();
    }
    ctx.fillStyle = '#20102e';
    for (let i = 0; i < 9; i += 1) {
      const x = i * 120 + 18;
      const y = 228 + (i % 3) * 31;
      ctx.fillRect(x, y, 46, 28);
      ctx.beginPath(); ctx.moveTo(x - 12, y); ctx.lineTo(x + 23, y - 27); ctx.lineTo(x + 58, y); ctx.fill();
    }

    const floor = ctx.createLinearGradient(0, 302, 0, GAME_HEIGHT);
    floor.addColorStop(0, '#1b102d'); floor.addColorStop(1, '#050313');
    ctx.fillStyle = floor; ctx.fillRect(0, 302, GAME_WIDTH, GAME_HEIGHT - 302);
    ctx.strokeStyle = 'rgba(255, 63, 122, .24)'; ctx.lineWidth = 1;
    for (let y = 314; y < GAME_HEIGHT; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(GAME_WIDTH, y); ctx.stroke(); }
    for (let x = 0; x < GAME_WIDTH; x += 58) { ctx.beginPath(); ctx.moveTo(x, 303); ctx.lineTo(x + (x - GAME_WIDTH / 2) * .92, GAME_HEIGHT); ctx.stroke(); }

    for (let i = 0; i < 10; i += 1) {
      const startX = (i * 121 + 35) % GAME_WIDTH;
      const startY = ((world.elapsed * 115 + i * 97) % 420) - 52;
      ctx.strokeStyle = `rgba(215, 79, 255, ${0.21 + (i % 3) * .08})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(startX - 45, startY + 70); ctx.stroke();
    }
  }

  drawSkyline(x, y, color, scale) {
    const { ctx } = this;
    ctx.fillStyle = color;
    for (let i = 0; i < 14; i += 1) {
      const width = (44 + (i * 17) % 62) * scale;
      const height = (40 + (i * 29) % 126) * scale;
      const px = x + i * 77 - 20;
      ctx.fillRect(px, y - height, width, height);
      ctx.fillStyle = 'rgba(130, 225, 255, .18)';
      for (let windowY = y - height + 12; windowY < y - 8; windowY += 16) {
        ctx.fillRect(px + 8, windowY, Math.max(2, width - 18), 2);
      }
      ctx.fillStyle = color;
    }
    ctx.fillStyle = color;
    ctx.fillRect(720, y - 132 * scale, 8, 132 * scale);
    ctx.beginPath();
    ctx.moveTo(692, y - 127 * scale);
    ctx.lineTo(724, y - 174 * scale);
    ctx.lineTo(756, y - 127 * scale);
    ctx.fill();
  }

  drawPlayer(player) {
    const { ctx } = this;
    const cx = player.x + player.w / 2;
    const cy = player.y + player.h / 2;
    const alpha = player.invincible > 0 && Math.floor(player.invincible * 16) % 2 === 0 ? 0.42 : 1;
    if (this.drawSprite('kagura', cx, cy + 3, 78, { alpha, glow: COLORS.cyan, glowBlur: 12 })) return;
    ctx.save();
    ctx.translate(cx, cy);
    if (player.invincible > 0 && Math.floor(player.invincible * 16) % 2 === 0) ctx.globalAlpha = 0.4;
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 20;
    const flame = 9 + Math.sin(player.enginePulse) * 4;
    ctx.fillStyle = '#48dafe';
    ctx.beginPath();
    ctx.moveTo(-8, 20);
    ctx.lineTo(0, 20 + flame);
    ctx.lineTo(8, 20);
    ctx.fill();
    ctx.fillStyle = '#17162d';
    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -28);
    ctx.lineTo(19, 6);
    ctx.lineTo(31, 19);
    ctx.lineTo(8, 15);
    ctx.lineTo(0, 26);
    ctx.lineTo(-8, 15);
    ctx.lineTo(-31, 19);
    ctx.lineTo(-19, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.crimson;
    ctx.fillRect(-24, 10, 11, 5);
    ctx.fillRect(13, 10, 11, 5);
    ctx.fillStyle = COLORS.cyan;
    ctx.beginPath();
    ctx.arc(0, 2, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(-2, -24, 4, 17);
    ctx.fillStyle = COLORS.crimson;
    ctx.fillRect(-11, -26, 22, 4);
    ctx.restore();
  }

  drawEnemy(enemy) {
    const { ctx } = this;
    const { x, y, w, h, typeKey, type } = enemy;
    const size = typeKey === 'hebi' || typeKey === 'tengu' ? 58 : 54;
    const alpha = enemy.flash > 0 ? 0.78 : 1;
    if (this.drawSprite(typeKey, x + w / 2, y + h / 2, size, { alpha, glow: type.accent, glowBlur: 8 })) return;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.shadowColor = type.accent;
    ctx.shadowBlur = 12;
    ctx.fillStyle = enemy.flash > 0 ? COLORS.paper : type.color;
    ctx.strokeStyle = type.accent;
    ctx.lineWidth = 1.5;
    if (typeKey === 'oni') {
      ctx.beginPath();
      ctx.moveTo(-17, -10); ctx.lineTo(-9, -18); ctx.lineTo(-4, -11); ctx.lineTo(4, -11); ctx.lineTo(9, -18); ctx.lineTo(17, -10);
      ctx.lineTo(16, 15); ctx.lineTo(-16, 15); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = COLORS.ink;
      ctx.fillRect(-10, -2, 6, 4); ctx.fillRect(4, -2, 6, 4);
    } else if (typeKey === 'kitsune') {
      ctx.beginPath();
      ctx.moveTo(-18, -15); ctx.lineTo(-8, -9); ctx.lineTo(0, -17); ctx.lineTo(8, -9); ctx.lineTo(18, -15); ctx.lineTo(14, 16); ctx.lineTo(-14, 16); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = type.accent;
      ctx.fillRect(-8, -1, 5, 4); ctx.fillRect(3, -1, 5, 4);
    } else if (typeKey === 'chochin') {
      ctx.fillStyle = type.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, 15, 17, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = type.accent;
      ctx.fillRect(-17, -14, 34, 5); ctx.fillRect(-17, 10, 34, 4);
      ctx.strokeStyle = COLORS.ink; ctx.beginPath(); ctx.moveTo(0, 17); ctx.lineTo(0, 25); ctx.stroke();
    } else if (typeKey === 'tengu') {
      ctx.fillStyle = type.color;
      ctx.beginPath();
      ctx.moveTo(0, -19); ctx.lineTo(13, -6); ctx.lineTo(19, 13); ctx.lineTo(0, 18); ctx.lineTo(-19, 13); ctx.lineTo(-13, -6); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = COLORS.gold;
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(7, 5); ctx.lineTo(0, 11); ctx.lineTo(-7, 5); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-16, 5); ctx.lineTo(-30, -3); ctx.lineTo(-21, 14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(16, 5); ctx.lineTo(30, -3); ctx.lineTo(21, 14); ctx.stroke();
      ctx.fillStyle = COLORS.ink; ctx.fillRect(-10, -3, 6, 3); ctx.fillRect(4, -3, 6, 3);
    } else {
      ctx.strokeStyle = type.color;
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, 2, 14, Math.PI * .1, Math.PI * 1.68); ctx.stroke();
      ctx.fillStyle = type.accent;
      ctx.beginPath(); ctx.arc(-5, -7, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = COLORS.paper;
      ctx.fillRect(-7, -9, 3, 2);
    }
    ctx.restore();
  }

  drawBoss(boss) {
    const spriteSize = boss.kind === 'yatagarasu' ? 330 : 310;
    const alpha = boss.flash > 0 ? 0.8 : 1;
    if (this.drawSprite(boss.kind, boss.x + boss.w / 2, boss.y + boss.h / 2 + 10, spriteSize, { alpha, glow: boss.accent, glowBlur: 16 })) return;
    if (boss.kind === 'kappa') {
      this.drawKappaBoss(boss);
      return;
    }
    if (boss.kind === 'yatagarasu') {
      this.drawYatagarasuBoss(boss);
      return;
    }
    this.drawOrochiBoss(boss);
  }

  drawBossEffects(world) {
    const { ctx } = this;
    const boss = world.boss;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    if (boss && !boss.dead && (boss.phaseTransition > 0 || world.bossPhaseEffect > 0)) {
      const remain = Math.min(1, Math.max(boss.phaseTransition / .82, world.bossPhaseEffect / .82));
      const progress = 1 - remain;
      const cx = boss.x + boss.w / 2;
      const cy = boss.y + boss.h / 2;
      const accent = boss.kind === 'kappa' ? '96, 245, 255' : boss.kind === 'yatagarasu' ? '255, 83, 151' : '255, 76, 160';
      ctx.fillStyle = `rgba(${accent}, ${0.12 + remain * .18})`; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      ctx.strokeStyle = `rgba(${accent}, ${0.78 * remain})`; ctx.lineWidth = 3 + remain * 5;
      for (let i = 0; i < 5; i += 1) { ctx.beginPath(); ctx.arc(cx, cy, 48 + progress * 260 + i * 31, 0, Math.PI * 2); ctx.stroke(); }
      for (let i = 0; i < 12; i += 1) {
        const a = world.elapsed * 3 + i * Math.PI / 6;
        const r = 72 + progress * 190;
        ctx.fillStyle = `rgba(${accent}, ${0.62 * remain})`;
        ctx.fillRect(cx + Math.cos(a) * r - 3, cy + Math.sin(a) * r - 9, 6, 18);
      }
    }
    if (world.bossDefeatEffect > 0 && world.bossDefeatOrigin) {
      const { x, y, accent } = world.bossDefeatOrigin;
      const progress = 1 - world.bossDefeatEffect / 1.55;
      ctx.strokeStyle = accent; ctx.globalAlpha = 1 - progress; ctx.lineWidth = 8 - progress * 5;
      for (let i = 0; i < 3; i += 1) { ctx.beginPath(); ctx.arc(x, y, 38 + progress * (170 + i * 58), 0, Math.PI * 2); ctx.stroke(); }
      for (let i = 0; i < 20; i += 1) {
        const a = i * Math.PI * 2 / 20 + progress * .7;
        const r = 40 + progress * 250;
        ctx.fillStyle = i % 2 ? COLORS.gold : accent;
        ctx.fillRect(x + Math.cos(a) * r - 3, y + Math.sin(a) * r - 3 - progress * 80, 6, 6);
      }
    }
    ctx.restore();
  }

  drawOrochiBoss(boss) {
    const { ctx } = this;
    const x = boss.x; const y = boss.y; const w = boss.w; const h = boss.h;
    ctx.save();
    ctx.shadowColor = COLORS.magenta;
    ctx.shadowBlur = 26;
    ctx.fillStyle = boss.flash > 0 ? '#fff8ff' : '#36113a';
    ctx.strokeStyle = COLORS.magenta;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 42, y + 35);
    ctx.lineTo(x + 68, y + 8);
    ctx.lineTo(x + 93, y + 39);
    ctx.lineTo(x + w - 93, y + 39);
    ctx.lineTo(x + w - 68, y + 8);
    ctx.lineTo(x + w - 42, y + 35);
    ctx.quadraticCurveTo(x + w - 8, y + h * .48, x + w - 40, y + h - 12);
    ctx.quadraticCurveTo(x + w / 2, y + h + 18, x + 40, y + h - 12);
    ctx.quadraticCurveTo(x + 8, y + h * .48, x + 42, y + 35);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = COLORS.crimson;
    ctx.beginPath(); ctx.ellipse(x + w * .34, y + h * .54, 19, 10, -0.12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + w * .66, y + h * .54, 19, 10, 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(x + w * .34 - 4, y + h * .54 - 2, 8, 4);
    ctx.fillRect(x + w * .66 - 4, y + h * .54 - 2, 8, 4);
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x + w * .36, y + h * .75); ctx.quadraticCurveTo(x + w / 2, y + h * .93, x + w * .64, y + h * .75); ctx.stroke();
    for (let i = 0; i < 6; i += 1) {
      ctx.strokeStyle = `rgba(255, 74, 162, ${0.25 + i * .08})`;
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, 88 + i * 11, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawKappaBoss(boss) {
    const { ctx } = this;
    const { x, y, w, h } = boss;
    ctx.save();
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 25;
    ctx.fillStyle = boss.flash > 0 ? '#e6ffff' : '#0d3158';
    ctx.strokeStyle = '#69f4ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h * .58, w * .39, h * .36, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0a1e3d';
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h * .6, w * .24, h * .25, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      const px = x + w / 2 + Math.cos(angle) * w * .18;
      const py = y + h * .6 + Math.sin(angle) * h * .18;
      ctx.beginPath(); ctx.moveTo(x + w / 2, y + h * .6); ctx.lineTo(px, py); ctx.stroke();
    }
    const core = ctx.createRadialGradient(x + w / 2 - 8, y + h * .58 - 8, 4, x + w / 2, y + h * .58, 34);
    core.addColorStop(0, '#efffff'); core.addColorStop(.42, COLORS.cyan); core.addColorStop(1, '#075b9b');
    ctx.fillStyle = core; ctx.beginPath(); ctx.arc(x + w / 2, y + h * .58, 32, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = boss.flash > 0 ? '#f0ffff' : '#17608e';
    ctx.strokeStyle = COLORS.cyan;
    ctx.beginPath(); ctx.arc(x + w / 2, y + h * .22, 35, Math.PI, 0); ctx.lineTo(x + w * .63, y + h * .42); ctx.lineTo(x + w * .37, y + h * .42); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = COLORS.gold; ctx.beginPath(); ctx.arc(x + w / 2, y + h * .13, 17, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COLORS.ink; ctx.fillRect(x + w * .42, y + h * .31, 12, 4); ctx.fillRect(x + w * .53, y + h * .31, 12, 4);
    ctx.strokeStyle = 'rgba(105, 244, 255, .48)';
    for (let i = 0; i < 4; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      ctx.beginPath(); ctx.arc(x + w / 2 + side * 92, y + h * .57, 44 + i * 12, side < 0 ? Math.PI * .55 : Math.PI * .95, side < 0 ? Math.PI * 1.45 : Math.PI * .05); ctx.stroke();
    }
    ctx.restore();
  }

  drawYatagarasuBoss(boss) {
    const { ctx } = this;
    const { x, y, w, h } = boss;
    const cx = x + w / 2;
    const cy = y + h * .56;
    ctx.save();
    ctx.shadowColor = COLORS.gold;
    ctx.shadowBlur = 28;
    ctx.strokeStyle = COLORS.gold;
    ctx.fillStyle = boss.flash > 0 ? '#fff5cf' : '#1c1427';
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const tier = Math.floor(i / 2);
      const tx = cx + side * (80 + tier * 28);
      const ty = cy - 18 - tier * 21;
      ctx.beginPath();
      ctx.moveTo(cx + side * 20, cy + 16);
      ctx.quadraticCurveTo(tx, ty - 62, tx + side * 42, ty + 22);
      ctx.quadraticCurveTo(tx + side * 12, ty + 48, cx + side * 12, cy + 22);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(199, 77, 255, .52)';
      ctx.beginPath(); ctx.moveTo(cx + side * 26, cy + 11); ctx.lineTo(tx + side * 21, ty - 24); ctx.lineTo(tx + side * 29, ty + 13); ctx.closePath(); ctx.fill();
      ctx.fillStyle = boss.flash > 0 ? '#fff5cf' : '#1c1427';
    }
    ctx.beginPath();
    ctx.moveTo(cx, y + 7); ctx.lineTo(cx + 39, y + 45); ctx.lineTo(cx + 27, y + h * .82); ctx.lineTo(cx, y + h + 5); ctx.lineTo(cx - 27, y + h * .82); ctx.lineTo(cx - 39, y + 45); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = COLORS.gold;
    ctx.beginPath(); ctx.moveTo(cx, y + 27); ctx.lineTo(cx + 12, y + 55); ctx.lineTo(cx, y + 74); ctx.lineTo(cx - 12, y + 55); ctx.closePath(); ctx.fill();
    ctx.fillStyle = COLORS.crimson;
    ctx.shadowColor = COLORS.crimson; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.arc(cx, y + h * .48, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COLORS.paper; ctx.fillRect(cx - 2, y + h * .48 - 8, 4, 16);
    ctx.strokeStyle = 'rgba(255, 77, 109, .42)'; ctx.lineWidth = 2;
    for (let i = 0; i < 5; i += 1) {
      ctx.beginPath(); ctx.arc(cx, cy, 82 + i * 14, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    }
    ctx.restore();
  }

  drawBarriers(barriers) {
    const { ctx } = this;
    barriers.forEach((barrier) => {
      const ratio = barrier.hp / barrier.maxHp;
      ctx.save();
      ctx.globalAlpha = 0.35 + ratio * 0.65;
      ctx.shadowColor = COLORS.cyan;
      ctx.shadowBlur = 14;
      ctx.strokeStyle = COLORS.cyan;
      ctx.fillStyle = 'rgba(36, 101, 185, .32)';
      ctx.lineWidth = 2;
      ctx.fillRect(barrier.x, barrier.y, barrier.w, barrier.h);
      ctx.strokeRect(barrier.x, barrier.y, barrier.w, barrier.h);
      ctx.beginPath();
      ctx.moveTo(barrier.x + barrier.w / 2, barrier.y); ctx.lineTo(barrier.x + barrier.w / 2, barrier.y + barrier.h);
      ctx.moveTo(barrier.x, barrier.y + barrier.h / 2); ctx.lineTo(barrier.x + barrier.w, barrier.y + barrier.h / 2);
      ctx.stroke();
      const broken = Math.ceil((1 - ratio) * 5);
      ctx.strokeStyle = COLORS.ink;
      for (let i = 0; i < broken; i += 1) {
        ctx.beginPath();
        ctx.moveTo(barrier.x + 14 + i * 18, barrier.y + 10);
        ctx.lineTo(barrier.x + 25 + i * 18, barrier.y + 41);
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  drawSpecialItems(items) {
    const { ctx } = this;
    items.forEach((item) => {
      const cx = item.x + item.w / 2;
      const cy = item.y + item.h / 2;
      const pulse = 0.72 + Math.sin(item.t * 7) * 0.18;
      const isScore = item.kind === 'score';
      const isShield = item.kind === 'shield';
      const ring = isScore ? COLORS.violet : isShield ? COLORS.cyan : '#8fffc3';
      const ink = isScore ? COLORS.gold : isShield ? '#91ecff' : '#18bd83';
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = ring;
      ctx.shadowColor = ring;
      ctx.shadowBlur = 16;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 19 + Math.sin(item.t * 5) * 3, 0, Math.PI * 2); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      ctx.shadowColor = ring;
      ctx.shadowBlur = 14;
      if (isShield) {
        ctx.fillStyle = 'rgba(20, 96, 156, .9)';
        ctx.strokeStyle = COLORS.cyan;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let i = 0; i < 6; i += 1) {
          const angle = -Math.PI / 2 + i * Math.PI / 3;
          const px = cx + Math.cos(angle) * 15;
          const py = cy + Math.sin(angle) * 15;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#e8feff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.fillStyle = isScore ? 'rgba(44, 22, 78, .96)' : 'rgba(255, 244, 204, .96)';
        ctx.strokeStyle = isScore ? COLORS.violet : COLORS.gold;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - 10, cy - 15); ctx.lineTo(cx + 10, cy - 15); ctx.lineTo(cx + 10, cy + 12); ctx.lineTo(cx, cy + 17); ctx.lineTo(cx - 10, cy + 12); ctx.closePath();
        ctx.fill(); ctx.stroke();
        if (isScore) {
          ctx.fillStyle = COLORS.gold; ctx.font = '700 15px "Rajdhani", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('×2', cx, cy + 1);
        } else {
          ctx.fillStyle = ink; ctx.fillRect(cx - 2, cy - 8, 4, 16); ctx.fillRect(cx - 8, cy - 2, 16, 4); ctx.fillStyle = COLORS.cyan; ctx.fillRect(cx - 7, cy - 12, 14, 2);
        }
      }
      ctx.restore();
    });
  }

  drawPlayerBarrier(player) {
    const { ctx } = this;
    const cx = player.x + player.w / 2;
    const cy = player.y + player.h / 2;
    const ratio = Math.min(1, player.barrierTimer / 1.2);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.34 + Math.sin(player.enginePulse * .9) * .1 + player.barrierPulse * .35;
    ctx.strokeStyle = COLORS.cyan;
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 20;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, 42 + Math.sin(player.enginePulse) * 2, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.22 + ratio * .18;
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i += 1) { ctx.beginPath(); ctx.arc(cx, cy, 34 + i * 2, i * 1.05, i * 1.05 + .62); ctx.stroke(); }
    ctx.restore();
  }

  drawProjectiles(projectiles) {
    const { ctx } = this;
    projectiles.forEach((projectile) => {
      ctx.save();
      const isPlayer = projectile.faction === 'player';
      const color = isPlayer
        ? COLORS.cyan
        : projectile.style === 'boss-kappa'
          ? '#69f4ff'
          : projectile.style === 'boss-yatagarasu'
            ? COLORS.gold
            : projectile.style === 'boss-orochi'
              ? COLORS.magenta
              : COLORS.vermilion;
      projectile.trail.forEach((point) => {
        ctx.globalAlpha = point.life / 0.18 * .22;
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(point.x, point.y, 5, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.fillStyle = isPlayer ? COLORS.paper : color;
      if (isPlayer) {
        ctx.beginPath();
        ctx.moveTo(projectile.x + projectile.w / 2, projectile.y - 3);
        ctx.lineTo(projectile.x + projectile.w, projectile.y + projectile.h * .45);
        ctx.lineTo(projectile.x + projectile.w / 2, projectile.y + projectile.h + 3);
        ctx.lineTo(projectile.x, projectile.y + projectile.h * .45);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = COLORS.cyan;
        ctx.fillRect(projectile.x + projectile.w / 2 - 1, projectile.y + 3, 2, projectile.h - 6);
      } else {
        ctx.beginPath(); ctx.arc(projectile.x + projectile.w / 2, projectile.y + projectile.h / 2, projectile.w * .78, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    });
  }

  drawParticles(particles) {
    const { ctx } = this;
    particles.forEach((particle) => {
      ctx.save();
      ctx.globalAlpha = particle.life / particle.maxLife;
      ctx.fillStyle = particle.color;
      ctx.shadowColor = particle.color;
      ctx.shadowBlur = 8;
      ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
      ctx.restore();
    });
  }

  drawSkillPulse(pulse) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - pulse.time / pulse.duration) * .84;
    ctx.strokeStyle = COLORS.cyan;
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 24;
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(pulse.x, pulse.y, pulse.radius, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(pulse.x, pulse.y, pulse.radius * .78, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  drawCanvasHud(world) {
    const { ctx } = this;
    ctx.save();
    ctx.font = '600 13px "Noto Sans JP", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(5, 6, 22, .65)';
    ctx.fillRect(20, 16, 220, 38);
    ctx.strokeStyle = 'rgba(127, 247, 255, .65)';
    ctx.strokeRect(20, 16, 220, 38);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('SCORE', 34, 35);
    ctx.font = '700 20px "Rajdhani", sans-serif';
    ctx.fillStyle = COLORS.paper;
    ctx.fillText(String(world.score).padStart(7, '0'), 98, 35);
    ctx.font = '700 10px "Noto Sans JP", sans-serif';
    ctx.fillStyle = world.difficulty.key === 'hard' ? COLORS.magenta : world.difficulty.key === 'easy' ? COLORS.gold : COLORS.cyan;
    ctx.fillText(`難度: ${world.difficulty.english}`, 26, 66);
    if (world.specialItems.length > 0) {
      ctx.fillStyle = '#8fffc3';
      ctx.shadowColor = '#8fffc3'; ctx.shadowBlur = 8;
      ctx.fillText(`補助具 ×${world.specialItems.length}`, 128, 66);
      ctx.shadowBlur = 0;
    }
    if (world.scoreBoostTimer > 0) {
      ctx.fillStyle = COLORS.gold;
      ctx.shadowColor = COLORS.gold; ctx.shadowBlur = 8;
      ctx.fillText(`SCORE ×2  ${world.scoreBoostTimer.toFixed(1)}s`, 26, 83);
      ctx.shadowBlur = 0;
    }
    if (world.player.isShielded()) {
      ctx.fillStyle = COLORS.cyan;
      ctx.shadowColor = COLORS.cyan; ctx.shadowBlur = 8;
      ctx.fillText(`BARRIER  ${world.player.barrierTimer.toFixed(1)}s`, 26, 98);
      ctx.shadowBlur = 0;
    }

    ctx.font = '600 12px "Noto Sans JP", sans-serif';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('霊力', 20, GAME_HEIGHT - 24);
    ctx.strokeStyle = 'rgba(127, 247, 255, .7)';
    ctx.strokeRect(55, GAME_HEIGHT - 33, 150, 15);
    const energyRatio = world.player.energy / world.player.maxEnergy;
    ctx.fillStyle = energyRatio >= 1 ? COLORS.gold : COLORS.cyan;
    ctx.fillRect(57, GAME_HEIGHT - 31, 146 * energyRatio, 11);
    if (energyRatio >= 1) {
      ctx.fillStyle = COLORS.paper;
      ctx.font = '700 11px "Noto Sans JP", sans-serif';
      ctx.fillText('解放可能', 91, GAME_HEIGHT - 24);
    }

    if (world.combo > 1) {
      ctx.textAlign = 'right';
      ctx.font = '700 28px "Rajdhani", sans-serif';
      ctx.fillStyle = COLORS.magenta;
      ctx.shadowColor = COLORS.magenta;
      ctx.shadowBlur = 12;
      ctx.fillText(`${world.combo} COMBO`, GAME_WIDTH - 26, GAME_HEIGHT - 31);
      ctx.shadowBlur = 0;
    }

    if (world.boss && !world.boss.dead) {
      const ratio = Math.max(0, world.boss.hp / world.boss.maxHp);
      const bx = 263; const by = 17; const bw = 434;
      ctx.fillStyle = 'rgba(5, 6, 22, .72)';
      ctx.fillRect(bx, by, bw, 35);
      ctx.strokeStyle = COLORS.magenta; ctx.strokeRect(bx, by, bw, 35);
      ctx.fillStyle = COLORS.paper;
      ctx.font = '600 12px "Noto Sans JP", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(world.boss.name, GAME_WIDTH / 2, 27);
      ctx.fillStyle = '#3c164c'; ctx.fillRect(bx + 7, by + 22, bw - 14, 8);
      ctx.fillStyle = COLORS.magenta; ctx.fillRect(bx + 7, by + 22, (bw - 14) * ratio, 8);
    }
    ctx.restore();
  }

  drawBanner(banner) {
    const { ctx } = this;
    const p = 1 - banner.time / banner.maxTime;
    const alpha = Math.min(1, p * 4, banner.time * 4);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(5, 6, 22, .72)';
    ctx.fillRect(192, 210, 576, 92);
    ctx.strokeStyle = banner.title === 'WARNING' ? COLORS.crimson : COLORS.cyan;
    ctx.lineWidth = 2; ctx.strokeRect(192, 210, 576, 92);
    ctx.textAlign = 'center';
    ctx.fillStyle = banner.title === 'WARNING' ? COLORS.crimson : COLORS.paper;
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 16;
    ctx.font = '700 26px "Noto Sans JP", sans-serif';
    ctx.fillText(banner.title, GAME_WIDTH / 2, 244);
    ctx.shadowBlur = 0; ctx.fillStyle = COLORS.muted; ctx.font = '500 14px "Noto Sans JP", sans-serif';
    ctx.fillText(banner.text, GAME_WIDTH / 2, 274);
    ctx.restore();
  }

  drawPause() {
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = 'rgba(2, 3, 15, .72)'; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    ctx.strokeStyle = COLORS.cyan; ctx.lineWidth = 2; ctx.strokeRect(308, 194, 344, 144);
    ctx.textAlign = 'center'; ctx.fillStyle = COLORS.paper; ctx.font = '700 30px "Rajdhani", sans-serif'; ctx.fillText('PAUSED', GAME_WIDTH / 2, 247);
    ctx.fillStyle = COLORS.muted; ctx.font = '500 14px "Noto Sans JP", sans-serif'; ctx.fillText('Esc / P またはポーズボタンで再開', GAME_WIDTH / 2, 281);
    ctx.restore();
  }
}
