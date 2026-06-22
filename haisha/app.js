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

    showPast = false;

    render();
  });
}

if (tabPast) {

  tabPast.addEventListener("click", () => {

    showPast = true;

    render();
  });
}  

  // 初回表示
  await render();
});

// =========================
// 描画関数
// =========================
async function render() {

  const list = document.getElementById("eventList");
  if (!list) return;

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
    
    // タブフィルタ
    if (!showPast && isPast) return;
    if (showPast && !isPast) return;

    const card = document.createElement("div");
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
  <button class="line-btn" data-id="${docSnap.id}">LINE送信</button>
  <button class="edit-btn" data-id="${docSnap.id}">編集</button>
  <button class="delete-btn" data-id="${docSnap.id}">削除</button>
</div>

    `;

// =========================
// LINE送信
// =========================
card.querySelector(".line-btn").addEventListener("click", (e) => {

  e.stopPropagation();

  const url =
    `https://minomino-sc.github.io/soccer-app/haisha/event.html?id=${docSnap.id}`;

  const message =
`お疲れ様です。

イベントを登録しましたので、コーチ出欠の回答をお願いします。
また、役員さん経由で部員の出欠回答、試合当番回答を依頼いただくようお願いします。

${data.title}
${data.date}

対象：${data.target}

出欠回答はこちら
${url}`;

  window.open(
    `https://line.me/R/msg/text/?${encodeURIComponent(message)}`,
    "_blank"
  );

});
  
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

// ←ここから追加
window.addEventListener("pageshow", (event) => {

  if (event.persisted) {

    location.reload();

  }

});
