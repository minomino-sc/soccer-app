/* main.js — チーム管理＆保護者ログイン対応版
   元機能：検索 / ハイライト / 秒数クリック再生 / 編集 / 削除 / 種別表示
*/

let scores = []; // Firestoreから読み込む
let videos = JSON.parse(localStorage.getItem("videos")||"[]");
let collapsedMonths = JSON.parse(localStorage.getItem("collapsedMonths")) || [];
window.currentEditIndex = undefined;
let currentSearchQuery = "";

// 現在ログイン中のチーム情報
let currentTeam = getLocalTeam();

/* ------------------------------
   ユーティリティ関数
------------------------------ */
function saveLocalTeam(team) {
  localStorage.setItem("teamInfo", JSON.stringify(team));
  currentTeam = team;
}

function getLocalTeam() {
  if(currentTeam) return currentTeam;
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
  console.log("joinTeam called"); // デバッグ用
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

/* ▼ DOMContentLoadedでボタン登録 */
document.addEventListener("DOMContentLoaded",()=>{
  renderVideoSelects();
  if(getLocalTeam()){
    joinTeam(); // ページ再読み込み時、自動でログイン状態復元
  }

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
   試合作成
------------------------------ */
async function createMatch(){
  const matchType = document.getElementById("matchTypeCreate")?.value || "";
  const date = document.getElementById("matchDate")?.value || "";
  const opponent = (document.getElementById("opponent")?.value||"").trim();
  const place = (document.getElementById("place")?.value||"").trim();
  const scoreA = parseInt(document.getElementById("scoreA")?.value||0);
  const scoreB = parseInt(document.getElementById("scoreB")?.value||0);
  const pkA = parseInt(document.getElementById("pkA")?.value||0);
  const pkB = parseInt(document.getElementById("pkB")?.value||0);
  const videoId = document.getElementById("videoSelect")?.value || "";

  if(!date || !opponent || !place) return alert("日付・対戦相手・会場は必須です");

  const db = window._firebaseDB;
  const { collection, addDoc } = window._firebaseFns;

  const docRef = await addDoc(collection(db,"scores"),{
    teamId: currentTeam.id,
    matchType,
    date,
    opponent,
    place,
    scoreA,
    scoreB,
    pkA,
    pkB,
    videoId,
    createdAt: new Date().toISOString()
  });

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
   スコア検索
------------------------------ */
function filterScores(query){
  currentSearchQuery = query.toLowerCase();
  renderScores(scores);
}

/* ------------------------------
   スコア描画
------------------------------ */
function renderScores(allScores){
  const container = document.getElementById("scoreGroups");
  if(!container) return;

  container.innerHTML="";
  const filtered = allScores.filter(s=>{
    if(!currentSearchQuery) return true;
    const fields = [s.opponent, s.place, s.matchType];
    return fields.some(f=>f?.toLowerCase().includes(currentSearchQuery));
  });

  filtered.sort((a,b)=>new Date(b.date)-new Date(a.date));

  filtered.forEach((match,index)=>{
    const div=document.createElement("div");
    div.className="match-card card";

    const typeIcon = TYPE_ICON[match.matchType] || "🏳️";
    const typeCls = typeClassName(match.matchType);

    div.innerHTML=`
      <div class="match-header ${typeCls}">
        <span>${typeIcon}</span> 
        <span>${match.date} vs ${match.opponent}</span>
      </div>
      <div class="match-info">
        <span>会場: ${match.place}</span>
        <span>得点: ${match.scoreA}-${match.scoreB}</span>
        ${match.pkA!=null && match.pkB!=null && (match.pkA+match.pkB>0)?`<span>PK: ${match.pkA}-${match.pkB}</span>`:""}
      </div>
      ${match.videoId?`<button class="play-btn" data-video="${match.videoId}">ゴールシーン</button>`:""}
      ${isAdmin()?`<button class="edit-btn" data-index="${index}">編集</button>`:""}
    `;
    container.appendChild(div);
  });

  // 再生ボタン
  document.querySelectorAll(".play-btn").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const vid = btn.getAttribute("data-video");
      const url = videos.find(v=>v.id===vid)?.url;
      if(url) window.open(url,"_blank");
    });
  });

  // 編集ボタン
  document.querySelectorAll(".edit-btn").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const idx=parseInt(btn.getAttribute("data-index"));
      openEditModal(filtered[idx]);
    });
  });
}

/* ------------------------------
   Firestore からスコア取得
------------------------------ */
async function loadScores(){
  if(!currentTeam?.id) return;
  const db = window._firebaseDB;
  const { collection, getDocs, query, where } = window._firebaseFns;

  const q = query(collection(db,"scores"), where("teamId","==",currentTeam.id));
  const snap = await getDocs(q);

  scores=[];
  snap.forEach(doc=>{
    const data = doc.data();
    data.id = doc.id;
    scores.push(data);
  });

  renderScores(scores);
}

/* ------------------------------
   編集モーダル関連
------------------------------ */
function openEditModal(match){
  window.currentEditIndex = scores.findIndex(s=>s.id===match.id);
  if(window.currentEditIndex===-1) return alert("編集対象が見つかりません");

  document.getElementById("edit-date").value = match.date || "";
  document.getElementById("matchType").value = match.matchType || "";
  document.getElementById("edit-opponent").value = match.opponent || "";
  document.getElementById("edit-place").value = match.place || "";
  document.getElementById("edit-my-score").value = match.scoreA ?? "";
  document.getElementById("edit-opponent-score").value = match.scoreB ?? "";
  document.getElementById("edit-video-select").value = match.videoId || "";

  const hlList = document.getElementById("hlList");
  hlList.innerHTML="";
  if(Array.isArray(match.highlights)){
    match.highlights.forEach(sec => hlList.appendChild(createHlItemElement(sec)));
  }

  document.getElementById("editModal").classList.remove("hidden");
}

function closeEditModal(){
  document.getElementById("editModal").classList.add("hidden");
  window.currentEditIndex = undefined;
}

/* ハイライト秒数追加 */
function createHlItemElement(sec){
  const div = document.createElement("div");
  div.className="hl-item";
  div.innerHTML = `<span data-second="${sec}">${sec} 秒</span> <button type="button" class="hl-del">×</button>`;
  div.querySelector(".hl-del").addEventListener("click",()=>div.remove());
  return div;
}

function addHighlightTop(){
  const val = document.getElementById("hlSeconds")?.value;
  const sec = Number(val);
  if(isNaN(sec) || sec<0) return alert("正しい秒数を入力してください");
  document.getElementById("hlList").appendChild(createHlItemElement(sec));
  document.getElementById("hlSeconds").value="";
}

/* 編集モーダル保存 */
async function saveEdit(){
  if(window.currentEditIndex===undefined) return alert("編集対象がありません");
  const match = scores[window.currentEditIndex];
  if(!match.id) return alert("Firestore IDがありません");

  const date = document.getElementById("edit-date")?.value || "";
  const matchType = document.getElementById("matchType")?.value || "";
  const opponent = (document.getElementById("edit-opponent")?.value||"").trim();
  const place = (document.getElementById("edit-place")?.value||"").trim();
  const scoreA = Number(document.getElementById("edit-my-score")?.value||0);
  const scoreB = Number(document.getElementById("edit-opponent-score")?.value||0);
  const videoId = document.getElementById("edit-video-select")?.value || "";

  const highlights = [];
  Array.from(document.getElementById("hlList").children).forEach(child=>{
    const sec = Number(child.querySelector("span")?.dataset.second);
    if(!isNaN(sec)) highlights.push(sec);
  });

  const db = window._firebaseDB;
  const { doc, updateDoc } = window._firebaseFns;
  const ref = doc(db,"scores",match.id);

  try{
    await updateDoc(ref,{
      date, matchType, opponent, place,
      scoreA, scoreB, videoId, highlights
    });
    alert("Firestore に保存しました");
    closeEditModal();
    await loadScores();
  }catch(err){
    console.error("Firestore 更新エラー:", err);
    alert("保存に失敗しました");
  }
}

/* 編集モーダル削除 */
async function deleteCurrentMatch(){
  if(window.currentEditIndex===undefined) return;
  const match = scores[window.currentEditIndex];
  if(!match.id) return alert("Firestore IDがありません");

  if(!confirm("この試合を削除しますか？")) return;

  const db = window._firebaseDB;
  const { doc, deleteDoc } = window._firebaseFns;
  try{
    await deleteDoc(doc(db,"scores",match.id));
    alert("Firestore から削除しました");
    closeEditModal();
    await loadScores();
  }catch(err){
    console.error("Firestore削除エラー:",err);
    alert("削除に失敗しました");
  }
}

/* ------------------------------
   ログアウト / 戻るボタン
------------------------------ */
function logoutTeam(){
  localStorage.removeItem("teamInfo");
  location.reload();
}

function showBackButton(){
  const btn = document.getElementById("btnBackLogin");
  if(btn) btn.style.display="block";
  btn?.addEventListener("click", logoutTeam);
}

/* ------------------------------
   DOMContentLoaded イベントでボタン登録
------------------------------ */
document.addEventListener("DOMContentLoaded",()=>{
  // YouTube追加
  document.getElementById("btnAddYouTube")?.addEventListener("click",()=>{
    const url = (document.getElementById("youtubeUrl")?.value||"").trim();
    if(!url) return alert("URLを入力してください");
    addYouTubeVideo(url);
    document.getElementById("youtubeUrl").value="";
  });

  // チーム参加
  document.getElementById("btnJoin")?.addEventListener("click", joinTeam);

  // 試合作成
  document.getElementById("btnCreateMatch")?.addEventListener("click", createMatch);

  // 編集モーダル保存
  document.getElementById("saveEdit")?.addEventListener("click", saveEdit);

  // 編集モーダル削除
  document.getElementById("deleteMatch")?.addEventListener("click", deleteCurrentMatch);

  // 編集モーダル閉じる
  document.getElementById("modalClose")?.addEventListener("click", closeEditModal);

  // ハイライト追加
  document.getElementById("btnMarkGoal")?.addEventListener("click", addHighlightTop);
});
