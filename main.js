/* main.js — チーム管理＆保護者ログイン対応版
   元機能：検索 / ハイライト / 秒数クリック再生 / 編集 / 削除 / 種別表示
*/

let scores = []; // Firestoreから読み込む
let videos = [];
let collapsedMonths = JSON.parse(localStorage.getItem("collapsedMonths")) || [];
window.currentEditIndex = undefined;
let currentSearchQuery = "";

// 現在ログイン中のチーム情報
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
const TYPE_ICON = { "公式戦":"🏆", "カップ戦":"🎖️", "交流戦":"🤝", "":"🏳️" };
function typeClassName(matchType){
  if(!matchType) return "type-friendly";
  if(matchType==="公式戦") return "type-official";
  if(matchType==="カップ戦") return "type-cup";
  if(matchType==="交流戦") return "type-friendly";
  return "type-friendly";
}

/* ------------------------------
   動画セレクト描画
------------------------------ */
function renderVideoSelects(selectedForEdit) {
  const videoSelect = document.getElementById("videoSelect");
  if(videoSelect){
    videoSelect.innerHTML=`<option value="">— 紐づけ動画なし —</option>`;
    videos.forEach(v=>{
      const opt=document.createElement("option");
      opt.value=v.id;
      opt.textContent=v.title||v.url;
      videoSelect.appendChild(opt);
    });
  }

  const editSel = document.getElementById("edit-video-select");
  if(editSel){
    editSel.innerHTML=`<option value="">— 紐づけ動画なし —</option>`;
    videos.forEach(v=>{
      const opt=document.createElement("option");
      opt.value=v.id;
      opt.textContent=v.title||v.url;
      editSel.appendChild(opt);
    });
    editSel.value=selectedForEdit||"";
  }
}

/* YouTube動画追加 */
async function addYouTubeVideo(url){
  const id = extractYouTubeId(url);
  if(!id) return alert("YouTube のURLが正しくありません。");
  if(videos.find(v=>v.id===id)) return alert("この動画は既に追加済みです。");

  let title=url;
  try{
    const res = await fetch(`https://www.youtube.com/oembed?url=https://youtu.be/${id}&format=json`);
    if(res.ok){ const data=await res.json(); title=data.title; }
  }catch(err){ console.warn("タイトル取得失敗",err); }

  videos.push({id,url,title});
  localStorage.setItem("videos",JSON.stringify(videos));
  renderVideoSelects();
  alert("YouTube 動画を追加しました！");
}

/* ------------------------------
   チーム参加 / 作成
------------------------------ */
async function joinTeam(){
  console.log("joinTeam called");
  const name = (document.getElementById("teamNameInput")?.value||"").trim();
  const code = (document.getElementById("inviteCodeInput")?.value||"").trim().toUpperCase();
  if(!name) return alert("チーム名を入力してください");
  if(!code) return alert("招待コードを入力してください");

  const db = window._firebaseDB;
  const { collection, addDoc, getDocs, query, where, doc, setDoc } = window._firebaseFns;

  // Firestoreのteamsコレクションを確認
  const q = query(collection(db,"teams"),where("inviteCode","==",code));
  const snap = await getDocs(q);

  let teamData = null;
  if(snap.empty){
    // 作成：管理者
    const newDocRef = doc(collection(db,"teams"));
    teamData = {
      teamName:name,
      inviteCode:code,
      isAdmin:true,
      createdAt:new Date().toISOString()
    };
    await setDoc(newDocRef,teamData);
  } else {
    // 既存チーム：保護者
    const docSnap = snap.docs[0];
    teamData = { id:docSnap.id, ...docSnap.data(), isAdmin:false };
  }

  saveLocalTeam(teamData);

  document.getElementById("teamSection").style.display="none";
  document.getElementById("scoresSection").style.display="block";
  if(isAdmin()){
    document.getElementById("addVideoSection").style.display="block";
    document.getElementById("createMatchSection").style.display="block";
  }else{
    document.getElementById("addVideoSection").style.display="none";
    document.getElementById("createMatchSection").style.display="none";
  }

  alert(`チーム参加しました！ チーム名: ${teamData.teamName}`);
  showBackButton();
  await loadScores();
}

// ▼ DOMContentLoadedでボタン登録
document.addEventListener("DOMContentLoaded",()=>{
  renderVideoSelects();
  loadScores();

  document.getElementById("btnBackLogin").style.display="none";
  document.getElementById("addVideoSection").style.display="none";
  document.getElementById("createMatchSection").style.display="none";
  document.getElementById("scoresSection").style.display="none";

  document.getElementById("btnAddYouTube")?.addEventListener("click",()=>{
    const url=(document.getElementById("youtubeUrl")?.value||"").trim();
    if(!url)return alert("URLを入力してください");
    addYouTubeVideo(url);
    document.getElementById("youtubeUrl").value="";
  });

  document.getElementById("btnJoin")?.addEventListener("click",joinTeam);
});

/* ------------------------------
   試合作成・編集
------------------------------ */
async function createMatch() {
  const db = window._firebaseDB;
  const { collection, addDoc } = window._firebaseFns;

  const matchType = document.getElementById("matchTypeCreate")?.value || "";
  const matchDate = document.getElementById("matchDate")?.value || "";
  const opponent = document.getElementById("opponent")?.value || "";
  const place = document.getElementById("place")?.value || "";
  const scoreA = parseInt(document.getElementById("scoreA")?.value||"0");
  const scoreB = parseInt(document.getElementById("scoreB")?.value||"0");
  const pkA = parseInt(document.getElementById("pkA")?.value||"0");
  const pkB = parseInt(document.getElementById("pkB")?.value||"0");
  const videoId = document.getElementById("videoSelect")?.value || "";

  if(!matchDate || !opponent) return alert("日付と対戦相手は必須です。");

  const team = getLocalTeam();
  const newMatch = {
    matchType, matchDate, opponent, place,
    scoreA, scoreB, pkA, pkB,
    videoId,
    teamId:team.id || team.inviteCode,
    createdAt: new Date().toISOString(),
    highlights: []
  };

  await addDoc(collection(db,"matches"),newMatch);
  alert("試合を作成しました！");
  clearMatchForm();
  await loadScores();
}

function clearMatchForm(){
  document.getElementById("matchTypeCreate").value="";
  document.getElementById("matchDate").value="";
  document.getElementById("opponent").value="";
  document.getElementById("place").value="";
  document.getElementById("scoreA").value="";
  document.getElementById("scoreB").value="";
  document.getElementById("pkA").value="";
  document.getElementById("pkB").value="";
  document.getElementById("videoSelect").value="";
}

/* ------------------------------
   スコア一覧描画
------------------------------ */
function renderScores(filterText=""){
  const scoreGroups = document.getElementById("scoreGroups");
  scoreGroups.innerHTML = "";
  const filtered = scores.filter(s=>{
    if(!filterText) return true;
    return s.opponent.includes(filterText) || s.place.includes(filterText);
  });

  // 月ごとに折りたたむ
  const months = {};
  filtered.forEach(s=>{
    const month = s.matchDate?.slice(0,7);
    if(!months[month]) months[month]=[];
    months[month].push(s);
  });

  Object.keys(months).sort((a,b)=>b.localeCompare(a)).forEach(month=>{
    const monthDiv = document.createElement("div");
    const collapsed = collapsedMonths.includes(month);

    monthDiv.innerHTML = `<h3 style="cursor:pointer;">${month} ${collapsed?"[+]" :"[-]"}</h3>`;
    const monthMatches = document.createElement("div");
    monthMatches.style.display = collapsed ? "none" : "block";

    months[month].forEach((m,i)=>{
      const div = document.createElement("div");
      div.className="match-card";
      const icon = TYPE_ICON[m.matchType]||"🏳️";
      div.innerHTML = `
        <div><strong>${icon} ${m.opponent}</strong> @ ${m.place}</div>
        <div>${m.scoreA} - ${m.scoreB} ${m.pkA||m.pkB?`(PK ${m.pkA}-${m.pkB})`:""}</div>
      `;

      // 紐付け動画ハイライトボタン
      if(m.videoId){
        const btn = document.createElement("button");
        btn.textContent="▶ ゴール";
        btn.className="highlight-btn btn";
        btn.addEventListener("click",()=>playHighlight(m.videoId, m.highlights[0] || 0));
        div.appendChild(btn);
      }

      // 編集ボタン（管理者のみ）
      if(isAdmin()){
        const editBtn = document.createElement("button");
        editBtn.textContent="編集";
        editBtn.className="btn";
        editBtn.style.marginLeft="8px";
        editBtn.addEventListener("click",()=>openEditModal(m));
        div.appendChild(editBtn);
      }

      monthMatches.appendChild(div);
    });

    monthDiv.appendChild(monthMatches);
    monthDiv.querySelector("h3").addEventListener("click",()=>{
      const isNowCollapsed = monthMatches.style.display==="none";
      monthMatches.style.display = isNowCollapsed ? "block":"none";
      if(isNowCollapsed) collapsedMonths = collapsedMonths.filter(x=>x!==month);
      else collapsedMonths.push(month);
      localStorage.setItem("collapsedMonths",JSON.stringify(collapsedMonths));
    });

    scoreGroups.appendChild(monthDiv);
  });
}

/* ------------------------------
   YouTubeハイライト再生
------------------------------ */
function playHighlight(videoId, seconds){
  const url=`https://youtu.be/${videoId}?t=${seconds}`;
  window.open(url,"_blank");
}

/* ------------------------------
   スコアデータ取得
------------------------------ */
async function loadScores(){
  const db = window._firebaseDB;
  const { collection, getDocs, query, where } = window._firebaseFns;
  const team = getLocalTeam();
  if(!team) return;

  const q = query(collection(db,"matches"),where("teamId","==",team.id || team.inviteCode));
  const snap = await getDocs(q);
  scores = snap.docs.map(d=>({id:d.id,...d.data()}));
  renderScores(currentSearchQuery);
}

/* ------------------------------
   検索バー対応
------------------------------ */
document.addEventListener("DOMContentLoaded",()=>{
  const searchInput = document.getElementById("searchInput");
  if(searchInput){
    searchInput.addEventListener("input",()=>{
      currentSearchQuery = searchInput.value.trim();
      renderScores(currentSearchQuery);
    });
  }

  document.getElementById("btnCreateMatch")?.addEventListener("click",createMatch);
});

/* ------------------------------
   編集モーダル操作
------------------------------ */
let currentEditMatch = null;

function openEditModal(match){
  currentEditMatch = match;

  document.getElementById("edit-date").value = match.matchDate || "";
  document.getElementById("matchType").value = match.matchType || "";
  document.getElementById("edit-opponent").value = match.opponent || "";
  document.getElementById("edit-place").value = match.place || "";
  document.getElementById("edit-my-score").value = match.scoreA ?? "";
  document.getElementById("edit-opponent-score").value = match.scoreB ?? "";
  document.getElementById("edit-pkA").value = match.pkA ?? "";
  document.getElementById("edit-pkB").value = match.pkB ?? "";
  document.getElementById("edit-video-select").value = match.videoId || "";

  const hlList = document.getElementById("hlList");
  hlList.innerHTML = "";
  (match.highlights||[]).forEach(sec => {
    hlList.appendChild(createHlItemElement(sec));
  });

  document.getElementById("editModal").classList.remove("hidden");
}

function closeEditModal(){
  document.getElementById("editModal").classList.add("hidden");
  currentEditMatch = null;
}

/* ハイライト追加（編集モーダル） */
function createHlItemElement(seconds){
  const div = document.createElement("div");
  div.className = "hl-item";
  div.innerHTML = `<span data-second="${seconds}">${seconds} 秒</span> <button type="button">削除</button>`;
  div.querySelector("button").addEventListener("click",()=>div.remove());
  return div;
}

function addHighlightTop(){
  const inp = document.getElementById("hlSeconds");
  const val = inp.value.trim();
  if(!val) return alert("秒数を入力してください");
  document.getElementById("hlList").appendChild(createHlItemElement(Number(val)));
  inp.value = "";
}

/* 編集保存 */
async function saveEdit(){
  if(!currentEditMatch) return alert("編集対象が見つかりません。");

  const db = window._firebaseDB;
  const { doc, updateDoc } = window._firebaseFns;

  const highlights = Array.from(document.getElementById("hlList").children).map(c=>{
    const span = c.querySelector("span");
    return Number(span.dataset.second || span.textContent.replace("秒","").trim());
  });

  const data = {
    matchType: document.getElementById("matchType").value || "",
    matchDate: document.getElementById("edit-date").value || "",
    opponent: document.getElementById("edit-opponent").value || "",
    place: document.getElementById("edit-place").value || "",
    scoreA: Number(document.getElementById("edit-my-score").value || 0),
    scoreB: Number(document.getElementById("edit-opponent-score").value || 0),
    pkA: Number(document.getElementById("edit-pkA").value || 0),
    pkB: Number(document.getElementById("edit-pkB").value || 0),
    videoId: document.getElementById("edit-video-select").value || "",
    highlights
  };

  try{
    const ref = doc(db,"matches",currentEditMatch.id);
    await updateDoc(ref,data);
    alert("編集を保存しました");
    closeEditModal();
    await loadScores();
  }catch(err){
    console.error(err);
    alert("編集保存に失敗しました");
  }
}

/* 削除 */
async function deleteEditMatch(){
  if(!currentEditMatch) return;
  if(!confirm("この試合を削除しますか？")) return;

  try{
    const db = window._firebaseDB;
    const { doc, deleteDoc } = window._firebaseFns;
    const ref = doc(db,"matches",currentEditMatch.id);
    await deleteDoc(ref);
    alert("削除しました");
    closeEditModal();
    await loadScores();
  }catch(err){
    console.error(err);
    alert("削除に失敗しました");
  }
}

/* ログアウト */
function logoutTeam(){
  localStorage.removeItem("teamInfo");
  location.reload();
}

/* ------------------------------
   DOMContentLoaded イベント設定
------------------------------ */
document.addEventListener("DOMContentLoaded",()=>{
  // ハイライト追加ボタン
  document.getElementById("btnMarkGoal")?.addEventListener("click", addHighlightTop);

  // 編集モーダル保存/削除/閉じる
  document.getElementById("saveEdit")?.addEventListener("click", saveEdit);
  document.getElementById("deleteMatch")?.addEventListener("click", deleteEditMatch);
  document.getElementById("modalClose")?.addEventListener("click", closeEditModal);

  // 参加 / 作成ボタン
  document.getElementById("btnJoin")?.addEventListener("click", joinTeam);
});
