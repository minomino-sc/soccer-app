import { db } from "./firebase.js";
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

console.log("haisha loaded");

document.addEventListener("DOMContentLoaded", async () => {

  // =========================
  // 新規作成ボタン
  // =========================
  const createBtn = document.getElementById("createBtn");

  createBtn.addEventListener("click", () => {
    window.location.href = "create.html";
  });

  // =========================
  // Firestore読み込み
  // =========================
  const list = document.getElementById("eventList");

  try {
    const q = query(
      collection(db, "car_dispatch_events"),
      orderBy("createdAt", "desc")
    );

    const snapshot = await getDocs(q);

    list.innerHTML = "";

    snapshot.forEach((doc) => {
      const data = doc.data();

      const card = document.createElement("div");
      card.className = "event-card";

      card.innerHTML = `
        <div class="event-date">${data.date ?? ""}</div>
        <div class="event-title">${data.title ?? ""}</div>
        <div class="event-team">${data.target ?? ""}</div>
        <div class="event-status">
          回答締切：${data.deadline ?? ""}
        </div>
      `;

      list.appendChild(card);
    });

  } catch (error) {
    console.error("読み込み失敗:", error);
  }

});
