/* =========================================================
   KOBE SANNOMIYA FC
   JUNIOR YOUTH TRANSPORT

   乗り継ぎ対応版

   ・timetable.js の現在の構造に完全対応
   ・各交通機関を順番に検索
   ・乗り継ぎ時間を考慮
   ・最終到着時刻を表示
   ・所要時間を表示
   ・次の候補を3ルート表示
   ・1秒ごとにカウントダウン更新

   timetable.js は変更不要
========================================================= */


/* =========================================================
   状態
========================================================= */

let selectedVenue = null;
let selectedDirection = null;


/* =========================================================
   DOM
========================================================= */

const venueButtons =
  document.querySelectorAll(".venue-button");

const directionButtons =
  document.querySelectorAll(".direction-button");

const directionSection =
  document.getElementById("directionSection");

const resultSection =
  document.getElementById("resultSection");

const selectedVenueElement =
  document.getElementById("selectedVenue");

const selectedDirectionElement =
  document.getElementById("selectedDirection");

const routeCards =
  document.getElementById("routeCards");

const backButton =
  document.getElementById("backButton");

const currentDate =
  document.getElementById("currentDate");

const currentTime =
  document.getElementById("currentTime");

const dayType =
  document.getElementById("dayType");


/* =========================================================
   会場名
========================================================= */

const VENUE_NAMES = {

  onohama:
    "小野浜球技場",

  koreanch:
    "神戸朝鮮中",

  comista:
    "コミスタ神戸"

};


/* =========================================================
   方向名
========================================================= */

const DIRECTION_NAMES = {

  go:
    "行き",

  return:
    "帰り"

};


/* =========================================================
   乗り換え時間
========================================================= */

const TRANSFER_MINUTES = {

  /*
   * 日の峰1丁目
   * ↓
   * 谷上駅
   */
  "阪急バス→神戸市営地下鉄":
    3,

  /*
   * 谷上駅
   * ↓
   * 三宮駅
   */
  "神戸市営地下鉄→神戸新交通 ポートライナー":
    5,

  /*
   * 谷上駅
   * ↓
   * 三ノ宮駅
   *
   * JRへの乗換
   */
  "神戸市営地下鉄→JR西日本":
    5,

  /*
   * 灘駅
   * ↓
   * 三ノ宮駅
   */
  "JR西日本→神戸市営地下鉄":
    5,

  /*
   * ポートライナー
   * ↓
   * 地下鉄
   */
  "神戸新交通 ポートライナー→神戸市営地下鉄":
    5,

  /*
   * 地下鉄
   * ↓
   * 市バス
   */
  "神戸市営地下鉄→神戸市バス":
    3

};


/* =========================================================
   交通機関アイコン
========================================================= */

function getTransportIcon(operator) {

  if (!operator) {
    return "🚉";
  }

  if (
    operator.includes("阪急バス") ||
    operator.includes("神戸市バス")
  ) {
    return "🚌";
  }

  if (
    operator.includes("地下鉄")
  ) {
    return "🚇";
  }

  if (
    operator.includes("ポートライナー") ||
    operator.includes("神戸新交通")
  ) {
    return "🚈";
  }

  if (
    operator.includes("JR")
  ) {
    return "🚃";
  }

  return "🚉";

}


/* =========================================================
   曜日判定
========================================================= */

function getDayType(date) {

  const day =
    date.getDay();

  if (
    day === 0 ||
    day === 6
  ) {
    return "holiday";
  }

  return "weekday";

}


/* =========================================================
   現在秒
========================================================= */

function getCurrentSeconds(date) {

  return (
    date.getHours() * 3600 +
    date.getMinutes() * 60 +
    date.getSeconds()
  );

}


/* =========================================================
   時刻 → 秒
========================================================= */

function timeToSeconds(
  hour,
  minute
) {

  return (
    Number(hour) * 3600 +
    Number(minute) * 60
  );

}


/* =========================================================
   秒 → HH:MM
========================================================= */

function secondsToTime(
  seconds
) {

  /*
   * 深夜24時台を表示する場合にも対応
   */

  let normalized =
    Number(seconds);

  let hour =
    Math.floor(
      normalized / 3600
    );

  const minute =
    Math.floor(
      (normalized % 3600) / 60
    );

  /*
   * 24時台をそのまま表示
   */

  if (hour >= 24) {

    return (
      String(hour).padStart(2, "0") +
      ":" +
      String(minute).padStart(2, "0")
    );

  }

  return (
    String(hour).padStart(2, "0") +
    ":" +
    String(minute).padStart(2, "0")
  );

}


/* =========================================================
   秒 → HH:MM:SS
========================================================= */

function secondsToClock(
  seconds
) {

  seconds =
    Math.max(
      0,
      Math.floor(seconds)
    );

  const hour =
    Math.floor(
      seconds / 3600
    );

  const minute =
    Math.floor(
      (seconds % 3600) / 60
    );

  const second =
    seconds % 60;

  return (
    String(hour).padStart(2, "0") +
    ":" +
    String(minute).padStart(2, "0") +
    ":" +
    String(second).padStart(2, "0")
  );

}


/* =========================================================
   時刻表をフラット化
========================================================= */

function flattenTimetable(
  timetable
) {

  const result = [];

  if (!timetable) {
    return result;
  }

  Object.keys(timetable)
    .forEach(hour => {

      const minutes =
        timetable[hour];

      if (
        !Array.isArray(minutes)
      ) {
        return;
      }

      minutes.forEach(
        minute => {

          result.push({

            hour:
              Number(hour),

            minute:
              Number(minute),

            seconds:
              timeToSeconds(
                Number(hour),
                Number(minute)
              )

          });

        }
      );

    });


  result.sort(
    (a, b) =>
      a.seconds - b.seconds
  );


  return result;

}


/* =========================================================
   指定時刻以降の便を取得
========================================================= */

function getDeparturesAfter(
  timetable,
  afterSeconds
) {

  return flattenTimetable(
    timetable
  ).filter(
    item =>
      item.seconds >=
      afterSeconds
  );

}


/* =========================================================
   交通機関名から表示名
========================================================= */

function getShortOperatorName(
  operator
) {

  if (!operator) {
    return "";
  }

  if (
    operator.includes("神戸新交通")
  ) {
    return "神戸新交通";
  }

  return operator;

}


/* =========================================================
   2つの交通機関間の
   乗り換え時間を取得
========================================================= */

function getTransferMinutes(
  currentOperator,
  nextOperator
) {

  const key =
    currentOperator +
    "→" +
    nextOperator;


  /*
   * 明示設定
   */

  if (
    Object.prototype.hasOwnProperty.call(
      TRANSFER_MINUTES,
      key
    )
  ) {

    return TRANSFER_MINUTES[
      key
    ];

  }


  /*
   * デフォルト
   */

  return 3;

}


/* =========================================================
   交通機関の所要時間
=========================================================

   現在の時刻表では
   到着時刻が記載されていないため、
   ルートごとに実際の所要時間を設定。

========================================================= */

function getTravelMinutes(
  operator,
  station
) {

  /*
   * 阪急バス
   * 日の峰1丁目 → 谷上駅
   */

  if (
    operator === "阪急バス" &&
    station.includes("日の峰1丁目") &&
    station.includes("谷上駅")
  ) {

    return 21;

  }


  /*
   * 神戸市バス
   * 谷上駅 → 日の峰1丁目方面
   */

  if (
    operator === "神戸市バス" &&
    station.includes("谷上駅") &&
    station.includes("日の峰1丁目")
  ) {

    return 21;

  }


  /*
   * 地下鉄
   */

  if (
    operator === "神戸市営地下鉄"
  ) {

    return 10;

  }


  /*
   * ポートライナー
   */

  if (
    operator.includes("ポートライナー")
  ) {

    return 4;

  }


  /*
   * JR
   */

  if (
    operator === "JR西日本"
  ) {

    return 3;

  }


  /*
   * デフォルト
   */

  return 5;

}


/* =========================================================
   会場のルートを取得
========================================================= */

function getRouteDefinition(
  venue,
  direction
) {

  if (
    !TIMETABLE_DATA ||
    !TIMETABLE_DATA.venues
  ) {
    return null;
  }


  const venueData =
    TIMETABLE_DATA
      .venues[
        venue
      ];


  if (!venueData) {
    return null;
  }


  return (
    venueData[
      direction
    ] || null
  );

}


/* =========================================================
   1つの交通機関の
   時刻表を取得
========================================================= */

function getLegTimetable(
  leg,
  dayType
) {

  if (
    !leg ||
    !leg.timetable
  ) {
    return null;
  }


  return (
    leg.timetable[
      dayType
    ] || null
  );

}


/* =========================================================
   指定時刻以降の
   最初の便
========================================================= */

function findNextDeparture(
  timetable,
  earliestSeconds
) {

  const departures =
    getDeparturesAfter(
      timetable,
      earliestSeconds
    );


  if (
    departures.length === 0
  ) {

    return null;

  }


  return departures[0];

}


/* =========================================================
   1本の乗り継ぎルートを計算
========================================================= */

function calculateCandidate(
  route,
  firstDeparture,
  dayType
) {

  if (
    !route ||
    !route.length
  ) {

    return null;

  }


  const legs = [];

  let currentDeparture =
    firstDeparture;


  for (
    let i = 0;
    i < route.length;
    i++
  ) {

    const leg =
      route[i];


    /*
     * 最初の交通機関
     */

    if (i === 0) {

      currentDeparture =
        firstDeparture;

    }


    /*
     * 2区間目以降
     *
     * 前の交通機関の到着時刻から
     * 乗り換え時間を確保して
     * 次に乗れる便を探す
     */

    else {

      const previousLeg =
        legs[i - 1];


      const transferMinutes =
        getTransferMinutes(
          previousLeg.operator,
          leg.operator
        );


      const earliestSeconds =
        previousLeg.arrivalSeconds +
        transferMinutes * 60;


      const timetable =
        getLegTimetable(
          leg,
          dayType
        );


      if (!timetable) {
        return null;
      }


      currentDeparture =
        findNextDeparture(
          timetable,
          earliestSeconds
        );


      if (!currentDeparture) {
        return null;
      }

    }


    /*
     * 所要時間
     */

    const travelMinutes =
      getTravelMinutes(
        leg.operator,
        leg.station
      );


    const arrivalSeconds =
      currentDeparture.seconds +
      travelMinutes * 60;


    /*
     * 次の乗り換え時間
     */

    let transferMinutes = 0;


    if (
      i <
      route.length - 1
    ) {

      transferMinutes =
        getTransferMinutes(
          leg.operator,
          route[i + 1].operator
        );

    }


    legs.push({

      operator:
        leg.operator,

      station:
        leg.station,

      departureSeconds:
        currentDeparture.seconds,

      departureTime:
        secondsToTime(
          currentDeparture.seconds
        ),

      travelMinutes,

      arrivalSeconds,

      arrivalTime:
        secondsToTime(
          arrivalSeconds
        ),

      transferMinutes

    });

  }


  const first =
    legs[0];

  const last =
    legs[
      legs.length - 1
    ];


  return {

    legs,

    departureSeconds:
      first.departureSeconds,

    arrivalSeconds:
      last.arrivalSeconds,

    durationMinutes:
      Math.round(
        (
          last.arrivalSeconds -
          first.departureSeconds
        ) / 60
      )

  };

}


/* =========================================================
   次の乗り継ぎ候補を検索
========================================================= */

function getRouteCandidates(
  venue,
  direction,
  nowSeconds,
  dayType
) {

  const route =
    getRouteDefinition(
      venue,
      direction
    );


  if (
    !route ||
    !route.length
  ) {

    return [];

  }


  /*
   * 最初の交通機関
   */

  const firstLeg =
    route[0];


  const firstTimetable =
    getLegTimetable(
      firstLeg,
      dayType
    );


  if (!firstTimetable) {

    return [];

  }


  const firstDepartures =
    getDeparturesAfter(
      firstTimetable,
      nowSeconds
    );


  const candidates = [];


  /*
   * 最初の便を順番に試す
   *
   * 乗り継ぎが成立しない便は
   * 候補から除外
   */

  for (
    let i = 0;
    i < firstDepartures.length &&
    candidates.length < 3;
    i++
  ) {

    const candidate =
      calculateCandidate(
        route,
        firstDepartures[i],
        dayType
      );


    if (candidate) {

      candidates.push(
        candidate
      );

    }

  }


  return candidates;

}


/* =========================================================
   ルートカード作成
========================================================= */

function createRouteCard(
  candidate,
  index,
  nowSeconds
) {

  const card =
    document.createElement("div");

  card.className =
    "route-card";


  /*
   * NEXT / 次の候補
   */

  const label =
    index === 0
      ? "NEXT"
      : `次の候補 ${index + 1}`;


  /*
   * 最初の便まで
   */

  const countdown =
    Math.max(
      0,
      candidate.departureSeconds -
      nowSeconds
    );


  /*
   * ヘッダー
   */

  const header =
    document.createElement("div");

  header.className =
    "route-card-header";


  header.innerHTML = `

    <div>

      <div class="route-number">
        ${label}
      </div>

      <div class="route-main-time">
        ${secondsToTime(
          candidate.departureSeconds
        )}

        <span>発</span>
      </div>

    </div>

    ${
      index === 0
        ? `
          <div class="countdown">

            あと

            <strong>
              ${secondsToClock(
                countdown
              )}
            </strong>

          </div>
        `
        : ""
    }

  `;


  card.appendChild(
    header
  );


  /*
   * ルート本体
   */

  const legs =
    document.createElement("div");

  legs.className =
    "route-legs";


  candidate.legs.forEach(
    (leg, legIndex) => {

      const item =
        document.createElement("div");

      item.className =
        "route-leg";


      const icon =
        getTransportIcon(
          leg.operator
        );


      const operator =
        getShortOperatorName(
          leg.operator
        );


      /*
       * 次の乗り換え
       */

      let transferHTML = "";


      if (
        legIndex <
        candidate.legs.length - 1
      ) {

        transferHTML = `

          <div class="transfer-info">

            ↳
            ${leg.transferMinutes}分乗換

          </div>

        `;

      }


      item.innerHTML = `

        <div class="route-leg-line">

          <div class="route-time">

            ${leg.departureTime}

          </div>

          <div class="route-icon">

            ${icon}

          </div>

          <div class="route-info">

            <div class="transport-name">

              ${operator}

            </div>

            <div class="route-place">

              ${leg.station}

            </div>

          </div>

        </div>


        <div class="route-arrival">

          <span>

            ${leg.arrivalTime} 着

          </span>

        </div>


        ${transferHTML}

      `;


      legs.appendChild(
        item
      );

    }
  );


  card.appendChild(
    legs
  );


  /*
   * 最終結果
   */

  const summary =
    document.createElement("div");

  summary.className =
    "route-summary";


  summary.innerHTML = `

    <div class="arrival-summary">

      <span>
        最終到着
      </span>

      <strong>
        ${secondsToTime(
          candidate.arrivalSeconds
        )}
      </strong>

    </div>


    <div class="duration-summary">

      所要時間

      <strong>
        約${candidate.durationMinutes}分
      </strong>

    </div>

  `;


  card.appendChild(
    summary
  );


  return card;

}


/* =========================================================
   ルート表示
========================================================= */

function renderRoutes() {

  if (
    !selectedVenue ||
    !selectedDirection
  ) {

    return;

  }


  const now =
    new Date();


  const nowSeconds =
    getCurrentSeconds(
      now
    );


  const dayType =
    getDayType(
      now
    );


  const candidates =
    getRouteCandidates(
      selectedVenue,
      selectedDirection,
      nowSeconds,
      dayType
    );


  routeCards.innerHTML =
    "";


  /*
   * 便がない
   */

  if (
    candidates.length === 0
  ) {

    routeCards.innerHTML = `

      <div class="route-card">

        <div class="no-service">

          本日の運行は終了しました

        </div>

      </div>

    `;

    return;

  }


  /*
   * 3候補を表示
   */

  candidates.forEach(
    (candidate, index) => {

      const card =
        createRouteCard(
          candidate,
          index,
          nowSeconds
        );


      routeCards.appendChild(
        card
      );

    }
  );

}


/* =========================================================
   時計表示
========================================================= */

function updateClock() {

  const now =
    new Date();


  /*
   * 日付
   */

  const year =
    now.getFullYear();

  const month =
    now.getMonth() + 1;

  const date =
    now.getDate();


  const weekdays = [
    "日",
    "月",
    "火",
    "水",
    "木",
    "金",
    "土"
  ];


  currentDate.textContent =
    `${year}年${month}月${date}日（${weekdays[now.getDay()]}）`;


  /*
   * 時刻
   */

  currentTime.textContent =
    `${String(
      now.getHours()
    ).padStart(2, "0")}:` +

    `${String(
      now.getMinutes()
    ).padStart(2, "0")}:` +

    `${String(
      now.getSeconds()
    ).padStart(2, "0")}`;


  /*
   * ダイヤ
   */

  dayType.textContent =
    getDayType(now) === "holiday"
      ? "土日祝ダイヤ"
      : "平日ダイヤ";


  /*
   * ルート表示中なら
   * カウントダウンも更新
   */

  if (
    selectedVenue &&
    selectedDirection
  ) {

    renderRoutes();

  }

}


/* =========================================================
   会場選択
========================================================= */

venueButtons.forEach(
  button => {

    button.addEventListener(
      "click",
      () => {

        selectedVenue =
          button.dataset.venue;

        selectedDirection =
          null;


        /*
         * 選択状態
         */

        venueButtons.forEach(
          item => {

            item.classList.remove(
              "selected"
            );

          }
        );


        button.classList.add(
          "selected"
        );


        /*
         * 行き・帰りを表示
         */

        directionSection
          .classList
          .remove("hidden");


        resultSection
          .classList
          .add("hidden");

      }
    );

  }
);


/* =========================================================
   行き・帰り選択
========================================================= */

directionButtons.forEach(
  button => {

    button.addEventListener(
      "click",
      () => {

        selectedDirection =
          button.dataset.direction;


        selectedVenueElement.textContent =
          VENUE_NAMES[
            selectedVenue
          ] || "";


        selectedDirectionElement.textContent =
          DIRECTION_NAMES[
            selectedDirection
          ] || "";


        resultSection
          .classList
          .remove("hidden");


        renderRoutes();

      }
    );

  }
);


/* =========================================================
   変更ボタン
========================================================= */

backButton.addEventListener(
  "click",
  () => {

    selectedDirection =
      null;


    resultSection
      .classList
      .add("hidden");


    directionSection
      .classList
      .remove("hidden");

  }
);


/* =========================================================
   初期表示
========================================================= */

updateClock();


/* =========================================================
   1秒ごとに更新
========================================================= */

setInterval(
  updateClock,
  1000
);
