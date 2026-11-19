// Keyboard and mouse state for Velvet Bay. The game reads this each frame;
// pointer lock is requested inside the click handler itself, since the
// browser only allows it during a user gesture.

/** Keys the game cares about (page scrolling and shortcuts stay off). */
const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'ShiftLeft', 'ShiftRight',
  'KeyE', 'KeyR', 'KeyF', 'KeyP', 'KeyM', 'Enter', 'Escape',
]);

export function createInput(canvas) {
  const input = {
    keys: new Set(),
    mouseDX: 0,
    mouseDY: 0,
    mouseDown: false,
    clicked: false,
    pointerLocked: false,
    /** Main loop sets this true while the game is being played. */
    lockEnabled: false,
  };

  window.addEventListener('keydown', (e) => {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (!e.repeat) input.keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => {
    input.keys.delete(e.code);
  });
  window.addEventListener('blur', () => {
    input.keys.clear();
    input.mouseDown = false;
  });

  document.addEventListener('pointerlockchange', () => {
    input.pointerLocked = document.pointerLockElement === canvas;
  });

  document.addEventListener('mousemove', (e) => {
    if (!input.pointerLocked) return;
    input.mouseDX += e.movementX || 0;
    input.mouseDY += e.movementY || 0;
  });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    // A click while unlocked locks the pointer instead of shooting.
    if (input.lockEnabled && !input.pointerLocked) {
      canvas.requestPointerLock();
      return;
    }
    input.mouseDown = true;
    input.clicked = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.mouseDown = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  /** True while the given key code is held. */
  input.isDown = (code) => input.keys.has(code);

  /** Take this frame's mouse movement and reset the accumulators. */
  input.consumeMouse = () => {
    const dx = input.mouseDX;
    const dy = input.mouseDY;
    input.mouseDX = 0;
    input.mouseDY = 0;
    return { dx, dy };
  };

  /** True when the left button was pressed since the last call. */
  input.consumeClick = () => {
    const c = input.clicked;
    input.clicked = false;
    return c;
  };

  input.requestLock = () => {
    if (!input.pointerLocked) canvas.requestPointerLock();
  };

  input.exitLock = () => {
    if (document.pointerLockElement) document.exitPointerLock();
  };

  return input;
}
