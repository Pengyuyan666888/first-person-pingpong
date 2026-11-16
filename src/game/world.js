import * as THREE from 'three';
import { AI, BALL, CAMERA, COLORS, PLAYER, TABLE } from './constants.js';
import { clamp, damp, lerp } from './utils.js';

const UP = new THREE.Vector3(0, 1, 0);
const PLAYER_SHOULDER = new THREE.Vector3(0.92, 0.18, 2.5);
const ROBOT_SHOULDER = new THREE.Vector3(0.34, 1.32, -2.34);

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function createWoodTexture() {
  const canvas = makeCanvas(512, 512);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#4d3322';
  ctx.fillRect(0, 0, 512, 512);

  const plankHeight = 64;
  for (let row = 0; row < 8; row += 1) {
    const y = row * plankHeight;
    const shade = 36 + Math.floor(Math.random() * 18);
    ctx.fillStyle = `rgb(${shade + 26}, ${shade + 10}, ${Math.floor(shade * 0.62)})`;
    ctx.fillRect(0, y, 512, plankHeight - 2);

    ctx.strokeStyle = 'rgba(20, 11, 6, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y + plankHeight - 1);
    ctx.lineTo(512, y + plankHeight - 1);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 210, 150, 0.045)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i += 1) {
      const grainY = y + 8 + Math.random() * (plankHeight - 16);
      ctx.beginPath();
      ctx.moveTo(0, grainY);
      for (let x = 0; x <= 512; x += 24) {
        ctx.lineTo(x, grainY + Math.sin((x + row * 31) * 0.025) * 2.3);
      }
      ctx.stroke();
    }

    const seam = 80 + Math.random() * 340;
    ctx.strokeStyle = 'rgba(18, 10, 5, 0.5)';
    ctx.beginPath();
    ctx.moveTo(seam, y);
    ctx.lineTo(seam, y + plankHeight);
    ctx.stroke();
  }

  const image = ctx.getImageData(0, 0, 512, 512);
  for (let i = 0; i < image.data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 14;
    image.data[i] += noise;
    image.data[i + 1] += noise;
    image.data[i + 2] += noise;
  }
  ctx.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 5);
  texture.anisotropy = 8;
  return texture;
}

function createBackdropTexture() {
  const canvas = makeCanvas(1024, 512);
  const ctx = canvas.getContext('2d');
  const base = ctx.createLinearGradient(0, 0, 0, 512);
  base.addColorStop(0, '#071423');
  base.addColorStop(0.55, '#050d18');
  base.addColorStop(1, '#03070d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 1024, 512);

  const cyanGlow = ctx.createRadialGradient(220, 260, 20, 220, 260, 430);
  cyanGlow.addColorStop(0, 'rgba(38, 148, 190, 0.28)');
  cyanGlow.addColorStop(0.55, 'rgba(18, 74, 112, 0.12)');
  cyanGlow.addColorStop(1, 'rgba(4, 12, 22, 0)');
  ctx.fillStyle = cyanGlow;
  ctx.fillRect(0, 0, 1024, 512);

  const orangeGlow = ctx.createRadialGradient(830, 230, 20, 830, 230, 360);
  orangeGlow.addColorStop(0, 'rgba(181, 86, 32, 0.18)');
  orangeGlow.addColorStop(0.6, 'rgba(92, 42, 18, 0.08)');
  orangeGlow.addColorStop(1, 'rgba(4, 12, 22, 0)');
  ctx.fillStyle = orangeGlow;
  ctx.fillRect(0, 0, 1024, 512);

  ctx.strokeStyle = 'rgba(112, 184, 222, 0.055)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= 1024; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
    ctx.stroke();
  }
  for (let y = 0; y <= 512; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1024, y);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(140, 220, 255, 0.16)';
  ctx.lineWidth = 3;
  ctx.strokeRect(22, 22, 980, 468);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function createNetTexture() {  const canvas = makeCanvas(256, 128);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 128);
  ctx.strokeStyle = 'rgba(210, 235, 255, 0.68)';
  ctx.lineWidth = 1.4;
  for (let x = 0; x <= 256; x += 10) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 128);
    ctx.stroke();
  }
  for (let y = 0; y <= 128; y += 10) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.lineTo(256, 6);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 1);
  texture.anisotropy = 8;
  return texture;
}

function createGlowTexture() {
  const canvas = makeCanvas(128, 128);
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.18, 'rgba(255,230,180,0.9)');
  gradient.addColorStop(0.45, 'rgba(255,150,70,0.35)');
  gradient.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createTextTexture(lines, options = {}) {
  const width = options.width ?? 1024;
  const height = options.height ?? 512;
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = options.background ?? 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, width, height);

  if (options.border) {
    ctx.strokeStyle = options.border;
    ctx.lineWidth = 10;
    ctx.strokeRect(14, 14, width - 28, height - 28);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, index) => {
    ctx.fillStyle = line.color ?? options.color ?? '#e8f8ff';
    ctx.font = `${line.weight ?? 800} ${line.size ?? 100}px "Microsoft YaHei", "Arial Black", sans-serif`;
    ctx.fillText(line.text, width / 2 + (line.x ?? 0), line.y ?? height / 2 + index * (line.size ?? 100));
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return { canvas, ctx, texture };
}

class Effects {
  constructor(scene) {
    this.scene = scene;
    this.glowTexture = createGlowTexture();
    this.items = [];
    this.ringGeometry = new THREE.RingGeometry(0.78, 1, 40);
    this.flashGeometry = new THREE.PlaneGeometry(1, 1);
  }

  spawnRing(position, color = COLORS.orange, size = 0.2, duration = 0.4) {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(this.ringGeometry, material);
    mesh.position.copy(position);
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.setScalar(size);
    mesh.renderOrder = 5;
    this.scene.add(mesh);
    this.items.push({
      type: 'ring',
      object: mesh,
      material,
      life: 0,
      duration,
      startSize: size,
      endSize: size * 2.55,
      spin: (Math.random() - 0.5) * 2,
    });
  }

  spawnBurst(position, color = COLORS.orange, power = 1) {
    const count = Math.round(5 + power * 7);
    for (let i = 0; i < count; i += 1) {
      const material = new THREE.SpriteMaterial({
        map: this.glowTexture,
        color,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      const scale = 0.035 + Math.random() * 0.045;
      sprite.scale.setScalar(scale);
      sprite.position.copy(position);
      this.scene.add(sprite);
      const direction = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.25) * 2,
        (Math.random() - 0.5) * 2,
      ).normalize();
      this.items.push({
        type: 'sprite',
        object: sprite,
        material,
        life: 0,
        duration: 0.28 + Math.random() * 0.18,
        velocity: direction.multiplyScalar(0.7 + Math.random() * 1.4 * power),
        startScale: scale,
      });
    }
  }

  spawnFlash(position, color = COLORS.orange, size = 0.25) {
    const material = new THREE.SpriteMaterial({
      map: this.glowTexture,
      color,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.setScalar(size);
    this.scene.add(sprite);
    this.items.push({
      type: 'sprite',
      object: sprite,
      material,
      life: 0,
      duration: 0.16,
      velocity: new THREE.Vector3(),
      startScale: size,
    });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      const item = this.items[i];
      item.life += dt;
      const t = clamp(item.life / item.duration, 0, 1);

      if (item.type === 'ring') {
        const scale = lerp(item.startSize, item.endSize, 1 - (1 - t) * (1 - t));
        item.object.scale.setScalar(scale);
        item.object.rotation.z += item.spin * dt;
        item.material.opacity = 0.75 * (1 - t);
      } else {
        item.object.position.addScaledVector(item.velocity, dt);
        item.velocity.multiplyScalar(1 - 3.4 * dt);
        const scale = item.startScale * (1 + t * 1.7);
        item.object.scale.setScalar(scale);
        item.material.opacity = 0.8 * (1 - t);
      }

      if (t >= 1) {
        this.scene.remove(item.object);
        item.material.dispose();
        this.items.splice(i, 1);
      }
    }
  }
}

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x060a12);
    this.scene.fog = new THREE.FogExp2(0x060a12, 0.017);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.camera = new THREE.PerspectiveCamera(
      CAMERA.FOV,
      window.innerWidth / window.innerHeight,
      0.04,
      80,
    );
    this.camera.position.fromArray(CAMERA.MENU_POS);

    this.cameraLook = new THREE.Vector3().fromArray(CAMERA.MENU_LOOK);
    this.cameraPosition = this.camera.position.clone();
    this.cameraMode = 'menu';
    this.time = 0;
    this.cameraShake = new THREE.Vector3();
    this.shakeEnergy = 0;
    this.fovKick = 0;
    this.menuOrbitAngle = Math.atan2(CAMERA.MENU_POS[0], CAMERA.MENU_POS[2]);

    this.effects = new Effects(this.scene);
    this.build();
  }

  build() {
    this.buildLights();
    this.buildRoom();
    this.buildTable();
    this.buildScoreboard();
    this.buildPlayerPaddle();
    this.buildRobot();
    this.buildBall();
    this.buildMarkers();
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight(0x8bc8ff, 0x090d12, 0.95);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xd6efff, 3.0);
    key.position.set(4.5, 8.5, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -6;
    key.shadow.camera.right = 6;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -6;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 22;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.025;
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x3fbde8, 1.15);
    rim.position.set(-5, 4, -6);
    this.scene.add(rim);

    const frontFill = new THREE.DirectionalLight(0x9dbbd8, 0.85);
    frontFill.position.set(0, 4.5, 8);
    this.scene.add(frontFill);

    const warm = new THREE.PointLight(0xff8d45, 30, 9, 2);
    warm.position.set(-3.5, 3.6, 2.2);
    this.scene.add(warm);

    const cool = new THREE.PointLight(0x4bdbff, 34, 10, 2);
    cool.position.set(3.8, 3.4, -1.8);
    this.scene.add(cool);

    const warmSpot = new THREE.SpotLight(0xffbb7a, 95, 12, 0.48, 0.7, 1.6);
    warmSpot.position.set(-1.5, 5.8, 2.4);
    warmSpot.target.position.set(-0.2, TABLE.HEIGHT, 0.3);
    this.scene.add(warmSpot, warmSpot.target);

    const coolSpot = new THREE.SpotLight(0xb8ebff, 110, 12, 0.5, 0.72, 1.6);
    coolSpot.position.set(1.6, 5.8, -2.5);
    coolSpot.target.position.set(0.2, TABLE.HEIGHT, -0.3);
    this.scene.add(coolSpot, coolSpot.target);
  }

  buildRoom() {
    const floorTexture = createWoodTexture();
    const floorMaterial = new THREE.MeshStandardMaterial({
      map: floorTexture,
      color: 0x9d8a78,
      roughness: 0.74,
      metalness: 0.04,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(28, 28), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const mat = new THREE.Mesh(
      new THREE.PlaneGeometry(5.6, 9.6),
      new THREE.MeshStandardMaterial({ color: 0x091523, roughness: 0.83, metalness: 0.06 }),
    );
    mat.rotation.x = -Math.PI / 2;
    mat.position.y = 0.006;
    mat.receiveShadow = true;
    this.scene.add(mat);

    const matLineMaterial = new THREE.MeshBasicMaterial({
      color: 0x1c8fb0,
      transparent: true,
      opacity: 0.35,
    });
    const matLineA = new THREE.Mesh(new THREE.PlaneGeometry(0.018, 8.8), matLineMaterial);
    matLineA.rotation.x = -Math.PI / 2;
    matLineA.position.set(-2.55, 0.009, 0);
    this.scene.add(matLineA);
    const matLineB = matLineA.clone();
    matLineB.position.x = 2.55;
    this.scene.add(matLineB);

    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x0f1c2e,
      roughness: 0.92,
      metalness: 0.03,
    });
    const backWall = new THREE.Mesh(
      new THREE.PlaneGeometry(19, 7),
      new THREE.MeshBasicMaterial({ map: createBackdropTexture() }),
    );
    backWall.position.set(0, 3.5, -8.2);
    this.scene.add(backWall);

    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(17, 7), wallMaterial.clone());
    leftWall.position.set(-8.5, 3.5, 0);
    leftWall.rotation.y = Math.PI / 2;
    this.scene.add(leftWall);

    const rightWall = leftWall.clone();
    rightWall.position.x = 8.5;
    rightWall.rotation.y = -Math.PI / 2;
    this.scene.add(rightWall);

    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 18),
      new THREE.MeshStandardMaterial({ color: 0x05080e, roughness: 1 }),
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 6.7;
    this.scene.add(ceiling);

    const panelMaterial = new THREE.MeshStandardMaterial({
      color: 0x0d1929,
      roughness: 0.8,
      metalness: 0.14,
    });
    for (let i = -4; i <= 4; i += 1) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.035, 4.8, 0.7), panelMaterial);
      panel.position.set(i * 1.85, 2.6, -8.16);
      this.scene.add(panel);
    }

    const stripMaterial = new THREE.MeshBasicMaterial({
      color: 0x38c7e8,
      transparent: true,
      opacity: 0.55,
    });
    for (const x of [-6.2, -2.1, 2.1, 6.2]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.04, 10), stripMaterial);
      strip.position.set(x, 0.018, 0);
      this.scene.add(strip);
    }

    const upperStrip = new THREE.Mesh(new THREE.BoxGeometry(16, 0.035, 0.03), stripMaterial);
    upperStrip.position.set(0, 5.55, -8.17);
    this.scene.add(upperStrip);

    const orangeStrip = new THREE.Mesh(
      new THREE.BoxGeometry(16, 0.035, 0.03),
      new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.4 }),
    );
    orangeStrip.position.set(0, 5.44, -8.18);
    this.scene.add(orangeStrip);

    const bannerLeft = createTextTexture(
      [
        { text: '极速', size: 140, weight: 900, color: '#dff8ff' },
        { text: 'RALLY', size: 60, weight: 800, color: '#61e7ff', y: 300 },
      ],
      { background: 'rgba(9,24,40,0.92)', border: 'rgba(97,231,255,0.3)' },
    );
    const bannerLeftMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.15, 1.12),
      new THREE.MeshBasicMaterial({ map: bannerLeft.texture, transparent: false }),
    );
    bannerLeftMesh.position.set(-4.7, 3.65, -8.14);
    this.scene.add(bannerLeftMesh);

    const bannerRight = createTextTexture(
      [
        { text: '乒乓', size: 140, weight: 900, color: '#ffe5cc' },
        { text: 'ARENA', size: 60, weight: 800, color: '#ff8a3d', y: 300 },
      ],
      { background: 'rgba(29,16,12,0.9)', border: 'rgba(255,138,61,0.28)' },
    );
    const bannerRightMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.15, 1.12),
      new THREE.MeshBasicMaterial({ map: bannerRight.texture }),
    );
    bannerRightMesh.position.set(4.7, 3.65, -8.14);
    this.scene.add(bannerRightMesh);

    const bleacherMaterial = new THREE.MeshStandardMaterial({
      color: 0x0a1523,
      roughness: 0.92,
    });
    for (let i = 0; i < 4; i += 1) {
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(0.75, 0.22 + i * 0.22, 8.4),
        bleacherMaterial,
      );
      step.position.set(-6.6 + i * 0.72, 0.11 + i * 0.11, -0.2);
      step.castShadow = false;
      step.receiveShadow = true;
      this.scene.add(step);
      const stepRight = step.clone();
      stepRight.position.x *= -1;
      this.scene.add(stepRight);
    }

    this.buildCeilingLights();
  }

  buildCeilingLights() {
    const housingMaterial = new THREE.MeshStandardMaterial({
      color: 0x131d29,
      roughness: 0.55,
      metalness: 0.5,
    });
    const glowMaterial = new THREE.MeshBasicMaterial({ color: 0xeaf9ff });
    for (const x of [-2.2, 2.2]) {
      for (const z of [-2.3, 2.3]) {
        const housing = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.12, 0.32), housingMaterial);
        housing.position.set(x, 5.9, z);
        this.scene.add(housing);
        const glow = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.02, 0.2), glowMaterial);
        glow.position.set(x, 5.83, z);
        this.scene.add(glow);
      }
    }
  }

  buildTable() {
    const tableGroup = new THREE.Group();

    const topMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.table,
      roughness: 0.34,
      metalness: 0.08,
    });
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(TABLE.WIDTH, TABLE.THICKNESS, TABLE.LENGTH),
      topMaterial,
    );
    top.position.y = TABLE.HEIGHT - TABLE.THICKNESS / 2;
    top.castShadow = true;
    top.receiveShadow = true;
    tableGroup.add(top);

    const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xf6fbff });
    const addLine = (width, depth, x, z) => {
      const line = new THREE.Mesh(new THREE.BoxGeometry(width, 0.004, depth), lineMaterial);
      line.position.set(x, TABLE.HEIGHT + 0.002, z);
      tableGroup.add(line);
    };
    addLine(0.025, TABLE.LENGTH, -TABLE.HALF_WIDTH + 0.0125, 0);
    addLine(0.025, TABLE.LENGTH, TABLE.HALF_WIDTH - 0.0125, 0);
    addLine(TABLE.WIDTH, 0.025, 0, -TABLE.HALF_LENGTH + 0.0125);
    addLine(TABLE.WIDTH, 0.025, 0, TABLE.HALF_LENGTH - 0.0125);
    addLine(0.008, TABLE.LENGTH - 0.05, 0, 0);

    const netTexture = createNetTexture();
    const net = new THREE.Mesh(
      new THREE.PlaneGeometry(TABLE.WIDTH + 0.3, TABLE.NET_HEIGHT),
      new THREE.MeshBasicMaterial({
        map: netTexture,
        transparent: true,
        opacity: 0.62,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    net.position.set(0, TABLE.HEIGHT + TABLE.NET_HEIGHT / 2, 0);
    tableGroup.add(net);

    const tape = new THREE.Mesh(
      new THREE.BoxGeometry(TABLE.WIDTH + 0.31, 0.016, 0.014),
      new THREE.MeshStandardMaterial({ color: 0xe9f7ff, roughness: 0.5 }),
    );
    tape.position.set(0, TABLE.HEIGHT + TABLE.NET_HEIGHT, 0);
    tableGroup.add(tape);

    const postMaterial = new THREE.MeshStandardMaterial({
      color: 0x182432,
      roughness: 0.4,
      metalness: 0.6,
    });
    for (const x of [-TABLE.HALF_WIDTH - 0.15, TABLE.HALF_WIDTH + 0.15]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.014, TABLE.NET_HEIGHT + 0.02, 12),
        postMaterial,
      );
      post.position.set(x, TABLE.HEIGHT + TABLE.NET_HEIGHT / 2, 0);
      tableGroup.add(post);
    }

    const legMaterial = new THREE.MeshStandardMaterial({
      color: 0x151d27,
      roughness: 0.45,
      metalness: 0.6,
    });
    for (const x of [-0.55, 0.55]) {
      for (const z of [-0.92, 0.92]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, TABLE.HEIGHT - 0.03, 0.07), legMaterial);
        leg.position.set(x, (TABLE.HEIGHT - 0.03) / 2, z);
        leg.castShadow = true;
        tableGroup.add(leg);
      }
    }
    for (const z of [-0.92, 0.92]) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.045, 0.045), legMaterial);
      brace.position.set(0, 0.22, z);
      tableGroup.add(brace);
    }

    this.tableGroup = tableGroup;
    this.scene.add(tableGroup);
  }

  buildScoreboard() {
    const width = 1024;
    const height = 280;
    const canvas = makeCanvas(width, height);
    const ctx = canvas.getContext('2d');
    this.scoreCanvas = canvas;
    this.scoreCtx = ctx;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    this.scoreTexture = texture;

    this.updateScoreboard(0, 0, 'player');

    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2, 1.15),
      new THREE.MeshBasicMaterial({ map: texture }),
    );
    panel.position.set(0, 3.05, -8.12);
    this.scene.add(panel);

    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0x111c2b,
      roughness: 0.45,
      metalness: 0.55,
    });
    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(4.38, 0.08, 0.1), frameMaterial);
    frameTop.position.set(0, 3.65, -8.16);
    this.scene.add(frameTop);
    const frameBottom = frameTop.clone();
    frameBottom.position.y = 2.45;
    this.scene.add(frameBottom);

    for (const x of [-2.14, 2.14]) {
      const cable = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 2.05, 8),
        new THREE.MeshBasicMaterial({ color: 0x182433 }),
      );
      cable.position.set(x, 4.72, -8.18);
      this.scene.add(cable);
    }
  }

  updateScoreboard(playerScore, aiScore, server) {
    const ctx = this.scoreCtx;
    const canvas = this.scoreCanvas;
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#07111f');
    gradient.addColorStop(0.5, '#0a1828');
    gradient.addColorStop(1, '#07101c');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(97,231,255,0.22)';
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, width - 16, height - 16);

    ctx.font = '800 30px "Bahnschrift", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#6b89a6';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('RALLY ARENA', width / 2, 38);

    ctx.font = '900 96px "Arial Black", "Bahnschrift", sans-serif';
    ctx.fillStyle = '#e9f8ff';
    ctx.fillText(String(playerScore), width * 0.28, 145);
    ctx.fillStyle = '#ffb37a';
    ctx.fillText(String(aiScore), width * 0.72, 145);

    ctx.font = '800 26px "Microsoft YaHei", sans-serif';
    ctx.fillStyle = server === 'player' ? '#61e7ff' : '#668096';
    ctx.fillText('YOU', width * 0.28, 214);
    ctx.fillStyle = server === 'ai' ? '#ff8a3d' : '#668096';
    ctx.fillText('CPU', width * 0.72, 214);

    ctx.font = '900 54px "Arial Black", sans-serif';
    ctx.fillStyle = '#36506b';
    ctx.fillText(':', width / 2, 145);

    ctx.beginPath();
    ctx.arc(width * 0.28, 252, 5, 0, Math.PI * 2);
    ctx.fillStyle = server === 'player' ? '#61e7ff' : '#26394c';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(width * 0.72, 252, 5, 0, Math.PI * 2);
    ctx.fillStyle = server === 'ai' ? '#ff8a3d' : '#26394c';
    ctx.fill();

    this.scoreTexture.needsUpdate = true;
  }

  createPaddle(forPlayer = true) {
    const group = new THREE.Group();
    const radius = forPlayer ? 0.105 : 0.12;

    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: forPlayer ? 0xd45c3f : 0xd45c3f,
      roughness: 0.42,
      metalness: 0.18,
    });
    const faceMaterial = new THREE.MeshStandardMaterial({
      color: forPlayer ? 0x161c24 : 0x191f27,
      roughness: 0.5,
      metalness: 0.08,
    });
    const woodMaterial = new THREE.MeshStandardMaterial({
      color: 0xb98a5d,
      roughness: 0.66,
      metalness: 0.02,
    });

    const blade = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, 0.011, 40),
      faceMaterial,
    );
    blade.rotation.x = Math.PI / 2;
    blade.castShadow = true;
    group.add(blade);

    const edge = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.985, 0.005, 8, 48), edgeMaterial);
    edge.position.z = 0;
    edge.castShadow = true;
    group.add(edge);

    const faceRing = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.66, 0.0022, 6, 40),
      new THREE.MeshBasicMaterial({
        color: forPlayer ? 0x61e7ff : 0xff8a3d,
        transparent: true,
        opacity: 0.55,
      }),
    );
    faceRing.position.z = 0.007;
    group.add(faceRing);

    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.15, 0.03), woodMaterial);
    handle.position.set(0, -0.17, -0.004);
    handle.castShadow = true;
    group.add(handle);

    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.047, 0.055, 0.032),
      new THREE.MeshStandardMaterial({ color: 0x222a34, roughness: 0.8 }),
    );
    grip.position.set(0, -0.225, -0.004);
    group.add(grip);

    group.userData.faceMaterial = faceMaterial;
    group.userData.edgeMaterial = edgeMaterial;
    group.userData.radius = radius;
    return group;
  }

  buildPlayerPaddle() {
    this.playerPaddle = this.createPaddle(true);
    this.playerPaddle.rotation.y = Math.PI;
    this.playerPaddle.position.set(0, 0.95, PLAYER.PADDLE_Z);
    this.scene.add(this.playerPaddle);

    const sleeveMaterial = new THREE.MeshStandardMaterial({
      color: 0x1b4c66,
      roughness: 0.82,
      metalness: 0.02,
    });
    const skinMaterial = new THREE.MeshStandardMaterial({
      color: 0xc58d68,
      roughness: 0.78,
      metalness: 0.01,
    });

    this.playerForearm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.034, 1, 12),
      sleeveMaterial,
    );
    this.playerForearm.castShadow = true;
    this.scene.add(this.playerForearm);

    this.playerHand = new THREE.Mesh(new THREE.SphereGeometry(0.043, 16, 12), skinMaterial);
    this.playerHand.castShadow = true;
    this.scene.add(this.playerHand);

    this.playerCuff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.09, 12),
      new THREE.MeshStandardMaterial({ color: 0x59d9f4, roughness: 0.46, metalness: 0.3 }),
    );
    this.scene.add(this.playerCuff);
  }

  buildRobot() {
    const robot = new THREE.Group();
    robot.position.set(0, 0, AI.BODY_Z);

    const shellMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.robot,
      roughness: 0.36,
      metalness: 0.68,
    });
    const darkMaterial = new THREE.MeshStandardMaterial({
      color: 0x0c1522,
      roughness: 0.5,
      metalness: 0.55,
    });
    const glowMaterial = new THREE.MeshBasicMaterial({ color: COLORS.robotGlow });
    const orangeGlowMaterial = new THREE.MeshBasicMaterial({ color: 0xff8a3d });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 0.22, 28), darkMaterial);
    base.position.y = 0.12;
    base.castShadow = true;
    base.receiveShadow = true;
    robot.add(base);

    const baseRing = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.025, 8, 36), glowMaterial);
    baseRing.rotation.x = Math.PI / 2;
    baseRing.position.y = 0.23;
    robot.add(baseRing);

    const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.25, 0.18, 20), shellMaterial);
    waist.position.y = 0.34;
    waist.castShadow = true;
    robot.add(waist);

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.48, 6, 16), shellMaterial);
    torso.position.y = 0.85;
    torso.castShadow = true;
    robot.add(torso);

    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.22), glowMaterial);
    chest.position.set(0, 0.95, 0.23);
    robot.add(chest);
    const chestRing = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 8, 24), orangeGlowMaterial);
    chestRing.position.set(0, 1.04, 0.25);
    robot.add(chestRing);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.12, 12), darkMaterial);
    neck.position.y = 1.36;
    robot.add(neck);

    const head = new THREE.Group();
    head.position.y = 1.55;
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.23, 0.26), shellMaterial);
    skull.castShadow = true;
    head.add(skull);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.075, 0.018), glowMaterial);
    visor.position.set(0, 0.012, 0.135);
    head.add(visor);
    const visorGlow = new THREE.PointLight(0x61e7ff, 2.2, 1.3, 2);
    visorGlow.position.set(0, 0.012, 0.2);
    head.add(visorGlow);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 6), darkMaterial);
    antenna.position.set(0.1, 0.18, 0);
    head.add(antenna);
    const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), orangeGlowMaterial);
    antennaTip.position.set(0.1, 0.27, 0);
    head.add(antennaTip);
    robot.add(head);

    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), darkMaterial);
    shoulder.position.set(0.34, 1.15, 0.02);
    shoulder.castShadow = true;
    robot.add(shoulder);

    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.043, 1, 10), shellMaterial);
    arm.castShadow = true;
    this.scene.add(arm);
    this.robotArm = arm;

    this.robotPaddle = this.createPaddle(false);
    this.robotPaddle.scale.setScalar(1.04);
    this.robotPaddle.position.set(0, 1.05, AI.PADDLE_Z);
    this.scene.add(this.robotPaddle);

    this.robotHand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), darkMaterial);
    this.robotHand.castShadow = true;
    this.scene.add(this.robotHand);

    this.robotElbow = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), darkMaterial);
    this.scene.add(this.robotElbow);

    this.robot = robot;
    this.robotHead = head;
    this.robotTorso = torso;
    this.robotShoulder = ROBOT_SHOULDER.clone();
    this.scene.add(robot);
  }

  buildBall() {
    const ballMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.ball,
      roughness: 0.32,
      metalness: 0.02,
      emissive: 0xffb469,
      emissiveIntensity: 0.16,
    });
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL.RADIUS, 24, 18), ballMaterial);
    this.ballMesh.castShadow = true;
    this.scene.add(this.ballMesh);

    this.ballGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: createGlowTexture(),
        color: 0xffc278,
        transparent: true,
        opacity: 0.68,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.ballGlow.scale.setScalar(0.14);
    this.scene.add(this.ballGlow);

    const shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    this.ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.045, 24), shadowMaterial);
    this.ballShadow.rotation.x = -Math.PI / 2;
    this.ballShadow.position.y = TABLE.HEIGHT + 0.006;
    this.scene.add(this.ballShadow);

    const trailGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(28 * 3);
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    trailGeometry.setDrawRange(0, 0);
    this.ballTrail = new THREE.Line(
      trailGeometry,
      new THREE.LineBasicMaterial({
        color: 0xffa45c,
        transparent: true,
        opacity: 0.38,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.ballTrail.frustumCulled = false;
    this.scene.add(this.ballTrail);
  }

  buildMarkers() {
    this.aimMarker = this.createMarker(0xff8a3d, 0.085);
    this.aimMarker.visible = false;
    this.scene.add(this.aimMarker);

    this.landingMarker = this.createMarker(0x61e7ff, 0.105);
    this.landingMarker.visible = false;
    this.scene.add(this.landingMarker);

    const serveAim = this.createMarker(0xffb15f, 0.075);
    serveAim.visible = false;
    this.serveAim = serveAim;
    this.scene.add(serveAim);

    this.impactMarkers = [];
    for (let i = 0; i < 2; i += 1) {
      const marker = this.createMarker(0xff8a3d, 0.07);
      marker.visible = false;
      this.scene.add(marker);
      this.impactMarkers.push(marker);
    }
  }

  createMarker(color, radius) {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.82, radius, 40), material);
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 6;
    group.add(ring);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.14, 16), material.clone());
    dot.rotation.x = -Math.PI / 2;
    dot.renderOrder = 6;
    group.add(dot);
    const crossMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    });
    const crossA = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2.6, 0.003), crossMaterial);
    crossA.rotation.x = -Math.PI / 2;
    crossA.renderOrder = 6;
    group.add(crossA);
    const crossB = crossA.clone();
    crossB.rotation.z = Math.PI / 2;
    crossB.renderOrder = 6;
    group.add(crossB);
    group.position.y = TABLE.HEIGHT + 0.008;
    group.userData.ring = ring;
    group.userData.dot = dot;
    return group;
  }

  setMode(mode) {
    this.cameraMode = mode;
  }

  snapToPlay() {
    this.cameraMode = 'play';
    this.cameraPosition.fromArray(CAMERA.PLAY_POS);
    this.cameraLook.fromArray(CAMERA.PLAY_LOOK);
    this.cameraShake.set(0, 0, 0);
    this.fovKick = 0;
    this.shakeEnergy = 0;
    this.camera.position.copy(this.cameraPosition);
    this.camera.lookAt(this.cameraLook);
    this.camera.fov = CAMERA.FOV;
    this.camera.updateProjectionMatrix();
  }

  setPlayerVisible(visible) {
    this.playerPaddle.visible = visible;
    this.playerForearm.visible = visible;
    this.playerHand.visible = visible;
    this.playerCuff.visible = visible;
  }

  kick(power = 0.5, direction = new THREE.Vector3()) {
    const amount = 0.006 + power * 0.012;
    this.cameraShake.addScaledVector(direction, amount);
    this.shakeEnergy = Math.max(this.shakeEnergy, power);
    this.fovKick = Math.max(this.fovKick, 0.7 + power * 1.8);
  }

  updateCamera(dt, state = {}) {
    this.time += dt;
    let targetPosition;
    let targetLook;

    if (this.cameraMode === 'menu') {
      this.menuOrbitAngle += dt * 0.085;
      const radius = CAMERA.MENU_ORBIT_RADIUS;
      targetPosition = new THREE.Vector3(
        Math.sin(this.menuOrbitAngle) * radius,
        CAMERA.MENU_ORBIT_HEIGHT + Math.sin(this.time * 0.35) * 0.12,
        Math.cos(this.menuOrbitAngle) * radius,
      );
      targetLook = new THREE.Vector3(0, 0.86, 0);
    } else {
      const mouse = state.mouse ?? { nx: 0, ny: 0 };
      targetPosition = new THREE.Vector3().fromArray(CAMERA.PLAY_POS);
      targetPosition.x += mouse.nx * 0.018;
      targetPosition.y += mouse.ny * 0.01;
      targetLook = new THREE.Vector3().fromArray(CAMERA.PLAY_LOOK);
      targetLook.x += mouse.nx * 0.035;
      targetLook.y += mouse.ny * 0.02;
    }

    this.cameraPosition.x = damp(this.cameraPosition.x, targetPosition.x, 4.2, dt);
    this.cameraPosition.y = damp(this.cameraPosition.y, targetPosition.y, 4.2, dt);
    this.cameraPosition.z = damp(this.cameraPosition.z, targetPosition.z, 4.2, dt);
    this.cameraLook.x = damp(this.cameraLook.x, targetLook.x, 4.6, dt);
    this.cameraLook.y = damp(this.cameraLook.y, targetLook.y, 4.6, dt);
    this.cameraLook.z = damp(this.cameraLook.z, targetLook.z, 4.6, dt);

    this.shakeEnergy = Math.max(0, this.shakeEnergy - dt * 2.8);
    this.cameraShake.multiplyScalar(Math.exp(-9 * dt));
    this.fovKick = Math.max(0, this.fovKick - dt * 8.5);

    this.camera.position.copy(this.cameraPosition).add(this.cameraShake);
    this.camera.lookAt(this.cameraLook);
    this.camera.fov = CAMERA.FOV + this.fovKick;
    this.camera.updateProjectionMatrix();
  }

  updatePlayerPaddle(state) {
    const paddle = this.playerPaddle;
    const target = state.playerPaddle;
    if (!target) return;

    paddle.position.set(target.x, target.y, target.z);
    const swing = target.swing;
    const charge = target.charge;
    const nx = state.mouse?.nx ?? 0;
    const ny = state.mouse?.ny ?? 0;

    const baseTilt = -0.11 + ny * 0.05;
    const swingTilt = swing * 0.42;
    paddle.rotation.set(
      baseTilt + charge * 0.12 - swing * 0.25,
      Math.PI + nx * 0.12 + swing * 0.16,
      -0.16 + nx * 0.28 + charge * 0.1 - swing * 0.3,
    );

    const handleLocal = new THREE.Vector3(0, -0.22, 0);
    const handPosition = paddle.localToWorld(handleLocal.clone());
    this.playerHand.position.copy(handPosition);
    this.playerHand.scale.setScalar(1 + charge * 0.12);

    const sleeveStart = PLAYER_SHOULDER;
    const sleeveEnd = handPosition.clone().lerp(sleeveStart, 0.1);
    this.setLimb(this.playerForearm, sleeveStart, sleeveEnd, 0.03);
    this.setCylinderBetween(this.playerCuff, sleeveEnd, handPosition, 0.043);

    const chargeGlow = 0.18 + charge * 0.7;
    paddle.userData.faceMaterial.emissive = new THREE.Color(0x1c7d99);
    paddle.userData.faceMaterial.emissiveIntensity = chargeGlow * 0.16;
  }

  updateRobot(state, dt) {
    if (!this.robotPaddle || !state.aiPaddle) return;
    const target = state.aiPaddle;
    this.robotPaddle.position.set(target.x, target.y, target.z);

    const swing = target.swing;
    this.robotPaddle.rotation.set(
      -0.08 + swing * 0.58,
      swing * 0.2,
      0.08 + target.x * 0.12 - swing * 0.42,
    );

    const handleLocal = new THREE.Vector3(0, -0.27, 0);
    const handPosition = this.robotPaddle.localToWorld(handleLocal.clone());
    this.robotHand.position.copy(handPosition);

    const elbow = new THREE.Vector3(
      lerp(this.robotShoulder.x, handPosition.x, 0.52) + 0.08,
      lerp(this.robotShoulder.y, handPosition.y, 0.48) + 0.12,
      lerp(this.robotShoulder.z, handPosition.z, 0.5),
    );
    this.robotElbow.position.copy(elbow);
    this.setCylinderBetween(this.robotArm, this.robotShoulder, elbow, 0.038);

    if (!this.robotForearm) {
      this.robotForearm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.038, 1, 8),
        new THREE.MeshStandardMaterial({ color: 0x1b283c, roughness: 0.4, metalness: 0.55 }),
      );
      this.robotForearm.castShadow = true;
      this.scene.add(this.robotForearm);
    }
    this.setCylinderBetween(this.robotForearm, elbow, handPosition, 0.034);

    this.robot.position.y = Math.sin(this.time * 1.5) * 0.012;
    this.robotHead.rotation.y = Math.sin(this.time * 0.7) * 0.08 + target.x * 0.15;
    this.robotHead.rotation.z = Math.sin(this.time * 1.1) * 0.02;
    this.robotTorso.rotation.z = Math.sin(this.time * 0.9) * 0.014 - target.x * 0.015;
  }

  setLimb(mesh, start, end, radius) {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    if (length < 0.001) return;
    mesh.position.copy(start).addScaledVector(direction, 0.5);
    mesh.quaternion.setFromUnitVectors(UP, direction.normalize());
    mesh.scale.set(1, length, 1);
  }

  setCylinderBetween(mesh, start, end, radius) {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    if (length < 0.001) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    mesh.position.copy(start).addScaledVector(direction, 0.5);
    mesh.quaternion.setFromUnitVectors(UP, direction.clone().normalize());
    mesh.scale.set(radius / 0.05, length, radius / 0.05);
  }

  updateBall(ball, dt) {
    if (!ball) return;
    this.ballMesh.visible = ball.active || ball.mode === 'toss';
    this.ballGlow.visible = this.ballMesh.visible;
    this.ballMesh.position.copy(ball.position);
    this.ballGlow.position.copy(ball.position);
    this.ballMesh.rotation.set(ball.visualRotation.x, ball.visualRotation.y, 0);

    const height = Math.max(0, ball.position.y - TABLE.HEIGHT);
    const glowScale = 0.11 + Math.min(0.08, height * 0.035);
    this.ballGlow.scale.setScalar(glowScale);
    this.ballGlow.material.opacity = 0.4 + Math.min(0.35, height * 0.08);

    this.ballShadow.visible = this.ballMesh.visible && ball.position.y > TABLE.HEIGHT - 0.05;
    this.ballShadow.position.x = ball.position.x;
    this.ballShadow.position.z = ball.position.z;
    const shadowScale = 0.75 + Math.min(2.2, height * 0.55);
    this.ballShadow.scale.setScalar(shadowScale);
    this.ballShadow.material.opacity = 0.32 * (1 - Math.min(0.9, height * 0.22));

    const positions = this.ballTrail.geometry.attributes.position.array;
    const history = ball.history;
    const count = Math.min(history.length, 28);
    for (let i = 0; i < count; i += 1) {
      const point = history[i];
      const index = (count - 1 - i) * 3;
      positions[index] = point.x;
      positions[index + 1] = point.y;
      positions[index + 2] = point.z;
    }
    this.ballTrail.geometry.attributes.position.needsUpdate = true;
    this.ballTrail.geometry.setDrawRange(0, count);
    this.ballTrail.material.opacity = ball.active ? 0.28 : 0;
  }

  updateMarkers(state) {
    const { ball, aimTarget, landingPoint, serveTarget, state: gameState } = state;

    if (aimTarget && gameState !== 'menu') {
      this.aimMarker.visible = true;
      this.aimMarker.position.x = aimTarget.x;
      this.aimMarker.position.z = aimTarget.z;
      const pulse = 0.86 + Math.sin(this.time * 8) * 0.14;
      this.aimMarker.userData.ring.scale.setScalar(pulse);
      this.aimMarker.userData.ring.material.opacity = 0.55;
    } else {
      this.aimMarker.visible = false;
    }

    if (landingPoint && gameState === 'rally') {
      this.landingMarker.visible = true;
      this.landingMarker.position.x = landingPoint.x;
      this.landingMarker.position.z = landingPoint.z;
      const pulse = 1 + Math.sin(this.time * 10) * 0.12;
      this.landingMarker.scale.setScalar(pulse);
    } else {
      this.landingMarker.visible = false;
    }

    if (serveTarget && (gameState === 'serve' || gameState === 'serve_toss')) {
      this.serveAim.visible = true;
      this.serveAim.position.x = serveTarget.x;
      this.serveAim.position.z = serveTarget.z;
      this.serveAim.userData.ring.scale.setScalar(1 + Math.sin(this.time * 7) * 0.1);
    } else {
      this.serveAim.visible = false;
    }
  }

  update(dt, state) {
    this.updateCamera(dt, state);
    this.updatePlayerPaddle(state);
    this.updateRobot(state, dt);
    this.updateBall(state.ball, dt);
    this.updateMarkers(state);
    this.effects.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  }

  spawnHit(position, color = COLORS.orange, power = 0.7) {
    this.effects.spawnBurst(position, color, power);
    this.effects.spawnFlash(position, color, 0.16 + power * 0.12);
  }

  spawnBounce(position, color = COLORS.cyan, power = 0.4) {
    const point = position.clone();
    point.y = TABLE.HEIGHT + 0.007;
    this.effects.spawnRing(point, color, 0.055 + power * 0.035, 0.3);
  }
}
