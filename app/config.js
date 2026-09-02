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

  // localStorage keys
  LS_TOKEN: "squawkr.plugin.token",
  LS_PREFS: "squawkr.widget.prefs",
};
