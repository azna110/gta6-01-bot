// The law: a wanted level that rises with crimes and decays when Vex lies low,
// plus the black-and-white cruisers that chase, ram, and try to bust her.
import { clamp, dist, makeRng } from './utils.js';
import { makeCarModel } from './vehicles.js';

export class Police {
  constructor(scene, colliders) {
    this.scene = scene; this.colliders = colliders; this.rng = makeRng(31337);
    this.wanted = 0;
    this.cruisers = [];
    this.quietTimer = 0;   // seconds since the last crime
    this.decayTimer = 0;
    this.bustTimer = 0;
    this.flash = 0;
  }
  crime(level) {
    if (level <= 0) return;
    this.wanted = clamp(this.wanted + level, 0, 5);
    this.quietTimer = 0; this.decayTimer = 0;
  }
  wantedCount() { return this.wanted; }
  spawnCruiser(x, z) {
    const model = makeCarModel(0x1a1d24, true);
    // white doors: a thin white box over the body sides
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.5, 2.4), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
    door.position.y = 0.85; model.add(door);
    model.position.set(x, 0, z);
    this.scene.add(model);
    const c = { model, wheels: model.userData.wheels, x, z, heading: 0, speed: 0, health: 100 };
    this.cruisers.push(c);
    return c;
  }
  update(dt, player, playerCar, now) {
    this.flash += dt;
    // decay: quiet for 25 s and no cruiser close, then lose a star every 10 s
    this.quietTimer += dt;
    let nearest = 9999;
    for (const c of this.cruisers) nearest = Math.min(nearest, dist(player.x, player.z, c.x, c.z));
    if (this.wanted > 0 && this.quietTimer > 25 && nearest > 60) {
      this.decayTimer += dt;
      if (this.decayTimer > 10) { this.wanted--; this.decayTimer = 0; }
    }
    // keep the cruiser count matched to the wanted level
    const want = this.wanted >= 1 ? Math.min(4, this.wanted + 1) : 0;
    while (this.cruisers.length < want) {
      const a = this.rng() * Math.PI * 2;
      const sx = clamp(player.x + Math.sin(a) * 90, -290, 290);
      const sz = clamp(player.z + Math.cos(a) * 90, -290, 290);
      this.spawnCruiser(sx, sz);
    }
    while (this.cruisers.length > want) {
      const c = this.cruisers.pop();
      this.scene.remove(c.model);
    }
    // light-bar flash
    const phase = Math.floor(this.flash * 4) % 2 === 0;
    for (const c of this.cruisers) {
      if (c.model.userData.lightRed) c.model.userData.lightRed.material.emissive.setHex(phase ? 0xff0000 : 0x330000);
      if (c.model.userData.lightBlue) c.model.userData.lightBlue.material.emissive.setHex(phase ? 0x000033 : 0x0022ff);
    }
    // chase: steer toward the player, ram at close range
    for (const c of this.cruisers) {
      const tx = player.x, tz = player.z;
      const wantHeading = Math.atan2(tx - c.x, tz - c.z);
      let dh = wantHeading - c.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      c.heading += clamp(dh, -1.9 * dt, 1.9 * dt);
      const d = dist(tx, tz, c.x, c.z);
      const targetSpeed = d > 6 ? clamp(26 + this.wanted * 2.5, 0, 40) : 10;
      c.speed += clamp(targetSpeed - c.speed, -14 * dt, 9 * dt);
      c.x += Math.sin(c.heading) * c.speed * dt;
      c.z += Math.cos(c.heading) * c.speed * dt;
      c.x = clamp(c.x, -296, 340); c.z = clamp(c.z, -296, 420);
      c.model.position.set(c.x, 0, c.z);
      c.model.rotation.y = c.heading;
      const spin = c.speed * dt / 0.42;
      for (const w of c.wheels) w.rotation.x += spin;
      // ram the player's car
      if (playerCar && d < 4.6) {
        const push = 3.2;
        playerCar.car.x += Math.sin(c.heading) * push * dt * 8;
        playerCar.car.z += Math.cos(c.heading) * push * dt * 8;
        playerCar.car.speed *= 0.94;
        playerCar.car.health -= 6 * dt;
      }
      // bust: on foot, slow, and a cruiser right on top of her
      if (!playerCar && d < 3.2 && player.speed < 2) {
        this.bustTimer += dt;
      } else this.bustTimer = 0;
    }
    return { busted: this.bustTimer > 2.5, nearestCruiser: nearest };
  }
  clear() {
    this.wanted = 0; this.bustTimer = 0; this.quietTimer = 0;
    for (const c of this.cruisers) this.scene.remove(c.model);
    this.cruisers = [];
  }
}
