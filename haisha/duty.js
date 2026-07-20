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

  // 配車確定後は試合当番を変更不可
if (eventData.dispatchConfirmed) {

  document.getElementById("dutyForm").innerHTML = `
    <div class="event-card">
      <div class="event-title">
        🚫 配車確定済み
      </div>

      <div class="event-meta">
        このイベントは配車確定済みのため、
        試合当番を変更できません。
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
  試合当番①
</label>

<select id="teamA1">

${TEAM_A.map(
  p =>
  `<option value="${p}">${getLastName(p)}さん</option>`
).join("")}

</select>

<br><br>

<label>
  試合当番②
</label>

<select id="teamA2">

<option value="">なし</option>

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
  試合当番①
</label>

<select id="teamB1">

${TEAM_B.map(
  p =>
  `<option value="${p}">${getLastName(p)}さん</option>`
).join("")}

</select>

<br><br>

<label>
  試合当番②
</label>

<select id="teamB2">

<option value="">なし</option>

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
Aチーム 試合当番①
</label>

<select id="teamA1">
${TEAM_A.map(
  p => `<option value="${p}">${getLastName(p)}さん</option>`
).join("")}
</select>

<br><br>

<label>
Aチーム 試合当番②
</label>

<select id="teamA2">
<option value="">なし</option>
${TEAM_A.map(
  p => `<option value="${p}">${getLastName(p)}さん</option>`
).join("")}
</select>

</div>

<div class="form-group">

<label>
Bチーム 試合当番①
</label>

<select id="teamB1">
${TEAM_B.map(
  p => `<option value="${p}">${getLastName(p)}さん</option>`
).join("")}
</select>

<br><br>

<label>
Bチーム 試合当番②
</label>

<select id="teamB2">
<option value="">なし</option>
${TEAM_B.map(
  p => `<option value="${p}">${getLastName(p)}さん</option>`
).join("")}
</select>

</div>

<button id="saveBtn" class="save-btn">
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

const teamA1 =
  document.getElementById("teamA1")
    ?.value || "";

const teamA2 =
  document.getElementById("teamA2")
    ?.value || "";

const teamB1 =
  document.getElementById("teamB1")
    ?.value || "";

const teamB2 =
  document.getElementById("teamB2")
    ?.value || "";

// 同じ人を重複選択できないようにする
if (
  teamA1 &&
  teamA2 &&
  teamA1 === teamA2
) {
  alert("Aチームの試合当番①と②は別の人を選択してください。");
  return;
}

if (
  teamB1 &&
  teamB2 &&
  teamB1 === teamB2
) {
  alert("Bチームの試合当番①と②は別の人を選択してください。");
  return;
}
  
  const dutyRef =
  doc(db, "match_duties", eventId);

const oldDutySnap =
  await getDoc(dutyRef);

let oldTeamA1 = "";
let oldTeamA2 = "";
let oldTeamB1 = "";
let oldTeamB2 = "";

if (oldDutySnap.exists()) {

  const oldData =
    oldDutySnap.data();

oldTeamA1 = oldData.teamA1 || "";
oldTeamA2 = oldData.teamA2 || "";
oldTeamB1 = oldData.teamB1 || "";
oldTeamB2 = oldData.teamB2 || "";
}

await setDoc(
  doc(
    db,
    "match_duties",
    eventId
  ),
  {
    eventId,
    teamA1,
    teamA2,
    teamB1,
    teamB2,
    updatedAt: Date.now()
  }
);

// =========================
// 旧試合当番回答削除
// =========================

const deleteList = [
  [oldTeamA1, teamA1],
  [oldTeamA2, teamA2],
  [oldTeamB1, teamB1],
  [oldTeamB2, teamB2]
];

for (const [oldName, newName] of deleteList) {

  if (
    oldName &&
    oldName !== newName
  ) {

    await deleteDoc(
      doc(
        db,
        "duty_answers",
        `${eventId}_${oldName}`
      )
    );

  }

}
  
  alert(
    "試合当番を保存しました"
  );

 window.location.href = `./event.html?id=${eventId}`;
  
}
