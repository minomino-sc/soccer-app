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
   スコア部分
========================================================= */

/*
 * 実際の動画では
 *
 * 「箕谷A 0-0 東舞子」
 *
 * が画面左上。
 *
 * スコアだけを切り出す。
 *
 * 910x512動画の場合
 * x ≒145～240
 * y ≒0～70
 *
 * この範囲を維持。
 */

function drawScoreCrop() {

  const w =
    video.videoWidth;

  const h =
    video.videoHeight;

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


function isOneGoalChange(from, to) {

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


function getGoalType(from, to) {

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
   最終スコア確認
========================================================= */

async function readFinalScore() {

  const samples = [];

  /*
   * 試合終了直前20秒。
   *
   * 10秒では短すぎる場合があるので20秒に拡大。
   */

  const sampleCount = 8;

  const start =
    Math.max(
      0,
      duration - 20
    );

  for (
    let i = 0;
    i < sampleCount;
    i++
  ) {

    const ratio =
      i /
      (sampleCount - 1);

    const t =
      start +
      (
        (duration - 0.1 - start) *
        ratio
      );

    try {

      await seekTo(t);

      drawScoreCrop();

      const score =
        await recognizeScore();

      if (score) {

        samples.push(score);

        log(
          `最終スコア候補: ` +
          `${scoreKey(score)} @ ${fmt(t)}`
        );

      }

    } catch (e) {

      log(
        `最終スコアOCRエラー: ${e.message}`
      );

    }

  }

  if (!samples.length) {
    return null;
  }

  const counts = {};

  for (
    const score of samples
  ) {

    const key =
      scoreKey(score);

    counts[key] =
      (counts[key] || 0) + 1;

  }

  const best =
    Object.entries(counts)
      .sort(
        (a, b) =>
          b[1] - a[1]
      )[0];

  if (!best) {
    return null;
  }

  const m =
    best[0].match(
      /^(\d+)-(\d+)$/
    );

  if (!m) {
    return null;
  }

  const result = {

    home:
      Number(m[1]),

    away:
      Number(m[2])

  };

  log(
    `最終スコア確定: ` +
    `${scoreKey(result)} ` +
    `（${best[1]}/${samples.length}回）`
  );

  return result;
}


/* =========================================================
   初期スコア確認
========================================================= */

async function readInitialScore() {

  const samples = [];

  /*
   * 開始直後20秒から確認。
   */

  const sampleCount = 6;

  const end =
    Math.min(
      duration,
      20
    );

  for (
    let i = 0;
    i < sampleCount;
    i++
  ) {

    const t =
      1 +
      (
        (Math.max(1, end - 1)) *
        i /
        (sampleCount - 1)
      );

    try {

      await seekTo(t);

      drawScoreCrop();

      const score =
        await recognizeScore();

      if (score) {

        samples.push(score);

        log(
          `初期スコア候補: ` +
          `${scoreKey(score)} @ ${fmt(t)}`
        );

      }

    } catch (e) {

      log(
        `初期スコアOCRエラー: ${e.message}`
      );

    }

  }

  if (!samples.length) {
    return null;
  }

  const counts = {};

  samples.forEach(
    score => {

      const key =
        scoreKey(score);

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

  if (!best) {
    return null;
  }

  const m =
    best[0].match(
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
   ★最重要
   最終スコアになった最初の場所を探す
========================================================= */

/*
 * 例えば
 *
 * 0-0
 * ↓
 * OCR誤認識 0-1
 * ↓
 * OCR誤認識 1-1
 * ↓
 * 本当のスコア 1-0
 *
 * という場合、
 *
 * 「1-0を最初に安定して確認できた時刻」
 *
 * をゴール時刻として使う。
 *
 * これまでのように
 * 解析中のOCR候補だけに頼らない。
 */

async function findFirstFinalScoreTime(
  initialScore,
  finalScore,
  interval
) {

  if (
    !initialScore ||
    !finalScore
  ) {
    return null;
  }

  if (
    sameScore(
      initialScore,
      finalScore
    )
  ) {

    log(
      '最終スコアが初期スコアと同じため、' +
      'ゴールはありません'
    );

    return null;
  }

  log(
    `最終スコア到達位置を検索: ` +
    `${scoreKey(initialScore)} → ` +
    `${scoreKey(finalScore)}`
  );

  /*
   * 最終スコアを確認した時刻。
   */

  const hits = [];

  /*
   * 連続確認。
   *
   * 3回では誤OCRの可能性があるため、
   * 5回中4回以上を採用。
   */

  const REQUIRED_HITS = 4;

  const WINDOW = 5;

  let recent = [];

  /*
   * 試合全体を1秒単位で検索。
   *
   * interval設定が2秒でも、
   * ゴール位置検索は1秒固定。
   *
   * ここが精度向上の重要ポイント。
   */

  const scanInterval = 1;

  for (
    let t = 0;
    t < duration;
    t += scanInterval
  ) {

    /*
     * 試合終了間際は検索不要。
     */
    if (
      t >
      duration - 15
    ) {
      break;
    }

    /*
     * 初期スコア付近は検索不要。
     */
    if (
      t < 3
    ) {
      continue;
    }

    try {

      await seekTo(t);

      drawScoreCrop();

      const score =
        await recognizeScore();

      const key =
        score
          ? scoreKey(score)
          : '';

      recent.push({
        time: t,
        key,
        score
      });

      if (
        recent.length >
        WINDOW
      ) {
        recent.shift();
      }

      /*
       * 最終スコア以外ならリセット。
       */
      if (
        !score ||
        !sameScore(
          score,
          finalScore
        )
      ) {

        hits.length = 0;

      } else {

        hits.push({
          time: t,
          score
        });

        /*
         * 5サンプル中4回以上
         * 最終スコアなら確定。
         */

        if (
          hits.length >=
          REQUIRED_HITS
        ) {

          const first =
            hits[
              hits.length -
              REQUIRED_HITS
            ];

          const detectedTime =
            first.time;

          log(
            `🎯 最初の安定した最終スコア: ` +
            `${scoreKey(finalScore)} ` +
            `@ ${fmt(detectedTime)}`
          );

          /*
           * ゴールそのものは
           * スコア表示より少し前。
           *
           * ただし切り出し開始は
           * beforeSec側で十分確保するため、
           * ゴール時刻自体は
           * スコアが最初に確定した時刻を使う。
           */

          return detectedTime;

        }

      }

    } catch (e) {

      log(
        `位置検索OCRエラー @ ${fmt(t)}`
      );

    }

    /*
     * 進捗表示。
     *
     * 解析全体の後半処理なので
     * 85～99%付近として表示。
     */

    const pct =
      80 +
      Math.round(
        (
          t /
          Math.max(
            1,
            duration - 15
          )
        ) *
        19
      );

    progressEl.value =
      clamp(
        pct,
        80,
        99
      );

    status(
      `ゴール位置を特定中… ` +
      `${fmt(t)} / ${fmt(duration)}`
    );

    await sleep(0);
  }

  log(
    '⚠️ 最終スコアになった最初の位置を特定できませんでした'
  );

  return null;
}


/* =========================================================
   ★スコア変化周辺を再確認
========================================================= */

/*
 * 最終スコアの最初の安定位置が
 * 例えば80秒なら、
 *
 * 78秒
 * 79秒
 * 80秒
 * 81秒
 *
 * を細かく再確認する。
 *
 * これにより1秒刻みのズレを減らす。
 */

async function refineGoalTime(
  roughTime,
  finalScore
) {

  if (
    roughTime === null ||
    !finalScore
  ) {
    return roughTime;
  }

  const start =
    Math.max(
      0,
      roughTime - 4
    );

  const end =
    Math.min(
      duration - 0.05,
      roughTime + 1
    );

  const step =
    0.25;

  const samples = [];

  for (
    let t = start;
    t <= end;
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
          finalScore
        )
      ) {

        samples.push(t);

      }

    } catch {}

  }

  if (!samples.length) {
    return roughTime;
  }

  const refined =
    Math.min(
      ...samples
    );

  log(
    `🎯 ゴール時刻を精密化: ` +
    `${fmt(roughTime)} → ` +
    `${fmt(refined)}`
  );

  return refined;
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

    results.innerHTML = '';

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
        '試合スコアを確認中…'
      );

      log(
        '===================================='
      );

      log(
        'ゴール解析開始'
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

      /*
       * -----------------------------------------------------
       * ① 初期スコア
       * -----------------------------------------------------
       */

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


      /*
       * -----------------------------------------------------
       * ② 最終スコア
       * -----------------------------------------------------
       */

      status(
        '最終スコアを確認中…'
      );

      const finalScore =
        await readFinalScore();

      if (!finalScore) {

        throw new Error(
          '試合終了時のスコアを読み取れませんでした'
        );

      }

      log(
        `最終スコア: ` +
        `${scoreKey(finalScore)}`
      );

      progressEl.value = 20;


      /*
       * -----------------------------------------------------
       * ③ 最終スコアが初期スコアと違う場合
       *    ゴール位置を探す
       * -----------------------------------------------------
       */

      if (
        sameScore(
          initialScore,
          finalScore
        )
      ) {

        log(
          '初期スコアと最終スコアが同じです'
        );

        status(
          '解析完了：ゴールはありません'
        );

        renderResults();

        return;
      }


      /*
       * -----------------------------------------------------
       * ④ 試合全体から
       *    「最終スコアになった最初の場所」
       *    を探す
       * -----------------------------------------------------
       */

      status(
        'ゴール位置を特定中…'
      );

      const roughTime =
        await findFirstFinalScoreTime(
          initialScore,
          finalScore,
          interval
        );

      if (
        roughTime === null
      ) {

        throw new Error(
          'ゴール位置を特定できませんでした'
        );

      }

      progressEl.value = 99;


      /*
       * -----------------------------------------------------
       * ⑤ 0.25秒単位で精密化
       * -----------------------------------------------------
       */

      status(
        'ゴール位置を精密確認中…'
      );

      const goalTime =
        await refineGoalTime(
          roughTime,
          finalScore
        );


      /*
       * -----------------------------------------------------
       * ⑥ 今回はスコア差から
       *    ゴール種類を決定
       * -----------------------------------------------------
       */

      const goalType =
        getGoalType(
          initialScore,
          finalScore
        );

      if (!goalType) {

        throw new Error(
          `初期 ${scoreKey(initialScore)} ` +
          `→ 最終 ${scoreKey(finalScore)} ` +
          `の変化を1ゴールとして判定できません`
        );

      }


      /*
       * -----------------------------------------------------
       * ⑦ ゴールを1件登録
       * -----------------------------------------------------
       */

      const detectedGoal = {

        time:
          goalTime,

        from:
          scoreKey(initialScore),

        to:
          scoreKey(finalScore),

        type:
          goalType,

        home:
          finalScore.home,

        away:
          finalScore.away

      };


      /*
       * -----------------------------------------------------
       * ⑧ 対象チーム判定
       * -----------------------------------------------------
       */

      if (
        target === 'both'
      ) {

        goals = [
          detectedGoal
        ];

      } else if (
        target === 'minotani'
      ) {

        goals =
          goalType === 'minotani'
            ? [detectedGoal]
            : [];

      } else if (
        target === 'opponent'
      ) {

        goals =
          goalType === 'opponent'
            ? [detectedGoal]
            : [];

      } else {

        goals = [];

      }


      /*
       * -----------------------------------------------------
       * ⑨ 結果
       * -----------------------------------------------------
       */

      log(
        `====================================`
      );

      log(
        `🎯 ゴール位置: ${fmt(goalTime)}`
      );

      log(
        `⚽ ${scoreKey(initialScore)} → ` +
        `${scoreKey(finalScore)}`
      );

      log(
        `判定: ${
          goalType === 'minotani'
            ? '箕谷ゴール'
            : '相手ゴール'
        }`
      );

      log(
        `対象設定後: ${goals.length}本`
      );

      log(
        `====================================`
      );

      renderResults();

      extractBtn.disabled =
        goals.length === 0;

      status(
        `解析完了：${goals.length}ゴールを検出`
      );

      progressEl.value = 100;

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

      const inputPath =
        `/input/${sourceFile.name}`;

      const clipNames = [];


      /*
       * =====================================================
       * 各ゴール
       * =====================================================
       */

      for (
        let i = 0;
        i < goals.length;
        i++
      ) {

        const g =
          goals[i];

        /*
         * ゴール時刻の15秒前から開始。
         */

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
          `${fmt(end)}`
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


      /*
       * =====================================================
       * 全ゴール結合
       * =====================================================
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

        if (result !== 0) {

          throw new Error(
            `ゴール動画の結合に失敗しました`
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


      /*
       * =====================================================
       * 後片付け
       * =====================================================
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
