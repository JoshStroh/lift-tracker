// Derived numbers: bests, PRs, per-session metrics.
import * as store from './store.js';
import { e1rm, fmtNum } from './util.js';

export function isValidSet(kind, s) {
  if (kind === 'time') return s.sec > 0;
  return s.reps > 0;
}

export function score(kind, s) {
  if (kind === 'time') return s.sec || 0;
  if (kind === 'reps') return s.reps || 0;
  return e1rm(s.kg || 0, s.reps || 0) || 0;
}

export function fmtSec(sec) {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

export function setLabel(kind, s) {
  if (!s) return '';
  if (kind === 'time') return fmtSec(s.sec);
  if (kind === 'reps') return `${s.reps ?? ''} reps`;
  return `${fmtNum(s.kg ?? 0)}kg × ${s.reps ?? ''}`;
}

export function shortLabel(kind, s) {
  if (!s) return '';
  if (kind === 'time') return fmtSec(s.sec);
  if (kind === 'reps') return `${s.reps}`;
  return `${fmtNum(s.kg ?? 0)}×${s.reps}`;
}

// Chronological (oldest first) list of {session, sets} for an exercise.
export function historyFor(exerciseId, { before, excludeId } = {}) {
  const kind = store.getExercise(exerciseId).kind;
  const out = [];
  const sessions = store.finishedSessions().slice().reverse();
  for (const s of sessions) {
    if (excludeId && s.id === excludeId) continue;
    if (before && s.startedAt >= before) continue;
    const sets = s.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets).filter((x) => isValidSet(kind, x));
    if (sets.length) out.push({ session: s, sets });
  }
  return out;
}

export function bestSet(kind, sets) {
  let best = null;
  for (const s of sets) if (isValidSet(kind, s) && (!best || score(kind, s) > score(kind, best))) best = s;
  return best;
}

export function bestLabel(kind, set) {
  if (!set) return '';
  if (kind === 'weight') return `${setLabel(kind, set)} (est. 1RM ${fmtNum(score(kind, set))}kg)`;
  return setLabel(kind, set);
}

// Metrics available for the progress chart, per exercise kind.
export const METRICS = {
  weight: [
    { key: 'e1rm', label: 'Est. 1RM', unit: 'kg', fn: (sets) => Math.max(...sets.map((s) => e1rm(s.kg || 0, s.reps))) },
    { key: 'top', label: 'Heaviest', unit: 'kg', fn: (sets) => Math.max(...sets.map((s) => s.kg || 0)) },
    { key: 'vol', label: 'Volume', unit: 'kg', fn: (sets) => sets.reduce((a, s) => a + (s.kg || 0) * s.reps, 0) },
  ],
  reps: [
    { key: 'max', label: 'Best set', unit: 'reps', fn: (sets) => Math.max(...sets.map((s) => s.reps)) },
    { key: 'total', label: 'Total reps', unit: 'reps', fn: (sets) => sets.reduce((a, s) => a + s.reps, 0) },
  ],
  time: [
    { key: 'max', label: 'Longest', unit: 's', fn: (sets) => Math.max(...sets.map((s) => s.sec)) },
    { key: 'total', label: 'Total time', unit: 's', fn: (sets) => sets.reduce((a, s) => a + s.sec, 0) },
  ],
};

// Heaviest weight lifted for at least N reps.
export function repMaxes(history) {
  const targets = [1, 3, 5, 8, 10, 12];
  return targets.map((n) => {
    let best = null;
    for (const h of history) for (const s of h.sets) {
      if (s.reps >= n && (s.kg || 0) > 0 && (!best || s.kg > best.set.kg)) best = { set: s, session: h.session };
    }
    return { reps: n, best };
  });
}

export function sessionVolume(session) {
  let v = 0;
  for (const e of session.exercises) {
    if (store.getExercise(e.exerciseId).kind !== 'weight') continue;
    for (const s of e.sets) if (s.reps > 0) v += (s.kg || 0) * s.reps;
  }
  return v;
}

// Sets in a session that beat everything before that session.
export function prSetsInSession(session) {
  const prs = new Set();
  for (const e of session.exercises) {
    const kind = store.getExercise(e.exerciseId).kind;
    const prior = historyFor(e.exerciseId, { before: session.startedAt, excludeId: session.id });
    if (!prior.length) continue;
    let best = score(kind, bestSet(kind, prior.flatMap((h) => h.sets)));
    for (const s of e.sets) {
      if (!isValidSet(kind, s)) continue;
      const sc = score(kind, s);
      if (sc > best + 1e-9) { prs.add(s); best = sc; }
    }
  }
  return prs;
}
