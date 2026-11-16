export const TABLE = Object.freeze({
  WIDTH: 1.525,
  LENGTH: 2.74,
  HEIGHT: 0.76,
  THICKNESS: 0.05,
  NET_HEIGHT: 0.1525,
  NET_OVERHANG: 0.1525,
  HALF_WIDTH: 1.525 / 2,
  HALF_LENGTH: 2.74 / 2,
});

export const BALL = Object.freeze({
  RADIUS: 0.022,
  MASS: 0.0027,
  GRAVITY: 9.81,
  DRAG: 0.035,
  MAGNUS: 0.055,
  RESTITUTION: 0.86,
  FRICTION: 0.9,
});

export const PLAYER = Object.freeze({
  PADDLE_Z: 1.62,
  X_OFFSET: 0.22,
  X_LEFT_RANGE: 0.95,
  X_RIGHT_RANGE: 0.68,
  Y_MIN: 0.72,
  Y_MAX: 1.48,
  PADDLE_RADIUS: 0.105,
  HIT_COOLDOWN: 0.24,
  SWING_WINDOW: 0.22,
  MAX_CHARGE: 0.85,
});

export const AI = Object.freeze({
  PADDLE_Z: -1.62,
  BODY_Z: -2.55,
  X_RANGE: 0.72,
  Y_MIN: 0.82,
  Y_MAX: 1.45,
  PADDLE_RADIUS: 0.15,
  HIT_COOLDOWN: 0.26,
});

export const CAMERA = Object.freeze({
  PLAY_POS: [0.05, 1.53, 2.62],
  PLAY_LOOK: [0, 1.13, -0.72],
  MENU_POS: [3.45, 2.35, 4.65],
  MENU_LOOK: [0, 0.82, 0],
  MENU_ORBIT_RADIUS: 4.9,
  MENU_ORBIT_HEIGHT: 2.45,
  FOV: 67,
});

export const MATCH = Object.freeze({
  TARGET_SCORE: 7,
  WIN_BY: 2,
  SERVE_INTERVAL: 2,
  DEUCE_SCORE: 6,
  POINT_DELAY: 1.25,
});

export const DIFFICULTIES = Object.freeze({
  easy: {
    key: 'easy',
    label: '新手',
    shortLabel: '新手',
    reaction: 0.36,
    maxSpeed: 3.15,
    predictionError: 0.2,
    aimErrorX: 0.24,
    aimErrorZ: 0.16,
    shotTimeMin: 0.76,
    shotTimeMax: 0.88,
    power: 0.58,
    missChance: 0.1,
    playerAssist: 0.115,
    aiAssist: 0.06,
    serveDelay: 1.1,
    ballSpeedScale: 0.94,
  },
  normal: {
    key: 'normal',
    label: '业余',
    shortLabel: '业余',
    reaction: 0.23,
    maxSpeed: 4.05,
    predictionError: 0.115,
    aimErrorX: 0.14,
    aimErrorZ: 0.1,
    shotTimeMin: 0.64,
    shotTimeMax: 0.76,
    power: 0.74,
    missChance: 0.045,
    playerAssist: 0.075,
    aiAssist: 0.045,
    serveDelay: 0.9,
    ballSpeedScale: 1,
  },
  hard: {
    key: 'hard',
    label: '高手',
    shortLabel: '高手',
    reaction: 0.145,
    maxSpeed: 4.85,
    predictionError: 0.055,
    aimErrorX: 0.075,
    aimErrorZ: 0.055,
    shotTimeMin: 0.56,
    shotTimeMax: 0.68,
    power: 0.88,
    missChance: 0.018,
    playerAssist: 0.045,
    aiAssist: 0.03,
    serveDelay: 0.72,
    ballSpeedScale: 1.06,
  },
});

export const COLORS = Object.freeze({
  table: 0x0b4d80,
  tableEdge: 0xf4f8ff,
  net: 0x0b111a,
  ball: 0xffe9c7,
  cyan: 0x61e7ff,
  orange: 0xff8a3d,
  red: 0xd9553f,
  wood: 0x8a5a36,
  robot: 0x1b283c,
  robotGlow: 0x62e9ff,
});

export const SERVE = Object.freeze({
  TOSS_HEIGHT: 0.43,
  TOSS_TIME: 0.78,
  HIT_WINDOW_START: 0.15,
  HIT_WINDOW_END: 0.62,
  FIRST_BOUNCE_TIME: 0.32,
  FIRST_BOUNCE_Z: 0.48,
  SECOND_BOUNCE_TIME: 0.52,
  TARGET_Z: 0.96,
});
