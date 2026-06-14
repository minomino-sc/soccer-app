import { db } from "./firebase.js";
import {
  collection,
  addDoc,
  doc,
  getDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", async () => {

  const saveBtn = document.getElementById("saveBtn");
  const editId = localStorage.getItem("editId");

  // =========================
  // キャンセルボタン
  // =========================
const cancelBtn = document.getElementById("cancelBtn");

if (!cancelBtn) {
  console.error("cancelBtnが見つからない");
} else {
  cancelBtn.addEventListener("click", () => {
    console.log("cancel clicked");
    localStorage.removeItem("editId");
    window.location.href = "index.html";
  });
}
  
  // =========================
  // 編集ならデータ取得
  // =========================
  if (editId) {
    const ref = doc(db, "car_dispatch_events", editId);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      const data = snap.data();

      document.getElementById("eventName").value = data.title || "";
      document.getElementById("eventDate").value = data.date || "";
      document.getElementById("team").value = data.target || "";
      document.getElementById("venue").value = data.venue || "";
      document.getElementById("meetingPlace").value = data.meetingPlace || "";
      document.getElementById("meetingTime").value = data.meetingTime || "";
      document.getElementById("departureTime").value = data.departureTime || "";
      document.getElementById("dismissTime").value = data.dismissTime || "";
      document.getElementById("deadline").value = data.deadline || "";
    }
  }

  // =========================
  // 保存ボタン
  // =========================
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

    if (!event.title || !event.date) {
      alert("試合名と開催日は必須です");
      return;
    }

    try {

      if (editId) {
        await updateDoc(doc(db, "car_dispatch_events", editId), event);
        localStorage.removeItem("editId");
        alert("更新しました");
      } else {
        await addDoc(collection(db, "car_dispatch_events"), event);
        alert("保存しました");
      }

      window.location.href = "index.html";

    } catch (error) {
      console.error(error);
      alert("保存に失敗しました");
    }

  });

});
