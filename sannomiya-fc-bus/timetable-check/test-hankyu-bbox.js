const https = require("https");
const fs = require("fs");
const { execFileSync } = require("child_process");

const PDF_URL =
  "https://www.hankyubus.co.jp/rosen/timetable/pdf/20230201_n.k_kobe-tanigami.pdf";

const PDF_PATH = "/tmp/hankyu-test.pdf";
const TXT_PATH = "/tmp/hankyu-test.txt";

function download(url, output) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(output);

    https.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36"
        }
      },
      res => {

        console.log("HTTP:", res.statusCode);
        console.log("Content-Type:", res.headers["content-type"]);

        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          file.close();
          fs.unlinkSync(output);

          return download(
            new URL(res.headers.location, url).href,
            output
          ).then(resolve).catch(reject);
        }

        if (res.statusCode !== 200) {
          file.close();
          fs.unlinkSync(output);
          reject(
            new Error(`HTTP ${res.statusCode}`)
          );
          return;
        }

        res.pipe(file);

        file.on("finish", () => {
          file.close(resolve);
        });
      }
    ).on("error", reject);
  });
}

function main() {

  console.log("======================================");
  console.log("阪急バス PDF bbox 検証");
  console.log("======================================");

  download(PDF_URL, PDF_PATH)
    .then(() => {

      const stat =
        fs.statSync(PDF_PATH);

      console.log(
        "PDF size:",
        stat.size,
        "bytes"
      );

      if (stat.size < 10000) {
        throw new Error(
          "PDFサイズが異常です"
        );
      }

      console.log(
        "pdftotext -bbox-layout 実行"
      );

      execFileSync(
        "pdftotext",
        [
          "-bbox-layout",
          PDF_PATH,
          TXT_PATH
        ],
        {
          stdio: "inherit"
        }
      );

      const html =
        fs.readFileSync(
          TXT_PATH,
          "utf8"
        );

      console.log(
        "bbox出力サイズ:",
        html.length
      );

      console.log("");
      console.log("===== 158 検索 =====");

      const positions158 = [];

      const regex158 =
        /<word[^>]*xMin="([^"]+)"[^>]*yMin="([^"]+)"[^>]*xMax="([^"]+)"[^>]*yMax="([^"]+)"[^>]*>(.*?)<\/word>/g;

      let m;

      while ((m = regex158.exec(html))) {

        const text =
          m[5]
            .replace(/<[^>]+>/g, "")
            .trim();

        if (
          text === "158" ||
          text === "[158]"
        ) {

          positions158.push({
            text,
            xMin: Number(m[1]),
            yMin: Number(m[2]),
            xMax: Number(m[3]),
            yMax: Number(m[4])
          });
        }
      }

      console.log(
        "158候補:",
        positions158
      );

      console.log("");
      console.log("===== 日の峰1丁目 検索 =====");

      const positionsHinomine = [];

      regex158.lastIndex = 0;

      while ((m = regex158.exec(html))) {

        const text =
          m[5]
            .replace(/<[^>]+>/g, "")
            .trim();

        if (
          text.includes("日の峰")
        ) {

          positionsHinomine.push({
            text,
            xMin: Number(m[1]),
            yMin: Number(m[2]),
            xMax: Number(m[3]),
            yMax: Number(m[4])
          });
        }
      }

      console.log(
        "日の峰候補:",
        positionsHinomine
      );

      console.log("");
      console.log("===== 時刻候補 =====");

      const times = [];

      regex158.lastIndex = 0;

      while ((m = regex158.exec(html))) {

        const text =
          m[5]
            .replace(/<[^>]+>/g, "")
            .trim();

        if (
          /^\d{1,2}$/.test(text) ||
          /^\d{1,2}:\d{2}$/.test(text)
        ) {

          times.push({
            text,
            xMin: Number(m[1]),
            yMin: Number(m[2]),
            xMax: Number(m[3]),
            yMax: Number(m[4])
          });
        }
      }

      console.log(
        times.slice(0, 100)
      );

      console.log("");
      console.log("======================================");
      console.log("検証終了");
      console.log("======================================");

    })
    .catch(error => {

      console.error("");
      console.error(
        "検証失敗:",
        error.message
      );

      process.exit(1);
    });
}

main();
