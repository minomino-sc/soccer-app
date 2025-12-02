/* main.js — index.html（lowercase IDs）に合わせた修正版 */

let scores = JSON.parse(localStorage.getItem("scores")) || [];
let videos = JSON.parse(localStorage.getItem("videos")) || []; // { id, url, title }
window.currentEditIndex = undefined;

function saveAll() {
  localStorage.setItem("scores", JSON.stringify(scores));
  localStorage.setItem("videos", JSON.stringify(videos));
}

function extractYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1);
    if (u.searchParams && u.searchParams.get("v")) return u.searchParams.get("v");
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
   動画セレクト描画
------------------------------ */
function renderVideoSelects() {
  const videoSelect = document.getElementById("videoSelect");
  if (videoSelect) {
    videoSelect.innerHTML = `<option value="">— 紐づけ動画なし —</option>`;
    videos.forEach(v => {
      const opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = v.title || v.url;
      videoSelect.appendChild(opt);
    });
  }
}

/* ------------------------------
   YouTube 追加
------------------------------ */
function addYouTubeVideo(url) {
  const id = extractYouTubeId(url);
  if (!id) {
    alert("YouTube のURLが正しくありません。例: https://youtu.be/xxxxx");
    return;
  }
  if (videos.find(v => v.id === id)) {
    alert("その動画はすでに追加済みです。");
    return;
  }
  videos.push({ id, url, title: url });
  saveAll();
  renderVideoSelects();
  alert("YouTube 動画を追加しました（限定公開でアップロードしてください）");
}

/* ------------------------------
   スコア作成
------------------------------ */
function createMatch() {
  const date = document.getElementById("matchDate").value;
  const opponent = (document.getElementById("opponent").value || "").trim();
  const place = (document.getElementById("place").value || "").trim();
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
    highlights: [],
    createdAt: new Date().toISOString()
  };

  scores.unshift(match);
  saveAll();
  loadScores();

  // clear
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
    const cd = isNaN(d) ? new Date(it.createdAt || Date.now()) : d;
    const key = `${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, "0")}`;
    groups[key] = groups[key] || [];
    groups[key].push({ it, idx });
  });
  return groups;
}

/* escape helper for inline onclick */
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

/* ------------------------------
   スコア一覧描画
   （index.html の要素構成に合わせる）
------------------------------ */
function loadScores() {
  const container = document.getElementById("scoreGroups");
  if (!container) return;
  container.innerHTML = "";

  if (!scores.length) {
    container.innerHTML = `<p class="muted small">まだ試合がありません。作成してください。</p>`;
    return;
  }

  const groups = groupByMonth(scores);
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

      // 色分けクラス
      let cls = "";
      if (typeof it.myScore === "number" && typeof it.opponentScore === "number") {
        if (it.myScore > it.opponentScore) cls = "win";
        else if (it.myScore < it.opponentScore) cls = "lose";
        else cls = "draw";
      }
      if (cls) scoreCard.classList.add(cls);

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.innerHTML = `
        <div class="title">${it.date} — ${it.opponent}</div>
        <div class="sub match-venue">${it.place || ""}</div>
        <div class="sub">Score: ${it.myScore ?? "-"} - ${it.opponentScore ?? "-"}</div>
      `;

      const badge = document.createElement("div");
      badge.className = "badge";

      // ボタン群（再生／編集／削除）
      badge.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
          ${it.videoId ? `<a href="https://youtu.be/${it.videoId}" target="_blank" class="btn">試合動画再生</a>` : ""}
          <button class="btn" data-idx="${idx}">編集</button>
          <button class="btn danger" data-del-idx="${idx}">削除</button>
        </div>
      `;

      scoreCard.appendChild(meta);
      scoreCard.appendChild(badge);
      body.appendChild(scoreCard);

      // DOM 挿入後にイベント（編集・削除）を確実にバインド
      // 編集ボタン
      const editBtn = badge.querySelector('button[data-idx]');
      if (editBtn) {
        editBtn.addEventListener("click", () => {
          openEditModal(idx, it.date, it.opponent, it.place, it.myScore, it.opponentScore, it.highlights || []);
        });
      }
      // 削除ボタン
      const delBtn = badge.querySelector('button[data-del-idx]');
      if (delBtn) {
        delBtn.addEventListener("click", () => {
          if (!confirm("この試合を削除しますか？")) return;
          scores.splice(idx, 1);
          saveAll();
          loadScores();
        });
      }
    });

    group.appendChild(body);
    container.appendChild(group);
  });
}

/* ------------------------------
   編集モーダル（下部モーダル）制御
   — index.html は下部モーダル（小文字 id）を使っている想定
------------------------------ */
function openEditModal(index, date, opponent, place, myScore, opponentScore, highlights) {
  window.currentEditIndex = index;

  const bottomDate = document.getElementById("edit-date");
  if (!bottomDate) return;

  bottomDate.value = date || "";
  document.getElementById("edit-opponent").value = opponent || "";
  document.getElementById("edit-place").value = place || "";
  document.getElementById("edit-my-score").value = myScore ?? "";
  document.getElementById("edit-opponent-score").value = opponentScore ?? "";

  // populate hlList (display self-team goals as lines)
  const hlList = document.getElementById("hlList");
  if (hlList) {
    hlList.innerHTML = "";
    (Array.isArray(highlights) ? highlights : []).forEach(h => {
      const item = document.createElement("div");
      item.className = "hl-item";
      item.textContent = `${h} 秒`;
      hlList.appendChild(item);
    });
  }

  // show modal
  const modal = document.getElementById("editModal");
  if (modal) modal.classList.remove("hidden");
}

function closeEditModal() {
  const modal = document.getElementById("editModal");
  if (modal && !modal.classList.contains("hidden")) modal.classList.add("hidden");
  window.currentEditIndex = undefined;
}

/* 保存（編集モーダル） — 下部（index.html 準拠） */
function saveEditGeneric() {
  const bottomDate = document.getElementById("edit-date");
  if (!bottomDate) return;

  const date = bottomDate.value;
  const opponent = (document.getElementById("edit-opponent").value || "").trim();
  const place = (document.getElementById("edit-place").value || "").trim();
  const myScore = document.getElementById("edit-my-score").value;
  const opponentScore = document.getElementById("edit-opponent-score").value;

  // gather hlList (elements created as "hl-item" with "秒")
  const hlList = document.getElementById("hlList");
  const highlights = [];
  if (hlList) {
    Array.from(hlList.children).forEach(ch => {
      const s = String(ch.textContent || "").replace(" 秒", "").trim();
      if (s) highlights.push(Number(s));
    });
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
    videoId: scores[window.currentEditIndex]?.videoId || null
  };

  saveAll();
  loadScores();
  closeEditModal();
  alert("保存しました。");
}

/* 試合削除（モーダル内の削除ボタン） */
function deleteCurrentMatch() {
  if (window.currentEditIndex === undefined) return;
  if (!confirm("この試合を削除しますか？")) return;
  scores.splice(window.currentEditIndex, 1);
  saveAll();
  loadScores();
  closeEditModal();
}

/* ハイライト追加（modal 内の input hlSeconds + btnMarkGoal） */
function addHighlightTop() {
  const secondsInput = document.getElementById("hlSeconds");
  if (!secondsInput) return;
  const v = secondsInput.value;
  if (!v) {
    alert("秒数を入力してください。");
    return;
  }
  const hlList = document.getElementById("hlList");
  if (!hlList) return;
  const item = document.createElement("div");
  item.className = "hl-item";
  item.textContent = `${v} 秒`;
  hlList.appendChild(item);
  secondsInput.value = "";
}

/* DOMContentLoaded — イベント登録 */
document.addEventListener("DOMContentLoaded", () => {
  renderVideoSelects();
  loadScores();

  // YouTube 追加
  const btnAddYT = document.getElementById("btnAddYouTube");
  if (btnAddYT) {
    btnAddYT.addEventListener("click", () => {
      const url = (document.getElementById("youtubeUrl").value || "").trim();
      if (!url) return alert("URLを入力してください");
      addYouTubeVideo(url);
      document.getElementById("youtubeUrl").value = "";
    });
  }

  // 試合作成
  const btnCreateMatch = document.getElementById("btnCreateMatch");
  if (btnCreateMatch) btnCreateMatch.addEventListener("click", createMatch);

  // 「ログイン画面に戻る」ボタン（createMatchSection 内にある btnBackLogin）
  const btnBackLogin = document.getElementById("btnBackLogin");
  if (btnBackLogin) {
    btnBackLogin.addEventListener("click", () => {
      // show only teamSection (login)
      const teamSection = document.getElementById("teamSection");
      if (teamSection) teamSection.style.display = "block";

      const addVideoSection = document.getElementById("addVideoSection");
      if (addVideoSection) addVideoSection.style.display = "none";

      const createMatchSection = document.getElementById("createMatchSection");
      if (createMatchSection) createMatchSection.style.display = "none";

      const scoresSection = document.getElementById("scoresSection");
      if (scoresSection) scoresSection.style.display = "none";

      // clear inputs optionally
      const t = document.getElementById("teamNameInput");
      const c = document.getElementById("inviteCodeInput");
      if (t) t.value = "";
      if (c) c.value = "";
    });
  }

  // modal close
  const closeModalBtn = document.getElementById("modalClose");
  if (closeModalBtn) closeModalBtn.addEventListener("click", closeEditModal);

  // modal save
  const saveModalBtn = document.getElementById("saveEdit");
  if (saveModalBtn) saveModalBtn.addEventListener("click", saveEditGeneric);

  // modal delete
  const deleteModalBtn = document.getElementById("deleteMatch");
  if (deleteModalBtn) deleteModalBtn.addEventListener("click", deleteCurrentMatch);

  // modal hl add (btnMarkGoal)
  const btnMarkGoal = document.getElementById("btnMarkGoal");
  if (btnMarkGoal) btnMarkGoal.addEventListener("click", addHighlightTop);

  // チーム参加 / 作成
  const btnJoin = document.getElementById("btnJoin");
  if (btnJoin) {
    btnJoin.addEventListener("click", () => {
      const name = (document.getElementById("teamNameInput").value || "").trim();
      const code = (document.getElementById("inviteCodeInput").value || "").trim().toUpperCase();
      if (!name) return alert("チーム名を入力してください");

      const team = { teamName: name, inviteCode: code || null };
      localStorage.setItem("teamInfo", JSON.stringify(team));

      // show app sections
      const teamSection = document.getElementById("teamSection");
      if (teamSection) teamSection.style.display = "none";

      const addVideoSection = document.getElementById("addVideoSection");
      if (addVideoSection) addVideoSection.style.display = "block";

      const createMatchSection = document.getElementById("createMatchSection");
      if (createMatchSection) createMatchSection.style.display = "block";

      const scoresSection = document.getElementById("scoresSection");
      if (scoresSection) scoresSection.style.display = "block";

      // update visible team name if element exists
      const currentTeamName = document.getElementById("currentTeamName");
      if (currentTeamName) {
        currentTeamName.textContent = `${team.teamName}（招待コード: ${team.inviteCode || "-"})`;
      }

      alert("チーム参加しました！");
    });
  }
});
