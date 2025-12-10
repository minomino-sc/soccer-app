/* main.js — Firestore専用版（完全版） */

let scores = [];
let videos = [];
let collapsedMonths = JSON.parse(localStorage.getItem("collapsedMonths")) || [];
window.currentEditIndex = undefined;
let currentSearchQuery = "";

/* 管理者判定 */
function isAdmin() {
  const team = JSON.parse(localStorage.getItem("teamInfo") || "{}");
  return team.inviteCode === "MINO-ADMIN";
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
  if (!matchType) return "type-friendly"; 
  if (matchType === "公式戦") return "type-official";
  if (matchType === "カップ戦") return "type-cup";
  if (matchType === "交流戦") return "type-friendly";
  return "type-friendly";
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

/* YouTube再生ボタン作成 */
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

/* ------------------------------
   Firestoreからスコア読み込み・描画
------------------------------ */
async function loadScores() {
  const container = document.getElementById("scoreGroups");
  if (!container) return;

  // 検索バー確保
  ensureSearchBar();
  container.innerHTML = "";

  try {
    const snap = await window._firebaseFns.getDocs(
      window._firebaseFns.collection(window._firebaseDB, "scores")
    );

    scores = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    // 🔽 FirestoreのID重複除外
    const seenIds = new Set();
    scores = scores.filter(s => {
      if (!s.id) return false;
      if (seenIds.has(s.id)) return false;
      seenIds.add(s.id);
      return true;
    });

    // 🔽 同じ日 & 相手 & 会場の重複除外
    const seenKeys = new Set();
    scores = scores.filter(s => {
      const key = `${s.date}||${s.opponent}||${s.place}`;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });

    // 日付順にソート（新しい順）
    scores.sort((a, b) => new Date(b.date) - new Date(a.date));

  } catch (e) {
    console.error("Firestore 読み込み失敗:", e);
    container.innerHTML = `<p class="muted small">データの読み込みに失敗しました。</p>`;
    return;
  }

  if (!scores.length) {
    container.innerHTML = `<p class="muted small">まだ試合がありません。</p>`;
    return;
  }

  // フィルタリング
  const filteredMap = {};
  scores.forEach((s, idx) => {
    if (!matchesSearch(s, currentSearchQuery)) return;
    filteredMap[s.id] = { it: s, idx };
  });
  const filtered = Object.values(filteredMap);

  if (!filtered.length) {
    container.innerHTML = `<p class="muted small">検索に一致する試合がありません。</p>`;
    return;
  }

  // 月別グループ作成
  const groups = {};
  filtered.forEach(({ it, idx }) => {
    const d = new Date(it.date);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;

    if (!groups[key])
      groups[key] = { items: [], counts: { "公式戦":0, "カップ戦":0, "交流戦":0, "未設定":0 } };

    groups[key].items.push({ it, idx });

    let mt = it.matchType;
    if (!mt || mt === "") mt = "未設定";
    groups[key].counts[mt]++;
  });

  // 描画
  container.innerHTML = "";
  Object.keys(groups).sort((a,b)=>b.localeCompare(a)).forEach(key => {
    const group = document.createElement("div");
    group.className = "month card";

    const c = groups[key].counts;
    const aggText =
      `(${TYPE_ICON["公式戦"]}${c["公式戦"]} ` +
      `${TYPE_ICON["カップ戦"]}${c["カップ戦"]} ` +
      `${TYPE_ICON["交流戦"]}${c["交流戦"]})`;

    const header = document.createElement("div");
    header.className = "month-header";
    header.innerHTML =
      `<strong>${key}</strong> `+
      `<span class="muted small">${groups[key].items.length} 試合</span> `+
      `<span class="agg">${aggText}</span>`;
    group.appendChild(header);

    const body = document.createElement("div");
    body.className = "month-body";

    // 折りたたみ状態
    if (collapsedMonths.includes(key)) {
      body.classList.add("hidden");
      header.classList.add("closed");
    } else {
      header.classList.add("open");
    }

    // 個別試合描画
    groups[key].items.forEach(({it,idx})=>{
      const card = document.createElement("div");
      card.className = "score-card";

      // 勝敗色
      if (typeof it.myScore === "number" && typeof it.opponentScore === "number") {
        if (it.myScore > it.opponentScore) card.classList.add("win");
        else if (it.myScore < it.opponentScore) card.classList.add("lose");
        else card.classList.add("draw");
      }

      const meta = document.createElement("div");
      meta.className = "meta";

      const icon = TYPE_ICON[it.matchType || ""] || "🏳️";
      const typeClass = typeClassName(it.matchType || "");

      meta.innerHTML =
        `<div class="title">`+
        `<span class="type-icon ${typeClass}">${icon}</span> `+
        `${it.date} — ${it.opponent}`+
        `</div>`+
        `<div class="type-badge ${typeClass}">${it.matchType || "未設定"}</div>`+
        `<div class="sub match-venue">${it.place || ""}</div>`+
        `<div class="sub">得点: ${it.myScore ?? "-"} - ${it.opponentScore ?? "-"}</div>`;

      card.appendChild(meta);

      // ハイライトボタン
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

      card.appendChild(createActionRow(it, idx));

      body.appendChild(card);
    });

    group.appendChild(body);
    container.appendChild(group);

    // 折りたたみイベント
    header.addEventListener("click", () => {
      body.classList.toggle("hidden");
      const isHidden = body.classList.contains("hidden");
      if (isHidden) {
        header.classList.remove("open");
        header.classList.add("closed");
        if (!collapsedMonths.includes(key)) collapsedMonths.push(key);
      } else {
        header.classList.remove("closed");
        header.classList.add("open");
        collapsedMonths = collapsedMonths.filter(k => k !== key);
      }
      localStorage.setItem("collapsedMonths", JSON.stringify(collapsedMonths));
    });

  }); // forEach(key)
}

/* ------------------------------
   アクション行（編集・削除・再生）作成
------------------------------ */
function createActionRow(it, idx) {
  const actionRow = document.createElement("div");
  actionRow.className = "action-row";

  // 再生ボタン
  if (it.videoId) {
    const playBtn = createPlayButton(it.videoId, null);
    actionRow.appendChild(playBtn);
  } else {
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
    const pass = prompt("編集にはパスワードが必要です。入力してください：");
    if (pass !== "mino2025") return alert("パスワードが違います");
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

  // 削除ボタン
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "wide-btn danger";
  delBtn.textContent = "削除";
  delBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const pass = prompt("削除にはパスワードが必要です。入力してください：");
    if (pass !== "mino2025") return alert("パスワードが違います");
    if (!confirm("この試合を削除しますか？")) return;

    if (!it.id) return alert("Firestore のIDが存在しません。");

    try {
      const ref = window._firebaseFns.doc(window._firebaseDB, "scores", it.id);
      await window._firebaseFns.deleteDoc(ref);
      alert("Firestore から削除しました");
      await loadScores();
    } catch (err) {
      console.error("Firestore削除エラー:", err);
      alert("Firestore の削除に失敗しました");
    }
  });
  actionRow.appendChild(delBtn);

  // 管理者以外は編集・削除非表示
  if (!isAdmin()) {
    editBtn.style.display = "none";
    delBtn.style.display = "none";
  }

  return actionRow;
}

/* ------------------------------
   編集モーダル関連
------------------------------ */
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

  // ハイライト表示
  const hlList = document.getElementById("hlList");
  if (hlList) {
    hlList.innerHTML = "";
    (Array.isArray(highlights) ? highlights : []).forEach(sec => {
      hlList.appendChild(createHlItemElement(sec));
    });
  }

  // 動画セレクト反映
  renderVideoSelects(scores[index]?.videoId);

  const modal = document.getElementById("editModal");
  if (modal) modal.classList.remove("hidden");
}

function closeEditModal() {
  const modal = document.getElementById("editModal");
  if (modal && !modal.classList.contains("hidden")) modal.classList.add("hidden");
  window.currentEditIndex = undefined;
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

/* ------------------------------
   編集モーダル保存
------------------------------ */
async function saveEditGeneric() {
  if (window.currentEditIndex === undefined) return alert("編集対象が見つかりません。");

  const current = scores[window.currentEditIndex];
  if (!current.id) return alert("Firestore のIDがありません（不整合）");

  const date = (document.getElementById("edit-date")?.value || "").trim();
  const matchType = (document.getElementById("matchType")?.value || "").trim();
  const opponent = (document.getElementById("edit-opponent")?.value || "").trim();
  const place = (document.getElementById("edit-place")?.value || "").trim();
  const myScoreVal = document.getElementById("edit-my-score")?.value;
  const opScoreVal = document.getElementById("edit-opponent-score")?.value;

  // 動画セレクト
  const videoSelect = document.getElementById("edit-video-select");
  const videoId = videoSelect?.value || null;

  // ハイライト取得
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

  // Firestore更新
  try {
    const ref = window._firebaseFns.doc(window._firebaseDB, "scores", current.id);
    await window._firebaseFns.updateDoc(ref, {
      date,
      matchType,
      opponent,
      place,
      myScore: myScoreVal === "" ? null : Number(myScoreVal),
      opponentScore: opScoreVal === "" ? null : Number(opScoreVal),
      highlights,
      videoId
    });

    alert("Firestore に保存しました！");
    closeEditModal();
    await loadScores();
  } catch (err) {
    console.error("Firestore 更新エラー:", err);
    alert("Firestore の更新に失敗しました。");
  }
}

/* ------------------------------
   編集モーダル削除
------------------------------ */
async function deleteCurrentMatch() {
  if (window.currentEditIndex === undefined) return;
  if (!confirm("この試合を削除しますか？")) return;

  const current = scores[window.currentEditIndex];
  if (!current.id) return alert("Firestore のIDが存在しません。");

  try {
    const ref = window._firebaseFns.doc(window._firebaseDB, "scores", current.id);
    await window._firebaseFns.deleteDoc(ref);

    alert("Firestore から削除しました");
    closeEditModal();
    await loadScores();
  } catch (err) {
    console.error("Firestore 削除エラー:", err);
    alert("Firestore の削除に失敗しました");
  }
}

/* ------------------------------
   YouTube動画追加（Firestore保存）
------------------------------ */
async function addYouTubeVideo(url) {
  const id = extractYouTubeId(url);
  if (!id) return alert("YouTube のURLが正しくありません。");

  if (videos.find(v => v.id === id)) return alert("この動画は既に追加済みです。");

  // タイトル取得
  let title = url;
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://youtu.be/${id}&format=json`);
    if (res.ok) {
      const data = await res.json();
      title = data.title;
    }
  } catch (err) {
    console.warn("タイトル取得に失敗", err);
  }

  const video = { id, url, title, createdAt: new Date().toISOString() };

  try {
    const col = window._firebaseFns.collection(window._firebaseDB, "videos");
    await window._firebaseFns.addDoc(col, video);

    console.log("Firestoreに動画保存完了:", video);
    alert("YouTube動画を追加しました！");
    await loadVideosFromFirestore();
  } catch (err) {
    console.error("Firestore保存エラー:", err);
    alert("Firestoreへの保存に失敗しました");
  }
}

/* ==========================================================
   初期ロード & DOMContentLoaded
========================================================== */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Firestoreから動画・スコア読み込み
    await loadVideosFromFirestore();
    await loadScores();

    // 「ログイン画面に戻る」ボタン初期非表示
    const btnBack = document.getElementById("btnBackLogin");
    if (btnBack) btnBack.style.display = "none";

    // 管理画面初期非表示
    document.getElementById("addVideoSection").style.display = "none";
    document.getElementById("createMatchSection").style.display = "none";
    document.getElementById("scoresSection").style.display = "none";

    // -----------------------------
    // 各ボタンイベント登録
    // -----------------------------
    document.getElementById("btnAddYouTube")?.addEventListener("click", async () => {
      const url = (document.getElementById("youtubeUrl")?.value || "").trim();
      if (!url) return alert("URLを入力してください");
      await addYouTubeVideo(url);
      document.getElementById("youtubeUrl").value = "";
    });

    document.getElementById("btnCreateMatch")?.addEventListener("click", createMatch);

    document.getElementById("btnBackLogin")?.addEventListener("click", () => {
      document.getElementById("teamSection").style.display = "block";
      document.getElementById("addVideoSection").style.display = "none";
      document.getElementById("createMatchSection").style.display = "none";
      document.getElementById("scoresSection").style.display = "none";
      document.getElementById("teamNameInput").value = "";
      document.getElementById("inviteCodeInput").value = "";
      btnBack.style.display = "none";
    });

    document.getElementById("modalClose")?.addEventListener("click", closeEditModal);
    document.getElementById("saveEdit")?.addEventListener("click", saveEditGeneric);
    document.getElementById("deleteMatch")?.addEventListener("click", deleteCurrentMatch);
    document.getElementById("btnMarkGoal")?.addEventListener("click", addHighlightTop);

    // -----------------------------
    // チーム参加ボタン
    // -----------------------------
    document.getElementById("btnJoin")?.addEventListener("click", async () => {
      const name = (document.getElementById("teamNameInput")?.value || "").trim();
      const code = (document.getElementById("inviteCodeInput")?.value || "").trim().toUpperCase();
      if (!name) return alert("チーム名を入力してください");

      const team = { teamName: name, inviteCode: code || null };
      localStorage.setItem("teamInfo", JSON.stringify(team));

      // UI切替
      document.getElementById("teamSection").style.display = "none";
      document.getElementById("scoresSection").style.display = "block";

      // 管理者判定
      if (isAdmin()) {
        document.getElementById("addVideoSection").style.display = "block";
        document.getElementById("createMatchSection").style.display = "block";
      } else {
        document.getElementById("addVideoSection").style.display = "none";
        document.getElementById("createMatchSection").style.display = "none";
      }

      // チーム名表示
      const tn = document.getElementById("currentTeamName");
      if (tn) tn.textContent = `${team.teamName}（招待コード: ${team.inviteCode || "-"})`;

      alert("チーム参加しました！");
      showBackButton();
    });

  } catch (err) {
    console.error("初期ロードエラー:", err);
    alert("初期データの読み込みに失敗しました");
  }
});

/* ==========================================================
   編集モーダル関連（Firestore対応）
========================================================== */
function openEditModal(index, date, matchType, opponent, place, myScore, opponentScore, highlights, videoId) {
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

  // 編集モーダルの動画セレクトも反映
  renderVideoSelects(videoId);

  // ハイライトリスト
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

function closeEditModal() {
  const modal = document.getElementById("editModal");
  if (modal && !modal.classList.contains("hidden")) modal.classList.add("hidden");
  window.currentEditIndex = undefined;
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

/* 編集モーダル 保存 */
async function saveEditGeneric() {
  if (window.currentEditIndex === undefined) {
    alert("編集対象が見つかりません。");
    return;
  }

  const current = scores[window.currentEditIndex];
  if (!current.id) {
    alert("Firestore のIDがありません");
    return;
  }

  const date = (document.getElementById("edit-date")?.value || "").trim();
  const matchType = (document.getElementById("matchType")?.value || "").trim();
  const opponent = (document.getElementById("edit-opponent")?.value || "").trim();
  const place = (document.getElementById("edit-place")?.value || "").trim();
  const myScoreVal = document.getElementById("edit-my-score")?.value;
  const opScoreVal = document.getElementById("edit-opponent-score")?.value;

  const videoSelect = document.getElementById("edit-video-select");
  const videoId = videoSelect?.value || null;

  // ハイライト取得
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

  try {
    const ref = window._firebaseFns.doc(window._firebaseDB, "scores", current.id);
    await window._firebaseFns.updateDoc(ref, {
      date,
      matchType,
      opponent,
      place,
      myScore: myScoreVal === "" ? null : Number(myScoreVal),
      opponentScore: opScoreVal === "" ? null : Number(opScoreVal),
      highlights,
      videoId
    });

    alert("Firestore に保存しました！");
    closeEditModal();
    await loadScores();

  } catch (err) {
    console.error("Firestore 更新エラー:", err);
    alert("Firestore の更新に失敗しました");
  }
}

/* 編集モーダル 削除 */
async function deleteCurrentMatch() {
  if (window.currentEditIndex === undefined) return;
  if (!confirm("この試合を削除しますか？")) return;

  const current = scores[window.currentEditIndex];
  if (!current.id) {
    alert("Firestore のIDがありません");
    return;
  }

  try {
    const ref = window._firebaseFns.doc(window._firebaseDB, "scores", current.id);
    await window._firebaseFns.deleteDoc(ref);

    alert("Firestore から削除しました");
    closeEditModal();
    await loadScores();

  } catch (err) {
    console.error("Firestore 削除エラー:", err);
    alert("Firestore の削除に失敗しました");
  }
}

/* 編集モーダル ハイライト追加 */
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
   Firestore 対応 YouTube動画追加
========================================================== */
async function loadVideosFromFirestore() {
  try {
    const snap = await window._firebaseFns.getDocs(
      window._firebaseFns.collection(window._firebaseDB, "videos")
    );
    videos = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    renderVideoSelects();

  } catch (err) {
    console.error("Firestore 動画取得エラー:", err);
  }
}

async function addYouTubeVideo(url) {
  const id = extractYouTubeId(url);
  if (!id) return alert("YouTube のURLが正しくありません");

  if (videos.find(v => v.id === id)) return alert("この動画は既に追加済みです");

  // タイトル取得
  let title = url;
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://youtu.be/${id}&format=json`);
    if (res.ok) {
      const data = await res.json();
      title = data.title;
    }
  } catch (err) {
    console.warn("タイトル取得に失敗", err);
  }

  const video = { id, url, title, createdAt: new Date().toISOString() };

  try {
    const col = window._firebaseFns.collection(window._firebaseDB, "videos");
    await window._firebaseFns.addDoc(col, video);

    console.log("Firestoreに動画保存完了:", video);
    alert("YouTube動画を追加しました！");
    await loadVideosFromFirestore();

  } catch (err) {
    console.error("Firestore保存エラー:", err);
    alert("Firestoreへの保存に失敗しました");
  }
}
