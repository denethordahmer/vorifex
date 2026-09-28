/* =========================================================================
   VORIFEX'S TITHE — MATH ENGINE (engine.js) v3
   Adds: persisted sound preference (settings.audioEnabled).
   Self-contained, client-side, no dependencies, no CDN, offline-safe.
   ========================================================================= */

(function (global) {
  "use strict";

  /* =======================================================================
     SECTION 9 — LARGE NUMBERS (BigNum: mantissa/exponent, base 10)
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
      const e = Math.floor(lnVal / Math.LN10);
      const m = Math.exp(lnVal - e * Math.LN10);
      return new BigNum(m, e);
    }

    clone() { return new BigNum(this.m, this.e); }

    toNumber() { return this.m * Math.pow(10, this.e); }

    add(other) {
      other = other instanceof BigNum ? other : BigNum.fromNumber(other);
      if (this.m === 0) return other.clone();
      if (other.m === 0) return this.clone();
      let big = this, small = other;
      if (other.e > this.e) { big = other; small = this; }
      const diff = big.e - small.e;
      if (diff > 15) return big.clone();
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

    lnPlus1() {
      if (this.e < 0 || (this.e === 0 && this.m < 5)) {
        return Math.log(this.toNumber() + 1);
      }
      return this.ln();
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
     CONFIG
     ======================================================================= */
  const CONFIG = {
    prestige: {
      k0: 3.0,
      alpha: 0.35,
      mu0: 4.0,
      beta: 0.55,
      c: 1.0,
      gamma: 6.0
    },
    stashBoost: {
      Gbase: 1.0,
      M: 1.05,
      sqrtScale: 1.0
    },
    costs: {
      path1: { C1: 10 },
      path2: { C2: 15, r: 1.13 },
      path3: { f0: 0.02, growth: 1.3 }
    },
    pathway2: { rho: 0.08 },
    achievements: {
      baseDuration: 30,
      durationPerLevel: 4,
      diffExponent: 0.8,
      graceSeconds: 2,
      tiers: [
        { name: "Common",    difficulty: 1,  passiveBonus: 0.001 },
        { name: "Rare",      difficulty: 4,  passiveBonus: 0.005 },
        { name: "Epic",      difficulty: 10, passiveBonus: 0.015 },
        { name: "Legendary", difficulty: 25, passiveBonus: 0.04  },
        { name: "Mythic",    difficulty: 60, passiveBonus: 0.10  }
      ]
    },
    crit: {
      c0: 0.05,
      delta: 0.03,
      minMult: 1.5,
      baseMaxMult: 3,
      omega: 0.6
    },
    synergy: { eta: 0.15 },
    projection: { threshold: 1 },
    pacing: { targetD0: 500 },
    // settings defaults (new)
    settings: {
      audioEnabled: true
    }
  };

  /* =======================================================================
     §1 — PRESTIGE CONVERSION
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
    const sqrtD = D.pow(0.5);
    return sqrtD.mulScalar(cfg.c * (1 + cfg.gamma * sig));
  }

  /* =======================================================================
     §4 — ACHIEVEMENT WINDOW
     ======================================================================= */
  function windowMultiplierForDifficulty(difficulty, cfg = CONFIG.achievements) {
    return 1 + Math.pow(difficulty, cfg.diffExponent);
  }

  function windowDurationSeconds(level3, cfg = CONFIG.achievements) {
    return cfg.baseDuration + cfg.durationPerLevel * level3;
  }

  class PrestigeWindow {
    constructor() { this.active = false; this.difficulty = 0; this.multiplier = 1; this.endTime = 0; this.label = ""; }

    activate(difficulty, level3, label, nowMs, cfg = CONFIG.achievements) {
      const mult = windowMultiplierForDifficulty(difficulty, cfg);
      const durationMs = windowDurationSeconds(level3, cfg) * 1000;
      if (this.active && nowMs < this.endTime + cfg.graceSeconds * 1000) {
        this.endTime = Math.max(this.endTime, nowMs + durationMs);
        if (mult > this.multiplier) {
          this.multiplier = mult;
          this.difficulty = difficulty;
          this.label = label;
        }
      } else {
        this.difficulty = difficulty;
        this.multiplier = mult;
        this.label = label;
        this.endTime = nowMs + durationMs;
      }
      this.active = true;
    }

    tick(nowMs) {
      if (this.active && nowMs >= this.endTime) this.active = false;
    }

    getMultiplier() { return this.active ? this.multiplier : 1; }
    remainingSeconds(nowMs) { return this.active ? Math.max(0, (this.endTime - nowMs) / 1000) : 0; }

    toJSON() { return { active: this.active, difficulty: this.difficulty, multiplier: this.multiplier, endTime: this.endTime, label: this.label }; }
    static fromJSON(o) {
      const w = new PrestigeWindow();
      if (o) {
        w.active = o.active; w.difficulty = o.difficulty;
        w.multiplier = o.multiplier; w.endTime = o.endTime;
        w.label = o.label || "";
      }
      return w;
    }
  }

  function tithePayoutWithWindow(D, S, window, cfg = CONFIG.prestige) {
    const base = tithePayoutBase(D, S, cfg);
    const mult = window ? window.getMultiplier() : 1;
    return mult === 1 ? base : base.mulScalar(mult);
  }

  /* =======================================================================
     §2 — STASH → DEVOTION GENERATION BOOST
     ======================================================================= */
  function stashBoostMultiplier(S, cfg = CONFIG.stashBoost) {
    const Blog = 1 + S.lnPlus1();
    const Bmult = Math.pow(cfg.M, Math.sqrt(Blog) * cfg.sqrtScale);
    return { Blog, Bmult, total: Blog * Bmult };
  }

  /* =======================================================================
     §6 — PATH 3 SYNERGY
     ======================================================================= */
  function synergyMultiplier(S, level3, cfg = CONFIG.synergy) {
    const lnS1 = S.lnPlus1();
    return 1 + cfg.eta * level3 * Math.sqrt(Math.max(0, lnS1));
  }

  /* =======================================================================
     PATH 2 — EXTRACTION
     ======================================================================= */
  function extractionMultiplier(level2, cfg = CONFIG.pathway2) {
    return Math.pow(1 + cfg.rho, level2);
  }

  function devotionGenerationRate(S, level2, level3, cfg = CONFIG) {
    const { total: stashMult } = stashBoostMultiplier(S, cfg.stashBoost);
    const synergyMult = synergyMultiplier(S, level3, cfg.synergy);
    const extractMult = extractionMultiplier(level2, cfg.pathway2);
    return cfg.stashBoost.Gbase * stashMult * synergyMult * extractMult;
  }

  /* =======================================================================
     §3 — PATHWAY COSTS
     ======================================================================= */
  function cost1(n, cfg = CONFIG.costs.path1) {
    return BigNum.fromNumber(cfg.C1 * Math.pow(n, 1.5));
  }

  function cost2(n, cfg = CONFIG.costs.path2) {
    const lnVal = Math.log(cfg.C2) + n * Math.log(cfg.r);
    return BigNum.fromLn(lnVal);
  }

  function cost3(n, S, cfg = CONFIG.costs.path3) {
    const lnFn = Math.log(cfg.f0) + n * Math.log(cfg.growth);
    const fn = BigNum.fromLn(lnFn);
    return S.mul(fn);
  }

  /* =======================================================================
     §5 — CRIT
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
     §7 — PRESTIGE PROJECTION
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
     §8 — PACING CALIBRATION
     ======================================================================= */
  function calibratePacing(D0 = CONFIG.pacing.targetD0, cfg = CONFIG.prestige, costCfg = CONFIG.costs.path1) {
    cfg.mu0 = Math.log(D0 + 1);
    const sigmaAtMu0 = 0.5;
    const D0big = BigNum.fromNumber(D0);
    const sqrtD0 = D0big.pow(0.5).toNumber();
    const payoutFactor = sqrtD0 * (1 + cfg.gamma * sigmaAtMu0);
    const tier1Cost = cost1(1, costCfg).toNumber();
    cfg.c = payoutFactor > 0 ? tier1Cost / payoutFactor : 1;
    return { mu0: cfg.mu0, c: cfg.c };
  }

  /* =======================================================================
     ACHIEVEMENTS — 50 TOTAL, LIFETIME, ONE-SHOT EACH
     ======================================================================= */
  function A(id, name, tier, desc, check, target) {
    return { id, name, tier, desc, check, target };
  }

  const TIER_MAP = { C: 0, R: 1, E: 2, L: 3, M: 4 };

  const ACHIEVEMENTS = [
    A("tap_10",       "First Contact",      "C", "Tap 10 times.",               s => s.tapCount, 10),
    A("tap_100",      "Getting Warm",       "C", "Tap 100 times.",              s => s.tapCount, 100),
    A("tap_500",      "Steady Hand",        "R", "Tap 500 times.",              s => s.tapCount, 500),
    A("tap_1000",     "Committed",          "R", "Tap 1,000 times.",            s => s.tapCount, 1000),
    A("tap_5000",     "Devoted Fingers",    "E", "Tap 5,000 times.",            s => s.tapCount, 5000),
    A("tap_10000",    "Hand of the Faithful","E","Tap 10,000 times.",           s => s.tapCount, 10000),
    A("tap_50000",    "Obsessive",          "L", "Tap 50,000 times.",           s => s.tapCount, 50000),
    A("tap_100000",   "Tireless",           "L", "Tap 100,000 times.",          s => s.tapCount, 100000),
    A("tap_500000",   "Legendary Devotion", "M", "Tap 500,000 times.",          s => s.tapCount, 500000),
    A("tap_1000000",  "The Endless Tap",    "M", "Tap 1,000,000 times.",        s => s.tapCount, 1000000),

    A("time_1m",      "First Minute",       "C", "Play for 1 minute.",          s => s.playtimeSeconds, 60),
    A("time_5m",      "Settling In",        "C", "Play for 5 minutes.",         s => s.playtimeSeconds, 300),
    A("time_15m",     "Dedicated Moment",   "R", "Play for 15 minutes.",        s => s.playtimeSeconds, 900),
    A("time_1h",      "An Hour of Faith",   "R", "Play for 1 hour.",            s => s.playtimeSeconds, 3600),
    A("time_6h",      "Half a Day",         "E", "Play for 6 hours.",           s => s.playtimeSeconds, 21600),
    A("time_24h",     "A Full Day",         "L", "Play for 24 hours.",          s => s.playtimeSeconds, 86400),
    A("time_72h",     "Three Days Strong",  "L", "Play for 72 hours.",          s => s.playtimeSeconds, 259200),
    A("time_168h",    "A Week of Tithe",    "M", "Play for 168 hours.",         s => s.playtimeSeconds, 604800),

    A("dev_100",      "Sparked",            "C", "Reach 100 Devotion in a run.",    s => s.runPeakDevotion, 100),
    A("dev_1000",     "Kindled",            "C", "Reach 1K Devotion in a run.",     s => s.runPeakDevotion, 1000),
    A("dev_10000",    "Blazing",            "R", "Reach 10K Devotion in a run.",    s => s.runPeakDevotion, 10000),
    A("dev_100000",   "Inferno",            "R", "Reach 100K Devotion in a run.",   s => s.runPeakDevotion, 100000),
    A("dev_1m",       "Million Strong",     "E", "Reach 1M Devotion in a run.",     s => s.runPeakDevotion, 1000000),
    A("dev_100m",     "Hundred Million",    "E", "Reach 100M Devotion in a run.",   s => s.runPeakDevotion, 100000000),
    A("dev_1b",       "Devotion Unbound",   "L", "Reach 1B Devotion in a run.",     s => s.runPeakDevotion, 1000000000),
    A("dev_1e12",     "Beyond Measure",     "M", "Reach 1T Devotion in a run.",     s => s.runPeakDevotion, 1e12),

    A("stash_1",      "First Tithe",        "C", "Earn 1 Tithe Bullion total.",     s => s.lifetimeStash, 1),
    A("stash_100",    "Stacking Up",        "C", "Earn 100 Bullion total.",         s => s.lifetimeStash, 100),
    A("stash_10000",  "Serious Wealth",     "R", "Earn 10K Bullion total.",         s => s.lifetimeStash, 10000),
    A("stash_1m",     "Tithe Barony",       "E", "Earn 1M Bullion total.",          s => s.lifetimeStash, 1000000),
    A("stash_1b",     "Tithe Empire",       "L", "Earn 1B Bullion total.",          s => s.lifetimeStash, 1000000000),
    A("stash_1e15",   "Cosmic Wealth",      "M", "Earn 1e15 Bullion total.",        s => s.lifetimeStash, 1e15),

    A("pres_1",       "First Offering",     "C", "Prestige once.",                  s => s.totalPrestiges, 1),
    A("pres_5",       "Regular Giver",      "C", "Prestige 5 times.",               s => s.totalPrestiges, 5),
    A("pres_25",      "Faithful",           "R", "Prestige 25 times.",              s => s.totalPrestiges, 25),
    A("pres_100",     "Devoted Cycle",      "R", "Prestige 100 times.",             s => s.totalPrestiges, 100),
    A("pres_500",     "The Reborn",         "E", "Prestige 500 times.",             s => s.totalPrestiges, 500),
    A("pres_2500",    "Cycle Master",       "L", "Prestige 2,500 times.",           s => s.totalPrestiges, 2500),
    A("pres_10000",   "Eternal Return",     "M", "Prestige 10,000 times.",          s => s.totalPrestiges, 10000),

    A("crit_1",       "Lucky Strike",       "C", "Land 1 critical tap.",            s => s.critCount, 1),
    A("crit_100",     "Sharp Eye",          "C", "Land 100 critical taps.",         s => s.critCount, 100),
    A("crit_1000",    "Critical Mass",      "R", "Land 1,000 critical taps.",       s => s.critCount, 1000),
    A("crit_10000",   "Precision Devotion", "E", "Land 10,000 critical taps.",      s => s.critCount, 10000),
    A("crit_100000",  "Master of Chance",   "L", "Land 100,000 critical taps.",     s => s.critCount, 100000),

    A("win_1",        "Window Opened",      "C", "Trigger your first window.",      s => s.windowsTriggered, 1),
    A("win_10",       "Frequent Flare",     "C", "Trigger 10 windows.",             s => s.windowsTriggered, 10),
    A("win_100",      "Window Weaver",      "R", "Trigger 100 windows.",            s => s.windowsTriggered, 100),
    A("win_500",      "The Opportunist",    "E", "Trigger 500 windows.",            s => s.windowsTriggered, 500),

    A("path_any5",    "Diversified",        "R", "Reach 5 total pathway levels.",   s => s.levels.path1 + s.levels.path2 + s.levels.path3, 5),
    A("path_any25",   "Path Walker",        "E", "Reach 25 total pathway levels.",  s => s.levels.path1 + s.levels.path2 + s.levels.path3, 25)
  ];

  function getAchievementById(id) { return ACHIEVEMENTS.find(a => a.id === id) || null; }
  function getTierInfo(tierKey) { return CONFIG.achievements.tiers[TIER_MAP[tierKey]]; }

  /* =======================================================================
     GAME STATE
     ======================================================================= */
  const STORAGE_KEY = "vorifex_tithe_save_v3";

  function defaultState() {
    return {
      devotion: new BigNum(0, 0),
      stash: new BigNum(0, 0),
      levels: { path1: 0, path2: 0, path3: 0 },
      window: new PrestigeWindow(),
      lastTick: Date.now(),
      totalPrestiges: 0,

      tapCount: 0,
      playtimeSeconds: 0,
      critCount: 0,
      windowsTriggered: 0,
      runPeakDevotion: 0,
      lifetimeStash: 0,

      achievementsUnlocked: [],
      pendingUnlocks: [],

      // settings (persisted)
      settings: {
        audioEnabled: CONFIG.settings.audioEnabled
      }
    };
  }

  let state = defaultState();

  function saveState() {
    const serial = {
      devotion: state.devotion.toJSON(),
      stash: state.stash.toJSON(),
      levels: state.levels,
      window: state.window.toJSON(),
      lastTick: state.lastTick,
      totalPrestiges: state.totalPrestiges,
      tapCount: state.tapCount,
      playtimeSeconds: state.playtimeSeconds,
      critCount: state.critCount,
      windowsTriggered: state.windowsTriggered,
      runPeakDevotion: state.runPeakDevotion,
      lifetimeStash: state.lifetimeStash,
      achievementsUnlocked: state.achievementsUnlocked,
      settings: state.settings
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
      if (!raw) {
        state = defaultState();
        return state;
      }
      const parsed = JSON.parse(raw);
      state = {
        devotion: BigNum.fromJSON(parsed.devotion),
        stash: BigNum.fromJSON(parsed.stash),
        levels: parsed.levels || { path1: 0, path2: 0, path3: 0 },
        window: PrestigeWindow.fromJSON(parsed.window),
        lastTick: parsed.lastTick || Date.now(),
        totalPrestiges: parsed.totalPrestiges || 0,
        tapCount: parsed.tapCount || 0,
        playtimeSeconds: parsed.playtimeSeconds || 0,
        critCount: parsed.critCount || 0,
        windowsTriggered: parsed.windowsTriggered || 0,
        runPeakDevotion: parsed.runPeakDevotion || 0,
        lifetimeStash: parsed.lifetimeStash || 0,
        achievementsUnlocked: parsed.achievementsUnlocked || [],
        pendingUnlocks: [],
        settings: Object.assign(
          { audioEnabled: CONFIG.settings.audioEnabled },
          parsed.settings || {}
        )
      };
      return state;
    } catch (err) {
      console.warn("VorifexEngine: load failed", err);
      state = defaultState();
      return state;
    }
  }

  /* =======================================================================
     SETTINGS
     ======================================================================= */
  function getSetting(key) {
    if (!state.settings) state.settings = {};
    return state.settings[key];
  }

  function setSetting(key, value) {
    if (!state.settings) state.settings = {};
    state.settings[key] = value;
    return value;
  }

  /* =======================================================================
     PASSIVE MULTIPLIER FROM ACHIEVEMENTS
     ======================================================================= */
  function achievementPassiveMultiplier() {
    let bonus = 0;
    for (const id of state.achievementsUnlocked) {
      const def = getAchievementById(id);
      if (!def) continue;
      const tier = getTierInfo(def.tier);
      bonus += tier.passiveBonus;
    }
    return 1 + bonus;
  }

  /* =======================================================================
     ACHIEVEMENT EVALUATION
     ======================================================================= */
  function evaluateAchievements(nowMs) {
    const unlockedSet = new Set(state.achievementsUnlocked);
    let changed = false;

    for (const def of ACHIEVEMENTS) {
      if (unlockedSet.has(def.id)) continue;
      let current;
      try { current = def.check(state); } catch (e) { continue; }
      if (typeof current !== "number" || !isFinite(current)) continue;
      if (current >= def.target) {
        state.achievementsUnlocked.push(def.id);
        state.pendingUnlocks.push(def.id);
        unlockedSet.add(def.id);
        changed = true;

        const tier = getTierInfo(def.tier);
        state.window.activate(tier.difficulty, state.levels.path3, def.name, nowMs);
        state.windowsTriggered += 1;
      }
    }
    return changed;
  }

  function popPendingUnlocks() {
    const list = state.pendingUnlocks.slice();
    state.pendingUnlocks.length = 0;
    return list.map(id => getAchievementById(id)).filter(Boolean);
  }

  /* =======================================================================
     GAMEPLAY OPS
     ======================================================================= */
  function tap() {
    const roll = rollCrit(state.levels.path1);
    const baseTapValue = 1;
    const gain = baseTapValue * roll.multiplier;
    state.devotion = state.devotion.add(BigNum.fromNumber(gain));
    state.tapCount += 1;
    if (roll.hit) state.critCount += 1;

    const devNum = state.devotion.toNumber();
    if (isFinite(devNum) && devNum > state.runPeakDevotion) state.runPeakDevotion = devNum;

    evaluateAchievements(Date.now());
    return roll;
  }

  function update(nowMs = Date.now()) {
    const dtSeconds = Math.max(0, (nowMs - state.lastTick) / 1000);
    state.lastTick = nowMs;
    state.window.tick(nowMs);

    if (dtSeconds > 0 && dtSeconds < 5) {
      state.playtimeSeconds += dtSeconds;
    }

    const rate = devotionGenerationRate(state.stash, state.levels.path2, state.levels.path3);
    if (dtSeconds > 0 && dtSeconds < 5) {
      state.devotion = state.devotion.add(BigNum.fromNumber(rate * dtSeconds));
    }

    const devNum = state.devotion.toNumber();
    if (isFinite(devNum) && devNum > state.runPeakDevotion) state.runPeakDevotion = devNum;

    evaluateAchievements(nowMs);
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
    evaluateAchievements(Date.now());
    return { success: true, newLevel: currentLevel + 1, price };
  }

  function prestige(nowMs = Date.now()) {
    const base = tithePayoutBase(state.devotion, state.stash, CONFIG.prestige);
    const windowMult = state.window.getMultiplier();
    const passiveMult = achievementPassiveMultiplier();

    let payout = base.mulScalar(windowMult * passiveMult);

    state.stash = state.stash.add(payout);
    state.lifetimeStash += payout.toNumber();

    state.devotion = new BigNum(0, 0);
    state.runPeakDevotion = 0;
    state.totalPrestiges += 1;
    state.lastTick = nowMs;

    evaluateAchievements(nowMs);
    return payout;
  }

  function getProjectionNow(nowMs = Date.now()) {
    state.window.tick(nowMs);
    const base = tithePayoutBase(state.devotion, state.stash, CONFIG.prestige);
    const windowMult = state.window.getMultiplier();
    const passiveMult = achievementPassiveMultiplier();
    const boosted = base.mulScalar(windowMult * passiveMult);
    return {
      visible: base.gte(BigNum.fromNumber(CONFIG.projection.threshold)),
      base,
      boosted,
      windowActive: state.window.active,
      windowMult,
      passiveMult
    };
  }

  /* =======================================================================
     PUBLIC API
     ======================================================================= */
  global.VorifexEngine = {
    BigNum,
    CONFIG,
    PrestigeWindow,
    ACHIEVEMENTS,
    getAchievementById,
    getTierInfo,
    TIER_MAP,

    tithePayoutBase,
    tithePayoutWithWindow,
    stashBoostMultiplier,
    cost1, cost2, cost3,
    windowMultiplierForDifficulty,
    windowDurationSeconds,
    critChance, critRange, rollCrit,
    synergyMultiplier,
    extractionMultiplier,
    devotionGenerationRate,
    isProjectionVisible,
    getProjection,
    getProjectionNow,
    calibratePacing,

    achievementPassiveMultiplier,
    evaluateAchievements,
    popPendingUnlocks,

    // settings
    getSetting,
    setSetting,

    state: () => state,
    saveState,
    loadState,
    defaultState,

    tap,
    update,
    buyUpgrade,
    prestige
  };

  calibratePacing();

})(typeof window !== "undefined" ? window : globalThis);