// The vehicles that drive along the ground, drawn side-on and facing +x, after real cars (shapes only, no
// badges): a Porsche 911, a Ford Mustang, a Mazda MX-5 Miata with a blonde woman driving, a Jeep Wrangler,
// an old beat-up Ford pickup with a bearded man at the open window, and a beat-up VW Beetle.
// Each body is painted once into a picture and reused; only the wheels, hair and smoke are drawn live.
// Units: s = character height in pixels. y = 0 is the ground; up is negative.

const INK = 'rgba(28,30,40,0.85)';

// ---------------------------------------------------------------- helpers
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const t = f < 0 ? 0 : 255, k = Math.abs(f);
  r = Math.round(r + (t - r) * k); g = Math.round(g + (t - g) * k); b = Math.round(b + (t - b) * k);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
// A path from a list of commands in character-height units: M/L x y, Q cx cy x y, C c1x c1y c2x c2y x y,
// A cx cy r a0 a1 [anticlockwise], Z.
function P(s, cmds) {
  const p = new Path2D();
  for (const [k, ...a] of cmds) {
    if (k === 'M') p.moveTo(a[0] * s, a[1] * s);
    else if (k === 'L') p.lineTo(a[0] * s, a[1] * s);
    else if (k === 'Q') p.quadraticCurveTo(a[0] * s, a[1] * s, a[2] * s, a[3] * s);
    else if (k === 'C') p.bezierCurveTo(a[0] * s, a[1] * s, a[2] * s, a[3] * s, a[4] * s, a[5] * s);
    else if (k === 'A') p.arc(a[0] * s, a[1] * s, a[2] * s, a[3], a[4], !!a[5]);
    else if (k === 'Z') p.closePath();
  }
  return p;
}
const PI = Math.PI;
// Car paint: bright sky reflection along the top, the colour, a dark horizon reflection, deep shadow below.
function paint(c, s, col, y0, y1, faded = 0) {
  const g = c.createLinearGradient(0, y0 * s, 0, y1 * s);
  g.addColorStop(0, shade(col, 0.45 - faded * 0.2)); g.addColorStop(0.15, shade(col, 0.15)); g.addColorStop(0.42, col);
  g.addColorStop(0.5, shade(col, -0.28 + faded * 0.15)); g.addColorStop(0.56, shade(col, 0.06)); g.addColorStop(1, shade(col, -0.5));
  return g;
}
function glass(c, s, y0, y1, dark = 0) {
  const g = c.createLinearGradient(0, y0 * s, 0, y1 * s);
  g.addColorStop(0, dark ? '#8fa6bd' : '#e3f0fb'); g.addColorStop(0.45, dark ? '#3a4f63' : '#6d8fb2'); g.addColorStop(1, dark ? '#141d26' : '#22354a');
  return g;
}
function chrome(c, s, y0, y1, dull = 0) {
  const g = c.createLinearGradient(0, y0 * s, 0, y1 * s);
  g.addColorStop(0, dull ? '#b9b4a8' : '#ffffff'); g.addColorStop(0.45, dull ? '#8c877b' : '#aeb5bc'); g.addColorStop(0.55, dull ? '#5e5a52' : '#5b636b'); g.addColorStop(1, dull ? '#a39d90' : '#dfe3e7');
  return g;
}
function fillStroke(c, path, fill, stroke = INK, w = 1.2) { c.fillStyle = fill; c.fill(path); if (stroke) { c.strokeStyle = stroke; c.lineWidth = w; c.stroke(path); } }
function line(c, s, pts, col, w) { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x * s, y * s) : c.moveTo(x * s, y * s)); c.stroke(); }
function ell(c, s, x, y, rx, ry, fill, rot = 0) { c.fillStyle = fill; c.beginPath(); c.ellipse(x * s, y * s, rx * s, ry * s, rot, 0, 7); c.fill(); }
// Repeatable "random" numbers so each picture comes out the same every time.
function rng(seed) { let x = seed; return () => { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646; }; }
// Rust: a brown stain bleeding out from the edge, flaking paint and pitted specks, inside `clip`.
function rust(c, s, clip, spots, seed) {
  const r = rng(seed);
  c.save(); c.clip(clip);
  for (const [x, y, size] of spots) {
    const g = c.createRadialGradient(x * s, (y + size * 0.3) * s, 0, x * s, y * s, size * s);         // the stain
    g.addColorStop(0, 'rgba(110,52,18,0.75)'); g.addColorStop(0.55, 'rgba(140,72,30,0.4)'); g.addColorStop(1, 'rgba(140,72,30,0)');
    c.fillStyle = g; c.beginPath(); c.ellipse(x * s, y * s, size * 1.3 * s, size * 0.75 * s, 0, 0, 7); c.fill();
    for (let i = 0; i < 40; i++) {                                                                       // specks and flakes
      const a = r() * PI * 2, d = Math.pow(r(), 0.7) * size, px = (x + Math.cos(a) * d * 1.3) * s, py = (y + Math.sin(a) * d * 0.7) * s;
      c.fillStyle = r() < 0.5 ? 'rgba(74,32,10,0.8)' : r() < 0.6 ? 'rgba(168,92,38,0.75)' : 'rgba(205,140,90,0.5)';
      c.beginPath(); c.arc(px, py, (0.0015 + r() * 0.004) * s, 0, 7); c.fill();
    }
    c.strokeStyle = 'rgba(90,40,14,0.45)'; c.lineWidth = 1;                                             // streaks running down
    for (let i = 0; i < 4; i++) { const px = (x + (r() - 0.5) * size * 1.6) * s; c.beginPath(); c.moveTo(px, (y - size * 0.2) * s); c.lineTo(px + 0.5, (y + size * 0.6) * s); c.stroke(); }
  }
  c.restore();
}
// A dent: a dark hollow with a bright rim catching the light.
function dent(c, s, x, y, w, h) {
  const g = c.createRadialGradient(x * s, (y + h * 0.2) * s, 0, x * s, y * s, w * s);
  g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(0.6, 'rgba(0,0,0,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.beginPath(); c.ellipse(x * s, y * s, w * s, h * s, 0, 0, 7); c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1.2; c.beginPath(); c.ellipse(x * s, y * s, w * s * 0.9, h * s * 0.9, 0, PI * 1.1, PI * 1.7); c.stroke();
}
// The dark wheel well behind each wheel.
function well(c, s, x, r, R) { const g = c.createRadialGradient(x * s, -r * s, r * 0.5 * s, x * s, -r * s, R * s); g.addColorStop(0, '#050505'); g.addColorStop(1, '#202020'); c.fillStyle = g; c.beginPath(); c.arc(x * s, -r * s, R * s, PI, 0); c.lineTo((x + R) * s, -r * 0.5 * s); c.lineTo((x - R) * s, -r * 0.5 * s); c.fill(); }

// A wheel: rubber tyre with sidewall shading and tread, and a rim in one of several styles, turned by `ang`.
function wheel(c, s, x, r, ang, style) {
  const cx = x * s, cy = -r * s, R = r * s;
  const tg = c.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.2, cx, cy, R);
  tg.addColorStop(0, '#454545'); tg.addColorStop(0.7, '#202020'); tg.addColorStop(1, '#0c0c0c');
  c.fillStyle = tg; c.beginPath(); c.arc(cx, cy, R, 0, 7); c.fill();
  c.save(); c.translate(cx, cy); c.rotate(ang);
  const mud = style === 'jeep', n = mud ? 14 : 22;
  c.fillStyle = '#080808';
  for (let i = 0; i < n; i++) {                                                    // tread blocks round the edge
    c.save(); c.rotate(i / n * PI * 2);
    if (mud) c.fillRect(R * 0.86, -R * 0.1, R * 0.18, R * 0.2); else c.fillRect(R * 0.9, -R * 0.03, R * 0.1, R * 0.06);
    c.restore();
  }
  c.strokeStyle = 'rgba(255,255,255,0.07)'; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, R * 0.8, 0, 7); c.stroke();   // sidewall
  const rimR = R * (style === 'jeep' ? 0.6 : style === 'rusty' || style === 'hubcap' || style === 'bare' ? 0.58 : 0.68);
  const rg = c.createRadialGradient(-rimR * 0.3, -rimR * 0.3, 0, 0, 0, rimR);
  if (style === 'jeep') {                                                          // black steel wheel with round holes
    rg.addColorStop(0, '#5a5f66'); rg.addColorStop(1, '#16181b'); c.fillStyle = rg; c.beginPath(); c.arc(0, 0, rimR, 0, 7); c.fill();
    c.fillStyle = '#050505'; for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2; c.beginPath(); c.arc(Math.cos(a) * rimR * 0.6, Math.sin(a) * rimR * 0.6, rimR * 0.17, 0, 7); c.fill(); }
    c.fillStyle = '#9aa0a6'; for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2 + 0.6; c.beginPath(); c.arc(Math.cos(a) * rimR * 0.28, Math.sin(a) * rimR * 0.28, rimR * 0.05, 0, 7); c.fill(); }
  } else if (style === 'rusty' || style === 'bare') {                              // dull steel wheel, no hubcap, rust
    rg.addColorStop(0, '#c9c3b5'); rg.addColorStop(1, '#6b665d'); c.fillStyle = rg; c.beginPath(); c.arc(0, 0, rimR, 0, 7); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, rimR * 0.72, 0, 7); c.stroke();
    for (const [a, d, k] of [[0.5, 0.5, 0.25], [2.4, 0.7, 0.2], [4.3, 0.4, 0.3]]) { c.fillStyle = 'rgba(140,70,25,0.7)'; c.beginPath(); c.arc(Math.cos(a) * rimR * d, Math.sin(a) * rimR * d, rimR * k, 0, 7); c.fill(); }
    c.fillStyle = '#3d3a35'; c.beginPath(); c.arc(0, 0, rimR * 0.3, 0, 7); c.fill();
    c.fillStyle = '#8a8478'; for (let i = 0; i < (style === 'bare' ? 4 : 5); i++) { const a = i / (style === 'bare' ? 4 : 5) * PI * 2; c.beginPath(); c.arc(Math.cos(a) * rimR * 0.2, Math.sin(a) * rimR * 0.2, rimR * 0.06, 0, 7); c.fill(); }
  } else if (style === 'hubcap') {                                                 // VW: cream steel wheel and a domed chrome hubcap
    rg.addColorStop(0, '#efe6cf'); rg.addColorStop(1, '#a89e85'); c.fillStyle = rg; c.beginPath(); c.arc(0, 0, rimR, 0, 7); c.fill();
    const hc = c.createRadialGradient(-rimR * 0.2, -rimR * 0.25, 0, 0, 0, rimR * 0.62); hc.addColorStop(0, '#ffffff'); hc.addColorStop(0.5, '#b8bfc6'); hc.addColorStop(1, '#5b636b');
    c.fillStyle = hc; c.beginPath(); c.arc(0, 0, rimR * 0.62, 0, 7); c.fill();
  } else {                                                                         // alloy wheels with spokes
    const spokes = style === 'alloy10' ? 10 : style === 'alloy7' ? 7 : 5, dark = style === 'alloy10';
    c.fillStyle = '#151515'; c.beginPath(); c.arc(0, 0, rimR, 0, 7); c.fill();
    const sg = c.createRadialGradient(-rimR * 0.3, -rimR * 0.3, 0, 0, 0, rimR); sg.addColorStop(0, dark ? '#8a9097' : '#ffffff'); sg.addColorStop(1, dark ? '#2f3338' : '#9ba3ab');
    c.fillStyle = sg;
    for (let i = 0; i < spokes; i++) {
      c.save(); c.rotate(i / spokes * PI * 2);
      const w0 = rimR * (spokes === 10 ? 0.07 : 0.14), w1 = rimR * (spokes === 10 ? 0.1 : 0.22);
      c.beginPath(); c.moveTo(-w0, 0); c.lineTo(-w1, -rimR * 0.95); c.lineTo(w1, -rimR * 0.95); c.lineTo(w0, 0); c.fill();
      c.restore();
    }
    c.strokeStyle = sg; c.lineWidth = rimR * 0.1; c.beginPath(); c.arc(0, 0, rimR * 0.95, 0, 7); c.stroke();
    c.fillStyle = dark ? '#1c1e21' : '#c9ced3'; c.beginPath(); c.arc(0, 0, rimR * 0.2, 0, 7); c.fill();
    c.fillStyle = '#3a3f45'; for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2; c.beginPath(); c.arc(Math.cos(a) * rimR * 0.13, Math.sin(a) * rimR * 0.13, rimR * 0.035, 0, 7); c.fill(); }
  }
  c.restore();
  // brake shadow and the upper half of the tyre in the shade of the arch
  const sh = c.createLinearGradient(0, cy - R, 0, cy + R * 0.2); sh.addColorStop(0, 'rgba(0,0,0,0.45)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = sh; c.beginPath(); c.arc(cx, cy, R, 0, 7); c.fill();
}
function groundShadow(c, s, x0, x1) {
  const cx = (x0 + x1) / 2 * s, rx = (x1 - x0) / 2 * s;
  const g = c.createRadialGradient(cx, 0, 0, cx, 0, rx); g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(0.8, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.beginPath(); c.ellipse(cx, 0, rx, 0.03 * s, 0, 0, 7); c.fill();
}
// Shared small parts
function headlight(c, s, x, y, rx, ry, rot = 0) {
  const g = c.createRadialGradient((x - rx * 0.3) * s, (y - ry * 0.3) * s, 0, x * s, y * s, Math.max(rx, ry) * s);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#e8f1f8'); g.addColorStop(1, '#8796a3');
  c.fillStyle = g; c.beginPath(); c.ellipse(x * s, y * s, rx * s, ry * s, rot, 0, 7); c.fill(); c.strokeStyle = INK; c.lineWidth = 1; c.stroke();
}
function taillight(c, s, path) {
  c.fillStyle = '#c3121b'; c.fill(path); c.strokeStyle = INK; c.lineWidth = 1; c.stroke(path);
}
function handle(c, s, x, y, w = 0.03) { c.fillStyle = chrome(c, s, y - 0.006, y + 0.006); c.fillRect(x * s, (y - 0.005) * s, w * s, 0.01 * s); c.strokeStyle = INK; c.lineWidth = 0.8; c.strokeRect(x * s, (y - 0.005) * s, w * s, 0.01 * s); }
function seam(c, s, pts) { line(c, s, pts, 'rgba(0,0,0,0.45)', 1.2); }
function mirror(c, s, x, y, col) { const p = P(s, [['M', x, y], ['L', x + 0.012, y - 0.028], ['Q', x + 0.04, y - 0.034, x + 0.042, y - 0.018], ['L', x + 0.03, y], ['Z']]); fillStroke(c, p, col); }

// A face in profile, looking towards +x: used for the drivers.
function profileHead(c, s, x, y, r, skin) {
  const g = c.createRadialGradient((x + r * 0.2) * s, (y - r * 0.3) * s, 0, x * s, y * s, r * 1.2 * s);
  g.addColorStop(0, shade(skin, 0.15)); g.addColorStop(1, shade(skin, -0.2));
  const p = P(s, [['M', x - r * 0.9, y + r * 0.2], ['Q', x - r * 1.0, y - r * 1.0, x + r * 0.1, y - r * 1.0], ['Q', x + r * 0.85, y - r * 0.95, x + r * 0.9, y - r * 0.2],
    ['L', x + r * 1.12, y + r * 0.12], ['L', x + r * 0.92, y + r * 0.22], ['Q', x + r * 0.95, y + r * 0.55, x + r * 0.8, y + r * 0.72], ['Q', x + r * 0.4, y + r * 1.0, x - r * 0.05, y + r * 0.85],
    ['Q', x - r * 0.5, y + r * 0.7, x - r * 0.9, y + r * 0.2], ['Z']]);
  fillStroke(c, p, g, shade(skin, -0.45), 1);
  ell(c, s, x - r * 0.15, y + r * 0.05, r * 0.16, r * 0.24, shade(skin, -0.12));                  // ear
  return p;
}

// ---------------------------------------------------------------- the cars
// Each: len/height for the game, wheels [x, r], R arch radius, speed multiplier, colours, rim, body painter,
// and live extras. Coordinates in character heights; the car faces +x.
export const VEHICLES = {
  porsche: { name:'sports car', w:1.05, h:0.34, mul:1.3, wheels:[[-0.33, 0.075], [0.29, 0.075]], R:0.092, boxes:[[-0.42, 0.42, 0.15], [-0.26, 0.08, 0.27]], rim:'alloy5',
    colours:['#c8102e', '#b8bcc2', '#16181c', '#f2f2ef', '#f4c20d', '#1f4fa3'] },
  mustang: { name:'muscle car', w:1.1, h:0.35, mul:1.2, wheels:[[-0.33, 0.08], [0.34, 0.08]], R:0.098, boxes:[[-0.46, 0.46, 0.17], [-0.3, 0.04, 0.29]], rim:'alloy10',
    colours:['#1b5fae', '#b3121b', '#121315', '#f5c400', '#e8590c', '#e9ecef'] },
  miata:   { name:'convertible', w:0.95, h:0.33, mul:1.1, wheels:[[-0.29, 0.07], [0.28, 0.07]], R:0.086, boxes:[[-0.4, 0.4, 0.17], [-0.12, 0.08, 0.24]], rim:'alloy7',
    colours:['#a8101a', '#eef0f2', '#1d4e89', '#8e959c', '#2b2d31'] },
  jeep:    { name:'jeep', w:0.98, h:0.46, mul:1.0, wheels:[[-0.29, 0.095], [0.3, 0.095]], R:0.11, boxes:[[-0.34, 0.39, 0.2], [-0.34, 0.11, 0.39]], rim:'jeep',
    colours:['#4b5320', '#e8590c', '#1b1d21', '#f1f3f5', '#b02a2a', '#1864ab'] },
  pickup:  { name:'old pickup', w:1.25, h:0.47, size:0.8, mul:0.97, wheels:[[-0.36, 0.085], [0.38, 0.085]], R:0.102, boxes:[[-0.47, 0.47, 0.27], [0.02, 0.2, 0.4]], rim:'rusty',
    colours:['#5b7da0', '#8c3b32', '#a68a5b', '#56704a'] },
  beetle:  { name:'old Beetle', w:0.9, h:0.39, mul:0.85, wheels:[[-0.25, 0.07], [0.27, 0.07]], R:0.088, boxes:[[-0.31, 0.31, 0.2], [-0.22, 0.1, 0.33]], rim:'hubcap',
    colours:['#8aa37a', '#c9b98a', '#7d97b0'] },
};

// ---- Porsche 911: low, a sloping fastback roof, wide rear haunches, headlamps up on the front wings, rear wing raised
function paintPorsche(c, s, col) {
  const V = VEHICLES.porsche;
  for (const [x, r] of V.wheels) well(c, s, x, r, V.R);
  const body = P(s, [['M', -0.52, -0.055], ['L', -0.422, -0.055], ['A', -0.33, -0.075, 0.092, PI, 0], ['L', 0.198, -0.055], ['A', 0.29, -0.075, 0.092, PI, 0],
    ['L', 0.5, -0.05], ['Q', 0.534, -0.058, 0.531, -0.088], ['Q', 0.527, -0.113, 0.495, -0.122], ['Q', 0.44, -0.16, 0.36, -0.17], ['L', 0.17, -0.19],
    ['Q', 0.1, -0.235, 0.03, -0.305], ['Q', -0.04, -0.333, -0.13, -0.322], ['C', -0.26, -0.31, -0.4, -0.245, -0.47, -0.205], ['Q', -0.52, -0.19, -0.532, -0.15],
    ['L', -0.534, -0.085], ['Q', -0.535, -0.058, -0.52, -0.055], ['Z']]);
  fillStroke(c, body, paint(c, s, col, -0.33, -0.05), INK, 1.5);
  c.save(); c.clip(body);
  const hi = c.createLinearGradient(0, -0.2 * s, 0, -0.15 * s); hi.addColorStop(0, 'rgba(255,255,255,0)'); hi.addColorStop(0.5, 'rgba(255,255,255,0.38)'); hi.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = hi; c.fillRect(-0.55 * s, -0.2 * s, 1.1 * s, 0.05 * s);
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(-0.55 * s, -0.085 * s, 1.1 * s, 0.04 * s);                            // dark sill
  c.restore();
  const g = P(s, [['M', 0.15, -0.196], ['Q', 0.09, -0.24, 0.026, -0.296], ['Q', -0.04, -0.316, -0.12, -0.311], ['C', -0.2, -0.3, -0.27, -0.262, -0.315, -0.215], ['Q', -0.1, -0.2, 0.15, -0.196], ['Z']]);
  fillStroke(c, g, glass(c, s, -0.31, -0.2), '#111', 1.5);
  c.save(); c.clip(g); c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.moveTo(0.02 * s, -0.33 * s); c.lineTo(0.06 * s, -0.33 * s); c.lineTo(-0.02 * s, -0.19 * s); c.lineTo(-0.06 * s, -0.19 * s); c.fill();
  ell(c, s, -0.03, -0.24, 0.025, 0.03, 'rgba(10,15,20,0.5)'); c.restore();                                      // a dim driver
  line(c, s, [[-0.11, -0.31], [-0.125, -0.2]], '#111', 0.012 * s);                                            // B pillar
  seam(c, s, [[0.155, -0.19], [0.165, -0.06]]); seam(c, s, [[-0.15, -0.205], [-0.16, -0.07]]); seam(c, s, [[-0.15, -0.205], [0.155, -0.19]]);
  handle(c, s, -0.12, -0.165, 0.035); mirror(c, s, 0.13, -0.195, shade(col, -0.1));
  headlight(c, s, 0.445, -0.148, 0.026, 0.016, -0.45);
  ell(c, s, 0.52, -0.095, 0.008, 0.01, '#ffa94d');
  taillight(c, s, P(s, [['M', -0.5, -0.19], ['L', -0.533, -0.17], ['L', -0.533, -0.14], ['L', -0.505, -0.155], ['Z']]));
  for (let i = 0; i < 5; i++) line(c, s, [[-0.44 + i * 0.012, -0.225 + i * 0.004], [-0.47 + i * 0.012, -0.205 + i * 0.004]], 'rgba(0,0,0,0.5)', 1.2);   // engine grille
  const wing = P(s, [['M', -0.54, -0.245], ['L', -0.42, -0.237], ['L', -0.42, -0.226], ['L', -0.54, -0.232], ['Z']]);
  line(c, s, [[-0.5, -0.232], [-0.495, -0.212]], '#222', 2.5); line(c, s, [[-0.45, -0.23], [-0.45, -0.218]], '#222', 2.5);
  fillStroke(c, wing, paint(c, s, col, -0.245, -0.225));
  for (const y of [-0.068, -0.058]) ell(c, s, -0.525, y, 0.008, 0.005, '#c9ced3');                                // twin pipes
}

// ---- Ford Mustang: long hood, shark nose, steeply raked fastback, ducktail, tri-bar tail lights, racing stripes
function paintMustang(c, s, col) {
  const V = VEHICLES.mustang, stripe = col === '#e9ecef' || col === '#f5c400' ? '#121315' : '#f1f3f5';
  for (const [x, r] of V.wheels) well(c, s, x, r, V.R);
  const body = P(s, [['M', -0.545, -0.06], ['L', -0.428, -0.06], ['A', -0.33, -0.08, 0.098, PI, 0], ['L', 0.242, -0.06], ['A', 0.34, -0.08, 0.098, PI, 0],
    ['L', 0.53, -0.06], ['Q', 0.565, -0.075, 0.56, -0.12], ['L', 0.566, -0.163], ['Q', 0.55, -0.188, 0.5, -0.192], ['Q', 0.33, -0.206, 0.14, -0.215],
    ['Q', 0.06, -0.27, -0.01, -0.325], ['Q', -0.07, -0.347, -0.15, -0.336], ['C', -0.27, -0.31, -0.39, -0.262, -0.45, -0.246], ['L', -0.532, -0.247],
    ['Q', -0.556, -0.236, -0.55, -0.19], ['L', -0.556, -0.1], ['Q', -0.56, -0.064, -0.545, -0.06], ['Z']]);
  fillStroke(c, body, paint(c, s, col, -0.34, -0.06), INK, 1.5);
  c.save(); c.clip(body);
  c.fillStyle = stripe; c.fillRect(-0.6 * s, -0.098 * s, 1.2 * s, 0.012 * s); c.fillRect(-0.6 * s, -0.08 * s, 1.2 * s, 0.006 * s);   // side stripes
  const hi = c.createLinearGradient(0, -0.2 * s, 0, -0.16 * s); hi.addColorStop(0, 'rgba(255,255,255,0)'); hi.addColorStop(0.5, 'rgba(255,255,255,0.35)'); hi.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = hi; c.fillRect(-0.6 * s, -0.2 * s, 1.2 * s, 0.04 * s);
  c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(-0.6 * s, -0.072 * s, 1.2 * s, 0.02 * s);
  c.restore();
  // racing stripes over the top of the car, seen along its roofline
  c.save(); c.clip(body); c.strokeStyle = stripe; c.lineWidth = 0.014 * s;
  c.beginPath(); c.moveTo(0.56 * s, -0.175 * s); c.quadraticCurveTo(0.33 * s, -0.2 * s, 0.14 * s, -0.209 * s); c.stroke();
  c.beginPath(); c.moveTo(-0.15 * s, -0.33 * s); c.bezierCurveTo(-0.27 * s, -0.305 * s, -0.39 * s, -0.256 * s, -0.45 * s, -0.24 * s); c.stroke(); c.restore();
  const g = P(s, [['M', 0.12, -0.216], ['Q', 0.05, -0.266, -0.006, -0.315], ['Q', -0.06, -0.33, -0.146, -0.325], ['C', -0.24, -0.305, -0.32, -0.27, -0.37, -0.247], ['Q', -0.1, -0.226, 0.12, -0.216], ['Z']]);
  fillStroke(c, g, glass(c, s, -0.33, -0.22, 1), '#0b0b0b', 1.5);
  c.save(); c.clip(g); c.fillStyle = 'rgba(255,255,255,0.25)'; c.beginPath(); c.moveTo(0.0, -0.34 * s); c.lineTo(0.04 * s, -0.34 * s); c.lineTo(-0.05 * s, -0.21 * s); c.lineTo(-0.09 * s, -0.21 * s); c.fill(); c.restore();
  line(c, s, [[-0.14, -0.325], [-0.16, -0.225]], '#0b0b0b', 0.012 * s);
  seam(c, s, [[0.125, -0.21], [0.135, -0.065]]); seam(c, s, [[-0.17, -0.225], [-0.18, -0.07]]); seam(c, s, [[-0.17, -0.225], [0.125, -0.212]]);
  handle(c, s, -0.13, -0.18, 0.035); mirror(c, s, 0.1, -0.215, col);
  fillStroke(c, P(s, [['M', -0.27, -0.16], ['L', -0.21, -0.15], ['L', -0.22, -0.125], ['Z']]), 'rgba(0,0,0,0.6)', null);   // side scoop
  for (const x of [0.3, 0.34]) line(c, s, [[x, -0.203], [x + 0.025, -0.201]], 'rgba(0,0,0,0.7)', 2);              // hood vents
  headlight(c, s, 0.54, -0.168, 0.03, 0.01, -0.25);
  fillStroke(c, P(s, [['M', 0.53, -0.07], ['L', 0.562, -0.08], ['L', 0.562, -0.12], ['L', 0.535, -0.115], ['Z']]), '#141414', null);   // lower grille
  for (let i = 0; i < 3; i++) taillight(c, s, P(s, [['M', -0.549 + i * 0.0, -0.228 + i * 0.02], ['L', -0.556, -0.228 + i * 0.02], ['L', -0.556, -0.214 + i * 0.02], ['L', -0.548, -0.214 + i * 0.02], ['Z']]));
  for (const y of [-0.072, -0.062]) { ell(c, s, -0.548, y, 0.009, 0.005, '#d0d4d8'); ell(c, s, -0.548, y, 0.005, 0.003, '#222'); }
}

// ---- Mazda MX-5 Miata: small, round and open, with a blonde woman at the wheel in sunglasses
function paintMiata(c, s, col) {
  const V = VEHICLES.miata;
  for (const [x, r] of V.wheels) well(c, s, x, r, V.R);
  // seat, driver's body and arm (the door hides her lower half)
  fillStroke(c, P(s, [['M', -0.16, -0.2], ['Q', -0.17, -0.29, -0.135, -0.3], ['L', -0.115, -0.3], ['L', -0.1, -0.2], ['Z']]), '#2b2b2b');   // seat back
  const top = c.createLinearGradient(-0.12 * s, 0, -0.05 * s, 0); top.addColorStop(0, '#c2255c'); top.addColorStop(1, '#f06595');
  fillStroke(c, P(s, [['M', -0.125, -0.2], ['Q', -0.13, -0.27, -0.1, -0.285], ['Q', -0.075, -0.292, -0.055, -0.275], ['L', -0.04, -0.2], ['Z']]), top);
  const skin = '#f3c9a8';
  c.lineCap = 'round'; line(c, s, [[-0.07, -0.268], [-0.02, -0.238], [0.025, -0.245]], shade(skin, -0.4), 0.017 * s); line(c, s, [[-0.07, -0.268], [-0.02, -0.238], [0.025, -0.245]], skin, 0.012 * s);
  fillStroke(c, P(s, [['M', -0.088, -0.282], ['L', -0.088, -0.3], ['L', -0.07, -0.3], ['L', -0.068, -0.282], ['Z']]), skin, null);   // neck
  profileHead(c, s, -0.075, -0.322, 0.03, skin);
  ell(c, s, -0.051, -0.326, 0.014, 0.006, '#151515'); line(c, s, [[-0.075, -0.327], [-0.06, -0.327]], '#151515', 1.2);   // sunglasses
  ell(c, s, -0.048, -0.304, 0.008, 0.003, '#c2252d');                                                          // lips
  ell(c, s, -0.09, -0.316, 0.003, 0.003, '#ffd43b');                                                           // earring
  // the hair on her head (the flowing part is drawn live, blowing in the wind)
  const hg = c.createLinearGradient(0, -0.36 * s, 0, -0.3 * s); hg.addColorStop(0, '#fff3bf'); hg.addColorStop(1, '#e0b84a');
  fillStroke(c, P(s, [['M', -0.108, -0.31], ['Q', -0.11, -0.358, -0.07, -0.356], ['Q', -0.042, -0.354, -0.042, -0.336], ['Q', -0.07, -0.345, -0.085, -0.33], ['Q', -0.095, -0.31, -0.1, -0.29], ['Z']]), hg, '#b8902e', 1);
  // steering wheel
  c.strokeStyle = '#1a1a1a'; c.lineWidth = 0.008 * s; c.beginPath(); c.ellipse(0.03 * s, -0.24 * s, 0.008 * s, 0.03 * s, 0.3, 0, 7); c.stroke();
  const body = P(s, [['M', -0.47, -0.05], ['L', -0.376, -0.05], ['A', -0.29, -0.07, 0.086, PI, 0], ['L', 0.194, -0.05], ['A', 0.28, -0.07, 0.086, PI, 0],
    ['L', 0.46, -0.05], ['Q', 0.49, -0.06, 0.488, -0.1], ['Q', 0.486, -0.145, 0.43, -0.16], ['Q', 0.3, -0.19, 0.14, -0.2], ['L', 0.08, -0.205],
    ['L', -0.17, -0.203], ['Q', -0.2, -0.21, -0.225, -0.214], ['Q', -0.38, -0.216, -0.45, -0.19], ['Q', -0.485, -0.17, -0.482, -0.12], ['L', -0.477, -0.07], ['Q', -0.476, -0.05, -0.47, -0.05], ['Z']]);
  fillStroke(c, body, paint(c, s, col, -0.22, -0.05), INK, 1.5);
  c.save(); c.clip(body);
  const hi = c.createLinearGradient(0, -0.18 * s, 0, -0.14 * s); hi.addColorStop(0, 'rgba(255,255,255,0)'); hi.addColorStop(0.5, 'rgba(255,255,255,0.4)'); hi.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = hi; c.fillRect(-0.5 * s, -0.18 * s, 1 * s, 0.04 * s); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(-0.5 * s, -0.07 * s, 1 * s, 0.025 * s);
  c.restore();
  line(c, s, [[-0.17, -0.203], [0.08, -0.205]], '#1a1a1a', 2);                                                 // cockpit rim
  for (const x of [-0.16, -0.19]) { c.strokeStyle = '#2b2b2b'; c.lineWidth = 0.008 * s; c.beginPath(); c.moveTo(x * s, -0.205 * s); c.quadraticCurveTo((x - 0.005) * s, -0.26 * s, (x - 0.025) * s, -0.258 * s); c.stroke(); }   // roll hoops
  // windscreen: a thin black frame and lightly tinted glass
  const ws = P(s, [['M', 0.14, -0.2], ['L', 0.05, -0.312], ['L', 0.035, -0.31], ['L', 0.115, -0.2], ['Z']]);
  c.globalAlpha = 0.8; fillStroke(c, ws, glass(c, s, -0.31, -0.2), null); c.globalAlpha = 1;
  line(c, s, [[0.14, -0.2], [0.05, -0.313], [0.03, -0.311]], '#151515', 0.013 * s);
  seam(c, s, [[0.075, -0.2], [0.085, -0.06]]); seam(c, s, [[-0.165, -0.2], [-0.17, -0.065]]); handle(c, s, -0.13, -0.175, 0.03);
  mirror(c, s, 0.07, -0.2, col);
  headlight(c, s, 0.45, -0.148, 0.035, 0.011, -0.2);
  taillight(c, s, P(s, [['M', -0.455, -0.188], ['L', -0.483, -0.165], ['L', -0.483, -0.14], ['L', -0.458, -0.16], ['Z']]));
  ell(c, s, -0.47, -0.062, 0.008, 0.005, '#c9ced3');
}
// Her long blonde hair streaming back, rippling in the wind.
function hairMiata(c, s, t) {
  const g = c.createLinearGradient(-0.25 * s, 0, -0.08 * s, 0); g.addColorStop(0, 'rgba(240,210,120,0.6)'); g.addColorStop(0.4, '#f3d77a'); g.addColorStop(1, '#fff0b3');
  for (let k = 0; k < 4; k++) {
    const w = (i) => Math.sin(t / 70 + i * 1.7 + k) * 0.012;
    const y0 = -0.35 + k * 0.012;
    c.fillStyle = g; c.strokeStyle = 'rgba(170,125,40,0.5)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(-0.1 * s, y0 * s);
    c.bezierCurveTo(-0.14 * s, (y0 - 0.005 + w(1)) * s, -0.19 * s, (y0 + 0.01 + w(2)) * s, (-0.24 + k * 0.01) * s, (y0 + 0.025 + w(3)) * s);
    c.bezierCurveTo(-0.2 * s, (y0 + 0.03 + w(2)) * s, -0.15 * s, (y0 + 0.03 + w(1)) * s, -0.1 * s, (y0 + 0.03) * s);
    c.closePath(); c.fill(); c.stroke();
  }
}

// ---- Jeep Wrangler: boxy tub, flat hood, upright windscreen, black soft top, chunky flares and tyres, spare on the back
function paintJeep(c, s, col) {
  const V = VEHICLES.jeep;
  for (const [x, r] of V.wheels) well(c, s, x, r, V.R);
  // spare tyre on the tailgate, seen edge-on
  const sp = c.createLinearGradient(-0.5 * s, 0, -0.44 * s, 0); sp.addColorStop(0, '#0c0c0c'); sp.addColorStop(0.5, '#3a3a3a'); sp.addColorStop(1, '#151515');
  c.fillStyle = sp; c.beginPath(); c.roundRect ? c.roundRect(-0.5 * s, -0.33 * s, 0.065 * s, 0.19 * s, 0.03 * s) : c.rect(-0.5 * s, -0.33 * s, 0.065 * s, 0.19 * s); c.fill();
  for (let i = 0; i < 7; i++) c.fillRect(-0.505 * s, (-0.32 + i * 0.026) * s, 0.008 * s, 0.014 * s);
  // soft top and its clear side windows
  const top = P(s, [['M', 0.122, -0.45], ['L', -0.385, -0.445], ['Q', -0.43, -0.44, -0.43, -0.4], ['L', -0.43, -0.24], ['L', 0.135, -0.24], ['Z']]);
  const tg = c.createLinearGradient(0, -0.45 * s, 0, -0.24 * s); tg.addColorStop(0, '#3a3a3a'); tg.addColorStop(0.15, '#202020'); tg.addColorStop(1, '#111');
  fillStroke(c, top, tg);
  for (const p of [P(s, [['M', 0.105, -0.425], ['L', -0.1, -0.425], ['L', -0.1, -0.265], ['L', 0.115, -0.265], ['Z']]), P(s, [['M', -0.13, -0.425], ['L', -0.37, -0.42], ['Q', -0.4, -0.415, -0.4, -0.39], ['L', -0.4, -0.29], ['L', -0.13, -0.29], ['Z']])]) {
    fillStroke(c, p, glass(c, s, -0.43, -0.26, 1), '#000', 1.5);
    c.save(); c.clip(p); c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(-0.5 * s, -0.43 * s, 1 * s, 0.04 * s); c.restore();
  }
  ell(c, s, 0.0, -0.335, 0.03, 0.04, 'rgba(10,10,10,0.45)');                                                    // a dim driver
  line(c, s, [[0.12, -0.45], [-0.39, -0.445]], 'rgba(255,255,255,0.12)', 1);
  // windscreen frame (body colour)
  fillStroke(c, P(s, [['M', 0.16, -0.25], ['L', 0.135, -0.455], ['L', 0.115, -0.455], ['L', 0.135, -0.25], ['Z']]), paint(c, s, col, -0.46, -0.25));
  const body = P(s, [['M', -0.435, -0.085], ['L', -0.399, -0.085], ['A', -0.29, -0.095, 0.11, PI, 0], ['L', 0.19, -0.085], ['A', 0.3, -0.095, 0.11, PI, 0],
    ['L', 0.475, -0.085], ['L', 0.482, -0.225], ['Q', 0.477, -0.244, 0.45, -0.246], ['L', 0.16, -0.252], ['L', 0.14, -0.24], ['L', -0.425, -0.24],
    ['Q', -0.44, -0.235, -0.44, -0.22], ['L', -0.44, -0.1], ['Z']]);
  fillStroke(c, body, paint(c, s, col, -0.26, -0.085), INK, 1.5);
  c.save(); c.clip(body); c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(-0.5 * s, -0.24 * s, 1 * s, 0.015 * s); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(-0.5 * s, -0.11 * s, 1 * s, 0.03 * s); c.restore();
  // black fender flares
  for (const [x] of V.wheels) {
    const f = P(s, [['M', x - 0.16, -0.08], ['L', x - 0.105, -0.222], ['L', x + 0.105, -0.222], ['L', x + 0.16, -0.08], ['L', x + 0.11, -0.095], ['A', x, -0.095, 0.11, 0, PI, true], ['Z']]);
    const fg = c.createLinearGradient(0, -0.22 * s, 0, -0.08 * s); fg.addColorStop(0, '#3b3d40'); fg.addColorStop(1, '#141516');
    fillStroke(c, f, fg);
  }
  // door with exposed hinges, handle, mirror; hood latch; round headlamp; bumpers; rock rail; tail light
  seam(c, s, [[0.135, -0.24], [0.13, -0.11]]); seam(c, s, [[-0.12, -0.24], [-0.125, -0.11]]); seam(c, s, [[-0.125, -0.11], [0.13, -0.11]]);
  for (const y of [-0.215, -0.14]) { c.fillStyle = '#1a1a1a'; c.fillRect(0.128 * s, y * s, 0.02 * s, 0.018 * s); }
  handle(c, s, -0.1, -0.21, 0.03); mirror(c, s, 0.12, -0.27, '#1a1a1a');
  fillStroke(c, P(s, [['M', 0.42, -0.25], ['L', 0.44, -0.25], ['L', 0.44, -0.225], ['L', 0.42, -0.225], ['Z']]), '#111', null);
  headlight(c, s, 0.477, -0.2, 0.01, 0.032);
  fillStroke(c, P(s, [['M', 0.45, -0.12], ['L', 0.53, -0.12], ['L', 0.53, -0.075], ['L', 0.45, -0.075], ['Z']]), '#1d1e20');
  fillStroke(c, P(s, [['M', -0.47, -0.12], ['L', -0.42, -0.12], ['L', -0.42, -0.08], ['L', -0.47, -0.08], ['Z']]), '#1d1e20');
  fillStroke(c, P(s, [['M', -0.18, -0.09], ['L', 0.18, -0.09], ['L', 0.18, -0.07], ['L', -0.18, -0.07], ['Z']]), '#1d1e20');
  taillight(c, s, P(s, [['M', -0.445, -0.2], ['L', -0.43, -0.2], ['L', -0.43, -0.15], ['L', -0.445, -0.15], ['Z']]));
}

// ---- Old Ford pickup: square-body cab and long hood, the bed behind, faded two-tone paint, rust, dents,
// a cracked tail light, and a bearded man in a cap with his elbow out of the open window
function paintPickup(c, s, col) {
  const V = VEHICLES.pickup, cream = '#ddd3bd';
  for (const [x, r] of V.wheels) well(c, s, x, r, V.R);
  const cab = P(s, [['M', 0.0, -0.075], ['L', 0.278, -0.075], ['A', 0.38, -0.09, 0.102, PI, 0], ['L', 0.6, -0.075], ['L', 0.606, -0.29],
    ['Q', 0.602, -0.306, 0.582, -0.306], ['L', 0.28, -0.31], ['L', 0.24, -0.316], ['L', 0.185, -0.47], ['L', 0.012, -0.47], ['Q', 0.0, -0.47, 0.0, -0.455], ['Z']]);
  const bed = P(s, [['M', -0.62, -0.075], ['L', -0.462, -0.075], ['A', -0.36, -0.09, 0.102, PI, 0], ['L', -0.012, -0.075], ['L', -0.012, -0.305], ['L', -0.62, -0.305], ['Z']]);
  for (const p of [bed, cab]) {
    fillStroke(c, p, paint(c, s, col, -0.47, -0.075, 1), INK, 1.5);
    c.save(); c.clip(p);
    c.fillStyle = cream; c.fillRect(-0.7 * s, -0.205 * s, 1.4 * s, 0.065 * s);                                    // two-tone band
    c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(-0.7 * s, -0.145 * s, 1.4 * s, 0.006 * s);
    const chalk = rng(7); c.fillStyle = 'rgba(255,255,255,0.07)';                                                 // chalky, sun-faded paint
    for (let i = 0; i < 160; i++) { c.beginPath(); c.arc((chalk() * 1.3 - 0.65) * s, (-0.47 + chalk() * 0.4) * s, (0.004 + chalk() * 0.012) * s, 0, 7); c.fill(); }
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(-0.7 * s, -0.1 * s, 1.4 * s, 0.03 * s);
    c.restore();
    line(c, s, [[-0.62, -0.207], [0.6, -0.207]], chrome(c, s, -0.21, -0.2, 1), 2);                                // trim strips
  }
  // bed rail, stake pockets, tailgate with a dent
  fillStroke(c, P(s, [['M', -0.625, -0.318], ['L', -0.008, -0.318], ['L', -0.008, -0.302], ['L', -0.625, -0.302], ['Z']]), shade(col, 0.15));
  for (const x of [-0.58, -0.32, -0.06]) { c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(x * s, -0.316 * s, 0.018 * s, 0.01 * s); }
  seam(c, s, [[-0.6, -0.3], [-0.6, -0.08]]);
  dent(c, s, -0.47, -0.24, 0.05, 0.025); dent(c, s, -0.2, -0.13, 0.04, 0.02);
  // primer patch on the front wing
  c.save(); c.clip(cab); const pr = c.createRadialGradient(0.47 * s, -0.24 * s, 0, 0.47 * s, -0.24 * s, 0.07 * s); pr.addColorStop(0, '#8d8f8a'); pr.addColorStop(0.8, '#8d8f8a'); pr.addColorStop(1, 'rgba(141,143,138,0)');
  c.fillStyle = pr; c.beginPath(); c.ellipse(0.47 * s, -0.245 * s, 0.075 * s, 0.045 * s, 0.2, 0, 7); c.fill(); c.restore();
  // rust round the wheel arches and along the bottoms of the doors and bed
  rust(c, s, cab, [[0.262, -0.1, 0.035], [0.5, -0.105, 0.03], [0.13, -0.085, 0.03]], 11);
  rust(c, s, bed, [[-0.255, -0.1, 0.035], [-0.47, -0.105, 0.03], [-0.6, -0.09, 0.03], [-0.08, -0.085, 0.025]], 23);
  // the open window, with the driver
  const win = P(s, [['M', 0.03, -0.448], ['L', 0.175, -0.448], ['L', 0.215, -0.335], ['L', 0.03, -0.335], ['Z']]);
  c.fillStyle = '#1b1814'; c.fill(win);
  c.save(); c.clip(win);
  const skin = '#d9a77c';
  fillStroke(c, P(s, [['M', 0.04, -0.33], ['Q', 0.05, -0.38, 0.09, -0.385], ['Q', 0.13, -0.385, 0.15, -0.33], ['Z']]), '#9c2a2a');   // plaid shirt
  for (const x of [0.06, 0.09, 0.12]) line(c, s, [[x, -0.385], [x, -0.33]], 'rgba(20,10,10,0.6)', 1.5);
  line(c, s, [[0.04, -0.36], [0.15, -0.36]], 'rgba(20,10,10,0.6)', 1.5);
  profileHead(c, s, 0.1, -0.405, 0.032, skin);
  // beard: full and bushy, from the ear round the jaw
  fillStroke(c, P(s, [['M', 0.086, -0.41], ['Q', 0.11, -0.4, 0.132, -0.402], ['Q', 0.137, -0.38, 0.125, -0.366], ['Q', 0.105, -0.355, 0.085, -0.37], ['Q', 0.075, -0.39, 0.086, -0.41], ['Z']]), '#5a3b22', '#3a2412', 1);
  line(c, s, [[0.118, -0.398], [0.134, -0.399]], '#3a2412', 1.5);                                                // moustache
  ell(c, s, 0.118, -0.414, 0.003, 0.003, '#111');                                                            // eye
  line(c, s, [[0.108, -0.421], [0.124, -0.422]], '#3a2412', 1.5);                                             // brow
  // ball cap with the brim forward
  fillStroke(c, P(s, [['M', 0.067, -0.42], ['Q', 0.07, -0.452, 0.1, -0.453], ['Q', 0.128, -0.452, 0.131, -0.425], ['L', 0.16, -0.42], ['Q', 0.15, -0.413, 0.128, -0.416], ['L', 0.067, -0.416], ['Z']]), '#1d3b6e', '#0d1d38', 1);
  c.restore();
  line(c, s, [[0.03, -0.335], [0.215, -0.335]], chrome(c, s, -0.34, -0.33, 1), 2.5);                              // window sill
  // his elbow and forearm resting on the sill, sticking out of the window
  fillStroke(c, P(s, [['M', 0.07, -0.345], ['L', 0.165, -0.348], ['Q', 0.185, -0.345, 0.185, -0.33], ['Q', 0.183, -0.318, 0.165, -0.318], ['L', 0.07, -0.322], ['Z']]), '#9c2a2a');
  line(c, s, [[0.1, -0.346], [0.1, -0.32]], 'rgba(20,10,10,0.6)', 1.5); line(c, s, [[0.14, -0.347], [0.14, -0.319]], 'rgba(20,10,10,0.6)', 1.5);
  // little vent window and the door
  fillStroke(c, P(s, [['M', 0.182, -0.448], ['L', 0.222, -0.337], ['L', 0.188, -0.337], ['Z']]), glass(c, s, -0.45, -0.34), '#777', 1.5);
  seam(c, s, [[0.24, -0.316], [0.245, -0.08]]); seam(c, s, [[0.02, -0.45], [0.02, -0.08]]); seam(c, s, [[0.02, -0.08], [0.245, -0.08]]);
  handle(c, s, 0.04, -0.3, 0.035);
  // big square mirror on an arm
  line(c, s, [[0.215, -0.36], [0.245, -0.375]], '#999', 2); fillStroke(c, P(s, [['M', 0.235, -0.42], ['L', 0.262, -0.42], ['L', 0.262, -0.36], ['L', 0.235, -0.36], ['Z']]), chrome(c, s, -0.42, -0.36, 1));
  // grille face, headlamp, marker, bumpers (dull, rusty chrome)
  fillStroke(c, P(s, [['M', 0.596, -0.3], ['L', 0.612, -0.3], ['L', 0.612, -0.13], ['L', 0.596, -0.13], ['Z']]), chrome(c, s, -0.3, -0.13, 1));
  headlight(c, s, 0.604, -0.255, 0.007, 0.024);
  ell(c, s, 0.585, -0.19, 0.008, 0.012, '#d9822b');
  fillStroke(c, P(s, [['M', 0.585, -0.128], ['L', 0.645, -0.124], ['L', 0.648, -0.078], ['L', 0.585, -0.082], ['Z']]), chrome(c, s, -0.13, -0.08, 1));
  fillStroke(c, P(s, [['M', -0.665, -0.122], ['L', -0.6, -0.12], ['L', -0.6, -0.08], ['L', -0.668, -0.085], ['Z']]), chrome(c, s, -0.125, -0.08, 1));
  rust(c, s, P(s, [['M', -0.67, -0.13], ['L', -0.6, -0.13], ['L', -0.6, -0.07], ['L', -0.67, -0.07], ['Z']]), [[-0.64, -0.1, 0.02]], 5);
  // cracked tail light, with a piece missing
  const tl = P(s, [['M', -0.618, -0.29], ['L', -0.6, -0.29], ['L', -0.6, -0.2], ['L', -0.618, -0.2], ['Z']]);
  taillight(c, s, tl);
  fillStroke(c, P(s, [['M', -0.618, -0.25], ['L', -0.605, -0.245], ['L', -0.61, -0.225], ['L', -0.618, -0.228], ['Z']]), '#f1ede4', null);
  line(c, s, [[-0.616, -0.285], [-0.606, -0.258], [-0.612, -0.24]], 'rgba(255,255,255,0.85)', 1); line(c, s, [[-0.606, -0.258], [-0.601, -0.27]], 'rgba(255,255,255,0.85)', 1);
}

// ---- Old VW Beetle: rounded body, separate wings with bug-eye headlamps, running boards, faded paint,
// a mismatched front wing, rust, a dent and a primer patch, a bent bumper and one hubcap missing
function paintBeetle(c, s, col) {
  const V = VEHICLES.beetle, wingCol = '#b5574c';
  for (const [x, r] of V.wheels) well(c, s, x, r, V.R);
  const body = P(s, [['M', -0.42, -0.085], ['C', -0.455, -0.2, -0.36, -0.315, -0.2, -0.355], ['Q', -0.05, -0.392, 0.06, -0.362], ['Q', 0.13, -0.33, 0.172, -0.262],
    ['Q', 0.3, -0.222, 0.4, -0.15], ['Q', 0.432, -0.12, 0.422, -0.088], ['L', 0.4, -0.07], ['L', -0.4, -0.07], ['Z']]);
  fillStroke(c, body, paint(c, s, col, -0.39, -0.07, 1), INK, 1.5);
  c.save(); c.clip(body);
  const chalk = rng(3); c.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < 120; i++) { c.beginPath(); c.arc((chalk() * 0.9 - 0.45) * s, (-0.39 + chalk() * 0.32) * s, (0.004 + chalk() * 0.012) * s, 0, 7); c.fill(); }
  c.fillStyle = 'rgba(255,255,255,0.16)'; c.beginPath(); c.ellipse(-0.08 * s, -0.33 * s, 0.25 * s, 0.03 * s, -0.05, 0, 7); c.fill();
  c.restore();
  const g = P(s, [['M', 0.15, -0.258], ['Q', 0.105, -0.33, 0.03, -0.348], ['Q', -0.1, -0.365, -0.2, -0.332], ['Q', -0.295, -0.295, -0.32, -0.242], ['L', 0.15, -0.252], ['Z']]);
  fillStroke(c, g, glass(c, s, -0.36, -0.24), '#333', 1.5);
  c.save(); c.clip(g); c.fillStyle = 'rgba(255,255,255,0.3)'; c.beginPath(); c.moveTo(0.05 * s, -0.37 * s); c.lineTo(0.08 * s, -0.37 * s); c.lineTo(0.0, -0.24 * s); c.lineTo(-0.03 * s, -0.24 * s); c.fill();
  ell(c, s, 0.02, -0.29, 0.026, 0.032, 'rgba(15,15,15,0.45)'); c.restore();
  line(c, s, [[-0.09, -0.36], [-0.1, -0.245]], '#c9ced3', 0.009 * s);                                           // chrome window pillar
  seam(c, s, [[0.155, -0.255], [0.16, -0.09]]); seam(c, s, [[-0.13, -0.25], [-0.135, -0.09]]); handle(c, s, -0.115, -0.22, 0.03);
  dent(c, s, 0.03, -0.17, 0.045, 0.022);
  // primer patch on the door and rust along the bottom
  c.save(); c.clip(body); c.fillStyle = '#8d8f8a'; c.beginPath(); c.ellipse(-0.05 * s, -0.11 * s, 0.05 * s, 0.025 * s, 0.1, 0, 7); c.fill(); c.restore();
  rust(c, s, body, [[-0.36, -0.1, 0.03], [-0.2, -0.08, 0.025]], 17);
  for (let i = 0; i < 5; i++) line(c, s, [[-0.41 + i * 0.008, -0.23 + i * 0.012], [-0.38 + i * 0.008, -0.235 + i * 0.012]], 'rgba(0,0,0,0.55)', 1.5);   // engine lid louvres
  // wings: the front one is a mismatched, faded red
  for (const [x, c0, c1, peak, colr] of [[0.27, 0.13, 0.445, -0.2, wingCol], [-0.25, -0.44, -0.1, -0.215, col]]) {
    const w = P(s, [['M', c0, -0.07], ['C', c0 + 0.03, peak + 0.02, x - 0.05, peak, x, peak], ['C', x + 0.08, peak, c1 - 0.01, peak + 0.06, c1, -0.07],
      ['L', x + 0.088, -0.07], ['A', x, -0.07, 0.088, 0, PI, true], ['Z']]);
    fillStroke(c, w, paint(c, s, colr, peak, -0.07, 1), INK, 1.5);
    rust(c, s, w, [[x - 0.1, -0.085, 0.022], [x + 0.11, -0.085, 0.02]], 29 + Math.round(x * 100));
  }
  // bug-eye headlamp on the front wing, tail lamp on the rear wing
  fillStroke(c, P(s, [['M', 0.36, -0.2], ['L', 0.395, -0.185], ['L', 0.385, -0.16], ['L', 0.35, -0.175], ['Z']]), paint(c, s, wingCol, -0.2, -0.16, 1), INK, 1);
  ell(c, s, 0.4, -0.18, 0.012, 0.024, '#c9ced3', -0.3); headlight(c, s, 0.404, -0.18, 0.008, 0.019, -0.3);
  taillight(c, s, P(s, [['M', -0.4, -0.19], ['L', -0.42, -0.17], ['L', -0.425, -0.145], ['L', -0.405, -0.16], ['Z']]));
  // running board
  fillStroke(c, P(s, [['M', -0.11, -0.078], ['L', 0.14, -0.078], ['L', 0.14, -0.062], ['L', -0.11, -0.062], ['Z']]), '#1c1c1c');
  // bumpers: dull chrome blades, the front one bent
  c.save(); c.translate(0.44 * s, -0.09 * s); c.rotate(0.12);
  fillStroke(c, P(s, [['M', -0.03, -0.012], ['L', 0.04, -0.012], ['L', 0.04, 0.008], ['L', -0.03, 0.008], ['Z']]), chrome(c, s, -0.012, 0.008, 1)); c.restore();
  fillStroke(c, P(s, [['M', -0.47, -0.1], ['L', -0.4, -0.1], ['L', -0.4, -0.08], ['L', -0.47, -0.08], ['Z']]), chrome(c, s, -0.1, -0.08, 1));
  line(c, s, [[-0.43, -0.075], [-0.445, -0.06]], '#555', 2.5);                                                    // tailpipe
}

const PAINTERS = { porsche: paintPorsche, mustang: paintMustang, miata: paintMiata, jeep: paintJeep, pickup: paintPickup, beetle: paintBeetle };

// The painted bodies, kept per car, colour and size.
const sprites = new Map();
function sprite(kind, col, s) {
  const key = `${kind}|${col}|${Math.round(s)}`;
  let e = sprites.get(key);
  if (!e) {
    const V = VEHICLES[kind], dpr = Math.min(2, window.devicePixelRatio || 1), padX = 0.12, top = V.h + 0.08, bot = 0.03;
    const w = (V.w + padX * 2) * s, h = (top + bot) * s, cv = document.createElement('canvas');
    cv.width = Math.ceil(w * dpr); cv.height = Math.ceil(h * dpr);
    const c = cv.getContext('2d'); c.scale(dpr, dpr); c.translate((V.w / 2 + padX) * s, top * s); c.lineJoin = 'round';
    PAINTERS[kind](c, s, col);
    e = { cv, w, h, ox: (V.w / 2 + padX) * s, oy: top * s };
    sprites.set(key, e); if (sprites.size > 40) sprites.delete(sprites.keys().next().value);
  }
  return e;
}
// Everything is painted once ahead of time (per size) so the first car doesn't make the game stutter.
export function preloadVehicles(s) { for (const k of Object.keys(VEHICLES)) for (const col of VEHICLES[k].colours.slice(0, 2)) sprite(k, col, s * (VEHICLES[k].size || 1)); }

// Draw a vehicle. The game has already moved to its centre and turned it to face the way it is going.
export function drawVehicle(c, kind, s0, t, hz) {
  const V = VEHICLES[kind], s = s0 * (V.size || 1), col = (hz && hz.colour) || V.colours[0], speed = V.mul * 3.5;   // character heights per second
  c.save(); c.translate(0, V.h / 2 * s);
  groundShadow(c, s, -V.w * 0.5, V.w * 0.5);
  // exhaust: the old pickup coughs black smoke now and then; the Beetle puffs blue-grey
  if (kind === 'pickup' || kind === 'beetle') {
    const black = kind === 'pickup', period = black ? 2200 : 700, ex = black ? -0.64 : -0.45;
    for (let i = 0; i < 4; i++) {
      const age = ((t + i * period / 4) % period) / period, on = black ? ((t + i * period / 4) % (period * 2)) < period : true;
      if (!on) continue;
      const r = (0.02 + age * (black ? 0.07 : 0.04)) * s, x = (ex - age * 0.25) * s, y = (-0.06 - age * 0.06) * s;
      c.fillStyle = black ? `rgba(30,28,26,${0.55 * (1 - age)})` : `rgba(150,160,175,${0.4 * (1 - age)})`;
      c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    }
  }
  const bob = kind === 'beetle' ? Math.abs(Math.sin(t / 110)) * 0.008 * s : kind === 'pickup' ? Math.sin(t / 150) * 0.004 * s : 0;
  const e = sprite(kind, col, s);
  c.drawImage(e.cv, -e.ox, -e.oy - bob, e.w, e.h);
  if (kind === 'miata') { c.save(); c.translate(0, -bob); hairMiata(c, s, t); c.restore(); }
  V.wheels.forEach(([x, r], i) => {
    const style = kind === 'beetle' && i === 0 ? 'bare' : V.rim;                // the Beetle's rear hubcap is missing
    wheel(c, s, x, r, t / 1000 * speed / r, style);
  });
  c.restore();
}
