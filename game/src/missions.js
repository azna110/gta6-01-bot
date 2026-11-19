// The story: four jobs for fixer Dante Reyes that pay off Vex's $2,000 debt to
// loan shark Silas Kade — then repeatable taxi fares for free-roam money.
import { dist, makeRng, pick } from './utils.js';

const PIER = { x: 0, z: 356 };
const CHOP_SHOP = { x: -240, z: 160 };
const PACKAGE_PICKUP = { x: 80, z: -120 };
const DROP = { x: 240, z: -240 };

export const MISSIONS = [
  {
    id: 0, title: 'First Gear', reward: 200,
    briefing: 'Dante is waiting on the pier. Go meet him and hear the job.',
    steps: [{ type: 'goto', x: PIER.x, z: PIER.z, r: 8, label: 'Meet Dante at the pier' }],
  },
  {
    id: 1, title: 'The Pickup', reward: 400,
    briefing: 'Dante needs a car, no questions asked. Steal one and bring it to the chop shop.',
    steps: [
      { type: 'enterCar', label: 'Steal any car (press E near one)' },
      { type: 'deliverCar', x: CHOP_SHOP.x, z: CHOP_SHOP.z, r: 10, label: 'Deliver the car to the chop shop' },
    ],
  },
  {
    id: 2, title: 'Hot Wheels', reward: 600,
    briefing: 'Kade\'s boys tipped off the cops. Get the heat on you — then shake it off.',
    steps: [
      { type: 'wantedAtLeast', n: 2, label: 'Get a 2-star wanted level' },
      { type: 'wantedZero', label: 'Lose the cops — get back to 0 stars' },
    ],
  },
  {
    id: 3, title: 'The Drop', reward: 1000,
    briefing: 'One last run. Pick up the package, then make the drop uptown. Kade\'s rivals will be waiting.',
    steps: [
      { type: 'goto', x: PACKAGE_PICKUP.x, z: PACKAGE_PICKUP.z, r: 8, label: 'Pick up the package' },
      { type: 'deliver', x: DROP.x, z: DROP.z, r: 10, label: 'Make the drop — watch for rivals', spawnEnemies: true },
    ],
  },
];

export class MissionManager {
  constructor(hooks) {
    this.hooks = hooks; // {onToast, onComplete, onSpawnEnemies, onSave}
    this.rng = makeRng(99);
    this.index = 0;        // story mission index; 4 = story done
    this.step = 0;
    this.active = false;
    this.taxi = null;      // active taxi job {phase, x, z, pay}
    this.storyDone = false;
  }
  current() { return this.index < MISSIONS.length ? MISSIONS[this.index] : null; }
  currentStep() {
    const m = this.current();
    return m ? m.steps[this.step] : null;
  }
  start() {
    this.active = true; this.step = 0;
    const m = this.current();
    if (m) this.hooks.onToast(m.title + ' — ' + m.briefing);
  }
  target() {
    // returns {x, z, label} for the beacon/minimap, or null
    if (this.taxi) return { x: this.taxi.x, z: this.taxi.z, label: this.taxi.phase === 'pickup' ? 'Pick up the fare' : 'Drop off the fare' };
    const s = this.currentStep();
    if (!s || s.x === undefined) return null;
    return { x: s.x, z: s.z, label: s.label };
  }
  objectiveText() {
    if (this.taxi) return this.taxi.phase === 'pickup' ? 'Taxi fare: pick up the passenger' : 'Taxi fare: drive to the destination';
    const m = this.current();
    if (!m) return 'Free roam — the bay is yours';
    const s = this.currentStep();
    return s ? s.label : m.title;
  }
  objectiveTitle() {
    if (this.taxi) return 'Side Job: Taxi';
    const m = this.current();
    return m ? 'Mission ' + (this.index + 1) + '/4: ' + m.title : 'Debt Paid';
  }
  startTaxi(player) {
    // a fare appears near the player; destination is a random far point
    const a = this.rng() * Math.PI * 2, d = 40 + this.rng() * 60;
    const px = player.x + Math.sin(a) * d, pz = player.z + Math.cos(a) * d;
    const spots = [[-240, -240], [240, 240], [0, -240], [-240, 240], [200, 40], [-160, -160]];
    const dest = pick(this.rng, spots);
    this.taxi = { phase: 'pickup', x: px, z: pz, dx: dest[0], dz: dest[1], pay: 120 + Math.floor(this.rng() * 140) };
    this.hooks.onToast('Taxi fare nearby — pick up the passenger');
  }
  update(dt, ctx) {
    if (!this.active) return;
    const { player, inCar, wanted } = ctx;
    if (this.taxi) {
      const t = this.taxi;
      if (t.phase === 'pickup' && dist(player.x, player.z, t.x, t.z) < 6) {
        t.phase = 'dropoff'; t.x = t.dx; t.z = t.dz;
        this.hooks.onToast('Passenger aboard — drive to the marker');
      } else if (t.phase === 'dropoff' && inCar && dist(player.x, player.z, t.x, t.z) < 10) {
        ctx.cash += t.pay;
        this.hooks.onToast('Fare complete: +$' + t.pay);
        this.taxi = null;
        this.hooks.onSave && this.hooks.onSave();
        this.startTaxi(player);
      }
      return;
    }
    const m = this.current();
    if (!m) return;
    const s = this.currentStep();
    if (!s) return;
    let done = false;
    switch (s.type) {
      case 'goto': done = dist(player.x, player.z, s.x, s.z) < s.r; break;
      case 'enterCar': done = inCar; break;
      case 'deliverCar': done = inCar && dist(player.x, player.z, s.x, s.z) < s.r; break;
      case 'deliver': done = dist(player.x, player.z, s.x, s.z) < s.r; break;
      case 'wantedAtLeast': done = wanted >= s.n; break;
      case 'wantedZero': done = wanted === 0; break;
    }
    if (s.spawnEnemies && !s.enemiesSpawned) {
      s.enemiesSpawned = true;
      this.hooks.onSpawnEnemies && this.hooks.onSpawnEnemies(s.x, s.z);
    }
    if (!done) return;
    this.step++;
    if (this.step < m.steps.length) {
      this.hooks.onToast(m.steps[this.step].label);
      return;
    }
    // mission complete
    ctx.cash += m.reward;
    this.hooks.onComplete && this.hooks.onComplete(m);
    this.index++;
    this.step = 0;
    if (this.index >= MISSIONS.length) {
      this.storyDone = true;
      this.hooks.onToast('DEBT PAID — Silas Kade is off your back. The bay is yours.');
      this.startTaxi(player);
    } else {
      const next = this.current();
      this.hooks.onToast(next.title + ' — ' + next.briefing);
    }
    this.hooks.onSave && this.hooks.onSave();
  }
}
