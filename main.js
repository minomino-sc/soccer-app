/* main.js — 完全版（ハイライト削除(A)・検索バー追加・既存仕様維持） */

/* ------------------------------
  初期データ / ユーティリティ
------------------------------ */
let scores = JSON.parse(localStorage.getItem("scores")) || [];
let videos = JSON.parse(localStorage.getItem("videos")) || []; // { id, url, title }
window.currentEditIndex = undefined;
let currentSearchQuery = ""; // 検索用（空で全件表示）

function saveAll() {
  localStorage.setItem("scores", JSON.stringify(scores));
  localStorage.setItem("videos", JSON.stringify(videos));
}

/* YouTube ID 抽出ユーティリティ */
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

/* escape helper for inline onclick (安全策) */
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

/* ------------------------------
   検索バー作成（動的に挿入）
   index.html を変えなくても動くようにする
------------------------------ */
function ensureSearchBar() {
  const scoresSection = document.getElementById("scoresSection");
  if (!scoresSection) return;

  // 既に存在すれば何もしない（scoreSearchBar または scoreSearch に対応）
  if (document.getElementById("scoreSearchBar") || document.getElementById("scoreSearch")) {
    // 既にある場合、既存の要素にイベントがついていなければ付ける
    const existing = document.getElementById("scoreSearchBar") || document.getElementById("scoreSearch");
    if (existing && !existing._hasSearchListener) {
      existing.addEventListener("input", (e) => {
        currentSearchQuery = (e.target.value || "").trim().toLowerCase();
        loadScores();
      });
      existing._hasSearchListener = true;
    }
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.style.margin = "8px 0 0 0";

  const input = document.createElement("input");
  input.id = "scoreSearchBar";
  input.placeholder = "検索：相手名・会場・日付・得点・ハイライト秒数（部分一致）";
  input.style.padding = "8px";
  input.style.width = "100%";
  input.addEventListener("input", (e) => {
    currentSearchQuery = (e.target.value || "").trim().toLowerCase();
    loadScores(); // 再描画
  });

  wrapper.appendChild(input);

  // 挿入位置は scoresSection の先頭（h2 の下）
  const h2 = scoresSection.querySelector("h2");
  if (h2) {
    h2.after(wrapper);
  } else {
    scoresSection.prepend(wrapper);
  }
}

/* ------------------------------
   検索マッチ判定
   対象: opponent, place, date, myScore/opponentScore, highlights (秒数)
------------------------------ */
function matchesSearch(it, q) {
  if (!q) return true;
  const qn = q.toLowerCase();

  // opponent, place, date
  if ((it.opponent || "").toLowerCase().includes(qn)) return true;
  if ((it.place || "").toLowerCase().includes(qn)) return true;
  if ((it.date || "").toLowerCase().includes(qn)) return true;

  // scores
  if (it.myScore !== null && it.myScore !== undefined && String(it.myScore).includes(qn)) return true;
  if (it.opponentScore !== null && it.opponentScore !== undefined && String(it.opponentScore).includes(qn)) return true;

  // highlights (array of numbers)
  if (Array.isArray(it.highlights) && it.highlights.length) {
    for (const h of it.highlights) {
      if (String(h).includes(qn)) return true;
    }
  }

  // videoId
  if ((it.videoId || "").toLowerCase().includes(qn)) return true;

  return false;
}

/* ------------------------------
   スコア一覧描画
------------------------------ */
function loadScores() {
  const container = document.getElementById("scoreGroups");
  if (!container) return;

  // insert search bar if not present
  ensureSearchBar();

  // if there is an existing search input (#scoreSearch) and user typed there, sync it
  const nativeSearch = document.getElementById("scoreSearch");
  if (nativeSearch && !nativeSearch._hasSearchListener) {
    nativeSearch.addEventListener("input", (e) => {
      currentSearchQuery = (e.target.value || "").trim().toLowerCase();
      loadScores();
    });
    nativeSearch._hasSearchListener = true;
  }
  if (nativeSearch) {
    // sync query to our variable (so both inputs behave the same)
    currentSearchQuery = (nativeSearch.value || "").trim().toLowerCase();
  }

  container.innerHTML = "";

  if (!scores.length) {
    container.innerHTML = `<p class="muted small">まだ試合がありません。作成してください。</p>`;
    return;
  }

  // filter by search
  const filtered = scores.map((it, idx) => ({ it, idx }))
    .filter(({ it }) => matchesSearch(it, currentSearchQuery));

  if (!filtered.length) {
    container.innerHTML = `<p class="muted small">検索条件に一致する試合がありません。</p>`;
    return;
  }

  // Build grouped map preserving original indices
  const grouped = {};
  filtered.forEach(({ it, idx }) => {
    const d = new Date(it.date);
    const cd = isNaN(d) ? new Date(it.createdAt || Date.now()) : d;
    const key = `${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, "0")}`;
    grouped[key] = grouped[key] || [];
    grouped[key].push({ it, idx });
  });

  const keys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
  keys.forEach(key => {
    const group = document.createElement("div");
    group.className = "month card";

    const header = document.createElement("div");
    header.className = "month-header";
    header.innerHTML = `<strong>${key}</strong> <span class="muted small">${grouped[key].length} 試合</span>`;
    group.appendChild(header);

    const body = document.createElement("div");
    body.className = "month-body";

    grouped[key].forEach(({ it, idx }) => {
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

      // badge (buttons)
      const badge = document.createElement("div");
      badge.className = "badge";

      const inner = document.createElement("div");
      inner.style.display = "flex";
      inner.style.flexDirection = "column";
      inner.style.gap = "6px";
      inner.style.alignItems = "flex-end";

      // 再生ボタン（動画が紐づいていれば）
      if (it.videoId) {
        const a = document.createElement("a");
        a.href = `https://youtu.be/${it.videoId}`;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.className = "btn";
        a.textContent = "試合動画再生";
        // ensure pointer cursor for mobile
        a.style.cursor = "pointer";
        inner.appendChild(a);
      }

      // 編集ボタン
      const editBtn = document.createElement("button");
      editBtn.className = "btn";
      editBtn.textContent = "編集";
      editBtn.addEventListener("click", () => {
        openEditModal(idx, it.date, it.opponent, it.place, it.myScore, it.opponentScore, it.highlights || []);
      });
      inner.appendChild(editBtn);

      // 削除ボタン
      const delBtn = document.createElement("button");
      delBtn.className = "btn danger";
      delBtn.textContent = "削除";
      delBtn.addEventListener("click", () => {
        if (!confirm("この試合を削除しますか？")) return;
        scores.splice(idx, 1);
        saveAll();
        loadScores();
      });
      inner.appendChild(delBtn);

      badge.appendChild(inner);

      // assemble
      scoreCard.appendChild(meta);
      scoreCard.appendChild(badge);

      body.appendChild(scoreCard);
    });

    group.appendChild(body);
    container.appendChild(group);
  });
}

/* ------------------------------
   編集モーダル（下部モーダル）制御
   — 下部モーダル（小文字 id）を前提
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

  // populate hlList (self-team goals)
  const hlList = document.getElementById("hlList");
  if (hlList) {
    hlList.innerHTML = "";
    (Array.isArray(highlights) ? highlights : []).forEach(h => {
      const item = createHlItemElement(h);
      hlList.appendChild(item);
    });
  }

  // show modal
  const modal = document.getElementById("editModal");
  if (modal) modal.classList.remove("hidden");
}

/* HL アイテム要素作成（×削除ボタンつき） */
function createHlItemElement(sec) {
  const wrapper = document.createElement("div");
  wrapper.className = "hl-item";
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.gap = "8px";

  const text = document.createElement("span");
  text.textContent = `${sec} 秒`;
  text.dataset.second = String(sec);

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.setAttribute("aria-label", "ハイライト削除");
  delBtn.textContent = "✕";
  delBtn.style.background = "transparent";
  delBtn.style.border = "none";
  delBtn.style.color = "#c00";
  delBtn.style.fontWeight = "700";
  delBtn.style.cursor = "pointer";
  delBtn.addEventListener("click", () => {
    // remove this hl element
    if (wrapper && wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
  });

  wrapper.appendChild(text);
  wrapper.appendChild(delBtn);
  return wrapper;
}

function closeEditModal() {
  const modal = document.getElementById("editModal");
  if (modal && !modal.classList.contains("hidden")) modal.classList.add("hidden");
  window.currentEditIndex = undefined;
}

/* 保存（編集モーダル） — 下部準拠 */
function saveEditGeneric() {
  const bottomDate = document.getElementById("edit-date");
  if (!bottomDate) return;

  const date = bottomDate.value;
  const opponent = (document.getElementById("edit-opponent").value || "").trim();
  const place = (document.getElementById("edit-place").value || "").trim();
  const myScore = document.getElementById("edit-my-score").value;
  const opponentScore = document.getElementById("edit-opponent-score").value;

  // gather highlights from hlList (dataset.second or text)
  const hlList = document.getElementById("hlList");
  const highlights = [];
  if (hlList) {
    Array.from(hlList.children).forEach(ch => {
      const span = ch.querySelector("span") || ch;
      const s = (span.dataset && span.dataset.second) ? String(span.dataset.second) : String(span.textContent || "");
      const num = s.replace(" 秒", "").trim();
      if (num) highlights.push(Number(num));
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
  const item = createHlItemElement(v);
  hlList.appendChild(item);
  secondsInput.value = "";
}

/* ------------------------------
   DOMContentLoaded — イベント登録
------------------------------ */
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
