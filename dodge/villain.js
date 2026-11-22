// The masked brute: a big lumbering villain in a battered hockey goalie mask, carrying a chainsaw or an
// axe. He stomps towards the player and swings; three punches knock him out.
const OUTLINE = '#1f1a2e';

function limb(c, a, b, w, color) {
  c.lineCap = 'round';
  c.strokeStyle = OUTLINE; c.lineWidth = w + 6; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
  c.strokeStyle = color; c.lineWidth = w; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
}

// v: { x, y (feet), dir (1 = facing right), state, stateAt, weapon, flash, walk } ; s = character height
export function drawVillain(c, v, s, now) {
  const H = s * 1.2;                                       // he is a head taller than the player
  c.save(); c.translate(v.x, v.y);
  if (v.state === 'ko') {                                  // topple over backwards
    const t = Math.min(1, (now - v.stateAt) / 600);
    c.rotate(-v.dir * t * Math.PI / 2);
    c.globalAlpha = Math.max(0, 1 - Math.max(0, now - v.stateAt - 1200) / 600);
  }
  if (v.flash && now < v.flash) c.globalAlpha *= 0.5 + 0.5 * Math.abs(Math.sin(now / 40));
  c.scale(v.dir, 1);
  const P = (x, y) => ({ x: x * H, y: -y * H });
  const step = v.state === 'walk' ? Math.sin(v.walk) : 0;
  // legs and boots
  for (const [hx, sw] of [[-0.06, 1], [0.06, -1]]) {
    const knee = P(hx + step * sw * 0.05, 0.25), foot = P(hx + step * sw * 0.1, 0.02);
    limb(c, P(hx, 0.45), knee, H * 0.075, '#5c4033'); limb(c, knee, foot, H * 0.065, '#5c4033');
    c.fillStyle = '#212529'; c.strokeStyle = OUTLINE; c.lineWidth = 3;
    c.beginPath(); c.ellipse(foot.x + H * 0.03, foot.y + H * 0.005, H * 0.06, H * 0.03, 0, 0, 7); c.fill(); c.stroke();
  }
  // torso: a ragged work jacket
  c.fillStyle = '#3d5a3d'; c.strokeStyle = OUTLINE; c.lineWidth = 4; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(-0.15 * H, -0.78 * H); c.lineTo(0.15 * H, -0.78 * H); c.lineTo(0.12 * H, -0.43 * H);
  c.lineTo(0.07 * H, -0.41 * H); c.lineTo(0.03 * H, -0.44 * H); c.lineTo(-0.02 * H, -0.41 * H); c.lineTo(-0.12 * H, -0.43 * H); c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = '#2b402b'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -0.76 * H); c.lineTo(0, -0.45 * H); c.stroke();
  // back arm
  limb(c, P(-0.12, 0.74), P(-0.15, 0.58), H * 0.06, '#3d5a3d'); limb(c, P(-0.15, 0.58), P(-0.12, 0.46), H * 0.05, '#c9a989');
  // weapon arm: raised during the wind-up, swung forward on the strike
  let raise = 0;
  const since = now - v.stateAt;
  if (v.state === 'windup') raise = Math.min(1, since / 500);
  else if (v.state === 'swing') raise = 1 - Math.min(1, since / 120) * 1.6;
  else if (v.state === 'recover') raise = -0.6 + Math.min(1, since / 600) * 0.6;
  const sh = P(0.12, 0.74), ang = -0.4 + raise * 2.2;      // arm angle: -0.4 forward-down, 1.8 raised overhead
  const el = { x: sh.x + Math.cos(ang) * H * 0.15, y: sh.y - Math.sin(ang) * H * 0.15 };
  const hand = { x: el.x + Math.cos(ang + 0.3) * H * 0.13, y: el.y - Math.sin(ang + 0.3) * H * 0.13 };
  c.save(); c.translate(hand.x, hand.y); c.rotate(-(ang + 0.3) + Math.PI / 2);
  if (v.weapon === 'axe') drawAxe(c, H); else drawChainsaw(c, H, now, v.state);
  c.restore();
  limb(c, sh, el, H * 0.06, '#3d5a3d'); limb(c, el, hand, H * 0.05, '#c9a989');
  c.fillStyle = '#c9a989'; c.strokeStyle = OUTLINE; c.lineWidth = 3; c.beginPath(); c.arc(hand.x, hand.y, H * 0.03, 0, 7); c.fill(); c.stroke();
  // head: messy hair and a cracked hockey goalie mask
  const hx = 0.01 * H, hy = -0.88 * H, r = H * 0.1;
  c.fillStyle = '#2b2b2b'; c.beginPath();
  for (let i = 0; i < 9; i++) { const a = Math.PI * (0.9 + i * 0.15); c.lineTo(hx + Math.cos(a) * r * 1.25, hy + Math.sin(a) * r * 1.25); c.lineTo(hx + Math.cos(a + 0.07) * r * 0.9, hy + Math.sin(a + 0.07) * r * 0.9); }
  c.fill();
  c.fillStyle = '#f1ede4'; c.strokeStyle = OUTLINE; c.lineWidth = 3;
  c.beginPath(); c.ellipse(hx + r * 0.1, hy + r * 0.05, r * 0.82, r * 1.02, 0, 0, 7); c.fill(); c.stroke();
  c.fillStyle = OUTLINE;
  c.beginPath(); c.ellipse(hx - r * 0.05, hy - r * 0.15, r * 0.17, r * 0.12, -0.2, 0, 7); c.fill();
  c.beginPath(); c.ellipse(hx + r * 0.42, hy - r * 0.15, r * 0.14, r * 0.11, 0.2, 0, 7); c.fill();
  for (const [x, y] of [[0.05, 0.3], [0.2, 0.32], [0.35, 0.3], [0.12, 0.5], [0.28, 0.5], [0.2, 0.68]]) { c.beginPath(); c.arc(hx + x * r, hy + y * r, r * 0.05, 0, 7); c.fill(); }
  c.strokeStyle = '#495057'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(hx + r * 0.55, hy - r * 0.8); c.lineTo(hx + r * 0.4, hy - r * 0.45); c.lineTo(hx + r * 0.6, hy - r * 0.3); c.stroke();   // crack
  c.strokeStyle = '#6c757d'; c.lineWidth = 3; c.beginPath(); c.moveTo(hx - r * 0.7, hy - r * 0.1); c.lineTo(hx - r * 0.95, hy - r * 0.15); c.stroke();  // strap
  c.restore();
}

function drawAxe(c, H) {
  c.lineCap = 'round';
  c.strokeStyle = OUTLINE; c.lineWidth = H * 0.035 + 6; c.beginPath(); c.moveTo(0, H * 0.04); c.lineTo(0, -H * 0.34); c.stroke();
  c.strokeStyle = '#a0522d'; c.lineWidth = H * 0.035; c.stroke();
  c.fillStyle = '#adb5bd'; c.strokeStyle = OUTLINE; c.lineWidth = 3;
  c.beginPath(); c.moveTo(-H * 0.02, -H * 0.36); c.lineTo(H * 0.1, -H * 0.42); c.quadraticCurveTo(H * 0.14, -H * 0.33, H * 0.1, -H * 0.24); c.lineTo(-H * 0.02, -H * 0.28); c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = '#f8f9fa'; c.lineWidth = 2; c.beginPath(); c.moveTo(H * 0.11, -H * 0.4); c.quadraticCurveTo(H * 0.135, -H * 0.33, H * 0.105, -H * 0.26); c.stroke();
}

function drawChainsaw(c, H, now, state) {
  const shake = state === 'windup' || state === 'swing' ? Math.sin(now / 15) * H * 0.006 : 0;
  c.translate(shake, 0);
  c.fillStyle = '#adb5bd'; c.strokeStyle = OUTLINE; c.lineWidth = 3;        // guide bar
  c.beginPath(); c.roundRect ? c.roundRect(-H * 0.025, -H * 0.42, H * 0.05, H * 0.3, H * 0.025) : c.rect(-H * 0.025, -H * 0.42, H * 0.05, H * 0.3); c.fill(); c.stroke();
  c.fillStyle = OUTLINE;                                                      // chain teeth, running
  for (let i = 0; i < 9; i++) { const y = -H * 0.41 + ((i * 0.034 + now / 2000) % 0.3) * H; c.fillRect(-H * 0.035, y, H * 0.012, H * 0.01); c.fillRect(H * 0.023, y, H * 0.012, H * 0.01); }
  c.fillStyle = '#f76707';                                                    // motor body
  c.beginPath(); c.roundRect ? c.roundRect(-H * 0.06, -H * 0.13, H * 0.12, H * 0.15, H * 0.02) : c.rect(-H * 0.06, -H * 0.13, H * 0.12, H * 0.15); c.fill(); c.stroke();
  c.fillStyle = '#343a40'; c.fillRect(-H * 0.04, -H * 0.1, H * 0.08, H * 0.02);
  c.strokeStyle = OUTLINE; c.lineWidth = 4; c.beginPath(); c.arc(0, -H * 0.02, H * 0.045, Math.PI * 0.1, Math.PI * 0.9); c.stroke();
  if (state === 'windup' || state === 'swing') {                             // exhaust puffs
    c.fillStyle = 'rgba(120,120,120,0.5)';
    for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(H * 0.08 + i * H * 0.03, -H * 0.05 - i * H * 0.03 - (now / 8 % 10), H * 0.015 + i * H * 0.006, 0, 7); c.fill(); }
  }
}
