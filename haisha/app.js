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
// 状態
// =========================
let showPast = false;

// URL同期
function syncStateFromURL() {
  const params = new URLSearchParams(location.search);
  showPast = params.get("tab") === "past";
}

// =========================
// タブUI更新
// =========================
function updateTabUI() {
  const tabUpcoming = document.getElementById("tabUpcoming");
  const tabPast = document.getElementById("tabPast");

  if (!tabUpcoming || !tabPast) return;

  tabUpcoming.classList.toggle("active", !showPast);
  tabPast.classList.toggle("active", showPast);
}

// =========================
// DOM読み込み後
// =========================
document.addEventListener("DOMContentLoaded", async () => {

  const createBtn = document.getElementById("createBtn");

  createBtn.addEventListener("click", () => {
    window.location.href = "create.html";
  });

  const tabUpcoming = document.getElementById("tabUpcoming");
  const tabPast = document.getElementById("tabPast");

  // 予定
  if (tabUpcoming) {
    tabUpcoming.addEventListener("click", () => {
      showPast = false;
      history.replaceState(null, "", "?tab=upcoming");

      updateTabUI();
      render();
    });
  }

  // 過去
  if (tabPast) {
    tabPast.addEventListener("click", () => {
      showPast = true;
      history.replaceState(null, "", "?tab=past");

      updateTabUI();
      render();
    });
  }

  // 初期状態
  syncStateFromURL();
  updateTabUI();

  // 初回描画（必ず1回）
  await render();
});

// =========================
// 戻る対策（安定版）
// =========================
window.addEventListener("pageshow", async () => {
  syncStateFromURL();
  updateTabUI();

  // ★重要：戻る時も必ず再描画
  await render();
});

// =========================
// 描画
// =========================
async function render() {

  const list = document.getElementById("eventList");
  if (!list) return;

  // ★重複防止（必須）
  list.innerHTML = "";

  const q = query(
    collection(db, "car_dispatch_events"),
    orderBy("date", "asc")
  );

  const snapshot = await getDocs(q);

  const now = new Date();

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();

    const eventDate = new Date(data.date);
    const isPast = eventDate < now;

    // フィルタ
    if (!showPast && isPast) return;
    if (showPast && !isPast) return;

    const card = document.createElement("div");
    card.className = "event-card";

    card.addEventListener("click", () => {
      window.location.href = `event.html?id=${docSnap.id}`;
    });

    if (isPast) {
      card.classList.add("past");
    }

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

    // 編集
    card.querySelector(".edit-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      localStorage.setItem("editId", docSnap.id);
      window.location.href = "create.html";
    });

    // 削除
    card.querySelector(".delete-btn").addEventListener("click", async (e) => {
      e.stopPropagation();

      if (!confirm("削除していいですか？")) return;

      await deleteDoc(doc(db, "car_dispatch_events", docSnap.id));

      alert("削除しました");
      render();
    });

    list.appendChild(card);
  });
}
