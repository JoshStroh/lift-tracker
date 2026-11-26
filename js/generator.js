// Rule-based workout builder for "Create for me" and the suggestions in "Build my own".
//
// A workout type is a list of movement slots (big compound lifts first, then accessories).
// Each slot is filled from the catalog, filtered by style:
//   conventional = gym equipment, calisthenics = bodyweight / bar / dip station, mixed = both.
// Calisthenics slots that match a progression track use your current step on that track.

import * as store from './store.js';
import * as cali from './cali.js';
import { isCalisthenics } from './catalog.js';

export const DAY_TYPES = [
  { id: 'push', name: 'Push', blurb: 'Chest, shoulders, triceps' },
  { id: 'pull', name: 'Pull', blurb: 'Back, biceps, rear delts' },
  { id: 'legs', name: 'Legs', blurb: 'Quads, hamstrings, glutes, calves' },
  { id: 'core', name: 'Core & Abs', blurb: 'Abs, obliques, lower back' },
  { id: 'stretch', name: 'Recovery', blurb: 'Stretching, mobility, foam rolling' },
  { id: 'full', name: 'Full body', blurb: 'A bit of everything' },
];
export const STYLES = [
  { id: 'conventional', name: 'Conventional', blurb: 'Gym equipment' },
  { id: 'calisthenics', name: 'Calisthenics', blurb: 'Bodyweight' },
  { id: 'mixed', name: 'Mixed', blurb: 'Both' },
];
export const LENGTHS = [
  { id: 'short', name: 'Short', n: 4 },
  { id: 'normal', name: 'Normal', n: 6 },
  { id: 'long', name: 'Long', n: 8 },
];

const SLOTS = {
  push: ['hpush', 'vpush', 'hpush', 'sidedelt', 'tri', 'chestiso', 'tri', 'frontdelt'],
  pull: ['vpull', 'hpull', 'vpull', 'reardelt', 'bi', 'hpull', 'bi', 'shrug'],
  legs: ['squat', 'hinge', 'lunge', 'quadiso', 'hamiso', 'calf', 'glute', 'squat'],
  core: ['antiext', 'hang', 'rot', 'abs', 'backext', 'antiext', 'rot', 'abs'],
  stretch: ['foamroll', 'stretch', 'stretch', 'stretch', 'stretch', 'stretch', 'stretch', 'stretch'],
  full: ['squat', 'hpush', 'vpull', 'hinge', 'vpush', 'hpull', 'antiext', 'lunge'],
};
// Which patterns belong to which day (used for suggestions in "Build my own").
export const DAY_PATTERNS = {
  push: ['hpush', 'vpush', 'chestiso', 'sidedelt', 'frontdelt', 'tri'],
  pull: ['vpull', 'hpull', 'reardelt', 'bi', 'shrug', 'forearm'],
  legs: ['squat', 'hinge', 'lunge', 'quadiso', 'hamiso', 'calf', 'glute'],
  core: ['antiext', 'hang', 'rot', 'abs', 'backext'],
  stretch: ['recovery', 'foamroll', 'stretch'],
  full: ['squat', 'hinge', 'hpush', 'vpush', 'vpull', 'hpull', 'antiext', 'lunge'],
};
// Calisthenics: the track to use for a slot the first time it appears.
const SLOT_TRACK = { vpull: 'pullup', hpull: 'rows', hpush: 'pushup', vpush: 'dips', squat: 'squat', hinge: 'hinge', antiext: 'core', hang: 'legraise', lunge: 'squat' };
// Bodyweight stand-ins for gym-only accessory slots.
const CALI_FALLBACK = { sidedelt: 'vpush', frontdelt: 'vpush', chestiso: 'hpush', reardelt: 'hpull', bi: 'vpull', shrug: 'vpull', quadiso: 'squat', calf: 'calf', glute: 'hinge', abs: 'abs', backext: 'backext', rot: 'rot' };
const COMPOUND = new Set(['hpush', 'vpush', 'vpull', 'hpull', 'squat', 'hinge', 'lunge']);
const TRACK_PATTERN = { pullup: 'vpull', rows: 'hpull', pushup: 'hpush', dips: 'vpush', squat: 'squat', hinge: 'hinge', core: 'antiext', legraise: 'hang' };

function styleOk(ex, style) {
  if (style === 'calisthenics') return isCalisthenics(ex);
  if (style === 'conventional') return !isCalisthenics(ex) || ex.kind === 'weight';
  return true;
}

// Rough level cap for a calisthenics pattern, from your progress on the matching track.
function levelCap(pattern) {
  const track = Object.keys(TRACK_PATTERN).find((t) => TRACK_PATTERN[t] === pattern);
  if (track) return cali.trackTier(track);
  return Math.max(1, ...Object.keys(TRACK_PATTERN).map((t) => cali.trackTier(t)));
}

function usageCounts() {
  const n = new Map();
  for (const s of store.finishedSessions().slice(0, 40)) for (const e of s.exercises) n.set(e.exerciseId, (n.get(e.exerciseId) || 0) + 1);
  return n;
}

function pickWeighted(list, weight) {
  const w = list.map(weight);
  const total = w.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i]; }
  return list[list.length - 1];
}

export function candidates(pattern, style, { exclude = new Set() } = {}) {
  const all = store.exercises().filter((e) => e.pattern === pattern && !exclude.has(e.id));
  let list = all.filter((e) => styleOk(e, style));
  if (style === 'calisthenics' || (style === 'mixed' && list.some(isCalisthenics))) {
    const cap = levelCap(pattern);
    list = list.filter((e) => !isCalisthenics(e) || (e.level || 1) <= cap + 0 || (e.level || 1) <= 1);
  }
  if (!list.length && style === 'calisthenics' && CALI_FALLBACK[pattern] && CALI_FALLBACK[pattern] !== pattern) {
    return candidates(CALI_FALLBACK[pattern], style, { exclude });
  }
  return list.length ? list : all.filter((e) => styleOk(e, 'mixed'));
}

function targetFor(ex, slotIndex, style, trackStep) {
  if (trackStep) return { sets: 3, target: cali.stdTarget(trackStep.std) };
  if (ex.pattern === 'foamroll' || ex.pattern === 'recovery') return { sets: 1, target: '5 min' };
  if (ex.kind === 'time') return { sets: ex.pattern === 'stretch' ? 2 : 3, target: ex.pattern === 'stretch' ? '30s' : '30–45s' };
  if (ex.kind === 'reps') return { sets: 3, target: ex.level >= 3 ? '5–8' : '8–15' };
  if (COMPOUND.has(ex.pattern) && slotIndex < 2) return { sets: 4, target: '5–8' };
  if (COMPOUND.has(ex.pattern)) return { sets: 3, target: '8–12' };
  return { sets: 3, target: '10–15' };
}

// Pick one exercise for a slot.
export function fillSlot(pattern, style, { exclude = new Set(), slotIndex = 9, usedTracks = new Set(), usage = usageCounts() } = {}) {
  const slotStyle = style === 'mixed' ? (slotIndex % 2 === 0 ? 'conventional' : 'calisthenics') : style;
  if (slotStyle === 'calisthenics' && SLOT_TRACK[pattern] && !usedTracks.has(SLOT_TRACK[pattern])) {
    const track = SLOT_TRACK[pattern];
    const step = cali.currentStep(track);
    if (!exclude.has(step.exerciseId) && cali.getTrack(track)) {
      usedTracks.add(track);
      return { exerciseId: step.exerciseId, ...targetFor(store.getExercise(step.exerciseId), slotIndex, style, step), track };
    }
  }
  const list = candidates(pattern, slotStyle, { exclude });
  if (!list.length) return null;
  const ex = pickWeighted(list, (e) => 1 + Math.min(3, usage.get(e.id) || 0) + (e.builtin ? 0 : 1) - (e.sided && slotIndex < 2 ? 0.5 : 0));
  return { exerciseId: ex.id, ...targetFor(ex, slotIndex, style), sides: ex.sided || undefined };
}

export function generate({ dayType, style, length = 'normal' }) {
  const n = LENGTHS.find((l) => l.id === length)?.n || 6;
  const slots = SLOTS[dayType].slice(0, n);
  const exclude = new Set();
  const usedTracks = new Set();
  const usage = usageCounts();
  const st = dayType === 'stretch' ? 'mixed' : style;
  const out = [];
  slots.forEach((pattern, i) => {
    const item = fillSlot(pattern, st, { exclude, slotIndex: i, usedTracks, usage });
    if (item) { exclude.add(item.exerciseId); out.push({ ...item, pattern }); }
  });
  return out;
}

// Suggestions for the exercise picker when building a workout by hand.
export function suggestions(dayType, style) {
  const pats = new Set(DAY_PATTERNS[dayType] || []);
  return store.exercises()
    .filter((e) => pats.has(e.pattern) && (dayType === 'stretch' || styleOk(e, style)))
    .sort((a, b) => [...pats].indexOf(a.pattern) - [...pats].indexOf(b.pattern) || (a.level || 0) - (b.level || 0) || a.name.localeCompare(b.name));
}

// ---------- recovery by focus area ----------
// Structure (common evidence-based practice): ~60 s of foam roller / ball work per area first,
// then static stretches of 2 × 30 s (per side) — the ACSM flexibility guideline is ~60 s of
// total stretching per muscle group, held at mild tension. The lower back gets stretches only:
// rolling directly on the lumbar spine is generally advised against.

export const AREAS = [
  { id: 'hamstrings', label: 'Hamstrings', roll: ['Foam Roll – Hamstrings'], stretch: ['Hamstring Stretch', 'Seated Forward Fold', 'Downward Dog'] },
  { id: 'hips', label: 'Hips & glutes', roll: ['Foam Roll – Glutes', 'Massage Ball – Glutes'], stretch: ['Hip Flexor Stretch', 'Pigeon Stretch', "World's Greatest Stretch", 'Deep Squat Hold'] },
  { id: 'quads', label: 'Quads', roll: ['Foam Roll – Quads', 'Foam Roll – IT Band'], stretch: ['Quad Stretch', 'Hip Flexor Stretch'] },
  { id: 'groin', label: 'Groin / inner thigh', roll: ['Foam Roll – Adductors'], stretch: ['Butterfly Stretch', 'Straddle Stretch'] },
  { id: 'calves', label: 'Calves & feet', roll: ['Foam Roll – Calves', 'Massage Ball – Feet'], stretch: ['Calf Stretch', 'Downward Dog'] },
  { id: 'lowerback', label: 'Lower back', roll: [], stretch: ["Child's Pose", 'Cat-Cow', 'Spinal Twist'] },
  { id: 'upperback', label: 'Upper back & lats', roll: ['Foam Roll – Upper Back', 'Foam Roll – Lats'], stretch: ['Lat Stretch', 'Upper Back Stretch', "Child's Pose"] },
  { id: 'shoulders', label: 'Shoulders', roll: ['Massage Ball – Shoulders & Upper Back'], stretch: ['Cross-Body Shoulder Stretch', 'Shoulder Mobility', 'Triceps Stretch'] },
  { id: 'chest', label: 'Chest', roll: ['Massage Ball – Chest'], stretch: ['Chest Doorway Stretch'] },
  { id: 'neck', label: 'Neck', roll: [], stretch: ['Neck Stretch', 'Upper Back Stretch'] },
  { id: 'wrists', label: 'Wrists & forearms', roll: [], stretch: ['Wrist Stretch'] },
];
export const AREA_PRESETS = [
  { id: 'hamhips', label: 'Hamstrings + hips', areas: ['hamstrings', 'hips'] },
  { id: 'lower', label: 'Lower body', areas: ['hamstrings', 'hips', 'quads', 'groin', 'calves'] },
  { id: 'upper', label: 'Upper body', areas: ['shoulders', 'chest', 'upperback', 'neck'] },
  { id: 'full', label: 'Full body', areas: ['hamstrings', 'hips', 'quads', 'calves', 'lowerback', 'upperback', 'shoulders'] },
];
export const DEFAULT_AREAS = ['hamstrings', 'hips'];

const byName = (name) => store.exercises().find((e) => e.name === name);
const shuffled = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);

export function generateRecovery(areaIds) {
  const areas = AREAS.filter((a) => areaIds.includes(a.id));
  const used = new Set();
  const rolls = [];
  const stretches = [];
  const perArea = areas.length <= 2 ? 2 : areas.length <= 4 ? 2 : 1;
  for (const a of areas) {
    const r = a.roll.map(byName).find((e) => e && !used.has(e.id)); // main roller for the area first
    if (r) { used.add(r.id); rolls.push({ exerciseId: r.id, sets: 1, target: '60s', sides: r.sided || undefined, area: a.id }); }
    // the first-listed stretch is the staple for that area; the rest rotate for variety
    const [staple, ...rest] = a.stretch;
    const picks = [staple, ...shuffled(rest)].map(byName).filter((e) => e && !used.has(e.id)).slice(0, perArea);
    for (const e of picks) { used.add(e.id); stretches.push({ exerciseId: e.id, sets: e.kind === 'reps' ? 1 : 2, target: e.kind === 'reps' ? '8–10' : '30s', sides: e.sided || undefined, area: a.id }); }
  }
  return [...rolls, ...stretches];
}

export function recoveryName(areaIds) {
  const preset = AREA_PRESETS.find((p) => p.areas.length === areaIds.length && p.areas.every((a) => areaIds.includes(a)));
  if (preset) return `Recovery · ${preset.label}`;
  const labels = AREAS.filter((a) => areaIds.includes(a.id)).map((a) => a.label.split(/ [&/] /)[0]);
  return labels.length <= 3 ? `Recovery · ${labels.join(', ')}` : `Recovery · ${labels.length} areas`;
}

export function recoverySuggestions(areaIds) {
  const names = AREAS.filter((a) => areaIds.includes(a.id)).flatMap((a) => [...a.roll, ...a.stretch]);
  return [...new Set(names)].map(byName).filter(Boolean);
}

export function planName(dayType, style) {
  const d = DAY_TYPES.find((x) => x.id === dayType)?.name || 'Workout';
  if (dayType === 'stretch') return d;
  return style === 'conventional' ? d : `${d} · ${STYLES.find((s) => s.id === style)?.name}`;
}
