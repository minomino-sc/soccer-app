/* =========================================================
   KOBE SANNOMIYA FC
   TIMETABLE AUTOMATIC CHECK

   各社の公式時刻表ページを定期取得し、
   前回取得した内容と比較します。

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
  path.join(__dirname, "status.json");

const SNAPSHOT_FILE =
  path.join(__dirname, "snapshot.json");


/* =========================================================
   OFFICIAL SOURCES
========================================================= */

const SOURCES = [

  {
    id: "hankyu",
    name: "阪急バス",
    route: "日の峰1丁目 → 谷上駅",
    url:
      "https://www.hankyubus.co.jp/rosen/timetable/"
  },

  {
    id: "subway",
    name: "神戸市営地下鉄",
    route: "谷上駅 ↔ 三宮駅",
    url:
      "https://kotsu.city.kobe.lg.jp/subway/timetable1/tanigami/"
  },

  {
    id: "portliner",
    name: "ポートライナー",
    route: "三宮駅 ↔ 貿易センター駅",
    url:
      "https://www.knt-liner.co.jp/station/"
  },

  {
    id: "citybus",
    name: "神戸市バス",
    route: "谷上駅 → 日の峰1丁目方面",
    url:
      "https://kotsu.city.kobe.lg.jp/bus/bus-stop-list/bus-836/"
  }

];


/* =========================================================
   JR WEST
========================================================= */

/*
 * JRはトップページではなく、
 * 実際の駅時刻表ページを確認する。
 *
 * 三ノ宮駅 → 灘駅
 *   三ノ宮駅の大阪方面
 *
 * 灘駅 → 三ノ宮駅
 *   灘駅の三ノ宮・姫路方面
 */

const JR_SOURCES = [

  {
    id: "jr_sannomiya_to_nada",
    name: "JR西日本",
    route: "三ノ宮駅 → 灘駅",
    stationId: "2807012002"
  },

  {
    id: "jr_nada_to_sannomiya",
    name: "JR西日本",
    route: "灘駅 → 三ノ宮駅",
    stationId: "2806012001"
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
            "KOBE-SANNOMIYA-FC-Timetable-Checker/1.0"
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
   NORMALIZE
========================================================= */

function normalizeHtml(html) {

  const $ =
    cheerio.load(html);

  /*
   * 時刻表そのものに関係しない要素を削除
   */
  $(
    "script,style,noscript,svg,header,footer,nav"
  ).remove();

  /*
   * tableの内容を優先して取得
   *
   * JR公式ページは時刻表をtableで掲載しているため、
   * ページ全体ではなくtableを監視する。
   */

  let text = "";

  $("table").each(
    (_, table) => {

      text +=
        $(table).text() + "\n";

    }
  );

  /*
   * tableが取得できなかった場合は
   * bodyから取得
   */

  if (!text.trim()) {

    text =
      $("body").text();

  }

  /*
   * 空白を整理
   */

  text =
    text
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  /*
   * ページの日付は監視対象外
   *
   * 例
   * 2026年9月28日(月)
   */

  text =
    text.replace(
      /20\d{2}年\d{1,2}月\d{1,2}日(?:\([月火水木金土日]\))?/g,
      ""
    );

  /*
   * 改正日も監視対象外
   */

  text =
    text.replace(
      /改正日[:：]?\s*20\d{2}年\d{1,2}月\d{1,2}日/g,
      ""
    );

  /*
   * 最終更新日も監視対象外
   */

  text =
    text.replace(
      /最終更新日[:：]?\s*[0-9０-９年月日\/\-.]+/g,
      ""
    );

  return text;

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
   JR DATE
========================================================= */

/*
 * JR公式時刻表は日付を指定できる。
 *
 * 現在の日付を使い、
 * 平日用と休日用の両方を確認する。
 */

function formatDate(date) {

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
   GET NEXT WEEKDAY
========================================================= */

function getWeekdayDate() {

  const date =
    new Date();

  /*
   * 土日なら次の月曜日まで進める
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
   GET NEXT SUNDAY
========================================================= */

function getHolidayDate() {

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
   CHECK ONE JR PAGE
========================================================= */

async function checkJRPage(
  source,
  date
) {

  const url =
    `https://timetable.jr-odekake.net/station-timetable/${source.stationId}?date=${date}`;

  console.log(
    `Checking: ${source.name} ${source.route}`
  );

  console.log(
    `URL: ${url}`
  );

  const html =
    await fetchPage(
      url
    );

  const normalized =
    normalizeHtml(
      html
    );

  if (
    !normalized ||
    normalized.length < 100
  ) {

    throw new Error(
      "JR公式時刻表データを取得できませんでした"
    );

  }

  return createHash(
    normalized
  );

}


/* =========================================================
   MAIN
========================================================= */

async function main() {

  const previous =
    loadSnapshot();

  /*
   * 以前のデータを残す。
   *
   * 取得失敗したサービスまで
   * 消えてしまうのを防止する。
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
     通常4社
  ======================================================= */

  for (
    const source of SOURCES
  ) {

    console.log(
      `Checking: ${source.name}`
    );

    try {

      const html =
        await fetchPage(
          source.url
        );

      const normalized =
        normalizeHtml(
          html
        );

      const hash =
        createHash(
          normalized
        );

      nextSnapshot[
        source.id
      ] = {
        hash,
        checkedAt:
          new Date()
            .toISOString()
      };

      const previousHash =
        previous[
          source.id
        ]?.hash;


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

      } else if (
        previousHash === hash
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
            "公式ページに変更を検出"
        });

        hasChanges =
          true;

      }

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

    }

  }


  /* =======================================================
     JR
  ======================================================= */

  const weekdayDate =
    getWeekdayDate();

  const holidayDate =
    getHolidayDate();


  for (
    const source of JR_SOURCES
  ) {

    try {

      /*
       * 平日
       */

      const weekdayHash =
        await checkJRPage(
          source,
          weekdayDate
        );


      /*
       * 休日
       */

      const holidayHash =
        await checkJRPage(
          source,
          holidayDate
        );


      const weekdayKey =
        `${source.id}_weekday`;

      const holidayKey =
        `${source.id}_holiday`;


      const previousWeekdayHash =
        previous[
          weekdayKey
        ]?.hash;

      const previousHolidayHash =
        previous[
          holidayKey
        ]?.hash;


      nextSnapshot[
        weekdayKey
      ] = {
        hash:
          weekdayHash,
        checkedAt:
          new Date()
            .toISOString(),
        date:
          weekdayDate
      };


      nextSnapshot[
        holidayKey
      ] = {
        hash:
          holidayHash,
        checkedAt:
          new Date()
            .toISOString(),
        date:
          holidayDate
      };


      /*
       * 初回
       */

      if (
        !previousWeekdayHash ||
        !previousHolidayHash
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


      /*
       * 平日または休日のどちらかが変わった
       */

      if (
        previousWeekdayHash !==
          weekdayHash ||
        previousHolidayHash !==
          holidayHash
      ) {

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
            "JR公式時刻表に変更を検出"
        });

        hasChanges =
          true;

      } else {

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

    } catch (
      error
    ) {

      console.error(
        source.name,
        source.route,
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

    }

  }


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
