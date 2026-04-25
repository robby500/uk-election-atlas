/**
 * UK Election Model Map
 * Standalone map for poll-to-seat projections.
 * Loads UK_Constituency_Data.xlsx (output of New_UK_Model.py)
 * and uk-ridings.json (2024 boundaries).
 *
 * Files needed in same directory as this script:
 *   uk-ridings.json             (2024 TopoJSON, object: ridings)
 *   uk-regions.json             (2024 regions TopoJSON, object: regions)
 *   UK_Constituency_Data.xlsx   (model output, Sheet1)
 */

(function () {
  "use strict";

  const BASE_URL = (function () {
    const scripts = document.querySelectorAll("script[src]");
    for (const s of scripts) {
      if (s.src && s.src.includes("uk-model-map")) {
        return s.src.substring(0, s.src.lastIndexOf("/") + 1);
      }
    }
    return "./";
  })();

  /* ─── Party maps ──────────────────────────────────────────────────── */
  const PARTY_ABBR = {
    Conservative:"Con", Labour:"Lab", LD:"LD", Green:"Grn",
    Reform:"RUK", SNP:"SNP", PC:"PC", DUP:"DUP",
    SF:"SF", SDLP:"SDLP", UUP:"UUP", ALL:"ALL", IND:"IND",
  };

  const REGION_ABBR = {
    "North East (England)":"NE","North West (England)":"NW",
    "Yorkshire and The Humber":"YH","East Midlands (England)":"EM",
    "West Midlands (England)":"WM","East of England":"EE",
    "London":"LDN","South East (England)":"SE","South West (England)":"SW",
    "Wales":"WLS","Scotland":"SCT","Northern Ireland":"NI",
  };

  const RIDING_REGION_MAP = {
    North_East:"UKC",North_West:"UKD",Yorkshire_Humber:"UKE",
    East_Midlands:"UKF",West_Midlands:"UKG",East_England:"UKH",
    London:"UKI",South_East:"UKJ",South_West:"UKK",
    Wales:"UKL",Scotland:"UKM",NI:"UKN",
  };

  /* ─── Colours ─────────────────────────────────────────────────────── */
  function colourPair(winner) {
    const pairs = {
      Lab:   ["#db6b5f","#5e0909"], Con:   ["#5b9ec9","#0a2244"],
      LD:    ["#e8a83c","#6b3300"], Grn:   ["#5cb85c","#1a4a1a"],
      RUK:   ["#12b6cf","#00415a"], Reform:["#12b6cf","#00415a"],
      SNP:   ["#dfc440","#5a4700"], PC:    ["#4aaa74","#083d1c"],
      SF:    ["#4a9e6e","#0d3320"], DUP:   ["#8e44ad","#3d1060"],
      SDLP:  ["#2ecc71","#0a4a25"], UUP:   ["#5b8ed4","#1a3560"],
      ALL:   ["#e67e22","#7a3a00"], IND:   ["#95a5a6","#2c3e50"],
    };
    return pairs[winner] || ["#7c8290","#2d3035"];
  }

  function constituencyColour(data) {
    if (!data) return "#1a2035";
    // Win probability (0–1) drives gradient darkness
    const t = Math.min(1, Math.max(0, data.winProb));
    const [light, dark] = colourPair(data.winner);
    return d3.interpolateRgb(light, dark)(t);
  }

  function partyAccent(abbr) {
    const m = {
      Lab:"#db6b5f",Con:"#5b9ec9",LD:"#e8a83c",Grn:"#5cb85c",
      RUK:"#12b6cf",Reform:"#12b6cf",SNP:"#dfc440",PC:"#4aaa74",
      SF:"#4a9e6e",DUP:"#8e44ad",SDLP:"#2ecc71",UUP:"#5b8ed4",
      ALL:"#e67e22",IND:"#95a5a6",
    };
    return m[abbr] || "#7c8290";
  }

  /* ─── Rating helper ────────────────────────────────────────────────── */
  function ratingColour(winProb) {
    if (winProb >= 0.95) return "#aabbd4";
    if (winProb >= 0.75) return "#7a9ec0";
    if (winProb >= 0.55) return "#5a84b0";
    return "#888";
  }

  /* ─── Load dependencies ────────────────────────────────────────────── */
  function loadScript(src, cb) {
    const s = document.createElement("script");
    s.src = src; s.onload = cb;
    document.head.appendChild(s);
  }

  function init() {
    loadScript("https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js", () =>
      loadScript("https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js", () =>
        loadScript("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js", buildMap)
      )
    );
  }

  /* ─── Styles ───────────────────────────────────────────────────────── */
  function injectStyles() {
    const s = document.createElement("style");
    s.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Mono:wght@400;500&display=swap');

      :root {
        --bg:#0d0f14; --panel:#13161e; --border:#1e2330;
        --accent:#4e7cff; --text:#e8eaf0; --muted:#5a6280;
        --tooltip-bg:#0d0f14ee;
      }

      *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }

      body {
        background:var(--bg); font-family:'DM Mono',monospace;
        color:var(--text); height:100vh; overflow:hidden; margin:0;
      }

      #model-map { width:100%; height:100%; background:var(--bg); overflow:hidden; position:relative; }
      #model-map svg { width:100%; height:100%; }

      .region { fill:transparent; stroke:#2a3350; stroke-width:0.6px; cursor:pointer; pointer-events:all; }
      .region-label {
        font-family:'DM Mono',monospace; font-size:7px; font-weight:500;
        fill:rgba(255,255,255,0.75); pointer-events:none;
        text-anchor:middle; dominant-baseline:middle;
      }

      /* ── Seat counter bar ── */
      #seat-bar {
        position:fixed; top:calc(var(--topbar-height,0px) + 10px);
        left:50%; transform:translateX(-50%);
        z-index:10000; background:#13161e; border:1px solid #2a3350;
        border-radius:6px; overflow:hidden; pointer-events:none;
        display:flex; align-items:stretch; white-space:nowrap;
        max-width:calc(100vw - 24px);
      }

      .seat-segment {
        display:flex; align-items:center; gap:5px;
        padding:6px 10px; font-size:0.65rem;
        border-right:1px solid #1e2330; white-space:nowrap;
      }
      .seat-segment:last-child { border-right:none; }
      .seat-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }

      /* ── Reset button ── */
      #model-reset {
        position:fixed; top:calc(var(--topbar-height,0px) + 10px); left:16px;
        z-index:10000; background:#13161e; border:1px solid #2a3350;
        color:#5a6280; font-family:'DM Mono',monospace;
        font-size:0.68rem; text-transform:uppercase; letter-spacing:0.1em;
        padding:7px 12px; border-radius:4px; cursor:pointer;
        opacity:0; pointer-events:none;
        transition:opacity 0.2s, color 0.15s;
        -webkit-tap-highlight-color:transparent;
      }
      #model-reset.visible { opacity:1; pointer-events:all; }
      #model-reset:hover { color:#e8eaf0; border-color:#4e7cff; }

      /* ── Loading ── */
      #model-loading {
        position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
        background:#13161eee; border:1px solid #2a3350; border-radius:6px;
        padding:16px 28px; font-size:0.8rem; color:#4e7cff;
        z-index:300; display:none; letter-spacing:0.08em;
      }

      /* ── Tooltip ── */
      #model-tooltip {
        position:fixed; pointer-events:none;
        background:var(--tooltip-bg); border:1px solid var(--border);
        border-left:3px solid var(--accent); padding:10px 14px;
        border-radius:4px; font-family:'DM Mono',monospace; font-size:0.72rem;
        color:var(--text); min-width:210px; opacity:0;
        transform:translateY(4px);
        transition:opacity 0.12s ease, transform 0.12s ease;
        z-index:9999; backdrop-filter:blur(6px);
      }
      #model-tooltip.visible { opacity:1; transform:translateY(0); }
      #model-tooltip .tt-name { font-family:'DM Serif Display',serif; font-size:1rem; margin-bottom:2px; }

      /* ── Legend ── */
      #model-legend {
        position:fixed; bottom:20px; right:20px; z-index:100;
        background:#13161ecc; border:1px solid #2a3350;
        border-radius:5px; padding:10px 14px;
        font-family:'DM Mono',monospace; font-size:0.65rem;
        color:var(--muted); backdrop-filter:blur(6px);
      }
      .leg-title { font-size:0.6rem; text-transform:uppercase; letter-spacing:0.1em; margin-bottom:8px; color:#3a4460; }
      .leg-bar { display:flex; align-items:center; gap:6px; margin-bottom:4px; }
      .leg-swatch { width:60px; height:8px; border-radius:2px; }

      @media (max-width:768px) {
        #model-tooltip {
          left:12px !important; right:12px !important;
          bottom:16px !important; top:auto !important;
          white-space:normal; min-width:unset;
        }
        #model-legend { display:none; }
      }
    `;
    document.head.appendChild(s);
  }

  /* ─── Load model results ───────────────────────────────────────────── */
  function loadModelData() {
    return fetch(BASE_URL + "UK_Constituency_Data.xlsx")
      .then(r => r.arrayBuffer())
      .then(buf => {
        const wb = XLSX.read(buf, { type:"array" });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets["Sheet1"]);
        const data = {};
        let seats = {};
        rows.forEach(r => {
          const abbr = PARTY_ABBR[r["Party_1"]] || r["Party_1"];
          const winProb = +r["Party_1_Win"] / 100;
          const entry = {
            name:       r["Riding"],
            winner:     abbr,
            winProb:    winProb,
            winnerPct:  +r["Party_1_Vote"] / 100,
            runnerUp:   PARTY_ABBR[r["Party_2"]] || r["Party_2"],
            runnerUpPct:+r["Party_2_Vote"] / 100,
            p3: PARTY_ABBR[r["Party_3"]] || r["Party_3"], p3Pct: +r["Party_3_Vote"] / 100,
            p4: PARTY_ABBR[r["Party_4"]] || r["Party_4"], p4Pct: +r["Party_4_Vote"] / 100,
            p5: PARTY_ABBR[r["Party_5"]] || r["Party_5"], p5Pct: +r["Party_5_Vote"] / 100,
            rating:     r["Rating"] || "",
            change:     r["Change"] || "",
            swing:      r["Swing"] || "",
            region:     r["Region"] || "",
            party1Win:  +r["Party_1_Win"],
          };
          if (r["ID"]) data[String(r["ID"])] = entry;
          data[normName(r["Riding"])] = entry;
          // Tally projected seats (based on rating)
          if (r["Rating"]) {
            seats[abbr] = (seats[abbr] || 0) + 1;
          }
        });
        return { data, seats };
      });
  }

  function normName(s) {
    return String(s||"").trim().toLowerCase().replace(/\s*&\s*/g," and ").replace(/\s+/g," ");
  }

  /* ─── Build map ────────────────────────────────────────────────────── */
  function buildMap() {
    const isMobile = window.matchMedia("(max-width:768px)").matches || ("ontouchstart" in window);
    const W = 600, H = 800;

    const container = document.getElementById("model-map") ||
      (() => { const d = document.createElement("div"); d.id="model-map"; document.body.appendChild(d); return d; })();

    const svg = d3.select(container).append("svg")
      .attr("viewBox", `0 0 ${W} ${H}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    svg.append("rect").attr("width",W).attr("height",H).attr("fill","#0d0f14");

    const projection = d3.geoMercator();
    const path = d3.geoPath().projection(projection);
    const mapG = svg.append("g");

    const ridingG    = mapG.append("g").attr("class","ridings");
    const regionsLayer = mapG.append("g").attr("class","regions-layer");
    const zoomedRidingG = mapG.append("g").attr("class","zoomed-ridings");
    const highlightG = mapG.append("g").attr("class","highlights");

    let currentK = 1, activeRegionCode = null;
    let ridingsData = null, allRidings = null, modelData = {};

    const resetBtn   = document.getElementById("model-reset");
    const loadingEl  = document.getElementById("model-loading");
    const tooltip    = document.getElementById("model-tooltip");

    function pct(v) { return (v*100).toFixed(1)+"%"; }

    function showTooltip(elecData, event) {
      if (!elecData) { tooltip.classList.remove("visible"); return; }
      const wc = partyAccent(elecData.winner);
      const rc = ratingColour(elecData.winProb);
      const changeColour = elecData.change === "Pickup" ? "#e8a83c" : "#5a6280";
      tooltip.style.borderLeftColor = wc;

      const parties = [
        { p:elecData.winner,   v:elecData.winnerPct },
        { p:elecData.runnerUp, v:elecData.runnerUpPct },
        { p:elecData.p3,       v:elecData.p3Pct },
        { p:elecData.p4,       v:elecData.p4Pct },
        { p:elecData.p5,       v:elecData.p5Pct },
      ].filter(x => x.p && x.v > 0);

      const maxV = parties[0] ? parties[0].v : 1;
      const bars = parties.map(x => {
        const colour = partyAccent(x.p);
        const barW = Math.round((x.v / maxV) * 100);
        return `<div style="margin-bottom:5px">
          <div style="display:flex;justify-content:space-between;margin-bottom:2px">
            <span style="color:${colour};font-weight:500">${x.p}</span>
            <span style="color:#8890aa;font-size:0.68rem">${pct(x.v)}</span>
          </div>
          <div style="height:3px;background:#1e2330;border-radius:2px">
            <div style="height:100%;width:${barW}%;background:${colour};border-radius:2px;opacity:0.85"></div>
          </div>
        </div>`;
      }).join("");

      tooltip.innerHTML = `
        <div class="tt-name" style="color:${wc}">${elecData.name}</div>
        <div style="display:flex;align-items:center;gap:8px;margin:4px 0 8px">
          <span style="color:${rc};font-size:0.65rem">${elecData.rating}</span>
          <span style="color:${changeColour};font-size:0.6rem;margin-left:auto">${elecData.change}</span>
        </div>
        <div>${bars}</div>
        <div style="margin-top:6px;font-size:0.6rem;color:#3a4460">
          Win probability: ${pct(elecData.winProb)} · ${elecData.swing}
        </div>`;

      tooltip.classList.add("visible");
      if (!isMobile && event) {
        tooltip.style.left = (event.clientX + 14) + "px";
        tooltip.style.top  = (event.clientY - 36) + "px";
      }
    }

    const zoom = d3.zoom().scaleExtent([1,20])
      .on("zoom", function(event) {
        const k = event.transform.k;
        currentK = k;
        mapG.attr("transform", event.transform);
        mapG.selectAll(".region").attr("stroke-width", 0.6/k);
        mapG.selectAll(".region-label").attr("font-size", 7/k);
        mapG.selectAll(".riding-fill").attr("stroke-width", 0.5/k);
        mapG.selectAll(".zoomed-fill").attr("stroke-width", 0.5/k);
        highlightG.selectAll(".region-hover-ring").attr("stroke-width", 0.7/k);
        highlightG.selectAll(".region-selected-ring").attr("stroke-width", 1.5/k);
        highlightG.selectAll(".riding-hover").attr("stroke-width", 0.9/k);
      });

    svg.call(zoom);

    function zoomToRegion(feature) {
      const [[x0,y0],[x1,y1]] = path.bounds(feature);
      const bW = x1-x0, bH = y1-y0;
      const svgEl = svg.node();
      const clientW = svgEl.clientWidth || W;
      const clientH = svgEl.clientHeight || H;
      const vbScaleX = clientW/W, vbScaleY = clientH/H;
      const padTopVB = 56/vbScaleY, padSideVB = 20/vbScaleX, padBottomVB = 20/vbScaleY;
      const availW = W - 2*padSideVB, availH = H - padTopVB - padBottomVB;
      const scale = Math.min(availW/bW, availH/bH, 18);
      const cx = (x0+x1)/2, cy = (y0+y1)/2;
      const targetX = padSideVB + availW/2, targetY = padTopVB + availH/2;
      svg.transition().duration(650).call(
        zoom.transform,
        d3.zoomIdentity.translate(targetX - scale*cx, targetY - scale*cy).scale(scale)
      );
    }

    function getData(d) {
      return modelData[d.properties.code] || modelData[normName(d.properties.name)];
    }

    function showAllRidings() {
      ridingG.selectAll("*").remove();
      if (!ridingsData) return;
      ridingG.selectAll(".riding-fill")
        .data(allRidings.features)
        .join("path")
        .attr("class","riding-fill")
        .attr("d", path)
        .attr("fill", d => constituencyColour(getData(d)))
        .attr("stroke", d => constituencyColour(getData(d)))
        .attr("stroke-width", 0.5)
        .attr("pointer-events","all")
        .on("mousemove", function(event, d) {
          showTooltip(getData(d), event);
          highlightG.selectAll(".riding-hover").remove();
          highlightG.append("path").attr("class","riding-hover")
            .datum(d).attr("d", path).attr("fill","none")
            .attr("stroke","#fff").attr("stroke-width", 0.9/currentK)
            .attr("stroke-opacity", 0.9).attr("pointer-events","none");
        })
        .on("mouseleave", function(event) {
          const rel = event.relatedTarget;
          if (!rel || !rel.classList.contains("riding-fill")) {
            tooltip.classList.remove("visible");
            highlightG.selectAll(".riding-hover").remove();
          }
        });
      mapG.append(() => highlightG.node());
    }

    function showRidings(regionCode) {
      zoomedRidingG.selectAll("*").remove();
      if (!ridingsData) return;
      const regionStr = Object.keys(RIDING_REGION_MAP).find(k => RIDING_REGION_MAP[k] === regionCode);
      const regionRidings = allRidings.features.filter(r => r.properties.region === regionStr);
      const filteredGeoms = ridingsData.objects.ridings.geometries.filter(g => g.properties.region === regionStr);
      const subObject = Object.assign({}, ridingsData.objects.ridings, { geometries: filteredGeoms });
      const interiorMesh = topojson.mesh(ridingsData, subObject, (a,b) => a !== b);
      const outerBoundary = topojson.mesh(ridingsData, subObject, (a,b) => a === b);
      const clipId = "clip-model-" + regionCode;
      zoomedRidingG.append("defs").append("clipPath").attr("id", clipId)
        .append("path").attr("d", path(outerBoundary));
      const clippedG = zoomedRidingG.append("g").attr("clip-path", `url(#${clipId})`);
      clippedG.selectAll(".zoomed-fill")
        .data(regionRidings).join("path")
        .attr("class","zoomed-fill").attr("d", path)
        .attr("fill", d => constituencyColour(getData(d)))
        .attr("stroke", d => constituencyColour(getData(d)))
        .attr("stroke-width", 0.5/currentK)
        .on("mousemove touchstart", function(event, d) {
          event.preventDefault && event.preventDefault();
          showTooltip(getData(d), event);
          highlightG.selectAll(".riding-hover").remove();
          highlightG.append("path").attr("class","riding-hover")
            .datum(d).attr("d", path).attr("fill","none")
            .attr("stroke","#fff").attr("stroke-width", 0.9/currentK)
            .attr("stroke-opacity", 0.9).attr("pointer-events","none");
        })
        .on("mouseleave", function(event) {
          const rel = event.relatedTarget;
          if (!rel || !rel.classList.contains("zoomed-fill")) {
            tooltip.classList.remove("visible");
            highlightG.selectAll(".riding-hover").remove();
          }
        });
      clippedG.append("path").attr("class","riding-mesh")
        .datum(interiorMesh).attr("d", path).attr("fill","none")
        .attr("stroke","rgba(160,165,180,0.35)").attr("stroke-width", 0.4/currentK)
        .attr("pointer-events","none");
      mapG.append(() => highlightG.node());
    }

    function resetMap() {
      activeRegionCode = null;
      regionsLayer.selectAll(".region").classed("selected", false);
      highlightG.selectAll("*").remove();
      zoomedRidingG.selectAll("*").remove();
      regionsLayer.style("pointer-events", null);
      resetBtn.classList.remove("visible");
      mapG.append(() => highlightG.node());
      svg.transition().duration(650).call(zoom.transform, d3.zoomIdentity);
      showAllRidings();
    }

    resetBtn.addEventListener("click", resetMap);

    /* ── Load data ── */
    loadingEl.style.display = "block";
    Promise.all([
      d3.json(BASE_URL + "uk-ridings.json"),
      d3.json(BASE_URL + "uk-regions.json"),
      loadModelData(),
    ]).then(function([rData, regData, { data, seats }]) {
      ridingsData = rData;
      allRidings = topojson.feature(ridingsData, ridingsData.objects.ridings);
      modelData = data;

      const regions = topojson.feature(regData, regData.objects.regions);
      const pad = 24;
      projection.fitExtent([[pad,pad],[W-pad,H-pad]], regions);

      // Graticule
      const grat = d3.geoGraticule().step([2,2]);
      mapG.insert("path",":first-child")
        .datum(grat()).attr("fill","none")
        .attr("stroke","#1a1f2e").attr("stroke-width",0.4).attr("d",path);

      // Region fills (transparent — ridings carry colour)
      const regionPaths = regionsLayer.selectAll("path.region")
        .data(regions.features).join("path")
        .attr("class","region").attr("d",path).attr("fill","transparent");

      // Region border mesh
      regionsLayer.append("path")
        .datum(topojson.mesh(regData, regData.objects.regions, (a,b) => a!==b))
        .attr("fill","none").attr("stroke","#2a3350")
        .attr("stroke-width",0.5).attr("d",path).attr("pointer-events","none");

      // Region labels
      function largestPolygonCentroid(feature) {
        const geom = feature.geometry;
        if (!geom) return null;
        let polygons = geom.type === "Polygon"
          ? [{type:"Polygon",coordinates:geom.coordinates}]
          : geom.coordinates.map(c => ({type:"Polygon",coordinates:c}));
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

      regionsLayer.append("g").selectAll("text")
        .data(regions.features).join("text")
        .attr("class","region-label")
        .attr("transform", d => { const c = largestPolygonCentroid(d); return c ? `translate(${c})` : "translate(-9999,-9999)"; })
        .text(d => REGION_ABBR[d.properties.name] || "");

      // Region interactions
      regionPaths
        .on("mousemove", function(event, d) {
          const code = d.properties.code;
          if (code === activeRegionCode) return;
          mapG.append(() => highlightG.node());
          highlightG.selectAll(".region-hover-ring").remove();
          highlightG.append("path").attr("class","region-hover-ring")
            .datum(d).attr("d",path).attr("fill","none").attr("stroke","#fff")
            .attr("stroke-width",0.7).attr("stroke-opacity",0.75).attr("pointer-events","none");
          tooltip.classList.remove("visible");
        })
        .on("mouseleave", function() {
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
            .datum(d).attr("d",path).attr("fill","none").attr("stroke","#fff")
            .attr("stroke-width",3).attr("stroke-opacity",0.9).attr("pointer-events","none");
          showRidings(code);
          regionsLayer.node().parentNode.insertBefore(zoomedRidingG.node(), regionsLayer.node().nextSibling);
          mapG.append(() => highlightG.node());
          zoomToRegion(d);
          resetBtn.classList.add("visible");
        });

      showAllRidings();
      updateSeatBar(seats);
      updateLegend(seats);
      loadingEl.style.display = "none";
    }).catch(err => {
      console.error("Model map load error:", err);
      loadingEl.style.display = "none";
    });

    /* ── Seat bar ── */
    function updateSeatBar(seats) {
      const bar = document.getElementById("seat-bar");
      if (!bar) return;
      const order = [
        {abbr:"Lab",   label:"Labour",       colour:"#db6b5f"},
        {abbr:"Con",   label:"Conservative", colour:"#5b9ec9"},
        {abbr:"RUK",   label:"Reform",       colour:"#12b6cf"},
        {abbr:"LD",    label:"Lib Dem",      colour:"#e8a83c"},
        {abbr:"SNP",   label:"SNP",          colour:"#dfc440"},
        {abbr:"Grn",   label:"Green",        colour:"#5cb85c"},
        {abbr:"PC",    label:"PC",           colour:"#4aaa74"},
        {abbr:"SF",    label:"SF",           colour:"#4a9e6e"},
        {abbr:"DUP",   label:"DUP",          colour:"#8e44ad"},
        {abbr:"SDLP",  label:"SDLP",         colour:"#2ecc71"},
        {abbr:"UUP",   label:"UUP",          colour:"#5b8ed4"},
        {abbr:"ALL",   label:"Alliance",     colour:"#e67e22"},
        {abbr:"IND",   label:"Ind",          colour:"#95a5a6"},
      ].filter(p => seats[p.abbr] > 0);

      bar.innerHTML = order.map(p => `
        <div class="seat-segment">
          <div class="seat-dot" style="background:${p.colour}"></div>
          <span style="color:${p.colour}">${p.label}</span>
          <span style="color:#e8eaf0;font-weight:500;margin-left:3px">${seats[p.abbr]}</span>
        </div>`).join("");
    }

    /* ── Legend ── */
    function updateLegend(seats) {
      const leg = document.getElementById("model-legend");
      if (!leg) return;
      const order = [
        {abbr:"Lab", label:"Labour",       c:["#db6b5f","#5e0909"]},
        {abbr:"Con", label:"Conservative", c:["#5b9ec9","#0a2244"]},
        {abbr:"RUK", label:"Reform UK",    c:["#12b6cf","#00415a"]},
        {abbr:"LD",  label:"Lib Dem",      c:["#e8a83c","#6b3300"]},
        {abbr:"SNP", label:"SNP",          c:["#dfc440","#5a4700"]},
        {abbr:"Grn", label:"Green",        c:["#5cb85c","#1a4a1a"]},
        {abbr:"PC",  label:"Plaid Cymru",  c:["#4aaa74","#083d1c"]},
      ].filter(p => seats[p.abbr] > 0);

      leg.innerHTML = `<div class="leg-title">Model Projection</div>` +
        order.map(p => `
          <div class="leg-bar">
            <div class="leg-swatch" style="background:linear-gradient(to right,${p.c[0]},${p.c[1]})"></div>
            <span style="color:${p.c[0]}">${p.label} <span style="color:#3a4460;font-size:0.6rem">${seats[p.abbr]}</span></span>
          </div>`).join("") +
        `<div style="margin-top:6px;font-size:0.6rem;color:#3a4460">Darker = higher win probability</div>`;
    }
  }

  /* ─── Bootstrap ────────────────────────────────────────────────────── */
  function bootstrap() {
    injectStyles();

    const els = {
      "model-map":     () => { const d=document.createElement("div"); d.id="model-map"; return d; },
      "model-reset":   () => { const b=document.createElement("button"); b.id="model-reset"; b.textContent="↺ Reset"; return b; },
      "model-loading": () => { const d=document.createElement("div"); d.id="model-loading"; d.textContent="Loading…"; return d; },
      "model-tooltip": () => { const d=document.createElement("div"); d.id="model-tooltip"; return d; },
      "seat-bar":      () => { const d=document.createElement("div"); d.id="seat-bar"; return d; },
      "model-legend":  () => { const d=document.createElement("div"); d.id="model-legend"; return d; },
    };
    Object.entries(els).forEach(([id, create]) => {
      if (!document.getElementById(id)) document.body.appendChild(create());
    });

    // Detect topbar offset
    (function() {
      function setOffset() {
        const el = document.getElementById("model-map");
        if (!el) return;
        document.documentElement.style.setProperty("--topbar-height", el.getBoundingClientRect().top+"px");
      }
      document.readyState === "loading"
        ? document.addEventListener("DOMContentLoaded", setOffset)
        : setOffset();
    })();

    init();
  }

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", bootstrap)
    : bootstrap();
})();