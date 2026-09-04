// Browser API client for the Squawkr plugin surface. A faithful port of prototypes/tui/api.py:
// it hits /plugin/* (token-gated) and maps the JSON onto the same card model the mock renders.
// Adds what a browser needs that the Python client did not: a per-install token (self-issued and
// kept in localStorage) and honest handling of 401/429.

const C = window.SQUAWKR_CONFIG;

const _CATCOL = {
  CAVOK: [58, 178, 118], VFR: [58, 178, 118], MVFR: [222, 158, 42],
  IFR: [219, 68, 68], LIFR: [150, 80, 190],
};
export const catColor = (cat) => _CATCOL[cat] || [146, 148, 156];

// ---- token ---------------------------------------------------------------------------------
function getToken() { try { return localStorage.getItem(C.LS_TOKEN) || null; } catch { return null; } }
function setToken(t) { try { localStorage.setItem(C.LS_TOKEN, t); } catch {} }

// Self-provision a free install token (the minimal flow; later this becomes an account-bound
// token via the device-auth flow). Returns the token or throws.
export async function ensureToken() {
  let t = getToken();
  if (t) return t;
  const res = await fetch(C.API_BASE + "/plugin/token", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ label: "omarchy widget" }),
  });
  if (!res.ok) throw new Error("could not obtain a plugin token (" + res.status + ")");
  const j = await res.json();
  if (!j.token) throw new Error("token endpoint returned no token");
  setToken(j.token);
  return j.token;
}

let _reprovisioned = false;
async function _get(path) {
  const t = await ensureToken();
  const doFetch = (tok) =>
    fetch(C.API_BASE + path, { headers: { accept: "application/json", authorization: "Bearer " + tok } });
  let res = await doFetch(t);
  // A stored token that the server no longer honours (revoked, or a wiped DB): drop it and
  // self-provision a fresh one, once, then retry.
  if (res.status === 401 && !_reprovisioned) {
    _reprovisioned = true;
    try { localStorage.removeItem(C.LS_TOKEN); } catch {}
    res = await doFetch(await ensureToken());
  }
  if (res.status === 429) { const e = new Error("rate limited"); e.rateLimited = true; throw e; }
  if (!res.ok) throw new Error(path + " -> " + res.status);
  return res.json();
}

// ---- search --------------------------------------------------------------------------------
export async function search(q, limit = 25) {
  if (!(q || "").trim()) return [];
  const j = await _get("/plugin/search?" + new URLSearchParams({ q }));
  return (j.results || []).slice(0, limit);
}

const _clean = (name) => {
  let n = (name || "").split(",")[0].trim();
  for (const suf of [" Arpt", " Airport", " Air Base", " AB", " Flygplats"])
    if (n.endsWith(suf)) n = n.slice(0, -suf.length).trim();
  return n || "?";
};

function _bestRunway(runways, wdir, wspd) {
  if (!runways.length) return "—";
  if (wdir == null) return (runways.reduce((a, b) => ((b.lengthM || 0) > (a.lengthM || 0) ? b : a)).id) || "—";
  let best = runways[0].id || "—", score = -1e9;
  for (const r of runways)
    for (const end of String(r.id || "").split("/")) {
      const d = (end.match(/\d+/) || [""])[0];
      if (!d) continue;
      const off = ((wdir - +d * 10 + 180) % 360 - 180) * Math.PI / 180;
      const hw = (wspd || 1) * Math.cos(off);
      if (hw > score) { best = r.id; score = hw; }
    }
  return best;
}

function _age(mins) {
  if (mins == null) return "—";
  if (mins < 1) return "just now";
  if (mins < 60) return Math.floor(mins) + "m";
  return Math.floor(mins / 60) + "h" + String(Math.floor(mins % 60)).padStart(2, "0");
}

function _obsTime(iso, tz) {
  if (!iso) return null;
  try {
    const dt = new Date(iso);
    if (tz) {
      const s = new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit", minute: "2-digit", timeZone: tz, timeZoneName: "short",
      }).format(dt);
      return s;
    }
    return dt.toISOString().slice(11, 16) + "Z";
  } catch { return null; }
}

// Full airfield card from /plugin/airfields/:icao. Carries dataAge (minutes) for honesty.
export async function airfield(icao) {
  const w = await _get("/plugin/airfields/" + encodeURIComponent(icao));
  const d = w.data || {};
  const metar = d.metar || {};
  const wdir = metar.windDir;
  const wspd = metar.windSpeedKt || 0;
  const gust = metar.windGustKt || 0;
  let cat = metar.flightCategory || "—";
  if (metar.raw && metar.raw.includes("CAVOK")) cat = "CAVOK";
  // dataAge.metar is in SECONDS (proxy service.ts: metar.ageSeconds) — convert to minutes.
  const ageSec = (w.dataAge || {}).metar;
  const ageMin = ageSec != null ? ageSec / 60 : null;
  return {
    kind: "af", icao: d.icao || icao.toUpperCase(), name: _clean(d.name),
    rwy: _bestRunway(d.runways || [], wdir, wspd),
    wdir: wdir != null ? wdir : 0, wspd, gust,
    cat, catc: catColor(cat), age: _age(ageMin), ageMin,
    temp: metar.tempC, dew: metar.dewpointC, vis: metar.visibility,
    qnh: metar.altimeterHpa, obs: _obsTime(metar.observedAt, d.timeZone),
    clouds: metar.clouds || [], runways: d.runways || [],
    // The raw METAR/TAF text is deliberately NOT carried into the panel: only whether each exists.
    has_metar: !!metar.raw, has_taf: !!((d.taf || {}).raw),
    tz: d.timeZone, lat: d.lat, lon: d.lon, stale: !!w.stale, refreshing: !!w.refreshing,
  };
}

// Airfield briefs in a bbox — for the first-run "nearest field" seed and zone-search field list.
export async function airfields(bbox) {
  const j = await _get("/plugin/airfields?" + new URLSearchParams({ bbox }));
  return j.data || [];
}

// Rough request location from the backend (Cloudflare edge geo — prompt-free, city-level, stores
// nothing). Shape: {lat,lon,city,region,country,source}. source is "cloudflare" when lat/lon are
// present, else "unavailable". Used only for the first-run home guess.
export async function geo() {
  return await _get("/plugin/geo");
}

// ---- zones ---------------------------------------------------------------------------------
function _zoneStatus(p) {
  const s = (p.status || "").toLowerCase();
  if (s === "active") return "active";
  if (s === "scheduled") return "sched";
  if (["inactive", "none", ""].includes(s)) return "none";
  return "unknown";
}
function _alt(v) {
  if (v == null || v === "" || v === "GND" || v === "SFC") return "GND";
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? "FL" + String(Math.floor(n / 100)).padStart(3, "0") : String(v);
}
const _parse = (iso) => (iso ? new Date(iso) : null);
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const _fmtD = (dt) => dt.getUTCDate() + " " + MON[dt.getUTCMonth()];
function _rangeLbl(a, b) {
  if (a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)) return _fmtD(a);
  if (a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear())
    return a.getUTCDate() + "–" + b.getUTCDate() + " " + MON[a.getUTCMonth()];
  return _fmtD(a) + "–" + _fmtD(b);
}

// Paint the current Mon–Sun week from real windows + a plain-language upcoming label. Ported
// from api.py _week_and_label; uses UTC day boundaries (good enough for the widget's week strip).
function _weekAndLabel(current, next) {
  const now = new Date();
  const dow = (now.getUTCDay() + 6) % 7; // Mon=0
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow));
  const cur = current ? [_parse(current.start), _parse(current.end)] : null;
  const nxt = next ? [_parse(next.start), _parse(next.end)] : null;
  const cells = [];
  for (let i = 0; i < 7; i++) {
    const d0 = new Date(monday.getTime() + i * 864e5), d1 = new Date(d0.getTime() + 864e5);
    if (cur && cur[0] && cur[1] && cur[0] < d1 && cur[1] > d0) cells.push("A");
    else if (nxt && nxt[0] && nxt[0] < d1 && (nxt[1] || nxt[0]) > d0) cells.push("W");
    else cells.push("N");
  }
  let label = null;
  if (cur && cur[1]) {
    const e = cur[1];
    label = "active until " + _fmtD(e) + (e.getUTCFullYear() !== now.getUTCFullYear() ? " " + e.getUTCFullYear() : "");
  } else if (nxt && nxt[0]) {
    const a = nxt[0], b = nxt[1] || nxt[0];
    label = "next " + _rangeLbl(a, b) + (a.getUTCFullYear() !== now.getUTCFullYear() ? " " + a.getUTCFullYear() : "");
  }
  return { week: cells.join(""), when: label };
}

// Rough centroid of a GeoJSON geometry — the average of all its coordinate pairs. Used only as a
// map hint for the full-service deep link (an `?area=` link needs lat/lon or the app declines it).
function _centroid(g) {
  const pts = [];
  const walk = (c) => { if (typeof c?.[0] === "number") pts.push(c); else if (Array.isArray(c)) c.forEach(walk); };
  try { walk(g?.coordinates); } catch { /* malformed geometry — no hint */ }
  if (!pts.length) return {};
  let sx = 0, sy = 0;
  for (const [lon, lat] of pts) { sx += lon; sy += lat; }
  return { lon: sx / pts.length, lat: sy / pts.length }; // GeoJSON is [lon, lat]
}

// Do we have an activation feed for wherever this zone sits? Covered → we may show a real
// status; not covered (or we can't locate it) → "zone only": boundary + limits, no status.
// The covered-territory list lives in config (C.ACTIVATION_COVERAGE) so it's a one-line change
// to add a territory once its feed goes live.
function _inCoverage(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false; // can't locate → don't claim status
  for (const t of C.ACTIVATION_COVERAGE || []) {
    const b = t.bbox || t; // [minLon,minLat,maxLon,maxLat]
    if (lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3]) return true;
  }
  return false;
}

function _zone(feature, bbox) {
  const p = feature.properties || {};
  const c = _centroid(feature.geometry);
  const covered = _inCoverage(c.lat, c.lon);
  // Outside a covered territory we deliberately do NOT trust or surface any activation status the
  // upstream may carry — we show geometry only. "geo" renders as a neutral, non-status treatment.
  const st = covered ? _zoneStatus(p) : "geo";
  const { week, when } = covered ? _weekAndLabel(p.current, p.next) : { week: null, when: null };
  return {
    kind: "zn", desig: p.designator || p.id || "?",
    name: (p.name || "").replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase()),
    status: st, covered, lo: _alt(p.lower), hi: _alt(p.upper),
    when, week, age: "live", id: p.id, bbox: bbox || C.SEED_BBOX,
    lat: c.lat, lon: c.lon,
    sched_text: covered ? (p.current || p.next || {}).schedule : null,
    current: covered ? p.current : null, next: covered ? p.next : null,
  };
}

// Restriction zones in a bbox, deduped by designator (collapses R28A/B/C-style siblings).
export async function areas(bbox) {
  const bb = bbox || C.SEED_BBOX;
  const j = await _get("/plugin/areas?" + new URLSearchParams({ bbox: bb }));
  const d = j.data || {};
  const seen = new Set(), out = [];
  for (const f of d.features || []) {
    const z = _zone(f, bb);
    if (seen.has(z.desig)) continue;
    seen.add(z.desig); out.push(z);
  }
  return out;
}
