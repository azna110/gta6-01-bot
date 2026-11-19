// Lena "Vex" Marlowe on foot: third-person movement, jumping, the orbit
// camera, and getting into and out of cars.

import { angleToward, clamp, pushCircleOutOfBox } from './utils.js';
import { enterCar, exitCar, nearestParkedCar } from './vehicles.js';

const WALK_SPEED = 6;
const SPRINT_SPEED = 10.5;
const PLAYER_RADIUS = 0.8;

/** Build Lena's figure: red jacket, dark trousers, a cap. */
function buildPlayerMesh() {
  const g = new THREE.Group();
  const legMat = new THREE.MeshLambertMaterial({ color: 0x1a1a2a });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.55, 0.26), legMat);
  legL.position.set(-0.17, 0.28, 0);
  legL.name = 'legL';
  g.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.55, 0.26), legMat);
  legR.position.set(0.17, 0.28, 0);
  legR.name = 'legR';
  g.add(legR);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.72, 0.38), new THREE.MeshLambertMaterial({ color: 0xb02020 }));
  torso.position.y = 0.92;
  torso.castShadow = true;
  g.add(torso);
  const armMat = new THREE.MeshLambertMaterial({ color: 0xb02020 });
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.55, 0.2), armMat);
  armL.position.set(-0.44, 0.9, 0);
  armL.name = 'armL';
  g.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.55, 0.2), armMat);
  armR.position.set(0.44, 0.9, 0);
  armR.name = 'armR';
  g.add(armR);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), new THREE.MeshLambertMaterial({ color: 0xe8b88a }));
  head.position.y = 1.48;
  head.castShadow = true;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.1, 12), new THREE.MeshLambertMaterial({ color: 0x222222 }));
  cap.position.y = 1.68;
  g.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.25), new THREE.MeshLambertMaterial({ color: 0x222222 }));
  brim.position.set(0, 1.64, 0.3);
  g.add(brim);
  return g;
}

export function createPlayer(G) {
  const mesh = buildPlayerMesh();
  // Start on the beach boulevard by the pier, facing the city.
  mesh.position.set(-158, 0, 8);
  mesh.rotation.y = Math.PI / 2;
  G.scene.add(mesh);
  const player = {
    mesh,
    pos: mesh.position,
    vel: new THREE.Vector3(),
    yaw: Math.PI / 2,
    camYaw: -Math.PI / 2,
    camPitch: 0.32,
    onFoot: true,
    car: null,
    carHealth: 100,
    health: 100,
    lastHurt: -99,
    cash: 0,
    debt: 2000,
    grounded: true,
    walkPhase: 0,
    prevE: false,
  };
  return player;
}

/** Move on foot: camera-relative WASD, sprint, jump, building collision. */
function updateOnFoot(G, dt) {
  const p = G.player;
  const input = G.input;
  const { dx, dy } = input.consumeMouse();
  p.camYaw += dx * 0.0032;
  p.camPitch = clamp(p.camPitch - dy * 0.0026, 0.06, 1.15);

  const fwdX = -Math.sin(p.camYaw);
  const fwdZ = -Math.cos(p.camYaw);
  const rightX = Math.cos(p.camYaw);
  const rightZ = -Math.sin(p.camYaw);
  let mx = 0;
  let mz = 0;
  if (input.isDown('KeyW') || input.isDown('ArrowUp')) { mx += fwdX; mz += fwdZ; }
  if (input.isDown('KeyS') || input.isDown('ArrowDown')) { mx -= fwdX; mz -= fwdZ; }
  if (input.isDown('KeyD') || input.isDown('ArrowRight')) { mx += rightX; mz += rightZ; }
  if (input.isDown('KeyA') || input.isDown('ArrowLeft')) { mx -= rightX; mz -= rightZ; }
  const moving = mx !== 0 || mz !== 0;
  if (moving) {
    const len = Math.sqrt(mx * mx + mz * mz);
    mx /= len;
    mz /= len;
    const sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = sprint ? SPRINT_SPEED : WALK_SPEED;
    p.pos.x += mx * speed * dt;
    p.pos.z += mz * speed * dt;
    p.yaw = angleToward(p.yaw, Math.atan2(mx, mz), 10 * dt);
    p.walkPhase += dt * speed * 1.6;
  }
  // Jump and gravity.
  if ((input.isDown('Space')) && p.grounded) {
    p.vel.y = 8.5;
    p.grounded = false;
  }
  p.vel.y -= 24 * dt;
  p.pos.y += p.vel.y * dt;
  if (p.pos.y <= 0) {
    p.pos.y = 0;
    p.vel.y = 0;
    p.grounded = true;
  }
  // Buildings are solid.
  const pp = { x: p.pos.x, z: p.pos.z };
  for (const box of G.city.colliders) pushCircleOutOfBox(pp, PLAYER_RADIUS, box);
  p.pos.x = pp.x;
  p.pos.z = pp.z;
  // Walk cycle, or a tucked pose in the air.
  const mesh = p.mesh;
  mesh.rotation.y = p.yaw;
  if (!p.grounded) {
    mesh.getObjectByName('legL').rotation.x = 0.5;
    mesh.getObjectByName('legR').rotation.x = -0.3;
  } else if (moving) {
    const swing = Math.sin(p.walkPhase) * 0.55;
    mesh.getObjectByName('legL').rotation.x = swing;
    mesh.getObjectByName('legR').rotation.x = -swing;
    mesh.getObjectByName('armL').rotation.x = -swing * 0.8;
    mesh.getObjectByName('armR').rotation.x = swing * 0.8;
  } else {
    mesh.getObjectByName('legL').rotation.x = 0;
    mesh.getObjectByName('legR').rotation.x = 0;
    mesh.getObjectByName('armL').rotation.x = 0;
    mesh.getObjectByName('armR').rotation.x = 0;
  }
  // Health comes back after a few quiet seconds.
  if (G.time - p.lastHurt > 5 && p.health < 100) {
    p.health = Math.min(100, p.health + 9 * dt);
  }
}

/** Third-person camera: orbit on foot, chase behind the car when driving. */
function updateCamera(G, dt) {
  const p = G.player;
  const cam = G.camera;
  let dist;
  let target;
  if (p.onFoot) {
    dist = 7;
    target = p.pos;
  } else {
    // Drift back behind the car; the mouse can still look around.
    const car = p.car;
    const behind = car.mesh.rotation.y + Math.PI;
    p.camYaw = angleToward(p.camYaw, behind, 1.4 * dt);
    p.camPitch = clamp(p.camPitch, 0.1, 0.6);
    dist = 10.5;
    target = car.mesh.position;
  }
  const cp = Math.cos(p.camPitch);
  const sp = Math.sin(p.camPitch);
  const cx = target.x + Math.sin(p.camYaw) * cp * dist;
  const cy = (target.y + 1.7) + sp * dist;
  const cz = target.z + Math.cos(p.camYaw) * cp * dist;
  cam.position.set(cx, Math.max(cy, 0.7), cz);
  cam.lookAt(target.x, target.y + 1.6, target.z);
}

export function updatePlayer(G, dt) {
  const p = G.player;
  if (p.onFoot) {
    p.mesh.visible = true;
    updateOnFoot(G, dt);
    // E near a parked car: steal it.
    const eDown = G.input.isDown('KeyE');
    if (eDown && !p.prevE) {
      const car = nearestParkedCar(G, p.pos.x, p.pos.z, 4.5);
      if (car) {
        enterCar(G, car);
        G.audio.click();
        G.hud.setHint(G, 'W/S drive • A/D steer • Space handbrake • E get out');
        if (G.police.witnessSteal(G)) {
          G.hud.showBanner(G, 'CAR STOLEN', 'A witness saw you — wanted level up');
        }
      }
    }
    p.prevE = eDown;
  } else {
    p.mesh.visible = false;
    // E while driving: get out.
    const eDown = G.input.isDown('KeyE');
    if (eDown && !p.prevE) {
      exitCar(G);
      G.hud.setHint(G, 'WASD move • Shift sprint • Space jump • E steal a car');
    }
    p.prevE = eDown;
    // The player's position follows the car (for the HUD and the police).
    // Guard: the player may have just got out this frame, leaving p.car null.
    if (p.car) {
      p.pos.set(p.car.mesh.position.x, 0, p.car.mesh.position.z);
      p.yaw = p.car.mesh.rotation.y;
    }
  }
  updateCamera(G, dt);
}
