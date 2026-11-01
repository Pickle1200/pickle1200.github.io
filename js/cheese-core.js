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
  var SAVE_VERSION = 3;
  // The version of this code. Bump it on every release, together with the
  // ?v= on the script tags. An older tab that sees a newer version has run
  // stops saving and asks to be refreshed, so it can never clash with it.
  var CODE_VERSION = 7;
  var CODE_KEY = "pk_cheese_code";
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

  /* ---------- staff upgrades (sold on /cheese) ----------
     Four per tier, each doubling that tier's output. One appears once you
     own 5, 15, 30 and 60 of that rat, priced at 25, 200, 5,000 and 100,000
     times the tier's first price. Modelled: early pacing barely changes, and
     after an hour or two you're making 2 to 5 times more. */
  var STAFF_UP_AT = [5, 15, 30, 60];
  var STAFF_UP_COST = [25, 200, 5000, 100000];
  var STAFF_UP_NAMES = [
    [["Free coffee", "The coffee is not free."],
     ["Keyboard shortcuts", "Ctrl+C, Ctrl+V, Ctrl+Cheese."],
     ["Return offer", "Suddenly very motivated."],
     ["Graduate scheme", "They\u2019re staying."]],
    [["Second monitor", "Twice the screens, twice the cheese."],
     ["Pivot tables", "Finally understood."],
     ["INDEX MATCH", "VLOOKUP is for interns."],
     ["Model audit", "Found the circular reference."]],
    [["Better slides", "Same content, nicer fonts."],
     ["Client lunch", "Expensed."],
     ["Deal team", "Associates can now delegate."],
     ["Promotion chat", "Not this year, but soon."]],
    [["Noise-cancelling headset", "Hears only cheese."],
     ["Second phone", "One for clients, one for cheese."],
     ["Corner desk", "Natural light. Output doubles."],
     ["Golf membership", "Most of the work happens on the ninth hole."]],
    [["Board seat", "Votes for more cheese, every time."],
     ["Chauffeur", "Reads the numbers on the way in."],
     ["Private office", "The door is always closed."],
     ["Bowler hat polish", "Morale has never been higher."]],
    [["Name on the door", "Brass, naturally."],
     ["Partners\u2019 dinner", "Nobody remembers who paid."],
     ["Second home", "In the Cotswolds. Works remotely."],
     ["Retirement, deferred", "Simply enjoys it too much."]]
  ];
  var STAFF_UPGRADES = [];
  for (var su = 0; su < STAFF_UP_NAMES.length; su++) {
    for (var sk = 0; sk < 4; sk++) {
      STAFF_UPGRADES.push({
        id: "s" + su + "_" + sk, tier: su, step: sk,
        at: STAFF_UP_AT[sk], cost: TIERS[su].cost * STAFF_UP_COST[sk],
        name: STAFF_UP_NAMES[su][sk][0], desc: STAFF_UP_NAMES[su][sk][1]
      });
    }
  }

  /* ---------- golden cheese bonuses (spawned by /cheese) ---------- */
  var GOLDEN = {
    windfall: { label: "Windfall" },
    // Tuned to be worth roughly one windfall each: a bull run adds about 50
    // seconds of output; busy paws rewards tapping without dwarfing everything.
    bull:     { label: "Bull run", mult: 3, seconds: 25 },
    paws:     { label: "Busy paws", mult: 5, seconds: 15 }
  };

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
      staffUps: {},         // staff upgrade id -> true
      buffs: { prodMult: 1, prodUntil: 0, pressMult: 1, pressUntil: 0 },
      goldenClicks: 0,
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
    if (d.staffUps && typeof d.staffUps === "object") {
      for (var x = 0; x < STAFF_UPGRADES.length; x++) {
        if (d.staffUps[STAFF_UPGRADES[x].id] === true) s.staffUps[STAFF_UPGRADES[x].id] = true;
      }
    }
    if (d.buffs && typeof d.buffs === "object") {
      // Only the bonuses golden cheese can actually give, so a save can't be edited into a cheat.
      if (d.buffs.prodMult === GOLDEN.bull.mult) { s.buffs.prodMult = GOLDEN.bull.mult; s.buffs.prodUntil = num(d.buffs.prodUntil); }
      if (d.buffs.pressMult === GOLDEN.paws.mult) { s.buffs.pressMult = GOLDEN.paws.mult; s.buffs.pressUntil = num(d.buffs.pressUntil); }
      var limit = Date.now() + 60000;
      if (s.buffs.prodUntil > limit) s.buffs.prodUntil = 0;
      if (s.buffs.pressUntil > limit) s.buffs.pressUntil = 0;
    }
    s.goldenClicks = whole(d.goldenClicks);
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
    if (d.v < 3) {
      // Version 3 launched the new economy and Sir Reginald, so everyone's game
      // was reset to give them the tutorial. Unlocked sections are kept: a
      // visitor who already opened the portfolio never finds it locked again.
      d = { v: 3, unlocked: d.unlocked };
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
  /* The roster is rolled once per visit and shared by every page and tab, so
     the main page and /cheese show the same staff. A visit ends after 30
     minutes with no activity; the next page load after that rolls new staff. */
  var ROSTER_KEY = "pk_cheese_roster";
  var VISIT_GAP_MS = 30 * 60 * 1000;
  var rosterIds = [];

  function rosterFromIds(ids) {
    return ids.map(function (j) { return { name: POOL[j][0], desc: POOL[j][1] }; });
  }
  function validIds(ids) {
    if (Object.prototype.toString.call(ids) !== "[object Array]" || ids.length !== TIERS.length) return false;
    var seenIds = {};
    for (var i = 0; i < ids.length; i++) {
      var j = ids[i];
      if (typeof j !== "number" || j % 1 !== 0 || j < 0 || j >= POOL.length || seenIds[j]) return false;
      seenIds[j] = true;
    }
    return true;
  }
  function readRoster() {
    try {
      var r = JSON.parse(rawGet(ROSTER_KEY));
      if (r && validIds(r.ids) && typeof r.seen === "number") return r;
    } catch (e) {}
    return null;
  }
  function writeRoster() {
    rawSet(ROSTER_KEY, JSON.stringify({ ids: rosterIds, seen: Date.now() }));
  }
  // allowNew: only a fresh page load may start a new visit and roll new staff.
  function useRoster(allowNew) {
    var r = readRoster();
    if (r && (!allowNew || Date.now() - r.seen < VISIT_GAP_MS)) {
      rosterIds = r.ids.slice();
    } else if (allowNew || !rosterIds.length) {
      var order = [];
      for (var k = 0; k < POOL.length; k++) order.push(k);
      rosterIds = [];
      for (var i = 0; i < TIERS.length; i++) {
        rosterIds.push(order.splice(Math.floor(Math.random() * order.length), 1)[0]);
      }
    }
    roster = rosterFromIds(rosterIds);
    writeRoster();
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
  var roster = [];
  useRoster(true);
  var lastTick = Date.now();
  var dirty = false;
  var onChange = function () {};
  var started = false;

  /* ---------- one active tab ----------
     If the game is open in several tabs (say / and /cheese), only the tab you
     are looking at plays. Switching to a tab makes it take over: the old tab
     saves and pauses, the new one loads that save and carries on. Paused tabs
     follow the save so their numbers stay current. */
  var outdated = false;
  var LOCK_KEY = "pk_cheese_active";
  var TAB_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);
  var active = true, claiming = false, claimTimer = null;
  var HANDOVER_WAIT_MS = 400;

  function lockOwner() {
    try { var l = JSON.parse(rawGet(LOCK_KEY)); return l && typeof l.id === "string" ? l.id : null; }
    catch (e) { return null; }
  }
  function activate() {
    clearTimeout(claimTimer);
    claiming = false;
    state = loadState();
    useRoster(false);
    lastTick = Date.now();
    active = true;
    dirty = false;
    onChange();
  }
  function claim() {
    if (!storageOK || claiming || outdated) return;   // already taking over, or out of date
    var owner = lockOwner();
    if (owner === TAB_ID && active) return;
    active = false;
    rawSet(LOCK_KEY, JSON.stringify({ id: TAB_ID, t: Date.now() }));
    if (!owner || owner === TAB_ID) { activate(); return; }
    // Another tab was playing: wait briefly for its final save, then load it.
    claiming = true;
    clearTimeout(claimTimer);
    claimTimer = setTimeout(activate, HANDOVER_WAIT_MS);
  }
  function onStorage(e) {
    if (!e || !e.key) return;
    if (e.key === CODE_KEY) { checkCode(e.newValue); return; }
    if (outdated) return;
    if (e.key === LOCK_KEY) {
      var id = null;
      try { id = JSON.parse(e.newValue).id; } catch (x) {}
      if (id && id !== TAB_ID && (active || claiming)) {
        if (active) save(true);          // hand over the latest progress
        active = false;
        claiming = false;
        clearTimeout(claimTimer);
        onChange();
      }
    } else if (e.key === ROSTER_KEY) {
      var r = readRoster();
      if (r && r.ids.join() !== rosterIds.join()) { rosterIds = r.ids.slice(); roster = rosterFromIds(rosterIds); onChange(); }
    } else if (e.key === SAVE_KEY) {
      if (claiming) activate();
      else if (!active) { state = loadState(); onChange(); }
    }
  }
  function isActive() { return active; }

  function checkCode(v) {
    v = Number(v);
    if (v > CODE_VERSION && !outdated) {
      if (active) save(true);            // hand over what we have, then stand down
      outdated = true;
      active = false;
      claiming = false;
      clearTimeout(claimTimer);
      onChange();
    }
  }
  function isOutdated() { return outdated; }

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
  // A tier is revealed once you own one, or once you've earned half its
  // first price in total. Until then pages show it greyed out, as "???".
  function tierRevealed(tier) {
    return tier === 0 || state.owned[tier] > 0 || state.lifetime >= TIERS[tier].cost / 2;
  }
  function revealAt(tier) { return TIERS[tier].cost / 2; }

  // Doubling from staff upgrades bought for this tier.
  function staffUpMultOf(tier) {
    var m = 1;
    for (var k = 0; k < 4; k++) if (state.staffUps["s" + tier + "_" + k]) m *= 2;
    return m;
  }

  // What one rat of this tier currently makes per second (before golden bonuses).
  function rateOf(tier) { return TIERS[tier].rate * multiplierOf(tier) * staffUpMultOf(tier); }

  function buffActive(kind) {
    var now = Date.now();
    if (kind === "bull") return state.buffs.prodMult > 1 && now < state.buffs.prodUntil;
    if (kind === "paws") return state.buffs.pressMult > 1 && now < state.buffs.pressUntil;
    return false;
  }
  function buffLeft(kind) {
    if (!buffActive(kind)) return 0;
    return ((kind === "bull" ? state.buffs.prodUntil : state.buffs.pressUntil) - Date.now()) / 1000;
  }
  function baseRate() {
    var t = 0;
    for (var i = 0; i < TIERS.length; i++) t += state.owned[i] * rateOf(i);
    return t;
  }
  function totalRate() {
    return baseRate() * (buffActive("bull") ? state.buffs.prodMult : 1);
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
    v = v + share * totalRate();
    return buffActive("paws") ? v * state.buffs.pressMult : v;
  }

  function press() {
    if (!active) { claim(); return; }
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
    if (!active) { claim(); return false; }
    if (!tierRevealed(tier)) return false;
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
    if (!active) { claim(); return; }
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
  /* ---------- staff upgrades ---------- */
  function staffUpById(id) {
    for (var i = 0; i < STAFF_UPGRADES.length; i++) if (STAFF_UPGRADES[i].id === id) return STAFF_UPGRADES[i];
    return null;
  }
  function hasStaffUp(id) { return state.staffUps[id] === true; }
  // Available to buy: you own enough of the rat and haven't bought it yet.
  function staffUpAvailable(id) {
    var u = staffUpById(id);
    return !!u && !hasStaffUp(id) && state.owned[u.tier] >= u.at;
  }
  function buyStaffUp(id) {
    if (!active) { claim(); return false; }
    var u = staffUpById(id);
    if (!u || !staffUpAvailable(id) || state.cheese < u.cost) return false;
    state.cheese -= u.cost;
    state.staffUps[id] = true;
    dirty = true;
    save();
    onChange();
    return true;
  }

  /* ---------- golden cheese ---------- */
  // Picks and applies a bonus. Returns {kind, label, amount} for the page to show.
  function claimGolden() {
    if (!active) { claim(); return null; }
    var roll = Math.random(), kind = roll < 0.5 ? "windfall" : roll < 0.85 ? "bull" : "paws";
    var out = { kind: kind, label: GOLDEN[kind].label, amount: 0 };
    if (kind === "windfall") {
      // 15% of what you hold or 10 minutes of output, whichever is smaller,
      // and never less than 25 presses' worth.
      var amt = Math.min(state.cheese * 0.15 + 13, baseRate() * 600 + 13);
      amt = Math.max(amt, perPress() * 25);
      earn(amt);
      out.amount = amt;
    } else if (kind === "bull") {
      state.buffs.prodMult = GOLDEN.bull.mult;
      state.buffs.prodUntil = Date.now() + GOLDEN.bull.seconds * 1000;
      out.mult = GOLDEN.bull.mult; out.seconds = GOLDEN.bull.seconds;
    } else {
      state.buffs.pressMult = GOLDEN.paws.mult;
      state.buffs.pressUntil = Date.now() + GOLDEN.paws.seconds * 1000;
      out.mult = GOLDEN.paws.mult; out.seconds = GOLDEN.paws.seconds;
    }
    state.goldenClicks++;
    dirty = true;
    save();
    onChange();
    return out;
  }

  function buyUpgrade(id) {
    if (!active) { claim(); return false; }
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
    if (!active) return false;
    state.unlocked[id] = true;
    save();
    return true;
  }
  function isUnlocked(id) { return state.unlocked[id] === true; }

  function tick() {
    var now = Date.now();
    var dt = (now - lastTick) / 1000;
    lastTick = now;
    if (!active || dt <= 0) return;
    if (dt > MAX_STEP_SECONDS) dt = MAX_STEP_SECONDS;
    var r = totalRate();
    if (r > 0) { earn(r * dt); onChange(); }
  }

  function save(force) {
    if (newerSaveExists || outdated) return;
    if (!active && force !== true) return;
    state.savedAt = Date.now();
    rawSet(SAVE_KEY, JSON.stringify(state));
    writeRoster();                       // activity keeps the visit (and its staff) going
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
    global.addEventListener("pagehide", function () {
      save();
      // Give up the claim on closing, so the next page load starts instantly.
      if (active && lockOwner() === TAB_ID) rawRemove(LOCK_KEY);
    });
    global.document.addEventListener("visibilitychange", function () {
      if (global.document.visibilityState === "hidden") save();
      else { claim(); tick(); }
    });
    global.addEventListener("focus", claim);
    global.addEventListener("storage", onStorage);
    var seenCode = Number(rawGet(CODE_KEY)) || 0;
    if (seenCode > CODE_VERSION) checkCode(seenCode);
    else if (seenCode < CODE_VERSION) rawSet(CODE_KEY, String(CODE_VERSION));
    claim();
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
    tierRevealed: tierRevealed,
    revealAt: revealAt,
    nextMilestone: nextMilestone,
    format: format,
    totalRate: totalRate,
    press: press,
    buy: buy,
    unlock: unlock,
    isUnlocked: isUnlocked,
    save: save,
    reset: reset,
    staffUpgrades: STAFF_UPGRADES,
    staffUpMultOf: staffUpMultOf,
    hasStaffUp: hasStaffUp,
    staffUpAvailable: staffUpAvailable,
    buyStaffUp: buyStaffUp,
    claimGolden: claimGolden,
    golden: GOLDEN,
    buffActive: buffActive,
    buffLeft: buffLeft,
    baseRate: baseRate,
    isActive: isActive,
    isOutdated: isOutdated,
    start: start
  };
})(window);
