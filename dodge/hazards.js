// The things to dodge. Sizes and speeds are in "character heights" (s), so the game plays the same on
// any screen. w and h are the drawing's size; scale enlarges it so things look life-sized next to the
// character (a car longer than the character is tall, an elephant bigger still). Each is drawn centred on (0, 0), facing right (+x); the game mirrors it when it moves left.
//   lane 'sky'    falls from above, aimed at the player: step aside
//   lane 'ground' runs along the ground from either side: jump
//   lane 'air'    flies in at head height: duck
// hitH (optional): share of the height that counts as solid, e.g. the eagle's body but not its wingtips.
const OUTLINE = '#1f1a2e';

const INK = 'rgba(28,30,40,0.85)';   // thin outline for the detailed drawings

export const HAZARDS = {
  bomb:     { lane:'sky', scale:1.4, w:0.26, h:0.32, speed:0.95, draw:drawBomb, explodes:true },
  weight:   { lane:'sky', scale:1.5, w:0.42, h:0.32, speed:1.15, draw:drawWeight },
  elephant: { lane:'sky', scale:2.7, w:0.56, h:0.44, speed:0.9, hitR:0.5, tumbles:true, draw:drawElephant },
  anvil:    { lane:'sky', scale:1.4, w:0.38, h:0.22, speed:1.2,  draw:drawAnvil },
  plane:    { lane:'sky', scale:1.6, w:0.52, h:0.32, speed:1.05, hitR:0.24, dives:true, draw:drawPlane },
  car:      { lane:'ground', scale:1.5, w:0.64, h:0.3, speed:3.5,  draw:drawCar },
  pig:      { lane:'ground', scale:1.4, w:0.44, h:0.28, speed:3.06, draw:drawPig },
  tire:     { lane:'ground', scale:1.3, w:0.26, h:0.26, speed:2.0, draw:drawTire, bounce:true },
  eagle:    { lane:'air', scale:2.6, hitH:0.3, w:0.44, h:0.2, speed:1.4, draw:drawEagle },
  missile:  { lane:'air', twoPass:true, scale:1.5, w:0.5, h:0.12, speed:3.2, draw:drawMissile },
  arrow:    { lane:'air', scale:1.3, w:0.52, h:0.07, speed:7.8,  draw:drawArrow },
  ufo:      { lane:'ufo', scale:1.5, w:0.5, h:0.24, speed:0.5, draw:drawUfo },
  tomahawk: { lane:'air', scale:1.0, w:0.33, h:0.14, speed:2.2, arc:true, spins:true, shaped:true, draw:drawTomahawk },   // thrown, spinning end over end
};
export const BY_LANE = { sky:[], ground:[], air:[], ufo:[] };
for (const [k, d] of Object.entries(HAZARDS)) BY_LANE[d.lane].push(k);

function styled(c) { c.lineWidth = 3; c.strokeStyle = OUTLINE; c.lineJoin = 'round'; c.lineCap = 'round'; }
function rr(c, x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); }
function fillStroke(c, fill) { c.fillStyle = fill; c.fill(); c.stroke(); }
function circle(c, x, y, r, fill) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); fillStroke(c, fill); }
function ellipse(c, x, y, rx, ry, a, fill) { c.beginPath(); c.ellipse(x, y, rx, ry, a, 0, Math.PI * 2); fillStroke(c, fill); }

export function drawHazard(c, hz, s, now) {
  const d = HAZARDS[hz.kind];
  c.save(); c.translate(hz.x, hz.y);
  if (hz.spin) c.rotate(hz.spin);
  if (hz.dir < 0 && !d.noMirror) c.scale(-1, 1);                      // face the way it travels (not labels)
  styled(c); d.draw(c, s * d.scale, now - hz.born, hz);   // drawn bigger, with outlines kept the same thickness
  c.restore();
}

// ---------------------------------------------------------------- sky
function drawBomb(c, s, t) {
  circle(c, 0, 0.04 * s, 0.12 * s, '#212529');
  rr(c, -0.04 * s, -0.12 * s, 0.08 * s, 0.05 * s, 2); fillStroke(c, '#495057');
  c.beginPath(); c.moveTo(0, -0.12 * s); c.quadraticCurveTo(0.06 * s, -0.17 * s, 0.03 * s, -0.2 * s); c.strokeStyle = '#a07a4b'; c.lineWidth = 3; c.stroke();
  const f = 0.02 * s * (1 + 0.5 * Math.sin(t / 40));                       // fizzing spark
  c.fillStyle = '#ffd43b'; c.beginPath(); c.arc(0.03 * s, -0.2 * s, f * 1.4, 0, 7); c.fill();
  c.fillStyle = '#ff6b00'; c.beginPath(); c.arc(0.03 * s, -0.2 * s, f * 0.8, 0, 7); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.arc(-0.04 * s, 0, 0.03 * s, 0, 7); c.fill();
}
function drawWeight(c, s) {
  c.beginPath(); c.moveTo(-0.21 * s, 0.16 * s); c.lineTo(0.21 * s, 0.16 * s); c.lineTo(0.15 * s, -0.1 * s); c.lineTo(-0.15 * s, -0.1 * s); c.closePath();
  fillStroke(c, '#6c757d');
  c.beginPath(); c.arc(0, -0.1 * s, 0.07 * s, Math.PI, 0); c.lineWidth = 0.03 * s; c.strokeStyle = OUTLINE; c.stroke(); styled(c);
  c.fillStyle = '#fff'; c.font = `bold ${0.09 * s}px "Trebuchet MS", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('25 TON', 0, 0.04 * s);
}
// The elephant, drawn with shaded, wrinkled grey skin. It tumbles as it falls (the game turns it); here its
// legs paddle, its big ear flaps and its trunk swings and curls in alarm.
function drawElephant(c, s, t) {
  const skin = (x, y, r) => { const g = c.createRadialGradient(x - r * 0.4, y - r * 0.5, r * 0.1, x, y, r * 1.2); g.addColorStop(0, '#b8bec4'); g.addColorStop(0.55, '#8c939a'); g.addColorStop(1, '#5f666d'); return g; };
  c.lineWidth = 1.5; c.strokeStyle = INK;
  const wrinkle = (x1, y1, x2, y2, bend) => { c.strokeStyle = 'rgba(60,66,72,0.55)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x1, y1); c.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + bend, x2, y2); c.stroke(); };
  // legs, paddling, each pivoting at the hip (far legs darker)
  [[-0.15, 0, 0.8], [-0.05, 1.7, 1], [0.07, 3.1, 0.8], [0.16, 4.4, 1]].forEach(([x, ph, tone]) => {
    c.save(); c.translate(x * s, 0.08 * s); c.rotate(Math.sin(t / 130 + ph) * 0.45);
    c.beginPath(); c.moveTo(-0.04 * s, 0); c.lineTo(-0.038 * s, 0.13 * s); c.quadraticCurveTo(0, 0.145 * s, 0.038 * s, 0.13 * s); c.lineTo(0.04 * s, 0); c.closePath();
    c.fillStyle = skin(0, 0.06 * s, 0.07 * s); c.globalAlpha = tone; c.fill(); c.globalAlpha = 1; c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke();
    for (let k = 0; k < 3; k++) wrinkle(-0.03 * s, (0.04 + k * 0.03) * s, 0.03 * s, (0.04 + k * 0.03) * s, 0.01 * s);
    c.fillStyle = '#e9e1d2'; for (const nx of [-0.022, 0, 0.022]) { c.beginPath(); c.ellipse(nx * s, 0.128 * s, 0.01 * s, 0.007 * s, 0, 0, 7); c.fill(); }   // toenails
    c.restore();
  });
  // tail with a tuft
  const tw = Math.sin(t / 110) * 0.04 * s;
  c.strokeStyle = '#6c737a'; c.lineWidth = 0.012 * s + 1; c.beginPath(); c.moveTo(-0.235 * s, -0.01 * s); c.quadraticCurveTo(-0.3 * s, tw, -0.31 * s, 0.07 * s); c.stroke();
  c.fillStyle = '#3d4247'; c.beginPath(); c.ellipse(-0.31 * s, 0.085 * s, 0.012 * s, 0.022 * s, 0.3, 0, 7); c.fill();
  // body: shaded, darker underneath, with wrinkles
  c.beginPath(); c.ellipse(0, 0.02 * s, 0.245 * s, 0.155 * s, 0, 0, 7); c.fillStyle = skin(-0.02 * s, -0.02 * s, 0.25 * s); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke();
  const belly = c.createLinearGradient(0, 0.04 * s, 0, 0.175 * s); belly.addColorStop(0, 'rgba(40,44,50,0)'); belly.addColorStop(1, 'rgba(40,44,50,0.35)');
  c.fillStyle = belly; c.beginPath(); c.ellipse(0, 0.02 * s, 0.245 * s, 0.155 * s, 0, 0, 7); c.fill();
  for (const [x, b] of [[-0.12, 0.012], [-0.06, 0.016], [0.0, 0.014]]) wrinkle(x * s, -0.1 * s, (x + 0.02) * s, 0.12 * s, b * s);
  // head
  c.beginPath(); c.arc(0.2 * s, -0.09 * s, 0.115 * s, 0, 7); c.fillStyle = skin(0.2 * s, -0.11 * s, 0.12 * s); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke();
  // trunk: a tapering, wrinkled tube that swings and curls
  const sw = Math.sin(t / 160), curl = Math.sin(t / 230 + 1);
  const p0 = [0.27 * s, -0.06 * s], p1 = [0.37 * s, -0.04 * s], p2 = [0.38 * s + sw * 0.05 * s, 0.04 * s + curl * 0.05 * s], p3 = [0.33 * s + sw * 0.1 * s, 0.13 * s + curl * 0.08 * s];
  const bez = (u) => { const a = 1 - u; return [a * a * a * p0[0] + 3 * a * a * u * p1[0] + 3 * a * u * u * p2[0] + u * u * u * p3[0], a * a * a * p0[1] + 3 * a * a * u * p1[1] + 3 * a * u * u * p2[1] + u * u * u * p3[1]]; };
  for (let i = 0; i <= 14; i++) {                                                   // stack of shrinking discs = a tapering trunk
    const u = i / 14, [x, y] = bez(u), r = (0.034 - u * 0.016) * s;
    c.fillStyle = skin(x, y, r * 1.6); c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  }
  for (let i = 2; i <= 12; i += 2) { const [x, y] = bez(i / 14), r = (0.034 - i / 14 * 0.016) * s; wrinkle(x - r, y, x + r, y, r * 0.3); }
  const [ex, ey] = bez(1); c.fillStyle = '#4a5056'; c.beginPath(); c.ellipse(ex, ey + 0.012 * s, 0.012 * s, 0.006 * s, 0, 0, 7); c.fill();   // trunk tip
  // tusk
  const tusk = c.createLinearGradient(0.27 * s, -0.04 * s, 0.34 * s, -0.02 * s); tusk.addColorStop(0, '#d8cfbb'); tusk.addColorStop(1, '#fffaf0');
  c.fillStyle = tusk; c.beginPath(); c.moveTo(0.27 * s, -0.035 * s); c.quadraticCurveTo(0.33 * s, -0.005 * s, 0.355 * s, -0.04 * s); c.quadraticCurveTo(0.32 * s, -0.02 * s, 0.28 * s, -0.055 * s); c.closePath(); c.fill(); c.strokeStyle = INK; c.lineWidth = 1; c.stroke();
  // big ear, flapping, pinkish inside
  const flap = Math.sin(t / 90) * 0.25;
  c.save(); c.translate(0.15 * s, -0.1 * s); c.rotate(-0.35 + flap);
  c.beginPath(); c.moveTo(0, -0.08 * s); c.bezierCurveTo(-0.13 * s, -0.12 * s, -0.16 * s, 0.06 * s, -0.06 * s, 0.11 * s); c.bezierCurveTo(-0.02 * s, 0.13 * s, 0.02 * s, 0.05 * s, 0, -0.08 * s);
  const ear = c.createRadialGradient(-0.05 * s, 0, 0.01 * s, -0.05 * s, 0, 0.13 * s); ear.addColorStop(0, '#c9a7a4'); ear.addColorStop(0.6, '#9a9fa5'); ear.addColorStop(1, '#6f767d');
  c.fillStyle = ear; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke();
  wrinkle(-0.03 * s, -0.04 * s, -0.09 * s, 0.05 * s, 0.01 * s); c.restore();
  // eye, wide with alarm, and a sweat drop
  c.fillStyle = '#fff'; c.beginPath(); c.ellipse(0.245 * s, -0.125 * s, 0.022 * s, 0.018 * s, 0, 0, 7); c.fill();
  c.fillStyle = '#2b1d14'; c.beginPath(); c.arc(0.25 * s, -0.125 * s, 0.011 * s, 0, 7); c.fill();
  c.fillStyle = '#fff'; c.beginPath(); c.arc(0.254 * s, -0.129 * s, 0.004 * s, 0, 7); c.fill();
  c.strokeStyle = 'rgba(40,40,40,0.7)'; c.lineWidth = 1.2; c.beginPath(); c.arc(0.245 * s, -0.12 * s, 0.026 * s, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
  const drop = c.createLinearGradient(0, -0.23 * s, 0, -0.18 * s); drop.addColorStop(0, '#e7f5ff'); drop.addColorStop(1, '#4dabf7');
  c.fillStyle = drop; c.beginPath(); c.moveTo(0.32 * s, -0.235 * s); c.quadraticCurveTo(0.34 * s, -0.19 * s, 0.32 * s, -0.18 * s); c.quadraticCurveTo(0.3 * s, -0.19 * s, 0.32 * s, -0.235 * s); c.fill();
}
function drawAnvil(c, s) {
  c.beginPath();
  c.moveTo(-0.19 * s, -0.11 * s); c.lineTo(0.19 * s, -0.11 * s); c.quadraticCurveTo(0.12 * s, -0.04 * s, 0.07 * s, -0.03 * s);
  c.lineTo(0.07 * s, 0.05 * s); c.lineTo(0.13 * s, 0.11 * s); c.lineTo(-0.13 * s, 0.11 * s); c.lineTo(-0.07 * s, 0.05 * s);
  c.lineTo(-0.07 * s, -0.03 * s); c.quadraticCurveTo(-0.14 * s, -0.04 * s, -0.19 * s, -0.11 * s); c.closePath();
  fillStroke(c, '#495057');
  c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(-0.15 * s, -0.1 * s, 0.3 * s, 0.02 * s);
}
function drawPlane(c, s, t) {
  // nose to the right (+x); the game turns it to point along its dive. Smoke trails behind.
  c.save();
  for (let i = 0; i < 3; i++) { c.fillStyle = `rgba(200,200,200,${0.5 - i * 0.15})`; c.beginPath(); c.arc(-0.3 * s - i * 0.08 * s, Math.sin(t / 100 + i) * 0.02 * s, 0.05 * s + i * 0.02 * s, 0, 7); c.fill(); }
  styled(c);
  rr(c, -0.24 * s, -0.05 * s, 0.46 * s, 0.1 * s, 0.05 * s); fillStroke(c, '#f1f3f5');
  c.beginPath(); c.moveTo(-0.02 * s, 0); c.lineTo(-0.1 * s, -0.2 * s); c.lineTo(0.03 * s, -0.2 * s); c.lineTo(0.08 * s, 0); c.closePath(); fillStroke(c, '#4dabf7');
  c.beginPath(); c.moveTo(-0.02 * s, 0); c.lineTo(-0.1 * s, 0.2 * s); c.lineTo(0.03 * s, 0.2 * s); c.lineTo(0.08 * s, 0); c.closePath(); fillStroke(c, '#4dabf7');
  c.beginPath(); c.moveTo(-0.24 * s, 0); c.lineTo(-0.3 * s, -0.09 * s); c.lineTo(-0.2 * s, -0.04 * s); c.closePath(); fillStroke(c, '#e03131');
  c.fillStyle = '#1971c2'; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(-0.1 * s + i * 0.06 * s, -0.015 * s, 0.012 * s, 0, 7); c.fill(); }
  circle(c, 0.22 * s, 0, 0.03 * s, '#868e96');
  c.restore();
}

// A red sedan, side view: glossy shaded paintwork with a reflection, tinted windows reflecting the sky,
// chrome trim, door lines, headlight glow, tail light, and wheels with tyre tread and spoked rims that turn.
function drawCar(c, s, t) {
  // speed streaks behind it
  for (let i = 0; i < 4; i++) { c.fillStyle = `rgba(255,255,255,${0.5 - i * 0.1})`; c.fillRect(-0.55 * s - i * 0.05 * s, -0.09 * s + i * 0.055 * s, 0.16 * s, 0.01 * s); }
  // shadow on the ground
  const sh = c.createRadialGradient(0, 0.15 * s, 0, 0, 0.15 * s, 0.34 * s); sh.addColorStop(0, 'rgba(0,0,0,0.35)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = sh; c.beginPath(); c.ellipse(0, 0.15 * s, 0.34 * s, 0.03 * s, 0, 0, 7); c.fill();
  // body
  const body = new Path2D();
  body.moveTo(-0.31 * s, 0.09 * s); body.lineTo(-0.315 * s, -0.005 * s); body.quadraticCurveTo(-0.31 * s, -0.05 * s, -0.25 * s, -0.055 * s);
  body.lineTo(-0.16 * s, -0.06 * s); body.quadraticCurveTo(-0.11 * s, -0.135 * s, -0.04 * s, -0.14 * s); body.lineTo(0.07 * s, -0.14 * s);
  body.quadraticCurveTo(0.12 * s, -0.135 * s, 0.17 * s, -0.065 * s); body.quadraticCurveTo(0.28 * s, -0.06 * s, 0.315 * s, -0.03 * s);
  body.quadraticCurveTo(0.33 * s, 0.0, 0.325 * s, 0.09 * s); body.closePath();
  const paint = c.createLinearGradient(0, -0.14 * s, 0, 0.09 * s);
  paint.addColorStop(0, '#ff6b5e'); paint.addColorStop(0.25, '#e8241c'); paint.addColorStop(0.6, '#b3140f'); paint.addColorStop(1, '#6e0a08');
  c.fillStyle = paint; c.fill(body); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(body);
  // reflection along the side
  c.save(); c.clip(body);
  const refl = c.createLinearGradient(0, -0.04 * s, 0, 0.01 * s); refl.addColorStop(0, 'rgba(255,255,255,0)'); refl.addColorStop(0.5, 'rgba(255,255,255,0.45)'); refl.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = refl; c.fillRect(-0.32 * s, -0.04 * s, 0.65 * s, 0.05 * s);
  c.restore();
  // windows: tinted glass reflecting the sky
  const glass = c.createLinearGradient(0, -0.13 * s, 0, -0.065 * s); glass.addColorStop(0, '#cfe8ff'); glass.addColorStop(0.5, '#6f9cc9'); glass.addColorStop(1, '#2c4a6b');
  c.fillStyle = glass; c.strokeStyle = '#d0d4d8'; c.lineWidth = 1.5;
  for (const pts of [[[-0.145, -0.065], [-0.1, -0.125], [-0.04, -0.13], [-0.035, -0.065]], [[-0.02, -0.065], [-0.02, -0.13], [0.065, -0.13], [0.15, -0.065]]]) {
    c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x * s, y * s) : c.moveTo(x * s, y * s)); c.closePath(); c.fill(); c.stroke();
  }
  c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.moveTo(0.0, -0.125 * s); c.lineTo(0.03 * s, -0.125 * s); c.lineTo(0.0, -0.07 * s); c.lineTo(-0.012 * s, -0.07 * s); c.closePath(); c.fill(); // glint
  // chrome trim, door seams and handles
  c.strokeStyle = '#dee2e6'; c.lineWidth = 2; c.beginPath(); c.moveTo(-0.29 * s, 0.03 * s); c.lineTo(0.3 * s, 0.03 * s); c.stroke();
  c.strokeStyle = 'rgba(60,0,0,0.6)'; c.lineWidth = 1.2;
  for (const x of [-0.03, 0.15]) { c.beginPath(); c.moveTo(x * s, -0.06 * s); c.lineTo(x * s, 0.085 * s); c.stroke(); }
  c.fillStyle = '#ced4da'; c.fillRect(-0.005 * s, -0.035 * s, 0.025 * s, 0.008 * s); c.fillRect(0.12 * s, -0.035 * s, 0.025 * s, 0.008 * s);
  // bumpers
  c.fillStyle = '#343a40'; c.beginPath(); c.roundRect ? c.roundRect(0.29 * s, 0.05 * s, 0.045 * s, 0.035 * s, 0.01 * s) : c.rect(0.29 * s, 0.05 * s, 0.045 * s, 0.035 * s); c.fill();
  c.beginPath(); c.roundRect ? c.roundRect(-0.325 * s, 0.05 * s, 0.04 * s, 0.035 * s, 0.01 * s) : c.rect(-0.325 * s, 0.05 * s, 0.04 * s, 0.035 * s); c.fill();
  // headlight with a glow, and the tail light
  const hl = c.createRadialGradient(0.31 * s, -0.012 * s, 0, 0.31 * s, -0.012 * s, 0.1 * s); hl.addColorStop(0, 'rgba(255,250,210,0.9)'); hl.addColorStop(1, 'rgba(255,250,210,0)');
  c.fillStyle = hl; c.beginPath(); c.arc(0.31 * s, -0.012 * s, 0.1 * s, 0, 7); c.fill();
  c.fillStyle = '#fff9db'; c.beginPath(); c.ellipse(0.31 * s, -0.012 * s, 0.014 * s, 0.02 * s, 0, 0, 7); c.fill(); c.strokeStyle = INK; c.lineWidth = 1; c.stroke();
  c.fillStyle = '#ff2d2d'; c.beginPath(); c.ellipse(-0.307 * s, -0.012 * s, 0.009 * s, 0.018 * s, 0, 0, 7); c.fill(); c.stroke();
  // wheels: dark arches, tyres with tread, spoked rims that turn
  for (const x of [-0.18, 0.18]) {
    const cx = x * s, cy = 0.085 * s, R = 0.068 * s;
    c.fillStyle = '#1a1a1a'; c.beginPath(); c.arc(cx, cy - 0.005 * s, R * 1.12, Math.PI, 0); c.fill();   // wheel arch
    const tyre = c.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.2, cx, cy, R); tyre.addColorStop(0, '#4a4a4a'); tyre.addColorStop(1, '#161616');
    c.fillStyle = tyre; c.beginPath(); c.arc(cx, cy, R, 0, 7); c.fill();
    c.save(); c.translate(cx, cy); c.rotate(t / 60);
    c.strokeStyle = '#0c0c0c'; c.lineWidth = 2;
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; c.beginPath(); c.moveTo(Math.cos(a) * R * 0.85, Math.sin(a) * R * 0.85); c.lineTo(Math.cos(a) * R, Math.sin(a) * R); c.stroke(); }
    const rim = c.createRadialGradient(-R * 0.2, -R * 0.2, 0, 0, 0, R * 0.6); rim.addColorStop(0, '#f8f9fa'); rim.addColorStop(1, '#868e96');
    c.fillStyle = rim; c.beginPath(); c.arc(0, 0, R * 0.58, 0, 7); c.fill();
    c.strokeStyle = '#495057'; c.lineWidth = R * 0.12;
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; c.beginPath(); c.moveTo(Math.cos(a) * R * 0.12, Math.sin(a) * R * 0.12); c.lineTo(Math.cos(a) * R * 0.52, Math.sin(a) * R * 0.52); c.stroke(); }
    c.fillStyle = '#343a40'; c.beginPath(); c.arc(0, 0, R * 0.12, 0, 7); c.fill();
    c.restore();
  }
}
function drawPig(c, s, t) {
  const run = Math.sin(t / 55);
  for (const [x, ph] of [[-0.12, 1], [-0.06, -1], [0.08, -1], [0.14, 1]]) {   // legs
    c.save(); c.translate(x * s, 0.06 * s); c.rotate(run * ph * 0.5);
    rr(c, -0.025 * s, 0, 0.05 * s, 0.09 * s, 3); fillStroke(c, '#faa2c1'); c.restore(); styled(c);
  }
  ellipse(c, 0, 0, 0.2 * s, 0.11 * s, 0, '#fcc2d7');
  c.beginPath(); c.moveTo(-0.2 * s, -0.02 * s); c.bezierCurveTo(-0.27 * s, -0.08 * s, -0.22 * s, -0.12 * s, -0.25 * s, -0.04 * s); c.stroke();  // curly tail
  circle(c, 0.18 * s, -0.04 * s, 0.09 * s, '#fcc2d7');
  c.beginPath(); c.moveTo(0.13 * s, -0.11 * s); c.lineTo(0.16 * s, -0.17 * s); c.lineTo(0.19 * s, -0.11 * s); c.closePath(); fillStroke(c, '#faa2c1');
  ellipse(c, 0.27 * s, -0.02 * s, 0.035 * s, 0.045 * s, 0, '#faa2c1');
  c.fillStyle = OUTLINE; c.beginPath(); c.arc(0.27 * s, -0.035 * s, 0.008 * s, 0, 7); c.arc(0.27 * s, -0.005 * s, 0.008 * s, 0, 7); c.fill();
  c.beginPath(); c.arc(0.2 * s, -0.08 * s, 0.014 * s, 0, 7); c.fill();
  c.fillStyle = 'rgba(160,110,70,0.6)'; c.beginPath(); c.arc(-0.3 * s, 0.13 * s, 0.03 * s, 0, 7); c.arc(-0.36 * s, 0.14 * s, 0.02 * s, 0, 7); c.fill(); // dust
}
function drawTire(c, s, t) {
  c.save(); c.rotate(t / 90);
  circle(c, 0, 0, 0.13 * s, '#343a40'); circle(c, 0, 0, 0.065 * s, '#adb5bd');
  c.strokeStyle = '#212529'; c.lineWidth = 3;
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; c.beginPath(); c.moveTo(Math.cos(a) * 0.09 * s, Math.sin(a) * 0.09 * s); c.lineTo(Math.cos(a) * 0.125 * s, Math.sin(a) * 0.125 * s); c.stroke(); }
  c.restore();
}

// ---------------------------------------------------------------- air (head height)
function wing(c, s, flap, color) {
  c.save(); c.rotate(flap);
  c.beginPath(); c.moveTo(-0.02 * s, 0); c.quadraticCurveTo(-0.12 * s, -0.2 * s, -0.22 * s, -0.16 * s); c.quadraticCurveTo(-0.1 * s, -0.06 * s, 0.04 * s, 0); c.closePath();
  fillStroke(c, color); c.restore(); styled(c);
}
function drawEagle(c, s, t) {
  const flap = Math.sin(t / 80) * 0.6;
  ellipse(c, 0, 0, 0.16 * s, 0.055 * s, 0, '#8d5a3b');
  c.beginPath(); c.moveTo(-0.15 * s, 0); c.lineTo(-0.24 * s, -0.04 * s); c.lineTo(-0.24 * s, 0.05 * s); c.closePath(); fillStroke(c, '#f8f9fa');
  wing(c, s, flap, '#6f4329');
  circle(c, 0.15 * s, -0.02 * s, 0.055 * s, '#f8f9fa');
  c.beginPath(); c.moveTo(0.19 * s, -0.03 * s); c.lineTo(0.25 * s, 0); c.lineTo(0.19 * s, 0.01 * s); c.closePath(); fillStroke(c, '#ffd43b');
  c.fillStyle = OUTLINE; c.beginPath(); c.arc(0.165 * s, -0.035 * s, 0.01 * s, 0, 7); c.fill();
  c.beginPath(); c.moveTo(0.13 * s, -0.06 * s); c.lineTo(0.19 * s, -0.045 * s); c.stroke();          // fierce brow
}
function drawRaven(c, s, t) {
  const flap = Math.sin(t / 60) * 0.7;
  ellipse(c, 0, 0, 0.12 * s, 0.045 * s, 0, '#212529');
  c.beginPath(); c.moveTo(-0.11 * s, 0); c.lineTo(-0.18 * s, -0.03 * s); c.lineTo(-0.18 * s, 0.04 * s); c.closePath(); fillStroke(c, '#212529');
  c.save(); c.scale(0.75, 0.75); wing(c, s, flap, '#343a40'); c.restore(); styled(c);
  circle(c, 0.12 * s, -0.02 * s, 0.045 * s, '#212529');
  c.beginPath(); c.moveTo(0.15 * s, -0.025 * s); c.lineTo(0.22 * s, -0.005 * s); c.lineTo(0.15 * s, 0.005 * s); c.closePath(); fillStroke(c, '#495057');
  c.fillStyle = '#ffd43b'; c.beginPath(); c.arc(0.13 * s, -0.03 * s, 0.009 * s, 0, 7); c.fill();
}
// A missile: a rounded metal body shaded like a cylinder, a red nose cone, panel lines and rivets, swept
// fins, and a roaring exhaust flame with a smoke trail.
function drawMissile(c, s, t) {
  // smoke trail
  for (let i = 0; i < 7; i++) {
    const k = (i + (t / 60) % 1) / 7, x = -0.24 * s - k * 0.5 * s, r = (0.025 + k * 0.05) * s;
    c.fillStyle = `rgba(200,200,200,${0.45 * (1 - k)})`; c.beginPath(); c.arc(x, Math.sin(t / 90 + i) * 0.01 * s, r, 0, 7); c.fill();
  }
  // flame
  const fl = 0.11 * s * (1 + 0.25 * Math.sin(t / 25) + 0.1 * Math.sin(t / 7));
  const flame = c.createRadialGradient(-0.22 * s, 0, 0, -0.22 * s - fl * 0.4, 0, fl);
  flame.addColorStop(0, 'rgba(255,255,240,1)'); flame.addColorStop(0.25, 'rgba(255,220,90,0.95)'); flame.addColorStop(0.6, 'rgba(255,120,20,0.7)'); flame.addColorStop(1, 'rgba(255,60,0,0)');
  c.fillStyle = flame; c.beginPath(); c.moveTo(-0.215 * s, -0.035 * s); c.quadraticCurveTo(-0.22 * s - fl, -0.02 * s, -0.22 * s - fl * 1.2, 0); c.quadraticCurveTo(-0.22 * s - fl, 0.02 * s, -0.215 * s, 0.035 * s); c.closePath(); c.fill();
  // fins (far ones behind the body)
  const fin = (sy, far) => {
    c.beginPath(); c.moveTo(-0.2 * s, sy * 0.035 * s); c.lineTo(-0.25 * s, sy * 0.1 * s); c.lineTo(-0.2 * s, sy * 0.1 * s); c.lineTo(-0.13 * s, sy * 0.035 * s); c.closePath();
    const g = c.createLinearGradient(0, sy * 0.035 * s, 0, sy * 0.1 * s); g.addColorStop(0, far ? '#5c6168' : '#868e96'); g.addColorStop(1, far ? '#34383d' : '#495057');
    c.fillStyle = g; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.2; c.stroke();
  };
  fin(-1, true);
  // body: a metal cylinder, lit from above
  const body = new Path2D();
  body.moveTo(-0.215 * s, -0.04 * s); body.lineTo(0.13 * s, -0.04 * s); body.quadraticCurveTo(0.245 * s, -0.035 * s, 0.27 * s, 0); body.quadraticCurveTo(0.245 * s, 0.035 * s, 0.13 * s, 0.04 * s); body.lineTo(-0.215 * s, 0.04 * s); body.closePath();
  const metal = c.createLinearGradient(0, -0.04 * s, 0, 0.04 * s);
  metal.addColorStop(0, '#9aa1a8'); metal.addColorStop(0.25, '#f4f6f8'); metal.addColorStop(0.55, '#c3c9cf'); metal.addColorStop(1, '#5b6168');
  c.fillStyle = metal; c.fill(body);
  c.save(); c.clip(body);
  const nose = c.createLinearGradient(0, -0.04 * s, 0, 0.04 * s); nose.addColorStop(0, '#a61e1e'); nose.addColorStop(0.3, '#ff5a5a'); nose.addColorStop(1, '#6b0f0f');
  c.fillStyle = nose; c.fillRect(0.14 * s, -0.05 * s, 0.14 * s, 0.1 * s);
  c.fillStyle = '#e8590c'; c.fillRect(0.05 * s, -0.05 * s, 0.018 * s, 0.1 * s);                     // warning band
  c.strokeStyle = 'rgba(50,55,60,0.6)'; c.lineWidth = 1;
  for (const x of [-0.12, -0.03, 0.14]) { c.beginPath(); c.moveTo(x * s, -0.05 * s); c.lineTo(x * s, 0.05 * s); c.stroke(); }   // panel seams
  c.fillStyle = 'rgba(50,55,60,0.7)'; for (const x of [-0.11, -0.02]) for (const y of [-0.025, 0.025]) { c.beginPath(); c.arc((x + 0.012) * s, y * s, 0.0035 * s, 0, 7); c.fill(); }   // rivets
  c.fillStyle = 'rgba(40,44,50,0.75)'; c.font = `bold ${0.022 * s}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('XM-9', -0.075 * s, 0.003 * s);
  c.restore();
  c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(body);
  c.fillStyle = '#343a40'; c.fillRect(-0.225 * s, -0.03 * s, 0.012 * s, 0.06 * s);                    // nozzle
  fin(1, false);
}
function drawArrow(c, s) {
  c.strokeStyle = OUTLINE; c.lineWidth = 0.02 * s + 4; c.beginPath(); c.moveTo(-0.24 * s, 0); c.lineTo(0.2 * s, 0); c.stroke();
  c.strokeStyle = '#a0522d'; c.lineWidth = 0.02 * s; c.stroke(); styled(c);
  c.beginPath(); c.moveTo(0.27 * s, 0); c.lineTo(0.19 * s, -0.035 * s); c.lineTo(0.19 * s, 0.035 * s); c.closePath(); fillStroke(c, '#adb5bd');
  for (const sy of [-1, 1]) { c.beginPath(); c.moveTo(-0.26 * s, sy * 0.035 * s); c.lineTo(-0.18 * s, 0); c.lineTo(-0.2 * s, sy * 0.035 * s); c.closePath(); fillStroke(c, '#e03131'); }
}
// A tomahawk: wooden handle with a leather wrap and feathers, steel head at the +x end. The game spins it.
function drawTomahawk(c, s) {
  // feathers hanging from the butt of the handle
  for (const [a, col] of [[0.5, '#e03131'], [0.85, '#f8f9fa']]) {
    c.save(); c.translate(-0.14 * s, 0.005 * s); c.rotate(a);
    c.beginPath(); c.ellipse(0, 0.035 * s, 0.012 * s, 0.035 * s, 0, 0, 7); fillStroke(c, col); c.restore(); styled(c);
  }
  rr(c, -0.15 * s, -0.012 * s, 0.27 * s, 0.024 * s, 0.01 * s); fillStroke(c, '#a0522d');   // handle
  c.fillStyle = '#5c3d2e'; for (let i = 0; i < 4; i++) c.fillRect(-0.13 * s + i * 0.018 * s, -0.012 * s, 0.009 * s, 0.024 * s);  // leather wrap
  // steel head: a curved blade on one side, a short spike on the other
  c.beginPath(); c.moveTo(0.09 * s, -0.012 * s); c.lineTo(0.1 * s, -0.06 * s);
  c.quadraticCurveTo(0.15 * s, -0.075 * s, 0.17 * s, -0.045 * s); c.lineTo(0.13 * s, -0.012 * s); c.closePath(); fillStroke(c, '#ced4da');
  c.strokeStyle = '#f8f9fa'; c.lineWidth = 2; c.beginPath(); c.moveTo(0.105 * s, -0.062 * s); c.quadraticCurveTo(0.15 * s, -0.073 * s, 0.165 * s, -0.047 * s); c.stroke(); styled(c);
  c.beginPath(); c.moveTo(0.1 * s, 0.012 * s); c.lineTo(0.115 * s, 0.045 * s); c.lineTo(0.125 * s, 0.012 * s); c.closePath(); fillStroke(c, '#adb5bd');
}

// Size on screen, in character heights.
export const sizeOf = kind => ({ w: HAZARDS[kind].w * HAZARDS[kind].scale, h: HAZARDS[kind].h * HAZARDS[kind].scale });

// What is left after a plane crashes: a burning hunk of molten metal with a tail fin sticking out. The fire
// bursts up tall at first, then settles; flickering tongues of flame in layers (red, orange, yellow, a white-hot
// core), sparks drifting up, a glow on the ground, and a column of black smoke. age: ms since the crash.
export function drawWreck(c, x, y, s, age, dir) {
  const fade = Math.min(1, Math.max(0, (4200 - age) / 900));
  const burst = 1 + 1.2 * Math.max(0, 1 - age / 700);                       // flames leap up, then settle
  const tsec = age / 1000;
  c.save(); c.globalAlpha = fade; c.translate(x, y);
  // glow on the ground
  const glow = c.createRadialGradient(0, 0, 0, 0, 0, s * 0.6);
  glow.addColorStop(0, 'rgba(255,170,60,0.55)'); glow.addColorStop(1, 'rgba(255,120,0,0)');
  c.fillStyle = glow; c.beginPath(); c.ellipse(0, 0, s * 0.6, s * 0.16, 0, 0, 7); c.fill();
  // black smoke column, billowing and drifting
  for (let i = 0; i < 9; i++) {
    const t = (tsec * 0.8 + i / 9) % 1, r = s * (0.07 + t * 0.2);
    c.fillStyle = `rgba(40,40,40,${0.55 * (1 - t)})`;
    c.beginPath(); c.arc(Math.sin(i * 1.7 + tsec * 1.3) * s * 0.06 + t * s * 0.15 * dir, -s * 0.3 - t * s * 0.9, r, 0, 7); c.fill();
  }
  // tail fin
  c.save(); c.scale(dir, 1); c.rotate(-0.5);
  c.fillStyle = '#495057'; c.strokeStyle = '#1f1a2e'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(-s * 0.18, -s * 0.02); c.lineTo(-s * 0.3, -s * 0.22); c.lineTo(-s * 0.12, -s * 0.06); c.closePath(); c.fill(); c.stroke();
  c.restore();
  // molten hunk
  const heat = 0.6 + 0.4 * Math.sin(age / 110);
  c.fillStyle = '#343a40'; c.strokeStyle = '#1f1a2e'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(-s * 0.24, 0); c.quadraticCurveTo(-s * 0.22, -s * 0.13, -s * 0.05, -s * 0.14);
  c.quadraticCurveTo(s * 0.09, -s * 0.2, s * 0.22, -s * 0.08); c.quadraticCurveTo(s * 0.27, -s * 0.02, s * 0.24, 0); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = `rgba(255,${80 + 70 * heat},20,0.9)`; c.beginPath(); c.ellipse(0, -s * 0.05, s * 0.14, s * 0.045, 0.1, 0, 7); c.fill();
  c.fillStyle = `rgba(255,240,170,${heat})`; c.beginPath(); c.ellipse(s * 0.02, -s * 0.05, s * 0.06, s * 0.02, 0.1, 0, 7); c.fill();
  // flames: overlapping tongues that wobble and flicker, drawn back to front
  const tongue = (fx, base, height, width, colour, seed) => {
    const sway = Math.sin(tsec * 9 + seed) * width * 0.6 + Math.sin(tsec * 23 + seed * 2) * width * 0.25;
    c.fillStyle = colour; c.beginPath();
    c.moveTo(fx - width, base);
    c.bezierCurveTo(fx - width * 1.1, base - height * 0.45, fx + sway - width * 0.4, base - height * 0.7, fx + sway, base - height);
    c.bezierCurveTo(fx + sway + width * 0.4, base - height * 0.7, fx + width * 1.1, base - height * 0.45, fx + width, base);
    c.closePath(); c.fill();
  };
  const settle = age < 2800 ? 1 : fade;
  for (const [layer, colour, k] of [[0, 'rgba(200,30,10,0.85)', 1.0], [1, 'rgba(255,110,0,0.9)', 0.78], [2, 'rgba(255,200,40,0.95)', 0.55], [3, 'rgba(255,250,220,0.95)', 0.3]]) {
    for (let i = -3; i <= 3; i++) {
      const seed = i * 2.1 + layer, flick = 0.75 + 0.25 * Math.sin(tsec * 14 + seed * 3);
      const hgt = s * (0.32 - Math.abs(i) * 0.05) * k * flick * burst * settle;
      if (hgt <= 0) continue;
      tongue(i * s * 0.06, -s * 0.04, hgt, s * (0.05 - layer * 0.008), colour, seed);
    }
  }
  // sparks drifting up
  for (let i = 0; i < 14; i++) {
    const t = (tsec * 0.9 + i / 14) % 1, sx = Math.sin(i * 3.3) * s * 0.2 + Math.sin(tsec * 3 + i) * s * 0.04;
    c.fillStyle = `rgba(255,${180 + 60 * Math.sin(i)},60,${1 - t})`;
    c.beginPath(); c.arc(sx, -s * 0.1 - t * s * 0.7 * burst, s * 0.008, 0, 7); c.fill();
  }
  c.restore();
}

// A flying saucer: polished metal shaded top to bottom, a darker rim band with a ring of rotating lights,
// a glowing underside, and a glass dome with a reflection and a little green pilot.
function drawUfo(c, s, t) {
  // glow beneath
  const under = c.createRadialGradient(0, 0.06 * s, 0, 0, 0.06 * s, 0.22 * s);
  under.addColorStop(0, 'rgba(150,255,210,0.55)'); under.addColorStop(1, 'rgba(150,255,210,0)');
  c.fillStyle = under; c.beginPath(); c.ellipse(0, 0.06 * s, 0.24 * s, 0.07 * s, 0, 0, 7); c.fill();
  // antenna with a blinking tip
  c.strokeStyle = '#868e96'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, -0.12 * s); c.lineTo(0, -0.16 * s); c.stroke();
  c.fillStyle = Math.floor(t / 400) % 2 ? '#ff6b6b' : '#ffe3e3'; c.beginPath(); c.arc(0, -0.165 * s, 0.009 * s, 0, 7); c.fill();
  // dome: glass with the pilot inside
  const dome = new Path2D(); dome.ellipse(0, -0.035 * s, 0.1 * s, 0.09 * s, 0, Math.PI, 0); dome.closePath();
  const glass = c.createRadialGradient(-0.03 * s, -0.09 * s, 0.005 * s, 0, -0.04 * s, 0.11 * s);
  glass.addColorStop(0, 'rgba(235,250,255,0.95)'); glass.addColorStop(0.5, 'rgba(140,200,240,0.7)'); glass.addColorStop(1, 'rgba(60,110,160,0.85)');
  c.fillStyle = glass; c.fill(dome);
  c.save(); c.clip(dome);
  c.fillStyle = '#5fbf6a'; c.beginPath(); c.ellipse(0, -0.065 * s, 0.032 * s, 0.038 * s, 0, 0, 7); c.fill();    // head
  c.fillStyle = '#4c9a56'; c.beginPath(); c.ellipse(0, -0.02 * s, 0.045 * s, 0.025 * s, 0, 0, 7); c.fill();     // shoulders
  c.fillStyle = '#111'; for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(sx * 0.013 * s, -0.07 * s, 0.011 * s, 0.017 * s, sx * 0.4, 0, 7); c.fill(); }
  c.fillStyle = 'rgba(255,255,255,0.7)'; for (const sx of [-1, 1]) { c.beginPath(); c.arc(sx * 0.011 * s, -0.077 * s, 0.003 * s, 0, 7); c.fill(); }
  c.restore();
  c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 2; c.beginPath(); c.ellipse(0, -0.035 * s, 0.08 * s, 0.07 * s, 0, Math.PI * 1.15, Math.PI * 1.45); c.stroke();  // reflection
  c.strokeStyle = INK; c.lineWidth = 1.2; c.stroke(dome);
  // saucer body: polished metal
  const hull = new Path2D(); hull.ellipse(0, 0, 0.26 * s, 0.06 * s, 0, 0, 7);
  const metal = c.createLinearGradient(0, -0.06 * s, 0, 0.06 * s);
  metal.addColorStop(0, '#f8f9fa'); metal.addColorStop(0.4, '#c5cbd1'); metal.addColorStop(0.55, '#7d858d'); metal.addColorStop(1, '#3d434a');
  c.fillStyle = metal; c.fill(hull); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(hull);
  c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(0, -0.01 * s, 0.2 * s, 0.03 * s, 0, Math.PI * 1.1, Math.PI * 1.9); c.stroke();  // sheen
  c.fillStyle = '#495057'; c.beginPath(); c.ellipse(0, 0.012 * s, 0.25 * s, 0.022 * s, 0, 0, Math.PI); c.fill();                  // rim band
  // ring of rotating lights round the rim: bright at the front, dim going behind
  const colours = ['#ff4d4d', '#ffe066', '#4dd4ff', '#69db7c'];
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6 + t / 450, depth = Math.sin(a);
    if (depth < -0.25) continue;
    const x = Math.cos(a) * 0.23 * s, y = 0.016 * s + depth * 0.016 * s, r = (0.013 + 0.008 * depth) * s;
    const g = c.createRadialGradient(x, y, 0, x, y, r * 1.8); g.addColorStop(0, '#fff'); g.addColorStop(0.3, colours[i % 4]); g.addColorStop(0.55, colours[i % 4]); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.globalAlpha = 0.4 + 0.6 * Math.max(0, depth); c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 1.8, 0, 7); c.fill();
  }
  c.globalAlpha = 1;
}
