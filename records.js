// localStorage-backed high score tracking for the Draw Taiwan game.
// Kept as a small global (not an IIFE) so game.js can call it directly,
// same pattern as taiwan-data.js exposing TAIWAN_OUTLINE.
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
    return {
      bestScore: typeof parsed.bestScore === "number" ? parsed.bestScore : 0,
      bestGrade: parsed.bestGrade || null,
      attempts: typeof parsed.attempts === "number" ? parsed.attempts : 0,
    };
  } catch (e) {
    // localStorage unavailable (private browsing, disabled, corrupt value, etc.)
    return { bestScore: 0, bestGrade: null, attempts: 0 };
  }
}

// Records one finished attempt, updating the best score if beaten.
// Returns the updated records plus whether this attempt was a new best.
function recordAttempt(key, scorePct, grade) {
  const records = loadRecords(key);
  records.attempts += 1;
  const isNewBest = scorePct > records.bestScore;
  if (isNewBest) {
    records.bestScore = scorePct;
    records.bestGrade = grade;
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
function recordHistoryEntry(key, dateStr, scorePct, grade) {
  const history = loadHistory(key);
  const existing = history[dateStr];
  if (!existing || scorePct > existing.score) {
    history[dateStr] = { score: scorePct, grade };
    try {
      localStorage.setItem(key, JSON.stringify(history));
    } catch (e) {
      // history just won't persist this session
    }
  }
  return history;
}
