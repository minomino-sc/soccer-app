/* =========================================================
   TIMETABLE CHECK - DIAGNOSTIC

   今回は解析しない。
   GitHub Actions から公式サイトへ
   実際にアクセスできているかだけ確認する。
========================================================= */

const TARGETS = [
  {
    name: "地下鉄 谷上駅 → 三宮駅",
    url: "https://kotsu.city.kobe.lg.jp/subway/timetable1/tanigami/"
  },
  {
    name: "地下鉄 三宮駅 → 谷上駅",
    url: "https://kotsu.city.kobe.lg.jp/subway/timetable1/sannomiya/"
  },
  {
    name: "市バス 谷上駅 → 神戸北町 62系統",
    url: "https://kotsu.city.kobe.lg.jp/bus/bus-stop-list/bus-836/"
  }
];


async function testDirect(url) {

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/140.0 Safari/537.36",

    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

    "Accept-Language":
      "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",

    "Referer":
      "https://kotsu.city.kobe.lg.jp/",

    "Cache-Control":
      "no-cache",

    "Pragma":
      "no-cache"
  };


  try {

    const response = await fetch(url, {
      method: "GET",
      headers,
      redirect: "follow"
    });


    const text = await response.text();


    console.log("");
    console.log("  [DIRECT]");
    console.log(
      "  HTTP STATUS :",
      response.status
    );
    console.log(
      "  OK          :",
      response.ok
    );
    console.log(
      "  FINAL URL   :",
      response.url
    );
    console.log(
      "  CONTENT-TYPE:",
      response.headers.get("content-type")
    );
    console.log(
      "  LENGTH      :",
      text.length
    );


    console.log(
      "  BODY START  :"
    );

    console.log(
      text.substring(0, 500)
    );


    return {
      ok: response.ok,
      status: response.status,
      url: response.url,
      contentType:
        response.headers.get("content-type"),
      length: text.length
    };


  } catch (error) {

    console.log("");
    console.log(
      "  [DIRECT ERROR]"
    );

    console.log(
      error.name
    );

    console.log(
      error.message
    );


    return {
      ok: false,
      status: null,
      error: error.message
    };

  }

}


async function testFallback(url) {

  const fallbackUrl =
    "https://r.jina.ai/" + url;


  try {

    const response = await fetch(
      fallbackUrl,
      {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 KOBE-SANNOMIYA-FC"
        },
        redirect: "follow"
      }
    );


    const text =
      await response.text();


    console.log("");
    console.log(
      "  [FALLBACK]"
    );

    console.log(
      "  HTTP STATUS :",
      response.status
    );

    console.log(
      "  OK          :",
      response.ok
    );

    console.log(
      "  FINAL URL   :",
      response.url
    );

    console.log(
      "  CONTENT-TYPE:",
      response.headers.get("content-type")
    );

    console.log(
      "  LENGTH      :",
      text.length
    );


    console.log(
      "  BODY START  :"
    );

    console.log(
      text.substring(0, 500)
    );


    return {
      ok: response.ok,
      status: response.status,
      url: response.url,
      contentType:
        response.headers.get("content-type"),
      length: text.length
    };


  } catch (error) {

    console.log("");
    console.log(
      "  [FALLBACK ERROR]"
    );

    console.log(
      error.name
    );

    console.log(
      error.message
    );


    return {
      ok: false,
      status: null,
      error: error.message
    };

  }

}


async function main() {

  console.log("");
  console.log(
    "=============================================="
  );

  console.log(
    " KOBE SANNOMIYA FC"
  );

  console.log(
    " TIMETABLE ACCESS DIAGNOSTIC"
  );

  console.log(
    "=============================================="
  );


  for (const target of TARGETS) {

    console.log("");
    console.log(
      "----------------------------------------------"
    );

    console.log(
      "TARGET:",
      target.name
    );

    console.log(
      "URL:",
      target.url
    );

    console.log(
      "----------------------------------------------"
    );


    const direct =
      await testDirect(
        target.url
      );


    /*
     * 直接取得できた場合でも、
     * 今回はフォールバックも確認する。
     *
     * これで
     * 「直接はダメだが別経路なら取得可能」
     * なのかも分かる。
     */

    const fallback =
      await testFallback(
        target.url
      );


    console.log("");
    console.log(
      "RESULT:"
    );

    console.log(
      JSON.stringify(
        {
          name: target.name,
          direct,
          fallback
        },
        null,
        2
      )
    );

  }


  console.log("");
  console.log(
    "=============================================="
  );

  console.log(
    " DIAGNOSTIC COMPLETE"
  );

  console.log(
    "=============================================="
  );

}


main()
  .catch(error => {

    console.error(
      "FATAL ERROR"
    );

    console.error(
      error
    );

    process.exit(1);

  });
