/* main.js — Firestore 完全版（Firestore動画保存・チーム紐付け対応） - part 1/2
   機能:
   - チーム参加/作成（Firestore 上で重複チェック）
   - YouTube 動画追加（Firestore videos コレクション）
   - 試合作成（scores に teamName/inviteCode を保存）
   - 共通ユーティリティ
*/

let scores = [];
let videos = [];
let collapsedMonths = JSON.parse(localStorage.getItem("collapsedMonths")) || [];
let currentSearchQuery = "";
window.currentEditIndex = undefined;

/* ------------------------------
   localStorage ユーティリティ（videosはバックアップ用途）
------------------------------ */
function saveVideosLocal() {
  localStorage.setItem("videos", JSON.stringify(videos));
}

/* 管理者判定（ローカルの teamInfo を参照）*/
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

/* 種別アイコン / class */
const TYPE_ICON = { "公式戦":"🏆", "カップ戦":"🎖️", "交流戦":"🤝", "":"🏳️" };
function typeClassName(matchType){
  if(!matchType) return "type-friendly";
  if(matchType==="公式戦") return "type-official";
  if(matchType==="カップ戦") return "type-cup";
  if(matchType==="交流戦") return "type-friendly";
  return "type-friendly";
}

/* ------------------------------
   Firestore: videos 読み込み
   - teamInfo が必要（teamName + inviteCode でフィルタ）
------------------------------ */
async function loadVideosFromFirestore(){
  videos = [];
  const team = JSON.parse(localStorage.getItem("teamInfo")||"null");
  if(!team) return renderVideoSelects(); // 未ログイン時は空でレンダリング

  try{
    const db = window._firebaseDB;
    const { collection, query, where, getDocs } = window._firebaseFns;

    const videosCol = collection(db,"videos");
    const q = query(videosCol, where("teamName","==",team.teamName), where("inviteCode","==",team.inviteCode));
    const snap = await getDocs(q);
    videos = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    // 保険でローカルにも保存（バックアップ）
    saveVideosLocal();
  }catch(err){
    console.error("loadVideosFromFirestore error", err);
  } finally {
    renderVideoSelects();
  }
}

/* ------------------------------
   動画セレクト描画（create / edit 両方）
------------------------------ */
function renderVideoSelects(selectedForEdit){
  const videoSelect = document.getElementById("videoSelect");
  if(videoSelect){
    videoSelect.innerHTML = `<option value="">— 紐づけ動画なし —</option>`;
    videos.forEach(v=>{
      const opt=document.createElement("option");
      opt.value = v.id;
      opt.textContent = v.title || v.url || v.id;
      videoSelect.appendChild(opt);
    });
    if(selectedForEdit) videoSelect.value = selectedForEdit;
  }

  const editSel = document.getElementById("edit-video-select");
  if(editSel){
    editSel.innerHTML = `<option value="">— 紐づけ動画なし —</option>`;
    videos.forEach(v=>{
      const opt=document.createElement("option");
      opt.value = v.id;
      opt.textContent = v.title || v.url || v.id;
      editSel.appendChild(opt);
    });
    if(selectedForEdit) editSel.value = selectedForEdit;
  }
}

/* ------------------------------
   YouTube動画追加（Firestore に保存して再読込）
   - チームに紐づけて保存
------------------------------ */
async function addYouTubeVideo(url){
  const id = extractYouTubeId(url);
  if(!id) return alert("YouTube のURLが正しくありません。");

  // 重複チェック（既にローカル配列に入っていれば拒否）
  if(videos.find(v=>v.id===id)) return alert("この動画は既に追加済みです。");

  let title = url;
  try{
    const res = await fetch(`https://www.youtube.com/oembed?url=https://youtu.be/${id}&format=json`);
    if(res.ok){ const data = await res.json(); title = data.title; }
  }catch(err){
    console.warn("oembed failed", err);
  }

  const team = JSON.parse(localStorage.getItem("teamInfo")||"null");
  if(!team) return alert("チームにログインしてください");

  try{
    const db = window._firebaseDB;
    const { collection, addDoc } = window._firebaseFns;
    const videosCol = collection(db, "videos");

    const payload = {
      id, url, title,
      teamName: team.teamName,
      inviteCode: team.inviteCode,
      createdAt: new Date().toISOString()
    };

    await addDoc(videosCol, payload);

    // 成功したら最新版を読み直す
    await loadVideosFromFirestore();
    alert("YouTube 動画を追加しました（Firestore 保存）");
  }catch(err){
    console.error("addYouTubeVideo error", err);
    alert("動画の保存に失敗しました");
  }
}

/* main.js — Firestore 完全版（part 2/2）
   - 試合作成 / 読み込み / 描画 / 編集 / 削除
   - チーム参加部分も含む
*/

/* ------------------------------
   試合作成（Firestore 対応、teamName/inviteCode を必ず保存）
------------------------------ */
async function createMatch(){
  const dateEl = document.getElementById("matchDate");
  const typeEl = document.getElementById("matchTypeCreate");
  const oppEl = document.getElementById("opponent");
  const placeEl = document.getElementById("place");
  const myScoreEl = document.getElementById("scoreA");
  const opScoreEl = document.getElementById("scoreB");
  const videoSelect = document.getElementById("videoSelect");

  if(!dateEl || !oppEl) return;

  const date = (dateEl.value||"").trim();
  const matchType = (typeEl?.value||"").trim();
  const opponent = (oppEl.value||"").trim();
  const place = (placeEl?.value||"").trim();
  const myScore = myScoreEl?.value;
  const opponentScore = opScoreEl?.value;
  const videoId = videoSelect?.value || null;

  if(!date || !opponent) return alert("日付と対戦相手は必須です");

  const team = JSON.parse(localStorage.getItem("teamInfo")||"null");
  if(!team) return alert("チームにログインしてください");

  const match = {
    teamName: team.teamName,
    inviteCode: team.inviteCode,
    date,
    matchType,
    opponent,
    place,
    scoreA: myScore === "" ? null : Number(myScore),
    scoreB: opponentScore === "" ? null : Number(opponentScore),
    videoId,
    hlSeconds: [],
    createdAt: new Date().toISOString()
  };

  try{
    const db = window._firebaseDB;
    const { collection, addDoc } = window._firebaseFns;
    await addDoc(collection(db, "scores"), match);
    alert("試合を作成して Firestore に保存しました");
    // 再読み込み
    await loadScores();
  }catch(err){
    console.error("createMatch error", err);
    alert("試合作成に失敗しました");
  }

  // 入力クリア
  dateEl.value = "";
  if(typeEl) typeEl.value = "";
  oppEl.value = "";
  if(placeEl) placeEl.value = "";
  if(myScoreEl) myScoreEl.value = "";
  if(opScoreEl) opScoreEl.value = "";
  if(videoSelect) videoSelect.value = "";
}

/* ==========================================================
   検索バーの補助
========================================================== */
function ensureSearchBar(){
  const sec = document.getElementById("scoresSection");
  if(!sec) return;
  if(document.getElementById("scoreSearchBar")) return;
  const input = document.createElement("input");
  input.id = "scoreSearchBar";
  input.className = "search-input";
  input.placeholder = "検索：種別・相手・会場・日付・得点・秒数";
  input.addEventListener("input",(e)=>{
    currentSearchQuery = (e.target.value||"").trim().toLowerCase();
    loadScores();
  });
  const h2 = sec.querySelector("h2");
  if(h2) h2.after(input);
}

/* 検索マッチ判定 */
function matchesSearch(it,q){
  if(!q) return true;
  const s = q.toLowerCase();
  if((it.matchType||"").toLowerCase().includes(s)) return true;
  if((it.opponent||"").toLowerCase().includes(s)) return true;
  if((it.place||"").toLowerCase().includes(s)) return true;
  if((it.date||"").toLowerCase().includes(s)) return true;
  if(it.scoreA!==null && String(it.scoreA).includes(s)) return true;
  if(it.scoreB!==null && String(it.scoreB).includes(s)) return true;
  if(Array.isArray(it.hlSeconds) && it.hlSeconds.some(h=>String(h).includes(s))) return true;
  return false;
}

/* YouTube 再生ボタンヘルパー */
function createPlayButton(videoId, timeSec){
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "wide-btn";
  btn.textContent = timeSec ? `再生 (${timeSec}s)` : "試合動画再生";
  btn.addEventListener("click",(e)=>{
    e.stopPropagation();
    if(!videoId) return alert("紐づく動画がありません。");
    const url = timeSec ? `https://youtu.be/${videoId}?t=${timeSec}` : `https://youtu.be/${videoId}`;
    window.open(url,"_blank","noopener");
  });
  return btn;
}

/* ==========================================================
   スコア一覧読み込み（チーム絞り込み） + 描画
   - チームにログインしていない場合は「ログイン画面を表示」します
========================================================== */
async function loadScores(){
  const container = document.getElementById("scoreGroups");
  if(!container) return;

  ensureSearchBar();
  container.innerHTML = "";

  const team = JSON.parse(localStorage.getItem("teamInfo")||"null");
  if(!team){
    container.innerHTML = `<p class="muted small">チームにログインしてください。</p>`;
    return;
  }

  try{
    const db = window._firebaseDB;
    const { collection, query, where, getDocs } = window._firebaseFns;
    const scoresCol = collection(db,"scores");
    const q = query(scoresCol, where("teamName","==",team.teamName), where("inviteCode","==",team.inviteCode));
    const snap = await getDocs(q);

    scores = snap.docs.map(d=>({ id: d.id, ...d.data() }));

    // De-dup (safety)
    const seen = new Set();
    scores = scores.filter(s=>{
      if(!s.id || seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });

    // Sort newest first by date (robust)
    scores.sort((a,b)=> {
      const da = new Date(a.date || a.createdAt || 0);
      const db = new Date(b.date || b.createdAt || 0);
      return db - da;
    });

  }catch(err){
    console.error("loadScores firestore error", err);
    container.innerHTML = `<p class="muted small">データの読み込みに失敗しました。</p>`;
    return;
  }

  if(!scores.length){
    container.innerHTML = `<p class="muted small">まだ試合がありません。</p>`;
    return;
  }

  // filtered by search
  const filtered = scores.filter(it=>matchesSearch(it,currentSearchQuery));
  if(!filtered.length){
    container.innerHTML = `<p class="muted small">検索に一致する試合がありません。</p>`;
    return;
  }

  // group by month
  const groups = {};
  filtered.forEach((it, idx)=>{
    const d = new Date(it.date || it.createdAt || Date.now());
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    if(!groups[key]) groups[key] = { items: [], counts: { "公式戦":0,"カップ戦":0,"交流戦":0,"未設定":0 } };
    groups[key].items.push({ it, idx });
    const mt = it.matchType || "未設定";
    groups[key].counts[mt] = (groups[key].counts[mt]||0) + 1;
  });

  container.innerHTML = "";
  Object.keys(groups).sort((a,b)=>b.localeCompare(a)).forEach(key=>{
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
    if(collapsedMonths.includes(key)){ body.classList.add("hidden"); header.classList.add("closed"); }
    else { header.classList.add("open"); }

    groups[key].items.forEach(({it, idx})=>{
      const card = document.createElement("div");
      card.className = "score-card";

      if(typeof it.scoreA === "number" && typeof it.scoreB === "number"){
        if(it.scoreA > it.scoreB) card.classList.add("win");
        else if(it.scoreA < it.scoreB) card.classList.add("lose");
        else card.classList.add("draw");
      }

      const meta = document.createElement("div");
      meta.className = "meta";
      const icon = TYPE_ICON[it.matchType||""]||"🏳️";
      const typeClass = typeClassName(it.matchType||"");
      meta.innerHTML = `<div class="title"><span class="type-icon ${typeClass}">${icon}</span> ${it.date} — ${it.opponent}</div>
                        <div class="type-badge ${typeClass}">${it.matchType||"未設定"}</div>
                        <div class="sub match-venue">${it.place||""}</div>
                        <div class="sub">得点: ${it.scoreA ?? "-"} - ${it.scoreB ?? "-"}</div>`;

      // highlights
      if(Array.isArray(it.hlSeconds) && it.hlSeconds.length){
        const hlWrap = document.createElement("div");
        hlWrap.className = "hl-wrap";
        it.hlSeconds.forEach(sec=>{
          const btn = document.createElement("button");
          btn.type = "button"; btn.className = "hl-btn";
          btn.textContent = `ゴールシーン ${sec} 秒`;
          btn.addEventListener("click", e=>{
            e.stopPropagation();
            if(!it.videoId) return alert("紐づく動画がありません。");
            window.open(`https://youtu.be/${it.videoId}?t=${sec}`,"_blank","noopener");
          });
          hlWrap.appendChild(btn);
        });
        meta.appendChild(hlWrap);
      }

      card.appendChild(meta);

      // action row
      const actionRow = document.createElement("div");
      actionRow.className = "action-row";
      if(it.videoId) actionRow.appendChild(createPlayButton(it.videoId,null));
      else { const spacer = document.createElement("div"); spacer.style.flex="1 1 0"; actionRow.appendChild(spacer); }

      const editBtn = document.createElement("button");
      editBtn.type="button"; editBtn.className="wide-btn"; editBtn.textContent="編集";
      editBtn.addEventListener("click", async (e)=>{
        e.stopPropagation();
        const pass = prompt("編集にはパスワードが必要です。");
        if(pass !== "mino2025") return alert("パスワードが違います");
        openEditModal(idx, it.date, it.matchType||"", it.opponent, it.place, it.scoreA, it.scoreB, it.hlSeconds||[], it.videoId);
      });
      actionRow.appendChild(editBtn);

      const delBtn = document.createElement("button");
      delBtn.type="button"; delBtn.className="wide-btn danger"; delBtn.textContent="削除";
      delBtn.addEventListener("click", async (e)=>{
        e.stopPropagation();
        const pass = prompt("削除にはパスワードが必要です。");
        if(pass !== "mino2025") return alert("パスワードが違います");
        if(!confirm("この試合を削除しますか？")) return;
        if(!it.id) return alert("Firestore IDがありません");
        try{
          const ref = window._firebaseFns.doc(window._firebaseDB,"scores", it.id);
          await window._firebaseFns.deleteDoc(ref);
          alert("Firestoreから削除しました");
          await loadScores();
        }catch(err){ console.error(err); alert("削除失敗"); }
      });
      actionRow.appendChild(delBtn);

      if(!isAdmin()){ editBtn.style.display="none"; delBtn.style.display="none"; }

      card.appendChild(actionRow);
      body.appendChild(card);
    });

    group.appendChild(body);
    container.appendChild(group);

    // 折りたたみ
    header.addEventListener("click", ()=>{
      body.classList.toggle("hidden");
      const isHidden = body.classList.contains("hidden");
      if(isHidden){ header.classList.replace("open","closed"); if(!collapsedMonths.includes(key)) collapsedMonths.push(key); }
      else { header.classList.replace("closed","open"); collapsedMonths = collapsedMonths.filter(k=>k!==key); }
      localStorage.setItem("collapsedMonths", JSON.stringify(collapsedMonths));
    });
  });
}

/* ==========================================================
   編集モーダル（open/save/delete） — 既存ロジックをFirestorenames対応で維持
========================================================== */
function openEditModal(index,date,matchType,opponent,place,scoreA,scoreB,hlSeconds,videoId){
  window.currentEditIndex = index;
  document.getElementById("edit-date").value = date || "";
  document.getElementById("matchType").value = matchType || "";
  document.getElementById("edit-opponent").value = opponent || "";
  document.getElementById("edit-place").value = place || "";
  document.getElementById("edit-my-score").value = scoreA ?? "";
  document.getElementById("edit-opponent-score").value = scoreB ?? "";

  const hlList = document.getElementById("hlList");
  hlList.innerHTML = "";
  (Array.isArray(hlSeconds)?hlSeconds:[]).forEach(sec=> hlList.appendChild(createHlItemElement(sec)));

  renderVideoSelects(videoId);
  document.getElementById("editModal").classList.remove("hidden");
}

function closeEditModal(){
  const m = document.getElementById("editModal");
  if(m && !m.classList.contains("hidden")) m.classList.add("hidden");
  window.currentEditIndex = undefined;
}

function createHlItemElement(sec){
  const wrapper = document.createElement("div");
  wrapper.className="hl-item"; wrapper.style.display="flex"; wrapper.style.alignItems="center"; wrapper.style.gap="8px";
  const sp = document.createElement("span"); sp.textContent = `${sec} 秒`; sp.dataset.second = String(sec);
  const del = document.createElement("button"); del.type="button"; del.textContent="✕"; del.style.border="none"; del.style.background="transparent"; del.style.color="#c00"; del.style.cursor="pointer";
  del.addEventListener("click", ()=> wrapper.remove());
  wrapper.appendChild(sp); wrapper.appendChild(del);
  return wrapper;
}

/* ハイライト追加（編集モーダル）*/
function addHighlightTop(){
  const inp = document.getElementById("hlSeconds"); if(!inp) return;
  const v = (inp.value||"").trim(); if(!v) return alert("秒数を入力してください");
  const list = document.getElementById("hlList"); if(!list) return;
  list.appendChild(createHlItemElement(Number(v))); inp.value = "";
}

/* 保存（編集モーダル） */
async function saveEditGeneric(){
  if(window.currentEditIndex===undefined){ alert("編集対象が見つかりません"); return; }
  const current = scores[window.currentEditIndex]; if(!current || !current.id){ alert("Firestore IDがありません"); return; }

  const date = (document.getElementById("edit-date")?.value||"").trim();
  const matchType = (document.getElementById("matchType")?.value||"").trim();
  const opponent = (document.getElementById("edit-opponent")?.value||"").trim();
  const place = (document.getElementById("edit-place")?.value||"").trim();
  const myScoreVal = document.getElementById("edit-my-score")?.value;
  const opScoreVal = document.getElementById("edit-opponent-score")?.value;
  const videoSelect = document.getElementById("edit-video-select");
  const videoId = videoSelect?.value || null;

  const hlList = document.getElementById("hlList");
  const hlSeconds = [];
  if(hlList) Array.from(hlList.children).forEach(child=>{
    const span = child.querySelector("span"); if(!span) return;
    const n = Number(String(span.dataset.second||span.textContent).replace(" 秒","").trim());
    if(!isNaN(n)) hlSeconds.push(n);
  });

  try{
    const ref = window._firebaseFns.doc(window._firebaseDB,"scores", current.id);
    await window._firebaseFns.updateDoc(ref, {
      date, matchType, opponent, place,
      scoreA: myScoreVal===""?null:Number(myScoreVal),
      scoreB: opScoreVal===""?null:Number(opScoreVal),
      hlSeconds, videoId
    });
    alert("Firestore に保存しました！");
    closeEditModal();
    await loadScores();
  }catch(err){ console.error("saveEditGeneric err", err); alert("Firestore の更新に失敗しました"); }
}

/* 削除（編集モーダル） */
async function deleteCurrentMatch(){
  if(window.currentEditIndex===undefined) return;
  if(!confirm("この試合を削除しますか？")) return;
  const current = scores[window.currentEditIndex]; if(!current || !current.id) { alert("Firestore IDがありません"); return; }
  try{
    const ref = window._firebaseFns.doc(window._firebaseDB,"scores", current.id);
    await window._firebaseFns.deleteDoc(ref);
    alert("Firestore から削除しました");
    closeEditModal();
    await loadScores();
  }catch(err){ console.error("deleteCurrentMatch", err); alert("削除に失敗しました"); }
}

/* ==========================================================
   チーム参加 / 作成（Firestore対応・完全一致チェック）
   - 登録: teamName + inviteCode をペアで保存
   - ログイン時: ローカル teamInfo を保存して UI を切替
========================================================== */
function showBackButton(){ const btn = document.getElementById("btnBackLogin"); if(btn) btn.style.display = "block"; }

document.addEventListener("DOMContentLoaded", async ()=>{

  // 最初に videos を Firestore から読み込む（ログイン済みなら該当チームの動画）
  await loadVideosFromFirestore();

  // 初期スコア読み込み（ログインしていれば）
  await loadScores();

  // UI 初期状態
  document.getElementById("btnBackLogin").style.display = "none";
  document.getElementById("addVideoSection").style.display = "none";
  document.getElementById("createMatchSection").style.display = "none";
  document.getElementById("scoresSection").style.display = "none";

  // 各ボタンイベント
  document.getElementById("btnAddYouTube")?.addEventListener("click", ()=>{
    const url = (document.getElementById("youtubeUrl")?.value||"").trim();
    if(!url) return alert("URLを入力してください");
    addYouTubeVideo(url);
    document.getElementById("youtubeUrl").value="";
  });

  document.getElementById("btnCreateMatch")?.addEventListener("click", createMatch);
  document.getElementById("modalClose")?.addEventListener("click", closeEditModal);
  document.getElementById("saveEdit")?.addEventListener("click", saveEditGeneric);
  document.getElementById("deleteMatch")?.addEventListener("click", deleteCurrentMatch);
  document.getElementById("btnMarkGoal")?.addEventListener("click", addHighlightTop);

  document.getElementById("btnBackLogin")?.addEventListener("click", ()=>{
    document.getElementById("teamSection").style.display="block";
    document.getElementById("addVideoSection").style.display="none";
    document.getElementById("createMatchSection").style.display="none";
    document.getElementById("scoresSection").style.display="none";
    document.getElementById("teamNameInput").value="";
    document.getElementById("inviteCodeInput").value="";
    document.getElementById("btnBackLogin").style.display="none";
  });

  /* チーム参加/作成 */
  document.getElementById("btnJoin")?.addEventListener("click", async ()=>{
    const name = (document.getElementById("teamNameInput")?.value||"").trim();
    const code = (document.getElementById("inviteCodeInput")?.value||"").trim().toUpperCase();
    if(!name) return alert("チーム名を入力してください");
    if(!code) return alert("招待コードを入力してください");

    const db = window._firebaseDB;
    const { collection, getDocs, addDoc } = window._firebaseFns;
    const teamsCol = collection(db,"teams");

    try{
      // 既存チェック（全部読み出して自分で厳密チェック）
      const snap = await getDocs(teamsCol);
      let matched = null;
      let conflict = false;

      snap.docs.forEach(d=>{
        const data = d.data();
        if(data.teamName === name && data.inviteCode === code) matched = { id:d.id, ...data };
        else if(data.teamName === name || data.inviteCode === code) conflict = true;
      });

      if(matched){
        alert(`チーム "${matched.teamName}" にログインしました`);
      } else if(conflict){
        return alert("既に使用されています（チーム名または招待コードが重複しています）。別の組み合わせを指定してください。");
      } else {
        // 新規登録
        await addDoc(teamsCol, { teamName: name, inviteCode: code, createdAt: new Date().toISOString() });
        alert(`チーム "${name}" を新規登録しました`);
      }

      localStorage.setItem("teamInfo", JSON.stringify({ teamName: name, inviteCode: code }));

      // チームでフィルタした動画/試合を読み直す
      await loadVideosFromFirestore();
      await loadScores();

      // UI 切替
      document.getElementById("teamSection").style.display="none";
      document.getElementById("scoresSection").style.display="block";
      if(isAdmin()){
        document.getElementById("addVideoSection").style.display="block";
        document.getElementById("createMatchSection").style.display="block";
      } else {
        document.getElementById("addVideoSection").style.display="none";
        document.getElementById("createMatchSection").style.display="none";
      }

      showBackButton();

    }catch(err){
      console.error("team create/login error", err);
      alert("チーム登録/ログインでエラーが発生しました");
    }
  });

});
