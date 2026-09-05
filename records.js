// localStorage-backed high score tracking, shared by both the draw game
// (repo root) and the placename challenge (/placename/) -- both pages
// load this exact file directly. Kept as a small global (not an IIFE) so
// each page's own game.js can call it directly, same pattern as
// shared-outline.js exposing TAIWAN_OUTLINE.
//
// Takes a storage key so normal mode and daily-challenge mode (which has
// varying difficulty day to day, so its scores aren't comparable to normal
// mode's) can keep separate best-score tracks.
const RECORDS_KEY = "drawTaiwanRecords";
const CHALLENGE_RECORDS_KEY = "drawTaiwanChallengeRecords";
// Per-date daily-challenge results ({ "YYYY-MM-DD": {score, grade} }), used
// by each mode's catch-up picker to show which past days have already been
// played. Separate from each mode's own single running best-score record.
const CHALLENGE_HISTORY_KEY = "drawTaiwanChallengeHistory";
const PLACENAME_HISTORY_KEY = "drawTaiwanPlacenameHistory";

function loadRecords(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { bestScore: 0, bestGrade: null, attempts: 0 };
    const parsed = JSON.parse(raw);
    const records = {
      bestScore: typeof parsed.bestScore === "number" ? parsed.bestScore : 0,
      bestGrade: parsed.bestGrade || null,
      attempts: typeof parsed.attempts === "number" ? parsed.attempts : 0,
    };
    // Passes through any other stored fields verbatim (unvalidated, unlike
    // the three above) -- e.g. the placename challenge's special mode
    // stashes bestResults/bestTotalPoints here via recordAttempt()'s own
    // `extra` param, so a pool's best attempt can be reviewed again later
    // without needing to have been played again. Every other caller just
    // never wrote any such field, so this is a no-op for them.
    for (const k of Object.keys(parsed)) {
      if (!(k in records)) records[k] = parsed[k];
    }
    return records;
  } catch (e) {
    // localStorage unavailable (private browsing, disabled, corrupt value, etc.)
    return { bestScore: 0, bestGrade: null, attempts: 0 };
  }
}

// Records one finished attempt, updating the best score if beaten.
// Returns the updated records plus whether this attempt was a new best.
//
// `extra` is an optional plain object merged into the stored record
// alongside {bestScore, bestGrade} whenever THIS attempt becomes the new
// best (same idea as recordHistoryEntry()'s own `extra` param below) --
// used by the placename challenge's special mode to also stash the full
// per-question results of the best attempt. Every other caller leaves
// this out and is unaffected.
function recordAttempt(key, scorePct, grade, extra) {
  const records = loadRecords(key);
  const isFirstAttempt = records.attempts === 0;
  records.attempts += 1;
  // The very first attempt is always "the best so far" even at 0% --
  // `scorePct > records.bestScore` alone misses that case, since bestScore
  // also starts at 0, and would otherwise leave bestGrade stuck at null.
  const isNewBest = isFirstAttempt || scorePct > records.bestScore;
  if (isNewBest) {
    records.bestScore = scorePct;
    records.bestGrade = grade;
    if (extra) Object.assign(records, extra);
  }
  try {
    localStorage.setItem(key, JSON.stringify(records));
  } catch (e) {
    // score just won't persist this session
  }
  return { records, isNewBest };
}

function loadHistory(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

// Records this player's result for a specific daily-challenge date (not
// necessarily today -- a catch-up replay of a missed day records under
// that day's own date instead). Keeps the best score/grade per date, same
// "best sticks" rule as recordAttempt()'s running best. `key` picks which
// mode's history this belongs to (CHALLENGE_HISTORY_KEY/PLACENAME_HISTORY_KEY).
//
// `extra` is an optional plain object merged into the stored entry
// alongside {score, grade} -- used by the placename challenge's archive
// feature to also stash that day's full per-question results (so a past
// day's score card can be redrawn later without needing to have been
// played again). The draw challenge doesn't pass this and is unaffected.
function recordHistoryEntry(key, dateStr, scorePct, grade, extra) {
  const history = loadHistory(key);
  const existing = history[dateStr];
  if (!existing || scorePct > existing.score) {
    history[dateStr] = Object.assign({ score: scorePct, grade }, extra || {});
    try {
      localStorage.setItem(key, JSON.stringify(history));
    } catch (e) {
      // history just won't persist this session
    }
  }
  return history;
}
