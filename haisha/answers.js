import { db } from "./firebase.js";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// =========================
// URLからeventId取得
// =========================
const params = new URLSearchParams(window.location.search);
const eventId = params.get("id");

if (!eventId) {

  document.getElementById("answerList").innerHTML =
    "イベントIDがありません";

} else {

  loadAnswers();

}

// =========================
// 回答一覧取得
// =========================
async function loadAnswers() {

  const list = document.getElementById("answerList");
  list.innerHTML = "読み込み中...";

  const q = query(
    collection(db, "parent_answers"),
    where("eventId", "==", eventId),
    orderBy("createdAt", "desc")
  );

  const snap = await getDocs(q);

  if (snap.empty) {
    list.innerHTML = "まだ回答がありません";
    return;
  }

  let html = "";

  snap.forEach(docSnap => {

    const data = docSnap.data();

    html += `
      <div class="event-card">

        <div class="event-title">
          ${data.playerName}
        </div>

        <div class="event-meta">
          出欠：${data.attendance}
        </div>

        <div class="event-meta">
          備考：${data.note || "なし"}
        </div>

        <div class="event-meta">
          時刻：${new Date(data.createdAt).toLocaleString()}
        </div>

      </div>
    `;
  });

  list.innerHTML = html;
}
