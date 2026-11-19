// Combat: the pistol, the punch, and the rival shooters who guard the drop.
// Shots are raycast from the camera; buildings block them.

import { angleToward, dist2D, pushCircleOutOfBox, rand } from './utils.js';
import { scarePedestrians } from './pedestrians.js';

const MAG = 12;
const RELOAD_TIME = 1.2;
const FIRE_INTERVAL = 0.22;
const RIVAL_SHOT_DAMAGE = 6;

export function createCombat(G) {
  const c = {
    ammo: MAG,
    reloading: false,
    reloadTimer: 0,
    fireCooldown: 0,
    rivals: [],
    prevR: false,
    prevF: false,
  };
  // Called as methods on this object (G.combat.spawnRivals(G, ...)).
  c.spawnRivals = spawnRivals;
  c.damagePlayer = damagePlayer;
  return c;
}

/** Build one rival shooter: dark clothes and a red headband. */
function buildRivalMesh() {
  const g = new THREE.Group();
  const legMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.55, 0.26), legMat);
  legL.position.set(-0.17, 0.28, 0);
  legL.name = 'legL';
  g.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.55, 0.26), legMat);
  legR.position.set(0.17, 0.28, 0);
  legR.name = 'legR';
  g.add(legR);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.72, 0.38), new THREE.MeshLambertMaterial({ color: 0x2a2a2a }));
  torso.position.y = 0.92;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), new THREE.MeshLambertMaterial({ color: 0xc98a5a }));
  head.position.y = 1.48;
  g.add(head);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.09, 12), new THREE.MeshLambertMaterial({ color: 0xcc0000 }));
  band.position.y = 1.62;
  g.add(band);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.55), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  gun.position.set(0.4, 1.05, 0.3);
  g.add(gun);
  return g;
}

/** Spawn rival shooters around a point. */
export function spawnRivals(G, x, z, count) {
  for (let i = 0; i < count; i++) {
    const mesh = buildRivalMesh();
    const a = (i / count) * Math.PI * 2 + rand(-0.4, 0.4);
    mesh.position.set(x + Math.sin(a) * rand(5, 9), 0, z + Math.cos(a) * rand(5, 9));
    G.scene.add(mesh);
    G.combat.rivals.push({
      mesh,
      health: 100,
      shootTimer: rand(0.6, 1.6),
      strafeDir: Math.random() < 0.5 ? -1 : 1,
      strafeTimer: rand(1, 2),
      phase: rand(0, 6),
      state: 'fight',
      downTimer: 0,
    });
  }
}

/** Hurt the player; wasted when health reaches zero. */
export function damagePlayer(G, amount) {
  const p = G.player;
  if (p.health <= 0) return;
  p.health -= amount;
  p.lastHurt = G.time;
  G.hud.damageFlash(G);
  if (p.health <= 0) {
    p.health = 0;
    G.save.triggerWasted(G);
  }
}

/** A ray against one building box (top at 200). Returns distance or Infinity. */
function rayBox(ox, oy, oz, dx, dy, dz, box) {
  let tmin = 0;
  let tmax = 400;
  const mins = [box.minX, 0, box.minZ];
  const maxs = [box.maxX, 200, box.maxZ];
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mins[i] || o[i] > maxs[i]) return Infinity;
    } else {
      let t1 = (mins[i] - o[i]) / d[i];
      let t2 = (maxs[i] - o[i]) / d[i];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

/** True when the ground segment from (x1,z1) to (x2,z2) crosses a building. */
function segmentBlocked(G, x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  for (const box of G.city.colliders) {
    let tmin = 0;
    let tmax = 1;
    let hit = true;
    const o = [x1, z1];
    const d = [dx, dz];
    const mins = [box.minX, box.minZ];
    const maxs = [box.maxX, box.maxZ];
    for (let i = 0; i < 2; i++) {
      if (Math.abs(d[i]) < 1e-9) {
        if (o[i] < mins[i] || o[i] > maxs[i]) { hit = false; break; }
      } else {
        let t1 = (mins[i] - o[i]) / d[i];
        let t2 = (maxs[i] - o[i]) / d[i];
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) { hit = false; break; }
      }
    }
    if (hit) return true;
  }
  return false;
}

/** Fire one pistol round from the camera through the crosshair. */
function fireShot(G) {
  const c = G.combat;
  c.ammo -= 1;
  c.fireCooldown = FIRE_INTERVAL;
  G.audio.shot();
  const cam = G.camera;
  const dir = new THREE.Vector3();
  cam.getWorldDirection(dir);
  const origin = cam.position.clone();
  // Muzzle is just below and right of the camera.
  const right = new THREE.Vector3().crossVectors(dir, cam.up).normalize();
  const muzzle = origin.clone().addScaledVector(dir, 0.6).addScaledVector(right, 0.25).add(new THREE.Vector3(0, -0.18, 0));
  // Nearest building hit along the ray.
  let wallDist = Infinity;
  for (const box of G.city.colliders) {
    wallDist = Math.min(wallDist, rayBox(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, box));
  }
  // Nearest target hit, via the raycaster over the figures in play.
  const targets = [];
  const byMesh = new Map();
  for (const r of c.rivals) {
    if (r.state !== 'fight') continue;
    targets.push(r.mesh);
    byMesh.set(r.mesh, { kind: 'rival', ref: r });
  }
  for (const ped of G.pedestrians) {
    if (ped.state === 'down') continue;
    targets.push(ped.mesh);
    byMesh.set(ped.mesh, { kind: 'ped', ref: ped });
  }
  for (const cr of G.police.cruisers) {
    targets.push(cr.mesh);
    byMesh.set(cr.mesh, { kind: 'cruiser', ref: cr });
  }
  const ray = new THREE.Raycaster(origin, dir, 0, 200);
  const hits = ray.intersectObjects(targets, true);
  let hitPoint = null;
  let hitDist = Math.min(wallDist, 120);
  if (hits.length > 0) {
    const h = hits[0];
    if (h.distance < wallDist) {
      // Walk up to the figure group to learn what was hit.
      let node = h.object;
      while (node.parent && node.parent !== G.scene) node = node.parent;
      const ent = byMesh.get(node);
      if (ent) {
        hitPoint = h.point.clone();
        hitDist = h.distance;
        if (ent.kind === 'rival') {
          const r = ent.ref;
          r.health -= 34;
          G.effects.blood(G, h.point.x, h.point.y, h.point.z);
          if (r.health <= 0) {
            r.state = 'down';
            r.downTimer = 9999;
            r.mesh.rotation.x = -Math.PI / 2;
            r.mesh.position.y = 0.35;
          }
        } else if (ent.kind === 'ped') {
          const ped = ent.ref;
          ped.state = 'down';
          ped.downTimer = 7;
          ped.mesh.rotation.x = -Math.PI / 2;
          ped.mesh.position.y = 0.35;
          G.police.addHeat(G, 1);
          G.hud.showBanner(G, 'PEDESTRIAN SHOT', 'The police saw that — wanted level up');
        } else if (ent.kind === 'cruiser') {
          const cr = ent.ref;
          cr.health = (cr.health ?? 100) - 25;
          G.police.addHeat(G, 1);
          G.effects.spark(G, h.point.x, h.point.y, h.point.z);
          if (cr.health <= 0) {
            G.effects.explosion(G, cr.mesh.position.x, 1, cr.mesh.position.z);
            G.scene.remove(cr.mesh);
            const i = G.police.cruisers.indexOf(cr);
            if (i >= 0) G.police.cruisers.splice(i, 1);
          }
        }
      }
    }
  }
  if (!hitPoint) {
    hitPoint = origin.clone().addScaledVector(dir, hitDist);
    if (wallDist < 120) G.effects.spark(G, hitPoint.x, hitPoint.y, hitPoint.z);
  }
  G.effects.tracer(G, muzzle, hitPoint);
  G.effects.muzzleFlash(G, muzzle);
  G.police.addHeat(G, 1);
  scarePedestrians(G, G.player.pos.x, G.player.pos.z, 20);
  if (c.ammo === 0) {
    c.reloading = true;
    c.reloadTimer = RELOAD_TIME;
  }
}

/** A punch: the nearest rival or pedestrian right in front of the player. */
function punch(G) {
  const p = G.player;
  const cam = G.camera;
  const dir = new THREE.Vector3();
  cam.getWorldDirection(dir);
  const fx = dir.x;
  const fz = dir.z;
  let best = null;
  let bestD = 2.4;
  const consider = (x, z, ref, kind) => {
    const dx = x - p.pos.x;
    const dz = z - p.pos.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < bestD && d > 0.01) {
      const dot = (dx * fx + dz * fz) / d;
      if (dot > 0.5) {
        bestD = d;
        best = { ref, kind };
      }
    }
  };
  for (const r of G.combat.rivals) {
    if (r.state === 'fight') consider(r.mesh.position.x, r.mesh.position.z, r, 'rival');
  }
  for (const ped of G.pedestrians) {
    if (ped.state !== 'down') consider(ped.mesh.position.x, ped.mesh.position.z, ped, 'ped');
  }
  G.audio.punch();
  if (!best) return;
  if (best.kind === 'rival') {
    const r = best.ref;
    r.health -= 25;
    const away = Math.atan2(r.mesh.position.x - p.pos.x, r.mesh.position.z - p.pos.z);
    r.mesh.position.x += Math.sin(away) * 1.2;
    r.mesh.position.z += Math.cos(away) * 1.2;
    if (r.health <= 0) {
      r.state = 'down';
      r.downTimer = 9999;
      r.mesh.rotation.x = -Math.PI / 2;
      r.mesh.position.y = 0.35;
    }
  } else {
    const ped = best.ref;
    ped.state = 'down';
    ped.downTimer = 7;
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.35;
    G.police.addHeat(G, 1);
  }
}

/** One rival's turn: strafe, and shoot the player when it has a clear line. */
function updateRival(G, r, dt) {
  if (r.state !== 'fight') return;
  const m = r.mesh;
  const p = G.player;
  const d = dist2D(m.position.x, m.position.z, p.pos.x, p.pos.z);
  const face = Math.atan2(p.pos.x - m.position.x, p.pos.z - m.position.z);
  m.rotation.y = angleToward(m.rotation.y, face, 4 * dt);
  r.strafeTimer -= dt;
  if (r.strafeTimer <= 0) {
    r.strafeTimer = rand(1, 2.2);
    r.strafeDir *= -1;
  }
  // Strafe sideways, keeping roughly the same distance.
  const side = face + Math.PI / 2 * r.strafeDir;
  const toward = d > 26 ? 1 : d < 12 ? -1 : 0;
  m.position.x += (Math.sin(side) * 0.7 + Math.sin(face) * toward * 0.5) * 2.2 * dt;
  m.position.z += (Math.cos(side) * 0.7 + Math.cos(face) * toward * 0.5) * 2.2 * dt;
  const pp = { x: m.position.x, z: m.position.z };
  for (const box of G.city.colliders) pushCircleOutOfBox(pp, 0.8, box);
  m.position.x = pp.x;
  m.position.z = pp.z;
  r.phase += dt * 6;
  const swing = Math.sin(r.phase) * 0.5;
  m.getObjectByName('legL').rotation.x = swing;
  m.getObjectByName('legR').rotation.x = -swing;
  // Shoot when close enough with a clear line of sight.
  r.shootTimer -= dt;
  if (r.shootTimer <= 0 && d < 42 && !segmentBlocked(G, m.position.x, m.position.z, p.pos.x, p.pos.z)) {
    r.shootTimer = rand(1.1, 1.9);
    G.audio.shot();
    const from = new THREE.Vector3(m.position.x, 1.3, m.position.z);
    const to = new THREE.Vector3(p.pos.x, 1.2, p.pos.z);
    G.effects.tracer(G, from, to);
    // Inaccurate: about half the shots land.
    if (Math.random() < 0.5) damagePlayer(G, RIVAL_SHOT_DAMAGE);
  }
}

export function updateCombat(G, dt) {
  const c = G.combat;
  c.fireCooldown -= dt;
  if (c.reloading) {
    c.reloadTimer -= dt;
    if (c.reloadTimer <= 0) {
      c.reloading = false;
      c.ammo = MAG;
    }
  }
  // R reloads, F punches (edge-triggered).
  const rDown = G.input.isDown('KeyR');
  if (rDown && !c.prevR && !c.reloading && c.ammo < MAG) {
    c.reloading = true;
    c.reloadTimer = RELOAD_TIME;
  }
  c.prevR = rDown;
  const fDown = G.input.isDown('KeyF');
  if (fDown && !c.prevF && G.player.onFoot) punch(G);
  c.prevF = fDown;
  // Click shoots, only while playing on foot with the pointer locked.
  if (G.state === 'playing' && G.player.onFoot && G.input.pointerLocked) {
    if (G.input.consumeClick() && !c.reloading && c.ammo > 0 && c.fireCooldown <= 0) {
      fireShot(G);
    }
  } else {
    G.input.consumeClick();
  }
  for (const r of c.rivals) updateRival(G, r, dt);
}
