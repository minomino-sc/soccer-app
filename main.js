/* main.js — チーム情報保持 & Firestore対応版 */

let scores = [];
let videos = [];
let collapsedMonths = [];
window.currentEditIndex = undefined;
let currentSearchQuery = "";

/* =====================
   localStorage 保存ユーティリティ
===================== */
function saveAll() {
  localStorage.setItem("scores", JSON.stringify(scores));
  localStorage.setItem("videos", JSON.stringify(videos));
}

/* チーム情報取得 */
function getTeamInfo() {
  return JSON.parse(localStorage.getItem("teamInfo") || "{}");
}

/* 管理者判定 */
function isAdmin() {
  const team = getTeamInfo();
  return team.inviteCode === "MINO-ADMIN";
}

/* =====================
   YouTube ID 抽出
===================== */
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

function typeClassName(matchType) {
  if (!matchType) return "type-friendly";
  if (matchType === "公式戦") return "type-official";
  if (matchType === "カップ戦") return "type-cup";
  if (matchType === "交流戦") return "type-friendly";
  return "type-friendly";
}

/* =====================
   動画セレクト描画
===================== */
function renderVideoSelects(selectedForEdit) {
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

  const editSel = document.getElementById("edit-video-select");
  if (editSel) {
    editSel.innerHTML = `<option value="">— 紐づけ動画なし —</option>`;
    videos.forEach(v => {
      const opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = v.title || v.url;
      editSel.appendChild(opt);
    });
    editSel.value = selectedForEdit || "";
  }
}

/* YouTube 追加 */
async function addYouTubeVideo(url) {
  const id = extractYouTubeId(url);
  if (!id) return alert("YouTube のURLが正しくありません。");
  if (videos.find(v => v.id === id)) return alert("この動画は既に追加済みです。");

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

  videos.push({ id, url, title });
  saveAll();
  renderVideoSelects();
  alert("YouTube 動画を追加しました！");
}

/* =====================
   試合作成（Firestore対応版）
===================== */
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
    createdAt: new Date().toISOString(),
    teamName: getTeamInfo().teamName || null,
    inviteCode: getTeamInfo().inviteCode || null
  };

  try {
    const db = window._firebaseDB;
    const { collection, addDoc } = window._firebaseFns;

    await addDoc(collection(db, "scores"), match);

    console.log("🔥 Firestore に保存完了:", match);
    alert("Firestore に保存しました！");

    await loadScores();

  } catch (err) {
    console.error("Firestore 保存エラー:", err);
    alert("Firestore 保存でエラーが発生しました");
  }

  // 入力クリア
  dateEl.value = "";
  if (typeEl) typeEl.value = "";
  oppEl.value = "";
  if (placeEl) placeEl.value = "";
  if (myScoreEl) myScoreEl.value = "";
  if (opScoreEl) opScoreEl.value = "";
  if (videoSelect) videoSelect.value = "";
}

/* =====================
   YouTube 再生ボタン作成
===================== */
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

/* =====================
   検索関連
===================== */
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

/* =====================
   チーム情報取得
===================== */
function getTeamInfo() {
  return JSON.parse(localStorage.getItem("teamInfo") || "{}");
}

/* =====================
   管理者判定（チームごとに管理可能）
===================== */
function isAdmin() {
  const team = getTeamInfo();
  return team.inviteCode === "MINO-ADMIN";
}

/* =====================
   スコア一覧描画（Firestore対応版）
===================== */
async function loadScores() {
  const container = document.getElementById("scoreGroups");
  if (!container) return;

  ensureSearchBar();
  container.innerHTML = "";

  const team = getTeamInfo();
  if (!team.inviteCode) {
    container.innerHTML = `<p class="muted small">チーム未選択です。</p>`;
    return;
  }

  try {
    const snap = await window._firebaseFns.getDocs(
      window._firebaseFns.collection(window._firebaseDB, "scores")
    );

    scores = snap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(s => s.teamName === team.teamName && s.inviteCode === team.inviteCode);

    // 重複除外
    const seenIds = new Set();
    scores = scores.filter(s => {
      if (!s.id) return false;
      if (seenIds.has(s.id)) return false;
      seenIds.add(s.id);
      return true;
    });

    // 日付順ソート（新しい順）
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

  // 描画
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

  const groups = {};
  filtered.forEach(({ it, idx }) => {
    const d = new Date(it.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!groups[key]) groups[key] = { items: [] };
    groups[key].items.push({ it, idx });
  });

  container.innerHTML = "";
  Object.keys(groups).sort((a,b)=>b.localeCompare(a)).forEach(key => {
    const group = document.createElement("div");
    group.className = "month card";

    const header = document.createElement("div");
    header.className = "month-header";
    header.innerHTML = `<strong>${key}</strong> <span class="muted small">${groups[key].items.length} 試合</span>`;
    group.appendChild(header);

    const body = document.createElement("div");
    body.className = "month-body";
    if (collapsedMonths.includes(key)) body.classList.add("hidden");
    group.appendChild(body);

    groups[key].items.forEach(({ it, idx }) => {
      const card = document.createElement("div");
      card.className = "score-card";

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.innerHTML =
        `<div class="title">${it.date} — ${it.opponent}</div>` +
        `<div class="sub">得点: ${it.myScore ?? "-"} - ${it.opponentScore ?? "-"}</div>`;

      card.appendChild(meta);

      // アクションボタン
      const actionRow = document.createElement("div");
      actionRow.className = "action-row";

      if (it.videoId) actionRow.appendChild(createPlayButton(it.videoId, null));
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "wide-btn";
      editBtn.textContent = "編集";
      editBtn.addEventListener("click", () => {
        openEditModal(idx, it.date, it.matchType, it.opponent, it.place, it.myScore, it.opponentScore, it.highlights || []);
      });
      actionRow.appendChild(editBtn);

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "wide-btn danger";
      delBtn.textContent = "削除";
      delBtn.addEventListener("click", async () => {
        if (!confirm("この試合を削除しますか？")) return;
        const ref = window._firebaseFns.doc(window._firebaseDB, "scores", it.id);
        await window._firebaseFns.deleteDoc(ref);
        await loadScores();
      });
      actionRow.appendChild(delBtn);

      if (!isAdmin()) {
        editBtn.style.display = "none";
        delBtn.style.display = "none";
      }

      card.appendChild(actionRow);
      body.appendChild(card);
    });

    // 折りたたみ
    header.addEventListener("click", () => {
      body.classList.toggle("hidden");
      if (body.classList.contains("hidden")) {
        if (!collapsedMonths.includes(key)) collapsedMonths.push(key);
      } else {
        collapsedMonths = collapsedMonths.filter(k => k !== key);
      }
      localStorage.setItem("collapsedMonths", JSON.stringify(collapsedMonths));
    });

    container.appendChild(group);
  });
}

/* =====================
   DOMContentLoaded イベント
===================== */
document.addEventListener("DOMContentLoaded", () => {
  renderVideoSelects();
  loadScores();

  document.getElementById("btnJoin")?.addEventListener("click", async () => {
    const name = (document.getElementById("teamNameInput")?.value || "").trim();
    const code = (document.getElementById("inviteCodeInput")?.value || "").trim().toUpperCase();
    if (!name) return alert("チーム名を入力してください");

    const team = { teamName: name, inviteCode: code };
    localStorage.setItem("teamInfo", JSON.stringify(team));

    document.getElementById("teamSection").style.display = "none";
    document.getElementById("scoresSection").style.display = "block";

    if (isAdmin()) {
      document.getElementById("addVideoSection").style.display = "block";
      document.getElementById("createMatchSection").style.display = "block";
    } else {
      document.getElementById("addVideoSection").style.display = "none";
      document.getElementById("createMatchSection").style.display = "none";
    }

    showBackButton();
    await loadScores();
  });
});
