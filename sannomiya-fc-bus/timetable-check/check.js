/* =========================================================
   KOBE SANNOMIYA FC
   公式時刻表 自動チェック

   目的：
   ・公式ページの「実際の時刻表」だけを取得
   ・前回取得した時刻表と比較
   ・ページデザインやお知らせ変更は無視
   ・timetable.js は変更しない

   監視対象
   ① 阪急バス
      日の峰1丁目 → 谷上駅
      158系統

   ② 神戸市営地下鉄
      谷上駅 → 三宮駅
      三宮駅 → 谷上駅

   ③ ポートライナー
      三宮 → 貿易センター
      貿易センター → 三宮

   ④ 神戸市バス
      谷上駅 → 神戸北町
      62系統

   ⑤ JR西日本
      三ノ宮 → 灘
      灘 → 三ノ宮
========================================================= */

const fs = require("fs");
const crypto = require("crypto");
const cheerio = require("cheerio");


/* =========================================================
   URL
========================================================= */

const URLS = {

  hankyu:
    "https://transfer-cloud.navitime.biz/hankyubus/courses?external-busstop=8564",

  subwayTanigami:
    "https://kotsu.city.kobe.lg.jp/subway/timetable1/tanigami/",

  subwaySannomiya:
    "https://kotsu.city.kobe.lg.jp/subway/timetable1/sannomiya/",

  cityBus62:
    "https://kotsu.city.kobe.lg.jp/bus/bus-stop-list/bus-836/",

  /* ポートライナー */
  portlinerSannomiya:
    "https://www.knt-liner.co.jp/station/timetable/sannomiya/",

  portlinerBoeki:
    "https://www.knt-liner.co.jp/station/timetable/boeki/",

  /* JR */
  jrSannomiya:
    "https://timetable.jr-odekake.net/station-timetable/2807012002",

  jrNada:
    "https://timetable.jr-odekake.net/station-timetable/2806012001"
};


/* =========================================================
   ファイル
========================================================= */

const SNAPSHOT_FILE =
  "sannomiya-fc-bus/timetable-check/snapshot.json";

const STATUS_FILE =
  "sannomiya-fc-bus/timetable-check/status.json";


/* =========================================================
   HTTP
========================================================= */

async function fetchHtml(url) {

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; KobeSannomiyaFC-TimetableChecker/1.0)"
    }
  });

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${url}`
    );
  }

  return await response.text();
}


/* =========================================================
   共通
========================================================= */

function normalize(text) {

  return String(text || "")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function hash(text) {

  return crypto
    .createHash("sha256")
    .update(text)
    .digest("hex");
}


/* =========================================================
   時刻データ
========================================================= */

function normalizeTimes(times) {

  return times
    .map(x => normalize(x))
    .filter(Boolean)
    .join(" ");
}


function makeTimetable(days) {

  return JSON.stringify(days);
}


/* =========================================================
   神戸市営地下鉄
========================================================= */

function extractSubway(html, directionText) {

  const $ = cheerio.load(html);

  const result = {
    weekday: {},
    holiday: {}
  };

  let foundDirection = false;
  let currentDay = null;
  let currentHour = null;

  $("body *").each((i, el) => {

    const text = normalize($(el).text());

    if (!text) return;

    if (text === directionText) {

      foundDirection = true;
      return;
    }

    if (!foundDirection) return;

    if (
      text === "平日" ||
      text === "土日・祝日"
    ) {

      currentDay =
        text === "平日"
          ? "weekday"
          : "holiday";

      return;
    }

    /*
     * 時刻表の「5」「6」「7」などの時間
     */
    if (/^(?:[0-9]|1[0-9]|2[0-3])$/.test(text)) {

      currentHour = text;

      if (currentDay) {

        if (!result[currentDay][currentHour]) {
          result[currentDay][currentHour] = [];
        }

      }

      return;
    }

    /*
     * 「18　41　51」のような時刻
     */
    if (
      currentDay &&
      currentHour &&
      /^[0-9０-９▼●\s　]+$/.test(text)
    ) {

      const times = text
        .replace(/[▼●]/g, "")
        .split(/[\s　]+/)
        .filter(Boolean);

      if (times.length) {

        result[currentDay][currentHour]
          .push(...times);

      }

    }

  });

  return result;
}


/* =========================================================
   神戸市バス 62系統
========================================================= */

function extractCityBus62(html) {

  const $ = cheerio.load(html);

  const result = {
    weekday: {},
    saturday: {},
    holiday: {}
  };

  /*
   * 62系統 神戸北町方面行き
   * の見出しを探す
   */

  let active = false;
  let day = null;
  let hour = null;

  $("body *").each((i, el) => {

    const text = normalize($(el).text());

    if (!text) return;

    if (
      text.includes("62系統") &&
      text.includes("神戸北町方面行き")
    ) {

      active = true;
      return;
    }

    if (!active) return;

    /*
     * 次の111系統に入ったら終了
     */
    if (
      text.includes("111系統")
    ) {

      active = false;
      return;
    }

    if (text === "平日") {
      day = "weekday";
      hour = null;
      return;
    }

    if (text === "土曜日") {
      day = "saturday";
      hour = null;
      return;
    }

    if (text === "日曜・祝日") {
      day = "holiday";
      hour = null;
      return;
    }

    const hourMatch =
      text.match(/^(\d{1,2})時$/);

    if (hourMatch) {

      hour = hourMatch[1];

      if (day) {

        if (!result[day][hour]) {
          result[day][hour] = [];
        }

      }

      return;
    }

    /*
     * 00
     * 00 30
     * 25
     * 12
     *
     * 急・○・☆などは時刻ではないので除去
     */

    if (
      day &&
      hour &&
      /^\d{1,2}(?:\s+\d{1,2})*$/.test(text)
    ) {

      const times =
        text.split(/\s+/);

      result[day][hour].push(...times);
    }

  });

  return result;
}


/* =========================================================
   阪急バス 158系統
========================================================= */

function extractHankyu158(html) {

  const $ = cheerio.load(html);

  /*
   * 日の峰1丁目ページのうち、
   * 「松が枝町（東向き）」側の
   * [158] 谷上駅だけを見る。
   */

  const bodyText = normalize(
    $("body").text()
  );

  /*
   * ページそのものが時刻表ではなく、
   * 乗り場案内の場合があるため、
   * まず158系統の存在を確認する。
   */

  if (
    !bodyText.includes("[158]") ||
    !bodyText.includes("終点:谷上駅")
  ) {

    throw new Error(
      "阪急バス158系統 谷上駅行きを確認できません"
    );
  }

  /*
   * 「時刻表」のリンクを探す。
   *
   * 現在のページ構造では複数の時刻表リンクが
   * 存在する可能性があるため、
   * 158系統・谷上駅に関連するリンクを優先する。
   */

  const links = [];

  $("a").each((i, el) => {

    const text = normalize($(el).text());
    const href = $(el).attr("href");

    if (!href) return;

    if (
      text.includes("時刻表") ||
      href.includes("timetable")
    ) {

      links.push({
        text,
        href
      });

    }

  });

  /*
   * 158の時刻表リンクが取得できない場合は、
   * 乗り場ページ自体をエラーにする。
   *
   * 勝手な時刻を生成することはしない。
   */

  const target =
    links.find(x =>
      x.text.includes("158")
    ) ||
    links.find(x =>
      x.href.includes("8564")
    );

  if (!target) {

    /*
     * 今回は「誤検出防止」を最優先する。
     */
    throw new Error(
      "阪急バス158系統の時刻表リンクを取得できません"
    );
  }

  /*
   * URLだけ返す。
   * 実際の時刻表取得は別処理で行う。
   */

  return {
    timetableUrl:
      new URL(target.href, URLS.hankyu).href
  };
}


/* =========================================================
   ポートライナー
   ※既存の抽出結果を壊さないため、
   ページ内の時刻表部分だけを取得
========================================================= */

function extractPortliner(html) {

  const $ = cheerio.load(html);

  const rows = [];

  $("table tr").each((i, tr) => {

    const cells = $(tr)
      .find("th,td")
      .map((i, el) =>
        normalize($(el).text())
      )
      .get()
      .filter(Boolean);

    if (!cells.length) return;

    /*
     * 時刻表行だけ
     */
    if (
      /^\d{1,2}$/.test(cells[0]) &&
      cells.length >= 2
    ) {

      rows.push(
        cells.join("|")
      );

    }

  });

  if (!rows.length) {

    throw new Error(
      "ポートライナー時刻表を取得できません"
    );
  }

  return rows.join("\n");
}


/* =========================================================
   JR
   ※既存の「時刻表テーブル」から
   実際の時刻だけを取得
========================================================= */

function extractJR(html) {

  const $ = cheerio.load(html);

  const rows = [];

  $("table tr").each((i, tr) => {

    const cells = $(tr)
      .find("th,td")
      .map((i, el) =>
        normalize($(el).text())
      )
      .get()
      .filter(Boolean);

    if (!cells.length) return;

    /*
     * 時刻表の時間行
     */
    if (
      /^\d{1,2}$/.test(cells[0]) &&
      cells.length >= 2
    ) {

      rows.push(
        cells.join("|")
      );

    }

  });

  if (!rows.length) {

    throw new Error(
      "JR時刻表を取得できません"
    );
  }

  return rows.join("\n");
}


/* =========================================================
   比較
========================================================= */

function compare(oldValue, newValue) {

  if (!oldValue) {

    return {
      status: "initial",
      changed: false
    };

  }

  if (oldValue === newValue) {

    return {
      status: "unchanged",
      changed: false
    };

  }

  return {
    status: "changed",
    changed: true
  };
}


/* =========================================================
   実行
========================================================= */

async function main() {

  console.log(
    "🔍 公式時刻表 自動チェック"
  );

  console.log(
    "最終チェック：" +
    new Date().toLocaleString(
      "ja-JP",
      { timeZone: "Asia/Tokyo" }
    )
  );


  /* -------------------------------------------------------
     既存snapshot
  ------------------------------------------------------- */

  let snapshot = {};

  if (fs.existsSync(SNAPSHOT_FILE)) {

    try {

      snapshot =
        JSON.parse(
          fs.readFileSync(
            SNAPSHOT_FILE,
            "utf8"
          )
        );

    } catch {

      snapshot = {};
    }

  }


  const newSnapshot = {};
  const status = [];


  /* =======================================================
     ① 阪急バス
  ======================================================= */

  try {

    const html =
      await fetchHtml(URLS.hankyu);

    const info =
      extractHankyu158(html);

    const timetableHtml =
      await fetchHtml(info.timetableUrl);

    const value =
      hash(
        normalize(
          cheerio.load(timetableHtml)("body").text()
        )
      );

    const key =
      "v2_hankyu_158_hinomine1_tanigami";

    newSnapshot[key] = value;

    const result =
      compare(snapshot[key], value);

    status.push({
      id: key,
      name: "阪急バス",
      route:
        "日の峰1丁目 → 谷上駅 158系統",
      status:
        result.changed
          ? "changed"
          : "unchanged",
      message:
        result.changed
          ? "時刻表変更を検出"
          : snapshot[key]
            ? "変更なし"
            : "初回登録"
    });

  } catch (e) {

    status.push({
      id: "v2_hankyu_158_hinomine1_tanigami",
      name: "阪急バス",
      route:
        "日の峰1丁目 → 谷上駅 158系統",
      status: "error",
      message:
        "確認エラー: " + e.message
    });

  }


  /* =======================================================
     ② 地下鉄 谷上 → 三宮
  ======================================================= */

  try {

    const html =
      await fetchHtml(
        URLS.subwayTanigami
      );

    const data =
      extractSubway(
        html,
        "新神戸・三宮・名谷・西神中央方面行"
      );

    const value =
      makeTimetable(data);

    const key =
      "v2_subway_tanigami_sannomiya";

    newSnapshot[key] = hash(value);

    const result =
      compare(
        snapshot[key],
        newSnapshot[key]
      );

    status.push({
      id: key,
      name: "神戸市営地下鉄",
      route:
        "谷上駅 → 三宮駅",
      status:
        result.changed
          ? "changed"
          : "unchanged",
      message:
        result.changed
          ? "時刻表変更を検出"
          : snapshot[key]
            ? "変更なし"
            : "初回登録"
    });

  } catch (e) {

    status.push({
      id: "v2_subway_tanigami_sannomiya",
      name: "神戸市営地下鉄",
      route:
        "谷上駅 → 三宮駅",
      status: "error",
      message:
        "確認エラー: " + e.message
    });

  }


  /* =======================================================
     ③ 地下鉄 三宮 → 谷上
  ======================================================= */

  try {

    const html =
      await fetchHtml(
        URLS.subwaySannomiya
      );

    const data =
      extractSubway(
        html,
        "新神戸・谷上方面行"
      );

    const value =
      makeTimetable(data);

    const key =
      "v2_subway_sannomiya_tanigami";

    newSnapshot[key] = hash(value);

    const result =
      compare(
        snapshot[key],
        newSnapshot[key]
      );

    status.push({
      id: key,
      name: "神戸市営地下鉄",
      route:
        "三宮駅 → 谷上駅",
      status:
        result.changed
          ? "changed"
          : "unchanged",
      message:
        result.changed
          ? "時刻表変更を検出"
          : snapshot[key]
            ? "変更なし"
            : "初回登録"
    });

  } catch (e) {

    status.push({
      id: "v2_subway_sannomiya_tanigami",
      name: "神戸市営地下鉄",
      route:
        "三宮駅 → 谷上駅",
      status: "error",
      message:
        "確認エラー: " + e.message
    });

  }


  /* =======================================================
     ④ 神戸市バス 62系統
  ======================================================= */

  try {

    const html =
      await fetchHtml(
        URLS.cityBus62
      );

    const data =
      extractCityBus62(html);

    const value =
      makeTimetable(data);

    const key =
      "v2_citybus_62_tanigami_kobekitamachi";

    newSnapshot[key] = hash(value);

    const result =
      compare(
        snapshot[key],
        newSnapshot[key]
      );

    status.push({
      id: key,
      name: "神戸市バス",
      route:
        "谷上駅 → 神戸北町 62系統",
      status:
        result.changed
          ? "changed"
          : "unchanged",
      message:
        result.changed
          ? "時刻表変更を検出"
          : snapshot[key]
            ? "変更なし"
            : "初回登録"
    });

  } catch (e) {

    status.push({
      id:
        "v2_citybus_62_tanigami_kobekitamachi",
      name: "神戸市バス",
      route:
        "谷上駅 → 神戸北町 62系統",
      status: "error",
      message:
        "確認エラー: " + e.message
    });

  }


  /* =======================================================
     ⑤ ポートライナー
  ======================================================= */

  const portliners = [

    {
      key:
        "v2_portliner_sannomiya_boeki",
      name:
        "ポートライナー",
      route:
        "三宮駅 → 貿易センター駅",
      url:
        URLS.portlinerSannomiya
    },

    {
      key:
        "v2_portliner_boeki_sannomiya",
      name:
        "ポートライナー",
      route:
        "貿易センター駅 → 三宮駅",
      url:
        URLS.portlinerBoeki
    }

  ];


  for (const item of portliners) {

    try {

      const html =
        await fetchHtml(item.url);

      const data =
        extractPortliner(html);

      const value =
        hash(data);

      newSnapshot[item.key] = value;

      const result =
        compare(
          snapshot[item.key],
          value
        );

      status.push({
        id: item.key,
        name: item.name,
        route: item.route,
        status:
          result.changed
            ? "changed"
            : "unchanged",
        message:
          result.changed
            ? "時刻表変更を検出"
            : snapshot[item.key]
              ? "変更なし"
              : "初回登録"
      });

    } catch (e) {

      status.push({
        id: item.key,
        name: item.name,
        route: item.route,
        status: "error",
        message:
          "確認エラー: " + e.message
      });

    }

  }


  /* =======================================================
     ⑥ JR
  ======================================================= */

  const jr = [

    {
      key:
        "v2_jr_sannomiya_nada",
      name:
        "JR西日本",
      route:
        "三ノ宮駅 → 灘駅",
      url:
        URLS.jrSannomiya
    },

    {
      key:
        "v2_jr_nada_sannomiya",
      name:
        "JR西日本",
      route:
        "灘駅 → 三ノ宮駅",
      url:
        URLS.jrNada
    }

  ];


  for (const item of jr) {

    try {

      const html =
        await fetchHtml(item.url);

      const data =
        extractJR(html);

      const value =
        hash(data);

      newSnapshot[item.key] = value;

      const result =
        compare(
          snapshot[item.key],
          value
        );

      status.push({
        id: item.key,
        name: item.name,
        route: item.route,
        status:
          result.changed
            ? "changed"
            : "unchanged",
        message:
          result.changed
            ? "時刻表変更を検出"
            : snapshot[item.key]
              ? "変更なし"
              : "初回登録"
      });

    } catch (e) {

      status.push({
        id: item.key,
        name: item.name,
        route: item.route,
        status: "error",
        message:
          "確認エラー: " + e.message
      });

    }

  }


  /* =======================================================
     保存
  ======================================================= */

  fs.writeFileSync(
    SNAPSHOT_FILE,
    JSON.stringify(
      newSnapshot,
      null,
      2
    )
  );

  fs.writeFileSync(
    STATUS_FILE,
    JSON.stringify(
      {
        checkedAt:
          new Date().toISOString(),
        services: status
      },
      null,
      2
    )
  );


  /* =======================================================
     コンソール表示
  ======================================================= */

  console.log("");

  for (const item of status) {

    const icon =
      item.status === "changed"
        ? "🔴"
        : item.status === "error"
          ? "⚠️"
          : "🟢";

    console.log(
      `${icon} ${item.name} ${item.route}`
    );

    console.log(
      `   ${item.message}`
    );

  }

  console.log("");

  console.log(
    "※ 公式時刻表の実データのみを比較しています。"
  );

}


main().catch(error => {

  console.error(error);

  process.exit(1);

});
