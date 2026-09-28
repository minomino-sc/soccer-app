/* =========================================================
   KOBE SANNOMIYA FC
   TIMETABLE AUTOMATIC CHECK

   公式時刻表 自動チェック

   ※ timetable.js は絶対に変更しません。

   監視対象
   ---------------------------------------------------------
   1. 阪急バス
      日の峰1丁目 → 谷上駅 158系統
      ※現在は未対応

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
   ・市バス111系統は完全に無視します。
   ・公式ページ全体ではなく対象時刻表だけを比較します。
   ・取得失敗時は「変更なし」にしません。
   ・取得失敗時は前回の正常なスナップショットを保持します。
   ・地下鉄／市バスの神戸市交通局ページは
     GitHub Actionsから403になる場合があるため、
     直接取得 → 取得できなければ読み取り用経路
     の順で取得します。
========================================================= */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cheerio = require("cheerio");

const STATUS_FILE = path.join(__dirname, "status.json");
const SNAPSHOT_FILE = path.join(__dirname, "snapshot.json");

const SNAPSHOT_VERSION = 3;


/* =========================================================
   監視対象
========================================================= */

const SOURCES = [

  /* -------------------------------------------------------
     阪急バス
     現在は後回し
  ------------------------------------------------------- */

  {
    id: "hankyu_158",
    name: "阪急バス",
    route: "日の峰1丁目 → 谷上駅 158系統",
    url: "https://www.hankyubus.co.jp/rosen/timetable/",
    type: "hankyu"
  },


  /* -------------------------------------------------------
     神戸市営地下鉄
  ------------------------------------------------------- */

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


  /* -------------------------------------------------------
     ポートライナー
  ------------------------------------------------------- */

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


  /* -------------------------------------------------------
     神戸市バス
     62系統だけを監視
     111系統は絶対に取得しない
  ------------------------------------------------------- */

  {
    id: "citybus_62",
    name: "神戸市バス",
    route: "谷上駅 → 神戸北町 62系統",
    url: "https://kotsu.city.kobe.lg.jp/bus/bus-stop-list/bus-836/",
    type: "citybus62"
  },


  /* -------------------------------------------------------
     JR西日本
  ------------------------------------------------------- */

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
   HTTP取得
========================================================= */

async function fetchPage(url) {

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/140.0 Safari/537.36",

    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9," +
      "image/avif,image/webp,*/*;q=0.8",

    "Accept-Language":
      "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",

    "Cache-Control":
      "no-cache",

    "Pragma":
      "no-cache"
  };


  /* -------------------------------------------------------
     まず公式ページを直接取得
  ------------------------------------------------------- */

  try {

    const response = await fetch(url, {
      headers,
      redirect: "follow"
    });

    if (response.ok) {

      const html = await response.text();

      if (html && html.length > 500) {
        console.log("  Direct fetch: OK");
        return html;
      }

    }

    console.log(
      `  Direct fetch failed: HTTP ${response.status}`
    );

  } catch (error) {

    console.log(
      `  Direct fetch error: ${error.message}`
    );

  }


  /* -------------------------------------------------------
     神戸市交通局ページだけフォールバック
     
     GitHub Actionsから403になる場合があるため、
     公式ページの内容を読み取るための経路を使用。
  ------------------------------------------------------- */

  if (url.includes("kotsu.city.kobe.lg.jp")) {

    const proxyUrl =
      "https://r.jina.ai/" + url;

    try {

      console.log("  Fallback fetch: " + proxyUrl);

      const response = await fetch(proxyUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 KOBE-SANNOMIYA-FC-Timetable-Checker"
        }
      });

      if (!response.ok) {
        throw new Error(
          `Fallback HTTP ${response.status}`
        );
      }

      const text = await response.text();

      if (!text || text.length < 100) {
        throw new Error(
          "Fallback response is empty"
        );
      }

      console.log("  Fallback fetch: OK");

      return text;

    } catch (error) {

      throw new Error(
        `公式ページ取得失敗: ${error.message}`
      );

    }

  }


  throw new Error(
    "公式ページ取得失敗"
  );
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

    .replace(/[●▼□○〇☆急]/g, " ")

    .replace(/\s+/g, " ")

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
    JSON.stringify(data, null, 2) + "\n",
    "utf8"
  );

}


function makeTime(hour, minute) {

  const h = Number(hour);
  const m = Number(minute);

  if (!Number.isInteger(h)) return null;
  if (!Number.isInteger(m)) return null;

  if (h < 0 || h > 23) return null;
  if (m < 0 || m > 59) return null;

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

function extractSubway(html, direction) {

  const $ = cheerio.load(html);

  const body =
    normalize(
      $("body").text()
    );


  /* -------------------------------------------------------
     対象方向を探す
  ------------------------------------------------------- */

  const start =
    body.indexOf(direction);

  if (start === -1) {

    throw new Error(
      `対象方向「${direction}」が見つかりません`
    );

  }


  let section =
    body.substring(start);


  /* -------------------------------------------------------
     三宮駅ページには

       新神戸・谷上方面行
       名谷・西神中央方面行

     の2方向がある。

     対象方向以外が出たところで切る。
  ------------------------------------------------------- */

  const otherDirections = [

    "新神戸・谷上方面行",

    "名谷・西神中央方面行",

    "新神戸・三宮・名谷・西神中央方面行"

  ];


  for (const other of otherDirections) {

    if (other === direction) {
      continue;
    }

    const index =
      section.indexOf(
        other,
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


  /* -------------------------------------------------------
     平日 / 土日祝
  ------------------------------------------------------- */

  const weekdayIndex =
    section.indexOf("平日");

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
      weekendIndex + "土日・祝日".length
    );


  /* -------------------------------------------------------
     時刻抽出
     
     例
       5 18 41 51
       6 2 10 18...
     
     時間を見つけたら、その後の分を
     次の時間まで取得。
  ------------------------------------------------------- */

  function parseText(text) {

    const result = [];

    const tokens =
      text
        .split(/\s+/)
        .filter(Boolean);


    let currentHour = null;


    for (const token of tokens) {

      if (/^\d{1,2}$/.test(token)) {

        const number =
          Number(token);

        if (
          number >= 0 &&
          number <= 23
        ) {

          currentHour =
            number;

          continue;

        }

      }


      if (currentHour === null) {
        continue;
      }


      const minuteMatch =
        token.match(
          /^\d{1,2}$/
        );

      if (!minuteMatch) {
        continue;
      }


      const minute =
        Number(
          minuteMatch[0]
        );


      if (
        minute >= 0 &&
        minute <= 59
      ) {

        const time =
          makeTime(
            currentHour,
            minute
          );

        if (time) {
          result.push(time);
        }

      }

    }


    return uniqueSort(result);

  }


  const weekday =
    parseText(weekdayText);

  const weekend =
    parseText(weekendText);


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

function extractCityBus62(html) {

  const $ = cheerio.load(html);

  const body =
    normalize(
      $("body").text()
    );


  /* -------------------------------------------------------
     重要
     
     「62系統 神戸北町方面行き」
     だけを開始地点にする。

     111系統は別セクションなので、
     そこへ到達したら絶対に取得しない。
  ------------------------------------------------------- */

  const startMatch =
    body.match(
      /62系統\s*神戸北町方面行き/
    );


  if (!startMatch) {

    throw new Error(
      "62系統 神戸北町方面行きが見つかりません"
    );

  }


  const start =
    startMatch.index;


  let section =
    body.substring(start);


  /* -------------------------------------------------------
     111系統が出たらそこで完全終了
  ------------------------------------------------------- */

  const endMarkers = [

    "111系統",

    "111 系統",

    "その他の系統"

  ];


  for (const marker of endMarkers) {

    const index =
      section.indexOf(
        marker,
        20
      );

    if (index !== -1) {

      section =
        section.substring(
          0,
          index
        );

      break;

    }

  }


  /* -------------------------------------------------------
     平日・土曜日・日曜祝日の3ブロック
     
     神戸市交通局ページは
     
       平日
       土曜日
       日曜・祝日
     
     の順。
  ------------------------------------------------------- */

  const weekdayIndex =
    section.indexOf("平日");

  const saturdayIndex =
    section.indexOf("土曜日");

  const holidayIndex =
    section.indexOf("日曜・祝日");


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


  /* -------------------------------------------------------
     各ブロックから時刻を抽出
     
     例:
       7時 45
       11時 00
       12時 30
  ------------------------------------------------------- */

  function parseBlock(text) {

    const result = [];

    const regex =
      /(\d{1,2})時/g;

    const hours = [];

    let match;


    while (
      (match = regex.exec(text))
        !== null
    ) {

      hours.push({

        hour:
          Number(match[1]),

        index:
          match.index,

        end:
          regex.lastIndex

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
          ? next.index
          : text.length;


      const minutesText =
        text.substring(
          from,
          to
        );


      const minutes =
        minutesText.match(
          /\b\d{1,2}\b/g
        ) || [];


      for (const minute of minutes) {

        const time =
          makeTime(
            current.hour,
            Number(minute)
          );


        if (time) {

          result.push(
            time
          );

        }

      }

    }


    return uniqueSort(result);

  }


  const weekday =
    parseBlock(
      weekdayText
    );


  const saturday =
    parseBlock(
      saturdayText
    );


  const holiday =
    parseBlock(
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
========================================================= */

function extractHankyu() {

  throw new Error(
    "158系統「日の峰1丁目 → 谷上駅」は現在未対応です"
  );

}


/* =========================================================
   各路線の抽出
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
   メイン処理
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
    const source of SOURCES
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


      /* ---------------------------------------------------
         初回 / バージョン変更
      --------------------------------------------------- */

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


      /* ---------------------------------------------------
         前回データなし
      --------------------------------------------------- */

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


      /* ---------------------------------------------------
         比較
      --------------------------------------------------- */

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


      /* ---------------------------------------------------
         取得失敗時は前回の正常データを維持
      --------------------------------------------------- */

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
