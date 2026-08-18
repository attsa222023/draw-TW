(() => {
  "use strict";

  // ---- Projection setup ---------------------------------------------------
  // Equirectangular projection anchored at Taiwan's northernmost point, with
  // longitude scaled by cos(latitude) so shapes aren't east-west stretched.
  const KM_PER_LAT = 110.574;
  const KM_PER_PX = 0.45; // world scale: 1 canvas pixel = 0.45 km
  const PAD = 50; // canvas padding around the shape, in pixels
  const SCALE_BAR_KM = 50;

  let anchor = TAIWAN_OUTLINE[0];
  for (const p of TAIWAN_OUTLINE) if (p[1] > anchor[1]) anchor = p;
  anchor = { lon: anchor[0], lat: anchor[1] };

  let latSum = 0;
  for (const p of TAIWAN_OUTLINE) latSum += p[1];
  const REF_LAT = latSum / TAIWAN_OUTLINE.length;
  const KM_PER_LON = 111.32 * Math.cos((REF_LAT * Math.PI) / 180);

  function projectKm(lon, lat) {
    return {
      x: (lon - anchor.lon) * KM_PER_LON,
      y: (anchor.lat - lat) * KM_PER_LAT, // south is positive (down on screen)
    };
  }

  const kmPoints = TAIWAN_OUTLINE.map(([lon, lat]) => projectKm(lon, lat));
  const minXKm = Math.min(...kmPoints.map((p) => p.x));
  const maxXKm = Math.max(...kmPoints.map((p) => p.x));
  const minYKm = Math.min(...kmPoints.map((p) => p.y));
  const maxYKm = Math.max(...kmPoints.map((p) => p.y));

  const originPxX = PAD - minXKm / KM_PER_PX;
  const originPxY = PAD - minYKm / KM_PER_PX;
  const CANVAS_W = Math.ceil((maxXKm - minXKm) / KM_PER_PX + PAD * 2);
  const CANVAS_H = Math.ceil((maxYKm - minYKm) / KM_PER_PX + PAD * 2);

  function toCanvas(lon, lat) {
    const km = projectKm(lon, lat);
    return {
      x: originPxX + km.x / KM_PER_PX,
      y: originPxY + km.y / KM_PER_PX,
    };
  }

  const REAL_PATH = TAIWAN_OUTLINE.map(([lon, lat]) => toCanvas(lon, lat));
  const ANCHOR_PX = toCanvas(anchor.lon, anchor.lat);

  // ---- Canvas / DOM setup --------------------------------------------------
  const wrap = document.getElementById("canvas-wrap");
  const bgCanvas = document.getElementById("bg-canvas");
  const drawCanvas = document.getElementById("draw-canvas");
  const resultCanvas = document.getElementById("result-canvas");

  for (const c of [bgCanvas, drawCanvas, resultCanvas]) {
    c.width = CANVAS_W;
    c.height = CANVAS_H;
  }
  wrap.style.aspectRatio = `${CANVAS_W} / ${CANVAS_H}`;

  const bgCtx = bgCanvas.getContext("2d");
  const drawCtx = drawCanvas.getContext("2d");
  const resultCtx = resultCanvas.getContext("2d");

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

    // north indicator
    bgCtx.fillStyle = "rgba(255,255,255,0.7)";
    bgCtx.font = "bold 16px sans-serif";
    bgCtx.textAlign = "center";
    bgCtx.fillText("北", CANVAS_W - 28, 26);
    bgCtx.beginPath();
    bgCtx.moveTo(CANVAS_W - 28, 34);
    bgCtx.lineTo(CANVAS_W - 28, 54);
    bgCtx.moveTo(CANVAS_W - 28, 34);
    bgCtx.lineTo(CANVAS_W - 33, 42);
    bgCtx.moveTo(CANVAS_W - 28, 34);
    bgCtx.lineTo(CANVAS_W - 23, 42);
    bgCtx.strokeStyle = "rgba(255,255,255,0.7)";
    bgCtx.lineWidth = 2;
    bgCtx.stroke();

    // scale bar
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

    // start point marker
    bgCtx.beginPath();
    bgCtx.arc(ANCHOR_PX.x, ANCHOR_PX.y, 7, 0, Math.PI * 2);
    bgCtx.fillStyle = "#ffb703";
    bgCtx.fill();
    bgCtx.lineWidth = 2;
    bgCtx.strokeStyle = "#ffffff";
    bgCtx.stroke();

    const labelBelow = ANCHOR_PX.y < 40;
    const labelY = labelBelow ? ANCHOR_PX.y + 30 : ANCHOR_PX.y - 14;
    bgCtx.beginPath();
    bgCtx.moveTo(ANCHOR_PX.x, ANCHOR_PX.y + (labelBelow ? 7 : -7));
    bgCtx.lineTo(ANCHOR_PX.x, labelY + (labelBelow ? -12 : 4));
    bgCtx.strokeStyle = "rgba(255,255,255,0.8)";
    bgCtx.lineWidth = 1.5;
    bgCtx.stroke();

    bgCtx.fillStyle = "#ffffff";
    bgCtx.font = "bold 13px sans-serif";
    bgCtx.textAlign = "center";
    bgCtx.fillText("起點：最北端", ANCHOR_PX.x, labelY);
  }

  drawBackground();

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

  function updateBestScoreDisplay(records) {
    if (records.attempts === 0) {
      bestScoreLine.textContent = "🏆 最高紀錄：尚未挑戰";
      return;
    }
    bestScoreLine.textContent = `🏆 最高紀錄：${records.bestScore}% (${records.bestGrade}) ・ 已挑戰 ${records.attempts} 次`;
  }

  updateBestScoreDisplay(loadRecords());

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

  function computeIoU(playerPoints) {
    const realData = rasterize(REAL_PATH);
    const playerData = rasterize(playerPoints);
    let intersection = 0;
    let union = 0;
    for (let i = 3; i < realData.length; i += 4) {
      const real = realData[i] > 0;
      const player = playerData[i] > 0;
      if (real || player) union++;
      if (real && player) intersection++;
    }
    return union === 0 ? 0 : intersection / union;
  }

  function gradeFor(scorePct) {
    if (scorePct >= 90) return ["S", "太神啦！根本活地圖！"];
    if (scorePct >= 75) return ["A", "非常接近，地理小達人！"];
    if (scorePct >= 55) return ["B", "抓到大致輪廓了，繼續練習！"];
    if (scorePct >= 35) return ["C", "有台灣的影子，但還差一點"];
    return ["D", "嗯...這是哪裡？再試一次吧！"];
  }

  function renderResult(playerPoints, scorePct, grade, message, isNewBest) {
    resultCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    function fillPath(points, color) {
      resultCtx.beginPath();
      resultCtx.moveTo(points[0].x, points[0].y);
      for (const p of points) resultCtx.lineTo(p.x, p.y);
      resultCtx.closePath();
      resultCtx.fillStyle = color;
      resultCtx.fill();
      resultCtx.lineWidth = 2;
      resultCtx.strokeStyle = color.replace(/[\d.]+\)$/, "0.9)");
      resultCtx.stroke();
    }

    fillPath(REAL_PATH, "rgba(46, 204, 113, 0.45)");
    fillPath(playerPoints, "rgba(255, 82, 82, 0.45)");

    newRecordBadge.hidden = !isNewBest;
    scoreGradeEl.textContent = grade;
    scoreNumberEl.textContent = `準確度 ${scorePct}%`;
    scoreMessageEl.textContent = message;
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

    const iou = computeIoU(points);
    const scorePct = Math.round(iou * 100);
    const [grade, message] = gradeFor(scorePct);
    const { records, isNewBest } = recordAttempt(scorePct, grade);
    updateBestScoreDisplay(records);
    renderResult(points, scorePct, grade, message, isNewBest);

    undoBtn.hidden = true;
    clearBtn.hidden = true;
    finishBtn.hidden = true;
    retryBtn.hidden = false;
  });

  retryBtn.addEventListener("click", () => {
    strokes = [];
    currentStroke = null;
    finished = false;
    drawCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    resultCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    resultPanel.hidden = true;

    undoBtn.hidden = false;
    clearBtn.hidden = false;
    finishBtn.hidden = false;
    retryBtn.hidden = true;
  });
})();
