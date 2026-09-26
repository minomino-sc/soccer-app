/* =========================================================
   ⚽ 試合動画エディター
   第3段階

   ・前半動画
   ・後半動画
   ・動画時間表示
   ・前半 / 後半切り替え
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

const firstHalfFile =
  document.getElementById("firstHalfFile");

const secondHalfFile =
  document.getElementById("secondHalfFile");

const firstHalfFileName =
  document.getElementById("firstHalfFileName");

const secondHalfFileName =
  document.getElementById("secondHalfFileName");

const firstHalfDurationEl =
  document.getElementById("firstHalfDuration");

const secondHalfDurationEl =
  document.getElementById("secondHalfDuration");

const showFirstHalfBtn =
  document.getElementById("showFirstHalfBtn");

const showSecondHalfBtn =
  document.getElementById("showSecondHalfBtn");

const currentHalfLabel =
  document.getElementById("currentHalfLabel");


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
   動画状態
========================================================= */

const videoData = {

  1: {
    file: null,
    url: null,
    duration: 0
  },

  2: {
    file: null,
    url: null,
    duration: 0
  }

};


/*
 * 現在表示している動画
 *
 * 1 = 前半
 * 2 = 後半
 */

let currentHalf = 1;


/* =========================================================
   試合記録
========================================================= */

let events = [];

let homeScore = 0;
let awayScore = 0;


/* =========================================================
   再生速度
========================================================= */

let playbackRate = 1;


/* =========================================================
   初期表示
========================================================= */

updateTeamNames();

renderScore();

renderEvents();

video.playbackRate = 1;

setActiveSpeedButton(1);

updateHalfButtons();


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


  renderEvents();
}


/* =========================================================
   前半動画選択
========================================================= */

firstHalfFile.addEventListener(
  "change",
  () => {

    const file =
      firstHalfFile.files[0];

    if (!file) {
      return;
    }


    setHalfVideo(
      1,
      file
    );


    firstHalfFileName.textContent =
      file.name;


    showMessage(
      "前半動画を読み込みました。"
    );


    /*
     * 前半を自動表示
     */

    showHalf(
      1,
      0,
      false
    );
  }
);


/* =========================================================
   後半動画選択
========================================================= */

secondHalfFile.addEventListener(
  "change",
  () => {

    const file =
      secondHalfFile.files[0];

    if (!file) {
      return;
    }


    setHalfVideo(
      2,
      file
    );


    secondHalfFileName.textContent =
      file.name;


    showMessage(
      "後半動画を読み込みました。"
    );


    /*
     * 前半がまだ選択されていない場合だけ
     * 後半を表示
     */

    if (!videoData[1].url) {

      showHalf(
        2,
        0,
        false
      );
    }
  }
);


/* =========================================================
   動画セット
========================================================= */

function setHalfVideo(
  half,
  file
) {

  /*
   * 古いURLを破棄
   */

  if (
    videoData[half].url
  ) {

    URL.revokeObjectURL(
      videoData[half].url
    );
  }


  videoData[half].file =
    file;

  videoData[half].url =
    URL.createObjectURL(file);

  videoData[half].duration =
    0;


  if (half === 1) {

    firstHalfDurationEl.textContent =
      "";

  } else {

    secondHalfDurationEl.textContent =
      "";
  }
}


/* =========================================================
   前半 / 後半表示切り替え
========================================================= */

showFirstHalfBtn.addEventListener(
  "click",
  () => {

    showHalf(
      1,
      0,
      false
    );
  }
);


showSecondHalfBtn.addEventListener(
  "click",
  () => {

    showHalf(
      2,
      0,
      false
    );
  }
);


/* =========================================================
   動画を表示
========================================================= */

function showHalf(
  half,
  time = 0,
  autoplay = false
) {

  if (
    !videoData[half].url
  ) {

    showMessage(
      half === 1
        ? "先に前半動画を選択してください。"
        : "先に後半動画を選択してください。"
    );

    return;
  }


  currentHalf =
    half;


  updateHalfButtons();


  video.pause();


  video.src =
    videoData[half].url;

  video.load();


  /*
   * loadedmetadata後に
   * 指定位置へ移動
   */

  const handleMetadata =
    () => {

      videoData[half].duration =
        video.duration;


      updateHalfDuration(
        half
      );


      video.currentTime =
        Math.min(
          Math.max(
            0,
            time
          ),
          video.duration || 0
        );


      video.playbackRate =
        playbackRate;


      updateTimeDisplay();


      if (autoplay) {

        video.play().catch(
          () => {}
        );
      }
    };


  video.addEventListener(
    "loadedmetadata",
    handleMetadata,
    {
      once: true
    }
  );
}


/* =========================================================
   前半 / 後半ボタン表示
========================================================= */

function updateHalfButtons() {

  showFirstHalfBtn.classList.toggle(
    "active",
    currentHalf === 1
  );

  showSecondHalfBtn.classList.toggle(
    "active",
    currentHalf === 2
  );


  currentHalfLabel.textContent =
    currentHalf === 1
      ? "前半"
      : "後半";
}


/* =========================================================
   動画メタデータ
========================================================= */

video.addEventListener(
  "loadedmetadata",
  () => {

    if (
      Number.isFinite(
        video.duration
      )
    ) {

      videoData[currentHalf].duration =
        video.duration;

      updateHalfDuration(
        currentHalf
      );
    }


    updateTimeDisplay();
  }
);


/* =========================================================
   前半 / 後半の動画時間表示
========================================================= */

function updateHalfDuration(
  half
) {

  const duration =
    videoData[half].duration;


  if (!Number.isFinite(duration)) {
    return;
  }


  const text =
    `(${formatTime(duration)})`;


  if (half === 1) {

    firstHalfDurationEl.textContent =
      text;

  } else {

    secondHalfDurationEl.textContent =
      text;
  }
}


/* =========================================================
   動画時間更新
========================================================= */

video.addEventListener(
  "timeupdate",
  () => {

    updateTimeDisplay();
  }
);


function updateTimeDisplay() {

  currentTimeEl.textContent =
    formatTime(
      video.currentTime
    );


  durationEl.textContent =
    formatTime(
      video.duration
    );
}


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

  if (
    !videoData[currentHalf].url
  ) {

    showMessage(
      currentHalf === 1
        ? "先に前半動画を選択してください。"
        : "先に後半動画を選択してください。"
    );

    return;
  }


  if (video.paused) {

    video.play().catch(
      () => {}
    );

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

    if (
      !videoData[currentHalf].url
    ) {

      showMessage(
        "先に動画を選択してください。"
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

    if (
      !videoData[currentHalf].url
    ) {

      showMessage(
        "先に動画を選択してください。"
      );

      return;
    }


    const duration =
      Number.isFinite(
        video.duration
      )
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


        if (
          !Number.isFinite(speed)
        ) {

          return;
        }


        playbackRate =
          speed;


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

  if (
    !videoData[currentHalf].url
  ) {

    showMessage(
      currentHalf === 1
        ? "先に前半動画を選択してください。"
        : "先に後半動画を選択してください。"
    );

    return null;
  }


  const time =
    video.currentTime;


  if (
    !Number.isFinite(time)
  ) {

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
   * イベントと動画の対応をチェック
   */

  if (
    type === "firstHalf" &&
    currentHalf !== 1
  ) {

    showMessage(
      "前半開始は前半動画で記録してください。"
    );

    return;
  }


  if (
    (
      type === "secondHalf" ||
      type === "fullTime"
    ) &&
    currentHalf !== 2
  ) {

    showMessage(
      type === "secondHalf"
        ? "後半開始は後半動画で記録してください。"
        : "試合終了は後半動画で記録してください。"
    );

    return;
  }


  /*
   * 二重登録防止
   */

  if (
    events.some(
      event =>
        event.type === type
    )
  ) {

    showMessage(
      `${getEventLabel(type)}はすでに記録されています。`
    );

    return;
  }


  events.push({

    id: createId(),

    type,

    team: null,

    half: currentHalf,

    time,

    homeScore,

    awayScore
  });


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

    half: currentHalf,

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
   1本の試合としての時間
========================================================= */

function getGlobalTime(
  event
) {

  if (
    event.half === 1
  ) {

    return event.time;
  }


  /*
   * 後半は前半動画の長さを加算
   */

  return (
    videoData[1].duration +
    event.time
  );
}


/* =========================================================
   イベント並び替え
========================================================= */

function sortEvents() {

  events.sort(
    (a, b) =>
      getGlobalTime(a) -
      getGlobalTime(b)
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


  sortEvents();


  events.forEach(
    event => {

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
        `${event.half === 1 ? "前半" : "後半"} ${formatTime(event.time)}`;


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
       * GOALスコア
       */

      if (
        event.type === "goal"
      ) {

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

          showHalf(
            event.half,
            event.time,
            true
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

  homeScore = 0;
  awayScore = 0;


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


        event.homeScore =
          homeScore;

        event.awayScore =
          awayScore;

      } else {

        event.homeScore =
          homeScore;

        event.awayScore =
          awayScore;
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


/* =========================================================
   🎬 試合動画書き出し
========================================================= */

const exportBtn =
  document.getElementById("exportBtn");

const exportProgress =
  document.getElementById("exportProgress");


/*
 * FFmpeg
 *
 * ブラウザ内だけで動画処理を行う
 */

let ffmpeg = null;

let ffmpegLoaded = false;

let exportBusy = false;


/* =========================================================
   FFmpeg読み込み
========================================================= */
async function loadFFmpeg() {

  if (ffmpegLoaded) {
    return;
  }

  try {

    exportProgress.textContent =
      "① FFmpeg本体を読み込んでいます…";


    /*
     * =====================================================
     * FFmpeg本体
     * goal-highlightで実際に動作しているものと同じ
     * =====================================================
     */

    const ffmpegModule =
      await import(
        "https://esm.sh/@ffmpeg/ffmpeg@0.12.10"
      );


    const utilModule =
      await import(
        "https://esm.sh/@ffmpeg/util@0.12.2"
      );


    const FFmpeg =
      ffmpegModule.FFmpeg;


    const toBlobURL =
      utilModule.toBlobURL;


    if (
      !FFmpeg ||
      !toBlobURL
    ) {

      throw new Error(
        "FFmpegライブラリを読み込めませんでした。"
      );

    }


    /*
     * =====================================================
     * FFmpegインスタンス作成
     * =====================================================
     */

    exportProgress.textContent =
      "② FFmpegを起動しています…";


    ffmpeg =
      new FFmpeg();


    /*
     * ログ
     */

    ffmpeg.on(
      "log",
      ({ message }) => {

        console.log(
          "FFmpeg:",
          message
        );

      }
    );


    /*
     * =====================================================
     * FFmpeg core
     * goal-highlightと同じESM版
     * =====================================================
     */

    const baseURL =
      "https://cdn.jsdelivr.net/npm/" +
      "@ffmpeg/core@0.12.10/dist/esm";


    /*
     * =====================================================
     * Worker
     *
     * match-editor/ffmpeg-worker.js
     * を使用する
     * =====================================================
     */

    const classWorkerURL =
      new URL(
        "./ffmpeg-worker.js",
        import.meta.url
      ).href;


    /*
     * =====================================================
     * core.js
     * =====================================================
     */

    exportProgress.textContent =
      "③ FFmpeg coreを読み込んでいます…";


    const coreURL =
      await toBlobURL(
        `${baseURL}/ffmpeg-core.js`,
        "text/javascript"
      );


    /*
     * =====================================================
     * WASM
     * =====================================================
     */

    exportProgress.textContent =
      "④ FFmpeg WASMを読み込んでいます…";


    const wasmURL =
      await toBlobURL(
        `${baseURL}/ffmpeg-core.wasm`,
        "application/wasm"
      );


    /*
     * =====================================================
     * FFmpeg起動
     * =====================================================
     */

    exportProgress.textContent =
      "⑤ FFmpegエンジンを起動しています…";


    await ffmpeg.load({

      coreURL,

      wasmURL,

      classWorkerURL

    });


    /*
     * =====================================================
     * 完了
     * =====================================================
     */

    ffmpegLoaded = true;


    exportProgress.textContent =
      "✅ 動画処理エンジンの準備が完了しました。";


  } catch (error) {

    console.error(
      "FFmpeg load error:",
      error
    );


    ffmpeg = null;

    ffmpegLoaded = false;


    const errorMessage =
      error &&
      error.message
        ? error.message
        : String(error);


    exportProgress.textContent =
      "❌ FFmpegの読み込みに失敗しました。";


    showMessage(
      `FFmpeg読み込みエラー：${errorMessage}`
    );


    throw error;

  }

}



/* =========================================================
   動画を書き出す
========================================================= */

exportBtn.addEventListener(
  "click",
  (event) => {
    event.preventDefault();
    event.stopPropagation();

    exportMatchVideo();
  }
);


async function exportMatchVideo() {

  if (exportBusy) {
    return;
  }


  /*
   * 前半・後半チェック
   */

  if (!videoData[1].file) {

    showMessage(
      "前半動画を選択してください。"
    );

    return;
  }


  if (!videoData[2].file) {

    showMessage(
      "後半動画を選択してください。"
    );

    return;
  }


  /*
   * 前半の長さを取得
   */

  if (
    !Number.isFinite(
      videoData[1].duration
    ) ||
    videoData[1].duration <= 0
  ) {

    showMessage(
      "前半動画の長さを取得してください。"
    );

    return;
  }


  exportBusy =
    true;

  exportBtn.disabled =
    true;


  try {

    /*
     * FFmpeg準備
     */

    await loadFFmpeg();


    /*
     * ファイル名
     */

    const firstFileName =
      videoData[1].file.name;

    const secondFileName =
      videoData[2].file.name;

    const outputFileName =
      "match_result.mp4";


    /*
     * WORKERFSで動画を直接マウント
     *
     * iPhoneのメモリに
     * 動画全体をコピーしない
     */

    exportProgress.textContent =
      "前半・後半動画を準備しています…";


    try {

      await ffmpeg.createDir(
        "/input"
      );

    } catch (error) {

      /*
       * 既に存在する場合は無視
       */

    }


    await ffmpeg.mount(
      "WORKERFS",
      {
        files: [
          videoData[1].file,
          videoData[2].file
        ]
      },
      "/input"
    );


    /*
     * concat用リスト
     *
     * WORKERFS上の実ファイルを指定
     */

    const concatText =
      `file '/input/${firstFileName}'\n` +
      `file '/input/${secondFileName}'`;


    await ffmpeg.writeFile(
      "input.txt",
      new TextEncoder().encode(
        concatText
      )
    );


    exportProgress.textContent =
      "前半と後半を結合しています…";


    /*
     * FFmpeg実行
     */

await ffmpeg.exec([
  "-f",
  "concat",
  "-safe",
  "0",
  "-i",
  "input.txt",
  "-c",
  "copy",
  outputFileName
]);

    exportProgress.textContent =
      "✅ FFmpegによる結合が完了しました。";

    showMessage(
      "FFmpegの結合処理は完了しました。"
    );

    return;


    /*
     * Blob
     */

    const blob =
      new Blob(
        [data],
        {
          type: "video/mp4"
        }
      );


    /*
     * 完成動画
     */

    const url =
      URL.createObjectURL(
        blob
      );


    /*
     * 新しいタブで完成動画を開く
     *
     * a.click() は使用しない
     */

    const videoWindow =
      window.open(
        url,
        "_blank"
      );


    if (!videoWindow) {

      showMessage(
        "完成動画を開けませんでした。ブラウザのポップアップを確認してください。"
      );

    }


    /*
     * すぐにURLを破棄しない
     */

    setTimeout(
      () => {

        URL.revokeObjectURL(
          url
        );

      },
      60000
    );


    exportProgress.textContent =
      "✅ 試合動画の書き出しが完了しました。";


    showMessage(
      "🎬 試合動画を書き出しました。"
    );


  } catch (error) {

    console.error(
      "Export error:",
      error
    );


    exportProgress.textContent =
      "動画の書き出しに失敗しました。";


    showMessage(
      `動画の書き出しに失敗しました：${
        error && error.message
          ? error.message
          : error
      }`
    );


  } finally {

    exportBusy =
      false;

    exportBtn.disabled =
      false;
  }
}


/* =========================================================
   出力ファイル名
========================================================= */

function createOutputFileName() {

  const home =
    getHomeTeamName();

  const away =
    getAwayTeamName();


  return (
    `${home}_vs_${away}_試合動画.mp4`
  );
}
