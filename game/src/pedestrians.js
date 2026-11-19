// Pedestrians: people strolling the sidewalks who scatter when a car screams
// past, a gun goes off, or a body drops nearby.
import { clamp, dist, makeRng, pick, randRange } from './utils.js';
import { ROADS } from './city.js';

const SHIRTS = [0xe86a6a, 0x6aa8e8, 0x7ac47a, 0xe8c95a, 0xb06ad8, 0xe8e8e8, 0x5a5a66, 0xd88a4a];
const PANTS = [0x2e3a5a, 0x3a3a3a, 0x5a4a3a, 0x2a4a3a];

function makePerson(rng) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: pick(rng, SHIRTS) });
  const pants = new THREE.MeshLambertMaterial({ color: pick(rng, PANTS) });
  const skin = new THREE.MeshLambertMaterial({ color: [0xe8b88a, 0xc98a5a, 0x8a5a3a][Math.floor(rng() * 3)] });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.34), shirt);
  torso.position.y = 1.05; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skin);
  head.position.y = 1.62; head.castShadow = true; g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: [0x1a1a1a, 0x4a2a1a, 0x8a8a8a][Math.floor(rng() * 3)] }));
  hair.position.y = 1.66; g.add(hair);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.24), pants);
  legL.position.set(-0.16, 0.35, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.16; g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.18), shirt);
  armL.position.set(-0.4, 1.05, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.4; g.add(armR);
  g.userData = { legL, legR, armL, armR };
  return g;
}

export class Pedestrians {
  constructor(scene, colliders) {
    this.scene = scene; this.colliders = colliders; this.rng = makeRng(4242);
    this.people = [];
    for (let i = 0; i < 26; i++) this.spawn(false);
  }
  spawn(anywhere) {
    const road = pick(this.rng, ROADS);
    const along = anywhere ? randRange(this.rng, -280, 280) : randRange(this.rng, -280, 280);
    const ns = this.rng() < 0.5;
    const model = makePerson(this.rng);
    const x = ns ? road + (this.rng() < 0.5 ? 11 : -11) : along;
    const z = ns ? along : road + (this.rng() < 0.5 ? 11 : -11);
    model.position.set(x, 0, z);
    this.scene.add(model);
    const p = { model, x, z, heading: this.rng() * Math.PI * 2, speed: randRange(this.rng, 1.2, 2.2), walkPhase: this.rng() * 6, flee: 0, panicX: 0, panicZ: 0, dead: false, road, ns, along };
    this.people.push(p);
    return p;
  }
  scare(x, z, radius) {
    for (const p of this.people) {
      if (p.dead) continue;
      if (dist(x, z, p.x, p.z) < radius) {
        p.flee = 3 + this.rng() * 2;
        p.panicX = x; p.panicZ = z;
      }
    }
  }
  // returns people hit by a car circle (radius r) at (x,z)
  hitByCar(x, z, r) {
    const hit = [];
    for (const p of this.people) {
      if (p.dead) continue;
      if (dist(x, z, p.x, p.z) < r + 0.6) { p.dead = true; hit.push(p); }
    }
    return hit;
  }
  update(dt) {
    let gone = 0;
    for (const p of this.people) {
      if (p.dead) {
        // fallen: lie flat, then vanish and be replaced by a fresh walker
        p.model.rotation.x = Math.max(-Math.PI / 2, p.model.rotation.x - dt * 2);
        p.model.position.y = Math.max(0.25, p.model.position.y - dt * 0.2);
        p.respawn = (p.respawn || 0) + dt;
        if (p.respawn > 14) { this.scene.remove(p.model); p.gone = true; gone++; }
        continue;
      }
      let speed = p.speed, heading = p.heading;
      if (p.flee > 0) {
        p.flee -= dt;
        speed = 5.5;
        heading = Math.atan2(p.x - p.panicX, p.z - p.panicZ);
      } else if (this.rng() < dt * 0.05) {
        heading = this.rng() * Math.PI * 2;
      }
      p.heading = heading;
      let nx = p.x + Math.sin(heading) * speed * dt;
      let nz = p.z + Math.cos(heading) * speed * dt;
      // stay inside the city and out of buildings
      nx = clamp(nx, -296, 296); nz = clamp(nz, -296, 296);
      let blocked = false;
      for (const b of this.colliders) {
        if (nx > b.minX - 0.5 && nx < b.maxX + 0.5 && nz > b.minZ - 0.5 && nz < b.maxZ + 0.5) { blocked = true; break; }
      }
      if (!blocked) { p.x = nx; p.z = nz; }
      else p.heading = heading + Math.PI / 2;
      p.walkPhase += dt * speed * 3.2;
      const swing = Math.sin(p.walkPhase) * 0.55;
      const u = p.model.userData;
      u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
      u.armL.rotation.x = -swing * 0.7; u.armR.rotation.x = swing * 0.7;
      p.model.position.set(p.x, 0, p.z);
      p.model.rotation.y = p.heading;
    }
    if (gone > 0) {
      this.people = this.people.filter((p) => !p.gone);
      for (let i = 0; i < gone; i++) this.spawn(true);
    }
  }
}
