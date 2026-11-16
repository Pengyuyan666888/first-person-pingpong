import * as THREE from 'three';
import { BALL, TABLE } from './constants.js';

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const lerp = (a, b, t) => a + (b - a) * t;

export const invLerp = (a, b, value) => (value - a) / (b - a);

export const smoothstep = (t) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

export const damp = (current, target, lambda, dt) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

export const dampVector = (current, target, lambda, dt) => {
  current.x = damp(current.x, target.x, lambda, dt);
  current.y = damp(current.y, target.y, lambda, dt);
  current.z = damp(current.z, target.z, lambda, dt);
  return current;
};

export const randomRange = (min, max) => min + Math.random() * (max - min);

export const randomSign = () => (Math.random() < 0.5 ? -1 : 1);

export const gaussian = (mean = 0, spread = 1) => {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * spread;
};

export function clampLength(vector, maxLength) {
  const length = vector.length();
  if (length > maxLength && length > 0) vector.multiplyScalar(maxLength / length);
  return vector;
}

export function ballisticVelocity(origin, target, time, gravity = BALL.GRAVITY) {
  const t = Math.max(0.08, time);
  return new THREE.Vector3(
    (target.x - origin.x) / t,
    (target.y - origin.y + 0.5 * gravity * t * t) / t,
    (target.z - origin.z) / t,
  );
}

export function tablePoint(x, z, margin = 0) {
  const maxX = TABLE.HALF_WIDTH - margin;
  const maxZ = TABLE.HALF_LENGTH - margin;
  return {
    x: clamp(x, -maxX, maxX),
    z: clamp(z, -maxZ, maxZ),
  };
}

export function isOnTable(x, z, margin = 0) {
  return (
    Math.abs(x) <= TABLE.HALF_WIDTH - margin &&
    Math.abs(z) <= TABLE.HALF_LENGTH - margin
  );
}

export function sideOf(z) {
  return z >= 0 ? 'player' : 'ai';
}

export function otherSide(side) {
  return side === 'player' ? 'ai' : 'player';
}

export function formatScore(side, playerScore, aiScore) {
  return side === 'player' ? `${playerScore} : ${aiScore}` : `${aiScore} : ${playerScore}`;
}
