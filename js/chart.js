// Small dependency-free SVG line chart with a tap/hover readout.
// series: [{ name, points: [{ t, v, note? }] }] — one series, or Left/Right.
import { esc, fmtNum, fmtDate } from './util.js';

export function lineChart(container, series, { format = (v) => fmtNum(v) } = {}) {
  series = series.filter((s) => s.points.length);
  const W = Math.max(280, container.clientWidth || 320);
  const H = 200;
  const m = { t: 16, r: 14, b: 26, l: 40 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;

  if (!series.length) {
    container.innerHTML = '<p class="muted center pad">No data yet.</p>';
    return;
  }

  const all = series.flatMap((s) => s.points);
  const xs = all.map((p) => p.t);
  const ys = all.map((p) => p.v);
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

  const tFirst = Math.min(...xs), tLast = Math.max(...xs);
  const xLabels = [tFirst, tLast].filter((t, i) => i === 0 || t !== tFirst)
    .map((t, i) => `<text class="axis" x="${X(t)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : 'end'}">${esc(fmtDate(t, { day: 'numeric', month: 'short' }))}</text>`).join('');

  const maxV = Math.max(...ys);
  const lines = series.map((s, k) => {
    const path = s.points.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join('');
    const dots = s.points.map((p) => `<circle class="dot s${k}${series.length === 1 && p.v === maxV ? ' best' : ''}" cx="${X(p.t)}" cy="${Y(p.v)}" r="4"/>`).join('');
    return `<path class="line s${k}" d="${path}"/>${dots}`;
  }).join('');

  const legend = series.length > 1
    ? `<div class="legend">${series.map((s, k) => `<span><i class="sw s${k}"></i>${esc(s.name)}</span>`).join('')}</div>`
    : '';

  container.innerHTML = `
    <div class="chart-wrap">
      ${legend}
      <div class="readout"></div>
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Progress chart">
        ${grid}${xLabels}${lines}
        <line class="cross" y1="${m.t}" y2="${m.t + ih}" visibility="hidden"/>
        <rect class="hit" x="${m.l}" y="0" width="${iw}" height="${H}"/>
      </svg>
    </div>`;

  const svg = container.querySelector('svg');
  const cross = svg.querySelector('.cross');
  const readout = container.querySelector('.readout');
  const times = [...new Set(xs)].sort((a, b) => a - b);

  const setReadout = (t) => {
    const parts = series.map((s) => {
      const p = s.points.find((q) => q.t === t);
      return p ? `<strong>${series.length > 1 ? `<i class="sw s${series.indexOf(s)}"></i>${esc(s.name)} ` : ''}${esc(format(p.v))}</strong>` : '';
    }).filter(Boolean).join(' ');
    const note = series.length === 1 ? series[0].points.find((q) => q.t === t)?.note : '';
    readout.innerHTML = `${parts}<span>${esc(fmtDate(t, { day: 'numeric', month: 'short', year: 'numeric' }))}</span>${note ? `<span>${esc(note)}</span>` : ''}`;
  };
  setReadout(times[times.length - 1]);

  const show = (evt) => {
    const rect = svg.getBoundingClientRect();
    const px = ((evt.clientX - rect.left) / rect.width) * W;
    let best = times[0];
    for (const t of times) if (Math.abs(X(t) - px) < Math.abs(X(best) - px)) best = t;
    const cx = X(best);
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
    setReadout(best);
  };
  const hide = () => { cross.setAttribute('visibility', 'hidden'); setReadout(times[times.length - 1]); };
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
