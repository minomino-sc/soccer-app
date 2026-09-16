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

/*
 * 画面に表示するゴール。
 *
 * ここには最終的に整合性チェックを通過した
 * ゴールだけが入る。
 */
let goals = [];

/*
 * 解析中に検出した全ゴール候補。
 *
 * 「箕谷だけ」「両チーム」などの設定とは無関係に
 * すべて記録する。
 */
let allDetectedGoals = [];

let ffmpeg = null;
let ffmpegLoaded = false;

let scanBusy = false;
let ocrWorker = null;
let sourceUrl = null;


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
========================================================= */

fileInput.addEventListener(
  'change',
  async () => {

    sourceFile =
      fileInput.files?.[0] || null;

    goals = [];
    allDetectedGoals = [];

    results.innerHTML =
      '<p class="muted">まだ解析していません。</p>';

    extractBtn.disabled = true;
    loadEngineBtn.disabled =
      !sourceFile;

    if (!sourceFile) {
      return;
    }

    if (sourceUrl) {
      URL.revokeObjectURL(sourceUrl);
    }

    sourceUrl =
      URL.createObjectURL(
        sourceFile
      );

    video.src = sourceUrl;
    video.load();

    status(
      '動画を読み込み中…'
    );

    try {

      await new Promise(
        (resolve, reject) => {

          let finished = false;

          const timer =
            setTimeout(
              () => {
                finish(
                  new Error(
                    '動画の読み込みがタイムアウトしました'
                  )
                );
              },
              15000
            );

          const cleanup = () => {

            clearTimeout(timer);

            video.removeEventListener(
              'loadedmetadata',
              onLoaded
            );

            video.removeEventListener(
              'error',
              onError
            );

          };

          const finish = (err) => {

            if (finished) {
              return;
            }

            finished = true;

            cleanup();

            if (err) {
              reject(err);
            } else {
              resolve();
            }

          };

          const onLoaded = () => {
            finish();
          };

          const onError = () => {

            finish(
              new Error(
                '動画を読み込めませんでした'
              )
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

        }
      );

      duration =
        video.duration;

      $('#duration').textContent =
        fmt(duration);

      status(
        `動画を読み込みました（${fmt(duration)}）`
      );

      log(
        `動画: ${sourceFile.name} / ` +
        `${(
          sourceFile.size /
          1024 /
          1024
        ).toFixed(1)}MB`
      );

    } catch (e) {

      console.error(e);

      status(
        `動画読み込みエラー: ${e.message}`
      );

      log(
        `VIDEO ERROR: ${e.message}`
      );

    }

  }
);


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

      const finish = (err) => {

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
        { once: true }
      );

      video.currentTime =
        target;

    }
  );
}


/* =========================================================
   スコア部分切り出し
========================================================= */

function drawScoreCrop() {

  const w =
    video.videoWidth;

  const h =
    video.videoHeight;

  /*
   * 元動画 910x512 を基準。
   */
  const sx =
    Math.round(
      w * 145 / 910
    );

  const sy = 0;

  const sw =
    Math.round(
      w * 95 / 910
    );

  const sh =
    Math.round(
      h * 70 / 512
    );

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

      sum +=
        Math.abs(
          ga - gb
        );

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


function scoreDiff(from, to) {

  if (!from || !to) {
    return null;
  }

  return {

    home:
      to.home - from.home,

    away:
      to.away - from.away

  };
}


/*
 * +1点のゴールだけを有効とする。
 */
function isValidGoalChange(
  from,
  to
) {

  if (!from || !to) {
    return false;
  }

  const d =
    scoreDiff(
      from,
      to
    );

  if (!d) {
    return false;
  }

  return (
    (
      d.home === 1 &&
      d.away === 0
    ) ||
    (
      d.home === 0 &&
      d.away === 1
    )
  );
}


/*
 * ゴール種類。
 *
 * home = 箕谷
 * away = 相手
 */
function getGoalType(
  from,
  to
) {

  const d =
    scoreDiff(
      from,
      to
    );

  if (!d) {
    return null;
  }

  if (
    d.home === 1 &&
    d.away === 0
  ) {
    return 'minotani';
  }

  if (
    d.home === 0 &&
    d.away === 1
  ) {
    return 'opponent';
  }

  return null;
}


/* =========================================================
   対象フィルター
========================================================= */

function filterGoalsByTarget(
  detectedGoals,
  target
) {

  if (target === 'both') {
    return [...detectedGoals];
  }

  if (target === 'minotani') {

    return detectedGoals.filter(
      g =>
        g.type === 'minotani'
    );

  }

  if (target === 'opponent') {

    return detectedGoals.filter(
      g =>
        g.type === 'opponent'
    );

  }

  return [];
}


/* =========================================================
   検出結果表示
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
   ★重要
   ゴール列を最終スコアに合わせて再構築
========================================================= */

/*
 * ここが今回の修正の中心。
 *
 * 解析中にOCRが、
 *
 * 0-0 → 0-1 → 1-1 → 1-0
 *
 * と誤認識したとしても、
 *
 * 最終スコア 1-0
 *
 * なら、
 *
 * 0-0 → 0-1
 *       ↑
 *       最終スコアのaway=0を超えるので破棄
 *
 * 0-1 → 1-1
 *       ↑
 *       前の0-1が成立しないため破棄
 *
 * 0-0 → 1-0
 *       ↑
 *       正常なので採用
 *
 * とする。
 */
function rebuildGoalSequence(
  detectedGoals,
  initialScore,
  finalScore
) {

  if (
    !initialScore ||
    !finalScore
  ) {

    log(
      '初期または最終スコアを取得できないため、' +
      'スコア列補正は行いません'
    );

    return [...detectedGoals];
  }

  const sorted =
    [...detectedGoals]
      .sort(
        (a, b) =>
          a.time - b.time
      );

  let currentScore = {
    ...initialScore
  };

  const accepted = [];

  log(
    `スコア列検証開始: ` +
    `${scoreKey(initialScore)} → ` +
    `${scoreKey(finalScore)}`
  );

  for (
    const g of sorted
  ) {

    const fromScore = {
      home: Number(
        String(g.from).split('-')[0]
      ),
      away: Number(
        String(g.from).split('-')[1]
      )
    };

    const toScore = {
      home: Number(
        String(g.to).split('-')[0]
      ),
      away: Number(
        String(g.to).split('-')[1]
      )
    };

    /*
     * 現在の確定スコアから始まっているか。
     *
     * 例えば
     *
     * 現在 0-0
     * 候補 0-1
     *
     * は一旦候補として検証する。
     */
    if (
      scoreKey(fromScore) !==
      scoreKey(currentScore)
    ) {

      log(
        `⚠️ スコア列から除外: ` +
        `${g.from} → ${g.to} ` +
        `@ ${fmt(g.time)} ` +
        `(現在スコア ${scoreKey(currentScore)} と不一致)`
      );

      continue;
    }

    /*
     * +1点以外は除外。
     */
    if (
      !isValidGoalChange(
        currentScore,
        toScore
      )
    ) {

      log(
        `⚠️ 無効ゴールを除外: ` +
        `${g.from} → ${g.to} ` +
        `@ ${fmt(g.time)}`
      );

      continue;
    }

    /*
     * 最終スコアを超えていないか。
     */
    if (
      toScore.home >
        finalScore.home ||
      toScore.away >
        finalScore.away
    ) {

      log(
        `⚠️ 最終スコア超過のため除外: ` +
        `${g.from} → ${g.to} ` +
        `@ ${fmt(g.time)} ` +
        `(最終 ${scoreKey(finalScore)})`
      );

      continue;
    }

    /*
     * 正常なスコア遷移。
     */
    const type =
      getGoalType(
        currentScore,
        toScore
      );

    accepted.push({

      ...g,

      from:
        scoreKey(currentScore),

      to:
        scoreKey(toScore),

      type

    });

    currentScore = {
      ...toScore
    };

    log(
      `✅ スコア列採用: ` +
      `${g.from} → ${g.to} ` +
      `@ ${fmt(g.time)}`
    );
  }


  /*
   * 最終的に到達したスコアを確認。
   */
  if (
    scoreKey(currentScore) ===
    scoreKey(finalScore)
  ) {

    log(
      `✅ スコア列一致: ` +
      `${scoreKey(currentScore)}`
    );

  } else {

    log(
      `⚠️ 検出ゴールから到達したスコア: ` +
      `${scoreKey(currentScore)} / ` +
      `動画最終スコア: ` +
      `${scoreKey(finalScore)}`
    );

  }

  return accepted;
}


/* =========================================================
   最終スコア候補を取得
========================================================= */

async function readFinalScore() {

  const samples = [];

  /*
   * 最後の10秒から複数回確認。
   *
   * 最後の1～2フレームだけを信用しない。
   */
  const sampleCount = 6;

  const start =
    Math.max(
      0,
      duration - 10
    );

  for (
    let i = 0;
    i < sampleCount;
    i++
  ) {

    const ratio =
      sampleCount === 1
        ? 0
        : i / (sampleCount - 1);

    const t =
      Math.min(
        duration - 0.05,
        start +
        (
          (duration - 0.05 - start) *
          ratio
        )
      );

    try {

      await seekTo(t);

      drawScoreCrop();

      const score =
        await recognizeScore();

      if (score) {

        samples.push({
          time: t,
          score
        });

        log(
          `最終スコア候補: ` +
          `${scoreKey(score)} @ ${fmt(t)}`
        );
      }

    } catch (e) {

      log(
        `最終スコアOCR: ${e.message}`
      );

    }
  }

  if (!samples.length) {
    return null;
  }

  /*
   * 出現回数で最終スコアを決定。
   */
  const counts = {};

  samples.forEach(
    s => {

      const key =
        scoreKey(s.score);

      counts[key] =
        (counts[key] || 0) + 1;

    }
  );

  const sortedKeys =
    Object.keys(counts)
      .sort(
        (a, b) =>
          counts[b] - counts[a]
      );

  const key =
    sortedKeys[0];

  const m =
    key.match(
      /^(\d+)-(\d+)$/
    );

  if (!m) {
    return null;
  }

  return {

    home:
      Number(m[1]),

    away:
      Number(m[2])

  };
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
    allDetectedGoals = [];

    results.innerHTML = '';

    const interval =
      Math.max(
        0.5,
        Number(
          intervalEl.value
        ) || 1
      );

    const target =
      targetEl.value;

    /*
     * 誤OCRを減らすため、
     * 同じ新スコアを5回確認してから確定。
     *
     * これまでの3回から強化。
     */
    const REQUIRED_CONFIRMATIONS = 5;

    /*
     * 同一ゴールの二重登録防止。
     */
    const GOAL_COOLDOWN = 12;

    let previousScore = null;

    let candidate = null;

    let previousImage = null;

    let initialScore = null;

    try {

      status(
        'スコア解析中…'
      );

      log(
        `解析開始 / ` +
        `間隔 ${interval}秒 / ` +
        `確認回数 ${REQUIRED_CONFIRMATIONS}回`
      );

      log(
        `対象設定は最後に適用: ` +
        `${
          target === 'both'
            ? '両チーム'
            : target === 'minotani'
              ? '箕谷のゴールだけ'
              : '相手のゴールだけ'
        }`
      );

      /*
       * =====================================================
       * 全動画を対象に共通スキャン
       * =====================================================
       */

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
         * 初期スコア未取得なら必ずOCR。
         *
         * 以降は画面変化または候補中ならOCR。
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
             * ---------------------------------------------
             * 初期スコア
             * ---------------------------------------------
             */

            if (!previousScore) {

              previousScore = {
                ...score
              };

              initialScore = {
                ...score
              };

              candidate = null;

              log(
                `初期スコア ${key} @ ${fmt(t)}`
              );

            }

            /*
             * ---------------------------------------------
             * 現在の確定スコアと同じ
             * ---------------------------------------------
             */

            else if (
              key ===
              scoreKey(previousScore)
            ) {

              /*
               * 新スコア候補が元へ戻った。
               *
               * これは誤OCRの可能性が高いので
               * 候補を完全破棄。
               */
              if (candidate) {

                log(
                  `❌ ゴール候補破棄: ` +
                  `${candidate.key} → ${key} ` +
                  `@ ${fmt(t)}`
                );

                candidate = null;
              }

            }

            /*
             * ---------------------------------------------
             * スコアが変化
             * ---------------------------------------------
             */

            else {

              const validChange =
                isValidGoalChange(
                  previousScore,
                  score
                );

              /*
               * +1点以外の変化は無視。
               */
              if (!validChange) {

                log(
                  `無効なスコア変化を無視: ` +
                  `${scoreKey(previousScore)} → ` +
                  `${key} @ ${fmt(t)}`
                );

                /*
                 * 現在の確定スコアは変更しない。
                 */
                candidate = null;

              } else {

                const goalType =
                  getGoalType(
                    previousScore,
                    score
                  );

                /*
                 * -----------------------------------------
                 * 同じ候補を再確認
                 * -----------------------------------------
                 */

                if (
                  candidate &&
                  candidate.key === key
                ) {

                  candidate.count++;
                  candidate.lastSeen = t;

                }

                /*
                 * -----------------------------------------
                 * 新しい候補
                 * -----------------------------------------
                 */

                else {

                  candidate = {

                    key,

                    home:
                      score.home,

                    away:
                      score.away,

                    type:
                      goalType,

                    from:
                      scoreKey(
                        previousScore
                      ),

                    firstSeen:
                      t,

                    lastSeen:
                      t,

                    count:
                      1,

                    confidence:
                      1

                  };

                  log(
                    `ゴール候補: ` +
                    `${
                      goalType === 'minotani'
                        ? '箕谷'
                        : '相手'
                    } ` +
                    `${candidate.from} → ${key} ` +
                    `@ ${fmt(t)}`
                  );

                }


                /*
                 * -----------------------------------------
                 * 5回確認できたら候補確定
                 * -----------------------------------------
                 */

                if (
                  candidate.count >=
                  REQUIRED_CONFIRMATIONS
                ) {

                  const oldScore = {
                    ...previousScore
                  };

                  const newScore = {

                    home:
                      score.home,

                    away:
                      score.away

                  };

                  const confirmedType =
                    getGoalType(
                      oldScore,
                      newScore
                    );

                  const duplicate =
                    allDetectedGoals.some(
                      g =>
                        Math.abs(
                          g.time -
                          candidate.firstSeen
                        ) < GOAL_COOLDOWN
                    );

                  if (
                    confirmedType &&
                    !duplicate
                  ) {

                    /*
                     * ★ここでは対象設定を見ない。
                     *
                     * 箕谷でも相手でも、
                     * 「成立した可能性のあるゴール」
                     * として全件保存する。
                     */
                    allDetectedGoals.push({

                      time:
                        candidate.firstSeen,

                      from:
                        scoreKey(oldScore),

                      to:
                        scoreKey(newScore),

                      type:
                        confirmedType,

                      home:
                        newScore.home,

                      away:
                        newScore.away,

                      confidence:
                        candidate.count

                    });

                    log(
                      `⚽ ゴール候補確定: ` +
                      `${
                        confirmedType === 'minotani'
                          ? '箕谷'
                          : '相手'
                      } ` +
                      `${scoreKey(oldScore)} → ` +
                      `${scoreKey(newScore)} ` +
                      `@ ${fmt(candidate.firstSeen)} ` +
                      `(確認${candidate.count}回)`
                    );

                  } else if (duplicate) {

                    log(
                      `重複候補を除外: ${key}`
                    );

                  }

                  /*
                   * ★重要
                   *
                   * ここでは対象設定によって
                   * ゴールを捨てない。
                   *
                   * どちらのチームが得点しても、
                   * そのスコアを次の基準にする。
                   */
                  previousScore = {
                    ...newScore
                  };

                  candidate = null;

                }

              }

            }

          }

        }

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
         最終スコア
      ===================================================== */

      status(
        '最終スコアを確認中…'
      );

      const finalScore =
        await readFinalScore();

      if (finalScore) {

        log(
          `動画最終スコア確定: ` +
          `${scoreKey(finalScore)}`
        );

      } else {

        log(
          '動画最終スコアを取得できませんでした'
        );

      }


      /* =====================================================
         ★最重要
         全ゴール候補をスコア列として検証
      ===================================================== */

      let validAllGoals = [];

      if (
        initialScore &&
        finalScore
      ) {

        validAllGoals =
          rebuildGoalSequence(
            allDetectedGoals,
            initialScore,
            finalScore
          );

      } else {

        /*
         * 最終スコアが取れない場合だけ、
         * 解析中の候補をそのまま使用。
         */
        validAllGoals =
          [...allDetectedGoals]
            .sort(
              (a, b) =>
                a.time - b.time
            );

      }


      /*
       * =====================================================
       * 最後に対象チームでフィルター
       * =====================================================
       */

      goals =
        filterGoalsByTarget(
          validAllGoals,
          target
        );

      goals.sort(
        (a, b) =>
          a.time - b.time
      );


      /* =====================================================
         結果ログ
      ===================================================== */

      log(
        `全候補: ${allDetectedGoals.length}本`
      );

      log(
        `スコア整合性通過: ${validAllGoals.length}本`
      );

      log(
        `対象設定後: ${goals.length}本`
      );

      if (
        initialScore &&
        finalScore
      ) {

        log(
          `最終スコア確認: ` +
          `${scoreKey(initialScore)} → ` +
          `${scoreKey(finalScore)}`
        );

      }


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
        Number(
          beforeEl.value
        ) || 15
      );

    const after =
      Math.max(
        0,
        Number(
          afterEl.value
        ) || 10
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

        await ffmpeg.createDir(
          '/input'
        );

      } catch {}


      try {

        await ffmpeg.mount(
          'WORKERFS',
          {
            files: [
              sourceFile
            ]
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
          `goal_${String(
            i + 1
          ).padStart(
            2,
            '0'
          )}.mp4`;

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
          await ffmpeg.readFile(
            out
          );

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
              type:
                'video/mp4'
            }
          );

        const url =
          URL.createObjectURL(
            blob
          );

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

      if (
        clipNames.length > 1
      ) {

        status(
          'ゴール動画を1本に結合中…'
        );

        const concatText =
          clipNames
            .map(
              n =>
                `file '${n}'`
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

  wrap.appendChild(info);

  const v =
    document.createElement(
      'video'
    );

  v.controls = true;
  v.playsInline = true;
  v.src = url;

  wrap.appendChild(v);

  const a =
    document.createElement(
      'a'
    );

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

  wrap.appendChild(info);

  const v =
    document.createElement(
      'video'
    );

  v.controls = true;
  v.playsInline = true;
  v.src = url;

  wrap.appendChild(v);

  const a =
    document.createElement(
      'a'
    );

  a.href = url;

  a.download =
    name;

  a.textContent =
    '⬇️ 動画を保存';

  wrap.appendChild(a);

  results.appendChild(wrap);
}
