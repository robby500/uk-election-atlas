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
    1979:     "1979",
    "1974O":  "1979",
    "1974F":  "1979",
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

  /* ─── 1. Load dependencies ──────────────────────────────────────── */
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
        --accent:       #4e7cff;
        --text:         #e8eaf0;
        --muted:        #5a6280;
        --tooltip-bg:   #0d0f14ee;
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
        height: 100vh;
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

      /* ── Year selector dropdown ── */
      #year-selector {
        position: fixed;
        top: calc(var(--topbar-height, 0px) + 10px);
        left: 50%;
        transform: translateX(-50%);
        z-index: 10000;
        pointer-events: all;
      }

      #year-select {
        background: #13161e;
        border: 1px solid #2a3350;
        border-radius: 6px;
        color: #4e7cff;
        font-family: 'DM Mono', monospace;
        font-size: 0.68rem;
        letter-spacing: 0.05em;
        padding: 7px 32px 7px 14px;
        cursor: pointer;
        appearance: none;
        -webkit-appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%234e7cff'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 10px center;
        outline: none;
        transition: border-color 0.15s;
      }

      #year-select:hover { border-color: #4e7cff; }
      #year-select option { background: #13161e; color: #e8eaf0; }

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
        #map-legend {
          display: none;
        }
      }

      /* ── Legend ── */
      #map-legend {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 100;
        background: #13161ecc;
        border: 1px solid #2a3350;
        border-radius: 5px;
        padding: 10px 14px;
        font-family: 'DM Mono', monospace;
        font-size: 0.65rem;
        color: var(--muted);
        backdrop-filter: blur(6px);
        max-height: calc(100vh - 80px);
        overflow-y: auto;
      }
      #map-legend .leg-title {
        font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.1em;
        margin-bottom: 8px; color: #3a4460;
      }
      #map-legend .leg-bar { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
      #map-legend .leg-swatch { width: 60px; height: 8px; border-radius: 2px; }
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

    const W = 600, H = 800;

    const container = document.getElementById("uk-map") ||
      (() => { const d = document.createElement("div"); d.id = "uk-map"; document.body.appendChild(d); return d; })();

    const svg = d3.select(container)
      .append("svg")
      .attr("viewBox", `0 0 ${W} ${H}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const defs = svg.append("defs");
    const filter = defs.append("filter").attr("id", "grain");
    filter.append("feTurbulence").attr("type","fractalNoise").attr("baseFrequency","0.65").attr("numOctaves","3").attr("stitchTiles","stitch");
    filter.append("feColorMatrix").attr("type","saturate").attr("values","0");
    filter.append("feBlend").attr("in","SourceGraphic").attr("mode","multiply");

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
        mapG.selectAll(".zoomed-fill").attr("stroke-width", 0.5 / k);
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
        html += `</div>`;
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

      const pad = 24;
      projection.fitExtent([[pad, pad], [W - pad, H - pad]], regions);

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
          setTooltip(d.properties.name, REGION_ABBR[d.properties.name] || code, regionData[code], true);
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

      /* ── Year dropdown ── */
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
          updateLegend(year);
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
          updateLegend(year);
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

      // Riding fills (or authority fills in ref mode)
      ridingG.selectAll(".riding-fill")
        .data(allRidings.features)
        .join("path")
        .attr("class", "riding-fill")
        .attr("d", path)
        .attr("fill", d => {
          const data = ridingData[d.properties.code] || ridingData[normName(d.properties.name || d.properties.Name)] || ridingData[normName(d.properties[YEAR_TO_ERA[activeYear] + "_Constituency"] || "")];
          return isRefMode(activeYear) ? refColour(data) : ridingColour(data);
        })
        .attr("stroke", d => {
          const data = ridingData[d.properties.code] || ridingData[normName(d.properties.name || d.properties.Name)] || ridingData[normName(d.properties[YEAR_TO_ERA[activeYear] + "_Constituency"] || "")];
          return isRefMode(activeYear) ? refColour(data) : ridingColour(data);
        })
        .attr("stroke-width", 0.5)
        .attr("pointer-events", "all")
        .on("mousemove", function(event, d) {
          const data = ridingData[d.properties.code] || ridingData[normName(d.properties.name || d.properties.Name)] || ridingData[normName(d.properties[YEAR_TO_ERA[activeYear] + "_Constituency"] || "")];
          setTooltip(d.properties.name || d.properties.Name, "Constituency", data);
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
      const era = YEAR_TO_ERA[activeYear];
      function getRidingRegion(props) {
        return props.region || props[era + "_Region"] || null;
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

      const clipId = "clip-zoomed-" + regionCode;
      zoomedRidingG.append("defs")
        .append("clipPath").attr("id", clipId)
        .append("path").attr("d", path(outerBoundary));

      const clippedG = zoomedRidingG.append("g").attr("clip-path", `url(#${clipId})`);

      /* Riding fills — sit above region layer so they receive all pointer events */
      clippedG.selectAll(".zoomed-fill")
        .data(regionRidings)
        .join("path")
        .attr("class", "zoomed-fill")
        .attr("d", path)
        .attr("fill", d => {
          const data = ridingData[d.properties.code] || ridingData[normName(d.properties.name || d.properties.Name)] || ridingData[normName(d.properties[YEAR_TO_ERA[activeYear] + "_Constituency"] || "")];
          return isRefMode(activeYear) ? refColour(data) : ridingColour(data);
        })
        .attr("stroke", d => {
          const data = ridingData[d.properties.code] || ridingData[normName(d.properties.name || d.properties.Name)] || ridingData[normName(d.properties[YEAR_TO_ERA[activeYear] + "_Constituency"] || "")];
          return isRefMode(activeYear) ? refColour(data) : ridingColour(data);
        })
        .attr("stroke-width", 0.5 / currentK)
        .on("mousemove touchstart", function(event, d) {
          event.preventDefault && event.preventDefault();
          const data = ridingData[d.properties.code] || ridingData[normName(d.properties.name || d.properties.Name)] || ridingData[normName(d.properties[YEAR_TO_ERA[activeYear] + "_Constituency"] || "")];
          const areaLabel = isRefMode(activeYear) ? "Local Authority" : "Constituency";
          setTooltip(d.properties.name || d.properties.Name, areaLabel, data);
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
      const padTopVB    = 56  / vbScaleY;   // year selector
      const padSideVB   = 20  / vbScaleX;   // left/right
      const padBottomVB = 20  / vbScaleY;   // bottom

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
  }

  /* ─── 7. Legend ─────────────────────────────────────────────────── */
  function updateLegend(year) {
    const leg = document.getElementById("map-legend");
    if (!leg) return;

    if (isRefMode(year)) {
      leg.innerHTML = `
        <div class="leg-title">EU Referendum 2016</div>
        <div class="leg-bar">
          <div class="leg-swatch" style="background:linear-gradient(to right,#5b9ec9,#0a2244)"></div>
          <span style="color:#5b9ec9">Leave</span>
        </div>
        <div class="leg-bar">
          <div class="leg-swatch" style="background:linear-gradient(to right,#e8c93c,#7a5a00)"></div>
          <span style="color:#e8c93c">Remain</span>
        </div>
        <div style="margin-top:6px;font-size:0.6rem;color:#3a4460">Darker = larger margin</div>`;
      return;
    }

    const totals = SEAT_TOTALS[year] || {};
    const sorted = Object.entries(totals).sort((a,b) => b[1]-a[1]);
    const pairs = {
      Lab:["#c0392b","#5e0909"], Con:["#2471a3","#0a2244"],
      LD:["#d68910","#6b3300"], Lib:["#f5c842","#7a5e00"],
      NatLib:["#d4a017","#6b3d00"],
      SNP:["#c9a800","#5a4700"], PC:["#1e8449","#083d1c"],
      Reform:["#12b6cf","#00415a"], RUK:["#12b6cf","#00415a"], Grn:["#5cb85c","#1a4a1a"],
      SF:["#4a9e6e","#0d3320"], DUP:["#8e44ad","#3d1060"],
      SDLP:["#2ecc71","#0a4a25"], UUP:["#5b8ed4","#1a3560"],
      ALL:["#e67e22","#7a3a00"], UKIP:["#9b59b6","#2d1045"],
      Brexit:["#12b6cf","#065a69"], IND:["#95a5a6","#2c3e50"],
      Ind:["#95a5a6","#2c3e50"], NatLab:["#c0392b","#6b0000"],
      Nat:["#8b9e6e","#3a4a2a"], Com:["#c0392b","#4a0000"],
      ILP:["#e05050","#7a0000"], CW:["#7c8290","#2d3035"], NILP:["#c0392b","#5e0909"],
    };
    const displayNames = {
      Lab:"Labour", Con:"Conservative", LD:"Lib Dem", Lib:"Liberal",
      NatLib:"National Liberal", SNP:"SNP", PC:"Plaid Cymru", Grn:"Green",
      Reform:"Reform", RUK:"Reform UK", SF:"Sinn Féin", DUP:"DUP",
      SDLP:"SDLP", UUP:"UUP", ALL:"Alliance", UKIP:"UKIP",
      Brexit:"Brexit", IND:"Independent", Ind:"Independent",
      NatLab:"National Labour", Nat:"National", Com:"Communist",
      ILP:"Ind. Labour", CW:"Co-operative", NILP:"NI Labour",
    };

    const yearLabel = year === 1974 ? "Feb 1974" : `${year}`;
    let html = `<div class="leg-title">UK General Election ${yearLabel}</div>`;
    for (const [party, seats] of sorted) {
      if (!seats) continue;
      const c = pairs[party] || ["#7c8290","#2d3035"];
      const accent = partyColourAccent(party);
      const name = displayNames[party] || party;
      html += `<div class="leg-bar">
        <div class="leg-swatch" style="background:linear-gradient(to right,${c[0]},${c[1]})"></div>
        <span style="color:${accent}">${name} <span style="color:#3a4460;font-size:0.6rem">${seats}</span></span>
      </div>`;
    }
    html += `<div style="margin-top:6px;font-size:0.6rem;color:#3a4460">Darker = larger margin</div>`;
    leg.innerHTML = html;
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