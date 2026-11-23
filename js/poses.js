// Stick-figure diagrams for calisthenics positions that have no photo.
// Each pose is described by joint angles (degrees; 0 = right, 90 = down, -90 = up)
// and placed so that one anchor point (hand, foot or hip) sits at a given spot.

const L = { torso: 22, neck: 7.5, upper: 11, fore: 10, thigh: 13, shin: 13 };
const d = (deg) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
const add = (p, deg, len) => { const [x, y] = d(deg); return [p[0] + x * len, p[1] + y * len]; };

// t: hip→shoulder, ua/fa: upper/fore arm, th/sh: thigh/shin, *2 = second limb (drawn lighter)
const POSES = {
  hang: { t: -90, ua: -90, fa: -90, th: 90, sh: 90, anchor: 'hand', bar: true },
  pullup: { t: -90, ua: 110, fa: -75, th: 95, sh: 80, anchor: 'hand', bar: true },
  support: { t: -90, ua: 90, fa: 90, th: 80, sh: 115, anchor: 'hand', dip: true },
  vrow: { t: -110, ua: -5, fa: -5, th: 70, sh: 70, anchor: 'foot', floor: true, pole: true },
  'fl-tuck': { t: 0, ua: -90, fa: -90, th: -45, sh: 175, anchor: 'hand', bar: true, face: -90 },
  'fl-adv': { t: 0, ua: -90, fa: -90, th: -90, sh: 180, anchor: 'hand', bar: true, face: -90 },
  'fl-one': { t: 0, ua: -90, fa: -90, th: 180, sh: 180, th2: -90, sh2: 180, anchor: 'hand', bar: true, face: -90 },
  'fl-straddle': { t: 0, ua: -90, fa: -90, th: 175, sh: 175, th2: 188, sh2: 188, anchor: 'hand', bar: true, face: -90 },
  'fl-full': { t: 0, ua: -90, fa: -90, th: 180, sh: 180, anchor: 'hand', bar: true, face: -90 },
  'bl-tuck': { t: 0, ua: -90, fa: -90, th: 45, sh: 185, anchor: 'hand', bar: true, face: 90 },
  'bl-adv': { t: 0, ua: -90, fa: -90, th: 90, sh: 180, anchor: 'hand', bar: true, face: 90 },
  'bl-straddle': { t: 0, ua: -90, fa: -90, th: 185, sh: 185, th2: 172, sh2: 172, anchor: 'hand', bar: true, face: 90 },
  'bl-full': { t: 0, ua: -90, fa: -90, th: 180, sh: 180, anchor: 'hand', bar: true, face: 90 },
  german: { t: -100, ua: -120, fa: -120, th: 100, sh: 85, anchor: 'hand', bar: true },
  wiper: { t: -100, ua: -80, fa: -90, th: -55, sh: -55, anchor: 'hand', bar: true },
  lsit: { t: -90, ua: 75, fa: 105, th: 0, sh: 0, anchor: 'hand', handles: true },
  'lsit-foot': { t: -90, ua: 75, fa: 105, th: 15, sh: 15, anchor: 'hand', handles: true },
  'lsit-tuck': { t: -90, ua: 75, fa: 105, th: -30, sh: 95, anchor: 'hand', handles: true },
  'lsit-one': { t: -90, ua: 75, fa: 105, th: 0, sh: 0, th2: -30, sh2: 95, anchor: 'hand', handles: true },
  vsit: { t: -105, ua: 80, fa: 80, th: -55, sh: -55, anchor: 'hand', handles: true },
  handstand: { t: 90, ua: 90, fa: 90, th: -90, sh: -90, anchor: 'hand', floor: true },
  wallplank: { t: 115, ua: 90, fa: 90, th: 0, sh: 0, anchor: 'hand', floor: true, wall: true },
  wallwalk: { t: 105, ua: 85, fa: 85, th: -20, sh: 10, anchor: 'hand', floor: true, wall: true },
  wallpush: { t: -80, ua: 0, fa: 0, th: 100, sh: 100, anchor: 'foot', floor: true, wall: true },
  frog: { t: 25, ua: 80, fa: 95, th: 40, sh: 200, anchor: 'hand', floor: true },
  lean: { t: -22, ua: 110, fa: 110, th: 158, sh: 158, anchor: 'hand', floor: true },
  ppp: { t: -10, ua: 140, fa: 70, th: 170, sh: 170, anchor: 'hand', floor: true },
  archer: { t: -25, ua: 90, fa: 90, th: 155, sh: 155, ua2: 160, fa2: 180, anchor: 'hand', floor: true },
  burpee: { t: -25, ua: 90, fa: 90, th: 155, sh: 155, anchor: 'hand', floor: true },
  'pl-tuck': { t: 0, ua: 100, fa: 100, th: 30, sh: 180, anchor: 'hand', floor: true },
  'pl-adv': { t: 0, ua: 105, fa: 105, th: 90, sh: 180, anchor: 'hand', floor: true },
  'pl-straddle': { t: 0, ua: 110, fa: 110, th: 175, sh: 175, th2: 186, sh2: 186, anchor: 'hand', floor: true },
  'pl-full': { t: 0, ua: 110, fa: 110, th: 180, sh: 180, anchor: 'hand', floor: true },
  pike: { t: 30, ua: 60, fa: 60, th: 105, sh: 105, anchor: 'hand', floor: true },
  hollow: { t: -165, ua: -170, fa: -170, th: -12, sh: -12, anchor: 'hip', floor: true },
  dragonflag: { t: 150, ua: 200, fa: -120, th: -30, sh: -30, anchor: 'shoulder', floor: true },
  pistol: { t: -70, ua: 0, fa: 0, th: 10, sh: 100, th2: -5, sh2: -5, anchor: 'foot', floor: true },
  shrimp: { t: -70, ua: 0, fa: 0, th: 10, sh: 100, th2: 115, sh2: 195, anchor: 'foot', floor: true },
  bear: { t: 0, ua: 90, fa: 90, th: 100, sh: 150, anchor: 'hand', floor: true },
  cobra: { t: -40, ua: 100, fa: 100, th: 180, sh: 180, anchor: 'hip', floor: true },
};

export function hasPose(name) { return !!POSES[name]; }

export function poseSVG(name, { cls = 'pose' } = {}) {
  const p = POSES[name];
  if (!p) return '';
  const hip = [0, 0];
  const shoulder = add(hip, p.t, L.torso);
  const head = add(shoulder, p.t, L.neck);
  const elbow = add(shoulder, p.ua, L.upper);
  const hand = add(elbow, p.fa, L.fore);
  const knee = add(hip, p.th, L.thigh);
  const foot = add(knee, p.sh, L.shin);
  const arm2 = p.ua2 != null ? (() => { const e = add(shoulder, p.ua2, L.upper); return [e, add(e, p.fa2, L.fore)]; })() : null;
  const leg2 = p.th2 != null ? (() => { const k = add(hip, p.th2, L.thigh); return [k, add(k, p.sh2, L.shin)]; })() : null;

  const anchors = { hand, foot, hip, shoulder };
  const a = anchors[p.anchor] || hip;
  const pts = [hip, shoulder, head, elbow, hand, knee, foot, ...(arm2 || []), ...(leg2 || [])];
  const shift = (q) => [q[0] - a[0] + 60, q[1] - a[1] + 40];
  const S = (q) => shift(q).map((v) => v.toFixed(1)).join(',');

  const all = pts.map(shift);
  const xs = all.map((q) => q[0]);
  const ys = all.map((q) => q[1]);
  let minX = Math.min(...xs) - 8, maxX = Math.max(...xs) + 8, minY = Math.min(...ys) - 8, maxY = Math.max(...ys) + 8;

  const props = [];
  const H = shift(hand), F = shift(foot);
  if (p.bar) { props.push(`<line class="prop" x1="${H[0] - 16}" y1="${H[1]}" x2="${H[0] + 16}" y2="${H[1]}"/>`); minY = Math.min(minY, H[1] - 6); }
  let floorY = null;
  if (p.floor) floorY = Math.max(...ys.filter((y, i) => i !== 2)) + 1.5; // not the head
  if (p.handles || p.dip) floorY = H[1] + (p.dip ? 26 : 8);
  if (floorY != null) {
    props.push(`<line class="prop floor" x1="${minX}" y1="${floorY}" x2="${maxX}" y2="${floorY}"/>`);
    maxY = Math.max(maxY, floorY + 4);
  }
  if (p.handles) props.push(`<rect class="prop-fill" x="${H[0] - 3}" y="${H[1]}" width="6" height="${floorY - H[1]}" rx="1.5"/>`);
  if (p.dip) props.push(`<line class="prop" x1="${H[0] - 14}" y1="${H[1]}" x2="${H[0] + 14}" y2="${H[1]}"/><line class="prop" x1="${H[0] + 10}" y1="${H[1]}" x2="${H[0] + 10}" y2="${floorY}"/>`);
  if (p.wall) { const wx = Math.max(...xs) + 1.5; props.push(`<line class="prop" x1="${wx}" y1="${minY}" x2="${wx}" y2="${floorY ?? maxY}"/>`); maxX = Math.max(maxX, wx + 4); }
  if (p.pole) props.push(`<line class="prop" x1="${H[0] + 1.5}" y1="${minY}" x2="${H[0] + 1.5}" y2="${floorY ?? maxY}"/>`);

  // Keep a pleasant aspect ratio.
  let w = maxX - minX, h = maxY - minY;
  if (w / h < 0.9) { const nw = h * 0.9; minX -= (nw - w) / 2; w = nw; }
  else if (w / h > 2.2) { const nh = w / 2.2; minY -= (nh - h) / 2; h = nh; }

  const hd = shift(head);
  const faceDot = p.face != null ? (() => { const [x, y] = d(p.face); return `<circle class="face" cx="${(hd[0] + x * 2.6).toFixed(1)}" cy="${(hd[1] + y * 2.6).toFixed(1)}" r="1.1"/>`; })() : '';
  const limb2 = [
    arm2 ? `<polyline class="limb2" points="${S(shoulder)} ${S(arm2[0])} ${S(arm2[1])}"/>` : '',
    leg2 ? `<polyline class="limb2" points="${S(hip)} ${S(leg2[0])} ${S(leg2[1])}"/>` : '',
  ].join('');

  return `<svg class="${cls}" viewBox="${minX.toFixed(1)} ${minY.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" role="img" aria-label="Diagram">
    ${props.join('')}${limb2}
    <polyline class="limb" points="${S(hip)} ${S(knee)} ${S(foot)}"/>
    <line class="limb" x1="${S(hip).split(',')[0]}" y1="${S(hip).split(',')[1]}" x2="${S(shoulder).split(',')[0]}" y2="${S(shoulder).split(',')[1]}"/>
    <polyline class="limb" points="${S(shoulder)} ${S(elbow)} ${S(hand)}"/>
    <circle class="head" cx="${hd[0].toFixed(1)}" cy="${hd[1].toFixed(1)}" r="4.5"/>${faceDot}
  </svg>`;
}

export const POSE_NAMES = Object.keys(POSES);
