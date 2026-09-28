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

const BASE = "sannomiya-fc-bus/timetable-check";

const SNAPSHOT_FILE = `${BASE}/snapshot.json`;
const STATUS_FILE = `${BASE}/status.json`;

const SCHEMA_VERSION = 5;


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

  const response = await fetch(url, {

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
   HTML → 行
========================================================= */

function htmlToLines(html) {

  return html

    .replace(/<\/tr>/gi, "\n")

    .replace(/<\/li>/gi, "\n")

    .replace(/<\/p>/gi, "\n")

    .replace(/<\/div>/gi, "\n")

    .replace(/<br\s*\/?>/gi, " ")

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
========================================================= */

function parseTableRow(line) {

  /*
   * 例
   *
   * 5 | 18 41 51
   * 7 | 02 09 13
   *
   */

  const match =
    line.match(/^(\d{1,2})\s*\|\s*(.*)$/);

  if (!match) {

    return null;

  }


  const hour =
    Number(match[1]);

  if (
    hour < 0 ||
    hour > 24
  ) {

    return null;

  }


  const minutes =
    match[2]
      .match(/\d{1,2}/g) || [];


  const result =
    minutes

      .map(Number)

      .filter(
        n => n >= 0 && n <= 59
      )

      .map(
        n => String(n).padStart(2, "0")
      );


  if (!result.length) {

    return null;

  }


  return {

    hour,

    minutes:
      [...new Set(result)]

  };

}


/* =========================================================
   市バス用
========================================================= */

function parseBusRows(lines) {

  const result = [];

  let currentHour = null;


  for (const line of lines) {

    /*
     * 例
     * 7時
     * 45
     */

    const hourMatch =
      line.match(/^(\d{1,2})時$/);

    if (hourMatch) {

      currentHour =
        Number(hourMatch[1]);

      continue;

    }


    if (
      currentHour === null
    ) {

      continue;

    }


    /*
     * 分だけの行
     *
     * 00
     * 30
     * 00○
     * 00☆急
     */

    const minuteMatch =
      line.match(
        /^(\d{1,2})(?:\D.*)?$/
      );

    if (!minuteMatch) {

      continue;

    }


    const minute =
      Number(minuteMatch[1]);


    if (
      minute < 0 ||
      minute > 59
    ) {

      continue;

    }


    let row =
      result.find(
        r => r.hour === currentHour
      );


    if (!row) {

      row = {

        hour:
          currentHour,

        minutes: []

      };

      result.push(row);

    }


    const value =
      String(minute)
        .padStart(2, "0");


    if (
      !row.minutes.includes(value)
    ) {

      row.minutes.push(value);

    }

  }


  return result;

}


/* =========================================================
   共通：最初の時刻表
========================================================= */

function extractFirstTable(
  lines,
  startKeywords,
  stopKeywords = []
) {

  let start = -1;


  for (
    let i = 0;
    i < lines.length;
    i++
  ) {

    const line =
      lines[i];


    if (
      startKeywords.some(
        keyword =>
          line.includes(keyword)
      )
    ) {

      start = i;

      break;

    }

  }


  if (start === -1) {

    throw new Error(
      "対象時刻表が見つかりません"
    );

  }


  const rows = [];


  for (
    let i = start + 1;
    i < lines.length;
    i++
  ) {

    const line =
      lines[i];


    /*
     * 旧時刻表開始
     */

    if (
      /Revised March 28, 2016/i.test(line) ||
      /改正日.*2016年3月28日/.test(line)
    ) {

      break;

    }


    /*
     * 別方向
     */

    if (
      stopKeywords.some(
        keyword =>
          line.includes(keyword)
      )
    ) {

      break;

    }


    const row =
      parseTableRow(line);


    if (row) {

      rows.push(row);

    }

  }


  if (!rows.length) {

    throw new Error(
      "時刻データを取得できません"
    );

  }


  return rows;

}


/* =========================================================
   地下鉄
========================================================= */

function extractSubwayTanigami(html) {

  const lines =
    htmlToLines(html);


  return extractFirstTable(

    lines,

    [
      "新神戸・三宮・名谷・西神中央方面行"
    ]

  );

}


function extractSubwaySannomiyaToTanigami(html) {

  const lines =
    htmlToLines(html);


  return extractFirstTable(

    lines,

    [
      "新神戸・谷上方面行"
    ],

    [
      "名谷・西神中央方面行"
    ]

  );

}


/* =========================================================
   神戸市バス 62系統
========================================================= */

function extractCityBus62(html) {

  const lines =
    htmlToLines(html);


  let start = -1;


  for (
    let i = 0;
    i < lines.length;
    i++
  ) {

    if (
      lines[i].includes(
        "62系統 神戸北町方面行き"
      )
    ) {

      start = i;

      break;

    }

  }


  if (start === -1) {

    throw new Error(
      "62系統 神戸北町方面行きが見つかりません"
    );

  }


  const section = [];


  for (
    let i = start + 1;
    i < lines.length;
    i++
  ) {

    const line =
      lines[i];


    /*
     * 111系統へ移ったら終了
     */

    if (
      line.includes(
        "111系統"
      )
    ) {

      break;

    }


    section.push(line);

  }


  const data =
    parseBusRows(section);


  if (!data.length) {

    throw new Error(
      "62系統の時刻データを取得できません"
    );

  }


  return data;

}


/* =========================================================
   ポートライナー
========================================================= */

function extractPortlinerSannomiya(html) {

  const lines =
    htmlToLines(html);


  return extractFirstTable(

    lines,

    [
      "For Kobe Airport / Kita Futo",
      "神戸空港・北埠頭方面行",
      "神戸空港・北ふ頭方面行"
    ],

    [
      "For Sannomiya",
      "三宮方面行"
    ]

  );

}


function extractPortlinerBoeki(html) {

  const lines =
    htmlToLines(html);


  return extractFirstTable(

    lines,

    [
      "For Sannomiya",
      "三宮方面行"
    ]

  );

}


/* =========================================================
   JR
========================================================= */

function extractJR(html) {

  const lines =
    htmlToLines(html);


  const rows = [];


  /*
   * JRはページ上の最初の
   * 時刻表テーブルを取得する。
   *
   * 時刻表以外の数字を拾わない。
   */

  let started = false;


  for (const line of lines) {

    if (
      /^(5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|0|24)\s*\|/.test(line)
    ) {

      started = true;

    }


    if (!started) {

      continue;

    }


    const row =
      parseTableRow(line);


    if (row) {

      rows.push(row);

    }


    /*
     * 連続した時刻表が終わった後、
     * 十分な行数が取れたら終了。
     */

    if (
      rows.length >= 20
    ) {

      break;

    }

  }


  if (
    rows.length < 5
  ) {

    throw new Error(
      "JR時刻表を取得できません"
    );

  }


  return rows;

}


/* =========================================================
   データ正規化
========================================================= */

function normalizeTimetable(data) {

  return data

    .map(row => ({

      hour:
        Number(row.hour),

      minutes:
        [...new Set(
          row.minutes
            .map(String)
            .map(
              x =>
                x.padStart(2, "0")
            )
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


  for (const row of oldData || []) {

    oldMap.set(
      row.hour,
      row.minutes
    );

  }


  for (const row of newData || []) {

    newMap.set(
      row.hour,
      row.minutes
    );

  }


  const hours =
    [...new Set([

      ...oldMap.keys(),
      ...newMap.keys()

    ])]
    .sort(
      (a, b) => a - b
    );


  const changes = [];


  for (const hour of hours) {

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
   ファイル読み込み
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
    status

  } = options;


  try {

    const html =
      await fetchHtml(url);


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
     * 初回
     */

    if (!baselineValid) {

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


    /*
     * 旧形式・旧データなし
     */

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


    /*
     * 変更なし
     */

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


    /*
     * 実際の時刻変更
     */

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
     * 前回の正常データを維持
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
    `🔍 公式時刻表 自動チェック 最終チェック：${
      new Date().toLocaleString(
        "ja-JP",
        {
          timeZone:
            "Asia/Tokyo",

          year:
            "numeric",

          month:
            "2-digit",

          day:
            "2-digit",

          hour:
            "2-digit",

          minute:
            "2-digit"
        }
      )
    }`
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

  const subwayTanigami =
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

    });


  if (
    subwayTanigami ===
    "changed"
  ) {

    hasChanged = true;

  }

  if (
    subwayTanigami ===
    "error"
  ) {

    hasError = true;

  }


  const subwaySannomiya =
    await checkService({

      key:
        "subwaySannomiya",

      url:
        URLS.subwaySannomiya,

      name:
        NAMES.subwaySannomiya,

      parser:
        extractSubwaySannomiyaToTanigami,

      oldSnapshot,

      baselineValid,

      newSnapshot,

      status

    });


  if (
    subwaySannomiya ===
    "changed"
  ) {

    hasChanged = true;

  }

  if (
    subwaySannomiya ===
    "error"
  ) {

    hasError = true;

  }


  /*
   * =======================================================
   * 神戸市バス
   * =======================================================
   */

  const cityBus =
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

    });


  if (
    cityBus ===
    "changed"
  ) {

    hasChanged = true;

  }

  if (
    cityBus ===
    "error"
  ) {

    hasError = true;

  }


  /*
   * =======================================================
   * ポートライナー
   * =======================================================
   */

  const portSannomiya =
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

    });


  if (
    portSannomiya ===
    "changed"
  ) {

    hasChanged = true;

  }

  if (
    portSannomiya ===
    "error"
  ) {

    hasError = true;

  }


  const portBoeki =
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

    });


  if (
    portBoeki ===
    "changed"
  ) {

    hasChanged = true;

  }

  if (
    portBoeki ===
    "error"
  ) {

    hasError = true;

  }


  /*
   * =======================================================
   * JR
   * =======================================================
   */

  const jrSannomiya =
    await checkService({

      key:
        "jrSannomiya",

      url:
        URLS.jrSannomiya,

      name:
        NAMES.jrSannomiya,

      parser:
        extractJR,

      oldSnapshot,

      baselineValid,

      newSnapshot,

      status

    });


  if (
    jrSannomiya ===
    "changed"
  ) {

    hasChanged = true;

  }

  if (
    jrSannomiya ===
    "error"
  ) {

    hasError = true;

  }


  const jrNada =
    await checkService({

      key:
        "jrNada",

      url:
        URLS.jrNada,

      name:
        NAMES.jrNada,

      parser:
        extractJR,

      oldSnapshot,

      baselineValid,

      newSnapshot,

      status

    });


  if (
    jrNada ===
    "changed"
  ) {

    hasChanged = true;

  }

  if (
    jrNada ===
    "error"
  ) {

    hasError = true;

  }


  /*
   * =======================================================
   * 阪急バス
   * =======================================================
   *
   * GitHub Actionsから公式NAVITIMEページは403。
   *
   * 現時点では無理に解析せず、
   * 確認エラーとして扱う。
   */

  console.log(
    "⚠️ 阪急バス 日の峰1丁目 → 谷上駅 158系統"
  );

  console.log(
    "確認エラー（公式ページ HTTP 403）"
  );

  console.log("");


  hasError = true;


  status.services.hankyu = {

    status:
      "error",

    name:
      "阪急バス 日の峰1丁目 → 谷上駅 158系統",

    error:
      "HTTP 403"

  };


  /*
   * =======================================================
   * エラーになったサービスは
   * 新しいデータで上書きしない。
   * =======================================================
   */

  if (baselineValid) {

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


  /*
   * =======================================================
   * 最終状態
   * =======================================================
   */

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
