// Dodge It: a full-body camera game. The player's real movements drive a cartoon character who must
// step aside from things falling from the sky, jump over things on the ground and duck under things
// flying at head height.
import { FilesetResolver, PoseLandmarker, FaceDetector } from './lib/mediapipe/vision_bundle.mjs';
import { HAZARDS, BY_LANE, VEHICLES, VEHICLE_KINDS, drawHazard, sizeOf, drawWreck, drawSplat, preloadVehicles } from './hazards.js';
import { createVoice, loadSamples, splat, bigThud, scream, groan, fire, laserCharge, laserShot, villainVoice, swoosh, pow, knockout } from './hazard-sounds.js';
import { drawVillain } from './villain.js';
import { drawScenery as paintScenery } from './scenery.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const OUTLINE = '#1f1a2e';

// Tuning
const JUMP_GAIN = 8;      // jump height boost: a 6 inch jump reaches full height and clears a car
const DUCK_GAIN = 1.6;    // and ducks 1.6x as low, so a modest duck is enough
const MOVE_GAIN = 2.6;    // sideways steps are exaggerated so a step or two takes the character well clear
const LIVES = 3;
const VERSION = '3.6.1';
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
  if (keyMode) { smoothInto(keyPose(now)); lastSeen = now; return; }                          // playing with keys
  if (!pose || video.readyState < 2 || video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  let res;
  const t0 = performance.now();
  try { res = pose.detectForVideo(video, now); } catch (e) { return; }
  watchSpeed(performance.now() - t0);
  if (res.landmarks && res.landmarks.length) { smoothInto(res.landmarks[0]); lastSeen = now; }
}

// ---------------------------------------------------------------- playing without the camera (temporary)
// Arrow keys (or the on-screen buttons) drive a pretend person standing in front of the camera, so the game
// works exactly as it does with a real player: left/right run, Space jumps (as high as a 6 inch jump, which
// clears every vehicle), Down ducks (as low as a 20 cm duck).
let keyMode = false;
const keys = { left:false, right:false, duck:false, flat:false, jumpAt:null, x:0, last:0, lastDownTap:0 };
const STAND = { 0:[.5,.2], 2:[.51,.19], 5:[.49,.19], 7:[.52,.2], 8:[.48,.2], 11:[.56,.3], 12:[.44,.3], 13:[.58,.42], 14:[.42,.42],
  15:[.58,.53], 16:[.42,.53], 23:[.54,.55], 24:[.46,.55], 25:[.54,.72], 26:[.46,.72], 27:[.54,.88], 28:[.46,.88] };
function keyPose(now) {
  const dt = Math.min(50, now - (keys.last || now)) / 1000; keys.last = now;
  let jump = 0;
  if (keys.jumpAt != null) { const u = (now - keys.jumpAt) / 500; if (u < 1) jump = keys.jumpAmp * Math.sin(Math.PI * u); else if (u > 1.5) keys.jumpAt = null; }
  const crouch = keys.jumpHold != null ? clamp((now - keys.jumpHold) / CROUCH_MS, 0, 1) * 0.12 : 0;   // knees bending, deeper the longer Jump is held
  const duck = keys.flat ? 0.75 : Math.max(keys.duck && !jump ? 20 / 170 / 0.77 : 0, crouch), bodyH = 0.71;   // flat: head right down
  return Array.from({ length: 33 }, (_, i) => {
    const p = STAND[i]; if (!p) return { x:.5, y:.5, visibility:.1 };
    let px = p[0] + keys.x, py = p[1] + 0.15 - jump * bodyH;
    if (duck && i < 23) py += duck * bodyH * (i < 11 ? 1 : 0.8);
    if (duck && (i === 23 || i === 24)) py += duck * bodyH * 0.5;
    return { x: px, y: py, visibility: py > 1 ? 0.05 : .99 };
  });
}
const CROUCH_MS = 500;                                                   // holding Jump this long gives the deepest crouch and the highest jump
function setKey(name, down) {
  if (name === 'jump') {
    const now = performance.now();
    if (down) { if (keys.jumpHold == null && keys.jumpAt == null) keys.jumpHold = now; }
    else if (keys.jumpHold != null) { const f = clamp((now - keys.jumpHold) / CROUCH_MS, 0.08, 1); keys.jumpAmp = 0.025 + 0.11 * f; keys.jumpAt = now; keys.jumpHold = null; }   // spring up
    return;
  }
  keys[name] = down;
}
const KEYMAP = { ArrowLeft:'left', ArrowRight:'right', ArrowDown:'duck', ' ':'jump', Spacebar:'jump', ArrowUp:'jump' };
for (const type of ['keydown', 'keyup']) window.addEventListener(type, e => {
  if (!keyMode || screen !== 'game' || !KEYMAP[e.key]) return;
  e.preventDefault();
  if (e.key === 'ArrowDown' && type === 'keydown' && !e.repeat) { const t = performance.now(); if (t - keys.lastDownTap < 350) keys.flat = true; keys.lastDownTap = t; }
  if (e.key === 'ArrowDown' && type === 'keyup') keys.flat = false;
  if (!e.repeat || type === 'keyup') setKey(KEYMAP[e.key], type === 'keydown');
});
function setKeyMode(on) {
  keyMode = on; Object.assign(keys, { left:false, right:false, duck:false, flat:false, jumpAt:null, jumpHold:null, jumpAmp:0.08, x:0, last:0, lastDownTap:0 }); lm = null;
  $('touchPad').hidden = !on; $('handsHint').hidden = on;
}
for (const b of document.querySelectorAll('#touchPad button')) {
  const name = b.dataset.k, on = e => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ } b.classList.add('on'); setKey(name, true); }, off = e => { e.preventDefault(); b.classList.remove('on'); setKey(name, false); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off);   // (held until the finger lifts, even if it slides off)
  b.addEventListener('contextmenu', e => e.preventDefault());
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
  if (!motion.jump && motion.canJump && motion.up > 0.025) { motion.jump = { t0: now, peak: 0, boost: now < (G.boostUntil || 0) }; motion.canJump = false; }
  if (motion.jump) {
    const j = motion.jump;
    // Height is measured while rising (first 0.3 s); the length of the jump never changes, so the
    // fall takes exactly as long as the rise.
    if (now - j.t0 < 300) j.peak = Math.max(j.peak, Math.min(motion.up * JUMP_GAIN, PEAK_MAX) * charH * (j.boost ? 2.6 : 1));   // super jump: 2.6 times as high
    const u = (now - j.t0) / (AIR_TIME * 1000 * (j.boost ? 1.61 : 1));                                                       // (and longer in the air)
    motion.flip = j.boost && u < 1 ? u : 0;                                // super jumps are somersaults
    motion.jumpU = u;
    if (u >= 1) { motion.jump = null; motion.lift = 0; motion.landAt = now; motion.jumpU = null; }
    else motion.lift = 4 * j.peak * u * (1 - u);
  }
  if (!motion.jump) motion.flip = 0;
  if (!motion.jump && motion.up < 0.015) motion.canJump = true;      // land properly before the next jump
  motion.duck = clamp(-motion.up * DUCK_GAIN, 0, 0.45);          // share of its height the character's head drops
}

// Where the character stands: follows the player's head sideways, exaggerated.
let charX = 0;
const xHistory = [];                                              // recent positions, to know how fast the player was moving
function updateCharX(now) {
  const lastT = xHistory.length ? xHistory[xHistory.length - 1].t : now;
  if (motion.jump) {
    // A running jump: carry on sideways at the speed the player was moving when they took off.
    const j = motion.jump;
    if (j.vx === undefined) { const old = xHistory.find(h => now - h.t <= 180) || { t: now, x: charX }; j.vx = now > old.t ? (charX - old.x) / (now - old.t) : 0; }
    charX = clamp(charX + j.vx * (now - lastT), W * 0.06, W * 0.94);
    motion.vx = 0;
    xHistory.push({ t: now, x: charX }); while (xHistory.length && now - xHistory[0].t > 300) xHistory.shift();
    return;
  }
  const target = clamp(W / 2 + motion.side * charH * MOVE_GAIN, W * 0.06, W * 0.94);
  const before = charX;
  charX += (target - charX) * 0.5;
  motion.vx = charX - before;
  xHistory.push({ t: now, x: charX }); while (xHistory.length && now - xHistory[0].t > 300) xHistory.shift();
  motion.run += Math.abs(motion.vx) / (charH * 0.12);           // leg cycle for the running animation
}

// No-camera mode: the arrow keys or buttons move the man directly, at a steady speed (a screen-width in 3 s).
function keyCharX(dt) {
  const run = (keys.right ? 1 : 0) - (keys.left ? 1 : 0), before = charX, v = W / 3000;
  charX = clamp(charX + run * v * dt, W * 0.06, W * 0.94);
  motion.vx = charX - before; if (motion.jump && motion.jump.vx === undefined) motion.jump.vx = run * v;
  motion.run += Math.abs(motion.vx) / (charH * 0.12);
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
  // knees bent as he springs off (straightening in the first part of the jump) and as he lands (absorbing it)
  const ju = motion.jumpU, sinceLand = performance.now() - (motion.landAt || -1e9);
  const bend = ju != null ? (ju < 0.14 ? 1 - ju / 0.14 : ju > 0.86 ? (ju - 0.86) / 0.14 : 0) : clamp(1 - sinceLand / 200, 0, 1);
  const air = clamp(motion.lift / (s * 0.3), 0, 1);
  const P2 = (x, y) => ({ x: charX + x * s, y: foot - y * s });
  const run = Math.abs(motion.vx) > 0.6 && air < 0.1 ? Math.sin(motion.run) : 0;
  const k = {
    lSh: P2(-0.12, 0.74 - d), rSh: P2(0.12, 0.74 - d),
    lHip: P2(-0.08, 0.45 - d * 0.75 - bend * 0.05), rHip: P2(0.08, 0.45 - d * 0.75 - bend * 0.05),
    lKnee: P2(-0.09 - d * 0.35 + run * 0.05 - bend * 0.06, 0.23 - d * 0.25 + air * 0.08 + Math.max(0, run) * 0.05 - bend * 0.04),
    rKnee: P2(0.09 + d * 0.35 - run * 0.05 + bend * 0.06, 0.23 - d * 0.25 + air * 0.08 + Math.max(0, -run) * 0.05 - bend * 0.04),
    lAnk: P2(-0.09 + air * 0.05 + run * 0.08, 0.03 + air * 0.12 + Math.max(0, run) * 0.06),   // tucked together in a jump
    rAnk: P2(0.09 - air * 0.05 - run * 0.08, 0.03 + air * 0.12 + Math.max(0, -run) * 0.06),
    head: { ...P2(0, 0.86 - d), r: s * 0.095, tilt: 0 },
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
      k.tracked = true;
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
// A face with a mood: 'neutral' most of the time, 'alarm' when something is about to hit, 'pain' just after a
// hit. With a photo face the photo is shown instead, with a red flash and a wince-shake when hurt.
function drawHead(c, p, h, mood = 'neutral', now = 0, damage = 0) {
  c.save(); c.translate(h.x, h.y); c.rotate(h.tilt);
  const r = h.r, img = faceImage(p);
  if (BACK_VIEW) {                                                       // the back of his head: ears and hair
    for (const sx of [-1, 1]) { c.fillStyle = shade(p.skin, -0.08); c.beginPath(); c.ellipse(sx * r * 0.86, r * 0.05, r * 0.16, r * 0.26, 0, 0, 7); c.fill(); }
    c.fillStyle = shade(p.skin, -0.05); c.beginPath(); c.ellipse(0, r * 0.04, r * 0.84, r, 0, 0, 7); c.fill();
    const hg = c.createRadialGradient(0, -r * 0.3, r * 0.1, 0, 0, r); hg.addColorStop(0, '#5b4636'); hg.addColorStop(1, '#3d2e24');
    c.fillStyle = hg; c.beginPath(); c.ellipse(0, -r * 0.05, r * 0.84, r * 0.88, 0, 0, 7); c.fill();
    c.restore(); return;
  }
  if (mood === 'pain') c.translate(Math.sin(now / 28) * r * 0.08, 0);                    // wince
  if (img) {
    c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2);
    c.save(); c.clip(); c.drawImage(img, -r, -r, r * 2, r * 2);
    if (mood === 'pain') { c.fillStyle = `rgba(255,30,30,${0.25 + 0.2 * Math.abs(Math.sin(now / 90))})`; c.fillRect(-r, -r, r * 2, r * 2); }
    headDamage(c, r, damage, true);
    c.restore();
    c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.lineWidth = Math.max(2, r * 0.06); c.strokeStyle = OUTLINE; c.stroke();
    c.restore(); return;
  }
  const skin = p.skin, dark = shade(skin, -0.25), ink = 'rgba(40,25,20,0.9)';
  // ears
  for (const sx of [-1, 1]) { c.fillStyle = shade(skin, -0.08); c.beginPath(); c.ellipse(sx * r * 0.86, r * 0.05, r * 0.16, r * 0.26, 0, 0, 7); c.fill(); c.strokeStyle = dark; c.lineWidth = 1; c.stroke(); }
  // face: an oval, lit from the upper left, with a shaded jaw
  const face = new Path2D(); face.ellipse(0, r * 0.04, r * 0.84, r * 1.0, 0, 0, 7);
  const g = c.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r * 1.15); g.addColorStop(0, shade(skin, 0.18)); g.addColorStop(0.7, skin); g.addColorStop(1, dark);
  c.fillStyle = g; c.fill(face); c.strokeStyle = shade(skin, -0.45); c.lineWidth = Math.max(1.5, r * 0.04); c.stroke(face);
  // hair: short, side-parted, greying at the temples
  c.save(); c.clip(face);
  const hair = c.createLinearGradient(0, -r, 0, -r * 0.3); hair.addColorStop(0, '#5b4636'); hair.addColorStop(1, '#3d2e24');
  c.fillStyle = hair; c.beginPath(); c.moveTo(-r, -r * 0.2); c.quadraticCurveTo(-r * 0.9, -r * 1.15, 0, -r * 1.05); c.quadraticCurveTo(r * 0.95, -r * 1.1, r, -r * 0.25);
  c.quadraticCurveTo(r * 0.75, -r * 0.62, r * 0.2, -r * 0.66); c.quadraticCurveTo(-r * 0.3, -r * 0.7, -r * 0.62, -r * 0.5); c.quadraticCurveTo(-r * 0.8, -r * 0.4, -r, -r * 0.2); c.fill();
  c.fillStyle = 'rgba(200,200,200,0.35)'; for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(sx * r * 0.8, -r * 0.3, r * 0.1, r * 0.22, 0, 0, 7); c.fill(); }
  c.lineWidth = Math.max(0.6, r * 0.015);                                    // combed strands
  for (let i = 0; i < 14; i++) {
    const x = -r * 0.85 + i * r * 0.13; c.strokeStyle = i % 3 ? 'rgba(120,95,70,0.5)' : 'rgba(25,18,12,0.5)';
    c.beginPath(); c.moveTo(x * 0.6 - r * 0.05, -r * 1.0); c.quadraticCurveTo(x, -r * 0.85, x * 1.05 + r * 0.04, -r * 0.6 + Math.abs(x) * 0.4); c.stroke();
  }
  // cheekbones catching the light, shadow beside the nose, and a day's stubble on the jaw and chin
  for (const sx of [-1, 1]) {
    const ch = c.createRadialGradient(sx * r * 0.45, r * 0.12, 0, sx * r * 0.45, r * 0.12, r * 0.3); ch.addColorStop(0, 'rgba(255,225,200,0.3)'); ch.addColorStop(1, 'rgba(255,225,200,0)');
    c.fillStyle = ch; c.beginPath(); c.arc(sx * r * 0.45, r * 0.12, r * 0.3, 0, 7); c.fill();
    c.strokeStyle = 'rgba(120,70,50,0.25)'; c.lineWidth = Math.max(1, r * 0.03); c.beginPath(); c.moveTo(sx * r * 0.17, r * 0.3); c.quadraticCurveTo(sx * r * 0.3, r * 0.45, sx * r * 0.27, r * 0.62); c.stroke();
  }
  let sd = 7; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  const jaw = c.createRadialGradient(0, r * 0.75, r * 0.1, 0, r * 0.55, r * 0.8); jaw.addColorStop(0, 'rgba(70,62,62,0.2)'); jaw.addColorStop(1, 'rgba(70,62,62,0)');
  c.fillStyle = jaw; c.fillRect(-r, r * 0.3, r * 2, r);                         // a five o'clock shadow
  c.fillStyle = 'rgba(60,45,35,0.12)';
  for (let i = 0; i < 160; i++) {
    const a = rnd() * Math.PI, d = r * (0.55 + rnd() * 0.45), x = Math.cos(a) * d * 0.84, y = r * 0.04 + Math.sin(a) * d;
    if (y < r * 0.3 || (Math.abs(x) < r * 0.24 && Math.abs(y - r * 0.52) < r * 0.1)) continue;
    c.fillRect(x, y, Math.max(0.5, r * 0.01), Math.max(0.5, r * 0.01));
  }
  c.restore();
  // eyebrows, eyes, nose and mouth by mood
  const alarm = mood === 'alarm', pain = mood === 'pain';
  c.lineCap = 'round';
  for (const sx of [-1, 1]) {
    const ex = sx * r * 0.33, ey = -r * 0.1;
    // brows: level (neutral), raised and arched (alarm), pulled down to the middle (pain)
    c.strokeStyle = '#3d2e24'; c.lineWidth = r * 0.09; c.beginPath();
    if (alarm) { c.moveTo(ex - sx * r * 0.18, ey - r * 0.3); c.quadraticCurveTo(ex, ey - r * 0.44, ex + sx * r * 0.18, ey - r * 0.3); }
    else if (pain) { c.moveTo(ex - sx * r * 0.18, ey - r * 0.12); c.lineTo(ex + sx * r * 0.18, ey - r * 0.27); }
    else { c.moveTo(ex - sx * r * 0.17, ey - r * 0.22); c.quadraticCurveTo(ex, ey - r * 0.28, ex + sx * r * 0.18, ey - r * 0.21); }
    c.stroke();
    if (pain) {                                                      // squeezed shut
      c.strokeStyle = ink; c.lineWidth = r * 0.06; c.beginPath(); c.moveTo(ex - sx * r * 0.14, ey - r * 0.04); c.lineTo(ex + sx * r * 0.02, ey + r * 0.02); c.lineTo(ex + sx * r * 0.14, ey - r * 0.03); c.stroke();
    } else {
      const ew = r * 0.15, eh = alarm ? r * 0.12 : r * 0.075;
      c.fillStyle = '#fbfbf8'; c.beginPath(); c.ellipse(ex, ey, ew, eh, 0, 0, 7); c.fill(); c.strokeStyle = ink; c.lineWidth = Math.max(1, r * 0.03); c.stroke();
      c.fillStyle = '#5a7a3a'; c.beginPath(); c.arc(ex, ey, alarm ? r * 0.055 : r * 0.07, 0, 7); c.fill();     // iris (smaller, staring, when alarmed)
      c.fillStyle = '#111'; c.beginPath(); c.arc(ex, ey, r * 0.032, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(ex - r * 0.02, ey - r * 0.02, r * 0.014, 0, 7); c.fill();
      c.strokeStyle = '#2a1d16'; c.lineWidth = Math.max(1, r * 0.045); c.beginPath(); c.ellipse(ex, ey, ew, eh, 0, Math.PI * 1.05, Math.PI * 1.95); c.stroke();   // lashes along the upper lid
      if (!alarm) { c.strokeStyle = shade(skin, -0.35); c.lineWidth = Math.max(1, r * 0.035); c.beginPath(); c.ellipse(ex, ey - r * 0.005, ew * 1.02, eh * 1.15, 0, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }   // lid
    }
  }
  // nose: a soft shadow down one side and a rounded tip
  c.strokeStyle = shade(skin, -0.3); c.lineWidth = Math.max(1.2, r * 0.045);
  c.beginPath(); c.moveTo(r * 0.04, -r * 0.05); c.quadraticCurveTo(r * 0.12, r * 0.2, r * 0.1, r * 0.27); c.quadraticCurveTo(0, r * 0.33, -r * 0.1, r * 0.27); c.stroke();
  // mouth
  const my = r * 0.52;
  if (alarm) {                                                       // open in fright
    c.fillStyle = '#4a1f1f'; c.beginPath(); c.ellipse(0, my + r * 0.02, r * 0.13, r * 0.16, 0, 0, 7); c.fill(); c.strokeStyle = ink; c.lineWidth = Math.max(1, r * 0.03); c.stroke();
    c.fillStyle = '#f1f1ea'; c.fillRect(-r * 0.09, my - r * 0.12, r * 0.18, r * 0.05);
  } else if (pain) {                                                 // a clenched grimace
    c.fillStyle = '#f1f1ea'; c.beginPath(); c.moveTo(-r * 0.3, my - r * 0.02); c.quadraticCurveTo(0, my - r * 0.1, r * 0.3, my - r * 0.02); c.lineTo(r * 0.24, my + r * 0.1); c.quadraticCurveTo(0, my + r * 0.04, -r * 0.24, my + r * 0.1); c.closePath(); c.fill();
    c.strokeStyle = ink; c.lineWidth = Math.max(1, r * 0.035); c.stroke();
    c.lineWidth = 1; c.beginPath(); c.moveTo(-r * 0.27, my + r * 0.035); c.lineTo(r * 0.27, my + r * 0.035);
    for (let i = -2; i <= 2; i++) { c.moveTo(i * r * 0.09, my - r * 0.06); c.lineTo(i * r * 0.08, my + r * 0.08); } c.stroke();
  } else {                                                           // neutral: a straight, relaxed mouth
    c.strokeStyle = shade(skin, -0.45); c.lineWidth = Math.max(1.5, r * 0.05); c.beginPath(); c.moveTo(-r * 0.2, my); c.quadraticCurveTo(0, my + r * 0.015, r * 0.2, my); c.stroke();
    c.strokeStyle = shade(skin, -0.15); c.lineWidth = Math.max(1, r * 0.03); c.beginPath(); c.moveTo(-r * 0.12, my + r * 0.12); c.quadraticCurveTo(0, my + r * 0.16, r * 0.12, my + r * 0.12); c.stroke();   // lower lip shadow
  }
  headDamage(c, r, damage, false);
  c.restore();
}
// Signs of the knocks he has taken. 1: a black eye, a sticking plaster on the forehead and dirt on his face.
// 2: also a swollen bruise on the cheek, a second plaster and hair sticking up every which way.
function headDamage(c, r, damage, photo) {
  if (!damage) return;
  const plaster = (x, y, a, len) => {
    c.save(); c.translate(x, y); c.rotate(a);
    c.fillStyle = '#e8c39e'; c.strokeStyle = 'rgba(120,80,50,0.6)'; c.lineWidth = 1;
    c.beginPath(); c.roundRect ? c.roundRect(-len / 2, -r * 0.09, len, r * 0.18, r * 0.08) : c.rect(-len / 2, -r * 0.09, len, r * 0.18); c.fill(); c.stroke();
    c.fillStyle = '#f5e1c8'; c.fillRect(-len * 0.16, -r * 0.07, len * 0.32, r * 0.14);
    c.fillStyle = 'rgba(120,80,50,0.35)'; for (const dx of [-0.38, 0.38]) for (const dy of [-0.04, 0.04]) { c.beginPath(); c.arc(dx * len, dy * r, r * 0.012, 0, 7); c.fill(); }
    c.restore();
  };
  {
    const ex = -r * 0.33, ey = -r * 0.1;                                       // black eye
    const g = c.createRadialGradient(ex, ey, r * 0.05, ex, ey, r * 0.3); g.addColorStop(0, 'rgba(70,30,80,0.65)'); g.addColorStop(0.6, 'rgba(90,40,90,0.45)'); g.addColorStop(1, 'rgba(90,40,90,0)');
    c.fillStyle = g; c.beginPath(); c.arc(ex, ey, r * 0.3, 0, 7); c.fill();
    plaster(r * 0.28, -r * 0.6, -0.5, r * 0.55);
    c.fillStyle = 'rgba(110,85,60,0.3)'; for (const [x, y, rr] of [[0.5, 0.35, 0.12], [0.62, 0.48, 0.07], [-0.55, 0.55, 0.09]]) { c.beginPath(); c.arc(x * r, y * r, rr * r, 0, 7); c.fill(); }
  }
  if (damage >= 2) {
    const bx = r * 0.48, by = r * 0.2;                                         // swollen, yellow-edged bruise
    const g = c.createRadialGradient(bx, by, 0, bx, by, r * 0.28); g.addColorStop(0, 'rgba(110,40,110,0.6)'); g.addColorStop(0.6, 'rgba(150,80,120,0.4)'); g.addColorStop(0.85, 'rgba(190,180,60,0.3)'); g.addColorStop(1, 'rgba(190,180,60,0)');
    c.fillStyle = g; c.beginPath(); c.ellipse(bx, by, r * 0.28, r * 0.24, 0, 0, 7); c.fill();
    plaster(-r * 0.15, r * 0.82, 0.3, r * 0.4);
    c.strokeStyle = '#3d2e24'; c.lineWidth = Math.max(1, r * 0.04); c.lineCap = 'round';   // hair sticking up
    for (const [x, a] of [[-0.4, -2.2], [-0.15, -1.75], [0.1, -1.4], [0.35, -1.0], [0.0, -1.6]]) { c.beginPath(); c.moveTo(x * r, -r * 0.92); c.lineTo(x * r + Math.cos(a) * r * 0.3, -r * 0.92 + Math.sin(a) * r * 0.3); c.stroke(); }
  }
}

// A tapered, shaded limb segment (outline, colour, then a soft highlight along one side).
function limb2(c, a, b, w0, w1, color) {
  const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
  const path = new Path2D();
  path.moveTo(a.x + nx * w0 / 2, a.y + ny * w0 / 2); path.lineTo(b.x + nx * w1 / 2, b.y + ny * w1 / 2);
  path.arc(b.x, b.y, w1 / 2, Math.atan2(ny, nx), Math.atan2(ny, nx) - Math.PI, true);   // rounded ends
  path.lineTo(a.x - nx * w0 / 2, a.y - ny * w0 / 2); path.arc(a.x, a.y, w0 / 2, Math.atan2(-ny, -nx), Math.atan2(-ny, -nx) - Math.PI, true); path.closePath();
  const g = c.createLinearGradient(a.x + nx * w0 / 2, a.y + ny * w0 / 2, a.x - nx * w0 / 2, a.y - ny * w0 / 2);
  g.addColorStop(0, shade(color, -0.3)); g.addColorStop(0.45, color); g.addColorStop(0.8, shade(color, 0.15)); g.addColorStop(1, shade(color, -0.15));
  c.fillStyle = g; c.fill(path);
  c.strokeStyle = shade(color, -0.6); c.lineWidth = 1.5; c.beginPath();    // outline the sides only, so joints blend
  c.moveTo(a.x + nx * w0 / 2, a.y + ny * w0 / 2); c.lineTo(b.x + nx * w1 / 2, b.y + ny * w1 / 2);
  c.moveTo(a.x - nx * w0 / 2, a.y - ny * w0 / 2); c.lineTo(b.x - nx * w1 / 2, b.y - ny * w1 / 2); c.stroke();
  return path;
}
function hand(c, el, wr, s, skin) {
  const a = Math.atan2(wr.y - el.y, wr.x - el.x);
  c.save(); c.translate(wr.x, wr.y); c.rotate(a);
  const g = c.createRadialGradient(s * 0.01, -s * 0.01, 0, s * 0.02, 0, s * 0.05); g.addColorStop(0, shade(skin, 0.12)); g.addColorStop(1, shade(skin, -0.22));
  c.fillStyle = g; c.strokeStyle = shade(skin, -0.5); c.lineWidth = 1.2;
  for (let i = 0; i < 4; i++) {                                                // four fingers, slightly curled, ring and little finger shorter
    const y = (-0.013 + i * 0.009) * s, len = [0.03, 0.033, 0.031, 0.025][i] * s;
    c.beginPath(); c.moveTo(s * 0.028, y - s * 0.004); c.quadraticCurveTo(s * 0.028 + len, y - s * 0.004, s * 0.028 + len * 0.95, y + s * 0.003);
    c.quadraticCurveTo(s * 0.028 + len * 0.6, y + s * 0.006, s * 0.028, y + s * 0.004); c.closePath(); c.fill(); c.stroke();
  }
  c.beginPath(); c.ellipse(s * 0.018, 0, s * 0.024, s * 0.021, 0, 0, 7); c.fill(); c.stroke();                // palm
  c.beginPath(); c.moveTo(s * 0.012, -s * 0.016); c.quadraticCurveTo(s * 0.03, -s * 0.034, s * 0.045, -s * 0.026); c.quadraticCurveTo(s * 0.03, -s * 0.018, s * 0.024, -s * 0.01); c.closePath(); c.fill(); c.stroke();   // thumb
  c.restore();
}
function shoe(c, an, ft, s) {
  const dir = Math.sign(ft.x - an.x) || 1;
  c.save(); c.translate(an.x, an.y + s * 0.012); c.scale(dir, 1);
  // trainers: a dark upper with a pale stripe, a thick white sole with a grey tread, laces
  const up = c.createLinearGradient(0, -s * 0.035, 0, s * 0.015); up.addColorStop(0, '#5a6270'); up.addColorStop(1, '#262b33');
  c.fillStyle = up; c.strokeStyle = OUTLINE; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(-s * 0.03, s * 0.012); c.lineTo(-s * 0.032, -s * 0.022); c.quadraticCurveTo(-s * 0.005, -s * 0.038, s * 0.025, -s * 0.018);
  c.quadraticCurveTo(s * 0.08, -s * 0.012, s * 0.09, s * 0.012); c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = 'rgba(235,235,230,0.8)'; c.lineWidth = Math.max(1, s * 0.004); c.beginPath(); c.moveTo(-s * 0.02, s * 0.004); c.quadraticCurveTo(s * 0.02, -s * 0.004, s * 0.05, -s * 0.012); c.stroke();
  c.fillStyle = '#f4f3ee'; c.beginPath(); c.roundRect ? c.roundRect(-s * 0.035, s * 0.008, s * 0.13, s * 0.016, s * 0.006) : c.rect(-s * 0.035, s * 0.008, s * 0.13, s * 0.016); c.fill(); c.strokeStyle = OUTLINE; c.lineWidth = 1.2; c.stroke();
  c.fillStyle = '#8a8d91'; c.fillRect(-s * 0.033, s * 0.02, s * 0.126, s * 0.004);
  c.strokeStyle = '#eceae3'; c.lineWidth = 1.1;
  for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(s * (0.0 + i * 0.01), -s * 0.03 + i * s * 0.004); c.lineTo(s * (0.01 + i * 0.01), -s * 0.022 + i * s * 0.004); c.stroke(); }
  c.restore();
}

// The player's man: natural proportions, a shaded shirt with folds and a collar, a belt, trousers with a
// crease, arms with hands, a neck, and leather shoes. mood: see drawHead.
function drawCharacter(c, k, p, hurt, mood = 'neutral', now = performance.now(), damage = 0) {
  const s = charH, shirt = p.shirt, pants = p.pants || DEFAULT.pants, skin = p.skin;
  c.save();
  if (hurt) c.globalAlpha = 0.55 + 0.35 * Math.abs(Math.sin(now / 70));   // blink while safe after a hit
  // A photo-face player can't pull faces, so the body shows it: shoulders hunch up and (unless the camera is
  // copying the arms) the arms come up to shield the head.
  if (faceImage(p) && mood === 'alarm') {
    k = { ...k, lSh: { x: k.lSh.x + s * 0.01, y: k.lSh.y - s * 0.03 }, rSh: { x: k.rSh.x - s * 0.01, y: k.rSh.y - s * 0.03 } };
    for (const [side, sx] of [['l', -1], ['r', 1]]) if (!k.tracked) {
      const S = k[side + 'Sh'];
      k[side + 'El'] = { x: S.x + sx * s * 0.09, y: S.y - s * 0.02 };
      k[side + 'Wr'] = { x: k.head.x + sx * s * 0.06, y: k.head.y - s * 0.02 };
    }
  }
  if (damage >= 2) {                                                       // sore: shoulders droop, one knee bent (a limp)
    k = { ...k, lSh: { x: k.lSh.x, y: k.lSh.y + s * 0.012 }, rSh: { x: k.rSh.x, y: k.rSh.y + s * 0.02 }, rKnee: { x: k.rKnee.x + s * 0.02, y: k.rKnee.y - s * 0.01 }, rAnk: { x: k.rAnk.x + s * 0.005, y: k.rAnk.y - s * 0.012 } };
  }
  // legs (trousers) and shoes
  for (const [h, kn, an, ft] of [[k.lHip, k.lKnee, k.lAnk, k.lFoot], [k.rHip, k.rKnee, k.rAnk, k.rFoot]]) {
    const up = limb2(c, h, kn, s * 0.1, s * 0.075, pants), lo = limb2(c, kn, an, s * 0.072, s * 0.06, pants);
    // denim: a fine diagonal twill, a faded knee, and the orange stitching down the outside seam
    for (const part of [up, lo]) {
      c.save(); c.clip(part);
      c.strokeStyle = 'rgba(255,255,255,0.07)'; c.lineWidth = 1;
      for (let y = Math.min(h.y, an.y) - s * 0.1; y < Math.max(h.y, an.y) + s * 0.1; y += s * 0.008) { c.beginPath(); c.moveTo(h.x - s * 0.1, y); c.lineTo(h.x + s * 0.1, y - s * 0.06); c.stroke(); }
      const fade = c.createRadialGradient(kn.x, kn.y, 0, kn.x, kn.y, s * 0.06); fade.addColorStop(0, 'rgba(255,255,255,0.09)'); fade.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = fade; c.fillRect(kn.x - s * 0.06, kn.y - s * 0.06, s * 0.12, s * 0.12);
      c.restore();
    }
    const out = Math.sign(h.x - (k.lHip.x + k.rHip.x) / 2) || 1;
    c.strokeStyle = 'rgba(214,140,60,0.45)'; c.lineWidth = 0.8; c.setLineDash([1.5, 2]);
    c.beginPath(); c.moveTo(h.x + out * s * 0.04, h.y); c.lineTo(kn.x + out * s * 0.03, kn.y); c.lineTo(an.x + out * s * 0.024, an.y - s * 0.01); c.stroke(); c.setLineDash([]);
    shoe(c, an, ft, s);
    if (damage >= 2 && h === k.rHip) {                                       // ripped jeans at the knee, a scraped knee showing
      const hole = new Path2D(); const hx = kn.x, hy = kn.y + s * 0.005;
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, rr = s * (i % 2 ? 0.026 : 0.017); i ? hole.lineTo(hx + Math.cos(a) * rr, hy + Math.sin(a) * rr * 0.75) : hole.moveTo(hx + rr, hy); }
      hole.closePath(); c.fillStyle = skin; c.fill(hole); c.strokeStyle = 'rgba(240,240,250,0.8)'; c.lineWidth = 1.2; c.stroke(hole);
      c.save(); c.clip(hole); c.strokeStyle = 'rgba(190,30,30,0.7)'; c.lineWidth = 1;
      for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(hx - s * 0.015, hy + i * s * 0.005); c.lineTo(hx + s * 0.015, hy + i * s * 0.005 - s * 0.006); c.stroke(); }
      c.restore();
    }
  }
  // torso: shirt shaped over the shoulders, a little narrower at the waist
  const grow = (a, o, f) => ({ x: a.x + (a.x - o.x) * f, y: a.y + (a.y - o.y) * f });
  const ls = grow(k.lSh, k.rSh, 0.12), rs = grow(k.rSh, k.lSh, 0.12), lh = grow(k.lHip, k.rHip, 0.12), rh = grow(k.rHip, k.lHip, 0.12);
  const neck = { x: (k.lSh.x + k.rSh.x) / 2, y: (k.lSh.y + k.rSh.y) / 2 };
  const torso = new Path2D();
  torso.moveTo(lh.x, lh.y); torso.lineTo(ls.x, ls.y + s * 0.03); torso.quadraticCurveTo(ls.x + s * 0.005, ls.y - s * 0.005, ls.x + s * 0.05, ls.y - s * 0.012);
  torso.lineTo(rs.x - s * 0.05, rs.y - s * 0.012); torso.quadraticCurveTo(rs.x - s * 0.005, rs.y - s * 0.005, rs.x, rs.y + s * 0.03);
  torso.lineTo(rh.x, rh.y); torso.closePath();
  // neck first (the collar sits over it)
  const ng = c.createLinearGradient(neck.x - s * 0.03, 0, neck.x + s * 0.03, 0); ng.addColorStop(0, shade(skin, -0.25)); ng.addColorStop(0.5, skin); ng.addColorStop(1, shade(skin, -0.15));
  c.fillStyle = ng; c.strokeStyle = OUTLINE; c.lineWidth = 2;
  c.beginPath(); c.rect(neck.x - s * 0.028, k.head.y, s * 0.056, neck.y - k.head.y + s * 0.01); c.fill(); c.stroke();
  const tg = c.createLinearGradient(ls.x, 0, rs.x, 0); tg.addColorStop(0, shade(shirt, -0.3)); tg.addColorStop(0.35, shade(shirt, 0.1)); tg.addColorStop(0.7, shirt); tg.addColorStop(1, shade(shirt, -0.35));
  c.fillStyle = tg; c.fill(torso); c.strokeStyle = OUTLINE; c.lineWidth = 2.5; c.stroke(torso);
  c.save(); c.clip(torso);
  c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 1.5;                                         // folds
  for (const [f, b] of [[0.3, 0.06], [0.62, -0.05], [0.8, 0.04]]) { const y = neck.y + (lh.y - neck.y) * f; c.beginPath(); c.moveTo(neck.x - s * 0.07, y); c.quadraticCurveTo(neck.x + b * s, y + s * 0.02, neck.x + s * 0.07, y - s * 0.01); c.stroke(); }
  c.strokeStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.moveTo(neck.x, neck.y + s * 0.03); c.lineTo((lh.x + rh.x) / 2, lh.y); c.stroke();   // button placket
  if (damage >= 1) { c.fillStyle = 'rgba(110,85,60,0.35)'; for (const [fx, fy, rr] of [[-0.05, 0.08, 0.025], [0.04, 0.16, 0.018], [-0.02, 0.2, 0.014], [0.06, 0.05, 0.012]]) { c.beginPath(); c.ellipse(neck.x + fx * s, neck.y + fy * s, rr * s, rr * 0.7 * s, 0.4, 0, 7); c.fill(); } }
  if (damage >= 2) {                                                         // pocket torn half off, hanging down
    const px = neck.x + s * 0.05, py = neck.y + s * 0.06;
    c.fillStyle = shade(shirt, -0.12); c.strokeStyle = shade(shirt, -0.5); c.lineWidth = 1;
    c.beginPath(); c.moveTo(px - s * 0.025, py); c.lineTo(px + s * 0.02, py + s * 0.004); c.lineTo(px + s * 0.03, py + s * 0.045); c.lineTo(px - s * 0.008, py + s * 0.05); c.closePath(); c.fill(); c.stroke();
  }
  c.fillStyle = 'rgba(255,255,255,0.7)'; for (let i = 1; i < 4; i++) { c.beginPath(); c.arc(neck.x + ((lh.x + rh.x) / 2 - neck.x) * i / 4 + s * 0.006, neck.y + (lh.y - neck.y) * i / 4, s * 0.006, 0, 7); c.fill(); }
  c.restore();
  // collar
  c.fillStyle = shade(shirt, 0.2); c.strokeStyle = OUTLINE; c.lineWidth = 1.5;
  for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(neck.x + sx * s * 0.03, neck.y - s * 0.012); c.lineTo(neck.x + sx * s * 0.055, neck.y + s * 0.005); c.lineTo(neck.x + sx * s * 0.005, neck.y + s * 0.04); c.closePath(); c.fill(); c.stroke(); }
  if (BACK_VIEW) { c.fillStyle = tg; c.fill(torso); c.strokeStyle = OUTLINE; c.lineWidth = 2.5; c.stroke(torso); }   // seen from behind: a plain shirt back
  // belt with a buckle
  c.fillStyle = '#2b1d14'; c.beginPath(); c.moveTo(lh.x, lh.y - s * 0.03); c.lineTo(rh.x, rh.y - s * 0.03); c.lineTo(rh.x, rh.y); c.lineTo(lh.x, lh.y); c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = '#d4b45a'; c.lineWidth = 2; c.strokeRect((lh.x + rh.x) / 2 - s * 0.015, (lh.y + rh.y) / 2 - s * 0.027, s * 0.03, s * 0.024);
  // arms: sleeve, forearm, hand
  for (const [sh, el, wr] of [[k.lSh, k.lEl, k.lWr], [k.rSh, k.rEl, k.rWr]]) {
    limb2(c, sh, el, s * 0.07, s * 0.058, shade(shirt, -0.05));
    const cuff = { x: el.x + (wr.x - el.x) * 0.35, y: el.y + (wr.y - el.y) * 0.35 };
    limb2(c, el, cuff, s * 0.058, s * 0.055, shade(shirt, -0.05));                                  // sleeve rolled to below the elbow
    if (damage >= 1 && sh === k.lSh) {                                       // torn sleeve, the arm showing through
      const mx = (sh.x + el.x) / 2, my = (sh.y + el.y) / 2, tear = new Path2D();
      tear.moveTo(mx - s * 0.02, my - s * 0.025); tear.lineTo(mx + s * 0.005, my - s * 0.012); tear.lineTo(mx + s * 0.022, my - s * 0.02); tear.lineTo(mx + s * 0.012, my + s * 0.005);
      tear.lineTo(mx + s * 0.02, my + s * 0.025); tear.lineTo(mx - s * 0.005, my + s * 0.012); tear.lineTo(mx - s * 0.02, my + s * 0.02); tear.lineTo(mx - s * 0.012, my); tear.closePath();
      c.fillStyle = shade(skin, -0.1); c.fill(tear); c.strokeStyle = shade(shirt, -0.5); c.lineWidth = 1.2; c.stroke(tear);
      c.strokeStyle = shade(shirt, 0.25); c.lineWidth = 0.8; for (const [dx, dy] of [[-0.02, -0.025], [0.022, -0.02], [0.02, 0.025]]) { c.beginPath(); c.moveTo(mx + dx * s, my + dy * s); c.lineTo(mx + dx * s * 1.3, my + dy * s * 1.4); c.stroke(); }   // frayed threads
    }
    limb2(c, cuff, wr, s * 0.046, s * 0.036, skin);
    hand(c, el, wr, s, skin);
  }
  drawHead(c, p, k.head, mood, now, damage);
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
// A tomahawk or boomerang is judged by its actual shape, wherever it points as it spins, so a hit counts
// exactly when the picture shows it touching the player. Segments: [x1, y1, x2, y2, half-thickness].
const SHAPES = {
  tomahawk: [[-0.175, 0, 0.15, 0, 0.013], [0.115, -0.015, 0.11, -0.1, 0.03], [0.07, -0.105, 0.19, -0.12, 0.022], [0.1, 0.03, 0.14, 0.03, 0.02]],
  boomerang: [[0, -0.025, -0.155, 0.055, 0.022], [0, -0.025, 0.155, 0.055, 0.022]],
};
function shapeHits(cir, hz) {
  const s = charH * HAZARDS[hz.kind].scale, cs = Math.cos(hz.spin), sn = Math.sin(hz.spin);
  const pt = (px, py) => { const x = hz.dir * px * s, y = py * s; return { x: hz.x + x * cs - y * sn, y: hz.y + x * sn + y * cs }; };
  return SHAPES[hz.kind].some(([x1, y1, x2, y2, t]) => { const a = pt(x1, y1), b = pt(x2, y2); return distToSegment(cir, a.x, a.y, b.x, b.y) < cir.r + t * s; });
}
// A vehicle is judged by its solid parts: low over the hood, bed or trunk, full height only over the cab or
// roof. So a jump clears the low front before you reach the top and lets you land over the low back.
function vehicleHits(cir, hz) {
  const V = VEHICLES[hz.kind], s = charH * (V.size || 1), gy = hz.y + hz.h / 2;
  return V.boxes.some(([x0, x1, top]) => {
    const a = hz.x + hz.dir * x0 * s, b = hz.x + hz.dir * x1 * s, lo = Math.min(a, b), hi = Math.max(a, b);
    const dx = Math.max(lo - cir.x, 0, cir.x - hi), dy = Math.max(gy - top * s - cir.y, 0, cir.y - gy);
    return dx * dx + dy * dy < cir.r * cir.r;
  });
}
function circleHitsBox(cir, hz) {
  if (HAZARDS[hz.kind].shaped) return shapeHits(cir, hz);
  if (HAZARDS[hz.kind].vehicle) return vehicleHits(cir, hz);
  if (hz.kind === 'frog') {
    const foot = hz.y + hz.h / 2, x0 = hz.x - hz.dir * charH * 0.25, x1 = hz.x + hz.dir * charH * 0.28, lo = Math.min(x0, x1), hi = Math.max(x0, x1);
    const dx = Math.max(lo - cir.x, 0, cir.x - hi), dy = Math.max(foot - charH * 0.5 - cir.y, 0, cir.y - foot); return dx * dx + dy * dy < cir.r * cir.r;   // its body (a jump clears it sitting)
  }
  if (hz.lane === 'charge') {                                          // the elephant's body: from its belly up (lying flat is under it)
    const dx = Math.max(Math.abs(cir.x - hz.x) - hz.w * 0.42, 0), top = groundY - charH * 1.25, bot = groundY - charH * 0.38;
    const dy = Math.max(top - cir.y, 0, cir.y - bot); return dx * dx + dy * dy < cir.r * cir.r;
  }
  if (HAZARDS[hz.kind].pogo) {                                         // the kid and his pogo stick: a tall, narrow shape
    const s = charH * HAZARDS.pogo.scale; return distToSegment(cir, hz.x, hz.y + 0.35 * s, hz.x, hz.y - 0.28 * s) < cir.r + 0.075 * s;
  }
  const r = HAZARDS[hz.kind].hitR;
  if (hz.kind === 'eagle' && hz.talon > 0.5) {                      // its open talons, reaching down and forward
    const s = charH * HAZARDS.eagle.scale, k = hz.talon, lx = hz.dir * (0.05 + 0.05 * k) * s, ly = (0.09 + 0.05 * k) * s, cs = Math.cos(hz.spin), sn = Math.sin(hz.spin);
    if (Math.hypot(cir.x - (hz.x + lx * cs - ly * sn), cir.y - (hz.y + lx * sn + ly * cs)) < cir.r + 0.035 * charH) return true;
  }
  if (r) return Math.hypot(cir.x - hz.x, cir.y - hz.y) < r * charH + cir.r;   // round hit area (a diving plane)
  // A little forgiving at the edges. Things on the ground are judged by their solid middle (a car's
  // bonnet and boot are lower than its roof), so a well-timed jump clears them.
  const hw = hz.w * (hz.lane === 'ground' ? 0.3 : 0.4), hh = hz.h * (HAZARDS[hz.kind].hitH ?? (hz.lane === 'ground' ? 0.35 : 0.4));
  const dx = Math.max(Math.abs(cir.x - hz.x) - hw, 0), dy = Math.max(Math.abs(cir.y - hz.y) - hh, 0);
  return dx * dx + dy * dy < cir.r * cir.r;
}

// ---------------------------------------------------------------- scenery
function drawScenery(c, now) { paintScenery(c, W, H, groundY, now); }   // see scenery.js

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
function renderHearts() {
  $('hearts').textContent = '♥'.repeat(G.lives) + '♡'.repeat(LIVES - G.lives);
  $('healthFill').style.width = (G.lives / LIVES * 100) + '%'; $('healthBar').classList.toggle('low', G.lives === 1);
}

function startGame() {
  audio(); resize(); silenceAll();
  try { preloadVehicles(charH); } catch (e) { console.error(e); }
  stopVillain();
  Object.assign(G, { squish:null, seen:{}, quake:null, stagger:null, sawEle:false, knock:null, carry:null, flat:false, lay:0, laySide:1, boostUntil:0, nextHealth:performance.now() + 60000, nextEnergy:performance.now() + 60000 + 30000 + Math.random() * 60000, sawPogo:false, sawUfo:false, sawVillain:false, villain:null, state:'ready', lives:LIVES, score:0, hazards:[], pending:[], effects:[], tutorial:0, hurtAt:0, dangerUntil:0, headSplat:0, stats:{ jumps:0, ducks:0, steps:0 },
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

function spawn(lane, now, kind = null, aimed = false, dir = null) {
  if (lane === 'villain') return spawnVillain(now);
  kind = kind || BY_LANE[lane][Math.floor(Math.random() * BY_LANE[lane].length)];
  if (kind === 'car') kind = VEHICLE_KINDS[Math.floor(Math.random() * VEHICLE_KINDS.length)];   // one of six vehicles
  const d = HAZARDS[kind], s = charH, w = sizeOf(kind).w * s, h = sizeOf(kind).h * s, sp = d.speed * s * speedUp(now) / 1000;
  const hz = { kind, lane, w, h, born: now, dir: 1, hit: false, done: false, spin: 0 };
  if (lane === 'sky' && d.dives) {
    // A plane dives at 30 to 70 degrees from either side, aimed at the player, nose first.
    const th = (30 + Math.random() * 40) * Math.PI / 180, dir = Math.random() < 0.5 ? 1 : -1;
    const tx = skyTarget(w, aimed);
    const v = 2.0 * s * speedUp(now) / 1000, L = (groundY + h) / Math.sin(th);
    hz.dir = dir; hz.spin = dir > 0 ? th : -th; hz.angle = th;
    hz.x = tx - dir * Math.cos(th) * L; hz.y = groundY - L * Math.sin(th);
    hz.vx = dir * v * Math.cos(th); hz.vy = v * Math.sin(th);
  } else if (lane === 'ufo') {
    // A UFO glides across the sky, bobbing up and down, and twice locks on and fires its laser.
    hz.dir = Math.random() < 0.5 ? 1 : -1;
    hz.x = hz.dir > 0 ? -w : W + w; hz.baseY = H * 0.2 + Math.random() * H * 0.08; hz.y = hz.baseY;
    hz.vx = hz.dir * sp; hz.cruise = sp; hz.vy = 0; hz.shots = 0; hz.nextShot = now + 1400 + Math.random() * 800; hz.aim = null;
    const t = elapsed(now); hz.maxShots = t < 120 ? 1 : t < 180 ? 2 : 3;   // more shots per visit as the game goes on
  } else if (lane === 'charge') {
    // The elephant charges in from one side and stops short of the player (on screen, so they can see it)...
    let dr = Math.random() < 0.5 ? 1 : -1;
    const stopGap = w / 2 + charH * 1.3;
    if ((dr > 0 ? charX - stopGap : W - charX - stopGap) < W * 0.12) dr = -dr;
    hz.dir = dr; hz.x = dr > 0 ? -w / 2 : W + w / 2; hz.y = groundY - ELE_FOOT * s * d.scale; hz.vy = 0;
    hz.stopX = charX - dr * stopGap; hz.state = 'run'; hz.stateAt = now; hz.rear = 0; hz.nextStep = now;
    hz.vx = dr * charH * 2.0 * speedUp(now) / 1000;
  } else if (lane === 'pack') {
    // A health or energy pack drifts down under a parachute somewhere across the screen (not aimed).
    hz.x = W * (0.12 + Math.random() * 0.76); hz.y = -h; hz.vx = 0; hz.vy = charH * 0.5 / 1000; hz.sway = Math.random() * 6;
  } else if (lane === 'bounce' && d.frog) {
    // A big frog comes hopping in from one side, in bursts of 1 to 3 hops with pauses in between (see updateFrog).
    hz.dir = Math.random() < 0.5 ? 1 : -1; hz.x = hz.dir > 0 ? -w * 0.45 : W + w * 0.45; hz.y = groundY - h / 2;
    hz.vx = 0; hz.vy = 0; hz.g = 0; hz.state = 'sit'; hz.sitUntil = now; hz.hopsLeft = 1 + Math.floor(Math.random() * 3); hz.air = 0; hz.tongue = -1; hz.puff = 0; hz.tongues = [];
  } else if (lane === 'bounce') {
    // A kid on a pogo stick bounces straight across the screen in 4 or 5 hops, his feet rising to just over the
    // man's head. He doesn't aim: watch his hops and step out of the way.
    hz.dir = Math.random() < 0.5 ? 1 : -1;
    const A = charH * POGO_RISE, T = 1800 / Math.sqrt(speedUp(now)) * (0.9 + Math.random() * 0.2), n = Math.random() < 0.5 ? 4 : 5;
    const x0 = hz.dir > 0 ? -w / 2 : W + w / 2, x1 = hz.dir > 0 ? W + w / 2 : -w / 2;
    hz.vx = hz.dir * Math.abs(x1 - x0) / (n * T); hz.g = 8 * A / (T * T); hz.hopV = 4 * A / T;
    const tau = Math.random() * T;                                   // how far into a hop he is as he appears
    hz.x = x0; hz.y = groundY - POGO_FOOT * s - 4 * A * tau * (T - tau) / (T * T); hz.vy = -4 * A * (T - 2 * tau) / (T * T);
  } else if (lane === 'sky') {
    // Falling things start slowly and speed up under gravity.
    hz.x = skyTarget(w, aimed);
    if (d.tumbles) { hz.spin = (Math.random() - 0.5) * 1.2; hz.spinV = (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.5) / 1000; }   // rolls as it falls
    hz.y = -h; hz.vx = 0; hz.vy = (d.fallV0 ? d.fallV0 / 1000 : FALL_V0) * s; hz.g = fallGravity(kind, now);
  } else {
    hz.dir = dir || (Math.random() < 0.5 ? 1 : -1);
    let lead = sp * 150;                                                          // starts just off screen
    if (kind === 'arrow') lead += sp * 450;                                        // the bow twangs a moment before the arrow appears
    if (d.vehicle) {
      // Fast cars start further off screen (you hear the engine first), so there's always at least 1.5 s
      // to react before one reaches the player.
      const T = (Math.abs((hz.dir > 0 ? -w / 2 - lead : W + w / 2 + lead) - charX)) / sp;
      if (T < 1500) lead += (1500 - T) * sp;
      const cols = VEHICLES[kind].colours; hz.colour = cols[Math.floor(Math.random() * cols.length)];
    }
    hz.x = hz.dir > 0 ? -w / 2 - lead : W + w / 2 + lead;
    hz.y = lane === 'ground' ? groundY - h / 2 : groundY - charH * 0.95;   // flyers come at head height
    if (d.twoPass) {
      // The missile: one pass or two (half the time each), and each pass high (duck) or low (jump), at random.
      const passes = Math.random() < 0.5 ? 1 : 2;                       // e.g. 'H', 'L', 'HL', 'LL' (tests can choose)
      hz.plan = window.__dgMissile || Array.from({ length: passes }, () => Math.random() < 0.5 ? 'H' : 'L').join('');
      setMissileHeight(hz, hz.plan[0]);
    }
    hz.vx = hz.dir * sp; hz.vy = 0;
    if (d.arc) {
      // Thrown in a shallow arc: it leaves the thrower's hand a little above head height travelling almost
      // level, and drops gently under gravity so it is at head height as it reaches the player, then keeps
      // falling gently behind them. Ducking gets under it.
      const T = Math.abs(hz.x - charX) / sp;                          // ms until it reaches the player
      const yAt = groundY - charH * TOMAHAWK_AT, y0 = yAt - charH * 0.3;
      hz.g = 2 * (yAt - y0) / (T * T); hz.y = y0; hz.vy = 0;
    }
    if (d.swoops) swoopPath(hz, sp);
    if (d.returns) boomerangPath(hz, sp);
  }
  hz.voice = audio() ? createVoice(actx, kind) : null;
  G.hazards.push(hz);
  return hz;
}

// Things that fly along a curved path (the eagle and the boomerang): a smooth curve through the given points,
// stored as a list of points with the distance along the curve to each, so they can move along it at any speed.
const TOMAHAWK_AT = 1.0;   // height of the tomahawk's centre as it reaches the player, in character heights
function setPath(hz, pts, lowest = Infinity) {
  const out = [], P = [pts[0], ...pts, pts[pts.length - 1]];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    for (let j = 0; j < 16; j++) {
      const t = j / 16, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c2, d2) => 0.5 * (2 * b + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d2) * t2 + (-a + 3 * b - 3 * c2 + d2) * t3);
      out.push({ x: f(p0[0], p1[0], p2[0], p3[0]), y: Math.min(lowest, f(p0[1], p1[1], p2[1], p3[1])) });   // never dips below its lowest point
    }
  }
  out.push({ x: pts[pts.length - 1][0], y: pts[pts.length - 1][1] });
  let L = 0; out[0].d = 0;
  for (let i = 1; i < out.length; i++) { L += Math.hypot(out[i].x - out[i - 1].x, out[i].y - out[i - 1].y); out[i].d = L; }
  hz.path = out; hz.pathLen = L; hz.dist = 0; hz.seg = 0; hz.x = out[0].x; hz.y = out[0].y; hz.vx = 0; hz.vy = 0;
}
function pathPoint(hz, d) {
  const P = hz.path; while (hz.seg < P.length - 2 && P[hz.seg + 1].d < d) hz.seg++;
  const a = P[hz.seg], b = P[hz.seg + 1], f = clamp((d - a.d) / ((b.d - a.d) || 1), 0, 1);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, tx: b.x - a.x, ty: b.y - a.y };
}
// The eagle comes in high from one side and swoops down, picking one of four moves: a U-shaped dip that
// bottoms out at head height (duck); down then level at head height (duck); down then skimming just above
// the ground (jump); or down at the player then turning back up and out the side it came from.
function swoopPath(hz, sp) {
  let dir = Math.random() < 0.5 ? 1 : -1;
  const up0 = x => dir > 0 ? x : W - x;
  if (up0(charX) < W * 0.35) dir = -dir;                             // come from the far side, so there's room to dive
  const X = u => dir > 0 ? u : W - u, up = up0(charX);
  const top = H * (0.02 + Math.random() * 0.08), yh = groundY - charH * 0.93, yl = groundY - charH * 0.15, mid = y => (top + y) / 2;
  const ys = groundY - charH * 1.1;                                   // pulling out of a strike: its open talons reach down to head height
  const move = window.__dgMove || ['dip', 'level', 'low', 'back'][Math.floor(Math.random() * 4)]; hz.move = move;
  const pts = {
    dip:   [[-0.08 * W, top], [up - 0.22 * W, mid(ys)], [up, ys], [up + 0.22 * W, mid(ys)], [Math.max(1.12 * W, up + 0.4 * W), top]],
    level: [[-0.08 * W, top], [up - 0.3 * W, mid(yh)], [up - 0.12 * W, yh], [up + 0.1 * W, yh], [Math.max(1.15 * W, up + 0.3 * W), yh]],
    low:   [[-0.08 * W, top], [up - 0.3 * W, mid(yl)], [up - 0.12 * W, yl], [up + 0.1 * W, yl], [Math.max(1.15 * W, up + 0.3 * W), yl]],
    back:  [[-0.08 * W, top], [up - 0.25 * W, mid(ys)], [up, ys], [up - 0.03 * W, ys - charH * 0.4], [up - 0.2 * W, mid(ys)], [-0.15 * W, top]],
  }[move];
  hz.dir = dir; hz.speed = sp; setPath(hz, pts.map(([u, y]) => [X(u), y]), move === 'low' ? yl : move === 'level' ? yh : ys); hz.flapPh = 0;
  hz.willPoop = window.__dgPoop ?? Math.random() < 0.5;               // half try; about half of those find a fair moment: ~1 in 4 (tests can choose)
}
// The boomerang comes in at head height from one side, travels half or most of the way across, slows and
// swings round, and goes back out the side it came from: at head height again (duck, duck) or low along the
// ground (duck, then jump).
function boomerangPath(hz, sp) {
  // Always comes in at head height (duck), flying level or on a gentle slope that puts it at head height as it
  // passes the player. It turns round a random distance past them and comes back: half the time still at head
  // height (duck), half the time skimming the floor (jump). Any change of height happens in the turn, well
  // away from the player.
  const yh = groundY - charH * TOMAHAWK_AT, yl = groundY - charH * 0.14;
  let low = window.__dgFlight ? window.__dgFlight === 'back-low' : (window.__dgLow ?? Math.random() < 0.5);
  let dir = Math.random() < 0.5 ? 1 : -1;
  const upOf = d => d > 0 ? charX : W - charX, need = () => (low ? 0.42 : 0.22) * W;
  if (W * 0.92 - upOf(dir) < need()) dir = -dir;                     // come from the side with room to turn beyond the player
  if (W * 0.92 - upOf(dir) < need()) low = false;
  const X = u => dir > 0 ? u : W - u, up = upOf(dir);
  const min = up + need(), D = min + Math.random() * Math.max(0, W * 0.92 - min);   // a random distance past the player
  const slope = [-1, 0, 1][Math.floor(Math.random() * 3)] * charH * 0.12 / W, yAt = u => yh + slope * (u - up);
  const pts = low
    ? [[-0.1 * W, yAt(-0.1 * W)], [D - 0.15 * W, yAt(D - 0.15 * W)], [D, yAt(D) + (yl - yAt(D)) * 0.4], [D - 0.15 * W, yl], [-0.15 * W, yl]]
    : [[-0.1 * W, yAt(-0.1 * W)], [D - 0.15 * W, yAt(D - 0.15 * W)], [D, yAt(D) - charH * 0.12], [D - 0.15 * W, yAt(D) - charH * 0.2], [D - 0.35 * W, yh], [-0.15 * W, yh]];
  hz.flight = low ? 'back-low' : 'back-high'; hz.dir = dir; hz.speed = sp; hz.turnX = X(D); hz.passSide = Math.sign(X(-0.1 * W) - charX); hz.passes = 0;
  setPath(hz, pts.map(([u, y]) => [X(u), y]), low ? yl : yh + charH * 0.15);
  if (!low) {                                                         // the way back never dips below head height
    const P = hz.path; let turn = 0;
    P.forEach((q, i) => { if (dir > 0 ? q.x > P[turn].x : q.x < P[turn].x) turn = i; });
    for (let i = turn; i < P.length; i++) P[i].y = Math.min(P[i].y, yh);
  }
}// Move a path-follower along. The eagle speeds up as it dives; the boomerang slows as it swings round.
function followPath(hz, dt) {
  const prev = { x: hz.x, y: hz.y };
  let v = hz.speed;
  const here = pathPoint(hz, hz.dist), slope = here.ty / (Math.hypot(here.tx, here.ty) || 1);
  if (hz.kind === 'eagle') {
    v *= slope > 0 ? 1 + 0.8 * slope : 1 + 0.3 * slope; hz.climbing = slope < -0.15; hz.flapPh += dt / 70 * (hz.climbing ? 1.9 : 1);
    hz.talon = (hz.talon || 0) + ((slope > 0.2 ? 1 : 0) - (hz.talon || 0)) * Math.min(1, dt / 110);   // talons out while it dives
  }
  else v *= 0.4 + 0.6 * clamp(Math.abs(hz.x - hz.turnX) / (W * 0.25), 0, 1);
  if (hz.hoverLeft > 0 && hz.dist >= hz.hoverDist) {                 // the boomerang hangs in mid-air, spinning and wobbling
    hz.hoverLeft -= dt; hz.hoverT = (hz.hoverT || 0) + dt;
    const p = pathPoint(hz, hz.dist);
    hz.x = p.x + Math.sin(hz.hoverT / 260) * charH * 0.03; hz.y = p.y + Math.sin(hz.hoverT / 380) * charH * 0.04;
    hz.vx = 0; hz.vy = 0; hz.spin += hz.dir * dt * 0.0075; return;
  }
  hz.dist = Math.min(hz.pathLen, hz.dist + v * dt);
  const p = pathPoint(hz, hz.dist);
  hz.x = p.x; hz.y = p.y; hz.vx = (p.x - prev.x) / (dt || 1); hz.vy = (p.y - prev.y) / (dt || 1);
  if (hz.kind === 'eagle') {                                         // bank along the path, facing the way it flies
    const a = Math.atan2(p.ty, p.tx);
    if (p.tx >= 0) { hz.dir = 1; hz.spin = a * 0.8; }
    else { hz.dir = -1; let b = a - Math.PI; if (b < -Math.PI) b += 2 * Math.PI; hz.spin = b * 0.8; }
  } else hz.spin += hz.dir * dt * 0.0075;                             // the boomerang spins flat, about 1.2 turns a second
}

function setMissileHeight(hz, hl) {
  if (hl === 'H') { hz.lane = 'air'; hz.y = groundY - charH * 0.95; }      // head height: duck
  else { hz.lane = 'ground'; hz.y = groundY - hz.h / 2 - charH * 0.03; }   // skimming the ground: jump
}

// Where a falling object lands: 40% of the time aimed at the player, otherwise 1 to 3 character widths
// clear of them to the left or right. (Timed combos are always aimed.)
function skyTarget(w, aimed) {
  const s = charH, bodyHalf = s * 0.15, width = s * 0.3;
  if (aimed || Math.random() < 0.4) return clamp(charX + (Math.random() - 0.5) * 0.25 * s, w / 2, W - w / 2);
  let side = Math.random() < 0.5 ? -1 : 1;
  const off = w / 2 + bodyHalf + (1 + Math.random() * 2) * width;
  if (charX + side * off < w / 2 || charX + side * off > W - w / 2) side = -side;   // no room that side: use the other
  return clamp(charX + side * off, w / 2, W - w / 2);
}
const ELE_FOOT = 0.327;                                        // the elephant's feet, below its middle (drawing units)
const POGO_RISE = 1.25, POGO_FOOT = 0.35 * 1.6;                  // hop height (character heights, feet); centre to rubber foot                       // the pogo kid's hops: share of the ground height; centre to rubber foot
const FALL_V0 = 0.25 / 1000;                                   // starting fall speed, character heights per ms
const fallGravity = (kind, now) => 0.9 * charH / 1e6 * (HAZARDS[kind].speed * speedUp(now)) ** 2 * (HAZARDS[kind].gMul || 1);   // px per ms²

// Something along the ground (or at head height) plus something from the sky, timed so both reach the
// player at about the same moment: they have to step aside and jump (or duck) together.
function spawnCombo(now) {
  const open = unlocked(elapsed(now)), pick = a => a[Math.floor(Math.random() * a.length)];
  const sides = open.filter(k => ['tire', 'pig', 'car', 'tomahawk', 'arrow', 'missile'].includes(k)), kinds = open.filter(k => ['anvil', 'weight', 'bomb'].includes(k));
  if (!sides.length || !kinds.length) return false;                   // only things already met
  const sk = pick(sides), side = spawn(LANE_OF(sk), now, sk);
  const arriveMs = Math.abs(side.x - charX) / Math.abs(side.vx);
  const kind = pick(kinds);
  const D = groundY - charH * 0.5 + sizeOf(kind).h * charH, v0 = (HAZARDS[kind].fallV0 ? HAZARDS[kind].fallV0 / 1000 : FALL_V0) * charH, g = fallGravity(kind, now);
  const fallMs = (-v0 + Math.sqrt(v0 * v0 + 2 * g * D)) / g;    // time to fall to body height under gravity
  G.pending.push({ at: now + Math.max(0, arriveMs - fallMs + (Math.random() - 0.5) * 600), lane: 'sky', kind, aimed: true });
  return true;
}
function silence(hz) { if (hz.voice) { hz.voice.stop(); hz.voice = null; } }
function silenceAll() { G.hazards.forEach(silence); }

// The order things first appear in: something new every 15 seconds. Cars and arrows, the hardest to dodge,
// not before 3 minutes.
const UNLOCK = [['tire', 0], ['pig', 15], ['anvil', 30], ['weight', 45], ['tomahawk', 60], ['boomerang', 75], ['bomb', 90], ['eagle', 105],
  ['missile', 120], ['frog', 135], ['plane', 150], ['elephant', 165], ['car', 180], ['arrow', 195], ['ufo', 210]];
const LANE_OF = kind => kind === 'car' ? 'ground' : HAZARDS[kind].lane;
const unlocked = t => UNLOCK.filter(([, at]) => t >= at).map(([k]) => k);
const TEACH = { tire:['Jump!', 'Jump over the tire as it reaches you'], pig:['Pigs!', 'Jump over them'], anvil:['Anvils!', 'Step aside from where it will land'],
  weight:['50 tons!', 'Step well clear of it'], tomahawk:['Tomahawk!', 'Duck under it'], boomerang:['Boomerang!', 'Duck... and watch how it comes back'],
  bomb:['Bombs!', 'Get well away from where it lands'], eagle:['Eagle!', 'Duck under its talons, jump when it skims low'], missile:['Missile!', 'Duck if it comes high, jump if it comes low'],
  car:['Cars!', 'Listen for the engine, then jump'], arrow:['Arrows!', 'Listen for the twang, then duck'], frog:['Frog!', 'Watch its hops and step aside from where it will land'],
  plane:['Plane!', 'Get clear of where it will crash'], elephant:['Elephant!', 'Get down flat when it charges (carefully!)'], ufo:['UFO!', 'When it settles over you and glows brightest, step aside'] };
function nextKind() {
  const t = elapsed(performance.now()), open = unlocked(t), ufos = G.hazards.filter(h => h.lane === 'ufo').length;
  const allowed = open.filter(k => !(k === 'ufo' && ufos >= (t > 360 ? 2 : 1)) && !(k === 'frog' && G.hazards.some(h => h.lane === 'bounce')) && !(k === 'elephant' && G.hazards.some(h => h.lane === 'charge')));
  const newest = open[open.length - 1];                              // the newest arrival comes up more often, so the player meets it
  const weights = allowed.map(k => k === newest ? 3 : (k === 'ufo' || k === 'elephant' || k === 'frog') ? 0.6 : 1);
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < allowed.length; i++) { r -= weights[i]; if (r <= 0) return allowed[i]; }
  return allowed[0];
}
function nextLane() { return LANE_OF(nextKind()); }
const TEACH_TEXT = { charge:['Elephant!', 'Get down flat when it charges (carefully!)'], bounce:['Pogo kid!', 'Watch his hops and step aside from where he will land'], ufo:['UFO!', 'Listen: when the charging sound peaks, it fires where its beam is pointing'],
  villain:['Punch him!', 'Throw a punch towards him. Three punches knock him out'],
   sky:['Step aside!', 'Move left or right out of the shadow'], ground:['Jump!', 'Jump over it when it reaches you'], air:['Duck!', 'Crouch down so it flies over your head'] };

function hurt(now, hz) {
  if (now < G.safeUntil || G.state !== 'play') return;
  G.lives--; renderHearts(); G.safeUntil = now + SAFE_MS; G.shake = 12; G.hurtAt = now;
  if (hz.kind === 'anvil') {                                            // squashed flat like an accordion, then he pops back up
    G.squish = { at: now, x: charX }; hz.done = true; G.effects.push({ type:'anvilsit', born: now, dur: 1000 });
    noise(0.18, 0.5, 260); tone(700, 0.45, 'sawtooth', 0.07, 0.05, 160); tone(180, 0.35, 'sine', 0.25, 0.95, 620);   // crunch, wheeze... boing!
  } else G.knock = { at: now, side: Math.sign(charX - (hz.x ?? charX)) || 1 };   // knocked off his feet, away from what hit him
  G.nextHealth = Math.max(G.nextHealth || 0, now + 5000 + Math.random() * 20000);
  if (hz.kind === 'poop') { hz.done = true; G.headSplat = now + 4000; }   // splat! on his head
  else if (['sky', 'ground', 'air', 'bounce'].includes(hz.lane)) { hz.hit = true; hz.vy = -0.0008 * charH * 1000 / 1000 * 0.9; hz.vx = -hz.vx * 0.4; hz.flying = true; }
  // The first two injuries get a short groan; the third and final one gets the full scream.
  sfx.ouch(); if (audio()) { if (G.lives > 0) groan(actx, G.lives === LIVES - 1 ? 1 : 2); else scream(actx); }
  G.effects.push({ type:'text', text:'OUCH!', x: charX, y: groundY - charH * 1.05, born: now, color:'#ff5d5d' });
  if (G.lives <= 0) { G.state = 'ending'; G.overAt = now + 1300; sfx.over(); setBanner('Game over'); }
}

function dodged(now, hz) {
  G.score++; $('scoreNum').textContent = G.score; sfx.point();
}

// UFO: bobs across the sky. Each shot: while it charges (always exactly 4 seconds, with a slowly rising
// whine, so players can learn the timing), its thin targeting beam sweeps back and forth over the ground around the player. When the charge
// is complete the laser fires wherever the beam is pointing at that instant, through to the ground.
// Players beat it by listening to the charge-up and being out from under the sweep when it peaks.
const UFO_CHARGE_MS = 4000, UFO_LOCK_MS = 500;     // it holds still over the player for at least half a second before firing
const BEAM_W = 0.075;                               // laser width: a quarter of the man's width (character heights)
function sweepPoint(hz, now) {
  const c = hz.charge, t = (now - c.at) / 1000;
  c.centre += (charX - c.centre) * 0.02;                                 // the sweep drifts to follow the player
  return { x: clamp(c.centre + Math.sin(t * c.speed + c.phase) * charH * 1.3, 0, W), y: groundY };
}
function updateUfo(hz, now, circles, dt) {
  hz.y = hz.baseY + Math.sin((now - hz.born) / 700) * charH * 0.15;
  hz.lightPh = (hz.lightPh || 0) + dt * (1 + 6 * (hz.chargeP || 0)) / 450;   // its lights spin faster as it charges
  const onScreen = hz.x > W * 0.08 && hz.x < W * 0.92;
  if (!hz.charge && hz.shots < hz.maxShots && onScreen && now >= hz.nextShot && G.lastSk) {
    hz.charge = { at: now }; hz.nextBeep = 0;
    if (audio()) laserCharge(actx, UFO_CHARGE_MS / 1000);
  }
  if (!hz.charge) return finishUfo(hz);
  const C = hz.charge, age = now - C.at;
  hz.chargeP = Math.min(1, age / UFO_CHARGE_MS);
  if (!C.lockAt) {
    // It homes in on the player like a hunter correcting its aim: overshoots, swings back, settles.
    const k = 7, damp = 2.4, ax = k * (charX - hz.x) - damp * hz.vx * 1000;   // px/s²
    hz.vx = clamp(hz.vx + ax * dt / 1e6, -charH * 3 / 1000, charH * 3 / 1000);
    if (age >= UFO_CHARGE_MS - UFO_LOCK_MS && Math.abs(hz.x - charX) < charH * 0.12) { C.lockAt = now; hz.vx = 0; }   // over the player: hold still
    else if (age >= UFO_CHARGE_MS && now >= hz.nextBeep) { hz.nextBeep = now + 260; tone(1500, 0.06, 'square', 0.06); }   // fully charged, still hunting
  } else {
    hz.vx = 0;
    if (now - C.lockAt >= UFO_LOCK_MS && age >= UFO_CHARGE_MS) {
      // FIRE: a beam straight down. Anyone under it is hit.
      const bx = hz.x, by = hz.y + hz.h * 0.3, half = charH * BEAM_W / 2;
      if (audio()) laserShot(actx);
      G.effects.push({ type:'beam', x: bx, y1: by, y2: groundY, born: now, dur: 550 });
      G.effects.push({ type:'hole', x: bx, y: groundY, born: now + 120, dur: 5000 });
      if (circles.some(cr => Math.abs(cr.x - bx) < half + cr.r && cr.y > by)) hurt(now, hz); else dodged(now, hz);
      hz.charge = null; hz.chargeP = 0; hz.shots++; hz.nextShot = now + 1200 + Math.random() * 1000;
      hz.vx = hz.dir * hz.cruise * (hz.shots >= hz.maxShots ? 4 : 1);   // drifts on; after its last shot it speeds away
    }
  }
  finishUfo(hz);
}
function finishUfo(hz) { if ((hz.x - hz.w > W && hz.vx > 0) || (hz.x + hz.w < 0 && hz.vx < 0)) hz.done = true; }
function distToSegment(p, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, t = clamp(((p.x - x1) * dx + (p.y - y1) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(p.x - (x1 + t * dx), p.y - (y1 + t * dy));
}
// While a UFO charges: a glowing ball builds up under it, and its thin targeting beam sweeps the ground.
function drawLockOn() {}   // (the glow is drawn on the UFO itself; there is no targeting beam any more)
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
    if (hz.path && !hz.flying) followPath(hz, dt);
    else {
      if (hz.g && !hz.flying) hz.vy += hz.g * dt;
      hz.x += hz.vx * dt; hz.y += hz.vy * dt;
    }
    if (hz.carrying || hz.released) {                                  // an eagle flying off (with the man, or having dropped him)
      hz.x += hz.vx * dt; hz.y += hz.vy * dt; hz.flapPh = (hz.flapPh || 0) + dt / 40;
      if (hz.voice) { try { hz.voice.update(0.6, (hz.x - charX) / (W * 0.5), 0, hz, now); } catch (e) { silence(hz); } }
      if (hz.x < -hz.w * 2 || hz.x > W + hz.w * 2 || hz.y < -hz.h * 3) hz.done = true;
      continue;
    }
    if (hz.lane === 'pack') {                                          // a pack: catch it before it reaches the ground
      hz.x += Math.sin((now - hz.born) / 700 + hz.sway) * charH * 0.0002 * dt;
      if (G.state === 'play' && circles.some(cr => Math.hypot(cr.x - hz.x, cr.y - (hz.y + hz.h * 0.25)) < cr.r + charH * 0.23)) { collectPack(hz, now); continue; }
      if (hz.y + hz.h / 2 >= groundY) { hz.done = true; G.effects.push({ type:'fizzle', x: hz.x, y: groundY - charH * 0.03, born: now, dur: 700, health: hz.kind === 'health' }); }
      continue;
    }
    if (HAZARDS[hz.kind].spins) hz.spin += hz.dir * dt * 0.005;      // a tomahawk turns end over end, slowly enough to see
    if (hz.spinV && !hz.flying) hz.spin += hz.spinV * dt;              // the elephant rolls as it falls
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
    if (!hz.hit && circles.some(cr => circleHitsBox(cr, hz))) {
      if (hz.kind === 'eagle' && hz.talon > 0.5 && !G.carry && !G.knock && now >= G.safeUntil && G.state === 'play') startCarry(hz, now);   // its talons have him!
      else if (hz.lane === 'charge') { if (now >= G.safeUntil && G.state === 'play') { hz.hit = true; hurt(now, hz); } }
      else hurt(now, hz);
      if (hz.lane !== 'charge') continue;
    }
    const d = HAZARDS[hz.kind];
    if (circles.length && onCourse(hz, circles, now)) G.dangerUntil = now + 200;
    if (hz.kind === 'eagle') maybePoop(hz, now);
    if (hz.path) {
      if (d.returns) {                                                 // a point each time it passes the player
        const side = Math.sign(hz.x - charX);
        if (side && side !== hz.passSide) { hz.passSide = side; hz.passes++; dodged(now, hz); }
      }
      if (hz.dist >= hz.pathLen) { hz.done = true; if (!d.returns || !hz.passes) dodged(now, hz); }
      continue;
    }
    if (hz.lane === 'ufo') { updateUfo(hz, now, circles, dt); continue; }
    if (hz.lane === 'charge') { updateElephant(hz, now, dt); continue; }
    if (hz.kind === 'frog') updateFrog(hz, now);
    if (hz.kind === 'pogo') {
      const foot = hz.y + POGO_FOOT * charH;
      hz.comp = clamp(1 - (groundY - foot) / (charH * 0.06), 0, 1);       // the spring squashes as it touches down
      if (foot >= groundY && hz.vy > 0) {
        hz.y = groundY - POGO_FOOT * charH; hz.vy = -hz.hopV;
        if (hz.voice && hz.voice.play) { try { hz.voice.play('boing'); } catch (e) {} }
        G.effects.push({ type:'dust', x: hz.x, y: groundY, born: now, w: charH * 0.25, dur: 600 });
      }
    }
    if (d.arc && hz.vy > 0 && hz.y >= groundY - hz.h * 0.4) {          // the tomahawk lands, blade first, and sticks
      hz.done = true; dodged(now, hz); sfx.thud(); tone(180, 0.12, 'square', 0.12);
      G.effects.push({ type:'landed', hz:{ ...hz, done:false, flying:false, y: groundY - charH * 0.14, spin: hz.dir * 2.3 }, born: now, dur: 1400 });
      continue;
    }
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
        G.effects.push({ type:'boom', x: hz.x, y: groundY, r: r * 0.9, born: now, dur: 1600 });
        if (blast(hz.x, r)) { hurt(now, hz); continue; }
      } else if (d.dives) {
        // The plane crashes nose first: a fireball, then a burning hunk of molten metal.
        const x = hz.x + hz.dir * Math.cos(hz.angle) * hz.w * 0.4, r = charH * 0.45;
        sfx.boom(); if (audio()) fire(actx); G.shake = 16;
        G.effects.push({ type:'boom', x, y: groundY, r, born: now, dur: 1600 });
        G.effects.push({ type:'wreck', x, y: groundY, dir: hz.dir, born: now, dur: 4200 });
        if (blast(x, r)) { hurt(now, hz); continue; }
      } else if (d.splat) {
        if (audio()) splat(actx);
        G.effects.push({ type:'splat', x: hz.x, y: groundY + 2, born: now, dur: 3000 });
      } else {
        const near = clamp(1 - Math.abs(hz.x - charX) / (W * 0.6), 0, 1);
        if (hz.kind === 'weight') {
          // 50 tons hitting the ground: the closer to the player, the louder the thud and the harder the earth shakes
          if (audio()) bigThud(actx, 0.25 + 0.75 * near);
          G.shake = 6 + 26 * near; G.quake = { at: now, len: 300 + 900 * near, amp: 4 + 14 * near }; if (near > 0.5) G.stagger = { at: now, amp: near };
        } else { sfx.thud(); G.shake = 8; }
        G.effects.push({ type:'dust', x: hz.x, y: groundY, born: now, w: hz.w * (hz.kind === 'weight' ? 1 + near : 1), dur: 1400 });
        G.effects.push({ type:'landed', hz:{ ...hz, done:false, flying:false, y: groundY - hz.h / 2, spin: 0, spinV: 0 }, born: now, dur: 700 });
      }
      dodged(now, hz);
    } else if (hz.lane !== 'sky' && ((hz.dir > 0 && hz.x - hz.w / 2 > W) || (hz.dir < 0 && hz.x + hz.w / 2 < 0))) {
      dodged(now, hz);
      if (d.twoPass && !hz.secondPass && hz.plan.length > 1) {
        // The missile turns round off screen and comes back, high or low.
        hz.secondPass = true; hz.dir = -hz.dir; hz.vx = -hz.vx * 1.1; setMissileHeight(hz, hz.plan[1]);
        hz.x -= hz.dir * Math.abs(hz.vx) * 700;                          // a moment's pause before it returns
      } else hz.done = true;
    }
  }
  // walking into the burning wreck of a crashed plane hurts, while the flames are up
  for (const e of G.effects) {
    if (e.type !== 'wreck' || !circles.length) continue;
    const age = now - e.born; if (age < 150 || age > 3600) continue;
    const k = age < 2800 ? 1 : clamp((3600 - age) / 800, 0, 1), sx = charH * HAZARDS.plane.scale, half = sx * 0.22 * k, top = groundY - sx * 0.32 * k;
    if (circles.some(cr => Math.abs(cr.x - e.x) < half + cr.r * 0.5 && cr.y + cr.r > top)) hurt(now, { lane:'fire', x: e.x });
  }
  G.hazards.forEach(hz => { if (hz.done) silence(hz); });
  G.hazards = G.hazards.filter(hz => !hz.done);
}

// Some eagles let go a dropping while still well above head height, aimed roughly where the player is. It
// keeps only a little of the eagle's speed, so the eagle swoops past first and the dropping lands later. Fair: it
// never lands within 3/4 of a second of the eagle itself reaching the player, so there's time to do both.
function maybePoop(hz, now) {
  if (!hz.willPoop || hz.pooped || hz.flying || hz.hit) return;
  if (hz.y > groundY - charH * 1.5) return;                          // only from well above head height
  const g = fallGravity('poop', now), vx = hz.vx * 0.3, D = groundY - hz.y;
  const tL = Math.sqrt(2 * D / g), lx = hz.x + vx * tL;
  if (Math.abs(lx - charX) > charH * 0.12) return;
  let tE = Infinity, t = 0;                                           // when the eagle itself reaches the player: follow its
  for (let i = hz.seg + 1; i < hz.path.length; i++) {                 // flight path at the speed it will fly each stretch
    const A = hz.path[i - 1], B = hz.path[i], len = B.d - A.d, slope = (B.y - A.y) / (len || 1);
    t += len / (hz.speed * (slope > 0 ? 1 + 0.8 * slope : 1 + 0.3 * slope));
    if (Math.abs(B.x - charX) < charH * 0.3 && B.y > groundY - charH * 1.4) { tE = t; break; }
  }
  if (Math.abs(tL - tE) < 850) return;
  hz.pooped = true;
  const p = spawn('sky', now, 'poop');
  p.x = hz.x; p.y = hz.y + hz.h * 0.2; p.vx = vx; p.vy = 0; p.g = g;
}

// The charging elephant: runs in (thudding footsteps, dust), skids to a stop short of the player, rears up and
// trumpets for 2 seconds, drops back down with a crash, then charges straight across and off the far side.
function updateElephant(hz, now, dt) {
  const age = now - hz.stateAt;
  const step = ms => {
    if (now < hz.nextStep) return;
    hz.nextStep = now + ms; G.shake = Math.max(G.shake, ms < 250 ? 6 : 4);
    if (hz.voice && hz.voice.play) { try { hz.voice.play('stomp'); } catch (e) {} }
    G.effects.push({ type:'dust', x: hz.x - hz.dir * hz.w * 0.3, y: groundY, born: now, w: charH * 0.5, dur: ms < 250 ? 1800 : 1000 });
  };
  if (hz.state === 'run') {
    step(330);
    if ((hz.dir > 0 && hz.x >= hz.stopX) || (hz.dir < 0 && hz.x <= hz.stopX)) { hz.state = 'skid'; hz.stateAt = now; G.effects.push({ type:'dust', x: hz.x + hz.dir * hz.w * 0.2, y: groundY, born: now, w: charH * 0.9, dur: 1200 }); }
  } else if (hz.state === 'skid') {
    hz.vx *= Math.max(0, 1 - dt / 200);
    if (age > 350) { hz.vx = 0; hz.state = 'rear'; hz.stateAt = now; if (hz.voice && hz.voice.play) { try { hz.voice.play('trumpet'); } catch (e) {} } }
  } else if (hz.state === 'rear') {
    hz.rear = Math.min(1, age / 400);
    if (age > 2000) { hz.state = 'drop'; hz.stateAt = now; }
  } else if (hz.state === 'drop') {
    hz.rear = Math.max(0, 1 - age / 250);
    if (age > 250) {
      hz.rear = 0; hz.state = 'charge'; hz.stateAt = now; hz.vx = hz.dir * charH * 4.2 * speedUp(now) / 1000; G.shake = 14; hz.nextStep = 0;
      G.effects.push({ type:'dust', x: hz.x, y: groundY, born: now, w: charH * 1.1, dur: 1500 });
    }
  } else if (hz.state === 'charge') {
    step(190);
    const over = G.flat && Math.abs(hz.x - charX) < hz.w * 0.75;          // stepping high over a man lying flat
    hz.step = clamp((hz.step || 0) + (over ? 1 : -1) * dt / 150, 0, 1);
    if ((hz.dir > 0 && hz.x - hz.w / 2 > W) || (hz.dir < 0 && hz.x + hz.w / 2 < 0)) { hz.done = true; if (!hz.hit) dodged(now, { ...hz, x: clamp(hz.x, 40, W - 40) }); }
  }
}
// Spawn whatever the lane chooser picked. Later in the game cars and pigs come in lines of 2, 3 or 4, spaced
// so the player can land and jump again in between.
const GROUP_GAP = 1900;                                         // ms between one reaching the player and the next
function spawnLane(lane, now, kind = null) {
  const first = spawn(lane, now, kind);
  if (lane !== 'ground' || !first || !(HAZARDS[first.kind].vehicle || first.kind === 'pig')) return;
  const t = elapsed(now), most = t < 60 ? 1 : t < 120 ? 2 : t < 180 ? 3 : 4, n = window.__dgGroup || 1 + Math.floor(Math.random() * most);
  const arrive = hz => Math.abs(hz.x - charX) / Math.abs(hz.vx), a1 = arrive(first);
  for (let i = 1; i < n; i++) {
    const f = spawn('ground', now, first.kind === 'pig' ? 'pig' : 'car', false, first.dir);
    const extra = a1 + i * GROUP_GAP - arrive(f);
    if (extra > 0) f.x -= f.dir * extra * Math.abs(f.vx);                 // start further back, so it arrives in turn
  }
}
// The eagle's talons catch the man: it carries him up into the sky, then drops him.
function startCarry(hz, now) {
  G.carry = { hz, at: now, phase: 'up', vy: 0 };
  hz.carrying = true; hz.hit = true; hz.talon = 1; G.safeUntil = Infinity;
  hz.vx = hz.dir * charH * 1.1 / 1000; hz.vy = -charH * 1.2 / 1000; hz.spin = Math.atan2(hz.vy, Math.abs(hz.vx)) * hz.dir * 0.6;
  if (hz.voice && hz.voice.play) { try { hz.voice.play('screech'); } catch (e) {} }
}
function updateCarry(now, dt) {
  const C = G.carry, e = C.hz, se = charH * HAZARDS.eagle.scale;
  if (C.phase === 'up') {
    charX = clamp(e.x, W * 0.04, W * 0.96);
    motion.lift = Math.max(0, groundY - (e.y + 0.05 * se + charH * 0.93));   // hanging from its talons
    if (now - C.at > 1500) { C.phase = 'fall'; e.carrying = false; e.released = true; e.talon = 0; }
  } else {
    C.vy += 3.5 * charH / 1e6 * dt; motion.lift -= C.vy * dt;
    if (motion.lift <= 0) {
      motion.lift = 0; G.carry = null; G.safeUntil = 0; sfx.thud(); G.shake = 16;
      G.effects.push({ type:'dust', x: charX, y: groundY, born: now, w: charH * 0.5, dur: 1000 });
      hurt(now, { lane:'carry', x: charX - e.dir });
    }
  }
  G.dangerUntil = now + 200;
}
// Health and energy packs: rare. Health only after losing a life, at most every 90 s; energy about every 2 min.
const BOOST_MS = 20000;                                          // how long a super jump lasts
function packsTick(now) {
  if (elapsed(now) < 60 || G.hazards.some(h => h.lane === 'pack') || window.__dgNoAuto) return;
  if (G.lives < LIVES && now >= G.nextHealth) { spawn('pack', now, 'health'); G.nextHealth = now + 90000; }
  else if (now >= G.nextEnergy) { spawn('pack', now, 'energy'); G.nextEnergy = now + 100000 + Math.random() * 40000; }
}
function collectPack(hz, now) {
  hz.done = true;
  if (hz.kind === 'health') { if (G.lives < LIVES) { G.lives++; renderHearts(); } G.effects.push({ type:'text', text:'+1 ♥', x: hz.x, y: hz.y, born: now, color:'#ff6b6b' }); }
  else { G.boostUntil = now + BOOST_MS; G.effects.push({ type:'text', text:'⚡ Super jump!', x: clamp(hz.x, 90, W - 90), y: hz.y, born: now, color:'#ffd43b' }); }
  tone(880, 0.12, 'sine', 0.2); tone(1320, 0.14, 'sine', 0.2, 0.09); tone(1760, 0.2, 'sine', 0.18, 0.18);
}
// How the man's whole body is moved for drawing and for hits alike: knocked down or lying flat (turned onto
// the ground), somersaulting in a super jump, or squashed by an anvil. A list of canvas-style operations.
function squishAmount(now) {
  if (!G.squish) return 0;
  const t = now - G.squish.at;
  if (t < 120) return t / 120;                                           // crushed...
  if (t < 900) return 1;
  const p = Math.min(1, (t - 900) / 450); return (1 - p) - 0.35 * Math.sin(p * Math.PI * 2) * (1 - p);   // ...then springs back (wobbling)
}
function manOps(k, now) {
  const ops = [];
  if (G.lay > 0.01) { const px = k.hip.x, py = groundY; ops.push(['t', px, py - charH * 0.07 * Math.sin(G.lay)], ['r', G.lay * G.laySide], ['t', -px, -py]); }
  if (motion.flip > 0) {                                                 // a front flip, towards the camera: seen end-on, the body
    const cs = flipCos(), cx = k.hip.x, cy = groundY - motion.lift - charH * 0.45;   // shortens, turns upside down (back to us), comes round
    ops.push(['t', cx, cy], ['s', 1, Math.abs(cs) < 0.1 ? (cs < 0 ? -0.1 : 0.1) : cs], ['t', -cx, -cy]);
  }
  const sq = squishAmount(now);
  if (sq) { const px = k.hip.x; ops.push(['t', px, groundY], ['s', 1 + 0.3 * sq, 1 - 0.65 * sq], ['t', -px, -groundY]); }
  return ops;
}
function flipCos() { const f = motion.flip, e = f < 0.5 ? 2 * f * f : 1 - 2 * (1 - f) * (1 - f); return Math.cos(e * Math.PI * 2); }
let BACK_VIEW = false;                                                     // drawing him from behind (mid-somersault)
function applyOps(c, ops) { for (const [o, a, b] of ops) { if (o === 't') c.translate(a, b); else if (o === 'r') c.rotate(a); else c.scale(a, b); } }
function txK(k, ops) {
  if (!ops.length) return k;
  const map = p => { let x = p.x, y = p.y; for (let i = ops.length - 1; i >= 0; i--) { const [o, a, b] = ops[i];
    if (o === 't') { x += a; y += b; } else if (o === 'r') { const cs = Math.cos(a), sn = Math.sin(a); [x, y] = [x * cs - y * sn, x * sn + y * cs]; } else { x *= a; y *= b; } } return { x, y }; };
  const out = {}, sq = squishAmount(performance.now());
  for (const [key, p] of Object.entries(k)) {
    if (!p || typeof p !== 'object' || p.x === undefined) { out[key] = p; continue; }
    out[key] = { ...p, ...map(p) };
    if (key === 'head') out[key].r = p.r * (1 - 0.5 * sq);
  }
  return out;
}
// The frog: hops in bursts of 1 to 3 (each a different length and height), then sits for 1 to 4 seconds, croaking
// and flicking its tongue, then hops on. It never sets off from right beside the player in the way it is going, and
// when the man is in its path it sometimes leapfrogs clean over him.
const FROG_G = 9;                                                        // its gravity, character heights per second²
function updateFrog(hz, now) {
  const foot = hz.y + hz.h / 2;
  if (hz.state === 'hop') {
    hz.air = clamp((groundY - foot) / (charH * 0.25), 0, 1);
    if (foot >= groundY && hz.vy > 0) {                                   // lands
      hz.y = groundY - hz.h / 2; hz.vx = 0; hz.vy = 0; hz.g = 0; hz.air = 0; hz.state = 'sit'; hz.landAt = now;
      if (hz.voice && hz.voice.play) { try { hz.voice.play('frogThump'); } catch (e) {} }
      G.effects.push({ type:'dust', x: hz.x, y: groundY, born: now, w: charH * 0.4, dur: 700 });
      if (--hz.hopsLeft > 0) hz.sitUntil = now + 200 + Math.random() * 150;   // a quick crouch, then the next hop
      else {
        const sit = 1000 + Math.random() * 3000; hz.sitUntil = now + sit; hz.hopsLeft = 1 + Math.floor(Math.random() * 3);
        hz.tongues = [now + 300 + Math.random() * 400]; if (sit > 2200) hz.tongues.push(now + 1400 + Math.random() * (sit - 1800));
        hz.croakAt = now + 150 + Math.random() * 300; hz.croaked = false;
      }
    }
    return;
  }
  // sitting: croak (throat puffing), flick the tongue
  if (hz.croakAt && !hz.croaked && now >= hz.croakAt) { hz.croaked = true; if (hz.voice && hz.voice.play) { try { hz.voice.play('croak'); } catch (e) {} } }
  hz.puff = hz.croakAt && now >= hz.croakAt && now < hz.croakAt + 600 ? Math.sin((now - hz.croakAt) / 600 * Math.PI) : 0;
  hz.tongue = -1; for (const tf of hz.tongues) if (now >= tf && now < tf + 330) hz.tongue = (now - tf) / 330;
  if (now < hz.sitUntil) return;
  const ahead = (charX - hz.x) * hz.dir;
  if (ahead > 0 && ahead < charH * 0.9 && now < hz.sitUntil + 3000) return;   // the player is right in front: give them a moment
  let A = charH * (1.15 + Math.random() * 0.4), L = charH * (0.8 + Math.random() * 1.0);   // height (clears the man's head mid-hop), length
  if (ahead >= charH * 0.9 && ahead <= charH * 1.6 && Math.random() < 0.5) { L = 2 * ahead; A = charH * 1.4; }   // sometimes it leapfrogs right over the man
  const g = FROG_G * charH / 1e6;
  const T = 2 * Math.sqrt(2 * A / g);
  hz.state = 'hop'; hz.g = g; hz.vy = -Math.sqrt(2 * g * A); hz.vx = hz.dir * L / T; hz.tongue = -1; hz.puff = 0;
}

// The man knocked down or lying flat: his whole body turned onto the ground (used for hits and drawing alike).
function layK(k) {
  if (!k || G.lay < 0.01) return k;
  const a = G.lay * G.laySide, cs = Math.cos(a), sn = Math.sin(a), px = k.hip.x, py = groundY, off = charH * 0.07 * Math.sin(G.lay);
  const out = {};
  for (const [key, p] of Object.entries(k)) {
    if (!p || typeof p !== 'object' || p.x === undefined) { out[key] = p; continue; }
    const dx = p.x - px, dy = p.y - py;
    out[key] = { ...p, x: px + dx * cs - dy * sn, y: py + dx * sn + dy * cs - off };
    if (key === 'head') out[key].tilt = (p.tilt || 0) + a;
  }
  return out;
}

// Is this thing on course to hit the player within about a second? (Then the man looks alarmed.)
function onCourse(hz, circles, now) {
  if (hz.flying || hz.hit || hz.lane === 'pack') return false;
  if (hz.lane === 'charge') return hz.state !== 'run' && hz.state !== 'skid' && !G.flat;
  if (hz.lane === 'ufo') return !!hz.charge && now - hz.charge.at > UFO_CHARGE_MS - 1000;
  const d = HAZARDS[hz.kind];
  for (const t of [150, 350, 550, 750, 950]) {
    const g = hz.path ? 0 : (hz.g || 0);
    const p = { ...hz, x: hz.x + hz.vx * t, y: hz.y + hz.vy * t + 0.5 * g * t * t };
    if (hz.lane === 'sky' && p.y + hz.h / 2 >= groundY) {             // it will land: does it land on (or blast) the player?
      const r = d.explodes ? hz.w * 1.5 : hz.w / 2 + charH * 0.1;
      return Math.abs(hz.x - charX) < r;
    }
    if (circles.some(cr => circleHitsBox(cr, p))) return true;
  }
  return false;
}

// No warning shadows: players judge from the flight of each thing where it will come down.
function drawShadows(c, now) {
  // where a UFO laser hit: a scorched hole with a glowing rim that cools, smoke curling up (just for show)
  for (const e of G.effects) {
    if (e.type !== 'hole' || now < e.born) continue;
    const age = now - e.born, fade = clamp((e.dur - age) / 1000, 0, 1), heat = clamp(1 - age / 2500, 0, 1), r = charH * 0.14;
    c.save(); c.globalAlpha = fade;
    const g = c.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
    g.addColorStop(0, '#0b0806'); g.addColorStop(0.6, '#2a1d12'); g.addColorStop(0.85, `rgba(${Math.round(120 + 135 * heat)},${Math.round(50 + 70 * heat)},20,0.9)`); g.addColorStop(1, 'rgba(60,40,20,0)');
    c.fillStyle = g; c.beginPath(); c.ellipse(e.x, e.y + 2, r, r * 0.3, 0, 0, 7); c.fill();
    for (let i = 0; i < 5; i++) {
      const t = (age / 1800 + i / 5) % 1, px = e.x + Math.sin(i * 2 + age / 500) * r * 0.4 + t * r * 0.6, py = e.y - t * charH * 0.6, rr = r * (0.25 + t * 0.6);
      const sg = c.createRadialGradient(px, py, 0, px, py, rr); sg.addColorStop(0, `rgba(110,110,110,${0.35 * (1 - t)})`); sg.addColorStop(1, 'rgba(110,110,110,0)');
      c.fillStyle = sg; c.beginPath(); c.arc(px, py, rr, 0, 7); c.fill();
    }
    c.restore();
  }
}

function drawEffects(c, now) {
  G.effects = G.effects.filter(e => now - e.born < (e.dur || 900));
  for (const e of G.effects) {
    const t = (now - e.born) / 900;
    if (now < e.born) continue;                                         // not started yet (e.g. the boom after a laser)
    if (e.type === 'beam') {                                            // the UFO's laser: a shifting, glowing light show
      const q = (now - e.born) / e.dur, a = q < 0.15 ? q / 0.15 : 1 - (q - 0.15) / 0.85, w = charH * BEAM_W;
      const hue = (now / 3) % 360, pw = 1 + 0.25 * Math.sin(now / 25);
      c.save(); c.globalCompositeOperation = 'lighter';
      for (const [mul, dh, al] of [[6, 0, 0.16], [3.5, 70, 0.28], [2, 150, 0.5], [1.2, 230, 0.75]]) {
        c.strokeStyle = `hsla(${(hue + dh) % 360},100%,60%,${al * a})`; c.lineWidth = w * mul * pw;
        c.beginPath(); c.moveTo(e.x, e.y1); c.lineTo(e.x, e.y2); c.stroke();
      }
      c.strokeStyle = `rgba(255,255,255,${0.95 * a})`; c.lineWidth = w * 0.5; c.beginPath(); c.moveTo(e.x, e.y1); c.lineTo(e.x, e.y2); c.stroke();
      for (let i = 0; i < 28; i++) {                                     // sparkles spiralling down the beam
        const f = (i / 28 + now / 700) % 1, y = e.y1 + (e.y2 - e.y1) * f, x = e.x + Math.sin(f * 20 + now / 60 + i) * w * 1.8;
        c.fillStyle = `hsla(${(hue + i * 25) % 360},100%,75%,${a})`; c.beginPath(); c.arc(x, y, charH * 0.009, 0, 7); c.fill();
      }
      for (const [y, r] of [[e.y1, w * 3], [e.y2, w * 5]]) {             // dazzling flares at the UFO and where it hits
        const g = c.createRadialGradient(e.x, y, 0, e.x, y, r); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.4, `hsla(${hue},100%,70%,${0.6 * a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.beginPath(); c.arc(e.x, y, r, 0, 7); c.fill();
      }
      for (let i = 0; i < 16; i++) {                                     // coloured sparks spraying from the impact
        const ang = Math.PI * (1.05 + 0.9 * (i / 15)), d = charH * (0.05 + q * 0.4) * (0.6 + (i % 3) * 0.2);
        c.fillStyle = `hsla(${(hue + i * 30) % 360},100%,70%,${a})`; c.beginPath(); c.arc(e.x + Math.cos(ang) * d, e.y2 + Math.sin(ang) * d + q * q * charH * 0.2, charH * 0.011, 0, 7); c.fill();
      }
      c.restore(); continue;
    }
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
      const heat = c.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r);               // a flash of heat over the blast area
      heat.addColorStop(0, `rgba(255,220,150,${0.5 * (1 - q)})`); heat.addColorStop(0.7, `rgba(255,140,40,${0.3 * (1 - q)})`); heat.addColorStop(1, 'rgba(255,120,30,0)');
      c.fillStyle = heat; c.beginPath(); c.arc(e.x, e.y, e.r, Math.PI, 0); c.closePath(); c.fill();
      c.strokeStyle = `rgba(255,255,255,${0.5 * (1 - q)})`; c.lineWidth = 3 * (1 - q) + 1;             // the shock wave
      c.beginPath(); c.arc(e.x, e.y, e.r * ring, Math.PI, 0); c.stroke();
      const sc = c.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 0.6);                      // scorched ground
      sc.addColorStop(0, `rgba(30,22,15,${0.6 * (1 - q * 0.5)})`); sc.addColorStop(1, 'rgba(30,22,15,0)');
      c.fillStyle = sc; c.beginPath(); c.ellipse(e.x, e.y + 2, e.r * 0.6, charH * 0.03, 0, 0, 7); c.fill();
      c.restore(); continue;
    }
    if (e.type === 'wreck') { drawWreck(c, e.x, e.y, charH * HAZARDS.plane.scale, now - e.born, e.dir); continue; }
    if (e.type === 'text') {
      c.globalAlpha = 1 - t; c.fillStyle = e.color; c.strokeStyle = OUTLINE; c.lineWidth = 5; c.textAlign = 'center';
      c.font = `bold ${H * 0.06}px "Trebuchet MS", sans-serif`;
      c.strokeText(e.text, e.x, e.y - t * 40); c.fillText(e.text, e.x, e.y - t * 40); c.globalAlpha = 1;
    } else if (e.type === 'boom') {
      drawFireball(c, e, now);
    } else if (e.type === 'anvilsit') {                                  // the anvil resting on the flattened man
      if (!G.squish) continue;
      const t = now - e.born, sq = squishAmount(now), top = groundY - charH * 0.97 * (1 - 0.65 * sq), sz = sizeOf('anvil');
      c.globalAlpha = t < 900 ? 1 : clamp(1 - (t - 900) / 100, 0, 1);
      drawHazard(c, { kind:'anvil', x: G.squish.x, y: top - sz.h * charH / 2 + charH * 0.02, dir: 1, born: e.born, spin: 0 }, charH, now); c.globalAlpha = 1;
    } else if (e.type === 'fizzle') {                                     // a missed pack bursting on the ground
      const q = (now - e.born) / e.dur;
      c.save(); c.globalAlpha = 1 - q;
      for (let i = 0; i < 10; i++) { const a = Math.PI * (1 + i / 9), r = charH * (0.03 + q * 0.12);
        c.fillStyle = e.health ? (i % 2 ? '#ffffff' : '#e03131') : (i % 2 ? '#ffe066' : '#f59f00'); c.beginPath(); c.arc(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, charH * 0.012, 0, 7); c.fill(); }
      c.restore();
    } else if (e.type === 'splat') {
      drawSplat(c, e.x, e.y, charH, clamp((e.dur - (now - e.born)) / 800, 0, 1));
    } else if (e.type === 'dust') {
      drawDust(c, e, now);
    } else if (e.type === 'landed') {                                    // the object rests on the ground, then fades
      c.globalAlpha = clamp((e.dur - (now - e.born)) / 300, 0, 1); drawHazard(c, e.hz, charH, now); c.globalAlpha = 1;
    }
  }
}
// An explosion: a white-hot core and boiling orange fireball made of overlapping billows, flying sparks,
// then thick dark smoke rolling upwards and spreading as it fades.
function drawFireball(c, e, now) {
  const age = now - e.born, q = age / e.dur, R = e.r || charH * 0.4;
  let sd = Math.floor(e.born) % 9973 + 1; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  c.save();
  for (let i = 0; i < 9; i++) {                                                      // smoke, behind the fire
    const a = Math.PI * (1.05 + rnd() * 0.9), d = R * (0.2 + rnd() * 0.5), rise = R * (0.3 + rnd() * 0.9) * q;
    const x = e.x + Math.cos(a) * d * (0.6 + q), y = e.y + Math.sin(a) * d * 0.7 - rise - R * 0.15, r = R * (0.25 + rnd() * 0.2) * (0.6 + q * 1.4);
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    const al = 0.75 * Math.min(1, q * 3) * (1 - q);
    g.addColorStop(0, `rgba(95,90,88,${al})`); g.addColorStop(0.7, `rgba(45,42,42,${al * 0.9})`); g.addColorStop(1, 'rgba(40,38,38,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  }
  const fire = Math.max(0, 1 - q * 1.6);                                            // the fireball burns out quickly
  if (fire > 0) {
    for (let i = 0; i < 10; i++) {
      const a = Math.PI * (1 + rnd()), d = R * rnd() * 0.55 * (0.5 + q), x = e.x + Math.cos(a) * d, y = e.y + Math.sin(a) * d * 0.8 - R * 0.1;
      const r = R * (0.22 + rnd() * 0.2) * (0.7 + q);
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,250,220,${fire})`); g.addColorStop(0.3, `rgba(255,200,80,${fire})`); g.addColorStop(0.65, `rgba(240,110,20,${fire * 0.9})`); g.addColorStop(1, 'rgba(160,40,10,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    }
    c.strokeStyle = `rgba(255,210,120,${fire})`; c.lineWidth = 1.5;                  // sparks and burning bits
    for (let i = 0; i < 14; i++) {
      const a = Math.PI * (1.05 + rnd() * 0.9), sp = R * (0.6 + rnd() * 1.2) * q * 1.6, x = e.x + Math.cos(a) * sp, y = e.y + Math.sin(a) * sp + R * q * q * 0.8;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x - Math.cos(a) * R * 0.06, y - Math.sin(a) * R * 0.06); c.stroke();
    }
  }
  c.restore();
}
// Dust thrown up where something heavy lands: soft brown-grey billows rolling outwards along the ground.
function drawDust(c, e, now) {
  const q = (now - e.born) / e.dur;
  let sd = Math.floor(e.born) % 7919 + 3; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  for (let i = 0; i < 12; i++) {
    const side = i % 2 ? 1 : -1, spread = (e.w * 0.3 + e.w * 0.6 * rnd()) * (0.4 + q), x = e.x + side * spread, y = e.y - charH * (0.02 + rnd() * 0.05) * (0.5 + q * 1.5);
    const r = charH * (0.04 + rnd() * 0.05) * (0.7 + q * 1.3), al = 0.55 * (1 - q);
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, `rgba(222,208,186,${al})`); g.addColorStop(0.6, `rgba(170,150,125,${al * 0.8})`); g.addColorStop(1, 'rgba(150,130,110,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
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
      if (keyMode) G.phaseStart = Math.min(G.phaseStart, now - 2000);   // no need to calibrate: a short count
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
          setBanner(String(left), keyMode ? 'Arrows run, Space jumps, Down ducks' : 'Stand still with your arms down');
          if (left !== G.lastTick) { G.lastTick = left; sfx.tick(); }
        }
      }
    }
  }

  // Lying flat to dodge the elephant: the head dropped very low, or out of the bottom of the camera's view
  // while it was charging (then the game carries on rather than pausing).
  const charging = G.hazards.some(h => h.lane === 'charge');
  const lostFlat = lost && charging && motion.up < -0.12;
  if (G.knock && now - G.knock.at > 1600) G.knock = null;
  G.flat = (lostFlat || (!lost && motion.up < -0.5)) && !G.knock && !G.carry;
  let sk = null;
  if (G.state === 'ready') { charX = W / 2; motion.lift = 0; motion.duck = 0; motion.vx = 0; sk = buildBody(); }
  else if (G.state !== 'off' && lm) {
    if (G.squish && now - G.squish.at > 1400) G.squish = null;
    const held = G.knock || G.carry || G.squish;                                    // knocked down or carried off: the player's moves don't count
    if (!lost && !held) { updateMotion(now); if (keyMode) keyCharX(dt); else updateCharX(now); driftStance(); }
    if (held) { motion.jump = null; motion.flip = 0; motion.duck = 0; if (!G.carry) motion.lift = 0; }
    if (G.carry && G.state === 'play') updateCarry(now, dt);
    if (G.flat) motion.duck = 0;
    sk = buildBody(); G.lastSk = sk;
    if (G.flat && charging) {                                          // arms wrapped over his head while it thunders past
      const h = sk.head, s = charH;
      sk.lEl = { x: h.x - s * 0.1, y: h.y + s * 0.03 }; sk.lWr = { x: h.x - s * 0.03, y: h.y - s * 0.08 };
      sk.rEl = { x: h.x + s * 0.1, y: h.y + s * 0.03 }; sk.rWr = { x: h.x + s * 0.03, y: h.y - s * 0.08 };
    }
  }
  const layTarget = (G.knock && now - G.knock.at < 1100) || G.flat ? Math.PI / 2 : 0;
  if (G.flat && !G.knock) G.laySide = 1;
  G.lay = clamp((G.lay || 0) + clamp(layTarget - (G.lay || 0), -dt * 0.004, dt * 0.009), 0, Math.PI / 2);

  if (G.state === 'play') {
    if (lost && !lostFlat && !G.carry && !G.knock) {                  // pause the action until we can see the player
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
        if (Math.random() < comboChance(now) && spawnCombo(now)) {
          G.nextSpawn = now + spawnGap(now) * 1.4;
        } else {
          const kind = nextKind();
          spawnLane(LANE_OF(kind), now, kind);
          if (!G.seen[kind]) { G.seen[kind] = true; if (TEACH[kind]) flash(TEACH[kind][0], TEACH[kind][1], 3000, now); }   // a banner the first time
          G.nextSpawn = now + spawnGap(now);
        }
      }
      for (const p of G.pending) if (now >= p.at) { spawn(p.lane, now, p.kind, p.aimed); p.done = true; }
      G.pending = G.pending.filter(p => !p.done);
      packsTick(now);
      updateHazards(now, dt, sk ? txK(sk, manOps(sk, now)) : null);
      updateVillain(now, dt); handlePunch(now);
      $('timeNum').textContent = fmt(now - G.start);
      const boostLeft = Math.max(0, (G.boostUntil || 0) - now);
      if ($('energyBar').hidden !== !boostLeft) $('energyBar').hidden = !boostLeft;
      if (boostLeft) $('energyFill').style.width = (boostLeft / BOOST_MS * 100) + '%';
    }
  } else if (G.state === 'ending') {
    updateHazards(now, dt, null);
    if (now >= G.overAt) { G.endAt = G.overAt - 1300; silenceAll(); stopVillain(); endGame(); return; }
  }

  // draw
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const qk = G.quake && now - G.quake.at < G.quake.len ? G.quake.amp * (1 - (now - G.quake.at) / G.quake.len) : 0;   // the earth shaking
  const shake = G.shake + qk > 0.5 ? (Math.random() - 0.5) * (G.shake + qk) : 0; G.shake *= 0.85;
  ctx.translate(shake, shake * 0.6);
  drawScenery(ctx, now);
  drawShadows(ctx, now);
  const k = sk || G.lastSk;
  const manInFront = G.lay > 1 && G.hazards.some(h => h.lane === 'charge');   // lying flat, nearer to us: the elephant passes behind and over him
  const drawMan = () => {
  if (k) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';                                  // the character's own shadow
    ctx.beginPath(); ctx.ellipse(k.hip.x, groundY + 4, charH * 0.16 / (1 + motion.lift / charH * 3), charH * 0.03, 0, 0, 7); ctx.fill();
    const mood = manInFront || now - (G.hurtAt || -1e9) < 1000 ? 'pain' : now < (G.dangerUntil || 0) ? 'alarm' : 'neutral';   // eyes squeezed shut as it goes over
    if (now < (G.boostUntil || 0)) {                                    // super jump: a faint golden glow
      const gl = ctx.createRadialGradient(k.hip.x, groundY - motion.lift - charH * 0.5, 0, k.hip.x, groundY - motion.lift - charH * 0.5, charH * 0.7);
      gl.addColorStop(0, `rgba(255,220,80,${0.25 + 0.1 * Math.sin(now / 150)})`); gl.addColorStop(1, 'rgba(255,220,80,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(k.hip.x, groundY - motion.lift - charH * 0.5, charH * 0.7, 0, 7); ctx.fill();
    }
    ctx.save();
    if (manInFront) ctx.translate(0, charH * 0.04);
    if (G.stagger && now - G.stagger.at < 700) { const px = k.hip.x, a = Math.sin((now - G.stagger.at) / 60) * 0.07 * G.stagger.amp * (1 - (now - G.stagger.at) / 700); ctx.translate(px, groundY); ctx.rotate(a); ctx.translate(-px, -groundY); }   // staggering as the ground shakes
    const ops = manOps(k, now); applyOps(ctx, ops); BACK_VIEW = motion.flip > 0 && flipCos() < 0;
    const sq = squishAmount(now);
    drawCharacter(ctx, k, selected(), now < G.safeUntil && !G.carry, mood, now, G.state === 'play' || G.state === 'ending' ? LIVES - G.lives : 0);
    if (now < (G.headSplat || 0)) drawSplat(ctx, k.head.x + k.head.r * 0.25, k.head.y - k.head.r * 0.75, charH, clamp((G.headSplat - now) / 800, 0, 1), true);
    BACK_VIEW = false;
    if (sq > 0.05) {                                                    // accordion pleats
      ctx.strokeStyle = `rgba(30,25,40,${0.45 * sq})`; ctx.lineWidth = 2;
      for (let i = 1; i < 9; i++) { const y = groundY - charH * 0.96 * i / 9; ctx.beginPath(); for (let j = 0; j <= 6; j++) { const x = k.hip.x - charH * 0.15 + j * charH * 0.05; j ? ctx.lineTo(x, y + (j % 2 ? -1 : 1) * charH * 0.025) : ctx.moveTo(x, y); } ctx.stroke(); }
    }
    ctx.restore();
  }
  };
  if (!manInFront) drawMan();
  if (G.villain) drawVillain(ctx, G.villain, charH, now);
  for (const hz of G.hazards) drawHazard(ctx, hz, charH, now);
  if (manInFront) drawMan();
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
    lFoot: P2(-0.14, 0.01), rFoot: P2(0.14, 0.01), head: { ...P2(0, 0.86), r: s * 0.095, tilt: 0 },
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
  add.innerHTML = '<b>+</b>Add yourself<small>uses a photo of your face</small>';
  add.onclick = openCreate; add.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') openCreate(); };
  list.append(add);
}

$('keysBtn').onclick = () => { audio(); setKeyMode(true); startGame(); };
$('playBtn').onclick = () => { audio(); setKeyMode(false); startCamera().then(startGame).catch(e => { startGame(); cameraError(e); }); };
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
window.__dg = { G, B, motion, get flip() { return motion.flip; }, buildBody, nextLane: () => nextLane(), nextKind: () => nextKind(), spawnVillain: () => spawnVillain(performance.now()), get elapsed() { return elapsed(performance.now()); }, speed, get poseModel() { return poseModel; }, get lm() { return lm; }, get charX() { return charX; }, get screen() { return screen; }, spawn: (lane, kind, aimed) => spawn(lane, performance.now(), kind, aimed), spawnLane: (lane, kind) => spawnLane(lane, performance.now(), kind) };
