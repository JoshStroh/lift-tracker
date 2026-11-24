// Progressive-overload suggestions for the next time you do an exercise.
//
// Rules (conservative, injury-aware):
//  • Double progression: keep the weight and add reps until every working set reaches the top of
//    the rep range, then add weight and start again at the bottom of the range.
//  • Load jumps follow the ACSM position stand on progression (Med Sci Sports Exerc 2009):
//    increase 2–10% once the current load can be done for 1–2 reps beyond the target.
//    Here: ~2.5% for upper-body and isolation work, ~5% for lower-body compound lifts,
//    never less than the smallest practical plate/dumbbell step.
//  • Missed the bottom of the range: hold the weight. Missed it two sessions in a row at the
//    same weight: back off ~10% and build up again (a common deload convention).
//  • Long break (3+ weeks): restart at ~90% to ease back in.
//  • Bodyweight / holds: add a rep or 5 s per set; at the top of the range, move to the next
//    calisthenics step (or add reps / weight if there is none).

import * as store from './store.js';
import * as stats from './stats.js';
import * as cali from './cali.js';
import { fmtNum } from './util.js';

const COMPOUND = new Set(['hpush', 'vpush', 'vpull', 'hpull', 'squat', 'hinge', 'lunge']);
const LOWER = new Set(['squat', 'hinge', 'lunge', 'quadiso', 'hamiso', 'glute', 'calf']);

export function parseRange(str) {
  if (!str) return null;
  const m = String(str).match(/(\d+(?:\.\d+)?)\s*(?:[–\-to]+\s*(\d+(?:\.\d+)?))?/);
  if (!m) return null;
  const a = +m[1], b = m[2] ? +m[2] : +m[1];
  return { lo: Math.min(a, b), hi: Math.max(a, b) };
}

export function defaultRange(ex) {
  if (ex.kind === 'time') return ex.pattern === 'stretch' ? { lo: 30, hi: 45 } : { lo: 20, hi: 45 };
  if (ex.kind === 'reps') return { lo: 8, hi: 15 };
  if (COMPOUND.has(ex.pattern)) return { lo: 6, hi: 10 };
  return { lo: 10, hi: 15 };
}

function trackStepFor(exerciseId, entry) {
  const tracks = entry?.track ? [cali.getTrack(entry.track)] : cali.TRACKS;
  for (const t of tracks) {
    if (!t) continue;
    const i = t.steps.findIndex((s) => s.exerciseId === exerciseId);
    if (i >= 0) return { track: t, index: i, step: t.steps[i], next: t.steps[i + 1] || null };
  }
  return null;
}

export function rangeFor(ex, entry) {
  const fromTarget = parseRange(entry?.target);
  if (fromTarget && fromTarget.hi > 0) return fromTarget;
  const ts = trackStepFor(ex.id, entry);
  if (ts) return parseRange(cali.stdTarget(ts.step.std));
  return defaultRange(ex);
}

function stepSize(ex, kg) {
  if (ex.equip === 'db' || ex.equip === 'kb') return kg < 10 ? 1 : 2;
  if (ex.equip === 'bb' || ex.equip === 'sm' || ex.equip === 'ez') return 2.5;
  return kg < 20 ? 1.25 : 2.5;
}

const roundTo = (v, step) => Math.round(v / step) * step;

export function increment(ex, kg) {
  const step = stepSize(ex, kg);
  const pct = LOWER.has(ex.pattern) && COMPOUND.has(ex.pattern) ? 0.05 : 0.025;
  return Math.max(step, roundTo(kg * pct, step));
}

// Weaker side counts for one-side sets.
const effReps = (s) => (stats.isSidedSet(s) && s.repsR != null && s.reps != null ? Math.min(s.reps, s.repsR) : s.reps ?? s.repsR ?? 0);
const effSec = (s) => (stats.isSidedSet(s) && s.secR != null && s.sec != null ? Math.min(s.sec, s.secR) : s.sec ?? s.secR ?? 0);
const effKg = (s) => (stats.isSidedSet(s) && s.kgR != null && s.kg != null ? Math.min(s.kg, s.kgR) : s.kg ?? s.kgR ?? 0);

const list = (arr) => arr.join(', ');
const pctStr = (a, b) => `${Math.round(((b - a) / a) * 100)}%`;

// entry: the exercise inside the workout/plan ({ sets, target, track, sides }); session: to exclude itself.
export function suggest(exerciseId, entry = {}, session = null) {
  const ex = store.getExercise(exerciseId);
  const kind = ex.kind || 'weight';
  const nSets = Math.max(1, entry.sets?.length ?? entry.sets ?? 3);
  const range = rangeFor(ex, entry);
  const hist = stats.historyFor(exerciseId, { excludeId: session?.id, before: session?.endedAt ? session.startedAt : undefined });
  const rangeTxt = kind === 'time' ? `${range.lo}–${range.hi}s` : `${range.lo}–${range.hi}`;

  if (!hist.length) {
    return {
      action: 'first', range, sets: null, title: `Find your ${kind === 'time' ? 'hold' : 'weight'}`,
      reason: kind === 'weight'
        ? `First time: pick a weight you could lift about ${range.hi + 2} times, and do ${range.lo}–${range.hi} clean reps. Leave 2–3 reps in the tank — next time the app builds from there.`
        : `First time: aim for ${rangeTxt}${kind === 'time' ? ' holds' : ' reps'} with good form. Next time the app builds from there.`,
    };
  }

  const last = hist[hist.length - 1];
  const prev = hist[hist.length - 2];
  const daysSince = (Date.now() - new Date(last.session.startedAt)) / 86400000;
  const sided = entry.sides ?? last.sets.some(stats.isSidedSet);
  const imb = sided ? stats.imbalance(kind, last.sets) : null;
  const imbNote = imb && imb.pct >= 10 && imb.weaker ? ` Your ${imb.weaker.toLowerCase()} side was ${imb.pct}% weaker — do it first and let it set the reps for both sides.` : '';
  const mk = (vals) => Array.from({ length: nSets }, (_, i) => {
    const v = vals[Math.min(i, vals.length - 1)];
    return sided ? { ...v, ...(v.kg != null ? { kgR: v.kg } : {}), ...(v.reps != null ? { repsR: v.reps } : {}), ...(v.sec != null ? { secR: v.sec } : {}) } : v;
  });
  const ts = trackStepFor(exerciseId, entry);

  // ---------- weighted ----------
  if (kind === 'weight' && last.sets.some((s) => effKg(s) > 0)) {
    const W = Math.max(...last.sets.map(effKg));
    const atW = last.sets.filter((s) => Math.abs(effKg(s) - W) < 0.01);
    const reps = atW.map(effReps);
    const step = stepSize(ex, W);

    if (daysSince > 21) {
      const kg = Math.max(step, roundTo(W * 0.9, step));
      return { action: 'return', range, sets: mk([{ kg, reps: range.lo }]), title: `${fmtNum(kg)} kg × ${range.lo}`,
        reason: `It's been ${Math.round(daysSince)} days since you last did this. Ease back in at about 90% (${fmtNum(kg)} kg instead of ${fmtNum(W)} kg) for ${range.lo} reps, then resume normal progression.${imbNote}` };
    }
    if (reps.length && reps.every((r) => r >= range.hi)) {
      const inc = increment(ex, W);
      const kg = W + inc;
      return { action: 'increase', range, sets: mk([{ kg, reps: range.lo }]), title: `↑ ${fmtNum(kg)} kg × ${range.lo}`,
        reason: `You hit the top of your ${rangeTxt} range on every set at ${fmtNum(W)} kg (${list(reps)}). Add ${fmtNum(inc)} kg (${pctStr(W, kg)}) and start again at ${range.lo} reps. Guidelines suggest a 2–10% jump once you can beat your target reps.${inc / W > 0.1 ? ` That's the smallest step available here but more than 10%, so expect fewer reps at first — if form slips, go back to ${fmtNum(W)} kg and add a rep or two instead.` : ''}${imbNote}` };
    }
    if (reps.some((r) => r < range.lo)) {
      const prevAtW = prev ? prev.sets.filter((s) => Math.abs(effKg(s) - W) < 0.01).map(effReps) : [];
      const stalled = prevAtW.length && prevAtW.some((r) => r < range.lo) && prevAtW.reduce((a, b) => a + b, 0) >= reps.reduce((a, b) => a + b, 0);
      if (stalled) {
        const kg = Math.max(step, roundTo(W * 0.9, step));
        const mid = Math.round((range.lo + range.hi) / 2);
        return { action: 'deload', range, sets: mk([{ kg, reps: mid }]), title: `↓ ${fmtNum(kg)} kg × ${mid}`,
          reason: `Two sessions in a row below ${range.lo} reps at ${fmtNum(W)} kg (${list(prevAtW)} → ${list(reps)}). Back off about 10% to ${fmtNum(kg)} kg for ${mid} solid reps and build up again — pushing a stalled weight is where form breaks down.${imbNote}` };
      }
      return { action: 'hold', range, sets: mk(atW.length ? atW.map((s) => ({ kg: W, reps: Math.max(range.lo, Math.min(range.hi, effReps(s) + 1)) })) : [{ kg: W, reps: range.lo }]), title: `= ${fmtNum(W)} kg × ${range.lo}+`,
        reason: `Last time some sets fell short of ${range.lo} reps at ${fmtNum(W)} kg (${list(reps)}). Stay at this weight and aim for at least ${range.lo} on every set before adding load.${imbNote}` };
    }
    const target = atW.map((s) => ({ kg: W, reps: Math.min(range.hi, effReps(s) + 1) }));
    return { action: 'reps', range, sets: mk(target), title: `${fmtNum(W)} kg × ${target.map((t) => t.reps).join('·')}`,
      reason: `Same weight, one more rep per set (last time: ${list(reps)}). Once every set reaches ${range.hi}, the app will suggest adding weight.${imbNote}` };
  }

  // ---------- bodyweight reps ----------
  if (kind !== 'time') {
    const reps = last.sets.map(effReps);
    if (daysSince > 21) {
      const r = Math.max(1, Math.min(...reps) - 2);
      return { action: 'return', range, sets: mk([{ reps: r }]), title: `${r} reps`, reason: `It's been ${Math.round(daysSince)} days. Start a couple of reps below last time and build back up.${imbNote}` };
    }
    if (reps.every((r) => r >= range.hi)) {
      if (ts?.next && last.sets.length >= 3) {
        return { action: 'harder', range, sets: mk([{ reps: range.hi }]), title: `Try ${ts.next.name}`,
          reason: `You own this one (${list(reps)} — goal ${cali.stdLabel(ts.step.std)}). Level up on the ${ts.track.name} track and move to ${ts.next.name}; keep 1–2 sets of this as a warm-up.${imbNote}` };
      }
      const r = range.hi + 2;
      return { action: 'reps', range, sets: mk([{ reps: r }]), title: `${r} reps`,
        reason: `You reached ${range.hi}+ on every set (${list(reps)}). Keep adding reps, or make it harder (slower lowering, pause, a weight vest or a harder variation).${imbNote}` };
    }
    const target = last.sets.map((s) => ({ reps: Math.min(range.hi, effReps(s) + 1) }));
    return { action: 'reps', range, sets: mk(target), title: `${target.map((t) => t.reps).join('·')} reps`,
      reason: `One more rep per set than last time (${list(reps)}), working towards ${range.hi} on every set.${imbNote}` };
  }

  // ---------- holds ----------
  const secs = last.sets.map(effSec);
  if (daysSince > 21) {
    const s = Math.max(5, Math.min(...secs) - 5);
    return { action: 'return', range, sets: mk([{ sec: s }]), title: `${s}s holds`, reason: `It's been ${Math.round(daysSince)} days. Start 5 s below last time and build back up.${imbNote}` };
  }
  if (secs.every((s) => s >= range.hi)) {
    if (ts?.next && last.sets.length >= 3) {
      return { action: 'harder', range, sets: mk([{ sec: range.hi }]), title: `Try ${ts.next.name}`,
        reason: `You held ${list(secs.map((s) => s + 's'))} — that meets the goal (${cali.stdLabel(ts.step.std)}). Move on to ${ts.next.name}.${imbNote}` };
    }
    const s = range.hi + 5;
    return { action: 'reps', range, sets: mk([{ sec: s }]), title: `${s}s holds`, reason: `Every hold reached ${range.hi}s. Add 5 s per hold.${imbNote}` };
  }
  const target = last.sets.map((s) => ({ sec: Math.min(range.hi, effSec(s) + 5) }));
  return { action: 'reps', range, sets: mk(target), title: `${target.map((t) => t.sec + 's').join('·')}`,
    reason: `Add about 5 s to each hold (last time: ${list(secs.map((s) => s + 's'))}), working towards ${range.hi}s.${imbNote}` };
}

export const ICON = { increase: '↑', reps: '+', hold: '=', deload: '↓', return: '↺', harder: '★', first: '•' };
