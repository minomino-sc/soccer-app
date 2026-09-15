import { FFmpeg } from 'https://esm.sh/@ffmpeg/ffmpeg@0.12.10';
import { toBlobURL } from 'https://esm.sh/@ffmpeg/util@0.12.2';
import { createWorker } from 'https://esm.sh/tesseract.js@5.1.1';

const $ = (id) => document.getElementById(id);

const videoInput = $('videoInput');
const video = $('video');
const videoInfo = $('videoInfo');
const analyzeBtn = $('analyzeBtn');
const progress = $('progress');
const progressText = $('progressText');
const result = $('result');
const log = $('log');

let sourceFile = null;
let sourceUrl = null;
let ocrWorker = null;
let ffmpeg = null;
let duration = 0;
let analyzing = false;
let cancelled = false;

// ===============================
// 設定
// ===============================

const ANALYZE_INTERVAL = 2;       // 2秒ごとに解析
const GOAL_BEFORE = 15;           // ゴール15秒前
const GOAL_AFTER = 10;            // ゴール10秒後
const CONFIRM_COUNT = 3;          // スコア変化を3回確認
const MIN_GOAL_GAP = 20;          // ゴール間隔の最低秒数

// 910x512 の動画で調整済み
const SCORE_CROP = {
  x: 145 / 910,
  y: 0,
  width: 95 / 910,
  height: 70 / 512
};

const OCR_WIDTH = 380;
const OCR_HEIGHT = 280;

// ===============================
// ログ
// ===============================

function addLog(message) {
  console.log(message);

  if (!log) return;

  const line = document.createElement('div');
  line.textContent = message;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

// ===============================
// 時間表示
// ===============================

function formatTime(sec) {
  if (!Number.isFinite(sec)) return '--:--';

  sec = Math.max(0, Math.floor(sec));

  const m = Math.floor(sec / 60);
  const s = sec % 60;

  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ===============================
// 動画読み込み
// ===============================

videoInput?.addEventListener('change', () => {
  const file = videoInput.files?.[0];

  if (!file) return;

  sourceFile = file;

  if (sourceUrl) {
    URL.revokeObjectURL(sourceUrl);
  }

  sourceUrl = URL.createObjectURL(file);

  video.src = sourceUrl;
  video.load();

  addLog(`動画読み込み: ${file.name}`);
  addLog(`ファイルサイズ: ${(file.size / 1024 / 1024).toFixed(1)} MB`);

  video.onloadedmetadata = () => {
    duration = video.duration;

    if (videoInfo) {
      videoInfo.textContent =
        `${formatTime(duration)} / ${video.videoWidth}×${video.videoHeight}`;
    }

    addLog(
      `動画情報: ${formatTime(duration)} / ` +
      `${video.videoWidth}×${video.videoHeight}`
    );

    if (analyzeBtn) {
      analyzeBtn.disabled = false;
    }
  };
});

// ===============================
// フレーム取得
// ===============================

function captureScoreFrame() {
  const canvas = document.createElement('canvas');

  canvas.width = OCR_WIDTH;
  canvas.height = OCR_HEIGHT;

  const ctx = canvas.getContext('2d', {
    willReadFrequently: true
  });

  const x = Math.floor(video.videoWidth * SCORE_CROP.x);
  const y = Math.floor(video.videoHeight * SCORE_CROP.y);
  const w = Math.floor(video.videoWidth * SCORE_CROP.width);
  const h = Math.floor(video.videoHeight * SCORE_CROP.height);

  ctx.drawImage(
    video,
    x,
    y,
    w,
    h,
    0,
    0,
    OCR_WIDTH,
    OCR_HEIGHT
  );

  return canvas;
}

// ===============================
// OCR
// ===============================

async function initOCR() {
  if (ocrWorker) return;

  addLog('OCRエンジンを準備しています…');

  ocrWorker = await createWorker('eng', 1, {
    logger: (info) => {
      if (
        info.status === 'recognizing text' &&
        typeof info.progress === 'number'
      ) {
        const p = Math.round(info.progress * 100);

        if (progressText) {
          progressText.textContent = `OCR準備・解析 ${p}%`;
        }
      }
    }
  });

  await ocrWorker.setParameters({
    tessedit_char_whitelist: '0123456789-',
    tessedit_pageseg_mode: '7'
  });

  addLog('OCRエンジン準備完了');
}

// ===============================
// スコア認識
// ===============================

async function recognizeScore() {
  const canvas = captureScoreFrame();

  const { data } = await ocrWorker.recognize(canvas);

  const text = (data.text || '')
    .replace(/\s/g, '')
    .replace(/[ー−—_]/g, '-');

  addLog(`OCR: "${text}"`);

  const match = text.match(/(\d{1,2})-(\d{1,2})/);

  if (!match) {
    return null;
  }

  return {
    left: Number(match[1]),
    right: Number(match[2])
  };
}

// ===============================
// 指定時刻へ移動
// ===============================

function seekTo(time) {
  return new Promise((resolve, reject) => {
    const target = Math.max(
      0,
      Math.min(time, Math.max(0, duration - 0.05))
    );

    let done = false;

    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);

      if (timer) {
        clearTimeout(timer);
      }
    };

    const finish = () => {
      if (done) return;

      done = true;
      cleanup();
      resolve();
    };

    const onSeeked = () => {
      finish();
    };

    const onError = () => {
      if (done) return;

      done = true;
      cleanup();
      reject(new Error('動画の移動に失敗しました'));
    };

    const timer = setTimeout(() => {
      if (done) return;

      // iPhone Safariではseekedが遅れる場合があるため、
      // currentTimeが十分近ければ成功扱い
      if (Math.abs(video.currentTime - target) < 1.0) {
        finish();
      } else {
        done = true;
        cleanup();
        reject(
          new Error(
            `動画位置の移動に失敗しました: ` +
            `${video.currentTime.toFixed(1)} → ${target.toFixed(1)}`
          )
        );
      }
    }, 5000);

    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });

    video.currentTime = target;
  });
}

// ===============================
// スコア変化判定
// ===============================

function isValidScoreChange(previous, current) {
  if (!previous || !current) {
    return false;
  }

  // 同じスコア
  if (
    previous.left === current.left &&
    previous.right === current.right
  ) {
    return false;
  }

  // 左だけ +1
  const leftGoal =
    current.left === previous.left + 1 &&
    current.right === previous.right;

  // 右だけ +1
  const rightGoal =
    current.right === previous.right + 1 &&
    current.left === previous.left;

  return leftGoal || rightGoal;
}

// ===============================
// ゴール解析
// ===============================

async function analyzeGoals() {
  if (!sourceFile) {
    throw new Error('動画が選択されていません');
  }

  if (analyzing) return;

  analyzing = true;
  cancelled = false;

  if (analyzeBtn) {
    analyzeBtn.disabled = true;
  }

  if (result) {
    result.innerHTML = '';
  }

  if (log) {
    log.innerHTML = '';
  }

  try {
    await initOCR();

    addLog('==============================');
    addLog('ゴール解析を開始します');
    addLog(`解析間隔: ${ANALYZE_INTERVAL}秒`);
    addLog(`ゴール動画: ${GOAL_BEFORE}秒前 ～ ${GOAL_AFTER}秒後`);
    addLog('==============================');

    const detectedGoals = [];

    let previousScore = null;
    let candidateScore = null;
    let candidateCount = 0;
    let lastGoalTime = -Infinity;

    const totalSteps =
      Math.ceil(duration / ANALYZE_INTERVAL);

    let step = 0;

    for (
      let currentTime = 0;
      currentTime < duration;
      currentTime += ANALYZE_INTERVAL
    ) {
      if (cancelled) {
        addLog('解析を中止しました');
        break;
      }

      step++;

      const percent = Math.min(
        100,
        Math.round((step / totalSteps) * 100)
      );

      if (progress) {
        progress.value = percent;
      }

      if (progressText) {
        progressText.textContent =
          `解析中 ${percent}%　${formatTime(currentTime)} / ${formatTime(duration)}`;
      }

      addLog(
        `解析 ${formatTime(currentTime)} / ${formatTime(duration)}`
      );

      try {
        await seekTo(currentTime);
      } catch (error) {
        addLog(`⚠️ ${error.message}`);
        continue;
      }

      // seek直後にフレームが安定するため少し待つ
      await new Promise(resolve =>
        setTimeout(resolve, 80)
      );

      let score = null;

      try {
        score = await recognizeScore();
      } catch (error) {
        addLog(`⚠️ OCR失敗: ${error.message}`);
        continue;
      }

      if (!score) {
        continue;
      }

      addLog(
        `スコア認識: ${score.left}-${score.right}`
      );

      // 初回
      if (!previousScore) {
        previousScore = score;
        candidateScore = null;
        candidateCount = 0;

        addLog(
          `初期スコアを ${score.left}-${score.right} に設定`
        );

        continue;
      }

      // 同じスコア
      if (
        score.left === previousScore.left &&
        score.right === previousScore.right
      ) {
        candidateScore = null;
        candidateCount = 0;
        continue;
      }

      // まず候補を作る
      if (
        !candidateScore ||
        candidateScore.left !== score.left ||
        candidateScore.right !== score.right
      ) {
        candidateScore = score;
        candidateCount = 1;

        addLog(
          `スコア変化候補: ` +
          `${previousScore.left}-${previousScore.right} → ` +
          `${score.left}-${score.right} ` +
          `(1/${CONFIRM_COUNT})`
        );

        continue;
      }

      candidateCount++;

      addLog(
        `スコア変化確認: ` +
        `${score.left}-${score.right} ` +
        `(${candidateCount}/${CONFIRM_COUNT})`
      );

      if (candidateCount < CONFIRM_COUNT) {
        continue;
      }

      // ゴール判定
      if (isValidScoreChange(previousScore, candidateScore)) {
        if (
          currentTime - lastGoalTime >= MIN_GOAL_GAP
        ) {
          const goal = {
            time: currentTime,
            scoreBefore: {
              ...previousScore
            },
            scoreAfter: {
              ...candidateScore
            },
            start: Math.max(
              0,
              currentTime - GOAL_BEFORE
            ),
            end: Math.min(
              duration,
              currentTime + GOAL_AFTER
            )
          };

          detectedGoals.push(goal);
          lastGoalTime = currentTime;

          addLog(
            `🎯 GOAL検出！ ` +
            `${goal.scoreBefore.left}-${goal.scoreBefore.right}` +
            ` → ` +
            `${goal.scoreAfter.left}-${goal.scoreAfter.right}` +
            ` / ${formatTime(currentTime)}`
          );
        }
      } else {
        // スコアが戻った場合など
        addLog(
          `スコア変化をリセット: ` +
          `${previousScore.left}-${previousScore.right} → ` +
          `${candidateScore.left}-${candidateScore.right}`
        );
      }

      // スコア更新
      //
      // 大きくスコアが変わった場合は、
      // 次回の解析で改めて基準を作る。
      if (
        candidateScore.left >= previousScore.left &&
        candidateScore.right >= previousScore.right
      ) {
        previousScore = {
          ...candidateScore
        };
      } else {
        previousScore = {
          ...score
        };
      }

      candidateScore = null;
      candidateCount = 0;
    }

    if (!cancelled) {
      if (progress) {
        progress.value = 100;
      }

      if (progressText) {
        progressText.textContent =
          `解析完了　ゴール ${detectedGoals.length}件`;
      }

      addLog('==============================');
      addLog(
        `解析完了：ゴール ${detectedGoals.length}件`
      );
      addLog('==============================');

      renderGoals(detectedGoals);

      if (detectedGoals.length > 0) {
        await createGoalVideos(detectedGoals);
      } else {
        if (result) {
          result.innerHTML =
            '<p>ゴールを検出できませんでした。</p>';
        }
      }
    }

  } catch (error) {
    console.error(error);

    addLog(`❌ エラー: ${error.message}`);

    if (progressText) {
      progressText.textContent =
        `解析エラー: ${error.message}`;
    }

    if (result) {
      result.innerHTML =
        `<p>解析に失敗しました。<br>${error.message}</p>`;
    }

  } finally {
    analyzing = false;

    if (analyzeBtn) {
      analyzeBtn.disabled = false;
    }
  }
}

// ===============================
// 結果表示
// ===============================

function renderGoals(goals) {
  if (!result) return;

  result.innerHTML = '';

  if (!goals.length) {
    result.innerHTML =
      '<p>ゴールは検出されませんでした。</p>';
    return;
  }

  const title = document.createElement('h3');
  title.textContent =
    `🎯 ゴール検出 ${goals.length}件`;

  result.appendChild(title);

  goals.forEach((goal, index) => {
    const div = document.createElement('div');

    div.className = 'goal-result';

    div.innerHTML = `
      <strong>GOAL ${index + 1}</strong><br>
      ${formatTime(goal.start)}
      ～ ${formatTime(goal.end)}
      <br>
      ${goal.scoreBefore.left}-${goal.scoreBefore.right}
      →
      ${goal.scoreAfter.left}-${goal.scoreAfter.right}
    `;

    result.appendChild(div);
  });
}

// ===============================
// FFmpeg準備
// ===============================

async function initFFmpeg() {
  if (ffmpeg) return;

  addLog('動画切り出しエンジンを準備しています…');

  ffmpeg = new FFmpeg();

  ffmpeg.on('log', ({ message }) => {
    console.log('[FFmpeg]', message);
  });

  const baseURL =
    'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd';

  await ffmpeg.load({
    coreURL: await toBlobURL(
      `${baseURL}/ffmpeg-core.js`,
      'text/javascript'
    ),
    wasmURL: await toBlobURL(
      `${baseURL}/ffmpeg-core.wasm`,
      'application/wasm'
    )
  });

  addLog('動画切り出しエンジン準備完了');
}

// ===============================
// ゴール動画作成
// ===============================

async function createGoalVideos(goals) {
  await initFFmpeg();

  const inputName =
    sourceFile.name.toLowerCase().endsWith('.mov')
      ? 'input.mov'
      : 'input.mp4';

  addLog('元動画をFFmpegへ読み込みます…');

  // WORKERFSは使用しない
  // iPhone Safari対策として直接メモリへ書き込む
  const inputData =
    new Uint8Array(await sourceFile.arrayBuffer());

  await ffmpeg.writeFile(
    inputName,
    inputData
  );

  addLog(
    `FFmpeg入力完了: ` +
    `${(inputData.byteLength / 1024 / 1024).toFixed(1)} MB`
  );

  const outputFiles = [];

  for (let i = 0; i < goals.length; i++) {
    if (cancelled) break;

    const goal = goals[i];

    const outputName =
      `goal_${String(i + 1).padStart(2, '0')}.mp4`;

    addLog(
      `🎬 ゴール動画 ${i + 1}/${goals.length} を作成中…`
    );

    if (progressText) {
      progressText.textContent =
        `ゴール動画作成 ${i + 1}/${goals.length}`;
    }

    await ffmpeg.exec([
      '-ss',
      goal.start.toFixed(2),
      '-i',
      inputName,
      '-t',
      (goal.end - goal.start).toFixed(2),
      '-map',
      '0:v:0',
      '-map',
      '0:a?',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-c:a',
      'aac',
      '-movflags',
      '+faststart',
      outputName
    ]);

    const data =
      await ffmpeg.readFile(outputName);

    const blob =
      new Blob(
        [data.buffer],
        { type: 'video/mp4' }
      );

    const url =
      URL.createObjectURL(blob);

    outputFiles.push({
      name: outputName,
      url,
      blob,
      goal
    });

    addLog(
      `✅ ゴール動画 ${i + 1} 完成`
    );

    await ffmpeg.deleteFile(outputName);
  }

  renderVideoResults(outputFiles);
}

// ===============================
// 作成動画表示
// ===============================

function renderVideoResults(files) {
  if (!result) return;

  const title = document.createElement('h3');

  title.textContent =
    '🎬 ゴール動画';

  result.appendChild(title);

  files.forEach((file, index) => {
    const box =
      document.createElement('div');

    box.className =
      'goal-video-result';

    const heading =
      document.createElement('h4');

    heading.textContent =
      `GOAL ${index + 1}`;

    const videoElement =
      document.createElement('video');

    videoElement.src = file.url;
    videoElement.controls = true;
    videoElement.playsInline = true;
    videoElement.preload = 'metadata';

    const download =
      document.createElement('a');

    download.href = file.url;
    download.download = file.name;
    download.textContent =
      `⬇️ ${file.name}`;

    download.style.display = 'inline-block';
    download.style.marginTop = '10px';

    box.appendChild(heading);
    box.appendChild(videoElement);
    box.appendChild(download);

    result.appendChild(box);
  });

  // 1本ならまとめ動画作成
  if (files.length === 1) {
    addLog('ゴール動画の作成が完了しました');
  }
}

// ===============================
// 解析開始
// ===============================

analyzeBtn?.addEventListener(
  'click',
  async () => {
    await analyzeGoals();
  }
);

// ===============================
// ページを離れる場合
// ===============================

window.addEventListener(
  'beforeunload',
  () => {
    cancelled = true;

    if (sourceUrl) {
      URL.revokeObjectURL(sourceUrl);
    }
  }
);
