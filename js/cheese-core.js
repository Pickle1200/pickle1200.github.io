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
  var SAVE_VERSION = 4;
  // The version of this code. Bump it on every release, together with the
  // ?v= on the script tags. An older tab that sees a newer version has run
  // stops saving and asks to be refreshed, so it can never clash with it.
  var CODE_VERSION = 23;
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
  // The first six are on both pages. Managing Partner and CEO are in every
  // run on /cheese; the last three unlock after your 1st, 3rd and 5th sale.
  // Each tier costs about 16 times the last and produces 10 times as much.
  var TIERS = [
    { cost: 12,       rate: 0.8 },
    { cost: 150,      rate: 6 },
    { cost: 2500,     rate: 55 },
    { cost: 40000,    rate: 500 },
    { cost: 700000,   rate: 5000 },
    { cost: 12000000, rate: 50000 },
    { cost: 2e8,      rate: 5e5 },
    { cost: 3.5e9,    rate: 5e6 },
    { cost: 6e10,     rate: 5e7, needRuns: 1 },
    { cost: 1e12,     rate: 5e8, needRuns: 3 },
    { cost: 1.7e13,   rate: 5e9, needRuns: 5 }
  ];
  var MAIN_PAGE_TIERS = 6;
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
     ["Retirement, deferred", "Simply enjoys it too much."]],
    [["Leather briefcase", "Contains one sandwich and a strategy."],
     ["Corner office", "Two windows. Output doubles."],
     ["Client portfolio", "Inherited from a retiring partner, gratefully."],
     ["Managing the managers", "Delegation, perfected."]],
    [["Aviator sunglasses", "Indoors. Always."],
     ["Earnings call", "Beat expectations by sounding confident."],
     ["Private jet", "Strictly for business. Mostly."],
     ["Visionary memo", "Nobody read it. Everyone agreed."]],
    [["Heavier gavel", "Meetings end sooner."],
     ["Boardroom biscuits", "Attendance up 40%."],
     ["Casting vote", "Always for more cheese."],
     ["Annual general meeting", "Shareholders reassured, briefly."]],
    [["Grey hoodie", "Signals genius."],
     ["Garage origin story", "Repeated at every opportunity."],
     ["Pivot", "From cheese, to cheese, but with an app."],
     ["Founder mode", "Sleeps under the desk. Output doubles."]],
    [["Printing press", "Strictly for cheese."],
     ["Forward guidance", "Hints at more cheese. Markets rally."],
     ["Quantitative easing", "Buys cheese with newly made cheese."],
     ["Independence", "Answers to no one but the cheese."]]
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
     Selling resets the run and pays shares for the company's value (cheese in
     hand plus what its staff and staff upgrades cost). Total shares = cube root
     of (total value of every company sold / 1 million), so each sale is worth
     waiting for and splitting one sale into many small ones gains nothing. Every share earned boosts output by 5% for good,
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
    { id: "value2",    cost: 150, name: "Shareholder value II", desc: "Each share boosts output by 7%.", bonus: 0.01, needs: "value1" },
    { id: "parachute", cost: 12,  name: "Golden parachute",     desc: "Golden cheese stays for 20 seconds instead of 12." },
    { id: "windfall",  cost: 25,  name: "Lucky windfalls",      desc: "Golden cheese windfalls are 50% bigger." },
    { id: "insight",   cost: 30,  name: "Market insight",       desc: "See what the market will do next." },
    { id: "lunch",     cost: 30,  name: "Long lunch",           desc: "Board decision effects last 50% longer." },
    { id: "search",    cost: 35,  name: "Executive search",     desc: "Start every run with 10 Interns and 5 Analysts." },
    { id: "rainmaker", cost: 40,  name: "Rainmaker",            desc: "Contract rewards are 50% bigger." },
    { id: "retainer",  cost: 45,  name: "Big Four retainer",    desc: "Consultants\u2019 bad outcomes are half as likely." },
    { id: "bulk",      cost: 70,  name: "Bulk buyer",           desc: "Staff upgrades cost 25% less." }
  ];
  /* ---------- going public ----------
     From 150 shares you can list the company: it is sold as normal, then your
     shares are traded for stock. Stock is the square root of all the shares
     you have ever listed, so listing in small pieces gains nothing. Each
     point of stock adds +100% output for good. Perks and unlocked tiers stay;
     shares start again from zero. */
  var IPO_MIN_SHARES = 150;
  function stockFor(listed) { return Math.floor(Math.sqrt(Math.max(0, listed)) + 1e-9); }
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
    { id: "h3", name: "Full house",         desc: "Own one of each of the first eight kinds of rat.", test: function (st) { return st.owned.slice(0, 8).every(function (n) { return n > 0; }); } },
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
    { id: "k1", name: "Billable hours",     desc: "Hire 10 consultants.",          test: function (st) { return st.consultsHired >= 10; } },
    { id: "k2", name: "No such thing as bad press", desc: "Survive a scandal.",    test: function (st) { return st.scandals >= 1; } },
    { id: "b1", name: "Chairing the meeting", desc: "Make 10 board decisions.",   test: function (st) { return st.decisions >= 10; } },
    { id: "b2", name: "Hostile takeover",   desc: "Accept a takeover offer.",      test: function (st) { return st.takeovers >= 1; } },
    { id: "i1", name: "Ring the bell",      desc: "Take the company public.",      test: function (st) { return st.ipos >= 1; } },
    { id: "c7", name: "Contractor",         desc: "Complete 10 contracts.",       test: function (st) { return st.contractsDone >= 10; } },
    { id: "c8", name: "Gilt-edged",         desc: "Cash in 10 bonds.",             test: function (st) { return st.bondsRedeemed >= 10; } },
    { id: "c9", name: "Career ladder",      desc: "Make 25 promotions.",           test: function (st) { return st.promotions >= 25; } },
    { id: "m1", name: "Bought the dip",     desc: "Profit on a long opened in a bear market.", test: function (st) { return st.boughtDip === true; } },
    { id: "m2", name: "The big short",      desc: "Make 50% on a short.",          test: function (st) { return st.bigShort === true; } },
    { id: "t1", name: "Taking the chair",   desc: "Hire a Chair of the Board.",    test: function (st) { return st.owned[8] > 0; } },
    { id: "t2", name: "Founder mode",       desc: "Hire a Founder.",               test: function (st) { return st.owned[9] > 0; } },
    { id: "t3", name: "Lender of last resort", desc: "Hire a Central Banker.",     test: function (st) { return st.owned[10] > 0; } },
    // the portfolio, and a secret
    { id: "x1", name: "Due diligence",      desc: "Open every section of the portfolio.", test: function (st) { return ["b-about", "b-now", "b-projects", "b-games", "b-cv", "b-hidden"].every(function (b) { return st.unlocked[b]; }); } },
    { id: "x2", name: "Night owl",          desc: "Play between 2am and 4am.", secret: true,
      test: function () { var h = new Date().getHours(); return h >= 2 && h < 4; } }
  ];

  function shopItem(id) { for (var i = 0; i < SHOP.length; i++) if (SHOP[i].id === id) return SHOP[i]; return null; }
  function recruiterLevelOf(perma) {
    var l = 0;
    for (var i = 0; i < SHOP.length; i++) if (SHOP[i].recruiter && perma[SHOP[i].id]) l = Math.max(l, SHOP[i].recruiter);
    return l;
  }
  // scale defaults to the base; after going public, shares are priced relative
  // to stock (see shareScale), so the stock boost can't snowball into shares.
  function sharesFor(value, scale) { return Math.floor(Math.cbrt(Math.max(0, value) / (scale || SHARE_SCALE)) + 1e-9); }

  /* ---------- consultants (hired on /cheese) ----------
     Pay a fee, they work for a minute, then something happens. "Minutes" are
     minutes of your output at the moment you hired them. Each firm comes out
     ahead on average, the riskier ones by more. Winnings are capped at the
     cheese earned this run, and losses at 30% of a team or 40% of your cheese,
     so one bad call hurts but never ends a run. */
  var CONSULT_UNLOCK = 1e6, CONSULT_MS = 60000, CONSULT_MIN_FEE = 1000;
  var CONSULTANTS = [
    { id: "steady", name: "Cheddington & Partners", style: "Steady. Rarely exciting, rarely a disaster.", feeMin: 2,
      outcomes: [ { w: 55, kind: "gain", min: 6, label: "Solid work" },
                  { w: 25, kind: "gain", min: 2.5, label: "Modest gains" },
                  { w: 15, kind: "nothing", label: "A thorough report" },
                  { w: 5,  kind: "overrun", min: 2, label: "Fee overrun" } ] },
    { id: "bold", name: "Gouda Strategy Group", style: "Bold ideas. Bigger wins, real risks.", feeMin: 5,
      outcomes: [ { w: 40, kind: "gain", min: 25, label: "Breakthrough" },
                  { w: 25, kind: "gain", min: 8, label: "Good advice" },
                  { w: 15, kind: "nothing", label: "Interesting slides" },
                  { w: 12, kind: "restructure", share: 0.15, pick: "biggest", label: "Restructuring" },
                  { w: 8,  kind: "lose", share: 0.20, label: "Bad advice" } ] },
    { id: "brutal", name: "Rind Capital Advisory", style: "Brilliant or catastrophic. Nothing in between.", feeMin: 10,
      outcomes: [ { w: 20, kind: "gain", min: 120, label: "Masterstroke" },
                  { w: 20, kind: "gain", min: 30, label: "Aggressive growth" },
                  { w: 20, kind: "nothing", label: "Billed and vanished" },
                  { w: 20, kind: "restructure", share: 0.30, pick: "random", label: "Ruthless restructuring" },
                  { w: 20, kind: "lose", share: 0.40, label: "Scandal" } ] }
  ];
  function consultantById(id) { for (var i = 0; i < CONSULTANTS.length; i++) if (CONSULTANTS[i].id === id) return CONSULTANTS[i]; return null; }

  /* ---------- market cycles and cheese futures ----------
     The market moves between bull (+20% output), flat and bear (-15%) phases
     of 3 to 6 minutes. The cheese price wanders around 100 (between 50 and
     200), nudged up in bull phases and down in bear ones, but the day-to-day
     noise is far bigger than the nudge: reading the market well wins about
     65% of trades, for a couple of percent on average. */
  var PHASES = {
    bull: { label: "Bull", mult: 1.2,  drift: 0.00025 },
    flat: { label: "Flat", mult: 1.0,  drift: 0 },
    bear: { label: "Bear", mult: 0.85, drift: -0.00025 }
  };
  var PHASE_MIN_S = 180, PHASE_MAX_S = 360, PRICE_PULL = 0.004, PRICE_NOISE = 0.006;
  var PRICE_MIN = 50, PRICE_MAX = 200, HIST_EVERY_S = 5, HIST_LEN = 72;
  var FUTURES_UNLOCK = 5e6, FUTURES_STAKES = [0.1, 0.25, 0.5], FUTURES_MIN_STAKE = 1000;
  function freshMarket() { return { phase: "flat", until: Date.now() + PHASE_MIN_S * 1000, price: 100, hist: [100], histT: 0 }; }

  /* ---------- board decisions and hostile takeovers (offered on /cheese) ----------
     Costs are minutes of output at the time. Options are roughly balanced:
     the choice is about what suits the moment, not spotting the trap. */
  var DECISIONS = [
    { id: "fourday", text: "The board proposes a four-day week.", options: [
      { label: "Trial it", desc: "+30% output for 3 minutes, then \u221220% for 3",
        boosts: [ { kind: "prod", mult: 1.3, start: 0, len: 180 }, { kind: "prod", mult: 0.8, start: 180, len: 180 } ] },
      { label: "Keep five days", desc: "+5% output for 6 minutes", boosts: [ { kind: "prod", mult: 1.05, start: 0, len: 360 } ] } ] },
    { id: "overseas", text: "Expand overseas?", options: [
      { label: "Expand", desc: "Costs 3 minutes of output, then +25% output for 15 minutes", cost: 3,
        boosts: [ { kind: "prod", mult: 1.25, start: 0, len: 900 } ] },
      { label: "Stay local", desc: "Nothing changes" } ] },
    { id: "poach", text: "A rival is poaching your staff.", options: [
      { label: "Match their pay", desc: "Costs 2 minutes of output", cost: 2 },
      { label: "Let them go", desc: "Lose 10% of one team", restructure: 0.10 } ] },
    { id: "dog", text: "Someone wants to bring in an office dog.", options: [
      { label: "Approve", desc: "Presses \u00d72 for 5 minutes", boosts: [ { kind: "press", mult: 2, start: 0, len: 300 } ] },
      { label: "Reject", desc: "+3% output for 10 minutes. Productivity, apparently", boosts: [ { kind: "prod", mult: 1.03, start: 0, len: 600 } ] } ] },
    { id: "teambuild", text: "Team-building weekend: paintball or a pub quiz?", options: [
      { label: "Paintball", desc: "Costs 2 minutes of output, then +12% output for 20 minutes", cost: 2,
        boosts: [ { kind: "prod", mult: 1.12, start: 0, len: 1200 } ] },
      { label: "Pub quiz", desc: "+5% output for 10 minutes", boosts: [ { kind: "prod", mult: 1.05, start: 0, len: 600 } ] } ] },
    { id: "rebrand", text: "Marketing wants a rebrand.", options: [
      { label: "Rebrand", desc: "Costs 1.5 minutes of output. Golden cheese turns up within a minute", cost: 1.5, golden: true },
      { label: "Keep the logo", desc: "Nothing changes" } ] }
  ];
  var DECISION_UNLOCK = 1e5, TAKEOVER_MIN_VALUE = 1e6, TAKEOVER_SECONDS = 30;
  var MAX_BOOSTS = 8, BOOST_MIN = 0.5, BOOST_MAX = 2, BOOST_MAX_S = 1800;

  /* ---------- contracts, bonds and promotions (on /cheese) ---------- */
  var CONTRACT_UNLOCK = 5e4, CONTRACT_REFRESH_S = 900, CONTRACT_COOLDOWN_S = 60;
  var CONTRACT_TYPES = {
    produce: { seconds: 180, label: "Production run" },
    hire:    { seconds: 120, label: "Hiring drive" },
    press:   { seconds: 60,  label: "All hands" },
    rate:    { seconds: 300, label: "Growth target" }
  };
  // Rates are set so keeping both bonds rolling adds about 15% of an hour's
  // output per hour whichever term you pick: longer terms are less clicking,
  // not more money. Steady and safe, never a money printer.
  var BOND_TERMS = [ { minutes: 2, rate: 0.015 }, { minutes: 5, rate: 0.04 }, { minutes: 15, rate: 0.12 } ];
  var BOND_UNLOCK = 2e5, BOND_CAP_MIN = 10, MAX_BONDS = 2, BOND_MIN = 100;
  var PROMOTE_COUNT = 10;

  /* ---------- golden cheese bonuses (spawned by /cheese) ---------- */
  var GOLDEN = {
    windfall: { label: "Windfall" },
    // Tuned to be worth roughly one windfall each: a bull run adds about 50
    // seconds of output; busy paws rewards tapping without dwarfing everything.
    bull:     { label: "Frenzy", mult: 3, seconds: 25 },
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
      soldValue: 0,         // total valuation of every company sold
      retainedUps: {},      // staff upgrades kept by Retention bonus (not part of a sale's value)
      consult: null,        // the consultant at work: { firm, endsAt, rate }
      market: null,         // { phase, until, price, hist, histT }
      position: null,       // open futures position: { side, stake, entry, openPhase }
      tradePnl: 0,          // all-time profit or loss from futures (can be negative)
      trades: 0,
      boughtDip: false,
      bigShort: false,
      boosts: [],           // temporary effects from board decisions: { kind, mult, from, until }
      decisions: 0,
      takeovers: 0,
      contract: null,       // { type, target, base, endsAt, reward, rewardKind }
      offers: [],           // contracts on the board
      offersAt: 0,          // when the board was last filled
      contractsDone: 0,
      contractCooldown: 0,
      bonds: [],            // { stake, rate, matures, term }
      bondsRedeemed: 0,
      bondInterest: 0,
      promotions: 0,
      listed: 0,            // shares traded in across every listing
      stock: 0,
      perkCredit: 0,        // shares already spent on perks before a listing (perks stay)
      ipos: 0,
      runsSinceIpo: 0,      // sales since the last listing (what the leaderboard checks against shares)
      consultsHired: 0,
      scandals: 0,
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
    // Shares come from the total value of companies sold. Saves from before
    // valuation existed are given the value their shares imply. Value sold can
    // never exceed cheese ever earned, and shares never exceed value sold.
    var earnedIn = whole(d.sharesEarned);
    var sold = typeof d.soldValue === "number" ? num(d.soldValue) : SHARE_SCALE * earnedIn * earnedIn * earnedIn;
    s.soldValue = Math.min(sold, s.allTime);
    s.sharesEarned = Math.min(earnedIn, sharesFor(s.soldValue, SHARE_SCALE * (1 + stockFor(Math.min(whole(d.listed), 1e12)))));
    if (d.retainedUps && typeof d.retainedUps === "object") {
      for (var rk in d.retainedUps) if (d.retainedUps[rk] === true && s.staffUps[rk]) s.retainedUps[rk] = true;
    }
    if (d.perma && typeof d.perma === "object") {
      for (var pi = 0; pi < SHOP.length; pi++) {
        var it = SHOP[pi];
        if (d.perma[it.id] === true && (!it.needs || s.perma[it.needs])) s.perma[it.id] = true;
      }
    }
    // And you can't own more than your shares paid for: drop the priciest extras.
    var spentNow = function () { var t = 0; for (var k in s.perma) t += shopItem(k).cost; return t; };
    var credit0 = Math.min(whole(d.perkCredit), Math.min(whole(d.listed), 1e12));
    for (var guard = 0; spentNow() > s.sharesEarned + credit0 && guard < 50; guard++) {
      var worst = null;
      for (var k2 in s.perma) {
        var dependents = SHOP.some(function (x) { return x.needs === k2 && s.perma[x.id]; });
        if (!dependents && (!worst || shopItem(k2).cost > shopItem(worst).cost)) worst = k2;
      }
      delete s.perma[worst];
    }
    // Perks bought before a listing are paid for by perkCredit.
    var budget = function () { return s.sharesEarned + Math.min(whole(d.perkCredit), Math.min(whole(d.listed), 1e12)); };
    for (var guard2 = 0; spentNow() > budget() && guard2 < 50; guard2++) {
      var worst2 = null;
      for (var k3 in s.perma) {
        var deps2 = SHOP.some(function (x) { return x.needs === k3 && s.perma[x.id]; });
        if (!deps2 && (!worst2 || shopItem(k3).cost > shopItem(worst2).cost)) worst2 = k3;
      }
      delete s.perma[worst2];
    }
    s.recruiter.hired = recruiterLevelOf(s.perma) > 0;
    if (d.consult && typeof d.consult === "object" && consultantById(d.consult.firm) &&
        num(d.consult.endsAt) > 0 && num(d.consult.endsAt) <= Date.now() + CONSULT_MS && num(d.consult.rate) <= 1e300) {
      s.consult = { firm: d.consult.firm, endsAt: num(d.consult.endsAt), rate: num(d.consult.rate) };
    }
    s.consultsHired = whole(d.consultsHired);
    var m = d.market;
    if (m && typeof m === "object" && PHASES[m.phase] && num(m.price) >= PRICE_MIN && num(m.price) <= PRICE_MAX &&
        num(m.until) <= Date.now() + PHASE_MAX_S * 1000) {
      s.market = { phase: m.phase, until: num(m.until), price: m.price, hist: [], histT: num(m.histT), next: PHASES[m.next] ? m.next : null };
      if (Object.prototype.toString.call(m.hist) === "[object Array]") {
        for (var hi = Math.max(0, m.hist.length - HIST_LEN); hi < m.hist.length; hi++) {
          var hp = m.hist[hi]; if (typeof hp === "number" && hp >= PRICE_MIN && hp <= PRICE_MAX) s.market.hist.push(hp);
        }
      }
      if (!s.market.hist.length) s.market.hist.push(s.market.price);
    }
    var po = d.position;
    if (po && typeof po === "object" && (po.side === "long" || po.side === "short") && num(po.stake) > 0 &&
        num(po.stake) <= s.allTime && num(po.entry) >= PRICE_MIN && num(po.entry) <= PRICE_MAX) {
      s.position = { side: po.side, stake: po.stake, entry: po.entry, openPhase: PHASES[po.openPhase] ? po.openPhase : "flat" };
    }
    s.tradePnl = (typeof d.tradePnl === "number" && isFinite(d.tradePnl)) ? Math.max(-s.allTime, Math.min(d.tradePnl, s.allTime)) : 0;
    s.trades = whole(d.trades);
    s.boughtDip = d.boughtDip === true;
    if (Object.prototype.toString.call(d.boosts) === "[object Array]") {
      var lim = Date.now() + BOOST_MAX_S * 1000;
      for (var bi = 0; bi < d.boosts.length && s.boosts.length < MAX_BOOSTS; bi++) {
        var b = d.boosts[bi];
        if (b && (b.kind === "prod" || b.kind === "press") && typeof b.mult === "number" && b.mult >= BOOST_MIN && b.mult <= BOOST_MAX &&
            num(b.until) > 0 && num(b.until) <= lim && num(b.from) <= num(b.until)) s.boosts.push({ kind: b.kind, mult: b.mult, from: num(b.from), until: num(b.until) });
      }
    }
    s.decisions = whole(d.decisions);
    var okContract = function (c) {
      return c && typeof c === "object" && CONTRACT_TYPES[c.type] && num(c.target) > 0 && num(c.reward) >= 0 &&
             (c.rewardKind === "cheese" || c.rewardKind === "boost");
    };
    if (okContract(d.contract) && num(d.contract.endsAt) <= Date.now() + 600000) {
      s.contract = { type: d.contract.type, target: d.contract.target, base: num(d.contract.base), endsAt: num(d.contract.endsAt),
                     reward: Math.min(d.contract.reward, s.allTime), rewardKind: d.contract.rewardKind };
    }
    if (Object.prototype.toString.call(d.offers) === "[object Array]") {
      for (var oi = 0; oi < d.offers.length && s.offers.length < 3; oi++) {
        var of = d.offers[oi];
        if (okContract(of)) s.offers.push({ type: of.type, target: of.target, reward: Math.min(of.reward, s.allTime), rewardKind: of.rewardKind });
      }
    }
    s.offersAt = Math.min(num(d.offersAt), Date.now());
    s.contractsDone = whole(d.contractsDone);
    s.contractCooldown = Math.min(num(d.contractCooldown), Date.now() + CONTRACT_COOLDOWN_S * 1000);
    if (Object.prototype.toString.call(d.bonds) === "[object Array]") {
      for (var bj = 0; bj < d.bonds.length && s.bonds.length < MAX_BONDS; bj++) {
        var bd = d.bonds[bj], term = BOND_TERMS[bd && bd.term];
        if (term && num(bd.stake) > 0 && num(bd.stake) <= s.allTime && num(bd.matures) <= Date.now() + term.minutes * 60000)
          s.bonds.push({ stake: bd.stake, rate: term.rate, matures: num(bd.matures), term: bd.term });
      }
    }
    s.bondsRedeemed = whole(d.bondsRedeemed);
    s.bondInterest = Math.min(num(d.bondInterest), s.allTime);
    s.promotions = whole(d.promotions);
    s.listed = Math.min(whole(d.listed), 1e12);
    s.stock = stockFor(s.listed);
    s.perkCredit = Math.min(whole(d.perkCredit), s.listed);
    s.ipos = whole(d.ipos);
    s.runsSinceIpo = Math.min(typeof d.runsSinceIpo === "number" ? whole(d.runsSinceIpo) : s.runs, s.runs, s.sharesEarned);
    s.takeovers = whole(d.takeovers);
    s.bigShort = d.bigShort === true;
    s.scandals = whole(d.scandals);
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
    if (d.v < 4) {
      // Versions 3 (new economy, Sir Reginald) and 4 (the full /cheese game:
      // valuation, new tiers, markets, consultants, events, going public) each
      // reset everyone's game, so everyone starts fresh with the tutorial.
      // Unlocked sections are kept: a visitor who already opened the portfolio
      // never finds it locked again.
      d = { v: 4, unlocked: d.unlocked };
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
  function tierUnlocked(tier) { return state.runs >= (TIERS[tier].needRuns || 0); }
  function tierRevealed(tier) {
    if (!tierUnlocked(tier)) return false;
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
  function rateOf(tier) { return TIERS[tier].rate * multiplierOf(tier) * staffUpMultOf(tier) * shareMult() * achievementMult() * stockMult(); }

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
  // Diminishing returns: the first shares are worth nearly the full 5% each,
  // later ones gradually less (10 shares +48% rather than +50%, 100 shares
  // +366% rather than +500%, 1,000 shares +1,791% rather than +5,000%).
  // Without this, shares, output and higher tiers feed each other until the
  // game runs away; with it, the endgame speeds up but settles.
  function shareMultFor(S) { return 1 + perShare() * 100 * (Math.sqrt(1 + 2 * Math.max(0, S) / 100) - 1); }
  function shareMult() { return shareMultFor(state.sharesEarned); }
  function sharesSpent() { var t = 0; for (var k in state.perma) t += shopItem(k).cost; return t; }
  function sharesFree() { return state.sharesEarned + state.perkCredit - sharesSpent(); }
  function stockMult() { return 1 + state.stock; }
  /* A company is worth its cheese in hand, plus what its current staff and
     this run's staff upgrades cost. Buying staff keeps your value; money
     spent on things that don't stay (press upgrades, fees) lowers it. */
  function staffValue() {
    var v = 0;
    for (var t = 0; t < TIERS.length; t++) {
      var c = TIERS[t].cost, n = state.owned[t];
      for (var k = 0; k < n; k++) v += Math.ceil(c * Math.pow(COST_GROWTH, k));
    }
    return v;
  }
  function staffUpValue() {
    var v = 0;
    for (var i = 0; i < STAFF_UPGRADES.length; i++) {
      var u = STAFF_UPGRADES[i];
      if (state.staffUps[u.id] && !state.retainedUps[u.id]) v += staffUpCost(u);
    }
    return v;
  }
  function valuation() { return state.cheese + staffValue() + staffUpValue() + positionValue() + bondsValue(); }
  function shareScale() { return SHARE_SCALE * (1 + state.stock); }
  function pendingShares() { return Math.max(0, sharesFor(state.soldValue + valuation(), shareScale()) - state.sharesEarned); }
  // Extra company value needed for one more share than a sale would pay now.
  function cheeseToNextShare() {
    var have = state.soldValue + valuation(), next = sharesFor(have, shareScale()) + 1;
    return Math.max(0, shareScale() * next * next * next - have);
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
    if (state.position) closePosition(true);           // close at market; it was already in the valuation
    var value = valuation();
    state.soldValue += value;
    state.sharesEarned += gained;
    state.runs++;
    state.runsSinceIpo++;
    var start = startCheese();
    state.cheese = 0;
    state.lifetime = 0;
    state.owned = TIERS.map(function () { return 0; });
    state.upgrades = {};
    var kept = {};
    if (owns("retain")) for (var k in state.staffUps) if (/_0$/.test(k)) kept[k] = true;
    state.staffUps = kept;
    state.retainedUps = {};
    for (var kk in kept) state.retainedUps[kk] = true;
    // Seed funding counts as earned, so a company's value is always backed by cheese earned.
    if (start > 0) earn(start);
    if (owns("search")) {
      // The free staff are paid for with cheese counted as earned, for the same reason.
      var hireCost = function (t, k) { var v = 0; for (var q = 0; q < k; q++) v += Math.ceil(TIERS[t].cost * Math.pow(COST_GROWTH, q)); return v; };
      earn(hireCost(0, 10) + hireCost(1, 5));
      state.cheese -= hireCost(0, 10) + hireCost(1, 5);
      state.owned[0] += 10; state.owned[1] += 5;
    }
    state.buffs = { prodMult: 1, prodUntil: 0, pressMult: 1, pressUntil: 0 };
    state.runSeconds = 0;
    state.consult = null;       // a sale ends any engagement
    state.boosts = [];
    offer = null;
    state.bonds = [];            // redeemed at their stake: already counted in the sale's value
    state.contract = null;
    state.offers = [];
    state.offersAt = 0;
    lastHire = 0;
    checkAchievements();
    dirty = true; save(); onChange();
    return { shares: gained, total: state.sharesEarned, mult: shareMult(), value: value };
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
    return baseRate() * (buffActive("bull") ? state.buffs.prodMult : 1) * marketMult() * boostMult("prod");
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
    v = v * boostMult("press");
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
  function staffUpCost(u) { return u.cost * (owns("bulk") ? 0.75 : 1); }
  // Available to buy: you own enough of the rat and haven't bought it yet.
  function staffUpAvailable(id) {
    var u = staffUpById(id);
    return !!u && !hasStaffUp(id) && state.owned[u.tier] >= u.at;
  }
  function buyStaffUp(id) {
    if (!active) { claim(); return false; }
    var u = staffUpById(id);
    if (!u || !staffUpAvailable(id) || state.cheese < staffUpCost(u)) return false;
    state.cheese -= staffUpCost(u);
    state.staffUps[id] = true;
    dirty = true;
    save();
    onChange();
    return true;
  }

  /* ---------- the Recruiter ---------- */
  // Output gained by one more rat of a tier, counting any milestone it reaches.
  function gainFromRat(tier) {
    var n = state.owned[tier], per = TIERS[tier].rate * staffUpMultOf(tier) * shareMult() * achievementMult() * stockMult();
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
      if (gu > 0) opts.push({ type: "staff", id: u.id, tier: u.tier, name: u.name, cost: staffUpCost(u), gain: gu });
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

  /* ---------- market cycles ---------- */
  function gauss() { var u = 1 - Math.random(), v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function pickPhase(current) {
    var r = Math.random(), opts = ["bull", "flat", "bear"].filter(function (p) { return p !== current; });
    return opts[r < 0.5 ? 0 : 1];
  }
  // Advance the market by whole seconds (the tick passes in how long it's been).
  var marketCarry = 0;
  function stepMarket(dt) {
    if (!state.market) state.market = freshMarket();
    var m = state.market, now = Date.now();
    if (!m.next || m.next === m.phase) m.next = pickPhase(m.phase);
    if (now >= m.until) {
      m.phase = m.next;
      m.next = pickPhase(m.phase);
      m.until = now + (PHASE_MIN_S + Math.random() * (PHASE_MAX_S - PHASE_MIN_S)) * 1000;
    }
    marketCarry += dt;
    var steps = Math.min(Math.floor(marketCarry), 120);
    marketCarry -= Math.floor(marketCarry);
    var lp = Math.log(m.price), centre = Math.log(100), drift = PHASES[m.phase].drift;
    for (var i = 0; i < steps; i++) {
      lp += drift - PRICE_PULL * (lp - centre) + PRICE_NOISE * gauss();
      lp = Math.max(Math.log(PRICE_MIN), Math.min(Math.log(PRICE_MAX), lp));
      m.histT += 1;
      if (m.histT >= HIST_EVERY_S) { m.histT = 0; m.hist.push(Math.exp(lp)); if (m.hist.length > HIST_LEN) m.hist.shift(); }
    }
    m.price = Math.exp(lp);
  }
  function marketPhase() { return state.market ? state.market.phase : "flat"; }
  function marketNext() { return owns("insight") && state.market && state.market.next ? state.market.next : null; }
  function marketMult() { return PHASES[marketPhase()].mult; }
  function marketLeft() { return state.market ? Math.max(0, (state.market.until - Date.now()) / 1000) : 0; }

  /* ---------- cheese futures ---------- */
  function futuresUnlocked() { return state.allTime >= FUTURES_UNLOCK || state.trades > 0 || !!state.position; }
  function positionValue() {
    var p = state.position; if (!p || !state.market) return 0;
    var ratio = state.market.price / p.entry;
    return p.side === "long" ? p.stake * ratio : Math.max(0, p.stake * (2 - ratio));
  }
  function openPosition(side, frac) {
    if (!active) { claim(); return false; }
    if (!futuresUnlocked() || state.position || (side !== "long" && side !== "short") || FUTURES_STAKES.indexOf(frac) === -1) return false;
    var stake = Math.floor(state.cheese * frac);
    if (stake < FUTURES_MIN_STAKE) return false;
    if (!state.market) state.market = freshMarket();
    state.cheese -= stake;
    state.position = { side: side, stake: stake, entry: state.market.price, openPhase: marketPhase() };
    dirty = true; save(); onChange();
    return true;
  }
  var tradeReports = [];
  function closePosition(quiet) {
    if (!active && !quiet) { claim(); return null; }
    var p = state.position; if (!p) return null;
    var value = positionValue(), profit = value - p.stake;
    state.position = null;
    state.cheese += Math.min(value, p.stake);          // the stake comes back (or what's left of it)
    if (profit > 0) earn(profit);                      // profit counts as cheese earned
    state.tradePnl += profit;
    state.trades++;
    if (profit > 0 && p.side === "long" && p.openPhase === "bear") state.boughtDip = true;
    if (p.side === "short" && profit >= 0.5 * p.stake) state.bigShort = true;
    var rep = { side: p.side, stake: p.stake, value: value, profit: profit };
    if (!quiet) tradeReports.push(rep);
    dirty = true; save(); checkAchievements(); onChange();
    return rep;
  }
  function takeTradeReports() { var r = tradeReports; tradeReports = []; return r; }

  /* ---------- going public ---------- */
  // Listing always includes a real sale, so a sale must be on offer.
  function ipoReady() { return state.sharesEarned + pendingShares() >= IPO_MIN_SHARES && pendingShares() >= 1; }
  function ipoQuote() {
    var shares = state.sharesEarned + pendingShares(), gained = stockFor(state.listed + shares) - state.stock;
    var nowMult = shareMult() * stockMult();
    var afterMult = (1 + state.stock + gained);
    return { shares: shares, stock: gained, totalStock: state.stock + gained, nowMult: nowMult, afterMult: afterMult, ready: ipoReady() };
  }
  function goPublic() {
    if (!active) { claim(); return null; }
    var q = ipoQuote();
    if (!q.ready || q.stock < 1) return null;
    if (!sell()) return null;                        // the company is sold as usual first
    var spent = sharesSpent();
    state.listed += state.sharesEarned;
    state.stock = stockFor(state.listed);
    state.perkCredit = spent;                        // perks stay, already paid for
    state.sharesEarned = 0;
    state.soldValue = 0;
    state.runsSinceIpo = 0;
    state.ipos++;
    dirty = true; save(); checkAchievements(); onChange();
    return { stock: q.stock, totalStock: state.stock, mult: stockMult() };
  }

  /* ---------- board decisions ---------- */
  function boostMult(kind) {
    var m = 1, now = Date.now();
    for (var i = 0; i < state.boosts.length; i++) {
      var b = state.boosts[i];
      if (b.kind === kind && now >= b.from && now < b.until) m *= b.mult;
    }
    return m;
  }
  function activeBoosts() {
    var now = Date.now();
    return state.boosts.filter(function (b) { return now >= b.from && now < b.until; });
  }
  function pruneBoosts() {
    var now = Date.now();
    if (state.boosts.some(function (b) { return b.until <= now; })) state.boosts = state.boosts.filter(function (b) { return b.until > now; });
  }
  function decisionsUnlocked() { return state.allTime >= DECISION_UNLOCK; }
  function decisionById(id) { for (var i = 0; i < DECISIONS.length; i++) if (DECISIONS[i].id === id) return DECISIONS[i]; return null; }
  // Apply option index 0 or 1 of a board decision. Returns what happened.
  var goldenSoonFlag = false;
  function decide(id, choice) {
    if (!active) { claim(); return null; }
    var dcs = decisionById(id), opt = dcs && dcs.options[choice];
    if (!opt) return null;
    var rate = baseRate(), out = { id: id, label: opt.label, cost: 0, lost: 0, tier: -1 };
    if (opt.cost) { var c = Math.min(state.cheese, rate * 60 * opt.cost); state.cheese -= c; out.cost = c; }
    if (opt.boosts) {
      var now = Date.now();
      opt.boosts.forEach(function (b) {
        var stretch = owns("lunch") ? 1.5 : 1;
        state.boosts.push({ kind: b.kind, mult: b.mult, from: now + b.start * stretch * 1000, until: now + (b.start + b.len) * stretch * 1000 });
      });
      while (state.boosts.length > MAX_BOOSTS) state.boosts.shift();
    }
    if (opt.restructure) {
      var teams = []; for (var i = 0; i < TIERS.length; i++) if (state.owned[i] > 0) teams.push(i);
      if (teams.length) {
        var t = teams[Math.floor(Math.random() * teams.length)];
        var lose = Math.min(state.owned[t], Math.max(1, Math.floor(state.owned[t] * opt.restructure)));
        state.owned[t] -= lose; out.lost = lose; out.tier = t;
      }
    }
    if (opt.golden) goldenSoonFlag = true;
    state.decisions++;
    dirty = true; save(); checkAchievements(); onChange();
    return out;
  }
  function takeGoldenSoon() { var f = goldenSoonFlag; goldenSoonFlag = false; return f; }

  /* ---------- hostile takeovers ---------- */
  var offer = null;   // { value, premium, expires }, never saved: an offer only lasts 30 seconds
  function takeoverPossible() {
    var v = valuation();
    return v >= TAKEOVER_MIN_VALUE && sharesFor(state.soldValue + v * 1.25, shareScale()) - state.sharesEarned >= 1;
  }
  function makeOffer() {
    if (!active || !takeoverPossible()) return null;
    var premium = 1.25 + Math.random() * 0.25, v = valuation();
    offer = { premium: premium, expires: Date.now() + TAKEOVER_SECONDS * 1000 };
    return { premium: premium, value: v * premium, shares: sharesFor(state.soldValue + v * premium, shareScale()) - state.sharesEarned, seconds: TAKEOVER_SECONDS };
  }
  function offerNow() {
    if (!offer || Date.now() > offer.expires) return null;
    var v = valuation();
    return { premium: offer.premium, value: v * offer.premium, shares: sharesFor(state.soldValue + v * offer.premium, shareScale()) - state.sharesEarned,
             left: (offer.expires - Date.now()) / 1000 };
  }
  // The rival pays the premium in cheese (counted as earned), then the company is sold.
  function acceptTakeover() {
    if (!active) { claim(); return null; }
    var o = offerNow(); offer = null;
    if (!o || o.shares < 1) return null;
    if (state.position) closePosition(true);
    var premiumCheese = valuation() * (o.premium - 1);
    earn(premiumCheese);
    state.takeovers++;
    var res = sell();
    if (res) res.premium = o.premium;
    return res;
  }
  function declineTakeover() { offer = null; }

  /* ---------- contracts ---------- */
  function contractsUnlocked() { return state.allTime >= CONTRACT_UNLOCK; }
  function makeContract(type) {
    var rate = Math.max(baseRate(), 1), t = CONTRACT_TYPES[type], c = { type: type, rewardKind: "cheese" };
    if (type === "produce") { c.target = Math.ceil(rate * t.seconds * 1.4); c.reward = rate * 300; }
    else if (type === "hire") { c.target = 10; c.reward = rate * 180; }
    else if (type === "press") { c.target = 120; c.reward = rate * 180; }
    else { c.target = Math.ceil(totalRate() * 1.5) || 10; c.reward = 600; c.rewardKind = "boost"; }   // +10% output for 10 minutes
    return c;
  }
  function refreshOffers(force) {
    if (!contractsUnlocked()) return;
    var now = Date.now();
    if (!force && state.offers.length && now - state.offersAt < CONTRACT_REFRESH_S * 1000) return;
    var types = Object.keys(CONTRACT_TYPES);
    for (var i = types.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = types[i]; types[i] = types[j]; types[j] = x; }
    state.offers = types.slice(0, 3).map(makeContract);
    state.offersAt = now;
    dirty = true;
  }
  function contractProgress(c) {
    c = c || state.contract; if (!c) return 0;
    var v = c.type === "produce" ? state.lifetime - c.base : c.type === "hire" ? state.hired - c.base :
            c.type === "press" ? state.clicks - c.base : totalRate();
    return Math.max(0, v);
  }
  function acceptContract(i) {
    if (!active) { claim(); return false; }
    var o = state.offers[i];
    if (!o || state.contract || !contractsUnlocked() || Date.now() < state.contractCooldown) return false;
    var base = o.type === "produce" ? state.lifetime : o.type === "hire" ? state.hired : o.type === "press" ? state.clicks : 0;
    state.contract = { type: o.type, target: o.target, reward: o.reward, rewardKind: o.rewardKind, base: base,
                       endsAt: Date.now() + CONTRACT_TYPES[o.type].seconds * 1000 };
    state.offers.splice(i, 1);
    dirty = true; save(); onChange();
    return true;
  }
  var contractReports = [];
  function settleContract() {
    var c = state.contract; if (!c) return;
    var done = contractProgress(c) >= c.target, late = Date.now() >= c.endsAt;
    if (!done && !late) return;
    state.contract = null;
    if (done) {
      if (c.rewardKind === "boost") {
        var now = Date.now();
        state.boosts.push({ kind: "prod", mult: 1.1, from: now, until: now + c.reward * (owns("rainmaker") ? 1.5 : 1) * 1000 });
        while (state.boosts.length > MAX_BOOSTS) state.boosts.shift();
      } else earn(Math.min(c.reward * (owns("rainmaker") ? 1.5 : 1), Math.max(state.lifetime, 1000)));
      state.contractsDone++;
    }
    state.contractCooldown = Date.now() + CONTRACT_COOLDOWN_S * 1000;
    contractReports.push({ type: c.type, done: done, reward: c.reward, rewardKind: c.rewardKind });
    if (!state.offers.length) refreshOffers(true);
    dirty = true; save(); checkAchievements(); onChange();
  }
  function takeContractReports() { var r = contractReports; contractReports = []; return r; }

  /* ---------- treasury bonds ---------- */
  function bondsUnlocked() { return state.allTime >= BOND_UNLOCK || state.bonds.length > 0; }
  function bondCap() { return Math.max(BOND_MIN * 10, baseRate() * 60 * BOND_CAP_MIN); }
  function bondStake(frac) { return Math.floor(Math.min(state.cheese * frac, bondCap())); }
  function buyBond(term, frac) {
    if (!active) { claim(); return false; }
    var t = BOND_TERMS[term], stake = bondStake(frac);
    if (!t || !bondsUnlocked() || state.bonds.length >= MAX_BONDS || stake < BOND_MIN || [0.25, 0.5, 1].indexOf(frac) === -1) return false;
    state.cheese -= stake;
    state.bonds.push({ stake: stake, rate: t.rate, matures: Date.now() + t.minutes * 60000, term: term });
    dirty = true; save(); onChange();
    return true;
  }
  var bondReports = [];
  function settleBonds() {
    var now = Date.now(), kept = [], paid = false;
    state.bonds.forEach(function (b) {
      if (now < b.matures) { kept.push(b); return; }
      var interest = b.stake * b.rate;
      state.cheese += b.stake; earn(interest);
      state.bondsRedeemed++; state.bondInterest += interest;
      bondReports.push({ stake: b.stake, interest: interest });
      paid = true;
    });
    if (paid) { state.bonds = kept; dirty = true; save(); checkAchievements(); onChange(); }
  }
  function bondsValue() { var v = 0; state.bonds.forEach(function (b) { v += b.stake; }); return v; }
  function takeBondReports() { var r = bondReports; bondReports = []; return r; }

  /* ---------- promotions: 10 of one rank become 1 of the next ----------
     The ten count toward the new rat at what they cost you, and you pay any
     gap in cheese, so a promotion never makes the company look more valuable
     than the cheese behind it. */
  function promotionQuote(tier) {
    var next = tier + 1, n = state.owned[tier];
    if (next >= TIERS.length || n < PROMOTE_COUNT || !tierRevealed(next)) return null;
    var credit = 0, c = TIERS[tier].cost;
    for (var k = n - PROMOTE_COUNT; k < n; k++) credit += Math.ceil(c * Math.pow(COST_GROWTH, k));
    var price = costOf(next), gap = Math.max(0, price - credit);
    return { tier: tier, next: next, credit: credit, price: price, cost: gap, affordable: state.cheese >= gap };
  }
  function promote(tier) {
    if (!active) { claim(); return false; }
    var q = promotionQuote(tier);
    if (!q || !q.affordable) return false;
    state.cheese -= q.cost;
    state.owned[tier] -= PROMOTE_COUNT;
    state.owned[q.next] += 1;
    state.promotions++;
    dirty = true; save(); checkAchievements(); onChange();
    return true;
  }

  /* ---------- consultants ---------- */
  function consultantsUnlocked() { return state.allTime >= CONSULT_UNLOCK || state.consultsHired > 0; }
  function consultantFee(id) {
    var f = consultantById(id);
    return f ? Math.max(CONSULT_MIN_FEE, Math.ceil(baseRate() * 60 * f.feeMin)) : Infinity;
  }
  var consultReports = [];
  function hireConsultant(id) {
    if (!active) { claim(); return false; }
    var f = consultantById(id);
    if (!f || state.consult || !consultantsUnlocked()) return false;
    var fee = consultantFee(id);
    if (state.cheese < fee) return false;
    state.cheese -= fee;
    state.consult = { firm: id, endsAt: Date.now() + CONSULT_MS, rate: baseRate() };
    state.consultsHired++;
    dirty = true; save(); onChange();
    return true;
  }
  function consultLeft() { return state.consult ? Math.max(0, (state.consult.endsAt - Date.now()) / 1000) : 0; }
  // Settle a finished engagement: roll the outcome and apply it.
  function settleConsult() {
    var c = state.consult;
    if (!c || Date.now() < c.endsAt) return;
    var f = consultantById(c.firm);
    state.consult = null;
    if (!f) return;
    var total = 0, roll, pick = f.outcomes[0], i;
    var weight = function (o) { return o.w * (owns("retainer") && /overrun|restructure|lose/.test(o.kind) ? 0.5 : 1); };
    for (i = 0; i < f.outcomes.length; i++) total += weight(f.outcomes[i]);
    roll = Math.random() * total;
    for (i = 0; i < f.outcomes.length; i++) { roll -= weight(f.outcomes[i]); if (roll < 0) { pick = f.outcomes[i]; break; } }
    var report = { firm: f.name, label: pick.label, kind: pick.kind, amount: 0, tier: -1, count: 0 };
    if (pick.kind === "gain") {
      var g = Math.min(c.rate * 60 * pick.min, Math.max(state.lifetime, CONSULT_MIN_FEE));
      earn(g); report.amount = g;
    } else if (pick.kind === "overrun") {
      var o = Math.min(c.rate * 60 * pick.min, state.cheese);
      state.cheese -= o; report.amount = o;
    } else if (pick.kind === "lose") {
      var l = state.cheese * Math.min(pick.share, 0.4);
      state.cheese -= l; report.amount = l;
      if (pick.label === "Scandal") state.scandals++;
    } else if (pick.kind === "restructure") {
      var teams = [];
      for (i = 0; i < TIERS.length; i++) if (state.owned[i] > 0) teams.push(i);
      if (teams.length) {
        var t = teams[0];
        if (pick.pick === "biggest") { for (i = 0; i < teams.length; i++) if (state.owned[teams[i]] * rateOf(teams[i]) > state.owned[t] * rateOf(t)) t = teams[i]; }
        else t = teams[Math.floor(Math.random() * teams.length)];
        var lose = Math.max(1, Math.floor(state.owned[t] * Math.min(pick.share, 0.3)));
        lose = Math.min(lose, state.owned[t]);
        state.owned[t] -= lose;
        report.tier = t; report.count = lose;
      } else report.kind = "nothing";
    }
    if (state.cheese < 0) state.cheese = 0;
    consultReports.push(report);
    dirty = true; save();
    checkAchievements();
    onChange();
  }
  function takeConsultReports() { var r = consultReports; consultReports = []; return r; }

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
      if (owns("windfall")) amt *= 1.5;
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
    stepMarket(dt);
    pruneBoosts();
    settleConsult();
    refreshOffers(false);
    settleContract();
    settleBonds();
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
    tierUnlocked: tierUnlocked,
    mainPageTiers: MAIN_PAGE_TIERS,
    valuation: valuation,
    staffValue: staffValue,
    staffUpValue: staffUpValue,
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
    ipoMinShares: IPO_MIN_SHARES,
    ipoReady: ipoReady,
    ipoQuote: ipoQuote,
    goPublic: goPublic,
    stockMult: stockMult,
    staffUpCost: staffUpCost,
    marketNext: marketNext,
    goldenStay: function () { return owns("parachute") ? 20 : 12; },
    contractTypes: CONTRACT_TYPES,
    contractsUnlocked: contractsUnlocked,
    contractProgress: contractProgress,
    acceptContract: acceptContract,
    takeContractReports: takeContractReports,
    contractUnlockAt: CONTRACT_UNLOCK,
    bondTerms: BOND_TERMS,
    bondsUnlocked: bondsUnlocked,
    bondUnlockAt: BOND_UNLOCK,
    bondCap: bondCap,
    bondStake: bondStake,
    buyBond: buyBond,
    bondsValue: bondsValue,
    takeBondReports: takeBondReports,
    maxBonds: MAX_BONDS,
    promotionQuote: promotionQuote,
    promote: promote,
    decisions: DECISIONS,
    decisionsUnlocked: decisionsUnlocked,
    decide: decide,
    activeBoosts: activeBoosts,
    boostMult: boostMult,
    takeGoldenSoon: takeGoldenSoon,
    takeoverPossible: takeoverPossible,
    makeOffer: makeOffer,
    offerNow: offerNow,
    acceptTakeover: acceptTakeover,
    declineTakeover: declineTakeover,
    phases: PHASES,
    marketPhase: marketPhase,
    marketMult: marketMult,
    marketLeft: marketLeft,
    futuresUnlocked: futuresUnlocked,
    futuresUnlockAt: FUTURES_UNLOCK,
    futuresStakes: FUTURES_STAKES,
    positionValue: positionValue,
    openPosition: openPosition,
    closePosition: function () { return closePosition(false); },
    takeTradeReports: takeTradeReports,
    consultants: CONSULTANTS,
    consultantsUnlocked: consultantsUnlocked,
    consultantFee: consultantFee,
    hireConsultant: hireConsultant,
    consultLeft: consultLeft,
    takeConsultReports: takeConsultReports,
    consultUnlockAt: CONSULT_UNLOCK,
    shop: SHOP,
    achievements: ACHIEVEMENTS,
    hasAchievement: hasAchievement,
    achievementCount: achievementCount,
    achievementMult: achievementMult,
    takeNewAchievements: takeNewAchievements,
    sharesFor: sharesFor,
    shareMult: shareMult,
    shareMultFor: shareMultFor,
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
