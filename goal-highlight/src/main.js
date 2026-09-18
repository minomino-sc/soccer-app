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
========================================================= */

function scoreKey(score) {

  if (!score) {
    return '';
  }


  return (
    `${score.home}-${score.away}`
  );
}


function sameScore(a, b) {

  return (
    !!a &&
    !!b &&
    a.home === b.home &&
    a.away === b.away
  );
}


function isOneGoalChange(
  from,
  to
) {

  if (!from || !to) {
    return false;
  }


  const dh =
    to.home - from.home;


  const da =
    to.away - from.away;


  return (
    (
      dh === 1 &&
      da === 0
    ) ||
    (
      dh === 0 &&
      da === 1
    )
  );
}


function getGoalType(
  from,
  to
) {

  if (!from || !to) {
    return null;
  }


  const dh =
    to.home - from.home;


  const da =
    to.away - from.away;


  if (
    dh === 1 &&
    da === 0
  ) {

    return 'minotani';

  }


  if (
    dh === 0 &&
    da === 1
  ) {

    return 'opponent';

  }


  return null;
}


/* =========================================================
   初期スコア
========================================================= */

async function readInitialScore() {

  const end =
    Math.min(
      duration,
      20
    );

  /*
   * 開始直後の数秒を使って、
   * スコアの横位置を探索する。
   *
   * 縦位置・大きさは従来のまま。
   */
  const sampleTimes = [
    1,
    4,
    8,
    12,
    16
  ].filter(
    t => t < end
  );

  /*
   * 従来のX=145を中心に、
   * 左右方向だけ探索する。
   */
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

  for (const x of xCandidates) {

    let successCount = 0;
    const scores = [];

    for (const t of sampleTimes) {

      try {

        const score =
          await recognizeInitialScoreAtX(
            t,
            x
          );

        if (score) {

          successCount++;

          scores.push({
            time: t,
            score
          });

          log(
            `初期スコア探索: ` +
            `X=${x} / ${fmt(t)} → ` +
            `${scoreKey(score)}`
          );

        }

      } catch (e) {

        log(
          `初期スコア探索エラー: ` +
          `X=${x} / ${fmt(t)} → ` +
          `${e.message}`
        );

      }
    }

    /*
     * このX位置で何回同じスコアを
     * 認識できたか確認
     */
    if (scores.length) {

      const counts = {};

      scores.forEach(
        item => {

          const key =
            scoreKey(item.score);

          counts[key] =
            (counts[key] || 0) + 1;

        }
      );

      const best =
        Object.entries(counts)
          .sort(
            (a, b) =>
              b[1] - a[1]
          )[0];

      if (best) {

        const m =
          best[0].match(
            /^(\d+)-(\d+)$/
          );

        if (m) {

          results.push({

            x,

            score: {
              home: Number(m[1]),
              away: Number(m[2])
            },

            count: best[1],

            total: scores.length

          });
        }
      }
    }
  }

  /*
   * どのX位置でも読めなかった
   */
  if (!results.length) {

    log(
      '初期スコアOCR: ' +
      'どの横位置でも認識できませんでした'
    );

    return null;
  }

  /*
   * 最も安定して認識できた位置を採用。
   *
   * 同じ回数なら従来の145pxに近い方。
   */
  results.sort(
    (a, b) => {

      if (b.count !== a.count) {
        return b.count - a.count;
      }

      return (
        Math.abs(a.x - 145) -
        Math.abs(b.x - 145)
      );

    }
  );

  const best =
    results[0];

  /*
   * この動画のスコア位置として記憶
   */
  scoreCropX = best.x;

  log(
    `スコア位置確定: ` +
    `X=${scoreCropX} / ` +
    `${scoreKey(best.score)} ` +
    `（${best.count}/${best.total}回）`
  );

  status(
    `初期スコア: ${scoreKey(best.score)}`
  );

  return best.score;
}

/* =========================================================
   動画全体のスコアを時系列で取得
========================================================= */

async function scanScoreTimeline(
  interval
) {

  const samples = [];


  const startTime = 3;


  const endTime =
    Math.max(
      startTime,
      duration - 15
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


    /*
     * iPhone/SafariでUIが固まらないように
     * 少しだけ制御を返す。
     */

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
      type: 'minotani'
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
      type: 'opponent'
    });

  }


  return candidates;
}


/* =========================================================
   タイムラインからゴールを検出
========================================================= */

function detectGoalsFromTimeline(
  initialScore,
  finalScore,
  samples
) {

  const expectedGoalCount =
    (
      finalScore.home -
      initialScore.home
    ) +
    (
      finalScore.away -
      initialScore.away
    );


  if (
    expectedGoalCount <= 0
  ) {

    return [];

  }


  log(
    `必要ゴール数: ${expectedGoalCount}`
  );


  let currentScore = {
    home:
      initialScore.home,

    away:
      initialScore.away
  };


  let cursorIndex = 0;


  const detected = [];


  /*
   * ゴールごとに、
   *
   * 現在 0-0
   * ↓
   * 次は 1-0 または 0-1
   *
   * のように探す。
   */

  for (
    let goalNo = 0;
    goalNo < expectedGoalCount;
    goalNo++
  ) {

    const candidates =
      getNextExpectedScores(
        currentScore,
        finalScore
      );


    if (!candidates.length) {
      break;
    }


    let best = null;


    /*
     * 現在位置以降から
     * 各候補スコアが安定して現れる場所を探す。
     */

    for (
      const candidate of candidates
    ) {

      const found =
        findStableScoreInSamples(
          samples,
          candidate.score,
          cursorIndex
        );


      if (!found) {
        continue;
      }


      if (
        !best ||
        found.index <
        best.index
      ) {

        best = {

          index:
            found.index,

          time:
            found.time,

          score:
            candidate.score,

          type:
            candidate.type

        };

      }

    }


    if (!best) {

      log(
        `⚠️ ゴール${goalNo + 1}件目を検出できませんでした`
      );

      break;
    }


    const fromScore = {

      home:
        currentScore.home,

      away:
        currentScore.away

    };


    const toScore = {

      home:
        best.score.home,

      away:
        best.score.away

    };


    /*
     * 念のため1ゴール分の変化か確認。
     */

    if (
      !isOneGoalChange(
        fromScore,
        toScore
      )
    ) {

      log(
        `⚠️ 不正なスコア変化を無視: ` +
        `${scoreKey(fromScore)} → ` +
        `${scoreKey(toScore)}`
      );


      cursorIndex =
        best.index + 1;


      continue;
    }


    detected.push({

      roughTime:
        best.time,

      from:
        scoreKey(fromScore),

      to:
        scoreKey(toScore),

      type:
        best.type,

      fromScore,
      toScore

    });


    log(
      `🎯 ゴール${goalNo + 1}: ` +
      `${scoreKey(fromScore)} → ` +
      `${scoreKey(toScore)} ` +
      `@ ${fmt(best.time)}`
    );


    currentScore =
      toScore;


    cursorIndex =
      best.index + 1;

  }


  /*
   * 最終スコアまで到達できたか確認。
   */

  if (
    !sameScore(
      currentScore,
      finalScore
    )
  ) {

    log(
      `⚠️ 最終スコアまで検出できませんでした`
    );


    log(
      `検出終了スコア: ` +
      `${scoreKey(currentScore)}`
    );


    log(
      `入力された最終スコア: ` +
      `${scoreKey(finalScore)}`
    );

  } else {

    log(
      `✅ 最終スコアまで正常に検出: ` +
      `${scoreKey(currentScore)}`
    );

  }


  return detected;
}


/* =========================================================
   スコアが安定して現れる位置を探す
========================================================= */

function findStableScoreInSamples(
  samples,
  targetScore,
  startIndex
) {

  /*
   * 1秒間隔なら、
   *
   * 1-0
   * 1-0
   *
   * の2連続でかなり強い。
   *
   * 2秒間隔の場合も、
   * 2回連続なら約4秒間維持されたことになる。
   */

  const REQUIRED =
    2;


  let consecutive = 0;


  for (
    let i = startIndex;
    i < samples.length;
    i++
  ) {

    const item =
      samples[i];


    if (
      item.score &&
      sameScore(
        item.score,
        targetScore
      )
    ) {

      consecutive++;


      if (
        consecutive >=
        REQUIRED
      ) {

        /*
         * 2回目ではなく、
         * 最初に対象スコアが出た時刻を返す。
         */

        const firstIndex =
          i -
          REQUIRED +
          1;


        return {

          index:
            firstIndex,

          time:
            samples[firstIndex].time

        };

      }

    } else {

      consecutive = 0;

    }

  }


  /*
   * 連続2回が取れない場合。
   *
   * ゴール直後に次のゴールがある、
   * 動画が短い、
   * OCRが1回失敗した、
   * などを考慮して、
   * 3サンプル中2回でも採用。
   */

  for (
    let i = startIndex;
    i < samples.length;
    i++
  ) {

    let count = 0;

    let firstIndex = -1;


    for (
      let j = i;
      j < Math.min(
        samples.length,
        i + 3
      );
      j++
    ) {

      if (
        samples[j].score &&
        sameScore(
          samples[j].score,
          targetScore
        )
      ) {

        count++;


        if (
          firstIndex === -1
        ) {

          firstIndex = j;

        }

      }

    }


    if (
      count >= 2 &&
      firstIndex !== -1
    ) {

      return {

        index:
          firstIndex,

        time:
          samples[firstIndex].time

      };

    }

  }


  return null;
}


/* =========================================================
   ゴール時刻を0.25秒単位で精密化
========================================================= */

async function refineGoalTime(
  roughTime,
  previousScore,
  newScore
) {

  if (
    roughTime === null ||
    !previousScore ||
    !newScore
  ) {

    return roughTime;

  }


  /*
   * OCRで新スコアが表示された位置より
   * 最大4秒前まで戻って調べる。
   */

  const start =
    Math.max(
      0,
      roughTime - 4
    );


  const end =
    Math.min(
      duration - 0.05,
      roughTime + 0.5
    );


  const step =
    0.25;


  let firstDetected = null;


  for (
    let t = start;
    t <= end + 0.001;
    t += step
  ) {

    try {

      await seekTo(t);

      drawScoreCrop();


      const score =
        await recognizeScore();


      if (
        score &&
        sameScore(
          score,
          newScore
        )
      ) {

        /*
         * 新スコアが初めて出た時刻。
         */

        firstDetected = t;

        break;

      }

    } catch {}

  }


  if (
    firstDetected === null
  ) {

    log(
      `精密化失敗: ${fmt(roughTime)} を使用`
    );


    return roughTime;

  }


  log(
    `🎯 ゴール時刻精密化: ` +
    `${fmt(roughTime)} → ` +
    `${fmt(firstDetected)}`
  );


  /*
   * スコア表示はゴール直後なので、
   * 実際のゴール時刻は表示より少し前。
   *
   * ただしここで勝手に何秒も戻すと
   * 誤差が大きくなるため、
   * 「スコア変化位置」をゴール時刻として扱う。
   */

  return firstDetected;
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
         ① 初期スコア
      =================================================== */

      const initialScore =
        await readInitialScore();


      if (!initialScore) {

        throw new Error(
          '試合開始時のスコアを読み取れませんでした'
        );

      }


      log(
        `初期スコア: ` +
        `${scoreKey(initialScore)}`
      );


      progressEl.value = 10;


      /* ===================================================
         ② HTML入力の最終スコア
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
   スロー単独テスト版
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

        const g = goals[i];

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

        const zoomStart =
          Math.max(
            start,
            g.time - 2
          );

        const zoomEnd =
          Math.min(
            end,
            g.time
          );

        const slowStart =
          zoomStart;

        const slowDuration =
          Math.max(
            0.5,
            zoomEnd - slowStart
          );

        const preOut =
          `pre_${String(i + 1).padStart(2, '0')}.mp4`;

        const slowOut =
          `slow_${String(i + 1).padStart(2, '0')}.mp4`;

        const postOut =
          `post_${String(i + 1).padStart(2, '0')}.mp4`;

        const finalOut =
          `goal_${String(i + 1).padStart(2, '0')}.mp4`;

        status(
          `GOAL ${i + 1}/${goals.length} を作成中…`
        );

        log(
          `GOAL ${i + 1}: ` +
          `${fmt(start)} ～ ${fmt(end)}`
        );

        /*
         * ---------------------------------------------
         * ① ゴール直前まで
         * ---------------------------------------------
         */

        const preDuration =
          Math.max(
            0.1,
            slowStart - start
          );

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
              `通常部分の作成に失敗しました`
            );
          }

          log(
            `　通常: ${fmt(start)} ～ ${fmt(slowStart)}`
          );
        }

        /*
         * ---------------------------------------------
         * ② ゴール直前2秒を0.5倍速
         * ---------------------------------------------
         */

        log(
          `　🐢 スロー: ${fmt(slowStart)} ～ ${fmt(zoomEnd)}`
        );

        const slowResult =
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

        if (slowResult !== 0) {
          throw new Error(
            `スロー処理に失敗しました`
          );
        }

        log(
          '　✅ スロー動画作成成功'
        );

        /*
         * ---------------------------------------------
         * ③ ゴール後
         * ---------------------------------------------
         */

        const postDuration =
          Math.max(
            0,
            end - zoomEnd
          );

        if (postDuration > 0.1) {

          const postResult =
            await ffmpeg.exec([
              '-ss',
              String(zoomEnd),

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

          if (postResult !== 0) {
            throw new Error(
              `ゴール後の動画作成に失敗しました`
            );
          }

          log(
            `　通常: ${fmt(zoomEnd)} ～ ${fmt(end)}`
          );
        }

        /*
         * ---------------------------------------------
         * ④ 結合
         * ---------------------------------------------
         */

        const concatParts = [];

        if (preDuration > 0.1) {
          concatParts.push(
            `file '${preOut}'`
          );
        }

        concatParts.push(
          `file '${slowOut}'`
        );

        if (postDuration > 0.1) {
          concatParts.push(
            `file '${postOut}'`
          );
        }

        const concatText =
          concatParts.join('\n') +
          '\n';

        const concatFile =
          `concat_${String(i + 1).padStart(2, '0')}.txt`;

        await ffmpeg.writeFile(
          concatFile,
          concatText
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
            `動画の結合に失敗しました`
          );
        }

        /*
         * ---------------------------------------------
         * ⑤ 完成動画を表示
         * ---------------------------------------------
         */

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
          finalOut,
          url,
          g,
          start,
          end - start
        );

        clipNames.push(finalOut);

        log(
          `　✅ GOAL ${i + 1} スロー反映完了`
        );
      }

      /*
       * ---------------------------------------------
       * 複数ゴールを結合
       * ---------------------------------------------
       */

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
                type: 'video/mp4'
              }
            )
          );

        renderCombinedDownload(
          allUrl,
          goals.length
        );

      } else if (clipNames.length === 1) {

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
       * ---------------------------------------------
       * 一時ファイル削除
       * ---------------------------------------------
       */

      for (
        const name of [
          ...clipNames,
          ...goals.map(
            (_, i) =>
              `pre_${String(i + 1).padStart(2, '0')}.mp4`
          ),
          ...goals.map(
            (_, i) =>
              `slow_${String(i + 1).padStart(2, '0')}.mp4`
          ),
          ...goals.map(
            (_, i) =>
              `post_${String(i + 1).padStart(2, '0')}.mp4`
          ),
          ...goals.map(
            (_, i) =>
              `concat_${String(i + 1).padStart(2, '0')}.txt`
          ),
          'concat_all.txt',
          'all_goals.mp4'
        ]
      ) {
        try {
          await ffmpeg.deleteFile(name);
        } catch {}
      }

      try {
        await ffmpeg.unmount('/input');
      } catch {}

      try {
        await ffmpeg.deleteDir('/input');
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
