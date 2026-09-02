-- Squawkr widget panel — float, size it to the panel content, dock it just below the bar icon
-- (right-justified so it can't run off-screen), and force it fully opaque.
-- Chromium ignores --class for --app windows under Wayland and derives its own app_id from the
-- URL, so we match that: chrome-<host>__<path>-Default (stable for 127.0.0.1/index.html).
-- Note: this Hyprland helper only accepts NUMERIC move coords — a relative "100%-612" form is
-- silently centred instead — so the installer substitutes __PANEL_X__ with (monitor_width - 612)
-- at wire time: the panel's 600px width plus a 12px right-hand margin. For a different monitor by
-- hand, set x = <monitor width> - 612 (e.g. 1920 → 1308). y = 34 clears the 26px bar.
o.window("^(chrome-127.0.0.1__index.html-Default)$", { float = true })
o.window("^(chrome-127.0.0.1__index.html-Default)$", { size = { 600, 384 } })
o.window("^(chrome-127.0.0.1__index.html-Default)$", { move = { __PANEL_X__, 34 } })
o.window("^(chrome-127.0.0.1__index.html-Default)$", { opacity = "1.0 1.0 override" })
