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
   SNAPSHOT VERSION
   ---------------------------------------------------------
   今回、地下鉄・市バスの抽出方式を変更したため、
   旧形式のsnapshotとは比較しない。
========================================================= */

const SNAPSHOT_VERSION = 5;


/* =========================================================
   OFFICIAL SOURCES
========================================================= */

const SOURCES = [

  /* =======================================================
     阪急バス
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
      "新神戸・三宮・名谷・西神中央方面行",

    subwayMode:
      "tanigami"
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
      "新神戸・谷上方面行",

    subwayMode:
      "sannomiya"
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
     -------------------------------------------------------
     62系統のみ。
     111系統は絶対に比較対象に含めない。
  ======================================================= */

  {
    id: "citybus_62",

    name: "神戸市バス",

    route:
      "谷上駅 → 神戸北町 62系統",

    type: "citybus",

    url:
      "https://kotsu.city.kobe.lg.jp/bus/bus-stop-list/bus-836/",

    routeTitle:
      "62系統 神戸北町方面行き"
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
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 " +
            "Chrome/140.0 Safari/537.36",

          "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

          "Accept-Language":
            "ja-JP,ja;q=0.9"
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

    const data =
      JSON.parse(
        fs.readFileSync(
          SNAPSHOT_FILE,
          "utf8"
        )
      );


    /*
     * 今回の方式変更前のsnapshotは
     * 比較対象にしない。
     */
    if (
      data &&
      data.__version &&
      data.__version !== SNAPSHOT_VERSION
    ) {

      console.log(
        "New snapshot format detected."
      );

      console.log(
        "Creating new baseline."
      );

      return {};

    }


    return data;

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
      /\u00a0/g,
      " "
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
    (a, b) => {

      const [ah, am] =
        a.split(":").map(Number);

      const [bh, bm] =
        b.split(":").map(Number);

      return (
        ah * 60 +
        am -
        (
          bh * 60 +
          bm
        )
      );

    }
  );

}


/* =========================================================
   SUBWAY
   ---------------------------------------------------------
   実際の公式HTML構造を直接解析する。

   route-destination
     └ route-destination__tab
         └ direction
     └ route-destination__tabitem.is-active
         └ route-timetable
             ├ green = 平日
             └ red   = 土日・祝日
========================================================= */

function extractSubway(
  html,
  direction,
  mode
) {

  const $ =
    cheerio.load(
      html
    );


  /* -------------------------------------------------------
     対象方向の route-destination を探す
  ------------------------------------------------------- */

  const route =
    $(".route-destination")
      .filter(
        (_, element) => {

          const text =
            normalizeText(
              $(element)
                .find(
                  ".route-destination__tab"
                )
                .text()
            );

          return text.includes(
            normalizeText(
              direction
            )
          );

        }
      )
      .first();


  if (
    !route.length
  ) {

    throw new Error(
      `対象方向「${direction}」が見つかりません`
    );

  }


  /* -------------------------------------------------------
     activeな方向ブロックを取得
  ------------------------------------------------------- */

  let routeItem =
    route
      .find(
        ".route-destination__tabitem.is-active"
      )
      .first();


  /*
   * 念のためactiveがない場合は
   * 最初のroute-destination__tabitemを使用。
   */
  if (
    !routeItem.length
  ) {

    routeItem =
      route
        .find(
          ".route-destination__tabitem"
        )
        .first();

  }


  if (
    !routeItem.length
  ) {

    throw new Error(
      "対象方向の時刻表ブロックが見つかりません"
    );

  }


  /* -------------------------------------------------------
     平日
  ------------------------------------------------------- */

  const weekdayTable =
    routeItem
      .find(
        ".route-timetable__col--green table"
      )
      .first();


  if (
    !weekdayTable.length
  ) {

    throw new Error(
      "平日時刻表を取得できません"
    );

  }


  /* -------------------------------------------------------
     土日祝
  ------------------------------------------------------- */

  const weekendTable =
    routeItem
      .find(
        ".route-timetable__col--red table"
      )
      .first();


  if (
    !weekendTable.length
  ) {

    throw new Error(
      "土日・祝日時刻表を取得できません"
    );

  }


  /*
   * 三宮 → 谷上の場合、
   *
   * ● = 新神戸行
   * 無印 = 谷上行
   *
   * なので ●付き時刻は除外する。
   */
  const filterTanigami =
    mode === "sannomiya";


  const weekday =
    normalizeSubwayTable(
      $,
      weekdayTable,
      filterTanigami
    );


  const weekend =
    normalizeSubwayTable(
      $,
      weekendTable,
      filterTanigami
    );


  if (
    !weekday.length ||
    !weekend.length
  ) {

    throw new Error(
      "地下鉄の時刻データを取得できません"
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
   SUBWAY TABLE NORMALIZE
========================================================= */

function normalizeSubwayTable(
  $,
  table,
  filterTanigami
) {

  const result =
    [];


  $(table)
    .find(
      "tbody > tr"
    )
    .each(
      (_, tr) => {

        const cells =
          $(tr)
            .find(
              "td"
            );


        if (
          cells.length < 2
        ) {

          return;

        }


        const hourText =
          normalizeText(
            cells
              .eq(0)
              .text()
          );


        if (
          !/^\d{1,2}$/.test(
            hourText
          )
        ) {

          return;

        }


        const hour =
          Number(
            hourText
          );


        if (
          hour < 0 ||
          hour > 23
        ) {

          return;

        }


        /*
         * 時刻セルは
         *
         * 18 41 51
         *
         * ●45
         * 55
         *
         * ▼57
         *
         * のような形式。
         */
        const minuteText =
          normalizeText(
            cells
              .eq(1)
              .text()
          );


        /*
         * 空白で分割。
         */
        const tokens =
          minuteText
            .split(
              /\s+/
            )
            .filter(
              Boolean
            );


        for (
          let token of tokens
        ) {

          token =
            token
              .replace(
                /,/g,
                ""
              );


          /*
           * 三宮 → 谷上
           *
           * ● = 新神戸行
           * これは谷上には行かないので除外。
           */
          if (
            filterTanigami &&
            token.includes("●")
          ) {

            continue;

          }


          /*
           * 谷上側の ▼ は
           * 行先注記なので時刻自体は残す。
           */
          token =
            token
              .replace(
                /[●▼]/g,
                ""
              );


          /*
           * 念のため数字以外の
           * 注記が付いていても時刻だけ取得。
           */
          const match =
            token.match(
              /\d{1,2}/
            );


          if (!match) {

            continue;

          }


          const minute =
            Number(
              match[0]
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
    );


  return result;

}


/* =========================================================
   CITY BUS 62
   ---------------------------------------------------------
   62系統のHTMLブロックだけを取得。

   111系統が後ろに続いていても、
   62系統のブロック外は一切解析しない。
========================================================= */

function extractCityBus62(
  html
) {

  const $ =
    cheerio.load(
      html
    );


  /*
   * まず「62系統 神戸北町方面行き」を含む
   * 最も適切なrouteブロックを探す。
   */
  let routeElement =
    null;


  $("details, .route-acc, .accordion-simple__item")
    .each(
      (_, element) => {

        if (
          routeElement
        ) {

          return;

        }


        const text =
          normalizeText(
            $(element)
              .text()
          );


        if (
          text.includes(
            "62系統 神戸北町方面行き"
          )
        ) {

          routeElement =
            element;

        }

      }
    );


  /*
   * details等が見つからない場合は、
   * 「62系統」文字列を含む要素を上位方向へ探す。
   */
  if (
    !routeElement
  ) {

    $("*")
      .each(
        (_, element) => {

          if (
            routeElement
          ) {

            return;

          }


          const text =
            normalizeText(
              $(element)
                .text()
            );


          if (
            text.includes(
              "62系統 神戸北町方面行き"
            ) &&
            text.length < 30000
          ) {

            routeElement =
              element;

          }

        }
      );

  }


  if (
    !routeElement
  ) {

    throw new Error(
      "62系統 神戸北町方面行き が見つかりません"
    );

  }


  const $route =
    $(routeElement);


  const routeText =
    normalizeText(
      $route.text()
    );


  /*
   * 念のため、routeElement内に111系統が混入していた場合は
   * 62系統見出しから111系統見出しまでを切り出す。
   */
  const start =
    routeText.indexOf(
      "62系統 神戸北町方面行き"
    );


  if (
    start < 0
  ) {

    throw new Error(
      "62系統の対象ブロックを取得できません"
    );

  }


  const end =
    routeText.indexOf(
      "111系統",
      start + 10
    );


  const sectionText =
    end >= 0
      ? routeText.slice(
          start,
          end
        )
      : routeText.slice(
          start
        );


  /*
   * 平日
   */
  const weekday =
    extractCityBusTab(
      sectionText,
      "平日",
      "土曜日"
    );


  /*
   * 土曜日
   */
  const saturday =
    extractCityBusTab(
      sectionText,
      "土曜日",
      "日曜・祝日"
    );


  /*
   * 日曜・祝日
   */
  const holiday =
    extractCityBusTab(
      sectionText,
      "日曜・祝日",
      null
    );


  if (
    !weekday.length &&
    !saturday.length &&
    !holiday.length
  ) {

    throw new Error(
      "62系統の時刻データを取得できません"
    );

  }


  /*
   * 実際の公式ページでは
   * 土曜日と日曜・祝日が同じ場合もあるが、
   * 変更検知では別々に保持する。
   */
  return {

    weekday:
      uniqueSorted(
        weekday
      ),

    saturday:
      uniqueSorted(
        saturday
      ),

    holiday:
      uniqueSorted(
        holiday
      )

  };

}


/* =========================================================
   CITY BUS TAB
========================================================= */

function extractCityBusTab(
  text,
  startLabel,
  endLabel
) {

  const start =
    text.indexOf(
      startLabel
    );


  if (
    start < 0
  ) {

    return [];

  }


  const from =
    start +
    startLabel.length;


  let to =
    text.length;


  if (
    endLabel
  ) {

    const found =
      text.indexOf(
        endLabel,
        from
      );


    if (
      found >= 0
    ) {

      to =
        found;

    }

  }


  const section =
    text.slice(
      from,
      to
    );


  return extractJapaneseClockRows(
    section
  );

}


/* =========================================================
   JAPANESE CLOCK ROWS
   ---------------------------------------------------------
   例：

   7時45急
   11時00○
   15時00○30○
   20時00☆急30☆急
   22時12☆急26☆急53☆
========================================================= */

function extractJapaneseClockRows(
  text
) {

  const result =
    [];


  /*
   * 「○」「☆」「急」などの注記は無視し、
   * 時刻部分だけ取得する。
   *
   * 次の「○○時」までを1ブロックとする。
   */
  const regex =
    /(\d{1,2})時([\s\S]*?)(?=\d{1,2}時|$)/g;


  let match;


  while (
    (match = regex.exec(text))
      !== null
  ) {

    const hour =
      Number(
        match[1]
      );


    if (
      hour < 0 ||
      hour > 23
    ) {

      continue;

    }


    const content =
      match[2];


    /*
     * この時刻ブロックから
     * 0〜59分だけを抽出。
     *
     * ただしHTMLやURL等に含まれる数字が
     * 混ざらないよう、時刻ブロック内だけを見る。
     */
    const minuteMatches =
      content.match(
        /\d{1,2}/g
      );


    if (!minuteMatches) {

      continue;

    }


    for (
      const raw of minuteMatches
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
   HANKYU BUS 158
   ---------------------------------------------------------
   対象：
   日の峰1丁目
   158系統
   谷上駅

   阪急バス公式の停留所時刻表を取得する。

   平日：
   158系統 → 谷上駅

   土休日：
   158系統 → 谷上駅

   ※ 150系統など他系統は比較対象にしない。
========================================================= */

async function checkHankyu(
  source
) {

  /*
   * 阪急バス公式の
   * 「日の峰1丁目」停留所時刻表
   *
   * 2026年2月1日現在
   */
  const url =
    "https://transfer-cloud.navitime.biz/hankyubus/courses/timetables?busstop=00021667&timetable-id=856401";


  const html =
    await fetchPage(
      url
    );


  const timetable =
    extractHankyu158(
      html
    );


  if (
    !timetable.weekday.length &&
    !timetable.weekend.length
  ) {

    throw new Error(
      "158系統 谷上駅行きの時刻表を取得できません"
    );

  }


  return timetable;

}


/* =========================================================
   HANKYU 158 EXTRACTION
========================================================= */

function extractHankyu158(
  html
) {

  const $ =
    cheerio.load(
      html
    );


  const weekday =
    [];


  const weekend =
    [];


  /*
   * -------------------------------------------------------
   * 阪急公式ページの構造
   *
   * 平日
   *   系統 [158] [150]
   *   行先 谷上駅 ...
   *
   * 土休日
   *   系統 [158] [150]
   *   行先 谷上駅 ...
   *
   * 158は左側の列。
   * -------------------------------------------------------
   */


  const tables =
    $("table");


  let foundWeekday =
    false;


  let foundWeekend =
    false;


  tables.each(
    (_, table) => {

      const tableText =
        normalizeText(
          $(table).text()
        );


      /*
       * 158と谷上駅の両方が存在する
       * テーブルだけを対象にする。
       */
      if (
        !tableText.includes("[158]") ||
        !tableText.includes("谷上駅")
      ) {

        return;

      }


      /*
       * テーブル内の行を解析。
       */
      const rows =
        [];


      $(table)
        .find("tr")
        .each(
          (_, tr) => {

            const cells =
              $(tr)
                .find("th,td")
                .map(
                  (_, cell) =>
                    normalizeText(
                      $(cell).text()
                    )
                )
                .get();


            if (
              cells.length
            ) {

              rows.push(
                cells
              );

            }

          }
        );


      if (
        !rows.length
      ) {

        return;

      }


      /*
       * [158]列を探す。
       */
      let routeIndex =
        -1;


      let routeHeaderRow =
        -1;


      for (
        let r = 0;
        r < rows.length;
        r++
      ) {

        const index =
          rows[r].findIndex(
            cell =>
              cell === "[158]" ||
              cell.includes("[158]")
          );


        if (
          index >= 0
        ) {

          routeIndex =
            index;

          routeHeaderRow =
            r;

          break;

        }

      }


      if (
        routeIndex < 0
      ) {

        return;

      }


      /*
       * 158列のすぐ近くに
       * 「谷上駅」があることを確認。
       */
      let isTanigami =
        false;


      for (
        let r = routeHeaderRow;
        r < Math.min(
          rows.length,
          routeHeaderRow + 5
        );
        r++
      ) {

        if (
          rows[r].some(
            cell =>
              cell.includes("谷上駅")
          )
        ) {

          isTanigami =
            true;

          break;

        }

      }


      if (
        !isTanigami
      ) {

        return;

      }


      /*
       * 時刻行を取得。
       *
       * 例：
       *
       * 8 | 47
       * 9 | 16 58
       * 10 | 22
       */
      for (
        let r = routeHeaderRow + 1;
        r < rows.length;
        r++
      ) {

        const row =
          rows[r];


        /*
         * 時刻の行では、
         * 左右に「8」「9」「10」などの
         * hourセルが存在する。
         *
         * 最初の1～2桁を時刻として扱う。
         */
        let hourIndex =
          -1;


        let hour =
          -1;


        for (
          let c = 0;
          c < row.length;
          c++
        ) {

          if (
            /^\d{1,2}$/.test(
              row[c]
            )
          ) {

            const value =
              Number(
                row[c]
              );


            if (
              value >= 0 &&
              value <= 23
            ) {

              hourIndex =
                c;

              hour =
                value;

              break;

            }

          }

        }


        if (
          hourIndex < 0
        ) {

          continue;

        }


        /*
         * 158列のセルを取得。
         */
        if (
          routeIndex >= row.length
        ) {

          continue;

        }


        const timeCell =
          row[
            routeIndex
          ];


        /*
         * 空欄は便なし。
         */
        if (
          !timeCell
        ) {

          continue;

        }


        /*
         * 158列に入っている
         * 分だけを取得。
         *
         * 遅延情報などが入っても
         * 数字だけを見る。
         */
        const minutes =
          timeCell.match(
            /\d{1,2}/g
          );


        if (
          !minutes
        ) {

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
              weekday,
              hour,
              minute
            );

          }

        }

      }


      /*
       * このテーブルが平日か土休日かを
       * テーブル周辺のテキストから判定。
       */
      const parentText =
        normalizeText(
          $(table)
            .parent()
            .text()
        );


      /*
       * 「土休日」が含まれるテーブルは
       * 土休日として扱う。
       */
      if (
        parentText.includes("土休日") ||
        parentText.includes("土・休日")
      ) {

        /*
         * 現在weekdayに入れた値を
         * weekendへ移動。
         */
        weekend.push(
          ...weekday
        );

        weekday.length =
          0;

        foundWeekend =
          true;

      }

      else {

        foundWeekday =
          true;

      }

    }
  );


  /*
   * -------------------------------------------------------
   * 上のDOM解析でページ構造に依存しすぎないよう、
   * bodyテキストからのフォールバックも用意する。
   * -------------------------------------------------------
   */

  if (
    !weekday.length &&
    !weekend.length
  ) {

    const body =
      normalizeText(
        $("body").text()
      );


    const weekdayStart =
      body.indexOf(
        "曜日 平日"
      );


    const holidayStart =
      body.indexOf(
        "曜日 土休日"
      );


    if (
      weekdayStart >= 0
    ) {

      const weekdayEnd =
        holidayStart > weekdayStart
          ? holidayStart
          : body.length;


      const weekdayText =
        body.slice(
          weekdayStart,
          weekdayEnd
        );


      extractHankyuTextTimes(
        weekdayText,
        weekday
      );

    }


    if (
      holidayStart >= 0
    ) {

      const holidayText =
        body.slice(
          holidayStart
        );


      extractHankyuTextTimes(
        holidayText,
        weekend
      );

    }

  }


  /*
   * -------------------------------------------------------
   * 最終確認
   * -------------------------------------------------------
   */

  if (
    !weekday.length &&
    !weekend.length
  ) {

    throw new Error(
      "158系統 谷上駅行きの時刻データが見つかりません"
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
   HANKYU TEXT FALLBACK
========================================================= */

function extractHankyuTextTimes(
  text,
  result
) {

  /*
   * 158系統の行先が
   * 谷上駅であることを確認。
   */
  if (
    !text.includes(
      "[158]"
    ) ||
    !text.includes(
      "谷上駅"
    )
  ) {

    return;

  }


  /*
   * 時刻表部分から
   *
   * 8 47
   * 9 16 58
   *
   * のような形を取得。
   *
   * 「系統」「行先」などの数字は
   * 時刻として扱わない。
   */

  const lines =
    text.split(
      /\s+/
    );


  let currentHour =
    null;


  for (
    const token of lines
  ) {

    /*
     * 時刻表の時間
     */
    if (
      /^\d{1,2}$/.test(
        token
      )
    ) {

      const value =
        Number(
          token
        );


      if (
        value >= 6 &&
        value <= 22
      ) {

        currentHour =
          value;

        continue;

      }

    }


    /*
     * 分
     */
    if (
      currentHour !== null &&
      /^\d{1,2}$/.test(
        token
      )
    ) {

      const minute =
        Number(
          token
        );


      if (
        minute >= 0 &&
        minute <= 59
      ) {

        addTime(
          result,
          currentHour,
          minute
        );

      }

    }

  }

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
        source.direction,
        source.subwayMode
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
    {

      __version:
        SNAPSHOT_VERSION

    };


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

        console.log(
          "  → 基準登録"
        );


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


      /* ---------------------------------------------------
         変更なし
      --------------------------------------------------- */

      if (
        previousHash ===
        hash
      ) {

        console.log(
          "  → 変更なし"
        );


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

        console.log(
          "  → 時刻表変更を検出"
        );


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
        `[ERROR] ${source.name} ${source.route}`,
        error.message
      );


      /*
       * エラー時は既存snapshotを保持。
       *
       * 一時的な通信エラー等で
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
