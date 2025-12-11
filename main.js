/****************************************************
 *  main.js  — 完全版（Part 1 / 4）
 ****************************************************/

/* ---------------- Firebase 初期化 ---------------- */
window._firebaseConfig = {
  apiKey: "YOUR_KEY",
  authDomain: "YOUR_APP.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_BUCKET",
  messagingSenderId: "xxxx",
  appId: "xxxx"
};

window._firebaseApp = firebase.initializeApp(window._firebaseConfig);
window._firebaseDB = firebase.firestore();

/* Firestore Helper */
window._teamsCol = window._firebaseDB.collection("teams");
window._scoresCol = window._firebaseDB.collection("scores");
window._videosCol = window._firebaseDB.collection("videos");

/****************************************************
 * チーム名 & 招待コードの登録ルール（①〜⑤）
 * ①完全一致 → ログイン
 * ②不一致 → 新規登録
 * ③チーム名重複OK
 * ④招待コードの重複はNG
 * ⑤招待コード末尾「_ADMIN」で管理者
 ****************************************************/
async function joinOrCreateTeam(teamName, inviteCode) {
  const codeUpper = inviteCode.toUpperCase();

  /* ---- 既存チーム取得（招待コードは一意） ---- */
  const snapshot = await window._teamsCol.where("inviteCode", "==", codeUpper).get();

  if (!snapshot.empty) {
    // ④既存の招待コードが存在 → チーム名一致ならログイン、違えばエラー
    const data = snapshot.docs[0].data();

    if (data.teamName !== teamName) {
      alert("既に使用されている招待コードです（他チームで使用中）");
      return null;
    }

    // ①完全一致 → ログイン
    return { teamName: data.teamName, inviteCode: data.inviteCode };
  }

  // ②一致なし → 新規登録（③チーム名重複OK）
  await window._teamsCol.add({
    teamName,
    inviteCode: codeUpper,
    createdAt: Date.now()
  });

  return { teamName, inviteCode: codeUpper };
}

/****************************************************
 * 管理者判定（⑤）
 ****************************************************/
function isAdmin(inviteCode) {
  return inviteCode.toUpperCase().endsWith("_ADMIN");
}

/****************************************************
 *  main.js — 完全版（Part 2 / 4）
 *  YouTube動画の保存（Firestore + localStorage）
 ****************************************************/

/* ---------------- ローカル動画管理 ---------------- */
let localVideos = [];

function loadVideosLocal() {
  const data = localStorage.getItem("localVideos");
  localVideos = data ? JSON.parse(data) : [];
}

function saveVideosLocal() {
  localStorage.setItem("localVideos", JSON.stringify(localVideos));
}

/****************************************************
 * Firestore から動画ロード
 ****************************************************/
async function loadVideosFromFirestore(teamName) {
  if (!teamName) return;

  try {
    const snap = await window._videosCol
      .where("teamName", "==", teamName)
      .orderBy("createdAt", "desc")
      .get();

    localVideos = snap.docs.map(d => ({
      id: d.id,
      url: d.data().url,
      createdAt: d.data().createdAt
    }));

    renderVideoSelects();
  } catch (e) {
    console.error("loadVideosFromFirestore error", e);
  }
}

/****************************************************
 * YouTube 動画追加（Firestore + ローカル両方保存）
 ****************************************************/
async function addYouTubeVideo(url) {
  if (!window.currentTeam) {
    alert("チームにログインしてください");
    return;
  }

  const videoObj = {
    url,
    teamName: window.currentTeam.teamName,
    createdAt: Date.now()
  };

  try {
    const ref = await window._videosCol.add(videoObj);

    // Firestore IDを付与してローカルにも保存
    localVideos.unshift({
      id: ref.id,
      ...videoObj
    });

    saveVideosLocal();
    renderVideoSelects();
  } catch (e) {
    console.error("Firestore 保存失敗", e);
    alert("動画の保存に失敗しました（Firestore）。ローカルには保存しました。");

    // Firestore 失敗 → ローカルだけ保存
    localVideos.unshift(videoObj);
    saveVideosLocal();
    renderVideoSelects();
  }
}

/****************************************************
 * 動画セレクトボックス反映
 ****************************************************/
function renderVideoSelects() {
  const selects = document.querySelectorAll(".videoSelect");

  selects.forEach(sel => {
    sel.innerHTML = "";
    localVideos.forEach(v => {
      const opt = document.createElement("option");
      opt.value = v.url;
      opt.textContent = v.url;
      sel.appendChild(opt);
    });
  });
}

/****************************************************
 *  main.js — 完全版（Part 3 / 4）
 *  試合結果（scores）作成・編集・削除・表示
 ****************************************************/

let scores = [];

/* ---------------- Firestore から試合一覧取得 ---------------- */
async function loadScores() {
  if (!window.currentTeam) return;

  const teamName = window.currentTeam.teamName;

  try {
    const q = window._scoresCol.where("teamName", "==", teamName);
    const snap = await q.get();

    scores = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    renderScores();
  } catch (e) {
    console.error("loadScores error", e);
  }
}

/****************************************************
 * 試合結果の一覧レンダリング（月別折りたたみ）
 ****************************************************/
function renderScores() {
  const area = document.getElementById("scoresList");
  if (!area) return;

  area.innerHTML = "";
  if (!scores.length) {
    area.innerHTML = "<p>試合結果がありません</p>";
    return;
  }

  // 月別分類
  const groups = {};
  scores.forEach(s => {
    const dt = new Date(s.matchDate);
    const ym = `${dt.getFullYear()}年${String(dt.getMonth() + 1).padStart(2, "0")}月`;
    if (!groups[ym]) groups[ym] = [];
    groups[ym].push(s);
  });

  // 月別パネル生成
  Object.keys(groups).sort().reverse().forEach(month => {
    const box = document.createElement("div");
    box.className = "monthBox";

    const header = document.createElement("div");
    header.className = "monthHeader";
    header.textContent = `${month}（${groups[month].length}件）`;

    const list = document.createElement("div");
    list.className = "monthList";
    list.style.display = "none";

    // 月ヘッダーをクリック → 折りたたみ
    header.addEventListener("click", () => {
      list.style.display = (list.style.display === "none" ? "block" : "none");
    });

    groups[month].forEach(s => {
      const item = document.createElement("div");
      item.className = "scoreItem";
      item.textContent = `${s.opponent}：${s.ourScore}-${s.theirScore}`;
      item.addEventListener("click", () => openEditModal(s));
      list.appendChild(item);
    });

    box.appendChild(header);
    box.appendChild(list);
    area.appendChild(box);
  });
}

/****************************************************
 * 試合結果作成（管理者のみ）
 ****************************************************/
async function createMatch() {
  if (!window.currentTeam || !window.currentTeam.isAdmin) {
    return alert("管理者のみ作成できます");
  }

  const opponent = (document.getElementById("opponent")?.value || "").trim();
  const ourScore = Number(document.getElementById("ourScore")?.value || 0);
  const theirScore = Number(document.getElementById("theirScore")?.value || 0);
  const matchDate = document.getElementById("matchDate")?.value;

  if (!opponent || !matchDate) {
    return alert("対戦相手・日付は必須です");
  }

  const data = {
    teamName: window.currentTeam.teamName,
    inviteCode: window.currentTeam.inviteCode,
    opponent,
    ourScore,
    theirScore,
    matchDate,
    createdAt: Date.now()
  };

  try {
    await window._scoresCol.add(data);
    alert("試合結果を追加しました");
    await loadScores();
  } catch (e) {
    console.error("createMatch error", e);
    alert("試合結果の保存に失敗しました");
  }
}

/****************************************************
 * 試合 編集モーダルを開く
 ****************************************************/
function openEditModal(match) {
  if (!match || !match.id) return;

  window.currentEditMatch = match;

  document.getElementById("editOpponent").value = match.opponent;
  document.getElementById("editOurScore").value = match.ourScore;
  document.getElementById("editTheirScore").value = match.theirScore;
  document.getElementById("editMatchDate").value = match.matchDate;

  document.getElementById("editModal").style.display = "block";
}

/****************************************************
 * モーダル閉じる
 ****************************************************/
function closeEditModal() {
  document.getElementById("editModal").style.display = "none";
  window.currentEditMatch = null;
}

/****************************************************
 * 試合の保存（編集）
 ****************************************************/
async function saveEditGeneric() {
  const m = window.currentEditMatch;
  if (!m || !m.id) return;

  const newData = {
    opponent: document.getElementById("editOpponent").value,
    ourScore: Number(document.getElementById("editOurScore").value),
    theirScore: Number(document.getElementById("editTheirScore").value),
    matchDate: document.getElementById("editMatchDate").value
  };

  try {
    await window._scoresCol.doc(m.id).update(newData);
    alert("更新しました");
    closeEditModal();
    await loadScores();
  } catch (e) {
    console.error("saveEditGeneric error", e);
  }
}

/****************************************************
 * 試合削除
 ****************************************************/
async function deleteCurrentMatch() {
  const m = window.currentEditMatch;
  if (!m || !m.id) return;

  if (!confirm("削除しますか？")) return;

  try {
    await window._scoresCol.doc(m.id).delete();
    alert("削除しました");
    closeEditModal();
    await loadScores();
  } catch (e) {
    console.error("delete error", e);
    alert("削除に失敗しました");
  }
}

/****************************************************
 *  main.js — 完全版（Part 4 / 4）
 *  - Firestore collection 初期化
 *  - チーム参加/作成ロジック（ご指定のルールB）
 *  - UI 初期化 / ボタンバインド
 *  - ユーティリティ（canonical team name 等）
 ****************************************************/

/* ---------- Firestore collection 初期化 helper ---------- */
function initCollections() {
  // 既存の firebase wrappers を利用（あなたの環境では window._firebaseDB と window._firebaseFns がある想定）
  const db = window._firebaseDB;
  const fns = window._firebaseFns;
  if(!db || !fns){
    console.warn("Firestore is not initialized: window._firebaseDB or window._firebaseFns missing");
    // 保険: 何もしない（既存コードが別途collectionを扱う想定）
    return;
  }
  // collection refs we will use throughout (these are Firestore collection references or simple wrappers depending on your SDK)
  window._teamsCol = fns.collection(db, "teams");
  window._scoresCol = fns.collection(db, "scores");
  window._videosCol = fns.collection(db, "videos");
}

/* ---------- canonical team name / isAdmin helpers ---------- */
/* 管理者かどうかは inviteCode の末尾が _ADMIN（大文字小文字を無視） */
function inviteCodeIsAdmin(code){
  if(!code) return false;
  return String(code).toUpperCase().endsWith("_ADMIN");
}
/* canonicalTeamName:
   - 管理者が登録時に teamName に "_ADMIN" を付けている可能性があるため、
     試合や動画は baseName（末尾の "_ADMIN" を除く）をキーとして保存/検索します。
   - 一般ユーザーはその baseName を入力してログインする想定。 */
function canonicalTeamNameFrom(teamName){
  if(!teamName) return teamName;
  return teamName.replace(/_ADMIN$/i, "");
}

/* ---------- チーム情報／ログイン関連 ---------- */
window.currentTeam = null; // { teamName, inviteCode, isAdmin, canonicalName }

/* local storage helpers (軽量) */
function loadTeamFromLocal(){
  try{ return JSON.parse(localStorage.getItem("teamInfo") || "null"); }catch(e){ return null; }
}
function saveTeamToLocal(team){
  if(!team) localStorage.removeItem("teamInfo");
  else localStorage.setItem("teamInfo", JSON.stringify(team));
}

/* 内部で使う：currentTeam をセットして UI に反映 */
function setCurrentTeamObj(teamName, inviteCode){
  const isAdmin = inviteCodeIsAdmin(inviteCode);
  const canonicalName = canonicalTeamNameFrom(teamName);
  window.currentTeam = {
    teamName,
    inviteCode,
    isAdmin,
    canonicalName
  };
  saveTeamToLocal(window.currentTeam);

  // expose small-friendly flags for other parts
  window.currentTeam.isAdmin = isAdmin;

  // Show/Hide UI sections based on admin
  document.getElementById("teamSection")?.classList?.add("hidden");
  document.getElementById("scoresSection")?.classList?.remove("hidden");
  if(window.currentTeam.isAdmin){
    document.getElementById("addVideoSection")?.classList?.remove("hidden");
    document.getElementById("createMatchSection")?.classList?.remove("hidden");
  } else {
    document.getElementById("addVideoSection")?.classList?.add("hidden");
    document.getElementById("createMatchSection")?.classList?.add("hidden");
  }
  document.getElementById("btnBackLogin")?.classList?.remove("hidden");
}

/* ---------- チーム参加 / 作成ルール（あなた指定のB方式） ----------
   ① teamName+inviteCode 完全一致 => ログイン
   ② 一致しない => 新規登録（ただし inviteCode 重複は禁止）
   ③ teamName 重複登録 OK
   ④ inviteCode 重複はエラー表示
   ⑤ 管理者判定は inviteCode の末尾 _ADMIN
*/
async function handleJoinButton(){
  const name = (document.getElementById("teamNameInput")?.value || "").trim();
  const code = ((document.getElementById("inviteCodeInput")?.value || "").trim() || "").toUpperCase();

  if(!name) return alert("チーム名を入力してください");
  if(!code) return alert("招待コードを入力してください");

  try {
    const teamsCol = window._teamsCol;
    if(!teamsCol) { alert("Firestore 未初期化"); return; }

    // get all teams (small scale app assumption) — your existing code did this as well
    const snap = await window._firebaseFns.getDocs(teamsCol);

    let matched = null;
    let inviteCodeConflict = false;

    snap.docs.forEach(d=>{
      const data = d.data();
      if(data.teamName === name && String(data.inviteCode).toUpperCase() === code) {
        matched = { id: d.id, ...data };
      } else if(String(data.inviteCode).toUpperCase() === code) {
        inviteCodeConflict = true;
      }
    });

    if(matched){
      // exact match -> login
      alert(`チーム "${matched.teamName}" にログインしました`);
      setCurrentTeamObj(matched.teamName, matched.inviteCode);
      // load domain data using canonical name
      await postLoginLoads();
      return;
    }

    if(inviteCodeConflict){
      return alert("その招待コードは既に使われています。別の招待コードを指定してください（招待コードはユニークです）。");
    }

    // not matched & inviteCode not used => create new team document
    await window._firebaseFns.addDoc(teamsCol, {
      teamName: name,
      inviteCode: code,
      createdAt: new Date().toISOString()
    });
    alert(`チーム "${name}" を新規登録しました`);
    setCurrentTeamObj(name, code);
    await postLoginLoads();
  } catch (err) {
    console.error("handleJoinButton err", err);
    alert("チーム登録/ログインでエラーが発生しました");
  }
}

/* ---------- post-login loads ----------
   - 初期化した collection 参照を使って videos / scores を読み込む
   - ここで canonicalName を使い、管理者が _ADMIN を付けていても base 名でデータを見るようにする
*/
async function postLoginLoads(){
  // initialize collections (if not)
  initCollections();

  // load videos for the canonical team name
  await loadVideosForTeam(window.currentTeam.canonicalName);

  // load scores for the canonical team name
  await loadScoresForTeam(window.currentTeam.canonicalName);
}

/* videos 読み込み（canonical teamName を利用） */
async function loadVideosForTeam(teamNameCanonical){
  try{
    const db = window._firebaseDB;
    const fns = window._firebaseFns;
    const videosCol = fns.collection(db, "videos");
    const q = fns.query(videosCol, fns.where("teamName", "==", teamNameCanonical));
    const snap = await fns.getDocs(q);
    videos = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    saveVideosLocal();
    renderVideoSelects();
  }catch(err){
    console.error("loadVideosForTeam err", err);
    loadVideosLocal();
    renderVideoSelects();
  }
}

/* scores 読み込み（canonical teamName を利用） */
/* Note: Part3's loadScores used window._scoresCol.where("teamName","==", teamName) */
async function loadScoresForTeam(teamNameCanonical){
  try{
    const db = window._firebaseDB;
    const fns = window._firebaseFns;
    const scoresCol = fns.collection(db, "scores");
    const q = fns.query(scoresCol, fns.where("teamName", "==", teamNameCanonical));
    const snap = await fns.getDocs(q);

    // map into the scores array used by renderScores in Part 3
    scores = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // call Part3 render
    renderScores();
  }catch(err){
    console.error("loadScoresForTeam err", err);
    const area = document.getElementById("scoresList");
    if(area) area.innerHTML = "<p class='muted small'>データの読み込みに失敗しました。</p>";
  }
}

/* ---------- UI 初期化 / ボタンバインド ---------- */
function uiInitBindings(){
  // join
  document.getElementById("btnJoin")?.addEventListener("click", handleJoinButton);

  // back to login
  document.getElementById("btnBackLogin")?.addEventListener("click", ()=>{
    saveTeamToLocal(null);
    window.currentTeam = null;
    document.getElementById("teamSection")?.classList?.remove("hidden");
    document.getElementById("scoresSection")?.classList?.add("hidden");
    document.getElementById("addVideoSection")?.classList?.add("hidden");
    document.getElementById("createMatchSection")?.classList?.add("hidden");
    document.getElementById("btnBackLogin")?.classList?.add("hidden");
    document.getElementById("teamNameInput").value = "";
    document.getElementById("inviteCodeInput").value = "";
  });

  // create match (calls Part3 createMatch which checks window.currentTeam.isAdmin)
  document.getElementById("btnCreateMatch")?.addEventListener("click", async ()=>{
    // call Part3's createMatch (it will check admin and use window.currentTeam.teamName/canonical)
    await createMatch();
  });

  // edit modal buttons
  document.getElementById("modalClose")?.addEventListener("click", ()=> closeEditModal());
  document.getElementById("saveEdit")?.addEventListener("click", ()=> saveEditGeneric());
  document.getElementById("deleteMatch")?.addEventListener("click", ()=> deleteCurrentMatch());

  // add video (Part1 addYouTubeVideo expects getTeam() — adapt getTeam to read window.currentTeam)
  document.getElementById("btnAddYouTube")?.addEventListener("click", ()=>{
    const url = (document.getElementById("youtubeUrl")?.value||"").trim();
    if(!url) return alert("URLを入力してください");
    // ensure addYouTubeVideo uses canonical team name when writing (we'll override getTeam() used earlier)
    addYouTubeVideo(url);
    document.getElementById("youtubeUrl").value = "";
  });
}

/* ---------- small adapter: replace original getTeam() used in other parts ----------
   Some earlier code calls getTeam(); to keep compatibility, provide a small getter that returns object similar to previous local storage shape.
*/
function getTeamAdapter(){
  return window.currentTeam || loadTeamFromLocal();
}
// replace previous getTeam global if exists
window.getTeam = getTeamAdapter;

/* ---------- on DOM ready: initialize ---------- */
document.addEventListener("DOMContentLoaded", async ()=>{
  initCollections();
  uiInitBindings();

  // restore team from local (if exists) and auto-login
  const restored = loadTeamFromLocal();
  if(restored && restored.teamName && restored.inviteCode){
    // set normalized currentTeam
    setCurrentTeamObj(restored.teamName, restored.inviteCode);
    await postLoginLoads();
  } else {
    // show login area
    document.getElementById("teamSection")?.classList?.remove("hidden");
    document.getElementById("scoresSection")?.classList?.add("hidden");
  }
});
