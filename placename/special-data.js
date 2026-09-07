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
// as pool 2 below does. `note` is also optional -- a longer footnote
// (origin/context, a correction, etc.) shown under that question's line in
// the round-end breakdown only (never during play, and never on the
// shareable score card -- see renderResults()/buildScoreCard() in game.js).
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
      {
        question: "最高的樹",
        name: "大安溪倚天劍",
        extra: "84.1m",
        note: "目前已知臺灣及東亞第一高樹，為一棵巨大臺灣杉。",
        lon: 121.15,
        lat: 24.43,
      },
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
      {
        question: "傑哥不要",
        name: "基隆市",
        note:
          "《如果早知道男生也會被性侵》（俗稱「傑哥不要」）的主要拍攝地點位於基隆市。取景地點包括：暖暖高中、達華超商（買飲料的超商）、碇內公園（遇到淑惠阿姨的公園）、暖暖吊橋、新豐街一帶。",
        lon: 121.744553,
        lat: 25.131645,
      },
      {
        question: "出事了阿伯",
        name: "成功嶺",
        note: "「出事了阿伯」的發源地點位於台中市南屯區同安南巷（靠近成功嶺一帶的田間小路）。當事者是一名車速極快，常載役男往返營區的計程車司機。",
        lon: 120.600736,
        lat: 24.112617,
      },
      {
        question: "一定是大拇指的啦",
        name: "雙龍村",
        note:
          "源自公視節目《我們的島》，介紹南投信義鄉雙龍村的布農族文化時，村民 Dama Umi 在受訪談到村裡代表隊得到第三名時的回答。不過運動會地點其實在羅娜村。",
        lon: 121.092676,
        lat: 23.697529,
      },
      {
        question: "用生命在拍英文報告",
        name: "國立高雄科技大學",
        note: "又稱「勾北勾北」，影片的拍攝場景位於國立高雄科技大學建工校區後門。",
        lon: 120.32664,
        lat: 22.649114,
      },
      {
        question: "我的豆花30塊",
        name: "苗栗市府前路",
        note: "準確地點是苗栗縣政府旁，府前路與民族路路口。有人說豆花是在九鼎買的，也有人說是李記。",
        lon: 120.819156,
        lat: 24.561561,
      },
      { question: "YO！BATTLE", name: "台南新豐高中", lon: 120.295809, lat: 22.971863 },
      { question: "颱風就是要泛舟啊", name: "墾丁", lon: 120.797939, lat: 21.945357 },
      { question: "打到我的上巴", name: "苗栗泰安", lon: 120.976944, lat: 24.471944 },
      { question: "超大雙人床", name: "劍湖山飯店", lon: 120.577894, lat: 23.620083 },
      { question: "假如你生氣仰望耶穌", name: "大崗山自然生態園區", lon: 120.348583, lat: 22.860306 },
    ],
  },
  {
    id: "yokai",
    title: "台灣妖怪地圖",
    description: "這些流傳已久的妖怪傳說，你知道它們出沒在台灣哪裡嗎？",
    // `question` is just the yokai's own name (the "cultural reference" the
    // player needs to recognize, same role meme-sites' quotes play);
    // `name` is the legend's associated place, which is what actually gets
    // pinpointed; the full story goes in `note` instead of `question` --
    // showing a whole paragraph as the in-play prompt would make the sticky
    // progress bar (see style.css) far taller than any other pool's ever
    // gets, so it's kept as a round-end-only footnote like meme-sites'
    // 雙龍村 entry already does.
    //
    // Two coordinates here are best-effort estimates rather than an exact
    // address (same exception as pool 1's 大安溪倚天劍 above), since the
    // legend itself doesn't pin down a single point:
    // - 番婆鬼: the Kaxabu people's four historic settlements (眉溪四庄 --
    //   牛眠山/守城/大湳/蜈蚣崙) sit clustered just north of central Puli;
    //   this anchors roughly in the middle of that cluster.
    // - 雪山魔女: 黑森林 itself has no single official coordinate (it's an
    //   area along the main-peak trail, not a landmarked point), and
    //   369山莊's own coordinates aren't independently published anywhere
    //   checked either -- this estimates a point ~2km along the ridge
    //   trail from 雪山主峰's own verified coordinates (24.3834, 121.2318)
    //   toward Wuling, the approach direction both 369山莊 and 黑森林 sit
    //   along, rather than reusing the main peak's own exact spot.
    questions: [
      {
        question: "番婆鬼",
        name: "南投埔里鎮（噶哈巫族部落）",
        note:
          "傳說中會使用黑巫術的神秘女巫。深夜會將自己的眼睛挖出換上貓眼以在黑暗中視物，並以芭蕉葉插在腋下飛行，或化作火球移動。",
        lon: 120.98,
        lat: 23.978,
      },
      {
        question: "豬哥石",
        name: "新北市淡水區新興里",
        note:
          "早年傳說這顆巨石具有妖力、經常冒出瘴氣，路人若聞到煙味便會神祕失蹤。後來傳說巨石受到神明教化而轉趨向善，現今供奉於淡水的小廟「二號橋石頭公」內。",
        lon: 121.444271,
        lat: 25.182086,
      },
      {
        question: "黃衣小飛俠",
        name: "玉山南峰三岔路・排雲山莊",
        note: "身穿黃色衣服、在玉山山區出沒的神秘身影。",
        lon: 120.94975,
        lat: 23.466603,
      },
      {
        question: "紅衣小女孩",
        name: "台中・大坑風景區",
        note: "穿著紅衣的小女孩出現在山路上，遇見她的人往往會陷入恐怖的異象。",
        lon: 120.7511,
        lat: 24.1892,
      },
      {
        question: "烏鬼魚人",
        name: "屏東・小琉球烏鬼洞",
        note: "傳說烏鬼洞附近曾出現半人半魚的神秘生物。傳說其實是反映了十七世紀的小琉球原住民與荷蘭人之間的戰爭。",
        lon: 120.3557,
        lat: 22.33,
      },
      {
        question: "蘭潭水怪",
        name: "嘉義・蘭潭水庫",
        note: "蘭潭深處棲息著巨大魚精，也是台灣「人面魚」傳說的重要發源地。",
        lon: 120.47861,
        lat: 23.46972,
      },
      {
        question: "林投姐",
        name: "台南・民族路、西門路一帶",
        note: "含冤而死的女子化為厲鬼，徘徊於台南街頭尋找仇人。民族路、西門路一帶為傳說中林投姐的自殺地點。",
        lon: 120.200087,
        lat: 22.997513,
      },
      {
        question: "雪山魔女",
        name: "雪山主峰線・黑森林",
        note: "長髮白衣女子出沒於黑森林，會讓登山客在山林中迷失方向。",
        lon: 121.245,
        lat: 24.398,
      },
      {
        question: "幽靈船",
        name: "台中・衛爾康西餐廳舊址",
        note: "火災發生時，曾有人目擊一艘古代帆船漂浮於空中。",
        lon: 120.67,
        lat: 24.148,
      },
      {
        question: "寶藏巖鬼哭",
        name: "台北・寶藏巖",
        note: "傳說橫死在寶藏巖附近的人的靈魂每天晚上都會出來哭泣，直到有人為其祭祀才逐漸停止。",
        lon: 121.533347,
        lat: 25.0108,
      },
    ],
  },
];
