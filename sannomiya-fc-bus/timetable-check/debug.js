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

    const text = await response.text();

    console.log("文字数:", text.length);

    console.log("");
    console.log("先頭500文字");
    console.log("----------------------------------------");

    console.log(
      text
        .replace(/\s+/g, " ")
        .substring(0, 500)
    );

    console.log("----------------------------------------");

    /*
     * 実際の時刻データが返っているか確認
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
    console.log("キーワード確認");

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
