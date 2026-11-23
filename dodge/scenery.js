// A more lifelike backdrop: a deep blue sky hazing towards the horizon, the sun with a soft glow, shaded
// clouds drifting at different speeds, distant blue mountains, nearer wooded hills and a grassy field.
// Everything that does not move is painted once (when the screen size changes) and reused every frame.

let rng = 1;
const rand = () => { rng = (rng * 16807) % 2147483647; return (rng - 1) / 2147483646; };   // repeatable "random"
const seed = s => { rng = s; };

let cache = null;   // { W, H, groundY, sky, land, clouds: [{ img, x, y, speed, w }] }

function makeCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}

function paintSky(W, H, gY, dpr) {
  const cv = makeCanvas(W * dpr, gY * dpr), c = cv.getContext('2d'); c.scale(dpr, dpr);
  const g = c.createLinearGradient(0, 0, 0, gY);
  g.addColorStop(0, '#2a62b5'); g.addColorStop(0.45, '#5b95d6'); g.addColorStop(0.8, '#a9cdee'); g.addColorStop(1, '#e3eef6');
  c.fillStyle = g; c.fillRect(0, 0, W, gY);
  // the sun and its glow
  const sx = W * 0.84, sy = H * 0.15, r = H * 0.05;
  const glow = c.createRadialGradient(sx, sy, 0, sx, sy, r * 7);
  glow.addColorStop(0, 'rgba(255,250,225,0.9)'); glow.addColorStop(0.15, 'rgba(255,240,190,0.45)'); glow.addColorStop(1, 'rgba(255,240,190,0)');
  c.fillStyle = glow; c.fillRect(0, 0, W, gY);
  const disc = c.createRadialGradient(sx - r * 0.2, sy - r * 0.2, 0, sx, sy, r);
  disc.addColorStop(0, '#fffef6'); disc.addColorStop(1, '#fff1b8');
  c.fillStyle = disc; c.beginPath(); c.arc(sx, sy, r, 0, 7); c.fill();
  return cv;
}

// A soft cumulus cloud: overlapping puffs, sunlit on top and shaded grey-blue underneath.
const PAD = 0.35;   // room around a cloud's puffs on its canvas, as a share of its width
function paintCloud(w, dpr) {
  const h = w * 0.55, cv = makeCanvas(w * (1 + 2 * PAD) * dpr, (h + w * 2 * PAD) * dpr), c = cv.getContext('2d');
  c.scale(dpr, dpr); c.translate(w * PAD, w * PAD);
  const puffs = [];
  const n = 7 + Math.floor(rand() * 5);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), x = w * (0.12 + 0.76 * t + (rand() - 0.5) * 0.06);
    const r = w * (0.09 + 0.12 * Math.sin(Math.PI * t) + rand() * 0.04);
    puffs.push({ x, y: h * 0.68 - r * (0.55 + rand() * 0.35), r });
  }
  // shadowed underside first, then the bright upper parts, then soft highlights
  for (const p of puffs) {
    const g = c.createRadialGradient(p.x, p.y + p.r * 0.35, p.r * 0.2, p.x, p.y, p.r);
    g.addColorStop(0, 'rgba(176,192,214,0.95)'); g.addColorStop(1, 'rgba(176,192,214,0)');
    c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y + p.r * 0.15, p.r, 0, 7); c.fill();
  }
  for (const p of puffs) {
    const g = c.createRadialGradient(p.x - p.r * 0.25, p.y - p.r * 0.35, p.r * 0.1, p.x, p.y, p.r);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.6, 'rgba(244,247,252,0.95)'); g.addColorStop(1, 'rgba(225,233,244,0)');
    c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y - p.r * 0.08, p.r * 0.92, 0, 7); c.fill();
  }
  // flatten the base
  c.globalCompositeOperation = 'destination-out';
  const fade = c.createLinearGradient(0, h * 0.62, 0, h * 0.8);
  fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
  c.fillStyle = fade; c.fillRect(-w * PAD, h * 0.62, w * (1 + 2 * PAD), h + w * PAD);
  return cv;
}

// A mountain range: split the skyline in half again and again, nudging each new point up or down by less
// each time. That gives natural-looking peaks, shoulders and valleys.
function ridge(c, W, baseY, amp, rough, step, colour, fillTo) {
  let pts = [[0, baseY - rand() * amp * 0.5], [W, baseY - rand() * amp * 0.5]];
  let spread = amp;
  while (pts[1][0] - pts[0][0] > step) {
    const next = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      next.push([(x0 + x1) / 2, Math.min(baseY + amp * 0.2, (y0 + y1) / 2 + (rand() - 0.55) * spread)], pts[i]);
    }
    pts = next; spread *= 0.62;                                  // (higher = more jagged peaks)
  }
  c.beginPath(); c.moveTo(0, fillTo);
  for (const [x, y] of pts) c.lineTo(x, y);
  c.lineTo(W, fillTo); c.closePath(); c.fillStyle = colour; c.fill();
  return pts;
}
// Rock: the broad faces turned to the sun (upper right) are lit, those turned away are in shade, fading
// down the mountainside.
function rockFaces(c, pts, H, light, dark, depth) {
  for (let i = 1; i < pts.length; i++) {
    const a0 = pts[Math.max(0, i - 4)], a1 = pts[Math.min(pts.length - 1, i + 3)];
    const slope = (a1[1] - a0[1]) / ((a1[0] - a0[0]) || 1);                         // the slope of the whole face here
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const a = Math.min(0.3, Math.abs(slope) * 0.7), col = slope > 0 ? light : dark, d = H * depth;
    const g = c.createLinearGradient(0, Math.min(y0, y1), 0, Math.max(y0, y1) + d);
    g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1 + 0.5, y1); c.lineTo(x1 + 0.5, y1 + d); c.lineTo(x0, y0 + d); c.closePath(); c.fill();
  }
}
// Snow on the high peaks: a ragged white cap that reaches further down in the gullies.
function snowCaps(c, pts, snowLine, H) {
  c.fillStyle = 'rgba(250,252,255,0.92)';
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if (Math.min(y0, y1) > snowLine) continue;
    const d0 = Math.max(0, snowLine - y0) * (0.5 + rand() * 0.6), d1 = Math.max(0, snowLine - y1) * (0.5 + rand() * 0.6);
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineTo(x1, y1 + d1 * 0.6 + rand() * H * 0.01); c.lineTo(x0, y0 + d0 * 0.6); c.closePath(); c.fill();
  }
}
// A pine tree: a dark trunk and layered, drooping tiers of needles, lit a little on the sunny side.
function pine(c, x, y, h, col, lit) {
  c.fillStyle = '#3b2a1c'; c.fillRect(x - h * 0.03, y - h * 0.12, h * 0.06, h * 0.12);
  for (let k = 0; k < 4; k++) {
    const top = y - h * (0.28 + k * 0.22), bot = y - h * (0.08 + k * 0.2), w = h * (0.32 - k * 0.065);
    c.fillStyle = col; c.beginPath(); c.moveTo(x, top - h * 0.08); c.lineTo(x + w, bot); c.quadraticCurveTo(x, bot - h * 0.05, x - w, bot); c.closePath(); c.fill();
    c.fillStyle = lit; c.beginPath(); c.moveTo(x, top - h * 0.08); c.lineTo(x + w, bot); c.quadraticCurveTo(x + w * 0.4, bot - h * 0.04, x + w * 0.1, bot - h * 0.03); c.closePath(); c.fill();
  }
}

function paintLand(W, H, gY, dpr) {
  const cv = makeCanvas(W * dpr, H * dpr), c = cv.getContext('2d'); c.scale(dpr, dpr);
  seed(4242);
  // distant mountains, hazy blue: rocky faces in sun and shade, ragged snow on the high peaks
  const far = ridge(c, W, gY - H * 0.22, H * 0.28, 0, W / 120, '#8fa9c9', gY);
  rockFaces(c, far, H, '235,242,250', '70,90,120', 0.08);
  snowCaps(c, far, gY - H * 0.36, H);
  const near = ridge(c, W, gY - H * 0.15, H * 0.16, 0, W / 120, '#7a96b8', gY);
  rockFaces(c, near, H, '210,225,240', '55,75,105', 0.06);
  // atmospheric haze over the mountains
  const haze = c.createLinearGradient(0, gY - H * 0.3, 0, gY);
  haze.addColorStop(0, 'rgba(227,238,246,0)'); haze.addColorStop(1, 'rgba(227,238,246,0.55)');
  c.fillStyle = haze; c.fillRect(0, gY - H * 0.3, W, H * 0.3);
  // nearer rolling hills, with clumps of trees
  for (const [base, amp, col, treeCol] of [[gY - H * 0.1, H * 0.05, '#6f9a5c', '#4f7a44'], [gY - H * 0.05, H * 0.04, '#5e8f4a', '#3f6b34']]) {
    const pts = [];
    c.beginPath(); c.moveTo(0, gY);
    for (let x = 0; x <= W + 20; x += 20) {
      const y = base - Math.sin(x / W * Math.PI * (2 + rand() * 0.02) + base) * amp * 0.6 - Math.sin(x / W * 9 + amp) * amp * 0.25;
      c.lineTo(x, y); pts.push([x, y]);
    }
    c.lineTo(W, gY); c.closePath(); c.fillStyle = col; c.fill();
    for (const [x, y] of pts) {                                                       // tree clumps along the crest
      if (rand() < 0.15) continue;
      const far = base < gY - H * 0.07;                                               // further hills: smaller, hazier trees
      for (let n = 0; n < 3; n++) {
        const th = H * (far ? 0.022 + rand() * 0.014 : 0.035 + rand() * 0.02);
        pine(c, x + (rand() - 0.5) * 20, y + rand() * H * (far ? 0.015 : 0.03) + th * 0.1, th, treeCol, far ? 'rgba(170,200,150,0.25)' : 'rgba(150,190,110,0.3)');
      }
    }
  }
  // a lake in the valley, reflecting the sky, with the dark reflection of the far shore and glints of light
  {
    const lx = W * 0.24, ly = gY - H * 0.02, rx = W * 0.17, ry = H * 0.016;
    c.fillStyle = '#c9b48a'; c.beginPath(); c.ellipse(lx, ly + 1, rx + 4, ry + 2, 0, 0, 7); c.fill();       // sandy shore
    const wg = c.createLinearGradient(0, ly - ry, 0, ly + ry); wg.addColorStop(0, '#2f5a3a'); wg.addColorStop(0.25, '#5f8fb8'); wg.addColorStop(0.7, '#9cc3e4'); wg.addColorStop(1, '#6f9cc7');
    c.fillStyle = wg; c.beginPath(); c.ellipse(lx, ly, rx, ry, 0, 0, 7); c.fill();
    c.save(); c.beginPath(); c.ellipse(lx, ly, rx, ry, 0, 0, 7); c.clip();
    for (let i = 0; i < 60; i++) { c.strokeStyle = `rgba(255,255,255,${0.15 + rand() * 0.35})`; c.lineWidth = 1; const x = lx + (rand() - 0.5) * rx * 1.8, y = ly - ry * 0.3 + rand() * ry * 1.2, l = 3 + rand() * 12; c.beginPath(); c.moveTo(x, y); c.lineTo(x + l, y); c.stroke(); }
    c.restore();
  }
  // the field: grass that is brighter in the distance and richer close up, with texture
  const grass = c.createLinearGradient(0, gY - 4, 0, H);
  grass.addColorStop(0, '#78b04f'); grass.addColorStop(0.35, '#5a9a3a'); grass.addColorStop(1, '#3d7426');
  c.fillStyle = grass; c.fillRect(0, gY - 2, W, H - gY + 2);
  for (let i = 0; i < W * 3; i++) {                                                   // blades of grass
    const x = rand() * W, y = gY + Math.pow(rand(), 0.8) * (H - gY), len = 2 + (y - gY) / (H - gY) * 7;
    c.strokeStyle = rand() < 0.5 ? 'rgba(40,90,25,0.5)' : 'rgba(150,200,90,0.45)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rand() - 0.5) * 3, y - len); c.stroke();
  }
  for (let i = 0; i < W / 25; i++) {                                                  // a few wildflowers
    const x = rand() * W, y = gY + 6 + rand() * (H - gY - 10);
    c.fillStyle = ['#fff', '#ffe066', '#f783ac'][i % 3]; c.beginPath(); c.arc(x, y, 1.6, 0, 7); c.fill();
  }
  // a soft line where the field meets the hills
  c.fillStyle = 'rgba(30,70,20,0.25)'; c.fillRect(0, gY - 2, W, 3);
  // a dirt country road along the field, which the cars, the pig and the tire travel on: packed earth, two
  // wheel ruts with a grassy hump between, pebbles, and grass spilling over the edges
  const rt = gY - H * 0.012, rb = gY + H * 0.045;
  const road = c.createLinearGradient(0, rt, 0, rb); road.addColorStop(0, '#b9a07a'); road.addColorStop(0.5, '#a88d66'); road.addColorStop(1, '#94795a');
  c.fillStyle = road; c.fillRect(0, rt, W, rb - rt);
  for (const [y, w] of [[rt + (rb - rt) * 0.3, (rb - rt) * 0.16], [rt + (rb - rt) * 0.75, (rb - rt) * 0.2]]) {
    const rg = c.createLinearGradient(0, y - w, 0, y + w); rg.addColorStop(0, 'rgba(90,68,45,0)'); rg.addColorStop(0.5, 'rgba(90,68,45,0.35)'); rg.addColorStop(1, 'rgba(90,68,45,0)');
    c.fillStyle = rg; c.fillRect(0, y - w, W, w * 2);
  }
  for (let i = 0; i < W * 0.6; i++) {                                                 // pebbles and grit
    const x = rand() * W, y = rt + rand() * (rb - rt), r = 0.5 + rand() * 1.6;
    c.fillStyle = rand() < 0.5 ? 'rgba(80,62,42,0.5)' : 'rgba(235,220,195,0.55)'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  }
  for (let i = 0; i < W * 0.8; i++) {                                                 // the grassy hump and the verges
    const edge = rand(), y = edge < 0.3 ? rt + (rb - rt) * 0.53 : edge < 0.65 ? rt + rand() * 3 : rb - rand() * 3, x = rand() * W;
    c.strokeStyle = rand() < 0.5 ? 'rgba(70,120,40,0.7)' : 'rgba(120,165,70,0.6)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x, y + 2); c.lineTo(x + (rand() - 0.5) * 3, y - 2 - rand() * 4); c.stroke();
  }
  return cv;
}

function build(W, H, gY) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  seed(97);
  const clouds = [];
  for (let i = 0; i < 6; i++) {
    const w = H * (0.22 + rand() * 0.28);
    clouds.push({ img: paintCloud(w, dpr), w, h: w * 0.55, x: rand(), y: 0.04 + rand() * 0.26, speed: 0.004 + rand() * 0.008 * (w / H) });
  }
  cache = { W, H, gY, sky: paintSky(W, H, gY, dpr), land: paintLand(W, H, gY, dpr), clouds };
}

export function drawScenery(c, W, H, gY, now) {
  if (!cache || cache.W !== W || cache.H !== H || cache.gY !== gY) build(W, H, gY);
  c.drawImage(cache.sky, 0, 0, W, gY);
  for (const cl of cache.clouds) {                                                    // bigger clouds drift faster (nearer)
    const span = W + cl.w * 3, x = ((cl.x * span + now / 1000 * cl.speed * W * 3) % span) - cl.w * 1.5;
    c.drawImage(cl.img, x - cl.w * PAD, cl.y * H - cl.w * PAD, cl.w * (1 + 2 * PAD), cl.h + cl.w * 2 * PAD);
  }
  c.drawImage(cache.land, 0, 0, W, H);
  // cloud shadows drifting over the hills and the field
  if (!cache.shadow) {
    const sc = makeCanvas(256, 64), g = sc.getContext('2d'), rg = g.createRadialGradient(128, 32, 4, 128, 32, 128);
    rg.addColorStop(0, 'rgba(20,40,60,1)'); rg.addColorStop(1, 'rgba(20,40,60,0)'); g.setTransform(1, 0, 0, 0.25, 0, 24); g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
    cache.shadow = sc;
  }
  c.save(); c.beginPath(); c.rect(0, gY - H * 0.13, W, H); c.clip(); c.globalAlpha = 0.16;
  for (const cl of cache.clouds.slice(0, 3)) {
    const span = W + cl.w * 3, x = ((cl.x * span + now / 1000 * cl.speed * W * 3) % span) - cl.w * 1.5;
    c.drawImage(cache.shadow, x - cl.w * 0.4, gY - H * 0.1 + cl.y * H * 0.3, cl.w * 1.8, H * 0.09);
  }
  c.restore();
  // a few birds far away, gliding and flapping
  c.strokeStyle = 'rgba(40,45,55,0.65)'; c.lineWidth = 1.3; c.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const x = ((now / 1000 * W * (0.012 + i * 0.004) + i * W * 0.37) % (W * 1.2)) - W * 0.1, y = H * (0.18 + i * 0.07) + Math.sin(now / 1500 + i) * H * 0.01;
    const f = Math.sin(now / (160 + i * 30) + i) * 0.5 + 0.5, sz = H * (0.008 + (i % 2) * 0.003);
    c.beginPath(); c.moveTo(x - sz, y - sz * (0.2 + f * 0.6)); c.quadraticCurveTo(x - sz * 0.4, y - sz * 0.3, x, y); c.quadraticCurveTo(x + sz * 0.4, y - sz * 0.3, x + sz, y - sz * (0.2 + f * 0.6)); c.stroke();
  }
  // tall grass in the foreground, swaying in the wind
  if (!cache.blades) { seed(555); cache.blades = Array.from({ length: Math.round(W / 9) }, () => ({ x: rand() * W, h: H * (0.03 + rand() * 0.05), ph: rand() * 6, dark: rand() < 0.5 })); }
  for (const b of cache.blades) {
    const sway = Math.sin(now / 900 + b.ph + b.x / W * 4) * b.h * 0.25;
    c.strokeStyle = b.dark ? 'rgba(46,92,30,0.9)' : 'rgba(96,150,58,0.85)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(b.x, H + 2); c.quadraticCurveTo(b.x + sway * 0.3, H - b.h * 0.5, b.x + sway, H - b.h); c.stroke();
  }
}
