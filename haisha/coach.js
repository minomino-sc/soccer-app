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

// =========================
// フォーム表示
// =========================
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
          <option value="参加">参加</option>
          <option value="欠席">欠席</option>
        </select>
      </div>

      <div id="detailArea">

<div class="form-group">
  <label>集合方法</label>
  <select id="meetingType">
    <option value="集合場所集合">
      集合場所集合
    </option>
    <option value="現地集合">
      現地集合
    </option>
  </select>
</div>

<div id="returnTripArea">

  <div class="form-group">
    <label>復路希望</label>
    <select id="returnTrip">
      <option value="○">○</option>
      <option value="×">×</option>
    </select>
  </div>

</div>

<div id="driveArea">

          <div class="form-group">
            <label>送迎可能</label>
            <select id="canDrive">
              <option value="○">○</option>
              <option value="×">×</option>
            </select>
          </div>

          <div id="capacityArea">

            <div class="form-group">
              <label>乗車人数</label>
              <input
                id="capacity"
                type="number"
                min="0"
                value="0">
            </div>

          </div>

                  </div>
               
                      <div class="form-group">
  <label>備考</label>

  <input
    id="note"
    type="text">
</div>

      </div>

      <button
        id="saveBtn"
        class="save-btn">

        回答する

      </button>

    </div>
  `;

  const attendance =
    document.getElementById("attendance");

  const meetingType =
    document.getElementById("meetingType");

  const canDrive =
    document.getElementById("canDrive");

  function updateForm() {

    const detailArea =
      document.getElementById("detailArea");

    const driveArea =
      document.getElementById("driveArea");

    const capacityArea =
      document.getElementById("capacityArea");

    // 欠席
    if (attendance.value === "欠席") {

      detailArea.style.display = "none";
      return;

    }

    detailArea.style.display = "block";

    // 現地集合
    if (meetingType.value === "現地集合") {

      driveArea.style.display = "none";
      return;

    }

    driveArea.style.display = "block";

    // 送迎不可
    if (canDrive.value === "×") {

      capacityArea.style.display = "none";
      return;

    }

    capacityArea.style.display = "block";
  }

  attendance.addEventListener(
    "change",
    updateForm
  );

  meetingType.addEventListener(
    "change",
    updateForm
  );

  canDrive.addEventListener(
    "change",
    updateForm
  );

  updateForm();

  document
    .getElementById("saveBtn")
    .addEventListener(
      "click",
      saveAnswer
    );
}

// =========================
// 保存
// =========================
async function saveAnswer() {

  const coachName =
    document.getElementById("coachName").value;

  const attendance =
    document.getElementById("attendance").value;

  let meetingType = "";
  let returnTrip = "";
  let canDrive = "";
  let capacity = 0;


if (attendance === "参加") {

  meetingType =
    document.getElementById("meetingType").value;

  returnTrip =
    document.getElementById("returnTrip").value;

    if (meetingType === "集合場所集合") {

      canDrive =
        document.getElementById("canDrive").value;

      if (canDrive === "○") {

        capacity = Number(
          document.getElementById("capacity").value
        );

      }

    }

  }

const note =
  document.getElementById("note").value;

const answer = {
  eventId,
  coachName,
  attendance,
  meetingType,
  returnTrip,
  canDrive,
  capacity,
  note,
  createdAt: Date.now()
};  

const answerRef =
  doc(
    db,
    "coach_answers",
    `${eventId}_${coachName}`
  );

const existing =
  await getDoc(answerRef);

if (existing.exists()) {

  const ok = confirm(
    "既に回答済みです。\n回答内容を更新しますか？"
  );

  if (!ok) {
    return;
  }

}
  
  try {

await setDoc(
  answerRef,
  answer
);

    alert("回答を保存しました");

    window.location.href = `./event.html?id=${eventId}`;

  } catch (e) {

    console.error(e);

    alert("保存に失敗しました");

  }

}
