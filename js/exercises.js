// Exercise lookups: re-exports the catalog, day templates and search.
import { BUILTIN_EXERCISES, CATEGORIES, KINDS, EQUIPMENT, exId, isCalisthenics } from './catalog.js';

export { BUILTIN_EXERCISES, CATEGORIES, KINDS, EQUIPMENT, exId, isCalisthenics };

// Starting templates for the day buttons. Once you have done a day, the next time
// you start it the app copies your most recent workout of that day instead.
export const DAY_TEMPLATES = [
  { id: 'rt-push', name: 'Push', exercises: ['Bench Press', 'Overhead Press', 'Incline Dumbbell Press', 'Lateral Raise', 'Triceps Pushdown', 'Overhead Triceps Extension'] },
  { id: 'rt-pull', name: 'Pull', exercises: ['Deadlift', 'Lat Pulldown', 'Seated Cable Row', 'Face Pull', 'Dumbbell Curl', 'Hammer Curl'] },
  { id: 'rt-legs', name: 'Legs', exercises: ['Squat', 'Romanian Deadlift', 'Leg Press', 'Leg Curl', 'Leg Extension', 'Calf Raise'] },
  { id: 'rt-abs', name: 'Abs & Stretch', exercises: ['Plank', 'Hanging Leg Raise', 'Cable Crunch', 'Hamstring Stretch', 'Hip Flexor Stretch', 'Pigeon Stretch'] },
].map((t) => ({ ...t, exercises: t.exercises.map(exId) }));

// ---------- search ----------

const norm = (s) =>
  s.toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 2 && !w.endsWith('ss') ? w.replace(/s$/, '') : w));

const CATEGORY_WORDS = {
  Core: 'core abs abdominal', Recovery: 'recovery stretch stretching mobility flexibility foam roll rolling roller massage ball cooldown', Legs: 'legs quads hamstrings glutes',
  Arms: 'arms biceps triceps', Back: 'back lats', Chest: 'chest pecs', Shoulders: 'shoulders delts',
  Calisthenics: 'calisthenics bodyweight cali street workout skill',
};
const SIDE_WORDS = 'single one arm leg unilateral side';

const wordCache = new Map();
function wordsFor(ex) {
  const key = ex.id + '|' + ex.name;
  let w = wordCache.get(key);
  if (!w) {
    const nameWords = norm(ex.name);
    const extra = [ex.aliases || '', CATEGORY_WORDS[ex.category] || ex.category || '', EQUIPMENT[ex.equip] || '', ex.sided ? SIDE_WORDS : ''].join(' ');
    w = { nameWords, words: [...nameWords, ...norm(extra)], joined: nameWords.join('') };
    wordCache.set(key, w);
  }
  return w;
}

// Every query word must prefix-match some word in the name/aliases/category/equipment.
export function searchExercises(all, query) {
  const q = norm(query);
  if (!q.length) return all;
  const scored = [];
  for (const ex of all) {
    const { nameWords, words, joined } = wordsFor(ex);
    let ok = true;
    let score = 0;
    for (const w of q) {
      if (nameWords.some((n) => n.startsWith(w))) score += 2;
      else if (words.some((n) => n.startsWith(w)) || (w.length >= 4 && joined.includes(w))) score += 1;
      else { ok = false; break; }
    }
    const offTopic = (ex.category === 'Recovery' || ex.category === 'Cardio') && !q.some((w) => /^(stretch|recover|foam|roll|massage|mobil|yoga|cardio)/.test(w));
    if (ok) scored.push({ ex, score: score + (nameWords[0]?.startsWith(q[0]) ? 1 : 0) - (nameWords.length > q.length + 2 ? 0.5 : 0) - (offTopic ? 1.5 : 0) });
  }
  return scored.sort((a, b) => b.score - a.score || a.ex.name.length - b.ex.name.length || a.ex.name.localeCompare(b.ex.name)).map((s) => s.ex);
}
