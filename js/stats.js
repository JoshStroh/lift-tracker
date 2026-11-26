// Derived numbers: bests, PRs, per-session metrics. Handles one-side-at-a-time sets
// (left values in kg/reps/sec, right values in kgR/repsR/secR).
import * as store from './store.js';
import { e1rm, fmtNum } from './util.js';

const sideVal = (s, side) => (side === 'R' ? { kg: s.kgR, reps: s.repsR, sec: s.secR } : { kg: s.kg, reps: s.reps, sec: s.sec });
export const isSidedSet = (s) => s && (s.repsR != null || s.secR != null || s.kgR != null);

function validSide(kind, v) {
  return kind === 'time' ? v.sec > 0 : v.reps > 0;
}

export function isValidSet(kind, s) {
  if (!s) return false;
  return validSide(kind, sideVal(s, 'L')) || (isSidedSet(s) && validSide(kind, sideVal(s, 'R')));
}

function scoreSide(kind, v) {
  if (!validSide(kind, v)) return null;
  if (kind === 'time') return v.sec || 0;
  if (kind === 'reps') return v.reps || 0;
  return e1rm(v.kg || 0, v.reps || 0) || 0;
}

// For one-side sets the weaker side counts — that's your real capacity.
export function score(kind, s) {
  const l = scoreSide(kind, sideVal(s, 'L'));
  if (!isSidedSet(s)) return l ?? 0;
  const r = scoreSide(kind, sideVal(s, 'R'));
  if (l == null) return r ?? 0;
  if (r == null) return l;
  return Math.min(l, r);
}

export function fmtSec(sec) {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

function labelSide(kind, v, short) {
  if (kind === 'time') return fmtSec(v.sec) || '–';
  if (kind === 'reps') return short ? `${v.reps ?? '–'}` : `${v.reps ?? '–'} reps`;
  return short ? `${fmtNum(v.kg ?? 0)}×${v.reps ?? '–'}` : `${fmtNum(v.kg ?? 0)}kg × ${v.reps ?? '–'}`;
}

export const rirShort = (s) => (s?.rir == null ? '' : `@${s.rir >= 3 ? '3+' : s.rir}`);
const rirLong = (s) => (s?.rir == null ? '' : s.rir === 0 ? ' (max effort)' : ` (${s.rir >= 3 ? '3+' : s.rir} left)`);

export function setLabel(kind, s) {
  if (!s) return '';
  if (isSidedSet(s)) return `L ${labelSide(kind, sideVal(s, 'L'))} · R ${labelSide(kind, sideVal(s, 'R'))}${rirLong(s)}`;
  return labelSide(kind, s) + rirLong(s);
}

export function shortLabel(kind, s) {
  if (!s) return '';
  if (isSidedSet(s)) return `${labelSide(kind, sideVal(s, 'L'), true)}|${labelSide(kind, sideVal(s, 'R'), true)}${rirShort(s)}`;
  return labelSide(kind, s, true) + rirShort(s);
}

export function sideShort(kind, s, side) {
  return s ? labelSide(kind, sideVal(s, side), true) : '';
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

// Left vs right totals for the most recent session that tracked sides.
export function imbalance(kind, sets) {
  const sided = sets.filter(isSidedSet);
  if (!sided.length) return null;
  const tot = (side) => sided.reduce((a, s) => {
    const v = sideVal(s, side);
    if (kind === 'time') return a + (v.sec || 0);
    if (kind === 'reps') return a + (v.reps || 0);
    return a + ((v.kg || 0) > 0 ? v.kg * (v.reps || 0) : v.reps || 0);
  }, 0);
  const l = tot('L'), r = tot('R');
  if (!l || !r) return null;
  const pct = Math.round((1 - Math.min(l, r) / Math.max(l, r)) * 100);
  return { pct, weaker: l < r ? 'Left' : r < l ? 'Right' : null, l, r };
}

export function imbalanceText(imb) {
  if (!imb) return '';
  if (imb.pct < 3 || !imb.weaker) return 'Left and right are balanced';
  return `${imb.weaker} side ${imb.pct}% weaker`;
}

// Metrics available for the progress chart, per exercise kind. fn receives per-side values.
const vals = (sets, side) => sets.map((s) => sideVal(s, side)).filter((v) => v.reps > 0 || v.sec > 0);
const maxOr0 = (arr) => (arr.length ? Math.max(...arr) : null);
const sumOr0 = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) : null);
export const METRICS = {
  weight: [
    { key: 'e1rm', label: 'Est. 1RM', unit: 'kg', fn: (v) => maxOr0(v.map((x) => e1rm(x.kg || 0, x.reps))) },
    { key: 'top', label: 'Heaviest', unit: 'kg', fn: (v) => maxOr0(v.map((x) => x.kg || 0)) },
    { key: 'vol', label: 'Volume', unit: 'kg', fn: (v) => sumOr0(v.map((x) => (x.kg || 0) * x.reps)) },
  ],
  reps: [
    { key: 'max', label: 'Best set', unit: 'reps', fn: (v) => maxOr0(v.map((x) => x.reps)) },
    { key: 'total', label: 'Total reps', unit: 'reps', fn: (v) => sumOr0(v.map((x) => x.reps)) },
  ],
  time: [
    { key: 'max', label: 'Longest', unit: 's', fn: (v) => maxOr0(v.map((x) => x.sec)) },
    { key: 'total', label: 'Total time', unit: 's', fn: (v) => sumOr0(v.map((x) => x.sec)) },
  ],
};

// Series for the chart: one line normally, Left + Right lines when sides were tracked.
export function chartSeries(exerciseId, metric) {
  const hist = historyFor(exerciseId);
  const anySided = hist.some((h) => h.sets.some(isSidedSet));
  const mk = (side, filter) => hist
    .map((h) => {
      const sets = filter ? h.sets.filter(filter) : h.sets;
      const v = metric.fn(vals(sets, side));
      return v == null ? null : { t: new Date(h.session.startedAt).getTime(), v: Math.round(v * 10) / 10, session: h.session };
    })
    .filter(Boolean);
  if (!anySided) return [{ name: '', points: mk('L') }];
  return [
    { name: 'Left', points: mk('L', isSidedSet) },
    { name: 'Right', points: mk('R', isSidedSet) },
  ].filter((s) => s.points.length);
}

// Heaviest weight lifted for at least N reps (weaker side for one-side sets).
export function repMaxes(history) {
  const targets = [1, 3, 5, 8, 10, 12];
  return targets.map((n) => {
    let best = null;
    for (const h of history) for (const s of h.sets) {
      const sides = isSidedSet(s) ? [sideVal(s, 'L'), sideVal(s, 'R')] : [sideVal(s, 'L')];
      if (sides.some((v) => !(v.reps >= n))) continue;
      const kg = Math.min(...sides.map((v) => v.kg || 0));
      if (kg > 0 && (!best || kg > best.kg)) best = { kg, set: s, session: h.session };
    }
    return { reps: n, best };
  });
}

export function sessionVolume(session) {
  let v = 0;
  for (const e of session.exercises) {
    if (store.getExercise(e.exerciseId).kind !== 'weight') continue;
    for (const s of e.sets) {
      if (s.reps > 0) v += (s.kg || 0) * s.reps;
      if (s.repsR > 0) v += (s.kgR || 0) * s.repsR;
    }
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

// ---------- personal records across everything (one pass, oldest → newest) ----------

let prCache = { key: null, value: null };

// Returns { events, bests }:
//   events: every PR set in date order (a set that beat all earlier sessions of that exercise;
//           the very first session of an exercise sets the baseline and is not counted)
//   bests:  Map exerciseId → { best, bestSession, heaviest, heaviestSession, sessions }
export function allPRs() {
  const sessions = store.finishedSessions().slice().reverse();
  const key = sessions.map((s) => s.id + s.updatedAt).join('|');
  if (prCache.key === key) return prCache.value;
  const bests = new Map();
  const events = [];
  for (const s of sessions) {
    const seen = new Set();
    for (const e of s.exercises) {
      const ex = store.getExercise(e.exerciseId);
      const kind = ex.kind || 'weight';
      if (ex.category === 'Recovery' || ex.pattern === 'cardio') continue;
      const sets = e.sets.filter((x) => isValidSet(kind, x));
      if (!sets.length) continue;
      let b = bests.get(e.exerciseId);
      const first = !b;
      if (!b) { b = { best: null, bestScore: -Infinity, bestSession: null, heaviest: 0, heaviestSet: null, heaviestSession: null, sessions: 0, kind }; bests.set(e.exerciseId, b); }
      if (!seen.has(e.exerciseId)) { b.sessions++; seen.add(e.exerciseId); }
      for (const st of sets) {
        const sc = score(kind, st);
        if (sc > b.bestScore + 1e-9) {
          if (!first) events.push({ exerciseId: e.exerciseId, set: st, session: s, kind, score: sc, prev: b.bestScore, prevSet: b.best });
          b.best = st; b.bestScore = sc; b.bestSession = s;
        }
        if (kind === 'weight') {
          const kg = isSidedSet(st) ? Math.min(st.kg || 0, st.kgR ?? st.kg ?? 0) : st.kg || 0;
          if (kg > b.heaviest) { b.heaviest = kg; b.heaviestSet = st; b.heaviestSession = s; }
        }
      }
    }
  }
  prCache = { key, value: { events, bests } };
  return prCache.value;
}
