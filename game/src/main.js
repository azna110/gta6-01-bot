// Velvet Bay: the boot, the loop, and the wiring between every system.
// ?shot=chase|drive|mission|start stages a screenshot scene and sets
// window.__shotReady once it has painted; window.__game exposes live state.
import { Input } from './input.js';
import { SoundEngine } from './audio.js';
import { buildCity } from './city.js';
import { TrafficSystem, PlayerCar } from './vehicles.js';
import { Pedestrians } from './pedestrians.js';
import { Player } from './player.js';
import { Police } from './police.js';
import { MissionManager } from './missions.js';
import { Combat } from './combat.js';
import { Effects } from './effects.js';
import { HUD } from './hud.js';
import { hasSave, saveGame, loadGame, clearSave } from './save.js';
import { applyShot } from './shots.js';
import { clamp, dist } from './utils.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');

class Game {
  constructor() {
    this.cash = 0;
    this.state = 'menu';
    this.time = 0;
    this.frames = 0;
    this.playerCar = null;
    this.muted = false;
    this.endReason = '';
    window.__game = { state: 'menu', errors: [] };
    window.addEventListener('error', (e) => window.__game.errors.push(String(e.message)));
    const app = document.getElementById('app');
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    app.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
    this.camera.position.set(0, 30, 160);
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    this.city = buildCity(this.scene);
    this.input = new Input(this.renderer.domElement);
    this.sound = new SoundEngine();
    this.traffic = new TrafficSystem(this.scene);
    this.pedestrians = new Pedestrians(this.scene, this.city.colliders);
    this.player = new Player(this.scene, this.camera, this.city.colliders);
    this.police = new Police(this.scene, this.city.colliders);
    this.fx = new Effects(this.scene);
    this.combat = new Combat(this.scene, this.camera, this.city.solids, this.fx, this.sound, this.police);
    this.hud = new HUD();
    this.missions = new MissionManager({
      onToast: (t) => this.hud.toast(t),
      onComplete: (m) => { this.sound.jingle(); this.hud.toast(m.title + ' complete! +$' + m.reward, 4200); },
      onSpawnEnemies: (x, z) => { this.combat.spawnEnemies(x, z, 3); this.hud.toast('Rivals guarding the drop — watch out!', 4000); },
      onSave: () => this.save(),
    });
    this.player.reset(0, 120);
    this.wireMenus();
    // small debug handle for automated playtests (harmless in normal play)
    window.__game.tp = (x, z) => { this.player.x = x; this.player.z = z; this.player.model.position.set(x, 0, z); };
    window.__game.cars = () => this.traffic.cars.map((c) => ({ x: Math.round(c.x), z: Math.round(c.z), parked: !!c.parked, driven: !!c.driven, name: c.name }));
    window.__game.setWanted = (n) => { this.police.wanted = n; };
    if (hasSave()) document.getElementById('btn-continue').classList.remove('hidden');
  }
  get inCar() { return !!this.playerCar; }
  get wanted() { return this.police.wanted; }

  wireMenus() {
    document.getElementById('btn-new').addEventListener('click', () => { clearSave(); this.newGame(); });
    document.getElementById('btn-continue').addEventListener('click', () => this.continueGame());
    document.getElementById('btn-resume').addEventListener('click', () => this.resume());
    document.getElementById('btn-mute').addEventListener('click', () => this.toggleMute());
    document.getElementById('btn-restart').addEventListener('click', () => { this.restartMission(); this.resume(); });
    document.getElementById('btn-quit').addEventListener('click', () => { this.save(); this.toMenu(); });
    document.getElementById('btn-respawn').addEventListener('click', () => this.respawn());
  }
  hideMenus() {
    for (const id of ['menu', 'pause', 'end']) document.getElementById(id).classList.add('hidden');
  }
  newGame() {
    this.cash = 0; this.missions.index = 0; this.missions.step = 0; this.missions.storyDone = false; this.missions.taxi = null;
    this.police.clear(); this.player.reset(0, 120);
    this.missions.start();
    this.startPlaying();
    this.sound.ensure(); this.sound.startMusic();
    this.hud.toast('Welcome to Velvet Bay — meet Dante at the pier', 5000);
  }
  continueGame() {
    const s = loadGame();
    if (!s) { this.newGame(); return; }
    this.cash = s.cash; this.missions.index = s.mission; this.missions.storyDone = !!s.storyDone;
    this.missions.step = 0; this.player.reset(s.x ?? 0, s.z ?? 120);
    this.player.health = s.health ?? 100;
    this.muted = !!s.muted; this.sound.setMuted(this.muted);
    this.missions.active = true;
    this.startPlaying();
    this.sound.ensure(); this.sound.startMusic();
    this.hud.toast('Welcome back, Vex', 3000);
  }
  startPlaying() {
    this.hideMenus(); this.hud.show(); this.state = 'playing';
    window.__game.state = 'playing';
    this.input.lock();
  }
  toMenu() {
    this.state = 'menu'; window.__game.state = 'menu';
    this.hud.hide(); this.input.unlock();
    document.getElementById('menu').classList.remove('hidden');
    document.getElementById('pause').classList.add('hidden');
    document.getElementById('end').classList.add('hidden');
    if (hasSave()) document.getElementById('btn-continue').classList.remove('hidden');
  }
  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused'; window.__game.state = 'paused';
    this.input.unlock();
    document.getElementById('pause').classList.remove('hidden');
    this.save();
  }
  resume() {
    if (this.state !== 'paused') return;
    document.getElementById('pause').classList.add('hidden');
    this.state = 'playing'; window.__game.state = 'playing';
    this.input.lock();
  }
  toggleMute() {
    this.muted = !this.muted;
    this.sound.setMuted(this.muted);
    document.getElementById('btn-mute').textContent = 'SOUND: ' + (this.muted ? 'OFF' : 'ON');
  }
  restartMission() {
    const m = this.missions.current();
    if (!m) return;
    this.missions.step = 0;
    this.hud.toast(m.title + ' restarted', 2500);
  }
  save() {
    saveGame({ cash: this.cash, mission: this.missions.index, storyDone: this.missions.storyDone, x: this.player.x, z: this.player.z, health: this.player.health, muted: this.muted });
  }
  endGame(kind, text) {
    this.state = 'ended'; window.__game.state = 'ended';
    this.endReason = kind;
    this.input.unlock();
    this.sound.busted();
    this.police.clear();
    document.getElementById('end-title').textContent = kind;
    document.getElementById('end-text').textContent = text;
    document.getElementById('end').classList.remove('hidden');
    this.save();
  }
  respawn() {
    const fee = this.endReason === 'BUSTED' ? 200 : 100;
    this.cash = Math.max(0, this.cash - fee);
    document.getElementById('end').classList.add('hidden');
    if (this.playerCar) { this.playerCar.car.driven = false; this.playerCar = null; }
    this.player.reset(0, 120);
    this.state = 'playing'; window.__game.state = 'playing';
    this.hud.toast(this.endReason === 'BUSTED' ? 'Bail paid: -$' + fee + '. Stay out of sight.' : 'Hospital bill: -$' + fee + '. Patch up and go.', 4000);
    this.input.lock();
  }
  enterCar(car) {
    this.playerCar = new PlayerCar(car, this.city.colliders, this.traffic, this.fx);
    this.player.inCar = true;
    this.player.model.visible = false;
    this.player.camYaw = this.playerCar.car.heading + Math.PI;
    // stealing in front of witnesses draws heat
    let seen = false;
    for (const p of this.pedestrians.people) if (!p.dead && dist(this.player.x, this.player.z, p.x, p.z) < 25) seen = true;
    for (const c of this.police.cruisers) if (dist(this.player.x, this.player.z, c.x, c.z) < 60) seen = true;
    if (seen) this.police.crime(1);
    if (!shotName) this.sound.ensure(); // shot mode has no user gesture; audio stays off
    this.hud.toast('Stolen: ' + car.name + ' — the bay is yours to drive', 3000);
  }
  exitCar() {
    const c = this.playerCar.car;
    c.driven = false; c.parked = true;
    const side = c.heading + Math.PI / 2;
    this.player.x = c.x + Math.sin(side) * 3.2; this.player.z = c.z + Math.cos(side) * 3.2;
    this.player.y = 0; this.player.heading = c.heading;
    this.player.model.visible = true;
    this.player.model.position.set(this.player.x, 0, this.player.z);
    this.player.inCar = false;
    this.playerCar = null;
  }

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.05, Math.max(0.001, (now - (this.lastNow || now)) / 1000));
    this.lastNow = now;
    this.time += dt; this.frames++;
    if (this.state === 'menu') {
      this.player.camYaw += dt * 0.05;
      this.player.updateCamera(dt, { x: this.player.x, y: 0, z: this.player.z, heading: 0, driving: false, speed: 0 });
      this.traffic.update(dt, null, null);
      this.pedestrians.update(dt);
      this.city.update(dt, this.time);
    } else if (this.state === 'playing') {
      this.step(dt);
    }
    this.renderer.render(this.scene, this.camera);
    if (shotName && this.frames > 25 && !window.__shotReady) window.__shotReady = true;
    this.syncDebug();
  }
  step(dt) {
    const input = this.driveInput || this.input, player = this.player;
    // pause / mute
    if (input.wasPressed('KeyP')) { this.pause(); input.endFrame(); return; }
    if (input.wasPressed('KeyM')) this.toggleMute();
    // enter / exit car
    if (input.wasPressed('KeyE')) {
      if (this.playerCar) this.exitCar();
      else {
        const car = this.traffic.nearestStealable(player.x, player.z, 5);
        if (car) this.enterCar(car);
      }
    }
    if (this.playerCar) {
      const pc = this.playerCar;
      pc.update(dt, input, (impact) => {
        this.sound.crash();
        if (impact > 18) this.police.crime(1);
        this.fx.sparks(pc.x, 1, pc.z);
      });
      // running over pedestrians is a crime, and a mess
      const hit = this.pedestrians.hitByCar(pc.x, pc.z, 2.4);
      if (hit.length) {
        this.police.crime(1);
        this.pedestrians.scare(pc.x, pc.z, 35);
        this.sound.crash();
        this.fx.sparks(pc.x, 1, pc.z);
      }
      if (pc.health <= 0) {
        const cx = pc.x, cz = pc.z;
        this.fx.explosion(cx, 1, cz);
        this.sound.crash();
        this.scene.remove(pc.car.model);
        this.traffic.cars = this.traffic.cars.filter((c) => c !== pc.car);
        this.playerCar = null;
        player.inCar = false;
        player.x = cx + 4; player.z = cz + 4;
        player.model.visible = true;
        player.model.position.set(player.x, 0, player.z);
        player.hurt(30, this.time);
        this.police.crime(1);
        this.hud.toast('Your ride just blew up. Run!', 3500);
      }
      this.sound.setEngine(Math.abs(pc.speed) / 42, true);
    } else {
      player.update(dt, input, this.city.colliders);
      if (input.wasPressed('KeyF')) { player.punch(); this.combat.punch(player, this.pedestrians); }
      if (input.wasPressed('KeyR')) this.combat.reload();
      if (input.consumeClick() && input.locked) this.combat.shoot(player, this.pedestrians, this.playerCar);
      this.sound.setEngine(0, false);
    }
    this.traffic.update(dt, this.playerCar, null);
    this.pedestrians.update(dt);
    const pol = this.police.update(dt, player, this.playerCar, this.time);
    this.missions.update(dt, this);
    this.combat.update(dt, player, this.time);
    this.fx.update(dt, this.time);
    this.city.update(dt, this.time);
    player.heal(dt, this.time);
    // camera follows the player or the car
    const target = this.playerCar
      ? { x: this.playerCar.x, y: 0, z: this.playerCar.z, heading: this.playerCar.heading, driving: true, speed: this.playerCar.speed }
      : { x: player.x, y: player.y, z: player.z, heading: player.heading, driving: false, speed: player.speed };
    player.updateCamera(dt, target);
    // siren volume follows the nearest cruiser
    this.sound.setSiren(this.police.wanted > 0, clamp((pol.nearestCruiser || 120) / 120, 0, 1));
    // damage flash
    this.hud.setVignette(this.time - player.lastHurt < 0.6);
    // beacon + minimap target
    const tgt = this.missions.target();
    this.fx.setBeacon(tgt ? tgt.x : 0, tgt ? tgt.z : 0, !!tgt);
    // HUD
    const nearCar = !this.playerCar ? this.traffic.nearestStealable(player.x, player.z, 5) : null;
    this.hud.update({
      health: player.health, cash: this.cash, wanted: this.police.wanted,
      title: this.missions.objectiveTitle(), objective: this.missions.objectiveText(),
      objDist: tgt ? Math.round(dist(player.x, player.z, tgt.x, tgt.z)) + ' m away' : '',
      inCar: !!this.playerCar, speedMph: this.playerCar ? Math.abs(this.playerCar.speed) * 2.24 : 0,
      carHealth: this.playerCar ? this.playerCar.health : undefined,
      ammo: this.combat.ammo, aiming: input.locked && !this.playerCar,
    });
    this.hud.drawMinimap({
      x: player.x, z: player.z, heading: player.heading,
      cars: [...this.traffic.cars.map((c) => ({ x: c.x, z: c.z, police: false })), ...this.police.cruisers.map((c) => ({ x: c.x, z: c.z, police: true }))],
      target: tgt, enemies: this.combat.enemies.filter((e) => !e.dead),
    });
    if (nearCar) this.hud.setHint('Press <b>E</b> to steal the ' + nearCar.name);
    else if (this.playerCar) this.hud.setHint('<b>W A S D</b> drive &nbsp;·&nbsp; <b>Space</b> handbrake &nbsp;·&nbsp; <b>E</b> exit car');
    else if (this.combat.aliveEnemies() > 0) this.hud.setHint('Rivals ahead — <b>Click</b> to shoot, <b>F</b> to punch');
    else this.hud.setHint('');
    // busted / wasted
    if (pol.busted) {
      this.endGame('BUSTED', 'The Velvet Bay PD caught up with you. Bail set: $200. The debt is still waiting.');
    } else if (player.health <= 0) {
      this.endGame('WASTED', 'You flatlined on the asphalt. The hospital patched you up for $100 — Kade still wants his money.');
    }
    input.endFrame();
  }
  syncDebug() {
    const g = window.__game;
    const px = this.playerCar ? this.playerCar.x : this.player.x;
    const pz = this.playerCar ? this.playerCar.z : this.player.z;
    g.state = this.state;
    g.cash = this.cash;
    g.wanted = this.police.wanted;
    g.mission = this.missions.index;
    g.inCar = !!this.playerCar;
    g.playerX = Math.round(px * 10) / 10;
    g.playerZ = Math.round(pz * 10) / 10;
    g.health = Math.round(this.player.health);
    g.speed = this.playerCar ? Math.round(this.playerCar.speed * 10) / 10 : Math.round(this.player.speed * 10) / 10;
    g.enemies = this.combat.aliveEnemies();
    g.policeCars = this.police.cruisers.length;
  }
  run() {
    if (shotName) {
      applyShot(this, shotName);
      if (shotName === 'start') { this.state = 'menu'; }
    }
    requestAnimationFrame((t) => this.frame(t));
  }
}

const game = new Game();
game.run();
