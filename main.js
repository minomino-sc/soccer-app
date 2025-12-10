/* main.js — 完全版（既存機能保持＆チーム参加正常化） */

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

/* YouTube 追加 */
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

/* ------------------------------
   試合作成
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
    pkScore: {
      myPK: Number(document.getElementById("pkScoreA")?.value || 0),
      opPK: Number(document.getElementById("pkScoreB")?.value || 0)
    },
    videoId,
    highlights: [],
    createdAt: new Date().toISOString()
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

  dateEl.value = "";
  if (typeEl) typeEl.value = "";
  oppEl.value = "";
  if (placeEl) placeEl.value = "";
  if (myScoreEl) myScoreEl.value = "";
  if (opScoreEl) opScoreEl.value = "";
  if (videoSelect) videoSelect.value = "";
}

/* ------------------------------
   検索バー
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

/* helper: YouTube再生ボタン */
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
   スコア一覧描画（Firestore対応）
========================================================== */
async function loadScores() {
  const container = document.getElementById("scoreGroups");
  if (!container) return;

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

    // 重複排除
    const seenIds = new Set();
    scores = scores.filter(s => {
      if (!s.id) return false;
      if (seenIds.has(s.id)) return false;
      seenIds.add(s.id);
      return true;
    });

    const seenKeys = new Set();
    scores = scores.filter(s => {
      const key = `${s.date}||${s.opponent}||${s.place}`;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });

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
    const cd = isNaN(d) ? new Date(it.createdAt || Date.now()) : d;
    const key = `${cd.getFullYear()}-${String(cd.getMonth()+1).padStart(2,"0")}`;

    if (!groups[key])
      groups[key] = { items: [], counts: { "公式戦":0, "カップ戦":0, "交流戦":0, "未設定":0 } };

    groups[key].items.push({ it, idx });

    let mt = it.matchType;
    if (!mt || mt === "") mt = "未設定";
    groups[key].counts[mt]++;
  });

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

    if (collapsedMonths.includes(key)) {
      body.classList.add("hidden");
      header.classList.add("closed");
    } else {
      header.classList.add("open");
    }

    groups[key].items.forEach(({it,idx})=>{
      const card = document.createElement("div");
      card.className = "score-card";

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

      const badge = document.createElement("div");
      badge.className = "badge";

      const actionRow = document.createElement("div");
      actionRow.className = "action-row";

      if (it.videoId) actionRow.appendChild(createPlayButton(it.videoId, null));
      else {
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
        if (pass !== "mino2025") { alert("パスワードが違います"); return; }
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
        if (pass !== "mino2025") { alert("パスワードが違います"); return; }
        if (!confirm("この試合を削除しますか？")) return;
        const matchId = it.id;
        if (!matchId) { alert("Firestore のIDが存在しないため削除できません。"); return; }
        try {
          const ref = window._firebaseFns.doc(window._firebaseDB, "scores", matchId);
          await window._firebaseFns.deleteDoc(ref);
          alert("Firestore から削除しました");
          await loadScores();
        } catch (err) {
          console.error("Firestore削除エラー:", err);
          alert("Firestore の削除に失敗しました");
        }
      });
      actionRow.appendChild(delBtn);

      badge.appendChild(actionRow);
      card.appendChild(badge);
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
  });

  if (!isAdmin()) {
    document.querySelectorAll(".action-row").forEach(row => {
      row.querySelectorAll(".wide-btn:not(:first-child)").forEach(btn => btn.style.display = "none");
    });
  }
}

/* ==========================================================
   編集モーダル関連
========================================================== */
function openEditModal(index, date, matchType, opponent, place, myScore, opponentScore, highlights) {
  window.currentEditIndex = index;
  const elDate = document.getElementById("edit-date"); if (elDate) elDate.value = date || "";
  const mtEl = document.getElementById("matchType"); if (mtEl) mtEl.value = matchType || "";
  const elOpp = document.getElementById("edit-opponent"); if (elOpp) elOpp.value = opponent || "";
  const elPlace = document.getElementById("edit-place"); if (elPlace) elPlace.value = place || "";
  const elMy = document.getElementById("edit-my-score"); if (elMy) elMy.value = myScore ?? "";
  const elOp = document.getElementById("edit-opponent-score"); if (elOp) elOp.value = opponentScore ?? "";

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

async function saveEditGeneric() {
  if (window.currentEditIndex === undefined) {
    alert("編集対象が見つかりません。");
    return;
  }

  const current = scores[window.currentEditIndex];
  if (!current.id) {
    alert("Firestore のIDがありません（不整合）");
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
      pkScore: {
        myPK: Number(document.getElementById("editPkA")?.value || 0),
        opPK: Number(document.getElementById("editPkB")?.value || 0)
      },
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
  if (!current.id) {
    alert("Firestore のIDが存在しません。削除できません。");
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

  document.getElementById("btnBackLogin").style.display = "none";
  document.getElementById("addVideoSection").style.display = "none";
  document.getElementById("createMatchSection").style.display = "none";

  const scoreAEl = document.getElementById("scoreA");
  const scoreBEl = document.getElementById("scoreB");
  const pkRow = document.getElementById("pkRow");

  function togglePkRow() {
    if (!scoreAEl || !scoreBEl || !pkRow) return;
    const a = Number(scoreAEl.value || 0);
    const b = Number(scoreBEl.value || 0);
    pkRow.style.display = a === b ? "flex" : "none";
  }

  scoreAEl?.addEventListener("input", togglePkRow);
  scoreBEl?.addEventListener("input", togglePkRow);

  document.getElementById("scoresSection").style.display = "none";

  document.getElementById("btnAddYouTube")?.addEventListener("click", () => {
    const url = (document.getElementById("youtubeUrl")?.value || "").trim();
    if (!url) return alert("URLを入力してください");
    addYouTubeVideo(url);
    const el = document.getElementById("youtubeUrl");
    if (el) el.value = "";
  });

  document.getElementById("btnCreateMatch")?.addEventListener("click", createMatch);

  document.getElementById("btnBackLogin")?.addEventListener("click", () => {
    document.getElementById("teamSection").style.display = "block";
    document.getElementById("addVideoSection").style.display = "none";
    document.getElementById("createMatchSection").style.display = "none";
    document.getElementById("scoresSection").style.display = "none";
    document.getElementById("teamNameInput").value = "";
    document.getElementById("inviteCodeInput").value = "";
    document.getElementById("btnBackLogin").style.display = "none";
  });

  document.getElementById("modalClose")?.addEventListener("click", closeEditModal);
  document.getElementById("saveEdit")?.addEventListener("click", saveEditGeneric);
  document.getElementById("deleteMatch")?.addEventListener("click", deleteCurrentMatch);
  document.getElementById("btnMarkGoal")?.addEventListener("click", addHighlightTop);

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

    alert("チーム参加しました！");
    showBackButton();

    await loadScores();
  });
});                             
