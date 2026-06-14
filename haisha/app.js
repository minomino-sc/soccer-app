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

document.addEventListener("DOMContentLoaded", async () => {

  const createBtn = document.getElementById("createBtn");

  createBtn.addEventListener("click", () => {
    window.location.href = "create.html";
  });

  const list = document.getElementById("eventList");

  try {
    const q = query(
      collection(db, "car_dispatch_events"),
      orderBy("createdAt", "desc")
    );

    const snapshot = await getDocs(q);

    list.innerHTML = "";

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();

      const card = document.createElement("div");
      card.className = "event-card";

card.innerHTML = `
  <div class="event-date">📅 ${data.date ?? ""}</div>

  <div class="event-title">${data.title ?? ""}</div>

  <div class="event-team">👥 ${data.target ?? ""}</div>

  <div class="event-meta">
    📍 集合場所：${data.meetingPlace ?? ""}
  </div>

  <div class="event-meta">
    🕒 集合時間：${data.meetingTime ?? ""}
  </div>

  <div class="event-meta">
    🚗 出発時間：${data.departureTime ?? ""}
  </div>

  <div class="event-status">
    ⏰ 回答締切：${data.deadline ?? ""}
  </div>

  <div class="event-actions">
    <button class="edit-btn" data-id="${docSnap.id}">編集</button>
    <button class="delete-btn" data-id="${docSnap.id}">削除</button>
  </div>
`;      

      card.querySelector(".edit-btn").addEventListener("click", () => {
  const id = docSnap.id;

  localStorage.setItem("editId", id);
  window.location.href = "create.html";
});    

      // =========================
      // 削除処理（ここに追加）
      // =========================
      card.querySelector(".delete-btn").addEventListener("click", async () => {

  const id = docSnap.id;

  if (!confirm("削除していいですか？")) return;

  await deleteDoc(doc(db, "car_dispatch_events", id));

  alert("削除しました");
  location.reload();
});  

      list.appendChild(card);
    });

  } catch (error) {
    console.error("読み込み失敗:", error);
  }

});
