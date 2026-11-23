// The things to dodge. Sizes and speeds are in "character heights" (s), so the game plays the same on
// any screen. w and h are the drawing's size; scale enlarges it so things look life-sized next to the
// character (a car longer than the character is tall, an elephant bigger still). Each is drawn centred on (0, 0), facing right (+x); the game mirrors it when it moves left.
//   lane 'sky'    falls from above, aimed at the player: step aside
//   lane 'ground' runs along the ground from either side: jump
//   lane 'air'    flies in at head height: duck
// hitH (optional): share of the height that counts as solid, e.g. the eagle's body but not its wingtips.
const OUTLINE = '#1f1a2e';

const INK = 'rgba(28,30,40,0.85)';   // thin outline for the detailed drawings
import { VEHICLES, drawVehicle, preloadVehicles } from './vehicles.js';
export { preloadVehicles, VEHICLES };

export const HAZARDS = {
  bomb:     { lane:'sky', scale:1.4, w:0.26, h:0.32, speed:0.95, draw:drawBomb, explodes:true },
  weight:   { lane:'sky', scale:2.4, w:0.42, h:0.32, speed:1.15, draw:drawWeight },
  elephant: { lane:'charge', scale:2.7, w:0.56, h:0.53, speed:1, draw:drawElephant },   // charges, rears up, charges again: lie flat
  health:   { lane:'pack', scale:2.7, w:0.16, h:0.24, speed:1, noPick:true, draw:(c, s, t) => drawPack(c, s, t, true) },    // catch: one life back
  energy:   { lane:'pack', scale:2.7, w:0.16, h:0.24, speed:1, noPick:true, draw:(c, s, t) => drawPack(c, s, t, false) },   // catch: super jumps
  anvil:    { lane:'sky', scale:1.4, w:0.38, h:0.22, speed:1.2,  draw:drawAnvil },
  plane:    { lane:'sky', scale:1.6, w:0.52, h:0.32, speed:1.05, hitR:0.24, dives:true, draw:drawPlane },
  // Six different vehicles (see vehicles.js), each with its own speed. Ground-lane picks choose 'car', and the
  // game then picks one of them.
  ...Object.fromEntries(Object.entries(VEHICLES).map(([k, V]) => [k, { lane:'ground', vehicle:true, scale:1, w:V.w * (V.size || 1), h:V.h * (V.size || 1), speed:3.5 * V.mul,
    draw:(c, s, t, hz) => drawVehicle(c, k, s, t, hz) }])),
  pig:      { lane:'ground', scale:1.4, w:0.44, h:0.28, speed:3.06, draw:drawPig },
  tire:     { lane:'ground', scale:1.3, w:0.26, h:0.26, speed:2.0, draw:drawTire, bounce:true },
  eagle:    { lane:'air', scale:1.73, w:0.44, h:0.2, speed:2.25, hitR:0.12, swoops:true, draw:drawEagle },   // swoops down from high up
  missile:  { lane:'air', twoPass:true, scale:1.5, w:0.5, h:0.12, speed:3.2, draw:drawMissile },
  arrow:    { lane:'air', scale:1.3, w:0.52, h:0.07, speed:5.2,  draw:drawArrow },
  ufo:      { lane:'ufo', scale:1.5, w:0.5, h:0.24, speed:0.5, draw:drawUfo },
  tomahawk: { lane:'air', scale:1.0, w:0.33, h:0.14, speed:2.2, arc:true, spins:true, shaped:true, draw:drawTomahawk },   // thrown, spinning end over end
  poop:     { lane:'sky', scale:1, w:0.07, h:0.09, speed:1.3, noPick:true, splat:true, draw:drawPoop },   // the eagle's (only from an eagle)
  pogo:     { lane:'bounce', scale:1.6, w:0.3, h:0.7, speed:1.0, pogo:true, draw:drawPogo },   // (retired: replaced by the frog)
  frog:     { lane:'bounce', scale:1, w:0.85, h:0.75, speed:1.0, frog:true, draw:drawFrog },   // a big frog hopping across in bursts
  boomerang:{ lane:'air', scale:1.3, w:0.34, h:0.12, speed:2.4, returns:true, shaped:true, draw:drawBoomerang },        // out and back, spinning flat
};
export const BY_LANE = { sky:[], ground:[], air:[], ufo:[], bounce:[], charge:[], pack:[] };
for (const [k, d] of Object.entries(HAZARDS)) if (!d.vehicle && !d.noPick) BY_LANE[d.lane].push(k);
BY_LANE.ground.unshift('car');
export const VEHICLE_KINDS = Object.keys(VEHICLES);

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
// A round black iron bomb: glossy, with a highlight, a metal cap, and a fizzing rope fuse.
function drawBomb(c, s, t) {
  const body = c.createRadialGradient(-0.045 * s, -0.01 * s, 0.01 * s, 0, 0.04 * s, 0.13 * s);
  body.addColorStop(0, '#6b7280'); body.addColorStop(0.35, '#2b2f36'); body.addColorStop(1, '#0b0c0f');
  c.fillStyle = body; c.beginPath(); c.arc(0, 0.04 * s, 0.12 * s, 0, 7); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.ellipse(-0.05 * s, -0.01 * s, 0.022 * s, 0.035 * s, -0.6, 0, 7); c.fill();
  const cap = c.createLinearGradient(-0.04 * s, 0, 0.04 * s, 0); cap.addColorStop(0, '#5f6670'); cap.addColorStop(0.45, '#d5d9de'); cap.addColorStop(1, '#4a5058');
  c.fillStyle = cap; c.beginPath(); c.roundRect ? c.roundRect(-0.038 * s, -0.115 * s, 0.076 * s, 0.045 * s, 0.008 * s) : c.rect(-0.038 * s, -0.115 * s, 0.076 * s, 0.045 * s); c.fill(); c.stroke();
  c.strokeStyle = '#8a6a43'; c.lineWidth = 0.016 * s; c.lineCap = 'round';                            // rope fuse
  c.beginPath(); c.moveTo(0, -0.115 * s); c.bezierCurveTo(0.02 * s, -0.16 * s, 0.06 * s, -0.15 * s, 0.045 * s, -0.2 * s); c.stroke();
  c.strokeStyle = 'rgba(60,40,20,0.6)'; c.lineWidth = 1; for (let i = 0; i < 5; i++) { const y = -0.125 * s - i * 0.016 * s; c.beginPath(); c.moveTo(0.008 * s + i * 0.008 * s, y); c.lineTo(0.02 * s + i * 0.008 * s, y - 0.008 * s); c.stroke(); }
  const f = 0.025 * s * (1 + 0.5 * Math.sin(t / 40)), sx = 0.045 * s, sy = -0.205 * s;                  // spark
  const sp = c.createRadialGradient(sx, sy, 0, sx, sy, f * 1.8); sp.addColorStop(0, '#fff'); sp.addColorStop(0.3, '#ffe066'); sp.addColorStop(0.7, 'rgba(255,120,0,0.8)'); sp.addColorStop(1, 'rgba(255,80,0,0)');
  c.fillStyle = sp; c.beginPath(); c.arc(sx, sy, f * 1.8, 0, 7); c.fill();
  c.strokeStyle = '#ffd43b'; c.lineWidth = 1.2;
  for (let i = 0; i < 6; i++) { const a = i + t / 60; c.beginPath(); c.moveTo(sx + Math.cos(a) * f * 0.6, sy + Math.sin(a) * f * 0.6); c.lineTo(sx + Math.cos(a) * f * 1.6, sy + Math.sin(a) * f * 1.6); c.stroke(); }
  { const body = new Path2D(); body.arc(0, 0.04 * s, 0.12 * s, 0, 7); let r = 5; const rnd = () => { r = (r * 16807) % 2147483647; return (r - 1) / 2147483646; };
    c.save(); c.clip(body);
    for (let i = 0; i < 70; i++) { c.fillStyle = rnd() < 0.6 ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.08)'; c.beginPath(); c.arc((rnd() - 0.5) * 0.24 * s, (rnd() - 0.5) * 0.24 * s + 0.04 * s, (0.002 + rnd() * 0.004) * s, 0, 7); c.fill(); }   // pitting
    c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 0.008 * s; c.beginPath(); c.ellipse(0, 0.045 * s, 0.12 * s, 0.03 * s, 0, 0, Math.PI); c.stroke();   // weld seam
    c.strokeStyle = 'rgba(255,255,255,0.15)'; c.lineWidth = 1; c.beginPath(); c.ellipse(0, 0.04 * s, 0.12 * s, 0.03 * s, 0, 0, Math.PI); c.stroke();
    c.fillStyle = 'rgba(110,116,124,0.45)'; for (let i = 0; i < 5; i++) { const a = 0.45 + i * 0.56; c.beginPath(); c.arc(Math.cos(a) * 0.117 * s, 0.045 * s + Math.sin(a) * 0.03 * s, 0.004 * s, 0, 7); c.fill(); }   // rivets
    const bounce = c.createRadialGradient(0.03 * s, 0.15 * s, 0, 0.03 * s, 0.15 * s, 0.1 * s); bounce.addColorStop(0, 'rgba(120,150,190,0.35)'); bounce.addColorStop(1, 'rgba(120,150,190,0)');
    c.fillStyle = bounce; c.fillRect(-0.12 * s, 0, 0.24 * s, 0.17 * s);
    c.restore(); }
}
// A cast-iron 50-ton weight: dark metal with a rough sheen, bevelled edges, an iron ring on top, raised lettering.
function drawWeight(c, s) {
  c.strokeStyle = '#2b2f34'; c.lineWidth = 0.028 * s; c.beginPath(); c.arc(0, -0.105 * s, 0.065 * s, Math.PI * 1.05, Math.PI * 1.95); c.stroke();   // ring
  c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 2; c.beginPath(); c.arc(0, -0.105 * s, 0.07 * s, Math.PI * 1.15, Math.PI * 1.45); c.stroke();
  const body = new Path2D(); body.moveTo(-0.21 * s, 0.16 * s); body.lineTo(0.21 * s, 0.16 * s); body.lineTo(0.15 * s, -0.1 * s); body.lineTo(-0.15 * s, -0.1 * s); body.closePath();
  const iron = c.createLinearGradient(-0.21 * s, 0, 0.21 * s, 0); iron.addColorStop(0, '#3a3f45'); iron.addColorStop(0.35, '#7d858d'); iron.addColorStop(0.55, '#5c636a'); iron.addColorStop(1, '#2a2e33');
  c.fillStyle = iron; c.fill(body); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(body);
  c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.moveTo(-0.15 * s, -0.1 * s); c.lineTo(0.15 * s, -0.1 * s); c.lineTo(0.16 * s, -0.08 * s); c.lineTo(-0.16 * s, -0.08 * s); c.closePath(); c.fill();   // top bevel
  c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(-0.21 * s, 0.14 * s, 0.42 * s, 0.02 * s);
  c.save(); c.clip(body); c.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i < 40; i++) { c.beginPath(); c.arc(((i * 37) % 40 / 40 - 0.5) * 0.4 * s, ((i * 23) % 40 / 40 - 0.4) * 0.26 * s, 0.006 * s, 0, 7); c.fill(); } c.restore();   // pitted iron
  c.font = `900 ${0.085 * s}px "Trebuchet MS", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillText('50 TON', 0.003 * s, 0.047 * s); c.fillStyle = '#c9ced3'; c.fillText('50 TON', 0, 0.042 * s);
  c.save(); c.clip(body);
  for (const [x, w, l] of [[-0.13, 0.004, 0.09], [-0.1, 0.007, 0.05], [-0.04, 0.005, 0.12], [0.02, 0.003, 0.07], [0.06, 0.006, 0.1], [0.11, 0.004, 0.06], [0.135, 0.008, 0.04]]) {
    const g = c.createLinearGradient(0, -0.1 * s, 0, (-0.1 + l) * s); g.addColorStop(0, 'rgba(140,70,25,0.4)'); g.addColorStop(1, 'rgba(140,70,25,0)'); c.fillStyle = g; c.fillRect(x * s, -0.1 * s, w * s, l * s);   // rust run-off
  }
  const base = c.createLinearGradient(0, 0.11 * s, 0, 0.16 * s); base.addColorStop(0, 'rgba(150,75,30,0)'); base.addColorStop(1, 'rgba(150,75,30,0.5)'); c.fillStyle = base; c.fillRect(-0.21 * s, 0.11 * s, 0.42 * s, 0.05 * s);
  c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-0.18 * s, 0.105 * s); c.lineTo(0.18 * s, 0.105 * s); c.stroke();
  c.fillStyle = 'rgba(220,225,230,0.5)'; for (const [x, y] of [[-0.205, 0.15], [0.2, 0.15], [-0.148, -0.095], [0.146, -0.094]]) { c.beginPath(); c.arc(x * s, y * s, 0.009 * s, 0, 7); c.fill(); }
  c.restore();
}
// The elephant, drawn with shaded, wrinkled grey skin. It tumbles as it falls (the game turns it); here its
// legs paddle, its big ear flaps and its trunk swings and curls in alarm.
function drawElephant(c, s, t, hz) {
  // running (legs swinging), or reared up on its hind legs with the front feet pawing the air
  const st = hz && hz.state, rear = hz && hz.rear || 0, gait = st === 'charge' ? 55 : st === 'run' ? 85 : 0;
  c.save(); if (rear) { c.translate(-0.15 * s, 0.33 * s); c.rotate(-0.65 * rear); c.translate(0.15 * s, -0.33 * s); }
  const skin = (x, y, r) => { const g = c.createRadialGradient(x - r * 0.4, y - r * 0.5, r * 0.1, x, y, r * 1.2); g.addColorStop(0, '#b8bec4'); g.addColorStop(0.55, '#8c939a'); g.addColorStop(1, '#5f666d'); return g; };
  c.lineWidth = 1.5; c.strokeStyle = INK;
  const wrinkle = (x1, y1, x2, y2, bend) => { c.strokeStyle = 'rgba(60,66,72,0.55)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x1, y1); c.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + bend, x2, y2); c.stroke(); };
  // legs, paddling, each pivoting at the hip (far legs darker)
  [[-0.15, 0, 0.8], [-0.05, 1.7, 1], [0.07, 3.1, 0.8], [0.16, 4.4, 1]].forEach(([x, ph, tone]) => {
    c.save(); c.translate(x * s, 0.08 * s);
    c.rotate(rear > 0.3 && x > 0 ? -0.8 + Math.sin(t / 110 + ph) * 0.45 : gait ? Math.sin(t / gait + ph) * 0.55 : Math.sin(t / 400 + ph) * 0.08);
    c.scale(1, 1.7 - 0.45 * (hz && hz.step || 0));                               // long legs; lifted high stepping over a man lying flat
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
  // body: high at the shoulders, sloping to the rump, saggy belly; shaded, with creased, wrinkled skin
  const body = new Path2D();
  body.moveTo(-0.24 * s, 0.03 * s); body.bezierCurveTo(-0.25 * s, -0.08 * s, -0.17 * s, -0.12 * s, -0.08 * s, -0.125 * s);
  body.bezierCurveTo(0.0, -0.14 * s, 0.1 * s, -0.17 * s, 0.17 * s, -0.12 * s); body.bezierCurveTo(0.24 * s, -0.06 * s, 0.24 * s, 0.06 * s, 0.17 * s, 0.13 * s);
  body.bezierCurveTo(0.08 * s, 0.19 * s, -0.08 * s, 0.19 * s, -0.17 * s, 0.13 * s); body.bezierCurveTo(-0.22 * s, 0.1 * s, -0.24 * s, 0.07 * s, -0.24 * s, 0.03 * s); body.closePath();
  c.fillStyle = skin(-0.02 * s, -0.04 * s, 0.26 * s); c.fill(body); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(body);
  c.save(); c.clip(body);
  const belly = c.createLinearGradient(0, 0.02 * s, 0, 0.19 * s); belly.addColorStop(0, 'rgba(40,44,50,0)'); belly.addColorStop(1, 'rgba(40,44,50,0.4)');
  c.fillStyle = belly; c.fillRect(-0.3 * s, 0, 0.6 * s, 0.2 * s);
  skinTexture(c, s, -0.25, -0.17, 0.5, 0.36, 91);
  c.restore();
  for (const [x, b] of [[-0.14, 0.012], [-0.07, 0.016], [0.08, -0.014], [0.13, -0.012]]) wrinkle(x * s, -0.1 * s, (x + 0.02) * s, 0.14 * s, b * s);
  // head
  const head = new Path2D(); head.arc(0.2 * s, -0.09 * s, 0.115 * s, 0, 7);
  c.fillStyle = skin(0.2 * s, -0.11 * s, 0.12 * s); c.fill(head); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(head);
  c.save(); c.clip(head); skinTexture(c, s, 0.08, -0.21, 0.24, 0.24, 37);
  c.fillStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.ellipse(0.2 * s, -0.17 * s, 0.07 * s, 0.03 * s, -0.2, 0, 7); c.fill(); c.restore();   // domed forehead
  // trunk: a tapering, wrinkled tube that swings and curls
  const sw = Math.sin(t / 160), curl = Math.sin(t / 230 + 1);
  const p0 = [0.27 * s, -0.06 * s], p1 = [0.37 * s, -0.04 * s], p2 = [0.38 * s + sw * 0.05 * s, 0.04 * s + curl * 0.05 * s], p3 = [0.33 * s + sw * 0.1 * s, 0.13 * s + curl * 0.08 * s];
  if (rear) { const up = [[0.33, -0.16], [0.4, -0.27], [0.37, -0.36]]; [p1, p2, p3].forEach((p, i) => { p[0] += (up[i][0] * s - p[0]) * rear; p[1] += (up[i][1] * s - p[1]) * rear; }); }   // trunk raised to trumpet
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
  c.strokeStyle = 'rgba(150,90,95,0.45)'; c.lineWidth = 1;                                  // veins in the ear
  for (const [x2, y2] of [[-0.1, -0.06], [-0.11, 0.02], [-0.07, 0.08]]) { c.beginPath(); c.moveTo(-0.01 * s, -0.02 * s); c.quadraticCurveTo(-0.05 * s, (y2 - 0.02) * s, x2 * s, y2 * s); c.stroke(); }
  wrinkle(-0.03 * s, -0.04 * s, -0.09 * s, 0.05 * s, 0.01 * s); c.restore();
  // a small, wrinkle-ringed elephant eye with long lashes (wide open: it is falling!)
  c.fillStyle = 'rgba(50,54,60,0.5)'; c.beginPath(); c.ellipse(0.248 * s, -0.122 * s, 0.022 * s, 0.015 * s, -0.2, 0, 7); c.fill();
  c.fillStyle = '#f1ece2'; c.beginPath(); c.ellipse(0.248 * s, -0.122 * s, 0.013 * s, 0.009 * s, -0.2, 0, 7); c.fill();
  c.fillStyle = '#5a3a1c'; c.beginPath(); c.arc(0.251 * s, -0.122 * s, 0.0075 * s, 0, 7); c.fill();
  c.fillStyle = '#0c0c0c'; c.beginPath(); c.arc(0.252 * s, -0.122 * s, 0.004 * s, 0, 7); c.fill();
  c.fillStyle = '#fff'; c.beginPath(); c.arc(0.254 * s, -0.125 * s, 0.002 * s, 0, 7); c.fill();
  c.strokeStyle = '#2a2d31'; c.lineWidth = 1;
  for (let i = 0; i < 5; i++) { const x = 0.24 + i * 0.005; c.beginPath(); c.moveTo(x * s, -0.13 * s); c.lineTo((x - 0.004) * s, -0.139 * s); c.stroke(); }
  for (const r of [0.019, 0.025]) { c.strokeStyle = 'rgba(55,60,66,0.5)'; c.beginPath(); c.ellipse(0.248 * s, -0.122 * s, r * s, r * 0.7 * s, -0.2, 0.2, Math.PI - 0.2); c.stroke(); }
  c.restore();
}
// Brushed metal: fine lengthwise grain, some lines brighter, some darker. (Call inside a clip.)
function brushed(c, s, x0, y0, w, h, seed) {
  let r = seed; const rnd = () => { r = (r * 16807) % 2147483647; return (r - 1) / 2147483646; };
  c.lineWidth = 0.7;
  for (let i = 0; i < 60; i++) {
    const y = (y0 + rnd() * h) * s, x = (x0 + rnd() * w * 0.6) * s, l = (0.05 + rnd() * w * 0.5) * s;
    c.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.22)' : 'rgba(40,45,50,0.18)';
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + l, y); c.stroke();
  }
}
// Thick grey skin: a net of fine creases, with lighter dust in the folds. Deterministic so it doesn't flicker.
function skinTexture(c, s, x0, y0, w, h, seed) {
  let r = seed; const rnd = () => { r = (r * 16807) % 2147483647; return (r - 1) / 2147483646; };
  c.lineWidth = 0.8;
  for (let i = 0; i < 90; i++) {
    const x = (x0 + rnd() * w) * s, y = (y0 + rnd() * h) * s, l = (0.01 + rnd() * 0.025) * s, a = rnd() * Math.PI;
    c.strokeStyle = rnd() < 0.7 ? 'rgba(45,50,56,0.28)' : 'rgba(225,228,230,0.22)';
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a) * l * 0.5, y + Math.sin(a) * l * 0.5 + l * 0.2, x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
  }
}
// A blacksmith's anvil: forged steel, a polished working face, a tapering horn, a heavy waisted base.
function drawAnvil(c, s) {
  const p = new Path2D();
  p.moveTo(-0.19 * s, -0.11 * s); p.lineTo(0.14 * s, -0.11 * s); p.quadraticCurveTo(0.2 * s, -0.11 * s, 0.24 * s, -0.095 * s);   // horn tip
  p.quadraticCurveTo(0.16 * s, -0.05 * s, 0.08 * s, -0.04 * s); p.lineTo(0.07 * s, 0.05 * s); p.lineTo(0.14 * s, 0.11 * s); p.lineTo(-0.14 * s, 0.11 * s);
  p.lineTo(-0.07 * s, 0.05 * s); p.lineTo(-0.07 * s, -0.04 * s); p.lineTo(-0.19 * s, -0.05 * s); p.closePath();
  const steel = c.createLinearGradient(0, -0.11 * s, 0, 0.11 * s); steel.addColorStop(0, '#9aa1a9'); steel.addColorStop(0.2, '#4b5158'); steel.addColorStop(0.6, '#33383d'); steel.addColorStop(1, '#1c1f23');
  c.fillStyle = steel; c.fill(p); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(p);
  const face = c.createLinearGradient(-0.19 * s, 0, 0.14 * s, 0); face.addColorStop(0, '#c6ccd2'); face.addColorStop(0.5, '#f1f3f5'); face.addColorStop(1, '#aab1b8');
  c.fillStyle = face; c.fillRect(-0.19 * s, -0.11 * s, 0.33 * s, 0.018 * s);                          // polished top
  c.fillStyle = '#1a1d20'; c.fillRect(-0.15 * s, -0.103 * s, 0.018 * s, 0.012 * s);                  // hardy hole
  c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0.15 * s, -0.1 * s); c.quadraticCurveTo(0.2 * s, -0.1 * s, 0.23 * s, -0.097 * s); c.stroke();
  { let r = 11; const rnd = () => { r = (r * 16807) % 2147483647; return (r - 1) / 2147483646; };
  c.save(); c.clip(p);
  for (let i = 0; i < 45; i++) { c.fillStyle = rnd() < 0.5 ? 'rgba(60,72,100,0.25)' : 'rgba(0,0,0,0.22)'; c.beginPath(); c.ellipse((-0.19 + rnd() * 0.43) * s, (-0.09 + rnd() * 0.2) * s, (0.006 + rnd() * 0.016) * s, (0.004 + rnd() * 0.008) * s, rnd() * 3, 0, 7); c.fill(); }
  const foot = c.createLinearGradient(0, 0.06 * s, 0, 0.11 * s); foot.addColorStop(0, 'rgba(140,70,25,0)'); foot.addColorStop(1, 'rgba(140,70,25,0.5)'); c.fillStyle = foot; c.fillRect(-0.2 * s, 0.06 * s, 0.4 * s, 0.05 * s);
  c.restore();
  c.strokeStyle = 'rgba(0,0,0,0.15)'; c.lineWidth = 1;
  for (let i = 0; i < 9; i++) { const x = (-0.16 + rnd() * 0.28) * s; c.beginPath(); c.arc(x, -0.1 * s, 0.006 * s, 0.2, Math.PI - 0.2); c.stroke(); }   // hammer marks
  }
}
// A small propeller plane seen side-on: a shaded fuselage, a glass canopy with the pilot, a wing, a tail
// fin and tailplane, a spinning propeller disc and a smoke trail. The game turns it along its dive.
function drawPlane(c, s, t) {
  c.save();
  for (let i = 0; i < 5; i++) { c.fillStyle = `rgba(90,90,90,${0.45 - i * 0.08})`; c.beginPath(); c.arc(-0.3 * s - i * 0.07 * s, Math.sin(t / 100 + i) * 0.02 * s, 0.035 * s + i * 0.018 * s, 0, 7); c.fill(); }
  const fus = new Path2D();
  fus.moveTo(0.22 * s, 0); fus.quadraticCurveTo(0.2 * s, -0.06 * s, 0.1 * s, -0.055 * s); fus.lineTo(-0.2 * s, -0.025 * s); fus.lineTo(-0.27 * s, -0.02 * s);
  fus.lineTo(-0.27 * s, 0.01 * s); fus.lineTo(-0.2 * s, 0.02 * s); fus.lineTo(0.1 * s, 0.05 * s); fus.quadraticCurveTo(0.2 * s, 0.05 * s, 0.22 * s, 0); fus.closePath();
  // tail fin and tailplane behind the body
  const finG = c.createLinearGradient(0, -0.13 * s, 0, 0); finG.addColorStop(0, '#d9480f'); finG.addColorStop(1, '#a33508');
  c.fillStyle = finG; c.beginPath(); c.moveTo(-0.2 * s, -0.025 * s); c.lineTo(-0.26 * s, -0.13 * s); c.lineTo(-0.22 * s, -0.13 * s); c.lineTo(-0.15 * s, -0.03 * s); c.closePath(); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.2; c.stroke();
  const body = c.createLinearGradient(0, -0.06 * s, 0, 0.05 * s); body.addColorStop(0, '#ffffff'); body.addColorStop(0.45, '#dee2e6'); body.addColorStop(1, '#868e96');
  c.fillStyle = body; c.fill(fus); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(fus);
  c.save(); c.clip(fus); c.fillStyle = '#e8590c'; c.fillRect(-0.27 * s, -0.005 * s, 0.5 * s, 0.012 * s); c.restore();   // stripe
  // canopy with the pilot
  const can = c.createLinearGradient(0, -0.1 * s, 0, -0.05 * s); can.addColorStop(0, '#d0ebff'); can.addColorStop(1, '#3b5b7a');
  c.fillStyle = can; c.beginPath(); c.moveTo(0.1 * s, -0.055 * s); c.quadraticCurveTo(0.06 * s, -0.105 * s, -0.01 * s, -0.1 * s); c.lineTo(-0.03 * s, -0.045 * s); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#5c3d2e'; c.beginPath(); c.arc(0.035 * s, -0.07 * s, 0.014 * s, 0, 7); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.moveTo(0.075 * s, -0.08 * s); c.lineTo(0.05 * s, -0.095 * s); c.lineTo(0.045 * s, -0.09 * s); c.closePath(); c.fill();
  // wing (seen edge-on, slightly from above) and tailplane
  const wing = c.createLinearGradient(0, -0.01 * s, 0, 0.04 * s); wing.addColorStop(0, '#f1f3f5'); wing.addColorStop(1, '#868e96');
  c.fillStyle = wing; c.beginPath(); c.moveTo(0.08 * s, 0.0); c.lineTo(-0.06 * s, 0.0); c.lineTo(-0.1 * s, 0.045 * s); c.lineTo(0.05 * s, 0.045 * s); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(-0.19 * s, 0.0); c.lineTo(-0.27 * s, 0.0); c.lineTo(-0.28 * s, 0.022 * s); c.lineTo(-0.2 * s, 0.022 * s); c.closePath(); c.fill(); c.stroke();
  // nose spinner and the spinning propeller (a blurred disc)
  const disc = c.createRadialGradient(0.235 * s, 0, 0, 0.235 * s, 0, 0.11 * s); disc.addColorStop(0, 'rgba(60,60,60,0.35)'); disc.addColorStop(1, 'rgba(60,60,60,0.05)');
  c.fillStyle = disc; c.beginPath(); c.ellipse(0.235 * s, 0, 0.012 * s, 0.11 * s, 0, 0, 7); c.fill();
  c.strokeStyle = 'rgba(30,30,30,0.7)'; c.lineWidth = 2; const pa = t / 20;
  c.beginPath(); c.moveTo(0.235 * s, -Math.cos(pa) * 0.11 * s); c.lineTo(0.235 * s, Math.cos(pa) * 0.11 * s); c.stroke();
  c.fillStyle = '#e03131'; c.beginPath(); c.ellipse(0.228 * s, 0, 0.018 * s, 0.022 * s, 0, 0, 7); c.fill(); c.strokeStyle = INK; c.lineWidth = 1; c.stroke();
  c.restore();
  c.save(); c.clip(fus);
  c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = 1;
  for (const x of [0.12, 0.0, -0.1, -0.19]) { c.beginPath(); c.moveTo(x * s, -0.07 * s); c.lineTo((x - 0.005) * s, 0.06 * s); c.stroke(); }
  c.fillStyle = 'rgba(60,60,60,0.35)'; for (let x = -0.25; x < 0.18; x += 0.018) { c.beginPath(); c.arc(x * s, 0.03 * s, 0.0025 * s, 0, 7); c.fill(); }
  const ex = c.createLinearGradient(0.17 * s, 0, -0.12 * s, 0); ex.addColorStop(0, 'rgba(40,35,30,0.55)'); ex.addColorStop(1, 'rgba(40,35,30,0)');
  c.fillStyle = ex; c.fillRect(-0.12 * s, 0.012 * s, 0.29 * s, 0.03 * s);
  c.restore();
  c.strokeStyle = '#495057'; c.lineWidth = 0.01 * s; c.lineCap = 'round';
  c.beginPath(); c.moveTo(0.03 * s, 0.045 * s); c.lineTo(0.05 * s, 0.09 * s); c.moveTo(0.0, 0.045 * s); c.lineTo(0.035 * s, 0.09 * s); c.stroke();
  c.fillStyle = '#1f1f1f'; c.beginPath(); c.arc(0.045 * s, 0.095 * s, 0.022 * s, 0, 7); c.fill();
  c.fillStyle = '#adb5bd'; c.beginPath(); c.arc(0.045 * s, 0.095 * s, 0.008 * s, 0, 7); c.fill();
  c.fillStyle = '#1f1f1f'; c.beginPath(); c.arc(-0.255 * s, 0.03 * s, 0.009 * s, 0, 7); c.fill();
}

// A red sedan, side view: glossy shaded paintwork with a reflection, tinted windows reflecting the sky,
// chrome trim, door lines, headlight glow, tail light, and wheels with tyre tread and spoked rims that turn.
// A running pig: shaded pink hide, a wet snout, floppy ears, a curly tail and trotting legs with hooves.
function drawPig(c, s, t) {
  const run = Math.sin(t / 55);
  const pink = (x, y, r) => { const g = c.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r * 1.15); g.addColorStop(0, '#ffe0e9'); g.addColorStop(0.55, '#f7a8c0'); g.addColorStop(1, '#c9718e'); return g; };
  c.lineWidth = 1.5; c.strokeStyle = INK;
  for (const [x, ph, far] of [[-0.12, 1, true], [0.08, -1, true], [-0.06, -1, false], [0.14, 1, false]]) {   // legs: far pair darker
    c.save(); c.translate(x * s, 0.06 * s); c.rotate(run * ph * 0.5);
    c.globalAlpha = far ? 0.8 : 1;
    c.beginPath(); c.roundRect ? c.roundRect(-0.022 * s, 0, 0.044 * s, 0.085 * s, 0.015 * s) : c.rect(-0.022 * s, 0, 0.044 * s, 0.085 * s); c.fillStyle = pink(0, 0.04 * s, 0.05 * s); c.fill(); c.stroke();
    c.fillStyle = '#5c3d2e'; c.fillRect(-0.022 * s, 0.075 * s, 0.044 * s, 0.014 * s);                 // hoof
    c.restore();
  }
  c.strokeStyle = '#d97a98'; c.lineWidth = 0.012 * s + 1; c.beginPath(); c.moveTo(-0.2 * s, -0.02 * s);       // curly tail
  c.bezierCurveTo(-0.27 * s, -0.08 * s, -0.22 * s, -0.12 * s, -0.25 * s, -0.04 * s); c.stroke();
  c.beginPath(); c.ellipse(0, 0, 0.2 * s, 0.11 * s, 0, 0, 7); c.fillStyle = pink(-0.02 * s, -0.02 * s, 0.2 * s); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke();
  c.strokeStyle = 'rgba(180,90,120,0.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-0.08 * s, 0.07 * s); c.quadraticCurveTo(0, 0.1 * s, 0.08 * s, 0.07 * s); c.stroke();   // belly crease
  c.save(); c.beginPath(); c.ellipse(0, 0, 0.2 * s, 0.11 * s, 0, 0, 7); c.clip();                          // bristles and mud
  c.strokeStyle = 'rgba(255,240,240,0.5)'; c.lineWidth = 0.7;
  for (let i = 0; i < 26; i++) { const x = (-0.18 + i * 0.014) * s, y = -Math.sqrt(Math.max(0, 1 - (x / (0.2 * s)) ** 2)) * 0.11 * s; c.beginPath(); c.moveTo(x, y + 0.004 * s); c.lineTo(x - 0.006 * s, y - 0.006 * s); c.stroke(); }
  c.fillStyle = 'rgba(110,80,50,0.45)';
  for (const [x, y, r] of [[-0.12, 0.06, 0.03], [-0.05, 0.085, 0.022], [0.09, 0.075, 0.018], [-0.16, 0.02, 0.016]]) { c.beginPath(); c.ellipse(x * s, y * s, r * s, r * 0.6 * s, 0.3, 0, 7); c.fill(); }
  c.restore();
  c.beginPath(); c.arc(0.18 * s, -0.04 * s, 0.09 * s, 0, 7); c.fillStyle = pink(0.18 * s, -0.05 * s, 0.09 * s); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke();
  c.save(); c.translate(0.15 * s, -0.11 * s); c.rotate(0.6 + Math.sin(t / 70) * 0.15);                     // floppy ear
  c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(0.05 * s, -0.04 * s, 0.07 * s, 0.01 * s); c.quadraticCurveTo(0.03 * s, 0.03 * s, 0, 0); c.fillStyle = '#e88aa8'; c.fill(); c.stroke(); c.restore();
  const snout = c.createRadialGradient(0.27 * s, -0.03 * s, 0, 0.27 * s, -0.02 * s, 0.05 * s); snout.addColorStop(0, '#ffc9d9'); snout.addColorStop(1, '#e07d9b');
  c.beginPath(); c.ellipse(0.27 * s, -0.02 * s, 0.035 * s, 0.045 * s, 0, 0, 7); c.fillStyle = snout; c.fill(); c.stroke();
  c.fillStyle = '#8c3b55'; c.beginPath(); c.ellipse(0.275 * s, -0.035 * s, 0.007 * s, 0.01 * s, 0, 0, 7); c.ellipse(0.275 * s, -0.005 * s, 0.007 * s, 0.01 * s, 0, 0, 7); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.arc(0.262 * s, -0.045 * s, 0.006 * s, 0, 7); c.fill();   // wet shine
  c.fillStyle = '#2b1d14'; c.beginPath(); c.arc(0.205 * s, -0.08 * s, 0.012 * s, 0, 7); c.fill();
  c.fillStyle = '#fff'; c.beginPath(); c.arc(0.208 * s, -0.083 * s, 0.004 * s, 0, 7); c.fill();
  c.strokeStyle = 'rgba(60,30,30,0.7)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0.185 * s, -0.1 * s); c.lineTo(0.225 * s, -0.093 * s); c.stroke();   // angry brow
  c.fillStyle = 'rgba(160,110,70,0.55)'; for (const [x, y, r] of [[-0.3, 0.13, 0.03], [-0.36, 0.14, 0.02], [-0.25, 0.145, 0.018]]) { c.beginPath(); c.arc(x * s, y * s, r * s, 0, 7); c.fill(); }   // dust
}
// A bouncing tire: black rubber with chunky tread blocks, sidewall lettering and a shiny steel rim.
function drawTire(c, s, t) {
  c.save(); c.rotate(t / 90);
  const rub = c.createRadialGradient(-0.04 * s, -0.04 * s, 0.02 * s, 0, 0, 0.13 * s); rub.addColorStop(0, '#4b4f55'); rub.addColorStop(1, '#121315');
  c.fillStyle = rub; c.beginPath(); c.arc(0, 0, 0.13 * s, 0, 7); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke();
  c.fillStyle = '#0a0a0b'; for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; c.save(); c.rotate(a); c.fillRect(0.115 * s, -0.012 * s, 0.02 * s, 0.024 * s); c.restore(); }   // tread blocks
  c.fillStyle = 'rgba(255,255,255,0.35)'; c.font = `bold ${0.018 * s}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let i = 0; i < 2; i++) { c.save(); c.rotate(i * Math.PI); c.translate(0, -0.094 * s); c.fillText('RADIAL', 0, 0); c.restore(); }
  const rim = c.createRadialGradient(-0.02 * s, -0.02 * s, 0, 0, 0, 0.07 * s); rim.addColorStop(0, '#f8f9fa'); rim.addColorStop(0.7, '#adb5bd'); rim.addColorStop(1, '#5c636a');
  c.fillStyle = rim; c.beginPath(); c.arc(0, 0, 0.068 * s, 0, 7); c.fill(); c.strokeStyle = INK; c.lineWidth = 1; c.stroke();
  c.fillStyle = '#495057'; for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; c.beginPath(); c.arc(Math.cos(a) * 0.035 * s, Math.sin(a) * 0.035 * s, 0.008 * s, 0, 7); c.fill(); }   // wheel nuts
  c.fillStyle = '#343a40'; c.beginPath(); c.arc(0, 0, 0.016 * s, 0, 7); c.fill();
  c.fillStyle = '#2b2f33';
  for (let i = 0; i < 5; i++) { const a = (i + 0.5) / 5 * Math.PI * 2; c.beginPath(); c.arc(0, 0, 0.062 * s, a - 0.36, a + 0.36); c.arc(0, 0, 0.044 * s, a + 0.3, a - 0.3, true); c.closePath(); c.fill(); }
  c.strokeStyle = 'rgba(0,0,0,0.8)'; c.lineWidth = 1;
  for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2; c.beginPath(); c.moveTo(Math.cos(a) * 0.108 * s, Math.sin(a) * 0.108 * s); c.lineTo(Math.cos(a + 0.05) * 0.128 * s, Math.sin(a + 0.05) * 0.128 * s); c.stroke(); }
  c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 0.01 * s; c.beginPath(); c.arc(0, 0, 0.085 * s, Math.PI * 1.1, Math.PI * 1.6); c.stroke();
  c.restore();
  const dirt = c.createLinearGradient(0, 0.05 * s, 0, 0.13 * s); dirt.addColorStop(0, 'rgba(120,95,60,0)'); dirt.addColorStop(1, 'rgba(120,95,60,0.35)');   // dust from the road
  c.fillStyle = dirt; c.beginPath(); c.arc(0, 0, 0.13 * s, 0, Math.PI); c.fill();
}

// ---------------------------------------------------------------- air (head height)
// A bald eagle in flight: a shaded dark-brown body, white head and tail, hooked yellow beak, a fierce eye,
// yellow talons, and broad wings with layered feathers and separate fingered flight feathers at the tips.
function drawEagle(c, s, t, hz) {
  const flap = Math.sin(hz && hz.flapPh != null ? hz.flapPh : t / 70);                                                  // wings beat
  const wing = (far) => {
    c.save(); c.translate(-0.01 * s, -0.025 * s); c.rotate((far ? -0.5 : 0) + flap * 0.75 - 0.25); if (far) c.scale(0.85, 0.85);
    const g = c.createLinearGradient(0, 0, 0, -0.22 * s); g.addColorStop(0, far ? '#3b2716' : '#5a3a20'); g.addColorStop(1, far ? '#21150b' : '#3a2412');
    c.fillStyle = g; c.strokeStyle = INK; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(0.05 * s, 0); c.quadraticCurveTo(0.06 * s, -0.12 * s, 0.0, -0.2 * s); c.lineTo(-0.1 * s, -0.17 * s); c.quadraticCurveTo(-0.08 * s, -0.08 * s, -0.06 * s, 0); c.closePath(); c.fill(); c.stroke();
    for (let i = 0; i < 5; i++) {                                                 // fingered flight feathers at the tip
      const x = -0.005 * s - i * 0.022 * s, y = -0.2 * s + i * 0.008 * s;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x - 0.01 * s, y - 0.06 * s, x - 0.025 * s, y - 0.075 * s); c.lineTo(x - 0.018 * s, y + 0.005 * s); c.closePath(); c.fill(); c.stroke();
    }
    c.strokeStyle = 'rgba(255,220,170,0.25)'; c.lineWidth = 1;
    for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(0.04 * s - i * 0.02 * s, -0.02 * s); c.lineTo(0.02 * s - i * 0.03 * s, -0.17 * s); c.stroke(); }   // feather lines
    c.strokeStyle = 'rgba(15,8,3,0.4)';
    for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(0.03 * s - i * 0.025 * s - row * 0.012 * s, -0.025 * s - row * 0.04 * s - i * 0.006 * s, 0.012 * s, 0.25, Math.PI - 0.25); c.stroke(); }   // rows of covert feathers
    c.restore();
  };
  wing(true);
  // tail: white fan
  c.fillStyle = '#f1f3f5'; c.strokeStyle = INK; c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(-0.12 * s, -0.01 * s); c.lineTo(-0.22 * s, -0.04 * s); c.quadraticCurveTo(-0.235 * s, 0.0, -0.22 * s, 0.035 * s); c.lineTo(-0.12 * s, 0.02 * s); c.closePath(); c.fill(); c.stroke();
  // body
  const body = c.createRadialGradient(0, -0.02 * s, 0.01 * s, 0, 0, 0.13 * s); body.addColorStop(0, '#6e4a2b'); body.addColorStop(1, '#2e1d0f');
  c.fillStyle = body; c.beginPath(); c.ellipse(0, 0, 0.13 * s, 0.045 * s, -0.05, 0, 7); c.fill(); c.stroke();
  // talons: tucked up under the tail in level flight, swung down and forward, wide open, as it dives
  const tk = hz && hz.talon || 0;
  if (tk < 0.3) {
    c.strokeStyle = '#f5b400'; c.lineWidth = 0.012 * s; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-0.02 * s, 0.035 * s); c.lineTo(-0.06 * s, 0.055 * s); c.moveTo(0.0, 0.035 * s); c.lineTo(-0.04 * s, 0.06 * s); c.stroke();
  } else talonsOut(c, s, tk);
  // head: white, with a hooked yellow beak and a fierce eye
  const head = c.createRadialGradient(0.12 * s, -0.035 * s, 0.005 * s, 0.13 * s, -0.025 * s, 0.05 * s); head.addColorStop(0, '#ffffff'); head.addColorStop(1, '#ced4da');
  c.fillStyle = head; c.strokeStyle = INK; c.lineWidth = 1.2; c.beginPath(); c.ellipse(0.13 * s, -0.025 * s, 0.05 * s, 0.04 * s, 0.1, 0, 7); c.fill(); c.stroke();
  const beak = c.createLinearGradient(0.16 * s, -0.04 * s, 0.21 * s, 0); beak.addColorStop(0, '#ffd43b'); beak.addColorStop(1, '#e8a400');
  c.fillStyle = beak; c.beginPath(); c.moveTo(0.165 * s, -0.04 * s); c.quadraticCurveTo(0.21 * s, -0.04 * s, 0.215 * s, -0.01 * s); c.quadraticCurveTo(0.205 * s, -0.012 * s, 0.195 * s, -0.008 * s); c.lineTo(0.165 * s, -0.01 * s); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#ffd43b'; c.beginPath(); c.arc(0.148 * s, -0.035 * s, 0.009 * s, 0, 7); c.fill();
  c.fillStyle = '#1a1208'; c.beginPath(); c.arc(0.15 * s, -0.035 * s, 0.005 * s, 0, 7); c.fill();
  c.strokeStyle = '#495057'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0.13 * s, -0.05 * s); c.lineTo(0.165 * s, -0.043 * s); c.stroke();   // stern brow
  wing(false);
  c.fillStyle = '#f2c230'; c.beginPath(); c.ellipse(0.168 * s, -0.033 * s, 0.008 * s, 0.009 * s, 0, 0, 7); c.fill();   // cere
  c.fillStyle = '#5a4300'; c.beginPath(); c.ellipse(0.175 * s, -0.031 * s, 0.003 * s, 0.002 * s, 0, 0, 7); c.fill();   // nostril
  if (tk < 0.3) { c.fillStyle = '#111'; for (const [x, y] of [[-0.062, 0.057], [-0.042, 0.062]]) { c.beginPath(); c.arc(x * s, y * s, 0.006 * s, 0, 7); c.fill(); } }   // claws
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
  c.save(); c.clip(body); brushed(c, s, -0.22, -0.045, 0.5, 0.09, 13);
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
// An arrow: a wooden shaft with grain, a sharp steel broadhead, and red-and-white feather fletching.
function drawArrow(c, s) {
  const shaft = c.createLinearGradient(0, -0.01 * s, 0, 0.01 * s); shaft.addColorStop(0, '#d9a066'); shaft.addColorStop(0.5, '#a0522d'); shaft.addColorStop(1, '#6b3519');
  c.fillStyle = shaft; c.fillRect(-0.25 * s, -0.008 * s, 0.45 * s, 0.016 * s); c.strokeStyle = INK; c.lineWidth = 1; c.strokeRect(-0.25 * s, -0.008 * s, 0.45 * s, 0.016 * s);
  c.strokeStyle = 'rgba(80,40,15,0.5)'; c.beginPath(); c.moveTo(-0.2 * s, -0.002 * s); c.lineTo(0.1 * s, -0.003 * s); c.stroke();
  const head = c.createLinearGradient(0, -0.04 * s, 0, 0.04 * s); head.addColorStop(0, '#f1f3f5'); head.addColorStop(0.5, '#adb5bd'); head.addColorStop(1, '#495057');
  c.fillStyle = head; c.beginPath(); c.moveTo(0.285 * s, 0); c.lineTo(0.19 * s, -0.038 * s); c.lineTo(0.21 * s, 0); c.lineTo(0.19 * s, 0.038 * s); c.closePath(); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.2; c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.moveTo(0.28 * s, -0.002 * s); c.lineTo(0.2 * s, -0.032 * s); c.stroke();
  for (const [sy, col] of [[-1, '#e03131'], [1, '#f8f9fa']]) {
    c.fillStyle = col; c.beginPath(); c.moveTo(-0.17 * s, sy * 0.008 * s); c.quadraticCurveTo(-0.2 * s, sy * 0.045 * s, -0.26 * s, sy * 0.045 * s); c.lineTo(-0.245 * s, sy * 0.008 * s); c.closePath(); c.fill(); c.strokeStyle = INK; c.lineWidth = 1; c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.2)'; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-0.19 * s - i * 0.015 * s, sy * 0.01 * s); c.lineTo(-0.2 * s - i * 0.015 * s, sy * 0.038 * s); c.stroke(); }
  }
  c.fillStyle = '#2b2b2b'; c.fillRect(-0.268 * s, -0.01 * s, 0.02 * s, 0.02 * s);
  c.fillStyle = '#9a9a9a'; c.fillRect(-0.268 * s, -0.002 * s, 0.009 * s, 0.004 * s);          // nock slot for the bowstring
  c.strokeStyle = '#4a3020'; c.lineWidth = 1.2;
  for (const x of [-0.168, -0.162, -0.156, 0.178, 0.184]) { c.beginPath(); c.moveTo(x * s, -0.009 * s); c.lineTo(x * s, 0.009 * s); c.stroke(); }
}
// A tomahawk: a wooden handle with grain, a leather wrap and feathers, and a big steel head with a broad
// crescent blade (pointing towards -y) and a short hammer back (+y). The game spins it.
function drawTomahawk(c, s) {
  for (const [a, col] of [[0.5, '#e03131'], [0.85, '#f8f9fa']]) {                                 // feathers
    c.save(); c.translate(-0.165 * s, 0.005 * s); c.rotate(a);
    c.beginPath(); c.ellipse(0, 0.035 * s, 0.012 * s, 0.035 * s, 0, 0, 7); c.fillStyle = col; c.fill(); c.strokeStyle = INK; c.lineWidth = 1; c.stroke(); c.restore();
  }
  const wood = c.createLinearGradient(0, -0.013 * s, 0, 0.013 * s); wood.addColorStop(0, '#d9a066'); wood.addColorStop(0.5, '#a0522d'); wood.addColorStop(1, '#5e2e13');
  c.fillStyle = wood; c.beginPath(); c.roundRect ? c.roundRect(-0.175 * s, -0.012 * s, 0.32 * s, 0.024 * s, 0.01 * s) : c.rect(-0.175 * s, -0.012 * s, 0.32 * s, 0.024 * s); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.2; c.stroke();
  c.strokeStyle = 'rgba(70,35,12,0.5)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-0.1 * s, -0.004 * s); c.lineTo(0.08 * s, -0.005 * s); c.moveTo(-0.06 * s, 0.005 * s); c.lineTo(0.06 * s, 0.004 * s); c.stroke();
  c.fillStyle = '#4a2f20'; for (let i = 0; i < 5; i++) c.fillRect(-0.155 * s + i * 0.016 * s, -0.012 * s, 0.008 * s, 0.024 * s);   // leather wrap
  // steel head: socket around the handle, broad crescent blade, hammer back
  const head = new Path2D();
  head.moveTo(0.085 * s, -0.016 * s); head.lineTo(0.06 * s, -0.11 * s);                              // blade rear edge
  head.quadraticCurveTo(0.12 * s, -0.16 * s, 0.2 * s, -0.12 * s);                                    // crescent cutting edge
  head.quadraticCurveTo(0.17 * s, -0.07 * s, 0.145 * s, -0.016 * s);
  head.lineTo(0.15 * s, 0.016 * s); head.lineTo(0.14 * s, 0.05 * s); head.lineTo(0.095 * s, 0.05 * s); head.lineTo(0.085 * s, 0.016 * s); head.closePath();
  const steel = c.createLinearGradient(0.06 * s, -0.15 * s, 0.17 * s, 0.05 * s); steel.addColorStop(0, '#f8f9fa'); steel.addColorStop(0.4, '#adb5bd'); steel.addColorStop(1, '#495057');
  c.fillStyle = steel; c.fill(head); c.strokeStyle = INK; c.lineWidth = 1.3; c.stroke(head);
  c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.beginPath(); c.moveTo(0.072 * s, -0.112 * s); c.quadraticCurveTo(0.122 * s, -0.152 * s, 0.192 * s, -0.12 * s); c.stroke();   // bright cutting edge
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0.088 * s, -0.016 * s, 0.058 * s, 0.032 * s);       // socket shadow
  { let r = 17; const rnd = () => { r = (r * 16807) % 2147483647; return (r - 1) / 2147483646; };
  c.save(); c.clip(head);
  for (let i = 0; i < 40; i++) { c.fillStyle = rnd() < 0.6 ? 'rgba(30,35,40,0.25)' : 'rgba(255,255,255,0.25)'; c.beginPath(); c.arc((0.06 + rnd() * 0.14) * s, (-0.15 + rnd() * 0.2) * s, (0.002 + rnd() * 0.005) * s, 0, 7); c.fill(); }
  const bevel = c.createLinearGradient(0.1 * s, -0.1 * s, 0.15 * s, -0.15 * s); bevel.addColorStop(0, 'rgba(255,255,255,0)'); bevel.addColorStop(1, 'rgba(255,255,255,0.45)');
  c.strokeStyle = bevel; c.lineWidth = 0.018 * s; c.beginPath(); c.moveTo(0.075 * s, -0.1 * s); c.quadraticCurveTo(0.122 * s, -0.138 * s, 0.185 * s, -0.11 * s); c.stroke();
  c.restore();
  c.strokeStyle = 'rgba(230,210,170,0.7)'; c.lineWidth = 0.8;
  for (let i = 0; i < 5; i++) { const x = (-0.155 + i * 0.016) * s; c.beginPath(); c.moveTo(x, -0.012 * s); c.lineTo(x + 0.008 * s, 0.012 * s); c.stroke(); }   // lacing
  for (const [x, y, col] of [[-0.17, 0.02, '#20c997'], [-0.172, 0.031, '#e03131'], [-0.17, 0.042, '#20c997']]) { c.fillStyle = col; c.beginPath(); c.arc(x * s, y * s, 0.005 * s, 0, 7); c.fill(); }   // beads
  }
}
// A boomerang: carved wood in a V, painted with bright bands, spinning flat. (Elbow at the top, arms down.)
function drawBoomerang(c, s, t, hz) {
  if (hz && !hz.flying && c.globalAlpha === 1) {                       // a faint blur trail behind the spin
    for (const [a, al] of [[-0.2, 0.12], [-0.4, 0.05]]) { c.save(); c.globalAlpha = al; c.rotate(a); drawBoomerang(c, s); c.restore(); }
  }
  const arm = (sx) => {
    const p = new Path2D(); p.moveTo(0, -0.045 * s); p.quadraticCurveTo(sx * 0.09 * s, -0.035 * s, sx * 0.165 * s, 0.045 * s);
    p.quadraticCurveTo(sx * 0.17 * s, 0.07 * s, sx * 0.145 * s, 0.07 * s); p.quadraticCurveTo(sx * 0.08 * s, 0.0, 0, -0.005 * s); p.closePath(); return p;
  };
  for (const sx of [-1, 1]) {
    const p = arm(sx), g = c.createLinearGradient(0, -0.05 * s, 0, 0.07 * s); g.addColorStop(0, '#e0a96d'); g.addColorStop(0.5, '#b5763c'); g.addColorStop(1, '#7a4a1f');
    c.fillStyle = g; c.fill(p); c.save(); c.clip(p);
    for (const [k, col] of [[0.35, '#e03131'], [0.55, '#f8f9fa'], [0.75, '#1c7ed6']]) { c.fillStyle = col; c.save(); c.translate(sx * k * 0.17 * s, (k * 0.1 - 0.035) * s); c.rotate(sx * 0.8); c.fillRect(-0.004 * s, -0.04 * s, 0.012 * s, 0.08 * s); c.restore(); }
    c.restore(); c.strokeStyle = INK; c.lineWidth = 1.2; c.stroke(p);
  }
  for (const sx of [-1, 1]) {
    const p = arm(sx);
    c.save(); c.clip(p);
    c.strokeStyle = 'rgba(80,45,15,0.3)'; c.lineWidth = 0.8;
    for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(0, (-0.04 + k * 0.01) * s); c.quadraticCurveTo(sx * 0.09 * s, (-0.028 + k * 0.012) * s, sx * 0.17 * s, (0.05 + k * 0.006) * s); c.stroke(); }
    for (let i = 0; i < 9; i++) { const u = 0.12 + i * 0.09, x = sx * u * 0.165 * s, y = (-0.028 + u * u * 0.085) * s;
      c.fillStyle = i % 2 ? '#fff4d6' : '#ffd43b'; c.beginPath(); c.arc(x, y, 0.004 * s, 0, 7); c.fill(); }
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, -0.04 * s); c.quadraticCurveTo(sx * 0.09 * s, -0.03 * s, sx * 0.155 * s, 0.04 * s); c.stroke();
    c.restore();
  }
}

// A big frog, side-on and facing +x, about 3/4 of the man's height sitting up. Mottled green-brown skin with dark
// blotches, a pale belly, bulging golden eyes with horizontal pupils, a throat that puffs out as it croaks, long
// webbed back legs folded under it when sitting and stretched out behind when it leaps, and a long pink tongue.
// hz.air: 0 sitting .. 1 in mid-leap; hz.tongue: 0..1 while flicking (else -1); hz.puff: throat 0..1.
function drawFrog(c, s, t, hz) {
  const air = hz && hz.air || 0, tongue = hz && hz.tongue != null ? hz.tongue : -1, puff = hz && hz.puff || 0;
  const mix = (a, b) => a + (b - a) * air, P = (x0, y0, x1, y1) => [mix(x0, x1) * s, mix(y0, y1) * s];
  c.save(); c.translate(0, 0.375 * s);                                             // feet on the ground at y = 0
  const skin = (x, y, r) => { const g = c.createRadialGradient(x - r * 0.3, y - r * 0.5, r * 0.1, x, y, r * 1.2); g.addColorStop(0, '#9cc25a'); g.addColorStop(0.55, '#5f8a35'); g.addColorStop(1, '#3a5a20'); return g; };
  // back legs (far one darker): hip, knee, ankle, webbed foot
  for (const [far, dx] of [[true, -0.03], [false, 0]]) {
    const hip = P(-0.2 + dx, -0.2, -0.22 + dx, -0.28), knee = P(0.02 + dx, -0.15, -0.45 + dx, -0.22), ank = P(-0.16 + dx, -0.03, -0.66 + dx, -0.17), toe = P(0.06 + dx, -0.005, -0.84 + dx, -0.14);
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = far ? '#3d5c22' : '#5a8432'; c.lineWidth = 0.075 * s; c.beginPath(); c.moveTo(...hip); c.lineTo(...knee); c.stroke();
    c.lineWidth = 0.05 * s; c.beginPath(); c.moveTo(...knee); c.lineTo(...ank); c.stroke();
    c.lineWidth = 0.03 * s; c.beginPath(); c.moveTo(...ank); c.lineTo(...toe); c.stroke();
    c.fillStyle = far ? '#4c6e2a' : '#6f9a3e';                                    // webbed toes
    c.beginPath(); c.moveTo(...ank); for (const a of [-0.35, 0, 0.35]) { const d = Math.hypot(toe[0] - ank[0], toe[1] - ank[1]), ang = Math.atan2(toe[1] - ank[1], toe[0] - ank[0]) + a; c.lineTo(ank[0] + Math.cos(ang) * d * 1.05, ank[1] + Math.sin(ang) * d * 1.05); } c.closePath(); c.fill();
  }
  // body: an egg tilted up at the front when sitting, stretched out flat in a leap
  const bx = mix(-0.02, 0.0) * s, by = mix(-0.3, -0.3) * s, rot = mix(-0.45, -0.08);
  c.save(); c.translate(bx, by); c.rotate(rot);
  const body = new Path2D(); body.ellipse(0, 0, mix(0.3, 0.34) * s, mix(0.19, 0.15) * s, 0, 0, 7);
  c.fillStyle = skin(0, 0, 0.3 * s); c.fill(body);
  c.save(); c.clip(body);
  const belly = c.createLinearGradient(0, 0.02 * s, 0, 0.2 * s); belly.addColorStop(0, 'rgba(240,230,170,0)'); belly.addColorStop(1, 'rgba(240,230,170,0.85)');
  c.fillStyle = belly; c.fillRect(-0.4 * s, 0, 0.8 * s, 0.25 * s);
  c.fillStyle = 'rgba(40,55,20,0.55)';                                             // dark blotches
  for (const [x, y, r] of [[-0.15, -0.08, 0.05], [0.0, -0.12, 0.04], [0.12, -0.07, 0.035], [-0.05, -0.02, 0.03], [-0.22, 0.0, 0.03], [0.08, -0.15, 0.025]]) { c.beginPath(); c.ellipse(x * s, y * s, r * s, r * 0.7 * s, 0.4, 0, 7); c.fill(); }
  c.fillStyle = 'rgba(255,255,255,0.15)'; c.beginPath(); c.ellipse(-0.04 * s, -0.12 * s, 0.18 * s, 0.04 * s, 0, 0, 7); c.fill();   // wet sheen
  c.restore();
  c.strokeStyle = 'rgba(30,45,15,0.8)'; c.lineWidth = 1.2; c.stroke(body);
  c.restore();
  // head
  const hx = mix(0.22, 0.3) * s, hy = mix(-0.47, -0.34) * s;
  const head = new Path2D(); head.ellipse(hx, hy, 0.16 * s, 0.11 * s, mix(-0.25, -0.05), 0, 7);
  c.fillStyle = skin(hx, hy, 0.16 * s); c.fill(head); c.strokeStyle = 'rgba(30,45,15,0.8)'; c.lineWidth = 1.2; c.stroke(head);
  // throat puffing out as it croaks
  if (puff > 0.02) { const tr = (0.03 + 0.06 * puff) * s; const tg = c.createRadialGradient(hx + 0.02 * s, hy + 0.08 * s, 0, hx + 0.02 * s, hy + 0.08 * s, tr); tg.addColorStop(0, '#fbf3c8'); tg.addColorStop(1, '#d8c886');
    c.fillStyle = tg; c.beginPath(); c.arc(hx + 0.02 * s, hy + 0.08 * s, tr, 0, 7); c.fill(); }
  // mouth
  c.strokeStyle = '#2c3b16'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(hx - 0.1 * s, hy + 0.03 * s); c.quadraticCurveTo(hx + 0.05 * s, hy + 0.06 * s, hx + 0.155 * s, hy + 0.0 * s); c.stroke();
  c.fillStyle = '#2c3b16'; c.beginPath(); c.arc(hx + 0.13 * s, hy - 0.04 * s, 0.006 * s, 0, 7); c.fill();   // nostril
  // the tongue: shoots out, sticky pink tip, and snaps back
  if (tongue >= 0) {
    const ext = Math.sin(Math.PI * tongue) * 0.42 * s, mx = hx + 0.15 * s, my = hy + 0.01 * s;
    c.strokeStyle = '#e8708a'; c.lineWidth = 0.02 * s; c.lineCap = 'round'; c.beginPath(); c.moveTo(mx, my); c.quadraticCurveTo(mx + ext * 0.5, my - ext * 0.12, mx + ext, my - ext * 0.05); c.stroke();
    c.fillStyle = '#d6476a'; c.beginPath(); c.arc(mx + ext, my - ext * 0.05, 0.022 * s, 0, 7); c.fill();
  }
  // bulging eye on top of the head
  const ex = hx + 0.02 * s, ey = hy - 0.1 * s;
  c.fillStyle = skin(ex, ey, 0.07 * s); c.beginPath(); c.arc(ex, ey, 0.068 * s, 0, 7); c.fill();
  const eg = c.createRadialGradient(ex + 0.01 * s, ey - 0.01 * s, 0, ex, ey, 0.052 * s); eg.addColorStop(0, '#ffe27a'); eg.addColorStop(1, '#b8860b');
  c.fillStyle = eg; c.beginPath(); c.arc(ex + 0.008 * s, ey, 0.05 * s, 0, 7); c.fill();
  c.fillStyle = '#0c0c0c'; c.beginPath(); c.ellipse(ex + 0.01 * s, ey, 0.032 * s, 0.014 * s, 0, 0, 7); c.fill();
  c.fillStyle = '#fff'; c.beginPath(); c.arc(ex - 0.012 * s, ey - 0.02 * s, 0.01 * s, 0, 7); c.fill();
  // front leg: straight down when sitting, reaching forward in a leap
  const sh = P(0.12, -0.3, 0.2, -0.27), fh = P(0.18, -0.005, 0.42, -0.2);
  c.strokeStyle = '#5a8432'; c.lineWidth = 0.04 * s; c.lineCap = 'round'; c.beginPath(); c.moveTo(...sh); c.lineTo(...fh); c.stroke();
  c.fillStyle = '#6f9a3e'; for (const a of [-0.5, 0, 0.5]) { c.beginPath(); c.arc(fh[0] + Math.cos(a) * 0.025 * s, fh[1] + Math.sin(a) * 0.012 * s, 0.01 * s, 0, 7); c.fill(); }
  c.restore();
}
// A kid on a pogo stick, side-on and facing +x: a chrome pole with handlebar grips and foot pegs, a coiled
// spring that squashes on each landing, and a grinning kid in a red helmet, striped T-shirt, shorts and
// sneakers, knees bent, hair flying up as he comes down. (0, 0) is the middle; the rubber foot is at +0.35.
function drawPogo(c, s, t, hz) {
  const comp = hz && hz.comp || 0, fall = hz && hz.vy ? Math.max(-1, Math.min(1, hz.vy / (0.004 * s))) : 0;
  c.save(); c.translate(0, 0.35 * s);
  c.rotate(0.08 + (hz && hz.vy ? -0.04 * fall : 0));                          // leaning into the hop
  const dn = comp * 0.06 * s;                                                  // everything above the spring drops on landing
  // rubber foot and the spring
  c.fillStyle = '#1b1b1b'; c.beginPath(); c.roundRect ? c.roundRect(0.018 * s, -0.03 * s, 0.024 * s, 0.03 * s, 0.008 * s) : c.rect(0.018 * s, -0.03 * s, 0.024 * s, 0.03 * s); c.fill();
  const top = -0.16 * s + dn, bot = -0.03 * s, coils = 7;
  c.strokeStyle = '#c9ced3'; c.lineWidth = 0.007 * s; c.beginPath();
  for (let i = 0; i <= coils * 2; i++) { const y = bot + (top - bot) * i / (coils * 2), x = 0.03 * s + (i % 2 ? 0.018 : -0.018) * s; i ? c.lineTo(x, y) : c.moveTo(0.03 * s, y); }
  c.stroke(); c.strokeStyle = 'rgba(60,60,60,0.6)'; c.lineWidth = 1; c.stroke();
  c.save(); c.translate(0, dn);
  // pole, foot pegs, handlebar
  const pole = c.createLinearGradient(0.02 * s, 0, 0.04 * s, 0); pole.addColorStop(0, '#6c757d'); pole.addColorStop(0.45, '#f8f9fa'); pole.addColorStop(1, '#868e96');
  c.fillStyle = pole; c.fillRect(0.021 * s, -0.44 * s, 0.018 * s, 0.29 * s); c.strokeStyle = INK; c.lineWidth = 1; c.strokeRect(0.021 * s, -0.44 * s, 0.018 * s, 0.29 * s);
  c.fillStyle = '#212529'; c.fillRect(-0.01 * s, -0.17 * s, 0.08 * s, 0.014 * s);
  // the kid: legs bent, feet on the pegs
  const skin = '#f1c7a1';
  const leg = (hip, knee, foot, far) => {
    c.strokeStyle = far ? '#c9a07c' : skin; c.lineWidth = 0.036 * s; c.lineCap = 'round';
    c.beginPath(); c.moveTo(hip[0] * s, hip[1] * s); c.lineTo(knee[0] * s, knee[1] * s); c.lineTo(foot[0] * s, foot[1] * s); c.stroke();
    c.fillStyle = far ? '#c92a2a' : '#e03131'; c.beginPath(); c.ellipse((foot[0] + 0.015) * s, (foot[1] + 0.004) * s, 0.032 * s, 0.016 * s, 0, 0, 7); c.fill();   // sneaker
    c.fillStyle = '#fff'; c.fillRect((foot[0] - 0.012) * s, (foot[1] + 0.012) * s, 0.055 * s, 0.006 * s);
  };
  const kneeOut = 0.05 + comp * 0.02;
  leg([-0.02, -0.33], [kneeOut - 0.01, -0.25], [0.005, -0.18], true);
  leg([-0.005, -0.33], [kneeOut + 0.005, -0.255], [0.02, -0.18], false);
  // shorts
  c.fillStyle = '#1c7ed6'; c.beginPath(); c.moveTo(-0.058 * s, -0.37 * s); c.lineTo(0.04 * s, -0.37 * s); c.lineTo(0.05 * s, -0.295 * s); c.lineTo(-0.045 * s, -0.295 * s); c.closePath(); c.fill(); c.strokeStyle = INK; c.lineWidth = 1; c.stroke();
  // striped T-shirt
  const shirt = new Path2D(); shirt.moveTo(-0.06 * s, -0.37 * s); shirt.lineTo(0.042 * s, -0.37 * s); shirt.lineTo(0.045 * s, -0.49 * s); shirt.quadraticCurveTo(0.0, -0.52 * s, -0.055 * s, -0.495 * s); shirt.closePath();
  c.fillStyle = '#f8f9fa'; c.fill(shirt); c.save(); c.clip(shirt); c.fillStyle = '#e03131'; for (let i = 0; i < 6; i++) c.fillRect(-0.06 * s, (-0.5 + i * 0.024) * s, 0.12 * s, 0.011 * s); c.restore();
  c.strokeStyle = INK; c.lineWidth = 1; c.stroke(shirt);
  // arm reaching to the handlebar grip
  c.strokeStyle = '#e03131'; c.lineWidth = 0.034 * s; c.lineCap = 'round'; c.beginPath(); c.moveTo(0.0, -0.485 * s); c.lineTo(0.02 * s, -0.47 * s); c.stroke();   // T-shirt sleeve
  c.strokeStyle = skin; c.lineWidth = 0.03 * s; c.lineCap = 'round';
  c.beginPath(); c.moveTo(0.0, -0.48 * s); c.lineTo(0.05 * s, -0.45 * s); c.lineTo(0.045 * s, -0.43 * s); c.stroke();
  c.fillStyle = '#c92a2a'; c.fillRect(0.01 * s, -0.445 * s, 0.07 * s, 0.018 * s);                        // handlebar grip (over the hand)
  c.fillStyle = skin; c.beginPath(); c.arc(0.048 * s, -0.436 * s, 0.013 * s, 0, 7); c.fill();
  // neck and head
  c.fillStyle = skin; c.fillRect(-0.012 * s, -0.53 * s, 0.022 * s, 0.03 * s);
  const hx = 0.0, hy = -0.58 * s, r = 0.06 * s;
  const fg = c.createRadialGradient(hx + r * 0.3, hy - r * 0.2, 0, hx, hy, r * 1.1); fg.addColorStop(0, '#fbe0c8'); fg.addColorStop(1, '#d9a47e');
  c.fillStyle = fg; c.beginPath(); c.arc(hx, hy, r, 0, 7); c.fill(); c.strokeStyle = 'rgba(120,70,50,0.8)'; c.lineWidth = 1; c.stroke();
  // hair poking out of the helmet, flying up as he falls
  c.fillStyle = '#8a5a2b';
  for (let i = 0; i < 5; i++) { const bx = hx - r * (0.9 - i * 0.12), by = hy - r * 0.2; c.beginPath(); c.moveTo(bx, by); c.lineTo(bx - r * 0.35, by - r * (0.2 + fall * 0.5 + 0.1 * Math.sin(t / 60 + i))); c.lineTo(bx + r * 0.12, by - r * 0.05); c.closePath(); c.fill(); }
  // helmet with a visor and strap
  const hg = c.createRadialGradient(hx - r * 0.2, hy - r * 0.8, 0, hx, hy - r * 0.4, r * 1.2); hg.addColorStop(0, '#ff8787'); hg.addColorStop(1, '#a51111');
  c.fillStyle = hg; c.beginPath(); c.arc(hx, hy - r * 0.1, r * 1.08, Math.PI * 1.02, Math.PI * 1.98); c.closePath(); c.fill(); c.strokeStyle = INK; c.stroke();
  c.fillStyle = '#7a0d0d'; c.beginPath(); c.moveTo(hx + r * 0.6, hy - r * 0.2); c.lineTo(hx + r * 1.35, hy - r * 0.12); c.lineTo(hx + r * 0.7, hy - r * 0.02); c.closePath(); c.fill();
  c.strokeStyle = '#333'; c.lineWidth = 1; c.beginPath(); c.moveTo(hx - r * 0.3, hy - r * 0.1); c.lineTo(hx + r * 0.2, hy + r * 0.85); c.stroke();
  // face in profile: eye, freckles, a big open grin (wheee!)
  c.fillStyle = '#2b1d14'; c.beginPath(); c.arc(hx + r * 0.5, hy + r * 0.05, r * 0.11, 0, 7); c.fill();
  c.fillStyle = '#fff'; c.beginPath(); c.arc(hx + r * 0.53, hy + r * 0.02, r * 0.04, 0, 7); c.fill();
  c.fillStyle = 'rgba(180,90,50,0.6)'; for (const [fx, fy] of [[0.55, 0.32], [0.68, 0.3], [0.62, 0.4]]) { c.beginPath(); c.arc(hx + r * fx, hy + r * fy, r * 0.04, 0, 7); c.fill(); }
  c.fillStyle = '#e8a87c'; c.beginPath(); c.moveTo(hx + r * 0.95, hy + r * 0.1); c.lineTo(hx + r * 1.12, hy + r * 0.3); c.lineTo(hx + r * 0.92, hy + r * 0.35); c.fill();   // nose
  c.fillStyle = '#7a1f1f'; c.beginPath(); c.moveTo(hx + r * 0.45, hy + r * 0.52); c.quadraticCurveTo(hx + r * 0.75, hy + r * 0.85, hx + r * 0.98, hy + r * 0.5); c.closePath(); c.fill();
  c.fillStyle = '#fff'; c.fillRect(hx + r * 0.55, hy + r * 0.52, r * 0.35, r * 0.08);
  c.fillStyle = '#d9a47e'; c.beginPath(); c.ellipse(hx - r * 0.15, hy + r * 0.12, r * 0.15, r * 0.22, 0, 0, 7); c.fill();   // ear
  c.restore();
  c.restore();
}

// An eagle's legs thrust down and forward for the strike: feathered thighs, scaly yellow legs, and open feet
// with three toes forward and one back, each ending in a black hooked claw. k: 0 tucked .. 1 fully out.
function talonsOut(c, s, k) {
  for (const [dx, far] of [[-0.02, true], [0, false]]) {
    const hip = [-0.01 + dx, 0.03], ank = [0.0 + dx + 0.03 * k, 0.07 + 0.035 * k], foot = [0.03 + dx + 0.05 * k, 0.085 + 0.055 * k];
    c.fillStyle = far ? '#2e1d0f' : '#4a2f18';                                       // feathered thigh
    c.beginPath(); c.ellipse((hip[0] + ank[0]) / 2 * s, (hip[1] + ank[1]) / 2 * s, 0.018 * s, 0.03 * s, -0.5 * k, 0, 7); c.fill();
    c.strokeStyle = far ? '#c99500' : '#f5b400'; c.lineWidth = 0.011 * s; c.lineCap = 'round';
    c.beginPath(); c.moveTo(ank[0] * s, ank[1] * s); c.lineTo(foot[0] * s, foot[1] * s); c.stroke();
    c.strokeStyle = 'rgba(120,80,0,0.6)'; c.lineWidth = 1;                         // scales
    for (let i = 1; i < 4; i++) { const u = i / 4, x = ank[0] + (foot[0] - ank[0]) * u, y = ank[1] + (foot[1] - ank[1]) * u; c.beginPath(); c.moveTo((x - 0.005) * s, y * s); c.lineTo((x + 0.005) * s, y * s); c.stroke(); }
    for (const [a, l] of [[-0.5, 0.04], [0.1, 0.045], [0.7, 0.038], [2.6, 0.028]]) {  // toes spread open
      const ang = a * k + (1 - k) * 1.2, tx = foot[0] + Math.cos(ang) * l, ty = foot[1] + Math.sin(ang) * l;
      c.strokeStyle = far ? '#c99500' : '#f5b400'; c.lineWidth = 0.009 * s;
      c.beginPath(); c.moveTo(foot[0] * s, foot[1] * s); c.lineTo(tx * s, ty * s); c.stroke();
      c.strokeStyle = '#111'; c.lineWidth = 0.006 * s;                              // hooked claw
      c.beginPath(); c.moveTo(tx * s, ty * s); c.quadraticCurveTo((tx + Math.cos(ang) * 0.015) * s, (ty + Math.sin(ang) * 0.015) * s, (tx + Math.cos(ang + 1.6) * 0.012) * s, (ty + Math.sin(ang + 1.6) * 0.012) * s); c.stroke();
    }
  }
}
// The eagle's poop: a white splodge with a grey centre, stretched out as it falls.
function drawPoop(c, s) {
  const g = c.createRadialGradient(-0.008 * s, -0.01 * s, 0, 0, 0, 0.035 * s); g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#e9ecef'); g.addColorStop(1, '#adb5bd');
  c.fillStyle = g; c.beginPath(); c.moveTo(0, -0.045 * s); c.quadraticCurveTo(0.03 * s, 0.0, 0.0, 0.03 * s); c.quadraticCurveTo(-0.03 * s, 0.0, 0, -0.045 * s); c.fill();
  c.fillStyle = 'rgba(90,90,80,0.6)'; c.beginPath(); c.ellipse(0.002 * s, 0.008 * s, 0.009 * s, 0.007 * s, 0, 0, 7); c.fill();
}
export function drawSplat(c, x, y, s, alpha, onHead = false) {
  c.save(); c.globalAlpha = alpha; c.translate(x, y);
  c.fillStyle = '#f8f9fa'; c.strokeStyle = 'rgba(120,120,110,0.6)'; c.lineWidth = 1;
  c.beginPath();
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, r = (i % 2 ? 0.045 : 0.03) * s; c.lineTo(Math.cos(a) * r, Math.sin(a) * r * (onHead ? 0.8 : 0.3)); }
  c.closePath(); c.fill(); c.stroke();
  c.fillStyle = 'rgba(90,90,80,0.55)'; c.beginPath(); c.ellipse(0, 0, 0.012 * s, 0.006 * s, 0, 0, 7); c.fill();
  c.fillStyle = '#f8f9fa'; for (const [dx, dy] of [[0.06, -0.005], [-0.055, 0.004], [0.035, 0.01]]) { c.beginPath(); c.arc(dx * s, dy * s * (onHead ? 2 : 1), 0.006 * s, 0, 7); c.fill(); }
  if (onHead) for (const dx of [-0.02, 0.015]) { c.beginPath(); c.ellipse(dx * s, 0.035 * s, 0.006 * s, 0.014 * s, 0, 0, 7); c.fill(); }   // drips
  c.restore();
}

// A supply pack floating down under a little parachute: a first-aid kit (white, red cross) or an energy
// battery (yellow, with a lightning bolt, glowing). Drawn with the box at +0.06 and the canopy above.
function drawPack(c, s, t, health) {
  const sway = Math.sin(t / 700) * 0.12;
  const halo = c.createRadialGradient(0, 0.02 * s, 0, 0, 0.02 * s, 0.13 * s), pulse = 0.35 + 0.2 * Math.sin(t / 180);
  halo.addColorStop(0, health ? `rgba(255,120,120,${pulse})` : `rgba(255,220,60,${pulse})`); halo.addColorStop(0.5, health ? `rgba(255,255,255,${pulse * 0.5})` : `rgba(255,240,150,${pulse * 0.5})`); halo.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = halo; c.beginPath(); c.arc(0, 0.02 * s, 0.13 * s, 0, 7); c.fill();
  c.save(); c.rotate(sway * 0.5);
  // canopy: striped panels, shaded underneath
  const panels = health ? ['#e03131', '#f8f9fa'] : ['#fcc419', '#212529'];
  for (let i = 0; i < 6; i++) {
    const a0 = Math.PI + i * Math.PI / 6, a1 = a0 + Math.PI / 6;
    c.fillStyle = panels[i % 2]; c.beginPath(); c.moveTo(0, -0.06 * s); c.ellipse(0, -0.06 * s, 0.075 * s, 0.055 * s, 0, a0, a1); c.closePath(); c.fill();
  }
  c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.ellipse(0, -0.06 * s, 0.075 * s, 0.012 * s, 0, 0, Math.PI); c.fill();
  c.strokeStyle = INK; c.lineWidth = 1; c.beginPath(); c.ellipse(0, -0.06 * s, 0.075 * s, 0.055 * s, 0, Math.PI, 0); c.stroke();
  c.strokeStyle = 'rgba(60,60,60,0.7)'; c.lineWidth = 0.8;                              // lines down to the box
  for (const x of [-0.072, -0.03, 0.03, 0.072]) { c.beginPath(); c.moveTo(x * s, -0.058 * s); c.lineTo(x * 0.35 * s, 0.035 * s); c.stroke(); }
  c.restore();
  c.save(); c.translate(0, 0.06 * s); c.rotate(sway * 0.3);
  if (health) {
    const g = c.createLinearGradient(0, -0.03 * s, 0, 0.03 * s); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#ced4da');
    c.fillStyle = g; c.beginPath(); c.roundRect ? c.roundRect(-0.038 * s, -0.026 * s, 0.076 * s, 0.054 * s, 0.008 * s) : c.rect(-0.038 * s, -0.026 * s, 0.076 * s, 0.054 * s); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.2; c.stroke();
    c.fillStyle = '#e03131'; c.fillRect(-0.008 * s, -0.018 * s, 0.016 * s, 0.038 * s); c.fillRect(-0.019 * s, -0.007 * s, 0.038 * s, 0.016 * s);
    c.strokeStyle = '#495057'; c.lineWidth = 0.008 * s; c.beginPath(); c.arc(0, -0.026 * s, 0.012 * s, Math.PI, 0); c.stroke();   // handle
  } else {
    const glow = c.createRadialGradient(0, 0, 0, 0, 0, 0.07 * s); glow.addColorStop(0, `rgba(255,230,80,${0.45 + 0.25 * Math.sin(t / 120)})`); glow.addColorStop(1, 'rgba(255,230,80,0)');
    c.fillStyle = glow; c.beginPath(); c.arc(0, 0, 0.07 * s, 0, 7); c.fill();
    const g = c.createLinearGradient(-0.025 * s, 0, 0.025 * s, 0); g.addColorStop(0, '#e8a400'); g.addColorStop(0.45, '#ffe066'); g.addColorStop(1, '#c78a00');
    c.fillStyle = g; c.beginPath(); c.roundRect ? c.roundRect(-0.024 * s, -0.03 * s, 0.048 * s, 0.06 * s, 0.008 * s) : c.rect(-0.024 * s, -0.03 * s, 0.048 * s, 0.06 * s); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.2; c.stroke();
    c.fillStyle = '#868e96'; c.fillRect(-0.01 * s, -0.037 * s, 0.02 * s, 0.008 * s);
    c.fillStyle = '#212529'; c.beginPath(); c.moveTo(0.006 * s, -0.022 * s); c.lineTo(-0.012 * s, 0.004 * s); c.lineTo(0.0, 0.004 * s); c.lineTo(-0.006 * s, 0.024 * s); c.lineTo(0.013 * s, -0.004 * s); c.lineTo(0.001 * s, -0.004 * s); c.closePath(); c.fill();
  }
  c.restore();
}

// Size on screen, in character heights.
export const sizeOf = kind => ({ w: HAZARDS[kind].w * HAZARDS[kind].scale, h: HAZARDS[kind].h * HAZARDS[kind].scale });

// What is left after a plane crashes: a burning hunk of molten metal with a tail fin sticking out. The fire
// bursts up tall at first, then settles; flickering tongues of flame in layers (red, orange, yellow, a white-hot
// core), sparks drifting up, a glow on the ground, and a column of black smoke. age: ms since the crash.
export function drawWreck(c, x, y, s, age, dir) {
  const fade = Math.min(1, Math.max(0, (4200 - age) / 900));
  const burst = 1 + 1.2 * Math.max(0, 1 - age / 700);                       // flames leap up, then settle
  const settle = age < 2800 ? 1 : fade, tsec = age / 1000;
  c.save(); c.globalAlpha = fade; c.translate(x, y);
  // scorched ground, lit by the fire
  const scorch = c.createRadialGradient(0, 0, 0, 0, 0, s * 0.45); scorch.addColorStop(0, 'rgba(25,18,12,0.8)'); scorch.addColorStop(1, 'rgba(25,18,12,0)');
  c.fillStyle = scorch; c.beginPath(); c.ellipse(0, s * 0.01, s * 0.45, s * 0.06, 0, 0, 7); c.fill();
  const flick = 0.8 + 0.2 * Math.sin(tsec * 17) * Math.sin(tsec * 7);
  const glow = c.createRadialGradient(0, 0, 0, 0, 0, s * 0.7); glow.addColorStop(0, `rgba(255,160,60,${0.5 * flick})`); glow.addColorStop(1, 'rgba(255,120,0,0)');
  c.fillStyle = glow; c.beginPath(); c.ellipse(0, 0, s * 0.7, s * 0.18, 0, 0, 7); c.fill();
  // thick smoke: big soft billows rising, spreading and drifting downwind
  for (let i = 0; i < 14; i++) {
    const t = (tsec * 0.35 + i / 14) % 1, r = s * (0.06 + t * 0.28);
    const px = Math.sin(i * 2.3 + tsec * 0.8) * s * 0.05 + t * t * s * 0.35 * dir, py = -s * 0.18 - t * s * 1.3;
    const al = 0.6 * (1 - t) * Math.min(1, t * 6);
    const g = c.createRadialGradient(px - r * 0.3, py - r * 0.3, r * 0.1, px, py, r);
    g.addColorStop(0, `rgba(70,66,64,${al})`); g.addColorStop(0.6, `rgba(35,33,32,${al * 0.9})`); g.addColorStop(1, 'rgba(30,30,30,0)');
    c.fillStyle = g; c.beginPath(); c.arc(px, py, r, 0, 7); c.fill();
  }
  // the wreck: a crumpled, blackened fuselage with the tail fin sticking up (a little of its orange paint left)
  c.save(); c.scale(dir, 1); c.rotate(0.5);
  const fin = new Path2D(); fin.moveTo(-s * 0.18, -s * 0.02); fin.lineTo(-s * 0.3, -s * 0.22); fin.lineTo(-s * 0.25, -s * 0.22); fin.lineTo(-s * 0.12, -s * 0.06); fin.closePath();
  const fg = c.createLinearGradient(-s * 0.3, -s * 0.22, -s * 0.12, 0); fg.addColorStop(0, '#a8461a'); fg.addColorStop(0.45, '#4a3a33'); fg.addColorStop(1, '#151515');
  c.fillStyle = fg; c.fill(fin); c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 1.2; c.stroke(fin);
  c.restore();
  const hunk = new Path2D();
  hunk.moveTo(-s * 0.24, 0); hunk.lineTo(-s * 0.23, -s * 0.07); hunk.lineTo(-s * 0.17, -s * 0.11); hunk.lineTo(-s * 0.12, -s * 0.09); hunk.lineTo(-s * 0.05, -s * 0.15);
  hunk.lineTo(s * 0.03, -s * 0.13); hunk.lineTo(s * 0.09, -s * 0.18); hunk.lineTo(s * 0.15, -s * 0.12); hunk.lineTo(s * 0.22, -s * 0.09); hunk.lineTo(s * 0.25, -s * 0.03); hunk.lineTo(s * 0.24, 0); hunk.closePath();
  const hg = c.createLinearGradient(0, -s * 0.18, 0, 0); hg.addColorStop(0, '#5a5550'); hg.addColorStop(0.4, '#2a2826'); hg.addColorStop(1, '#0f0e0d');
  c.fillStyle = hg; c.fill(hunk); c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 1.2; c.stroke(hunk);
  c.save(); c.clip(hunk);
  const heat = 0.6 + 0.4 * Math.sin(age / 110);                                    // molten metal glowing through cracks
  const mol = c.createRadialGradient(0, -s * 0.04, 0, 0, -s * 0.04, s * 0.16); mol.addColorStop(0, `rgba(255,${190 + 50 * heat},120,${0.9 * settle})`); mol.addColorStop(0.5, `rgba(255,${90 + 60 * heat},20,${0.6 * settle})`); mol.addColorStop(1, 'rgba(200,40,0,0)');
  c.fillStyle = mol; c.beginPath(); c.ellipse(0, -s * 0.04, s * 0.16, s * 0.06, 0.1, 0, 7); c.fill();
  c.strokeStyle = `rgba(255,${150 + 80 * heat},60,${0.9 * settle})`; c.lineWidth = 1.5;
  for (const [x0, y0, x1, y1] of [[-0.2, -0.04, -0.1, -0.07], [-0.02, -0.12, 0.05, -0.06], [0.1, -0.13, 0.18, -0.05], [-0.13, -0.02, 0.02, -0.03]]) { c.beginPath(); c.moveTo(x0 * s, y0 * s); c.lineTo((x0 + x1) / 2 * s + 2, (y0 + y1) / 2 * s - 2); c.lineTo(x1 * s, y1 * s); c.stroke(); }
  c.restore();
  // fire: many glowing particles rising from the wreck, added together so the thick of the fire burns
  // white-hot and the edges flicker orange and red
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 48; i++) {
    const seed = i * 7.31, life = 0.45 + (i % 7) * 0.06, t = ((tsec + seed) % life) / life;
    const bx = Math.sin(seed * 3.1) * s * 0.2 * (1 - t * 0.5), sway = Math.sin(tsec * 6 + seed) * s * 0.025 * t;
    const px = bx + sway, py = -s * 0.06 - t * s * (0.3 + 0.15 * Math.abs(Math.cos(seed))) * burst * settle;
    const r = s * (0.075 * (1 - t) + 0.02) * (0.8 + 0.4 * Math.abs(Math.sin(seed)));
    const a = (1 - t) * 0.5 * settle, gG = Math.round(220 - 170 * t), gB = Math.round(110 - 100 * t);
    const g = c.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, `rgba(255,${gG},${gB},${a})`); g.addColorStop(0.5, `rgba(255,${Math.round(gG * 0.6)},10,${a * 0.6})`); g.addColorStop(1, 'rgba(180,30,0,0)');
    c.fillStyle = g; c.beginPath(); c.arc(px, py, r, 0, 7); c.fill();
  }
  c.globalCompositeOperation = 'source-over';
  // sparks and embers drifting up
  for (let i = 0; i < 18; i++) {
    const t = (tsec * 0.9 + i / 18) % 1, sx = Math.sin(i * 3.3) * s * 0.2 + Math.sin(tsec * 3 + i) * s * 0.05;
    c.fillStyle = `rgba(255,${180 + 60 * Math.sin(i)},80,${(1 - t) * settle})`;
    c.beginPath(); c.arc(sx, -s * 0.1 - t * s * 0.8 * burst, s * 0.006, 0, 7); c.fill();
  }
  c.restore();
}

// A flying saucer: polished metal shaded top to bottom, a darker rim band with a ring of rotating lights,
// a glowing underside, and a glass dome with a reflection and a grey alien pilot.
function drawUfo(c, s, t, hz) {
  const p = hz && hz.chargeP || 0, ph = hz && hz.lightPh != null ? hz.lightPh : t / 450, pulse = 0.6 + 0.4 * Math.sin(ph * 3);
  if (p > 0) {                                                                      // a radiant halo building as the laser charges
    const halo = c.createRadialGradient(0, 0.01 * s, 0.05 * s, 0, 0.01 * s, (0.3 + 0.25 * p) * s);
    halo.addColorStop(0, `rgba(${Math.round(150 + 105 * p)},255,${Math.round(190 + 65 * p)},${(0.2 + 0.6 * p) * pulse})`); halo.addColorStop(1, 'rgba(150,255,200,0)');
    c.fillStyle = halo; c.beginPath(); c.arc(0, 0.01 * s, (0.3 + 0.25 * p) * s, 0, 7); c.fill();
  }
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
  // the pilot: a grey alien, a big bulbous head on a thin neck, huge glossy black almond eyes, a tiny mouth
  c.fillStyle = '#2c3138'; c.beginPath(); c.ellipse(0, -0.012 * s, 0.045 * s, 0.022 * s, 0, 0, 7); c.fill();          // dark suit
  c.fillStyle = '#9aa29c'; c.fillRect(-0.007 * s, -0.045 * s, 0.014 * s, 0.03 * s);                                  // neck
  const skin = c.createRadialGradient(-0.012 * s, -0.09 * s, 0.003 * s, 0, -0.07 * s, 0.045 * s); skin.addColorStop(0, '#e2e6e2'); skin.addColorStop(0.6, '#b4bcb6'); skin.addColorStop(1, '#7f8882');
  c.fillStyle = skin; c.beginPath(); c.moveTo(0, -0.112 * s); c.bezierCurveTo(0.038 * s, -0.112 * s, 0.042 * s, -0.07 * s, 0.026 * s, -0.055 * s);
  c.bezierCurveTo(0.015 * s, -0.042 * s, 0.006 * s, -0.036 * s, 0, -0.036 * s); c.bezierCurveTo(-0.006 * s, -0.036 * s, -0.015 * s, -0.042 * s, -0.026 * s, -0.055 * s);
  c.bezierCurveTo(-0.042 * s, -0.07 * s, -0.038 * s, -0.112 * s, 0, -0.112 * s); c.fill();
  for (const sx of [-1, 1]) {
    c.fillStyle = '#050608'; c.beginPath(); c.ellipse(sx * 0.014 * s, -0.068 * s, 0.013 * s, 0.007 * s, sx * 0.55, 0, 7); c.fill();
    c.fillStyle = 'rgba(200,220,255,0.75)'; c.beginPath(); c.ellipse(sx * 0.011 * s, -0.071 * s, 0.003 * s, 0.0015 * s, sx * 0.55, 0, 7); c.fill();
    c.fillStyle = '#5d655f'; c.beginPath(); c.arc(sx * 0.003 * s, -0.053 * s, 0.0012 * s, 0, 7); c.fill();          // slit nostrils
  }
  c.strokeStyle = '#5d655f'; c.lineWidth = 1; c.beginPath(); c.moveTo(-0.005 * s, -0.045 * s); c.lineTo(0.005 * s, -0.045 * s); c.stroke();
  c.restore();
  c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 2; c.beginPath(); c.ellipse(0, -0.035 * s, 0.08 * s, 0.07 * s, 0, Math.PI * 1.15, Math.PI * 1.45); c.stroke();  // reflection
  c.strokeStyle = INK; c.lineWidth = 1.2; c.stroke(dome);
  // saucer body: polished metal
  const hull = new Path2D(); hull.ellipse(0, 0, 0.26 * s, 0.06 * s, 0, 0, 7);
  const metal = c.createLinearGradient(0, -0.06 * s, 0, 0.06 * s);
  metal.addColorStop(0, '#f8f9fa'); metal.addColorStop(0.4, '#c5cbd1'); metal.addColorStop(0.55, '#7d858d'); metal.addColorStop(1, '#3d434a');
  c.fillStyle = metal; c.fill(hull); c.save(); c.clip(hull); brushed(c, s, -0.27, -0.065, 0.54, 0.13, 29); c.restore(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(hull);
  c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(0, -0.01 * s, 0.2 * s, 0.03 * s, 0, Math.PI * 1.1, Math.PI * 1.9); c.stroke();  // sheen
  c.fillStyle = '#495057'; c.beginPath(); c.ellipse(0, 0.012 * s, 0.25 * s, 0.022 * s, 0, 0, Math.PI); c.fill();                  // rim band
  // ring of rotating lights round the rim: bright at the front, dim going behind
  const colours = ['#ff4d4d', '#ffe066', '#4dd4ff', '#69db7c'];
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6 + ph, depth = Math.sin(a);
    if (depth < -0.25) continue;
    const x = Math.cos(a) * 0.23 * s, y = 0.016 * s + depth * 0.016 * s, r = (0.013 + 0.008 * depth) * s;
    const col = p > 0.55 ? '#ffffff' : colours[i % 4];                                   // the lights turn white as it charges
    const g = c.createRadialGradient(x, y, 0, x, y, r * 1.8); g.addColorStop(0, '#fff'); g.addColorStop(0.3, col); g.addColorStop(0.55, col); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.globalAlpha = 0.4 + 0.6 * Math.max(0, depth); c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 1.8, 0, 7); c.fill();
  }
  c.globalAlpha = 1;
  if (p > 0) {                                                                         // the emitter underneath flaring up
    const er = (0.008 + 0.035 * p) * s * (hz.charge && hz.charge.lockAt ? 1.2 + 0.3 * Math.sin(t / 30) : pulse);
    const eg = c.createRadialGradient(0, 0.065 * s, 0, 0, 0.065 * s, er * 2);
    eg.addColorStop(0, '#ffffff'); eg.addColorStop(0.4, `rgba(180,255,230,${0.6 + 0.4 * p})`); eg.addColorStop(1, 'rgba(120,255,200,0)');
    c.fillStyle = eg; c.beginPath(); c.arc(0, 0.065 * s, er * 2, 0, 7); c.fill();
  }
}
