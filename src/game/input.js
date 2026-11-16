import { clamp } from './utils.js';

export class InputManager {
  constructor(canvas, handlers = {}) {
    this.canvas = canvas;
    this.handlers = handlers;
    this.enabled = false;
    this.mouse = {
      x: 0,
      y: 0,
      nx: 0,
      ny: 0,
      lastMove: 0,
    };
    this.velocity = { x: 0, y: 0 };
    this.down = false;
    this.downTime = 0;
    this.lastDownAt = 0;
    this._bind();
    this.setMouse(window.innerWidth / 2, window.innerHeight / 2);
  }

  _bind() {
    window.addEventListener('mousemove', (event) => this.onMouseMove(event), { passive: true });
    this.canvas.addEventListener('mousedown', (event) => this.onMouseDown(event));
    window.addEventListener('mouseup', (event) => this.onMouseUp(event));
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    window.addEventListener('blur', () => {
      if (this.down) {
        this.down = false;
        this.handlers.onUp?.({ releasedOutside: true });
      }
    });
  }

  onMouseMove(event) {
    const now = performance.now();
    const dt = Math.min(0.08, Math.max(0.008, (now - (this.mouse.lastMove || now)) / 1000));
    const previousNx = this.mouse.nx;
    const previousNy = this.mouse.ny;
    this.setMouse(event.clientX, event.clientY);

    const dx = this.mouse.nx - previousNx;
    const dy = this.mouse.ny - previousNy;
    const targetVx = dx / dt;
    const targetVy = dy / dt;
    const smoothing = 1 - Math.exp(-14 * dt);
    this.velocity.x += (targetVx - this.velocity.x) * smoothing;
    this.velocity.y += (targetVy - this.velocity.y) * smoothing;
    this.mouse.lastMove = now;

    this.handlers.onMove?.({ ...this.mouse, velocity: { ...this.velocity } });
  }

  setMouse(clientX, clientY) {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    this.mouse.x = clamp(clientX, 0, width);
    this.mouse.y = clamp(clientY, 0, height);
    this.mouse.nx = (this.mouse.x / width) * 2 - 1;
    this.mouse.ny = 1 - (this.mouse.y / height) * 2;
  }

  onMouseDown(event) {
    if (event.button !== 0) return;
    if (!this.enabled) return;
    event.preventDefault();
    this.down = true;
    this.downTime = 0;
    this.lastDownAt = performance.now();
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.handlers.onDown?.({ ...this.mouse });
  }

  onMouseUp(event) {
    if (event.button !== 0) return;
    if (!this.down) return;
    this.down = false;
    this.handlers.onUp?.({ ...this.mouse, holdTime: this.downTime });
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled && this.down) {
      this.down = false;
      this.handlers.onUp?.({ cancelled: true });
    }
    document.body.classList.toggle('playing', enabled);
  }

  update(dt) {
    this.mouse.lastMove = this.mouse.lastMove || performance.now();
    if (this.down) this.downTime += dt;
    const decay = Math.exp(-8 * dt);
    this.velocity.x *= decay;
    this.velocity.y *= decay;
  }

  setVirtualPosition(nx, ny) {
    this.setMouse(
      ((clamp(nx, -1, 1) + 1) / 2) * window.innerWidth,
      ((1 - clamp(ny, -1, 1)) / 2) * window.innerHeight,
    );
  }
}
