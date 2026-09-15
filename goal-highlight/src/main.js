import { FFmpeg } from 'https://esm.sh/@ffmpeg/ffmpeg@0.12.10';
import { toBlobURL } from 'https://esm.sh/@ffmpeg/util@0.12.2';
import { createWorker } from 'https://esm.sh/tesseract.js@5.1.1';

const $ = (s) => document.querySelector(s);
const video = $('#video');
const canvas = $('#canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const fileInput = $('#videoFile');
const scanBtn = $('#scanBtn');
const extractBtn = $('#extractBtn');
const loadEngineBtn = $('#loadEngineBtn');
const results = $('#results');
const logEl = $('#log');
const progressEl = $('#progress');
const statusEl = $('#status');
const targetEl = $('#targetTeam');
const beforeEl = $('#beforeSec');
const afterEl = $('#afterSec');
const intervalEl = $('#intervalSec');

let sourceFile = null, duration = 0, goals = [], ffmpeg = null, ffmpegLoaded = false;
let scanBusy = false, ocrWorker = null, sourceUrl = null;

function log(msg) { const now = new Date().toLocaleTimeString('ja-JP',{hour12:false}); logEl.textContent = `[${now}] ${msg}\n` + logEl.textContent; }
function status(msg) { statusEl.textContent = msg; }
function fmt(t) { const s=Math.max(0,Math.floor(t)); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

fileInput.addEventListener('change', async () => {
  sourceFile = fileInput.files?.[0] || null;
  goals=[]; results.innerHTML='<p class="muted">まだ解析していません。</p>';
  extractBtn.disabled=true; loadEngineBtn.disabled=!sourceFile;
  if (!sourceFile) return;
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  sourceUrl=URL.createObjectURL(sourceFile); video.src=sourceUrl; video.load();
  status('動画を読み込み中…');
  await new Promise((resolve,reject)=>{
    const ok=()=>{cleanup();resolve()}; const bad=()=>{cleanup();reject(new Error('動画を読み込めませんでした'))};
    const cleanup=()=>{video.removeEventListener('loadedmetadata',ok);video.removeEventListener('error',bad)};
    video.addEventListener('loadedmetadata',ok,{once:true}); video.addEventListener('error',bad,{once:true});
  });
  duration=video.duration; $('#duration').textContent=fmt(duration);
  status(`動画を読み込みました（${fmt(duration)}）`); log(`動画: ${sourceFile.name} / ${(sourceFile.size/1024/1024).toFixed(1)}MB`);
});

async function seekTo(t){
  const target=clamp(t,0,Math.max(0,duration-0.02));
  if(Math.abs(video.currentTime-target)<0.03) return;
  await new Promise((resolve,reject)=>{
    let done=false; const timer=setTimeout(()=>finish(new Error('seek timeout')),10000);
    const finish=(err)=>{if(done)return;done=true;clearTimeout(timer);video.removeEventListener('seeked',onSeeked);err?reject(err):resolve()};
    const onSeeked=()=>finish(); video.addEventListener('seeked',onSeeked,{once:true}); video.currentTime=target;
  });
}

// Calibrated from the supplied 910x512 Minotani/Tomaimai scoreboard.
function drawScoreCrop(){
  const w=video.videoWidth,h=video.videoHeight;
  const sx=Math.round(w*145/910), sy=0, sw=Math.round(w*95/910), sh=Math.round(h*70/512);
  canvas.width=380;canvas.height=280;ctx.fillStyle='#fff';ctx.fillRect(0,0,380,280);
  ctx.drawImage(video,sx,sy,sw,sh,0,0,380,280); return {sx,sy,sw,sh};
}
function imageDifference(a,b){
  if(!a||!b)return 999; let sum=0,n=0;
  for(let y=20;y<a.height-20;y+=5) for(let x=10;x<a.width-10;x+=5){
    const i=(y*a.width+x)*4,j=i; const ga=a.data[i]*.299+a.data[i+1]*.587+a.data[i+2]*.114; const gb=b.data[j]*.299+b.data[j+1]*.587+b.data[j+2]*.114; sum+=Math.abs(ga-gb);n++;
  } return n?sum/n:0;
}

async function getOCRWorker(){
  if(ocrWorker)return ocrWorker;
  status('OCRエンジンを初回起動中…');
  ocrWorker=await createWorker('eng',1,{logger:m=>{if(m.status==='recognizing text')progressEl.value=Math.round((m.progress||0)*100)}});
  await ocrWorker.setParameters({tessedit_char_whitelist:'0123456789-',tessedit_pageseg_mode:'7'});
  return ocrWorker;
}
async function recognizeScore(){
  const worker=await getOCRWorker();
  const ret=await worker.recognize(canvas);
  const raw=(ret.data.text||'').replace(/\s/g,'');
  const m=raw.match(/(\d{1,2})[-ー](\d{1,2})/);
  return m?{home:Number(m[1]),away:Number(m[2]),raw}:null;
}
function scoreKey(s){return `${s.home}-${s.away}`}
function renderResults(){
  results.innerHTML='';
  if(!goals.length){results.innerHTML='<p class="muted">ゴールは検出されませんでした。</p>';return;}
  goals.forEach((g,i)=>{const row=document.createElement('div');row.className='goal';row.innerHTML=`<div><b>⚽ GOAL ${i+1}</b><br><span>${g.from} → <strong>${g.to}</strong></span></div><div>${fmt(g.time)}</div>`;results.appendChild(row)});
}

scanBtn.addEventListener('click',async()=>{
  if(!sourceFile||scanBusy)return; scanBusy=true;scanBtn.disabled=true;extractBtn.disabled=true;goals=[];results.innerHTML='';
  const interval=Math.max(.5,Number(intervalEl.value)||1),target=targetEl.value;
  let previous=null,candidate=null,previousImage=null;
  try{
    status('スコア解析中…');
    for(let t=0;t<duration;t+=interval){
      await seekTo(t); drawScoreCrop();
      const img=ctx.getImageData(0,0,canvas.width,canvas.height);
      const changed=imageDifference(previousImage,img)>7.5; previousImage=img;
      if(!previous||changed||candidate){
        let sc=null; try{sc=await recognizeScore()}catch(e){log(`OCR: ${e.message}`)}
        if(sc){
          const key=scoreKey(sc);
          if(!previous){previous={...sc};candidate=null;log(`初期スコア ${key} @ ${fmt(t)}`);}
          else if(key!==scoreKey(previous)){
            if(candidate?.key===key) candidate.count++; else candidate={key,home:sc.home,away:sc.away,time:t,count:1};
            if(candidate.count>=2){
              const old=previous,newScore={home:sc.home,away:sc.away};
              const homeChanged=newScore.home>old.home,awayChanged=newScore.away>old.away;
              const wanted=target==='both'||(target==='minotani'&&homeChanged)||(target==='opponent'&&awayChanged);
              if(wanted && (!goals.length||t-goals.at(-1).time>20)) goals.push({time:candidate.time,from:scoreKey(old),to:scoreKey(newScore)});
              previous=newScore;candidate=null;
            }
          }else candidate=null;
        }
      }
      const pct=Math.round(t/duration*100);progressEl.value=pct;status(`解析中… ${fmt(t)} / ${fmt(duration)}（${pct}%）`);await sleep(0);
    }
    renderResults();extractBtn.disabled=goals.length===0;status(`解析完了：${goals.length}ゴールを検出`);log(`解析完了: ${goals.length}ゴール`);
  }catch(e){console.error(e);status(`エラー: ${e.message}`);log(`ERROR: ${e.stack||e.message}`)}
  finally{scanBusy=false;scanBtn.disabled=false}
});

loadEngineBtn.addEventListener('click',async()=>{
  if(ffmpegLoaded)return;

  loadEngineBtn.disabled=true;
  status('動画切り出しエンジンを準備中…');

  try{
ffmpeg=new FFmpeg();

ffmpeg.on('log',({message})=>{
  log(`FFmpeg: ${message}`);
});

ffmpeg.on('progress',({progress})=>{  
     
      progressEl.value=Math.round(progress*100);
    });

    const baseURL='https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';

    const classWorkerURL=new URL(
      './ffmpeg-worker.js',
      import.meta.url
    ).href;

    await ffmpeg.load({
      coreURL:await toBlobURL(
        `${baseURL}/ffmpeg-core.js`,
        'text/javascript'
      ),
      wasmURL:await toBlobURL(
        `${baseURL}/ffmpeg-core.wasm`,
        'application/wasm'
      ),
      classWorkerURL
    });

    ffmpegLoaded=true;
    status('切り出しエンジン準備完了');
    log('FFmpeg WASM loaded');

  }catch(e){
    console.error(e);
    loadEngineBtn.disabled=false;
    status(`FFmpeg読み込み失敗: ${e.message}`);
    log(`FFmpeg ERROR: ${e.stack||e.message}`);
  }
});






extractBtn.addEventListener('click',async()=>{
  if(!sourceFile||!goals.length)return;

  if(!ffmpegLoaded){
    await loadEngineBtn.click();
  }

  if(!ffmpegLoaded)return;

  extractBtn.disabled=true;

  const before=Math.max(
    0,
    Number(beforeEl.value)||15
  );

  const after=Math.max(
    0,
    Number(afterEl.value)||10
  );

  const inputName='input.mp4';
  const clipNames=[];

  try{

    status('動画ファイルをFFmpegへ転送中…');

    log(
      `入力動画: ${sourceFile.name} / `+
      `${(sourceFile.size/1024/1024).toFixed(1)}MB`
    );

    /*
     * 元動画をFFmpegへ書き込む
     *
     * WORKERFSは使用しない。
     */
    log('FFmpegへ動画を書き込み中…');

    const inputData=new Uint8Array(
      await sourceFile.arrayBuffer()
    );

    await ffmpeg.writeFile(
      inputName,
      inputData
    );

    log(
      `FFmpegへの動画転送完了: `+
      `${(inputData.byteLength/1024/1024).toFixed(1)}MB`
    );

    /*
     * 元データをJS側から解放
     */
    // inputDataはconstなので明示的な解放はできないが、
    // FFmpeg側のinput.mp4を使用して処理する。
    for(let i=0;i<goals.length;i++){

      const g=goals[i];

      const start=Math.max(
        0,
        g.time-before
      );

      const len=Math.min(
        before+after,
        duration-start
      );

      const out=
        `goal_${String(i+1).padStart(2,'0')}.mp4`;

      status(
        `GOAL ${i+1}/${goals.length} を作成中…`
      );

      log(
        `GOAL ${i+1}: `+
        `${fmt(start)} ～ ${fmt(start+len)}`
      );

      const result=await ffmpeg.exec([
        '-ss',
        String(start),

        '-i',
        inputName,

        '-t',
        String(len),

        '-map',
        '0:v:0',

        '-map',
        '0:a:0?',

        '-c:v',
        'libx264',

        '-preset',
        'ultrafast',

        '-crf',
        '28',

        '-c:a',
        'aac',

        '-b:a',
        '96k',

        '-movflags',
        '+faststart',

        '-y',
        out
      ]);

      log(
        `FFmpeg exec result: ${result}`
      );

      if(result!==0){
        throw new Error(
          `FFmpeg処理に失敗しました（終了コード: ${result}）`
        );
      }

      /*
       * 作成されたゴール動画を確認
       */
      const data=
        await ffmpeg.readFile(out);

      if(!data||!data.length){
        throw new Error(
          `${out} が作成されませんでした`
        );
      }

      clipNames.push(out);

      /*
       * 個別ゴール動画を画面に表示
       */
      const blob=
        new Blob(
          [data],
          {type:'video/mp4'}
        );

      const url=
        URL.createObjectURL(blob);

      renderDownload(
        out,
        url,
        g,
        start,
        len
      );

      /*
       * 次のゴールへ
       */
      progressEl.value=
        Math.round(
          ((i+1)/goals.length)*100
        );
    }

    /*
     * 元動画はもう不要なので削除
     */
    try{
      await ffmpeg.deleteFile(inputName);
      log('元動画をFFmpegから削除しました');
    }catch(e){
      log(
        `元動画削除: ${e.message||e}`
      );
    }

    /*
     * ゴール動画が複数ある場合
     * 1本のALL_GOALS.mp4へ結合
     */
    if(clipNames.length>1){

      status(
        'ゴール動画を1本に結合中…'
      );

      log(
        `${clipNames.length}本のゴール動画を結合します`
      );

      const concatText=
        clipNames
          .map(
            n=>`file '${n}'`
          )
          .join('\n')+
        '\n';

      await ffmpeg.writeFile(
        'concat.txt',
        concatText
      );

      const result=
        await ffmpeg.exec([
          '-f',
          'concat',

          '-safe',
          '0',

          '-i',
          'concat.txt',

          '-c',
          'copy',

          '-y',

          'all_goals.mp4'
        ]);

      log(
        `結合結果: ${result}`
      );

      if(result!==0){
        throw new Error(
          `ゴール動画の結合に失敗しました（終了コード: ${result}）`
        );
      }

      const allData=
        await ffmpeg.readFile(
          'all_goals.mp4'
        );

      if(
        !allData||
        !allData.length
      ){
        throw new Error(
          'ALL_GOALS.mp4 が作成されませんでした'
        );
      }

      const allUrl=
        URL.createObjectURL(
          new Blob(
            [allData],
            {type:'video/mp4'}
          )
        );

      renderCombinedDownload(
        allUrl,
        goals.length
      );

    }else if(clipNames.length===1){

      /*
       * ゴールが1本だけの場合
       */
      const single=
        await ffmpeg.readFile(
          clipNames[0]
        );

      const allUrl=
        URL.createObjectURL(
          new Blob(
            [single],
            {type:'video/mp4'}
          )
        );

      renderCombinedDownload(
        allUrl,
        1
      );
    }

    /*
     * FFmpeg内の不要ファイルを削除
     */
    for(
      const name of [
        ...clipNames,
        'concat.txt',
        'all_goals.mp4'
      ]
    ){

      try{
        await ffmpeg.deleteFile(name);
      }catch{}
    }

    status(
      `完了：${goals.length}本のゴール動画を作成しました`
    );

    log(
      `${goals.length} clips created`
    );

  }catch(e){

    console.error(
      'CUT ERROR',
      e
    );

    const message=
      e?.message||
      e?.toString?.()||
      String(e);

    status(
      `切り出しエラー: ${message}`
    );

    log(
      `CUT ERROR: ${message}`
    );

  }finally{

    extractBtn.disabled=false;

  }
});










function renderCombinedDownload(url,count){
  const wrap=document.createElement('div');wrap.className='download combined';
  const info=document.createElement('div');info.innerHTML=`<b>🎬 ALL_GOALS.mp4</b><br><span>${count}本のゴールを1本にまとめた動画</span>`;wrap.appendChild(info);
  const v=document.createElement('video');v.controls=true;v.playsInline=true;v.src=url;wrap.appendChild(v);
  const a=document.createElement('a');a.href=url;a.download='ALL_GOALS.mp4';a.textContent='⬇️ ALL_GOALS.mp4 を保存';wrap.appendChild(a);results.prepend(wrap);
}

function renderDownload(name,url,g,start,len){
  const wrap=document.createElement('div');wrap.className='download';
  const info=document.createElement('div');info.innerHTML=`<b>${name}</b><br><span>${fmt(start)} ～ ${fmt(start+len)}（${fmt(len)}）</span>`;wrap.appendChild(info);
  const v=document.createElement('video');v.controls=true;v.playsInline=true;v.src=url;wrap.appendChild(v);
  const a=document.createElement('a');a.href=url;a.download=name;a.textContent='⬇️ 動画を保存';wrap.appendChild(a);results.appendChild(wrap);
}
