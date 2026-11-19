// Juice: sparks, smoke, muzzle flashes, tracers, and the golden beacon pillar
// that marks the current objective from across the city.
import { makeRng, randRange } from './utils.js';

export class Effects {
  constructor(scene) {
    this.scene = scene; this.rng = makeRng(2024);
    this.particles = [];
    this.tracers = [];
    this.sparkGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    this.smokeGeo = new THREE.SphereGeometry(0.5, 6, 5);
    // objective beacon: light pillar + floating diamond
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 90, 12, 1, true), beamMat);
    this.beacon.visible = false; scene.add(this.beacon);
    this.marker = new THREE.Mesh(new THREE.OctahedronGeometry(1.4), new THREE.MeshBasicMaterial({ color: 0xffd23e }));
    this.marker.visible = false; scene.add(this.marker);
  }
  setBeacon(x, z, on) {
    this.beacon.visible = on; this.marker.visible = on;
    if (on) { this.beacon.position.set(x, 45, z); this.marker.position.set(x, 10, z); }
  }
  burst(x, y, z, color, n, speed, life, size) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.sparkGeo, mat);
      m.scale.setScalar(size || 1);
      m.position.set(x, y, z);
      this.scene.add(m);
      const a = this.rng() * Math.PI * 2, b = randRange(this.rng, -1, 1);
      this.particles.push({ m, vx: Math.cos(a) * speed * (0.4 + this.rng() * 0.6), vy: b * speed, vz: Math.sin(a) * speed * (0.4 + this.rng() * 0.6), life: life * (0.6 + this.rng() * 0.7), maxLife: life, gravity: -9 });
    }
  }
  sparks(x, y, z) { this.burst(x, y, z, 0xffc23e, 10, 7, 0.5, 1); }
  smoke(x, y, z) {
    if (this.rng() < 0.5) return;
    const mat = new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.5 });
    const m = new THREE.Mesh(this.smokeGeo, mat);
    m.position.set(x + randRange(this.rng, -0.5, 0.5), y, z + randRange(this.rng, -0.5, 0.5));
    this.scene.add(m);
    this.particles.push({ m, vx: 0, vy: 1.6, vz: 0, life: 1.4, maxLife: 1.4, gravity: 0, grow: true });
  }
  explosion(x, y, z) {
    this.burst(x, y, z, 0xff7a2a, 26, 12, 0.9, 1.6);
    this.burst(x, y, z, 0xffe27a, 14, 8, 0.6, 1.2);
    this.burst(x, y, z, 0x333333, 10, 4, 1.6, 2.2);
  }
  muzzle(pos) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
    m.position.copy(pos); this.scene.add(m);
    this.particles.push({ m, vx: 0, vy: 0, vz: 0, life: 0.07, maxLife: 0.07, gravity: 0 });
  }
  tracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.95 }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09, maxLife: 0.09 });
  }
  update(dt, t) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.scene.remove(p.m); this.particles.splice(i, 1); continue; }
      p.vy += (p.gravity || 0) * dt;
      p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      if (p.grow) p.m.scale.addScalar(dt * 1.4);
      p.m.material.opacity = Math.max(0.05, p.life / p.maxLife);
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.life -= dt;
      if (tr.life <= 0) { this.scene.remove(tr.line); tr.line.geometry.dispose(); tr.line.material.dispose(); this.tracers.splice(i, 1); continue; }
      tr.line.material.opacity = tr.life / tr.maxLife;
    }
    if (this.marker.visible) {
      this.marker.rotation.y += dt * 2;
      this.marker.position.y = 10 + Math.sin(t * 2) * 0.8;
    }
  }
}
