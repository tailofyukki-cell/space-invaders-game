import { COLORS, ENEMY_TYPES, GAME_HEIGHT, GAME_WIDTH, clamp, rand } from './config.js';

export class Projectile {
  constructor({ x, y, vx = 0, vy, w = 8, h = 18, faction, damage = 1, style = 'shot', life = 3 }) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.w = w;
    this.h = h;
    this.faction = faction;
    this.damage = damage;
    this.style = style;
    this.life = life;
    this.dead = false;
    this.trail = [];
  }

  update(dt) {
    this.life -= dt;
    this.trail.push({ x: this.x + this.w / 2, y: this.y + this.h / 2, life: 0.18 });
    if (this.trail.length > 8) this.trail.shift();
    this.trail.forEach((point) => { point.life -= dt; });
    this.trail = this.trail.filter((point) => point.life > 0);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.life <= 0 || this.y < -60 || this.y > GAME_HEIGHT + 60 || this.x < -60 || this.x > GAME_WIDTH + 60) {
      this.dead = true;
    }
  }
}

export class Player {
  constructor(difficulty) {
    this.difficulty = difficulty;
    this.w = 46;
    this.h = 54;
    this.x = GAME_WIDTH / 2 - this.w / 2;
    this.y = GAME_HEIGHT - 88;
    this.speed = 390 * difficulty.playerSpeed;
    this.maxHp = difficulty.playerHp;
    this.hp = this.maxHp;
    this.fireCooldown = 0;
    this.fireInterval = 0.17;
    this.shotDamage = 1.2 * difficulty.playerDamage;
    this.invincible = 0;
    this.invincibilityDuration = difficulty.invincibility;
    this.barrierTimer = 0;
    this.barrierPulse = 0;
    this.barrierHitCooldown = 0;
    this.energy = 0;
    this.maxEnergy = 100;
    this.skillCooldown = 0;
    this.dead = false;
    this.enginePulse = 0;
  }

  update(dt, input) {
    let horizontal = 0;
    if (input.moveLeft) horizontal -= 1;
    if (input.moveRight) horizontal += 1;
    this.x = clamp(this.x + horizontal * this.speed * dt, 18, GAME_WIDTH - this.w - 18);
    this.fireCooldown -= dt;
    this.invincible = Math.max(0, this.invincible - dt);
    this.barrierTimer = Math.max(0, this.barrierTimer - dt);
    this.barrierPulse = Math.max(0, this.barrierPulse - dt);
    this.barrierHitCooldown = Math.max(0, this.barrierHitCooldown - dt);
    this.skillCooldown = Math.max(0, this.skillCooldown - dt);
    this.enginePulse += dt * 8;
  }

  canFire() {
    return this.fireCooldown <= 0;
  }

  fire() {
    this.fireCooldown = this.fireInterval;
    return [
      new Projectile({ x: this.x + 10, y: this.y - 4, vx: -60, vy: -620, faction: 'player', style: 'ofuda', damage: this.shotDamage }),
      new Projectile({ x: this.x + this.w - 18, y: this.y - 4, vx: 60, vy: -620, faction: 'player', style: 'ofuda', damage: this.shotDamage }),
    ];
  }

  canSkill() {
    return this.energy >= this.maxEnergy && this.skillCooldown <= 0;
  }

  useSkill() {
    this.energy = 0;
    this.skillCooldown = 1.1;
    return { x: this.x + this.w / 2, y: this.y + this.h / 2, radius: 25, maxRadius: 430, time: 0, duration: 0.7 };
  }

  takeDamage(amount) {
    if (this.invincible > 0 || this.dead) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.invincible = this.invincibilityDuration;
    if (this.hp <= 0) this.dead = true;
    return true;
  }

  heal(amount = 1) {
    if (this.dead || this.hp >= this.maxHp) return 0;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp - before;
  }

  grantBarrier(duration) {
    this.barrierTimer = Math.min(9, Math.max(this.barrierTimer, 0) + duration);
    this.barrierPulse = 0.4;
  }

  isShielded() {
    return this.barrierTimer > 0;
  }

  absorbBarrierHit() {
    this.barrierPulse = 0.3;
    if (this.barrierHitCooldown > 0) return false;
    this.barrierHitCooldown = 0.35;
    return true;
  }
}

export class SpecialPickup {
  constructor(x, y, kind = 'heal') {
    this.kind = kind;
    this.x = x - 14;
    this.y = y - 12;
    this.w = 28;
    this.h = 34;
    this.baseX = this.x;
    this.vy = 78;
    this.life = 6.5;
    this.t = 0;
    this.dead = false;
  }

  update(dt) {
    this.t += dt;
    this.life -= dt;
    this.y += this.vy * dt;
    this.x = this.baseX + Math.sin(this.t * 3.6) * 16;
    if (this.life <= 0 || this.y > GAME_HEIGHT + 42) this.dead = true;
  }
}

export class Enemy {
  constructor(typeKey, x, y, slot, formationWidth, difficulty, stageTuning = {}) {
    this.typeKey = typeKey;
    this.type = ENEMY_TYPES[typeKey];
    this.difficulty = difficulty;
    this.stageTuning = { hp: 1, fireRate: 1, shotSpeed: 1, diveChance: 1, ...stageTuning };
    this.x = x;
    this.y = y;
    this.homeX = x;
    this.homeY = y;
    this.slot = slot;
    this.formationWidth = formationWidth;
    this.w = 42;
    this.h = 36;
    this.hp = Math.max(1, Math.round(this.type.hp * difficulty.enemyHp * this.stageTuning.hp));
    this.maxHp = this.hp;
    this.dead = false;
    this.t = rand(0, 6.28);
    this.fireTimer = rand(0.3, 1.5) / (this.type.fireRate * difficulty.enemyFireRate * this.stageTuning.fireRate);
    this.diving = false;
    this.diveTime = 0;
    this.diveOrigin = { x, y };
    this.value = this.type.score;
    this.flash = 0;
  }

  update(dt, formation) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.fireTimer -= dt;
    if (this.diving) {
      this.diveTime += dt;
      const progress = this.diveTime / 2.15;
      this.x = this.diveOrigin.x + Math.sin(progress * Math.PI * 2.1) * 135;
      this.y = this.diveOrigin.y + progress * 440;
      if (progress >= 1.06 || this.y > GAME_HEIGHT + 60) {
        this.diving = false;
        this.diveTime = 0;
        this.x = this.homeX;
        this.y = this.homeY;
      }
      return;
    }
    const formationOffset = formation.offsetX;
    const bob = Math.sin(this.t * 2.4 + this.slot * 0.47) * 3;
    this.x = this.homeX + formationOffset;
    this.y = this.homeY + bob;
    if (Math.random() < this.type.diveChance * this.difficulty.enemyDiveChance * this.stageTuning.diveChance * dt * 60) {
      this.diving = true;
      this.diveOrigin = { x: this.x, y: this.y };
    }
  }

  readyToFire() {
    if (this.fireTimer > 0) return false;
    this.fireTimer = rand(0.8, 1.8) / (this.type.fireRate * this.difficulty.enemyFireRate * this.stageTuning.fireRate);
    return true;
  }

  fire() {
    const spread = this.typeKey === 'chochin' ? 2 : 1;
    const shots = [];
    for (let i = 0; i < spread; i += 1) {
      const angle = (i - (spread - 1) / 2) * 0.18;
      shots.push(new Projectile({
        x: this.x + this.w / 2 - 4,
        y: this.y + this.h - 2,
        vx: Math.sin(angle) * 110,
        vy: this.type.shotSpeed * this.difficulty.enemyShotSpeed * this.stageTuning.shotSpeed,
        faction: 'enemy',
        style: this.typeKey,
        damage: 1,
        w: 8,
        h: 14,
        life: 4,
      }));
    }
    return shots;
  }

  hit(damage) {
    this.hp -= damage;
    this.flash = 0.14;
    if (this.hp <= 0) {
      this.dead = true;
      return true;
    }
    return false;
  }
}

export class Boss {
  constructor({ name, hp, score, kind = 'orochi', color = '#36113a', accent = '#ff4aa2' }, difficulty) {
    this.name = name;
    this.kind = kind;
    this.color = color;
    this.accent = accent;
    this.maxHp = Math.max(1, Math.round(hp * difficulty.bossHp));
    this.hp = this.maxHp;
    this.score = score;
    this.fireRate = difficulty.bossFireRate;
    this.shotCount = difficulty.bossShotCount;
    this.w = kind === 'yatagarasu' ? 258 : 236;
    this.h = kind === 'yatagarasu' ? 164 : 150;
    this.x = GAME_WIDTH / 2 - this.w / 2;
    this.y = -this.h;
    this.targetY = 50;
    this.t = 0;
    this.phase = 'enter';
    this.fireTimer = 1.2;
    this.pattern = 0;
    this.patternClock = 0;
    this.enraged = false;
    this.phaseTransition = 0;
    this.phaseAnnounced = false;
    this.dead = false;
    this.flash = 0;
  }

  update(dt) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.phaseTransition = Math.max(0, this.phaseTransition - dt);
    if (this.phase === 'enter') {
      this.y += 75 * dt;
      if (this.y >= this.targetY) {
        this.y = this.targetY;
        this.phase = 'fight';
      }
      return [];
    }
    if (this.phaseTransition > 0) return [];
    const motion = this.kind === 'kappa'
      ? { sway: 148, xSpeed: 0.88, yAmp: 11, ySpeed: 2.7 }
      : this.kind === 'yatagarasu'
        ? { sway: 238, xSpeed: 0.92, yAmp: 12, ySpeed: 2.15 }
        : { sway: 205, xSpeed: 0.68, yAmp: 7, ySpeed: 1.9 };
    this.x = GAME_WIDTH / 2 - this.w / 2 + Math.sin(this.t * motion.xSpeed) * motion.sway;
    this.y = this.targetY + Math.sin(this.t * motion.ySpeed) * motion.yAmp;
    this.fireTimer -= dt;
    this.patternClock += dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = ((this.hp < this.maxHp * 0.48 ? 0.55 : 0.85) * (this.enraged ? 0.72 : 1)) / this.fireRate;
      this.pattern = (this.pattern + 1 + (this.enraged ? 1 : 0)) % 3;
      return this.attack();
    }
    return [];
  }

  attack() {
    const shots = [];
    const originX = this.x + this.w / 2;
    const originY = this.y + this.h - 12;
    if (this.kind === 'kappa') {
      if (this.pattern === 0) {
        const count = Math.max(5, Math.round(8 * this.shotCount * (this.enraged ? 1.25 : 1)));
        for (let i = 0; i < count; i += 1) {
          const angle = (i / Math.max(1, count - 1) - 0.5) * 0.92;
          shots.push(new Projectile({ x: originX, y: originY, vx: Math.sin(angle) * 175, vy: 205 + Math.cos(angle) * 62, faction: 'enemy', style: 'boss-kappa', damage: 1, w: 11, h: 17, life: 4.4 }));
        }
      } else if (this.pattern === 1) {
        const count = Math.max(7, Math.round(11 * this.shotCount * (this.enraged ? 1.25 : 1)));
        for (let i = 0; i < count; i += 1) {
          const angle = (i / count) * Math.PI * 1.36 + this.t * 1.7;
          shots.push(new Projectile({ x: originX, y: originY, vx: Math.cos(angle) * 185, vy: 155 + Math.sin(angle) * 155, faction: 'enemy', style: 'boss-kappa', damage: 1, w: 10, h: 16, life: 4.2 }));
        }
      } else {
        const count = Math.max(3, Math.round(6 * this.shotCount * (this.enraged ? 1.25 : 1)));
        for (let i = 0; i < count; i += 1) {
          const offset = i - (count - 1) / 2;
          shots.push(new Projectile({ x: originX + offset * 46, y: originY, vx: offset * 16, vy: 310, faction: 'enemy', style: 'boss-kappa', damage: 1, w: 13, h: 23, life: 3.5 }));
        }
      }
      return shots;
    }
    if (this.kind === 'yatagarasu') {
      if (this.pattern === 0) {
        const count = Math.max(5, Math.round(7 * this.shotCount * (this.enraged ? 1.25 : 1)));
        for (let i = 0; i < count; i += 1) {
          const angle = (i / Math.max(1, count - 1) - 0.5) * 1.28;
          shots.push(new Projectile({ x: originX, y: originY, vx: Math.sin(angle) * 268, vy: 205 + Math.cos(angle) * 76, faction: 'enemy', style: 'boss-yatagarasu', damage: 1, w: 12, h: 19, life: 4.1 }));
        }
      } else if (this.pattern === 1) {
        const count = Math.max(12, Math.round(18 * this.shotCount * (this.enraged ? 1.25 : 1)));
        for (let i = 0; i < count; i += 1) {
          const angle = (i / count) * Math.PI * 2 + this.t * 1.35;
          shots.push(new Projectile({ x: originX, y: originY - 14, vx: Math.cos(angle) * 198, vy: Math.sin(angle) * 182 + 170, faction: 'enemy', style: 'boss-yatagarasu', damage: 1, w: 10, h: 15, life: 4 }));
        }
      } else {
        const count = Math.max(5, Math.round(8 * this.shotCount * (this.enraged ? 1.25 : 1)));
        for (let i = 0; i < count; i += 1) {
          const offset = i - (count - 1) / 2;
          shots.push(new Projectile({ x: originX + offset * 30, y: originY - 4, vx: offset * 54, vy: 360 - Math.abs(offset) * 28, faction: 'enemy', style: 'boss-yatagarasu', damage: 1, w: 12, h: 20, life: 3.3 }));
        }
      }
      return shots;
    }
    if (this.pattern === 0) {
      const count = Math.max(5, Math.round(9 * this.shotCount * (this.enraged ? 1.25 : 1)));
      for (let i = 0; i < count; i += 1) {
        const angle = (i / Math.max(1, count - 1) - 0.5) * 1.12;
        shots.push(new Projectile({ x: originX, y: originY, vx: Math.sin(angle) * 210, vy: 220 + Math.cos(angle) * 48, faction: 'enemy', style: 'boss-orochi', damage: 1, w: 11, h: 18, life: 4.2 }));
      }
    } else if (this.pattern === 1) {
      const count = Math.max(3, Math.round(5 * this.shotCount * (this.enraged ? 1.25 : 1)));
      for (let i = 0; i < count; i += 1) {
        const offset = i - (count - 1) / 2;
        shots.push(new Projectile({ x: originX + offset * 34, y: originY, vx: offset * 38, vy: 325, faction: 'enemy', style: 'boss-orochi', damage: 1, w: 12, h: 22, life: 3.2 }));
      }
    } else {
      const count = Math.max(10, Math.round(16 * this.shotCount * (this.enraged ? 1.25 : 1)));
      for (let i = 0; i < count; i += 1) {
        const angle = (i / count) * Math.PI * 2 + this.t;
        shots.push(new Projectile({ x: originX, y: originY - 12, vx: Math.cos(angle) * 165, vy: Math.sin(angle) * 165 + 135, faction: 'enemy', style: 'boss-orochi', damage: 1, w: 9, h: 14, life: 3.8 }));
      }
    }
    return shots;
  }

  hit(damage) {
    this.hp -= damage;
    this.flash = 0.12;
    if (this.hp <= 0) {
      this.dead = true;
      return true;
    }
    if (!this.enraged && this.hp <= this.maxHp * 0.5) {
      this.enraged = true;
      this.phaseTransition = 0.82;
      this.fireTimer = 1.1;
      this.pattern = 2;
      this.flash = 0.62;
    }
    return false;
  }
}

export class Barrier {
  constructor(x, difficulty) {
    this.x = x;
    this.y = GAME_HEIGHT - 192;
    this.w = 106;
    this.h = 50;
    this.maxHp = Math.max(1, Math.round(24 * difficulty.barrierHp));
    this.hp = this.maxHp;
    this.dead = false;
  }

  hit(damage = 1) {
    this.hp = Math.max(0, this.hp - damage);
    if (this.hp <= 0) this.dead = true;
  }
}

export class Particle {
  constructor(x, y, color, options = {}) {
    this.x = x;
    this.y = y;
    this.vx = options.vx ?? rand(-95, 95);
    this.vy = options.vy ?? rand(-95, 95);
    this.life = options.life ?? rand(0.28, 0.62);
    this.maxLife = this.life;
    this.size = options.size ?? rand(2, 5);
    this.color = color;
    this.drag = options.drag ?? 0.91;
    this.dead = false;
  }

  update(dt) {
    this.life -= dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= this.drag;
    this.vy *= this.drag;
    if (this.life <= 0) this.dead = true;
  }
}
