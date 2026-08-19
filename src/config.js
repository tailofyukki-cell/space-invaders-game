export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

export const COLORS = {
  ink: '#050616',
  navy: '#0a1030',
  cyan: '#7ff7ff',
  cyanDeep: '#24b9e6',
  violet: '#bc68ff',
  magenta: '#ff4aa2',
  crimson: '#ff4d6d',
  vermilion: '#ff7657',
  gold: '#ffd166',
  paper: '#eefaff',
  muted: '#94aac7',
  danger: '#ff3b55',
};

export const STORAGE_KEYS = {
  highScore: 'kagekiri-high-score',
  settings: 'kagekiri-settings',
};

export const DEFAULT_SETTINGS = {
  sound: 0.55,
  screenShake: true,
  difficulty: 'easy',
};

export const DIFFICULTIES = {
  easy: {
    key: 'easy',
    label: '見習い',
    english: 'EASY',
    shortLabel: '見習い / EASY',
    description: 'HP・支援結界・回復が充実。敵弾は大幅にゆるやかで、初見クリア向け。',
    playerHp: 10,
    playerSpeed: 1.14,
    invincibility: 2.05,
    playerDamage: 1.42,
    enemyHp: 0.45,
    enemyFireRate: 0.52,
    enemyShotSpeed: 0.62,
    enemyDiveChance: 0.3,
    formationSpeed: 0.67,
    bossHp: 0.48,
    bossFireRate: 0.55,
    bossShotCount: 0.58,
    energyGain: 2.1,
    barrierHp: 1.8,
    healDropChance: 0.24,
    scoreDropChance: 0.1,
    shieldDropChance: 0.1,
    scoreBoostDuration: 10,
    shieldDuration: 7,
    stageHeal: 2,
    bossShieldDuration: 5.5,
    waveEnergyBonus: 18,
    scoreMultiplier: 0.75,
  },
  normal: {
    key: 'normal',
    label: '守護者',
    english: 'NORMAL',
    shortLabel: '守護者 / NORMAL',
    description: '敵弾を見極め、コンボを狙う標準的な結界任務。',
    playerHp: 5,
    playerSpeed: 1,
    invincibility: 1.1,
    playerDamage: 1,
    enemyHp: 1,
    enemyFireRate: 1,
    enemyShotSpeed: 1,
    enemyDiveChance: 1,
    formationSpeed: 1,
    bossHp: 1,
    bossFireRate: 1,
    bossShotCount: 1,
    energyGain: 1,
    barrierHp: 1,
    healDropChance: 0.08,
    scoreDropChance: 0.06,
    shieldDropChance: 0.04,
    scoreBoostDuration: 7,
    shieldDuration: 4.5,
    scoreMultiplier: 1,
  },
  hard: {
    key: 'hard',
    label: '修羅',
    english: 'HARD',
    shortLabel: '修羅 / HARD',
    description: '高速弾幕と強化された穢機に挑む、熟練者向け任務。',
    playerHp: 3,
    playerSpeed: 0.97,
    invincibility: 0.8,
    playerDamage: 0.95,
    enemyHp: 1.35,
    enemyFireRate: 1.35,
    enemyShotSpeed: 1.18,
    enemyDiveChance: 1.65,
    formationSpeed: 1.25,
    bossHp: 1.35,
    bossFireRate: 1.28,
    bossShotCount: 1.25,
    energyGain: 0.78,
    barrierHp: 0.85,
    healDropChance: 0.05,
    scoreDropChance: 0.04,
    shieldDropChance: 0.03,
    scoreBoostDuration: 6,
    shieldDuration: 4,
    scoreMultiplier: 1.35,
  },
};

export function getDifficulty(key) {
  return DIFFICULTIES[key] || DIFFICULTIES.easy;
}

export const ENEMY_TYPES = {
  oni: {
    label: '鬼面ドローン',
    color: COLORS.crimson,
    accent: COLORS.gold,
    score: 150,
    hp: 2,
    speed: 32,
    fireRate: 0.95,
    shotSpeed: 230,
    diveChance: 0,
  },
  kitsune: {
    label: '狐面ドローン',
    color: '#f4f4ff',
    accent: COLORS.magenta,
    score: 220,
    hp: 2,
    speed: 40,
    fireRate: 1.12,
    shotSpeed: 250,
    diveChance: 0.0025,
  },
  chochin: {
    label: '提灯ドローン',
    color: COLORS.gold,
    accent: COLORS.vermilion,
    score: 320,
    hp: 3,
    speed: 48,
    fireRate: 0.78,
    shotSpeed: 275,
    diveChance: 0.004,
  },
  hebi: {
    label: '蛇霊ドローン',
    color: COLORS.violet,
    accent: COLORS.cyan,
    score: 380,
    hp: 3,
    speed: 55,
    fireRate: 0.96,
    shotSpeed: 285,
    diveChance: 0.007,
  },
  tengu: {
    label: '天狗面ドローン',
    color: '#ff6a65',
    accent: COLORS.gold,
    score: 470,
    hp: 4,
    speed: 62,
    fireRate: 1.08,
    shotSpeed: 305,
    diveChance: 0.011,
  },
};

export const STAGES = [
  {
    id: 'torii-gate',
    chapter: 'CHAPTER 01',
    name: '第一結界 — 朱ノ鳥居',
    intro: '穢機群、月都南門より侵入。結界を維持せよ。',
    theme: 'torii',
    transitionText: '南門結界、復旧。水鏡結界へ転送します。',
    tuning: { hp: 1, fireRate: 1, shotSpeed: 1, diveChance: 1, formation: 1 },
    restoreEnergy: 50,
    waves: [
      { type: 'oni', rows: 3, cols: 7, formation: 'march', gapX: 72, gapY: 48 },
      { type: 'kitsune', rows: 3, cols: 8, formation: 'march', gapX: 70, gapY: 50 },
      { type: 'chochin', rows: 2, cols: 9, formation: 'march', gapX: 68, gapY: 56 },
    ],
    boss: { kind: 'orochi', name: '紅月ノヲロチ', hp: 150, score: 5000, color: '#36113a', accent: COLORS.magenta },
  },
  {
    id: 'water-mirror',
    chapter: 'CHAPTER 02',
    name: '第二結界 — 碧ノ水鏡',
    intro: '地下水路の鏡面結界が汚染されました。蒼い流れを取り戻してください。',
    theme: 'water',
    transitionText: '水鏡結界、浄化完了。黒曜霊峰へ最終転送します。',
    tuning: { hp: 1.13, fireRate: 1.14, shotSpeed: 1.08, diveChance: 1.18, formation: 1.12 },
    restoreEnergy: 50,
    waves: [
      { type: 'kitsune', rows: 3, cols: 8, formation: 'march', gapX: 70, gapY: 50 },
      { type: 'chochin', rows: 3, cols: 8, formation: 'march', gapX: 68, gapY: 52 },
      { type: 'hebi', rows: 3, cols: 7, formation: 'march', gapX: 74, gapY: 52 },
    ],
    easyBossRelief: { kind: 'heal', label: '結界修復札', message: '水鏡の補給札を検出。河童戦の前に回収してください。' },
    boss: { kind: 'kappa', name: '蒼渦ノ河童', hp: 205, score: 7200, color: '#0c3159', accent: COLORS.cyan },
  },
  {
    id: 'obsidian-peak',
    chapter: 'CHAPTER 03',
    name: '第三結界 — 黒曜霊峰',
    intro: '蝕月が結界核を侵食しています。月都最深部で、元凶を断て。',
    theme: 'mountain',
    transitionText: '月都全結界、正常化。夜明けを確認しました。',
    tuning: { hp: 1.28, fireRate: 1.28, shotSpeed: 1.17, diveChance: 1.48, formation: 1.27 },
    restoreEnergy: 55,
    waves: [
      { type: 'hebi', rows: 3, cols: 8, formation: 'march', gapX: 70, gapY: 52 },
      { type: 'tengu', rows: 3, cols: 8, formation: 'march', gapX: 70, gapY: 52 },
      { type: 'oni', rows: 4, cols: 8, formation: 'march', gapX: 68, gapY: 46 },
    ],
    boss: { kind: 'yatagarasu', name: '天裂ノ八咫', hp: 270, score: 10500, color: '#21152f', accent: COLORS.gold },
  },
];

export const TEXT = {
  title: '月影防衛線',
  subtitle: 'KAGEKIRI PROTOCOL',
};

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function rand(min, max) {
  return min + Math.random() * (max - min);
}
