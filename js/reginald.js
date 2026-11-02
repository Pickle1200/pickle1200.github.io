/*
  Sir Reginald
  The site's host: a short tutorial for new visitors, then the occasional fact.
  Rules he follows so the portfolio stays professional:
  - never blocks anything: a small corner bubble, never a popup over the page
  - his first line points recruiters to "Skip the game"
  - one click dismisses him, and a finished or dismissed tutorial never returns
  - facts only start after the tutorial, only for people actively playing,
    and "No more facts, please" turns them off (with an Undo, in case of accidents)
  Needs cheese-core.js loaded first. The page calls Reginald.update() on each
  render and Reginald.skip() when the visitor skips the game.
*/
(function (global) {
  "use strict";
  var G = global.CheeseCore;
  if (!G) return;
  var doc = global.document;

  /* ---------- timing ---------- */
  var INTRO_DELAY = 1500;       // let the page read as a portfolio first
  var MIN_LINE_MS = 2200;       // shortest time a line stays before the next replaces it
  var LINE_MS = 8000;           // ordinary lines tidy themselves away after this
  var FACT_MS = 11000;
  var FIRST_FACT_AFTER = 120000;
  var FACT_GAP_MIN = 210000, FACT_GAP_MAX = 300000;
  var ACTIVE_WINDOW = 30000;    // facts only for someone who interacted recently

  /* ---------- tutorial: shown in order, triggered by what the visitor does ---------- */
  // Section lines follow cheese earned, not unlocks, so they still make sense
  // for visitors whose sections were already open. The page passes its
  // thresholds in with Reginald.setSections([...]).
  var sectionNeeds = [10, 1200];
  function firstSection() { return G.state.lifetime >= sectionNeeds[0]; }
  function lastSection() { return G.state.lifetime >= sectionNeeds[sectionNeeds.length - 1]; }
  function owns() { for (var i = 0; i < G.state.owned.length; i++) if (G.state.owned[i] > 0) return true; return false; }

  var STEPS = [
    { id: "intro", stay: true, tip: true,
      when: function () { return true; },
      text: "Good evening. Sir Reginald, proprietor. Here for the CV? \u201cSkip the game\u201d is top right. Otherwise, do press for cheese." },
    { id: "pressed",
      when: function () { return G.state.clicks > 0; },
      text: "Splendid. Do carry on." },
    { id: "opened",
      when: firstSection,
      text: "Cheese opens the sections of this page as you go. Once open, they stay open." },
    { id: "afford",
      when: function () { return !owns() && G.state.cheese >= G.costOf(0); },
      text: "You can afford staff. Hire someone. I would, but I\u2019m management." },
    { id: "hired",
      when: owns,
      text: "They work while you read. Mostly." },
    { id: "upgrade",
      when: function () { return G.upgradeVisible(G.upgrades[0].id); },
      text: "An upgrade has appeared, just above the staff. Worth a look." },
    { id: "allopen", end: true, ms: 15000,
      when: lastSection,
      text: "That\u2019s every section reached. There\u2019s a fuller game, with a leaderboard, through here.",
      link: { href: "/cheese/", label: "Play the full game" } }
  ];

  /* ---------- facts: all true, checked before writing ---------- */
  var FACTS = [
    "Rats laugh when tickled, at a pitch far too high for us to hear.",
    "Rats cannot vomit. Plan your lunches accordingly.",
    "A rat\u2019s front teeth never stop growing. Hence the gnawing.",
    "Rats in Tanzania are trained to sniff out landmines. One, Magawa, was awarded a gold medal for it.",
    "Rats have freed trapped companions in experiments, even with chocolate on offer instead.",
    "A rat\u2019s tail helps it control its body temperature.",
    "A group of rats is called a mischief. Accurate.",
    "Britain makes over 700 named cheeses.",
    "Every spring, people chase a wheel of Double Gloucester down Cooper\u2019s Hill in Gloucestershire. The cheese usually wins.",
    "The oldest cheese ever found is about 3,600 years old, buried with mummies in north-west China.",
    "Cheddar is named after the village of Cheddar in Somerset, whose caves were used to age it.",
    "Stilton may only be made in Derbyshire, Leicestershire and Nottinghamshire. Not, awkwardly, in Stilton.",
    "Mice are not especially keen on cheese. Given the choice, they tend to prefer grain and sweet things.",
    "The holes in Swiss cheese are partly caused by tiny bits of hay in the milk.",
    "An Italian bank accepts wheels of Parmigiano Reggiano as collateral for loans. Sensible.",
    "The Bank of England was founded in 1694.",
    "The London Stock Exchange traces its roots to traders meeting in coffee houses in the 1690s.",
    "Big Ben is the bell. The tower is the Elizabeth Tower.",
    "Scientists have taught rats to drive tiny cars. They seemed to find it relaxing.",
    "Rats have been taught to play hide and seek, and squeak with apparent delight when found.",
    "Rats sweep their whiskers back and forth several times a second to feel their way about.",
    "Sleeping rats appear to replay the mazes they ran that day.",
    "Brown rats are formally named Rattus norvegicus, though they did not come from Norway.",
    "Trained rats can also detect tuberculosis in samples, faster than a lab technician with a microscope.",
    "Rats are poor at seeing red, so labs often work under red light to keep them undisturbed.",
    "Victorian rat-catchers bred unusually coloured rats as pets. Some of today\u2019s pet rats descend from them.",
    "Some researchers now think human fleas and lice, not rats, did most of the spreading of the Black Death.",
    "Roquefort must be aged in the caves of Roquefort-sur-Soulzon, and has been protected by French law since 1925.",
    "Red Leicester gets its colour from annatto, a dye made from the seeds of a tropical shrub.",
    "Wensleydale was first made by French monks who settled in Yorkshire in the twelfth century.",
    "Stinking Bishop, from Gloucestershire, is washed in perry while it ripens. The name is earned.",
    "Paneer does not melt, because it is set with acid rather than rennet.",
    "Halloumi squeaks against your teeth because its proteins are packed tightly together.",
    "Traditional mozzarella is made from water buffalo milk.",
    "A full wheel of Parmigiano Reggiano weighs around 40 kilograms.",
    "The word cheese comes, eventually, from the Latin caseus.",
    "Cheese regularly appears on lists of the most shoplifted foods in the world.",
    "The world\u2019s first adhesive postage stamp, the Penny Black, was issued in Britain in 1840.",
    "The London Underground opened in 1863, the first underground railway in the world.",
    "Lloyd\u2019s of London began in Edward Lloyd\u2019s coffee house in the 1680s.",
    "Isaac Newton ran the Royal Mint, and still lost a fortune in the South Sea Bubble.",
    "Alan Turing appears on the Bank of England\u2019s \u00a350 note.",
    "The Bank of England looks after roughly 400,000 bars of gold, mostly for other people.",
    "Britain drinks around 100 million cups of tea a day.",
    "During tulip mania in the 1630s, single Dutch tulip bulbs reportedly sold for more than a house.",
    "In 2012 a software error cost the trading firm Knight Capital about $440 million in 45 minutes.",
    "The Black\u2013Scholes paper on pricing options was published in 1973. Traders have argued about it since."
  ];

  /* ---------- drawing ---------- */
  var RAT_SVG =
    '<svg viewBox="0 0 120 132" aria-hidden="true" focusable="false">' +
      '<path d="M90 114 C106 122 116 106 109 94" fill="none" stroke="#C99A95" stroke-width="3.5" stroke-linecap="round"/>' +
      '<ellipse cx="70" cy="99" rx="32" ry="26" fill="#8A8478"/>' +
      '<ellipse cx="60" cy="104" rx="17" ry="17" fill="#A39D90"/>' +
      '<ellipse cx="52" cy="125" rx="9" ry="4" fill="#C99A95"/>' +
      '<ellipse cx="80" cy="125" rx="9" ry="4" fill="#C99A95"/>' +
      '<circle cx="67" cy="47" r="12" fill="#8A8478"/>' +
      '<circle cx="67" cy="47" r="7" fill="#C99A95"/>' +
      '<ellipse cx="50" cy="65" rx="26" ry="21" fill="#8A8478"/>' +
      '<ellipse cx="30" cy="71" rx="15" ry="10" fill="#8A8478"/>' +
      '<circle cx="17" cy="71" r="4" fill="#D98C8C"/>' +
      '<g stroke="#EFE9DC" stroke-width="0.7" opacity="0.7">' +
        '<line x1="24" y1="72" x2="4" y2="66"/><line x1="24" y1="74" x2="3" y2="74"/><line x1="24" y1="76" x2="6" y2="82"/>' +
      '</g>' +
      '<g class="rg-eye"><circle cx="40" cy="62" r="3.2" fill="#14120E"/><circle cx="41" cy="61" r="1" fill="#EFE9DC"/></g>' +
      '<circle cx="40" cy="62" r="7.5" fill="none" stroke="#E0A72B" stroke-width="1.6"/>' +
      '<path d="M40 69.5 C40 78 48 86 58 88" fill="none" stroke="#E0A72B" stroke-width="1"/>' +
      '<polygon points="42,80 52,85 42,90" fill="#E0A72B"/>' +
      '<polygon points="62,80 52,85 62,90" fill="#E0A72B"/>' +
      '<circle cx="52" cy="85" r="2.6" fill="#F0BC4B"/>' +
      '<g class="rg-hat">' +
        '<rect x="38" y="14" width="27" height="29" rx="2" fill="#1E1B17" stroke="#3A342B"/>' +
        '<rect x="38" y="35" width="27" height="5" fill="#E0A72B"/>' +
        '<rect x="32" y="41" width="39" height="4.5" rx="2" fill="#1E1B17" stroke="#3A342B"/>' +
      '</g>' +
    '</svg>';

  var CSS =
    '#reginald{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:50;' +
      'display:flex;align-items:flex-end;gap:4px;pointer-events:none;' +
      'transform:translateY(calc(100% + 40px));transition:transform .5s cubic-bezier(.2,.9,.3,1.15)}' +
    '#reginald.rg-show{transform:none}' +
    '#reginald .rg-bubble{pointer-events:auto;position:relative;max-width:300px;margin-bottom:46px;' +
      'background:var(--panel);border:1px solid var(--rule);padding:13px 30px 13px 14px;' +
      'font-family:var(--mono);font-size:12.5px;line-height:1.55;color:var(--ink)}' +
    '#reginald .rg-bubble::after{content:"";position:absolute;right:-7px;bottom:16px;width:12px;height:12px;' +
      'background:var(--panel);border-right:1px solid var(--rule);border-bottom:1px solid var(--rule);transform:rotate(-45deg)}' +
    '#reginald .rg-close{position:absolute;top:4px;right:4px;width:26px;height:26px;border:0;background:none;' +
      'color:var(--ink-soft);font-size:16px;line-height:1;cursor:pointer;font-family:var(--mono)}' +
    '#reginald .rg-close:hover{color:var(--ink)}' +
    '#reginald .rg-quiet{display:block;margin-top:9px;padding:0;border:0;background:none;cursor:pointer;' +
      'font-family:var(--mono);font-size:11px;color:var(--amber-deep);border-bottom:1px solid currentColor}' +
    '#reginald .rg-quiet[hidden]{display:none}' +
    '#reginald .rg-link{display:inline-block;margin-top:9px;font-size:12px;color:var(--amber-deep);text-decoration:none;border-bottom:1px solid currentColor}' +
    '#reginald .rg-link[hidden]{display:none}' +
    '#reginald .rg-choices{display:grid;gap:6px;margin-top:10px}' +
    '#reginald .rg-choices[hidden]{display:none}' +
    '#reginald .rg-choice{text-align:left;padding:7px 9px;border:1px solid var(--rule);background:var(--bg);color:var(--ink);cursor:pointer;font-family:var(--mono);font-size:12px;line-height:1.4}' +
    '#reginald .rg-choice:hover{border-color:var(--amber)}' +
    '#reginald .rg-choice b{display:block;font-weight:500;color:var(--amber-deep)}' +
    '#reginald .rg-choice span{color:var(--ink-soft);font-size:11px}' +
    '#reginald button:focus-visible{outline:2px solid var(--amber);outline-offset:2px}' +
    '#reginald .rg-rat{width:96px;flex:none}' +
    '#reginald .rg-rat svg{display:block;width:100%;height:auto}' +
    '#reginald .rg-eye{transform-box:fill-box;transform-origin:center;animation:rg-blink 5.5s infinite}' +
    '#reginald .rg-hat{transform-box:fill-box;transform-origin:50% 100%;transform:rotate(-8deg)}' +
    '#reginald.rg-tip .rg-hat{animation:rg-tip .9s ease-in-out}' +
    '@keyframes rg-blink{0%,94%,100%{transform:scaleY(1)}97%{transform:scaleY(.1)}}' +
    '@keyframes rg-tip{0%,100%{transform:rotate(-8deg) translateY(0)}35%,60%{transform:rotate(-22deg) translateY(-7px)}}' +
    '@media (max-width:520px){' +
      '#reginald{left:10px;right:10px;justify-content:flex-end}' +
      '#reginald .rg-bubble{flex:1;max-width:none;margin-bottom:30px;font-size:12px}' +
      '#reginald .rg-rat{width:66px}' +
    '}' +
    '@media (prefers-reduced-motion:reduce){' +
      '#reginald{transition:none}#reginald .rg-eye,#reginald.rg-tip .rg-hat{animation:none}' +
    '}';

  /* ---------- build ---------- */
  var root, textEl, quietBtn, undoBtn, linkEl, choicesEl;
  function build() {
    var style = doc.createElement("style");
    style.textContent = CSS;
    doc.head.appendChild(style);

    root = doc.createElement("div");
    root.id = "reginald";
    root.innerHTML =
      '<div class="rg-bubble">' +
        '<div class="rg-text" role="status" aria-live="polite"></div>' +
        '<a class="rg-link" hidden></a>' +
        '<div class="rg-choices" hidden></div>' +
        '<button type="button" class="rg-quiet" hidden>No more facts, please</button>' +
        '<button type="button" class="rg-undo rg-quiet" hidden>Undo</button>' +
        '<button type="button" class="rg-close" aria-label="Dismiss Sir Reginald">\u00d7</button>' +
      '</div>' +
      '<div class="rg-rat">' + RAT_SVG + '</div>';
    doc.body.appendChild(root);
    textEl = root.querySelector(".rg-text");
    quietBtn = root.querySelector(".rg-quiet:not(.rg-undo)");
    undoBtn = root.querySelector(".rg-undo");
    linkEl = root.querySelector(".rg-link");
    choicesEl = root.querySelector(".rg-choices");
    root.querySelector(".rg-close").addEventListener("click", dismiss);
    quietBtn.addEventListener("click", function () {
      G.state.reginald.factsOff = true;
      G.save();
      say("Understood. I shall keep them to myself.", { undo: true, ms: 7000 });
    });
    undoBtn.addEventListener("click", function () {
      G.state.reginald.factsOff = false;
      G.save();
      say("Splendid. Facts resume in due course.", { ms: 3000, tip: true });
    });
  }

  /* ---------- showing and hiding ---------- */
  var showing = false, current = null, shownAt = 0, hideTimer = null, tipTimer = null;

  function say(text, opts) {
    opts = opts || {};
    if (!root) build();
    textEl.textContent = text;
    quietBtn.hidden = !opts.fact;
    undoBtn.hidden = !opts.undo;
    linkEl.hidden = !opts.link;
    if (opts.link) { linkEl.href = opts.link.href; linkEl.textContent = opts.link.label; }
    // Choices: buttons in the bubble; picking one (or the time running out) calls back once.
    if (current && current.choices && current.onChoose && !current.chosen) { current.chosen = true; current.onChoose(-1); }
    choicesEl.textContent = "";
    choicesEl.hidden = !opts.choices;
    if (opts.choices) {
      opts.choices.forEach(function (c, i) {
        var b = doc.createElement("button");
        b.type = "button"; b.className = "rg-choice";
        var t = doc.createElement("b"); t.textContent = c.label; b.appendChild(t);
        if (c.desc) { var d = doc.createElement("span"); d.textContent = c.desc; b.appendChild(d); }
        b.addEventListener("click", function () { choose(i); });
        choicesEl.appendChild(b);
      });
    }
    current = opts;
    shownAt = Date.now();
    showing = true;
    root.classList.add("rg-show");
    if (opts.tip) {
      root.classList.remove("rg-tip");
      void root.offsetWidth;                     // restart the hat tip animation
      root.classList.add("rg-tip");
      clearTimeout(tipTimer);
      tipTimer = setTimeout(function () { root.classList.remove("rg-tip"); }, 1400);
    }
    clearTimeout(hideTimer);
    if (!opts.stay) hideTimer = setTimeout(hide, opts.ms || LINE_MS);
  }

  function choose(i) {
    var c = current;
    if (!c || !c.choices || c.chosen) return;
    c.chosen = true;
    hide();
    if (c.onChoose) c.onChoose(i);
  }
  function hide() {
    clearTimeout(hideTimer);
    var c = current;
    if (c && c.choices && !c.chosen) { c.chosen = true; current = null; if (c.onChoose) c.onChoose(-1); }
    showing = false;
    current = null;
    if (root) root.classList.remove("rg-show");
  }

  function finishTutorial() {
    if (G.state.reginald.done) return;
    G.state.reginald.done = true;
    nextFactAt = Date.now() + FIRST_FACT_AFTER;
    G.save();
  }

  function dismiss() {
    var wasFact = current && (current.fact || current.undo || current.choices || current.reaction);
    hide();
    if (!wasFact) finishTutorial();
  }

  /* ---------- tutorial progress ---------- */
  var loadedAt = Date.now();
  var checkedReturning = false;

  function seen(id) { return G.state.reginald.seen.indexOf(id) !== -1; }

  var tutorialOn = true;
  function update() {
    if (!tutorialOn) return;
    var r = G.state.reginald;
    if (!checkedReturning) {
      checkedReturning = true;
      // People who played before Reginald existed skip straight past the tutorial.
      if (!r.done && r.seen.length === 0 && G.state.lifetime > 0) { finishTutorial(); return; }
    }
    if (r.done) return;
    if (Date.now() - loadedAt < INTRO_DELAY) return;
    if (showing && Date.now() - shownAt < MIN_LINE_MS) return;

    // Show the latest step that has become true, skipping any that went stale.
    var pick = -1;
    for (var i = 0; i < STEPS.length; i++) {
      if (!seen(STEPS[i].id) && STEPS[i].when()) pick = i;
    }
    if (pick === -1) return;
    for (var j = 0; j <= pick; j++) if (!seen(STEPS[j].id)) r.seen.push(STEPS[j].id);
    var step = STEPS[pick];
    say(step.text, { stay: step.stay, tip: step.tip, link: step.link, ms: step.ms });
    if (step.end) finishTutorial(); else G.save();
  }

  function skip() {
    if (G.state.reginald.done) { if (showing && !current.fact) hide(); return; }
    finishTutorial();
    say("Very good. Everything is open.", { ms: 3500, tip: true });
  }

  /* ---------- facts ---------- */
  var lastActive = 0;
  var nextFactAt = Date.now() + FIRST_FACT_AFTER;
  var order = [], pos = 0;
  function markActive() { lastActive = Date.now(); }
  doc.addEventListener("pointerdown", markActive, true);
  doc.addEventListener("keydown", markActive, true);

  function nextFact() {
    if (pos >= order.length) {
      order = FACTS.slice();
      for (var i = order.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1)), t = order[i]; order[i] = order[j]; order[j] = t;
      }
      pos = 0;
    }
    return order[pos++];
  }

  setInterval(function () {
    var r = G.state.reginald, now = Date.now();
    if ((tutorialOn && !r.done) || r.factsOff || showing) return;
    if (now - lastReactionAt < 20000) return;          // don't follow a reaction straight away
    if (G.isActive && !G.isActive()) return;
    if (doc.visibilityState === "hidden") return;
    if (now - lastActive > ACTIVE_WINDOW || now < nextFactAt) return;
    say(nextFact(), { fact: true, ms: FACT_MS });
    nextFactAt = now + FACT_GAP_MIN + Math.random() * (FACT_GAP_MAX - FACT_GAP_MIN);
  }, 1000);

  // Keep the tutorial moving even between renders (for the intro delay).
  setInterval(update, 500);

  function setSections(needs) {
    if (Object.prototype.toString.call(needs) === "[object Array]" && needs.length) {
      sectionNeeds = needs.slice().sort(function (a, b) { return a - b; });
    }
  }

  // Pages without the portfolio sections (like /cheese) switch the tutorial
  // off; Reginald then only does facts there, and the tutorial waits for the
  // main page.
  function setTutorial(on) {
    tutorialOn = on !== false;
    if (!tutorialOn) nextFactAt = Date.now() + FIRST_FACT_AFTER;
  }

  // On /cheese: one line of welcome for people who arrive there directly,
  // shown once, since the main page's tutorial won't have reached them.
  function welcome() {
    if (seen("cheese")) return;
    setTimeout(function () {
      // Read the save now, not earlier: taking over as the active tab loads a fresh copy.
      var r = G.state.reginald;
      if (seen("cheese") || r.seen.length >= 50) return;
      r.seen.push("cheese");
      G.save();
      say("Good evening. Sir Reginald, proprietor. Tap the cheese, hire some staff, and the rest follows. " +
          "The portfolio is top right, should you want it.", { tip: true, ms: 12000 });
    }, INTRO_DELAY);
  }

  /* ---------- reactions to big moments, rate-limited so he never chatters ---------- */
  var REACTIONS = {
    firstSale:   ["Congratulations on the sale. Do try not to spend it all at once."],
    sale:        ["Another sale. The lawyers are becoming quite fond of us.", "Sold again. I\u2019ll have the brass plaque updated."],
    takeover:    ["Sold to the highest bidder. Very good. I\u2019ll fetch my coat."],
    scandal:     ["A scandal. I shall be unavailable for comment.", "We\u2019re in the papers. Not the good pages."],
    masterstroke:["A masterstroke. I\u2019ll take some of the credit, if nobody minds."],
    restructure: ["Restructuring. Consultants are best admired from a distance."],
    bigWin:      ["A fine trade. Do it again, but don\u2019t tell me how."],
    bigLoss:     ["The market giveth. Today it mostly tooketh."],
    chair:       ["A Chair of the Board. Finally, someone to blame."],
    founder:     ["A Founder. They\u2019ll want a beanbag."],
    banker:      ["A Central Banker. I believe that makes us a currency."],
    golden:      ["Golden cheese. Click it before someone from accounts does."]
  };
  var lastReactionAt = 0, REACTION_GAP = 45000;
  function busy() { return showing && current && current.choices && !current.chosen; }
  function react(key, force) {
    var lines = REACTIONS[key];
    if (!lines || busy()) return false;
    var now = Date.now();
    if (!force && now - lastReactionAt < REACTION_GAP) return false;
    lastReactionAt = now;
    say(lines[Math.floor(Math.random() * lines.length)], { ms: 6000, tip: true, reaction: true });
    return true;
  }

  global.Reginald = { update: update, skip: skip, say: say, hide: hide, facts: FACTS,
                      setSections: setSections, setTutorial: setTutorial, welcome: welcome,
                      react: react, busy: busy, reactions: REACTIONS };
})(window);
