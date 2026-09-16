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
    `[${now}] ${msg}\n` + logEl.textContent;
}

function status(msg) {
  statusEl.textContent = msg;
}

function fmt(t) {
  const s = Math.max(0, Math.floor(t));

  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


/* =========================================================
   動画選択
========================================================= */

fileInput.addEventListener('change', async () => {

  sourceFile = fileInput.files?.[0] || null;

  goals = [];

  results.innerHTML =
    '<p class="muted">まだ解析していません。</p>';

  extractBtn.disabled = true;
  loadEngineBtn.disabled = !sourceFile;

  if (!sourceFile) {
    return;
  }

  if (sourceUrl) {
    URL.revokeObjectURL(sourceUrl);
  }

  sourceUrl = URL.createObjectURL(sourceFile);

  video.src = sourceUrl;
  video.load();

  status('動画を読み込み中…');

  await new Promise((resolve, reject) => {

    const ok = () => {
      cleanup();
      resolve();
    };

    const bad = () => {
      cleanup();
      reject(
        new Error('動画を読み込めませんでした')
      );
    };

    const cleanup = () => {
      video.removeEventListener(
        'loadedmetadata',
        ok
      );

      video.removeEventListener(
        'error',
        bad
      );
    };

    video.addEventListener(
      'loadedmetadata',
      ok,
      { once: true }
    );

    video.addEventListener(
      'error',
      bad,
      { once: true }
    );
  });

  duration = video.duration;

  $('#duration').textContent = fmt(duration);

  status(
    `動画を読み込みました（${fmt(duration)}）`
  );

  log(
    `動画: ${sourceFile.name} / ${(sourceFile.size / 1024 / 1024).toFixed(1)}MB`
  );
});


/* =========================================================
   シーク
========================================================= */

async function seekTo(t) {

  const target = clamp(
    t,
    0,
    Math.max(0, duration - 0.02)
  );

  if (
    Math.abs(video.currentTime - target) < 0.03
  ) {
    return;
  }

  await new Promise((resolve, reject) => {

    let done = false;

    const timer = setTimeout(() => {
      finish(
        new Error('seek timeout')
      );
    }, 10000);

    const finish = (err) => {

      if (done) return;

      done = true;

      clearTimeout(timer);

      video.removeEventListener(
        'seeked',
        onSeeked
      );

      if (err) {
        reject(err);
      } else {
        resolve();
      }
    };

    const onSeeked = () => {
      finish();
    };

    video.addEventListener(
      'seeked',
      onSeeked,
      { once: true }
    );

    video.currentTime = target;
  });
}


/* =========================================================
   スコア部分を切り出す
========================================================= */

// 910x512 の箕谷SCスコア表示位置に合わせた設定
function drawScoreCrop() {

  const w = video.videoWidth;
  const h = video.videoHeight;

  const sx = Math.round(
    w * 145 / 910
  );

  const sy = 0;

  const sw = Math.round(
    w * 95 / 910
  );

  const sh = Math.round(
    h * 70 / 512
  );

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
   画像差分
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

      const j = i;

      const ga =
        a.data[i] * 0.299 +
        a.data[i + 1] * 0.587 +
        a.data[i + 2] * 0.114;

      const gb =
        b.data[j] * 0.299 +
        b.data[j + 1] * 0.587 +
        b.data[j + 2] * 0.114;

      sum += Math.abs(ga - gb);

      n++;
    }
  }

  return n ? sum / n : 0;
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

  ocrWorker = await createWorker(
    'eng',
    1,
    {
      logger: m => {

        if (
          m.status === 'recognizing text'
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

    tessedit_pageseg_mode: '7'
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


function scoreKey(score) {
  return `${score.home}-${score.away}`;
}


/* =========================================================
   スコア検証
========================================================= */

function isValidScore(score) {

  if (!score) {
    return false;
  }

  if (
    !Number.isInteger(score.home) ||
    !Number.isInteger(score.away)
  ) {
    return false;
  }

  // サッカーの試合として現実的な範囲
  if (
    score.home < 0 ||
    score.home > 30 ||
    score.away < 0 ||
    score.away > 30
  ) {
    return false;
  }

  return true;
}


/*
 * ゴールによるスコア変化か判定
 *
 * 必ず片方だけが +1。
 */
function isValidGoalChange(
  oldScore,
  newScore
) {

  if (
    !isValidScore(oldScore) ||
    !isValidScore(newScore)
  ) {
    return false;
  }

  const dh =
    newScore.home - oldScore.home;

  const da =
    newScore.away - oldScore.away;

  const homeGoal =
    dh === 1 &&
    da === 0;

  const awayGoal =
    dh === 0 &&
    da === 1;

  return homeGoal || awayGoal;
}


/*
 * 確定済みスコアより過去へ戻っていないか。
 */
function isNotOlderScore(
  base,
  candidate
) {

  if (!base || !candidate) {
    return false;
  }

  return (
    candidate.home >= base.home &&
    candidate.away >= base.away
  );
}


/* =========================================================
   検出済みゴール重複チェック
========================================================= */

function alreadyDetected(
  fromScore,
  toScore
) {

  const from =
    scoreKey(fromScore);

  const to =
    scoreKey(toScore);

  return goals.some(g =>
    g.from === from &&
    g.to === to
  );
}


/* =========================================================
   結果表示
========================================================= */

function renderResults() {

  results.innerHTML = '';

  if (!goals.length) {

    results.innerHTML =
      '<p class="muted">ゴールは検出されませんでした。</p>';

    return;
  }

  goals.forEach((g, i) => {

    const row =
      document.createElement('div');

    row.className = 'goal';

    row.innerHTML = `
      <div>
        <b>⚽ GOAL ${i + 1}</b><br>
        <span>
          ${g.from}
          →
          <strong>${g.to}</strong>
        </span>
      </div>

      <div>
        ${fmt(g.time)}
      </div>
    `;

    results.appendChild(row);
  });
}


/* =========================================================
   スコア解析
========================================================= */

scanBtn.addEventListener(
  'click',
  async () => {

    if (
      !sourceFile ||
      scanBusy
    ) {
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
        Number(intervalEl.value) || 1
      );

    const target =
      targetEl.value;


    /*
     * -------------------------------------------------------
     * 解析状態
     * -------------------------------------------------------
     */

    let confirmedScore = null;

    /*
     * OCRで得たスコア履歴。
     *
     * 直近5回を保持する。
     */
    const scoreHistory = [];

    /*
     * ゴール候補
     */
    let candidateScore = null;

    /*
     * 候補を確認した回数
     */
    let candidateCount = 0;

    /*
     * 候補が初めて出現した時刻。
     *
     * ゴール動画の開始位置計算に使う。
     */
    let candidateFirstTime = null;

    /*
     * 前回画像
     */
    let previousImage = null;


    /*
     * -------------------------------------------------------
     * 履歴へ追加
     * -------------------------------------------------------
     */

    function pushScoreHistory(score) {

      if (!score) {
        return;
      }

      scoreHistory.push({
        home: score.home,
        away: score.away
      });

      while (
        scoreHistory.length > 5
      ) {
        scoreHistory.shift();
      }
    }


    /*
     * -------------------------------------------------------
     * 直近5回のOCRから安定スコアを取得
     * -------------------------------------------------------
     *
     * 同じスコアが3回以上あれば安定とする。
     */
    function getStableScore() {

      if (
        scoreHistory.length < 3
      ) {
        return null;
      }

      const counts =
        new Map();

      for (
        const score of scoreHistory
      ) {

        const key =
          scoreKey(score);

        counts.set(
          key,
          (counts.get(key) || 0) + 1
        );
      }

      let bestKey = null;
      let bestCount = 0;

      for (
        const [key, count]
        of counts.entries()
      ) {

        if (
          count > bestCount
        ) {

          bestKey = key;
          bestCount = count;
        }
      }

      if (
        bestCount < 3
      ) {
        return null;
      }

      const parts =
        bestKey.split('-');

      return {
        home: Number(parts[0]),
        away: Number(parts[1])
      };
    }


    /*
     * -------------------------------------------------------
     * 候補リセット
     * -------------------------------------------------------
     */

    function resetCandidate() {

      candidateScore = null;
      candidateCount = 0;
      candidateFirstTime = null;
    }


    /*
     * -------------------------------------------------------
     * 解析開始
     * -------------------------------------------------------
     */

    try {

      status(
        'スコア解析中…'
      );


      for (
        let t = 0;
        t < duration;
        t += interval
      ) {

        await seekTo(t);

        drawScoreCrop();


        /*
         * スコア表示部分の画像を取得
         */
        const img =
          ctx.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
          );


        /*
         * 前回画像との違い
         */
        const changed =
          imageDifference(
            previousImage,
            img
          ) > 7.5;

        previousImage = img;


        /*
         * ---------------------------------------------------
         * OCR実行条件
         * ---------------------------------------------------
         *
         * 最初は必ずOCR。
         *
         * スコア候補が出た後も必ずOCR。
         *
         * 通常時は表示変化があった場合だけOCR。
         */
        const shouldOCR =
          !confirmedScore ||
          changed ||
          candidateScore !== null;


        if (shouldOCR) {

          let score = null;

          try {

            score =
              await recognizeScore();

          } catch (e) {

            log(
              `OCR ERROR: ${e.message}`
            );
          }


          /*
           * OCR成功
           */
          if (
            score &&
            isValidScore(score)
          ) {

            const currentKey =
              scoreKey(score);


            /*
             * ------------------------------------------------
             * 初回スコア
             * ------------------------------------------------
             */

            if (!confirmedScore) {

              confirmedScore = {
                home: score.home,
                away: score.away
              };

              scoreHistory.length = 0;

              pushScoreHistory(
                score
              );

              resetCandidate();

              log(
                `初期スコア候補: ${currentKey} @ ${fmt(t)}`
              );

            }


            /*
             * ------------------------------------------------
             * 確定スコアと同じ
             * ------------------------------------------------
             */

            else if (
              scoreKey(
                confirmedScore
              ) === currentKey
            ) {

              /*
               * 元のスコアへ戻った
               *
               * → OCR誤認識候補だったと判断
               */
              if (candidateScore) {

                log(
                  `候補破棄: ${scoreKey(candidateScore)} → ${currentKey}`
                );
              }

              resetCandidate();

              pushScoreHistory(
                score
              );
            }


            /*
             * ------------------------------------------------
             * 確定スコアより大きい
             * ------------------------------------------------
             */

            else if (
              isNotOlderScore(
                confirmedScore,
                score
              )
            ) {

              /*
               * ------------------------------------------------
               * 正常なゴール候補
               * ------------------------------------------------
               */

              if (
                isValidGoalChange(
                  confirmedScore,
                  score
                )
              ) {

                /*
                 * 新しい候補
                 */
                if (
                  !candidateScore ||
                  scoreKey(
                    candidateScore
                  ) !== currentKey
                ) {

                  candidateScore = {
                    home: score.home,
                    away: score.away
                  };

                  candidateCount = 1;

                  candidateFirstTime = t;

                  log(
                    `⚽ 新スコア候補: ${scoreKey(confirmedScore)} → ${currentKey} @ ${fmt(t)}`
                  );

                }


                /*
                 * 同じ候補が続いた
                 */
                else {

                  candidateCount++;

                  log(
                    `候補確認 ${candidateCount}/3: ${currentKey} @ ${fmt(t)}`
                  );
                }


                /*
                 * ------------------------------------------------
                 * 3回連続確認
                 * ------------------------------------------------
                 */
                if (
                  candidateCount >= 3
                ) {

                  const oldScore = {
                    home:
                      confirmedScore.home,
                    away:
                      confirmedScore.away
                  };

                  const newScore = {
                    home:
                      candidateScore.home,
                    away:
                      candidateScore.away
                  };


                  /*
                   * 最終確認
                   */
                  if (
                    isValidGoalChange(
                      oldScore,
                      newScore
                    )
                  ) {

                    const from =
                      scoreKey(
                        oldScore
                      );

                    const to =
                      scoreKey(
                        newScore
                      );


                    /*
                     * 同じ遷移を二重登録しない
                     */
                    if (
                      !alreadyDetected(
                        oldScore,
                        newScore
                      )
                    ) {

                      const homeChanged =
                        newScore.home >
                        oldScore.home;

                      const awayChanged =
                        newScore.away >
                        oldScore.away;


                      /*
                       * 箕谷のゴールだけ
                       * 両チーム
                       * 相手のゴールだけ
                       */
                      const wanted =
                        target === 'both' ||

                        (
                          target === 'minotani' &&
                          homeChanged
                        ) ||

                        (
                          target === 'opponent' &&
                          awayChanged
                        );


                      if (wanted) {

                        goals.push({
                          time:
                            candidateFirstTime,

                          from,

                          to
                        });

                        log(
                          `⚽ GOAL確定: ${from} → ${to} @ ${fmt(candidateFirstTime)}`
                        );

                      } else {

                        log(
                          `スコア更新（抽出対象外）: ${from} → ${to}`
                        );
                      }
                    }


                    /*
                     * 新しいスコアを確定
                     */
                    confirmedScore = {
                      home:
                        newScore.home,

                      away:
                        newScore.away
                    };


                    /*
                     * 履歴を新しい確定スコアで
                     * リセット
                     */
                    scoreHistory.length = 0;

                    pushScoreHistory(
                      confirmedScore
                    );

                    pushScoreHistory(
                      confirmedScore
                    );

                    pushScoreHistory(
                      confirmedScore
                    );
                  }


                  resetCandidate();
                }
              }


              /*
               * ------------------------------------------------
               * ゴールとして成立しない変化
               * ------------------------------------------------
               *
               * 例
               *
               * 0-0 → 2-0
               * 0-0 → 2-2
               * 1-0 → 3-0
               *
               * OCR誤認識として無視。
               */
              else {

                log(
                  `不正なスコア変化を無視: ${scoreKey(confirmedScore)} → ${currentKey}`
                );

                resetCandidate();
              }
            }


            /*
             * ------------------------------------------------
             * 確定スコアより古い
             * ------------------------------------------------
             *
             * 例
             *
             * 確定 1-0
             * OCR 0-0
             *
             * → OCR誤認識
             */
            else {

              log(
                `古いOCRスコアを無視: ${currentKey}（確定 ${scoreKey(confirmedScore)}）`
              );

              resetCandidate();
            }
          }
        }


        /*
         * ---------------------------------------------------
         * 進捗表示
         * ---------------------------------------------------
         */

        const pct =
          Math.round(
            (t / duration) * 100
          );

        progressEl.value = pct;

        status(
          `解析中… ${fmt(t)} / ${fmt(duration)}（${pct}%）`
        );

        await sleep(0);
      }


      /*
       * -----------------------------------------------------
       * 解析完了
       * -----------------------------------------------------
       */

      renderResults();

      extractBtn.disabled =
        goals.length === 0;

      status(
        `解析完了：${goals.length}ゴールを検出`
      );

      log(
        `解析完了: ${goals.length}ゴール`
      );


      /*
       * ゴール一覧をログにも出す
       */
      goals.forEach((g, i) => {

        log(
          `GOAL ${i + 1}: ${g.from} → ${g.to} @ ${fmt(g.time)}`
        );

      });

    } catch (e) {

      console.error(e);

      status(
        `エラー: ${e.message}`
      );

      log(
        `ERROR: ${e.stack || e.message}`
      );

    } finally {

      scanBusy = false;

      scanBtn.disabled = false;
    }
  }
);


/* =========================================================
   FFmpeg読み込み
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
        'progress',
        ({ progress }) => {

          progressEl.value =
            Math.round(
              progress * 100
            );
        }
      );


      const baseURL =
        'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';


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
   ゴール動画作成
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


    try {

      status(
        '動画ファイルをFFmpegに接続中…'
      );

      log(
        `入力動画: ${sourceFile.name} / ${(sourceFile.size / 1024 / 1024).toFixed(1)}MB`
      );


      try {

        await ffmpeg.createDir(
          '/input'
        );

      } catch {}


      try {

        await ffmpeg.mount(
          'WORKERFS',
          {
            files: [sourceFile]
          },
          '/input'
        );

        log(
          'WORKERFS mount OK'
        );

      } catch (e) {

        const msg =
          e?.message ||
          String(e);

        log(
          `WORKERFS ERROR: ${msg}`
        );

        throw new Error(
          `動画ファイルをFFmpegへ渡せませんでした: ${msg}`
        );
      }


      const inputPath =
        `/input/${sourceFile.name}`;

      const clipNames = [];


      for (
        let i = 0;
        i < goals.length;
        i++
      ) {

        const g = goals[i];

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
          `GOAL ${i + 1}: ${fmt(start)} ～ ${fmt(start + len)}`
        );


        const result =
          await ffmpeg.exec([
            '-ss',
            String(start),

            '-i',
            inputPath,

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


        clipNames.push(out);


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


        const blob =
          new Blob(
            [data],
            {
              type: 'video/mp4'
            }
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
      }


      /*
       * -----------------------------------------------------
       * 複数ゴールを1本に結合
       * -----------------------------------------------------
       */

      if (
        clipNames.length > 1
      ) {

        status(
          'ゴール動画を1本に結合中…'
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


        if (
          result !== 0
        ) {

          throw new Error(
            `ゴール動画の結合に失敗しました（終了コード: ${result}）`
          );
        }


        const allData =
          await ffmpeg.readFile(
            'all_goals.mp4'
          );


        const allUrl =
          URL.createObjectURL(
            new Blob(
              [allData],
              {
                type: 'video/mp4'
              }
            )
          );


        renderCombinedDownload(
          allUrl,
          goals.length
        );

      }

      else if (
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
              {
                type: 'video/mp4'
              }
            )
          );


        renderCombinedDownload(
          allUrl,
          1
        );
      }


      /*
       * -----------------------------------------------------
       * 一時ファイル削除
       * -----------------------------------------------------
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


      try {

        await ffmpeg.unmount(
          '/input'
        );

      } catch {}


      try {

        await ffmpeg.deleteDir(
          '/input'
        );

      } catch {}


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
   個別ゴール動画表示
========================================================= */

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

  info.innerHTML = `
    <b>${name}</b><br>
    <span>
      ${fmt(start)}
      ～
      ${fmt(start + len)}
      （${fmt(len)}）
    </span>
  `;


  wrap.appendChild(
    info
  );


  const v =
    document.createElement('video');

  v.controls = true;
  v.playsInline = true;
  v.src = url;


  wrap.appendChild(
    v
  );


  const a =
    document.createElement('a');

  a.href = url;

  a.download = name;

  a.textContent =
    '⬇️ 動画を保存';


  wrap.appendChild(
    a
  );


  results.appendChild(
    wrap
  );
}


/* =========================================================
   ALL_GOALS表示
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

  info.innerHTML = `
    <b>🎬 ALL_GOALS.mp4</b><br>
    <span>
      ${count}本のゴールを1本にまとめた動画
    </span>
  `;


  wrap.appendChild(
    info
  );


  const v =
    document.createElement('video');

  v.controls = true;
  v.playsInline = true;
  v.src = url;


  wrap.appendChild(
    v
  );


  const a =
    document.createElement('a');

  a.href = url;

  a.download =
    'ALL_GOALS.mp4';

  a.textContent =
    '⬇️ ALL_GOALS.mp4 を保存';


  wrap.appendChild(
    a
  );


  results.prepend(
    wrap
  );
}
