// Combat: Vex's pistol (12-round mag, click to fire), her fists, and the rival
// gang shooters who guard the final drop.
import { clamp, dist, makeRng, randRange } from './utils.js';

function makeRival(rng) {
  const g = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: 0x1f1f26 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5a });
  const band = new THREE.MeshLambertMaterial({ color: 0xd82020 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.78, 0.36), dark);
  torso.position.y = 1.06; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), skin);
  head.position.y = 1.64; g.add(head);
  const bandana = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.12, 0.52), band);
  bandana.position.y = 1.72; g.add(bandana);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.72, 0.25), dark);
  legL.position.set(-0.17, 0.36, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.17; g.add(legR);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.5), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  gun.position.set(0.4, 1.1, 0.3); g.add(gun);
  return g;
}

export class Combat {
  constructor(scene, camera, solids, fx, sound, police) {
    this.scene = scene; this.camera = camera; this.solids = solids;
    this.fx = fx; this.sound = sound; this.police = police;
    this.rng = makeRng(5150);
    this.enemies = [];
    this.ammo = 12; this.magSize = 12; this.reloadTimer = 0;
    this.shotCooldown = 0; this.crimeCooldown = 0;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 140;
  }
  spawnEnemies(x, z, n) {
    for (let i = 0; i < n; i++) {
      const model = makeRival(this.rng);
      const ex = x + randRange(this.rng, -14, 14), ez = z + randRange(this.rng, -14, 14);
      model.position.set(ex, 0, ez);
      this.scene.add(model);
      this.enemies.push({ model, x: ex, z: ez, health: 60, shootTimer: 1 + this.rng() * 1.5, dead: false, strafeDir: this.rng() < 0.5 ? 1 : -1 });
    }
  }
  aliveEnemies() { return this.enemies.filter((e) => !e.dead).length; }
  // Player fires the pistol from the camera through the crosshair.
  shoot(player, pedestrians, playerCar) {
    if (this.shotCooldown > 0 || this.reloadTimer > 0) return;
    if (this.ammo <= 0) { this.sound.blip(180, 0.08, 'square', 0.12); this.reload(); return; }
    this.ammo--; this.shotCooldown = 0.22;
    this.sound.gunshot();
    this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
    const origin = this.raycaster.ray.origin, dir = this.raycaster.ray.direction;
    // nearest solid hit caps the shot
    const solidHits = this.raycaster.intersectObjects(this.solids, false);
    let maxDist = solidHits.length ? solidHits[0].distance : 140;
    let hitPoint = origin.clone().add(dir.clone().multiplyScalar(maxDist));
    let hitEnemy = null, hitPed = null, hitCop = null;
    // ray vs enemy/ped/cop spheres, on foot
    const testSphere = (x, y, z, r) => {
      const ox = x - origin.x, oy = y - origin.y, oz = z - origin.z;
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      if (t < 0 || t > maxDist) return -1;
      const cx = origin.x + dir.x * t, cy = origin.y + dir.y * t, cz = origin.z + dir.z * t;
      const d2 = (cx - x) ** 2 + (cy - y) ** 2 + (cz - z) ** 2;
      return d2 < r * r ? t : -1;
    };
    let bestT = maxDist;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const t = testSphere(e.x, 1.2, e.z, 1.1);
      if (t > 0 && t < bestT) { bestT = t; hitEnemy = e; hitPed = null; hitCop = null; }
    }
    for (const p of pedestrians.people) {
      if (p.dead) continue;
      const t = testSphere(p.x, 1.1, p.z, 0.9);
      if (t > 0 && t < bestT) { bestT = t; hitPed = p; hitEnemy = null; hitCop = null; }
    }
    for (const c of this.police.cruisers) {
      const t = testSphere(c.x, 1.0, c.z, 2.4);
      if (t > 0 && t < bestT) { bestT = t; hitCop = c; hitEnemy = null; hitPed = null; }
    }
    if (bestT < maxDist) hitPoint = origin.clone().add(dir.clone().multiplyScalar(bestT));
    const muzzle = origin.clone().add(dir.clone().multiplyScalar(1.2));
    this.fx.tracer(muzzle, hitPoint);
    this.fx.muzzle(muzzle);
    if (hitEnemy) {
      hitEnemy.health -= 34;
      this.fx.sparks(hitPoint.x, hitPoint.y, hitPoint.z);
      if (hitEnemy.health <= 0) {
        hitEnemy.dead = true;
        hitEnemy.model.rotation.x = -Math.PI / 2; hitEnemy.model.position.y = 0.25;
      }
    } else if (hitPed) {
      hitPed.dead = true;
      pedestrians.scare(hitPed.x, hitPed.z, 30);
      this.police.crime(1);
    } else if (hitCop) {
      hitCop.health -= 25;
      this.fx.sparks(hitPoint.x, hitPoint.y, hitPoint.z);
      this.police.crime(1);
    } else if (solidHits.length) {
      this.fx.sparks(hitPoint.x, hitPoint.y, hitPoint.z);
    }
    if (this.crimeCooldown <= 0) { this.police.crime(1); this.crimeCooldown = 3; }
    pedestrians.scare(player.x, player.z, 40);
  }
  reload() {
    if (this.reloadTimer > 0 || this.ammo === this.magSize) return;
    this.reloadTimer = 1.1;
    this.sound.blip(500, 0.06, 'square', 0.12);
  }
  // Fists: a short arc in front of the player.
  punch(player, pedestrians) {
    const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
    let hitAny = false;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.x - player.x, dz = e.z - player.z;
      if (Math.hypot(dx, dz) < 2.4 && dx * fx + dz * fz > 0) {
        e.health -= 25; hitAny = true;
        this.fx.sparks(e.x, 1.2, e.z);
        if (e.health <= 0) { e.dead = true; e.model.rotation.x = -Math.PI / 2; e.model.position.y = 0.25; }
      }
    }
    for (const p of pedestrians.people) {
      if (p.dead) continue;
      const dx = p.x - player.x, dz = p.z - player.z;
      if (Math.hypot(dx, dz) < 2.2 && dx * fx + dz * fz > 0) {
        p.dead = true; hitAny = true;
        pedestrians.scare(p.x, p.z, 30);
        this.police.crime(1);
      }
    }
    if (hitAny) this.sound.punch();
  }
  update(dt, player, now) {
    this.shotCooldown = Math.max(0, this.shotCooldown - dt);
    this.crimeCooldown = Math.max(0, this.crimeCooldown - dt);
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) { this.ammo = this.magSize; this.sound.blip(700, 0.08, 'sine', 0.15); }
    }
    // rivals shoot back
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = dist(e.x, e.z, player.x, player.z);
      e.model.lookAt(player.x, 0, player.z);
      if (d < 46 && !player.inCar) {
        e.shootTimer -= dt;
        if (e.shootTimer <= 0) {
          e.shootTimer = 1.3 + this.rng() * 1.2;
          const from = new THREE.Vector3(e.x, 1.3, e.z);
          const to = new THREE.Vector3(player.x + randRange(this.rng, -1.5, 1.5), 1.2, player.z + randRange(this.rng, -1.5, 1.5));
          this.fx.tracer(from, to);
          this.sound.noiseBurst(0.1, 0.2, 2600);
          const hitChance = clamp(0.55 - d / 100, 0.1, 0.5);
          if (this.rng() < hitChance) {
            player.hurt(8 + this.rng() * 7, now);
            this.fx.sparks(player.x, 1.2, player.z);
          }
        }
      }
      // strafe slowly to stay lively
      if (d < 46) {
        e.x += Math.sin(e.model.rotation.y + Math.PI / 2) * e.strafeDir * 0.8 * dt;
        e.z += Math.cos(e.model.rotation.y + Math.PI / 2) * e.strafeDir * 0.8 * dt;
        if (this.rng() < dt * 0.3) e.strafeDir *= -1;
        e.model.position.set(e.x, 0, e.z);
      }
    }
  }
}
