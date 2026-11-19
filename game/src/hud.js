// The HUD: health, cash, wanted stars, mission readout, speedometer, ammo,
// crosshair, hints, the big center banner, and the round minimap.

import { CITY } from './city.js';
import { clamp, dist2D, money } from './utils.js';
import { currentObjective } from './missions.js';

export function createHud(G) {
  const el = (id) => document.getElementById(id);
  const hud = {
    healthFill: el('health-fill'),
    healthText: el('health-text'),
    cash: el('cash'),
    debt: el('debt'),
    stars: el('stars'),
    missionName: el('mission-name'),
    missionBrief: el('mission-brief'),
    missionDist: el('mission-dist'),
    banner: el('banner'),
    bannerTitle: el('banner-title'),
    bannerSub: el('banner-sub'),
    speed: el('speed'),
    carHealth: el('car-health'),
    ammo: el('ammo'),
    crosshair: el('crosshair'),
    hint: el('hint'),
    damage: el('damage-flash'),
    minimap: el('minimap'),
    bannerTimer: 0,
    flashTimer: 0,
    mapCtx: null,
  };
  if (hud.minimap) hud.mapCtx = hud.minimap.getContext('2d');
  // The HUD actions are called as methods on this object
  // (G.hud.showBanner(G, ...)) from the systems that trigger them.
  hud.showBanner = showBanner;
  hud.setHint = setHint;
  hud.damageFlash = damageFlash;
  return hud;
}

/** Show the big center banner for a few seconds. */
export function showBanner(G, title, sub) {
  const h = G.hud;
  if (!h.banner) return;
  h.bannerTitle.textContent = title;
  h.bannerSub.textContent = sub || '';
  h.banner.classList.add('show');
  h.bannerTimer = 3.6;
}

/** Set the contextual hint line under the crosshair. */
export function setHint(G, text) {
  if (G.hud.hint) G.hud.hint.textContent = text;
}

/** A red flash across the screen when the player is hurt. */
export function damageFlash(G) {
  G.hud.flashTimer = 0.55;
}

/** Draw the whole-city minimap: roads, beach, ocean, cars, police, objective. */
function drawMinimap(G) {
  const h = G.hud;
  if (!h.mapCtx) return;
  const ctx = h.mapCtx;
  const S = 180;
  const scale = S / 460;
  const x0 = -260;
  const z0 = -190;
  const zOff = (S - 380 * scale) / 2;
  const mx = (x) => (x - x0) * scale;
  const mz = (z) => (z - z0) * scale + zOff;
  ctx.clearRect(0, 0, S, S);
  // Ground, ocean and sand.
  ctx.fillStyle = '#20242a';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#1d4a6a';
  ctx.fillRect(0, 0, mx(CITY.oceanX + 40) - mx(-260), S);
  ctx.fillStyle = '#8a7a55';
  ctx.fillRect(mx(CITY.oceanX + 40), 0, mx(CITY.sandX + 8) - mx(CITY.oceanX + 40), S);
  // Roads.
  ctx.strokeStyle = '#5a5a62';
  ctx.lineWidth = Math.max(2, CITY.roadWidth * scale);
  for (const s of CITY.streets) {
    ctx.beginPath();
    ctx.moveTo(mx(s), mz(-190));
    ctx.lineTo(mx(s), mz(190));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mx(-260), mz(s));
    ctx.lineTo(mx(200), mz(s));
    ctx.stroke();
  }
  // Buildings.
  ctx.fillStyle = '#3a3f47';
  for (const b of G.city.colliders) {
    ctx.fillRect(mx(b.minX), mz(b.minZ), (b.maxX - b.minX) * scale, (b.maxZ - b.minZ) * scale);
  }
  // Taxi passenger.
  const fare = G.missions.fare;
  if (fare && fare.state === 'toPickup') {
    ctx.fillStyle = '#ffd75e';
    ctx.beginPath();
    ctx.arc(mx(fare.pickup.x), mz(fare.pickup.z), 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Rivals.
  ctx.fillStyle = '#ff2222';
  for (const r of G.combat.rivals) {
    if (r.state !== 'fight') continue;
    ctx.beginPath();
    ctx.arc(mx(r.mesh.position.x), mz(r.mesh.position.z), 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Traffic.
  ctx.fillStyle = '#e8d44d';
  for (const car of G.vehicles.traffic) {
    ctx.beginPath();
    ctx.arc(mx(car.mesh.position.x), mz(car.mesh.position.z), 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Police, flashing red and blue.
  const flash = Math.floor(G.time * 3) % 2 === 0;
  ctx.fillStyle = flash ? '#ff3333' : '#3388ff';
  for (const c of G.police.cruisers) {
    ctx.beginPath();
    ctx.arc(mx(c.mesh.position.x), mz(c.mesh.position.z), 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Objective diamond.
  const obj = G.missions ? currentObjective(G) : null;
  if (obj) {
    const ox = mx(obj.x);
    const oy = mz(obj.z);
    ctx.fillStyle = '#ffd75e';
    ctx.beginPath();
    ctx.moveTo(ox, oy - 6);
    ctx.lineTo(ox + 5, oy);
    ctx.lineTo(ox, oy + 6);
    ctx.lineTo(ox - 5, oy);
    ctx.closePath();
    ctx.fill();
  }
  // The player: a white arrow pointing where they face.
  const p = G.player;
  const px = mx(p.pos.x);
  const py = mz(p.pos.z);
  const yaw = p.onFoot ? p.yaw : (p.car ? p.car.mesh.rotation.y : p.yaw);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(Math.atan2(Math.sin(yaw), -Math.cos(yaw)) + Math.PI);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Refresh every HUD element from the game state. */
export function updateHud(G) {
  const h = G.hud;
  const p = G.player;
  if (h.healthFill) {
    h.healthFill.style.width = clamp(p.health, 0, 100) + '%';
    h.healthFill.style.background = p.health > 50 ? '#3aa655' : p.health > 25 ? '#d8a020' : '#c03030';
  }
  if (h.healthText) h.healthText.textContent = Math.ceil(p.health);
  if (h.cash) h.cash.textContent = money(p.cash);
  if (h.debt) h.debt.textContent = p.debt > 0 ? 'DEBT ' + money(p.debt) : 'DEBT PAID';
  if (h.stars) {
    let s = '';
    for (let i = 0; i < 5; i++) s += i < G.police.wanted ? '★' : '☆';
    h.stars.textContent = s;
    h.stars.classList.toggle('hot', G.police.wanted > 0);
  }
  const obj = currentObjective(G);
  if (h.missionName) {
    const m = G.missions;
    if (m.index < 4) {
      h.missionName.textContent = ['FIRST GEAR', 'THE PICKUP', 'HOT WHEELS', 'THE DROP'][m.index];
      h.missionBrief.textContent = [
        'Meet Dante at the pier',
        m.phase === 0 ? 'Steal a car' : 'Deliver it to the chop shop',
        m.phase === 0 ? 'Reach 2 wanted stars' : 'Lose the heat — stay quiet',
        'Deliver the package, watch the rivals',
      ][m.index];
    } else if (m.fare) {
      h.missionName.textContent = 'TAXI FARE';
      h.missionBrief.textContent = m.fare.state === 'toPickup' ? 'Pick up the passenger' : 'Drive them to the gold diamond';
    }
  }
  if (h.missionDist) {
    const d = dist2D(p.pos.x, p.pos.z, obj.x, obj.z);
    h.missionDist.textContent = obj.label + ' • ' + Math.round(d) + 'm';
  }
  if (h.speed) {
    const mph = p.car ? Math.abs(p.car.speed) * 2.2 : 0;
    h.speed.textContent = p.car ? Math.round(mph) + ' mph' : '';
  }
  if (h.carHealth) {
    h.carHealth.textContent = p.car ? 'CAR ' + Math.max(0, Math.round(p.car.health)) + '%' : '';
    h.carHealth.style.color = p.car && p.car.health < 30 ? '#ff6060' : '#ffffff';
  }
  if (h.ammo) {
    h.ammo.textContent = G.combat.reloading ? 'RELOADING…' : 'AMMO ' + G.combat.ammo + ' / 12';
  }
  if (h.crosshair) {
    h.crosshair.style.display = G.state === 'playing' && p.onFoot && G.input.pointerLocked ? 'block' : 'none';
  }
  // Banner and damage flash fade on their own timers.
  if (h.bannerTimer > 0) {
    h.bannerTimer -= 1 / 60;
    if (h.bannerTimer <= 0) h.banner.classList.remove('show');
  }
  if (h.flashTimer > 0) {
    h.flashTimer -= 1 / 60;
    if (h.damage) h.damage.style.opacity = String(Math.max(0, h.flashTimer * 0.9));
  }
  drawMinimap(G);
}
