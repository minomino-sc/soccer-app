const https = require("https");

const URL =
  "https://www.jorudan.co.jp/bus/rosen/timetable/%E6%97%A5%E3%81%AE%E5%B3%B0%EF%BC%91%E4%B8%81%E7%9B%AE%E3%80%94%E9%98%AA%E6%80%A5%E3%83%90%E3%82%B9%E3%80%95/%E8%A5%BF%E9%88%B4%E7%A5%9E%E6%88%B8%E7%B7%9A%EF%BC%91%EF%BC%95%EF%BC%98%E7%B3%BB%E7%B5%B1/%E6%9D%BE%E3%81%8C%E6%9E%9E%E7%94%BA/";

function fetchPage(url) {

  return new Promise((resolve, reject) => {

    https.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
          "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language":
            "ja,en-US;q=0.9,en;q=0.8"
        }
      },
      res => {

        console.log("HTTP:", res.statusCode);
        console.log("Content-Type:", res.headers["content-type"]);

        let body = "";

        res.setEncoding("utf8");

        res.on("data", chunk => {
          body += chunk;
        });

        res.on("end", () => {

          if (res.statusCode !== 200) {
            reject(
              new Error(
                `HTTP ${res.statusCode}`
              )
            );
            return;
          }

          resolve(body);
        });

      }
    ).on("error", reject);

  });

}


function decodeHtml(text) {

  return String(text || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');

}


function stripTags(text) {

  return decodeHtml(
    String(text || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();

}


function main() {

  console.log("======================================");
  console.log("ジョルダン 158系統 取得テスト");
  console.log("======================================");

  console.log("");
  console.log("対象:");
  console.log("日の峰1丁目");
  console.log("西鈴神戸線158系統");
  console.log("谷上駅方面");

  fetchPage(URL)

    .then(html => {

      console.log("");
      console.log("HTML取得成功");
      console.log(
        "HTML size:",
        html.length,
        "bytes"
      );

      console.log("");
      console.log("===== 対象文字列確認 =====");

      const plain =
        stripTags(html);

      const checks = [
        "日の峰",
        "158",
        "谷上駅",
        "西鈴神戸線"
      ];

      for (const word of checks) {

        console.log(
          word,
          ":",
          plain.includes(word)
            ? "FOUND"
            : "NOT FOUND"
        );

      }

      console.log("");
      console.log("===== 時刻候補 =====");

      const times =
        plain.match(
          /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g
        ) || [];

      const uniqueTimes =
        [...new Set(times)];

      console.log(
        uniqueTimes.join(" ")
      );

      console.log("");
      console.log(
        "時刻候補数:",
        uniqueTimes.length
      );

      console.log("");
      console.log("======================================");
      console.log("検証終了");
      console.log("======================================");

    })

    .catch(error => {

      console.error("");
      console.error(
        "取得失敗:",
        error.message
      );

      process.exit(1);

    });

}

main();
