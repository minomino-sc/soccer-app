import { FFmpeg } from 'https://esm.sh/@ffmpeg/ffmpeg@0.12.10';
import { toBlobURL } from 'https://esm.sh/@ffmpeg/util@0.12.2';
import { createWorker } from 'https://esm.sh/tesseract.js@5.1.1';


const $ = (s) => document.querySelector(s);


const video = $('#video');

const canvas = $('#canvas');

const ctx =
  canvas.getContext(
    '2d',
    {
      willReadFrequently: true
    }
  );


const fileInput =
  $('#videoFile');

const scanBtn =
  $('#scanBtn');

const extractBtn =
  $('#extractBtn');

const loadEngineBtn =
  $('#loadEngineBtn');


const results =
  $('#results');

const logEl =
  $('#log');

const progressEl =
  $('#progress');

const statusEl =
  $('#status');


const targetEl =
  $('#targetTeam');

const beforeEl =
  $('#beforeSec');

const afterEl =
  $('#afterSec');

const intervalEl =
  $('#intervalSec');


let sourceFile = null;

let duration = 0;


/*
 * 最終的に表示するゴール
 */
let goals = [];


/*
 * 解析中に見つかった
 * 全ゴール候補
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
    new Date().toLocaleTimeString(
      'ja-JP',
      {
        hour12: false
      }
    );

  logEl.textContent =
    `[${now}] ${msg}\n` +
    logEl.textContent;
}


function status(msg) {

  statusEl.textContent =
    msg;
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
    resolve =>
      setTimeout(resolve, ms)
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

    allDetectedGoals = [];

    results.innerHTML =
      '<p class="muted">' +
      'まだ解析していません。' +
      '</p>';

    extractBtn.disabled =
      true;

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


    video.src =
      sourceUrl;

    video.load();


    status(
      '動画を読み込み中…'
    );


    try {

      await new Promise(
        (resolve, reject) => {

          let finished =
            false;


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


          const cleanup =
            () => {

              clearTimeout(
                timer
              );

              video.removeEventListener(
                'loadedmetadata',
                onLoaded
              );

              video.removeEventListener(
                'error',
                onError
              );

            };


          const finish =
            (err) => {

              if (finished) {
                return;
              }

              finished =
                true;

              cleanup();


              if (err) {
                reject(err);
              } else {
                resolve();
              }

            };


          const onLoaded =
            () => {

              finish();

            };


          const onError =
            () => {

              finish(
                new Error(
                  '動画を読み込めませんでした'
                )
              );

            };


          video.addEventListener(
            'loadedmetadata',
            onLoaded,
            {
              once: true
            }
          );


          video.addEventListener(
            'error',
            onError,
            {
              once: true
            }
          );

        }
      );


      duration =
        video.duration;


      $('#duration')
        .textContent =
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

      let done =
        false;


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


      const finish =
        (err) => {

          if (done) {
            return;
          }

          done =
            true;

          clearTimeout(
            timer
          );


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


      const onSeeked =
        () => {

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
   スコア表示部分
========================================================= */

function drawScoreCrop() {

  const w =
    video.videoWidth;

  const h =
    video.videoHeight;


  /*
   * 910×512動画を基準。
   *
   * スコア表示が入っている
   * 左上部分を使用。
   */
  const sx =
    Math.round(
      w * 120 / 910
    );

  const sy =
    0;

  const sw =
    Math.round(
      w * 145 / 910
    );

  const sh =
    Math.round(
      h * 70 / 512
    );


  canvas.width =
    580;

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
    580,
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


  /*
   * OCRが余計な数字を読んでも
   * 最初の「数字-数字」を採用。
   */
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


function scoreDiff(
  from,
  to
) {

  if (!from || !to) {
    return null;
  }


  return {

    home:
      to.home -
      from.home,

    away:
      to.away -
      from.away

  };
}


/*
 * 正常なゴールは
 *
 * 0-0 → 1-0
 * 0-0 → 0-1
 *
 * のどちらかだけ。
 */
function isValidGoalChange(
  from,
  to
) {

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

  if (
    target === 'both'
  ) {

    return [
      ...detectedGoals
    ];

  }


  if (
    target === 'minotani'
  ) {

    return detectedGoals.filter(
      g =>
        g.type ===
        'minotani'
    );

  }


  if (
    target === 'opponent'
  ) {

    return detectedGoals.filter(
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
        g.type ===
        'opponent'
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
   最終スコア取得
========================================================= */

async function readFinalScore() {

  const samples =
    [];


  /*
   * 最後の15秒から読む。
   */
  const sampleCount =
    8;


  const start =
    Math.max(
      0,
      duration - 15
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
        (
          duration -
          0.05
        ) -
        start
      ) *
      ratio;


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
   * 出現回数が最多のスコアを
   * 最終スコアとする。
   */
  const counts =
    {};


  for (
    const s of samples
  ) {

    const key =
      scoreKey(
        s.score
      );


    counts[key] =
      (
        counts[key] ||
        0
      ) + 1;

  }


  const keys =
    Object.keys(counts)
      .sort(
        (a, b) =>
          counts[b] -
          counts[a]
      );


  const key =
    keys[0];


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
   ゴール候補を最終スコアから厳密に整理
========================================================= */

function rebuildGoalSequence(
  detectedGoals,
  initialScore,
  finalScore
) {

  if (
    !initialScore ||
    !finalScore
  ) {

    return [];

  }


  const sorted =
    [
      ...detectedGoals
    ].sort(
      (a, b) =>
        a.time -
        b.time
    );


  log(
    `スコア列検証: ` +
    `${scoreKey(initialScore)} → ` +
    `${scoreKey(finalScore)}`
  );


  /*
   * =====================================================
   * 特に重要
   *
   * 最終スコアから必要なゴール数を計算。
   *
   * 例えば
   *
   * 0-0 → 1-0
   *
   * なら必要なのは
   * 箕谷ゴール1本だけ。
   * =====================================================
   */

  const requiredMinotani =
    Math.max(
      0,
      finalScore.home -
      initialScore.home
    );


  const requiredOpponent =
    Math.max(
      0,
      finalScore.away -
      initialScore.away
    );


  log(
    `必要ゴール数: ` +
    `箕谷${requiredMinotani} / ` +
    `相手${requiredOpponent}`
  );


  /*
   * すでに必要数を満たしている
   * 種類の候補は採用しない。
   */
  let minotaniCount = 0;

  let opponentCount = 0;


  const accepted = [];


  let currentScore =
    {
      ...initialScore
    };


  /*
   * 候補を時系列で処理。
   */
  for (
    const g of sorted
  ) {

    if (
      accepted.length >=
      requiredMinotani +
      requiredOpponent
    ) {

      break;

    }


    const from =
      String(g.from)
        .split('-');


    const to =
      String(g.to)
        .split('-');


    const fromScore = {

      home:
        Number(from[0]),

      away:
        Number(from[1])

    };


    const toScore = {

      home:
        Number(to[0]),

      away:
        Number(to[1])

    };


    /*
     * 現在のスコアと一致しない候補は
     * 誤OCRとして完全に除外。
     */
    if (
      scoreKey(fromScore) !==
      scoreKey(currentScore)
    ) {

      log(
        `❌ 除外: ${g.from} → ${g.to} ` +
        `@ ${fmt(g.time)} ` +
        `(現在${scoreKey(currentScore)})`
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

      continue;

    }


    /*
     * 最終スコアを超えるものは
     * 絶対に採用しない。
     */
    if (
      toScore.home >
        finalScore.home ||
      toScore.away >
        finalScore.away
    ) {

      log(
        `❌ 最終スコア超過: ` +
        `${g.from} → ${g.to} ` +
        `@ ${fmt(g.time)}`
      );

      continue;

    }


    const type =
      getGoalType(
        currentScore,
        toScore
      );


    /*
     * 必要ゴール数を超えない。
     */
    if (
      type ===
      'minotani' &&
      minotaniCount >=
      requiredMinotani
    ) {

      log(
        `❌ 箕谷ゴール必要数超過: ` +
        `${g.from} → ${g.to}`
      );

      continue;

    }


    if (
      type ===
      'opponent' &&
      opponentCount >=
      requiredOpponent
    ) {

      log(
        `❌ 相手ゴール必要数超過: ` +
        `${g.from} → ${g.to}`
      );

      continue;

    }


    /*
     * 採用。
     */
    accepted.push({

      ...g,

      from:
        scoreKey(
          currentScore
        ),

      to:
        scoreKey(
          toScore
        ),

      type

    });


    currentScore =
      {
        ...toScore
      };


    if (
      type ===
      'minotani'
    ) {

      minotaniCount++;

    } else if (
      type ===
      'opponent'
    ) {

      opponentCount++;

    }


    log(
      `✅ 採用: ` +
      `${scoreKey(
        fromScore
      )} → ` +
      `${scoreKey(
        toScore
      )} @ ${fmt(g.time)}`
    );

  }


  /*
   * =====================================================
   * 最終スコアまで到達したか確認
   * =====================================================
   */

  if (
    scoreKey(currentScore) ===
    scoreKey(finalScore)
  ) {

    log(
      `✅ 最終スコア一致: ` +
      `${scoreKey(currentScore)}`
    );

  } else {

    log(
      `⚠️ ゴール候補だけでは ` +
      `最終スコアに到達できません: ` +
      `${scoreKey(currentScore)} → ` +
      `${scoreKey(finalScore)}`
    );

  }


  return accepted;
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


    scanBusy =
      true;


    scanBtn.disabled =
      true;

    extractBtn.disabled =
      true;


    goals = [];

    allDetectedGoals = [];


    results.innerHTML =
      '';


    const interval =
      Math.max(
        1,
        Number(
          intervalEl.value
        ) || 1
      );


    const target =
      targetEl.value;


    /*
     * 同じ新スコアを
     * 6回連続で確認。
     *
     * 1秒間隔なら約6秒。
     */
    const REQUIRED_CONFIRMATIONS =
      6;


    /*
     * 同じゴールの二重検出防止。
     */
    const GOAL_COOLDOWN =
      20;


    let previousScore =
      null;


    let candidate =
      null;


    let initialScore =
      null;


    try {

      status(
        'スコア解析中…'
      );


      log(
        `解析開始 / ` +
        `間隔${interval}秒 / ` +
        `確認${REQUIRED_CONFIRMATIONS}回`
      );


      /*
       * =====================================================
       * 動画をスキャン
       * =====================================================
       */

      for (
        let t = 0;
        t < duration;
        t += interval
      ) {

        await seekTo(t);

        drawScoreCrop();


        let score =
          null;


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
           * -----------------------------------------------
           * 初期スコア
           * -----------------------------------------------
           */

          if (!previousScore) {

            previousScore =
              {
                ...score
              };


            initialScore =
              {
                ...score
              };


            log(
              `初期スコア: ` +
              `${key} @ ${fmt(t)}`
            );

          }


          /*
           * -----------------------------------------------
           * 同じスコア
           * -----------------------------------------------
           */

          else if (
            key ===
            scoreKey(
              previousScore
            )
          ) {

            /*
             * 候補が戻った場合
             * まだ確定していなければ破棄。
             */
            if (candidate) {

              if (
                candidate.count <
                REQUIRED_CONFIRMATIONS
              ) {

                log(
                  `候補破棄: ` +
                  `${candidate.key} @ ` +
                  `${fmt(candidate.firstSeen)}`
                );

              }


              /*
               * ここで候補を消す。
               */
              candidate =
                null;

            }

          }


          /*
           * -----------------------------------------------
           * スコアが変化
           * -----------------------------------------------
           */

          else {

            const valid =
              isValidGoalChange(
                previousScore,
                score
              );


            /*
             * +1点以外は誤OCR。
             */
            if (!valid) {

              log(
                `無効OCR: ` +
                `${scoreKey(previousScore)} → ` +
                `${key} @ ${fmt(t)}`
              );


              candidate =
                null;

            }


            /*
             * 正常な+1点変化
             */
            else {

              const type =
                getGoalType(
                  previousScore,
                  score
                );


              /*
               * 同じ候補を継続確認。
               */
              if (
                candidate &&
                candidate.key === key
              ) {

                candidate.count++;

                candidate.lastSeen =
                  t;

              }


              /*
               * 新しい候補。
               */
              else {

                candidate = {

                  key,

                  from:
                    scoreKey(
                      previousScore
                    ),

                  to:
                    key,

                  type,

                  firstSeen:
                    t,

                  lastSeen:
                    t,

                  count:
                    1

                };


                log(
                  `⚠️ ゴール候補: ` +
                  `${candidate.from} → ` +
                  `${candidate.to} ` +
                  `@ ${fmt(t)}`
                );

              }


              /*
               * -----------------------------------------
               * 6回連続確認
               * -----------------------------------------
               */

              if (
                candidate.count >=
                REQUIRED_CONFIRMATIONS
              ) {

                const duplicate =
                  allDetectedGoals.some(
                    g =>
                      Math.abs(
                        g.time -
                        candidate.firstSeen
                      ) <
                      GOAL_COOLDOWN
                  );


                if (!duplicate) {

                  /*
                   * ★時刻を候補の中央にする。
                   *
                   * firstSeenだけでは、
                   * OCRがスコア変化を認識した
                   * 最初の時刻に偏る。
                   */
                  const changeTime =
                    (
                      candidate.firstSeen +
                      candidate.lastSeen
                    ) / 2;


                  allDetectedGoals.push({

                    time:
                      changeTime,

                    from:
                      candidate.from,

                    to:
                      candidate.to,

                    type:
                      candidate.type,

                    confidence:
                      candidate.count

                  });


                  log(
                    `⚽ ゴール候補確定: ` +
                    `${candidate.from} → ` +
                    `${candidate.to} ` +
                    `@ ${fmt(changeTime)}`
                  );

                }


                /*
                 * 現在スコアを更新。
                 */
                previousScore =
                  {
                    home:
                      score.home,

                    away:
                      score.away
                  };


                candidate =
                  null;

              }

            }

          }

        }


        const pct =
          Math.round(
            (
              t /
              duration
            ) *
            100
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
          `動画最終スコア: ` +
          `${scoreKey(finalScore)}`
        );

      } else {

        log(
          '最終スコアを取得できませんでした'
        );

      }


      /* =====================================================
         スコア整合性
      ===================================================== */

      let validAllGoals =
        [];


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

      }


      /*
       * =====================================================
       * 対象チームでフィルター
       * =====================================================
       */

      goals =
        filterGoalsByTarget(
          validAllGoals,
          target
        );


      goals.sort(
        (a, b) =>
          a.time -
          b.time
      );


      /* =====================================================
         結果
      ===================================================== */

      log(
        `検出候補: ` +
        `${allDetectedGoals.length}本`
      );


      log(
        `整合性通過: ` +
        `${validAllGoals.length}本`
      );


      log(
        `対象ゴール: ` +
        `${goals.length}本`
      );


      renderResults();


      extractBtn.disabled =
        goals.length === 0;


      status(
        `解析完了：${goals.length}ゴール`
      );


      log(
        `解析完了`
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


      const clipNames =
        [];


      for (
        let i = 0;
        i < goals.length;
        i++
      ) {

        const g =
          goals[i];


        /*
         * ゴール候補時刻の
         * 前15秒から開始。
         */
        const start =
          Math.max(
            0,
            g.time -
            before
          );


        const len =
          Math.min(
            before +
            after,
            duration -
            start
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
        clipNames.length >
        1
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

      }


      else if (
        clipNames.length ===
        1
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
    g.type ===
    'opponent'
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
