// Cars: the traffic that fills the streets, the parked cars the player can
// steal, and the arcade driving physics for the car the player is in.

import { angleToward, clamp, dist2D, pick, pushCircleOutOfBox, rand, randInt } from './utils.js';
import { CITY } from './city.js';

const CAR_COLORS = [0xc0392b, 0x2e6f9e, 0xe8b93a, 0x3a7a4a, 0x7a4a8a, 0xd8d8d8, 0x222831, 0xc07a2a];
const CAR_RADIUS = 2.1;

/** Build a car mesh. The front (headlights) faces +z. */
export function buildCarMesh(color, isPolice = false) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 4.4), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.62, 2.1),
    new THREE.MeshLambertMaterial({ color: 0x1a2530 })
  );
  cabin.position.set(0, 1.2, -0.25);
  cabin.castShadow = true;
  g.add(cabin);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x151515 });
  for (const [wx, wz] of [[-1.05, 1.45], [1.05, 1.45], [-1.05, -1.45], [1.05, -1.45]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.32, 12), wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.42, wz);
    g.add(wheel);
  }
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff6c0, emissive: 0xaa9922 });
  for (const hx of [-0.7, 0.7]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.12), headMat);
    head.position.set(hx, 0.62, 2.22);
    g.add(head);
  }
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xaa1111, emissive: 0x550000 });
  for (const hx of [-0.7, 0.7]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.12), tailMat);
    tail.position.set(hx, 0.62, -2.22);
    g.add(tail);
  }
  if (isPolice) {
    // Black doors and a light bar on the roof.
    const doorMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    for (const sx of [-1, 1]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 2.2), doorMat);
      door.position.set(sx * 1.12, 0.62, 0);
      g.add(door);
    }
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 0.5), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    barBase.position.set(0, 1.62, -0.25);
    g.add(barBase);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.45), new THREE.MeshLambertMaterial({ color: 0xcc0000, emissive: 0x880000 }));
    red.position.set(-0.35, 1.72, -0.25);
    red.name = 'lightRed';
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.22, 0.45), new THREE.MeshLambertMaterial({ color: 0x0044cc, emissive: 0x002288 }));
    blue.position.set(0.35, 1.72, -0.25);
    blue.name = 'lightBlue';
    g.add(blue);
  }
  return g;
}

/** A random intersection point (street crossing) in the grid. */
function randomIntersection() {
  return { x: pick(CITY.streets), z: pick(CITY.streets) };
}

/** The neighbor intersections of one intersection, one street step away. */
function neighborIntersections(p) {
  const out = [];
  const ix = CITY.streets.indexOf(p.x);
  const iz = CITY.streets.indexOf(p.z);
  if (ix > 0) out.push({ x: CITY.streets[ix - 1], z: p.z });
  if (ix < CITY.streets.length - 1) out.push({ x: CITY.streets[ix + 1], z: p.z });
  if (iz > 0) out.push({ x: p.x, z: CITY.streets[iz - 1] });
  if (iz < CITY.streets.length - 1) out.push({ x: p.x, z: CITY.streets[iz + 1] });
  return out;
}

/** Spawn the traffic and the parked cars. */
export function createVehicles(G) {
  const traffic = [];
  for (let i = 0; i < 14; i++) {
    const color = pick(CAR_COLORS);
    const mesh = buildCarMesh(color);
    const at = randomIntersection();
    const next = pick(neighborIntersections(at));
    mesh.position.set(at.x, 0, at.z);
    mesh.rotation.y = Math.atan2(next.x - at.x, next.z - at.z);
    G.scene.add(mesh);
    traffic.push({
      mesh,
      speed: rand(7, 11),
      cruise: rand(8, 12),
      health: 100,
      target: next,
      isPolice: false,
      stopped: 0,
    });
  }
  const parked = [];
  for (let i = 0; i < 8; i++) {
    const color = pick(CAR_COLORS);
    const mesh = buildCarMesh(color);
    // Parked along a curb: beside a street, just off the road.
    const vertical = Math.random() < 0.5;
    const s = pick(CITY.streets);
    const along = pick(CITY.blocks) + rand(-12, 12);
    const side = Math.random() < 0.5 ? -1 : 1;
    let x, z, heading;
    if (vertical) {
      x = s + side * 8.5;
      z = along;
      heading = side > 0 ? 0 : Math.PI;
    } else {
      x = along;
      z = s + side * 8.5;
      heading = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
    G.scene.add(mesh);
    parked.push({ mesh, speed: 0, health: 100, isPolice: false, parked: true });
  }
  return { traffic, parked };
}

/** The closest parked car to (x, z) within maxDist, or null. */
export function nearestParkedCar(G, x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of G.vehicles.parked) {
    const d = dist2D(x, z, car.mesh.position.x, car.mesh.position.z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

/** The player gets into a parked car: it leaves the parked list. */
export function enterCar(G, car) {
  const idx = G.vehicles.parked.indexOf(car);
  if (idx >= 0) G.vehicles.parked.splice(idx, 1);
  car.parked = false;
  G.player.car = car;
  G.player.onFoot = false;
  G.player.carHealth = car.health;
}

/** The player gets out: the car parks where it stands. */
export function exitCar(G) {
  const car = G.player.car;
  if (!car) return;
  car.speed = 0;
  car.parked = true;
  G.vehicles.parked.push(car);
  G.player.car = null;
  G.player.onFoot = true;
  // Step out beside the car.
  const p = G.player;
  const side = { x: Math.cos(p.yaw), z: -Math.sin(p.yaw) };
  p.pos.x = car.mesh.position.x + side.x * 3;
  p.pos.z = car.mesh.position.z + side.z * 3;
  p.pos.y = 0;
  p.vel.set(0, 0, 0);
}

/** Push a car circle out of every building; returns the impact speed. */
function collideBuildings(G, car, speed) {
  const p = { x: car.mesh.position.x, z: car.mesh.position.z };
  let hit = false;
  for (const box of G.city.colliders) {
    if (pushCircleOutOfBox(p, CAR_RADIUS, box)) hit = true;
  }
  car.mesh.position.x = p.x;
  car.mesh.position.z = p.z;
  return hit ? Math.abs(speed) : 0;
}

/** Drive one traffic car toward its waypoint, stopping for cars ahead. */
function updateTrafficCar(G, car, dt) {
  const mesh = car.mesh;
  const tx = car.target.x;
  const tz = car.target.z;
  const dx = tx - mesh.position.x;
  const dz = tz - mesh.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 4) {
    // Reached the intersection: pick a neighboring one.
    const next = pick(neighborIntersections({ x: tx, z: tz }));
    car.target = next;
    return;
  }
  // Stop for any car ahead in a narrow cone.
  let blocked = false;
  const allCars = G.vehicles.traffic.concat(G.vehicles.parked);
  if (G.player.car) allCars.push(G.player.car);
  const fx = Math.sin(mesh.rotation.y);
  const fz = Math.cos(mesh.rotation.y);
  for (const other of allCars) {
    if (other === car) continue;
    const ox = other.mesh.position.x - mesh.position.x;
    const oz = other.mesh.position.z - mesh.position.z;
    const od = Math.sqrt(ox * ox + oz * oz);
    if (od < 10 && od > 0.1) {
      const dot = (ox * fx + oz * fz) / od;
      if (dot > 0.86) {
        blocked = true;
        break;
      }
    }
  }
  const want = blocked ? 0 : car.cruise;
  car.speed += clamp(want - car.speed, -14 * dt, 8 * dt);
  const desired = Math.atan2(dx, dz);
  mesh.rotation.y = angleToward(mesh.rotation.y, desired, 1.6 * dt);
  mesh.position.x += Math.sin(mesh.rotation.y) * car.speed * dt;
  mesh.position.z += Math.cos(mesh.rotation.y) * car.speed * dt;
  collideBuildings(G, car, car.speed);
}

/** The player's car: arcade physics, steering, handbrake, collisions. */
function updatePlayerCar(G, dt) {
  const car = G.player.car;
  const input = G.input;
  const mesh = car.mesh;
  const accel = input.isDown('KeyW') || input.isDown('ArrowUp');
  const brake = input.isDown('KeyS') || input.isDown('ArrowDown');
  const left = input.isDown('KeyA') || input.isDown('ArrowLeft');
  const right = input.isDown('KeyD') || input.isDown('ArrowRight');
  const hand = input.isDown('Space');

  if (accel) car.speed += 15 * dt;
  if (brake) {
    if (car.speed > 0.5) car.speed -= 24 * dt;
    else car.speed -= 8 * dt;
  }
  if (!accel && !brake) {
    // Rolling drag.
    car.speed -= car.speed * 0.9 * dt;
    if (Math.abs(car.speed) < 0.1) car.speed = 0;
  }
  if (hand) car.speed -= car.speed * 2.2 * dt;
  car.speed = clamp(car.speed, -12, 34);

  const steerTarget = (left ? 1 : 0) - (right ? 1 : 0);
  car.steer = (car.steer ?? 0) + (steerTarget * 0.55 - (car.steer ?? 0)) * Math.min(1, 10 * dt);
  // Turning scales with speed (none while parked) and reverses in reverse.
  mesh.rotation.y += car.steer * car.speed * 0.028 * dt * (hand ? 1.7 : 1);

  mesh.position.x += Math.sin(mesh.rotation.y) * car.speed * dt;
  mesh.position.z += Math.cos(mesh.rotation.y) * car.speed * dt;

  // Building collisions: damage, a crash sound and smoke on a hard hit.
  const impact = collideBuildings(G, car, car.speed);
  if (impact > 6) {
    car.health -= impact * 1.4;
    car.speed *= 0.4;
    G.audio.crash(clamp(impact / 30, 0.2, 1));
    G.effects.smoke(G, mesh.position.x, 1, mesh.position.z, 6);
    if (car.health <= 0) {
      car.health = 0;
      G.effects.explosion(G, mesh.position.x, 1, mesh.position.z);
      car.speed = 0;
    }
  }
  // Car-to-car bumps with traffic.
  for (const other of G.vehicles.traffic) {
    const d = dist2D(mesh.position.x, mesh.position.z, other.mesh.position.x, other.mesh.position.z);
    if (d < CAR_RADIUS * 2 && d > 0.01) {
      const push = (CAR_RADIUS * 2 - d) / 2;
      const nx = (mesh.position.x - other.mesh.position.x) / d;
      const nz = (mesh.position.z - other.mesh.position.z) / d;
      mesh.position.x += nx * push;
      mesh.position.z += nz * push;
      other.mesh.position.x -= nx * push;
      other.mesh.position.z -= nz * push;
      if (Math.abs(car.speed) > 5) {
        car.health -= 4;
        other.health -= 4;
        car.speed *= 0.7;
        G.audio.crash(0.4);
      }
    }
  }
  G.player.carHealth = car.health;
  // The engine hum follows speed.
  G.audio.setEngine(clamp(Math.abs(car.speed) / 34, 0, 1), true);
}

/** Drive the traffic and, when the player is in a car, the player's car. */
export function updateVehicles(G, dt) {
  for (const car of G.vehicles.traffic) {
    if (car.health > 0) updateTrafficCar(G, car, dt);
  }
  if (G.player.car) {
    if (G.player.car.health > 0) updatePlayerCar(G, dt);
    else G.audio.setEngine(0, false);
  } else {
    G.audio.setEngine(0, false);
  }
}
