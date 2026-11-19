// Lena "Vex" Marlowe on foot: third-person movement, jumping, and the orbit
// camera that follows her — and, when she drives, chases the car instead.
import { clamp, lerpAngle, resolveCircleBox } from './utils.js';

function makeVex() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x7a2020 });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2e3a5a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b88a });
  const hair = new THREE.MeshLambertMaterial({ color: 0xb03030 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.78, 0.36), jacket);
  torso.position.y = 1.06; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 9), skin);
  head.position.y = 1.64; head.castShadow = true; g.add(head);
  const bun = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2), hair);
  bun.position.y = 1.68; g.add(bun);
  const ponytail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.14), hair);
  ponytail.position.set(0, 1.45, -0.26); g.add(ponytail);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.72, 0.25), jeans);
  legL.position.set(-0.17, 0.36, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.17; g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.64, 0.19), jacket);
  armL.position.set(-0.43, 1.06, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.43; g.add(armR);
  g.userData = { legL, legR, armL, armR };
  return g;
}

export class Player {
  constructor(scene, camera, colliders) {
    this.scene = scene; this.camera = camera; this.colliders = colliders;
    this.model = makeVex(); scene.add(this.model);
    this.x = 0; this.z = 0; this.y = 0; this.vy = 0;
    this.heading = 0; this.camYaw = 0; this.camPitch = 0.32;
    this.camDist = 7.5; this.health = 100; this.lastHurt = -99;
    this.walkPhase = 0; this.speed = 0; this.inCar = false;
    this.punchTimer = 0; this.aiming = false;
  }
  reset(x, z) {
    this.x = x; this.z = z; this.y = 0; this.vy = 0; this.health = 100;
    this.heading = Math.PI; this.camYaw = Math.PI; this.inCar = false;
    this.model.visible = true;
  }
  hurt(amount, now) {
    this.health = Math.max(0, this.health - amount);
    this.lastHurt = now;
  }
  heal(dt, now) {
    if (now - this.lastHurt > 8 && this.health > 0 && this.health < 100) {
      this.health = Math.min(100, this.health + 4 * dt);
    }
  }
  update(dt, input, colliders) {
    if (this.inCar) return;
    const m = input.consumeMouse();
    this.camYaw -= m.dx * 0.0026;
    this.camPitch = clamp(this.camPitch + m.dy * 0.0022, -0.15, 1.1);
    const fwd = input.axis('KeyS', 'KeyW');
    const strafe = input.axis('KeyA', 'KeyD');
    const run = input.down('ShiftLeft') || input.down('ShiftRight');
    const maxSpeed = run ? 9.5 : 5.2;
    const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
    // camera looks toward -forward: forward on the ground is (-sin, -cos)
    let mx = (-sin) * fwd + (-cos) * strafe;
    let mz = (-cos) * fwd + (sin) * strafe;
    const len = Math.hypot(mx, mz);
    if (len > 0.01) { mx /= len; mz /= len; }
    const targetSpeed = len > 0.01 ? maxSpeed : 0;
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 10);
    if (this.speed > 0.3) this.heading = Math.atan2(mx, mz);
    let nx = this.x + mx * this.speed * dt;
    let nz = this.z + mz * this.speed * dt;
    nx = clamp(nx, -296, 340); nz = clamp(nz, -296, 420);
    const out = { x: nx, z: nz };
    for (const b of this.colliders) {
      if (resolveCircleBox(nx, nz, 0.7, b, out)) { nx = out.x; nz = out.z; }
    }
    this.x = nx; this.z = nz;
    // jump + gravity
    if (input.wasPressed('Space') && this.y === 0) this.vy = 7.5;
    this.vy -= 22 * dt; this.y += this.vy * dt;
    if (this.y <= 0) { this.y = 0; this.vy = 0; }
    // walk cycle
    this.walkPhase += dt * this.speed * 2.1;
    const swing = Math.sin(this.walkPhase) * clamp(this.speed / 9, 0, 1) * 0.6;
    const u = this.model.userData;
    if (this.punchTimer > 0) {
      this.punchTimer -= dt;
      u.armR.rotation.x = -1.9 * Math.sin(Math.min(1, (0.35 - this.punchTimer) / 0.35) * Math.PI);
      u.armL.rotation.x = 0.3;
    } else {
      u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
      u.armL.rotation.x = -swing * 0.8; u.armR.rotation.x = swing * 0.8;
    }
    this.model.position.set(this.x, this.y, this.z);
    this.model.rotation.y = this.heading;
  }
  punch() { this.punchTimer = 0.35; }
  updateCamera(dt, target) {
    // target: {x, y, z, heading, driving, speed}
    const cam = this.camera;
    let yaw, pitch, dist, lookY;
    if (target.driving) {
      // chase cam: ease yaw toward behind-the-car, mouse can swing it
      const behind = target.heading + Math.PI;
      this.camYaw = lerpAngle(this.camYaw, behind, Math.min(1, dt * 1.6));
      yaw = this.camYaw; pitch = 0.24; dist = 11 + Math.abs(target.speed || 0) * 0.08; lookY = 1.6;
    } else {
      yaw = this.camYaw; pitch = this.camPitch; dist = this.camDist; lookY = 1.7;
    }
    const cx = target.x + Math.sin(yaw) * Math.cos(pitch) * dist;
    const cz = target.z + Math.cos(yaw) * Math.cos(pitch) * dist;
    const cy = target.y + lookY + Math.sin(pitch) * dist;
    cam.position.set(cx, Math.max(1.2, cy), cz);
    cam.lookAt(target.x, target.y + lookY, target.z);
  }
}
