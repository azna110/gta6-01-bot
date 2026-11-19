// Velvet Bay — the entry module. Builds the world, wires the systems and
// runs the frame loop. The game state is 'menu', 'playing', 'paused',
// 'busted' or 'wasted'; only 'playing' advances the simulation.

import { createAudio } from './audio.js';
import { createCity, updateCity } from './city.js';
import { createCombat, updateCombat } from './combat.js';
import { createEffects, updateEffects } from './effects.js';
import { createHud, updateHud } from './hud.js';
import { createInput } from './input.js';
import { createMissions, updateMissions } from './missions.js';
import { createPedestrians, updatePedestrians } from './pedestrians.js';
import { createPlayer, updatePlayer } from './player.js';
import { createPolice, updatePolice } from './police.js';
import { createSave, pauseGame, resumeGame, saveGame, startNewGame } from './save.js';
import { shotParam, stageShot, updateShot } from './shots.js';
import { createVehicles, updateVehicles } from './vehicles.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
// A cinematic view of the city behind the start menu.
camera.position.set(-150, 55, 120);
camera.lookAt(0, 20, 0);

const G = {
  scene,
  camera,
  renderer,
  time: 0,
  state: 'menu',
  audioMuted: false,
  shot: null,
};
G.input = createInput(canvas);
G.audio = createAudio();
G.effects = createEffects(G);
G.city = createCity(G);
G.vehicles = createVehicles(G);
G.pedestrians = createPedestrians(G);
G.player = createPlayer(G);
G.police = createPolice(G);
G.combat = createCombat(G);
G.hud = createHud(G);
G.missions = createMissions(G);
G.save = createSave(G);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Exposed for playtesting through the devtools protocol.
window.__game = G;
window.__shotReady = false;

// A screenshot scene starts playing on its own; a normal load shows the menu.
// startNewGame hides the menu overlay (showMenu) and resets the world, so
// the shot shows the game itself rather than the title screen.
const shot = shotParam();
if (shot && shot !== 'start') {
  startNewGame(G);
  stageShot(G, shot);
} else if (shot === 'start') {
  stageShot(G, shot);
}

let prevP = false;
let saveTimer = 0;
let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = (now - last) / 1000;
  last = now;
  const dt = Math.min(Math.max(rawDt, 0), 0.05);
  G.time += dt;

  // P pauses and resumes (edge-triggered).
  const pDown = G.input.isDown('KeyP');
  if (pDown && !prevP) {
    if (G.state === 'playing') pauseGame(G);
    else if (G.state === 'paused') resumeGame(G);
  }
  prevP = pDown;

  if (G.state === 'playing') {
    updatePlayer(G, dt);
    updateVehicles(G, dt);
    updatePedestrians(G, dt);
    updatePolice(G, dt);
    updateMissions(G, dt);
    updateCombat(G, dt);
    G.audio.update(dt);
    saveTimer += dt;
    if (saveTimer > 12) {
      saveTimer = 0;
      saveGame(G);
    }
  }
  // The shot timer runs in every state, so the title-screen scene can
  // report ready too (its state is 'menu', not 'playing').
  updateShot(G);
  updateCity(G, dt);
  updateEffects(G, dt);
  updateHud(G);
  renderer.render(scene, camera);
}

requestAnimationFrame(frame);
