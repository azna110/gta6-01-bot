// Keyboard + mouse input with pointer lock for the third-person camera.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouseDX = 0; this.mouseDY = 0;
    this.mouseDown = false; this.mouseClicked = false;
    this.locked = false;
    this.pressed = new Set(); // keys pressed since last poll
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouseDown = true; this.mouseClicked = true; }
    });
    document.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseDown = false; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    canvas.addEventListener('click', () => {
      if (!this.locked && document.pointerLockElement !== canvas) {
        canvas.requestPointerLock();
      }
    });
  }
  down(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  axis(neg, pos) { return (this.keys.has(pos) ? 1 : 0) - (this.keys.has(neg) ? 1 : 0); }
  consumeMouse() { const r = { dx: this.mouseDX, dy: this.mouseDY }; this.mouseDX = 0; this.mouseDY = 0; return r; }
  consumeClick() { const c = this.mouseClicked; this.mouseClicked = false; return c; }
  endFrame() { this.pressed.clear(); }
  lock() {
    const c = document.querySelector('#app canvas');
    if (c && document.pointerLockElement !== c) {
      try {
        const p = c.requestPointerLock();
        if (p && p.catch) p.catch(() => { /* headless or no gesture: look stays free */ });
      } catch { /* pointer lock unavailable */ }
    }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
}
