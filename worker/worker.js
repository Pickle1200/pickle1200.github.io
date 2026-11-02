/*
  Cheese leaderboard: a Cloudflare Worker with a D1 database.

  Endpoints (all JSON):
    GET  /board?player=ID       top 50, plus your own rank if you pass your id
    POST /join                  {}                              -> {player, token, name}
    POST /submit                {player, token, score, playSeconds, runs, shares}
    POST /name                  {player, token, name}           request your own name
    POST /leave                 {player, token}                 remove yourself
    GET  /admin                 your private admin page (needs ADMIN_KEY)
    POST /admin/api             {key, action, player?}

  Settings in Cloudflare:
    DB         D1 database binding
    ADMIN_KEY  secret, a long random password for /admin

  Safety rules:
    - Players appear under a generated cheese name. A name they type is only
      shown after you approve it in /admin.
    - Scores can only go up, one submission every 2 minutes per player.
    - A score that grows faster than the game allows is hidden (not deleted)
      until you approve or remove it in /admin.
    - Only your site can call it from a browser (see ALLOWED_ORIGINS).
*/

const ALLOWED_ORIGINS = [
  "https://puranjaykumar.com",
  "https://www.puranjaykumar.com",
  "null"                      // local test files opened from your computer
];
const BOARD_SIZE = 50;
const SUBMIT_GAP_S = 120;     // seconds between submissions per player
const BOARD_CACHE_S = 60;     // the public board is cached for a minute

/* ---------- plausibility ----------
   Real play grows roughly 10x every 15 minutes early on and slower later.
   We allow 10x every 5 minutes of play, with a generous floor, and never
   credit more play time than has really passed on our clock. */
const GROWTH_PER_SECOND = Math.log(10) / 300;
const FLOOR = 1e6;
function allowedScore(prevScore, creditedSeconds) {
  return Math.max(prevScore, FLOOR) * Math.exp(GROWTH_PER_SECOND * creditedSeconds) + FLOOR;
}
// Shares are always the cube root of all-time cheese over a million.
function sharesFor(score) { return Math.floor(Math.cbrt(Math.max(0, score) / 1e6) + 1e-9); }

/* ---------- generated names ---------- */
const ADJ = ["Mature", "Smoked", "Aged", "Crumbly", "Creamy", "Sharp", "Mild", "Vintage", "Farmhouse",
  "Extra Mature", "Oak Smoked", "Cave Aged", "Rinded", "Hard", "Soft", "Tangy", "Nutty", "Rustic"];
const CHEESE = ["Cheddar", "Gouda", "Brie", "Stilton", "Wensleydale", "Red Leicester", "Gruyere", "Edam",
  "Comte", "Halloumi", "Manchego", "Parmesan", "Camembert", "Emmental", "Lancashire", "Cheshire",
  "Caerphilly", "Double Gloucester", "Gorgonzola", "Roquefort"];
const ROLE = ["Intern", "Analyst", "Associate", "VP", "Director", "Partner"];
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function generatedName() { return pick(ADJ) + " " + pick(CHEESE) + " " + pick(ROLE); }

/* ---------- typed names: filtered, then held for approval ----------
   The filter only stops obvious junk reaching your queue; your approval is
   what keeps the board clean, so nothing typed is ever shown without it.
   Add words to BLOCKED as you see fit. */
const BLOCKED = ["fuck", "shit", "cunt", "bitch", "bastard", "dick", "cock", "pussy", "wank", "twat",
  "piss", "slut", "whore", "nazi", "hitler", "rape", "porn", "sex", "admin", "official"];
function normalise(s) {
  return s.toLowerCase()
    .replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e").replace(/4/g, "a")
    .replace(/5/g, "s").replace(/7/g, "t").replace(/8/g, "b").replace(/\$/g, "s").replace(/@/g, "a")
    .replace(/[^a-z]/g, "");
}
function checkName(raw) {
  if (typeof raw !== "string") return { ok: false, why: "Enter a name." };
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 3 || name.length > 20) return { ok: false, why: "Use 3 to 20 characters." };
  if (!/^[A-Za-z0-9 ]+$/.test(name)) return { ok: false, why: "Use letters, numbers and spaces only." };
  if (/^[0-9 ]+$/.test(name)) return { ok: false, why: "Include some letters." };
  const flat = normalise(name);
  if (BLOCKED.some(w => flat.includes(w))) return { ok: false, why: "Try a different name." };
  if (/(www|http|com$|couk$)/.test(flat)) return { ok: false, why: "No web addresses, please." };
  return { ok: true, name };
}

/* ---------- helpers ---------- */
function cors(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}
function json(data, status, origin, extra) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json" }, cors(origin), extra || {})
  });
}
async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function randomHex(bytes) {
  const a = new Uint8Array(bytes); crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, "0")).join("");
}
function validId(id) { return typeof id === "string" && /^[a-f0-9]{24}$/.test(id); }
function finiteNum(x) { return typeof x === "number" && isFinite(x) && x >= 0; }
function now() { return Math.floor(Date.now() / 1000); }
// A player's last approved name stays until you reset it, even while a new
// request is waiting or after you reject one.
function shownName(p) { return p.approved_name || p.gen_name; }

async function authed(env, body) {
  if (!body || !validId(body.player) || typeof body.token !== "string" || body.token.length !== 64) return null;
  const p = await env.DB.prepare("SELECT * FROM players WHERE id = ?").bind(body.player).first();
  if (!p) return null;
  return p.token_hash === await sha256(body.token) ? p : null;
}

/* ---------- handlers ---------- */
async function board(env, url, origin) {
  const player = url.searchParams.get("player");
  let top = null;
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const cacheKey = new Request(url.origin + "/board-cache");
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) top = await hit.json();
  }
  if (!top) {
    const rows = await env.DB.prepare(
      "SELECT id, gen_name, approved_name, name_status, score, runs FROM players " +
      "WHERE flagged = 0 AND score > 0 ORDER BY score DESC LIMIT ?").bind(BOARD_SIZE).all();
    top = rows.results.map((p, i) => ({ rank: i + 1, id: p.id.slice(0, 6), name: shownName(p), score: p.score, runs: p.runs }));
    if (cache) await cache.put(cacheKey, new Response(JSON.stringify(top), { headers: { "Cache-Control": "max-age=" + BOARD_CACHE_S } }));
  }
  let me = null;
  if (validId(player)) {
    const p = await env.DB.prepare("SELECT * FROM players WHERE id = ?").bind(player).first();
    if (p) {
      let rank = null;
      if (!p.flagged && p.score > 0) {
        const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM players WHERE flagged = 0 AND score > ?").bind(p.score).first();
        rank = r.n + 1;
      }
      me = { rank, name: shownName(p), generated: p.gen_name, requested: p.req_name, nameStatus: p.name_status,
             score: p.score, hidden: !!p.flagged, idShort: p.id.slice(0, 6) };
    }
  }
  return json({ top, me }, 200, origin);
}

async function join(env, origin) {
  const id = randomHex(12), token = randomHex(32);
  const name = generatedName();
  await env.DB.prepare(
    "INSERT INTO players (id, token_hash, gen_name, name_status, score, runs, shares, credited_play, last_submit, created, flagged) " +
    "VALUES (?, ?, ?, 'none', 0, 0, 0, 0, 0, ?, 0)").bind(id, await sha256(token), name, now()).run();
  return json({ player: id, token, name }, 200, origin);
}

async function submit(env, body, origin) {
  const p = await authed(env, body);
  if (!p) return json({ error: "Not recognised. Try joining again." }, 403, origin);
  const { score, playSeconds, runs, shares } = body;
  if (![score, playSeconds, runs, shares].every(finiteNum)) return json({ error: "Bad numbers." }, 400, origin);
  const t = now();
  if (t - p.last_submit < SUBMIT_GAP_S) return json({ ok: true, waited: true }, 200, origin);
  if (score < p.score) return json({ error: "Scores only go up." }, 400, origin);
  if (shares > sharesFor(score) || runs > shares) return json({ error: "Those numbers don't add up." }, 400, origin);

  // Credit play time, but never more than has really passed since the last
  // submission (the first one is credited what the player reports).
  const first = p.last_submit === 0;
  const reportedGain = Math.max(0, playSeconds - p.credited_play);
  const credit = first ? playSeconds : Math.min(reportedGain, t - p.last_submit + 60);
  const flagged = p.flagged || score > allowedScore(p.score, credit) ? 1 : 0;

  await env.DB.prepare(
    "UPDATE players SET score = ?, runs = ?, shares = ?, credited_play = credited_play + ?, last_submit = ?, flagged = ? WHERE id = ?")
    .bind(score, runs, shares, credit, t, flagged, p.id).run();
  return json({ ok: true, hidden: !!flagged }, 200, origin);
}

async function requestName(env, body, origin) {
  const p = await authed(env, body);
  if (!p) return json({ error: "Not recognised. Try joining again." }, 403, origin);
  const c = checkName(body.name);
  if (!c.ok) return json({ error: c.why }, 400, origin);
  await env.DB.prepare("UPDATE players SET req_name = ?, name_status = 'pending' WHERE id = ?").bind(c.name, p.id).run();
  return json({ ok: true, status: "pending" }, 200, origin);
}

async function leave(env, body, origin) {
  const p = await authed(env, body);
  if (!p) return json({ error: "Not recognised." }, 403, origin);
  await env.DB.prepare("DELETE FROM players WHERE id = ?").bind(p.id).run();
  return json({ ok: true }, 200, origin);
}

/* ---------- admin ---------- */
async function adminApi(env, body, origin, url) {
  if (!env.ADMIN_KEY || !body || body.key !== env.ADMIN_KEY) return json({ error: "Wrong key." }, 403, origin);
  const DB = env.DB, id = body.player;
  switch (body.action) {
    case "list": {
      const pending = await DB.prepare("SELECT id, gen_name, req_name, score FROM players WHERE name_status = 'pending' ORDER BY score DESC LIMIT 200").all();
      const flagged = await DB.prepare("SELECT id, gen_name, approved_name, name_status, score, credited_play FROM players WHERE flagged = 1 ORDER BY score DESC LIMIT 200").all();
      const top = await DB.prepare("SELECT id, gen_name, approved_name, name_status, score, runs FROM players WHERE flagged = 0 ORDER BY score DESC LIMIT 100").all();
      const count = await DB.prepare("SELECT COUNT(*) AS n FROM players").first();
      return json({ pending: pending.results, flagged: flagged.results, top: top.results, players: count.n }, 200, origin);
    }
    case "approveName":
      await DB.prepare("UPDATE players SET approved_name = req_name, name_status = 'approved' WHERE id = ? AND name_status = 'pending'").bind(id).run(); break;
    case "approveAllNames":
      await DB.prepare("UPDATE players SET approved_name = req_name, name_status = 'approved' WHERE name_status = 'pending'").run(); break;
    case "rejectName":
      await DB.prepare("UPDATE players SET name_status = 'rejected' WHERE id = ?").bind(id).run(); break;
    case "resetName":
      await DB.prepare("UPDATE players SET approved_name = NULL, name_status = 'none' WHERE id = ?").bind(id).run(); break;
    case "approveScore":
      await DB.prepare("UPDATE players SET flagged = 0 WHERE id = ?").bind(id).run(); break;
    case "hide":
      await DB.prepare("UPDATE players SET flagged = 1 WHERE id = ?").bind(id).run(); break;
    case "delete":
      await DB.prepare("DELETE FROM players WHERE id = ?").bind(id).run(); break;
    default:
      return json({ error: "Unknown action." }, 400, origin);
  }
  // Clear the cached board so your change shows straight away.
  if (typeof caches !== "undefined") await caches.default.delete(new Request(url.origin + "/board-cache")).catch(() => {});
  return json({ ok: true }, 200, origin);
}

const ADMIN_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Cheese leaderboard admin</title>
<style>
:root{color-scheme:dark}body{background:#14120E;color:#EFE9DC;font:14px/1.5 ui-monospace,Menlo,monospace;max-width:900px;margin:0 auto;padding:24px 16px 80px}
h1{font-size:20px;font-weight:600}h2{font-size:14px;font-weight:600;margin:28px 0 8px;color:#F0BC4B}
table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:7px 6px;border-bottom:1px solid #2F2A22;vertical-align:top}th{color:#968C7B;font-weight:400;font-size:12px}
button{font:inherit;font-size:12px;padding:4px 9px;margin:0 4px 4px 0;cursor:pointer;background:none;color:#EFE9DC;border:1px solid #2F2A22}
button.ok{border-color:#E0A72B;color:#F0BC4B}button.bad{border-color:#C0392B;color:#F0A39A}
input{font:inherit;padding:6px 8px;background:#1C1913;color:#EFE9DC;border:1px solid #2F2A22;width:280px}
.muted{color:#968C7B}.empty{color:#968C7B;padding:8px 0}
</style></head><body>
<h1>Cheese leaderboard admin</h1>
<p id="login"><input id="key" type="password" placeholder="Admin key" autocomplete="current-password"> <button id="go" class="ok">Open</button> <span id="err" class="muted"></span></p>
<div id="main" hidden>
<p class="muted" id="summary"></p>
<h2>Names waiting for approval</h2><div id="pending"></div>
<h2>Hidden scores (looked too fast, or you hid them)</h2><div id="flagged"></div>
<h2>The board (top 100)</h2><div id="top"></div>
</div>
<script>
const $=id=>document.getElementById(id);
let KEY=sessionStorage.getItem("ak")||"";
const fmt=n=>{if(n<1000)return String(Math.floor(n));const e=Math.floor(Math.log10(n));if(e>=15)return (n/10**e).toFixed(2)+"e"+e;const u=Math.floor(e/3);return (n/1000**u).toFixed(2)+["","K","M","B","T"][u];};
const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
async function api(action,player){const r=await fetch("/admin/api",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:KEY,action,player})});return r.json();}
function table(rows,cols,btns){if(!rows.length)return '<div class="empty">Nothing here.</div>';
  return '<table><tr>'+cols.map(c=>'<th>'+c[0]+'</th>').join('')+'<th></th></tr>'+rows.map(r=>'<tr>'+cols.map(c=>'<td>'+c[1](r)+'</td>').join('')+'<td>'+btns.map(b=>'<button class="'+(b[2]||'')+'" data-a="'+b[1]+'" data-p="'+r.id+'">'+b[0]+'</button>').join('')+'</td></tr>').join('')+'</table>';}
const shown=r=>r.name_status==="approved"&&r.approved_name?esc(r.approved_name):esc(r.gen_name)+' <span class="muted">(generated)</span>';
async function load(){const d=await api("list");if(d.error){$("err").textContent=d.error;$("main").hidden=true;$("login").hidden=false;return;}
  sessionStorage.setItem("ak",KEY);$("login").hidden=true;$("main").hidden=false;
  $("summary").textContent=d.players+" players";
  $("pending").innerHTML=(d.pending.length>1?'<p><button class="ok" data-a="approveAllNames">Approve all '+d.pending.length+'</button></p>':'')+
    table(d.pending,[["Requested",r=>"<b>"+esc(r.req_name)+"</b>"],["Showing as",r=>esc(r.gen_name)],["Score",r=>fmt(r.score)]],[["Approve","approveName","ok"],["Reject","rejectName","bad"]]);
  $("flagged").innerHTML=table(d.flagged,[["Name",shown],["Score",r=>fmt(r.score)],["Play time",r=>Math.round(r.credited_play/60)+" min"]],[["Show it","approveScore","ok"],["Delete","delete","bad"]]);
  $("top").innerHTML=table(d.top,[["Name",shown],["Score",r=>fmt(r.score)],["Sales",r=>r.runs]],[["Reset name","resetName"],["Hide","hide"],["Delete","delete","bad"]]);}
document.addEventListener("click",async e=>{const b=e.target.closest("button[data-a]");if(!b)return;
  if(b.dataset.a==="delete"&&!confirm("Delete this player for good?"))return;
  b.disabled=true;await api(b.dataset.a,b.dataset.p);load();});
$("go").onclick=()=>{KEY=$("key").value;load();};
$("key").addEventListener("keydown",e=>{if(e.key==="Enter"){KEY=$("key").value;load();}});
if(KEY)load();
</script></body></html>`;

/* ---------- router ---------- */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    try {
      if (request.method === "GET" && url.pathname === "/board") return await board(env, url, origin);
      if (request.method === "GET" && url.pathname === "/admin") {
        return new Response(ADMIN_HTML, { headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex" } });
      }
      if (request.method === "POST") {
        const body = await request.json().catch(() => null);
        switch (url.pathname) {
          case "/join":      return await join(env, origin);
          case "/submit":    return await submit(env, body, origin);
          case "/name":      return await requestName(env, body, origin);
          case "/leave":     return await leave(env, body, origin);
          case "/admin/api": return await adminApi(env, body, origin, url);
        }
      }
      return json({ error: "Not found." }, 404, origin);
    } catch (e) {
      return json({ error: "Something went wrong on the server." }, 500, origin);
    }
  }
};

// Exposed for tests only (ignored by Cloudflare).
export const _test = { checkName, allowedScore, sharesFor, generatedName, normalise };
