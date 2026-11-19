// Save games live in this browser's localStorage: cash, story progress, position.
const KEY = 'velvet-bay-save-v1';

export function hasSave() {
  try { return !!window.localStorage.getItem(KEY); } catch { return false; }
}
export function saveGame(state) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({
      cash: state.cash, mission: state.mission, storyDone: state.storyDone,
      x: state.x, z: state.z, health: state.health, muted: state.muted,
      savedAt: Date.now(),
    }));
    return true;
  } catch { return false; }
}
export function loadGame() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (typeof s.cash !== 'number' || typeof s.mission !== 'number') return null;
    return s;
  } catch { return null; }
}
export function clearSave() {
  try { window.localStorage.removeItem(KEY); } catch { /* storage off */ }
}
