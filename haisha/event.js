import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  TEAM_A,
  TEAM_B,
  COACH_A,
  COACH_B
} from "./players.js";

console.log("event loaded");

// =========================
// 日時フォーマット
// =========================
function formatDateTime(value) {
  if (!value) return "";
  return value.replace("T", " ");
}

// =========================
// 保護者回答数取得
// =========================
async function getAnswerCount(eventId) {

  const q = query(
    collection(db, "parent_answers"),
    where("eventId", "==", eventId)
  );

  const snap = await getDocs(q);

  return snap.size;
}

// =========================
// コーチ回答数取得
// =========================
async function getCoachAnswerCount(eventId) {

  const q = query(
    collection(db, "coach_answers"),
    where("eventId", "==", eventId)
  );

  const snap = await getDocs(q);

  return snap.size;
}

// =========================
// 試合当番回答数取得
// =========================
async function getDutyAnswer(eventId) {

  const q = query(
    collection(db, "duty_answers"),
    where("eventId", "==", eventId)
  );

  const snap =
    await getDocs(q);

  return snap.size;

}

// =========================
// 試合当番取得
// =========================
async function getDuty(eventId) {

  const ref =
    doc(db, "match_duties", eventId);

  const snap =
    await getDoc(ref);

  if (!snap.exists()) {
    return null;
  }

  return snap.data();

}

// =========================
// 試合当番表示名
// =========================
function formatDutyName(name) {

  if (!name) return "未設定";

  const parts =
    name.trim().split(/\s+/);

  return parts[0] + "さん";

}

// =========================
// 対象選手数取得
// =========================
function getTotalPlayers(target) {

  if (target === "箕谷A") {
    return TEAM_A.length;
  }

  if (target === "箕谷B") {
    return TEAM_B.length;
  }

  if (target === "箕谷A/B") {
    return TEAM_A.length + TEAM_B.length;
  }

  return 0;
}

// =========================
// 対象コーチ数取得
// =========================
function getTotalCoaches(target) {

  if (target === "箕谷A") {
    return COACH_A.length;
  }

  if (target === "箕谷B") {
    return COACH_B.length;
  }

  if (target === "箕谷A/B") {
    return COACH_A.length + COACH_B.length;
  }

  return 0;
}

// =========================
// URLの ?id= を取得
// =========================
const params = new URLSearchParams(window.location.search);
const id = params.get("id");

// =========================
// IDチェック
// =========================
if (!id) {

  document.getElementById("eventDetail").innerHTML = `
    <div class="event-card">
      IDがありません
    </div>
  `;

} else {

  loadEvent(id);

}

// =========================
// 予定取得
// =========================
async function loadEvent(id) {

  const ref =
    doc(db, "car_dispatch_events", id);

  const snap =
    await getDoc(ref);

  if (!snap.exists()) {

    document.getElementById("eventDetail").innerHTML = `
      <div class="event-card">
        予定が見つかりません
      </div>
    `;

    return;
  }

  const data = snap.data();

  // =========================
  // 回答数取得
  // =========================
const [
  answered,
  coachAnswered,
  duty,
  dutyAnswered
] = await Promise.all([
  getAnswerCount(id),
  getCoachAnswerCount(id),
  getDuty(id),
  getDutyAnswer(id)
]);  

let dutyTotal = 0;

if (data.target === "箕谷A") {
  dutyTotal = 1;
}
else if (data.target === "箕谷B") {
  dutyTotal = 1;
}
else if (data.target === "箕谷A/B") {
  dutyTotal = 2;
}
  
let dutyText = "未設定";

if (duty) {

if (data.target === "箕谷A") {

  dutyText =
    formatDutyName(duty.teamA);

}

else if (data.target === "箕谷B") {

  dutyText =
    formatDutyName(duty.teamB);

}

else {

  dutyText =
    `A：${formatDutyName(duty.teamA)}<br>
     B：${formatDutyName(duty.teamB)}`;

}
  
} // ← ★ここを追加（これが抜けてる）
  
  const total =
    getTotalPlayers(data.target);

  const coachTotal =
    getTotalCoaches(data.target);

  // =========================
  // 画面描画
  // =========================
  document.getElementById("eventDetail").innerHTML = `

    <div class="event-card">

      <div class="event-title">
        ${data.title ?? ""}
      </div>

      <div class="event-meta">
        📅 ${data.date ?? ""}
      </div>

      <div class="event-meta">
        👥 ${data.target ?? ""}
      </div>

      <div class="event-meta">
        📍 会場：${data.venue ?? ""}
      </div>

      <div class="event-meta">
        🏫 集合場所：${data.meetingPlace ?? ""}
      </div>

      <div class="event-meta">
        🕒 集合時間：${data.meetingTime ?? ""}
      </div>

      <div class="event-meta">
        🚗 出発時間：${data.departureTime ?? ""}
      </div>

      <div class="event-meta">
        🏁 解散予定：${data.dismissTime ?? ""}
      </div>

      <div class="event-meta">
        ⏰ 回答締切：${formatDateTime(data.deadline)}
      </div>

    </div>

    <div class="event-card menu-card" id="parentMenu">
      <div class="event-title">
        👨‍👩‍👧‍👦 保護者回答
      </div>
      <div class="event-meta">
        回答数 ${answered} / ${total}
      </div>
    </div>

    <div class="event-card menu-card" id="answerListBtn">
      <div class="event-title">
        📝 保護者回答一覧
      </div>
      <div class="event-meta">
        保護者回答を見る
      </div>
    </div>

    <div class="event-card menu-card" id="coachMenu">
      <div class="event-title">
        🧑‍🏫 コーチ回答
      </div>
      <div class="event-meta">
        回答数 ${coachAnswered} / ${coachTotal}
      </div>
    </div>

    <div class="event-card menu-card" id="coachAnswerListBtn">
      <div class="event-title">
        📝 コーチ回答一覧
      </div>
      <div class="event-meta">
        コーチ回答を見る
      </div>
    </div>

    <div class="event-card menu-card" id="dutyMenu">
  <div class="event-title">
    🧑 試合当番
  </div>
  <div class="event-meta">
    ${dutyText}
  </div>
</div>

<div class="event-card menu-card" id="dutyAnswerMenu">
  <div class="event-title">
    📝 試合当番回答
  </div>
  <div class="event-meta">
    回答数 ${dutyAnswered} / ${dutyTotal}
  </div>
</div>

<div class="event-card menu-card"
     id="dutyAnswerListBtn">

  <div class="event-title">
    📋 試合当番回答一覧
  </div>

  <div class="event-meta">
    試合当番回答を見る
  </div>

</div>

<div class="event-card menu-card" id="dispatchMenu">

  <div class="event-title">
    🚗 配車作成
  </div>

</div>

  `;

  // =========================
  // 保護者回答
  // =========================
  document
    .getElementById("parentMenu")
    .addEventListener("click", () => {

      window.location.href =
        `parent.html?id=${id}`;

    });

  // =========================
  // コーチ回答
  // =========================
  document
    .getElementById("coachMenu")
    .addEventListener("click", () => {

      window.location.href =
        `coach.html?id=${id}`;

    });

// =========================
// 試合当番設定
// =========================
document
  .getElementById("dutyMenu")
  .addEventListener("click", () => {

    window.location.href =
      `duty.html?id=${id}`;

  });

 // =========================
// 試合当番回答
// =========================
document
  .getElementById("dutyAnswerMenu")
  .addEventListener("click", () => {

    window.location.href =
      `duty-answer.html?id=${id}`;

  }); 

// =========================
// 試合当番回答一覧
// =========================
document
  .getElementById("dutyAnswerListBtn")
  .addEventListener("click", () => {

    window.location.href =
      `duty-answers.html?id=${id}`;

  });
  
  // =========================
  // 回答一覧
  // =========================
  const answerListBtn =
    document.getElementById("answerListBtn");

  if (answerListBtn) {

    answerListBtn.addEventListener(
      "click",
      () => {

        window.location.href =
          `answers.html?id=${id}`;

      }
    );

  }

  // =========================
  // コーチ回答一覧
  // =========================
  const coachAnswerListBtn =
    document.getElementById(
      "coachAnswerListBtn"
    );

  if (coachAnswerListBtn) {

    coachAnswerListBtn.addEventListener(
      "click",
      () => {

        window.location.href =
          `coach-answers.html?id=${id}`;

      }
    );

  }

// =========================
// 配車作成
// =========================
document
  .getElementById("dispatchMenu")
  .addEventListener("click", () => {

    window.location.href =
      `dispatch.html?id=${id}`;

  });
  
}
