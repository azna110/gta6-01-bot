// Saving and the menus: the start screen, pause, and the BUSTED / WASTED
// screens with their fines. Progress lives in localStorage.

import { money } from './utils.js';

const SAVE_KEY = 'velvet-bay-save-v1';
const START_POS = { x: -158, z: 8 };

/** Read the saved game, or null when there is none. */
export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch (e) {
    return false;
  }
}

/** Write the current progress to localStorage. */
export function saveGame(G) {
  try {
    const p = G.player;
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: p.cash,
      debt: p.debt,
      health: p.health,
      missionIndex: G.missions.index,
      missionPhase: G.missions.phase,
      wanted: G.police.wanted,
      x: p.pos.x,
      z: p.pos.z,
    }));
  } catch (e) { /* storage unavailable: the game still plays */ }
}

/** Put the player back at the start, on foot, with a clean slate of heat. */
function respawn(G) {
  const p = G.player;
  if (p.car) {
    // Leave the car where it stands.
    p.car.speed = 0;
    p.car.parked = true;
    G.vehicles.parked.push(p.car);
    p.car = null;
  }
  p.onFoot = true;
  p.mesh.visible = true;
  p.pos.set(START_POS.x, 0, START_POS.z);
  p.vel.set(0, 0, 0);
  p.health = 100;
  p.yaw = Math.PI / 2;
  p.camYaw = -Math.PI / 2;
  p.camPitch = 0.32;
  G.police.wanted = 0;
  G.police.quietTimer = 0;
  G.police.bustedTimer = 0;
  for (const c of G.police.cruisers) G.scene.remove(c.mesh);
  G.police.cruisers = [];
  for (const r of G.combat.rivals) G.scene.remove(r.mesh);
  G.combat.rivals = [];
}

/** Show one overlay and hide the others; '' hides them all (playing). */
export function showMenu(G, which) {
  const ids = ['menu-start', 'menu-pause', 'menu-busted', 'menu-wasted'];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('show', id === which);
  }
  G.state = which === '' ? 'playing' : which === 'menu-start' ? 'menu' : which === 'menu-pause' ? 'paused' : which === 'menu-busted' ? 'busted' : 'wasted';
  G.input.lockEnabled = G.state === 'playing';
  if (G.state !== 'playing') G.input.exitLock();
}

/** Start a brand-new game: reset everything and play. */
export function startNewGame(G) {
  const p = G.player;
  p.cash = 0;
  p.debt = 2000;
  p.health = 100;
  G.missions.index = 0;
  G.missions.phase = 0;
  G.missions.fare = null;
  respawn(G);
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  G.audio.resume();
  G.audio.startMusic();
  G.hud.showBanner(G, 'FIRST GEAR', 'Meet Dante at the pier');
  G.hud.setHint(G, 'WASD move • Shift sprint • Space jump • E steal a car');
  showMenu(G, '');
}

/** Continue from the save, or start fresh when there is none. */
export function continueGame(G) {
  const data = loadGame();
  if (!data) {
    startNewGame(G);
    return;
  }
  const p = G.player;
  p.cash = data.cash || 0;
  p.debt = data.debt ?? 2000;
  p.health = data.health ?? 100;
  G.missions.index = data.missionIndex ?? 0;
  G.missions.phase = data.missionPhase ?? 0;
  G.police.wanted = 0;
  respawn(G);
  p.pos.set(data.x ?? START_POS.x, 0, data.z ?? START_POS.z);
  G.audio.resume();
  G.audio.startMusic();
  G.hud.showBanner(G, 'WELCOME BACK', 'Debt left ' + money(p.debt));
  showMenu(G, '');
}

/** Pause the game and show the pause menu. */
export function pauseGame(G) {
  if (G.state !== 'playing') return;
  saveGame(G);
  showMenu(G, 'menu-pause');
}

/** Back to the game from the pause menu. */
export function resumeGame(G) {
  G.audio.resume();
  showMenu(G, '');
  G.input.requestLock();
}

/** Restart the current mission from its first phase. */
export function restartMission(G) {
  const m = G.missions;
  m.phase = 0;
  for (const r of G.combat.rivals) G.scene.remove(r.mesh);
  G.combat.rivals = [];
  if (m.index === 3) {
    G.combat.spawnRivals(G, G.city.dropSpot.x, G.city.dropSpot.z, 3);
  }
  const names = ['FIRST GEAR', 'THE PICKUP', 'HOT WHEELS', 'THE DROP'];
  if (m.index < 4) G.hud.showBanner(G, names[m.index], 'Mission restarted');
  resumeGame(G);
}

/** Quit to the start screen, saving first. */
export function quitToMenu(G) {
  saveGame(G);
  showMenu(G, 'menu-start');
  const cont = document.getElementById('btn-continue');
  if (cont) cont.style.display = hasSave() ? '' : 'none';
}

/** Caught on foot by the police: a fine and a respawn. */
export function triggerBusted(G) {
  if (G.state !== 'playing') return;
  const fine = 150;
  const p = G.player;
  const fromCash = Math.min(p.cash, fine);
  p.cash -= fromCash;
  p.debt += fine - fromCash;
  G.audio.busted();
  G.audio.stopMusic();
  const el = document.getElementById('busted-fine');
  if (el) el.textContent = 'Fine ' + money(fine) + ' • debt now ' + money(p.debt);
  respawn(G);
  saveGame(G);
  showMenu(G, 'menu-busted');
}

/** Health reached zero: a hospital bill and a respawn. */
export function triggerWasted(G) {
  if (G.state !== 'playing') return;
  const bill = 100;
  const p = G.player;
  const fromCash = Math.min(p.cash, bill);
  p.cash -= fromCash;
  p.debt += bill - fromCash;
  G.audio.busted();
  G.audio.stopMusic();
  const el = document.getElementById('wasted-fine');
  if (el) el.textContent = 'Hospital bill ' + money(bill) + ' • debt now ' + money(p.debt);
  respawn(G);
  saveGame(G);
  showMenu(G, 'menu-wasted');
}

/** Wire the menu buttons to the actions above. */
export function createSave(G) {
  const on = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => { G.audio.resume(); G.audio.click(); fn(); });
  };
  on('btn-new', () => startNewGame(G));
  on('btn-continue', () => continueGame(G));
  on('btn-resume', () => resumeGame(G));
  on('btn-restart-mission', () => restartMission(G));
  on('btn-quit', () => quitToMenu(G));
  on('btn-busted-continue', () => { G.audio.startMusic(); showMenu(G, ''); });
  on('btn-wasted-continue', () => { G.audio.startMusic(); showMenu(G, ''); });
  on('btn-mute', () => {
    const muted = !G.audioMuted;
    G.audioMuted = muted;
    G.audio.setMuted(muted);
    const b = document.getElementById('btn-mute');
    if (b) b.textContent = muted ? 'Unmute' : 'Mute';
  });
  const cont = document.getElementById('btn-continue');
  if (cont) cont.style.display = hasSave() ? '' : 'none';
  // The menu actions are called as methods on this object
  // (G.save.triggerBusted(G)) from the systems that trigger them.
  const save = { saveGame: () => saveGame(G) };
  save.triggerBusted = triggerBusted;
  save.triggerWasted = triggerWasted;
  save.startNewGame = startNewGame;
  save.continueGame = continueGame;
  save.pauseGame = pauseGame;
  save.resumeGame = resumeGame;
  save.restartMission = restartMission;
  save.quitToMenu = quitToMenu;
  return save;
}
