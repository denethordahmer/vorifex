/* =========================================================================
   VORIFEX'S TITHE — MATH ENGINE (engine.js)
   Self-contained, client-side, no dependencies, no CDN, offline-safe.
   Drop into Replit root and include via: <script src="engine.js"></script>
   Exposes a single global: window.VorifexEngine
   ========================================================================= */

(function (global) {
  "use strict";

  /* =======================================================================
     SECTION 9 — LARGE NUMBERS (BigNum: mantissa/exponent, base 10)
     Full internal precision, abbreviated display only at render time.
     ======================================================================= */
  class BigNum {
    constructor(mantissa = 0, exponent = 0) {
      this.m = mantissa;
      this.e = exponent;
      this._normalize();
    }

    _normalize() {
      if (this.m === 0) { this.e = 0; return this; }
      const sign = this.m < 0 ? -1 : 1;
      this.m = Math.abs(this.m);
      while (this.m >= 10) { this.m /= 10; this.e++; }
      while (this.m < 1) { this.m *= 10; this.e--; }
      this.m *= sign;
      return this;
    }

    static fromNumber(x) {
      if (!isFinite(x)) return new BigNum(x > 0 ? 9.999999 : -9.999999, 308);
      if (x === 0) return new BigNum(0, 0);
      const e = Math.floor(Math.log10(Math.abs(x)));
      return new BigNum(x / Math.pow(10, e), e);
    }

    static fromLn(lnVal) {
      // Reconstructs a BigNum from a natural-log value (safe for huge exponents)
      const e = Math.floor(lnVal / Math.LN10);
      const m = Math.exp(lnVal - e * Math.LN10);
      return new BigNum(m, e);
    }

    clone() { return new BigNum(this.m, this.e); }

    toNumber() {
      // May legitimately overflow to Infinity for extreme exponents — acceptable
      return this.m * Math.pow(10, this.e);
    }

    add(other) {
      other = other instanceof BigNum ? other : BigNum.fromNumber(other);
      if (this.m === 0) return other.clone();
      if (other.m === 0) return this.clone();
      let big = this, small = other;
      if (other.e > this.e) { big = other; small = this; }
      const diff = big.e - small.e;
      if (diff > 15) return big.clone(); // small term negligible
      const combinedM = big.m + small.m / Math.pow(10, diff);
      return new BigNum(combinedM, big.e);
    }

    sub(other) {
      other = other instanceof BigNum ? other : BigNum.fromNumber(other);
      return this.add(new BigNum(-other.m, other.e));
    }

    mul(other) {
      other = other instanceof BigNum ? other : BigNum.fromNumber(other);
      return new BigNum(this.m * other.m, this.e + other.e);
    }

    mulScalar(x) { return new BigNum(this.m * x, this.e); }

    div(other) {
      other = other instanceof BigNum ? other : BigNum.fromNumber(other);
      return new BigNum(this.m / other.m, this.e - other.e);
    }

    pow(p) {
      if (this.m <= 0) return new BigNum(0, 0);
      return BigNum.fromLn(this.ln() * p);
    }

    ln() {
      if (this.m <= 0) return -Infinity;
      return Math.log(this.m) + this.e * Math.LN10;
    }

    // ln(x+1) helper — accurate for both tiny and huge BigNums
    lnPlus1() {
      if (this.e < 0 || (this.e === 0 && this.m < 5)) {
        return Math.log(this.toNumber() + 1);
      }
      return this.ln(); // +1 is negligible at this scale
    }

    cmp(other) {
      other = other instanceof BigNum ? other : BigNum.fromNumber(other);
      if (this.m === 0 && other.m === 0) return 0;
      if (this.e !== other.e) return this.e > other.e ? 1 : -1;
      if (this.m === other.m) return 0;
      return this.m > other.m ? 1 : -1;
    }

    gte(other) { return this.cmp(other) >= 0; }
    lte(other) { return this.cmp(other) <= 0; }

    toString(decimals = 2) {
      const suf = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No",
                   "Dc", "UDc", "DDc", "TDc", "QaDc", "QiDc", "SxDc", "SpDc",
                   "OcDc", "NoDc", "Vg"];
      if (this.m === 0) return "0";
      if (this.e < 3) return this.toNumber().toFixed(decimals);
      const tier = Math.floor(this.e / 3);
      const val = this.m * Math.pow(10, this.e - tier * 3);
      if (tier < suf.length) return `${val.toFixed(decimals)}${suf[tier]}`;
      return `${this.m.toFixed(decimals)}e${this.e}`;
    }

    toJSON() { return { m: this.m, e: this.e }; }
    static fromJSON(obj) { return obj ? new BigNum(obj.m, obj.e) : new BigNum(0, 0); }
  }

  /* =======================================================================
     CONFIG — tunable constants for every system
     ======================================================================= */
  const CONFIG = {
    // §1 Prestige Conversion (hybrid sigmoid)
    prestige: {
      k0: 3.0,        // base steepness
      alpha: 0.35,     // steepness growth with ln(S+1)  -> tightening
      mu0: 4.0,        // base midpoint (calibrated by calibratePacing())
      beta: 0.55,      // midpoint drift with ln(S+1)    -> tightening
      c: 1.0,          // baseline scalar (calibrated)
      gamma: 6.0       // sweet-spot bonus magnitude
    },
    // §2 Stash -> Devotion Generation Boost
    stashBoost: {
      Gbase: 1.0,      // base devotion/sec before boosts
      M: 1.05,         // multiplicative top-layer base
      sqrtScale: 1.0
    },
    // §3 Pathway Cost Scaling
    costs: {
      path1: { C1: 10 },                       // Cost1(n) = C1 * n^1.5
      path2: { C2: 15, r: 1.13 },               // Cost2(n) = C2 * r^n
      path3: { f0: 0.02, growth: 1.3 }          // Cost3(n,S) = S * f0 * growth^n
    },
    // Path 2 — Extraction Rate multiplier on generation
    pathway2: { rho: 0.08 },                    // Mult(n2) = (1+rho)^n2
    // §4 Achievement Windows
    achievements: {
      baseDuration: 30,       // seconds (Q10)
      durationPerLevel: 4,    // seconds added per Path-3 level (Q9)
      diffExponent: 0.8,      // Mult(diff) = 1 + diff^0.8
      graceSeconds: 2,        // overlap grace on refresh
      tiers: [
        { name: "Common",    difficulty: 1  },
        { name: "Rare",      difficulty: 4  },
        { name: "Epic",      difficulty: 10 },
        { name: "Legendary", difficulty: 25 },
        { name: "Mythic",    difficulty: 60 }
      ]
    },
    // §5 Critical Chance Mechanics
    crit: {
      c0: 0.05,        // base crit chance
      delta: 0.03,     // approach rate toward 100%
      minMult: 1.5,    // fixed floor
      baseMaxMult: 3,  // base ceiling
      omega: 0.6       // ceiling growth per Path-1 level^0.7
    },
    // §6 Path 3 — Tithe Synergy (logarithmic, stacks on §2)
    synergy: { eta: 0.15 },
    // §7 Prestige Projection
    projection: { threshold: 1 }, // BigNum(1) — visible once payout >= this
    // §8 Pacing anchor targets (used only by calibratePacing)
    pacing: { targetD0: 500 } // ~5-10 min of tapping at default rates
  };

  /* =======================================================================
     §1 — PRESTIGE CONVERSION (Devotion -> Tithe Bullion)
     Hybrid sigmoid: slow start, steep sweet-spot middle, flattening extremes.
     Progressive tightening: k(S) and mu(S) both rise with ln(S+1).
     ======================================================================= */
  function sigmoid(x, k, mu) {
    return 1 / (1 + Math.exp(-k * (x - mu)));
  }

  function prestigeSigmaParams(S, cfg) {
    const lnS1 = S.lnPlus1();
    const k = cfg.k0 * (1 + cfg.alpha * lnS1);
    const mu = cfg.mu0 + cfg.beta * lnS1;
    return { k, mu };
  }

  function tithePayoutBase(D, S, cfg = CONFIG.prestige) {
    const x = D.lnPlus1();
    const { k, mu } = prestigeSigmaParams(S, cfg);
    const sig = sigmoid(x, k, mu);
    // c * D^0.5 * (1 + gamma * sigma)
    const sqrtD = D.pow(0.5);
    return sqrtD.mulScalar(cfg.c * (1 + cfg.gamma * sig));
  }

  /* =======================================================================
     §4 — ACHIEVEMENT-TRIGGERED PRESTIGE MULTIPLIER WINDOWS
     ======================================================================= */
  function windowMultiplierForDifficulty(difficulty, cfg = CONFIG.achievements) {
    return 1 + Math.pow(difficulty, cfg.diffExponent);
  }

  function windowDurationSeconds(level3, cfg = CONFIG.achievements) {
    return cfg.baseDuration + cfg.durationPerLevel * level3;
  }

  class PrestigeWindow {
    constructor() { this.active = false; this.difficulty = 0; this.multiplier = 1; this.endTime = 0; }

    activate(difficulty, level3, nowMs, cfg = CONFIG.achievements) {
      const mult = windowMultiplierForDifficulty(difficulty, cfg);
      const durationMs = windowDurationSeconds(level3, cfg) * 1000;
      // Refresh-only stacking with short grace overlap
      if (this.active && nowMs < this.endTime + cfg.graceSeconds * 1000) {
        this.endTime = Math.max(this.endTime, nowMs + durationMs);
        this.multiplier = Math.max(this.multiplier, mult);
      } else {
        this.difficulty = difficulty;
        this.multiplier = mult;
        this.endTime = nowMs + durationMs;
      }
      this.active = true;
    }

    tick(nowMs) {
      if (this.active && nowMs >= this.endTime) this.active = false;
    }

    getMultiplier() { return this.active ? this.multiplier : 1; }
    remainingSeconds(nowMs) { return this.active ? Math.max(0, (this.endTime - nowMs) / 1000) : 0; }

    toJSON() { return { active: this.active, difficulty: this.difficulty, multiplier: this.multiplier, endTime: this.endTime }; }
    static fromJSON(o) {
      const w = new PrestigeWindow();
      if (o) { w.active = o.active; w.difficulty = o.difficulty; w.multiplier = o.multiplier; w.endTime = o.endTime; }
      return w;
    }
  }

  function tithePayoutWithWindow(D, S, window, cfg = CONFIG.prestige) {
    const base = tithePayoutBase(D, S, cfg);
    const mult = window ? window.getMultiplier() : 1;
    return mult === 1 ? base : base.mulScalar(mult);
  }

  /* =======================================================================
     §2 — STASH -> DEVOTION GENERATION BOOST
     Logarithmic foundation with multiplicative top layer; exponent-coupled
     so the two layers interact rather than simply add.
     ======================================================================= */
  function stashBoostMultiplier(S, cfg = CONFIG.stashBoost) {
    const Blog = 1 + S.lnPlus1();
    const Bmult = Math.pow(cfg.M, Math.sqrt(Blog) * cfg.sqrtScale);
    return { Blog, Bmult, total: Blog * Bmult };
  }

  /* =======================================================================
     §6 — PATH 3: TITHE SYNERGY (logarithmic, stacks multiplicatively on §2)
     ======================================================================= */
  function synergyMultiplier(S, level3, cfg = CONFIG.synergy) {
    const lnS1 = S.lnPlus1();
    return 1 + cfg.eta * level3 * Math.sqrt(Math.max(0, lnS1));
  }

  /* =======================================================================
     PATH 2 — EXTRACTION RATE (accelerates devotion generation directly)
     ======================================================================= */
  function extractionMultiplier(level2, cfg = CONFIG.pathway2) {
    return Math.pow(1 + cfg.rho, level2);
  }

  /* Combined devotion generation rate per second */
  function devotionGenerationRate(S, level2, level3, cfg = CONFIG) {
    const { total: stashMult } = stashBoostMultiplier(S, cfg.stashBoost);
    const synergyMult = synergyMultiplier(S, level3, cfg.synergy);
    const extractMult = extractionMultiplier(level2, cfg.pathway2);
    return cfg.stashBoost.Gbase * stashMult * synergyMult * extractMult;
  }

  /* =======================================================================
     §3 — PATHWAY COST SCALING (three distinct curves)
     ======================================================================= */
  function cost1(n, cfg = CONFIG.costs.path1) {
    // Slow polynomial: gentle climb, crits stay accessible
    return BigNum.fromNumber(cfg.C1 * Math.pow(n, 1.5));
  }

  function cost2(n, cfg = CONFIG.costs.path2) {
    // Exponential, computed via ln-space to stay safe at large n
    const lnVal = Math.log(cfg.C2) + n * Math.log(cfg.r);
    return BigNum.fromLn(lnVal);
  }

  function cost3(n, S, cfg = CONFIG.costs.path3) {
    // % of current Stash — ties cost directly to the economy it boosts
    const lnFn = Math.log(cfg.f0) + n * Math.log(cfg.growth);
    const fn = BigNum.fromLn(lnFn);
    return S.mul(fn);
  }

  /* =======================================================================
     §5 — CRITICAL CHANCE MECHANICS
     Asymptotic chance approaching (never reaching) 100%.
     Variable min/max multiplier range; ceiling widens with Path-1 levels.
     ======================================================================= */
  function critChance(level1, cfg = CONFIG.crit) {
    return 1 - (1 - cfg.c0) * Math.pow(1 - cfg.delta, level1);
  }

  function critRange(level1, cfg = CONFIG.crit) {
    const max = cfg.baseMaxMult + cfg.omega * Math.pow(level1, 0.7);
    return { min: cfg.minMult, max };
  }

  function rollCrit(level1, cfg = CONFIG.crit) {
    const chance = critChance(level1, cfg);
    const hit = Math.random() < chance;
    if (!hit) return { hit: false, multiplier: 1 };
    const { min, max } = critRange(level1, cfg);
    const multiplier = min + (max - min) * Math.random();
    return { hit: true, multiplier };
  }

  /* =======================================================================
     §7 — PRESTIGE PROJECTION (dynamic threshold visibility)
     ======================================================================= */
  function isProjectionVisible(D, S, cfg = CONFIG) {
    const payout = tithePayoutBase(D, S, cfg.prestige);
    return payout.gte(BigNum.fromNumber(cfg.projection.threshold));
  }

  function getProjection(D, S, window, cfg = CONFIG) {
    const base = tithePayoutBase(D, S, cfg.prestige);
    const boosted = tithePayoutWithWindow(D, S, window, cfg.prestige);
    return {
      visible: base.gte(BigNum.fromNumber(cfg.projection.threshold)),
      base,
      boosted,
      windowActive: !!(window && window.active)
    };
  }

  /* =======================================================================
     §8 — PACING ANCHOR CALIBRATION
     Solves prestige.c and prestige.mu0 so that:
       - the sigmoid's climb centers near a ~5-10min Devotion value (D0)
       - the resulting first payout can afford Cost1(1) (tier 1, Path 1)
     Call once at game init (or when you change base rates).
     ======================================================================= */
  function calibratePacing(D0 = CONFIG.pacing.targetD0, cfg = CONFIG.prestige, costCfg = CONFIG.costs.path1) {
    cfg.mu0 = Math.log(D0 + 1);
    const sigmaAtMu0 = 0.5; // midpoint of any logistic curve
    const D0big = BigNum.fromNumber(D0);
    const sqrtD0 = D0big.pow(0.5).toNumber();
    const payoutFactor = sqrtD0 * (1 + cfg.gamma * sigmaAtMu0);
    const tier1Cost = cost1(1, costCfg).toNumber();
    cfg.c = payoutFactor > 0 ? tier1Cost / payoutFactor : 1;
    return { mu0: cfg.mu0, c: cfg.c };
  }

  /* =======================================================================
     GAME STATE — ties all systems together + localStorage persistence
     ======================================================================= */
  const STORAGE_KEY = "vorifex_tithe_save_v1";

  function defaultState() {
    return {
      devotion: new BigNum(0, 0),
      stash: new BigNum(0, 0),
      levels: { path1: 0, path2: 0, path3: 0 },
      window: new PrestigeWindow(),
      achievementsUnlocked: [],
      lastTick: Date.now(),
      totalPrestiges: 0
    };
  }

  let state = defaultState();

  function saveState() {
    const serial = {
      devotion: state.devotion.toJSON(),
      stash: state.stash.toJSON(),
      levels: state.levels,
      window: state.window.toJSON(),
      achievementsUnlocked: state.achievementsUnlocked,
      lastTick: state.lastTick,
      totalPrestiges: state.totalPrestiges
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serial));
      return true;
    } catch (err) {
      console.warn("VorifexEngine: save failed", err);
      return false;
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) { state = defaultState(); return state; }
      const parsed = JSON.parse(raw);
      state = {
        devotion: BigNum.fromJSON(parsed.devotion),
        stash: BigNum.fromJSON(parsed.stash),
        levels: parsed.levels || { path1: 0, path2: 0, path3: 0 },
        window: PrestigeWindow.fromJSON(parsed.window),
        achievementsUnlocked: parsed.achievementsUnlocked || [],
        lastTick: parsed.lastTick || Date.now(),
        totalPrestiges: parsed.totalPrestiges || 0
      };
      return state;
    } catch (err) {
      console.warn("VorifexEngine: load failed, using defaults", err);
      state = defaultState();
      return state;
    }
  }

  /* ---- Core gameplay operations built on the math above ---- */

  function tap() {
    const roll = rollCrit(state.levels.path1);
    const baseTapValue = 1; // flat tap value; tune as desired
    const gain = baseTapValue * roll.multiplier;
    state.devotion = state.devotion.add(BigNum.fromNumber(gain));
    return roll;
  }

  function update(nowMs = Date.now()) {
    const dtSeconds = Math.max(0, (nowMs - state.lastTick) / 1000);
    state.lastTick = nowMs;
    state.window.tick(nowMs);

    const rate = devotionGenerationRate(state.stash, state.levels.path2, state.levels.path3);
    if (dtSeconds > 0) {
      state.devotion = state.devotion.add(BigNum.fromNumber(rate * dtSeconds));
    }
    return { dtSeconds, rate };
  }

  function buyUpgrade(path) {
    let currentLevel, price;
    if (path === 1) {
      currentLevel = state.levels.path1;
      price = cost1(currentLevel + 1);
    } else if (path === 2) {
      currentLevel = state.levels.path2;
      price = cost2(currentLevel + 1);
    } else if (path === 3) {
      currentLevel = state.levels.path3;
      price = cost3(currentLevel + 1, state.stash);
    } else {
      return { success: false, reason: "invalid_path" };
    }

    if (!state.stash.gte(price)) {
      return { success: false, reason: "insufficient_stash", price };
    }

    state.stash = state.stash.sub(price);
    state.levels["path" + path] = currentLevel + 1;
    return { success: true, newLevel: currentLevel + 1, price };
  }

  function triggerAchievement(difficulty, nowMs = Date.now()) {
    state.window.activate(difficulty, state.levels.path3, nowMs);
    return state.window;
  }

  function prestige(nowMs = Date.now()) {
    const payout = tithePayoutWithWindow(state.devotion, state.stash, state.window);
    state.stash = state.stash.add(payout);
    state.devotion = new BigNum(0, 0);
    state.totalPrestiges += 1;
    state.lastTick = nowMs;
    return payout;
  }

  function getProjectionNow(nowMs = Date.now()) {
    state.window.tick(nowMs);
    return getProjection(state.devotion, state.stash, state.window);
  }

  /* =======================================================================
     PUBLIC API
     ======================================================================= */
  global.VorifexEngine = {
    // classes / config
    BigNum,
    CONFIG,
    PrestigeWindow,

    // §1 prestige math
    tithePayoutBase,
    tithePayoutWithWindow,

    // §2 stash boost
    stashBoostMultiplier,

    // §3 costs
    cost1, cost2, cost3,

    // §4 achievement windows
    windowMultiplierForDifficulty,
    windowDurationSeconds,

    // §5 crit
    critChance, critRange, rollCrit,

    // §6 synergy
    synergyMultiplier,

    // path 2 extraction
    extractionMultiplier,
    devotionGenerationRate,

    // §7 projection
    isProjectionVisible,
    getProjection,
    getProjectionNow,

    // §8 pacing calibration
    calibratePacing,

    // state & persistence
    state: () => state,
    saveState,
    loadState,
    defaultState,

    // gameplay actions
    tap,
    update,
    buyUpgrade,
    triggerAchievement,
    prestige
  };

  // Auto-calibrate pacing anchor on load using default targets
  calibratePacing();

})(typeof window !== "undefined" ? window : globalThis);