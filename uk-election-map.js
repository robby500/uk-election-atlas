/**
 * UK Election Atlas
 * Interactive D3.js map supporting elections 1983–2024.
 * Dynamically loads boundary + results files per selected year.
 *
 * File conventions (all in same directory as this script):
 *   Boundaries:  ridings-{era}.json  regions-{era}.json (or uk-regions.json / uk-ridings.json for 2024)
 *   Results:     election_results_{year}.xlsx
 *
 * Era → boundary file mapping:
 *   2024        → uk-ridings.json / uk-regions.json
 *   2010–2019   → ridings-2010.json / uk-regions.json
 *   2005        → ridings-2005.json / uk-regions.json
 *   1997–2001   → ridings-1997.json / uk-regions.json
 *   1992        → ridings-1992.json / uk-regions.json
 *   1983–1987   → ridings-1983.json / uk-regions.json
 */

(function () {
  "use strict";

  /* ─── Year / era config ─────────────────────────────────────────── */
  const YEARS = [2024, 2019, 2017, "ref2016", 2015, 2010, 2005, 2001, 1997, 1992, 1987, 1983, 1979, "1974O", "1974F", 1970, 1966, 1964, 1959, 1955, 1951, 1950, 1945, 1935, 1931, 1929, 1924, 1923, 1922, 1918];

  const YEAR_TO_ERA = {
    2024: "2024",
    2019: "2010", 2017: "2010", 2015: "2010", 2010: "2010",
    2005: "2005",
    2001: "1997", 1997: "1997",
    1992: "1992",
    1987: "1983", 1983: "1983",
    "ref2016": "ref2016",
    1979:     "1974",
    "1974O":  "1974",
    "1974F":  "1974",
    1970: "1955", 1966: "1955", 1964: "1955", 1959: "1955", 1955: "1955",
    1951: "1950", 1950: "1950",
    1945: "1945",
    1935: "1922", 1931: "1922", 1929: "1922", 1924: "1922", 1923: "1922", 1922: "1922",
    1918: "1918",
  };

  function isRefMode(year)   { return year === "ref2016"; }

  /* Resolve file paths relative to this script's location, not the page URL.
     This means the files always load correctly regardless of which page loads the script. */
  const BASE_URL = (function() {
    const scripts = document.querySelectorAll("script[src]");
    for (const s of scripts) {
      if (s.src && s.src.includes("uk-election-map")) {
        return s.src.substring(0, s.src.lastIndexOf("/") + 1);
      }
    }
    return "./";  // fallback
  })();

  function ridingsFile(era) {
    return BASE_URL + (era === "2024" ? "uk-ridings.json" : `ridings-${era}.json`);
  }
  function regionsFile() { return BASE_URL + "uk-regions.json"; }
  function resultsFile(year) {
    if (isRefMode(year)) return BASE_URL + "referendum_results.xlsx";
    if (year === 2024) return BASE_URL + "election_results_uk.xlsx";
    return BASE_URL + `election_results_${year}.xlsx`;
  }
  function refBoundaryFile() { return BASE_URL + "uk-referendum-authorities.json"; }

  /* ─── Party name normalisation (results files use abbreviations) ── */
  // Map winner codes → colour scheme key used in ridingColour/regionColour
  const PARTY_DISPLAY = {
    Con: "Conservative", Lab: "Labour", LD: "Lib Dem", Lib: "Lib Dem",
    SNP: "SNP", PC: "Plaid Cymru", Grn: "Green", Reform: "Reform", RUK: "Reform UK",
    SF: "Sinn Féin", DUP: "DUP", SDLP: "SDLP", UUP: "UUP", ALL: "Alliance",
    UKIP: "UKIP", Brexit: "Brexit", IND: "Independent", Other: "Other",
  };

  /* Seat totals per election for legend */
  const SEAT_TOTALS = {
    2024: {Lab:411,Con:121,LD:72,SNP:9,PC:4,RUK:5,Grn:4,SF:7,DUP:5,SDLP:2,UUP:1,ALL:1,IND:6},
    2019: {Con:365,Lab:202,SNP:48,LD:11,DUP:8,SF:7,PC:4,Grn:1,ALL:1,SDLP:2,UUP:0},
    2017: {Con:317,Lab:262,SNP:35,LD:12,DUP:10,SF:7,PC:4,Grn:1,ALL:1,SDLP:3,UUP:2},
    2015: {Con:331,Lab:232,SNP:56,LD:8,DUP:8,SF:4,PC:3,UKIP:1,Grn:1,SDLP:3,UUP:2,ALL:0},
    2010: {Con:306,Lab:258,LD:57,DUP:8,SF:5,SDLP:3,SNP:6,PC:3,Grn:1,ALL:1,UUP:0},
    2005: {Lab:355,Con:198,LD:62,DUP:9,SF:5,SNP:6,PC:3,SDLP:3,UUP:1,ALL:0},
    2001: {Lab:413,Con:166,LD:52,SNP:5,PC:4,DUP:5,SF:4,SDLP:3,UUP:6},
    1997: {Lab:418,Con:165,LD:46,SNP:6,PC:4,UUP:10,DUP:2,SF:2,SDLP:3,ALL:0},
    1992: {Con:336,Lab:271,LD:20,SNP:3,PC:4,UUP:9,DUP:3,SDLP:4,ALL:0},
    1987: {Con:376,Lab:229,Lib:22,SNP:3,PC:3,UUP:9,DUP:3,SDLP:3,SF:1,ALL:1},
    1983: {Con:397,Lab:209,Lib:23,SNP:2,PC:2,UUP:11,DUP:3,SDLP:1,SF:1,ALL:1},
    1979: {Con:339,Lab:269,Lib:11,SNP:2,PC:2,UUP:5,DUP:3,SDLP:1,Other:3},
    "1974O": {Lab:319,Con:277,Lib:13,SNP:11,PC:3,SDLP:1,UUP:6,ALL:1,Other:3},
    "1974F": {Con:297,Lab:301,Lib:14,SNP:7,PC:2,SDLP:1,UUP:7,ALL:1,Other:2},
    1970: {Con:330,Lab:287,Lib:6,UUP:9,Other:8},
    1966: {Lab:363,Con:253,Lib:12,UUP:9,Other:3},
    1964: {Lab:317,Con:304,Lib:9,UUP:9,Other:1},
    1959: {Con:365,Lab:258,Lib:6,UUP:9,Other:2},
    1955: {Con:344,Lab:277,Lib:6,UUP:9,Other:2},
    1951: {Con:321,Lab:295,Lib:6,UUP:9,Other:4},
    1950: {Lab:315,Con:298,Lib:9,UUP:9,Other:4},
    1945: {Lab:393,Con:197,Lib:12,UUP:9,Other:29},
    1935: {Con:429,Lab:154,Lib:21,UUP:9,Other:2},
    1931: {Con:470,Lab:52,Lib:37,UUP:9,Other:7},
    1929: {Lab:288,Con:260,Lib:59,UUP:9,Other:9},
    1924: {Con:412,Lab:151,Lib:40,UUP:9,Other:3},
    1923: {Con:258,Lab:191,Lib:159,UUP:9,Other:8},
    1922: {Con:344,Lab:142,Lib:115,UUP:9,Other:45},
    1918: {Con:382,Lab:57,Lib:36,UUP:22,Other:160},
  };

  /* Canonical House of Commons size by election (from Wikipedia & HoC Library).
     This is the OFFICIAL total used to compute the majority threshold (= floor(N/2)+1).
     SEAT_TOTALS above sums party tallies which may not match N (Speaker, vacancies,
     missing micro-parties, etc.). And our boundary files may be missing some seats
     (university seats, Coalition-era Ireland's southern constituencies, etc.) so we
     can't just count features either. Hardcode the truth. */
  const CANONICAL_SEATS = {
    2024: 650, 2019: 650, 2017: 650, 2015: 650, 2010: 650,
    2005: 646,
    2001: 659, 1997: 659,
    1992: 651, 1987: 650, 1983: 650,
    1979: 635, "1974O": 635, "1974F": 635,
    1970: 630, 1966: 630, 1964: 630, 1959: 630, 1955: 630,
    1951: 625, 1950: 625,
    1945: 640,
    1935: 615, 1931: 615, 1929: 615, 1924: 615, 1923: 615, 1922: 615,
    1918: 707,
  };
  function canonicalSeats(year) { return CANONICAL_SEATS[year] || 650; }
  function majorityThreshold(year) { return Math.floor(canonicalSeats(year) / 2) + 1; }

  /* Per-election outcome: the leader who FORMED THE GOVERNMENT and the
     constitutional outcome. Used for the atlas headline and to enrich the
     sim's big-banner / leader text once a result is mathematically called.

     "leader" is the head of the post-election government (not always the
     largest party's leader — see 1923, 1924, 1929 where Labour formed
     minority governments despite the Conservatives winning the most seats).
     "outcome" is short enough to fit a one-line headline: Majority /
     Minority / Coalition / National Govt.
     "party" is what colour to paint the headline.  */
  const ELECTION_OUTCOMES = {
    2024:    { leader: "Keir Starmer",      outcome: "Majority",       party: "Lab" },
    2019:    { leader: "Boris Johnson",     outcome: "Majority",       party: "Con" },
    2017:    { leader: "Theresa May",       outcome: "Minority",       party: "Con" },
    2015:    { leader: "David Cameron",     outcome: "Majority",       party: "Con" },
    2010:    { leader: "David Cameron",     outcome: "Coalition",      party: "Con" },
    2005:    { leader: "Tony Blair",        outcome: "Majority",       party: "Lab" },
    2001:    { leader: "Tony Blair",        outcome: "Majority",       party: "Lab" },
    1997:    { leader: "Tony Blair",        outcome: "Majority",       party: "Lab" },
    1992:    { leader: "John Major",        outcome: "Majority",       party: "Con" },
    1987:    { leader: "Margaret Thatcher", outcome: "Majority",       party: "Con" },
    1983:    { leader: "Margaret Thatcher", outcome: "Majority",       party: "Con" },
    1979:    { leader: "Margaret Thatcher", outcome: "Majority",       party: "Con" },
    "1974O": { leader: "Harold Wilson",     outcome: "Majority",       party: "Lab" },
    "1974F": { leader: "Harold Wilson",     outcome: "Minority",       party: "Lab" },
    1970:    { leader: "Edward Heath",      outcome: "Majority",       party: "Con" },
    1966:    { leader: "Harold Wilson",     outcome: "Majority",       party: "Lab" },
    1964:    { leader: "Harold Wilson",     outcome: "Majority",       party: "Lab" },
    1959:    { leader: "Harold Macmillan",  outcome: "Majority",       party: "Con" },
    1955:    { leader: "Anthony Eden",      outcome: "Majority",       party: "Con" },
    1951:    { leader: "Winston Churchill", outcome: "Majority",       party: "Con" },
    1950:    { leader: "Clement Attlee",    outcome: "Majority",       party: "Lab" },
    1945:    { leader: "Clement Attlee",    outcome: "Majority",       party: "Lab" },
    1935:    { leader: "Stanley Baldwin",   outcome: "National Govt.", party: "Con" },
    1931:    { leader: "Ramsay MacDonald",  outcome: "National Govt.", party: "Con" },
    1929:    { leader: "Ramsay MacDonald",  outcome: "Minority",       party: "Lab" },
    1924:    { leader: "Stanley Baldwin",   outcome: "Majority",       party: "Con" },
    1923:    { leader: "Ramsay MacDonald",  outcome: "Minority",       party: "Lab" },
    1922:    { leader: "Bonar Law",         outcome: "Majority",       party: "Con" },
    1918:    { leader: "David Lloyd George",outcome: "Coalition",      party: "Lib" },
  };

  function loadScript(src, onload) {
    const s = document.createElement("script");
    s.src = src;
    s.onload = onload;
    document.head.appendChild(s);
  }

  function init() {
    loadScript("https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js", function () {
      loadScript("https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js", function () {
        loadScript("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js", buildMap);
      });
    });
  }

  /* ─── 2. Inject styles ──────────────────────────────────────────── */
  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Mono:wght@400;500&display=swap');

      :root {
        --bg:           #0d0f14;
        --panel:        #13161e;
        --border:       #1e2330;
        --region-fill:  #1a2035;
        --region-stroke:#2a3350;
        --riding-stroke:#3a4460;   /* light grey hairline between constituencies */
        --accent:       #4e7cff;
        --text:         #e8eaf0;
        --muted:        #5a6280;
        --tooltip-bg:   #0d0f14ee;
        --controls-h:    56px;     /* height of the bottom slider bar */
        --scoreboard-w:  286px;    /* reserved space for the right-side scoreboard */
      }

      * { box-sizing: border-box; margin: 0; padding: 0; }

      body {
        background: var(--bg);
        font-family: 'DM Mono', monospace;
        color: var(--text);
        height: 100vh;
        overflow: hidden;
        margin: 0;
      }

      #uk-map {
        width: 100%;
        height: calc(100vh - var(--controls-h));
        background: var(--bg);
        overflow: hidden;
        position: relative;
      }

      #uk-map svg { width: 100%; height: 100%; }

      .region { fill: transparent; stroke: var(--region-stroke); stroke-width: 0.6px; cursor: pointer; pointer-events: all; }
      .graticule { fill: none; stroke: #1a1f2e; stroke-width: 0.4px; }
      .region-label {
        font-family: 'DM Mono', monospace; font-size: 7px; font-weight: 500;
        fill: rgba(255,255,255,0.75); pointer-events: none;
        text-anchor: middle; dominant-baseline: middle;
      }
      .riding-mesh { pointer-events: none; }

      /* Old year dropdown — hidden in favour of the bottom slider, but the
         element stays in the DOM so existing JS that reads #year-select still works. */
      #year-selector { display: none; }

      #loading-indicator {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%,-50%);
        background: #13161eee;
        border: 1px solid #2a3350;
        border-radius: 6px;
        padding: 16px 28px;
        font-family: 'DM Mono', monospace;
        font-size: 0.8rem;
        color: #4e7cff;
        z-index: 300;
        display: none;
        letter-spacing: 0.08em;
      }

      /* ── Reset button ── */
      #reset-btn {
        position: fixed;
        top: calc(var(--topbar-height, 0px) + 10px);
        left: 16px;
        z-index: 10000;
        background: #13161e;
        border: 1px solid #2a3350;
        color: #5a6280;
        font-family: 'DM Mono', monospace;
        font-size: 0.68rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        padding: 7px 12px;
        border-radius: 4px;
        cursor: pointer;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s, color 0.15s, border-color 0.15s;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
      }
      #reset-btn.visible { opacity: 1; pointer-events: all; }
      #reset-btn:hover { color: #e8eaf0; border-color: #4e7cff; }

      /* ── Tooltip — anchored to bottom on mobile, cursor-follow on desktop ── */
      #map-tooltip {
        position: fixed;
        pointer-events: none;
        background: var(--tooltip-bg);
        border: 1px solid var(--border);
        border-left: 3px solid var(--accent);
        padding: 10px 14px;
        border-radius: 4px;
        font-family: 'DM Mono', monospace;
        font-size: 0.72rem;
        color: var(--text);
        white-space: nowrap;
        min-width: 200px;
        opacity: 0;
        transform: translateY(4px);
        transition: opacity 0.12s ease, transform 0.12s ease;
        z-index: 9999;
        backdrop-filter: blur(6px);
      }
      #map-tooltip.visible { opacity: 1; transform: translateY(0); }
      #map-tooltip .tt-name {
        font-family: 'DM Serif Display', serif; font-size: 1rem;
        color: var(--text); margin-bottom: 4px;
      }
      #map-tooltip .tt-abbr { color: var(--accent); font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.1em; }
      #map-tooltip .tt-votes { margin-top: 6px; font-size: 0.7rem; color: var(--muted); display: flex; flex-direction: column; gap: 2px; }
      #map-tooltip .tt-margin { color: var(--muted); font-size: 0.65rem; margin-top: 3px; }

      /* Mobile tooltip — fixed to bottom of screen */
      @media (max-width: 768px) {
        #map-tooltip {
          left: 12px !important;
          right: 12px !important;
          bottom: 16px !important;
          top: auto !important;
          white-space: normal;
          min-width: unset;
          max-width: calc(100vw - 24px);
          transform: translateY(8px);
        }
        #map-tooltip.visible { transform: translateY(0); }
      }

      /* ── National scoreboard (top-right, always visible outside sim) ── */
      #map-legend {
        position: fixed;
        top: calc(var(--topbar-height, 0px) + 14px); right: 14px;
        z-index: 200;
        background: #13161ecc;
        border: 1px solid #2a3350;
        border-radius: 5px;
        padding: 12px 14px;
        width: 258px;
        font-family: 'DM Mono', monospace;
        color: var(--muted);
        backdrop-filter: blur(6px);
        max-height: calc(100vh - var(--controls-h) - var(--topbar-height, 0px) - 28px);
        overflow-y: auto;
        transition: opacity 0.2s;
      }
      #map-legend.hidden { opacity: 0; pointer-events: none; }
      #map-legend .ns-year {
        font-family: 'DM Serif Display', serif;
        font-size: 1.05rem;
        color: var(--text); line-height: 1;
        margin-bottom: 6px;
      }
      #map-legend .ns-headline {
        display: flex; flex-direction: column; gap: 1px;
        margin: -2px 0 6px 0;
        padding-bottom: 6px;
        border-bottom: 1px solid #1e2330;
      }
      #map-legend .ns-headline .ns-leader {
        font-family: 'DM Serif Display', serif;
        font-size: 0.9rem; line-height: 1.1;
      }
      #map-legend .ns-headline .ns-outcome {
        font-size: 0.6rem; color: var(--muted);
        text-transform: uppercase; letter-spacing: 0.12em;
      }
      #map-legend .ns-section {
        font-size: 0.55rem; color: var(--muted);
        text-transform: uppercase; letter-spacing: 0.15em;
        margin: 8px 0 4px 0;
      }
      #map-legend .ns-cand {
        display: flex; justify-content: space-between; align-items: center;
        font-size: 0.7rem; padding: 2px 0; gap: 8px;
      }
      #map-legend .ns-cand .ns-name {
        flex: 1; overflow: hidden;
        text-overflow: ellipsis; white-space: nowrap;
        color: var(--text);
      }
      #map-legend .ns-cand .ns-name.win::before {
        content: "★ "; color: #f0c040;
      }
      #map-legend .ns-cand .ns-val {
        font-family: 'DM Mono', monospace; flex-shrink: 0;
      }
      #map-legend .ns-bar-wrap {
        height: 8px;
        background: #14181f;
        border-radius: 2px;
        overflow: visible;
        margin-top: 4px;
        display: flex;
        position: relative;
      }
      #map-legend .ns-bar-seg {
        height: 100%; transition: width 0.4s ease;
      }
      #map-legend .ns-threshold-line {
        position: absolute; top: -3px; bottom: -3px;
        width: 2px; background: #f0c040;
        box-shadow: 0 0 4px rgba(240, 192, 64, 0.6);
        transform: translateX(-1px);
      }
      #map-legend .ns-threshold-line::before {
        content: ''; position: absolute; top: -3px; left: -3px;
        width: 0; height: 0;
        border-left: 4px solid transparent;
        border-right: 4px solid transparent;
        border-top: 4px solid #f0c040;
      }
      #map-legend .ns-threshold {
        font-size: 0.55rem; color: var(--muted); margin-top: 4px;
      }
      #map-legend .ns-empty {
        font-size: 0.65rem; color: var(--muted); padding: 2px 0;
      }

      /* Mobile: scoreboard sits at the bottom */
      @media (max-width: 768px) {
        #map-legend {
          top: auto; bottom: 14px; right: 14px; left: 14px;
          width: auto; max-height: 50vh;
        }
      }

      /* ── Election Night: button ── */
      /* ── Bottom controls bar (slider + sim button) ── */
      #atlas-controls {
        position: fixed;
        bottom: 0; left: 0; right: 0;
        z-index: 250;
        height: var(--controls-h);
        background: #0d0f14cc;
        border-top: 1px solid #1e2330;
        backdrop-filter: blur(8px);
        padding: 10px 16px;
        display: flex;
        align-items: center;
        gap: 14px;
      }
      #year-display {
        font-family: 'DM Serif Display', serif;
        font-size: 1.55rem;
        color: var(--text);
        min-width: 96px;
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
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        transition: color 0.15s, border-color 0.15s;
        white-space: nowrap;
      }
      .ctrl-btn:hover { color: var(--text); border-color: var(--accent); }
      .ctrl-btn:disabled { opacity: 0.3; cursor: default; }

      /* ── Election Night button (lives inside #atlas-controls) ── */
      #sim-btn {
        background: #2a1010; border: 1px solid #6b1f1f; color: #ff8a8a;
        font-family: 'DM Mono', monospace; font-size: 0.7rem;
        padding: 6px 12px; border-radius: 4px; cursor: pointer;
        text-transform: uppercase; letter-spacing: 0.08em;
        transition: background 0.15s, color 0.15s, border-color 0.15s;
        white-space: nowrap;
        -webkit-tap-highlight-color: transparent;
      }
      #sim-btn:hover { background: #3a1818; color: #ffb0b0; border-color: #a02828; }
      #sim-btn .dot {
        display: inline-block; width: 7px; height: 7px; border-radius: 50%;
        background: #ff4444; margin-right: 6px; vertical-align: middle;
        box-shadow: 0 0 6px #ff4444;
      }
      #sim-btn.running .dot { animation: simPulse 1s ease-in-out infinite; }
      @keyframes simPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }

      /* During sim, pause + speed buttons sit at top-left, BELOW the reset button
         so they don't clash when a user zooms into a region. */
      #sim-pause-btn {
        position: fixed;
        top: calc(var(--topbar-height, 0px) + 52px);
        left: 16px;
        z-index: 10000;
        background: #1a1f2c; border: 1px solid #3a4560; color: #d8e0f0;
        font-family: 'DM Mono', monospace; font-size: 0.72rem; font-weight: 500;
        padding: 8px 14px; border-radius: 4px; cursor: pointer;
        text-transform: uppercase; letter-spacing: 0.08em;
        display: none;
        -webkit-tap-highlight-color: transparent;
        transition: background 0.15s, color 0.15s, border-color 0.15s;
      }
      #sim-pause-btn:hover { background: #232a3a; color: #fff; border-color: #5a6580; }
      #sim-pause-btn.paused {
        background: #2a2410; border-color: #b58a1f; color: #ffd66b;
        box-shadow: 0 0 8px rgba(240, 192, 64, 0.3);
      }
      #sim-pause-btn.paused:hover { background: #3a3018; color: #ffe6a0; }

      #sim-speed-btn {
        position: fixed;
        top: calc(var(--topbar-height, 0px) + 52px);
        left: 108px;
        z-index: 10000;
        background: #1a1f2c; border: 1px solid #3a4560; color: #d8e0f0;
        font-family: 'DM Mono', monospace; font-size: 0.7rem;
        padding: 8px 14px; border-radius: 4px; cursor: pointer;
        text-transform: none; letter-spacing: 0.04em;
        display: none;
        min-width: 220px;
        -webkit-tap-highlight-color: transparent;
        transition: background 0.15s, color 0.15s, border-color 0.15s;
      }
      #sim-speed-btn:hover { background: #232a3a; color: #fff; border-color: #5a6580; }
      #sim-speed-btn::before {
        content: '▸▸';
        margin-right: 5px;
        color: var(--accent);
        font-size: 0.7rem;
      }

      /* ── Election Night: scoreboard ── */
      #sim-board {
        position: fixed; top: calc(var(--topbar-height, 0px) + 14px); left: 50%; transform: translateX(-50%);
        z-index: 250;
        min-width: 520px; max-width: 720px;
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
      .sim-live { display: flex; align-items: center; gap: 6px; }
      .sim-live::before {
        content: ''; width: 6px; height: 6px; border-radius: 50%;
        background: #ff4444; box-shadow: 0 0 5px #ff4444;
        animation: simPulse 1s ease-in-out infinite;
      }
      .sim-clock {
        color: #c8d0e0;
        font-size: 0.78rem;
        font-weight: 500;
        letter-spacing: 0.08em;
      }
      .sim-shift-tag {
        margin-left: 8px; padding: 2px 6px;
        background: #2a1f3a; border: 1px solid #5a3a7a;
        border-radius: 3px; color: #d8b8ff;
        font-size: 0.55rem; letter-spacing: 0.1em; text-transform: uppercase;
      }

      .sim-body { padding: 10px 14px; }
      .sim-threshold-row {
        display: flex; justify-content: space-between; align-items: baseline;
        margin-bottom: 8px;
      }
      .sim-threshold-row .sim-target {
        font-size: 0.62rem; color: var(--muted);
        text-transform: uppercase; letter-spacing: 0.12em;
      }
      .sim-threshold-row .sim-target b {
        font-family: 'DM Serif Display', serif;
        font-size: 1rem; color: #f0c040; font-weight: normal;
        margin: 0 4px;
      }
      .sim-threshold-row .sim-progress {
        font-size: 0.62rem; color: var(--muted);
        letter-spacing: 0.05em;
      }
      .sim-bar-wrap {
        position: relative; height: 18px;
        background: #0d1018; border-radius: 3px; overflow: visible;
        display: flex;
      }
      .sim-bar-seg {
        height: 100%; transition: width 0.4s ease;
        position: relative;
      }
      .sim-bar-seg .sim-bar-count {
        position: absolute; top: 50%; transform: translateY(-50%);
        right: 4px; font-size: 0.6rem; color: rgba(255,255,255,0.85);
        font-weight: 500;
      }
      .sim-threshold-line {
        position: absolute; top: -3px; bottom: -3px;
        width: 2px; background: #f0c040;
        box-shadow: 0 0 5px rgba(240, 192, 64, 0.7);
        z-index: 5;
      }
      .sim-parties {
        display: flex; flex-wrap: wrap; gap: 14px;
        margin-top: 10px;
        font-size: 0.65rem;
      }
      .sim-party {
        display: flex; align-items: baseline; gap: 5px;
        color: var(--muted);
      }
      .sim-party .sp-dot {
        width: 8px; height: 8px; border-radius: 2px;
        align-self: center;
      }
      .sim-party .sp-name { color: var(--text); }
      .sim-party .sp-count {
        font-family: 'DM Serif Display', serif;
        font-size: 0.95rem; color: var(--text); margin-left: 2px;
      }
      .sim-party .sp-delta {
        font-size: 0.58rem; color: var(--muted); margin-left: 2px;
      }
      .sim-party .sp-delta.up { color: #5cb85c; }
      .sim-party .sp-delta.down { color: #db6b5f; }

      .sim-footer {
        padding: 6px 12px;
        font-size: 0.6rem; color: var(--muted);
        display: flex; justify-content: space-between;
        border-top: 1px solid #1e2330;
      }
      .sim-leader { color: var(--text); }

      /* ── Popular vote section ── */
      .sim-popvote {
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px solid #1e2330;
      }
      .sim-pv-head {
        display: flex; justify-content: space-between; align-items: baseline;
        margin-bottom: 5px;
      }
      .sim-pv-label {
        font-size: 0.55rem; color: var(--muted);
        text-transform: uppercase; letter-spacing: 0.12em;
      }
      .sim-pv-total {
        font-size: 0.58rem; color: var(--muted);
        letter-spacing: 0.04em;
      }
      .sim-pv-bar {
        height: 8px;
        background: #0d1018;
        border-radius: 2px;
        overflow: hidden;
        display: flex;
      }
      .sim-pv-seg {
        height: 100%;
        transition: width 0.4s ease;
      }
      .sim-pv-labels {
        display: flex; flex-wrap: wrap; gap: 10px;
        margin-top: 6px;
        font-size: 0.62rem;
      }
      .sim-pv-item { display: inline-flex; align-items: center; gap: 4px; }
      .sim-pv-dot { width: 6px; height: 6px; border-radius: 50%; }
      .sim-pv-name { color: var(--text); }
      .sim-pv-pct { color: var(--muted); margin-left: 2px; }

      /* ── Toast stack ── */
      #sim-toasts {
        position: fixed; bottom: 16px; right: 16px;
        z-index: 9000;
        display: flex; flex-direction: column-reverse; gap: 8px;
        max-height: calc(100vh - 100px);
        overflow: hidden;
        pointer-events: none;
      }
      .sim-toast {
        background: #0d0f14ee;
        border: 1px solid #2a3350;
        border-left: 3px solid var(--accent);
        padding: 9px 13px;
        border-radius: 4px;
        font-family: 'DM Mono', monospace;
        font-size: 0.7rem;
        color: var(--text);
        min-width: 240px;
        max-width: 320px;
        backdrop-filter: blur(6px);
        opacity: 0;
        transform: translateX(20px);
        animation: toastIn 0.25s ease-out forwards;
      }
      @keyframes toastIn {
        to { opacity: 1; transform: translateX(0); }
      }
      .sim-toast.leaving {
        animation: toastOut 0.25s ease-in forwards;
      }
      @keyframes toastOut {
        to { opacity: 0; transform: translateX(20px); }
      }
      .sim-toast .toast-name {
        font-family: 'DM Serif Display', serif;
        font-size: 0.92rem;
        margin-bottom: 2px;
      }
      .sim-toast .toast-winner {
        font-size: 0.7rem; font-weight: 500;
      }
      .sim-toast .toast-meta {
        font-size: 0.6rem; color: var(--muted);
        margin-top: 3px;
        display: flex; justify-content: space-between; gap: 8px;
      }
      .sim-toast .toast-swing {
        font-size: 0.6rem; color: var(--muted);
        margin-top: 2px;
      }
      .sim-toast.gain { border-left-width: 4px; }
      .sim-toast.gain .toast-gain-flag {
        display: inline-block;
        font-size: 0.55rem;
        letter-spacing: 0.1em;
        padding: 1px 5px;
        border-radius: 2px;
        background: rgba(240, 192, 64, 0.18);
        color: #f0c040;
        margin-left: 6px;
        vertical-align: 1px;
      }

      /* ── Big banner: majority reached / hung parliament ── */
      #sim-banner {
        position: fixed; top: 50%; left: 50%;
        transform: translate(-50%, -50%) scale(0.85);
        z-index: 400;
        background: #0a0d14;
        border: 2px solid;
        padding: 22px 44px;
        font-family: 'DM Serif Display', serif;
        text-align: center;
        opacity: 0;
        pointer-events: none;
        box-shadow: 0 0 60px rgba(0,0,0,0.8);
        transition: opacity 0.3s, transform 0.3s;
        min-width: 360px;
      }
      #sim-banner.show {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
        pointer-events: auto;
      }
      #sim-banner .sb-label {
        font-family: 'DM Mono', monospace;
        font-size: 0.7rem;
        letter-spacing: 0.3em;
        text-transform: uppercase;
        margin-bottom: 10px;
      }
      #sim-banner .sb-headline {
        font-size: 2rem; line-height: 1.15;
        margin-bottom: 6px;
      }
      #sim-banner .sb-sub {
        font-family: 'DM Mono', monospace;
        font-size: 0.75rem;
        color: var(--muted);
        letter-spacing: 0.05em;
        margin-top: 8px;
      }
      #sim-banner .sb-dismiss {
        margin-top: 18px;
        background: transparent;
        border: 1px solid currentColor;
        color: inherit;
        font-family: 'DM Mono', monospace;
        font-size: 0.65rem;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        padding: 6px 16px;
        border-radius: 3px;
        cursor: pointer;
        opacity: 0.7;
      }
      #sim-banner .sb-dismiss:hover { opacity: 1; }

      /* ── Sim config dialog ── */
      #sim-config {
        position: fixed; top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        z-index: 350;
        background: #0a0d14ee;
        border: 1px solid #2a3350;
        border-radius: 6px;
        padding: 22px 28px;
        backdrop-filter: blur(10px);
        font-family: 'DM Mono', monospace;
        min-width: 380px; max-width: 92vw;
        opacity: 0; pointer-events: none;
        transition: opacity 0.2s;
      }
      #sim-config.visible { opacity: 1; pointer-events: auto; }
      #sim-config .cfg-title {
        font-family: 'DM Serif Display', serif;
        font-size: 1.2rem; color: var(--text);
        margin-bottom: 16px;
      }
      #sim-config .cfg-title .cfg-year { color: var(--accent); }
      #sim-config .cfg-row {
        display: flex; align-items: center;
        gap: 12px; margin-bottom: 12px;
        font-size: 0.72rem; color: var(--muted);
      }
      #sim-config .cfg-row label {
        min-width: 60px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      #sim-config select {
        flex: 1;
        background: #13161e;
        color: var(--text);
        border: 1px solid #2a3350;
        border-radius: 3px;
        font-family: 'DM Mono', monospace;
        font-size: 0.72rem;
        padding: 6px 10px;
        cursor: pointer;
      }
      #sim-config .cfg-info {
        margin-top: 10px;
        padding: 10px 12px;
        background: rgba(78, 124, 255, 0.06);
        border-left: 2px solid var(--accent);
        font-size: 0.65rem;
        color: var(--muted);
        line-height: 1.5;
        border-radius: 0 3px 3px 0;
      }
      #sim-config .cfg-actions {
        display: flex; gap: 10px;
        margin-top: 16px;
      }
      #sim-config .cfg-cancel,
      #sim-config .cfg-go {
        flex: 1;
        font-family: 'DM Mono', monospace;
        font-size: 0.72rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        padding: 9px 14px;
        border-radius: 4px;
        cursor: pointer;
        transition: background 0.15s, color 0.15s, border-color 0.15s;
      }
      #sim-config .cfg-cancel {
        background: transparent;
        border: 1px solid #3a4560;
        color: var(--muted);
      }
      #sim-config .cfg-cancel:hover {
        border-color: #5a6580; color: var(--text);
      }
      #sim-config .cfg-go {
        background: #2a1010;
        border: 1px solid #6b1f1f;
        color: #ff8a8a;
        flex: 2;
      }
      #sim-config .cfg-go:hover {
        background: #3a1818; color: #ffb0b0; border-color: #a02828;
      }

      @media (max-width: 768px) {
        #sim-board { min-width: unset; left: 8px; right: 8px; transform: none; }
        #sim-toasts { left: 8px; right: 8px; bottom: 8px; }
        .sim-toast { max-width: unset; }
        #sim-banner { min-width: unset; max-width: calc(100vw - 32px); padding: 18px 24px; }
        #sim-banner .sb-headline { font-size: 1.4rem; }
        #sim-pause-btn, #sim-speed-btn { display: none !important; }
      }

      /* Dim other UI during sim */
      body.sim-active #year-selector { display: none; }
      body.sim-active #map-legend { display: none; }
    `;
    document.head.appendChild(style);
  }

  /* ─── 3. Region metadata ────────────────────────────────────────── */
  const REGION_ABBR = {
    "North East (England)":     "NE",
    "North West (England)":     "NW",
    "Yorkshire and The Humber": "YH",
    "East Midlands (England)":  "EM",
    "West Midlands (England)":  "WM",
    "East of England":          "EE",
    "London":                   "LDN",
    "South East (England)":     "SE",
    "South West (England)":     "SW",
    "Wales":                    "WLS",
    "Scotland":                 "SCT",
    "Northern Ireland":         "NI",
  };

  const RIDING_REGION_MAP = {
    "North_East":       "UKC",
    "North_West":       "UKD",
    "Yorkshire_Humber": "UKE",
    "East_Midlands":    "UKF",
    "West_Midlands":    "UKG",
    "East_England":     "UKH",
    "London":           "UKI",
    "South_East":       "UKJ",
    "South_West":       "UKK",
    "Wales":            "UKL",
    "Scotland":         "UKM",
    "NI":               "UKN",
  };

  /* ─── 4. Colour helpers ─────────────────────────────────────────── */
  function regionColour(data) {
    // Region fills are transparent — colour lives in the riding layer underneath.
    // We keep this function for tooltip data but don't use it for fill.
    return "transparent";
  }

  function ridingColour(data) {
    if (!data) return "#1a2035";
    const t = Math.min(1, Math.abs(data.margin) / 0.60);
    const c = colourPair(data.winner);
    return d3.interpolateRgb(c[0], c[1])(t);
  }

  function colourPair(winner) {
    const pairs = {
      Lab:    ["#db6b5f","#5e0909"], Con:    ["#5b9ec9","#0a2244"],
      LD:     ["#e8a83c","#6b3300"], Lib:    ["#f5c842","#7a5e00"],
      NatLib: ["#d4a017","#6b3d00"],
      SNP:    ["#dfc440","#5a4700"], PC:     ["#4aaa74","#083d1c"],
      Reform: ["#12b6cf","#00415a"], RUK:    ["#12b6cf","#00415a"], Grn:    ["#5cb85c","#1a4a1a"],
      SF:     ["#4a9e6e","#0d3320"], DUP:    ["#8e44ad","#3d1060"],
      SDLP:   ["#2ecc71","#0a4a25"], UUP:    ["#5b8ed4","#1a3560"],
      ALL:    ["#e67e22","#7a3a00"], UKIP:   ["#6b2fa0","#2d1045"],
      Brexit: ["#12b6cf","#065a69"], IND:    ["#95a5a6","#2c3e50"],
      Ind:    ["#95a5a6","#2c3e50"], NatLab: ["#c0392b","#6b0000"],
      Nat:    ["#8b9e6e","#3a4a2a"], Com:    ["#c0392b","#4a0000"],
      ILP:    ["#e05050","#7a0000"], CW:     ["#7c8290","#2d3035"],
      NILP:   ["#c0392b","#5e0909"],
    };
    return pairs[winner] || ["#7c8290","#2d3035"];
  }

  function partyColourAccent(party) {
    const map = {
      Lab:"#db6b5f", Con:"#5b9ec9", LD:"#e8a83c", Lib:"#f5c842",
      NatLib:"#d4a017", SNP:"#dfc440", PC:"#4aaa74", Reform:"#12b6cf", RUK:"#12b6cf", Grn:"#5cb85c",
      SF:"#4a9e6e", DUP:"#8e44ad", SDLP:"#2ecc71", UUP:"#5b8ed4",
      ALL:"#e67e22", UKIP:"#9b59b6", Brexit:"#12b6cf", IND:"#95a5a6",
      Ind:"#95a5a6", NatLab:"#e05050", Nat:"#a0b07e", Com:"#d43f3f",
      ILP:"#e05050", CW:"#7c8290", NILP:"#e05050",
    };
    return map[party] || "#7c8290";
  }

  /* Party → gain-stripe direction id. Picked so neighbouring parties get
     visually distinct angles (Lab/Con are the most common gains, so they
     get directions roughly 90° apart). Any party not listed falls back to
     the "a" direction. Defined as a function rather than a const map so
     fallback is always safe. */
  function gainStripePatternId(party) {
    const m = {
      Lab: "gain-d-b",    //  45° — classic "/" hatch
      Con: "gain-d-e",    // 135° — classic "\" hatch (perpendicular to Lab)
      LD:  "gain-d-c",    //  67.5°
      Lib: "gain-d-c",
      SNP: "gain-d-f",    // 157.5°
      PC:  "gain-d-a",    //  22.5°
      Grn: "gain-d-d",    // 112.5°
      RUK: "gain-d-a",
      Reform: "gain-d-a",
      DUP: "gain-d-f",
      SF:  "gain-d-c",
      SDLP:"gain-d-b",
      UUP: "gain-d-e",
      ALL: "gain-d-d",
      UKIP:"gain-d-d",
      IND: "gain-d-a", Ind: "gain-d-a",
    };
    return m[party] || "gain-d-b";
  }

  /* ─── Referendum colours ─────────────────────────────────────────── */
  function refColour(data) {
    if (!data) return "#1a2035";
    const t = Math.min(1, data.margin / 0.40);
    if (data.winner === "Leave") return d3.interpolateRgb("#5b9ec9", "#0a2244")(t);  // Leave = blue
    return d3.interpolateRgb("#e8c93c", "#7a5a00")(t);  // Remain = yellow/gold
  }

  function refAccent(winner) {
    return winner === "Leave" ? "#5b9ec9" : "#e8c93c";
  }

  /* ─── Election Night: declaration timing model ──────────────────────
     UK polls close at 22:00 BST nationally (or 21:00 in older eras — we
     don't try to differentiate; the relative-order matters more than the
     absolute clock). Each constituency gets a declareAt time at sim start.

     Real anchors for famous early seats override regional defaults; the
     rest get a regional base time + jitter.

     Regional base = the hour by which roughly the FIRST seats in that
     region start declaring. We then add a per-seat random offset drawn
     from a region-specific distribution (urban areas count faster than
     rural / island seats).
  */
  const POLL_CLOSE_HOURS = 22.0;  // 10pm BST

  /* Regional declaration profile.
     base = decimal hour (24h BST) when the first seats in this region start
            announcing — earliest counts in the region.
     spread = roughly how many hours over which the region's seats will
              be spread.

     Tuned for an *atlas-style* watchable sim: the real-world schedule has
     huge gaps (especially NI, which doesn't really start until lunchtime
     Friday). We compress those gaps so declarations feel like a constant
     stream from poll-close to dawn rather than a series of regional clumps
     with dead air between them. */
  const REGION_DECLARE_PROFILE = {
    "North_East":       { base: 23.0, spread: 3.5 },   // Sunderland leads
    "North_West":       { base: 24.0, spread: 4.5 },
    "Yorkshire_Humber": { base: 23.8, spread: 4.5 },
    "East_Midlands":    { base: 24.2, spread: 4.5 },
    "West_Midlands":    { base: 24.2, spread: 4.5 },
    "East_England":     { base: 24.5, spread: 5.0 },
    "London":           { base: 25.2, spread: 5.0 },
    "South_East":       { base: 24.8, spread: 5.5 },
    "South_West":       { base: 24.8, spread: 5.5 },
    "Wales":            { base: 24.2, spread: 5.0 },
    "Scotland":         { base: 24.5, spread: 5.5 },
    "NI":               { base: 25.5, spread: 4.5 },   // pulled in from Friday afternoon
    "Ireland":          { base: 25.5, spread: 4.5 },   // pre-partition alias
  };

  /* Real-world named-anchor declaration times (hours decimal, 24h BST).
     Keys are normalised constituency names. Anchors override the regional
     base so the famous "race" between Sunderland / Newcastle / Blyth lines
     up roughly correctly across modern elections. */
  const DECLARE_ANCHORS = {
    "houghton and sunderland south":   22.80,  // ~22:48 in 2015, 23:15 in 2024 — split the difference
    "sunderland central":              23.10,
    "washington and sunderland west":  23.20,
    "washington and gateshead south":  23.15,
    "blyth valley":                    23.05,
    "blyth and ashington":             23.10,
    "newcastle upon tyne central":     23.40,
    "newcastle upon tyne central and west": 25.20,
    "newcastle upon tyne east":        23.55,
    "newcastle upon tyne east and wallsend": 25.40,
    "newcastle upon tyne north":       23.50,
    "north durham":                    24.00,
    "city of durham":                  24.10,
    "swindon north":                   23.85,
    "swindon south":                   23.95,
    // Famous late ones (still trail the field, but not by hours of dead air)
    "na h-eileanan an iar":            27.20,  // Western Isles
    "inverness, skye and west ross-shire": 27.60,
    "orkney and shetland":             27.40,
    "argyll, bute and south lochaber": 27.50,
    "ross, skye and lochaber":         27.50,
    "st ives":                         27.30,
    "south west cornwall":             26.80,
  };

  /* Mulberry-bush hash so a constituency always gets the same jitter
     within a single simulation, but different seats get different offsets. */
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967295;  // [0,1)
  }

  /* Compute declaration time for a single constituency. */
  function computeDeclareTime(ridingFeature, era, seedSalt) {
    const props = ridingFeature.properties || {};
    const rawName = props.name || props.Name || props[era + "_Constituency"] || "";
    const norm = normName(rawName);
    if (DECLARE_ANCHORS[norm] != null) return DECLARE_ANCHORS[norm];

    const region = props.region || props[era + "_Region"] || null;
    const profile = REGION_DECLARE_PROFILE[region] || { base: 25.0, spread: 5.5 };

    // Two-hash average gives a roughly triangular distribution centred in
    // the middle of the regional window — produces a steadier rate of
    // declarations within each region rather than a big clump right after
    // the base time. The global smoothing pass in buildDeclareSchedule
    // then de-jitters the merged stream across all regions.
    const h1 = hashStr(norm + ":1:" + seedSalt);
    const h2 = hashStr(norm + ":2:" + seedSalt);
    const u = (h1 + h2) / 2;
    return profile.base + u * profile.spread;
  }

  /* Format a sim clock hour (which may exceed 24) as "23:48 BST" / "01:15 BST". */
  function fmtSimClock(hours) {
    const h24 = ((hours % 24) + 24) % 24;
    const h = Math.floor(h24);
    const m = Math.floor((h24 - h) * 60);
    return `${h.toString().padStart(2,"0")}:${m.toString().padStart(2,"0")} BST`;
  }

  /* ─── Election Night: party display + colours ─────────────────────── */
  function partyDisplayName(code) {
    const names = {
      Lab:"Labour", Con:"Conservative", LD:"Lib Dem", Lib:"Liberal",
      NatLib:"National Liberal", SNP:"SNP", PC:"Plaid Cymru",
      Reform:"Reform", RUK:"Reform UK", Grn:"Green",
      SF:"Sinn Féin", DUP:"DUP", SDLP:"SDLP", UUP:"UUP",
      ALL:"Alliance", UKIP:"UKIP", Brexit:"Brexit", IND:"Independent",
      Ind:"Independent", NatLab:"National Labour", Nat:"National",
      Com:"Communist", ILP:"Ind. Labour", CW:"Co-operative", NILP:"NI Labour",
      Other:"Other",
    };
    return names[code] || code;
  }

  /* ─── 5. Load election data ─────────────────────────────────────── */
  function normName(s) {
    if (!s) return '';
    return String(s).trim().toLowerCase().replace(/\s*&\s*/g, ' and ').replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
  }

  /* ─── Load referendum results ────────────────────────────────────── */
  function loadRefData() {
    return fetch(resultsFile("ref2016"))
      .then(r => r.arrayBuffer())
      .then(buf => {
        const wb = XLSX.read(buf, { type: "array" });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets["Results"]);
        const data = {};
        rows.forEach(r => {
          data[r["Area Code"]] = {
            name:       r["Area Name"],
            winner:     r["Winner"],
            winnerPct:  +r["Winner %"],
            loser:      r["Loser"],
            loserPct:   +r["Loser %"],
            remain:     r["Remain Votes"],
            leave:      r["Leave Votes"],
            totalVotes: r["Total Votes"],
            pctRemain:  +r["Remain %"],
            pctLeave:   +r["Leave %"],
            margin:     +r["Margin"],
          };
        });
        return data;
      });
  }

  function loadElectionData(year) {
    return fetch(resultsFile(year))
      .then(res => res.arrayBuffer())
      .then(buf => {
        const wb = XLSX.read(buf, { type: "array" });
        const ridingRows = XLSX.utils.sheet_to_json(wb.Sheets["Ridings"]);
        const ridingData = {};
        ridingRows.forEach(r => {
          const entry = {
            winner:      r["Winner"],
            winnerPct:   +r["Winner %"],
            winnerVotes: r["Winner Votes"] || null,
            runnerUp:    r["Runner-Up"],
            runnerUpPct: +r["Runner-Up %"],
            runnerUpVotes: r["Runner-Up Votes"] || null,
            p3: r["P3"] || null, p3Pct: +r["P3 %"] || 0, p3Votes: r["P3 Votes"] || null,
            p4: r["P4"] || null, p4Pct: +r["P4 %"] || 0, p4Votes: r["P4 Votes"] || null,
            margin:      +r["Margin"],
            electorate:  r["Electorate"] || null,
            totalVotes:  r["Total Votes"] || null,
            mp:          r["MP"] || null,
            name:        r["Constituency"],
            region:      r["Region"],
          };
          // Index by ONS code (2010+/2024)
          if (r["Riding Code"]) ridingData[r["Riding Code"]] = entry;
          // Index by Norm Name column (preferred)
          if (r["Norm Name"]) ridingData[r["Norm Name"]] = entry;
          // Also index by normName(Constituency) — catches paren-stripping mismatches
          // between the Norm Name column and what normName() produces from the GeoJSON name
          const computed = normName(r["Constituency"]);
          if (computed) ridingData[computed] = entry;
        });
        const regionRows = XLSX.utils.sheet_to_json(wb.Sheets["Regions"]);
        const regionData = {};
        regionRows.forEach(r => {
          regionData[r["Region Code"]] = {
            winner:      r["Winner"],
            winnerPct:   +r["Winner %"],
            runnerUp:    r["Runner-Up"],
            runnerUpPct: +r["Runner-Up %"],
            margin:      +r["Margin"],
            seats:       +r["Seats Won"],
            totalSeats:  +r["Total Seats"],
          };
        });
        return { ridingData, regionData };
      })
      .catch(err => {
        console.warn(`Could not load results for ${year}:`, err);
        return { ridingData: {}, regionData: {} };
      });
  }

  /* ─── 6. Build the map ──────────────────────────────────────────── */
  function buildMap() {
    window.d3 = window.d3;
    const topojson = window.topojson;

    const container = document.getElementById("uk-map") ||
      (() => { const d = document.createElement("div"); d.id = "uk-map"; document.body.appendChild(d); return d; })();

    const W = 620, H = 820;

    const svg = d3.select(container)
      .append("svg")
      .attr("viewBox", `0 0 ${W} ${H}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const defs = svg.append("defs");
    const filter = defs.append("filter").attr("id", "grain");
    filter.append("feTurbulence").attr("type","fractalNoise").attr("baseFrequency","0.65").attr("numOctaves","3").attr("stitchTiles","stitch");
    filter.append("feColorMatrix").attr("type","saturate").attr("values","0");
    filter.append("feBlend").attr("in","SourceGraphic").attr("mode","multiply");

    // ── Election-night "gain" stripe patterns ──
    // Diagonal hatch overlays applied to constituencies that FLIPPED party
    // since the prior election. The base seat fill keeps its margin-shaded
    // party colour underneath; this is a separate translucent white-stripe
    // layer painted on top so the user can spot pickups at a glance.
    //
    // Crucially, each direction is its own pattern. We then map each party
    // to one direction via GAIN_STRIPE_ANGLE_FOR_PARTY below — that way two
    // adjacent gain seats from DIFFERENT parties get stripes at DIFFERENT
    // angles, so the user doesn't see a continuous moiré "fabric" across
    // the map when zoomed out, just little patches in different directions.
    const GAIN_STRIPE_DIRECTIONS = [
      { id: "gain-d-a", angle:  22.5 },
      { id: "gain-d-b", angle:  45.0 },
      { id: "gain-d-c", angle:  67.5 },
      { id: "gain-d-d", angle: 112.5 },
      { id: "gain-d-e", angle: 135.0 },
      { id: "gain-d-f", angle: 157.5 },
    ];
    GAIN_STRIPE_DIRECTIONS.forEach(({ id, angle }) => {
      // 6×6 unit tile with a single 1.6-wide stripe. patternTransform rotates
      // the WHOLE tile, so the stripe appears at the requested angle without
      // any geometry math here. patternUnits=userSpaceOnUse keeps the tile
      // size consistent in viewBox space regardless of seat polygon size.
      const p = defs.append("pattern")
        .attr("id", id)
        .attr("patternUnits", "userSpaceOnUse")
        .attr("width", 6).attr("height", 6)
        .attr("patternTransform", `rotate(${angle})`);
      // Transparent base so the seat's underlying party colour shows through
      // the gaps between stripes.
      p.append("rect").attr("width", 6).attr("height", 6).attr("fill", "transparent");
      p.append("rect")
        .attr("x", 0).attr("y", 0)
        .attr("width", 1.6).attr("height", 6)
        .attr("fill", "rgba(255,255,255,0.42)");
    });

    svg.append("rect").attr("width", W).attr("height", H).attr("fill", "#0d0f14");

    const projection = d3.geoMercator();
    const path = d3.geoPath().projection(projection);
    const mapG = svg.append("g").attr("class", "map-root");
    const highlightG = mapG.append("g").attr("class", "highlights");

    let currentK = 1;
    const zoom = d3.zoom()
      .scaleExtent([1, 20])
      .on("zoom", function (event) {
        const k = event.transform.k;
        currentK = k;
        mapG.attr("transform", event.transform);
        mapG.selectAll(".region").attr("stroke-width", 0.6 / k);
        mapG.selectAll(".region-label").attr("font-size", 7 / k);
        mapG.selectAll(".riding-mesh").attr("stroke-width", 0.5 / k);
        // Riding fills (national + zoomed) use vector-effect:
        // non-scaling-stroke, so their hairline width stays constant on
        // screen without any manual stroke-width adjustment on zoom.
        highlightG.selectAll(".region-selected-ring").attr("stroke-width", 1.5 / k);
        highlightG.selectAll(".region-hover-ring").attr("stroke-width", 1.2 / k);
        highlightG.selectAll(".riding-hover").attr("stroke-width", 0.9 / k);
      });

    svg.call(zoom);

    /* Tooltip — rebuilt from scratch on every call, no persistent child elements */
    let tooltip = document.getElementById("map-tooltip");
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.id = "map-tooltip";
      document.body.appendChild(tooltip);
    }

    const isMobile = window.matchMedia("(max-width: 768px)").matches || ("ontouchstart" in window);

    function pct(v) { return (v * 100).toFixed(1) + "%"; }
    function fmtVotes(v) { return v ? v.toLocaleString() : ""; }

    function setTooltip(name, label, elecData, isRegion) {
      if (!elecData || !elecData.winner) {
        tooltip.classList.remove("visible");
        return;
      }

      const mpLine = (!isRegion && elecData.mp) ? `<div style="font-size:0.65rem;color:#5a6280;margin-top:1px">MP: ${elecData.mp}</div>` : '';
      let html = `<div class="tt-name">${name}</div>${mpLine}`;
      if (label) html += `<div class="tt-abbr">${label}</div>`;

      // Swing line (constituencies only): when we have prior-election data
      // loaded (during or after an Election Night sim), show the swing in the
      // current winner's vote share vs the previous election. Same source and
      // computation as the toast that fires at declaration time, so the hover
      // tooltip reflects whatever scenario is on the map — historical results
      // by default, alternate-reality results when a shift is active.
      let swingLine = '';
      if (!isRegion && SIM.priorData && SIM.priorData.byNormName && elecData.winner) {
        const priorEntry = SIM.priorData.byNormName[normName(name)];
        if (priorEntry) {
          const swingPP = computeSwing(elecData, priorEntry);
          if (swingPP != null) {
            const sign = swingPP >= 0 ? "+" : "";
            const colour = partyColourAccent(elecData.winner);
            const yrLabel = SIM.priorYear != null ? ` vs ${SIM.priorYear}` : '';
            swingLine = `<div style="font-size:0.62rem;color:var(--muted);margin-top:4px">
              Swing to <span style="color:${colour}">${partyDisplayName(elecData.winner)}</span>: <b style="color:${colour}">${sign}${(swingPP * 100).toFixed(1)} pp</b>${yrLabel}
            </div>`;
          }
        }
      }

      if (isRegion) {
        const c1 = partyColourAccent(elecData.winner);
        const c2 = partyColourAccent(elecData.runnerUp);
        html += `<div class="tt-votes" style="display:flex;flex-direction:column;gap:2px;margin-top:6px">
          <span style="color:${c1}">▲ ${elecData.winner}  ${pct(elecData.winnerPct)}</span>
          ${elecData.runnerUp ? `<span style="color:${c2}">▲ ${elecData.runnerUp}  ${pct(elecData.runnerUpPct)}</span>` : ''}
          <span style="color:var(--muted);font-size:0.65rem;margin-top:2px">
            ${elecData.winner} +${pct(elecData.margin)} · ${elecData.seats}/${elecData.totalSeats} seats
          </span>
        </div>`;
      } else if (elecData.remain !== undefined) {
        // Referendum tooltip
        const leaveColour = "#5b9ec9", remainColour = "#e8c93c";
        const winnerColour = elecData.winner === "Leave" ? leaveColour : remainColour;
        tooltip.style.borderLeftColor = winnerColour;
        const leaveBar = Math.round((elecData.pctLeave / Math.max(elecData.pctLeave, elecData.pctRemain)) * 100);
        const remainBar = Math.round((elecData.pctRemain / Math.max(elecData.pctLeave, elecData.pctRemain)) * 100);
        // Winner shown first
        const first  = elecData.winner === "Leave"
          ? { label:"Leave",  colour:leaveColour,  pctVal:elecData.pctLeave,  votes:elecData.leave,  bar:leaveBar }
          : { label:"Remain", colour:remainColour, pctVal:elecData.pctRemain, votes:elecData.remain, bar:remainBar };
        const second = elecData.winner === "Leave"
          ? { label:"Remain", colour:remainColour, pctVal:elecData.pctRemain, votes:elecData.remain, bar:remainBar }
          : { label:"Leave",  colour:leaveColour,  pctVal:elecData.pctLeave,  votes:elecData.leave,  bar:leaveBar };
        const row = (r) => `<div style="margin-bottom:6px">
            <div style="display:flex;justify-content:space-between;margin-bottom:2px">
              <span style="color:${r.colour};font-weight:500">${r.label}</span>
              <span style="color:#8890aa;font-size:0.68rem">${pct(r.pctVal)}<span style="color:#3a4460;margin-left:6px">${fmtVotes(r.votes)}</span></span>
            </div>
            <div style="height:3px;background:#1e2330;border-radius:2px">
              <div style="height:100%;width:${r.bar}%;background:${r.colour};border-radius:2px;opacity:0.85"></div>
            </div>
          </div>`;
        html += `<div style="margin-top:8px">
          ${row(first)}${row(second)}
          <div style="font-size:0.6rem;color:#3a4460;margin-top:2px">
            ${elecData.winner} +${pct(elecData.margin)} · Total votes: ${fmtVotes(elecData.totalVotes)}
          </div>
        </div>`;
      } else {
        // Rich election riding view
        const parties = [
          { party: elecData.winner,   pctVal: elecData.winnerPct,   v: elecData.winnerVotes },
          { party: elecData.runnerUp, pctVal: elecData.runnerUpPct, v: elecData.runnerUpVotes },
          { party: elecData.p3,       pctVal: elecData.p3Pct,       v: elecData.p3Votes },
          { party: elecData.p4,       pctVal: elecData.p4Pct,       v: elecData.p4Votes },
        ].filter(p => p.party && p.pctVal > 0);

        const maxPct = parties[0] ? parties[0].pctVal : 1;
        html += `<div style="margin-top:8px">`;
        parties.forEach(p => {
          const colour = partyColourAccent(p.party);
          const barW = Math.round((p.pctVal / maxPct) * 100);
          const votesStr = p.v ? `<span style="color:#3a4460;margin-left:6px">${fmtVotes(p.v)}</span>` : '';
          html += `<div style="margin-bottom:6px">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px">
              <span style="color:${colour};font-weight:500">${p.party}</span>
              <span style="color:#8890aa;font-size:0.68rem">${pct(p.pctVal)}${votesStr}</span>
            </div>
            <div style="height:3px;background:#1e2330;border-radius:2px">
              <div style="height:100%;width:${barW}%;background:${colour};border-radius:2px;opacity:0.85"></div>
            </div>
          </div>`;
        });

        const marginStr = `Margin: ${pct(elecData.margin)}`;
        const turnoutStr = elecData.electorate && elecData.totalVotes
          ? ` · Turnout: ${pct(elecData.totalVotes / elecData.electorate)} (${fmtVotes(elecData.totalVotes)} / ${fmtVotes(elecData.electorate)})` : '';
        html += `<div style="font-size:0.6rem;color:#3a4460;margin-top:2px">${marginStr}${turnoutStr}</div>`;
        html += swingLine;
        html += `</div>`;
      }

      tooltip.innerHTML = html;
      tooltip.classList.add("visible");
    }

    /* ── "Awaiting declaration" tooltip for undeclared seats during sim ── */
    function setAwaitingTooltip(name) {
      tooltip.style.borderLeftColor = "var(--muted)";
      tooltip.innerHTML = `
        <div class="tt-name">${name}</div>
        <div class="tt-abbr" style="color:var(--muted)">Constituency</div>
        <div class="tt-margin" style="margin-top:8px;font-size:0.7rem;color:var(--muted)">
          ⏳ Awaiting declaration
        </div>`;
      tooltip.classList.add("visible");
    }

    /* ── Running-region tooltip during sim: shows region's seats declared so far ── */
    function setRunningRegionTooltip(name, code) {
      // Reverse-lookup the region's underscore-name from the ONS code
      const regionStr = Object.keys(RIDING_REGION_MAP).find(k => RIDING_REGION_MAP[k] === code);
      const totals = SIM.regionSeats[regionStr] || { byParty: {}, declared: 0, total: 0 };
      const sorted = Object.entries(totals.byParty).sort((a,b) => b[1] - a[1]);
      tooltip.style.borderLeftColor = "var(--accent)";
      let html = `<div class="tt-name">${name}</div>
        <div class="tt-abbr">Region · ${totals.declared}/${totals.total} declared</div>`;
      if (sorted.length) {
        html += `<div class="tt-votes" style="margin-top:6px">`;
        sorted.forEach(([party, count]) => {
          const c = partyColourAccent(party);
          html += `<span style="color:${c}">▲ ${partyDisplayName(party)} ${count}</span>`;
        });
        html += `</div>`;
      } else {
        html += `<div class="tt-margin" style="margin-top:8px;font-size:0.7rem;color:var(--muted)">
          ⏳ Awaiting first declaration
        </div>`;
      }
      tooltip.innerHTML = html;
      tooltip.classList.add("visible");
    }

    /* State */
    let activeYear = (window.ATLAS_INITIAL_YEAR && [2024,2019,2017,2015,2010,2005,2001,1997,1992,1987,1983,1979,1970,1966,1964,1959,1955,1951,1950,1945,1935,1931,1929,1924,1923,1922,1918,"ref2016","1974O","1974F"].includes(window.ATLAS_INITIAL_YEAR)) ? window.ATLAS_INITIAL_YEAR : 2024;
    let activeRegionCode = null;
    let ridingsData = null;
    let allRidings = null;
    let ridingData = {};
    let regionData = {};

    const resetBtn = document.getElementById("reset-btn");
    const loadingEl = document.getElementById("loading-indicator");

    /* Layer order: ridingG (background colours) → regionsLayer (transparent overlay, overview events)
                   → zoomedRidingG (zoomed riding fills, above region layer) → highlightG (rings) */
    const ridingG = mapG.append("g").attr("class", "ridings");
    const regionsLayer = mapG.append("g").attr("class", "regions-layer");
    const zoomedRidingG = mapG.append("g").attr("class", "zoomed-ridings");

    /* ── Load regions (once — regions file doesn't change) ── */
    d3.json(regionsFile()).then(function(regionsData) {
      const regions = topojson.feature(regionsData, regionsData.objects.regions);

      // Frame the projection on mainland UK including ALL of Cornwall in the
      // south-west. We use a MultiPoint as the fit target (4 corners of the
      // geographic box we want to fill) to avoid GeoJSON Polygon winding-order
      // issues that would invert "inside" and "outside" on the sphere.
      //
      // The chosen box ([-9°W, 49.5°N] → [2°E, 59°N]) trims Orkney/Shetland
      // off the top — they're still in the geometry so the user can pan to
      // them with mouse zoom — and gives full breathing room to Cornwall and
      // the Isles of Scilly at the bottom.
      const fitBox = {
        type: "MultiPoint",
        coordinates: [
          [-9.0, 49.5],   // SW of Land's End — leaves margin below Cornwall
          [ 2.0, 49.5],   // SE
          [ 2.0, 59.0],   // NE — top of Caithness, excludes Shetland
          [-9.0, 59.0],   // NW
        ],
      };
      projection.fitExtent([[16, 16], [W - 16, H - 16]], fitBox);

      const grat = d3.geoGraticule().step([2, 2]);
      mapG.insert("path", ":first-child")
        .datum(grat()).attr("class", "graticule").attr("d", path);

      /* Region fills */
      const regionPaths = regionsLayer.selectAll("path.region")
        .data(regions.features)
        .join("path")
        .attr("class", "region")
        .attr("d", path)
        .attr("data-code", d => d.properties.code)
        .attr("fill", "#1a2035");

      /* Region border mesh */
      regionsLayer.append("path")
        .datum(topojson.mesh(regionsData, regionsData.objects.regions, (a, b) => a !== b))
        .attr("fill", "none").attr("stroke", "#2a3350")
        .attr("stroke-width", 0.5).attr("stroke-linejoin", "round")
        .attr("d", path).attr("pointer-events", "none");

      /* Region labels */
      function largestPolygonCentroid(feature) {
        const geom = feature.geometry;
        if (!geom) return null;
        let polygons = [];
        if (geom.type === "Polygon") polygons = [{type:"Polygon",coordinates:geom.coordinates}];
        else if (geom.type === "MultiPolygon") polygons = geom.coordinates.map(c => ({type:"Polygon",coordinates:c}));
        if (!polygons.length) return null;
        let best = null, bestArea = -1;
        for (const poly of polygons) {
          const f = {type:"Feature",geometry:poly};
          const b = path.bounds(f);
          const area = (b[1][0]-b[0][0])*(b[1][1]-b[0][1]);
          if (area > bestArea) { bestArea = area; best = f; }
        }
        const c = path.centroid(best);
        return c && !isNaN(c[0]) ? c : null;
      }

      regionsLayer.append("g").attr("class", "labels")
        .selectAll("text").data(regions.features).join("text")
        .attr("class", "region-label")
        .attr("transform", d => { const c = largestPolygonCentroid(d); return c ? `translate(${c})` : "translate(-9999,-9999)"; })
        .text(d => REGION_ABBR[d.properties.name] || "");

      /* Region interactions */
      regionPaths
        .on("mousemove", function(event, d) {
          const code = d.properties.code;
          // Don't show region hover for the currently active region (ridings handle it)
          if (code === activeRegionCode) return;
          if (SIM.running) {
            setRunningRegionTooltip(d.properties.name, code);
          } else {
            setTooltip(d.properties.name, REGION_ABBR[d.properties.name] || code, regionData[code], true);
          }
          if (!isMobile) { tooltip.style.left = (event.clientX + 14) + "px"; tooltip.style.top = (event.clientY - 36) + "px"; }
          mapG.append(() => highlightG.node());
          highlightG.selectAll(".region-hover-ring").remove();
          highlightG.append("path").attr("class","region-hover-ring")
            .datum(d).attr("d", path).attr("fill","none").attr("stroke","#ffffff")
            .attr("stroke-width", 0.7).attr("stroke-opacity", 0.75).attr("pointer-events","none");
        })
        .on("mouseleave", function() {
          tooltip.classList.remove("visible");
          highlightG.selectAll(".region-hover-ring").remove();
        })
        .on("click", function(event, d) {
          const code = d.properties.code;
          if (code === activeRegionCode) return;
          activeRegionCode = code;
          regionPaths.classed("selected", false);
          d3.select(this).classed("selected", true);
          highlightG.selectAll(".region-hover-ring,.region-selected-ring").remove();
          highlightG.append("path").attr("class","region-selected-ring")
            .datum(d).attr("d", path).attr("fill","none").attr("stroke","#ffffff")
            .attr("stroke-width", 3).attr("stroke-opacity", 0.9).attr("pointer-events","none");
          if (ridingsData) showRidings(code);  // works for both election and ref modes
          // Move zoomedRidingG above regionsLayer so it intercepts events inside the region,
          // but regionPaths still intercept events outside it for hover rings.
          regionsLayer.node().parentNode.insertBefore(zoomedRidingG.node(), regionsLayer.node().nextSibling);
          mapG.append(() => highlightG.node());
          zoomToRegion(d);
          resetBtn.classList.add("visible");
        });

      /* ── Initial load ── */
      const yearSelect = document.getElementById("year-select");
      if (yearSelect) yearSelect.value = String(activeYear);
      loadYear(activeYear, regionPaths);

      /* ── Bottom-bar year controls (slider + prev/next) ──
         Year list is ordered newest → oldest so the slider's right-most position
         is the most recent election. We treat the slider as an index into this list. */
      const YEARS_LIST = [2024, 2019, 2017, "ref2016", 2015, 2010, 2005, 2001, 1997, 1992, 1987, 1983, 1979, "1974O", "1974F", 1970, 1966, 1964, 1959, 1955, 1951, 1950, 1945, 1935, 1931, 1929, 1924, 1923, 1922, 1918];
      function yearLabel(yr) {
        return yr === "ref2016" ? "2016 Ref"
             : yr === "1974O"   ? "Oct 1974"
             : yr === "1974F"   ? "Feb 1974"
             : String(yr);
      }
      const slider     = document.getElementById("year-slider");
      const yearDisplay= document.getElementById("year-display");
      const prevBtn    = document.getElementById("prev-btn");
      const nextBtn    = document.getElementById("next-btn");
      if (slider) {
        // Reverse the visual order so the slider goes oldest → newest left → right.
        // Index 0 = oldest (1918), index N-1 = newest (2024).
        slider.min = 0;
        slider.max = YEARS_LIST.length - 1;
        slider.step = 1;
        function syncSlider() {
          const idx = YEARS_LIST.indexOf(activeYear);
          // Map list index to slider value: idx=0 (newest) → slider=max
          slider.value = String(YEARS_LIST.length - 1 - idx);
          yearDisplay.textContent = yearLabel(activeYear);
          prevBtn.disabled = idx === YEARS_LIST.length - 1;  // can't go older than 1918
          nextBtn.disabled = idx === 0;                       // can't go newer than 2024
        }
        function applyYear(yr) {
          if (yr === activeYear) return;
          activeYear = yr;
          if (yearSelect) yearSelect.value = String(yr);
          syncSlider();

          // Drop any prior-election data left over from a previous sim run on
          // a different year — otherwise hover-swing lookups would join a
          // stale prior year against the new year's constituencies.
          SIM.priorData = null;
          SIM.priorYear = null;
          SIM.gainKeys = new Set();
          SIM.gainInfo = {};

          ridingG.selectAll("*").remove();
          zoomedRidingG.selectAll("*").remove();
          highlightG.selectAll(".region-hover-ring").remove();

          if (activeRegionCode) {
            loadYear(yr, regionPaths, activeRegionCode);
          } else {
            highlightG.selectAll("*").remove();
            resetBtn.classList.remove("visible");
            svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity);
            loadYear(yr, regionPaths);
          }
        }
        syncSlider();

        slider.addEventListener("input", function() {
          const sliderVal = +this.value;
          const idx = YEARS_LIST.length - 1 - sliderVal;
          applyYear(YEARS_LIST[idx]);
        });
        prevBtn.addEventListener("click", function() {
          const idx = YEARS_LIST.indexOf(activeYear);
          if (idx < YEARS_LIST.length - 1) applyYear(YEARS_LIST[idx + 1]);
        });
        nextBtn.addEventListener("click", function() {
          const idx = YEARS_LIST.indexOf(activeYear);
          if (idx > 0) applyYear(YEARS_LIST[idx - 1]);
        });
      }

      /* ── Year dropdown (still wired for completeness even though hidden) ── */
      if (yearSelect) {
        yearSelect.addEventListener("change", function() {
          const STRING_YEARS = ["ref2016", "1974O", "1974F"];
          const raw = this.value;
          const yr = STRING_YEARS.includes(raw) ? raw : +raw;
          if (yr === activeYear) return;
          activeYear = yr;

          ridingG.selectAll("*").remove();
          zoomedRidingG.selectAll("*").remove();
          highlightG.selectAll(".region-hover-ring").remove();

          if (activeRegionCode) {
            // Stay zoomed on the active region — just reload data for new year
            loadYear(yr, regionPaths, activeRegionCode);
          } else {
            highlightG.selectAll("*").remove();
            resetBtn.classList.remove("visible");
            svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity);
            loadYear(yr, regionPaths);
          }
        });
      }

    });

    /* ── Extract results embedded in old boundary file properties ── */
    // Old boundary files (pre-1955) bake results in as year-prefixed keys on each feature,
    // e.g. "1918_Winner", "1918_Margin". Build a ridingData lookup from those directly,
    // keyed by normalised name so the render lookups work identically to XLSX data.
    function extractEmbeddedRidingData(features, era) {
      const yr = String(era);
      const data = {};
      features.forEach(function(f) {
        const p = f.properties;
        const rawName = p.Name || p.name || "";
        const constituency = p[yr + "_Constituency"] || rawName;
        const entry = {
          name:          constituency,
          winner:        p[yr + "_Winner"]          || null,
          winnerPct:     +(p[yr + "_Winner_Pct"]    || 0),
          winnerVotes:   p[yr + "_Winner_Votes"]    || null,
          runnerUp:      p[yr + "_Runner_Up"]       || null,
          runnerUpPct:   +(p[yr + "_Runner_Up_Pct"] || 0),
          runnerUpVotes: p[yr + "_Runner_Up_Votes"] || null,
          p3:            p[yr + "_P3"]              || null,
          p3Pct:         +(p[yr + "_P3_Pct"]        || 0),
          p3Votes:       p[yr + "_P3_Votes"]        || null,
          p4:            p[yr + "_P4"]              || null,
          p4Pct:         +(p[yr + "_P4_Pct"]        || 0),
          p4Votes:       p[yr + "_P4_Votes"]        || null,
          margin:        +(p[yr + "_Margin"]         || 0),
          electorate:    p[yr + "_Electorate"]      || null,
          totalVotes:    p[yr + "_Total_Votes"]     || null,
          mp:            p[yr + "_MP"]              || null,
          region:        p[yr + "_Region"]          || null,
        };
        if (rawName)      data[normName(rawName)]      = entry;
        if (constituency && constituency !== rawName) data[normName(constituency)] = entry;
      });
      return data;
    }

    /* ── Load a year's boundary + results ── */
    function loadYear(year, regionPaths, savedRegion) {
      loadingEl.style.display = "block";

      if (isRefMode(year)) {
        // ── Referendum mode ──
        // Keep region overlay visible in ref mode for zoom interaction
        Promise.all([
          d3.json(refBoundaryFile()),
          loadRefData(),
        ]).then(function([rData, refResults]) {
          ridingsData = rData;
          // Object name depends on mapshaper input filename — try 'authorities' then use first object
          const refObj = ridingsData.objects.authorities
            || ridingsData.objects[Object.keys(ridingsData.objects)[0]];
          allRidings = topojson.feature(ridingsData, refObj);
          ridingData = refResults;
          regionData = {};
          showAllRidings();
          updateLegend(year, ridingData);
          loadingEl.style.display = "none";
        }).catch(err => {
          console.error("Failed to load referendum data:", err);
          loadingEl.style.display = "none";
        });
      } else {
        // ── Election mode ──
        // Region overlay always visible
        const era = YEAR_TO_ERA[year];
        Promise.all([
          d3.json(ridingsFile(era)),
          loadElectionData(year),
        ]).then(function([rData, elecResults]) {
          ridingsData = rData;
          allRidings = topojson.feature(ridingsData, ridingsData.objects.ridings);
          // Only use XLSX data if it has meaningful (non-empty) keys — an xlsx with
          // wrong column names still produces entries keyed by "" which we must ignore.
          const xlsxKeys = Object.keys(elecResults.ridingData).filter(k => k.length > 0);
          if (xlsxKeys.length > 0) {
            ridingData = elecResults.ridingData;
            regionData = elecResults.regionData;
          } else {
            ridingData = extractEmbeddedRidingData(allRidings.features, era);
            regionData = {};
          }
          showAllRidings();
          if (savedRegion) showRidings(savedRegion);
          updateLegend(year, ridingData);
          loadingEl.style.display = "none";
        }).catch(err => {
          console.error("Failed to load year data:", err);
          loadingEl.style.display = "none";
        });
      }
    }

    /* ── Show all ridings at once (full map colouring) ── */
    function showAllRidings() {
      ridingG.selectAll("*").remove();
      if (!ridingsData) return;

      const era = YEAR_TO_ERA[activeYear];
      // During an active sim, undeclared seats stay grey and declared seats
      // take their winner colour (from shifted data if a shift scenario is
      // running). Outside the sim — or once a sim has naturally completed —
      // every seat shows its (possibly shifted) result. This is the same
      // behaviour as showRidings() applies to the zoomed-fill layer, so the
      // unzoomed and zoomed views stay in sync when the user resets the view
      // mid-sim.
      ridingG.selectAll(".riding-fill")
        .data(allRidings.features)
        .join("path")
        .attr("class", "riding-fill")
        .attr("d", path)
        .attr("fill", d => {
          if (isRefMode(activeYear)) {
            const data = ridingData[d.properties.code] || ridingData[normName(d.properties.name || d.properties.Name)] || ridingData[normName(d.properties[era + "_Constituency"] || "")];
            return refColour(data);
          }
          if (SIM.running && !isFeatureDeclared(d)) return "#1a2035";
          return ridingColour(dataForFeature(d, era));
        })
        // Constant light-grey hairline between every constituency — visible
        // in all atlas years and in election night (declared + undeclared),
        // so adjacent same-party seats stay visually distinct.
        .attr("stroke", "var(--riding-stroke)")
        .attr("data-declared", d => (SIM.running && !isFeatureDeclared(d)) ? null : "1")
        .attr("stroke-width", 0.6)
        .attr("vector-effect", "non-scaling-stroke")
        .attr("pointer-events", "all")
        .on("mousemove", function(event, d) {
          const name = d.properties.name || d.properties.Name;
          if (SIM.running && !isRefMode(activeYear) && !isFeatureDeclared(d)) {
            setAwaitingTooltip(name);
          } else {
            // Use dataForFeature so the hovered tooltip reflects the active
            // scenario (shifted results during a non-historical sim).
            const data = isRefMode(activeYear)
              ? (ridingData[d.properties.code] || ridingData[normName(d.properties.name || d.properties.Name)] || ridingData[normName(d.properties[era + "_Constituency"] || "")])
              : dataForFeature(d, era);
            setTooltip(name, "Constituency", data);
          }
          tooltip.style.left = (event.clientX + 14) + "px";
          tooltip.style.top  = (event.clientY - 36) + "px";
          highlightG.selectAll(".riding-hover").remove();
          highlightG.append("path").attr("class","riding-hover")
            .datum(d).attr("d", path).attr("fill","none").attr("stroke","#ffffff")
            .attr("stroke-width", 0.4).attr("stroke-opacity", 0.8).attr("pointer-events","none");
        })
        .on("mouseleave", function(event) {
          // Only hide if leaving the SVG entirely, not just crossing into another riding
          const rel = event.relatedTarget;
          if (!rel || !rel.classList || !rel.classList.contains("riding-fill")) {
            tooltip.classList.remove("visible");
            highlightG.selectAll(".riding-hover").remove();
          }
        });

      // No separate mesh — stroke matches fill colour so borders are invisible

      mapG.append(() => highlightG.node());

      // If a sim is mid-flight (or just completed and the user has reset
      // zoom), the freshly-built riding-fill layer doesn't carry the stripe
      // overlays we painted as gains came in. Re-attach them here.
      if (SIM.gainKeys && SIM.gainKeys.size > 0) repaintGainOverlays();
    }

    /* ── Show clipped fills above the region layer when zoomed in ── */
    function showRidings(regionCode) {
      zoomedRidingG.selectAll("*").remove();
      if (!ridingsData) return;

      // Get the TopoJSON object (ridings for elections, authorities for referendum)
      const topoObjName = isRefMode(activeYear)
        ? (ridingsData.objects.authorities ? "authorities" : Object.keys(ridingsData.objects)[0])
        : "ridings";
      const topoObj = ridingsData.objects[topoObjName];

      // For elections, filter by underscore region string; for ref, filter by ONS code directly.
      // Old boundary files store region as a year-prefixed key (e.g. "1918_Region") not "region".
      // Some pre-partition files (1918) tag NI constituencies as "Ireland" — normalise to "NI"
      // so they match the selector for the modern Northern Ireland region.
      const era = YEAR_TO_ERA[activeYear];
      function getRidingRegion(props) {
        const raw = props.region || props[era + "_Region"] || null;
        return raw === "Ireland" ? "NI" : raw;
      }
      const regionFilter = isRefMode(activeYear)
        ? (g => g.properties.region === regionCode)
        : (function() {
            const regionStr = Object.keys(RIDING_REGION_MAP).find(k => RIDING_REGION_MAP[k] === regionCode);
            return g => getRidingRegion(g.properties) === regionStr;
          })();

      const regionRidings = allRidings.features.filter(r =>
        isRefMode(activeYear)
          ? r.properties.region === regionCode
          : getRidingRegion(r.properties) === Object.keys(RIDING_REGION_MAP).find(k => RIDING_REGION_MAP[k] === regionCode)
      );

      const filteredGeoms = topoObj.geometries.filter(regionFilter);
      const subObject = Object.assign({}, topoObj, { geometries: filteredGeoms });

      const interiorMesh = topojson.mesh(ridingsData, subObject, (a, b) => a !== b);
      const outerBoundary = topojson.mesh(ridingsData, subObject, (a, b) => a === b);

      // Some boundary files (e.g. NI in ridings-1945.json) have over-shared arcs:
      // nearly every arc is used by multiple features in the region, so the
      // (a === b) mesh returns an almost-empty MultiLineString. The resulting
      // clipPath ends up degenerate and clips away the .zoomed-fill paths
      // entirely — they render invisible and receive no pointer events
      // (which is why hover stops working, even though the fills underneath
      // in ridingG still show through). Detect this and skip clipping.
      const outerSegments = (outerBoundary && outerBoundary.coordinates) ? outerBoundary.coordinates.length : 0;
      const useClip = outerSegments >= Math.max(3, regionRidings.length / 4);

      let clippedG;
      if (useClip) {
        const clipId = "clip-zoomed-" + regionCode;
        zoomedRidingG.append("defs")
          .append("clipPath").attr("id", clipId)
          .append("path").attr("d", path(outerBoundary));
        clippedG = zoomedRidingG.append("g").attr("clip-path", `url(#${clipId})`);
      } else {
        clippedG = zoomedRidingG.append("g");
      }

      /* Riding fills — sit above region layer so they receive all pointer events */
      clippedG.selectAll(".zoomed-fill")
        .data(regionRidings)
        .join("path")
        .attr("class", "zoomed-fill")
        .attr("d", path)
        .attr("fill", d => {
          if (isRefMode(activeYear)) {
            const data = ridingData[d.properties.code] || ridingData[normName(d.properties.name || d.properties.Name)] || ridingData[normName(d.properties[era + "_Constituency"] || "")];
            return refColour(data);
          }
          // Sim-aware: undeclared ridings show grey
          if (SIM.running && !isFeatureDeclared(d)) return "#1a2035";
          // dataForFeature returns the shifted entry when a shift is active,
          // so an alternate-reality run paints these zoomed ridings correctly.
          return ridingColour(dataForFeature(d, era));
        })
        // Constant light-grey hairline. non-scaling-stroke keeps the visual
        // width fixed regardless of zoom level, so the border stays a
        // hairline whether the user is on the full UK or zoomed into London.
        .attr("stroke", "var(--riding-stroke)")
        .attr("data-declared", d => (SIM.running && !isFeatureDeclared(d)) ? null : "1")
        .attr("stroke-width", 0.6)
        .attr("vector-effect", "non-scaling-stroke")
        .on("mousemove touchstart", function(event, d) {
          event.preventDefault && event.preventDefault();
          const areaLabel = isRefMode(activeYear) ? "Local Authority" : "Constituency";
          const name = d.properties.name || d.properties.Name;
          if (SIM.running && !isRefMode(activeYear) && !isFeatureDeclared(d)) {
            setAwaitingTooltip(name);
          } else {
            const data = isRefMode(activeYear)
              ? (ridingData[d.properties.code] || ridingData[normName(d.properties.name || d.properties.Name)] || ridingData[normName(d.properties[era + "_Constituency"] || "")])
              : dataForFeature(d, era);
            setTooltip(name, areaLabel, data);
          }
          if (!isMobile) { tooltip.style.left = (event.clientX + 14) + "px"; tooltip.style.top = (event.clientY - 36) + "px"; }
          highlightG.selectAll(".riding-hover").remove();
          highlightG.append("path").attr("class", "riding-hover")
            .datum(d).attr("d", path)
            .attr("fill", "none").attr("stroke", "#ffffff")
            .attr("stroke-width", 0.9 / currentK).attr("stroke-opacity", 0.9)
            .attr("pointer-events", "none");
        })
        .on("mouseleave", function(event) {
          const rel = event.relatedTarget;
          if (!rel || !rel.classList || !rel.classList.contains("zoomed-fill")) {
            tooltip.classList.remove("visible");
            highlightG.selectAll(".riding-hover").remove();
          }
        });

      // Borders handled by per-fill stroke-matching above

      mapG.append(() => highlightG.node());

      // Re-attach gain-stripe overlays for any already-flipped seats — see
      // the matching call at the end of showAllRidings.
      if (SIM.gainKeys && SIM.gainKeys.size > 0) repaintGainOverlays();
    }

    /* ── Zoom to region ── */
    function zoomToRegion(feature) {
      const [[x0, y0], [x1, y1]] = path.bounds(feature);
      const bW = x1 - x0, bH = y1 - y0;

      // Use actual rendered SVG client size so we fill the real viewport,
      // not just the 600×800 viewBox coordinate space.
      const svgEl = svg.node();
      const clientW = svgEl.clientWidth  || W;
      const clientH = svgEl.clientHeight || H;

      // viewBox → client scaling factors
      const vbScaleX = clientW / W;
      const vbScaleY = clientH / H;

      // How many viewBox units the UI chrome occupies:
      //   top: year selector bar ~50px client → in viewBox units
      //   sides/bottom: small safety margin
      // If the Election Night scoreboard is on screen, measure its real
      // height (header + body + footer + a touch of breathing room) and
      // treat that as additional top chrome — otherwise the zoom centres
      // the region behind the scoreboard.
      let topChromePx = 56; // year selector default
      const simBoardEl = document.getElementById("sim-board");
      if (simBoardEl && simBoardEl.classList.contains("visible")) {
        const rect = simBoardEl.getBoundingClientRect();
        // bottom edge of scoreboard relative to top of viewport, + gap
        topChromePx = Math.max(topChromePx, rect.bottom + 12);
      }
      const padTopVB    = topChromePx / vbScaleY;
      const padSideVB   = 20 / vbScaleX;   // left/right
      const padBottomVB = 20 / vbScaleY;   // bottom

      // Available viewBox area after subtracting chrome
      const availW = W - 2 * padSideVB;
      const availH = H - padTopVB - padBottomVB;

      // Fit scale: fill the available area, pick the binding axis
      const scale = Math.min(
        availW / bW,
        availH / bH,
        18   // hard cap for tiny regions
      );

      // Centre of the region in viewBox coords
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;

      // Translate so the region centre lands at the centre of the available area
      // (shifted down by half the top chrome)
      const targetX = padSideVB + availW / 2;
      const targetY = padTopVB  + availH / 2;

      svg.transition().duration(650).call(
        zoom.transform,
        d3.zoomIdentity
          .translate(targetX - scale * cx, targetY - scale * cy)
          .scale(scale)
      );
    }

    /* ── Reset ── */
    function resetMap() {
      activeRegionCode = null;
      regionsLayer.selectAll(".region").classed("selected", false);
      highlightG.selectAll("*").remove();
      zoomedRidingG.selectAll("*").remove();
      resetBtn.classList.remove("visible");
      // Re-append highlightG so hover rings render above region layer
      mapG.append(() => highlightG.node());
      svg.transition().duration(650).call(zoom.transform, d3.zoomIdentity);
      showAllRidings();
    }

    resetBtn.addEventListener("click", resetMap);

    /* ═══════════════════════════════════════════════════════════════
       ELECTION NIGHT SIMULATOR
       ═══════════════════════════════════════════════════════════════
       Reuses the buildMap-scoped state: ridingsData, allRidings,
       ridingData, activeYear, ridingG, zoomedRidingG, regionsLayer,
       projection, path, svg, zoom, etc.

       Per-seat declarations are toasts; majority + hung-parliament are
       big banners. Each declaration paints its riding fill and updates
       a top-of-screen scoreboard with seats-per-party + threshold line.
    */
    const SIM = {
      running: false,
      paused: false,
      // speed = sim-minutes elapsed per real-second.
      // Matches the US atlas's options:
      //   0.5  → real-time (1 sim sec / 1 real sec)
      //   1    → 1 min / sec
      //   5    → 5 min / sec
      //   15   → 15 min / sec ("blitz")
      speed: 1,
      clockHours: POLL_CLOSE_HOURS,
      lastTick: 0,
      rafId: null,
      schedule: [],         // [{ridingKey, declareAt, feature, data}, ...] sorted
      nextIdx: 0,
      declared: new Set(),  // ridingKey strings already declared
      seatsByParty: {},     // winner code -> count
      // Net seat change per party vs the prior election, computed seat-by-seat
      // as declarations come in: +1 each time a party WINS a seat the other
      // party held last time, -1 each time a party LOSES a seat it held last
      // time. Crucially this is NOT (current seats - prior total seats) —
      // that would show "Lab -250" when only 1 of Labour's 200+ seats has
      // declared. It's the running tally of net pickups, which is what the
      // broadcasters' "+/-" column shows on the night.
      partyDelta: {},       // party code -> net change so far
      // Constituency keys that have been declared as GAINS (i.e. flipped party
      // from the prior election). Tracked separately so that when the user
      // zooms in/out mid-sim — which rebuilds ridingG / zoomedRidingG from
      // scratch — we can re-paint the diagonal-stripe overlay onto every
      // already-flipped seat without rerunning all the declarations.
      gainKeys: new Set(),
      // Per-key cache of the data + pattern id so re-painting after zoom
      // doesn't need to re-derive party / pattern direction.
      gainInfo: {},         // key -> { patId, winner }
      // National popular vote running totals (sum of all declared seats)
      popVote: {},          // party code -> total votes
      popVoteTotal: 0,      // sum across all parties for percentage
      // Region-level running totals (for region hover during sim)
      regionSeats: {},      // region code/name -> { party -> count, declaredCount }
      totalSeats: 650,      // canonical House of Commons size for the active year
      mappedSeats: 0,       // how many seats we actually have boundary geometry for
      threshold: 326,       // canonical majority threshold
      winnerParty: null,    // first party to reach threshold
      hungDeclared: false,  // true once we've declared mathematically-hung
      priorData: null,      // {byNormName: {name -> entry}} from previous election
      priorYear: null,
      // Shift simulator (alternate-reality scenarios):
      //   null  = run against the real historical results
      //   else  = { target, sigma, nationalShift, secret }
      shift: null,
      shiftedData: null,    // ridingKey -> shifted entry (winner/votes/etc.)
      // US-style speed levels (sim-minutes per real-second)
      speedLevels: [
        { v: 0.5, label: "Real-time (1× speed)" },
        { v: 1,   label: "Normal (1 min = 1 sec)" },
        { v: 5,   label: "Fast (5 min = 1 sec)" },
        { v: 15,  label: "Blitz (15 min = 1 sec)" },
      ],
      speedIdx: 1,
      runId: 0,
    };

    /* ── Standard normal random (Box-Muller) ── */
    function gaussian() {
      let u = 0, v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    /* ── Build alternate-reality vote tallies for the active year ──
       For each constituency we compute current shares, shift `localShift`
       percentage points toward the target (drained proportionally from the
       other listed parties), jitter, renormalize, and convert back to vote
       counts. Northern Ireland's parties don't fit GB-wide shifts cleanly,
       so for any GB-party target we leave NI seats alone. The original
       ridingData object is NEVER mutated. */
    function buildShiftedData(target, sigma) {
      const cap = sigma * 3;
      let nationalShift = Math.abs(gaussian()) * sigma;
      if (nationalShift > cap) nationalShift = cap;

      const jitterSigma = Math.max(0.4, sigma * 0.35);

      // GB-wide target → NI seats stay historical.
      const NI_PARTIES = new Set(["DUP", "UUP", "SDLP", "SF", "ALL", "TUV"]);
      const isGbTarget = !NI_PARTIES.has(target);

      const out = {};
      const seen = new Set();
      Object.keys(ridingData).forEach(key => {
        const d = ridingData[key];
        if (!d || seen.has(d)) return;
        seen.add(d);
        // Cache all key aliases that pointed at this same entry so the
        // shifted map mirrors the original's lookup paths.
        const aliases = Object.keys(ridingData).filter(k => ridingData[k] === d);

        // Don't shift NI seats when target is a GB party (and vice versa).
        const winnerIsNI = NI_PARTIES.has(d.winner);
        if (isGbTarget && winnerIsNI) {
          aliases.forEach(a => { out[a] = d; });
          return;
        }

        const total = +d.totalVotes || 0;
        // Unopposed / corrupt / no-vote-count: leave alone.
        if (total <= 0 || (d.winnerVotes || 0) <= 0 || d.winnerVotes === -1) {
          aliases.forEach(a => { out[a] = d; });
          return;
        }

        // Pull the four slots into arrays we can manipulate
        const slots = [
          { party: d.winner,   votes: +d.winnerVotes   || 0 },
          { party: d.runnerUp, votes: +d.runnerUpVotes || 0 },
          { party: d.p3,       votes: +d.p3Votes       || 0 },
          { party: d.p4,       votes: +d.p4Votes       || 0 },
        ].filter(s => s.party && s.votes > 0);
        if (slots.length === 0) {
          aliases.forEach(a => { out[a] = d; });
          return;
        }

        // Filter out corrupt "Other" rows where votes ≥ totalVotes (legacy 1983 bug)
        const validSlots = slots.filter((s, i) => i === 0 || s.votes < total);

        // Convert to percentages
        const validTotal = validSlots.reduce((sum, s) => sum + s.votes, 0);
        validSlots.forEach(s => { s.pct = s.votes / validTotal * 100; });

        let localShift = nationalShift + gaussian() * jitterSigma;
        if (localShift < 0) localShift = 0;
        if (localShift > cap * 1.3) localShift = cap * 1.3;

        // Find or insert the target as a slot
        let targetSlot = validSlots.find(s => s.party === target);
        if (!targetSlot) {
          // Insert with zero share — it will gain `localShift` points from others.
          targetSlot = { party: target, votes: 0, pct: 0 };
          validSlots.push(targetSlot);
        }

        // Others = everyone except the target
        const others = validSlots.filter(s => s !== targetSlot);
        const othersPct = others.reduce((sum, s) => sum + s.pct, 0);
        const eff = Math.min(localShift, othersPct);
        targetSlot.pct += eff;
        if (othersPct > 0) {
          others.forEach(s => {
            s.pct = s.pct - eff * (s.pct / othersPct);
          });
        }

        // Independent small jitter on each share to avoid uncanny smoothness
        validSlots.forEach(s => { s.pct += gaussian() * 0.6; });
        // Clamp and renormalize
        validSlots.forEach(s => { if (s.pct < 0) s.pct = 0; });
        const sumPct = validSlots.reduce((sum, s) => sum + s.pct, 0);
        if (sumPct > 0) validSlots.forEach(s => { s.pct = s.pct / sumPct * 100; });

        // Convert back to vote counts using the original turnout, then sort
        // by votes desc so winner/runner-up/etc. land in the right slots.
        validSlots.forEach(s => { s.votes = Math.round(total * s.pct / 100); });
        validSlots.sort((a, b) => b.votes - a.votes);

        // Build the new entry
        const newWinner   = validSlots[0];
        const newRunnerUp = validSlots[1] || null;
        const newP3       = validSlots[2] || null;
        const newP4       = validSlots[3] || null;
        const newTotal    = validSlots.reduce((sum, s) => sum + s.votes, 0) || total;
        const winnerPct   = newWinner.votes / newTotal;
        const runnerPct   = newRunnerUp ? newRunnerUp.votes / newTotal : 0;

        const shifted = Object.assign({}, d, {
          winner:         newWinner.party,
          winnerVotes:    newWinner.votes,
          winnerPct:      winnerPct,
          runnerUp:       newRunnerUp ? newRunnerUp.party : null,
          runnerUpVotes:  newRunnerUp ? newRunnerUp.votes : null,
          runnerUpPct:    newRunnerUp ? runnerPct : null,
          p3:             newP3 ? newP3.party : null,
          p3Votes:        newP3 ? newP3.votes : null,
          p3Pct:          newP3 ? newP3.votes / newTotal : null,
          p4:             newP4 ? newP4.party : null,
          p4Votes:        newP4 ? newP4.votes : null,
          p4Pct:          newP4 ? newP4.votes / newTotal : null,
          margin:         winnerPct - runnerPct,
          totalVotes:     newTotal,
        });

        aliases.forEach(a => { out[a] = shifted; });
      });

      return { data: out, nationalShift };
    }

    /* ── Resolve which data source to use for a given key ── */
    function getSimEntry(key) {
      if (SIM.shiftedData && SIM.shiftedData[key]) return SIM.shiftedData[key];
      return ridingData[key];
    }

    // For sim-aware tooltip: which feature has been declared?
    function isFeatureDeclared(feature) {
      if (!SIM.running) return true;  // outside sim, always "declared"
      const era = YEAR_TO_ERA[activeYear];
      return SIM.declared.has(ridingKeyFor(feature, era));
    }

    const simBtn = document.getElementById("sim-btn");
    const simPauseBtn = document.getElementById("sim-pause-btn");
    const simSpeedBtn = document.getElementById("sim-speed-btn");
    const simBoard = document.getElementById("sim-board");
    const simToasts = document.getElementById("sim-toasts");
    const simBanner = document.getElementById("sim-banner");
    const simConfig = document.getElementById("sim-config");

    /* ── Helper: stable per-seat key independent of indexing scheme ── */
    function ridingKeyFor(feature, era) {
      const p = feature.properties || {};
      return p.code
          || normName(p.name || p.Name || "")
          || normName(p[era + "_Constituency"] || "")
          || String(p.id || Math.random());
    }

    /* ── Helper: look up the result entry for a feature ──
       If a sim shift is active, returns the alternate-reality entry; otherwise
       the real historical one. */
    function dataForFeature(feature, era) {
      const p = feature.properties || {};
      const src = SIM.shiftedData || ridingData;
      return src[p.code]
          || src[normName(p.name || p.Name)]
          || src[normName(p[era + "_Constituency"] || "")]
          || null;
    }

    /* ── Helper: get the year that came BEFORE the active one in YEARS list ── */
    function previousElectionYear(currentYr) {
      const idx = YEARS.indexOf(currentYr);
      if (idx === -1) return null;
      for (let i = idx + 1; i < YEARS.length; i++) {
        const y = YEARS[i];
        if (y !== "ref2016") return y;
      }
      return null;
    }

    /* ── Load previous election results (for swing). Tolerant of missing data. ── */
    function loadPriorForSwing(currentYr) {
      const prev = previousElectionYear(currentYr);
      if (prev == null) return Promise.resolve({ byNormName: {}, year: null });
      // Load XLSX if available; fall back to extracting embedded data from prev boundary
      return loadElectionData(prev)
        .then(result => {
          const xlsxKeys = Object.keys(result.ridingData).filter(k => k.length > 0);
          if (xlsxKeys.length > 0) {
            // ridingData here is indexed multiple ways — keep only entries
            // keyed by normalised constituency name for swing lookup.
            const byNorm = {};
            Object.entries(result.ridingData).forEach(([k, v]) => {
              if (v && v.name) byNorm[normName(v.name)] = v;
            });
            return { byNormName: byNorm, year: prev };
          }
          // Fall back to the boundary-embedded data for the prior era
          const prevEra = YEAR_TO_ERA[prev];
          return d3.json(ridingsFile(prevEra))
            .then(boundary => {
              const feats = topojson.feature(boundary, boundary.objects.ridings).features;
              const extracted = extractEmbeddedRidingData(feats, prevEra);
              return { byNormName: extracted, year: prev };
            })
            .catch(() => ({ byNormName: {}, year: null }));
        })
        .catch(() => ({ byNormName: {}, year: null }));
    }

    /* ── Compute swing (% points) for a winner between two elections ── */
    function computeSwing(currentEntry, priorEntry) {
      if (!currentEntry || !priorEntry || !currentEntry.winner) return null;
      const winner = currentEntry.winner;
      const curPct = currentEntry.winnerPct || 0;
      // Find this same party's % in the prior election
      let priorPct = null;
      const parties = [
        [priorEntry.winner, priorEntry.winnerPct],
        [priorEntry.runnerUp, priorEntry.runnerUpPct],
        [priorEntry.p3, priorEntry.p3Pct],
        [priorEntry.p4, priorEntry.p4Pct],
      ];
      for (const [p, pct] of parties) {
        if (p === winner) { priorPct = pct; break; }
      }
      if (priorPct == null) return null;
      return curPct - priorPct;  // positive = swing TO winner
    }

    /* ── Build the declaration schedule for the active year ──
       Some boundary files (e.g. 1983) have one Polygon per island, so a
       single constituency like "Orkney and Shetland" appears 84 times.
       We group features by ridingKey so each constituency declares once
       but all its polygons get painted together. */
    function buildDeclareSchedule() {
      const era = YEAR_TO_ERA[activeYear];
      const seedSalt = String(activeYear);
      const feats = (allRidings && allRidings.features) || [];

      // Group features by ridingKey. We use the FIRST occurrence's properties
      // for region / declare-time so the grouping is deterministic.
      const byKey = new Map();   // key -> { key, primaryFeature, features:[], data, declareAt }
      for (const f of feats) {
        const key = ridingKeyFor(f, era);
        if (byKey.has(key)) {
          byKey.get(key).features.push(f);
          continue;
        }
        const data = dataForFeature(f, era);
        if (!data || !data.winner) continue;    // skip seats with no result
        byKey.set(key, {
          key,
          feature: f,                            // primary feature (for region/etc lookups)
          features: [f],                         // ALL polygons for this constituency
          data,
          declareAt: computeDeclareTime(f, era, seedSalt),
        });
      }

      const sched = Array.from(byKey.values());
      sched.sort((a, b) => a.declareAt - b.declareAt);

      // Global smoothing pass — even after per-region jitter the merged
      // stream can clump (e.g. five regions whose bases coincide at 24.5
      // dumping their middles together around 02:00). Walk the sorted list
      // and push any too-close declaration forward by a small minimum gap.
      // We protect named anchors and the very-early Sunderland race so the
      // famous Houghton-first ordering stays intact.
      //
      // minGap is in sim-hours. ~720 mappable seats over ~6 hours of
      // counting gives an average gap near 0.0083h (30 sec). Anything below
      // ~0.003h (~11 sec) reads as a clump on screen, so that's our floor.
      const minGap = 0.0035;
      const anchorNames = new Set(Object.keys(DECLARE_ANCHORS));
      const SUNDERLAND_RACE_BEFORE = 23.5;
      for (let i = 1; i < sched.length; i++) {
        const prev = sched[i - 1];
        const cur = sched[i];
        // Don't disturb famous anchors or anything in the Sunderland race window
        const curName = normName(cur.feature.properties.name || cur.feature.properties.Name || "");
        if (anchorNames.has(curName)) continue;
        if (cur.declareAt < SUNDERLAND_RACE_BEFORE) continue;
        const minAllowed = prev.declareAt + minGap;
        if (cur.declareAt < minAllowed) cur.declareAt = minAllowed;
      }
      // List is already monotonically non-decreasing after the pass.

      SIM.schedule = sched;
      SIM.mappedSeats = sched.length;             // unique seats we have geometry for
      SIM.totalSeats = canonicalSeats(activeYear); // canonical HoC size
      SIM.threshold = majorityThreshold(activeYear);

      // Seed region totals so the region tooltip shows "0/N declared" early
      SIM.regionSeats = {};
      sched.forEach(s => {
        const props = s.feature.properties || {};
        const regionStr = props.region || props[era + "_Region"] || null;
        const regionKey = regionStr === "Ireland" ? "NI" : regionStr;
        if (!regionKey) return;
        if (!SIM.regionSeats[regionKey]) {
          SIM.regionSeats[regionKey] = { byParty: {}, declared: 0, total: 0 };
        }
        SIM.regionSeats[regionKey].total += 1;
      });
    }

    /* ── Paint a riding fill with its winner colour, faded in ──
       `features` is the list of ALL polygons for the constituency (multi-island
       seats can have many). Pass either a single feature or an array. */
    function paintDeclaredRiding(features, data, isGain) {
      const colour = ridingColour(data);
      const list = Array.isArray(features) ? features : [features];
      const set = new Set(list);
      // Leave stroke alone: showAllRidings/showRidings set it to the constant
      // grey hairline, and we want declared seats to keep that border so the
      // map reads as a grid of distinct constituencies even after they fill in.
      ridingG.selectAll(".riding-fill")
        .filter(d => set.has(d))
        .attr("data-declared", "1")
        .transition().duration(300)
        .attr("fill", colour);

      // Also update the zoomed copy if visible
      zoomedRidingG.selectAll(".zoomed-fill")
        .filter(d => set.has(d))
        .attr("data-declared", "1")
        .transition().duration(300)
        .attr("fill", colour);

      // Diagonal-stripe pickup overlay. We paint a separate, pointer-events-
      // disabled path on top of the seat's solid colour fill so the user
      // can read both the WHO (party colour underneath) and the WHAT-CHANGED
      // (translucent white hatch on top). The pattern id varies by party
      // (see gainStripePatternId) so adjacent flips from different parties
      // get visually distinct stripe directions instead of merging into a
      // single hatched mass.
      if (isGain) {
        const patId = gainStripePatternId(data.winner);
        // National layer: append next to the matching riding-fill paths so
        // they live in the same group and inherit the same zoom transform.
        ridingG.selectAll(".riding-fill")
          .filter(d => set.has(d))
          .each(function(d) {
            const parent = this.parentNode;
            d3.select(parent).append("path")
              .datum(d)
              .attr("class", "gain-overlay")
              .attr("d", path(d))
              .attr("fill", `url(#${patId})`)
              .attr("pointer-events", "none")
              .style("opacity", 0)
              .transition().duration(300)
              .style("opacity", 1);
          });
        // Zoomed layer: same story but inside whatever clippedG the zoomed
        // showRidings call set up, so the overlay gets clipped to the region.
        zoomedRidingG.selectAll(".zoomed-fill")
          .filter(d => set.has(d))
          .each(function(d) {
            const parent = this.parentNode;
            d3.select(parent).append("path")
              .datum(d)
              .attr("class", "gain-overlay")
              .attr("d", path(d))
              .attr("fill", `url(#${patId})`)
              .attr("pointer-events", "none")
              .style("opacity", 0)
              .transition().duration(300)
              .style("opacity", 1);
          });
      }
    }

    /* ── Restore gain-stripe overlays after a layer rebuild ──
       showAllRidings / showRidings wipe their containers and rebuild the
       riding-fill / zoomed-fill paths from scratch, which also takes any
       previously-painted overlay paths with them. Call this once the rebuild
       is finished to re-attach overlays to every constituency we've already
       declared as a gain. */
    function repaintGainOverlays() {
      if (!SIM.gainKeys || SIM.gainKeys.size === 0) return;
      const era = YEAR_TO_ERA[activeYear];
      function paintInGroup(group, selector) {
        group.selectAll(selector).each(function(d) {
          const k = ridingKeyFor(d, era);
          if (!SIM.gainKeys.has(k)) return;
          const info = SIM.gainInfo[k];
          if (!info) return;
          const parent = this.parentNode;
          // Skip if an overlay already exists for this datum in this parent.
          const already = d3.select(parent)
            .selectAll(".gain-overlay")
            .filter(function(dd) { return dd === d; })
            .size();
          if (already > 0) return;
          d3.select(parent).append("path")
            .datum(d)
            .attr("class", "gain-overlay")
            .attr("d", path(d))
            .attr("fill", `url(#${info.patId})`)
            .attr("pointer-events", "none");
        });
      }
      paintInGroup(ridingG, ".riding-fill");
      paintInGroup(zoomedRidingG, ".zoomed-fill");
    }

    /* ── Reset all riding fills to an undeclared "grey" before sim ── */
    function dimAllRidings() {
      // Fill is reset to the undeclared grey; stroke is left as whatever the
      // initial show*Ridings call painted (constant grey hairline) so the
      // boundary lines remain visible even when everything is grey-on-grey.
      ridingG.selectAll(".riding-fill")
        .attr("data-declared", null)
        .attr("fill", "#1a2035");
      zoomedRidingG.selectAll(".zoomed-fill")
        .attr("data-declared", null)
        .attr("fill", "#1a2035");
      // Wipe any pickup-stripe overlays from a previous run.
      ridingG.selectAll(".gain-overlay").remove();
      zoomedRidingG.selectAll(".gain-overlay").remove();
    }

    /* ── Toast rendering ────────────────────────────────────────── */
    function showSeatToast(item) {
      const data = item.data;
      const name = data.name || item.feature.properties.name || item.feature.properties.Name || "";
      const winner = data.winner;
      const colour = partyColourAccent(winner);

      // Is this a GAIN? (winner differs from prior election winner)
      const priorEntry = SIM.priorData && SIM.priorData.byNormName[normName(name)];
      const isGain = priorEntry && priorEntry.winner && priorEntry.winner !== winner;
      const swingPP = computeSwing(data, priorEntry);

      const swingLine = swingPP != null
        ? `<div class="toast-swing">Swing to ${partyDisplayName(winner)}: ${swingPP >= 0 ? "+" : ""}${(swingPP*100).toFixed(1)} pp vs ${SIM.priorData.year}</div>`
        : "";
      const gainFlag = isGain
        ? `<span class="toast-gain-flag">GAIN from ${priorEntry.winner}</span>`
        : "";
      const marginPct = data.margin != null ? `${(data.margin*100).toFixed(1)}% margin` : "";
      const runnerUpLine = data.runnerUp
        ? `<span style="color:${partyColourAccent(data.runnerUp)}">${data.runnerUp} ${((data.runnerUpPct||0)*100).toFixed(1)}%</span>`
        : "";

      const toast = document.createElement("div");
      toast.className = "sim-toast" + (isGain ? " gain" : "");
      toast.style.borderLeftColor = colour;
      toast.innerHTML = `
        <div class="toast-name">${name}${gainFlag}</div>
        <div class="toast-winner" style="color:${colour}">${partyDisplayName(winner)} · ${((data.winnerPct||0)*100).toFixed(1)}%</div>
        <div class="toast-meta">
          <span>${runnerUpLine}</span>
          <span>${marginPct}</span>
        </div>
        ${swingLine}
      `;
      simToasts.appendChild(toast);

      // Cap visible toasts to ~6; drop oldest
      while (simToasts.children.length > 6) {
        const old = simToasts.firstChild;
        if (old) old.remove();
      }

      // Auto-dismiss after 4.5s
      setTimeout(() => {
        if (toast.parentNode) {
          toast.classList.add("leaving");
          setTimeout(() => toast.remove(), 260);
        }
      }, 4500);
    }

    /* ── Scoreboard rendering ────────────────────────────────────── */
    function renderSimBoard() {
      if (!simBoard.classList.contains("visible")) return;

      // Sort parties by current count descending
      const parties = Object.entries(SIM.seatsByParty)
        .sort((a, b) => b[1] - a[1]);

      const declaredCount = SIM.declared.size;
      const remaining = SIM.totalSeats - declaredCount;

      // Leader text
      let leaderText = "";
      if (SIM.winnerParty) {
        // Same rule as the big banner: name the historical leader only when
        // we're not running an alternate-reality shift.
        const winOutcome = (!SIM.shift && ELECTION_OUTCOMES[activeYear]);
        if (winOutcome && winOutcome.party === SIM.winnerParty && winOutcome.leader) {
          leaderText = `★ ${winOutcome.leader} · ${partyDisplayName(SIM.winnerParty)} majority ★`;
        } else {
          leaderText = `★ ${partyDisplayName(SIM.winnerParty)} majority ★`;
        }
      } else if (parties.length === 0) {
        leaderText = "Waiting for first declarations…";
      } else {
        const [lead, leadCount] = parties[0];
        const second = parties[1];
        const lead2 = second ? second[1] : 0;
        const gap = leadCount - lead2;
        const toMaj = SIM.threshold - leadCount;
        if (toMaj <= 0) {
          leaderText = `${partyDisplayName(lead)} has a majority`;
        } else if (remaining < toMaj) {
          leaderText = `${partyDisplayName(lead)} leads by ${gap} · majority not possible`;
        } else {
          leaderText = `${partyDisplayName(lead)} leads by ${gap} · needs ${toMaj} more for majority`;
        }
      }

      // Bar segments
      const barWrap = simBoard.querySelector(".sim-bar-wrap");
      barWrap.innerHTML = "";
      let runningPct = 0;
      parties.forEach(([party, count]) => {
        const pct = (count / SIM.totalSeats) * 100;
        if (pct === 0) return;
        const seg = document.createElement("div");
        seg.className = "sim-bar-seg";
        seg.style.background = partyColourAccent(party);
        seg.style.width = pct + "%";
        seg.title = `${partyDisplayName(party)}: ${count}`;
        if (count >= 8) {
          const lbl = document.createElement("span");
          lbl.className = "sim-bar-count";
          lbl.textContent = count;
          seg.appendChild(lbl);
        }
        barWrap.appendChild(seg);
        runningPct += pct;
      });
      // Threshold line
      const thresholdLine = document.createElement("div");
      thresholdLine.className = "sim-threshold-line";
      thresholdLine.style.left = ((SIM.threshold / SIM.totalSeats) * 100) + "%";
      barWrap.appendChild(thresholdLine);

      // Party chips
      const chipsHost = simBoard.querySelector(".sim-parties");
      chipsHost.innerHTML = "";
      // Use SIM.partyDelta — the net pickups/losses tracked seat-by-seat —
      // rather than (current count) minus (prior total seats), which only
      // makes sense at the very END of the night and produces nonsense
      // numbers in the middle ("Lab -250" when only Sunderland has
      // declared). With partyDelta, every party reads ±0 at sim start, and
      // a party only goes negative once it has actually LOST a seat it
      // previously held.
      const havePrior = !!(SIM.priorData && SIM.priorData.byNormName);
      parties.forEach(([party, count]) => {
        const chip = document.createElement("div");
        chip.className = "sim-party";
        const colour = partyColourAccent(party);
        const deltaHTML = havePrior
          ? (() => {
              const d = SIM.partyDelta[party] || 0;
              if (d === 0) return `<span class="sp-delta">±0</span>`;
              return `<span class="sp-delta ${d > 0 ? "up" : "down"}">${d > 0 ? "+" : ""}${d}</span>`;
            })()
          : "";
        chip.innerHTML = `
          <span class="sp-dot" style="background:${colour}"></span>
          <span class="sp-name" style="color:${colour}">${partyDisplayName(party)}</span>
          <span class="sp-count">${count}</span>
          ${deltaHTML}`;
        chipsHost.appendChild(chip);
      });

      // Popular vote — render as a stacked horizontal bar with party labels
      const pvHost = simBoard.querySelector(".sim-popvote");
      const pvTotal = SIM.popVoteTotal;
      if (pvTotal > 0) {
        // Sort by votes descending
        const pvSorted = Object.entries(SIM.popVote).sort((a, b) => b[1] - a[1]);
        const labelHTML = pvSorted.slice(0, 6).map(([party, votes]) => {
          const pctVal = (votes / pvTotal) * 100;
          const colour = partyColourAccent(party);
          return `<span class="sim-pv-item">
            <span class="sim-pv-dot" style="background:${colour}"></span>
            <span class="sim-pv-name" style="color:${colour}">${partyDisplayName(party)}</span>
            <span class="sim-pv-pct">${pctVal.toFixed(1)}%</span>
          </span>`;
        }).join("");
        const segHTML = pvSorted.map(([party, votes]) => {
          const w = (votes / pvTotal) * 100;
          return `<div class="sim-pv-seg" style="background:${partyColourAccent(party)};width:${w}%" title="${partyDisplayName(party)} ${(w).toFixed(1)}%"></div>`;
        }).join("");
        pvHost.innerHTML = `
          <div class="sim-pv-head">
            <span class="sim-pv-label">Popular vote</span>
            <span class="sim-pv-total">${(pvTotal).toLocaleString()} counted</span>
          </div>
          <div class="sim-pv-bar">${segHTML}</div>
          <div class="sim-pv-labels">${labelHTML}</div>`;
        pvHost.style.display = "";
      } else {
        pvHost.style.display = "none";
      }

      // Header / footer text
      simBoard.querySelector(".sim-clock").textContent = fmtSimClock(SIM.clockHours);
      simBoard.querySelector(".sim-target b").textContent = SIM.threshold;
      const progEl = simBoard.querySelector(".sim-progress");
      if (SIM.mappedSeats < SIM.totalSeats) {
        // Show "X of Y mapped (Z total)" so users see we're missing some
        progEl.innerHTML = `${declaredCount} / ${SIM.mappedSeats} declared <span style="color:#5a6280">· ${SIM.totalSeats} historical total</span>`;
      } else {
        progEl.textContent = `${declaredCount} / ${SIM.totalSeats} declared`;
      }
      simBoard.querySelector(".sim-leader").textContent = leaderText;

      // Shift tag — visible whenever an alternate scenario is running.
      // Random scenarios mark the shift as `secret` so we don't reveal
      // direction or magnitude; we still show a neutral "shift active"
      // pill so viewers know what they're watching isn't real history.
      const shiftTag = simBoard.querySelector(".sim-shift-tag");
      if (shiftTag) {
        if (SIM.shift) {
          shiftTag.style.display = "";
          if (SIM.shift.secret) {
            shiftTag.textContent = "Random shift";
          } else {
            shiftTag.textContent = `Shift +${SIM.shift.nationalShift.toFixed(1)} → ${partyDisplayName(SIM.shift.target)}`;
          }
        } else {
          shiftTag.style.display = "none";
          shiftTag.textContent = "";
        }
      }
    }

    /* ── Big banner ────────────────────────────────────────────── */
    function showBigBanner(kind, party) {
      const colour = party ? partyColourAccent(party) : "#f0c040";
      let label, headline, sub;
      if (kind === "majority") {
        label = "★ Majority Reached ★";
        // Only attach the historical leader's name when the user is watching
        // the REAL election unfold. In an alternate-reality shift, putting
        // "Theresa May wins a majority" on a 2024 shifted-Con scenario would
        // be wrong — that majority belongs to a different alternate world.
        const outcome = (!SIM.shift && ELECTION_OUTCOMES[activeYear]);
        if (outcome && outcome.party === party && outcome.leader) {
          headline = `${outcome.leader.toUpperCase()} · ${partyDisplayName(party).toUpperCase()} MAJORITY`;
        } else {
          headline = `${partyDisplayName(party).toUpperCase()} WINS A MAJORITY`;
        }
        sub = `${SIM.seatsByParty[party]} of ${SIM.totalSeats} seats · ${fmtSimClock(SIM.clockHours)}`;
      } else if (kind === "hung") {
        label = "★ Hung Parliament ★";
        headline = "No party can reach a majority";
        // Find current leader for context
        const parties = Object.entries(SIM.seatsByParty).sort((a,b) => b[1] - a[1]);
        const lead = parties[0];
        sub = lead
          ? `${partyDisplayName(lead[0])} leads with ${lead[1]} · ${SIM.threshold} needed`
          : "";
      } else {
        return;
      }
      simBanner.style.borderColor = colour;
      simBanner.style.color = colour;
      simBanner.querySelector(".sb-label").textContent = label;
      simBanner.querySelector(".sb-headline").textContent = headline;
      simBanner.querySelector(".sb-sub").textContent = sub;
      simBanner.classList.add("show");
    }

    function hideBigBanner() {
      simBanner.classList.remove("show");
    }

    /* ── Process a single declaration ────────────────────────────── */
    function declareSeat(item) {
      if (SIM.declared.has(item.key)) return;
      SIM.declared.add(item.key);
      const data = item.data;
      const winner = data.winner;
      SIM.seatsByParty[winner] = (SIM.seatsByParty[winner] || 0) + 1;

      // Gain detection — used both for the running partyDelta tally below
      // and to drive the diagonal-stripe pickup overlay in paintDeclaredRiding.
      // A gain means "this seat went to a different party than last time";
      // same-party holds and seats with no prior data don't count.
      let isGain = false;
      let priorWinner = null;
      if (SIM.priorData && SIM.priorData.byNormName) {
        const ridingName = data.name || item.feature.properties.name || item.feature.properties.Name || "";
        const priorEntry = SIM.priorData.byNormName[normName(ridingName)];
        priorWinner = priorEntry && priorEntry.winner;
        if (priorWinner && priorWinner !== winner) isGain = true;
      }

      // Net seat change tracking. If this seat flipped, +1 to the new winner
      // and -1 to the prior holder. Same-party holds leave both deltas as-is.
      // This is the broadcasters' net-change number, and crucially shows
      // "Lab ±0" early when only safe Lab seats have declared, not
      // "Lab -250" against an unfinished count.
      if (isGain) {
        SIM.partyDelta[winner]      = (SIM.partyDelta[winner]      || 0) + 1;
        SIM.partyDelta[priorWinner] = (SIM.partyDelta[priorWinner] || 0) - 1;
        // Remember this is a gain so we can re-overlay it after a zoom
        // change rebuilds the riding-fill / zoomed-fill layers.
        SIM.gainKeys.add(item.key);
        SIM.gainInfo[item.key] = { patId: gainStripePatternId(winner), winner };
      }

      // Tally popular vote — add this constituency's votes for every party listed.
      // Defensive: some datasets (notably 1983) have a corrupt P4="Other" row where
      // the "votes" value is actually the constituency's Total Votes. We detect any
      // entry whose vote count equals or exceeds the row's total votes and skip it
      // (the winner can legitimately approach the total in safe seats, so we only
      // strip non-winners that hit/exceed the cap, or any party that exceeds it).
      const cap = +data.totalVotes || 0;
      const partyPairs = [
        [data.winner,   data.winnerVotes,    true],
        [data.runnerUp, data.runnerUpVotes,  false],
        [data.p3,       data.p3Votes,        false],
        [data.p4,       data.p4Votes,        false],
      ];
      for (const [p, v, isWinner] of partyPairs) {
        const vn = +v;
        if (!p || !vn || vn <= 0 || vn === -1) continue;  // -1 = unopposed/unknown
        // Skip obviously corrupt entries (votes ≥ total cast).
        if (cap > 0 && vn >= cap && !isWinner) continue;
        SIM.popVote[p] = (SIM.popVote[p] || 0) + vn;
        SIM.popVoteTotal += vn;
      }

      // Tally per-region seats
      const era = YEAR_TO_ERA[activeYear];
      const props = item.feature.properties || {};
      const regionStr = props.region || props[era + "_Region"] || null;
      const regionKey = regionStr === "Ireland" ? "NI" : regionStr;  // pre-partition alias
      if (regionKey) {
        if (!SIM.regionSeats[regionKey]) {
          SIM.regionSeats[regionKey] = { byParty: {}, declared: 0, total: 0 };
        }
        const rs = SIM.regionSeats[regionKey];
        rs.byParty[winner] = (rs.byParty[winner] || 0) + 1;
        rs.declared += 1;
      }

      paintDeclaredRiding(item.features || item.feature, data, isGain);
      showSeatToast(item);

      // Check for majority
      if (!SIM.winnerParty && SIM.seatsByParty[winner] >= SIM.threshold) {
        SIM.winnerParty = winner;
        showBigBanner("majority", winner);
      }

      // Check for hung parliament (only after enough has declared to be meaningful)
      if (!SIM.winnerParty && !SIM.hungDeclared) {
        const declaredCount = SIM.declared.size;
        const remaining = SIM.totalSeats - declaredCount;
        // Max possible for ANY party = its current seats + all remaining
        const sortedParties = Object.entries(SIM.seatsByParty).sort((a,b) => b[1] - a[1]);
        const topCount = sortedParties.length ? sortedParties[0][1] : 0;
        const maxPossibleForLeader = topCount + remaining;
        // Hung when NO party can mathematically reach majority
        if (maxPossibleForLeader < SIM.threshold) {
          SIM.hungDeclared = true;
          showBigBanner("hung", null);
        }
      }
    }

    /* ── Tick loop ────────────────────────────────────────────── */
    function tickSim() {
      if (!SIM.running || SIM.paused) return;
      const now = performance.now();
      const dt = (now - SIM.lastTick) / 1000;
      SIM.lastTick = now;
      // SIM.speed is sim-minutes per real-second → convert to sim-hours
      SIM.clockHours += (dt * SIM.speed) / 60;

      // Reveal all due declarations
      let revealed = 0;
      while (SIM.nextIdx < SIM.schedule.length) {
        const next = SIM.schedule[SIM.nextIdx];
        if (next.declareAt > SIM.clockHours) break;
        declareSeat(next);
        SIM.nextIdx++;
        revealed++;
        // Avoid blocking too long in a single frame for very fast speeds
        if (revealed > 25) break;
      }

      renderSimBoard();

      if (SIM.nextIdx >= SIM.schedule.length) {
        // All seats declared — let banner linger, then stop animation loop
        stopSim(true);
        return;
      }
      SIM.rafId = requestAnimationFrame(tickSim);
    }

    /* ── Start sim ────────────────────────────────────────────── */
    function startSim() {
      if (SIM.running) return;
      if (!ridingsData || !allRidings) return;  // nothing loaded yet
      if (isRefMode(activeYear)) {
        alert("Election Night mode is for general elections, not the referendum.");
        return;
      }

      // Reset any active zoom / region selection — sim is national
      if (activeRegionCode) resetMap();

      // ── Read shift config from the dialog ──
      //   "historical" (default) leaves SIM.shift/shiftedData null so the sim
      //   runs against true history. Other selections draw a national swing.
      //   "random" picks the direction for the user; "fully_random" picks both
      //   direction AND magnitude. Both random modes are marked `secret` so the
      //   on-screen tag doesn't reveal how the deck was stacked.
      const shiftSel = simConfig.querySelector("#cfg-shift-target");
      const sigmaSel = simConfig.querySelector("#cfg-shift-sigma");
      let target = shiftSel ? shiftSel.value : "historical";
      let sigma  = sigmaSel ? +sigmaSel.value : 0;
      let secret = false;
      // Year-aware random pool: pick from the GB parties that actually
      // contested the active year. We always include Lab + Con; LD/Lib is
      // added for years where they ran; SNP for Scotland-heavy alternate; Grn
      // and Reform for years they existed.
      const randomPool = ["Lab", "Con"];
      const yr = +activeYear || parseInt(String(activeYear).replace(/\D/g, ""), 10) || 2024;
      randomPool.push(yr >= 1988 ? "LD" : "Lib");
      if (yr >= 2010) randomPool.push("Grn");
      if (yr >= 2019) randomPool.push("RUK");
      if (target === "random") {
        target = randomPool[Math.floor(Math.random() * randomPool.length)];
        secret = true;
      } else if (target === "fully_random") {
        target = randomPool[Math.floor(Math.random() * randomPool.length)];
        sigma  = Math.min(15, Math.abs(gaussian()) * 5);
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

      SIM.running = true;
      SIM.paused = false;
      SIM.clockHours = POLL_CLOSE_HOURS;
      SIM.declared = new Set();
      SIM.seatsByParty = {};
      SIM.popVote = {};
      SIM.popVoteTotal = 0;
      SIM.regionSeats = {};
      SIM.partyDelta = {};
      SIM.gainKeys = new Set();
      SIM.gainInfo = {};
      SIM.winnerParty = null;
      SIM.hungDeclared = false;
      SIM.nextIdx = 0;
      SIM.lastTick = performance.now();

      document.body.classList.add("sim-active");
      simBtn.classList.add("running");
      simBtn.querySelector(".sim-label").textContent = "Stop";
      simPauseBtn.style.display = "";
      simPauseBtn.classList.remove("paused");
      simPauseBtn.textContent = "⏸ Pause";
      simSpeedBtn.style.display = "";
      simSpeedBtn.textContent = fmtSpeed();

      simToasts.innerHTML = "";
      hideBigBanner();
      dimAllRidings();

      // Load previous election results for swing data, then build schedule
      simBoard.classList.add("visible");
      simBoard.querySelector(".sim-leader").textContent = "Loading prior results…";
      const simRunId = ++SIM.runId;
      loadPriorForSwing(activeYear).then(prior => {
        if (simRunId !== SIM.runId) return;  // sim was stopped/restarted while loading
        SIM.priorData = prior;
        SIM.priorYear = prior.year;
        buildDeclareSchedule();
        renderSimBoard();
        SIM.rafId = requestAnimationFrame(tickSim);
      });
    }

    /* ── Stop sim ────────────────────────────────────────────── */
    function stopSim(natural) {
      const wasRunning = SIM.running;
      SIM.running = false;
      SIM.paused = false;
      SIM.runId++;  // invalidates any in-flight prior-data fetch
      if (SIM.rafId) { cancelAnimationFrame(SIM.rafId); SIM.rafId = null; }

      simBtn.classList.remove("running");
      simBtn.querySelector(".sim-label").textContent = "Election Night";
      simPauseBtn.style.display = "none";
      simSpeedBtn.style.display = "none";

      if (!natural) {
        // User clicked stop — restore the static atlas immediately
        document.body.classList.remove("sim-active");
        simBoard.classList.remove("visible");
        hideBigBanner();
        simToasts.innerHTML = "";
        // Clear any shift so the atlas reverts to real historical results.
        SIM.shift = null;
        SIM.shiftedData = null;
        // Drop the gain-stripe state so showAllRidings repaints a clean
        // static atlas without the election-night pickup overlays. Same
        // applies when the user dismisses a completed sim below.
        SIM.gainKeys = new Set();
        SIM.gainInfo = {};
        // Repaint all ridings from full year data
        if (wasRunning) showAllRidings();
      }
      // If natural completion: leave board + final paint visible until user
      // dismisses by clicking the button again. (The shift stays active so
      // hovering shows the alternate-reality results until dismissal.)
    }

    /* ── Wire up controls ───────────────────────────────────────── */
    simBtn.addEventListener("click", function() {
      if (SIM.running) {
        stopSim(false);
      } else if (simBoard.classList.contains("visible")) {
        // Sim has completed naturally — clicking again clears the overlay
        document.body.classList.remove("sim-active");
        simBoard.classList.remove("visible");
        hideBigBanner();
        simToasts.innerHTML = "";
        SIM.shift = null;
        SIM.shiftedData = null;
        SIM.gainKeys = new Set();
        SIM.gainInfo = {};
        showAllRidings();
      } else if (simConfig.classList.contains("visible")) {
        // Config is open — clicking the button closes it
        simConfig.classList.remove("visible");
      } else {
        showConfigDialog();
      }
    });

    /* ── Config dialog before starting ──────────────────────────── */
    function showConfigDialog() {
      if (isRefMode(activeYear)) {
        alert("Election Night mode is for general elections, not the referendum.");
        return;
      }
      // Year label
      const yrLabel = activeYear === "1974O" ? "Oct 1974"
                    : activeYear === "1974F" ? "Feb 1974"
                    : String(activeYear);
      simConfig.querySelector(".cfg-year").textContent = yrLabel;
      // Build speed options
      const sel = simConfig.querySelector("#cfg-speed");
      sel.innerHTML = "";
      SIM.speedLevels.forEach((spd, i) => {
        const opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = spd.label;
        sel.appendChild(opt);
      });
      sel.value = String(SIM.speedIdx);

      // ── Update shift dropdown for the active year ──
      // Hide options for parties that didn't run in this year, and rewrite
      // the LD/Lib label to match the era.
      const targetSel = simConfig.querySelector("#cfg-shift-target");
      if (targetSel) {
        const yr = +activeYear || parseInt(String(activeYear).replace(/\D/g, ""), 10) || 2024;
        // Choose Lib vs LD based on era — LD branding from 1988 onward
        const ldCode  = yr >= 1988 ? "LD" : "Lib";
        const ldLabel = yr >= 1988 ? "Lib Dem"
                      : yr >= 1981 ? "SDP–Liberal Alliance"
                      : "Liberal";
        [...targetSel.options].forEach(opt => {
          // Show third parties only where they fielded candidates
          if (opt.value === "Grn") opt.hidden = yr < 2010;
          else if (opt.value === "RUK") opt.hidden = yr < 2019;
          else if (opt.value === "LD" || opt.value === "Lib") {
            opt.hidden = false;
            opt.value = ldCode;
            opt.textContent = `Shift toward ${ldLabel}`;
          }
          else opt.hidden = false;
        });
        // Reset to historical when re-opening the dialog
        targetSel.value = "historical";
        // Hide magnitude row unless a non-historical/non-fully-random scenario is selected
        const sigmaRow = simConfig.querySelector("#cfg-shift-row");
        if (sigmaRow) sigmaRow.style.display = "none";
      }

      simConfig.classList.add("visible");
    }

    function startSimFromConfig() {
      const sel = simConfig.querySelector("#cfg-speed");
      SIM.speedIdx = parseInt(sel.value, 10) || 0;
      SIM.speed = SIM.speedLevels[SIM.speedIdx].v;
      simConfig.classList.remove("visible");
      startSim();
    }

    simPauseBtn.addEventListener("click", function() {
      if (!SIM.running) return;
      SIM.paused = !SIM.paused;
      if (SIM.paused) {
        simPauseBtn.classList.add("paused");
        simPauseBtn.textContent = "▶ Resume";
      } else {
        simPauseBtn.classList.remove("paused");
        simPauseBtn.textContent = "⏸ Pause";
        SIM.lastTick = performance.now();
        SIM.rafId = requestAnimationFrame(tickSim);
      }
    });

    function fmtSpeed() {
      return SIM.speedLevels[SIM.speedIdx].label;
    }

    simSpeedBtn.addEventListener("click", function() {
      SIM.speedIdx = (SIM.speedIdx + 1) % SIM.speedLevels.length;
      SIM.speed = SIM.speedLevels[SIM.speedIdx].v;
      simSpeedBtn.textContent = fmtSpeed();
    });

    // Config dialog buttons
    if (simConfig) {
      simConfig.querySelector(".cfg-go").addEventListener("click", startSimFromConfig);
      simConfig.querySelector(".cfg-cancel").addEventListener("click", () => {
        simConfig.classList.remove("visible");
      });
      // Show/hide magnitude row when scenario changes. Magnitude is hidden
      // for "historical" (no shift) and "fully_random" (sim picks magnitude).
      const targetSel = simConfig.querySelector("#cfg-shift-target");
      const sigmaRow  = simConfig.querySelector("#cfg-shift-row");
      if (targetSel && sigmaRow) {
        targetSel.addEventListener("change", () => {
          const v = targetSel.value;
          const hide = v === "historical" || v === "fully_random";
          sigmaRow.style.display = hide ? "none" : "";
        });
      }
    }

    // Dismiss big banner on click
    simBanner.querySelector(".sb-dismiss").addEventListener("click", hideBigBanner);
  }

  /* ─── 7. National scoreboard (US-atlas style) ──────────────────────
     Two sections: seats (top 3 parties with bar + threshold line) and
     popular vote (top 3 parties with %). Hidden when sim is running. */
  function updateLegend(year, ridingData) {
    const leg = document.getElementById("map-legend");
    if (!leg) return;

    if (isRefMode(year)) {
      // Referendum has only two "candidates"; keep a simpler layout.
      leg.innerHTML = `
        <div class="ns-year">EU Referendum 2016</div>
        <div class="ns-section">Result</div>
        <div class="ns-cand"><span class="ns-name win" style="color:#5b9ec9">Leave</span>
          <span class="ns-val" style="color:#5b9ec9">51.9%</span></div>
        <div class="ns-cand"><span class="ns-name" style="color:#e8c93c">Remain</span>
          <span class="ns-val" style="color:#e8c93c">48.1%</span></div>
        <div class="ns-bar-wrap">
          <div class="ns-bar-seg" style="background:#5b9ec9;width:51.9%"></div>
          <div class="ns-bar-seg" style="background:#e8c93c;width:48.1%"></div>
        </div>
        <div class="ns-threshold" style="margin-top:6px">
          Darker shading = larger margin
        </div>`;
      return;
    }

    const totals = SEAT_TOTALS[year] || {};
    const totalSeats = (typeof canonicalSeats === "function")
      ? canonicalSeats(year)
      : Object.values(totals).reduce((a, b) => a + b, 0);
    const threshold = (typeof majorityThreshold === "function")
      ? majorityThreshold(year)
      : Math.floor(totalSeats / 2) + 1;

    // Parties sorted by seat count for the seats section
    const seatSorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    const seatTop = seatSorted.filter(([, n]) => n > 0).slice(0, 3);

    // Compute popular vote totals from ridingData (if available)
    const pv = {};
    let pvTotal = 0;
    if (ridingData) {
      // Dedupe by entry identity (XLSX is indexed multiple ways: code, norm name, computed)
      const seen = new Set();
      for (const k in ridingData) {
        const e = ridingData[k];
        if (!e || seen.has(e)) continue;
        seen.add(e);
        const cap = +e.totalVotes || 0;
        const pairs = [
          [e.winner,   e.winnerVotes,   true],
          [e.runnerUp, e.runnerUpVotes, false],
          [e.p3,       e.p3Votes,       false],
          [e.p4,       e.p4Votes,       false],
        ];
        for (const [p, v, isWin] of pairs) {
          const vn = +v;
          if (!p || !vn || vn <= 0 || vn === -1) continue;
          if (cap > 0 && vn >= cap && !isWin) continue;  // strip corrupt rows
          pv[p] = (pv[p] || 0) + vn;
          pvTotal += vn;
        }
      }
    }
    const pvSorted = Object.entries(pv).sort((a, b) => b[1] - a[1]);
    const pvTop = pvSorted.slice(0, 3);

    // ── Build HTML ──
    const yearLabel = year === "1974O" ? "Oct 1974"
                    : year === "1974F" ? "Feb 1974"
                    : `${year}`;

    let html = `<div class="ns-year">${yearLabel} UK General Election</div>`;

    // Headline: who formed the government, and what kind. Mirrors what gets
    // shown in the Election Night banner when a majority is reached, so a
    // user flipping between years gets the same "Keir Starmer · Majority"
    // framing on the static atlas they'd see on the night.
    const outcome = ELECTION_OUTCOMES[year];
    if (outcome) {
      const lc = partyColourAccent(outcome.party);
      html += `<div class="ns-headline">
        <span class="ns-leader" style="color:${lc}">${outcome.leader}</span>
        <span class="ns-outcome">${outcome.outcome}</span>
      </div>`;
    }

    // Seats section
    html += `<div class="ns-section">Seats</div>`;
    if (seatTop.length === 0) {
      html += `<div class="ns-empty">No data</div>`;
    } else {
      for (const [party, seats] of seatTop) {
        const colour = partyColourAccent(party);
        const isWin = seats >= threshold;
        html += `<div class="ns-cand">
          <span class="ns-name ${isWin ? "win" : ""}" style="color:${colour}">${partyDisplayName(party)}</span>
          <span class="ns-val" style="color:${colour}">${seats}</span>
        </div>`;
      }
    }

    // Bar with all parties as segments, scaled to total seats
    if (totalSeats > 0 && seatSorted.length > 0) {
      const segs = seatSorted
        .filter(([, n]) => n > 0)
        .map(([party, seats]) => {
          const w = (seats / totalSeats) * 100;
          return `<div class="ns-bar-seg" style="background:${partyColourAccent(party)};width:${w}%"
                  title="${partyDisplayName(party)} ${seats}"></div>`;
        }).join("");
      const thresholdLeft = (threshold / totalSeats) * 100;
      html += `<div class="ns-bar-wrap">${segs}
        <div class="ns-threshold-line" style="left:${thresholdLeft}%"></div>
      </div>`;
      html += `<div class="ns-threshold">
        <span style="color:#f0c040">▲ ${threshold} to win</span> · ${totalSeats} total seats
      </div>`;
    }

    // Popular vote section
    html += `<div class="ns-section">Popular vote</div>`;
    if (pvTop.length === 0) {
      html += `<div class="ns-empty">No vote data</div>`;
    } else {
      for (const [party, votes] of pvTop) {
        const pct = (votes / pvTotal * 100).toFixed(1);
        const colour = partyColourAccent(party);
        html += `<div class="ns-cand">
          <span class="ns-name" style="color:${colour}">${partyDisplayName(party)}</span>
          <span class="ns-val" style="color:${colour}">${pct}%</span>
        </div>`;
      }
    }

    leg.innerHTML = html;
  }

  /* ─── Referendum colours ─────────────────────────────────────────── */
  function refColour(data) {
    if (!data) return "#1a2035";
    const t = Math.min(1, data.margin / 0.40);
    if (data.winner === "Leave") return d3.interpolateRgb("#5b9ec9", "#0a2244")(t);  // Leave = blue
    return d3.interpolateRgb("#e8c93c", "#7a5a00")(t);  // Remain = yellow/gold
  }

  function refAccent(winner) {
    return winner === "Leave" ? "#5b9ec9" : "#e8c93c";
  }

  /* ─── 8. Bootstrap ──────────────────────────────────────────────── */
  function bootstrap() {
    injectStyles();

    if (!document.getElementById("uk-map")) {
      const d = document.createElement("div");
      d.id = "uk-map";
      document.body.appendChild(d);
    }

    if (!document.getElementById("reset-btn")) {
      const btn = document.createElement("button");
      btn.id = "reset-btn";
      btn.textContent = "↺ Reset";
      document.body.appendChild(btn);
    }

    if (!document.getElementById("loading-indicator")) {
      const el = document.createElement("div");
      el.id = "loading-indicator";
      el.textContent = "Loading…";
      document.body.appendChild(el);
    }

    if (!document.getElementById("map-legend")) {
      const leg = document.createElement("div");
      leg.id = "map-legend";
      document.body.appendChild(leg);
    }

    if (!document.getElementById("year-selector")) {
      const wrap = document.createElement("div");
      wrap.id = "year-selector";
      const sel = document.createElement("select");
      sel.id = "year-select";
      const years = [2024, 2019, 2017, "ref2016", 2015, 2010, 2005, 2001, 1997, 1992, 1987, 1983, 1979, "1974O", "1974F", 1970, 1966, 1964, 1959, 1955, 1951, 1950, 1945, 1935, 1931, 1929, 1924, 1923, 1922, 1918];
      years.forEach(yr => {
        const opt = document.createElement("option");
        opt.value = yr;
        opt.textContent = yr === "ref2016" ? "2016 Referendum"
          : yr === "1974O" ? "Oct 1974"
          : yr === "1974F" ? "Feb 1974"
          : yr;
        sel.appendChild(opt);
      });
      wrap.appendChild(sel);
      document.body.appendChild(wrap);
    }

    /* Bottom controls bar: year slider, prev/next, sim button */
    if (!document.getElementById("atlas-controls")) {
      const ctrl = document.createElement("div");
      ctrl.id = "atlas-controls";
      ctrl.innerHTML = `
        <button class="ctrl-btn" id="prev-btn">◀ Prev</button>
        <div id="year-display">2024</div>
        <input type="range" id="year-slider" />
        <button class="ctrl-btn" id="next-btn">Next ▶</button>
        <button id="sim-btn"><span class="dot"></span><span class="sim-label">Election Night</span></button>`;
      document.body.appendChild(ctrl);
    }
    if (!document.getElementById("sim-pause-btn")) {
      const btn = document.createElement("button");
      btn.id = "sim-pause-btn";
      btn.textContent = "⏸ Pause";
      document.body.appendChild(btn);
    }
    if (!document.getElementById("sim-speed-btn")) {
      const btn = document.createElement("button");
      btn.id = "sim-speed-btn";
      btn.textContent = "Normal (1 min = 1 sec)";
      document.body.appendChild(btn);
    }

    /* Election Night scoreboard */
    if (!document.getElementById("sim-board")) {
      const board = document.createElement("div");
      board.id = "sim-board";
      board.innerHTML = `
        <div class="sim-header">
          <div class="sim-live">LIVE · ELECTION NIGHT<span class="sim-shift-tag" style="display:none"></span></div>
          <div class="sim-clock">22:00 BST</div>
        </div>
        <div class="sim-body">
          <div class="sim-threshold-row">
            <span class="sim-target">Majority: <b>326</b> seats</span>
            <span class="sim-progress">0 / 650 declared</span>
          </div>
          <div class="sim-bar-wrap"></div>
          <div class="sim-parties"></div>
          <div class="sim-popvote" style="display:none"></div>
        </div>
        <div class="sim-footer">
          <span class="sim-leader">Waiting for first declarations…</span>
        </div>`;
      document.body.appendChild(board);
    }

    /* Toast stack */
    if (!document.getElementById("sim-toasts")) {
      const t = document.createElement("div");
      t.id = "sim-toasts";
      document.body.appendChild(t);
    }

    /* Big banner */
    if (!document.getElementById("sim-banner")) {
      const banner = document.createElement("div");
      banner.id = "sim-banner";
      banner.innerHTML = `
        <div class="sb-label">★ Majority Reached ★</div>
        <div class="sb-headline"></div>
        <div class="sb-sub"></div>
        <button class="sb-dismiss">Dismiss</button>`;
      document.body.appendChild(banner);
    }

    /* Sim config dialog */
    if (!document.getElementById("sim-config")) {
      const cfg = document.createElement("div");
      cfg.id = "sim-config";
      cfg.innerHTML = `
        <div class="cfg-title">Election Night · <span class="cfg-year">2024</span></div>
        <div class="cfg-row">
          <label for="cfg-speed">Speed</label>
          <select id="cfg-speed"></select>
        </div>
        <div class="cfg-row">
          <label for="cfg-shift-target">Scenario</label>
          <select id="cfg-shift-target">
            <option value="historical" selected>Historical (real results)</option>
            <option value="Lab">Shift toward Labour</option>
            <option value="Con">Shift toward Conservative</option>
            <option value="LD">Shift toward Lib Dem</option>
            <option value="Grn">Shift toward Green</option>
            <option value="RUK">Shift toward Reform UK</option>
            <option value="random">Random direction (you pick size)</option>
            <option value="fully_random">Fully random (surprise me)</option>
          </select>
        </div>
        <div class="cfg-row" id="cfg-shift-row" style="display:none">
          <label for="cfg-shift-sigma">Magnitude</label>
          <select id="cfg-shift-sigma">
            <option value="2">Mild (σ≈2 pts)</option>
            <option value="4" selected>Moderate (σ≈4 pts)</option>
            <option value="7">Large (σ≈7 pts)</option>
            <option value="12">Wave (σ≈12 pts)</option>
          </select>
        </div>
        <div class="cfg-info">
          Polls close at 10pm BST. Sunderland declares first around 22:48,
          then most counts run 23:00–05:00. Late seats (Highlands, Cornwall, NI)
          trickle in Friday morning.
        </div>
        <div class="cfg-actions">
          <button class="cfg-cancel">Cancel</button>
          <button class="cfg-go">▶ Start Election Night</button>
        </div>`;
      document.body.appendChild(cfg);
    }

    init();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }

  // Detect topbar height and expose as CSS variable for year selector positioning
  (function() {
    function setTopbarOffset() {
      const mapEl = document.getElementById("uk-map");
      if (!mapEl) return;
      const rect = mapEl.getBoundingClientRect();
      document.documentElement.style.setProperty("--topbar-height", rect.top + "px");
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", setTopbarOffset);
    } else {
      setTopbarOffset();
    }
  })();
})();