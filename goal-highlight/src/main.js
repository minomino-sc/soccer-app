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
   - iPhone / Safariの動画時間表示にも対応
   - 動画メタデータは複数イベント＋直接duration確認で取得
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
   動画メタデータ読み込み
========================================================= */
async function loadVideoFile(file) {

  if (!file) {
    throw new Error('動画ファイルが選択されていません');
  }

  if (sourceUrl) {
    URL.revokeObjectURL(sourceUrl);
    sourceUrl = null;
  }

  sourceUrl = URL.createObjectURL(file);

  status('動画を読み込み中…');

  /*
   * 重要：
   * src / load() より先にイベントを登録する。
   */
  await new Promise((resolve, reject) => {

    let finished = false;

    const finish = (err) => {

      if (finished) {
        return;
      }

      finished = true;

      clearTimeout(timeout);

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
        'error',
        onError
      );

      if (err) {
        reject(err);
      } else {
        resolve();
      }
    };

    const checkDuration = () => {

      if (
        Number.isFinite(video.duration) &&
        video.duration > 0
      ) {
        finish();
      }
    };

    const onLoadedMetadata = () => {
      checkDuration();
    };

    const onDurationChange = () => {
      checkDuration();
    };

    const onLoadedData = () => {
      checkDuration();
    };

    const onCanPlay = () => {
      checkDuration();
    };

    const onError = () => {

      finish(
        new Error(
          '動画を読み込めませんでした'
        )
      );
    };

    /*
     * iPhoneの大容量動画も考慮して
     * 60秒待つ。
     */
    const timeout =
      setTimeout(() => {

        if (
          Number.isFinite(video.duration) &&
          video.duration > 0
        ) {
          finish();
        } else {
          finish(
            new Error(
              '動画のメタデータを取得できませんでした'
            )
          );
        }

      }, 60000);

    /*
     * イベント登録を先に行う。
     */
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
      'error',
      onError
    );

    /*
     * ここで初めて動画をセット。
     */
    video.src = sourceUrl;

    video.load();

    /*
     * すでにdurationが取れている場合にも対応。
     */
    checkDuration();
  });

  duration = video.duration;

  if (
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    throw new Error(
      '動画時間を取得できませんでした'
    );
  }

  $('#duration').textContent =
    fmt(duration);

  status(
    `動画を読み込みました（${fmt(duration)}）`
  );

  log(
    `動画: ${file.name} / ` +
    `${(
      file.size /
      1024 /
      1024
    ).toFixed(1)}MB`
  );
}

/* =========================================================
   動画選択
========================================================= */

fileInput.addEventListener(
  'change',
  async () => {

    sourceFile =
      fileInput.files?.[0] ||
      null;

    goals = [];

    results.innerHTML =
      '<p class="muted">まだ解析していません。</p>';

    extractBtn.disabled =
      true;

    loadEngineBtn.disabled =
      !sourceFile;

    if (!sourceFile) {

      duration = 0;

      $('#duration').textContent =
        '--:--';

      status(
        '動画を選択してください'
      );

      return;
    }

    try {

      await loadVideoFile(
        sourceFile
      );

    } catch (e) {

      console.error(e);

      duration = 0;

      $('#duration').textContent =
        '--:--';

      status(
        `動画読み込みエラー: ${e.message}`
      );

      log(
        `VIDEO ERROR: ${
          e.stack ||
          e.message
        }`
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
      video.currentTime -
      target
    ) < 0.03
  ) {
    return;
  }

  await new Promise(
    (resolve, reject) => {

      let done = false;

      const timer =
        setTimeout(
          () =>
            finish(
              new Error(
                'seek timeout'
              )
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

      const onSeeked = () =>
        finish();

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
     現在の動画のスコア表示位置
  */

  const sx =
    Math.round(
      w * 145 / 910
    );

  const sy =
    0;

  const sw =
    Math.round(
      w * 95 / 910
    );

  const sh =
    Math.round(
      h * 70 / 512
    );

  canvas.width =
    380;

  canvas.height =
    280;

  ctx.fillStyle =
    '#fff';

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
                (m.progress || 0) *
                100
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
    await worker.recognize(
      canvas
    );

  const raw =
    (ret.data.text || '')
      .replace(/\s/g, '');

  const normalized =
    raw
      .replace(
        /[—–_]/g,
        '-'
      )
      .replace(
        /[ー―]/g,
        '-'
      );

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
    Math.min(
      duration,
      20
    );

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
    buildRuns(
      samples
    );

  const best =
    runs
      .filter(
        r => r.count >= 3
      )
      .sort(
        (a, b) => {

          if (
            b.count !==
            a.count
          ) {
            return (
              b.count -
              a.count
            );
          }

          return (
            b.lastTime -
            a.lastTime
          );
        }
      )[0]
      ||
      runs.sort(
        (a, b) =>
          b.count -
          a.count
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

async function scanScoreTimeline(
  interval
) {

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
          count /
          total *
          50
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
    `${samples.filter(
      x => x.score
    ).length}件`
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
        x =>
          x &&
          x.score
      )
      .slice()
      .sort(
        (a, b) =>
          a.time -
          b.time
      );

  const runs = [];

  let current = null;

  for (
    const item of valid
  ) {

    const key =
      scoreKey(
        item.score
      );

    if (
      !current ||
      current.key !== key ||
      item.time -
        current.lastTime >
        maxGap
    ) {

      if (current) {
        runs.push(
          current
        );
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
          a.time -
          b.time
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

  for (
    const item of valid
  ) {

    recent.push(item);

    if (
      recent.length >
      WINDOW
    ) {
      recent.shift();
    }

    let hits = 0;

    for (
      const r of recent
    ) {

      if (
        sameScore(
          r.score,
          targetScore
        )
      ) {
        hits++;
      }
    }

    if (
      hits >= REQUIRED
    ) {

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
        `${candidates.map(scoreKey).join(' / ')}`
      );

      break;
    }

    /*
       OCRの1秒単位の検出位置を
       0.25秒単位まで精密化。
    */

    const refined =
      await refineGoalTime(
        best.roughTime,
        currentScore,
        best.candidate
      );

    const type =
      getGoalType(
        currentScore,
        best.candidate
      );

    const goal = {

      time:
        refined,

      from:
        scoreKey(currentScore),

      to:
        scoreKey(best.candidate),

      type,

      home:
        best.candidate.home,

      away:
        best.candidate.away
    };

    goalsFound.push(
      goal
    );

    log(
      `⚽ GOAL ${goalsFound.length}: ` +
      `${goal.from} → ${goal.to} @ ` +
      `${fmt(goal.time)} ` +
      `[${type === 'minotani'
        ? '箕谷'
        : '相手'}]`
    );

    currentScore = {
      ...best.candidate
    };

    cursorTime =
      Math.max(
        cursorTime,
        best.roughTime + 1.0
      );
  }

  if (
    goalsFound.length !== expected
  ) {

    log(
      `⚠️ ゴール数不一致: ` +
      `検出${goalsFound.length}本 / ` +
      `必要${expected}本`
    );

  } else {

    log(
      `✅ 全ゴール確認完了: ` +
      `${scoreKey(initialScore)} → ` +
      `${scoreKey(finalScore)}`
    );
  }

  return {

    finalScore: {
      ...finalScore
    },

    goals:
      goalsFound
  };
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

      if (
        confirmation >= 1
      ) {

        firstNewScore =
          t;

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
   対象チームでフィルター
========================================================= */

function filterGoals(
  allGoals,
  target
) {

  if (
    target === 'both'
  ) {

    return [
      ...allGoals
    ];
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

  results.innerHTML =
    '';

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

      row.innerHTML = `

        <div>

          <b>⚽ GOAL ${i + 1}</b><br>

          <span>
            ${goalLabel}<br>
            ${g.from}
            →
            <strong>${g.to}</strong>
          </span>

        </div>

        <div>
          ${fmt(g.time)}
        </div>
      `;

      results.appendChild(
        row
      );
    }
  );
}


/* =========================================================
   スコア解析開始
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

    scanBusy =
      true;

    scanBtn.disabled =
      true;

    extractBtn.disabled =
      true;

    goals = [];

    results.innerHTML =
      '';

    const target =
      targetEl.value;

    const interval =
      Math.max(
        1,
        Number(
          intervalEl.value
        ) || 1
      );

    const finalHome =
      Number(
        finalHomeEl?.value
      );

    const finalAway =
      Number(
        finalAwayEl?.value
      );

    try {

      /*
         最終スコア入力チェック
      */

      if (
        !Number.isInteger(
          finalHome
        ) ||
        !Number.isInteger(
          finalAway
        ) ||
        finalHome < 0 ||
        finalAway < 0
      ) {

        throw new Error(
          '最終スコアを正しく入力してください'
        );
      }

      progressEl.value =
        0;

      status(
        '試合開始時のスコアを確認中…'
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

      log(
        `ユーザー入力 最終スコア: ` +
        `${finalHome}-${finalAway}`
      );

      /*
         試合開始時のスコアをOCR。
      */

      const initialScore =
        await readInitialScore();

      if (!initialScore) {

        throw new Error(
          '試合開始時のスコアを読み取れませんでした'
        );
      }

      log(
        `初期スコア確定: ` +
        `${scoreKey(initialScore)}`
      );

      progressEl.value =
        10;

      /*
         動画全体をOCR。
      */

      status(
        '試合全体のスコア変化を確認中…'
      );

      const samples =
        await scanScoreTimeline(
          interval
        );

      progressEl.value =
        70;

      /*
         ユーザーが入力した
         最終スコアを使用。
      */

      status(
        '入力された最終スコアまでのゴール時刻を特定中…'
      );

      const finalScore = {

        home:
          finalHome,

        away:
          finalAway
      };

      const analyzed =
        await detectGoalsFromTimeline(
          initialScore,
          finalScore,
          samples
        );

      /*
         全ゴール。
      */

      const allGoals =
        analyzed.goals;

      /*
         「箕谷だけ」
         「相手だけ」
         「両チーム」
         をここで切り替える。
      */

      goals =
        filterGoals(
          allGoals,
          target
        );

      goals.sort(
        (a, b) =>
          a.time -
          b.time
      );

      log(
        '===================================='
      );

      log(
        `入力最終スコア: ` +
        `${scoreKey(finalScore)}`
      );

      log(
        `全ゴール: ` +
        `${allGoals.length}本`
      );

      log(
        `対象設定後: ` +
        `${goals.length}本`
      );

      allGoals.forEach(
        (g, i) => {

          log(
            `⚽ GOAL ${i + 1}: ` +
            `${g.from} → ${g.to} @ ` +
            `${fmt(g.time)} ` +
            `[${g.type === 'minotani'
              ? '箕谷'
              : '相手'}]`
          );
        }
      );

      log(
        '===================================='
      );

      renderResults();

      extractBtn.disabled =
        goals.length === 0;

      progressEl.value =
        100;

      status(
        `解析完了：${goals.length}ゴールを検出 ` +
        `（最終スコア ${scoreKey(finalScore)}）`
      );

    } catch (e) {

      console.error(e);

      status(
        `エラー: ${e.message}`
      );

      log(
        `ERROR: ${
          e.stack ||
          e.message
        }`
      );

    } finally {

      scanBusy =
        false;

      scanBtn.disabled =
        false;
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

    loadEngineBtn.disabled =
      true;

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

      ffmpegLoaded =
        true;

      status(
        '切り出しエンジン準備完了'
      );

      log(
        'FFmpeg WASM loaded'
      );

    } catch (e) {

      console.error(e);

      loadEngineBtn.disabled =
        false;

      status(
        `FFmpeg読み込み失敗: ${e.message}`
      );

      log(
        `FFmpeg ERROR: ${
          e.stack ||
          e.message
        }`
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

    extractBtn.disabled =
      true;

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

        throw new Error(
          `動画ファイルをFFmpegへ渡せませんでした: ` +
          `${e.message || e}`
        );
      }

      const inputPath =
        `/input/${sourceFile.name}`;

      const clipNames = [];

      /*
         ゴールごとに切り出す。
      */

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
          `goal_${
            String(i + 1)
              .padStart(2, '0')
          }.mp4`;

        status(
          `GOAL ${i + 1}/${goals.length} を作成中…`
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

        clipNames.push(
          out
        );

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
          out,
          url,
          g,
          start,
          len
        );
      }

      /*
         複数ゴールの場合、
         1本に結合。
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

      /*
         一時ファイル削除。
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

      extractBtn.disabled =
        false;
    }
  }
);


/* =========================================================
   結合動画表示
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
    `<b>🎬 ALL_GOALS.mp4</b><br>` +
    `<span>${count}本のゴールを1本にまとめた動画</span>`;

  wrap.appendChild(
    info
  );

  const v =
    document.createElement(
      'video'
    );

  v.controls =
    true;

  v.playsInline =
    true;

  v.src =
    url;

  wrap.appendChild(
    v
  );

  const a =
    document.createElement(
      'a'
    );

  a.href =
    url;

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
   個別動画表示
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
    `<b>${name}</b><br>` +
    `<span>${goalLabel} / ` +
    `${fmt(start)} ～ ` +
    `${fmt(start + len)} ` +
    `（${fmt(len)}）</span>`;

  wrap.appendChild(
    info
  );

  const v =
    document.createElement(
      'video'
    );

  v.controls =
    true;

  v.playsInline =
    true;

  v.src =
    url;

  wrap.appendChild(
    v
  );

  const a =
    document.createElement(
      'a'
    );

  a.href =
    url;

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
