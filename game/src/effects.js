// Short-lived visuals: tracers, muzzle flashes, smoke, explosions, sparks.
// Everything here is created, aged and removed; nothing persists.

/** A soft round sprite texture, painted once and shared. */
function softTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createEffects(G) {
  const fx = {
    tex: softTexture(),
    tracers: [],
    flashes: [],
    particles: [],
  };
  // The one-shot effects are called as methods on this object
  // (G.effects.smoke(G, ...)) from the systems that trigger them.
  fx.smoke = smoke;
  fx.explosion = explosion;
  fx.tracer = tracer;
  fx.muzzleFlash = muzzleFlash;
  fx.spark = spark;
  fx.blood = blood;
  return fx;
}

function addSprite(G, x, y, z, color, scale, life, rise, grow) {
  const mat = new THREE.SpriteMaterial({
    map: G.effects.tex,
    color,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.position.set(x, y, z);
  s.scale.setScalar(scale);
  G.scene.add(s);
  G.effects.particles.push({
    sprite: s,
    life,
    maxLife: life,
    rise,
    grow,
    vx: (Math.random() - 0.5) * 2,
    vz: (Math.random() - 0.5) * 2,
  });
}

/** A bright line from muzzle to hit point, gone in a blink. */
export function tracer(G, from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const mat = new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.95 });
  const line = new THREE.Line(geo, mat);
  G.scene.add(line);
  G.effects.tracers.push({ line, life: 0.09 });
}

/** A muzzle flash: a bright sprite and a brief light. */
export function muzzleFlash(G, pos) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: G.effects.tex,
    color: 0xffd75e,
    transparent: true,
    opacity: 1,
    depthWrite: false,
  }));
  s.position.copy(pos);
  s.scale.setScalar(1.6);
  G.scene.add(s);
  const light = new THREE.PointLight(0xffc040, 12, 12);
  light.position.copy(pos);
  G.scene.add(light);
  G.effects.flashes.push({ sprite: s, light, life: 0.07 });
}

/** A puff of grey smoke that rises and spreads. */
export function smoke(G, x, y, z, n) {
  for (let i = 0; i < n; i++) {
    addSprite(G, x + (Math.random() - 0.5) * 1.5, y + Math.random() * 0.8, z + (Math.random() - 0.5) * 1.5, 0x555555, 1.2 + Math.random(), 1.4 + Math.random() * 0.8, 1.6, 1.5);
  }
}

/** A car explosion: flash, fireball, light and a smoke column. */
export function explosion(G, x, y, z) {
  addSprite(G, x, y + 1, z, 0xff8830, 5, 0.5, 0, -2);
  addSprite(G, x, y + 1.5, z, 0xffd75e, 3.5, 0.35, 0, -1);
  const light = new THREE.PointLight(0xff7730, 60, 30);
  light.position.set(x, y + 2, z);
  G.scene.add(light);
  G.effects.flashes.push({ sprite: null, light, life: 0.4 });
  smoke(G, x, y + 1, z, 10);
  G.audio.crash(1);
}

/** Bright sparks where a bullet hits a wall. */
export function spark(G, x, y, z) {
  for (let i = 0; i < 5; i++) {
    addSprite(G, x, y, z, 0xffe9a0, 0.5, 0.25 + Math.random() * 0.15, 0.5, -0.5);
  }
}

/** A dark red puff where a rival is hit. */
export function blood(G, x, y, z) {
  for (let i = 0; i < 4; i++) {
    addSprite(G, x, y, z, 0x880000, 0.7, 0.4, 0.3, 0.5);
  }
}

/** Age every effect and remove the spent ones. */
export function updateEffects(G, dt) {
  const fx = G.effects;
  for (let i = fx.tracers.length - 1; i >= 0; i--) {
    const t = fx.tracers[i];
    t.life -= dt;
    t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.95;
    if (t.life <= 0) {
      G.scene.remove(t.line);
      t.line.geometry.dispose();
      t.line.material.dispose();
      fx.tracers.splice(i, 1);
    }
  }
  for (let i = fx.flashes.length - 1; i >= 0; i--) {
    const f = fx.flashes[i];
    f.life -= dt;
    if (f.sprite) {
      f.sprite.material.opacity = Math.max(0, f.life / 0.07);
      f.sprite.scale.multiplyScalar(1 + dt * 6);
    }
    if (f.light) f.light.intensity = Math.max(0, f.life * 150);
    if (f.life <= 0) {
      if (f.sprite) {
        G.scene.remove(f.sprite);
        f.sprite.material.dispose();
      }
      if (f.light) G.scene.remove(f.light);
      fx.flashes.splice(i, 1);
    }
  }
  for (let i = fx.particles.length - 1; i >= 0; i--) {
    const p = fx.particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      G.scene.remove(p.sprite);
      p.sprite.material.dispose();
      fx.particles.splice(i, 1);
      continue;
    }
    const k = p.life / p.maxLife;
    p.sprite.material.opacity = 0.9 * k;
    p.sprite.position.y += p.rise * dt;
    p.sprite.position.x += p.vx * dt;
    p.sprite.position.z += p.vz * dt;
    const s = Math.max(0.1, p.sprite.scale.x + p.grow * dt);
    p.sprite.scale.setScalar(s);
  }
}
