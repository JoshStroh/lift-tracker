// Calisthenics progression tracks.
//
// Built from the r/bodyweightfitness Recommended Routine progressions (work in 3 sets of 5–8,
// move up once you own the top of the range) and the Overcoming Gravity skill ladders
// (tuck → advanced tuck → one leg / straddle → full for static holds).
//
// Step: [exercise name, standard, tier, tip?]
//   standard: 'r8' = 3 sets of 8 reps (each side for one-side moves), 't30' = 3 holds of 30 s
//   tier: 1 Beginner · 2 Novice · 3 Intermediate · 4 Advanced · 5 Elite
// Equipment assumed: pull-up bar, dip station/machine, floor, dumbbells as parallettes,
// plus a waist-height bar (Smith machine / squat rack) for rows.

import * as store from './store.js';
import { exId } from './catalog.js';
import * as stats from './stats.js';

export const TIERS = ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'];
export const RANK_POINTS = [0, 15, 45, 100, 170]; // points needed for each tier

const T = (id, name, group, blurb, steps) => ({
  id, name, group, blurb,
  steps: steps.map(([ex, std, tier, tip]) => ({ exerciseId: exId(ex), name: ex, std, tier, tip: tip || '' })),
});

export const TRACKS = [
  T('pullup', 'Pull-up', 'Strength', 'Vertical pulling — the backbone of upper-body calisthenics.', [
    ['Dead Hang', 't30', 1, 'Hang with straight arms, shoulders engaged, not shrugged to the ears.'],
    ['Scapular Pull-Up', 'r10', 1, 'Straight arms; pull the shoulder blades down and back to lift a few cm.'],
    ['Pull-Up Negative', 'r5', 1, 'Jump to the top, lower yourself over 5 seconds.'],
    ['Pull Up', 'r8', 2, 'Full hang to chin over the bar.'],
    ['Chest-to-Bar Pull-Up', 'r5', 3, 'Pull until your chest touches the bar — key for muscle-ups.'],
    ['Archer Pull-Up', 'r5', 4, 'One arm pulls while the other straightens along the bar.'],
    ['One-Arm Pull-Up Negative', 'r3', 4, 'Lower with one arm as slowly as you can.'],
    ['One-Arm Pull-Up', 'r1', 5],
  ]),
  T('dips', 'Dips', 'Strength', 'Vertical pushing on the dip station.', [
    ['Support Hold', 't30', 1, 'Locked arms, shoulders pushed down, body still.'],
    ['Assisted Dip', 'r8', 1, 'Use the assisted dip machine; reduce the assistance over time.'],
    ['Dip Negative', 'r5', 1, 'Lower over 5 seconds until shoulders are just below elbows.'],
    ['Dip', 'r8', 2],
    ['Weighted Dip', 'r5', 3, 'Add weight with a belt or a dumbbell between the feet.'],
    ['Russian Dip', 'r5', 4, 'At the bottom, drop onto the forearms and push back up.'],
  ]),
  T('rows', 'Rows', 'Strength', 'Horizontal pulling for a balanced back.', [
    ['Vertical Row', 'r8', 1, 'Hold a door frame or post and lean back.'],
    ['Incline Row', 'r8', 1, 'Bar at chest height (Smith machine or squat rack), body at an angle.'],
    ['Australian Row', 'r8', 2, 'Bar at waist height, body straight, pull chest to bar.'],
    ['Wide Australian Row', 'r8', 2],
    ['Archer Row', 'r5', 3, 'One arm pulls, the other stays straight.'],
    ['Tuck Front Lever Row', 'r5', 4, 'Row from a tuck front lever on the pull-up bar.'],
    ['One-Arm Inverted Row', 'r5', 4],
  ]),
  T('pushup', 'Push-up', 'Strength', 'Horizontal pushing, from wall push-ups to one arm.', [
    ['Wall Push-Up', 'r12', 1],
    ['Incline Push-Up', 'r10', 1, 'Hands on a bench or box; lower the incline over time.'],
    ['Push Up', 'r10', 1, 'Body in a straight line, chest to the floor.'],
    ['Diamond Push-Up', 'r8', 2],
    ['Decline Push-Up', 'r8', 2, 'Feet on a bench.'],
    ['Pseudo Planche Push-Up', 'r8', 3, 'Hands by the hips, lean shoulders forward past the hands. Dumbbell handles spare the wrists.'],
    ['Archer Push-Up', 'r5', 3],
    ['Incline One-Arm Push-Up', 'r5', 4],
    ['One-Arm Push-Up', 'r3', 4],
  ]),
  T('squat', 'Squat', 'Strength', 'Leg strength towards pistol and shrimp squats.', [
    ['Assisted Squat', 'r12', 1, 'Hold onto something for balance.'],
    ['Bodyweight Squat', 'r20', 1],
    ['Split Squat', 'r8', 1],
    ['Bodyweight Bulgarian Split Squat', 'r8', 2, 'Rear foot on a bench.'],
    ['Beginner Shrimp Squat', 'r6', 2, 'Rear knee to the floor, holding the rear foot is optional.'],
    ['Box Pistol Squat', 'r6', 2, 'One-leg squat down to a box; lower the box over time.'],
    ['Pistol Squat', 'r5', 3],
    ['Shrimp Squat', 'r5', 3, 'Hold the rear foot behind you.'],
    ['Weighted Pistol Squat', 'r5', 4, 'Hold a dumbbell or kettlebell at the chest.'],
  ]),
  T('hinge', 'Hinge', 'Strength', 'Hamstrings, glutes and lower back.', [
    ['Glute Bridge', 'r15', 1],
    ['Single-Leg Glute Bridge', 'r10', 1],
    ['Bodyweight Single-Leg Deadlift', 'r10', 2],
    ['Nordic Curl Negative', 'r5', 3, 'Anchor the heels (bench or partner) and lower as slowly as possible.'],
    ['Nordic Curl', 'r5', 4],
  ]),
  T('core', 'Core', 'Strength', 'Anti-extension strength for every skill.', [
    ['Plank', 't60', 1],
    ['Hollow Body Hold', 't30', 1, 'Lower back pressed into the floor.'],
    ['Ab Wheel', 'r8', 2, 'From the knees.'],
    ['Dragon Flag', 'r5', 4, 'Lying on a bench, hold behind your head and lower the straight body.'],
    ['Standing Ab Wheel', 'r5', 4],
  ]),
  T('legraise', 'Leg raise', 'Strength', 'Hanging core work — also builds the L-sit and toes-to-bar.', [
    ['Lying Leg Raise', 'r12', 1],
    ['Hanging Knee Raise', 'r10', 1],
    ['Hanging Leg Raise', 'r8', 2],
    ['Toes to Bar', 'r8', 3],
    ['Windshield Wiper', 'r6', 4, 'Legs up at the bar, sweep them side to side.'],
  ]),
  T('muscleup', 'Muscle-up', 'Skills', 'Pull over the bar into a dip in one move.', [
    ['Explosive Pull-Up', 'r5', 3, 'Pull as high and fast as you can — aim for the bar at your lower chest.'],
    ['Straight Bar Dip', 'r8', 3, 'Dips on top of the pull-up bar.'],
    ['Muscle-Up Negative', 'r3', 3, 'Start on top of the bar and lower slowly through the transition.'],
    ['Kipping Muscle-Up', 'r3', 3],
    ['Muscle-Up', 'r3', 4],
    ['Slow Muscle-Up', 'r3', 5],
  ]),
  T('lsit', 'L-sit', 'Skills', 'Compression and straight-arm strength. Do them on the dip station or two dumbbells.', [
    ['Foot-Supported L-Sit', 't20', 1, 'Heels on the floor, hips off the floor.'],
    ['Tuck L-Sit', 't15', 2],
    ['One-Leg L-Sit', 't15', 2, 'Alternate the straight leg.'],
    ['L-Sit', 't15', 3],
    ['V-Sit', 't5', 5],
  ]),
  T('handstand', 'Handstand', 'Skills', 'Balance upside down.', [
    ['Wall Plank', 't30', 1, 'Feet on the wall, hands on the floor, body straight.'],
    ['Wall Walk', 'r3', 1, 'Walk the feet up the wall and hands towards it, then back.'],
    ['Chest-to-Wall Handstand', 't30', 2, 'Belly facing the wall, body straight.'],
    ['Back-to-Wall Handstand', 't30', 2, 'Kick up with your back to the wall; practise pulling the heels off.'],
    ['Freestanding Handstand', 't10', 3],
    ['Freestanding Handstand', 't30', 4],
  ]),
  T('hspu', 'Handstand push-up', 'Skills', 'Overhead pressing strength.', [
    ['Pike Push-Up', 'r8', 2],
    ['Elevated Pike Push-Up', 'r8', 2, 'Feet on a bench, hips high.'],
    ['Wall HSPU Negative', 'r5', 3, 'In a wall handstand, lower your head to the floor slowly.'],
    ['Wall Handstand Push-Up', 'r5', 3],
    ['Deficit Handstand Push-Up', 'r5', 4, 'Hands on two dumbbells or plates for extra depth.'],
    ['Freestanding Handstand Push-Up', 'r3', 5],
  ]),
  T('frontlever', 'Front lever', 'Skills', 'Horizontal body, face up, hanging from the bar.', [
    ['Tuck Front Lever', 't15', 2, 'Knees to chest, back horizontal, arms straight.'],
    ['Advanced Tuck Front Lever', 't10', 3, 'Flat back, thighs at 90° to the body.'],
    ['One-Leg Front Lever', 't10', 4],
    ['Straddle Front Lever', 't10', 4],
    ['Front Lever', 't10', 5],
  ]),
  T('backlever', 'Back lever', 'Skills', 'Horizontal body, face down, arms behind you.', [
    ['Skin the Cat', 'r5', 2, 'Tuck and rotate through until the feet point at the floor, then back. Go easy on the shoulders.'],
    ['German Hang', 't30', 2],
    ['Tuck Back Lever', 't15', 2],
    ['Advanced Tuck Back Lever', 't10', 3],
    ['Straddle Back Lever', 't10', 4],
    ['Back Lever', 't10', 4],
  ]),
  T('planche', 'Planche', 'Skills', 'Body held horizontal over straight arms. Dumbbell handles take strain off the wrists.', [
    ['Frog Stand', 't30', 1, 'Knees resting on the elbows, feet off the floor.'],
    ['Planche Lean', 't30', 2, 'Push-up position, lean the shoulders well past the hands.'],
    ['Tuck Planche', 't10', 3],
    ['Advanced Tuck Planche', 't10', 4],
    ['Straddle Planche', 't5', 5],
    ['Full Planche', 't5', 5],
  ]),
];

export const SKILL_TRACKS = TRACKS.filter((t) => t.group === 'Skills').map((t) => t.id);
export const getTrack = (id) => TRACKS.find((t) => t.id === id);

export function parseStd(std) {
  return std[0] === 't' ? { sec: +std.slice(1), sets: 3 } : { reps: +std.slice(1), sets: 3 };
}

export function stdLabel(std) {
  const s = parseStd(std);
  return s.sec ? `3 × ${s.sec}s hold` : `3 × ${s.reps} reps`;
}

export function stdTarget(std) {
  const s = parseStd(std);
  if (s.sec) return `${s.sec}s`;
  if (s.reps <= 2) return `${s.reps}`;
  return `${s.reps - (s.reps <= 5 ? 2 : 3)}–${s.reps}`;
}

// ---------- progress state (one synced doc) ----------

const DOC_ID = 'cali-progress';

export function progress() {
  return store.getDoc(DOC_ID) || { id: DOC_ID, type: 'cali', levels: {}, focus: ['handstand', 'lsit'], log: [] };
}

export const currentIndex = (trackId) => progress().levels[trackId] ?? 0;

export function currentStep(trackId) {
  const t = getTrack(trackId);
  return t.steps[Math.min(currentIndex(trackId), t.steps.length - 1)];
}

export const isComplete = (trackId) => currentIndex(trackId) >= getTrack(trackId).steps.length;

export async function setLevel(trackId, index) {
  const p = structuredClone(progress());
  const t = getTrack(trackId);
  p.levels[trackId] = Math.max(0, Math.min(index, t.steps.length));
  p.log = [...(p.log || []), { track: trackId, step: p.levels[trackId], at: new Date().toISOString() }].slice(-200);
  await store.saveDoc(p);
}

export async function toggleFocus(trackId) {
  const p = structuredClone(progress());
  const f = new Set(p.focus || []);
  f.has(trackId) ? f.delete(trackId) : f.add(trackId);
  p.focus = [...f];
  await store.saveDoc(p);
}

// Points = sum of the tiers of every step you have moved past.
export function points() {
  let pts = 0;
  for (const t of TRACKS) {
    const idx = currentIndex(t.id);
    for (let i = 0; i < Math.min(idx, t.steps.length); i++) pts += t.steps[i].tier;
  }
  return pts;
}

export function rank() {
  const pts = points();
  let tier = 0;
  for (let i = 0; i < RANK_POINTS.length; i++) if (pts >= RANK_POINTS[i]) tier = i;
  const next = RANK_POINTS[tier + 1];
  const prev = RANK_POINTS[tier];
  return { pts, tier, name: TIERS[tier], next: next ?? null, nextName: TIERS[tier + 1] || null, pct: next ? (pts - prev) / (next - prev) : 1 };
}

// The tier you are working at in a track (used to pick exercise difficulty).
export function trackTier(trackId) {
  const t = getTrack(trackId);
  if (isComplete(trackId)) return 5;
  return t.steps[currentIndex(trackId)].tier;
}

// Did the most recent workout with the current step meet its standard?
export function readiness(trackId) {
  if (isComplete(trackId)) return null;
  const step = currentStep(trackId);
  const s = parseStd(step.std);
  const hist = stats.historyFor(step.exerciseId);
  if (!hist.length) return null;
  const last = hist[hist.length - 1];
  const meets = (set) => {
    const okL = s.sec ? set.sec >= s.sec : set.reps >= s.reps;
    if (!stats.isSidedSet(set)) return okL;
    const okR = s.sec ? set.secR >= s.sec : set.repsR >= s.reps;
    return okL && okR;
  };
  const good = last.sets.filter(meets).length;
  return { ready: good >= s.sets, good, need: s.sets, session: last.session };
}

export function readyTracks() {
  return TRACKS.filter((t) => readiness(t.id)?.ready);
}

// ---------- ready-made session ----------

// Recommended-Routine-style session: skill work, then paired strength work, then core.
export function todaysSession() {
  const focus = (progress().focus || []).filter((id) => SKILL_TRACKS.includes(id)).slice(0, 2);
  const order = [...focus, 'pullup', 'squat', 'dips', 'hinge', 'rows', 'pushup', 'core', 'legraise'];
  const exercises = [{ exerciseId: exId('Wrist Stretch'), sets: 1, target: '30s' }];
  for (const id of order) {
    const step = currentStep(id);
    exercises.push({ exerciseId: step.exerciseId, sets: 3, target: stdTarget(step.std), track: id });
  }
  return { name: 'Calisthenics', exercises };
}
