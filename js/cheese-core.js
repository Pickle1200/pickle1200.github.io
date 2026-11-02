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
  var CODE_VERSION = 12;
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

  /* ---------- the Recruiter: an auto-buyer, hired once on /cheese ----------
     Buys whatever pays for itself fastest, rats or staff upgrades, waiting for
     the best option rather than wasting cheese on a worse one. One hire every
     1.5 seconds so you can watch it work. */
  var RECRUITER = { cost: 25000, everyMs: [0, 5000, 2000, 1500] };   // by level; level 3 also buys staff upgrades

  /* ---------- rebirth: selling the company ----------
     Selling resets the run and pays shares for all the cheese you have ever
     earned: total shares = cube root of (all-time cheese / 1 million), so each
     sale is worth waiting for. Every share earned boosts output by 5% for good,
     and shares can also be spent in the permanent shop without losing that
     boost. Modelled: first sale around 50 minutes for 10 shares; each later
     run gets back to the previous total far faster (60, 38, 28, 22, 17 min). */
  var SHARE_SCALE = 1e6;
  var SHARE_BONUS = 0.05;
  var SHOP = [
    { id: "grip1",     cost: 2,   name: "Firm grip I",          desc: "Presses give three times as much.", press: 3 },
    { id: "seed1",     cost: 3,   name: "Seed funding I",       desc: "Start every run with 5K cheese.", start: 5000 },
    { id: "contacts1", cost: 8,   name: "Market contacts I",    desc: "Golden cheese turns up 30% more often.", golden: 1.3 },
    { id: "grip2",     cost: 15,  name: "Firm grip II",         desc: "Presses give three times as much again.", press: 3, needs: "grip1" },
    { id: "seed2",     cost: 20,  name: "Seed funding II",      desc: "Start every run with 500K cheese.", start: 500000, needs: "seed1" },
    { id: "recruit1",  cost: 25,  name: "Recruiter I",          desc: "Hires the best-value rat for you, one every 5 seconds.", recruiter: 1 },
    { id: "contacts2", cost: 30,  name: "Market contacts II",   desc: "Golden cheese turns up 30% more often again.", golden: 1.3, needs: "contacts1" },
    { id: "retain",    cost: 40,  name: "Retention bonus",      desc: "Keep each tier\u2019s first staff upgrade when you sell." },
    { id: "value1",    cost: 50,  name: "Shareholder value I",  desc: "Each share boosts output by 6% instead of 5%.", bonus: 0.01 },
    { id: "recruit2",  cost: 60,  name: "Recruiter II",         desc: "The Recruiter hires every 2 seconds.", recruiter: 2, needs: "recruit1" },
    { id: "seed3",     cost: 120, name: "Seed funding III",     desc: "Start every run with 50M cheese.", start: 50000000, needs: "seed2" },
    { id: "recruit3",  cost: 150, name: "Recruiter III",        desc: "Every 1.5 seconds, and buys staff upgrades too.", recruiter: 3, needs: "recruit2" },
    { id: "value2",    cost: 150, name: "Shareholder value II", desc: "Each share boosts output by 7%.", bonus: 0.01, needs: "value1" }
  ];
  /* ---------- achievements: +1% output each, kept for good ---------- */
  var ACH_BONUS = 0.01;
  function totalOwned(st) { var t = 0; for (var i = 0; i < st.owned.length; i++) t += st.owned[i]; return t; }
  var ACHIEVEMENTS = [
    // cheese earned, all time
    { id: "c1", name: "First wedge",        desc: "Earn 100 cheese.",              test: function (st) { return st.allTime >= 100; } },
    { id: "c2", name: "Small cheese",       desc: "Earn 10K cheese.",              test: function (st) { return st.allTime >= 1e4; } },
    { id: "c3", name: "Big cheese",         desc: "Earn 1M cheese.",               test: function (st) { return st.allTime >= 1e6; } },
    { id: "c4", name: "Cheese baron",       desc: "Earn 1B cheese.",               test: function (st) { return st.allTime >= 1e9; } },
    { id: "c5", name: "Cheese magnate",     desc: "Earn 1T cheese.",               test: function (st) { return st.allTime >= 1e12; } },
    { id: "c6", name: "Too big to fail",    desc: "Earn 1e15 cheese.",             test: function (st) { return st.allTime >= 1e15; } },
    // output
    { id: "r1", name: "Passive income",     desc: "Make 10 cheese a second.",      test: function (st) { return st.bestRate >= 10; } },
    { id: "r2", name: "Cash cow",           desc: "Make 1K cheese a second.",      test: function (st) { return st.bestRate >= 1e3; } },
    { id: "r3", name: "Money printer",      desc: "Make 1M cheese a second.",      test: function (st) { return st.bestRate >= 1e6; } },
    { id: "r4", name: "Quantitative easing", desc: "Make 1B cheese a second.",     test: function (st) { return st.bestRate >= 1e9; } },
    // pressing
    { id: "p1", name: "Hands-on",           desc: "Press 100 times.",              test: function (st) { return st.clicks >= 100; } },
    { id: "p2", name: "Repetitive strain",  desc: "Press 1,000 times.",            test: function (st) { return st.clicks >= 1000; } },
    { id: "p3", name: "Day trader",         desc: "Press 10,000 times.",           test: function (st) { return st.clicks >= 10000; } },
    // staff and upgrades
    { id: "h1", name: "Now hiring",         desc: "Hire your first rat.",          test: function (st) { return st.hired >= 1; } },
    { id: "h2", name: "Milestone",          desc: "Own 10 of one kind of rat.",    test: function (st) { return Math.max.apply(null, st.owned) >= 10; } },
    { id: "h3", name: "Full house",         desc: "Own at least one of every rat.", test: function (st) { return st.owned.every(function (n) { return n > 0; }); } },
    { id: "h4", name: "Headcount",          desc: "Own 100 rats at once.",         test: function (st) { return totalOwned(st) >= 100; } },
    { id: "h5", name: "Bulk discount",      desc: "Own 100 of one kind of rat.",   test: function (st) { return Math.max.apply(null, st.owned) >= 100; } },
    { id: "u1", name: "Investing in people", desc: "Buy a staff upgrade.",         test: function (st) { return Object.keys(st.staffUps).length >= 1; } },
    { id: "u2", name: "Fully kitted",       desc: "Own every press upgrade in one run.", test: function (st) { return Object.keys(st.upgrades).length >= UPGRADES.length; } },
    { id: "g1", name: "Gold standard",      desc: "Click a golden cheese.",        test: function (st) { return st.goldenClicks >= 1; } },
    { id: "g2", name: "Gold rush",          desc: "Click 25 golden cheeses.",      test: function (st) { return st.goldenClicks >= 25; } },
    // the company
    { id: "s1", name: "Exit strategy",      desc: "Sell the company.",             test: function (st) { return st.runs >= 1; } },
    { id: "s2", name: "Serial entrepreneur", desc: "Sell the company 5 times.",    test: function (st) { return st.runs >= 5; } },
    { id: "s3", name: "Major shareholder",  desc: "Earn 50 shares.",               test: function (st) { return st.sharesEarned >= 50; } },
    { id: "s4", name: "Automated",          desc: "Bring in the Recruiter.",       test: function (st) { return st.perma.recruit1 === true; } },
    // the portfolio, and a secret
    { id: "x1", name: "Due diligence",      desc: "Open every section of the portfolio.", test: function (st) { return ["b-about", "b-projects", "b-games", "b-cv", "b-hidden"].every(function (b) { return st.unlocked[b]; }); } },
    { id: "x2", name: "Night owl",          desc: "Play between 2am and 4am.", secret: true,
      test: function () { var h = new Date().getHours(); return h >= 2 && h < 4; } }
  ];

  function shopItem(id) { for (var i = 0; i < SHOP.length; i++) if (SHOP[i].id === id) return SHOP[i]; return null; }
  function recruiterLevelOf(perma) {
    var l = 0;
    for (var i = 0; i < SHOP.length; i++) if (SHOP[i].recruiter && perma[SHOP[i].id]) l = Math.max(l, SHOP[i].recruiter);
    return l;
  }
  function sharesFor(allTime) { return Math.floor(Math.cbrt(Math.max(0, allTime) / SHARE_SCALE) + 1e-9); }

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
      recruiter: { hired: false, on: false },
      allTime: 0,           // all cheese ever earned, across every run
      runs: 0,              // times the company has been sold
      sharesEarned: 0,
      perma: {},            // permanent shop item id -> true
      achievements: {},     // achievement id -> time earned
      bestRate: 0,          // highest cheese per second ever reached
      hired: 0,             // rats hired, all time
      pressCheese: 0,       // cheese earned by pressing, all time
      playSeconds: 0,       // time spent playing with the page open
      runSeconds: 0,        // time spent in this run
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
    s.allTime = Math.max(num(d.allTime), s.lifetime);
    s.runs = whole(d.runs);
    // Shares can never exceed what all-time cheese pays for.
    s.sharesEarned = Math.min(whole(d.sharesEarned), sharesFor(s.allTime));
    if (d.perma && typeof d.perma === "object") {
      for (var pi = 0; pi < SHOP.length; pi++) {
        var it = SHOP[pi];
        if (d.perma[it.id] === true && (!it.needs || s.perma[it.needs])) s.perma[it.id] = true;
      }
    }
    // And you can't own more than your shares paid for: drop the priciest extras.
    var spentNow = function () { var t = 0; for (var k in s.perma) t += shopItem(k).cost; return t; };
    for (var guard = 0; spentNow() > s.sharesEarned && guard < 50; guard++) {
      var worst = null;
      for (var k2 in s.perma) {
        var dependents = SHOP.some(function (x) { return x.needs === k2 && s.perma[x.id]; });
        if (!dependents && (!worst || shopItem(k2).cost > shopItem(worst).cost)) worst = k2;
      }
      delete s.perma[worst];
    }
    s.recruiter.hired = recruiterLevelOf(s.perma) > 0;
    if (d.achievements && typeof d.achievements === "object") {
      for (var ai = 0; ai < ACHIEVEMENTS.length; ai++) {
        var at = d.achievements[ACHIEVEMENTS[ai].id];
        if (typeof at === "number" && isFinite(at) && at > 0) s.achievements[ACHIEVEMENTS[ai].id] = at;
      }
    }
    s.bestRate = num(d.bestRate);
    s.hired = whole(d.hired);
    s.pressCheese = Math.min(num(d.pressCheese), s.allTime);
    s.playSeconds = num(d.playSeconds);
    s.runSeconds = Math.min(num(d.runSeconds), s.playSeconds);
    s.recruiter.on = s.recruiter.hired && !(d.recruiter && d.recruiter.on === false);
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
    state.allTime += amount;
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
    // All-time cheese, so a tier revealed in an earlier run stays revealed.
    return tier === 0 || state.owned[tier] > 0 || state.allTime >= TIERS[tier].cost / 2;
  }
  function revealAt(tier) { return TIERS[tier].cost / 2; }

  // Doubling from staff upgrades bought for this tier.
  function staffUpMultOf(tier) {
    var m = 1;
    for (var k = 0; k < 4; k++) if (state.staffUps["s" + tier + "_" + k]) m *= 2;
    return m;
  }

  // What one rat of this tier currently makes per second (before golden bonuses).
  function rateOf(tier) { return TIERS[tier].rate * multiplierOf(tier) * staffUpMultOf(tier) * shareMult() * achievementMult(); }

  /* ---------- achievements ---------- */
  function achievementCount() { var n = 0; for (var k in state.achievements) n++; return n; }
  function achievementMult() { return 1 + ACH_BONUS * achievementCount(); }
  function hasAchievement(id) { return !!state.achievements[id]; }
  var newAchievements = [];
  function checkAchievements() {
    for (var i = 0; i < ACHIEVEMENTS.length; i++) {
      var a = ACHIEVEMENTS[i];
      if (state.achievements[a.id]) continue;
      var got = false;
      try { got = a.test(state); } catch (e) {}
      if (got) { state.achievements[a.id] = Date.now(); newAchievements.push(a); dirty = true; }
    }
  }
  // The page collects newly earned ones to announce them.
  function takeNewAchievements() { var out = newAchievements; newAchievements = []; return out; }

  /* ---------- shares and the permanent shop ---------- */
  function owns(id) { return state.perma[id] === true; }
  function perShare() {
    var b = SHARE_BONUS;
    for (var i = 0; i < SHOP.length; i++) if (SHOP[i].bonus && owns(SHOP[i].id)) b += SHOP[i].bonus;
    return b;
  }
  function shareMult() { return 1 + perShare() * state.sharesEarned; }
  function sharesSpent() { var t = 0; for (var k in state.perma) t += shopItem(k).cost; return t; }
  function sharesFree() { return state.sharesEarned - sharesSpent(); }
  function pendingShares() { return Math.max(0, sharesFor(state.allTime) - state.sharesEarned); }
  // All-time cheese still needed for one more share than a sale would pay now.
  function cheeseToNextShare() {
    var next = sharesFor(state.allTime) + 1;
    return Math.max(0, SHARE_SCALE * next * next * next - state.allTime);
  }
  function pressMult() {
    var m = 1;
    for (var i = 0; i < SHOP.length; i++) if (SHOP[i].press && owns(SHOP[i].id)) m *= SHOP[i].press;
    return m;
  }
  function startCheese() {
    var c = 0;
    for (var i = 0; i < SHOP.length; i++) if (SHOP[i].start && owns(SHOP[i].id)) c = Math.max(c, SHOP[i].start);
    return c;
  }
  // Golden cheese gaps are divided by this.
  function goldenFrequency() {
    var f = 1;
    for (var i = 0; i < SHOP.length; i++) if (SHOP[i].golden && owns(SHOP[i].id)) f *= SHOP[i].golden;
    return f;
  }
  function recruiterLevel() { return recruiterLevelOf(state.perma); }
  function shopAvailable(id) {
    var it = shopItem(id);
    return !!it && !owns(id) && (!it.needs || owns(it.needs));
  }
  function buyPerma(id) {
    if (!active) { claim(); return false; }
    var it = shopItem(id);
    if (!it || !shopAvailable(id) || sharesFree() < it.cost) return false;
    state.perma[id] = true;
    if (it.recruiter && it.recruiter === 1) { state.recruiter.hired = true; state.recruiter.on = true; }
    dirty = true; save(); onChange();
    return true;
  }

  // Sell the company: bank the shares, start a fresh run.
  function sell() {
    if (!active) { claim(); return null; }
    var gained = pendingShares();
    if (gained < 1) return null;
    state.sharesEarned += gained;
    state.runs++;
    var start = startCheese();
    state.cheese = start;
    state.lifetime = start;
    state.owned = TIERS.map(function () { return 0; });
    state.upgrades = {};
    var kept = {};
    if (owns("retain")) for (var k in state.staffUps) if (/_0$/.test(k)) kept[k] = true;
    state.staffUps = kept;
    state.buffs = { prodMult: 1, prodUntil: 0, pressMult: 1, pressUntil: 0 };
    state.runSeconds = 0;
    lastHire = 0;
    checkAchievements();
    dirty = true; save(); onChange();
    return { shares: gained, total: state.sharesEarned, mult: shareMult() };
  }

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
    var v = BASE_PRESS * pressMult(), share = 0;
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
    var v = perPress();
    earn(v);
    state.pressCheese += v;
    state.clicks++;
    checkAchievements();
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

  function buyOne(tier) {
    var c = costOf(tier);
    if (!tierRevealed(tier) || state.cheese < c) return false;
    state.cheese -= c;
    state.owned[tier]++;
    state.hired++;
    dirty = true;
    return true;
  }

  function buy(tier) {
    if (!active) { claim(); return false; }
    if (!tierRevealed(tier)) return false;
    var q = quote(tier);
    if (!q.affordable) return false;
    state.cheese -= q.cost;
    if (state.cheese < 0) state.cheese = 0;
    state.owned[tier] += q.count;
    state.hired += q.count;
    checkAchievements();
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

  /* ---------- the Recruiter ---------- */
  // Output gained by one more rat of a tier, counting any milestone it reaches.
  function gainFromRat(tier) {
    var n = state.owned[tier], per = TIERS[tier].rate * staffUpMultOf(tier) * shareMult() * achievementMult();
    var m0 = 1, m1 = 1;
    for (var i = 0; i < MILESTONES.length; i++) { if (n >= MILESTONES[i]) m0 *= 2; if (n + 1 >= MILESTONES[i]) m1 *= 2; }
    return per * ((n + 1) * m1 - n * m0);
  }
  // Every option the Recruiter considers, best first: lowest wait plus payback.
  function recruiterOptions() {
    var opts = [], rate = baseRate() + 0.001, i;
    for (i = 0; i < TIERS.length; i++) {
      if (!tierRevealed(i)) continue;
      var c = costOf(i), g = gainFromRat(i);
      if (g > 0) opts.push({ type: "rat", tier: i, cost: c, gain: g });
    }
    for (i = 0; i < STAFF_UPGRADES.length; i++) {
      var u = STAFF_UPGRADES[i];
      if (recruiterLevel() < 3) break;   // only Recruiter III buys staff upgrades
      if (!staffUpAvailable(u.id)) continue;
      var gu = rateOf(u.tier) * state.owned[u.tier];     // doubling adds the tier's current output
      if (gu > 0) opts.push({ type: "staff", id: u.id, tier: u.tier, name: u.name, cost: u.cost, gain: gu });
    }
    opts.forEach(function (o) {
      o.payback = o.cost / o.gain;
      o.wait = Math.max(0, (o.cost - state.cheese) / rate);
      o.score = o.wait + o.payback;
    });
    opts.sort(function (a, b) { return a.score - b.score; });
    return opts;
  }
  function recruiterNext() { return recruiterOptions()[0] || null; }

  function hireRecruiter() {
    if (!active) { claim(); return false; }
    if (!RECRUITER_FOR_SALE || state.recruiter.hired || state.cheese < RECRUITER.cost) return false;
    state.cheese -= RECRUITER.cost;
    state.recruiter.hired = true;
    state.recruiter.on = true;
    dirty = true; save(); onChange();
    return true;
  }
  // The Recruiter comes from the permanent shop, never for cheese.
  var RECRUITER_FOR_SALE = false;
  function recruiterVisible() { return state.recruiter.hired || (RECRUITER_FOR_SALE && state.lifetime >= RECRUITER.cost / 2); }
  function setRecruiter(on) {
    if (!active) { claim(); return; }
    if (!state.recruiter.hired) return;
    state.recruiter.on = on === true;
    dirty = true; save(); onChange();
  }

  var lastHire = 0, recruiterHires = 0;
  function recruiterStep() {
    if (!active || !state.recruiter.on) return;
    var now = Date.now();
    var lvl = recruiterLevel();
    if (lvl < 1 || now - lastHire < RECRUITER.everyMs[lvl]) return;
    var best = recruiterNext();
    if (!best || state.cheese < best.cost) return;      // wait for the best option
    var done = best.type === "rat" ? buyOne(best.tier)
      : (state.cheese -= best.cost, state.staffUps[best.id] = true, dirty = true, true);
    if (done) { lastHire = now; recruiterHires++; onChange(); }
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
    if (r > state.bestRate) state.bestRate = r;
    if (!global.document || global.document.visibilityState !== "hidden") {
      state.playSeconds += dt;
      state.runSeconds += dt;
    }
    if (r > 0) { earn(r * dt); onChange(); }
    recruiterStep();
    checkAchievements();
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
    recruiter: RECRUITER,
    recruiterNext: recruiterNext,
    recruiterOptions: recruiterOptions,
    recruiterVisible: recruiterVisible,
    hireRecruiter: hireRecruiter,
    setRecruiter: setRecruiter,
    gainFromRat: gainFromRat,
    claimGolden: claimGolden,
    shop: SHOP,
    achievements: ACHIEVEMENTS,
    hasAchievement: hasAchievement,
    achievementCount: achievementCount,
    achievementMult: achievementMult,
    takeNewAchievements: takeNewAchievements,
    sharesFor: sharesFor,
    shareMult: shareMult,
    perShare: perShare,
    sharesFree: sharesFree,
    sharesSpent: sharesSpent,
    pendingShares: pendingShares,
    cheeseToNextShare: cheeseToNextShare,
    goldenFrequency: goldenFrequency,
    recruiterLevel: recruiterLevel,
    owns: owns,
    shopAvailable: shopAvailable,
    buyPerma: buyPerma,
    sell: sell,
    golden: GOLDEN,
    buffActive: buffActive,
    buffLeft: buffLeft,
    baseRate: baseRate,
    isActive: isActive,
    isOutdated: isOutdated,
    start: start
  };
})(window);
