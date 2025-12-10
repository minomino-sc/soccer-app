/* main.js — 箕谷SC 動画共有システム（チーム別 Firestore & 保護者ログイン対応） */

let scores = [];
let videos = [];
let collapsedMonths = JSON.parse(localStorage.getItem("collapsedMonths")) || [];
let currentEditIndex = undefined;
let currentSearchQuery = "";

/* ===============================
   ユーティリティ
=============================== */
function saveAll() {
  localStorage.setItem("videos", JSON.stringify(videos));
}

function isAdmin() {
  const team = JSON.parse(localStorage.getItem("teamInfo") || "{}");
  return team.role === "admin";
}

function extractYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1);
    if (u.searchParams?.get("v")) return u.searchParams.get("v");
    return null;
  } catch (e) { return null; }
}

const TYPE_ICON = { "公式戦":"🏆", "カップ戦":"🎖️", "交流戦":"🤝", "":"🏳️" };
function typeClassName(matchType) {
  if (!matchType) return "type-friendly";
  if (matchType === "公式戦") return "type-official";
  if (matchType === "カップ戦") return "type-cup";
  if (matchType === "交流戦") return "type-friendly";
  return "type-friendly";
}

/* ===============================
   Firestore チーム別対応
=============================== */
function scoresCollectionRef(teamCode) {
  const db = window._firebaseDB;
  const { collection } = window._firebaseFns;
  return collection(db, "teams", teamCode, "scores");
}

async function addYouTubeVideo(url) {
  const id = extractYouTubeId(url);
  if (!id) return alert("YouTube のURLが正しくありません。");
  if (videos.find(v => v.id === id)) return alert("既に追加済みです。");

  let title = url;
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://youtu.be/${id}&format=json`);
    if (res.ok) title = (await res.json()).title;
  } catch(e) { console.warn("タイトル取得失敗", e); }

  videos.push({ id, url, title });
  saveAll();
  renderVideoSelects();
  alert("YouTube 動画を追加しました！");
}

/* ===============================
   動画セレクト描画
=============================== */
function renderVideoSelects(selectedForEdit) {
  const videoSelect = document.getElementById("videoSelect");
  if (videoSelect) {
    videoSelect.innerHTML = `<option value="">— 紐づけ動画なし —</option>`;
    videos.forEach(v => { 
      const opt = document.createElement("option");
      opt.value = v.id; opt.textContent = v.title || v.url;
      videoSelect.appendChild(opt);
    });
  }

  const editSel = document.getElementById("edit-video-select");
  if (editSel) {
    editSel.innerHTML = `<option value="">— 紐づけ動画なし —</option>`;
    videos.forEach(v => {
      const opt = document.createElement("option");
      opt.value = v.id; opt.textContent = v.title || v.url;
      editSel.appendChild(opt);
    });
    editSel.value = selectedForEdit || "";
  }
}

/* ===============================
   試合作成
=============================== */
async function createMatch() {
  const team = JSON.parse(localStorage.getItem("teamInfo") || "{}");
  if (!team || !team.inviteCode) return alert("チーム情報がありません。");

  const date = (document.getElementById("matchDate")?.value || "").trim();
  const matchType = (document.getElementById("matchTypeCreate")?.value || "").trim();
  const opponent = (document.getElementById("opponent")?.value || "").trim();
  const place = (document.getElementById("place")?.value || "").trim();
  const myScore = document.getElementById("scoreA")?.value;
  const opponentScore = document.getElementById("scoreB")?.value;
  const videoId = document.getElementById("videoSelect")?.value || null;

  if (!date || !opponent) return alert("日付と対戦相手は必須です");

  const match = {
    date, matchType, opponent, place,
    myScore: myScore === "" ? null : Number(myScore),
    opponentScore: opponentScore === "" ? null : Number(opponentScore),
    videoId,
    highlights: [],
    createdAt: new Date().toISOString()
  };

  try {
    const { addDoc } = window._firebaseFns;
    await addDoc(scoresCollectionRef(team.inviteCode), match);
    alert("Firestore に保存しました！");
    await loadScores();
  } catch (err) {
    console.error(err);
    alert("Firestore 保存でエラーが発生しました");
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

/* ===============================
   スコア読み込み
=============================== */
async function loadScores() {
  const container = document.getElementById("scoreGroups");
  if (!container) return;

  const team = JSON.parse(localStorage.getItem("teamInfo") || "{}");
  if (!team || !team.inviteCode) return container.innerHTML = `<p>チーム情報がありません。</p>`;

  container.innerHTML = "";

  try {
    const snap = await window._firebaseFns.getDocs(scoresCollectionRef(team.inviteCode));
    scores = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 重複削除（IDと日付+相手+会場）
    const seenIds = new Set();
    scores = scores.filter(s => {
      if (!s.id || seenIds.has(s.id)) return false;
      seenIds.add(s.id); return true;
    });
    const seenKeys = new Set();
    scores = scores.filter(s => {
      const key = `${s.date}||${s.opponent}||${s.place}`;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key); return true;
    });

    scores.sort((a,b) => new Date(b.date) - new Date(a.date));
  } catch(e) {
    console.error(e);
    container.innerHTML = `<p>データの読み込みに失敗しました</p>`;
    return;
  }

  renderScores();
}

/* ===============================
   スコア描画（種別アイコン・月集計対応）
=============================== */
function renderScores() {
  const container = document.getElementById("scoreGroups");
  if (!container) return;
  container.innerHTML = "";

  if (!scores.length) {
    container.innerHTML = `<p class="muted small">まだ試合がありません。</p>`;
    return;
  }

  const groups = {};
  scores.forEach((it, idx) => {
    const d = new Date(it.date);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    if (!groups[key]) groups[key] = { items: [] };
    groups[key].items.push({ it, idx });
  });

  Object.keys(groups).sort((a,b)=>b.localeCompare(a)).forEach(key=>{
    const group = document.createElement("div");
    group.className = "month card";

    const header = document.createElement("div");
    header.className = "month-header";
    header.innerHTML = `<strong>${key}</strong> <span class="muted small">${groups[key].items.length} 試合</span>`;
    group.appendChild(header);

    const body = document.createElement("div");
    body.className = "month-body";
    if (collapsedMonths.includes(key)) { body.classList.add("hidden"); header.classList.add("closed"); }
    else header.classList.add("open");

    groups[key].items.forEach(({it, idx})=>{
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
        `<div class="title"><span class="type-icon ${typeClass}">${icon}</span> ${it.date} — ${it.opponent}</div>`+
        `<div class="type-badge ${typeClass}">${it.matchType || "未設定"}</div>`+
        `<div class="sub match-venue">${it.place || ""}</div>`+
        `<div class="sub">得点: ${it.myScore ?? "-"} - ${it.opponentScore ?? "-"}</div>`;
      card.appendChild(meta);

      // ハイライトボタン
      if (Array.isArray(it.highlights) && it.highlights.length) {
        const hlWrap = document.createElement("div");
        hlWrap.className = "hl-wrap";
        it.highlights.forEach(sec=>{
          const btn = document.createElement("button");
          btn.className = "hl-btn"; btn.type="button"; btn.textContent=`ゴールシーン ${sec} 秒`;
          btn.addEventListener("click", e=>{
            e.stopPropagation();
            if (!it.videoId) return alert("紐づく動画がありません。");
            window.open(`https://youtu.be/${it.videoId}?t=${sec}`,"_blank","noopener");
          });
          hlWrap.appendChild(btn);
        });
        meta.appendChild(hlWrap);
      }

      // action row（再生・編集・削除）
      const actionRow = document.createElement("div");
      actionRow.className = "action-row";

      if (it.videoId) actionRow.appendChild(createPlayButton(it.videoId,null));
      else actionRow.appendChild(document.createElement("div")); // spacer

      // 編集ボタン
      const editBtn = document.createElement("button");
      editBtn.type="button"; editBtn.className="wide-btn"; editBtn.textContent="編集";
      editBtn.addEventListener("click", e=>{
        e.stopPropagation();
        openEditModal(idx, it.date, it.matchType, it.opponent, it.place, it.myScore, it.opponentScore, it.highlights||[]);
      });
      actionRow.appendChild(editBtn);

      // 削除ボタン
      const delBtn = document.createElement("button");
      delBtn.type="button"; delBtn.className="wide-btn danger"; delBtn.textContent="削除";
      delBtn.addEventListener("click", async e=>{
        e.stopPropagation();
        if (!confirm("この試合を削除しますか？")) return;
        if (!it.id) return alert("Firestore のIDが存在しません。");
        try {
          const ref = window._firebaseFns.doc(window._firebaseDB, scoresCollectionRefName(team.inviteCode), it.id);
          await window._firebaseFns.deleteDoc(ref);
          alert("削除しました");
          await loadScores();
        } catch(err){ console.error(err); alert("削除に失敗しました"); }
      });
      actionRow.appendChild(delBtn);

      const badge = document.createElement("div"); badge.className="badge"; badge.appendChild(actionRow);
      card.appendChild(badge);

      body.appendChild(card);
    });

    group.appendChild(body);
    container.appendChild(group);

    // 折りたたみイベント
    header.addEventListener("click", ()=>{
      body.classList.toggle("hidden");
      const isHidden = body.classList.contains("hidden");
      if (isHidden) { header.classList.remove("open"); header.classList.add("closed"); collapsedMonths.push(key); }
      else { header.classList.remove("closed"); header.classList.add("open"); collapsedMonths = collapsedMonths.filter(k=>k!==key); }
      localStorage.setItem("collapsedMonths", JSON.stringify(collapsedMonths));
    });

  });
}

/* ===============================
   編集モーダル操作
=============================== */
function openEditModal(index, date, matchType, opponent, place, myScore, opponentScore, highlights) {
  window.currentEditIndex = index;

  document.getElementById("edit-date").value = date || "";
  document.getElementById("matchType").value = matchType || "";
  document.getElementById("edit-opponent").value = opponent || "";
  document.getElementById("edit-place").value = place || "";
  document.getElementById("edit-my-score").value = myScore ?? "";
  document.getElementById("edit-opponent-score").value = opponentScore ?? "";

  const hlList = document.getElementById("hlList");
  hlList.innerHTML = "";
  (highlights||[]).forEach(sec => hlList.appendChild(createHlItemElement(sec)));

  renderVideoSelects(scores[index]?.videoId);

  document.getElementById("editModal").classList.remove("hidden");
}

function closeEditModal() {
  document.getElementById("editModal").classList.add("hidden");
  window.currentEditIndex = undefined;
}

function createHlItemElement(sec) {
  const wrapper = document.createElement("div"); wrapper.className="hl-item"; wrapper.style.display="flex"; wrapper.style.gap="8px"; wrapper.style.alignItems="center";
  const sp = document.createElement("span"); sp.textContent=`${sec} 秒`; sp.dataset.second=sec;
  const del = document.createElement("button"); del.type="button"; del.textContent="✕"; del.style.border="none"; del.style.background="transparent"; del.style.color="#c00"; del.style.cursor="pointer";
  del.addEventListener("click", ()=>wrapper.remove());
  wrapper.appendChild(sp); wrapper.appendChild(del);
  return wrapper;
}

/* 編集保存 */
async function saveEditGeneric() {
  if (window.currentEditIndex === undefined) return alert("編集対象が見つかりません");
  const current = scores[window.currentEditIndex];
  if (!current.id) return alert("Firestore のIDがありません");

  const date = document.getElementById("edit-date").value.trim();
  const matchType = document.getElementById("matchType").value.trim();
  const opponent = document.getElementById("edit-opponent").value.trim();
  const place = document.getElementById("edit-place").value.trim();
  const myScoreVal = document.getElementById("edit-my-score").value;
  const opScoreVal = document.getElementById("edit-opponent-score").value;
  const videoSelect = document.getElementById("edit-video-select");
  const videoId = videoSelect?.value || null;

  const hlList = document.getElementById("hlList");
  const highlights = Array.from(hlList.children).map(c=>{
    const span = c.querySelector("span");
    return span ? Number(span.dataset.second||0) : 0;
  });

  try {
    const ref = window._firebaseFns.doc(window._firebaseDB, scoresCollectionRefName(team.inviteCode), current.id);
    await window._firebaseFns.updateDoc(ref, { date, matchType, opponent, place, myScore: myScoreVal===""?null:Number(myScoreVal), opponentScore: opScoreVal===""?null:Number(opScoreVal), highlights, videoId });
    alert("保存しました");
    closeEditModal();
    await loadScores();
  } catch(err){ console.error(err); alert("更新に失敗しました"); }
}

/* ハイライト追加 */
function addHighlightTop() {
  const inp = document.getElementById("hlSeconds");
  const v = (inp.value||"").trim();
  if (!v) return alert("秒数を入力してください");
  document.getElementById("hlList").appendChild(createHlItemElement(Number(v)));
  inp.value = "";
}

/* ===============================
   YouTube 追加
=============================== */
document.getElementById("btnAddYouTube")?.addEventListener("click", ()=>{
  const url = (document.getElementById("youtubeUrl")?.value||"").trim();
  if (!url) return alert("URLを入力してください");
  addYouTubeVideo(url);
  document.getElementById("youtubeUrl").value="";
});

/* ===============================
   チーム参加 / ログイン
=============================== */
document.getElementById("btnJoin")?.addEventListener("click", async ()=>{
  const name = (document.getElementById("teamNameInput")?.value||"").trim();
  const code = (document.getElementById("inviteCodeInput")?.value||"").trim().toUpperCase();
  if (!name) return alert("チーム名を入力してください");

  const team = { teamName:name, inviteCode:code };
  localStorage.setItem("teamInfo", JSON.stringify(team));

  document.getElementById("teamSection").style.display="none";
  document.getElementById("scoresSection").style.display="block";

  // 管理者か
  if (isAdmin()) {
    document.getElementById("addVideoSection").style.display="block";
    document.getElementById("createMatchSection").style.display="block";
  } else {
    document.getElementById("addVideoSection").style.display="none";
    document.getElementById("createMatchSection").style.display="none";
  }

  showBackButton();
  await loadScores();
});

/* 戻るボタン */
document.getElementById("btnBackLogin")?.addEventListener("click", ()=>{
  document.getElementById("teamSection").style.display="block";
  document.getElementById("addVideoSection").style.display="none";
  document.getElementById("createMatchSection").style.display="none";
  document.getElementById("scoresSection").style.display="none";
  document.getElementById("teamNameInput").value="";
  document.getElementById("inviteCodeInput").value="";
  document.getElementById("btnBackLogin").style.display="none";
});
