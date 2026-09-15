import { FFmpeg } from 'https://esm.sh/@ffmpeg/ffmpeg@0.12.10';
import { toBlobURL } from 'https://esm.sh/@ffmpeg/util@0.12.2';
import { createWorker } from 'https://esm.sh/tesseract.js@5.1.1';

const $ = (s) => document.querySelector(s);

const video = $('#video');
const canvas = $('#canvas');
const ctx = canvas.getContext('2d', {
  willReadFrequently: true
});

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

let sourceFile = null;
let duration = 0;
let goals = [];

let ffmpeg = null;
let ffmpegLoaded = false;

let scanBusy = false;
let ocrWorker = null;
let sourceUrl = null;


/* =========================================================
   共通
========================================================= */

function log(msg) {
  const now = new Date().toLocaleTimeString(
    'ja-JP',
    { hour12: false }
  );

  logEl.textContent =
    `[${now}] ${msg}\n` +
    logEl.textContent;
}

function status(msg) {
  statusEl.textContent = msg;
}

function fmt(t) {
  const s = Math.max(0, Math.floor(t));

  return (
    `${Math.floor(s / 60)}:` +
    `${String(s % 60).padStart(2, '0')}`
  );
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


/* =========================================================
   動画読み込み
========================================================= */

fileInput.addEventListener('change', async () => {

  sourceFile =
    fileInput.files?.[0] || null;

  goals = [];

  results.innerHTML =
    '<p class="muted">まだ解析していません。</p>';

  extractBtn.disabled = true;
  loadEngineBtn.disabled = !sourceFile;

  if (!sourceFile) return;

  if (sourceUrl) {
    URL.revokeObjectURL(sourceUrl);
  }

  sourceUrl =
    URL.createObjectURL(sourceFile);

  video.src = sourceUrl;
  video.load();

  status('動画を読み込み中…');

  try {

    await new Promise((resolve, reject) => {

      const onLoaded = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        reject(
          new Error('動画を読み込めませんでした')
        );
      };

      const cleanup = () => {
        video.removeEventListener(
          'loadedmetadata',
          onLoaded
        );

        video.removeEventListener(
          'error',
          onError
        );
      };

      video.addEventListener(
        'loadedmetadata',
        onLoaded,
        { once: true }
      );

      video.addEventListener(
        'error',
        onError,
        { once: true }
      );

    });

    duration = video.duration;

    $('#duration').textContent =
      fmt(duration);

    status(
      `動画を読み込みました（${fmt(duration)}）`
    );

    log(
      `動画: ${sourceFile.name} / ` +
      `${(sourceFile.size / 1024 / 1024).toFixed(1)}MB`
    );

  } catch (e) {

    status(
      `動画読み込みエラー: ${e.message}`
    );

    log(
      `VIDEO ERROR: ${e.stack || e.message}`
    );
  }
});


/* =========================================================
   スコア部分切り出し
========================================================= */

// 910x512のテスト動画で調整済み
function drawScoreCrop() {

  const w = video.videoWidth;
  const h = video.videoHeight;

  const sx =
    Math.round(w * 145 / 910);

  const sy = 0;

  const sw =
    Math.round(w * 95 / 910);

  const sh =
    Math.round(h * 70 / 512);

  canvas.width = 380;
  canvas.height = 280;

  ctx.fillStyle = '#fff';

  ctx.fillRect(
    0,
    0,
    380,
    280
  );

  ctx.drawImage(
    video,
    sx,
    sy,
    sw,
    sh,
    0,
    0,
    380,
    280
  );

  return {
    sx,
    sy,
    sw,
    sh
  };
}


/* =========================================================
   画像変化判定
========================================================= */

function imageDifference(a, b) {

  if (!a || !b) {
    return 999;
  }

  let sum = 0;
  let n = 0;

  for (
    let y = 20;
    y < a.height - 20;
    y += 5
  ) {

    for (
      let x = 10;
      x < a.width - 10;
      x += 5
    ) {

      const i =
        (y * a.width + x) * 4;

      const ga =
        a.data[i] * 0.299 +
        a.data[i + 1] * 0.587 +
        a.data[i + 2] * 0.114;

      const gb =
        b.data[i] * 0.299 +
        b.data[i + 1] * 0.587 +
        b.data[i + 2] * 0.114;

      sum += Math.abs(ga - gb);

      n++;
    }
  }

  return n
    ? sum / n
    : 0;
}


/* =========================================================
   OCR
========================================================= */

async function getOCRWorker() {

  if (ocrWorker) {
    return ocrWorker;
  }

  status(
    'OCRエンジンを初回起動中…'
  );

  ocrWorker =
    await createWorker(
      'eng',
      1,
      {
        logger: m => {

          if (
            m.status ===
            'recognizing text'
          ) {

            progressEl.value =
              Math.round(
                (m.progress || 0) * 100
              );
          }
        }
      }
    );

  await ocrWorker.setParameters({
    tessedit_char_whitelist:
      '0123456789-',

    tessedit_pageseg_mode:
      '7'
  });

  return ocrWorker;
}


async function recognizeScore() {

  const worker =
    await getOCRWorker();

  const ret =
    await worker.recognize(canvas);

  const raw =
    (ret.data.text || '')
      .replace(/\s/g, '');

  const m =
    raw.match(
      /(\d{1,2})[-ー](\d{1,2})/
    );

  if (!m) {
    return null;
  }

  return {
    home: Number(m[1]),
    away: Number(m[2]),
    raw
  };
}


function scoreKey(s) {
  return `${s.home}-${s.away}`;
}


/* =========================================================
   結果表示
========================================================= */

function renderResults() {

  results.innerHTML = '';

  if (!goals.length) {

    results.innerHTML =
      '<p class="muted">' +
      'ゴールは検出されませんでした。' +
      '</p>';

    return;
  }

  goals.forEach((g, i) => {

    const row =
      document.createElement('div');

    row.className = 'goal';

    row.innerHTML =
      `<div>
        <b>⚽ GOAL ${i + 1}</b><br>
        <span>
          ${g.from} →
          <strong>${g.to}</strong>
        </span>
      </div>
      <div>${fmt(g.time)}</div>`;

    results.appendChild(row);
  });
}


/* =========================================================
   高速動画解析
========================================================= */

scanBtn.addEventListener(
  'click',
  async () => {

    if (!sourceFile || scanBusy) {
      return;
    }

    scanBusy = true;

    scanBtn.disabled = true;
    extractBtn.disabled = true;

    goals = [];

    results.innerHTML = '';

    const interval =
      Math.max(
        0.5,
        Number(intervalEl.value) || 2
      );

    const target =
      targetEl.value;

    const SCORE_CONFIRM_COUNT = 3;
    const MIN_GOAL_GAP = 20;

    let previousScore = null;
    let candidate = null;

    let lastSampleTime = -999;
    let lastImage = null;

    let frameRequest = null;
    let finished = false;

    /*
     * 高速解析倍率
     *
     * 30分動画なら
     * 8倍 → 約3分45秒
     *
     * Safariの負荷を考えて8倍。
     */
    const PLAYBACK_RATE = 8;

    try {

      status(
        '高速スコア解析を開始…'
      );

      log(
        `解析開始: ${fmt(duration)}`
      );

      log(
        `解析速度: ${PLAYBACK_RATE}倍`
      );

      /*
       * 動画を先頭へ
       *
       * ここではseekを1回だけ行う。
       */
      video.pause();

      video.currentTime = 0;

      await new Promise(resolve => {

        if (
          Math.abs(video.currentTime) < 0.1
        ) {
          resolve();
          return;
        }

        const onSeeked = () => {
          video.removeEventListener(
            'seeked',
            onSeeked
          );

          resolve();
        };

        video.addEventListener(
          'seeked',
          onSeeked,
          { once: true }
        );
      });


      /*
       * requestVideoFrameCallback
       *
       * Safariが実際に描画したフレームを取得する。
       */
      const processFrame =
        async (
          now,
          metadata
        ) => {

          if (finished) {
            return;
          }

          const currentTime =
            metadata.mediaTime ??
            video.currentTime;

          /*
           * 動画終了
           */
          if (
            currentTime >=
            duration - 0.1
          ) {

            finished = true;

            if (frameRequest !== null) {
              cancelAnimationFrame(
                frameRequest
              );
            }

            try {
              video.pause();
            } catch {}

            renderResults();

            extractBtn.disabled =
              goals.length === 0;

            status(
              `解析完了：${goals.length}ゴールを検出`
            );

            log(
              `解析完了: ${goals.length}ゴール`
            );

            scanBusy = false;
            scanBtn.disabled = false;

            return;
          }


          /*
           * 指定間隔になるまでOCRしない
           */
          if (
            currentTime -
            lastSampleTime >=
            interval
          ) {

            lastSampleTime =
              currentTime;

            drawScoreCrop();

            const img =
              ctx.getImageData(
                0,
                0,
                canvas.width,
                canvas.height
              );

            const changed =
              imageDifference(
                lastImage,
                img
              ) > 7.5;

            lastImage = img;


            /*
             * 初回
             * または画像変化
             * または候補確認中
             */
            if (
              !previousScore ||
              changed ||
              candidate
            ) {

              let sc = null;

              try {

                sc =
                  await recognizeScore();

              } catch (e) {

                log(
                  `OCR警告: ${e.message}`
                );
              }


              if (sc) {

                const key =
                  scoreKey(sc);


                /*
                 * 初期スコア
                 */
                if (!previousScore) {

                  previousScore = {
                    ...sc
                  };

                  candidate = null;

                  log(
                    `初期スコア ${key} @ ` +
                    `${fmt(currentTime)}`
                  );
                }


                /*
                 * 現在スコアと同じ
                 */
                else if (
                  key ===
                  scoreKey(previousScore)
                ) {

                  if (candidate) {

                    log(
                      `スコア候補取消: ` +
                      `${candidate.key} → ${key} @ ` +
                      `${fmt(currentTime)}`
                    );

                    candidate = null;
                  }
                }


                /*
                 * 新しいスコア
                 */
                else {

                  const homeDiff =
                    sc.home -
                    previousScore.home;

                  const awayDiff =
                    sc.away -
                    previousScore.away;


                  /*
                   * 正常な1点変化だけ
                   */
                  const validScoreChange =
                    (
                      homeDiff === 1 &&
                      awayDiff === 0
                    ) ||
                    (
                      homeDiff === 0 &&
                      awayDiff === 1
                    );


                  if (!validScoreChange) {

                    /*
                     * ハーフタイム等で
                     * スコアがリセットされた場合
                     *
                     * 大きな減少なら
                     * 新しい試合として扱う。
                     */
                    if (
                      sc.home <
                      previousScore.home ||
                      sc.away <
                      previousScore.away
                    ) {

                      log(
                        `スコアリセット検出: ` +
                        `${scoreKey(previousScore)} → ${key}`
                      );

                      previousScore = {
                        ...sc
                      };

                      candidate = null;

                    } else {

                      log(
                        `異常スコア変化を無視: ` +
                        `${scoreKey(previousScore)} → ${key} @ ` +
                        `${fmt(currentTime)}`
                      );

                      candidate = null;
                    }

                  } else {


                    /*
                     * ゴール候補作成
                     */
                    if (
                      !candidate ||
                      candidate.key !== key
                    ) {

                      candidate = {

                        key,

                        home: sc.home,
                        away: sc.away,

                        time: currentTime,

                        count: 1

                      };

                      log(
                        `ゴール候補: ` +
                        `${scoreKey(previousScore)} → ${key} ` +
                        `@ ${fmt(currentTime)} / 確認1`
                      );

                    } else {

                      candidate.count++;

                      log(
                        `ゴール候補確認: ` +
                        `${key} / ` +
                        `${candidate.count}/` +
                        `${SCORE_CONFIRM_COUNT}`
                      );
                    }


                    /*
                     * 3回確認
                     */
                    if (
                      candidate.count >=
                      SCORE_CONFIRM_COUNT
                    ) {

                      const old = {
                        ...previousScore
                      };

                      const newScore = {

                        home:
                          candidate.home,

                        away:
                          candidate.away
                      };


                      const homeChanged =
                        newScore.home >
                        old.home;

                      const awayChanged =
                        newScore.away >
                        old.away;


                      const wanted =
                        target === 'both' ||

                        (
                          target ===
                          'minotani' &&
                          homeChanged
                        ) ||

                        (
                          target ===
                          'opponent' &&
                          awayChanged
                        );


                      const tooClose =
                        goals.length > 0 &&
                        (
                          candidate.time -
                          goals.at(-1).time
                        ) <
                        MIN_GOAL_GAP;


                      if (
                        wanted &&
                        !tooClose
                      ) {

                        goals.push({

                          time:
                            candidate.time,

                          from:
                            scoreKey(old),

                          to:
                            scoreKey(newScore)

                        });

                        log(
                          `⚽ GOAL確定: ` +
                          `${scoreKey(old)} → ` +
                          `${scoreKey(newScore)} @ ` +
                          `${fmt(candidate.time)}`
                        );

                      } else if (
                        tooClose
                      ) {

                        log(
                          `ゴール重複を無視: ` +
                          `${scoreKey(old)} → ` +
                          `${scoreKey(newScore)} @ ` +
                          `${fmt(candidate.time)}`
                        );
                      }


                      previousScore =
                        newScore;

                      candidate = null;
                    }
                  }
                }
              }
            }


            const pct =
              Math.round(
                currentTime /
                duration *
                100
              );

            progressEl.value =
              pct;

            status(
              `解析中… ` +
              `${fmt(currentTime)} / ` +
              `${fmt(duration)} ` +
              `（${pct}%）`
            );
          }


          /*
           * 次のフレームを要求
           */
          frameRequest =
            video.requestVideoFrameCallback(
              processFrame
            );
        };


      /*
       * requestVideoFrameCallback が
       * 利用できないブラウザ用
       */
      if (
        typeof video.requestVideoFrameCallback !==
        'function'
      ) {

        throw new Error(
          'このブラウザは動画フレーム解析に対応していません'
        );
      }


      /*
       * 8倍速
       */
      video.playbackRate =
        PLAYBACK_RATE;

      video.muted = true;
      video.playsInline = true;


      /*
       * 最初のフレームを登録
       */
      frameRequest =
        video.requestVideoFrameCallback(
          processFrame
        );


      /*
       * 再生開始
       */
      await video.play();

    } catch (e) {

      console.error(e);

      finished = true;

      try {
        video.pause();
      } catch {}

      status(
        `エラー: ${e.message}`
      );

      log(
        `ERROR: ${e.stack || e.message}`
      );

      scanBusy = false;
      scanBtn.disabled = false;
    }
  }
);


/* =========================================================
   FFmpeg
   ここから下は従来処理
========================================================= */

loadEngineBtn.addEventListener(
  'click',
  async () => {

    if (ffmpegLoaded) {
      return;
    }

    loadEngineBtn.disabled = true;

    status(
      '動画切り出しエンジンを準備中…'
    );

    try {

      ffmpeg = new FFmpeg();

      ffmpeg.on(
        'log',
        ({ message }) => {

          log(
            `FFmpeg: ${message}`
          );
        }
      );

      ffmpeg.on(
        'progress',
        ({ progress }) => {

          progressEl.value =
            Math.round(
              progress * 100
            );
        }
      );


      const baseURL =
        'https://cdn.jsdelivr.net/npm/' +
        '@ffmpeg/core@0.12.10/dist/esm';


      const classWorkerURL =
        new URL(
          './ffmpeg-worker.js',
          import.meta.url
        ).href;


      await ffmpeg.load({

        coreURL:
          await toBlobURL(
            `${baseURL}/ffmpeg-core.js`,
            'text/javascript'
          ),

        wasmURL:
          await toBlobURL(
            `${baseURL}/ffmpeg-core.wasm`,
            'application/wasm'
          ),

        classWorkerURL

      });


      ffmpegLoaded = true;

      status(
        '切り出しエンジン準備完了'
      );

      log(
        'FFmpeg WASM loaded'
      );

    } catch (e) {

      console.error(e);

      loadEngineBtn.disabled = false;

      status(
        `FFmpeg読み込み失敗: ${e.message}`
      );

      log(
        `FFmpeg ERROR: ${e.stack || e.message}`
      );
    }
  }
);


/* =========================================================
   ゴール動画切り出し
========================================================= */

extractBtn.addEventListener(
  'click',
  async () => {

    if (
      !sourceFile ||
      !goals.length
    ) {
      return;
    }


    if (!ffmpegLoaded) {

      await loadEngineBtn.click();
    }


    if (!ffmpegLoaded) {
      return;
    }


    extractBtn.disabled = true;


    const before =
      Math.max(
        0,
        Number(beforeEl.value) || 15
      );


    const after =
      Math.max(
        0,
        Number(afterEl.value) || 10
      );


    const inputName =
      'input.mp4';

    const clipNames = [];


    try {

      status(
        '動画ファイルをFFmpegへ転送中…'
      );


      log(
        `入力動画: ${sourceFile.name} / ` +
        `${(
          sourceFile.size /
          1024 /
          1024
        ).toFixed(1)}MB`
      );


      log(
        'FFmpegへ動画を書き込み中…'
      );


      const inputData =
        new Uint8Array(
          await sourceFile.arrayBuffer()
        );


      await ffmpeg.writeFile(
        inputName,
        inputData
      );


      log(
        `FFmpegへの動画転送完了: ` +
        `${(
          inputData.byteLength /
          1024 /
          1024
        ).toFixed(1)}MB`
      );


      for (
        let i = 0;
        i < goals.length;
        i++
      ) {

        const g =
          goals[i];


        const start =
          Math.max(
            0,
            g.time - before
          );


        const len =
          Math.min(
            before + after,
            duration - start
          );


        const out =
          `goal_${String(i + 1).padStart(2, '0')}.mp4`;


        status(
          `GOAL ${i + 1}/${goals.length} を作成中…`
        );


        log(
          `GOAL ${i + 1}: ` +
          `${fmt(start)} ～ ` +
          `${fmt(start + len)}`
        );


        const result =
          await ffmpeg.exec([

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


        if (result !== 0) {

          throw new Error(
            `FFmpeg処理に失敗しました（終了コード: ${result}）`
          );
        }


        const data =
          await ffmpeg.readFile(out);


        if (
          !data ||
          !data.length
        ) {

          throw new Error(
            `${out} が作成されませんでした`
          );
        }


        clipNames.push(out);


        const blob =
          new Blob(
            [data],
            { type: 'video/mp4' }
          );


        const url =
          URL.createObjectURL(blob);


        renderDownload(
          out,
          url,
          g,
          start,
          len
        );


        progressEl.value =
          Math.round(
            ((i + 1) /
              goals.length) *
            100
          );
      }


      try {

        await ffmpeg.deleteFile(
          inputName
        );

        log(
          '元動画をFFmpegから削除しました'
        );

      } catch (e) {

        log(
          `元動画削除: ${e.message || e}`
        );
      }


      /*
       * 複数ゴールを結合
       */
      if (
        clipNames.length > 1
      ) {

        status(
          'ゴール動画を1本に結合中…'
        );


        log(
          `${clipNames.length}本のゴール動画を結合します`
        );


        const concatText =
          clipNames
            .map(
              n => `file '${n}'`
            )
            .join('\n') +
          '\n';


        await ffmpeg.writeFile(
          'concat.txt',
          concatText
        );


        const result =
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


        if (result !== 0) {

          throw new Error(
            `ゴール動画の結合に失敗しました（終了コード: ${result}）`
          );
        }


        const allData =
          await ffmpeg.readFile(
            'all_goals.mp4'
          );


        if (
          !allData ||
          !allData.length
        ) {

          throw new Error(
            'ALL_GOALS.mp4 が作成されませんでした'
          );
        }


        const allUrl =
          URL.createObjectURL(
            new Blob(
              [allData],
              { type: 'video/mp4' }
            )
          );


        renderCombinedDownload(
          allUrl,
          goals.length
        );


      } else if (
        clipNames.length === 1
      ) {

        const single =
          await ffmpeg.readFile(
            clipNames[0]
          );


        const allUrl =
          URL.createObjectURL(
            new Blob(
              [single],
              { type: 'video/mp4' }
            )
          );


        renderCombinedDownload(
          allUrl,
          1
        );
      }


      /*
       * 不要ファイル削除
       */
      for (
        const name of [
          ...clipNames,
          'concat.txt',
          'all_goals.mp4'
        ]
      ) {

        try {

          await ffmpeg.deleteFile(
            name
          );

        } catch {}
      }


      status(
        `完了：${goals.length}本のゴール動画を作成しました`
      );


      log(
        `${goals.length} clips created`
      );


    } catch (e) {

      console.error(
        'CUT ERROR',
        e
      );


      const message =
        e?.message ||
        e?.toString?.() ||
        String(e);


      status(
        `切り出しエラー: ${message}`
      );


      log(
        `CUT ERROR: ${message}`
      );


    } finally {

      extractBtn.disabled = false;
    }
  }
);


/* =========================================================
   ダウンロード表示
========================================================= */

function renderCombinedDownload(
  url,
  count
) {

  const wrap =
    document.createElement('div');

  wrap.className =
    'download combined';


  const info =
    document.createElement('div');

  info.innerHTML =
    `<b>🎬 ALL_GOALS.mp4</b><br>` +
    `<span>${count}本のゴールを1本にまとめた動画</span>`;


  wrap.appendChild(info);


  const v =
    document.createElement('video');

  v.controls = true;
  v.playsInline = true;
  v.src = url;


  wrap.appendChild(v);


  const a =
    document.createElement('a');

  a.href = url;
  a.download = 'ALL_GOALS.mp4';

  a.textContent =
    '⬇️ ALL_GOALS.mp4 を保存';


  wrap.appendChild(a);


  results.prepend(wrap);
}


function renderDownload(
  name,
  url,
  g,
  start,
  len
) {

  const wrap =
    document.createElement('div');

  wrap.className =
    'download';


  const info =
    document.createElement('div');

  info.innerHTML =
    `<b>${name}</b><br>` +
    `<span>${fmt(start)} ～ ` +
    `${fmt(start + len)} ` +
    `（${fmt(len)}）</span>`;


  wrap.appendChild(info);


  const v =
    document.createElement('video');

  v.controls = true;
  v.playsInline = true;
  v.src = url;


  wrap.appendChild(v);


  const a =
    document.createElement('a');

  a.href = url;
  a.download = name;

  a.textContent =
    '⬇️ 動画を保存';


  wrap.appendChild(a);

  results.appendChild(wrap);
}
