// The things to dodge. Sizes and speeds are in "character heights" (s), so the game plays the same on
// any screen. w and h are the drawing's size; scale enlarges it so things look life-sized next to the
// character (a car longer than the character is tall, an elephant bigger still). Each is drawn centred on (0, 0), facing right (+x); the game mirrors it when it moves left.
//   lane 'sky'    falls from above, aimed at the player: step aside
//   lane 'ground' runs along the ground from either side: jump
//   lane 'air'    flies in at head height: duck
// hitH (optional): share of the height that counts as solid, e.g. the eagle's body but not its wingtips.
const OUTLINE = '#1f1a2e';

export const HAZARDS = {
  bomb:     { lane:'sky', scale:1.4, w:0.26, h:0.32, speed:0.95, draw:drawBomb, explodes:true },
  weight:   { lane:'sky', scale:1.5, w:0.42, h:0.32, speed:1.15, draw:drawWeight },
  elephant: { lane:'sky', scale:2.7, w:0.56, h:0.44, speed:0.9,  draw:drawElephant },
  anvil:    { lane:'sky', scale:1.4, w:0.38, h:0.22, speed:1.2,  draw:drawAnvil },
  plane:    { lane:'sky', scale:1.6, w:0.52, h:0.32, speed:1.05, hitR:0.24, dives:true, draw:drawPlane },
  car:      { lane:'ground', scale:1.5, w:0.64, h:0.3, speed:3.5,  draw:drawCar },
  pig:      { lane:'ground', scale:1.4, w:0.44, h:0.28, speed:3.06, draw:drawPig },
  tire:     { lane:'ground', scale:1.3, w:0.26, h:0.26, speed:2.0, draw:drawTire, bounce:true },
  eagle:    { lane:'air', scale:2.6, hitH:0.3, w:0.44, h:0.2, speed:1.4, draw:drawEagle },
  missile:  { lane:'air', twoPass:true, scale:1.5, w:0.5, h:0.12, speed:3.2, draw:drawMissile },
  arrow:    { lane:'air', scale:1.3, w:0.52, h:0.07, speed:7.8,  draw:drawArrow },
  ufo:      { lane:'ufo', scale:1.5, w:0.5, h:0.24, speed:0.5, draw:drawUfo },
  can:      { lane:'air', scale:2.3, w:0.15, h:0.19, speed:2.2, hitH:0.32, arc:true, noMirror:true, draw:drawCan },   // thrown in a shallow arc
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
function drawElephant(c, s, t) {
  // falling feet-first with ears flapping in alarm
  const flap = Math.sin(t / 90) * 0.1;
  ellipse(c, 0, 0.02 * s, 0.24 * s, 0.15 * s, 0, '#adb5bd');
  for (const x of [-0.16, -0.06, 0.06, 0.16]) { rr(c, x * s - 0.035 * s, 0.1 * s, 0.07 * s, 0.11 * s, 3); fillStroke(c, '#adb5bd'); }
  circle(c, 0.2 * s, -0.1 * s, 0.11 * s, '#adb5bd');
  ellipse(c, 0.14 * s, -0.1 * s, 0.08 * s, 0.1 * s, -0.4 + flap, '#ced4da');
  c.beginPath(); c.moveTo(0.29 * s, -0.08 * s); c.quadraticCurveTo(0.36 * s, 0.02 * s, 0.3 * s, 0.1 * s); c.lineWidth = 0.05 * s + 4; c.stroke();
  c.strokeStyle = '#adb5bd'; c.lineWidth = 0.05 * s; c.stroke(); styled(c);
  c.fillStyle = OUTLINE; c.beginPath(); c.arc(0.23 * s, -0.13 * s, 0.015 * s, 0, 7); c.fill();
  c.beginPath(); c.moveTo(-0.24 * s, 0); c.lineTo(-0.3 * s, -0.06 * s); c.stroke();
  // sweat drops
  c.fillStyle = '#74c0fc'; c.beginPath(); c.ellipse(0.32 * s, -0.2 * s, 0.015 * s, 0.025 * s, 0, 0, 7); c.fill();
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

// ---------------------------------------------------------------- ground
function drawCar(c, s, t) {
  c.fillStyle = 'rgba(255,255,255,0.6)';                                   // speed lines
  for (let i = 0; i < 3; i++) c.fillRect(-0.5 * s - i * 0.06 * s, -0.08 * s + i * 0.06 * s, 0.14 * s, 0.012 * s);
  styled(c);
  c.beginPath(); c.moveTo(-0.3 * s, 0.07 * s); c.lineTo(-0.3 * s, -0.03 * s); c.quadraticCurveTo(-0.29 * s, -0.06 * s, -0.2 * s, -0.06 * s);
  c.lineTo(-0.12 * s, -0.14 * s); c.lineTo(0.1 * s, -0.14 * s); c.lineTo(0.18 * s, -0.06 * s); c.lineTo(0.28 * s, -0.04 * s);
  c.quadraticCurveTo(0.32 * s, -0.02 * s, 0.32 * s, 0.07 * s); c.closePath(); fillStroke(c, '#e03131');
  c.beginPath(); c.moveTo(-0.1 * s, -0.06 * s); c.lineTo(-0.07 * s, -0.12 * s); c.lineTo(0.0, -0.12 * s); c.lineTo(0.0, -0.06 * s); c.closePath(); fillStroke(c, '#a5d8ff');
  c.beginPath(); c.moveTo(0.03 * s, -0.06 * s); c.lineTo(0.03 * s, -0.12 * s); c.lineTo(0.09 * s, -0.12 * s); c.lineTo(0.14 * s, -0.06 * s); c.closePath(); fillStroke(c, '#a5d8ff');
  circle(c, 0.3 * s, 0.0, 0.025 * s, '#ffe066');
  for (const x of [-0.18, 0.18]) {
    circle(c, x * s, 0.08 * s, 0.07 * s, '#212529'); circle(c, x * s, 0.08 * s, 0.03 * s, '#ced4da');
    c.save(); c.translate(x * s, 0.08 * s); c.rotate(t / 60); c.strokeStyle = '#495057'; c.beginPath(); c.moveTo(-0.05 * s, 0); c.lineTo(0.05 * s, 0); c.stroke(); c.restore(); styled(c);
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
function drawMissile(c, s, t) {
  const fl = 0.08 * s * (1 + 0.3 * Math.sin(t / 30));
  c.fillStyle = '#ff922b'; c.beginPath(); c.moveTo(-0.22 * s, -0.035 * s); c.lineTo(-0.22 * s - fl, 0); c.lineTo(-0.22 * s, 0.035 * s); c.fill();
  c.fillStyle = '#ffe066'; c.beginPath(); c.moveTo(-0.22 * s, -0.02 * s); c.lineTo(-0.22 * s - fl * 0.6, 0); c.lineTo(-0.22 * s, 0.02 * s); c.fill();
  styled(c);
  c.beginPath(); c.moveTo(-0.22 * s, -0.04 * s); c.lineTo(0.14 * s, -0.04 * s); c.quadraticCurveTo(0.25 * s, -0.03 * s, 0.26 * s, 0); c.quadraticCurveTo(0.25 * s, 0.03 * s, 0.14 * s, 0.04 * s); c.lineTo(-0.22 * s, 0.04 * s); c.closePath();
  fillStroke(c, '#dee2e6');
  c.beginPath(); c.moveTo(0.14 * s, -0.04 * s); c.quadraticCurveTo(0.25 * s, -0.03 * s, 0.26 * s, 0); c.quadraticCurveTo(0.25 * s, 0.03 * s, 0.14 * s, 0.04 * s); c.closePath(); fillStroke(c, '#e03131');
  for (const sy of [-1, 1]) { c.beginPath(); c.moveTo(-0.2 * s, sy * 0.04 * s); c.lineTo(-0.25 * s, sy * 0.09 * s); c.lineTo(-0.13 * s, sy * 0.04 * s); c.closePath(); fillStroke(c, '#e03131'); }
}
function drawArrow(c, s) {
  c.strokeStyle = OUTLINE; c.lineWidth = 0.02 * s + 4; c.beginPath(); c.moveTo(-0.24 * s, 0); c.lineTo(0.2 * s, 0); c.stroke();
  c.strokeStyle = '#a0522d'; c.lineWidth = 0.02 * s; c.stroke(); styled(c);
  c.beginPath(); c.moveTo(0.27 * s, 0); c.lineTo(0.19 * s, -0.035 * s); c.lineTo(0.19 * s, 0.035 * s); c.closePath(); fillStroke(c, '#adb5bd');
  for (const sy of [-1, 1]) { c.beginPath(); c.moveTo(-0.26 * s, sy * 0.035 * s); c.lineTo(-0.18 * s, 0); c.lineTo(-0.2 * s, sy * 0.035 * s); c.closePath(); fillStroke(c, '#e03131'); }
}
// A tin can: beans (blue label with beans) or soup (red and white label). hz.variant picks which.
function drawCan(c, s, t, hz) {
  const beans = !hz || hz.variant !== 'soup';
  const w = 0.14 * s, h = 0.18 * s;
  rr(c, -w / 2, -h / 2, w, h, 0.015 * s); fillStroke(c, '#ced4da');                      // tin
  c.save(); rr(c, -w / 2, -h / 2, w, h, 0.015 * s); c.clip();
  if (beans) {
    c.fillStyle = '#1c7ed6'; c.fillRect(-w / 2, -h * 0.36, w, h * 0.72);
    c.fillStyle = '#fff'; c.font = `900 ${0.034 * s}px "Trebuchet MS", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('BEANS', 0, -h * 0.17);
    c.fillStyle = '#e8590c';                                                                   // a little pile of baked beans
    for (const [x, y] of [[-0.03, 0.1], [0, 0.11], [0.03, 0.1], [-0.015, 0.07], [0.015, 0.07], [0, 0.04]]) {
      c.beginPath(); c.ellipse(x * s * 0.8, y * s * 0.8, 0.013 * s, 0.009 * s, 0.4, 0, 7); c.fill();
    }
  } else {
    c.fillStyle = '#e03131'; c.fillRect(-w / 2, -h * 0.36, w, h * 0.36);
    c.fillStyle = '#fff'; c.fillRect(-w / 2, 0, w, h * 0.36);
    c.fillStyle = '#fff'; c.font = `900 ${0.036 * s}px "Trebuchet MS", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('SOUP', 0, -h * 0.18);
    c.fillStyle = '#ffd43b'; c.beginPath(); c.arc(0, h * 0.18, 0.022 * s, 0, 7); c.fill();       // gold medallion
  }
  c.restore(); styled(c);
  for (const y of [-h / 2 + 0.012 * s, h / 2 - 0.012 * s]) { c.strokeStyle = '#868e96'; c.lineWidth = 2; c.beginPath(); c.moveTo(-w / 2, y); c.lineTo(w / 2, y); c.stroke(); }  // rims
  styled(c); rr(c, -w / 2, -h / 2, w, h, 0.015 * s); c.stroke();
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

// A flying saucer: a domed cockpit with a little green pilot, a rim of blinking lights.
function drawUfo(c, s, t) {
  // glow underneath
  c.fillStyle = 'rgba(140,255,200,0.25)'; c.beginPath(); c.ellipse(0, 0.07 * s, 0.2 * s, 0.05 * s, 0, 0, 7); c.fill();
  // dome and pilot
  c.fillStyle = 'rgba(165,216,255,0.85)'; c.beginPath(); c.ellipse(0, -0.04 * s, 0.1 * s, 0.09 * s, 0, Math.PI, 0); c.fill(); c.stroke();
  c.fillStyle = '#69db7c'; c.beginPath(); c.arc(0, -0.07 * s, 0.035 * s, 0, 7); c.fill();
  c.fillStyle = OUTLINE; c.beginPath(); c.ellipse(-0.013 * s, -0.075 * s, 0.009 * s, 0.014 * s, -0.3, 0, 7); c.ellipse(0.013 * s, -0.075 * s, 0.009 * s, 0.014 * s, 0.3, 0, 7); c.fill();
  // saucer
  c.beginPath(); c.ellipse(0, 0, 0.25 * s, 0.065 * s, 0, 0, 7); c.fillStyle = '#adb5bd'; c.fill(); c.stroke();
  c.beginPath(); c.ellipse(0, -0.012 * s, 0.25 * s, 0.03 * s, 0, Math.PI, 0); c.fillStyle = '#ced4da'; c.fill();
  // a ring of lights rotating round the rim: bright as they come round the front, dim going behind
  const colours = ['#ff4d4d', '#ffe066', '#4dd4ff', '#69db7c'];
  for (let i = 0; i < 10; i++) {
    const a = i * Math.PI / 5 + t / 450, depth = Math.sin(a);            // depth > 0: front of the saucer
    if (depth < -0.3) continue;
    const x = Math.cos(a) * 0.21 * s, y = 0.016 * s + depth * 0.022 * s, r = (0.016 + 0.01 * depth) * s;
    c.globalAlpha = 0.45 + 0.55 * Math.max(0, depth);
    c.fillStyle = colours[i % 4]; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    if (depth > 0.6) { c.globalAlpha = 0.25; c.beginPath(); c.arc(x, y, r * 2.4, 0, 7); c.fill(); }   // glow
  }
  c.globalAlpha = 1;
}
