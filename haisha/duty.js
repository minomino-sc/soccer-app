import { db } from "./firebase.js";

import {
  TEAM_A,
  TEAM_B
} from "./players.js";

import {
  doc,
  getDoc,
  setDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ★ここに追加★
function getLastName(name) {
  return name.split(" ")[0];
}

// =========================
// URL
// =========================
const params =
  new URLSearchParams(window.location.search);

const eventId =
  params.get("id");

loadForm();

// =========================
// 画面作成
// =========================
async function loadForm() {

  const eventRef =
    doc(db,
      "car_dispatch_events",
      eventId);

  const eventSnap =
    await getDoc(eventRef);

  if (!eventSnap.exists()) {

    document.getElementById(
      "dutyForm"
    ).innerHTML =
      "イベントなし";

    return;
  }

  const eventData =
    eventSnap.data();

  // 配車確定後は回答不可
if (eventData.dispatchConfirmed) {

  document.getElementById("coachForm").innerHTML = `
    <div class="event-card">
      <div class="event-title">
        🚫 配車確定済み
      </div>

      <div class="event-meta">
        このイベントは配車確定済みのため、
        回答を変更できません。
      </div>
    </div>
  `;

  return;
}

  let html = "";

  if (eventData.target === "箕谷A") {

    html = `
      <div class="form-group">

        <label>
          試合当番
        </label>

        <select id="teamA">

${TEAM_A.map(
  p =>
  `<option value="${p}">${getLastName(p)}さん</option>`
).join("")}

        </select>

      </div>

      <button id="saveBtn"
              class="save-btn">

        保存

      </button>
    `;
  }

  if (eventData.target === "箕谷B") {

    html = `
      <div class="form-group">

        <label>
          試合当番
        </label>

        <select id="teamB">

${TEAM_B.map(
  p =>
  `<option value="${p}">${getLastName(p)}さん</option>`
).join("")}

        </select>

      </div>

      <button id="saveBtn"
              class="save-btn">

        保存

      </button>
    `;
  }

  if (eventData.target === "箕谷A/B") {

    html = `
      <div class="form-group">

        <label>
          Aチーム
        </label>

        <select id="teamA">

${TEAM_A.map(
  p =>
  `<option value="${p}">${getLastName(p)}さん</option>`
).join("")}

        </select>

      </div>

      <div class="form-group">

        <label>
          Bチーム
        </label>

        <select id="teamB">

${TEAM_B.map(
  p =>
  `<option value="${p}">${getLastName(p)}さん</option>`
).join("")}

        </select>

      </div>

      <button id="saveBtn"
              class="save-btn">

        保存

      </button>
    `;
  }

  document.getElementById(
    "dutyForm"
  ).innerHTML = html;

  document
    .getElementById("saveBtn")
    .addEventListener(
      "click",
      saveDuty
    );
}

// =========================
// 保存
// =========================
async function saveDuty() {

  const teamA =
    document.getElementById("teamA")
      ?.value || "";

  const teamB =
    document.getElementById("teamB")
      ?.value || "";

  const dutyRef =
  doc(db, "match_duties", eventId);

const oldDutySnap =
  await getDoc(dutyRef);

let oldTeamA = "";
let oldTeamB = "";

if (oldDutySnap.exists()) {

  const oldData =
    oldDutySnap.data();

  oldTeamA = oldData.teamA || "";
  oldTeamB = oldData.teamB || "";
}

  await setDoc(
    doc(
      db,
      "match_duties",
      eventId
    ),
    {
      eventId,
      teamA,
      teamB,
      updatedAt:
        Date.now()
    }
  );

// =========================
// 旧試合当番回答削除
// =========================

// Aチーム変更
if (
  oldTeamA &&
  oldTeamA !== teamA
) {
  await deleteDoc(
    doc(
      db,
      "duty_answers",
      `${eventId}_${oldTeamA}`
    )
  );
}

// Bチーム変更
if (
  oldTeamB &&
  oldTeamB !== teamB
) {
  await deleteDoc(
    doc(
      db,
      "duty_answers",
      `${eventId}_${oldTeamB}`
    )
  );
}
  
  alert(
    "試合当番を保存しました"
  );

 window.location.href = `./event.html?id=${eventId}`;
  
}
