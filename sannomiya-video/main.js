
/* =========================================================
   神戸三宮FC 動画共有システム
   ・管理者のみ動画一覧を表示
   ・動画一覧を登録年／月で管理
   ・試合動画／ハイライトを年→月→動画で選択
   ・動画登録／編集／削除
   ・試合結果登録／編集／削除
   ・PKスコア
   ・得点／失点時間の指定再生
   ・月別表示／検索／成績集計
   ・バックアップ／復元
   保存先：sannomiyaVideos / sannomiyaScores
========================================================= */

import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =========================================================
   Firebase設定
========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyDMJfAd5BffteapT51ZU06VP-XDReFSwY",
  authDomain: "minotani-sc-app.firebaseapp.com",
  projectId: "minotani-sc-app",
  storageBucket: "minotani-sc-app.firebasestorage.app",
  messagingSenderId: "757066295000",
  appId: "1:757066295000:web:1c7a90f968af75d26099ad"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const videosCollection = collection(db, "sannomiyaVideos");
const scoresCollection = collection(db, "sannomiyaScores");

/* =========================================================
   ログイン設定
========================================================= */

const VIEWER_ID = "神戸三宮FC";
const VIEWER_PASSWORD = "KOBE";

const ADMIN_ID = "神戸三宮FC_ADMIN";
const ADMIN_PASSWORD = "KOBE_KOBE-ADMIN";

/* =========================================================
   状態管理
========================================================= */

let currentRole = "";
let currentTab = "scores";

let editingVideoId = null;
let editingScoreId = null;

let videoCache = [];
let scoreCache = [];

const collapsedMonths = new Set();

const $ = id => document.getElementById(id);

/* =========================================================
   共通処理
========================================================= */

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function setMessage(id, message, type = "") {
  const element = $(id);
  if (!element) return;

  element.textContent = message;
  element.className = `status ${type}`.trim();
}

function show(element, visible) {
  if (!element) return;

  element.hidden = !visible;
  element.classList.toggle("hidden", !visible);
}

function requireAdmin() {
  if (currentRole === "admin") return true;

  alert("管理者アカウントでログインしてください。");
  return false;
}

/* =========================================================
   ログイン
========================================================= */

$("loginForm").addEventListener("submit", event => {
  event.preventDefault();

  const id = $("loginId").value.trim();
  const password = $("password").value;

  if (id === ADMIN_ID && password === ADMIN_PASSWORD) {
    setLoggedIn("admin");
    return;
  }

  if (id === VIEWER_ID && password === VIEWER_PASSWORD) {
    setLoggedIn("viewer");
    return;
  }

  setMessage(
    "loginMessage",
    "ログインIDまたはパスワードが違います。",
    "error"
  );
});

function setLoggedIn(role) {
  currentRole = role;

  show($("loginPanel"), false);
  show($("userPanel"), true);
  show($("adminPanel"), role === "admin");
  show($("contentPanel"), true);

  /*
   * 動画一覧タブは管理者だけに表示
   */
  show($("videosTab"), role === "admin");

  $("loginState").textContent =
    role === "admin"
      ? "管理者としてログイン中"
      : "閲覧用アカウントでログイン中";

  $("roleDescription").textContent =
    role === "admin"
      ? "動画・試合結果の登録、編集、削除ができます。"
      : "試合結果・試合動画・ゴールハイライトを閲覧できます。";

  /*
   * 一般利用者は試合結果から開始
   * 管理者は動画一覧から開始
   */
  switchTab(role === "admin" ? "videos" : "scores");

  setMessage("loginMessage", "");
  loadAll();
}

$("logout").addEventListener("click", () => {
  currentRole = "";
  editingVideoId = null;
  editingScoreId = null;

  show($("loginPanel"), true);
  show($("userPanel"), false);
  show($("adminPanel"), false);
  show($("contentPanel"), false);

  $("loginForm").reset();

  resetVideoForm();
  resetMatchForm();

  setMessage(
    "loginMessage",
    "ログアウトしました。",
    "success"
  );
});

/* =========================================================
   URL・YouTube関連
========================================================= */

function safeUrl(raw) {
  try {
    const url = new URL(String(raw).trim());

    if (
      url.protocol !== "https:" &&
      url.protocol !== "http:"
    ) {
      return "";
    }

    return url.href;
  } catch {
    return "";
  }
}

function youtubeId(raw) {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();

    if (
      host === "youtu.be" ||
      host.endsWith(".youtu.be")
    ) {
      return url.pathname.split("/").filter(Boolean)[0] || "";
    }

    if (
      host === "youtube.com" ||
      host.endsWith(".youtube.com")
    ) {
      if (url.pathname === "/watch") {
        return url.searchParams.get("v") || "";
      }

      const parts = url.pathname.split("/").filter(Boolean);

      if (
        ["embed", "shorts", "live"].includes(parts[0])
      ) {
        return parts[1] || "";
      }
    }
  } catch {
    return "";
  }

  return "";
}

function youtubeEmbedUrl(raw, startSeconds = 0) {
  const id = youtubeId(raw);
  if (!id) return "";

  const seconds = Math.max(
    0,
    Math.floor(Number(startSeconds) || 0)
  );

  return (
    `https://www.youtube-nocookie.com/embed/` +
    `${encodeURIComponent(id)}?rel=0&playsinline=1&start=${seconds}`
  );
}

function youtubeTimestampUrl(raw, startSeconds = 0) {
  const id = youtubeId(raw);
  if (!id) return "";

  const seconds = Math.max(
    0,
    Math.floor(Number(startSeconds) || 0)
  );

  return `https://youtu.be/${encodeURIComponent(id)}?t=${seconds}`;
}

function externalVideoLink(raw, label) {
  const url = safeUrl(raw);
  if (!url) return "";

  return `
    <a
      class="link-button"
      href="${escapeHtml(url)}"
      target="_blank"
      rel="noopener noreferrer">
      ${escapeHtml(label)}
    </a>
  `;
}

/* =========================================================
   動画カテゴリー
========================================================= */

function categoryLabel(category) {
  if (category === "match") return "試合動画";
  if (category === "highlight") return "ゴールハイライト";

  return "その他";
}

function getVideoCategory(video) {
  return video.category || video.videoType || "other";
}

/* =========================================================
   動画の登録日時を年月に変換
   createdAtを優先し、なければupdatedAtを使用
========================================================= */

function timestampMillis(value) {
  if (!value) return 0;

  if (typeof value.toDate === "function") {
    return value.toDate().getTime();
  }

  if (typeof value.seconds === "number") {
    return value.seconds * 1000;
  }

  if (typeof value === "string") {
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : 0;
  }

  if (typeof value === "number") {
    return value;
  }

  return 0;
}

function videoDateMillis(video) {
  return (
    timestampMillis(video.createdAt) ||
    timestampMillis(video.updatedAt) ||
    0
  );
}

function videoYearMonth(video) {
  const millis = videoDateMillis(video);

  if (!millis) {
    return {
      year: "未設定",
      month: "未設定",
      key: "未設定"
    };
  }

  const date = new Date(millis);

  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return {
    year,
    month,
    key: `${year}-${month}`
  };
}

function sortVideosNewestFirst(list) {
  return [...list].sort(
    (a, b) => videoDateMillis(b) - videoDateMillis(a)
  );
}

function videosForCategory(category) {
  return sortVideosNewestFirst(
    videoCache.filter(video =>
      getVideoCategory(video) === category
    )
  );
}

/* =========================================================
   年・月セレクト共通処理
========================================================= */

function setSelectOptions(select, values, placeholder, selectedValue = "") {
  if (!select) return;

  select.replaceChildren();

  const first = document.createElement("option");
  first.value = "";
  first.textContent = placeholder;
  select.appendChild(first);

  for (const item of values) {
    const option = document.createElement("option");

    if (typeof item === "string") {
      option.value = item;
      option.textContent = item === "未設定"
        ? "登録年月未設定"
        : item;
    } else {
      option.value = item.value;
      option.textContent = item.label;
    }

    select.appendChild(option);
  }

  if (
    selectedValue &&
    [...select.options].some(option => option.value === selectedValue)
  ) {
    select.value = selectedValue;
  }
}

function yearsForVideos(videos) {
  const years = new Set();

  for (const video of videos) {
    years.add(videoYearMonth(video).year);
  }

  return [...years].sort((a, b) => {
    if (a === "未設定") return 1;
    if (b === "未設定") return -1;
    return Number(b) - Number(a);
  });
}

function monthsForVideos(videos, year) {
  const months = new Set();

  for (const video of videos) {
    const date = videoYearMonth(video);

    if (date.year === year) {
      months.add(date.month);
    }
  }

  return [...months].sort((a, b) => {
    if (a === "未設定") return 1;
    if (b === "未設定") return -1;
    return Number(a) - Number(b);
  });
}

function latestYearMonth(videos) {
  const sorted = sortVideosNewestFirst(videos);

  if (!sorted.length) {
    return { year: "", month: "" };
  }

  const date = videoYearMonth(sorted[0]);

  return {
    year: date.year,
    month: date.month
  };
}

/* =========================================================
   動画一覧の年・月フィルター
========================================================= */

function populateVideoListFilters() {
  const yearSelect = $("videoYearFilter");
  const monthSelect = $("videoMonthFilter");

  if (!yearSelect || !monthSelect) return;

  const oldYear = yearSelect.value;
  const oldMonth = monthSelect.value;

  const years = yearsForVideos(videoCache);

  let selectedYear = years.includes(oldYear)
    ? oldYear
    : latestYearMonth(videoCache).year;

  if (!selectedYear && years.length) {
    selectedYear = years[0];
  }

  setSelectOptions(
    yearSelect,
    years,
    "年を選択",
    selectedYear
  );

  const months = selectedYear
    ? monthsForVideos(videoCache, selectedYear)
    : [];

  let selectedMonth = months.includes(oldMonth)
    ? oldMonth
    : latestYearMonth(
        videoCache.filter(video =>
          videoYearMonth(video).year === selectedYear
        )
      ).month;

  if (!selectedMonth && months.length) {
    selectedMonth = months[0];
  }

  setSelectOptions(
    monthSelect,
    months,
    "月を選択",
    selectedMonth
  );
}

$("videoYearFilter")?.addEventListener("change", () => {
  const year = $("videoYearFilter").value;
  const months = monthsForVideos(videoCache, year);

  setSelectOptions(
    $("videoMonthFilter"),
    months,
    "月を選択",
    months[0] || ""
  );

  renderVideos();
});

$("videoMonthFilter")?.addEventListener("change", renderVideos);

/* =========================================================
   試合動画・ハイライトの選択欄
========================================================= */

function findRegisteredVideo(category, selectedId = "", legacyUrl = "") {
  if (selectedId) {
    const byId = videoCache.find(video =>
      video.id === selectedId &&
      getVideoCategory(video) === category
    );

    if (byId) return byId;
  }

  const normalizedUrl = safeUrl(legacyUrl);

  if (normalizedUrl) {
    return videoCache.find(video =>
      getVideoCategory(video) === category &&
      safeUrl(video.url || video.videoUrl || "") === normalizedUrl
    ) || null;
  }

  return null;
}

function populateVideoChoice(
  prefix,
  category,
  selectedId = "",
  legacyUrl = ""
) {
  const yearSelect = $(`${prefix}Year`);
  const monthSelect = $(`${prefix}Month`);
  const videoSelect = $(
    prefix === "matchVideo" ? "matchVideo" : "highlightVideoUrl"
  );

  if (!yearSelect || !monthSelect || !videoSelect) return;

  const categoryVideos = videosForCategory(category);
  const selectedVideo = findRegisteredVideo(
    category,
    selectedId,
    legacyUrl
  );

  const oldYear = yearSelect.value;
  const oldMonth = monthSelect.value;

  const selectedDate = selectedVideo
    ? videoYearMonth(selectedVideo)
    : null;

  const years = yearsForVideos(categoryVideos);

  let selectedYear =
    selectedDate?.year ||
    (years.includes(oldYear) ? oldYear : "") ||
    latestYearMonth(categoryVideos).year;

  if (!selectedYear && years.length) {
    selectedYear = years[0];
  }

  setSelectOptions(
    yearSelect,
    years,
    "年を選択",
    selectedYear
  );

  const months = selectedYear
    ? monthsForVideos(categoryVideos, selectedYear)
    : [];

  let selectedMonth =
    selectedDate?.month ||
    (months.includes(oldMonth) ? oldMonth : "") ||
    latestYearMonth(
      categoryVideos.filter(video =>
        videoYearMonth(video).year === selectedYear
      )
    ).month;

  if (!selectedMonth && months.length) {
    selectedMonth = months[0];
  }

  setSelectOptions(
    monthSelect,
    months,
    "月を選択",
    selectedMonth
  );

  populateVideoOptions(
    videoSelect,
    categoryVideos,
    selectedYear,
    selectedMonth,
    selectedVideo,
    legacyUrl
  );
}

function populateVideoOptions(
  select,
  videos,
  year,
  month,
  selectedVideo = null,
  legacyUrl = ""
) {
  if (!select) return;

  select.replaceChildren();

  const first = document.createElement("option");
  first.value = "";
  first.textContent = "動画を選択してください";
  select.appendChild(first);

  const filtered = videos.filter(video => {
    const date = videoYearMonth(video);

    return date.year === year && date.month === month;
  });

  for (const video of filtered) {
    const option = document.createElement("option");

    option.value = video.id;
    option.textContent = video.title || "タイトル未設定";

    select.appendChild(option);
  }

  /*
   * 既存データにURLだけ保存されている場合も、
   * 編集時にそのURLを失わないようにする
   */
  const normalizedUrl = safeUrl(legacyUrl);

  if (
    normalizedUrl &&
    !videos.some(video =>
      safeUrl(video.url || video.videoUrl || "") === normalizedUrl
    )
  ) {
    const option = document.createElement("option");

    option.value = `legacy:${normalizedUrl}`;
    option.textContent = "以前の登録動画（既存データ）";

    select.appendChild(option);
  }

  if (selectedVideo) {
    select.value = selectedVideo.id;
  } else if (normalizedUrl) {
    const matchingVideo = videos.find(video =>
      safeUrl(video.url || video.videoUrl || "") === normalizedUrl
    );

    if (matchingVideo) {
      select.value = matchingVideo.id;
    } else {
      select.value = `legacy:${normalizedUrl}`;
    }
  }
}

function populateVideoSelects(
  matchVideoId = "",
  highlightVideoId = "",
  matchUrl = "",
  highlightUrl = ""
) {
  populateVideoChoice(
    "matchVideo",
    "match",
    matchVideoId,
    matchUrl
  );

  populateVideoChoice(
    "highlightVideo",
    "highlight",
    highlightVideoId,
    highlightUrl
  );
}

/* 年・月が変更されたら、その年月の動画だけを表示 */
$("matchVideoYear")?.addEventListener("change", () => {
  const videos = videosForCategory("match");
  const year = $("matchVideoYear").value;
  const months = monthsForVideos(videos, year);

  setSelectOptions(
    $("matchVideoMonth"),
    months,
    "月を選択",
    months[0] || ""
  );

  populateVideoOptions(
    $("matchVideo"),
    videos,
    year,
    $("matchVideoMonth").value
  );
});

$("matchVideoMonth")?.addEventListener("change", () => {
  populateVideoOptions(
    $("matchVideo"),
    videosForCategory("match"),
    $("matchVideoYear").value,
    $("matchVideoMonth").value
  );
});

$("highlightVideoYear")?.addEventListener("change", () => {
  const videos = videosForCategory("highlight");
  const year = $("highlightVideoYear").value;
  const months = monthsForVideos(videos, year);

  setSelectOptions(
    $("highlightVideoMonth"),
    months,
    "月を選択",
    months[0] || ""
  );

  populateVideoOptions(
    $("highlightVideoUrl"),
    videos,
    year,
    $("highlightVideoMonth").value
  );
});

$("highlightVideoMonth")?.addEventListener("change", () => {
  populateVideoOptions(
    $("highlightVideoUrl"),
    videosForCategory("highlight"),
    $("highlightVideoYear").value,
    $("highlightVideoMonth").value
  );
});

/* =========================================================
   試合結果に紐付いた動画URL
========================================================= */

function getMatchVideo(score) {
  const video = videoCache.find(
    item => item.id === score.videoId
  );

  return (
    video?.url ||
    video?.videoUrl ||
    score.matchVideoUrl ||
    score.videoUrl ||
    ""
  );
}

function getHighlightVideo(score) {
  const video = videoCache.find(
    item => item.id === score.highlightVideoId
  );

  return (
    video?.url ||
    video?.videoUrl ||
    score.highlightVideoUrl ||
    score.highlightUrl ||
    ""
  );
}

/* =========================================================
   PK・試合結果の互換処理
========================================================= */

function getPkHome(score) {
  return score.pkHomeScore ?? score.pkScoreA ?? null;
}

function getPkAway(score) {
  return score.pkAwayScore ?? score.pkScoreB ?? null;
}

function getHomeScore(score) {
  return Number(score.homeScore ?? score.scoreA ?? 0);
}

function getAwayScore(score) {
  return Number(score.awayScore ?? score.scoreB ?? 0);
}

function getMatchDate(score) {
  return score.matchDate || score.date || "";
}

function dateLabel(date) {
  return String(date || "").replaceAll("-", "/");
}

/* =========================================================
   得点・失点時間
========================================================= */

function timeToSeconds(value) {
  const parts = String(value).trim().split(":");

  if (
    parts.length === 1 &&
    /^\d+$/.test(parts[0])
  ) {
    return Number(parts[0]);
  }

  if (
    parts.length !== 2 ||
    !parts.every(part => /^\d+$/.test(part))
  ) {
    return NaN;
  }

  const minutes = Number(parts[0]);
  const seconds = Number(parts[1]);

  if (seconds > 59) return NaN;

  return minutes * 60 + seconds;
}

function secondsToTime(value) {
  const seconds = Math.max(0, Number(value) || 0);

  return `${Math.floor(seconds / 60)}:${String(
    Math.floor(seconds % 60)
  ).padStart(2, "0")}`;
}

function parseTimeline(raw) {
  const lines = String(raw || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const result = [];

  for (const line of lines) {
    const parts = line.split(",").map(part => part.trim());

    if (parts.length !== 2) {
      return { error: `入力形式を確認してください：${line}` };
    }

    const time = timeToSeconds(parts[0]);
    const team = parts[1];

    if (!Number.isFinite(time) || time < 0) {
      return { error: `時間が正しくありません：${line}` };
    }

    if (team !== "my" && team !== "opponent") {
      return {
        error: `種類は my または opponent で入力してください：${line}`
      };
    }

    result.push({ time, team });
  }

  result.sort((a, b) => a.time - b.time);

  return { highlights: result };
}

function timelineToText(timeline) {
  if (!Array.isArray(timeline)) return "";

  return timeline.map(item =>
    `${secondsToTime(item.time)},${item.team === "opponent" ? "opponent" : "my"}`
  ).join("\n");
}

/* =========================================================
   データ読み込み
========================================================= */

async function loadAll() {
  setMessage("status", "データを読み込んでいます…");

  try {
    const [videoSnapshot, scoreSnapshot] = await Promise.all([
      getDocs(videosCollection),
      getDocs(scoresCollection)
    ]);

    videoCache = videoSnapshot.docs.map(document => ({
      id: document.id,
      ...document.data()
    }));

    scoreCache = scoreSnapshot.docs.map(document => ({
      id: document.id,
      ...document.data()
    }));

    scoreCache.sort((a, b) =>
      getMatchDate(b).localeCompare(getMatchDate(a))
    );

    populateVideoListFilters();
    populateVideoSelects();

    renderCurrentTab();

    setMessage(
      "status",
      `読み込み完了（動画 ${videoCache.length}件／試合結果 ${scoreCache.length}件）`,
      "success"
    );
  } catch (error) {
    console.error(error);

    setMessage(
      "status",
      `データを読み込めませんでした。\n${error.message || error}`,
      "error"
    );
  }
}

$("reload").addEventListener("click", loadAll);

$("videosTab").addEventListener("click", () => {
  switchTab("videos");
});

$("scoresTab").addEventListener("click", () => {
  switchTab("scores");
});

$("searchInput").addEventListener("input", renderCurrentTab);

function switchTab(tab) {
  /*
   * 一般利用者が動画一覧を開くことはできない
   */
  if (tab === "videos" && currentRole !== "admin") {
    tab = "scores";
  }

  currentTab = tab;

  $("videosTab").classList.toggle("active", tab === "videos");
  $("scoresTab").classList.toggle("active", tab === "scores");

  $("videosTab").classList.toggle("secondary", tab !== "videos");
  $("scoresTab").classList.toggle("secondary", tab !== "scores");

  $("listTitle").textContent =
    tab === "videos" ? "動画一覧" : "試合結果";

  show($("videoMonthFilters"), tab === "videos");

  renderCurrentTab();
}

function renderCurrentTab() {
  if (currentTab === "videos" && currentRole === "admin") {
    renderVideos();
  } else {
    renderScores();
  }
}

function matchesSearch(item, query) {
  if (!query.trim()) return true;

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const searchable = JSON.stringify(item).toLowerCase();

  return words.every(word => searchable.includes(word));
}

/* =========================================================
   動画一覧
========================================================= */

function renderVideos() {
  if (currentRole !== "admin") {
    $("items").innerHTML = "";
    return;
  }

  const query = $("searchInput").value.trim();
  const year = $("videoYearFilter")?.value || "";
  const month = $("videoMonthFilter")?.value || "";

  const filtered = sortVideosNewestFirst(videoCache)
    .filter(video => {
      const date = videoYearMonth(video);

      const yearMatches = !year || date.year === year;
      const monthMatches = !month || date.month === month;

      return (
        yearMatches &&
        monthMatches &&
        matchesSearch(video, query)
      );
    });

  if (!filtered.length) {
    $("items").innerHTML = `
      <div class="empty">
        ${videoCache.length
          ? "選択した年月に動画がないか、検索条件に一致する動画がありません。"
          : "動画はまだ登録されていません。"}
      </div>
    `;
    return;
  }

  $("items").innerHTML = filtered.map(video => {
    const url = safeUrl(video.url || video.videoUrl || "");
    const embed = youtubeEmbedUrl(url);
    const label = categoryLabel(getVideoCategory(video));
    const date = videoYearMonth(video);

    const registeredMonth = date.year === "未設定"
      ? "登録年月未設定"
      : `${date.year}年${Number(date.month)}月`;

    return `
      <article class="item">
        <h3>${escapeHtml(video.title || "動画")}</h3>

        <div class="meta">
          ${escapeHtml(registeredMonth)}<br>
          ${escapeHtml(label)}
        </div>

        ${embed ? `
          <iframe
            src="${escapeHtml(embed)}"
            title="${escapeHtml(video.title || "動画")}"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen>
          </iframe>
        ` : ""}

        ${externalVideoLink(url, "動画を再生")}

        <div class="actions">
          <button
            type="button"
            class="secondary"
            data-action="edit-video"
            data-id="${escapeHtml(video.id)}">
            編集
          </button>

          <button
            type="button"
            class="danger"
            data-action="delete-video"
            data-id="${escapeHtml(video.id)}">
            削除
          </button>
        </div>
      </article>
    `;
  }).join("");
}

/* =========================================================
   試合結果・成績集計
========================================================= */

function scoreOutcome(score) {
  const home = getHomeScore(score);
  const away = getAwayScore(score);

  if (home > away) return "勝";
  if (home < away) return "敗";

  return "分";
}

function makeStats(list) {
  const wins = list.filter(
    score => scoreOutcome(score) === "勝"
  ).length;

  const draws = list.filter(
    score => scoreOutcome(score) === "分"
  ).length;

  const losses = list.filter(
    score => scoreOutcome(score) === "敗"
  ).length;

  const goals = list.reduce(
    (sum, score) => sum + getHomeScore(score),
    0
  );

  const conceded = list.reduce(
    (sum, score) => sum + getAwayScore(score),
    0
  );

  const rate = list.length
    ? Math.round(wins / list.length * 100)
    : 0;

  return `
    試合 ${list.length}試合　${wins}勝 ${draws}分 ${losses}敗<br>
    得点 ${goals}　失点 ${conceded}　得失点差 ${goals - conceded}<br>
    勝率 ${rate}%
  `;
}

function renderScores() {
  const query = $("searchInput").value.trim();

  const filtered = [...scoreCache]
    .sort((a, b) =>
      getMatchDate(b).localeCompare(getMatchDate(a))
    )
    .filter(score => matchesSearch(score, query));

  if (!filtered.length) {
    $("items").innerHTML = `
      <div class="empty">
        ${scoreCache.length
          ? "検索条件に一致する試合結果はありません。"
          : "試合結果はまだ登録されていません。"}
      </div>
    `;
    return;
  }

  const groups = new Map();

  for (const score of filtered) {
    const date = getMatchDate(score);
    const month = date ? date.slice(0, 7) : "日付未設定";

    if (!groups.has(month)) {
      groups.set(month, []);
    }

    groups.get(month).push(score);
  }

  let html = `
    <div class="stats">
      <strong>表示中の試合集計</strong><br>
      ${makeStats(filtered)}
    </div>
  `;

  for (const [month, list] of groups) {
    const isExpanded = !collapsedMonths.has(month);

    html += `
      <div class="month-heading">
        <button
          type="button"
          class="secondary month-toggle"
          data-action="toggle-month"
          data-month="${escapeHtml(month)}">
          ${isExpanded ? "▼" : "▶"}
          ${escapeHtml(month)}（${list.length}試合）
        </button>
      </div>
    `;

    if (!isExpanded) continue;

    html += list.map(score => {
      const home = getHomeScore(score);
      const away = getAwayScore(score);

      const pkHome = getPkHome(score);
      const pkAway = getPkAway(score);

      const hasPk =
        pkHome !== null &&
        pkHome !== undefined &&
        pkHome !== "" &&
        pkAway !== null &&
        pkAway !== undefined &&
        pkAway !== "";

      const pkText = hasPk
        ? `（PK ${escapeHtml(pkHome)} - ${escapeHtml(pkAway)}）`
        : "";

      const matchUrl = getMatchVideo(score);
      const highlightUrl = getHighlightVideo(score);

      const timeline = Array.isArray(score.highlights)
        ? score.highlights
        : [];

      const timelineHtml = timeline.length ? `
        <div class="meta">
          <strong>得点・失点シーン</strong>

          <div class="goal-buttons">
            ${timeline.map((item, index) => `
              <button
                type="button"
                class="secondary"
                data-action="play-goal"
                data-id="${escapeHtml(score.id)}"
                data-index="${index}">
                ${escapeHtml(secondsToTime(item.time))}
                ${item.team === "opponent"
                  ? "相手得点"
                  : "神戸三宮FC得点"}
              </button>
            `).join("")}
          </div>
        </div>
      ` : "";

      const adminActions = currentRole === "admin" ? `
        <div class="actions">
          <button
            type="button"
            class="secondary"
            data-action="edit-score"
            data-id="${escapeHtml(score.id)}">
            編集
          </button>

          <button
            type="button"
            class="danger"
            data-action="delete-score"
            data-id="${escapeHtml(score.id)}">
            削除
          </button>
        </div>
      ` : "";

      return `
        <article class="item">
          <h3>
            ${escapeHtml(dateLabel(getMatchDate(score)))}
            ${escapeHtml(score.competition || score.matchType || "試合")}
          </h3>

          <div class="meta">
            対戦相手：${escapeHtml(score.opponent || "未設定")}
          </div>

          <p>
            <strong>
              神戸三宮FC ${home} - ${away}
              ${escapeHtml(score.opponent || "相手")}
            </strong>
            ${pkText}
          </p>

          ${score.memo ? `
            <p>${escapeHtml(score.memo).replace(/\n/g, "<br>")}</p>
          ` : ""}

          <div class="video-actions">
            ${externalVideoLink(matchUrl, "▶ 試合動画を再生")}
            ${externalVideoLink(highlightUrl, "▶ ゴールハイライトを再生")}
          </div>

          ${timelineHtml}
          ${adminActions}
        </article>
      `;
    }).join("");
  }

  $("items").innerHTML = html;
}

/* =========================================================
   一覧の操作
========================================================= */

$("items").addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const { action, id, index, month } = button.dataset;

  if (action === "toggle-month") {
    if (collapsedMonths.has(month)) {
      collapsedMonths.delete(month);
    } else {
      collapsedMonths.add(month);
    }

    renderScores();
    return;
  }

  if (action === "play-goal") {
    const score = scoreCache.find(item => item.id === id);
    if (!score) return;

    const timeline = Array.isArray(score.highlights)
      ? score.highlights
      : [];

    const marker = timeline[Number(index)];
    if (!marker) return;

    const url = getMatchVideo(score);
    const watchUrl = youtubeTimestampUrl(url, marker.time || 0);

    if (watchUrl) {
      window.open(watchUrl, "_blank", "noopener,noreferrer");
      return;
    }

    const externalUrl = safeUrl(url);

    if (externalUrl) {
      window.open(externalUrl, "_blank", "noopener,noreferrer");

      alert(
        "この動画はYouTubeではないため、指定時間から再生できない場合があります。"
      );
      return;
    }

    alert("この試合には再生可能な試合動画が登録されていません。");
    return;
  }

  if (!requireAdmin()) return;

  if (action === "edit-video") {
    editVideo(id);
  }

  if (action === "delete-video") {
    await deleteVideo(id);
  }

  if (action === "edit-score") {
    editScore(id);
  }

  if (action === "delete-score") {
    await deleteScore(id);
  }
});

/* =========================================================
   動画の登録・編集・削除
========================================================= */

function resetVideoForm() {
  $("videoForm").reset();

  editingVideoId = null;

  $("videoSubmitButton").textContent = "動画を追加";

  show($("videoCancelButton"), false);
}

$("videoCancelButton").addEventListener("click", resetVideoForm);

$("videoForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!requireAdmin()) return;

  const url = safeUrl($("videoUrl").value.trim());

  if (!url) {
    setMessage("adminMessage", "有効な動画URLを入力してください。", "error");
    return;
  }

  const payload = {
    title: $("videoTitle").value.trim(),
    category: $("videoCategory").value,
    url,
    updatedAt: serverTimestamp()
  };

  try {
    if (editingVideoId) {
      await updateDoc(
        doc(db, "sannomiyaVideos", editingVideoId),
        payload
      );

      setMessage("adminMessage", "動画を更新しました。", "success");
    } else {
      payload.createdAt = serverTimestamp();

      await addDoc(videosCollection, payload);

      setMessage("adminMessage", "動画を登録しました。", "success");
    }

    resetVideoForm();
    await loadAll();
  } catch (error) {
    console.error(error);

    setMessage(
      "adminMessage",
      `動画を保存できませんでした。\n${error.message || error}`,
      "error"
    );
  }
});

function editVideo(id) {
  if (!requireAdmin()) return;

  const video = videoCache.find(item => item.id === id);
  if (!video) return;

  $("videoTitle").value = video.title || "";
  $("videoCategory").value = getVideoCategory(video);
  $("videoUrl").value = video.url || video.videoUrl || "";

  editingVideoId = id;

  $("videoSubmitButton").textContent = "動画を更新";

  show($("videoCancelButton"), true);

  $("adminPanel").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

async function deleteVideo(id) {
  if (!requireAdmin()) return;

  if (!confirm("この動画を削除しますか？")) return;

  try {
    await deleteDoc(doc(db, "sannomiyaVideos", id));

    setMessage("adminMessage", "動画を削除しました。", "success");

    await loadAll();
  } catch (error) {
    console.error(error);

    setMessage(
      "adminMessage",
      `動画を削除できませんでした。\n${error.message || error}`,
      "error"
    );
  }
}

/* =========================================================
   試合結果の登録・編集・削除
========================================================= */

function resetMatchForm() {
  $("matchForm").reset();

  editingScoreId = null;

  $("matchSubmitButton").textContent = "試合結果を追加";

  show($("matchCancelButton"), false);

  populateVideoSelects();
}

$("matchCancelButton").addEventListener("click", resetMatchForm);

$("matchForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!requireAdmin()) return;

  const matchSelection = $("matchVideo").value;
  const highlightSelection = $("highlightVideoUrl").value;

  const selectedMatchVideo = videoCache.find(
    video => video.id === matchSelection
  );

  const selectedHighlightVideo = videoCache.find(
    video => video.id === highlightSelection
  );

  const matchUrl = safeUrl(
    selectedMatchVideo?.url ||
    selectedMatchVideo?.videoUrl ||
    (
      matchSelection.startsWith("legacy:")
        ? matchSelection.slice(7)
        : ""
    )
  );

  const highlightUrl = safeUrl(
    selectedHighlightVideo?.url ||
    selectedHighlightVideo?.videoUrl ||
    (
      highlightSelection.startsWith("legacy:")
        ? highlightSelection.slice(7)
        : ""
    )
  );

  if (matchSelection && !matchUrl) {
    setMessage(
      "adminMessage",
      "選択した試合動画のURLを確認してください。",
      "error"
    );
    return;
  }

  if (highlightSelection && !highlightUrl) {
    setMessage(
      "adminMessage",
      "選択したゴールハイライトのURLを確認してください。",
      "error"
    );
    return;
  }

  const pkHomeRaw = $("pkHomeScore").value.trim();
  const pkAwayRaw = $("pkAwayScore").value.trim();

  if ((pkHomeRaw === "") !== (pkAwayRaw === "")) {
    setMessage(
      "adminMessage",
      "PKスコアは神戸三宮FC・相手の両方を入力してください。",
      "error"
    );
    return;
  }

  const timelineResult = parseTimeline($("goalTimeline").value);

  if (timelineResult.error) {
    setMessage("adminMessage", timelineResult.error, "error");
    return;
  }

  const payload = {
    matchDate: $("matchDate").value,
    opponent: $("opponent").value.trim(),
    competition: $("competition").value.trim(),

    homeScore: Number($("homeScore").value),
    awayScore: Number($("awayScore").value),

    pkHomeScore: pkHomeRaw === "" ? null : Number(pkHomeRaw),
    pkAwayScore: pkAwayRaw === "" ? null : Number(pkAwayRaw),

    videoId: selectedMatchVideo?.id || "",
    highlightVideoId: selectedHighlightVideo?.id || "",

    matchVideoUrl: matchUrl,
    highlightVideoUrl: highlightUrl,

    highlights: timelineResult.highlights,
    memo: $("matchMemo").value.trim(),

    updatedAt: serverTimestamp()
  };

  try {
    if (editingScoreId) {
      await updateDoc(
        doc(db, "sannomiyaScores", editingScoreId),
        payload
      );

      setMessage("adminMessage", "試合結果を更新しました。", "success");
    } else {
      payload.createdAt = serverTimestamp();

      await addDoc(scoresCollection, payload);

      setMessage("adminMessage", "試合結果を登録しました。", "success");
    }

    resetMatchForm();
    await loadAll();
  } catch (error) {
    console.error(error);

    setMessage(
      "adminMessage",
      `試合結果を保存できませんでした。\n${error.message || error}`,
      "error"
    );
  }
});

function editScore(id) {
  if (!requireAdmin()) return;

  const score = scoreCache.find(item => item.id === id);
  if (!score) return;

  $("matchDate").value = getMatchDate(score);
  $("opponent").value = score.opponent || "";
  $("competition").value = score.competition || score.matchType || "";

  $("homeScore").value = getHomeScore(score);
  $("awayScore").value = getAwayScore(score);

  $("pkHomeScore").value = getPkHome(score) ?? "";
  $("pkAwayScore").value = getPkAway(score) ?? "";

  populateVideoSelects(
    score.videoId || "",
    score.highlightVideoId || "",
    getMatchVideo(score),
    getHighlightVideo(score)
  );

  $("goalTimeline").value = timelineToText(score.highlights || []);
  $("matchMemo").value = score.memo || "";

  editingScoreId = id;

  $("matchSubmitButton").textContent = "試合結果を更新";

  show($("matchCancelButton"), true);

  $("adminPanel").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

async function deleteScore(id) {
  if (!requireAdmin()) return;

  if (!confirm("この試合結果を削除しますか？")) return;

  try {
    await deleteDoc(doc(db, "sannomiyaScores", id));

    setMessage("adminMessage", "試合結果を削除しました。", "success");

    await loadAll();
  } catch (error) {
    console.error(error);

    setMessage(
      "adminMessage",
      `試合結果を削除できませんでした。\n${error.message || error}`,
      "error"
    );
  }
}

/* =========================================================
   バックアップ
========================================================= */

function serializableTimestamp(value) {
  if (value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }

  if (value && typeof value.seconds === "number") {
    return new Date(value.seconds * 1000).toISOString();
  }

  return value ?? null;
}

function makeBackupData(items) {
  return items.map(({ id, ...data }) => ({
    id,
    ...data,
    createdAt: serializableTimestamp(data.createdAt),
    updatedAt: serializableTimestamp(data.updatedAt)
  }));
}

$("backupButton").addEventListener("click", async () => {
  if (!requireAdmin()) return;

  try {
    await loadAll();

    const backup = {
      app: "神戸三宮FC 動画共有システム",
      version: 1,
      exportedAt: new Date().toISOString(),
      videos: makeBackupData(videoCache),
      scores: makeBackupData(scoreCache)
    };

    const blob = new Blob(
      [JSON.stringify(backup, null, 2)],
      { type: "application/json" }
    );

    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download =
      `sannomiya-video-backup-${new Date().toISOString().slice(0, 10)}.json`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

    setMessage(
      "adminMessage",
      "バックアップをダウンロードしました。",
      "success"
    );
  } catch (error) {
    console.error(error);

    setMessage(
      "adminMessage",
      `バックアップに失敗しました。\n${error.message || error}`,
      "error"
    );
  }
});

/* =========================================================
   バックアップから復元
   既存データを削除せず、追加で復元する
========================================================= */

$("restoreButton").addEventListener("click", async () => {
  if (!requireAdmin()) return;

  const file = $("restoreFile").files?.[0];

  if (!file) {
    setMessage(
      "adminMessage",
      "復元するJSONファイルを選択してください。",
      "error"
    );
    return;
  }

  if (!confirm(
    "バックアップの内容を神戸三宮FCのデータに追加復元します。既存データは削除しません。続行しますか？"
  )) {
    return;
  }

  try {
    const backup = JSON.parse(await file.text());

    if (
      !Array.isArray(backup.videos) ||
      !Array.isArray(backup.scores)
    ) {
      throw new Error("バックアップ形式が正しくありません。");
    }

    for (const item of backup.videos) {
      const { id, ...data } = item;

      await addDoc(videosCollection, {
        ...data,
        restoredAt: serverTimestamp()
      });
    }

    for (const item of backup.scores) {
      const { id, ...data } = item;

      await addDoc(scoresCollection, {
        ...data,
        restoredAt: serverTimestamp()
      });
    }

    $("restoreFile").value = "";

    await loadAll();

    setMessage(
      "adminMessage",
      `復元しました（動画 ${backup.videos.length}件／試合結果 ${backup.scores.length}件）。既存データは保持しています。`,
      "success"
    );
  } catch (error) {
    console.error(error);

    setMessage(
      "adminMessage",
      `復元に失敗しました。\n${error.message || error}`,
      "error"
    );
  }
});

/* =========================================================
   初期表示
========================================================= */

show($("loginPanel"), true);
show($("userPanel"), false);
show($("adminPanel"), false);
show($("contentPanel"), false);
show($("videoMonthFilters"), false);

switchTab("scores");
