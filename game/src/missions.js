// The story: four jobs for Dante Reyes to pay off Lena's $2,000 debt to
// Silas Kade, then repeatable taxi fares. One beacon pillar marks the
// current objective, and the HUD shows its name and distance.

import { dist2D, money, rand, randInt } from './utils.js';
import { CITY } from './city.js';

const MISSIONS = [
  {
    name: 'First Gear',
    briefing: 'Meet Dante at the pier',
    pay: 200,
  },
  {
    name: 'The Pickup',
    briefing: 'Steal a car, deliver it to the chop shop',
    pay: 400,
  },
  {
    name: 'Hot Wheels',
    briefing: 'Reach 2 wanted stars, then lose them',
    pay: 600,
  },
  {
    name: 'The Drop',
    briefing: 'Deliver the package — three rivals guard it',
    pay: 1000,
  },
];

/** A tall glowing pillar that marks the objective from across the city. */
function buildBeacon() {
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffc040,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 70, 16, 1, true), mat);
  beacon.position.y = 35;
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.6),
    new THREE.MeshBasicMaterial({ color: 0xffd75e })
  );
  diamond.position.y = 72;
  beacon.add(diamond);
  return beacon;
}

export function createMissions(G) {
  const beacon = buildBeacon();
  beacon.position.set(CITY.pierEnd.x, 35, CITY.pierEnd.z);
  G.scene.add(beacon);
  const missions = {
    index: 0,
    phase: 0,
    beacon,
    fare: null,
    rivalsSpawned: false,
    spin: 0,
  };
  G.hud.showBanner(G, 'FIRST GEAR', MISSIONS[0].briefing);
  return missions;
}

/** Where the current objective is, for the beacon, the HUD and the minimap. */
export function currentObjective(G) {
  const m = G.missions;
  if (m.index < MISSIONS.length) {
    if (m.index === 0) return { x: CITY.pierEnd.x, z: CITY.pierEnd.z, label: 'PIER' };
    if (m.index === 1) return { x: CITY.chopShop.x, z: CITY.chopShop.z, label: 'CHOP SHOP' };
    if (m.index === 2) return { x: G.player.pos.x, z: G.player.pos.z, label: m.phase === 0 ? 'GET 2 STARS' : 'LOSE THE HEAT' };
    if (m.index === 3) return { x: CITY.dropSpot.x, z: CITY.dropSpot.z, label: 'DROP' };
  }
  if (m.fare) {
    if (m.fare.state === 'toPickup') return { x: m.fare.pickup.x, z: m.fare.pickup.z, label: 'PICKUP' };
    return { x: m.fare.dropoff.x, z: m.fare.dropoff.z, label: 'DROPOFF' };
  }
  return { x: CITY.taxiStand.x, z: CITY.taxiStand.z, label: 'TAXI' };
}

/** Pay the player and show the reward. */
function pay(G, amount, what) {
  const p = G.player;
  p.cash += amount;
  p.debt = Math.max(0, p.debt - amount);
  G.audio.chime();
  G.hud.showBanner(G, what, '+' + money(amount) + '  •  debt left ' + money(p.debt));
}

/** Start the next story mission, announcing it on the HUD. */
function startMission(G, i) {
  const m = G.missions;
  m.index = i;
  m.phase = 0;
  m.rivalsSpawned = false;
  const def = MISSIONS[i];
  G.hud.showBanner(G, def.name.toUpperCase(), def.briefing);
  if (i === 3) {
    G.combat.spawnRivals(G, CITY.dropSpot.x, CITY.dropSpot.z, 3);
    m.rivalsSpawned = true;
  }
}

/** A random sidewalk point for a taxi pickup. */
function pickupPoint() {
  const vertical = Math.random() < 0.5;
  const s = CITY.streets[Math.floor(Math.random() * CITY.streets.length)];
  const along = rand(-140, 140);
  const side = Math.random() < 0.5 ? -1 : 1;
  if (vertical) return { x: s + side * 8.5, z: along };
  return { x: along, z: s + side * 8.5 };
}

/** A random intersection for a taxi dropoff. */
function dropoffPoint() {
  return {
    x: CITY.streets[Math.floor(Math.random() * CITY.streets.length)],
    z: CITY.streets[Math.floor(Math.random() * CITY.streets.length)],
  };
}

/** Begin a taxi fare: a waiting passenger and a destination. */
function startFare(G) {
  const m = G.missions;
  const pickup = pickupPoint();
  const mesh = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.36), new THREE.MeshLambertMaterial({ color: 0xffd75e }));
  body.position.y = 0.9;
  body.castShadow = true;
  mesh.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), new THREE.MeshLambertMaterial({ color: 0xe8b88a }));
  head.position.y = 1.45;
  mesh.add(head);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.26), new THREE.MeshLambertMaterial({ color: 0x2a2a3a }));
  legs.position.y = 0.28;
  mesh.add(legs);
  mesh.position.set(pickup.x, 0, pickup.z);
  G.scene.add(mesh);
  m.fare = {
    pickup,
    dropoff: dropoffPoint(),
    pay: randInt(50, 110),
    state: 'toPickup',
    mesh,
  };
  G.hud.showBanner(G, 'TAXI FARE', 'Pick up the passenger in gold');
}

export function updateMissions(G, dt) {
  const m = G.missions;
  const p = G.player;
  // Spin the beacon's diamond.
  m.spin += dt;
  const diamond = m.beacon.children[0];
  if (diamond) {
    diamond.rotation.y = m.spin * 1.2;
    diamond.position.y = 72 + Math.sin(m.spin * 2) * 1.5;
  }
  const obj = currentObjective(G);
  m.beacon.position.x = obj.x;
  m.beacon.position.z = obj.z;
  m.beacon.visible = true;

  if (m.index < MISSIONS.length) {
    const def = MISSIONS[m.index];
    if (m.index === 0) {
      if (dist2D(p.pos.x, p.pos.z, CITY.pierEnd.x, CITY.pierEnd.z) < 6) {
        pay(G, def.pay, 'FIRST GEAR DONE');
        startMission(G, 1);
      }
    } else if (m.index === 1) {
      if (m.phase === 0) {
        if (p.car) {
          m.phase = 1;
          G.hud.showBanner(G, 'THE PICKUP', 'Now deliver it to the chop shop');
        }
      } else if (p.car && dist2D(p.pos.x, p.pos.z, CITY.chopShop.x, CITY.chopShop.z) < 7) {
        pay(G, def.pay, 'THE PICKUP DONE');
        startMission(G, 2);
      }
    } else if (m.index === 2) {
      if (m.phase === 0) {
        if (G.police.wanted >= 2) {
          m.phase = 1;
          G.hud.showBanner(G, 'HOT WHEELS', 'Now lose the heat — stay quiet');
        }
      } else if (G.police.wanted === 0) {
        pay(G, def.pay, 'HOT WHEELS DONE');
        startMission(G, 3);
      }
    } else if (m.index === 3) {
      if (dist2D(p.pos.x, p.pos.z, CITY.dropSpot.x, CITY.dropSpot.z) < 7) {
        pay(G, def.pay, 'THE DROP DONE');
        if (p.debt <= 0) {
          G.hud.showBanner(G, 'DEBT PAID', 'Silas Kade is off your back — keep earning with taxi fares');
        }
        m.index = 4;
        startFare(G);
      }
    }
    return;
  }

  // Taxi fares after the story.
  const f = m.fare;
  if (!f) {
    startFare(G);
    return;
  }
  if (f.state === 'toPickup') {
    if (p.car && dist2D(p.pos.x, p.pos.z, f.pickup.x, f.pickup.z) < 6) {
      G.scene.remove(f.mesh);
      f.state = 'toDrop';
      G.hud.showBanner(G, 'PASSENGER ABOARD', 'Drive them to the gold diamond');
    }
  } else if (p.car && dist2D(p.pos.x, p.pos.z, f.dropoff.x, f.dropoff.z) < 7) {
    pay(G, f.pay, 'FARE DONE');
    m.fare = null;
    startFare(G);
  }
}
