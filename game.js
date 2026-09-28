/* =========================================================================
   VORIFEX'S TITHE — GAME SHELL (game.js)
   Wires engine.js math to a canvas-based UI. No CDN, no backend, offline.
   ========================================================================= */

(function () {
  "use strict";

  const Engine = window.VorifexEngine;
  const BigNum = Engine.BigNum;

  /* ---------------- DOM references ---------------- */
  const statDevotion   = document.getElementById("statDevotion");
  const statStash       = document.getElementById("statStash");
  const statRate         = document.getElementById("statRate");
  const statCritChance = document.getElementById("statCritChance");
  const statCritRange   = document.getElementById("statCritRange");
  const statWindow       = document.getElementById("statWindow");
  const statProjection   = document.getElementById("statProjection");
  const saveStatus         = document.getElementById("saveStatus");

  const btnPath1 = document.getElementById("btnPath1");
  const btnPath2 = document.getElementById("btnPath2");
  const btnPath3 = document.getElementById("btnPath3");
  const lvlEls   = { 1: document.getElementById("lvlPath1"), 2: document.getElementById("lvlPath2"), 3: document.getElementById("lvlPath3") };
  const costEls  = { 1: document.getElementById("costPath1"), 2: document.getElementById("costPath2"), 3: document.getElementById("costPath3") };

  const btnPrestige = document.getElementById("btnPrestige");
  const btnDebug     = document.getElementById("btnDebugAchievement");

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  /* ---------------- Canvas sizing (responsive, crisp) ---------------- */
  let cw = 0, ch = 0;
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cw = rect.width; ch = rect.height;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  /* ---------------- Particle system (tap feedback) ---------------- */
  const particles = [];
  function spawnParticle(x, y, text, isCrit) {
    particles.push({
      x, y,
      vy: -40 - Math.random() * 20,
      vx: (Math.random() - 0.5) * 20,
      life: 1.0,
      text,
      isCrit,
      size: isCrit ? 20 : 15
    });
  }

  function updateParticles(dtSec) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;
      p.life -= dtSec * 1.1;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.isCrit ? "#ffd257" : "#e6e8f0";
      ctx.font = `bold ${p.size}px -apple-system, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(p.text, p.x, p.y);
      ctx.globalAlpha = 1;
    }
  }

  /* ---------------- Sweet-spot sigma (visual only, no exact number shown) ---------------- */
  function computeSigma() {
    const state = Engine.state();
    const cfg = Engine.CONFIG.prestige;
    const D = state.devotion, S = state.stash;
    const x = D.lnPlus1();
    const lnS1 = S.lnPlus1();
    const k = cfg.k0 * (1 + cfg.alpha * lnS1);
    const mu = cfg.mu0 + cfg.beta * lnS1;
    return 1 / (1 + Math.exp(-k * (x - mu)));
  }

  /* ---------------- Core orb rendering ---------------- */
  let pulsePhase = 0;
  let tapFlash = 0; // 0..1, decays after tap

  function drawCore(dtSec) {
    ctx.clearRect(0, 0, cw, ch);

    const cx = cw / 2, cy = ch / 2;
    const baseRadius = Math.min(cw, ch) * 0.22;

    pulsePhase += dtSec * 1.6;
    const pulse = Math.sin(pulsePhase) * 3;

    const sigma = computeSigma(); // 0..1 proximity to sweet spot
    tapFlash = Math.max(0, tapFlash - dtSec * 2.2);

    // Outer sweet-spot ring (color intensity = sigma, NOT a number readout)
    const ringRadius = baseRadius + 26;
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
    const ringHue = 250 - sigma * 100; // shifts purple -> gold-ish as sigma rises
    ctx.strokeStyle = `hsla(${ringHue}, 80%, ${55 + sigma * 15}%, ${0.35 + sigma * 0.4})`;
    ctx.lineWidth = 4 + sigma * 6;
    ctx.stroke();

    // Core body
    const radius = baseRadius + pulse + tapFlash * 10;
    const grad = ctx.createRadialGradient(cx, cy - radius * 0.3, radius * 0.1, cx, cy, radius);
    grad.addColorStop(0, `rgba(200, 180, 255, ${0.9 + tapFlash * 0.1})`);
    grad.addColorStop(0.5, `rgba(124, 92, 255, 0.85)`);
    grad.addColorStop(1, `rgba(40, 20, 80, 0.9)`);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Inner shimmer facets
    ctx.save();
    ctx.globalAlpha = 0.15 + tapFlash * 0.25;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const ang = pulsePhase * 0.3 + (i * Math.PI * 2) / 5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * radius * 0.9, cy + Math.sin(ang) * radius * 0.9);
      ctx.stroke();
    }
    ctx.restore();

    drawParticles();
  }

  /* ---------------- Formatting helpers ---------------- */
  function fmtSeconds(s) {
    s = Math.max(0, Math.ceil(s));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  }

  /* ---------------- HUD update ---------------- */
  function updateHUD() {
    const state = Engine.state();
    const now = Date.now();

    statDevotion.textContent = state.devotion.toString();
    statStash.textContent = state.stash.toString();

    const rate = Engine.devotionGenerationRate(state.stash, state.levels.path2, state.levels.path3);
    statRate.textContent = BigNum.fromNumber(rate).toString() + "/s";

    const chance = Engine.critChance(state.levels.path1) * 100;
    statCritChance.textContent = chance.toFixed(1) + "%";

    const range = Engine.critRange(state.levels.path1);
    statCritRange.textContent = `${range.min.toFixed(2)}x - ${range.max.toFixed(2)}x`;

    state.window.tick(now);
    if (state.window.active) {
      const remaining = state.window.remainingSeconds(now);
      statWindow.textContent = `ACTIVE x${state.window.multiplier.toFixed(2)} — ${fmtSeconds(remaining)} left`;
      statWindow.style.color = "#ffd257";
    } else {
      statWindow.textContent = "inactive";
      statWindow.style.color = "";
    }

    const proj = Engine.getProjectionNow(now);
    if (!proj.visible) {
      statProjection.textContent = "Locked (build more Devotion)";
    } else if (proj.windowActive) {
      statProjection.textContent = `${proj.base.toString()}  →  ${proj.boosted.toString()} (window active)`;
    } else {
      statProjection.textContent = proj.base.toString();
    }

    // Upgrade buttons
    updateUpgradeButton(1, btnPath1, Engine.cost1(state.levels.path1 + 1));
    updateUpgradeButton(2, btnPath2, Engine.cost2(state.levels.path2 + 1));
    updateUpgradeButton(3, btnPath3, Engine.cost3(state.levels.path3 + 1, state.stash));
  }

  function updateUpgradeButton(path, btnEl, priceBigNum) {
    const state = Engine.state();
    lvlEls[path].textContent = `Lv. ${state.levels["path" + path]}`;
    costEls[path].textContent = `Cost: ${priceBigNum.toString()}`;
    const affordable = state.stash.gte(priceBigNum);
    btnEl.classList.toggle("affordable", affordable);
    btnEl.classList.toggle("unaffordable", !affordable);
  }

  function flashButton(btnEl, success) {
    btnEl.classList.remove("flashSuccess", "flashFail");
    btnEl.classList.add(success ? "flashSuccess" : "flashFail");
    setTimeout(() => btnEl.classList.remove("flashSuccess", "flashFail"), 260);
  }

  /* ---------------- Input handling ---------------- */
  function handleTap(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const result = Engine.tap();
    tapFlash = 1;

    const label = result.hit ? `+${result.multiplier.toFixed(2)}x CRIT!` : "+1";
    spawnParticle(x, y, label, result.hit);
  }

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    handleTap(e.clientX, e.clientY);
  });

  [1, 2, 3].forEach((path) => {
    const btn = document.getElementById("btnPath" + path);
    btn.addEventListener("click", () => {
      const res = Engine.buyUpgrade(path);
      flashButton(btn, res.success);
      updateHUD();
    });
  });

  btnPrestige.addEventListener("click", () => {
    const state = Engine.state();
    if (state.devotion.toNumber() <= 0) return;
    const payout = Engine.prestige();
    spawnParticle(cw / 2, ch / 2, `+${payout.toString()} Tithe!`, true);
    updateHUD();
  });

  /* Debug: cycles through achievement difficulty tiers */
  let debugTierIndex = 0;
  btnDebug.addEventListener("click", () => {
    const tiers = Engine.CONFIG.achievements.tiers;
    const tier = tiers[debugTierIndex % tiers.length];
    debugTierIndex++;
    Engine.triggerAchievement(tier.difficulty);
    btnDebug.textContent = `Debug: Triggered "${tier.name}"`;
    setTimeout(() => { btnDebug.textContent = "Debug: Trigger Window"; }, 1200);
    updateHUD();
  });

  /* ---------------- Persistence ---------------- */
  function doSave() {
    const ok = Engine.saveState();
    saveStatus.textContent = ok ? `Saved ${new Date().toLocaleTimeString()}` : "Save failed";
  }

  Engine.loadState();
  saveStatus.textContent = "Loaded";

  setInterval(doSave, 15000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") doSave();
    else Engine.update(Date.now()); // reconcile offline-ish gap on return
  });
  window.addEventListener("beforeunload", doSave);

  /* ---------------- Main loop ---------------- */
  let lastFrameTs = performance.now();

  function frame(ts) {
    const dtSec = Math.min(0.25, (ts - lastFrameTs) / 1000);
    lastFrameTs = ts;

    Engine.update(Date.now());
    updateParticles(dtSec);
    drawCore(dtSec);
    updateHUD();

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

})();