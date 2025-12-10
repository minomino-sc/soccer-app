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

  // 表示切替
  const teamSection = document.getElementById("teamSection");
  const scoresSection = document.getElementById("scoresSection");
  const addVideoSection = document.getElementById("addVideoSection");
  const createMatchSection = document.getElementById("createMatchSection");
  if(teamSection) teamSection.style.display="none";
  if(scoresSection) scoresSection.style.display="block";
  if(addVideoSection) addVideoSection.style.display=isAdmin()?"block":"none";
  if(createMatchSection) createMatchSection.style.display=isAdmin()?"block":"none";

  showBackButton();
  alert(`チーム参加しました！ チーム名: ${teamData.teamName}`);
  await loadScores();
}

/* 戻るボタン表示 */
function showBackButton(){
  const btnBack = document.getElementById("btnBackLogin");
  if(btnBack) btnBack.style.display="block";
}

/* ------------------------------
   試合作成（Firestore対応）
------------------------------ */
async function createMatch(){
  const dateEl=document.getElementById("matchDate");
  const typeEl=document.getElementById("matchTypeCreate");
  const oppEl=document.getElementById("opponent");
  const placeEl=document.getElementById("place");
  const myScoreEl=document.getElementById("scoreA");
  const opScoreEl=document.getElementById("scoreB");
  const videoSelect=document.getElementById("videoSelect");

  if(!dateEl||!oppEl)return;
  const date=(dateEl.value||"").trim();
  const matchType=(typeEl?.value||"").trim();
  const opponent=oppEl.value.trim();
  const place=placeEl?.value.trim();
  const myScore=myScoreEl?.value;
  const opponentScore=opScoreEl?.value;
  const videoId=videoSelect?.value||null;

  if(!date||!opponent)return alert("日付と対戦相手は必須です");

  const match={
    date, matchType, opponent, place,
    myScore:myScore===""?null:Number(myScore),
    opponentScore:opponentScore===""?null:Number(opponentScore),
    videoId,
    highlights:[],
    createdAt:new Date().toISOString(),
    teamCode:getLocalTeam()?.inviteCode||""
  };

  try{
    const db=window._firebaseDB;
    const { collection, addDoc }=window._firebaseFns;
    await addDoc(collection(db,"scores"),match);
    alert("Firestore に保存しました！");
    await loadScores();
  }catch(err){
    console.error("Firestore保存エラー:",err);
    alert("Firestore 保存でエラーが発生しました");
  }

  // 入力欄クリア
  dateEl.value="";
  if(typeEl) typeEl.value="";
  oppEl.value="";
  if(placeEl) placeEl.value="";
  if(myScoreEl) myScoreEl.value="";
  if(opScoreEl) opScoreEl.value="";
  if(videoSelect) videoSelect.value="";
}

/* ------------------------------
   検索バー
------------------------------ */
function ensureSearchBar(){
  const sec=document.getElementById("scoresSection");
  if(!sec) return;
  if(document.getElementById("scoreSearchBar")) return;
  const input=document.createElement("input");
  input.id="scoreSearchBar";
  input.className="search-input";
  input.placeholder="検索：種別・相手・会場・日付・得点・秒数";
  input.addEventListener("input",(e)=>{
    currentSearchQuery=(e.target.value||"").trim().toLowerCase();
    loadScores();
  });
  const h2=sec.querySelector("h2");
  if(h2) h2.after(input);
}

function matchesSearch(it,q){
  if(!q) return true;
  const s=q.toLowerCase();
  if((it.matchType||"").toLowerCase().includes(s)) return true;
  if((it.opponent||"").toLowerCase().includes(s)) return true;
  if((it.place||"").toLowerCase().includes(s)) return true;
  if((it.date||"").toLowerCase().includes(s)) return true;
  if(it.myScore!==null&&String(it.myScore).includes(s)) return true;
  if(it.opponentScore!==null&&String(it.opponentScore).includes(s)) return true;
  if(Array.isArray(it.highlights)&&it.highlights.some(h=>String(h).includes(s))) return true;
  return false;
}

/* ------------------------------
   再生ボタン作成
------------------------------ */
function createPlayButton(videoId,timeSec){
  const btn=document.createElement("button");
  btn.type="button";
  btn.className="wide-btn";
  btn.textContent=timeSec?`再生 (${timeSec}s)`:"試合動画再生";
  btn.addEventListener("click",e=>{
    e.stopPropagation();
    if(!videoId) return alert("紐づく動画がありません。");
    const url=timeSec?`https://youtu.be/${videoId}?t=${timeSec}`:`https://youtu.be/${videoId}`;
    window.open(url,"_blank","noopener");
  });
  return btn;
}

/* ------------------------------
   Firestoreからスコア一覧取得・描画
------------------------------ */
async function loadScores(){
  const container=document.getElementById("scoreGroups");
  if(!container) return;
  ensureSearchBar();
  container.innerHTML="";

  try{
    const db=window._firebaseDB;
    const { collection, getDocs, query, where }=window._firebaseFns;
    const tCode=getLocalTeam()?.inviteCode||"";
    const q=query(collection(db,"scores"),where("teamCode","==",tCode));
    const snap=await getDocs(q);

    scores=snap.docs.map(doc=>({ id:doc.id, ...doc.data() }));

    // Firestore ID重複除外
    const seenIds=new Set();
    scores=scores.filter(s=>{ if(!s.id) return false; if(seenIds.has(s.id)) return false; seenIds.add(s.id); return true; });

    // 日付順
    scores.sort((a,b)=>new Date(b.date)-new Date(a.date));

  }catch(e){
    console.error("Firestore読み込み失敗:",e);
    container.innerHTML=`<p class="muted small">データの読み込みに失敗しました。</p>`;
    return;
  }

  if(!scores.length){
    container.innerHTML=`<p class="muted small">まだ試合がありません。</p>`;
    return;
  }

  //-------------------------------------------------
  // 描画
  //-------------------------------------------------
  const filteredMap={};
  scores.forEach((s,idx)=>{
    if(!matchesSearch(s,currentSearchQuery)) return;
    filteredMap[s.id]={ it:s, idx };
  });
  const filtered=Object.values(filteredMap);
  if(!filtered.length){ container.innerHTML=`<p class="muted small">検索に一致する試合がありません。</p>`; return; }

  const groups={};
  filtered.forEach(({it,idx})=>{
    const d=new Date(it.date);
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    if(!groups[key]) groups[key]={ items:[], counts:{ "公式戦":0, "カップ戦":0, "交流戦":0, "未設定":0 } };
    groups[key].items.push({it,idx});
    let mt=it.matchType||"未設定";
    groups[key].counts[mt] = (groups[key].counts[mt]||0)+1;
  });

  container.innerHTML="";
  Object.keys(groups).sort((a,b)=>b.localeCompare(a)).forEach(key=>{
    const group=document.createElement("div"); group.className="month card";

    const c=groups[key].counts;
    const aggText=`(${TYPE_ICON["公式戦"]}${c["公式戦"]} ${TYPE_ICON["カップ戦"]}${c["カップ戦"]} ${TYPE_ICON["交流戦"]}${c["交流戦"]})`;

    const header=document.createElement("div"); header.className="month-header";
    header.innerHTML=`<strong>${key}</strong> <span class="muted small">${groups[key].items.length} 試合</span> <span class="agg">${aggText}</span>`;
    group.appendChild(header);

    const body=document.createElement("div"); body.className="month-body";
    if(collapsedMonths.includes(key)){ body.classList.add("hidden"); header.classList.add("closed"); }else{ header.classList.add("open"); }

       groups[key].items.forEach(({it,idx})=>{
      const card=document.createElement("div"); card.className="score-card";
      if(typeof it.myScore==="number"&&typeof it.opponentScore==="number"){
        if(it.myScore>it.opponentScore) card.classList.add("win");
        else if(it.myScore<it.opponentScore) card.classList.add("lose");
        else card.classList.add("draw");
      }

      const meta=document.createElement("div"); meta.className="meta";
      const icon=TYPE_ICON[it.matchType||""]||"🏳️";
      const typeClass=typeClassName(it.matchType||"");
      meta.innerHTML=`<div class="title"><span class="type-icon ${typeClass}">${icon}</span> ${it.date} — ${it.opponent}</div><div class="type-badge ${typeClass}">${it.matchType||"未設定"}</div><div class="sub match-venue">${it.place||""}</div><div class="sub">得点: ${it.myScore??"-"} - ${it.opponentScore??"-"}</div>`;
      card.appendChild(meta);

      // ハイライト
      if(Array.isArray(it.highlights)&&it.highlights.length){
        const hlWrap=document.createElement("div"); hlWrap.className="hl-wrap";
        it.highlights.forEach(sec=>{
          const btn=document.createElement("button"); btn.className="hl-btn"; btn.type="button"; btn.textContent=`ゴールシーン ${sec} 秒`;
          btn.addEventListener("click",e=>{
            e.stopPropagation();
            if(!it.videoId) return alert("紐づく動画がありません。");
            window.open(`https://youtu.be/${it.videoId}?t=${sec}`,"_blank","noopener");
          });
          hlWrap.appendChild(btn);
        });
        meta.appendChild(hlWrap);
      }

      // action row
      const badge=document.createElement("div"); badge.className="badge";
      const actionRow=document.createElement("div"); actionRow.className="action-row";

      // 再生ボタン
      if(it.videoId) actionRow.appendChild(createPlayButton(it.videoId,null));
      else { const spacer=document.createElement("div"); spacer.style.flex="1 1 0"; actionRow.appendChild(spacer); }

      // 編集ボタン
      const editBtn=document.createElement("button");
      editBtn.type="button"; editBtn.className="wide-btn"; editBtn.textContent="編集";
      editBtn.addEventListener("click",e=>{
        e.stopPropagation();
        const pass=prompt("編集にはパスワードが必要です。入力してください：");
        if(pass!=="mino2025"){ alert("パスワードが違います"); return; }
        openEditModal(idx,it.date,it.matchType||"",it.opponent,it.place,it.myScore,it.opponentScore,it.highlights||[],it.videoId||"");
      });
      actionRow.appendChild(editBtn);

      // 削除ボタン
      const delBtn=document.createElement("button");
      delBtn.type="button"; delBtn.className="wide-btn danger"; delBtn.textContent="削除";
      delBtn.addEventListener("click",async e=>{
        e.stopPropagation();
        const pass=prompt("削除にはパスワードが必要です。入力してください：");
        if(pass!=="mino2025"){ alert("パスワードが違います"); return; }
        if(!confirm("この試合を削除しますか？")) return;
        if(!it.id){ alert("Firestore IDが存在しません"); return; }
        try{
          const ref=window._firebaseFns.doc(window._firebaseDB,"scores",it.id);
          await window._firebaseFns.deleteDoc(ref);
          alert("Firestore から削除しました");
          await loadScores();
        }catch(err){ console.error("Firestore削除エラー:",err); alert("Firestore の削除に失敗しました"); }
      });
      actionRow.appendChild(delBtn);

      badge.appendChild(actionRow);
      card.appendChild(badge);
      body.appendChild(card);
    });

    group.appendChild(body);
    container.appendChild(group);

    // 折りたたみ
    header.addEventListener("click",()=>{
      body.classList.toggle("hidden");
      const isHidden=body.classList.contains("hidden");
      if(isHidden){ header.classList.remove("open"); header.classList.add("closed"); if(!collapsedMonths.includes(key)) collapsedMonths.push(key);}
      else { header.classList.remove("closed"); header.classList.add("open"); collapsedMonths=collapsedMonths.filter(k=>k!==key);}
      localStorage.setItem("collapsedMonths",JSON.stringify(collapsedMonths));
    });
  });

  // 管理者でない場合、編集・削除ボタン非表示
  if(!isAdmin()){
    document.querySelectorAll(".action-row").forEach(row=>{
      row.querySelectorAll(".wide-btn:not(:first-child)").forEach(btn=>{ btn.style.display="none"; });
    });
  }
}

/* ==========================================================
   編集モーダル関連
========================================================== */
function openEditModal(index,date,matchType,opponent,place,myScore,opponentScore,highlights,videoId){
  window.currentEditIndex=index;
  document.getElementById("edit-date").value=date||"";
  document.getElementById("matchType").value=matchType||"";
  document.getElementById("edit-opponent").value=opponent||"";
  document.getElementById("edit-place").value=place||"";
  document.getElementById("edit-my-score").value=myScore??"";
  document.getElementById("edit-opponent-score").value=opponentScore??"";
  document.getElementById("edit-video-select").value=videoId||"";

  const hlList=document.getElementById("hlList");
  hlList.innerHTML="";
  (Array.isArray(highlights)?highlights:[]).forEach(sec=>hlList.appendChild(createHlItemElement(sec)));

  document.getElementById("editModal").classList.remove("hidden");
}

function closeEditModal(){ document.getElementById("editModal").classList.add("hidden"); window.currentEditIndex=undefined; }

async function saveEditGeneric(){
  if(window.currentEditIndex===undefined){ alert("編集対象が見つかりません"); return; }
  const current=scores[window.currentEditIndex];
  if(!current.id){ alert("Firestore IDがありません"); return; }

  const date=document.getElementById("edit-date")?.value.trim()||"";
  const matchType=document.getElementById("matchType")?.value.trim()||"";
  const opponent=document.getElementById("edit-opponent")?.value.trim()||"";
  const place=document.getElementById("edit-place")?.value.trim()||"";
  const myScoreVal=document.getElementById("edit-my-score")?.value;
  const opScoreVal=document.getElementById("edit-opponent-score")?.value;
  const videoSelect=document.getElementById("edit-video-select");
  const videoId=videoSelect?.value||null;

  const hlList=document.getElementById("hlList");
  const highlights=[];
  Array.from(hlList.children).forEach(child=>{
    const span=child.querySelector("span");
    if(!span) return;
    const n=Number(String(span.dataset.second||span.textContent).replace(" 秒","").trim());
    if(!isNaN(n)) highlights.push(n);
  });

  try{
    const ref=window._firebaseFns.doc(window._firebaseDB,"scores",current.id);
    await window._firebaseFns.updateDoc(ref,{
      date, matchType, opponent, place,
      myScore:myScoreVal===""?null:Number(myScoreVal),
      opponentScore:opScoreVal===""?null:Number(opScoreVal),
      highlights, videoId
    });
    alert("Firestore に保存しました！");
    closeEditModal();
    await loadScores();
  }catch(err){ console.error("Firestore 更新エラー:",err); alert("Firestore の更新に失敗しました"); }
}

/* ハイライト追加 */
function addHighlightTop(){
  const inp=document.getElementById("hlSeconds");
  if(!inp) return;
  const v=(inp.value||"").trim();
  if(!v) return alert("秒数を入力してください");
  document.getElementById("hlList").appendChild(createHlItemElement(Number(v)));
  inp.value="";
}

/* ログアウト用 */
function logoutTeam(){
  localStorage.removeItem("teamInfo");
  location.reload();
}

/* ユーティリティ */
function getLocalTeam(){ return JSON.parse(localStorage.getItem("teamInfo")||"{}"); }

/* --------------------------------------------------
   DOMContentLoaded でボタンイベント登録
-------------------------------------------------- */
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
  document.getElementById("btnCreateMatch")?.addEventListener("click",createMatch);

  document.getElementById("saveEdit")?.addEventListener("click",saveEditGeneric);
  document.getElementById("modalClose")?.addEventListener("click",closeEditModal);
  document.getElementById("btnMarkGoal")?.addEventListener("click",addHighlightTop);
  document.getElementById("deleteMatch")?.addEventListener("click",async()=>{
    if(window.currentEditIndex===undefined){ alert("対象がありません"); return; }
    const current=scores[window.currentEditIndex];
    if(!current?.id){ alert("Firestore ID がありません"); return; }
    if(!confirm("この試合を削除しますか？")) return;
    try{
      const ref=window._firebaseFns.doc(window._firebaseDB,"scores",current.id);
      await window._firebaseFns.deleteDoc(ref);
      alert("Firestore から削除しました");
      closeEditModal();
      await loadScores();
    }catch(err){ console.error(err); alert("Firestore 削除に失敗しました"); }
  });
});                                                           
