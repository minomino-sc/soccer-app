/* =========================================================
   KOBE SANNOMIYA FC
   TIMETABLE AUTOMATIC CHECK

   目的
   ---------------------------------------------------------
   各社の公式時刻表から、
   このアプリで使用している路線・方向だけを抽出し、
   前回の時刻表と比較します。

   ※ timetable.js は自動変更しません。
   ※ 公式ページ全体の変更ではなく、
      対象路線の時刻表データだけを比較します。

   監視対象
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
   OFFICIAL SOURCES
========================================================= */

const SOURCES = [

  {
    id: "hankyu_158",
    name: "阪急バス",
    route: "日の峰1丁目 → 谷上駅 158系統",
    url: "https://www.hankyubus.co.jp/rosen/timetable/"
  },

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

  {
    id: "citybus_62",
    name: "神戸市バス",
    route: "谷上駅 → 神戸北町 62系統",
    url: "https://kotsu.city.kobe.lg.jp/bus/bus-stop-list/bus-836/",
    type: "citybus62"
  },

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
   FETCH
========================================================= */

async function fetchPage(url) {

  const response = await fetch(url, {

    headers: {
      "User-Agent":
        "KOBE-SANNOMIYA-FC-Timetable-Checker/1.0",
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
   NORMALIZE
========================================================= */

function normalize(text) {

  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[０-９]/g, c =>
      String.fromCharCode(
        c.charCodeAt(0) - 0xfee0
      )
    )
    .replace(/[：]/g, ":")
    .replace(/\s+/g, " ")
    .trim();

}


/* =========================================================
   EXTRACT TABLE ROWS
   地下鉄など
========================================================= */

function extractTableTimes(table) {

  const result = [];

  const $table = table;

  $table.find("tr").each((index, tr) => {

    const cells = [];

    $table
      .find("tr")
      .eq(index)
      .find("th,td")
      .each((i, cell) => {

        cells.push(
          normalize(
            $table
              .find("tr")
              .eq(index)
              .find("th,td")
              .eq(i)
              .text()
          )
        );

      });

    if (cells.length < 2) {
      return;
    }

    const hourMatch =
      cells[0].match(/^(\d{1,2})$/);

    if (!hourMatch) {
      return;
    }

    const hour =
      Number(hourMatch[1]);

    const minutes =
      cells[1]
        .match(/\d{1,2}/g);

    if (!minutes || !minutes.length) {
      return;
    }

    minutes.forEach(minute => {

      const m =
        String(minute).padStart(2, "0");

      if (Number(m) <= 59) {

        result.push(
          `${String(hour).padStart(2, "0")}:${m}`
        );

      }

    });

  });

  return result;

}


/* =========================================================
   SUBWAY
========================================================= */

function extractSubway(
  html,
  direction
) {

  const $ = cheerio.load(html);

  const weekday = [];
  const weekend = [];

  $("table").each((index, table) => {

    const tableText =
      normalize($(table).text());

    if (!tableText.includes(direction)) {
      return;
    }

    const times =
      extractTableTimes($(table));

    if (!times.length) {
      return;
    }

    /*
     * 方向ごとに
     * 平日 → 土日祝
     * の順で存在する。
     */
    if (!weekday.length) {

      weekday.push(...times);

    } else {

      weekend.push(...times);

    }

  });

  if (!weekday.length) {

    throw new Error(
      "対象方向の平日時刻表を取得できません"
    );

  }

  if (!weekend.length) {

    throw new Error(
      "対象方向の土日祝時刻表を取得できません"
    );

  }

  return {

    weekday,
    weekend

  };

}


/* =========================================================
   CITY BUS 62
========================================================= */

function extractCityBus62(html) {

  const $ = cheerio.load(html);

  /*
   * 公式ページ上の
   *
   * 62系統 神戸北町方面行き
   *
   * の位置を探す。
   */
  const bodyText =
    normalize(
      $("body").text()
    );

  const start =
    bodyText.indexOf(
      "62系統 神戸北町方面行き"
    );

  if (start === -1) {

    throw new Error(
      "62系統 神戸北町方面行きが見つかりません"
    );

  }

  /*
   * 111系統より前だけを対象にする。
   *
   * これで111系統の時刻を
   * 絶対に混ぜない。
   */
  const end =
    bodyText.indexOf(
      "111系統",
      start
    );

  if (end === -1) {

    throw new Error(
      "111系統の境界を確認できません"
    );

  }

  const section =
    bodyText.substring(
      start,
      end
    );

  /*
   * 公式ページでは
   *
   * 平日
   * 5時 ...
   * 23時 ...
   *
   * 土曜日
   * 5時 ...
   *
   * 日曜・祝日
   * 5時 ...
   *
   * の順。
   */
  const blocks =
    section.split(/(?=5時)/);

  const timetableBlocks = [];

  for (const block of blocks) {

    if (
      block.includes("5時") &&
      /\d{1,2}時/.test(block)
    ) {

      timetableBlocks.push(block);

    }

  }

  if (timetableBlocks.length < 3) {

    throw new Error(
      `62系統の時刻表ブロックを3つ取得できません (${timetableBlocks.length})`
    );

  }

  function parseBlock(block) {

    const result = [];

    const hourRegex =
      /(\d{1,2})時([\s\S]*?)(?=\d{1,2}時|$)/g;

    let match;

    while (
      (match = hourRegex.exec(block)) !== null
    ) {

      const hour =
        Number(match[1]);

      const content =
        match[2];

      const minutes =
        content.match(
          /\b\d{1,2}\b/g
        );

      if (!minutes) {
        continue;
      }

      minutes.forEach(minute => {

        const m =
          String(minute).padStart(2, "0");

        if (Number(m) <= 59) {

          result.push(
            `${String(hour).padStart(2, "0")}:${m}`
          );

        }

      });

    }

    return result;

  }

  const weekday =
    parseBlock(
      timetableBlocks[0]
    );

  const saturday =
    parseBlock(
      timetableBlocks[1]
    );

  const holiday =
    parseBlock(
      timetableBlocks[2]
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

  const $ = cheerio.load(html);

  const tables = [];

  $("table").each((index, table) => {

    const tableText =
      normalize($(table).text());

    if (
      tableText.includes(direction)
    ) {

      const times =
        [];

      $(table)
        .find("tr")
        .each((i, tr) => {

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
            .each((j, el) => {

              const minute =
                normalize(
                  $(el).text()
                ).match(/\d{1,2}/);

              if (!minute) {
                return;
              }

              const m =
                String(
                  minute[0]
                ).padStart(2, "0");

              if (Number(m) <= 59) {

                times.push(
                  `${String(hour).padStart(2, "0")}:${m}`
                );

              }

            });

        });

      if (times.length) {

        tables.push(times);

      }

    }

  });

  if (!tables.length) {

    throw new Error(
      "ポートライナー対象方向を取得できません"
    );

  }

  return {

    weekday:
      tables[0] || [],

    weekend:
      tables[1] || tables[0] || []

  };

}


/* =========================================================
   JR
========================================================= */

function extractJR(html) {

  const $ = cheerio.load(html);

  const times = [];

  $(".departure-time").each(
    (index, element) => {

      const value =
        normalize(
          $(element).text()
        );

      if (
        /^\d{1,2}:\d{2}$/.test(value)
      ) {

        times.push(value);

      }

    }
  );

  if (!times.length) {

    throw new Error(
      "JR発車時刻を取得できません"
    );

  }

  /*
   * JRページはPC/SPなど
   * 同じ時刻が複数存在する場合がある。
   */
  return [
    ...new Set(times)
  ].sort();

}


/* =========================================================
   HANKYU
========================================================= */

function extractHankyu() {

  /*
   * 現在の阪急バス公式サイトでは、
   * 158系統が路線別一覧には掲載されているが、
   * GitHub Actionsから
   * 「日の峰1丁目 → 谷上駅」
   * の現在時刻表を安定して直接取得できる
   * 専用URLを確定できない。
   *
   * 誤判定を防ぐため、
   * 現段階では確認エラーとして扱う。
   */
  throw new Error(
    "158系統「日の峰1丁目 → 谷上駅」の公式時刻表を直接取得できません"
  );

}


/* =========================================================
   EXTRACT SOURCE
========================================================= */

async function extractSource(source) {

  if (
    source.id === "hankyu_158"
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

  const nextSnapshot = {};

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

      nextSnapshot[
        source.id
      ] = {

        hash,

        timetable,

        checkedAt:
          new Date().toISOString()

      };


      const previousHash =
        previous[
          source.id
        ]?.hash;


      /*
       * 初回
       */
      if (!previousHash) {

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
       * 変更なし
       */
      if (
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

      }

      /*
       * 変更あり
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

        hasChanges = true;

      }

    } catch (error) {

      console.error(
        `[ERROR] ${source.name} ${source.route}`,
        error.message
      );


      /*
       * 取得失敗時は、
       * 前回正常取得したスナップショットを
       * 消さない。
       */
      if (
        previous[source.id]
      ) {

        nextSnapshot[
          source.id
        ] =
          previous[source.id];

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
          `確認エラー: ${error.message}`

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

    console.error(error);

    process.exit(1);

  });
