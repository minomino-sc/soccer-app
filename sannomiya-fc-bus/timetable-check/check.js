/* =========================================================
   KOBE SANNOMIYA FC
   TIMETABLE AUTOMATIC CHECK

   ※ timetable.js は絶対に変更しません。

   監視対象
   ---------------------------------------------------------
   1. 阪急バス
      日の峰1丁目 → 谷上駅 158系統

   2. 神戸市営地下鉄
      谷上駅 → 三宮駅

   3. 神戸市営地下鉄
      三宮駅 → 谷上駅

   4. ポートライナー
      三宮駅 → 貿易センター駅

   5. ポートライナー
      貿易センター駅 → 三宮駅

   6. 神戸市バス
      谷上駅 → 神戸北町 62系統

   7. JR西日本
      三ノ宮駅 → 灘駅

   8. JR西日本
      灘駅 → 三ノ宮駅

   重要
   ---------------------------------------------------------
   ・市バス111系統は監視しません。
   ・取得失敗時は「変更なし」にしません。
   ・取得失敗時は前回の正常スナップショットを保持します。
========================================================= */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cheerio = require("cheerio");

const STATUS_FILE =
  path.join(__dirname, "status.json");

const SNAPSHOT_FILE =
  path.join(__dirname, "snapshot.json");

const SNAPSHOT_VERSION = 4;


/* =========================================================
   監視対象
========================================================= */

const SOURCES = [

  {
    id: "hankyu_158",
    name: "阪急バス",
    route: "日の峰1丁目 → 谷上駅 158系統",
    url: "https://www.hankyubus.co.jp/rosen/timetable/",
    type: "hankyu"
  },

  {
    id: "subway_tanigami_sannomiya",
    name: "神戸市営地下鉄",
    route: "谷上駅 → 三宮駅",
    url: "https://kotsu.city.kobe.lg.jp/subway/timetable1/tanigami/",
    type: "subway",
    direction: "新神戸・三宮・名谷・西神中央方面行"
  },

  {
    id: "subway_sannomiya_tanigami",
    name: "神戸市営地下鉄",
    route: "三宮駅 → 谷上駅",
    url: "https://kotsu.city.kobe.lg.jp/subway/timetable1/sannomiya/",
    type: "subway",
    direction: "新神戸・谷上方面行"
  },

  {
    id: "portliner_sannomiya_boeki",
    name: "ポートライナー",
    route: "三宮駅 → 貿易センター駅",
    url: "https://www.knt-liner.co.jp/stationp01/",
    type: "portliner",
    direction: "神戸空港・北埠頭方面行"
  },

  {
    id: "portliner_boeki_sannomiya",
    name: "ポートライナー",
    route: "貿易センター駅 → 三宮駅",
    url: "https://www.knt-liner.co.jp/stationp02/",
    type: "portliner",
    direction: "三宮方面行"
  },

  {
    id: "citybus_62",
    name: "神戸市バス",
    route: "谷上駅 → 神戸北町 62系統",
    url: "https://kotsu.city.kobe.lg.jp/bus/bus-stop-list/bus-836/",
    type: "citybus62"
  },

  {
    id: "jr_sannomiya_nada",
    name: "JR西日本",
    route: "三ノ宮駅 → 灘駅",
    url: "https://timetable.jr-odekake.net/station-timetable/2807012002",
    type: "jr"
  },

  {
    id: "jr_nada_sannomiya",
    name: "JR西日本",
    route: "灘駅 → 三ノ宮駅",
    url: "https://timetable.jr-odekake.net/station-timetable/2806012001",
    type: "jr"
  }

];


/* =========================================================
   HTML取得
========================================================= */

async function fetchPage(url) {

  const response = await fetch(url, {

    headers: {

      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/140.0 Safari/537.36",

      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

      "Accept-Language":
        "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",

      "Referer":
        "https://kotsu.city.kobe.lg.jp/"
    },

    redirect: "follow"

  });


  if (!response.ok) {

    throw new Error(
      `HTTP ${response.status}`
    );

  }


  const html =
    await response.text();


  if (!html || html.length < 500) {

    throw new Error(
      "公式ページの内容が空です"
    );

  }


  return html;

}


/* =========================================================
   共通
========================================================= */

function normalize(text) {

  return String(text || "")

    .replace(/\u00a0/g, " ")

    .replace(
      /[０-９]/g,
      char =>
        String.fromCharCode(
          char.charCodeAt(0) - 0xfee0
        )
    )

    .replace(/[：]/g, ":")

    .replace(
      /[●▼□○〇☆急]/g,
      " "
    )

    .replace(
      /\s+/g,
      " "
    )

    .trim();

}


function createHash(text) {

  return crypto
    .createHash("sha256")
    .update(text, "utf8")
    .digest("hex");

}


function loadSnapshot() {

  if (!fs.existsSync(SNAPSHOT_FILE)) {
    return {};
  }

  try {

    return JSON.parse(
      fs.readFileSync(
        SNAPSHOT_FILE,
        "utf8"
      )
    );

  } catch {

    return {};

  }

}


function saveJson(file, data) {

  fs.writeFileSync(
    file,
    JSON.stringify(
      data,
      null,
      2
    ) + "\n",
    "utf8"
  );

}


function makeTime(hour, minute) {

  const h = Number(hour);
  const m = Number(minute);

  if (!Number.isInteger(h)) {
    return null;
  }

  if (!Number.isInteger(m)) {
    return null;
  }

  if (h < 0 || h > 23) {
    return null;
  }

  if (m < 0 || m > 59) {
    return null;
  }

  return (
    String(h).padStart(2, "0") +
    ":" +
    String(m).padStart(2, "0")
  );

}


function uniqueSort(times) {

  return [
    ...new Set(times)
  ].sort();

}


/* =========================================================
   地下鉄
========================================================= */

/*
 * 神戸市交通局の実際のページは、
 *
 * 平日
 * 5 | 42 54
 * 6 | 2 12 20 ...
 * 7 | 1 4 9 ...
 *
 * 土日・祝日
 * 5 | ...
 *
 * という構造。
 *
 * 「行ごと」に解析することで、
 * 6時の「2分」を2時と誤認しない。
 */

function parseSubwayRows(text) {

  const result = [];

  const normalized =
    normalize(text);


  /*
   * 時刻表の行を取得
   *
   * 例:
   * 6 | 2 12 20 29 38
   */

  const rows =
    normalized.split(/\s+(?=\d{1,2}\s*\|)/);


  for (const row of rows) {

    const match =
      row.match(
        /^(\d{1,2})\s*\|\s*(.*)$/
      );


    if (!match) {
      continue;
    }


    const hour =
      Number(match[1]);


    if (
      hour < 0 ||
      hour > 23
    ) {
      continue;
    }


    const minutesText =
      match[2];


    /*
     * 行末までに含まれる数字だけを取得。
     *
     * ●や▼は normalize() で空白化済み。
     */

    const minuteMatches =
      minutesText.match(
        /\b\d{1,2}\b/g
      ) || [];


    for (
      const minuteText
      of minuteMatches
    ) {

      const minute =
        Number(
          minuteText
        );


      if (
        minute < 0 ||
        minute > 59
      ) {
        continue;
      }


      const time =
        makeTime(
          hour,
          minute
        );


      if (time) {
        result.push(time);
      }

    }

  }


  return uniqueSort(result);

}


function extractSubway(
  html,
  direction
) {

  const $ =
    cheerio.load(html);


  /*
   * body全体ではなく、
   * テキストとして取得。
   */

  const body =
    normalize(
      $("body").text()
    );


  const start =
    body.indexOf(
      direction
    );


  if (start === -1) {

    throw new Error(
      `対象方向「${direction}」が見つかりません`
    );

  }


  let section =
    body.substring(start);


  /*
   * 次の方向の時刻表が始まったところで切る。
   */

  const nextDirections = [

    "新神戸・谷上方面行",

    "名谷・西神中央方面行",

    "新神戸・三宮・名谷・西神中央方面行"

  ];


  for (
    const nextDirection
    of nextDirections
  ) {

    if (
      nextDirection ===
      direction
    ) {
      continue;
    }


    const index =
      section.indexOf(
        nextDirection,
        direction.length
      );


    if (index !== -1) {

      section =
        section.substring(
          0,
          index
        );

    }

  }


  /*
   * 平日と土日祝の位置
   */

  const weekdayIndex =
    section.indexOf(
      "平日"
    );


  if (weekdayIndex === -1) {

    throw new Error(
      `「${direction}」の平日データが見つかりません`
    );

  }


  const weekendIndex =
    section.indexOf(
      "土日・祝日",
      weekdayIndex + 2
    );


  if (weekendIndex === -1) {

    throw new Error(
      `「${direction}」の土日・祝日データが見つかりません`
    );

  }


  const weekdayText =
    section.substring(
      weekdayIndex + 2,
      weekendIndex
    );


  const weekendText =
    section.substring(
      weekendIndex +
      "土日・祝日".length
    );


  const weekday =
    parseSubwayRows(
      weekdayText
    );


  const weekend =
    parseSubwayRows(
      weekendText
    );


  if (weekday.length < 3) {

    throw new Error(
      `「${direction}」の平日時刻を抽出できません`
    );

  }


  if (weekend.length < 3) {

    throw new Error(
      `「${direction}」の土日・祝日時刻を抽出できません`
    );

  }


  return {

    weekday,
    weekend

  };

}


/* =========================================================
   市バス 62系統
========================================================= */

function parseCityBusBlock(text) {

  const result = [];

  const normalized =
    normalize(text);


  /*
   * 市バスは
   *
   * 5時
   * 6時
   * 7時
   * 45
   *
   * のような構造。
   */


  const hourRegex =
    /(\d{1,2})時/g;


  const hours = [];

  let match;


  while (
    (match =
      hourRegex.exec(
        normalized
      )) !== null
  ) {

    hours.push({

      hour:
        Number(match[1]),

      start:
        match.index,

      end:
        hourRegex.lastIndex

    });

  }


  for (
    let i = 0;
    i < hours.length;
    i++
  ) {

    const current =
      hours[i];

    const next =
      hours[i + 1];


    const from =
      current.end;


    const to =
      next
        ? next.start
        : normalized.length;


    const minutesText =
      normalized.substring(
        from,
        to
      );


    const minuteMatches =
      minutesText.match(
        /\b\d{1,2}\b/g
      ) || [];


    for (
      const minuteText
      of minuteMatches
    ) {

      const minute =
        Number(
          minuteText
        );


      if (
        minute < 0 ||
        minute > 59
      ) {
        continue;
      }


      const time =
        makeTime(
          current.hour,
          minute
        );


      if (time) {
        result.push(time);
      }

    }

  }


  return uniqueSort(result);

}


function extractCityBus62(html) {

  const $ =
    cheerio.load(html);


  const body =
    normalize(
      $("body").text()
    );


  /*
   * 62系統の開始地点
   */

  const startMatch =
    body.match(
      /62系統\s*神戸北町方面行き/
    );


  if (!startMatch) {

    throw new Error(
      "62系統 神戸北町方面行きが見つかりません"
    );

  }


  let section =
    body.substring(
      startMatch.index
    );


  /*
   * 111系統が始まったら完全に切る。
   *
   * これで111系統は監視対象に入らない。
   */

  const endIndex =
    section.indexOf(
      "111系統"
    );


  if (endIndex !== -1) {

    section =
      section.substring(
        0,
        endIndex
      );

  }


  /*
   * 平日
   * 土曜日
   * 日曜・祝日
   */

  const weekdayIndex =
    section.indexOf(
      "平日"
    );


  const saturdayIndex =
    section.indexOf(
      "土曜日",
      weekdayIndex + 2
    );


  const holidayIndex =
    section.indexOf(
      "日曜・祝日",
      saturdayIndex + 2
    );


  if (
    weekdayIndex === -1 ||
    saturdayIndex === -1 ||
    holidayIndex === -1
  ) {

    throw new Error(
      "62系統の平日・土曜・日祝データを確認できません"
    );

  }


  const weekdayText =
    section.substring(
      weekdayIndex,
      saturdayIndex
    );


  const saturdayText =
    section.substring(
      saturdayIndex,
      holidayIndex
    );


  const holidayText =
    section.substring(
      holidayIndex
    );


  const weekday =
    parseCityBusBlock(
      weekdayText
    );


  const saturday =
    parseCityBusBlock(
      saturdayText
    );


  const holiday =
    parseCityBusBlock(
      holidayText
    );


  if (!weekday.length) {

    throw new Error(
      "62系統 平日時刻を抽出できません"
    );

  }


  if (!saturday.length) {

    throw new Error(
      "62系統 土曜日時刻を抽出できません"
    );

  }


  if (!holiday.length) {

    throw new Error(
      "62系統 日曜・祝日時刻を抽出できません"
    );

  }


  return {

    weekday,
    saturday,
    holiday

  };

}


/* =========================================================
   ポートライナー
   ※既存処理
========================================================= */

function extractPortliner(
  html,
  direction
) {

  const $ =
    cheerio.load(html);

  const tables = [];


  $("table").each(
    (index, table) => {

      const tableText =
        normalize(
          $(table).text()
        );


      if (
        !tableText.includes(
          direction
        )
      ) {
        return;
      }


      const times = [];


      $(table)
        .find("tr")
        .each(
          (i, tr) => {

            const hourText =
              normalize(
                $(tr)
                  .find("th.hour")
                  .first()
                  .text()
              );


            const hourMatch =
              hourText.match(
                /^(\d{1,2})$/
              );


            if (!hourMatch) {
              return;
            }


            const hour =
              Number(
                hourMatch[1]
              );


            $(tr)
              .find(".info02")
              .each(
                (j, el) => {

                  const minuteText =
                    normalize(
                      $(el).text()
                    );


                  const minuteMatch =
                    minuteText.match(
                      /\d{1,2}/
                    );


                  if (!minuteMatch) {
                    return;
                  }


                  const time =
                    makeTime(
                      hour,
                      Number(
                        minuteMatch[0]
                      )
                    );


                  if (time) {
                    times.push(
                      time
                    );
                  }

                }
              );

          }
        );


      if (times.length) {

        tables.push(
          uniqueSort(times)
        );

      }

    }
  );


  if (!tables.length) {

    throw new Error(
      `ポートライナー「${direction}」を取得できません`
    );

  }


  return {

    weekday:
      tables[0],

    weekend:
      tables[1] ||
      tables[0]

  };

}


/* =========================================================
   JR
   ※既存処理
========================================================= */

function extractJR(html) {

  const $ =
    cheerio.load(html);

  const times = [];


  $(".departure-time")
    .each(
      (index, element) => {

        const value =
          normalize(
            $(element).text()
          );


        if (
          /^\d{1,2}:\d{2}$/
            .test(value)
        ) {

          times.push(
            value
          );

        }

      }
    );


  const result =
    uniqueSort(times);


  if (!result.length) {

    throw new Error(
      "JR発車時刻を取得できません"
    );

  }


  return result;

}


/* =========================================================
   阪急バス
   ※今回は後回し
========================================================= */

function extractHankyu() {

  throw new Error(
    "158系統「日の峰1丁目 → 谷上駅」は現在未対応です"
  );

}


/* =========================================================
   各路線
========================================================= */

async function extractSource(source) {

  if (
    source.type === "hankyu"
  ) {

    return extractHankyu();

  }


  const html =
    await fetchPage(
      source.url
    );


  if (
    source.type === "subway"
  ) {

    return extractSubway(
      html,
      source.direction
    );

  }


  if (
    source.type === "citybus62"
  ) {

    return extractCityBus62(
      html
    );

  }


  if (
    source.type === "portliner"
  ) {

    return extractPortliner(
      html,
      source.direction
    );

  }


  if (
    source.type === "jr"
  ) {

    return extractJR(
      html
    );

  }


  throw new Error(
    "未対応の監視タイプ"
  );

}


/* =========================================================
   メイン
========================================================= */

async function main() {

  const previous =
    loadSnapshot();


  const isNewBaseline =
    previous.version !==
    SNAPSHOT_VERSION;


  if (isNewBaseline) {

    console.log(
      "New snapshot format detected."
    );

    console.log(
      "Creating new baseline."
    );

  }


  const nextSnapshot = {

    version:
      SNAPSHOT_VERSION,

    services: {}

  };


  const results = [];

  let hasChanges =
    false;


  for (
    const source
    of SOURCES
  ) {

    console.log(
      "---------------------------------"
    );

    console.log(
      `Checking: ${source.name} ${source.route}`
    );


    try {

      const timetable =
        await extractSource(
          source
        );


      const normalized =
        JSON.stringify(
          timetable
        );


      const hash =
        createHash(
          normalized
        );


      nextSnapshot.services[
        source.id
      ] = {

        hash,

        timetable,

        checkedAt:
          new Date()
            .toISOString()

      };


      /*
       * 初回・バージョン変更
       */

      if (isNewBaseline) {

        results.push({

          id:
            source.id,

          name:
            source.name,

          route:
            source.route,

          status:
            "ok",

          message:
            "基準登録"

        });


        console.log(
          "  → 基準登録"
        );


        continue;

      }


      const previousService =
        previous
          .services?.[
            source.id
          ];


      if (
        !previousService?.hash
      ) {

        results.push({

          id:
            source.id,

          name:
            source.name,

          route:
            source.route,

          status:
            "ok",

          message:
            "基準登録"

        });


        console.log(
          "  → 基準登録"
        );


        continue;

      }


      if (
        previousService.hash ===
        hash
      ) {

        results.push({

          id:
            source.id,

          name:
            source.name,

          route:
            source.route,

          status:
            "ok",

          message:
            "変更なし"

        });


        console.log(
          "  → 変更なし"
        );

      } else {

        results.push({

          id:
            source.id,

          name:
            source.name,

          route:
            source.route,

          status:
            "changed",

          message:
            "時刻表変更を検出"

        });


        console.log(
          "  → 時刻表変更を検出"
        );


        hasChanges =
          true;

      }


    } catch (error) {

      console.error(
        `[ERROR] ${source.name} ${source.route}`
      );

      console.error(
        error.message
      );


      const previousService =
        previous
          .services?.[
            source.id
          ];


      if (previousService) {

        nextSnapshot.services[
          source.id
        ] =
          previousService;

      }


      results.push({

        id:
          source.id,

        name:
          source.name,

        route:
          source.route,

        status:
          "error",

        message:
          error.message

      });

    }

  }


  const checkedAt =
    new Date()
      .toISOString();


  saveJson(
    SNAPSHOT_FILE,
    nextSnapshot
  );


  saveJson(
    STATUS_FILE,
    {

      checkedAt,

      hasChanges,

      services:
        results

    }
  );


  console.log(
    "================================="
  );

  console.log(
    "TIMETABLE CHECK COMPLETE"
  );

  console.log(
    `Changes: ${hasChanges}`
  );

  console.log(
    "================================="
  );

}


main()
  .catch(
    error => {

      console.error(
        error
      );

      process.exit(1);

    }
  );
