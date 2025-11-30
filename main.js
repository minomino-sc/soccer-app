
// YouTube-based SPA for Minotani Soccer Videos (completely free)
(() => {
  const qs = s => document.querySelector(s);
  const qsa = s => Array.from(document.querySelectorAll(s));
  const gid = n => document.getElementById(n);

  // Elements
  const auth = qs('#auth');
  const uploader = qs('#uploader');
  const videosSec = qs('#videos');
  const btnCreate = qs('#btnCreate');
  const btnJoin = qs('#btnJoin');
  const btnAddVideo = qs('#btnAddVideo');
  const btnRefresh = qs('#btnRefresh');
  const btnShowGoals = qs('#btnShowGoals');
  const btnOpenYoutube = qs('#openYoutube');

  const joinCode = qs('#joinCode');
  const ownerTeam = qs('#ownerTeam');
  const ownerCode = qs('#ownerCode');
  const videoUrl = qs('#videoUrl');
  const matchDate = qs('#matchDate');
  const opponent = qs('#opponent');
  const venue = qs('#venue');

  const monthFilter = qs('#monthFilter');
  const teamFilter = qs('#teamFilter');
  const list = qs('#list');

  const viewer = qs('#viewer');
  const viewerTitle = qs('#viewerTitle');
  const playerWrap = qs('#playerWrap');
  const scoreInput = qs('#score');
  const saveScore = qs('#saveScore');
  const hlTime = qs('#hlTime');
  const addHl = qs('#addHl');
  const addCurrent = qs('#addCurrent');
  const markGoal = qs('#markGoal');
  const hlList = qs('#hlList');
  const closeViewer = qs('#closeViewer');

  // LocalStorage keys
  const KEY_TEAMS = 'msv_teams_v1';
  const KEY_SESSION = 'msv_session_v1';
  const KEY_VIDEOS = 'msv_videos_v1';

  // Data
  let teams = JSON.parse(localStorage.getItem(KEY_TEAMS) || '[]');
  let session = JSON.parse(localStorage.getItem(KEY_SESSION) || 'null');
  let videos = JSON.parse(localStorage.getItem(KEY_VIDEOS) || '[]');
  let currentItem = null;

  // Helpers
  function saveAll(){ localStorage.setItem(KEY_TEAMS, JSON.stringify(teams)); localStorage.setItem(KEY_SESSION, JSON.stringify(session)); localStorage.setItem(KEY_VIDEOS, JSON.stringify(videos)); }
  function uid(){ return 'id_'+Math.random().toString(36).slice(2,9); }
  function parseYouTubeId(url){
    try{
      const u = new URL(url);
      if(u.hostname.includes('youtu.be')) return u.pathname.slice(1);
      if(u.hostname.includes('youtube.com')) return u.searchParams.get('v');
      return null;
    }catch(e){ return null; }
  }
  function fmtYM(d){ const dt = new Date(d); const y = dt.getFullYear(); const m = ('0'+(dt.getMonth()+1)).slice(-2); return y+'-'+m; }
  function formatMonthLabel(m){ const [y,mm]=m.split('-'); return y+'年'+mm+'月'; }

  // Init UI
  function renderTeams(){
    teamFilter.innerHTML = '<option value="all">すべて</option>';
    teams.forEach(t=>{ const o=document.createElement('option'); o.value=t.code; o.textContent=t.name; teamFilter.appendChild(o); });
    // also ensure uploader team select exists as teamFilter used for upload selection by session
  }

  function showAuth(){ auth.classList.remove('hidden'); document.getElementById('uploader')?.classList.add('hidden'); document.getElementById('videos')?.classList.add('hidden'); }
  function showApp(){ auth.classList.add('hidden'); document.getElementById('uploader').classList.remove('hidden'); document.getElementById('videos').classList.remove('hidden'); }

  // Create team (owner)
  btnCreate.addEventListener('click', ()=>{
    const name = ownerTeam.value.trim(); const code = ownerCode.value.trim();
    if(!name || !code) return alert('チーム名と招待コードを入力してください');
    if(teams.find(t=>t.code===code)) return alert('その招待コードは既に使われています');
    const t = { id: uid(), name, code };
    teams.push(t); session = { teamCode: code, teamName: name, role:'owner' }; saveAll(); renderTeams(); showApp(); alert('チーム作成しました。招待コード: '+code);
  });

  // Join by code
  btnJoin.addEventListener('click', ()=>{
    const code = joinCode.value.trim();
    if(!code) return alert('招待コードを入力してください');
    const t = teams.find(x=>x.code===code);
    if(!t) return alert('招待コードが見つかりません');
    session = { teamCode: t.code, teamName: t.name, role:'member' }; saveAll(); renderTeams(); showApp(); alert('チームに参加しました: '+t.name);
  });

  // Add video (YouTube URL)
  btnAddVideo.addEventListener('click', ()=>{
    const url = videoUrl.value.trim();
    const id = parseYouTubeId(url);
    if(!id) return alert('YouTubeの共有URLを正しく貼ってください');
    const dateVal = matchDate.value || (new Date()).toISOString().slice(0,10);
    const ym = fmtYM(dateVal);
    const entry = {
      id: uid(), teamCode: session.teamCode, teamName: session.teamName, ytId: id, url, createdAt: new Date().toISOString(),
      yearMonth: ym, opponent: opponent.value||'', venue: venue.value||'', score:'', highlights:[]
    };
    videos.unshift(entry); saveAll(); videoUrl.value=''; matchDate.value=''; opponent.value=''; venue.value=''; populateMonthFilter(); renderList(); alert('動画を登録しました（YouTube限定公開を推奨）');
  });

  // Helpers: populate filters
  function populateMonthFilter(){
    const months = Array.from(new Set(videos.map(v=>v.yearMonth))).sort().reverse();
    monthFilter.innerHTML = '<option value="all">すべて</option>';
    months.forEach(m=>{ const o=document.createElement('option'); o.value=m; o.textContent=formatMonthLabel(m); monthFilter.appendChild(o); });
    // teamFilter handled by renderTeams
  }

  // Render list grouped by month
  function renderList(){
    list.innerHTML = '';
    const mf = monthFilter.value||'all'; const tf = teamFilter.value||'all';
    const groups = {};
    videos.forEach(v=>{
      if(tf!=='all' && v.teamCode!==tf) return;
      if(mf!=='all' && v.yearMonth!==mf) return;
      (groups[v.yearMonth]=groups[v.yearMonth]||[]).push(v);
    });
    const months = Object.keys(groups).sort().reverse();
    if(months.length===0){ list.innerHTML = '<div class="muted">動画がありません</div>'; return; }
    months.forEach(m=>{
      const wrap = document.createElement('div');
      const header = document.createElement('div'); header.className='row';
      const title = document.createElement('div'); title.textContent = formatMonthLabel(m); title.style.fontWeight='700';
      const cnt = document.createElement('div'); cnt.textContent = '('+groups[m].length+'件)'; cnt.style.marginLeft='8px';
      const toggle = document.createElement('button'); toggle.className='btn'; toggle.textContent='開く';
      header.appendChild(title); header.appendChild(cnt); header.appendChild(toggle);
      wrap.appendChild(header);
      const container = document.createElement('div'); container.className='month-list hidden';
      groups[m].forEach(v=>{
        const card = document.createElement('div'); card.className='video-card';
        const thumb = document.createElement('img'); thumb.className='video-thumb'; thumb.src = 'https://img.youtube.com/vi/'+v.ytId+'/hqdefault.jpg';
        card.appendChild(thumb);
        const meta = document.createElement('div'); meta.className='meta'; meta.textContent = v.fileName||v.teamName+' ・ '+(v.opponent||''); card.appendChild(meta);
        const actions = document.createElement('div'); actions.className='row';
        const open = document.createElement('button'); open.className='btn'; open.textContent='再生'; open.onclick = ()=> openViewer(v);
        const dl = document.createElement('button'); dl.className='btn'; dl.textContent='YouTubeで開く'; dl.onclick = ()=> window.open(v.url, '_blank');
        const del = document.createElement('button'); del.className='btn'; del.textContent='削除'; del.onclick = ()=> { if(confirm('削除しますか？')){ videos = videos.filter(x=>x.id!==v.id); saveAll(); renderList(); } };
        actions.appendChild(open); actions.appendChild(dl); actions.appendChild(del);
        card.appendChild(actions);
        // highlights mini-list
        if(v.highlights && v.highlights.length){
          const hl = document.createElement('div'); hl.className='small muted'; hl.innerHTML = 'Highlights: '+ v.highlights.map(h=> h.t + 's' + (h.isGoal? ' (G)':'' ) ).join(', ');
          card.appendChild(hl);
        }
        container.appendChild(card);
      });
      toggle.onclick = ()=>{ container.classList.toggle('hidden'); toggle.textContent = container.classList.contains('hidden') ? '開く':'閉じる'; };
      wrap.appendChild(container);
      list.appendChild(wrap);
    });
  }

  // Viewer functions
  function openViewer(item){
    currentItem = item;
    viewerTitle.textContent = (item.teamName||'') + ' - ' + (item.opponent||'') + ' ' + (item.createdAt? item.createdAt.slice(0,10):'');
    playerWrap.innerHTML = '<iframe width="100%" height="360" src="https://www.youtube.com/embed/'+item.ytId+'?rel=0" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>';
    scoreInput.value = item.score||'';
    renderHLs(item);
    viewer.classList.remove('hidden');
    btnOpenYoutube.href = item.url;
    btnOpenYoutube.target = '_blank';
  }
  closeViewer.addEventListener('click', ()=>{ viewer.classList.add('hidden'); playerWrap.innerHTML=''; currentItem=null; });

  // Highlights
  addHl.addEventListener('click', ()=>{
    const t = parseInt(hlTime.value||0);
    if(isNaN(t)) return alert('秒数を入力してください');
    currentItem.highlights = currentItem.highlights || [];
    currentItem.highlights.push({ t, isGoal:false, team: session.teamCode });
    saveAll(); renderHLs(currentItem); renderList();
  });
  addCurrent.addEventListener('click', ()=>{
    alert('注: iframeの再生時刻取得は同一ドメイン制限で不可です。秒数を手入力する運用になります。');
    const t = parseInt(hlTime.value||0);
    if(isNaN(t)) return alert('秒数を入力してください');
    currentItem.highlights = currentItem.highlights || [];
    currentItem.highlights.push({ t, isGoal:false, team: session.teamCode });
    saveAll(); renderHLs(currentItem); renderList();
  });
  markGoal.addEventListener('click', ()=>{
    const t = parseInt(hlTime.value||0);
    if(isNaN(t)) return alert('秒数を入力してください');
    currentItem.highlights = currentItem.highlights || [];
    currentItem.highlights.push({ t, isGoal:true, team: session.teamCode });
    saveAll(); renderHLs(currentItem); renderList();
  });

  function renderHLs(item){
    hlList.innerHTML = '';
    (item.highlights||[]).forEach((h,idx)=>{
      const row = document.createElement('div'); row.className='row';
      const left = document.createElement('div'); left.textContent = h.t + 's ' + (h.isGoal? '⚽' : ''); row.appendChild(left);
      const jump = document.createElement('button'); jump.className='btn'; jump.textContent='Jump'; jump.onclick = ()=> { window.open(item.url + '?t=' + h.t, '_blank'); };
      const del = document.createElement('button'); del.className='btn'; del.textContent='Delete'; del.onclick = ()=> { item.highlights.splice(idx,1); saveAll(); renderHLs(item); renderList(); };
      row.appendChild(jump); row.appendChild(del);
      hlList.appendChild(row);
    });
    if((item.highlights||[]).length===0) hlList.innerHTML = '<div class="muted small">ハイライトはありません</div>';
  }

  // Show team goals
  btnShowGoals.addEventListener('click', ()=>{
    if(!session){ return alert('チームに参加してください'); }
    const team = session.teamCode;
    const found = [];
    videos.forEach(v=>{ (v.highlights||[]).forEach(h=>{ if(h.isGoal && h.team===team) found.push({v,t:h.t}); }); });
    if(found.length===0) return alert('ゴールシーンは見つかりませんでした');
    let s = 'ゴールシーン一覧:\n';
    found.forEach(f=> s += f.v.url + ' - ' + f.t + 's\n');
    alert(s);
  });

  // Download note: opens YouTube; downloading official is via YouTube app
  function downloadNote(){ alert('YouTubeの動画は再生ページで保存（ダウンロード）はYouTubeアプリの機能をお使いください。'); }

  // Filters and refresh
  btnRefresh.addEventListener('click', ()=>{ populateMonthFilter(); renderList(); });

  // Bootstrap: load from storage
  function init(){
    teams = JSON.parse(localStorage.getItem(KEY_TEAMS) || '[]');
    session = JSON.parse(localStorage.getItem(KEY_SESSION) || 'null');
    videos = JSON.parse(localStorage.getItem(KEY_VIDEOS) || '[]');
    renderTeams();
    populateMonthFilter();
    if(session && session.teamCode){ showApp(); } else { showAuth(); }
  }

  init();

})();
