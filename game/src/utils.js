// Shared math and list helpers for Velvet Bay. Every system imports these;
// nothing here touches the scene or the game state.

export const TAU = Math.PI * 2;

/** Clamp a value into [min, max]. */
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/** Linear interpolation between a and b. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** A random number in [min, max). */
export function rand(min, max) {
  return min + Math.random() * (max - min);
}

/** A random integer in [min, max]. */
export function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

/** One random element of an array. */
export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Shortest signed angular difference from a to b, in (-PI, PI]. */
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

/** Move angle a toward b by at most step radians, taking the short way. */
export function angleToward(a, b, step) {
  const d = angleDiff(a, b);
  if (Math.abs(d) <= step) return b;
  return a + Math.sign(d) * step;
}

/** Distance between two points on the ground plane. */
export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

/** True when a circle (x, z, r) overlaps an axis-aligned box on the ground. */
export function circleHitsBox(x, z, r, box) {
  const cx = clamp(x, box.minX, box.maxX);
  const cz = clamp(z, box.minZ, box.maxZ);
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < r * r;
}

/**
 * Push a circle out of an axis-aligned box. Returns true when it overlapped.
 * Mutates the given position object ({x, z}) to the closest free spot.
 */
export function pushCircleOutOfBox(p, r, box) {
  const cx = clamp(p.x, box.minX, box.maxX);
  const cz = clamp(p.z, box.minZ, box.maxZ);
  let dx = p.x - cx;
  let dz = p.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    const push = (r - d) / d;
    p.x += dx * push;
    p.z += dz * push;
  } else {
    // Center is inside the box: push out along the smallest penetration axis.
    const left = p.x - box.minX;
    const right = box.maxX - p.x;
    const back = p.z - box.minZ;
    const front = box.maxZ - p.z;
    const m = Math.min(left, right, back, front);
    if (m === left) p.x = box.minX - r;
    else if (m === right) p.x = box.maxX + r;
    else if (m === back) p.z = box.minZ - r;
    else p.z = box.maxZ + r;
  }
  return true;
}

/** Format a number of dollars as $1,234. */
export function money(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

/** Format seconds as M:SS. */
export function clockText(sec) {
  const s = Math.max(0, Math.floor(sec));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
