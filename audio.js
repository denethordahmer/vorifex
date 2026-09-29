/* =========================================================================
   VORIFEX'S TITHE — AUDIO ENGINE (audio.js) v2
   "Cold Machine Temple" — melodic rhythmic loops + synthesized SFX.
   Two background tracks: THE TURNING (default) and THE VIGIL (post-prestige).
   No audio files, no CDN, offline-safe. Exposes window.VorifexAudio.
   ========================================================================= */

(function (global) {
  "use strict";

  /* =====================  GLOBAL STATE  ===================== */
  let ctx = null;
  let masterGain = null;
  let musicGain = null;
  let sfxGain = null;

  let initialized = false;
  let enabled = true;

  // music scheduler state
  let musicRunning = false;
  let schedulerInterval = null;
  let nextNoteTime = 0;
  let currentStep = 0;
  let currentChordIndex = 0;
  let totalSteps = 0;
  let phraseCount = 0;
  let currentTrack = "turning";
  let vigilTimeout = null;

  /* =====================  CONFIG  ===================== */
  const VOL = {
    master: 0.55,
    music: 0.32,
    sfx: 0.6,
    kick: 0.55,
    snare: 0.22,
    hat: 0.05,
    bell: 0.32,
    organ: 0.26,
    deepBell: 0.42,
    tap: 0.35,
    crit: 0.5,
    purchase: 0.5,
    prestige: 0.6,
    achievement: 0.5,
    windowEnd: 0.35,
    record: 0.5,
    sessionStart: 0.4,
    hunger: 0.45
  };

  const BPM = 72;
  const STEPS_PER_BEAT = 2;
  const STEPS_PER_PHRASE = 16;
  const SECONDS_PER_STEP = 60 / BPM / STEPS_PER_BEAT;
  const LOOKAHEAD_MS = 25;
  const SCHEDULE_AHEAD_S = 0.12;

  /* =====================  MUSIC PATTERNS  ===================== */
  const TRACKS = {
    turning: {
      kick:  [0, 4, 8, 12],
      snare: [2, 6, 10, 14],
      hat:   [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
      melody: [
        { step: 0,  freq: 440.00 }, // A4
        { step: 2,  freq: 523.25 }, // C5
        { step: 3,  freq: 659.25 }, // E5
        { step: 4,  freq: 587.33 }, // D5
        { step: 6,  freq: 523.25 }, // C5
        { step: 8,  freq: 493.88 }, // B4
        { step: 10, freq: 440.00 }, // A4
        { step: 11, freq: 329.63 }, // E4
        { step: 12, freq: 392.00 }, // G4
        { step: 14, freq: 440.00 }  // A4
      ],
      chords: [
        { root: 110.00, fifth: 164.81, octave: 220.00 }, // Am
        { root: 87.31,  fifth: 130.81, octave: 174.61 }, // F
        { root: 130.81, fifth: 196.00, octave: 261.63 }, // C
        { root: 98.00,  fifth: 146.83, octave: 196.00 }  // G
      ],
      deepBellEvery: 3 // phrases
    },
    vigil: {
      kick:  [0, 6, 8, 14],
      snare: [4, 12],
      hat:   [0,2,4,6,8,10,12,14],
      melody: [
        { step: 0,  freq: 329.63 }, // E4
        { step: 4,  freq: 440.00 }, // A4
        { step: 6,  freq: 493.88 }, // B4
        { step: 8,  freq: 329.63 }, // E4
        { step: 12, freq: 440.00 }, // A4
        { step: 14, freq: 392.00 }  // G4
      ],
      chords: [
        { root: 55.00, fifth: 82.41,  octave: 110.00 },
        { root: 43.65, fifth: 65.41,  octave: 87.31  },
        { root: 65.41, fifth: 98.00,  octave: 130.81 },
        { root: 49.00, fifth: 73.42,  octave: 98.00  }
      ],
      deepBellEvery: 2
    }
  };

  /* =====================  INIT / RESUME  ===================== */
  function init() {
    if (initialized) return true;
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) {
      console.warn("VorifexAudio: Web Audio API not supported");
      return false;
    }
    try { ctx = new AC(); }
    catch (e) { console.warn("VorifexAudio: AudioContext creation failed", e); return false; }

    masterGain = ctx.createGain();
    masterGain.gain.value = enabled ? VOL.master : 0.0001;
    masterGain.connect(ctx.destination);

    musicGain = ctx.createGain();
    musicGain.gain.value = VOL.music;
    musicGain.connect(masterGain);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = VOL.sfx;
    sfxGain.connect(masterGain);

    initialized = true;
    return true;
  }

  function resume() {
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  }

  /* =====================  UTIL  ===================== */
  function now() { return ctx.currentTime; }

  function env(gainNode, t0, attack, decay, peak, floor) {
    const g = gainNode.gain;
    const f = floor === undefined ? 0.0001 : floor;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + attack);
    g.exponentialRampToValueAtTime(Math.max(0.0001, f), t0 + attack + decay);
  }

  /* =====================  INSTRUMENTS  ===================== */
  function playKick(t, vol) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.11);

    const g = ctx.createGain();
    env(g, t, 0.003, 0.24, vol);

    osc.connect(g);
    g.connect(musicGain);
    osc.start(t);
    osc.stop(t + 0.30);

    // metallic click
    const click = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, 240, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    click.buffer = buf;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1400;
    bp.Q.value = 2;

    const cg = ctx.createGain();
    cg.gain.setValueAtTime(vol * 0.4, t);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);

    click.connect(bp); bp.connect(cg); cg.connect(musicGain);
    click.start(t); click.stop(t + 0.04);
  }

  function playSnare(t, vol) {
    const noise = ctx.createBufferSource();
    const len = Math.floor(ctx.sampleRate * 0.2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1);
    noise.buffer = buf;

    const hp = ctx.createBiquadFilter();
    hp.type = "bandpass";
    hp.frequency.value = 2200;
    hp.Q.value = 1.2;

    const ng = ctx.createGain();
    env(ng, t, 0.002, 0.16, vol);

    noise.connect(hp); hp.connect(ng); ng.connect(musicGain);
    noise.start(t); noise.stop(t + 0.2);

    // metallic ring underneath
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 195;
    const og = ctx.createGain();
    env(og, t, 0.002, 0.09, vol * 0.5);
    osc.connect(og); og.connect(musicGain);
    osc.start(t); osc.stop(t + 0.11);
  }

  function playHat(t, vol) {
    const noise = ctx.createBufferSource();
    const len = Math.floor(ctx.sampleRate * 0.05);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    noise.buffer = buf;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 6500;

    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);

    noise.connect(hp); hp.connect(g); g.connect(musicGain);
    noise.start(t); noise.stop(t + 0.04);
  }

  function playBell(t, freq, vol) {
    // fundamental
    const o1 = ctx.createOscillator();
    o1.type = "triangle";
    o1.frequency.value = freq;

    // bell partial (slightly sharp, characteristic of struck metal)
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = freq * 2.01;

    const g2 = ctx.createGain();
    g2.gain.value = 0.32;

    const g = ctx.createGain();
    env(g, t, 0.004, 1.5, vol);

    o1.connect(g);
    o2.connect(g2); g2.connect(g);
    g.connect(musicGain);

    o1.start(t); o1.stop(t + 1.6);
    o2.start(t); o2.stop(t + 1.6);
  }

  function playOrgan(t, freq, dur, vol) {
    const o1 = ctx.createOscillator(); o1.type = "sine"; o1.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = freq * 2;
    const o3 = ctx.createOscillator(); o3.type = "sine"; o3.frequency.value = freq * 1.5;

    const g2 = ctx.createGain(); g2.gain.value = 0.4;
    const g3 = ctx.createGain(); g3.gain.value = 0.2;

    const g = ctx.createGain();
    const a = Math.min(0.35, dur * 0.15);
    const r = Math.min(0.6, dur * 0.3);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.setValueAtTime(vol, t + dur - r);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    o1.connect(g);
    o2.connect(g2); g2.connect(g);
    o3.connect(g3); g3.connect(g);
    g.connect(musicGain);

    o1.start(t); o1.stop(t + dur + 0.05);
    o2.start(t); o2.stop(t + dur + 0.05);
    o3.start(t); o3.stop(t + dur + 0.05);
  }

  function playDeepBell(t, vol) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(58, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 3.5);

    const g = ctx.createGain();
    env(g, t, 0.02, 3.6, vol);

    osc.connect(g); g.connect(musicGain);
    osc.start(t); osc.stop(t + 3.8);

    // shimmer partial
    const shim = ctx.createOscillator();
    shim.type = "triangle";
    shim.frequency.value = 1180;
    const sg = ctx.createGain();
    env(sg, t, 0.01, 1.2, vol * 0.15);
    shim.connect(sg); sg.connect(musicGain);
    shim.start(t); shim.stop(t + 1.3);
  }

  /* =====================  SCHEDULER  ===================== */
  function scheduleStep(step, t) {
    const track = TRACKS[currentTrack];
    const chord = track.chords[currentChordIndex];

    if (track.kick.indexOf(step) !== -1)  playKick(t, VOL.kick);
    if (track.snare.indexOf(step) !== -1) playSnare(t, VOL.snare);
    if (track.hat.indexOf(step) !== -1)   playHat(t, VOL.hat);

    // melody notes
    for (let i = 0; i < track.melody.length; i++) {
      const n = track.melody[i];
      if (n.step === step) playBell(t, n.freq, VOL.bell);
    }

    // bass pulse on kick hits + chord change at phrase start
    if (track.kick.indexOf(step) !== -1) {
      playOrgan(t, chord.root, 0.5, VOL.organ);
    }

    // deep bell at phrase boundaries
    if (step === 0 && phraseCount % track.deepBellEvery === 0) {
      playDeepBell(t, VOL.deepBell);
    }
  }

  function advanceStep() {
    currentStep++;
    totalSteps++;
    if (currentStep >= STEPS_PER_PHRASE) {
      currentStep = 0;
      phraseCount++;
      currentChordIndex = (currentChordIndex + 1) % 4;
    }
    nextNoteTime += SECONDS_PER_STEP;
  }

  function schedulerTick() {
    if (!ctx || !musicRunning) return;
    while (nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
      scheduleStep(currentStep, nextNoteTime);
      advanceStep();
    }
  }

  /* =====================  MUSIC CONTROL  ===================== */
  function startMusic() {
    if (!initialized || musicRunning) return;
    musicRunning = true;
    currentStep = 0;
    currentChordIndex = 0;
    totalSteps = 0;
    phraseCount = 0;
    nextNoteTime = ctx.currentTime + 0.15;
    if (schedulerInterval) clearInterval(schedulerInterval);
    schedulerInterval = setInterval(schedulerTick, LOOKAHEAD_MS);
  }

  function stopMusic() {
    musicRunning = false;
    if (schedulerInterval) {
      clearInterval(schedulerInterval);
      schedulerInterval = null;
    }
  }

  function playVigilFor(seconds) {
    currentTrack = "vigil";
    if (vigilTimeout) clearTimeout(vigilTimeout);
    vigilTimeout = setTimeout(() => { currentTrack = "turning"; }, seconds * 1000);
  }

  function tick(dtSec) {
    // no-op; scheduler runs on its own interval
  }

  /* =====================  SFX  ===================== */
  function playTap() {
    if (!initialized || !enabled) return;
    resume();
    const t = now();
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.05);
    const g = ctx.createGain();
    env(g, t, 0.002, 0.055, VOL.tap);
    osc.connect(g); g.connect(sfxGain);
    osc.start(t); osc.stop(t + 0.08);

    const n = ctx.createBufferSource();
    const b = ctx.createBuffer(1, 480, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    n.buffer = b;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1800; bp.Q.value = 1.4;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.12, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
    n.connect(bp); bp.connect(ng); ng.connect(sfxGain);
    n.start(t); n.stop(t + 0.03);
  }

  function playCrit() {
    if (!initialized || !enabled) return;
    resume();
    const t = now();
    [280, 340].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = "triangle";
      const s = t + i * 0.025;
      o.frequency.setValueAtTime(f, s);
      o.frequency.exponentialRampToValueAtTime(f * 0.5, s + 0.05);
      const g = ctx.createGain();
      env(g, s, 0.002, 0.05, VOL.crit * 0.6);
      o.connect(g); g.connect(sfxGain);
      o.start(s); o.stop(s + 0.09);
    });
    const p = ctx.createOscillator();
    p.type = "triangle";
    p.frequency.setValueAtTime(2400, t);
    p.frequency.exponentialRampToValueAtTime(3600, t + 0.08);
    const pg = ctx.createGain();
    env(pg, t, 0.003, 0.13, VOL.crit);
    p.connect(pg); pg.connect(sfxGain);
    p.start(t); p.stop(t + 0.16);
  }

  function playPurchase(success) {
    if (!initialized || !enabled) return;
    resume();
    const t = now();
    if (success) {
      // heavy machine latch
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(160, t);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.14);
      const g = ctx.createGain();
      env(g, t, 0.003, 0.38, VOL.purchase);
      o.connect(g); g.connect(sfxGain);
      o.start(t); o.stop(t + 0.42);

      // metal strike transient
      const s = ctx.createOscillator();
      s.type = "triangle";
      s.frequency.value = 880;
      const sg = ctx.createGain();
      env(sg, t, 0.001, 0.06, VOL.purchase * 0.35);
      s.connect(sg); sg.connect(sfxGain);
      s.start(t); s.stop(t + 0.08);
    } else {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(85, t + 0.09);
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 400;
      const g = ctx.createGain();
      env(g, t, 0.005, 0.1, VOL.purchase * 0.3);
      o.connect(lp); lp.connect(g); g.connect(sfxGain);
      o.start(t); o.stop(t + 0.13);
    }
  }

  function playPrestige() {
    if (!initialized || !enabled) return;
    resume();
    const t = now();

    // mechanical sweep up with clicks
    const sweep = ctx.createOscillator();
    sweep.type = "sawtooth";
    sweep.frequency.setValueAtTime(60, t);
    sweep.frequency.exponentialRampToValueAtTime(900, t + 1.6);
    const sf = ctx.createBiquadFilter();
    sf.type = "lowpass";
    sf.frequency.setValueAtTime(400, t);
    sf.frequency.exponentialRampToValueAtTime(4000, t + 1.6);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.exponentialRampToValueAtTime(0.35, t + 1.4);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
    sweep.connect(sf); sf.connect(sg); sg.connect(sfxGain);
    sweep.start(t); sweep.stop(t + 2.0);

    // three bell strikes (the Turning)
    [1.7, 2.15, 2.6].forEach((offset) => {
      strikeBell(t + offset, 520, VOL.prestige * 0.85, 0.55);
    });

    // deep resonance after
    const deep = ctx.createOscillator();
    deep.type = "sine";
    deep.frequency.value = 42;
    const dg = ctx.createGain();
    env(dg, t + 2.9, 0.15, 1.6, VOL.prestige * 0.7);
    deep.connect(dg); dg.connect(sfxGain);
    deep.start(t + 2.9); deep.stop(t + 4.8);

    // and switch to Vigil track for 30s
    if (musicRunning) playVigilFor(30);
  }

  function strikeBell(t, freq, peak, decay) {
    const o1 = ctx.createOscillator(); o1.type = "sine"; o1.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = freq * 2.01;
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    const g = ctx.createGain();
    env(g, t, 0.002, decay, peak);
    o1.connect(g);
    o2.connect(g2); g2.connect(g);
    g.connect(sfxGain);
    o1.start(t); o1.stop(t + decay + 0.05);
    o2.start(t); o2.stop(t + decay + 0.05);
  }

  function playAchievement() {
    if (!initialized || !enabled) return;
    resume();
    const t = now();
    [440, 523].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      const g = ctx.createGain();
      const s = t + i * 0.09;
      env(g, s, 0.005, 0.35, VOL.achievement * 0.7);
      o.connect(g); g.connect(sfxGain);
      o.start(s); o.stop(s + 0.4);
    });
    const pad = ctx.createOscillator();
    pad.type = "sine"; pad.frequency.value = 220;
    const pg = ctx.createGain();
    env(pg, t, 0.08, 1.2, VOL.achievement * 0.35);
    pad.connect(pg); pg.connect(sfxGain);
    pad.start(t); pad.stop(t + 1.4);
  }

  function playWindowEnd() {
    if (!initialized || !enabled) return;
    resume();
    const t = now();
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(720, t);
    o.frequency.exponentialRampToValueAtTime(280, t + 0.45);
    const g = ctx.createGain();
    env(g, t, 0.01, 0.5, VOL.windowEnd);
    o.connect(g); g.connect(sfxGain);
    o.start(t); o.stop(t + 0.55);
  }

  function playRecord() {
    if (!initialized || !enabled) return;
    resume();
    const t = now();
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(30, t);
    const sg = ctx.createGain();
    env(sg, t, 0.01, 0.9, VOL.record);
    sub.connect(sg); sg.connect(sfxGain);
    sub.start(t); sub.stop(t + 1.0);

    const shim = ctx.createOscillator();
    shim.type = "triangle";
    shim.frequency.setValueAtTime(3200, t);
    shim.frequency.exponentialRampToValueAtTime(5200, t + 0.6);
    const shg = ctx.createGain();
    env(shg, t, 0.05, 0.7, VOL.record * 0.35);
    shim.connect(shg); shg.connect(sfxGain);
    shim.start(t); shim.stop(t + 0.8);
  }

  function playSessionStart() {
    if (!initialized || !enabled) return;
    resume();
    const t = now();
    const o = ctx.createOscillator();
    o.type = "sine"; o.frequency.value = 82;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(VOL.sessionStart, t + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);
    o.connect(g); g.connect(sfxGain);
    o.start(t); o.stop(t + 2.1);
  }

  function playHungerGlitch() {
    if (!initialized || !enabled) return;
    resume();
    const t = now();
    const n = ctx.createBufferSource();
    const len = Math.floor(ctx.sampleRate * 0.5);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const e = 1 - i / len;
      d[i] = (Math.random() * 2 - 1) * e * e;
    }
    n.buffer = b;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(2800, t + 0.3);
    f.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(VOL.hunger, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    n.connect(f); f.connect(g); g.connect(sfxGain);
    n.start(t); n.stop(t + 0.5);
  }

  /* =====================  ENABLE / DISABLE  ===================== */
  function setEnabled(on) {
    enabled = !!on;
    if (masterGain) {
      const t = now();
      masterGain.gain.cancelScheduledValues(t);
      masterGain.gain.setValueAtTime(masterGain.gain.value, t);
      masterGain.gain.linearRampToValueAtTime(enabled ? VOL.master : 0.0001, t + 0.15);
    }
    return enabled;
  }

  function isEnabled() { return enabled; }
  function isInitialized() { return initialized; }

  /* =====================  UNLOCK / START  ===================== */
  function unlockAndStart() {
    if (!init()) return false;
    resume();
    if (!musicRunning) startMusic();
    return true;
  }

  /* =====================  PUBLIC API  ===================== */
  global.VorifexAudio = {
    unlockAndStart,
    init,
    resume,
    tick,
    setEnabled,
    isEnabled,
    isInitialized,

    startMusic,
    stopMusic,
    playVigilFor,

    // SFX
    playTap,
    playCrit,
    playPurchase,
    playPrestige,
    playAchievement,
    playWindowEnd,
    playRecord,
    playSessionStart,
    playHungerGlitch,

    // aliases for backward compat
    startAmbient: startMusic,
    stopAmbient: stopMusic,
    refreshAmbientLayers: function () {}
  };

})(typeof window !== "undefined" ? window : globalThis);