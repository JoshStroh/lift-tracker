// Achievements: computed entirely from your own logged data (so they also unlock
// retroactively from history). Each achievement is a metric + a target; ladders of the
// same metric get bronze → silver → gold → platinum.
//
// Design rules: reward consistency, skills and milestones — nothing that rewards training
// to failure or daily streaks (rest days matter, so streaks are weekly with a rest-week pass).

import * as store from './store.js';
import * as stats from './stats.js';
import * as cali from './cali.js';
import { exId } from './catalog.js';
import { fmtNum, localDate } from './util.js';

export const TIER_NAMES = ['', 'Bronze', 'Silver', 'Gold', 'Platinum'];
export const FAMILIES = ['Strength', 'Bodyweight', 'Skills', 'Consistency', 'Volume', 'Milestones', 'Fun'];

const G = {
  bench: ['Bench Press'],
  squat: ['Squat', 'Box Squat'],
  deadlift: ['Deadlift', 'Sumo Deadlift', 'Trap Bar Deadlift'],
  ohp: ['Overhead Press'],
  curl: ['Dumbbell Curl', 'Single-Arm Dumbbell Curl', 'Hammer Curl', 'Incline Dumbbell Curl'],
  pushup: ['Push Up', 'Wide Push-Up', 'Diamond Push-Up', 'Decline Push-Up'],
  pullup: ['Pull Up', 'Chin Up', 'Neutral-Grip Pull-Up', 'Wide-Grip Pull-Up', 'Chest-to-Bar Pull-Up'],
  dip: ['Dip'],
  pistol: ['Pistol Squat', 'Weighted Pistol Squat'],
  muscleup: ['Muscle-Up', 'Slow Muscle-Up', 'Kipping Muscle-Up'],
  hspu: ['Wall Handstand Push-Up', 'Deficit Handstand Push-Up', 'Freestanding Handstand Push-Up'],
  plank: ['Plank'],
  handstand: ['Freestanding Handstand'],
  lsit: ['L-Sit', 'V-Sit'],
  tuckfl: ['Tuck Front Lever', 'Advanced Tuck Front Lever', 'One-Leg Front Lever', 'Straddle Front Lever', 'Front Lever'],
  fullfl: ['Front Lever'],
  fullbl: ['Back Lever'],
  tuckpl: ['Tuck Planche', 'Advanced Tuck Planche', 'Straddle Planche', 'Full Planche'],
  fullpl: ['Full Planche'],
};
const GROUP_OF = new Map();
for (const [g, names] of Object.entries(G)) for (const n of names) {
  const id = exId(n);
  GROUP_OF.set(id, [...(GROUP_OF.get(id) || []), g]);
}

// ---------- definitions ----------

const DEFS = [];
const ladder = (family, metric, icon, title, targets, { unit = '', desc, fmt, hidden } = {}) => {
  targets.forEach((t, i) => DEFS.push({
    id: `${metric}-${t}`, family, metric, target: t, icon,
    tier: targets.length === 1 ? (/full/.test(metric) ? 4 : 3) : Math.min(4, Math.max(1, Math.round(((i + 1) / targets.length) * 4))),
    title: typeof title === 'function' ? title(t) : `${title} ${fmt ? fmt(t) : `${fmtNum(t)}${unit}`}`,
    desc: typeof desc === 'function' ? desc(t) : desc || '',
    unit, fmt, hidden: !!hidden,
  }));
};
const secFmt = (s) => (s >= 60 ? `${s / 60} min` : `${s}s`);
const xBW = (x) => `${x}× bodyweight`;

ladder('Strength', 'kg:bench', '🏋️', 'Bench', [40, 60, 80, 100, 120, 140], { unit: ' kg', desc: 'Bench press this weight for at least 1 rep.' });
ladder('Strength', 'kg:squat', '🦵', 'Squat', [60, 100, 140, 180, 220], { unit: ' kg', desc: 'Back squat this weight for at least 1 rep.' });
ladder('Strength', 'kg:deadlift', '⛓️', 'Deadlift', [100, 140, 180, 220, 260], { unit: ' kg', desc: 'Deadlift this weight for at least 1 rep.' });
ladder('Strength', 'kg:ohp', '🙌', 'Overhead press', [30, 40, 60, 80], { unit: ' kg', desc: 'Strict standing press for at least 1 rep.' });
ladder('Strength', 'kg:curl', '💪', 'Curl', [10, 15, 20, 25, 30], { unit: ' kg dumbbell', desc: 'Curl a dumbbell of this weight (per hand) for at least 1 rep.' });
ladder('Strength', 'bw:bench', '⚖️', (t) => `Bench ${xBW(t)}`, [0.75, 1, 1.25, 1.5], { desc: 'Relative to your logged body weight.' });
ladder('Strength', 'bw:squat', '⚖️', (t) => `Squat ${xBW(t)}`, [1, 1.5, 2], { desc: 'Relative to your logged body weight.' });
ladder('Strength', 'bw:deadlift', '⚖️', (t) => `Deadlift ${xBW(t)}`, [1.5, 2, 2.5], { desc: 'Relative to your logged body weight.' });

ladder('Bodyweight', 'reps:pushup', '🫸', (t) => `${t} push-ups`, [10, 25, 50, 75, 100], { desc: 'In a single set.' });
ladder('Bodyweight', 'reps:pullup', '🧗', (t) => (t === 1 ? 'First pull-up' : `${t} pull-ups`), [1, 5, 10, 15, 20], { desc: 'Strict, in a single set (chin-ups count).' });
ladder('Bodyweight', 'reps:dip', '⬇️', (t) => `${t} dips`, [5, 10, 20, 30], { desc: 'Bodyweight dips in a single set.' });
ladder('Bodyweight', 'reps:pistol', '🔫', (t) => (t === 1 ? 'First pistol squat' : `${t} pistol squats`), [1, 5, 10], { desc: 'Each leg, in a single set.' });
ladder('Bodyweight', 'reps:hspu', '🙃', (t) => (t === 1 ? 'First handstand push-up' : `${t} handstand push-ups`), [1, 5, 10], { desc: 'Wall or freestanding, full range.' });
ladder('Bodyweight', 'sec:plank', '🪵', (t) => `${secFmt(t)} plank`, [60, 120, 300], { desc: 'One continuous hold.' });

ladder('Skills', 'reps:muscleup', '🚀', (t) => (t === 1 ? 'First muscle-up' : `${t} muscle-ups`), [1, 5, 10], { desc: 'Over the bar in one movement.' });
ladder('Skills', 'sec:handstand', '🤸', (t) => `${t}s freestanding handstand`, [10, 30, 60], { desc: 'No wall.' });
ladder('Skills', 'sec:lsit', '🪑', (t) => `${t}s L-sit`, [10, 20, 30], { desc: 'Full L-sit (legs straight).' });
ladder('Skills', 'sec:tuckfl', '🦅', () => 'Tuck front lever', [10], { desc: 'Hold any front lever variation for 10 s.' });
ladder('Skills', 'sec:fullfl', '🦅', () => 'Full front lever', [5], { desc: 'Hold for 5 s.' });
ladder('Skills', 'sec:fullbl', '🦇', () => 'Full back lever', [5], { desc: 'Hold for 5 s.' });
ladder('Skills', 'sec:tuckpl', '🛸', () => 'Tuck planche', [5], { desc: 'Hold any planche variation for 5 s.' });
ladder('Skills', 'sec:fullpl', '🛸', () => 'Full planche', [3], { desc: 'Hold for 3 s. Very few people ever get here.' });
ladder('Skills', 'calirank', '🎖️', (t) => `Calisthenics rank: ${cali.TIERS[t]}`, [1, 2, 3, 4], { desc: 'Earn points by levelling up calisthenics tracks.' });

ladder('Consistency', 'workouts', '📅', (t) => (t === 1 ? 'First workout' : `${t} workouts`), [1, 10, 25, 50, 100, 250, 500], { desc: 'Finished workouts.' });
ladder('Consistency', 'streak', '🔥', (t) => `${t}-week streak`, [2, 4, 12, 26, 52], { desc: '3+ workouts a week, weeks in a row. One quiet week per quarter is forgiven.' });

const VOL = [[1500, 'a car'], [6000, 'an elephant'], [12000, 'a school bus'], [40000, 'a loaded truck'], [150000, 'a blue whale'], [400000, 'a jumbo jet']];
VOL.forEach(([kg, what], i) => DEFS.push({ id: `volume-${kg}`, family: 'Volume', metric: 'volume', target: kg, icon: ['🚗', '🐘', '🚌', '🚛', '🐋', '✈️'][i], tier: Math.min(4, i + 1 > 4 ? 4 : i + 1), title: `Lifted ${what}`, desc: `${fmtNum(kg / 1000)} tonnes of total volume (weight × reps, all time).`, unit: ' kg' }));

ladder('Milestones', 'prs', '🏆', (t) => (t === 1 ? 'First PR' : `${t} PRs`), [1, 10, 25, 50, 100], { desc: 'Personal records set.' });
ladder('Milestones', 'exercises', '🧭', (t) => `${t} different exercises`, [10, 25, 50], { desc: 'Variety keeps things interesting.' });
ladder('Milestones', 'recovery', '🧘', (t) => (t === 1 ? 'First recovery session' : `${t} recovery sessions`), [1, 10, 25], { desc: 'Workouts with stretching or rolling.' });
ladder('Milestones', 'bwlogs', '📉', (t) => (t === 1 ? 'First weigh-in' : `${t} weigh-ins`), [1, 10, 30], { desc: 'Body weight entries.' });

const fun = (id, icon, title, desc, hidden = true) => DEFS.push({ id, family: 'Fun', metric: id, target: 1, icon, tier: 2, title, desc, hidden });
fun('earlybird', '🌅', 'Early bird', 'Start a workout before 7 am.');
fun('nightowl', '🦉', 'Night owl', 'Start a workout after 9 pm.');
fun('comeback', '🔁', 'The comeback', 'Train again after 3+ weeks off.');
fun('doubleday', '✌️', 'Two-a-day', 'Finish two workouts on the same day.');
fun('century', '💯', 'Century', '100+ total reps of one exercise in a single workout.');

export const ALL = DEFS;

// ---------- engine ----------

function weekKey(d) {
  const x = new Date(d); x.setHours(12, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday
  return localDate(x);
}

// Returns { metrics: Map metric → [[value, dateISO], ...] increasing }, computed over finished
// workouts plus (optionally) the done sets of the workout in progress.
function buildMetrics({ includeActive = true } = {}) {
  const metrics = new Map();
  const reach = (k, v, date) => {
    const arr = metrics.get(k) || [];
    if (!arr.length || v > arr[arr.length - 1][0] + 1e-9) { arr.push([v, date]); metrics.set(k, arr); }
  };
  const bw = store.docs('bodyweight').filter((d) => d.kg > 0).sort((a, b) => a.date.localeCompare(b.date));
  const bwAt = (iso) => {
    if (!bw.length) return null;
    const ymd = iso.slice(0, 10);
    let best = bw[0];
    for (const e of bw) if (e.date <= ymd) best = e;
    return best.kg;
  };
  bw.forEach((e, i) => reach('bwlogs', i + 1, e.date + 'T12:00:00'));

  const finished = store.finishedSessions().slice().reverse();
  const active = includeActive ? store.activeSession() : null;
  const sessions = active ? [...finished, active] : finished;

  let workouts = 0, volume = 0, recovery = 0, lastDay = null, lastStart = null;
  const seenEx = new Set();
  const perDay = new Map();
  for (const s of sessions) {
    const date = s.startedAt;
    const isActive = s === active;
    for (const e of s.exercises) {
      const ex = store.getExercise(e.exerciseId);
      const kind = ex.kind || 'weight';
      const sets = e.sets.filter((x) => (isActive ? x.done : true) && stats.isValidSet(kind, x));
      if (!sets.length) continue;
      if (!seenEx.has(e.exerciseId)) { seenEx.add(e.exerciseId); reach('exercises', seenEx.size, date); }
      const groups = GROUP_OF.get(e.exerciseId) || [];
      let totalReps = 0;
      for (const st of sets) {
        const sided = stats.isSidedSet(st);
        const reps = sided ? Math.min(st.reps ?? 0, st.repsR ?? 0) : st.reps ?? 0;
        const sec = sided ? Math.min(st.sec ?? 0, st.secR ?? 0) : st.sec ?? 0;
        const kg = sided ? Math.min(st.kg ?? 0, st.kgR ?? st.kg ?? 0) : st.kg ?? 0;
        totalReps += (st.reps || 0) + (st.repsR || 0);
        for (const g of groups) {
          if (kind === 'weight' && reps >= 1 && kg > 0) {
            reach(`kg:${g}`, kg, date);
            const b = bwAt(date);
            if (b) reach(`bw:${g}`, kg / b, date);
          }
          if (reps > 0) reach(`reps:${g}`, reps, date);
          if (sec > 0) reach(`sec:${g}`, sec, date);
        }
      }
      if (totalReps >= 100) reach('century', 1, date);
    }
    if (isActive) continue; // counters below only for finished workouts
    workouts++;
    reach('workouts', workouts, date);
    volume += stats.sessionVolume(s);
    reach('volume', volume, date);
    if (s.exercises.some((e) => store.getExercise(e.exerciseId).category === 'Recovery')) { recovery++; reach('recovery', recovery, date); }
    const h = new Date(date).getHours();
    if (h < 7) reach('earlybird', 1, date);
    if (h >= 21) reach('nightowl', 1, date);
    if (lastStart && new Date(date) - new Date(lastStart) > 21 * 86400000) reach('comeback', 1, date);
    lastStart = date;
    const day = localDate(new Date(date));
    perDay.set(day, (perDay.get(day) || 0) + 1);
    if (perDay.get(day) >= 2) reach('doubleday', 1, date);
    lastDay = day;
  }

  // weekly streak (3+ workouts per Monday-week), one missed week per 13 weeks is forgiven
  const weeks = new Map();
  for (const s of finished) { const k = weekKey(s.startedAt); const w = weeks.get(k) || []; w.push(s.startedAt); weeks.set(k, w); }
  if (weeks.size) {
    const keys = [...weeks.keys()].sort();
    const thisWeek = weekKey(new Date().toISOString());
    let cur = 0, passAt = -99, i = 0;
    for (let d = new Date(keys[0] + 'T12:00:00'); localDate(d) <= thisWeek; d.setDate(d.getDate() + 7), i++) {
      const k = localDate(d);
      const list = weeks.get(k) || [];
      if (list.length >= 3) { cur++; reach('streak', cur, list[2]); }
      else if (k === thisWeek) { /* week in progress: doesn't break the streak */ }
      else if (cur > 0 && i - passAt > 13) passAt = i;      // rest-week pass
      else cur = 0;
    }
    metrics.set('_streakNow', [[cur, null]]);
  }

  // calisthenics rank (current)
  const r = cali.rank();
  if (r.tier > 0) for (let t = 1; t <= r.tier; t++) reach('calirank', t, null);

  // PRs (finished workouts)
  stats.allPRs().events.forEach((ev, i) => reach('prs', i + 1, ev.session.startedAt));
  return metrics;
}

export function evaluate(opts) {
  const metrics = buildMetrics(opts);
  return ALL.map((d) => {
    const arr = metrics.get(d.metric) || [];
    const value = arr.length ? arr[arr.length - 1][0] : 0;
    const hit = arr.find(([v]) => v >= d.target - 1e-9);
    return { ...d, value, unlocked: !!hit, unlockedAt: hit ? hit[1] : null, progress: Math.min(1, value / d.target) };
  });
}

export function streakNow() {
  return buildMetrics({ includeActive: false }).get('_streakNow')?.[0]?.[0] || 0;
}

export function progressText(a) {
  if (a.metric.startsWith('bw:')) return a.value ? `${(Math.floor(a.value * 100) / 100).toFixed(2)}× / ${a.target}×` : 'Log your body weight';
  if (a.metric.startsWith('sec:')) return `${fmtNum(a.value)}s / ${a.target}s`;
  if (a.metric.startsWith('kg:') || a.metric === 'volume') return `${fmtNum(a.metric === 'volume' ? a.value / 1000 : a.value)} / ${fmtNum(a.metric === 'volume' ? a.target / 1000 : a.target)} ${a.metric === 'volume' ? 't' : 'kg'}`;
  return `${fmtNum(a.value)} / ${fmtNum(a.target)}`;
}

// ---------- "seen" bookkeeping (per device) ----------

export function seen() { return store.state.settings.achSeen || {}; }

// Achievements unlocked but not yet celebrated.
export function fresh(opts) {
  const s = seen();
  return evaluate(opts).filter((a) => a.unlocked && !s[a.id]);
}

export async function markSeen(list) {
  if (!list.length) return;
  const s = { ...seen() };
  const now = new Date().toISOString();
  for (const a of list) s[a.id] = a.unlockedAt || now;
  await store.saveSettings({ achSeen: s });
}

export function almostThere(n = 3) {
  return evaluate({ includeActive: false })
    .filter((a) => !a.unlocked && !a.hidden && a.progress >= 0.6 && a.value > 0)
    .sort((x, y) => y.progress - x.progress)
    .slice(0, n);
}
