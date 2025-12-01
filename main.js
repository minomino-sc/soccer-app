/* ------------------------------
  ユーティリティ
------------------------------ */

// ランダム6桁招待コード
function generateInviteCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// teamId 生成
function generateTeamId(name, code) {
  return (
    name.replace(/\s+/g, "-").toLowerCase() +
    "-" +
    code.toLowerCase()
  );
}


/* ------------------------------
  ログイン/チーム作成処理
------------------------------ */

document.getElementById('joinButton').addEventListener('click', async () => {
  const teamName = document.getElementById('teamName').value.trim();
  const inviteCodeInput = document.getElementById('inviteCode').value.trim().toUpperCase();

  if (!teamName) {
    alert("チーム名を入力してください");
    return;
  }

  // 現在の teams.json を読み込む
  const res = await fetch('./data/teams.json');
  const json = await res.json();
  const teams = json.teams || [];

  // 入力された招待コードで既存チーム検索
  const existingTeam = teams.find(t =>
    t.teamName === teamName && t.inviteCode === inviteCodeInput
  );

  if (existingTeam) {
    /* ----------------------------
        既存チームにログイン
    ---------------------------- */
    console.log("ログイン成功:", existingTeam);

    saveTeamToLocal(existingTeam);
    showMainScreen(existingTeam);
    return;
  }

  /* ----------------------------
      新規チーム作成
  ---------------------------- */

  // 招待コードが空なら自動生成
  const inviteCode = inviteCodeInput || generateInviteCode();

  const newTeam = {
    teamId: generateTeamId(teamName, inviteCode),
    teamName: teamName,
    inviteCode: inviteCode,
    videos: [],
    scores: [],
    highlights: [],
    goalScenes: []
  };

  console.log("新規チーム作成:", newTeam);

  // ローカルに即反映
  saveTeamToLocal(newTeam);
  showMainScreen(newTeam);

  // GitHub Actions に送るためのペイロード
  sendTeamToGitHub(newTeam);
});


/* ------------------------------
  ローカル保存
------------------------------ */
function saveTeamToLocal(team) {
  localStorage.setItem('teamInfo', JSON.stringify(team));
}


/* ------------------------------
  ログイン後の画面切り替え
------------------------------ */
function showMainScreen(team) {
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('mainSection').style.display = 'block';

  // 表示中のチーム名を更新
  document.getElementById('currentTeamName').textContent = `${team.teamName}（招待コード: ${team.inviteCode}）`;
}


/* ------------------------------
  GitHub Actions に送信
------------------------------ */
async function sendTeamToGitHub(team) {
  const payload = {
    action: "createTeam",
    team: team
  };

  // ここは update-teams.yml が受け取る API エンドポイント
  await fetch(
    "https://api.github.com/repos/＜あなたのGitHubユーザー名＞/＜リポジトリ名＞/dispatches",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/vnd.github.everest-preview+json",
        Authorization: `token ＜PATトークン＞`
      },
      body: JSON.stringify({
        event_type: "update_teams",
        client_payload: payload
      })
    }
  );
}
/* ======= モーダル開閉 ======= */

// 編集モーダルを開く
function openEditModal(date, opponent, place, myScore, opponentScore, highlights) {
    const modal = document.getElementById("editModal");
    const dateInput = document.getElementById("edit-date");
    const opponentInput = document.getElementById("edit-opponent");
    const placeInput = document.getElementById("edit-place");
    const myScoreInput = document.getElementById("edit-my-score");
    const opponentScoreInput = document.getElementById("edit-opponent-score");
    const highlightList = document.getElementById("edit-highlight-list");

    dateInput.value = date;
    opponentInput.value = opponent;
    placeInput.value = place;
    myScoreInput.value = myScore;
    opponentScoreInput.value = opponentScore;

    highlightList.innerHTML = "";
    highlights.forEach((h) => {
        const item = document.createElement("li");
        item.textContent = h + "秒";
        highlightList.appendChild(item);
    });

    modal.classList.remove("hidden");
}

// モーダルを閉じる
function closeModal() {
    document.getElementById("editModal").classList.add("hidden");
}
