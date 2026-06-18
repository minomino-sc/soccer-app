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
// 状態（タブ管理）
// =========================
let showPast = false;

// =========================
// DOM読み込み後
// =========================
document.addEventListener("DOMContentLoaded", async () => {

  const createBtn = document.getElementById("createBtn");

  createBtn.addEventListener("click", () => {
    window.location.href = "create.html";
  });

  // タブ
  const tabUpcoming = document.getElementById("tabUpcoming");
  const tabPast = document.getElementById("tabPast");

  if (tabUpcoming) {
  tabUpcoming.addEventListener("click", () => {
    alert("予定ボタン押下");

    showPast = false;

    render();
  });
}

if (tabPast) {
  tabPast.addEventListener("click", async () => {

  alert("過去ボタン押下");

  try {

    showPast = true;

    alert("render前");

    await render();

    alert("render後");

  } catch (e) {

    alert(
      "renderエラー\n\n" +
      e.message
    );

  }

});

}  

  // 初回表示
  await render();
});

// =========================
// 描画関数
// =========================
async function render() {

  alert("render開始");

  const list = document.getElementById("eventList");

  alert("eventList取得");

  if (!list) {

    alert("eventListがnull");

    return;

  }

  list.innerHTML = "";

  alert("Firestore取得前");

  const q = query(
    collection(db, "car_dispatch_events"),
    orderBy("date", "asc")
  );

  const snapshot =
    await getDocs(q);

  alert("Firestore取得後");

  const now = new Date();

  snapshot.forEach((docSnap) => {

    const data = docSnap.data();

    const eventDate =
      new Date(data.date);

    const isPast =
      eventDate < now;

    // ↓ここ追加
    alert(
      `処理中\n${data.title}`
    );

    if (!showPast && isPast) return;
    if (showPast && !isPast) return;

    const card =
      document.createElement("div");
    card.className = "event-card";

// =========================
// 詳細画面へ
// =========================
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
        <button class="edit-btn" data-id="${docSnap.id}">編集</button>
        <button class="delete-btn" data-id="${docSnap.id}">削除</button>
      </div>
    `;

    // =========================
    // 編集
    // =========================
card.querySelector(".edit-btn").addEventListener("click", (e) => {

  e.stopPropagation();

  localStorage.setItem("editId", docSnap.id);
  window.location.href = "create.html";

});

    // =========================
    // 削除
    // =========================
card.querySelector(".delete-btn").addEventListener("click", async (e) => {

  e.stopPropagation();
      
      if (!confirm("削除していいですか？")) return;

  await deleteDoc(
  doc(db, "car_dispatch_events", docSnap.id)
);

alert("削除しました");

await render();
    });

    list.appendChild(card);
  });
}
