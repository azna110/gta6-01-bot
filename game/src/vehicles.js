// Cars: a low-poly model factory, the traffic that fills the roads, and the
// arcade driving physics for the car the player is in.
import { clamp, dist, makeRng, pick, randRange, resolveCircleBox } from './utils.js';
import { ROADS } from './city.js';

const CAR_COLORS = [0xd84a4a, 0x4a7ad8, 0xe8b93c, 0x37b06a, 0xe8e8e8, 0x2e2f38, 0x8a4ad8, 0xd87a3c, 0x3cb8b0];
const CAR_NAMES = ['Comet', 'Stallion', 'Falcon', 'Vagabond', 'Sunrunner', 'Mirage', 'Bruiser', 'Corsair'];

export function makeCarModel(color, police) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x181a20 });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fd8ef });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.75, 4.6), bodyMat);
  body.position.y = 0.75; body.castShadow = true; g.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.45, 1.1), bodyMat);
  nose.position.set(0, 0.62, 2.5); nose.castShadow = true; g.add(nose);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.65, 2.2), glassMat);
  cabin.position.set(0, 1.4, -0.3); cabin.castShadow = true; g.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.12, 2.0), bodyMat);
  roof.position.set(0, 1.78, -0.3); g.add(roof);
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 10);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.5], [0.95, 1.5], [-0.95, -1.5], [0.95, -1.5]]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.42, wz); w.castShadow = true;
    g.add(w); wheels.push(w);
  }
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xcc9933 });
  for (const hx of [-0.65, 0.65]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.22, 0.1), headMat);
    h.position.set(hx, 0.8, 3.06); g.add(h);
  }
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xd82020, emissive: 0x771111 });
  for (const hx of [-0.65, 0.65]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.22, 0.1), tailMat);
    t.position.set(hx, 0.8, -2.36); g.add(t);
  }
  if (police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 0.5), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    bar.position.set(0, 1.95, -0.3); g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.52), new THREE.MeshLambertMaterial({ color: 0xff2020, emissive: 0xff0000 }));
    red.position.set(-0.35, 1.95, -0.3); g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.52), new THREE.MeshLambertMaterial({ color: 0x2040ff, emissive: 0x0022ff }));
    blue.position.set(0.35, 1.95, -0.3); g.add(blue);
    g.userData.lightRed = red; g.userData.lightBlue = blue;
  }
  g.userData.wheels = wheels;
  return g;
}

function newCar(scene, rng, x, z, heading, color, police) {
  const model = makeCarModel(color, police);
  model.position.set(x, 0, z); model.rotation.y = heading;
  scene.add(model);
  return { model, wheels: model.userData.wheels, x, z, heading, speed: 0, health: 100, police: !!police, name: pick(rng, CAR_NAMES) };
}

export class TrafficSystem {
  constructor(scene) {
    this.scene = scene; this.rng = makeRng(777);
    this.cars = [];
    // moving traffic
    for (let i = 0; i < 14; i++) this.spawnMoving();
    // parked cars the player can steal
    for (let i = 0; i < 8; i++) {
      const road = pick(this.rng, ROADS);
      const along = pick(this.rng, ROADS) + randRange(this.rng, -30, 30);
      const ns = this.rng() < 0.5;
      const c = newCar(scene, this.rng, ns ? road + 5.5 : along, ns ? along : road + 5.5, ns ? (this.rng() < 0.5 ? 0 : Math.PI) : (this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2), pick(this.rng, CAR_COLORS), false);
      c.parked = true; c.axis = ns ? 'z' : 'x'; c.fixed = road; c.along = along; c.dir = 1;
      this.cars.push(c);
    }
  }
  spawnMoving() {
    const ns = this.rng() < 0.5;
    const road = pick(this.rng, ROADS);
    const along = randRange(this.rng, -280, 280);
    const dir = this.rng() < 0.5 ? 1 : -1;
    const c = newCar(this.scene, this.rng, ns ? road + dir * 4 : along, ns ? along : road + dir * 4, 0, pick(this.rng, CAR_COLORS), false);
    c.parked = false; c.axis = ns ? 'z' : 'x'; c.fixed = road; c.along = along; c.dir = dir;
    c.cruise = randRange(this.rng, 8, 14);
    this.cars.push(c);
  }
  nearestStealable(x, z, maxD) {
    let best = null, bd = maxD;
    for (const c of this.cars) {
      if (c.driven) continue;
      const d = dist(x, z, c.x, c.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  update(dt, playerCar, onBump) {
    for (const c of this.cars) {
      if (c.driven || c.parked) continue;
      // slow down for a car ahead in the same lane
      let target = c.cruise;
      for (const o of this.cars) {
        if (o === c || o.parked || o.axis !== c.axis || o.fixed !== c.fixed || o.dir !== c.dir) continue;
        const ahead = (o.along - c.along) * c.dir;
        if (ahead > 0 && ahead < 14) { target = 0; break; }
      }
      if (playerCar) {
        const pc = playerCar;
        const dx = pc.x - c.x, dz = pc.z - c.z;
        const alongPc = c.axis === 'z' ? dz : dx;
        const latPc = c.axis === 'z' ? dx : dz;
        if (alongPc * c.dir > 0 && alongPc * c.dir < 16 && Math.abs(latPc) < 5) target = 0;
      }
      c.speed += clamp(target - c.speed, -10 * dt, 6 * dt);
      c.along += c.dir * c.speed * dt;
      // at an intersection, sometimes turn onto the crossing road; at the edge, turn back
      const near = ROADS.reduce((best, r) => Math.abs(c.along - r) < Math.abs(c.along - best) ? r : best, ROADS[0]);
      if (Math.abs(c.along - near) < 1.5 && this.rng() < 0.02) {
        const oldFixed = c.fixed;
        c.axis = c.axis === 'z' ? 'x' : 'z';
        c.fixed = near; c.along = oldFixed;
        c.dir = this.rng() < 0.5 ? 1 : -1;
      }
      if (c.along > 286 || c.along < -286) { c.dir *= -1; c.along = clamp(c.along, -286, 286); }
      if (c.axis === 'z') { c.x = c.fixed + c.dir * 4; c.z = c.along; }
      else { c.x = c.along; c.z = c.fixed + c.dir * 4; }
      c.heading = c.axis === 'z' ? (c.dir > 0 ? 0 : Math.PI) : (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      c.model.position.set(c.x, 0, c.z);
      c.model.rotation.y = c.heading;
      const spin = c.speed * dt / 0.42;
      for (const w of c.wheels) w.rotation.x += spin;
    }
    void onBump;
  }
}

// The car the player drives: arcade physics, building and traffic collisions.
export class PlayerCar {
  constructor(car, colliders, traffic, fx) {
    this.car = car; this.colliders = colliders; this.traffic = traffic; this.fx = fx;
    this.steer = 0; this.maxSpeed = 42; this.crashed = 0;
    car.driven = true; car.parked = false;
  }
  get x() { return this.car.x; }
  get z() { return this.car.z; }
  get heading() { return this.car.heading; }
  get speed() { return this.car.speed; }
  get health() { return this.car.health; }
  update(dt, input, onCrash) {
    const c = this.car;
    const throttle = input.axis('KeyS', 'KeyW');
    const steerIn = input.axis('KeyA', 'KeyD');
    const handbrake = input.down('Space');
    const accel = throttle > 0 ? 16 : throttle < 0 ? 12 : 0;
    c.speed += accel * throttle * dt;
    if (throttle === 0) c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 8 * dt);
    if (handbrake) c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 26 * dt);
    c.speed = clamp(c.speed, -14, this.maxSpeed);
    const steerTarget = steerIn * 0.55 * clamp(Math.abs(c.speed) / 10, 0, 1) * (handbrake ? 1.5 : 1);
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 8);
    c.heading += this.steer * (c.speed / 12) * dt * (c.speed >= 0 ? 1 : -1);
    const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
    let nx = c.x + fx * c.speed * dt, nz = c.z + fz * c.speed * dt;
    // buildings
    const out = { x: nx, z: nz };
    for (const b of this.colliders) {
      if (resolveCircleBox(nx, nz, 2.3, b, out)) {
        const impact = Math.abs(c.speed);
        nx = out.x; nz = out.z;
        if (impact > 6 && this.crashed <= 0) {
          c.speed *= -0.25; c.health -= impact * 0.9;
          this.crashed = 0.4;
          if (this.fx) this.fx.sparks(nx, nz);
          onCrash && onCrash(impact);
        } else c.speed *= 0.6;
      }
    }
    // traffic cars
    for (const o of this.traffic.cars) {
      if (o === c || o.driven) continue;
      const d = dist(nx, nz, o.x, o.z);
      if (d < 4.4 && d > 0.01) {
        const push = (4.4 - d) / d, px = (nx - o.x) * push, pz = (nz - o.z) * push;
        nx += px * 0.6; nz += pz * 0.6;
        o.x -= px * 0.4; o.z -= pz * 0.4;
        o.along += (o.axis === 'z' ? -pz : -px) * 0.4 * o.dir;
        const impact = Math.abs(c.speed);
        if (impact > 5 && this.crashed <= 0) {
          c.speed *= 0.5; c.health -= impact * 0.7; this.crashed = 0.4;
          if (this.fx) this.fx.sparks(nx, nz);
          onCrash && onCrash(impact);
        }
      }
    }
    this.crashed = Math.max(0, this.crashed - dt);
    c.x = clamp(nx, -296, 340); c.z = clamp(nz, -296, 420);
    c.model.position.set(c.x, 0, c.z);
    c.model.rotation.y = c.heading;
    const spin = c.speed * dt / 0.42;
    c.wheels.forEach((w, i) => { w.rotation.x += spin; if (i < 2) w.rotation.y = this.steer * 0.5; });
    if (c.health < 45 && this.fx) this.fx.smoke(c.x, 1.6, c.z);
  }
}
