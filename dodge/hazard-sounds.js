// A sound for each thing to dodge. It gets louder as the thing gets closer to the player, and is
// panned left or right to where it is, so players can hear what is coming and from which side.
// Recorded sounds (in sounds/): the scream is the classic "Wilhelm scream" (public domain); the engine loop
// and the revving acceleration are real car recordings (CC0, "Car Sound Effects Pack" on OpenGameArt), with
// most of their sound in the mid-range that phone speakers can play. Loaded once, when sound first starts.
const samples = {};
let loading = null;
export function loadSamples(a) {
  if (loading) return loading;
  const get = (name, file) => fetch(new URL(`sounds/${file}`, location.href)).then(r => r.arrayBuffer())
    .then(buf => new Promise((ok, fail) => a.decodeAudioData(buf, ok, fail))).then(b => { samples[name] = b; }).catch(() => {});
  loading = Promise.all([get('scream', 'scream.wav'), get('engine', 'engine-loop.wav'), get('rev', 'engine-rev.wav'),
    get('groan1', 'groan1.wav'), get('groan2', 'groan2.wav'), get('bounce', 'tire-bounce.wav')]);
  return loading;
}
// A looping recording whose speed (and so pitch) can be changed: used for the revving car and the chainsaw.
function loopedSample(a, name, dest, rate = 1) {
  if (!samples[name]) return null;
  const src = a.createBufferSource(); src.buffer = samples[name]; src.loop = true; src.playbackRate.value = rate;
  src.connect(dest); src.start(); return src;
}

let noiseBuf = null;
function noiseBuffer(a) {
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

// How each kind sounds. base = overall loudness when right next to the player.
const SOUNDS = {
  bomb:     { base:0.22, whistle:true, fizz:true },
  weight:   { base:0.22, whistle:true },
  anvil:    { base:0.22, whistle:true },
  elephant: { base:0.22, whistle:true, trumpet:true },
  plane:    { base:0.22, whistle:true, engine:[220, 'sawtooth', 900] },
  // the vehicles: the same real engine recording, tuned for each (a higher scream, a deeper rumble...)
  porsche:  { base:1.0,  revs:true, floor:0.3, pitch:1.4 },
  mustang:  { base:1.1,  revs:true, floor:0.3, pitch:0.78, rumble:180 },
  miata:    { base:0.9,  revs:true, floor:0.3, pitch:1.2 },
  jeep:     { base:1.0,  revs:true, floor:0.3, pitch:0.9 },
  pickup:   { base:1.0,  revs:true, floor:0.3, pitch:0.68, also:[0.19, 'clank'] },   // rough, with a rattle
  beetle:   { base:0.9,  revs:true, floor:0.3, pitch:1.45, every:[0.085, 'putt'], steady:true },   // buzzy put-put
  pig:      { base:0.45, every:[0.75, 'squeal'], charge:true },
  tire:     { base:1.0, floor:0.25 },                                  // bounces: see bounce()
  eagle:    { base:0.35, every:[0.22, 'flap'], screechAtStart:true, whoosh:true },   // screeches as it starts its dive
  boomerang:{ base:0.6,  every:[0.085, 'whirr'], steady:true },           // a fast flutter as it spins
  missile:  { base:0.3,  hiss:1400, engine:[110, 'sawtooth', 500] },
  arrow:    { base:0.5,  twang:true },                                   // a bow twang, then silent flight
  tomahawk: { base:0.55, every:[0.63, 'whup'], steady:true },        // whup-whup: once per half turn as it spins
  ufo:      { base:0.3,  warble:true, floor:0.15 },
};

export function createVoice(a, kind) {
  const cfg = SOUNDS[kind] || { base:0.2 };
  const out = a.createGain(); out.gain.value = 0;
  const pan = a.createStereoPanner ? a.createStereoPanner() : null;
  if (pan) out.connect(pan).connect(a.destination); else out.connect(a.destination);
  const nodes = [];
  const t = () => a.currentTime;

  const osc = (type, f, gain = 1, filterF = null) => {
    const o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.value = f; g.gain.value = gain;
    if (filterF) { const fl = a.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = filterF; o.connect(fl).connect(g); } else o.connect(g);
    g.connect(out); o.start(); nodes.push(o); return o;
  };
  const noise = (type, f, gain = 1, q = 1) => {
    const s = a.createBufferSource(), fl = a.createBiquadFilter(), g = a.createGain();
    s.buffer = noiseBuffer(a); s.loop = true; fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.value = gain;
    s.connect(fl).connect(g).connect(out); s.start(); nodes.push(s); return fl;
  };
  // Short one-off sounds, played through this voice so they also follow its loudness and position.
  const ping = (type, f0, f1, dur, vol) => {
    const o = a.createOscillator(), g = a.createGain(), at = t();
    o.type = type; o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + dur);
    g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    o.connect(g).connect(out); o.start(at); o.stop(at + dur + 0.02);
  };
  const burst = (type, f, dur, vol) => {
    const s = a.createBufferSource(), fl = a.createBiquadFilter(), g = a.createGain(), at = t();
    s.buffer = noiseBuffer(a); fl.type = type; fl.frequency.value = f;
    g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    s.connect(fl).connect(g).connect(out); s.start(at, Math.random()); s.stop(at + dur + 0.02);
  };
  const EVENTS = {
    thump: () => burst('lowpass', 150, 0.12, 1),
    flap: () => burst('bandpass', 700, 0.08, 0.8),
    caw: () => { ping('sawtooth', 640, 430, 0.22, 0.4); },
    clank: () => { ping('triangle', 1300 + Math.random() * 500, 900, 0.08, 0.6); },
    screech: () => ping('sine', 2400, 1500, 0.6, 0.6),
    whup: () => burst('bandpass', 850, 0.13, 1.1),               // a spinning blade cutting the air
    putt: () => burst('lowpass', 380, 0.05, 1.3),                 // an old air-cooled engine's put-put
    whirr: () => burst('bandpass', 560 + Math.random() * 120, 0.06, 1.2),   // each turn of a boomerang
    squeal: () => squeal(a, out, 0.45 + Math.random() * 0.25, 0.9),
  };

  const whistle = cfg.whistle ? osc('sine', 1800, 0.5) : null;
  if (cfg.fizz) noise('highpass', 4000, 0.4);
  const engine = cfg.engine ? osc(cfg.engine[1], cfg.engine[0], 0.6, cfg.engine[2]) : null;
  if (cfg.rumble) noise('lowpass', cfg.rumble, 1.2);
  if (cfg.hiss) noise('bandpass', cfg.hiss, 1.4, 0.8);
  if (cfg.tone) osc(cfg.tone[1], cfg.tone[0], 0.4);
  if (cfg.warble) {                                    // the eerie wavering hum of a flying saucer
    const lfo = a.createOscillator(), amt = a.createGain(); lfo.frequency.value = 6; amt.gain.value = 110; lfo.connect(amt); lfo.start(); nodes.push(lfo);
    const o1 = osc('sine', 420, 0.6), o2 = osc('triangle', 840, 0.15); amt.connect(o1.frequency); amt.connect(o2.frequency);
  }
  // The elephant's trumpet is played at full volume, not quieter with distance: it is a warning.
  if (cfg.trumpet) setTimeout(() => trumpet(a, pan || a.destination, 1.5, 1), 100);
  let trumpetedAgain = false;
  // The car roars in with a rev at full volume, then its engine keeps revving through the gears.
  let revRate = null;
  if (cfg.revs) {
    setTimeout(() => vroom(a, pan || a.destination, cfg.pitch || 1), 30);
    const eng = loopedSample(a, 'engine', out, 0.8 * (cfg.pitch || 1));
    if (eng) { nodes.push(eng); revRate = eng.playbackRate; }
  }
  const born = performance.now();
  // The arrow: a single bow twang as it is loosed, then it flies silently.
  if (cfg.twang) twang(a, pan || a.destination);
  // The pig announces its charge with a squeal at full volume.
  if (cfg.charge) setTimeout(() => squeal(a, pan || a.destination, 0.8, 0.8), 50);
  // The eagle's screech, loud whatever the distance, as it tips into its dive.
  if (cfg.screechAtStart) setTimeout(() => screech(a, pan || a.destination), 120);
  // A rushing whoosh of air that grows much louder as it gets close.
  let whooshGain = null;
  if (cfg.whoosh) {
    const src = a.createBufferSource(), fl = a.createBiquadFilter(); whooshGain = a.createGain(); whooshGain.gain.value = 0;
    src.buffer = noiseBuffer(a); src.loop = true; fl.type = 'bandpass'; fl.frequency.value = 900; fl.Q.value = 0.7;
    src.connect(fl).connect(whooshGain).connect(pan || a.destination); src.start(); nodes.push(src);
  }
  let nextEvent = 0, nextAlso = 0, cried = false, lastX = null;

  return {
    // prox: 0 far away .. 1 right next to the player. side: -1 left .. 1 right. fall: 0 top .. 1 ground.
    update(prox, side, fall, hz, now) {
      const floor = cfg.floor ?? 0.06, vol = cfg.base * (floor + (1 - floor) * prox * prox);
      out.gain.setTargetAtTime(vol, t(), 0.05);
      if (pan) pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, side)), t(), 0.05);
      if (whistle) whistle.frequency.setTargetAtTime(1800 - 1300 * fall, t(), 0.05);   // falling whistle drops in pitch
      if (revRate) {
        // Revs climb through each gear, drop at the gear change, and climb again; harder as it gets close.
        // (the frame's clock can be a fraction of a millisecond behind `born`, so never let the age go negative)
        const gear = 0.9 - 0.3 * prox, ph = (Math.max(0, now - born) / 1000 % gear) / gear;
        const rate = 0.9 + (0.6 + 0.5 * prox) * Math.pow(ph, 0.7);
        revRate.setTargetAtTime(rate * (cfg.pitch || 1), t(), ph < 0.06 ? 0.05 : 0.03);
      }
      if (engine) {
        let f = cfg.engine[0] * (1 + 0.6 * prox);
        if (cfg.doppler && lastX != null) {                                              // higher while coming, lower going away
          const approaching = Math.sign(hz.x - lastX) === Math.sign(-side) || Math.abs(side) < 0.05;
          f *= approaching ? 1.15 : 0.8;
        }
        engine.frequency.setTargetAtTime(f, t(), 0.08);
      }
      lastX = hz.x;
      if (whooshGain) whooshGain.gain.setTargetAtTime(0.9 * Math.pow(prox, 3), t(), 0.06);
      if (cfg.every && now >= nextEvent) { EVENTS[cfg.every[1]](); nextEvent = now + cfg.every[0] * 1000 * (cfg.steady ? 1 : 1 - 0.35 * prox) * (hz.climbing ? 0.55 : 1); }
      if (cfg.also && now >= nextAlso) { EVENTS[cfg.also[1]](); nextAlso = now + cfg.also[0] * 1000; }
      if (cfg.cry && !cried && prox > 0.45) { cried = true; EVENTS[cfg.cry](); }
      if (cfg.trumpet && !trumpetedAgain && fall > 0.55) { trumpetedAgain = true; trumpet(a, pan || a.destination, 0.9, 0.9); }
    },
    // A rubbery bounce, played each time the tire hits the ground (follows its loudness and position).
    // (a recorded bounce, CC0, trimmed so each one ends before the next landing)
    bounce() {
      if (!samples.bounce) return;
      const src = a.createBufferSource(); src.buffer = samples.bounce;
      src.playbackRate.value = 0.96 + Math.random() * 0.08;              // tiny variety between bounces
      src.connect(out); src.start();
    },
    stop() {
      out.gain.setTargetAtTime(0, t(), 0.04);
      if (whooshGain) whooshGain.gain.setTargetAtTime(0, t(), 0.04);
      setTimeout(() => { for (const n of nodes) { try { n.stop(); } catch (e) { /* already stopped */ } } out.disconnect(); if (whooshGain) whooshGain.disconnect(); if (pan) pan.disconnect(); }, 300);
    },
  };
}

// An elephant's alarm trumpet: a loud, brassy blast that swoops up in pitch and wavers, with a rough edge.
function trumpet(a, dest, dur = 1.5, loud = 1) {
  const at = a.currentTime;
  const master = a.createGain();
  master.gain.setValueAtTime(0.0001, at);
  master.gain.exponentialRampToValueAtTime(0.75 * loud, at + 0.06);
  master.gain.setValueAtTime(0.75 * loud, at + dur * 0.7);
  master.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  // growl: soft clipping
  const shaper = a.createWaveShaper(), curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 3.5); }
  shaper.curve = curve;
  // brassy formant
  const body = a.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 1400; body.Q.value = 1.2; body.gain.value = 10;
  const top = a.createBiquadFilter(); top.type = 'lowpass'; top.frequency.value = 5000;
  shaper.connect(body).connect(top).connect(master).connect(dest);
  // pitch: a quick swoop up, a wavering hold, then a drop at the end
  const vib = a.createOscillator(), vibAmt = a.createGain(); vib.frequency.value = 7; vibAmt.gain.value = 35;
  vib.connect(vibAmt); vib.start(at); vib.stop(at + dur + 0.05);
  for (const [mult, detune, vol] of [[1, 0, 0.5], [1, 12, 0.35], [2, -8, 0.25], [3, 5, 0.12]]) {
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'sawtooth'; o.detune.value = detune; g.gain.value = vol;
    o.frequency.setValueAtTime(330 * mult, at);
    o.frequency.exponentialRampToValueAtTime(620 * mult, at + 0.18);
    o.frequency.setValueAtTime(620 * mult, at + dur * 0.65);
    o.frequency.exponentialRampToValueAtTime(470 * mult, at + dur);
    vibAmt.connect(o.frequency);
    o.connect(g).connect(shaper); o.start(at); o.stop(at + dur + 0.05);
  }
  // breathy rasp
  const n = a.createBufferSource(), nf = a.createBiquadFilter(), ng = a.createGain();
  n.buffer = noiseBuffer(a); nf.type = 'bandpass'; nf.frequency.value = 2200; nf.Q.value = 1.5; ng.gain.value = 0.25;
  n.connect(nf).connect(ng).connect(master); n.start(at, Math.random()); n.stop(at + dur);
}

// A pig's furious squeal: a shrill shriek that leaps up in pitch, quivers fast and breaks up at the edges.
function squeal(a, dest, dur = 0.6, loud = 1) {
  const at = a.currentTime;
  const master = a.createGain();
  master.gain.setValueAtTime(0.0001, at);
  master.gain.exponentialRampToValueAtTime(0.6 * loud, at + 0.03);
  master.gain.setValueAtTime(0.6 * loud, at + dur * 0.75);
  master.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  const shaper = a.createWaveShaper(), curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 5); }
  shaper.curve = curve;
  const nasal = a.createBiquadFilter(); nasal.type = 'bandpass'; nasal.frequency.value = 2600; nasal.Q.value = 1.4;
  const low = a.createBiquadFilter(); low.type = 'highpass'; low.frequency.value = 500;
  shaper.connect(nasal).connect(low).connect(master).connect(dest);
  // fast, uneven quiver
  const vib = a.createOscillator(), vibAmt = a.createGain(); vib.type = 'triangle'; vib.frequency.value = 13 + Math.random() * 5; vibAmt.gain.value = 140;
  vib.connect(vibAmt); vib.start(at); vib.stop(at + dur + 0.05);
  const peak = 1500 + Math.random() * 400;
  for (const [mult, detune, vol] of [[1, 0, 0.6], [1, 25, 0.4], [1.5, -15, 0.25], [2, 10, 0.2]]) {
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'sawtooth'; o.detune.value = detune; g.gain.value = vol;
    o.frequency.setValueAtTime(650 * mult, at);
    o.frequency.exponentialRampToValueAtTime(peak * mult, at + 0.07);
    o.frequency.setValueAtTime(peak * mult, at + dur * 0.55);
    o.frequency.exponentialRampToValueAtTime(peak * 0.6 * mult, at + dur);
    vibAmt.connect(o.frequency);
    o.connect(g).connect(shaper); o.start(at); o.stop(at + dur + 0.05);
  }
  const n = a.createBufferSource(), nf = a.createBiquadFilter(), ng = a.createGain();
  n.buffer = noiseBuffer(a); nf.type = 'bandpass'; nf.frequency.value = 3500; nf.Q.value = 2; ng.gain.value = 0.3;
  n.connect(nf).connect(ng).connect(master); n.start(at, Math.random()); n.stop(at + dur);
}

// A short pained groan for the first two injuries (recordings: "Pain sounds" by EmoPreben, CC0).
export function groan(a, which, dest = a.destination) {
  const b = samples['groan' + which]; if (!b) return;
  const src = a.createBufferSource(), g = a.createGain(); src.buffer = b; g.gain.value = 0.5;   // short and at half volume
  src.connect(g).connect(dest); src.start();
}
// A scream of fear and agony for the final injury: the recorded Wilhelm scream.
export function scream(a, dest = a.destination) {
  if (!samples.scream) return;
  const src = a.createBufferSource(), g = a.createGain();
  src.buffer = samples.scream; src.playbackRate.value = 0.95 + Math.random() * 0.1;   // a touch of variety
  g.gain.value = 1; src.connect(g).connect(dest); src.start();
}

// A burning wreck crackling and roaring for a few seconds.
export function fire(a, secs = 3.5) {
  const at = a.currentTime;
  const len = Math.floor(a.sampleRate * secs), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const fade = 1 - i / len;
    d[i] = ((Math.random() * 2 - 1) * 0.35 + (Math.random() < 0.0015 ? (Math.random() * 2 - 1) * 4 : 0)) * fade;  // roar + crackles
  }
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf; f.type = 'lowpass'; f.frequency.value = 1800; g.gain.value = 0.35;
  src.connect(f).connect(g).connect(a.destination); src.start(at);
}

// A full-volume "VROOM": the recording of a real car accelerating hard.
function vroom(a, dest, pitch = 1) {
  if (!samples.rev) return;
  const at = a.currentTime, dur = Math.min(2.2, samples.rev.duration), src = a.createBufferSource(), g = a.createGain();
  src.buffer = samples.rev; src.playbackRate.value = pitch;
  g.gain.setValueAtTime(1, at); g.gain.setValueAtTime(1, at + dur - 0.4); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(g).connect(dest); src.start(at); src.stop(at + dur + 0.05);
}

// The UFO's laser charging up: a whine that rises in pitch and pulses faster and faster, for `secs`.
export function laserCharge(a, secs = 3, dest = a.destination) {
  const at = a.currentTime, out = a.createGain(); out.connect(dest);
  out.gain.setValueAtTime(0.0001, at); out.gain.exponentialRampToValueAtTime(0.06, at + 0.4);
  out.gain.exponentialRampToValueAtTime(0.22, at + secs - 0.05); out.gain.exponentialRampToValueAtTime(0.0001, at + secs + 0.02);
  const pulse = a.createGain(); pulse.gain.value = 0.6; pulse.connect(out);
  const lfo = a.createOscillator(), lfoAmt = a.createGain();            // pulsing speeds up as it charges
  lfo.frequency.setValueAtTime(3, at); lfo.frequency.exponentialRampToValueAtTime(28, at + secs);
  lfoAmt.gain.value = 0.4; lfo.connect(lfoAmt).connect(pulse.gain); lfo.start(at); lfo.stop(at + secs + 0.05);
  const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(600, at); f.frequency.exponentialRampToValueAtTime(3000, at + secs); f.Q.value = 0.9;
  f.connect(pulse);
  for (const [type, f0, f1, vol] of [['sawtooth', 120, 1900, 0.6], ['sine', 240, 3800, 0.5]]) {
    const o = a.createOscillator(), g = a.createGain(); o.type = type; g.gain.value = vol;
    o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + secs);
    o.connect(g).connect(f); o.start(at); o.stop(at + secs + 0.05);
  }
}
// The laser firing ("pew"), then a brief boom where it hits.
export function laserShot(a, dest = a.destination) {
  const at = a.currentTime;
  for (const [type, f0, f1, vol] of [['square', 2400, 160, 0.25], ['sine', 1800, 90, 0.35]]) {
    const o = a.createOscillator(), g = a.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + 0.28);
    g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
    o.connect(g).connect(dest); o.start(at); o.stop(at + 0.32);
  }
  const bt = at + 0.07, len = Math.floor(a.sampleRate * 0.35), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const n = a.createBufferSource(), nf = a.createBiquadFilter(), ng = a.createGain();
  n.buffer = buf; nf.type = 'lowpass'; nf.frequency.value = 700; ng.gain.value = 0.7;
  n.connect(nf).connect(ng).connect(dest); n.start(bt);
  const thump = a.createOscillator(), tg = a.createGain(); thump.frequency.setValueAtTime(160, bt); thump.frequency.exponentialRampToValueAtTime(45, bt + 0.25);
  tg.gain.setValueAtTime(0.5, bt); tg.gain.exponentialRampToValueAtTime(0.0001, bt + 0.28); thump.connect(tg).connect(dest); thump.start(bt); thump.stop(bt + 0.3);
}

// ---------------------------------------------------------------- the masked brute
function shaped(a, k) {
  const sh = a.createWaveShaper(), curve = new Float32Array(2048);
  for (let i = 0; i < curve.length; i++) { const x = i / 1024 - 1; curve[i] = Math.tanh(x * k); }
  sh.curve = curve; return sh;
}
// His sound while he is around: a growl when he appears, and a chainsaw that idles and screams when he swings.
export function villainVoice(a, weapon) {
  const out = a.createGain(); out.gain.value = 0;
  const pan = a.createStereoPanner ? a.createStereoPanner() : null;
  if (pan) out.connect(pan).connect(a.destination); else out.connect(a.destination);
  const nodes = [];
  growl(a, pan || a.destination);
  let saw = null, sawRate = null;
  if (weapon === 'chainsaw' && samples.engine) {
    const hp = a.createBiquadFilter(), boost = a.createGain(); hp.type = 'highpass'; hp.frequency.value = 300; boost.gain.value = 1.6;
    hp.connect(boost).connect(out);
    const src = loopedSample(a, 'engine', hp, 2.0); nodes.push(src); sawRate = src.playbackRate;
  } else if (weapon === 'chainsaw') {
    const sh = shaped(a, 6), lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3500;
    const mix = a.createGain(); mix.gain.value = 0.4; mix.connect(sh).connect(lp).connect(out);
    saw = [];
    for (const [type, mult, vol] of [['sawtooth', 1, 0.7], ['square', 2, 0.3], ['sawtooth', 3.01, 0.2]]) {
      const o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.value = 45 * mult; g.gain.value = vol;
      o.connect(g).connect(mix); o.start(); nodes.push(o); saw.push([o.frequency, mult]);
    }
    const putt = a.createOscillator(), pa = a.createGain(); putt.frequency.value = 18; pa.gain.value = 0.3; putt.connect(pa).connect(mix.gain); putt.start(); nodes.push(putt);
  }
  return {
    update(state, prox, side) {
      const t = a.currentTime, angry = state === 'windup' || state === 'swing';
      out.gain.setTargetAtTime(saw || sawRate ? (0.15 + 0.3 * prox + (angry ? 0.3 : 0)) : 0, t, 0.05);
      if (sawRate) sawRate.setTargetAtTime(angry ? 3.2 : 2.0, t, angry ? 0.08 : 0.15);            // revs up to swing
      if (pan) pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, side)), t, 0.05);
      if (saw) for (const [f, m] of saw) f.setTargetAtTime((angry ? 160 : 45) * m, t, angry ? 0.08 : 0.15);   // revs up to swing
    },
    stop() {
      out.gain.setTargetAtTime(0, a.currentTime, 0.05);
      setTimeout(() => { nodes.forEach(n => { try { n.stop(); } catch (e) {} }); out.disconnect(); if (pan) pan.disconnect(); }, 300);
    },
  };
}
// A menacing growl.
export function growl(a, dest = a.destination) {
  const at = a.currentTime, dur = 1.2, out = a.createGain(); out.connect(dest);
  out.gain.setValueAtTime(0.0001, at); out.gain.exponentialRampToValueAtTime(0.5, at + 0.15); out.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  const sh = shaped(a, 5), lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; sh.connect(lp).connect(out);
  const rough = a.createGain(); rough.gain.value = 0.5; rough.connect(sh);
  const lfo = a.createOscillator(), la = a.createGain(); lfo.frequency.value = 38; la.gain.value = 0.45; lfo.connect(la).connect(rough.gain); lfo.start(at); lfo.stop(at + dur);
  const o = a.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(75, at); o.frequency.linearRampToValueAtTime(95, at + 0.5); o.frequency.linearRampToValueAtTime(65, at + dur);
  o.connect(rough); o.start(at); o.stop(at + dur);
}
// The axe (or chainsaw) swinging through the air.
export function swoosh(a, dest = a.destination) {
  const at = a.currentTime, len = Math.floor(a.sampleRate * 0.3), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / len);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = buf; f.type = 'bandpass'; f.frequency.setValueAtTime(500, at); f.frequency.exponentialRampToValueAtTime(2500, at + 0.3); f.Q.value = 1.5; g.gain.value = 0.6;
  s.connect(f).connect(g).connect(dest); s.start(at);
}
// A punch landing: a meaty smack.
export function pow(a, dest = a.destination) {
  const at = a.currentTime, len = Math.floor(a.sampleRate * 0.15), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = buf; f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.7; g.gain.value = 1.2; s.connect(f).connect(g).connect(dest); s.start(at);
  const o = a.createOscillator(), og = a.createGain(); o.frequency.setValueAtTime(180, at); o.frequency.exponentialRampToValueAtTime(60, at + 0.15);
  og.gain.setValueAtTime(0.6, at); og.gain.exponentialRampToValueAtTime(0.0001, at + 0.18); o.connect(og).connect(dest); o.start(at); o.stop(at + 0.2);
}
// Knocked out: a dizzy "wah-wah" slide and a thud.
export function knockout(a, dest = a.destination) {
  const at = a.currentTime;
  const o = a.createOscillator(), g = a.createGain(); o.type = 'triangle';
  o.frequency.setValueAtTime(500, at); o.frequency.exponentialRampToValueAtTime(120, at + 0.9);
  const v = a.createOscillator(), va = a.createGain(); v.frequency.value = 8; va.gain.value = 30; v.connect(va).connect(o.frequency); v.start(at); v.stop(at + 0.9);
  g.gain.setValueAtTime(0.25, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.9); o.connect(g).connect(dest); o.start(at); o.stop(at + 0.95);
  const len = Math.floor(a.sampleRate * 0.3), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), sg = a.createGain();
  s.buffer = buf; f.type = 'lowpass'; f.frequency.value = 300; sg.gain.value = 1; s.connect(f).connect(sg).connect(dest); s.start(at + 0.6);
}

// A bow being loosed: the string's twang (a plucked, slightly bending note) and the "thwip" of release.
export function twang(a, dest = a.destination) {
  const at = a.currentTime;
  for (const [type, f, vol] of [['triangle', 196, 0.6], ['sawtooth', 392, 0.18], ['sine', 588, 0.12]]) {
    const o = a.createOscillator(), g = a.createGain(); o.type = type;
    o.frequency.setValueAtTime(f * 1.04, at); o.frequency.exponentialRampToValueAtTime(f, at + 0.08);
    g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.45);
    o.connect(g).connect(dest); o.start(at); o.stop(at + 0.5);
  }
  const len = Math.floor(a.sampleRate * 0.12), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const n = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  n.buffer = buf; f.type = 'bandpass'; f.frequency.value = 2800; f.Q.value = 1.2; g.gain.value = 0.5;
  n.connect(f).connect(g).connect(dest); n.start(at);
}

// A bald eagle's cry: a high, harsh, falling scream with a quick flutter in it.
function screech(a, dest) {
  const at = a.currentTime, o = a.createOscillator(), o2 = a.createOscillator(), g = a.createGain(), lfo = a.createOscillator(), amt = a.createGain();
  o.type = 'sawtooth'; o2.type = 'sine';
  o.frequency.setValueAtTime(2300, at); o.frequency.exponentialRampToValueAtTime(1500, at + 0.7);
  o2.frequency.setValueAtTime(3400, at); o2.frequency.exponentialRampToValueAtTime(2300, at + 0.7);
  lfo.frequency.value = 28; amt.gain.value = 120; lfo.connect(amt); amt.connect(o.frequency); amt.connect(o2.frequency);
  const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 1.2;
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.35, at + 0.04); g.gain.setValueAtTime(0.35, at + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.75);
  o.connect(bp); o2.connect(bp); bp.connect(g).connect(dest);
  for (const n of [o, o2, lfo]) { n.start(at); n.stop(at + 0.8); }
}
