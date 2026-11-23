// Small dependency-free SVG line chart (single series) with tap/hover readout.
import { esc, fmtNum, fmtDate } from './util.js';

export function lineChart(container, points, { unit = '', format = (v) => fmtNum(v) + unit } = {}) {
  const W = Math.max(280, container.clientWidth || 320);
  const H = 200;
  const m = { t: 16, r: 14, b: 26, l: 40 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;

  if (!points.length) {
    container.innerHTML = '<p class="muted center pad">No data yet.</p>';
    return;
  }

  const xs = points.map((p) => p.t);
  const ys = points.map((p) => p.v);
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  if (x0 === x1) { x0 -= 86400000; x1 += 86400000; }
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pad = (y1 - y0) * 0.15 || Math.max(1, y1 * 0.1);
  y0 = Math.max(0, y0 - pad); y1 = y1 + pad;
  const ticks = niceTicks(y0, y1, 4);
  y0 = Math.min(y0, ticks[0]); y1 = Math.max(y1, ticks[ticks.length - 1]);

  const X = (t) => m.l + ((t - x0) / (x1 - x0)) * iw;
  const Y = (v) => m.t + ih - ((v - y0) / (y1 - y0)) * ih;

  const grid = ticks.map((v) => `
    <line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}"/>
    <text class="axis" x="${m.l - 6}" y="${Y(v) + 4}" text-anchor="end">${esc(fmtNum(v))}</text>`).join('');

  const xLabels = [points[0], points[points.length - 1]]
    .filter((p, i, a) => i === 0 || p !== a[0])
    .map((p, i) => `<text class="axis" x="${X(p.t)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : 'end'}">${esc(fmtDate(p.t, { day: 'numeric', month: 'short' }))}</text>`).join('');

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join('');
  const maxV = Math.max(...ys);
  const dots = points.map((p) => `<circle class="dot${p.v === maxV ? ' best' : ''}" cx="${X(p.t)}" cy="${Y(p.v)}" r="4"/>`).join('');

  container.innerHTML = `
    <div class="chart-wrap">
      <div class="readout"></div>
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Progress chart">
        ${grid}${xLabels}
        <path class="line" d="${path}"/>
        ${dots}
        <line class="cross" y1="${m.t}" y2="${m.t + ih}" visibility="hidden"/>
        <circle class="focus" r="6" visibility="hidden"/>
        <rect class="hit" x="${m.l}" y="0" width="${iw}" height="${H}"/>
      </svg>
    </div>`;

  const svg = container.querySelector('svg');
  const cross = svg.querySelector('.cross');
  const focus = svg.querySelector('.focus');
  const readout = container.querySelector('.readout');
  const setReadout = (p) => { readout.innerHTML = `<strong>${esc(format(p.v))}</strong><span>${esc(fmtDate(p.t, { day: 'numeric', month: 'short', year: 'numeric' }))}</span>${p.note ? `<span>${esc(p.note)}</span>` : ''}`; };
  setReadout(points[points.length - 1]);

  const show = (evt) => {
    const rect = svg.getBoundingClientRect();
    const px = ((evt.clientX - rect.left) / rect.width) * W;
    let best = points[0];
    for (const p of points) if (Math.abs(X(p.t) - px) < Math.abs(X(best.t) - px)) best = p;
    const cx = X(best.t), cy = Y(best.v);
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
    focus.setAttribute('cx', cx); focus.setAttribute('cy', cy); focus.setAttribute('visibility', 'visible');
    setReadout(best);
  };
  const hide = () => { cross.setAttribute('visibility', 'hidden'); focus.setAttribute('visibility', 'hidden'); setReadout(points[points.length - 1]); };
  svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerdown', show);
  svg.addEventListener('pointerleave', hide);
}

function niceTicks(min, max, count) {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= step0) || 10 * mag;
  const start = Math.floor(min / step) * step;
  const out = [];
  for (let v = start; v <= max + step * 0.5; v += step) out.push(+v.toFixed(6));
  return out;
}
