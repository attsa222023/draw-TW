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
  const shapeBar = document.getElementById("shape-bar");
  const shapeScoreValue = document.getElementById("shape-score-value");
  const sizeBar = document.getElementById("size-bar");
  const sizeScoreValue = document.getElementById("size-score-value");
  const positionBar = document.getElementById("position-bar");
  const positionScoreValue = document.getElementById("position-score-value");
  const scoreAnalysisEl = document.getElementById("score-analysis");

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

  // 8-way compass label for a screen-space angle (atan2(dy, dx) in degrees),
  // where +x = east and +y = south (matches this game's projection).
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

    // -- position drift, as a compass direction + distance ----------------
    const dx = player.centroid.x - real.centroid.x;
    const dy = player.centroid.y - real.centroid.y;
    const offsetKm = Math.sqrt(dx * dx + dy * dy) * KM_PER_PX;
    if (offsetKm < 5) {
      lines.push("🧭 位置幾乎完全正確！");
    } else {
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      lines.push(`🧭 你畫的台灣整體偏向${compassLabel(angle)}方，大約偏移了 ${Math.round(offsetKm)} 公里`);
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
    const { records, isNewBest } = recordAttempt(scores.overall, grade);
    updateBestScoreDisplay(records);
    renderResult(points, scores, grade, message, isNewBest);

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
