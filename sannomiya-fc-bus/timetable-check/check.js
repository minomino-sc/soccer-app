/* =========================================================
   KOBE SANNOMIYA FC
   公式時刻表 自動チェック

   ・公式ページの実際の時刻だけを比較
   ・ページ全体のHTMLは比較しない
   ・お知らせ、更新日、デザイン変更は無視
   ・timetable.js は変更しない
========================================================= */

const fs = require("fs");
const crypto = require("crypto");
const cheerio = require("cheerio");


/* =========================================================
   URL
========================================================= */

const URLS = {

  hankyu:
    "https://transfer-cloud.navitime.biz/hankyubus/courses/timetables?busstop=00021667&timetable-id=856401",

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
   ファイル
========================================================= */

const BASE =
  "sannomiya-fc-bus/timetable-check";

const SNAPSHOT_FILE =
  `${BASE}/snapshot.json`;

const STATUS_FILE =
  `${BASE}/status.json`;


/* =========================================================
   HTTP
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
        "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",
      "Cache-Control":
        "no-cache"
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return await response.text();
}


/* =========================================================
   共通
========================================================= */

function normalize(text) {

  return String(text || "")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function hash(text) {

  return crypto
    .createHash("sha256")
    .update(text)
    .digest("hex");
}


function now() {

  return new Date().toISOString();
}


function saveSnapshot(snapshot) {

  fs.writeFileSync(
    SNAPSHOT_FILE,
    JSON.stringify(
      snapshot,
      null,
      2
    )
  );
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


/* =========================================================
   セル取得
========================================================= */

function getCells($, tr) {

  return $(tr)
    .find("th, td")
    .map((i, el) =>
      normalize($(el).text())
    )
    .get()
    .filter(Boolean);
}


/* =========================================================
   時刻文字列を抽出
========================================================= */

function extractMinutes(text) {

  return (String(text || "")
    .match(/\d{1,2}/g) || [])
    .map(x => Number(x))
    .filter(x => x >= 0 && x <= 59)
    .map(x => String(x).padStart(2, "0"));
}


/* =========================================================
   表から「時 → 分」を取得
========================================================= */

function extractTableRows($, table) {

  const result = {};

  $(table)
    .find("tr")
    .each((i, tr) => {

      const cells =
        getCells($, tr);

      if (cells.length < 2) {
        return;
      }

      const hour =
        Number(
          cells[0]
            .replace(/時/g, "")
        );

      if (
        !Number.isInteger(hour) ||
        hour < 0 ||
        hour > 24
      ) {
        return;
      }

      const minutes =
        extractMinutes(
          cells.slice(1).join(" ")
        );

      if (!minutes.length) {
        return;
      }

      result[hour] =
        minutes;
    });

  return result;
}


/* =========================================================
   地下鉄

   対象方向を含む表・周辺の時刻表を取得する。
========================================================= */

function extractSubway(
  html,
  direction
) {

  const $ =
    cheerio.load(html);

  const result = {
    weekday: {},
    holiday: {}
  };

  let currentDay = null;

  $("body *").each((i, el) => {

    const text =
      normalize($(el).text());

    if (
      text === "平日"
    ) {
      currentDay = "weekday";
    }

    if (
      text === "土日・祝日"
    ) {
      currentDay = "holiday";
    }
  });


  /*
   * 方向名を含む要素を探す。
   */
  const directionElements =
    $("body *")
      .filter((i, el) =>
        normalize($(el).text()) === direction
      );


  if (!directionElements.length) {
    throw new Error(
      `方向「${direction}」が見つかりません`
    );
  }


  /*
   * 公式ページのtableを順番に調査。
   * 時刻表らしいtableだけを対象にする。
   */
  $("table").each((i, table) => {

    const tableText =
      normalize($(table).text());

    if (
      !/\b5\b/.test(tableText) &&
      !/5時/.test(tableText)
    ) {
      return;
    }

    const data =
      extractTableRows($, table);

    if (
      Object.keys(data).length < 3
    ) {
      return;
    }

    /*
     * 周囲の見出しから曜日を判定。
     */
    let day = null;

    let prevText = "";

    $(table)
      .prevAll()
      .slice(0, 15)
      .each((j, el) => {

        const t =
          normalize($(el).text());

        if (
          t === "平日"
        ) {
          prevText = "weekday";
        }

        if (
          t === "土日・祝日"
        ) {
          prevText = "holiday";
        }
      });

    if (prevText) {
      day = prevText;
    }

    /*
     * 判定できない場合は、
     * tableの親要素周辺を確認。
     */
    if (!day) {

      const parentText =
        normalize(
          $(table)
            .parent()
            .text()
        );

      if (
        parentText.includes("平日")
      ) {
        day = "weekday";
      }

      if (
        parentText.includes("土日・祝日")
      ) {
        day = "holiday";
      }
    }

    if (day) {

      /*
       * 方向に近い表だけ採用
       */
      const nearText =
        normalize(
          $(table)
            .prevAll()
            .slice(0, 10)
            .text()
        );

      if (
        nearText.includes(direction) ||
        directionElements.length
      ) {

        result[day] = {
          ...result[day],
          ...data
        };
      }
    }
  });


  /*
   * table構造が特殊な場合の保険。
   * ページ全体から曜日別の時刻表を取得する。
   */
  if (
    !Object.keys(result.weekday).length ||
    !Object.keys(result.holiday).length
  ) {

    const allTables =
      $("table").toArray();

    for (const table of allTables) {

      const text =
        normalize($(table).text());

      if (
        !text.includes(direction)
      ) {
        continue;
      }

      const data =
        extractTableRows($, table);

      if (
        Object.keys(data).length < 3
      ) {
        continue;
      }

      if (
        text.includes("平日")
      ) {
        result.weekday = data;
      }

      if (
        text.includes("土日・祝日")
      ) {
        result.holiday = data;
      }
    }
  }


  if (
    !Object.keys(result.weekday).length ||
    !Object.keys(result.holiday).length
  ) {

    throw new Error(
      "地下鉄時刻表を取得できません"
    );
  }

  return result;
}


/* =========================================================
   神戸市バス 62系統
========================================================= */

function extractCityBus62(html) {

  const $ =
    cheerio.load(html);

  const result = {
    weekday: {},
    saturday: {},
    holiday: {}
  };


  /*
   * 62系統の見出しを探す。
   */
  const headings =
    $("body *")
      .filter((i, el) => {

        const text =
          normalize($(el).text());

        return (
          text.includes("62系統") &&
          text.includes("神戸北町")
        );
      });


  if (!headings.length) {
    throw new Error(
      "62系統 神戸北町方面行きが見つかりません"
    );
  }


  /*
   * 62系統の見出し以降にあるtableだけを対象。
   */
  let started = false;

  $("table").each((i, table) => {

    const tableText =
      normalize($(table).text());

    /*
     * 62系統のtableか確認
     */
    const parentText =
      normalize(
        $(table)
          .parent()
          .text()
      );

    if (
      !tableText.includes("62") &&
      !parentText.includes("62系統") &&
      !parentText.includes("神戸北町")
    ) {
      return;
    }

    started = true;

    const data =
      extractTableRows($, table);

    if (
      Object.keys(data).length < 1
    ) {
      return;
    }

    /*
     * 曜日をtable周辺から判定
     */
    let day = null;

    const around =
      normalize(
        $(table)
          .parent()
          .parent()
          .text()
      );

    if (around.includes("平日")) {
      day = "weekday";
    }

    if (around.includes("土曜日")) {
      day = "saturday";
    }

    if (around.includes("日曜・祝日")) {
      day = "holiday";
    }

    if (day) {

      result[day] = {
        ...result[day],
        ...data
      };
    }
  });


  /*
   * ページ構造上、tableの親から
   * 曜日を取れない場合の補助処理。
   */
  if (
    Object.keys(result.weekday).length === 0 ||
    Object.keys(result.saturday).length === 0 ||
    Object.keys(result.holiday).length === 0
  ) {

    const lines =
      $("body")
        .text()
        .split(/\n/)
        .map(normalize)
        .filter(Boolean);

    let day = null;

    for (const line of lines) {

      if (line === "平日") {
        day = "weekday";
        continue;
      }

      if (line === "土曜日") {
        day = "saturday";
        continue;
      }

      if (line === "日曜・祝日") {
        day = "holiday";
        continue;
      }

      if (
        day &&
        /^(\d{1,2})時$/.test(line)
      ) {
        continue;
      }
    }
  }


  if (
    !Object.keys(result.weekday).length ||
    !Object.keys(result.saturday).length ||
    !Object.keys(result.holiday).length
  ) {

    throw new Error(
      "62系統の3種類の時刻表を取得できません"
    );
  }

  return result;
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

  const result = {
    weekday: {},
    holiday: {}
  };


  $("table").each((i, table) => {

    const text =
      normalize($(table).text());

    if (
      !text.includes(direction)
    ) {
      return;
    }

    const data =
      extractTableRows($, table);

    if (
      Object.keys(data).length < 3
    ) {
      return;
    }

    /*
     * テーブル周辺から曜日を判定
     */
    const around =
      normalize(
        $(table)
          .parent()
          .parent()
          .text()
      );

    if (
      around.includes("Weekday") ||
      around.includes("平日")
    ) {

      result.weekday = {
        ...result.weekday,
        ...data
      };
    }

    if (
      around.includes("Saturdays") ||
      around.includes("Sundays") ||
      around.includes("holidays") ||
      around.includes("土日") ||
      around.includes("休日")
    ) {

      result.holiday = {
        ...result.holiday,
        ...data
      };
    }
  });


  /*
   * Portlinerページは曜日見出しが
   * table外にある場合があるため、
   * table付近を広めに確認。
   */
  if (
    !Object.keys(result.weekday).length ||
    !Object.keys(result.holiday).length
  ) {

    $("table").each((i, table) => {

      const text =
        normalize($(table).text());

      if (
        !text.includes(direction)
      ) {
        return;
      }

      const data =
        extractTableRows($, table);

      if (
        Object.keys(data).length < 3
      ) {
        return;
      }

      const section =
        normalize(
          $(table)
            .closest("section, div")
            .text()
        );

      if (
        section.includes("Weekday") ||
        section.includes("平日")
      ) {

        result.weekday = {
          ...result.weekday,
          ...data
        };
      }

      if (
        section.includes("Saturdays") ||
        section.includes("Sundays") ||
        section.includes("holidays") ||
        section.includes("土日")
      ) {

        result.holiday = {
          ...result.holiday,
          ...data
        };
      }
    });
  }


  if (
    !Object.keys(result.weekday).length ||
    !Object.keys(result.holiday).length
  ) {

    throw new Error(
      `ポートライナー「${direction}」を取得できません`
    );
  }

  return result;
}


/* =========================================================
   JR
========================================================= */

function extractJR(html) {

  const $ =
    cheerio.load(html);

  const result = {};

  $("table").each((i, table) => {

    const data =
      extractTableRows($, table);

    if (
      Object.keys(data).length < 3
    ) {
      return;
    }

    for (
      const [hour, minutes]
      of Object.entries(data)
    ) {

      result[hour] = [
        ...(result[hour] || []),
        ...minutes
      ];
    }
  });


  /*
   * 重複除去・順番統一
   */
  for (
    const hour of Object.keys(result)
  ) {

    result[hour] =
      [...new Set(result[hour])]
        .sort(
          (a, b) => Number(a) - Number(b)
        );
  }


  if (
    !Object.keys(result).length
  ) {

    throw new Error(
      "JR時刻表を取得できません"
    );
  }

  return result;
}


/* =========================================================
   比較
========================================================= */

function checkService(
  id,
  name,
  route,
  value,
  oldSnapshot,
  newSnapshot,
  services
) {

  const newHash =
    hash(
      JSON.stringify(value)
    );

  const old =
    oldSnapshot[id];


  /*
   * 正常取得できたものだけ
   * 新しいsnapshotに保存する。
   */
  newSnapshot[id] = {
    hash: newHash,
    data: value,
    checkedAt: now()
  };


  if (!old) {

    services.push({
      id,
      name,
      route,
      status: "ok",
      message: "初回登録"
    });

    return false;
  }


  if (
    old.hash === newHash
  ) {

    services.push({
      id,
      name,
      route,
      status: "ok",
      message: "変更なし"
    });

    return false;
  }


  services.push({
    id,
    name,
    route,
    status: "changed",
    message: "時刻表変更を検出"
  });

  return true;
}


/* =========================================================
   エラー
========================================================= */

function addError(
  services,
  id,
  name,
  route,
  error
) {

  services.push({
    id,
    name,
    route,
    status: "error",
    message:
      "確認エラー: " +
      error.message
  });
}


/* =========================================================
   実行
========================================================= */

async function main() {

  console.log(
    "🔍 公式時刻表 自動チェック"
  );

  console.log(
    "最終チェック：" +
    new Date().toLocaleString(
      "ja-JP",
      {
        timeZone: "Asia/Tokyo"
      }
    )
  );

  console.log("");


  const oldSnapshot =
    loadSnapshot();

  /*
   * 古いsnapshotをコピー。
   *
   * エラーになった路線については
   * 古い正常データを残す。
   */
  const newSnapshot =
    {
      ...oldSnapshot
    };

  const services = [];

  let hasChanges = false;


  /* =======================================================
     阪急
  ======================================================= */

  try {

    const html =
      await fetchHtml(
        URLS.hankyu
      );

    const data =
      extractHankyu158(html);

    hasChanges =
      checkService(
        "hankyu_158",
        "阪急バス",
        "日の峰1丁目 → 谷上駅 158系統",
        data,
        oldSnapshot,
        newSnapshot,
        services
      ) || hasChanges;

  } catch (e) {

    addError(
      services,
      "hankyu_158",
      "阪急バス",
      "日の峰1丁目 → 谷上駅 158系統",
      e
    );
  }


  /* =======================================================
     地下鉄
  ======================================================= */

  try {

    const html =
      await fetchHtml(
        URLS.subwayTanigami
      );

    const data =
      extractSubway(
        html,
        "新神戸・三宮・名谷・西神中央方面行"
      );

    hasChanges =
      checkService(
        "subway_tanigami_sannomiya",
        "神戸市営地下鉄",
        "谷上駅 → 三宮駅",
        data,
        oldSnapshot,
        newSnapshot,
        services
      ) || hasChanges;

  } catch (e) {

    addError(
      services,
      "subway_tanigami_sannomiya",
      "神戸市営地下鉄",
      "谷上駅 → 三宮駅",
      e
    );
  }


  try {

    const html =
      await fetchHtml(
        URLS.subwaySannomiya
      );

    const data =
      extractSubway(
        html,
        "新神戸・谷上方面行"
      );

    hasChanges =
      checkService(
        "subway_sannomiya_tanigami",
        "神戸市営地下鉄",
        "三宮駅 → 谷上駅",
        data,
        oldSnapshot,
        newSnapshot,
        services
      ) || hasChanges;

  } catch (e) {

    addError(
      services,
      "subway_sannomiya_tanigami",
      "神戸市営地下鉄",
      "三宮駅 → 谷上駅",
      e
    );
  }


  /* =======================================================
     市バス62
  ======================================================= */

  try {

    const html =
      await fetchHtml(
        URLS.cityBus62
      );

    const data =
      extractCityBus62(html);

    hasChanges =
      checkService(
        "citybus_62",
        "神戸市バス",
        "谷上駅 → 神戸北町 62系統",
        data,
        oldSnapshot,
        newSnapshot,
        services
      ) || hasChanges;

  } catch (e) {

    addError(
      services,
      "citybus_62",
      "神戸市バス",
      "谷上駅 → 神戸北町 62系統",
      e
    );
  }


  /* =======================================================
     ポートライナー
  ======================================================= */

  try {

    const html =
      await fetchHtml(
        URLS.portlinerSannomiya
      );

    const data =
      extractPortliner(
        html,
        "For Kobe Airport / Kita Futo"
      );

    hasChanges =
      checkService(
        "portliner_sannomiya_boeki",
        "ポートライナー",
        "三宮駅 → 貿易センター駅",
        data,
        oldSnapshot,
        newSnapshot,
        services
      ) || hasChanges;

  } catch (e) {

    addError(
      services,
      "portliner_sannomiya_boeki",
      "ポートライナー",
      "三宮駅 → 貿易センター駅",
      e
    );
  }


  try {

    const html =
      await fetchHtml(
        URLS.portlinerBoeki
      );

    const data =
      extractPortliner(
        html,
        "For Sannomiya"
      );

    hasChanges =
      checkService(
        "portliner_boeki_sannomiya",
        "ポートライナー",
        "貿易センター駅 → 三宮駅",
        data,
        oldSnapshot,
        newSnapshot,
        services
      ) || hasChanges;

  } catch (e) {

    addError(
      services,
      "portliner_boeki_sannomiya",
      "ポートライナー",
      "貿易センター駅 → 三宮駅",
      e
    );
  }


  /* =======================================================
     JR
  ======================================================= */

  try {

    const html =
      await fetchHtml(
        URLS.jrSannomiya
      );

    const data =
      extractJR(html);

    hasChanges =
      checkService(
        "jr_sannomiya_nada",
        "JR西日本",
        "三ノ宮駅 → 灘駅",
        data,
        oldSnapshot,
        newSnapshot,
        services
      ) || hasChanges;

  } catch (e) {

    addError(
      services,
      "jr_sannomiya_nada",
      "JR西日本",
      "三ノ宮駅 → 灘駅",
      e
    );
  }


  try {

    const html =
      await fetchHtml(
        URLS.jrNada
      );

    const data =
      extractJR(html);

    hasChanges =
      checkService(
        "jr_nada_sannomiya",
        "JR西日本",
        "灘駅 → 三ノ宮駅",
        data,
        oldSnapshot,
        newSnapshot,
        services
      ) || hasChanges;

  } catch (e) {

    addError(
      services,
      "jr_nada_sannomiya",
      "JR西日本",
      "灘駅 → 三ノ宮駅",
      e
    );
  }


  /* =======================================================
     保存
  ======================================================= */

  saveSnapshot(
    newSnapshot
  );

  fs.writeFileSync(
    STATUS_FILE,
    JSON.stringify(
      {
        checkedAt: now(),
        hasChanges,
        services
      },
      null,
      2
    )
  );


  /* =======================================================
     結果表示
  ======================================================= */

  for (
    const service of services
  ) {

    const icon =
      service.status === "changed"
        ? "🔴"
        : service.status === "error"
          ? "⚠️"
          : "🟢";

    console.log(
      `${icon} ${service.name} ${service.route}`
    );

    console.log(
      `   ${service.message}`
    );
  }

  console.log("");

  console.log(
    "※公式時刻表の実データだけを比較しています。"
  );
}


main().catch(error => {

  console.error(error);

  process.exit(1);
});
