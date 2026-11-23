// Built-in exercises and day templates. IDs are fixed so every device agrees on
// them without syncing. Custom exercises are synced documents of type "exercise".
//
// kind: "weight" = kg × reps, "reps" = bodyweight reps, "time" = seconds held

export const CATEGORIES = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Stretch', 'Cardio', 'Other'];
export const KINDS = { weight: 'Weight × reps', reps: 'Reps only', time: 'Time' };

// [name, kind, aliases]
const list = {
  Chest: [
    ['Bench Press', 'weight', 'barbell bench flat bench'],
    ['Incline Bench Press', 'weight', 'incline barbell'],
    ['Dumbbell Bench Press', 'weight', 'db bench dumbbell press flat'],
    ['Incline Dumbbell Press', 'weight', 'incline db'],
    ['Chest Press Machine', 'weight', 'machine press'],
    ['Chest Fly', 'weight', 'pec deck flye dumbbell fly'],
    ['Cable Crossover', 'weight', 'cable fly'],
    ['Push Up', 'reps', 'pushup press up'],
    ['Dip', 'reps', 'dips chest dip triceps dip'],
  ],
  Back: [
    ['Deadlift', 'weight', 'conventional'],
    ['Barbell Row', 'weight', 'bent over row'],
    ['Dumbbell Row', 'weight', 'db row one arm row'],
    ['Pull Up', 'reps', 'pullup'],
    ['Chin Up', 'reps', 'chinup'],
    ['Lat Pulldown', 'weight', 'lat pull down pulldown'],
    ['Seated Cable Row', 'weight', 'cable row low row'],
    ['T-Bar Row', 'weight', 'tbar'],
    ['Face Pull', 'weight', 'rear delt cable'],
    ['Back Extension', 'reps', 'hyperextension'],
  ],
  Legs: [
    ['Squat', 'weight', 'back squat barbell squat squats'],
    ['Front Squat', 'weight', ''],
    ['Goblet Squat', 'weight', 'dumbbell squat'],
    ['Romanian Deadlift', 'weight', 'rdl stiff leg'],
    ['Leg Press', 'weight', 'sled'],
    ['Bulgarian Split Squat', 'weight', 'split squat bss'],
    ['Lunge', 'weight', 'lunges walking lunge'],
    ['Leg Extension', 'weight', 'quad extension'],
    ['Leg Curl', 'weight', 'hamstring curl lying seated'],
    ['Hip Thrust', 'weight', 'glute bridge'],
    ['Calf Raise', 'weight', 'calves standing seated'],
  ],
  Shoulders: [
    ['Overhead Press', 'weight', 'ohp military press shoulder press barbell'],
    ['Dumbbell Shoulder Press', 'weight', 'db shoulder press seated'],
    ['Shoulder Press Machine', 'weight', 'machine shoulder press'],
    ['Lateral Raise', 'weight', 'side raise lateral'],
    ['Front Raise', 'weight', ''],
    ['Rear Delt Fly', 'weight', 'reverse fly reverse pec deck'],
    ['Upright Row', 'weight', ''],
    ['Shrug', 'weight', 'shrugs traps'],
  ],
  Arms: [
    ['Barbell Curl', 'weight', 'bicep curl biceps'],
    ['Dumbbell Curl', 'weight', 'bicep curl biceps db'],
    ['Hammer Curl', 'weight', 'bicep biceps'],
    ['Preacher Curl', 'weight', 'bicep biceps ez bar'],
    ['Cable Curl', 'weight', 'bicep biceps'],
    ['Triceps Pushdown', 'weight', 'tricep pushdown cable rope pressdown'],
    ['Overhead Triceps Extension', 'weight', 'tricep extension overhead extension'],
    ['Skull Crusher', 'weight', 'lying tricep extension'],
    ['Close-Grip Bench Press', 'weight', 'tricep close grip'],
  ],
  Core: [
    ['Plank', 'time', 'planks'],
    ['Side Plank', 'time', ''],
    ['Crunch', 'reps', 'crunches sit up situp'],
    ['Hanging Leg Raise', 'reps', 'leg raises'],
    ['Cable Crunch', 'weight', 'kneeling crunch'],
    ['Ab Wheel', 'reps', 'rollout ab roller'],
    ['Russian Twist', 'reps', ''],
    ['Dead Bug', 'reps', ''],
  ],
  Stretch: [
    ['Hamstring Stretch', 'time', ''],
    ['Hip Flexor Stretch', 'time', 'couch stretch lunge stretch'],
    ['Quad Stretch', 'time', ''],
    ['Pigeon Stretch', 'time', 'glute stretch hip'],
    ['Chest Doorway Stretch', 'time', 'pec stretch'],
    ['Child\'s Pose', 'time', 'lat stretch back stretch'],
    ['Cat-Cow', 'reps', 'spine'],
    ['Calf Stretch', 'time', ''],
  ],
  Cardio: [
    ['Rowing Machine', 'time', 'rower erg'],
    ['Treadmill', 'time', 'run running walk'],
    ['Bike', 'time', 'cycling spin'],
  ],
};

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const id = (name) => 'ex-' + slug(name);

export const BUILTIN_EXERCISES = Object.entries(list).flatMap(([category, items]) =>
  items.map(([name, kind, aliases]) => ({ id: id(name), type: 'exercise', name, category, kind, aliases, builtin: true }))
);

// Starting templates for the day buttons. Once you have done a day, the next time
// you start it the app copies your most recent workout of that day instead.
export const DAY_TEMPLATES = [
  { id: 'rt-push', name: 'Push', exercises: ['Bench Press', 'Overhead Press', 'Incline Dumbbell Press', 'Lateral Raise', 'Triceps Pushdown', 'Overhead Triceps Extension'] },
  { id: 'rt-pull', name: 'Pull', exercises: ['Deadlift', 'Lat Pulldown', 'Seated Cable Row', 'Face Pull', 'Dumbbell Curl', 'Hammer Curl'] },
  { id: 'rt-legs', name: 'Legs', exercises: ['Squat', 'Romanian Deadlift', 'Leg Press', 'Leg Curl', 'Leg Extension', 'Calf Raise'] },
  { id: 'rt-abs', name: 'Abs & Stretch', exercises: ['Plank', 'Hanging Leg Raise', 'Cable Crunch', 'Hamstring Stretch', 'Hip Flexor Stretch', 'Pigeon Stretch'] },
].map((t) => ({ ...t, exercises: t.exercises.map(id) }));

// ---------- search ----------

const norm = (s) =>
  s.toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 2 && !w.endsWith('ss') ? w.replace(/s$/, '') : w));

const CATEGORY_WORDS = { Core: 'core abs abdominal', Stretch: 'stretch stretching mobility flexibility', Legs: 'legs quads hamstrings glutes', Arms: 'arms biceps triceps', Back: 'back lats', Chest: 'chest pecs', Shoulders: 'shoulders delts' };

// Every query word must prefix-match some word in the name/aliases/category.
export function searchExercises(all, query) {
  const q = norm(query);
  if (!q.length) return all;
  const scored = [];
  for (const ex of all) {
    const nameWords = norm(ex.name);
    const words = [...nameWords, ...norm(ex.aliases || ''), ...norm(CATEGORY_WORDS[ex.category] || ex.category || '')];
    const joined = nameWords.join('');
    let ok = true;
    let score = 0;
    for (const w of q) {
      if (nameWords.some((n) => n.startsWith(w))) score += 2;
      else if (words.some((n) => n.startsWith(w)) || (w.length >= 4 && joined.includes(w))) score += 1;
      else { ok = false; break; }
    }
    if (ok) scored.push({ ex, score: score + (nameWords[0]?.startsWith(q[0]) ? 1 : 0) });
  }
  return scored.sort((a, b) => b.score - a.score || a.ex.name.localeCompare(b.ex.name)).map((s) => s.ex);
}
