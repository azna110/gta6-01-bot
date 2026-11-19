// Velvet Bay itself: a sun-soaked coastal grid city, built procedurally from canvas
// textures. Every building, road, palm and billboard is original geometry — no assets.
import { makeRng, pick, randRange } from './utils.js';

export const PITCH = 80;            // distance between road centerlines
export const ROAD_HALF = 8;         // half width of a road
export const ROADS = [-280, -200, -120, -40, 40, 120, 200, 280];
export const CITY_MIN = -300, CITY_MAX = 300;

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function facadeTex(rng, base, lit) {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const cols = 5 + Math.floor(rng() * 3), rows = 9 + Math.floor(rng() * 5);
    const cw = w / cols, ch = h / rows;
    for (let x = 0; x < cols; x++) for (let y = 0; y < rows; y++) {
      const on = rng() < 0.55;
      g.fillStyle = on ? (lit ? '#ffe9a8' : '#9fd8ef') : '#1d2733';
      g.fillRect(x * cw + 4, y * ch + 5, cw - 8, ch - 10);
    }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, h - 10, w, 10);
  });
}
function roadTex() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#33363d'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3d4048';
    for (let i = 0; i < 40; i++) g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    g.fillStyle = '#e8c33a'; g.fillRect(w / 2 - 2, 8, 4, 26); g.fillRect(w / 2 - 2, 62, 4, 26);
    g.fillStyle = '#e8e8e8'; g.fillRect(6, 0, 2, h); g.fillRect(w - 8, 0, 2, h);
  });
}
function sidewalkTex() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#8f8b80'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#7a766c'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke(); g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.stroke(); }
  });
}
function sandTex() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#e8d5a0'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#dcc98f';
    for (let i = 0; i < 120; i++) g.fillRect(Math.random() * w, Math.random() * h, 3, 2);
  });
}
function waterTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#1e7fa8'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
    for (let i = 0; i < 26; i++) {
      g.beginPath(); const y = Math.random() * h;
      g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y - 6, w * 0.6, y + 6, w, y); g.stroke();
    }
  });
}
function billboardTex(lines, bg, fg) {
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = 'bold 30px Trebuchet MS, sans-serif'; g.textAlign = 'center';
    lines.forEach((s, i) => g.fillText(s, w / 2, 52 + i * 36));
  });
}

export function buildCity(scene) {
  const rng = makeRng(20261119);
  const colliders = [];
  const solids = []; // building meshes, for the pistol's line-of-sight raycast
  const group = new THREE.Group();
  scene.add(group);
  const lam = (c, extra) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, extra || {}));

  // --- lighting: low golden sun, warm sky, soft fog ---
  const sun = new THREE.DirectionalLight(0xffe6b0, 2.6);
  sun.position.set(180, 260, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -340; sun.shadow.camera.right = 340;
  sun.shadow.camera.top = 340; sun.shadow.camera.bottom = -340;
  sun.shadow.camera.far = 800; sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a6f4d, 1.1));
  scene.background = new THREE.Color(0x87bfe8);
  scene.fog = new THREE.Fog(0x9fc8e8, 320, 900);

  // --- ground, roads, sidewalks, beach, ocean ---
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), lam(0x7d8a6a));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.05, 0); ground.receiveShadow = true;
  group.add(ground);
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex() });
  roadMat.map.wrapS = roadMat.map.wrapT = THREE.RepeatWrapping;
  for (const c of ROADS) {
    const ns = new THREE.Mesh(new THREE.PlaneGeometry(16, 640), roadMat.clone());
    ns.material.map = roadMat.map.clone(); ns.material.map.repeat.set(1, 40); ns.material.map.needsUpdate = true;
    ns.rotation.x = -Math.PI / 2; ns.position.set(c, 0, 0); ns.receiveShadow = true; group.add(ns);
    const ew = new THREE.Mesh(new THREE.PlaneGeometry(640, 16), roadMat.clone());
    ew.material.map = roadMat.map.clone(); ew.material.map.repeat.set(40, 1); ew.material.map.needsUpdate = true;
    ew.rotation.x = -Math.PI / 2; ew.position.set(0, 0.01, c); ew.receiveShadow = true; group.add(ew);
  }
  const walkMat = new THREE.MeshLambertMaterial({ map: sidewalkTex() });
  walkMat.map.wrapS = walkMat.map.wrapT = THREE.RepeatWrapping; walkMat.map.repeat.set(20, 20);
  const walk = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), walkMat);
  walk.rotation.x = -Math.PI / 2; walk.position.set(0, -0.02, 0); walk.receiveShadow = true; group.add(walk);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(640, 60), new THREE.MeshLambertMaterial({ map: sandTex() }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.02, 318); sand.receiveShadow = true; group.add(sand);
  const waterMat = new THREE.MeshLambertMaterial({ map: waterTex() });
  waterMat.map.wrapS = waterMat.map.wrapT = THREE.RepeatWrapping; waterMat.map.repeat.set(6, 2);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(760, 220), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.set(0, -0.4, 460); group.add(water);

  // --- buildings: one or two per block, downtown taller near the middle ---
  const facades = [
    facadeTex(rng, '#c9a37e', false), facadeTex(rng, '#9fb4c7', false),
    facadeTex(rng, '#b98d7a', true), facadeTex(rng, '#7e9a8a', false),
    facadeTex(rng, '#d8c49a', true), facadeTex(rng, '#8a94b8', false),
  ];
  const centers = [-240, -160, -80, 0, 80, 160, 240];
  const parks = new Set(['-240,-240', '240,240', '-240,240']);
  for (const bx of centers) for (const bz of centers) {
    const key = bx + ',' + bz;
    if (parks.has(key)) continue; // park blocks
    const downtown = Math.abs(bx) <= 80 && Math.abs(bz) <= 80;
    const h = downtown ? randRange(rng, 34, 68) : randRange(rng, 10, 30);
    const w = randRange(rng, 26, 44), d = randRange(rng, 26, 44);
    const tex = pick(rng, facades);
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    b.position.set(bx, h / 2, bz);
    b.castShadow = true; b.receiveShadow = true;
    group.add(b); solids.push(b);
    colliders.push({ minX: bx - w / 2, maxX: bx + w / 2, minZ: bz - d / 2, maxZ: bz + d / 2 });
    // rooftop box on tall towers
    if (h > 40) {
      const roof = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 8), lam(0x5a5f6a));
      roof.position.set(bx, h + 2.5, bz); roof.castShadow = true; group.add(roof);
    }
    // second smaller building on wide blocks
    if (rng() < 0.45 && !downtown) {
      const ox = bx + (rng() < 0.5 ? -18 : 18), oz = bz + (rng() < 0.5 ? -16 : 16);
      const h2 = randRange(rng, 8, 16);
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(16, h2, 14), new THREE.MeshLambertMaterial({ map: pick(rng, facades) }));
      b2.position.set(ox, h2 / 2, oz); b2.castShadow = true; b2.receiveShadow = true; group.add(b2); solids.push(b2);
      colliders.push({ minX: ox - 8, maxX: ox + 8, minZ: oz - 7, maxZ: oz + 7 });
    }
  }

  // --- Bay Tower landmark at the city heart ---
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(14, 18, 110, 12), new THREE.MeshLambertMaterial({ color: 0x6f87a8 }));
  tower.position.set(0, 55, -240); tower.castShadow = true; group.add(tower); solids.push(tower);
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.5, 22, 8), lam(0xffd23e));
  spire.position.set(0, 120, -240); group.add(spire);
  colliders.push({ minX: -18, maxX: 18, minZ: -258, maxZ: -222 });

  // --- parks: trees, benches, paths ---
  const trunkMat = lam(0x6b4a2a), leafMat = lam(0x3f8f4f);
  function palm(x, z, s) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * s, 0.8 * s, 7 * s, 6), trunkMat);
    trunk.position.y = 3.5 * s; trunk.castShadow = true; g.add(trunk);
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.6 * s, 4.5 * s, 5), leafMat);
      const a = (i / 5) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.6 * s, 7.4 * s, Math.sin(a) * 1.6 * s);
      leaf.rotation.z = Math.cos(a) * 1.1; leaf.rotation.x = -Math.sin(a) * 1.1;
      leaf.castShadow = true; g.add(leaf);
    }
    g.position.set(x, 0, z); group.add(g);
    colliders.push({ minX: x - 0.8, maxX: x + 0.8, minZ: z - 0.8, maxZ: z + 0.8 });
  }
  for (const [px, pz] of [[-240, -240], [240, 240], [-240, 240]]) {
    for (let i = 0; i < 7; i++) palm(px + randRange(rng, -24, 24), pz + randRange(rng, -24, 24), randRange(rng, 0.8, 1.3));
  }
  // palms lining the beach boulevard
  for (let x = -280; x <= 280; x += 40) { palm(x, 292, 1.1); if (x % 80 === 0) palm(x, -292, 1.0); }
  // street lamps along every road
  const lampMat = lam(0x2c2f36);
  for (const c of ROADS) for (let t = -260; t <= 260; t += 80) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 7, 6), lampMat);
    pole.position.set(c + 10, 3.5, t); pole.castShadow = true; group.add(pole);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xaa8833 }));
    head.position.set(c + 10, 7.1, t); group.add(head);
  }

  // --- billboards with original ads, along the beach boulevard ---
  const ads = [
    { lines: ['VELVET COLA', 'Taste the Bay'], bg: '#b03060', fg: '#ffffff' },
    { lines: ['SUNSET SURF', 'Board Rentals'], bg: '#1f7a8c', fg: '#ffe27a' },
    { lines: ['DANTE\'S', 'AUTO & PAWN'], bg: '#20242e', fg: '#ffd23e' },
  ];
  ads.forEach((ad, i) => {
    const tex = billboardTex(ad.lines, ad.bg, ad.fg);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(22, 11), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
    const x = [-160, 0, 160][i];
    board.position.set(x, 14, 300); board.rotation.y = Math.PI;
    group.add(board);
    const post = new THREE.Mesh(new THREE.BoxGeometry(1.5, 9, 1.5), lampMat);
    post.position.set(x, 4.5, 300); group.add(post);
  });

  // --- the pier: wooden deck reaching into the bay, with moored boats ---
  const deckMat = lam(0x8a6b45);
  for (let z = 348; z <= 420; z += 6) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(10, 0.6, 5.6), deckMat);
    plank.position.set(0, 0.6, z); plank.castShadow = true; group.add(plank);
  }
  const boatCols = [0xd84a4a, 0x4a7ad8, 0xe8e8e8];
  boatCols.forEach((col, i) => {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(4, 1.6, 10), lam(col));
    hull.position.y = 0.4; boat.add(hull);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 3.4), lam(0xf2f2f2));
    cab.position.set(0, 1.8, -1); boat.add(cab);
    boat.position.set(-16 + i * 16, 0, 400 + (i % 2) * 14);
    group.add(boat);
  });

  // --- sun disc + drifting clouds ---
  const sunBall = new THREE.Mesh(new THREE.SphereGeometry(14, 12, 10), new THREE.MeshBasicMaterial({ color: 0xfff3c0, fog: false }));
  sunBall.position.set(320, 190, -260); group.add(sunBall);
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  const clouds = [];
  for (let i = 0; i < 8; i++) {
    const cl = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(randRange(rng, 8, 16), 8, 6), cloudMat);
      s.position.set(j * 12 - 12, randRange(rng, -2, 2), randRange(rng, -4, 4)); s.scale.y = 0.45; cl.add(s);
    }
    cl.position.set(randRange(rng, -320, 320), randRange(rng, 120, 170), randRange(rng, -320, 320));
    group.add(cl); clouds.push(cl);
  }

  function update(dt, t) {
    waterMat.map.offset.x = (t * 0.004) % 1;
    waterMat.map.offset.y = (t * 0.002) % 1;
    for (const cl of clouds) cl.position.x += dt * 1.2;
  }
  return { colliders, solids, update, group };
}
