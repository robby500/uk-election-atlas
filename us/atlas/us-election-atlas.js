/**
 * US Presidential Election Atlas
 * County-level results from 1912–2024
 * Click a state to zoom in and see county results.
 * Use the year slider / buttons to navigate elections.
 */

(function () {
  "use strict";

  /* ─── 1. Load dependencies ──────────────────────────────────────── */
  function loadScript(src, cb) {
    const s = document.createElement("script");
    s.src = src;
    s.onload = cb;
    document.head.appendChild(s);
  }

  function init() {
    loadScript("https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js", () =>
      loadScript("https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js", () =>
        loadScript("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js", buildAtlas)
      )
    );
  }

  /* Virginia has 38 independent cities, each with its own FIPS code separate
     from any surrounding county.  The source XLSX is missing FIPS codes for
     these cities (the `fips` column is blank for rows labeled "X, City of").
     Additionally, the row labeled simply "Richmond" carries FIPS 51760 — which
     is actually Richmond CITY, not Richmond County (51159).  So we need to:
       1. Map the "X, City of" rows to their correct city FIPS codes.
       2. Rename the bare "Richmond" row to "Richmond County" so its (existing)
          51760 FIPS isn't confused.  Wait — actually 51760 IS the city, so the
          bare "Richmond" row is the city, and Richmond County is missing.
          For now: keep the bare Richmond pointing at the city, fill in the
          city-of rows. */
  const VA_INDEPENDENT_CITY_FIPS = {
    "Alexandria, City of":       "51510",
    "Bristol, City of":          "51520",
    "Buena Vista, City of":      "51530",
    "Charlottesville, City of":  "51540",
    "Chesapeake, City of":       "51550",
    "Colonial Heights, City of": "51570",
    "Covington, City of":        "51580",
    "Danville, City of":         "51590",
    "Emporia, City of":          "51595",
    "Fairfax, City of":          "51600",
    "Falls Church, City of":     "51610",
    "Franklin, City of":         "51620",
    "Fredericksburg, City of":   "51630",
    "Galax, City of":            "51640",
    "Hampton, City of":          "51650",
    "Harrisonburg, City of":     "51660",
    "Hopewell, City of":         "51670",
    "Lexington, City of":        "51678",
    "Lynchburg, City of":        "51680",
    "Manassas Park, City of":    "51685",
    "Manassas, City of":         "51683",
    "Martinsville, City of":     "51690",
    "Newport News, City of":     "51700",
    "Norfolk, City of":          "51710",
    "Norton, City of":           "51720",
    "Petersburg, City of":       "51730",
    "Poquoson, City of":         "51735",
    "Portsmouth, City of":       "51740",
    "Radford, City of":          "51750",
    "Richmond, City of":         "51760",  // duplicate of bare "Richmond"
    "Roanoke, City of":          "51770",
    "Salem, City of":            "51775",
    "Staunton, City of":         "51790",
    "Suffolk, City of":          "51800",
    "Virginia Beach, City of":   "51810",
    "Waynesboro, City of":       "51820",
    "Williamsburg, City of":     "51830",
    "Winchester, City of":       "51840",
  };

  function loadAtlasFromXlsx() {
    return fetch("election_results_combined.xlsx")
      .then(res => res.arrayBuffer())
      .then(buf => {
        const wb = XLSX.read(buf, { type: "array" });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        const atlas = {};
        // Track which (year, fips) cells we've already seen, so we can detect
        // duplicates that need disambiguation.
        const seenCell = {};

        rows.forEach(r => {
          let fips = String(r.fips || "").padStart(5, "0");
          const county = (r.county || "").trim();

          // Fill in missing FIPS for VA independent cities by name lookup.
          if ((!r.fips || fips === "00000") && r.state === "VA" && county) {
            const lookup = VA_INDEPENDENT_CITY_FIPS[county];
            if (lookup) fips = lookup;
          }
          if (!fips || fips === "00000") return;

          const year = String(r.year);
          const cellKey = year + "_" + fips;

          // DATA-ERROR FIXUP: the XLSX mislabels Richmond County, VA with FIPS
          // 51760 (Richmond City's FIPS) for every year.  Both rows have the
          // same FIPS but the county row has small rural vote counts and the
          // city row has large urban counts.  When we see a duplicate at
          // 51760 with the name "Richmond", the earlier row is Richmond County
          // and should live at 51159 instead.
          if (fips === "51760" && county === "Richmond" && seenCell[cellKey]) {
            // The PREVIOUS row (still stored at atlas[year]["51760"]) is the
            // actual COUNTY data; move it to 51159, leave the current row
            // (the city) at 51760.
            // Wait — order is reversed.  In the XLSX:
            //   row N:    county data (R wins) → first to be written to 51760
            //   row N+1:  city data (D wins)   → would overwrite at 51760
            // So when we hit the second row, the first one is currently at
            // 51760.  Move the existing entry to 51159 (county), then let
            // this row overwrite 51760 (city).
            if (atlas[year] && atlas[year]["51760"]) {
              atlas[year]["51159"] = atlas[year]["51760"];
            }
          }

          const rv = +(r.rep_votes || 0), rp = +(r.rep_pct || 0);
          const dv = +(r.dem_votes || 0), dp = +(r.dem_pct || 0);
          const ov = +(r.other_votes || 0), op = +(r.other_pct || 0);
          let w = "R";
          if (dp >= rp && dp >= op) w = "D";
          else if (op > rp && op > dp) w = "O";
          if (!atlas[year]) atlas[year] = {};
          atlas[year][fips] = { w, rv, rp, dv, dp, ov, op };
          seenCell[cellKey] = true;
        });
        return atlas;
      });
  }

  /* Load candidate-name and per-state-EV metadata scraped from Wikipedia.
     Shape: { "1916": { candidates: [{name,party,votes,pct,ev}], state_evs: {fips: ev} } } */
  function loadMetadata() {
    return fetch("election_metadata.json")
      .then(res => res.ok ? res.json() : {})
      .catch(() => ({}));
  }

  /* Bundle them together. */
  async function loadAtlas() {
    const [counties, meta] = await Promise.all([
      loadAtlasFromXlsx().catch(() => ({})),
      loadMetadata(),
    ]);
    return { counties, meta };
  }

  /* ─── 2. Styles ─────────────────────────────────────────────────── */
  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Mono:wght@400;500&display=swap');

      :root {
        --bg:         #0d0f14;
        --panel:      #13161e;
        --border:     #1e2330;
        --accent:     #4e7cff;
        --text:       #e8eaf0;
        --muted:      #5a6280;
        --rep-dark:   #5e0f0f;
        --rep-mid:    #c33a3a;
        --rep-light:  #ef928a;
        --dem-dark:   #0c2654;
        --dem-mid:    #2f6bb5;
        --dem-light:  #92b8ee;
        --oth-dark:   #5a4400;
        --oth-mid:    #ab7d12;
        --oth-light:  #eed484;
      }

      * { box-sizing: border-box; margin: 0; padding: 0; }

      body {
        background: var(--bg);
        font-family: 'DM Mono', monospace;
        color: var(--text);
        height: 100vh;
        overflow: hidden;
      }

      #us-map { width: 100%; height: 100vh; position: relative; overflow: hidden; }
      #us-map svg {
        position: absolute; top: 0; left: 0;
        width: 100%; height: 100%;
      }

      .state { stroke: #2a3350; stroke-width: 0.6px; cursor: pointer; }
      .graticule { fill: none; stroke: #1a1f2e; stroke-width: 0.4px; }
      .state-label {
        font-family: 'DM Mono', monospace; font-size: 7px; font-weight: 500;
        fill: rgba(255,255,255,0.6); pointer-events: none;
        text-anchor: middle; dominant-baseline: middle;
      }
      .county-mesh { pointer-events: none; }

      /* ── Controls bar ── */
      #atlas-controls {
        position: fixed;
        bottom: 0; left: 0; right: 0;
        z-index: 200;
        background: #0d0f14cc;
        border-top: 1px solid #1e2330;
        backdrop-filter: blur(8px);
        padding: 10px 20px;
        display: flex;
        align-items: center;
        gap: 14px;
      }

      #year-display {
        font-family: 'DM Serif Display', serif;
        font-size: 1.6rem;
        color: var(--text);
        min-width: 60px;
        text-align: center;
        line-height: 1;
      }

      #year-slider {
        flex: 1;
        -webkit-appearance: none;
        appearance: none;
        height: 3px;
        background: #1e2330;
        border-radius: 2px;
        outline: none;
        cursor: pointer;
      }
      #year-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 14px; height: 14px;
        border-radius: 50%;
        background: var(--accent);
        cursor: pointer;
        border: 2px solid #0d0f14;
        box-shadow: 0 0 6px rgba(78,124,255,0.5);
      }
      #year-slider::-moz-range-thumb {
        width: 14px; height: 14px;
        border-radius: 50%;
        background: var(--accent);
        cursor: pointer;
        border: 2px solid #0d0f14;
      }

      .ctrl-btn {
        background: #13161e;
        border: 1px solid #2a3350;
        color: #5a6280;
        font-family: 'DM Mono', monospace;
        font-size: 0.7rem;
        padding: 5px 10px;
        border-radius: 4px;
        cursor: pointer;
        transition: color 0.15s, border-color 0.15s;
        white-space: nowrap;
      }
      .ctrl-btn:hover { color: var(--text); border-color: var(--accent); }
      .ctrl-btn:disabled { opacity: 0.3; cursor: default; }

      /* ── Reset ── */
      #reset-btn {
        position: fixed; top: 14px; left: 14px; z-index: 300;
        background: #13161e; border: 1px solid #2a3350;
        color: #5a6280; font-family: 'DM Mono', monospace;
        font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.1em;
        padding: 7px 12px; border-radius: 4px; cursor: pointer;
        opacity: 0; pointer-events: none;
        transition: opacity 0.2s, color 0.15s, border-color 0.15s;
      }
      #reset-btn.visible { opacity: 1; pointer-events: all; }
      #reset-btn:hover { color: var(--text); border-color: var(--accent); }

      /* ── Tooltip ── */
      #map-tooltip {
        position: fixed; pointer-events: none;
        background: #0d0f14ee;
        border: 1px solid #1e2330;
        border-left: 3px solid var(--accent);
        padding: 10px 14px; border-radius: 4px;
        font-family: 'DM Mono', monospace; font-size: 0.75rem;
        color: var(--text); white-space: nowrap;
        opacity: 0; transform: translateY(4px);
        transition: opacity 0.1s, transform 0.1s;
        z-index: 9999; backdrop-filter: blur(6px);
      }
      #map-tooltip.visible { opacity: 1; transform: translateY(0); }
      #map-tooltip .tt-name { font-family: 'DM Serif Display', serif; font-size: 1rem; margin-bottom: 4px; }
      #map-tooltip .tt-sub { color: var(--accent); font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.1em; }
      #map-tooltip .tt-votes { margin-top: 6px; font-size: 0.7rem; display: flex; flex-direction: column; gap: 2px; }
      #map-tooltip .tt-margin { color: var(--muted); font-size: 0.65rem; margin-top: 3px; }

      /* ── Legend ── */
      #map-legend {
        position: fixed; bottom: 70px; right: 18px; z-index: 200;
        background: #13161ecc; border: 1px solid #2a3350;
        border-radius: 5px; padding: 10px 14px;
        font-family: 'DM Mono', monospace; font-size: 0.65rem;
        color: var(--muted); backdrop-filter: blur(6px);
      }
      #map-legend .leg-title { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; color: #3a4460; }
      #map-legend .leg-bar { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
      #map-legend .leg-swatch { width: 60px; height: 8px; border-radius: 2px; }
      #map-legend .leg-note { margin-top: 6px; font-size: 0.58rem; color: #3a4460; }

      /* ── State info panel (top right) ── */
      #state-info {
        position: fixed; top: 240px; right: 14px; z-index: 200;
        background: #13161ecc; border: 1px solid #2a3350; border-radius: 5px;
        padding: 10px 14px; font-family: 'DM Mono', monospace;
        font-size: 0.68rem; color: var(--muted);
        backdrop-filter: blur(6px); max-width: 240px; width: 240px;
        opacity: 0; transition: opacity 0.2s; pointer-events: none;
      }
      #state-info.visible { opacity: 1; }
      #state-info .si-name { font-family: 'DM Serif Display', serif; font-size: 1rem; color: var(--text); margin-bottom: 6px; }
      #state-info .si-row { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 2px; }
      #state-info .si-label { color: var(--muted); }
      #state-info .si-val { color: var(--text); }
      #state-info .si-count { color: var(--muted); font-size: 0.82em; font-variant-numeric: tabular-nums; margin-left: 2px; }

      /* ── National scoreboard (top-right, always visible outside sim) ── */
      #national-scoreboard {
        position: fixed; top: 14px; right: 14px; z-index: 200;
        background: #13161ecc; border: 1px solid #2a3350; border-radius: 5px;
        padding: 10px 14px; width: 240px;
        font-family: 'DM Mono', monospace; color: var(--muted);
        backdrop-filter: blur(6px);
        transition: opacity 0.2s;
      }
      #national-scoreboard.hidden { opacity: 0; pointer-events: none; }
      .ns-year {
        font-family: 'DM Serif Display', serif; font-size: 1.05rem;
        color: var(--text); line-height: 1; margin-bottom: 6px;
      }
      .ns-section {
        font-size: 0.55rem; color: var(--muted);
        text-transform: uppercase; letter-spacing: 0.15em;
        margin: 6px 0 3px 0;
      }
      .ns-cand {
        display: flex; justify-content: space-between; align-items: center;
        font-size: 0.7rem; padding: 1px 0; gap: 8px;
      }
      .ns-cand .ns-name { color: var(--text); flex: 1; overflow: hidden;
        text-overflow: ellipsis; white-space: nowrap; }
      .ns-cand .ns-name.win::before { content: "★ "; color: #f0c040; }
      .ns-cand .ns-val { font-family: 'DM Mono', monospace; flex-shrink: 0; }
      .ns-cand.D .ns-val { color: #6b9fff; }
      .ns-cand.R .ns-val { color: #ff6b6b; }
      .ns-cand.O .ns-val { color: #f0c040; }
      .ns-bar-wrap {
        height: 8px; display: flex; background: #14181f;
        border-radius: 2px; overflow: visible; margin-top: 4px;
        position: relative;
      }
      .ns-bar-dem { background: #1a6bbf; transition: width 0.4s ease; }
      .ns-bar-rep { background: #c0392b; transition: width 0.4s ease; }
      .ns-bar-oth { background: #b8860b; transition: width 0.4s ease; }
      .ns-threshold-line {
        position: absolute; top: -3px; bottom: -3px;
        width: 2px; background: #f0c040;
        box-shadow: 0 0 4px rgba(240, 192, 64, 0.6);
        transform: translateX(-1px);
        transition: left 0.4s ease;
      }
      .ns-threshold-line::before {
        content: ''; position: absolute; top: -3px; left: -3px;
        width: 0; height: 0;
        border-left: 4px solid transparent;
        border-right: 4px solid transparent;
        border-top: 4px solid #f0c040;
      }
      .ns-threshold {
        font-size: 0.55rem; color: var(--muted); margin-top: 3px;
      }

      /* ── Election Night Simulator ── */
      #sim-btn {
        background: #2a1010; border: 1px solid #6b1f1f; color: #ff8a8a;
        font-family: 'DM Mono', monospace; font-size: 0.7rem;
        padding: 5px 12px; border-radius: 4px; cursor: pointer;
        text-transform: uppercase; letter-spacing: 0.08em;
        transition: background 0.15s, color 0.15s, border-color 0.15s;
        white-space: nowrap;
      }
      #sim-btn:hover { background: #3a1818; color: #ffb0b0; border-color: #a02828; }
      #sim-btn:disabled { opacity: 0.3; cursor: default; }
      #sim-btn .dot {
        display: inline-block; width: 7px; height: 7px; border-radius: 50%;
        background: #ff4444; margin-right: 6px; vertical-align: middle;
        box-shadow: 0 0 6px #ff4444;
      }
      #sim-btn.running .dot { animation: pulse 1s ease-in-out infinite; }
      @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }

      #sim-pause-btn {
        background: #1a1f2c; border: 1px solid #3a4560; color: #b8c4dc;
        font-family: 'DM Mono', monospace; font-size: 0.7rem;
        padding: 5px 12px; border-radius: 4px; cursor: pointer;
        text-transform: uppercase; letter-spacing: 0.08em;
        transition: background 0.15s, color 0.15s, border-color 0.15s;
        white-space: nowrap;
      }
      #sim-pause-btn:hover { background: #232a3a; color: #d8e0f0; border-color: #5a6580; }
      #sim-pause-btn.paused { background: #2a2410; border-color: #6b5a1f; color: #f0d080; }
      #sim-pause-btn.paused:hover { background: #3a3018; color: #ffe6a0; border-color: #a08828; }

      /* Election night scoreboard */
      #sim-board {
        position: fixed; top: 14px; left: 50%; transform: translateX(-50%);
        z-index: 250; min-width: 480px; max-width: 620px;
        background: #0a0d14ee; border: 1px solid #2a3350;
        border-radius: 6px; backdrop-filter: blur(10px);
        font-family: 'DM Mono', monospace;
        opacity: 0; pointer-events: none;
        transition: opacity 0.3s;
        overflow: hidden;
      }
      #sim-board.visible { opacity: 1; pointer-events: auto; }
      .sim-header {
        display: flex; justify-content: space-between; align-items: center;
        padding: 6px 12px;
        background: linear-gradient(90deg, #1a0808, #0a0d14);
        border-bottom: 1px solid #2a3350;
        font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.15em;
        color: #ff6b6b;
      }
      .sim-header .sim-live { display: flex; align-items: center; gap: 6px; }
      .sim-header .sim-live::before {
        content: ''; width: 6px; height: 6px; border-radius: 50%;
        background: #ff4444; box-shadow: 0 0 5px #ff4444;
        animation: pulse 1s ease-in-out infinite;
      }
      .sim-header .sim-clock { color: var(--muted); letter-spacing: 0.1em; }
      .sim-header .sim-shift-tag {
        margin-left: 8px; padding: 2px 6px;
        background: #2a1f3a; border: 1px solid #5a3a7a;
        border-radius: 3px; color: #d8b8ff;
        font-size: 0.55rem; letter-spacing: 0.1em; text-transform: uppercase;
      }

      .sim-scores { display: flex; align-items: stretch; padding: 10px 0; }
      .sim-cand { flex: 1; padding: 4px 16px; }
      .sim-cand-dem { border-right: 1px solid #1e2330; text-align: right; }
      .sim-cand-rep { border-left: 1px solid #1e2330; text-align: left; }
      .sim-cand .sim-name {
        font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.1em;
        color: var(--muted); margin-bottom: 2px;
      }
      .sim-cand .sim-ev {
        font-family: 'DM Serif Display', serif; font-size: 2.2rem; line-height: 1;
      }
      .sim-cand-dem .sim-ev { color: #6b9fff; }
      .sim-cand-rep .sim-ev { color: #ff6b6b; }
      .sim-cand .sim-pv {
        font-size: 0.62rem; color: var(--muted); margin-top: 3px;
      }
      .sim-270 {
        display: flex; flex-direction: column; align-items: center;
        justify-content: center; padding: 0 14px; min-width: 60px;
      }
      .sim-270-num { font-family: 'DM Serif Display', serif; font-size: 1rem; color: var(--accent); }
      .sim-270-lbl { font-size: 0.55rem; color: var(--muted); letter-spacing: 0.15em; text-transform: uppercase; }

      .sim-bar-wrap { height: 6px; display: flex; background: #1a2035; position: relative; overflow: visible; }
      .sim-threshold-line {
        position: absolute; top: -2px; bottom: -2px;
        width: 2px; background: #f0c040;
        box-shadow: 0 0 4px rgba(240, 192, 64, 0.6);
        transform: translateX(-1px);
      }
      .sim-bar-dem { background: #1a6bbf; transition: width 0.5s ease; }
      .sim-bar-rep { background: #c0392b; transition: width 0.5s ease; }
      .sim-bar-oth { background: #b8860b; transition: width 0.5s ease; }

      /* Other-candidate pill — appears below "270 To win" only when an Other
         candidate has electoral votes (e.g. 1912, 1948, 1968). */
      .sim-cand-oth {
        margin-top: 6px;
        padding: 3px 8px;
        background: rgba(184, 134, 11, 0.18);
        border: 1px solid rgba(240, 192, 64, 0.4);
        border-radius: 10px;
        font-size: 0.6rem;
        color: #f0c040;
        display: flex;
        gap: 6px;
        align-items: baseline;
      }
      .sim-cand-oth .sim-oth-name {
        max-width: 70px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .sim-cand-oth .sim-oth-ev {
        font-family: 'DM Serif Display', serif;
        font-size: 0.78rem;
        color: #ffd66b;
      }

      .sim-footer {
        padding: 6px 12px;
        font-size: 0.6rem; color: var(--muted);
        display: flex; justify-content: space-between;
        border-top: 1px solid #1e2330;
      }
      .sim-reporting { letter-spacing: 0.05em; }
      .sim-leader { color: var(--text); }

      /* AP calls panel */
      #sim-calls {
        position: fixed; top: 14px; right: 14px; z-index: 250;
        width: 180px; max-height: calc(100vh - 28px);
        background: #0a0d14ee; border: 1px solid #2a3350;
        border-radius: 6px; backdrop-filter: blur(10px);
        font-family: 'DM Mono', monospace;
        opacity: 0; pointer-events: none;
        transition: opacity 0.3s;
        display: flex; flex-direction: column;
      }
      #sim-calls.visible { opacity: 1; pointer-events: auto; }
      .calls-header {
        padding: 6px 10px; font-size: 0.58rem;
        text-transform: uppercase; letter-spacing: 0.15em;
        color: var(--accent); border-bottom: 1px solid #1e2330;
      }
      .calls-list {
        flex: 1; overflow-y: auto; padding: 4px 0;
        max-height: 320px;
      }
      .calls-list::-webkit-scrollbar { width: 4px; }
      .calls-list::-webkit-scrollbar-thumb { background: #2a3350; border-radius: 2px; }
      .call-row {
        display: flex; align-items: center; gap: 6px;
        padding: 4px 10px;
        font-size: 0.65rem;
        border-bottom: 1px solid #14181f;
        animation: callFlash 1s ease;
      }
      @keyframes callFlash {
        0% { background: rgba(255,200,80,0.25); }
        100% { background: transparent; }
      }
      .call-row .call-dot {
        width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
      }
      .call-row .call-dot.D { background: #6b9fff; }
      .call-row .call-dot.R { background: #ff6b6b; }
      .call-row .call-dot.O { background: #f0c040; }
      .call-row .call-state { flex: 1; color: var(--text); font-size: 0.62rem; }
      .call-row .call-ev { color: var(--muted); font-size: 0.6rem; }

      /* Year selector for sim */
      #sim-config {
        position: fixed; bottom: 70px; left: 50%; transform: translateX(-50%);
        z-index: 250; background: #0a0d14ee;
        border: 1px solid #2a3350; border-radius: 6px;
        padding: 16px 20px; backdrop-filter: blur(10px);
        font-family: 'DM Mono', monospace;
        opacity: 0; pointer-events: none;
        transition: opacity 0.2s;
      }
      #sim-config.visible { opacity: 1; pointer-events: auto; }
      #sim-config .cfg-title {
        font-family: 'DM Serif Display', serif; font-size: 1.1rem;
        color: var(--text); margin-bottom: 10px;
      }
      #sim-config .cfg-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; font-size: 0.7rem; color: var(--muted); }
      #sim-config select {
        background: #13161e; color: var(--text);
        border: 1px solid #2a3350; border-radius: 3px;
        font-family: 'DM Mono', monospace; font-size: 0.7rem;
        padding: 4px 8px;
      }
      #sim-config .cfg-go {
        background: #2a1010; border: 1px solid #6b1f1f; color: #ff8a8a;
        font-family: 'DM Mono', monospace; font-size: 0.75rem;
        padding: 6px 14px; border-radius: 4px; cursor: pointer;
        text-transform: uppercase; letter-spacing: 0.1em;
        width: 100%; margin-top: 6px;
      }
      #sim-config .cfg-go:hover { background: #3a1818; color: #ffb0b0; }

      /* During sim:
         - uncalled states: tint of the running-margin colour (0.25 opacity)
         - called states:   darker tint of the called party's colour (0.55),
                            still translucent so county fills show through */
      .sim-active .county-fill[data-reported="0"] { opacity: 0.85; }
      .sim-active .state-overlay-dim { fill-opacity: 0.25 !important; }
      .sim-active .state-called      { fill-opacity: 0.55 !important; }

      /* Big call banner */
      #call-banner {
        position: fixed; top: 50%; left: 50%;
        transform: translate(-50%, -50%) scale(0.85);
        z-index: 400;
        background: #0a0d14;
        border: 2px solid;
        padding: 18px 38px;
        font-family: 'DM Serif Display', serif;
        text-align: center;
        opacity: 0;
        pointer-events: none;
        box-shadow: 0 0 60px rgba(0,0,0,0.8);
        transition: opacity 0.25s, transform 0.25s;
      }
      #call-banner.show {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
      }
      #call-banner .cb-label {
        font-family: 'DM Mono', monospace;
        font-size: 0.7rem;
        letter-spacing: 0.3em;
        text-transform: uppercase;
        margin-bottom: 6px;
      }
      #call-banner .cb-state { font-size: 2.4rem; line-height: 1; margin-bottom: 4px; }
      #call-banner .cb-for { font-family: 'DM Mono', monospace; font-size: 0.75rem; letter-spacing: 0.1em; color: var(--muted); }
      #call-banner .cb-party { font-size: 1.4rem; line-height: 1.2; margin-top: 4px; }
      #call-banner.D { border-color: #4a7fd4; color: #b8d4ed; }
      #call-banner.D .cb-label { color: #6b9fff; }
      #call-banner.D .cb-party { color: #6b9fff; }
      #call-banner.R { border-color: #c0392b; color: #f4c5be; }
      #call-banner.R .cb-label { color: #ff6b6b; }
      #call-banner.R .cb-party { color: #ff6b6b; }
      #call-banner.O { border-color: #b8860b; color: #f0e0a0; }
      #call-banner.O .cb-label { color: #f0c040; }
      #call-banner.O .cb-party { color: #f0c040; }
      #call-banner.retract { border-color: #8a6a3a; color: #d8c8a8; }
      #call-banner.retract .cb-label { color: #f0c040; }
      #call-banner.retract .cb-party { color: #d8c8a8; }
      .call-row.call-retracted { opacity: 0.55; text-decoration: line-through; }
      .call-row.call-retracted .call-dot {
        background: #5a6280;
        text-decoration: none;
        display: flex; align-items: center; justify-content: center;
        font-size: 10px; line-height: 1;
        color: #ddd;
      }
      .call-dot.retracted { background: #5a6280 !important; }

      /* Winner banner — 270 reached */
      #winner-banner {
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        z-index: 500;
        background: radial-gradient(ellipse at center, rgba(13,15,20,0.85) 0%, rgba(13,15,20,0.97) 100%);
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 10px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.5s;
        font-family: 'DM Serif Display', serif;
        text-align: center;
      }
      #winner-banner.show { opacity: 1; pointer-events: auto; }
      #winner-banner .wb-headline {
        font-family: 'DM Mono', monospace;
        font-size: 0.85rem;
        letter-spacing: 0.4em;
        text-transform: uppercase;
        color: var(--accent);
        animation: wbFlash 1.2s ease-in-out infinite;
      }
      @keyframes wbFlash { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
      #winner-banner .wb-elected {
        font-size: 0.9rem;
        font-family: 'DM Mono', monospace;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: var(--muted);
        margin-top: 14px;
      }
      #winner-banner .wb-party {
        font-size: 4.5rem;
        line-height: 1;
      }
      #winner-banner.D .wb-party { color: #6b9fff; }
      #winner-banner.R .wb-party { color: #ff6b6b; }
      #winner-banner.O .wb-party { color: #f0c040; }
      #winner-banner .wb-ev {
        font-family: 'DM Mono', monospace;
        font-size: 1rem;
        color: var(--text);
        letter-spacing: 0.1em;
        margin-top: 6px;
      }
      #winner-banner .wb-year {
        font-size: 1.4rem;
        color: var(--muted);
        margin-top: 8px;
        font-family: 'DM Mono', monospace;
        letter-spacing: 0.15em;
      }
      #winner-banner .wb-dismiss {
        margin-top: 28px;
        background: transparent;
        border: 1px solid var(--accent);
        color: var(--accent);
        font-family: 'DM Mono', monospace;
        font-size: 0.75rem;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        padding: 8px 20px;
        cursor: pointer;
        border-radius: 3px;
        transition: background 0.15s;
      }
      #winner-banner .wb-dismiss:hover { background: rgba(78,124,255,0.15); }

      /* State call flash overlay */
      @keyframes stateCallFlash {
        0% { fill-opacity: 0.10; }
        15% { fill-opacity: 1.0; }
        45% { fill-opacity: 0.95; }
        100% { fill-opacity: 0.55; }
      }
      .state-just-called {
        animation: stateCallFlash 1.4s ease-out;
      }
    `;
    document.head.appendChild(style);
  }

  /* ─── 3. Constants ──────────────────────────────────────────────── */
  const FIPS_NAME = {
    "01":"Alabama","02":"Alaska","04":"Arizona","05":"Arkansas",
    "06":"California","08":"Colorado","09":"Connecticut","10":"Delaware",
    "11":"District of Columbia","12":"Florida","13":"Georgia",
    "15":"Hawaii","16":"Idaho","17":"Illinois","18":"Indiana",
    "19":"Iowa","20":"Kansas","21":"Kentucky","22":"Louisiana",
    "23":"Maine","24":"Maryland","25":"Massachusetts","26":"Michigan",
    "27":"Minnesota","28":"Mississippi","29":"Missouri","30":"Montana",
    "31":"Nebraska","32":"Nevada","33":"New Hampshire","34":"New Jersey",
    "35":"New Mexico","36":"New York","37":"North Carolina",
    "38":"North Dakota","39":"Ohio","40":"Oklahoma","41":"Oregon",
    "42":"Pennsylvania","44":"Rhode Island","45":"South Carolina",
    "46":"South Dakota","47":"Tennessee","48":"Texas","49":"Utah",
    "50":"Vermont","51":"Virginia","53":"Washington","54":"West Virginia",
    "55":"Wisconsin","56":"Wyoming"
  };

  const NAME_ABBR = {
    "Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR",
    "California":"CA","Colorado":"CO","Connecticut":"CT","Delaware":"DE",
    "District of Columbia":"DC","Florida":"FL","Georgia":"GA","Hawaii":"HI",
    "Idaho":"ID","Illinois":"IL","Indiana":"IN","Iowa":"IA","Kansas":"KS",
    "Kentucky":"KY","Louisiana":"LA","Maine":"ME","Maryland":"MD",
    "Massachusetts":"MA","Michigan":"MI","Minnesota":"MN","Mississippi":"MS",
    "Missouri":"MO","Montana":"MT","Nebraska":"NE","Nevada":"NV",
    "New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM","New York":"NY",
    "North Carolina":"NC","North Dakota":"ND","Ohio":"OH","Oklahoma":"OK",
    "Oregon":"OR","Pennsylvania":"PA","Rhode Island":"RI","South Carolina":"SC",
    "South Dakota":"SD","Tennessee":"TN","Texas":"TX","Utah":"UT",
    "Vermont":"VT","Virginia":"VA","Washington":"WA","West Virginia":"WV",
    "Wisconsin":"WI","Wyoming":"WY"
  };

  /* ─── 4. Colour helpers ─────────────────────────────────────────── */
  /* Margin between winner and runner-up (not just |R-D|, which would be
     wrong when Other wins and the actual race was Other-vs-someone). */
  function winnerMargin(d) {
    if (!d) return 0;
    const r = d.rp || 0, dm = d.dp || 0, o = d.op || 0;
    let first = r, second = Math.max(dm, o);
    if (d.w === "D")      { first = dm; second = Math.max(r, o); }
    else if (d.w === "O") { first = o;  second = Math.max(r, dm); }
    return Math.max(0, (first - second) / 100);
  }

  function countyColour(d) {
    if (!d) return "#1a2035";
    const t = Math.min(1, winnerMargin(d) / 0.60);
    if (d.w === "R") return d3.interpolateRgb("#ef928a", "#5e0f0f")(t);
    if (d.w === "D") return d3.interpolateRgb("#92b8ee", "#0c2654")(t);
    // Other / third party — gold
    return d3.interpolateRgb("#eed484", "#5a4400")(t);
  }

  function stateColour(d) {
    if (!d) return "#1a2035";
    const t = Math.min(1, winnerMargin(d) / 0.40);
    if (d.w === "R") return d3.interpolateRgb("#ef928a", "#5e0f0f")(t);
    if (d.w === "D") return d3.interpolateRgb("#92b8ee", "#0c2654")(t);
    return d3.interpolateRgb("#eed484", "#5a4400")(t);
  }

  function pct(v) { return (v).toFixed(1) + "%"; }
  function fmt(v) { return Number(v).toLocaleString(); }

  /* ─── Election Night: Poll closing times (ET hours, decimal) ────── */
  /* Approximate modern poll-closing times by state FIPS, in Eastern Time.
     Real elections have multiple closing times per state (mountain/central
     splits in MI, KS, FL, IN, KY, ND, SD, OR, TX), so we use the LATER time
     and stagger counties within each state randomly. */
  const POLL_CLOSE_ET = {
    "01":20.0,"02":25.0,"04":22.0,"05":20.5,"06":23.0,"08":21.0,"09":20.0,
    "10":20.0,"11":20.0,"12":20.0,"13":19.0,"15":24.0,"16":23.0,"17":20.0,
    "18":19.0,"19":22.0,"20":21.0,"21":19.0,"22":21.0,"23":20.0,"24":20.0,
    "25":20.0,"26":21.0,"27":21.0,"28":20.0,"29":20.0,"30":22.0,"31":21.0,
    "32":22.0,"33":20.0,"34":20.0,"35":21.0,"36":21.0,"37":19.5,"38":21.0,
    "39":19.5,"40":20.0,"41":23.0,"42":20.0,"44":20.0,"45":19.0,"46":21.0,
    "47":20.0,"48":21.0,"49":22.0,"50":19.0,"51":19.0,"53":23.0,"54":19.5,
    "55":21.0,"56":21.0
  };

  /* Electoral votes per state (2024 allocation; historical EVs differ but
     this is fine for the simulator — we use this for state calls).        */
  const STATE_EV = {
    "01":9,"02":3,"04":11,"05":6,"06":54,"08":10,"09":7,"10":3,"11":3,
    "12":30,"13":16,"15":4,"16":4,"17":19,"18":11,"19":6,"20":6,"21":8,
    "22":8,"23":4,"24":10,"25":11,"26":15,"27":10,"28":6,"29":10,"30":4,
    "31":5,"32":6,"33":4,"34":14,"35":5,"36":28,"37":16,"38":3,"39":17,
    "40":7,"41":8,"42":19,"44":4,"45":9,"46":3,"47":11,"48":40,"49":6,
    "50":3,"51":13,"53":12,"54":4,"55":10,"56":3
  };

  function fmtClock(hours) {
    const h24 = ((hours % 24) + 24) % 24;
    let h = Math.floor(h24);
    const m = Math.floor((h24 - h) * 60);
    const ampm = h >= 12 ? "PM" : "AM";
    if (h === 0) h = 12; else if (h > 12) h -= 12;
    return `${h}:${m.toString().padStart(2,"0")} ${ampm} ET`;
  }

  /* ─── 5. Build ──────────────────────────────────────────────────── */
  /* ── Counties that didn't exist before a certain year ──────────────
     For years < firstYear, these FIPS are hidden and their geometry
     visually merges into surrounding counties via the mesh.          */
  const HIDE_BEFORE = {
    "08014": 2004,  // Broomfield CO — split from Boulder/Adams/Jefferson/Weld
    "35006": 1984,  // Cibola NM — split from Valencia
    "04012": 1984,  // La Paz AZ — split from Yuma
    "35028": 1952,  // Los Alamos NM — split from Sandoval/Santa Fe
    "55078": 1964,  // Menominee WI — split from Oconto/Shawano
    "49009": 1920,  // Daggett UT — split from Uintah (created 1918)
    "35021": 1924,  // Harding NM — split from Union/Mora (created 1921)
    "35003": 1924,  // Catron NM — split from Socorro (created 1921)
    "35023": 1920,  // Hidalgo NM — split from Grant (created 1919)
    "35011": 1920,  // De Baca NM — split from Chaves/Guadalupe/Roosevelt (created 1917)
    "35025": 1920,  // Lea NM — split from Chaves/Eddy (created 1917)
  };

  function countyHidden(fips, year) {
    return HIDE_BEFORE[fips] !== undefined && year < HIDE_BEFORE[fips];
  }

  function buildAtlas() {
    const d3 = window.d3;
    const topojson = window.topojson;
    // ViewBox aspect ratio close to typical screen (~1.78:1).
    // Anchor to top so map sits higher in the viewport rather than centred.
    const W = 1000, H = 560;

    const container = document.getElementById("us-map");
    const svg = d3.select(container).append("svg")
      .attr("viewBox", `0 0 ${W} ${H}`)
      .attr("preserveAspectRatio", "xMidYMin meet");

    const defs = svg.append("defs");
    const projection = d3.geoAlbersUsa();
    const path = d3.geoPath().projection(projection);

    const mapG = svg.append("g").attr("class", "map-root");
    const highlightG = svg.append("g").attr("class", "highlights");

    const zoom = d3.zoom().scaleExtent([1, 12]).on("zoom", function (ev) {
      const k = ev.transform.k;
      mapG.attr("transform", ev.transform);
      highlightG.attr("transform", ev.transform);
      mapG.selectAll(".state").attr("stroke-width", 0.6 / k);
      mapG.selectAll(".state-label").attr("font-size", 7 / k);
    });
    svg.call(zoom);

    /* Tooltip */
    const tooltip = document.getElementById("map-tooltip");

    function showTooltip(event, name, sub, d, opts) {
      opts = opts || {};
      tooltip.querySelector(".tt-name").textContent = name;
      tooltip.querySelector(".tt-sub").textContent = sub;
      const votes = tooltip.querySelector(".tt-votes");
      if (d) {
        const repName = opts.repName || "Republican";
        const demName = opts.demName || "Democrat";
        const othName = opts.othName || "Other";
        const REP_COLOUR = "#ff6b6b", DEM_COLOUR = "#6b9fff", OTH_COLOUR = "#f0c040";

        // Build all three rows, then sort by vote share descending and mark winner.
        const rows = [
          { party: "R", name: repName, colour: REP_COLOUR, pct: d.rp || 0, votes: d.rv || 0 },
          { party: "D", name: demName, colour: DEM_COLOUR, pct: d.dp || 0, votes: d.dv || 0 },
          { party: "O", name: othName, colour: OTH_COLOUR, pct: d.op || 0, votes: d.ov || 0 },
        ];
        rows.sort((a, b) => b.pct - a.pct);
        const winnerParty = d.w;
        const reportingLine = opts.reportingPct != null
          ? `<span class="tt-margin" style="color:#f0c040">${opts.reportingPct}% reporting</span>`
          : "";

        const rowsHTML = rows
          .filter(r => r.votes > 0 || r.party !== "O") // hide Other if zero
          .map(r => {
            // Show a checkmark only when this row's party is the called winner
            // of a state that the simulator has called.  No marker otherwise —
            // the winner is implied by the row being first in the sorted list.
            const mark = (opts.called && r.party === winnerParty) ? "✓ " : "";
            return `<span style="color:${r.colour}">${mark}${r.name}  ${pct(r.pct)}  (${fmt(r.votes)})</span>`;
          })
          .join("\n");

        // Margin = winner's share minus runner-up's share
        const winShare = rows[0].pct, secondShare = rows[1].pct;
        const margin = Math.max(0, winShare - secondShare);
        const winnerLabel = rows[0].name;
        // Label for the bottom line:
        //   - "✓ Called for X" when AP has called the state in the sim
        //   - "Leading" when partial reporting underway
        //   - just the winner's name otherwise
        let leaderLabel;
        if (opts.called) {
          leaderLabel = `✓ Called for ${winnerLabel}`;
        } else if (opts.reportingPct != null && opts.reportingPct < 100) {
          leaderLabel = "Leading";
        } else {
          leaderLabel = winnerLabel;
        }

        votes.innerHTML = `
          ${reportingLine}
          ${rowsHTML}
          <span class="tt-margin">${leaderLabel} +${pct(margin)}</span>`;
        votes.style.display = "flex";
      } else {
        votes.innerHTML = opts.reportingPct != null
          ? `<span class="tt-margin" style="color:var(--muted)">No votes reported yet</span>`
          : "";
        votes.style.display = opts.reportingPct != null ? "flex" : "none";
      }
      tooltip.style.left = (event.clientX + 14) + "px";
      tooltip.style.top  = (event.clientY - 36) + "px";
      tooltip.classList.add("visible");
    }

    /* Load all data in parallel */
    Promise.all([
      d3.json("states-10m.json"),
      d3.json("counties-10m.json"),
      loadAtlas(),
      d3.json("county_merges.json"),
    ]).then(([us, countiesTopo, atlasBundle, countyMerges]) => {

      const atlas = atlasBundle.counties;
      const atlasMeta = atlasBundle.meta || {};
      const years = Object.keys(atlas).map(Number).filter(y => y >= 1912).sort((a,b) => a-b);
      // Drop pre-1912 entries from atlas to keep getYearData()/getYearMeta() consistent
      Object.keys(atlas).forEach(y => { if (+y < 1912) delete atlas[y]; });

      // Sanity-check metadata: warn if a year's candidate-EV sum disagrees
      // with its state-EV sum (means scraper got something wrong, and the
      // sim's bar/threshold may look off for that year).
      years.forEach(y => {
        const m = atlasMeta[String(y)];
        if (!m) return;
        const candSum = (m.candidates || []).reduce((a,c) => a + (c.ev||0), 0);
        const stateSum = Object.values(m.state_evs || {}).reduce((a,b) => a + (+b||0), 0);
        if (candSum && stateSum && candSum !== stateSum) {
          console.warn(`[election-atlas] ${y}: candidate-EV sum (${candSum}) ` +
                       `≠ state-EV sum (${stateSum}). Scoreboard uses state-EV sum.`);
        }
      });

      let currentYear = 2024;
      let activeStateFips = null;

      const states = topojson.feature(us, us.objects.states);
      const allCounties = topojson.feature(countiesTopo, countiesTopo.objects.counties);

      /* Pre-merged county geometries for historical boundary changes.
         countyMerges[fips] = { beforeYear, mergedGeoms: { parentFips: GeoJSONGeom } }
         For years < beforeYear, parent counties use their merged geometry. */
      function getMergedFeature(feature, year) {
        const fips = String(feature.id).padStart(5, "0");
        for (const [hideFips, entry] of Object.entries(countyMerges)) {
          if (year < entry.beforeYear && entry.parents[fips]) {
            return { ...feature, geometry: entry.parents[fips] };
          }
        }
        return feature;
      }

      /* Atlas mode: right side has scoreboard (~250 wide) and legend.  Reserve
                     right margin so the map sits flush left of the panels.
         Sim mode:   centered top scoreboard (~480-620 wide, ~150 tall) plus
                     right-side AP calls panel.  Push the map down ~155px so
                     the scoreboard doesn't overlap the Great Lakes, and reserve
                     right margin for the AP calls panel.  Keep enough bottom
                     room for southern Florida / Texas to remain visible. */
      function fitProjection(mode) {
        if (mode === "sim") {
          // Shift the map up so south Florida and Texas stay visible, and a
          // bit to the right so the left side of the country has breathing room.
          projection.fitExtent([[60, 90], [W - 180, H - 55]], states);
        } else {
          // Atlas mode: tight fit, just enough right margin for the scoreboard.
          projection.fitExtent([[0, 0], [W - 195, H]], states);
        }
      }
      fitProjection("atlas");

      /* County names lookup */
      const countyNames = {};
      countiesTopo.objects.counties.geometries.forEach(g => {
        const fips = String(g.id).zfill ? String(g.id).padStart(5,"0") : String(g.id).padStart(5,"0");
        if (g.properties && g.properties.name) countyNames[fips] = g.properties.name;
      });

      /* Graticule */
      const grat = d3.geoGraticule().step([10, 10]);
      mapG.append("path").datum(grat()).attr("class", "graticule").attr("d", path);

      /* ── UI Controls ── */
      const slider = document.getElementById("year-slider");
      const yearDisplay = document.getElementById("year-display");
      const prevBtn = document.getElementById("prev-btn");
      const nextBtn = document.getElementById("next-btn");
      const resetBtn = document.getElementById("reset-btn");
      const stateInfo = document.getElementById("state-info");
      const simBtn = document.getElementById("sim-btn");

      slider.min = 0;
      slider.max = years.length - 1;
      slider.value = years.indexOf(currentYear);

      function updateYear(year) {
        currentYear = year;
        yearDisplay.textContent = year;
        slider.value = years.indexOf(year);
        prevBtn.disabled = years.indexOf(year) === 0;
        nextBtn.disabled = years.indexOf(year) === years.length - 1;
        if (simBtn) {
          simBtn.disabled = false;
          simBtn.title = `Simulate ${year} election night`;
        }
        // Changing the year while a post-sim "frozen" view is on screen would
        // leave stale county-by-county data from the previous year (and any
        // applied shift) attached to hovers.  Clear it so the atlas reverts
        // to the new year's real history.  An actively-running sim isn't
        // affected since the slider is disabled below for that case.
        if (!SIM.running && (SIM.shiftedData || (SIM.countyRunning && Object.keys(SIM.countyRunning).length))) {
          SIM.reportedCounties = new Set();
          SIM.countyRunning = {};
          SIM.stateTotals = {};
          SIM.stateCalls = {};
          SIM.winnerDeclared = null;
          SIM.shift = null;
          SIM.shiftedData = null;
          simBoard.classList.remove("visible");
          simCalls.classList.remove("visible");
          const ns = document.getElementById("national-scoreboard");
          if (ns) ns.classList.remove("hidden");
        }
        applyYearData();
      }

      slider.addEventListener("input", () => {
        updateYear(years[+slider.value]);
      });
      prevBtn.addEventListener("click", () => {
        const i = years.indexOf(currentYear);
        if (i > 0) updateYear(years[i - 1]);
      });
      nextBtn.addEventListener("click", () => {
        const i = years.indexOf(currentYear);
        if (i < years.length - 1) updateYear(years[i + 1]);
      });

      /* ── Apply year data to map ── */
      function getYearData() {
        return atlas[String(currentYear)] || {};
      }

      /* Metadata helpers (candidate names, EV counts) for the active year. */
      function getYearMeta() {
        return atlasMeta[String(currentYear)] || { candidates: [], state_evs: {} };
      }

      /* Historical electoral votes for a state in the active year.
         Falls back to the modern 2024 allocation if the year isn't scraped. */
      function getStateEV(sfips) {
        const m = getYearMeta();
        if (m.state_evs && m.state_evs[sfips] != null) return m.state_evs[sfips];
        return STATE_EV[sfips] || 0;
      }

      /* The CANONICAL total number of electoral votes for the active year.
         Computed by summing getStateEV(sfips) over every state that actually
         has vote data in the XLSX atlas — so the total reflects only states
         that participated, and matches whatever sum the simulator will
         eventually reach when every state is called.
         Falls back to all-states sum, then to a fixed 538. */
      function totalEVForYear() {
        const data = getYearData();
        const stateFipsWithData = new Set();
        Object.keys(data).forEach(fips => {
          stateFipsWithData.add(fips.slice(0, 2));
        });
        if (stateFipsWithData.size > 0) {
          let sum = 0;
          stateFipsWithData.forEach(sf => sum += getStateEV(sf));
          if (sum > 0) return sum;
        }
        // Fallback: sum of all state_evs in metadata for this year
        const m = getYearMeta();
        const allMetaSum = Object.values(m.state_evs || {})
          .reduce((a, b) => a + (+b || 0), 0);
        if (allMetaSum > 0) return allMetaSum;
        // Last-resort fallback
        return 538;
      }

      /* Candidate name for a given party (D / R / O) in the active year.
         For "O", picks the most prominent Other candidate (most EVs, then most
         votes) — handles years with multiple third parties like 1948 (Thurmond
         + Wallace) or 1968 (Wallace was easy, but 1992 had Perot etc.).
         Returns party-family fallback if no metadata. */
      function getCandidateName(party) {
        const c = getCandidate(party);
        if (c && c.name) return c.name;
        return party === "D" ? "Democrat" : party === "R" ? "Republican" : "Other";
      }

      /* Full candidate record for a party.  For "O", returns the most prominent. */
      function getCandidate(party) {
        const m = getYearMeta();
        const cands = (m.candidates || []).filter(c => c.party === party);
        if (cands.length === 0) return null;
        if (cands.length === 1) return cands[0];
        // Multiple candidates: prefer the one with most EVs, then most votes
        cands.sort((a, b) => {
          const evDiff = (b.ev || 0) - (a.ev || 0);
          if (evDiff !== 0) return evDiff;
          return (b.votes || 0) - (a.votes || 0);
        });
        return cands[0];
      }

      /* Returns an opts object with current-year candidate names, for showTooltip. */
      function tooltipNames() {
        return {
          repName: getCandidateName("R"),
          demName: getCandidateName("D"),
          othName: getCandidateName("O"),
        };
      }

      /* Render the always-visible national scoreboard for the current year. */
      function renderNationalScoreboard() {
        const board = document.getElementById("national-scoreboard");
        if (!board) return;
        const meta = getYearMeta();
        const cands = meta.candidates || [];

        // EV totals per party from scraped candidate metadata
        let dEV = 0, rEV = 0, oEV = 0;
        cands.forEach(c => {
          if (c.party === "D") dEV += c.ev || 0;
          else if (c.party === "R") rEV += c.ev || 0;
          else oEV += c.ev || 0;
        });
        // Canonical total = sum of state EVs for states that have vote data in the XLSX.
        // This is the same source the simulator uses, so all displays stay consistent.
        const totalEV = totalEVForYear();
        const threshold = Math.floor(totalEV / 2) + 1;

        board.querySelector(".ns-year").textContent = `${currentYear} Presidential`;

        // Pick top 3 candidates once (by popular vote), use same list for EV & PV sections
        const top3 = [...cands]
          .sort((a, b) => (b.votes||0) - (a.votes||0))
          .slice(0, 3);

        // EV section: same 3, sorted by EV desc
        const evSorted = [...top3].sort((a, b) => (b.ev||0) - (a.ev||0));
        const evRows = evSorted.map(c => {
          const win = (c.ev||0) >= threshold;
          return `<div class="ns-cand ${c.party}">
            <span class="ns-name ${win?"win":""}">${c.name}</span>
            <span class="ns-val">${fmt(c.ev||0)}</span>
          </div>`;
        }).join("");
        board.querySelector(".ns-cands-ev").innerHTML = evRows ||
          `<div class="ns-cand"><span class="ns-name" style="color:var(--muted)">No data</span></div>`;

        // EV bar — D | R | O.  Note: dEV+rEV+oEV may not equal totalEV if the
        // scraper's candidate EVs disagree with the state_evs sum.  We use
        // totalEV (state sum) as denominator so the threshold line matches reality.
        const dPct = (dEV / totalEV * 100).toFixed(2);
        const rPct = (rEV / totalEV * 100).toFixed(2);
        const oPct = (oEV / totalEV * 100).toFixed(2);
        const thresholdPct = (threshold / totalEV * 100).toFixed(2);
        const bar = board.querySelector(".ns-bar-wrap");
        bar.innerHTML = `
          <div class="ns-bar-dem" style="width:${dPct}%"></div>
          <div class="ns-bar-rep" style="width:${rPct}%"></div>
          <div class="ns-bar-oth" style="width:${oPct}%"></div>
          <div class="ns-threshold-line" style="left:${thresholdPct}%"></div>`;
        board.querySelector(".ns-threshold").innerHTML =
          `<span style="color:#f0c040">▲ ${threshold} to win</span> · ${totalEV} total electors`;

        // PV section: same 3, sorted by votes desc
        const pvRows = top3.filter(c => (c.votes||0) > 0).map(c => {
          return `<div class="ns-cand ${c.party}">
            <span class="ns-name">${c.name}</span>
            <span class="ns-val">${pct(c.pct||0)}</span>
          </div>`;
        }).join("");
        board.querySelector(".ns-cands-pv").innerHTML = pvRows ||
          `<div class="ns-cand"><span class="ns-name" style="color:var(--muted)">No data</span></div>`;
      }

      function applyYearData() {
        // Don't disturb the map while a simulation is running
        if (typeof SIM !== "undefined" && SIM.running) return;
        const data = getYearData();
        // Update county colours for all counties
        countyG.selectAll(".county-fill")
          .attr("d", d => path(getMergedFeature(d, currentYear)))
          .attr("data-reported", "1")
          .attr("fill", d => {
            const fips = String(d.id).padStart(5, "0");
            if (countyHidden(fips, currentYear)) return "transparent";
            return countyColour(data[fips]);
          })
          .attr("visibility", d => {
            const fips = String(d.id).padStart(5, "0");
            return countyHidden(fips, currentYear) ? "hidden" : "visible";
          });
        // Redraw county mesh excluding hidden county borders
        countyG.select(".county-mesh").attr("d", () => {
          const mesh = topojson.mesh(countiesTopo, countiesTopo.objects.counties, (a, b) => {
            if (a === b) return false;
            const fa = String(a.id).padStart(5, "0");
            const fb = String(b.id).padStart(5, "0");
            // Hide border if either side is a hidden county
            if (countyHidden(fa, currentYear) || countyHidden(fb, currentYear)) return false;
            return true;
          });
          return path(mesh);
        });
        // Update state overlay colours.  Atlas mode: fully opaque so the
        // county detail underneath isn't visible (which was confusing —
        // counties bleeding through the state tint).  Sim mode overrides this
        // via .sim-active .state-overlay-dim CSS so the live county-by-county
        // reveal is visible underneath the running-margin tint.
        statePaths
          .attr("fill-opacity", 1.0)
          .attr("fill", d => {
          const sfips = String(d.id).padStart(2, "0");
          const stateResult = aggregateState(sfips, data);
          return stateColour(stateResult);
        });
        // Update legend year and candidate names
        document.querySelector(".leg-title").textContent = `${currentYear} Presidential`;
        const repC = getCandidate("R");
        const demC = getCandidate("D");
        const othC = getCandidate("O");
        document.querySelector(".leg-rep").textContent = repC ? repC.name : "Republican";
        document.querySelector(".leg-dem").textContent = demC ? demC.name : "Democrat";
        document.querySelector(".leg-oth").textContent = othC ? othC.name : "Third Party";
        // Hide third-party legend row if no significant third party this year
        document.querySelector(".leg-oth-bar").style.display =
          (othC && othC.pct >= 1.0) ? "flex" : "none";
        // Update state info panel
        if (activeStateFips) updateStateInfo(activeStateFips, data);
        // Update national scoreboard
        renderNationalScoreboard();
      }

      function aggregateState(sfips, data) {
        let rv = 0, dv = 0, ov = 0;
        Object.entries(data).forEach(([fips, d]) => {
          if (fips.startsWith(sfips)) {
            rv += d.rv; dv += d.dv; ov += d.ov;
          }
        });
        const total = rv + dv + ov;
        if (!total) return null;
        const rp = (rv / total) * 100;
        const dp = (dv / total) * 100;
        const op = (ov / total) * 100;
        let w = "R";
        if (dp >= rp && dp >= op) w = "D";
        else if (op > rp && op > dp) w = "O";
        return { w, rv, dv, ov, rp, dp, op };
      }

      /* Build vote-shape object from raw counts (for tooltip) */
      function shapeVotes(rv, dv, ov) {
        const total = rv + dv + ov;
        if (!total) return null;
        const rp = (rv / total) * 100;
        const dp = (dv / total) * 100;
        const op = (ov / total) * 100;
        let w = "R";
        if (dp >= rp && dp >= op) w = "D";
        else if (op > rp && op > dp) w = "O";
        return { w, rv, dv, ov, rp, dp, op };
      }

      /* Live county data during sim — returns {votes, reportingPct} or null */
      function liveCountyData(fips) {
        if (!simHasData()) return null;
        const cr = SIM.countyRunning && SIM.countyRunning[fips];
        if (!cr) return { votes: null, reportingPct: 0 };
        return {
          votes: shapeVotes(cr.rv, cr.dv, cr.ov),
          reportingPct: cr.pct || 0
        };
      }

      /* Live state aggregate during sim */
      function liveStateData(sfips) {
        if (!simHasData()) return null;
        const tot = SIM.stateTotals && SIM.stateTotals[sfips];
        const totalC = SIM.countiesPerState[sfips] || 0;
        if (!tot || !totalC) {
          return { votes: null, reportingPct: 0 };
        }
        const reportingPct = Math.round((tot.countiesReported / totalC) * 100);
        return {
          votes: shapeVotes(tot.rv, tot.dv, tot.ov),
          reportingPct
        };
      }

      /* True if the sim is running, has ever produced live data, or shows post-sim view.
         We check countyRunning (which is populated on every chunk) rather than only
         reportedCounties (which only fills on a county's FINAL chunk), so the moment
         the very first vote chunk comes in, hovers start showing live numbers. */
      function simHasData() {
        if (SIM.running) return true;
        if (SIM.countyRunning && Object.keys(SIM.countyRunning).length > 0) return true;
        return false;
      }

      /* Active hover tracking — lets the sim tick refresh the tooltip
         while the mouse holds still over a county or state. */
      let activeHover = null;  // { kind: "county"|"state", id, x, y }

      function refreshTooltipFromHover() {
        if (!activeHover) return;
        const fakeEvent = { clientX: activeHover.x, clientY: activeHover.y };
        const names = tooltipNames();
        if (activeHover.kind === "county") {
          const fips = activeHover.id;
          const sfips = fips.slice(0, 2);
          const cname = countyNames[fips] || "County";
          const stateName = FIPS_NAME[sfips] || "";
          const sub = `${NAME_ABBR[stateName]||stateName} · ${currentYear}`;
          if (simHasData()) {
            const live = liveCountyData(fips);
            showTooltip(fakeEvent, cname, sub, live ? live.votes : null,
                        { ...names, reportingPct: live ? live.reportingPct : 0 });
          } else {
            showTooltip(fakeEvent, cname, sub, getYearData()[fips], names);
          }
        } else if (activeHover.kind === "state") {
          const sfips = activeHover.id;
          const name = FIPS_NAME[sfips] || "Unknown";
          const abbr = NAME_ABBR[name] || "";
          if (simHasData()) {
            const live = liveStateData(sfips);
            showTooltip(fakeEvent, name, abbr, live ? live.votes : null,
                        { ...names, reportingPct: live ? live.reportingPct : 0,
                          called: !!SIM.stateCalls[sfips] });
          } else {
            const agg = aggregateState(sfips, getYearData());
            showTooltip(fakeEvent, name, abbr, agg, names);
          }
        }
      }

      function updateStateInfo(sfips, data) {
        const name = FIPS_NAME[sfips] || "";
        const repName = getCandidateName("R");
        const demName = getCandidateName("D");
        const othName = getCandidateName("O");
        const stateEV = getStateEV(sfips);
        let agg, reportingPct = null, statusLabel = "Winner";
        if (simHasData()) {
          const live = liveStateData(sfips);
          if (live) {
            agg = live.votes;
            reportingPct = live.reportingPct;
            if (SIM.stateCalls[sfips]) {
              statusLabel = "AP Called";
            } else if (reportingPct < 100) {
              statusLabel = "Leading";
            }
          }
        } else {
          agg = aggregateState(sfips, data);
        }
        if (!agg) {
          if (reportingPct != null) {
            document.querySelector(".si-name").textContent = name;
            document.querySelector(".si-rows").innerHTML = `
              <div class="si-row"><span class="si-label">Reporting</span><span class="si-val" style="color:#f0c040">${reportingPct}%</span></div>
              <div class="si-row"><span class="si-label">Status</span><span class="si-val">No votes yet</span></div>`;
            stateInfo.classList.add("visible");
          } else {
            stateInfo.classList.remove("visible");
          }
          return;
        }
        const winnerName = agg.w === "R" ? repName : agg.w === "D" ? demName : othName;
        document.querySelector(".si-name").textContent = name;
        document.querySelector(".si-rows").innerHTML = `
          ${stateEV ? `<div class="si-row"><span class="si-label">EV</span><span class="si-val" style="color:var(--accent)">${stateEV}</span></div>` : ""}
          ${reportingPct != null ? `<div class="si-row"><span class="si-label">Reporting</span><span class="si-val" style="color:#f0c040">${reportingPct}%</span></div>` : ""}
          <div class="si-row"><span class="si-label">${statusLabel}</span><span class="si-val" style="color:${agg.w==="R"?"#ff6b6b":agg.w==="D"?"#6b9fff":"#f0c040"}">${winnerName}</span></div>
          <div class="si-row"><span class="si-label">${repName}</span><span class="si-val" style="color:#ff6b6b">${pct(agg.rp)} <span class="si-count">${fmt(agg.rv)}</span></span></div>
          <div class="si-row"><span class="si-label">${demName}</span><span class="si-val" style="color:#6b9fff">${pct(agg.dp)} <span class="si-count">${fmt(agg.dv)}</span></span></div>
          ${agg.op > 0.5 ? `<div class="si-row"><span class="si-label">${othName}</span><span class="si-val" style="color:#f0c040">${pct(agg.op)} <span class="si-count">${fmt(agg.ov)}</span></span></div>` : ""}
          <div class="si-row" style="margin-top:4px"><span class="si-label">Votes${reportingPct != null && reportingPct < 100 ? " so far" : ""}</span><span class="si-val">${fmt(agg.rv+agg.dv+agg.ov)}</span></div>`;
        stateInfo.classList.add("visible");
      }

      /* ── Zoom to state ── */
      function zoomToState(feature) {
        const [[x0, y0], [x1, y1]] = path.bounds(feature);
        const scale = 0.75 / Math.max((x1-x0)/W, (y1-y0)/H);
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        svg.transition().duration(650).call(
          zoom.transform,
          d3.zoomIdentity.translate(W/2 - scale*cx, H/2 - scale*cy).scale(scale)
        );
      }

      function resetMap() {
        activeStateFips = null;
        highlightG.selectAll("*").remove();
        resetBtn.classList.remove("visible");
        stateInfo.classList.remove("visible");
        stateHitG.attr("pointer-events", "all");
        stateHitPaths.attr("pointer-events", "all");
        // Restore every state path's display (the click hides one individually)
        statePaths.attr("display", null);
        countyFills.attr("pointer-events", "none");
        svg.transition().duration(650).call(zoom.transform, d3.zoomIdentity);
      }
      resetBtn.addEventListener("click", resetMap);

      /* ── LAYER 1: All county fills (always visible, pointer-events off by default) ── */
      const countyG = mapG.append("g").attr("class", "counties");

      countyG.append("path").attr("class", "county-mesh")
        .attr("fill", "none")
        .attr("stroke", "rgba(228,232,240,0.72)")
        .attr("stroke-width", 2)
        .attr("vector-effect", "non-scaling-stroke")
        .attr("pointer-events", "none");

      const countyFills = countyG.selectAll(".county-fill")
        .data(allCounties.features).join("path")
        .attr("class", "county-fill")
        .attr("d", d => path(getMergedFeature(d, currentYear)))
        .attr("fill", "#1a2035")
        .attr("stroke", "none")
        .attr("pointer-events", "none")  // enabled per-county when state is active
        .on("mousemove", function (event, d) {
          const fips = String(d.id).padStart(5, "0");
          if (countyHidden(fips, currentYear)) return;
          activeHover = { kind: "county", id: fips, x: event.clientX, y: event.clientY };
          refreshTooltipFromHover();
          highlightG.selectAll(".county-hover").remove();
          highlightG.append("path").attr("class", "county-hover")
            .datum(d).attr("d", path(getMergedFeature(d, currentYear)))
            .attr("fill", "none").attr("stroke", "#ffffff")
            .attr("stroke-width", 0.4).attr("stroke-opacity", 0.8)
            .attr("pointer-events", "none");
        })
        .on("mouseleave", () => {
          activeHover = null;
          tooltip.classList.remove("visible");
          highlightG.selectAll(".county-hover").remove();
        });

      /* ── LAYER 2: State colour overlay — opaque in atlas mode, transparent in sim ── */
      const statesG = mapG.append("g").attr("class", "states");
      const statePaths = statesG.selectAll("path")
        .data(states.features).join("path")
        .attr("class", "state")
        .attr("d", path)
        .attr("fill", "#1a2035")
        .attr("fill-opacity", 1.0)
        .attr("pointer-events", "none");

      /* ── LAYER 3: Invisible state hit layer — always on top for state interaction ── */
      const stateHitG = mapG.append("g").attr("class", "state-hits");
      const stateHitPaths = stateHitG.selectAll("path")
        .data(states.features).join("path")
        .attr("d", path)
        .attr("fill", "transparent")
        .attr("stroke", "none")
        .on("mousemove", function (event, d) {
          const sfips = String(d.id).padStart(2, "0");
          activeHover = { kind: "state", id: sfips, x: event.clientX, y: event.clientY };
          refreshTooltipFromHover();
          highlightG.selectAll(".state-hover-ring").remove();
          highlightG.append("path").attr("class", "state-hover-ring")
            .datum(d).attr("d", path)
            .attr("fill", "none").attr("stroke", "#ffffff")
            .attr("stroke-width", 0.6).attr("stroke-opacity", 0.5)
            .attr("pointer-events", "none");
        })
        .on("mouseleave", () => {
          activeHover = null;
          tooltip.classList.remove("visible");
          highlightG.selectAll(".state-hover-ring").remove();
        })
        .on("click", function (event, d) {
          const sfips = String(d.id).padStart(2, "0");
          if (sfips === activeStateFips) return;
          activeStateFips = sfips;
          highlightG.selectAll(".state-hover-ring,.state-selected-ring").remove();
          highlightG.append("path").attr("class", "state-selected-ring")
            .datum(d).attr("d", path)
            .attr("fill", "none").attr("stroke", "#ffffff")
            .attr("stroke-width", 0.4).attr("stroke-opacity", 0.6)
            .attr("pointer-events", "none");
          // Enable county events for active state only
          countyFills.attr("pointer-events", cd =>
            String(cd.id).padStart(5,"0").startsWith(sfips) ? "all" : "none"
          );
          // Disable hit events on just this state's hit path so mouse falls through to counties
          stateHitPaths.attr("pointer-events", sd =>
            String(sd.id).padStart(2,"0") === sfips ? "none" : "all"
          );
          // Hide overlay only for the active state, keep others
          statePaths.attr("display", sd =>
            String(sd.id).padStart(2,"0") === sfips ? "none" : null
          );
          zoomToState(d);
          resetBtn.classList.add("visible");
          updateStateInfo(sfips, getYearData());
        });

      /* ── LAYER 3: State borders (on top of overlay) ── */
      mapG.append("path")
        .attr("class", "state-border")
        .datum(topojson.mesh(us, us.objects.states, (a, b) => a !== b))
        .attr("fill", "none").attr("stroke", "#4a5580").attr("stroke-width", 0.8)
        .attr("stroke-linejoin", "round").attr("d", path).attr("pointer-events", "none");

      /* ── LAYER 4: State abbreviation labels ── */
      // Per-state label nudges in screen pixels (after centroid is computed).
      // Some states have asymmetric shapes that put their natural centroid in
      // an awkward place (FL's peninsula stretches the centroid east toward
      // the Atlantic, CA's southern bulge pulls right, NJ's centroid drifts
      // west into PA), so we nudge them inland.
      const LABEL_NUDGE = {
        "12": [ 14,  10],  // Florida — east into peninsula and slightly south
        "06": [ -8,   0],  // California — move west toward the central valley
        "34": [  6,   0],  // New Jersey — move east (away from Philly)
        "23": [ -2,   4],  // Maine — bring slightly inland
        "22": [ -3,   3],  // Louisiana — pull off the coast
        "24": [  4,  -2],  // Maryland — keep label out of Chesapeake
        "53": [  0,   4],  // Washington — pull south
        "37": [  0,  -2],  // North Carolina — slight north
      };

      function largestPolygonCentroid(feature) {
        const geom = feature.geometry;
        if (!geom) return null;
        let polys = geom.type === "Polygon"
          ? [{ type:"Feature", geometry: geom }]
          : geom.coordinates.map(c => ({ type:"Feature", geometry:{ type:"Polygon", coordinates:c } }));
        let best = null, bestArea = -1;
        for (const p of polys) {
          const b = path.bounds(p);
          const area = (b[1][0]-b[0][0]) * (b[1][1]-b[0][1]);
          if (area > bestArea) { bestArea = area; best = p; }
        }
        const c = path.centroid(best);
        if (!c || isNaN(c[0])) return null;
        const sfips = String(feature.id).padStart(2, "0");
        const nudge = LABEL_NUDGE[sfips];
        if (nudge) return [c[0] + nudge[0], c[1] + nudge[1]];
        return c;
      }

      mapG.append("g").attr("class", "labels").selectAll("text")
        .data(states.features).join("text")
        .attr("class", "state-label")
        .attr("transform", d => {
          const c = largestPolygonCentroid(d);
          return c ? `translate(${c})` : "translate(-999,-999)";
        })
        .text(d => NAME_ABBR[FIPS_NAME[String(d.id).padStart(2,"0")]] || "");

      /* Redraw every path that depends on the projection.  Called when we switch
         between atlas and sim layouts (which use different fit extents). */
      function redrawAllPaths() {
        // Reset zoom so the new fit takes effect cleanly
        svg.call(zoom.transform, d3.zoomIdentity);
        mapG.select(".graticule").attr("d", path(grat()));
        countyG.selectAll(".county-fill")
          .attr("d", d => path(getMergedFeature(d, currentYear)));
        countyG.select(".county-mesh").attr("d", () => {
          const mesh = topojson.mesh(countiesTopo, countiesTopo.objects.counties, (a, b) => {
            if (a === b) return false;
            const fa = String(a.id).padStart(5, "0");
            const fb = String(b.id).padStart(5, "0");
            if (countyHidden(fa, currentYear) || countyHidden(fb, currentYear)) return false;
            return true;
          });
          return path(mesh);
        });
        statePaths.attr("d", path);
        stateHitPaths.attr("d", path);
        mapG.select(".state-border").attr("d", path);
        mapG.selectAll(".state-label").attr("transform", d => {
          const c = largestPolygonCentroid(d);
          return c ? `translate(${c})` : "translate(-999,-999)";
        });
      }

      /* ═══════════════════════════════════════════════════════════════
         ELECTION NIGHT SIMULATOR
         ═══════════════════════════════════════════════════════════════ */
      const SIM = {
        running: false,
        paused: false,
        speed: 1/60,          // sim hours per real second (1 min sim = 1 sec real)
        clockHours: 18.5,     // simulated ET hour (start before earliest poll close)
        startedAt: null,
        rafId: null,
        reportedCounties: new Set(),
        stateCalls: {},       // sfips -> "D"|"R"|"O"
        stateTotals: {},      // sfips -> {dv, rv, ov, countiesReported, countiesTotal}
        countiesPerState: {}, // sfips -> total county count for this year
        countySchedule: [],   // [{fips, reportAt, fraction, ...}], sorted by reportAt
        countyRunning: {},    // fips -> {dv, rv, ov, pct} running tally per county
        nextCountyIdx: 0,
        finalDV: 0, finalRV: 0, finalOV: 0,   // running tally of reported popular vote
        winnerDeclared: null, // "D"|"R"|"O" once 270 reached
        callBannerTimer: null,
        // Shift simulator: when active, the sim runs against a fictional
        // alternate-reality dataset where one candidate has a national swing.
        shift: null,          // null = historical, otherwise {target,sigma,nationalShift}
        shiftedData: null,    // fips -> {rv,dv,ov,...} alternate-reality county data
      };

      const simBoard = document.getElementById("sim-board");
      const simCalls = document.getElementById("sim-calls");
      const simConfig = document.getElementById("sim-config");

      /* Standard-normal sample via Box–Muller.  Used to model the swing:
         small values likely, large values possible but rare. */
      function gaussian() {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      }

      /* The current dataset the sim should treat as "ground truth" — either
         the real historical results or our shifted alternate-reality version. */
      function getSimSourceData() {
        return SIM.shiftedData || getYearData();
      }

      /* Build an alternate-reality dataset by applying a national swing toward
         `target` (D, R or O) with magnitude drawn from |N(0, sigma)|, plus
         per-county jitter so different counties shift slightly differently
         around the national mean.  Returns a NEW data object — the original
         atlas data is never mutated. */
      function buildShiftedData(target, sigma) {
        const src = getYearData();
        // National swing: |N(0, sigma)|, clamped so we don't get absurd 60-pt
        // shifts on the rare extreme draw.  Capped at 3 sigma.
        const cap = sigma * 3;
        let nationalShift = Math.abs(gaussian()) * sigma;
        if (nationalShift > cap) nationalShift = cap;

        // Per-county jitter sigma — small fraction of the national sigma, so
        // most counties move with the national swing but each gets its own
        // local wobble.
        const jitterSigma = Math.max(0.5, sigma * 0.35);

        const out = {};
        Object.keys(src).forEach(fips => {
          const d = src[fips];
          const total = (d.rv || 0) + (d.dv || 0) + (d.ov || 0);
          if (!total) { out[fips] = { ...d }; return; }

          // Current shares (percentage points).
          let rp = (d.rv || 0) / total * 100;
          let dp = (d.dv || 0) / total * 100;
          let op = (d.ov || 0) / total * 100;

          // Local swing for this county: national mean plus a gaussian wobble.
          // Clamp to a sensible range so a 1-in-1000 draw doesn't flip a
          // county by 40 points.
          let localShift = nationalShift + gaussian() * jitterSigma;
          if (localShift < 0) localShift = 0;     // shift toward target is non-negative
          if (localShift > cap * 1.3) localShift = cap * 1.3;

          // The target gains `localShift` points.  The loss is split across
          // the other two candidates in proportion to their current shares,
          // so a county where the "loser" is already near 0 doesn't get
          // pushed negative.
          let dShare = dp, rShare = rp, oShare = op;
          if (target === "D") {
            const others = rp + op;
            // Cap the shift so we don't drain more than the others have.
            const eff = Math.min(localShift, others);
            dShare = dp + eff;
            rShare = others > 0 ? rp - eff * (rp / others) : rp;
            oShare = others > 0 ? op - eff * (op / others) : op;
          } else if (target === "R") {
            const others = dp + op;
            const eff = Math.min(localShift, others);
            rShare = rp + eff;
            dShare = others > 0 ? dp - eff * (dp / others) : dp;
            oShare = others > 0 ? op - eff * (op / others) : op;
          } else if (target === "O") {
            const others = rp + dp;
            const eff = Math.min(localShift, others);
            oShare = op + eff;
            rShare = others > 0 ? rp - eff * (rp / others) : rp;
            dShare = others > 0 ? dp - eff * (dp / others) : dp;
          }

          // Independent small jitter on each candidate's share (the wobble
          // the user asked for, applied even to the non-target candidates so
          // the county doesn't look unnaturally smooth).
          dShare += gaussian() * 0.6;
          rShare += gaussian() * 0.6;
          oShare += gaussian() * 0.4;

          // Clamp negatives and renormalize so shares sum to 100.
          if (dShare < 0) dShare = 0;
          if (rShare < 0) rShare = 0;
          if (oShare < 0) oShare = 0;
          const sShare = dShare + rShare + oShare;
          if (sShare > 0) {
            dShare = dShare / sShare * 100;
            rShare = rShare / sShare * 100;
            oShare = oShare / sShare * 100;
          }

          // Convert shares back to vote counts (county turnout unchanged).
          const newDV = Math.round(total * dShare / 100);
          const newRV = Math.round(total * rShare / 100);
          const newOV = Math.max(0, total - newDV - newRV);  // absorb rounding
          let w = "R";
          if (newDV >= newRV && newDV >= newOV) w = "D";
          else if (newOV > newDV && newOV > newRV) w = "O";
          const t = newDV + newRV + newOV;
          out[fips] = {
            w,
            rv: newRV, dv: newDV, ov: newOV,
            rp: t ? newRV / t * 100 : 0,
            dp: t ? newDV / t * 100 : 0,
            op: t ? newOV / t * 100 : 0
          };
        });

        return { data: out, nationalShift };
      }

      /* Build the county reveal schedule for the current year.
         Each county reports in multiple chunks (3-7), simulating precincts
         trickling in over the night. Each chunk reports a fraction of the
         county's total votes. */
      function buildCountySchedule() {
        // Use shifted alternate-reality data if a shift is active, else
        // the real historical county results.
        const data = getSimSourceData();
        const chunks = [];
        SIM.countiesPerState = {};

        Object.keys(data).forEach(fips => {
          const sf = fips.slice(0, 2);
          if (countyHidden(fips, currentYear)) return;
          SIM.countiesPerState[sf] = (SIM.countiesPerState[sf] || 0) + 1;

          const closeTime = POLL_CLOSE_ET[sf] || 21.0;
          const d = data[fips];
          // Number of chunks per county varies: small counties report in 2-3,
          // large in 5-8. Use total vote count as proxy for size.
          const totalVotes = (d.dv || 0) + (d.rv || 0) + (d.ov || 0);
          const isLarge = totalVotes > 50000;
          const nChunks = isLarge
            ? 4 + Math.floor(Math.random() * 4)   // 4-7
            : 2 + Math.floor(Math.random() * 3);  // 2-4

          // Per-county chunking:
          //   1. `fractions[i]` = what % of the county's TOTAL VOTES are in chunk i.
          //      These sum to 1.
          //   2. `dWeights[i]`, `rWeights[i]`, `oWeights[i]` = each candidate's
          //      INDIVIDUAL fraction in chunk i.  These also sum to 1 per
          //      candidate, but they're INDEPENDENT random draws.
          //   This makes early chunks unrepresentative — one chunk might have
          //   80% R / 20% D of its size while another is 40/60 — but the totals
          //   converge to the true county result by 100%.
          const breaks = [];
          for (let i = 0; i < nChunks - 1; i++) breaks.push(Math.random());
          breaks.sort((a, b) => a - b);
          const fractions = [];
          let prev = 0;
          for (const b of breaks) { fractions.push(b - prev); prev = b; }
          fractions.push(1 - prev);

          // Build per-candidate weights (random, biased by chunk size, summing
          // to 1 per candidate).  Use the chunk fraction as the mean and add
          // multiplicative noise so chunks differ from each other.
          function buildWeights() {
            const raw = fractions.map(f => f * (0.4 + Math.random() * 1.2));
            const sum = raw.reduce((a, b) => a + b, 0) || 1;
            return raw.map(r => r / sum);
          }
          const dWeights = buildWeights();
          const rWeights = buildWeights();
          const oWeights = buildWeights();

          // First chunk time: 15min to ~2h after poll close (bias early)
          // Each subsequent chunk: 10-45 min later, with long tail
          let t = closeTime + 0.25 + Math.pow(Math.random(), 1.8) * 1.75;
          let cumPct = 0;
          fractions.forEach((frac, idx) => {
            cumPct += frac;
            chunks.push({
              fips, sfips: sf, reportAt: t,
              fraction: frac,
              dWeight: dWeights[idx],
              rWeight: rWeights[idx],
              oWeight: oWeights[idx],
              cumulative: cumPct,
              isFinal: idx === fractions.length - 1
            });
            // Next chunk delay: 10-50 minutes, with longer gaps later in the night
            const gap = (10 + Math.random() * 40 + idx * 8) / 60;  // hours
            t += gap;
          });
        });

        chunks.sort((a, b) => a.reportAt - b.reportAt);
        SIM.countySchedule = chunks;
        SIM.nextCountyIdx = 0;

        // Track per-county totals so paint reflects margin so far
        SIM.countyRunning = {};
      }

      function renderSimBoard() {
        if (!simBoard.classList.contains("visible")) return;
        let dEV = 0, rEV = 0, oEV = 0;
        Object.entries(SIM.stateCalls).forEach(([sf, w]) => {
          const ev = getStateEV(sf);
          if (w === "D") dEV += ev;
          else if (w === "R") rEV += ev;
          else oEV += ev;
        });
        const totalEV = totalEVForYear();
        const pvTotal = SIM.finalDV + SIM.finalRV + SIM.finalOV;
        const dPV = pvTotal ? (SIM.finalDV / pvTotal * 100) : 0;
        const rPV = pvTotal ? (SIM.finalRV / pvTotal * 100) : 0;

        const demName = getCandidateName("D");
        const repName = getCandidateName("R");
        const othName = getCandidateName("O");
        const half = Math.floor(totalEV / 2) + 1;

        simBoard.querySelector(".sim-clock").textContent = fmtClock(SIM.clockHours);
        // Shift tag — visible whenever an alternate scenario is running.
        // Random scenarios mark the shift as `secret` so we don't reveal
        // direction or magnitude; we still show a neutral "shift active"
        // pill so the viewer knows it isn't the historical result.
        const shiftTag = simBoard.querySelector(".sim-shift-tag");
        if (shiftTag) {
          if (SIM.shift) {
            shiftTag.style.display = "";
            if (SIM.shift.secret) {
              shiftTag.textContent = "Random shift";
            } else {
              const tName = getCandidateName(SIM.shift.target) || SIM.shift.target;
              shiftTag.textContent = `Shift +${SIM.shift.nationalShift.toFixed(1)} → ${tName}`;
            }
          } else {
            shiftTag.style.display = "none";
            shiftTag.textContent = "";
          }
        }
        simBoard.querySelector(".sim-cand-dem .sim-name").textContent = demName;
        simBoard.querySelector(".sim-cand-rep .sim-name").textContent = repName;
        simBoard.querySelector(".sim-cand-dem .sim-ev").textContent = dEV;
        simBoard.querySelector(".sim-cand-rep .sim-ev").textContent = rEV;
        simBoard.querySelector(".sim-cand-dem .sim-pv").textContent =
          `${pct(dPV)} · ${fmt(SIM.finalDV)}`;
        simBoard.querySelector(".sim-cand-rep .sim-pv").textContent =
          `${pct(rPV)} · ${fmt(SIM.finalRV)}`;
        simBoard.querySelector(".sim-bar-dem").style.width = (dEV / totalEV * 100) + "%";
        simBoard.querySelector(".sim-bar-rep").style.width = (rEV / totalEV * 100) + "%";
        simBoard.querySelector(".sim-bar-oth").style.width = (oEV / totalEV * 100) + "%";
        simBoard.querySelector(".sim-threshold-line").style.left = (half / totalEV * 100) + "%";
        simBoard.querySelector(".sim-270-num").textContent = half;

        // Show Other pill only when an Other candidate has electoral votes
        const othPill = simBoard.querySelector(".sim-cand-oth");
        if (oEV > 0) {
          othPill.style.display = "flex";
          simBoard.querySelector(".sim-oth-name").textContent = othName;
          simBoard.querySelector(".sim-oth-ev").textContent = oEV;
        } else {
          othPill.style.display = "none";
        }

        const totalCounties = SIM.countySchedule.length
          ? new Set(SIM.countySchedule.map(c => c.fips)).size : 0;
        const reportedPct = totalCounties ? (SIM.reportedCounties.size / totalCounties * 100) : 0;
        // Count uncalled EVs (states with data but no AP call)
        let uncalledEV = 0;
        Object.keys(SIM.countiesPerState).forEach(sf => {
          if (!SIM.stateCalls[sf]) uncalledEV += getStateEV(sf);
        });
        let leadText;
        if (SIM.winnerDeclared) {
          const winnerName = SIM.winnerDeclared === "D" ? demName :
                             SIM.winnerDeclared === "R" ? repName : othName;
          leadText = `★ ${winnerName} elected ★`;
        } else if (reportedPct >= 99 && uncalledEV > 0) {
          // Sim has effectively finished but some states are too close to call
          leadText = `${uncalledEV} EV too close to call`;
        } else if (dEV === rEV) {
          leadText = "Race tied";
        } else {
          const leadName = dEV > rEV ? demName : repName;
          const leadDiff = Math.abs(dEV - rEV);
          leadText = `${leadName} leads by ${leadDiff} EV`;
        }
        simBoard.querySelector(".sim-reporting").textContent =
          `${reportedPct.toFixed(0)}% reporting · ${fmt(SIM.reportedCounties.size)}/${fmt(totalCounties)} counties`;
        simBoard.querySelector(".sim-leader").textContent = leadText;
      }

      function addCallToFeed(sfips, winner) {
        const stateName = FIPS_NAME[sfips] || sfips;
        const ev = getStateEV(sfips);
        const list = simCalls.querySelector(".calls-list");
        const row = document.createElement("div");
        row.className = "call-row";
        row.innerHTML = `
          <span class="call-dot ${winner}"></span>
          <span class="call-state">${stateName}</span>
          <span class="call-ev">${ev} EV</span>`;
        list.insertBefore(row, list.firstChild);
      }

      /* Track which candidate has been declared winner (majority of EVs reached). */
      function checkWinner() {
        if (SIM.winnerDeclared) return;
        let dEV = 0, rEV = 0, oEV = 0;
        Object.entries(SIM.stateCalls).forEach(([sf, w]) => {
          const ev = getStateEV(sf);
          if (w === "D") dEV += ev;
          else if (w === "R") rEV += ev;
          else oEV += ev;
        });
        const totalEV = totalEVForYear();
        const half = Math.floor(totalEV / 2) + 1;
        let winner = null, winEV = 0;
        if (dEV >= half) { winner = "D"; winEV = dEV; }
        else if (rEV >= half) { winner = "R"; winEV = rEV; }
        else if (oEV >= half) { winner = "O"; winEV = oEV; }
        if (winner) {
          SIM.winnerDeclared = winner;
          showWinnerBanner(winner, winEV);
        }
      }

      function showCallBanner(sfips, winner) {
        const banner = document.getElementById("call-banner");
        const stateName = FIPS_NAME[sfips] || sfips;
        // Use the actual candidate's name for this year (same for all states)
        const candName = getCandidateName(winner);

        banner.classList.remove("D", "R", "O", "show", "retract");
        // Restore standard labels in case the previous banner shown was a retraction
        banner.querySelector(".cb-label").textContent = "★ AP RACE CALL ★";
        banner.querySelector(".cb-for").textContent = "PROJECTED WINNER";
        banner.querySelector(".cb-state").textContent = stateName;
        banner.querySelector(".cb-party").textContent = candName.toUpperCase();
        void banner.offsetWidth;
        banner.classList.add(winner, "show");
        clearTimeout(SIM.callBannerTimer);
        SIM.callBannerTimer = setTimeout(() => {
          banner.classList.remove("show");
        }, 1800);
      }

      function showWinnerBanner(winner, ev) {
        const banner = document.getElementById("winner-banner");
        const candName = getCandidateName(winner);
        banner.classList.remove("D", "R", "O");
        banner.classList.add(winner);
        banner.querySelector(".wb-party").textContent = candName.toUpperCase();
        banner.querySelector(".wb-ev").textContent = `${ev} ELECTORAL VOTES`;
        banner.querySelector(".wb-year").textContent = currentYear;
        banner.classList.add("show");
      }

      /* Helper: paint a state overlay to reflect a call (or uncall). */
      function paintStateCall(sfips, winner) {
        const sel = statePaths.filter(d => String(d.id).padStart(2,"0") === sfips);
        if (winner === null) {
          // Uncalled — back to dim margin tint
          sel.classed("state-called", false)
             .classed("state-just-called", false)
             .classed("state-overlay-dim", true);
        } else {
          sel.classed("state-overlay-dim", false)
             .classed("state-called", true)
             .attr("fill", winner === "D" ? "#2f6bb5" : winner === "R" ? "#c33a3a" : "#ab7d12")
             .classed("state-just-called", true);
          setTimeout(() => {
            statePaths.filter(d => String(d.id).padStart(2,"0") === sfips)
              .classed("state-just-called", false);
          }, 1500);
        }
      }

      /* Recall a state that was prematurely called — like the famous 2000 Florida
         flip from Gore back to "too close to call".  Removes from the AP feed,
         repaints to dim, and surfaces a "RACE CALL RETRACTED" banner. */
      function uncallState(sfips) {
        const prevWinner = SIM.stateCalls[sfips];
        if (!prevWinner) return;
        delete SIM.stateCalls[sfips];

        // Repaint overlay back to running-margin tint (dim)
        paintStateCall(sfips, null);
        // Repaint with the current running-margin tint
        const st = SIM.stateTotals[sfips];
        if (st) {
          const stot = st.dv + st.rv + st.ov;
          if (stot > 0) {
            const srp = st.rv / stot * 100;
            const sdp = st.dv / stot * 100;
            const sop = st.ov / stot * 100;
            let sw = "R";
            if (sdp >= srp && sdp >= sop) sw = "D";
            else if (sop > srp && sop > sdp) sw = "O";
            statePaths.filter(d => String(d.id).padStart(2,"0") === sfips)
              .attr("fill", stateColour({ w: sw, rp: srp, dp: sdp, op: sop }));
          }
        }

        // Add retraction to feed
        const stateName = FIPS_NAME[sfips] || sfips;
        const list = simCalls.querySelector(".calls-list");
        const row = document.createElement("div");
        row.className = "call-row call-retracted";
        row.innerHTML = `
          <span class="call-dot retracted">↺</span>
          <span class="call-state">${stateName} <em style="color:#888;font-style:normal;font-size:0.9em">retracted</em></span>
          <span class="call-ev"></span>`;
        list.insertBefore(row, list.firstChild);

        // Banner: "RACE CALL RETRACTED"
        showRetractionBanner(sfips, prevWinner);

        // If we'd already declared a winner that depended on this state, revoke.
        if (SIM.winnerDeclared) {
          // Recompute totals after the uncall
          let dEV = 0, rEV = 0, oEV = 0;
          Object.entries(SIM.stateCalls).forEach(([sf, w]) => {
            const ev = getStateEV(sf);
            if (w === "D") dEV += ev;
            else if (w === "R") rEV += ev;
            else oEV += ev;
          });
          const totalEV = totalEVForYear();
          const half = Math.floor(totalEV / 2) + 1;
          const decl = SIM.winnerDeclared;
          const stillWinning = (decl === "D" && dEV >= half)
                            || (decl === "R" && rEV >= half)
                            || (decl === "O" && oEV >= half);
          if (!stillWinning) {
            SIM.winnerDeclared = null;
            document.getElementById("winner-banner").classList.remove("show");
          }
        }
      }

      function showRetractionBanner(sfips, prevWinner) {
        const banner = document.getElementById("call-banner");
        const stateName = FIPS_NAME[sfips] || sfips;
        banner.classList.remove("D", "R", "O", "show", "retract");
        banner.querySelector(".cb-label").textContent = "↺ RACE CALL RETRACTED ↺";
        banner.querySelector(".cb-state").textContent = stateName;
        banner.querySelector(".cb-for").textContent = "TOO CLOSE TO CALL";
        banner.querySelector(".cb-party").textContent = "";
        void banner.offsetWidth;
        banner.classList.add("retract", "show");
        clearTimeout(SIM.callBannerTimer);
        SIM.callBannerTimer = setTimeout(() => {
          banner.classList.remove("show");
          // Restore the regular call-banner labels for the next call
          banner.querySelector(".cb-label").textContent = "★ AP RACE CALL ★";
          banner.querySelector(".cb-for").textContent = "PROJECTED WINNER";
        }, 2400);
      }

      /* Exit-poll-driven calls.  In real elections, networks call states the
         INSTANT polls close when exit polls indicate a blowout — 2008 OR/WA/CA
         called at 11 PM the second polls closed on those states, because the
         margin was known from exit data to be 15%+.  We simulate this by using
         each state's known final result and calling at poll close if the
         margin is wide enough that exit polls would have nailed it. */
      function tryExitPollCalls() {
        const yearMeta = getYearMeta();
        Object.keys(SIM.stateFinals || {}).forEach(sfips => {
          if (SIM.stateCalls[sfips]) return;  // already called
          const closeTime = POLL_CLOSE_ET[sfips];
          if (closeTime == null) return;
          // Allow a small "exit poll prep" window after close — 2-3 minutes.
          // (Our simulated minute = ~1 second of real time, so this looks instant.)
          if (SIM.clockHours < closeTime + 0.03) return;
          const final = SIM.stateFinals[sfips];
          if (!final) return;
          const fmargin = Math.abs(final.rp - final.dp);
          // Exit poll calls: ONLY for genuine blowouts (25+ point final margin).
          // 15-25% states might have a believable upset, so we wait for votes.
          let callAfter = null;  // hours after poll close when exit poll fires
          if (fmargin >= 25) callAfter = 0.02;     // ~1 sim minute - instant call
          if (callAfter == null) return;
          if (SIM.clockHours < closeTime + callAfter) return;
          // Call for the actual winner.
          const winner = final.w;
          SIM.stateCalls[sfips] = winner;
          addCallToFeed(sfips, winner);
          showCallBanner(sfips, winner);
          paintStateCall(sfips, winner);
          checkWinner();
        });
      }

      /* Decide whether to "call" a state — needs > threshold reporting + clear margin.
         Also handles recalls: if a state was previously called but the current
         running margin now favours the other candidate convincingly, retract the
         call so the running totals can correct. */
      function tryCallState(sfips) {
        const tot = SIM.stateTotals[sfips];
        if (!tot) return;
        const totalC = SIM.countiesPerState[sfips] || 1;
        const reported = tot.countiesReported / totalC;
        const totalVotes = tot.dv + tot.rv + tot.ov;
        if (!totalVotes) return;
        const dp = tot.dv / totalVotes;
        const rp = tot.rv / totalVotes;
        const op = tot.ov / totalVotes;
        const margin = Math.abs(dp - rp);
        const currentLeader = dp >= rp && dp >= op ? "D" : (rp >= op ? "R" : "O");

        // If already called, see if we need to RECALL.
        // VERY conservative — retractions are disruptive, so we only fire
        // them when the data strongly indicates the call was wrong.
        // EXCEPTION: at 100% reporting, lock in the actual winner.
        const existingCall = SIM.stateCalls[sfips];
        if (existingCall) {
          // At 100% reporting, lock in the actual winner.
          if (reported >= 0.999) {
            if (currentLeader !== existingCall) {
              uncallState(sfips);
              // Fall through and call for the true leader below.
            } else {
              return;
            }
          } else if (currentLeader !== existingCall) {
            // Mid-night flip — require a SUBSTANTIAL (>2%) new lead AND
            // significant additional reporting before retracting.  This stops
            // noise-induced flips (Washington at 50% reporting, etc.) while
            // still catching genuine errors like FL 2000.
            const leaderMargin = currentLeader === "D" ? dp - Math.max(rp, op)
                              :  currentLeader === "R" ? rp - Math.max(dp, op)
                                                       : op - Math.max(dp, rp);
            if (leaderMargin > 0.02 && reported > 0.60) {
              uncallState(sfips);
              return;
            }
            return;
          } else {
            // Called candidate still leads.  Has their margin collapsed
            // into pure-toss-up territory?
            const calledMargin = existingCall === "D" ? dp - Math.max(rp, op)
                              :  existingCall === "R" ? rp - Math.max(dp, op)
                                                      : op - Math.max(dp, rp);
            if (calledMargin < 0.002 && reported > 0.75) {
              uncallState(sfips);
              return;
            }
            return;
          }
        }

        // Call thresholds based on RUNNING margin.
        // CRITICAL: every potential call is validated against the known final
        // winner (SIM.stateFinals[sfips].w).  If the running data would call
        // for the WRONG candidate, we skip the call — early chunks are often
        // unrepresentative and shouldn't trigger a call that we'd have to
        // retract.  This eliminates noise-driven wrong calls.
        let canCall = false;
        let winner = null;
        if (margin > 0.25 && reported > 0.02) {
          canCall = true; winner = dp > rp ? "D" : "R";
        } else if (margin > 0.15 && reported > 0.05) {
          canCall = true; winner = dp > rp ? "D" : "R";
        } else if (op > dp && op > rp && reported > 0.5 && Math.abs(op - Math.max(dp,rp)) > 0.10) {
          canCall = true; winner = "O";
        } else if (margin > 0.10 && reported > 0.15) {
          canCall = true; winner = dp > rp ? "D" : "R";
        } else if (margin > 0.05 && reported > 0.50) {
          canCall = true; winner = dp > rp ? "D" : "R";
        } else if (margin > 0.025 && reported > 0.85) {
          canCall = true; winner = dp > rp ? "D" : "R";
        } else if (margin > 0.01 && reported > 0.95) {
          canCall = true; winner = dp > rp ? "D" : "R";
        } else if (reported >= 0.999 && margin >= 0.0005) {
          // 100% in: call for whoever won unless it's Florida-2000-tight.
          canCall = true; winner = currentLeader;
        }

        // Sanity-check against the known final winner.  If running data points
        // the wrong way, the early returns are unrepresentative — wait for more.
        // Only bypass this check at >=99.9% reporting (where running == final).
        if (canCall && winner && reported < 0.999) {
          const final = SIM.stateFinals && SIM.stateFinals[sfips];
          if (final && winner !== final.w) {
            // Running data is misleading.  Don't call — wait for more chunks.
            return;
          }
        }

        if (canCall && winner) {
          SIM.stateCalls[sfips] = winner;
          addCallToFeed(sfips, winner);
          showCallBanner(sfips, winner);
          paintStateCall(sfips, winner);
          checkWinner();
        }
      }

      function revealChunk(chunk) {
        const { fips, sfips, fraction, dWeight, rWeight, oWeight, isFinal } = chunk;
        // Use shifted data if a shift is active, else real historical results.
        const data = getSimSourceData()[fips];
        if (!data) return;

        // Per-candidate weights make each chunk a non-uniform sample of the
        // county's eventual total.  Falls back to proportional split if weights
        // are missing (e.g. legacy schedule).
        const dW = dWeight != null ? dWeight : fraction;
        const rW = rWeight != null ? rWeight : fraction;
        const oW = oWeight != null ? oWeight : fraction;
        let ddv = Math.round((data.dv || 0) * dW);
        let drv = Math.round((data.rv || 0) * rW);
        let dov = Math.round((data.ov || 0) * oW);

        // On the final chunk, snap to true totals so rounding errors don't
        // leave a stray vote or two off the actual result.
        if (isFinal && SIM.countyRunning[fips]) {
          const cur = SIM.countyRunning[fips];
          ddv = (data.dv || 0) - cur.dv;
          drv = (data.rv || 0) - cur.rv;
          dov = (data.ov || 0) - cur.ov;
        }

        if (!SIM.countyRunning[fips]) {
          SIM.countyRunning[fips] = { dv: 0, rv: 0, ov: 0, pct: 0 };
        }
        const cr = SIM.countyRunning[fips];
        cr.dv += ddv; cr.rv += drv; cr.ov += dov;
        cr.pct = Math.min(100, Math.round(chunk.cumulative * 100));

        if (!SIM.stateTotals[sfips]) {
          SIM.stateTotals[sfips] = { dv: 0, rv: 0, ov: 0, countiesReported: 0 };
        }
        SIM.stateTotals[sfips].dv += ddv;
        SIM.stateTotals[sfips].rv += drv;
        SIM.stateTotals[sfips].ov += dov;
        if (isFinal) {
          SIM.stateTotals[sfips].countiesReported += 1;
          SIM.reportedCounties.add(fips);
        }
        SIM.finalDV += ddv;
        SIM.finalRV += drv;
        SIM.finalOV += dov;

        // Paint county based on CURRENT running margin (color may shift as more comes in)
        const total = cr.dv + cr.rv + cr.ov;
        if (total > 0) {
          const rp = cr.rv / total * 100;
          const dp = cr.dv / total * 100;
          const op = cr.ov / total * 100;
          let w = "R";
          if (dp >= rp && dp >= op) w = "D";
          else if (op > rp && op > dp) w = "O";
          const runningResult = { w, rp, dp, op };

          // Fade color in based on how much of county has reported (partial = lighter)
          const intensity = Math.min(1, chunk.cumulative);
          const baseColor = countyColour(runningResult);

          countyG.selectAll(".county-fill")
            .filter(d => String(d.id).padStart(5, "0") === fips)
            .attr("data-reported", "1")
            .transition().duration(180)
            .attr("fill", baseColor)
            .attr("fill-opacity", 0.35 + intensity * 0.65);
        }

        // Paint the state overlay with its running margin tint (only if not called yet —
        // once called, the call colour stays put).
        if (!SIM.stateCalls[sfips]) {
          const st = SIM.stateTotals[sfips];
          const stotal = st.dv + st.rv + st.ov;
          if (stotal > 0) {
            const srp = st.rv / stotal * 100;
            const sdp = st.dv / stotal * 100;
            const sop = st.ov / stotal * 100;
            let sw = "R";
            if (sdp >= srp && sdp >= sop) sw = "D";
            else if (sop > srp && sop > sdp) sw = "O";
            const stateRunning = { w: sw, rp: srp, dp: sdp, op: sop };
            statePaths
              .filter(d => String(d.id).padStart(2,"0") === sfips)
              .attr("fill", stateColour(stateRunning));
          }
        }

        tryCallState(sfips);
      }

      function tickSim() {
        if (!SIM.running || SIM.paused) return;
        const now = performance.now();
        const dt = (now - SIM.lastTick) / 1000;
        SIM.lastTick = now;
        SIM.clockHours += dt * SIM.speed;

        // Reveal all chunks whose reportAt has been reached
        while (SIM.nextCountyIdx < SIM.countySchedule.length) {
          const next = SIM.countySchedule[SIM.nextCountyIdx];
          if (next.reportAt > SIM.clockHours) break;
          revealChunk(next);
          SIM.nextCountyIdx++;
        }

        // Exit-poll-driven calls: huge predictable margins (15%+) get called
        // at or shortly after poll close, even without any votes reported.
        tryExitPollCalls();

        // Re-check all states for calls (margins shift as more chunks come in)
        Object.keys(SIM.stateTotals).forEach(tryCallState);

        renderSimBoard();

        // Refresh the selected state's info panel with live numbers
        if (activeStateFips) updateStateInfo(activeStateFips, getYearData());
        // Refresh the tooltip if the user is hovering over a county/state
        refreshTooltipFromHover();

        // Done?
        if (SIM.nextCountyIdx >= SIM.countySchedule.length) {
          Object.keys(SIM.stateTotals).forEach(tryCallState);
          stopSim(true);
          return;
        }

        SIM.rafId = requestAnimationFrame(tickSim);
      }

      function startSim() {
        if (SIM.running) return;
        // Reset state
        SIM.running = true;
        SIM.paused = false;
        SIM.clockHours = 18.5;
        SIM.reportedCounties = new Set();
        SIM.stateCalls = {};
        SIM.stateTotals = {};
        SIM.countyRunning = {};
        SIM.finalDV = 0; SIM.finalRV = 0; SIM.finalOV = 0;
        SIM.nextCountyIdx = 0;
        SIM.winnerDeclared = null;
        SIM.lastTick = performance.now();
        SIM.stateFinals = {};

        // Read shift config from the UI.  "historical" (default) leaves
        // SIM.shift/shiftedData null so the sim runs against true history.
        // Other selections draw a national swing.  "random" picks the target
        // for the user; "fully_random" picks both target AND magnitude.
        // Both random modes mark the shift `secret` so the on-screen tag is
        // hidden — viewers shouldn't know how the deck was stacked.
        const shiftSel = document.getElementById("sim-shift-target");
        const sigmaSel = document.getElementById("sim-shift-sigma");
        let target = shiftSel ? shiftSel.value : "historical";
        let sigma = sigmaSel ? +sigmaSel.value : 0;
        let secret = false;
        if (target === "random") {
          // User chose a magnitude; we only pick the direction.
          const roll = Math.random();
          target = roll < 0.45 ? "D" : roll < 0.90 ? "R" : "O";
          secret = true;
        } else if (target === "fully_random") {
          // Pick BOTH direction and magnitude.  Magnitude is drawn from a
          // half-normal so most fully-random nights are mild, but a wave
          // election is always on the table.  σ_meta=5 → typical sigma ~4,
          // capped at 15 to stay sane.
          const roll = Math.random();
          target = roll < 0.45 ? "D" : roll < 0.90 ? "R" : "O";
          sigma = Math.min(15, Math.abs(gaussian()) * 5);
          secret = true;
        }
        if (target === "historical" || !sigma) {
          SIM.shift = null;
          SIM.shiftedData = null;
        } else {
          const { data, nationalShift } = buildShiftedData(target, sigma);
          SIM.shiftedData = data;
          SIM.shift = { target, sigma, nationalShift, secret };
        }

        // Hide any leftover banners
        document.getElementById("winner-banner").classList.remove("show");
        document.getElementById("call-banner").classList.remove("show");

        // Switch to sim layout: refit projection (pushes map down to avoid
        // overlap with the centered top scoreboard) and redraw all paths.
        fitProjection("sim");
        redrawAllPaths();

        // Reset county fills to a clearly-visible neutral grey, so the
        // whole US outline is readable before any votes come in.
        countyG.selectAll(".county-fill")
          .attr("data-reported", "0")
          .attr("fill", "#3d4a6a");
        // Dim state overlays - keep slight tint.  Clear any leftover .state-called.
        statePaths
          .classed("state-called", false)
          .classed("state-just-called", false)
          .classed("state-overlay-dim", true)
          .attr("fill", "#1a2035")
          .attr("fill-opacity", 0.25);
        container.classList.add("sim-active");

        // Clear calls list
        simCalls.querySelector(".calls-list").innerHTML = "";

        // Build schedule for current year
        buildCountySchedule();

        // Pre-compute each state's FINAL result for exit-poll-driven calls
        // (huge predictable margins get called at poll close, no votes needed).
        // If a shift is active, this uses the alternate-reality data so calls
        // are validated against the shifted outcome, not the historical one.
        const yearData = getSimSourceData();
        Object.keys(SIM.countiesPerState || {}).forEach(sf => {
          const agg = aggregateState(sf, yearData);
          if (agg) SIM.stateFinals[sf] = agg;
        });

        // Hide config, show board
        simConfig.classList.remove("visible");
        simBoard.classList.add("visible");
        simCalls.classList.add("visible");
        // Hide the static national scoreboard so it doesn't spoil the sim
        const ns = document.getElementById("national-scoreboard");
        if (ns) ns.classList.add("hidden");
        simBtn.classList.add("running");
        simBtn.querySelector(".sim-label").textContent = "Stop";
        // Show the pause button
        const pauseBtn = document.getElementById("sim-pause-btn");
        if (pauseBtn) {
          pauseBtn.style.display = "";
          pauseBtn.classList.remove("paused");
          pauseBtn.textContent = "⏸ Pause";
        }

        renderSimBoard();
        SIM.rafId = requestAnimationFrame(tickSim);
      }

      function stopSim(natural) {
        SIM.running = false;
        SIM.paused = false;
        if (SIM.rafId) { cancelAnimationFrame(SIM.rafId); SIM.rafId = null; }
        container.classList.remove("sim-active");
        statePaths
          .classed("state-overlay-dim", false)
          .classed("state-called", false);
        // Switch back to atlas layout
        fitProjection("atlas");
        redrawAllPaths();
        simBtn.classList.remove("running");
        simBtn.querySelector(".sim-label").textContent = "Election Night";
        // Hide pause button
        const pauseBtn = document.getElementById("sim-pause-btn");
        if (pauseBtn) pauseBtn.style.display = "none";
        const ns = document.getElementById("national-scoreboard");
        if (!natural) {
          // Aborted: clear sim data so tooltips revert to full results
          SIM.reportedCounties = new Set();
          SIM.countyRunning = {};
          SIM.stateTotals = {};
          SIM.stateCalls = {};
          SIM.winnerDeclared = null;
          SIM.shift = null;
          SIM.shiftedData = null;
          applyYearData();
          simBoard.classList.remove("visible");
          simCalls.classList.remove("visible");
          if (ns) ns.classList.remove("hidden");
        } else {
          // Final state: leave board visible; user can dismiss.  Keep
          // shiftedData around so post-night county/state hovers reflect
          // the alternate-reality outcome the viewer just watched.
          renderSimBoard();
        }
      }

      simBtn.addEventListener("click", () => {
        if (SIM.running) {
          stopSim(false);
          return;
        }
        // Show config panel; refresh year + candidate labels for the
        // shift-target picker so they reflect the year being simulated.
        document.getElementById("sim-config-year").textContent = currentYear;
        const targetSel = document.getElementById("sim-shift-target");
        if (targetSel) {
          const repName = getCandidateName("R");
          const demName = getCandidateName("D");
          const othName = getCandidateName("O");
          // Update option labels in place (preserve selection)
          [...targetSel.options].forEach(opt => {
            if (opt.value === "D") opt.textContent = `Shift toward ${demName}`;
            else if (opt.value === "R") opt.textContent = `Shift toward ${repName}`;
            else if (opt.value === "O") opt.textContent = `Shift toward ${othName}`;
          });
          // Show/hide magnitude row to match current selection
          const sigmaRow = document.getElementById("sim-shift-row");
          if (sigmaRow) {
            // Magnitude is meaningless for "historical" (no shift) and for
            // "fully_random" (the sim picks magnitude for you).
            const hide = targetSel.value === "historical" || targetSel.value === "fully_random";
            sigmaRow.style.display = hide ? "none" : "";
          }
        }
        simConfig.classList.add("visible");
      });

      document.getElementById("sim-go-btn").addEventListener("click", startSim);
      document.getElementById("sim-speed").addEventListener("change", e => {
        SIM.speed = +e.target.value;
      });
      // Toggle magnitude row when scenario changes
      const shiftSel = document.getElementById("sim-shift-target");
      if (shiftSel) {
        shiftSel.addEventListener("change", e => {
          const row = document.getElementById("sim-shift-row");
          if (row) {
            const hide = e.target.value === "historical" || e.target.value === "fully_random";
            row.style.display = hide ? "none" : "";
          }
        });
      }

      // Pause/Resume button
      document.getElementById("sim-pause-btn").addEventListener("click", () => {
        if (!SIM.running) return;
        const pauseBtn = document.getElementById("sim-pause-btn");
        if (SIM.paused) {
          // Resume
          SIM.paused = false;
          SIM.lastTick = performance.now();  // avoid time jump
          pauseBtn.classList.remove("paused");
          pauseBtn.textContent = "⏸ Pause";
          SIM.rafId = requestAnimationFrame(tickSim);
        } else {
          // Pause
          SIM.paused = true;
          if (SIM.rafId) { cancelAnimationFrame(SIM.rafId); SIM.rafId = null; }
          pauseBtn.classList.add("paused");
          pauseBtn.textContent = "▶ Resume";
        }
      });

      // Winner banner dismiss
      document.querySelector("#winner-banner .wb-dismiss").addEventListener("click", () => {
        document.getElementById("winner-banner").classList.remove("show");
      });

      // Close board via dismiss button
      simBoard.addEventListener("click", e => {
        if (e.target.classList.contains("sim-dismiss")) {
          if (SIM.running) {
            stopSim(false);  // this clears state itself
          } else {
            // Natural-finish dismiss: clear sim data so tooltips revert
            SIM.reportedCounties = new Set();
            SIM.countyRunning = {};
            SIM.stateTotals = {};
            SIM.stateCalls = {};
            SIM.winnerDeclared = null;
          }
          simBoard.classList.remove("visible");
          simCalls.classList.remove("visible");
          document.getElementById("winner-banner").classList.remove("show");
          document.getElementById("call-banner").classList.remove("show");
          const ns = document.getElementById("national-scoreboard");
          if (ns) ns.classList.remove("hidden");
          applyYearData();
        }
      });

      /* Initial render */
      updateYear(currentYear);

    }).catch(err => {
      console.error("Failed to load atlas data:", err);
      document.getElementById("us-map").innerHTML =
        `<p style="color:#ff6b6b;padding:24px;font-family:monospace">Failed to load map data: ${err.message}</p>`;
    });
  }

  /* ─── 6. Bootstrap ──────────────────────────────────────────────── */
  function bootstrap() {
    injectStyles();

    /* Scaffold */
    if (!document.getElementById("us-map")) {
      const d = document.createElement("div");
      d.id = "us-map";
      document.body.appendChild(d);
    }

    /* Reset button */
    if (!document.getElementById("reset-btn")) {
      const btn = document.createElement("button");
      btn.id = "reset-btn";
      btn.textContent = "↺ All States";
      document.body.appendChild(btn);
    }

    /* Tooltip */
    if (!document.getElementById("map-tooltip")) {
      const tt = document.createElement("div");
      tt.id = "map-tooltip";
      tt.innerHTML = `<div class="tt-name"></div><div class="tt-sub"></div><div class="tt-votes"></div>`;
      document.body.appendChild(tt);
    }

    /* State info panel */
    if (!document.getElementById("state-info")) {
      const si = document.createElement("div");
      si.id = "state-info";
      si.innerHTML = `<div class="si-name"></div><div class="si-rows"></div>`;
      document.body.appendChild(si);
    }

    /* National scoreboard (year totals, top-right) */
    if (!document.getElementById("national-scoreboard")) {
      const ns = document.createElement("div");
      ns.id = "national-scoreboard";
      ns.innerHTML = `
        <div class="ns-year"></div>
        <div class="ns-section">Electoral votes</div>
        <div class="ns-cands-ev"></div>
        <div class="ns-bar-wrap"></div>
        <div class="ns-threshold"></div>
        <div class="ns-section">Popular vote</div>
        <div class="ns-cands-pv"></div>`;
      document.body.appendChild(ns);
    }

    /* Controls bar */
    if (!document.getElementById("atlas-controls")) {
      const ctrl = document.createElement("div");
      ctrl.id = "atlas-controls";
      ctrl.innerHTML = `
        <button class="ctrl-btn" id="prev-btn">◀ Prev</button>
        <div id="year-display">2024</div>
        <input type="range" id="year-slider" />
        <button class="ctrl-btn" id="next-btn">Next ▶</button>
        <button id="sim-pause-btn" style="display:none">⏸ Pause</button>
        <button id="sim-btn"><span class="dot"></span><span class="sim-label">Election Night</span></button>`;
      document.body.appendChild(ctrl);
    }

    /* Election night scoreboard */
    if (!document.getElementById("sim-board")) {
      const sb = document.createElement("div");
      sb.id = "sim-board";
      sb.innerHTML = `
        <div class="sim-header">
          <div class="sim-live">LIVE · ELECTION NIGHT<span class="sim-shift-tag" style="display:none"></span></div>
          <div class="sim-clock">7:00 PM ET</div>
          <button class="sim-dismiss" style="background:none;border:none;color:#5a6280;cursor:pointer;font-size:0.9rem;padding:0 4px;">✕</button>
        </div>
        <div class="sim-scores">
          <div class="sim-cand sim-cand-dem">
            <div class="sim-name">Democrat</div>
            <div class="sim-ev">0</div>
            <div class="sim-pv">0.0% · 0</div>
          </div>
          <div class="sim-270">
            <div class="sim-270-num">270</div>
            <div class="sim-270-lbl">To win</div>
            <div class="sim-cand-oth" style="display:none">
              <span class="sim-oth-name">Other</span>
              <span class="sim-oth-ev">0</span>
            </div>
          </div>
          <div class="sim-cand sim-cand-rep">
            <div class="sim-name">Republican</div>
            <div class="sim-ev">0</div>
            <div class="sim-pv">0.0% · 0</div>
          </div>
        </div>
        <div class="sim-bar-wrap">
          <div class="sim-bar-dem" style="width:0%"></div>
          <div class="sim-bar-oth" style="width:0%"></div>
          <div class="sim-bar-rep" style="width:0%"></div>
          <div class="sim-threshold-line" style="left:50%"></div>
        </div>
        <div class="sim-footer">
          <span class="sim-reporting">0% reporting</span>
          <span class="sim-leader">Polls closing</span>
        </div>`;
      document.body.appendChild(sb);
    }

    /* AP calls feed */
    if (!document.getElementById("sim-calls")) {
      const sc = document.createElement("div");
      sc.id = "sim-calls";
      sc.innerHTML = `
        <div class="calls-header">📺 AP Calls</div>
        <div class="calls-list"></div>`;
      document.body.appendChild(sc);
    }

    /* Election night config dialog */
    if (!document.getElementById("sim-config")) {
      const cfg = document.createElement("div");
      cfg.id = "sim-config";
      cfg.innerHTML = `
        <div class="cfg-title">Simulate <span id="sim-config-year">2024</span></div>
        <div class="cfg-row">
          <span>Speed</span>
          <select id="sim-speed">
            <option value="0.00833">Real-time (1× speed)</option>
            <option value="0.01667" selected>Normal (1 min = 1 sec)</option>
            <option value="0.0833">Fast (5 min = 1 sec)</option>
            <option value="0.25">Blitz (15 min = 1 sec)</option>
          </select>
        </div>
        <div class="cfg-row">
          <span>Scenario</span>
          <select id="sim-shift-target">
            <option value="historical" selected>Historical (real results)</option>
            <option value="D">Shift toward Democrat</option>
            <option value="R">Shift toward Republican</option>
            <option value="O">Shift toward third party</option>
            <option value="random">Random direction (you pick size)</option>
            <option value="fully_random">Fully random (surprise me)</option>
          </select>
        </div>
        <div class="cfg-row" id="sim-shift-row" style="display:none">
          <span>Magnitude</span>
          <select id="sim-shift-sigma">
            <option value="2">Mild (σ≈2 pts)</option>
            <option value="4" selected>Moderate (σ≈4 pts)</option>
            <option value="7">Large (σ≈7 pts)</option>
            <option value="12">Wave (σ≈12 pts)</option>
          </select>
        </div>
        <button class="cfg-go" id="sim-go-btn">▶ Start Election Night</button>`;
      document.body.appendChild(cfg);
    }

    /* Call banner — fires when a state is called */
    if (!document.getElementById("call-banner")) {
      const cb = document.createElement("div");
      cb.id = "call-banner";
      cb.innerHTML = `
        <div class="cb-label">★ AP RACE CALL ★</div>
        <div class="cb-state"></div>
        <div class="cb-for">PROJECTED WINNER</div>
        <div class="cb-party"></div>`;
      document.body.appendChild(cb);
    }

    /* Winner banner — fires when someone clears 270 */
    if (!document.getElementById("winner-banner")) {
      const wb = document.createElement("div");
      wb.id = "winner-banner";
      wb.innerHTML = `
        <div class="wb-headline">★ DECISION DESK ★</div>
        <div class="wb-elected">Projected next President of the United States</div>
        <div class="wb-party"></div>
        <div class="wb-ev"></div>
        <div class="wb-year"></div>
        <button class="wb-dismiss">Continue watching</button>`;
      document.body.appendChild(wb);
    }

    /* Legend */
    if (!document.getElementById("map-legend")) {
      const leg = document.createElement("div");
      leg.id = "map-legend";
      leg.innerHTML = `
        <div class="leg-title">2024 Presidential</div>
        <div class="leg-bar">
          <div class="leg-swatch" style="background:linear-gradient(to right,#ef928a,#5e0f0f)"></div>
          <span class="leg-rep" style="color:#ff6b6b">Republican</span>
        </div>
        <div class="leg-bar">
          <div class="leg-swatch" style="background:linear-gradient(to right,#92b8ee,#0c2654)"></div>
          <span class="leg-dem" style="color:#6b9fff">Democrat</span>
        </div>
        <div class="leg-bar leg-oth-bar">
          <div class="leg-swatch" style="background:linear-gradient(to right,#eed484,#5a4400)"></div>
          <span class="leg-oth" style="color:#f0c040">Third Party</span>
        </div>
        <div class="leg-note">Darker = larger margin</div>`;
      document.body.appendChild(leg);
    }

    init();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();