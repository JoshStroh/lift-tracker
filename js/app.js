import * as store from './store.js';
import { sync } from './sync.js';
import { DAY_TEMPLATES, CATEGORIES, KINDS, searchExercises } from './exercises.js';
import * as stats from './stats.js';
import { lineChart } from './chart.js';
import { esc, uid, localDate, fmtNum, fmtDate, fmtTime, fmtDuration, fmtClock } from './util.js';

const main = document.getElementById('main');
const header = document.getElementById('header');
const modal = document.getElementById('modal');
const restBar = document.getElementById('rest');
const tabs = document.getElementById('tabs');

// ---------------------------------------------------------------- routing

function route() {
  const parts = (location.hash.replace(/^#\/?/, '') || 'workout').split('/');
  return { name: parts[0], id: parts[1] ? decodeURIComponent(parts[1]) : null, sub: parts[2] || null };
}
const go = (hash) => { location.hash = hash; };

let mainDirty = false;
function render() {
  renderHeader();
  const active = document.activeElement;
  if (active && main.contains(active) && active.matches('input, textarea')) {
    mainDirty = true; // don't yank the keyboard away; re-render on blur
    return;
  }
  mainDirty = false;
  renderMain();
}

function renderMain() {
  const r = route();
  for (const a of tabs.querySelectorAll('a')) a.classList.toggle('on', a.dataset.tab === tabFor(r.name));
  const scroll = window.scrollY;
  const sameView = main.dataset.view === location.hash;
  main.dataset.view = location.hash;
  switch (r.name) {
    case 'history': main.innerHTML = viewHistory(); break;
    case 'session': r.sub === 'edit' ? (main.innerHTML = viewEditor(store.getDoc(r.id), true)) : (main.innerHTML = viewSession(r.id)); break;
    case 'progress': main.innerHTML = viewProgress(); break;
    case 'exercise': main.innerHTML = viewExercise(r.id); drawExerciseChart(r.id); break;
    case 'settings': main.innerHTML = viewSettings(); break;
    default: {
      const s = store.activeSession();
      main.innerHTML = s ? viewEditor(s, false) : viewStart();
    }
  }
  if (sameView) window.scrollTo(0, scroll);
  tick();
}

const tabFor = (name) => ({ session: 'history', exercise: 'progress' }[name] || name);

document.addEventListener('focusout', () => setTimeout(() => {
  if (mainDirty && !(document.activeElement && main.contains(document.activeElement) && document.activeElement.matches('input, textarea'))) renderMain();
}, 0));

// ---------------------------------------------------------------- header

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
  header.innerHTML = `
    <span class="brand">Lift Tracker</span>
    <a class="sync ${cls}" href="#/settings"><i></i>${esc(text)}</a>`;
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

// ---------------------------------------------------------------- start screen

function viewStart() {
  const finished = store.finishedSessions();
  const lastByDay = {};
  for (const s of finished) if (s.dayId && !lastByDay[s.dayId]) lastByDay[s.dayId] = s;
  // Suggest the push/pull/legs day done least recently.
  const ppl = DAY_TEMPLATES.filter((d) => d.id !== 'rt-abs');
  const next = ppl.slice().sort((a, b) => (lastByDay[a.id]?.startedAt || '').localeCompare(lastByDay[b.id]?.startedAt || ''))[0];

  const recent = finished.slice(0, 3);
  return `
    <h1>Start a workout</h1>
    <div class="days">
      ${DAY_TEMPLATES.map((d) => `
        <button class="day ${d.id}" data-act="start-day" data-day="${d.id}">
          <span class="day-name">${esc(d.name)}</span>
          <span class="day-sub">${lastByDay[d.id] ? esc(daysAgo(lastByDay[d.id].startedAt)) : 'Not done yet'}</span>
          ${d.id === next.id ? '<span class="badge">Up next</span>' : ''}
        </button>`).join('')}
    </div>
    <button class="btn wide ghost" data-act="start-empty">Empty workout</button>
    ${recent.length ? `<h2>Recent</h2>${recent.map(sessionCard).join('')}` : `
      <div class="card hint">
        <p><strong>How it works</strong></p>
        <p>Pick a day. The first time, you get a starter list of exercises; after that, each day starts with the exercises you did last time, with last time's numbers shown next to every set.</p>
        <p>Set up GitHub sync in <a href="#/settings">Settings</a> so your history is backed up.</p>
      </div>`}
  `;
}

function blankSet() { return { kg: null, reps: null, sec: null, done: false }; }

async function startDay(dayId) {
  const t = DAY_TEMPLATES.find((d) => d.id === dayId);
  const last = store.finishedSessions().find((s) => s.dayId === dayId);
  const exercises = last
    ? last.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets.map(blankSet) }))
    : t.exercises.map((id) => ({ exerciseId: id, sets: [blankSet(), blankSet(), blankSet()] }));
  await newSession(t.name, dayId, exercises);
}

async function newSession(name, dayId, exercises) {
  const now = new Date().toISOString();
  await store.saveDoc({ id: `${localDate()}-${uid()}`, type: 'session', name, dayId, startedAt: now, endedAt: null, notes: '', exercises });
  go('#/workout');
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- workout editor

function viewEditor(s, editing) {
  if (!s) return `<p class="muted pad">Workout not found.</p>`;
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

  const cols = kind === 'weight' ? ['kg', 'Reps'] : kind === 'reps' ? ['Reps'] : ['Time'];
  const rows = e.sets.map((st, j) => {
    const p = prev[j] || prev[prev.length - 1];
    const isPR = st.done && bestScore != null && stats.isValidSet(kind, st) && stats.score(kind, st) > bestScore + 1e-9;
    const input = (field, val, ph, mode) =>
      `<input data-field="${field}" data-ex="${i}" data-set="${j}" inputmode="${mode}" value="${val ?? ''}" placeholder="${ph ?? ''}" autocomplete="off" enterkeyhint="done">`;
    const cells = kind === 'weight'
      ? input('kg', st.kg, p?.kg, 'decimal') + '</td><td>' + input('reps', st.reps, p?.reps, 'numeric')
      : kind === 'reps'
        ? input('reps', st.reps, p?.reps, 'numeric')
        : input('sec', st.sec != null ? stats.fmtSec(st.sec) : '', p ? stats.fmtSec(p.sec) : '', 'text');
    return `
      <tr class="${st.done ? 'done' : ''}">
        <td><button class="setno" data-act="set-menu" data-ex="${i}" data-set="${j}">${j + 1}</button></td>
        <td class="prev">${esc(stats.shortLabel(kind, prev[j]) || '—')}</td>
        <td>${cells}</td>
        <td><button class="check" data-act="toggle-set" data-ex="${i}" data-set="${j}" aria-label="Done">${isPR ? '🏆' : '✓'}</button></td>
      </tr>`;
  }).join('');

  return `
    <section class="card ex-card">
      <div class="ex-head">
        <button class="ex-name" data-act="ex-menu" data-ex="${i}">${esc(ex.name)}</button>
        <button class="icon" data-act="ex-menu" data-ex="${i}" aria-label="Exercise options">⋯</button>
      </div>
      <div class="ex-stats small">
        ${prev.length ? `<div><span class="muted">Last</span> ${esc(prev.map((x) => stats.shortLabel(kind, x)).join(' · '))}</div>` : '<div class="muted">First time — no history yet</div>'}
        ${best ? `<div><span class="muted">Best</span> ${esc(stats.bestLabel(kind, best))}</div>` : ''}
      </div>
      <table class="sets ${kind}">
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
        st[f] = f === 'sec' ? parseTime(inp.placeholder) : parseNum(inp.placeholder);
      }
    }
    if (!stats.isValidSet(kind, st)) {
      const target = [...row].find((x) => x.dataset.field !== 'kg' && !x.value) || row[0];
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

async function finishWorkout() {
  const s = store.activeSession();
  for (const e of s.exercises) {
    const kind = store.getExercise(e.exerciseId).kind || 'weight';
    e.sets = e.sets.filter((st) => stats.isValidSet(kind, st));
    e.sets.forEach((st) => { st.done = true; });
  }
  s.exercises = s.exercises.filter((e) => e.sets.length);
  if (!s.exercises.length) {
    if (confirm('No sets were logged. Discard this workout?')) await store.deleteDoc(s);
    return;
  }
  s.endedAt = new Date().toISOString();
  stopRest();
  await store.saveDoc(s);
  store.scheduleSync(500);
  go(`#/session/${encodeURIComponent(s.id)}`);
}

// ---------------------------------------------------------------- history

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
    ${prs.size ? `<div class="card pr-banner">🏆 ${prs.size} personal record${prs.size > 1 ? 's' : ''} this workout</div>` : ''}
    ${s.exercises.map((e) => {
      const kind = store.getExercise(e.exerciseId).kind || 'weight';
      return `
      <section class="card">
        <a class="ex-name link" href="#/exercise/${encodeURIComponent(e.exerciseId)}">${esc(store.exerciseName(e.exerciseId))} ›</a>
        <ol class="set-list">${e.sets.map((st) => `<li>${esc(stats.setLabel(kind, st))}${prs.has(st) ? ' <span class="pr">🏆 PR</span>' : ''}</li>`).join('')}</ol>
      </section>`;
    }).join('')}
    ${s.notes ? `<div class="card"><div class="muted small">Notes</div><p class="pre">${esc(s.notes)}</p></div>` : ''}
    <button class="btn wide danger-text" data-act="delete-session" data-id="${esc(s.id)}">Delete workout</button>
  `;
}

// ---------------------------------------------------------------- progress

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
      <div><strong>${esc(i.ex.name)}</strong><div class="muted small">Last: ${esc(daysAgo(i.last))}</div></div>
      <div class="right small">${i.best ? esc(stats.setLabel(i.kind, i.best)) : ''}${i.kind === 'weight' && i.best ? `<div class="muted">1RM ≈ ${fmtNum(stats.score('weight', i.best))}kg</div>` : ''}</div>
    </a>`).join('') || '<p class="muted pad">No matches.</p>';
}

let metricChoice = {};

function viewExercise(id) {
  const ex = store.getExercise(id);
  const kind = ex.kind || 'weight';
  const hist = stats.historyFor(id);
  const metrics = stats.METRICS[kind];
  const metric = metrics.find((m) => m.key === metricChoice[id]) || metrics[0];
  const best = stats.bestSet(kind, hist.flatMap((h) => h.sets));
  const bestSession = best && hist.find((h) => h.sets.includes(best))?.session;

  let hero = '';
  if (best) {
    const num = kind === 'weight' ? fmtNum(stats.score(kind, best)) : kind === 'reps' ? best.reps : stats.fmtSec(best.sec);
    const unit = kind === 'weight' ? 'kg' : kind === 'reps' ? 'reps' : '';
    hero = `
      <div class="hero card">
        <div class="muted small">${kind === 'weight' ? 'Estimated 1-rep max' : 'Best set'}</div>
        <div class="hero-num">${esc(num)}<span>${unit}</span></div>
        <div class="muted small">${kind === 'weight' ? `from ${esc(stats.setLabel(kind, best))} · ` : ''}${bestSession ? esc(fmtDate(bestSession.startedAt, { day: 'numeric', month: 'short', year: 'numeric' })) : ''}</div>
      </div>`;
  }

  const repMax = kind === 'weight' ? stats.repMaxes(hist) : [];
  return `
    <a class="back" href="#/progress">‹ Progress</a>
    <h1 class="tight">${esc(ex.name)}</h1>
    <p class="muted small">${esc(ex.category || '')} · ${esc(KINDS[kind])}</p>
    ${hist.length ? `
      ${hero}
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
          <tbody>${repMax.map((r) => `<tr><td>${r.reps}+</td><td>${r.best ? `${fmtNum(r.best.set.kg)}kg × ${r.best.set.reps}` : '<span class="muted">—</span>'}</td><td class="muted">${r.best ? esc(fmtDate(r.best.session.startedAt, { day: 'numeric', month: 'short', year: '2-digit' })) : ''}</td></tr>`).join('')}</tbody>
        </table>
      </section>` : ''}
      <h2>History</h2>
      ${hist.slice().reverse().map((h) => `
        <a class="card list-row" href="#/session/${encodeURIComponent(h.session.id)}">
          <div><strong>${esc(fmtDate(h.session.startedAt))}</strong><div class="muted small">${esc(h.session.name)}</div></div>
          <div class="right small">${esc(h.sets.map((st) => stats.shortLabel(kind, st)).join(' · '))}</div>
        </a>`).join('')}
    ` : '<p class="muted pad">No history for this exercise yet.</p>'}
  `;
}

function drawExerciseChart(id) {
  const el = document.getElementById('chart');
  if (!el) return;
  const kind = store.getExercise(id).kind || 'weight';
  const metrics = stats.METRICS[kind];
  const metric = metrics.find((m) => m.key === metricChoice[id]) || metrics[0];
  const points = stats.historyFor(id).map((h) => ({
    t: new Date(h.session.startedAt).getTime(),
    v: Math.round(metric.fn(h.sets) * 10) / 10,
    note: h.sets.map((st) => stats.shortLabel(kind, st)).join(' · '),
  }));
  const format = metric.unit === 's' ? (v) => stats.fmtSec(v) : (v) => `${fmtNum(v)} ${metric.unit}`;
  lineChart(el, points, { format });
}

// ---------------------------------------------------------------- settings

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
      <p class="muted small" id="storage-msg"></p>
    </section>

    <p class="muted small center">Lift Tracker · data stays on this phone and in your own GitHub repo.</p>
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
      if (!cur || (doc.updatedAt || '') > (cur.doc.updatedAt || '')) {
        await store.saveDoc(doc, { render: false });
        n++;
      }
    }
    store.emit();
    alert(`Imported ${n} item(s).`);
  } catch (e) {
    alert('Import failed: ' + e.message);
  }
}

// ---------------------------------------------------------------- modals

function closeModal() {
  modal.innerHTML = '';
  modal.hidden = true;
  document.body.classList.remove('modal-open');
}

function openModal(html) {
  modal.innerHTML = `<div class="backdrop" data-act="close-modal"></div><div class="sheet">${html}</div>`;
  modal.hidden = false;
  document.body.classList.add('modal-open');
}

let sheetActions = [];
function actionSheet(title, actions) {
  sheetActions = actions;
  openModal(`
    <div class="sheet-title">${esc(title)}</div>
    ${actions.map((a, k) => `<button class="sheet-btn ${a.danger ? 'danger-text' : ''}" data-act="sheet-action" data-k="${k}">${esc(a.label)}</button>`).join('')}
    <button class="sheet-btn cancel" data-act="close-modal">Cancel</button>`);
}

// Exercise picker. mode: { type: 'add' } | { type: 'replace', index }
let pickMode = null;
let pickQuery = '';

function openPicker(mode) {
  pickMode = mode;
  pickQuery = '';
  openModal(`
    <div class="picker-head">
      <input id="pick-q" type="search" placeholder="Search exercises" autocomplete="off" autocorrect="off" enterkeyhint="search">
      <button class="link-btn" data-act="close-modal">Cancel</button>
    </div>
    <div class="picker-list" id="pick-list">${pickerList()}</div>`);
  setTimeout(() => document.getElementById('pick-q')?.focus(), 50);
}

function recentExerciseIds() {
  const seen = [];
  for (const s of store.finishedSessions()) for (const e of s.exercises) if (!seen.includes(e.exerciseId)) seen.push(e.exerciseId);
  return seen.slice(0, 12);
}

function pickerList() {
  const all = store.exercises();
  const row = (ex) => `
    <button class="pick-row" data-act="pick" data-id="${esc(ex.id)}">
      <span>${esc(ex.name)}</span><span class="muted small">${esc(ex.category || '')}</span>
    </button>`;
  if (!pickQuery.trim()) {
    const recent = recentExerciseIds().map((id) => all.find((e) => e.id === id)).filter(Boolean);
    let html = recent.length ? `<div class="pick-group">Recent</div>${recent.map(row).join('')}` : '';
    for (const c of CATEGORIES) {
      const items = all.filter((e) => (e.category || 'Other') === c);
      if (items.length) html += `<div class="pick-group">${esc(c)}</div>${items.map(row).join('')}`;
    }
    return html;
  }
  const results = searchExercises(all, pickQuery);
  const exact = results.some((e) => e.name.toLowerCase() === pickQuery.trim().toLowerCase());
  return results.map(row).join('') +
    (exact ? '' : `<button class="pick-row create" data-act="create-ex">+ Create “${esc(pickQuery.trim())}”</button>`);
}

function openCreateForm() {
  const name = pickQuery.trim();
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
      <div class="row gap"><button class="btn primary" type="submit">Create</button><button class="btn" type="button" data-act="close-modal">Cancel</button></div>
    </form>`;
}

async function pickExercise(id) {
  closeModal();
  if (pickMode?.type === 'browse') return go(`#/exercise/${encodeURIComponent(id)}`);
  const s = editingSession();
  if (!s) return;
  if (pickMode?.type === 'replace') {
    s.exercises[pickMode.index].exerciseId = id;
  } else {
    const prev = stats.historyFor(id, { excludeId: s.id });
    const n = prev.length ? Math.min(prev[prev.length - 1].sets.length, 6) : 3;
    s.exercises.push({ exerciseId: id, sets: Array.from({ length: n }, blankSet) });
  }
  await store.saveDoc(s);
  if (pickMode?.type !== 'replace') setTimeout(() => main.querySelectorAll('.ex-card').item(s.exercises.length - 1)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
}

// ---------------------------------------------------------------- rest timer

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
    if (!rest.finishedAt && Date.now() >= rest.endAt) {
      rest.finishedAt = Date.now();
      beep();
    }
    if (rest.finishedAt && Date.now() - rest.finishedAt > 8000) stopRest();
    else renderRest();
  }
}
setInterval(tick, 500);

// ---------------------------------------------------------------- events

document.addEventListener('click', async (evt) => {
  const el = evt.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const i = el.dataset.ex != null ? +el.dataset.ex : null;
  const j = el.dataset.set != null ? +el.dataset.set : null;

  switch (act) {
    case 'start-day': {
      if (store.activeSession()) return go('#/workout');
      return startDay(el.dataset.day);
    }
    case 'start-empty': return newSession('Workout', null, []);
    case 'rename': {
      const s = editingSession();
      const name = prompt('Workout name', s.name);
      if (name && name.trim()) { s.name = name.trim(); await store.saveDoc(s); }
      return;
    }
    case 'finish': {
      if (confirm('Finish this workout?')) await finishWorkout();
      return;
    }
    case 'edit-done': {
      const s = editingSession();
      for (const e of s.exercises) {
        const kind = store.getExercise(e.exerciseId).kind || 'weight';
        e.sets = e.sets.filter((st) => stats.isValidSet(kind, st));
      }
      s.exercises = s.exercises.filter((e) => e.sets.length);
      await store.saveDoc(s, { render: false });
      return go(`#/session/${encodeURIComponent(s.id)}`);
    }
    case 'discard': {
      if (confirm('Discard this workout? Nothing will be saved.')) { stopRest(); await store.deleteDoc(store.activeSession()); }
      return;
    }
    case 'toggle-set': return toggleSet(i, j);
    case 'add-set': {
      const s = editingSession();
      const sets = s.exercises[i].sets;
      const last = sets[sets.length - 1];
      sets.push(last ? { kg: last.kg, reps: last.reps, sec: last.sec, done: false } : blankSet());
      return store.saveDoc(s);
    }
    case 'set-menu': {
      const s = editingSession();
      return actionSheet(`Set ${j + 1}`, [
        { label: 'Delete set', danger: true, run: async () => { s.exercises[i].sets.splice(j, 1); await store.saveDoc(s); } },
      ]);
    }
    case 'ex-menu': {
      const s = editingSession();
      const e = s.exercises[i];
      const move = (d) => async () => { const [x] = s.exercises.splice(i, 1); s.exercises.splice(i + d, 0, x); await store.saveDoc(s); };
      const acts = [];
      if (i > 0) acts.push({ label: 'Move up', run: move(-1) });
      if (i < s.exercises.length - 1) acts.push({ label: 'Move down', run: move(1) });
      acts.push({ label: 'Swap exercise', run: () => openPicker({ type: 'replace', index: i }) });
      acts.push({ label: 'View progress', run: () => go(`#/exercise/${encodeURIComponent(e.exerciseId)}`) });
      acts.push({ label: 'Remove exercise', danger: true, run: async () => { s.exercises.splice(i, 1); await store.saveDoc(s); } });
      return actionSheet(store.exerciseName(e.exerciseId), acts);
    }
    case 'sheet-action': {
      const a = sheetActions[+el.dataset.k];
      closeModal();
      return a?.run();
    }
    case 'add-ex': return openPicker({ type: 'add' });
    case 'close-modal': return closeModal();
    case 'pick': return pickExercise(el.dataset.id);
    case 'create-ex': return openCreateForm();
    case 'delete-session': {
      if (!confirm('Delete this workout permanently?')) return;
      await store.deleteDoc(store.getDoc(el.dataset.id));
      return go('#/history');
    }
    case 'metric': {
      metricChoice[el.dataset.ex] = el.dataset.metric;
      return renderMain();
    }
    case 'rest-adj': {
      if (!rest) return;
      const d = +el.dataset.d;
      if (rest.finishedAt) { if (d > 0) startRest(d); return; }
      rest.endAt += d * 1000;
      rest.total = Math.max(1, rest.total + d);
      return renderRest();
    }
    case 'rest-skip': return stopRest();
    case 'sync-now': return sync();
    case 'export': return exportData();
  }
});

document.addEventListener('input', async (evt) => {
  const el = evt.target;
  if (el.id === 'pick-q') {
    pickQuery = el.value;
    document.getElementById('pick-list').innerHTML = pickerList();
    return;
  }
  if (el.id === 'progress-q') {
    progressQuery = el.value;
    document.getElementById('progress-list').innerHTML = progressList();
    return;
  }
  const field = el.dataset.field;
  if (!field) return;
  const s = editingSession();
  if (!s) return;
  if (field === 'notes') s.notes = el.value;
  else {
    const st = s.exercises[+el.dataset.ex].sets[+el.dataset.set];
    st[field] = field === 'sec' ? parseTime(el.value) : parseNum(el.value);
  }
  await store.saveDoc(s, { render: false });
  renderHeader();
});

// Move to the next input when "done" is pressed on the keyboard.
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
  if (el.id === 'import-file' && el.files[0]) await importData(el.files[0]);
});

document.addEventListener('submit', async (evt) => {
  evt.preventDefault();
  const form = evt.target;
  if (form.id === 'gh-form') return saveGhForm(form);
  if (form.id === 'create-form') {
    const f = new FormData(form);
    const name = String(f.get('name')).trim();
    if (!name) return;
    const doc = { id: 'x-' + uid(), type: 'exercise', name, kind: f.get('kind'), category: f.get('category') };
    await store.saveDoc(doc, { render: false });
    await pickExercise(doc.id);
  }
});

// ---------------------------------------------------------------- boot

async function boot() {
  await store.init();
  store.onChange(render);
  store.setSyncHandler(sync);
  window.addEventListener('hashchange', () => { closeModal(); render(); window.scrollTo(0, 0); });
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
