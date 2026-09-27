/* =========================================================
   KOBE SANNOMIYA FC
   TIMETABLE AUTOMATIC CHECK

   「ページが変わったか」ではなく
   「実際の時刻表が変わったか」をチェックする。

   ※ timetable.js は自動変更しない。
========================================================= */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cheerio = require("cheerio");


/* =========================================================
   FILE
========================================================= */

const STATUS_FILE =
  path.join(__dirname, "status.json");

const SNAPSHOT_FILE =
  path.join(__dirname, "snapshot.json");


/* =========================================================
   OFFICIAL URL
========================================================= */

/*
 * 阪急バス
 * 日の峰1丁目 → 谷上駅
 * 158系統
 */
const HANKYU_URL =
  "https://transfer-cloud.navitime.biz/hankyubus/courses/timetables?busstop=00021667&timetable-id=856401";


/*
 * 神戸市営地下鉄
 */
const SUBWAY_TANIGAMI_URL =
  "https://kotsu.city.kobe.lg.jp/subway/timetable1/tanigami/?type=free";

const SUBWAY_SANNOMIYA_URL =
  "https://kotsu.city.kobe.lg.jp/subway/timetable1/sannomiya/?type=free";


/*
 * ポートライナー
 */
const PORT_SANNOMIYA_URL =
  "https://www.knt-liner.co.jp/stationp01/";

const PORT_BOEKI_URL =
  "https://www.knt-liner.co.jp/stationp02/";


/*
 * 神戸市バス
 *
 * 谷上駅
 * 62系統
 * 神戸北町方面
 */
const CITYBUS_URL =
  "https://kotsu.city.kobe.lg.jp/bus/bus-stop-list/bus-836/";


/*
 * JR西日本
 */
const JR_SANNOMIYA_URL =
  "https://timetable.jr-odekake.net/station-timetable/2807012002";

const JR_NADA_URL =
  "https://timetable.jr-odekake.net/station-timetable/2806012001";


/* =========================================================
   FETCH
========================================================= */

async function fetchPage(url) {

  const response =
    await fetch(
      url,
      {
        headers: {
          "User-Agent":
            "KOBE-SANNOMIYA-FC-Timetable-Checker/2.0"
        }
      }
    );

  if (!response.ok) {

    throw new Error(
      `HTTP ${response.status}`
    );

  }

  return await response.text();

}


/* =========================================================
   EXTRACT TIMETABLE TABLES
========================================================= */

/*
 * HTMLの中から、
 *
 * 5 | 18 41 51
 * 6 | 02 10 18
 *
 * のような「時刻表の表」だけを取り出す。
 *
 * お知らせ・更新日時・ページタイトルなどは対象外。
 */

function extractTables(
  html,
  firstColumnOnly = false
) {

  const $ =
    cheerio.load(html);

  const schedules = [];


  $("table").each(
    (_, table) => {

      const rows = [];

      $(table)
        .find("tr")
        .each(
          (_, tr) => {

            const cells =
              $(tr)
                .find("th,td")
                .map(
                  (_, cell) =>
                    $(cell)
                      .text()
                      .replace(/\s+/g, " ")
                      .trim()
                )
                .get();

            if (!cells.length) {
              return;
            }

            const hour =
              Number(
                cells[0]
              );

            if (
              !Number.isInteger(hour) ||
              hour < 0 ||
              hour > 24
            ) {
              return;
            }

            let values =
              cells
                .slice(1)
                .join(" ");


            /*
             * 阪急バスは
             *
             * [158] 時刻 | [150] 時刻
             *
             * という2路線構成。
             *
             * 158系統の左側だけ取得する。
             */

            if (
              firstColumnOnly
            ) {

              values =
                cells[1] || "";

            }


            /*
             * 時刻以外の記号を削除
             *
             * ○ ☆ 急 北 中 計 ▼ ● など
             */

            values =
              values
                .replace(
                  /[^\d\s]/g,
                  " "
                )
                .replace(
                  /\s+/g,
                  " "
                )
                .trim();


            /*
             * 分を抽出
             */

            const minutes =
              values
                .match(
                  /\b\d{1,2}\b/g
                ) || [];


            const normalizedMinutes =
              minutes
                .map(
                  n =>
                    String(
                      Number(n)
                    ).padStart(
                      2,
                      "0"
                    )
                )
                .join(",");


            rows.push(
              `${hour}:${normalizedMinutes}`
            );

          }
        );


      /*
       * 時刻表らしい表だけ採用
       */

      if (
        rows.length >= 5
      ) {

        schedules.push(
          rows.join("|")
        );

      }

    }
  );


  /*
   * 同じ表がPC用・スマホ用などで
   * 重複する場合があるため除去。
   */

  return [
    ...new Set(
      schedules
    )
  ];

}


/* =========================================================
   SELECT SCHEDULES
========================================================= */

function selectSchedules(
  schedules,
  start,
  count
) {

  const result =
    schedules.slice(
      start,
      start + count
    );

  if (
    result.length < count
  ) {

    throw new Error(
      `時刻表を取得できませんでした (${result.length}/${count})`
    );

  }

  return result;

}


/* =========================================================
   HASH
========================================================= */

function hashData(
  data
) {

  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify(
        data
      ),
      "utf8"
    )
    .digest("hex");

}


/* =========================================================
   LOAD SNAPSHOT
========================================================= */

function loadSnapshot() {

  if (
    !fs.existsSync(
      SNAPSHOT_FILE
    )
  ) {

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


/* =========================================================
   SAVE JSON
========================================================= */

function saveJson(
  file,
  data
) {

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


/* =========================================================
   COMPARE
========================================================= */

function compareSchedule(
  previous,
  current
) {

  if (!previous) {

    return {
      status: "ok",
      message: "初回登録",
      changes: []
    };

  }


  if (
    previous.hash ===
    hashData(current)
  ) {

    return {
      status: "ok",
      message: "変更なし",
      changes: []
    };

  }


  return {
    status: "changed",
    message: "時刻表の変更を検出",
    changes: getChanges(
      previous.data,
      current
    )
  };

}


/* =========================================================
   CHANGE DETAIL
========================================================= */

function getChanges(
  oldData,
  newData
) {

  const changes = [];

  const max =
    Math.max(
      oldData.length,
      newData.length
    );


  for (
    let i = 0;
    i < max;
    i++
  ) {

    if (
      oldData[i] !==
      newData[i]
    ) {

      changes.push({
        before:
          oldData[i] || "",
        after:
          newData[i] || ""
      });

    }

  }

  return changes;

}


/* =========================================================
   SAVE SERVICE
========================================================= */

function saveService(
  snapshot,
  id,
  data
) {

  snapshot[id] = {
    hash:
      hashData(data),
    data,
    checkedAt:
      new Date()
        .toISOString()
  };

}


/* =========================================================
   CHECK NORMAL SOURCE
========================================================= */

async function checkSource(
  snapshot,
  results,
  source
) {

  console.log(
    `Checking: ${source.name}`
  );


  try {

    const html =
      await fetchPage(
        source.url
      );


    const tables =
      extractTables(
        html,
        source.firstColumnOnly
      );


    const data =
      selectSchedules(
        tables,
        source.start,
        source.count
      );


    const result =
      compareSchedule(
        snapshot[source.id],
        data
      );


    saveService(
      snapshot,
      source.id,
      data
    );


    results.push({
      id:
        source.id,
      name:
        source.name,
      route:
        source.route,
      status:
        result.status,
      message:
        result.message,
      changes:
        result.changes
    });


    return result.status ===
      "changed";


  } catch (
    error
  ) {

    console.error(
      source.name,
      error
    );


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


    return false;

  }

}


/* =========================================================
   JR DATE
========================================================= */

function formatDate(
  date
) {

  const y =
    date.getFullYear();

  const m =
    String(
      date.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  const d =
    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    );

  return `${y}${m}${d}`;

}


/* =========================================================
   JR WEEKDAY
========================================================= */

function getWeekdayDate() {

  const date =
    new Date();


  /*
   * 土日なら月曜日まで進める
   */

  while (
    date.getDay() === 0 ||
    date.getDay() === 6
  ) {

    date.setDate(
      date.getDate() + 1
    );

  }


  return formatDate(
    date
  );

}


/* =========================================================
   JR HOLIDAY / SUNDAY
========================================================= */

function getSundayDate() {

  const date =
    new Date();


  while (
    date.getDay() !== 0
  ) {

    date.setDate(
      date.getDate() + 1
    );

  }


  return formatDate(
    date
  );

}


/* =========================================================
   JR
========================================================= */

async function checkJR(
  snapshot,
  results,
  id,
  route,
  baseUrl
) {

  console.log(
    `Checking: JR西日本 ${route}`
  );


  try {

    const weekdayDate =
      getWeekdayDate();

    const sundayDate =
      getSundayDate();


    /*
     * 平日
     */

    const weekdayHtml =
      await fetchPage(
        `${baseUrl}?date=${weekdayDate}`
      );


    /*
     * 日曜
     */

    const sundayHtml =
      await fetchPage(
        `${baseUrl}?date=${sundayDate}`
      );


    const weekdayTables =
      extractTables(
        weekdayHtml
      );

    const sundayTables =
      extractTables(
        sundayHtml
      );


    /*
     * JR駅ページは対象方向だけなので
     * 最初の時刻表を使用。
     */

    const weekday =
      selectSchedules(
        weekdayTables,
        0,
        1
      )[0];


    const sunday =
      selectSchedules(
        sundayTables,
        0,
        1
      )[0];


    const data = [
      `weekday:${weekday}`,
      `holiday:${sunday}`
    ];


    const result =
      compareSchedule(
        snapshot[id],
        data
      );


    saveService(
      snapshot,
      id,
      data
    );


    results.push({
      id,
      name:
        "JR西日本",
      route,
      status:
        result.status,
      message:
        result.message,
      changes:
        result.changes
    });


    return result.status ===
      "changed";


  } catch (
    error
  ) {

    console.error(
      "JR西日本",
      route,
      error
    );


    results.push({
      id,
      name:
        "JR西日本",
      route,
      status:
        "error",
      message:
        error.message
    });


    return false;

  }

}


/* =========================================================
   MAIN
========================================================= */

async function main() {

  const previous =
    loadSnapshot();


  /*
   * 以前のsnapshotを残す。
   */

  const nextSnapshot =
    {
      ...previous
    };


  const results =
    [];


  let hasChanges =
    false;


  /* =======================================================
     阪急バス
  ======================================================= */

  hasChanges =
    await checkSource(
      nextSnapshot,
      results,
      {
        id:
          "hankyu_158_hinomin1_to_tanigami",

        name:
          "阪急バス",

        route:
          "日の峰1丁目 → 谷上駅",

        url:
          HANKYU_URL,

        /*
         * 158系統は左側の列
         */
        firstColumnOnly:
          true,

        start:
          0,

        count:
          2
      }
    ) || hasChanges;


  /* =======================================================
     神戸市営地下鉄
  ======================================================= */

  hasChanges =
    await checkSource(
      nextSnapshot,
      results,
      {
        id:
          "subway_tanigami_to_sannomiya",

        name:
          "神戸市営地下鉄",

        route:
          "谷上駅 → 三宮駅",

        url:
          SUBWAY_TANIGAMI_URL,

        start:
          0,

        count:
          2
      }
    ) || hasChanges;


  hasChanges =
    await checkSource(
      nextSnapshot,
      results,
      {
        id:
          "subway_sannomiya_to_tanigami",

        name:
          "神戸市営地下鉄",

        route:
          "三宮駅 → 谷上駅",

        url:
          SUBWAY_SANNOMIYA_URL,

        start:
          0,

        count:
          2
      }
    ) || hasChanges;


  /* =======================================================
     ポートライナー
  ======================================================= */

  hasChanges =
    await checkSource(
      nextSnapshot,
      results,
      {
        id:
          "port_sannomiya_to_boeki",

        name:
          "ポートライナー",

        route:
          "三宮駅 → 貿易センター駅",

        url:
          PORT_SANNOMIYA_URL,

        start:
          0,

        count:
          2
      }
    ) || hasChanges;


  hasChanges =
    await checkSource(
      nextSnapshot,
      results,
      {
        id:
          "port_boeki_to_sannomiya",

        name:
          "ポートライナー",

        route:
          "貿易センター駅 → 三宮駅",

        url:
          PORT_BOEKI_URL,

        /*
         * 貿易センター駅は
         *
         * 0,1 = 神戸空港方面
         * 2,3 = 三宮方面
         */
        start:
          2,

        count:
          2
      }
    ) || hasChanges;


  /* =======================================================
     神戸市バス
  ======================================================= */

  hasChanges =
    await checkSource(
      nextSnapshot,
      results,
      {
        id:
          "citybus_62_tanigami_to_kobekitamachi",

        name:
          "神戸市バス",

        route:
          "谷上駅 → 神戸北町 62系統",

        url:
          CITYBUS_URL,

        start:
          0,

        count:
          3
      }
    ) || hasChanges;


  /* =======================================================
     JR
  ======================================================= */

  hasChanges =
    await checkJR(
      nextSnapshot,
      results,
      "jr_sannomiya_to_nada",
      "三ノ宮駅 → 灘駅",
      JR_SANNOMIYA_URL
    ) || hasChanges;


  hasChanges =
    await checkJR(
      nextSnapshot,
      results,
      "jr_nada_to_sannomiya",
      "灘駅 → 三ノ宮駅",
      JR_NADA_URL
    ) || hasChanges;


  /* =======================================================
     SAVE
  ======================================================= */

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


  /* =======================================================
     LOG
  ======================================================= */

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

      process.exit(
        1
      );

    }
  );
