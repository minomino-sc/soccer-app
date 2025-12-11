/* main.js — Firebase 初期化後に安全に動く修正版 */

let scores = [];
let videos = JSON.parse(localStorage.getItem("videos") || "[]");
let collapsedMonths = JSON.parse(localStorage.getItem("collapsedMonths")) || [];
window.currentEditIndex = undefined;
let currentSearchQuery = "";

let currentTeam = null;

/* ------------------------------
   ユーティリティ関数
------------------------------ */
function saveLocalTeam(team) {
  localStorage.setItem("teamInfo", JSON.stringify(team));
  currentTeam = team;
}

function getLocalTeam() {
  if (currentTeam) return currentTeam;
  const t = JSON.parse(localStorage.getItem("teamInfo") || "null");
  currentTeam = t;
  return t;
}

function isAdmin() {
  const t = getLocalTeam();
  return t?.isAdmin === true;
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

/* 種別アイコン・CSSマッピング */
const TYPE_ICON = { "公式戦": "🏆", "カップ戦": "🎖️", "交流戦": "🤝", "": "🏳️" };
function typeClassName(matchType) {
  if (!matchType) return "type-friendly";
  if (matchType === "公式戦") return "type-official";
  if (matchType === "カップ戦") return "type-cup";
  if (matchType === "交流戦") return "type-friendly";
  return "type-friendly";
}

/* ------------------------------
   動画セレクト描画
------------------------------ */
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

/* YouTube動画追加 */
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
  } catch (err) { console.warn("タイトル取得失敗", err); }

  videos.push({ id, url, title });
  localStorage.setItem("videos", JSON.stringify(videos));
  renderVideoSelects();
  alert("YouTube 動画を追加しました！");
}

/* ------------------------------
   チーム参加 / 作成
------------------------------ */
async function joinTeam() {
  const name = (document.getElementById("teamNameInput")?.value || "").trim();
  const code = (document.getElementById("inviteCodeInput")?.value || "").trim().toUpperCase();

  if (!name) return alert("チーム名を入力してください");
  if (!code) return alert("招待コードを入力してください");

  const db = window._firebaseDB;
  const fns = window._firebaseFns;

  if (!db || !fns) {
    alert("Firebaseが初期化されていません");
    return;
  }

  const { collection, getDocs, query, where, doc, setDoc } = fns;

  try {
    const teamsCol = collection(db, "teams");
    const q = query(teamsCol, where("inviteCode", "==", code));
    const snap = await getDocs(q);

    let teamData = null;
    if (snap.empty) {
      const newDocRef = doc(teamsCol);
      teamData = {
        teamName: name,
        inviteCode: code,
        isAdmin: true,
        createdAt: new Date().toISOString()
      };
      await setDoc(newDocRef, teamData);
    } else {
      const docSnap = snap.docs[0];
      teamData = { id: docSnap.id, ...docSnap.data(), isAdmin: false };
    }

    saveLocalTeam(teamData);
    setupUIForTeam(teamData);

    alert(`チーム参加しました！ チーム名: ${teamData.teamName}`);
    await loadScores();
  } catch (err) {
    console.error(err);
    alert("チーム参加に失敗しました\n" + (err.message || err));
  }
}

/* ------------------------------
   UI切替
------------------------------ */
function setupUIForTeam(team) {
  document.getElementById("teamSection").style.display = "none";
  document.getElementById("scoresSection").style.display = "block";
  if (team.isAdmin) {
    document.getElementById("addVideoSection").style.display = "block";
    document.getElementById("createMatchSection").style.display = "block";
  } else {
    document.getElementById("addVideoSection").style.display = "none";
    document.getElementById("createMatchSection").style.display = "none";
  }
  showBackButton();
}

/* ------------------------------
   DOMContentLoadedで初期登録
------------------------------ */
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btnJoin")?.addEventListener("click", joinTeam);
  document.getElementById("btnAddYouTube")?.addEventListener("click", () => {
    const url = (document.getElementById("youtubeUrl")?.value || "").trim();
    if (!url) return alert("URLを入力してください");
    addYouTubeVideo(url);
    document.getElementById("youtubeUrl").value = "";
  });

  document.getElementById("btnCreateMatch")?.addEventListener("click", createMatch);

  // 編集・削除・モーダル関連イベント
  document.getElementById("saveEdit")?.addEventListener("click", saveEdit);
  document.getElementById("deleteMatch")?.addEventListener("click", deleteMatch);
  document.getElementById("modalClose")?.addEventListener("click", closeEditModal);
  document.getElementById("btnMarkGoal")?.addEventListener("click", markGoal);
  document.getElementById("btnBackLogin")?.addEventListener("click", logout);

  renderVideoSelects();

  // teamInfo が残っていれば自動ログイン状態
  const team = getLocalTeam();
  if (team) {
    setupUIForTeam(team);
    loadScores();
  }
});

/* ------------------------------
   試合作成
------------------------------ */
async function createMatch() {
  const db = window._firebaseDB;
  const fns = window._firebaseFns;
  if (!db || !fns) return;

  const team = getLocalTeam();
  if (!team) return alert("チーム情報がありません");

  const { collection, addDoc } = fns;
  const data = {
    matchType: document.getElementById("matchTypeCreate").value,
    date: document.getElementById("matchDate").value,
    opponent: document.getElementById("opponent").value,
    place: document.getElementById("place").value,
    scoreA: Number(document.getElementById("scoreA").value) || 0,
    scoreB: Number(document.getElementById("scoreB").value) || 0,
    pkA: Number(document.getElementById("pkA").value) || 0,
    pkB: Number(document.getElementById("pkB").value) || 0,
    videoId: document.getElementById("videoSelect").value || null,
    hlSeconds: []
  };
  try {
    await addDoc(collection(db, "scores"), data);
    alert("試合を作成しました");
    await loadScores();
  } catch (err) {
    console.error(err);
    alert("試合作成に失敗しました");
  }
}

/* ------------------------------
   スコア読み込み / 描画
------------------------------ */
async function loadScores() {
  const db = window._firebaseDB;
  const fns = window._firebaseFns;
  if (!db || !fns) return;

  const team = getLocalTeam();
  if (!team) return;

  const { collection, getDocs } = fns;

  try {
    const scoresCol = collection(db, "scores");
    const snap = await getDocs(scoresCol);
    scores = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderScores();
  } catch (err) {
    console.error(err);
    alert("スコアの読み込みに失敗しました\n" + (err.message || err));
  }
}

/* ------------------------------
   スコア描画
------------------------------ */
function renderScores() {
  const container = document.getElementById("scoreGroups");
  if (!container) return;
  container.innerHTML = "";

  const filtered = scores.filter(s => {
    if (!currentSearchQuery) return true;
    return (s.opponent || "").toLowerCase().includes(currentSearchQuery.toLowerCase());
  });

  const grouped = {};
  filtered.forEach(s => {
    const month = s.date?.slice(0, 7) || "不明";
    if (!grouped[month]) grouped[month] = [];
    grouped[month].push(s);
  });

  Object.keys(grouped).sort((a, b) => b.localeCompare(a)).forEach(month => {
    const monthDiv = document.createElement("div");
    monthDiv.className = "month-group";

    const header = document.createElement("h3");
    header.textContent = month;
    header.style.cursor = "pointer";
    header.addEventListener("click", () => {
      const idx = collapsedMonths.indexOf(month);
      if (idx >= 0) collapsedMonths.splice(idx, 1);
      else collapsedMonths.push(month);
      localStorage.setItem("collapsedMonths", JSON.stringify(collapsedMonths));
      renderScores();
    });
    monthDiv.appendChild(header);

    if (!collapsedMonths.includes(month)) {
      grouped[month].forEach(s => {
        const row = document.createElement("div");
        row.className = "score-row " + typeClassName(s.matchType || "");
        row.innerHTML = `
          <span class="score-date">${s.date || ""}</span>
          <span class="score-type">${TYPE_ICON[s.matchType || ""] || ""}</span>
          <span class="score-opponent">${s.opponent || ""}</span>
          <span class="score-result">${s.scoreA || 0} - ${s.scoreB || 0}</span>
        `;
        row.addEventListener("click", () => openEditModal(s.id));
        monthDiv.appendChild(row);
      });
    }

    container.appendChild(monthDiv);
  });
}

/* ------------------------------
   編集モーダル関連関数
------------------------------ */
function openEditModal(id) {
  const match = scores.find(s => s.id === id);
  if (!match) return;

  window.currentEditIndex = id;

  document.getElementById("editModal").classList.remove("hidden");
  document.getElementById("matchType").value = match.matchType || "";
  document.getElementById("edit-date").value = match.date || "";
  document.getElementById("edit-opponent").value = match.opponent || "";
  document.getElementById("edit-place").value = match.place || "";
  document.getElementById("edit-my-score").value = match.scoreA || 0;
  document.getElementById("edit-opponent-score").value = match.scoreB || 0;
  document.getElementById("edit-pkA").value = match.pkA || "";
  document.getElementById("edit-pkB").value = match.pkB || "";

  renderVideoSelects(match.videoId);
  renderHLList(match.hlSeconds || []);
}

function renderHLList(seconds) {
  const hlList = document.getElementById("hlList");
  hlList.innerHTML = "";
  seconds.forEach(sec => hlList.appendChild(createHlItemElement(sec)));
}

function createHlItemElement(sec) {
  const div = document.createElement("div");
  div.className = "hl-item";

  const span = document.createElement("span");
  span.textContent = `${sec} 秒`;
  span.dataset.second = sec;
  div.appendChild(span);

  const btn = document.createElement("button");
  btn.textContent = "▶️";
  btn.addEventListener("click", () => {
    const current = scores.find(s => s.id === window.currentEditIndex);
    if (!current?.videoId) return alert("紐づく動画がありません。");
    window.open(`https://youtu.be/${current.videoId}?t=${sec}`, "_blank", "noopener");
  });
  div.appendChild(btn);

  const delBtn = document.createElement("button");
  delBtn.textContent = "✖️";
  delBtn.addEventListener("click", () => div.remove());
  div.appendChild(delBtn);

  return div;
}

function markGoal() {
  const val = Number(document.getElementById("hlSeconds").value);
  if (isNaN(val) || val < 0) return alert("有効な秒数を入力してください");
  document.getElementById("hlList").appendChild(createHlItemElement(val));
  document.getElementById("hlSeconds").value = "";
}

/* ------------------------------
   編集モーダル保存 / 削除
------------------------------ */
async function saveEdit() {
  if (window.currentEditIndex === undefined) return alert("編集中の試合がありません");
  const current = scores.find(s => s.id === window.currentEditIndex);
  if (!current) return alert("試合が見つかりません");

  const db = window._firebaseDB;
  const { doc, updateDoc } = window._firebaseFns;

  const hlList = document.getElementById("hlList");
  const hlSeconds = Array.from(hlList.children).map(c => Number(c.querySelector("span")?.dataset.second || 0));

  const data = {
    matchType: document.getElementById("matchType").value,
    date: document.getElementById("edit-date").value,
    opponent: document.getElementById("edit-opponent").value,
    place: document.getElementById("edit-place").value,
    scoreA: Number(document.getElementById("edit-my-score").value) || 0,
    scoreB: Number(document.getElementById("edit-opponent-score").value) || 0,
    pkA: Number(document.getElementById("edit-pkA").value) || 0,
    pkB: Number(document.getElementById("edit-pkB").value) || 0,
    videoId: document.getElementById("edit-video-select").value || null,
    hlSeconds
  };

  try {
    const ref = doc(db, "scores", current.id);
    await updateDoc(ref, data);
    alert("保存しました");
    closeEditModal();
    await loadScores();
  } catch (err) {
    console.error(err);
    alert("保存に失敗しました");
  }
}

async function deleteMatch() {
  if (window.currentEditIndex === undefined) return alert("編集中の試合がありません");
  if (!confirm("この試合を削除しますか？")) return;

  const current = scores.find(s => s.id === window.currentEditIndex);
  if (!current) return alert("試合が見つかりません");

  const db = window._firebaseDB;
  const { doc, deleteDoc } = window._firebaseFns;

  try {
    const ref = doc(db, "scores", current.id);
    await deleteDoc(ref);
    alert("削除しました");
    closeEditModal();
    await loadScores();
  } catch (err) {
    console.error(err);
    alert("削除に失敗しました");
  }
}

function closeEditModal() {
  document.getElementById("editModal").classList.add("hidden");
  window.currentEditIndex = undefined;
}

/* ------------------------------
   ログアウト
------------------------------ */
function logout() {
  localStorage.removeItem("teamInfo");
  location.reload();
}

/* ------------------------------
   戻るボタン表示補助
------------------------------ */
function showBackButton() {
  const btn = document.getElementById("btnBackLogin");
  if (btn) btn.style.display = "block";
}
