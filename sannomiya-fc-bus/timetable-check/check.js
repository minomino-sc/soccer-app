/* =========================================================
   KOBE SANNOMIYA FC
   公式時刻表 自動チェック

   ・公式ページの実際の時刻だけを比較
   ・ページ全体のHTMLは比較しない
   ・お知らせ、更新日、デザイン変更は無視
   ・timetable.js は変更しない

   監視対象

   ① 阪急バス
      日の峰1丁目 → 谷上駅
      158系統

   ② 神戸市営地下鉄
      谷上駅 → 三宮駅
      三宮駅 → 谷上駅

   ③ ポートライナー
      三宮駅 → 貿易センター駅
      貿易センター駅 → 三宮駅

   ④ 神戸市バス
      谷上駅 → 神戸北町
      62系統のみ

   ⑤ JR西日本
      三ノ宮駅 → 灘駅
      灘駅 → 三ノ宮駅
========================================================= */

const fs = require("fs");
const crypto = require("crypto");
const cheerio = require("cheerio");


/* =========================================================
   URL
========================================================= */

const URLS = {

  hankyu:
    "https://transfer-cloud.navitime.biz/hankyubus/courses/timetables?busstop=00021667&timetable-id=856401",

  subwayTanigami:
    "https://kotsu.city.kobe.lg.jp/subway/timetable1/tanigami/",

  subwaySannomiya:
    "https://kotsu.city.kobe.lg.jp/subway/timetable1/sannomiya/",

  cityBus62:
    "https://kotsu.city.kobe.lg.jp/bus/bus-stop-list/bus-836/",

  portlinerSannomiya:
    "https://www.knt-liner.co.jp/stationp01/",

  portlinerBoeki:
    "https://www.knt-liner.co.jp/stationp02/",

  jrSannomiya:
    "https://timetable.jr-odekake.net/station-timetable/2807012002",

  jrNada:
    "https://timetable.jr-odekake.net/station-timetable/2806012001"
};


/* =========================================================
   ファイル
========================================================= */

const BASE =
  "sannomiya-fc-bus/timetable-check";

const SNAPSHOT_FILE =
  `${BASE}/snapshot.json`;

const STATUS_FILE =
  `${BASE}/status.json`;


/* =========================================================
   HTTP
========================================================= */

async function fetchHtml(url) {

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; KobeSannomiyaFC-TimetableChecker/2.0)"
    }
  });

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}`
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


function now() {

  return new Date().toISOString();
}


/* =========================================================
   HTML → 行
   表の行・セルを壊さないようにする
========================================================= */

function htmlToLines(html) {

  return html
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<\/button>/gi, "\n")
    .replace(/<\/td>/gi, " | ")
    .replace(/<\/th>/gi, " | ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&gt;/gi, ">")
    .replace(/&lt;/gi, "<")
    .replace(/&amp;/gi, "&")
    .split("\n")
    .map(normalize)
    .filter(Boolean);
}


/* =========================================================
   時刻行

   例
   5 | 18 41 51
   6 | 02 10 18
========================================================= */

function parseHourRow(line) {

  const m =
    line.match(
      /^(\d{1,2})\s*\|\s*(.*)$/
    );

  if (!m) return null;

  const hour =
    Number(m[1]);

  if (hour < 0 || hour > 24) {
    return null;
  }

  const minutes =
    m[2]
      .replace(/[●▼北中計京西加松高四野塩草浜米須神姫網上赤豊香鳥倉◆◇☆快特新]/g, " ")
      .match(/\d{1,2}/g) || [];

  return {
    hour,
    minutes: minutes
      .map(x => x.padStart(2, "0"))
      .filter(x => Number(x) >= 0 && Number(x) <= 59)
  };
}


/* =========================================================
   時刻表を正規化
========================================================= */

function timetableString(data) {

  return JSON.stringify(
    data,
    Object.keys(data).sort()
  );
}


/* =========================================================
   地下鉄

   公式ページは

   平日
   5 | ...
   6 | ...

   土日・祝日
   5 | ...
   6 | ...

   の構造になっている。
========================================================= */

function extractSubway(
  html,
  direction
) {

  const lines =
    htmlToLines(html);

  const start =
    lines.findIndex(
      x => x.includes(direction)
    );

  if (start < 0) {
    throw new Error(
      `方向「${direction}」が見つかりません`
    );
  }

  const result = {
    weekday: {},
    holiday: {}
  };

  let day = null;

  for (
    let i = start + 1;
    i < lines.length;
    i++
  ) {

    const line = lines[i];

    /*
     * 次の方向に入ったら終了
     */
    if (
      i > start + 5 &&
      (
        line.includes("方面行") &&
        !line.includes(direction)
      )
    ) {
      break;
    }

    if (line === "平日") {
      day = "weekday";
      continue;
    }

    if (
      line === "土日・祝日"
    ) {
      day = "holiday";
      continue;
    }

    if (
      line.includes("PDF版時刻表")
    ) {
      continue;
    }

    const row =
      parseHourRow(line);

    if (
      row &&
      day
    ) {

      result[day][row.hour] =
        row.minutes;
    }

    /*
     * 23時または0時まで取得した後、
     * 備考に入ったら終了
     */
    if (
      day === "holiday" &&
      line.includes("無印：")
    ) {
      break;
    }
  }

  if (
    !Object.keys(result.weekday).length ||
    !Object.keys(result.holiday).length
  ) {

    throw new Error(
      "地下鉄時刻表を取得できません"
    );
  }

  return result;
}


/* =========================================================
   神戸市バス 62系統

   62系統のセクションだけを取得。
   111系統には入らない。
========================================================= */

function extractCityBus62(html) {

  const lines =
    htmlToLines(html);

  const start =
    lines.findIndex(
      x =>
        x.includes("62系統") &&
        x.includes("神戸北町方面行き")
    );

  if (start < 0) {
    throw new Error(
      "62系統 神戸北町方面行きが見つかりません"
    );
  }

  const result = {
    weekday: {},
    saturday: {},
    holiday: {}
  };

  let day = null;
  let hour = null;

  for (
    let i = start + 1;
    i < lines.length;
    i++
  ) {

    const line = lines[i];

    /*
     * 111系統に入ったら完全終了
     */
    if (
      line.includes("111系統")
    ) {
      break;
    }

    if (
      line === "平日"
    ) {
      day = "weekday";
      hour = null;
      continue;
    }

    if (
      line === "土曜日"
    ) {
      day = "saturday";
      hour = null;
      continue;
    }

    if (
      line === "日曜・祝日"
    ) {
      day = "holiday";
      hour = null;
      continue;
    }

    /*
     * 5時、6時、7時
     */
    const hourMatch =
      line.match(/^(\d{1,2})時$/);

    if (hourMatch) {

      hour =
        Number(hourMatch[1]);

      if (
        day &&
        !result[day][hour]
      ) {
        result[day][hour] = [];
      }

      continue;
    }

    /*
     * 00○
     * 30○
     * 25☆急
     *
     * などから「分」だけ取得
     */
    if (
      day &&
      hour !== null
    ) {

      const minuteMatch =
        line.match(/^(\d{1,2})(?:\D.*)?$/);

      if (minuteMatch) {

        const minute =
          Number(minuteMatch[1]);

        if (
          minute >= 0 &&
          minute <= 59
        ) {

          result[day][hour].push(
            String(minute).padStart(2, "0")
          );
        }
      }
    }
  }

  if (
    !Object.keys(result.weekday).length ||
    !Object.keys(result.saturday).length ||
    !Object.keys(result.holiday).length
  ) {

    throw new Error(
      "62系統の3種類の時刻表を取得できません"
    );
  }

  return result;
}


/* =========================================================
   阪急バス 158系統

   専用時刻表ページを直接取得する。

   表の構造：

   時 | [158] | [150]
   8 | 47 | ...
   9 | 16 58 | ...

   平日と土休日の2表。
========================================================= */

function extractHankyu158(html) {

  const $ =
    cheerio.load(html);

  const result = {
    weekday: {},
    holiday: {}
  };

  let found158 = false;

  $("table").each(
    (tableIndex, table) => {

      const text =
        normalize($(table).text());

      if (
        !text.includes("[158]") ||
        !text.includes("谷上駅")
      ) {
        return;
      }

      found158 = true;

      const day =
        tableIndex === 0
          ? "weekday"
          : "holiday";

      $(table)
        .find("tr")
        .each((i, tr) => {

          const cells =
            $(tr)
              .find("th,td")
              .map(
                (j, el) =>
                  normalize($(el).text())
              )
              .get();

          if (!cells.length) {
            return;
          }

          const hour =
            Number(cells[0]);

          if (
            !Number.isInteger(hour) ||
            hour < 0 ||
            hour > 24
          ) {
            return;
          }

          /*
           * 158列は2列目
           */
          const value =
            cells[1] || "";

          const minutes =
            value.match(/\d{1,2}/g) || [];

          result[day][hour] =
            minutes
              .map(x =>
                x.padStart(2, "0")
              )
              .filter(
                x =>
                  Number(x) >= 0 &&
                  Number(x) <= 59
              );
        });
    }
  );

  if (!found158) {

    throw new Error(
      "阪急バス158系統の時刻表を取得できません"
    );
  }

  if (
    !Object.keys(result.weekday).length
  ) {

    throw new Error(
      "阪急バス平日時刻表を取得できません"
    );
  }

  return result;
}


/* =========================================================
   ポートライナー

   table単位で対象方向だけ取得。

   三宮：
   「神戸空港・北埠頭方面行」

   貿易センター：
   「三宮方面行」
========================================================= */

function extractPortliner(
  html,
  direction
) {

  const $ =
    cheerio.load(html);

  const result = [];

  $("table").each(
    (i, table) => {

      const tableText =
        normalize($(table).text());

      if (
        !tableText.includes(direction)
      ) {
        return;
      }

      $(table)
        .find("tr")
        .each((j, tr) => {

          const cells =
            $(tr)
              .find("th,td")
              .map(
                (k, el) =>
                  normalize($(el).text())
              )
              .get();

          if (!cells.length) {
            return;
          }

          const hour =
            Number(cells[0]);

          if (
            !Number.isInteger(hour) ||
            hour < 0 ||
            hour > 24
          ) {
            return;
          }

          const minutes =
            (cells[1] || "")
              .replace(/[北中計]/g, " ")
              .match(/\d{1,2}/g) || [];

          result.push(
            [
              hour,
              minutes
                .map(x =>
                  x.padStart(2, "0")
                )
                .join(",")
            ].join(":")
          );
        });
    }
  );

  if (!result.length) {

    throw new Error(
      `ポートライナー「${direction}」を取得できません`
    );
  }

  return [
    ...new Set(result)
  ].join("|");
}


/* =========================================================
   JR

   JRは駅ページの「時 | 分」形式を利用。

   方向別に駅ページを取得しているため、
   ページ内の時刻表データだけを比較する。

   改正日や運行情報は比較しない。
========================================================= */

function extractJR(html) {

  const $ =
    cheerio.load(html);

  const rows = [];

  $("table").each(
    (i, table) => {

      const tableText =
        normalize($(table).text());

      /*
       * 「時」「分」を持つ時刻表だけ
       */
      if (
        !tableText.includes("時") ||
        !tableText.includes("分")
      ) {
        return;
      }

      $(table)
        .find("tr")
        .each((j, tr) => {

          const cells =
            $(tr)
              .find("th,td")
              .map(
                (k, el) =>
                  normalize($(el).text())
              )
              .get();

          if (cells.length < 2) {
            return;
          }

          const hour =
            Number(cells[0]);

          if (
            !Number.isInteger(hour) ||
            hour < 0 ||
            hour > 24
          ) {
            return;
          }

          /*
           * JRは
  　　　　 * 5 | 33西57加
           * のように行先記号が付く。
           *
           * 数字だけを取得。
           */
          const minutes =
            cells[1]
              .match(/\d{1,2}/g) || [];

          rows.push(
            [
              hour,
              minutes
                .map(x =>
                  x.padStart(2, "0")
                )
                .join(",")
            ].join(":")
          );
        });
    }
  );

  if (!rows.length) {

    throw new Error(
      "JR時刻表を取得できません"
    );
  }

  return [
    ...new Set(rows)
  ].join("|");
}


/* =========================================================
   比較
========================================================= */

function checkService(
  id,
  name,
  route,
  value,
  oldSnapshot,
  newSnapshot,
  services
) {

  const newHash =
    hash(value);

  /*
   * 新方式のsnapshotだけを見る。
   */
  const old =
    oldSnapshot[id];

  newSnapshot[id] = {
    hash: newHash,
    checkedAt: now()
  };

  if (!old) {

    services.push({
      id,
      name,
      route,
      status: "ok",
      message: "初回登録"
    });

    return false;
  }

  if (
    old.hash === newHash
  ) {

    services.push({
      id,
      name,
      route,
      status: "ok",
      message: "変更なし"
    });

    return false;
  }

  services.push({
    id,
    name,
    route,
    status: "changed",
    message: "時刻表変更を検出"
  });

  return true;
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
      {
        timeZone: "Asia/Tokyo"
      }
    )
  );

  console.log("");


  /* -------------------------------------------------------
     前回snapshot
  ------------------------------------------------------- */

  let oldSnapshot = {};

  if (
    fs.existsSync(SNAPSHOT_FILE)
  ) {

    try {

      oldSnapshot =
        JSON.parse(
          fs.readFileSync(
            SNAPSHOT_FILE,
            "utf8"
          )
        );

    } catch {

      oldSnapshot = {};
    }
  }


  const newSnapshot = {};
  const services = [];

  let hasChanges = false;


  /* =======================================================
     ① 阪急バス
  ======================================================= */

  try {

    const html =
      await fetchHtml(
        URLS.hankyu
      );

    const data =
      extractHankyu158(html);

    hasChanges =
      checkService(
        "hankyu_158",
        "阪急バス",
        "日の峰1丁目 → 谷上駅 158系統",
        timetableString(data),
        oldSnapshot,
        newSnapshot,
        services
      ) || hasChanges;

  } catch (e) {

    services.push({
      id: "hankyu_158",
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

    hasChanges =
      checkService(
        "subway_tanigami_sannomiya",
        "神戸市営地下鉄",
        "谷上駅 → 三宮駅",
        timetableString(data),
        oldSnapshot,
        newSnapshot,
        services
      ) || hasChanges;

  } catch (e) {

    services.push({
      id:
        "subway_tanigami_sannomiya",
      name:
        "神戸市営地下鉄",
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

    hasChanges =
      checkService(
        "subway_sannomiya_tanigami",
        "神戸市営地下鉄",
        "三宮駅 → 谷上駅",
        timetableString(data),
        oldSnapshot,
        newSnapshot,
        services
      ) || hasChanges;

  } catch (e) {

    services.push({
      id:
        "subway_sannomiya_tanigami",
      name:
        "神戸市営地下鉄",
      route:
        "三宮駅 → 谷上駅",
      status: "error",
      message:
        "確認エラー: " + e.message
    });
  }


  /* =======================================================
     ④ 神戸市バス 62
  ======================================================= */

  try {

    const html =
      await fetchHtml(
        URLS.cityBus62
      );

    const data =
      extractCityBus62(html);

    hasChanges =
      checkService(
        "citybus_62",
        "神戸市バス",
        "谷上駅 → 神戸北町 62系統",
        timetableString(data),
        oldSnapshot,
        newSnapshot,
        services
      ) || hasChanges;

  } catch (e) {

    services.push({
      id:
        "citybus_62",
      name:
        "神戸市バス",
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

  try {

    const html =
      await fetchHtml(
        URLS.portlinerSannomiya
      );

    const data =
      extractPortliner(
        html,
        "For Kobe Airport / Kita Futo"
      );

    hasChanges =
      checkService(
        "portliner_sannomiya_boeki",
        "ポートライナー",
        "三宮駅 → 貿易センター駅",
        data,
        oldSnapshot,
        newSnapshot,
        services
      ) || hasChanges;

  } catch (e) {

    services.push({
      id:
        "portliner_sannomiya_boeki",
      name:
        "ポートライナー",
      route:
        "三宮駅 → 貿易センター駅",
      status: "error",
      message:
        "確認エラー: " + e.message
    });
  }


  try {

    const html =
      await fetchHtml(
        URLS.portlinerBoeki
      );

    const data =
      extractPortliner(
        html,
        "For Sannomiya"
      );

    hasChanges =
      checkService(
        "portliner_boeki_sannomiya",
        "ポートライナー",
        "貿易センター駅 → 三宮駅",
        data,
        oldSnapshot,
        newSnapshot,
        services
      ) || hasChanges;

  } catch (e) {

    services.push({
      id:
        "portliner_boeki_sannomiya",
      name:
        "ポートライナー",
      route:
        "貿易センター駅 → 三宮駅",
      status: "error",
      message:
        "確認エラー: " + e.message
    });
  }


  /* =======================================================
     ⑥ JR
  ======================================================= */

  try {

    const html =
      await fetchHtml(
        URLS.jrSannomiya
      );

    const data =
      extractJR(html);

    hasChanges =
      checkService(
        "jr_sannomiya_nada",
        "JR西日本",
        "三ノ宮駅 → 灘駅",
        data,
        oldSnapshot,
        newSnapshot,
        services
      ) || hasChanges;

  } catch (e) {

    services.push({
      id:
        "jr_sannomiya_nada",
      name:
        "JR西日本",
      route:
        "三ノ宮駅 → 灘駅",
      status: "error",
      message:
        "確認エラー: " + e.message
    });
  }


  try {

    const html =
      await fetchHtml(
        URLS.jrNada
      );

    const data =
      extractJR(html);

    hasChanges =
      checkService(
        "jr_nada_sannomiya",
        "JR西日本",
        "灘駅 → 三ノ宮駅",
        data,
        oldSnapshot,
        newSnapshot,
        services
      ) || hasChanges;

  } catch (e) {

    services.push({
      id:
        "jr_nada_sannomiya",
      name:
        "JR西日本",
      route:
        "灘駅 → 三ノ宮駅",
      status: "error",
      message:
        "確認エラー: " + e.message
    });
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
        checkedAt: now(),
        hasChanges,
        services
      },
      null,
      2
    )
  );


  /* =======================================================
     表示
  ======================================================= */

  for (
    const service of services
  ) {

    const icon =
      service.status === "changed"
        ? "🔴"
        : service.status === "error"
          ? "⚠️"
          : "🟢";

    console.log(
      `${icon} ${service.name} ${service.route}`
    );

    console.log(
      `   ${service.message}`
    );
  }

  console.log("");

  console.log(
    "※公式時刻表の実データだけを比較しています。"
  );
}


main().catch(error => {

  console.error(error);

  process.exit(1);
});
