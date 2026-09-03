// Squawkr Omarchy widget — client controller. Loads prefs from localStorage (home field + up to
// three tracked airfields/zones), fetches live data from the plugin API, renders the mock's panel
// for real, refreshes on an interval, and wires add / remove / set-home + keyboard shortcuts.

import * as api from "./api.js";
import * as R from "./render.js";

const C = window.SQUAWKR_CONFIG;
const $ = (s, r = document) => r.querySelector(s);
const el = (id) => document.getElementById(id);

// ---- prefs ---------------------------------------------------------------------------------
// Persisted shape (identity only; full cards are fetched live):
//   { home: "ESSV", tracked: [ {kind:"af", icao} | {kind:"zn", id, bbox, desig, name} ] }
function loadPrefs() {
  try { const p = JSON.parse(localStorage.getItem(C.LS_PREFS) || "null"); if (p && p.home) return p; }
  catch {}
  return null;
}
function savePrefs() { try { localStorage.setItem(C.LS_PREFS, JSON.stringify(prefs)); } catch {} }

let prefs = loadPrefs();
let homeCard = null;         // full airfield card for prefs.home
let trackedCards = [];       // full cards, aligned to prefs.tracked
let lastFetch = null;        // Date of last successful data load
let refreshing = false;
let sel = -1;                // keyboard-selected tracked slot on the home view
let timer = null;

// ---- data ----------------------------------------------------------------------------------
async function fetchCard(ref) {
  try {
    if (ref.kind === "af") return await api.airfield(ref.icao);
    const zones = await api.areas(ref.bbox);
    return zones.find((z) => z.id === ref.id || z.desig === ref.desig) || { ...ref, kind: "zn", status: "unknown", week: "NNNNNNN" };
  } catch { return ref.kind === "af" ? { kind: "af", icao: ref.icao, name: ref.name || ref.icao, catc: [146,148,156], runways: [], clouds: [] } : { ...ref, status: "unknown", week: "NNNNNNN" }; }
}

async function seedIfNeeded() {
  if (prefs) return;
  prefs = { home: C.SEED_HOME, tracked: [] };
  try {
    const near = (await api.airfields(C.SEED_FIELD_BBOX)).filter((x) => x.icao !== C.SEED_HOME);
    near.sort((a, b) => ((a.lat - 57.66) ** 2 + (a.lon - 18.35) ** 2) - ((b.lat - 57.66) ** 2 + (b.lon - 18.35) ** 2));
    if (near[0]) prefs.tracked.push({ kind: "af", icao: near[0].icao, name: near[0].name });
  } catch {}
  try {
    const zs = await api.areas(C.SEED_BBOX);
    if (zs[0]) prefs.tracked.push({ kind: "zn", id: zs[0].id, bbox: zs[0].bbox, desig: zs[0].desig, name: zs[0].name });
  } catch {}
  savePrefs();
}

async function refresh() {
  refreshing = true; renderChrome();
  try {
    homeCard = await api.airfield(prefs.home);
  } catch { homeCard = { kind: "af", icao: prefs.home, name: prefs.home, catc: [146,148,156], runways: [], clouds: [] }; }
  trackedCards = await Promise.all(prefs.tracked.map(fetchCard));
  lastFetch = new Date();
  refreshing = false;
  render();
}

// ---- rendering -----------------------------------------------------------------------------
const relTime = (d) => {
  if (!d) return "—";
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 30) return "now"; if (s < 90) return "1 min ago";
  if (s < 3600) return Math.round(s / 60) + " min ago";
  return Math.round(s / 3600) + " h ago";
};

// Honest data age: worst METAR age across cards drives the header state.
function ageState() {
  const ages = [homeCard, ...trackedCards].filter((c) => c && c.kind === "af" && c.ageMin != null).map((c) => c.ageMin);
  const stale = [homeCard, ...trackedCards].some((c) => c && c.stale);
  const worst = ages.length ? Math.max(...ages) : null;
  if (worst != null && worst > C.STALE_CUTOFF_MIN) return { cls: "unknown", txt: "data unknown — older than " + C.STALE_CUTOFF_MIN + " min" };
  if (stale) return { cls: "warn", txt: "cached · updated " + relTime(lastFetch) };
  return { cls: "", txt: "updated " + relTime(lastFetch) };
}

function renderChrome() {
  // The panel window is the whole UI now — no in-app toolbar. Just refresh the header line.
  const hc = homeCard || {};
  const t = $(".phead .t", el("v-home"));
  if (t) {
    const a = ageState();
    t.className = "t" + (a.cls === "warn" ? " stale" : "");
    t.innerHTML = `${R.esc(hc.name || "—")} · ${a.txt}${refreshing ? '<span class="spin">⟳</span>' : ""}`;
  }
}

function render() {
  if (!homeCard) return;
  const home = el("v-home");
  const minis = prefs.tracked.map((_, i) => R.mini(trackedCards[i], false)).join("");
  const slotsLeft = C.MAX_TRACKED - prefs.tracked.length;
  const addCard = slotsLeft > 0
    ? `<div class="add" data-add><span class="plus">+</span><span>add</span></div>`
    : "";
  home.innerHTML = `
    <div class="phead"><span class="brand">${R.LOGO}SQUAWKR</span><span class="t"></span></div>
    ${R.heroAf(homeCard)}
    <hr>
    <div class="row">${minis}${addCard}</div>
    <div class="foot"><div class="keys"><kbd>a</kbd> add<span class="ksep">·</span><kbd>h</kbd> set home<span class="ksep">·</span><kbd>x</kbd> remove<span class="ksep">·</span><kbd>↵</kbd> open</div>
      <a class="svc" href="${C.SERVICE_URL}" target="_blank" rel="noopener">Full airspace &amp; forecasts →</a></div>`;

  // detail panels (home + each tracked)
  const details = [R.detailAf(homeCard)];
  trackedCards.forEach((c) => details.push(c.kind === "af" ? R.detailAf(c) : R.detailZn(c)));
  el("details").innerHTML = details.join("");

  // A refresh rebuilds every panel as hidden; restore whichever was open (fall back to home
  // if the open item was just removed) so a background refresh never closes a detail view.
  // Restore visibility directly (no scroll) — show() is for user navigation.
  if (!document.getElementById(currentPanel)) currentPanel = "v-home";
  document.querySelectorAll(".panel").forEach((p) => (p.hidden = p.id !== currentPanel));
  applySel();
  renderChrome();
  wireDynamic();
}

// keyboard selection highlight
function applySel() {
  const minis = document.querySelectorAll("#v-home .row .mini");
  minis.forEach((m, i) => m.classList.toggle("sel", i === sel));
}

// ---- navigation between the home panel and detail panels -----------------------------------
let currentPanel = "v-home";
function show(id) {
  currentPanel = id;
  document.querySelectorAll(".panel").forEach((p) => (p.hidden = p.id !== id));
  window.scrollTo({ top: 0, behavior: "smooth" });
}
const atHome = () => !el("v-home").hidden;

// ---- actions -------------------------------------------------------------------------------
function toast(msg) {
  const t = el("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2200);
}

function removeTracked(key) {
  const before = prefs.tracked.length;
  prefs.tracked = prefs.tracked.filter((r) => (r.kind === "af" ? r.icao : r.id) !== key);
  if (prefs.tracked.length !== before) { savePrefs(); sel = Math.min(sel, prefs.tracked.length - 1); refresh(); toast("Removed"); }
}

function setHome(icao) {
  if (!icao || icao === prefs.home) return;
  const old = prefs.home;
  prefs.tracked = prefs.tracked.filter((r) => !(r.kind === "af" && r.icao === icao));
  prefs.home = icao;
  if (old && old !== icao) prefs.tracked.unshift({ kind: "af", icao: old });
  // dedupe + cap
  const seen = new Set();
  prefs.tracked = prefs.tracked.filter((r) => { const k = r.kind === "af" ? "af:" + r.icao : "zn:" + r.id; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, C.MAX_TRACKED);
  savePrefs(); refresh(); toast(icao + " is now home");
}

function addTracked(ref) {
  if (prefs.tracked.length >= C.MAX_TRACKED) { toast("Tracking " + C.MAX_TRACKED + " already — remove one first"); return; }
  const k = ref.kind === "af" ? "af:" + ref.icao : "zn:" + ref.id;
  if (ref.kind === "af" && ref.icao === prefs.home) { toast("That's your home field"); return; }
  const dup = prefs.tracked.some((r) => (r.kind === "af" ? "af:" + r.icao : "zn:" + r.id) === k);
  if (dup) { toast("Already tracked"); return; }
  prefs.tracked.push(ref); savePrefs(); refresh(); toast("Added");
}

// ---- add / search overlay ------------------------------------------------------------------
// One combined search: a single box searches airfields (global text search) AND restriction
// zones together. Airfields come from /plugin/search; zones aren't text-searchable server-side
// (that endpoint is airfields-only and areas are bbox-only), so we prefetch a regional pool of
// zones on open — the seed area plus a box around the home field — and text-match it client-side.
let searchResults = [];   // flat: [...airfields, ...zones]; zones carry _zone:true
let searchSel = 0;
let searchTimer = null;
let zonePool = [];        // prefetched restriction zones to text-match against
let poolLoading = false;
let lastQuery = "";       // the query the visible results belong to (guards stale async)

const _norm = (s) => String(s == null ? "" : s).toLowerCase().replace(/\s+/g, "");

function openOverlay() {
  if (prefs.tracked.length >= C.MAX_TRACKED) { toast("Tracking " + C.MAX_TRACKED + " already — remove one first"); return; }
  searchResults = []; searchSel = 0; lastQuery = "";
  el("overlay").hidden = false;
  drawOverlay();
  setTimeout(() => $("#overlay .field")?.focus(), 20);
  loadZonePool();
}
function closeOverlay() { el("overlay").hidden = true; }

// Gather a regional pool of zones to search by name/designator: the seed bbox plus a box around
// the home field (so wherever the user has based themselves, their local zones are searchable).
async function loadZonePool() {
  poolLoading = true;
  const bboxes = [C.SEED_BBOX];
  if (homeCard && Number.isFinite(homeCard.lat) && Number.isFinite(homeCard.lon)) {
    const pad = 1.2;
    bboxes.push([homeCard.lon - pad, homeCard.lat - pad, homeCard.lon + pad, homeCard.lat + pad].map((n) => n.toFixed(3)).join(","));
  }
  try {
    const lists = await Promise.all(bboxes.map((b) => api.areas(b).catch(() => [])));
    const seen = new Set(), pool = [];
    for (const list of lists) for (const z of list) { if (!seen.has(z.desig)) { seen.add(z.desig); pool.push(z); } }
    zonePool = pool;
  } catch { zonePool = []; }
  poolLoading = false;
  if (lastQuery.trim()) runSearch(lastQuery);   // fold zones in if the user typed while loading
}

function drawOverlay() {
  el("overlay").innerHTML = `
    <div class="dialog">
      <h3>Add to your widget</h3>
      <p class="hint">Search airfields and restriction zones — an ICAO, a place, or a zone name.</p>
      <input class="field" placeholder="e.g. ESSA · Visby · R28" autocomplete="off">
      <ul class="results"></ul>
      <div class="drow"><span></span><button class="cancel" data-cancel>Cancel (Esc)</button></div>
    </div>`;
  drawResults();
}

function drawResults() {
  const ul = $("#overlay .results"); if (!ul) return;
  if (!lastQuery.trim()) { ul.innerHTML = `<li class="emptymsg" style="cursor:default">Type to search airfields and zones…</li>`; return; }
  if (!searchResults.length) {
    const tail = poolLoading ? "" : "";
    ul.innerHTML = `<li class="emptymsg" style="cursor:default">No airfields or zones match “${R.esc(lastQuery)}”.${tail}</li>`;
    return;
  }
  let html = "", lastType = null;
  searchResults.forEach((r, i) => {
    const type = r._zone ? "zn" : "af";
    if (type !== lastType) {
      html += `<li class="resgroup" style="cursor:default">${type === "af" ? "Airfields" : "Restriction zones"}</li>`;
      lastType = type;
    }
    const on = i === searchSel ? " sel" : "";
    if (r._zone) {
      const zc = R.ZCOL[r.status] || [146, 148, 156];
      html += `<li data-i="${i}" class="${on.trim()}"><span class="ricon" style="color:rgb(${zc.join(",")})">${R.zicon(18)}</span>` +
        `<span class="code">${R.esc(r.desig)}</span><span class="nm">${R.esc(r.name || "")}</span>` +
        `<span class="sub">${R.esc((r.lo || "GND") + "–" + (r.hi || "UNL"))}</span></li>`;
    } else {
      html += `<li data-i="${i}" class="${on.trim()}"><span class="ricon" style="color:var(--big)">${R.fieldicon(18)}</span>` +
        `<span class="code">${R.esc(r.icao)}</span><span class="nm">${R.esc(r.name || "")}</span>` +
        `${r.iata ? `<span class="sub">${R.esc(r.iata)}</span>` : ""}</li>`;
    }
  });
  ul.innerHTML = html;
}

function scrollSelIntoView() { $("#overlay .results li.sel")?.scrollIntoView({ block: "nearest" }); }

async function runSearch(q) {
  lastQuery = q;
  if (!q.trim()) { searchResults = []; drawResults(); return; }
  const nq = _norm(q);
  let afs = [];
  try { afs = await api.search(q, 8); } catch {}
  if (lastQuery !== q) return;   // a newer keystroke already superseded this
  const zns = (zonePool || [])
    .filter((z) => _norm(z.desig).includes(nq) || _norm(z.name).includes(nq))
    .slice(0, 8);
  searchResults = [
    ...afs.map((a) => ({ ...a, _zone: false })),
    ...zns.map((z) => ({ ...z, _zone: true })),
  ];
  searchSel = 0;
  drawResults();
}

function pickResult(i) {
  const r = searchResults[i]; if (!r) return;
  if (r._zone) addTracked({ kind: "zn", id: r.id, bbox: r.bbox, desig: r.desig, name: r.name });
  else addTracked({ kind: "af", icao: r.icao, name: r.name });
  closeOverlay();
}

// ---- event wiring --------------------------------------------------------------------------
function wireDynamic() {
  // handled by delegation below; nothing per-render needed
}

// Open the full service in the user's real browser and shut the panel — standard toolbar-panel
// behaviour. In the packaged panel, serve.py's /__open runs xdg-open then closes this window; in
// a plain dev tab (no such route) the fetch fails and we fall back to a normal new-tab open.
function openService(url) {
  fetch(`${location.origin}/__open?close=1&url=${encodeURIComponent(url)}`)
    .then((r) => { if (!r.ok) throw new Error("no route"); })
    .catch(() => window.open(url, "_blank", "noopener"));
}

// delegate clicks across the whole document (home panel is re-rendered each refresh)
document.addEventListener("click", (e) => {
  const svc = e.target.closest("a.svc");
  if (svc) { e.preventDefault(); openService(svc.href); return; }
  const act = e.target.closest("[data-act]");
  if (act) { e.stopPropagation(); const key = act.dataset.key;
    if (act.dataset.act === "remove") removeTracked(key);
    if (act.dataset.act === "home") setHome(key);
    return; }
  if (e.target.closest("[data-add]")) { openOverlay(); return; }
  const go = e.target.closest("[data-go]");
  if (go) { show(go.dataset.go); return; }
  if (e.target.closest("[data-back]")) { show("v-home"); return; }
  // overlay
  if (e.target.closest("[data-cancel]")) { closeOverlay(); return; }
  const li = e.target.closest("#overlay .results li[data-i]");
  if (li) { pickResult(+li.dataset.i); return; }
  if (e.target.id === "overlay") closeOverlay();
});

document.addEventListener("input", (e) => {
  if (e.target.matches("#overlay .field")) {
    clearTimeout(searchTimer);
    const q = e.target.value;
    searchTimer = setTimeout(() => runSearch(q), 180);
  }
});

document.addEventListener("keydown", (e) => {
  const overlayOpen = !el("overlay").hidden;
  if (overlayOpen) {
    if (e.key === "Escape") { closeOverlay(); return; }
    if (e.key === "ArrowDown") { searchSel = Math.min(searchSel + 1, searchResults.length - 1); drawResults(); scrollSelIntoView(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { searchSel = Math.max(searchSel - 1, 0); drawResults(); scrollSelIntoView(); e.preventDefault(); }
    else if (e.key === "Enter") { if (searchResults.length) pickResult(searchSel); e.preventDefault(); }
    return;
  }
  if (e.key === "Escape") { if (!atHome()) show("v-home"); return; }
  // shortcuts only on the home view, and not while typing
  if (!atHome() || /input|textarea/i.test(e.target.tagName)) return;
  const n = prefs ? prefs.tracked.length : 0;
  if (e.key === "a") { openOverlay(); e.preventDefault(); }
  else if (e.key === "ArrowRight") { sel = n ? (sel + 1 + n) % n : -1; applySel(); }
  else if (e.key === "ArrowLeft") { sel = n ? (sel - 1 + n) % n : -1; applySel(); }
  else if (e.key === "h" && sel >= 0) { const r = prefs.tracked[sel]; if (r && r.kind === "af") setHome(r.icao); else toast("Only an airfield can be home"); }
  else if (e.key === "x" && sel >= 0) { const r = prefs.tracked[sel]; if (r) removeTracked(r.kind === "af" ? r.icao : r.id); }
  else if (e.key === "Enter" && sel >= 0) { const r = prefs.tracked[sel]; if (r) show("d-" + (r.kind === "af" ? r.icao : r.id)); }
});

// refresh when the panel/tab regains focus (matches "on open")
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });

// ---- boot ----------------------------------------------------------------------------------
async function boot() {
  try {
    await api.ensureToken();
  } catch (e) {
    el("v-home").innerHTML = `<div class="phead"><span class="brand">${R.LOGO}SQUAWKR</span></div><p class="emptymsg">Couldn't reach the plugin API.<br>${R.esc(String(e.message || e))}</p>`;
    return;
  }
  await seedIfNeeded();
  await refresh();
  timer = setInterval(refresh, C.REFRESH_MS);
}
boot();
