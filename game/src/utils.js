// Small math and random helpers shared by every Velvet Bay system.
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
export function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
export function dist(ax, az, bx, bz) { return Math.sqrt(dist2(ax, az, bx, bz)); }
export function angleTo(ax, az, bx, bz) { return Math.atan2(bx - ax, bz - az); }
// Deterministic mulberry32 so the city layout is identical on every load.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
export function randRange(rng, lo, hi) { return lo + rng() * (hi - lo); }
// Circle vs axis-aligned box push-out. Returns true when a push happened.
export function resolveCircleBox(px, pz, r, box, out) {
  const cx = clamp(px, box.minX, box.maxX), cz = clamp(pz, box.minZ, box.maxZ);
  const dx = px - cx, dz = pz - cz, d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2), push = (r - d) / d;
    out.x = px + dx * push; out.z = pz + dz * push;
  } else {
    // Center inside the box: push out along the smallest penetration axis.
    const pl = px - box.minX, pr = box.maxX - px, pt = pz - box.minZ, pb = box.maxZ - pz;
    const m = Math.min(pl, pr, pt, pb);
    if (m === pl) { out.x = box.minX - r; out.z = pz; }
    else if (m === pr) { out.x = box.maxX + r; out.z = pz; }
    else if (m === pt) { out.x = px; out.z = box.minZ - r; }
    else { out.x = px; out.z = box.maxZ + r; }
  }
  return true;
}
