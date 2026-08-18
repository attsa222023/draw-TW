# 畫出台灣

A small canvas game: freehand-trace the outline of Taiwan's main island from
a hinted starting point (its northernmost tip) and a scale bar, then get
scored on how closely your shape overlaps the real coastline.

**Play it live: https://attsa222023.github.io/draw-TW/**

## How it works

- The map is anchored on Taiwan's northernmost point (marked on the canvas) with a 50 km scale bar for reference.
- Draw the island's outline with mouse or touch — you can lift and continue, points are stitched into one continuous path.
- Hit **完成** (Finish) to close the shape and score it: your drawing and the real coastline are rasterized onto the same grid and compared by intersection-over-union (IoU), so shape, proportion, and position all count.
- Results are graded S/A/B/C/D with a side-by-side overlay (green = real outline, red = your drawing).

## Files

- `index.html` / `style.css` — page markup and styling
- `taiwan-data.js` — Taiwan's main-island outline (406 points), simplified from [Natural Earth 10m admin-0 country boundaries](https://github.com/datasets/geo-countries) — excludes outlying islands (Penghu, Kinmen, Matsu, etc.)
- `game.js` — projection math, drawing interaction, and IoU-based scoring

## Running it locally

No dependencies or build step — open `index.html` directly in a browser, or serve the directory with any static file server:

```
npx serve .
```
