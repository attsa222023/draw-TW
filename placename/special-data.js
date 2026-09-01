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
// them. `extra` (a short stat shown alongside the answer once revealed) is
// optional -- omit it entirely for a question with no natural stat to show,
// as pool 2 below does.
const SPECIAL_POOLS = [
  {
    id: "highest",
    title: "台灣最高",
    description: "台灣各種「最高」紀錄的所在地，你知道幾個？",
    // One exception on the "looked up, not guessed" coordinates rule:
    // 大安溪倚天劍 (Taiwan's tallest tree) -- its exact GPS position isn't
    // publicly disclosed (it's deep in remote, ecologically sensitive
    // terrain), so its coordinates here are a best-effort estimate from the
    // general area described in coverage of its discovery (near the Da'an
    // River headwaters, west of Mt. Dabajian, elevation ~1,650m).
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
  {
    id: "meme-sites",
    title: "台灣迷因聖地",
    description: "這些爆紅迷因你都聽過嗎？知道發生在台灣哪裡嗎？",
    // A couple of these are areas/streets rather than a single building, so
    // the coordinate is a reasonable anchor point within them rather than
    // an exact address: 苗栗市府前路 uses 苗栗市公所 (which sits on that
    // road); 苗栗泰安 uses 泰安溫泉 (the area's well-known landmark).
    questions: [
      { question: "傑哥不要", name: "基隆市", lon: 121.744553, lat: 25.131645 },
      { question: "出事了阿伯", name: "成功嶺", lon: 120.600736, lat: 24.112617 },
      { question: "一定是大拇指的啦", name: "雙龍村", lon: 121.092676, lat: 23.697529 },
      { question: "用生命在拍英文報告", name: "國立高雄科技大學", lon: 120.32664, lat: 22.649114 },
      { question: "我的豆花30塊", name: "苗栗市府前路", lon: 120.819156, lat: 24.561561 },
      { question: "YO！BATTLE", name: "台南新豐高中", lon: 120.295809, lat: 22.971863 },
      { question: "颱風就是要泛舟啊", name: "墾丁", lon: 120.797939, lat: 21.945357 },
      { question: "打到我的上巴", name: "苗栗泰安", lon: 120.976944, lat: 24.471944 },
      { question: "超大雙人床", name: "劍湖山飯店", lon: 120.577894, lat: 23.620083 },
      { question: "假如你生氣仰望耶穌", name: "大崗山自然生態園區", lon: 120.348583, lat: 22.860306 },
    ],
  },
];
