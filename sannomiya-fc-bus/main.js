/* =========================================================
   KOBE SANNOMIYA FC
   JUNIOR YOUTH TRANSPORT SYSTEM
   main.js

   ・会場選択
   ・行き / 帰り選択
   ・乗り継ぎを考慮したルート検索
   ・次の3候補を表示
   ・現在時刻からカウントダウン
   ・各区間の出発 / 到着時刻を表示

   ※ 時刻表そのものは timetable.js を使用
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

  /* =======================================================
     DOM
  ======================================================= */

  const currentDate = document.getElementById("currentDate");
  const currentTime = document.getElementById("currentTime");
  const dayType = document.getElementById("dayType");

  const directionSection =
    document.getElementById("directionSection");

  const resultSection =
    document.getElementById("resultSection");

  const selectedVenue =
    document.getElementById("selectedVenue");

  const selectedDirection =
    document.getElementById("selectedDirection");

  const routeCards =
    document.getElementById("routeCards");

  const backButton =
    document.getElementById("backButton");

  const venueButtons =
    document.querySelectorAll(".venue-button");

  const directionButtons =
    document.querySelectorAll(".direction-button");


  /* =======================================================
     状態
  ======================================================= */

  let selectedVenueKey = null;
  let selectedDirectionKey = null;


  /* =======================================================
     会場名
  ======================================================= */

  function getVenueName(venueKey) {

    const venue =
      TIMETABLE_DATA?.venues?.[venueKey];

    return venue?.name || venueKey;

  }


  /* =======================================================
     曜日区分
     平日 / 土日祝
  ======================================================= */

  function getDayType(date = new Date()) {

    const day = date.getDay();

    if (day === 0 || day === 6) {
      return "holiday";
    }

    return "weekday";

  }


  function getDayTypeLabel(type) {

    if (type === "holiday") {
      return "土日祝ダイヤ";
    }

    return "平日ダイヤ";

  }


  /* =======================================================
     時計
  ======================================================= */

  function updateClock() {

    const now = new Date();

    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");

    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");

    currentDate.textContent =
      `${y}/${m}/${d}`;

    currentTime.textContent =
      `${hh}:${mm}:${ss}`;

    dayType.textContent =
      getDayTypeLabel(getDayType());

    if (
      selectedVenueKey &&
      selectedDirectionKey &&
      !resultSection.classList.contains("hidden")
    ) {
      renderRoutes();
    }

  }


  /* =======================================================
     時刻 → 分
  ======================================================= */

  function timeToMinutes(time) {

    const [h, m] =
      time.split(":").map(Number);

    return h * 60 + m;

  }


  /* =======================================================
     分 → HH:MM
  ======================================================= */

  function minutesToTime(minutes) {

    /*
     * 24:xx にも対応
     */
    const normalized =
      ((minutes % 1440) + 1440) % 1440;

    const h =
      Math.floor(normalized / 60);

    const m =
      normalized % 60;

    return (
      String(h).padStart(2, "0") +
      ":" +
      String(m).padStart(2, "0")
    );

  }


  /* =======================================================
     日付をまたぐ場合を考慮した現在時刻
  ======================================================= */

  function getCurrentMinutes() {

    const now = new Date();

    return (
      now.getHours() * 60 +
      now.getMinutes() +
      now.getSeconds() / 60
    );

  }


  /* =======================================================
     時刻表から次の便を探す
  ======================================================= */

  function getNextDeparture(
    timetable,
    dayTypeValue,
    afterMinutes
  ) {

    if (!timetable) {
      return null;
    }

    const candidates = [];

    const dayTable =
      timetable[dayTypeValue];

    if (!dayTable) {
      return null;
    }

    Object.keys(dayTable).forEach(hour => {

      const minutes =
        dayTable[hour] || [];

      minutes.forEach(minute => {

        const h = Number(hour);
        const m = Number(minute);

        const departure =
          h * 60 + m;

        /*
         * 当日24:xxなどにも対応
         */
        if (departure >= afterMinutes) {

          candidates.push({
            minutes: departure,
            time:
              `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
          });

        }

      });

    });

    candidates.sort(
      (a, b) => a.minutes - b.minutes
    );

    return candidates[0] || null;

  }


  /* =======================================================
     時刻表から全便を取得
  ======================================================= */

  function getAllDepartures(
    timetable,
    dayTypeValue
  ) {

    const result = [];

    if (!timetable) {
      return result;
    }

    const dayTable =
      timetable[dayTypeValue];

    if (!dayTable) {
      return result;
    }

    Object.keys(dayTable).forEach(hour => {

      const minutes =
        dayTable[hour] || [];

      minutes.forEach(minute => {

        const h = Number(hour);
        const m = Number(minute);

        result.push({
          minutes: h * 60 + m,
          time:
            `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
        });

      });

    });

    result.sort(
      (a, b) => a.minutes - b.minutes
    );

    return result;

  }


  /* =======================================================
     出発候補を取得
  ======================================================= */

  function getDepartureCandidates(
    timetable,
    dayTypeValue,
    afterMinutes,
    count = 10
  ) {

    return getAllDepartures(
      timetable,
      dayTypeValue
    )
      .filter(item =>
        item.minutes >= afterMinutes
      )
      .slice(0, count);

  }


  /* =======================================================
     ルート設定
     
     travel:
       乗車 / 徒歩時間

     transfer:
       次の交通機関へ乗り継ぐための時間
  ======================================================= */

  function getRouteDefinition(
    venueKey,
    direction
  ) {

    const venue =
      TIMETABLE_DATA.venues[venueKey];

    if (!venue) {
      return [];
    }


    /* =====================================================
       小野浜球技場
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
            transfer: 5
          },

          {
            type: "timetable",
            timetable: venue.go[1].timetable,
            operator: venue.go[1].operator,
            station: venue.go[1].station,
            travel: 10,
            transfer: 7
          },

          {
            type: "timetable",
            timetable: venue.go[2].timetable,
            operator: venue.go[2].operator,
            station: venue.go[2].station,
            travel: 2,
            transfer: 0
          },

          {
            type: "walk",
            operator: "徒歩",
            station: "貿易センター駅 → 小野浜球技場",
            travel: 5,
            transfer: 0
          }

        ];

      }


      /* 小野浜・帰り */

      return [

        {
          type: "walk",
          operator: "徒歩",
          station: "小野浜球技場 → 貿易センター駅",
          travel: 5,
          transfer: 0
        },

        {
          type: "timetable",
          timetable: venue.return[0].timetable,
          operator: venue.return[0].operator,
          station: venue.return[0].station,
          travel: 2,
          transfer: 7
        },

        {
          type: "timetable",
          timetable: venue.return[1].timetable,
          operator: venue.return[1].operator,
          station: venue.return[1].station,
          travel: 10,
          transfer: 5
        },

        {
          type: "timetable",
          timetable: venue.return[2].timetable,
          operator: venue.return[2].operator,
          station: venue.return[2].station,
          travel: 10,
          transfer: 0
        }

      ];

    }


    /* =====================================================
       神戸朝鮮中
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
            transfer: 5
          },

          {
            type: "timetable",
            timetable: venue.go[1].timetable,
            operator: venue.go[1].operator,
            station: venue.go[1].station,
            travel: 10,
            transfer: 6
          },

          {
            type: "timetable",
            timetable: venue.go[2].timetable,
            operator: venue.go[2].operator,
            station: venue.go[2].station,
            travel: 2,
            transfer: 0
          }

        ];

      }


      /* 神戸朝鮮中・帰り */

      return [

        {
          type: "walk",
          operator: "徒歩",
          station: "神戸朝鮮中 → JR灘駅",
          travel: 5,
          transfer: 0
        },

        {
          type: "timetable",
          timetable: venue.return[0].timetable,
          operator: venue.return[0].operator,
          station: venue.return[0].station,
          travel: 2,
          transfer: 6
        },

        {
          type: "timetable",
          timetable: venue.return[1].timetable,
          operator: venue.return[1].operator,
          station: venue.return[1].station,
          travel: 10,
          transfer: 5
        },

        {
          type: "timetable",
          timetable: venue.return[2].timetable,
          operator: venue.return[2].operator,
          station: venue.return[2].station,
          travel: 10,
          transfer: 0
        }

      ];

    }


    /* =====================================================
       コミスタ神戸
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
            transfer: 5
          },

          {
            type: "timetable",
            timetable: venue.go[1].timetable,
            operator: venue.go[1].operator,
            station: venue.go[1].station,
            travel: 10,
            transfer: 0
          },

          {
            type: "walk",
            operator: "徒歩",
            station: "三宮駅 → コミスタ神戸",
            travel: 15,
            transfer: 0
          }

        ];

      }


      /* コミスタ神戸・帰り */

      return [

        {
          type: "walk",
          operator: "徒歩",
          station: "コミスタ神戸 → 三宮駅",
          travel: 15,
          transfer: 0
        },

        {
          type: "timetable",
          timetable: venue.return[0].timetable,
          operator: venue.return[0].operator,
          station: venue.return[0].station,
          travel: 10,
          transfer: 5
        },

        {
          type: "timetable",
          timetable: venue.return[1].timetable,
          operator: venue.return[1].operator,
          station: venue.return[1].station,
          travel: 10,
          transfer: 0
        }

      ];

    }


    return [];

  }


  /* =======================================================
     1つの出発便から最後まで接続できるか検索
  ======================================================= */

  function buildRoute(
    definition,
    firstDeparture,
    dayTypeValue
  ) {

    let currentTime =
      firstDeparture.minutes;

    const legs = [];

    for (let i = 0; i < definition.length; i++) {

      const leg =
        definition[i];


      /* ---------------------------------------------------
         徒歩区間
      --------------------------------------------------- */

      if (leg.type === "walk") {

        const start =
          currentTime;

        const arrival =
          start + leg.travel;

        legs.push({
          type: "walk",
          operator: leg.operator,
          station: leg.station,
          departure: start,
          arrival: arrival,
          departureTime: minutesToTime(start),
          arrivalTime: minutesToTime(arrival),
          travel: leg.travel,
          transfer: 0
        });

        currentTime = arrival;

        continue;

      }


      /* ---------------------------------------------------
         交通機関
      --------------------------------------------------- */

      let departure;

      if (i === 0) {

        /*
         * 最初の便は指定された候補便
         */
        departure = firstDeparture;

      } else {

        /*
         * 前区間到着後、乗り継ぎ時間を加える
         */
        const earliest =
          currentTime +
          definition[i - 1].transfer;

        departure =
          getNextDeparture(
            leg.timetable,
            dayTypeValue,
            earliest
          );

      }


      /*
       * 次の便が存在しない
       */
      if (!departure) {
        return null;
      }


      const arrival =
        departure.minutes +
        leg.travel;


      legs.push({
        type: "timetable",
        operator: leg.operator,
        station: leg.station,
        departure: departure.minutes,
        arrival: arrival,
        departureTime: departure.time,
        arrivalTime: minutesToTime(arrival),
        travel: leg.travel,
        transfer:
          leg.transfer || 0
      });


      currentTime =
        arrival;

    }


    return {
      firstDeparture:
        firstDeparture.minutes,

      firstDepartureTime:
        firstDeparture.time,

      arrival:
        currentTime,

      arrivalTime:
        minutesToTime(currentTime),

      legs: legs,

      totalMinutes:
        currentTime -
        firstDeparture.minutes

    };

  }


  /* =======================================================
     次の候補ルートを取得
  ======================================================= */

  function findRoutes(
    venueKey,
    direction,
    count = 3
  ) {

    const definition =
      getRouteDefinition(
        venueKey,
        direction
      );

    if (!definition.length) {
      return [];
    }


    const dayTypeValue =
      getDayType();


    /*
     * 最初の交通機関
     */
    const firstTimetable =
      definition.find(
        leg => leg.type === "timetable"
      )?.timetable;


    if (!firstTimetable) {
      return [];
    }


    /*
     * 現在時刻以降の最初の便から
     * 少し多めに候補を調べる
     */
    const nowMinutes =
      getCurrentMinutes();

    const firstCandidates =
      getDepartureCandidates(
        firstTimetable,
        dayTypeValue,
        nowMinutes,
        20
      );


    const routes = [];


    for (
      const candidate of firstCandidates
    ) {

      const route =
        buildRoute(
          definition,
          candidate,
          dayTypeValue
        );


      /*
       * 最後まで接続できたルートだけ採用
       */
      if (route) {

        routes.push(route);

      }


      if (routes.length >= count) {
        break;
      }

    }


    return routes;

  }


  /* =======================================================
     時間差表示
  ======================================================= */

  function formatDuration(minutes) {

    const total =
      Math.max(
        0,
        Math.round(minutes)
      );

    const h =
      Math.floor(total / 60);

    const m =
      total % 60;


    if (h > 0) {

      return `${h}時間${m}分`;

    }

    return `${m}分`;

  }


  /* =======================================================
     カウントダウン
  ======================================================= */

  function formatCountdown(targetMinutes) {

    const now =
      new Date();

    const nowSeconds =
      now.getHours() * 3600 +
      now.getMinutes() * 60 +
      now.getSeconds();


    let targetSeconds =
      targetMinutes * 60;


    /*
     * 深夜 / 日付またぎ対応
     */
    while (
      targetSeconds < nowSeconds
    ) {

      targetSeconds +=
        24 * 60 * 60;

    }


    let diff =
      targetSeconds -
      nowSeconds;


    diff =
      Math.max(
        0,
        Math.floor(diff)
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
     区間表示
  ======================================================= */

  function renderLeg(
    leg,
    index
  ) {

    const isWalk =
      leg.type === "walk";


    let html = `
      <div class="route-leg">

        <div class="route-leg-number">
          ${index + 1}
        </div>

        <div class="route-leg-body">

          <div class="route-leg-top">

            <span class="route-operator">
              ${escapeHtml(leg.operator)}
            </span>

            ${
              isWalk
                ? `<span class="route-mode">徒歩</span>`
                : `<span class="route-mode">乗車</span>`
            }

          </div>

          <div class="route-station">
            ${escapeHtml(leg.station)}
          </div>

          <div class="route-times">

            <span>
              ${leg.departureTime}
            </span>

            <span class="route-arrow">
              →
            </span>

            <span>
              ${leg.arrivalTime}
            </span>

            <span class="route-duration">
              ${formatDuration(leg.travel)}
            </span>

          </div>

        </div>

      </div>
    `;


    /*
     * 次の区間への乗り継ぎ
     */
    if (
      leg.transfer > 0
    ) {

      html += `
        <div class="transfer-time">
          <span>↳</span>
          乗り継ぎ ${leg.transfer}分
        </div>
      `;

    }


    return html;

  }


  /* =======================================================
     HTMLエスケープ
  ======================================================= */

  function escapeHtml(value) {

    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  }


  /* =======================================================
     ルート表示
  ======================================================= */

  function renderRoutes() {

    if (
      !selectedVenueKey ||
      !selectedDirectionKey
    ) {
      return;
    }


    const routes =
      findRoutes(
        selectedVenueKey,
        selectedDirectionKey,
        3
      );


    selectedVenue.textContent =
      getVenueName(
        selectedVenueKey
      );


    selectedDirection.textContent =
      selectedDirectionKey === "go"
        ? "行き →"
        : "← 帰り";


    routeCards.innerHTML = "";


    if (!routes.length) {

      routeCards.innerHTML = `
        <div class="route-card no-route">

          <div class="no-route-title">
            次に利用できる接続が見つかりません
          </div>

          <div class="no-route-text">
            次の時間帯の便をお待ちください。
          </div>

        </div>
      `;

      return;

    }


    routes.forEach(
      (route, index) => {

        const card =
          document.createElement("div");

        card.className =
          "route-card";


        const countdown =
          index === 0
            ? formatCountdown(
                route.firstDeparture
              )
            : "";


        const firstClass =
          index === 0
            ? "is-next"
            : "";


        card.innerHTML = `

          <div class="route-card-header ${firstClass}">

            <div>

              ${
                index === 0
                  ? `<div class="next-label">
                       NEXT
                     </div>`
                  : `<div class="candidate-label">
                       次の候補
                     </div>`
              }

              <div class="route-main-time">
                ${route.firstDepartureTime}
              </div>

            </div>

            ${
              index === 0
                ? `
                  <div class="countdown">
                    あと${countdown}
                  </div>
                `
                : ""
            }

          </div>


          <div class="route-summary">

            <div>
              <span>到着</span>
              <strong>
                ${route.arrivalTime}
              </strong>
            </div>

            <div>
              <span>所要時間</span>
              <strong>
                ${formatDuration(
                  route.totalMinutes
                )}
              </strong>
            </div>

          </div>


          <div class="route-legs">

            ${route.legs
              .map(
                (leg, legIndex) =>
                  renderLeg(
                    leg,
                    legIndex
                  )
              )
              .join("")}

          </div>

        `;


        routeCards.appendChild(card);

      }
    );

  }


  /* =======================================================
     会場選択
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


          venueButtons.forEach(
            b =>
              b.classList.remove(
                "active"
              )
          );


          button.classList.add(
            "active"
          );


          directionSection
            .classList
            .remove("hidden");


          resultSection
            .classList
            .add("hidden");


          /*
           * ROUTE選択位置まで移動
           */
          setTimeout(
            () => {

              directionSection
                .scrollIntoView({
                  behavior: "smooth",
                  block: "start"
                });

            },
            50
          );

        }
      );

    }
  );


  /* =======================================================
     行き / 帰り選択
  ======================================================= */

  directionButtons.forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          if (!selectedVenueKey) {
            return;
          }


          selectedDirectionKey =
            button.dataset.direction;


          directionButtons.forEach(
            b =>
              b.classList.remove(
                "active"
              )
          );


          button.classList.add(
            "active"
          );


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

    }
  );


  /* =======================================================
     変更ボタン
  ======================================================= */

  backButton.addEventListener(
    "click",
    () => {

      selectedVenueKey =
        null;

      selectedDirectionKey =
        null;


      venueButtons.forEach(
        b =>
          b.classList.remove(
            "active"
          )
      );


      directionButtons.forEach(
        b =>
          b.classList.remove(
            "active"
          )
      );


      directionSection
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
     初期表示
  ======================================================= */

  updateClock();

  setInterval(
    updateClock,
    1000
  );

});
