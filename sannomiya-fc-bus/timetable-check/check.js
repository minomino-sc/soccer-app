/* =========================================================
   KOBE SANNOMIYA FC
   公式時刻表 自動チェック

   重要
   ・timetable.js は絶対に変更しない
   ・公式ページの「実際の時刻」だけを比較
   ・更新日、ページデザイン、お知らせ等は無視
   ・解析できない場合は「確認エラー」
   ・初回は現在の時刻表を基準値として保存
   ・旧snapshotが別形式なら自動的に基準値を作り直す

   監視対象

   ① 阪急バス
      日の峰1丁目 → 谷上駅
      158系統

   ② 神戸市営地下鉄
      谷上駅 → 三宮駅
      三宮駅 → 谷上駅

   ③ 神戸市バス
      谷上駅 → 神戸北町
      62系統

   ④ ポートライナー
      三宮駅 → 貿易センター駅
      貿易センター駅 → 三宮駅

   ⑤ JR西日本
      三ノ宮駅 → 灘駅
      灘駅 → 三ノ宮駅
========================================================= */

const fs = require("fs");
const crypto = require("crypto");
const cheerio = require("cheerio");

const BASE =
  "sannomiya-fc-bus/timetable-check";

const SNAPSHOT_FILE =
  `${BASE}/snapshot.json`;

const STATUS_FILE =
  `${BASE}/status.json`;


/*
 * 今回の解析方式は全面変更
 * → 旧snapshotは基準値として使用しない
 */
const SCHEMA_VERSION = 6;


/* =========================================================
   URL
========================================================= */

const URLS = {

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
   表示名
========================================================= */

const NAMES = {

  subwayTanigami:
    "神戸市営地下鉄 谷上駅 → 三宮駅",

  subwaySannomiya:
    "神戸市営地下鉄 三宮駅 → 谷上駅",

  cityBus62:
    "神戸市バス 谷上駅 → 神戸北町 62系統",

  portlinerSannomiya:
    "ポートライナー 三宮駅 → 貿易センター駅",

  portlinerBoeki:
    "ポートライナー 貿易センター駅 → 三宮駅",

  jrSannomiya:
    "JR西日本 三ノ宮駅 → 灘駅",

  jrNada:
    "JR西日本 灘駅 → 三ノ宮駅"

};


/* =========================================================
   共通
========================================================= */

function now() {

  return new Date().toISOString();

}


function hash(text) {

  return crypto
    .createHash("sha256")
    .update(text)
    .digest("hex");

}


function normalize(text) {

  return String(text || "")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();

}


/* =========================================================
   HTML取得
========================================================= */

async function fetchHtml(url) {

  const response =
    await fetch(url, {

      redirect: "follow",

      headers: {

        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",

        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

        "Accept-Language":
          "ja-JP,ja;q=0.9,en-US;q=0.8"

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
   時刻データ共通
========================================================= */

function addRow(
  result,
  hour,
  minutes
) {

  if (
    hour < 0 ||
    hour > 24
  ) {

    return;

  }


  const clean =
    minutes

      .map(Number)

      .filter(
        n =>
          n >= 0 &&
          n <= 59
      )

      .map(
        n =>
          String(n).padStart(2, "0")
      );


  if (!clean.length) {

    return;

  }


  let row =
    result.find(
      r => r.hour === hour
    );


  if (!row) {

    row = {

      hour,

      minutes: []

    };

    result.push(row);

  }


  for (const minute of clean) {

    if (
      !row.minutes.includes(minute)
    ) {

      row.minutes.push(minute);

    }

  }

}


function normalizeTimetable(data) {

  return data

    .map(row => ({

      hour:
        Number(row.hour),

      minutes:
        [...new Set(
          row.minutes
        )]
        .sort(
          (a, b) =>
            Number(a) - Number(b)
        )

    }))

    .filter(
      row =>
        row.minutes.length > 0
    )

    .sort(
      (a, b) =>
        a.hour - b.hour
    );

}


/* =========================================================
   テーブル解析
========================================================= */

function parseTimetableTable(table) {

  const result = [];


  table.find("tr").each(
    (_, tr) => {

      const cells =
        cheerio(tr)
          .find("th,td")
          .map(
            (_, el) =>
              normalize(
                cheerio(el).text()
              )
          )
          .get();


      if (
        cells.length < 2
      ) {

        return;

      }


      const hourMatch =
        cells[0].match(
          /^(\d{1,2})$/
        );


      if (!hourMatch) {

        return;

      }


      const hour =
        Number(hourMatch[1]);


      /*
       * 行全体から数字を取得。
       *
       * 地下鉄：
       * 18 41 51
       *
       * ポートライナー：
       * 40 北50
       *
       * などに対応。
       */

      const minutes =
        cells
          .slice(1)
          .join(" ")
          .match(/\d{1,2}/g) || [];


      addRow(
        result,
        hour,
        minutes
      );

    }
  );


  return normalizeTimetable(
    result
  );

}


/* =========================================================
   地下鉄
========================================================= */

function extractSubway(
  html,
  direction
) {

  const $ =
    cheerio.load(html);


  const tables =
    $("table");


  /*
   * 対象方向を含む最初の
   * 時刻表テーブルを探す。
   */

  let target =
    null;


  tables.each(
    (_, table) => {

      if (target) {

        return;

      }


      const text =
        normalize(
          $(table).text()
        );


      if (
        text.includes(
          direction
        )
      ) {

        target =
          $(table);

      }

    }
  );


  /*
   * 方向名がtable内にない場合、
   * 最初に十分な時刻行を持つtableを使用。
   */

  if (!target) {

    tables.each(
      (_, table) => {

        if (target) {

          return;

        }


        const data =
          parseTimetableTable(
            $(table)
          );


        if (
          data.length >= 5
        ) {

          target =
            $(table);

        }

      }
    );

  }


  if (!target) {

    throw new Error(
      "地下鉄の時刻表テーブルが見つかりません"
    );

  }


  const data =
    parseTimetableTable(
      target
    );


  if (
    data.length < 5
  ) {

    throw new Error(
      "地下鉄の時刻データを取得できません"
    );

  }


  return data;

}


function extractSubwayTanigami(html) {

  return extractSubway(
    html,
    "新神戸・三宮・名谷・西神中央方面行"
  );

}


function extractSubwaySannomiya(html) {

  return extractSubway(
    html,
    "新神戸・谷上方面行"
  );

}


/* =========================================================
   神戸市バス 62系統
========================================================= */

function extractCityBus62(html) {

  const $ =
    cheerio.load(html);


  const text =
    normalize(
      $("body").text()
    );


  const start =
    text.indexOf(
      "62系統 神戸北町方面行き"
    );


  if (
    start === -1
  ) {

    throw new Error(
      "62系統 神戸北町方面行きが見つかりません"
    );

  }


  const end =
    text.indexOf(
      "111系統",
      start
    );


  if (
    end === -1
  ) {

    throw new Error(
      "62系統の終了位置が見つかりません"
    );

  }


  const section =
    text.slice(
      start,
      end
    );


  /*
   * 62系統の平日部分だけ取得。
   *
   * 構造：
   *
   * 平日
   * 5時
   * 6時
   * 7時 45急
   * ...
   *
   * 土曜日
   * ...
   */

  const weekdayStart =
    section.indexOf("平日");


  const saturdayStart =
    section.indexOf(
      "土曜日",
      weekdayStart + 2
    );


  if (
    weekdayStart === -1 ||
    saturdayStart === -1
  ) {

    throw new Error(
      "62系統の平日部分が見つかりません"
    );

  }


  const weekday =
    section.slice(
      weekdayStart + 2,
      saturdayStart
    );


  const result = [];


  /*
   * 「7時45急」
   * 「15時00○30○」
   * などを処理。
   */

  const hourRegex =
    /(\d{1,2})時([\s\S]*?)(?=\d{1,2}時|$)/g;


  let match;


  while (
    (match =
      hourRegex.exec(weekday))
  ) {

    const hour =
      Number(match[1]);


    const body =
      match[2];


    const minutes =
      body.match(
        /\d{1,2}/g
      ) || [];


    addRow(
      result,
      hour,
      minutes
    );

  }


  const data =
    normalizeTimetable(
      result
    );


  if (
    !data.length
  ) {

    throw new Error(
      "62系統の時刻データを取得できません"
    );

  }


  return data;

}


/* =========================================================
   ポートライナー
========================================================= */

function findPortlinerTable(
  html,
  direction
) {

  const $ =
    cheerio.load(html);


  let target =
    null;


  $("table").each(
    (_, table) => {

      if (target) {

        return;

      }


      const text =
        normalize(
          $(table).text()
        );


      if (
        text.includes(direction)
      ) {

        /*
         * 最初の方向該当table
         * → 平日ダイヤ
         */

        target =
          $(table);

      }

    }
  );


  if (!target) {

    throw new Error(
      `ポートライナー「${direction}」の時刻表が見つかりません`
    );

  }


  const result = [];


  target.find("tr").each(
    (_, tr) => {

      const hourCell =
        $(tr)
          .find(
            "th.hour"
          )
          .first();


      if (
        !hourCell.length
      ) {

        return;

      }


      const hour =
        Number(
          normalize(
            hourCell.text()
          )
        );


      if (
        Number.isNaN(hour)
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
              normalize(
                $(el).text()
              )
          )
          .get()
          .map(
            Number
          );


      addRow(
        result,
        hour,
        minutes
      );

    }
  );


  const data =
    normalizeTimetable(
      result
    );


  if (
    !data.length
  ) {

    throw new Error(
      "ポートライナーの時刻データを取得できません"
    );

  }


  return data;

}


function extractPortlinerSannomiya(html) {

  return findPortlinerTable(
    html,
    "神戸空港・北埠頭方面行"
  );

}


function extractPortlinerBoeki(html) {

  return findPortlinerTable(
    html,
    "三宮方面行"
  );

}


/* =========================================================
   JR
========================================================= */

function getWeekdayDate() {

  const date =
    new Date();


  /*
   * 日本時間で取得
   */

  const japan =
    new Date(
      date.toLocaleString(
        "en-US",
        {
          timeZone:
            "Asia/Tokyo"
        }
      )
    );


  /*
   * 土日なら次の月曜日
   */

  const day =
    japan.getDay();


  if (
    day === 6
  ) {

    japan.setDate(
      japan.getDate() + 2
    );

  } else if (
    day === 0
  ) {

    japan.setDate(
      japan.getDate() + 1
    );

  }


  const y =
    japan.getFullYear();

  const m =
    String(
      japan.getMonth() + 1
    ).padStart(2, "0");

  const d =
    String(
      japan.getDate()
    ).padStart(2, "0");


  return `${y}${m}${d}`;

}


async function fetchJRHtml(url) {

  const date =
    getWeekdayDate();


  const separator =
    url.includes("?")
      ? "&"
      : "?";


  return fetchHtml(
    `${url}${separator}date=${date}`
  );

}


function extractJR(html) {

  const $ =
    cheerio.load(html);


  const result = [];


  /*
   * JRの実際のHTML構造
   *
   * .accordion-item
   *   .accordion-title
   *   .departure-time
   */

  $(".accordion-item").each(
    (_, item) => {

      const hourText =
        normalize(
          $(item)
            .find(
              ".accordion-title"
            )
            .first()
            .text()
        );


      const hourMatch =
        hourText.match(
          /(\d{1,2})/
        );


      if (!hourMatch) {

        return;

      }


      const hour =
        Number(
          hourMatch[1]
        );


      const minutes =
        $(item)
          .find(
            ".departure-time"
          )
          .map(
            (_, el) => {

              const text =
                normalize(
                  $(el).text()
                );


              const match =
                text.match(
                  /(\d{1,2}):(\d{2})/
                );


              return match
                ? Number(match[2])
                : null;

            }
          )
          .get()
          .filter(
            value =>
              value !== null
          );


      addRow(
        result,
        hour,
        minutes
      );

    }
  );


  /*
   * 念のためtable形式にも対応。
   */

  if (
    result.length < 5
  ) {

    $("table").each(
      (_, table) => {

        const data =
          parseTimetableTable(
            $(table)
          );


        if (
          data.length >= 5 &&
          result.length < 5
        ) {

          for (
            const row of data
          ) {

            addRow(
              result,
              row.hour,
              row.minutes
            );

          }

        }

      }
    );

  }


  const data =
    normalizeTimetable(
      result
    );


  if (
    data.length < 5
  ) {

    throw new Error(
      "JR時刻表を取得できません"
    );

  }


  return data;

}


/* =========================================================
   差分
========================================================= */

function diffTimetable(
  oldData,
  newData
) {

  const oldMap =
    new Map();

  const newMap =
    new Map();


  for (
    const row of oldData || []
  ) {

    oldMap.set(
      row.hour,
      row.minutes
    );

  }


  for (
    const row of newData || []
  ) {

    newMap.set(
      row.hour,
      row.minutes
    );

  }


  const hours =
    [
      ...new Set([
        ...oldMap.keys(),
        ...newMap.keys()
      ])
    ]
    .sort(
      (a, b) => a - b
    );


  const changes = [];


  for (
    const hour of hours
  ) {

    const oldMinutes =
      oldMap.get(hour) || [];

    const newMinutes =
      newMap.get(hour) || [];


    if (
      JSON.stringify(oldMinutes) !==
      JSON.stringify(newMinutes)
    ) {

      changes.push({

        hour,

        oldMinutes,

        newMinutes

      });

    }

  }


  return changes;

}


/* =========================================================
   JSON
========================================================= */

function loadJson(file) {

  if (
    !fs.existsSync(file)
  ) {

    return null;

  }


  try {

    return JSON.parse(
      fs.readFileSync(
        file,
        "utf8"
      )
    );

  } catch {

    return null;

  }

}


/* =========================================================
   サービスチェック
========================================================= */

async function checkService(options) {

  const {
    key,
    url,
    name,
    parser,
    oldSnapshot,
    baselineValid,
    newSnapshot,
    status,
    fetcher
  } = options;


  try {

    const html =
      fetcher
        ? await fetcher(url)
        : await fetchHtml(url);


    const data =
      normalizeTimetable(
        parser(html)
      );


    if (
      !data.length
    ) {

      throw new Error(
        "時刻データが空です"
      );

    }


    const dataHash =
      hash(
        JSON.stringify(data)
      );


    newSnapshot.services[key] = {

      name,

      url,

      hash:
        dataHash,

      data

    };


    /*
     * 初回 / schema変更
     */

    if (
      !baselineValid
    ) {

      console.log(
        `🟡 ${name}`
      );

      console.log(
        "基準値を作成"
      );

      console.log("");


      status.services[key] = {

        status:
          "initialized",

        name

      };


      return "initialized";

    }


    const old =
      oldSnapshot.services[key];


    if (
      !old ||
      !Array.isArray(old.data)
    ) {

      console.log(
        `🟡 ${name}`
      );

      console.log(
        "基準値を作成"
      );

      console.log("");


      status.services[key] = {

        status:
          "initialized",

        name

      };


      return "initialized";

    }


    const changes =
      diffTimetable(
        old.data,
        data
      );


    if (
      !changes.length
    ) {

      console.log(
        `🟢 ${name}`
      );

      console.log(
        "変更なし"
      );

      console.log("");


      status.services[key] = {

        status:
          "ok",

        name

      };


      return "ok";

    }


    console.log(
      `🔴 ${name}`
    );

    console.log(
      "変更を検出"
    );


    for (
      const change of changes
    ) {

      console.log(
        `  ${change.hour}時`
      );

      console.log(
        `    旧: ${
          change.oldMinutes.length
            ? change.oldMinutes.join(" ")
            : "なし"
        }`
      );

      console.log(
        `    新: ${
          change.newMinutes.length
            ? change.newMinutes.join(" ")
            : "なし"
        }`
      );

    }


    console.log("");


    status.services[key] = {

      status:
        "changed",

      name,

      changes

    };


    return "changed";

  } catch (error) {

    console.log(
      `⚠️ ${name}`
    );

    console.log(
      "確認エラー"
    );

    console.log(
      `  ${error.message}`
    );

    console.log("");


    /*
     * エラー時は
     * 前回正常値を維持
     */

    if (
      baselineValid &&
      oldSnapshot.services[key]
    ) {

      newSnapshot.services[key] =
        oldSnapshot.services[key];

    }


    status.services[key] = {

      status:
        "error",

      name,

      error:
        error.message

    };


    return "error";

  }

}


/* =========================================================
   メイン
========================================================= */

async function main() {

  console.log("");

  console.log(
    "🔍 KOBE SANNOMIYA FC"
  );

  console.log(
    "公式時刻表 自動チェック"
  );

  console.log("");


  const oldSnapshot =
    loadJson(
      SNAPSHOT_FILE
    );


  const baselineValid =
    oldSnapshot &&
    oldSnapshot.schemaVersion ===
      SCHEMA_VERSION &&
    oldSnapshot.services;


  const newSnapshot = {

    schemaVersion:
      SCHEMA_VERSION,

    checkedAt:
      now(),

    services: {}

  };


  const status = {

    schemaVersion:
      SCHEMA_VERSION,

    checkedAt:
      now(),

    hasChanges:
      false,

    hasErrors:
      false,

    services: {}

  };


  let hasChanged =
    false;

  let hasError =
    false;


  /*
   * =======================================================
   * 地下鉄
   * =======================================================
   */

  const results = [];


  results.push(
    await checkService({

      key:
        "subwayTanigami",

      url:
        URLS.subwayTanigami,

      name:
        NAMES.subwayTanigami,

      parser:
        extractSubwayTanigami,

      oldSnapshot,

      baselineValid,

      newSnapshot,

      status

    })
  );


  results.push(
    await checkService({

      key:
        "subwaySannomiya",

      url:
        URLS.subwaySannomiya,

      name:
        NAMES.subwaySannomiya,

      parser:
        extractSubwaySannomiya,

      oldSnapshot,

      baselineValid,

      newSnapshot,

      status

    })
  );


  /*
   * =======================================================
   * 神戸市バス
   * =======================================================
   */

  results.push(
    await checkService({

      key:
        "cityBus62",

      url:
        URLS.cityBus62,

      name:
        NAMES.cityBus62,

      parser:
        extractCityBus62,

      oldSnapshot,

      baselineValid,

      newSnapshot,

      status

    })
  );


  /*
   * =======================================================
   * ポートライナー
   * =======================================================
   */

  results.push(
    await checkService({

      key:
        "portlinerSannomiya",

      url:
        URLS.portlinerSannomiya,

      name:
        NAMES.portlinerSannomiya,

      parser:
        extractPortlinerSannomiya,

      oldSnapshot,

      baselineValid,

      newSnapshot,

      status

    })
  );


  results.push(
    await checkService({

      key:
        "portlinerBoeki",

      url:
        URLS.portlinerBoeki,

      name:
        NAMES.portlinerBoeki,

      parser:
        extractPortlinerBoeki,

      oldSnapshot,

      baselineValid,

      newSnapshot,

      status

    })
  );


  /*
   * =======================================================
   * JR
   * =======================================================
   */

  results.push(
    await checkService({

      key:
        "jrSannomiya",

      url:
        URLS.jrSannomiya,

      name:
        NAMES.jrSannomiya,

      parser:
        extractJR,

      fetcher:
        fetchJRHtml,

      oldSnapshot,

      baselineValid,

      newSnapshot,

      status

    })
  );


  results.push(
    await checkService({

      key:
        "jrNada",

      url:
        URLS.jrNada,

      name:
        NAMES.jrNada,

      parser:
        extractJR,

      fetcher:
        fetchJRHtml,

      oldSnapshot,

      baselineValid,

      newSnapshot,

      status

    })
  );


  /*
   * =======================================================
   * 阪急バス
   * =======================================================
   *
   * GitHub Actionsから公式NAVITIMEは403。
   *
   * 無理に別データを使わない。
   */

  console.log(
    "⚠️ 阪急バス 日の峰1丁目 → 谷上駅 158系統"
  );

  console.log(
    "確認エラー（公式ページ HTTP 403）"
  );

  console.log("");


  status.services.hankyu = {

    status:
      "error",

    name:
      "阪急バス 日の峰1丁目 → 谷上駅 158系統",

    error:
      "HTTP 403"

  };


  hasError = true;


  /*
   * =======================================================
   * 結果集計
   * =======================================================
   */

  for (
    const result of results
  ) {

    if (
      result === "changed"
    ) {

      hasChanged = true;

    }


    if (
      result === "error"
    ) {

      hasError = true;

    }

  }


  /*
   * エラー時は
   * 既存正常データを保持
   */

  if (
    baselineValid
  ) {

    for (
      const key of Object.keys(
        oldSnapshot.services
      )
    ) {

      if (
        !newSnapshot.services[key]
      ) {

        newSnapshot.services[key] =
          oldSnapshot.services[key];

      }

    }

  }


  status.hasChanges =
    hasChanged;

  status.hasErrors =
    hasError;


  /*
   * =======================================================
   * 保存
   * =======================================================
   */

  fs.writeFileSync(

    SNAPSHOT_FILE,

    JSON.stringify(
      newSnapshot,
      null,
      2
    ) + "\n",

    "utf8"

  );


  fs.writeFileSync(

    STATUS_FILE,

    JSON.stringify(
      status,
      null,
      2
    ) + "\n",

    "utf8"

  );


  /*
   * =======================================================
   * 最終表示
   * =======================================================
   */

  console.log(
    "================================="
  );


  if (
    !baselineValid
  ) {

    console.log(
      "🟡 今回の時刻表を新しい基準値として保存しました。"
    );

    console.log(
      "次回チェックから時刻変更を比較します。"
    );

  } else if (
    hasChanged
  ) {

    console.log(
      "🔴 公式時刻表に変更が検出されています。"
    );

  } else if (
    hasError
  ) {

    console.log(
      "⚠️ 一部の公式時刻表を確認できませんでした。"
    );

  } else {

    console.log(
      "🟢 公式時刻表に変更はありません。"
    );

  }


  console.log(
    "================================="
  );

}


/* =========================================================
   実行
========================================================= */

main()
  .catch(error => {

    console.error("");

    console.error(
      "❌ チェック処理そのものが失敗しました"
    );

    console.error(
      error
    );

    process.exit(1);

  });
