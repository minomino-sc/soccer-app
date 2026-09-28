const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const DEBUG_FILE =
  path.join(__dirname, "debug-timetable.txt");

const TARGETS = [

  {
    name: "地下鉄 谷上駅",
    url:
      "https://kotsu.city.kobe.lg.jp/subway/timetable1/tanigami/",
    keyword:
      "新神戸・三宮・名谷・西神中央方面行"
  },

  {
    name: "地下鉄 三宮駅",
    url:
      "https://kotsu.city.kobe.lg.jp/subway/timetable1/sannomiya/",
    keyword:
      "新神戸・谷上方面行"
  },

  {
    name: "市バス 谷上駅 62系統",
    url:
      "https://kotsu.city.kobe.lg.jp/bus/bus-stop-list/bus-836/",
    keyword:
      "62系統"
  }

];


async function fetchPage(url) {

  const response =
    await fetch(url, {

      headers: {

        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/140.0 Safari/537.36",

        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

        "Accept-Language":
          "ja-JP,ja;q=0.9"

      }

    });


  if (!response.ok) {

    throw new Error(
      `HTTP ${response.status}`
    );

  }


  return await response.text();

}


function clean(text) {

  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

}


async function main() {

  let output = "";

  output +=
    "============================================\n";

  output +=
    "TIMETABLE HTML STRUCTURE DEBUG\n";

  output +=
    "============================================\n\n";


  for (
    const target
    of TARGETS
  ) {

    console.log(
      `Checking ${target.name}`
    );


    const html =
      await fetchPage(
        target.url
      );


    const $ =
      cheerio.load(html);


    output +=
      "\n\n============================================\n";

    output +=
      target.name + "\n";

    output +=
      target.url + "\n";

    output +=
      "============================================\n\n";


    /*
     * =====================================================
     * ① キーワードを含む要素を探す
     * =====================================================
     */

    let found = 0;


    $("*").each(
      (index, element) => {

        const text =
          clean(
            $(element).text()
          );


        if (
          !text.includes(
            target.keyword
          )
        ) {
          return;
        }


        /*
         * 親要素まで大きすぎる場合があるので、
         * 最初の数個だけを見る。
         */

        if (found >= 8) {
          return;
        }


        found++;


        output +=
          `\n--- MATCH ${found} ---\n`;


        output +=
          `TAG: ${element.tagName}\n`;


        output +=
          `CLASS: ${$(element).attr("class") || ""}\n`;


        output +=
          `ID: ${$(element).attr("id") || ""}\n`;


        output +=
          "TEXT:\n";


        output +=
          text.substring(
            0,
            3000
          );


        output +=
          "\n\nHTML:\n";


        output +=
          $.html(
            element
          ).substring(
            0,
            10000
          );


        output +=
          "\n\n";

      }
    );


    /*
     * =====================================================
     * ② 「平日」を含む要素
     * =====================================================
     */

    output +=
      "\n\n******** 平日を含む要素 ********\n";


    let weekdayFound = 0;


    $("*").each(
      (index, element) => {

        if (
          weekdayFound >= 5
        ) {
          return;
        }


        const text =
          clean(
            $(element).text()
          );


        if (
          !text.includes(
            "平日"
          )
        ) {
          return;
        }


        weekdayFound++;


        output +=
          `\n--- WEEKDAY ${weekdayFound} ---\n`;


        output +=
          `TAG: ${element.tagName}\n`;


        output +=
          `CLASS: ${$(element).attr("class") || ""}\n`;


        output +=
          `ID: ${$(element).attr("id") || ""}\n`;


        output +=
          "TEXT:\n";


        output +=
          text.substring(
            0,
            5000
          );


        output +=
          "\n\nHTML:\n";


        output +=
          $.html(
            element
          ).substring(
            0,
            15000
          );


        output +=
          "\n\n";

      }
    );


    /*
     * =====================================================
     * ③ table一覧
     * =====================================================
     */

    output +=
      "\n\n******** TABLE一覧 ********\n";


    let tableNo = 0;


    $("table").each(
      (index, table) => {

        if (
          tableNo >= 15
        ) {
          return;
        }


        tableNo++;


        const text =
          clean(
            $(table).text()
          );


        output +=
          `\n--- TABLE ${tableNo} ---\n`;


        output +=
          "TEXT:\n";


        output +=
          text.substring(
            0,
            5000
          );


        output +=
          "\nHTML:\n";


        output +=
          $.html(
            table
          ).substring(
            0,
            15000
          );


        output +=
          "\n\n";

      }
    );

  }


  fs.writeFileSync(
    DEBUG_FILE,
    output,
    "utf8"
  );


  console.log("");
  console.log(
    "============================================"
  );

  console.log(
    "DEBUG COMPLETE"
  );

  console.log(
    `DEBUG FILE: ${DEBUG_FILE}`
  );

  console.log(
    "============================================"
  );

}


main()
  .catch(
    error => {

      console.error(
        error
      );

      process.exit(1);

    }
  );
