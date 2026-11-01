/*
  Cheese core
  Shared by the main page (/) and the full game (/cheese).
  Holds the save, the roster and the economy, so both pages always agree.
  Pages load this file, then call CheeseCore.start(onChange).
*/
(function (global) {
  "use strict";

  /* ---------- settings ---------- */
  var SAVE_KEY = "pk_cheese_save";
  var SAVE_VERSION = 1;
  var TICK_MS = 200;
  var AUTOSAVE_MS = 5000;
  // Longest gap that still pays out. Background tabs tick at least once a
  // minute, so AFK with the tab open earns normally. A laptop asleep overnight
  // only earns this much on waking instead of the whole night.
  var MAX_STEP_SECONDS = 90;

  /* ---------- tiers (economy step will rework these numbers) ---------- */
  var TIERS = [
    { cost: 12,   rate: 0.7 },
    { cost: 60,   rate: 3.2 },
    { cost: 260,  rate: 12.5 },
    { cost: 900,  rate: 42 },
    { cost: 2600, rate: 120 },
    { cost: 6500, rate: 320 }
  ];
  var COST_GROWTH = 1.55;
  var PER_CLICK = 1;

  /* ---------- rat pool: who staffs each tier is rerolled every visit ---------- */
  var POOL = [
    ["Derek",    "Reliable. Unremarkable. The index fund of rats."],
    ["Susan",    "Outperformed in Q2 and has not stopped mentioning it."],
    ["Gary",     "Produces cheese at a rate that has not been independently verified."],
    ["Malcolm",  "Reads the whitepaper. Rarely finishes it."],
    ["Brenda",   "Consistent. Refuses to discuss methodology."],
    ["Trevor",   "High variance. Currently in drawdown."],
    ["Janet",    "Compounds quietly. Has never appeared on a leaderboard."],
    ["Keith",    "Bought at the top. Remains bullish."],
    ["Denise",   "Risk-adjusted returns better than they appear."],
    ["Nigel",    "Insists the fundamentals are unchanged."],
    ["Pauline",  "Long duration. Sensitive to rates."],
    ["Clive",    "Was told cheese production is a solved problem."],
    ["Maureen",  "Illiquid. Cannot be sold."],
    ["Barry",    "Underperforms the benchmark. Charges fees regardless."],
    ["Yvonne",   "Uncorrelated, allegedly."],
    ["Graham",   "Has a five-year plan. It is year six."],
    ["Linda",    "Diversified across three types of cheddar."],
    ["Roger",    "Mean-reverting. Usually to lunch."],
    ["Sandra",   "Fully hedged. Against what, she will not say."],
    ["Pamela",   "Backtested beautifully. Not seen since going live."],
    ["Stuart",   "Leverage described by HR as a concern."],
    ["Carol",    "Only trades on Tuesdays. Nobody has asked why."],
    ["Geoffrey", "Refers to the 1987 crash as a personal experience."],
    ["Wendy",    "Sharpe ratio of 3. Sample size of 2."],
    ["Neil",     "Stop-loss set at zero. An optimist."],
    ["Dennis",   "Overfit. Extremely confident about it."],
    ["Gordon",   "Believes in efficient markets, except this one."],
    ["Doreen",   "Market neutral. Also neutral on most things."],
    ["Howard",   "Asked for his bonus in Brie. Got it."],
    ["Beverley", "The only rat left from her cohort. Cites this as skill."]
  ];

  /* ---------- storage: localStorage, with a quiet in-memory fallback ---------- */
  var mem = {};
  var storageOK = (function () {
    try {
      var k = "__pk_test";
      global.localStorage.setItem(k, "1");
      global.localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  })();
  function rawGet(k) {
    if (storageOK) { try { return global.localStorage.getItem(k); } catch (e) {} }
    return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
  }
  function rawSet(k, v) {
    if (storageOK) { try { global.localStorage.setItem(k, v); return; } catch (e) {} }
    mem[k] = v;
  }
  function rawRemove(k) {
    if (storageOK) { try { global.localStorage.removeItem(k); } catch (e) {} }
    delete mem[k];
  }

  /* ---------- save format ---------- */
  function fresh() {
    return {
      v: SAVE_VERSION,
      cheese: 0,
      lifetime: 0,          // all cheese ever earned; rebirth will use this
      clicks: 0,
      owned: TIERS.map(function () { return 0; }),
      unlocked: {},         // section id -> true
      savedAt: 0
    };
  }

  function num(x) { return (typeof x === "number" && isFinite(x) && x >= 0) ? x : 0; }
  function whole(x) { return Math.floor(num(x)); }

  // Accept only sane values, so a damaged or hand-edited save cannot break the game.
  function clean(d) {
    var s = fresh();
    if (!d || typeof d !== "object") return s;
    s.cheese = num(d.cheese);
    s.lifetime = Math.max(num(d.lifetime), s.cheese);
    s.clicks = whole(d.clicks);
    if (Object.prototype.toString.call(d.owned) === "[object Array]") {
      for (var i = 0; i < s.owned.length; i++) s.owned[i] = whole(d.owned[i]);
    }
    if (d.unlocked && typeof d.unlocked === "object") {
      for (var k in d.unlocked) {
        if (Object.prototype.hasOwnProperty.call(d.unlocked, k) && d.unlocked[k] === true) s.unlocked[k] = true;
      }
    }
    s.savedAt = num(d.savedAt);
    return s;
  }

  // Upgrades older saves one version at a time. Add a step here whenever
  // SAVE_VERSION goes up, e.g. if (d.v === 1) { ...; d.v = 2; }
  function migrate(d) {
    if (!d || typeof d !== "object") return null;
    if (typeof d.v !== "number") return null;
    return d;
  }

  // If the save came from a newer version of the site (e.g. an old copy of
  // this file is still cached), play along but never write over it.
  var newerSaveExists = false;

  // Before saves existed, only unlocks were stored, as pk_unlocked_<id> = "1".
  function importLegacyUnlocks(s) {
    if (!storageOK) return;
    try {
      for (var i = 0; i < global.localStorage.length; i++) {
        var key = global.localStorage.key(i);
        if (key && key.indexOf("pk_unlocked_") === 0 && global.localStorage.getItem(key) === "1") {
          s.unlocked[key.slice("pk_unlocked_".length)] = true;
        }
      }
    } catch (e) {}
  }

  function loadState() {
    var raw = rawGet(SAVE_KEY);
    if (raw) {
      try {
        var d = migrate(JSON.parse(raw));
        if (d) {
          if (d.v > SAVE_VERSION) newerSaveExists = true;
          return clean(d);
        }
      } catch (e) {}
      // Keep a copy of anything unreadable rather than silently losing it.
      rawSet(SAVE_KEY + "_unreadable", raw);
    }
    var s = fresh();
    importLegacyUnlocks(s);
    return s;
  }

  /* ---------- roster ---------- */
  function rollRoster() {
    var pool = POOL.slice(), out = [];
    for (var i = 0; i < TIERS.length; i++) {
      var j = Math.floor(Math.random() * pool.length);
      var r = pool.splice(j, 1)[0];
      out.push({ name: r[0], desc: r[1] });
    }
    return out;
  }

  /* ---------- game ---------- */
  var state = loadState();
  var roster = rollRoster();
  var lastTick = Date.now();
  var dirty = false;
  var onChange = function () {};
  var started = false;

  function earn(amount) {
    if (!(amount > 0)) return;
    state.cheese += amount;
    state.lifetime += amount;
    dirty = true;
  }

  function costOf(tier) {
    var c = TIERS[tier].cost, n = state.owned[tier];
    for (var i = 0; i < n; i++) c = Math.ceil(c * COST_GROWTH);
    return c;
  }
  function rateOf(tier) { return TIERS[tier].rate; }
  function totalRate() {
    var t = 0;
    for (var i = 0; i < TIERS.length; i++) t += state.owned[i] * rateOf(i);
    return t;
  }

  function press() {
    earn(PER_CLICK);
    state.clicks++;
    onChange();
  }

  function buy(tier) {
    var c = costOf(tier);
    if (state.cheese < c) return false;
    state.cheese -= c;
    state.owned[tier]++;
    dirty = true;
    save();               // purchases are worth saving straight away
    onChange();
    return true;
  }

  function unlock(id) {
    if (state.unlocked[id]) return false;
    state.unlocked[id] = true;
    save();
    return true;
  }
  function isUnlocked(id) { return state.unlocked[id] === true; }

  function tick() {
    var now = Date.now();
    var dt = (now - lastTick) / 1000;
    lastTick = now;
    if (dt <= 0) return;
    if (dt > MAX_STEP_SECONDS) dt = MAX_STEP_SECONDS;
    var r = totalRate();
    if (r > 0) { earn(r * dt); onChange(); }
  }

  function save() {
    if (newerSaveExists) return;
    state.savedAt = Date.now();
    rawSet(SAVE_KEY, JSON.stringify(state));
    dirty = false;
  }

  // For testing from the browser console: CheeseCore.reset()
  function reset() {
    rawRemove(SAVE_KEY);
    state = fresh();
    lastTick = Date.now();
    onChange();
  }

  function start(callback) {
    if (started) return;
    started = true;
    if (typeof callback === "function") onChange = callback;
    lastTick = Date.now();
    setInterval(tick, TICK_MS);
    setInterval(function () { if (dirty) save(); }, AUTOSAVE_MS);
    // Save when the tab is hidden or closed. pagehide is the reliable one on phones.
    global.addEventListener("pagehide", save);
    global.document.addEventListener("visibilitychange", function () {
      if (global.document.visibilityState === "hidden") save();
      else tick();
    });
    onChange();
  }

  global.CheeseCore = {
    version: SAVE_VERSION,
    tiers: TIERS,
    get state() { return state; },
    get roster() { return roster; },
    perClick: PER_CLICK,
    costOf: costOf,
    rateOf: rateOf,
    totalRate: totalRate,
    press: press,
    buy: buy,
    unlock: unlock,
    isUnlocked: isUnlocked,
    save: save,
    reset: reset,
    start: start
  };
})(window);
