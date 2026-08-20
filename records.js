// localStorage-backed high score tracking for the Draw Taiwan game.
// Kept as a small global (not an IIFE) so game.js can call it directly,
// same pattern as taiwan-data.js exposing TAIWAN_OUTLINE.
//
// Takes a storage key so normal mode and daily-challenge mode (which has
// varying difficulty day to day, so its scores aren't comparable to normal
// mode's) can keep separate best-score tracks.
const RECORDS_KEY = "drawTaiwanRecords";
const CHALLENGE_RECORDS_KEY = "drawTaiwanChallengeRecords";

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
