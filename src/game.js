import { COLORS, ENEMY_TYPES, GAME_HEIGHT, GAME_WIDTH, STAGES, STORAGE_KEYS, clamp, getDifficulty, rand, rectsOverlap } from './config.js';
import { Barrier, Boss, Enemy, Particle, Player } from './entities.js';

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
    this.stage = STAGES[0];
    this.waveIndex = 0;
    this.waveDelay = 0;
    this.difficulty = getDifficulty(this.getSettings().difficulty);
    this.player = new Player(this.difficulty);
    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.barriers = [];
    this.boss = null;
    this.skillPulse = null;
    this.formation = { offsetX: 0, direction: 1, speed: 32, drop: 0, minX: 100, maxX: 860 };
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.highScore = 0;
    this.elapsed = 0;
    this.shake = 0;
    this.flash = 0;
    this.banner = null;
    this.bossWarning = 0;
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
    this.banner = { title: `${this.stage.name} — ${this.difficulty.label}`, text: this.stage.intro, time: 2.4, maxTime: 2.4 };
    this.onMessage?.(`${this.difficulty.label}任務を開始します。結界を維持してください。`, 'info');
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

    this.player.update(dt, this.input.actions);
    if (this.input.actions.fire && this.player.canFire()) this.playerFire();
    if (this.input.actions.skill && this.player.canSkill()) this.activateSkill();

    this.updateFormation(dt);
    this.updateEnemies(dt);
    this.updateBoss(dt);
    this.updateProjectiles(dt);
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
    const speed = (this.formation.speed + (this.waveIndex * 7) + Math.min(55, (48 - active.length) * 1.1)) * this.difficulty.formationSpeed;
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
  }

  updateProjectiles(dt) {
    this.projectiles.forEach((projectile) => projectile.update(dt));
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
          if (this.player.takeDamage(projectile.damage)) {
            this.shake = 0.45;
            this.flash = 0.2;
            this.combo = 0;
            this.addParticles(this.player.x + this.player.w / 2, this.player.y + this.player.h / 2, COLORS.crimson, 28, { life: 0.55, size: 4 });
            this.audio.hit();
            this.onMessage?.('結界機、被弾。HPを確認してください。', 'danger');
          }
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
    if (this.player.dead) this.finish('gameOver');
  }

  damageEnemy(enemy, damage, skill) {
    const died = enemy.hit(damage);
    this.addParticles(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, enemy.type.accent, died ? 22 : 6, { life: died ? 0.6 : 0.2, size: died ? 4 : 2 });
    if (!died) return;
    this.score += Math.round(enemy.value * this.difficulty.scoreMultiplier * (1 + Math.min(this.combo, 75) * 0.012));
    this.combo += 1;
    this.comboTimer = 2.5;
    this.player.energy = clamp(this.player.energy + (skill ? 7 : 9) * this.difficulty.energyGain, 0, this.player.maxEnergy);
    this.audio.destroy();
  }

  damageBoss(damage, skill) {
    const died = this.boss.hit(damage);
    this.addParticles(this.boss.x + this.boss.w / 2, this.boss.y + this.boss.h / 2, skill ? COLORS.cyan : COLORS.magenta, died ? 100 : 10, { life: died ? 1.2 : 0.3, size: died ? 6 : 3 });
    if (!died) return;
    this.score += Math.round((this.boss.score + this.combo * 35) * this.difficulty.scoreMultiplier);
    this.audio.clear();
    this.shake = 1;
    this.flash = 0.6;
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
    if (this.state === 'boss' && this.boss?.dead) this.finish('clear');
  }

  beginWave() {
    const spec = this.stage.waves[this.waveIndex];
    if (!spec) {
      this.state = 'bossWarning';
      this.bossWarning = 2.1;
      this.banner = { title: 'WARNING', text: '大型穢機《紅月ノヲロチ》接近。結界を最大出力へ。', time: 2.1, maxTime: 2.1 };
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
        this.enemies.push(new Enemy(spec.type, startX + col * spec.gapX, startY + row * spec.gapY, slot, formationWidth, this.difficulty));
        slot += 1;
      }
    }
    this.banner = { title: `WAVE ${this.waveIndex + 1}`, text: `${ENEMY_TYPES[spec.type].label}編隊を迎撃せよ。`, time: 1.35, maxTime: 1.35 };
    this.waveIndex += 1;
  }

  spawnBoss() {
    this.state = 'boss';
    this.boss = new Boss(this.stage.boss, this.difficulty);
    this.onMessage?.('紅月ノヲロチを確認。攻撃パターンを見極めてください。', 'danger');
  }

  finish(result) {
    if (this.state === 'gameOver' || this.state === 'clear') return;
    this.state = result;
    this.input.clear();
    const currentHighScore = Number(localStorage.getItem(this.highScoreKey()) || 0);
    const isNewRecord = this.score > currentHighScore;
    if (isNewRecord) localStorage.setItem(this.highScoreKey(), String(this.score));
    this.onFinish?.({ result, score: this.score, highScore: Math.max(this.score, currentHighScore), isNewRecord, wave: this.waveIndex, combo: this.combo, difficulty: this.difficulty });
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
      boss: this.boss && !this.boss.dead ? { hp: this.boss.hp, maxHp: this.boss.maxHp, name: this.boss.name } : null,
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
  }

  render(world) {
    const { ctx } = this;
    ctx.save();
    const shake = world.getSettings().screenShake ? world.shake * 9 : 0;
    if (shake > 0) ctx.translate(rand(-shake, shake), rand(-shake, shake));
    this.drawBackground(world);
    this.drawBarriers(world.barriers);
    this.drawParticles(world.particles);
    this.drawProjectiles(world.projectiles);
    world.enemies.forEach((enemy) => this.drawEnemy(enemy));
    if (world.boss && !world.boss.dead) this.drawBoss(world.boss);
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

  drawProjectiles(projectiles) {
    const { ctx } = this;
    projectiles.forEach((projectile) => {
      ctx.save();
      const isPlayer = projectile.faction === 'player';
      const color = isPlayer ? COLORS.cyan : projectile.style === 'boss' ? COLORS.magenta : COLORS.vermilion;
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
