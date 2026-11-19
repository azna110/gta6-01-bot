// Pedestrians: people walking the sidewalks, who flee from gunfire and can
// be knocked down by a car (which the police notice).

import { angleToward, clamp, dist2D, pick, rand } from './utils.js';
import { CITY } from './city.js';

const SHIRTS = [0x3a6a9a, 0x9a3a3a, 0x3a7a4a, 0x8a6a2a, 0x6a3a7a, 0xd8d8d8, 0x2a2a2a];
const SKINS = [0xe8b88a, 0xc98a5a, 0x8a5a3a, 0xf0c8a0];

/** A point on a sidewalk: beside a street, just off the road. */
function sidewalkPoint() {
  const vertical = Math.random() < 0.5;
  const s = pick(CITY.streets);
  const along = rand(-150, 150);
  const side = Math.random() < 0.5 ? -1 : 1;
  if (vertical) return { x: s + side * 8.5, z: along };
  return { x: along, z: s + side * 8.5 };
}

/** Build one pedestrian figure: legs, torso, arms and a head. */
function buildPedestrianMesh(shirt, skin) {
  const g = new THREE.Group();
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2a2a3a });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.55, 0.24), legMat);
  legL.position.set(-0.16, 0.28, 0);
  legL.name = 'legL';
  g.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.55, 0.24), legMat);
  legR.position.set(0.16, 0.28, 0);
  legR.name = 'legR';
  g.add(legR);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.36), new THREE.MeshLambertMaterial({ color: shirt }));
  torso.position.y = 0.9;
  torso.castShadow = true;
  g.add(torso);
  const armMat = new THREE.MeshLambertMaterial({ color: shirt });
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.18), armMat);
  armL.position.set(-0.42, 0.88, 0);
  armL.name = 'armL';
  g.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.18), armMat);
  armR.position.set(0.42, 0.88, 0);
  armR.name = 'armR';
  g.add(armR);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), new THREE.MeshLambertMaterial({ color: skin }));
  head.position.y = 1.45;
  head.castShadow = true;
  g.add(head);
  return g;
}

export function createPedestrians(G) {
  const list = [];
  for (let i = 0; i < 18; i++) {
    const at = sidewalkPoint();
    const mesh = buildPedestrianMesh(pick(SHIRTS), pick(SKINS));
    mesh.position.set(at.x, 0, at.z);
    G.scene.add(mesh);
    const target = sidewalkPoint();
    list.push({
      mesh,
      speed: rand(1.1, 2.1),
      target,
      state: 'walk',
      phase: rand(0, 6),
      fleeTimer: 0,
      downTimer: 0,
      threatX: 0,
      threatZ: 0,
    });
  }
  return list;
}

/** A gunshot nearby sends every pedestrian within radius running. */
export function scarePedestrians(G, x, z, radius) {
  for (const p of G.pedestrians) {
    if (p.state === 'down') continue;
    if (dist2D(x, z, p.mesh.position.x, p.mesh.position.z) < radius) {
      p.state = 'flee';
      p.fleeTimer = rand(2.5, 4);
      p.threatX = x;
      p.threatZ = z;
    }
  }
}

/** Walk one pedestrian toward its target, swinging its limbs. */
function stepWalk(p, dt) {
  const m = p.mesh;
  const dx = p.target.x - m.position.x;
  const dz = p.target.z - m.position.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 1.5) {
    p.target = sidewalkPoint();
    return;
  }
  const heading = Math.atan2(dx, dz);
  m.rotation.y = angleToward(m.rotation.y, heading, 3.5 * dt);
  m.position.x += Math.sin(m.rotation.y) * p.speed * dt;
  m.position.z += Math.cos(m.rotation.y) * p.speed * dt;
  p.phase += dt * p.speed * 4.5;
  const swing = Math.sin(p.phase) * 0.5;
  m.getObjectByName('legL').rotation.x = swing;
  m.getObjectByName('legR').rotation.x = -swing;
  m.getObjectByName('armL').rotation.x = -swing * 0.8;
  m.getObjectByName('armR').rotation.x = swing * 0.8;
}

/** A car moving fast that touches a pedestrian knocks them down. */
function checkCarHit(G, p) {
  if (p.state === 'down') return;
  const m = p.mesh;
  const cars = G.vehicles.traffic.slice();
  if (G.player.car) cars.push(G.player.car);
  for (const car of cars) {
    const d = dist2D(m.position.x, m.position.z, car.mesh.position.x, car.mesh.position.z);
    if (d < 2.2 && Math.abs(car.speed) > 3) {
      p.state = 'down';
      p.downTimer = 7;
      // Fall flat on the ground.
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.35;
      G.police.addHeat(G, 1);
      G.audio.crash(0.3);
      G.hud.showBanner(G, 'PEDESTRIAN DOWN', 'The police saw that — wanted level up');
      return;
    }
  }
}

export function updatePedestrians(G, dt) {
  for (const p of G.pedestrians) {
    const m = p.mesh;
    if (p.state === 'down') {
      p.downTimer -= dt;
      if (p.downTimer <= 0) {
        // Get up, dust off, and run away from the scene.
        m.rotation.x = 0;
        m.position.y = 0;
        p.state = 'flee';
        p.fleeTimer = 4;
        p.threatX = m.position.x;
        p.threatZ = m.position.z;
      }
      continue;
    }
    if (p.state === 'flee') {
      p.fleeTimer -= dt;
      if (p.fleeTimer <= 0) {
        p.state = 'walk';
        p.target = sidewalkPoint();
        continue;
      }
      const away = Math.atan2(m.position.x - p.threatX, m.position.z - p.threatZ);
      m.rotation.y = angleToward(m.rotation.y, away, 4 * dt);
      m.position.x += Math.sin(m.rotation.y) * 4.2 * dt;
      m.position.z += Math.cos(m.rotation.y) * 4.2 * dt;
      p.phase += dt * 14;
      const swing = Math.sin(p.phase) * 0.6;
      m.getObjectByName('legL').rotation.x = swing;
      m.getObjectByName('legR').rotation.x = -swing;
      // Stay inside the city.
      m.position.x = clamp(m.position.x, -180, 180);
      m.position.z = clamp(m.position.z, -180, 180);
      continue;
    }
    stepWalk(p, dt);
    checkCarHit(G, p);
  }
}
