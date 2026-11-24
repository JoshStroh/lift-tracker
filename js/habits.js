// Pre-workout habits (coffee, creatine, fasted) and how they relate to performance.
//
// Performance score for a workout: for every lift (weight or reps exercises), the best set's
// score (est. 1RM / reps) divided by the median of that exercise's previous 5 sessions.
// The workout's score is the average of those ratios, so 1.03 = 3% better than your recent norm.
// Comparing scores with vs without a habit removes the effect of which exercises you did and
// of long-term strength gains.

import * as store from './store.js';
import * as stats from './stats.js';

export const HABITS = [
  { key: 'coffee', icon: '☕', label: 'Coffee', no: 'No coffee' },
  { key: 'creatine', icon: '💊', label: 'Creatine', no: 'No creatine' },
  { key: 'fasted', icon: '🍽️', label: 'Fasted', no: 'Fed' },
];

// New workouts start with whatever you did last time.
export function defaultTags() {
  const last = store.finishedSessions().find((s) => s.tags);
  return { coffee: false, creatine: false, fasted: false, ...(last?.tags || {}) };
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

let cache = { key: '', map: new Map() };

// Map sessionId -> { index, n } (n = exercises that had a baseline).
export function performanceIndex() {
  const sessions = store.finishedSessions().slice().reverse(); // oldest first
  const key = sessions.map((s) => s.id + s.updatedAt).join('|');
  if (cache.key === key) return cache.map;
  const hist = new Map(); // exerciseId -> previous scores
  const map = new Map();
  for (const s of sessions) {
    const ratios = [];
    const seen = new Set();
    for (const e of s.exercises) {
      if (seen.has(e.exerciseId)) continue;
      seen.add(e.exerciseId);
      const ex = store.getExercise(e.exerciseId);
      if (ex.kind === 'time' || ex.pattern === 'stretch' || ex.pattern === 'cardio') continue;
      const best = stats.bestSet(ex.kind, e.sets);
      if (!best) continue;
      const sc = stats.score(ex.kind, best);
      if (!(sc > 0)) continue;
      const prev = hist.get(e.exerciseId) || [];
      if (prev.length) ratios.push(sc / median(prev.slice(-5)));
      hist.set(e.exerciseId, [...prev, sc]);
    }
    if (ratios.length) map.set(s.id, { index: ratios.reduce((a, b) => a + b, 0) / ratios.length, n: ratios.length });
  }
  cache = { key, map };
  return map;
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, a.length - 1)); };

export const MIN_N = 3;

// For each habit: average score with vs without, and whether the gap beats normal variation.
export function compare() {
  const idx = performanceIndex();
  const scored = store.finishedSessions().filter((s) => s.tags && idx.has(s.id));
  const all = scored.map((s) => idx.get(s.id).index);
  const noise = all.length >= 4 ? sd(all) : null;
  return HABITS.map((h) => {
    const yes = scored.filter((s) => s.tags[h.key] === true).map((s) => idx.get(s.id).index);
    const no = scored.filter((s) => s.tags[h.key] === false).map((s) => idx.get(s.id).index);
    const enough = yes.length >= MIN_N && no.length >= MIN_N;
    const diff = enough ? (mean(yes) / mean(no) - 1) * 100 : null;
    // standard error of the difference, in %
    const se = enough && noise != null ? noise * Math.sqrt(1 / yes.length + 1 / no.length) * 100 : null;
    let verdict = '';
    if (!enough) verdict = `Needs ${MIN_N}+ workouts each way (${yes.length} with, ${no.length} without).`;
    else if (se != null && Math.abs(diff) < 2 * se) verdict = 'Within your normal day-to-day variation — no clear effect yet.';
    else verdict = diff > 0 ? `You tend to perform better with ${h.label.toLowerCase()}.` : `You tend to perform better ${h.key === 'fasted' ? 'fed' : `without ${h.label.toLowerCase()}`}.`;
    return { ...h, yes: yes.length, no: no.length, diff, verdict, clear: enough && se != null && Math.abs(diff) >= 2 * se };
  });
}
