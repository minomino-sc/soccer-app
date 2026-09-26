/* =========================================================
   ⚽ 試合動画エディター
   第2段階

   ・動画読み込み
   ・動画時間表示
   ・再生 / 一時停止
   ・5秒戻る / 5秒進む
   ・再生速度変更
   ・前半開始
   ・GOAL
   ・後半開始
   ・試合終了
   ・イベント一覧
   ・イベント削除
   ・スコア自動更新
   ========================================================= */


/* =========================================================
   DOM
========================================================= */

const videoFile =
  document.getElementById("videoFile");

const video =
  document.getElementById("video");


const homeTeam =
  document.getElementById("homeTeam");

const awayTeam =
  document.getElementById("awayTeam");


const homeScoreTeam =
  document.getElementById("homeScoreTeam");

const awayScoreTeam =
  document.getElementById("awayScoreTeam");


const homeGoalLabel =
  document.getElementById("homeGoalLabel");

const awayGoalLabel =
  document.getElementById("awayGoalLabel");


const homeScoreEl =
  document.getElementById("homeScore");

const awayScoreEl =
  document.getElementById("awayScore");


const homeGoalBtn =
  document.getElementById("homeGoalBtn");

const awayGoalBtn =
  document.getElementById("awayGoalBtn");


const firstHalfBtn =
  document.getElementById("firstHalfBtn");

const secondHalfBtn =
  document.getElementById("secondHalfBtn");

const fullTimeBtn =
  document.getElementById("fullTimeBtn");


const back5Btn =
  document.getElementById("back5Btn");

const forward5Btn =
  document.getElementById("forward5Btn");

const playPauseBtn =
  document.getElementById("playPauseBtn");


const currentTimeEl =
  document.getElementById("currentTime");

const durationEl =
  document.getElementById("duration");


const eventList =
  document.getElementById("eventList");

const resetBtn =
  document.getElementById("resetBtn");

const message =
  document.getElementById("message");


const speedButtons =
  document.querySelectorAll(
    ".speed-buttons button"
  );


/* =========================================================
   状態
========================================================= */

let sourceUrl = null;


/*
 * events
 *
 * type:
 *   firstHalf
 *   goal
 *   secondHalf
 *   fullTime
 *
 * team:
 *   home
 *   away
 *   null
 */

let events = [];


let homeScore = 0;
let awayScore = 0;


/* =========================================================
   初期表示
========================================================= */

updateTeamNames();

renderScore();

renderEvents();


/*
 * 初期速度
 */

video.playbackRate = 1;

setActiveSpeedButton(1);


/* =========================================================
   チーム名変更
========================================================= */

homeTeam.addEventListener(
  "input",
  updateTeamNames
);


awayTeam.addEventListener(
  "input",
  updateTeamNames
);


function updateTeamNames() {

  const home =
    homeTeam.value.trim() || "箕谷A";

  const away =
    awayTeam.value.trim() || "相手";


  homeScoreTeam.textContent =
    home;

  awayScoreTeam.textContent =
    away;


  homeGoalLabel.textContent =
    home;

  awayGoalLabel.textContent =
    away;


  /*
   * チーム名変更後も一覧を更新
   */

  renderEvents();
}


/* =========================================================
   動画読み込み
========================================================= */

videoFile.addEventListener(
  "change",
  () => {

    const file =
      videoFile.files[0];

    if (!file) {
      return;
    }


    if (sourceUrl) {

      URL.revokeObjectURL(
        sourceUrl
      );
    }


    sourceUrl =
      URL.createObjectURL(file);


    video.src =
      sourceUrl;

    video.load();


    /*
     * 動画を新しく選択した場合は
     * 再生位置をリセット
     */

    currentTimeEl.textContent =
      "00:00";

    durationEl.textContent =
      "00:00";


    showMessage(
      "動画を読み込みました。"
    );
  }
);


/* =========================================================
   動画メタデータ
========================================================= */

video.addEventListener(
  "loadedmetadata",
  () => {

    durationEl.textContent =
      formatTime(video.duration);

    currentTimeEl.textContent =
      "00:00";

    showMessage(
      "動画の準備ができました。"
    );
  }
);


/* =========================================================
   動画時間更新
========================================================= */

video.addEventListener(
  "timeupdate",
  () => {

    currentTimeEl.textContent =
      formatTime(
        video.currentTime
      );
  }
);


/* =========================================================
   再生 / 一時停止
========================================================= */

playPauseBtn.addEventListener(
  "click",
  togglePlay
);


video.addEventListener(
  "play",
  updatePlayButton
);


video.addEventListener(
  "pause",
  updatePlayButton
);


video.addEventListener(
  "ended",
  updatePlayButton
);


function togglePlay() {

  if (!video.src) {

    showMessage(
      "先に試合動画を選択してください。"
    );

    return;
  }


  if (video.paused) {

    video.play().catch(() => {});

  } else {

    video.pause();
  }
}


function updatePlayButton() {

  if (video.paused) {

    playPauseBtn.textContent =
      "▶ 再生";

  } else {

    playPauseBtn.textContent =
      "⏸ 一時停止";
  }
}


/* =========================================================
   5秒戻る
========================================================= */

back5Btn.addEventListener(
  "click",
  () => {

    if (!video.src) {

      showMessage(
        "先に試合動画を選択してください。"
      );

      return;
    }


    video.currentTime =
      Math.max(
        0,
        video.currentTime - 5
      );
  }
);


/* =========================================================
   5秒進む
========================================================= */

forward5Btn.addEventListener(
  "click",
  () => {

    if (!video.src) {

      showMessage(
        "先に試合動画を選択してください。"
      );

      return;
    }


    const duration =
      Number.isFinite(video.duration)
        ? video.duration
        : video.currentTime + 5;


    video.currentTime =
      Math.min(
        duration,
        video.currentTime + 5
      );
  }
);


/* =========================================================
   再生速度
========================================================= */

speedButtons.forEach(
  button => {

    button.addEventListener(
      "click",
      () => {

        const speed =
          Number(
            button.dataset.speed
          );


        if (!Number.isFinite(speed)) {
          return;
        }


        video.playbackRate =
          speed;


        setActiveSpeedButton(
          speed
        );


        showMessage(
          `再生速度 ${speed}倍`
        );
      }
    );
  }
);


function setActiveSpeedButton(
  speed
) {

  speedButtons.forEach(
    button => {

      const buttonSpeed =
        Number(
          button.dataset.speed
        );


      button.classList.toggle(
        "active",
        buttonSpeed === speed
      );
    }
  );
}


/* =========================================================
   前半開始
========================================================= */

firstHalfBtn.addEventListener(
  "click",
  () => {

    recordMatchEvent(
      "firstHalf"
    );
  }
);


/* =========================================================
   後半開始
========================================================= */

secondHalfBtn.addEventListener(
  "click",
  () => {

    recordMatchEvent(
      "secondHalf"
    );
  }
);


/* =========================================================
   試合終了
========================================================= */

fullTimeBtn.addEventListener(
  "click",
  () => {

    recordMatchEvent(
      "fullTime"
    );
  }
);


/* =========================================================
   GOAL
========================================================= */

homeGoalBtn.addEventListener(
  "click",
  () => {

    recordGoal("home");
  }
);


awayGoalBtn.addEventListener(
  "click",
  () => {

    recordGoal("away");
  }
);


/* =========================================================
   動画時刻取得
========================================================= */

function getCurrentVideoTime() {

  if (!video.src) {

    showMessage(
      "先に試合動画を選択してください。"
    );

    return null;
  }


  const time =
    video.currentTime;


  if (!Number.isFinite(time)) {

    showMessage(
      "動画の時間を取得できませんでした。"
    );

    return null;
  }


  return time;
}


/* =========================================================
   試合イベント記録
========================================================= */

function recordMatchEvent(
  type
) {

  const time =
    getCurrentVideoTime();


  if (time === null) {
    return;
  }


  /*
   * 同じイベントの二重登録を防止
   *
   * 前半開始 → 1回
   * 後半開始 → 1回
   * 試合終了 → 1回
   */

  if (
    type === "firstHalf" &&
    events.some(
      event =>
        event.type === "firstHalf"
    )
  ) {

    showMessage(
      "前半開始はすでに記録されています。"
    );

    return;
  }


  if (
    type === "secondHalf" &&
    events.some(
      event =>
        event.type === "secondHalf"
    )
  ) {

    showMessage(
      "後半開始はすでに記録されています。"
    );

    return;
  }


  if (
    type === "fullTime" &&
    events.some(
      event =>
        event.type === "fullTime"
    )
  ) {

    showMessage(
      "試合終了はすでに記録されています。"
    );

    return;
  }


  /*
   * イベント追加
   */

  events.push({

    id: createId(),

    type,

    team: null,

    time,

    homeScore,

    awayScore
  });


  /*
   * 時刻順に並べる
   */

  sortEvents();


  renderEvents();


  showMessage(
    `${getEventLabel(type)}を記録しました。`
  );
}


/* =========================================================
   GOAL記録
========================================================= */

function recordGoal(
  team
) {

  const time =
    getCurrentVideoTime();


  if (time === null) {
    return;
  }


  /*
   * スコア更新
   */

  if (team === "home") {

    homeScore++;

  } else {

    awayScore++;
  }


  /*
   * GOALイベント追加
   */

  events.push({

    id: createId(),

    type: "goal",

    team,

    time,

    homeScore,

    awayScore
  });


  sortEvents();

  renderScore();

  renderEvents();


  const teamName =
    team === "home"
      ? getHomeTeamName()
      : getAwayTeamName();


  showMessage(
    `⚽ ${teamName} GOAL！ ${homeScore}-${awayScore}`
  );
}


/* =========================================================
   イベント並び替え
========================================================= */

function sortEvents() {

  events.sort(
    (a, b) =>
      a.time - b.time
  );
}


/* =========================================================
   スコア表示
========================================================= */

function renderScore() {

  homeScoreEl.textContent =
    homeScore;

  awayScoreEl.textContent =
    awayScore;
}


/* =========================================================
   イベント一覧
========================================================= */

function renderEvents() {

  eventList.innerHTML = "";


  if (!events.length) {

    eventList.innerHTML =
      `
      <p class="empty-message">
        まだ試合記録はありません。
      </p>
      `;

    return;
  }


  /*
   * 時刻順
   */

  sortEvents();


  events.forEach(
    (event, index) => {

      const item =
        document.createElement(
          "div"
        );

      item.className =
        "event-item";


      /*
       * 時刻
       */

      const time =
        document.createElement(
          "div"
        );

      time.className =
        "event-time";

      time.textContent =
        formatTime(event.time);


      /*
       * 内容
       */

      const info =
        document.createElement(
          "div"
        );

      info.className =
        "event-info";


      const title =
        document.createElement(
          "strong"
        );


      title.textContent =
        getEventDisplayText(
          event
        );


      info.appendChild(
        title
      );


      /*
       * スコア
       *
       * GOALだけスコア表示
       */

      if (event.type === "goal") {

        const score =
          document.createElement(
            "span"
          );

        score.className =
          "event-score";

        score.textContent =
          `${event.homeScore} - ${event.awayScore}`;

        info.appendChild(
          score
        );
      }


      /*
       * 操作
       */

      const actions =
        document.createElement(
          "div"
        );


      /*
       * 再生
       */

      const seekButton =
        document.createElement(
          "button"
        );

      seekButton.type =
        "button";

      seekButton.className =
        "event-seek-button";

      seekButton.textContent =
        "▶ 再生";


      seekButton.addEventListener(
        "click",
        () => {

          video.currentTime =
            event.time;

          video.play().catch(
            () => {}
          );
        }
      );


      /*
       * 削除
       */

      const deleteButton =
        document.createElement(
          "button"
        );

      deleteButton.type =
        "button";

      deleteButton.className =
        "event-delete-button";

      deleteButton.textContent =
        "×";

      deleteButton.setAttribute(
        "aria-label",
        "この記録を削除"
      );


      deleteButton.addEventListener(
        "click",
        () => {

          deleteEvent(
            event.id
          );
        }
      );


      actions.appendChild(
        seekButton
      );

      actions.appendChild(
        deleteButton
      );


      item.appendChild(
        time
      );

      item.appendChild(
        info
      );

      item.appendChild(
        actions
      );


      eventList.appendChild(
        item
      );
    }
  );
}


/* =========================================================
   イベント削除
========================================================= */

function deleteEvent(
  id
) {

  const index =
    events.findIndex(
      event =>
        event.id === id
    );


  if (index === -1) {
    return;
  }


  const deletedEvent =
    events[index];


  events.splice(
    index,
    1
  );


  /*
   * GOALを削除した場合は
   * 時系列でスコアを再計算する
   */

  recalculateScores();


  renderScore();

  renderEvents();


  showMessage(
    `${getEventDisplayText(deletedEvent)}を削除しました。`
  );
}


/* =========================================================
   スコア再計算
========================================================= */

function recalculateScores() {

  /*
   * 一度0に戻す
   */

  homeScore = 0;
  awayScore = 0;


  /*
   * 時系列順にGOALを確認
   */

  sortEvents();


  events.forEach(
    event => {

      if (
        event.type === "goal"
      ) {

        if (
          event.team === "home"
        ) {

          homeScore++;

        } else if (
          event.team === "away"
        ) {

          awayScore++;
        }


        /*
         * そのGOAL時点の
         * スコアを保存
         */

        event.homeScore =
          homeScore;

        event.awayScore =
          awayScore;
      }
    }
  );


  /*
   * 前半開始・後半開始・試合終了にも
   * その時点のスコアを保存
   */

  let currentHome = 0;
  let currentAway = 0;


  events.forEach(
    event => {

      if (
        event.type === "goal"
      ) {

        currentHome =
          event.homeScore;

        currentAway =
          event.awayScore;

      } else {

        event.homeScore =
          currentHome;

        event.awayScore =
          currentAway;
      }
    }
  );
}


/* =========================================================
   リセット
========================================================= */

resetBtn.addEventListener(
  "click",
  () => {

    if (!events.length) {

      showMessage(
        "リセットする記録はありません。"
      );

      return;
    }


    const ok =
      window.confirm(
        "試合記録とスコアをすべてリセットしますか？"
      );


    if (!ok) {
      return;
    }


    events = [];

    homeScore = 0;

    awayScore = 0;


    renderScore();

    renderEvents();


    showMessage(
      "試合記録をリセットしました。"
    );
  }
);


/* =========================================================
   イベント表示名
========================================================= */

function getEventLabel(
  type
) {

  switch (type) {

    case "firstHalf":
      return "前半開始";

    case "secondHalf":
      return "後半開始";

    case "fullTime":
      return "試合終了";

    default:
      return "";
  }
}


/* =========================================================
   イベント表示テキスト
========================================================= */

function getEventDisplayText(
  event
) {

  switch (event.type) {

    case "firstHalf":

      return "▶ 前半開始";


    case "secondHalf":

      return "▶ 後半開始";


    case "fullTime":

      return "■ 試合終了";


    case "goal":

      if (
        event.team === "home"
      ) {

        return `⚽ ${getHomeTeamName()} GOAL`;

      } else {

        return `⚽ ${getAwayTeamName()} GOAL`;
      }


    default:

      return "";
  }
}


/* =========================================================
   チーム名
========================================================= */

function getHomeTeamName() {

  return (
    homeTeam.value.trim() ||
    "箕谷A"
  );
}


function getAwayTeamName() {

  return (
    awayTeam.value.trim() ||
    "相手"
  );
}


/* =========================================================
   ID
========================================================= */

function createId() {

  return (
    Date.now().toString(36) +
    Math.random()
      .toString(36)
      .substring(2, 8)
  );
}


/* =========================================================
   時間フォーマット
========================================================= */

function formatTime(
  seconds
) {

  if (
    !Number.isFinite(seconds)
  ) {

    return "00:00";
  }


  seconds =
    Math.max(
      0,
      Math.floor(seconds)
    );


  const minutes =
    Math.floor(
      seconds / 60
    );


  const sec =
    seconds % 60;


  return (
    String(minutes)
      .padStart(2, "0") +
    ":" +
    String(sec)
      .padStart(2, "0")
  );
}


/* =========================================================
   メッセージ
========================================================= */

let messageTimer = null;


function showMessage(
  text
) {

  message.textContent =
    text;


  clearTimeout(
    messageTimer
  );


  messageTimer =
    setTimeout(
      () => {

        message.textContent =
          "";

      },
      3000
    );
}
