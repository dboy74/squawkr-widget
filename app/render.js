// Rendering — a faithful JS port of prototypes/widget/gen_widget.py. Produces the same HTML/SVG
// the static mock does (runway strip + animated wind chevron, condition icons, hero, mini cards,
// airfield/zone detail views, height meter). The mock stays the visual reference; this reproduces
// it. Interactive affordances (× remove, ⌂ set-home) carry data-act attributes wired in app.js.

import { catColor } from "./api.js";

const rgb = (t) => `rgb(${t[0]},${t[1]},${t[2]})`;

// Deep links into the full web service for the open field/area. Rendered with class "svc" so
// app.js's existing interceptor opens them in the real browser and shuts the panel. An airfield
// resolves from its ICAO alone; an area needs coordinates (the app declines an ?area= link
// without them), so we pass the geometry centroid when we have it.
const _svcBase = () => ((window.SQUAWKR_CONFIG || {}).SERVICE_URL || "https://squawkr.net").replace(/\/+$/, "");
function reportHrefAf(icao) { return `${_svcBase()}/app/?icao=${encodeURIComponent(icao)}`; }
function reportHrefZn(z) {
  const q = new URLSearchParams({ area: z.id || z.desig || "" });
  if (Number.isFinite(z.lat) && Number.isFinite(z.lon)) { q.set("lat", z.lat.toFixed(4)); q.set("lon", z.lon.toFixed(4)); }
  return `${_svcBase()}/app/?${q.toString()}`;
}
const reportAnchor = (href) => `<a class="svc" href="${esc(href)}">Full report on squawkr.net →</a>`;
const reportFoot = (href) => `<div class="dfoot">${reportAnchor(href)}</div>`;
export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Squawkr swoosh mark (from packages/landing/src/components/Mark.astro), class "logo".
export const LOGO = `<svg class="logo" viewBox="270 90 414 800" xmlns="http://www.w3.org/2000/svg" fill="currentColor" aria-hidden="true"><path d="M498.882,449.662l-13.358,36.083c-3.688,9.963 1.4,21.029 11.363,24.717c78.8,29.171 119.171,117.013 90,195.812c-29.171,78.796 -117.013,119.171 -195.808,90c-9.967,-3.692 -21.033,1.396 -24.721,11.363l-13.358,36.079c-1.771,4.783 -1.571,10.079 0.562,14.713c2.129,4.638 6.017,8.237 10.8,10.008c118.588,43.9 250.788,-16.858 294.688,-135.45c43.904,-118.587 -16.858,-250.783 -135.446,-294.688c-9.962,-3.687 -21.033,1.4 -24.721,11.363"/><path d="M450.771,635.026c-4.508,-1.667 -8.9,-3.508 -13.179,-5.508c4.279,2 8.671,3.842 13.179,5.508Z"/><path d="M347.227,420.753c0.683,-2.092 1.413,-4.175 2.183,-6.254c-0.771,2.079 -1.5,4.162 -2.183,6.254m103.546,214.275c-4.508,-1.671 -8.904,-3.508 -13.183,-5.508c4.279,2 8.675,3.837 13.183,5.508m45.163,-389.808c-87.671,5.654 -168.233,61.675 -200.65,149.242c-43.9,118.588 16.858,250.783 135.45,294.688c4.783,1.771 10.075,1.571 14.713,-0.562c4.633,-2.129 8.233,-6.017 10.004,-10.8l13.358,-36.079c3.692,-9.967 -1.396,-21.033 -11.362,-24.721c-78.796,-29.171 -119.171,-117.013 -90,-195.808c29.175,-78.8 117.012,-119.175 195.812,-90.004c9.962,3.692 21.029,-1.396 24.721,-11.358l13.354,-36.083l68.783,-185.792l-174.183,147.279Z"/></svg>`;

// ---- runway maths --------------------------------------------------------------------------
const hdg = (end) => { const d = String(end).match(/\d+/); return d ? +d[0] * 10 : 0; };
export function recommend(rwy, wdir) {
  const ends = String(rwy).split("/").filter((e) => e.trim());
  const list = ends.length ? ends : ["—"];
  let best = list[0], bh = hdg(list[0]), bs = -9;
  for (const e of list) {
    const h = hdg(e), s = Math.cos(((wdir - h + 180) % 360 - 180) * Math.PI / 180);
    if (s > bs) { bs = s; best = e; bh = h; }
  }
  return { end: best, bh };
}
export function comps(rwy, wdir, wspd) {
  const { bh } = recommend(rwy, wdir);
  const off = ((wdir - bh + 180) % 360 - 180) * Math.PI / 180;
  return { hw: Math.round(Math.abs(wspd * Math.cos(off))), xw: Math.round(Math.abs(wspd * Math.sin(off))) };
}
const REL = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
export function relArrow(rwy, wdir) {
  const { bh } = recommend(rwy, wdir);
  return REL[Math.round((((wdir + 180 - bh) % 360) / 45)) % 8];
}

// ---- condition icons -----------------------------------------------------------------------
const R = (a) => (a * Math.PI) / 180;
function sun(sz = 64) {
  let rays = "";
  for (let a = 0; a < 360; a += 45)
    rays += `<line x1="${(32 + 13 * Math.cos(R(a))).toFixed(1)}" y1="${(32 + 13 * Math.sin(R(a))).toFixed(1)}" x2="${(32 + 21 * Math.cos(R(a))).toFixed(1)}" y2="${(32 + 21 * Math.sin(R(a))).toFixed(1)}"/>`;
  return `<svg viewBox="0 0 64 64" width="${sz}" height="${sz}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="32" cy="32" r="9"/><g>${rays}</g></svg>`;
}
function partly(sz = 64) {
  let rays = "";
  for (let a = 180; a <= 360; a += 45)
    rays += `<line x1="${(24 + 11 * Math.cos(R(a))).toFixed(1)}" y1="${(24 + 11 * Math.sin(R(a))).toFixed(1)}" x2="${(24 + 16 * Math.cos(R(a))).toFixed(1)}" y2="${(24 + 16 * Math.sin(R(a))).toFixed(1)}"/>`;
  return `<svg viewBox="0 0 64 64" width="${sz}" height="${sz}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="23" r="8"/><g>${rays}</g><path d="M22 45a9 9 0 0 1 2-17 12 12 0 0 1 22 3 8 8 0 0 1-2 14H24"/></svg>`;
}
const cloud = (sz = 64) => `<svg viewBox="0 0 64 64" width="${sz}" height="${sz}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 46a10 10 0 0 1 2-19 14 14 0 0 1 26 4 9 9 0 0 1-2 15H20z"/></svg>`;
const fog = (sz = 64) => `<svg viewBox="0 0 64 64" width="${sz}" height="${sz}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 34a10 10 0 0 1 2-19 14 14 0 0 1 26 4 9 9 0 0 1-2 15H20z"/><line x1="14" y1="44" x2="46" y2="44"/><line x1="20" y1="51" x2="50" y2="51"/></svg>`;
const condIcon = (cat, sz = 64) => ({ CAVOK: sun, VFR: partly, MVFR: cloud, IFR: fog, LIFR: fog }[cat] || cloud)(sz);

export const hasWx = (a) => !!a.has_metar;

// Standard placeholder copy for missing weather — defined once so the wording stays identical
// across the hero, the mini cards and the detail views. Observation (METAR) and forecast (TAF)
// can be missing independently. Missing data must read as "we don't know", never as "all clear".
export const WX_TEXT = {
  noReport: "no report",                                 // compact — mini card / hero label
  noMetar: "No current weather report for this field.",  // detail: no observation
  noTaf: "No forecast available.",                        // detail: no forecast (TAF)
  tafAvail: "Forecast (TAF) issued — see the full report below.", // detail: a TAF exists (not shown raw)
};

// ---- vertical runway strip with an animated wind chevron -----------------------------------
function runwaySvg(a) {
  let chevs = "", num;
  if (hasWx(a)) {
    const { end, bh } = recommend(a.rwy, a.wdir);
    num = ((String(end).match(/\d+/) || ["0"])[0].slice(0, 2) || "0").padStart(2, "0");
    const rel = (a.wdir + 180 - bh) % 360;
    const dx = Math.sin(R(rel)), dy = -Math.cos(R(rel));
    const cx = 60, cy = 104;
    for (const [k, delay] of [[-1, 0.0], [0, 0.5], [1, 1.0]]) {
      const mx = cx + dx * k * 17, my = cy + dy * k * 17;
      const bax = mx - dx * 10, bay = my - dy * 10, px = -dy, py = dx;
      const p1 = [bax + px * 8, bay + py * 8], p2 = [bax - px * 8, bay - py * 8];
      chevs += `<path class="chev" style="animation-delay:${delay.toFixed(2)}s" d="M${p1[0].toFixed(1)} ${p1[1].toFixed(1)} L${mx.toFixed(1)} ${my.toFixed(1)} L${p2[0].toFixed(1)} ${p2[1].toFixed(1)}"/>`;
    }
  } else {
    const rws = a.runways || [];
    const prim = rws.length ? rws.reduce((x, y) => ((y.lengthM || 0) > (x.lengthM || 0) ? y : x)).id : (a.rwy || "0");
    const end = String(prim).split("/")[0];
    num = ((end.match(/\d+/) || ["0"])[0].slice(0, 2) || "0").padStart(2, "0");
  }
  return `<svg viewBox="0 0 120 232" width="120" height="232">
      <rect x="42" y="14" width="36" height="190" rx="5" fill="#0d0e16" stroke="#3a3f5c" stroke-width="1.5"/>
      <line x1="60" y1="22" x2="60" y2="196" stroke="#2b3050" stroke-width="2" stroke-dasharray="7 9"/>
      <line x1="49" y1="192" x2="49" y2="200" stroke="#3a3f5c" stroke-width="2"/><line x1="71" y1="192" x2="71" y2="200" stroke="#3a3f5c" stroke-width="2"/>
      <g class="chevs" stroke="#7ea0ff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round">${chevs}</g>
      <text x="60" y="224" class="rwynum">${num}</text>
    </svg>`;
}

const cloudsText = (a) => (a.clouds || []).map((c) => `${esc(c.cover)} ${c.base}′`).join(" · ") || "no cloud reported";

function skyInterp(a) {
  const head = { CAVOK: "Clear & unlimited", VFR: "Good VFR", MVFR: "Marginal VFR", IFR: "IFR conditions", LIFR: "Low IFR" }[a.cat] || (a.cat || "—");
  const cs = a.clouds || [];
  const ceils = cs.filter((c) => ["BKN", "OVC", "OVX"].includes(c.cover) && c.base != null).map((c) => c.base);
  const words = { FEW: "few cloud", SCT: "scattered cloud", BKN: "broken cloud", OVC: "overcast", OVX: "sky obscured" };
  let sky;
  if (ceils.length) {
    const ceil = Math.min(...ceils);
    sky = (ceil < 1000 ? "low " : "") + `ceiling ${ceil} ft`;
  } else if (cs.length) {
    const c0 = cs.reduce((x, y) => ((y.base ?? 99999) < (x.base ?? 99999) ? y : x));
    sky = (words[c0.cover] || "cloud") + (c0.base ? ` at ${c0.base} ft` : "");
  } else sky = "no cloud reported";
  const vis = a.vis;
  return [head, sky + (vis ? ` · ${esc(vis)} SM` : "")];
}

// ---- panel pieces --------------------------------------------------------------------------
const stat = (label, main, sub = "") =>
  `<div class="stat"><div class="lbl">${label}</div><div class="val">${main}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;

export function heroAf(a) {
  // No observation: show the field, a neutral "no report" mark and standard text — never the
  // wind/runway/QNH stats, which would otherwise render as a misleading 0° · 0 kt.
  if (!hasWx(a)) {
    return `<div class="hero click" data-go="d-${a.icao}">
      <div class="cond" style="color:#5a608a">${fieldicon(56)}<span class="condlbl">NO REPORT</span></div>
      <div class="headline"><div class="afname">${esc(a.name)}</div>
        <div class="subl">${a.icao}<span class="home">HOME</span></div>
        <div class="norep norep--hero">${WX_TEXT.noMetar}</div></div></div>
    <div class="meta">no current METAR for this field</div>`;
  }
  const { xw } = comps(a.rwy, a.wdir, a.wspd);
  const { end: rec } = recommend(a.rwy, a.wdir);
  const col = rgb(a.catc);
  return `<div class="hero click" data-go="d-${a.icao}">
      <div class="cond" style="color:${col}">${condIcon(a.cat)}<span class="condlbl">${a.cat}</span></div>
      <div class="headline"><div class="afname">${esc(a.name)}</div>
        <div class="subl">${a.icao}<span class="home">HOME</span></div></div>
      <div class="stats">
        ${stat("WIND", `${a.wdir}° · ${a.wspd} kt`, a.gust ? `gust ${a.gust} kt` : "steady")}
        ${stat("FAVOURED RWY", `${rec}`, `crosswind ${xw} kt`)}
        ${stat("QNH", `${a.qnh || "—"}`, `${a.temp ?? "—"}°C`)}
      </div></div>
    <div class="meta">obs ${esc(a.obs || a.age || "—")} · vis ${esc(a.vis ?? "—")} SM · dew ${a.dew ?? "—"}°C</div>`;
}

// active/sched/none are the real status ramp (red/amber/green). unknown = we should know but our
// data is too stale. geo = "zone only": we have no activation feed for this territory, so we show
// geometry only — a deliberately neutral, non-status colour so it can never read as an answer.
const ZCOL = { active: [224, 108, 108], sched: [224, 179, 74], none: [111, 206, 154], unknown: [146, 148, 156], geo: [124, 140, 170] };
const ZWORD = { active: "ACTIVE", sched: "SCHEDULED", none: "CLEAR", unknown: "UNKNOWN", geo: "ZONE ONLY" };
export const zicon = (sz = 64) => `<svg viewBox="0 0 64 64" width="${sz}" height="${sz}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M32 8 54 20v18c0 12-9 18-22 22C19 56 10 50 10 38V20z"/><path d="M24 33l6 6 12-13" stroke-width="2"/></svg>`;
export const fieldicon = (sz = 30) => `<svg viewBox="0 0 64 64" width="${sz}" height="${sz}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="27" y="10" width="10" height="44" rx="3"/><line x1="32" y1="16" x2="32" y2="48" stroke-dasharray="3 6"/></svg>`;

// One tracked slot. `isHome` marks the current home field. Buttons carry data-act for app.js.
export function mini(it, isHome = false) {
  const tgt = it.kind === "af" ? `d-${it.icao}` : `d-${it.id}`;
  const key = it.kind === "af" ? it.icao : it.id;
  const homeBtn = it.kind === "af" && !isHome
    ? `<button class="hbtn" title="set as home field" data-act="home" data-key="${esc(key)}">⌂</button>` : "";
  const rmBtn = `<button class="x" title="remove" data-act="remove" data-key="${esc(key)}">×</button>`;
  const cls = `mini click${isHome ? " ishome" : ""}`;
  if (it.kind === "af") {
    if (!hasWx(it)) {
      return `<div class="${cls}" data-go="${tgt}">${homeBtn}${rmBtn}
        <div class="micon" style="color:#5a608a">${fieldicon(28)}</div>
        <div class="mid"><b>${it.icao}</b><span class="mlbl">${esc(it.name)}</span></div>
        <div class="mval" style="color:#6b7089">no report</div>
        <div class="msub">no METAR${isHome ? " · home" : ""}</div></div>`;
    }
    const col = rgb(it.catc);
    return `<div class="${cls}" data-go="${tgt}">${homeBtn}${rmBtn}
      <div class="micon" style="color:${col}">${condIcon(it.cat, 30)}</div>
      <div class="mid"><b>${it.icao}</b><span class="mlbl">${esc(it.name)}</span></div>
      <div class="mval" style="color:${col}">${it.cat}</div>
      <div class="msub">${relArrow(it.rwy, it.wdir)} ${it.wspd}kt${isHome ? " · home" : ""}</div></div>`;
  }
  const col = rgb(ZCOL[it.status] || [146, 148, 156]);
  const msub = it.status === "geo" ? "boundary + limits only" : esc(it.when || "tracked area");
  return `<div class="${cls}" data-go="${tgt}">${rmBtn}
    <div class="micon" style="color:${col}">${zicon(28)}</div>
    <div class="mid"><b>${it.desig}</b><span class="mlbl">${esc(it.name || "")}</span></div>
    <div class="mval" style="color:${col}">${ZWORD[it.status] || "—"}</div>
    <div class="msub">${msub}</div></div>`;
}

// ---- detail views --------------------------------------------------------------------------
const drow = (l, v) => `<div class="dr"><span class="lbl">${l}</span><span class="dv">${v}</span></div>`;

// Forecast (TAF) block for the airfield detail — shown independently of the METAR, since a field
// can have one without the other. The upstream TAF text itself is never printed here (a raw
// report is long, unwrappable and pushed the panel past its border); the panel says whether a
// forecast exists and points at the full report for it, or shows the standard "none" text.
const forecastBlock = (a) =>
  `<div class="fcast"><div class="flabel">FORECAST</div>` +
  (a.has_taf ? `<div class="norep norep--sm">${WX_TEXT.tafAvail}</div>`
             : `<div class="norep norep--sm">${WX_TEXT.noTaf}</div>`) +
  `</div>`;

export function detailAf(a) {
  if (!hasWx(a)) {
    const rws = a.runways || [];
    const rwl = rws.map((r) => drow(`RWY ${esc(r.id)}`, `${r.lengthM ?? "—"} m`)).join("") ||
      '<div class="norep">Runway data unavailable.</div>';
    return `<div class="panel detail" id="d-${a.icao}" hidden>
      <div class="dhead"><button class="back" data-back>‹ back</button>
        <span class="dtitle"><b>${a.icao}</b> · <span class="tsub">${esc(a.name)}</span></span></div>
      <div class="afbody">
        <div class="rwybox">${runwaySvg(a)}<div class="fcap">no wind reference</div></div>
        <div class="afgrid">
          <div class="norep"><b>No weather report for this field.</b><br>
            ${a.icao} has no METAR station, so wind, sky and flight category aren't available —
            runway information only.</div>
          <div class="rwylist">${rwl}</div>
        </div>
      </div>
      ${forecastBlock(a)}
      ${reportFoot(reportHrefAf(a.icao))}
    </div>`;
  }
  const { hw, xw } = comps(a.rwy, a.wdir, a.wspd);
  const { end: rec } = recommend(a.rwy, a.wdir);
  const col = rgb(a.catc);
  const gust = a.gust ? ` G${a.gust}` : "";
  const [skyT, skyS] = skyInterp(a);
  return `<div class="panel detail" id="d-${a.icao}" hidden>
      <div class="dhead"><button class="back" data-back>‹ back</button>
        <span class="dtitle"><b>${a.icao}</b> · <span class="tsub">${esc(a.name)}</span></span>
        <span class="pill" style="color:${col};border-color:${col}55">${a.cat}</span></div>
      <div class="afbody">
        <div class="rwybox">${runwaySvg(a)}<div class="fcap">RWY ${rec} · ${relArrow(a.rwy, a.wdir)} into wind</div></div>
        <div class="afgrid">
          <div class="skyhead"><div class="cond" style="color:#eef2ff">${condIcon(a.cat, 54)}</div>
            <div class="skytext"><div class="skyt">${esc(skyT)}</div><div class="skys">${skyS}</div></div></div>
          ${drow("WIND", `<span class="ar">${relArrow(a.rwy, a.wdir)}</span> ${a.wdir}° · ${a.wspd} kt${gust}`)}
          ${drow("HEAD / CROSS", `${hw} / ${xw} kt`)}
          ${drow("QNH", `${a.qnh ?? "—"} hPa`)}
          ${drow("TEMP / DEW", `${a.temp ?? "—"}° / ${a.dew ?? "—"}°`)}
          ${drow("CLOUD", cloudsText(a))}
        </div>
      </div>
      ${forecastBlock(a)}
      <div class="dfoot dfoot--split"><span class="meta">obs ${esc(a.obs || "—")}</span>${reportAnchor(reportHrefAf(a.icao))}</div>
    </div>`;
}

function parseAlt(s) {
  const t = (s || "").trim().toUpperCase();
  if (["", "GND", "SFC", "0"].includes(t)) return [0, false, "GND"];
  if (t.startsWith("UNL")) return [null, true, "UNL"];
  const m = t.match(/FL\s*0*(\d+)/);
  if (m) return [+m[1] * 100, false, "FL" + m[1]];
  const n = t.match(/\d[\d\s]*/);
  if (n) { const ft = +n[0].replace(/\s/g, ""); return [ft, false, ft.toLocaleString("en-US") + " ft"]; }
  return [null, false, t];
}

function heightMeter(z, color) {
  const [upFt, upUnl, upLbl] = parseAlt(z.hi);
  let [loFt, , loLbl] = parseAlt(z.lo); loFt = loFt || 0;
  const upper = upUnl ? Math.max(loFt + 20000, 45000) : (upFt != null ? upFt : loFt + 10000);
  const smax = Math.max(upUnl ? upper : upper * 1.08, 1000);
  const H = 220, TOP = 14, BOT = 198, BX = 8, BW = 22, LX = 38;
  const y = (ft) => BOT - (ft / smax) * (BOT - TOP);
  const yU = upUnl ? TOP : y(upFt || loFt), yL = y(loFt);
  const o = [`<svg viewBox="0 0 120 ${H}" width="120" height="${H}">`,
    `<rect x="${BX}" y="${TOP}" width="${BW}" height="${BOT - TOP}" rx="3" fill="#0d0e16" stroke="#2b3050"/>`,
    `<rect x="${BX}" y="${yU.toFixed(1)}" width="${BW}" height="${Math.max(0, yL - yU).toFixed(1)}" fill="${color}" fill-opacity="0.32" stroke="${color}" stroke-width="1.5"/>`];
  if (upUnl) o.push(`<path d="M${BX + 3},${TOP + 6} L${BX + BW / 2},${TOP} L${BX + BW - 3},${TOP + 6}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`);
  o.push(`<rect x="${BX - 4}" y="${BOT - 1}" width="${BW + 8}" height="2" fill="#4a4f6e"/>`);
  for (let i = 0; i < Math.floor((BW + 8) / 6) + 1; i++) {
    const x0 = BX - 4 + i * 6;
    o.push(`<line x1="${x0 + 4}" y1="${BOT + 5}" x2="${x0}" y2="${BOT}" stroke="#4a4f6e" stroke-width="1"/>`);
  }
  o.push(`<line x1="${BX + BW}" y1="${yU.toFixed(1)}" x2="${LX - 3}" y2="${yU.toFixed(1)}" stroke="${color}"/>`);
  o.push(`<text x="${LX}" y="${(yU + 4).toFixed(1)}" class="hlbl hi">${esc(upLbl)}</text>`);
  o.push(`<line x1="${BX + BW}" y1="${yL.toFixed(1)}" x2="${LX - 3}" y2="${yL.toFixed(1)}" stroke="#6b7089"/>`);
  o.push(`<text x="${LX}" y="${(yL + 4).toFixed(1)}" class="hlbl lo">${esc(loLbl)}</text>`);
  o.push("</svg>");
  return o.join("");
}

function weekDates() {
  const now = new Date();
  const dow = (now.getUTCDay() + 6) % 7;
  const mon = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow));
  return Array.from({ length: 7 }, (_, i) => new Date(mon.getTime() + i * 864e5));
}

export function detailZn(z) {
  // Zone-only: a territory we hold no activation feed for. Show the boundary's vertical extent,
  // but replace the whole activation schedule with an explicit "we don't provide status here" —
  // never a week grid or a "no activation this week", which would imply we know it's clear.
  if (z.status === "geo") {
    const col = rgb(ZCOL.geo);
    return `<div class="panel detail" id="d-${z.id}" hidden>
      <div class="dhead"><button class="back" data-back>‹ back</button>
        <span class="dtitle"><b>${z.desig}</b> · <span class="tsub">${esc(z.name || "")}</span></span>
        <span class="pill" style="color:${col};border-color:${col}55">${ZWORD.geo}</span></div>
      <div class="zbody">
        <div class="hmeterbox">${heightMeter(z, col)}<div class="fcap">vertical extent</div></div>
        <div class="zright">
          <div class="zup"><span class="lbl">COVERAGE</span>zone only</div>
          <div class="geonote"><b>We show this airspace's boundary and limits only.</b>
            We don't provide its activation status in this territory yet — treat it as
            <em>status unknown</em> and check an official source before you fly.</div>
        </div>
      </div>
      ${reportFoot(reportHrefZn(z))}
    </div>`;
  }
  const col = rgb(ZCOL[z.status] || [146, 148, 156]);
  const days = weekDates();
  const todayStr = new Date().toISOString().slice(0, 10);
  const week = z.week || "NNNNNNN";
  const cells = days.map((d, i) => {
    const x = week[i];
    const cc = rgb(ZCOL[{ A: "active", W: "sched" }[x] || "none"] || [111, 206, 154]);
    const on = x !== "N";
    const tclass = d.toISOString().slice(0, 10) === todayStr ? " today" : "";
    return `<div class="day${tclass}"><span class="dow">${"MTWTFSS"[i]}</span>` +
      `<span class="dnum">${d.getUTCDate()}</span>` +
      `<span class="bar" style="background:${on ? cc : "#262a40"}"></span></div>`;
  }).join("");
  let windows = "";
  for (const [key, lab] of [["current", "Now"], ["next", "Next"]]) {
    const w = z[key];
    if (w && w.schedule) windows += `<div class="win"><span class="wlab">${lab}</span> <span class="wsch">${esc(w.schedule)}</span></div>`;
  }
  return `<div class="panel detail" id="d-${z.id}" hidden>
      <div class="dhead"><button class="back" data-back>‹ back</button>
        <span class="dtitle"><b>${z.desig}</b> · <span class="tsub">${esc(z.name || "")}</span></span>
        <span class="pill" style="color:${col};border-color:${col}55">${ZWORD[z.status] || "—"}</span></div>
      <div class="zbody">
        <div class="hmeterbox">${heightMeter(z, col)}<div class="fcap">vertical extent</div></div>
        <div class="zright">
          <div class="zup"><span class="lbl">UPCOMING</span>${esc(z.when || "—")}</div>
          <div class="sched">${cells}</div>
          ${windows || '<div class="win"><span class="wlab">—</span> no activation window this week</div>'}
        </div>
      </div>
      ${reportFoot(reportHrefZn(z))}
    </div>`;
}

export { ZCOL, ZWORD };
