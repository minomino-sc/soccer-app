let selectedVenue = null;
let selectedDirection = null;

const directionSection =
  document.getElementById("directionSection");

const resultSection =
  document.getElementById("resultSection");

const routeCards =
  document.getElementById("routeCards");

const selectedVenueText =
  document.getElementById("selectedVenue");

const selectedDirectionText =
  document.getElementById("selectedDirection");


/* =========================================================
   会場選択
========================================================= */

document.querySelectorAll(".venue-button")
  .forEach(button => {

    button.addEventListener("click", () => {

      selectedVenue = button.dataset.venue;

      directionSection.classList.remove("hidden");
      resultSection.classList.add("hidden");

      window.scrollTo({
        top: directionSection.offsetTop - 10,
        behavior: "smooth"
      });

    });

  });


/* =========================================================
   行き・帰り
========================================================= */

document.querySelectorAll(".direction-button")
  .forEach(button => {

    button.addEventListener("click", () => {

      selectedDirection =
        button.dataset.direction;

      showRoutes();

    });

  });


/* =========================================================
   戻る
========================================================= */

document
  .getElementById("backButton")
  .addEventListener("click", () => {

    resultSection.classList.add("hidden");
    directionSection.classList.remove("hidden");

    window.scrollTo({
      top: directionSection.offsetTop - 10,
      behavior: "smooth"
    });

  });


/* =========================================================
   現在日時
========================================================= */

function updateClock() {

  const now = new Date();

  const weekdays = [
    "日",
    "月",
    "火",
    "水",
    "木",
    "金",
    "土"
  ];

  const y =
    now.getFullYear();

  const m =
    String(now.getMonth() + 1).padStart(2, "0");

  const d =
    String(now.getDate()).padStart(2, "0");

  const hh =
    String(now.getHours()).padStart(2, "0");

  const mm =
    String(now.getMinutes()).padStart(2, "0");

  const ss =
    String(now.getSeconds()).padStart(2, "0");


  document.getElementById("currentDate").textContent =
    `${y}/${m}/${d}（${weekdays[now.getDay()]}）`;

  document.getElementById("currentTime").textContent =
    `${hh}:${mm}:${ss}`;

  document.getElementById("dayType").textContent =
    isWeekend(now)
      ? "土日祝ダイヤ"
      : "平日ダイヤ";

}


/* =========================================================
   土日判定
========================================================= */

function isWeekend(date) {

  const day =
    date.getDay();

  return (
    day === 0 ||
    day === 6
  );

}


/* =========================================================
   時刻文字列 → 秒
========================================================= */

function timeToSeconds(time) {

  const [h, m] =
    time.split(":").map(Number);

  return (
    h * 3600 +
    m * 60
  );

}


/* =========================================================
   時刻表をフラット化
========================================================= */

function flattenTimetable(schedule) {

  const result = [];

  Object.keys(schedule)
    .sort((a, b) => Number(a) - Number(b))
    .forEach(hour => {

      schedule[hour].forEach(minute => {

        result.push(
          `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
        );

      });

    });

  return result;

}


/* =========================================================
   次の便を取得
========================================================= */

function getNextDepartures(times) {

  const now =
    new Date();

  const currentSeconds =
    now.getHours() * 3600 +
    now.getMinutes() * 60 +
    now.getSeconds();


  const departures =
    times
      .map(time => ({
        time: time,
        seconds: timeToSeconds(time)
      }))
      .filter(item =>
        item.seconds >= currentSeconds
      );


  return departures.slice(0, 4);

}


/* =========================================================
   ルート表示
========================================================= */

function showRoutes() {

  if (!selectedVenue) {
    return;
  }

  if (!selectedDirection) {
    return;
  }

  if (
    typeof TIMETABLE_DATA === "undefined"
  ) {

    console.error(
      "TIMETABLE_DATA が読み込まれていません。"
    );

    routeCards.innerHTML = `
      <div class="no-service">
        時刻表データを読み込めませんでした。
      </div>
    `;

    resultSection.classList.remove("hidden");
    directionSection.classList.add("hidden");

    return;
  }


  const venue =
    TIMETABLE_DATA.venues[selectedVenue];


  if (!venue) {

    console.error(
      "指定された会場がありません:",
      selectedVenue
    );

    return;
  }


  const routes =
    venue[selectedDirection];


  if (!routes) {

    console.error(
      "指定されたルートがありません:",
      selectedDirection
    );

    return;
  }


  selectedVenueText.textContent =
    venue.name;


  selectedDirectionText.textContent =
    selectedDirection === "go"
      ? "▶ 行き"
      : "◀ 帰り";


  resultSection.classList.remove("hidden");

  directionSection.classList.add("hidden");


  routeCards.innerHTML = "";


  routes.forEach((route, index) => {

    const card =
      createRouteCard(
        route,
        index
      );

    routeCards.appendChild(card);

  });


  window.scrollTo({
    top: resultSection.offsetTop - 10,
    behavior: "smooth"
  });

}


/* =========================================================
   ルートカード生成
========================================================= */

function createRouteCard(
  route,
  index
) {

  const card =
    document.createElement("div");

  card.className =
    "route-card";

  card.dataset.index =
    index;


  renderRouteCard(
    card,
    route
  );


  return card;

}


/* =========================================================
   カード更新
========================================================= */

function renderRouteCard(
  card,
  route
) {

  const now =
    new Date();


  const dayType =
    isWeekend(now)
      ? "holiday"
      : "weekday";


  const schedule =
    route.timetable &&
    route.timetable[dayType]
      ? route.timetable[dayType]
      : {};


  const times =
    flattenTimetable(
      schedule
    );


  const departures =
    getNextDepartures(
      times
    );


  /* -----------------------------------------
     本日の運行終了
  ----------------------------------------- */

  if (!departures.length) {

    card.innerHTML = `

      <div class="route-top">

        <div>

          <div class="operator">
            ${route.operator}
          </div>

          <div class="station">
            ${route.station}
          </div>

        </div>

      </div>

      <div class="no-service">
        本日の運行は終了しました
      </div>

    `;

    return;

  }


  /* -----------------------------------------
     次の便
  ----------------------------------------- */

  const next =
    departures[0];


  const nextSeconds =
    next.seconds;


  const currentSeconds =
    now.getHours() * 3600 +
    now.getMinutes() * 60 +
    now.getSeconds();


  let diff =
    nextSeconds -
    currentSeconds;


  if (diff < 0) {

    diff +=
      24 * 3600;

  }


  const minutes =
    Math.floor(
      diff / 60
    );


  const seconds =
    diff % 60;


  let countdownClass =
    "";


  if (diff <= 60) {

    countdownClass =
      "now";

  } else if (diff <= 300) {

    countdownClass =
      "soon";

  }


  /* -----------------------------------------
     カード表示
  ----------------------------------------- */

  card.innerHTML = `

    <div class="route-top">

      <div>

        <div class="operator">
          ${route.operator}
        </div>

        <div class="station">
          ${route.station}
        </div>

      </div>

    </div>


    <div class="next-label">
      NEXT DEPARTURE
    </div>


    <div class="next-time">
      ${next.time}
    </div>


    <div class="countdown ${countdownClass}">
      あと ${minutes}分 ${String(seconds).padStart(2, "0")}秒
    </div>


    <div class="next-list">

      ${departures
        .slice(1)
        .map(item => `
          <div class="next-item">
            ${item.time}
          </div>
        `)
        .join("")}

    </div>

  `;

}


/* =========================================================
   全カードを更新
========================================================= */

function updateRoutes() {

  if (
    !selectedVenue ||
    !selectedDirection
  ) {

    return;

  }


  if (
    typeof TIMETABLE_DATA === "undefined"
  ) {

    return;

  }


  const venue =
    TIMETABLE_DATA.venues[selectedVenue];


  if (!venue) {
    return;
  }


  const routes =
    venue[selectedDirection];


  if (!routes) {
    return;
  }


  const cards =
    document.querySelectorAll(
      ".route-card"
    );


  cards.forEach(
    (card, index) => {

      if (routes[index]) {

        renderRouteCard(
          card,
          routes[index]
        );

      }

    }
  );

}


/* =========================================================
   1秒ごとに更新
========================================================= */

setInterval(() => {

  updateClock();

  updateRoutes();

}, 1000);


/* =========================================================
   初回表示
========================================================= */

updateClock();
