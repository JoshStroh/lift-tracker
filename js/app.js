import * as store from './store.js';
import { sync } from './sync.js';
import { DAY_TEMPLATES, CATEGORIES, KINDS, searchExercises, isCalisthenics } from './exercises.js';
import * as stats from './stats.js';
import * as cali from './cali.js';
import * as gen from './generator.js';
import { lineChart } from './chart.js';
import { suggest } from './suggest.js';
import { go, openModal, closeModal, actionSheet, runSheetAction, toast, thumb, visual, openInfo, infoHTML } from './ui.js';
import { esc, uid, localDate, fmtNum, fmtDate, fmtTime, fmtDuration, fmtClock } from './util.js';

const main = document.getElementById('main');
const header = document.getElementById('header');
const modal = document.getElementById('modal');
const restBar = document.getElementById('rest');
const tabs = document.getElementById('tabs');

// ================================================================ routing

function route() {
  const parts = (location.hash.replace(/^#\/?/, '') || 'workout').split('/');
  return { name: parts[0], id: parts[1] ? decodeURIComponent(parts[1]) : null, sub: parts[2] || null };
}

let mainDirty = false;
const typing = () => {
  const a = document.activeElement;
  return a && main.contains(a) && a.matches('input:not([type=date]):not([type=checkbox]):not([type=radio]):not([type=file]), textarea');
};

function render() {
  renderHeader();
  if (typing()) { mainDirty = true; return; } // don't yank the keyboard away; re-render on blur
  mainDirty = false;
  renderMain();
}

const TAB_FOR = { session: 'history', exercise: 'progress', plan: 'workout', track: 'cali', bodyweight: 'progress' };

function renderMain() {
  const r = route();
  for (const a of tabs.querySelectorAll('a')) a.classList.toggle('on', a.dataset.tab === (TAB_FOR[r.name] || r.name));
  const scroll = window.scrollY;
  const sameView = main.dataset.view === location.hash;
  main.dataset.view = location.hash;
  switch (r.name) {
    case 'history': main.innerHTML = viewHistory(); break;
    case 'session': main.innerHTML = r.sub === 'edit' ? viewEditor(store.getDoc(r.id), true) : viewSession(r.id); break;
    case 'progress': main.innerHTML = viewProgress(); drawBwSpark(); break;
    case 'bodyweight': main.innerHTML = viewBodyweight(); drawBwChart(); break;
    case 'exercise': main.innerHTML = viewExercise(r.id); drawExerciseChart(r.id); break;
    case 'plan': main.innerHTML = viewPlan(r.id); break;
    case 'cali': main.innerHTML = viewCali(); break;
    case 'track': main.innerHTML = viewTrack(r.id); break;
    case 'settings': main.innerHTML = viewSettings(); break;
    default: {
      const s = store.activeSession();
      main.innerHTML = s ? viewEditor(s, false) : viewStart();
    }
  }
  if (sameView) window.scrollTo(0, scroll);
  tick();
}

document.addEventListener('focusout', () => setTimeout(() => { if (mainDirty && !typing()) renderMain(); }, 0));

// ================================================================ header

function renderHeader() {
  const sy = store.state.sync;
  const unsynced = store.dirtyCount();
  let cls = 'off', text = 'Sync not set up';
  if (store.syncConfigured()) {
    if (sy.status === 'syncing') { cls = 'busy'; text = 'Syncing…'; }
    else if (sy.status === 'error') { cls = 'err'; text = unsynced ? `${unsynced} unsynced` : 'Sync issue'; }
    else if (unsynced) { cls = 'busy'; text = `${unsynced} to sync`; }
    else { cls = 'ok'; text = sy.lastAt ? `Synced ${ago(sy.lastAt)}` : 'Synced'; }
  }
  header.innerHTML = `<span class="brand">Lift Tracker</span><a class="sync ${cls}" href="#/settings"><i></i>${esc(text)}</a>`;
}

function ago(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function daysAgo(iso) {
  const d = Math.round((new Date(localDate()) - new Date(localDate(new Date(iso)))) / 86400000);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return `${d} days ago`;
}

const dayLabel = (ymd) => {
  const today = localDate();
  const tomorrow = localDate(new Date(Date.now() + 86400000));
  if (ymd === today) return 'Today';
  if (ymd === tomorrow) return 'Tomorrow';
  return fmtDate(ymd + 'T12:00:00', { weekday: 'long', day: 'numeric', month: 'short' });
};

// ================================================================ start screen + planner

let selectedDay = null;

const plansFor = (ymd) => store.docs('plan').filter((p) => p.date === ymd && !p.doneSessionId);
const savedPlans = () => store.docs('plan')
  .filter((p) => !p.doneSessionId && (!p.date || p.date >= localDate()))
  .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || (b.updatedAt || '').localeCompare(a.updatedAt || ''));

function viewStart() {
  const today = localDate();
  if (!selectedDay || selectedDay < today) selectedDay = today;
  const finished = store.finishedSessions();
  const doneDays = new Set(finished.map((s) => localDate(new Date(s.startedAt))));
  const days = Array.from({ length: 7 }, (_, i) => localDate(new Date(Date.now() + i * 86400000)));

  const lastByDay = {};
  for (const s of finished) if (s.dayId && !lastByDay[s.dayId]) lastByDay[s.dayId] = s;
  const ppl = DAY_TEMPLATES.filter((d) => d.id !== 'rt-abs');
  const next = ppl.slice().sort((a, b) => (lastByDay[a.id]?.startedAt || '').localeCompare(lastByDay[b.id]?.startedAt || ''))[0];

  const dayPlans = plansFor(selectedDay);
  const others = savedPlans().filter((p) => !dayPlans.includes(p));
  const recent = finished.slice(0, 2);

  return `
    <h1>Workout</h1>
    <div class="week" role="tablist">
      ${days.map((d) => {
        const dt = new Date(d + 'T12:00:00');
        const planned = plansFor(d).length;
        return `<button class="wday ${d === selectedDay ? 'on' : ''}" data-act="pick-day" data-day="${d}">
          <span class="wd">${d === today ? 'Today' : esc(dt.toLocaleDateString(undefined, { weekday: 'short' }))}</span>
          <span class="wn">${dt.getDate()}</span>
          <span class="wdot">${doneDays.has(d) ? '✓' : planned ? '●' : ''}</span>
        </button>`;
      }).join('')}
    </div>
    <section class="day-plans">
      <div class="row between"><h2 class="inline">${esc(dayLabel(selectedDay))}</h2></div>
      ${dayPlans.length ? dayPlans.map((p) => planCard(p, true)).join('') : `
        <div class="card empty-day">
          <span class="muted">Nothing planned${selectedDay === today ? ' for today' : ''}.</span>
          <button class="link-btn" data-act="wizard" data-mode="auto" data-date="${selectedDay}">Plan one</button>
        </div>`}
    </section>

    <div class="make-row">
      <button class="make" data-act="wizard" data-mode="own"><span class="make-icon">✏️</span><span><strong>Build my own</strong><small>Pick the exercises</small></span></button>
      <button class="make" data-act="wizard" data-mode="auto"><span class="make-icon">✨</span><span><strong>Create for me</strong><small>A workout in one tap</small></span></button>
    </div>

    <h2>Quick start</h2>
    <div class="days">
      ${DAY_TEMPLATES.map((d) => `
        <button class="day ${d.id}" data-act="start-day" data-day="${d.id}">
          <span class="day-name">${esc(d.name)}</span>
          <span class="day-sub">${lastByDay[d.id] ? esc(daysAgo(lastByDay[d.id].startedAt)) : 'Not done yet'}</span>
          ${d.id === next.id ? '<span class="badge">Up next</span>' : ''}
        </button>`).join('')}
    </div>
    <div class="row gap two">
      <button class="btn ghost" data-act="start-cali">🤸 Calisthenics</button>
      <button class="btn ghost" data-act="start-empty">Empty workout</button>
    </div>

    ${others.length ? `<h2>Saved plans</h2>${others.map((p) => planCard(p, false)).join('')}` : ''}
    ${recent.length ? `<h2>Recent</h2>${recent.map(sessionCard).join('')}` : `
      <div class="card hint">
        <p><strong>How it works</strong></p>
        <p>Use <strong>Quick start</strong> for your Push / Pull / Legs days — each one starts with what you did last time. <strong>Create for me</strong> builds a new workout; <strong>Build my own</strong> lets you choose. Either can be saved for a future day.</p>
        <p>Set up GitHub sync in <a href="#/settings">Settings</a> so your history is backed up.</p>
      </div>`}
  `;
}

function planCard(p, showStart) {
  const names = p.exercises.map((e) => store.exerciseName(e.exerciseId));
  return `
    <div class="card plan-card">
      <a class="plan-main" href="#/plan/${encodeURIComponent(p.id)}">
        <div class="row between"><strong>${esc(p.name)}</strong><span class="muted small">${p.date ? esc(dayLabel(p.date)) : 'Any day'}</span></div>
        <div class="small muted ex-list">${names.length ? esc(names.slice(0, 6).join(', ')) + (names.length > 6 ? ` +${names.length - 6}` : '') : 'No exercises yet'}</div>
      </a>
      ${showStart || !p.date ? `<button class="btn primary small-btn" data-act="start-plan" data-id="${esc(p.id)}" ${p.exercises.length ? '' : 'disabled'}>Start</button>` : ''}
    </div>`;
}

function blankSet() { return { kg: null, reps: null, sec: null, done: false }; }

function lastSidesFor(exerciseId) {
  for (const s of store.finishedSessions()) {
    const e = s.exercises.find((x) => x.exerciseId === exerciseId);
    if (e) return !!e.sides;
  }
  return null;
}
const defaultSides = (exerciseId) => lastSidesFor(exerciseId) ?? !!store.getExercise(exerciseId).sided;

function sessionExercise(exerciseId, n, extra = {}) {
  return { exerciseId, sets: Array.from({ length: n }, blankSet), sides: extra.sides ?? defaultSides(exerciseId), target: extra.target || '', track: extra.track || undefined };
}

async function startDay(dayId) {
  const t = DAY_TEMPLATES.find((d) => d.id === dayId);
  const last = store.finishedSessions().find((s) => s.dayId === dayId);
  const exercises = last
    ? last.exercises.map((e) => sessionExercise(e.exerciseId, e.sets.length, { sides: e.sides, target: e.target }))
    : t.exercises.map((id) => sessionExercise(id, 3));
  await newSession(t.name, { dayId }, exercises);
}

async function startPlan(planId) {
  const p = store.getDoc(planId);
  if (!p) return;
  const exercises = p.exercises.map((e) => sessionExercise(e.exerciseId, e.sets || 3, e));
  await newSession(p.name, { planId: p.id, dayId: p.dayId === 'push' ? 'rt-push' : p.dayId === 'pull' ? 'rt-pull' : p.dayId === 'legs' ? 'rt-legs' : null }, exercises);
}

async function startCali() {
  const s = cali.todaysSession();
  await newSession(s.name, { dayId: 'cali' }, s.exercises.map((e) => sessionExercise(e.exerciseId, e.sets, e)));
}

async function newSession(name, meta, exercises) {
  if (store.activeSession()) { toast('Finish or discard the current workout first'); go('#/workout'); return; }
  const now = new Date().toISOString();
  await store.saveDoc({ id: `${localDate()}-${uid()}`, type: 'session', name, dayId: meta.dayId || null, planId: meta.planId || null, startedAt: now, endedAt: null, notes: '', exercises });
  go('#/workout');
  window.scrollTo(0, 0);
}

// ================================================================ wizard ("Build my own" / "Create for me")

let wiz = null;

function openWizard(mode, date) {
  wiz = { mode, dayType: wiz?.dayType || 'push', style: wiz?.style || 'conventional', length: wiz?.length || 'normal', date: date ?? (selectedDay && selectedDay !== localDate() ? selectedDay : localDate()) };
  renderWizard();
}

function renderWizard() {
  const chips = (field, list) => list.map((x) => `
    <button class="choice ${wiz[field] === x.id ? 'on' : ''}" data-act="wiz-set" data-field="${field}" data-val="${x.id}">
      <strong>${esc(x.name)}</strong>${x.blurb ? `<small>${esc(x.blurb)}</small>` : ''}
    </button>`).join('');
  openModal(`
    <div class="info-head"><span></span><button class="link-btn" data-act="close-modal">Cancel</button></div>
    <h2 class="info-title">${wiz.mode === 'own' ? '✏️ Build my own' : '✨ Create for me'}</h2>
    <h4>What are you training?</h4>
    <div class="choices three">${chips('dayType', gen.DAY_TYPES)}</div>
    ${wiz.dayType === 'stretch' ? '' : `<h4>Style</h4><div class="choices three">${chips('style', gen.STYLES)}</div>`}
    ${wiz.style !== 'conventional' && wiz.dayType !== 'stretch' && !Object.keys(cali.progress().levels || {}).length ? '<p class="small note">Tip: set your level on each track in the <strong>Calisthenics</strong> tab first, so bodyweight exercises match what you can do.</p>' : ''}
    ${wiz.mode === 'auto' ? `<h4>Length</h4><div class="choices three">${chips('length', gen.LENGTHS.map((l) => ({ ...l, blurb: `${l.n} exercises` })))}</div>` : ''}
    <h4>When?</h4>
    <div class="row gap when">
      <input type="date" id="wiz-date" value="${esc(wiz.date || '')}" min="${localDate()}">
      <button class="choice slim ${!wiz.date ? 'on' : ''}" data-act="wiz-nodate">No date</button>
    </div>
    <button class="btn wide primary" data-act="wiz-create">${wiz.mode === 'own' ? 'Choose exercises' : 'Create workout'}</button>
  `, { cls: 'wizard' });
}

async function createFromWizard() {
  const d = document.getElementById('wiz-date')?.value;
  if (d !== undefined) wiz.date = d || null;
  const exercises = wiz.mode === 'auto' ? gen.generate(wiz) : [];
  const plan = {
    id: 'pl-' + uid(), type: 'plan', name: gen.planName(wiz.dayType, wiz.style), dayId: wiz.dayType,
    style: wiz.dayType === 'stretch' ? 'mixed' : wiz.style, date: wiz.date || null, exercises, generated: wiz.mode === 'auto', createdAt: new Date().toISOString(),
  };
  closeModal();
  await store.saveDoc(plan, { render: false });
  go(`#/plan/${encodeURIComponent(plan.id)}`);
  if (wiz.mode === 'own') setTimeout(() => openPicker({ type: 'plan-add', planId: plan.id }), 80);
}

// ================================================================ plan editor

function viewPlan(id) {
  const p = store.getDoc(id);
  if (!p) return '<a class="back" href="#/workout">‹ Workout</a><p class="muted pad">Plan not found.</p>';
  const typeName = gen.DAY_TYPES.find((d) => d.id === p.dayId)?.name;
  const styleName = gen.STYLES.find((s) => s.id === p.style)?.name;
  return `
    <a class="back" href="#/workout">‹ Workout</a>
    <input class="title-input" data-plan-field="name" value="${esc(p.name)}" aria-label="Plan name">
    <div class="chips">${typeName ? `<span class="chip">${esc(typeName)}</span>` : ''}${styleName && p.dayId !== 'stretch' ? `<span class="chip">${esc(styleName)}</span>` : ''}</div>
    <label class="field inline-field">Date
      <span class="row gap"><input type="date" data-plan-field="date" value="${esc(p.date || '')}"><button class="link-btn" data-act="plan-nodate">No date</button></span>
    </label>
    ${p.exercises.map((e, i) => planRow(p, e, i)).join('') || '<p class="muted pad center">No exercises yet.</p>'}
    <button class="btn wide" data-act="plan-add">+ Add exercise</button>
    ${p.generated ? '<button class="btn wide ghost" data-act="plan-regen">✨ Generate again</button>' : ''}
    <div class="plan-actions">
      <button class="btn primary" data-act="start-plan" data-id="${esc(p.id)}" ${p.exercises.length ? '' : 'disabled'}>Start now</button>
      <button class="btn" data-act="plan-save">Save${p.date ? ` for ${esc(/^To/.test(dayLabel(p.date)) ? dayLabel(p.date).toLowerCase() : fmtDate(p.date + 'T12:00:00', { weekday: 'short', day: 'numeric' }))}` : ''}</button>
    </div>
    <button class="btn wide danger-text" data-act="plan-delete">Delete plan</button>
  `;
}

function planRow(p, e, i) {
  const ex = store.getExercise(e.exerciseId);
  const unit = ex.kind === 'time' ? '' : ' reps';
  return `
    <div class="card plan-row">
      <button class="thumb-btn" data-act="info" data-id="${esc(ex.id)}" aria-label="How to do ${esc(ex.name)}">${thumb(ex)}</button>
      <div class="plan-row-main">
        <div class="row between"><strong>${esc(ex.name)}</strong>
          <span class="row">${e.pattern || p.generated ? `<button class="icon" data-act="plan-shuffle" data-i="${i}" aria-label="Swap for another">↻</button>` : ''}<button class="icon" data-act="plan-menu" data-i="${i}" aria-label="Options">⋯</button></span>
        </div>
        <div class="row gap small sets-line">
          <span class="stepper"><button data-act="plan-sets" data-i="${i}" data-d="-1">−</button><span>${e.sets || 3}</span><button data-act="plan-sets" data-i="${i}" data-d="1">+</button></span>
          <span class="muted">sets ×</span>
          <input class="target" data-plan-target="${i}" value="${esc(e.target || '')}" placeholder="${ex.kind === 'time' ? '30s' : '8–12'}" aria-label="Target">
          <span class="muted">${unit}${e.sides ? ' each side' : ''}</span>
        </div>
        ${e.track ? `<div class="small muted">🤸 ${esc(cali.getTrack(e.track)?.name || '')} track</div>` : ''}
        ${(() => { if (store.state.settings.suggest === false) return ''; const sg = suggest(e.exerciseId, { sets: e.sets || 3, target: e.target, track: e.track, sides: e.sides }); return sg.action === 'first' ? '' : `<div class="small sugg-line">💡 Next time: <strong>${esc(sg.title)}</strong></div>`; })()}
      </div>
    </div>`;
}

const editingPlan = () => (route().name === 'plan' ? store.getDoc(route().id) : null);

// ================================================================ workout editor

function viewEditor(s, editing) {
  if (!s) return '<p class="muted pad">Workout not found.</p>';
  return `
    <div class="session-head">
      <div>
        <button class="title-btn" data-act="rename">${esc(s.name)} <span class="muted">✎</span></button>
        <div class="muted small">${editing ? esc(fmtDate(s.startedAt)) : `${esc(fmtTime(s.startedAt))} · <span id="elapsed"></span>`}</div>
      </div>
      <button class="btn primary" data-act="${editing ? 'edit-done' : 'finish'}">${editing ? 'Done' : 'Finish'}</button>
    </div>
    ${s.exercises.map((e, i) => exerciseBlock(s, e, i, editing)).join('')}
    <button class="btn wide" data-act="add-ex">+ Add exercise</button>
    <textarea class="notes" data-field="notes" placeholder="Workout notes" rows="2">${esc(s.notes || '')}</textarea>
    ${editing ? '' : '<button class="btn wide danger-text" data-act="discard">Discard workout</button>'}
  `;
}

function exerciseBlock(s, e, i, editing) {
  const ex = store.getExercise(e.exerciseId);
  const kind = ex.kind || 'weight';
  const prior = stats.historyFor(e.exerciseId, { before: editing ? s.startedAt : undefined, excludeId: s.id });
  const prev = prior.length ? prior[prior.length - 1].sets : [];
  const best = stats.bestSet(kind, prior.flatMap((h) => h.sets));
  const bestScore = best ? stats.score(kind, best) : null;
  const imb = e.sides ? stats.imbalance(kind, prev) : null;
  const track = e.track ? cali.getTrack(e.track) : null;
  const trackStep = track ? track.steps.find((st) => st.exerciseId === e.exerciseId) : null;

  const sug = !editing && store.state.settings.suggest !== false ? suggest(e.exerciseId, e, s) : null;
  const fields = kind === 'weight' ? [['kg', 'decimal'], ['reps', 'numeric']] : kind === 'reps' ? [['reps', 'numeric']] : [['sec', 'text']];
  const cols = kind === 'weight' ? ['kg', 'Reps'] : kind === 'reps' ? ['Reps'] : ['Time'];

  const input = (field, st, p, j) => {
    const raw = st[field];
    const val = field.startsWith('sec') ? (raw != null ? stats.fmtSec(raw) : '') : raw ?? '';
    const ph = p ? (field.startsWith('sec') ? stats.fmtSec(p[field]) : p[field] ?? '') : '';
    const mode = field.startsWith('kg') ? 'decimal' : field.startsWith('sec') ? 'text' : 'numeric';
    return `<input data-field="${field}" data-ex="${i}" data-set="${j}" inputmode="${mode}" value="${esc(val)}" placeholder="${esc(ph)}" autocomplete="off" enterkeyhint="next">`;
  };

  const rows = e.sets.map((st, j) => {
    const sp = sug?.sets?.[j] || null; // suggested numbers for this set
    const p = sp || prev[j] || prev[prev.length - 1];
    const isPR = st.done && bestScore != null && stats.isValidSet(kind, st) && stats.score(kind, st) > bestScore + 1e-9;
    const check = `<button class="check" data-act="toggle-set" data-ex="${i}" data-set="${j}" aria-label="Done">${isPR ? '🏆' : '✓'}</button>`;
    const setno = `<button class="setno" data-act="set-menu" data-ex="${i}" data-set="${j}">${j + 1}</button>`;
    if (!e.sides) {
      return `<tr class="${st.done ? 'done' : ''}">
        <td>${setno}</td>
        <td class="prev">${esc(stats.shortLabel(kind, prev[j]) || '—')}</td>
        ${fields.map(([f]) => `<td>${input(f, st, p, j)}</td>`).join('')}
        <td>${check}</td></tr>`;
    }
    const pl = prev[j] && stats.isSidedSet(prev[j]) ? prev[j] : null;
    const pp = p && stats.isSidedSet(p) ? p : p;
    const ppR = sp ? sp : pp ? { kgR: pp.kgR ?? pp.kg, repsR: pp.repsR ?? pp.reps, secR: pp.secR ?? pp.sec } : null;
    return `<tr class="${st.done ? 'done' : ''} side-l">
        <td rowspan="2">${setno}</td>
        <td class="prev"><span class="lr">L</span>${esc(pl ? stats.sideShort(kind, pl, 'L') : prev[j] ? stats.shortLabel(kind, prev[j]) : '—')}</td>
        ${fields.map(([f]) => `<td>${input(f, st, pp, j)}</td>`).join('')}
        <td rowspan="2">${check}</td></tr>
      <tr class="${st.done ? 'done' : ''} side-r">
        <td class="prev"><span class="lr">R</span>${esc(pl ? stats.sideShort(kind, pl, 'R') : prev[j] ? stats.shortLabel(kind, prev[j]) : '—')}</td>
        ${fields.map(([f]) => `<td>${input(f + 'R', st, ppR, j)}</td>`).join('')}</tr>`;
  }).join('');

  const goal = trackStep ? `Goal ${cali.stdLabel(trackStep.std)} to level up` : e.target ? `Target ${e.sets.length} × ${e.target}${kind === 'time' || /s$/.test(e.target) ? '' : ' reps'}${e.sides ? ' each side' : ''}` : '';

  return `
    <section class="card ex-card">
      <div class="ex-head">
        <button class="thumb-btn" data-act="info" data-id="${esc(ex.id)}" aria-label="How to do ${esc(ex.name)}">${thumb(ex, 'thumb sm')}</button>
        <button class="ex-name" data-act="ex-menu" data-ex="${i}">${esc(ex.name)}</button>
        <button class="icon" data-act="ex-menu" data-ex="${i}" aria-label="Exercise options">⋯</button>
      </div>
      <div class="ex-stats small">
        ${goal ? `<div class="goal">${esc(goal)}</div>` : ''}
        ${sug ? `<button class="sugg ${sug.action}" data-act="sugg" data-ex="${i}"><span class="sugg-k">💡 Next</span> <strong>${esc(sug.title)}</strong><span class="why">Why?</span></button>` : ''}
        ${prev.length ? `<div><span class="muted">Last</span> ${esc(prev.map((x) => stats.shortLabel(kind, x)).join(' · '))}</div>` : '<div class="muted">First time — no history yet</div>'}
        ${best ? `<div><span class="muted">Best</span> ${esc(stats.bestLabel(kind, best))}</div>` : ''}
        ${imb ? `<div><span class="muted">L/R</span> ${esc(stats.imbalanceText(imb))}</div>` : ''}
      </div>
      <table class="sets ${kind} ${e.sides ? 'sided' : ''}">
        <thead><tr><th>Set</th><th>Previous</th>${cols.map((c) => `<th>${c}</th>`).join('')}<th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <button class="add-set" data-act="add-set" data-ex="${i}">+ Add set</button>
    </section>`;
}

function editingSession() {
  const r = route();
  return r.name === 'session' && r.sub === 'edit' ? store.getDoc(r.id) : store.activeSession();
}

function parseTime(v) {
  v = String(v).trim();
  if (!v) return null;
  if (v.includes(':')) {
    const [m, s] = v.split(':');
    return (parseInt(m, 10) || 0) * 60 + (parseInt(s, 10) || 0);
  }
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
}

function parseNum(v) {
  if (v === '' || v == null) return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}

async function toggleSet(i, j) {
  const s = editingSession();
  const e = s.exercises[i];
  const st = e.sets[j];
  const kind = store.getExercise(e.exerciseId).kind || 'weight';
  if (!st.done) {
    // Fill empty fields from the placeholders (last time's numbers).
    const row = main.querySelectorAll(`[data-ex="${i}"][data-set="${j}"][data-field]`);
    for (const inp of row) {
      if (inp.value === '' && inp.placeholder) {
        const f = inp.dataset.field;
        st[f] = f.startsWith('sec') ? parseTime(inp.placeholder) : parseNum(inp.placeholder);
      }
    }
    if (!stats.isValidSet(kind, st)) {
      const target = [...row].find((x) => !x.dataset.field.startsWith('kg') && !x.value) || row[0];
      target?.focus();
      return;
    }
    st.done = true;
    if (!s.endedAt) startRest();
  } else {
    st.done = false;
  }
  await store.saveDoc(s);
}

function cleanSets(s) {
  for (const e of s.exercises) {
    const kind = store.getExercise(e.exerciseId).kind || 'weight';
    e.sets = e.sets.filter((st) => stats.isValidSet(kind, st));
  }
  s.exercises = s.exercises.filter((e) => e.sets.length);
}

async function finishWorkout() {
  const s = store.activeSession();
  cleanSets(s);
  s.exercises.forEach((e) => e.sets.forEach((st) => { st.done = true; }));
  if (!s.exercises.length) {
    if (confirm('No sets were logged. Discard this workout?')) { stopRest(); await store.deleteDoc(s); }
    return;
  }
  s.endedAt = new Date().toISOString();
  stopRest();
  await store.saveDoc(s, { render: false });
  const plan = s.planId && store.getDoc(s.planId);
  if (plan) {
    if (plan.date) plan.doneSessionId = s.id;
    plan.lastUsedAt = s.endedAt;
    await store.saveDoc(plan, { render: false });
  }
  store.scheduleSync(500);
  go(`#/session/${encodeURIComponent(s.id)}`);
}

// ================================================================ history

function sessionCard(s) {
  const dur = s.endedAt ? fmtDuration(new Date(s.endedAt) - new Date(s.startedAt)) : 'In progress';
  const vol = stats.sessionVolume(s);
  const prs = stats.prSetsInSession(s).size;
  return `
    <a class="card session-card" href="#/session/${encodeURIComponent(s.id)}">
      <div class="row between"><strong>${esc(s.name)}</strong><span class="muted small">${esc(fmtDate(s.startedAt))}</span></div>
      <div class="muted small">${esc(dur)}${vol ? ` · ${fmtNum(vol)} kg volume` : ''}${prs ? ` · 🏆 ${prs} PR${prs > 1 ? 's' : ''}` : ''}</div>
      <div class="small ex-list">${s.exercises.map((e) => `${esc(store.exerciseName(e.exerciseId))} <span class="muted">×${e.sets.length}</span>`).join(', ')}</div>
    </a>`;
}

function viewHistory() {
  const list = store.finishedSessions();
  if (!list.length) return '<h1>History</h1><p class="muted pad">No workouts yet. Finished workouts appear here.</p>';
  let out = '<h1>History</h1>';
  let month = '';
  for (const s of list) {
    const m = fmtDate(s.startedAt, { month: 'long', year: 'numeric' });
    if (m !== month) { out += `<h2>${esc(m)}</h2>`; month = m; }
    out += sessionCard(s);
  }
  return out;
}

function levelUpBanners(exerciseIds) {
  const ids = new Set(exerciseIds);
  return cali.readyTracks().filter((t) => ids.has(cali.currentStep(t.id).exerciseId)).map((t) => {
    const idx = cali.currentIndex(t.id);
    const next = t.steps[idx + 1];
    return `<div class="card levelup">
      <div>🎉 <strong>${esc(t.name)}:</strong> you hit ${esc(cali.stdLabel(t.steps[idx].std))} on ${esc(t.steps[idx].name)}.
      ${next ? `Next up: <strong>${esc(next.name)}</strong>.` : 'That was the final step!'}</div>
      <button class="btn primary small-btn" data-act="level-up" data-track="${t.id}">Level up</button>
    </div>`;
  }).join('');
}

function viewSession(id) {
  const s = store.getDoc(id);
  if (!s) return '<p class="muted pad">Workout not found.</p>';
  const prs = stats.prSetsInSession(s);
  return `
    <a class="back" href="#/history">‹ History</a>
    <div class="session-head">
      <div>
        <h1 class="tight">${esc(s.name)}</h1>
        <div class="muted small">${esc(fmtDate(s.startedAt, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))} · ${esc(fmtTime(s.startedAt))}${s.endedAt ? ` · ${fmtDuration(new Date(s.endedAt) - new Date(s.startedAt))}` : ''}</div>
      </div>
      <a class="btn" href="#/session/${encodeURIComponent(s.id)}/edit">Edit</a>
    </div>
    ${levelUpBanners(s.exercises.map((e) => e.exerciseId))}
    ${prs.size ? `<div class="card pr-banner">🏆 ${prs.size} personal record${prs.size > 1 ? 's' : ''} this workout</div>` : ''}
    ${s.exercises.map((e) => {
      const ex = store.getExercise(e.exerciseId);
      const kind = ex.kind || 'weight';
      const imb = stats.imbalance(kind, e.sets);
      return `
      <section class="card">
        <a class="ex-line" href="#/exercise/${encodeURIComponent(e.exerciseId)}">${thumb(ex, 'thumb sm')}<span class="ex-name">${esc(ex.name)} ›</span></a>
        <ol class="set-list">${e.sets.map((st) => `<li>${esc(stats.setLabel(kind, st))}${prs.has(st) ? ' <span class="pr">🏆 PR</span>' : ''}</li>`).join('')}</ol>
        ${imb ? `<div class="small muted">${esc(stats.imbalanceText(imb))}</div>` : ''}
      </section>`;
    }).join('')}
    ${s.notes ? `<div class="card"><div class="muted small">Notes</div><p class="pre">${esc(s.notes)}</p></div>` : ''}
    <button class="btn wide" data-act="session-to-plan" data-id="${esc(s.id)}">Save as a plan</button>
    <button class="btn wide danger-text" data-act="delete-session" data-id="${esc(s.id)}">Delete workout</button>
  `;
}

// ================================================================ progress

let progressQuery = '';

function exerciseSummaries() {
  const map = new Map();
  for (const s of store.finishedSessions()) {
    for (const e of s.exercises) if (!map.has(e.exerciseId)) map.set(e.exerciseId, s.startedAt);
  }
  return [...map.entries()].map(([id, last]) => {
    const ex = store.getExercise(id);
    const kind = ex.kind || 'weight';
    const best = stats.bestSet(kind, stats.historyFor(id).flatMap((h) => h.sets));
    return { ex, last, best, kind };
  });
}

function viewProgress() {
  const finished = store.finishedSessions();
  const now = new Date();
  const weekStart = new Date(now); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const inWeek = finished.filter((s) => new Date(s.startedAt) >= weekStart).length;
  const inMonth = finished.filter((s) => new Date(s.startedAt) >= monthStart).length;

  return `
    <h1>Progress</h1>
    <div class="tiles">
      <div class="tile"><span class="tile-num">${inWeek}</span><span class="tile-label">This week</span></div>
      <div class="tile"><span class="tile-num">${inMonth}</span><span class="tile-label">This month</span></div>
      <div class="tile"><span class="tile-num">${finished.length}</span><span class="tile-label">All time</span></div>
    </div>
    ${bwCard()}
    <h2>Exercises</h2>
    <input class="search" id="progress-q" type="search" placeholder="Search your exercises" value="${esc(progressQuery)}" autocomplete="off">
    <div id="progress-list">${progressList()}</div>`;
}

function progressList() {
  let items = exerciseSummaries();
  if (!items.length) return '<p class="muted pad">Finish a workout to see progress here.</p>';
  if (progressQuery) {
    const order = searchExercises(items.map((i) => i.ex), progressQuery).map((e) => e.id);
    items = order.map((id) => items.find((i) => i.ex.id === id));
  }
  return items.map((i) => `
    <a class="card list-row" href="#/exercise/${encodeURIComponent(i.ex.id)}">
      ${thumb(i.ex, 'thumb sm')}
      <div class="grow"><strong>${esc(i.ex.name)}</strong><div class="muted small">Last: ${esc(daysAgo(i.last))}</div></div>
      <div class="right small">${i.best ? esc(stats.setLabel(i.kind, i.best)) : ''}${i.kind === 'weight' && i.best ? `<div class="muted">1RM ≈ ${fmtNum(stats.score('weight', i.best))}kg</div>` : ''}</div>
    </a>`).join('') || '<p class="muted pad">No matches.</p>';
}

const metricChoice = {};

function viewExercise(id) {
  const ex = store.getExercise(id);
  const kind = ex.kind || 'weight';
  const hist = stats.historyFor(id);
  const metrics = stats.METRICS[kind];
  const metric = metrics.find((m) => m.key === metricChoice[id]) || metrics[0];
  const best = stats.bestSet(kind, hist.flatMap((h) => h.sets));
  const bestSession = best && hist.find((h) => h.sets.includes(best))?.session;
  const lastSided = hist.slice().reverse().find((h) => h.sets.some(stats.isSidedSet));
  const imb = lastSided ? stats.imbalance(kind, lastSided.sets) : null;

  let hero = '';
  if (best) {
    const num = kind === 'weight' ? fmtNum(stats.score(kind, best)) : kind === 'reps' ? stats.score(kind, best) : stats.fmtSec(stats.score(kind, best));
    const unit = kind === 'weight' ? 'kg' : kind === 'reps' ? 'reps' : '';
    hero = `
      <div class="hero card">
        <div class="muted small">${kind === 'weight' ? 'Estimated 1-rep max' : 'Best set'}${stats.isSidedSet(best) ? ' (weaker side)' : ''}</div>
        <div class="hero-num">${esc(num)}<span>${unit}</span></div>
        <div class="muted small">${kind === 'weight' ? `from ${esc(stats.setLabel(kind, best))} · ` : ''}${bestSession ? esc(fmtDate(bestSession.startedAt, { day: 'numeric', month: 'short', year: 'numeric' })) : ''}</div>
      </div>`;
  }

  const repMax = kind === 'weight' ? stats.repMaxes(hist) : [];
  return `
    <a class="back" href="#/progress">‹ Progress</a>
    <div class="ex-title">
      <button class="thumb-btn" data-act="info" data-id="${esc(id)}">${thumb(ex, 'thumb lg')}</button>
      <div><h1 class="tight">${esc(ex.name)}</h1>
      <p class="muted small">${esc(ex.category || '')} · ${esc(KINDS[kind])} · <button class="link-btn inline" data-act="info" data-id="${esc(id)}">How to do it</button></p></div>
    </div>
    ${hist.length ? `
      ${hero}
      ${(() => { const sg = suggest(id, {}); return `<div class="card sugg-card"><div class="muted small">💡 Suggested next session</div><strong>${esc(sg.title)}</strong><p class="small">${esc(sg.reason)}</p></div>`; })()}
      ${imb ? `<div class="card"><strong>Left vs right</strong><div class="small">${esc(stats.imbalanceText(imb))} <span class="muted">(last time it was tracked)</span></div></div>` : ''}
      <section class="card">
        <div class="seg" role="tablist">
          ${metrics.map((m) => `<button class="${m === metric ? 'on' : ''}" data-act="metric" data-ex="${esc(id)}" data-metric="${m.key}">${m.label}</button>`).join('')}
        </div>
        <div class="chart-title small muted">${esc(metric.label)} per workout${metric.unit ? ` (${metric.unit})` : ''}</div>
        <div id="chart"></div>
      </section>
      ${repMax.some((r) => r.best) ? `
      <section class="card">
        <h3>Personal records</h3>
        <table class="pr-table">
          <thead><tr><th>Reps</th><th>Heaviest</th><th>Date</th></tr></thead>
          <tbody>${repMax.map((r) => `<tr><td>${r.reps}+</td><td>${r.best ? `${fmtNum(r.best.kg)}kg` : '<span class="muted">—</span>'}</td><td class="muted">${r.best ? esc(fmtDate(r.best.session.startedAt, { day: 'numeric', month: 'short', year: '2-digit' })) : ''}</td></tr>`).join('')}</tbody>
        </table>
      </section>` : ''}
      <h2>History</h2>
      ${hist.slice().reverse().map((h) => `
        <a class="card list-row" href="#/session/${encodeURIComponent(h.session.id)}">
          <div><strong>${esc(fmtDate(h.session.startedAt))}</strong><div class="muted small">${esc(h.session.name)}</div></div>
          <div class="right small">${esc(h.sets.map((st) => stats.shortLabel(kind, st)).join(' · '))}</div>
        </a>`).join('')}
    ` : `<div class="card center">${visual(ex)}</div><p class="muted pad">No history for this exercise yet.</p>`}
  `;
}

function drawExerciseChart(id) {
  const el = document.getElementById('chart');
  if (!el) return;
  const kind = store.getExercise(id).kind || 'weight';
  const metrics = stats.METRICS[kind];
  const metric = metrics.find((m) => m.key === metricChoice[id]) || metrics[0];
  const series = stats.chartSeries(id, metric);
  if (series.length === 1) {
    for (const p of series[0].points) {
      const h = stats.historyFor(id).find((x) => x.session.id === p.session.id);
      p.note = h ? h.sets.map((st) => stats.shortLabel(kind, st)).join(' · ') : '';
    }
  }
  const format = metric.unit === 's' ? (v) => stats.fmtSec(v) : (v) => `${fmtNum(v)} ${metric.unit}`;
  lineChart(el, series, { format });
}


// ================================================================ body weight

const bwEntries = () => store.docs('bodyweight').filter((d) => d.kg > 0).sort((a, b) => a.date.localeCompare(b.date));
const bwT = (d) => new Date(d.date + 'T12:00:00').getTime();

function bwChange(entries, days) {
  if (entries.length < 2) return null;
  const last = entries[entries.length - 1];
  const cutoff = bwT(last) - days * 86400000;
  const base = [...entries].reverse().find((e) => bwT(e) <= cutoff) || entries[0];
  if (base === last) return null;
  return { diff: last.kg - base.kg, since: base.date };
}

const signed = (v) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmtNum(Math.abs(v))}`;

function bwCard() {
  const e = bwEntries();
  const last = e[e.length - 1];
  const ch = bwChange(e, 30);
  return `
    <section class="card bw-card">
      <div class="row between">
        <a class="bw-main" href="#/bodyweight">
          <div class="muted small">Body weight</div>
          ${last ? `<div class="bw-num">${fmtNum(last.kg)}<span>kg</span></div>
            <div class="small muted">${esc(daysAgo(last.date + 'T12:00:00'))}${ch ? ` · ${signed(ch.diff)} kg in 30 days` : ''}</div>` : '<div class="small muted pad-top">Log your weight to see a trend.</div>'}
        </a>
        <button class="btn primary small-btn" data-act="bw-add">+ Log</button>
      </div>
      ${e.length >= 2 ? '<a href="#/bodyweight" class="bw-spark" id="bw-spark" aria-label="Body weight chart"></a>' : ''}
    </section>`;
}

function drawBwSpark() {
  const el = document.getElementById('bw-spark');
  if (!el) return;
  const pts = bwEntries().slice(-30).map((d) => ({ t: bwT(d), v: d.kg }));
  const W = 300, H = 44;
  const xs = pts.map((p) => p.t), ys = pts.map((p) => p.v);
  const x0 = Math.min(...xs), x1 = Math.max(...xs) || x0 + 1, y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = (t) => 4 + ((t - x0) / (x1 - x0 || 1)) * (W - 8);
  const Y = (v) => H - 6 - ((v - y0) / (y1 - y0 || 1)) * (H - 12);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path class="spark" d="${path}"/></svg>`;
}

let bwRange = '3m';
const BW_RANGES = [['1m', '1M', 31], ['3m', '3M', 92], ['1y', '1Y', 366], ['all', 'All', null]];

function viewBodyweight() {
  const e = bwEntries();
  const last = e[e.length - 1];
  const stat = (label, days) => {
    const c = bwChange(e, days);
    return `<div class="tile"><span class="tile-num">${c ? signed(c.diff) : '–'}</span><span class="tile-label">${label}</span></div>`;
  };
  const low = e.length ? Math.min(...e.map((d) => d.kg)) : null;
  const high = e.length ? Math.max(...e.map((d) => d.kg)) : null;
  return `
    <a class="back" href="#/progress">‹ Progress</a>
    <div class="row between"><h1 class="tight">Body weight</h1><button class="btn primary small-btn" data-act="bw-add">+ Log weight</button></div>
    ${last ? `
      <div class="hero card">
        <div class="muted small">Latest · ${esc(fmtDate(last.date + 'T12:00:00', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}</div>
        <div class="hero-num">${fmtNum(last.kg)}<span>kg</span></div>
        <div class="muted small">Lowest ${fmtNum(low)} kg · Highest ${fmtNum(high)} kg · ${e.length} entr${e.length === 1 ? 'y' : 'ies'}</div>
      </div>
      <div class="tiles">${stat('7 days', 7)}${stat('30 days', 30)}${stat('90 days', 90)}</div>
      <section class="card">
        <div class="seg" role="tablist">${BW_RANGES.map(([k, l]) => `<button class="${k === bwRange ? 'on' : ''}" data-act="bw-range" data-range="${k}">${l}</button>`).join('')}</div>
        <div class="chart-title small muted">Body weight (kg)</div>
        <div id="chart"></div>
      </section>
      <h2>Entries</h2>
      ${e.slice().reverse().map((d, i, arr) => {
        const prev = arr[i + 1];
        return `<button class="card list-row bw-row" data-act="bw-entry" data-id="${esc(d.id)}">
          <span class="grow"><strong>${esc(fmtDate(d.date + 'T12:00:00', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}</strong></span>
          <span class="right"><strong>${fmtNum(d.kg)} kg</strong>${prev ? `<span class="small muted block">${signed(d.kg - prev.kg)} kg</span>` : ''}</span>
        </button>`;
      }).join('')}
    ` : '<p class="muted pad">No entries yet. Weigh yourself at the same time of day (e.g. in the morning) for the most consistent trend.</p>'}
  `;
}

function drawBwChart() {
  const el = document.getElementById('chart');
  if (!el) return;
  const days = BW_RANGES.find((r) => r[0] === bwRange)[2];
  const cutoff = days ? Date.now() - days * 86400000 : 0;
  const points = bwEntries().filter((d) => bwT(d) >= cutoff).map((d) => ({ t: bwT(d), v: d.kg }));
  lineChart(el, [{ name: '', points }], { format: (v) => `${fmtNum(v)} kg`, markMax: false });
}

function openBwForm(entry) {
  const last = bwEntries().slice(-1)[0];
  openModal(`
    <div class="sheet-title">${entry ? 'Edit entry' : 'Log body weight'}</div>
    <form id="bw-form" class="pad" data-id="${esc(entry?.id || '')}">
      <label class="field">Weight (kg)
        <input name="kg" inputmode="decimal" autocomplete="off" required value="${entry ? esc(entry.kg) : ''}" placeholder="${last ? esc(last.kg) : 'e.g. 78.5'}" class="bw-input">
      </label>
      <label class="field">Date <input name="date" type="date" value="${esc(entry?.date || localDate())}" max="${localDate()}" required></label>
      <div class="row gap"><button class="btn primary" type="submit">Save</button><button class="btn" type="button" data-act="close-modal">Cancel</button></div>
    </form>`);
  setTimeout(() => document.querySelector('#bw-form [name=kg]')?.focus(), 60);
}

async function saveBw(form) {
  const f = new FormData(form);
  const kg = parseNum(f.get('kg'));
  const date = String(f.get('date'));
  if (!(kg > 0) || kg > 500 || !date) { toast('Enter a weight in kg'); return; }
  const oldId = form.dataset.id;
  const id = 'bw-' + date;
  closeModal();
  if (oldId && oldId !== id) await store.deleteDoc(store.getDoc(oldId));
  await store.saveDoc({ id, type: 'bodyweight', date, kg: Math.round(kg * 10) / 10 });
  toast(`Logged ${fmtNum(kg)} kg`);
}

// ================================================================ calisthenics

function viewCali() {
  const r = cali.rank();
  const ready = cali.readyTracks();
  const focus = new Set(cali.progress().focus || []);
  const today = cali.todaysSession();
  const started = Object.keys(cali.progress().levels || {}).length > 0;
  const group = (g) => cali.TRACKS.filter((t) => t.group === g).map((t) => trackCard(t, focus.has(t.id))).join('');
  return `
    <h1>Calisthenics</h1>
    <section class="card rank tier-${r.tier}">
      <div class="row between">
        <div><div class="muted small">Your level</div><div class="rank-name">${esc(r.name)}</div></div>
        <div class="right"><div class="rank-pts">${r.pts}</div><div class="muted small">points</div></div>
      </div>
      <div class="rank-bar"><span style="width:${Math.round(r.pct * 100)}%"></span></div>
      <div class="rank-ticks">${cali.TIERS.map((n, i) => `<span class="${i <= r.tier ? 'on' : ''}">${esc(n)}</span>`).join('')}</div>
      <div class="small muted">${r.next ? `${r.next - r.pts} points to ${esc(r.nextName)}. Earn points by levelling up any track.` : 'Top rank reached. Legendary.'}</div>
    </section>

    ${ready.map((t) => {
      const idx = cali.currentIndex(t.id);
      const next = t.steps[idx + 1];
      return `<div class="card levelup"><div>🎉 <strong>${esc(t.name)}</strong> — ready to move on from ${esc(t.steps[idx].name)}${next ? ` to <strong>${esc(next.name)}</strong>` : ''}.</div>
        <button class="btn primary small-btn" data-act="level-up" data-track="${t.id}">Level up</button></div>`;
    }).join('')}

    <section class="card today">
      <div class="row between"><h3>Today's session</h3><span class="muted small">${today.exercises.length} exercises · about 50 min</span></div>
      <p class="small muted">Skill work for your focus skills, then paired strength work (pull + squat, dip + hinge, row + push-up) and core — each at your current step.</p>
      <div class="mini-list">${today.exercises.map((e) => { const ex = store.getExercise(e.exerciseId); return `<span class="mini">${thumb(ex, 'thumb xs')}${esc(ex.name)}</span>`; }).join('')}</div>
      <div class="row gap two">
        <button class="btn primary" data-act="start-cali">Start session</button>
        <button class="btn" data-act="cali-plan">Save as plan</button>
      </div>
    </section>

    ${started ? '' : `<div class="card hint"><p><strong>Set your starting point</strong></p><p>Open each track and tap the step you're working on now. Steps before it count as done. After that, the app tells you when a workout meets the goal for your step.</p></div>`}

    <h2>Strength</h2>
    <div class="tracks">${group('Strength')}</div>
    <h2>Skills <span class="muted small normal">★ = in today's session</span></h2>
    <div class="tracks">${group('Skills')}</div>
    <p class="muted small pad">Built for a pull-up bar, a dip station and the floor. Two dumbbells work as parallettes for L-sits, planche work and deficit push-ups; a Smith machine bar at waist height works for rows.</p>
  `;
}

function trackCard(t, isFocus) {
  const idx = cali.currentIndex(t.id);
  const done = cali.isComplete(t.id);
  const step = cali.currentStep(t.id);
  const ex = store.getExercise(step.exerciseId);
  const dots = t.steps.map((_, i) => `<i class="${i < idx ? 'd' : i === idx ? 'c' : ''}"></i>`).join('');
  return `
    <a class="card track" href="#/track/${t.id}">
      <div class="track-top">${thumb(ex, 'thumb md')}<span class="tier-chip t${done ? 5 : step.tier}">${esc(done ? 'Complete' : cali.TIERS[step.tier - 1])}</span></div>
      <strong>${esc(t.name)}${isFocus ? ' <span class="star">★</span>' : ''}</strong>
      <div class="small">${esc(done ? 'All steps done' : step.name)}</div>
      <div class="small muted">${done ? '' : esc('Goal ' + cali.stdLabel(step.std))}</div>
      <div class="dots">${dots}</div>
    </a>`;
}

function viewTrack(id) {
  const t = cali.getTrack(id);
  if (!t) return '<a class="back" href="#/cali">‹ Calisthenics</a><p class="muted pad">Track not found.</p>';
  const idx = cali.currentIndex(id);
  const focus = (cali.progress().focus || []).includes(id);
  const rd = cali.readiness(id);
  return `
    <a class="back" href="#/cali">‹ Calisthenics</a>
    <h1 class="tight">${esc(t.name)}</h1>
    <p class="muted">${esc(t.blurb)}</p>
    ${t.group === 'Skills' ? `<button class="btn ${focus ? 'primary' : ''}" data-act="focus" data-track="${id}">${focus ? '★ In today\'s session' : '☆ Add to today\'s session'}</button>` : ''}
    ${rd && !cali.isComplete(id) ? `<div class="card ${rd.ready ? 'levelup' : ''}"><div class="small">${rd.ready ? '🎉 Your last workout met the goal.' : `Last time: ${rd.good} of ${rd.need} sets met the goal.`}</div>${rd.ready ? `<button class="btn primary small-btn" data-act="level-up" data-track="${id}">Level up</button>` : ''}</div>` : ''}
    <ol class="steps-list">
      ${t.steps.map((s, i) => {
        const ex = store.getExercise(s.exerciseId);
        const state = i < idx ? 'done' : i === idx ? 'current' : 'todo';
        return `<li class="step ${state}">
          <button class="step-btn" data-act="step-menu" data-track="${id}" data-i="${i}">
            <span class="step-state">${state === 'done' ? '✓' : state === 'current' ? '▶' : i + 1}</span>
            ${thumb(ex, 'thumb sm')}
            <span class="grow"><strong>${esc(s.name)}</strong><span class="small muted block">Goal ${esc(cali.stdLabel(s.std))}${ex.sided ? ' each side' : ''}</span>
            ${state === 'current' && s.tip ? `<span class="small block tip">${esc(s.tip)}</span>` : ''}</span>
            <span class="tier-chip t${s.tier}">${esc(cali.TIERS[s.tier - 1])}</span>
          </button>
        </li>`;
      }).join('')}
    </ol>
    <p class="muted small">Tap a step to set it as your current one, see how to do it, or view your progress.</p>
  `;
}

// ================================================================ settings

function viewSettings() {
  const st = store.state.settings;
  const g = st.gh;
  const sy = store.state.sync;
  return `
    <h1>Settings</h1>
    <section class="card">
      <h3>Rest timer</h3>
      <label class="field">Default rest
        <select data-setting="restSeconds">
          ${[45, 60, 90, 120, 150, 180, 240, 300].map((v) => `<option value="${v}" ${v === st.restSeconds ? 'selected' : ''}>${fmtClock(v)}</option>`).join('')}
        </select>
      </label>
      <p class="muted small">Starts automatically when you tick a set. iPhone only lets it beep while the app is open.</p>
    </section>

    <section class="card">
      <h3>Progressive overload</h3>
      <label class="check-field"><input type="checkbox" data-setting="suggest" ${st.suggest !== false ? 'checked' : ''}> Suggest next weights &amp; reps</label>
      <p class="muted small">Uses double progression: add reps until every set hits the top of your range, then add 2.5–5% weight (ACSM guideline: 2–10% once you beat your target reps). Holds the weight if you fall short, backs off ~10% after two stalled sessions, and eases you back in after a 3-week break. Suggestions appear as the grey numbers in each set — tick ✓ to accept them.</p>
    </section>

    <section class="card">
      <h3>GitHub sync</h3>
      <p class="muted small">Backs up every workout to a private GitHub repo. See the README for the 3-minute setup.</p>
      <form id="gh-form">
        <label class="field">GitHub username <input name="owner" value="${esc(g.owner)}" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="your-username"></label>
        <label class="field">Private data repo <input name="repo" value="${esc(g.repo)}" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="lift-data"></label>
        <label class="field">Folder <input name="folder" value="${esc(g.folder)}" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="data"></label>
        <label class="field">Access token <input name="token" type="password" value="${esc(g.token)}" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="github_pat_…"></label>
        <div class="row gap">
          <button class="btn primary" type="submit">Save &amp; sync</button>
          ${store.syncConfigured() ? '<button class="btn" type="button" data-act="sync-now">Sync now</button>' : ''}
        </div>
      </form>
      <p class="small sync-msg ${sy.status === 'error' ? 'err-text' : 'muted'}">
        ${sy.status === 'syncing' ? 'Syncing…' : sy.status === 'error' ? esc(sy.error) : sy.lastAt ? `Last synced ${esc(ago(sy.lastAt))}${sy.message ? ` · ${esc(sy.message)}` : ''}` : ''}
        ${store.dirtyCount() ? ` · ${store.dirtyCount()} change(s) waiting` : ''}
      </p>
    </section>

    <section class="card">
      <h3>Backup</h3>
      <div class="row gap">
        <button class="btn" data-act="export">Export JSON</button>
        <label class="btn">Import JSON<input type="file" accept="application/json,.json" id="import-file" hidden></label>
      </div>
    </section>

    <p class="muted small center">Lift Tracker · data stays on this phone and in your own GitHub repo.<br>Exercise photos: free-exercise-db (public domain).</p>
  `;
}

async function saveGhForm(form) {
  const f = new FormData(form);
  await store.saveSettings({ gh: {
    owner: String(f.get('owner')).trim(),
    repo: String(f.get('repo')).trim(),
    folder: String(f.get('folder')).trim() || 'data',
    token: String(f.get('token')).trim(),
  } });
  document.activeElement?.blur();
  await sync();
}

function exportData() {
  const docs = [...store.state.records.values()].map((r) => r.doc);
  const blob = new Blob([JSON.stringify({ app: 'lift-tracker', exportedAt: new Date().toISOString(), docs }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `lift-tracker-backup-${localDate()}.json`;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

async function importData(file) {
  try {
    const data = JSON.parse(await file.text());
    const docs = Array.isArray(data) ? data : data.docs;
    if (!Array.isArray(docs)) throw new Error('Not a Lift Tracker backup file.');
    let n = 0;
    for (const doc of docs) {
      if (!doc?.id || !doc.type) continue;
      const cur = store.state.records.get(doc.id);
      if (!cur || (doc.updatedAt || '') > (cur.doc.updatedAt || '')) { await store.saveDoc(doc, { render: false }); n++; }
    }
    store.emit();
    alert(`Imported ${n} item(s).`);
  } catch (e) {
    alert('Import failed: ' + e.message);
  }
}

// ================================================================ exercise picker

// mode: {type:'add'} | {type:'replace', index} | {type:'plan-add', planId} | {type:'plan-replace', planId, index}
let pick = { mode: null, query: '', cat: 'All' };

function suggestFor(mode) {
  if (mode.type.startsWith('plan')) {
    const p = store.getDoc(mode.planId);
    if (p?.dayId && gen.DAY_PATTERNS[p.dayId]) return { label: `Suggested for ${p.name}`, list: gen.suggestions(p.dayId, p.style || 'mixed') };
  }
  return null;
}

function openPicker(mode) {
  pick = { mode, query: '', cat: 'All' };
  renderPicker();
}

function renderPicker() {
  openModal(`
    <div class="picker-head">
      <input id="pick-q" type="search" placeholder="Search ${store.exercises().length} exercises" autocomplete="off" autocorrect="off" enterkeyhint="search" value="${esc(pick.query)}">
      <button class="link-btn" data-act="close-modal">Cancel</button>
    </div>
    <div class="cat-chips">${['All', ...CATEGORIES.filter((c) => c !== 'Other')].map((c) => `<button class="chip-btn ${pick.cat === c ? 'on' : ''}" data-act="pick-cat" data-cat="${c}">${esc(c)}</button>`).join('')}</div>
    <div class="picker-list" id="pick-list">${pickerList()}</div>`, { cls: 'picker' });
  if (!pick.query) setTimeout(() => { if (!('ontouchstart' in window)) document.getElementById('pick-q')?.focus(); }, 50);
}

function recentExerciseIds() {
  const seen = [];
  for (const s of store.finishedSessions()) for (const e of s.exercises) if (!seen.includes(e.exerciseId)) seen.push(e.exerciseId);
  return seen.slice(0, 10);
}

function pickRow(ex) {
  const sub = [ex.category, ex.level ? cali.TIERS[ex.level - 1] : '', ex.sided ? 'one side' : ''].filter(Boolean).join(' · ');
  return `
    <div class="pick-row">
      <button class="pick-main" data-act="pick" data-id="${esc(ex.id)}">${thumb(ex, 'thumb sm')}<span class="grow"><span class="pick-name">${esc(ex.name)}</span><span class="small muted block">${esc(sub)}</span></span></button>
      <button class="icon info-btn" data-act="pick-info" data-id="${esc(ex.id)}" aria-label="How to do ${esc(ex.name)}">ⓘ</button>
    </div>`;
}

function pickerList() {
  let all = store.exercises();
  if (pick.cat !== 'All') all = all.filter((e) => (e.category || 'Other') === pick.cat);
  const q = pick.query.trim();
  if (!q) {
    let html = '';
    const sug = pick.cat === 'All' && suggestFor(pick.mode);
    if (sug) html += `<div class="pick-group">${esc(sug.label)}</div>${sug.list.slice(0, 40).map(pickRow).join('')}`;
    const recent = pick.cat === 'All' ? recentExerciseIds().map((id) => all.find((e) => e.id === id)).filter(Boolean) : [];
    if (recent.length && !sug) html += `<div class="pick-group">Recent</div>${recent.map(pickRow).join('')}`;
    if (!sug || pick.cat !== 'All') {
      for (const c of CATEGORIES) {
        const items = all.filter((e) => (e.category || 'Other') === c);
        if (items.length) html += `<div class="pick-group">${esc(c)}</div>${items.map(pickRow).join('')}`;
      }
    } else html += '<div class="pick-group">Search above or pick a category for everything else</div>';
    return html;
  }
  const results = searchExercises(all, q);
  const exact = results.some((e) => e.name.toLowerCase() === q.toLowerCase());
  return results.map(pickRow).join('') + (exact ? '' : `<button class="pick-row create" data-act="create-ex">+ Create “${esc(q)}”</button>`);
}

function openCreateForm() {
  const name = pick.query.trim();
  const sheet = modal.querySelector('.sheet');
  sheet.innerHTML = `
    <div class="sheet-title">New exercise</div>
    <form id="create-form" class="pad">
      <label class="field">Name <input name="name" value="${esc(name)}" required></label>
      <label class="field">Type
        <select name="kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
      </label>
      <label class="field">Muscle group
        <select name="category">${CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join('')}</select>
      </label>
      <label class="check-field"><input type="checkbox" name="sided"> One side at a time (log left and right)</label>
      <div class="row gap"><button class="btn primary" type="submit">Create</button><button class="btn" type="button" data-act="close-modal">Cancel</button></div>
    </form>`;
}

async function pickExercise(id) {
  closeModal();
  const m = pick.mode || { type: 'add' };
  if (m.type.startsWith('plan')) {
    const p = store.getDoc(m.planId);
    if (!p) return;
    const ex = store.getExercise(id);
    const item = { exerciseId: id, sets: 3, target: ex.kind === 'time' ? '30s' : ex.level >= 3 ? '5–8' : '8–12', sides: defaultSides(id) || undefined };
    if (m.type === 'plan-replace') p.exercises[m.index] = { ...p.exercises[m.index], ...item, track: undefined };
    else p.exercises.push(item);
    await store.saveDoc(p);
    if (m.type === 'plan-add') toast(`Added ${ex.name}`);
    return;
  }
  const s = editingSession();
  if (!s) return;
  if (m.type === 'replace') {
    s.exercises[m.index].exerciseId = id;
    s.exercises[m.index].sides = defaultSides(id);
    s.exercises[m.index].track = undefined;
  } else {
    const prev = stats.historyFor(id, { excludeId: s.id });
    const n = prev.length ? Math.min(prev[prev.length - 1].sets.length, 6) : 3;
    s.exercises.push(sessionExercise(id, n));
  }
  await store.saveDoc(s);
  if (m.type !== 'replace') setTimeout(() => main.querySelectorAll('.ex-card').item(s.exercises.length - 1)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
}

// ================================================================ rest timer

let rest = null; // { endAt, total, finishedAt }
let audioCtx = null;

function startRest(seconds = store.state.settings.restSeconds) {
  rest = { endAt: Date.now() + seconds * 1000, total: seconds, finishedAt: null };
  renderRest();
}
function stopRest() { rest = null; renderRest(); }

function renderRest() {
  if (!rest) { restBar.hidden = true; document.body.classList.remove('resting'); return; }
  restBar.hidden = false;
  document.body.classList.add('resting');
  const left = Math.max(0, (rest.endAt - Date.now()) / 1000);
  const pct = rest.total ? (left / rest.total) * 100 : 0;
  restBar.classList.toggle('over', !!rest.finishedAt);
  restBar.innerHTML = `
    <div class="rest-fill" style="width:${pct}%"></div>
    <button data-act="rest-adj" data-d="-15">−15</button>
    <div class="rest-time">${rest.finishedAt ? 'Rest over' : `Rest ${fmtClock(left)}`}</div>
    <button data-act="rest-adj" data-d="15">+15</button>
    <button data-act="rest-skip">${rest.finishedAt ? 'Close' : 'Skip'}</button>`;
}

function beep() {
  try {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    for (let k = 0; k < 3; k++) {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t0 + k * 0.3);
      g.gain.exponentialRampToValueAtTime(0.4, t0 + k * 0.3 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + k * 0.3 + 0.2);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0 + k * 0.3);
      o.stop(t0 + k * 0.3 + 0.22);
    }
  } catch {}
  navigator.vibrate?.([200, 100, 200]);
}

// iOS only allows audio after a user gesture, so unlock on the first tap.
document.addEventListener('touchend', unlockAudio, { once: true });
document.addEventListener('click', unlockAudio, { once: true });
function unlockAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx && !audioCtx) {
      audioCtx = new Ctx();
      const b = audioCtx.createBuffer(1, 1, 22050);
      const src = audioCtx.createBufferSource();
      src.buffer = b; src.connect(audioCtx.destination); src.start(0);
    }
  } catch {}
}

function tick() {
  const el = document.getElementById('elapsed');
  const s = store.activeSession();
  if (el && s) {
    const sec = Math.floor((Date.now() - new Date(s.startedAt)) / 1000);
    const h = Math.floor(sec / 3600);
    el.textContent = h ? `${h}:${fmtClock(sec % 3600).padStart(5, '0')}` : fmtClock(sec);
  }
  if (rest) {
    if (!rest.finishedAt && Date.now() >= rest.endAt) { rest.finishedAt = Date.now(); beep(); }
    if (rest.finishedAt && Date.now() - rest.finishedAt > 8000) stopRest();
    else renderRest();
  }
}
setInterval(tick, 500);

// ================================================================ actions

const ACTIONS = {
  'start-day': (el) => startDay(el.dataset.day),
  'start-empty': () => newSession('Workout', {}, []),
  'start-cali': () => startCali(),
  'start-plan': (el) => startPlan(el.dataset.id),
  'pick-day': (el) => { selectedDay = el.dataset.day; renderMain(); },
  wizard: (el) => openWizard(el.dataset.mode, el.dataset.date),
  'wiz-set': (el) => { wiz[el.dataset.field] = el.dataset.val; const d = document.getElementById('wiz-date')?.value; if (d !== undefined) wiz.date = d || null; renderWizard(); },
  'wiz-nodate': () => { wiz.date = null; renderWizard(); },
  'wiz-create': () => createFromWizard(),

  rename: async () => {
    const s = editingSession();
    const name = prompt('Workout name', s.name);
    if (name && name.trim()) { s.name = name.trim(); await store.saveDoc(s); }
  },
  finish: async () => { if (confirm('Finish this workout?')) await finishWorkout(); },
  'edit-done': async () => {
    const s = editingSession();
    cleanSets(s);
    await store.saveDoc(s, { render: false });
    go(`#/session/${encodeURIComponent(s.id)}`);
  },
  discard: async () => {
    if (confirm('Discard this workout? Nothing will be saved.')) { stopRest(); await store.deleteDoc(store.activeSession()); }
  },
  'toggle-set': (el) => toggleSet(+el.dataset.ex, +el.dataset.set),
  'add-set': (el) => {
    const s = editingSession();
    const sets = s.exercises[+el.dataset.ex].sets;
    const last = sets[sets.length - 1];
    sets.push(last ? { kg: last.kg, reps: last.reps, sec: last.sec, kgR: last.kgR, repsR: last.repsR, secR: last.secR, done: false } : blankSet());
    return store.saveDoc(s);
  },
  'set-menu': (el) => {
    const s = editingSession();
    const i = +el.dataset.ex, j = +el.dataset.set;
    actionSheet(`Set ${j + 1}`, [{ label: 'Delete set', danger: true, run: async () => { s.exercises[i].sets.splice(j, 1); await store.saveDoc(s); } }]);
  },
  'ex-menu': (el) => {
    const s = editingSession();
    const i = +el.dataset.ex;
    const e = s.exercises[i];
    const move = (d) => async () => { const [x] = s.exercises.splice(i, 1); s.exercises.splice(i + d, 0, x); await store.saveDoc(s); };
    const acts = [{ label: 'How to do it', run: () => openInfo(e.exerciseId) }];
    acts.push({ label: e.sides ? 'Log both sides together' : 'Log left & right separately', run: async () => { e.sides = !e.sides; await store.saveDoc(s); } });
    if (i > 0) acts.push({ label: 'Move up', run: move(-1) });
    if (i < s.exercises.length - 1) acts.push({ label: 'Move down', run: move(1) });
    acts.push({ label: 'Swap exercise', run: () => openPicker({ type: 'replace', index: i }) });
    acts.push({ label: 'View progress', run: () => go(`#/exercise/${encodeURIComponent(e.exerciseId)}`) });
    acts.push({ label: 'Remove exercise', danger: true, run: async () => { s.exercises.splice(i, 1); await store.saveDoc(s); } });
    actionSheet(store.exerciseName(e.exerciseId), acts);
  },
  'sheet-action': (el) => runSheetAction(+el.dataset.k),
  'add-ex': () => openPicker({ type: 'add' }),
  'close-modal': () => closeModal(),
  pick: (el) => pickExercise(el.dataset.id),
  'pick-cat': (el) => { pick.cat = el.dataset.cat; document.querySelectorAll('.chip-btn').forEach((b) => b.classList.toggle('on', b.dataset.cat === pick.cat)); document.getElementById('pick-list').innerHTML = pickerList(); document.getElementById('pick-list').scrollTop = 0; },
  'pick-info': async (el) => { modal.querySelector('.sheet').innerHTML = await infoHTML(el.dataset.id, { back: true, addable: true }); modal.querySelector('.sheet').scrollTop = 0; },
  'picker-back': () => renderPicker(),
  info: (el) => openInfo(el.dataset.id),
  'create-ex': () => openCreateForm(),
  'delete-session': async (el) => {
    if (!confirm('Delete this workout permanently?')) return;
    await store.deleteDoc(store.getDoc(el.dataset.id));
    go('#/history');
  },
  'session-to-plan': async (el) => {
    const s = store.getDoc(el.dataset.id);
    const plan = { id: 'pl-' + uid(), type: 'plan', name: s.name, dayId: null, style: null, date: null, createdAt: new Date().toISOString(),
      exercises: s.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets.length, target: e.target || '', sides: e.sides || undefined, track: e.track })) };
    await store.saveDoc(plan, { render: false });
    go(`#/plan/${encodeURIComponent(plan.id)}`);
    toast('Plan created — give it a date if you like');
  },
  metric: (el) => { metricChoice[el.dataset.ex] = el.dataset.metric; renderMain(); },

  // plans
  'plan-add': () => openPicker({ type: 'plan-add', planId: route().id }),
  'plan-nodate': async () => { const p = editingPlan(); p.date = null; await store.saveDoc(p); },
  'plan-sets': async (el) => { const p = editingPlan(); const e = p.exercises[+el.dataset.i]; e.sets = Math.max(1, Math.min(10, (e.sets || 3) + +el.dataset.d)); await store.saveDoc(p); },
  'plan-shuffle': async (el) => {
    const p = editingPlan();
    const i = +el.dataset.i;
    const cur = p.exercises[i];
    const ex = store.getExercise(cur.exerciseId);
    const exclude = new Set(p.exercises.map((e) => e.exerciseId));
    const style = p.style === 'mixed' ? (isCalisthenics(ex) ? 'calisthenics' : 'conventional') : p.style || 'mixed';
    const list = gen.candidates(cur.pattern || ex.pattern, style, { exclude });
    if (!list.length) return toast('No other options for this slot');
    const next = list[Math.floor(Math.random() * list.length)];
    p.exercises[i] = { ...cur, exerciseId: next.id, track: undefined, sides: next.sided || undefined, pattern: cur.pattern || ex.pattern };
    await store.saveDoc(p);
  },
  'plan-menu': (el) => {
    const p = editingPlan();
    const i = +el.dataset.i;
    const e = p.exercises[i];
    const move = (d) => async () => { const [x] = p.exercises.splice(i, 1); p.exercises.splice(i + d, 0, x); await store.saveDoc(p); };
    const acts = [{ label: 'How to do it', run: () => openInfo(e.exerciseId) }];
    acts.push({ label: e.sides ? 'Log both sides together' : 'Log left & right separately', run: async () => { e.sides = !e.sides || undefined; await store.saveDoc(p); } });
    if (i > 0) acts.push({ label: 'Move up', run: move(-1) });
    if (i < p.exercises.length - 1) acts.push({ label: 'Move down', run: move(1) });
    acts.push({ label: 'Swap exercise', run: () => openPicker({ type: 'plan-replace', planId: p.id, index: i }) });
    acts.push({ label: 'Remove', danger: true, run: async () => { p.exercises.splice(i, 1); await store.saveDoc(p); } });
    actionSheet(store.exerciseName(e.exerciseId), acts);
  },
  'plan-regen': async () => {
    const p = editingPlan();
    p.exercises = gen.generate({ dayType: p.dayId, style: p.style, length: p.exercises.length <= 4 ? 'short' : p.exercises.length >= 8 ? 'long' : 'normal' });
    await store.saveDoc(p);
  },
  'plan-save': () => { const p = editingPlan(); toast(p.date ? `Saved for ${dayLabel(p.date)}` : 'Saved to your plans'); if (p.date) selectedDay = p.date; go('#/workout'); },
  'plan-delete': async () => {
    if (!confirm('Delete this plan?')) return;
    await store.deleteDoc(editingPlan());
    go('#/workout');
  },

  // calisthenics
  'level-up': async (el) => {
    const t = cali.getTrack(el.dataset.track);
    const before = cali.rank().tier;
    await cali.setLevel(t.id, cali.currentIndex(t.id) + 1);
    const r = cali.rank();
    toast(r.tier > before ? `New rank: ${r.name}! 🎉` : `${t.name}: levelled up (+${t.steps[cali.currentIndex(t.id) - 1]?.tier || 1} pts)`);
  },
  focus: (el) => cali.toggleFocus(el.dataset.track),
  'cali-plan': async () => {
    const s = cali.todaysSession();
    const plan = { id: 'pl-' + uid(), type: 'plan', name: s.name, dayId: 'full', style: 'calisthenics', date: localDate(), createdAt: new Date().toISOString(), exercises: s.exercises };
    await store.saveDoc(plan, { render: false });
    go(`#/plan/${encodeURIComponent(plan.id)}`);
  },
  'step-menu': (el) => {
    const t = cali.getTrack(el.dataset.track);
    const i = +el.dataset.i;
    const s = t.steps[i];
    actionSheet(s.name, [
      { label: 'This is my current step', run: () => cali.setLevel(t.id, i) },
      { label: 'I can already do this (mark done)', run: () => cali.setLevel(t.id, i + 1) },
      { label: 'How to do it', run: () => openInfo(s.exerciseId) },
      { label: 'View progress', run: () => go(`#/exercise/${encodeURIComponent(s.exerciseId)}`) },
    ]);
  },

  // rest timer
  'rest-adj': (el) => {
    if (!rest) return;
    const d = +el.dataset.d;
    if (rest.finishedAt) { if (d > 0) startRest(d); return; }
    rest.endAt += d * 1000;
    rest.total = Math.max(1, rest.total + d);
    renderRest();
  },
  'rest-skip': () => stopRest(),
  'bw-add': () => openBwForm(),
  'bw-range': (el) => { bwRange = el.dataset.range; renderMain(); },
  'bw-entry': (el) => {
    const d = store.getDoc(el.dataset.id);
    actionSheet(`${fmtNum(d.kg)} kg · ${fmtDate(d.date + 'T12:00:00')}`, [
      { label: 'Edit', run: () => openBwForm(d) },
      { label: 'Delete', danger: true, run: () => store.deleteDoc(d) },
    ]);
  },
  sugg: (el) => {
    const s = editingSession();
    const i = +el.dataset.ex;
    const e = s.exercises[i];
    const sg = suggest(e.exerciseId, e, s);
    openModal(`
      <div class="info-head"><span></span><button class="link-btn" data-act="close-modal">Close</button></div>
      <h2 class="info-title">💡 ${esc(store.exerciseName(e.exerciseId))}</h2>
      <p class="sugg-big">${esc(sg.title)}</p>
      <p>${esc(sg.reason)}</p>
      ${sg.sets ? `<button class="btn wide primary" data-act="sugg-fill" data-ex="${i}">Fill in these numbers</button>` : ''}
      <p class="muted small">Suggestions follow double progression and the ACSM 2–10% load guideline. Listen to your body: if a set feels unsafe, stop.</p>`);
  },
  'sugg-fill': async (el) => {
    const s = editingSession();
    const e = s.exercises[+el.dataset.ex];
    const sg = suggest(e.exerciseId, e, s);
    closeModal();
    if (!sg.sets) return;
    e.sets.forEach((st, j) => {
      if (st.done) return;
      const v = sg.sets[j] || sg.sets[sg.sets.length - 1];
      for (const [k, val] of Object.entries(v)) if (st[k] == null) st[k] = val;
    });
    await store.saveDoc(s);
  },
  'sync-now': () => sync(),
  export: () => exportData(),
};

document.addEventListener('click', (evt) => {
  const el = evt.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) { evt.preventDefault(); fn(el, evt); }
});

document.addEventListener('input', async (evt) => {
  const el = evt.target;
  if (el.id === 'pick-q') { pick.query = el.value; document.getElementById('pick-list').innerHTML = pickerList(); return; }
  if (el.id === 'progress-q') { progressQuery = el.value; document.getElementById('progress-list').innerHTML = progressList(); return; }
  if (el.dataset.planField === 'name' || el.dataset.planTarget != null) {
    const p = editingPlan();
    if (!p) return;
    if (el.dataset.planField === 'name') p.name = el.value;
    else p.exercises[+el.dataset.planTarget].target = el.value.trim();
    await store.saveDoc(p, { render: false });
    return;
  }
  const field = el.dataset.field;
  if (!field) return;
  const s = editingSession();
  if (!s) return;
  if (field === 'notes') s.notes = el.value;
  else {
    const st = s.exercises[+el.dataset.ex].sets[+el.dataset.set];
    st[field] = field.startsWith('sec') ? parseTime(el.value) : parseNum(el.value);
  }
  await store.saveDoc(s, { render: false });
  renderHeader();
});

// Move to the next input when "next" is pressed on the keyboard.
document.addEventListener('keydown', (evt) => {
  if (evt.key !== 'Enter' || !evt.target.dataset?.field || evt.target.tagName === 'TEXTAREA') return;
  evt.preventDefault();
  const inputs = [...main.querySelectorAll('input[data-field]')];
  const next = inputs[inputs.indexOf(evt.target) + 1];
  next ? next.focus() : evt.target.blur();
});

document.addEventListener('change', async (evt) => {
  const el = evt.target;
  if (el.dataset.setting === 'restSeconds') await store.saveSettings({ restSeconds: +el.value });
  if (el.dataset.setting === 'suggest') await store.saveSettings({ suggest: el.checked });
  if (el.id === 'import-file' && el.files[0]) await importData(el.files[0]);
  if (el.dataset.planField === 'date') { const p = editingPlan(); p.date = el.value || null; await store.saveDoc(p); }
  if (el.id === 'wiz-date') wiz.date = el.value || null;
});

document.addEventListener('submit', async (evt) => {
  evt.preventDefault();
  const form = evt.target;
  if (form.id === 'gh-form') return saveGhForm(form);
  if (form.id === 'bw-form') return saveBw(form);
  if (form.id === 'create-form') {
    const f = new FormData(form);
    const name = String(f.get('name')).trim();
    if (!name) return;
    const doc = { id: 'x-' + uid(), type: 'exercise', name, kind: f.get('kind'), category: f.get('category'), sided: !!f.get('sided'), uni: !!f.get('sided') };
    await store.saveDoc(doc, { render: false });
    await pickExercise(doc.id);
  }
});

// ================================================================ boot

// Reserve exactly as much room at the bottom as the tab bar and rest timer really take
// (their height varies with the iPhone model, safe area and text-size setting).
function trackBarHeights() {
  const set = () => {
    const root = document.documentElement.style;
    root.setProperty('--tabbar-h', `${Math.ceil(tabs.getBoundingClientRect().height)}px`);
    if (!restBar.hidden) root.setProperty('--rest-h', `${Math.ceil(restBar.getBoundingClientRect().height)}px`);
  };
  set();
  if ('ResizeObserver' in window) { const ro = new ResizeObserver(set); ro.observe(tabs); ro.observe(restBar); }
  window.addEventListener('resize', set);
  window.addEventListener('orientationchange', () => setTimeout(set, 300));
}

async function boot() {
  trackBarHeights();
  await store.init();
  store.onChange(render);
  store.setSyncHandler(sync);
  window.addEventListener('hashchange', () => {
    closeModal();
    if (typing()) document.activeElement.blur(); // leaving the screen: always show the new one
    mainDirty = false;
    renderHeader();
    renderMain();
    window.scrollTo(0, 0);
  });
  render();
  sync();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { sync(); render(); }
    else if (store.dirtyCount()) sync();
  });
  window.addEventListener('online', () => sync());

  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW registration failed', e));
  }
}

boot();
