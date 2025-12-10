let scores = JSON.parse(localStorage.getItem("scores")) || [];
let videos = JSON.parse(localStorage.getItem("videos")) || [];
let collapsedMonths = JSON.parse(localStorage.getItem("collapsedMonths")) || [];
window.currentEditIndex = undefined;
let currentSearchQuery = "";

/* 保存ユーティリティ */
function saveAll() {
  localStorage.setItem("scores", JSON.stringify(scores));
  localStorage.setItem("videos", JSON.stringify(videos));
}

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

async function addYouTubeVideo(url) {
  const id = extractYouTubeId(url);
  if (!id) return alert("YouTube のURLが正しくありません。");
  if (videos.find(v => v.id === id)) return alert("この動画は既に追加済みです。");

  let title = url;
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://youtu.be/${id}&format=json`
    );
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

async function createMatch() {
  const dateEl = document.getElementById("matchDate");
  const typeEl = document.getElementById("matchTypeCreate");
  const oppEl = document.getElementById("opponent");
  const placeEl = document.getElementById("place");
  const myScoreEl = document.getElementById("scoreA");
  const opScoreEl = document.getElementById("scoreB");
  const pkAEl = document.getElementById("pkA");
  const pkBEl = document.getElementById("pkB");
  const videoSelect = document.getElementById("videoSelect");

  if (!dateEl || !oppEl) return;
  const date = (dateEl.value || "").trim();
  const matchType = (typeEl?.value || "").trim();
  const opponent = (oppEl.value || "").trim();
  const place = (placeEl?.value || "").trim();
  const myScore = myScoreEl?.value;
  const opponentScore = opScoreEl?.value;
  const pkA = pkAEl?.value;
  const pkB = pkBEl?.value;
  const videoId = videoSelect?.value || null;

  if (!date || !opponent) return alert("日付と対戦相手は必須です");

  const match = {
    date,
    matchType,
    opponent,
    place,
    myScore: myScore === "" ? null : Number(myScore),
    opponentScore: opponentScore === "" ? null : Number(opponentScore),
    pkA: pkA === "" ? null : Number(pkA),
    pkB: pkB === "" ? null : Number(pkB),
    videoId,
    highlights: [],
    createdAt: new Date().toISOString()
  };

  try {
    const db = window._firebaseDB;
    const { collection, addDoc } = window._firebaseFns;
    await addDoc(collection(db, "scores"), match);
    alert("Firestore に保存しました！");
    await loadScores();
  } catch (err) {
    console.error("Firestore 保存エラー:", err);
    alert("Firestore 保存でエラーが発生しました");
  }

  dateEl.value = "";
  if (typeEl) typeEl.value = "";
  oppEl.value = "";
  if (placeEl) placeEl.value = "";
  if (myScoreEl) myScoreEl.value = "";
  if (opScoreEl) opScoreEl.value = "";
  if (pkAEl) pkAEl.value = "";
  if (pkBEl) pkBEl.value = "";
  if (videoSelect) videoSelect.value = "";
}

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

function openEditModal(index, date, matchType, opponent, place, myScore, opponentScore, pkA, pkB, highlights) {
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

  const elPkA = document.getElementById("edit-pkA");
  const elPkB = document.getElementById("edit-pkB");
  if (elPkA) elPkA.value = pkA ?? "";
  if (elPkB) elPkB.value = pkB ?? "";

  const videoSel = document.getElementById("edit-video-select");
  if (videoSel) videoSel.value = videos[index]?.id || "";

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
  const pkAVal = document.getElementById("edit-pkA")?.value;
  const pkBVal = document.getElementById("edit-pkB")?.value;
  const videoSelect = document.getElementById("edit-video-select");
  const videoId = videoSelect?.value || null;

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
      pkA: pkAVal === "" ? null : Number(pkAVal),
      pkB: pkBVal === "" ? null : Number(pkBVal),
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

async function deleteCurrentMatch() {
  if (window.currentEditIndex === undefined) return;
  if (!confirm("この試合を削除しますか？")) return;

  const current = scores[window.currentEditIndex];
  if (!current.id) return alert("Firestore のIDが存在しません。削除できません。");

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

function showBackButton() {
  const btn = document.getElementById("btnBackLogin");
  if (!btn) return;
  btn.style.display = "block";
}

document.addEventListener("DOMContentLoaded", () => {
  renderVideoSelects();
  loadScores();

  const btnBack = document.getElementById("btnBackLogin");
  if (btnBack) btnBack.style.display = "none";

  document.getElementById("addVideoSection").style.display = "none";
  document.getElementById("createMatchSection").style.display = "none";
  document.getElementById("scoresSection").style.display = "none";

  // YouTube動画追加
  document.getElementById("btnAddYouTube")?.addEventListener("click", () => {
    const url = (document.getElementById("youtubeUrl")?.value || "").trim();
    if (!url) return alert("URLを入力してください");
    addYouTubeVideo(url);
    const el = document.getElementById("youtubeUrl");
    if (el) el.value = "";
  });

  document.getElementById("btnCreateMatch")?.addEventListener("click", createMatch);

  // 編集モーダル
  document.getElementById("modalClose")?.addEventListener("click", closeEditModal);
  document.getElementById("saveEdit")?.addEventListener("click", saveEditGeneric);
  document.getElementById("deleteMatch")?.addEventListener("click", deleteCurrentMatch);
  document.getElementById("btnMarkGoal")?.addEventListener("click", addHighlightTop);

  // チーム参加
  document.getElementById("btnJoin")?.addEventListener("click", async () => {
    const name = (document.getElementById("teamNameInput")?.value || "").trim();
    const code = (document.getElementById("inviteCodeInput")?.value || "").trim().toUpperCase();
    if (!name) return alert("チーム名を入力してください");

    const team = { teamName: name, inviteCode: code || null };
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

    const tn = document.getElementById("currentTeamName");
    if (tn) tn.textContent = `${team.teamName}（招待コード: ${team.inviteCode || "-"})`;

    if (btnBack) btnBack.style.display = "block";
    alert("チーム参加しました！");
    await loadScores();
  });

  // 戻るボタン
  btnBack?.addEventListener("click", () => {
    document.getElementById("teamSection").style.display = "block";
    document.getElementById("addVideoSection").style.display = "none";
    document.getElementById("createMatchSection").style.display = "none";
    document.getElementById("scoresSection").style.display = "none";

    const t = document.getElementById("teamNameInput"); if (t) t.value = "";
    const c = document.getElementById("inviteCodeInput"); if (c) c.value = "";

    btnBack.style.display = "none";
  });
});
