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

export function planName(dayType, style) {
  const d = DAY_TYPES.find((x) => x.id === dayType)?.name || 'Workout';
  if (dayType === 'stretch') return d;
  return style === 'conventional' ? d : `${d} · ${STYLES.find((s) => s.id === style)?.name}`;
}
