import { db } from "./firebase.js";
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
  const saveBtn = document.getElementById("saveBtn");

  saveBtn.addEventListener("click", async () => {

    const event = {
      title: document.getElementById("eventName").value,
      date: document.getElementById("eventDate").value,
      target: document.getElementById("team").value,
      venue: document.getElementById("venue").value,
      meetingPlace: document.getElementById("meetingPlace").value,
      meetingTime: document.getElementById("meetingTime").value,
      departureTime: document.getElementById("departureTime").value,
      dismissTime: document.getElementById("dismissTime").value,
      deadline: document.getElementById("deadline").value,
      createdAt: Date.now()
    };

    // 必須チェック
    if (!event.title || !event.date) {
      alert("試合名と開催日は必須です");
      return;
    }

    try {
      await addDoc(collection(db, "car_dispatch_events"), event);

      alert("保存しました");
      window.location.href = "index.html";

    } catch (error) {
      console.error(error);
      alert("保存に失敗しました");
    }

  });
});
