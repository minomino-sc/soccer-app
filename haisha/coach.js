import { db } from "./firebase.js";
import { COACH_A, COACH_B } from "./players.js";

import {
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const eventId = params.get("id");

if (!eventId) {

  document.getElementById("coachForm").innerHTML =
    "イベントIDがありません";

} else {

  loadForm();

}

async function loadForm() {

  const eventRef =
    doc(db, "car_dispatch_events", eventId);

  const eventSnap =
    await getDoc(eventRef);

  if (!eventSnap.exists()) {

    document.getElementById("coachForm").innerHTML =
      "イベントが見つかりません";

    return;

  }

  const eventData = eventSnap.data();

  let coaches = [];

  if (eventData.target === "箕谷A") {
    coaches = COACH_A;
  }

  if (eventData.target === "箕谷B") {
    coaches = COACH_B;
  }

  if (eventData.target === "箕谷A/B") {
    coaches = [...COACH_A, ...COACH_B];
  }

  document.getElementById("coachForm").innerHTML = `
    <div class="form-card">

      <div class="form-group">
        <label>コーチ名</label>
        <select id="coachName">
          ${coaches.map(c =>
            `<option>${c}</option>`
          ).join("")}
        </select>
      </div>

      <div class="form-group">
        <label>出欠</label>
        <select id="attendance">
          <option>参加</option>
          <option>欠席</option>
        </select>
      </div>

      <div class="form-group">
        <label>集合方法</label>
        <select id="meetingType">
          <option>集合場所集合</option>
          <option>現地集合</option>
        </select>
      </div>

      <div class="form-group">
        <label>送迎可能</label>
        <select id="canDrive">
          <option>○</option>
          <option>×</option>
        </select>
      </div>

      <div class="form-group">
        <label>乗車人数</label>
        <input id="capacity" type="number" value="0">
      </div>

      <button
        id="saveBtn"
        class="save-btn">

        回答する

      </button>

    </div>
  `;

  document
    .getElementById("saveBtn")
    .addEventListener("click", saveAnswer);
}

async function saveAnswer() {

  const coachName =
    document.getElementById("coachName").value;

  const answer = {
    eventId,
    coachName,
    attendance:
      document.getElementById("attendance").value,
    meetingType:
      document.getElementById("meetingType").value,
    canDrive:
      document.getElementById("canDrive").value,
    capacity:
      Number(
        document.getElementById("capacity").value
      ),
    createdAt: Date.now()
  };

  try {

    await setDoc(
      doc(
        db,
        "coach_answers",
        `${eventId}_${coachName}`
      ),
      answer
    );

    alert("回答を保存しました");

    window.history.back();

  } catch (e) {

    console.error(e);

    alert("保存に失敗しました");

  }
}
