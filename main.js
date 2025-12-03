/* main.js — 完全版（自動ログイン ON / 試合種別対応 / wide-btn / ハイライト削除A / 検索 / 秒数クリック再生） */

/* ------------------------------
  初期データ / ユーティリティ
------------------------------ */
let scores = JSON.parse(localStorage.getItem("scores")) || [];
let videos = JSON.parse(localStorage.getItem("videos")) || []; // { id, url, title }
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
   UI表示切替（チーム参加状態）
------------------------------ */
function showAppAfterJoin(team) {
  // teamSection を隠し、メイン機能を表示する
  const teamSection = document.getElementById("teamSection");
  const addVideoSection = document.getElementById("addVideoSection");
  const createMatchSection = document.getElementById("createMatchSection");
  const scoresSection = document.getElementById("scoresSection");

  if (teamSection) teamSection.style.display = "none";
  if (addVideoSection) addVideoSection.style.display = "block";
  if (createMatchSection) createMatchSection.style.display = "block";
  if (scoresSection) scoresSection.style.display = "block";

  // 表示用チーム名
  const currentTeamName = document.getElementById("currentTeamName");
  if (currentTeamName) {
    currentTeamName.textContent = `${team.teamName}（招待コード: ${team.inviteCode || "-"})`;
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
   試合作成（試合種別対応）
------------------------------ */
function createMatch() {
  const dateEl = document.getElementById("matchDate");
  const typeEl = document.getElementById("matchTypeCreate"); // create側の種別セレクト
  const oppEl = document.getElementById("opponent");
  const placeEl = document.getElementById("place");
  const myScoreEl = document.getElementById("scoreA");
  const opScoreEl = document.getElementById("scoreB");
  const videoSelect = document.getElementById("videoSelect");

  if (!dateEl || !oppEl) return;

  const date = (dateEl.value || "").trim();
  const matchType = typeEl?.value || "";
  const opponent = (oppEl.value || "").trim();
  const place = (placeEl?.value || "").trim();
  const myScore = myScoreEl?.value;
  const opponentScore = opScoreEl?.value;
  const videoId = videoSelect?.value || null;

  if (!date || !opponent) return alert("日付と対戦相手は必須です");

  const match = {
    date,
    matchType,
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

  // 既にあるなら何もしない
  if (document.getElementById("scoreSearchBar") || document.getElementById("scoreSearch")) {
    // 既存要素がある場合、イベントが未登録なら登録する（同期対応）
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
  else sec.prepend(input);
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

  if ((it.videoId || "").toLowerCase().includes(s)) return true;

  return false;
}

/* ==========================================================
   スコア一覧描画（試合種別表示対応）
========================================================== */
function loadScores() {
  const container = document.getElementById("scoreGroups");
  if (!container) return;

  ensureSearchBar();

  // sync native search input (#scoreSearch) if present
  const nativeSearch = document.getElementById("scoreSearch");
  if (nativeSearch && !nativeSearch._hasSearchListener) {
    nativeSearch.addEventListener("input", (e) => {
      currentSearchQuery = (e.target.value || "").trim().toLowerCase();
      loadScores();
    });
    nativeSearch._hasSearchListener = true;
  }
  if (nativeSearch) currentSearchQuery = (nativeSearch.value || "").trim().toLowerCase();

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

  const groups = {};
  filtered.forEach(({ it, idx }) => {
    const d = new Date(it.date);
    const cd = isNaN(d) ? new Date(it.createdAt || Date.now()) : d;
    const key = `${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, "0")}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push({ it, idx });
  });

  Object.keys(groups).sort((a, b) => b.localeCompare(a)).forEach(key => {
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

      // 勝敗色
      if (typeof it.myScore === "number" && typeof it.opponentScore === "number") {
        if (it.myScore > it.opponentScore) card.classList.add("win");
        else if (it.myScore < it.opponentScore) card.classList.add("lose");
        else card.classList.add("draw");
      }

      // メイン情報
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.innerHTML = `
        <div class="title">${it.date} — ${it.opponent}</div>
        <div class="sub type">【${it.matchType || "未設定"}】</div>
        <div class="sub match-venue">${it.place || ""}</div>
        <div class="sub">Score: ${it.myScore ?? "-"} - ${it.opponentScore ?? "-"}</div>
      `;

      // ハイライト
      if (Array.isArray(it.highlights) && it.highlights.length) {
        const hlWrap = document.createElement("div");
        hlWrap.className = "hl-wrap";
        it.highlights.forEach(sec => {
          const btn = document.createElement("button");
          btn.className = "hl-btn";
          btn.type = "button";
          btn.textContent = `ゴールシーン ${sec} 秒`;
          btn.addEventListener("click", () => {
            if (!it.videoId) return alert("紐づく動画がありません。");
            const url = `https://youtu.be/${it.videoId}?t=${sec}`;
            window.open(url, "_blank");
          });
          hlWrap.appendChild(btn);
        });
        meta.appendChild(hlWrap);
      }

      // アクション横並び
      const badge = document.createElement("div");
      badge.className = "badge";
      const actionRow = document.createElement("div");
      actionRow.className = "action-row";

      // 再生
      if (it.videoId) {
        const a = document.createElement("a");
        a.href = `https://youtu.be/${it.videoId}`;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.className = "wide-btn";
        a.textContent = "試合動画再生";
        actionRow.appendChild(a);
      } else {
        const spacer = document.createElement("div");
        spacer.style.flex = "1 1 0";
        actionRow.appendChild(spacer);
      }

      // 編集（重要：openEditModal の引数順を合わせる）
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "wide-btn";
      editBtn.textContent = "編集";
      editBtn.addEventListener("click", () => {
        // openEditModal(index, date, matchType, opponent, place, myScore, opponentScore, highlights)
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

      // 削除
      const delBtn = document.createElement("button");
      delBtn.type = "button";
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
   openEditModal(index, date, matchType, opponent, place, myScore, opponentScore, highlights)
========================================================== */
function openEditModal(index, date, matchType, opponent, place, myScore, opponentScore, highlights) {
  window.currentEditIndex = index;

  const elDate = document.getElementById("edit-date");
  const elMatchType = document.getElementById("matchType"); // modal側の select id
  const elOpp = document.getElementById("edit-opponent");
  const elPlace = document.getElementById("edit-place");
  const elMy = document.getElementById("edit-my-score");
  const elOp = document.getElementById("edit-opponent-score");
  const hlList = document.getElementById("hlList");

  if (elDate) elDate.value = date || "";
  if (elMatchType) elMatchType.value = matchType || "";
  if (elOpp) elOpp.value = opponent || "";
  if (elPlace) elPlace.value = place || "";
  if (elMy) elMy.value = myScore ?? "";
  if (elOp) elOp.value = opponentScore ?? "";

  if (hlList) {
    hlList.innerHTML = "";
    (highlights || []).forEach(sec => {
      hlList.appendChild(createHlItemElement(sec));
    });
  }

  const modal = document.getElementById("editModal");
  if (modal) modal.classList.remove("hidden");
}

/* ハイライト要素（✕で削除） */
function createHlItemElement(sec) {
  const wrapper = document.createElement("div");
  wrapper.className = "hl-item";
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.gap = "8px";

  const span = document.createElement("span");
  span.textContent = `${sec} 秒`;
  span.dataset.second = String(sec);

  const del = document.createElement("button");
  del.type = "button";
  del.setAttribute("aria-label", "ハイライト削除");
  del.textContent = "✕";
  del.style.background = "transparent";
  del.style.border = "none";
  del.style.color = "#c00";
  del.style.cursor = "pointer";
  del.style.fontWeight = "700";
  del.addEventListener("click", () => {
    if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
  });

  wrapper.appendChild(span);
  wrapper.appendChild(del);
  return wrapper;
}

/* 保存（編集モーダル） */
function saveEditGeneric() {
  if (window.currentEditIndex === undefined) {
    alert("編集対象が見つかりません。");
    return;
  }

  const date = (document.getElementById("edit-date")?.value || "").trim();
  const matchType = (document.getElementById("matchType")?.value || "").trim();
  const opponent = (document.getElementById("edit-opponent")?.value || "").trim();
  const place = (document.getElementById("edit-place")?.value || "").trim();
  const myScoreVal = document.getElementById("edit-my-score")?.value;
  const opScoreVal = document.getElementById("edit-opponent-score")?.value;

  const hlList = document.getElementById("hlList");
  const highlights = [];
  if (hlList) {
    Array.from(hlList.children).forEach(child => {
      const span = child.querySelector("span");
      const num = span?.dataset?.second ?? (span?.textContent || "");
      const n = Number(String(num).replace(" 秒", "").trim());
      if (!isNaN(n)) highlights.push(n);
    });
  }

  scores[window.currentEditIndex] = {
    ...scores[window.currentEditIndex],
    date,
    matchType,
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

/* 削除（編集モーダル内） */
function deleteCurrentMatch() {
  if (window.currentEditIndex === undefined) return;
  if (!confirm("この試合を削除しますか？")) return;
  scores.splice(window.currentEditIndex, 1);
  saveAll();
  loadScores();
  closeEditModal();
}

/* ハイライト追加（編集モーダル内） */
function addHighlightTop() {
  const inp = document.getElementById("hlSeconds");
  if (!inp) return;
  const v = (inp.value || "").trim();
  if (!v) return alert("秒数を入力してください");
  const list = document.getElementById("hlList");
  if (!list) return;
  list.appendChild(createHlItemElement(Number(v)));
  inp.value = "";
}

/* 閉じるモーダル */
function closeEditModal() {
  const modal = document.getElementById("editModal");
  if (modal && !modal.classList.contains("hidden")) modal.classList.add("hidden");
  window.currentEditIndex = undefined;
}

/* ==========================================================
   DOMContentLoaded — 初期化 / イベント登録
========================================================== */
document.addEventListener("DOMContentLoaded", () => {
  // 初期レンダリング
  renderVideoSelects();

  // 自動ログイン（localStorage.teamInfo があれば自動でアプリ画面へ）
  const storedTeam = (() => {
    try {
      return JSON.parse(localStorage.getItem("teamInfo") || "null");
    } catch (e) {
      return null;
    }
  })();
  if (storedTeam && storedTeam.teamName) {
    // show app
    showAppAfterJoin(storedTeam);
  }

  // 最終的に一覧を描画
  loadScores();

  /* --- YouTube 追加 --- */
  const btnAddYT = document.getElementById("btnAddYouTube");
  if (btnAddYT) {
    btnAddYT.addEventListener("click", () => {
      const url = (document.getElementById("youtubeUrl")?.value || "").trim();
      if (!url) return alert("URLを入力してください");
      addYouTubeVideo(url);
      const el = document.getElementById("youtubeUrl");
      if (el) el.value = "";
    });
  }

  /* --- 試合作成 --- */
  const btnCreateMatch = document.getElementById("btnCreateMatch");
  if (btnCreateMatch) btnCreateMatch.addEventListener("click", createMatch);

  /* --- 参加 / 作成（btnJoin） --- */
  const btnJoin = document.getElementById("btnJoin");
  if (btnJoin) {
    btnJoin.addEventListener("click", () => {
      const name = (document.getElementById("teamNameInput")?.value || "").trim();
      const code = (document.getElementById("inviteCodeInput")?.value || "").trim().toUpperCase();
      if (!name) return alert("チーム名を入力してください");

      const team = { teamName: name, inviteCode: code || null };
      localStorage.setItem("teamInfo", JSON.stringify(team));
      showAppAfterJoin(team);

      alert("チーム参加しました！");
    });
  }

  /* --- 戻る（ログイン画面に戻る） --- */
  const btnBack = document.getElementById("btnBackLogin");
  if (btnBack) {
    btnBack.addEventListener("click", () => {
      const teamSection = document.getElementById("teamSection");
      const addVideoSection = document.getElementById("addVideoSection");
      const createMatchSection = document.getElementById("createMatchSection");
      const scoresSection = document.getElementById("scoresSection");

      if (teamSection) teamSection.style.display = "block";
      if (addVideoSection) addVideoSection.style.display = "none";
      if (createMatchSection) createMatchSection.style.display = "none";
      if (scoresSection) scoresSection.style.display = "none";

      // 入力をクリア（任意）
      const t = document.getElementById("teamNameInput");
      const c = document.getElementById("inviteCodeInput");
      if (t) t.value = "";
      if (c) c.value = "";
    });
  }

  /* --- モーダル操作 --- */
  const modalClose = document.getElementById("modalClose");
  if (modalClose) modalClose.addEventListener("click", closeEditModal);

  const saveEdit = document.getElementById("saveEdit");
  if (saveEdit) saveEdit.addEventListener("click", saveEditGeneric);

  const deleteMatchBtn = document.getElementById("deleteMatch");
  if (deleteMatchBtn) deleteMatchBtn.addEventListener("click", deleteCurrentMatch);

  const btnMarkGoal = document.getElementById("btnMarkGoal");
  if (btnMarkGoal) btnMarkGoal.addEventListener("click", addHighlightTop);
});
