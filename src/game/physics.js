import * as THREE from 'three';
import { BALL, TABLE } from './constants.js';
import { clamp, lerp, smoothstep } from './utils.js';

const TABLE_SURFACE = TABLE.HEIGHT + BALL.RADIUS;
const NET_HALF_WIDTH = TABLE.HALF_WIDTH + 0.09;

export class Ball {
  constructor() {
    this.position = new THREE.Vector3(0, 1.2, 1.4);
    this.previous = new THREE.Vector3(0, 1.2, 1.4);
    this.velocity = new THREE.Vector3();
    this.spin = 0;
    this.sideSpin = 0;
    this.radius = BALL.RADIUS;
    this.active = false;
    this.mode = 'idle';
    this.servePhase = 0;
    this.serveSide = null;
    this.lastHitBy = null;
    this.bouncedOnPlayer = false;
    this.bouncedOnAI = false;
    this.bounceCount = 0;
    this.hitCount = 0;
    this.life = 0;
    this.canHitPlayer = false;
    this.canHitAI = false;
    this.netContact = false;
    this.floorContact = false;
    this.tableContact = false;
    this.hitCooldown = 0;
    this.visualRotation = new THREE.Vector3();
    this.history = [];
    this.trackHistory = true;
  }

  reset() {
    this.velocity.set(0, 0, 0);
    this.spin = 0;
    this.sideSpin = 0;
    this.active = false;
    this.mode = 'idle';
    this.servePhase = 0;
    this.serveSide = null;
    this.lastHitBy = null;
    this.bouncedOnPlayer = false;
    this.bouncedOnAI = false;
    this.bounceCount = 0;
    this.hitCount = 0;
    this.life = 0;
    this.canHitPlayer = false;
    this.canHitAI = false;
    this.netContact = false;
    this.floorContact = false;
    this.tableContact = false;
    this.hitCooldown = 0;
    this.history.length = 0;
    this.trackHistory = true;
  }

  launch(position, velocity, options = {}) {
    this.position.copy(position);
    this.previous.copy(position);
    this.velocity.copy(velocity);
    this.spin = options.spin ?? 0;
    this.sideSpin = options.sideSpin ?? 0;
    this.active = true;
    this.mode = options.mode ?? 'rally';
    this.servePhase = options.servePhase ?? 0;
    this.serveSide = options.serveSide ?? null;
    this.lastHitBy = options.lastHitBy ?? null;
    this.bouncedOnPlayer = false;
    this.bouncedOnAI = false;
    this.bounceCount = 0;
    this.hitCount = 0;
    this.life = 0;
    this.canHitPlayer = false;
    this.canHitAI = false;
    this.netContact = false;
    this.floorContact = false;
    this.tableContact = false;
    this.hitCooldown = 0;
    this.history.length = 0;
    this.history.push(position.clone());
    this.trackHistory = true;
  }

  copyFrom(other) {
    this.position.copy(other.position);
    this.previous.copy(other.previous);
    this.velocity.copy(other.velocity);
    this.spin = other.spin;
    this.sideSpin = other.sideSpin;
    this.active = other.active;
    this.mode = other.mode;
    this.servePhase = other.servePhase;
    this.serveSide = other.serveSide;
    this.lastHitBy = other.lastHitBy;
    this.bouncedOnPlayer = other.bouncedOnPlayer;
    this.bouncedOnAI = other.bouncedOnAI;
    this.bounceCount = other.bounceCount;
    this.hitCount = other.hitCount;
    this.life = other.life;
    this.canHitPlayer = other.canHitPlayer;
    this.canHitAI = other.canHitAI;
    this.netContact = other.netContact;
    this.floorContact = other.floorContact;
    this.tableContact = other.tableContact;
    this.hitCooldown = other.hitCooldown;
    return this;
  }

  step(dt, handlers = {}) {
    if (!this.active) return;
    this.life += dt;
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);

    this.previous.copy(this.position);

    const speed = this.velocity.length();
    if (speed > 0.001) {
      const drag = -BALL.DRAG * speed;
      this.velocity.addScaledVector(this.velocity, drag * dt);
      const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
      if (horizontalSpeed > 0.001) {
        this.velocity.y -= this.spin * horizontalSpeed * BALL.MAGNUS * 6.0 * dt;
        this.velocity.x += this.sideSpin * horizontalSpeed * BALL.MAGNUS * 2.2 * dt;
      }
    }

    this.velocity.y -= BALL.GRAVITY * dt;
    this.velocity.multiplyScalar(1 - 0.0025 * dt);

    this.position.addScaledVector(this.velocity, dt);

    this.tableContact = false;
    this.netContact = false;
    this.floorContact = false;

    this.resolveTable(handlers);
    this.resolveNet(handlers);
    this.resolveFloor(handlers);

    if (
      this.position.y < -3 ||
      Math.abs(this.position.x) > 9 ||
      Math.abs(this.position.z) > 10
    ) {
      this.active = false;
    }

    if (this.trackHistory) {
      this.history.push(this.position.clone());
      if (this.history.length > 28) this.history.shift();
    }
    const horizontal = Math.hypot(this.velocity.x, this.velocity.z);
    this.visualRotation.x += horizontal * dt * 16;
    this.visualRotation.y += this.sideSpin * dt * 10;
  }

  resolveTable(handlers) {
    const previous = this.previous;
    const current = this.position;
    if (!(previous.y >= TABLE_SURFACE && current.y < TABLE_SURFACE)) return;
    if (this.velocity.y >= 0) return;

    const denom = current.y - previous.y;
    const t = denom === 0 ? 0 : (TABLE_SURFACE - previous.y) / denom;
    const x = lerp(previous.x, current.x, t);
    const z = lerp(previous.z, current.z, t);

    if (
      Math.abs(x) > TABLE.HALF_WIDTH + BALL.RADIUS * 0.4 ||
      Math.abs(z) > TABLE.HALF_LENGTH + BALL.RADIUS * 0.4
    ) {
      return;
    }

    const side = z >= 0 ? 'player' : 'ai';
    const impactSpeed = Math.abs(this.velocity.y);
    const wasBouncedOnPlayer = this.bouncedOnPlayer;
    const wasBouncedOnAI = this.bouncedOnAI;

    current.y = TABLE_SURFACE;
    this.velocity.y = impactSpeed * BALL.RESTITUTION;
    this.velocity.x *= BALL.FRICTION;
    this.velocity.z *= BALL.FRICTION;

    const direction = Math.sign(this.velocity.z) || (side === 'player' ? 1 : -1);
    this.velocity.z += direction * this.spin * 0.34;
    this.velocity.y += Math.max(0, -this.spin) * 0.08;
    this.spin *= 0.68;
    this.sideSpin *= 0.74;

    this.bounceCount += 1;
    if (side === 'player') {
      this.bouncedOnPlayer = true;
      if (this.lastHitBy === 'ai') this.canHitPlayer = true;
    } else {
      this.bouncedOnAI = true;
      if (this.lastHitBy === 'player') this.canHitAI = true;
    }

    handlers.onTable?.({
      ball: this,
      side,
      position: new THREE.Vector3(x, TABLE.HEIGHT, z),
      impactSpeed,
      bounceCount: this.bounceCount,
      wasBouncedOnPlayer,
      wasBouncedOnAI,
    });
  }

  resolveNet(handlers) {
    const previous = this.previous;
    const current = this.position;
    const crossed = (previous.z > 0 && current.z <= 0) || (previous.z < 0 && current.z >= 0);
    if (!crossed) return;

    const denom = current.z - previous.z;
    const t = denom === 0 ? 0 : (0 - previous.z) / denom;
    const y = lerp(previous.y, current.y, t);
    const x = lerp(previous.x, current.x, t);
    const netTop = TABLE.HEIGHT + TABLE.NET_HEIGHT + BALL.RADIUS * 0.6;

    if (Math.abs(x) > NET_HALF_WIDTH) return;
    if (y < TABLE.HEIGHT - BALL.RADIUS || y > netTop) return;

    const side = previous.z >= 0 ? 'player' : 'ai';
    current.z = side === 'player' ? 0.012 : -0.012;
    this.velocity.z = -this.velocity.z * 0.12;
    this.velocity.x *= 0.42;
    this.velocity.y *= 0.32;
    this.spin = 0;
    this.sideSpin = 0;
    this.netContact = true;

    handlers.onNet?.({
      ball: this,
      side,
      position: new THREE.Vector3(x, y, 0),
      impactSpeed: Math.abs(this.velocity.z),
    });
  }

  resolveFloor(handlers) {
    if (this.position.y - BALL.RADIUS > 0 || this.velocity.y >= 0) return;
    const impactSpeed = Math.abs(this.velocity.y);
    this.position.y = BALL.RADIUS;
    this.velocity.y = impactSpeed * 0.38;
    this.velocity.x *= 0.72;
    this.velocity.z *= 0.72;
    this.spin *= 0.4;
    this.sideSpin *= 0.4;
    this.floorContact = true;

    handlers.onFloor?.({
      ball: this,
      position: this.position.clone(),
      impactSpeed,
    });
  }
}

/**
 * Simulate the current ball forward until it crosses a paddle plane. This is
 * used by the AI and the landing marker. It intentionally uses the same
 * physics as the live ball so the prediction matches what the player sees.
 */
export function predictPaddleIntercept(source, planeZ, maxTime = 3.2) {
  const ball = new Ball().copyFrom(source);
  ball.active = true;
  ball.trackHistory = false;
  const dt = 1 / 120;
  let time = 0;
  let firstBounce = null;
  let crossed = false;
  let intercept = null;

  while (time < maxTime && ball.active) {
    const before = ball.position.clone();
    ball.step(dt, {
      onTable: (event) => {
        if (!firstBounce) firstBounce = { ...event.position, time, side: event.side };
      },
    });
    time += dt;
    if (!crossed) {
      const isTargetSide = planeZ < 0 ? ball.position.z <= planeZ : ball.position.z >= planeZ;
      if (isTargetSide) {
        const beforeSide = planeZ < 0 ? before.z > planeZ : before.z < planeZ;
        if (beforeSide) {
          const denom = ball.position.z - before.z;
          const t = denom === 0 ? 0 : (planeZ - before.z) / denom;
          intercept = {
            x: lerp(before.x, ball.position.x, t),
            y: lerp(before.y, ball.position.y, t),
            z: planeZ,
            time,
            firstBounce,
          };
          crossed = true;
          break;
        }
      }
    }
    if (ball.position.y < -1) break;
  }

  return intercept;
}

export function predictFirstBounce(source, side = 'player', maxTime = 3.2) {
  const ball = new Ball().copyFrom(source);
  ball.active = true;
  ball.trackHistory = false;
  const dt = 1 / 120;
  let time = 0;
  let found = null;

  while (time < maxTime && ball.active && !found) {
    const beforeBounceCount = ball.bounceCount;
    ball.step(dt, {});
    time += dt;
    if (ball.bounceCount > beforeBounceCount) {
      const sideNow = ball.position.z >= 0 ? 'player' : 'ai';
      if (sideNow === side) {
        found = {
          x: ball.position.x,
          z: ball.position.z,
          time,
          side: sideNow,
        };
      }
    }
    if (ball.position.y < -1) break;
  }

  return found;
}

export function solveShot(origin, target, time) {
  const t = Math.max(0.18, time);
  return new THREE.Vector3(
    (target.x - origin.x) / t,
    (target.y - origin.y + 0.5 * BALL.GRAVITY * t * t) / t,
    (target.z - origin.z) / t,
  );
}

export function serveFirstLeg(origin, x, z, time) {
  const target = new THREE.Vector3(x, TABLE.HEIGHT + BALL.RADIUS, z);
  return solveShot(origin, target, time);
}

export function serveSecondLeg(origin, target, time) {
  return solveShot(origin, target, time);
}

export function ballEnergy(ball) {
  const speed = ball.velocity.length();
  return clamp((speed - 1.8) / 6.5, 0, 1);
}

export function ballScreenHeightFactor(ball) {
  return smoothstep(1 - (ball.position.y - TABLE.HEIGHT) / 1.8);
}

export { TABLE_SURFACE };
