// Gym buddy: a round cartoon mascot you customise with coins and XP earned from training.
//
// ── Art ──────────────────────────────────────────────────────────────────────────────
// Every buddy is drawn on one 200 × 220 canvas from stacked layers (back → front):
//   background · behind (cape, afro) · legs+shoes · arms · body · belly · outfit · strength lines
//   · face · hair · head item · face item · hand item · bag · aura
// Version 1 art is vector code below. Any item can instead use an image you make in ChatGPT /
// Canva: export a transparent PNG at exactly 200 × 220 (or 800 × 880) with the item drawn in the
// right place relative to the reference buddy, save it as img/buddy/<item-id>.png and add
// `img: true` to that item in ITEMS. The image is then used for that layer instead of the code art.
//
// ── Economy (all derived from your history, so it's retroactive) ────────────────────
//   workout: +50 XP, +2 XP per set (max 40 sets), +10 coins   (max 2 rewarded workouts per day)
//   weekly goal (3+ workouts in a Monday-week): +100 XP, +30 coins
//   PR: +15 XP, +5 coins (max 10 per workout) · weigh-in: +2 coins (1 per day)
//   achievement: tier 1–4 → +50…200 XP, +10/25/50/100 coins
// Rest is never punished: no streak loss, no decay.

import * as store from './store.js';
import * as stats from './stats.js';
import * as ach from './achievements.js';
import { localDate } from './util.js';

const DOC_ID = 'buddy';

// ── catalog ─────────────────────────────────────────────────────────────────────────

export const SLOTS = [
  { id: 'color', label: 'Colour' }, { id: 'shape', label: 'Shape' }, { id: 'hair', label: 'Hair' },
  { id: 'hairColor', label: 'Hair colour' }, { id: 'outfit', label: 'Outfit' }, { id: 'shoes', label: 'Shoes' },
  { id: 'head', label: 'Hat' }, { id: 'face', label: 'Face' }, { id: 'hand', label: 'Hand' }, { id: 'back', label: 'Back' }, { id: 'bg', label: 'Background' },
];
const OPTIONAL = new Set(['head', 'face', 'hand', 'back', 'bg']);

// [id, slot, name, price (0 = free starter), level needed, extra]
const RAW = [
  ['sun', 'color', 'Sunshine', 0, 1, { c: '#FFD43B' }], ['tangerine', 'color', 'Tangerine', 0, 1, { c: '#FF922B' }],
  ['mint', 'color', 'Mint', 0, 1, { c: '#63E6BE' }], ['sky', 'color', 'Sky', 0, 1, { c: '#74C0FC' }],
  ['lavender', 'color', 'Lavender', 60, 2, { c: '#B197FC' }], ['bubblegum', 'color', 'Bubblegum', 60, 2, { c: '#F783AC' }],
  ['lime', 'color', 'Lime', 60, 3, { c: '#A9E34B' }], ['gold', 'color', 'Solid gold', 400, 10, { c: '#F2C94C', grad: ['#FFE58F', '#D4A017'] }],
  ['galaxy', 'color', 'Galaxy', 600, 15, { c: '#5F3DC4', grad: ['#7048E8', '#1C1458'], stars: true }],
  ['round', 'shape', 'Round', 0, 1], ['tall', 'shape', 'Tall', 0, 1], ['chunky', 'shape', 'Chunky', 0, 1],
  ['sprout', 'hair', 'Sprout', 0, 1], ['spiky', 'hair', 'Spiky', 0, 1], ['bun', 'hair', 'Top bun', 0, 1], ['curly', 'hair', 'Curly', 0, 1],
  ['bald', 'hair', 'None', 0, 1], ['mohawk', 'hair', 'Mohawk', 80, 2], ['ponytail', 'hair', 'Ponytail', 80, 3], ['afro', 'hair', 'Afro', 120, 4],
  ['brown', 'hairColor', 'Brown', 0, 1, { c: '#7A4A24' }], ['black', 'hairColor', 'Black', 0, 1, { c: '#2B2B2B' }],
  ['blonde', 'hairColor', 'Blonde', 0, 1, { c: '#F5D06F' }], ['ginger', 'hairColor', 'Ginger', 0, 1, { c: '#D9622B' }],
  ['pinkhair', 'hairColor', 'Pink', 50, 2, { c: '#F06595' }], ['bluehair', 'hairColor', 'Blue', 50, 2, { c: '#4C6EF5' }],
  ['greenhair', 'hairColor', 'Green', 50, 3, { c: '#40C057' }], ['purplehair', 'hairColor', 'Purple', 50, 3, { c: '#845EF7' }],
  ['silver', 'hairColor', 'Silver', 150, 6, { c: '#CED4DA' }], ['rainbow', 'hairColor', 'Rainbow', 300, 8, { c: '#F06595', rainbow: true }],
  ['tank-blue', 'outfit', 'Blue tank', 0, 1, { c: '#339AF0', kind: 'tank' }], ['tee-grey', 'outfit', 'Grey tee', 0, 1, { c: '#868E96', kind: 'tee' }],
  ['hoodie-purple', 'outfit', 'Purple hoodie', 120, 3, { c: '#7950F2', kind: 'hoodie' }], ['hoodie-black', 'outfit', 'Black hoodie', 120, 3, { c: '#343A40', kind: 'hoodie' }],
  ['singlet', 'outfit', 'Lifting singlet', 150, 4, { c: '#E03131', kind: 'singlet' }], ['jersey', 'outfit', 'Team jersey', 200, 5, { c: '#1971C2', kind: 'jersey' }],
  ['tracksuit', 'outfit', 'Retro tracksuit', 250, 6, { c: '#2F9E44', kind: 'track' }], ['hero', 'outfit', 'Superhero suit', 500, 10, { c: '#C2255C', kind: 'hero' }],
  ['white', 'shoes', 'White sneakers', 0, 1, { c: '#F8F9FA' }], ['blackshoe', 'shoes', 'Black sneakers', 0, 1, { c: '#343A40' }],
  ['hightops', 'shoes', 'Red high-tops', 80, 2, { c: '#E03131', high: true }], ['neon', 'shoes', 'Neon runners', 120, 4, { c: '#82C91E' }],
  ['goldshoe', 'shoes', 'Gold kicks', 400, 9, { c: '#F2C94C', high: true }],
  ['headband', 'head', 'Sweatband', 40, 1, { c: '#FA5252' }], ['cap', 'head', 'Cap', 80, 2, { c: '#1C7ED6' }],
  ['beanie', 'head', 'Beanie', 100, 3, { c: '#F08C00' }], ['crown', 'head', 'Crown', 800, 20, { c: '#F2C94C' }],
  ['shades', 'face', 'Sunglasses', 100, 3],
  ['shaker', 'hand', 'Shaker bottle', 60, 1, { c: '#15AABF' }], ['dumbbell', 'hand', 'Dumbbell', 100, 2], ['kettlebell', 'hand', 'Kettlebell', 150, 4],
  ['trophy', 'hand', 'Trophy', 500, 12],
  ['gymbag', 'back', 'Gym bag', 120, 3, { c: '#495057' }], ['cape', 'back', 'Cape', 400, 8, { c: '#E03131' }],
  ['bg-gym', 'bg', 'Gym', 150, 2], ['bg-beach', 'bg', 'Beach', 200, 4], ['bg-mountain', 'bg', 'Mountains', 200, 5], ['bg-space', 'bg', 'Space', 400, 8],
];
export const ITEMS = RAW.map(([id, slot, name, price, level, extra = {}]) => ({ id, slot, name, price, level, ...extra }));
const ITEM = new Map(ITEMS.map((i) => [i.id, i]));
export const getItem = (id) => ITEM.get(id);
export const STARTERS = ITEMS.filter((i) => i.price === 0).map((i) => i.id);

export const DEFAULT_LOOK = { color: 'sun', shape: 'round', hair: 'sprout', hairColor: 'brown', outfit: 'tank-blue', shoes: 'white', head: null, face: null, hand: null, back: null, bg: null };

// ── doc ─────────────────────────────────────────────────────────────────────────────

export const get = () => store.getDoc(DOC_ID);
export async function save(patch) {
  const cur = get() || { id: DOC_ID, type: 'buddy', name: 'Buddy', look: { ...DEFAULT_LOOK }, owned: [], purchases: [], createdAt: new Date().toISOString() };
  const next = { ...structuredClone(cur), ...patch, look: { ...cur.look, ...(patch.look || {}) } };
  await store.saveDoc(next);
  return next;
}
export const owns = (id) => STARTERS.includes(id) || (get()?.owned || []).includes(id);

// ── economy ─────────────────────────────────────────────────────────────────────────

const ACH_COINS = [0, 10, 25, 50, 100];
const weekKey = (iso) => { const d = new Date(iso); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return localDate(d); };

export function economy({ excludeSessionId } = {}) {
  const sessions = store.finishedSessions().filter((s) => s.id !== excludeSessionId).slice().reverse();
  const prBySession = new Map();
  for (const ev of stats.allPRs().events) if (ev.session.id !== excludeSessionId) prBySession.set(ev.session.id, (prBySession.get(ev.session.id) || 0) + 1);
  let xp = 0, coins = 0;
  const perDay = new Map(), perWeek = new Map();
  for (const s of sessions) {
    const day = localDate(new Date(s.startedAt));
    perDay.set(day, (perDay.get(day) || 0) + 1);
    if (perDay.get(day) > 2) continue;
    const sets = s.exercises.reduce((n, e) => n + e.sets.length, 0);
    xp += 50 + 2 * Math.min(40, sets);
    coins += 10;
    const prs = Math.min(10, prBySession.get(s.id) || 0);
    xp += 15 * prs; coins += 5 * prs;
    const wk = weekKey(s.startedAt);
    perWeek.set(wk, (perWeek.get(wk) || 0) + 1);
    if (perWeek.get(wk) === 3) { xp += 100; coins += 30; }
  }
  const bwDays = new Set(store.docs('bodyweight').map((d) => d.date));
  coins += 2 * bwDays.size;
  for (const a of ach.evaluate({ includeActive: false })) {
    if (!a.unlocked) continue;
    if (excludeSessionId && a.unlockedAt && store.getDoc(excludeSessionId)?.startedAt === a.unlockedAt) continue;
    xp += 50 * a.tier; coins += ACH_COINS[a.tier];
  }
  const spent = (get()?.purchases || []).reduce((n, p) => n + p.price, 0);
  return { xp, earned: coins, coins: coins - spent, ...levelInfo(xp) };
}

// XP needed to reach level n: ~1 week for L2, ~6 weeks L5, ~6 months L10, ~2 years L20 at 3 workouts/week.
export const xpFor = (n) => 110 * (n - 1) ** 2 + 290 * (n - 1);
export function levelInfo(xp) {
  let level = 1;
  while (xpFor(level + 1) <= xp) level++;
  const lo = xpFor(level), hi = xpFor(level + 1);
  return { level, into: xp - lo, need: hi - lo, pct: (xp - lo) / (hi - lo) };
}

// ── training stats (shape the look) ─────────────────────────────────────────────────

const LEVELS = (v, t) => t.filter((x) => v >= x).length - 1;
export function trainingStats() {
  let strength = 0, endurance = 0, mobility = 0, lastAt = null;
  for (const s of store.finishedSessions()) {
    lastAt = lastAt || s.startedAt;
    for (const e of s.exercises) {
      const ex = store.getExercise(e.exerciseId);
      const n = e.sets.length;
      if (ex.category === 'Recovery') mobility += n;
      else if (ex.kind === 'weight') strength += n;
      else endurance += n;
    }
  }
  endurance += 10 * ach.streakNow();
  const daysSince = lastAt ? (Date.now() - new Date(lastAt)) / 86400000 : null;
  return {
    strength: { value: strength, level: LEVELS(strength, [0, 30, 150, 500, 1500]) },
    endurance: { value: endurance, level: LEVELS(endurance, [0, 30, 150, 500, 1500]) },
    mobility: { value: mobility, level: LEVELS(mobility, [0, 5, 25, 80, 200]) },
    daysSince,
  };
}
export const STAT_INFO = {
  strength: { icon: '💪', label: 'Strength', from: 'weighted sets', look: 'bigger arms and muscle lines' },
  endurance: { icon: '⚡', label: 'Endurance', from: 'bodyweight, cardio sets and weekly streaks', look: 'an energy sparkle' },
  mobility: { icon: '🧘', label: 'Mobility', from: 'recovery work', look: 'a relaxed, bendy wiggle' },
};

// ── shop ────────────────────────────────────────────────────────────────────────────

export async function buy(id) {
  const item = ITEM.get(id);
  const eco = economy();
  if (!item || owns(id)) return { ok: false, why: 'Already yours' };
  if (eco.level < item.level) return { ok: false, why: `Unlocks at level ${item.level}` };
  if (eco.coins < item.price) return { ok: false, why: `Need ${item.price - eco.coins} more coins` };
  const cur = get();
  await save({ owned: [...(cur?.owned || []), id], purchases: [...(cur?.purchases || []), { item: id, price: item.price, at: new Date().toISOString() }], look: { [item.slot]: id } });
  return { ok: true };
}

export async function equip(slot, id) {
  if (id && !owns(id)) return;
  await save({ look: { [slot]: OPTIONAL.has(slot) && get()?.look?.[slot] === id ? null : id } });
}

// ── drawing ─────────────────────────────────────────────────────────────────────────

const SHAPES = {
  round: { el: '<ellipse cx="100" cy="128" rx="60" ry="64"/>', top: 64, bottom: 190, left: 40, right: 160, faceY: 106, armY: 138 },
  tall: { el: '<rect x="56" y="52" width="88" height="140" rx="44"/>', top: 52, bottom: 190, left: 56, right: 144, faceY: 98, armY: 138 },
  chunky: { el: '<ellipse cx="100" cy="137" rx="70" ry="55"/>', top: 82, bottom: 190, left: 30, right: 170, faceY: 116, armY: 146 },
};

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f)));
  return '#' + ch.map((v) => v.toString(16).padStart(2, '0')).join('');
}

let uidN = 0;

// opts: { size, mood: 'happy' | 'excited' | 'sleepy', anim: true, stats }
export function render(look = DEFAULT_LOOK, opts = {}) {
  const L = { ...DEFAULT_LOOK, ...look };
  const u = `b${++uidN}`;
  const sh = SHAPES[L.shape] || SHAPES.round;
  const col = ITEM.get(L.color) || ITEM.get('sun');
  const hairC = ITEM.get(L.hairColor)?.c || '#7A4A24';
  const st = opts.stats || { strength: { level: 0 }, endurance: { level: 0 }, mobility: { level: 0 } };
  const str = st.strength.level, end = st.endurance.level, mob = st.mobility.level;
  const mood = opts.mood || (st.daysSince != null && st.daysSince > 10 ? 'sleepy' : 'happy');
  const bodyFill = col.grad ? `url(#${u}g)` : col.c;
  const dark = shade(col.c, -0.28);
  const img = (id) => (ITEM.get(id)?.img ? `<image href="img/buddy/${id}.png" x="0" y="0" width="200" height="220"/>` : null);
  const cx = 100;

  const defs = `<defs>
    <clipPath id="${u}c">${sh.el}</clipPath>
    ${col.grad ? `<linearGradient id="${u}g" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${col.grad[0]}"/><stop offset="1" stop-color="${col.grad[1]}"/></linearGradient>` : ''}
    ${ITEM.get(L.hairColor)?.rainbow ? `<linearGradient id="${u}r" x1="0" x2="1"><stop offset="0" stop-color="#F03E3E"/><stop offset=".25" stop-color="#FAB005"/><stop offset=".5" stop-color="#40C057"/><stop offset=".75" stop-color="#228BE6"/><stop offset="1" stop-color="#BE4BDB"/></linearGradient>` : ''}
  </defs>`;
  const hairFill = ITEM.get(L.hairColor)?.rainbow ? `url(#${u}r)` : hairC;

  // background
  const bgs = {
    'bg-gym': `<rect width="200" height="220" rx="24" fill="#E7F5FF"/><rect y="176" width="200" height="44" fill="#ADB5BD"/><g fill="#495057"><rect x="14" y="120" width="6" height="56"/><rect x="180" y="120" width="6" height="56"/><rect x="10" y="128" width="14" height="5" rx="2"/><rect x="176" y="128" width="14" height="5" rx="2"/><circle cx="17" cy="150" r="7"/><circle cx="183" cy="150" r="7"/></g>`,
    'bg-beach': `<rect width="200" height="220" rx="24" fill="#99E9F2"/><circle cx="160" cy="44" r="18" fill="#FFD43B"/><rect y="150" width="200" height="30" fill="#4DABF7"/><rect y="176" width="200" height="44" fill="#FFE8A3"/>`,
    'bg-mountain': `<rect width="200" height="220" rx="24" fill="#D0EBFF"/><path d="M0 180 L50 90 L90 150 L130 70 L200 170 L200 220 L0 220Z" fill="#8CE99A"/><path d="M130 70 L118 92 L142 92Z" fill="#fff"/>`,
    'bg-space': `<rect width="200" height="220" rx="24" fill="#1C1458"/>${[[20, 30], [60, 18], [170, 40], [150, 90], [30, 110], [185, 140], [12, 170], [100, 22]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.8" fill="#fff"/>`).join('')}<circle cx="165" cy="175" r="22" fill="#748FFC"/><ellipse cx="165" cy="175" rx="34" ry="6" fill="none" stroke="#BAC8FF" stroke-width="3"/>`,
  };
  const bg = L.bg ? img(L.bg) || bgs[L.bg] || '' : '';

  // behind the body
  let behind = '';
  if (L.back === 'cape') behind += img('cape') || `<path d="M${sh.left + 22} ${sh.faceY + 24} Q${cx} ${sh.faceY + 40} ${sh.right - 22} ${sh.faceY + 24} L${sh.right + 10} ${sh.bottom + 8} Q${cx} ${sh.bottom - 6} ${sh.left - 10} ${sh.bottom + 8}Z" fill="${ITEM.get('cape').c}"/>`;
  if (L.hair === 'afro') behind += `<circle cx="${cx}" cy="${sh.top + 14}" r="44" fill="${hairFill}"/>`;

  // legs + shoes
  const sc = ITEM.get(L.shoes) || ITEM.get('white');
  const legs = [-20, 20].map((dx) => `
    <rect x="${cx + dx - 7}" y="${sh.bottom - 14}" width="14" height="${sc.high ? 16 : 20}" rx="6" fill="${dark}"/>
    ${img(L.shoes) ? '' : `<ellipse cx="${cx + dx + (dx < 0 ? -3 : 3)}" cy="${sh.bottom + 10}" rx="16" ry="8" fill="${sc.c}" stroke="#495057" stroke-width="1.5"/>
    ${sc.high ? `<rect x="${cx + dx - 9}" y="${sh.bottom - 2}" width="18" height="12" rx="4" fill="${sc.c}" stroke="#495057" stroke-width="1.5"/>` : ''}
    <path d="M${cx + dx - 10} ${sh.bottom + 12} h${20 + (dx < 0 ? -2 : 2)}" stroke="#495057" stroke-width="1.2" opacity=".5"/>`}`).join('') + (img(L.shoes) || '');

  // arms (strength makes them chunkier; excited raises them)
  const up = mood === 'excited';
  const ar = 9 + str * 2.2;
  const arm = (side) => {
    const x = side < 0 ? sh.left + 4 : sh.right - 4;
    const ang = up ? side * -40 : side * 18;
    const y = up ? sh.armY - 30 : sh.armY;
    return `<g transform="rotate(${ang} ${x} ${y})">
      <ellipse cx="${x + side * 6}" cy="${y + (up ? -14 : 10)}" rx="${ar}" ry="${18 + str}" fill="${bodyFill}" stroke="${dark}" stroke-width="2"/>
      ${str >= 2 ? `<ellipse cx="${x + side * (6 + ar * 0.35)}" cy="${y + (up ? -20 : 4)}" rx="${ar * 0.55}" ry="${7 + str}" fill="${shade(col.c, 0.25)}" opacity=".7"/>` : ''}
    </g>`;
  };

  // outfit (clipped to the body)
  const of = ITEM.get(L.outfit) || ITEM.get('tank-blue');
  const oy = sh.faceY + 38;
  const kinds = {
    tank: `<rect x="0" y="${oy}" width="200" height="120" fill="${of.c}"/><path d="M${cx - 22} ${oy} q22 14 44 0" fill="${bodyFill}"/>`,
    tee: `<rect x="0" y="${oy - 4}" width="200" height="120" fill="${of.c}"/><path d="M${cx - 16} ${oy - 4} q16 10 32 0" fill="${bodyFill}"/>`,
    hoodie: `<rect x="0" y="${oy - 8}" width="200" height="130" fill="${of.c}"/><path d="M${cx - 26} ${oy - 8} q26 18 52 0" fill="${shade(of.c, -0.25)}"/><rect x="${cx - 20}" y="${oy + 30}" width="40" height="16" rx="6" fill="${shade(of.c, -0.15)}"/><path d="M${cx - 6} ${oy + 2} v14 M${cx + 6} ${oy + 2} v14" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`,
    singlet: `<rect x="0" y="${oy + 12}" width="200" height="120" fill="${of.c}"/><rect x="${cx - 30}" y="${oy - 10}" width="9" height="30" fill="${of.c}"/><rect x="${cx + 21}" y="${oy - 10}" width="9" height="30" fill="${of.c}"/><rect x="0" y="${oy + 40}" width="200" height="5" fill="#fff" opacity=".7"/>`,
    jersey: `<rect x="0" y="${oy - 4}" width="200" height="120" fill="${of.c}"/><path d="M${cx - 16} ${oy - 4} l16 12 l16 -12" fill="#fff"/><text x="${cx}" y="${oy + 40}" text-anchor="middle" font-size="24" font-weight="800" font-family="system-ui" fill="#fff">1</text>`,
    track: `<rect x="0" y="${oy - 6}" width="200" height="120" fill="${of.c}"/><rect x="${cx - 2}" y="${oy - 6}" width="4" height="80" fill="#fff"/><rect x="0" y="${oy + 10}" width="200" height="4" fill="#fff" opacity=".8"/>`,
    hero: `<rect x="0" y="${oy - 6}" width="200" height="120" fill="${of.c}"/><path d="M${cx} ${oy + 6} l6 12 13 2 -9 9 2 13 -12 -6 -12 6 2 -13 -9 -9 13 -2z" fill="#FFD43B"/><rect x="0" y="${oy + 52}" width="200" height="8" fill="#FFD43B"/>`,
  };
  const outfit = img(L.outfit) || `<g clip-path="url(#${u}c)">${kinds[of.kind] || kinds.tank}</g>`;

  // strength lines (pecs/abs) appear with training
  const lines = str >= 1 ? `<g stroke="${shade(of.c, -0.35)}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".55" clip-path="url(#${u}c)">
    <path d="M${cx - 22} ${oy + 18} q11 7 20 0 M${cx + 2} ${oy + 18} q11 7 20 0"/>
    ${str >= 3 ? `<path d="M${cx - 8} ${oy + 34} h6 M${cx + 2} ${oy + 34} h6 M${cx - 8} ${oy + 44} h6 M${cx + 2} ${oy + 44} h6"/>` : ''}
  </g>` : '';

  // face
  const fy = sh.faceY;
  const eye = (dx) => mood === 'sleepy'
    ? `<path d="M${cx + dx - 9} ${fy + 2} q9 7 18 0" stroke="#2B2B2B" stroke-width="3" fill="none" stroke-linecap="round"/>`
    : `<g class="eye"><circle cx="${cx + dx}" cy="${fy}" r="13" fill="#fff" stroke="#2B2B2B" stroke-width="2"/><circle cx="${cx + dx + 1.5}" cy="${fy + 1.5}" r="${mood === 'excited' ? 7 : 6}" fill="#2B2B2B"/><circle cx="${cx + dx + 4}" cy="${fy - 2}" r="2.2" fill="#fff"/></g>`;
  const mouth = mood === 'excited'
    ? `<path d="M${cx - 11} ${fy + 19} Q${cx} ${fy + 36} ${cx + 11} ${fy + 19}Z" fill="#7B2D26"/><path d="M${cx - 5} ${fy + 28} q5 -4 10 0 q-5 5 -10 0" fill="#FF8787"/>`
    : mood === 'sleepy'
      ? `<ellipse cx="${cx}" cy="${fy + 22}" rx="4" ry="3" fill="#7B2D26"/><text x="${cx + 34}" y="${fy - 18}" font-size="14" font-weight="700" fill="#495057" font-family="system-ui">z</text><text x="${cx + 44}" y="${fy - 30}" font-size="10" font-weight="700" fill="#495057" font-family="system-ui">z</text>`
      : `<path d="M${cx - 10} ${fy + 20} Q${cx} ${fy + 30} ${cx + 10} ${fy + 20}" stroke="#7B2D26" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  const face = `${eye(-18)}${eye(18)}<ellipse cx="${cx - 31}" cy="${fy + 15}" rx="7" ry="4.5" fill="#FF8787" opacity=".55"/><ellipse cx="${cx + 31}" cy="${fy + 15}" rx="7" ry="4.5" fill="#FF8787" opacity=".55"/>${mouth}`;

  // hair (on top of the head)
  const t = sh.top;
  const hairs = {
    bald: '',
    sprout: `<path d="M${cx} ${t + 2} q-2 -14 4 -22" stroke="${hairFill}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M${cx + 4} ${t - 20} q14 -8 20 4 q-12 8 -20 -4z" fill="${hairFill}"/>`,
    spiky: `<path d="M${cx - 30} ${t + 12} l4 -20 l8 12 l6 -22 l8 18 l6 -22 l8 20 l8 -16 l4 20 q-26 -8 -52 10z" fill="${hairFill}"/>`,
    bun: `<ellipse cx="${cx}" cy="${t + 6}" rx="34" ry="12" fill="${hairFill}"/><circle cx="${cx}" cy="${t - 10}" r="13" fill="${hairFill}"/>`,
    curly: [-26, -13, 0, 13, 26].map((dx, k) => `<circle cx="${cx + dx}" cy="${t + 4 - (k % 2) * 6}" r="11" fill="${hairFill}"/>`).join(''),
    mohawk: `<path d="M${cx - 8} ${t + 8} l-2 -18 l6 6 l2 -16 l4 10 l4 -14 l2 16 l6 -6 l-2 22z" fill="${hairFill}"/>`,
    ponytail: `<ellipse cx="${cx}" cy="${t + 6}" rx="34" ry="12" fill="${hairFill}"/><ellipse cx="${cx + 40}" cy="${t + 18}" rx="9" ry="20" transform="rotate(25 ${cx + 40} ${t + 18})" fill="${hairFill}"/><circle cx="${cx + 30}" cy="${t + 6}" r="4" fill="#F06595"/>`,
    afro: `<ellipse cx="${cx}" cy="${t + 2}" rx="40" ry="18" fill="${hairFill}"/>`,
  };
  const hair = img(L.hair) || (hairs[L.hair] ?? "");

  // head items
  const hc = ITEM.get(L.head)?.c;
  const heads = {
    headband: `<g clip-path="url(#${u}c)"><rect x="0" y="${t + 12}" width="200" height="10" fill="${hc}"/></g><path d="M${sh.right - 14} ${t + 18} l14 -4 l-4 12z" fill="${hc}"/>`,
    cap: `<path d="M${cx - 38} ${t + 16} q38 -42 76 0z" fill="${hc}"/><path d="M${cx + 20} ${t + 14} q26 -2 40 8 q-20 4 -40 -2z" fill="${shade(hc || '#1C7ED6', -0.2)}"/><circle cx="${cx}" cy="${t - 4}" r="3" fill="${shade(hc || '#1C7ED6', -0.3)}"/>`,
    beanie: `<path d="M${cx - 36} ${t + 18} q36 -50 72 0z" fill="${hc}"/><rect x="${cx - 38}" y="${t + 12}" width="76" height="10" rx="5" fill="${shade(hc || '#F08C00', -0.2)}"/><circle cx="${cx}" cy="${t - 14}" r="8" fill="#fff"/>`,
    crown: `<path d="M${cx - 24} ${t + 6} l0 -22 l12 12 l12 -18 l12 18 l12 -12 l0 22z" fill="${hc}" stroke="#B08900" stroke-width="2"/><circle cx="${cx}" cy="${t - 6}" r="3" fill="#E03131"/>`,
  };
  const head = L.head ? img(L.head) || heads[L.head] || '' : '';
  const faceItem = L.face === 'shades' && mood !== 'sleepy' ? img('shades') || `<g fill="#212529"><rect x="${cx - 33}" y="${fy - 9}" width="28" height="18" rx="7"/><rect x="${cx + 5}" y="${fy - 9}" width="28" height="18" rx="7"/><rect x="${cx - 6}" y="${fy - 4}" width="12" height="4" rx="2"/></g><path d="M${cx - 28} ${fy - 4} l8 0" stroke="#fff" stroke-width="2" opacity=".6"/>` : '';

  // hand item (right side)
  const hx = (up ? sh.right + 14 : sh.right + 10), hy = up ? sh.armY - 52 : sh.armY + 20;
  const hands = {
    shaker: `<rect x="${hx - 8}" y="${hy - 16}" width="16" height="28" rx="4" fill="${ITEM.get('shaker').c}"/><rect x="${hx - 9}" y="${hy - 22}" width="18" height="8" rx="3" fill="#343A40"/>`,
    dumbbell: `<g fill="#495057"><rect x="${hx - 3}" y="${hy - 16}" width="6" height="30" rx="2"/><rect x="${hx - 9}" y="${hy - 20}" width="18" height="8" rx="3"/><rect x="${hx - 9}" y="${hy + 10}" width="18" height="8" rx="3"/></g>`,
    kettlebell: `<path d="M${hx - 8} ${hy - 8} q8 -16 16 0" stroke="#343A40" stroke-width="5" fill="none"/><circle cx="${hx}" cy="${hy + 6}" r="13" fill="#343A40"/>`,
    trophy: `<path d="M${hx - 11} ${hy - 16} h22 v8 q0 14 -11 16 q-11 -2 -11 -16z" fill="#F2C94C" stroke="#B08900" stroke-width="2"/><rect x="${hx - 3}" y="${hy + 8}" width="6" height="8" fill="#B08900"/><rect x="${hx - 9}" y="${hy + 15}" width="18" height="5" rx="2" fill="#B08900"/>`,
  };
  const hand = L.hand ? img(L.hand) || hands[L.hand] || '' : '';
  const bag = L.back === 'gymbag' ? img('gymbag') || `<path d="M${sh.left + 20} ${sh.faceY + 28} L${sh.right - 34} ${sh.bottom - 22}" stroke="#212529" stroke-width="4"/><rect x="${sh.right - 46}" y="${sh.bottom - 34}" width="40" height="24" rx="7" fill="${ITEM.get('gymbag').c}"/><rect x="${sh.right - 40}" y="${sh.bottom - 28}" width="28" height="4" rx="2" fill="#ADB5BD"/>` : '';

  // aura from endurance / mobility
  const sparkles = end >= 1 ? [[sh.left - 14, sh.top + 10], [sh.right + 12, sh.top + 30], [sh.left - 4, sh.bottom - 40], [sh.right + 4, sh.bottom - 10]].slice(0, end + 0).map(([x, y], k) => `<path class="bspark s${k}" d="M${x} ${y - 8} L${x + 2.4} ${y - 2.4} L${x + 8} ${y} L${x + 2.4} ${y + 2.4} L${x} ${y + 8} L${x - 2.4} ${y + 2.4} L${x - 8} ${y} L${x - 2.4} ${y - 2.4}Z" fill="#FCC419" stroke="#F08C00" stroke-width="1"/>`).join('') : '';
  const galaxy = col.stars ? `<g clip-path="url(#${u}c)" fill="#fff">${[[80, 150], [120, 170], [70, 120], [135, 135], [105, 185]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6"/>`).join('')}</g>` : '';
  const belly = `<g clip-path="url(#${u}c)"><ellipse cx="${cx}" cy="${sh.bottom - 22}" rx="${(sh.right - sh.left) * 0.32}" ry="30" fill="${shade(col.c, 0.35)}" opacity=".8"/></g>`;

  const size = opts.size || 160;
  const anim = opts.anim === false ? '' : ` anim mob${mob}${up ? ' cheer' : ''}`;
  return `<svg class="buddy${anim}" viewBox="0 0 200 220" width="${size}" height="${Math.round(size * 1.1)}" role="img" aria-label="Your gym buddy">
    ${defs}${bg}
    <ellipse cx="100" cy="${sh.bottom + 16}" rx="52" ry="6" fill="#000" opacity=".12"/>
    <g class="buddy-body">
      ${behind}${legs}${arm(-1)}${arm(1)}
      <g>${sh.el.replace('/>', ` fill="${bodyFill}" stroke="${dark}" stroke-width="2.5"/>`)}</g>
      ${belly}${galaxy}${outfit}${lines}${face}${hair}${head}${faceItem}${bag}${hand}
    </g>
    ${sparkles}
  </svg>`;
}
