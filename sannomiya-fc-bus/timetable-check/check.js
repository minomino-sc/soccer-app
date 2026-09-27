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

const ROOT =
  path.resolve(
    __dirname,
    ".."
  );

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

  {
    id: "hankyu",

    name: "阪急バス",

    route:
      "日の峰1丁目 → 谷上駅",

    url:
      "https://www.hankyubus.co.jp/rosen/timetable/"
  },


  {
    id: "subway",

    name: "神戸市営地下鉄",

    route:
      "谷上駅 ↔ 三宮駅",

    url:
      "https://kotsu.city.kobe.lg.jp/subway/timetable1/tanigami/"
  },


  {
    id: "portliner",

    name: "ポートライナー",

    route:
      "三宮駅 ↔ 貿易センター駅",

    url:
      "https://www.knt-liner.co.jp/station/"
  },


  {
    id: "citybus",

    name: "神戸市バス",

    route:
      "谷上駅 → 日の峰1丁目方面",

    url:
      "https://kotsu.city.kobe.lg.jp/bus/bus-stop-list/bus-836/"
  },


  {
    id: "jr",

    name: "JR西日本",

    route:
      "三ノ宮駅 ↔ 灘駅",

    url:
      "https://timetable.jr-odekake.net/"
  }

];


/* =========================================================
   FETCH
========================================================= */

async function fetchPage(
  url
) {

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

function normalizeHtml(
  html
) {

  const $ =
    cheerio.load(
      html
    );


  /*
   * 時刻表チェックに不要なものを削除
   */
  $(
    "script,style,noscript,svg"
  ).remove();


  let text =
    $("body").text();


  /*
   * 空白・改行を統一
   */
  text =
    text
      .replace(
        /\s+/g,
        " "
      )
      .trim();


  /*
   * 日付など、毎回変化する可能性がある
   * 不要な情報を極力除外
   */
  text =
    text.replace(
      /最終更新日[：:]\s*[0-9０-９年月日\/\-.]+/g,
      ""
    );


  return text;

}


/* =========================================================
   HASH
========================================================= */

function createHash(
  text
) {

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


      /*
       * 初回は基準値を作るだけ
       */
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
