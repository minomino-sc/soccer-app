import { db } from "./firebase.js";

import {
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// =========================
// URLからeventId取得
// =========================
const params =
  new URLSearchParams(
    window.location.search
  );

const eventId =
  params.get("id");

if (!eventId) {

  document.getElementById("dutyForm").innerHTML =
    "イベントIDがありません";

} else {

  loadForm();

}

// =========================
// 試合当番表示名
// =========================
function formatDutyName(name) {

  if (!name) return "";

  const parts =
    name.trim().split(/\s+/);

  return parts[0] + "さん";

}

// =========================
// フォーム表示
// =========================
async function loadForm() {

  const eventRef =
    doc(
      db,
      "car_dispatch_events",
      eventId
    );

  const eventSnap =
    await getDoc(eventRef);

  if (!eventSnap.exists()) {

    document.getElementById("dutyForm").innerHTML =
      "イベントが見つかりません";

    return;

  }

  const eventData =
    eventSnap.data();

  // =========================
  // 試合当番取得
  // =========================
  const dutyRef =
    doc(
      db,
      "match_duties",
      eventId
    );

  const dutySnap =
    await getDoc(dutyRef);

  if (!dutySnap.exists()) {

    document.getElementById("dutyForm").innerHTML =
      "試合当番が設定されていません";

    return;

  }

  const dutyData =
    dutySnap.data();

// 配車確定後は回答不可
if (eventData.dispatchConfirmed) {

  document.getElementById("dutyForm").innerHTML = `
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
  
  let dutyMembers = [];

if (
  eventData.target === "箕谷A"
) {

  if (dutyData.teamA1) {
    dutyMembers.push(
      dutyData.teamA1
    );
  }

  if (dutyData.teamA2) {
    dutyMembers.push(
      dutyData.teamA2
    );
  }

}

if (
  eventData.target === "箕谷B"
) {

  if (dutyData.teamB1) {
    dutyMembers.push(
      dutyData.teamB1
    );
  }

  if (dutyData.teamB2) {
    dutyMembers.push(
      dutyData.teamB2
    );
  }

}

if (
  eventData.target === "箕谷A/B"
) {

  if (dutyData.teamA1) {
    dutyMembers.push(
      dutyData.teamA1
    );
  }

  if (dutyData.teamA2) {
    dutyMembers.push(
      dutyData.teamA2
    );
  }

  if (dutyData.teamB1) {
    dutyMembers.push(
      dutyData.teamB1
    );
  }

  if (dutyData.teamB2) {
    dutyMembers.push(
      dutyData.teamB2
    );
  }

}

  if (
    dutyMembers.length === 0
  ) {

    document.getElementById("dutyForm").innerHTML =
      "試合当番が設定されていません";

    return;

  }

  // =========================
  // フォーム描画
  // =========================
  document.getElementById("dutyForm").innerHTML = `

    <div class="form-card">

      <div class="form-group">
        <label>
          試合当番
        </label>

        <select id="dutyName">
          ${dutyMembers.map(name => `
            <option value="${name}">
              ${formatDutyName(name)}
            </option>
          `).join("")}
        </select>
      </div>

      <div class="form-group">
        <label>
          配車可能
        </label>

        <select id="canDrive">
          <option value="○">
            ○
          </option>

          <option value="×">
            ×
          </option>
        </select>
      </div>

<div class="form-group">

  <label>
    復路希望
  </label>

  <select id="returnTrip">

    <option value="○">
      ○
    </option>

    <option value="×">
      ×
    </option>

  </select>

</div>

        <div class="form-group">

  <label>
    試合道具積載可能
  </label>

  <select id="canCarryEquipment">

    <option value="○">
      ○
    </option>

    <option value="×">
      ×
    </option>

  </select>

</div>

      <div id="capacityArea">

        <div class="form-group">

          <label>
            乗車人数
          </label>

          <input
            id="capacity"
            type="number"
            min="0"
            value="0">

        </div>

      </div>

      <div class="form-group">

  <label>
    備考
  </label>

  <input
    id="note"
    type="text">

</div>

      <button
        id="saveBtn"
        class="save-btn">

        回答する

      </button>

    </div>

  `;

  const canDrive =
    document.getElementById(
      "canDrive"
    );

  function updateForm() {

    const capacityArea =
      document.getElementById(
        "capacityArea"
      );

    if (
      canDrive.value === "×"
    ) {

      capacityArea.style.display =
        "none";

      return;

    }

    capacityArea.style.display =
      "block";

  }

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

  const dutyName =
    document.getElementById(
      "dutyName"
    ).value;

  const canDrive =
    document.getElementById(
      "canDrive"
    ).value;

  const canCarryEquipment =
  document.getElementById(
    "canCarryEquipment"
  ).value;

  let capacity = 0;

  if (
    canDrive === "○"
  ) {

    capacity = Number(
      document.getElementById(
        "capacity"
      ).value
    );

  }

const returnTrip =
  document.getElementById(
    "returnTrip"
  ).value;
 
const note =
  document.getElementById(
    "note"
  ).value;

const answer = {

  eventId,
  dutyName,
  canDrive,
  returnTrip,
  canCarryEquipment,
  capacity,
  note,
  createdAt: Date.now()

};

const answerRef =
  doc(
    db,
    "duty_answers",
    `${eventId}_${dutyName}`
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
    
    alert(
      "回答を保存しました"
    );

    window.location.href = `./event.html?id=${eventId}`;

  } catch (e) {

    console.error(e);

    alert(
      "保存に失敗しました"
    );

  }

}
