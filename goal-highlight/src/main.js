import { FFmpeg } from 'https://esm.sh/@ffmpeg/ffmpeg@0.12.10';
import { toBlobURL } from 'https://esm.sh/@ffmpeg/util@0.12.2';
import { createWorker } from 'https://esm.sh/tesseract.js@5.1.1';


/* =========================================================
   DOM
========================================================= */

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


/* =========================================================
   状態
========================================================= */

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
    new Date().toLocaleTimeString(
      'ja-JP',
      { hour12: false }
    );

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

  return Math.max(
    a,
    Math.min(b, v)
  );

}


function sleep(ms) {

  return new Promise(
    resolve => setTimeout(resolve, ms)
  );

}


/* =========================================================
   スコア
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
   動画選択
========================================================= */

fileInput.addEventListener(
  'change',
  async () => {

    sourceFile =
      fileInput.files?.[0] || null;

    goals = [];

    results.innerHTML =
      '<p class="muted">' +
      'まだ解析していません。' +
      '</p>';

    extractBtn.disabled = true;

    loadEngineBtn.disabled =
      !sourceFile;

    if (!sourceFile) {
      return;
    }

    if (sourceUrl) {
      URL.revokeObjectURL(
        sourceUrl
      );
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
   * 910x512を基準。
   *
   * 実際の動画では
   *
   * 箕谷A 0-0 東舞子
   *
   * が左上。
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

    raw:
      normalized

  };

}


/* =========================================================
   指定時刻のスコアを読む
========================================================= */

async function readScoreAt(t) {

  try {

    await seekTo(t);

    drawScoreCrop();

    return await recognizeScore();

  } catch (e) {

    return null;

  }

}


/* =========================================================
   スコア候補をまとめる
========================================================= */

/*
 * OCRには一瞬だけ
 *
 * 0-0
 * 8-0
 * 0-0
 *
 * のような誤読が発生する。
 *
 * そこで「何回出たか」だけではなく、
 * 「どれだけ長く連続して出たか」を見る。
 */

function longestRun(
  samples
) {

  if (!samples.length) {
    return null;
  }

  const valid =
    samples
      .filter(
        s =>
          s &&
          s.score
      )
      .sort(
        (a, b) =>
          a.time - b.time
      );

  if (!valid.length) {
    return null;
  }

  let best = null;

  let current = null;

  for (
    const item of valid
  ) {

    const key =
      scoreKey(item.score);

    if (
      !current ||
      current.key !== key ||
      item.time -
        current.lastTime >
        1.6
    ) {

      current = {

        key,

        score: {
          ...item.score
        },

        firstTime:
          item.time,

        lastTime:
          item.time,

        count:
          1

      };

    } else {

      current.lastTime =
        item.time;

      current.count++;

    }

    if (
      !best ||
      current.count >
        best.count ||
      (
        current.count ===
        best.count &&
        (
          current.lastTime -
          current.firstTime
        ) >
        (
          best.lastTime -
          best.firstTime
        )
      )
    ) {

      best = {
        ...current
      };

    }

  }

  return best;

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
   * 1秒間隔で開始直後を確認。
   */

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

  const best =
    longestRun(
      samples
    );

  if (!best) {
    return null;
  }

  log(
    `初期スコア: ` +
    `${best.key} ` +
    `（連続${best.count}回）`
  );

  return {
    ...best.score
  };

}


/* =========================================================
   最終スコア
========================================================= */

async function readFinalScore() {

  const samples = [];

  /*
   * 最後20秒。
   *
   * 0.75秒間隔で細かく読む。
   *
   * これにより、
   *
   * 2-0
   * 3-0 ← 一瞬の誤OCR
   * 2-0
   *
   * のようなケースで
   * 2-0の安定区間を選びやすくする。
   */

  const start =
    Math.max(
      0,
      duration - 20
    );

  const end =
    Math.max(
      start,
      duration - 0.2
    );

  for (
    let t = start;
    t <= end;
    t += 0.75
  ) {

    const score =
      await readScoreAt(t);

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

    await sleep(0);

  }

  const best =
    longestRun(
      samples
    );

  if (!best) {
    return null;
  }

  log(
    `最終スコア確定: ` +
    `${best.key} ` +
    `（連続${best.count}回）`
  );

  return {
    ...best.score
  };

}


/* =========================================================
   目標スコアが安定している場所を探す
========================================================= */

async function findStableScoreTime(
  targetScore,
  startTime,
  endTime
) {

  const STEP = 1;

  /*
   * 4回中3回以上同じスコアなら
   * 安定したスコアとみなす。
   */

  const WINDOW = 4;
  const REQUIRED = 3;

  const recent = [];

  for (
    let t = startTime;
    t <= endTime;
    t += STEP
  ) {

    const score =
      await readScoreAt(t);

    recent.push({

      time: t,

      score

    });

    if (
      recent.length >
      WINDOW
    ) {

      recent.shift();

    }

    let hits = 0;

    let firstHitTime =
      null;

    for (
      const item of recent
    ) {

      if (
        item.score &&
        sameScore(
          item.score,
          targetScore
        )
      ) {

        hits++;

        if (
          firstHitTime === null
        ) {

          firstHitTime =
            item.time;

        }

      }

    }

    if (
      hits >= REQUIRED
    ) {

      log(
        `安定スコア確認: ` +
        `${scoreKey(targetScore)} ` +
        `@ ${fmt(firstHitTime)}`
      );

      return firstHitTime;

    }

    await sleep(0);

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
    roughTime === null ||
    !previousScore ||
    !newScore
  ) {

    return roughTime;

  }

  /*
   * スコアが変わる直前4秒を
   * 0.25秒単位で確認。
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

  let firstNewScore =
    null;

  for (
    let t = start;
    t <= end;
    t += step
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

      firstNewScore =
        t;

      break;

    }

  }

  if (
    firstNewScore === null
  ) {

    return roughTime;

  }

  /*
   * OCR上のスコア表示は
   * 実際のゴールより少し遅れる場合がある。
   *
   * 今回の動画でも
   * 安定表示より数秒前が実際のゴール付近。
   *
   * まずスコア表示が切り替わった
   * 最初の時刻をゴール時刻とする。
   */

  log(
    `🎯 ゴール時刻を精密化: ` +
    `${fmt(roughTime)} → ` +
    `${fmt(firstNewScore)}`
  );

  return firstNewScore;

}


/* =========================================================
   全ゴールを検出
========================================================= */

/*
 * ここが今回の一番重要な部分。
 *
 * 0-0 → 2-0 を
 * 1ゴールとして扱わない。
 *
 * 必ず
 *
 * 0-0
 * ↓
 * 1-0
 * ↓
 * 2-0
 *
 * と1点ずつ追跡する。
 */

async function detectAllGoals(
  initialScore,
  finalScore,
  interval
) {

  const totalHome =
    finalScore.home -
    initialScore.home;

  const totalAway =
    finalScore.away -
    initialScore.away;

  if (
    totalHome < 0 ||
    totalAway < 0
  ) {

    throw new Error(
      `最終スコアが初期スコアより戻っています: ` +
      `${scoreKey(initialScore)} → ` +
      `${scoreKey(finalScore)}`
    );

  }

  const totalGoals =
    totalHome +
    totalAway;

  if (
    totalGoals <= 0
  ) {

    return [];

  }

  log(
    `必要ゴール数: ${totalGoals}本`
  );

  log(
    `内訳: 箕谷 ${totalHome}点 / ` +
    `相手 ${totalAway}点`
  );


  const detected = [];

  let currentScore = {
    ...initialScore
  };

  /*
   * 最後に確定したゴール時刻。
   */
  let searchStart =
    Math.max(
      3,
      0
    );


  for (
    let goalNo = 1;
    goalNo <= totalGoals;
    goalNo++
  ) {

    /*
     * 現在のスコアから
     * 次にあり得るスコアを作る。
     */

    const candidates = [];

    /*
     * 箕谷の次の1点。
     */
    if (
      currentScore.home <
      finalScore.home
    ) {

      candidates.push({

        score: {

          home:
            currentScore.home + 1,

          away:
            currentScore.away

        },

        type:
          'minotani'

      });

    }

    /*
     * 相手の次の1点。
     */
    if (
      currentScore.away <
      finalScore.away
    ) {

      candidates.push({

        score: {

          home:
            currentScore.home,

          away:
            currentScore.away + 1

        },

        type:
          'opponent'

      });

    }

    if (
      !candidates.length
    ) {

      break;

    }

    log(
      `------------------------------------`
    );

    log(
      `GOAL ${goalNo}/${totalGoals} ` +
      `候補を検索`
    );

    log(
      `現在: ` +
      `${scoreKey(currentScore)}`
    );

    /*
     * 各候補スコアについて
     * 安定して出現する最初の時刻を探す。
     */

    const found = [];

    for (
      const candidate of candidates
    ) {

      const foundTime =
        await findStableScoreTime(
          candidate.score,
          searchStart,
          Math.max(
            searchStart,
            duration - 15
          )
        );

      if (
        foundTime !== null
      ) {

        found.push({

          ...candidate,

          time:
            foundTime

        });

      }

    }

    if (!found.length) {

      log(
        `⚠️ GOAL ${goalNo} の` +
        `次スコアを確認できませんでした`
      );

      break;

    }

    /*
     * 実際に先に出現したスコアを採用。
     */

    found.sort(
      (a, b) =>
        a.time - b.time
    );

    const winner =
      found[0];

    /*
     * 直前スコアを保持。
     */

    const oldScore = {
      ...currentScore
    };

    /*
     * 精密化。
     */

    const refinedTime =
      await refineGoalTime(
        winner.time,
        oldScore,
        winner.score
      );

    const goal = {

      time:
        refinedTime,

      from:
        scoreKey(oldScore),

      to:
        scoreKey(
          winner.score
        ),

      type:
        winner.type,

      home:
        winner.score.home,

      away:
        winner.score.away

    };

    detected.push(
      goal
    );

    log(
      `⚽ GOAL ${goalNo}: ` +
      `${goal.from} → ` +
      `${goal.to} ` +
      `@ ${fmt(goal.time)}`
    );

    /*
     * 次のゴールは
     * 今回のスコアより後から探す。
     */

    currentScore = {
      ...winner.score
    };

    searchStart =
      Math.max(
        searchStart + 2,
        winner.time + 2
      );

    progressEl.value =
      Math.min(
        95,
        20 +
        Math.round(
          (
            goalNo /
            totalGoals
          ) * 70
        )
      );

    status(
      `ゴール ${goalNo}/${totalGoals} ` +
      `を確認中…`
    );

  }


  /*
   * 最終スコアまで到達できたか確認。
   */

  if (
    sameScore(
      currentScore,
      finalScore
    )
  ) {

    log(
      `✅ 全ゴール確認完了: ` +
      `${scoreKey(initialScore)} → ` +
      `${scoreKey(finalScore)}`
    );

  } else {

    log(
      `⚠️ ゴール確認後スコア: ` +
      `${scoreKey(currentScore)} / ` +
      `最終: ${scoreKey(finalScore)}`
    );

  }

  return detected;

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

  results.innerHTML = '';

  if (
    !goals.length
  ) {

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


      /* =====================================================
         ① 初期スコア
      ===================================================== */

      const initialScore =
        await readInitialScore();

      if (
        !initialScore
      ) {

        throw new Error(
          '試合開始時のスコアを読み取れませんでした'
        );

      }

      log(
        `初期スコア確定: ` +
        `${scoreKey(initialScore)}`
      );

      progressEl.value = 10;


      /* =====================================================
         ② 最終スコア
      ===================================================== */

      status(
        '最終スコアを確認中…'
      );

      const finalScore =
        await readFinalScore();

      if (
        !finalScore
      ) {

        throw new Error(
          '試合終了時のスコアを読み取れませんでした'
        );

      }

      log(
        `最終スコア: ` +
        `${scoreKey(finalScore)}`
      );

      progressEl.value = 20;


      /* =====================================================
         ③ ゴール数確認
      ===================================================== */

      const homeGoals =
        finalScore.home -
        initialScore.home;

      const awayGoals =
        finalScore.away -
        initialScore.away;

      if (
        homeGoals < 0 ||
        awayGoals < 0
      ) {

        throw new Error(
          `初期 ${scoreKey(initialScore)} ` +
          `→ 最終 ${scoreKey(finalScore)} ` +
          `でスコアが減少しています`
        );

      }

      const totalGoals =
        homeGoals +
        awayGoals;

      if (
        totalGoals === 0
      ) {

        log(
          '初期スコアと最終スコアが同じです'
        );

        status(
          '解析完了：ゴールはありません'
        );

        renderResults();

        progressEl.value = 100;

        return;

      }

      log(
        `必要ゴール数: ${totalGoals}本`
      );


      /* =====================================================
         ④ 全ゴールを1点ずつ検出
      ===================================================== */

      status(
        `ゴールを${totalGoals}本探しています…`
      );

      const allGoals =
        await detectAllGoals(
          initialScore,
          finalScore,
          interval
        );


      /* =====================================================
         ⑤ 対象チームで絞り込み
      ===================================================== */

      goals =
        filterGoals(
          allGoals,
          target
        );


      goals.sort(
        (a, b) =>
          a.time - b.time
      );


      /* =====================================================
         ⑥ 結果
      ===================================================== */

      log(
        '===================================='
      );

      log(
        `全ゴール: ${allGoals.length}本`
      );

      log(
        `対象設定後: ${goals.length}本`
      );

      allGoals.forEach(
        (g, i) => {

          log(
            `⚽ GOAL ${i + 1}: ` +
            `${g.from} → ${g.to} ` +
            `@ ${fmt(g.time)} ` +
            `[${
              g.type === 'minotani'
                ? '箕谷'
                : '相手'
            }]`
          );

        }
      );

      log(
        '===================================='
      );

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

    if (
      ffmpegLoaded
    ) {

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

      loadEngineBtn.disabled =
        false;

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

    if (
      !ffmpegLoaded
    ) {

      await loadEngineBtn.click();

    }

    if (
      !ffmpegLoaded
    ) {

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

        throw new Error(
          `動画ファイルをFFmpegへ渡せませんでした: ` +
          `${e.message || e}`
        );

      }


      const inputPath =
        `/input/${sourceFile.name}`;

      const clipNames = [];


      /* =====================================================
         各ゴール切り出し
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


        if (
          result !== 0
        ) {

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


        if (
          result !== 0
        ) {

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

      extractBtn.disabled =
        false;

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
