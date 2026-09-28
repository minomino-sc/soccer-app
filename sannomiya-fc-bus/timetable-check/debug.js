const urls = {
  hankyu:
    "https://transfer-cloud.navitime.biz/hankyubus/courses?external-busstop=8564",

  subwayTanigami:
    "https://kotsu.city.kobe.lg.jp/subway/timetable1/tanigami/",

  subwaySannomiya:
    "https://kotsu.city.kobe.lg.jp/subway/timetable1/sannomiya/",

  cityBus:
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


async function test(name, url) {

  console.log("");
  console.log("========================================");
  console.log(name);
  console.log(url);
  console.log("========================================");

  try {

    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",

        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

        "Accept-Language":
          "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",

        "Cache-Control":
          "no-cache"
      }
    });

    console.log("HTTP:", response.status);
    console.log("URL :", response.url);

    const html = await response.text();

    console.log("文字数:", html.length);

    if (response.status !== 200) {
      console.log("");
      console.log("⚠️ HTTPエラーのため解析を終了");
      return;
    }

    /*
     * HTMLをある程度読みやすい文字列に変換
     */

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/tr>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/td>/gi, " | ")
      .replace(/<\/th>/gi, " | ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .trim();

    /*
     * 時刻らしい行を抽出
     */

    const lines = text
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean);

    const timeLines = [];

    for (const line of lines) {

      /*
       * 例
       * 5 | 12 | 28 | 44
       * 6 | 03 | 15 | 27
       * 7時 03 15 27
       */

      if (
        /^\d{1,2}\s*\|/.test(line) ||
        /^\d{1,2}時/.test(line) ||
        /^\d{1,2}\s+\d{1,2}\s+\d{1,2}/.test(line)
      ) {

        timeLines.push(line);
      }

    }

    console.log("");
    console.log("【時刻らしい行】");
    console.log("----------------------------------------");

    if (timeLines.length === 0) {

      console.log("該当なし");

    } else {

      /*
       * 全部出すとログが巨大になるので最大100行
       */

      for (const line of timeLines.slice(0, 100)) {

        console.log(line);

      }

      if (timeLines.length > 100) {

        console.log(
          `... ${timeLines.length - 100}行省略`
        );

      }

    }

    console.log("----------------------------------------");

    /*
     * 主要キーワード周辺も確認
     */

    const keywords = [
      "時刻表",
      "平日",
      "土日",
      "土曜日",
      "日曜",
      "谷上",
      "三宮",
      "62系統",
      "158",
      "貿易センター",
      "灘"
    ];

    console.log("");
    console.log("【キーワード確認】");

    for (const keyword of keywords) {

      console.log(
        keyword,
        text.includes(keyword)
          ? "○"
          : "×"
      );

    }

  } catch (error) {

    console.log(
      "ERROR:",
      error.message
    );

  }

}


async function main() {

  for (const [name, url] of Object.entries(urls)) {

    await test(name, url);

  }

}


main();
