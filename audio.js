/* =========================================================================
   VORIFEX'S TITHE — AUDIO ENGINE (audio.js) v1
   Synthesized soundscape via Web Audio API. No files, no CDN, offline-safe.

   Ambient layer: "The Chamber of Lapsed Hours" — evolving drone that adds
   layers as the player's Prestige count rises (cadet halls opening).

   Exposes global: window.VorifexAudio
   Depends on: window.VorifexEngine (for state reads only — no writes)
   ========================================================================= */

(function (global) {
  "use strict";

  /* =======================================================================
     BROWSER SUPPORT / GLOBAL STATE
     ======================================================================= */
  let ctx = null;                 // AudioContext
  let masterGain = null;          // global output
  let ambientGain = null;         // ambient bus
  let sfxGain = null;             // one-shot sfx bus

  let initialized = false;
  let ambientRunning = false;
  let enabled = true;             // toggled by settings (persisted elsewhere)

  // ambient layers currently active (keyed by prestige tier index)
  const activeAmbientLayers = new Set();
  let ambientNodes = [];          // tracked for teardown/rebuild
  let ambientLfo = null;
  let ambientLfoGain = null;

  /* =======================================================================
     VOLUME CONFIG
     ======================================================================= */
  const VOL = {
    master: 0.55,
    ambient: 0.28,
    sfx: 0.55,
    tap: 0.35,
    crit: 0.5,
    purchase: 0.5,
    prestige: 0.6,
    achievement: 0.5,
    window: 0.35,
    record: 0.5,
    sessionStart: 0.4,
    hunger: 0.45
  };

  /* =======================================================================
     LAZY INIT — must be called from a user gesture (first tap)
     ======================================================================= */
  function init() {
    if (initialized) return true;
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) {
      console.warn("VorifexAudio: Web Audio API not supported");
      return false;
    }
    try {
      ctx = new AC();
    } catch (e) {
      console.warn("VorifexAudio: AudioContext creation failed", e);
      return false;
    }

    masterGain = ctx.createGain();
    masterGain.gain.value = enabled ? VOL.master : 0;
    masterGain.connect(ctx.destination);

    ambientGain = ctx.createGain();
    ambientGain.gain.value = VOL.ambient;
    ambientGain.connect(masterGain);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = VOL.sfx;
    sfxGain.connect(masterGain);

    initialized = true;
    return true;
  }

  function resume() {
    if (!ctx) return;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  }

  /* =======================================================================
     UTILITIES
     ======================================================================= */
  function now() { return ctx.currentTime; }

  function safeDisconnect(node) {
    try { if (node && node.disconnect) node.disconnect(); } catch (e) {}
  }

  // envelope helper — attack + decay on a gain node
  function applyEnvelope(gainNode, t0, attack, decay, peak, sustainFloor) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + attack);
    g.exponentialRampToValueAtTime(
      Math.max(0.0001, sustainFloor !== undefined ? sustainFloor : 0.0001),
      t0 + attack + decay
    );
  }

  /* =======================================================================
     SFX — TAP (The Turning of the Staff)
     Short, dry, low metallic click. ~60ms. Never annoying.
     ======================================================================= */
  function playTap() {
    if (!initialized || !enabled) return;
    resume();
    const t0 = now();

    // Body: short triangle thud
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(220, t0);
    osc.frequency.exponentialRampToValueAtTime(90, t0 + 0.05);

    const g = ctx.createGain();
    applyEnvelope(g, t0, 0.002, 0.055, VOL.tap);

    osc.connect(g);
    g.connect(sfxGain);
    osc.start(t0);
    osc.stop(t0 + 0.08);

    // Click transient: very short noise burst
    const noise = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, 480, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    noise.buffer = buf;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 1800;
    noiseFilter.Q.value = 1.4;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.12, t0);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.02);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(sfxGain);
    noise.start(t0);
    noise.stop(t0 + 0.03);
  }

  /* =======================================================================
     SFX — CRIT (The Sovereign's Mark Flares)
     Doubled click + bright silver ping.
     ======================================================================= */
  function playCrit() {
    if (!initialized || !enabled) return;
    resume();
    const t0 = now();

    // Two short thuds, pitched up a step
    [280, 340].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      const start = t0 + idx * 0.025;
      osc.frequency.setValueAtTime(freq, start);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, start + 0.05);

      const g = ctx.createGain();
      applyEnvelope(g, start, 0.002, 0.05, VOL.crit * 0.6);

      osc.connect(g);
      g.connect(sfxGain);
      osc.start(start);
      osc.stop(start + 0.09);
    });

    // Silver ping (triangle high)
    const ping = ctx.createOscillator();
    ping.type = "triangle";
    ping.frequency.setValueAtTime(2400, t0);
    ping.frequency.exponentialRampToValueAtTime(3600, t0 + 0.08);

    const pingGain = ctx.createGain();
    applyEnvelope(pingGain, t0, 0.003, 0.13, VOL.crit);

    ping.connect(pingGain);
    pingGain.connect(sfxGain);
    ping.start(t0);
    ping.stop(t0 + 0.16);
  }

  /* =======================================================================
     SFX — PURCHASE (The Binding of the Shard)
     Low iron thunk + lead-grey fade.
     ======================================================================= */
  function playPurchase(success) {
    if (!initialized || !enabled) return;
    resume();
    const t0 = now();

    if (success) {
      // Heavy thunk
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(140, t0);
      osc.frequency.exponentialRampToValueAtTime(55, t0 + 0.12);

      const g = ctx.createGain();
      applyEnvelope(g, t0, 0.004, 0.35, VOL.purchase);

      osc.connect(g);
      g.connect(sfxGain);
      osc.start(t0);
      osc.stop(t0 + 0.4);

      // Grey tone layer underneath
      const grey = ctx.createOscillator();
      grey.type = "triangle";
      grey.frequency.value = 180;
      const greyGain = ctx.createGain();
      applyEnvelope(greyGain, t0 + 0.02, 0.05, 0.4, VOL.purchase * 0.4);
      grey.connect(greyGain);
      greyGain.connect(sfxGain);
      grey.start(t0 + 0.02);
      grey.stop(t0 + 0.5);
    } else {
      // Denied: dull low buzz, very short
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(110, t0);
      osc.frequency.exponentialRampToValueAtTime(90, t0 + 0.08);

      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 400;

      const g = ctx.createGain();
      applyEnvelope(g, t0, 0.005, 0.09, VOL.purchase * 0.3);

      osc.connect(lp);
      lp.connect(g);
      g.connect(sfxGain);
      osc.start(t0);
      osc.stop(t0 + 0.12);
    }
  }

  /* =======================================================================
     SFX — PRESTIGE (The Rendering)
     Big ceremonial event. Rising sweep → silence → deep resonance.
     Three bell strikes evoke Vorifex turning three times.
     ======================================================================= */
  function playPrestige() {
    if (!initialized || !enabled) return;
    resume();
    const t0 = now();

    // Rising sweep (gyro spin-up)
    const sweep = ctx.createOscillator();
    sweep.type = "sawtooth";
    sweep.frequency.setValueAtTime(60, t0);
    sweep.frequency.exponentialRampToValueAtTime(900, t0 + 1.6);

    const sweepFilter = ctx.createBiquadFilter();
    sweepFilter.type = "lowpass";
    sweepFilter.frequency.setValueAtTime(400, t0);
    sweepFilter.frequency.exponentialRampToValueAtTime(4000, t0 + 1.6);

    const sweepGain = ctx.createGain();
    sweepGain.gain.setValueAtTime(0.0001, t0);
    sweepGain.gain.exponentialRampToValueAtTime(0.35, t0 + 1.4);
    sweepGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.9);

    sweep.connect(sweepFilter);
    sweepFilter.connect(sweepGain);
    sweepGain.connect(sfxGain);
    sweep.start(t0);
    sweep.stop(t0 + 2.0);

    // Three bell strikes (Vorifex turns)
    [1.7, 2.15, 2.6].forEach((offset) => {
      strikeBell(t0 + offset, 520, VOL.prestige * 0.85, 0.55);
    });

    // Deep resonance after bells
    const deep = ctx.createOscillator();
    deep.type = "sine";
    deep.frequency.value = 42;
    const deepG = ctx.createGain();
    applyEnvelope(deepG, t0 + 2.9, 0.15, 1.6, VOL.prestige * 0.7);
    deep.connect(deepG);
    deepG.connect(sfxGain);
    deep.start(t0 + 2.9);
    deep.stop(t0 + 4.8);
  }

  // shared bell helper
  function strikeBell(t, freq, peak, decay) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;

    const harm = ctx.createOscillator();
    harm.type = "sine";
    harm.frequency.value = freq * 2.01;

    const harmG = ctx.createGain();
    harmG.gain.value = 0.35;

    const oscG = ctx.createGain();
    applyEnvelope(oscG, t, 0.002, decay, peak);

    osc.connect(oscG);
    harm.connect(harmG);
    harmG.connect(oscG);
    oscG.connect(sfxGain);

    osc.start(t); harm.start(t);
    osc.stop(t + decay + 0.05); harm.stop(t + decay + 0.05);
  }

  /* =======================================================================
     SFX — ACHIEVEMENT UNLOCK (The Ash Mark Ignites)
     Rising minor-third chime + soft crimson pad.
     ======================================================================= */
  function playAchievement() {
    if (!initialized || !enabled) return;
    resume();
    const t0 = now();

    // Two-note chime (minor third)
    [440, 523].forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = f;
      const g = ctx.createGain();
      const start = t0 + i * 0.09;
      applyEnvelope(g, start, 0.005, 0.35, VOL.achievement * 0.7);
      osc.connect(g);
      g.connect(sfxGain);
      osc.start(start);
      osc.stop(start + 0.4);
    });

    // Soft crimson pad underneath
    const pad = ctx.createOscillator();
    pad.type = "sine";
    pad.frequency.value = 220;
    const padG = ctx.createGain();
    applyEnvelope(padG, t0, 0.08, 1.2, VOL.achievement * 0.35);
    pad.connect(padG);
    padG.connect(sfxGain);
    pad.start(t0);
    pad.stop(t0 + 1.4);
  }

  /* =======================================================================
     SFX — WINDOW END (The Lapsed Hour closes)
     Single descending note.
     ======================================================================= */
  function playWindowEnd() {
    if (!initialized || !enabled) return;
    resume();
    const t0 = now();
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(660, t0);
    osc.frequency.exponentialRampToValueAtTime(330, t0 + 0.4);
    const g = ctx.createGain();
    applyEnvelope(g, t0, 0.02, 0.5, VOL.window);
    osc.connect(g);
    g.connect(sfxGain);
    osc.start(t0);
    osc.stop(t0 + 0.55);
  }

  /* =======================================================================
     SFX — NEW RECORD (The Lapse)
     Sub-bass thud + high shimmer.
     ======================================================================= */
  function playRecord() {
    if (!initialized || !enabled) return;
    resume();
    const t0 = now();

    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(30, t0);
    const subG = ctx.createGain();
    applyEnvelope(subG, t0, 0.01, 0.9, VOL.record);
    sub.connect(subG);
    subG.connect(sfxGain);
    sub.start(t0);
    sub.stop(t0 + 1.0);

    const shim = ctx.createOscillator();
    shim.type = "triangle";
    shim.frequency.setValueAtTime(3200, t0);
    shim.frequency.exponentialRampToValueAtTime(5200, t0 + 0.6);
    const shimG = ctx.createGain();
    applyEnvelope(shimG, t0, 0.05, 0.7, VOL.record * 0.35);
    shim.connect(shimG);
    shimG.connect(sfxGain);
    shim.start(t0);
    shim.stop(t0 + 0.8);
  }

  /* =======================================================================
     SFX — SESSION START (The Daily Stilling)
     Brief low drone, in-and-out, ~2 seconds.
     ======================================================================= */
  function playSessionStart() {
    if (!initialized || !enabled) return;
    resume();
    const t0 = now();

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 82;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(VOL.sessionStart, t0 + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.0);

    osc.connect(g);
    g.connect(sfxGain);
    osc.start(t0);
    osc.stop(t0 + 2.1);
  }

  /* =======================================================================
     SFX — BOUND HUNGER (easter egg — 1 in ~1000 taps)
     A half-second warp — chaotic noise, cutting off.
     ======================================================================= */
  function playHungerGlitch() {
    if (!initialized || !enabled) return;
    resume();
    const t0 = now();

    const noise = ctx.createBufferSource();
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = 1 - i / len;
      data[i] = (Math.random() * 2 - 1) * env * env;
    }
    noise.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(400, t0);
    filter.frequency.exponentialRampToValueAtTime(2800, t0 + 0.3);
    filter.Q.value = 6;

    const g = ctx.createGain();
    g.gain.setValueAtTime(VOL.hunger, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);

    noise.connect(filter);
    filter.connect(g);
    g.connect(sfxGain);
    noise.start(t0);
    noise.stop(t0 + 0.5);
  }

  /* =======================================================================
     AMBIENT — THE CHAMBER OF LAPSED HOURS (evolving)
     Base drone always present. Additional layers added as Prestige rises.
     Each layer represents a "cadet hall opening" — more voices in the dark.
     ======================================================================= */

  // Layer thresholds tied to totalPrestiges count
  const AMBIENT_LAYERS = [
    { key: "foundation", minPrestige: 0,  build: buildFoundationLayer },
    { key: "silver",     minPrestige: 1,  build: buildSilverLayer },
    { key: "iron",       minPrestige: 5,  build: buildIronLayer },
    { key: "choir",      minPrestige: 15, build: buildChoirLayer },
    { key: "deep",       minPrestige: 40, build: buildDeepLayer },
    { key: "hunger",     minPrestige: 100, build: buildHungerLayer }
  ];

  function startAmbient() {
    if (!initialized || ambientRunning) return;
    ambientRunning = true;

    // Shared slow LFO that modulates filter on all layers (breathing)
    ambientLfo = ctx.createOscillator();
    ambientLfo.type = "sine";
    ambientLfo.frequency.value = 0.08; // ~12s cycle

    ambientLfoGain = ctx.createGain();
    ambientLfoGain.gain.value = 40; // filter swing in Hz

    ambientLfo.connect(ambientLfoGain);
    ambientLfo.start();

    // Build only the layers the player currently qualifies for
    refreshAmbientLayers();
  }

  function stopAmbient() {
    ambientRunning = false;
    activeAmbientLayers.clear();
    for (const n of ambientNodes) {
      try { n.stop && n.stop(); } catch (e) {}
      safeDisconnect(n);
    }
    ambientNodes = [];
    if (ambientLfo) { try { ambientLfo.stop(); } catch (e) {} safeDisconnect(ambientLfo); ambientLfo = null; }
    safeDisconnect(ambientLfoGain); ambientLfoGain = null;
  }

  function refreshAmbientLayers() {
    if (!ambientRunning) return;
    let prestige = 0;
    try {
      const st = global.VorifexEngine && global.VorifexEngine.state && global.VorifexEngine.state();
      prestige = (st && st.totalPrestiges) || 0;
    } catch (e) { prestige = 0; }

    for (const layer of AMBIENT_LAYERS) {
      const shouldBeActive = prestige >= layer.minPrestige;
      const isActive = activeAmbientLayers.has(layer.key);
      if (shouldBeActive && !isActive) {
        layer.build();
        activeAmbientLayers.add(layer.key);
      }
      // we do not remove layers once added — the Chamber only grows
    }
  }

  // -- Layer builders -----------------------------------------------------

  function makeDroneOsc(freq, type, gainLevel, detuneCents) {
    const osc = ctx.createOscillator();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    if (detuneCents) osc.detune.value = detuneCents;

    const g = ctx.createGain();
    g.gain.value = gainLevel;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 400;
    filter.Q.value = 0.6;

    // connect LFO to filter (if available)
    if (ambientLfoGain) {
      try { ambientLfoGain.connect(filter.frequency); } catch (e) {}
    }

    osc.connect(filter);
    filter.connect(g);
    g.connect(ambientGain);
    osc.start();

    ambientNodes.push(osc, g, filter);
  }

  function buildFoundationLayer() {
    // Two low sines, an octave apart, detuned slightly
    makeDroneOsc(55, "sine", 0.5, -4);
    makeDroneOsc(110, "sine", 0.3, +6);
  }

  function buildSilverLayer() {
    // Sparse high triangle rings
    const scheduleRing = () => {
      if (!ambientRunning || activeAmbientLayers.has("silver") === false) return;
      const t = now();
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = 1400 + Math.random() * 400;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);

      osc.connect(g);
      g.connect(ambientGain);
      osc.start(t);
      osc.stop(t + 3.6);
    };
    // schedule first ring and let game loop call refresh — we just do a self-scheduling setInterval
    const id = setInterval(scheduleRing, 7000);
    ambientNodes.push({ stop: () => clearInterval(id) });
  }

  function buildIronLayer() {
    // A low fifth, pulse through slow filter
    makeDroneOsc(82, "sawtooth", 0.08, 0);
    makeDroneOsc(123, "sine", 0.12, +3);
  }

  function buildChoirLayer() {
    // Three non-harmonic sines — "distant voices"
    makeDroneOsc(220, "sine", 0.05, -12);
    makeDroneOsc(277, "sine", 0.04, +8);
    makeDroneOsc(330, "sine", 0.03, -5);
  }

  function buildDeepLayer() {
    // Very low foundation
    makeDroneOsc(27.5, "sine", 0.35, 0);
  }

  function buildHungerLayer() {
    // Occasional sub-glitch — the Bound Hunger straining
    const id = setInterval(() => {
      if (!ambientRunning) return;
      const t = now();
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(40, t);
      osc.frequency.exponentialRampToValueAtTime(20, t + 0.35);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.08, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      osc.connect(g);
      g.connect(ambientGain);
      osc.start(t);
      osc.stop(t + 0.5);
    }, 22000);
    ambientNodes.push({ stop: () => clearInterval(id) });
  }

  /* =======================================================================
     PUBLIC CONTROL
     ======================================================================= */
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

  // Called every frame by game loop — cheaply re-checks whether new ambient
  // layers should be built (based on Prestige rising during play).
  let _refreshAccum = 0;
  function tick(dtSec) {
    if (!initialized || !ambientRunning) return;
    _refreshAccum += dtSec;
    if (_refreshAccum > 4) {
      _refreshAccum = 0;
      refreshAmbientLayers();
    }
  }

  /* =======================================================================
     INITIALIZATION — must be called on first user tap
     ======================================================================= */
  function unlockAndStart() {
    if (!init()) return false;
    resume();
    if (!ambientRunning) startAmbient();
    return true;
  }

  /* =======================================================================
     PUBLIC API
     ======================================================================= */
  global.VorifexAudio = {
    // lifecycle
    unlockAndStart,
    init,
    resume,
    tick,
    setEnabled,
    isEnabled,
    isInitialized,

    // sfx
    playTap,
    playCrit,
    playPurchase,
    playPrestige,
    playAchievement,
    playWindowEnd,
    playRecord,
    playSessionStart,
    playHungerGlitch,

    // ambient
    startAmbient,
    stopAmbient,
    refreshAmbientLayers
  };

})(typeof window !== "undefined" ? window : globalThis);