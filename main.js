/* -------------------------------------------------------
    main.js — 完全版（ハイライト削除A・検索・秒数クリック再生）
--------------------------------------------------------- */

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
   試合作成
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
   グルーピング helper
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

/* ------------------------------
    検索バー（自動生成）
------------------------------ */
function ensureSearchBar() {
  const scoresSection = document.getElementById("scoresSection");
  if (!scoresSection) return;

  if (document.getElementById("scoreSearchBar")) return;

  const input = document.createElement("input");
  input.id = "scoreSearchBar";
  input.placeholder = "検索：相手名・会場・日付・得点・ハイライト秒数";
  input.style.padding = "8px";
  input.style.width = "100%";
  input.addEventListener("input", (e) => {
    currentSearchQuery = (e.target.value || "").trim().toLowerCase();
    loadScores();
  });

  const h2 = scoresSection.querySelector("h2");
  if (h2) h2.after(input);
}

/* ------------------------------
   検索マッチ判定
------------------------------ */
function matchesSearch(it, q) {
  if (!q) return true;
  const qn = q.toLowerCase();

  if ((it.opponent || "").toLowerCase().includes(qn)) return true;
  if ((it.place || "").toLowerCase().includes(qn)) return true;
  if ((it.date || "").toLowerCase().includes(qn)) return true;

  if (it.myScore !== null && String(it.myScore).includes(qn)) return true;
  if (it.opponentScore !== null && String(it.opponentScore).includes(qn)) return true;

  if (Array.isArray(it.highlights)) {
    if (it.highlights.some(h => String(h).includes(qn))) return true;
  }

  return false;
}

/* ==========================================================
    ★★ ここから「スコア一覧描画 & 秒数クリック再生」部分 ★★
========================================================== */
function loadScores() {
  const container = document.getElementById("scoreGroups");
  if (!container) return;

  ensureSearchBar();
  container.innerHTML = "";

  if (!scores.length) {
    container.innerHTML = `<p class="muted small">まだ試合がありません。</p>`;
    return;
  }

  const filtered = scores.map((it, idx) => ({ it, idx }))
    .filter(({ it }) => matchesSearch(it, currentSearchQuery));

  if (!filtered.length) {
    container.innerHTML = `<p class="muted small">検索に一致する試合がありません。</p>`;
    return;
  }

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

    group.innerHTML = `
      <div class="month-header"><strong>${key}</strong></div>
    `;

    const body = document.createElement("div");
    body.className = "month-body";

    grouped[key].forEach(({ it, idx }) => {
      const card = document.createElement("div");
      card.className = "score-card";

      let cls = "";
      if (typeof it.myScore === "number" && typeof it.opponentScore === "number") {
        if (it.myScore > it.opponentScore) cls = "win";
        else if (it.myScore < it.opponentScore) cls = "lose";
        else cls = "draw";
      }
      if (cls) card.classList.add(cls);

      /* ------------------------------
         HTML構築
      ------------------------------ */
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.innerHTML = `
        <div class="title">${it.date} — ${it.opponent}</div>
        <div class="sub">${it.place || ""}</div>
        <div class="sub">Score: ${it.myScore ?? "-"} - ${it.opponentScore ?? "-"}</div>
      `;

      const badge = document.createElement("div");
      badge.className = "badge";

      const wrap = document.createElement("div");
      wrap.style.display = "flex";
      wrap.style.flexDirection = "column";
      wrap.style.gap = "6px";
      wrap.style.alignItems = "flex-end";

      /* 🎥 試合動画再生 */
      if (it.videoId) {
        const a = document.createElement("a");
        a.href = `https://youtu.be/${it.videoId}`;
        a.target = "_blank";
        a.className = "btn";
        a.textContent = "試合動画再生";
        wrap.appendChild(a);
      }

      /* ✏ 編集 */
      const editBtn = document.createElement("button");
      editBtn.className = "btn";
      editBtn.textContent = "編集";
      editBtn.addEventListener("click", () => {
        openEditModal(idx, it.date, it.opponent, it.place, it.myScore, it.opponentScore, it.highlights);
      });
      wrap.appendChild(editBtn);

      /* ❌ 削除 */
      const delBtn = document.createElement("button");
      delBtn.className = "btn danger";
      delBtn.textContent = "削除";
      delBtn.addEventListener("click", () => {
        if (!confirm("この試合を削除しますか？")) return;
        scores.splice(idx, 1);
        saveAll();
        loadScores();
      });
      wrap.appendChild(delBtn);

      badge.appendChild(wrap);

      /* ハイライト秒数一覧（クリック → 再生） */
      if (it.highlights && it.highlights.length) {
        const hlWrap = document.createElement("div");
        hlWrap.className = "hl-wrap";

        it.highlights.forEach(sec => {
          const btn = document.createElement("button");
          btn.className = "hl-btn";
          btn.textContent = `${sec} 秒`;

          btn.addEventListener("click", () => {
            if (!it.videoId) {
              alert("動画が紐づいていません。");
              return;
            }
            const url = `https://youtu.be/${it.videoId}?t=${sec}`;
            window.open(url, "_blank");
          });

          hlWrap.appendChild(btn);
        });

        meta.appendChild(hlWrap);
      }

      card.appendChild(meta);
      card.appendChild(badge);
      body.appendChild(card);
    });

    group.appendChild(body);
    container.appendChild(group);
  });
}

/* ==========================================================
    編集モーダル
========================================================== */
function openEditModal(index, date, opponent, place, myScore, opponentScore, highlights) {
  window.currentEditIndex = index;

  document.getElementById("edit-date").value = date || "";
  document.getElementById("edit-opponent").value = opponent || "";
  document.getElementById("edit-place").value = place || "";
  document.getElementById("edit-my-score").value = myScore ?? "";
  document.getElementById("edit-opponent-score").value = opponentScore ?? "";

  const hlList = document.getElementById("hlList");
  hlList.innerHTML = "";

  (highlights || []).forEach(sec => {
    hlList.appendChild(createHlItemElement(sec));
  });

  document.getElementById("editModal").classList.remove("hidden");
}

/* ハイライト項目生成（✕削除ボタンつき） */
function createHlItemElement(sec) {
  const wrapper = document.createElement("div");
  wrapper.className = "hl-item";
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.gap = "8px";

  const text = document.createElement("span");
  text.textContent = `${sec} 秒`;
  text.dataset.second = sec;

  const del = document.createElement("button");
  del.textContent = "✕";
  del.style.color = "#c00";
  del.style.border = "none";
  del.style.background = "transparent";
  del.style.fontWeight = "700";
  del.style.cursor = "pointer";

  del.addEventListener("click", () => wrapper.remove());

  wrapper.appendChild(text);
  wrapper.appendChild(del);

  return wrapper;
}

function closeEditModal() {
  document.getElementById("editModal").classList.add("hidden");
  window.currentEditIndex = undefined;
}

/* 保存（編集モーダル） */
function saveEditGeneric() {
  if (window.currentEditIndex === undefined) return;

  const date = document.getElementById("edit-date").value;
  const opponent = document.getElementById("edit-opponent").value.trim();
  const place = document.getElementById("edit-place").value.trim();
  const myScore = document.getElementById("edit-my-score").value;
  const opponentScore = document.getElementById("edit-opponent-score").value;

  /* ハイライト読み取り */
  const highlights = [];
  const hlList = document.getElementById("hlList").children;

  Array.from(hlList).forEach(item => {
    const sec = Number(item.querySelector("span").dataset.second);
    if (!isNaN(sec)) highlights.push(sec);
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

/* 試合削除（編集モーダル内） */
function deleteCurrentMatch() {
  if (window.currentEditIndex === undefined) return;
  if (!confirm("この試合を削除しますか？")) return;

  scores.splice(window.currentEditIndex, 1);
  saveAll();
  loadScores();
  closeEditModal();
}

/* 自チームゴール秒数の追加（編集モーダル内） */
function addHighlightTop() {
  const input = document.getElementById("hlSeconds");
  const v = input.value;
  if (!v) return alert("秒数を入力してください");

  document.getElementById("hlList").appendChild(createHlItemElement(Number(v)));
  input.value = "";
}

/* ==========================================================
    DOMContentLoaded
========================================================== */
document.addEventListener("DOMContentLoaded", () => {

  renderVideoSelects();
  loadScores();

  /* YouTube 追加 */
  const btnAddYT = document.getElementById("btnAddYouTube");
  if (btnAddYT) {
    btnAddYT.addEventListener("click", () => {
      const url = document.getElementById("youtubeUrl").value.trim();
      if (!url) return alert("URLを入力してください");
      addYouTubeVideo(url);
      document.getElementById("youtubeUrl").value = "";
    });
  }

  /* 試合作成 */
  const btnCreateMatch = document.getElementById("btnCreateMatch");
  if (btnCreateMatch) btnCreateMatch.addEventListener("click", createMatch);

  /* ログイン画面に戻る */
  const btnBack = document.getElementById("btnBackLogin");
  if (btnBack) {
    btnBack.addEventListener("click", () => {
      document.getElementById("teamSection").style.display = "block";
      document.getElementById("addVideoSection").style.display = "none";
      document.getElementById("createMatchSection").style.display = "none";
      document.getElementById("scoresSection").style.display = "none";

      document.getElementById("teamNameInput").value = "";
      document.getElementById("inviteCodeInput").value = "";
    });
  }

  /* 編集モーダルボタン */
  document.getElementById("modalClose").addEventListener("click", closeEditModal);
  document.getElementById("saveEdit").addEventListener("click", saveEditGeneric);
  document.getElementById("deleteMatch").addEventListener("click", deleteCurrentMatch);
  document.getElementById("btnMarkGoal").addEventListener("click", addHighlightTop);

  /* 参加 / 作成 */
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
