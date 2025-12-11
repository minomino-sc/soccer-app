/* main.js — Firestore対応 完全版 */

let scores = [];
let videos = [];
let collapsedMonths = JSON.parse(localStorage.getItem("collapsedMonths")) || [];
window.currentEditIndex = undefined;
let currentSearchQuery = "";

/* -----------------------------
   ユーティリティ
----------------------------- */
function saveAll() {
  localStorage.setItem("videos", JSON.stringify(videos));
  localStorage.setItem("collapsedMonths", JSON.stringify(collapsedMonths));
}

function isAdmin() {
  const team = JSON.parse(localStorage.getItem("teamInfo") || "{}");
  return team.inviteCode === "MINO-ADMIN";
}

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

/* -----------------------------
   動画セレクト描画
----------------------------- */
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

/* -----------------------------
   YouTube動画追加
----------------------------- */
async function addYouTubeVideo(url) {
  const id = extractYouTubeId(url);
  if (!id) return alert("YouTube のURLが正しくありません。");
  if (videos.find(v => v.id === id)) return alert("この動画は既に追加済みです。");

  let title = url;
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://youtu.be/${id}&format=json`);
    if (res.ok) title = (await res.json()).title;
  } catch (e) { console.warn("タイトル取得失敗", e); }

  videos.push({ id, url, title });
  saveAll();
  renderVideoSelects();
  alert("YouTube 動画を追加しました！");
}

/* -----------------------------
   試合作成
----------------------------- */
async function createMatch() {
  const date = (document.getElementById("matchDate")?.value || "").trim();
  const matchType = (document.getElementById("matchTypeCreate")?.value || "").trim();
  const opponent = (document.getElementById("opponent")?.value || "").trim();
  const place = (document.getElementById("place")?.value || "").trim();
  const myScoreVal = document.getElementById("scoreA")?.value;
  const opScoreVal = document.getElementById("scoreB")?.value;
  const videoId = document.getElementById("videoSelect")?.value || null;

  if (!date || !opponent) return alert("日付と対戦相手は必須です");

  const match = {
    date,
    matchType,
    opponent,
    place,
    myScore: myScoreVal === "" ? null : Number(myScoreVal),
    opponentScore: opScoreVal === "" ? null : Number(opScoreVal),
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
    console.error(err);
    alert("Firestore 保存に失敗しました");
  }

  // 入力クリア
  document.getElementById("matchDate").value = "";
  document.getElementById("matchTypeCreate").value = "";
  document.getElementById("opponent").value = "";
  document.getElementById("place").value = "";
  document.getElementById("scoreA").value = "";
  document.getElementById("scoreB").value = "";
  document.getElementById("videoSelect").value = "";
}

/* -----------------------------
   検索バー
----------------------------- */
function ensureSearchBar() {
  const sec = document.getElementById("scoresSection");
  if (!sec || document.getElementById("scoreSearchBar")) return;
  const input = document.createElement("input");
  input.id = "scoreSearchBar";
  input.className = "search-input";
  input.placeholder = "検索：種別・相手・会場・日付・得点・秒数";
  input.addEventListener("input", e => {
    currentSearchQuery = (e.target.value || "").trim().toLowerCase();
    loadScores();
  });
  const h2 = sec.querySelector("h2");
  if (h2) h2.after(input);
}

function matchesSearch(it, q) {
  if (!q) return true;
  const s = q.toLowerCase();
  return [it.matchType, it.opponent, it.place, it.date]
    .some(f => (f || "").toLowerCase().includes(s)) ||
    (it.myScore !== null && String(it.myScore).includes(s)) ||
    (it.opponentScore !== null && String(it.opponentScore).includes(s)) ||
    (Array.isArray(it.highlights) && it.highlights.some(h => String(h).includes(s)));
}

/* -----------------------------
   YouTube再生ボタン作成
----------------------------- */
function createPlayButton(videoId, timeSec) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "wide-btn";
  btn.textContent = timeSec ? `再生 (${timeSec}s)` : "試合動画再生";
  btn.addEventListener("click", e => {
    e.stopPropagation();
    if (!videoId) return alert("紐づく動画がありません。");
    const url = timeSec ? `https://youtu.be/${videoId}?t=${timeSec}` : `https://youtu.be/${videoId}`;
    window.open(url, "_blank", "noopener");
  });
  return btn;
}

/* -----------------------------
   Firestoreスコア取得・描画
----------------------------- */
async function loadScores() {
  const container = document.getElementById("scoreGroups");
  if (!container) return;

  ensureSearchBar();
  container.innerHTML = "";
  document.getElementById("scoresSection").style.display = "block";

  try {
    const snap = await window._firebaseFns.getDocs(
      window._firebaseFns.collection(window._firebaseDB, "scores")
    );
    scores = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    scores.sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch (err) {
    console.error(err);
    container.innerHTML = `<p class="muted small">データの読み込みに失敗しました。</p>`;
    return;
  }

  if (!scores.length) {
    container.innerHTML = `<p class="muted small">まだ試合がありません。</p>`;
    return;
  }

  const filtered = scores.filter(s => matchesSearch(s, currentSearchQuery));
  if (!filtered.length) {
    container.innerHTML = `<p class="muted small">検索に一致する試合がありません。</p>`;
    return;
  }

  const groups = {};
  filtered.forEach((it, idx) => {
    const d = new Date(it.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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
    if (collapsedMonths.includes(key)) { body.classList.add("hidden"); header.classList.add("closed"); }
    else header.classList.add("open");

    groups[key].forEach(({ it, idx }) => {
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
        `<div class="title"><span class="type-icon ${typeClass}">${icon}</span> ${it.date} — ${it.opponent}</div>` +
        `<div class="type-badge ${typeClass}">${it.matchType || "未設定"}</div>` +
        `<div class="sub match-venue">${it.place || ""}</div>` +
        `<div class="sub">得点: ${it.myScore ?? "-"} - ${it.opponentScore ?? "-"}</div>`;
      card.appendChild(meta);

      // ハイライト
      if (Array.isArray(it.highlights) && it.highlights.length) {
        const hlWrap = document.createElement("div"); hlWrap.className = "hl-wrap";
        it.highlights.forEach(sec => {
          const btn = document.createElement("button"); btn.className = "hl-btn"; btn.type = "button";
          btn.textContent = `ゴールシーン ${sec} 秒`;
          btn.addEventListener("click", e => {
            e.stopPropagation();
            if (!it.videoId) return alert("紐づく動画がありません。");
            const url = `https://youtu.be/${it.videoId}?t=${sec}`;
            window.open(url, "_blank", "noopener");
          });
          hlWrap.appendChild(btn);
        });
        meta.appendChild(hlWrap);
      }

      // アクション
      const actionRow = document.createElement("div"); actionRow.className = "action-row";
      if (it.videoId) actionRow.appendChild(createPlayButton(it.videoId, null));
      else { const sp = document.createElement("div"); sp.style.flex = "1 1 0"; actionRow.appendChild(sp); }

      const editBtn = document.createElement("button"); editBtn.type = "button"; editBtn.className = "wide-btn"; editBtn.textContent = "編集";
      editBtn.addEventListener("click", e => {
        e.stopPropagation();
        const pass = prompt("編集パスワード"); if (pass !== "mino2025") { alert("パスワード違います"); return; }
        openEditModal(idx, it.date, it.matchType || "", it.opponent, it.place, it.myScore, it.opponentScore, it.highlights || []);
      });
      actionRow.appendChild(editBtn);

      const delBtn = document.createElement("button"); delBtn.type = "button"; delBtn.className = "wide-btn danger"; delBtn.textContent = "削除";
      delBtn.addEventListener("click", async e => {
        e.stopPropagation(); const pass = prompt("削除パスワード"); if (pass !== "mino2025") { alert("パス違"); return; }
        if (!confirm("削除しますか？")) return; if (!it.id) { alert("Firestore IDなし"); return; }
        try { const ref = window._firebaseFns.doc(window._firebaseDB, "scores", it.id); await window._firebaseFns.deleteDoc(ref); alert("削除しました"); await loadScores(); }
        catch (err) { console.error(err); alert("削除失敗"); }
      });
      actionRow.appendChild(delBtn);

      card.appendChild(actionRow);
      body.appendChild(card);
    });

    group.appendChild(body);
    container.appendChild(group);

    header.addEventListener("click", () => {
      body.classList.toggle("hidden");
      const hidden = body.classList.contains("hidden");
      header.classList.toggle("open", !hidden);
      header.classList.toggle("closed", hidden);
      collapsedMonths = hidden ? [...collapsedMonths, key] : collapsedMonths.filter(k => k !== key);
      localStorage.setItem("collapsedMonths", JSON.stringify(collapsedMonths));
    });
  });

  if (!isAdmin()) document.querySelectorAll(".action-row").forEach(row => row.querySelectorAll(".wide-btn:not(:first-child)").forEach(btn => btn.style.display = "none"));
}

/* -----------------------------
   編集モーダル / ハイライト
----------------------------- */
function openEditModal(index, date, matchType, opponent, place, myScore, opScore, highlights) {
  window.currentEditIndex = index;
  document.getElementById("edit-date").value = date || "";
  document.getElementById("matchType").value = matchType || "";
  document.getElementById("edit-opponent").value = opponent || "";
  document.getElementById("edit-place").value = place || "";
  document.getElementById("edit-my-score").value = myScore ?? "";
  document.getElementById("edit-opponent-score").value = opScore ?? "";
  const hlList = document.getElementById("hlList"); hlList.innerHTML = "";
  (highlights || []).forEach(s => hlList.appendChild(createHlItemElement(s)));
  document.getElementById("edit-video-select").value = scores[index]?.videoId || "";
  document.getElementById("editModal").classList.remove("hidden");
}

function createHlItemElement(sec) {
  const wrapper = document.createElement("div"); wrapper.className = "hl-item"; wrapper.style.display = "flex"; wrapper.style.alignItems = "center"; wrapper.style.gap = "8px";
  const sp = document.createElement("span"); sp.textContent = `${sec} 秒`; sp.dataset.second = String(sec);
  const del = document.createElement("button"); del.type = "button"; del.textContent = "✕"; del.style.border = "none"; del.style.background = "transparent"; del.style.color = "#c00"; del.style.cursor = "pointer";
  del.addEventListener("click", () => wrapper.remove());
  wrapper.appendChild(sp); wrapper.appendChild(del);
  return wrapper;
}

function closeEditModal() { document.getElementById("editModal").classList.add("hidden"); window.currentEditIndex = undefined; }

async function saveEditGeneric() {
  if (window.currentEditIndex === undefined) { alert("編集対象なし"); return; }
  const current = scores[window.currentEditIndex]; if (!current.id) { alert("Firestore IDなし"); return; }

  const date = document.getElementById("edit-date")?.value.trim();
  const matchType = document.getElementById("matchType")?.value.trim();
  const opponent = document.getElementById("edit-opponent")?.value.trim();
  const place = document.getElementById("edit-place")?.value.trim();
  const myScoreVal = document.getElementById("edit-my-score")?.value;
  const opScoreVal = document.getElementById("edit-opponent-score")?.value;
  const videoId = document.getElementById("edit-video-select")?.value || null;

  const highlights = [];
  Array.from(document.getElementById("hlList")?.children || []).forEach(c => {
    const span = c.querySelector("span"); if (!span) return;
    const n = Number(String(span.dataset.second || span.textContent).replace(" 秒", "").trim());
    if (!isNaN(n)) highlights.push(n);
  });

  try {
    const ref = window._firebaseFns.doc(window._firebaseDB, "scores", current.id);
    await window._firebaseFns.updateDoc(ref, {
      date, matchType, opponent, place,
      myScore: myScoreVal === "" ? null : Number(myScoreVal),
      opponentScore: opScoreVal === "" ? null : Number(opScoreVal),
      highlights, videoId
    });
    alert("保存しました"); closeEditModal(); await loadScores();
  } catch (err) { console.error(err); alert("保存失敗"); }
}

async function deleteCurrentMatch() {
  if (window.currentEditIndex === undefined) return;
  const current = scores[window.currentEditIndex]; if (!current.id) { alert("IDなし"); return; }
  if (!confirm("削除しますか？")) return;
  try {
    const ref = window._firebaseFns.doc(window._firebaseDB, "scores", current.id);
    await window._firebaseFns.deleteDoc(ref); alert("削除しました"); closeEditModal(); await loadScores();
  } catch (err) { console.error(err); alert("削除失敗"); }
}

function addHighlightTop() {
  const inp = document.getElementById("hlSeconds"); if (!inp) return;
  const v = inp.value.trim(); if (!v) return alert("秒
