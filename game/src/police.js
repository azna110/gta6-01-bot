// The wanted level and the police: cruisers that chase, ram, flash their
// light bars and sound their sirens, and bust the player when caught.

import { angleToward, clamp, dist2D, pick, pushCircleOutOfBox, rand } from './utils.js';
import { buildCarMesh } from './vehicles.js';
import { CITY } from './city.js';

export function createPolice(G) {
  const police = {
    wanted: 0,
    quietTimer: 0,
    cruisers: [],
    bustedTimer: 0,
    flashTimer: 0,
    flashOn: false,
  };
  // Called as methods on this object (G.police.addHeat(G, ...)).
  police.addHeat = addHeat;
  police.witnessSteal = witnessSteal;
  return police;
}

/** Raise the wanted level and restart the quiet clock. */
export function addHeat(G, amount) {
  const police = G.police;
  police.wanted = clamp(police.wanted + amount, 0, 5);
  police.quietTimer = 14;
}

/** True when a pedestrian or a driver is close enough to see a car theft. */
export function witnessSteal(G) {
  const p = G.player.pos;
  for (const ped of G.pedestrians) {
    if (ped.state !== 'down' && dist2D(p.x, p.z, ped.mesh.position.x, ped.mesh.position.z) < 26) {
      addHeat(G, 1);
      return true;
    }
  }
  for (const car of G.vehicles.traffic) {
    if (dist2D(p.x, p.z, car.mesh.position.x, car.mesh.position.z) < 26) {
      addHeat(G, 1);
      return true;
    }
  }
  return false;
}

/** The intersection nearest a point, for cruisers to drive toward. */
function nearestIntersection(x, z) {
  let bx = CITY.streets[0];
  let bz = CITY.streets[0];
  for (const s of CITY.streets) {
    if (Math.abs(s - x) < Math.abs(bx - x)) bx = s;
    if (Math.abs(s - z) < Math.abs(bz - z)) bz = s;
  }
  return { x: bx, z: bz };
}

/** Spawn one cruiser on a road near the player. */
function spawnCruiser(G) {
  const p = G.player.pos;
  const at = nearestIntersection(p.x + rand(-70, 70), p.z + rand(-70, 70));
  const mesh = buildCarMesh(0xf0f0f0, true);
  mesh.position.set(at.x, 0, at.z);
  G.scene.add(mesh);
  const red = mesh.getObjectByName('lightRed');
  const blue = mesh.getObjectByName('lightBlue');
  const cruiser = {
    mesh,
    speed: 0,
    target: nearestIntersection(p.x, p.z),
    redMat: red ? red.material : null,
    blueMat: blue ? blue.material : null,
    ramCooldown: 0,
    stuckTimer: 0,
    lastX: at.x,
    lastZ: at.z,
    reverseTimer: 0,
  };
  G.police.cruisers.push(cruiser);
  return cruiser;
}

/** Steer one cruiser: follow roads toward the player, chase directly close in. */
function updateCruiser(G, c, dt) {
  const mesh = c.mesh;
  const p = G.player.pos;
  const dPlayer = dist2D(mesh.position.x, mesh.position.z, p.x, p.z);
  let tx;
  let tz;
  if (dPlayer < 16) {
    tx = p.x;
    tz = p.z;
  } else {
    const near = nearestIntersection(p.x, p.z);
    if (Math.abs(near.x - c.target.x) > 1 || Math.abs(near.z - c.target.z) > 1) c.target = near;
    tx = c.target.x;
    tz = c.target.z;
  }
  const dx = tx - mesh.position.x;
  const dz = tz - mesh.position.z;
  const desired = Math.atan2(dx, dz);
  // Stuck against a building: back up and turn around for a moment.
  const moved = dist2D(mesh.position.x, mesh.position.z, c.lastX, c.lastZ);
  if (moved < 0.4 * dt * 10 && c.speed > 4) c.stuckTimer += dt;
  else c.stuckTimer = 0;
  c.lastX = mesh.position.x;
  c.lastZ = mesh.position.z;
  if (c.stuckTimer > 1.6) {
    c.stuckTimer = 0;
    c.reverseTimer = 0.9;
  }
  let wantSpeed = dPlayer < 16 ? 30 : 24;
  if (c.reverseTimer > 0) {
    c.reverseTimer -= dt;
    wantSpeed = -9;
  }
  c.speed += clamp(wantSpeed - c.speed, -20 * dt, 12 * dt);
  mesh.rotation.y = angleToward(mesh.rotation.y, desired, 2.2 * dt);
  mesh.position.x += Math.sin(mesh.rotation.y) * c.speed * dt;
  mesh.position.z += Math.cos(mesh.rotation.y) * c.speed * dt;
  const pp = { x: mesh.position.x, z: mesh.position.z };
  for (const box of G.city.colliders) pushCircleOutOfBox(pp, 2.1, box);
  mesh.position.x = pp.x;
  mesh.position.z = pp.z;

  // Ramming the player's car, or cornering the player on foot.
  c.ramCooldown -= dt;
  if (G.player.car) {
    const car = G.player.car;
    const d = dist2D(mesh.position.x, mesh.position.z, car.mesh.position.x, car.mesh.position.z);
    if (d < 4.4 && c.ramCooldown <= 0) {
      c.ramCooldown = 1.2;
      car.health -= 7;
      car.speed *= 0.55;
      G.audio.crash(0.6);
      G.effects.smoke(G, car.mesh.position.x, 1, car.mesh.position.z, 5);
      if (car.health <= 0) {
        car.health = 0;
        G.effects.explosion(G, car.mesh.position.x, 1, car.mesh.position.z);
        car.speed = 0;
      }
    }
  } else if (dPlayer < 3.6) {
    G.police.bustedTimer += dt;
    if (G.police.bustedTimer > 2.2) {
      G.police.bustedTimer = 0;
      G.save.triggerBusted(G);
    }
  }
}

export function updatePolice(G, dt) {
  const police = G.police;
  // The heat fades when the player stays quiet.
  if (police.wanted > 0) {
    police.quietTimer -= dt;
    if (police.quietTimer <= 0) {
      police.wanted -= 1;
      police.quietTimer = 14;
    }
  } else {
    police.bustedTimer = 0;
  }
  // Cruisers match the wanted level.
  const want = police.wanted === 0 ? 0 : Math.min(4, police.wanted);
  while (police.cruisers.length < want) spawnCruiser(G);
  while (police.cruisers.length > want) {
    const c = police.cruisers.pop();
    G.scene.remove(c.mesh);
  }
  for (const c of police.cruisers) updateCruiser(G, c, dt);
  // Flash the light bars and fade the siren with distance.
  police.flashTimer += dt;
  if (police.flashTimer > 0.28) {
    police.flashTimer = 0;
    police.flashOn = !police.flashOn;
    for (const c of police.cruisers) {
      if (c.redMat) c.redMat.emissiveIntensity = police.flashOn ? 2.2 : 0.25;
      if (c.blueMat) c.blueMat.emissiveIntensity = police.flashOn ? 0.25 : 2.2;
    }
  }
  let nearest = 999;
  for (const c of police.cruisers) {
    nearest = Math.min(nearest, dist2D(c.mesh.position.x, c.mesh.position.z, G.player.pos.x, G.player.pos.z));
  }
  G.audio.setSiren(police.cruisers.length > 0 ? clamp(1 - nearest / 95, 0, 1) : 0);
}
