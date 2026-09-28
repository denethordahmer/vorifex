/* =========================================================================
   VORIFEX'S TITHE — GAME SHELL (game.js) v3
   Tabbed UI + audio hooks + settings wiring + achievement rendering.
   ========================================================================= */

(function () {
  "use strict";

  const Engine = window.VorifexEngine;
  const Audio  = window.VorifexAudio;
  const BigNum = Engine.BigNum;

  /* ---------------- DOM: top bar ---------------- */
  const statDevotion = document.getElementById("statDevotion");
  const statStash    = document.getElementById("statStash");
  const statRate     = document.getElementById("statRate");
  const statCritChance = document.getElementById("statCritChance");
  const statCritRange  = document.getElementById("statCritRange");
  const statProjection    = document.getElementById("statProjection");
  const statProjectionSub = document.getElementById("statProjectionSub");

  /* ---------------- DOM: upgrades ---------------- */
  const btnPath1 = document.getElementById("btnPath1");
  const btnPath2 = document.getElementById("btnPath2");
  const btnPath3 = document.getElementById("btnPath3");
  const lvlEls  = { 1: document.getElementById("lvlPath1"), 2: document.getElementById("lvlPath2"), 3: document.getElementById("lvlPath3") };
  const costEls = { 1: document.getElementById("costPath1"), 2: document.getElementById("costPath2"), 3: document.getElementById("costPath3") };

  /* ---------------- DOM: achievements ---------------- */
  const achList        = document.getElementById("achList");
  const achProgressText= document.getElementById("achProgressText");
  const achPassivePill = document.getElementById("achPassivePill");
  const achFilters     = document.querySelectorAll(".filterChip");

  /* ---------------- DOM: actions / tabs ---------------- */
  const btnPrestige = document.getElementById("btnPrestige");
  const tabButtons  = document.querySelectorAll(".tabBtn");
  const views       = {
    tap: document.getElementById("viewTap"),
    upgrades: document.getElementById("viewUpgrades"),
    achievements: document.getElementById("viewAchievements"),
    settings: document.getElementById("viewSettings")
  };

  /* ---------------- DOM: window banner / toasts ---------------- */
  const windowBanner      = document.getElementById("windowBanner");
  const windowBannerLabel = document.getElementById("windowBannerLabel");
  const windowBannerMult  = document.getElementById("windowBannerMult");
  const windowBannerTimer = document.getElementById("windowBannerTimer");
  const toastStack        = document.getElementById("toastStack");

  /* ---------------- DOM: settings ---------------- */
  const toggleAudio     = document.getElementById("toggleAudio");
  const audioStatusText = document.getElementById("audioStatusText");
  const btnManualSave   = document.getElementById("btnManualSave");
  const btnResetSave    = document.getElementById("btnResetSave");
  const aboutLine       = document.getElementById("aboutLine");

  /* ---------------- DOM: save ---------------- */
  const saveStatus = document.getElementById("saveStatus");

  /* ---------------- Canvas ---------------- */
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

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

  /* ---------------- Particles ---------------- */
  const particles = [];
  function spawnParticle(x, y, text, isCrit) {
    particles.push({
      x, y,
      vy: -50 - Math.random() * 25,
      vx: (Math.random() - 0.5) * 24,
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
      p.life -= dtSec * 1.15;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }
  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.isCrit ? "#ffd257" : "#eef0f7";
      ctx.font = `bold ${p.size}px -apple-system, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(p.text, p.x, p.y);
      ctx.globalAlpha = 1;
    }
  }

  /* ---------------- Sigma (visual only) ---------------- */
  function computeSigma() {
    const state = Engine.state();
    const cfg = Engine.CONFIG.prestige;
    const x = state.devotion.lnPlus1();
    const lnS1 = state.stash.lnPlus1();
    const k = cfg.k0 * (1 + cfg.alpha * lnS1);
    const mu = cfg.mu0 + cfg.beta * lnS1;
    return 1 / (1 + Math.exp(-k * (x - mu)));
  }

  /* ---------------- Orb render ---------------- */
  let pulsePhase = 0;
  let tapFlash = 0;

  function drawCore(dtSec) {
    ctx.clearRect(0, 0, cw, ch);

    const cx = cw / 2, cy = ch / 2;
    const baseRadius = Math.min(cw, ch) * 0.22;

    pulsePhase += dtSec * 1.6;
    const pulse = Math.sin(pulsePhase) * 3;

    const sigma = computeSigma();
    tapFlash = Math.max(0, tapFlash - dtSec * 2.2);

    const ringRadius = baseRadius + 26;
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
    const ringHue = 250 - sigma * 100;
    ctx.strokeStyle = `hsla(${ringHue}, 80%, ${55 + sigma * 15}%, ${0.35 + sigma * 0.4})`;
    ctx.lineWidth = 4 + sigma * 6;
    ctx.stroke();

    const radius = baseRadius + pulse + tapFlash * 10;
    const grad = ctx.createRadialGradient(cx, cy - radius * 0.3, radius * 0.1, cx, cy, radius);
    grad.addColorStop(0, `rgba(210, 190, 255, ${0.9 + tapFlash * 0.1})`);
    grad.addColorStop(0.5, `rgba(124, 92, 255, 0.85)`);
    grad.addColorStop(1, `rgba(35, 18, 72, 0.9)`);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

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

  /* ---------------- Helpers ---------------- */
  function fmtSeconds(s) {
    s = Math.max(0, Math.ceil(s));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  }

  function fmtNumber(n) {
    if (!isFinite(n)) return "∞";
    if (n < 1000) return Math.floor(n).toString();
    return BigNum.fromNumber(n).toString();
  }

  /* ---------------- TABS ---------------- */
  let activeTab = "tap";

  function switchTab(tab) {
    activeTab = tab;
    Object.keys(views).forEach(k => {
      views[k].classList.toggle("active", k === tab);
    });
    tabButtons.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });
    if (tab === "achievements") renderAchievements();
    if (tab === "upgrades") updateUpgradeButtons();
    if (tab === "settings") refreshSettingsUI();
  }

  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  /* ---------------- Upgrades ---------------- */
  function updateUpgradeButtons() {
    const state = Engine.state();
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
    setTimeout(() => btnEl.classList.remove("flashSuccess", "flashFail"), 280);
  }

  [1, 2, 3].forEach((path) => {
    const btn = document.getElementById("btnPath" + path);
    btn.addEventListener("click", () => {
      const res = Engine.buyUpgrade(path);
      flashButton(btn, res.success);
      if (Audio) Audio.playPurchase(res.success);
      updateHUD();
      updateUpgradeButtons();
    });
  });

  /* ---------------- Achievements rendering ---------------- */
  let achFilter = "all";

  achFilters.forEach(chip => {
    chip.addEventListener("click", () => {
      achFilter = chip.dataset.filter;
      achFilters.forEach(c => c.classList.toggle("active", c === chip));
      renderAchievements();
    });
  });

  function renderAchievements() {
    const state = Engine.state();
    const unlockedSet = new Set(state.achievementsUnlocked);
    const total = Engine.ACHIEVEMENTS.length;
    const unlockedCount = state.achievementsUnlocked.length;

    achProgressText.textContent = `${unlockedCount} / ${total} unlocked`;

    const passivePct = (Engine.achievementPassiveMultiplier() - 1) * 100;
    achPassivePill.textContent = `+${passivePct.toFixed(1)}% Prestige`;

    const frag = document.createDocumentFragment();

    for (const def of Engine.ACHIEVEMENTS) {
      const isUnlocked = unlockedSet.has(def.id);
      if (achFilter === "unlocked" && !isUnlocked) continue;
      if (achFilter === "locked" && isUnlocked) continue;

      const card = document.createElement("div");
      card.className = "achCard " + (isUnlocked ? "unlocked" : "locked");

      const tierInfo = Engine.getTierInfo(def.tier);
      const tierEl = document.createElement("div");
      tierEl.className = "achTier tier-" + def.tier;
      tierEl.textContent = tierInfo.name.slice(0, 4);

      const body = document.createElement("div");
      body.className = "achBody";

      const nameEl = document.createElement("div");
      nameEl.className = "achName";
      nameEl.textContent = def.name;
      if (isUnlocked) {
        const check = document.createElement("span");
        check.className = "achCheck";
        check.textContent = "✓";
        nameEl.appendChild(check);
      }

      const descEl = document.createElement("div");
      descEl.className = "achDesc";
      descEl.textContent = def.desc;

      body.appendChild(nameEl);
      body.appendChild(descEl);

      if (!isUnlocked) {
        let current = 0;
        try { current = def.check(state); } catch (e) { current = 0; }
        if (typeof current !== "number" || !isFinite(current)) current = 0;

        const progEl = document.createElement("div");
        progEl.className = "achProg";
        const cur = Math.min(current, def.target);
        progEl.textContent = `${fmtNumber(cur)} / ${fmtNumber(def.target)}`;
        body.appendChild(progEl);
      } else {
        const bonusEl = document.createElement("div");
        bonusEl.className = "achBonus";
        bonusEl.textContent = `+${(tierInfo.passiveBonus * 100).toFixed(1)}% passive Prestige`;
        body.appendChild(bonusEl);
      }

      card.appendChild(tierEl);
      card.appendChild(body);
      frag.appendChild(card);
    }

    achList.innerHTML = "";
    achList.appendChild(frag);
  }

  /* ---------------- HUD ---------------- */
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
    statCritRange.textContent = `${range.min.toFixed(2)}x–${range.max.toFixed(2)}x`;

    state.window.tick(now);
    const proj = Engine.getProjectionNow(now);

    if (!proj.visible) {
      statProjection.textContent = "Locked";
      statProjectionSub.textContent = "Build more Devotion to reveal.";
    } else {
      statProjection.textContent = proj.boosted.toString();
      const parts = [];
      if (proj.windowActive) parts.push(`window x${proj.windowMult.toFixed(2)}`);
      if (proj.passiveMult > 1.0001) parts.push(`passive x${proj.passiveMult.toFixed(3)}`);
      statProjectionSub.textContent = parts.length ? parts.join(" · ") : "Base payout";
    }

    const canPrestige = proj.visible && state.devotion.toNumber() > 0;
    btnPrestige.classList.toggle("disabled", !canPrestige);

    if (state.window.active) {
      windowBanner.classList.remove("hidden");
      windowBannerLabel.textContent = state.window.label || "Window";
      windowBannerMult.textContent = `x${state.window.multiplier.toFixed(2)}`;
      windowBannerTimer.textContent = fmtSeconds(state.window.remainingSeconds(now));
    } else {
      windowBanner.classList.add("hidden");
    }

    if (activeTab === "achievements") {
      const passivePct = (Engine.achievementPassiveMultiplier() - 1) * 100;
      achPassivePill.textContent = `+${passivePct.toFixed(1)}% Prestige`;
    }
  }

  /* ---------------- Input ---------------- */
  let audioInitialized = false;

  function handleTap(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const result = Engine.tap();
    tapFlash = 1;

    // audio — initialize on first tap, play tap or crit sound
    if (Audio) {
      if (!audioInitialized) {
        Audio.unlockAndStart();
        Audio.setEnabled(Engine.getSetting("audioEnabled") !== false);
        audioInitialized = true;
        refreshSettingsUI();
      }
      if (result.hit) Audio.playCrit();
      else Audio.playTap();

      // Bound Hunger easter egg — ~1 in 1000 taps
      if (Math.random() < 0.001) {
        Audio.playHungerGlitch();
      }
    }

    const label = result.hit ? `+${result.multiplier.toFixed(2)}x CRIT!` : "+1";
    spawnParticle(x, y, label, result.hit);
  }

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    handleTap(e.clientX, e.clientY);
  });

  btnPrestige.addEventListener("click", () => {
    const state = Engine.state();
    if (state.devotion.toNumber() <= 0) return;
    const payout = Engine.prestige();
    if (Audio) Audio.playPrestige();
    spawnParticle(cw / 2, ch / 2, `+${payout.toString()} Tithe!`, true);
    updateHUD();
    if (activeTab === "achievements") renderAchievements();
  });

  /* ---------------- Toasts ---------------- */
  function drainToasts() {
    const list = Engine.popPendingUnlocks();
    if (!list.length) return;
    for (const def of list) {
      const tier = Engine.getTierInfo(def.tier);
      const toast = document.createElement("div");
      toast.className = "toast";
      const t1 = document.createElement("div");
      t1.className = "toastTitle";
      t1.textContent = "Achievement Unlocked";
      const t2 = document.createElement("div");
      t2.className = "toastName";
      t2.textContent = def.name;
      const t3 = document.createElement("div");
      t3.className = "toastSub";
      t3.textContent = `+${(tier.passiveBonus * 100).toFixed(1)}% permanent Prestige · window fired`;
      toast.appendChild(t1);
      toast.appendChild(t2);
      toast.appendChild(t3);
      toastStack.appendChild(toast);
      setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 3800);

      if (Audio) Audio.playAchievement();
    }
    if (activeTab === "achievements") renderAchievements();
  }

  /* ---------------- Settings wiring ---------------- */
  function refreshSettingsUI() {
    const enabled = Engine.getSetting("audioEnabled") !== false;
    toggleAudio.setAttribute("aria-checked", enabled ? "true" : "false");

    if (!audioInitialized) {
      audioStatusText.textContent = "Inactive — will start on first tap.";
    } else if (enabled) {
      audioStatusText.textContent = "Active — ambient drone and effects playing.";
    } else {
      audioStatusText.textContent = "Muted — tap the toggle to re-enable.";
    }

    if (Audio && audioInitialized) {
      Audio.setEnabled(enabled);
    }
  }

  toggleAudio.addEventListener("click", () => {
    const current = Engine.getSetting("audioEnabled") !== false;
    const next = !current;
    Engine.setSetting("audioEnabled", next);
    if (Audio) Audio.setEnabled(next);
    refreshSettingsUI();
    Engine.saveState();
  });

  btnManualSave.addEventListener("click", () => {
    const ok = Engine.saveState();
    saveStatus.textContent = ok ? `Saved ${new Date().toLocaleTimeString()}` : "Save failed";
    btnManualSave.textContent = ok ? "Saved!" : "Failed";
    setTimeout(() => { btnManualSave.textContent = "Save Now"; }, 1200);
  });

  btnResetSave.addEventListener("click", () => {
    const confirmed = window.confirm(
      "Reset all progress? This cannot be undone."
    );
    if (!confirmed) return;
    try {
      localStorage.removeItem("vorifex_tithe_save_v3");
    } catch (e) {}
    window.location.reload();
  });

  /* ---------------- Persistence ---------------- */
  function doSave() {
    const ok = Engine.saveState();
    saveStatus.textContent = ok ? `Saved ${new Date().toLocaleTimeString()}` : "Save failed";
  }

  Engine.loadState();
  saveStatus.textContent = "Loaded";
  switchTab("tap");
  refreshSettingsUI();

  setInterval(doSave, 15000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      doSave();
      if (Audio && Audio.isInitialized()) Audio.resume && Audio.resume();
    } else {
      Engine.update(Date.now());
      if (Audio && Audio.isInitialized()) Audio.resume && Audio.resume();
    }
  });
  window.addEventListener("beforeunload", doSave);

  /* ---------------- Session-start sound ---------------- */
  // fires on the very first tap after audio initializes (see handleTap)
  // the session start sound is played once via a small flag below
  let sessionStartPlayed = false;
  function maybeSessionStart() {
    if (sessionStartPlayed) return;
    if (Audio && audioInitialized) {
      Audio.playSessionStart();
      sessionStartPlayed = true;
    }
  }

  /* ---------------- Main loop ---------------- */
  let lastFrameTs = performance.now();
  let renderAchAccum = 0;

  function frame(ts) {
    const dtSec = Math.min(0.25, (ts - lastFrameTs) / 1000);
    lastFrameTs = ts;

    Engine.update(Date.now());
    updateParticles(dtSec);
    drawCore(dtSec);
    updateHUD();
    drainToasts();
    maybeSessionStart();

    if (Audio && Audio.isInitialized()) Audio.tick(dtSec);

    if (activeTab === "achievements") {
      renderAchAccum += dtSec;
      if (renderAchAccum > 0.5) {
        renderAchAccum = 0;
        renderAchievements();
      }
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);

})();