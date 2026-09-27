/* =========================================================
   KOBE SANNOMIYA FC
   JUNIOR YOUTH TRANSPORT
   乗り継ぎ対応版 main.js

   ・各交通機関の乗り継ぎを自動判定
   ・乗り継ぎ可能な便だけを候補として表示
   ・最初の出発時刻だけでなく各区間の時刻を表示
   ・最終到着時刻を表示
   ・所要時間を表示
   ・現在時刻から次に利用できるルートを検索
========================================================= */

let selectedVenue = null;
let selectedDirection = null;

let currentNow = new Date();

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
   曜日判定
   土日 → holiday
   平日 → weekday
========================================================= */

function isWeekend(date) {

  const day = date.getDay();

  return day === 0 || day === 6;

}


/* =========================================================
   曜日データ取得
========================================================= */

function getDayType(date) {

  return isWeekend(date)
    ? "holiday"
    : "weekday";

}


/* =========================================================
   時刻 → 秒
========================================================= */

function timeToSeconds(hour, minute) {

  return (
    Number(hour) * 3600 +
    Number(minute) * 60
  );

}


/* =========================================================
   秒 → HH:MM
========================================================= */

function secondsToTime(totalSeconds) {

  totalSeconds =
    ((totalSeconds % 86400) + 86400) % 86400;

  const hour =
    Math.floor(totalSeconds / 3600);

  const minute =
    Math.floor(
      (totalSeconds % 3600) / 60
    );

  return (
    String(hour).padStart(2, "0") +
    ":" +
    String(minute).padStart(2, "0")
  );

}


/* =========================================================
   秒 → HH:MM:SS
========================================================= */

function secondsToClock(totalSeconds) {

  totalSeconds =
    Math.max(0, Math.floor(totalSeconds));

  const hour =
    Math.floor(totalSeconds / 3600);

  const minute =
    Math.floor(
      (totalSeconds % 3600) / 60
    );

  const second =
    totalSeconds % 60;

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

function flattenTimetable(timetable) {

  const result = [];

  if (!timetable) {
    return result;
  }

  Object.keys(timetable)
    .forEach(hour => {

      const minutes =
        timetable[hour];

      if (!Array.isArray(minutes)) {
        return;
      }

      minutes.forEach(minute => {

        result.push({
          hour: Number(hour),
          minute: Number(minute),
          seconds:
            timeToSeconds(
              Number(hour),
              Number(minute)
            )
        });

      });

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

  const all =
    flattenTimetable(timetable);

  return all.filter(
    item =>
      item.seconds >= afterSeconds
  );

}


/* =========================================================
   指定時刻以降の最初の便
========================================================= */

function getNextDeparture(
  timetable,
  afterSeconds
) {

  const departures =
    getDeparturesAfter(
      timetable,
      afterSeconds
    );

  return departures.length
    ? departures[0]
    : null;

}


/* =========================================================
   交通機関アイコン
========================================================= */

function getTransportIcon(type) {

  switch (type) {

    case "bus":
      return "🚌";

    case "subway":
      return "🚇";

    case "portliner":
      return "🚈";

    case "jr":
      return "🚃";

    default:
      return "🚉";

  }

}


/* =========================================================
   交通機関名
========================================================= */

function getTransportName(type) {

  switch (type) {

    case "bus":
      return "阪急バス";

    case "subway":
      return "神戸市営地下鉄";

    case "portliner":
      return "神戸新交通";

    case "jr":
      return "JR西日本";

    default:
      return "";

  }

}


/* =========================================================
   乗り継ぎ可能か判定
========================================================= */

function canTransfer(
  arrivalSeconds,
  nextDepartureSeconds,
  transferMinutes
) {

  return (
    nextDepartureSeconds >=
    arrivalSeconds +
    transferMinutes * 60
  );

}


/* =========================================================
   次に乗れる便を検索
========================================================= */

function findNextTransfer(
  timetable,
  earliestSeconds
) {

  const departures =
    getDeparturesAfter(
      timetable,
      earliestSeconds
    );

  return departures.length
    ? departures[0]
    : null;

}


/* =========================================================
   ルート1本を検索
========================================================= */

function searchRoute(
  legs,
  startSeconds,
  dayTimetables
) {

  const result = [];

  let earliestSeconds =
    startSeconds;

  for (
    let i = 0;
    i < legs.length;
    i++
  ) {

    const leg =
      legs[i];

    const timetable =
      dayTimetables[
        leg.transport
      ];

    if (!timetable) {
      return null;
    }

    const departure =
      findNextTransfer(
        timetable,
        earliestSeconds
      );

    if (!departure) {
      return null;
    }

    /*
     * 乗車時間
     */
    const arrivalSeconds =
      departure.seconds +
      leg.travelMinutes * 60;

    result.push({

      ...leg,

      departureHour:
        departure.hour,

      departureMinute:
        departure.minute,

      departureSeconds:
        departure.seconds,

      arrivalSeconds,

      arrivalTime:
        secondsToTime(
          arrivalSeconds
        )

    });

    /*
     * 次の交通機関へ
     *
     * transferMinutes は
     * 現在の交通機関を降りてから
     * 次の交通機関へ乗るまでの時間
     */

    earliestSeconds =
      arrivalSeconds +
      (leg.transferMinutes || 0) * 60;

  }

  return {

    legs: result,

    departureSeconds:
      result[0].departureSeconds,

    arrivalSeconds:
      result[result.length - 1]
        .arrivalSeconds

  };

}


/* =========================================================
   ルート定義
=========================================================

   travelMinutes
   = その区間の所要時間

   transferMinutes
   = 到着してから次の交通機関へ乗るまでの
     最低乗り換え時間

========================================================= */

const ROUTES = {


  /* =======================================================
     小野浜球技場
  ======================================================= */

  onohama: {

    go: [

      {
        transport: "bus",
        from: "日の峰1丁目",
        to: "谷上駅",
        travelMinutes: 21,
        transferMinutes: 3
      },

      {
        transport: "subway",
        from: "谷上駅",
        to: "三宮駅",
        travelMinutes: 10,
        transferMinutes: 5
      },

      {
        transport: "portliner",
        from: "三宮駅",
        to: "貿易センター駅",
        travelMinutes: 4,
        transferMinutes: 0
      }

    ],

    return: [

      {
        transport: "portliner",
        from: "貿易センター駅",
        to: "三宮駅",
        travelMinutes: 4,
        transferMinutes: 5
      },

      {
        transport: "subway",
        from: "三宮駅",
        to: "谷上駅",
        travelMinutes: 10,
        transferMinutes: 3
      },

      {
        transport: "bus",
        from: "谷上駅",
        to: "日の峰1丁目",
        travelMinutes: 21,
        transferMinutes: 0
      }

    ]

  },


  /* =======================================================
     神戸朝鮮中
  ======================================================= */

  koreanch: {

    go: [

      {
        transport: "bus",
        from: "日の峰1丁目",
        to: "谷上駅",
        travelMinutes: 21,
        transferMinutes: 3
      },

      {
        transport: "subway",
        from: "谷上駅",
        to: "三宮駅",
        travelMinutes: 10,
        transferMinutes: 5
      },

      {
        transport: "jr",
        from: "三ノ宮駅",
        to: "灘駅",
        travelMinutes: 3,
        transferMinutes: 0
      }

    ],

    return: [

      {
        transport: "jr",
        from: "灘駅",
        to: "三ノ宮駅",
        travelMinutes: 3,
        transferMinutes: 5
      },

      {
        transport: "subway",
        from: "三宮駅",
        to: "谷上駅",
        travelMinutes: 10,
        transferMinutes: 3
      },

      {
        transport: "bus",
        from: "谷上駅",
        to: "日の峰1丁目",
        travelMinutes: 21,
        transferMinutes: 0
      }

    ]

  },


  /* =======================================================
     コミスタ神戸
  ======================================================= */

  comista: {

    go: [

      {
        transport: "bus",
        from: "日の峰1丁目",
        to: "谷上駅",
        travelMinutes: 21,
        transferMinutes: 3
      },

      {
        transport: "subway",
        from: "谷上駅",
        to: "三宮駅",
        travelMinutes: 10,
        transferMinutes: 0
      }

    ],

    return: [

      {
        transport: "subway",
        from: "三宮駅",
        to: "谷上駅",
        travelMinutes: 10,
        transferMinutes: 3
      },

      {
        transport: "bus",
        from: "谷上駅",
        to: "日の峰1丁目",
        travelMinutes: 21,
        transferMinutes: 0
      }

    ]

  }

};


/* =========================================================
   ルート用の時刻表を取得
========================================================= */

function getRouteTimetables(
  venue,
  direction,
  dayType
) {

  const route =
    ROUTES[
      venue
    ]?.[
      direction
    ];

  if (!route) {
    return null;
  }

  const venueData =
    TIMETABLE_DATA
      ?.venues?.[
        venue
      ];

  if (!venueData) {
    return null;
  }

  /*
   * timetable.js の構造に合わせて
   * 交通機関ごとの時刻表を取り出す
   */

  const result = {};

  route.forEach(leg => {

    const transport =
      leg.transport;

    /*
     * transport の実際の時刻表名は
     * timetable.js 側の構造によって異なるため、
     * まず交通機関名から探す
     */

    if (
      venueData[direction] &&
      venueData[direction][transport]
    ) {

      result[transport] =
        venueData[direction][transport]
          [dayType];

    }

  });

  return result;

}


/* =========================================================
   timetable.js のデータから
   交通機関ごとの時刻表を取得

   現在の timetable.js は
   各会場・行き帰りの中に
   routes 配列を持つ構造なので、
   複数パターンに対応
========================================================= */

function resolveTimetable(
  venue,
  direction,
  transport,
  dayType
) {

  const venueData =
    TIMETABLE_DATA
      ?.venues?.[
        venue
      ];

  if (!venueData) {
    return null;
  }

  const directionData =
    venueData[
      direction
    ];

  if (!directionData) {
    return null;
  }


  /*
   * ① transport が直接存在する場合
   */

  if (
    directionData[
      transport
    ]
  ) {

    const data =
      directionData[
        transport
      ];

    if (
      data &&
      data[dayType]
    ) {

      return data[dayType];

    }

  }


  /*
   * ② route 配列形式
   */

  if (
    Array.isArray(
      directionData
    )
  ) {

    const item =
      directionData.find(
        route =>
          route.transport ===
          transport
      );

    if (
      item &&
      item.timetable
    ) {

      if (
        item.timetable[
          dayType
        ]
      ) {

        return item.timetable[
          dayType
        ];

      }

    }

  }


  return null;

}


/* =========================================================
   ルートを検索
========================================================= */

function calculateRoute(
  venue,
  direction,
  nowSeconds,
  dayType
) {

  const route =
    ROUTES[
      venue
    ]?.[
      direction
    ];

  if (!route) {
    return null;
  }


  /*
   * 最初のバスを少しずつ進めながら
   * 全区間を通して成立するルートを探す
   */

  const firstLeg =
    route[0];

  const firstTimetable =
    resolveTimetable(
      venue,
      direction,
      firstLeg.transport,
      dayType
    );

  if (!firstTimetable) {
    return null;
  }

  const firstDepartures =
    getDeparturesAfter(
      firstTimetable,
      nowSeconds
    );


  for (
    let i = 0;
    i < firstDepartures.length;
    i++
  ) {

    const firstDeparture =
      firstDepartures[i];

    const legs = [];

    let currentDeparture =
      firstDeparture;

    let possible = true;


    /*
     * 各区間を順番に処理
     */

    for (
      let j = 0;
      j < route.length;
      j++
    ) {

      const leg =
        route[j];

      let departure;


      if (j === 0) {

        departure =
          currentDeparture;

      } else {

        const previousLeg =
          legs[j - 1];

        const earliest =
          previousLeg.arrivalSeconds +
          (previousLeg.transferMinutes || 0) * 60;

        const timetable =
          resolveTimetable(
            venue,
            direction,
            leg.transport,
            dayType
          );

        if (!timetable) {
          possible = false;
          break;
        }

        departure =
          findNextTransfer(
            timetable,
            earliest
          );

        if (!departure) {
          possible = false;
          break;
        }

      }


      const arrivalSeconds =
        departure.seconds +
        leg.travelMinutes * 60;


      legs.push({

        ...leg,

        departureSeconds:
          departure.seconds,

        departureTime:
          secondsToTime(
            departure.seconds
          ),

        arrivalSeconds,

        arrivalTime:
          secondsToTime(
            arrivalSeconds
          )

      });

    }


    if (!possible) {
      continue;
    }


    /*
     * すべての乗り継ぎが成立
     */

    const first =
      legs[0];

    const last =
      legs[legs.length - 1];


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


  return null;

}


/* =========================================================
   次の候補を複数取得
========================================================= */

function getRouteCandidates(
  venue,
  direction,
  nowSeconds,
  dayType,
  count = 3
) {

  const route =
    ROUTES[
      venue
    ]?.[
      direction
    ];

  if (!route) {
    return [];
  }


  const firstLeg =
    route[0];

  const firstTimetable =
    resolveTimetable(
      venue,
      direction,
      firstLeg.transport,
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


  for (
    let i = 0;
    i < firstDepartures.length &&
    candidates.length < count;
    i++
  ) {

    const departure =
      firstDepartures[i];


    const result =
      calculateRouteFromFirstDeparture(
        venue,
        direction,
        departure,
        dayType
      );


    if (result) {
      candidates.push(result);
    }

  }


  return candidates;

}


/* =========================================================
   最初の便を固定して
   その後の乗り継ぎを検索
========================================================= */

function calculateRouteFromFirstDeparture(
  venue,
  direction,
  firstDeparture,
  dayType
) {

  const route =
    ROUTES[
      venue
    ]?.[
      direction
    ];

  if (!route) {
    return null;
  }


  const legs = [];


  for (
    let i = 0;
    i < route.length;
    i++
  ) {

    const leg =
      route[i];

    let departure;


    if (i === 0) {

      departure =
        firstDeparture;

    } else {

      const previous =
        legs[i - 1];

      const earliest =
        previous.arrivalSeconds +
        (
          previous.transferMinutes ||
          0
        ) * 60;


      const timetable =
        resolveTimetable(
          venue,
          direction,
          leg.transport,
          dayType
        );

      if (!timetable) {
        return null;
      }


      departure =
        findNextTransfer(
          timetable,
          earliest
        );


      if (!departure) {
        return null;
      }

    }


    const arrivalSeconds =
      departure.seconds +
      leg.travelMinutes * 60;


    legs.push({

      ...leg,

      departureSeconds:
        departure.seconds,

      departureTime:
        secondsToTime(
          departure.seconds
        ),

      arrivalSeconds,

      arrivalTime:
        secondsToTime(
          arrivalSeconds
        )

    });

  }


  const first =
    legs[0];

  const last =
    legs[legs.length - 1];


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
   現在時刻から次の候補を表示
========================================================= */

function renderRouteCandidates() {

  if (
    !selectedVenue ||
    !selectedDirection
  ) {
    return;
  }


  const now =
    new Date();

  currentNow =
    now;


  const nowSeconds =
    now.getHours() * 3600 +
    now.getMinutes() * 60 +
    now.getSeconds();


  const type =
    getDayType(now);


  const candidates =
    getRouteCandidates(
      selectedVenue,
      selectedDirection,
      nowSeconds,
      type,
      3
    );


  routeCards.innerHTML = "";


  if (!candidates.length) {

    routeCards.innerHTML =
      `
      <div class="route-card">
        <div class="no-service">
          本日の運行は終了しました
        </div>
      </div>
      `;

    return;

  }


  candidates.forEach(
    (route, index) => {

      routeCards.appendChild(
        createRouteCard(
          route,
          index
        )
      );

    }
  );

}


/* =========================================================
   ルートカード作成
========================================================= */

function createRouteCard(
  route,
  index
) {

  const card =
    document.createElement("div");

  card.className =
    "route-card";


  const isFirst =
    index === 0;


  /*
   * 所要時間
   */

  const duration =
    route.durationMinutes;


  /*
   * 到着までの時間
   */

  const now =
    new Date();

  const nowSeconds =
    now.getHours() * 3600 +
    now.getMinutes() * 60 +
    now.getSeconds();


  const remaining =
    Math.max(
      0,
      route.departureSeconds -
      nowSeconds
    );


  /*
   * ヘッダー
   */

  const header =
    document.createElement("div");

  header.className =
    "route-card-header";


  header.innerHTML =
    `
    <div>
      <div class="route-number">
        ${isFirst ? "NEXT" : "次の候補 " + (index + 1)}
      </div>

      <div class="route-main-time">
        ${secondsToTime(route.departureSeconds)}
        <span>発</span>
      </div>
    </div>

    ${
      isFirst
        ? `
        <div class="countdown">
          あと
          <strong>
            ${secondsToClock(remaining)}
          </strong>
        </div>
        `
        : ""
    }
    `;


  card.appendChild(header);


  /*
   * 各区間
   */

  const legs =
    document.createElement("div");

  legs.className =
    "route-legs";


  route.legs.forEach(
    (leg, legIndex) => {

      const item =
        document.createElement("div");

      item.className =
        "route-leg";


      const icon =
        getTransportIcon(
          leg.transport
        );


      const transport =
        getTransportName(
          leg.transport
        );


      item.innerHTML =
        `
        <div class="route-leg-line">

          <div class="route-time">
            ${leg.departureTime}
          </div>

          <div class="route-icon">
            ${icon}
          </div>

          <div class="route-info">

            <div class="transport-name">
              ${transport}
            </div>

            <div class="route-place">
              ${leg.from}
              →
              ${leg.to}
            </div>

          </div>

        </div>

        <div class="route-arrival">

          <span>
            ${leg.arrivalTime} 到着
          </span>

          ${
            legIndex <
            route.legs.length - 1
              ? `
                <span class="transfer">
                  乗換
                  ${leg.transferMinutes || 0}分
                </span>
                `
              : ""
          }

        </div>
        `;


      legs.appendChild(item);

    }
  );


  card.appendChild(legs);


  /*
   * 最終結果
   */

  const summary =
    document.createElement("div");

  summary.className =
    "route-summary";


  summary.innerHTML =
    `
    <div class="arrival-summary">

      <span>到着</span>

      <strong>
        ${secondsToTime(
          route.arrivalSeconds
        )}
      </strong>

    </div>

    <div class="duration-summary">

      所要時間
      <strong>
        約${duration}分
      </strong>

    </div>
    `;


  card.appendChild(summary);


  return card;

}


/* =========================================================
   時計表示
========================================================= */

function updateClock() {

  const now =
    new Date();

  currentNow =
    now;


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


  currentTime.textContent =
    `${String(now.getHours()).padStart(2, "0")}:` +
    `${String(now.getMinutes()).padStart(2, "0")}:` +
    `${String(now.getSeconds()).padStart(2, "0")}`;


  dayType.textContent =
    isWeekend(now)
      ? "土日祝ダイヤ"
      : "平日ダイヤ";


  /*
   * ルート選択中なら
   * カウントダウンも更新
   */

  if (
    selectedVenue &&
    selectedDirection
  ) {

    renderRouteCandidates();

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
         * 会場名を保持
         */

        directionSection
          .classList
          .remove("hidden");

        resultSection
          .classList
          .add("hidden");


        venueButtons.forEach(
          item =>
            item.classList.remove(
              "selected"
            )
        );


        button.classList.add(
          "selected"
        );

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


        renderRouteCandidates();

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
   初期化
========================================================= */

updateClock();


/* =========================================================
   1秒ごとに更新
========================================================= */

setInterval(
  updateClock,
  1000
);
