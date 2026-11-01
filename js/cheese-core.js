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
  var SAVE_VERSION = 2;
  var TICK_MS = 200;
  var AUTOSAVE_MS = 5000;
  // Longest gap that still pays out. Background tabs tick at least once a
  // minute, so AFK with the tab open earns normally. A laptop asleep overnight
  // only earns this much on waking instead of the whole night.
  var MAX_STEP_SECONDS = 90;

  /* ---------- economy ----------
     Each tier's first rat pays for itself in about 15, 25, 45, 80, 140 and 240
     seconds. Later tiers are slower on paper, but when you first reach one it
     pays back about twice as fast as the best older tier at that moment.
     Every rat costs 35% more than the last of its tier, and a tier's output
     doubles at 10, 25, 50 and 100 owned (50 and 100 are mainly reachable on
     /cheese with upgrades and rebirth). Modelled pacing: a new tier every few
     minutes, the top tier at around 30 minutes, then the main page slows. */
  var TIERS = [
    { cost: 12,       rate: 0.8 },
    { cost: 150,      rate: 6 },
    { cost: 2500,     rate: 55 },
    { cost: 40000,    rate: 500 },
    { cost: 700000,   rate: 5000 },
    { cost: 12000000, rate: 50000 }
  ];
  var COST_GROWTH = 1.35;
  var MILESTONES = [10, 25, 50, 100];
  var BASE_PRESS = 1;

  /* ---------- tap upgrades: one-off purchases ----------
     The first two double each press. After that, presses also earn a share of
     your cheese per second, so tapping stays worth it once rats take over.
     Each appears on the page once lifetime cheese reaches half its price. */
  var UPGRADES = [
    { id: "tap1", cost: 100,       press: 2,   name: "Second paw",
      desc: "Presses give twice as much. Productivity up 100%. Morale unchanged." },
    { id: "tap2", cost: 1500,      press: 2,   name: "Ergonomic lever",
      desc: "Twice as much again. Signed off by health and safety, eventually." },
    { id: "tap3", cost: 20000,     share: 0.01, name: "Performance-related pay",
      desc: "Each press also earns 1% of your cheese per second." },
    { id: "tap4", cost: 1000000,   share: 0.02, name: "Bonus season",
      desc: "Each press earns a further 2% of your cheese per second." },
    { id: "tap5", cost: 100000000, share: 0.05, name: "Carried interest",
      desc: "Each press earns a further 5% of your cheese per second. Taxed as cheese." }
  ];
  var BUY_MODES = [1, 10, 0];   // 0 means max

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
      upgrades: {},         // upgrade id -> true
      buyMode: 1,           // 1, 10, or 0 for max
      reginald: { done: false, seen: [], factsOff: false },
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
    if (d.upgrades && typeof d.upgrades === "object") {
      for (var u = 0; u < UPGRADES.length; u++) {
        if (d.upgrades[UPGRADES[u].id] === true) s.upgrades[UPGRADES[u].id] = true;
      }
    }
    if (BUY_MODES.indexOf(d.buyMode) !== -1) s.buyMode = d.buyMode;
    if (d.reginald && typeof d.reginald === "object") {
      s.reginald.done = d.reginald.done === true;
      s.reginald.factsOff = d.reginald.factsOff === true;
      if (Object.prototype.toString.call(d.reginald.seen) === "[object Array]") {
        for (var r = 0; r < d.reginald.seen.length && r < 50; r++) {
          var id = d.reginald.seen[r];
          if (typeof id === "string" && id.length <= 20) s.reginald.seen.push(id);
        }
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
    if (d.v === 1) {
      // v1 used the old economy. Rats bought under it would be wildly
      // overpowered now, so refund what they cost and let the player rebuy.
      var OLD_BASE = [12, 60, 260, 900, 2600, 6500];
      var refund = 0;
      if (Object.prototype.toString.call(d.owned) === "[object Array]") {
        for (var t = 0; t < OLD_BASE.length; t++) {
          var c = OLD_BASE[t], n = Math.min(whole(d.owned[t]), 400);
          for (var k = 0; k < n; k++) { refund += c; c = Math.ceil(c * 1.55); }
        }
      }
      d.cheese = num(d.cheese) + (isFinite(refund) ? refund : 0);
      d.owned = [];
      d.v = 2;
    }
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

  /* ---------- number formatting: 999, 1.23K, 45.6M, 789B, 1.5T, then 1.23e15 ---------- */
  var UNITS = ["", "K", "M", "B", "T"];
  function format(n, decimalsBelow100) {
    if (!isFinite(n)) return "\u221e";
    if (n < 0) return "-" + format(-n, decimalsBelow100);
    if (n < 1000) {
      if (n >= 100 || !decimalsBelow100) return String(Math.floor(n));
      return String(Math.floor(n * 10) / 10);
    }
    var e = Math.floor(Math.log10(n));
    if (e >= 15) {
      var m = Math.floor(n / Math.pow(10, e) * 100) / 100;
      if (m >= 10) { m = 1; e++; }
      return m.toFixed(2) + "e" + e;
    }
    var u = Math.floor(e / 3), v = n / Math.pow(1000, u);
    var d = v < 10 ? 2 : v < 100 ? 1 : 0;
    var f = Math.pow(10, d);
    v = Math.floor(v * f) / f;      // round down so you never see more than you have
    if (v >= 1000) return format(Math.pow(1000, u + 1), decimalsBelow100);
    return v.toFixed(d) + UNITS[u];
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
    return Math.ceil(TIERS[tier].cost * Math.pow(COST_GROWTH, state.owned[tier]));
  }
  // Output multiplier from milestones: x2 at 10, x4 at 25, x8 at 50, x16 at 100.
  function multiplierOf(tier) {
    var n = state.owned[tier], m = 1;
    for (var i = 0; i < MILESTONES.length; i++) if (n >= MILESTONES[i]) m *= 2;
    return m;
  }
  function nextMilestone(tier) {
    var n = state.owned[tier];
    for (var i = 0; i < MILESTONES.length; i++) if (n < MILESTONES[i]) return MILESTONES[i];
    return null;
  }
  // What one rat of this tier currently makes per second.
  function rateOf(tier) { return TIERS[tier].rate * multiplierOf(tier); }
  function totalRate() {
    var t = 0;
    for (var i = 0; i < TIERS.length; i++) t += state.owned[i] * rateOf(i);
    return t;
  }

  /* ---------- pressing ---------- */
  function perPress() {
    var v = BASE_PRESS, share = 0;
    for (var i = 0; i < UPGRADES.length; i++) {
      var u = UPGRADES[i];
      if (!state.upgrades[u.id]) continue;
      if (u.press) v *= u.press;
      if (u.share) share += u.share;
    }
    return v + share * totalRate();
  }

  function press() {
    earn(perPress());
    state.clicks++;
    onChange();
  }

  /* ---------- hiring in bulk ---------- */
  // Price of the next k rats of a tier, each priced individually like single buys.
  function costOfMany(tier, k) {
    var base = TIERS[tier].cost, n = state.owned[tier], total = 0;
    for (var i = 0; i < k; i++) total += Math.ceil(base * Math.pow(COST_GROWTH, n + i));
    return total;
  }
  // How many rats of a tier you can afford right now (capped to keep it quick).
  function maxAffordable(tier) {
    var base = TIERS[tier].cost, n = state.owned[tier], left = state.cheese, k = 0;
    while (k < 1000) {
      var c = Math.ceil(base * Math.pow(COST_GROWTH, n + k));
      if (c > left) break;
      left -= c; k++;
    }
    return k;
  }
  // What the current buy mode means for this tier: how many, and for how much.
  // Buy 1 and buy 10 are all or nothing. Max buys as many as you can afford,
  // and when that is none it shows the price of one.
  function quote(tier) {
    var mode = state.buyMode, k;
    if (mode === 0) k = Math.max(1, maxAffordable(tier));
    else k = mode;
    var c = costOfMany(tier, k);
    return { count: k, cost: c, affordable: state.cheese >= c };
  }

  function buy(tier) {
    var q = quote(tier);
    if (!q.affordable) return false;
    state.cheese -= q.cost;
    if (state.cheese < 0) state.cheese = 0;
    state.owned[tier] += q.count;
    dirty = true;
    save();               // purchases are worth saving straight away
    onChange();
    return true;
  }

  function setBuyMode(mode) {
    if (BUY_MODES.indexOf(mode) === -1) return;
    state.buyMode = mode;
    dirty = true;
    onChange();
  }

  /* ---------- upgrades ---------- */
  function upgradeById(id) {
    for (var i = 0; i < UPGRADES.length; i++) if (UPGRADES[i].id === id) return UPGRADES[i];
    return null;
  }
  function hasUpgrade(id) { return state.upgrades[id] === true; }
  function upgradeVisible(id) {
    var u = upgradeById(id);
    return !!u && (hasUpgrade(id) || state.lifetime >= u.cost / 2);
  }
  function buyUpgrade(id) {
    var u = upgradeById(id);
    if (!u || hasUpgrade(id) || state.cheese < u.cost) return false;
    state.cheese -= u.cost;
    state.upgrades[id] = true;
    dirty = true;
    save();
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
    upgrades: UPGRADES,
    perPress: perPress,
    costOf: costOf,
    costOfMany: costOfMany,
    maxAffordable: maxAffordable,
    quote: quote,
    setBuyMode: setBuyMode,
    hasUpgrade: hasUpgrade,
    upgradeVisible: upgradeVisible,
    buyUpgrade: buyUpgrade,
    rateOf: rateOf,
    multiplierOf: multiplierOf,
    nextMilestone: nextMilestone,
    format: format,
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
