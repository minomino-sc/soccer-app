import { db } from "./firebase.js";
import {
  COACH_A,
  COACH_B
} from "./players.js";

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

  const list =
    document.getElementById("answerList");

  list.innerHTML = "読み込み中...";

  // =========================
  // イベント取得
  // =========================
  const eventRef =
    doc(db, "car_dispatch_events", eventId);

  const eventSnap =
    await getDoc(eventRef);

  if (!eventSnap.exists()) {

    list.innerHTML =
      "イベントが見つかりません";

    return;

  }

  const eventData =
    eventSnap.data();

  // =========================
  // 対象コーチ取得
  // =========================
  let targetCoaches = [];

  if (eventData.target === "箕谷A") {
    targetCoaches = COACH_A;
  }

  if (eventData.target === "箕谷B") {
    targetCoaches = COACH_B;
  }

  if (eventData.target === "箕谷A/B") {
    targetCoaches = [
      ...COACH_A,
      ...COACH_B
    ];
  }

  // =========================
  // 回答取得
  // =========================
  const q = query(
    collection(db, "coach_answers"),
    where("eventId", "==", eventId)
  );

  const snap =
    await getDocs(q);

  const answeredCoaches = [];

  let attendCount = 0;
  let absentCount = 0;

  let localCount = 0;
  let meetingCount = 0;

  let driveYes = 0;
  let driveNo = 0;

  let totalSeats = 0;

  let html = "";

  snap.forEach(docSnap => {

    const data = docSnap.data();

    answeredCoaches.push(data.coachName);

    if (data.attendance === "参加") {
      attendCount++;
    } else {
      absentCount++;
    }

    if (data.meetingType === "現地集合") {
      localCount++;
    }

    if (data.meetingType === "集合場所集合") {
      meetingCount++;
    }

    if (data.canDrive === "可能") {
      driveYes++;
      totalSeats +=
        Number(data.capacity || 0);
    } else {
      driveNo++;
    }

    html += `
      <div class="event-card">

        <div class="event-title">
          ${data.coachName}
        </div>

        <div class="event-meta">
          出欠：${data.attendance}
        </div>

        <div class="event-meta">
          集合方法：${data.meetingType || "-"}
        </div>

        <div class="event-meta">
          送迎：${data.canDrive || "-"}
        </div>

        <div class="event-meta">
          乗車人数：${data.capacity || "-"}
        </div>

      </div>
    `;
  });

  // =========================
  // 未回答コーチ
  // =========================
  const notAnswered =
    targetCoaches.filter(
      coach =>
        !answeredCoaches.includes(coach)
    );

  const answered =
    answeredCoaches.length;

  const total =
    targetCoaches.length;

  const rate =
    total === 0
      ? 0
      : Math.round(
          answered / total * 100
        );

  // =========================
  // サマリー
  // =========================
  const summary = `
    <div class="event-card">

      <div class="event-title">
        📊 回答状況
      </div>

      <div class="event-meta">
        回答済み ${answered} / ${total}
      </div>

      <div class="event-meta">
        回答率 ${rate}%
      </div>

      <br>

      <div class="event-meta">
        🟢参加 ${attendCount}
      </div>

      <div class="event-meta">
        🔴欠席 ${absentCount}
      </div>

      <br>

      <div class="event-meta">
        📍現地集合 ${localCount}
      </div>

      <div class="event-meta">
        🏫集合場所集合 ${meetingCount}
      </div>

      <br>

      <div class="event-meta">
        🚗送迎可能 ${driveYes}
      </div>

      <div class="event-meta">
        ❌送迎不可 ${driveNo}
      </div>

      <br>

      <div class="event-meta">
        🪑総乗車可能人数
        ${totalSeats}
      </div>

    </div>
  `;

  // =========================
  // 未回答一覧
  // =========================
  const notAnsweredHtml = `
    <div class="event-card">

      <div class="event-title">
        ⚠️ 未回答コーチ
        (${notAnswered.length})
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

  list.innerHTML =
    summary +
    html +
    notAnsweredHtml;

}
