// Velvet Bay itself: the road grid, the buildings, the beach, the ocean, the
// pier, the parks, the billboards and the golden-hour sky. Everything is
// procedural, so the city is the same on every load.

import { clamp, pick, rand } from './utils.js';

/** A tiny seeded random, so the city layout never changes between loads. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A canvas texture painted by a callback. */
function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** The city's layout, shared by the missions and the traffic. */
export const CITY = {
  /** Streets run at these x and z coordinates. */
  streets: [-156, -104, -52, 0, 52, 104, 156],
  /** Block centers between the streets. */
  blocks: [-130, -78, -26, 26, 78, 130],
  /** A block is this wide; a road is this wide. */
  blockSize: 40,
  roadWidth: 12,
  /** West of this x is sand; west of oceanX is water. */
  sandX: -168,
  oceanX: -210,
  /** The pier runs along z = 0 from the beach into the ocean. */
  pier: { z: 0, fromX: -168, toX: -236, width: 12 },
  /** Where the story's places are. */
  pierEnd: { x: -228, z: 0 },
  chopShop: { x: -78, z: 130 },
  dropSpot: { x: 130, z: -78 },
  taxiStand: { x: 52, z: 26 },
  bayTower: { x: 26, z: 26 },
};

/** Build the city into the scene. Returns its colliders and key places. */
export function createCity(G) {
  const scene = G.scene;
  const rng = mulberry32(20261119);
  const colliders = [];

  // Golden-hour sky: a warm haze, a low sun and a soft fog.
  scene.background = new THREE.Color(0xf7b267);
  scene.fog = new THREE.Fog(0xf2a65a, 220, 620);
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.4);
  sun.position.set(-180, 120, 90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 700;
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xffe0b3, 0x5a4a3a, 0.9);
  scene.add(hemi);
  // A visible sun disc low in the west.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(26, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff2c0, fog: false })
  );
  sunDisc.position.set(-420, 95, 60);
  sunDisc.lookAt(0, 40, 0);
  scene.add(sunDisc);

  // Ground: dry grass under everything, then the roads, sidewalks, sand
  // and ocean laid on top of it, each a little higher to avoid z-fighting.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 700),
    new THREE.MeshLambertMaterial({ color: 0x8a7a55 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Roads: dark asphalt strips with a dashed center line, one per street.
  const roadTex = canvasTexture(64, 256, (g, w, h) => {
    g.fillStyle = '#2e2e33';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#3a3a40';
    g.fillRect(0, 0, w, 6);
    g.fillRect(0, h - 6, w, 6);
    g.fillStyle = '#e8d44d';
    g.fillRect(w / 2 - 2, 0, 4, 34);
    g.fillRect(w / 2 - 2, 64, 4, 34);
    g.fillRect(w / 2 - 2, 128, 4, 34);
    g.fillRect(w / 2 - 2, 192, 4, 34);
  });
  roadTex.wrapS = THREE.RepeatWrapping;
  roadTex.wrapT = THREE.RepeatWrapping;
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  for (const s of CITY.streets) {
    for (const [w, d, x, z, ry] of [
      [CITY.roadWidth, 380, s, 0, 0],
      [380, CITY.roadWidth, 0, s, 0],
    ]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(x, 0.02, z);
      road.receiveShadow = true;
      scene.add(road);
    }
  }
  // Sidewalks: pale strips edging every road.
  const walkMat = new THREE.MeshLambertMaterial({ color: 0xb8b0a0 });
  for (const s of CITY.streets) {
    for (const [w, d, x, z] of [
      [3, 380, s - 7.5, 0],
      [3, 380, s + 7.5, 0],
      [380, 3, 0, s - 7.5],
      [380, 3, 0, s + 7.5],
    ]) {
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(w, d), walkMat);
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(x, 0.04, z);
      walk.receiveShadow = true;
      scene.add(walk);
    }
  }

  // Sand and ocean on the west edge, with a slow wave texture.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 380),
    new THREE.MeshLambertMaterial({ color: 0xe0c98f })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(-192, 0.03, 0);
  sand.receiveShadow = true;
  scene.add(sand);
  const waveTex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#2e6f9e';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 3;
    for (let y = 0; y < h; y += 22) {
      g.beginPath();
      for (let x = 0; x <= w; x += 16) {
        const yy = y + Math.sin((x / w) * Math.PI * 2 + y) * 5;
        if (x === 0) g.moveTo(x, yy);
        else g.lineTo(x, yy);
      }
      g.stroke();
    }
  });
  waveTex.wrapS = THREE.RepeatWrapping;
  waveTex.wrapT = THREE.RepeatWrapping;
  waveTex.repeat.set(6, 6);
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 700),
    new THREE.MeshLambertMaterial({ map: waveTex })
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(-340, -0.08, 0);
  scene.add(ocean);

  // The pier: a wooden deck into the ocean, with railings and moored boats.
  const pierGroup = new THREE.Group();
  const deckMat = new THREE.MeshLambertMaterial({ color: 0x8a6a45 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(68, 0.5, CITY.pier.width), deckMat);
  deck.position.set(-202, 0.25, 0);
  deck.castShadow = true;
  deck.receiveShadow = true;
  pierGroup.add(deck);
  const railMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
  for (const z of [-5.5, 5.5]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(68, 1, 0.4), railMat);
    rail.position.set(-202, 0.9, z);
    pierGroup.add(rail);
  }
  for (let x = -170; x >= -232; x -= 8) {
    for (const z of [-5, 5]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.6, 6), railMat);
      post.position.set(x, -0.3, z);
      pierGroup.add(post);
    }
  }
  // Moored boats: a hull, a cabin and a mast each.
  const boatMat = new THREE.MeshLambertMaterial({ color: 0xd8d8d8 });
  const boatMat2 = new THREE.MeshLambertMaterial({ color: 0xc05a3a });
  for (const [bx, bz, mat] of [[-214, -16, boatMat], [-222, 18, boatMat2], [-206, 26, boatMat]]) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(9, 1.6, 3.4), mat);
    hull.position.y = 0.4;
    boat.add(hull);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.6, 2.4), new THREE.MeshLambertMaterial({ color: 0x3a5a7a }));
    cabin.position.set(-0.5, 1.8, 0);
    boat.add(cabin);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 6), railMat);
    mast.position.set(1.5, 3.5, 0);
    boat.add(mast);
    boat.position.set(bx, -0.1, bz);
    boat.rotation.y = rand(-0.2, 0.2);
    pierGroup.add(boat);
  }
  scene.add(pierGroup);

  // Facade textures: lit windows on a colored wall, a few variants.
  const facadeTexs = [];
  const wallColors = ['#b08a6a', '#7a8a9a', '#9a7a8a', '#6a7a6a', '#a89878'];
  for (let v = 0; v < 5; v++) {
    facadeTexs.push(canvasTexture(128, 256, (g, w, h) => {
      g.fillStyle = wallColors[v];
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(0, 0, w, 10);
      for (let y = 24; y < h - 12; y += 30) {
        for (let x = 12; x < w - 12; x += 26) {
          const lit = rng() < 0.55;
          g.fillStyle = lit ? '#ffd98a' : '#2a3440';
          g.fillRect(x, y, 16, 20);
        }
      }
    }));
  }

  // Buildings: one per block, taller toward downtown, plus the Bay Tower
  // and four parks. Each building is one collider box.
  const parkBlocks = new Set(['-130,-130', '130,130', '-130,130', '78,-130']);
  const treeMat = new THREE.MeshLambertMaterial({ color: 0x3a6a2a });
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a4028 });
  const grassMat = new THREE.MeshLambertMaterial({ color: 0x5a7a3a });
  for (const bx of CITY.blocks) {
    for (const bz of CITY.blocks) {
      const key = bx + ',' + bz;
      if (parkBlocks.has(key)) {
        const grass = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), grassMat);
        grass.rotation.x = -Math.PI / 2;
        grass.position.set(bx, 0.05, bz);
        grass.receiveShadow = true;
        scene.add(grass);
        for (let t = 0; t < 5; t++) {
          const tx = bx + rand(-14, 14);
          const tz = bz + rand(-14, 14);
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 2.5, 6), trunkMat);
          trunk.position.set(tx, 1.25, tz);
          trunk.castShadow = true;
          scene.add(trunk);
          const top = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5, 8), treeMat);
          top.position.set(tx, 4.8, tz);
          top.castShadow = true;
          scene.add(top);
        }
        continue;
      }
      const distCenter = Math.abs(bx) + Math.abs(bz);
      const isTower = bx === CITY.bayTower.x && bz === CITY.bayTower.z;
      const h = isTower ? 120 : distCenter <= 52 ? rand(28, 58) : distCenter <= 104 ? rand(14, 30) : rand(8, 18);
      const fw = rand(24, 34);
      const fd = rand(24, 34);
      const tex = pick(facadeTexs);
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      const b = new THREE.Mesh(new THREE.BoxGeometry(fw, h, fd), mat);
      b.position.set(bx, h / 2, bz);
      b.castShadow = true;
      b.receiveShadow = true;
      scene.add(b);
      // Rooftop box, so the roofline is not a bare slab.
      const roof = new THREE.Mesh(new THREE.BoxGeometry(fw * 0.4, 2.5, fd * 0.4), new THREE.MeshLambertMaterial({ color: 0x555550 }));
      roof.position.set(bx, h + 1.25, bz);
      roof.castShadow = true;
      scene.add(roof);
      colliders.push({ minX: bx - fw / 2, maxX: bx + fw / 2, minZ: bz - fd / 2, maxZ: bz + fd / 2 });
      if (isTower) {
        // The Bay Tower's lit crown.
        const crown = new THREE.Mesh(
          new THREE.BoxGeometry(fw * 0.5, 6, fd * 0.5),
          new THREE.MeshLambertMaterial({ color: 0x223344, emissive: 0x446688 })
        );
        crown.position.set(bx, h + 5.5, bz);
        scene.add(crown);
      }
    }
  }

  // Billboards with original ads, along the beach boulevard and downtown.
  const ads = [
    { bg: '#c0392b', fg: '#ffffff', big: 'VELVET', small: 'COLA — TASTE THE BAY' },
    { bg: '#1a7a6a', fg: '#ffe9a0', big: 'SUNSET', small: 'SURF SHOP • PIER 9' },
    { bg: '#2c3e50', fg: '#f0c040', big: "DANTE'S", small: 'AUTO & PAWN — CASH TODAY' },
    { bg: '#6a3a7a', fg: '#ffffff', big: 'BAY TOWER', small: 'HOTEL • ROOMS WITH A VIEW' },
  ];
  const billboards = [];
  const adSpots = [
    [-164, -60, Math.PI / 2], [-164, 60, Math.PI / 2], [-164, 120, Math.PI / 2],
    [26, -52, 0], [104, 52, Math.PI],
  ];
  for (let i = 0; i < adSpots.length; i++) {
    const ad = ads[i % ads.length];
    const tex = canvasTexture(256, 128, (g, w, h) => {
      g.fillStyle = ad.bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = ad.fg;
      g.font = 'bold 44px sans-serif';
      g.textAlign = 'center';
      g.fillText(ad.big, w / 2, 58);
      g.font = 'bold 20px sans-serif';
      g.fillText(ad.small, w / 2, 96);
    });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 12, 8), new THREE.MeshLambertMaterial({ color: 0x444444 }));
    const [bx, bz, ry] = adSpots[i];
    pole.position.set(bx, 6, bz);
    pole.castShadow = true;
    scene.add(pole);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(22, 11),
      new THREE.MeshLambertMaterial({ map: tex, emissive: 0x222222 })
    );
    board.position.set(bx, 17, bz);
    board.rotation.y = ry;
    scene.add(board);
    billboards.push(board);
    colliders.push({ minX: bx - 0.8, maxX: bx + 0.8, minZ: bz - 0.8, maxZ: bz + 0.8 });
  }

  // Street lamps along the beach boulevard and the main roads.
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  const lampHeadMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xffd970 });
  for (let z = -156; z <= 156; z += 52) {
    for (const x of [-160, -148]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 7, 6), lampMat);
      pole.position.set(x, 3.5, z);
      scene.add(pole);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), lampHeadMat);
      head.position.set(x, 7.1, z);
      scene.add(head);
    }
  }

  // Drifting clouds: flat white blobs high up.
  const clouds = [];
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 9; i++) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(rng() * 3);
    for (let p = 0; p < puffs; p++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(rand(6, 12), 10, 8), cloudMat);
      s.position.set(p * rand(6, 10) - puffs * 4, rand(-1, 1.5), rand(-3, 3));
      s.scale.y = 0.45;
      cloud.add(s);
    }
    cloud.position.set(rand(-320, 320), rand(90, 150), rand(-300, 300));
    scene.add(cloud);
    clouds.push(cloud);
  }

  const city = {
    colliders,
    waveTex,
    clouds,
    pier: CITY.pier,
    pierEnd: CITY.pierEnd,
    chopShop: CITY.chopShop,
    dropSpot: CITY.dropSpot,
    taxiStand: CITY.taxiStand,
    bayTower: CITY.bayTower,
  };

  // Palm trees along the beach boulevard, for the drive shot.
  const palmTrunk = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const palmLeaf = new THREE.MeshLambertMaterial({ color: 0x2a7a3a });
  for (let z = -150; z <= 150; z += 30) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 7, 6), palmTrunk);
    trunk.position.set(-166, 3.5, z);
    trunk.rotation.z = 0.15;
    trunk.castShadow = true;
    scene.add(trunk);
    for (let f = 0; f < 5; f++) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.5, 4), palmLeaf);
      const a = (f / 5) * Math.PI * 2;
      frond.position.set(-166 + Math.cos(a) * 1.6, 7.2, z + Math.sin(a) * 1.6);
      frond.rotation.z = Math.cos(a) * 1.1;
      frond.rotation.x = Math.sin(a) * 1.1;
      scene.add(frond);
    }
  }

  return city;
}

/** Per-frame life: the ocean slides and the clouds drift. */
export function updateCity(G, dt) {
  const city = G.city;
  if (!city) return;
  city.waveTex.offset.x += dt * 0.008;
  city.waveTex.offset.y += dt * 0.004;
  for (const c of city.clouds) {
    c.position.x += dt * 1.6;
    if (c.position.x > 340) c.position.x = -340;
  }
}
