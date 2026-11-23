// In-memory state backed by IndexedDB. Every change is saved locally first and
// marked "dirty"; the sync module later pushes dirty records to GitHub.

import * as db from './db.js';
import { BUILTIN_EXERCISES } from './exercises.js';

const DEFAULT_SETTINGS = {
  unit: 'kg',
  restSeconds: 90,
  gh: { owner: '', repo: '', token: '', folder: 'data' },
};

export const state = {
  records: new Map(),
  settings: structuredClone(DEFAULT_SETTINGS),
  sync: { status: 'off', lastAt: null, error: null, message: '' },
};

const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
export const emit = () => listeners.forEach((fn) => fn());

export async function init() {
  for (const r of await db.allRecords()) state.records.set(r.id, r);
  const saved = (await db.kvGet('settings')) || {};
  state.settings = { ...DEFAULT_SETTINGS, ...saved, gh: { ...DEFAULT_SETTINGS.gh, ...(saved.gh || {}) } };
  state.sync.lastAt = (await db.kvGet('lastSyncAt')) || null;
}

// ---------- documents ----------

export function docs(type) {
  const out = [];
  for (const r of state.records.values()) if (r.type === type && !r.doc.deleted) out.push(r.doc);
  return out;
}

export function getDoc(id) {
  const r = state.records.get(id);
  return r && !r.doc.deleted ? r.doc : null;
}

export async function saveDoc(doc, { render = true } = {}) {
  doc.updatedAt = new Date().toISOString();
  const prev = state.records.get(doc.id);
  const rec = { id: doc.id, type: doc.type, doc, dirty: true, sha: prev?.sha ?? null };
  state.records.set(doc.id, rec);
  await db.putRecords([rec]);
  if (render) emit();
  scheduleSync();
}

// Deletions are kept as tombstones so they sync to other devices.
export async function deleteDoc(doc) {
  const tomb = { id: doc.id, type: doc.type, deleted: true };
  await saveDoc(tomb);
}

export async function applyRemote(doc, sha) {
  const rec = { id: doc.id, type: doc.type, doc, dirty: false, sha };
  state.records.set(doc.id, rec);
  await db.putRecords([rec]);
}

export async function updateRecordMeta(id, patch) {
  const rec = state.records.get(id);
  if (!rec) return;
  Object.assign(rec, patch);
  await db.putRecords([rec]);
}

export async function replaceAll(recs) {
  await db.clearRecords();
  state.records.clear();
  for (const r of recs) state.records.set(r.id, r);
  await db.putRecords(recs);
  emit();
}

// ---------- settings ----------

export async function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch, gh: { ...state.settings.gh, ...(patch.gh || {}) } };
  await db.kvSet('settings', state.settings);
  emit();
}

export async function setLastSync(iso) {
  state.sync.lastAt = iso;
  await db.kvSet('lastSyncAt', iso);
}

// ---------- derived data ----------

export function exercises() {
  const custom = docs('exercise');
  return [...BUILTIN_EXERCISES, ...custom].sort((a, b) => a.name.localeCompare(b.name));
}

const BUILTIN_BY_ID = new Map(BUILTIN_EXERCISES.map((e) => [e.id, e]));

export function getExercise(id) {
  return BUILTIN_BY_ID.get(id) || getDoc(id) || { id, name: 'Unknown exercise', kind: 'weight', category: 'Other', photo: '' };
}

export const exerciseName = (id) => getExercise(id).name;

export function sessions() {
  return docs('session').sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
}

export function finishedSessions() {
  return sessions().filter((s) => s.endedAt);
}

export function activeSession() {
  return sessions().find((s) => !s.endedAt) || null;
}

// Most recent finished session's sets for an exercise (excluding a given session).
export function previousSets(exerciseId, excludeId) {
  for (const s of finishedSessions()) {
    if (s.id === excludeId) continue;
    const ex = s.exercises.find((e) => e.exerciseId === exerciseId);
    if (ex && ex.sets.length) return ex.sets;
  }
  return [];
}

// ---------- sync scheduling ----------

let syncHandler = null;
let syncTimer = null;
export const setSyncHandler = (fn) => { syncHandler = fn; };

export function scheduleSync(delayMs = 8000) {
  if (!syncHandler) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncHandler(), delayMs);
}

export function syncConfigured() {
  const g = state.settings.gh;
  return !!(g.owner && g.repo && g.token);
}

export function dirtyCount() {
  let n = 0;
  for (const r of state.records.values()) if (r.dirty) n++;
  return n;
}
