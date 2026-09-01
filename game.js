(() => {
  "use strict";

  // Shared projection constants/functions (KM_PER_LAT, KM_PER_PX, PAD,
  // northPoint, projectKm, rotateXY), date/shuffle utilities
  // (getTaipeiDateString, mulberry32, shuffledIndices, dateStringToDayIndex,
  // dayIndexToDateString, pastDateStrings, formatDisplayDate), and canvas
  // helpers (roundRectPath, drawLabelPill, paintOceanBase, pickRandom,
  // gradeFor) all come from shared.js, loaded before this file.

  const SCALE_BAR_KM = 50;

  const southPoint = extremePoint((p, best) => p[1] < best[1]);
  const eastPoint = extremePoint((p, best) => p[0] > best[0]);
  const westPoint = extremePoint((p, best) => p[0] < best[0]);

  // Named landmarks at each extreme, verified against real coordinates
  // (within ~1-5km, consistent with this outline data's simplification):
  // 富貴角 25.2975°N 121.5378°E, 鵝鑾鼻 21.9018°N 120.8514°E, 三貂角
  // 25.0019°N 122.0057°E, 國聖港燈塔 23.1008°N 120.0358°E.
  const NORTH_LABEL = "最北端(富貴角)";
  const SOUTH_LABEL = "最南端(鵝鑾鼻)";
  const EAST_LABEL = "最東端(三貂角)";
  const WEST_LABEL = "最西端(國聖港)";

  // Whether a point is close enough to TAIWAN_OUTLINE to visually read as
  // sitting ON the coastline once drawn, rather than as a dot floating
  // nearby -- used to decide whether a daily-challenge reference point gets
  // framed as a boundary "起點" or an internal "參考點". Tied directly to
  // what actually renders (the marker's own radius) rather than a
  // hand-picked km cutoff, so it can't drift out of sync with the art, and
  // any landmark added to draw-data.js later is classified automatically.
  const MARKER_RADIUS_PX = 7;
  const COASTAL_THRESHOLD_KM = MARKER_RADIUS_PX * KM_PER_PX;

  function distToSegmentKm(p, a, b) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const apx = p.x - a.x;
    const apy = p.y - a.y;
    const lenSq = abx * abx + aby * aby;
    let t = lenSq === 0 ? 0 : (apx * abx + apy * aby) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const dx = p.x - (a.x + t * abx);
    const dy = p.y - (a.y + t * aby);
    return Math.sqrt(dx * dx + dy * dy);
  }

  function distanceToOutlineKm(lon, lat) {
    const p = projectKm(lon, lat);
    let min = Infinity;
    for (let i = 0; i < TAIWAN_OUTLINE.length - 1; i++) {
      const a = projectKm(TAIWAN_OUTLINE[i][0], TAIWAN_OUTLINE[i][1]);
      const b = projectKm(TAIWAN_OUTLINE[i + 1][0], TAIWAN_OUTLINE[i + 1][1]);
      min = Math.min(min, distToSegmentKm(p, a, b));
    }
    return min;
  }

  function isCoastal(lon, lat) {
    return distanceToOutlineKm(lon, lat) <= COASTAL_THRESHOLD_KM;
  }

  // ---- Daily challenge --------------------------------------------------
  // Deterministic per-day variant: either the map is rotated by a fixed
  // angle (north no longer up), or two reference candidates (point
  // landmarks, rivers, mountain ranges) are drawn together in place of the
  // usual single north-point marker. Seeded from today's date in Taipei
  // time, so it's the same for everyone playing "today" and changes every
  // day regardless of the player's own timezone.
  const ROTATION_ANGLES = [30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330];

  // Point-type reference candidates: the 3 non-north extremes, every major
  // city, and every landmark -- each tagged with whether it qualifies as a
  // boundary "起點" (see isCoastal()).
  function buildPointCandidates() {
    const points = [
      { kind: "point", label: SOUTH_LABEL, point: southPoint },
      { kind: "point", label: EAST_LABEL, point: eastPoint },
      { kind: "point", label: WEST_LABEL, point: westPoint },
    ];
    for (const city of TAIWAN_CITIES) {
      points.push({ kind: "point", label: city.name, point: { lon: city.lon, lat: city.lat } });
    }
    for (const landmark of TAIWAN_LANDMARKS) {
      points.push({ kind: "point", label: landmark.name, point: { lon: landmark.lon, lat: landmark.lat } });
    }
    for (const p of points) p.coastal = isCoastal(p.point.lon, p.point.lat);
    return points;
  }

  function buildLineCandidates() {
    const lines = [];
    for (const river of TAIWAN_RIVERS) lines.push({ kind: "river", label: river.name, path: river.path });
    for (const range of TAIWAN_MOUNTAIN_RANGES) lines.push({ kind: "mountain", label: range.name, path: range.path });
    return lines;
  }

  // Two point-type candidates landing too close together would read as one
  // redundant blob rather than two distinct references, so pairs closer
  // than this are skipped when building the pool. Not applied against
  // river/mountain candidates -- a line spanning a big chunk of the island
  // legitimately passes near all sorts of points, that's not "overlap".
  const MIN_PAIR_SPACING_KM = 15;

  function pointDistanceKm(a, b) {
    const pa = projectKm(a.point.lon, a.point.lat);
    const pb = projectKm(b.point.lon, b.point.lat);
    return Math.hypot(pa.x - pb.x, pa.y - pb.y);
  }

  // Every unordered pair of two distinct reference candidates (point,
  // river, or mountain), minus overlapping point-pairs. This is what
  // actually generates most of the pool's size: with ~60 individual
  // candidates, that's on the order of a couple thousand combinations.
  function buildReferencePairs() {
    const candidates = buildPointCandidates().concat(buildLineCandidates());
    const pairs = [];
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const a = candidates[i];
        const b = candidates[j];
        if (a.kind === "point" && b.kind === "point" && pointDistanceKm(a, b) < MIN_PAIR_SPACING_KM) continue;
        pairs.push({ type: "pair", a, b });
      }
    }
    return pairs;
  }

  function buildDailyVariantPool() {
    const rotatePool = ROTATION_ANGLES.map((angle) => ({ type: "rotate", angle }));
    return rotatePool.concat(buildReferencePairs());
  }
  const DAILY_VARIANT_POOL = buildDailyVariantPool();

  // ---- Day -> variant mapping, no repeats until the whole pool is used --
  // A plain hash-mod pick (the original approach) doesn't guarantee variety:
  // with ~1822 entries, by the birthday paradox a repeat becomes likely
  // long before every entry has actually appeared once. Instead, days are
  // grouped into "cycles" of exactly poolSize days; each cycle gets its own
  // shuffled permutation of every pool index (seeded from the cycle
  // number via a small deterministic PRNG, see shared.js), so within one
  // cycle every variant appears exactly once, and the next cycle (poolSize
  // days later, ~5 years at the current size) gets an
  // independently-reshuffled order rather than repeating the same sequence.
  function variantForDayIndex(dayIndex) {
    const poolSize = DAILY_VARIANT_POOL.length;
    const cycle = Math.floor(dayIndex / poolSize);
    const positionInCycle = ((dayIndex % poolSize) + poolSize) % poolSize;
    const order = shuffledIndices(poolSize, cycle);
    return DAILY_VARIANT_POOL[order[positionInCycle]];
  }

  function variantForDateString(dateStr) {
    return variantForDayIndex(dateStringToDayIndex(dateStr));
  }

  const todayVariant = variantForDateString(getTaipeiDateString());

  // Turns a "pair" variant's two raw candidates into what actually gets
  // drawn: a list of point markers (each with a role) and a list of
  // river/mountain overlays. Shared by applyMode() (drawing) and
  // describeVariant() (the challenge-desc text) so the two can never
  // drift out of sync with each other.
  //
  // Role assignment: a candidate that qualifies as a boundary "起點"
  // (coastal) stays "起點" -- UNLESS the other candidate is ALSO coastal,
  // in which case one becomes "中繼點" (waypoint) instead, so the player
  // never sees two markers both claiming to be "the" start. A non-coastal
  // point is always "參考點". River/mountain candidates are never point
  // markers; if BOTH picks are lines, there's no point marker at all that
  // day (same as an old river/mountain-only day had no start marker).
  function resolvePairRoles(variant) {
    const items = [variant.a, variant.b];
    const points = items.filter((it) => it.kind === "point");
    const lines = items.filter((it) => it.kind !== "point");
    const coastalPoints = points.filter((it) => it.coastal);
    const otherPoints = points.filter((it) => !it.coastal);

    const markers = [];
    if (coastalPoints.length === 2) {
      markers.push({ point: coastalPoints[0].point, label: coastalPoints[0].label, style: "起點" });
      markers.push({ point: coastalPoints[1].point, label: coastalPoints[1].label, style: "中繼點" });
    } else {
      for (const p of coastalPoints) markers.push({ point: p.point, label: p.label, style: "起點" });
      for (const p of otherPoints) markers.push({ point: p.point, label: p.label, style: "參考點" });
    }
    return { markers, features: lines };
  }

  // No "今日參考：" prefix here -- the caller (challenge-desc text) already
  // opens with "今日挑戰："/"補玩 M/D：", so a second "今日參考" right after
  // was redundant as well as making the line longer than it needs to be.
  function describeVariant(variant) {
    if (variant.type === "rotate") return `地圖旋轉了 ${variant.angle}°，北方不再朝上`;
    const { markers, features } = resolvePairRoles(variant);
    const parts = markers.map((m) => `${m.style}「${m.label}」`);
    for (const f of features) parts.push(`參考${f.kind === "river" ? "河流" : "山脈"}「${f.label}」`);
    return parts.join("、");
  }

  // Compact one-line summary for a catch-up list row (no role/prefix
  // wording, just enough to recognize the day at a glance).
  function describeVariantShort(variant) {
    if (variant.type === "rotate") return `🔄 旋轉 ${variant.angle}°`;
    const { markers, features } = resolvePairRoles(variant);
    const parts = markers.map((m) => m.label).concat(features.map((f) => f.label));
    return parts.join("・");
  }

  // How many past days the catch-up picker offers. Well under the pool
  // size (so "no repeats" never becomes a visible concern there) and a
  // reasonable amount to scroll through for "I missed a few days".
  const CATCHUP_WINDOW_DAYS = 30;

  // ---- Canvas / DOM setup --------------------------------------------------
  const wrap = document.getElementById("canvas-wrap");
  const bgCanvas = document.getElementById("bg-canvas");
  const drawCanvas = document.getElementById("draw-canvas");
  const resultCanvas = document.getElementById("result-canvas");
  const bgCtx = bgCanvas.getContext("2d");
  const drawCtx = drawCanvas.getContext("2d");
  const resultCtx = resultCanvas.getContext("2d");
  const startHintEl = document.getElementById("start-hint");
  const rotateHintEl = document.getElementById("rotate-hint");

  // Below this viewport width the compact mobile layout (see style.css)
  // sizes the canvas by height, not width -- matches that CSS breakpoint.
  const MOBILE_BREAKPOINT_PX = 640;

  // A landscape-shaped daily-challenge map (after a rotation close to 90°)
  // squeezed into that height budget on a portrait phone ends up quite
  // small; suggesting a rotate to landscape lets it use the full screen
  // width instead. Re-checked on resize/orientationchange so the hint
  // disappears the moment the player actually rotates.
  function updateRotateHint() {
    const isMobileLayout = window.innerWidth <= MOBILE_BREAKPOINT_PX;
    const mapIsLandscape = CANVAS_W > CANVAS_H;
    rotateHintEl.hidden = !(isMobileLayout && mapIsLandscape);
  }
  window.addEventListener("resize", updateRotateHint);
  window.addEventListener("orientationchange", updateRotateHint);

  // Mutable per-mode projection state, recomputed by configureProjection()
  // whenever the rotation changes (normal mode vs. a "rotate" daily variant).
  let CANVAS_W, CANVAS_H, originPxX, originPxY, currentRotationDeg;
  let REAL_PATH;

  function toCanvas(lon, lat) {
    const km = projectKm(lon, lat);
    const rotated = rotateXY({ x: km.x / KM_PER_PX, y: km.y / KM_PER_PX }, currentRotationDeg);
    return { x: originPxX + rotated.x, y: originPxY + rotated.y };
  }

  // `extraPoints` ({lon, lat}[]) are folded into the bounding box alongside
  // the outline -- a no-op for on-island points (already inside), but lets
  // an offshore-island anchor variant (e.g. 蘭嶼, ~68km out) grow the canvas
  // just enough to actually show its marker, instead of it landing off the
  // edge past the normal ~22km padding.
  function configureProjection(rotationDeg, extraPoints) {
    currentRotationDeg = rotationDeg || 0;

    function project(lon, lat) {
      const km = projectKm(lon, lat);
      return rotateXY({ x: km.x / KM_PER_PX, y: km.y / KM_PER_PX }, currentRotationDeg);
    }
    const rotatedPts = TAIWAN_OUTLINE.map(([lon, lat]) => project(lon, lat));
    for (const p of extraPoints || []) rotatedPts.push(project(p.lon, p.lat));

    const minX = Math.min(...rotatedPts.map((p) => p.x));
    const maxX = Math.max(...rotatedPts.map((p) => p.x));
    const minY = Math.min(...rotatedPts.map((p) => p.y));
    const maxY = Math.max(...rotatedPts.map((p) => p.y));

    originPxX = PAD - minX;
    originPxY = PAD - minY;
    CANVAS_W = Math.ceil(maxX - minX + PAD * 2);
    CANVAS_H = Math.ceil(maxY - minY + PAD * 2);

    for (const c of [bgCanvas, drawCanvas, resultCanvas]) {
      c.width = CANVAS_W;
      c.height = CANVAS_H;
    }
    wrap.style.aspectRatio = `${CANVAS_W} / ${CANVAS_H}`;
    wrap.style.setProperty("--map-ratio", CANVAS_W / CANVAS_H);

    REAL_PATH = TAIWAN_OUTLINE.map(([lon, lat]) => toCanvas(lon, lat));
  }

  // Whether to show the southernmost-point marker (a second reference
  // point, on top of the scale bar, to make judging proportions easier).
  // Persisted so the player's preference sticks across visits.
  const SOUTH_MARKER_KEY = "drawTaiwanShowSouthMarker";
  function loadShowSouthMarker() {
    try {
      const raw = localStorage.getItem(SOUTH_MARKER_KEY);
      return raw === null ? true : raw === "1";
    } catch (e) {
      return true;
    }
  }
  function saveShowSouthMarker(value) {
    try {
      localStorage.setItem(SOUTH_MARKER_KEY, value ? "1" : "0");
    } catch (e) {
      /* ignore (private browsing, quota, etc.) */
    }
  }
  let showSouthMarker = loadShowSouthMarker();

  // Today's point markers ({point, label, style}, style one of
  // 起點/中繼點/參考點) and line overlays ({kind, path, label}, kind one of
  // river/mountain) -- 1 point marker (north) in normal mode and on a
  // "rotate" day, 0-2 of each on a "pair" day depending on
  // resolvePairRoles(). Set by applyMode(), drawn by drawBackground().
  let markersToShow = [{ point: northPoint, label: NORTH_LABEL, style: "起點" }];
  let featuresToShow = [];
  let challengeMode = false;

  // Catch-up state: null means "today's challenge"; otherwise a
  // "YYYY-MM-DD" Taipei date string for a past day being replayed.
  let activeChallengeDate = null;
  // The variant actually resolved for what's currently on screen -- today's
  // or activeChallengeDate's -- set by applyMode() and read by
  // drawBackground() so it doesn't have to redo the day->variant lookup
  // (which reshuffles the whole pool) on every redraw.
  let activeVariant = null;

  function resamplePath(pts, spacingPx) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      const count = Math.max(1, Math.round(segLen / spacingPx));
      for (let j = 0; j < count; j++) {
        const t = j / count;
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  function drawRiverLine(path, label) {
    const pts = path.map(([lon, lat]) => toCanvas(lon, lat));
    bgCtx.beginPath();
    bgCtx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const midX = (pts[i].x + pts[i + 1].x) / 2;
      const midY = (pts[i].y + pts[i + 1].y) / 2;
      bgCtx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
    }
    bgCtx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    bgCtx.strokeStyle = "#4fc3f7";
    bgCtx.lineWidth = 4;
    bgCtx.lineCap = "round";
    bgCtx.lineJoin = "round";
    bgCtx.globalAlpha = 0.9;
    bgCtx.stroke();
    bgCtx.globalAlpha = 1;

    const mid = pts[Math.floor(pts.length / 2)];
    drawLabelPill(mid.x, mid.y - 16, label, bgCtx);
  }

  function drawMountainRange(path, label) {
    const pts = path.map(([lon, lat]) => toCanvas(lon, lat));
    const emojiSpacingPx = 26;
    const emojiPts = resamplePath(pts, emojiSpacingPx);
    bgCtx.font = "20px sans-serif";
    bgCtx.textAlign = "center";
    bgCtx.textBaseline = "middle";
    for (const p of emojiPts) bgCtx.fillText("⛰️", p.x, p.y);
    bgCtx.textBaseline = "alphabetic";

    const mid = pts[Math.floor(pts.length / 2)];
    drawLabelPill(mid.x, mid.y - 22, label, bgCtx);
  }

  function drawPointMarker(px, color, label, coastal) {
    bgCtx.beginPath();
    if (coastal) {
      bgCtx.arc(px.x, px.y, 7, 0, Math.PI * 2);
    } else {
      // diamond, so an inland reference point reads as visually distinct
      // from a boundary start point at a glance, not just via the label
      const r = 8;
      bgCtx.moveTo(px.x, px.y - r);
      bgCtx.lineTo(px.x + r, px.y);
      bgCtx.lineTo(px.x, px.y + r);
      bgCtx.lineTo(px.x - r, px.y);
      bgCtx.closePath();
    }
    bgCtx.fillStyle = color;
    bgCtx.fill();
    bgCtx.lineWidth = 2;
    bgCtx.strokeStyle = "#ffffff";
    bgCtx.stroke();

    const nearTop = px.y < 40;
    const labelY = nearTop ? px.y + 30 : px.y - 14;
    const labelX = Math.min(Math.max(px.x, 60), CANVAS_W - 60);

    bgCtx.beginPath();
    bgCtx.moveTo(px.x, px.y + (nearTop ? 7 : -7));
    bgCtx.lineTo(labelX, labelY + (nearTop ? -12 : 4));
    bgCtx.strokeStyle = "rgba(255,255,255,0.8)";
    bgCtx.lineWidth = 1.5;
    bgCtx.stroke();

    bgCtx.fillStyle = "#ffffff";
    bgCtx.font = "bold 13px sans-serif";
    bgCtx.textAlign = "center";
    bgCtx.fillText(label, labelX, labelY);
  }

  function drawBackground() {
    paintOceanBase(bgCtx, CANVAS_W, CANVAS_H);

    // north indicator -- rotated to keep pointing at true north, so it
    // stays honest (and useful) even when the map itself is rotated
    bgCtx.save();
    bgCtx.translate(CANVAS_W - 28, 34);
    bgCtx.rotate((currentRotationDeg * Math.PI) / 180);
    bgCtx.fillStyle = "rgba(255,255,255,0.7)";
    bgCtx.font = "bold 16px sans-serif";
    bgCtx.textAlign = "center";
    bgCtx.fillText("北", 0, -8);
    bgCtx.beginPath();
    bgCtx.moveTo(0, 0);
    bgCtx.lineTo(0, 20);
    bgCtx.moveTo(0, 0);
    bgCtx.lineTo(-5, 8);
    bgCtx.moveTo(0, 0);
    bgCtx.lineTo(5, 8);
    bgCtx.strokeStyle = "rgba(255,255,255,0.7)";
    bgCtx.lineWidth = 2;
    bgCtx.stroke();
    bgCtx.restore();

    // scale bar -- stays screen-aligned regardless of rotation; it's a
    // ruler, not a compass, so its meaning doesn't depend on orientation
    const barLenPx = SCALE_BAR_KM / KM_PER_PX;
    const barX = PAD * 0.6;
    const barY = CANVAS_H - PAD * 0.7;
    bgCtx.strokeStyle = "#ffffff";
    bgCtx.lineWidth = 3;
    bgCtx.beginPath();
    bgCtx.moveTo(barX, barY);
    bgCtx.lineTo(barX + barLenPx, barY);
    bgCtx.moveTo(barX, barY - 6);
    bgCtx.lineTo(barX, barY + 6);
    bgCtx.moveTo(barX + barLenPx, barY - 6);
    bgCtx.lineTo(barX + barLenPx, barY + 6);
    bgCtx.stroke();
    bgCtx.fillStyle = "#ffffff";
    bgCtx.font = "13px sans-serif";
    bgCtx.textAlign = "left";
    bgCtx.fillText(`${SCALE_BAR_KM} 公里`, barX, barY - 12);

    // Point markers for today (north normally; 0-2 on a "pair" challenge
    // day, see resolvePairRoles()). 起點/中繼點 render as a gold/teal
    // circle (they sit on the boundary); 參考點 renders as a gold diamond.
    for (const m of markersToShow) {
      const px = toCanvas(m.point.lon, m.point.lat);
      const color = m.style === "中繼點" ? "#4fd1c5" : "#ffb703";
      const isCircle = m.style !== "參考點";
      drawPointMarker(px, color, `${m.style}：${m.label}`, isCircle);
    }

    // Bonus secondary south marker -- skipped if it would just duplicate
    // one of today's markers (e.g. south IS one of the pair). Its
    // visibility isn't the player's checkbox once in challenge mode: fixed
    // ON for a rotate day (an extra orientation aid on top of the rotated
    // view), fixed OFF for a "pair" day -- south only shows up there when
    // it's actually one of the day's chosen references, drawn above, not
    // as a bonus. Normal mode still respects the player's own toggle.
    const showSouthAsBonus = challengeMode ? activeVariant.type === "rotate" : showSouthMarker;
    const southAlreadyShown = markersToShow.some((m) => m.point === southPoint);
    if (showSouthAsBonus && !southAlreadyShown) {
      drawPointMarker(toCanvas(southPoint.lon, southPoint.lat), "#4fd1c5", SOUTH_LABEL, true);
    }

    // river/mountain overlay(s) for today, if any
    for (const f of featuresToShow) {
      if (f.kind === "river") drawRiverLine(f.path, f.label);
      if (f.kind === "mountain") drawMountainRange(f.path, f.label);
    }
  }

  const southMarkerToggle = document.getElementById("south-marker-toggle");
  const southToggleLabel = document.getElementById("south-toggle-label");
  southMarkerToggle.checked = showSouthMarker;
  southMarkerToggle.addEventListener("change", () => {
    showSouthMarker = southMarkerToggle.checked;
    saveShowSouthMarker(showSouthMarker);
    drawBackground();
  });

  // ---- Drawing interaction --------------------------------------------------
  let strokes = [];
  let currentStroke = null;
  let finished = false;

  function canvasPointFromEvent(evt) {
    const rect = drawCanvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    return {
      x: (evt.clientX - rect.left) * scaleX,
      y: (evt.clientY - rect.top) * scaleY,
    };
  }

  function redrawStrokes() {
    drawCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    drawCtx.strokeStyle = "#ff5252";
    drawCtx.lineWidth = 4;
    drawCtx.lineJoin = "round";
    drawCtx.lineCap = "round";

    let prevPoint = null;
    for (const stroke of strokes) {
      if (stroke.length === 0) continue;
      drawCtx.beginPath();
      if (prevPoint) drawCtx.moveTo(prevPoint.x, prevPoint.y);
      else drawCtx.moveTo(stroke[0].x, stroke[0].y);
      for (const pt of stroke) drawCtx.lineTo(pt.x, pt.y);
      drawCtx.stroke();
      prevPoint = stroke[stroke.length - 1];
    }
  }

  function allPoints() {
    return strokes.flat();
  }

  drawCanvas.addEventListener("pointerdown", (evt) => {
    if (finished) return;
    try {
      drawCanvas.setPointerCapture(evt.pointerId);
    } catch (e) {
      /* ignore */
    }
    currentStroke = [canvasPointFromEvent(evt)];
    strokes.push(currentStroke);
    redrawStrokes();
  });

  drawCanvas.addEventListener("pointermove", (evt) => {
    if (finished || !currentStroke) return;
    currentStroke.push(canvasPointFromEvent(evt));
    redrawStrokes();
  });

  function endStroke(evt) {
    if (!currentStroke) return;
    try {
      drawCanvas.releasePointerCapture(evt.pointerId);
    } catch (e) {
      /* ignore */
    }
    currentStroke = null;
  }

  drawCanvas.addEventListener("pointerup", endStroke);
  drawCanvas.addEventListener("pointercancel", endStroke);

  // ---- Controls ---------------------------------------------------------
  const undoBtn = document.getElementById("undo-btn");
  const clearBtn = document.getElementById("clear-btn");

  undoBtn.addEventListener("click", () => {
    if (finished) return;
    strokes.pop();
    redrawStrokes();
  });

  clearBtn.addEventListener("click", () => {
    if (finished) return;
    strokes = [];
    redrawStrokes();
  });
  const finishBtn = document.getElementById("finish-btn");
  const retryBtn = document.getElementById("retry-btn");
  const resultPanel = document.getElementById("result-panel");
  const scoreGradeEl = document.getElementById("score-grade");
  const scoreNumberEl = document.getElementById("score-number");
  const scoreMessageEl = document.getElementById("score-message");
  const bestScoreLine = document.getElementById("best-score-line");
  const newRecordBadge = document.getElementById("new-record-badge");
  const shapeBar = document.getElementById("shape-bar");
  const shapeScoreValue = document.getElementById("shape-score-value");
  const sizeBar = document.getElementById("size-bar");
  const sizeScoreValue = document.getElementById("size-score-value");
  const positionBar = document.getElementById("position-bar");
  const positionScoreValue = document.getElementById("position-score-value");
  const scoreAnalysisEl = document.getElementById("score-analysis");
  const downloadCardBtn = document.getElementById("download-card-btn");
  const supportsFileShare = typeof navigator.share === "function" && typeof navigator.canShare === "function";
  if (supportsFileShare) {
    downloadCardBtn.textContent = "分享成績卡片";
  }
  const modeNormalBtn = document.getElementById("mode-normal-btn");
  const modeChallengeBtn = document.getElementById("mode-challenge-btn");
  const challengeDescEl = document.getElementById("challenge-desc");
  const challengeToolsEl = document.getElementById("challenge-tools");
  const catchupBtn = document.getElementById("catchup-btn");
  const backToTodayBtn = document.getElementById("back-to-today-btn");
  const catchupPanel = document.getElementById("catchup-panel");
  const catchupListEl = document.getElementById("catchup-list");
  const catchupCloseBtn = document.getElementById("catchup-close-btn");

  let lastResult = null; // {scores, grade, message} for the download-card button

  function updateBestScoreDisplay(records, prefix) {
    if (records.attempts === 0) {
      bestScoreLine.textContent = `${prefix}：尚未挑戰`;
      return;
    }
    bestScoreLine.textContent = `${prefix}：${records.bestScore}% (${records.bestGrade}) ・ 已挑戰 ${records.attempts} 次`;
  }

  // Switches between normal mode and today's daily challenge: reconfigures
  // the projection (rotation or alternate anchor), resets any in-progress
  // drawing (the canvas geometry may have just changed size), and updates
  // every mode-dependent bit of UI.
  function applyMode(isChallenge) {
    challengeMode = isChallenge;
    activeVariant = isChallenge
      ? activeChallengeDate
        ? variantForDateString(activeChallengeDate)
        : todayVariant
      : null;

    if (isChallenge && activeVariant.type === "rotate") {
      configureProjection(activeVariant.angle);
      markersToShow = [{ point: northPoint, label: NORTH_LABEL, style: "起點" }];
      featuresToShow = [];
    } else if (isChallenge) {
      // "pair" day: 0-2 point markers + 0-2 river/mountain overlays,
      // depending on what today's two candidates turned out to be
      const { markers, features } = resolvePairRoles(activeVariant);
      configureProjection(0, markers.map((m) => m.point));
      markersToShow = markers;
      featuresToShow = features;
    } else {
      configureProjection(0);
      markersToShow = [{ point: northPoint, label: NORTH_LABEL, style: "起點" }];
      featuresToShow = [];
    }

    strokes = [];
    currentStroke = null;
    finished = false;
    lastResult = null;
    drawCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    resultCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    resultPanel.hidden = true;
    undoBtn.hidden = false;
    clearBtn.hidden = false;
    finishBtn.hidden = false;
    downloadCardBtn.hidden = true;
    retryBtn.hidden = true;

    modeNormalBtn.classList.toggle("active", !isChallenge);
    modeChallengeBtn.classList.toggle("active", isChallenge);
    challengeDescEl.hidden = !isChallenge;
    if (isChallenge) {
      const dayLabel = activeChallengeDate ? `補玩 ${formatDisplayDate(activeChallengeDate)}` : "今日挑戰";
      challengeDescEl.textContent = `🗓️ ${dayLabel}：${describeVariant(activeVariant)}`;
    }
    // the checkbox no longer does anything in challenge mode (see the
    // showSouthAsBonus logic in drawBackground) -- hide it there instead
    // of leaving a control that looks interactive but silently does nothing
    southToggleLabel.hidden = isChallenge;
    challengeToolsEl.hidden = !isChallenge;
    backToTodayBtn.hidden = !activeChallengeDate;
    catchupPanel.hidden = true; // always close the picker when (re)applying a mode
    // no start-point hint to show on a day with zero point markers (both
    // of today's pair are rivers/mountains) -- their overlay speaks for
    // itself via challengeDescEl
    startHintEl.hidden = markersToShow.length === 0;
    if (markersToShow.length > 0) {
      startHintEl.textContent = "📍 " + markersToShow.map((m) => `${m.style}：${m.label}`).join("・");
    }
    updateRotateHint();

    drawBackground();
    updateBestScoreDisplay(
      loadRecords(isChallenge ? CHALLENGE_RECORDS_KEY : RECORDS_KEY),
      isChallenge ? "🏆 每日挑戰最高" : "🏆 最高紀錄"
    );
  }

  modeNormalBtn.addEventListener("click", () => {
    if (!challengeMode) return;
    applyMode(false);
  });
  modeChallengeBtn.addEventListener("click", () => {
    // already showing today's challenge -- no-op, don't discard a
    // drawing in progress just because the (already-active) tab was
    // clicked again
    if (challengeMode && !activeChallengeDate) return;
    activeChallengeDate = null; // clicking the tab always resets to today
    applyMode(true);
  });

  // ---- Catch-up: replay a past day's challenge ---------------------------
  // Builds the picker list fresh each time it's opened (dates/history don't
  // change while it's closed, but this keeps it trivially in sync with
  // localStorage rather than needing its own invalidation logic).
  function renderCatchupList() {
    const history = loadHistory(CHALLENGE_HISTORY_KEY);
    catchupListEl.innerHTML = "";
    for (const dateStr of pastDateStrings(CATCHUP_WINDOW_DAYS)) {
      const variant = variantForDateString(dateStr);
      const entry = history[dateStr];
      const item = document.createElement("button");
      item.type = "button";
      item.className = "catchup-item" + (entry ? " done" : "");
      const statusText = entry ? `✅ ${entry.score}% (${entry.grade})` : "尚未挑戰";
      item.innerHTML =
        `<span class="catchup-date">${formatDisplayDate(dateStr)}</span>` +
        `<span class="catchup-summary">${describeVariantShort(variant)}</span>` +
        `<span class="catchup-status">${statusText}</span>`;
      item.addEventListener("click", () => {
        activeChallengeDate = dateStr;
        applyMode(true);
      });
      catchupListEl.appendChild(item);
    }
  }

  catchupBtn.addEventListener("click", () => {
    if (catchupPanel.hidden) renderCatchupList();
    catchupPanel.hidden = !catchupPanel.hidden;
  });
  catchupCloseBtn.addEventListener("click", () => {
    catchupPanel.hidden = true;
  });
  backToTodayBtn.addEventListener("click", () => {
    activeChallengeDate = null;
    applyMode(true);
  });

  function rasterize(points) {
    const off = document.createElement("canvas");
    off.width = CANVAS_W;
    off.height = CANVAS_H;
    const ctx = off.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const p of points) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.fill();
    return ctx.getImageData(0, 0, CANVAS_W, CANVAS_H).data;
  }

  // Fills two rasterized masks (alpha channels) and returns their IoU.
  function maskIoU(dataA, dataB) {
    let intersection = 0;
    let union = 0;
    for (let i = 3; i < dataA.length; i += 4) {
      const a = dataA[i] > 0;
      const b = dataB[i] > 0;
      if (a || b) union++;
      if (a && b) intersection++;
    }
    return union === 0 ? 0 : intersection / union;
  }

  // Pixel count + centroid (in canvas px) of a rasterized mask's filled area.
  function maskStats(data) {
    let count = 0;
    let sumX = 0;
    let sumY = 0;
    for (let i = 0, idx = 3; idx < data.length; i++, idx += 4) {
      if (data[idx] > 0) {
        count++;
        sumX += i % CANVAS_W;
        sumY += (i / CANVAS_W) | 0;
      }
    }
    return {
      count,
      centroid: count === 0 ? { x: CANVAS_W / 2, y: CANVAS_H / 2 } : { x: sumX / count, y: sumY / count },
    };
  }

  // Colors used to mark, pixel by pixel, where the two masks agree/disagree.
  const DIFF_COLOR_CORRECT = [46, 204, 113, 150]; // real & player overlap
  const DIFF_COLOR_OVER = [255, 82, 82, 150]; // player only -- drawn but not real ("多畫的地方")
  const DIFF_COLOR_UNDER = [155, 89, 182, 160]; // real only -- missed ("少畫的地方")

  // Builds a per-pixel comparison image: green where both masks agree,
  // red where the player drew outside the real outline, purple where the
  // player missed part of the real outline.
  function buildDiffImage(realData, playerData) {
    const img = new ImageData(CANVAS_W, CANVAS_H);
    const out = img.data;
    for (let idx = 3; idx < realData.length; idx += 4) {
      const real = realData[idx] > 0;
      const player = playerData[idx] > 0;
      let color = null;
      if (real && player) color = DIFF_COLOR_CORRECT;
      else if (player) color = DIFF_COLOR_OVER;
      else if (real) color = DIFF_COLOR_UNDER;
      if (color) {
        out[idx - 3] = color[0];
        out[idx - 2] = color[1];
        out[idx - 1] = color[2];
        out[idx] = color[3];
      }
    }
    return img;
  }

  // Alpha value of a mask at the pixel nearest (x, y); 0 (outside/unfilled)
  // for out-of-bounds coordinates.
  function nearestPixelAlpha(data, x, y) {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= CANVAS_W || py >= CANVAS_H) return 0;
    return data[(py * CANVAS_W + px) * 4 + 3];
  }

  // 8-way compass label for a true-geographic angle (atan2(dy, dx) in
  // degrees, with the map's current rotation already subtracted out), where
  // +x = east and +y = south before any rotation is applied.
  function compassLabel(angleDeg) {
    const dirs = ["東", "東南", "南", "西南", "西", "西北", "北", "東北"];
    const normalized = ((angleDeg % 360) + 360) % 360;
    return dirs[Math.round(normalized / 45) % 8];
  }

  // Turns the raw stats into a few plain-language, slightly playful lines:
  // how far off the size was (in km², relative to a familiar reference
  // area), which direction the drawing drifted, and whether any major city
  // ended up outside the drawn shape ("sank into the sea").
  function buildAnalysis(real, player, playerData) {
    const lines = [];

    // -- size, in real-world km^2 -----------------------------------------
    const diffKm2 = (player.count - real.count) * KM_PER_PX * KM_PER_PX;
    const absDiffKm2 = Math.abs(diffKm2);
    if (absDiffKm2 < 80) {
      lines.push(`📐 面積掌握得很準，只差了約 ${Math.round(absDiffKm2)} 平方公里！`);
    } else {
      let best = REFERENCE_AREAS[0];
      let bestScore = Infinity;
      for (const ref of REFERENCE_AREAS) {
        const s = Math.abs(Math.log(absDiffKm2 / ref.area));
        if (s < bestScore) {
          bestScore = s;
          best = ref;
        }
      }
      const times = (absDiffKm2 / best.area).toFixed(1);
      const verb = diffKm2 > 0 ? "大了" : "小了";
      lines.push(
        `📐 你畫的台灣比實際${verb}約 ${Math.round(absDiffKm2).toLocaleString()} 平方公里，相當於 ${times} 個${best.name}的面積`
      );
    }

    // -- position drift, as a true compass direction + distance -----------
    // (subtract the map's own rotation so this reports real-world direction,
    // not just "which way on screen", which would be misleading once rotated)
    const dx = player.centroid.x - real.centroid.x;
    const dy = player.centroid.y - real.centroid.y;
    const offsetKm = Math.sqrt(dx * dx + dy * dy) * KM_PER_PX;
    if (offsetKm < 5) {
      lines.push("🧭 位置幾乎完全正確！");
    } else {
      const screenAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
      const trueAngle = screenAngle - currentRotationDeg;
      lines.push(`🧭 你畫的台灣整體偏向${compassLabel(trueAngle)}方，大約偏移了 ${Math.round(offsetKm)} 公里`);
    }

    // -- did any major city end up outside the drawn shape? ---------------
    const sunk = TAIWAN_CITIES.filter((city) => {
      const p = toCanvas(city.lon, city.lat);
      return nearestPixelAlpha(playerData, p.x, p.y) === 0;
    });
    if (sunk.length === 0) {
      lines.push("🏙️ 所有主要城市都平安上岸，沒有人被你畫掉！");
    } else if (sunk.length <= 2) {
      lines.push(`🌊 慘了，${sunk.map((c) => c.name).join("、")}好像沉進海裡了！`);
    } else {
      lines.push(`🌊 有 ${sunk.length} 個主要城市消失在海裡，你的台灣是不是縮水太多了？`);
    }

    return lines;
  }

  // Breaks accuracy into three diagnostic sub-scores, plus the overall IoU
  // (used for the headline score/grade, unchanged from before):
  //  - shape:    IoU after re-centering + re-scaling the player's drawing to
  //              match the real outline's centroid/size, isolating pure
  //              silhouette accuracy from size/position error
  //  - size:     ratio of filled area (smaller/larger), independent of shape/position
  //  - position: how close the two centroids are, normalized to the real
  //              shape's own scale so it works at any zoom level
  function computeScores(playerPoints) {
    const realData = rasterize(REAL_PATH);
    const playerData = rasterize(playerPoints);
    const real = maskStats(realData);
    const player = maskStats(playerData);

    const overall = maskIoU(realData, playerData);

    const sizeScore = player.count === 0 || real.count === 0
      ? 0
      : Math.min(player.count, real.count) / Math.max(player.count, real.count);

    const dx = player.centroid.x - real.centroid.x;
    const dy = player.centroid.y - real.centroid.y;
    const offsetPx = Math.sqrt(dx * dx + dy * dy);
    const scaleRef = Math.sqrt(real.count);
    const positionScore = scaleRef === 0 ? 0 : Math.max(0, 1 - offsetPx / scaleRef);

    let shapeScore = 0;
    if (player.count > 0) {
      const scaleFactor = Math.sqrt(real.count / player.count);
      const aligned = playerPoints.map((p) => ({
        x: real.centroid.x + (p.x - player.centroid.x) * scaleFactor,
        y: real.centroid.y + (p.y - player.centroid.y) * scaleFactor,
      }));
      shapeScore = maskIoU(realData, rasterize(aligned));
    }

    return {
      overall: Math.round(overall * 100),
      shape: Math.round(shapeScore * 100),
      size: Math.round(sizeScore * 100),
      position: Math.round(positionScore * 100),
      diffImage: buildDiffImage(realData, playerData),
      analysis: buildAnalysis(real, player, playerData),
    };
  }

  // Several lines per grade so replaying doesn't show the same message
  // every time you land in the same bracket.
  const GRADE_MESSAGES = {
    S: [
      "太神啦！根本活地圖！",
      "地理老師都要跟你請教了！",
      "這根本是空拍圖等級的精準度！",
      "衛星都要重新校正了吧！",
      "台灣地理小博士，實至名歸！",
      "這雙手是不是裝了 GPS？",
      "精準到內政部想挖角你去畫地圖了",
    ],
    A: [
      "非常接近，地理小達人！",
      "只差臨門一腳就是滿分了！",
      "肉眼幾乎看不出差別，超讚！",
      "這實力可以去畫地圖冊了",
      "細節再抓一下就完美了！",
      "老師會給你貼星星貼紙的等級",
    ],
    B: [
      "抓到大致輪廓了，繼續練習！",
      "有模有樣，但細節還要加油！",
      "台灣的骨架抓對了，肉要再補一下",
      "方向感不錯，比例再練練！",
      "看得出用心，再多畫幾次會更準",
      "半成品的台灣，繼續努力",
    ],
    C: [
      "有台灣的影子，但還差一點",
      "嗯…有點抽象藝術的感覺",
      "地理課本可能要哭了",
      "這個形狀…是台灣的親戚嗎？",
      "感覺得出你有嘗試，但方向要再調整",
      "半個台灣不見了，發生什麼事？",
    ],
    D: [
      "嗯...這是哪裡？再試一次吧！",
      "這比較像抽象畫，不是地圖",
      "台灣表示：這不是我，不是我",
      "建議先偷瞄一眼地圖再挑戰一次",
      "這外星地形挺有創意的",
      "重新來過，你可以的！",
    ],
  };

  function setBar(barEl, valueEl, pct) {
    barEl.style.width = `${pct}%`;
    valueEl.textContent = `${pct}%`;
  }

  // wrapText/triggerFileDownload/shareOrDownloadCard now live in
  // ../shared.js (also used by the placename challenge's own score card).

  // Composites a shareable "score card" PNG: title, grade/score/message,
  // the map (ocean + diff overlay, straight from the game canvases), the
  // three sub-scores, and one highlight analysis line.
  function buildScoreCard(scores, grade, message) {
    const margin = 28;
    const cardW = CANVAS_W + margin * 2;
    const contentW = cardW - margin * 2;
    const approxCardH = CANVAS_H + 300;
    const scratchH = CANVAS_H + 500;

    const scratch = document.createElement("canvas");
    scratch.width = cardW;
    scratch.height = scratchH;
    const ctx = scratch.getContext("2d");

    const grad = ctx.createLinearGradient(0, 0, 0, approxCardH);
    grad.addColorStop(0, "#0b3d5c");
    grad.addColorStop(1, "#06263b");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cardW, scratchH);

    ctx.textAlign = "center";
    let y = margin;

    ctx.fillStyle = "rgba(234,246,255,0.85)";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText(challengeMode ? "🇹🇼 畫出台灣・每日挑戰" : "🇹🇼 畫出台灣", cardW / 2, y + 18);
    y += 34;

    ctx.fillStyle = "#ffb703";
    ctx.font = "800 60px sans-serif";
    ctx.fillText(grade, cardW / 2, y + 50);
    y += 68;

    ctx.fillStyle = "#eaf6ff";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText(`準確度 ${scores.overall}%`, cardW / 2, y + 20);
    y += 34;

    ctx.fillStyle = "rgba(234,246,255,0.85)";
    ctx.font = "15px sans-serif";
    y += wrapText(ctx, message, cardW / 2, y + 16, contentW - 20, 20);
    y += 16;

    ctx.drawImage(bgCanvas, margin, y, CANVAS_W, CANVAS_H);
    ctx.drawImage(resultCanvas, margin, y, CANVAS_W, CANVAS_H);
    y += CANVAS_H + 20;

    ctx.fillStyle = "#eaf6ff";
    ctx.font = "bold 14px sans-serif";
    const statLabels = [`形狀 ${scores.shape}%`, `大小 ${scores.size}%`, `位置 ${scores.position}%`];
    const statGap = contentW / 3;
    statLabels.forEach((label, i) => {
      ctx.fillText(label, margin + statGap * i + statGap / 2, y + 16);
    });
    y += 40;

    const highlight = scores.analysis[scores.analysis.length - 1];
    ctx.fillStyle = "rgba(234,246,255,0.85)";
    ctx.font = "14px sans-serif";
    y += wrapText(ctx, highlight, cardW / 2, y + 16, contentW - 20, 18);
    y += 20;

    ctx.fillStyle = "rgba(234,246,255,0.55)";
    ctx.font = "12px sans-serif";
    ctx.fillText("attsa222023.github.io/draw-TW", cardW / 2, y + 12);
    y += 30;

    const finalCard = document.createElement("canvas");
    finalCard.width = cardW;
    finalCard.height = Math.ceil(y);
    finalCard.getContext("2d").drawImage(scratch, 0, 0);
    return finalCard;
  }

  // Builds the card image and hands it to ../shared.js's shareOrDownloadCard
  // (native share sheet where file sharing is supported, plain download
  // otherwise).
  function shareOrDownloadScoreCard(scores, grade, message) {
    const card = buildScoreCard(scores, grade, message);
    const filename = `draw-taiwan-${scores.overall}pct.png`;
    const shareText = challengeMode
      ? `我在「每日挑戰」畫台灣拿到 ${scores.overall}% 準確度，你要不要也來試試？`
      : `我畫台灣拿到 ${scores.overall}% 準確度，你要不要也來試試？`;
    shareOrDownloadCard(card, filename, "畫出台灣", shareText);
  }

  function renderResult(playerPoints, scores, grade, message, isNewBest) {
    resultCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    resultCtx.putImageData(scores.diffImage, 0, 0);

    function strokePath(points, color) {
      resultCtx.beginPath();
      resultCtx.moveTo(points[0].x, points[0].y);
      for (const p of points) resultCtx.lineTo(p.x, p.y);
      resultCtx.closePath();
      resultCtx.lineWidth = 2;
      resultCtx.strokeStyle = color;
      resultCtx.stroke();
    }

    strokePath(REAL_PATH, "rgba(46, 204, 113, 0.9)");
    strokePath(playerPoints, "rgba(255, 82, 82, 0.9)");

    newRecordBadge.hidden = !isNewBest;
    scoreGradeEl.textContent = grade;
    scoreNumberEl.textContent = `準確度 ${scores.overall}%`;
    scoreMessageEl.textContent = message;
    setBar(shapeBar, shapeScoreValue, scores.shape);
    setBar(sizeBar, sizeScoreValue, scores.size);
    setBar(positionBar, positionScoreValue, scores.position);

    scoreAnalysisEl.innerHTML = "";
    for (const line of scores.analysis) {
      const div = document.createElement("div");
      div.className = "analysis-line";
      div.textContent = line;
      scoreAnalysisEl.appendChild(div);
    }

    resultPanel.hidden = false;
  }

  finishBtn.addEventListener("click", () => {
    if (finished) return;
    const points = allPoints();
    if (points.length < 10) {
      alert("請先畫出台灣本島的輪廓，再按完成！");
      return;
    }
    finished = true;
    drawCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    const scores = computeScores(points);
    const [grade, message] = gradeFor(scores.overall, GRADE_MESSAGES);
    const recordsKey = challengeMode ? CHALLENGE_RECORDS_KEY : RECORDS_KEY;
    const { records, isNewBest } = recordAttempt(recordsKey, scores.overall, grade);
    updateBestScoreDisplay(records, challengeMode ? "🏆 每日挑戰最高" : "🏆 最高紀錄");
    if (challengeMode) {
      // Recorded under the challenge's own date (today's, or the day being
      // caught up on) so the catch-up picker can show it as done.
      const targetDate = activeChallengeDate || getTaipeiDateString();
      recordHistoryEntry(CHALLENGE_HISTORY_KEY, targetDate, scores.overall, grade);
    }
    renderResult(points, scores, grade, message, isNewBest);
    lastResult = { scores, grade, message };

    undoBtn.hidden = true;
    clearBtn.hidden = true;
    finishBtn.hidden = true;
    downloadCardBtn.hidden = false;
    retryBtn.hidden = false;

    // On mobile the result panel sits below the height-constrained canvas
    // and isn't obviously visible; scroll it into view (after layout has
    // picked up `hidden` being cleared) instead of leaving the player to
    // discover they need to scroll.
    requestAnimationFrame(() => {
      resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  downloadCardBtn.addEventListener("click", () => {
    if (!lastResult) return;
    shareOrDownloadScoreCard(lastResult.scores, lastResult.grade, lastResult.message);
  });

  retryBtn.addEventListener("click", () => {
    strokes = [];
    currentStroke = null;
    finished = false;
    lastResult = null;
    drawCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    resultCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    resultPanel.hidden = true;

    undoBtn.hidden = false;
    clearBtn.hidden = false;
    finishBtn.hidden = false;
    downloadCardBtn.hidden = true;
    retryBtn.hidden = true;

    wrap.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  applyMode(false);
})();
