// The HUD: health, cash, wanted stars, mission objective, speedometer, hints,
// and the round minimap that shows the whole city at a glance.
import { CITY_MIN, CITY_MAX, ROADS } from './city.js';

export class HUD {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      health: document.getElementById('health-fill'),
      cash: document.getElementById('cash'),
      stars: document.getElementById('top-right'),
      objective: document.getElementById('objective'),
      objTitle: document.getElementById('obj-title'),
      objText: document.getElementById('obj-text'),
      objDist: document.getElementById('obj-dist'),
      speedo: document.getElementById('speedo'),
      speed: document.getElementById('speed'),
      carHealth: document.getElementById('car-health'),
      ammo: document.getElementById('ammo'),
      crosshair: document.getElementById('crosshair'),
      hint: document.getElementById('hint'),
      toast: document.getElementById('toast'),
      vignette: document.getElementById('vignette'),
      map: document.getElementById('minimap'),
    };
    this.mapCtx = this.el.map.getContext('2d');
    this.toastTimer = null;
    this.lastCash = -1; this.lastStars = -1;
  }
  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }
  toast(text, ms) {
    this.el.toast.textContent = text;
    this.el.toast.style.opacity = 1;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.el.toast.style.opacity = 0; }, ms || 3600);
  }
  setHint(html) {
    if (!html) { this.el.hint.classList.add('hidden'); return; }
    this.el.hint.innerHTML = html;
    this.el.hint.classList.remove('hidden');
  }
  setVignette(on) { this.el.vignette.style.opacity = on ? 1 : 0; }
  update(s) {
    // s: {health, cash, wanted, title, objective, objDist, inCar, speedMph, carHealth, ammo, aiming}
    this.el.health.style.width = Math.max(0, s.health) + '%';
    this.el.health.style.background = s.health > 50 ? 'linear-gradient(90deg,#37d67a,#7be495)' : s.health > 25 ? 'linear-gradient(90deg,#e8a33a,#ffd23e)' : 'linear-gradient(90deg,#d83a3a,#ff7a7a)';
    if (s.cash !== this.lastCash) { this.el.cash.textContent = '$' + s.cash.toLocaleString('en-US'); this.lastCash = s.cash; }
    if (s.wanted !== this.lastStars) {
      let html = '';
      for (let i = 0; i < 5; i++) html += i < s.wanted ? '★' : '<span class="dim">★</span>';
      this.el.stars.innerHTML = html;
      this.lastStars = s.wanted;
    }
    if (s.title) {
      this.el.objective.classList.remove('hidden');
      this.el.objTitle.textContent = s.title;
      this.el.objText.textContent = s.objective || '';
      this.el.objDist.textContent = s.objDist || '';
    } else this.el.objective.classList.add('hidden');
    if (s.inCar) {
      this.el.speedo.classList.remove('hidden');
      this.el.speed.innerHTML = Math.round(s.speedMph) + ' <small>mph</small>';
      this.el.carHealth.textContent = s.carHealth !== undefined ? 'Car condition ' + Math.max(0, Math.round(s.carHealth)) + '%' : '';
      this.el.ammo.classList.add('hidden');
      this.el.crosshair.classList.add('hidden');
    } else {
      this.el.speedo.classList.add('hidden');
      this.el.ammo.classList.remove('hidden');
      this.el.ammo.textContent = s.ammo + ' / ∞';
      if (s.aiming) this.el.crosshair.classList.remove('hidden'); else this.el.crosshair.classList.add('hidden');
    }
  }
  // North-up minimap: roads, beach, player arrow, cars, police, mission marker.
  drawMinimap(s) {
    // s: {x, z, heading, cars:[{x,z,police}], target:{x,z}|null, enemies:[{x,z}]}
    const g = this.mapCtx, W = 200, R = W / 2;
    const scale = W / (CITY_MAX - CITY_MIN + 160);
    const px = (x) => R + (x - 0) * scale;
    const pz = (z) => R + (z - 0) * scale;
    g.clearRect(0, 0, W, W);
    g.fillStyle = '#0e1420'; g.fillRect(0, 0, W, W);
    // beach + ocean at the south edge
    g.fillStyle = '#e8d5a0'; g.fillRect(0, pz(300), W, pz(340) - pz(300));
    g.fillStyle = '#1e7fa8'; g.fillRect(0, pz(340), W, W - pz(340));
    // roads
    g.strokeStyle = '#5a5e68'; g.lineWidth = 5;
    for (const c of ROADS) {
      g.beginPath(); g.moveTo(px(c), pz(CITY_MIN)); g.lineTo(px(c), pz(CITY_MAX)); g.stroke();
      g.beginPath(); g.moveTo(px(CITY_MIN), pz(c)); g.lineTo(px(CITY_MAX), pz(c)); g.stroke();
    }
    // mission target
    if (s.target) {
      const tx = px(s.target.x), ty = pz(s.target.z);
      g.fillStyle = '#ffd23e';
      g.beginPath(); g.moveTo(tx, ty - 8); g.lineTo(tx + 7, ty); g.lineTo(tx, ty + 8); g.lineTo(tx - 7, ty); g.closePath(); g.fill();
      g.strokeStyle = '#ffd23e'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(tx, ty, 12, 0, Math.PI * 2); g.stroke();
    }
    // enemies
    g.fillStyle = '#ff4040';
    for (const e of s.enemies || []) { g.beginPath(); g.arc(px(e.x), pz(e.z), 3, 0, Math.PI * 2); g.fill(); }
    // traffic
    for (const c of s.cars || []) {
      g.fillStyle = c.police ? '#3a7bff' : '#c8c8c8';
      g.beginPath(); g.arc(px(c.x), pz(c.z), c.police ? 4 : 2.5, 0, Math.PI * 2); g.fill();
    }
    // player arrow, rotated by heading
    g.save();
    g.translate(px(s.x), pz(s.z)); g.rotate(-s.heading + Math.PI);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(0, -8); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath(); g.fill();
    g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke();
    g.restore();
  }
}
