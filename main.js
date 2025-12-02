/* main.js — 完全版（index.html に合わせた実装） */

/* ------------------------------
  初期データ / ユーティリティ
------------------------------ */
let scores = JSON.parse(localStorage.getItem("scores")) || [];
let videos = JSON.parse(localStorage.getItem("videos")) || []; // { id, url, title }
window.currentEditIndex = undefined;

function saveAll() {
  localStorage.setItem("scores", JSON.stringify(scores));
  localStorage.setItem("videos", JSON.stringify(videos));
}

function extractYouTubeId(url) {
  // youtu.be/xxx or youtube.com/watch?v=xxx
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.slice(1);
    }
    if (u.searchParams && u.searchParams.get("v")) {
      return u.searchParams.get("v");
    }
    // try to parse v= in hash
    if (u.hash && u.hash.includes("v=")) {
      const params = new URLSearchParams(u.hash.slice(1));
      return params.get("v");
    }
    return null;
  } catch (e) {
    return null;
  }
}

/* ------------------------------
  DOM 操作：動画管理
------------------------------ */
function renderVideoSelects() {
  const videoSelect = document.getElementById("videoSelect");
  const editVideoSelect = document.getElementById("editVideoSelect");

  if (videoSelect) {
    videoSelect.innerHTML = `<option value="">— 紐づけ動画なし —</option>`;
    videos.forEach(v => {
      const opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = v.title || v.url;
      videoSelect.appendChild(opt);
    });
  }

  if (editVideoSelect) {
    editVideoSelect.innerHTML = `<option value="">— 紐づけ動画なし —</option>`;
    videos.forEach(v => {
      const opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = v.title || v.url;
      editVideoSelect.appendChild(opt);
    });
  }
}

function addYouTubeVideo(url) {
  const id = extractYouTubeId(url);
  if (!id) {
    alert("YouTube のURLが正しくありません。例: https://youtu.be/xxxxx");
    return;
  }
  // avoid duplicates
  if (videos.find(v => v.id === id)) {
    alert("その動画はすでに追加済みです。");
    return;
  }
  const title = url; // placeholder — we don't fetch YouTube API, so store URL as title
  videos.push({ id, url, title });
  saveAll();
  renderVideoSelects();
  alert("YouTube 動画を追加しました（限定公開でアップロードしてください）");
}

/* ------------------------------
  スコア（試合）管理
------------------------------ */
function createMatch() {
  const date = document.getElementById("matchDate").value;
  const opponent = document.getElementById("opponent").value.trim();
  const place = document.getElementById("place").value.trim();
  const myScore = document.getElementById("scoreA").value;
  const opponentScore = document.getElementById("scoreB").value;
  const videoId = document.getElementById("videoSelect").value || null;

  if (!date || !opponent) {
    alert("日付と対戦相手は必須です。");
    return;
  }

  const match = {
    date,
    opponent,
    place,
    myScore: myScore === "" ? null : Number(myScore),
    opponentScore: opponentScore === "" ? null : Number(opponentScore),
    videoId,
    highlights: [], // 秒数の配列
    createdAt: new Date().toISOString()
  };

  scores.unshift(match); // 新しいものを先頭に
  saveAll();
  loadScores();
  // clear inputs
  document.getElementById("matchDate").value = "";
  document.getElementById("opponent").value = "";
  document.getElementById("place").value = "";
  document.getElementById("scoreA").value = "";
  document.getElementById("scoreB").value = "";
  document.getElementById("videoSelect").value = "";
}

/* グルーピング helper */
function groupByMonth(items) {
  const groups = {};
  items.forEach((it, idx) => {
    const d = new Date(it.date);
    if (isNaN(d)) {
      // fallback: use createdAt
      const cd = new Date(it.createdAt || Date.now());
      const key = `${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, "0")}`;
      groups[key] = groups[key] || [];
      groups[key].push({ it, idx });
    } else {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      groups[key] = groups[key] || [];
      groups[key].push({ it, idx });
    }
  });
  return groups;
}

/* 描画 */
function loadScores() {
  const container = document.getElementById("scoreGroups");
  if (!container) return;

  container.innerHTML = "";

  if (!scores.length) {
    container.innerHTML = `<p class="muted small">まだ試合がありません。作成してください。</p>`;
    return;
  }

  const groups = groupByMonth(scores);

  // sort keys descending
  const keys = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  keys.forEach(key => {
    const group = document.createElement("div");
    group.className = "month card";
    const header = document.createElement("div");
    header.className = "month-header";
    header.innerHTML = `<strong>${key}</strong> <span class="muted small">${groups[key].length} 試合</span>`;
    group.appendChild(header);

    const body = document.createElement("div");
    body.className = "month-body";

    groups[key].forEach(({ it, idx }) => {
      const scoreCard = document.createElement("div");
      scoreCard.className = "score-card";
      // result class
      let cls = "";
      if (typeof it.myScore === "number" && typeof it.opponentScore === "number") {
        if (it.myScore > it.opponentScore) cls = "win";
        else if (it.myScore < it.opponentScore) cls = "lose";
        else cls = "draw";
      }
if (cls) {
  scoreCard.classList.add(cls);
}

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.innerHTML = `
        <div class="title">${it.date} — ${it.opponent}</div>
        <div class="sub match-venue">${it.place || ""}</div>
        <div class="sub">Score: ${it.myScore ?? "-"} - ${it.opponentScore ?? "-"}</div>
      `;
      
const badge = document.createElement("div");
badge.className = "badge";
badge.innerHTML = `
  <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
    ${it.videoId ? `<a href="https://youtu.be/${it.videoId}" target="_blank" class="btn">試合動画再生</a>` : ""}
    <button class="btn" onclick='openEditModal(${idx}, "${it.date}", "${escapeHtml(it.opponent)}", "${escapeHtml(it.place)}", "${it.myScore ?? ""}", "${it.opponentScore ?? ""}", ${JSON.stringify(it.highlights)})'>編集</button>

    <button class="btn danger" onclick="deleteMatchFromList(${idx})">削除</button>
  </div>
`;

      scoreCard.appendChild(meta);
      scoreCard.appendChild(badge);
      body.appendChild(scoreCard);
    });

    group.appendChild(body);
    container.appendChild(group);
  });
}

/* escape helper for inline onclick string */
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

/* --------------------------------------------------
   モーダル（編集）制御
-------------------------------------------------- */
function openEditModal(index, date, opponent, place, myScore, opponentScore, highlights) {
  window.currentEditIndex = index;

  const topDate = document.getElementById("editDate");
  const bottomDate = document.getElementById("edit-date");

  const parsedHighlights = Array.isArray(highlights) ? highlights : [];

  // -------------- 上部モーダル（editModal） --------------
  if (topDate) {
    topDate.value = date || "";
    document.getElementById("editOpponent").value = opponent || "";
    document.getElementById("editPlace").value = place || "";
    document.getElementById("editScoreA").value = myScore ?? "";
    document.getElementById("editScoreB").value = opponentScore ?? "";

    if (document.getElementById("editVideoSelect")) {
      document.getElementById("editVideoSelect").value = scores[index]?.videoId || "";
    }

    const hlList = document.getElementById("hlList");
    if (hlList) {
      hlList.innerHTML = "";
      parsedHighlights.forEach(h => {
        const item = document.createElement("div");
        item.className = "hl-item";
        item.textContent = `${h} 秒`;
        hlList.appendChild(item);
      });
    }

    const modal = document.getElementById("editModal");
    if (modal) modal.classList.remove("hidden");
    return;
  }

  // -------------- 下部モーダル（edit-date） --------------
  if (bottomDate) {
    bottomDate.value = date || "";
    document.getElementById("edit-opponent").value = opponent || "";
    document.getElementById("edit-place").value = place || "";
    document.getElementById("edit-my-score").value = myScore ?? "";
    document.getElementById("edit-opponent-score").value = opponentScore ?? "";

    const hlList = document.getElementById("edit-highlight-list");
    if (hlList) {
      hlList.innerHTML = "";
      parsedHighlights.forEach(h => {
        const li = document.createElement("div");
        li.className = "highlight-item";

        const input = document.createElement("input");
        input.type = "number";
        input.value = h;
        input.style.width = "80px";
        li.appendChild(input);

        hlList.appendChild(li);
      });
    }

    const modal = document.getElementById("editModal");
    if (modal) modal.classList.remove("hidden");
  }
}

/* --------------------------------------------------
   モーダル閉じる
-------------------------------------------------- */
function closeEditModal() {
  const modals = document.querySelectorAll("#editModal, #teamEditModal, #memberModal");
  modals.forEach(m => {
    if (!m.classList.contains("hidden")) {
      m.classList.add("hidden");
    }
  });
  window.currentEditIndex = undefined;
}

/* --------------------------------------------------
   保存（編集モーダル）
-------------------------------------------------- */
function saveEditGeneric() {
  const topDate = document.getElementById("editDate");
  const bottomDate = document.getElementById("edit-date");

  let date, opponent, place, myScore, opponentScore, highlights = [], videoId = null;

  // -------- 上部モーダル --------
if (topDate) {
  date = document.getElementById("editDate").value;
  opponent = document.getElementById("editOpponent").value;
  place = document.getElementById("editPlace").value;
  myScore = document.getElementById("editScoreA").value;
  opponentScore = document.getElementById("editScoreB").value;

  highlights = [];

  // --- ① 自チームゴール秒数（goalSecondsList） ---
  const goalList = document.getElementById("goalSecondsList");
  if (goalList) {
    Array.from(goalList.children).forEach(ch => {
      const s = ch.textContent.replace(" 秒", "").trim();
      if (s) highlights.push(Number(s));
    });
  }

  // --- ② ハイライト秒数（hlList） ---
  const hlList = document.getElementById("hlList");
  if (hlList) {
    Array.from(hlList.children).forEach(ch => {
      const s = ch.textContent.replace(" 秒", "").trim();
      if (s) highlights.push(Number(s));
    });
  }

  if (document.getElementById("editVideoSelect")) {
    videoId = document.getElementById("editVideoSelect").value || null;
  }
}

  // -------- 下部モーダル --------
  else if (bottomDate) {
    date = document.getElementById("edit-date").value;
    opponent = document.getElementById("edit-opponent").value;
    place = document.getElementById("edit-place").value;
    myScore = document.getElementById("edit-my-score").value;
    opponentScore = document.getElementById("edit-opponent-score").value;

    const hlElems = document.querySelectorAll("#edit-highlight-list .highlight-item input");
    highlights = Array.from(hlElems).map(i => Number(i.value));

    videoId = scores[window.currentEditIndex]?.videoId || null;
  } else {
    return;
  }

  if (window.currentEditIndex === undefined) {
    alert("編集対象が見つかりません。");
    return;
  }

  const sA = myScore === "" ? null : Number(myScore);
  const sB = opponentScore === "" ? null : Number(opponentScore);

  scores[window.currentEditIndex] = {
    ...scores[window.currentEditIndex],
    date,
    opponent,
    place,
    myScore: sA,
    opponentScore: sB,
    highlights: highlights || [],
    videoId
  };

  saveAll();
  loadScores();
  closeEditModal();
  alert("保存しました。");
}

/* --------------------------------------------------
   試合削除
-------------------------------------------------- */
function deleteCurrentMatch() {
  if (window.currentEditIndex === undefined) return;

  if (!confirm("この試合を削除しますか？")) return;

  scores.splice(window.currentEditIndex, 1);
  saveAll();
  loadScores();
  closeEditModal();
}

// ▼▼ これを追加 ▼▼
function deleteMatchFromList(index) {
  if (!confirm("この試合を削除しますか？")) return;
  scores.splice(index, 1);
  saveAll();
  loadScores();
}
// ▲▲ これを追加 ▲▲

/* --------------------------------------------------
   ハイライト追加（上モーダル）
-------------------------------------------------- */
function addHighlightTop() {
  const secondsInput = document.getElementById("hlSeconds");
  if (!secondsInput) return;

  const v = secondsInput.value;
  if (!v) {
    alert("秒数を入力してください。");
    return;
  }

  const hlList = document.getElementById("hlList");
  const item = document.createElement("div");
  item.className = "hl-item";
  item.textContent = `${v} 秒`;
  hlList.appendChild(item);

  secondsInput.value = "";
}

/* --------------------------------------------------
   ゴール追加ボタン（上モーダル）
-------------------------------------------------- */
function markGoalTop() {
  const secondsInput = document.getElementById("hlSeconds");
  const v = secondsInput.value || prompt("ゴール秒数を入力してください（例：123）");
  if (!v) return;

  const hlList = document.getElementById("hlList");
  const item = document.createElement("div");
  item.className = "hl-item";
  item.textContent = `${v} 秒`;
  hlList.appendChild(item);

  secondsInput.value = "";
}

/* --------------------------------------------------
   DOMContentLoaded（全イベント登録）
-------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  renderVideoSelects();
  loadScores();

  // --- YouTube 追加 ---
  const btnAddYT = document.getElementById("btnAddYouTube");
  if (btnAddYT) {
    btnAddYT.addEventListener("click", () => {
      const url = document.getElementById("youtubeUrl").value.trim();
      if (!url) return alert("URLを入力してください");
      addYouTubeVideo(url);
      document.getElementById("youtubeUrl").value = "";
    });
  }

  // --- 試合作成 ---
  const btnCreateMatch = document.getElementById("btnCreateMatch");
  if (btnCreateMatch) btnCreateMatch.addEventListener("click", createMatch);

// ▼ ログイン画面に戻るボタン
const backToLogin = document.getElementById("btnBackLogin");
if (backToLogin) {
    backToLogin.addEventListener("click", () => {
        // すべてのセクションを非表示に
        document.getElementById("teamSection").style.display = "block";
        document.getElementById("addVideoSection").style.display = "none";
        document.getElementById("createMatchSection").style.display = "none";
        document.getElementById("scoresSection").style.display = "none";

        // モーダルも閉じる（保険）
        closeEditModal();
    });
}
  
/* --------------------------------------------------
   モーダル閉じる / 保存 / 削除（編集モーダル）
-------------------------------------------------- */

// ▼ モーダルを閉じる（HTML にあるボタン）
const closeBottom = document.getElementById("modalClose");
if (closeBottom) {
  closeBottom.addEventListener("click", closeEditModal);
}

// ▼ 保存ボタン（HTML にあるボタン）
const saveBottom = document.getElementById("saveEdit");
if (saveBottom) {
  saveBottom.addEventListener("click", saveEditGeneric);
}

// ▼ 削除ボタン（あなたが追加したもの）
const deleteBtn = document.getElementById("deleteMatch");
if (deleteBtn) {
  deleteBtn.addEventListener("click", deleteCurrentMatch);
}

  // --- ハイライト追加 ---
  const btnAddHL = document.getElementById("btnAddHL");
  if (btnAddHL) btnAddHL.addEventListener("click", addHighlightTop);

  const btnMarkGoal = document.getElementById("btnMarkGoal");
  if (btnMarkGoal) btnMarkGoal.addEventListener("click", markGoalTop);

  // --- チーム参加 / 作成 ---
  const btnJoin = document.getElementById("btnJoin");
  if (btnJoin) {
    btnJoin.addEventListener("click", () => {
      const name = document.getElementById("teamNameInput").value.trim();
      const code = document.getElementById("inviteCodeInput").value.trim().toUpperCase();

      if (!name) return alert("チーム名を入力してください");

      const team = { teamName: name, inviteCode: code || null };
      localStorage.setItem("teamInfo", JSON.stringify(team));

      document.getElementById("teamSection").style.display = "none";
      document.getElementById("addVideoSection").style.display = "block";
      document.getElementById("createMatchSection").style.display = "block";
      document.getElementById("scoresSection").style.display = "block";

      if (document.getElementById("currentTeamName")) {
        document.getElementById("currentTeamName").textContent =
          `${team.teamName}（招待コード: ${team.inviteCode || "-"})`;
      }

      alert("チーム参加しました！");
    });
  }
});
