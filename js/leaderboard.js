/*
  Leaderboard for /cheese. Talks to the Cloudflare Worker in /worker.
  Set LEADERBOARD_URL to your Worker's address once it's live, for example
  "https://cheese-board.yourname.workers.dev". While it's empty, the
  leaderboard section stays hidden and nothing is sent anywhere.
*/
(function (global) {
  "use strict";
  var LEADERBOARD_URL = "https://cheese-board.puranjay1010.workers.dev";

  var G = global.CheeseCore, doc = global.document;
  if (!G || !LEADERBOARD_URL) return;

  var ID_KEY = "pk_cheese_lb";
  var SUBMIT_EVERY_MS = 150000;   // the server accepts one every 2 minutes
  var REFRESH_EVERY_MS = 60000;
  var SHOW = 20;

  function $(id) { return doc.getElementById(id); }
  function el(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function readId() {
    try { var v = JSON.parse(global.localStorage.getItem(ID_KEY)); if (v && v.player && v.token) return v; } catch (e) {}
    return null;
  }
  function writeId(v) { try { if (v) global.localStorage.setItem(ID_KEY, JSON.stringify(v)); else global.localStorage.removeItem(ID_KEY); } catch (e) {} }

  function api(path, body) {
    var opts = body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
    try {
      if (!global.fetch) return Promise.reject(new Error("no fetch"));
      return global.fetch(LEADERBOARD_URL + path, opts).then(function (r) {
        return r.json().then(function (d) { d._status = r.status; return d; });
      });
    } catch (e) { return Promise.reject(e); }
  }

  var me = readId(), lastBoard = null, lastSent = -1, lastSentAt = 0, offline = false, leaving = false;

  /* ---------- build the section ---------- */
  var sec = $("lb-sec");
  if (!sec) return;
  sec.hidden = false;

  function setStatus(text) { $("lb-status").textContent = text || ""; $("lb-status").hidden = !text; }

  function render() {
    var joined = !!me;
    $("lb-join-box").hidden = joined;
    $("lb-me-box").hidden = !joined;
    $("lb-leave-wrap").hidden = !joined;

    var list = $("lb-list");
    list.textContent = "";
    if (!lastBoard) { list.appendChild(el("p", "lb-empty", offline ? "The leaderboard isn\u2019t reachable right now." : "Loading\u2026")); return; }
    if (offline) list.appendChild(el("p", "lb-empty", "The leaderboard isn\u2019t reachable right now, so this may be out of date."));
    var top = lastBoard.top, mine = lastBoard.me;
    if (!top.length) list.appendChild(el("p", "lb-empty", "Nobody on the board yet. Be the first."));
    var shownMe = false;
    top.slice(0, SHOW).forEach(function (row) {
      var isMe = mine && row.id === mine.idShort;
      if (isMe) shownMe = true;
      list.appendChild(rowEl(row.rank, row.name, row.score, isMe));
    });
    if (mine && mine.rank && !shownMe) {
      list.appendChild(el("div", "lb-gap", "\u22ee"));
      list.appendChild(rowEl(mine.rank, mine.name, mine.score, true));
    }

    if (joined && mine) {
      $("lb-me-name").textContent = mine.name;
      var note = "";
      if (mine.hidden) note = "Your score is being checked before it shows on the board.";
      else if (!mine.rank) note = "Your score will appear after your next update.";
      if (mine.nameStatus === "pending") note += (note ? " " : "") + "\u201c" + mine.requested + "\u201d is waiting for approval.";
      if (mine.nameStatus === "rejected") note += (note ? " " : "") + "That name wasn\u2019t approved. Try another.";
      $("lb-me-note").textContent = note;
      $("lb-me-note").hidden = !note;
    }
  }
  function rowEl(rank, name, score, isMe) {
    var r = el("div", "lb-row" + (isMe ? " me" : ""));
    r.appendChild(el("span", "lb-rank", String(rank)));
    r.appendChild(el("span", "lb-name", name));
    r.appendChild(el("span", "lb-score", G.format(score)));
    return r;
  }

  /* ---------- talking to the server ---------- */
  function refresh() {
    return api("/board" + (me ? "?player=" + me.player : "")).then(function (d) {
      offline = false; lastBoard = d;
      if (me && d.me === null) { me = null; writeId(null); }   // removed by the admin, or left elsewhere
      render();
    }).catch(function () { offline = true; render(); });
  }

  function submit(force) {
    if (!me || !G.isActive()) return;
    var s = G.state;
    if (!force && (s.allTime === lastSent || Date.now() - lastSentAt < SUBMIT_EVERY_MS)) return;
    lastSentAt = Date.now();
    api("/submit", { player: me.player, token: me.token, score: s.allTime, playSeconds: s.playSeconds,
                     runs: s.runs, shares: s.sharesEarned }).then(function (d) {
      if (d._status === 403) { me = null; writeId(null); render(); return; }
      if (d.ok && !d.waited) { lastSent = s.allTime; refresh(); }
    }).catch(function () {});
  }

  $("lb-join").addEventListener("click", function () {
    $("lb-join").disabled = true;
    api("/join", {}).then(function (d) {
      $("lb-join").disabled = false;
      if (!d.player) { setStatus("Couldn\u2019t join right now. Try again in a moment."); return; }
      me = { player: d.player, token: d.token }; writeId(me);
      setStatus("");
      submit(true);
      refresh();
    }).catch(function () { $("lb-join").disabled = false; setStatus("Couldn\u2019t join right now. Try again in a moment."); });
  });

  $("lb-name-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var input = $("lb-name-input"), msg = $("lb-name-msg");
    var name = input.value.trim();
    if (!name) { msg.textContent = "Enter a name first."; return; }
    api("/name", { player: me.player, token: me.token, name: name }).then(function (d) {
      if (d.ok) { msg.textContent = "Sent. It\u2019ll show once approved."; input.value = ""; refresh(); }
      else msg.textContent = d.error || "Couldn\u2019t send that. Try again.";
    }).catch(function () { msg.textContent = "Couldn\u2019t send that. Try again."; });
  });
  $("lb-name-input").addEventListener("input", function () { $("lb-name-msg").textContent = ""; });

  $("lb-leave").addEventListener("click", function () {
    if (!leaving) { leaving = true; $("lb-leave").textContent = "Click again to remove yourself"; setTimeout(function () { leaving = false; $("lb-leave").textContent = "Leave the leaderboard"; }, 6000); return; }
    leaving = false;
    api("/leave", { player: me.player, token: me.token }).then(function () {
      me = null; writeId(null); $("lb-leave").textContent = "Leave the leaderboard"; refresh();
    }).catch(function () {});
  });

  global.setInterval(function () { if (doc.visibilityState !== "hidden") refresh(); }, REFRESH_EVERY_MS);
  global.setInterval(function () { if (doc.visibilityState !== "hidden") submit(false); }, 5000);
  render();
  refresh();
  submit(true);

  global.CheeseLeaderboard = { refresh: refresh, submit: submit, _url: LEADERBOARD_URL };
})(window);
