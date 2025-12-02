/* main.js — YouTube ハイライト再生付き 完全版 */

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
   YouTube プレイヤー生成
------------------------------ */
function createPlayerIframe() {
  const iframe = document.createElement("iframe");
  iframe.id = "ytPlayer";
  iframe.width = "100%";
  iframe.height = "200";
  iframe.style.marginTop = "12px";
  iframe.allow =
    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  iframe.allowFullscreen = true;
  iframe.src = ""; // 初期は空
  return iframe;
}

/* ------------------------------
   モーダル：YouTube 再生 URL セット
------------------------------ */
function playHighlight(videoId, sec) {
  const iframe = document.getElementById("ytPlayer");
  if (!iframe) return;

  iframe.src = `https://www.youtube.com/embed/${videoId}?start=${sec}&autoplay=1`;
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

  document.getElementById("matchDate").value = "";
  document.getElementById("opponent").value = "";
  document.getElementById("place").value = "";
  document.getElementById("scoreA").value = "";
  document.getElementById("scoreB").value = "";
  document.getElementById("videoSelect").value = "";
}

/* ------------------------------
   スコア一覧描画
------------------------------ */
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

      const editBtn = badge.querySelector('button[data-idx]');
      if (editBtn) {
        editBtn.addEventListener("click", () => {
          openEditModal(idx, it.date, it.opponent, it.place, it.myScore, it.opponentScore, it.highlights || []);
        });
      }
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
   編集モーダル
------------------------------ */
function openEditModal(index, date, opponent, place, myScore, opponentScore, highlights) {
  window.currentEditIndex = index;
  const match = scores[index];
  const videoId = match.videoId;

  document.getElementById("edit-date").value = date || "";
  document.getElementById("edit-opponent").value = opponent || "";
  document.getElementById("edit-place").value = place || "";
  document.getElementById("edit-my-score").value = myScore ?? "";
  document.getElementById("edit-opponent-score").value = opponentScore ?? "";

  const hlList = document.getElementById("hlList");
  hlList.innerHTML = "";

  (Array.isArray(highlights) ? highlights : []).forEach(h => {
    const item = document.createElement("div");
    item.className = "hl-item";
    item.textContent = `${h} 秒`;

    // ▼ クリックで再生
    if (videoId) {
      item.style.cursor = "pointer";
      item.addEventListener("click", () => playHighlight(videoId, h));
    }

    hlList.appendChild(item);
  });

  // ▼ 既存の iframe があれば削除して作り直す
  const modalContent = document.querySelector("#editModal .modal-content");
  let oldIframe = document.getElementById("ytPlayer");
  if (oldIframe) oldIframe.remove();

  const iframe = createPlayerIframe();
  modalContent.insertBefore(iframe, document.getElementById("saveEdit"));

  const modal = document.getElementById("editModal");
  modal.classList.remove("hidden");
}

function closeEditModal() {
  const modal = document.getElementById("editModal");
  modal.classList.add("hidden");
  window.currentEditIndex = undefined;

  const iframe = document.getElementById("ytPlayer");
  if (iframe) iframe.src = "";
}

/* ------------------------------
   編集内容 保存
------------------------------ */
function saveEditGeneric() {
  const date = document.getElementById("edit-date").value;
  const opponent = document.getElementById("edit-opponent").value.trim();
  const place = document.getElementById("edit-place").value.trim();
  const myScore = document.getElementById("edit-my-score").value;
  const opponentScore = document.getElementById("edit-opponent-score").value;

  const hlList = document.getElementById("hlList");
  const highlights = [];
  Array.from(hlList.children).forEach(ch => {
    const s = String(ch.textContent).replace(" 秒", "").trim();
    if (s) highlights.push(Number(s));
  });

  scores[window.currentEditIndex] = {
    ...scores[window.currentEditIndex],
    date,
    opponent,
    place,
    myScore: myScore === "" ? null : Number(myScore),
    opponentScore: opponentScore === "" ? null : Number(opponentScore),
    highlights
  };

  saveAll();
  loadScores();
  closeEditModal();
  alert("保存しました。");
}

/* ------------------------------
   編集モーダル：試合削除
------------------------------ */
function deleteCurrentMatch() {
  if (window.currentEditIndex === undefined) return;
  if (!confirm("この試合を削除しますか？")) return;

  scores.splice(window.currentEditIndex, 1);
  saveAll();
  loadScores();
  closeEditModal();
}

/* ------------------------------
   ハイライト追加
------------------------------ */
function addHighlightTop() {
  const secondsInput = document.getElementById("hlSeconds");
  const v = secondsInput.value;
  if (!v) {
    alert("秒数を入力してください。");
    return;
  }

  const match = scores[window.currentEditIndex];
  const videoId = match.videoId;

  const hlList = document.getElementById("hlList");
  const item = document.createElement("div");
  item.className = "hl-item";
  item.textContent = `${v} 秒`;

  if (videoId) {
    item.style.cursor = "pointer";
    item.addEventListener("click", () => playHighlight(videoId, v));
  }

  hlList.appendChild(item);
  secondsInput.value = "";
}

/* ------------------------------
   起動時のイベント登録
------------------------------ */
document.addEventListener("DOMContentLoaded", () => {
  renderVideoSelects();
  loadScores();

  document.getElementById("btnAddYouTube").onclick = () => {
    const url = document.getElementById("youtubeUrl").value.trim();
    if (!url) return alert("URLを入力してください");
    addYouTubeVideo(url);
    document.getElementById("youtubeUrl").value = "";
  };

  document.getElementById("btnCreateMatch").onclick = createMatch;

  const btnBackLogin = document.getElementById("btnBackLogin");
  if (btnBackLogin) {
    btnBackLogin.addEventListener("click", () => {
      document.getElementById("teamSection").style.display = "block";
      document.getElementById("addVideoSection").style.display = "none";
      document.getElementById("createMatchSection").style.display = "none";
      document.getElementById("scoresSection").style.display = "none";

      document.getElementById("teamNameInput").value = "";
      document.getElementById("inviteCodeInput").value = "";
    });
  }

  document.getElementById("modalClose").onclick = closeEditModal;
  document.getElementById("saveEdit").onclick = saveEditGeneric;
  document.getElementById("deleteMatch").onclick = deleteCurrentMatch;
  document.getElementById("btnMarkGoal").onclick = addHighlightTop;

  document.getElementById("btnJoin").onclick = () => {
    const name = document.getElementById("teamNameInput").value.trim();
    const code = document.getElementById("inviteCodeInput").value.trim().toUpperCase();
    if (!name) return alert("チーム名を入力してください");

    const team = { teamName: name, inviteCode: code || null };
    localStorage.setItem("teamInfo", JSON.stringify(team));

    document.getElementById("teamSection").style.display = "none";
    document.getElementById("addVideoSection").style.display = "block";
    document.getElementById("createMatchSection").style.display = "block";
    document.getElementById("scoresSection").style.display = "block";

    alert("チーム参加しました！");
  };
});
