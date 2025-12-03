/* -------------------------------------------------------
    main.js — 試合種別対応版（wide-btn / ハイライト削除A / 検索 / 秒数クリック再生）
--------------------------------------------------------- */

/* ------------------------------
  初期データ / ユーティリティ
------------------------------ */
let scores = JSON.parse(localStorage.getItem("scores")) || [];
let videos = JSON.parse(localStorage.getItem("videos")) || []; 
window.currentEditIndex = undefined;
let currentSearchQuery = "";

/* 保存ユーティリティ */
function saveAll() {
  localStorage.setItem("scores", JSON.stringify(scores));
  localStorage.setItem("videos", JSON.stringify(videos));
}

/* YouTube ID 抽出 */
function extractYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1);
    if (u.searchParams?.get("v")) return u.searchParams.get("v");
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
  if (!videoSelect) return;

  videoSelect.innerHTML = `<option value="">— 紐づけ動画なし —</option>`;
  videos.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v.id;
    opt.textContent = v.title || v.url;
    videoSelect.appendChild(opt);
  });
}

/* ------------------------------
   YouTube 動画追加
------------------------------ */
function addYouTubeVideo(url) {
  const id = extractYouTubeId(url);
  if (!id) {
    alert("YouTube のURLが正しくありません。例: https://youtu.be/xxxx");
    return;
  }
  if (videos.find(v => v.id === id)) {
    alert("この動画は既に追加済みです。");
    return;
  }
  videos.push({ id, url, title: url });
  saveAll();
  renderVideoSelects();
  alert("YouTube 動画を追加しました（限定公開推奨）");
}

/* ------------------------------
   試合作成（★試合種別追加済）
------------------------------ */
function createMatch() {
  const dateEl = document.getElementById("matchDate");
  const typeEl = document.getElementById("matchTypeCreate"); // ★追加：試合種別
  const oppEl = document.getElementById("opponent");
  const placeEl = document.getElementById("place");
  const myScoreEl = document.getElementById("scoreA");
  const opScoreEl = document.getElementById("scoreB");
  const videoSelect = document.getElementById("videoSelect");

  if (!dateEl || !oppEl) return;

  const date = (dateEl.value || "").trim();
  const matchType = typeEl?.value || "";   // ★追加：種別（公式戦など）
  const opponent = (oppEl.value || "").trim();
  const place = (placeEl?.value || "").trim();
  const myScore = myScoreEl?.value;
  const opponentScore = opScoreEl?.value;
  const videoId = videoSelect?.value || null;

  if (!date || !opponent) return alert("日付と対戦相手は必須です");

  const match = {
    date,
    matchType,  // ★保存
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
  dateEl.value = "";
  if (typeEl) typeEl.value = "";
  oppEl.value = "";
  if (placeEl) placeEl.value = "";
  if (myScoreEl) myScoreEl.value = "";
  if (opScoreEl) opScoreEl.value = "";
  if (videoSelect) videoSelect.value = "";
}

/* ------------------------------
   検索バー生成（自動）
------------------------------ */
function ensureSearchBar() {
  const sec = document.getElementById("scoresSection");
  if (!sec) return;

  if (document.getElementById("scoreSearchBar")) return;

  const input = document.createElement("input");
  input.id = "scoreSearchBar";
  input.className = "search-input";
  input.placeholder = "検索：種別・相手・会場・日付・得点・秒数";
  input.addEventListener("input", (e) => {
    currentSearchQuery = (e.target.value || "").trim().toLowerCase();
    loadScores();
  });

  const h2 = sec.querySelector("h2");
  if (h2) h2.after(input);
}

/* ------------------------------
   検索判定（試合種別も検索対象へ追加）
------------------------------ */
function matchesSearch(it, q) {
  if (!q) return true;
  const s = q.toLowerCase();

  if ((it.matchType || "").toLowerCase().includes(s)) return true;
  if ((it.opponent || "").toLowerCase().includes(s)) return true;
  if ((it.place || "").toLowerCase().includes(s)) return true;
  if ((it.date || "").toLowerCase().includes(s)) return true;

  if (it.myScore !== null && String(it.myScore).includes(s)) return true;
  if (it.opponentScore !== null && String(it.opponentScore).includes(s)) return true;

  if (Array.isArray(it.highlights) && it.highlights.some(h => String(h).includes(s))) return true;

  return false;
}

/* ==========================================================
   スコア一覧描画（★試合種別表示対応）
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

  const filtered = scores
    .map((it, idx) => ({ it, idx }))
    .filter(({ it }) => matchesSearch(it, currentSearchQuery));

  if (!filtered.length) {
    container.innerHTML = `<p class="muted small">検索に一致する試合がありません。</p>`;
    return;
  }

  /* ---- 年月グルーピング ---- */
  const groups = {};
  filtered.forEach(({ it, idx }) => {
    const d = new Date(it.date);
    const cd = isNaN(d) ? new Date(it.createdAt || Date.now()) : d;
    const key = `${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, "0")}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push({ it, idx });
  });

  /* ---- 描画 ---- */
  Object.keys(groups)
    .sort((a, b) => b.localeCompare(a))
    .forEach(key => {
      const group = document.createElement("div");
      group.className = "month card";

      const header = document.createElement("div");
      header.className = "month-header";
      header.innerHTML = `<strong>${key}</strong> <span class="muted small">${groups[key].length} 試合</span>`;
      group.appendChild(header);

      const body = document.createElement("div");
      body.className = "month-body";

      groups[key].forEach(({ it, idx }) => {
        const card = document.createElement("div");
        card.className = "score-card";

        /* 勝敗色 */
        if (typeof it.myScore === "number" && typeof it.opponentScore === "number") {
          if (it.myScore > it.opponentScore) card.classList.add("win");
          else if (it.myScore < it.opponentScore) card.classList.add("lose");
          else card.classList.add("draw");
        }

        /* メイン情報 */
        const meta = document.createElement("div");
        meta.className = "meta";

        meta.innerHTML = `
          <div class="title">${it.date} — ${it.opponent}</div>
          <div class="sub type">【${it.matchType || "未設定"}】</div>
          <div class="sub match-venue">${it.place || ""}</div>
          <div class="sub">Score: ${it.myScore ?? "-"} - ${it.opponentScore ?? "-"}</div>
        `;

        /* ---- ゴールシーン小ボタン ---- */
        if (Array.isArray(it.highlights) && it.highlights.length) {
          const hlWrap = document.createElement("div");
          hlWrap.className = "hl-wrap";

          it.highlights.forEach(sec => {
            const btn = document.createElement("button");
            btn.className = "hl-btn";
            btn.textContent = `ゴールシーン ${sec} 秒`;
            btn.type = "button";

            btn.addEventListener("click", () => {
              if (!it.videoId) return alert("紐づく動画がありません。");
              window.open(`https://youtu.be/${it.videoId}?t=${sec}`, "_blank");
            });

            hlWrap.appendChild(btn);
          });

          meta.appendChild(hlWrap);
        }

        /* ---- 下段のボタン群（横並び） ---- */
        const badge = document.createElement("div");
        badge.className = "badge";

        const actionRow = document.createElement("div");
        actionRow.className = "action-row";

        /* 再生ボタン */
        if (it.videoId) {
          const a = document.createElement("a");
          a.href = `https://youtu.be/${it.videoId}`;
          a.target = "_blank";
          a.className = "wide-btn";
          a.textContent = "試合動画再生";
          actionRow.appendChild(a);
        } else {
          actionRow.appendChild(document.createElement("div"));
        }

        /* 編集ボタン */
        const editBtn = document.createElement("button");
        editBtn.className = "wide-btn";
        editBtn.textContent = "編集";
        editBtn.addEventListener("click", () => {
          openEditModal(
            idx,
            it.date,
            it.matchType || "",
            it.opponent,
            it.place,
            it.myScore,
            it.opponentScore,
            it.highlights || []
          );
        });
        actionRow.appendChild(editBtn);

        /* 削除ボタン */
        const delBtn = document.createElement("button");
        delBtn.className = "wide-btn danger";
        delBtn.textContent = "削除";
        delBtn.addEventListener("click", () => {
          if (!confirm("この試合を削除しますか？")) return;
          scores.splice(idx, 1);
          saveAll();
          loadScores();
        });
        actionRow.appendChild(delBtn);

        badge.appendChild(actionRow);

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
function openEditModal(index, date, matchType, opponent, place, myScore, opponentScore, highlights) {
  window.currentEditIndex = index;

  document.getElementById("edit-date").value = date || "";
  document.getElementById("matchType").value = matchType || "";   // ★追加
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

/* ------------------------------
   編集モーダル：保存（★試合種別追加）
------------------------------ */
function saveEditGeneric() {
  if (window.currentEditIndex === undefined) return;

  const date = document.getElementById("edit-date").value.trim();
  const matchType = document.getElementById("matchType").value.trim();  // ★追加
  const opponent = document.getElementById("edit-opponent").value.trim();
  const place = document.getElementById("edit-place").value.trim();
  const myScoreVal = document.getElementById("edit-my-score").value;
  const opScoreVal = document.getElementById("edit-opponent-score").value;

  /* ハイライト取得 */
  const hlList = document.getElementById("hlList");
  const highlights = [];
  Array.from(hlList.children).forEach(el => {
    const span = el.querySelector("span");
    if (!span) return;
    const n = Number(span.textContent.replace(" 秒", ""));
    if (!isNaN(n)) highlights.push(n);
  });

  scores[window.currentEditIndex] = {
    ...scores[window.currentEditIndex],
    date,
    matchType,  // ★保存
    opponent,
    place,
    myScore: myScoreVal === "" ? null : Number(myScoreVal),
    opponentScore: opScoreVal === "" ? null : Number(opScoreVal),
    highlights
  };

  saveAll();
  loadScores();
  closeEditModal();
  alert("保存しました。");
}

/* 削除 */
function deleteCurrentMatch() {
  if (window.currentEditIndex === undefined) return;
  if (!confirm("この試合を削除しますか？")) return;
  scores.splice(window.currentEditIndex, 1);
  saveAll();
  loadScores();
  closeEditModal();
}

/* ハイライト追加 */
function addHighlightTop() {
  const inp = document.getElementById("hlSeconds");
  const v = inp.value.trim();
  if (!v) return alert("秒数を入力してください");
  document.getElementById("hlList").appendChild(createHlItemElement(Number(v)));
  inp.value = "";
}

/* 閉じる */
function closeEditModal() {
  document.getElementById("editModal").classList.add("hidden");
  window.currentEditIndex = undefined;
}

/* ==========================================================
   ページ読込時
========================================================== */
document.addEventListener("DOMContentLoaded", () => {
  renderVideoSelects();
  loadScores();

  /* 各種イベント登録 */
  document.getElementById("btnAddYouTube")?.addEventListener("click", () => {
    const url = document.getElementById("youtubeUrl").value.trim();
    if (!url) return alert("URLを入力してください");
    addYouTubeVideo(url);
    document.getElementById("youtubeUrl").value = "";
  });

  document.getElementById("btnCreateMatch")?.addEventListener("click", createMatch);

  document.getElementById("modalClose")?.addEventListener("click", closeEditModal);
  document.getElementById("saveEdit")?.addEventListener("click", saveEditGeneric);
  document.getElementById("deleteMatch")?.addEventListener("click", deleteCurrentMatch);
  document.getElementById("btnMarkGoal")?.addEventListener("click", addHighlightTop);

});
