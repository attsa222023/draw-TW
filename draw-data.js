// Major cities' downtown coordinates, used to check whether the player's
// drawing actually covers them ("did Taichung sink into the sea?"), and as
// daily-challenge reference points. Roughly ordered clockwise from the north.
//
// Whether each one gets framed as a boundary "起點" vs. an internal "參考點"
// isn't stored here -- game.js computes it from actual distance to
// TAIWAN_OUTLINE vs. the marker's own rendered radius, so a point only
// counts as "起點" if its marker would actually touch the coastline once
// drawn, not just be "somewhat close" by an arbitrary km cutoff.
const TAIWAN_CITIES = [
  { name: "基隆市", lon: 121.7392, lat: 25.1276 },
  { name: "台北市", lon: 121.5654, lat: 25.033 },
  { name: "花蓮市", lon: 121.6068, lat: 23.9871 },
  { name: "台東市", lon: 121.1444, lat: 22.7583 },
  { name: "高雄市", lon: 120.302, lat: 22.6273 },
  { name: "屏東市", lon: 120.4818, lat: 22.6759 },
  { name: "台南市", lon: 120.2513, lat: 22.9908 },
  { name: "嘉義市", lon: 120.4473, lat: 23.4801 },
  { name: "台中市", lon: 120.6736, lat: 24.1626 },
  { name: "新竹市", lon: 120.9647, lat: 24.8138 },
];

// Well-known towns/ports/peaks/lakes/offshore islands, used only to add
// variety to daily-challenge anchor points (not part of the sunk-city check
// above -- that's meant to stay a "major cities" joke, not get diluted by
// names most players won't immediately recognize).
//
// Same as TAIWAN_CITIES, "起點" vs "參考點" is computed in game.js from
// actual rendered distance to the coastline, not stored here -- inland
// peaks/lakes and offshore islands alike naturally end up "參考點" since
// neither sits on the mainland coastline being traced, regardless of which
// direction (inward or out to sea) they're off in.
//
// Offshore points can fall outside the outline's own bounding box --
// configureProjection()'s `extraPoints` grows the canvas just enough to
// fit whichever one is active that day (e.g. 蘭嶼 is ~68km out).
const TAIWAN_LANDMARKS = [
  { name: "淡水", lon: 121.4394, lat: 25.1687 },
  { name: "白沙屯", lon: 120.6847, lat: 24.6296 },
  { name: "台中港", lon: 120.5236, lat: 24.2823 },
  { name: "鹿港", lon: 120.4342, lat: 24.0565 },
  { name: "蘇澳", lon: 121.8544, lat: 24.5958 },
  { name: "野柳", lon: 121.6897, lat: 25.2058 },
  { name: "金山", lon: 121.6367, lat: 25.2219 },
  { name: "福隆", lon: 121.9436, lat: 25.0169 },
  { name: "通霄", lon: 120.6789, lat: 24.4897 },
  { name: "布袋", lon: 120.1591, lat: 23.3808 },
  { name: "安平", lon: 120.1611, lat: 22.9958 },
  { name: "東港", lon: 120.45, lat: 22.4667 },
  { name: "墾丁", lon: 120.7972, lat: 21.9469 },
  { name: "三仙台", lon: 121.4067, lat: 23.1275 },
  { name: "石梯坪", lon: 121.4736, lat: 23.3567 },
  { name: "太魯閣", lon: 121.6215, lat: 24.1591 },
  { name: "九份", lon: 121.8447, lat: 25.1097 },
  { name: "台北101", lon: 121.5645, lat: 25.0339 },
  { name: "玉山主峰", lon: 120.9598, lat: 23.4707 },
  { name: "日月潭", lon: 120.915, lat: 23.8514 },
  { name: "故宮南院", lon: 120.3193, lat: 23.4495 },
  { name: "合歡山", lon: 121.2792, lat: 24.1419 },
  { name: "阿里山", lon: 120.8022, lat: 23.509 },
  { name: "石門水庫", lon: 121.2333, lat: 24.8025 },
  { name: "龜山島", lon: 121.9203, lat: 24.8378 },
  { name: "小琉球", lon: 120.3778, lat: 22.3499 },
  { name: "綠島", lon: 121.4906, lat: 22.6602 },
  { name: "蘭嶼", lon: 121.5502, lat: 22.0457 },
  { name: "陽明山", lon: 121.5597, lat: 25.1633 },
  { name: "礁溪", lon: 121.7717, lat: 24.8283 },
  { name: "知本", lon: 121.0378, lat: 22.705 },
  { name: "恆春", lon: 120.7444, lat: 22.0025 },
  { name: "三峽", lon: 121.3686, lat: 24.9342 },
  { name: "內灣", lon: 121.1583, lat: 24.6874 },
  { name: "集集", lon: 120.7847, lat: 23.8275 },
  { name: "北港朝天宮", lon: 120.3033, lat: 23.5686 },
  { name: "桃園機場", lon: 121.2342, lat: 25.0797 },
  { name: "曾文水庫", lon: 120.4333, lat: 23.2167 },
];

// Major rivers, drawn as a blue line tracing their approximate course
// (rough waypoints from upstream to river mouth -- a visual/educational
// reference only, not surveyed data, and not used for scoring). Several
// mouths and sources deliberately land near an existing point above (e.g.
// 濁水溪 passes right by 集集, 曾文溪 ends near 曾文水庫 and 最西端),
// which is a real geographic relationship, not a coincidence.
const TAIWAN_RIVERS = [
  {
    name: "淡水河",
    path: [
      [121.369, 24.934], // 大漢溪 upstream, near 三峽
      [121.463, 25.045], // 大漢溪/新店溪 confluence near 江子翠
      [121.51, 25.063], // 大稻埕
      [121.466, 25.128], // 關渡 (joins 基隆河)
      [121.421, 25.17], // river mouth at 淡水
    ],
  },
  {
    name: "濁水溪",
    path: [
      [121.279, 24.142], // near 合歡山
      [121.15, 24.05],
      [120.785, 23.828], // passes 集集
      [120.47, 23.79], // 西螺
      [120.15, 23.82], // river mouth near 麥寮/芳苑
    ],
  },
  {
    name: "高屏溪",
    path: [
      [120.96, 23.35], // near 玉山
      [120.63, 23.03], // 甲仙/杉林
      [120.51, 22.85], // 美濃/旗山
      [120.43, 22.75], // 大樹
      [120.4, 22.48], // river mouth near 林園
    ],
  },
  {
    name: "曾文溪",
    path: [
      [120.8, 23.45], // near 阿里山
      [120.433, 23.217], // 曾文水庫
      [120.25, 23.18], // 麻豆/西港
      [120.05, 23.12], // river mouth near 國聖港
    ],
  },
  {
    name: "秀姑巒溪",
    path: [
      [121.2, 23.35], // central mountains, near 玉里 upstream
      [121.36, 23.5], // 瑞穗
      [121.42, 23.45], // 奇美
      [121.475, 23.478], // river mouth near 長虹橋/石梯坪
    ],
  },
];

// Major mountain ranges, drawn as a row of ⛰️ along their spine (rough
// waypoints, north to south -- visual reference only, not surveyed).
const TAIWAN_MOUNTAIN_RANGES = [
  {
    name: "中央山脈",
    path: [
      [121.45, 24.35], // near 太魯閣
      [121.28, 24.14], // 合歡山
      [121.05, 23.65],
      [120.95, 23.15],
      [120.75, 22.65], // near 恆春 uplands
    ],
  },
  {
    name: "雪山山脈",
    path: [
      [121.35, 24.55],
      [121.22, 24.38], // 雪山主峰一帶
      [121.05, 24.1],
    ],
  },
  {
    name: "玉山山脈",
    path: [
      [121.05, 23.65],
      [120.96, 23.47], // 玉山主峰
      [120.85, 23.2],
    ],
  },
  {
    name: "阿里山山脈",
    path: [
      [120.85, 23.75],
      [120.8, 23.51], // 阿里山
      [120.7, 23.25],
    ],
  },
  {
    name: "海岸山脈",
    path: [
      [121.5, 23.55], // near 石梯坪
      [121.41, 23.13], // 三仙台一帶
      [121.05, 22.75], // near 知本
    ],
  },
];

// Reference areas (km²) for turning a raw area difference into something
// tangible ("相當於 N 個台北市"), sorted ascending so the nearest-by-ratio
// match reads naturally regardless of magnitude.
const REFERENCE_AREAS = [
  { name: "嘉義市", area: 60 },
  { name: "新竹市", area: 104 },
  { name: "基隆市", area: 133 },
  { name: "台北市", area: 272 },
  { name: "桃園市", area: 1221 },
  { name: "新北市", area: 2053 },
  { name: "台南市", area: 2192 },
  { name: "台中市", area: 2215 },
  { name: "高雄市", area: 2952 },
  { name: "花蓮縣", area: 4629 },
  { name: "整個台灣本島", area: 35808 },
];
