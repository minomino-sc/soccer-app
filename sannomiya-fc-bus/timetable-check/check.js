/* =========================================================
   KOBE SANNOMIYA FC
   TIMETABLE AUTOMATIC CHECK

   目的
   ---------------------------------------------------------
   現在採用している時刻表について、

   ・公式時刻表の対象部分だけを取得
   ・前回取得した時刻表データと比較
   ・変更なし
   ・変更あり
   ・確認エラー

   を自動判定する。

   ※ timetable.js は自動変更しません。
========================================================= */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cheerio = require("cheerio");


/* =========================================================
   PATH
========================================================= */

const STATUS_FILE =
  path.join(
    __dirname,
    "status.json"
  );

const SNAPSHOT_FILE =
  path.join(
    __dirname,
    "snapshot.json"
  );


/* =========================================================
   OFFICIAL SOURCES
========================================================= */

const SOURCES = [

  /* =======================================================
     阪急バス
     -------------------------------------------------------
     対象：
     日の峰1丁目 → 谷上駅
     158系統

     GitHub Actionsから対象公式時刻表を安定取得できない
     場合は「確認エラー」とする。
  ======================================================= */

  {
    id: "hankyu_158",

    name: "阪急バス",

    route:
      "日の峰1丁目 → 谷上駅 158系統",

    type: "hankyu",

    url:
      "https://www.hankyubus.co.jp/rosen/timetable/"
  },


  /* =======================================================
     地下鉄
  ======================================================= */

  {
    id: "subway_tanigami_sannomiya",

    name: "神戸市営地下鉄",

    route:
      "谷上駅 → 三宮駅",

    type: "subway",

    url:
      "https://kotsu.city.kobe.lg.jp/subway/timetable1/tanigami/",

    direction:
      "新神戸・三宮・名谷・西神中央方面行"
  },


  {
    id: "subway_sannomiya_tanigami",

    name: "神戸市営地下鉄",

    route:
      "三宮駅 → 谷上駅",

    type: "subway",

    url:
      "https://kotsu.city.kobe.lg.jp/subway/timetable1/sannomiya/",

    direction:
      "新神戸・谷上方面行"
  },


  /* =======================================================
     ポートライナー
  ======================================================= */

  {
    id: "portliner_sannomiya_boeki",

    name: "ポートライナー",

    route:
      "三宮駅 → 貿易センター駅",

    type: "portliner",

    url:
      "https://www.knt-liner.co.jp/stationp01/",

    direction:
      "神戸空港・北埠頭方面行"
  },


  {
    id: "portliner_boeki_sannomiya",

    name: "ポートライナー",

    route:
      "貿易センター駅 → 三宮駅",

    type: "portliner",

    url:
      "https://www.knt-liner.co.jp/stationp02/",

    direction:
      "三宮方面行"
  },


  /* =======================================================
     神戸市バス
  ======================================================= */

  {
    id: "citybus_62",

    name: "神戸市バス",

    route:
      "谷上駅 → 神戸北町 62系統",

    type: "citybus",

    url:
      "https://kotsu.city.kobe.lg.jp/bus/bus-stop-list/bus-836/"
  },


  /* =======================================================
     JR
  ======================================================= */

  {
    id: "jr_sannomiya_nada",

    name: "JR西日本",

    route:
      "三ノ宮駅 → 灘駅",

    type: "jr",

    url:
      "https://timetable.jr-odekake.net/station-timetable/2807012002"
  },


  {
    id: "jr_nada_sannomiya",

    name: "JR西日本",

    route:
      "灘駅 → 三ノ宮駅",

    type: "jr",

    url:
      "https://timetable.jr-odekake.net/station-timetable/2806012001"
  }

];


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
            "KOBE-SANNOMIYA-FC-Timetable-Checker/2.0",
          "Accept":
            "text/html,application/xhtml+xml"
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
   HASH
========================================================= */

function createHash(text) {

  return crypto
    .createHash("sha256")
    .update(
      text,
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
   NORMALIZE
========================================================= */

function normalizeText(
  text
) {

  return String(text || "")
    .replace(
      /[０-９]/g,
      c =>
        String.fromCharCode(
          c.charCodeAt(0) - 0xfee0
        )
    )
    .replace(
      /[：]/g,
      ":"
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();

}


/* =========================================================
   ADD TIME
========================================================= */

function addTime(
  list,
  hour,
  minute
) {

  const h =
    String(hour)
      .padStart(
        2,
        "0"
      );

  const m =
    String(minute)
      .padStart(
        2,
        "0"
      );

  list.push(
    `${h}:${m}`
  );

}


/* =========================================================
   UNIQUE SORT
========================================================= */

function uniqueSorted(
  list
) {

  return [
    ...new Set(
      list
    )
  ].sort(
    (a, b) =>
      a.localeCompare(
        b
      )
  );

}


/* =========================================================
   SUBWAY
   ---------------------------------------------------------
   方向見出しから次の時刻表ブロックだけを抽出する。
========================================================= */

function extractSubway(
  html,
  direction
) {

  const $ =
    cheerio.load(
      html
    );


  const body =
    normalizeText(
      $("body").text()
    );


  const start =
    body.indexOf(
      normalizeText(
        direction
      )
    );


  if (
    start < 0
  ) {

    throw new Error(
      "対象方向の時刻表が見つかりません"
    );

  }


  const section =
    body.slice(
      start
    );


  /*
   * 平日ブロック
   *
   * 最初の5時から次の5時まで。
   */
  const first5 =
    section.indexOf(
      "5 |"
    );


  if (
    first5 < 0
  ) {

    throw new Error(
      "平日時刻表を取得できません"
    );

  }


  const second5 =
    section.indexOf(
      "5 |",
      first5 + 3
    );


  if (
    second5 < 0
  ) {

    throw new Error(
      "土日祝時刻表を取得できません"
    );

  }


  const weekday =
    extractClockRows(
      section.slice(
        first5,
        second5
      )
    );


  const weekend =
    extractClockRows(
      section.slice(
        second5
      )
    );


  if (
    !weekday.length &&
    !weekend.length
  ) {

    throw new Error(
      "時刻データを取得できません"
    );

  }


  return {

    weekday:
      uniqueSorted(
        weekday
      ),

    weekend:
      uniqueSorted(
        weekend
      )

  };

}


/* =========================================================
   CLOCK ROW EXTRACTION
========================================================= */

function extractClockRows(
  text
) {

  const result =
    [];


  /*
   * 例
   *
   * 5 | 18 41 51
   * 6 | 2 10 18 ...
   */
  const regex =
    /(?:^|\s)(\d{1,2})\s*\|\s*([^|]+?)(?=\s+\d{1,2}\s*\||$)/g;


  let match;


  while (
    (match = regex.exec(text))
      !== null
  ) {

    const hour =
      Number(
        match[1]
      );


    const minutes =
      match[2]
        .match(
          /(?:^|\s)(\d{1,2})(?=\s|$)/g
        );


    if (!minutes) {
      continue;
    }


    for (
      const raw of minutes
    ) {

      const minute =
        Number(
          raw.trim()
        );


      if (
        minute >= 0 &&
        minute <= 59
      ) {

        addTime(
          result,
          hour,
          minute
        );

      }

    }

  }


  return result;

}


/* =========================================================
   CITY BUS 62
   ---------------------------------------------------------
   62系統部分だけを取得。
   111系統などは比較対象に含めない。
========================================================= */

function extractCityBus62(
  html
) {

  const $ =
    cheerio.load(
      html
    );


  const body =
    normalizeText(
      $("body").text()
    );


  const start =
    body.indexOf(
      "62系統 神戸北町方面行き"
    );


  if (
    start < 0
  ) {

    throw new Error(
      "62系統 神戸北町方面行き が見つかりません"
    );

  }


  const end =
    body.indexOf(
      "111系統",
      start
    );


  const section =
    end >= 0
      ? body.slice(
          start,
          end
        )
      : body.slice(
          start
        );


  const first5 =
    section.indexOf(
      "5時"
    );


  if (
    first5 < 0
  ) {

    throw new Error(
      "62系統の平日時刻表が見つかりません"
    );

  }


  const second5 =
    section.indexOf(
      "5時",
      first5 + 2
    );


  if (
    second5 < 0
  ) {

    throw new Error(
      "62系統の土曜・日祝時刻表が見つかりません"
    );

  }


  const weekday =
    extractJapaneseClockRows(
      section.slice(
        first5,
        second5
      )
    );


  const weekend =
    extractJapaneseClockRows(
      section.slice(
        second5
      )
    );


  if (
    !weekday.length &&
    !weekend.length
  ) {

    throw new Error(
      "62系統の時刻データを取得できません"
    );

  }


  return {

    weekday:
      uniqueSorted(
        weekday
      ),

    weekend:
      uniqueSorted(
        weekend
      )

  };

}


/* =========================================================
   JAPANESE CLOCK ROWS
========================================================= */

function extractJapaneseClockRows(
  text
) {

  const result =
    [];


  /*
   * 例
   *
   * 7時 45
   * 11時 00
   * 15時 00 30
   */

  const regex =
    /(\d{1,2})時([^0-9]{0,20}(?:\d{1,2}(?:\s|$|○|☆|急))+(?:[^0-9]{0,20}))/g;


  let match;


  while (
    (match = regex.exec(text))
      !== null
  ) {

    const hour =
      Number(
        match[1]
      );


    const minutes =
      match[2].match(
        /\d{1,2}/g
      );


    if (!minutes) {
      continue;
    }


    for (
      const raw of minutes
    ) {

      const minute =
        Number(
          raw
        );


      if (
        minute >= 0 &&
        minute <= 59
      ) {

        addTime(
          result,
          hour,
          minute
        );

      }

    }

  }


  return result;

}


/* =========================================================
   PORTLINER
========================================================= */

function extractPortliner(
  html,
  direction
) {

  const $ =
    cheerio.load(
      html
    );


  const tables =
    $("table");


  const results =
    [];


  let matched =
    false;


  tables.each(
    (_, table) => {

      const tableText =
        normalizeText(
          $(table).text()
        );


      if (
        !tableText.includes(
          normalizeText(
            direction
          )
        )
      ) {

        return;

      }


      /*
       * 最初の一致テーブルを使用。
       *
       * 公式ページでは
       * 平日 / 土日祝
       * が別テーブルになっている。
       */
      if (
        matched
      ) {

        return;

      }


      matched =
        true;


      $(table)
        .find("tr")
        .each(
          (_, tr) => {

            const cells =
              $(tr)
                .find(
                  "th,td"
                )
                .map(
                  (_, cell) =>
                    normalizeText(
                      $(cell).text()
                    )
                )
                .get();


            if (
              cells.length < 2
            ) {

              return;

            }


            const hour =
              Number(
                cells[0]
              );


            if (
              !Number.isInteger(
                hour
              ) ||
              hour < 0 ||
              hour > 23
            ) {

              return;

            }


            const minutes =
              $(tr)
                .find(
                  ".info02"
                )
                .map(
                  (_, el) =>
                    normalizeText(
                      $(el).text()
                    )
                )
                .get();


            for (
              const raw of minutes
            ) {

              const minute =
                Number(
                  raw
                );


              if (
                minute >= 0 &&
                minute <= 59
              ) {

                addTime(
                  results,
                  hour,
                  minute
                );

              }

            }

          }
        );

    }
  );


  if (
    !matched ||
    !results.length
  ) {

    throw new Error(
      "対象方向のポートライナー時刻表を取得できません"
    );

  }


  return uniqueSorted(
    results
  );

}


/* =========================================================
   JR
   ---------------------------------------------------------
   JRは日付指定ページを取得する。
   平日代表日と土日代表日の2種類を比較する。
========================================================= */

function formatDate(
  date
) {

  const y =
    date.getFullYear();


  const m =
    String(
      date.getMonth() + 1
    )
      .padStart(
        2,
        "0"
      );


  const d =
    String(
      date.getDate()
    )
      .padStart(
        2,
        "0"
      );


  return `${y}${m}${d}`;

}


/* =========================================================
   NEXT MONDAY
========================================================= */

function getNextMonday() {

  const date =
    new Date();


  const day =
    date.getDay();


  const diff =
    day === 0
      ? 1
      : 8 - day;


  date.setDate(
    date.getDate() + diff
  );


  return date;

}


/* =========================================================
   NEXT SUNDAY
========================================================= */

function getNextSunday() {

  const date =
    new Date();


  const day =
    date.getDay();


  const diff =
    day === 0
      ? 0
      : 7 - day;


  date.setDate(
    date.getDate() + diff
  );


  return date;

}


/* =========================================================
   JR FETCH
========================================================= */

async function fetchJR(
  source
) {

  const weekdayDate =
    formatDate(
      getNextMonday()
    );


  const weekendDate =
    formatDate(
      getNextSunday()
    );


  const weekdayHtml =
    await fetchPage(
      `${source.url}?date=${weekdayDate}`
    );


  const weekendHtml =
    await fetchPage(
      `${source.url}?date=${weekendDate}`
    );


  return {

    weekday:
      extractJRTimes(
        weekdayHtml
      ),

    weekend:
      extractJRTimes(
        weekendHtml
      )

  };

}


/* =========================================================
   JR TIMES
========================================================= */

function extractJRTimes(
  html
) {

  const $ =
    cheerio.load(
      html
    );


  const results =
    [];


  /*
   * PC/SPの重複を防ぐため、
   * 時刻そのものだけを取得して最後に重複排除。
   */
  $(
    ".departure-time"
  )
    .each(
      (_, el) => {

        const value =
          normalizeText(
            $(el).text()
          );


        const match =
          value.match(
            /^(\d{1,2}):(\d{2})$/
          );


        if (!match) {
          return;
        }


        addTime(
          results,
          Number(
            match[1]
          ),
          Number(
            match[2]
          )
        );

      }
    );


  if (
    !results.length
  ) {

    throw new Error(
      "JR時刻表を取得できません"
    );

  }


  return uniqueSorted(
    results
  );

}


/* =========================================================
   HANKYU
   ---------------------------------------------------------
   現在の公式路線一覧ページでは158系統自体は確認できるが、
   「日の峰1丁目 → 谷上駅」の対象停留所時刻表を
   GitHub Actionsから直接取得できない場合がある。

   誤って「変更なし」と判定するより、
   確認エラーとして扱う。
========================================================= */

async function checkHankyu(
  source
) {

  /*
   * 公式ページ自体が取得できるかだけ確認する。
   */
  await fetchPage(
    source.url
  );


  throw new Error(
    "対象158系統時刻表を自動取得できません"
  );

}


/* =========================================================
   EXTRACT
========================================================= */

async function extractTimetable(
  source,
  html
) {

  switch (
    source.type
  ) {

    case "subway":

      return extractSubway(
        html,
        source.direction
      );


    case "citybus":

      return extractCityBus62(
        html
      );


    case "portliner":

      return extractPortliner(
        html,
        source.direction
      );


    default:

      throw new Error(
        "未対応の路線タイプ"
      );

  }

}


/* =========================================================
   MAIN
========================================================= */

async function main() {

  const previous =
    loadSnapshot();


  const nextSnapshot =
    {};


  const results =
    [];


  let hasChanges =
    false;


  for (
    const source of SOURCES
  ) {

    console.log(
      `Checking: ${source.name} ${source.route}`
    );


    try {

      let timetable;


      /* ---------------------------------------------------
         阪急
      --------------------------------------------------- */

      if (
        source.type ===
        "hankyu"
      ) {

        await checkHankyu(
          source
        );

      }


      /* ---------------------------------------------------
         JR
      --------------------------------------------------- */

      else if (
        source.type ===
        "jr"
      ) {

        timetable =
          await fetchJR(
            source
          );

      }


      /* ---------------------------------------------------
         その他
      --------------------------------------------------- */

      else {

        const html =
          await fetchPage(
            source.url
          );


        timetable =
          await extractTimetable(
            source,
            html
          );

      }


      /*
       * 時刻表そのものをJSON化
       */
      const timetableText =
        JSON.stringify(
          timetable
        );


      const hash =
        createHash(
          timetableText
        );


      nextSnapshot[
        source.id
      ] = {

        hash,

        timetable,

        checkedAt:
          new Date()
            .toISOString()

      };


      const previousHash =
        previous[
          source.id
        ]?.hash;


      /* ---------------------------------------------------
         初回
      --------------------------------------------------- */

      if (
        !previousHash
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
            "初回登録"

        });


        continue;

      }


      /* ---------------------------------------------------
         変更なし
      --------------------------------------------------- */

      if (
        previousHash ===
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

      }


      /* ---------------------------------------------------
         変更あり
      --------------------------------------------------- */

      else {

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


        hasChanges =
          true;

      }

    }


    catch (
      error
    ) {

      console.error(
        `${source.name} ${source.route}`,
        error.message
      );


      /*
       * エラー時は既存snapshotを
       * 上書きしない。
       *
       * これが重要。
       *
       * 一時的な403や通信障害で
       * 正常な基準値を消さない。
       */
      if (
        previous[
          source.id
        ]
      ) {

        nextSnapshot[
          source.id
        ] =
          previous[
            source.id
          ];

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
          `確認エラー（${error.message}）`

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

      process.exit(
        1
      );

    }
  );
