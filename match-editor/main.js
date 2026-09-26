/* =========================================================
   ⚽ 試合動画エディター
   第1段階
   ・動画読み込み
   ・動画時間表示
   ・GOAL記録
   ・スコア自動更新
   ・ゴール一覧
   ========================================================= */


/* =========================================================
   DOM
========================================================= */

const videoFile = document.getElementById("videoFile");
const video = document.getElementById("video");

const homeTeam = document.getElementById("homeTeam");
const awayTeam = document.getElementById("awayTeam");

const homeScoreTeam = document.getElementById("homeScoreTeam");
const awayScoreTeam = document.getElementById("awayScoreTeam");

const homeGoalLabel = document.getElementById("homeGoalLabel");
const awayGoalLabel = document.getElementById("awayGoalLabel");

const homeScoreEl = document.getElementById("homeScore");
const awayScoreEl = document.getElementById("awayScore");

const homeGoalBtn = document.getElementById("homeGoalBtn");
const awayGoalBtn = document.getElementById("awayGoalBtn");

const currentTimeEl = document.getElementById("currentTime");
const durationEl = document.getElementById("duration");

const goalList = document.getElementById("goalList");
const resetBtn = document.getElementById("resetBtn");
const message = document.getElementById("message");


/* =========================================================
   状態
========================================================= */

let sourceUrl = null;

let homeScore = 0;
let awayScore = 0;

let goals = [];


/* =========================================================
   初期表示
========================================================= */

updateTeamNames();
renderScore();
renderGoals();


/* =========================================================
   チーム名変更
========================================================= */

homeTeam.addEventListener("input", updateTeamNames);
awayTeam.addEventListener("input", updateTeamNames);


function updateTeamNames() {

  const home = homeTeam.value.trim() || "箕谷A";
  const away = awayTeam.value.trim() || "相手";

  homeScoreTeam.textContent = home;
  awayScoreTeam.textContent = away;

  homeGoalLabel.textContent = home;
  awayGoalLabel.textContent = away;
}


/* =========================================================
   動画読み込み
========================================================= */

videoFile.addEventListener("change", () => {

  const file = videoFile.files[0];

  if (!file) {
    return;
  }

  if (sourceUrl) {
    URL.revokeObjectURL(sourceUrl);
  }

  sourceUrl = URL.createObjectURL(file);

  video.src = sourceUrl;
  video.load();

  showMessage("動画を読み込みました。");
});


/* =========================================================
   動画メタデータ読み込み
========================================================= */

video.addEventListener("loadedmetadata", () => {

  durationEl.textContent = formatTime(video.duration);

  currentTimeEl.textContent = "00:00";

  showMessage("動画の準備ができました。");
});


/* =========================================================
   動画時間更新
========================================================= */

video.addEventListener("timeupdate", () => {

  currentTimeEl.textContent =
    formatTime(video.currentTime);
});


/* =========================================================
   GOAL
========================================================= */

homeGoalBtn.addEventListener("click", () => {

  recordGoal("home");
});


awayGoalBtn.addEventListener("click", () => {

  recordGoal("away");
});


function recordGoal(team) {

  if (!video.src) {

    showMessage("先に試合動画を選択してください。");

    return;
  }


  const time = video.currentTime;


  if (!Number.isFinite(time)) {

    showMessage("動画の時間を取得できませんでした。");

    return;
  }


  /* スコア更新 */

  if (team === "home") {

    homeScore++;

  } else {

    awayScore++;

  }


  /* ゴール記録 */

  goals.push({

    id: Date.now(),

    team,

    time,

    homeScore,

    awayScore

  });


  renderScore();
  renderGoals();


  const teamName =
    team === "home"
      ? homeTeam.value.trim() || "箕谷A"
      : awayTeam.value.trim() || "相手";


  showMessage(
    `⚽ ${teamName} GOAL！ ${homeScore}-${awayScore}`
  );
}


/* =========================================================
   スコア表示
========================================================= */

function renderScore() {

  homeScoreEl.textContent = homeScore;
  awayScoreEl.textContent = awayScore;
}


/* =========================================================
   ゴール一覧
========================================================= */

function renderGoals() {

  goalList.innerHTML = "";


  if (!goals.length) {

    goalList.innerHTML =
      '<p class="empty-message">まだゴールは記録されていません。</p>';

    return;
  }


  goals.forEach((goal, index) => {

    const item = document.createElement("div");

    item.className = "goal-item";


    const time = document.createElement("div");

    time.className = "goal-time";

    time.textContent =
      formatTime(goal.time);


    const info = document.createElement("div");

    info.className = "goal-info";


    const scorer = document.createElement("strong");

    scorer.textContent =
      goal.team === "home"
        ? `${homeTeam.value.trim() || "箕谷A"} GOAL`
        : `${awayTeam.value.trim() || "相手"} GOAL`;


    const score = document.createElement("span");

    score.className = "goal-score";

    score.textContent =
      `${goal.homeScore} - ${goal.awayScore}`;


    info.appendChild(scorer);
    info.appendChild(score);


    const actions = document.createElement("div");


    const seekButton = document.createElement("button");

    seekButton.type = "button";
    seekButton.className = "seek-button";
    seekButton.textContent = "▶ 再生";

    seekButton.addEventListener("click", () => {

      video.currentTime = goal.time;

      video.play().catch(() => {});

    });


    const deleteButton = document.createElement("button");

    deleteButton.type = "button";
    deleteButton.className = "delete-button";
    deleteButton.textContent = "×";
    deleteButton.setAttribute(
      "aria-label",
      "このゴールを削除"
    );


    deleteButton.addEventListener("click", () => {

      deleteGoal(goal.id);

    });


    actions.appendChild(seekButton);
    actions.appendChild(deleteButton);


    item.appendChild(time);
    item.appendChild(info);
    item.appendChild(actions);


    goalList.appendChild(item);

  });
}


/* =========================================================
   ゴール削除
========================================================= */

function deleteGoal(id) {

  const index =
    goals.findIndex(goal => goal.id === id);


  if (index === -1) {
    return;
  }


  goals.splice(index, 1);


  /*
   * 削除後は記録順にスコアを再計算する。
   */

  homeScore = 0;
  awayScore = 0;


  goals.forEach(goal => {

    if (goal.team === "home") {
      homeScore++;
    } else {
      awayScore++;
    }

    goal.homeScore = homeScore;
    goal.awayScore = awayScore;

  });


  renderScore();
  renderGoals();


  showMessage("ゴール記録を削除しました。");
}


/* =========================================================
   リセット
========================================================= */

resetBtn.addEventListener("click", () => {

  if (!goals.length && homeScore === 0 && awayScore === 0) {

    showMessage("リセットする記録はありません。");

    return;
  }


  const ok =
    window.confirm(
      "ゴール記録とスコアをすべてリセットしますか？"
    );


  if (!ok) {
    return;
  }


  homeScore = 0;
  awayScore = 0;

  goals = [];


  renderScore();
  renderGoals();


  showMessage("ゴール記録をリセットしました。");
});


/* =========================================================
   時間フォーマット
========================================================= */

function formatTime(seconds) {

  if (!Number.isFinite(seconds)) {
    return "00:00";
  }


  seconds = Math.max(0, Math.floor(seconds));


  const minutes =
    Math.floor(seconds / 60);

  const sec =
    seconds % 60;


  return (
    String(minutes).padStart(2, "0") +
    ":" +
    String(sec).padStart(2, "0")
  );
}


/* =========================================================
   メッセージ
========================================================= */

let messageTimer = null;


function showMessage(text) {

  message.textContent = text;


  clearTimeout(messageTimer);


  messageTimer =
    setTimeout(() => {

      message.textContent = "";

    }, 3000);
}
