(() => {
  "use strict";

  // Shared projection constants/functions (KM_PER_LAT, KM_PER_PX, PAD,
  // northPoint, projectKm, rotateXY), date/shuffle utilities
  // (getTaipeiDateString, mulberry32, shuffledIndices, dateStringToDayIndex,
  // dayIndexToDateString, pastDateStrings, formatDisplayDate), and canvas/
  // sharing helpers (roundRectPath, drawLabelPill, paintOceanBase,
  // pickRandom, gradeFor, wrapText, shareOrDownloadCard) all come from
  // ../shared.js, loaded before this file. TAIWAN_OUTLINE comes from
  // ../shared-outline.js; TAIWAN_COUNTIES and PLACENAME_POOL come from
  // data.js; SPECIAL_POOLS comes from special-data.js -- all loaded before
  // this file.

  // Two modes, both built on the same play loop (pick a circle size, drop
  // it on the map, see if it covers the target):
  //
  // - Daily (📅): today's (or a caught-up past day's) 5 place names, shown
  //   directly by name. One-shot per day -- see enterDailyMode() below.
  // - Special (🎯): a hand-picked 10-question pool (SPECIAL_POOLS,
  //   special-data.js) themed around a riddle rather than a bare place name
  //   ("最高的山" -- the player has to know the answer is 玉山 *and* find
  //   it). Freely replayable, fresh shuffle each time, and since 10
  //   questions need more than 5 uses, each circle size can be used twice
  //   instead of once.
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
  const TIER_POINTS_SUM = PLACENAME_CIRCLE_TIERS.reduce((sum, t) => sum + t.points, 0); // 300
  const QUESTIONS_PER_DAY = 5; // daily mode only -- special pools are always 10, see SPECIAL_POOLS

  // How many times each circle size may be used this round, and the score
  // that implies -- 1 use / 300 for daily's 5 questions, 2 uses / 600 for
  // special's 10. Reset at the top of enterDailyMode()/startSpecialRound(),
  // read by computeScore()/renderTierButtons()/renderResults() etc.
  let maxUsesPerTier = 1;
  let MAX_SCORE = TIER_POINTS_SUM;

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

  // Plain (non-seeded) Fisher-Yates shuffle -- special mode wants a fresh
  // random order every replay ("每次順序不一但是都會出現"), unlike the
  // daily challenge's deterministic date-seeded one.
  function shuffleArray(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
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

  // Keeps --canvas-h-budget (read by style.css's mobile #canvas-wrap width
  // formula) equal to the actual room available below the header/hint-bar
  // and above #action-dock's fixed bottom bar -- measured directly rather
  // than guessed, since both the header stack's height and the dock's
  // height (tier buttons wrapping to one vs. two rows, confirm/next shown
  // or not) vary. #canvas-wrap's own top offset is unaffected by either
  // (nothing above it depends on its own size), so a fresh measurement
  // each time is enough -- no iteration needed. Recomputed on a
  // ResizeObserver (covers the dock's height changing) and on window
  // resize (covers viewport size / rotation changing); ResizeObserver
  // also delivers an initial call once layout settles, so nothing extra
  // is needed to set the very first value.
  const actionDockEl = document.getElementById("action-dock");
  function updateCanvasHeightBudget() {
    const budget = window.innerHeight - wrap.getBoundingClientRect().top - actionDockEl.getBoundingClientRect().height;
    wrap.style.setProperty("--canvas-h-budget", `${Math.max(budget, 120)}px`);
  }
  new ResizeObserver(updateCanvasHeightBudget).observe(actionDockEl);
  window.addEventListener("resize", updateCanvasHeightBudget);

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
  // always passed the whole daily PLACENAME_POOL (not just today's 5, and
  // not the special pools either -- every special-pool landmark already
  // sits well within mainland Taiwan, comfortably inside this same box) so
  // the map's size/zoom stays constant across days AND across modes.
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
  // once -- shown automatically the first time (daily mode only; special
  // mode's rules are explained inline on its pool-picker screen instead),
  // reopenable anytime afterward via the "❓ 怎麼玩？" button.
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

  // Catch-up state (daily mode only): null means "today's 5 questions";
  // otherwise a "YYYY-MM-DD" Taipei date string for a past day being
  // replayed.
  let activeDate = null;

  // "daily" | "special" -- which top-level mode is active. activeSpecialPoolId
  // is which SPECIAL_POOLS entry is being played/reviewed (special mode only).
  let mode = "daily";
  let activeSpecialPoolId = null;

  function currentSpecialPool() {
    return SPECIAL_POOLS.find((p) => p.id === activeSpecialPoolId) || null;
  }

  function specialRecordsKey(poolId) {
    return "drawTaiwanPlacenameSpecialRecords_" + poolId;
  }

  let questions = []; // this round's questions, in play order
  let questionIndex = 0;
  let tierUsesLeft = []; // remaining uses per PLACENAME_CIRCLE_TIERS index this round
  let selectedTierIndex = null; // tier picked for the CURRENT question, if any
  let circlePx = null; // {x,y} of the not-yet-confirmed circle placement, if any
  let answered = false; // true once the current question has been confirmed (reveal shown)
  // [{name, question, extra, lon, lat, tierIndex, correct, distanceKm}], one
  // per answered question. `question`/`extra` are only present for special-
  // mode entries (the riddle text and the answer's stat, e.g. "3,952m") --
  // undefined for daily entries, which show the place name as the question
  // itself. For a reconstructed pre-archive-feature legacy daily entry (see
  // showArchivedResult), tierIndex/correct/distanceKm are null instead: the
  // day's actual place names are recoverable (questionsForDate() is
  // deterministic), but which tier the player picked and whether they hit
  // it never got recorded, so there's nothing to reconstruct there.
  let results = [];
  // True while showing a past day's read-only score card (showArchivedResult,
  // daily mode only). There's nothing left to hide there -- unlike a
  // just-finished round, the review map is shown immediately and stays up
  // even behind the score panel, rather than waiting for a "🔍 複習地名位置"
  // click.
  let viewingArchivedResult = false;
  // True when the currently-shown archived result predates this
  // per-question tracking (score/grade only) and `results` above was
  // reconstructed from questionsForDate() rather than loaded from storage.
  let isLegacyArchive = false;
  // {totalPoints, pct, grade} for whatever's currently on the score panel
  // (a just-finished round or an archived one) -- set by renderResults(),
  // read by the share-card button so it works from either path.
  let lastCardScore = null;
  // Special mode only (daily entries carry no `question` field to switch
  // to): whether the review map's labels show the answer (r.name) or the
  // riddle (r.question). Reset to true (answer) whenever a fresh score
  // panel appears -- see renderResults().
  let reviewShowAnswer = true;

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
  const modeDailyBtn = document.getElementById("mode-daily-btn");
  const modeSpecialBtn = document.getElementById("mode-special-btn");
  const hintBarEl = document.getElementById("hint-bar");
  const progressBarEl = document.getElementById("progress-bar");
  const progressBarTextEl = document.getElementById("progress-bar-text");
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
  const shareCardBtn = document.getElementById("download-card-btn");
  const supportsFileShare = typeof navigator.share === "function" && typeof navigator.canShare === "function";
  if (supportsFileShare) {
    shareCardBtn.textContent = "分享成績卡片";
  }
  const retrySpecialBtn = document.getElementById("retry-special-btn");
  const reviewBtn = document.getElementById("review-btn");
  const reviewControlsEl = document.getElementById("review-controls");
  const reviewLegendEl = document.getElementById("review-legend");
  const reviewToggleLabelBtn = document.getElementById("review-toggle-label-btn");
  const reviewBackBtn = document.getElementById("review-back-btn");
  const bestScoreLine = document.getElementById("best-score-line");
  const helpBtn = document.getElementById("help-btn");
  const tutorialOverlay = document.getElementById("tutorial-overlay");
  const tutorialCloseBtn = document.getElementById("tutorial-close-btn");
  const catchupBtn = document.getElementById("catchup-btn");
  const backToTodayBtn = document.getElementById("back-to-today-btn");
  const catchupPanel = document.getElementById("catchup-panel");
  const catchupListEl = document.getElementById("catchup-list");
  const catchupCloseBtn = document.getElementById("catchup-close-btn");
  const archiveBtn = document.getElementById("archive-btn");
  const archivePanel = document.getElementById("archive-panel");
  const archiveListEl = document.getElementById("archive-list");
  const archiveCloseBtn = document.getElementById("archive-close-btn");
  const backToPoolListBtn = document.getElementById("back-to-pool-list-btn");
  const specialPoolPickerEl = document.getElementById("special-pool-picker");
  const specialPoolListEl = document.getElementById("special-pool-list");
  const RECORDS_KEY = "drawTaiwanPlacenameRecords";
  const HISTORY_KEY = "drawTaiwanPlacenameHistory";

  function updateBestScoreDisplay(records) {
    bestScoreLine.hidden = false;
    if (records.attempts === 0) {
      bestScoreLine.textContent = "🏆 最高紀錄：尚未挑戰";
      return;
    }
    bestScoreLine.textContent = `🏆 最高紀錄：${records.bestScore}% (${records.bestGrade}) ・ 已挑戰 ${records.attempts} 次`;
  }

  function setActiveModeBtn() {
    modeDailyBtn.classList.toggle("active", mode === "daily");
    modeSpecialBtn.classList.toggle("active", mode === "special");
  }

  // catchup/archive (daily-only) vs. "⬅️ 選擇題庫" (special-only, once a
  // pool's been chosen) share the same #tools row.
  function updateToolsVisibility() {
    const isDaily = mode === "daily";
    catchupBtn.hidden = !isDaily;
    archiveBtn.hidden = !isDaily;
    backToTodayBtn.hidden = !isDaily || !activeDate;
    backToPoolListBtn.hidden = isDaily || !activeSpecialPoolId;
  }

  function enterDailyMode() {
    mode = "daily";
    setActiveModeBtn();
    maxUsesPerTier = 1;
    MAX_SCORE = TIER_POINTS_SUM * maxUsesPerTier;
    helpBtn.hidden = false;
    hintBarEl.hidden = false;
    wrap.hidden = false;
    specialPoolPickerEl.hidden = true;

    // Always the plain, unrotated island. The whole pool is passed as
    // extraPoints (not just today's 5) so the map's size/zoom stays
    // constant day to day regardless of which entries come up -- every
    // current entry already fits the base bounding box, but this keeps it
    // that way automatically if a future addition (an offshore island,
    // say) wouldn't.
    configureProjection(0, PLACENAME_POOL);

    resultPanelEl.hidden = true;
    reviewControlsEl.hidden = true;
    catchupPanel.hidden = true; // always close either picker when (re)entering
    archivePanel.hidden = true;
    updateToolsVisibility();

    drawBackground();
    updateBestScoreDisplay(loadRecords(RECORDS_KEY));

    // Each day can only ever be played once -- no retry. If this day
    // (today, or a catch-up/archive date) already has a recorded result,
    // show that result read-only instead of letting the player answer
    // again, whether they landed here fresh (today, already done earlier)
    // or clicked into it from the catch-up/archive list.
    const targetDate = activeDate || getTaipeiDateString();
    const doneEntry = loadHistory(HISTORY_KEY)[targetDate];
    if (doneEntry) {
      showArchivedResult(targetDate, doneEntry);
      return;
    }

    // Undo the hidden=true that renderResults() leaves behind after a
    // round finishes -- nothing else re-shows these before starting a
    // fresh (undone) day's questions.
    tierPickerEl.hidden = false;
    feedbackEl.hidden = false;
    controlsEl.hidden = false;
    progressBarEl.hidden = false;
    questionEl.hidden = true; // the question now lives in #progress-bar while actually playing
    viewingArchivedResult = false;
    isLegacyArchive = false;
    retrySpecialBtn.hidden = true;

    questions = activeDate ? questionsForDate(activeDate) : todaysQuestions();
    questionIndex = 0;
    tierUsesLeft = PLACENAME_CIRCLE_TIERS.map(() => maxUsesPerTier);
    results = [];
    startQuestion();

    if (!hasSeenTutorial()) showTutorial();
  }

  // Shows a past day's already-recorded result read-only: same score
  // card as finishing a round normally produces, just sourced from the
  // archived entry instead of a just-played `results`. Unlike a
  // just-finished round, the review map is drawn immediately (no need to
  // click "🔍 複習地名位置" first) -- there's no fresh reveal being
  // spoiled here, it's already history.
  //
  // Entries recorded before this archive feature shipped only have
  // {score, grade} -- no per-question results, since that wasn't tracked
  // yet. What IS still recoverable is which 5 place names that day
  // actually used: questionsForDate() is deterministic (see POOL_EPOCHS
  // above), so it reconstructs the exact same picks regardless of how
  // long ago the day was. What's NOT recoverable is which tier the player
  // picked for each and whether they hit it -- that was never stored, so
  // those reconstructed entries carry tierIndex/correct/distanceKm: null
  // rather than a guess. renderResults() and drawReview() both render
  // these null fields as "we know the place, not the outcome" instead of
  // pretending it was answered. (Daily mode only -- special mode has no
  // archive, since it's freely replayable rather than one-shot per day.)
  function showArchivedResult(dateStr, entry) {
    const dayLabel = activeDate ? `補玩 ${formatDisplayDate(dateStr)}・` : "";
    questionEl.textContent = `📍 ${dayLabel}已完成挑戰`;
    isLegacyArchive = !entry.results;
    results = entry.results
      ? entry.results
      : questionsForDate(dateStr).map((q) => ({
          name: q.name,
          lon: q.lon,
          lat: q.lat,
          tierIndex: null,
          correct: null,
          distanceKm: null,
        }));
    const totalPoints =
      typeof entry.totalPoints === "number" ? entry.totalPoints : Math.round((entry.score / 100) * MAX_SCORE);
    const [computedGrade, message] = gradeFor(entry.score, GRADE_MESSAGES);
    renderResults(totalPoints, entry.score, entry.grade || computedGrade, message, false);
    viewingArchivedResult = true;
    updateReviewLegend();
    updateReviewToggleVisibility();
    if (results.length > 0) drawReview();
  }

  function showTutorial() {
    tutorialOverlay.hidden = false;
  }

  helpBtn.addEventListener("click", showTutorial);
  tutorialCloseBtn.addEventListener("click", () => {
    tutorialOverlay.hidden = true;
    markTutorialSeen();
  });

  // ---- Catch-up: replay a past day's challenge (daily mode only) --------
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

  // Only ever lists days not yet played -- once a day is done it can't be
  // replayed, so it has nothing to offer here anymore and moves to the
  // archive list instead (see renderArchiveList() below). Doesn't preview
  // that day's actual place names (spoiler risk) -- numbered oldest ->
  // newest instead, while the list itself still shows newest first.
  function renderCatchupList() {
    const history = loadHistory(HISTORY_KEY);
    catchupListEl.innerHTML = "";
    const dates = catchupDateStrings();
    const windowSize = dates.length;
    const undone = dates.filter((dateStr) => !history[dateStr]);
    if (undone.length === 0) {
      const empty = document.createElement("p");
      empty.className = "catchup-panel-title";
      empty.textContent = "太棒了，過去的挑戰都補完了！";
      catchupListEl.appendChild(empty);
      return;
    }
    undone.forEach((dateStr) => {
      const i = dates.indexOf(dateStr);
      const item = document.createElement("button");
      item.type = "button";
      item.className = "catchup-item";
      const label = String(windowSize - i).padStart(3, "0");
      item.innerHTML =
        `<span class="catchup-date">${formatDisplayDate(dateStr)}</span>` +
        `<span class="catchup-summary">第 ${label} 組</span>` +
        `<span class="catchup-status">尚未挑戰</span>`;
      item.addEventListener("click", () => {
        activeDate = dateStr;
        enterDailyMode();
      });
      catchupListEl.appendChild(item);
    });
  }

  catchupBtn.addEventListener("click", () => {
    if (catchupPanel.hidden) {
      renderCatchupList();
      archivePanel.hidden = true;
    }
    catchupPanel.hidden = !catchupPanel.hidden;
  });
  catchupCloseBtn.addEventListener("click", () => {
    catchupPanel.hidden = true;
  });
  backToTodayBtn.addEventListener("click", () => {
    activeDate = null;
    enterDailyMode();
  });

  // ---- Archive: read-only score cards for every already-completed day
  // (daily mode only) ------------------------------------------------------
  function renderArchiveList() {
    const history = loadHistory(HISTORY_KEY);
    const dates = Object.keys(history).sort().reverse(); // newest first
    archiveListEl.innerHTML = "";
    if (dates.length === 0) {
      const empty = document.createElement("p");
      empty.className = "catchup-panel-title";
      empty.textContent = "還沒有完成過任何一天的挑戰喔！";
      archiveListEl.appendChild(empty);
      return;
    }
    const todayStr = getTaipeiDateString();
    dates.forEach((dateStr) => {
      const entry = history[dateStr];
      const item = document.createElement("button");
      item.type = "button";
      item.className = "catchup-item done";
      item.innerHTML =
        `<span class="catchup-date">${formatDisplayDate(dateStr)}</span>` +
        `<span class="catchup-summary">${dateStr === todayStr ? "今天" : ""}</span>` +
        `<span class="catchup-status">${entry.score}% (${entry.grade})</span>`;
      item.addEventListener("click", () => {
        activeDate = dateStr === todayStr ? null : dateStr;
        enterDailyMode();
      });
      archiveListEl.appendChild(item);
    });
  }

  archiveBtn.addEventListener("click", () => {
    if (archivePanel.hidden) {
      renderArchiveList();
      catchupPanel.hidden = true;
    }
    archivePanel.hidden = !archivePanel.hidden;
  });
  archiveCloseBtn.addEventListener("click", () => {
    archivePanel.hidden = true;
  });

  // ---- Special challenge: pick a pool, play its 10 riddles, replay anytime
  function renderSpecialPoolList() {
    specialPoolListEl.innerHTML = "";
    SPECIAL_POOLS.forEach((pool) => {
      const records = loadRecords(specialRecordsKey(pool.id));
      const bestText =
        records.attempts === 0
          ? "尚未挑戰"
          : `🏆 ${records.bestScore}% (${records.bestGrade})・已挑戰 ${records.attempts} 次`;
      const item = document.createElement("button");
      item.type = "button";
      item.className = "special-pool-item";
      item.innerHTML =
        `<span class="special-pool-title">${pool.title}</span>` +
        `<span class="special-pool-desc">${pool.description}</span>` +
        `<span class="special-pool-meta">${pool.questions.length} 題　${bestText}</span>`;
      item.addEventListener("click", () => startSpecialRound(pool.id));
      specialPoolListEl.appendChild(item);
    });
  }

  function enterSpecialPicker() {
    mode = "special";
    setActiveModeBtn();
    activeSpecialPoolId = null;
    activeDate = null; // has no meaning outside daily mode

    helpBtn.hidden = true;
    hintBarEl.hidden = true;
    wrap.hidden = true;
    tierPickerEl.hidden = true;
    feedbackEl.hidden = true;
    controlsEl.hidden = true;
    progressBarEl.hidden = true;
    questionEl.hidden = true; // whole #hint-bar is hidden here too, but keep this in sync regardless
    resultPanelEl.hidden = true;
    reviewControlsEl.hidden = true;
    catchupPanel.hidden = true;
    archivePanel.hidden = true;
    specialPoolPickerEl.hidden = false;
    bestScoreLine.hidden = true; // each pool card shows its own best instead
    updateToolsVisibility();
    renderSpecialPoolList();
  }

  function startSpecialRound(poolId) {
    activeSpecialPoolId = poolId;
    const pool = currentSpecialPool();
    mode = "special";
    setActiveModeBtn();
    maxUsesPerTier = 2;
    MAX_SCORE = TIER_POINTS_SUM * maxUsesPerTier;

    helpBtn.hidden = true;
    hintBarEl.hidden = false;
    wrap.hidden = false;
    specialPoolPickerEl.hidden = true;

    // Same fixed map framing as daily mode -- every special-pool landmark
    // already sits inside that box, so reusing it keeps the map's zoom/pan
    // identical between modes instead of jumping around on every switch.
    configureProjection(0, PLACENAME_POOL);

    resultPanelEl.hidden = true;
    reviewControlsEl.hidden = true;
    tierPickerEl.hidden = false;
    feedbackEl.hidden = false;
    controlsEl.hidden = false;
    progressBarEl.hidden = false;
    questionEl.hidden = true; // the question now lives in #progress-bar while actually playing
    viewingArchivedResult = false;
    isLegacyArchive = false;
    retrySpecialBtn.hidden = true;
    updateToolsVisibility();

    drawBackground();
    updateBestScoreDisplay(loadRecords(specialRecordsKey(poolId)));

    questions = shuffleArray(pool.questions);
    questionIndex = 0;
    tierUsesLeft = PLACENAME_CIRCLE_TIERS.map(() => maxUsesPerTier);
    results = [];
    startQuestion();
  }

  modeDailyBtn.addEventListener("click", () => {
    if (mode !== "daily") enterDailyMode();
  });
  modeSpecialBtn.addEventListener("click", () => {
    if (mode !== "special") enterSpecialPicker();
  });
  backToPoolListBtn.addEventListener("click", enterSpecialPicker);
  retrySpecialBtn.addEventListener("click", () => startSpecialRound(activeSpecialPoolId));

  // The question itself, plus "N/M + score so far", pinned to the
  // viewport top once the header scrolls past it -- on a long page (map/
  // tier-picker/controls all stack below) that's otherwise the only place
  // to see either without scrolling back up. This is now the ONE place
  // the current question is shown at all (the old #question label in
  // #hint-bar is repurposed for the archived/read-only "已完成挑戰"
  // status instead -- see showArchivedResult() -- and hidden the rest of
  // the time; the two are always shown in lockstep-opposite states).
  // Shown/hidden in lockstep with #tier-picker at every point that toggles
  // it (see enterDailyMode(), enterSpecialPicker(), startSpecialRound(),
  // renderResults()) -- i.e. only while actually answering, never on the
  // pool picker or the result panel (which already shows the real score).
  function updateProgressBar() {
    const q = questions[questionIndex];
    const dayLabel = mode === "daily" && activeDate ? `補玩 ${formatDisplayDate(activeDate)}・` : "";
    const icon = mode === "special" ? "🎯" : "📍";
    const prompt = q.question || q.name; // special-mode questions are a riddle; daily's IS the place name
    const scoreSoFar = results.reduce(
      (sum, r) => sum + (r.correct ? PLACENAME_CIRCLE_TIERS[r.tierIndex].points : 0),
      0
    );
    progressBarTextEl.textContent =
      `${icon} ${dayLabel}第 ${questionIndex + 1} 題／${questions.length}：${prompt}` + `　目前 ${scoreSoFar} 分`;
  }

  function startQuestion() {
    selectedTierIndex = null;
    circlePx = null;
    answered = false;
    feedbackEl.textContent = "";
    confirmBtn.hidden = true;
    nextBtn.hidden = true;
    drawCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    resultCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    renderTierButtons();
    updateProgressBar();
    // Explicit alongside the ResizeObserver set up above -- confirm/next
    // just went from possibly-shown back to both hidden, which changes
    // #action-dock's height, and a background/inactive tab can't be
    // relied on to deliver that observer's callback promptly.
    updateCanvasHeightBudget();
  }

  function renderTierButtons() {
    tierPickerEl.innerHTML = "";
    PLACENAME_CIRCLE_TIERS.forEach((tier, i) => {
      const usesLeft = tierUsesLeft[i];
      const used = usesLeft <= 0;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tier-btn" + (selectedTierIndex === i ? " selected" : "") + (used ? " used" : "");
      btn.textContent = `${tier.label}（${tier.points}分）`;
      // Only special mode's ×2 uses need a remaining-count badge -- daily
      // mode (still 1 use each) looks exactly as it always has. A small
      // corner badge instead of appending "×N" to the label itself, so the
      // label text stays identical between modes.
      if (maxUsesPerTier > 1) {
        const badge = document.createElement("span");
        badge.className = "tier-count-badge";
        badge.textContent = String(usesLeft);
        btn.appendChild(badge);
      }
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
    updateCanvasHeightBudget(); // #action-dock just grew by one button -- see startQuestion()'s call for why this isn't left to the ResizeObserver alone
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
      question: target.question,
      extra: target.extra,
      lon: target.lon,
      lat: target.lat,
      tierIndex: selectedTierIndex,
      correct,
      distanceKm,
    });
    tierUsesLeft[selectedTierIndex]--;
    answered = true;
    updateProgressBar(); // reflect this question's points immediately, not just on "next"

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
    // Special mode's question was a riddle, not the place name -- reveal
    // the answer in the feedback line. Daily mode already showed the name
    // as the question, so there's nothing to add there.
    const revealPrefix = target.question ? `「${target.name}」` : "";
    feedbackEl.textContent = correct
      ? `✅ ${revealPrefix}涵蓋成功！`
      : `❌ ${revealPrefix}沒涵蓋到，差了約 ${Math.round(distanceKm)} 公里`;
    confirmBtn.hidden = true;
    renderTierButtons();

    if (questionIndex < questions.length - 1) {
      nextBtn.hidden = false;
      updateCanvasHeightBudget(); // #action-dock's #controls button swapped confirm -> next
    } else if (mode === "daily") {
      finishChallenge(); // hides #action-dock entirely -- renderResults() inside it calls updateCanvasHeightBudget() itself
    } else {
      finishSpecialRound(); // same as above
    }
  });

  nextBtn.addEventListener("click", () => {
    questionIndex++;
    startQuestion();
  });

  function renderResults(totalPoints, pct, grade, message, isNewBest) {
    lastCardScore = { totalPoints, pct, grade };
    reviewShowAnswer = true; // fresh score panel -- start the review back on "show answer"
    scoreGradeEl.textContent = grade;
    scoreNumberEl.textContent = `${totalPoints} / ${MAX_SCORE} 分（${pct}%）`;
    scoreMessageEl.textContent =
      (isNewBest ? "🎉 新紀錄！ " : "") +
      message +
      (isLegacyArchive ? "（這次紀錄於功能升級前完成，只能顯示地名與總分，無法還原每題的作答結果）" : "");

    breakdownEl.innerHTML = "";
    results.forEach((r, i) => {
      const div = document.createElement("div");
      div.className = "analysis-line";
      const label = r.extra ? `${r.name}（${r.extra}）` : r.name;
      // r.correct is null for a reconstructed legacy entry (see
      // showArchivedResult()) -- the place name is known, but which tier
      // was picked and whether it landed never got recorded.
      if (r.correct === null) {
        div.textContent = `${i + 1}. ${label}`;
      } else {
        const tier = PLACENAME_CIRCLE_TIERS[r.tierIndex];
        div.textContent = r.correct
          ? `${i + 1}. ${label} — ✅ 用了「${tier.label}」，${tier.points} 分`
          : `${i + 1}. ${label} — ❌ 用了「${tier.label}」，差了約 ${Math.round(r.distanceKm)} 公里，0 分`;
      }
      breakdownEl.appendChild(div);
    });

    tierPickerEl.hidden = true;
    feedbackEl.hidden = true;
    controlsEl.hidden = true;
    progressBarEl.hidden = true;
    questionEl.hidden = false; // back to its archived-status role now that #progress-bar is hidden
    resultPanelEl.hidden = false;
    // #action-dock just collapsed to nothing (style.css hides it once
    // #tier-picker[hidden]) -- let the map immediately reclaim that space.
    updateCanvasHeightBudget();
    // Nothing to review when there isn't even a reconstructable place-name
    // list for this entry (shouldn't happen in practice -- questionsForDate()
    // always returns 5 -- but stays as a safety net).
    reviewBtn.hidden = results.length === 0;
    // Special mode is freely replayable -- daily mode's retry button was
    // removed outright (each day is one-shot), so this one only ever shows
    // here.
    retrySpecialBtn.hidden = mode !== "special";
  }

  // Same shape as the draw challenge's GRADE_MESSAGES but themed around
  // pinpointing place names on a visible map (geography/precision) rather
  // than freehand drawing accuracy. Reused as-is for special mode's riddle
  // questions too -- both are fundamentally "how well do you know Taiwan's
  // geography."
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

  // The result panel sits well below the fold (question/tools/map/tier-
  // picker all stack above it), so without this the player who just
  // answered the last question has no on-screen cue that they're actually
  // done -- they'd have to notice and scroll down themselves. Wrapped in
  // requestAnimationFrame so the layout pass from clearing `hidden` (inside
  // renderResults(), called just before this) has already happened -- same
  // pattern the draw game's own finishBtn handler uses for its result panel.
  function scrollToResultPanel() {
    requestAnimationFrame(() => {
      resultPanelEl.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // #question is only ever visible while #progress-bar is hidden (i.e. once
  // a round's actually finished) -- gives it something to show for a fresh
  // finish, same idea as showArchivedResult()'s "已完成挑戰" text for a
  // past one, so it's never just sitting there empty.
  function markQuestionDone() {
    const dayLabel = mode === "daily" && activeDate ? `補玩 ${formatDisplayDate(activeDate)}・` : "";
    const icon = mode === "special" ? "🎯" : "📍";
    questionEl.textContent = `${icon} ${dayLabel}已完成挑戰`;
  }

  function finishChallenge() {
    const { totalPoints, pct } = computeScore(results);
    const [grade, message] = gradeFor(pct, GRADE_MESSAGES);
    const { records, isNewBest } = recordAttempt(RECORDS_KEY, pct, grade);
    updateBestScoreDisplay(records);
    const targetDate = activeDate || getTaipeiDateString();
    // Stashes the full per-question results alongside score/grade so this
    // day's score card (and review map) can be redrawn later from the
    // archive without needing to be played again -- this is a one-shot
    // challenge, there's no retry to fall back on.
    recordHistoryEntry(HISTORY_KEY, targetDate, pct, grade, { totalPoints, results });
    markQuestionDone();
    renderResults(totalPoints, pct, grade, message, isNewBest);
    scrollToResultPanel();
  }

  // Special mode's counterpart to finishChallenge() -- no HISTORY_KEY/date
  // bookkeeping (there's no one-shot lock or archive to feed), just a
  // per-pool running best score, same pattern as the daily mode's overall
  // RECORDS_KEY.
  function finishSpecialRound() {
    const { totalPoints, pct } = computeScore(results);
    const [grade, message] = gradeFor(pct, GRADE_MESSAGES);
    const { records, isNewBest } = recordAttempt(specialRecordsKey(activeSpecialPoolId), pct, grade);
    updateBestScoreDisplay(records);
    markQuestionDone();
    renderResults(totalPoints, pct, grade, message, isNewBest);
    scrollToResultPanel();
  }

  // Nudges apart any two label boxes (centered at .x/.y, sized .w/.h) that
  // overlap -- a simple iterative pairwise separation, pushing each
  // colliding pair apart along whichever axis needs the smaller push.
  // With at most 10 points a round, this settles in well under the
  // iteration cap. Mutates `labels` in place.
  function resolveLabelCollisions(labels) {
    const padding = 3;
    for (let iter = 0; iter < 60; iter++) {
      let moved = false;
      for (let i = 0; i < labels.length; i++) {
        for (let j = i + 1; j < labels.length; j++) {
          const a = labels[i];
          const b = labels[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const overlapX = (a.w + b.w) / 2 + padding - Math.abs(dx);
          const overlapY = (a.h + b.h) / 2 + padding - Math.abs(dy);
          if (overlapX <= 0 || overlapY <= 0) continue;
          moved = true;
          if (overlapX < overlapY) {
            const push = (overlapX / 2) * (dx >= 0 ? 1 : -1);
            a.x += push;
            b.x -= push;
          } else {
            const push = (overlapY / 2) * (dy >= 0 ? 1 : -1);
            a.y += push;
            b.y -= push;
          }
        }
      }
      if (!moved) break;
    }
    // Keep every label on-canvas even after being pushed around.
    for (const l of labels) {
      l.x = Math.min(Math.max(l.x, l.w / 2 + 2), CANVAS_W - l.w / 2 - 2);
      l.y = Math.min(Math.max(l.y, l.h / 2 + 2), CANVAS_H - l.h / 2 - 2);
    }
  }

  // Draws every question from this round at its real location at once
  // (unlike the reveal during play, which only ever shows one at a time),
  // colored by whether that answer was correct -- lets the player see the
  // whole round's geography together after the fact. r.correct is null
  // for a reconstructed legacy entry (see showArchivedResult()) -- the
  // place is known but the outcome isn't, so those get a neutral amber
  // marker instead of a red/green verdict that would be a guess.
  //
  // Takes `ctx` rather than always drawing on resultCtx so buildScoreCard()
  // can reuse it to draw the same markers onto its own share-card canvas
  // (translated to sit under the card's map image) without disturbing
  // whatever's currently shown on screen.
  function drawReviewMarkers(ctx) {
    // Two passes: first work out where every label WANTS to sit (right by
    // its own dot) and where two adjacent ones actually collide, then
    // spread apart any that overlap. Dots draw first so every label -- even
    // a nudged one -- ends up on top of them, not the other way around.
    ctx.font = "bold 13px sans-serif"; // must match drawLabelPill()'s font for accurate width measurement
    const labels = results.map((r) => {
      const px = toCanvas(r.lon, r.lat);
      // Special mode entries carry a `question` (the riddle) alongside
      // `name` (the answer) -- reviewShowAnswer picks which one labels the
      // map. Daily entries have no `question`, so they always show name.
      const text = reviewShowAnswer || !r.question ? r.name : r.question;
      const naturalY = px.y < 40 ? px.y + 22 : px.y - 16;
      return {
        r,
        px,
        text,
        w: ctx.measureText(text).width + 16,
        h: 22,
        x: px.x,
        y: naturalY,
        naturalX: px.x,
        naturalY,
      };
    });
    resolveLabelCollisions(labels);

    for (const { r, px } of labels) {
      const color = r.correct === null ? "#ffb703" : r.correct ? "#2ecc71" : "#ff5252";
      ctx.beginPath();
      ctx.arc(px.x, px.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
    }

    for (const { r, px, x, y, naturalX, naturalY, text } of labels) {
      // If collision-avoidance nudged this label away from its natural
      // spot (compared to where it would sit with no other labels around),
      // a thin leader line keeps it obviously tied to its own dot.
      if (Math.hypot(x - naturalX, y - naturalY) > 4) {
        ctx.beginPath();
        ctx.moveTo(px.x, px.y);
        ctx.lineTo(x, y);
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      // The dot alone carries the correct/wrong color; only wrong labels
      // also turn red for extra emphasis -- red-vs-green text on a small
      // pill is a rough call for red-green color blindness, so correct
      // (and unknown-outcome) ones stay plain white rather than
      // green-on-black.
      const labelColor = r.correct === false ? "#ff5252" : "#ffffff";
      drawLabelPill(x, y, text, ctx, labelColor);
    }
  }

  function drawReview() {
    resultCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    drawReviewMarkers(resultCtx);
  }

  function updateReviewLegend() {
    reviewLegendEl.textContent = isLegacyArchive
      ? "📍 這次的地名位置（作答結果未記錄，無法標示對錯）"
      : "🟢 答對的地名　🔴 答錯的地名";
  }

  // Only special-mode results have a `question` field to toggle to --
  // hides the button entirely for a daily round (or a daily archive view),
  // where there'd be nothing to switch to.
  function updateReviewToggleVisibility() {
    reviewToggleLabelBtn.hidden = !results.some((r) => r.question);
    reviewToggleLabelBtn.textContent = reviewShowAnswer ? "🔤 顯示題目" : "🔤 顯示答案";
  }

  reviewToggleLabelBtn.addEventListener("click", () => {
    reviewShowAnswer = !reviewShowAnswer;
    reviewToggleLabelBtn.textContent = reviewShowAnswer ? "🔤 顯示題目" : "🔤 顯示答案";
    drawReview();
  });

  reviewBtn.addEventListener("click", () => {
    resultPanelEl.hidden = true;
    reviewControlsEl.hidden = false;
    updateReviewToggleVisibility();
    updateReviewLegend();
    drawReview();
  });
  reviewBackBtn.addEventListener("click", () => {
    reviewControlsEl.hidden = true;
    // A just-finished round's score panel shows a blank map until the
    // player clicks review again; an archived one keeps the review markers
    // up underneath it the whole time (see showArchivedResult), so redraw
    // rather than clear here.
    if (viewingArchivedResult) drawReview();
    else resultCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    resultPanelEl.hidden = false;
  });

  // Composites a shareable "score card" PNG: title, grade/score/message,
  // the map with review markers, and the per-question breakdown -- reads
  // whatever's currently on the score panel (results/scoreMessageEl/
  // breakdownEl), so it works identically for a just-finished round or an
  // archived one (including a reconstructed legacy entry's neutral markers
  // and name-only breakdown lines -- see showArchivedResult()) or a special
  // round.
  function buildScoreCard(totalPoints, pct, grade) {
    const margin = 28;
    const cardW = CANVAS_W + margin * 2;
    const contentW = cardW - margin * 2;
    const scratchH = CANVAS_H + 600;

    const scratch = document.createElement("canvas");
    scratch.width = cardW;
    scratch.height = scratchH;
    const ctx = scratch.getContext("2d");

    const grad = ctx.createLinearGradient(0, 0, 0, scratchH);
    grad.addColorStop(0, "#0b3d5c");
    grad.addColorStop(1, "#06263b");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cardW, scratchH);

    ctx.textAlign = "center";
    let y = margin;

    ctx.fillStyle = "rgba(234,246,255,0.85)";
    ctx.font = "bold 18px sans-serif";
    const pool = currentSpecialPool();
    const titleLabel =
      mode === "special"
        ? `🎯 特殊挑戰・${pool ? pool.title : ""}`
        : activeDate
        ? `📍 每日台灣地名挑戰・補玩 ${formatDisplayDate(activeDate)}`
        : "📍 每日台灣地名挑戰";
    ctx.fillText(titleLabel, cardW / 2, y + 18);
    y += 34;

    ctx.fillStyle = "#ffb703";
    ctx.font = "800 60px sans-serif";
    ctx.fillText(grade, cardW / 2, y + 50);
    y += 68;

    ctx.fillStyle = "#eaf6ff";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText(`${totalPoints} / ${MAX_SCORE} 分（${pct}%）`, cardW / 2, y + 20);
    y += 34;

    ctx.fillStyle = "rgba(234,246,255,0.85)";
    ctx.font = "15px sans-serif";
    y += wrapText(ctx, scoreMessageEl.textContent, cardW / 2, y + 16, contentW - 20, 20);
    y += 16;

    ctx.drawImage(bgCanvas, margin, y, CANVAS_W, CANVAS_H);
    ctx.save();
    ctx.translate(margin, y);
    drawReviewMarkers(ctx); // toCanvas() coords are relative to the map's own origin, not the card's
    ctx.restore();
    y += CANVAS_H + 20;

    ctx.fillStyle = "rgba(234,246,255,0.85)";
    ctx.font = "13px sans-serif";
    for (const line of [...breakdownEl.children].map((el) => el.textContent)) {
      y += wrapText(ctx, line, cardW / 2, y + 14, contentW - 20, 18);
      y += 4;
    }
    y += 12;

    ctx.fillStyle = "rgba(234,246,255,0.55)";
    ctx.font = "12px sans-serif";
    ctx.fillText("attsa222023.github.io/draw-TW/placename", cardW / 2, y + 12);
    y += 30;

    const finalCard = document.createElement("canvas");
    finalCard.width = cardW;
    finalCard.height = Math.ceil(y);
    finalCard.getContext("2d").drawImage(scratch, 0, 0);
    return finalCard;
  }

  shareCardBtn.addEventListener("click", () => {
    if (!lastCardScore) return;
    const { totalPoints, pct, grade } = lastCardScore;
    const card = buildScoreCard(totalPoints, pct, grade);
    if (mode === "special") {
      const pool = currentSpecialPool();
      const poolTitle = pool ? pool.title : "";
      const filename = `placename-special-${activeSpecialPoolId}-${pct}pct.png`;
      const shareText = `我在「特殊挑戰・${poolTitle}」拿到 ${pct}% (${grade})，你要不要也來試試？`;
      shareOrDownloadCard(card, filename, `特殊挑戰・${poolTitle}`, shareText);
    } else {
      const filename = `placename-taiwan-${pct}pct.png`;
      const shareText = `我在「每日台灣地名挑戰」拿到 ${pct}% (${grade})，你要不要也來試試？`;
      shareOrDownloadCard(card, filename, "每日台灣地名挑戰", shareText);
    }
  });

  enterDailyMode();
  // Belt-and-suspenders alongside the ResizeObserver above: sets the very
  // first --canvas-h-budget value right away instead of waiting on that
  // observer's own initial notification (which, being tied to the
  // rendering pipeline, isn't guaranteed to land before the first paint
  // a player actually sees).
  updateCanvasHeightBudget();
})();
