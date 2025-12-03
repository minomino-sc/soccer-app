/* -------------------------------------------------------
    main.js — 完全版（wide-btn 対応 / ハイライト削除A / 検索 / 秒数クリック再生）
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
   試合作成
------------------------------ */
function createMatch() {
  const dateEl = document.getElementById("matchDate");
  const oppEl = document.getElementById("opponent");
  const placeEl = document.getElementById("place");
  const myScoreEl = document.getElementById("scoreA");
  const opScoreEl = document.getElementById("scoreB");
  const videoSelect = document.getElementById("videoSelect");

  if (!dateEl || !oppEl) return;

  const date = (dateEl.value || "").trim();
  const opponent = (oppEl.value || "").trim();
  const place = (placeEl?.value || "").trim();
  const myScore = myScoreEl?.value;
  const opponentScore = opScoreEl?.value;
  const videoId = videoSelect?.value || null;

  if (!date || !opponent) return alert("日付と対戦相手は必須です");

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

  // clear inputs if present
  dateEl.value = "";
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
  if (document.getElementById("scoreSearchBar") || document.getElementById("scoreSearch")) {
    // 既存の検索要素があればイベントをアタッチして同期する
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
  input.placeholder = "検索：相手・会場・日付・得点・ハイライト秒数";
  input.addEventListener("input", (e) => {
    currentSearchQuery = (e.target.value || "").trim().toLowerCase();
    loadScores();
  });

  const h2 = sec.querySelector("h2");
  if (h2) h2.after(input);
  else sec.prepend(input);
}

/* ------------------------------
   検索判定
------------------------------ */
function matchesSearch(it, q) {
  if (!q) return true;
  const s = (q || "").toLowerCase();

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
   スコア一覧描画（action-row / hl-btn 対応）
========================================================== */
function loadScores() {
  const container = document.getElementById("scoreGroups");
  if (!container) return;

  // insert search bar if needed
  ensureSearchBar();

  // if native input id=scoreSearch exists, sync its value into currentSearchQuery
  const native = document.getElementById("scoreSearch");
  if (native && !native._hasSearchListener) {
    native.addEventListener("input", (e) => {
      currentSearchQuery = (e.target.value || "").trim().toLowerCase();
      loadScores();
    });
    native._hasSearchListener = true;
  }
  if (native) currentSearchQuery = (native.value || "").trim().toLowerCase();

  container.innerHTML = "";

  if (!scores.length) {
    container.innerHTML = `<p class="muted small">まだ試合がありません。</p>`;
    return;
  }

  const filtered = scores.map((it, idx) => ({ it, idx })).filter(({ it }) => matchesSearch(it, currentSearchQuery));

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

      // 色分け
      let cls = "";
      if (typeof it.myScore === "number" && typeof it.opponentScore === "number") {
        if (it.myScore > it.opponentScore) cls = "win";
        else if (it.myScore < it.opponentScore) cls = "lose";
        else cls = "draw";
      }
      if (cls) card.classList.add(cls);

      // meta
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.innerHTML = `
        <div class="title">${it.date} — ${it.opponent}</div>
        <div class="sub match-venue">${it.place || ""}</div>
        <div class="sub">Score: ${it.myScore ?? "-"} - ${it.opponentScore ?? "-"}</div>
      `;

      // ハイライト表示（小型ボタン群）
      if (Array.isArray(it.highlights) && it.highlights.length) {
        const hlWrap = document.createElement("div");
        hlWrap.className = "hl-wrap";
        it.highlights.forEach(sec => {
          const btn = document.createElement("button");
          // small class - define .hl-btn in CSS (or combine with .wide-btn if preferred)
          btn.className = "hl-btn";
          btn.textContent = `${sec} 秒`;
          btn.type = "button";

          btn.addEventListener("click", (e) => {
            // open youtube at timestamp
            if (!it.videoId) {
              alert("この試合に紐づく動画がありません。");
              return;
            }
            const url = `https://youtu.be/${it.videoId}?t=${sec}`;
            window.open(url, "_blank");
          });

          hlWrap.appendChild(btn);
        });
        meta.appendChild(hlWrap);
      }

      // right / bottom action area
      const badge = document.createElement("div");
      badge.className = "badge";

      // action-row (horizontal three buttons) - define .action-row in CSS
      const actionRow = document.createElement("div");
      actionRow.className = "action-row";

      // 試合動画再生 (リンク)
      if (it.videoId) {
        const a = document.createElement("a");
        a.href = `https://youtu.be/${it.videoId}`;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.className = "wide-btn";
        a.textContent = "試合動画再生";
        actionRow.appendChild(a);
      } else {
        // 空スペース用の element to keep layout consistent
        const spacer = document.createElement("div");
        spacer.style.flex = "1 1 0";
        actionRow.appendChild(spacer);
      }

      // 編集
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "wide-btn";
      editBtn.textContent = "編集";
      editBtn.addEventListener("click", () => {
        openEditModal(idx, it.date, it.opponent, it.place, it.myScore, it.opponentScore, it.highlights || []);
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
   編集モーダル（下部）関連
========================================================== */
function openEditModal(index, date, opponent, place, myScore, opponentScore, highlights) {
  window.currentEditIndex = index;

  const elDate = document.getElementById("edit-date");
  if (elDate) elDate.value = date || "";
  const elOpp = document.getElementById("edit-opponent");
  if (elOpp) elOpp.value = opponent || "";
  const elPlace = document.getElementById("edit-place");
  if (elPlace) elPlace.value = place || "";
  const elMy = document.getElementById("edit-my-score");
  if (elMy) elMy.value = myScore ?? "";
  const elOp = document.getElementById("edit-opponent-score");
  if (elOp) elOp.value = opponentScore ?? "";

  const hlList = document.getElementById("hlList");
  if (hlList) {
    hlList.innerHTML = "";
    (Array.isArray(highlights) ? highlights : []).forEach(sec => {
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

function closeEditModal() {
  const modal = document.getElementById("editModal");
  if (modal && !modal.classList.contains("hidden")) modal.classList.add("hidden");
  window.currentEditIndex = undefined;
}

/* 保存（編集モーダル） */
function saveEditGeneric() {
  if (window.currentEditIndex === undefined) {
    alert("編集対象が見つかりません。");
    return;
  }

  const date = (document.getElementById("edit-date")?.value || "").trim();
  const opponent = (document.getElementById("edit-opponent")?.value || "").trim();
  const place = (document.getElementById("edit-place")?.value || "").trim();
  const myScoreVal = document.getElementById("edit-my-score")?.value;
  const opScoreVal = document.getElementById("edit-opponent-score")?.value;

  // read hlList
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

  const sA = myScoreVal === "" ? null : Number(myScoreVal);
  const sB = opScoreVal === "" ? null : Number(opScoreVal);

  scores[window.currentEditIndex] = {
    ...scores[window.currentEditIndex],
    date,
    opponent,
    place,
    myScore: sA,
    opponentScore: sB,
    highlights
  };

  saveAll();
  loadScores();
  closeEditModal();
  alert("保存しました。");
}

/* 編集モーダル内での試合削除 */
function deleteCurrentMatch() {
  if (window.currentEditIndex === undefined) return;
  if (!confirm("この試合を削除しますか？")) return;
  scores.splice(window.currentEditIndex, 1);
  saveAll();
  loadScores();
  closeEditModal();
}

/* 編集モーダル：ハイライト追加 */
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

/* ==========================================================
   DOMContentLoaded — イベント登録
========================================================== */
document.addEventListener("DOMContentLoaded", () => {
  renderVideoSelects();
  loadScores();

  // YouTube 追加
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

  // 試合作成
  const btnCreateMatch = document.getElementById("btnCreateMatch");
  if (btnCreateMatch) btnCreateMatch.addEventListener("click", createMatch);

  // 戻る
  const btnBack = document.getElementById("btnBackLogin");
  if (btnBack) {
    btnBack.addEventListener("click", () => {
      const teamSection = document.getElementById("teamSection");
      if (teamSection) teamSection.style.display = "block";
      const addVideoSection = document.getElementById("addVideoSection");
      if (addVideoSection) addVideoSection.style.display = "none";
      const createMatchSection = document.getElementById("createMatchSection");
      if (createMatchSection) createMatchSection.style.display = "none";
      const scoresSection = document.getElementById("scoresSection");
      if (scoresSection) scoresSection.style.display = "none";

      const t = document.getElementById("teamNameInput");
      const c = document.getElementById("inviteCodeInput");
      if (t) t.value = "";
      if (c) c.value = "";
    });
  }

  // モーダルボタン（存在確認して登録）
  const modalClose = document.getElementById("modalClose");
  if (modalClose) modalClose.addEventListener("click", closeEditModal);
  const saveEdit = document.getElementById("saveEdit");
  if (saveEdit) saveEdit.addEventListener("click", saveEditGeneric);
  const deleteMatchBtn = document.getElementById("deleteMatch");
  if (deleteMatchBtn) deleteMatchBtn.addEventListener("click", deleteCurrentMatch);
  const btnMarkGoal = document.getElementById("btnMarkGoal");
  if (btnMarkGoal) btnMarkGoal.addEventListener("click", addHighlightTop);

  // チーム参加
  const btnJoin = document.getElementById("btnJoin");
  if (btnJoin) {
    btnJoin.addEventListener("click", () => {
      const name = (document.getElementById("teamNameInput")?.value || "").trim();
      const code = (document.getElementById("inviteCodeInput")?.value || "").trim().toUpperCase();
      if (!name) return alert("チーム名を入力してください");

      const team = { teamName: name, inviteCode: code || null };
      localStorage.setItem("teamInfo", JSON.stringify(team));

      const teamSection = document.getElementById("teamSection");
      if (teamSection) teamSection.style.display = "none";
      const addVideoSection = document.getElementById("addVideoSection");
      if (addVideoSection) addVideoSection.style.display = "block";
      const createMatchSection = document.getElementById("createMatchSection");
      if (createMatchSection) createMatchSection.style.display = "block";
      const scoresSection = document.getElementById("scoresSection");
      if (scoresSection) scoresSection.style.display = "block";

      const tn = document.getElementById("currentTeamName");
      if (tn) tn.textContent = `${team.teamName}（招待コード: ${team.inviteCode || "-"})`;

      alert("チーム参加しました！");
    });
  }
});
