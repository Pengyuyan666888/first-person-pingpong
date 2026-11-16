import * as THREE from 'three';
import { AI, BALL, DIFFICULTIES, MATCH, PLAYER, SERVE, TABLE } from './constants.js';
import { AIController } from './ai.js';
import { AudioEngine } from './audio.js';
import { InputManager } from './input.js';
import {
  Ball,
  predictFirstBounce,
  serveFirstLeg,
  serveSecondLeg,
  solveShot,
} from './physics.js';
import { UI } from './ui.js';
import { World } from './world.js';
import { clamp, damp, lerp, otherSide } from './utils.js';

const FIXED_STEP = 1 / 180;

export class Game {
  constructor(canvas, ui = new UI()) {
    this.ui = ui;
    this.audio = new AudioEngine();
    this.world = new World(canvas);
    this.world.setPlayerVisible(false);

    this.ball = new Ball();
    this.ai = new AIController(DIFFICULTIES.normal);
    this.difficultyKey = 'normal';
    this.config = DIFFICULTIES[this.difficultyKey];

    this.state = 'menu';
    this.pausedState = null;
    this.time = 0;
    this.lastTime = 0;
    this.accumulator = 0;
    this.debugEnabled = new URLSearchParams(window.location.search).has('debug');
    this.debugPanel = document.getElementById('debug-panel');
    this.debugTimer = 0;

    this.playerScore = 0;
    this.aiScore = 0;
    this.initialServer = 'player';
    this.server = 'player';
    this.rallyHits = 0;
    this.longestRally = 0;
    this.winners = 0;
    this.pointTimer = 0;
    this.pendingMatchEnd = false;
    this.lastPointReason = '';
    this.serveAITimer = 0;
    this.landingTimer = 0;
    this.aimTarget = null;
    this.landingPoint = null;
    this.serveTarget = null;
    this.serveSecondTarget = null;
    this.serveFlight = false;
    this.letServe = false;

    this.toss = {
      active: false,
      side: null,
      time: 0,
      start: new THREE.Vector3(),
      auto: false,
    };

    this.playerPaddle = {
      x: PLAYER.X_OFFSET,
      y: 0.97,
      z: PLAYER.PADDLE_Z,
      baseY: 0.97,
      charge: 0,
      swing: 0,
      swingTime: 0,
      swingCharge: 0,
      charging: false,
      hitPulse: 0,
    };

    this.aiPaddle = {
      x: 0,
      y: 1.1,
      z: AI.PADDLE_Z,
      swing: 0,
    };

    this.input = new InputManager(canvas, {
      onDown: () => this.handlePointerDown(),
      onUp: () => this.handlePointerUp(),
      onMove: () => {},
    });

    this.physicsHandlers = {
      onTable: (event) => this.handleTable(event),
      onNet: (event) => this.handleNet(event),
      onFloor: (event) => this.handleFloor(event),
    };

    this.loop = this.loop.bind(this);
    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
    this.updateScoreboard();
  }

  start() {
    this.lastTime = performance.now();
    requestAnimationFrame(this.loop);
  }

  loop(now) {
    const dt = Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;

    if (this.state !== 'paused') {
      this.update(dt);
      this.world.update(dt, this.getWorldState());
    } else {
      this.world.update(0, this.getWorldState());
    }
    this.ui.update(dt);
    this.updateDebug(dt);
    requestAnimationFrame(this.loop);
  }

  update(dt) {
    this.time += dt;
    this.input.update(dt);

    if (this.state === 'menu') {
      this.ai.update(dt, null, this.playerPaddle);
      this.syncAiPaddle();
      this.ball.active = false;
      this.ball.mode = 'idle';
      this.aimTarget = null;
      this.landingPoint = null;
      this.serveTarget = null;
      return;
    }

    if (this.state === 'paused' || this.state === 'matchOver') {
      return;
    }

    this.updatePlayerPaddle(dt);
    this.ai.update(dt, this.state === 'rally' ? this.ball : null, this.playerPaddle);
    this.syncAiPaddle();

    if (this.state === 'serve') {
      this.updateServe(dt);
    } else if (this.state === 'rally') {
      this.updateRally(dt);
    } else if (this.state === 'point') {
      this.updatePoint(dt);
    }

    this.updateMarkers(dt);
  }

  updatePlayerPaddle(dt) {
    const nx = this.input.mouse.nx;
    const ny = this.input.mouse.ny;
    const targetX =
      PLAYER.X_OFFSET + nx * (nx < 0 ? PLAYER.X_LEFT_RANGE : PLAYER.X_RIGHT_RANGE);
    const targetY = lerp(PLAYER.Y_MIN, PLAYER.Y_MAX, (ny + 1) / 2);

    this.playerPaddle.x = damp(this.playerPaddle.x, targetX, 22, dt);
    this.playerPaddle.baseY = damp(this.playerPaddle.baseY, targetY, 22, dt);

    if (this.playerPaddle.charging) {
      this.playerPaddle.charge = Math.min(
        1,
        this.playerPaddle.charge + dt / PLAYER.MAX_CHARGE,
      );
    }

    if (this.playerPaddle.swingTime > 0) {
      this.playerPaddle.swingTime = Math.max(0, this.playerPaddle.swingTime - dt);
      if (this.playerPaddle.swingTime === 0) {
        this.playerPaddle.swingCharge = 0;
      }
    }

    const progress =
      this.playerPaddle.swingTime > 0
        ? 1 - this.playerPaddle.swingTime / PLAYER.SWING_WINDOW
        : 0;
    const swing = this.playerPaddle.swingTime > 0 ? Math.sin(progress * Math.PI) : 0;
    this.playerPaddle.swing = swing;
    this.playerPaddle.hitPulse = Math.max(0, this.playerPaddle.hitPulse - dt * 3.6);
    this.playerPaddle.y = this.playerPaddle.baseY + swing * 0.03;
    this.playerPaddle.z =
      PLAYER.PADDLE_Z - this.playerPaddle.charge * 0.055 - swing * 0.085;
  }

  syncAiPaddle() {
    this.aiPaddle.x = this.ai.position.x;
    this.aiPaddle.y = this.ai.position.y;
    this.aiPaddle.z = AI.PADDLE_Z;
    this.aiPaddle.swing = this.ai.swing;
  }

  handlePointerDown() {
    this.audio.init();
    if (this.state === 'serve' && this.server === 'player') {
      if (this.serveState === 'waiting_player') {
        this.startToss('player');
      } else if (this.serveState === 'tossing_player') {
        this.tryHitToss('player');
      }
      return;
    }
    if (this.state === 'rally' && !this.playerPaddle.charging) {
      this.playerPaddle.charging = true;
      this.playerPaddle.charge = 0;
      this.playerPaddle.swingTime = 0;
      this.playerPaddle.swingCharge = 0;
    }
  }

  handlePointerUp() {
    if (this.playerPaddle.charging) {
      this.releaseSwing();
    }
  }

  releaseSwing(auto = false) {
    if (!this.playerPaddle.charging && this.playerPaddle.swingTime > 0) return;
    const charge = Math.max(this.playerPaddle.charge, auto ? 0.16 : 0.08);
    this.playerPaddle.swingCharge = charge;
    this.playerPaddle.charge = 0;
    this.playerPaddle.charging = false;
    this.playerPaddle.swingTime = PLAYER.SWING_WINDOW;
  }

  startMatch(difficultyKey = this.difficultyKey) {
    this.audio.init();
    this.audio.ui();
    this.setDifficulty(difficultyKey);
    this.playerScore = 0;
    this.aiScore = 0;
    this.initialServer = 'player';
    this.server = 'player';
    this.rallyHits = 0;
    this.longestRally = 0;
    this.winners = 0;
    this.pointTimer = 0;
    this.pendingMatchEnd = false;
    this.letServe = false;
    this.accumulator = 0;
    this.landingTimer = 0;
    this.serveAITimer = 0;
    this.ball.reset();
    this.ai.reset();
    this.syncAiPaddle();
    this.input.setVirtualPosition(0, 0);
    this.input.velocity.x = 0;
    this.input.velocity.y = 0;
    this.playerPaddle.x = PLAYER.X_OFFSET;
    this.playerPaddle.y = 0.97;
    this.playerPaddle.baseY = 0.97;
    this.playerPaddle.charging = false;
    this.playerPaddle.charge = 0;
    this.playerPaddle.swingTime = 0;
    this.playerPaddle.swingCharge = 0;
    this.state = 'serve';
    this.world.setMode('play');
    this.world.snapToPlay();
    this.world.setPlayerVisible(true);
    this.input.setEnabled(true);

    this.ui.setDifficulty(this.difficultyKey);
    this.ui.showHUD();
    this.ui.setScore(0, 0);
    this.ui.setServer(this.server);
    this.ui.setRally(0);
    this.ui.setServePrompt(false);
    this.ui.resetHintTimer();
    this.updateScoreboard();
    this.beginServe(true);
  }

  beginServe(first = false) {
    this.state = 'serve';
    this.serveState = this.server === 'player' ? 'waiting_player' : 'waiting_ai';
    this.serveAITimer = this.server === 'ai' ? this.config.serveDelay : 0;
    this.serveFlight = false;
    this.serveSecondTarget = null;
    this.toss.active = false;
    this.toss.side = null;
    this.ball.reset();
    this.ball.mode = 'idle';
    this.ball.active = false;
    this.rallyHits = 0;
    this.aimTarget = null;
    this.landingPoint = null;
    this.serveTarget =
      this.server === 'player'
        ? { x: clamp(this.playerPaddle.x * 1.05, -0.62, 0.62), z: -SERVE.TARGET_Z }
        : null;
    this.playerPaddle.charging = false;
    this.playerPaddle.charge = 0;
    this.playerPaddle.swingTime = 0;
    this.playerPaddle.swingCharge = 0;
    this.ai.reset();
    this.syncAiPaddle();
    this.ui.setRally(0);
    this.ui.setServer(this.server);
    this.ui.setServePrompt(this.server === 'player');
    this.updateScoreboard();
    if (this.server === 'player' && !first) {
      this.ui.toast('你的发球', 'player', 900);
    } else if (this.server === 'ai' && !first) {
      this.ui.toast('机器发球', 'ai', 900);
    }
  }

  computeServer() {
    const total = this.playerScore + this.aiScore;
    const deuce = this.playerScore >= MATCH.DEUCE_SCORE && this.aiScore >= MATCH.DEUCE_SCORE;
    const block = deuce ? total : Math.floor(total / MATCH.SERVE_INTERVAL);
    return block % 2 === 0 ? this.initialServer : otherSide(this.initialServer);
  }

  updateScoreboard() {
    this.world.updateScoreboard(this.playerScore, this.aiScore, this.server);
  }

  setDifficulty(key) {
    if (!DIFFICULTIES[key]) return;
    this.difficultyKey = key;
    this.config = DIFFICULTIES[key];
    this.ai.setConfig(this.config);
    this.ui.setDifficulty(key);
  }

  updateServe(dt) {
    this.aimTarget = null;
    this.landingPoint = null;

    if (this.server === 'player') {
      this.serveTarget = { x: clamp(this.playerPaddle.x * 1.05, -0.62, 0.62), z: -SERVE.TARGET_Z };
      if (this.serveState === 'waiting_player') {
        this.ui.setServePrompt(true);
      } else if (this.serveState === 'tossing_player') {
        this.ui.setServePrompt(true, '你的发球', '再点一次击球');
        this.updateToss(dt);
      }
    } else {
      this.serveTarget = null;
      this.ui.setServePrompt(false);
      if (this.serveState === 'waiting_ai') {
        this.serveAITimer -= dt;
        if (this.serveAITimer <= 0) this.startToss('ai');
      } else if (this.serveState === 'tossing_ai') {
        this.updateToss(dt);
      }
    }
  }

  startToss(side) {
    this.audio.init();
    this.serveState = side === 'player' ? 'tossing_player' : 'tossing_ai';
    const start =
      side === 'player'
        ? new THREE.Vector3(this.playerPaddle.x * 0.42, 1.04, 1.33)
        : new THREE.Vector3(this.ai.position.x * 0.55, 1.02, -1.34);
    this.toss.active = true;
    this.toss.side = side;
    this.toss.time = 0;
    this.toss.start.copy(start);
    this.toss.auto = side === 'ai';
    this.ball.reset();
    this.ball.mode = 'toss';
    this.ball.active = false;
    this.ball.position.copy(start);
    this.ball.history.length = 0;
    this.audio.toss();
    if (side === 'ai') {
      this.ai.position.x = damp(this.ai.position.x, start.x * 0.7, 8, 1 / 60);
      this.syncAiPaddle();
      this.ui.setServePrompt(false);
    } else {
      this.ui.setServePrompt(true, '你的发球', '再点一次击球');
    }
  }

  updateToss(dt) {
    if (!this.toss.active) return;
    this.toss.time += dt;
    const u = clamp(this.toss.time / SERVE.TOSS_TIME, 0, 1);
    const height = 4 * SERVE.TOSS_HEIGHT * u * (1 - u);
    this.ball.mode = 'toss';
    this.ball.active = false;
    this.ball.position.set(
      this.toss.start.x,
      this.toss.start.y + height,
      this.toss.start.z,
    );

    if (this.toss.side === 'ai' && this.toss.time >= 0.39) {
      this.executeServe('ai');
      return;
    }

    if (this.toss.side === 'player' && this.toss.time >= SERVE.TOSS_TIME + 0.24) {
      this.cancelToss();
    }
  }

  tryHitToss(side) {
    if (!this.toss.active || this.toss.side !== side) return;
    if (this.toss.time < 0.08) {
      this.ui.toast('再等一下', null, 550);
      return;
    }
    if (this.toss.time > SERVE.TOSS_TIME + 0.08) {
      this.cancelToss();
      return;
    }
    this.executeServe(side);
  }

  cancelToss() {
    const side = this.toss.side;
    this.toss.active = false;
    this.ball.mode = 'idle';
    this.ball.active = false;
    if (side === 'player') {
      this.serveState = 'waiting_player';
      this.ui.setServePrompt(true, '你的发球', '球落下了，再点一次');
      this.ui.toast('没打到，再来一次', null, 1000);
    } else {
      this.serveState = 'waiting_ai';
      this.serveAITimer = 0.7;
    }
  }

  executeServe(side) {
    if (!this.toss.active || this.toss.side !== side) return;
    this.toss.active = false;
    this.audio.init();

    let targetX;
    let targetZ;
    if (side === 'player') {
      targetX = clamp(this.playerPaddle.x * 1.05, -0.62, 0.62);
      targetZ = -SERVE.TARGET_Z;
    } else {
      const serveTarget = this.ai.getServeTarget(this.playerPaddle);
      targetX = serveTarget.x;
      targetZ = serveTarget.z;
    }

    const origin = this.ball.position.clone();
    const firstX = targetX * 0.34;
    const firstZ = side === 'player' ? SERVE.FIRST_BOUNCE_Z : -SERVE.FIRST_BOUNCE_Z;
    const velocity = serveFirstLeg(origin, firstX, firstZ, SERVE.FIRST_BOUNCE_TIME);

    this.serveSecondTarget = { x: targetX, z: targetZ };
    this.serveFlight = true;
    this.serveState = 'flight';
    this.ball.launch(origin, velocity, {
      mode: 'serve',
      servePhase: 0,
      serveSide: side,
      lastHitBy: side,
    });
    this.state = 'rally';
    this.rallyHits = 0;
    this.ui.setRally(0);
    this.ui.setServePrompt(false);
    this.ui.toast(side === 'player' ? '你的发球' : '机器发球', side, 650);
    this.audio.serve();
    this.world.spawnHit(origin, side === 'player' ? 0x61e7ff : 0xff8a3d, 0.28);
    this.serveTarget = null;
    this.aimTarget = null;
    this.landingPoint = null;
  }

  updateRally(dt) {
    this.accumulator = Math.min(this.accumulator + dt, FIXED_STEP * 10);
    let steps = 0;
    while (this.accumulator >= FIXED_STEP && steps < 10 && this.state === 'rally') {
      this.physicsStep(FIXED_STEP);
      this.accumulator -= FIXED_STEP;
      steps += 1;
    }
  }

  physicsStep(dt) {
    this.ball.step(dt, this.physicsHandlers);
    if (this.state !== 'rally') return;
    this.tryPlayerHit();
    if (this.state !== 'rally') return;
    this.tryAIHit();
    if (this.state !== 'rally') return;
    this.checkOutOfBounds();
  }

  tryPlayerHit() {
    if (!this.ball.active || !this.ball.canHitPlayer) return;
    if (this.ball.velocity.z <= 0.05) return;
    if (this.ball.position.z < 0.8 || this.ball.position.z > 2.25) return;

    const p = this.playerPaddle;
    const distance = Math.hypot(
      this.ball.position.x - p.x,
      this.ball.position.y - p.y,
      this.ball.position.z - p.z,
    );
    const swinging = p.swingTime > 0;
    const radius =
      PLAYER.PADDLE_RADIUS +
      BALL.RADIUS +
      this.config.playerAssist +
      (swinging ? 0.025 : 0);
    if (distance > radius) return;

    if (p.charging) this.releaseSwing(true);
    const charge = p.swingTime > 0 ? clamp(p.swingCharge, 0, 1) : 0;
    const swingingNow = p.swingTime > 0;
    const power = swingingNow ? 0.34 + charge * 0.66 : 0.28;

    const aim = this.computePlayerAimTarget(power);
    const target = new THREE.Vector3(aim.x, TABLE.HEIGHT + BALL.RADIUS, aim.z);
    const flight = clamp(0.71 - power * 0.11 + Math.random() * 0.025, 0.53, 0.73);
    const velocity = solveShot(this.ball.position, target, flight);
    velocity.multiplyScalar(1.018);

    const mouseVelocity = this.input.velocity;
    const spin = clamp(mouseVelocity.y * 0.075 + power * 0.11, -0.42, 0.55);
    const sideSpin = clamp(mouseVelocity.x * 0.055 + (aim.x - p.x) * 0.06, -0.38, 0.38);

    const origin = this.ball.position.clone();
    origin.z -= 0.035;
    this.ball.launch(origin, velocity, {
      mode: 'rally',
      lastHitBy: 'player',
      spin,
      sideSpin,
    });
    this.ball.hitCooldown = 0.12;
    this.rallyHits += 1;
    this.longestRally = Math.max(this.longestRally, this.rallyHits);
    this.playerPaddle.hitPulse = 1;
    this.ui.setRally(this.rallyHits);
    this.audio.hit(power, 'player');
    this.world.spawnHit(origin, 0x61e7ff, power);
    this.world.kick(power, new THREE.Vector3(0, 0, -1));
    this.landingPoint = null;
    this.aimTarget = null;
  }

  tryAIHit() {
    if (!this.ball.active || !this.ball.canHitAI) return;
    if (this.ball.velocity.z >= -0.05) return;
    if (this.ball.position.z < -2.2 || this.ball.position.z > -1.1) return;

    const a = this.ai.position;
    const distance = Math.hypot(
      this.ball.position.x - a.x,
      this.ball.position.y - a.y,
      this.ball.position.z - AI.PADDLE_Z,
    );
    const radius = AI.PADDLE_RADIUS + BALL.RADIUS + this.config.aiAssist + 0.035;
    if (distance > radius) return;

    const shot = this.ai.chooseShot(this.ball, this.playerPaddle);
    const origin = this.ball.position.clone();
    origin.z += 0.035;
    this.ball.launch(origin, shot.velocity, {
      mode: 'rally',
      lastHitBy: 'ai',
      spin: shot.spin,
      sideSpin: shot.sideSpin,
    });
    this.ball.hitCooldown = 0.12;
    this.rallyHits += 1;
    this.longestRally = Math.max(this.longestRally, this.rallyHits);
    this.ai.triggerSwing();
    this.ui.setRally(this.rallyHits);
    this.audio.hit(shot.power, 'ai');
    this.world.spawnHit(origin, 0xff8a3d, shot.power);
    this.world.kick(shot.power * 0.7, new THREE.Vector3(0, 0, 1));
    this.aimTarget = null;
    this.landingPoint = null;
    this.landingTimer = 0;
  }

  computePlayerAimTarget(power = 0.5) {
    const mouseVelocity = this.input.velocity;
    return {
      x: clamp(this.playerPaddle.x * 1.02 + mouseVelocity.x * 0.1, -0.63, 0.63),
      z: clamp(
        -0.64 - power * 0.26 - this.playerPaddle.charge * 0.08 - mouseVelocity.y * 0.085,
        -1.22,
        -0.42,
      ),
    };
  }

  updateMarkers(dt) {
    if (this.state === 'serve') {
      this.serveTarget =
        this.server === 'player'
          ? { x: clamp(this.playerPaddle.x * 1.05, -0.62, 0.62), z: -SERVE.TARGET_Z }
          : null;
      this.aimTarget = null;
      this.landingPoint = null;
      return;
    }

    if (this.state !== 'rally') {
      this.aimTarget = null;
      this.landingPoint = null;
      this.serveTarget = null;
      return;
    }

    this.serveTarget = null;
    if (this.ball.active && this.ball.lastHitBy === 'ai' && this.ball.velocity.z > 0.1) {
      this.aimTarget = this.computePlayerAimTarget(
        this.playerPaddle.charging ? this.playerPaddle.charge : 0.42,
      );
      this.landingTimer -= dt;
      if (this.landingTimer <= 0 && !this.ball.bouncedOnPlayer) {
        this.landingTimer = 0.08;
        this.landingPoint = predictFirstBounce(this.ball, 'player', 2.5);
      } else if (this.ball.bouncedOnPlayer) {
        this.landingPoint = null;
      }
    } else {
      this.aimTarget = null;
      this.landingPoint = null;
    }
  }

  handleTable(event) {
    const { side } = event;
    this.audio.bounce(side);
    this.world.spawnBounce(
      event.position,
      side === 'player' ? 0x61e7ff : 0xff8a3d,
      clamp(event.impactSpeed / 5, 0.1, 1),
    );

    if (this.state !== 'rally') return;

    if (this.ball.mode === 'serve') {
      if (this.ball.servePhase === 0) {
        if (side !== this.ball.serveSide) {
          this.faultServe('发球第一落点错误');
          return;
        }
        const from = new THREE.Vector3(
          event.position.x,
          TABLE.HEIGHT + BALL.RADIUS,
          event.position.z,
        );
        const target = new THREE.Vector3(
          this.serveSecondTarget.x,
          TABLE.HEIGHT + BALL.RADIUS,
          this.serveSecondTarget.z,
        );
        const velocity = serveSecondLeg(from, target, SERVE.SECOND_BOUNCE_TIME);
        this.ball.position.copy(from);
        this.ball.velocity.copy(velocity);
        this.ball.spin = 0;
        this.ball.sideSpin = 0;
        this.ball.servePhase = 1;
        this.ball.canHitPlayer = false;
        this.ball.canHitAI = false;
        return;
      }

      if (this.ball.servePhase === 1) {
        if (side !== otherSide(this.ball.serveSide)) {
          this.faultServe('发球第二落点错误');
          return;
        }
        this.ball.mode = 'rally';
        this.ball.servePhase = 2;
        this.ball.lastHitBy = this.ball.serveSide;
        this.ball.canHitPlayer = this.ball.serveSide === 'ai';
        this.ball.canHitAI = this.ball.serveSide === 'player';
        this.serveFlight = false;
        this.rallyHits = 1;
        this.longestRally = Math.max(this.longestRally, this.rallyHits);
        this.ui.setRally(this.rallyHits);
        return;
      }
    }

    if (side === 'player') {
      if (this.ball.lastHitBy === 'player') {
        this.awardPoint('ai', '回球落回己方台面');
        return;
      }
      if (event.wasBouncedOnPlayer) {
        this.awardPoint('ai', '球第二次落在己方台面');
        return;
      }
    } else {
      if (this.ball.lastHitBy === 'ai') {
        this.awardPoint('player', '机器回球落回己方台面');
        return;
      }
      if (event.wasBouncedOnAI) {
        this.awardPoint('player', '机器未能回球');
      }
    }
  }

  faultServe(reason) {
    const receiver = otherSide(this.ball.serveSide ?? this.server);
    this.serveFlight = false;
    this.awardPoint(receiver, reason);
  }

  handleNet(event) {
    this.audio.net();
    this.world.spawnFlash(event.position, 0x61e7ff, 0.18);

    if (this.state === 'rally' && this.ball.mode === 'serve' && !this.letServe) {
      this.letServe = true;
      this.serveFlight = false;
      this.ball.active = false;
      this.ball.mode = 'idle';
      this.state = 'point';
      this.pointTimer = 1.05;
      this.pendingMatchEnd = false;
      this.ui.setServePrompt(false);
      this.ui.toast('擦网，重发', null, 900);
    }
  }

  handleFloor(event) {
    this.audio.bounce('floor');
    if (this.state !== 'rally') return;
    if (this.ball.mode === 'serve') {
      this.failServe();
      return;
    }

    let winner;
    let reason;
    if (this.ball.lastHitBy === 'player') {
      if (this.ball.bouncedOnAI) {
        winner = 'player';
        reason = '机器未能回球';
      } else {
        winner = 'ai';
        reason = '回球出界';
      }
    } else if (this.ball.lastHitBy === 'ai') {
      if (this.ball.bouncedOnPlayer) {
        winner = 'ai';
        reason = '未能回球';
      } else {
        winner = 'player';
        reason = '机器回球出界';
      }
    } else {
      winner = this.ball.serveSide ? otherSide(this.ball.serveSide) : 'player';
      reason = '发球失误';
    }
    this.awardPoint(winner, reason);
  }

  failServe() {
    const receiver = otherSide(this.ball.serveSide ?? this.server);
    this.awardPoint(receiver, '发球失误');
  }

  checkOutOfBounds() {
    if (!this.ball.active) return;
    const b = this.ball;

    if (b.position.z > 2.45) {
      if (b.lastHitBy === 'ai') {
        if (!b.bouncedOnPlayer) this.awardPoint('player', '机器回球出界');
        else this.awardPoint('ai', '未能回球');
      } else if (b.lastHitBy === 'player') {
        this.awardPoint('ai', '回球出界');
      }
      return;
    }

    if (b.position.z < -2.45) {
      if (b.lastHitBy === 'player') {
        if (!b.bouncedOnAI) this.awardPoint('ai', '回球出界');
        else this.awardPoint('player', '机器未能回球');
      } else if (b.lastHitBy === 'ai') {
        this.awardPoint('player', '机器回球落回己方台面');
      }
      return;
    }

    if (Math.abs(b.position.x) > 4.2 || b.position.y < -0.8) {
      if (b.lastHitBy === 'player') {
        this.awardPoint(b.bouncedOnAI ? 'player' : 'ai', '回球出界');
      } else if (b.lastHitBy === 'ai') {
        this.awardPoint(b.bouncedOnPlayer ? 'ai' : 'player', '机器回球出界');
      }
    }
  }

  awardPoint(winner, reason = '') {
    if (this.state === 'point' || this.state === 'matchOver') return;
    if (winner !== 'player' && winner !== 'ai') return;

    if (winner === 'player' && this.ball.lastHitBy === 'player') this.winners += 1;
    if (winner === 'player') this.playerScore += 1;
    else this.aiScore += 1;

    this.lastPointReason = reason;
    this.letServe = false;
    this.server = this.computeServer();
    this.state = 'point';
    this.pointTimer = MATCH.POINT_DELAY;
    this.ball.active = false;
    this.ball.mode = 'idle';
    this.toss.active = false;
    this.serveFlight = false;
    this.aimTarget = null;
    this.landingPoint = null;
    this.serveTarget = null;
    this.playerPaddle.charging = false;
    this.playerPaddle.charge = 0;
    this.playerPaddle.swingTime = 0;
    this.ui.setServePrompt(false);
    this.ui.setScore(this.playerScore, this.aiScore);
    this.ui.setServer(this.server);
    this.ui.setRally(this.rallyHits);
    this.updateScoreboard();
    this.audio.score(winner === 'player');

    const prefix = winner === 'player' ? '你得分' : '机器得分';
    this.ui.toast(reason ? `${prefix} · ${reason}` : prefix, winner, 1350);
    this.world.kick(winner === 'player' ? 0.7 : 0.35, new THREE.Vector3(0, 0, 1));

    const playerWon =
      this.playerScore >= MATCH.TARGET_SCORE &&
      this.playerScore - this.aiScore >= MATCH.WIN_BY;
    const aiWon =
      this.aiScore >= MATCH.TARGET_SCORE && this.aiScore - this.playerScore >= MATCH.WIN_BY;
    this.pendingMatchEnd = playerWon || aiWon;
    if (this.pendingMatchEnd) this.pointTimer = 1.9;
  }

  updatePoint(dt) {
    this.pointTimer -= dt;
    if (this.pointTimer > 0) return;
    if (this.letServe) {
      this.letServe = false;
      this.beginServe();
    } else if (this.pendingMatchEnd) {
      this.endMatch();
    } else {
      this.beginServe();
    }
  }

  endMatch() {
    this.state = 'matchOver';
    this.pendingMatchEnd = false;
    this.playerPaddle.charging = false;
    this.playerPaddle.charge = 0;
    this.playerPaddle.swingTime = 0;
    this.ball.active = false;
    this.ball.mode = 'idle';
    this.input.setEnabled(false);
    this.ui.setServePrompt(false);
    this.ui.showResult({
      won: this.playerScore > this.aiScore,
      playerScore: this.playerScore,
      aiScore: this.aiScore,
      longestRally: this.longestRally,
      winners: this.winners,
      difficultyLabel: this.config.label,
    });
    if (this.playerScore > this.aiScore) this.audio.win();
    else this.audio.lose();
  }

  pause() {
    if (this.state === 'menu' || this.state === 'paused' || this.state === 'matchOver') return;
    this.pausedState = this.state;
    this.state = 'paused';
    this.input.setEnabled(false);
    this.ui.showPause();
    this.audio.ui();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = this.pausedState ?? 'serve';
    this.pausedState = null;
    this.input.setEnabled(true);
    this.ui.hidePause();
    this.ui.showHUD();
  }

  togglePause() {
    if (this.state === 'paused') this.resume();
    else this.pause();
  }

  quitToMenu() {
    this.state = 'menu';
    this.pausedState = null;
    this.letServe = false;
    this.ball.reset();
    this.ball.active = false;
    this.ball.mode = 'idle';
    this.input.setEnabled(false);
    this.ui.showMenu();
    this.ui.setServePrompt(false);
    this.world.setMode('menu');
    this.world.setPlayerVisible(false);
    this.playerScore = 0;
    this.aiScore = 0;
    this.server = 'player';
    this.updateScoreboard();
    this.ui.setScore(0, 0);
    this.ui.setServer('player');
    this.ai.reset();
    this.syncAiPaddle();
    this.aimTarget = null;
    this.landingPoint = null;
    this.serveTarget = null;
  }

  restart() {
    this.ui.hidePause();
    this.ui.hideResult();
    this.startMatch(this.difficultyKey);
  }

  toggleMute() {
    this.audio.init();
    const muted = !this.audio.muted;
    this.audio.setMuted(muted);
    this.ui.setMuted(muted);
  }

  getWorldState() {
    return {
      state: this.state,
      ball: this.ball,
      playerPaddle: this.playerPaddle,
      aiPaddle: this.aiPaddle,
      mouse: this.input.mouse,
      aimTarget: this.aimTarget,
      landingPoint: this.landingPoint,
      serveTarget: this.serveTarget,
    };
  }

  updateDebug(dt) {
    if (!this.debugEnabled || !this.debugPanel) return;
    this.debugTimer -= dt;
    if (this.debugTimer > 0) return;
    this.debugTimer = 0.15;
    const b = this.ball;
    const speed = b.velocity.length();
    this.debugPanel.classList.remove('hidden');
    this.debugPanel.textContent = [
      `state ${this.state} / ${this.serveState ?? '-'}`,
      `score ${this.playerScore}:${this.aiScore}  server ${this.server}`,
      `ball ${b.position.x.toFixed(2)}, ${b.position.y.toFixed(2)}, ${b.position.z.toFixed(2)}`,
      `vel ${b.velocity.x.toFixed(2)}, ${b.velocity.y.toFixed(2)}, ${b.velocity.z.toFixed(2)}  |v| ${speed.toFixed(2)}`,
      `bounce P${b.bouncedOnPlayer ? 1 : 0} A${b.bouncedOnAI ? 1 : 0}  can P${b.canHitPlayer ? 1 : 0} A${b.canHitAI ? 1 : 0}`,
      `paddle ${this.playerPaddle.x.toFixed(2)}, ${this.playerPaddle.y.toFixed(2)}, ${this.playerPaddle.z.toFixed(2)}`,
      `ai ${this.ai.position.x.toFixed(2)}, ${this.ai.position.y.toFixed(2)} target ${this.ai.target.x.toFixed(2)}, ${this.ai.target.y.toFixed(2)}`,
      `rally ${this.rallyHits}  assist ${this.config.playerAssist.toFixed(3)}`,
    ].join('\n');
  }

  onResize() {
    this.world.onResize();
  }

  advance(seconds) {
    const step = 1 / 60;
    let elapsed = 0;
    while (elapsed < seconds) {
      this.update(step);
      this.ui.update(step);
      elapsed += step;
    }
  }

  getDebugState() {    return {
      state: this.state,
      serveState: this.serveState,
      score: [this.playerScore, this.aiScore],
      server: this.server,
      difficulty: this.difficultyKey,
      ball: {
        active: this.ball.active,
        mode: this.ball.mode,
        servePhase: this.ball.servePhase,
        lastHitBy: this.ball.lastHitBy,
        position: this.ball.position.toArray(),
        velocity: this.ball.velocity.toArray(),
        canHitPlayer: this.ball.canHitPlayer,
        canHitAI: this.ball.canHitAI,
        bouncedOnPlayer: this.ball.bouncedOnPlayer,
        bouncedOnAI: this.ball.bouncedOnAI,
      },
      paddle: [this.playerPaddle.x, this.playerPaddle.y, this.playerPaddle.z],
      ai: [this.ai.position.x, this.ai.position.y],
      rally: this.rallyHits,
      pointTimer: this.pointTimer,
    };
  }
}
