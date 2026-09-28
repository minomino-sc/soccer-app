const urls = {
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
  console.log("========================================");

  try {

    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",

        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

        "Accept-Language":
          "ja-JP,ja;q=0.9"
      }
    });

    console.log("HTTP:", response.status);

    const html = await response.text();

    if (response.status !== 200) {
      console.log("取得失敗");
      return;
    }

    const cheerio = require("cheerio");
    const $ = cheerio.load(html);

    /*
     * まずページ内のtable数を確認
     */

    console.log("");
    console.log("TABLE数:", $("table").length);

    /*
     * 各tableの情報
     */

    $("table").each((i, table) => {

      const text = $(table)
        .text()
        .replace(/\s+/g, " ")
        .trim();

      console.log("");
      console.log(`--- TABLE ${i + 1} ---`);
      console.log("文字数:", text.length);
      console.log(
        text.substring(0, 500)
      );

    });


    /*
     * 62系統
     */

    if (name === "cityBus") {

      console.log("");
      console.log("【62系統周辺】");

      const index = html.indexOf("62");

      if (index >= 0) {

        console.log(
          html.substring(
            Math.max(0, index - 1000),
            index + 3000
          )
        );

      } else {

        console.log("62 がHTMLに見つかりません");

      }

    }


    /*
     * ポートライナー
     */

    if (
      name === "portlinerSannomiya" ||
      name === "portlinerBoeki"
    ) {

      const keywords = [
        "貿易センター",
        "三宮",
        "時刻表"
      ];

      for (const keyword of keywords) {

        console.log("");
        console.log(`【${keyword}周辺】`);

        const index = html.indexOf(keyword);

        if (index >= 0) {

          console.log(
            html.substring(
              Math.max(0, index - 1000),
              index + 3000
            )
          );

        } else {

          console.log("見つかりません");

        }

      }

    }


    /*
     * JR
     */

    if (
      name === "jrSannomiya" ||
      name === "jrNada"
    ) {

      console.log("");
      console.log("【JR 時刻表関連HTML】");

      const keywords = [
        "5時",
        "6時",
        "7時",
        "灘",
        "三ノ宮"
      ];

      for (const keyword of keywords) {

        const index = html.indexOf(keyword);

        console.log("");
        console.log(`--- ${keyword} ---`);

        if (index >= 0) {

          console.log(
            html.substring(
              Math.max(0, index - 1000),
              index + 3000
            )
          );

        } else {

          console.log("見つかりません");

        }

      }

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
