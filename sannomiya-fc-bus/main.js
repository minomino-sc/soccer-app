/* =========================================================
   KOBE SANNOMIYA FC
   JUNIOR YOUTH TRANSPORT SYSTEM

   ・会場選択
   ・行き / 帰り
   ・乗車予定時刻検索
   ・現在時刻検索
   ・乗り継ぎ考慮
   ・次の3候補
   ・横スクロール表示
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

  /* =======================================================
     DOM
  ======================================================= */

  const currentDate =
    document.getElementById("currentDate");

  const currentTime =
    document.getElementById("currentTime");

  const dayType =
    document.getElementById("dayType");

  const directionSection =
    document.getElementById("directionSection");

  const searchSection =
    document.getElementById("searchSection");

  const resultSection =
    document.getElementById("resultSection");

  const selectedVenue =
    document.getElementById("selectedVenue");

  const selectedDirection =
    document.getElementById("selectedDirection");

  const searchTime =
    document.getElementById("searchTime");

const searchDate =
  document.getElementById("searchDate");
  
  const nowButton =
    document.getElementById("nowButton");

  const searchButton =
    document.getElementById("searchButton");

  const searchSummary =
    document.getElementById("searchSummary");

  const routeCards =
    document.getElementById("routeCards");

  const backButton =
    document.getElementById("backButton");

  const venueButtons =
    document.querySelectorAll(".venue-button");

  const directionButtons =
    document.querySelectorAll(".direction-button");


  /* =======================================================
     STATE
  ======================================================= */

let selectedVenueKey = null;

let selectedDirectionKey = null;

let searchedMinutes = null;

let searchedDate = null;

  /* =======================================================
     VENUE NAME
  ======================================================= */

  function getVenueName(key) {

    return (
      TIMETABLE_DATA?.venues?.[key]?.name ||
      key
    );

  }


   /* =======================================================
     DAY TYPE
  ======================================================= */

  /*
   * 指定した日付が祝日かどうか
   *
   * 2026年の日本の祝日
   */
  function isJapaneseHoliday(date) {

    const y =
      date.getFullYear();

    const m =
      date.getMonth() + 1;

    const d =
      date.getDate();


    /*
     * 2026年
     */
    if (y === 2026) {

      const holidays = [

        "2026-01-01",
        "2026-01-12",
        "2026-02-11",
        "2026-02-23",
        "2026-03-20",
        "2026-04-29",

        "2026-05-03",
        "2026-05-04",
        "2026-05-05",
        "2026-05-06",

        "2026-07-20",
        "2026-08-11",

        "2026-09-21",
        "2026-09-22",
        "2026-09-23",

        "2026-10-12",
        "2026-11-03",
        "2026-11-23"

      ];


      const key =
        `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;


      return holidays.includes(key);

    }


    return false;

  }


  /*
   * YYYY-MM-DD → Date
   */
  function dateStringToDate(
    dateString
  ) {

    if (!dateString) {
      return null;
    }


    const parts =
      dateString.split("-");


    if (parts.length !== 3) {
      return null;
    }


    const y =
      Number(parts[0]);

    const m =
      Number(parts[1]);

    const d =
      Number(parts[2]);


    if (
      !Number.isFinite(y) ||
      !Number.isFinite(m) ||
      !Number.isFinite(d)
    ) {
      return null;
    }


    return new Date(
      y,
      m - 1,
      d
    );

  }


  /*
   * 指定日付のダイヤ種別
   */
  function getDayType(
    dateString = searchedDate
  ) {

    const date =
      dateStringToDate(
        dateString
      );


    if (!date) {

      const today =
        new Date();

      const day =
        today.getDay();


      if (
        day === 0 ||
        day === 6
      ) {
        return "holiday";
      }


      return "weekday";

    }


    const day =
      date.getDay();


    /*
     * 土曜日・日曜日
     */
    if (
      day === 0 ||
      day === 6
    ) {
      return "holiday";
    }


    /*
     * 祝日
     */
    if (
      isJapaneseHoliday(date)
    ) {
      return "holiday";
    }


    return "weekday";

  }


  function getDayTypeLabel(
    dateString = searchedDate
  ) {

    return getDayType(
      dateString
    ) === "holiday"

      ? "土日祝ダイヤ"

      : "平日ダイヤ";

  }


  /* =======================================================
     CLOCK
  ======================================================= */

  function updateClock() {

    const now =
      new Date();

    const y =
      now.getFullYear();

    const m =
      String(now.getMonth() + 1)
        .padStart(2, "0");

    const d =
      String(now.getDate())
        .padStart(2, "0");

    const hh =
      String(now.getHours())
        .padStart(2, "0");

    const mm =
      String(now.getMinutes())
        .padStart(2, "0");

    const ss =
      String(now.getSeconds())
        .padStart(2, "0");


    currentDate.textContent =
      `${y}/${m}/${d}`;

    currentTime.textContent =
      `${hh}:${mm}:${ss}`;

dayType.textContent =
  getDayTypeLabel(
    `${y}-${m}-${d}`
  );


    /*
     * NEXTカードのカウントダウンだけ更新
     */
    updateCountdowns();

  }


  /* =======================================================
     TIME
  ======================================================= */

  function timeToMinutes(time) {

    const parts =
      time.split(":");

    const h =
      Number(parts[0]);

    const m =
      Number(parts[1]);

    if (
      !Number.isFinite(h) ||
      !Number.isFinite(m)
    ) {
      return null;
    }

    return h * 60 + m;

  }


  function minutesToTime(totalMinutes) {

    let value =
      Math.round(totalMinutes);

    value =
      ((value % 1440) + 1440) % 1440;


    const h =
      Math.floor(value / 60);

    const m =
      value % 60;


    return (
      String(h).padStart(2, "0") +
      ":" +
      String(m).padStart(2, "0")
    );

  }


  function getCurrentMinutes() {

    const now =
      new Date();

    return (
      now.getHours() * 60 +
      now.getMinutes() +
      now.getSeconds() / 60
    );

  }


  /* =======================================================
     ALL DEPARTURES
  ======================================================= */

  function getAllDepartures(
    timetable,
    dayType
  ) {

    const result = [];

    if (!timetable) {
      return result;
    }

    const table =
      timetable[dayType];

    if (!table) {
      return result;
    }


    Object.keys(table)
      .forEach(hour => {

        const minutes =
          table[hour] || [];

        minutes.forEach(minute => {

          const h =
            Number(hour);

          const m =
            Number(minute);

          if (
            !Number.isFinite(h) ||
            !Number.isFinite(m)
          ) {
            return;
          }


          result.push({
            minutes:
              h * 60 + m,

            time:
              `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
          });

        });

      });


    result.sort(
      (a, b) =>
        a.minutes - b.minutes
    );


    return result;

  }


  /* =======================================================
     NEXT DEPARTURE
  ======================================================= */

  function getNextDeparture(
    timetable,
    dayType,
    earliestMinutes
  ) {

    const departures =
      getAllDepartures(
        timetable,
        dayType
      );


    return (
      departures.find(
        item =>
          item.minutes >=
          earliestMinutes
      ) || null
    );

  }


  /* =======================================================
     ROUTE DEFINITION

     transferBefore:
     この交通機関に乗る前に必要な乗り継ぎ時間

     travel:
     乗車 / 徒歩時間
  ======================================================= */

  function getRouteDefinition(
    venueKey,
    direction
  ) {

    const venue =
      TIMETABLE_DATA
        ?.venues
        ?. [venueKey];


    if (!venue) {
      return [];
    }


    /* =====================================================
       小野浜
    ===================================================== */

    if (venueKey === "onohama") {

      if (direction === "go") {

        return [

          {
            type: "timetable",
            timetable: venue.go[0].timetable,
            operator: venue.go[0].operator,
            station: venue.go[0].station,
            travel: 10,
            transferBefore: 0
          },

          {
            type: "timetable",
            timetable: venue.go[1].timetable,
            operator: venue.go[1].operator,
            station: venue.go[1].station,
            travel: 10,
            transferBefore: 5
          },

          {
            type: "timetable",
            timetable: venue.go[2].timetable,
            operator: venue.go[2].operator,
            station: venue.go[2].station,
            travel: 2,
            transferBefore: 7
          },

          {
            type: "walk",
            operator: "徒歩",
            station: "貿易センター駅 → 小野浜公園球技場",
            travel: 5
          }

        ];

      }


      return [

        {
          type: "walk",
          operator: "徒歩",
          station: "小野浜公園球技場 → 貿易センター駅",
          travel: 5
        },

        {
          type: "timetable",
          timetable: venue.return[0].timetable,
          operator: venue.return[0].operator,
          station: venue.return[0].station,
          travel: 2,
          transferBefore: 0
        },

        {
          type: "timetable",
          timetable: venue.return[1].timetable,
          operator: venue.return[1].operator,
          station: venue.return[1].station,
          travel: 10,
          transferBefore: 7
        },

        {
          type: "timetable",
          timetable: venue.return[2].timetable,
          operator: venue.return[2].operator,
          station: venue.return[2].station,
          travel: 10,
          transferBefore: 5
        }

      ];

    }


    /* =====================================================
       神戸朝鮮初中級学校
    ===================================================== */

    if (venueKey === "koreanch") {

      if (direction === "go") {

        return [

          {
            type: "timetable",
            timetable: venue.go[0].timetable,
            operator: venue.go[0].operator,
            station: venue.go[0].station,
            travel: 10,
            transferBefore: 0
          },

          {
            type: "timetable",
            timetable: venue.go[1].timetable,
            operator: venue.go[1].operator,
            station: venue.go[1].station,
            travel: 10,
            transferBefore: 5
          },

          {
            type: "timetable",
            timetable: venue.go[2].timetable,
            operator: venue.go[2].operator,
            station: venue.go[2].station,
            travel: 2,
            transferBefore: 6
          },

          {
            type: "walk",
            operator: "徒歩",
            station: "JR灘駅 → 神戸朝鮮初中級学校",
            travel: 5
          }

        ];

      }


      return [

        {
          type: "walk",
          operator: "徒歩",
          station: "神戸朝鮮初中級学校 → JR灘駅",
          travel: 5
        },

        {
          type: "timetable",
          timetable: venue.return[0].timetable,
          operator: venue.return[0].operator,
          station: venue.return[0].station,
          travel: 3,
          transferBefore: 0
        },

        {
          type: "timetable",
          timetable: venue.return[1].timetable,
          operator: venue.return[1].operator,
          station: venue.return[1].station,
          travel: 10,
          transferBefore: 6
        },

        {
          type: "timetable",
          timetable: venue.return[2].timetable,
          operator: venue.return[2].operator,
          station: venue.return[2].station,
          travel: 10,
          transferBefore: 5
        }

      ];

    }


    /* =====================================================
       コミスタこうべ
    ===================================================== */

    if (venueKey === "comista") {

      if (direction === "go") {

        return [

          {
            type: "timetable",
            timetable: venue.go[0].timetable,
            operator: venue.go[0].operator,
            station: venue.go[0].station,
            travel: 10,
            transferBefore: 0
          },

          {
            type: "timetable",
            timetable: venue.go[1].timetable,
            operator: venue.go[1].operator,
            station: venue.go[1].station,
            travel: 10,
            transferBefore: 5
          },

          {
            type: "walk",
            operator: "徒歩",
            station: "三宮駅 → コミスタこうべ",
            travel: 15
          }

        ];

      }


      return [

        {
          type: "walk",
          operator: "徒歩",
          station: "コミスタこうべ → 三宮駅",
          travel: 15
        },

        {
          type: "timetable",
          timetable: venue.return[0].timetable,
          operator: venue.return[0].operator,
          station: venue.return[0].station,
          travel: 10,
          transferBefore: 0
        },

        {
          type: "timetable",
          timetable: venue.return[1].timetable,
          operator: venue.return[1].operator,
          station: venue.return[1].station,
          travel: 10,
          transferBefore: 5
        }

      ];

    }


    return [];

  }


  /* =======================================================
     BUILD ROUTE

     ルート全体を実際の時刻表から構築
  ======================================================= */

  function buildRoute(
    definition,
    startMinutes,
    dayType
  ) {

    let currentTime =
      startMinutes;

    const legs = [];

    let firstVehicleDeparture = null;


    for (
      let i = 0;
      i < definition.length;
      i++
    ) {

      const leg =
        definition[i];


      /* -----------------------------------------------
         徒歩
      ------------------------------------------------ */

      if (leg.type === "walk") {

        const departure =
          currentTime;

        const arrival =
          departure + leg.travel;


        legs.push({

          type: "walk",

          operator:
            leg.operator,

          station:
            leg.station,

          departure:
            departure,

          arrival:
            arrival,

          departureTime:
            minutesToTime(
              departure
            ),

          arrivalTime:
            minutesToTime(
              arrival
            ),

          travel:
            leg.travel,

          transferBefore: 0

        });


        currentTime =
          arrival;


        continue;

      }


      /* -----------------------------------------------
         交通機関
      ------------------------------------------------ */

      const earliest =
        currentTime +
        (leg.transferBefore || 0);


      const departure =
        getNextDeparture(
          leg.timetable,
          dayType,
          earliest
        );


      if (!departure) {
        return null;
      }


      if (
        firstVehicleDeparture === null
      ) {

        firstVehicleDeparture =
          departure.minutes;

      }


      const arrival =
        departure.minutes +
        leg.travel;


      legs.push({

        type: "timetable",

        operator:
          leg.operator,

        station:
          leg.station,

        departure:
          departure.minutes,

        arrival:
          arrival,

        departureTime:
          departure.time,

        arrivalTime:
          minutesToTime(
            arrival
          ),

        travel:
          leg.travel,

        transferBefore:
          leg.transferBefore || 0

      });


      currentTime =
        arrival;

    }


    return {

      startTime:
        startMinutes,

      startTimeText:
        minutesToTime(
          startMinutes
        ),

      firstVehicleDeparture:
        firstVehicleDeparture,

      firstVehicleDepartureText:
        firstVehicleDeparture !== null
          ? minutesToTime(
              firstVehicleDeparture
            )
          : minutesToTime(
              startMinutes
            ),

      arrival:
        currentTime,

      arrivalTime:
        minutesToTime(
          currentTime
        ),

      totalMinutes:
        currentTime -
        startMinutes,

      legs:
        legs

    };

  }


  /* =======================================================
     ROUTE SEARCH

     入力された時刻以降のスタート時刻を起点に
     乗り継ぎ可能な3ルートを検索
  ======================================================= */

function findRoutes(
    venueKey,
    direction,
    requestedMinutes,
    dateString
  ) {

    const definition =
      getRouteDefinition(
        venueKey,
        direction
      );


    if (!definition.length) {
      return [];
    }


const dayType =
  getDayType(
    dateString
  );


    /*
     * 最初の交通機関
     */
    const firstTimetable =
      definition.find(
        leg =>
          leg.type === "timetable"
      )?.timetable;


    if (!firstTimetable) {
      return [];
    }


    const departures =
      getAllDepartures(
        firstTimetable,
        dayType
      );


    const candidates =
      departures.filter(
        item =>
          item.minutes >=
          requestedMinutes
      );


    const routes = [];


    /*
     * 最初の便を順番に試す
     */
    for (
      const candidate of candidates
    ) {

      /*
       * 最初の交通機関の出発時刻を
       * 起点にしてルートを構築する
       */
      const route =
        buildRoute(
          definition,
          candidate.minutes,
          dayType
        );


      if (route) {

        /*
         * 同じルートの重複防止
         */
        const exists =
          routes.some(
            item =>
              item.firstVehicleDeparture ===
              route.firstVehicleDeparture
          );


        if (!exists) {

          routes.push(
            route
          );

        }

      }


      if (routes.length >= 3) {
        break;
      }

    }


    /*
     * 最初の交通機関が徒歩から始まる
     * 「帰り」の場合
     *
     * requestedMinutes を出発時刻として、
     * 徒歩後の最初の交通機関を検索する必要がある。
     */
    if (
      definition[0].type === "walk"
    ) {

      routes.length = 0;


      /*
       * 最初の徒歩開始時刻を少しずつ進めて
       * 3つの異なる交通便を探す
       */
      const maxSearch =
        requestedMinutes + 240;


      let cursor =
        requestedMinutes;


      while (
        cursor <= maxSearch &&
        routes.length < 3
      ) {

        const route =
          buildRoute(
            definition,
            cursor,
            dayType
          );


        if (route) {

          const key =
            route.firstVehicleDeparture;


          const exists =
            routes.some(
              item =>
                item.firstVehicleDeparture ===
                key
            );


          if (!exists) {

            routes.push(
              route
            );

          }

        }


        /*
         * 次の検索は1分ずつではなく、
         * 今回使った交通便の次の便付近へ進める
         */
        if (
          route &&
          route.firstVehicleDeparture !== null
        ) {

          cursor =
            route.firstVehicleDeparture + 1;

        } else {

          cursor += 1;

        }

      }

    }


    return routes;

  }


  /* =======================================================
     DURATION
  ======================================================= */

  function formatDuration(minutes) {

    const value =
      Math.max(
        0,
        Math.round(minutes)
      );


    const h =
      Math.floor(
        value / 60
      );

    const m =
      value % 60;


    if (h > 0) {

      if (m === 0) {
        return `${h}時間`;
      }

      return `${h}時間${m}分`;

    }


    return `${m}分`;

  }


  /* =======================================================
     COUNTDOWN
  ======================================================= */

  function formatCountdown(
    targetMinutes,
    targetDate = searchedDate
  ) {

    if (
      targetMinutes === null ||
      targetMinutes === undefined
    ) {
      return "";
    }


    const now =
      new Date();


    /*
     * 検索日が指定されていない場合
     * 現在時刻との比較
     */
    if (!targetDate) {

      let target =
        targetMinutes * 60;


      const nowSeconds =
        now.getHours() * 3600 +
        now.getMinutes() * 60 +
        now.getSeconds();


      while (
        target < nowSeconds
      ) {

        target +=
          24 * 60 * 60;

      }


      const diff =
        Math.max(
          0,
          Math.floor(
            target -
            nowSeconds
          )
        );


      const minutes =
        Math.floor(
          diff / 60
        );

      const seconds =
        diff % 60;


      return (
        `${minutes}分` +
        `${String(seconds).padStart(2, "0")}秒`
      );

    }


    /*
     * 検索日をDateに変換
     */
    const targetDateObject =
      dateStringToDate(
        targetDate
      );


    if (!targetDateObject) {
      return "";
    }


    /*
     * 検索日の出発時刻を設定
     */
    targetDateObject.setHours(
      Math.floor(
        targetMinutes / 60
      ),
      targetMinutes % 60,
      0,
      0
    );


    /*
     * 現在日時との差を計算
     */
    const diff =
      Math.max(
        0,
        Math.floor(
          (
            targetDateObject.getTime() -
            now.getTime()
          ) / 1000
        )
      );


    const minutes =
      Math.floor(
        diff / 60
      );

    const seconds =
      diff % 60;


    return (
      `${minutes}分` +
      `${String(seconds).padStart(2, "0")}秒`
    );

  }


  /* =======================================================
     OPERATOR ICON
  ======================================================= */

  function getIcon(
    operator
  ) {

    const value =
      String(operator);


    if (
      value.includes("阪急バス")
    ) {
      return "🚌";
    }


    if (
      value.includes("地下鉄")
    ) {
      return "🚇";
    }


    if (
      value.includes("ポートライナー")
    ) {
      return "🚈";
    }


    if (
      value.includes("JR")
    ) {
      return "🚃";
    }


    if (
      value.includes("徒歩")
    ) {
      return "🚶";
    }


    return "🚉";

  }


  /* =======================================================
     ESCAPE
  ======================================================= */

  function escapeHtml(
    value
  ) {

    return String(value)
      .replace(
        /&/g,
        "&amp;"
      )
      .replace(
        /</g,
        "&lt;"
      )
      .replace(
        />/g,
        "&gt;"
      )
      .replace(
        /"/g,
        "&quot;"
      )
      .replace(
        /'/g,
        "&#039;"
      );

  }


  /* =======================================================
     TIMELINE LEG
  ======================================================= */

  function renderTimelineLeg(
    leg,
    index
  ) {

    const walk =
      leg.type === "walk";


    return `

      <div
        class="timeline-leg ${walk ? "walk" : ""}"
      >

        <div class="timeline-number">
          ${index + 1}
        </div>


        <div class="timeline-operator">

          ${getIcon(
            leg.operator
          )}

          ${escapeHtml(
            leg.operator
          )}

        </div>


        <div class="timeline-mode">

          ${
            walk
              ? "徒歩"
              : "乗車"
          }

        </div>


        <div class="timeline-station">

          ${escapeHtml(
            leg.station
          )}

        </div>


        <div class="timeline-time">

          ${leg.departureTime}
          →
          ${leg.arrivalTime}

        </div>


        <div class="timeline-duration">

          ${walk ? "徒歩" : "乗車"}
          ${formatDuration(
            leg.travel
          )}

        </div>

      </div>

    `;

  }


  /* =======================================================
     CONNECTOR
  ======================================================= */

  function renderConnector(
    minutes
  ) {

    if (
      !minutes ||
      minutes <= 0
    ) {

      return `
        <div class="timeline-connector">

          <div class="timeline-arrow">
            →
          </div>

        </div>
      `;

    }


    return `

      <div class="timeline-connector">

        <div class="timeline-transfer">

          <strong>
            ＋${minutes}分
          </strong>

          乗り継ぎ

        </div>


        <div class="timeline-arrow">
          →
        </div>

      </div>

    `;

  }


  /* =======================================================
     RENDER ROUTE
  ======================================================= */

  function renderRouteCard(
    route,
    index
  ) {

    const card =
      document.createElement(
        "article"
      );


    card.className =
      "route-card";


    if (index === 0) {

      card.classList.add(
        "is-next"
      );

    }


    /*
     * 区間を横並びにする
     */
    let timelineHtml = "";


    route.legs.forEach(
      (leg, legIndex) => {

        timelineHtml +=
          renderTimelineLeg(
            leg,
            legIndex
          );


        if (
          legIndex <
          route.legs.length - 1
        ) {

          /*
           * 次の交通機関に乗るまでの
           * transferBefore を取得
           */
          const nextLeg =
            route.legs[
              legIndex + 1
            ];


          timelineHtml +=
            renderConnector(
              nextLeg.transferBefore
            );

        }

      }
    );


const countdown =
  formatCountdown(
    route.firstVehicleDeparture
  );


    card.innerHTML = `

      <div class="route-card-top">

        <div class="route-card-title-row">

          <div>

            <div
              class="route-label ${
                index === 0
                  ? ""
                  : "candidate"
              }"
            >

              ${
                index === 0
                  ? "NEXT"
                  : "NEXT CANDIDATE"
              }

            </div>


            <div class="route-start-time">

              ${
                route.firstVehicleDepartureText
              }

            </div>

          </div>


  <div
  class="route-countdown"
  data-countdown="${route.firstVehicleDeparture}"
>
  あと${countdown}
</div>

        </div>


        <div class="route-result-row">

          <div class="route-result-item">

            <span>
              最終到着
            </span>

            <strong>
              ${route.arrivalTime}
            </strong>

          </div>


          <div class="route-result-item">

            <span>
              所要時間
            </span>

            <strong>
              ${formatDuration(
                route.totalMinutes
              )}
            </strong>

          </div>

        </div>

      </div>


      <div class="route-timeline-wrap">

        <div class="timeline-scroll">

          <div class="timeline">

            ${timelineHtml}

          </div>

        </div>

      </div>


      <div class="route-arrival">

        <span class="route-arrival-label">
          最終到着
        </span>

        <span class="route-arrival-time">
          ${route.arrivalTime}
        </span>

      </div>

    `;


    return card;

  }


  /* =======================================================
     RENDER ROUTES
  ======================================================= */

  function renderRoutes() {

    if (
      !selectedVenueKey ||
      !selectedDirectionKey ||
      searchedMinutes === null
    ) {
      return;
    }


const routes =
  findRoutes(
    selectedVenueKey,
    selectedDirectionKey,
    searchedMinutes,
    searchedDate
  );


    selectedVenue.textContent =
      getVenueName(
        selectedVenueKey
      );


    selectedDirection.textContent =
      selectedDirectionKey === "go"
        ? "行き →"
        : "← 帰り";


searchSummary.innerHTML = `
  <strong>
    ${searchedDate}
  </strong>
  <strong>
    ${minutesToTime(searchedMinutes)}
  </strong>
  以降で乗り継ぎ可能なルート
  <span>
    ・${getDayTypeLabel(searchedDate)}
  </span>
`;


    routeCards.innerHTML = "";


    if (!routes.length) {

      routeCards.innerHTML = `

        <div class="route-card no-route">

          <div class="no-route-title">
            接続可能なルートが見つかりません
          </div>

          <div class="no-route-text">
            検索時刻を少し早めるか、
            別の時刻を指定してください。
          </div>

        </div>

      `;

      return;

    }


    routes.forEach(
      (route, index) => {

        routeCards.appendChild(
          renderRouteCard(
            route,
            index
          )
        );

      }
    );

  }


  /* =======================================================
     COUNTDOWN UPDATE
  ======================================================= */

  function updateCountdowns() {

    const elements =
      document.querySelectorAll(
        "[data-countdown]"
      );


    elements.forEach(
      element => {

        const value =
          Number(
            element.dataset.countdown
          );


        if (
          Number.isFinite(value)
        ) {

          element.textContent =
            `あと${formatCountdown(
              value,
              searchedDate
            )}`;

        }

      }
    );

  }


  /* =======================================================
     SET CURRENT DATE / TIME
  ======================================================= */

  function setCurrentTime() {

    const now =
      new Date();


    const y =
      now.getFullYear();

    const m =
      String(
        now.getMonth() + 1
      ).padStart(
        2,
        "0"
      );

    const d =
      String(
        now.getDate()
      ).padStart(
        2,
        "0"
      );


    const hh =
      String(
        now.getHours()
      ).padStart(
        2,
        "0"
      );


    const mm =
      String(
        now.getMinutes()
      ).padStart(
        2,
        "0"
      );


    searchDate.value =
      `${y}-${m}-${d}`;


    searchTime.value =
      `${hh}:${mm}`;

  }


  /* =======================================================
     SEARCH BUTTON
  ======================================================= */

searchButton.addEventListener(
  "click",
  () => {

    const dateValue =
      searchDate.value;

    const timeValue =
      searchTime.value;


    if (!dateValue) {

      alert(
        "乗車予定日を選択してください。"
      );

      return;

    }


    if (!timeValue) {

      alert(
        "乗車予定時刻を入力してください。"
      );

      return;

    }


    const minutes =
      timeToMinutes(
        timeValue
      );


    if (
      minutes === null
    ) {

      alert(
        "時刻を正しく入力してください。"
      );

      return;

    }


    searchedDate =
      dateValue;

    searchedMinutes =
      minutes;


    resultSection
      .classList
      .remove("hidden");


    renderRoutes();


    setTimeout(
      () => {

        resultSection
          .scrollIntoView({
            behavior: "smooth",
            block: "start"
          });

      },
      50
    );

  }
);


  /* =======================================================
     CURRENT TIME BUTTON
  ======================================================= */

  nowButton.addEventListener(
    "click",
    () => {

      setCurrentTime();

    }
  );


  /* =======================================================
     VENUE
  ======================================================= */

  venueButtons.forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          selectedVenueKey =
            button.dataset.venue;


          selectedDirectionKey =
            null;


          searchedMinutes =
            null;

           
           searchedDate =
  null;


          venueButtons.forEach(
            item =>
              item.classList.remove(
                "active"
              )
          );


          button.classList.add(
            "active"
          );


          directionButtons.forEach(
            item =>
              item.classList.remove(
                "active"
              )
          );


          directionSection
            .classList
            .remove("hidden");


          searchSection
            .classList
            .add("hidden");


          resultSection
            .classList
            .add("hidden");


          directionSection
            .scrollIntoView({
              behavior: "smooth",
              block: "start"
            });

        }
      );

    }
  );


  /* =======================================================
     DIRECTION
  ======================================================= */

  directionButtons.forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          if (
            !selectedVenueKey
          ) {
            return;
          }


          selectedDirectionKey =
            button.dataset.direction;


          directionButtons.forEach(
            item =>
              item.classList.remove(
                "active"
              )
          );


          button.classList.add(
            "active"
          );


          /*
           * 最初は現在時刻をセット
           */
          setCurrentTime();


          searchSection
            .classList
            .remove("hidden");


          resultSection
            .classList
            .add("hidden");


          searchSection
            .scrollIntoView({
              behavior: "smooth",
              block: "start"
            });

        }
      );

    }
  );


  /* =======================================================
     BACK
  ======================================================= */

  backButton.addEventListener(
    "click",
    () => {

      selectedVenueKey =
        null;

      selectedDirectionKey =
        null;

      searchedMinutes =
        null;

      searchedDate =
        null;


      venueButtons.forEach(
        button =>
          button.classList.remove(
            "active"
          )
      );


      directionButtons.forEach(
        button =>
          button.classList.remove(
            "active"
          )
      );


      directionSection
        .classList
        .add("hidden");


      searchSection
        .classList
        .add("hidden");


      resultSection
        .classList
        .add("hidden");


      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });

    }
  );


  /* =======================================================
     INITIAL
  ======================================================= */

  setCurrentTime();

  updateClock();


  setInterval(
    updateClock,
    1000
  );


  /* =======================================================
     TIMETABLE CHECK STATUS
  ======================================================= */

  async function loadTimetableCheckStatus() {

    const panel =
      document.getElementById(
        "timetableCheckPanel"
      );


    if (!panel) {
      return;
    }


    try {

      const response =
        await fetch(
          "./timetable-check/status.json?ts=" +
          Date.now(),
          {
            cache: "no-store"
          }
        );


      if (!response.ok) {
        throw new Error(
          "status.json の取得に失敗しました"
        );
      }


      const data =
        await response.json();


      renderTimetableCheckStatus(
        panel,
        data
      );


    } catch (error) {

      console.error(
        "時刻表チェック:",
        error
      );


      panel.innerHTML = `

        <div class="timetable-check-error">

          ⚠️ 時刻表チェック状況を
          取得できませんでした。

        </div>

      `;

    }

  }


  function renderTimetableCheckStatus(
    panel,
    data
  ) {

    const services =
      Array.isArray(data.services)
        ? data.services
        : [];


    const checkedAt =
      data.checkedAt
        ? new Date(
            data.checkedAt
          )
        : null;


    const checkedText =
      checkedAt &&
      !Number.isNaN(
        checkedAt.getTime()
      )
        ? checkedAt.toLocaleString(
            "ja-JP",
            {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit"
            }
          )
        : "未確認";


    let html = `

      <div class="timetable-check-header">

        <strong>
          🔍 公式時刻表 自動チェック
        </strong>

        <span>
          最終チェック：${escapeHtml(
            checkedText
          )}
        </span>

      </div>

    `;


    services.forEach(
      service => {

        const status =
          service.status;


        let icon =
          "⚪";


        if (
          status === "ok"
        ) {
          icon = "🟢";
        }


        if (
          status === "changed"
        ) {
          icon = "🔴";
        }


        if (
          status === "error"
        ) {
          icon = "⚠️";
        }


        html += `

          <div
            class="
              timetable-check-row
              status-${escapeHtml(
                status || "unknown"
              )}
            "
          >

            <div>

              <strong>
                ${icon}
                ${escapeHtml(
                  service.name
                )}
              </strong>

              <small>
                ${escapeHtml(
                  service.route || ""
                )}
              </small>

            </div>




            <div class="timetable-check-status">

              ${
                status === "ok"
                  ? "変更なし"
                  : status === "changed"
                    ? `
                      <div>変更を検出</div>

                      ${
                        Array.isArray(service.changes) &&
                        service.changes.length
                          ? `
                            <div class="timetable-change-details">

                              ${service.changes.map(change => {

                                const periodLabel =
                                  change.period === "weekday"
                                    ? "平日"
                                    : change.period === "weekend"
                                      ? "土日・祝日"
                                      : change.period === "saturday"
                                        ? "土曜日"
                                        : change.period === "holiday"
                                          ? "日曜・祝日"
                                          : change.period || "";

                                return `
                                  <div>
                                    ${escapeHtml(periodLabel)}
                                    ${escapeHtml(change.before || "なし")}
                                    →
                                    ${escapeHtml(change.after || "なし")}
                                  </div>
                                `;

                              }).join("")}

                            </div>
                          `
                          : ""
                      }

                    `
                    : status === "error"
                      ? "確認エラー"
                      : "未確認"
              }

            </div>




  

          </div>

        `;

      }
    );


    if (
      data.hasChanges
    ) {

      html += `

        <div class="timetable-check-warning">

          ⚠️ 公式時刻表に変更が検出されています。<br>
          <strong>
            timetable.js の時刻を確認してください。
          </strong>

        </div>

      `;

    }


    html += `

      <div class="timetable-check-note">

        ※ 自動チェックは公式ページの変更を検出します。
        変更検出後、公式時刻表を確認して
        timetable.js を必要に応じて更新してください。

      </div>

    `;


    panel.innerHTML =
      html;

  }


  loadTimetableCheckStatus();

  const timetableCheckToggle =
    document.getElementById(
      "timetableCheckToggle"
    );

  const timetableCheckPanel =
    document.getElementById(
      "timetableCheckPanel"
    );

  const timetableCheckToggleIcon =
    document.getElementById(
      "timetableCheckToggleIcon"
    );


  if (
    timetableCheckToggle &&
    timetableCheckPanel &&
    timetableCheckToggleIcon
  ) {

    timetableCheckToggle.addEventListener(
      "click",
      () => {

        const isHidden =
          timetableCheckPanel
            .classList
            .contains("hidden");


        if (isHidden) {

          timetableCheckPanel
            .classList
            .remove("hidden");

          timetableCheckToggleIcon
            .textContent = "▼";

          timetableCheckToggle
            .setAttribute(
              "aria-expanded",
              "true"
            );

        } else {

          timetableCheckPanel
            .classList
            .add("hidden");

          timetableCheckToggleIcon
            .textContent = "▶";

          timetableCheckToggle
            .setAttribute(
              "aria-expanded",
              "false"
            );

        }

      }
    );

  }

});

function openTimetableWorkflow() {


  window.open(
    "https://github.com/minomino-sc/soccer-app/actions/workflows/timetable-check.yml",
    "_blank"
  );

}
