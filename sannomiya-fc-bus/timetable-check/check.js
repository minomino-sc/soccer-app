/* =========================================================
   KOBE SANNOMIYA FC
   TIMETABLE AUTOMATIC CHECK

   公式時刻表 自動チェック

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
   ・公式ページ全体ではなく対象時刻表だけを比較します。
   ・取得失敗時は「変更なし」と判定しません。
   ・取得失敗時は前回の正常なスナップショットを保持します。
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
   SNAPSHOT VERSION
========================================================= */

/*
 * 抽出方法を変更したため、
 * 旧snapshotとの比較による誤検出を防ぐ。
 *
 * このバージョンで1回だけ基準値を作り、
 * 2回目以降から本当の変更を検出する。
 */

const SNAPSHOT_VERSION = 2;


/* =========================================================
   OFFICIAL SOURCES
========================================================= */

const SOURCES = [

  /* -------------------------------------------------------
     阪急バス
  ------------------------------------------------------- */

  {
    id: "hankyu_158",
    name: "阪急バス",
    route: "日の峰1丁目 → 谷上駅 158系統",
    url:
      "https://www.hankyubus.co.jp/rosen/timetable/",
    type: "hankyu"
  },


  /* -------------------------------------------------------
     神戸市営地下鉄
  ------------------------------------------------------- */

  {
    id: "subway_tanigami_sannomiya",
    name: "神戸市営地下鉄",
    route: "谷上駅 → 三宮駅",
    url:
      "https://kotsu.city.kobe.lg.jp/subway/timetable1/tanigami/",
    type: "subway",
    direction:
      "新神戸・三宮・名谷・西神中央方面行"
  },

  {
    id: "subway_sannomiya_tanigami",
    name: "神戸市営地下鉄",
    route: "三宮駅 → 谷上駅",
    url:
      "https://kotsu.city.kobe.lg.jp/subway/timetable1/sannomiya/",
    type: "subway",
    direction:
      "新神戸・谷上方面行"
  },


  /* -------------------------------------------------------
     ポートライナー
  ------------------------------------------------------- */

  {
    id: "portliner_sannomiya_boeki",
    name: "ポートライナー",
    route: "三宮駅 → 貿易センター駅",
    url:
      "https://www.knt-liner.co.jp/stationp01/",
    type: "portliner",
    direction:
      "神戸空港・北埠頭方面行"
  },

  {
    id: "portliner_boeki_sannomiya",
    name: "ポートライナー",
    route: "貿易センター駅 → 三宮駅",
    url:
      "https://www.knt-liner.co.jp/stationp02/",
    type: "portliner",
    direction:
      "三宮方面行"
  },


  /* -------------------------------------------------------
     神戸市バス
     ★ 62系統だけ
     ★ 111系統は完全に無視
  ------------------------------------------------------- */

  {
    id: "citybus_62",
    name: "神戸市バス",
    route: "谷上駅 → 神戸北町 62系統",
    url:
      "https://kotsu.city.kobe.lg.jp/bus/bus-stop-list/bus-836/",
    type: "citybus62"
  },


  /* -------------------------------------------------------
     JR西日本
  ------------------------------------------------------- */

  {
    id: "jr_sannomiya_nada",
    name: "JR西日本",
    route: "三ノ宮駅 → 灘駅",
    url:
      "https://timetable.jr-odekake.net/station-timetable/2807012002",
    type: "jr"
  },

  {
    id: "jr_nada_sannomiya",
    name: "JR西日本",
    route: "灘駅 → 三ノ宮駅",
    url:
      "https://timetable.jr-odekake.net/station-timetable/2806012001",
    type: "jr"
  }

];


/* =========================================================
   FETCH
========================================================= */

async function fetchPage(url) {

  const response = await fetch(url, {

    headers: {
      "User-Agent":
        "KOBE-SANNOMIYA-FC-Timetable-Checker/2.0",

      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
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
   NORMALIZE
========================================================= */

function normalize(text) {

  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[０-９]/g, char =>
      String.fromCharCode(
        char.charCodeAt(0) - 0xfee0
      )
    )
    .replace(/[：]/g, ":")
    .replace(/[●▼□]/g, "")
    .replace(/\s+/g, " ")
    .trim();

}


/* =========================================================
   HASH
========================================================= */

function createHash(text) {

  return crypto
    .createHash("sha256")
    .update(text, "utf8")
    .digest("hex");

}


/* =========================================================
   LOAD SNAPSHOT
========================================================= */

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


/* =========================================================
   SAVE JSON
========================================================= */

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


/* =========================================================
   TIME NORMALIZE
========================================================= */

function makeTime(hour, minute) {

  const h = Number(hour);
  const m = Number(minute);

  if (
    !Number.isInteger(h) ||
    !Number.isInteger(m)
  ) {
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


/* =========================================================
   UNIQUE SORT
========================================================= */

function uniqueSort(times) {

  return [
    ...new Set(times)
  ].sort();

}


/* =========================================================
   TABLE → TIMES
========================================================= */

function parseTimeTable($, table) {

  const result = [];

  $(table)
    .find("tr")
    .each((index, tr) => {

      const $tr = $(tr);

      const hourText =
        normalize(
          $tr
            .find("th")
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
        Number(hourMatch[1]);

      /*
       * 時刻セル
       */
      const minuteTexts = [];

      $tr
        .find("td")
        .each((i, td) => {

          minuteTexts.push(
            normalize(
              $(td).text()
            )
          );

        });

      const combined =
        minuteTexts.join(" ");

      /*
       * 公式ページの時刻表では
       * 1つの時セルに複数分が入る。
       */
      const minutes =
        combined.match(
          /\b\d{1,2}\b/g
        ) || [];

      minutes.forEach(minute => {

        const time =
          makeTime(
            hour,
            Number(minute)
          );

        if (time) {
          result.push(time);
        }

      });

    });

  return uniqueSort(result);

}


/* =========================================================
   SUBWAY
========================================================= */

function extractSubway(
  html,
  direction
) {

  const $ =
    cheerio.load(html);


  /*
   * 方向名を持つ要素を探す。
   */
  let directionElement = null;

  $("body *").each((index, element) => {

    if (directionElement) {
      return;
    }

    const text =
      normalize(
        $(element).text()
      );

    if (
      text === direction ||
      text.includes(direction)
    ) {

      /*
       * 大きすぎるbody等を除外
       */
      if (
        text.length < 300
      ) {

        directionElement =
          element;

      }

    }

  });


  if (!directionElement) {

    throw new Error(
      `対象方向「${direction}」が見つかりません`
    );

  }


  /*
   * 方向要素以降のtableを探す。
   */
  const allTables =
    $("table").toArray();


  const directionIndex =
    $("body *")
      .toArray()
      .indexOf(
        directionElement
      );


  const targetTables = [];


  for (
    const table of allTables
  ) {

    const tableIndex =
      $("body *")
        .toArray()
        .indexOf(
          table
        );

    if (
      tableIndex > directionIndex
    ) {

      const tableText =
        normalize(
          $(table).text()
        );

      /*
       * 時刻表らしいtableだけ。
       */
      if (
        tableText.includes("5") &&
        tableText.match(/\d{1,2}/)
      ) {

        targetTables.push(
          table
        );

      }

    }

  }


  /*
   * このページの先頭方向なら、
   * 最初の2つが対象。
   *
   * 三宮ページは
   * ①新神戸・谷上方面
   * ②名谷・西神中央方面
   * の順なので、
   * directionElementより後ろから
   * 次の方向が始まる前のtableを
   * 使う。
   */


  const times = [];

  for (
    const table of targetTables
  ) {

    const parsed =
      parseTimeTable(
        $,
        table
      );

    if (
      parsed.length >= 3
    ) {

      times.push(
        parsed
      );

    }

    if (
      times.length >= 2
    ) {
      break;
    }

  }


  if (!times.length) {

    throw new Error(
      `「${direction}」の時刻表を抽出できません`
    );

  }


  /*
   * 平日と土日祝
   */
  return {

    weekday:
      times[0] || [],

    weekend:
      times[1] || times[0] || []

  };

}


/* =========================================================
   CITY BUS 62
========================================================= */

function extractCityBus62(html) {

  const $ =
    cheerio.load(html);


  /*
   * ★ 62系統だけを見る。
   *
   * 111系統の文字列は、
   * この関数では一切使用しない。
   */

  const body =
    normalize(
      $("body").text()
    );


  const start =
    body.indexOf(
      "62系統 神戸北町方面行き"
    );


  if (start === -1) {

    throw new Error(
      "62系統 神戸北町方面行きが見つかりません"
    );

  }


  /*
   * 62系統セクションの終了位置。
   *
   * 「## 備考」に相当する
   * ・急印...
   * の直前までを対象にする。
   *
   * 111系統には進まない。
   */

  let sectionEnd =
    body.indexOf(
      "急印は急行６２系統",
      start
    );

  if (
    sectionEnd === -1
  ) {

    sectionEnd =
      body.indexOf(
        "急印は急行62系統",
        start
      );

  }


  if (
    sectionEnd === -1
  ) {

    /*
     * 念のため、
     * 111系統より前で止める。
     */
    const next111 =
      body.indexOf(
        "111系統",
        start + 1
      );

    if (next111 !== -1) {
      sectionEnd = next111;
    } else {
      sectionEnd = body.length;
    }

  }


  const section =
    body.substring(
      start,
      sectionEnd
    );


  /*
   * 5時〜23時の
   * 「時 → 分」の並びを抽出。
   *
   * 3ブロック
   * 平日
   * 土曜日
   * 日曜・祝日
   */
  const hourMatches = [];

  const hourRegex =
    /(\d{1,2})時/g;

  let match;

  while (
    (match =
      hourRegex.exec(section)) !== null
  ) {

    hourMatches.push({
      hour:
        Number(match[1]),
      index:
        match.index
    });

  }


  if (
    hourMatches.length < 3
  ) {

    throw new Error(
      "62系統の時刻データを抽出できません"
    );

  }


  /*
   * 5時の位置で
   * 3つの時刻表ブロックに分ける。
   */
  const fiveIndexes =
    hourMatches
      .filter(x => x.hour === 5)
      .map(x => x.index);


  if (
    fiveIndexes.length < 3
  ) {

    throw new Error(
      "62系統の平日・土曜・日祝の3ブロックを確認できません"
    );

  }


  function parseBlock(
    blockStart,
    blockEnd
  ) {

    const block =
      section.substring(
        blockStart,
        blockEnd
      );


    const matches = [];

    const regex =
      /(\d{1,2})時/g;

    let current;

    const hours = [];

    while (
      (current =
        regex.exec(block)) !== null
    ) {

      hours.push({
        hour:
          Number(current[1]),
        index:
          current.index
      });

    }


    for (
      let i = 0;
      i < hours.length;
      i++
    ) {

      const hour =
        hours[i].hour;

      const from =
        hours[i].index +
        hours[i][0]?.length ||
        hours[i].index;

      const to =
        i + 1 < hours.length
          ? hours[i + 1].index
          : block.length;


      const part =
        block.substring(
          from,
          to
        );


      const minutes =
        part.match(
          /\b\d{1,2}\b/g
        ) || [];


      minutes.forEach(minute => {

        const time =
          makeTime(
            hour,
            Number(minute)
          );

        if (time) {
          matches.push(time);
        }

      });

    }


    return uniqueSort(matches);

  }


  const weekday =
    parseBlock(
      fiveIndexes[0],
      fiveIndexes[1]
    );


  const saturday =
    parseBlock(
      fiveIndexes[1],
      fiveIndexes[2]
    );


  const holiday =
    parseBlock(
      fiveIndexes[2],
      section.length
    );


  if (!weekday.length) {

    throw new Error(
      "62系統 平日時刻表を抽出できません"
    );

  }


  if (!saturday.length) {

    throw new Error(
      "62系統 土曜日時刻表を抽出できません"
    );

  }


  if (!holiday.length) {

    throw new Error(
      "62系統 日曜・祝日時刻表を抽出できません"
    );

  }


  return {

    weekday,
    saturday,
    holiday

  };

}


/* =========================================================
   PORTLINER
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
                    times.push(time);
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
          /^\d{1,2}:\d{2}$/.test(
            value
          )
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
   HANKYU
========================================================= */

function extractHankyu() {

  /*
   * 現在は、
   * 「日の峰1丁目 → 谷上駅 158系統」
   * をGitHub Actionsから安定取得できる
   * 公式時刻表URLを確定できていない。
   *
   * 誤判定防止のため、
   * ここは確認エラーにする。
   */

  throw new Error(
    "158系統「日の峰1丁目 → 谷上駅」の公式時刻表を直接取得できません"
  );

}


/* =========================================================
   EXTRACT
========================================================= */

async function extractSource(
  source
) {

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
   MAIN
========================================================= */

async function main() {

  const previous =
    loadSnapshot();


  /*
   * snapshotのバージョンが違う場合、
   * 今回取得したデータを
   * 新しい基準として登録する。
   */
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

  let hasChanges = false;


  for (
    const source of SOURCES
  ) {

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
          new Date().toISOString()

      };


      /*
       * 新しい基準を作る場合
       */
      if (
        isNewBaseline
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


        continue;

      }


      const previousService =
        previous.services?.[
          source.id
        ];


      /*
       * 前回データが存在しない
       */
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


        continue;

      }


      /*
       * 変更なし
       */
      if (
        previousService.hash === hash
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


      /*
       * 本当に変更
       */
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


    catch (error) {

      console.error(
        `[ERROR] ${source.name} ${source.route}`
      );

      console.error(
        error.message
      );


      /*
       * 取得失敗時は、
       * 前回の正常データを保持。
       */
      const previousService =
        previous.services?.[
          source.id
        ];


      if (
        previousService
      ) {

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
    new Date().toISOString();


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
  .catch(error => {

    console.error(
      error
    );

    process.exit(1);

  });
