/* main.js — Firestore 完全版（part 1/2）
   - チーム参加/作成（Firestore 上で重複チェック: チーム名 + 招待コード）
   - YouTube 動画追加（Firestore videos コレクション）
   - 試合作成（scores に teamName/inviteCode を保存）
   - 共通ユーティリティ / 描画ヘルパー
*/
/* --------- 追加：ベースチーム名抽出関数 --------- */
function makeBaseTeamName(name){
  if(!name) return "";
  const up = name.toUpperCase();
  if(up.endsWith("_ADMIN")){
    return name.slice(0, -6);   // "_ADMIN" を除去
  }
  return name; // 一般ユーザーはそのまま
}

let scores = [];
let videos = [];
let collapsedMonths = JSON.parse(localStorage.getItem("collapsedMonths")) || [];
let currentSearchQuery = "";
window.currentEditIndex = undefined;
// ▼ 新ゴール管理用（編集中の一時保存）
let editingHighlights = [];

function renderGoalTimelinePreview() {

  const goalTimelineList = document.getElementById("goalTimelineList");
  if (!goalTimelineList) return;

  goalTimelineList.innerHTML = "";

  const sorted = [...editingHighlights].sort((a,b)=>a.time-b.time);

  sorted.forEach((ev)=>{
    const div = document.createElement("div");
    div.style.cursor = "pointer";
    div.textContent =
      `${ev.time}' ${ev.team==="my"?"⚽ 得点シーン":"🔴 失点シーン"}  ✖`;

    div.addEventListener("click", ()=>{
      if(confirm("このゴールを削除しますか？")){
        const originalIndex = editingHighlights.findIndex(h =>
          h.time === ev.time && h.team === ev.team
        );
        if(originalIndex > -1){
          editingHighlights.splice(originalIndex,1);
        }
        renderGoalTimelinePreview();
      }
    });

    goalTimelineList.appendChild(div);
  });
}

/* ---------- ユーティリティ ---------- */
function log(...args){ console.log("[main.js]", ...args); }

function getTeam(){
  try { return JSON.parse(localStorage.getItem("teamInfo") || "null"); }
  catch(e){ return null; }
}
function setTeam(team){
  if(!team) localStorage.removeItem("teamInfo");
  else localStorage.setItem("teamInfo", JSON.stringify(team));
}

function isAdmin(){
  const t = getTeam();
  if(!t) return false;
  return t.teamName.toUpperCase().endsWith("_ADMIN");
}

/* ---------- ログイン後 UI 反映（メインメニュー or 管理者UI） ---------- */
async function applyTeamUI(showMainMenu = false){
  const admin = isAdmin();

  const teamSection = document.getElementById("teamSection");
  const addVideoSection = document.getElementById("addVideoSection");
  const createMatchSection = document.getElementById("createMatchSection");
  const scoresSection = document.getElementById("scoresSection");
  const backupSection = document.getElementById("backupSection");

  if(showMainMenu){
    // メインメニュー表示
    if(teamSection) teamSection.style.display = "block";
    if(addVideoSection) addVideoSection.style.display = "none";
    if(createMatchSection) createMatchSection.style.display = "none";
    if(scoresSection) scoresSection.style.display = "none";
    if(backupSection) backupSection.style.display = "none";

  // ★ これを追加（超重要）
  const portalMenu = document.getElementById("portalMenu");
  if(portalMenu) portalMenu.style.display = "none";
 
    // メインメニューでは BackButton 非表示
    const btn = document.getElementById("btnBackLogin");
    if(btn) btn.style.display = "none";

  } else {
  // ★ これを追加
const portalMenu = document.getElementById("portalMenu");
const team = getTeam();

if(portalMenu && team){
  const base = team.baseTeamName;   // ← 既に保存済み

  if(base === "箕谷SC-A" || base === "箕谷SC-B"){
    portalMenu.style.display = "block";
  } else {
    portalMenu.style.display = "none";
  }
}  
     
    // 管理者UI表示（動画追加・試合作成・スコア一覧など）
    if(teamSection) teamSection.style.display = "none";
    if(scoresSection) scoresSection.style.display = "block";

    if(addVideoSection) addVideoSection.style.display = admin ? "block" : "none";
    if(createMatchSection) createMatchSection.style.display = admin ? "block" : "none";
    if(backupSection) backupSection.style.display = admin ? "block" : "none";
 
    await loadVideosFromFirestore();
    await loadScores();

    // 管理者UIでは BackButton を表示
    showBackButton();
  }
}

/* ---------- Firestore バックアップ / 復元 ---------- */
async function backupAllFirestore(){
  if(!isAdmin()) return alert("管理者のみ実行可能です");
  try{
    const db = window._firebaseDB;
    const { collection, getDocs } = window._firebaseFns;
    const teamsSnap = await getDocs(collection(db,"teams"));
    const scoresSnap = await getDocs(collection(db,"scores"));
    const videosSnap = await getDocs(collection(db,"videos"));
    const data = {
      teams: teamsSnap.docs.map(d=>({ id:d.id, ...d.data() })),
      scores: scoresSnap.docs.map(d=>({ id:d.id, ...d.data() })),
      videos: videosSnap.docs.map(d=>({ id:d.id, ...d.data() })),
      createdAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data,null,2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `minotani_backup_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
     
    // ★ バックアップ日時を UI に反映
    const tsEl = document.getElementById("backupTimestamp");
    if(tsEl) tsEl.textContent = "最終バックアップ日時: " + new Date().toLocaleString(); 
     
    alert("バックアップをダウンロードしました");
  }catch(err){ console.error(err); alert("バックアップに失敗しました"); }
}

async function restoreBackupFile(file){
  if(!isAdmin()) return alert("管理者のみ実行可能です");
  try{
    const text = await file.text();
    const data = JSON.parse(text);
    const db = window._firebaseDB;
    const { doc, setDoc } = window._firebaseFns;

    // teams
    if(Array.isArray(data.teams)){
      for(const t of data.teams){
        if(!t.id) continue;
        await setDoc(doc(db,"teams",t.id), t);
      }
    }
    // scores
    if(Array.isArray(data.scores)){
      for(const s of data.scores){
        if(!s.id) continue;
        await setDoc(doc(db,"scores",s.id), s);
      }
    }
    // videos
    if(Array.isArray(data.videos)){
      for(const v of data.videos){
        if(!v.id) continue;
        await setDoc(doc(db,"videos",v.id), v);
      }
    }

    alert("バックアップを Firestore に復元しました");
    await loadVideosFromFirestore();
    await loadScores();
  }catch(err){ console.error(err); alert("復元に失敗しました"); }
}

/* YouTube ID 抽出（安全） */
function extractYouTubeId(url){
  try{
    const u = new URL(url);
    if(u.hostname.includes("youtu.be")) return u.pathname.slice(1);
    if(u.searchParams?.get("v")) return u.searchParams.get("v");
    return null;
  }catch(e){
    return null;
  }
}

/* 種別アイコン / CSS */
const TYPE_ICON = { "公式戦":"🏆", "カップ戦":"🎖️", "交流戦":"🤝", "":"🏳️" };
function typeClassName(matchType){
  if(!matchType) return "type-friendly";
  if(matchType==="公式戦") return "type-official";
  if(matchType==="カップ戦") return "type-cup";
  if(matchType==="交流戦") return "type-friendly";
  return "type-friendly";
}

/* local backup for videos (keeps select populated when offline) */
function saveVideosLocal(){ localStorage.setItem("videos", JSON.stringify(videos)); }
function loadVideosLocal(){ try{ videos = JSON.parse(localStorage.getItem("videos")||"[]"); }catch(e){ videos=[]; } }

/* ---------- 動画（Firestore）読み込み / 描画 ---------- */
/* チームに紐づく videos を読み込む */
async function loadVideosFromFirestore(){
  videos = [];

  const team = getTeam();
  if(!team){
    // 未ログイン時はローカル復元（あれば）
    loadVideosLocal();
    renderVideoSelects();
    return;
  }

  try{
    const db = window._firebaseDB;
    const { collection, query, where, getDocs } = window._firebaseFns;
    const videosCol = collection(db,"videos");
    const q = query(videosCol, where("teamName","==",team.teamName), where("inviteCode","==",team.inviteCode));
    const snap = await getDocs(q);
    videos = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    saveVideosLocal();
    log("loadVideosFromFirestore:", videos.length, "videos");
  }catch(err){
    console.error("loadVideosFromFirestore error", err);
    // フェールオーバーでローカル読み込み
    loadVideosLocal();
  } finally {
    renderVideoSelects();
  }
}

function groupVideosByYearMonth(videos){
  const map = {};
  videos.forEach(v=>{
    const d = new Date(v.createdAt || 0);
    if (isNaN(d)) return;
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    map[y] ??= {};
    map[y][m] ??= [];
    map[y][m].push(v);
  });
  return map;
}

/* 動画セレクトを create / edit 用に描画 */
function renderVideoSelectGroup(
  yearId,
  monthId,
  videoId,
  selectedVideoId
){
  const yearSel  = document.getElementById(yearId);
  const monthSel = document.getElementById(monthId);
  const videoSel = document.getElementById(videoId);

  if(!yearSel || !monthSel || !videoSel) return;

  const grouped = groupVideosByYearMonth(videos);

  // --- 年 ---
  yearSel.innerHTML = `<option value="">年を選択</option>`;
  Object.keys(grouped).sort((a,b)=>b-a).forEach(y=>{
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y + "年";
    yearSel.appendChild(opt);
  });

  monthSel.innerHTML = `<option value="">月を選択</option>`;
  videoSel.innerHTML = `<option value="">— 紐づけ動画なし —</option>`;
  monthSel.disabled = true;
  videoSel.disabled = true;

  yearSel.onchange = ()=>{
    const y = yearSel.value;
    monthSel.innerHTML = `<option value="">月を選択</option>`;
    videoSel.innerHTML = `<option value="">— 紐づけ動画なし —</option>`;
    videoSel.disabled = true;

    if(!y) return (monthSel.disabled = true);

    Object.keys(grouped[y]).sort((a,b)=>b-a).forEach(m=>{
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m + "月";
      monthSel.appendChild(opt);
    });
    monthSel.disabled = false;
  };

  monthSel.onchange = ()=>{
    const y = yearSel.value;
    const m = monthSel.value;
    videoSel.innerHTML = `<option value="">— 紐づけ動画なし —</option>`;

    if(!y || !m) return (videoSel.disabled = true);

    grouped[y][m].forEach(v=>{
      const opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = v.title || v.url || v.id;
      videoSel.appendChild(opt);
    });
    videoSel.disabled = false;

    if(selectedVideoId){
      videoSel.value = selectedVideoId;
    }
  };

  // --- 編集時：既存選択を復元 ---
  if(selectedVideoId){
    const v = videos.find(v=>v.id === selectedVideoId);
    if(v?.createdAt){
      const d = new Date(v.createdAt);
      if(!isNaN(d)){
        yearSel.value = d.getFullYear();
        yearSel.dispatchEvent(new Event("change"));
        monthSel.value = d.getMonth() + 1;
        monthSel.dispatchEvent(new Event("change"));
        videoSel.value = selectedVideoId;
      }
    }
  }
}

function renderVideoSelects(selectedVideoId){
  renderVideoSelectGroup(
    "videoYear",
    "videoMonth",
    "videoSelect",
    selectedVideoId
  );

  renderVideoSelectGroup(
    "editVideoYear",
    "editVideoMonth",
    "edit-video-select",
    selectedVideoId
  );
}

/* ---------- YouTube 動画追加（Firestore 保存） ---------- */
async function addYouTubeVideo(url){
  const id = extractYouTubeId(url);
  if(!id) return alert("YouTube のURLが正しくありません。");

  // ローカル直チェック
  if(videos.find(v=>v.id===id)) return alert("この動画は既に追加済みです。");

  let title = url;
  try{
    const res = await fetch(`https://www.youtube.com/oembed?url=https://youtu.be/${id}&format=json`);
    if(res.ok){ const data = await res.json(); title = data.title; }
  }catch(err){ console.warn("oembed failed", err); }

  const team = getTeam();
  if(!team) return alert("チームにログインしてください");

  try{
    const db = window._firebaseDB;
    const { collection, addDoc } = window._firebaseFns;
    const videosCol = collection(db,"videos");

// ★ ここ追加！！
const { query, where, getDocs } = window._firebaseFns;

const q = query(
  videosCol,
  where("teamName","==",team.teamName),
  where("inviteCode","==",team.inviteCode),
  where("id","==",id)
);

const snap = await getDocs(q);

if(!snap.empty){
  return alert("この動画は既に追加されています（Firestore）");
}
 
    const payload = {
      id, url, title,
      teamName: team.teamName,
      inviteCode: team.inviteCode,
      createdAt: new Date().toISOString()
    };

    await addDoc(videosCol, payload);
    // 再読み込み
    await loadVideosFromFirestore();
    alert("YouTube 動画を追加しました（Firestore 保存）");
  }catch(err){
    console.error("addYouTubeVideo error", err);
    // 追加失敗 → ローカルだけ保存しておく（オフライン時の救済）
    videos.push({ id, url, title });
    saveVideosLocal();
    renderVideoSelects();
    alert("動画の保存に失敗しました（Firestore）。ローカルには保存しました。");
  }
}

/* ========== ここまで part 1/2 ========== */

/* main.js — Firestore 完全版（part 2/2）
   - 試合作成 / 読み込み / 描画 / 編集 / 削除
   - チーム参加（完全一致チェック）
   - UI イベント登録
*/

/* ---------- 試合作成（Firestore） ---------- */
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
  const scoreA = myScoreEl?.value;
  const scoreB = opScoreEl?.value;

const pkScoreAEl = document.getElementById("pkA");
const pkScoreBEl = document.getElementById("pkB");
 
  const videoId = videoSelect?.value || null;

  if(!date || !opponent) return alert("日付と対戦相手は必須です");

  const team = getTeam();
  if(!team) return alert("チームにログインしてください");

  const payload = {
    teamName: team.teamName,
    inviteCode: team.inviteCode,
  baseTeamName: team.baseTeamName,    // ★ 追加 
    date,
    matchType,
    opponent,
    place,
    scoreA: scoreA === "" ? null : Number(scoreA),
    scoreB: scoreB === "" ? null : Number(scoreB),
  pkScoreA: pkScoreAEl?.value === "" ? null : Number(pkScoreAEl.value),
  pkScoreB: pkScoreBEl?.value === "" ? null : Number(pkScoreBEl.value),     
    videoId,
    hlSeconds: [],
    createdAt: new Date().toISOString()
  };

  try{
    const db = window._firebaseDB;
    const { collection, addDoc } = window._firebaseFns;
    await addDoc(collection(db,"scores"), payload);
    alert("試合を作成して Firestore に保存しました");
    await loadScores();
  }catch(err){
    console.error("createMatch error", err);
    alert("試合作成に失敗しました");
  } finally {
    // clear inputs
    dateEl.value = "";
    if(typeEl) typeEl.value = "";
    oppEl.value = "";
    if(placeEl) placeEl.value = "";
    if(myScoreEl) myScoreEl.value = "";
    if(opScoreEl) opScoreEl.value = "";
    if(pkScoreAEl) pkScoreAEl.value = "";
    if(pkScoreBEl) pkScoreBEl.value = "";

    // ★ 動画セレクト完全リセット（ここが重要）
    const yearSel  = document.getElementById("videoYear");
    const monthSel = document.getElementById("videoMonth");

    if(yearSel) yearSel.value = "";

    if(monthSel){
      monthSel.value = "";
      monthSel.innerHTML = `<option value="">月を選択</option>`;
      monthSel.disabled = true;
    }

    if(videoSelect){
      videoSelect.value = "";
      videoSelect.innerHTML = `<option value="">— 紐づけ動画なし —</option>`;
      videoSelect.disabled = true;
    }
  }
}

/* ---------- 検索/描画ヘルパー ---------- */
function ensureSearchBar(){
  const sec = document.getElementById("scoresSection");
  if(!sec) return;
  if(document.getElementById("scoreSearchBar")) return;
  const input = document.createElement("input");
  input.id = "scoreSearchBar";
  input.className = "search-input";
  input.placeholder = "検索：種別・相手・会場・日付・得点・秒数";
  input.addEventListener("input", (e)=>{
    currentSearchQuery = (e.target.value||"").trim().toLowerCase();
    loadScores();
  });
  const h2 = sec.querySelector("h2");
  if(h2) h2.after(input);
}
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

// ===== 月別成績 集計 =====
function calcMonthlyStats(items){
  const result = {
    total: { games:0, win:0, lose:0, draw:0, goals:0, conceded:0 },
    byType: {}
  };

  items.forEach(it=>{
    if(typeof it.scoreA !== "number" || typeof it.scoreB !== "number") return;

    const t = it.matchType || "未設定";
    result.byType[t] ??= { games:0, win:0, lose:0, draw:0 };

    result.total.games++;
    result.byType[t].games++;

    result.total.goals += it.scoreA;
    result.total.conceded += it.scoreB;

    if(it.scoreA > it.scoreB){
      result.total.win++; result.byType[t].win++;
    }else if(it.scoreA < it.scoreB){
      result.total.lose++; result.byType[t].lose++;
    }else{
      result.total.draw++; result.byType[t].draw++;
    }
  });

  return result;
}

// --- 勝率アニメーション関数 ---
function animateWinRate(el, barEl, target) {
  if (!el || !barEl) return;

  let current = 0;
  const duration = 1000;
  const startTime = performance.now();

  el.textContent = "勝率：0%";
  barEl.style.width = "0%";

  function update(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);

    current = Math.floor(target * eased);

    el.textContent = `勝率：${current}%`;
    barEl.style.width = current + "%";

    if (progress < 1) requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}

// --- 安全に勝率描画・アニメーション ---
function renderWinRate(statsBlock, winRate){
  if (!statsBlock) return;
  const winRateEl = statsBlock.querySelector(".win-rate");
  const winBar = statsBlock.querySelector(".win-bar-inner");
  if(!winRateEl || !winBar) return;

  // --- 前回値をリセット（毎回ゼロからスタート） ---
  winRateEl.dataset.current = 0;  // 数字用
  winBar.style.width = "0%";      // バー幅リセット

  // --- クラス付与 ---
  winRateEl.classList.remove("win-high","win-mid","win-low");
  winBar.classList.remove("win-high","win-mid","win-low");

  if(winRate >= 70){
    winRateEl.classList.add("win-high");
    winBar.classList.add("win-high");
  } else if(winRate >= 50){
    winRateEl.classList.add("win-mid");
    winBar.classList.add("win-mid");
  } else {
    winRateEl.classList.add("win-low");
    winBar.classList.add("win-low");
  }

  // --- アニメーション実行 ---
  requestAnimationFrame(() => animateWinRate(winRateEl, winBar, winRate));
}

/* YouTube 再生ボタン（ヘルパー） */
function createPlayButton(videoId, timeSec){
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "wide-btn";
  btn.textContent = timeSec ? `再生 (${timeSec}s)` : "試合動画再生";
  btn.addEventListener("click", (e)=>{
    e.stopPropagation();
    if(!videoId) return alert("紐づく動画がありません。");
    const url = timeSec ? `https://youtu.be/${videoId}?t=${timeSec}` : `https://youtu.be/${videoId}`;
    window.open(url,"_blank","noopener");
  });
  return btn;
}

/* ---------- スコア一覧読み込み（チームフィルタ） + 描画 ---------- */
async function loadScores(){
  const container = document.getElementById("scoreGroups");
  if(!container) return;

  ensureSearchBar();
  container.innerHTML = "";

  const team = getTeam();
  if(!team){
    container.innerHTML = `<p class="muted small">チームにログインしてください。</p>`;
    return;
  }

  try{
    const db = window._firebaseDB;
    const { collection, query, where, getDocs } = window._firebaseFns;
    const scoresCol = collection(db,"scores");
const q = query(scoresCol, 
  where("baseTeamName","==",team.baseTeamName)
);

    const snap = await getDocs(q);
    scores = snap.docs.map(d=>({ id:d.id, ...d.data() }));

    // dedup
    const seen = new Set();
    scores = scores.filter(s=>{ if(!s.id || seen.has(s.id)) return false; seen.add(s.id); return true; });

    // sort by date/newest first
    scores.sort((a,b)=>{
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

  const filtered = scores.filter(it => matchesSearch(it, currentSearchQuery));
  if(!filtered.length){ container.innerHTML = `<p class="muted small">検索に一致する試合がありません。</p>`; return; }

  // group by YYYY-MM
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

// ===== 月別成績ブロック =====
const monthStats = calcMonthlyStats(
  groups[key].items.map(v => v.it)
);

const statsBlock = document.createElement("div");
statsBlock.className = "month-summary-card";

const winRate = monthStats.total.games
  ? Math.round((monthStats.total.win / monthStats.total.games) * 100)
  : 0;

const diff = monthStats.total.goals - monthStats.total.conceded;

statsBlock.innerHTML = `
  <h3>📊 ${key.replace("-", "年")}月 成績</h3>

<div class="block total-block">
  <p><strong>総合</strong></p>
  <p>${monthStats.total.games}試合｜${monthStats.total.win}勝 ${monthStats.total.lose}敗 ${monthStats.total.draw}分</p>
  <p class="win-rate">勝率：${winRate}%</p>

  <!-- ★ ここ追加（勝率バー） -->
  <div class="win-bar">
    <div class="win-bar-inner" style="width:${winRate}%"></div>
  </div>

  <p>得点：${monthStats.total.goals}　失点：${monthStats.total.conceded}</p>
  <p>得失点差：${diff >= 0 ? "+" + diff : diff}</p>
</div>

  <div class="type-list">
    ${Object.entries(monthStats.byType).map(([type,v])=>`
      <div class="type-row">
        <span class="type-name">${type}</span>
        <span class="type-result">
          ${v.games}試合 ${v.win}勝${v.lose}敗${v.draw}分
        </span>
      </div>
    `).join("")}
  </div>
`;

const body = document.createElement("div");
body.className = "month-body";  

// ★ 月別成績を先頭に追加
body.appendChild(statsBlock);
    
/* ===== ここに追加 ===== */
const winRateEl = statsBlock.querySelector(".win-rate");
const winBar = statsBlock.querySelector(".win-bar-inner");

if(winRateEl && winBar){

  winRateEl.classList.remove("win-high","win-mid","win-low");
  winBar.classList.remove("win-high","win-mid","win-low");

  if(winRate >= 70){
    winRateEl.classList.add("win-high");
    winBar.classList.add("win-high");
  }else if(winRate >= 50){
    winRateEl.classList.add("win-mid");
    winBar.classList.add("win-mid");
  }else{
    winRateEl.classList.add("win-low");
    winBar.classList.add("win-low");
  }

  // ★ アニメーション実行
  animateWinRate(winRateEl, winBar, winRate);
}
    
    if(collapsedMonths.includes(key)){ body.classList.add("hidden"); header.classList.add("closed"); }
    else header.classList.add("open");

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

let scoreText = `${it.scoreA ?? "-"} - ${it.scoreB ?? "-"}`;
if(it.pkScoreA != null && it.pkScoreB != null){
  scoreText += ` （PK ${it.pkScoreA} - ${it.pkScoreB}）`;
}

meta.innerHTML = `<div class="title"><span class="type-icon ${typeClass}">${icon}</span> ${it.date} — ${it.opponent}</div>
                  <div class="type-badge ${typeClass}">${it.matchType||"未設定"}</div>
                  <div class="sub match-venue">${it.place||""}</div>
                  <div class="sub">得点: ${scoreText}</div>`;     

// highlights（新方式）
if(Array.isArray(it.highlights) && it.highlights.length){
  const hlWrap = document.createElement("div");
  hlWrap.className = "hl-wrap";

  it.highlights
    .sort((a,b)=>a.time-b.time)
    .forEach(ev=>{
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hl-btn";  
btn.textContent = `${ev.time}' ${ev.team==="my"?"⚽ 得点シーン":"🔴 失点シーン"}`;

      btn.addEventListener("click", e=>{
        e.stopPropagation();
        if(!it.videoId) return alert("紐づく動画がありません。");
        window.open(`https://youtu.be/${it.videoId}?t=${ev.time}`,"_blank","noopener");
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

header.addEventListener("click", ()=>{
  body.classList.toggle("hidden");
  const isHidden = body.classList.contains("hidden");
  if(isHidden){
    header.classList.replace("open","closed");
    if(!collapsedMonths.includes(key)) collapsedMonths.push(key);
  } else {
    header.classList.replace("closed","open");
    collapsedMonths = collapsedMonths.filter(k=>k!==key);

    // ★ 折りたたみ開いたときに勝率バーを毎回アニメーション
    const statsBlock = body.querySelector(".month-summary-card");
    if(statsBlock){
      const monthStats = calcMonthlyStats(
        groups[key].items.map(v => v.it)
      );
      const winRate = monthStats.total.games
        ? Math.round((monthStats.total.win / monthStats.total.games) * 100)
        : 0;
      renderWinRate(statsBlock, winRate);
    }
  }
  localStorage.setItem("collapsedMonths", JSON.stringify(collapsedMonths));
});

  }); // end groups loop
}

/* ---------- 編集モーダル関連（open/save/delete/highlight） ---------- */
function openEditModal(index,date,matchType,opponent,place,scoreA,scoreB,hlSeconds,videoId){

  // ★ ① 編集用ハイライトを必ずリセット
  editingHighlights = [];

  // ★ ② 既存データがあれば復元（ここが超重要）
  if(scores[index] && Array.isArray(scores[index].highlights)){
    editingHighlights = [...scores[index].highlights];
  }

  // ★ ③ プレビュー再描画
  renderGoalTimelinePreview();

  window.currentEditIndex = index;

  document.getElementById("edit-date").value = date || "";
  document.getElementById("matchType").value = matchType || "";
  document.getElementById("edit-opponent").value = opponent || "";
  document.getElementById("edit-place").value = place || "";
  document.getElementById("edit-my-score").value = scoreA ?? "";
  document.getElementById("edit-opponent-score").value = scoreB ?? "";

  renderVideoSelects(videoId);

  document.getElementById("editModal").classList.remove("hidden");
}

function closeEditModal(){ const m=document.getElementById("editModal"); if(m && !m.classList.contains("hidden")) m.classList.add("hidden"); window.currentEditIndex = undefined; }
function createHlItemElement(sec){
  const wrapper = document.createElement("div");
  wrapper.className = "hl-item"; wrapper.style.display="flex"; wrapper.style.alignItems="center"; wrapper.style.gap="8px";
  const sp = document.createElement("span"); sp.textContent = `${sec} 秒`; sp.dataset.second = String(sec);
  const del = document.createElement("button"); del.type="button"; del.textContent="✕"; del.style.border="none"; del.style.background="transparent"; del.style.color="#c00"; del.style.cursor="pointer";
  del.addEventListener("click", ()=> wrapper.remove());
  wrapper.appendChild(sp); wrapper.appendChild(del);
  return wrapper;
}
function addHighlightTop(){ const inp=document.getElementById("hlSeconds"); if(!inp) return; const v=(inp.value||"").trim(); if(!v) return alert("秒数を入力してください"); const list=document.getElementById("hlList"); if(!list) return; list.appendChild(createHlItemElement(Number(v))); inp.value=""; }

async function saveEditGeneric(){
  if(window.currentEditIndex===undefined){ alert("編集対象が見つかりません"); return; }
  const current = scores[window.currentEditIndex]; if(!current || !current.id){ alert("Firestore IDがありません"); return; }

  const date = (document.getElementById("edit-date")?.value||"").trim();
  const matchType = (document.getElementById("matchType")?.value||"").trim();
  const opponent = (document.getElementById("edit-opponent")?.value||"").trim();
  const place = (document.getElementById("edit-place")?.value||"").trim();
  const myScoreVal = document.getElementById("edit-my-score")?.value;
  const opScoreVal = document.getElementById("edit-opponent-score")?.value;
  
const pkScoreAVal = document.getElementById("edit-pkA")?.value;
const pkScoreBVal = document.getElementById("edit-pkB")?.value;

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
       
  pkScoreA: pkScoreAVal==="" ? null : Number(pkScoreAVal),
  pkScoreB: pkScoreBVal==="" ? null : Number(pkScoreBVal),
highlights: editingHighlights,
videoId
    });
    alert("Firestore に保存しました！");
    closeEditModal();
    await loadScores();
  }catch(err){ console.error("saveEditGeneric err", err); alert("Firestore の更新に失敗しました"); }
}

async function deleteCurrentMatch(){
  if(window.currentEditIndex===undefined) return;
  if(!confirm("この試合を削除しますか？")) return;
  const current = scores[window.currentEditIndex]; if(!current || !current.id){ alert("Firestore IDがありません"); return; }
  try{
    const ref = window._firebaseFns.doc(window._firebaseDB,"scores", current.id);
    await window._firebaseFns.deleteDoc(ref);
    alert("Firestore から削除しました");
    closeEditModal();
    await loadScores();
  }catch(err){ console.error("deleteCurrentMatch", err); alert("削除に失敗しました"); }
}

/* ---------- チーム参加 / 作成（Firestore 完全一致チェック） & UI 初期化 ---------- */
function showBackButton(){ const btn=document.getElementById("btnBackLogin"); if(btn) btn.style.display="block"; }

document.addEventListener("DOMContentLoaded", async ()=>{

  // --- 初期 UI はすべて非表示 ---
  const btnBack = document.getElementById("btnBackLogin");
  if(btnBack) btnBack.style.display = "none";

  const addVideoSection = document.getElementById("addVideoSection");
  if(addVideoSection) addVideoSection.style.display = "none";
  const createMatchSection = document.getElementById("createMatchSection");
  if(createMatchSection) createMatchSection.style.display = "none";
  const scoresSection = document.getElementById("scoresSection");
  if(scoresSection) scoresSection.style.display = "none";
  const backupSection = document.getElementById("backupSection");
  if(backupSection) backupSection.style.display = "none";

  // --- local videos を復元しておく ---
  loadVideosLocal();
  await loadVideosFromFirestore();
  await loadScores();

  // --- チームがログイン済みなら UI を反映 ---
  const team = getTeam();
  if (team) {
    await applyTeamUI(true); // ← trueでメインメニュー表示
  } else {
    const teamSection = document.getElementById("teamSection");
    if(teamSection) teamSection.style.display = "block";
  }

  // --- btnBack イベント登録 ---
  btnBack?.addEventListener("click", ()=>{
    document.getElementById("teamNameInput").value = "";
    document.getElementById("inviteCodeInput").value = "";
    applyTeamUI(true);  // ← BackButton を非表示にしてメインメニューを表示
  });

  // --- 他のボタン登録 ---
  document.getElementById("btnBackupAllFirestore")?.addEventListener("click", backupAllFirestore);
  document.getElementById("btnRestoreBackup")?.addEventListener("click", () => {
    document.getElementById("uploadBackupFile")?.click();
  });
  document.getElementById("uploadBackupFile")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm(`"${file.name}" を Firestore に復元しますか？`)) {
      e.target.value = "";
      return;
    }
    await restoreBackupFile(file);
    e.target.value = "";
  });

  document.getElementById("btnAddYouTube")?.addEventListener("click", ()=>{
    const url = (document.getElementById("youtubeUrl")?.value||"").trim();
    if(!url) return alert("URLを入力してください");
    addYouTubeVideo(url);
    document.getElementById("youtubeUrl").value = "";
  });

  document.getElementById("btnCreateMatch")?.addEventListener("click", createMatch);
  document.getElementById("modalClose")?.addEventListener("click", closeEditModal);
  document.getElementById("saveEdit")?.addEventListener("click", saveEditGeneric);
  document.getElementById("deleteMatch")?.addEventListener("click", deleteCurrentMatch);

  // --- ゴール追加ボタン（統一版） ---
  const goalTimeInput = document.getElementById("goalTime");
  const btnAddMyGoal = document.getElementById("btnAddMyGoal");
  const btnAddOpponentGoal = document.getElementById("btnAddOpponentGoal");

  function addGoal(teamType) {
    if (!goalTimeInput) return;

    const raw = goalTimeInput.value.trim();
    if (!raw) return alert("秒数を入力してください");

    const sec = parseInt(raw, 10);
    if (isNaN(sec) || sec <= 0) return alert("0秒以下は登録できません");

    // 重複チェック
    if(editingHighlights.some(h => h.time === sec && h.team === teamType)){
      return alert(`${sec}秒はすでに登録されています`);
    }

    editingHighlights.push({ time: sec, team: teamType });

    goalTimeInput.value = "";
    renderGoalTimelinePreview();
  }

  btnAddMyGoal?.addEventListener("click", () => addGoal("my"));
  btnAddOpponentGoal?.addEventListener("click", () => addGoal("opponent"));

  // --- チーム参加/作成 ---
  document.getElementById("btnJoin")?.addEventListener("click", async () => {
    const nameEl = document.getElementById("teamNameInput");
    const codeEl = document.getElementById("inviteCodeInput");
    const name = (nameEl?.value || "").trim();
    const code = (codeEl?.value || "").trim().toUpperCase();
    if (!name) return alert("チーム名を入力してください");
    if (!code) return alert("招待コードを入力してください");

    const db = window._firebaseDB;
    const { collection, getDocs, addDoc } = window._firebaseFns;
    const teamsCol = collection(db, "teams");

    try {
      const snap = await getDocs(teamsCol);
      let matched = null;
      let nameMatch = false;
      let codeMatch = false;

      snap.docs.forEach(d => {
        const data = d.data();
        if (data.teamName === name && data.inviteCode === code) matched = { id: d.id, ...data };
        else { if (data.teamName === name) nameMatch = true; if (data.inviteCode === code) codeMatch = true; }
      });

      if (!matched && nameMatch && !codeMatch) return alert("チーム名は一致していますが招待コードが違います。正しい招待コードを入力してください。");
      if (!matched && !nameMatch && codeMatch) return alert("招待コードは一致していますがチーム名が違います。正しいチーム名を入力してください。");

      if (matched) {
        setTeam({
          teamName: matched.teamName,
          inviteCode: matched.inviteCode,
          baseTeamName: makeBaseTeamName(matched.teamName)
        });
      updateTeamHistory(matched.teamName);
      updateInviteHistory(code);
        alert(`チーム "${matched.teamName}" にログインしました`);
        await applyTeamUI();
        return;
      }

      const ok = confirm(`チーム "${name}" は存在しません。\n新規作成しますか？`);
      if (!ok) return alert("チーム作成をキャンセルしました。");

      const newRef = await addDoc(teamsCol, { teamName: name, inviteCode: code, createdAt: new Date().toISOString() });
      setTeam({ teamName: name, inviteCode: code, baseTeamName: makeBaseTeamName(name) });
updateTeamHistory(name);
updateInviteHistory(code);
      alert(`チーム "${name}" を新規登録しました`);
      await applyTeamUI();
    }
    catch (err) { console.error("team create/login error", err); alert("チーム登録/ログインでエラーが発生しました"); }
  });

// --- チーム名入力でサジェスト表示 ---
document.getElementById("teamNameInput")?.addEventListener("input", (e)=>{
  showTeamSuggestions(e.target.value);
});

// --- 招待コード入力でサジェスト表示 ---
document.getElementById("inviteCodeInput")?.addEventListener("input", (e)=>{
  showInviteSuggestions(e.target.value);
});

});

/* ===== チーム名サジェスト ===== */

function showTeamSuggestions(value){
  const box = document.getElementById("teamSuggestions");
  if(!box) return;

  box.innerHTML = "";

  const history = JSON.parse(localStorage.getItem("teamHistory") || "[]");

  const filtered = history.filter(name =>
    name.toLowerCase().includes(value.toLowerCase())
  );

  if(filtered.length === 0){
    box.classList.remove("show");
    return;
  }

  filtered.forEach(name=>{
    const div = document.createElement("div");
    div.textContent = name;

    div.onclick = ()=>{
      document.getElementById("teamNameInput").value = name;
      box.classList.remove("show");
    };

    box.appendChild(div);
  });

  box.classList.add("show");
}

function updateTeamHistory(name){
  if(!name) return;

  let history = JSON.parse(localStorage.getItem("teamHistory") || "[]");

  if(!history.includes(name)){
    history.push(name);
    localStorage.setItem("teamHistory", JSON.stringify(history));
  }
}


/* ===== 招待コードサジェスト ===== */

function showInviteSuggestions(value){
  const box = document.getElementById("inviteSuggestions");
  if(!box) return;

  box.innerHTML = "";

  const history = JSON.parse(localStorage.getItem("inviteHistory") || "[]");

  const filtered = history.filter(code =>
    code.toLowerCase().includes(value.toLowerCase())
  );

  if(filtered.length === 0){
    box.classList.remove("show");
    return;
  }

  filtered.forEach(code=>{
    const div = document.createElement("div");
    div.textContent = code;

    div.onclick = ()=>{
      document.getElementById("inviteCodeInput").value = code;
      box.classList.remove("show");
    };

    box.appendChild(div);
  });

  box.classList.add("show");
}

function updateInviteHistory(code){
  if(!code) return;

  let history = JSON.parse(localStorage.getItem("inviteHistory") || "[]");

  if(!history.includes(code)){
    history.push(code);
    localStorage.setItem("inviteHistory", JSON.stringify(history));
  }
}
