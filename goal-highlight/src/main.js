import { FFmpeg } from 'https://esm.sh/@ffmpeg/ffmpeg@0.12.10';
import { toBlobURL } from 'https://esm.sh/@ffmpeg/util@0.12.2';
import { createWorker } from 'https://esm.sh/tesseract.js@5.1.1';

/* =========================================================
   箕谷SC ゴールハイライト

   最終スコア手入力方式

   重要な変更点
   - 最終スコアはユーザーが事前入力
   - OCRで最終スコアを推定しない
   - 入力された最終スコアまでの1点ずつの得点変化を探索
   - OCRの「3-0」「12-0」などの誤読は最終スコアにならない
   - 箕谷・相手の両方のゴールを検出可能
========================================================= */

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

const finalHomeEl = $('#finalHome');
const finalAwayEl = $('#finalAway');

let sourceFile = null;
let sourceUrl = null;
let duration = 0;
let goals = [];
let scanBusy = false;

let ocrWorker = null;
let ffmpeg = null;
let ffmpegLoaded = false;


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
   スコア
========================================================= */

function scoreKey(score) {
  return score
    ? `${score.home}-${score.away}`
    : '';
}

function sameScore(a, b) {
  return !!a &&
    !!b &&
    a.home === b.home &&
    a.away === b.away;
}

function scoreDistance(a, b) {
  if (!a || !b) return 99;

  return Math.abs(a.home - b.home) +
         Math.abs(a.away - b.away);
}

function isOneGoalChange(from, to) {
  if (!from || !to) return false;

  const dh = to.home - from.home;
  const da = to.away - from.away;

  return (
    (dh === 1 && da === 0) ||
    (dh === 0 && da === 1)
  );
}

function getGoalType(from, to) {
  if (!from || !to) return null;

  const dh = to.home - from.home;
  const da = to.away - from.away;

  if (dh === 1 && da === 0) {
    return 'minotani';
  }

  if (dh === 0 && da === 1) {
    return 'opponent';
  }

  return null;
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

      const timer = setTimeout(
        () =>
          finish(
            new Error(
              '動画の読み込みがタイムアウトしました'
            )
          ),
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

        if (finished) return;

        finished = true;

        cleanup();

        err
          ? reject(err)
          : resolve();
      };

      const onLoaded = () => finish();

      const onError = () =>
        finish(
          new Error(
            '動画を読み込めませんでした'
          )
        );

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

    console.error(e);

    status(
      `動画読み込みエラー: ${e.message}`
    );

    log(
      `VIDEO ERROR: ${e.message}`
    );
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

    const timer = setTimeout(
      () =>
        finish(
          new Error('seek timeout')
        ),
      10000
    );

    const finish = (err) => {

      if (done) return;

      done = true;

      clearTimeout(timer);

      video.removeEventListener(
        'seeked',
        onSeeked
      );

      err
        ? reject(err)
        : resolve();
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
     現在の動画のスコア表示位置
  */

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

async function readScoreAt(t) {

  try {

    await seekTo(t);

    drawScoreCrop();

    return await recognizeScore();

  } catch {

    return null;
  }
}


/* =========================================================
   初期スコア
========================================================= */

async function readInitialScore() {

  const samples = [];

  const end =
    Math.min(duration, 20);

  for (
    let t = 0.5;
    t <= end;
    t += 1
  ) {

    const score =
      await readScoreAt(t);

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

    await sleep(0);
  }

  if (!samples.length) {
    return null;
  }

  const runs =
    buildRuns(samples);

  const best =
    runs
      .filter(r => r.count >= 3)
      .sort((a, b) => {

        if (b.count !== a.count) {
          return b.count - a.count;
        }

        return b.lastTime - a.lastTime;

      })[0]
      ||
      runs.sort(
        (a, b) =>
          b.count - a.count
      )[0];

  if (!best) {
    return null;
  }

  log(
    `初期スコア: ${best.key} ` +
    `（連続${best.count}回）`
  );

  return {
    ...best.score
  };
}


/* =========================================================
   OCR時系列
========================================================= */

async function scanScoreTimeline(interval) {

  const samples = [];

  const end =
    Math.max(
      0,
      duration - 0.25
    );

  log(
    '------------------------------------'
  );

  log(
    `全試合のスコア時系列を解析 ` +
    `（${interval}秒間隔）`
  );

  let count = 0;

  const total =
    Math.max(
      1,
      Math.floor(
        end / interval
      ) + 1
    );

  for (
    let t = 0;
    t <= end;
    t += interval
  ) {

    const score =
      await readScoreAt(t);

    samples.push({
      time: t,
      score
    });

    count++;

    progressEl.value =
      Math.min(
        70,
        20 +
        Math.round(
          count / total * 50
        )
      );

    if (score) {

      log(
        `スコア確認: ` +
        `${scoreKey(score)} @ ${fmt(t)}`
      );
    }

    await sleep(0);
  }

  log(
    `スコア時系列解析完了: ` +
    `${samples.filter(x => x.score).length}件`
  );

  return samples;
}


/* =========================================================
   スコア連続区間
========================================================= */

function buildRuns(
  samples,
  maxGap = 1.6
) {

  const valid =
    samples
      .filter(
        x => x && x.score
      )
      .slice()
      .sort(
        (a, b) =>
          a.time - b.time
      );

  const runs = [];

  let current = null;

  for (const item of valid) {

    const key =
      scoreKey(item.score);

    if (
      !current ||
      current.key !== key ||
      item.time -
        current.lastTime >
        maxGap
    ) {

      if (current) {
        runs.push(current);
      }

      current = {

        key,

        score: {
          ...item.score
        },

        firstTime:
          item.time,

        lastTime:
          item.time,

        count: 1
      };

    } else {

      current.lastTime =
        item.time;

      current.count++;
    }
  }

  if (current) {
    runs.push(current);
  }

  return runs;
}


/* =========================================================
   入力された最終スコアから
   次にあり得るスコアを作る
========================================================= */

function buildExpectedNextScores(
  current,
  finalScore
) {

  const candidates = [];

  if (
    current.home <
    finalScore.home
  ) {

    candidates.push({
      home:
        current.home + 1,

      away:
        current.away
    });
  }

  if (
    current.away <
    finalScore.away
  ) {

    candidates.push({
      home:
        current.home,

      away:
        current.away + 1
    });
  }

  return candidates;
}


/* =========================================================
   安定したスコア表示位置を探す

   入力された最終スコアまでの
   「次の1点」を探す。

   例：
   現在 1-0
   最終 2-0

   探すのは 2-0 だけ。

   3-0 や 12-0 は候補にならない。
========================================================= */

function findStableSampleTime(
  targetScore,
  samples,
  startTime
) {

  const valid =
    samples
      .filter(
        x =>
          x &&
          x.score &&
          x.time >= startTime
      )
      .sort(
        (a, b) =>
          a.time - b.time
      );

  if (!valid.length) {
    return null;
  }

  /*
     1秒間隔の場合、
     4回中3回以上同じなら
     安定表示と判断。
  */

  const WINDOW = 4;
  const REQUIRED = 3;

  const recent = [];

  for (const item of valid) {

    recent.push(item);

    if (
      recent.length >
      WINDOW
    ) {
      recent.shift();
    }

    let hits = 0;

    for (const r of recent) {

      if (
        sameScore(
          r.score,
          targetScore
        )
      ) {
        hits++;
      }
    }

    if (hits >= REQUIRED) {

      const firstHit =
        recent.find(
          r =>
            sameScore(
              r.score,
              targetScore
            )
        );

      return firstHit
        ? firstHit.time
        : item.time;
    }
  }

  /*
     安定区間が短い場合。

     2回連続で同じスコアなら
     候補として採用。
  */

  for (
    let i = 0;
    i < valid.length - 1;
    i++
  ) {

    if (
      sameScore(
        valid[i].score,
        targetScore
      ) &&
      sameScore(
        valid[i + 1].score,
        targetScore
      ) &&
      valid[i + 1].time -
        valid[i].time <=
        2.5
    ) {

      return valid[i].time;
    }
  }

  return null;
}


/* =========================================================
   ゴール時刻を精密化
========================================================= */

async function refineGoalTime(
  roughTime,
  previousScore,
  newScore
) {

  if (
    roughTime == null ||
    !previousScore ||
    !newScore
  ) {
    return roughTime;
  }

  const start =
    Math.max(
      0,
      roughTime - 4.0
    );

  const end =
    Math.min(
      duration - 0.05,
      roughTime + 0.5
    );

  let firstNewScore = null;

  /*
     0.25秒刻みで
     新しいスコアが出始めた瞬間を探す。
  */

  for (
    let t = start;
    t <= end;
    t += 0.25
  ) {

    const score =
      await readScoreAt(t);

    if (
      score &&
      sameScore(
        score,
        newScore
      )
    ) {

      /*
         直後にも同じスコアが
         続いているか確認。
      */

      let confirmation = 0;

      for (
        let j = 1;
        j <= 2;
        j++
      ) {

        const checkTime =
          Math.min(
            end,
            t + j * 0.25
          );

        const s2 =
          await readScoreAt(
            checkTime
          );

        if (
          s2 &&
          sameScore(
            s2,
            newScore
          )
        ) {
          confirmation++;
        }
      }

      if (confirmation >= 1) {

        firstNewScore = t;

        break;
      }
    }
  }

  if (
    firstNewScore == null
  ) {
    return roughTime;
  }

  log(
    `🎯 ゴール時刻を精密化: ` +
    `${fmt(roughTime)} → ` +
    `${fmt(firstNewScore)}`
  );

  return firstNewScore;
}


/* =========================================================
   ゴール検出

   最終スコアはユーザー入力。

   例えば 2-0 の場合：

   0-0
     ↓
   1-0
     ↓
   2-0

   この2回だけを探す。

   OCRが途中で

   3-0
   12-0
   1-0

   などと誤認識しても、
   3-0や12-0は最終スコアまでの
   正規ルートに存在しないため採用しない。
========================================================= */

async function detectGoalsFromTimeline(
  initialScore,
  finalScore,
  samples
) {

  if (
    finalScore.home <
      initialScore.home ||
    finalScore.away <
      initialScore.away
  ) {

    throw new Error(
      `入力した最終スコア ` +
      `${scoreKey(finalScore)} が ` +
      `初期スコア ` +
      `${scoreKey(initialScore)} ` +
      `より小さくなっています`
    );
  }

  const expected =
    (finalScore.home -
      initialScore.home) +
    (finalScore.away -
      initialScore.away);

  log(
    '------------------------------------'
  );

  log(
    `入力された最終スコア: ` +
    `${scoreKey(finalScore)}`
  );

  log(
    `必要ゴール数: ${expected}本`
  );

  log(
    'OCRは最終スコアを決定せず、' +
    '入力スコアまでの得点変化の時刻だけを探索します。'
  );

  if (expected <= 0) {

    log(
      '0-0など、ゴールなしの試合です。'
    );

    return {
      finalScore: {
        ...finalScore
      },

      goals: []
    };
  }

  const goalsFound = [];

  let currentScore = {
    ...initialScore
  };

  /*
     最初の探索位置。

     試合開始直後の
     OCRノイズを避ける。
  */

  let cursorTime = 0.5;

  /*
     各ゴールを1点ずつ探す。
  */

  for (
    let goalIndex = 0;
    goalIndex < expected;
    goalIndex++
  ) {

    const candidates =
      buildExpectedNextScores(
        currentScore,
        finalScore
      );

    let best = null;

    /*
       次にあり得るスコアだけを見る。

       例：

       現在 0-0
       最終 2-0

       候補：
       1-0

       3-0 は絶対に候補にならない。
    */

    for (
      const candidate of candidates
    ) {

      const roughTime =
        findStableSampleTime(
          candidate,
          samples,
          cursorTime + 0.5
        );

      if (
        roughTime == null
      ) {
        continue;
      }

      if (
        !best ||
        roughTime <
          best.roughTime
      ) {

        best = {
          candidate,
          roughTime
        };
      }
    }

    if (!best) {

      log(
        `⚠️ ${goalIndex + 1}点目を検出できませんでした。` +
        ` 探索対象は ` +
        `${candidates.map(scoreKey).
