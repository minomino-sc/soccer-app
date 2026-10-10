/* =========================================================
   神戸三宮FC 動画共有システム
   閲覧・管理者ログイン
   動画・試合結果の登録、編集、削除
   保存先: sannomiyaVideos / sannomiyaScores
========================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =========================================================
   Firebase設定
   ★ 箕谷SCで使用している実際の値に置き換えてください
========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyDMJfAd5BffteapT51ZUO06VP-XDReFSwY",
  authDomain: "minotani-sc-app.firebaseapp.com",
  projectId: "minotani-sc-app",
  storageBucket: "minotani-sc-app.firebasestorage.app",
  messagingSenderId: "757066295000",
  appId: "1:757066295000:web:1c7a90f968af75d26099ad"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* =========================================================
   ログイン情報
========================================================= */

const VIEWER_ID = "神戸三宮FC";
const VIEWER_PASSWORD = "KOBE";

const ADMIN_ID = "神戸三宮FC_ADMIN";
const ADMIN_PASSWORD = "KOBE_KOBE-ADMIN";

let currentRole = "";
let currentTab = "videos";
let editingVideoId = null;
let editingScoreId = null;
let videoCache = [];
let scoreCache = [];

const $ = (id) => document.getElementById(id);

/* =========================================================
   共通処理
========================================================= */

function showMessage(id, message, isError = false) {
  const element = $(id);
  if (!element) return;

  element.textContent = message;
  element.style.color = isError ? "#c62828" : "#176b36";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || "").trim());

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return "";
    }

    return url.href;
  } catch {
    return "";
  }
}

function youtubeEmbedUrl(value) {
  try {
    const url = new URL(value);
    let videoId = "";

    if (url.hostname === "youtu.be" ||
        url.hostname.endsWith(".youtu.be")) {
      videoId = url.pathname.split("/")[1] || "";
    } else if (
      url.hostname === "youtube.com" ||
      url.hostname.endsWith(".youtube.com")
    ) {
      if (url.pathname === "/watch") {
        videoId = url.searchParams.get("v") || "";
      } else if (
        url.pathname.startsWith("/embed/") ||
        url.pathname.startsWith("/shorts/")
      ) {
        videoId = url.pathname.split("/")[2] || "";
      }
    }

    return videoId
      ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`
      : "";
  } catch {
    return "";
  }
}

function requireAdmin() {
  if (currentRole !== "admin") {
    throw new Error("管理者でログインしてください。");
  }
}

/* =========================================================
   ログイン・ログアウト
========================================================= */

function setLoggedIn(role, loginId) {
  currentRole = role;

  if ($("loginPanel")) $("loginPanel").hidden = true;
  if ($("userPanel")) $("userPanel").hidden = false;
  if ($("contentPanel")) $("contentPanel").hidden = false;

  if ($("adminPanel")) {
    $("adminPanel").hidden = role !== "admin";
  }

  if ($("loginState")) {
    $("loginState").textContent = `${loginId} でログイン中`;
  }

  if ($("roleDescription")) {
    $("roleDescription").textContent =
      role === "admin"
        ? "管理者：動画・試合結果の登録、編集、削除ができます。"
        : "閲覧者：動画・試合結果を閲覧できます。";
  }

  loadCurrentTab();
}

function logout() {
  currentRole = "";
  currentTab = "videos";
  editingVideoId = null;
  editingScoreId = null;
  videoCache = [];
  scoreCache = [];

  if ($("loginPanel")) $("loginPanel").hidden = false;
  if ($("userPanel")) $("userPanel").hidden = true;
  if ($("adminPanel")) $("adminPanel").hidden = true;
  if ($("contentPanel")) $("contentPanel").hidden = true;

  if ($("loginForm")) $("loginForm").reset();
  if ($("loginMessage")) $("loginMessage").textContent = "";
  if ($("adminMessage")) $("adminMessage").textContent = "";
  if ($("items")) $("items").innerHTML = "";

  resetVideoForm();
  resetScoreForm();
}

/* =========================================================
   フォーム初期化
========================================================= */

function resetVideoForm() {
  editingVideoId = null;

  if ($("videoForm")) $("videoForm").reset();

  if ($("videoSubmitButton")) {
    $("videoSubmitButton").textContent = "動画を登録";
  }
}

function resetScoreForm() {
  editingScoreId = null;

  if ($("matchForm")) $("matchForm").reset();

  if ($("matchSubmitButton")) {
    $("matchSubmitButton").textContent = "試合結果を登録";
  }
}

/* =========================================================
   動画一覧読み込み
========================================================= */

async function loadVideos() {
  showMessage("status", "動画を読み込んでいます…");

  try {
    const snapshot = await getDocs(
      collection(db, "sannomiyaVideos")
    );

    videoCache = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data()
    }));

    videoCache.sort((a, b) => {
      const aTime = a.createdAt?.seconds || 0;
      const bTime = b.createdAt?.seconds || 0;
      return bTime - aTime;
    });

    renderVideos();
    showMessage("status", `${videoCache.length} 件の動画`);
  } catch (error) {
    console.error(error);
    showMessage(
      "status",
      `動画を読み込めませんでした：${error.message}`,
      true
    );
  }
}

/* =========================================================
   動画一覧表示
========================================================= */

function renderVideos() {
  const container = $("items");
  if (!container) return;

  if (videoCache.length === 0) {
    container.innerHTML =
      '<p class="empty-message">動画はまだ登録されていません。</p>';
    return;
  }

  container.innerHTML = videoCache.map((item) => {
    const embed = youtubeEmbedUrl(item.url);
    const url = safeUrl(item.url);

    const categoryNames = {
      match: "試合動画",
      highlight: "ハイライト動画",
      other: "その他"
    };

    const category =
      categoryNames[item.category] || "その他";

    return `
      <article class="content-card">
        <div class="content-card-body">

          <div class="content-meta">
            ${escapeHtml(category)}
          </div>

          <h3>${escapeHtml(item.title || "タイトル未設定")}</h3>

          ${
            embed
              ? `
                <div class="video-frame">
                  <iframe
                    src="${embed}"
                    title="${escapeHtml(item.title || "動画")}"
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowfullscreen>
                  </iframe>
                </div>
              `
              : ""
          }

          ${
            url
              ? `<p><a href="${url}" target="_blank" rel="noopener noreferrer">動画を開く</a></p>`
              : '<p>動画URLが正しくありません。</p>'
          }

          ${
            currentRole === "admin"
              ? `
                <div class="admin-actions">
                  <button type="button" data-edit-video="${escapeHtml(item.id)}">編集</button>
                  <button type="button" data-delete-video="${escapeHtml(item.id)}">削除</button>
                </div>
              `
              : ""
          }

        </div>
      </article>
    `;
  }).join("");

  container.querySelectorAll("[data-edit-video]").forEach((button) => {
    button.addEventListener("click", () => {
      editVideo(button.dataset.editVideo);
    });
  });

  container.querySelectorAll("[data-delete-video]").forEach((button) => {
    button.addEventListener("click", () => {
      removeVideo(button.dataset.deleteVideo);
    });
  });
}

/* =========================================================
   動画登録・更新
========================================================= */

async function submitVideo(event) {
  event.preventDefault();

  try {
    requireAdmin();

    const title = $("videoTitle").value.trim();
    const category = $("videoCategory").value;
    const urlInput = $("videoUrl").value.trim();
    const url = safeUrl(urlInput);

    if (!title || !url) {
      throw new Error("タイトルと正しい動画URLを入力してください。");
    }

    const payload = {
      title,
      category,
      url,
      updatedAt: serverTimestamp()
    };

    if (editingVideoId) {
      await updateDoc(
        doc(db, "sannomiyaVideos", editingVideoId),
        payload
      );

      showMessage("adminMessage", "動画を更新しました。");
    } else {
      await addDoc(
        collection(db, "sannomiyaVideos"),
        {
          ...payload,
          createdAt: serverTimestamp()
        }
      );

      showMessage("adminMessage", "動画を登録しました。");
    }

    resetVideoForm();
    await loadVideos();
  } catch (error) {
    console.error(error);
    showMessage(
      "adminMessage",
      error.message || "動画を保存できませんでした。",
      true
    );
  }
}

/* =========================================================
   動画編集
========================================================= */

function editVideo(id) {
  if (currentRole !== "admin") return;

  const item = videoCache.find((entry) => entry.id === id);
  if (!item) return;

  editingVideoId = id;

  $("videoTitle").value = item.title || "";
  $("videoCategory").value = item.category || "match";
  $("videoUrl").value = item.url || "";

  if ($("videoSubmitButton")) {
    $("videoSubmitButton").textContent = "動画を更新";
  }

  $("adminPanel")?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

/* =========================================================
   動画削除
========================================================= */

async function removeVideo(id) {
  try {
    requireAdmin();

    if (!confirm("この動画を削除しますか？")) return;

    await deleteDoc(
      doc(db, "sannomiyaVideos", id)
    );

    showMessage("adminMessage", "動画を削除しました。");
    await loadVideos();
  } catch (error) {
    console.error(error);
    showMessage(
      "adminMessage",
      error.message || "動画を削除できませんでした。",
      true
    );
  }
}

/* =========================================================
   試合結果読み込み
========================================================= */

async function loadScores() {
  showMessage("status", "試合結果を読み込んでいます…");

  try {
    const snapshot = await getDocs(
      collection(db, "sannomiyaScores")
    );

    scoreCache = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data()
    }));

    scoreCache.sort((a, b) => {
      return String(b.matchDate || "")
        .localeCompare(String(a.matchDate || ""));
    });

    renderScores();
    showMessage("status", `${scoreCache.length} 件の試合結果`);
  } catch (error) {
    console.error(error);
    showMessage(
      "status",
      `試合結果を読み込めませんでした：${error.message}`,
      true
    );
  }
}

/* =========================================================
   試合結果表示
========================================================= */

function renderScores() {
  const container = $("items");
  if (!container) return;

  if (scoreCache.length === 0) {
    container.innerHTML =
      '<p class="empty-message">試合結果はまだ登録されていません。</p>';
    return;
  }

  container.innerHTML = scoreCache.map((item) => {
    const url = safeUrl(item.videoUrl);

    return `
      <article class="content-card match-card">
        <div class="content-card-body">

          <div class="content-meta">
            ${escapeHtml(item.matchDate || "日付未設定")}
            ${item.competition
              ? ` ・ ${escapeHtml(item.competition)}`
              : ""}
          </div>

          <h3>${escapeHtml(item.opponent || "対戦相手未設定")}</h3>

          <div class="match-score">
            ${escapeHtml(item.homeScore ?? 0)}
            -
            ${escapeHtml(item.awayScore ?? 0)}
          </div>

          ${
            item.memo
              ? `<p>${escapeHtml(item.memo)}</p>`
              : ""
          }

          ${
            url
              ? `<p><a href="${url}" target="_blank" rel="noopener noreferrer">関連動画を見る</a></p>`
              : ""
          }

          ${
            currentRole === "admin"
              ? `
                <div class="admin-actions">
                  <button type="button" data-edit-score="${escapeHtml(item.id)}">編集</button>
                  <button type="button" data-delete-score="${escapeHtml(item.id)}">削除</button>
                </div>
              `
              : ""
          }

        </div>
      </article>
    `;
  }).join("");

  container.querySelectorAll("[data-edit-score]").forEach((button) => {
    button.addEventListener("click", () => {
      editScore(button.dataset.editScore);
    });
  });

  container.querySelectorAll("[data-delete-score]").forEach((button) => {
    button.addEventListener("click", () => {
      removeScore(button.dataset.deleteScore);
    });
  });
}

/* =========================================================
   試合結果登録・更新
========================================================= */

async function submitScore(event) {
  event.preventDefault();

  try {
    requireAdmin();

    const matchDate = $("matchDate").value;
    const opponent = $("opponent").value.trim();
    const competition = $("competition").value.trim();
    const homeScore = Number($("homeScore").value);
    const awayScore = Number($("awayScore").value);
    const videoUrlInput = $("matchVideo").value.trim();
    const videoUrl = videoUrlInput ? safeUrl(videoUrlInput) : "";
    const memo = $("matchMemo").value.trim();

    if (!matchDate || !opponent) {
      throw new Error("試合日と対戦相手を入力してください。");
    }

    if (
      !Number.isInteger(homeScore) ||
      !Number.isInteger(awayScore) ||
      homeScore < 0 ||
      awayScore < 0
    ) {
      throw new Error("スコアは0以上の整数で入力してください。");
    }

    if (videoUrlInput && !videoUrl) {
      throw new Error("関連動画URLを確認してください。");
    }

    const payload = {
      matchDate,
      opponent,
      competition,
      homeScore,
      awayScore,
      videoUrl,
      memo,
      updatedAt: serverTimestamp()
    };

    if (editingScoreId) {
      await updateDoc(
        doc(db, "sannomiyaScores", editingScoreId),
        payload
      );

      showMessage("adminMessage", "試合結果を更新しました。");
    } else {
      await addDoc(
        collection(db, "sannomiyaScores"),
        {
          ...payload,
          createdAt: serverTimestamp()
        }
      );

      showMessage("adminMessage", "試合結果を登録しました。");
    }

    resetScoreForm();
    await loadScores();
  } catch (error) {
    console.error(error);
    showMessage(
      "adminMessage",
      error.message || "試合結果を保存できませんでした。",
      true
    );
  }
}

/* =========================================================
   試合結果編集
========================================================= */

function editScore(id) {
  if (currentRole !== "admin") return;

  const item = scoreCache.find((entry) => entry.id === id);
  if (!item) return;

  editingScoreId = id;

  $("matchDate").value = item.matchDate || "";
  $("opponent").value = item.opponent || "";
  $("competition").value = item.competition || "";
  $("homeScore").value = item.homeScore ?? 0;
  $("awayScore").value = item.awayScore ?? 0;
  $("matchVideo").value = item.videoUrl || "";
  $("matchMemo").value = item.memo || "";

  if ($("matchSubmitButton")) {
    $("matchSubmitButton").textContent = "試合結果を更新";
  }

  $("adminPanel")?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

/* =========================================================
   試合結果削除
========================================================= */

async function removeScore(id) {
  try {
    requireAdmin();

    if (!confirm("この試合結果を削除しますか？")) return;

    await deleteDoc(
      doc(db, "sannomiyaScores", id)
    );

    showMessage("adminMessage", "試合結果を削除しました。");
    await loadScores();
  } catch (error) {
    console.error(error);
    showMessage(
      "adminMessage",
      error.message || "試合結果を削除できませんでした。",
      true
    );
  }
}

/* =========================================================
   表示切り替え
========================================================= */

function loadCurrentTab() {
  if (!currentRole) return;

  if (currentTab === "scores") {
    if ($("listTitle")) {
      $("listTitle").textContent = "試合結果";
    }
    loadScores();
  } else {
    if ($("listTitle")) {
      $("listTitle").textContent = "動画一覧";
    }
    loadVideos();
  }
}

/* =========================================================
   初期設定
========================================================= */

function init() {
  $("loginForm")?.addEventListener("submit", (event) => {
    event.preventDefault();

    const id = $("loginId").value.trim();
    const password = $("password").value;

    if (id === ADMIN_ID && password === ADMIN_PASSWORD) {
      showMessage("loginMessage", "");
      setLoggedIn("admin", id);
      return;
    }

    if (id === VIEWER_ID && password === VIEWER_PASSWORD) {
      showMessage("loginMessage", "");
      setLoggedIn("viewer", id);
      return;
    }

    showMessage(
      "loginMessage",
      "ログインIDまたはパスワードが違います。",
      true
    );
  });

  $("logout")?.addEventListener("click", logout);

  $("videoForm")?.addEventListener("submit", submitVideo);
  $("matchForm")?.addEventListener("submit", submitScore);

  $("videosTab")?.addEventListener("click", () => {
    currentTab = "videos";
    loadCurrentTab();
  });

  $("scoresTab")?.addEventListener("click", () => {
    currentTab = "scores";
    loadCurrentTab();
  });

  $("reload")?.addEventListener("click", loadCurrentTab);

  $("videoCancelButton")?.addEventListener("click", resetVideoForm);
  $("matchCancelButton")?.addEventListener("click", resetScoreForm);

  logout();

  const missingConfig =
    !firebaseConfig.apiKey ||
    firebaseConfig.apiKey.includes("ここに") ||
    !firebaseConfig.authDomain ||
    firebaseConfig.authDomain.includes("ここに") ||
    !firebaseConfig.storageBucket ||
    firebaseConfig.storageBucket.includes("ここに") ||
    !firebaseConfig.messagingSenderId ||
    firebaseConfig.messagingSenderId.includes("ここに") ||
    !firebaseConfig.appId ||
    firebaseConfig.appId.includes("ここに");

  if (missingConfig) {
    showMessage(
      "loginMessage",
      "Firebase設定が未入力です。main.js の firebaseConfig に箕谷SCと同じ設定を入れてください。",
      true
    );
  }
}

init();
