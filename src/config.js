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
};

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
};

export const STAGES = [
  {
    id: 'wave-1',
    name: '第一結界 — 朱ノ鳥居',
    intro: '穢機群、月都南門より侵入。結界を維持せよ。',
    waves: [
      { type: 'oni', rows: 3, cols: 7, formation: 'march', gapX: 72, gapY: 48 },
      { type: 'kitsune', rows: 3, cols: 8, formation: 'march', gapX: 70, gapY: 50 },
      { type: 'chochin', rows: 2, cols: 9, formation: 'march', gapX: 68, gapY: 56 },
    ],
    boss: {
      name: '紅月ノヲロチ',
      hp: 150,
      score: 5000,
    },
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
