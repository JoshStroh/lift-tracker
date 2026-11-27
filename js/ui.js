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

// ---------- drag to reorder ----------
// Press the handle and drag. Works with touch (iPhone) and mouse via Pointer Events.
// opts: { item: selector, handle: selector, onMove(from, to), onStart(itemEl), onEnd() }
export function makeSortable(container, opts) {
  if (container.dataset.sortable) return;
  container.dataset.sortable = '1';
  container.addEventListener('pointerdown', (e) => {
    const h = e.target.closest(opts.handle);
    if (!h || !container.contains(h) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const el = h.closest(opts.item);
    if (!el) return;
    e.preventDefault();
    const fingerY = e.clientY;
    opts.onStart?.(el);
    // after a possible layout change (compact mode), put the item back under the finger
    let r0 = el.getBoundingClientRect();
    window.scrollBy(0, r0.top + r0.height / 2 - fingerY);
    const items = [...container.querySelectorAll(opts.item)];
    const from = items.indexOf(el);
    const scroll0 = window.scrollY;
    const rects = items.map((i) => { const r = i.getBoundingClientRect(); return { top: r.top + window.scrollY, h: r.height }; });
    const gap = rects.length > 1 ? Math.max(0, rects[1].top - (rects[0].top + rects[0].h)) : 0;
    const startY = fingerY;
    let lastY = fingerY;
    let to = from;
    let raf = 0;
    el.classList.add('dragging');
    document.body.classList.add('drag-active');
    try { h.setPointerCapture(e.pointerId); } catch {}

    const layout = () => {
      const dy = lastY - startY + (window.scrollY - scroll0);
      el.style.transform = `translateY(${dy}px)`;
      const center = rects[from].top + rects[from].h / 2 + dy;
      to = from;
      for (let k = 0; k < from; k++) if (center < rects[k].top + rects[k].h / 2) { to = k; break; }
      if (to === from) for (let k = rects.length - 1; k > from; k--) if (center > rects[k].top + rects[k].h / 2) { to = k; break; }
      const shift = rects[from].h + gap;
      items.forEach((it, k) => {
        if (k === from) return;
        const s = from < to && k > from && k <= to ? -shift : from > to && k >= to && k < from ? shift : 0;
        it.style.transform = s ? `translateY(${s}px)` : '';
      });
    };
    // scroll the page when dragging near the top or bottom edge
    const tick = () => {
      const tabs = document.getElementById('tabs')?.getBoundingClientRect().top ?? innerHeight;
      const edge = 70;
      let v = 0;
      if (lastY < edge + 50) v = -Math.ceil((edge + 50 - lastY) / 6);
      else if (lastY > tabs - edge) v = Math.ceil((lastY - (tabs - edge)) / 6);
      if (v) { window.scrollBy(0, v); layout(); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const move = (ev) => { lastY = ev.clientY; layout(); };
    const end = () => {
      cancelAnimationFrame(raf);
      h.removeEventListener('pointermove', move);
      h.removeEventListener('pointerup', end);
      h.removeEventListener('pointercancel', end);
      items.forEach((it) => { it.style.transform = ''; });
      el.classList.remove('dragging');
      document.body.classList.remove('drag-active');
      opts.onEnd?.();
      if (to !== from) opts.onMove(from, to);
    };
    h.addEventListener('pointermove', move);
    h.addEventListener('pointerup', end);
    h.addEventListener('pointercancel', end);
  });
}
