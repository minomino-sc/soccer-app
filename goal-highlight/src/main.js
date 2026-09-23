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

/* =========================================================
   スコア表示画像の差分検出
   ★OCRが読めなくてもスコア変更そのものを検出する
========================================================= */

function getScoreImageData() {

  return ctx.getImageData(
    0,
    0,
    canvas.width,
    canvas.height
  );
}


function calculateScoreImageDifference(
  a,
  b
) {

  if (
    !a ||
    !b ||
    a.data.length !== b.data.length
  ) {

    return 999;
  }


  let total = 0;

  let count = 0;


  /*
   * 白背景部分の影響を減らすため、
   * スコア表示の中央部分を重点的に比較。
   */

  const width =
    canvas.width;

  const height =
    canvas.height;


  const xStart =
    Math.floor(
      width * 0.05
    );

  const xEnd =
    Math.floor(
      width * 0.95
    );

  const yStart =
    Math.floor(
      height * 0.05
    );

  const yEnd =
    Math.floor(
      height * 0.95
    );


  for (
    let y = yStart;
    y < yEnd;
    y += 2
  ) {

    for (
      let x = xStart;
      x < xEnd;
      x += 2
    ) {

      const index =
        (
          y * width +
          x
        ) * 4;


      const dr =
        Math.abs(
          a.data[index] -
          b.data[index]
        );

      const dg =
        Math.abs(
          a.data[index + 1] -
          b.data[index + 1]
        );

      const db =
        Math.abs(
          a.data[index + 2] -
          b.data[index + 2]
        );


      total +=
        (
          dr +
          dg +
          db
        ) / 3;


      count++;

    }

  }


  if (!count) {
    return 0;
  }


  return (
    total /
    count
  );
}

/* =========================================================
   スコア変更時刻検出
   ★変更前画像・変更後画像の「遷移」を検出する方式
========================================================= */

/*
 * Canvasの画像を軽量なグレースケール配列に変換
 */
function getScoreGrayImage() {

  const image =
    ctx.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    );

  const width =
    canvas.width;

  const height =
    canvas.height;

  const gray =
    new Uint8Array(
      width * height
    );

  for (
    let i = 0;
    i < gray.length;
    i++
  ) {

    const p =
      i * 4;

    gray[i] =
      Math.round(
        (
          image.data[p] * 0.299 +
          image.data[p + 1] * 0.587 +
          image.data[p + 2] * 0.114
        )
      );
  }

  return {
    width,
    height,
    data: gray
  };
}


/*
 * 2枚の画像の差分を調べる。
 *
 * 単純な全体差分ではなく、
 * 「変更前」と「変更後」で実際に変化した場所だけを
 * 比較対象として使用する。
 */
function buildTransitionMask(
  beforeImage,
  afterImage
) {

  const width =
    beforeImage.width;

  const height =
    beforeImage.height;

  const mask =
    new Uint8Array(
      width * height
    );

  let changed = 0;

  /*
   * スコア表示の中央部分を使用。
   *
   * 上下端・左右端のノイズを避ける。
   */
  const xStart =
    Math.floor(
      width * 0.08
    );

  const xEnd =
    Math.floor(
      width * 0.92
    );

  const yStart =
    Math.floor(
      height * 0.08
    );

  const yEnd =
    Math.floor(
      height * 0.92
    );


  for (
    let y = yStart;
    y < yEnd;
    y += 1
  ) {

    for (
      let x = xStart;
      x < xEnd;
      x += 1
    ) {

      const i =
        y * width + x;

      const diff =
        Math.abs(
          beforeImage.data[i] -
          afterImage.data[i]
        );

      /*
       * 数字の変化は比較的大きく、
       * 圧縮ノイズは小さい。
       */
      if (
        diff >= 30
      ) {

        mask[i] = 1;

        changed++;

      }

    }

  }


  return {
    mask,
    changed
  };
}


/*
 * 変更マスクを使って、
 * 現在画像が「変更前」にどれだけ近いか、
 * 「変更後」にどれだけ近いかを計算する。
 */
function compareTransitionState(
  currentImage,
  beforeImage,
  afterImage,
  transitionMask
) {

  const width =
    currentImage.width;

  const height =
    currentImage.height;

  let beforeError = 0;
  let afterError = 0;
  let count = 0;


  for (
    let y = 0;
    y < height;
    y += 2
  ) {

    for (
      let x = 0;
      x < width;
      x += 2
    ) {

      const i =
        y * width + x;


      if (
        !transitionMask[i]
      ) {

        continue;

      }


      const current =
        currentImage.data[i];

      const before =
        beforeImage.data[i];

      const after =
        afterImage.data[i];


      beforeError +=
        Math.abs(
          current -
          before
        );

      afterError +=
        Math.abs(
          current -
          after
        );

      count++;

    }

  }


  if (!count) {

    return {
      beforeError: 999999,
      afterError: 999999,
      state: 0,
      confidence: 0
    };

  }


  beforeError /=
    count;

  afterError /=
    count;


  /*
   * state
   *
   * -1 = 変更前に近い
   *  0 = 中間
   * +1 = 変更後に近い
   */
  const denominator =
    beforeError +
    afterError +
    0.0001;


  const state =
    (
      beforeError -
      afterError
    ) /
    denominator;


  /*
   * 0～1に近いほど、
   * 変更後画像に近い。
   */
  const confidence =
    Math.abs(state);


  return {
    beforeError,
    afterError,
    state,
    confidence
  };
}


/*
 * 指定時刻のスコア画像を取得
 */
async function captureScoreImage(
  time
) {

  await seekTo(time);

  drawScoreCrop();

  return getScoreGrayImage();
}


/* =========================================================
   スコア変更時刻を検出
   ★今回の重要部分
========================================================= */

async function detectScoreTransitionByImage(
  start,
  end,
  previousScore,
  newScore
) {

  if (
    !previousScore ||
    !newScore
  ) {

    return null;
  }


  if (
    end <= start
  ) {

    return null;
  }


  log(
    `🖼️ スコア変更境界を精密探索: ` +
    `${fmt(start)} ～ ${fmt(end)} / ` +
    `${scoreKey(previousScore)} → ` +
    `${scoreKey(newScore)}`
  );


  /*
   * =======================================================
   * STEP 1
   *
   * 変更前の代表画像を取得
   *
   * startそのものではなく、
   * start付近の少し後ろを使う。
   *
   * これにより境界付近の不安定フレームを避ける。
   * =======================================================
   */

  const beforeTime =
    Math.min(
      end - 0.5,
      start + 0.5
    );


  /*
   * =======================================================
   * STEP 2
   *
   * 変更後の代表画像を取得
   *
   * end付近では確実に新スコアが
   * 表示されている可能性が高い。
   * =======================================================
   */

  const afterTime =
    Math.max(
      start + 0.5,
      end - 0.5
    );


  if (
    afterTime <= beforeTime
  ) {

    return null;
  }


  let beforeImage;
  let afterImage;


  try {

    beforeImage =
      await captureScoreImage(
        beforeTime
      );


    afterImage =
      await captureScoreImage(
        afterTime
      );

  } catch (e) {

    log(
      `⚠️ スコア画像取得失敗: ${e.message}`
    );

    return null;
  }


  /*
   * =======================================================
   * STEP 3
   *
   * 変更前画像と変更後画像から
   * 「本当に変わった場所」だけを抽出
   * =======================================================
   */

  const transition =
    buildTransitionMask(
      beforeImage,
      afterImage
    );


  log(
    `🖼️ スコア表示変更画素: ` +
    `${transition.changed}`
  );


  /*
   * あまりにも変化が少ない場合は、
   * 画像比較そのものを信用しない。
   */
  if (
    transition.changed < 20
  ) {

    log(
      '⚠️ スコア表示の画像差分が小さすぎます'
    );

    return null;
  }


  /*
   * =======================================================
   * STEP 4
   *
   * 0.1秒刻みで全区間を走査
   *
   * ここでは「画像が変わった時刻」ではなく、
   *
   *   変更前画像
   *        ↓
   *   変更後画像
   *
   * のどこにいるかを判定する。
   *
   * これが今回の2:06問題への対策。
   * =======================================================
   */

  const step =
    0.1;


  const states = [];


  for (
    let t = start;
    t <= end + 0.001;
    t += step
  ) {

    try {

      const currentImage =
        await captureScoreImage(
          t
        );


      const state =
        compareTransitionState(
          currentImage,
          beforeImage,
          afterImage,
          transition.mask
        );


      states.push({

        time:
          t,

        state:
          state.state,

        confidence:
          state.confidence,

        beforeError:
          state.beforeError,

        afterError:
          state.afterError

      });


    } catch {

      states.push({

        time:
          t,

        state:
          0,

        confidence:
          0,

        beforeError:
          999999,

        afterError:
          999999

      });

    }


    await sleep(0);

  }


  if (
    !states.length
  ) {

    return null;
  }


  /*
   * =======================================================
   * STEP 5
   *
   * 「変更前 → 変更後」の境界を探す
   *
   * state:
   *
   *   マイナス
   *      ↓
   *   0付近
   *      ↓
   *   プラス
   *
   * となる場所が実際の変更点。
   * =======================================================
   */

  let bestTransition =
    null;


  for (
    let i = 1;
    i < states.length;
    i++
  ) {

    const prev =
      states[i - 1];

    const current =
      states[i];


    /*
     * 変更前側
     */
    if (
      prev.state > -0.35
    ) {

      continue;
    }


    /*
     * 変更後側
     */
    if (
      current.state < 0.35
    ) {

      continue;
    }


    /*
     * この2点の間で
     * 状態が切り替わった。
     */
    const score =
      (
        current.state -
        prev.state
      );


    if (
      !bestTransition ||
      score >
      bestTransition.score
    ) {

      bestTransition = {

        index:
          i,

        score,

        before:
          prev,

        after:
          current

      };

    }

  }


  /*
   * =======================================================
   * STEP 6
   *
   * 直接境界が取れなかった場合、
   * stateが0を跨ぐ地点を探す。
   * =======================================================
   */

  if (
    !bestTransition
  ) {

    for (
      let i = 1;
      i < states.length;
      i++
    ) {

      const prev =
        states[i - 1];

      const current =
        states[i];


      if (
        prev.state <= 0 &&
        current.state > 0
      ) {

        const score =
          current.state -
          prev.state;


        if (
          !bestTransition ||
          score >
          bestTransition.score
        ) {

          bestTransition = {

            index:
              i,

            score,

            before:
              prev,

            after:
              current

          };

        }

      }

    }

  }


  /*
   * =======================================================
   * STEP 7
   *
   * それでも取れない場合、
   * 「変更後画像への近さ」が初めて
   * 一定値を超えた地点を使う。
   *
   * ただし最大差分をそのまま採用しない。
   * =======================================================
   */

  if (
    !bestTransition
  ) {

    for (
      let i = 0;
      i < states.length;
      i++
    ) {

      const item =
        states[i];


      if (
        item.state >= 0.25
      ) {

        /*
         * 直後にも変更後状態が続くことを確認
         */
        let confirmed =
          0;


        for (
          let j = i;
          j <
            Math.min(
              states.length,
              i + 8
            );
          j++
        ) {

          if (
            states[j].state >= 0.25
          ) {

            confirmed++;

          }

        }


        if (
          confirmed >= 3
        ) {

          bestTransition = {

            index:
              i,

            score:
              item.state,

            before:
              states[
                Math.max(
                  0,
                  i - 1
                )
              ],

            after:
              item

          };

          break;

        }

      }

    }

  }


  if (
    !bestTransition
  ) {

    log(
      '⚠️ スコア変更境界を特定できませんでした'
    );

    return null;
  }


  /*
   * =======================================================
   * STEP 8
   *
   * 0.1秒区間の中央を仮の変更時刻にする。
   *
   * 例えば
   *
   * 2:20.9 → 変更前
   * 2:21.0 → 変更後
   *
   * なら
   *
   * 2:20.95
   *
   * を候補にする。
   * =======================================================
   */

  const t1 =
    bestTransition.before.time;

  const t2 =
    bestTransition.after.time;


  let transitionTime =
    (
      t1 +
      t2
    ) / 2;


  /*
   * =======================================================
   * STEP 9
   *
   * 最後に0.02秒単位で境界付近だけ確認。
   *
   * ここではOCRではなく画像状態を確認する。
   * =======================================================
   */

  const fineStart =
    Math.max(
      start,
      transitionTime - 0.15
    );

  const fineEnd =
    Math.min(
      end,
      transitionTime + 0.15
    );


  const fineStep =
    0.02;


  let fineBest =
    null;


  for (
    let t = fineStart;
    t <= fineEnd + 0.0001;
    t += fineStep
  ) {

    try {

      const currentImage =
        await captureScoreImage(
          t
        );


      const state =
        compareTransitionState(
          currentImage,
          beforeImage,
          afterImage,
          transition.mask
        );


      /*
       * stateが0に近いところ、
       * つまり変更前後の境界を採用。
       */
      const boundaryScore =
        Math.abs(
          state.state
        );


      if (
        !fineBest ||
        boundaryScore <
        fineBest.score
      ) {

        fineBest = {

          time:
            t,

          score:
            boundaryScore,

          state:
            state.state

        };

      }

    } catch {}

  }


  if (
    fineBest
  ) {

    transitionTime =
      fineBest.time;

  }


  log(
    `🖼️ スコア変更境界: ` +
    `${fmt(transitionTime)} ` +
    `(${scoreKey(previousScore)} → ` +
    `${scoreKey(newScore)})`
  );


  /*
   * =======================================================
   * STEP 10
   *
   * 最後の安全確認。
   *
   * 変更時刻の少し前と少し後をOCRして、
   * 本当に
   *
   * previousScore → newScore
   *
   * になっているか確認する。
   *
   * OCRが読めない場合でも、
   * 画像解析結果は保持する。
   * =======================================================
   */

  try {

    const verifyBefore =
      Math.max(
        start,
        transitionTime - 0.3
      );


    const verifyAfter =
      Math.min(
        end,
        transitionTime + 0.3
      );


    await seekTo(
      verifyBefore
    );

    drawScoreCrop();

    const beforeOCR =
      await recognizeScore();


    await seekTo(
      verifyAfter
    );

    drawScoreCrop();

    const afterOCR =
      await recognizeScore();


    log(
      `🔎 境界確認OCR: ` +
      `${fmt(verifyBefore)}=` +
      `${scoreKey(beforeOCR) || '読取失敗'} / ` +
      `${fmt(verifyAfter)}=` +
      `${scoreKey(afterOCR) || '読取失敗'}`
    );


    if (
      beforeOCR &&
      afterOCR
    ) {

      if (
        sameScore(
          beforeOCR,
          previousScore
        ) &&
        sameScore(
          afterOCR,
          newScore
        )
      ) {

        log(
          '✅ OCRでもスコア変化を確認'
        );

      }

    }

  } catch {}

  return transitionTime;
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
   ★OCR誤認識・一時的な読み取り失敗に強い方式
========================================================= */

function findStableScoreInSamples(
  samples,
  targetScore,
  startIndex,
  initialScore = null,
  finalScore = null
) {

  if (
    !targetScore ||
    !Array.isArray(samples) ||
    !samples.length
  ) {
    return null;
  }


  const validStart =
    Math.max(
      0,
      startIndex || 0
    );


  /*
   * =======================================================
   * ① まず「次の得点スコア」が出現した最初の位置を探す
   *
   * 1回だけのOCRでは採用しない。
   * ただし、連続していなくても一定時間内に
   * 複数回確認できれば有効とする。
   * =======================================================
   */

  const matches = [];


  for (
    let i = validStart;
    i < samples.length;
    i++
  ) {

    const item =
      samples[i];


    if (
      !item.score
    ) {
      continue;
    }


    if (
      !sameScore(
        item.score,
        targetScore
      )
    ) {
      continue;
    }


    /*
     * 最終スコアを超えるものは無視
     */
    if (
      finalScore &&
      !isValidScoreForFinal(
        item.score,
        initialScore,
        finalScore
      )
    ) {
      continue;
    }


    matches.push({
      index:
        i,

      time:
        item.time
    });

  }


  if (
    !matches.length
  ) {

    return null;

  }


  /*
   * =======================================================
   * ② 近い時間帯に複数回出現しているか確認
   *
   * OCRが途中で1～数回失敗しても、
   * 同じスコアが一定時間続いていれば採用する。
   *
   * 現在の解析間隔が1秒なら、
   * 最大6秒程度の範囲を見る。
   * =======================================================
   */

  const maxWindow =
    Math.max(
      5,
      (
        samples[1]?.time -
        samples[0]?.time
      || 1
      ) * 5
    );


  for (
    let i = 0;
    i < matches.length;
    i++
  ) {

    const first =
      matches[i];


    let count = 1;


    for (
      let j = i + 1;
      j < matches.length;
      j++
    ) {

      const diff =
        matches[j].time -
        first.time;


      if (
        diff >
        maxWindow
      ) {
        break;
      }


      count++;


      /*
       * 5秒程度の範囲で
       * 2回確認できれば採用。
       *
       * 途中にOCR失敗や別の誤認識が
       * 入っていても問題ない。
       */

      if (
        count >= 2
      ) {

        return {
          index:
            first.index,

          time:
            first.time
        };

      }

    }

  }


  /*
   * =======================================================
   * ③ 2回確認できなかった場合
   *
   * 同じスコアがある程度の時間表示されているケースでは、
   * 1回だけのOCRでも、前後のスコア状況から採用する。
   *
   * ただし最初から動画終了付近まで飛びすぎる場合は
   * 採用しない。
   * =======================================================
   */

  for (
    let i = 0;
    i < matches.length;
    i++
  ) {

    const current =
      matches[i];


    /*
     * 次のゴール候補なので、
     * 直前のスコア変化から極端に離れている
     * OCR誤認識は避ける。
     */

    const next =
      matches[i + 1];


    if (
      next &&
      next.time -
      current.time
      <=
      maxWindow
    ) {

      return {
        index:
          current.index,

        time:
          current.time
      };

    }

  }


  return null;
}

/* =========================================================
   ゴール検出
   ★スコア変化区間を記録して精密化へ渡す
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


  /* =======================================================
     最終スコアより上のOCRを除外
  ======================================================= */

  const cleanedSamples =
    samples.map(
      item => {

        if (
          !item.score
        ) {
          return item;
        }

        if (
          !isValidScoreForFinal(
            item.score,
            initialScore,
            finalScore
          )
        ) {

          log(
            `OCR誤認識候補を除外: ` +
            `${fmt(item.time)} → ` +
            `${scoreKey(item.score)}`
          );

          return {
            ...item,
            score: null
          };
        }

        return item;
      }
    );


  /* =======================================================
     スコア区間を作成
  ======================================================= */

  const runs =
    buildScoreRuns(
      cleanedSamples,
      initialScore,
      finalScore
    );


  log(
    `有効スコア区間: ${runs.length}区間`
  );


  runs.forEach(
    run => {

      log(
        `  ${run.key}: ` +
        `${fmt(run.startTime)} ～ ` +
        `${fmt(run.endTime)}`
      );

    }
  );


  let currentScore = {

    home:
      initialScore.home,

    away:
      initialScore.away

  };


  let cursorIndex = 0;

  const detected = [];


  /* =======================================================
     ゴールを1点ずつ追跡
  ======================================================= */

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


    if (
      !candidates.length
    ) {
      break;
    }


    let best = null;


    for (
      const candidate of candidates
    ) {

      /*
       * -----------------------------------------------------
       * まず対象スコアのrunを探す
       *
       * これが今回の重要部分。
       * 「新スコアを最初にOCRできた時刻」だけではなく、
       * その前のスコアが最後に確認された時刻も取得する。
       * -----------------------------------------------------
       */

      const targetKey =
        scoreKey(
          candidate.score
        );


      const targetRun =
        runs.find(
          run =>

            run.key === targetKey &&

            run.startIndex >=
              cursorIndex
        );


      if (
        !targetRun
      ) {

        /*
         * runが見つからない場合は、
         * 従来の安定スコア探索を使用。
         */

        const found =
          findStableScoreInSamples(
            cleanedSamples,
            candidate.score,
            cursorIndex,
            initialScore,
            finalScore
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
              candidate.type,

            refineStart:
              Math.max(
                0,
                found.time - 10
              ),

            refineEnd:
              Math.min(
                duration,
                found.time + 1
              )

          };

        }

        continue;
      }


      /*
       * -----------------------------------------------------
       * 対象スコアの直前にあるスコアrunを探す
       * -----------------------------------------------------
       */

      let previousRun = null;


      for (
        let r = runs.length - 1;
        r >= 0;
        r--
      ) {

        const run =
          runs[r];


        if (
          run.endIndex <
          targetRun.startIndex &&
          run.endIndex >=
          cursorIndex
        ) {

          previousRun =
            run;

          break;
        }

      }


      /*
       * -----------------------------------------------------
       * 前スコアが見つからない場合
       * 初期スコアを基準にする。
       * -----------------------------------------------------
       */

      let refineStart;


      if (
        previousRun &&
        previousRun.key ===
          scoreKey(currentScore)
      ) {

        refineStart =
          previousRun.endTime;

      } else {

        refineStart =
          Math.max(
            0,
            targetRun.startTime - 10
          );

      }


      /*
       * 新スコアが最初に確認されたところまで。
       *
       * 実際のゴールはこの間のどこか。
       */

      const refineEnd =
        targetRun.startTime;


      const candidateFound = {

        index:
          targetRun.startIndex,

        time:
          targetRun.startTime,

        score:
          candidate.score,

        type:
          candidate.type,

        refineStart,

        refineEnd

      };


      /*
       * 複数候補がある場合は
       * 時系列で最も早いものを採用。
       */

      if (
        !best ||
        candidateFound.index <
        best.index
      ) {

        best =
          candidateFound;

      }

    }


    if (
      !best
    ) {

      log(
        `⚠️ ゴール${goalNo + 1}件目を ` +
        `検出できませんでした`
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
     * 必ず1ゴール分であることを確認
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

      /*
       * 現段階では仮時刻。
       * 後段のrefineGoalTime()で
       * refineStart～refineEndを再OCRする。
       */
      roughTime:
        best.time,

      from:
        scoreKey(fromScore),

      to:
        scoreKey(toScore),

      type:
        best.type,

      fromScore,

      toScore,

      refineStart:
        best.refineStart,

      refineEnd:
        best.refineEnd

    });


    log(
      `🎯 ゴール${goalNo + 1}: ` +
      `${scoreKey(fromScore)} → ` +
      `${scoreKey(toScore)} ` +
      `/ 仮時刻 ${fmt(best.time)}`
    );


    log(
      `   🔍 精密探索範囲: ` +
      `${fmt(best.refineStart)} ～ ` +
      `${fmt(best.refineEnd)}`
    );


    currentScore =
      toScore;


    cursorIndex =
      best.index + 1;

  }


  /* =======================================================
     ゴール数チェック
  ======================================================= */

  if (
    detected.length !==
    expectedGoalCount
  ) {

    log(
      `❌ ゴール検出数不足: ` +
      `${detected.length}/${expectedGoalCount}`
    );


    log(
      `検出終了スコア: ` +
      `${scoreKey(currentScore)}`
    );


    log(
      `入力最終スコア: ` +
      `${scoreKey(finalScore)}`
    );


    return [];
  }


  if (
    !sameScore(
      currentScore,
      finalScore
    )
  ) {

    log(
      `❌ 最終スコア不一致`
    );

    return [];
  }


  log(
    `✅ 最終スコアまで正常に検出: ` +
    `${scoreKey(currentScore)}`
  );


  return detected;
}

/* =========================================================
   ゴール時刻精密化
   ★OCR + スコア画像差分の二段構え
========================================================= */
async function refineGoalTime(
  roughTime,
  previousScore,
  newScore,
  searchStart,
  searchEnd
) {
  log(
    `🔍 ゴール時刻精密化開始: ${formatTime(searchStart)} ～ ${formatTime(searchEnd)} / ` +
    `${previousScore.home}-${previousScore.away} → ${newScore.home}-${newScore.away}`
  );

  const start = Math.max(0, Number(searchStart) || 0);
  const end = Math.min(
    video.duration,
    Number(searchEnd) || roughTime || video.duration
  );

  if (end <= start) {
    return roughTime;
  }

  /*
   * 重要：
   * OCRの「最初の1回」ではなく、
   * 新しいスコアが連続して安定して読める場所を探す。
   *
   * その安定地点が見つかったら、
   * そこから最大20秒前まで逆方向に0.25秒刻みで探索する。
   *
   * これにより、
   * 4:53 だけ一瞬「3-0」と読めるような誤認識を
   * ゴールとして採用しない。
   */

  const targetKey = `${newScore.home}-${newScore.away}`;
  const previousKey = `${previousScore.home}-${previousScore.away}`;

  const samples = [];

  // --------------------------------------------------
  // ① 精密探索範囲を0.25秒刻みでOCR
  // --------------------------------------------------
  for (let t = start; t <= end + 0.001; t += 0.25) {
    if (scanBusy === false) break;

    await seekTo(t);

    drawScoreCrop();

    const score = await recognizeScore();

    samples.push({
      time: t,
      score
    });

    // ログを出しすぎない
    if (samples.length % 20 === 0) {
      log(`   🔎 OCR精密探索: ${formatTime(t)}`);
    }
  }

  if (!samples.length) {
    return roughTime;
  }

  // --------------------------------------------------
  // ② 新しいスコアが「安定している場所」を探す
  // --------------------------------------------------

  let stableIndex = -1;

  /*
   * 0.25秒 × 3回 = 約0.5秒以上
   *
   * 新しいスコアが連続して3回読めることを条件にする。
   */
  for (let i = 0; i < samples.length - 2; i++) {
    const a = samples[i].score;
    const b = samples[i + 1].score;
    const c = samples[i + 2].score;

    if (
      a &&
      b &&
      c &&
      `${a.home}-${a.away}` === targetKey &&
      `${b.home}-${b.away}` === targetKey &&
      `${c.home}-${c.away}` === targetKey
    ) {
      stableIndex = i;
      break;
    }
  }

  // --------------------------------------------------
  // ③ 安定スコアが見つからなければ、
  //    単発の新スコアは採用しない
  // --------------------------------------------------

  if (stableIndex === -1) {
    log(
      `⚠️ 安定した ${targetKey} を確認できませんでした。` +
      ` 仮時刻 ${formatTime(roughTime)} を使用`
    );

    return roughTime;
  }

  const stableTime = samples[stableIndex].time;

  log(
    `✅ 安定スコア確認: ${targetKey} @ ${formatTime(stableTime)}`
  );

  // --------------------------------------------------
  // ④ 安定した新スコアの直前を逆方向に探索
  //
  //    「前のスコア → 新しいスコア」に変化した
  //    最初の地点を探す。
  // --------------------------------------------------

  /*
   * 最大20秒前まで探す。
   *
   * ただし searchStart より前には出ない。
   */
  const reverseStart = Math.max(
    start,
    stableTime - 20
  );

  const reverseSamples = [];

  for (
    let t = stableTime;
    t >= reverseStart - 0.001;
    t -= 0.25
  ) {
    await seekTo(t);

    drawScoreCrop();

    const score = await recognizeScore();

    reverseSamples.push({
      time: t,
      score
    });
  }

  /*
   * reverseSamples は
   *
   * 新しいスコア
   * ↓
   * 古いスコア
   *
   * の順番になっている。
   *
   * ここから
   *
   * 新スコア → 旧スコア
   *
   * に変わる境界を探す。
   */

  for (let i = 0; i < reverseSamples.length - 1; i++) {
    const current = reverseSamples[i];
    const previous = reverseSamples[i + 1];

    const currentKey = current.score
      ? `${current.score.home}-${current.score.away}`
      : null;

    const previousKeyAtTime = previous.score
      ? `${previous.score.home}-${previous.score.away}`
      : null;

    if (
      currentKey === targetKey &&
      previousKeyAtTime === previousKey
    ) {
      /*
       * current.time
       *   = 新スコアが読める最初の側
       *
       * previous.time
       *   = その直前の旧スコア
       *
       * この2点の中央をゴール時刻とする。
       */
      const goalTime =
        (current.time + previous.time) / 2;

      log(
        `🎯 ゴール時刻確定: ${formatTime(goalTime)} ` +
        `(OCR境界 ${formatTime(previous.time)} → ${formatTime(current.time)})`
      );

      return goalTime;
    }
  }

  // --------------------------------------------------
  // ⑤ 境界が直接見つからない場合
  // --------------------------------------------------

  log(
    `⚠️ OCR境界を直接確認できませんでした。` +
    ` 安定スコア時刻 ${formatTime(stableTime)} を使用`
  );

  return stableTime;
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
    g.toScore,
    g.refineStart,
    g.refineEnd
  );

let finalTime =
  refinedTime;

/*
 * 精密確認できなかった場合でも、
 * ゴール検出そのものには成功しているため、
 * roughTimeを採用して処理を継続する。
 */
if (
  refinedTime === null
) {

  log(
    `⚠️ GOAL ${i + 1} ` +
    `の精密確認に失敗 → ` +
    `${fmt(g.roughTime)} を採用`
  );

  finalTime =
    g.roughTime;

} else {

  log(
    `🎯 GOAL ${i + 1} ` +
    `時刻確定: ` +
    `${fmt(refinedTime)}`
  );

}

refinedGoals.push({

  time:
    finalTime,

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
