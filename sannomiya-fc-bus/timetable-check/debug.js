const url =
  "https://kotsu.city.kobe.lg.jp/bus/bus-stop-list/bus-836/";

async function main() {

  console.log("========================================");
  console.log("神戸市バス 62系統 HTML確認");
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

    console.log("HTML文字数:", html.length);
    console.log("TABLE数:", $("table").length);

    /*
     * 62系統の文字が存在する場所を探す
     */
    const text = $("body").text();

    const index = text.indexOf("62系統");

    console.log("");
    console.log("========================================");
    console.log("62系統周辺");
    console.log("========================================");

    if (index >= 0) {
      console.log(
        text.substring(
          Math.max(0, index - 1000),
          index + 5000
        )
      );
    } else {
      console.log("62系統が見つかりません");
    }

    /*
     * 62系統を含む要素を探す
     */
    console.log("");
    console.log("========================================");
    console.log("62系統を含むHTML要素");
    console.log("========================================");

    $("*").each((i, el) => {

      const elementText = $(el)
        .clone()
        .children()
        .remove()
        .end()
        .text()
        .replace(/\s+/g, " ")
        .trim();

      if (
        elementText.includes("62系統") &&
        elementText.length < 300
      ) {

        console.log("");
        console.log("TAG:", el.tagName);
        console.log("CLASS:", $(el).attr("class") || "");
        console.log("ID:", $(el).attr("id") || "");
        console.log("TEXT:", elementText);

      }

    });

    /*
     * 「神戸北町方面行き」を含む要素
     */
    console.log("");
    console.log("========================================");
    console.log("神戸北町方面行き");
    console.log("========================================");

    $("*").each((i, el) => {

      const elementText = $(el)
        .clone()
        .children()
        .remove()
        .end()
        .text()
        .replace(/\s+/g, " ")
        .trim();

      if (
        elementText.includes("神戸北町方面行き") &&
        elementText.length < 300
      ) {

        console.log("");
        console.log("TAG:", el.tagName);
        console.log("CLASS:", $(el).attr("class") || "");
        console.log("ID:", $(el).attr("id") || "");
        console.log("TEXT:", elementText);

        console.log(
          $.html(el).substring(0, 3000)
        );

      }

    });

  } catch (error) {

    console.log("ERROR:", error.message);

  }

}

main();
