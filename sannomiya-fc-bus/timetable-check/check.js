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

const SCHEMA_VERSION = 4;


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

    throw new Error(`HTTP ${response.status}`);

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
   時刻行解析
========================================================= */

function parseHourLine(line) {

  const match =
    line.match(/^(\d{1,2})\s*\|\s*(.*)$/);

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);

  if (hour < 0 || hour > 24) {
    return null;
  }

  let rest = match[2];

  /*
   * HTMLの表によっては
   *
   * 7 | 45 | 7
   *
   * のように右端に「7」がもう一度存在する。
   *
   * その場合は最後の7を削除。
   */

  const parts =
    rest
      .split("|")
      .map(normalize)
      .filter(Boolean);

  if (
    parts.length >= 2 &&
    parts[parts.length - 1] === String(hour)
  ) {

    parts.pop();

  }

  rest = parts.join(" ");


  /*
   * 時刻以外の記号・文字を除去
   */

  const minutes =
    rest.match(/\d{1,2}/g) || [];


  const cleaned =
    minutes

      .map(Number)

      .filter(
        n => n >= 0 && n <= 59
      )

      .map(
        n => String(n).padStart(2, "0")
      );


  /*
   * 同じ時刻が重複している場合は除去
   */

  return {

    hour,

    minutes:
      [...new Set(cleaned)]

  };

}


/* =========================================================
   セクション抽出
========================================================= */

function extractSection(
  lines,
  startKeywords,
  stopKeywords = []
) {

  let startIndex = -1;


  for (let i = 0; i < lines.length; i++) {

    if (
      startKeywords.some(
        keyword => lines[i].includes(keyword)
      )
    ) {

      startIndex = i;
      break;

    }

  }


  if (startIndex === -1) {

    throw new Error(
      `対象セクションが見つかりません`
    );

  }


  const result = [];

  for (
    let i = startIndex + 1;
    i < lines.length;
    i++
  ) {

    const line = lines[i];


    /*
     * 古いポートライナー時刻表は
     * ここで打ち切る。
     */

    if (
      line.includes("Revised March 28, 2016") ||
      line.includes("改正日：2016年3月28日") ||
      line.includes("改正日:2016年3月28日")
    ) {

      break;

    }


    /*
     * 次の方向へ移ったら終了
     */

    if (
      stopKeywords.some(
        keyword => line.includes(keyword)
      )
    ) {

      break;

    }


    const row =
      parseHourLine(line);

    if (row) {

      result.push(row);

    }

  }


  if (!result.length) {

    throw new Error(
      `時刻表データを取得できません`
    );

  }


  return result;

}


/* =========================================================
   地下鉄
========================================================= */

function extractSubwayTanigami(html) {

  const lines =
    htmlToLines(html);

  return extractSection(

    lines,

    [
      "新神戸・三宮・名谷・西神中央方面行"
    ]

  );

}


function extractSubwaySannomiyaToTanigami(html) {

  const lines =
    htmlToLines(html);

  return extractSection(

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

  return extractSection(

    lines,

    [
      "62系統 神戸北町方面行き"
    ]

  );

}


/* =========================================================
   ポートライナー
========================================================= */

function extractPortlinerSannomiya(html) {

  const lines =
    htmlToLines(html);

  return extractSection(

    lines,

    [
      "神戸空港・北埠頭方面行",
      "For Kobe Airport / Kita Futo",
      "開往神户机场、北码头方向"
    ]

  );

}


function extractPortlinerBoeki(html) {

  const lines =
    htmlToLines(html);

  return extractSection(

    lines,

    [
      "三宮方面行",
      "For Sannomiya",
      "开往三宫方向"
    ]

  );

}


/* =========================================================
   JR西日本
========================================================= */

function extractJR(html) {

  const lines =
    htmlToLines(html);

  const result = [];

  for (const line of lines) {

    const row =
      parseHourLine(line);

    if (row) {

      result.push(row);

    }

  }


  if (!result.length) {

    throw new Error(
      "JR時刻表を取得できません"
    );

  }


  return result;

}


/* =========================================================
   データ正規化
========================================================= */

function normalizeTimetable(data) {

  return data.map(row => ({

    hour: row.hour,

    minutes:
      [...row.minutes].sort()

  }));

}


/* =========================================================
   差分
========================================================= */

function diffTimetable(oldData, newData) {

  const oldMap = new Map();
  const newMap = new Map();


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
    ])].sort(
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

  if (!fs.existsSync(file)) {

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
   メイン
========================================================= */

async function main() {

  console.log("");

  console.log(
    `🔍 公式時刻表 自動チェック 最終チェック：${
      new Date().toLocaleString(
        "ja-JP",
        {
          timeZone: "Asia/Tokyo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        }
      )
    }`
  );

  console.log("");


  /*
   * 旧snapshotは一旦基準として使わない。
   *
   * 今回 parser を変更したため、
   * schemaVersion が違えば
   * 現在の公式時刻表を新しい基準にする。
   */

  const oldSnapshot =
    loadJson(SNAPSHOT_FILE);

  const baselineValid =
    oldSnapshot &&
    oldSnapshot.schemaVersion === SCHEMA_VERSION &&
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

    services: {}

  };


  let hasChanged = false;

  let hasError = false;

  let initialized = !baselineValid;


  /*
   * -------------------------------------------------------
   * 地下鉄 谷上 → 三宮
   * -------------------------------------------------------
   */

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

    status,

    onChanged:
      () => {
        hasChanged = true;
      },

    onError:
      () => {
        hasError = true;
      }

  });


  /*
   * -------------------------------------------------------
   * 地下鉄 三宮 → 谷上
   * -------------------------------------------------------
   */

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

    status,

    onChanged:
      () => {
        hasChanged = true;
      },

    onError:
      () => {
        hasError = true;
      }

  });


  /*
   * -------------------------------------------------------
   * 市バス 62
   * -------------------------------------------------------
   */

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

    status,

    onChanged:
      () => {
        hasChanged = true;
      },

    onError:
      () => {
        hasError = true;
      }

  });


  /*
   * -------------------------------------------------------
   * ポートライナー 三宮 → 貿易センター
   * -------------------------------------------------------
   */

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

    status,

    onChanged:
      () => {
        hasChanged = true;
      },

    onError:
      () => {
        hasError = true;
      }

  });


  /*
   * -------------------------------------------------------
   * ポートライナー 貿易センター → 三宮
   * -------------------------------------------------------
   */

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

    status,

    onChanged:
      () => {
        hasChanged = true;
      },

    onError:
      () => {
        hasError = true;
      }

  });


  /*
   * -------------------------------------------------------
   * JR 三ノ宮 → 灘
   * -------------------------------------------------------
   */

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

    status,

    onChanged:
      () => {
        hasChanged = true;
      },

    onError:
      () => {
        hasError = true;
      }

  });


  /*
   * -------------------------------------------------------
   * JR 灘 → 三ノ宮
   * -------------------------------------------------------
   */

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

    status,

    onChanged:
      () => {
        hasChanged = true;
      },

    onError:
      () => {
        hasError = true;
      }

  });


  /*
   * -------------------------------------------------------
   * 阪急バス
   *
   * GitHub Actionsから公式NAVITIMEページは403。
   * 無理に解析しない。
   * -------------------------------------------------------
   */

  console.log(
    `⚠️ 阪急バス 日の峰1丁目 → 谷上駅 158系統`
  );

  console.log(
    "確認エラー（公式ページ HTTP 403）"
  );

  console.log("");

  hasError = true;


  /*
   * -------------------------------------------------------
   * snapshot保存
   *
   * エラーになったサービスは
   * 新しいsnapshotを保存しない。
   * -------------------------------------------------------
   */

  if (baselineValid) {

    for (const key of Object.keys(oldSnapshot.services)) {

      if (
        !newSnapshot.services[key]
      ) {

        newSnapshot.services[key] =
          oldSnapshot.services[key];

      }

    }

  }


  fs.writeFileSync(

    SNAPSHOT_FILE,

    JSON.stringify(
      newSnapshot,
      null,
      2
    ),

    "utf8"

  );


  fs.writeFileSync(

    STATUS_FILE,

    JSON.stringify(
      status,
      null,
      2
    ),

    "utf8"

  );


  /*
   * -------------------------------------------------------
   * 結果
   * -------------------------------------------------------
   */

  if (initialized) {

    console.log(
      "🟡 今回の解析方式で現在の公式時刻表を基準値として保存しました。"
    );

    console.log(
      "次回チェックから実際の時刻変更を検出します。"
    );

  } else if (hasChanged) {

    console.log(
      "🔴 公式時刻表に変更が検出されています。"
    );

  } else if (hasError) {

    console.log(
      "⚠️ 一部の公式時刻表を確認できませんでした。"
    );

  } else {

    console.log(
      "🟢 公式時刻表に変更はありません。"
    );

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
    onChanged,
    onError

  } = options;


  try {

    const html =
      await fetchHtml(url);


    const data =
      normalizeTimetable(
        parser(html)
      );


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
     * 初回は比較しない。
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

      return;

    }


    const old =
      oldSnapshot.services[key];


    /*
     * 旧データが存在しない場合
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

      return;

    }


    const changes =
      diffTimetable(
        old.data,
        data
      );


    if (!changes.length) {

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

      return;

    }


    /*
     * 実際の変更
     */

    console.log(
      `🔴 ${name}`
    );

    console.log(
      "変更を検出"
    );


    for (const change of changes) {

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


    onChanged();


  } catch (error) {

    console.log(
      `⚠️ ${name}`
    );

    console.log(
      `確認エラー`
    );

    console.log(
      `  ${error.message}`
    );

    console.log("");


    /*
     * エラー時は新しい時刻を
     * snapshotとして保存しない。
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


    onError();

  }

}


/* =========================================================
   実行
========================================================= */

main().catch(error => {

  console.error("");
  console.error("❌ チェック処理そのものが失敗しました");
  console.error(error);

  process.exit(1);

});
