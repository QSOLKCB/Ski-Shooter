// SPDX-License-Identifier: Apache-2.0
// Local, validated settings and personal bests (pattern from QSOLKCB/CorpoWars3d and ARCADE saves).
// Storage is optional: private browsing or a blocked store simply means session-only values.
// Persisted objects are never spread into state; every field is range-checked and rebuilt.
export const SETTINGS_KEY = 'ski-shooter-settings-v1', RECORDS_KEY = 'ski-shooter-records-v1';
export const RESOLUTIONS = Object.freeze([.6, .85, 1]);
export const DEFAULT_SETTINGS = Object.freeze({sensitivity: 1, padSensitivity: 1, padInvert: false, fov: 90, resolution: .85, lead: true, motion: null, muted: false});

export function storage(scope = globalThis) {
  try { const s = scope.localStorage; return s && typeof s.getItem === 'function' ? s : null; } catch { return null; }
}
const read = (store, key) => { try { return JSON.parse(store?.getItem(key) ?? 'null'); } catch { return null; } };
const write = (store, key, value) => { try { store?.setItem(key, JSON.stringify(value)); return !!store; } catch { return false; } };
const step = (v, lo, hi, inc) => Number.isFinite(v) && v >= lo - 1e-9 && v <= hi + 1e-9 && Math.abs(Math.round((v - lo) / inc) * inc + lo - v) < 1e-9;

/** `motion: null` follows the system reduced-motion preference until the player chooses. */
export function readSettings(store) {
  const s = read(store, SETTINGS_KEY), out = {...DEFAULT_SETTINGS};
  if (!s || typeof s !== 'object' || Array.isArray(s)) return out;
  if (step(s.sensitivity, .3, 2.5, .1)) out.sensitivity = Math.round(s.sensitivity * 10) / 10;
  if (step(s.padSensitivity, .3, 2.5, .1)) out.padSensitivity = Math.round(s.padSensitivity * 10) / 10;
  if (Number.isInteger(s.fov) && s.fov >= 75 && s.fov <= 110) out.fov = s.fov;
  if (RESOLUTIONS.includes(s.resolution)) out.resolution = s.resolution;
  for (const k of ['lead', 'muted', 'padInvert']) if (typeof s[k] === 'boolean') out[k] = s[k];
  if (typeof s.motion === 'boolean') out.motion = s.motion;
  return out;
}
export function saveSettings(store, settings) {
  const out = {};for (const k of Object.keys(DEFAULT_SETTINGS)) out[k] = settings[k];
  return write(store, SETTINGS_KEY, out);
}

const MODES = ['raid', 'school'];
const validRecord = r => r && typeof r === 'object' && (r.time === null || (Number.isFinite(r.time) && r.time > 0 && r.time < 36000)) &&
  Number.isSafeInteger(r.score) && r.score >= 0 && r.score < 1e7;
export function readRecords(store) {
  const s = read(store, RECORDS_KEY), out = {raid: null, school: null};
  if (s && typeof s === 'object' && !Array.isArray(s)) for (const m of MODES) if (validRecord(s[m])) out[m] = {time: s[m].time, score: s[m].score};
  return out;
}
/**
 * Folds a finished run into the records. Best time counts only recovered cores;
 * best score counts any finished run. Returns which bests improved.
 */
export function recordRun(records, game) {
  if (!game || (game.status !== 'won' && game.status !== 'lost')) return {time: false, score: false};
  const mode = game.training ? 'school' : 'raid', prev = records[mode] ?? {time: null, score: 0};
  const time = game.status === 'won' && (prev.time === null || game.time < prev.time);
  const score = game.score > prev.score;
  records[mode] = {time: time ? game.time : prev.time, score: score ? game.score : prev.score};
  return {time, score};
}
export const saveRecords = (store, records) => write(store, RECORDS_KEY, records);
// Round to tenths once, then split, so 59.96 s reads 01:00.0 rather than 00:60.0.
export function formatTime(t) {
  if (!Number.isFinite(t)) return '--:--';
  const tenths = Math.round(t * 10), minutes = Math.floor(tenths / 600), rest = tenths - minutes * 600;
  return `${String(minutes).padStart(2, '0')}:${String(Math.floor(rest / 10)).padStart(2, '0')}.${rest % 10}`;
}
