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
    pts = next; spread *= 0.55;
  }
  c.beginPath(); c.moveTo(0, fillTo);
  for (const [x, y] of pts) c.lineTo(x, y);
  c.lineTo(W, fillTo); c.closePath(); c.fillStyle = colour; c.fill();
}

function paintLand(W, H, gY, dpr) {
  const cv = makeCanvas(W * dpr, H * dpr), c = cv.getContext('2d'); c.scale(dpr, dpr);
  seed(4242);
  // distant mountains, hazy blue, with snowy tops on the far range
  ridge(c, W, gY - H * 0.22, H * 0.28, 0, W / 120, '#8fa9c9', gY);
  c.save(); c.globalCompositeOperation = 'source-atop';
  const snow = c.createLinearGradient(0, gY - H * 0.46, 0, gY - H * 0.33);
  snow.addColorStop(0, 'rgba(255,255,255,0.85)'); snow.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = snow; c.fillRect(0, 0, W, gY); c.restore();
  ridge(c, W, gY - H * 0.15, H * 0.16, 0, W / 120, '#7a96b8', gY);
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
      if (rand() < 0.45) continue;
      const tr = H * (0.008 + rand() * 0.012);
      for (let k = 0; k < 3; k++) { c.fillStyle = k === 2 ? 'rgba(255,255,255,0.08)' : treeCol; c.beginPath(); c.arc(x + (k - 1) * tr * 0.9, y - tr * (k === 1 ? 1.1 : 0.7), tr, 0, 7); c.fill(); }
    }
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
}
