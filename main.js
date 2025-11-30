
/*
 main.js - YouTube-limited SPA
 Storage: localStorage
 Models:
  videos: [{id, ytId, url, title, createdAt}]
  matches: [{id, date, opponent, place, score, videoId, highlights: [{t,isGoal}], createdAt}]
*/

const VIDEOS_KEY = 'msv_videos_v1';
const MATCHES_KEY = 'msv_matches_v1';
const SESSION_KEY = 'msv_session_v1';

// Elements
const teamNameInput = document.getElementById('teamNameInput');
const inviteCodeInput = document.getElementById('inviteCodeInput');
const btnJoin = document.getElementById('btnJoin');

const youtubeUrl = document.getElementById('youtubeUrl');
const btnAddYouTube = document.getElementById('btnAddYouTube');
const videoSelect = document.getElementById('videoSelect');

const matchDate = document.getElementById('matchDate');
const opponent = document.getElementById('opponent');
const place = document.getElementById('place');
const scoreA = document.getElementById('scoreA');
const scoreB = document.getElementById('scoreB');
const btnCreateMatch = document.getElementById('btnCreateMatch');

const scoreGroups = document.getElementById('scoreGroups');

// Modal
const editModal = document.getElementById('editModal');
const closeModalBtn = document.getElementById('closeModal');
const modalTitle = document.getElementById('modalTitle');
const editDate = document.getElementById('editDate');
const editOpponent = document.getElementById('editOpponent');
const editPlace = document.getElementById('editPlace');
const editScoreA = document.getElementById('editScoreA');
const editScoreB = document.getElementById('editScoreB');
const editVideoSelect = document.getElementById('editVideoSelect');
const hlSeconds = document.getElementById('hlSeconds');
const btnAddHL = document.getElementById('btnAddHL');
const btnMarkGoal = document.getElementById('btnMarkGoal');
const hlList = document.getElementById('hlList');
const btnSave = document.getElementById('btnSave');
const btnDelete = document.getElementById('btnDelete');

// Data
let videos = load(VIDEOS_KEY) || [];
let matches = load(MATCHES_KEY) || [];
let session = load(SESSION_KEY) || null;
let editingMatchId = null;

// Init
renderVideoSelect();
renderMatches();
if(session && session.teamName){ teamNameInput.value = session.teamName; }

// Join/create team (simple)
btnJoin.addEventListener('click', ()=>{
  const name = (teamNameInput.value||'').trim();
  const code = (inviteCodeInput.value||'').trim() || null;
  if(!name) return alert('チーム名を入力してください');
  session = { teamName: name, inviteCode: code };
  save(SESSION_KEY, session);
  alert('チーム参加しました: ' + name);
});

// Add YouTube
btnAddYouTube.addEventListener('click', ()=>{
  const url = (youtubeUrl.value||'').trim();
  if(!url) return alert('URLを入力してください');
  const yt = parseYouTubeId(url);
  if(!yt) return alert('YouTube URL を正しく入力してください');
  const id = 'v_' + Date.now();
  const item = { id, ytId: yt, url, title: 'YouTube: ' + yt, createdAt: new Date().toISOString() };
  videos.unshift(item);
  save(VIDEOS_KEY, videos);
  youtubeUrl.value = '';
  renderVideoSelect();
  renderMatches();
  alert('動画を追加しました');
});

// Create match
btnCreateMatch.addEventListener('click', ()=>{
  const d = matchDate.value || new Date().toISOString().slice(0,10);
  const opp = (opponent.value||'').trim();
  const plc = (place.value||'').trim();
  const a = scoreA.value===''? null : parseInt(scoreA.value,10);
  const b = scoreB.value===''? null : parseInt(scoreB.value,10);
  const videoId = videoSelect.value || '';
  const id = 'm_' + Date.now();
  const rec = { id, date: d, opponent: opp, place: plc, score: (a===null||b===null)?'': (a + '-' + b), videoId, highlights: [], createdAt: new Date().toISOString() };
  matches.unshift(rec);
  save(MATCHES_KEY, matches);
  // reset inputs
  opponent.value=''; place.value=''; scoreA.value=''; scoreB.value=''; videoSelect.value='';
  renderMatches();
});

// Render video select lists
function renderVideoSelect(){
  const sel = videoSelect;
  sel.innerHTML = '<option value="">— 紐づけ動画なし —</option>';
  videos.forEach(v=>{
    const o = document.createElement('option');
    o.value = v.id;
    o.textContent = v.title || v.ytId;
    sel.appendChild(o);
  });
  // modal select
  editVideoSelect.innerHTML = '<option value="">— 未選択 —</option>';
  videos.forEach(v=>{
    const o = document.createElement('option');
    o.value = v.id;
    o.textContent = v.title || v.ytId;
    editVideoSelect.appendChild(o);
  });
}

// Render matches grouped by month
function renderMatches(){
  scoreGroups.innerHTML = '';
  if(matches.length===0){ scoreGroups.innerHTML = '<div class="muted">試合がありません</div>'; return; }
  const groups = {};
  matches.forEach(m=>{
    const ym = m.date ? m.date.slice(0,7) : '未設定';
    groups[ym] = groups[ym] || [];
    groups[ym].push(m);
  });
  Object.keys(groups).sort((a,b)=>b.localeCompare(a)).forEach(mon=>{
    const wrap = document.createElement('div'); wrap.className='month';
    const header = document.createElement('div'); header.className='month-header';
    header.innerHTML = `<strong>${formatMonth(mon)}</strong><span>${groups[mon].length} 件</span>`;
    const body = document.createElement('div'); body.className='month-body';
    groups[mon].forEach(m=>{
      const card = document.createElement('div');
      const resClass = resultClass(m.score);
      card.className = 'score-card ' + resClass;
      card.dataset.id = m.id;
      const title = `<div class="meta"><div class="title">${escape(m.opponent||'対戦相手未設定')}</div><div class="sub">${m.date || ''} ・ <span class="match-venue">${escape(m.place||'')}</span></div></div>`;
      const right = `<div><div class="badge">${m.score || '—'}</div></div>`;
      card.innerHTML = title + right;
      card.addEventListener('click', ()=> openEdit(m.id));
      body.appendChild(card);
    });
    header.addEventListener('click', ()=>{ body.style.display = body.style.display === 'none' ? 'block' : 'none'; });
    wrap.appendChild(header); wrap.appendChild(body); scoreGroups.appendChild(wrap);
  });
}

// Open edit modal
function openEdit(id){
  const m = matches.find(x=>x.id===id);
  if(!m) return;
  editingMatchId = id;
  editDate.value = m.date || '';
  editOpponent.value = m.opponent || '';
  editPlace.value = m.place || '';
  if(m.score){
    const parts = m.score.split('-'); editScoreA.value = parts[0]||''; editScoreB.value = parts[1]||'';
  } else { editScoreA.value=''; editScoreB.value=''; }
  editVideoSelect.value = m.videoId || '';
  renderHLList(m);
  editModal.setAttribute('aria-hidden','false');
}

// render highlights for a match in modal
function renderHLList(match){
  hlList.innerHTML = '';
  (match.highlights||[]).forEach((h,idx)=>{
    const div = document.createElement('div'); div.className='hl-item';
    div.innerHTML = `<div>${h.t}s ${h.isGoal? '⚽':''}</div><div style="margin-left:auto"><button class="btn" data-act="jump" data-t="${h.t}">Jump</button> <button class="btn" data-act="del" data-idx="${idx}">Del</button></div>`;
    hlList.appendChild(div);
  });
  if((match.highlights||[]).length===0) hlList.innerHTML = '<div class="muted small">ハイライトはありません</div>';
}

// modal button handlers
closeModalBtn.addEventListener('click', ()=>{ editModal.setAttribute('aria-hidden','true'); editingMatchId=null; });
btnAddHL.addEventListener('click', ()=>{
  const sec = parseInt(hlSeconds.value||0,10); if(isNaN(sec)){ alert('秒数を入力してください'); return; }
  const m = matches.find(x=>x.id===editingMatchId); if(!m) return;
  m.highlights = m.highlights||[]; m.highlights.push({t:sec,isGoal:false}); save(MATCHES_KEY,matches); renderHLList(m); renderMatches(); hlSeconds.value='';
});
btnMarkGoal.addEventListener('click', ()=>{
  const sec = parseInt(hlSeconds.value||0,10); if(isNaN(sec)){ alert('秒数を入力してください'); return; }
  const m = matches.find(x=>x.id===editingMatchId); if(!m) return;
  m.highlights = m.highlights||[]; m.highlights.push({t:sec,isGoal:true}); save(MATCHES_KEY,matches); renderHLList(m); renderMatches(); hlSeconds.value='';
});

// HL list delegation (jump/delete)
hlList.addEventListener('click', (e)=>{
  const b = e.target.closest('button'); if(!b) return;
  const act = b.dataset.act; if(act==='jump'){ const t = b.dataset.t; openVideoAtTime(t); }
  if(act==='del'){ const idx = parseInt(b.dataset.idx,10); const m = matches.find(x=>x.id===editingMatchId); if(!m) return; m.highlights.splice(idx,1); save(MATCHES_KEY,matches); renderHLList(m); renderMatches(); }
});

btnSave.addEventListener('click', ()=>{
  if(!editingMatchId) return;
  const m = matches.find(x=>x.id===editingMatchId); if(!m) return;
  m.date = editDate.value; m.opponent = editOpponent.value; m.place = editPlace.value;
  const a = editScoreA.value===''? null: parseInt(editScoreA.value,10); const b = editScoreB.value===''? null: parseInt(editScoreB.value,10);
  m.score = (a===null||b===null)? '': (a+'-'+b); m.videoId = editVideoSelect.value || '';
  save(MATCHES_KEY,matches); editModal.setAttribute('aria-hidden','true'); renderMatches();
});
btnDelete.addEventListener('click', ()=>{
  if(!editingMatchId) return;
  if(!confirm('本当にこの試合を削除しますか？')) return;
  const idx = matches.findIndex(x=>x.id===editingMatchId); if(idx>=0){ matches.splice(idx,1); save(MATCHES_KEY,matches); editModal.setAttribute('aria-hidden','true'); renderMatches(); }
});

// open video at time using YouTube URL parameter t
function openVideoAtTime(t){
  const m = matches.find(x=>x.id===editingMatchId); if(!m) return alert('紐づけがないか選択してください');
  if(!m.videoId) return alert('この試合に紐づけられた動画がありません');
  const v = videos.find(x=>x.id===m.videoId); if(!v) return alert('動画が見つかりません');
  // open youtube at seconds
  const sec = parseInt(t,10)||0;
  const url = v.url.includes('youtu') ? (v.url + (v.url.includes('?')? '&':'?') + 't=' + sec) : v.url;
  window.open(url,'_blank');
}

// helpers
function resultClass(score){
  if(!score) return '';
  const m = score.match(/(\d+)\s*-\s*(\d+)/); if(!m) return '';
  const a = parseInt(m[1],10), b = parseInt(m[2],10);
  if(a>b) return 'win'; if(a<b) return 'lose'; return 'draw';
}

function formatMonth(ym){
  if(!ym) return '未設定';
  const [y,mo] = ym.split('-'); return y + '年' + mo + '月';
}

function parseYouTubeId(url){
  try{
    const u = new URL(url);
    if(u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    if(u.hostname.includes('youtube.com')) return u.searchParams.get('v');
    return null;
  }catch(e){ return null; }
}

function escape(s){ return (s||'').toString().replace(/[&<>"']/g, function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]; }); }

function save(key,val){ localStorage.setItem(key, JSON.stringify(val)); }
function load(key){ try{ return JSON.parse(localStorage.getItem(key)); }catch(e){ return null; } }
