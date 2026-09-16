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
   スコア画像
========================================================= */

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
   初期スコア
========================================================= */

async function readInitialScore() {

  const samples = [];

  const end =
    Math.min(
      duration,
      20
    );

  /*
   * 開始直後はスコア表示が安定しない場合があるため、
   * 1秒～20秒の間から複数回取得。
   */

  const sampleCount = 6;

  for (
    let i = 0;
    i < sampleCount;
    i++
  ) {

    const ratio =
      i /
      (sampleCount - 1);

    const t =
      1 +
      (
        Math.max(
          0,
          end - 2
        ) *
        ratio
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
    `初期スコア確定: ` +
    `${scoreKey(result)} ` +
    `（${best[1]}/${samples.length}回）`
  );

  return result;
}


/* =========================================================
   ★重要
   動画全体のスコアを時系列で取得
========================================================= */

/*
 * ここでは最終スコアをOCRで決めない。
 *
 * HTMLで入力された最終スコアを正解として、
 * 動画中のスコア変化だけをOCRで探す。
 *
 * 例：
 *
 * 0-0
 * 0-0
 * 1-0  ← ゴール1
 * 1-0
 * 1-0
 * 2-0  ← ゴール2
 * 2-0
 * 2-1  ← ゴール3
 * 2-1
 * 3-1  ← ゴール4
 */

async function scanScoreTimeline(interval) {

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

    currentScore = toScore;

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
   * 今回は元の正常版と同じ考え方で
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


      /* =====================================================
         ① 初期スコア
      ===================================================== */

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


      /* =====================================================
         ② HTML入力の最終スコア
      ===================================================== */

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


      /* =====================================================
         ③ スコアの整合性確認
      ===================================================== */

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


      /* =====================================================
         ④ ゴールなし
      ===================================================== */

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


      /* =====================================================
         ⑤ 動画全体のスコアを時系列解析
      ===================================================== */

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


      /* =====================================================
         ⑥ 複数ゴール検出
      ===================================================== */

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


      /* =====================================================
         ⑦ 各ゴールの時刻を精密化
      ===================================================== */

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


      /* =====================================================
         ⑧ チームフィルター
      ===================================================== */

      goals =
        filterGoals(
          refinedGoals,
          target
        );

      goals.sort(
        (a, b) =>
          a.time - b.time
      );


      /* =====================================================
         ⑨ 結果ログ
      ===================================================== */

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


      /* =====================================================
         ⑩ 表示
      ===================================================== */

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


      /* =====================================================
         各ゴール
      ===================================================== */

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
