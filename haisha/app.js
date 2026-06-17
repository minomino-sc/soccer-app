import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  query,
  orderBy,
  deleteDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

console.log("haisha loaded");

// =========================
// 日付フォーマット
// =========================
function formatDateTime(value) {
  if (!value) return "";
  return value.replace("T", " ");
}

// =========================
// URL状態（唯一の正）
// =========================
function isPastMode() {
  const params = new URLSearchParams(location.search);
  return params.get("tab") === "past";
}

// =========================
// タブUI更新
// =========================
function updateTabUI() {
  const tabUpcoming = document.getElementById("tabUpcoming");
  const tabPast = document.getElementById("tabPast");

  if (!tabUpcoming || !tabPast) return;

  const showPast = isPastMode();

  tabUpcoming.classList.toggle("active", !showPast);
  tabPast.classList.toggle("active", showPast);
}

// =========================
// DOM準備待ち（重要）
// =========================
function waitForDOM() {
  return new Promise((resolve) => {
    if (document.getElementById("eventList")) {
      resolve();
      return;
    }

    const observer = new MutationObserver(() => {
      if (document.getElementById("eventList")) {
        observer.disconnect();
        resolve();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });
}

// =========================
// 初期化
// =========================
document.addEventListener("DOMContentLoaded", async () => {

  const createBtn = document.getElementById("createBtn");

  createBtn.addEventListener("click", () => {
    window.location.href = "create.html";
  });

  const tabUpcoming = document.getElementById("tabUpcoming");
  const tabPast = document.getElementById("tabPast");

  if (tabUpcoming) {
    tabUpcoming.addEventListener("click", () => {
      history.replaceState(null, "", "?tab=upcoming");
      updateTabUI();
      render();
    });
  }

  if (tabPast) {
    tabPast.addEventListener("click", () => {
      history.replaceState(null, "", "?tab=past");
      updateTabUI();
      render();
    });
  }

  updateTabUI();

  // ★DOM完全安定後に描画
  await waitForDOM();
  requestAnimationFrame(() => {
    render();
  });
});

// =========================
// 戻る対応（UIのみ）
// =========================
window.addEventListener("pageshow", () => {
  updateTabUI();

  // ★戻る時も描画保証（軽く遅延）
  requestAnimationFrame(() => {
    render();
  });
});

// =========================
// 描画
// =========================
async function render() {

  const list = document.getElementById("eventList");
  if (!list) return;

  // 二重防止
  list.innerHTML = "";

  const q = query(
    collection(db, "car_dispatch_events"),
    orderBy("date", "asc")
  );

  const snapshot = await getDocs(q);

  const now = new Date();
  const showPast = isPastMode();

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();

    const eventDate = new Date(data.date);
    const isPast = eventDate < now;

    if (!showPast && isPast) return;
    if (showPast && !isPast) return;

    const card = document.createElement("div");
    card.className = "event-card";

    if (isPast) {
      card.classList.add("past");
    }

    card.addEventListener("click", () => {
      window.location.href = `event.html?id=${docSnap.id}`;
    });

    card.innerHTML = `
      <div class="event-date">📅 ${data.date ?? ""}</div>
      <div class="event-title">${data.title ?? ""}</div>
      <div class="event-team">👥 ${data.target ?? ""}</div>

      <div class="event-block">
        <div class="event-meta">📍 集合：${data.meetingPlace ?? ""}</div>
        <div class="event-meta">🕒 集合：${data.meetingTime ?? ""}</div>
        <div class="event-meta">🚗 出発：${data.departureTime ?? ""}</div>
      </div>

      <div class="event-status">
        ⏰ 締切：${formatDateTime(data.deadline)}
      </div>

      <div class="event-actions">
        <button class="edit-btn">編集</button>
        <button class="delete-btn">削除</button>
      </div>
    `;

    card.querySelector(".edit-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      localStorage.setItem("editId", docSnap.id);
      window.location.href = "create.html";
    });

    card.querySelector(".delete-btn").addEventListener("click", async (e) => {
      e.stopPropagation();

      if (!confirm("削除していいですか？")) return;

      await deleteDoc(doc(db, "car_dispatch_events", docSnap.id));

      render();
    });

    list.appendChild(card);
  });
}
