/* =========================================================================
   VORIFEX'S TITHE — AUDIO ENGINE (audio.js) v3
   "Ceremonial Machine" — long-form (~4:30) composition in A harmonic minor.
   Structured as: Intro → Build → Main → Bridge → Second Theme → Climax → Outro.
   90 BPM. Brighter palette: hand-bells, gong, dulcimer, high organ, choir.
   No audio files, no CDN, offline-safe. Exposes window.VorifexAudio.
   ========================================================================= */

(function (global) {
  "use strict";

  /* =====================  STATE  ===================== */
  let ctx = null;
  let masterGain = null;
  let musicGain = null;
  let sfxGain = null;

  let initialized = false;
  let enabled = true;

  let musicRunning = false;
  let schedulerInterval = null;
  let nextNoteTime = 0;
  let currentBar = 0;
  let currentStep = 0;
  let vigilTimeout = null;

  /* =====================  CONFIG  ===================== */
  const VOL = {
    master: 0.55,
    music: 0.42,
    sfx: 0.6,
    kick: 0.42,
    tom: 0.32,
    rim: 0.22,
    hat: 0.06,
    shaker: 0.07,
    handbells: 0.24,
    bell: 0.26,
    gong: 0.32,
    dulcimer: 0.24,
    organ: 0.24,
    highOrgan: 0.14,
    choir: 0.14,
    deepBell: 0.34,
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

  const BPM = 90;
  const BEAT_SEC = 60 / BPM;
  const BAR_SEC = BEAT_SEC * 4;
  const STEPS_PER_BAR = 16;
  const STEP_SEC = BAR_SEC / STEPS_PER_BAR;
  const LOOKAHEAD_MS = 25;
  const SCHEDULE_AHEAD_S = 0.15;

  /* =====================  CHORD TABLE (A harmonic minor family)  ===================== */
  const CHORDS = {
    Am:  { root: 110.00, third: 130.81, fifth: 164.81, high: 220.00 }, // A C E
    F:   { root: 87.31,  third: 110.00, fifth: 130.81, high: 174.61 }, // F A C
    E:   { root: 82.41,  third: 103.83, fifth: 123.47, high: 164.81 }, // E G# B  (harmonic minor V)
    Dm:  { root: 73.42,  third: 87.31,  fifth: 110.00, high: 146.83 }, // D F A
    G:   { root: 98.00,  third: 123.47, fifth: 146.83, high: 196.00 }, // G B D   (borrowed)
    Gs:  { root: 103.83, third: 130.81, fifth: 155.56, high: 207.65 }  // G# C D# (leading-tone)
  };

  /* =====================  SECTION PLAN  =====================
     Total = 104 bars = 277s ≈ 4:37 at 90 BPM                            */
  const SECTIONS = [
    { name: "intro",  bars: 8,  progression: ["Am","Am","F","F","E","E","Am","Am"] },
    { name: "build",  bars: 16, progression: ["Am","Am","F","F","E","E","Am","Am"] },
    { name: "main",   bars: 24, progression: ["Am","Am","F","F","E","E","Am","Am"] },
    { name: "bridge", bars: 16, progression: ["Dm","Dm","Am","Am","E","E","E","E"] },
    { name: "second", bars: 16, progression: ["F","F","Dm","Dm","E","E","Am","Am"] },
    { name: "climax", bars: 16, progression: ["Am","Am","F","F","E","E","E","E"] },
    { name: "outro",  bars: 8,  progression: ["Am","Am","F","F","E","E","Am","Am"] }
  ];

  const TOTAL_BARS = SECTIONS.reduce((s, x) => s + x.bars, 0);

  /* =====================  MELODIES  ===================== */
  // Each note: { bar (0-7 within 8-bar phrase), step (0-15), freq, voice }
  const MELODIES = {
    main: [
      // Am
      { bar:0, step:0,  freq:659.25, voice:"dulcimer" }, // E5
      { bar:0, step:4,  freq:880.00, voice:"dulcimer" }, // A5
      { bar:0, step:6,  freq:1046.50,voice:"dulcimer" }, // C6
      { bar:0, step:8,  freq:987.77, voice:"dulcimer" }, // B5
      { bar:0, step:10, freq:880.00, voice:"dulcimer" }, // A5
      { bar:1, step:0,  freq:830.61, voice:"bell"     }, // G#5
      { bar:1, step:4,  freq:659.25, voice:"dulcimer" }, // E5
      { bar:1, step:8,  freq:880.00, voice:"dulcimer" }, // A5
      // F
      { bar:2, step:0,  freq:698.46, voice:"dulcimer" }, // F5
      { bar:2, step:4,  freq:880.00, voice:"dulcimer" }, // A5
      { bar:2, step:6,  freq:1046.50,voice:"bell"     }, // C6
      { bar:2, step:8,  freq:987.77, voice:"dulcimer" }, // B5
      { bar:3, step:0,  freq:880.00, voice:"dulcimer" }, // A5
      { bar:3, step:6,  freq:830.61, voice:"bell"     }, // G#5
      { bar:3, step:10, freq:698.46, voice:"dulcimer" }, // F5
      // E
      { bar:4, step:0,  freq:659.25, voice:"dulcimer" }, // E5
      { bar:4, step:2,  freq:830.61, voice:"dulcimer" }, // G#5
      { bar:4, step:4,  freq:987.77, voice:"bell"     }, // B5
      { bar:4, step:8,  freq:1046.50,voice:"dulcimer" }, // C6
      { bar:5, step:0,  freq:987.77, voice:"dulcimer" }, // B5
      { bar:5, step:4,  freq:880.00, voice:"dulcimer" }, // A5
      { bar:5, step:8,  freq:830.61, voice:"bell"     }, // G#5
      // Am
      { bar:6, step:0,  freq:880.00, voice:"dulcimer" }, // A5
      { bar:6, step:2,  freq:1046.50,voice:"dulcimer" }, // C6
      { bar:6, step:4,  freq:1318.51,voice:"bell"     }, // E6
      { bar:6, step:8,  freq:880.00, voice:"dulcimer" }, // A5
      { bar:7, step:4,  freq:659.25, voice:"dulcimer" }, // E5
      { bar:7, step:8,  freq:880.00, voice:"dulcimer" }  // A5
    ],
    bridge: [
      // Dm
      { bar:0, step:0,  freq:880.00, voice:"bell"     }, // A5
      { bar:0, step:4,  freq:1318.51,voice:"bell"     }, // E6
      { bar:0, step:6,  freq:1046.50,voice:"bell"     }, // C6
      { bar:0, step:8,  freq:880.00, voice:"bell"     }, // A5
      { bar:1, step:0,  freq:698.46, voice:"bell"     }, // F5
      { bar:1, step:4,  freq:880.00, voice:"bell"     }, // A5
      { bar:1, step:8,  freq:1046.50,voice:"bell"     }, // C6
      // Am
      { bar:2, step:0,  freq:1046.50,voice:"bell"     }, // C6
      { bar:2, step:4,  freq:987.77, voice:"bell"     }, // B5
      { bar:2, step:8,  freq:880.00, voice:"bell"     }, // A5
      { bar:3, step:0,  freq:830.61, voice:"bell"     }, // G#5
      { bar:3, step:4,  freq:987.77, voice:"bell"     }, // B5
      { bar:3, step:8,  freq:1318.51,voice:"bell"     }, // E6
      // E x4
      { bar:4, step:0,  freq:987.77, voice:"bell"     },
      { bar:5, step:0,  freq:880.00, voice:"bell"     },
      { bar:5, step:8,  freq:830.61, voice:"bell"     },
      { bar:6, step:0,  freq:987.77, voice:"bell"     },
      { bar:7, step:0,  freq:1318.51,voice:"bell"     }
    ],
    second: [
      // F
      { bar:0, step:0,  freq:698.46, voice:"dulcimer" }, // F5
      { bar:0, step:4,  freq:880.00, voice:"dulcimer" }, // A5
      { bar:0, step:8,  freq:1046.50,voice:"dulcimer" }, // C6
      { bar:1, step:2,  freq:880.00, voice:"dulcimer" }, // A5
      { bar:1, step:6,  freq:698.46, voice:"dulcimer" }, // F5
      { bar:1, step:10, freq:1046.50,voice:"bell"     }, // C6
      // Dm
      { bar:2, step:0,  freq:587.33, voice:"dulcimer" }, // D5
      { bar:2, step:4,  freq:698.46, voice:"dulcimer" }, // F5
      { bar:2, step:8,  freq:880.00, voice:"dulcimer" }, // A5
      { bar:3, step:2,  freq:698.46, voice:"dulcimer" },
      { bar:3, step:6,  freq:587.33, voice:"dulcimer" },
      { bar:3, step:10, freq:880.00, voice:"bell"     },
      // E
      { bar:4, step:0,  freq:659.25, voice:"dulcimer" }, // E5
      { bar:4, step:4,  freq:830.61, voice:"dulcimer" }, // G#5
      { bar:4, step:8,  freq:987.77, voice:"bell"     }, // B5
      { bar:5, step:2,  freq:659.25, voice:"dulcimer" },
      { bar:5, step:4,  freq:987.77, voice:"bell"     },
      { bar:5, step:8,  freq:1046.50,voice:"dulcimer" },
      // Am
      { bar:6, step:0,  freq:880.00, voice:"dulcimer" },
      { bar:6, step:4,  freq:659.25, voice:"dulcimer" },
      { bar:6, step:8,  freq:880.00, voice:"dulcimer" },
      { bar:7, step:0,  freq:1046.50,voice:"bell"     },
      { bar:7, step:4,  freq:880.00, voice:"bell"     }
    ]
  };

  /* =====================  INIT / RESUME  ===================== */
  function init() {
    if (initialized) return true;
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) { console.warn("VorifexAudio: no Web Audio API"); return false; }
    try { ctx = new AC(); }
    catch (e) { console.warn("VorifexAudio: ctx creation failed", e); return false; }

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

  function now() { return ctx.currentTime; }

  function env(g, t0, attack, decay, peak, floor) {
    const f = floor === undefined ? 0.0001 : floor;
    g.gain.cancelScheduledValues(t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + attack);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, f), t0 + attack + decay);
  }

  /* =====================  INSTRUMENTS  ===================== */
  function playKick(t, vol) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const g = ctx.createGain();
    env(g, t, 0.003, 0.28, vol);
    o.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + 0.34);

    const n = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, 220, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random()*2-1)*(1 - i/d.length);
    n.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 1500; bp.Q.value = 2;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vol*0.35, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    n.connect(bp); bp.connect(ng); ng.connect(musicGain);
    n.start(t); n.stop(t + 0.04);
  }

  function playTom(t, vol) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(170, t);
    o.frequency.exponentialRampToValueAtTime(85, t + 0.2);
    const g = ctx.createGain();
    env(g, t, 0.003, 0.34, vol);
    o.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + 0.4);
  }

  function playRim(t, vol) {
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = 1350;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
    o.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + 0.06);

    const o2 = ctx.createOscillator();
    o2.type = "triangle";
    o2.frequency.value = 860;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(vol * 0.5, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    o2.connect(g2); g2.connect(musicGain);
    o2.start(t); o2.stop(t + 0.05);
  }

  function playHat(t, vol) {
    const n = ctx.createBufferSource();
    const len = Math.floor(ctx.sampleRate * 0.05);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random()*2-1)*(1 - i/len);
    n.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    n.connect(hp); hp.connect(g); g.connect(musicGain);
    n.start(t); n.stop(t + 0.04);
  }

  function playShaker(t, vol) {
    const n = ctx.createBufferSource();
    const len = Math.floor(ctx.sampleRate * 0.045);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const e = Math.sin(i / len * Math.PI);
      d[i] = (Math.random()*2-1) * e;
    }
    n.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 4500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    n.connect(hp); hp.connect(g); g.connect(musicGain);
    n.start(t); n.stop(t + 0.05);
  }

  function playBell(t, freq, vol) {
    const o1 = ctx.createOscillator();
    o1.type = "triangle"; o1.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = "sine"; o2.frequency.value = freq * 2.01;
    const g2 = ctx.createGain(); g2.gain.value = 0.32;
    const g = ctx.createGain();
    env(g, t, 0.004, 1.3, vol);
    o1.connect(g);
    o2.connect(g2); g2.connect(g);
    g.connect(musicGain);
    o1.start(t); o1.stop(t + 1.4);
    o2.start(t); o2.stop(t + 1.4);
  }

  function playHandBells(t, baseFreq, vol) {
    // Cluster of small bells at close intervals
    const mults = [1, 1.19, 1.5];
    mults.forEach((m, i) => {
      const f = baseFreq * m;
      const o = ctx.createOscillator();
      o.type = "sine"; o.frequency.value = f;
      const g = ctx.createGain();
      const s = t + i * 0.012;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(vol, s + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 1.1);
      o.connect(g); g.connect(musicGain);
      o.start(s); o.stop(s + 1.2);
    });
  }

  function playGong(t, vol) {
    const partials = [1, 2.05, 3.01, 4.12, 5.4, 6.7];
    partials.forEach((m, i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = 130 * m;
      const g = ctx.createGain();
      const peak = vol / (i + 1.3);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
      o.connect(g); g.connect(musicGain);
      o.start(t); o.stop(t + 4.6);
    });
    const n = ctx.createBufferSource();
    const len = Math.floor(ctx.sampleRate * 0.12);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random()*2-1)*(1 - i/len);
    n.buffer = buf;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vol * 0.4, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    n.connect(ng); ng.connect(musicGain);
    n.start(t); n.stop(t + 0.13);
  }

  function playDulcimer(t, freq, vol) {
    const o = ctx.createOscillator();
    o.type = "triangle"; o.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = "sine"; o2.frequency.value = freq * 2;
    const g2 = ctx.createGain(); g2.gain.value = 0.28;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    o.connect(g);
    o2.connect(g2); g2.connect(g);
    g.connect(musicGain);
    o.start(t); o.stop(t + 0.9);
    o2.start(t); o2.stop(t + 0.9);

    // pluck transient
    const n = ctx.createBufferSource();
    const len = Math.floor(ctx.sampleRate * 0.03);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random()*2-1)*(1 - i/len);
    n.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = freq * 2.2; bp.Q.value = 3;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vol * 0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    n.connect(bp); bp.connect(ng); ng.connect(musicGain);
    n.start(t); n.stop(t + 0.04);
  }

  function playOrgan(t, freq, dur, vol) {
    const o1 = ctx.createOscillator(); o1.type = "sine"; o1.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = freq * 2;
    const o3 = ctx.createOscillator(); o3.type = "sine"; o3.frequency.value = freq * 1.5;
    const g2 = ctx.createGain(); g2.gain.value = 0.4;
    const g3 = ctx.createGain(); g3.gain.value = 0.2;
    const g = ctx.createGain();
    const a = Math.min(0.4, dur * 0.15);
    const r = Math.min(0.7, dur * 0.3);
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

  function playChoir(t, freq, dur, vol) {
    const mults = [1, 1.004, 0.996];
    mults.forEach((m) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq * m;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.5);
      g.gain.setValueAtTime(vol, t + dur - 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(musicGain);
      o.start(t); o.stop(t + dur + 0.05);
    });
  }

  function playDeepBell(t, vol) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(58, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 3.4);
    const g = ctx.createGain();
    env(g, t, 0.02, 3.5, vol);
    o.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + 3.7);
    const shim = ctx.createOscillator();
    shim.type = "triangle"; shim.frequency.value = 1180;
    const sg = ctx.createGain();
    env(sg, t, 0.01, 1.1, vol * 0.15);
    shim.connect(sg); sg.connect(musicGain);
    shim.start(t); shim.stop(t + 1.2);
  }

  /* =====================  SECTION LOOKUP  ===================== */
  function getSectionAtBar(bar) {
    let cum = 0;
    for (let i = 0; i < SECTIONS.length; i++) {
      const s = SECTIONS[i];
      if (bar < cum + s.bars) return { section: s, barInSection: bar - cum };
      cum += s.bars;
    }
    return { section: SECTIONS[0], barInSection: 0 };
  }

  function getChordAtBar(section, barInSection) {
    const idx = ((barInSection % section.progression.length) + section.progression.length) % section.progression.length;
    return CHORDS[section.progression[idx]] || CHORDS.Am;
  }

  /* =====================  PER-STEP SCHEDULER  ===================== */
  function scheduleStep(bar, stepInBar, t) {
    const { section, barInSection } = getSectionAtBar(bar);
    const chord = getChordAtBar(section, barInSection);
    const name = section.name;

    /* ---------- Sustained chord pads (every 2 bars) ---------- */
    if (stepInBar === 0 && barInSection % 2 === 0) {
      const padDur = BAR_SEC * 2;
      if (name !== "intro" && name !== "outro") {
        playOrgan(t, chord.root, padDur, VOL.organ * (name === "climax" ? 1 : 0.8));
      }
      if (name === "main" || name === "climax" || name === "second") {
        playOrgan(t, chord.high, padDur, VOL.highOrgan);
      }
      playChoir(t, chord.high / 2, padDur, VOL.choir * (name === "bridge" ? 1.3 : 1));
    }

    /* ---------- Drums ---------- */
    const drumsActive = ["build","main","second","climax"].includes(name);
    if (drumsActive) {
      if (stepInBar === 0) playKick(t, VOL.kick * (name === "build" ? 0.75 : 1));
      if (stepInBar === 6) playKick(t, VOL.kick * (name === "climax" ? 0.7 : 0.55));
      if (stepInBar === 8) playKick(t, VOL.kick * (name === "build" ? 0.6 : 0.9));
      if (stepInBar === 12) {
        if (name !== "build") playTom(t, VOL.tom * 0.9);
      }
      if (stepInBar === 4 || stepInBar === 14) {
        if (name !== "build") playRim(t, VOL.rim);
      }
      // hats on 8ths
      if (stepInBar % 2 === 0) playHat(t, VOL.hat);
      // shaker every 16th, lighter
      playShaker(t, VOL.shaker * 0.7);
    }

    // Bridge: minimal drums — just toms on beats 3 and 4
    if (name === "bridge") {
      if (stepInBar === 8) playTom(t, VOL.tom * 0.4);
      if (stepInBar === 12) playTom(t, VOL.tom * 0.45);
    }

    /* ---------- Hand bells (intro, bridge, outro) ---------- */
    if (name === "intro" || name === "outro") {
      if (stepInBar === 0) playHandBells(t, chord.high * 2, VOL.handbells * 0.75);
      if (stepInBar === 8) playHandBells(t, chord.high * 2.5, VOL.handbells * 0.5);
    }
    if (name === "bridge") {
      if (stepInBar === 0) playHandBells(t, chord.high * 2, VOL.handbells * 0.55);
      if (stepInBar === 8) playHandBells(t, chord.high * 2, VOL.handbells * 0.4);
    }

    /* ---------- Deep bells ---------- */
    if (stepInBar === 0 && barInSection % 4 === 0) {
      if (name === "intro" || name === "outro") playDeepBell(t, VOL.deepBell * 0.6);
      if (name === "bridge" && barInSection % 8 === 0) playDeepBell(t, VOL.deepBell * 0.7);
    }

    /* ---------- Gong hits at section boundaries ---------- */
    if (stepInBar === 0 && barInSection === 0) {
      if (name === "main") playGong(t, VOL.gong);
      if (name === "second") playGong(t, VOL.gong * 0.8);
      if (name === "climax") playGong(t, VOL.gong * 1.1);
      if (name === "outro") playGong(t, VOL.gong * 0.65);
    }

    /* ---------- Melody ---------- */
    let melodyKey = null;
    if (name === "build" || name === "main" || name === "climax") melodyKey = "main";
    else if (name === "bridge") melodyKey = "bridge";
    else if (name === "second") melodyKey = "second";

    if (melodyKey) {
      const mel = MELODIES[melodyKey];
      if (mel) {
        for (let i = 0; i < mel.length; i++) {
          const n = mel[i];
          if (n.bar === barInSection % 8 && n.step === stepInBar) {
            if (n.voice === "bell") playBell(t, n.freq, VOL.bell);
            else playDulcimer(t, n.freq, VOL.dulcimer);
          }
        }
      }
    }
  }

  /* =====================  ADVANCE / SCHEDULER  ===================== */
  function advanceStep() {
    currentStep++;
    if (currentStep >= STEPS_PER_BAR) {
      currentStep = 0;
      currentBar++;
      if (currentBar >= TOTAL_BARS) currentBar = 0;
    }
    nextNoteTime += STEP_SEC;
  }

  function schedulerTick() {
    if (!ctx || !musicRunning) return;
    while (nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
      scheduleStep(currentBar, currentStep, nextNoteTime);
      advanceStep();
    }
  }

  function startMusic() {
    if (!initialized || musicRunning) return;
    musicRunning = true;
    currentBar = 0;
    currentStep = 0;
    nextNoteTime = ctx.currentTime + 0.2;
    if (schedulerInterval) clearInterval(schedulerInterval);
    schedulerInterval = setInterval(schedulerTick, LOOKAHEAD_MS);
  }

  function stopMusic() {
    musicRunning = false;
    if (schedulerInterval) { clearInterval(schedulerInterval); schedulerInterval = null; }
  }

  function playVigilFor(seconds) {
    // v3 uses a single long-form composition; kept for API compatibility.
    // No-op for now.
  }

  function tick(dtSec) { /* scheduler runs on its own interval */ }

  /* =====================  SFX (unchanged from v2)  ===================== */
  function playTap() {
    if (!initialized || !enabled) return;
    resume();
    const t = now();
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.05);
    const g = ctx.createGain();
    env(g, t, 0.002, 0.055, VOL.tap);
    o.connect(g); g.connect(sfxGain);
    o.start(t); o.stop(t + 0.08);
    const n = ctx.createBufferSource();
    const b = ctx.createBuffer(1, 480, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random()*2-1)*(1 - i/d.length);
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
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(160, t);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.14);
      const g = ctx.createGain();
      env(g, t, 0.003, 0.38, VOL.purchase);
      o.connect(g); g.connect(sfxGain);
      o.start(t); o.stop(t + 0.42);
      const s = ctx.createOscillator();
      s.type = "triangle"; s.frequency.value = 880;
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
    [1.7, 2.15, 2.6].forEach((off) => strikeBell(t + off, 520, VOL.prestige * 0.85, 0.55));
    const deep = ctx.createOscillator();
    deep.type = "sine"; deep.frequency.value = 42;
    const dg = ctx.createGain();
    env(dg, t + 2.9, 0.15, 1.6, VOL.prestige * 0.7);
    deep.connect(dg); dg.connect(sfxGain);
    deep.start(t + 2.9); deep.stop(t + 4.8);
    // Gong flourish on prestige
    playGong(t + 0.2, VOL.gong * 0.9);
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
      o.type = "triangle"; o.frequency.value = f;
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
    sub.type = "sine"; sub.frequency.setValueAtTime(30, t);
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
      d[i] = (Math.random()*2-1) * e * e;
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

    playTap,
    playCrit,
    playPurchase,
    playPrestige,
    playAchievement,
    playWindowEnd,
    playRecord,
    playSessionStart,
    playHungerGlitch,

    // aliases for backward compatibility
    startAmbient: startMusic,
    stopAmbient: stopMusic,
    refreshAmbientLayers: function () {}
  };

})(typeof window !== "undefined" ? window : globalThis);