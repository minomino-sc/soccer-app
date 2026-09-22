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

const finalHomeEl = $('#finalHome');
const finalAwayEl = $('#finalAway');
const effectModeEl = $('#effectMode');

let sourceFile = null;
let duration = 0;

let goals = [];

let ffmpeg = null;
let ffmpegLoaded = false;

let scanBusy = false;
let ocrWorker = null;
let sourceUrl = null;

// スコア表示のX位置
let scoreCropX = 145;

/* =========================================================
   共通
========================================================= */

function log(msg) {

  const now =
    new Date().toLocaleTimeString('ja-JP', {
      hour12: false
    });

  logEl.textContent =
    `[${now}] ${msg}\n` +
    logEl.textContent;
}


function status(msg) {
  statusEl.textContent = msg;
}


function fmt(t) {

  const s =
    Math.max(
      0,
      Math.floor(t)
    );

  return (
    `${Math.floor(s / 60)}:` +
    `${String(s % 60).padStart(2, '0')}`
  );
}


function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}


function sleep(ms) {
  return new Promise(
    resolve => setTimeout(resolve, ms)
  );
}


/* =========================================================
   動画選択
   iPhone / Safari対応
========================================================= */

fileInput.addEventListener(
  'change',
  async () => {

    sourceFile =
      fileInput.files?.[0] || null;

    goals = [];

    duration = 0;

    results.innerHTML =
      '<p class="muted">まだ解析していません。</p>';

    extractBtn.disabled = true;

    loadEngineBtn.disabled =
      !sourceFile;

    $('#duration').textContent =
      '--:--';

    if (!sourceFile) {

      status(
        '動画を選択してください'
      );

      return;
    }


    /* =====================================================
       以前の動画を完全に解除
    ===================================================== */

    try {
      video.pause();
    } catch {}


    video.removeAttribute('src');

    /*
     * Safariで古い動画の読み込みを
     * 完全に停止させる。
     */
    video.load();


    if (sourceUrl) {

      URL.revokeObjectURL(
        sourceUrl
      );

      sourceUrl = null;
    }


    sourceUrl =
      URL.createObjectURL(
        sourceFile
      );


    status(
      '動画時間を取得中…'
    );

    log(
      `動画選択: ${sourceFile.name}`
    );

    log(
      `動画サイズ: ${
        (
          sourceFile.size /
          1024 /
          1024
        ).toFixed(1)
      }MB`
    );


    try {

      /*
       * 重要
       *
       * duration取得用のイベント監視を
       * src設定より先に行う。
       */
      const loadedDuration =
        await loadVideoAndGetDuration(
          sourceUrl
        );


      duration =
        loadedDuration;


      $('#duration').textContent =
        fmt(duration);


      status(
        `動画を読み込みました（${fmt(duration)}）`
      );


      log(
        `動画時間: ${fmt(duration)}`
      );


      log(
        `動画サイズ: ${
          (
            sourceFile.size /
            1024 /
            1024
          ).toFixed(1)
        }MB`
      );


    } catch (e) {

      console.error(e);

      duration = 0;

      $('#duration').textContent =
        '--:--';


      status(
        `動画時間を取得できませんでした: ${e.message}`
      );


      log(
        `VIDEO DURATION ERROR: ${e.stack || e.message}`
      );

    }

  }
);


/* =========================================================
   動画読み込み＋動画時間取得
   iPhone / Safari対応
========================================================= */

function loadVideoAndGetDuration(
  url
) {

  return new Promise(
    (resolve, reject) => {

      let finished = false;

      let pollTimer = null;

      const timeout =
        setTimeout(
          () => {

            finish(
              new Error(
                '動画時間の取得がタイムアウトしました'
              )
            );

          },
          30000
        );


      /* ===================================================
         終了処理
      =================================================== */

      const cleanup = () => {

        clearTimeout(timeout);

        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }

        video.removeEventListener(
          'loadedmetadata',
          onLoadedMetadata
        );

        video.removeEventListener(
          'durationchange',
          onDurationChange
        );

        video.removeEventListener(
          'loadeddata',
          onLoadedData
        );

        video.removeEventListener(
          'canplay',
          onCanPlay
        );

        video.removeEventListener(
          'progress',
          onProgress
        );

        video.removeEventListener(
          'error',
          onError
        );

        video.removeEventListener(
          'abort',
          onAbort
        );

      };


      const finish = (
        err,
        value
      ) => {

        if (finished) {
          return;
        }

        finished = true;

        cleanup();


        if (err) {

          reject(err);

          return;
        }


        resolve(value);

      };


      /* ===================================================
         duration確認
      =================================================== */

      const checkDuration = (
        source
      ) => {

        const d =
          Number(
            video.duration
          );


        log(
          `duration確認 [${source}]: ${d}`
        );


        /*
         * Safariでは読み込み途中に
         * Infinity が返ることがある。
         *
         * その場合は終了せず、
         * 次のイベント・pollingを待つ。
         */

        if (
          Number.isFinite(d) &&
          d > 0
        ) {

          finish(
            null,
            d
          );

          return true;
        }


        return false;
      };


      /* ===================================================
         イベント
      =================================================== */

      const onLoadedMetadata = () => {

        log(
          'loadedmetadata 発火'
        );

        checkDuration(
          'loadedmetadata'
        );

      };


      const onDurationChange = () => {

        log(
          `durationchange 発火: ${video.duration}`
        );

        checkDuration(
          'durationchange'
        );

      };


      const onLoadedData = () => {

        log(
          'loadeddata 発火'
        );

        checkDuration(
          'loadeddata'
        );

      };


      const onCanPlay = () => {

        log(
          'canplay 発火'
        );

        checkDuration(
          'canplay'
        );

      };


      const onProgress = () => {

        checkDuration(
          'progress'
        );

      };


      const onError = () => {

        const mediaError =
          video.error;

        let message =
          '動画を読み込めませんでした';


        if (mediaError) {

          message +=
            ` (code=${mediaError.code})`;

        }


        finish(
          new Error(message)
        );

      };


      const onAbort = () => {

        /*
         * abortは必ずしも本当のエラーではない。
         * ただし今回の動画読み込み中に発生した場合は
         * ログだけ残してduration取得を継続する。
         */

        log(
          'video abort 発火'
        );

      };


      /* ===================================================
         ★重要
         イベントを先に登録する
      =================================================== */

      video.addEventListener(
        'loadedmetadata',
        onLoadedMetadata
      );

      video.addEventListener(
        'durationchange',
        onDurationChange
      );

      video.addEventListener(
        'loadeddata',
        onLoadedData
      );

      video.addEventListener(
        'canplay',
        onCanPlay
      );

      video.addEventListener(
        'progress',
        onProgress
      );

      video.addEventListener(
        'error',
        onError
      );

      video.addEventListener(
        'abort',
        onAbort
      );


      /* ===================================================
         polling
         イベントが来ないSafari対策
      =================================================== */

      pollTimer =
        setInterval(
          () => {

            if (
              checkDuration(
                'polling'
              )
            ) {

              /*
               * finish() 内でtimerは解除される。
               */

            }

          },
          500
        );


      /* ===================================================
         ★ここで初めてsrcを設定
      =================================================== */

      video.preload =
        'metadata';


      video.src =
        url;


      /*
       * Safariではsrc設定後に明示的なload()
       * が必要になるケースがある。
       */

      video.load();


      /*
       * 念のため、src/load後にすでにdurationが
       * 確定していた場合も確認する。
       */

      setTimeout(
        () => {

          checkDuration(
            'after-load'
          );

        },
        0
      );

    }
  );
}


/* =========================================================
   シーク
========================================================= */

async function seekTo(t) {

  const target =
    clamp(
      t,
      0,
      Math.max(
        0,
        duration - 0.02
      )
    );


  if (
    Math.abs(
      video.currentTime - target
    ) < 0.03
  ) {

    return;
  }


  await new Promise(
    (resolve, reject) => {

      let done = false;


      const timer =
        setTimeout(
          () => {

            finish(
              new Error(
                'seek timeout'
              )
            );

          },
          10000
        );


      const finish = (
        err
      ) => {

        if (done) {
          return;
        }

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
        {
          once: true
        }
      );


      video.currentTime =
        target;

    }
  );
}


/* =========================================================
   スコア画像
========================================================= */

function drawScoreCrop(x = scoreCropX) {

  const vw = video.videoWidth || 910;
  const vh = video.videoHeight || 512;

  const sx =
    Math.round(vw * (x / 910));

  const sy = 0;

  const sw =
    Math.round(vw * (95 / 910));

  const sh =
    Math.round(vh * (70 / 512));

  canvas.width = 380;
  canvas.height = 280;

  ctx.fillStyle = '#ffffff';

  ctx.fillRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  ctx.drawImage(
    video,
    sx,
    sy,
    sw,
    sh,
    0,
    0,
    canvas.width,
    canvas.height
  );
}

async function recognizeInitialScoreAtX(t, x) {

  await seekTo(t);

  drawScoreCrop(x);

  const score = await recognizeScore();

  return score;
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


/* =========================================================
   スコアOCR
========================================================= */

async function recognizeScore() {

  const worker =
    await getOCRWorker();


  const ret =
    await worker.recognize(
      canvas
    );


  const raw =
    (ret.data.text || '')
      .replace(/\s/g, '');


  const normalized =
    raw
      .replace(/[—–_]/g, '-')
      .replace(/[ー―]/g, '-');


  const m =
    normalized.match(
      /(\d{1,2})-(\d{1,2})/
    );


  if (!m) {
    return null;
  }


  const home =
    Number(m[1]);


  const away =
    Number(m[2]);


  if (
    !Number.isInteger(home) ||
    !Number.isInteger(away)
  ) {

    return null;
  }


  if (
    home < 0 ||
    away < 0 ||
    home > 20 ||
    away > 20
  ) {

    return null;
  }


  return {
    home,
    away,
    raw: normalized
  };
}





/* =========================================================
   スコア関連
   ★ ゴール検出・OCR誤認識対策 強化版
========================================================= */

function scoreKey(score) {

  if (!score) {
    return '';
  }

  return `${score.home}-${score.away}`;
}


function sameScore(a, b) {

  return (
    !!a &&
    !!b &&
    a.home === b.home &&
    a.away === b.away
  );
}


function scoreDistance(a, b) {

  if (!a || !b) {
    return 999;
  }

  return (
    Math.abs(a.home - b.home) +
    Math.abs(a.away - b.away)
  );
}


function isOneGoalChange(from, to) {

  if (!from || !to) {
    return false;
  }

  const dh =
    to.home - from.home;

  const da =
    to.away - from.away;

  return (
    (dh === 1 && da === 0) ||
    (dh === 0 && da === 1)
  );
}


function getGoalType(from, to) {

  if (!from || !to) {
    return null;
  }

  const dh =
    to.home - from.home;

  const da =
    to.away - from.away;

  if (dh === 1 && da === 0) {
    return 'minotani';
  }

  if (dh === 0 && da === 1) {
    return 'opponent';
  }

  return null;
}

/* =========================================================
   初期スコア
   ★最終スコアを先に確認してから初期スコアを決定
========================================================= */

async function readInitialScore(finalScore) {

  const end =
    Math.min(
      duration,
      20
    );

  const sampleTimes = [
    1,
    2,
    3,
    4,
    5,
    7,
    9,
    12,
    16
  ].filter(
    t => t < end
  );

  const xCandidates = [
    145,
    125,
    165,
    105,
    185,
    85,
    205,
    65,
    225
  ];

  const results = [];

  log(
    '初期スコア位置を横方向に探索します'
  );


  /* =======================================================
     最終スコアから見て
     絶対にあり得ない初期スコアを除外
  ======================================================= */

  const isPossibleInitialScore = (
    score
  ) => {

    if (
      !score ||
      !finalScore
    ) {
      return false;
    }


    if (
      score.home < 0 ||
      score.away < 0 ||
      score.home > 20 ||
      score.away > 20
    ) {
      return false;
    }


    /*
     * 最終スコアより大きいスコアは
     * 初期スコアとしてあり得ない。
     *
     * 例：
     * 最終 1-0
     * OCR 0-2
     *
     * → これは絶対におかしいので除外。
     */

    if (
      score.home >
      finalScore.home ||
      score.away >
      finalScore.away
    ) {

      return false;
    }


    return true;
  };


  /* =======================================================
     横方向にスコア位置を探索
  ======================================================= */

  for (
    const x of xCandidates
  ) {

    const scores = [];


    for (
      const t of sampleTimes
    ) {

      try {

        const score =
          await recognizeInitialScoreAtX(
            t,
            x
          );


        if (!score) {
          continue;
        }


        /* ===============================================
           最終スコアと矛盾するOCRは捨てる
        =============================================== */

        if (
          !isPossibleInitialScore(
            score
          )
        ) {

          log(
            `初期スコア候補を除外: ` +
            `X=${x} / ${fmt(t)} → ` +
            `${scoreKey(score)} ` +
            `(最終 ${scoreKey(finalScore)} と矛盾)`
          );

          continue;
        }


        scores.push({
          time: t,
          score
        });


        log(
          `初期スコア探索: ` +
          `X=${x} / ${fmt(t)} → ` +
          `${scoreKey(score)}`
        );


      } catch (e) {

        log(
          `初期スコア探索エラー: ` +
          `X=${x} / ${fmt(t)} → ` +
          `${e.message}`
        );

      }

    }


    if (
      !scores.length
    ) {
      continue;
    }


    /* =====================================================
       同じスコアが何回読めたか集計
    ===================================================== */

    const counts = {};


    for (
      const item of scores
    ) {

      const key =
        scoreKey(
          item.score
        );


      counts[key] =
        (
          counts[key] || 0
        ) + 1;
    }


    const candidates =
      Object.entries(
        counts
      )
        .map(
          ([key, count]) => {

            const first =
              scores.find(
                item =>
                  scoreKey(
                    item.score
                  ) === key
              );


            const m =
              key.match(
                /^(\d+)-(\d+)$/
              );


            if (!m) {
              return null;
            }


            return {

              score: {

                home:
                  Number(m[1]),

                away:
                  Number(m[2])

              },

              count,

              firstTime:
                first?.time ?? 999

            };

          }
        )
        .filter(
          Boolean
        )
        .sort(
          (a, b) => {

            /*
             * 同じスコアを
             * より多く読めたものを優先
             */

            if (
              b.count !==
              a.count
            ) {

              return (
                b.count -
                a.count
              );

            }


            /*
             * 同数なら
             * より早い時間を優先
             */

            return (
              a.firstTime -
              b.firstTime
            );

          }
        );


    if (
      !candidates.length
    ) {
      continue;
    }


    const best =
      candidates[0];


    results.push({

      x,

      score:
        best.score,

      count:
        best.count,

      total:
        scores.length,

      firstTime:
        best.firstTime

    });

  }


  /* =====================================================
     候補が1つもなかった
  ===================================================== */

  if (
    !results.length
  ) {

    log(
      '初期スコアOCR: ' +
      '最終スコアと矛盾しない候補がありません'
    );

    return null;
  }


  /* =====================================================
     最終的なスコア位置を決定
  ===================================================== */

  results.sort(
    (a, b) => {

      /*
       * 同じスコアを
       * より多く読めた位置を優先
       */

      if (
        b.count !==
        a.count
      ) {

        return (
          b.count -
          a.count
        );

      }


      /*
       * 読み取れた回数も同じなら
       * より多く読み取れた位置を優先
       */

      if (
        a.total !==
        b.total
      ) {

        return (
          b.total -
          a.total
        );

      }


      /*
       * 最初から想定していた
       * X=145に近い位置を優先
       */

      return (
        Math.abs(
          a.x - 145
        ) -
        Math.abs(
          b.x - 145
        )
      );

    }
  );


  const best =
    results[0];


  scoreCropX =
    best.x;


  log(
    `スコア位置確定: ` +
    `X=${scoreCropX} / ` +
    `${scoreKey(best.score)} ` +
    `（${best.count}/${best.total}回）`
  );


  status(
    `初期スコア: ` +
    `${scoreKey(best.score)}`
  );


  return best.score;
}

/* =========================================================
   動画全体のスコアを時系列で取得
========================================================= */

async function scanScoreTimeline(interval) {

  const samples = [];

  /*
   * ★変更
   *
   * 終了15秒前ではなく、
   * 動画終了直前まで確認する。
   *
   * 最終スコア付近のゴールを
   * 取り逃がさないため。
   */
  const startTime = 3;

  const endTime =
    Math.max(
      startTime,
      duration - 2
    );

  const total =
    Math.max(
      0.1,
      endTime - startTime
    );

  let index = 0;

  for (
    let t = startTime;
    t <= endTime;
    t += interval
  ) {

    try {

      await seekTo(t);

      drawScoreCrop();

      const score =
        await recognizeScore();

      samples.push({
        time: t,
        score
      });

      if (score) {

        log(
          `OCR ${fmt(t)} → ` +
          `${scoreKey(score)}`
        );
      }

    } catch (e) {

      samples.push({
        time: t,
        score: null
      });

      log(
        `OCR失敗 @ ${fmt(t)}`
      );
    }

    index++;

    const pct =
      20 +
      Math.round(
        (
          (t - startTime) /
          total
        ) *
        60
      );

    progressEl.value =
      clamp(
        pct,
        20,
        80
      );

    status(
      `試合中のスコアを解析中… ` +
      `${fmt(t)} / ${fmt(duration)}`
    );

    await sleep(0);
  }

  log(
    `スコア解析完了: ${index}サンプル`
  );

  return samples;
}


/* =========================================================
   次に期待されるスコア
========================================================= */

function getNextExpectedScores(
  current,
  finalScore
) {

  const candidates = [];

  if (
    current.home <
    finalScore.home
  ) {

    candidates.push({
      score: {
        home:
          current.home + 1,
        away:
          current.away
      },
      type:
        'minotani'
    });
  }

  if (
    current.away <
    finalScore.away
  ) {

    candidates.push({
      score: {
        home:
          current.home,
        away:
          current.away + 1
      },
      type:
        'opponent'
    });
  }

  return candidates;
}


/* =========================================================
   OCR誤認識を除外するための有効スコア判定
========================================================= */

function isValidScoreForFinal(
  score,
  initialScore,
  finalScore
) {

  if (
    !score ||
    !initialScore ||
    !finalScore
  ) {
    return false;
  }

  /*
   * 初期スコアより下は絶対に不可。
   */
  if (
    score.home <
    initialScore.home ||
    score.away <
    initialScore.away
  ) {
    return false;
  }

  /*
   * 最終スコアより上も絶対に不可。
   *
   * 例：
   * 実際 2-0
   * OCR 3-0
   *
   * → 無効
   */
  if (
    score.home >
    finalScore.home ||
    score.away >
    finalScore.away
  ) {
    return false;
  }

  return true;
}


/* =========================================================
   スコアの連続安定区間を作る
========================================================= */

function buildScoreRuns(
  samples,
  initialScore,
  finalScore
) {

  const runs = [];

  let currentKey = null;
  let currentItems = [];

  const flush = () => {

    if (!currentItems.length) {
      return;
    }

    runs.push({
      key:
        currentKey,

      score:
        currentItems[0].score,

      items:
        [...currentItems],

      startIndex:
        currentItems[0].index,

      endIndex:
        currentItems[
          currentItems.length - 1
        ].index,

      startTime:
        currentItems[0].time,

      endTime:
        currentItems[
          currentItems.length - 1
        ].time
    });

    currentItems = [];
    currentKey = null;
  };

  for (
    let i = 0;
    i < samples.length;
    i++
  ) {

    const item =
      samples[i];

    /*
     * 無効OCRは区間を切らない。
     *
     * 1回だけOCR失敗しても、
     * 同じスコア区間として扱う。
     */
    if (!item.score) {
      continue;
    }

    /*
     * 初期～最終の範囲外は
     * OCR誤認識として無視。
     */
    if (
      !isValidScoreForFinal(
        item.score,
        initialScore,
        finalScore
      )
    ) {
      continue;
    }

    const key =
      scoreKey(item.score);

    if (
      currentKey === null
    ) {

      currentKey =
        key;

      currentItems = [{
        ...item,
        index: i
      }];

      continue;
    }

    if (
      key === currentKey
    ) {

      currentItems.push({
        ...item,
        index: i
      });

      continue;
    }

    /*
     * 別スコアが出た。
     */
    flush();

    currentKey =
      key;

    currentItems = [{
      ...item,
      index: i
    }];
  }

  flush();

  return runs;
}

/* =========================================================
   安定スコア探索
   ★OCR取りこぼしを大幅に許容
   ★現在スコアから1点進んだスコアだけを候補にする
   ★15秒以内に2回確認できれば採用
   ★OCR失敗(null)は無視
   ★最終スコアを超えるスコアは無視
========================================================= */

function findStableScoreInSamples(
  samples,
  targetScore,
  startIndex,
  previousScore = null,
  initialScore = null,
  finalScore = null
) {

  const validStart = Math.max(
    0,
    startIndex || 0
  );

  /*
   * targetScore が本当に
   * 「現在スコアから1点進んだスコア」
   * なのか確認する。
   */
  if (
    previousScore &&
    !isOneGoalChange(
      previousScore,
      targetScore
    )
  ) {

    log(
      `⚠️ 不正なスコア遷移候補を除外: ` +
      `${scoreKey(previousScore)} → ` +
      `${scoreKey(targetScore)}`
    );

    return null;
  }

  /*
   * まず targetScore の最初の出現を探す
   */
  for (
    let i = validStart;
    i < samples.length;
    i++
  ) {

    const first = samples[i];

    if (
      !first.score ||
      !sameScore(
        first.score,
        targetScore
      )
    ) {
      continue;
    }

    /*
     * 最終スコアを超えている場合は除外
     */
    if (
      finalScore &&
      (
        first.score.home > finalScore.home ||
        first.score.away > finalScore.away
      )
    ) {
      continue;
    }

    let targetCount = 1;
    let lastTargetTime = first.time;

    /*
     * ★最大15秒まで再確認
     *
     * OCR失敗は無視する。
     *
     * 例：
     *
     * 10:21  3-0
     * 10:22  null
     * 10:23  null
     * 10:24  null
     * 10:25  3-0
     *
     * → 3-0を確認成功
     */
    for (
      let j = i + 1;
      j < samples.length;
      j++
    ) {

      const item = samples[j];

      /*
       * 15秒を超えたら終了
       */
      if (
        item.time - first.time > 15
      ) {
        break;
      }

      /*
       * OCR失敗は無視
       */
      if (!item.score) {
        continue;
      }

      /*
       * 最終スコアを超えるOCRは無視
       */
      if (
        finalScore &&
        (
          item.score.home > finalScore.home ||
          item.score.away > finalScore.away
        )
      ) {
        continue;
      }

      /*
       * targetScore が再確認された
       */
      if (
        sameScore(
          item.score,
          targetScore
        )
      ) {

        targetCount++;
        lastTargetTime = item.time;

        /*
         * ★2回確認できたら採用
         */
        if (
          targetCount >= 2
        ) {

          log(
            `✅ スコア候補確認: ` +
            `${scoreKey(targetScore)} ` +
            `(${targetCount}回) ` +
            `@ ${fmt(first.time)}`
          );

          return {
            index: i,
            time: first.time
          };
        }
      }
    }
  }

  return null;
}

/* =========================================================
   ゴール検出
   ★スコアの状態遷移を確認してゴールを確定
========================================================= */
function detectGoalsFromTimeline(initialScore, finalScore, samples) {
  const expectedGoals =
    (finalScore.home - initialScore.home) +
    (finalScore.away - initialScore.away);

  if (expectedGoals <= 0) {
    log('⚠️ ゴール数が0以下のため、ゴール検出を終了します');
    return [];
  }

  log(
    `ゴール検出開始: ${scoreKey(initialScore)} → ${scoreKey(finalScore)} / ` +
    `予想ゴール数 ${expectedGoals}`
  );

  const detectedGoals = [];

  // 必ず0-0から開始
  let currentScore = {
    home: initialScore.home,
    away: initialScore.away
  };

  let currentIndex = 0;

  while (detectedGoals.length < expectedGoals) {
    const remainingGoals =
      expectedGoals - detectedGoals.length;

    let found = null;

    /*
     * 次に起こり得るスコアは、
     * ①ホームが1点増える
     * ②アウェイが1点増える
     *
     * の2パターンだけ。
     */
    const candidates = [];

    if (currentScore.home < finalScore.home) {
      candidates.push({
        home: currentScore.home + 1,
        away: currentScore.away
      });
    }

    if (currentScore.away < finalScore.away) {
      candidates.push({
        home: currentScore.home,
        away: currentScore.away + 1
      });
    }

    if (candidates.length === 0) {
      break;
    }

    /*
     * OCR結果を時系列で確認し、
     * 「次に起こる可能性のあるスコア」が
     * 最初に安定して現れた場所を探す。
     */
    for (let i = currentIndex; i < samples.length; i++) {
      const item = samples[i];

      if (!item || !item.score) {
        continue;
      }

      const score = item.score;

      // 最終スコアを超えるOCR結果は無視
      if (
        score.home > finalScore.home ||
        score.away > finalScore.away
      ) {
        continue;
      }

      // 現在のスコアより戻っているOCR結果は無視
      if (
        score.home < currentScore.home ||
        score.away < currentScore.away
      ) {
        continue;
      }

      const candidateIndex = candidates.findIndex(
        candidate => sameScore(score, candidate)
      );

      if (candidateIndex === -1) {
        continue;
      }

      const candidate = candidates[candidateIndex];

      /*
       * 一瞬だけOCRが誤認識した可能性を排除するため、
       * 同じスコアがその後もう一度確認できるかを見る。
       *
       * 15秒以内に同じスコアが2回確認できれば、
       * スコア変化として確定。
       */
      let confirmCount = 1;
      let confirmed = false;

      for (let j = i + 1; j < samples.length; j++) {
        const next = samples[j];

        if (!next || !next.score) {
          continue;
        }

        if (next.time - item.time > 15) {
          break;
        }

        if (sameScore(next.score, candidate)) {
          confirmCount++;

          if (confirmCount >= 2) {
            confirmed = true;
            break;
          }
        }
      }

      if (!confirmed) {
        continue;
      }

      found = {
        index: i,
        time: item.time,
        score: candidate
      };

      break;
    }

    if (!found) {
      log(
        `⚠️ ゴール${detectedGoals.length + 1}件目を ` +
        `${candidates.map(scoreKey).join(' / ')} ` +
        `のいずれとしても確実に確認できませんでした`
      );

      break;
    }

    /*
     * 現在スコアから1点だけ増えていることを最終確認。
     */
    if (!isOneGoalChange(currentScore, found.score)) {
      log(
        `⚠️ 不正なスコア遷移を除外: ` +
        `${scoreKey(currentScore)} → ${scoreKey(found.score)}`
      );

      currentIndex = found.index + 1;
      continue;
    }

    detectedGoals.push({
      number: detectedGoals.length + 1,
      previousScore: {
        home: currentScore.home,
        away: currentScore.away
      },
      newScore: {
        home: found.score.home,
        away: found.score.away
      },
      roughTime: found.time
    });

    log(
      `🎯 ゴール${detectedGoals.length}: ` +
      `${scoreKey(currentScore)} → ${scoreKey(found.score)} ` +
      `@ ${fmt(found.time)}`
    );

    // 次は今回見つかったスコアより後だけを探す
    currentIndex = found.index + 1;

    currentScore = {
      home: found.score.home,
      away: found.score.away
    };
  }

  /*
   * 最終確認
   */
  if (
    currentScore.home === finalScore.home &&
    currentScore.away === finalScore.away &&
    detectedGoals.length === expectedGoals
  ) {
    log(
      `✅ スコア遷移確認完了: ` +
      `${scoreKey(initialScore)} → ${scoreKey(finalScore)}`
    );
  } else {
    log(
      `❌ ゴール検出数不足: ` +
      `${detectedGoals.length}/${expectedGoals}`
    );

    log(
      `検出終了スコア: ${scoreKey(currentScore)}`
    );
  }

  return detectedGoals;
}

/* =========================================================
   ゴール時刻精密化
   ★「スコアが安定した時刻」ではなく
     「前スコア → 新スコアへの変化点」を探す
   ★OCR取りこぼしを許容
   ★粗検出時刻より前を重点的に探索
========================================================= */

async function refineGoalTime(
  roughTime,
  previousScore,
  newScore
) {

  /*
   * -------------------------------------------------------
   * 探索範囲
   *
   * roughTime は「新スコアを安定認識できた時刻」なので、
   * 実際のゴールは通常その前にある。
   *
   * 今回のように
   *
   * 実際のゴール 2:21
   * OCR安定認識  2:52
   *
   * のようなズレを考慮し、
   * 最大45秒前まで戻って探す。
   * -------------------------------------------------------
   */

  const searchStart = Math.max(
    0,
    roughTime - 45
  );

  const searchEnd = Math.min(
    duration,
    roughTime + 1
  );

  const step = 0.5;

  /*
   * -------------------------------------------------------
   * スコアサンプル
   *
   * まず粗い間隔で全範囲を確認する。
   * -------------------------------------------------------
   */

  const samples = [];

  for (
    let t = searchStart;
    t <= searchEnd;
    t += step
  ) {

    try {

      await seekTo(t);

      drawScoreCrop();

      const score =
        await recognizeScore();

      samples.push({
        time: t,
        score
      });

    } catch (e) {

      samples.push({
        time: t,
        score: null
      });
    }
  }

  /*
   * -------------------------------------------------------
   * 前スコア → 新スコアの変化を探す
   *
   * OCRでは一時的にnullになることがあるので、
   * nullは無視する。
   * -------------------------------------------------------
   */

  let previous = null;
  let previousTime = null;

  let transitionTime = null;

  for (
    let i = 0;
    i < samples.length;
    i++
  ) {

    const item = samples[i];

    if (!item.score) {
      continue;
    }

    /*
     * 最初に previousScore を確認する
     */
    if (
      previous === null
    ) {

      if (
        sameScore(
          item.score,
          previousScore
        )
      ) {

        previous = item.score;
        previousTime = item.time;
      }

      continue;
    }

    /*
     * 新スコアを確認
     */
    if (
      sameScore(
        item.score,
        newScore
      )
    ) {

      /*
       * ここが
       *
       * previousScore
       * ↓
       * newScore
       *
       * の変化点候補
       */

      transitionTime = item.time;

      break;
    }

    /*
     * まだ前スコアなら更新
     */
    if (
      sameScore(
        item.score,
        previousScore
      )
    ) {

      previousTime = item.time;

      continue;
    }

    /*
     * その他のスコアが出た場合
     *
     * OCR誤認識の可能性があるため、
     * previousScoreを壊さない。
     */
  }

  /*
   * -------------------------------------------------------
   * 変化点が見つからなかった場合
   * -------------------------------------------------------
   */

  if (
    transitionTime === null
  ) {

    log(
      `⚠️ ゴール時刻の粗探索失敗: ` +
      `${fmt(roughTime)}`
    );

    return null;
  }

  /*
   * -------------------------------------------------------
   * 変化点の前後を0.1秒単位で再探索
   *
   * ここで実際のスコア変化位置を絞り込む。
   * -------------------------------------------------------
   */

  const refineStart = Math.max(
    searchStart,
    transitionTime - 2
  );

  const refineEnd = Math.min(
    duration,
    transitionTime + 1
  );

  const refineStep = 0.1;

  let firstNewScoreTime = null;

  for (
    let t = refineStart;
    t <= refineEnd;
    t += refineStep
  ) {

    try {

      await seekTo(t);

      drawScoreCrop();

      const score =
        await recognizeScore();

      if (!score) {
        continue;
      }

      /*
       * 新スコアを初めて確認した位置
       */
      if (
        sameScore(
          score,
          newScore
        )
      ) {

        firstNewScoreTime = t;
        break;
      }

    } catch (e) {

      continue;
    }
  }

  /*
   * -------------------------------------------------------
   * 精密時刻が見つかった
   * -------------------------------------------------------
   */

  if (
    firstNewScoreTime !== null
  ) {

    /*
     * OCRで新スコアが表示されるのは、
     * 実際のゴールより少し後になる場合がある。
     *
     * そのため、新スコア確認時刻から
     * 表示遅延を一定量引く。
     *
     * ★まず1.0秒を基準値にする。
     */

    const estimatedGoalTime =
      Math.max(
        0,
        firstNewScoreTime - 1.0
      );

    log(
      `🎯 ゴール時刻精密化: ` +
      `${fmt(roughTime)} → ` +
      `${fmt(estimatedGoalTime)}`
    );

    log(
      `   スコア変化: ` +
      `${scoreKey(previousScore)} → ` +
      `${scoreKey(newScore)}`
    );

    return estimatedGoalTime;
  }

  /*
   * 精密確認できなかった場合
   *
   * ★ここでroughTimeを返さない。
   * ★間違った時刻を採用しない。
   */

  log(
    `❌ ゴール時刻の精密確認失敗: ` +
    `${fmt(roughTime)}`
  );

  return null;
}

/* =========================================================
   対象チームでフィルター
========================================================= */

function filterGoals(
  allGoals,
  target
) {

  if (
    target === 'both'
  ) {

    return [...allGoals];

  }


  if (
    target === 'minotani'
  ) {

    return allGoals.filter(
      g =>
        g.type ===
        'minotani'
    );

  }


  if (
    target === 'opponent'
  ) {

    return allGoals.filter(
      g =>
        g.type ===
        'opponent'
    );

  }


  return [];
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


  goals.forEach(
    (g, i) => {

      const row =
        document.createElement(
          'div'
        );


      row.className =
        'goal';


      const goalLabel =
        g.type === 'opponent'
          ? '相手ゴール'
          : '箕谷ゴール';


      row.innerHTML =
        `<div>
          <b>⚽ GOAL ${i + 1}</b><br>
          <span>
            ${goalLabel}<br>
            ${g.from}
            →
            <strong>${g.to}</strong>
          </span>
        </div>
        <div>${fmt(g.time)}</div>`;


      results.appendChild(
        row
      );

    }
  );
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


    results.innerHTML =
      '<p class="muted">解析中…</p>';


    const target =
      targetEl.value;


    const interval =
      Math.max(
        1,
        Number(
          intervalEl.value
        ) || 1
      );


    try {

      progressEl.value = 0;


      status(
        'スコア解析を開始します…'
      );


      log(
        '===================================='
      );


      log(
        '⚽ ゴール解析開始'
      );


      log(
        `対象: ${
          target === 'both'
            ? '両チーム'
            : target === 'minotani'
              ? '箕谷のゴールだけ'
              : '相手のゴールだけ'
        }`
      );


      log(
        `解析間隔: ${interval}秒`
      );

/* ===================================================
   ① HTML入力の最終スコア
   ★先に最終スコアを取得する
=================================================== */

const finalHome =
  Number(
    finalHomeEl.value
  );

const finalAway =
  Number(
    finalAwayEl.value
  );


if (
  !Number.isInteger(
    finalHome
  ) ||
  !Number.isInteger(
    finalAway
  ) ||
  finalHome < 0 ||
  finalAway < 0 ||
  finalHome > 20 ||
  finalAway > 20
) {

  throw new Error(
    '最終スコアを正しく入力してください'
  );

}


const finalScore = {

  home:
    finalHome,

  away:
    finalAway

};


log(
  `入力された最終スコア: ` +
  `${scoreKey(finalScore)}`
);


progressEl.value = 10;


/* ===================================================
   ② 初期スコア
   ★最終スコアを基準にしてOCRする
=================================================== */

const initialScore =
  await readInitialScore(
    finalScore
  );


if (
  !initialScore
) {

  throw new Error(
    '試合開始時のスコアを読み取れませんでした'
  );

}


log(
  `初期スコア: ` +
  `${scoreKey(initialScore)}`
);


progressEl.value = 15;      

      /* ===================================================
         ③ スコアの整合性確認
      =================================================== */

      if (
        finalScore.home <
        initialScore.home ||
        finalScore.away <
        initialScore.away
      ) {

        throw new Error(
          `最終スコア ${scoreKey(finalScore)} が ` +
          `初期スコア ${scoreKey(initialScore)} より低くなっています`
        );

      }


      const expectedGoalCount =
        (
          finalScore.home -
          initialScore.home
        ) +
        (
          finalScore.away -
          initialScore.away
        );


      log(
        `検出予定ゴール数: ${expectedGoalCount}`
      );


      /* ===================================================
         ④ ゴールなし
      =================================================== */

      if (
        expectedGoalCount === 0
      ) {

        status(
          '解析完了：ゴールはありません'
        );


        progressEl.value = 100;


        renderResults();


        return;
      }


      /* ===================================================
         ⑤ 動画全体のスコアを時系列解析
      =================================================== */

      status(
        '試合中のスコアを解析中…'
      );


      const timeline =
        await scanScoreTimeline(
          interval
        );


      if (
        !timeline.length
      ) {

        throw new Error(
          'スコア解析データを取得できませんでした'
        );

      }


      /* ===================================================
         ⑥ 複数ゴール検出
      =================================================== */

      status(
        '複数ゴールを判定中…'
      );


      const detected =
        detectGoalsFromTimeline(
          initialScore,
          finalScore,
          timeline
        );


      if (
        detected.length === 0
      ) {

        throw new Error(
          'ゴールを検出できませんでした'
        );

      }





/* ===================================================
   ⑦ 各ゴールの時刻を精密化
=================================================== */

const refinedGoals = [];

for (
  let i = 0;
  i < detected.length;
  i++
) {

  const g =
    detected[i];

  status(
    `ゴール ${i + 1}/${detected.length} ` +
    `を精密確認中…`
  );

  const refinedTime =
    await refineGoalTime(
      g.roughTime,
      g.fromScore,
      g.toScore
    );

  /*
   * 精密確認できなかったゴールは
   * 無理に採用しない。
   */
  if (
    refinedTime === null
  ) {

    log(
      `❌ GOAL ${i + 1} ` +
      `の時刻確認に失敗しました`
    );

    continue;
  }

  refinedGoals.push({

    time:
      refinedTime,

    from:
      g.from,

    to:
      g.to,

    type:
      g.type,

    home:
      g.toScore.home,

    away:
      g.toScore.away

  });

  progressEl.value =
    85 +
    Math.round(
      (
        (i + 1) /
        detected.length
      ) *
      10
    );
}


/* ===================================================
   ★ ゴール数の最終チェック
=================================================== */

if (
  refinedGoals.length !==
  detected.length
) {

  throw new Error(
    `ゴール時刻を正確に確認できませんでした ` +
    `（${refinedGoals.length}/${detected.length}）`
  );
}


if (
  refinedGoals.length !==
  expectedGoalCount
) {

  throw new Error(
    `検出されたゴール数が最終スコアと一致しません ` +
    `（${refinedGoals.length}/${expectedGoalCount}）`
  );
}


      
 


      /* ===================================================
         ⑧ チームフィルター
      =================================================== */

      goals =
        filterGoals(
          refinedGoals,
          target
        );


      goals.sort(
        (a, b) =>
          a.time - b.time
      );


      /* ===================================================
         ⑨ 結果ログ
      =================================================== */

      log(
        '===================================='
      );


      log(
        `全ゴール検出数: ${refinedGoals.length}`
      );


      refinedGoals.forEach(
        (g, i) => {

          log(
            `⚽ GOAL ${i + 1}: ` +
            `${g.from} → ${g.to} / ` +
            `${
              g.type === 'minotani'
                ? '箕谷'
                : '相手'
            } / ` +
            `${fmt(g.time)}`
          );

        }
      );


      log(
        `対象設定後: ${goals.length}本`
      );


      log(
        '===================================='
      );


      /* ===================================================
         ⑩ 表示
      =================================================== */

      renderResults();


      extractBtn.disabled =
        goals.length === 0;


      progressEl.value = 100;


      status(
        `解析完了：${goals.length}ゴールを検出`
      );


    } catch (e) {

      console.error(e);


      status(
        `エラー: ${e.message}`
      );


      log(
        `ERROR: ${e.stack || e.message}`
      );


      goals = [];


      renderResults();

    } finally {

      scanBusy = false;

      scanBtn.disabled = false;

    }

  }
);


/* =========================================================
   FFmpeg準備
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

      ffmpeg =
        new FFmpeg();


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
   ゴール動画作成
   演出あり / なし対応
========================================================= */

extractBtn.addEventListener(
  'click',
  async () => {

    if (!sourceFile || !goals.length) {
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

    const effectMode =
      effectModeEl?.value || 'on';

    const useEffect =
      effectMode === 'on';

    try {

      status(
        '動画ファイルをFFmpegに接続中…'
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
        useEffect
          ? '🎬 演出加工：あり'
          : '🎬 演出加工：なし'
      );

      try {
        await ffmpeg.createDir('/input');
      } catch {}

      await ffmpeg.mount(
        'WORKERFS',
        {
          files: [sourceFile]
        },
        '/input'
      );

      log('WORKERFS mount OK');

      const inputPath =
        `/input/${sourceFile.name}`;

      const clipNames = [];

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

        const end =
          Math.min(
            duration,
            g.time + after
          );

        const len =
          Math.max(
            0.5,
            end - start
          );

        const finalOut =
          `goal_${String(
            i + 1
          ).padStart(
            2,
            '0'
          )}.mp4`;

        status(
          `GOAL ${i + 1}/${goals.length} を作成中…`
        );

        log(
          `GOAL ${i + 1}: ` +
          `${fmt(start)} ～ ${fmt(end)}`
        );

        /* =====================================================
           演出なし
        ===================================================== */

        if (!useEffect) {

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
              finalOut
            ]);

          if (result !== 0) {
            throw new Error(
              `GOAL ${i + 1} の通常切り出しに失敗しました`
            );
          }

          const data =
            await ffmpeg.readFile(
              finalOut
            );

          if (
            !data ||
            !data.length
          ) {
            throw new Error(
              `${finalOut} が作成されませんでした`
            );
          }

          const url =
            URL.createObjectURL(
              new Blob(
                [data],
                {
                  type:
                    'video/mp4'
                }
              )
            );

          renderDownload(
            finalOut,
            url,
            g,
            start,
            len
          );

          clipNames.push(
            finalOut
          );

          log(
            `　✅ GOAL ${i + 1} 通常版作成完了`
          );

          continue;
        }

        /* =====================================================
           演出あり
           
           通常
              ↓
           ゴール4秒前～2秒前
              ↓
           1.08倍ズーム
              ↓
           ゴール2秒前～ゴール
              ↓
           0.5倍スロー
              ↓
           ゴール～2秒後
              ↓
           0.5倍スロー
              ↓
           通常
        ===================================================== */

        const zoomStart =
          Math.max(
            start,
            g.time - 4
          );

        const slowStart =
          Math.max(
            zoomStart,
            g.time - 2
          );

        const slowEnd =
          Math.min(
            end,
            g.time + 2
          );

        const preDuration =
          Math.max(
            0,
            zoomStart - start
          );

        const zoomDuration =
          Math.max(
            0,
            slowStart - zoomStart
          );

        const slowDuration =
          Math.max(
            0,
            slowEnd - slowStart
          );

        const postDuration =
          Math.max(
            0,
            end - slowEnd
          );

        const preOut =
          `pre_${String(
            i + 1
          ).padStart(
            2,
            '0'
          )}.mp4`;

        const zoomOut =
          `zoom_${String(
            i + 1
          ).padStart(
            2,
            '0'
          )}.mp4`;

        const slowOut =
          `slow_${String(
            i + 1
          ).padStart(
            2,
            '0'
          )}.mp4`;

        const postOut =
          `post_${String(
            i + 1
          ).padStart(
            2,
            '0'
          )}.mp4`;

        /* =====================================================
           ① 通常部分
        ===================================================== */

        if (preDuration > 0.1) {

          const result =
            await ffmpeg.exec([
              '-ss',
              String(start),

              '-i',
              inputPath,

              '-t',
              String(preDuration),

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
              preOut
            ]);

          if (result !== 0) {
            throw new Error(
              '通常部分の作成に失敗しました'
            );
          }

          log(
            `　通常: ` +
            `${fmt(start)} ～ ${fmt(zoomStart)}`
          );
        }

        /* =====================================================
           ② ズーム
        ===================================================== */

        if (zoomDuration > 0.1) {

          log(
            `　⚡ ズーム: ` +
            `${fmt(zoomStart)} ～ ${fmt(slowStart)}`
          );

          const result =
            await ffmpeg.exec([
              '-ss',
              String(zoomStart),

              '-i',
              inputPath,

              '-t',
              String(zoomDuration),

              '-map',
              '0:v:0',

              '-map',
              '0:a:0?',

              '-vf',
              'scale=iw*1.08:ih*1.08:flags=lanczos,crop=iw/1.08:ih/1.08',

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
              zoomOut
            ]);

          if (result !== 0) {
            throw new Error(
              'ズーム処理に失敗しました'
            );
          }

          log(
            '　✅ ズーム動画作成成功'
          );
        }

        /* =====================================================
           ③ ゴール前後のスロー
        ===================================================== */

        if (slowDuration > 0.1) {

          log(
            `　🐢 スロー: ` +
            `${fmt(slowStart)} ～ ${fmt(slowEnd)}`
          );

          const result =
            await ffmpeg.exec([
              '-ss',
              String(slowStart),

              '-i',
              inputPath,

              '-t',
              String(slowDuration),

              '-map',
              '0:v:0',

              '-map',
              '0:a:0?',

              '-vf',
              'setpts=2*PTS',

              '-af',
              'atempo=0.5',

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
              slowOut
            ]);

          if (result !== 0) {
            throw new Error(
              'スロー処理に失敗しました'
            );
          }

          log(
            '　✅ スロー動画作成成功'
          );
        }

        /* =====================================================
           ④ ゴール後通常
        ===================================================== */

        if (postDuration > 0.1) {

          const result =
            await ffmpeg.exec([
              '-ss',
              String(slowEnd),

              '-i',
              inputPath,

              '-t',
              String(postDuration),

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
              postOut
            ]);

          if (result !== 0) {
            throw new Error(
              'ゴール後の通常部分の作成に失敗しました'
            );
          }

          log(
            `　通常: ` +
            `${fmt(slowEnd)} ～ ${fmt(end)}`
          );
        }

        /* =====================================================
           ⑤ 結合
        ===================================================== */

        const concatParts = [];

        if (preDuration > 0.1) {
          concatParts.push(
            `file '${preOut}'`
          );
        }

        if (zoomDuration > 0.1) {
          concatParts.push(
            `file '${zoomOut}'`
          );
        }

        if (slowDuration > 0.1) {
          concatParts.push(
            `file '${slowOut}'`
          );
        }

        if (postDuration > 0.1) {
          concatParts.push(
            `file '${postOut}'`
          );
        }

        const concatFile =
          `concat_${String(
            i + 1
          ).padStart(
            2,
            '0'
          )}.txt`;

        await ffmpeg.writeFile(
          concatFile,
          concatParts.join('\n') + '\n'
        );

        const concatResult =
          await ffmpeg.exec([
            '-f',
            'concat',

            '-safe',
            '0',

            '-i',
            concatFile,

            '-c',
            'copy',

            '-y',
            finalOut
          ]);

        if (concatResult !== 0) {
          throw new Error(
            '演出動画の結合に失敗しました'
          );
        }

        /* =====================================================
           ⑥ 完成動画
        ===================================================== */

        const data =
          await ffmpeg.readFile(
            finalOut
          );

        if (
          !data ||
          !data.length
        ) {
          throw new Error(
            `${finalOut} が作成されませんでした`
          );
        }

        const url =
          URL.createObjectURL(
            new Blob(
              [data],
              {
                type:
                  'video/mp4'
              }
            )
          );

        renderDownload(
          finalOut,
          url,
          g,
          start,
          len
        );

        clipNames.push(
          finalOut
        );

        log(
          `　✅ GOAL ${i + 1} ` +
          `ズーム＋スロー反映完了`
        );
      }

      /* =====================================================
         複数ゴールを1本に結合
      ===================================================== */

      if (clipNames.length > 1) {

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
          'concat_all.txt',
          concatText
        );

        const result =
          await ffmpeg.exec([
            '-f',
            'concat',

            '-safe',
            '0',

            '-i',
            'concat_all.txt',

            '-c',
            'copy',

            '-y',
            'all_goals.mp4'
          ]);

        if (result !== 0) {
          throw new Error(
            'ゴール動画の結合に失敗しました'
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
                type:
                  'video/mp4'
              }
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
              {
                type:
                  'video/mp4'
              }
            )
          );

        renderCombinedDownload(
          allUrl,
          1
        );
      }

      /* =====================================================
         一時ファイル削除
      ===================================================== */

      const tempNames = [
        ...clipNames,
        'concat_all.txt',
        'all_goals.mp4'
      ];

      for (
        let i = 0;
        i < goals.length;
        i++
      ) {
        tempNames.push(
          `pre_${String(i + 1).padStart(2, '0')}.mp4`,
          `zoom_${String(i + 1).padStart(2, '0')}.mp4`,
          `slow_${String(i + 1).padStart(2, '0')}.mp4`,
          `post_${String(i + 1).padStart(2, '0')}.mp4`,
          `concat_${String(i + 1).padStart(2, '0')}.txt`
        );
      }

      for (
        const name of tempNames
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
   ALL_GOALS
========================================================= */

function renderCombinedDownload(
  url,
  count
) {

  const wrap =
    document.createElement(
      'div'
    );


  wrap.className =
    'download combined';


  const info =
    document.createElement(
      'div'
    );


  info.innerHTML =
    `<b>🎬 ALL_GOALS.mp4</b><br>
     <span>
       ${count}本のゴールを1本にまとめた動画
     </span>`;


  wrap.appendChild(
    info
  );


  const v =
    document.createElement(
      'video'
    );


  v.controls = true;

  v.playsInline = true;

  v.src = url;


  wrap.appendChild(
    v
  );


  const a =
    document.createElement(
      'a'
    );


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


/* =========================================================
   個別ゴール
========================================================= */

function renderDownload(
  name,
  url,
  g,
  start,
  len
) {

  const wrap =
    document.createElement(
      'div'
    );


  wrap.className =
    'download';


  const info =
    document.createElement(
      'div'
    );


  const goalLabel =
    g.type === 'opponent'
      ? '相手ゴール'
      : '箕谷ゴール';


  info.innerHTML =
    `<b>${name}</b><br>
     <span>
       ${goalLabel} /
       ${fmt(start)}
       ～ ${fmt(start + len)}
       （${fmt(len)}）
     </span>`;


  wrap.appendChild(
    info
  );


  const v =
    document.createElement(
      'video'
    );


  v.controls = true;

  v.playsInline = true;

  v.src = url;


  wrap.appendChild(
    v
  );


  const a =
    document.createElement(
      'a'
    );


  a.href = url;

  a.download =
    name;

  a.textContent =
    '⬇️ 動画を保存';


  wrap.appendChild(
    a
  );


  results.appendChild(
    wrap
  );
}
