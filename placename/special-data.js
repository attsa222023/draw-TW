// Special-challenge question pools -- loaded before game.js, alongside
// data.js (which holds the daily challenge's own TAIWAN_COUNTIES/
// PLACENAME_POOL). Kept in its own file since this is a distinct, steadily-
// growing question set with a different shape than PLACENAME_POOL: each
// entry is a riddle ("最高的山") rather than a place name shown outright --
// the player has to know the answer (`name`) before they can locate it.
//
// Each pool must have exactly 10 questions (special mode always plays all
// 10, shuffled fresh each round -- see shuffleArray() in game.js). To add a
// new pool, just append another { id, title, description, questions } entry
// below; `id` must be unique and stable (it's used as a localStorage key
// suffix for that pool's best-score record, so renaming it later would
// silently reset that pool's recorded best).
//
// Coordinates were looked up individually (Wikipedia infoboxes where
// available) rather than guessed, since gameplay correctness depends on
// them. One exception: 大安溪倚天劍 (Taiwan's tallest tree) -- its exact
// GPS position isn't publicly disclosed (it's deep in remote, ecologically
// sensitive terrain), so its coordinates here are a best-effort estimate
// from the general area described in coverage of its discovery (near the
// Da'an River headwaters, west of Mt. Dabajian, elevation ~1,650m).
const SPECIAL_POOLS = [
  {
    id: "highest",
    title: "台灣最高",
    description: "台灣各種「最高」紀錄的所在地，你知道幾個？",
    questions: [
      { question: "最高的山", name: "玉山", extra: "3,952m", lon: 120.958486, lat: 23.488253 },
      { question: "高低差最大的瀑布", name: "蛟龍瀑布", extra: "846m", lon: 120.766083, lat: 23.553681 },
      { question: "最高的建築物", name: "台北101", extra: "508m", lon: 121.56444, lat: 25.03361 },
      { question: "最高的橋墩", name: "霧臺谷川大橋", extra: "99m", lon: 120.704694, lat: 22.747778 },
      { question: "最高的水壩", name: "德基水壩", extra: "180m", lon: 121.1675, lat: 24.25528 },
      { question: "最高的樹", name: "大安溪倚天劍", extra: "84.1m", lon: 121.15, lat: 24.43 },
      { question: "海拔最高的湖泊", name: "雪山翠池", extra: "3,520m", lon: 121.217694, lat: 24.385994 },
      { question: "海拔最高的公路隘口", name: "武嶺", extra: "3,275m", lon: 121.277111, lat: 24.136889 },
      { question: "海拔最高的火車站", name: "祝山車站", extra: "2,451m", lon: 120.823, lat: 23.51025 },
      { question: "海拔最高的學校", name: "香林國小", extra: "2,195m", lon: 120.808674, lat: 23.515991 },
    ],
  },
];
