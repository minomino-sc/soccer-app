/* main.js — リアルタイム対応版（整理済み完全版） */

let scores = [];
let videos = JSON.parse(localStorage.getItem("videos")) || [];
let collapsedMonths = JSON.parse(localStorage.getItem("collapsedMonths")) || [];
window.currentEditIndex = undefined;
let currentSearchQuery = "";

/* ------------------------------
   保存ユーティリティ
------------------------------ */
function saveVideos() {
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
  } catch {
    return null;
  }
}

/* 種別 → アイコン & クラス */
const TYPE_ICON = { "公式戦": "🏆", "カップ戦": "🎖️", "交流戦": "🤝", "": "🏳️" };
function typeClassName(type) {
  if (!type || type === "") return "type-friendly";
  if (type === "公式戦") return "type-official";
  if (type === "カップ戦") return "type-cup";
  if (type === "交流戦") return "type-friendly";
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
    const res = await fetch(`https://www.youtube.com/oembed?url=https://youtu.be/${id}&format=json`);
    if (res.ok) {
      const data = await res.json();
      title = data.title;
    }
  } catch {}

  videos.push({ id, url, title });
  saveVideos();
  renderVideoSelects();
  alert("YouTube 動画を追加しました！");
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
  input.addEventListener("input", e => {
    currentSearchQuery = (e.target.value || "").trim().toLowerCase();
    renderScores();
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

/* 再生ボタン作成 */
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

/* ------------------------------
   スコア描画
------------------------------ */
function renderScores() {
  const container = document.getElementById("scoreGroups");
  if (!container) return;
  ensureSearchBar();
  container.innerHTML = "";

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
    if (!groups[key]) groups[key] = { items: [], counts: { "公式戦":0, "カップ戦":0, "交流戦":0, "未設定":0 } };
    groups[key].items.push({ it, idx });
    let mt = it.matchType || "未設定";
    groups[key].counts[mt] = (groups[key].counts[mt] || 0) + 1;
  });

  Object.keys(groups).sort((a,b)=>b.localeCompare(a)).forEach(key => {
    const group = document.createElement("div");
    group.className = "month card";

    const c = groups[key].counts;
    const aggText = `(${TYPE_ICON["公式戦"]}${c["公式戦"]} ${TYPE_ICON["カップ戦"]}${c["カップ戦"]} ${TYPE_ICON["交流戦"]}${c["交流戦"]})`;

    const header = document.createElement("div");
    header.className = "month-header";
    header.innerHTML = `<strong>${key}</strong> <span class="muted small">${groups[key].items.length} 試合</span> <span class="agg">${aggText}</span>`;
    group.appendChild(header);

    const body = document.createElement("div");
    body.className = "month-body";
    if (collapsedMonths.includes(key)) body.classList.add("hidden");

    groups[key].items.forEach(({ it, idx }) => {
      const card = document.createElement("div");
      card.className = "score-card";

      if (typeof it.myScore === "number" && typeof it.opponentScore === "number") {
        if (it.myScore > it.opponentScore) card.classList.add("win");
        else if (it.myScore < it.opponentScore) card.classList.add("lose");
        else card.classList.add("draw");
      }

      const meta = document.createElement("div");
      meta.className = "meta";
      const typeClass = typeClassName(it.matchType || "");
      const icon = TYPE_ICON[it.matchType || ""] || "🏳️";

      meta.innerHTML = `<div class="title"><span class="type-icon ${typeClass}">${icon}</span> ${it.date} — ${it.opponent}</div>
                        <div class="type-badge ${typeClass}">${it.matchType || "未設定"}</div>
                        <div class="sub match-venue">${it.place || ""}</div>
                        <div class="sub">得点: ${it.myScore ?? "-"} - ${it.opponentScore ?? "-"}</div>`;

      // ハイライト
      if (Array.isArray(it.highlights) && it.highlights.length) {
        const hlWrap = document.createElement("div");
        hlWrap.className = "hl-wrap";
        it.highlights.forEach(sec => {
          const btn = document.createElement("button");
          btn.className = "hl-btn";
          btn.type = "button";
          btn.textContent = `ゴールシーン ${sec} 秒`;
          btn.addEventListener("click", e => {
            e.stopPropagation();
            if (!it.videoId) return alert("紐づく動画がありません。");
            window.open(`https://youtu.be/${it.videoId}?t=${sec}`, "_blank", "noopener");
          });
          hlWrap.appendChild(btn);
        });
        meta.appendChild(hlWrap);
      }

      card.appendChild(meta);

      // action row
      const badge = document.createElement("div");
      badge.className = "badge";
      const actionRow = document.createElement("div");
      actionRow.className = "action-row";

      if (it.videoId) actionRow.appendChild(createPlayButton(it.videoId, null));
      else actionRow.appendChild(document.createElement("div"));

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "wide-btn";
      editBtn.textContent = "編集";
      editBtn.addEventListener("click", e => openEditPrompt(it, idx));
      actionRow.appendChild(editBtn);

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "wide-btn danger";
      delBtn.textContent = "削除";
      delBtn.addEventListener("click", e => deletePrompt(it.id));
      actionRow.appendChild(delBtn);

      badge.appendChild(actionRow);
      card.appendChild(badge);
      body.appendChild(card);
    });

    group.appendChild(body);
    container.appendChild(group);

    // 折りたたみ
    header.addEventListener("click", () => {
      body.classList.toggle("hidden");
      const isHidden = body.classList.contains("hidden");
      if (isHidden) header.classList.replace("open","closed");
      else header.classList.replace("closed","open");
      collapsedMonths = collapsedMonths.filter(k=>k!==key);
      if (isHidden) collapsedMonths.push(key);
      localStorage.setItem("collapsedMonths", JSON.stringify(collapsedMonths));
    });
  });

  if (!isAdmin()) {
    document.querySelectorAll(".action-row").forEach(row => {
      row.querySelectorAll(".wide-btn:not(:first-child)").forEach(btn => btn.style.display="none");
    });
  }
}

/* ------------------------------
   Firestore リアルタイム監視
------------------------------ */
function initRealtimeListener() {
  const col = window._firebaseFns.collection(window._firebaseDB, "scores");
  window._firebaseFns.onSnapshot(col, snap => {
    scores = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderScores();
  }, err => console.error("Realtime error:", err));
}

/* ------------------------------
   編集・削除プロンプト
------------------------------ */
function openEditPrompt(it, idx) {
  const pass = prompt("編集にはパスワードが必要です。入力してください：");
  if (pass !== "mino2025") return alert("パスワードが違います");
  openEditModal(idx, it.date, it.matchType||"", it.opponent, it.place, it.myScore, it.opponentScore, it.highlights||[]);
}

async function deletePrompt(id) {
  const pass = prompt("削除にはパスワードが必要です。入力してください：");
  if (pass !== "mino2025") return alert("パスワードが違います");
  if (!confirm("この試合を削除しますか？")) return;
  try {
    await window._firebaseFns.deleteDoc(window._firebaseFns.doc(window._firebaseDB, "scores", id));
  } catch(err){console.error(err); alert("削除失敗")}
}

/* ------------------------------
   DOMContentLoaded
------------------------------ */
document.addEventListener("DOMContentLoaded", async () => {
  renderVideoSelects();
  initRealtimeListener();

  document.getElementById("btnAddYouTube")?.addEventListener("click", ()=>{
    const url = (document.getElementById("youtubeUrl")?.value||"").trim();
    if(!url)return alert("URLを入力してください");
    addYouTubeVideo(url);
    document.getElementById("youtubeUrl").value="";
  });
});
