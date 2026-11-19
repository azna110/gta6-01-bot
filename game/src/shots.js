// Screenshot staging: ?shot=chase|drive|mission|start puts the game in a
// scene that shows several systems at once, then raises window.__shotReady
// once it has rendered. Normal players never see any of this.

import { enterCar } from './vehicles.js';

/** The ?shot= value, or null for a normal game. */
export function shotParam() {
  try {
    return new URLSearchParams(window.location.search).get('shot');
  } catch (e) {
    return null;
  }
}

/** Put the player in a parked car on a road, already moving. */
function stageDrive(G, x, z, heading, speed) {
  const car = G.vehicles.parked[0];
  if (!car) return;
  car.mesh.position.set(x, 0, z);
  car.mesh.rotation.y = heading;
  car.speed = 0;
  enterCar(G, car);
  car.speed = speed;
  const p = G.player;
  p.camYaw = heading + Math.PI;
  p.camPitch = 0.28;
}

/** Stage the requested scene. Called once after the game starts. */
export function stageShot(G, name) {
  const shot = { name, wait: 4, since: performance.now() };
  G.shot = shot;
  if (name === 'chase') {
    stageDrive(G, 52, -40, 0, 26);
    G.police.wanted = 3;
    G.police.quietTimer = 14;
    G.missions.index = 1;
    G.missions.phase = 1;
    G.hud.showBanner(G, 'THE PICKUP', 'Deliver it to the chop shop');
  } else if (name === 'drive') {
    stageDrive(G, -160, -60, 0, 20);
    G.missions.index = 0;
    G.missions.phase = 0;
    G.hud.showBanner(G, 'FIRST GEAR', 'Meet Dante at the pier');
  } else if (name === 'mission') {
    const p = G.player;
    p.pos.set(-172, 0, -12);
    p.mesh.position.set(-172, 0, -12);
    // Face the pier end so the beacon is in frame.
    const dx = -228 - p.pos.x;
    const dz = 0 - p.pos.z;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    p.camYaw = Math.atan2(-dx / len, -dz / len);
    p.camPitch = 0.3;
    p.yaw = Math.atan2(dx / len, dz / len);
    G.missions.index = 0;
    G.missions.phase = 0;
    G.hud.showBanner(G, 'FIRST GEAR', 'Meet Dante at the pier');
    shot.wait = 3;
  } else if (name === 'start') {
    // The start menu is already showing; just wait for it to render.
    shot.wait = 2;
  }
}

/** Raise the ready flag once the scene has had time to render. */
export function updateShot(G) {
  if (!G.shot) return;
  if (performance.now() - G.shot.since > G.shot.wait * 1000) {
    window.__shotReady = true;
    G.shot = null;
  }
}
