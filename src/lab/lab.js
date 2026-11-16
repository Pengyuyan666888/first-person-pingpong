import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BALL, TABLE } from '../game/constants.js';
import {
  LAB_ORIGIN,
  SPIN_PRESETS,
  buildShotSet,
  deviationFromReference,
  getSpinDescription,
  getSpinLabel,
  sampleTrace,
  traceProgress,
} from './spinPhysics.js';

const canvas = document.getElementById('lab-canvas');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05080f);
scene.fog = new THREE.FogExp2(0x05080f, 0.022);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;

const camera = new THREE.PerspectiveCamera(
  46,
  window.innerWidth / window.innerHeight,
  0.04,
  70,
);
camera.position.set(1.25, 2.2, 4.8);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.82, -0.2);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.enablePan = false;
controls.minDistance = 2.2;
controls.maxDistance = 8.5;
controls.maxPolarAngle = Math.PI * 0.47;
controls.update();

const clock = new THREE.Clock();
const state = {
  strength: 0.9,
  speed: 0.55,
  mode: 'single',
  selected: 'topspin',
  showReference: true,
  autoReplay: false,
  playing: false,
  freeze: false,
  playTime: 0,
  hasLaunched: false,
  autoCooldown: 0,
  shotSet: null,
  visuals: new Map(),
};

const ui = {
  spinCards: [...document.querySelectorAll('.spin-card')],
  launch: document.getElementById('launch-btn'),
  compare: document.getElementById('compare-btn'),
  clear: document.getElementById('clear-btn'),
  strength: document.getElementById('spin-strength'),
  strengthValue: document.getElementById('spin-strength-value'),
  speed: document.getElementById('play-speed'),
  speedValue: document.getElementById('play-speed-value'),
  reference: document.getElementById('show-reference'),
  auto: document.getElementById('auto-replay'),
  kicker: document.getElementById('readout-kicker'),
  badge: document.getElementById('readout-badge'),
  desc: document.getElementById('readout-desc'),
  spin: document.getElementById('stat-spin'),
  height: document.getElementById('stat-height'),
  deviation: document.getElementById('stat-deviation'),
  time: document.getElementById('stat-time'),
  compareSummary: document.getElementById('compare-summary'),
};

const formatSigned = (value) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;

const params = new URLSearchParams(window.location.search);
if (params.has('strength')) {
  state.strength = Math.max(0, Math.min(1.2, Number(params.get('strength'))));
}
if (params.get('demo') === 'compare') {
  state.mode = 'compare';
} else if (SPIN_PRESETS[params.get('demo')]) {
  state.selected = params.get('demo');
}
state.freeze = params.get('freeze') === '1';

function createGlowTexture() {
  const canvas2d = document.createElement('canvas');
  canvas2d.width = 128;
  canvas2d.height = 128;
  const ctx = canvas2d.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.65)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas2d);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createNetTexture() {
  const canvas2d = document.createElement('canvas');
  canvas2d.width = 256;
  canvas2d.height = 128;
  const ctx = canvas2d.getContext('2d');
  ctx.clearRect(0, 0, 256, 128);
  ctx.strokeStyle = 'rgba(210, 235, 255, 0.62)';
  ctx.lineWidth = 1.3;
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
  const texture = new THREE.CanvasTexture(canvas2d);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(7, 1);
  texture.anisotropy = 8;
  return texture;
}

function buildLights() {
  scene.add(new THREE.HemisphereLight(0x8bc8ff, 0x080d14, 1.05));

  const key = new THREE.DirectionalLight(0xd8efff, 3.1);
  key.position.set(3.5, 7, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -5;
  key.shadow.camera.right = 5;
  key.shadow.camera.top = 5;
  key.shadow.camera.bottom = -5;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 20;
  key.shadow.bias = -0.0004;
  scene.add(key);

  const cool = new THREE.SpotLight(0x91e8ff, 70, 12, 0.52, 0.72, 1.6);
  cool.position.set(2.4, 5.2, 2.2);
  cool.target.position.set(0, TABLE.HEIGHT, 0);
  scene.add(cool, cool.target);

  const warm = new THREE.SpotLight(0xff9f5e, 55, 10, 0.5, 0.75, 1.6);
  warm.position.set(-2.6, 4.6, -2.2);
  warm.target.position.set(0, TABLE.HEIGHT, 0);
  scene.add(warm, warm.target);

  const fill = new THREE.DirectionalLight(0x6f9fca, 0.55);
  fill.position.set(-4, 3, 6);
  scene.add(fill);
}

function buildRoom() {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 24),
    new THREE.MeshStandardMaterial({ color: 0x071019, roughness: 0.9, metalness: 0.04 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const mat = new THREE.Mesh(
    new THREE.PlaneGeometry(5.6, 9.2),
    new THREE.MeshStandardMaterial({ color: 0x081827, roughness: 0.88, metalness: 0.06 }),
  );
  mat.rotation.x = -Math.PI / 2;
  mat.position.y = 0.008;
  mat.receiveShadow = true;
  scene.add(mat);

  const lineMaterial = new THREE.MeshBasicMaterial({
    color: 0x1a8cab,
    transparent: true,
    opacity: 0.34,
  });
  for (const x of [-2.55, 2.55]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.018, 8.6), lineMaterial);
    line.rotation.x = -Math.PI / 2;
    line.position.set(x, 0.011, 0);
    scene.add(line);
  }

  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x0a1625,
    roughness: 0.92,
    metalness: 0.03,
  });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(18, 7), wallMaterial);
  back.position.set(0, 3.5, -7.8);
  scene.add(back);

  const sideLeft = new THREE.Mesh(new THREE.PlaneGeometry(15, 7), wallMaterial);
  sideLeft.position.set(-8, 3.5, 0);
  sideLeft.rotation.y = Math.PI / 2;
  scene.add(sideLeft);

  const sideRight = sideLeft.clone();
  sideRight.position.x = 8;
  sideRight.rotation.y = -Math.PI / 2;
  scene.add(sideRight);

  const stripMaterial = new THREE.MeshBasicMaterial({
    color: 0x41cce8,
    transparent: true,
    opacity: 0.5,
  });
  for (const x of [-5.5, -1.8, 1.8, 5.5]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.035, 9.4), stripMaterial);
    strip.position.set(x, 0.02, 0);
    scene.add(strip);
  }

  const upper = new THREE.Mesh(new THREE.BoxGeometry(15, 0.025, 0.025), stripMaterial);
  upper.position.set(0, 5.3, -7.76);
  scene.add(upper);

  const panelMaterial = new THREE.MeshStandardMaterial({
    color: 0x0e1d2f,
    roughness: 0.82,
    metalness: 0.15,
  });
  for (let i = -4; i <= 4; i += 1) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.028, 4.8, 0.6), panelMaterial);
    panel.position.set(i * 1.9, 2.5, -7.77);
    scene.add(panel);
  }

  const grid = new THREE.GridHelper(16, 32, 0x1a4356, 0x0a1b27);
  grid.position.y = 0.014;
  grid.material.transparent = true;
  grid.material.opacity = 0.2;
  scene.add(grid);
}

function buildTable() {
  const group = new THREE.Group();
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(TABLE.WIDTH, TABLE.THICKNESS, TABLE.LENGTH),
    new THREE.MeshStandardMaterial({ color: 0x0b5a8c, roughness: 0.3, metalness: 0.08 }),
  );
  top.position.y = TABLE.HEIGHT - TABLE.THICKNESS / 2;
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);

  const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xf3f9ff });
  const addLine = (width, depth, x, z) => {
    const line = new THREE.Mesh(new THREE.BoxGeometry(width, 0.004, depth), lineMaterial);
    line.position.set(x, TABLE.HEIGHT + 0.002, z);
    group.add(line);
  };
  addLine(0.025, TABLE.LENGTH, -TABLE.HALF_WIDTH + 0.0125, 0);
  addLine(0.025, TABLE.LENGTH, TABLE.HALF_WIDTH - 0.0125, 0);
  addLine(TABLE.WIDTH, 0.025, 0, -TABLE.HALF_LENGTH + 0.0125);
  addLine(TABLE.WIDTH, 0.025, 0, TABLE.HALF_LENGTH - 0.0125);
  addLine(0.008, TABLE.LENGTH - 0.05, 0, 0);

  const net = new THREE.Mesh(
    new THREE.PlaneGeometry(TABLE.WIDTH + 0.3, TABLE.NET_HEIGHT),
    new THREE.MeshBasicMaterial({
      map: createNetTexture(),
      transparent: true,
      opacity: 0.62,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  net.position.set(0, TABLE.HEIGHT + TABLE.NET_HEIGHT / 2, 0);
  group.add(net);

  const tape = new THREE.Mesh(
    new THREE.BoxGeometry(TABLE.WIDTH + 0.31, 0.016, 0.014),
    new THREE.MeshStandardMaterial({ color: 0xe9f7ff, roughness: 0.5 }),
  );
  tape.position.set(0, TABLE.HEIGHT + TABLE.NET_HEIGHT, 0);
  group.add(tape);

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
    group.add(post);
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
      group.add(leg);
    }
  }
  for (const z of [-0.92, 0.92]) {
    const brace = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.045, 0.045), legMaterial);
    brace.position.set(0, 0.22, z);
    group.add(brace);
  }

  scene.add(group);
}

function buildLauncher() {
  const pedestalMaterial = new THREE.MeshStandardMaterial({
    color: 0x142234,
    roughness: 0.4,
    metalness: 0.65,
  });
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.18, 0.5, 20),
    pedestalMaterial,
  );
  pedestal.position.set(0, 0.25, 1.78);
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  scene.add(pedestal);

  const top = new THREE.Mesh(
    new THREE.TorusGeometry(0.12, 0.012, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0x61e7ff, transparent: true, opacity: 0.6 }),
  );
  top.rotation.x = Math.PI / 2;
  top.position.set(0, 0.51, 1.78);
  scene.add(top);

  const originRing = new THREE.Mesh(
    new THREE.RingGeometry(0.055, 0.07, 32),
    new THREE.MeshBasicMaterial({
      color: 0x61e7ff,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthTest: false,
    }),
  );
  originRing.rotation.x = -Math.PI / 2;
  originRing.position.set(LAB_ORIGIN.x, TABLE.HEIGHT + 0.008, LAB_ORIGIN.z);
  originRing.renderOrder = 4;
  scene.add(originRing);
}

function createGlowTextureOnce() {
  return createGlowTexture();
}

const glowTexture = createGlowTextureOnce();

function createLabelTexture(text, color) {
  const canvas2d = document.createElement('canvas');
  canvas2d.width = 320;
  canvas2d.height = 96;
  const ctx = canvas2d.getContext('2d');
  ctx.clearRect(0, 0, 320, 96);
  ctx.fillStyle = 'rgba(4, 10, 18, 0.82)';
  ctx.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
  ctx.lineWidth = 3;
  const radius = 18;
  ctx.beginPath();
  ctx.roundRect(6, 12, 308, 72, radius);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  ctx.font = '800 38px "Microsoft YaHei", "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 160, 49);
  const texture = new THREE.CanvasTexture(canvas2d);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function disposeVisual(visual) {
  for (const object of [
    visual.line,
    visual.points,
    visual.ball,
    visual.glow,
    visual.landing,
    visual.label,
  ]) {
    scene.remove(object);
  }
  visual.line.geometry.dispose();
  visual.line.material.dispose();
  visual.points.material.dispose();
  visual.ball.geometry.dispose();
  visual.ball.material.dispose();
  visual.glow.material.dispose();
  visual.landing.geometry.dispose();
  visual.landing.material.dispose();
  visual.label.material.map.dispose();
  visual.label.material.dispose();
}

function createVisual(shot) {
  const positions = new Float32Array(shot.points.length * 3);
  shot.points.forEach((point, index) => {
    positions[index * 3] = point.position.x;
    positions[index * 3 + 1] = point.position.y;
    positions[index * 3 + 2] = point.position.z;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const isReference = shot.key === 'reference';
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({
      color: shot.color,
      transparent: true,
      opacity: isReference ? 0.28 : 1,
      depthWrite: false,
    }),
  );
  line.frustumCulled = false;
  line.renderOrder = 3;
  line.visible = false;
  scene.add(line);

  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: shot.color,
      size: isReference ? 0.008 : 0.028,
      sizeAttenuation: true,
      transparent: true,
      opacity: isReference ? 0.12 : 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  points.frustumCulled = false;
  points.renderOrder = 3;
  points.visible = false;
  scene.add(points);

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL.RADIUS * 1.12, 20, 14),
    new THREE.MeshStandardMaterial({
      color: isReference ? 0x71879a : shot.color,
      emissive: isReference ? 0x2d3d4d : shot.color,
      emissiveIntensity: isReference ? 0.08 : 0.45,
      roughness: 0.32,
      metalness: 0.04,
    }),
  );
  ball.castShadow = true;
  ball.visible = false;
  scene.add(ball);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color: shot.color,
      transparent: true,
      opacity: isReference ? 0.12 : 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  glow.scale.setScalar(0.11);
  glow.visible = false;
  scene.add(glow);

  const landing = new THREE.Mesh(
    new THREE.RingGeometry(0.06, 0.078, 32),
    new THREE.MeshBasicMaterial({
      color: shot.color,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthTest: false,
    }),
  );
  landing.rotation.x = -Math.PI / 2;
  landing.position.y = TABLE.HEIGHT + 0.008;
  landing.visible = false;
  landing.renderOrder = 5;
  scene.add(landing);

  const label = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createLabelTexture(isReference ? '无旋' : shot.label, shot.color),
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }),
  );
  label.scale.set(0.2, 0.06, 1);
  label.renderOrder = 8;
  label.visible = false;
  scene.add(label);

  const labelIndex = isReference
    ? 0
    : Object.keys(SPIN_PRESETS).indexOf(shot.key) + 1;

  return {
    shot,
    line,
    points,
    ball,
    glow,
    landing,
    label,
    labelLift: 0.24 + labelIndex * 0.035,
  };
}

function rebuildVisuals() {
  for (const visual of state.visuals.values()) disposeVisual(visual);
  state.visuals.clear();
  state.shotSet = buildShotSet(state.strength);
  for (const shot of state.shotSet.all) {
    state.visuals.set(shot.key, createVisual(shot));
  }
}

function getShot(key) {
  return state.visuals.get(key)?.shot;
}

function activeKeys() {
  const keys = state.mode === 'compare' ? Object.keys(SPIN_PRESETS) : [state.selected];
  if (state.showReference) keys.unshift('reference');
  return keys;
}

function setCardState() {
  ui.spinCards.forEach((card) => {
    card.classList.toggle('active', state.mode === 'single' && card.dataset.spin === state.selected);
  });
  ui.compare.classList.toggle('active', state.mode === 'compare');
}

function clearVisuals() {
  state.playing = false;
  state.playTime = 0;
  for (const visual of state.visuals.values()) {
    visual.line.visible = false;
    visual.line.geometry.setDrawRange(0, 0);
    visual.points.visible = false;
    visual.points.geometry.setDrawRange(0, 0);
    visual.ball.visible = false;
    visual.glow.visible = false;
    visual.landing.visible = false;
    visual.label.visible = false;
  }
}

function launch(force = false) {
  if (!state.shotSet) return;
  state.freeze = false;
  state.hasLaunched = true;
  state.playing = true;
  state.playTime = 0;
  state.autoCooldown = 0;
  setCardState();
  updateReadout();

  for (const visual of state.visuals.values()) {
    const active = activeKeys().includes(visual.shot.key);
    visual.line.visible = active;
    visual.line.geometry.setDrawRange(0, 0);
    visual.points.visible = active;
    visual.points.geometry.setDrawRange(0, 0);
    visual.ball.visible = active;
    visual.glow.visible = active;
    visual.landing.visible = false;
    visual.label.visible = false;
    if (active) {
      const start = visual.shot.points[0]?.position ?? LAB_ORIGIN;
      visual.ball.position.copy(start);
      visual.glow.position.copy(start);
    }
  }
  if (!force) {
    ui.kicker.textContent = state.mode === 'compare' ? '四种旋转同时发射' : getSpinLabel(state.selected);
  }
}

function showFrozen(mode = state.mode) {
  state.mode = mode;
  state.freeze = true;
  state.playing = false;
  state.hasLaunched = true;
  setCardState();
  updateReadout();

  for (const visual of state.visuals.values()) {
    const active = activeKeys().includes(visual.shot.key);
    visual.line.visible = active;
    visual.line.geometry.setDrawRange(0, active ? visual.shot.points.length : 0);
    visual.points.visible = active;
    visual.points.geometry.setDrawRange(0, active ? visual.shot.points.length : 0);
    visual.landing.visible = active && Boolean(visual.shot.bounce);
    visual.landing.scale.setScalar(1);
    if (active && visual.shot.bounce) {
      visual.landing.position.set(
        visual.shot.bounce.x,
        TABLE.HEIGHT + 0.008,
        visual.shot.bounce.z,
      );
      const at = visual.shot.bounce.time;
      const pos = sampleTrace(visual.shot, at);
      visual.ball.position.copy(pos);
      visual.glow.position.copy(pos);
      visual.ball.visible = true;
      visual.glow.visible = true;
      visual.label.position.set(
        visual.shot.bounce.x,
        TABLE.HEIGHT + visual.labelLift,
        visual.shot.bounce.z,
      );
      visual.label.visible = state.mode === 'single';
    } else {
      visual.ball.visible = false;
      visual.glow.visible = false;
      visual.label.visible = false;
    }
  }
}

function clear() {
  clearVisuals();
  state.hasLaunched = false;
  state.freeze = false;
  state.playing = false;
  ui.kicker.textContent = '等待发球';
  ui.badge.textContent = 'READY';
  ui.badge.style.color = '';
  ui.badge.style.borderColor = '';
  ui.desc.textContent = '选择一种旋转，然后点击发球。灰色轨迹是没有旋转的参考弹道。';
  ui.spin.textContent = '0 rad/s';
  ui.height.textContent = '—';
  ui.deviation.textContent = '—';
  ui.time.textContent = '—';
  ui.compareSummary.classList.add('hidden');
  ui.compareSummary.innerHTML = '';
}

function updateReadout() {
  if (!state.shotSet) return;
  if (state.mode === 'compare') {
    ui.kicker.textContent = '四种旋转对比';
    ui.badge.textContent = 'COMPARE';
    ui.badge.style.color = '#61e7ff';
    ui.badge.style.borderColor = 'rgba(97,231,255,.3)';
    ui.desc.textContent = '同一初速、同一出手点。颜色越偏离灰色参考线，说明这种旋转越强。';
    ui.spin.textContent = `${Math.round(state.strength * 100)}%`;
    ui.height.textContent = '4 条轨迹';
    ui.deviation.textContent = '看颜色';
    ui.time.textContent = '同步';
    const reference = getShot('reference');
    const rows = Object.values(SPIN_PRESETS)
      .map((preset) => {
        const shot = getShot(preset.key);
        if (!shot) return '';
        const dev = deviationFromReference(shot, reference);
        const color = `#${preset.color.toString(16).padStart(6, '0')}`;
        const value = shot.landing
          ? `x ${dev ? formatSigned(dev.x) : '—'} · z ${shot.landing.z.toFixed(2)}`
          : '未上台';
        return `<div class="compare-row" style="--dot:${color}"><i></i><b>${preset.label}</b><span>${value}</span></div>`;
      })
      .join('');
    ui.compareSummary.innerHTML = rows;
    ui.compareSummary.classList.remove('hidden');
    return;
  }

  ui.compareSummary.classList.add('hidden');
  ui.compareSummary.innerHTML = '';

  const shot = getShot(state.selected);
  if (!shot) return;
  const reference = getShot('reference');
  const deviation = deviationFromReference(shot, reference);
  ui.kicker.textContent = shot.label;
  ui.badge.textContent = shot.short;
  ui.badge.style.color = `#${shot.color.toString(16).padStart(6, '0')}`;
  ui.badge.style.borderColor = `rgba(${(shot.color >> 16) & 255},${(shot.color >> 8) & 255},${shot.color & 255},.28)`;
  ui.desc.textContent = getSpinDescription(state.selected);
  ui.spin.textContent = `${Math.round(shot.spin.length())} rad/s`;
  ui.height.textContent = `${shot.maxHeight.toFixed(2)} m`;
  if (deviation) {
    const x = `${deviation.x >= 0 ? '+' : ''}${deviation.x.toFixed(2)}`;
    const z = `${deviation.z >= 0 ? '+' : ''}${deviation.z.toFixed(2)}`;
    ui.deviation.textContent = `${x} / ${z}`;
  } else {
    ui.deviation.textContent = '未上台';
  }
  ui.time.textContent = shot.bounce ? `${shot.bounce.time.toFixed(2)} s` : '—';
}

function updateAnimation(dt) {
  if (!state.playing) {
    if (state.autoReplay && state.autoCooldown > 0) {
      state.autoCooldown -= dt;
      if (state.autoCooldown <= 0) launch();
    }
    return;
  }

  state.playTime += dt * state.speed;
  let maxDuration = 0;
  const keys = activeKeys();

  for (const key of keys) {
    const visual = state.visuals.get(key);
    if (!visual) continue;
    const shot = visual.shot;
    maxDuration = Math.max(maxDuration, shot.points[shot.points.length - 1]?.time ?? 0);

    const position = sampleTrace(shot, state.playTime);
    const count = traceProgress(shot, state.playTime);
    visual.line.geometry.setDrawRange(0, count);
    visual.line.visible = true;
    visual.points.geometry.setDrawRange(0, count);
    visual.points.visible = true;

    if (position) {
      visual.ball.position.copy(position);
      visual.glow.position.copy(position);
    }
    const finished = state.playTime > shot.duration + 0.12;
    visual.ball.visible = !finished;
    visual.glow.visible = !finished && state.playTime < shot.duration;

    if (shot.bounce && state.playTime >= shot.bounce.time) {
      visual.landing.visible = true;
      visual.landing.position.set(shot.bounce.x, TABLE.HEIGHT + 0.008, shot.bounce.z);
      const age = Math.max(0, state.playTime - shot.bounce.time);
      const pulse = 1 + Math.sin(age * 12) * 0.08 + Math.min(0.4, age * 0.35);
      visual.landing.scale.setScalar(pulse);
      visual.landing.material.opacity = Math.max(0.1, 0.85 - age * 0.22);
      visual.label.visible = state.mode === 'single';
      visual.label.position.set(
        shot.bounce.x,
        TABLE.HEIGHT + visual.labelLift,
        shot.bounce.z,
      );
    }
  }

  if (state.playTime > maxDuration + 0.9) {
    state.playing = false;
    if (state.autoReplay) state.autoCooldown = 1.2;
  }
}

function updateReferenceVisibility() {
  const visual = state.visuals.get('reference');
  if (!visual) return;
  const show = state.showReference && (state.hasLaunched || state.freeze);
  visual.line.visible = show;
  visual.points.visible = show;
  if (show) {
    if (state.freeze || !state.playing) {
      visual.line.geometry.setDrawRange(0, visual.shot.points.length);
      visual.points.geometry.setDrawRange(0, visual.shot.points.length);
    }
    if (state.freeze && visual.shot.bounce) {
      const pos = sampleTrace(visual.shot, visual.shot.bounce.time);
      visual.ball.position.copy(pos);
      visual.glow.position.copy(pos);
      visual.ball.visible = true;
      visual.glow.visible = true;
      visual.landing.visible = true;
      visual.landing.position.set(visual.shot.bounce.x, TABLE.HEIGHT + 0.008, visual.shot.bounce.z);
      visual.label.visible = state.mode === 'single';
      visual.label.position.set(
        visual.shot.bounce.x,
        TABLE.HEIGHT + visual.labelLift,
        visual.shot.bounce.z,
      );
    }
  } else {
    visual.points.visible = false;
    visual.ball.visible = false;
    visual.glow.visible = false;
    visual.landing.visible = false;
    visual.label.visible = false;
  }
}

function refreshStrength() {
  const wasLaunched = state.hasLaunched;
  state.strength = Number(ui.strength.value);
  ui.strengthValue.textContent = `${Math.round(state.strength * 100)}%`;
  rebuildVisuals();
  if (state.freeze) {
    showFrozen(state.mode);
  } else if (wasLaunched) {
    launch(true);
  } else {
    clear();
  }
}

function refreshSpeed() {
  state.speed = Number(ui.speed.value);
  ui.speedValue.textContent = `${state.speed.toFixed(2)}×`;
}

function initializeControls() {
  ui.spinCards.forEach((card) => {
    card.addEventListener('click', () => {
      state.mode = 'single';
      state.selected = card.dataset.spin;
      launch();
    });
  });

  ui.launch.addEventListener('click', () => launch());
  ui.compare.addEventListener('click', () => {
    state.mode = 'compare';
    launch();
  });
  ui.clear.addEventListener('click', clear);

  ui.strength.value = String(state.strength);
  ui.strengthValue.textContent = `${Math.round(state.strength * 100)}%`;
  ui.strength.addEventListener('input', () => {
    ui.strengthValue.textContent = `${Math.round(Number(ui.strength.value) * 100)}%`;
  });
  ui.strength.addEventListener('change', refreshStrength);

  ui.speed.value = String(state.speed);
  ui.speedValue.textContent = `${state.speed.toFixed(2)}×`;
  ui.speed.addEventListener('input', refreshSpeed);

  ui.reference.checked = state.showReference;
  ui.reference.addEventListener('change', () => {
    state.showReference = ui.reference.checked;
    updateReferenceVisibility();
  });

  ui.auto.addEventListener('change', () => {
    state.autoReplay = ui.auto.checked;
    if (state.autoReplay && !state.playing && state.hasLaunched) {
      state.autoCooldown = 0.8;
    }
  });
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
}

function animate() {
  const dt = Math.min(0.05, clock.getDelta());
  controls.update();
  updateAnimation(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

buildLights();
buildRoom();
buildTable();
buildLauncher();
rebuildVisuals();
initializeControls();
setCardState();
const initialFreeze = state.freeze;
clear();
state.freeze = initialFreeze;

if (state.freeze) {
  showFrozen(state.mode);
} else {
  window.setTimeout(() => launch(), 420);
}

window.addEventListener('resize', onResize);
animate();

window.__spinLab = {
  launch,
  compare: () => {
    state.mode = 'compare';
    launch();
  },
  clear,
  freeze: showFrozen,
  setStrength: (value) => {
    ui.strength.value = String(value);
    refreshStrength();
  },
  state: () => ({
    mode: state.mode,
    selected: state.selected,
    playing: state.playing,
    freeze: state.freeze,
    strength: state.strength,
    speed: state.speed,
  }),
  debug: () => ({
    state: {
      mode: state.mode,
      selected: state.selected,
      playing: state.playing,
      freeze: state.freeze,
      hasLaunched: state.hasLaunched,
    },
    visuals: [...state.visuals.entries()].map(([key, visual]) => ({
      key,
      lineVisible: visual.line.visible,
      drawCount: visual.line.geometry.drawRange.count,
      pointsVisible: visual.points.visible,
      points: visual.shot.points.length,
      lineColor: visual.line.material.color.getHexString(),
      ballVisible: visual.ball.visible,
      ball: visual.ball.position.toArray(),
      landingVisible: visual.landing.visible,
      bounce: visual.shot.bounce,
    })),
  }),
};

