import * as THREE from 'three';
import { AI } from './constants.js';
import { clamp, damp, gaussian, randomRange } from './utils.js';
import { predictPaddleIntercept as predictIntercept, solveShot } from './physics.js';

const AI_CENTER = new THREE.Vector3(0, 1.08, AI.PADDLE_Z);

export class AIController {
  constructor(config) {
    this.config = config;
    this.position = AI_CENTER.clone();
    this.target = AI_CENTER.clone();
    this.velocity = new THREE.Vector3();
    this.prediction = null;
    this.predictionTimer = 0;
    this.reactionTimer = 0;
    this.swingTimer = 0;
    this.swing = 0;
    this.cooldown = 0;
    this.lastSeenHit = -1;
    this.missOffset = new THREE.Vector2();
    this.debugAim = { x: 0, z: 0 };
    this.idleTime = 0;
  }

  reset() {
    this.position.copy(AI_CENTER);
    this.target.copy(AI_CENTER);
    this.velocity.set(0, 0, 0);
    this.prediction = null;
    this.predictionTimer = 0;
    this.reactionTimer = 0;
    this.swingTimer = 0;
    this.swing = 0;
    this.cooldown = 0;
    this.lastSeenHit = -1;
    this.missOffset.set(0, 0);
  }

  setConfig(config) {
    this.config = config;
    this.reset();
  }

  update(dt, ball, playerPaddle) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.swingTimer = Math.max(0, this.swingTimer - dt);
    this.swing = this.swingTimer > 0 ? Math.sin((1 - this.swingTimer / 0.24) * Math.PI) : 0;

    if (!ball || !ball.active) {
      this.target.copy(AI_CENTER);
      this.moveTowardsTarget(dt);
      return;
    }

    const incoming = ball.velocity.z < -0.25 && ball.lastHitBy === 'player';
    if (incoming) {
      this.idleTime = 0;
      this.reactionTimer -= dt;
      this.predictionTimer -= dt;
      if (this.predictionTimer <= 0) {
        this.predictionTimer = this.config.reaction;
        this.refreshPrediction(ball);
      }
      if (this.prediction) {
        this.target.set(this.prediction.x, this.prediction.y, AI.PADDLE_Z);
      }
    } else {
      this.idleTime += dt;
      const recoverX = playerPaddle ? clamp(playerPaddle.x * -0.16, -0.2, 0.2) : 0;
      this.target.set(recoverX, 1.1 + Math.sin(this.idleTime * 1.4) * 0.025, AI.PADDLE_Z);
      if (this.idleTime > 0.5) this.prediction = null;
    }

    this.target.x = clamp(this.target.x, -AI.X_RANGE, AI.X_RANGE);
    this.target.y = clamp(this.target.y, AI.Y_MIN, AI.Y_MAX);
    this.target.z = AI.PADDLE_Z;
    this.moveTowardsTarget(dt);

    if (this.prediction && ball.canHitAI && this.cooldown <= 0) {
      const dx = this.position.x - this.prediction.x;
      const dy = this.position.y - this.prediction.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 0.3) {
        this.triggerSwing();
      }
    }
  }

  refreshPrediction(ball) {
    const intercept = predictIntercept(ball, AI.PADDLE_Z, 3.4);
    if (!intercept) {
      this.prediction = null;
      return;
    }

    if (this.missOffset.lengthSq() === 0 && Math.random() < this.config.missChance) {
      const angle = Math.random() * Math.PI * 2;
      const distance = randomRange(0.25, 0.44);
      this.missOffset.set(Math.cos(angle) * distance, Math.sin(angle) * distance * 0.65);
    } else if (Math.random() < 0.22) {
      this.missOffset.multiplyScalar(0.4);
    }

    this.prediction = {
      x: clamp(intercept.x + gaussian(0, this.config.predictionError) + this.missOffset.x, -AI.X_RANGE, AI.X_RANGE),
      y: clamp(intercept.y + gaussian(0, this.config.predictionError * 0.65) + this.missOffset.y, AI.Y_MIN, AI.Y_MAX),
      z: AI.PADDLE_Z,
      time: intercept.time,
      firstBounce: intercept.firstBounce,
    };
  }

  moveTowardsTarget(dt) {
    const dx = this.target.x - this.position.x;
    const dy = this.target.y - this.position.y;
    const distance = Math.hypot(dx, dy);
    let desiredX = 0;
    let desiredY = 0;
    if (distance > 0.004) {
      const speed = Math.min(this.config.maxSpeed, distance * 9.5);
      desiredX = (dx / distance) * speed;
      desiredY = (dy / distance) * speed;
    }
    this.velocity.x = damp(this.velocity.x, desiredX, 14, dt);
    this.velocity.y = damp(this.velocity.y, desiredY, 14, dt);
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.x = clamp(this.position.x, -AI.X_RANGE, AI.X_RANGE);
    this.position.y = clamp(this.position.y, AI.Y_MIN, AI.Y_MAX);
  }

  triggerSwing() {
    if (this.swingTimer > 0.06) return;
    this.swingTimer = 0.24;
    this.cooldown = AI.HIT_COOLDOWN;
  }

  canReach(ball, radius) {
    if (!ball || !ball.active) return false;
    const dx = ball.position.x - this.position.x;
    const dy = ball.position.y - this.position.y;
    const dz = ball.position.z - AI.PADDLE_Z;
    return Math.hypot(dx, dy, dz) <= radius;
  }

  chooseShot(ball, playerPaddle) {
    const playerX = playerPaddle ? playerPaddle.x : 0;
    const away = playerX > 0.08 ? -1 : playerX < -0.08 ? 1 : Math.random() < 0.5 ? -1 : 1;
    const spread = this.config.aimErrorX;
    const targetX = clamp(
      away * randomRange(0.18, 0.44) + gaussian(0, spread),
      -0.55,
      0.55,
    );
    const targetZ = clamp(
      randomRange(0.5, 0.94) + gaussian(0, this.config.aimErrorZ),
      0.38,
      1.02,
    );
    const target = new THREE.Vector3(targetX, 0.76, targetZ);
    const distance = ball.position.distanceTo(target);
    const flight = clamp(
      this.config.shotTimeMin + (distance / 3.2) * 0.18 + Math.random() * 0.08,
      this.config.shotTimeMin,
      this.config.shotTimeMax,
    );
    const velocity = solveShot(ball.position, target, flight, 0);
    const power = this.config.power + Math.random() * 0.1;
    velocity.x *= 0.98 + power * 0.04;
    velocity.z *= 0.98 + power * 0.04;
    const spin = clamp((0.18 + power * 0.32) * (Math.random() < 0.7 ? 1 : -0.45), -0.4, 0.55);
    const sideSpin = clamp((targetX - ball.position.x) * 0.2, -0.22, 0.22);
    this.debugAim = { x: targetX, z: targetZ };
    return {
      velocity,
      target,
      spin,
      sideSpin,
      power,
      flight,
    };
  }

  getServeTarget(playerPaddle) {
    const playerX = playerPaddle ? playerPaddle.x : 0;
    const away = playerX > 0 ? -1 : 1;
    return {
      x: clamp(away * randomRange(0.25, 0.58) + gaussian(0, 0.06), -0.6, 0.6),
      z: randomRange(0.7, 1.1),
    };
  }
}
