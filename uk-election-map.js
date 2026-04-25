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
  const YEARS = [2024, 2019, 2017, "ref2016", 2015, 2010, 2005, 2001, 1997, 1992, 1987, 1983];

  const YEAR_TO_ERA = {
    2024: "2024",
    2019: "2010", 2017: "2010", 2015: "2010", 2010: "2010",
    2005: "2005",
    2001: "1997", 1997: "1997",
    1992: "1992",
    1987: "1983", 1983: "1983",
    "ref2016": "ref2016",
  };

  function isRefMode(year) { return year === "ref2016"; }

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
    return BASE_URL + (year === 2024 ? "election_results_uk.xlsx" : `election_results_${year}.xlsx`);
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

      /* ── Year selector ── */
      #year-selector {
        position: fixed;
        top: calc(var(--topbar-height, 0px) + 10px);
        left: 50%;
        transform: translateX(-50%);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 0;
        background: #13161e;
        border: 1px solid #2a3350;
        border-radius: 6px;
        overflow-x: auto;
        overflow-y: hidden;
        pointer-events: all;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        max-width: calc(100vw - 24px);
      }

      #year-selector::-webkit-scrollbar { display: none; }

      .year-btn {
        background: transparent;
        border: none;
        border-right: 1px solid #1e2330;
        color: #5a6280;
        font-family: 'DM Mono', monospace;
        font-size: 0.68rem;
        letter-spacing: 0.05em;
        padding: 7px 11px;
        cursor: pointer;
        transition: background 0.15s, color 0.15s;
        white-space: nowrap;
        flex-shrink: 0;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
      }

      .year-btn:last-child { border-right: none; }

      .year-btn:hover { background: #1a2035; color: #e8eaf0; }

      .year-btn.active {
        background: #4e7cff22;
        color: #4e7cff;
        border-color: #4e7cff44;
      }

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
      LD:     ["#e8a83c","#6b3300"], Lib:    ["#e8a83c","#6b3300"],
      SNP:    ["#dfc440","#5a4700"], PC:     ["#4aaa74","#083d1c"],
      Reform: ["#12b6cf","#00415a"], RUK:    ["#12b6cf","#00415a"], Grn:    ["#5cb85c","#1a4a1a"],
      SF:     ["#4a9e6e","#0d3320"], DUP:    ["#8e44ad","#3d1060"],
      SDLP:   ["#2ecc71","#0a4a25"], UUP:    ["#5b8ed4","#1a3560"],
      ALL:    ["#e67e22","#7a3a00"], UKIP:   ["#6b2fa0","#2d1045"],
      Brexit: ["#12b6cf","#065a69"], IND:    ["#95a5a6","#2c3e50"],
    };
    return pairs[winner] || ["#7c8290","#2d3035"];
  }

  function partyColourAccent(party) {
    const map = {
      Lab:"#db6b5f", Con:"#5b9ec9", LD:"#e8a83c", Lib:"#e8a83c",
      SNP:"#dfc440", PC:"#4aaa74", Reform:"#12b6cf", RUK:"#12b6cf", Grn:"#5cb85c",
      SF:"#4a9e6e", DUP:"#8e44ad", SDLP:"#2ecc71", UUP:"#5b8ed4",
      ALL:"#e67e22", UKIP:"#9b59b6", Brexit:"#12b6cf", IND:"#95a5a6",
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
    return String(s).trim().toLowerCase().replace(/\s*&\s*/g, ' and ').replace(/\s+/g, ' ');
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
          // Index by normalised name (all years)
          const norm = r["Norm Name"] || normName(r["Constituency"]);
          if (norm) ridingData[norm] = entry;
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
        html += `<div style="margin-top:8px">
          <div style="margin-bottom:6px">
            <div style="display:flex;justify-content:space-between;margin-bottom:2px">
              <span style="color:${leaveColour};font-weight:500">Leave</span>
              <span style="color:#8890aa;font-size:0.68rem">${pct(elecData.pctLeave)}<span style="color:#3a4460;margin-left:6px">${fmtVotes(elecData.leave)}</span></span>
            </div>
            <div style="height:3px;background:#1e2330;border-radius:2px">
              <div style="height:100%;width:${leaveBar}%;background:${leaveColour};border-radius:2px;opacity:0.85"></div>
            </div>
          </div>
          <div style="margin-bottom:6px">
            <div style="display:flex;justify-content:space-between;margin-bottom:2px">
              <span style="color:${remainColour};font-weight:500">Remain</span>
              <span style="color:#8890aa;font-size:0.68rem">${pct(elecData.pctRemain)}<span style="color:#3a4460;margin-left:6px">${fmtVotes(elecData.remain)}</span></span>
            </div>
            <div style="height:3px;background:#1e2330;border-radius:2px">
              <div style="height:100%;width:${remainBar}%;background:${remainColour};border-radius:2px;opacity:0.85"></div>
            </div>
          </div>
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
    let activeYear = (window.ATLAS_INITIAL_YEAR && [2024,2019,2017,2015,2010,2005,2001,1997,1992,1987,1983].includes(window.ATLAS_INITIAL_YEAR)) ? window.ATLAS_INITIAL_YEAR : 2024;
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
      document.querySelectorAll(".year-btn").forEach(b => {
        const bYear = b.dataset.year === "ref2016" ? "ref2016" : +b.dataset.year;
        const isActive = bYear === activeYear;
        b.classList.toggle("active", isActive);
        if (isActive) setTimeout(() => b.scrollIntoView({ block: "nearest", inline: "center" }), 100);
      });
      loadYear(activeYear, regionPaths);

      /* ── Year selector buttons ── */
      const yearSel = document.getElementById("year-selector");
      yearSel.querySelectorAll(".year-btn").forEach(btn => {
        btn.addEventListener("click", function() {
          const yr = this.dataset.year === "ref2016" ? "ref2016" : +this.dataset.year;
          if (yr === activeYear) return;
          activeYear = yr;
          yearSel.querySelectorAll(".year-btn").forEach(b => b.classList.remove("active"));
          this.classList.add("active");
          // Scroll active button into view on mobile
          this.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
          // Reset map state
          activeRegionCode = null;
          regionPaths.classed("selected", false);
          ridingG.selectAll("*").remove();
          zoomedRidingG.selectAll("*").remove();
          highlightG.selectAll("*").remove();
          resetBtn.classList.remove("visible");
          svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity);
          loadYear(yr, regionPaths);
        });
      });

    });

    /* ── Load a year's boundary + results ── */
    function loadYear(year, regionPaths) {
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
          ridingData  = elecResults.ridingData;
          regionData  = elecResults.regionData;
          showAllRidings();
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
          const data = ridingData[d.properties.code] || ridingData[normName(d.properties.name)];
          return isRefMode(activeYear) ? refColour(data) : ridingColour(data);
        })
        .attr("stroke", d => {
          const data = ridingData[d.properties.code] || ridingData[normName(d.properties.name)];
          return isRefMode(activeYear) ? refColour(data) : ridingColour(data);
        })
        .attr("stroke-width", 0.5)
        .attr("pointer-events", "all")
        .on("mousemove", function(event, d) {
          const data = ridingData[d.properties.code] || ridingData[normName(d.properties.name)];
          setTooltip(d.properties.name, "Constituency", data);
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

      // For elections, filter by underscore region string; for ref, filter by ONS code directly
      const regionFilter = isRefMode(activeYear)
        ? (g => g.properties.region === regionCode)
        : (function() {
            const regionStr = Object.keys(RIDING_REGION_MAP).find(k => RIDING_REGION_MAP[k] === regionCode);
            return g => g.properties.region === regionStr;
          })();

      const regionRidings = allRidings.features.filter(r =>
        isRefMode(activeYear)
          ? r.properties.region === regionCode
          : r.properties.region === Object.keys(RIDING_REGION_MAP).find(k => RIDING_REGION_MAP[k] === regionCode)
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
          const data = ridingData[d.properties.code] || ridingData[normName(d.properties.name)];
          return isRefMode(activeYear) ? refColour(data) : ridingColour(data);
        })
        .attr("stroke", d => {
          const data = ridingData[d.properties.code] || ridingData[normName(d.properties.name)];
          return isRefMode(activeYear) ? refColour(data) : ridingColour(data);
        })
        .attr("stroke-width", 0.5 / currentK)
        .on("mousemove touchstart", function(event, d) {
          event.preventDefault && event.preventDefault();
          const data = ridingData[d.properties.code] || ridingData[normName(d.properties.name)];
          const areaLabel = isRefMode(activeYear) ? "Local Authority" : "Constituency";
          setTooltip(d.properties.name, areaLabel, data);
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
      LD:["#d68910","#6b3300"], Lib:["#d68910","#6b3300"],
      SNP:["#c9a800","#5a4700"], PC:["#1e8449","#083d1c"],
      Reform:["#12b6cf","#00415a"], RUK:["#12b6cf","#00415a"], Grn:["#5cb85c","#1a4a1a"],
      SF:["#4a9e6e","#0d3320"], DUP:["#8e44ad","#3d1060"],
      SDLP:["#2ecc71","#0a4a25"], UUP:["#5b8ed4","#1a3560"],
      ALL:["#e67e22","#7a3a00"], UKIP:["#9b59b6","#2d1045"],
      Brexit:["#12b6cf","#065a69"], IND:["#95a5a6","#2c3e50"],
    };
    const displayNames = {
      Lab:"Labour", Con:"Conservative", LD:"Lib Dem", Lib:"Lib Dem",
      SNP:"SNP", PC:"Plaid Cymru", Grn:"Green", Reform:"Reform", RUK:"Reform UK",
      SF:"Sinn Féin", DUP:"DUP", SDLP:"SDLP", UUP:"UUP",
      ALL:"Alliance", UKIP:"UKIP", Brexit:"Brexit", IND:"Independent",
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
      Lab:"#db6b5f", Con:"#5b9ec9", LD:"#e8a83c", Lib:"#e8a83c",
      SNP:"#dfc440", PC:"#4aaa74", Reform:"#12b6cf", RUK:"#12b6cf", Grn:"#5cb85c",
      SF:"#4a9e6e", DUP:"#8e44ad", SDLP:"#2ecc71", UUP:"#5b8ed4",
      ALL:"#e67e22", UKIP:"#9b59b6", Brexit:"#12b6cf", IND:"#95a5a6",
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
      const sel = document.createElement("div");
      sel.id = "year-selector";
      const years = [2024, 2019, 2017, "ref2016", 2015, 2010, 2005, 2001, 1997, 1992, 1987, 1983];
      years.forEach((yr, i) => {
        const btn = document.createElement("button");
        btn.className = "year-btn" + (i === 0 ? " active" : "");
        btn.dataset.year = yr;
        btn.textContent = yr === "ref2016" ? "2016 Ref" : yr;
        sel.appendChild(btn);
      });
      document.body.appendChild(sel);
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