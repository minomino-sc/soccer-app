import { db } from "./firebase.js";
import { TEAM_A, TEAM_B } from "./players.js";

import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc
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

  // =========================
  // イベント取得
  // =========================
  const eventRef = doc(
    db,
    "car_dispatch_events",
    eventId
  );

  const eventSnap = await getDoc(eventRef);

  if (!eventSnap.exists()) {

    list.innerHTML = "イベントが見つかりません";
    return;

  }

  const eventData = eventSnap.data();

  // =========================
  // 対象選手取得
  // =========================
  let targetPlayers = [];

  if (eventData.target === "箕谷A") {
    targetPlayers = TEAM_A;
  }

  if (eventData.target === "箕谷B") {
    targetPlayers = TEAM_B;
  }

  if (eventData.target === "箕谷A/B") {
    targetPlayers = [...TEAM_A, ...TEAM_B];
  }

  // =========================
  // 回答取得
  // =========================
  const q = query(
    collection(db, "parent_answers"),
    where("eventId", "==", eventId)
  );

  const snap = await getDocs(q);

  const answeredPlayers = [];

  let attendCount = 0;
  let absentCount = 0;

  let html = "";

  if (!snap.empty) {

    snap.forEach(docSnap => {

      const data = docSnap.data();

      answeredPlayers.push(data.playerName);

      if (data.attendance === "参加") {
        attendCount++;
      }

      if (data.attendance === "欠席") {
        absentCount++;
      }

      html += `
        <div class="event-card">

          <div class="event-title">
            ${data.playerName}
          </div>

          <div class="event-meta">
            出欠：${data.attendance}
          </div>

<div class="event-meta">
  集合方法：
  ${
    data.meetingType === "pickup"
      ? "集合場所集合"
      : "現地集合"
  }
</div>
          
          <div class="event-meta">
            備考：${data.note || "なし"}
          </div>

          <div class="event-meta">
            時刻：${new Date(
              data.createdAt
            ).toLocaleString()}
          </div>

        </div>
      `;

    });

  }

  // =========================
  // 未回答者計算
  // =========================
  const notAnswered =
    targetPlayers.filter(
      player =>
        !answeredPlayers.includes(player)
    );

  const totalPlayers = targetPlayers.length;

  const answerRate =
    totalPlayers > 0
      ? Math.round(
          (answeredPlayers.length / totalPlayers) * 100
        )
      : 0;

  // =========================
  // 回答状況
  // =========================
  html =
  `
    <div class="event-card">

      <div class="event-title">
        📊 回答状況
      </div>

      <div class="event-meta">
        回答済み ${answeredPlayers.length} / ${totalPlayers}
      </div>

      <div class="event-meta">
        回答率 ${answerRate}%
      </div>

      <div class="event-meta">
        🟢 参加 ${attendCount}名
      </div>

      <div class="event-meta">
        🔴 欠席 ${absentCount}名
      </div>

      <div class="event-meta">
        ⚠️ 未回答 ${notAnswered.length}名
      </div>

    </div>
  `
  + html;

  // =========================
  // 未回答者表示
  // =========================
  html += `
    <div class="event-card">

      <div class="event-title">
        ⚠️ 未回答者 (${notAnswered.length})
      </div>

      ${
        notAnswered.length > 0
          ? notAnswered.map(name => `
              <div class="event-meta">
                ${name}
              </div>
            `).join("")
          : `
              <div class="event-meta">
                全員回答済み
              </div>
            `
      }

    </div>
  `;

  list.innerHTML = html;

}
