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
  const now = new Date().toLocaleTimeString('ja-JP', {
    hour12: false
  });

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

  if (!sourceFile) return;

  if (sourceUrl) {
    URL.revokeObjectURL(sourceUrl);
  }

  sourceUrl = URL.createObjectURL(sourceFile);

  video.src = sourceUrl;
  video.load();

  status('動画を読み込み中…');

  try {

    await new Promise((resolve, reject) => {

      let finished = false;

      const timer = setTimeout(() => {
        finish(new Error('動画の読み込みがタイムアウトしました'));
      }, 15000);

      const cleanup = () => {
        clearTimeout(timer);
        video.removeEventListener('loadedmetadata', onLoaded);
        video.removeEventListener('error', onError);
      };

      const finish = (err) => {

        if (finished) return;

        finished = true;

        cleanup();

        if (err) {
          reject(err);
        } else {
          resolve();
        }
      };

      const onLoaded = () => finish();

      const onError = () => {
        finish(new Error('動画を読み込めませんでした'));
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

    $('#duration').textContent = fmt(duration);

    status(
      `動画を読み込みました（${fmt(duration)}）`
    );

    log(
      `動画: ${sourceFile.name} / ` +
      `${(sourceFile.size / 1024 / 1024).toFixed(1)}MB`
    );

  } catch (e) {

    console.error(e);

    status(`動画読み込みエラー: ${e.message}`);

    log(`VIDEO ERROR: ${e.message}`);

  }

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

    const onSeeked = () => finish();

    video.addEventListener(
      'seeked',
      onSeeked,
      { once: true }
    );

    video.currentTime = target;

  });
}


/* =========================================================
   スコア部分切り出し
========================================================= */

function drawScoreCrop() {

  const w = video.videoWidth;
  const h = video.videoHeight;

  /*
   * 箕谷SCの現在の試合動画に合わせた範囲。
   * 元動画 910x512 を基準。
   */
  const sx = Math.round(w * 145 / 910);
  const sy = 0;

  const sw = Math.round(w * 95 / 910);
  const sh = Math.round(h * 70 / 512);

  canvas.width = 380;
  canvas.height = 280;

  ctx.fillStyle = '#fff';
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

  if (!a || !b) return 999;

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

  return n ? sum / n : 0;
}


/* =========================================================
   OCR
========================================================= */

async function getOCRWorker() {

  if (ocrWorker) {
    return ocrWorker;
  }

  status('OCRエンジンを初回起動中…');

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


/* =========================================================
   スコアOCR
========================================================= */

async function recognizeScore() {

  const worker =
    await getOCRWorker();

  const ret =
    await worker.recognize(canvas);

  const raw =
    (ret.data.text || '')
      .replace(/\s/g, '');

  /*
   * OCRでありがちな文字揺れを補正。
   */
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

  /*
   * サッカーの試合として明らかに異常な
   * OCR結果を除外。
   */
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

  return `${score.home}-${score.away}`;
}


function scoreDiff(from, to) {

  if (!from || !to) {
    return null;
  }

  return {
    home: to.home - from.home,
    away: to.away - from.away
  };
}


/*
 * 「本当にゴールとして成立するスコア変化か」
 *
 * 基本ルール：
 *
 * 0-0 → 1-0  OK
 * 1-0 → 2-0  OK
 * 2-0 → 2-1  OK
 *
 * 0-0 → 2-0  NG
 * 2-0 → 2-2  NG
 * 2-0 → 3-1  NG
 * 2-0 → 1-0  NG
 */
function isValidGoalChange(from, to) {

  if (!from || !to) {
    return false;
  }

  const d = scoreDiff(from, to);

  if (!d) {
    return false;
  }

  const homePlusOne =
    d.home === 1 &&
    d.away === 0;

  const awayPlusOne =
    d.home === 0 &&
    d.away === 1;

  return homePlusOne || awayPlusOne;
}


/*
 * 対象チームのゴールか判定。
 */
function isWantedGoal(from, to, target) {

  const d = scoreDiff(from, to);

  if (!d) {
    return false;
  }

  const minotaniGoal =
    d.home === 1 &&
    d.away === 0;

  const opponentGoal =
    d.home === 0 &&
    d.away === 1;

  if (target === 'both') {
    return minotaniGoal || opponentGoal;
  }

  if (target === 'minotani') {
    return minotaniGoal;
  }

  if (target === 'opponent') {
    return opponentGoal;
  }

  return false;
}


/* =========================================================
   検出結果表示
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

    row.innerHTML =
      `<div>
        <b>⚽ GOAL ${i + 1}</b><br>
        <span>
          ${g.from}
          →
          <strong>${g.to}</strong>
        </span>
      </div>
      <div>${fmt(g.time)}</div>`;

    results.appendChild(row);

  });
}


/* =========================================================
   最終スコアとの整合性チェック
========================================================= */

function reconcileGoals(
  detectedGoals,
  initialScore,
  finalScore,
  target
) {

  if (
    !initialScore ||
    !finalScore ||
    !detectedGoals.length
  ) {
    return detectedGoals;
  }

  const totalHome =
    finalScore.home - initialScore.home;

  const totalAway =
    finalScore.away - initialScore.away;

  /*
   * 最終スコアから考えられる実際のゴール数。
   */
  let expectedCount = 0;

  if (target === 'minotani') {

    expectedCount = totalHome;

  } else if (target === 'opponent') {

    expectedCount = totalAway;

  } else {

    expectedCount =
      Math.max(0, totalHome) +
      Math.max(0, totalAway);

  }

  /*
   * マイナスになっている場合は
   * 最終スコア自体がOCR誤認識の可能性があるので
   * この段階では削らない。
   */
  if (expectedCount < 0) {
    return detectedGoals;
  }

  /*
   * 検出数と最終スコアが一致。
   */
  if (
    detectedGoals.length === expectedCount
  ) {

    log(
      `最終スコア確認OK: ` +
      `${scoreKey(initialScore)} → ` +
      `${scoreKey(finalScore)} / ` +
      `${expectedCount}ゴール`
    );

    return detectedGoals;
  }

  /*
   * 例えば
   *
   * 初期 0-0
   * 最終 2-0
   * 検出 3本
   *
   * なら余分な1本がある。
   */
  if (
    detectedGoals.length > expectedCount
  ) {

    log(
      `検出数補正: ` +
      `${detectedGoals.length}本 → ` +
      `${expectedCount}本`
    );

    /*
     * ゴール候補には信頼度を持たせている。
     * 信頼度の低いものから除外する。
     */
    const sorted =
      [...detectedGoals]
        .sort(
          (a, b) =>
            (b.confidence || 0) -
            (a.confidence || 0)
        );

    const kept =
      sorted.slice(0, expectedCount);

    /*
     * 時系列順に戻す。
     */
    kept.sort(
      (a, b) => a.time - b.time
    );

    return kept;
  }

  /*
   * 検出数が少ない場合は、
   * 勝手にゴールを増やさない。
   */
  if (
    detectedGoals.length < expectedCount
  ) {

    log(
      `注意: 最終スコア上は ` +
      `${expectedCount}ゴールだが、` +
      `${detectedGoals.length}本のみ検出`
    );

    return detectedGoals;
  }

  return detectedGoals;
}


/* =========================================================
   スコア解析
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
        Number(intervalEl.value) || 1
      );

    const target =
      targetEl.value;

    /*
     * 確定に必要な連続確認回数。
     *
     * 以前：2回
     * 今回：3回
     */
    const REQUIRED_CONFIRMATIONS = 3;

    /*
     * ゴール直後はスコア表示が変化したり
     * カメラが動いたりするため、短時間は
     * 同じ候補を繰り返し拾わない。
     */
    const GOAL_COOLDOWN = 12;

    let previousScore = null;

    let candidate = null;

    let previousImage = null;

    let initialScore = null;

    let lastConfirmedScore = null;

    let lastGoalTime = -999;

    /*
     * 解析中に取得した有効スコア。
     * 最後の安定したスコアを保存する。
     */
    let lastStableScore = null;

    try {

      status('スコア解析中…');

      log(
        `解析開始 / 間隔 ${interval}秒 / ` +
        `確認回数 ${REQUIRED_CONFIRMATIONS}回`
      );

      for (
        let t = 0;
        t < duration;
        t += interval
      ) {

        await seekTo(t);

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
            previousImage,
            img
          ) > 7.5;

        previousImage = img;

        /*
         * 初期スコアがまだ取れていない間は
         * 毎回OCRする。
         *
         * それ以降も、画像変化または候補中ならOCR。
         */
        if (
          !previousScore ||
          changed ||
          candidate
        ) {

          let score = null;

          try {

            score =
              await recognizeScore();

          } catch (e) {

            log(
              `OCR: ${e.message}`
            );

          }

          if (score) {

            const key =
              scoreKey(score);

            /*
             * -----------------------------------------
             * 初期スコア
             * -----------------------------------------
             */

            if (!previousScore) {

              previousScore = {
                ...score
              };

              initialScore = {
                ...score
              };

              lastConfirmedScore = {
                ...score
              };

              lastStableScore = {
                ...score
              };

              candidate = null;

              log(
                `初期スコア ${key} @ ${fmt(t)}`
              );

            }

            /*
             * -----------------------------------------
             * 現在の確定スコアと同じ
             * -----------------------------------------
             */

            else if (
              key ===
              scoreKey(previousScore)
            ) {

              /*
               * 候補中に元のスコアへ戻った場合、
               * その候補は誤検出と判断。
               */
              if (candidate) {

                log(
                  `候補破棄: ` +
                  `${candidate.key} → ` +
                  `${key} @ ${fmt(t)}`
                );

                candidate = null;
              }

              /*
               * 同じスコアが安定している。
               */
              lastStableScore = {
                ...score
              };

            }

            /*
             * -----------------------------------------
             * スコアが変わった
             * -----------------------------------------
             */

            else {

              /*
               * 現在スコアから+1点になっているか
               * まず確認する。
               */
              const validChange =
                isValidGoalChange(
                  previousScore,
                  score
                );

              if (!validChange) {

                /*
                 * 2-0 → 2-2
                 * 2-0 → 3-1
                 * 2-0 → 1-0
                 *
                 * のような変化は候補にしない。
                 */
                log(
                  `無効なスコア変化を無視: ` +
                  `${scoreKey(previousScore)} → ` +
                  `${key} @ ${fmt(t)}`
                );

                candidate = null;

              } else {

                /*
                 * -------------------------------------
                 * ゴール候補
                 * -------------------------------------
                 */

                if (
                  candidate &&
                  candidate.key === key
                ) {

                  candidate.count++;

                  candidate.lastSeen = t;

                } else {

                  candidate = {

                    key,

                    home: score.home,

                    away: score.away,

                    time: t,

                    firstSeen: t,

                    lastSeen: t,

                    count: 1,

                    /*
                     * 3回確認されるほど
                     * 信頼度を高くする。
                     */
                    confidence: 1

                  };

                  log(
                    `ゴール候補: ` +
                    `${scoreKey(previousScore)} → ` +
                    `${key} @ ${fmt(t)}`
                  );
                }


                /*
                 * -------------------------------------
                 * 3回連続確認
                 * -------------------------------------
                 */

                if (
                  candidate.count >=
                  REQUIRED_CONFIRMATIONS
                ) {

                  const oldScore = {
                    ...previousScore
                  };

                  const newScore = {
                    home: score.home,
                    away: score.away
                  };

                  const wanted =
                    isWantedGoal(
                      oldScore,
                      newScore,
                      target
                    );

                  /*
                   * ゴール時刻は、候補が最初に
                   * 現れた時刻を採用。
                   *
                   * OCRがスコア変更を認識するまで
                   * 数秒遅れることがあるため、
                   * 最初に変化を確認した時刻の方が
                   * ゴール位置に近い。
                   */
                  const goalTime =
                    candidate.firstSeen;

                  /*
                   * 同じゴールを二重登録しない。
                   */
                  const duplicate =
                    goals.some(
                      g =>
                        Math.abs(
                          g.time - goalTime
                        ) < GOAL_COOLDOWN
                    );

                  if (
                    wanted &&
                    !duplicate
                  ) {

                    /*
                     * 信頼度：
                     *
                     * 3回確認 → 3
                     */
                    goals.push({

                      time: goalTime,

                      from:
                        scoreKey(oldScore),

                      to:
                        scoreKey(newScore),

                      confidence:
                        candidate.count

                    });

                    lastGoalTime =
                      goalTime;

                    log(
                      `⚽ ゴール確定: ` +
                      `${scoreKey(oldScore)} → ` +
                      `${scoreKey(newScore)} ` +
                      `@ ${fmt(goalTime)} ` +
                      `(確認${candidate.count}回)`
                    );

                  } else {

                    if (!wanted) {

                      log(
                        `対象外ゴール: ` +
                        `${scoreKey(oldScore)} → ` +
                        `${scoreKey(newScore)}`
                      );

                    }

                    if (duplicate) {

                      log(
                        `重複ゴールを除外: ` +
                        `${key}`
                      );

                    }
                  }

                  /*
                   * このスコアを新しい確定スコアにする。
                   */
                  previousScore = {
                    ...newScore
                  };

                  lastConfirmedScore = {
                    ...newScore
                  };

                  lastStableScore = {
                    ...newScore
                  };

                  candidate = null;

                }

              }

            }

          }

        }

        /*
         * 進捗表示
         */
        const pct =
          Math.round(
            (t / duration) * 100
          );

        progressEl.value =
          pct;

        status(
          `解析中… ${fmt(t)} / ` +
          `${fmt(duration)}（${pct}%）`
        );

        await sleep(0);

      }


      /* =====================================================
         解析終了後の最終スコア確認
      ===================================================== */

      let finalScore = null;

      /*
       * 動画の最後付近を数回確認。
       * 最後のOCR誤読を避けるため、
       * 同じスコアが確認できたものを採用。
       */
      const finalSamples = [];

      const finalStart =
        Math.max(
          0,
          duration - 3
        );

      for (
        let i = 0;
        i < 3;
        i++
      ) {

        const t =
          Math.min(
            duration - 0.05,
            finalStart + i
          );

        try {

          await seekTo(t);

          drawScoreCrop();

          const sc =
            await recognizeScore();

          if (sc) {

            finalSamples.push(
              scoreKey(sc)
            );

          }

        } catch (e) {

          log(
            `最終スコアOCR: ${e.message}`
          );

        }

      }

      /*
       * 最も多く確認されたスコアを
       * 最終スコアとする。
       */
      if (finalSamples.length) {

        const counts = {};

        finalSamples.forEach(
          key => {
            counts[key] =
              (counts[key] || 0) + 1;
          }
        );

        const finalKey =
          Object.keys(counts)
            .sort(
              (a, b) =>
                counts[b] - counts[a]
            )[0];

        const m =
          finalKey.match(
            /^(\d+)-(\d+)$/
          );

        if (m) {

          finalScore = {

            home:
              Number(m[1]),

            away:
              Number(m[2])

          };

        }

      }


      /* =====================================================
         最終スコア整合性チェック
      ===================================================== */

      if (
        initialScore &&
        finalScore
      ) {

        log(
          `最終スコア: ` +
          `${scoreKey(initialScore)} → ` +
          `${scoreKey(finalScore)}`
        );

        goals =
          reconcileGoals(
            goals,
            initialScore,
            finalScore,
            target
          );

      }


      /*
       * 時系列順
       */
      goals.sort(
        (a, b) =>
          a.time - b.time
      );


      /*
       * 結果表示
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

      if (
        initialScore &&
        finalScore
      ) {

        log(
          `最終確認: ` +
          `${scoreKey(initialScore)} → ` +
          `${scoreKey(finalScore)}`
        );

      }

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
        `入力動画: ${sourceFile.name} / ` +
        `${(sourceFile.size / 1024 / 1024).toFixed(1)}MB`
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
          `GOAL ${i + 1}/${goals.length} ` +
          `を作成中…`
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
            `FFmpeg処理に失敗しました ` +
            `（終了コード: ${result}）`
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


      /* =====================================================
         全ゴール結合
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
            `ゴール動画の結合に失敗しました ` +
            `（終了コード: ${result}）`
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
                type: 'video/mp4'
              }
            )
          );

        renderCombinedDownload(
          allUrl,
          1
        );

      }


      /* =====================================================
         後片付け
      ===================================================== */

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
   ALL_GOALS 表示
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
    `<b>🎬 ALL_GOALS.mp4</b><br>
     <span>
       ${count}本のゴールを1本にまとめた動画
     </span>`;

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

  a.download =
    'ALL_GOALS.mp4';

  a.textContent =
    '⬇️ ALL_GOALS.mp4 を保存';

  wrap.appendChild(a);

  results.prepend(wrap);
}


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

  info.innerHTML =
    `<b>${name}</b><br>
     <span>
       ${fmt(start)}
       ～ ${fmt(start + len)}
       （${fmt(len)}）
     </span>`;

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
