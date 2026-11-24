// Shared UI helpers: modal sheets, action sheets, toasts, exercise thumbnails and info sheets.
import * as store from './store.js';
import { poseSVG } from './poses.js';
import { EQUIPMENT, KINDS } from './catalog.js';
import { TRACKS, TIERS, stdLabel } from './cali.js';
import { esc } from './util.js';

const modal = document.getElementById('modal');

export const go = (hash) => { location.hash = hash; };

export function closeModal() {
  modal.innerHTML = '';
  modal.hidden = true;
}

export function openModal(html, { cls = '' } = {}) {
  modal.innerHTML = `<div class="backdrop" data-act="close-modal"></div><div class="sheet ${cls}">${html}</div>`;
  modal.hidden = false;
  return modal.querySelector('.sheet');
}

let sheetActions = [];
export function actionSheet(title, actions) {
  sheetActions = actions;
  openModal(`
    <div class="sheet-title">${esc(title)}</div>
    ${actions.map((a, k) => `<button class="sheet-btn ${a.danger ? 'danger-text' : ''}" data-act="sheet-action" data-k="${k}">${esc(a.label)}</button>`).join('')}
    <button class="sheet-btn cancel" data-act="close-modal">Cancel</button>`);
}
export function runSheetAction(k) {
  const a = sheetActions[k];
  closeModal();
  return a?.run();
}

let toastTimer;
export function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.append(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------- exercise visuals ----------

const photoOf = (ex) => (ex.photo && !ex.photo.startsWith('pose:') ? ex.photo : null);
const poseOf = (ex) => (ex.photo?.startsWith('pose:') ? ex.photo.slice(5) : null);

export function thumb(ex, cls = 'thumb') {
  const ph = photoOf(ex);
  const po = poseOf(ex);
  if (ph) return `<img class="${cls}" src="img/ex/${ph}-0.jpg" alt="" loading="lazy" decoding="async">`;
  if (po) return `<span class="${cls} pose-thumb">${poseSVG(po)}</span>`;
  return `<span class="${cls} glyph" aria-hidden="true">${esc((ex.name || '?').trim()[0] || '?')}</span>`;
}

export function visual(ex) {
  const ph = photoOf(ex);
  const po = poseOf(ex);
  if (ph) return `<div class="photo-anim"><img src="img/ex/${ph}-0.jpg" alt="${esc(ex.name)} start position"><img class="second" src="img/ex/${ph}-1.jpg" alt="${esc(ex.name)} end position"></div>`;
  if (po) return `<div class="pose-big">${poseSVG(po)}</div>`;
  return '';
}

let infoPromise;
export function loadInfo() {
  infoPromise ||= fetch('img/ex/info.json').then((r) => r.json()).catch(() => ({}));
  return infoPromise;
}

const MUSCLE = (m) => m.replace(/^\w/, (c) => c.toUpperCase());

export async function infoHTML(exerciseId, { back = false, addable = false } = {}) {
  const ex = store.getExercise(exerciseId);
  const info = photoOf(ex) ? (await loadInfo())[photoOf(ex)] : null;
  const trackSteps = TRACKS.flatMap((t) => t.steps.map((s) => ({ ...s, track: t }))).filter((s) => s.exerciseId === exerciseId);
  const tips = [...new Set(trackSteps.map((s) => s.tip).filter(Boolean))];
  const steps = info?.steps?.length ? info.steps : tips;
  const yt = `https://www.youtube.com/results?search_query=${encodeURIComponent(ex.name + ' exercise proper form')}`;
  const chips = [
    ex.category, EQUIPMENT[ex.equip], KINDS[ex.kind], ex.level ? TIERS[ex.level - 1] : '', ex.sided ? 'One side at a time' : ex.uni ? 'Can be done one side at a time' : '',
  ].filter(Boolean);
  return `
    <div class="info-head">
      ${back ? '<button class="link-btn" data-act="picker-back">‹ Back</button>' : '<span></span>'}
      <button class="link-btn" data-act="close-modal">Close</button>
    </div>
    <h2 class="info-title">${esc(ex.name)}</h2>
    ${visual(ex)}
    <div class="chips">${chips.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div>
    ${info ? `<p class="small"><strong>Works:</strong> ${esc(info.primary.map(MUSCLE).join(', '))}${info.secondary.length ? ` <span class="muted">· also ${esc(info.secondary.map(MUSCLE).join(', '))}</span>` : ''}</p>` : ''}
    ${trackSteps.length ? `<p class="small"><strong>Calisthenics:</strong> ${trackSteps.map((s) => `${esc(s.track.name)} track, goal ${esc(stdLabel(s.std))}`).join('; ')}</p>` : ''}
    ${steps.length ? `<h4>How to do it</h4><ol class="steps">${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
    <a class="btn wide" href="${yt}" target="_blank" rel="noopener">▶ Watch a demo on YouTube</a>
    ${addable ? `<button class="btn wide primary" data-act="pick" data-id="${esc(ex.id)}">Add to workout</button>` : ''}
  `;
}

export async function openInfo(exerciseId, opts = {}) {
  const sheet = openModal('<p class="muted pad">Loading…</p>', { cls: 'info-sheet' });
  sheet.innerHTML = await infoHTML(exerciseId, opts);
}
