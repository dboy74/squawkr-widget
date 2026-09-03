// Squawkr Omarchy widget — configuration. Single source of truth for where the widget talks and
// how it behaves. Edit API_BASE to point at another surface/region; everything else follows.
window.SQUAWKR_CONFIG = {
  // The Squawkr plugin API this widget reads from. All data + the per-install token endpoint
  // live under it:  base + "/plugin/search | /plugin/airfields/:icao | /plugin/areas | /plugin/token".
  // Point this at your own deployment if you run one; otherwise leave the default.
  API_BASE: "https://plugin-api.squawkr.net",

  // Seed bbox for zone discovery on first run and for a tracked zone's schedule lookup
  // (minLon,minLat,maxLon,maxLat). Gotland by default — matches the mock/TUI.
  SEED_BBOX: "18.0,57.0,19.6,58.0",
  // A wider bbox to search nearby airfields for the first-run "nearest field" seed.
  SEED_FIELD_BBOX: "17.5,57.0,19.6,58.2",
  SEED_HOME: "ESSV", // Visby — the home field seeded on first run

  REFRESH_MS: 90_000, // live refresh cadence; also refreshes on panel open
  // Past this age (minutes) a value is shown as "unknown", never as a current answer
  // (mirrors the app's honesty rule / docs/data-strategy.md §4).
  STALE_CUTOFF_MIN: 90,

  MAX_TRACKED: 3,
  SERVICE_URL: "https://squawkr.net", // the "full service" nudge target

  // Territories where we have a trustworthy restriction-area ACTIVATION feed and may therefore
  // show a real active/scheduled/clear status. A zone whose centroid falls OUTSIDE every box
  // here — or whose location we can't determine — is shown "zone only": its boundary and
  // vertical limits, but explicitly NOT an activation status (never a status colour). This is
  // the honesty rule from docs/data-strategy.md §7. Extend the list as coverage lands
  // (the US arrives when the FAA production feed is live). Boxes are [minLon,minLat,maxLon,maxLat].
  ACTIVATION_COVERAGE: [
    { name: "Sweden", bbox: [10.5, 55.0, 24.5, 69.2] },
    // United States — the mirrored SUA regions. Must match the backend US_REGIONS boxes
    // (packages/proxy/src/sources/faa/regions.ts); outside these, US areas stay "zone only".
    { name: "US \u00b7 SoCal ranges", bbox: [-119.5, 34.0, -116.8, 36.4] },
    { name: "US \u00b7 Nevada NTTR", bbox: [-117.6, 36.3, -114.9, 38.6] },
    { name: "US \u00b7 Arizona", bbox: [-114.6, 31.9, -112.0, 34.1] },
    { name: "US \u00b7 White Sands / NM", bbox: [-107.3, 31.9, -105.0, 34.2] },
    { name: "US \u00b7 Eglin / Gulf", bbox: [-87.7, 29.4, -85.2, 31.2] },
    { name: "US \u00b7 Virginia Capes", bbox: [-76.8, 36.3, -74.5, 38.2] },
  ],

  // localStorage keys
  LS_TOKEN: "squawkr.plugin.token",
  LS_PREFS: "squawkr.widget.prefs",
};
