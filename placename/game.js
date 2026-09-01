(() => {
  "use strict";

  // Shared projection constants/functions (KM_PER_LAT, KM_PER_PX, PAD,
  // northPoint, projectKm, rotateXY), date/shuffle utilities
  // (getTaipeiDateString, mulberry32, shuffledIndices, dateStringToDayIndex,
  // dayIndexToDateString, pastDateStrings, formatDisplayDate), and canvas
  // helpers (roundRectPath, drawLabelPill, paintOceanBase, pickRandom,
  // gradeFor) all come from ../shared.js, loaded before this file.
  // TAIWAN_OUTLINE comes from ../shared-outline.js; TAIWAN_COUNTIES and
  // PLACENAME_POOL come from data.js, both also loaded before this file.

  // A separate mode from the draw challenge: the player sees the full
  // island (optionally with county names/borders) and, for 5 place names
  // shown one at a time, picks one of 5 differently-sized circles (each
  // used exactly once across the 5 questions) and drops it on the map
  // trying to cover that place. Smaller circle -> more points, but only if
  // it's actually placed accurately enough to cover the target.
  //
  // Radii chosen so the smallest circle is roughly "a small town" (a few
  // hundred km²) and the largest is roughly a third of Taiwan's ~35,800km²
  // land area (area = πr² => r ≈ 62km for 1/3 of that).
  const PLACENAME_CIRCLE_TIERS = [
    { radiusKm: 8, points: 100, label: "極小" },
    { radiusKm: 18, points: 80, label: "小" },
    { radiusKm: 32, points: 60, label: "中" },
    { radiusKm: 48, points: 40, label: "大" },
    { radiusKm: 62, points: 20, label: "極大" },
  ];
  const QUESTIONS_PER_DAY = 5;
  const MAX_SCORE = PLACENAME_CIRCLE_TIERS.reduce((sum, t) => sum + t.points, 0);

  // Which PLACENAME_POOL size applies to a given day. Growing the pool
  // (appending to data.js) must never change a question that's already
  // been shown -- including today's, if the growth ships before the
  // player's next visit -- so each day resolves against whatever poolSize
  // was in effect as of ITS OWN epoch, not however large the array
  // happens to be right now.
  //
  // IMPORTANT -- when appending to PLACENAME_POOL later: add a new entry
  // here too, with fromDayIndex = dateStringToDayIndex(<the date the
  // deploy actually goes live>) and poolSize = PLACENAME_POOL.length (the
  // new, larger total). Do NOT edit or remove any existing entry -- every
  // day before that boundary keeps resolving against the smaller, frozen
  // size, which is what makes appending safe. Keep entries sorted by
  // fromDayIndex ascending.
  const POOL_EPOCHS = [
    { fromDayIndex: -Infinity, poolSize: 314 }, // v1 pool, shipped 2026-08-27
    // v2: +10 landmarks (indices 314-323), pushed 2026-08-27 but effective
    // the next day so today's already-shown questions aren't disturbed.
    { fromDayIndex: dateStringToDayIndex("2026-08-28"), poolSize: 324 },
    // v3: +10 more landmarks (indices 324-333), pushed 2026-08-27. Set to
    // 08-29 (not 08-28, which the v2 epoch already claims) so 08-28 still
    // gets its own full day on exactly the 324-pool before growing again.
    { fromDayIndex: dateStringToDayIndex("2026-08-29"), poolSize: 334 },
    // v4: +11 more landmarks (indices 334-344), pushed 2026-09-01,
    // effective the next day so today's questions aren't disturbed.
    { fromDayIndex: dateStringToDayIndex("2026-09-02"), poolSize: 345 },
    // v5: +7 hot-spring-area landmarks (indices 345-351), pushed
    // 2026-09-01 (same day as v4). Set to 09-03 (not 09-02, which v4
    // already claims) so 09-02 still gets its own full day on exactly
    // the v4 (345) pool before growing again.
    { fromDayIndex: dateStringToDayIndex("2026-09-03"), poolSize: 352 },
  ];

  function poolSizeForDayIndex(dayIndex) {
    let size = POOL_EPOCHS[0].poolSize;
    for (const epoch of POOL_EPOCHS) {
      if (epoch.fromDayIndex <= dayIndex) size = epoch.poolSize;
      else break;
    }
    return size;
  }

  // Picks QUESTIONS_PER_DAY distinct indices into PLACENAME_POOL for a
  // given day, using the same no-repeat-within-a-cycle shuffle as the
  // draw-challenge pool, but scoped to that day's frozen poolSize (see
  // above) rather than the pool's current live length -- the actual
  // append-safety guarantee lives in that scoping, not in this function.
  // When poolSize isn't a multiple of 5, the last day of a cycle wraps
  // around and repeats a few of that cycle's earlier picks rather than
  // coming up short.
  function indicesForDayIndex(dayIndex) {
    const n = poolSizeForDayIndex(dayIndex);
    const cycleLen = Math.ceil(n / QUESTIONS_PER_DAY);
    const cycle = Math.floor(dayIndex / cycleLen);
    const positionInCycle = ((dayIndex % cycleLen) + cycleLen) % cycleLen;
    const order = shuffledIndices(n, cycle);
    const start = positionInCycle * QUESTIONS_PER_DAY;
    const picks = [];
    for (let k = 0; k < QUESTIONS_PER_DAY; k++) picks.push(order[(start + k) % n]);
    return picks;
  }

  function questionsForDate(dateStr) {
    const dayIndex = dateStringToDayIndex(dateStr);
    return indicesForDayIndex(dayIndex).map((i) => PLACENAME_POOL[i]);
  }

  function todaysQuestions() {
    return questionsForDate(getTaipeiDateString());
  }

  function computeScore(results) {
    const totalPoints = results.reduce(
      (sum, r) => sum + (r.correct ? PLACENAME_CIRCLE_TIERS[r.tierIndex].points : 0),
      0
    );
    const pct = Math.round((totalPoints / MAX_SCORE) * 100);
    return { totalPoints, pct };
  }

  // ---- Canvas / DOM setup --------------------------------------------------
  const wrap = document.getElementById("canvas-wrap");
  const bgCanvas = document.getElementById("bg-canvas");
  const drawCanvas = document.getElementById("draw-canvas");
  const resultCanvas = document.getElementById("result-canvas");
  const bgCtx = bgCanvas.getContext("2d");
  const drawCtx = drawCanvas.getContext("2d");
  const resultCtx = resultCanvas.getContext("2d");

  // Mutable projection state, set by configureProjection() -- this mode
  // never rotates (currentRotationDeg always 0), but toCanvas() still
  // needs it since it shares the same math as the draw modes.
  let CANVAS_W, CANVAS_H, originPxX, originPxY, currentRotationDeg;
  let REAL_PATH;

  function toCanvas(lon, lat) {
    const km = projectKm(lon, lat);
    const rotated = rotateXY({ x: km.x / KM_PER_PX, y: km.y / KM_PER_PX }, currentRotationDeg);
    return { x: originPxX + rotated.x, y: originPxY + rotated.y };
  }

  // `extraPoints` folded into the bounding box alongside the outline --
  // passed the whole pool (not just today's 5) below so the map's
  // size/zoom stays constant day to day regardless of which entries come
  // up, rather than jumping around whenever an offshore entry is picked.
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

  // Whether the difficulty toggle (county names/borders) is on. Persisted
  // so the player's preference sticks across visits.
  const SHOW_COUNTY_OVERLAY_KEY = "drawTaiwanShowCountyOverlay";
  function loadShowCountyOverlay() {
    try {
      const raw = localStorage.getItem(SHOW_COUNTY_OVERLAY_KEY);
      return raw === null ? true : raw === "1";
    } catch (e) {
      return true;
    }
  }
  function saveShowCountyOverlay(value) {
    try {
      localStorage.setItem(SHOW_COUNTY_OVERLAY_KEY, value ? "1" : "0");
    } catch (e) {
      /* ignore (private browsing, quota, etc.) */
    }
  }
  let showCountyOverlay = loadShowCountyOverlay();

  // Whether the how-to-play modal has already been shown and dismissed
  // once -- shown automatically the first time, reopenable anytime
  // afterward via the "❓ 怎麼玩？" button.
  const TUTORIAL_SEEN_KEY = "drawTaiwanPlacenameTutorialSeen";
  function hasSeenTutorial() {
    try {
      return localStorage.getItem(TUTORIAL_SEEN_KEY) === "1";
    } catch (e) {
      return false;
    }
  }
  function markTutorialSeen() {
    try {
      localStorage.setItem(TUTORIAL_SEEN_KEY, "1");
    } catch (e) {
      /* ignore (private browsing, quota, etc.) */
    }
  }

  // Catch-up state: null means "today's 5 questions"; otherwise a
  // "YYYY-MM-DD" Taipei date string for a past day being replayed.
  let activeDate = null;

  let questions = []; // today's (or activeDate's) questions, in play order
  let questionIndex = 0;
  let availableTiers = []; // indices into PLACENAME_CIRCLE_TIERS not yet used this game
  let selectedTierIndex = null; // tier picked for the CURRENT question, if any
  let circlePx = null; // {x,y} of the not-yet-confirmed circle placement, if any
  let answered = false; // true once the current question has been confirmed (reveal shown)
  let results = []; // [{name, lon, lat, tierIndex, correct, distanceKm}], one per answered question

  // County borders (thin lines) + name labels, drawn over the filled
  // island when the difficulty toggle is on.
  function drawCountyOverlay() {
    bgCtx.strokeStyle = "rgba(255,255,255,0.55)";
    bgCtx.lineWidth = 1.25;
    for (const county of TAIWAN_COUNTIES) {
      const pts = county.path.map(([lon, lat]) => toCanvas(lon, lat));
      bgCtx.beginPath();
      bgCtx.moveTo(pts[0].x, pts[0].y);
      for (const p of pts) bgCtx.lineTo(p.x, p.y);
      bgCtx.closePath();
      bgCtx.stroke();
    }
    bgCtx.fillStyle = "rgba(255,255,255,0.9)";
    bgCtx.font = "11px sans-serif";
    bgCtx.textAlign = "center";
    bgCtx.textBaseline = "middle";
    for (const county of TAIWAN_COUNTIES) {
      const p = toCanvas(county.centroid[0], county.centroid[1]);
      bgCtx.fillText(county.name, p.x, p.y);
    }
    bgCtx.textBaseline = "alphabetic";
  }

  // Unlike the draw modes, this mode's whole premise is showing the player
  // the actual island so they can place a place name relative to it -- so,
  // uniquely, it fills/strokes REAL_PATH instead of leaving the map blank.
  function drawBackground() {
    paintOceanBase(bgCtx, CANVAS_W, CANVAS_H);

    bgCtx.fillStyle = "#3a92c9";
    bgCtx.beginPath();
    bgCtx.moveTo(REAL_PATH[0].x, REAL_PATH[0].y);
    for (const p of REAL_PATH) bgCtx.lineTo(p.x, p.y);
    bgCtx.closePath();
    bgCtx.fill();
    bgCtx.strokeStyle = "#eaf6ff";
    bgCtx.lineWidth = 2;
    bgCtx.stroke();

    if (showCountyOverlay) drawCountyOverlay();
  }

  const countyOverlayToggle = document.getElementById("county-overlay-toggle");
  countyOverlayToggle.checked = showCountyOverlay;
  countyOverlayToggle.addEventListener("change", () => {
    showCountyOverlay = countyOverlayToggle.checked;
    saveShowCountyOverlay(showCountyOverlay);
    drawBackground();
  });

  function canvasPointFromEvent(evt) {
    const rect = drawCanvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    return {
      x: (evt.clientX - rect.left) * scaleX,
      y: (evt.clientY - rect.top) * scaleY,
    };
  }

  // ---- Controls ---------------------------------------------------------
  const questionEl = document.getElementById("question");
  const tierPickerEl = document.getElementById("tier-picker");
  const feedbackEl = document.getElementById("feedback");
  const controlsEl = document.getElementById("controls");
  const confirmBtn = document.getElementById("confirm-btn");
  const nextBtn = document.getElementById("next-btn");
  const resultPanelEl = document.getElementById("result-panel");
  const scoreGradeEl = document.getElementById("score-grade");
  const scoreNumberEl = document.getElementById("score-number");
  const scoreMessageEl = document.getElementById("score-message");
  const breakdownEl = document.getElementById("breakdown");
  const retryBtn = document.getElementById("retry-btn");
  const reviewBtn = document.getElementById("review-btn");
  const reviewControlsEl = document.getElementById("review-controls");
  const reviewBackBtn = document.getElementById("review-back-btn");
  const bestScoreLine = document.getElementById("best-score-line");
  const helpBtn = document.getElementById("help-btn");
  const tutorialOverlay = document.getElementById("tutorial-overlay");
  const tutorialCloseBtn = document.getElementById("tutorial-close-btn");
  const toolsEl = document.getElementById("tools");
  const catchupBtn = document.getElementById("catchup-btn");
  const backToTodayBtn = document.getElementById("back-to-today-btn");
  const catchupPanel = document.getElementById("catchup-panel");
  const catchupListEl = document.getElementById("catchup-list");
  const catchupCloseBtn = document.getElementById("catchup-close-btn");
  const RECORDS_KEY = "drawTaiwanPlacenameRecords";
  const HISTORY_KEY = "drawTaiwanPlacenameHistory";

  function updateBestScoreDisplay(records) {
    if (records.attempts === 0) {
      bestScoreLine.textContent = "🏆 最高紀錄：尚未挑戰";
      return;
    }
    bestScoreLine.textContent = `🏆 最高紀錄：${records.bestScore}% (${records.bestGrade}) ・ 已挑戰 ${records.attempts} 次`;
  }

  function enterMode() {
    // Always the plain, unrotated island. The whole pool is passed as
    // extraPoints (not just today's 5) so the map's size/zoom stays
    // constant day to day regardless of which entries come up -- every
    // current entry already fits the base bounding box, but this keeps it
    // that way automatically if a future addition (an offshore island,
    // say) wouldn't.
    configureProjection(0, PLACENAME_POOL);

    resultPanelEl.hidden = true;
    reviewControlsEl.hidden = true;
    backToTodayBtn.hidden = !activeDate;
    catchupPanel.hidden = true; // always close the picker when (re)entering

    questions = activeDate ? questionsForDate(activeDate) : todaysQuestions();
    questionIndex = 0;
    availableTiers = PLACENAME_CIRCLE_TIERS.map((_, i) => i);
    results = [];

    drawBackground();
    updateBestScoreDisplay(loadRecords(RECORDS_KEY));
    startQuestion();

    if (!hasSeenTutorial()) showTutorial();
  }

  function showTutorial() {
    tutorialOverlay.hidden = false;
  }

  helpBtn.addEventListener("click", showTutorial);
  tutorialCloseBtn.addEventListener("click", () => {
    tutorialOverlay.hidden = true;
    markTutorialSeen();
  });

  // ---- Catch-up: replay a past day's challenge ---------------------------
  // The archive should look like what it actually is -- a mode that just
  // launched -- rather than immediately claiming a full month of history
  // that never happened. It starts at ~1 week (as of the date below) and
  // grows by a day every day after that, capping at a 30-day window once
  // it's actually accumulated that much.
  const CATCHUP_LAUNCH_DATE = "2026-08-20";
  const CATCHUP_MAX_WINDOW_DAYS = 30;

  function catchupDateStrings() {
    const todayIdx = dateStringToDayIndex(getTaipeiDateString());
    const launchIdx = dateStringToDayIndex(CATCHUP_LAUNCH_DATE);
    const daysSinceLaunch = todayIdx - launchIdx;
    const windowSize = Math.max(0, Math.min(daysSinceLaunch, CATCHUP_MAX_WINDOW_DAYS));
    return pastDateStrings(windowSize); // most recent (yesterday) first
  }

  // Doesn't preview that day's actual place names (spoiler risk) --
  // numbered oldest -> newest instead, while the list itself still shows
  // newest first.
  function renderCatchupList() {
    const history = loadHistory(HISTORY_KEY);
    catchupListEl.innerHTML = "";
    const dates = catchupDateStrings();
    const windowSize = dates.length;
    dates.forEach((dateStr, i) => {
      const entry = history[dateStr];
      const item = document.createElement("button");
      item.type = "button";
      item.className = "catchup-item" + (entry ? " done" : "");
      const statusText = entry ? `✅ ${entry.score}% (${entry.grade})` : "尚未挑戰";
      const label = String(windowSize - i).padStart(3, "0");
      item.innerHTML =
        `<span class="catchup-date">${formatDisplayDate(dateStr)}</span>` +
        `<span class="catchup-summary">第 ${label} 組</span>` +
        `<span class="catchup-status">${statusText}</span>`;
      item.addEventListener("click", () => {
        activeDate = dateStr;
        enterMode();
      });
      catchupListEl.appendChild(item);
    });
  }

  catchupBtn.addEventListener("click", () => {
    if (catchupPanel.hidden) renderCatchupList();
    catchupPanel.hidden = !catchupPanel.hidden;
  });
  catchupCloseBtn.addEventListener("click", () => {
    catchupPanel.hidden = true;
  });
  backToTodayBtn.addEventListener("click", () => {
    activeDate = null;
    enterMode();
  });

  function startQuestion() {
    const q = questions[questionIndex];
    const dayLabel = activeDate ? `補玩 ${formatDisplayDate(activeDate)}・` : "";
    questionEl.textContent = `📍 ${dayLabel}第 ${questionIndex + 1} 題／${questions.length}：${q.name}`;
    selectedTierIndex = null;
    circlePx = null;
    answered = false;
    feedbackEl.textContent = "";
    confirmBtn.hidden = true;
    nextBtn.hidden = true;
    drawCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    resultCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    renderTierButtons();
  }

  function renderTierButtons() {
    tierPickerEl.innerHTML = "";
    PLACENAME_CIRCLE_TIERS.forEach((tier, i) => {
      const used = !availableTiers.includes(i);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tier-btn" + (selectedTierIndex === i ? " selected" : "") + (used ? " used" : "");
      btn.textContent = `${tier.label}（${tier.points}分）`;
      btn.disabled = used || answered;
      btn.addEventListener("click", () => {
        selectedTierIndex = i;
        renderTierButtons();
        redrawPreview();
      });
      tierPickerEl.appendChild(btn);
    });
  }

  function redrawPreview() {
    drawCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (circlePx === null || selectedTierIndex === null) return;
    const tier = PLACENAME_CIRCLE_TIERS[selectedTierIndex];
    const radiusPx = tier.radiusKm / KM_PER_PX;
    drawCtx.beginPath();
    drawCtx.arc(circlePx.x, circlePx.y, radiusPx, 0, Math.PI * 2);
    drawCtx.fillStyle = "rgba(255, 183, 3, 0.35)";
    drawCtx.fill();
    drawCtx.strokeStyle = "#ffb703";
    drawCtx.lineWidth = 2;
    drawCtx.stroke();
  }

  drawCanvas.addEventListener("pointerdown", (evt) => {
    if (answered || selectedTierIndex === null) return;
    circlePx = canvasPointFromEvent(evt);
    redrawPreview();
    confirmBtn.hidden = false;
  });

  confirmBtn.addEventListener("click", () => {
    if (circlePx === null || selectedTierIndex === null || answered) return;
    const tier = PLACENAME_CIRCLE_TIERS[selectedTierIndex];
    const target = questions[questionIndex];
    // Inverse of toCanvas() -- this mode never rotates the projection, so
    // there's no rotation to undo here, just the origin offset + scale.
    const kmX = (circlePx.x - originPxX) * KM_PER_PX;
    const kmY = (circlePx.y - originPxY) * KM_PER_PX;
    const targetKm = projectKm(target.lon, target.lat);
    const distanceKm = Math.hypot(kmX - targetKm.x, kmY - targetKm.y);
    const correct = distanceKm <= tier.radiusKm;

    results.push({
      name: target.name,
      lon: target.lon,
      lat: target.lat,
      tierIndex: selectedTierIndex,
      correct,
      distanceKm,
    });
    availableTiers = availableTiers.filter((i) => i !== selectedTierIndex);
    answered = true;

    const radiusPx = tier.radiusKm / KM_PER_PX;
    resultCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    resultCtx.beginPath();
    resultCtx.arc(circlePx.x, circlePx.y, radiusPx, 0, Math.PI * 2);
    resultCtx.fillStyle = correct ? "rgba(46, 204, 113, 0.3)" : "rgba(255, 82, 82, 0.3)";
    resultCtx.fill();
    resultCtx.strokeStyle = correct ? "#2ecc71" : "#ff5252";
    resultCtx.lineWidth = 2.5;
    resultCtx.stroke();
    // mark the actual location so a miss is easy to learn from
    const targetPx = toCanvas(target.lon, target.lat);
    resultCtx.beginPath();
    resultCtx.arc(targetPx.x, targetPx.y, 5, 0, Math.PI * 2);
    resultCtx.fillStyle = "#ffffff";
    resultCtx.fill();
    resultCtx.strokeStyle = "#000000";
    resultCtx.lineWidth = 1.5;
    resultCtx.stroke();

    drawCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    feedbackEl.textContent = correct ? `✅ 涵蓋成功！` : `❌ 沒涵蓋到，差了約 ${Math.round(distanceKm)} 公里`;
    confirmBtn.hidden = true;
    renderTierButtons();

    if (questionIndex < questions.length - 1) {
      nextBtn.hidden = false;
    } else {
      finishChallenge();
    }
  });

  nextBtn.addEventListener("click", () => {
    questionIndex++;
    startQuestion();
  });

  function renderResults(totalPoints, pct, grade, message, isNewBest) {
    scoreGradeEl.textContent = grade;
    scoreNumberEl.textContent = `${totalPoints} / ${MAX_SCORE} 分（${pct}%）`;
    scoreMessageEl.textContent = (isNewBest ? "🎉 新紀錄！ " : "") + message;

    breakdownEl.innerHTML = "";
    results.forEach((r, i) => {
      const tier = PLACENAME_CIRCLE_TIERS[r.tierIndex];
      const div = document.createElement("div");
      div.className = "analysis-line";
      div.textContent = r.correct
        ? `${i + 1}. ${r.name} — ✅ 用了「${tier.label}」，${tier.points} 分`
        : `${i + 1}. ${r.name} — ❌ 用了「${tier.label}」，差了約 ${Math.round(r.distanceKm)} 公里，0 分`;
      breakdownEl.appendChild(div);
    });

    tierPickerEl.hidden = true;
    feedbackEl.hidden = true;
    controlsEl.hidden = true;
    resultPanelEl.hidden = false;
  }

  // Same shape as the draw challenge's GRADE_MESSAGES but themed around
  // pinpointing place names on a visible map (geography/precision) rather
  // than freehand drawing accuracy.
  const GRADE_MESSAGES = {
    S: [
      "根本是台灣百科全書，指哪打哪！",
      "地理小老師本人，一點都不誇張！",
      "這精準度，內政部要來挖角了",
      "台灣任何角落都逃不過你的手指",
      "GPS 定位大概就長這樣吧！",
      "地名一報你就秒懂位置，太狂了",
    ],
    A: [
      "很厲害了！只差一兩題就滿分",
      "地理實力有目共睹，再抓緊一點就完美",
      "大部分地名都被你一眼看穿",
      "台灣地圖在你心中已經有雛形了",
      "選圈的策略也很聰明，可惜差臨門一腳",
    ],
    B: [
      "抓到一些方向感，但還能更準",
      "認得出大概位置，細節要再練練",
      "半個台灣在你腦中，另一半好像跑丟了",
      "有練過，但地圖冊還不能丟",
      "圈選得不錯，位置感再加強一下",
    ],
    C: [
      "方向感有點迷路，多看地圖會更好",
      "抓錯地方的機率有點高喔",
      "台灣地名跟你玩起躲貓貓了",
      "感覺你比較熟悉的是另一個台灣",
      "半數地名都跑到別的縣市去了",
    ],
    D: [
      "這些地名對你來說還很陌生呢",
      "地圖冊建議隨身攜帶",
      "看來要重新認識一下台灣了",
      "每一題都跟目標擦肩而過",
      "先從縣市界線開始複習吧！",
    ],
  };

  function finishChallenge() {
    const { totalPoints, pct } = computeScore(results);
    const [grade, message] = gradeFor(pct, GRADE_MESSAGES);
    const { records, isNewBest } = recordAttempt(RECORDS_KEY, pct, grade);
    updateBestScoreDisplay(records);
    const targetDate = activeDate || getTaipeiDateString();
    recordHistoryEntry(HISTORY_KEY, targetDate, pct, grade);
    renderResults(totalPoints, pct, grade, message, isNewBest);
  }

  retryBtn.addEventListener("click", () => {
    enterMode();
  });

  // Draws every question from this round at its real location at once
  // (unlike the reveal during play, which only ever shows one at a time),
  // colored by whether that answer was correct -- lets the player see the
  // whole round's geography together after the fact.
  function drawReview() {
    resultCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    for (const r of results) {
      const px = toCanvas(r.lon, r.lat);
      const color = r.correct ? "#2ecc71" : "#ff5252";
      resultCtx.beginPath();
      resultCtx.arc(px.x, px.y, 6, 0, Math.PI * 2);
      resultCtx.fillStyle = color;
      resultCtx.fill();
      resultCtx.lineWidth = 2;
      resultCtx.strokeStyle = "#ffffff";
      resultCtx.stroke();

      // The dot alone carries the correct/wrong color; only wrong labels
      // also turn red for extra emphasis -- red-vs-green text on a small
      // pill is a rough call for red-green color blindness, so correct
      // ones stay plain white rather than green-on-black.
      const labelY = px.y < 40 ? px.y + 22 : px.y - 16;
      const labelColor = r.correct ? "#ffffff" : "#ff5252";
      drawLabelPill(px.x, labelY, r.name, resultCtx, labelColor);
    }
  }

  reviewBtn.addEventListener("click", () => {
    resultPanelEl.hidden = true;
    reviewControlsEl.hidden = false;
    drawReview();
  });
  reviewBackBtn.addEventListener("click", () => {
    reviewControlsEl.hidden = true;
    resultCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    resultPanelEl.hidden = false;
  });

  enterMode();
})();
