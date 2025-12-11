/* ==========================================================
   Firebase 初期化
========================================================== */
window._firebaseApp = firebase.initializeApp({
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_BUCKET"
});

window._firebaseDB = firebase.firestore();
window._firebaseFns = {
  collection: firebase.firestore().collection.bind(firebase.firestore()),
  doc: firebase.firestore().doc,
  addDoc: (colRef, data) => colRef.add(data),
  updateDoc: (docRef, data) => docRef.update(data),
  deleteDoc: (docRef) => docRef.delete(),
  getDocs: (q) => q.get(),
  query: (...args) => args[0], // Firestore lite 互換
  where: (...args) => args
};

/* ==========================================================
   ローカル動画保存
========================================================== */
let videos = [];

function loadVideosLocal() {
  try {
    const json = localStorage.getItem("videos");
    videos = json ? JSON.parse(json) : [];
  } catch (e) {
    console.error("loadVideosLocal error", e);
    videos = [];
  }
}

function saveVideosLocal() {
  localStorage.setItem("videos", JSON.stringify(videos));
}

/* ==========================================================
   チーム情報
========================================================== */
function getTeam() {
  try {
    const json = localStorage.getItem("teamInfo");
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

/* ==========================================================
   Firestore 動画読み込み
========================================================== */
async function loadVideosFromFirestore() {
  try {
    const team = getTeam();
    if (!team) return;

    const db = window._firebaseDB;
    const col = db.collection("videos");
    const snap = await col
      .where("teamName", "==", team.teamName)
      .where("inviteCode", "==", team.inviteCode)
      .get();

    snap.forEach(doc => {
      const data = doc.data();
      if (!videos.some(v => v.id === doc.id)) {
        videos.push({ id: doc.id, ...data });
      }
    });

    renderVideoSelects();
    saveVideosLocal();
  } catch (e) {
    console.error("loadVideosFromFirestore", e);
  }
}

/* ==========================================================
   YouTube URL を Firestore + Local に保存
========================================================== */
async function addYouTubeVideo(url) {
  const team = getTeam();
  if (!team) return alert("チームにログインしてください");

  const db = window._firebaseDB;
  const col = db.collection("videos");

  const data = {
    url,
    teamName: team.teamName,
    inviteCode: team.inviteCode,
    createdAt: Date.now()
  };

  try {
    const docRef = await col.add(data);
    videos.push({ id: docRef.id, ...data });
    saveVideosLocal();
    renderVideoSelects();
  } catch (e) {
    console.error("Firestore 動画保存失敗", e);

    // fallback ローカル保存
    videos.push({
      id: "local_" + Date.now(),
      ...data
    });
    saveVideosLocal();
    renderVideoSelects();

    alert("動画の保存に失敗しました（Firestore）。ローカルには保存しました。");
  }
}

/* ==========================================================
   動画選択 UI 更新
========================================================== */
function renderVideoSelects() {
  const sel = document.getElementById("videoSelect");
  if (!sel) return;

  sel.innerHTML = "";
  videos.forEach(v => {
    const op = document.createElement("option");
    op.value = v.url;
    op.textContent = v.url;
    sel.appendChild(op);
  });
}

/* ==========================================================
   Firestore 試合作成
========================================================== */
async function createMatch() {
  const team = getTeam();
  if (!team) return alert("チームにログインしてください");

  const home = document.getElementById("homeTeam").value.trim();
  const away = document.getElementById("awayTeam").value.trim();
  const date = document.getElementById("matchDate").value;

  if (!home || !away) return alert("チーム名を入力してください");

  const data = {
    home, away, date,
    teamName: team.teamName,
    inviteCode: team.inviteCode,
    createdAt: Date.now()
  };

  const db = window._firebaseDB;
  const col = db.collection("scores");

  try {
    await col.add(data);
    alert("作成しました");
    await loadScores();
  } catch (e) {
    console.error("試合作成失敗", e);
    alert("試合の保存に失敗しました");
  }
}

/* ==========================================================
   試合削除
========================================================== */
async function deleteCurrentMatch() {
  if (window.currentEditIndex === undefined) return;
  const current = scores[window.currentEditIndex];
  if (!current || !current.id) return alert("IDがありません");

  if (!confirm("削除しますか？")) return;

  const db = window._firebaseDB;

  try {
    await db.collection("scores").doc(current.id).delete();
    alert("削除しました");
    closeEditModal();
    await loadScores();
  } catch (e) {
    console.error("delete error", e);
    alert("削除に失敗しました");
  }
}

/* ==========================================================
   B方式：試合読み込み（一般 + 管理者）
========================================================== */
let scores = [];
let currentSearchQuery = "";

function matchesSearch(it, keyword) {
  if (!keyword) return true;
  keyword = keyword.toLowerCase();
  return (
    (it.home || "").toLowerCase().includes(keyword) ||
    (it.away || "").toLowerCase().includes(keyword)
  );
}

async function loadScores() {
  const container = document.getElementById("scoreGroups");
  if (!container) return;

  ensureSearchBar();
  container.innerHTML = "";

  const team = getTeam();
  if (!team) {
    container.innerHTML = `<p class="muted small">チームにログインしてください。</p>`;
    return;
  }

  try {
    const db = window._firebaseDB;
    const col = db.collection("scores");

    // 🔥 B方式：一般 inviteCode と _ADMIN の両方を取得
    const codeList = [team.inviteCode, team.inviteCode + "_ADMIN"];
    const snap = await col
      .where("teamName", "==", team.teamName)
      .where("inviteCode", "in", codeList)
      .get();

    scores = snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    // 重複除去
    const seen = new Set();
    scores = scores.filter(s => {
      if (!s.id || seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });

    // 日付降順
    scores.sort((a, b) => {
      const da = new Date(a.date || a.createdAt || 0);
      const dbv = new Date(b.date || b.createdAt || 0);
      return dbv - da;
    });

  } catch (e) {
    console.error("loadScores error", e);
    container.innerHTML = "<p>読み込みに失敗しました</p>";
    return;
  }

  if (!scores.length) {
    container.innerHTML = `<p class="muted small">まだ試合がありません。</p>`;
    return;
  }

  const filtered = scores.filter(it => matchesSearch(it, currentSearchQuery));
  if (!filtered.length) {
    container.innerHTML = `<p class="muted small">検索に一致する試合がありません。</p>`;
    return;
  }

  filtered.forEach(buildScoreCard);
}

/* ==========================================================
   チーム参加 / 作成 — チーム名 & 招待コード完全一致チェック
========================================================== */
async function handleJoinTeam() {
  const name = (document.getElementById("teamNameInput")?.value || "").trim();
  const code = (document.getElementById("inviteCodeInput")?.value || "").trim().toUpperCase();

  if (!name) return alert("チーム名を入力してください");
  if (!code) return alert("招待コードを入力してください");

  const db = window._firebaseDB;
  const col = db.collection("teams");

  // 既存確認
  const snap = await col
    .where("teamName", "==", name)
    .get();

  let foundSameName = false;
  let foundSameCode = false;

  snap.forEach(doc => {
    const t = doc.data();
    if (t.inviteCode === code) foundSameCode = true;
    else foundSameName = true;
  });

  if (foundSameName && !foundSameCode) {
    return alert("このチーム名は既に別の招待コードで使用されています。");
  }
  if (!foundSameName && foundSameCode) {
    return alert("この招待コードは既に別のチームで使用されています。");
  }

  // 完全一致 → ログイン
  if (foundSameName && foundSameCode) {
    localStorage.setItem("teamInfo", JSON.stringify({ teamName: name, inviteCode: code }));
    alert("ログインしました");
    showAppSections();
    await loadVideosFromFirestore();
    await loadScores();
    return;
  }

  // 新規登録
  await col.add({
    teamName: name,
    inviteCode: code,
    createdAt: Date.now()
  });

  localStorage.setItem("teamInfo", JSON.stringify({ teamName: name, inviteCode: code }));
  alert("チームを新規作成しました");
  showAppSections();
  await loadScores();
}

/* ==========================================================
   UI 初期化
========================================================== */
function showAppSections() {
  document.getElementById("teamSection").style.display = "none";
  document.getElementById("addVideoSection").style.display = "block";
  document.getElementById("createMatchSection").style.display = "block";
  document.getElementById("scoresSection").style.display = "block";
  document.getElementById("btnBackLogin").style.display = "block";
}

document.addEventListener("DOMContentLoaded", async () => {
  loadVideosLocal();
  await loadVideosFromFirestore();
  await loadScores();

  // 初期 UI
  document.getElementById("btnBackLogin").style.display = "none";
  document.getElementById("addVideoSection").style.display = "none";
  document.getElementById("createMatchSection").style.display = "none";
  document.getElementById("scoresSection").style.display = "none";

  // ボタン
  document.getElementById("btnJoin")?.addEventListener("click", handleJoinTeam);

  document.getElementById("btnAddYouTube")?.addEventListener("click", () => {
    const url = (document.getElementById("youtubeUrl")?.value || "").trim();
    if (!url) return alert("URLを入力してください");
    addYouTubeVideo(url);
    document.getElementById("youtubeUrl").value = "";
  });

  document.getElementById("btnCreateMatch")?.addEventListener("click", createMatch);
  document.getElementById("modalClose")?.addEventListener("click", closeEditModal);
  document.getElementById("saveEdit")?.addEventListener("click", saveEditGeneric);
  document.getElementById("deleteMatch")?.addEventListener("click", deleteCurrentMatch);
  document.getElementById("btnMarkGoal")?.addEventListener("click", addHighlightTop);

  // 戻るボタン
  document.getElementById("btnBackLogin")?.addEventListener("click", () => {
    document.getElementById("teamSection").style.display = "block";
    document.getElementById("addVideoSection").style.display = "none";
    document.getElementById("createMatchSection").style.display = "none";
    document.getElementById("scoresSection").style.display = "none";
    document.getElementById("btnBackLogin").style.display = "none";
    document.getElementById("teamNameInput").value = "";
    document.getElementById("inviteCodeInput").value = "";
  });
});
