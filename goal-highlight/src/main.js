import { FFmpeg } from 'https://esm.sh/@ffmpeg/ffmpeg@0.12.10';
import { toBlobURL } from 'https://esm.sh/@ffmpeg/util@0.12.2';
import { createWorker } from 'https://esm.sh/tesseract.js@5.1.1';

/* =========================================================
   箕谷SC ゴールハイライト
   スコアOCRの誤認識を時系列で補正する版

   重要な変更点
   - 終盤の「3-0」をそのまま最終スコアにしない
   - 動画全体のOCR結果を1本の時系列として解析
   - スコアは時間とともに減らない、というルールを適用
   - 1点ずつしか増えない状態遷移だけを採用
   - OCRの「2→3」誤読が後で「2」に戻った場合は3を棄却
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
  const now = new Date().toLocaleTimeString('ja-JP', { hour12: false });
  logEl.textContent = `[${now}] ${msg}\n` + logEl.textContent;
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
  return score ? `${score.home}-${score.away}` : '';
}

function sameScore(a, b) {
  return !!a && !!b && a.home === b.home && a.away === b.away;
}

function scoreDistance(a, b) {
  if (!a || !b) return 99;
  return Math.abs(a.home - b.home) + Math.abs(a.away - b.away);
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

  if (dh === 1 && da === 0) return 'minotani';
  if (dh === 0 && da === 1) return 'opponent';

  return null;
}

/* =========================================================
   動画選択
========================================================= */

fileInput.addEventListener('change', async () => {
  sourceFile = fileInput.files?.[0] || null;
  goals = [];

  results.innerHTML = '<p class="muted">まだ解析していません。</p>';

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
        () => finish(new Error('動画の読み込みがタイムアウトしました')),
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

        err ? reject(err) : resolve();
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

    status(`動画を読み込みました（${fmt(duration)}）`);

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

    const timer = setTimeout(
      () => finish(new Error('seek timeout')),
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

      err ? reject(err) : resolve();
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
     元動画 910×512 を基準に
     左上のスコア部分を切り出す。
  */

  const sx = Math.round(
    w * 145 / 910
  );

  const sy = 0;

  const sw = Math.round(
    w * 95 / 910
  );

  const sh = Math.round(
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
  if (ocrWorker) return ocrWorker;

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

    tessedit_pageseg_mode:
      '7'
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

  if (!m) return null;

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
        if (
          b.count !== a.count
        ) {
          return b.count - a.count;
        }

        return (
          b.lastTime -
          a.lastTime
        );
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

   最終20秒だけを見て最終スコアを決めない。
   試合全体を1回だけOCRして、
   時系列として扱う。
========================================================= */

async function scanScoreTimeline(interval) {
  const samples = [];

  const end =
    Math.max(
      0,
      duration - 0.25
    );

  log('------------------------------------');

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
        firstTime: item.time,
        lastTime: item.time,
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
   スコア軌跡の推定

   OCR結果をそのまま信用しない。

   ルール:
   1. スコアは減らない
   2. 1回の変化は1点だけ
   3. OCRが現在のスコアと違えば誤読コストを払う
   4. ゴールを増やすことにもコストを払う

   これにより

     2-0
     3-0 ← OCR誤読
     2-0

   を

     2-0 → 3-0 → 2-0

   とは解釈しない。
========================================================= */

function emissionCost(
  observed,
  state
) {
  if (!observed) {
    return 0.75;
  }

  if (
    sameScore(
      observed,
      state
    )
  ) {
    return 0;
  }

  const d =
    scoreDistance(
      observed,
      state
    );

  /*
     1点違いは比較的ありがちな
     OCR誤認識として扱う。
  */

  if (d === 1) {
    return 2.2;
  }

  if (d === 2) {
    return 4.0;
  }

  return 6.0 + d;
}

function inferScorePath(
  initialScore,
  samples
) {
  /*
     初期スコアより前の状態は無視する。
     0.5秒以降を時系列として使用。
  */

  const observed =
    samples
      .filter(
        x =>
          x.time >= 0.5 &&
          x.score
      )
      .sort(
        (a, b) =>
          a.time - b.time
      );

  if (!observed.length) {
    return {
      finalScore: {
        ...initialScore
      },
      transitions: []
    };
  }

  let maxHome =
    initialScore.home;

  let maxAway =
    initialScore.away;

  for (const x of observed) {
    maxHome =
      Math.max(
        maxHome,
        x.score.home
      );

    maxAway =
      Math.max(
        maxAway,
        x.score.away
      );
  }

  /*
     OCRの一瞬の「12-0」などで
     状態数が爆発しないよう上限。
  */

  maxHome =
    Math.min(
      10,
      maxHome
    );

  maxAway =
    Math.min(
      10,
      maxAway
    );

  const states = [];

  for (
    let h = initialScore.home;
    h <= maxHome;
    h++
  ) {
    for (
      let a = initialScore.away;
      a <= maxAway;
      a++
    ) {
      states.push({
        home: h,
        away: a
      });
    }
  }

  const key =
    s =>
      `${s.home}-${s.away}`;

  let dp =
    new Map();

  let parentHistory = [];

  /*
     最初の観測時点までは
     初期スコア固定。
  */

  for (const s of states) {
    dp.set(
      key(s),
      (
        s.home ===
          initialScore.home &&
        s.away ===
          initialScore.away
      )
        ? 0
        : Infinity
    );
  }

  /*
     OCR時系列を1点ずつ処理。
  */

  for (
    let i = 0;
    i < observed.length;
    i++
  ) {
    const item =
      observed[i];

    const next =
      new Map();

    const parents =
      new Map();

    for (const state of states) {
      const sk =
        key(state);

      let bestCost =
        Infinity;

      let bestParent =
        null;

      /*
         ① そのまま同じスコア
      */

      const same =
        dp.get(sk);

      if (
        Number.isFinite(
          same
        )
      ) {
        const c =
          same +
          emissionCost(
            item.score,
            state
          );

        if (
          c < bestCost
        ) {
          bestCost = c;
          bestParent = sk;
        }
      }

      /*
         ② 箕谷の1点

         ゴール追加には5.5のコスト。
         これを高めに設定することで、
         一瞬だけ「3-0」とOCRされた場合に
         余計なゴールを作りにくくする。
      */

      if (
        state.home >
        initialScore.home
      ) {
        const prev = {
          home:
            state.home - 1,
          away:
            state.away
        };

        const pk =
          key(prev);

        const pc =
          dp.get(pk);

        if (
          Number.isFinite(
            pc
          )
        ) {
          const c =
            pc +
            5.5 +
            emissionCost(
              item.score,
              state
            );

          if (
            c < bestCost
          ) {
            bestCost = c;
            bestParent = pk;
          }
        }
      }

      /*
         ③ 相手の1点
      */

      if (
        state.away >
        initialScore.away
      ) {
        const prev = {
          home:
            state.home,
          away:
            state.away - 1
        };

        const pk =
          key(prev);

        const pc =
          dp.get(pk);

        if (
          Number.isFinite(
            pc
          )
        ) {
          const c =
            pc +
            5.5 +
            emissionCost(
              item.score,
              state
            );

          if (
            c < bestCost
          ) {
            bestCost = c;
            bestParent = pk;
          }
        }
      }

      if (
        Number.isFinite(
          bestCost
        )
      ) {
        next.set(
          sk,
          bestCost
        );

        parents.set(
          sk,
          bestParent
        );
      }
    }

    dp = next;

    parentHistory.push(
      parents
    );
  }

  if (!dp.size) {
    return {
      finalScore: {
        ...initialScore
      },
      transitions: []
    };
  }

  /*
     最終状態を決定。

     同点に近い場合は
     低いスコアを優先する。
     これによりOCRの過大読みを抑える。
  */

  let bestKey =
    null;

  let bestCost =
    Infinity;

  for (
    const [
      sk,
      cost
    ] of dp.entries()
  ) {
    const [
      h,
      a
    ] =
      sk
        .split('-')
        .map(Number);

    const goalCount =
      (
        h -
        initialScore.home
      ) +
      (
        a -
        initialScore.away
      );

    const finalBias =
      goalCount * 0.08;

    const adjusted =
      cost +
      finalBias;

    if (
      adjusted <
        bestCost - 0.01 ||
      (
        Math.abs(
          adjusted -
          bestCost
        ) <= 0.01 &&
        (
          h + a
        ) <
        (
          Number(
            bestKey
              ?.split('-')[0] ||
              99
          ) +
          Number(
            bestKey
              ?.split('-')[1] ||
              99
          )
        )
      )
    ) {
      bestCost =
        adjusted;

      bestKey =
        sk;
    }
  }

  /*
     最適経路を逆算。
  */

  let stateKey =
    bestKey;

  const path =
    new Array(
      observed.length
    );

  for (
    let i =
      observed.length - 1;
    i >= 0;
    i--
  ) {
    const [
      h,
      a
    ] =
      stateKey
        .split('-')
        .map(Number);

    path[i] = {
      time:
        observed[i].time,

      score: {
        home: h,
        away: a
      }
    };

    const parent =
      parentHistory[i]
        .get(
          stateKey
        );

    if (!parent) {
      break;
    }

    stateKey =
      parent;
  }

  /*
     スコア変化だけを抽出。
  */

  const transitions = [];

  for (
    let i = 1;
    i < path.length;
    i++
  ) {
    if (
      !sameScore(
        path[i - 1].score,
        path[i].score
      )
    ) {
      const from =
        path[i - 1].score;

      const to =
        path[i].score;

      /*
         必ず1点だけの変化に限定。
      */

      if (
        isOneGoalChange(
          from,
          to
        )
      ) {
        transitions.push({
          roughTime:
            path[i].time,

          from: {
            ...from
          },

          to: {
            ...to
          },

          type:
            getGoalType(
              from,
              to
            )
        });
      }
    }
  }

  /*
     同じゴールを複数回記録しない。
  */

  const unique = [];

  for (
    const t of transitions
  ) {
    const prev =
      unique[
        unique.length - 1
      ];

    if (
      !prev ||
      !sameScore(
        prev.to,
        t.to
      )
    ) {
      unique.push(t);
    }
  }

  const finalParts =
    bestKey
      .split('-')
      .map(Number);

  return {
    finalScore: {
      home:
        finalParts[0],

      away:
        finalParts[1]
    },

    transitions:
      unique
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

  let firstNewScore =
    null;

  /*
     0.25秒刻みでゴール時刻を探す。
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
         新しいスコアが
         一時的な誤読ではないか確認。
      */

      let confirmation =
        0;

      for (
        let j = 1;
        j <= 2;
        j++
      ) {
        const s2 =
          await readScoreAt(
            Math.min(
              end,
              t +
                j * 0.25
            )
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
   ゴール検出
========================================================= */

async function detectGoalsFromTimeline(
  initialScore,
  samples
) {
  const inferred =
    inferScorePath(
      initialScore,
      samples
    );

  const finalScore =
    inferred.finalScore;

  const transitions =
    inferred.transitions;

  log(
    `------------------------------------`
  );

  log(
    `最終スコア（時系列補正後）: ` +
    `${scoreKey(finalScore)}`
  );

  const expected =
    (
      finalScore.home -
      initialScore.home
    ) +
    (
      finalScore.away -
      initialScore.away
    );

  log(
    `必要ゴール数: ${expected}本`
  );

  if (
    expected <= 0
  ) {
    return {
      finalScore,
      goals: []
    };
  }

  const goalsFound = [];

  for (
    let i = 0;
    i < transitions.length;
    i++
  ) {
    const tr =
      transitions[i];

    if (
      !isOneGoalChange(
        tr.from,
        tr.to
      )
    ) {
      continue;
    }

    const refined =
      await refineGoalTime(
        tr.roughTime,
        tr.from,
        tr.to
      );

    const goal = {
      time: refined,

      from:
        scoreKey(
          tr.from
        ),

      to:
        scoreKey(
          tr.to
        ),

      type:
        tr.type,

      home:
        tr.to.home,

      away:
        tr.to.away
    };

    goalsFound.push(
      goal
    );

    log(
      `⚽ GOAL ${goalsFound.length}: ` +
      `${goal.from} → ${goal.to} ` +
      `@ ${fmt(goal.time)} ` +
      `[${goal.type === 'minotani'
        ? '箕谷'
        : '相手'}]`
    );
  }

  /*
     推定最終スコアまでに必要な本数と
     実際に検出できた本数を比較。
  */

  if (
    goalsFound.length !==
    expected
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
    finalScore,
    goals: goalsFound
  };
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
      '<p class="muted">ゴールは検出されませんでした。</p>';

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
          ${g.from} → <strong>${g.to}</strong>
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

    try {
      progressEl.value =
        0;

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
         ① 初期スコア
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
         ② 全試合を1回だけOCR
      */

      status(
        '試合全体のスコア推移を確認中…'
      );

      const samples =
        await scanScoreTimeline(
          interval
        );

      progressEl.value =
        70;

      /*
         ③ 時系列補正
      */

      status(
        'OCR結果の矛盾を確認中…'
      );

      const analyzed =
        await detectGoalsFromTimeline(
          initialScore,
          samples
        );

      const finalScore =
        analyzed.finalScore;

      const allGoals =
        analyzed.goals;

      log(
        `最終スコア: ` +
        `${scoreKey(finalScore)}`
      );

      /*
         ④ 対象チーム
      */

      goals =
        filterGoals(
          allGoals,
          target
        );

      goals.sort(
        (a, b) =>
          a.time - b.time
      );

      log(
        '===================================='
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
            `${g.from} → ${g.to} ` +
            `@ ${fmt(g.time)} ` +
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
        `解析完了：${goals.length}ゴールを検出`
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
      scanBusy = false;

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
    if (
      ffmpegLoaded
    ) {
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
          `動画ファイルをFFmpegへ渡せませんでした: ${
            e.message || e
          }`
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

        if (
          result !== 0
        ) {
          throw new Error(
            `FFmpeg処理に失敗しました（終了コード: ${result}）`
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
         複数ゴールなら
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

      /*
         一時ファイル削除
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
   ダウンロード表示
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
