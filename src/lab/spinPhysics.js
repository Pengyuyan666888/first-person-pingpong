import * as THREE from 'three';
import { BALL, TABLE } from '../game/constants.js';
import { clamp } from '../game/utils.js';

export const LAB_AIR = Object.freeze({
  DENSITY: 1.225,
  DRAG_COEFFICIENT: 0.45,
  SPIN_DECAY: 0.11,
  BASE_SPIN: 360,
  MAX_SPIN: 520,
  TABLE_RESTITUTION: 0.86,
  TABLE_FRICTION: 0.93,
  BOUNCE_SPIN_KICK: 0.011,
});

export const LAB_ORIGIN = new THREE.Vector3(0, 1.08, 1.55);
export const LAB_TARGET = new THREE.Vector3(0, TABLE.HEIGHT + BALL.RADIUS, -0.95);
export const LAB_FLIGHT_TIME = 0.65;
export const LAB_MAX_TIME = 3.2;

export const SPIN_PRESETS = Object.freeze({
  topspin: {
    key: 'topspin',
    label: '上旋',
    short: 'TOP',
    color: 0xff8a3d,
    axis: [-1, 0, 0],
    description: '马格努斯力向下，弧线提前下扎，落台后向前窜。',
  },
  backspin: {
    key: 'backspin',
    label: '下旋',
    short: 'BACK',
    color: 0x61e7ff,
    axis: [1, 0, 0],
    description: '马格努斯力向上，球更飘，落台后减速、弹跳更高。',
  },
  sidespin: {
    key: 'sidespin',
    label: '侧旋',
    short: 'SIDE',
    color: 0xff5cd6,
    axis: [0, 1, 0],
    description: '马格努斯力横向，空中拐弯，落台后继续侧跳。',
  },
  sidetop: {
    key: 'sidetop',
    label: '侧上旋',
    short: 'SIDE+TOP',
    color: 0xb6ff5c,
    axis: [-0.72, 0.7, 0],
    description: '横向弯曲与下扎叠在一起，最接近比赛里的“香蕉弧圈”。',
  },
});

const AREA = Math.PI * BALL.RADIUS * BALL.RADIUS;
const DRAG_K = (0.5 * LAB_AIR.DENSITY * LAB_AIR.DRAG_COEFFICIENT * AREA) / BALL.MASS;
const MAGNUS_K = (0.5 * LAB_AIR.DENSITY * AREA) / BALL.MASS;
const TABLE_SURFACE = TABLE.HEIGHT + BALL.RADIUS;
const ZERO = new THREE.Vector3();

export function getSpin(key, strength = 0.72) {
  const preset = SPIN_PRESETS[key];
  if (!preset) return new THREE.Vector3();
  const axis = new THREE.Vector3(...preset.axis).normalize();
  const magnitude = clamp(LAB_AIR.BASE_SPIN * strength, 0, LAB_AIR.MAX_SPIN);
  return axis.multiplyScalar(magnitude);
}

export function getSpinLabel(key) {
  return SPIN_PRESETS[key]?.label ?? '无旋';
}

export function getSpinColor(key) {
  return SPIN_PRESETS[key]?.color ?? 0xb8c7d9;
}

export function getSpinDescription(key) {
  return SPIN_PRESETS[key]?.description ?? '没有旋转的基准弹道。';
}

export function getMagnusCoefficient(velocity, spin) {
  const speed = Math.max(0.2, velocity.length());
  const spinRatio = (spin.length() * BALL.RADIUS) / speed;
  return clamp(0.08 + 0.14 * Math.min(1.8, spinRatio), 0.08, 0.34);
}

export function accelerationAt(velocity, spin) {
  const speed = velocity.length();
  const acceleration = new THREE.Vector3(0, -BALL.GRAVITY, 0);
  if (speed < 0.001) return acceleration;

  acceleration.addScaledVector(velocity, -DRAG_K * speed);

  const cross = new THREE.Vector3().crossVectors(spin, velocity);
  if (cross.lengthSq() > 0.000001) {
    const coefficient = getMagnusCoefficient(velocity, spin);
    acceleration.addScaledVector(
      cross.normalize(),
      MAGNUS_K * coefficient * speed * speed,
    );
  }
  return acceleration;
}

export function stepBall(state, dt) {
  state.velocity.addScaledVector(accelerationAt(state.velocity, state.spin), dt);
  state.position.addScaledVector(state.velocity, dt);
  state.spin.multiplyScalar(Math.exp(-LAB_AIR.SPIN_DECAY * dt));
}

function positionAtTime(origin, velocity, time) {
  const state = {
    position: origin.clone(),
    velocity: velocity.clone(),
    spin: new THREE.Vector3(),
  };
  const dt = 1 / 240;
  let elapsed = 0;
  while (elapsed < time) {
    const step = Math.min(dt, time - elapsed);
    stepBall(state, step);
    elapsed += step;
  }
  return state.position;
}

function solve3x3(matrix, vector) {
  const [a, b, c] = matrix;
  const det =
    a[0] * (b[1] * c[2] - b[2] * c[1]) -
    a[1] * (b[0] * c[2] - b[2] * c[0]) +
    a[2] * (b[0] * c[1] - b[1] * c[0]);
  if (Math.abs(det) < 1e-8) return null;
  const invDet = 1 / det;
  return new THREE.Vector3(
    (vector.x * (b[1] * c[2] - b[2] * c[1]) -
      a[1] * (vector.y * c[2] - b[2] * vector.z) +
      a[2] * (vector.y * c[1] - b[1] * vector.z)) *
      invDet,
    (a[0] * (vector.y * c[2] - b[2] * vector.z) -
      vector.x * (b[0] * c[2] - b[2] * c[0]) +
      a[2] * (b[0] * vector.z - vector.y * c[0])) *
      invDet,
    (a[0] * (b[1] * vector.z - vector.y * c[1]) -
      a[1] * (b[0] * vector.z - vector.y * c[0]) +
      vector.x * (b[0] * c[1] - b[1] * c[0])) *
      invDet,
  );
}

/**
 * Find a launch velocity that puts a no-spin ball on the target at the
 * requested flight time. Drag is included, so this is an iterative solve
 * rather than the simple gravity-only ballistic formula used by the game.
 */
export function solveReferenceVelocity(
  origin = LAB_ORIGIN,
  target = LAB_TARGET,
  time = LAB_FLIGHT_TIME,
) {
  const velocity = new THREE.Vector3(
    (target.x - origin.x) / time,
    (target.y - origin.y + 0.5 * BALL.GRAVITY * time * time) / time,
    (target.z - origin.z) / time,
  );
  const eps = 0.06;

  for (let iteration = 0; iteration < 7; iteration += 1) {
    const position = positionAtTime(origin, velocity, time);
    const error = new THREE.Vector3().subVectors(target, position);
    if (error.length() < 0.0015) break;

    const columns = [];
    for (const axis of ['x', 'y', 'z']) {
      const probe = velocity.clone();
      probe[axis] += eps;
      const probePosition = positionAtTime(origin, probe, time);
      columns.push(probePosition.sub(position).divideScalar(eps).toArray());
    }

    const correction = solve3x3(
      [
        [columns[0][0], columns[1][0], columns[2][0]],
        [columns[0][1], columns[1][1], columns[2][1]],
        [columns[0][2], columns[1][2], columns[2][2]],
      ],
      error,
    );
    if (!correction) break;
    correction.clampLength(0, 4.5);
    velocity.add(correction);
  }

  return velocity;
}

function tableHit(previous, current) {
  if (!(previous.y >= TABLE_SURFACE && current.y < TABLE_SURFACE)) return null;
  if (current.y === previous.y) return null;
  const t = (TABLE_SURFACE - previous.y) / (current.y - previous.y);
  const x = THREE.MathUtils.lerp(previous.x, current.x, t);
  const z = THREE.MathUtils.lerp(previous.z, current.z, t);
  if (
    Math.abs(x) > TABLE.HALF_WIDTH + BALL.RADIUS * 0.45 ||
    Math.abs(z) > TABLE.HALF_LENGTH + BALL.RADIUS * 0.45
  ) {
    return null;
  }
  return { x, z, t };
}

/**
 * Simulate a complete demo shot and return a sampled trajectory. This uses a
 * simplified table bounce; the flight model is the part we want to inspect.
 */
export function simulateShot({ origin, velocity, spin, maxTime = LAB_MAX_TIME }) {
  const dt = 1 / 240;
  const state = {
    position: origin.clone(),
    velocity: velocity.clone(),
    spin: spin.clone(),
  };
  const points = [{ time: 0, position: state.position.clone() }];
  let time = 0;
  let maxHeight = state.position.y;
  let bounce = null;
  let bounced = false;
  let bounceTime = 0;

  while (time < maxTime) {
    const previous = state.position.clone();
    stepBall(state, dt);
    time += dt;

    const hit = !bounced ? tableHit(previous, state.position) : null;
    if (hit) {
      bounced = true;
      bounceTime = time;
      state.position.y = TABLE_SURFACE;
      state.velocity.y = -state.velocity.y * LAB_AIR.TABLE_RESTITUTION;
      state.velocity.x *= LAB_AIR.TABLE_FRICTION;
      state.velocity.z *= LAB_AIR.TABLE_FRICTION;
      state.velocity.z += state.spin.x * LAB_AIR.BOUNCE_SPIN_KICK;
      state.velocity.x -= state.spin.y * LAB_AIR.BOUNCE_SPIN_KICK;
      state.spin.multiplyScalar(0.72);
      bounce = {
        time,
        x: hit.x,
        y: TABLE.HEIGHT,
        z: hit.z,
      };
      points.push({ time, position: state.position.clone() });
      continue;
    }

    maxHeight = Math.max(maxHeight, state.position.y);
    if (points.length === 0 || time - points[points.length - 1].time >= 1 / 90) {
      points.push({ time, position: state.position.clone() });
    }

    if (bounced && time - bounceTime > 0.45) break;
    if (state.position.y < BALL.RADIUS * 0.9) break;
    if (!bounced && state.position.y < 0.16) break;
    if (Math.abs(state.position.x) > 4.2 || Math.abs(state.position.z) > 4.2) break;
    if (state.velocity.length() < 0.25) break;
  }

  const final = points[points.length - 1].position;
  return {
    points,
    duration: time,
    maxHeight,
    bounce,
    landing: bounce ? new THREE.Vector3(bounce.x, bounce.y, bounce.z) : null,
    end: final.clone(),
  };
}

export function buildShotSet(strength = 0.72) {
  const origin = LAB_ORIGIN.clone();
  const referenceVelocity = solveReferenceVelocity(origin, LAB_TARGET, LAB_FLIGHT_TIME);
  const reference = {
    key: 'reference',
    label: '无旋参考',
    color: 0xa9bed3,
    spin: new THREE.Vector3(),
    ...simulateShot({
      origin,
      velocity: referenceVelocity,
      spin: new THREE.Vector3(),
    }),
  };

  const shots = Object.values(SPIN_PRESETS).map((preset) => {
    const spin = getSpin(preset.key, strength);
    return {
      ...preset,
      spin,
      ...simulateShot({
        origin,
        velocity: referenceVelocity,
        spin,
      }),
    };
  });

  return {
    origin,
    referenceVelocity,
    reference,
    shots,
    all: [reference, ...shots],
  };
}

export function sampleTrace(shot, time) {
  const points = shot.points;
  if (!points.length) return null;
  if (time <= 0) return points[0].position;
  if (time >= points[points.length - 1].time) return points[points.length - 1].position;
  let low = 0;
  let high = points.length - 1;
  while (low + 1 < high) {
    const mid = (low + high) >> 1;
    if (points[mid].time <= time) low = mid;
    else high = mid;
  }
  const a = points[low];
  const b = points[high];
  const t = (time - a.time) / Math.max(0.00001, b.time - a.time);
  return a.position.clone().lerp(b.position, t);
}

export function traceProgress(shot, time) {
  const points = shot.points;
  if (!points.length) return 0;
  if (time >= points[points.length - 1].time) return points.length;
  let index = 0;
  while (index < points.length && points[index].time <= time) index += 1;
  return Math.max(1, index);
}

export function deviationFromReference(shot, reference) {
  if (!shot.landing || !reference.landing) return null;
  return {
    x: shot.landing.x - reference.landing.x,
    z: shot.landing.z - reference.landing.z,
  };
}
