/* main.js — 種別アイコン & 色 & 月集計対応版（完全版）
   機能: 検索 / ハイライト / 秒数クリック再生 / 編集 / 削除 / 種別表示等
*/

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

/* 種別 → アイコンマッピング */
const TYPE_ICON = {
  "公式戦": "🏆",
  "カップ戦": "🎖️",
  "交流戦": "🤝",
  "": "🏳️"
};

/* 種別 → CSS クラス */
function typeClassName(matchType) {
  if (!matchType) return "type-friendly"; // default
  if (matchType === "公式戦") return "type-official";
  if (matchType === "カップ戦") return "type-cup";
  if (matchType === "交流戦") return "type-friendly";
  return "type-friendly";
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

/* YouTube 追加 */
function addYouTubeVideo(url) {
  const id = extractYouTubeId(url);
  if (!id) return alert("YouTube のURLが正しくありません。例: https://youtu.be/xxxx");
  if (videos.find(v => v.id === id)) return alert("この動画は既に追加済みです。");
  videos.push({ id, url, title: url });
  saveAll();
  renderVideoSelects();
  alert("YouTube 動画を追加しました（限定公開推奨）");
}

/* ------------------------------
   試合作成（Firestore 対応版）
------------------------------ */
async function createMatch() {
  const dateEl = document.getElementById("matchDate");
  const typeEl = document.getElementById("matchTypeCreate");
  const oppEl = document.getElementById("opponent");
  const placeEl = document.getElementById("place");
  const myScoreEl = document.getElementById("scoreA");
  const opScoreEl = document.getElementById("scoreB");
  const videoSelect = document.getElementById("videoSelect");

  if (!dateEl || !oppEl) return;

  const date = (dateEl.value || "").trim();
  const matchType = (typeEl?.value || "").trim();
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

  /* Firestore 保存 */
  try {
    const db = window._firebaseDB;
    const { collection, addDoc } = window._firebaseFns;

    await addDoc(collection(db, "scores"), match);

    console.log("🔥 Firestore に保存完了:", match);
    alert("Firestore に保存しました！");

  } catch (err) {
    console.error("Firestore 保存エラー:", err);
    alert("Firestore 保存でエラーが発生しました");
  }

  /* 入力クリア */
  dateEl.value = "";
  if (typeEl) typeEl.value = "";
  oppEl.value = "";
  if (placeEl) placeEl.value = "";
  if (myScoreEl) myScoreEl.value = "";
  if (opScoreEl) opScoreEl.value = "";
  if (videoSelect) videoSelect.value = "";
}

/* ------------------------------
   検索バー挿入
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

/* 検索判定 */
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

/* helper: create play button (opens youtube with no time or at time) */
function createPlayButton(videoId, timeSec) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "wide-btn";
  btn.textContent = timeSec ? `再生 (${timeSec}s)` : "試合動画再生";
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!videoId) return alert("紐づく動画がありません。");
    const url = timeSec ? `https://youtu.be/${videoId}?t=${timeSec}` : `https://youtu.be/${videoId}`;
    window.open(url, "_blank", "noopener");
  });
  return btn;
}

/* ==========================================================
   スコア一覧描画（種別色・アイコン・月集計対応）
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

  const filtered = scores.map((it, idx) => ({ it, idx })).filter(({ it }) => matchesSearch(it, currentSearchQuery));
  if (!filtered.length) {
    container.innerHTML = `<p class="muted small">検索に一致する試合がありません。</p>`;
    return;
  }

  // grouped by year-month, and also compute per-type counts for header
  const groups = {};
  filtered.forEach(({ it, idx }) => {
    const d = new Date(it.date);
    const cd = isNaN(d) ? new Date(it.createdAt || Date.now()) : d;
    const key = `${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, "0")}`;
    if (!groups[key]) groups[key] = { items: [], counts: { "公式戦":0, "カップ戦":0, "交流戦":0, "未設定":0 } };
    groups[key].items.push({ it, idx });
    const mt = it.matchType || "未設定";
    if (mt === "公式戦") groups[key].counts["公式戦"]++;
    else if (mt === "カップ戦") groups[key].counts["カップ戦"]++;
    else if (mt === "交流戦") groups[key].counts["交流戦"]++;
    else groups[key].counts["未設定"]++;
  });

  Object.keys(groups).sort((a,b) => b.localeCompare(a)).forEach(key => {
    const group = document.createElement("div");
    group.className = "month card";

    const header = document.createElement("div");
    header.className = "month-header";
    const c = groups[key].counts;
    const aggText = `(${TYPE_ICON["公式戦"]}${c["公式戦"]} ${TYPE_ICON["カップ戦"]}${c["カップ戦"]} ${TYPE_ICON["交流戦"]}${c["交流戦"]})`;
    header.innerHTML = `<strong>${key}</strong> <span class="muted small">${groups[key].items.length} 試合</span> <span class="agg">${aggText}</span>`;
    group.appendChild(header);

    const body = document.createElement("div");
    body.className = "month-body";

    groups[key].items.forEach(({ it, idx }) => {
      const card = document.createElement("div");
      card.className = "score-card";

      // 勝敗色（従来）
      if (typeof it.myScore === "number" && typeof it.opponentScore === "number") {
        if (it.myScore > it.opponentScore) card.classList.add("win");
        else if (it.myScore < it.opponentScore) card.classList.add("lose");
        else card.classList.add("draw");
      }

      // メタ情報（アイコン表示）
      const meta = document.createElement("div");
      meta.className = "meta";

      const icon = TYPE_ICON[it.matchType || ""] || "🏳️";
      const typeClass = typeClassName(it.matchType || "");
      // title with icon
      const titleDiv = document.createElement("div");
      titleDiv.className = "title";
      titleDiv.innerHTML = `<span class="type-icon ${typeClass}">${icon}</span> ${it.date} — ${it.opponent}`;

      // type badge
      const typeBadge = document.createElement("div");
      typeBadge.className = `type-badge ${typeClass}`;
      typeBadge.textContent = it.matchType || "未設定";

      const placeDiv = document.createElement("div");
      placeDiv.className = "sub match-venue";
      placeDiv.textContent = it.place || "";

      const scoreDiv = document.createElement("div");
      scoreDiv.className = "sub";
      scoreDiv.textContent = `Score: ${it.myScore ?? "-"} - ${it.opponentScore ?? "-"}`;

      meta.appendChild(titleDiv);
      meta.appendChild(typeBadge);
      meta.appendChild(placeDiv);
      meta.appendChild(scoreDiv);

      // ハイライト（小ボタン）
      if (Array.isArray(it.highlights) && it.highlights.length) {
        const hlWrap = document.createElement("div");
        hlWrap.className = "hl-wrap";
        it.highlights.forEach(sec => {
          const btn = document.createElement("button");
          btn.className = "hl-btn";
          btn.type = "button";
          btn.textContent = `ゴールシーン ${sec} 秒`;
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (!it.videoId) return alert("紐づく動画がありません。");
            const url = `https://youtu.be/${it.videoId}?t=${sec}`;
            window.open(url, "_blank", "noopener");
          });
          hlWrap.appendChild(btn);
        });
        meta.appendChild(hlWrap);
      }

      // action row (横並び) - ensure these are inside the card
      const badge = document.createElement("div");
      badge.className = "badge";
      const actionRow = document.createElement("div");
      actionRow.className = "action-row";

      // Play button (use createPlayButton to ensure consistent behavior)
      if (it.videoId) {
        const playBtn = createPlayButton(it.videoId, null);
        actionRow.appendChild(playBtn);
      } else {
        // if no video, keep a spacer so layout stays even
        const spacer = document.createElement("div");
        spacer.style.flex = "1 1 0";
        actionRow.appendChild(spacer);
      }

      // 編集ボタン
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "wide-btn";
      editBtn.textContent = "編集";
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openEditModal(idx, it.date, it.matchType || "", it.opponent, it.place, it.myScore, it.opponentScore, it.highlights || []);
      });
      actionRow.appendChild(editBtn);

      // 削除ボタン
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "wide-btn danger";
      delBtn.textContent = "削除";
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!confirm("この試合を削除しますか？")) return;
        scores.splice(idx, 1);
        saveAll();
        loadScores();
      });
      actionRow.appendChild(delBtn);

      badge.appendChild(actionRow);

      // append meta and badge INTO card (ensures action-row is inside score-card)
      card.appendChild(meta);
      card.appendChild(badge);
      body.appendChild(card);
    });

    group.appendChild(body);
    container.appendChild(group);
  });
}

/* ==========================================================
   編集モーダル関連
========================================================== */
function openEditModal(index, date, matchType, opponent, place, myScore, opponentScore, highlights) {
  window.currentEditIndex = index;
  const elDate = document.getElementById("edit-date");
  if (elDate) elDate.value = date || "";
  const mtEl = document.getElementById("matchType");
  if (mtEl) mtEl.value = matchType || "";
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

/* ハイライト要素作成 */
function createHlItemElement(sec) {
  const wrapper = document.createElement("div");
  wrapper.className = "hl-item";
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.gap = "8px";
  const sp = document.createElement("span");
  sp.textContent = `${sec} 秒`;
  sp.dataset.second = String(sec);
  const del = document.createElement("button");
  del.type = "button";
  del.textContent = "✕";
  del.style.border = "none";
  del.style.background = "transparent";
  del.style.color = "#c00";
  del.style.cursor = "pointer";
  del.addEventListener("click", () => wrapper.remove());
  wrapper.appendChild(sp);
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
  if (window.currentEditIndex === undefined) { alert("編集対象が見つかりません。"); return; }

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
      if (!span) return;
      const n = Number(String(span.dataset.second || span.textContent).replace(" 秒", "").trim());
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

/* ハイライト追加（編集モーダル） */
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

/* DOMContentLoaded: イベント登録 */
document.addEventListener("DOMContentLoaded", () => {
  renderVideoSelects();
  loadScores();

  document.getElementById("btnAddYouTube")?.addEventListener("click", () => {
    const url = (document.getElementById("youtubeUrl")?.value || "").trim();
    if (!url) return alert("URLを入力してください");
    addYouTubeVideo(url);
    const el = document.getElementById("youtubeUrl");
    if (el) el.value = "";
  });

  document.getElementById("btnCreateMatch")?.addEventListener("click", createMatch);

  document.getElementById("btnBackLogin")?.addEventListener("click", () => {
    const team = document.getElementById("teamSection"); if (team) team.style.display = "block";
    const addVideo = document.getElementById("addVideoSection"); if (addVideo) addVideo.style.display = "none";
    const create = document.getElementById("createMatchSection"); if (create) create.style.display = "none";
    const scoresSec = document.getElementById("scoresSection"); if (scoresSec) scoresSec.style.display = "none";
    const t = document.getElementById("teamNameInput"); if (t) t.value = "";
    const c = document.getElementById("inviteCodeInput"); if (c) c.value = "";
  });

  document.getElementById("modalClose")?.addEventListener("click", closeEditModal);
  document.getElementById("saveEdit")?.addEventListener("click", saveEditGeneric);
  document.getElementById("deleteMatch")?.addEventListener("click", deleteCurrentMatch);
  document.getElementById("btnMarkGoal")?.addEventListener("click", addHighlightTop);

  document.getElementById("btnJoin")?.addEventListener("click", () => {
    const name = (document.getElementById("teamNameInput")?.value || "").trim();
    const code = (document.getElementById("inviteCodeInput")?.value || "").trim().toUpperCase();
    if (!name) return alert("チーム名を入力してください");
    const team = { teamName: name, inviteCode: code || null };
    localStorage.setItem("teamInfo", JSON.stringify(team));
    document.getElementById("teamSection").style.display = "none";
    document.getElementById("addVideoSection").style.display = "block";
    document.getElementById("createMatchSection").style.display = "block";
    document.getElementById("scoresSection").style.display = "block";
    const tn = document.getElementById("currentTeamName"); if (tn) tn.textContent = `${team.teamName}（招待コード: ${team.inviteCode || "-"})`;
    alert("チーム参加しました！");
  });
});
