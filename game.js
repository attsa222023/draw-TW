(() => {
  "use strict";

  // ---- Projection setup ---------------------------------------------------
  // Equirectangular projection with longitude scaled by cos(latitude) so
  // shapes aren't east-west stretched. Always anchored (for the underlying
  // km math) at true north -- rotation for daily-challenge mode is applied
  // afterward, in pixel space, so it never has to touch this part.
  const KM_PER_LAT = 110.574;
  const KM_PER_PX = 0.45; // world scale: 1 canvas pixel = 0.45 km
  const PAD = 50; // canvas padding around the shape, in pixels
  const SCALE_BAR_KM = 50;

  function extremePoint(compare) {
    let best = TAIWAN_OUTLINE[0];
    for (const p of TAIWAN_OUTLINE) if (compare(p, best)) best = p;
    return { lon: best[0], lat: best[1] };
  }
  const northPoint = extremePoint((p, best) => p[1] > best[1]);
  const southPoint = extremePoint((p, best) => p[1] < best[1]);
  const eastPoint = extremePoint((p, best) => p[0] > best[0]);
  const westPoint = extremePoint((p, best) => p[0] < best[0]);

  let latSum = 0;
  for (const p of TAIWAN_OUTLINE) latSum += p[1];
  const REF_LAT = latSum / TAIWAN_OUTLINE.length;
  const KM_PER_LON = 111.32 * Math.cos((REF_LAT * Math.PI) / 180);

  function projectKm(lon, lat) {
    return {
      x: (lon - northPoint.lon) * KM_PER_LON,
      y: (northPoint.lat - lat) * KM_PER_LAT, // south is positive (down on screen)
    };
  }

  function rotateXY(pt, angleDeg) {
    if (!angleDeg) return pt;
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return { x: pt.x * cos - pt.y * sin, y: pt.x * sin + pt.y * cos };
  }

  // ---- Daily challenge --------------------------------------------------
  // Deterministic per-day variant: either the map is rotated by a fixed
  // angle (north no longer up), or the labeled reference point is swapped
  // from the northernmost tip to the south/east/west extreme or a city.
  // Seeded from today's date in Taipei time, so it's the same for everyone
  // playing "today" and changes every day regardless of the player's own
  // timezone.
  function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    return h >>> 0;
  }

  function getTaipeiDateString() {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Taipei",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
    } catch (e) {
      return new Date().toISOString().slice(0, 10); // fallback: UTC date
    }
  }

  const ROTATION_ANGLES = [30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330];

  function buildDailyVariantPool() {
    const pool = ROTATION_ANGLES.map((angle) => ({ type: "rotate", angle }));
    // north/south/east/west are always exactly on the outline (they're its
    // extreme points), so always eligible as a boundary "起點"
    const anchorPoints = [
      { label: "最南端", point: southPoint, coastal: true },
      { label: "最東端", point: eastPoint, coastal: true },
      { label: "最西端", point: westPoint, coastal: true },
    ];
    for (const city of TAIWAN_CITIES) {
      anchorPoints.push({ label: city.name, point: { lon: city.lon, lat: city.lat }, coastal: city.coastal });
    }
    for (const a of anchorPoints) pool.push({ type: "anchor", label: a.label, point: a.point, coastal: a.coastal });
    return pool;
  }
  const DAILY_VARIANT_POOL = buildDailyVariantPool();
  const todayVariant = DAILY_VARIANT_POOL[hashString(getTaipeiDateString()) % DAILY_VARIANT_POOL.length];

  function describeTodayVariant() {
    if (todayVariant.type === "rotate") return `地圖旋轉了 ${todayVariant.angle}°，北方不再朝上`;
    return todayVariant.coastal
      ? `起點換成「${todayVariant.label}」，不是最北端`
      : `標示「${todayVariant.label}」在島內的參考位置，不是起點`;
  }

  // ---- Canvas / DOM setup --------------------------------------------------
  const wrap = document.getElementById("canvas-wrap");
  const bgCanvas = document.getElementById("bg-canvas");
  const drawCanvas = document.getElementById("draw-canvas");
  const resultCanvas = document.getElementById("result-canvas");
  const bgCtx = bgCanvas.getContext("2d");
  const drawCtx = drawCanvas.getContext("2d");
  const resultCtx = resultCanvas.getContext("2d");
  const startHintEl = document.getElementById("start-hint");

  // Mutable per-mode projection state, recomputed by configureProjection()
  // whenever the rotation changes (normal mode vs. a "rotate" daily variant).
  let CANVAS_W, CANVAS_H, originPxX, originPxY, currentRotationDeg;
  let REAL_PATH;

  function toCanvas(lon, lat) {
    const km = projectKm(lon, lat);
    const rotated = rotateXY({ x: km.x / KM_PER_PX, y: km.y / KM_PER_PX }, currentRotationDeg);
    return { x: originPxX + rotated.x, y: originPxY + rotated.y };
  }

  function configureProjection(rotationDeg) {
    currentRotationDeg = rotationDeg || 0;

    const rotatedPts = TAIWAN_OUTLINE.map(([lon, lat]) => {
      const km = projectKm(lon, lat);
      return rotateXY({ x: km.x / KM_PER_PX, y: km.y / KM_PER_PX }, currentRotationDeg);
    });
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

  // Today's primary reference point/label -- the true north tip in normal
  // mode and on "rotate" challenge days, or the daily alternate point on
  // "anchor" challenge days. `coastal: true` points sit on (or very near)
  // the actual outline and are framed as "起點" (a boundary start point);
  // inland cities are framed as "參考點" (an internal reference point)
  // instead, since labeling e.g. Taipei -- ~17km from the coast -- as a
  // start point would look wrong sitting in the middle of the shape. Set
  // by applyMode().
  let primaryMarker = { label: "最北端", point: northPoint, coastal: true };
  let challengeMode = false;

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
    bgCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    const grad = bgCtx.createLinearGradient(0, 0, 0, CANVAS_H);
    grad.addColorStop(0, "#1c5d82");
    grad.addColorStop(1, "#0b3d5c");
    bgCtx.fillStyle = grad;
    bgCtx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // subtle wave texture
    bgCtx.strokeStyle = "rgba(255,255,255,0.06)";
    bgCtx.lineWidth = 2;
    for (let y = 20; y < CANVAS_H; y += 34) {
      bgCtx.beginPath();
      for (let x = 0; x <= CANVAS_W; x += 10) {
        const wy = y + Math.sin((x + y) * 0.05) * 4;
        if (x === 0) bgCtx.moveTo(x, wy);
        else bgCtx.lineTo(x, wy);
      }
      bgCtx.stroke();
    }

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

    // primary reference-point marker (north normally, or today's variant)
    const primaryPx = toCanvas(primaryMarker.point.lon, primaryMarker.point.lat);
    const primaryRole = primaryMarker.coastal ? "起點" : "參考點";
    drawPointMarker(primaryPx, "#ffb703", `${primaryRole}：${primaryMarker.label}`, primaryMarker.coastal);

    // optional secondary south marker -- skipped if it would just
    // duplicate the primary marker (i.e. today's variant IS south)
    if (showSouthMarker && primaryMarker.point !== southPoint) {
      drawPointMarker(toCanvas(southPoint.lon, southPoint.lat), "#4fd1c5", "最南端", true);
    }
  }

  const southMarkerToggle = document.getElementById("south-marker-toggle");
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

  let lastResult = null; // {scores, grade, message} for the download-card button

  function updateBestScoreDisplay(records, isChallenge) {
    const prefix = isChallenge ? "🏆 每日挑戰最高" : "🏆 最高紀錄";
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

    if (isChallenge && todayVariant.type === "rotate") {
      configureProjection(todayVariant.angle);
      primaryMarker = { label: "最北端", point: northPoint, coastal: true };
    } else if (isChallenge) {
      configureProjection(0);
      primaryMarker = { label: todayVariant.label, point: todayVariant.point, coastal: todayVariant.coastal };
    } else {
      configureProjection(0);
      primaryMarker = { label: "最北端", point: northPoint, coastal: true };
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
    if (isChallenge) challengeDescEl.textContent = `🗓️ 今日挑戰：${describeTodayVariant()}`;
    startHintEl.textContent = `📍 ${primaryMarker.coastal ? "起點" : "參考點"}：${primaryMarker.label}`;

    drawBackground();
    updateBestScoreDisplay(loadRecords(isChallenge ? CHALLENGE_RECORDS_KEY : RECORDS_KEY), isChallenge);
  }

  modeNormalBtn.addEventListener("click", () => {
    if (!challengeMode) return;
    applyMode(false);
  });
  modeChallengeBtn.addEventListener("click", () => {
    if (challengeMode) return;
    applyMode(true);
  });

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

  function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function gradeFor(scorePct) {
    let grade;
    if (scorePct >= 90) grade = "S";
    else if (scorePct >= 75) grade = "A";
    else if (scorePct >= 55) grade = "B";
    else if (scorePct >= 35) grade = "C";
    else grade = "D";
    return [grade, pickRandom(GRADE_MESSAGES[grade])];
  }

  function setBar(barEl, valueEl, pct) {
    barEl.style.width = `${pct}%`;
    valueEl.textContent = `${pct}%`;
  }

  // Draws `text` centered at `centerX`, wrapping character-by-character
  // (fine for CJK, which has no word-boundary spaces) to fit `maxWidth`.
  // Returns the total height consumed so callers can advance their cursor.
  function wrapText(ctx, text, centerX, startY, maxWidth, lineHeight) {
    let line = "";
    const lines = [];
    for (const ch of text) {
      const test = line + ch;
      if (line !== "" && ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    lines.forEach((l, i) => ctx.fillText(l, centerX, startY + i * lineHeight));
    return lines.length * lineHeight;
  }

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

  function triggerFileDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // On phones, a plain <a download> saves to the Files/Downloads app, not
  // Photos -- and there's no direct way to hand it to another app. Where
  // the Web Share API supports sharing files (iOS Safari, Android Chrome),
  // use the native share sheet instead, so "save to Photos" / "send via
  // LINE" etc. are one tap away. Falls back to a normal download wherever
  // file sharing isn't available (most desktop browsers).
  function shareOrDownloadScoreCard(scores, grade, message) {
    const card = buildScoreCard(scores, grade, message);
    const filename = `draw-taiwan-${scores.overall}pct.png`;

    card.toBlob((blob) => {
      if (!blob) return;

      const file = new File([blob], filename, { type: "image/png" });
      const canShareFile =
        typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });

      if (canShareFile) {
        const shareText = challengeMode
          ? `我在「每日挑戰」畫台灣拿到 ${scores.overall}% 準確度，你要不要也來試試？`
          : `我畫台灣拿到 ${scores.overall}% 準確度，你要不要也來試試？`;
        navigator
          .share({ files: [file], title: "畫出台灣", text: shareText })
          .catch((err) => {
            if (err && err.name === "AbortError") return; // player cancelled the share sheet
            triggerFileDownload(blob, filename); // share failed for some other reason -- fall back
          });
        return;
      }

      triggerFileDownload(blob, filename);
    }, "image/png");
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
    const [grade, message] = gradeFor(scores.overall);
    const recordsKey = challengeMode ? CHALLENGE_RECORDS_KEY : RECORDS_KEY;
    const { records, isNewBest } = recordAttempt(recordsKey, scores.overall, grade);
    updateBestScoreDisplay(records, challengeMode);
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
