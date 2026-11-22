// Dodge It: a full-body camera game. The player's real movements drive a cartoon character who must
// step aside from things falling from the sky, jump over things on the ground and duck under things
// flying at head height.
import { FilesetResolver, PoseLandmarker, FaceDetector } from './lib/mediapipe/vision_bundle.mjs';
import { HAZARDS, BY_LANE, drawHazard, sizeOf, drawWreck } from './hazards.js';
import { createVoice, loadSamples, scream, groan, fire, laserCharge, laserShot, villainVoice, swoosh, pow, knockout } from './hazard-sounds.js';
import { drawVillain } from './villain.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const OUTLINE = '#1f1a2e';

// Tuning
const JUMP_GAIN = 8;      // jump height boost: a 6 inch jump reaches full height and clears a car
const DUCK_GAIN = 1.6;    // and ducks 1.6x as low, so a modest duck is enough
const MOVE_GAIN = 2.6;    // sideways steps are exaggerated so a step or two takes the character well clear
const LIVES = 3;
const VERSION = '2.4';
// The Android app serves the game from this private address; anywhere else it is the web (Chromebook) version.
const EDITION = location.host === 'appassets.androidplatform.net' ? 'Android' : 'Chromebook / web';
const SAFE_MS = 1600;     // no further hits for this long after being hit

// Pose landmark numbers (MediaPipe). L/R are the player's own left and right.
const P = { nose:0, lEye:2, rEye:5, lEar:7, rEar:8, lSh:11, rSh:12, lEl:13, rEl:14, lWr:15, rWr:16,
  lHip:23, rHip:24, lKnee:25, rKnee:26, lAnk:27, rAnk:28, lHeel:29, rHeel:30, lFoot:31, rFoot:32 };

// ---------------------------------------------------------------- screens & storage
const SCREENS = ['loading', 'menu', 'create', 'game', 'over'];
let screen = 'loading';
function show(name) { screen = name; SCREENS.forEach(s => { $(s).hidden = s !== name; }); }
function load(key, def) { try { const v = localStorage.getItem(key); return v == null ? def : JSON.parse(v); } catch (e) { return def; } }
function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* storage may be blocked */ } }
const DEFAULT = { id:'default', name:'Dash', face:null, shirt:'#3b82f6', pants:'#364fc7', skin:'#f1c27d', best:0 };
let players = load('dodge-players', []);
let selectedId = load('dodge-selected', 'default');
const allPlayers = () => [DEFAULT, ...players];
const selected = () => allPlayers().find(p => p.id === selectedId) || DEFAULT;
const faceCache = new Map();
function faceImage(p) {
  if (!p.face) return null;
  let img = faceCache.get(p.id);
  if (!img) { img = new Image(); img.src = p.face; faceCache.set(p.id, img); }
  return img.complete && img.naturalWidth ? img : null;
}

// ---------------------------------------------------------------- sound
let actx = null;
function audio() {
  try { if (!actx) { actx = new (window.AudioContext || window.webkitAudioContext)(); loadSamples(actx); } if (actx.state === 'suspended') actx.resume(); }
  catch (e) { actx = null; }
  return actx;
}
function tone(freq, dur, type = 'sine', vol = 0.15, delay = 0, slideTo = null) {
  const a = audio(); if (!a) return;
  const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.3, freq = 800) {
  const a = audio(); if (!a) return;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination); src.start();
}
const sfx = {
  tick: () => tone(880, 0.07, 'square', 0.06),
  go: () => { tone(523, 0.12, 'triangle', 0.15); tone(784, 0.2, 'triangle', 0.15, 0.1); },
  point: () => tone(1046, 0.08, 'triangle', 0.08),
  whistle: () => tone(1500, 1.1, 'sine', 0.05, 0, 400),
  thud: () => { noise(0.25, 0.4, 250); },
  boom: () => { noise(0.9, 0.5, 600); tone(120, 0.6, 'sawtooth', 0.12, 0, 40); },
  ouch: () => { tone(500, 0.25, 'square', 0.1, 0, 200); noise(0.15, 0.2, 1500); },
  zoom: () => tone(300, 0.5, 'sawtooth', 0.04, 0, 700),
  over: () => { tone(392, 0.25, 'triangle', 0.15); tone(330, 0.25, 'triangle', 0.15, 0.22); tone(262, 0.5, 'triangle', 0.15, 0.44); },
};

// ---------------------------------------------------------------- camera & body tracking
const video = $('video');
let pose = null, faceDetector = null, stream = null;

let fileset = null, poseModel = 'full';
const makePose = (model, delegate) => PoseLandmarker.createFromOptions(fileset, {
  baseOptions: { modelAssetPath: new URL(`models/pose_landmarker_${model}.task`, location.href).href, delegate },
  runningMode: 'VIDEO', numPoses: 1, minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
});
const makePoseAnyDelegate = model => makePose(model, 'GPU').catch(() => makePose(model, 'CPU'));
async function initVision() {
  fileset = await FilesetResolver.forVisionTasks(new URL('lib/mediapipe', location.href).href);
  pose = await makePoseAnyDelegate('full');
  faceDetector = await FaceDetector.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: new URL('models/blaze_face_short_range.tflite', location.href).href },
    runningMode: 'IMAGE', minDetectionConfidence: 0.4,
  });
}
async function startCamera() {
  if (stream) return;
  stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  video.srcObject = stream;
  await video.play();
}

// Smoothed landmarks in camera pixels, mirrored so the player's movements look like a mirror.
let lm = null, lastVideoTime = -1, lastSeen = 0;
function track(now) {
  if (window.__dgFakePose) { smoothInto(window.__dgFakePose(now)); lastSeen = now; return; } // automated tests
  if (!pose || video.readyState < 2 || video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  let res;
  const t0 = performance.now();
  try { res = pose.detectForVideo(video, now); } catch (e) { return; }
  watchSpeed(performance.now() - t0);
  if (res.landmarks && res.landmarks.length) { smoothInto(res.landmarks[0]); lastSeen = now; }
}

// On slower computers (many Chromebooks) the accurate model can be too slow to follow a jump. If each
// look takes too long, switch to the lighter, faster model.
const speed = { avg: 0, frames: 0, switching: false };
function watchSpeed(ms) {
  speed.avg = speed.frames ? speed.avg * 0.95 + ms * 0.05 : ms; speed.frames++;
  if (poseModel === 'full' && !speed.switching && speed.frames > 10 && speed.avg > 45) {
    speed.switching = true;
    makePoseAnyDelegate('lite').then(p => { const old = pose; pose = p; poseModel = 'lite'; lastVideoTime = -1; try { old.close(); } catch (e) {} })
      .catch(() => { speed.switching = false; speed.frames = 0; });
  }
}
function smoothInto(raw) {
  const vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
  const pts = raw.map(p => ({ x: (1 - p.x) * vw, y: p.y * vh, v: p.visibility ?? 1 }));
  if (!lm) { lm = pts; return; }
  const scale = Math.max(vw, vh);
  for (let i = 0; i < pts.length; i++) {
    const s = lm[i], r = pts[i];
    // Light smoothing when still (no jitter), almost none when moving fast (jumps must not lag).
    const a = clamp(0.45 + Math.hypot(r.x - s.x, r.y - s.y) / scale * 14, 0.45, 0.95);
    s.x += (r.x - s.x) * a; s.y += (r.y - s.y) * a; s.v += (r.v - s.v) * 0.5;
  }
}
const seen = (...ids) => lm && ids.every(i => lm[i].v > 0.5);
const midOf = (a, b) => ({ x:(lm[a].x + lm[b].x) / 2, y:(lm[a].y + lm[b].y) / 2 });

// ---------------------------------------------------------------- stage
let W = 0, H = 0, DPR = 1, groundY = 0, charH = 0;
const stage = $('stage'), ctx = stage.getContext('2d');
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  stage.width = Math.round(W * DPR); stage.height = Math.round(H * DPR);
  groundY = H * 0.88; charH = H * 0.29;   // the character is under a third of the screen tall, leaving time to react
}
window.addEventListener('resize', resize);

// ---------------------------------------------------------------- reading the player's movement
// Only the head and shoulders need to be in view. Jumps, ducks and steps are worked out from how far the
// head moves, measured against shoulder width (which stays the same when jumping or ducking).
const SH_PER_HEIGHT = 0.23;                // shoulder width is about 23% of a person's height
const B = { headX:0, headY:0, unit:1 };    // resting head position and shoulder width, in camera pixels
function headPoint() { return seen(P.lEar, P.rEar) ? midOf(P.lEar, P.rEar) : { x: lm[P.nose].x, y: lm[P.nose].y }; }
const shoulderWidth = () => Math.hypot(lm[P.lSh].x - lm[P.rSh].x, lm[P.lSh].y - lm[P.rSh].y);
function measureStance() { const h = headPoint(); return { headX: h.x, headY: h.y, unit: shoulderWidth() }; }

// up / side: how far the head has moved, as a share of the player's height (up and right are positive)
const motion = { up:0, side:0, lift:0, duck:0, airborne:false, ducking:false, t:0, run:0, vx:0, jump:null, canJump:true };
const PEAK_MAX = 0.8;   // the highest jump, in character heights
const AIR_TIME = 0.75;  // every jump lasts this long: half going up, exactly half coming down
function updateMotion(now) {
  const h = headPoint(), k = SH_PER_HEIGHT / B.unit;
  motion.up = (B.headY - h.y) * k; motion.side = (h.x - B.headX) * k;
  const dts = Math.min((now - (motion.t || now)) / 1000, 0.05); motion.t = now;
  // Jump: when the head starts to rise, the character leaps in a cartoon arc. How high depends on how high
  // the player jumps (measured while rising), up to PEAK_MAX; a 6 inch jump clears a car.
  if (!motion.jump && motion.canJump && motion.up > 0.025) { motion.jump = { t0: now, peak: 0 }; motion.canJump = false; }
  if (motion.jump) {
    const j = motion.jump;
    // Height is measured while rising (first 0.3 s); the length of the jump never changes, so the
    // fall takes exactly as long as the rise.
    if (now - j.t0 < 300) j.peak = Math.max(j.peak, Math.min(motion.up * JUMP_GAIN, PEAK_MAX) * charH);
    const u = (now - j.t0) / (AIR_TIME * 1000);
    if (u >= 1) { motion.jump = null; motion.lift = 0; }
    else motion.lift = 4 * j.peak * u * (1 - u);
  }
  if (!motion.jump && motion.up < 0.015) motion.canJump = true;      // land properly before the next jump
  motion.duck = clamp(-motion.up * DUCK_GAIN, 0, 0.45);          // share of its height the character's head drops
}

// Where the character stands: follows the player's head sideways, exaggerated.
let charX = 0;
function updateCharX(now) {
  if (motion.jump) { motion.vx = 0; return; }                     // no running in mid-air
  const target = clamp(W / 2 + motion.side * charH * MOVE_GAIN, W * 0.06, W * 0.94);
  const before = charX;
  charX += (target - charX) * 0.5;
  motion.vx = charX - before;
  motion.run += Math.abs(motion.vx) / (charH * 0.12);           // leg cycle for the running animation
}

// Resting height and size drift a little as people shuffle; follow slowly while they stand normally.
function driftStance() {
  if (Math.abs(motion.up) > 0.015 || !seen(P.lSh, P.rSh)) return;
  const st = measureStance();
  B.headY += (st.headY - B.headY) * 0.01; B.unit += (st.unit - B.unit) * 0.01;
}

// The character's body in screen pixels. Legs are animated (standing, running, tucked for a jump,
// squatting for a duck); the head follows the player's tilt and the arms copy the player's when visible.
function buildBody() {
  const s = charH, foot = groundY - motion.lift, d = motion.duck;
  const air = clamp(motion.lift / (s * 0.3), 0, 1);
  const P2 = (x, y) => ({ x: charX + x * s, y: foot - y * s });
  const run = Math.abs(motion.vx) > 0.6 && air < 0.1 ? Math.sin(motion.run) : 0;
  const k = {
    lSh: P2(-0.12, 0.74 - d), rSh: P2(0.12, 0.74 - d),
    lHip: P2(-0.08, 0.45 - d * 0.75), rHip: P2(0.08, 0.45 - d * 0.75),
    lKnee: P2(-0.09 - d * 0.35 + run * 0.05, 0.23 - d * 0.25 + air * 0.08 + Math.max(0, run) * 0.05),
    rKnee: P2(0.09 + d * 0.35 - run * 0.05, 0.23 - d * 0.25 + air * 0.08 + Math.max(0, -run) * 0.05),
    lAnk: P2(-0.09 + air * 0.05 + run * 0.08, 0.03 + air * 0.12 + Math.max(0, run) * 0.06),   // tucked together in a jump
    rAnk: P2(0.09 - air * 0.05 - run * 0.08, 0.03 + air * 0.12 + Math.max(0, -run) * 0.06),
    head: { ...P2(0, 0.86 - d), r: s * 0.11, tilt: 0 },
  };
  k.lFoot = { x: k.lAnk.x - s * 0.05, y: k.lAnk.y }; k.rFoot = { x: k.rAnk.x + s * 0.05, y: k.rAnk.y };
  k.hip = { x: charX, y: (k.lHip.y + k.rHip.y) / 2 };
  if (lm && seen(P.lEye, P.rEye)) {
    let tilt = Math.atan2(lm[P.rEye].y - lm[P.lEye].y, lm[P.rEye].x - lm[P.lEye].x);
    if (Math.abs(tilt) > Math.PI / 2) tilt = Math.atan2(lm[P.lEye].y - lm[P.rEye].y, lm[P.lEye].x - lm[P.rEye].x);
    k.head.tilt = clamp(tilt, -0.5, 0.5);
  }
  // Arms: copy the player's if the camera can see them, otherwise swing them as the character runs or jumps.
  // Scale by the player's current shoulder width (known from the first frame, before calibration).
  const shW = lm && seen(P.lSh, P.rSh) ? shoulderWidth() : B.unit;
  const unit = s * 0.24 / Math.max(shW, 1);
  const capLen = (from, v, max) => { const l = Math.hypot(v.x, v.y) || 1, f = Math.min(1, max / l); return { x: from.x + v.x * f, y: from.y + v.y * f }; };
  for (const [side, sh, el, wr, sx] of [['l', P.lSh, P.lEl, P.lWr, -1], ['r', P.rSh, P.rEl, P.rWr, 1]]) {
    const S = k[side + 'Sh'];
    if (lm && seen(sh, el, wr)) {
      k[side + 'El'] = capLen(S, { x: (lm[el].x - lm[sh].x) * unit, y: (lm[el].y - lm[sh].y) * unit }, s * 0.17);
      k[side + 'Wr'] = capLen(k[side + 'El'], { x: (lm[wr].x - lm[el].x) * unit, y: (lm[wr].y - lm[el].y) * unit }, s * 0.16);
    } else {
      const swing = run * sx * 0.06, up = air;
      k[side + 'El'] = { x: S.x + sx * s * (0.05 + up * 0.08) + swing * s, y: S.y + s * (0.16 - up * 0.3) };
      k[side + 'Wr'] = { x: k[side + 'El'].x + sx * s * up * 0.06 + swing * s, y: k[side + 'El'].y + s * (0.14 - up * 0.28) };
    }
  }
  return k;
}

// ---------------------------------------------------------------- drawing the character
function limb(c, a, b, width, color) {
  c.lineCap = 'round';
  c.strokeStyle = OUTLINE; c.lineWidth = width + 6; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
  c.strokeStyle = color; c.lineWidth = width; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
}
function blob(c, x, y, r, color) { c.fillStyle = color; c.strokeStyle = OUTLINE; c.lineWidth = 3; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.stroke(); }
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const t = f < 0 ? 0 : 255, k = Math.abs(f);
  r = Math.round(r + (t - r) * k); g = Math.round(g + (t - g) * k); b = Math.round(b + (t - b) * k);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
function drawHead(c, p, h) {
  c.save(); c.translate(h.x, h.y); c.rotate(h.tilt);
  const r = h.r, img = faceImage(p);
  c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2);
  if (img) { c.save(); c.clip(); c.drawImage(img, -r, -r, r * 2, r * 2); c.restore(); }
  else {
    c.fillStyle = p.skin; c.fill(); c.fillStyle = OUTLINE;
    c.beginPath(); c.ellipse(-r * 0.33, -r * 0.1, r * 0.09, r * 0.14, 0, 0, 7); c.fill();
    c.beginPath(); c.ellipse(r * 0.33, -r * 0.1, r * 0.09, r * 0.14, 0, 0, 7); c.fill();
    c.lineWidth = r * 0.08; c.lineCap = 'round'; c.strokeStyle = OUTLINE;
    c.beginPath(); c.arc(0, r * 0.18, r * 0.35, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
    c.fillStyle = '#5b3a29'; c.beginPath(); c.arc(0, -r * 0.55, r * 0.75, Math.PI * 1.1, Math.PI * 1.9); c.fill();
  }
  c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.lineWidth = Math.max(3, r * 0.08); c.strokeStyle = OUTLINE; c.stroke();
  c.restore();
}
function drawCharacter(c, k, p, hurt) {
  const s = charH, shirt = p.shirt, pants = p.pants || DEFAULT.pants, skin = p.skin;
  c.save();
  if (hurt) c.globalAlpha = 0.45 + 0.4 * Math.abs(Math.sin(performance.now() / 70));   // blink while safe after a hit
  // legs and shoes
  for (const [h, kn, an, ft] of [[k.lHip, k.lKnee, k.lAnk, k.lFoot], [k.rHip, k.rKnee, k.rAnk, k.rFoot]]) {
    limb(c, h, kn, s * 0.085, pants); limb(c, kn, an, s * 0.075, pants);
    const dir = Math.sign(ft.x - an.x) || 1;
    c.fillStyle = '#343a40'; c.strokeStyle = OUTLINE; c.lineWidth = 3;
    c.beginPath(); c.ellipse(an.x + dir * s * 0.035, an.y + s * 0.015, s * 0.06, s * 0.03, 0, 0, 7); c.fill(); c.stroke();
  }
  // torso
  const grow = (a, o, f) => ({ x: a.x + (a.x - o.x) * f, y: a.y + (a.y - o.y) * f });
  const ls = grow(k.lSh, k.rSh, 0.15), rs = grow(k.rSh, k.lSh, 0.15), lh = grow(k.lHip, k.rHip, 0.1), rh = grow(k.rHip, k.lHip, 0.1);
  c.fillStyle = shirt; c.strokeStyle = OUTLINE; c.lineWidth = 4; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(ls.x, ls.y); c.lineTo(rs.x, rs.y); c.lineTo(rh.x, rh.y); c.lineTo(lh.x, lh.y); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = pants; c.beginPath(); c.moveTo(lh.x, lh.y - s * 0.02); c.lineTo(rh.x, rh.y - s * 0.02); c.lineTo(rh.x, rh.y + s * 0.03); c.lineTo(lh.x, lh.y + s * 0.03); c.closePath(); c.fill(); c.stroke();
  // neck, arms, head
  const neck = { x:(k.lSh.x + k.rSh.x) / 2, y:(k.lSh.y + k.rSh.y) / 2 };
  limb(c, neck, k.head, s * 0.05, skin);
  for (const [sh, el, wr] of [[k.lSh, k.lEl, k.lWr], [k.rSh, k.rEl, k.rWr]]) {
    limb(c, sh, el, s * 0.065, shade(shirt, -0.12)); limb(c, el, wr, s * 0.05, skin); blob(c, wr.x, wr.y, s * 0.035, skin);
  }
  drawHead(c, p, k.head);
  c.restore();
}

// Circles used to test whether something hits the character.
function hitCircles(k) {
  const s = charH, mid = (a, b, t = 0.5) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const sh = mid(k.lSh, k.rSh), hp = mid(k.lHip, k.rHip);
  return [
    { ...k.head, r: k.head.r * 0.9 },
    { ...mid(sh, hp, 0.25), r: s * 0.09 }, { ...mid(sh, hp, 0.75), r: s * 0.09 },
    { ...k.lKnee, r: s * 0.05 }, { ...k.rKnee, r: s * 0.05 },
    { ...k.lAnk, r: s * 0.05 }, { ...k.rAnk, r: s * 0.05 },
    { ...mid(k.lHip, k.lKnee), r: s * 0.05 }, { ...mid(k.rHip, k.rKnee), r: s * 0.05 },
  ];
}
function circleHitsBox(cir, hz) {
  const r = HAZARDS[hz.kind].hitR;
  if (r) return Math.hypot(cir.x - hz.x, cir.y - hz.y) < r * charH + cir.r;   // round hit area (a diving plane)
  // A little forgiving at the edges. Things on the ground are judged by their solid middle (a car's
  // bonnet and boot are lower than its roof), so a well-timed jump clears them.
  const hw = hz.w * (hz.lane === 'ground' ? 0.3 : 0.4), hh = hz.h * (HAZARDS[hz.kind].hitH ?? (hz.lane === 'ground' ? 0.35 : 0.4));
  const dx = Math.max(Math.abs(cir.x - hz.x) - hw, 0), dy = Math.max(Math.abs(cir.y - hz.y) - hh, 0);
  return dx * dx + dy * dy < cir.r * cir.r;
}

// ---------------------------------------------------------------- scenery
const clouds = Array.from({ length: 5 }, (_, i) => ({ x: Math.random(), y: 0.08 + Math.random() * 0.28, s: 0.6 + Math.random() * 0.6, v: 0.004 + Math.random() * 0.006 }));
function drawScenery(c, now, shake) {
  const g = c.createLinearGradient(0, 0, 0, groundY);
  g.addColorStop(0, '#4dabf7'); g.addColorStop(1, '#d0ebff');
  c.fillStyle = g; c.fillRect(0, 0, W, groundY + 2);
  c.fillStyle = '#ffe066'; c.beginPath(); c.arc(W * 0.85, H * 0.16, H * 0.07, 0, 7); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.9)';
  for (const cl of clouds) {
    const x = ((cl.x + now / 1000 * cl.v) % 1.2 - 0.1) * W, y = cl.y * H, r = H * 0.05 * cl.s;
    c.beginPath(); c.arc(x, y, r, 0, 7); c.arc(x + r, y - r * 0.4, r * 0.9, 0, 7); c.arc(x + r * 2, y, r * 0.8, 0, 7); c.fill();
  }
  c.fillStyle = '#8ce99a'; c.beginPath(); c.moveTo(0, groundY);
  for (let x = 0; x <= W; x += W / 8) c.quadraticCurveTo(x + W / 16, groundY - H * 0.12, x + W / 8, groundY);
  c.fill();
  c.fillStyle = '#51cf66'; c.fillRect(0, groundY, W, H - groundY);
  c.fillStyle = '#2f9e44'; c.fillRect(0, groundY, W, 6);
  c.fillStyle = '#a5694f'; c.fillRect(0, groundY + H * 0.07, W, H);
}

// Small mirrored camera view so players can check they are fully in view.
function drawPreview(c) {
  if (video.readyState < 2) return;
  const h = Math.min(90, H * 0.22), w = h * (video.videoWidth / video.videoHeight), x = 12, y = H - h - 12;
  c.save(); c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, 10) : c.rect(x, y, w, h); c.clip();
  c.translate(x + w, y); c.scale(-1, 1); c.drawImage(video, 0, 0, w, h); c.restore();
  c.strokeStyle = OUTLINE; c.lineWidth = 3; c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, 10) : c.rect(x, y, w, h); c.stroke();
}

// ---------------------------------------------------------------- the game
const G = { state:'off', lives:LIVES, score:0, start:0, safeUntil:0, hazards:[], pending:[], nextSpawn:0, tutorial:0, paused:0,
  stats:{ jumps:0, ducks:0, steps:0 }, phaseStart:0, banner:'', bannerUntil:0, lastTick:-1, effects:[], shake:0, overAt:0, lastSk:null };

function setBanner(text, small = '') {
  const html = text ? text + (small ? `<small>${small}</small>` : '') : '';
  if (G.banner !== html) { G.banner = html; $('banner').innerHTML = html; }
}
function flash(text, small, ms, now) { setBanner(text, small); G.bannerUntil = now + ms; }
function renderHearts() { $('hearts').textContent = '♥'.repeat(G.lives) + '♡'.repeat(LIVES - G.lives); }

function startGame() {
  audio(); resize(); silenceAll();
  stopVillain();
  Object.assign(G, { sawUfo:false, sawVillain:false, villain:null, state:'ready', lives:LIVES, score:0, hazards:[], pending:[], effects:[], tutorial:0, stats:{ jumps:0, ducks:0, steps:0 },
    phaseStart:performance.now(), lastTick:-1, bannerUntil:0, shake:0, lastSk:null });
  motion.airborne = false; motion.ducking = false;
  $('scoreNum').textContent = '0'; $('timeNum').textContent = '0:00'; renderHearts();
  show('game');
  try { navigator.wakeLock && navigator.wakeLock.request('screen').catch(() => {}); } catch (e) { /* optional */ }
}

// Difficulty rises with time: things come more often and move faster.
const elapsed = now => (now - G.start) / 1000;
// Difficulty eases in over about three minutes, then keeps creeping up very slowly.
const ramp = now => { const r = clamp(elapsed(now) / 180, 0, 1); return r * r * (3 - 2 * r); };   // 0 at start .. 1 at 3 min
const after3 = now => Math.max(0, elapsed(now) - 180);
// Time to the next thing: 5 to 10 s at first, about 2 s by three minutes.
const spawnGap = now => Math.max(1.4, 7.5 - 5.5 * ramp(now) - after3(now) * 0.002) * (0.67 + Math.random() * 0.66) * 1000;
const speedUp = now => 0.8 + 0.55 * ramp(now) + Math.min(0.25, after3(now) / 600);
// Two things at once (e.g. a weight landing as a car arrives): none before 70 s, about half of them by 3 min.
const comboChance = now => clamp((elapsed(now) - 70) / 110, 0, 1) * 0.5;

function spawn(lane, now, kind = null) {
  if (lane === 'villain') return spawnVillain(now);
  kind = kind || BY_LANE[lane][Math.floor(Math.random() * BY_LANE[lane].length)];
  const d = HAZARDS[kind], s = charH, w = sizeOf(kind).w * s, h = sizeOf(kind).h * s, sp = d.speed * s * speedUp(now) / 1000;
  const hz = { kind, lane, w, h, born: now, dir: 1, hit: false, done: false, spin: 0 };
  if (lane === 'sky' && d.dives) {
    // A plane dives at 30 to 70 degrees from either side, aimed at the player, nose first.
    const th = (30 + Math.random() * 40) * Math.PI / 180, dir = Math.random() < 0.5 ? 1 : -1;
    const tx = clamp(charX + (Math.random() - 0.5) * 0.3 * s, w / 2, W - w / 2);
    const v = 2.0 * s * speedUp(now) / 1000, L = (groundY + h) / Math.sin(th);
    hz.dir = dir; hz.spin = dir > 0 ? th : -th; hz.angle = th;
    hz.x = tx - dir * Math.cos(th) * L; hz.y = groundY - L * Math.sin(th);
    hz.vx = dir * v * Math.cos(th); hz.vy = v * Math.sin(th);
  } else if (lane === 'ufo') {
    // A UFO glides across the sky, bobbing up and down, and twice locks on and fires its laser.
    hz.dir = Math.random() < 0.5 ? 1 : -1;
    hz.x = hz.dir > 0 ? -w : W + w; hz.baseY = H * 0.2 + Math.random() * H * 0.08; hz.y = hz.baseY;
    hz.vx = hz.dir * sp; hz.vy = 0; hz.shots = 0; hz.nextShot = now + 1400 + Math.random() * 800; hz.aim = null;
  } else if (lane === 'sky') {
    // Falling things start slowly and speed up under gravity.
    hz.x = clamp(charX + (Math.random() - 0.5) * 0.25 * s, w / 2, W - w / 2);   // aimed at the player
    hz.y = -h; hz.vx = 0; hz.vy = FALL_V0 * s; hz.g = fallGravity(kind, now);
  } else {
    hz.dir = Math.random() < 0.5 ? 1 : -1;
    const lead = sp * 150;                                                        // starts just off screen
    hz.x = hz.dir > 0 ? -w / 2 - lead : W + w / 2 + lead;
    hz.y = lane === 'ground' ? groundY - h / 2 : groundY - charH * 0.95;   // flyers come at head height
    hz.vx = hz.dir * sp; hz.vy = 0;
    if (d.arc) {
      // Thrown in a real arc: it leaves the thrower's hand low down (about knee height), rises under gravity to
      // its highest point right at the player's head, then curves down behind them. Level as it passes, so
      // ducking gets under it.
      hz.variant = Math.random() < 0.5 ? 'beans' : 'soup';
      const T = Math.abs(hz.x - charX) / sp;                          // ms until it reaches the player
      const yTop = hz.y, y0 = groundY - charH * 0.25;                 // top of the arc = head height; start low
      hz.g = 2 * (y0 - yTop) / (T * T); hz.y = y0; hz.vy = -hz.g * T;
    }
  }
  hz.voice = audio() ? createVoice(actx, kind) : null;
  G.hazards.push(hz);
  return hz;
}

const FALL_V0 = 0.25 / 1000;                                   // starting fall speed, character heights per ms
const fallGravity = (kind, now) => 0.9 * charH / 1e6 * (HAZARDS[kind].speed * speedUp(now)) ** 2;   // px per ms²

// Something along the ground (or at head height) plus something from the sky, timed so both reach the
// player at about the same moment: they have to step aside and jump (or duck) together.
function spawnCombo(now) {
  const side = spawn(Math.random() < 0.6 ? 'ground' : 'air', now);
  const arriveMs = Math.abs(side.x - charX) / Math.abs(side.vx);
  const kinds = BY_LANE.sky.filter(k => !HAZARDS[k].dives), kind = kinds[Math.floor(Math.random() * kinds.length)];
  const D = groundY - charH * 0.5 + sizeOf(kind).h * charH, v0 = FALL_V0 * charH, g = fallGravity(kind, now);
  const fallMs = (-v0 + Math.sqrt(v0 * v0 + 2 * g * D)) / g;    // time to fall to body height under gravity
  G.pending.push({ at: now + Math.max(0, arriveMs - fallMs + (Math.random() - 0.5) * 600), lane: 'sky', kind });
}
function silence(hz) { if (hz.voice) { hz.voice.stop(); hz.voice = null; } }
function silenceAll() { G.hazards.forEach(silence); }

function nextLane() {
  // Teach the three moves first, then mix them up.
  const teach = ['sky', 'ground', 'air'];
  if (G.tutorial < teach.length) return teach[G.tutorial++];
  if (elapsed(performance.now()) > 150 && Math.random() < 0.13) return 'ufo';   // UFOs only after 2.5 minutes
  if (elapsed(performance.now()) > 90 && !G.villain && Math.random() < 0.12) return 'villain';
  const r = Math.random();
  return r < 0.38 ? 'sky' : r < 0.69 ? 'ground' : 'air';
}
const TEACH_TEXT = { ufo:['UFO!', 'Listen: when the charging sound peaks, it fires where its beam is pointing'],
  villain:['Punch him!', 'Throw a punch towards him. Three punches knock him out'],
   sky:['Step aside!', 'Move left or right out of the shadow'], ground:['Jump!', 'Jump over it when it reaches you'], air:['Duck!', 'Crouch down so it flies over your head'] };

function hurt(now, hz) {
  if (now < G.safeUntil || G.state !== 'play') return;
  G.lives--; renderHearts(); G.safeUntil = now + SAFE_MS; G.shake = 12;
  if (hz.lane !== 'ufo' && hz.lane !== 'villain') { hz.hit = true; hz.vy = -0.0008 * charH * 1000 / 1000 * 0.9; hz.vx = -hz.vx * 0.4; hz.flying = true; }
  // The first two injuries get a short groan; the third and final one gets the full scream.
  sfx.ouch(); if (audio()) { if (G.lives > 0) groan(actx, G.lives === LIVES - 1 ? 1 : 2); else scream(actx); }
  G.effects.push({ type:'text', text:'OUCH!', x: charX, y: groundY - charH * 1.05, born: now, color:'#ff5d5d' });
  if (G.lives <= 0) { G.state = 'ending'; G.overAt = now + 1300; sfx.over(); setBanner('Game over'); }
}

function dodged(now, hz) {
  G.score++; $('scoreNum').textContent = G.score; sfx.point();
  G.effects.push({ type:'text', text:'+1', x: clamp(hz.x, 40, W - 40), y: hz.lane === 'sky' ? groundY - 30 : hz.y - hz.h, born: now, color:'#ffe066' });
}

// UFO: bobs across the sky. Each shot: while it charges (always exactly 4 seconds, with a slowly rising
// whine, so players can learn the timing), its thin targeting beam sweeps back and forth over the ground around the player. When the charge
// is complete the laser fires wherever the beam is pointing at that instant, through to the ground.
// Players beat it by listening to the charge-up and being out from under the sweep when it peaks.
const UFO_CHARGE_MS = 4000;
function sweepPoint(hz, now) {
  const c = hz.charge, t = (now - c.at) / 1000;
  c.centre += (charX - c.centre) * 0.02;                                 // the sweep drifts to follow the player
  return { x: clamp(c.centre + Math.sin(t * c.speed + c.phase) * charH * 1.3, 0, W), y: groundY };
}
function updateUfo(hz, now, circles) {
  hz.y = hz.baseY + Math.sin((now - hz.born) / 700) * charH * 0.3;
  const onScreen = hz.x > W * 0.08 && hz.x < W * 0.92;
  if (!hz.charge && hz.shots < 2 && onScreen && now >= hz.nextShot && G.lastSk) {
    const ms = UFO_CHARGE_MS;
    hz.charge = { at: now, ms, centre: charX, speed: 3 + Math.random() * 1.5, phase: Math.random() * 6.28 };
    if (audio()) laserCharge(actx, ms / 1000);
  }
  if (hz.charge) {
    hz.charge.spot = sweepPoint(hz, now);
    if (now - hz.charge.at >= hz.charge.ms) {
      const x0 = hz.x, y0 = hz.y + hz.h * 0.25, gx = hz.charge.spot.x;
      if (audio()) laserShot(actx);
      G.effects.push({ type:'laser', x1: x0, y1: y0, x2: gx, y2: groundY, born: now, dur: 260 });
      G.effects.push({ type:'boom', x: gx, y: groundY, r: charH * 0.22, born: now + 70, dur: 600, text:'ZAP!' });
      const beamHits = circles.some(cr => distToSegment(cr, x0, y0, gx, groundY) < cr.r + charH * 0.04);
      if (beamHits) hurt(now, hz); else dodged(now, { ...hz, lane:'sky', x: gx });
      hz.charge = null; hz.shots++; hz.nextShot = now + 1200 + Math.random() * 1000;
    }
  }
  if ((hz.dir > 0 && hz.x - hz.w > W) || (hz.dir < 0 && hz.x + hz.w < 0)) hz.done = true;
}
function distToSegment(p, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, t = clamp(((p.x - x1) * dx + (p.y - y1) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(p.x - (x1 + t * dx), p.y - (y1 + t * dy));
}
// While a UFO charges: a glowing ball builds up under it, and its thin targeting beam sweeps the ground.
function drawLockOn(c, now) {
  for (const hz of G.hazards) {
    if (!hz.charge || !hz.charge.spot) continue;
    const q = Math.min(1, (now - hz.charge.at) / hz.charge.ms), pulse = 0.75 + 0.25 * Math.sin(now / (60 - 45 * q));
    const gx = hz.x, gy = hz.y + hz.h * 0.3, r = charH * (0.03 + 0.09 * q) * pulse;
    const grd = c.createRadialGradient(gx, gy, 0, gx, gy, r * 2.2);
    grd.addColorStop(0, 'rgba(255,255,255,0.95)'); grd.addColorStop(0.35, `rgba(120,255,180,${0.5 + 0.4 * q})`); grd.addColorStop(1, 'rgba(120,255,180,0)');
    c.fillStyle = grd; c.beginPath(); c.arc(gx, gy, r * 2.2, 0, 7); c.fill();
    const flick = 0.5 + 0.5 * Math.sin(now / 25), sp = hz.charge.spot;
    c.save(); c.strokeStyle = `rgba(255,60,60,${0.4 + 0.4 * flick})`; c.lineWidth = 2;
    c.beginPath(); c.moveTo(gx, gy); c.lineTo(sp.x, sp.y); c.stroke();
    c.fillStyle = `rgba(255,60,60,${0.5 + 0.3 * flick})`; c.beginPath(); c.ellipse(sp.x, sp.y, charH * 0.06, charH * 0.02, 0, 0, 7); c.fill();
    c.restore();
  }
}

// ---------------------------------------------------------------- the masked brute
// He stomps in from one side towards the player, winds up and swings his chainsaw or axe. Anyone within reach
// when he swings is hit. A punch thrown towards him while he is close knocks him back; three knock him out.
const V_REACH = 0.8, V_STOP = 0.6, V_PUNCH_REACH = 1.15;   // in character heights, centre to centre
function spawnVillain(now) {
  const dir = Math.random() < 0.5 ? 1 : -1;               // 1 = comes in from the left, walking right
  const weapon = Math.random() < 0.5 ? 'chainsaw' : 'axe';
  G.villain = { x: dir > 0 ? -charH * 0.6 : W + charH * 0.6, y: groundY, dir, state: 'walk', stateAt: now, weapon, hp: 3, walk: 0, flash: 0,
    voice: audio() ? villainVoice(actx, weapon) : null };
  return G.villain;
}
function stopVillain() { if (G.villain && G.villain.voice) G.villain.voice.stop(); G.villain = null; }
function setV(v, state, now) { v.state = state; v.stateAt = now; }
function updateVillain(now, dt) {
  const v = G.villain; if (!v) return;
  const dx = charX - v.x, dist = Math.abs(dx) / charH, since = now - v.stateAt;
  if (v.state !== 'ko' && v.state !== 'stagger') v.dir = dx >= 0 ? 1 : -1;
  if (v.voice) { try { v.voice.update(v.state, clamp(1 - Math.abs(dx) / (W * 0.6), 0, 1), (v.x - charX) / (W * 0.5)); } catch (e) { v.voice.stop(); v.voice = null; console.error(e); } }
  if (v.state === 'walk') {
    if (dist > V_STOP) { v.x += v.dir * charH * 0.55 * speedUp(now) * dt / 1000; v.walk += dt / 140; }
    else setV(v, 'windup', now);
  } else if (v.state === 'windup' && since > 750) {
    setV(v, 'swing', now); if (audio()) swoosh(actx);
    if (dist < V_REACH) hurt(now, { lane: 'villain' });
  } else if (v.state === 'swing' && since > 200) setV(v, 'recover', now);
  else if (v.state === 'recover' && since > 900) setV(v, dist < V_REACH ? 'windup' : 'walk', now);
  else if (v.state === 'stagger') {
    if (since < 300) v.x -= v.dir * charH * 1.2 * dt / 1000;        // knocked back
    else if (since > 550) setV(v, 'walk', now);
  } else if (v.state === 'ko' && since > 1800) {
    if (v.voice) v.voice.stop();
    G.villain = null;
  }
}
// A punch: the arm on that side shoots out from the body. side -1 = towards the left of the screen.
const punchState = { '-1': { lowAt: 0, cool: 0 }, '1': { lowAt: 0, cool: 0 } };
function detectPunch(now) {
  if (!lm) return 0;
  for (const [sh, wr, side] of [[P.lSh, P.lWr, -1], [P.rSh, P.rWr, 1]]) {
    if (!seen(sh, wr)) continue;
    const st = punchState[side], ext = (lm[wr].x - lm[sh].x) * side / B.unit;   // how far the fist is out to that side
    if (ext < 0.6) st.lowAt = now;
    if (ext > 1.0 && now - st.lowAt < 450 && now > st.cool) { st.cool = now + 400; return side; }
  }
  return 0;
}
function handlePunch(now) {
  const side = detectPunch(now), v = G.villain;
  if (!side) return;
  if (v && v.state !== 'ko' && Math.sign(v.x - charX) === side && Math.abs(v.x - charX) / charH < V_PUNCH_REACH) {
    v.hp--; v.flash = now + 400;
    if (audio()) pow(actx);
    G.effects.push({ type:'text', text:'POW!', x: v.x, y: groundY - charH * 1.3, born: now, color:'#ffd43b' });
    if (v.hp <= 0) {
      setV(v, 'ko', now); if (audio()) knockout(actx);
      G.score += 3; $('scoreNum').textContent = G.score;
      G.effects.push({ type:'text', text:'K.O.!  +3', x: v.x, y: groundY - charH * 1.6, born: now, color:'#ff922b', dur: 1400 });
    } else setV(v, 'stagger', now);
  } else if (audio()) swoosh(actx);                                     // a punch at thin air
}

function updateHazards(now, dt, sk) {
  const circles = sk ? hitCircles(sk) : [];
  for (const hz of G.hazards) {
    if (hz.done) continue;
    if (hz.g && !hz.flying) hz.vy += hz.g * dt;
    hz.x += hz.vx * dt; hz.y += hz.vy * dt;
    if (hz.kind === 'can') hz.spin += dt * 0.012;
    if (HAZARDS[hz.kind].bounce && !hz.flying) {
      const ph = Math.max(0, now - hz.born) / 160;
      hz.y = groundY - hz.h / 2 - Math.abs(Math.sin(ph)) * charH * 0.12;
      const landings = Math.floor(ph / Math.PI);                       // it touches the ground each half-turn of the sine
      if (landings !== hz.landings) { hz.landings = landings; if (hz.voice && hz.voice.bounce) { try { hz.voice.bounce(); } catch (e) {} } }
    }
    if (hz.flying) { silence(hz); hz.vy += 0.0025 * dt; hz.spin += dt * 0.01; if (hz.y > H + hz.h) hz.done = true; continue; }
    if (hz.voice) {                                                    // louder the closer it gets
      const body = { x: charX, y: groundY - charH * 0.5 };
      const reach = hz.lane === 'sky' ? groundY : W * 0.75;
      const prox = clamp(1 - Math.hypot(hz.x - body.x, hz.y - body.y) / reach, 0, 1);
      try { hz.voice.update(prox, (hz.x - charX) / (W * 0.5), clamp((hz.y + hz.h) / groundY, 0, 1), hz, now); }
      catch (e) { silence(hz); console.error(e); }                   // a sound problem must never stop the game
    }
    if (!hz.hit && circles.some(cr => circleHitsBox(cr, hz))) { hurt(now, hz); continue; }
    const d = HAZARDS[hz.kind];
    if (hz.lane === 'ufo') { updateUfo(hz, now, circles); continue; }
    if (d.arc && hz.vy > 0 && hz.y + hz.h / 2 >= groundY) { hz.done = true; dodged(now, hz); sfx.thud(); continue; }   // the can lands
    const noseY = d.dives ? hz.y + Math.sin(hz.angle) * hz.w * 0.45 : hz.y + hz.h / 2;
    if (hz.lane === 'sky' && noseY >= groundY) {                       // hit the ground
      hz.done = true;
      // Only a body part whose centre is inside the blast counts, so a player visibly outside it is safe.
      const blast = (x, r) => circles.some(cr => Math.hypot(cr.x - x, cr.y - groundY) < r);
      if (d.explodes) {
        // The bomb takes out its own width on each side of it, sideways and upwards.
        const r = hz.w * 1.5;
        sfx.boom(); G.shake = 14;
        G.effects.push({ type:'blast', x: hz.x, y: groundY, r, born: now, dur: 700 });
        G.effects.push({ type:'boom', x: hz.x, y: groundY, r: r * 0.9, born: now, dur: 900 });
        if (blast(hz.x, r)) { hurt(now, hz); continue; }
      } else if (d.dives) {
        // The plane crashes nose first: a fireball, then a burning hunk of molten metal.
        const x = hz.x + hz.dir * Math.cos(hz.angle) * hz.w * 0.4, r = charH * 0.45;
        sfx.boom(); if (audio()) fire(actx); G.shake = 16;
        G.effects.push({ type:'boom', x, y: groundY, r, born: now, dur: 900, text:'CRASH!' });
        G.effects.push({ type:'wreck', x, y: groundY, dir: hz.dir, born: now, dur: 4200 });
        if (blast(x, r)) { hurt(now, hz); continue; }
      } else {
        sfx.thud(); G.shake = hz.kind === 'elephant' ? 28 : 8;
        if (hz.kind === 'elephant') setTimeout(sfx.thud, 90);
        G.effects.push({ type:'dust', x: hz.x, y: groundY, born: now, w: hz.w, dur: 900 });
        G.effects.push({ type:'landed', hz:{ ...hz, done:false, flying:false, y: groundY - hz.h / 2 }, born: now, dur: 700 });
      }
      dodged(now, hz);
    } else if (hz.lane !== 'sky' && ((hz.dir > 0 && hz.x - hz.w / 2 > W) || (hz.dir < 0 && hz.x + hz.w / 2 < 0))) {
      dodged(now, hz);
      if (d.twoPass && !hz.secondPass) {
        // The missile turns round off screen and comes back low along the ground: jump this time.
        hz.secondPass = true; hz.dir = -hz.dir; hz.vx = -hz.vx * 1.1; hz.lane = 'ground';
        hz.y = groundY - hz.h / 2 - charH * 0.03;
        hz.x -= hz.dir * Math.abs(hz.vx) * 700;                          // a moment's pause before it returns
      } else hz.done = true;
    }
  }
  G.hazards.forEach(hz => { if (hz.done) silence(hz); });
  G.hazards = G.hazards.filter(hz => !hz.done);
}

// Things falling from the sky cast a growing shadow where they will land. (No arrows: things coming
// sideways just appear at the edge of the screen.)
function drawShadows(c, now) {
  for (const hz of G.hazards) {
    if (hz.flying) continue;
    if (hz.lane === 'sky') {
      const p = clamp((hz.y + hz.h) / (groundY + hz.h), 0.1, 1);
      c.fillStyle = `rgba(0,0,0,${0.15 + 0.25 * p})`;
      c.beginPath(); c.ellipse(hz.x, groundY + 4, hz.w * 0.55 * p, hz.w * 0.12 * p, 0, 0, 7); c.fill();
    }
  }
}

function drawEffects(c, now) {
  G.effects = G.effects.filter(e => now - e.born < (e.dur || 900));
  for (const e of G.effects) {
    const t = (now - e.born) / 900;
    if (now < e.born) continue;                                         // not started yet (e.g. the boom after a laser)
    if (e.type === 'laser') {
      const a = 1 - (now - e.born) / e.dur;
      c.save(); c.lineCap = 'round';
      c.strokeStyle = `rgba(120,255,180,${0.35 * a})`; c.lineWidth = charH * 0.12; c.beginPath(); c.moveTo(e.x1, e.y1); c.lineTo(e.x2, e.y2); c.stroke();
      c.strokeStyle = `rgba(200,255,220,${a})`; c.lineWidth = charH * 0.045; c.stroke();
      c.strokeStyle = `rgba(255,255,255,${a})`; c.lineWidth = charH * 0.015; c.stroke();
      c.restore(); continue;
    }
    if (e.type === 'blast') {                                            // the bomb's blast filling its zone
      const q = (now - e.born) / e.dur, ring = Math.min(1, q * 4);
      c.save();
      c.fillStyle = `rgba(255,150,40,${0.55 * (1 - q)})`;
      c.beginPath(); c.arc(e.x, e.y, e.r, Math.PI, 0); c.closePath(); c.fill();
      c.strokeStyle = `rgba(255,255,255,${0.9 * (1 - q)})`; c.lineWidth = 6 * (1 - q) + 1;
      c.beginPath(); c.arc(e.x, e.y, e.r * ring, Math.PI, 0); c.stroke();
      c.restore(); continue;
    }
    if (e.type === 'wreck') { drawWreck(c, e.x, e.y, charH * HAZARDS.plane.scale, now - e.born, e.dir); continue; }
    if (e.type === 'text') {
      c.globalAlpha = 1 - t; c.fillStyle = e.color; c.strokeStyle = OUTLINE; c.lineWidth = 5; c.textAlign = 'center';
      c.font = `bold ${H * 0.06}px "Trebuchet MS", sans-serif`;
      c.strokeText(e.text, e.x, e.y - t * 40); c.fillText(e.text, e.x, e.y - t * 40); c.globalAlpha = 1;
    } else if (e.type === 'boom') {
      const r = (e.r || charH * 0.4) * (0.4 + t * 0.7);           // grows to the full blast area
      c.globalAlpha = 1 - t;
      c.fillStyle = '#ff922b'; c.beginPath();
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, rr = i % 2 ? r : r * 0.6; c.lineTo(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr); }
      c.closePath(); c.fill(); c.fillStyle = '#ffe066'; c.beginPath(); c.arc(e.x, e.y, r * 0.45, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.strokeStyle = OUTLINE; c.lineWidth = 5; c.font = `bold ${H * 0.07}px "Trebuchet MS", sans-serif`; c.textAlign = 'center';
      c.strokeText(e.text || 'BOOM!', e.x, e.y - r * 0.9); c.fillText(e.text || 'BOOM!', e.x, e.y - r * 0.9);
      c.globalAlpha = 1;
    } else if (e.type === 'dust') {
      c.globalAlpha = 1 - t; c.fillStyle = '#ced4da';
      for (let i = -2; i <= 2; i++) { c.beginPath(); c.arc(e.x + i * e.w * 0.3 * (1 + t), e.y - 8 - t * 20, charH * 0.04 * (1 + t), 0, 7); c.fill(); }
      c.globalAlpha = 1;
    } else if (e.type === 'landed') {                                    // the object rests on the ground, then fades
      c.globalAlpha = clamp(1 - (now - e.born - 400) / 300, 0, 1); drawHazard(c, e.hz, charH, now); c.globalAlpha = 1;
    }
  }
}

function endGame() {
  const p = selected(), secs = Math.round((G.endAt - G.start) / 1000);
  const better = G.score > (p.best || 0);
  if (better) { p.best = G.score; if (p !== DEFAULT) save('dodge-players', players); }
  $('overTitle').textContent = G.score >= 10 ? 'Great dodging!' : 'Game over';
  $('overScore').textContent = G.score;
  const pill = (n, label) => `<div class="pill"><b>${n}</b><span>${label}</span></div>`;
  $('overStats').innerHTML = pill(G.stats.jumps, 'jumps') + pill(G.stats.ducks, 'ducks') + pill(fmt(secs * 1000), 'time');
  $('overBest').textContent = better && G.score ? `New personal best for ${p.name}!` : `${p.name}'s best: ${p.best || 0}`;
  show('over');
}
const fmt = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function gameFrame(now, dt) {
  const lost = now - lastSeen > 1500 || !seen(P.nose);
  const vw = video.videoWidth || 1280, vh = video.videoHeight || 720;

  if (G.state === 'ready') {
    if (lost) { setBanner('Step into view', 'The camera needs to see your head and shoulders'); G.phaseStart = now; }
    else if (!seen(P.lSh, P.rSh)) { setBanner('Step back a little', 'The camera needs to see your shoulders'); G.phaseStart = now; }
    else {
      const st = measureStance();
      // leave room above the head for jumping and below it for ducking
      if (st.unit > vw * 0.45) { setBanner('Step back a little'); G.phaseStart = now; }
      else if (st.unit < vw * 0.07) { setBanner('Come a bit closer'); G.phaseStart = now; }
      else if (st.headY < vh * 0.22) { setBanner('Leave room above your head', 'Step back a little, or tilt the phone up'); G.phaseStart = now; }
      else if (st.headY > vh * 0.62) { setBanner('Your head is too low in the picture', 'Tilt the phone down a little'); G.phaseStart = now; }
      else {
        const left = 3 - Math.floor((now - G.phaseStart) / 1000);
        if (left <= 0) {
          Object.assign(B, measureStance()); charX = W / 2; motion.lift = 0; motion.jump = null; motion.canJump = true;
          G.state = 'play'; G.start = now; G.nextSpawn = now + 2500; G.safeUntil = 0; sfx.go();
          flash('Go!', '', 1200, now);
        } else {
          Object.assign(B, measureStance());
          setBanner(String(left), 'Stand still with your arms down');
          if (left !== G.lastTick) { G.lastTick = left; sfx.tick(); }
        }
      }
    }
  }

  let sk = null;
  if (G.state === 'ready') { charX = W / 2; motion.lift = 0; motion.duck = 0; motion.vx = 0; sk = buildBody(); }
  else if (G.state !== 'off' && lm) {
    if (!lost) { updateMotion(now); updateCharX(now); driftStance(); }
    sk = buildBody(); G.lastSk = sk;
  }

  if (G.state === 'play') {
    if (lost) {                                                        // pause the action until we can see the player
      G.start += dt; G.nextSpawn += dt; G.safeUntil += dt; G.pending.forEach(p => { p.at += dt; });
      for (const hz of G.hazards) if (hz.voice) { try { hz.voice.update(0, 0, 0, hz, now); } catch (e) { silence(hz); } }
      setBanner('Where did you go?', 'Step back into view to carry on');
    } else {
      if (now > G.bannerUntil) setBanner('');
      // count exercise: jumps and ducks
      if (!motion.airborne && motion.up > 0.03) { motion.airborne = true; G.stats.jumps++; }
      if (motion.airborne && motion.up < 0.01) motion.airborne = false;
      if (!motion.ducking && motion.duck > 0.12) { motion.ducking = true; G.stats.ducks++; }
      if (motion.ducking && motion.duck < 0.05) motion.ducking = false;
      if (now >= G.nextSpawn && !window.__dgNoAuto) {   // tests can switch off random spawning
        if (G.tutorial >= 3 && Math.random() < comboChance(now)) {
          spawnCombo(now);
          G.nextSpawn = now + spawnGap(now) * 1.4;
        } else {
          const lane = nextLane();
          spawn(lane, now);
          if ((G.tutorial <= 3 && G.tutorial > 0 && G.score < 3) || (lane === 'ufo' && !G.sawUfo) || (lane === 'villain' && !G.sawVillain)) flash(TEACH_TEXT[lane][0], TEACH_TEXT[lane][1], 3000, now);
          if (lane === 'ufo') G.sawUfo = true;
          if (lane === 'villain') G.sawVillain = true;
          G.nextSpawn = now + spawnGap(now);
        }
      }
      for (const p of G.pending) if (now >= p.at) { spawn(p.lane, now, p.kind); p.done = true; }
      G.pending = G.pending.filter(p => !p.done);
      updateHazards(now, dt, sk);
      updateVillain(now, dt); handlePunch(now);
      $('timeNum').textContent = fmt(now - G.start);
    }
  } else if (G.state === 'ending') {
    updateHazards(now, dt, null);
    if (now >= G.overAt) { G.endAt = G.overAt - 1300; silenceAll(); stopVillain(); endGame(); return; }
  }

  // draw
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const shake = G.shake > 0.5 ? (Math.random() - 0.5) * G.shake : 0; G.shake *= 0.85;
  ctx.translate(shake, shake * 0.6);
  drawScenery(ctx, now);
  drawShadows(ctx, now);
  const k = sk || G.lastSk;
  if (k) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';                                  // the character's own shadow
    ctx.beginPath(); ctx.ellipse(k.hip.x, groundY + 4, charH * 0.16 / (1 + motion.lift / charH * 3), charH * 0.03, 0, 0, 7); ctx.fill();
    drawCharacter(ctx, k, selected(), now < G.safeUntil);
  }
  if (G.villain) drawVillain(ctx, G.villain, charH, now);
  for (const hz of G.hazards) drawHazard(ctx, hz, charH, now);
  drawLockOn(ctx, now);
  drawEffects(ctx, now);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawPreview(ctx);
}

// ---------------------------------------------------------------- character creation (full-body photo)
const createView = $('createView'), cctx = createView.getContext('2d');
const create = { countdown:0, shot:null, msgUntil:0 };
function createMsg(text) { $('createStatus').textContent = text; create.msgUntil = performance.now() + 4000; }
function openCreate() {
  show('create');
  $('captureStep').hidden = false; $('saveStep').hidden = true; createView.hidden = false;
  $('snapBtn').disabled = true; $('createStatus').textContent = 'Starting the camera…';
  create.countdown = 0; create.shot = null;
  startCamera().then(() => { $('snapBtn').disabled = false; }).catch(cameraError);
}
function createFrame(now) {
  const w = createView.width, h = createView.height;
  cctx.fillStyle = '#000'; cctx.fillRect(0, 0, w, h);
  if (video.readyState >= 2) {
    const vw = video.videoWidth, vh = video.videoHeight, s = Math.max(w / vw, h / vh);
    cctx.save(); cctx.translate(w, 0); cctx.scale(-1, 1); cctx.drawImage(video, (w - vw * s) / 2, (h - vh * s) / 2, vw * s, vh * s); cctx.restore();
  }
  // standing-figure guide
  cctx.strokeStyle = 'rgba(255,255,255,0.75)'; cctx.lineWidth = 4; cctx.setLineDash([12, 10]);
  const fx = w / 2, u = h / 100;                                           // a standing figure, head to feet
  cctx.beginPath(); cctx.ellipse(fx, 14 * u, 5 * u, 6.5 * u, 0, 0, 7); cctx.stroke();
  cctx.beginPath();
  cctx.moveTo(fx - 11 * u, 24 * u); cctx.lineTo(fx + 11 * u, 24 * u); cctx.lineTo(fx + 9 * u, 55 * u); cctx.lineTo(fx + 8 * u, 95 * u);
  cctx.lineTo(fx + 2 * u, 95 * u); cctx.lineTo(fx, 60 * u); cctx.lineTo(fx - 2 * u, 95 * u); cctx.lineTo(fx - 8 * u, 95 * u);
  cctx.lineTo(fx - 9 * u, 55 * u); cctx.closePath(); cctx.stroke();
  cctx.setLineDash([]);
  if (create.countdown) {
    const left = Math.ceil((create.countdown - now) / 1000);
    if (left <= 0) { create.countdown = 0; takePhoto(); }
    else {
      cctx.fillStyle = '#fff'; cctx.strokeStyle = OUTLINE; cctx.lineWidth = 8; cctx.font = 'bold 140px sans-serif'; cctx.textAlign = 'center'; cctx.textBaseline = 'middle';
      cctx.strokeText(left, w / 2, h / 2); cctx.fillText(left, w / 2, h / 2);
    }
  } else if (!create.shot && stream && now > create.msgUntil) {
    $('createStatus').textContent = seen(P.nose, P.lSh, P.rSh) ? 'Great. Face the camera and take the photo.'
      : 'Stand so the camera can see your face and shoulders.';
  }
}
function avgColor(data, W0, x0, y0, x1, y1) {
  x0 = clamp(Math.round(x0), 0, W0 - 1); x1 = clamp(Math.round(x1), x0 + 1, W0);
  const H0 = data.length / 4 / W0; y0 = clamp(Math.round(y0), 0, H0 - 1); y1 = clamp(Math.round(y1), y0 + 1, H0);
  const px = [];
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { const i = (y * W0 + x) * 4; px.push([data[i], data[i + 1], data[i + 2]]); }
  if (!px.length) return null;
  px.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
  const mid = px.slice(Math.floor(px.length / 4), Math.ceil(px.length * 3 / 4) || 1);
  return '#' + [0, 1, 2].map(k => Math.round(mid.reduce((s, p) => s + p[k], 0) / mid.length).toString(16).padStart(2, '0')).join('');
}
function takePhoto() {
  const vw = video.videoWidth, vh = video.videoHeight;
  const snap = document.createElement('canvas'); snap.width = vw; snap.height = vh;
  const sx = snap.getContext('2d', { willReadFrequently:true }); sx.drawImage(video, 0, 0);
  let det;
  try { det = faceDetector.detect(snap).detections; } catch (e) { det = []; }
  let box = det.length ? det.sort((a, b) => b.boundingBox.width - a.boundingBox.width)[0].boundingBox : null;
  if (!box && seen(P.nose, P.lEar, P.rEar)) {
    // From a distance the face can be too small for the face finder; use the body tracker's head points.
    const n = lm[P.nose], earW = Math.abs(lm[P.lEar].x - lm[P.rEar].x), fw = earW * 1.1;
    box = { originX: vw - n.x - fw / 2, originY: n.y - fw * 0.6, width: fw, height: fw * 1.15 };
  }
  if (!box) { createMsg('No face found. Face the camera in good light and try again.'); return; }
  const data = sx.getImageData(0, 0, vw, vh).data;
  const size = Math.max(box.width, box.height) * 1.75;
  const cx = box.originX + box.width / 2, cy = box.originY + box.height / 2 - box.height * 0.12;
  const face = document.createElement('canvas'); face.width = face.height = 200;
  const fx = face.getContext('2d'); fx.translate(200, 0); fx.scale(-1, 1);
  fx.drawImage(snap, cx - size / 2, cy - size / 2, size, size, 0, 0, 200, 200);
  const skin = avgColor(data, vw, box.originX + box.width * 0.18, box.originY + box.height * 0.55, box.originX + box.width * 0.36, box.originY + box.height * 0.72) || DEFAULT.skin;
  // lm is mirrored; flip back to the raw camera image for sampling
  const raw = i => lm && lm[i].v > 0.5 ? { x: vw - lm[i].x, y: lm[i].y } : null;
  let shirt = null, pants = null;
  const ls = raw(P.lSh), rs = raw(P.rSh), lh = raw(P.lHip), rh = raw(P.rHip), lk = raw(P.lKnee), rk = raw(P.rKnee);
  if (ls && rs && lh && rh) {
    const x0 = Math.min(ls.x, rs.x), x1 = Math.max(ls.x, rs.x), wsh = x1 - x0, top = Math.max(ls.y, rs.y), bottom = Math.min(lh.y, rh.y);
    shirt = avgColor(data, vw, x0 + wsh * 0.3, top + (bottom - top) * 0.25, x1 - wsh * 0.3, top + (bottom - top) * 0.6);
    if (lk && rk) {
      const thigh = (a, b) => avgColor(data, vw, Math.min(a.x, b.x) - 6, a.y + (b.y - a.y) * 0.3, Math.max(a.x, b.x) + 6, a.y + (b.y - a.y) * 0.6);
      pants = thigh(lh, lk) || thigh(rh, rk);
    } else if (lh.y + wsh * 0.4 < vh) {                                   // just below the hips, if in view
      pants = avgColor(data, vw, Math.min(lh.x, rh.x), Math.max(lh.y, rh.y) + wsh * 0.1, Math.max(lh.x, rh.x), Math.max(lh.y, rh.y) + wsh * 0.35);
    }
  }
  create.shot = { face: face.toDataURL('image/jpeg', 0.85), skin, shirt: shirt || DEFAULT.shirt, pants: pants || DEFAULT.pants };
  $('captureStep').hidden = true; $('saveStep').hidden = false; createView.hidden = true;
  $('createStatus').textContent = 'Here is your character.';
  const img = new Image();
  img.onload = () => { faceCache.set('preview', img); const c = $('capturePreview').getContext('2d'); c.clearRect(0, 0, 300, 450); drawMini(c, { id:'preview', ...create.shot }, 300, 450); };
  img.src = create.shot.face;
}

// A small standing character for player cards and the preview.
function drawMini(c, p, w, h) {
  const saved = charH; charH = h * 0.92;
  const cx = w / 2, g = h * 0.97, s = charH;
  const P2 = (x, y) => ({ x: cx + x * s, y: g - y * s });
  const k = {
    lSh: P2(-0.12, 0.74), rSh: P2(0.12, 0.74), lEl: P2(-0.17, 0.58), rEl: P2(0.17, 0.58), lWr: P2(-0.18, 0.44), rWr: P2(0.18, 0.44),
    lHip: P2(-0.08, 0.45), rHip: P2(0.08, 0.45), lKnee: P2(-0.09, 0.23), rKnee: P2(0.09, 0.23), lAnk: P2(-0.09, 0.03), rAnk: P2(0.09, 0.03),
    lFoot: P2(-0.14, 0.01), rFoot: P2(0.14, 0.01), head: { ...P2(0, 0.86), r: s * 0.11, tilt: 0 },
  };
  drawCharacter(c, k, p, false);
  charH = saved;
}

function cameraError(e) {
  const msg = e && e.name === 'NotAllowedError' ? 'Camera access was blocked. Allow the camera for this app in your phone settings, then try again.'
    : 'The camera could not start. Close other apps using it and try again.';
  if (screen === 'create') $('createStatus').textContent = msg; else setBanner('No camera', msg);
}

// ---------------------------------------------------------------- menu
function renderMenu() {
  const list = $('players'); list.innerHTML = '';
  for (const p of allPlayers()) {
    const card = document.createElement('div');
    card.className = 'card' + (p.id === selectedId ? ' sel' : ''); card.setAttribute('role', 'button'); card.tabIndex = 0;
    card.setAttribute('aria-label', `Play as ${p.name}`);
    const cv = document.createElement('canvas'); cv.width = 120; cv.height = 180; card.append(cv);
    const name = document.createElement('div'); name.textContent = p.name; card.append(name);
    const best = document.createElement('div'); best.className = 'best'; best.textContent = p.best ? `Best: ${p.best}` : 'No score yet'; card.append(best);
    const pick = () => { selectedId = p.id; save('dodge-selected', p.id); renderMenu(); };
    card.onclick = pick; card.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') pick(); };
    if (p !== DEFAULT) {
      const del = document.createElement('button'); del.className = 'del'; del.textContent = '✕'; del.setAttribute('aria-label', `Delete ${p.name}`);
      del.onclick = e => {
        e.stopPropagation();
        if (del.dataset.armed) { players = players.filter(q => q.id !== p.id); save('dodge-players', players); if (selectedId === p.id) selectedId = 'default'; renderMenu(); }
        else { del.dataset.armed = '1'; del.textContent = '?'; name.textContent = 'Delete?'; setTimeout(renderMenu, 2500); }
      };
      card.append(del);
    }
    list.append(card);
    const draw = () => { const c = cv.getContext('2d'); c.clearRect(0, 0, 120, 180); drawMini(c, p, 120, 180); };
    if (p.face && !faceImage(p)) { const img = new Image(); img.onload = () => { faceCache.set(p.id, img); draw(); }; img.src = p.face; }
    draw();
  }
  const add = document.createElement('div'); add.className = 'card add'; add.setAttribute('role', 'button'); add.tabIndex = 0;
  add.innerHTML = '<b>+</b>Add player';
  add.onclick = openCreate; add.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') openCreate(); };
  list.append(add);
}

$('playBtn').onclick = () => { audio(); startCamera().then(startGame).catch(e => { startGame(); cameraError(e); }); };
$('snapBtn').onclick = () => { audio(); create.countdown = performance.now() + 5000; $('createStatus').textContent = 'Step back into place and hold still…'; };
$('createCancel').onclick = () => { show('menu'); renderMenu(); };
$('retakeBtn').onclick = () => { create.shot = null; $('captureStep').hidden = false; $('saveStep').hidden = true; createView.hidden = false; };
$('saveBtn').onclick = () => {
  const name = $('nameInput').value.trim() || `Player ${players.length + 1}`;
  const p = { id: 'p' + Date.now().toString(36), name, ...create.shot, best:0 };
  players.push(p); save('dodge-players', players); selectedId = p.id; save('dodge-selected', p.id);
  $('nameInput').value = ''; show('menu'); renderMenu();
};
$('quitBtn').onclick = () => { silenceAll(); stopVillain(); G.state = 'off'; show('menu'); renderMenu(); };
$('againBtn').onclick = startGame;
$('menuBtn').onclick = () => { show('menu'); renderMenu(); };

// On the game-over screen, raising both hands above your head starts another game, so nobody has to walk
// back to the phone or laptop.
let handsUpSince = 0;
function handsUpToRestart(now) {
  const up = lm && now - lastSeen < 500 && seen(P.nose, P.lWr, P.rWr) && lm[P.lWr].y < lm[P.nose].y && lm[P.rWr].y < lm[P.nose].y;
  if (!up) { if (handsUpSince) $('handsHint').textContent = 'Or raise both hands above your head to play again'; handsUpSince = 0; return; }
  if (!handsUpSince) { handsUpSince = now; $('handsHint').textContent = 'Keep them up…'; }
  if (now - handsUpSince > 1200) { handsUpSince = 0; $('handsHint').textContent = 'Or raise both hands above your head to play again'; sfx.go(); startGame(); }
}

// ---------------------------------------------------------------- main loop
let lastFrame = performance.now();
function loop(now) {
  requestAnimationFrame(loop);                                         // keep going even if this frame goes wrong
  const dt = Math.min(Math.max(now - lastFrame, 0), 50); lastFrame = now;
  try {
    if (screen === 'game' || screen === 'create' || screen === 'over') track(now);
    if (screen === 'over') handsUpToRestart(now);
    if (screen === 'game') gameFrame(now, dt);
    else if (screen === 'create') createFrame(now);
  } catch (e) { console.error(e); }
}
resize();
$('versionLabel').textContent = `${EDITION} version ${VERSION}`;
initVision()
  .then(() => { show('menu'); renderMenu(); })
  .catch(e => { $('loadingText').textContent = 'The body tracker could not load. Check your connection and reopen the app.'; console.error(e); });
requestAnimationFrame(loop);

// Hooks for automated testing.
window.__dg = { G, B, motion, buildBody, spawnVillain: () => spawnVillain(performance.now()), get elapsed() { return elapsed(performance.now()); }, speed, get poseModel() { return poseModel; }, get lm() { return lm; }, get charX() { return charX; }, get screen() { return screen; }, spawn: (lane, kind) => spawn(lane, performance.now(), kind) };
