// Utilities shared by both pages in this project (the draw/challenge game
// at the repo root, and the placename challenge under /placename/) --
// projection math, date/day-index helpers, and the deterministic
// no-repeat-until-exhausted daily shuffle both daily modes are built on.
// Loaded after shared-outline.js (needs TAIWAN_OUTLINE) and before each
// page's own data.js/game.js.
//
// Kept as ordinary globals (not an IIFE), same pattern as the data files,
// so each page's own game.js can reference them directly. This file is
// intentionally duplicated nowhere else -- both pages load this exact
// copy, so a fix here fixes both at once.

// ---- Projection -----------------------------------------------------------
// Equirectangular projection with longitude scaled by cos(latitude) so
// shapes aren't east-west stretched. Anchored (for the underlying km math)
// at true north; rotation (the draw-challenge's "rotate" daily variant) is
// applied afterward, in pixel space, so it never has to touch this part.
const KM_PER_LAT = 110.574;
const KM_PER_PX = 0.45; // world scale: 1 canvas pixel = 0.45 km
const PAD = 50; // canvas padding around the shape, in pixels

function extremePoint(compare) {
  let best = TAIWAN_OUTLINE[0];
  for (const p of TAIWAN_OUTLINE) if (compare(p, best)) best = p;
  return { lon: best[0], lat: best[1] };
}
const northPoint = extremePoint((p, best) => p[1] > best[1]);

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

// ---- Day-based scheduling --------------------------------------------------
// Deterministic per-day picks, shared by both daily modes: today's variant
// (draw challenge) and today's 5 place names (placename challenge) are each
// built from a shuffled permutation of their own pool, seeded by a "cycle"
// number derived from the day index, so within one cycle nothing repeats
// and each new cycle gets an independently-reshuffled order. Each page's
// own game.js builds its own pool and cycle math on top of these.
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

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffledIndices(n, seed) {
  const arr = Array.from({ length: n }, (_, i) => i);
  const rand = mulberry32(seed);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Days since the Unix epoch for a "YYYY-MM-DD" string, and back again --
// both via Date.UTC/getUTC* (never the local browser timezone) so this is
// a pure calendar-date calculation, independent of the player's own
// timezone (the date string itself is already a Taipei calendar date).
function dateStringToDayIndex(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

function dayIndexToDateString(dayIndex) {
  const dt = new Date(dayIndex * 86400000);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Past `n` date strings, most recent (yesterday) first. Never includes
// today -- that's played via each page's own "today" entry point.
function pastDateStrings(n) {
  const todayIdx = dateStringToDayIndex(getTaipeiDateString());
  const out = [];
  for (let i = 1; i <= n; i++) out.push(dayIndexToDateString(todayIdx - i));
  return out;
}

function formatDisplayDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const weekday = new Intl.DateTimeFormat("zh-Hant", { weekday: "narrow", timeZone: "UTC" }).format(dt);
  return `${m}/${d} (${weekday})`;
}

// ---- Shared canvas helpers --------------------------------------------------
// Rounded-rect helper for a small pill background (behind river/mountain
// labels in the draw challenge, and behind the placename review screen's
// name labels), so text stays legible over the ocean gradient/wave texture.
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// `ctx`/`textColor` default to the river/mountain-overlay call sites'
// original behavior (background layer, white text); the placename review
// screen passes its own canvas/color explicitly (red for wrong answers).
function drawLabelPill(cx, cy, text, ctx, textColor) {
  textColor = textColor || "#ffffff";
  ctx.font = "bold 13px sans-serif";
  const w = ctx.measureText(text).width + 16;
  const h = 22;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  roundRectPath(ctx, cx - w / 2, cy - h / 2, w, h, 6);
  ctx.fill();
  ctx.fillStyle = textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, cy);
  ctx.textBaseline = "alphabetic"; // restore the default other draw calls assume
}

// Ocean gradient + wave texture, the base every mode's background canvas
// paints first.
function paintOceanBase(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#1c5d82");
  grad.addColorStop(1, "#0b3d5c");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 2;
  for (let y = 20; y < h; y += 34) {
    ctx.beginPath();
    for (let x = 0; x <= w; x += 10) {
      const wy = y + Math.sin((x + y) * 0.05) * 4;
      if (x === 0) ctx.moveTo(x, wy);
      else ctx.lineTo(x, wy);
    }
    ctx.stroke();
  }
}

// Draws `text` centered at `centerX`, wrapping character-by-character
// (fine for CJK, which has no word-boundary spaces) to fit `maxWidth`.
// Returns the total height consumed so callers can advance their cursor.
// Used by both pages' buildScoreCard() to lay out the shareable PNG.
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
// Photos -- and there's no direct way to hand it to another app. Where the
// Web Share API supports sharing files (iOS Safari, Android Chrome), use
// the native share sheet instead, so "save to Photos" / "send via LINE"
// etc. are one tap away. Falls back to a normal download wherever file
// sharing isn't available (most desktop browsers). `card` is a <canvas>;
// `title`/`text` are only used for the share sheet. Each page builds its
// own card image (different content) and just hands it to this to send.
function shareOrDownloadCard(card, filename, title, text) {
  card.toBlob((blob) => {
    if (!blob) return;

    const file = new File([blob], filename, { type: "image/png" });
    const canShareFile = typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });

    if (canShareFile) {
      navigator
        .share({ files: [file], title, text })
        .catch((err) => {
          if (err && err.name === "AbortError") return; // player cancelled the share sheet
          triggerFileDownload(blob, filename); // share failed for some other reason -- fall back
        });
      return;
    }

    triggerFileDownload(blob, filename);
  }, "image/png");
}

// ---- Shared grading ---------------------------------------------------------
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// `messagePool` is GRADE_MESSAGES (draw modes) or PLACENAME_GRADE_MESSAGES
// (placename challenge), each defined in that page's own game.js.
function gradeFor(scorePct, messagePool) {
  let grade;
  if (scorePct >= 90) grade = "S";
  else if (scorePct >= 75) grade = "A";
  else if (scorePct >= 55) grade = "B";
  else if (scorePct >= 35) grade = "C";
  else grade = "D";
  return [grade, pickRandom(messagePool[grade])];
}
