import { db } from "./firebase.js";
import { TEAM_A, TEAM_B } from "./players.js";

import {
  collection,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const eventId = params.get("id");

if (!eventId) {
  document.getElementById("parentForm").innerHTML =
    "イベントIDがありません";
} else {
  loadForm();
}

// =========================
// フォーム表示
// =========================
async function loadForm() {

  const eventRef = doc(db, "car_dispatch_events", eventId);
  const eventSnap = await getDoc(eventRef);

  if (!eventSnap.exists()) {
    document.getElementById("parentForm").innerHTML =
      "イベントが見つかりません";
    return;
  }

  const eventData = eventSnap.data();

  let players = [];

  if (eventData.target === "箕谷A") players = TEAM_A;
  if (eventData.target === "箕谷B") players = TEAM_B;
  if (eventData.target === "箕谷A/B") players = [...TEAM_A, ...TEAM_B];

  document.getElementById("parentForm").innerHTML = `
    <div class="form-card">

      <div class="form-group">
        <label>選手名</label>
        <select id="player">
          ${players.map(p => `<option>${p}</option>`).join("")}
        </select>
      </div>

      <div class="form-group">
        <label>出欠</label>
        <select id="attendance">
          <option value="参加">参加</option>
          <option value="欠席">欠席</option>
        </select>
      </div>

      <div id="meetingWrap">
        <div class="form-group">
          <label>集合方法</label>
          <select id="meetingType">
            <option value="pickup">集合場所に集合</option>
            <option value="onsite">現地集合</option>
          </select>
        </div>
      </div>

<div id="returnTripWrap">
  <div class="form-group">
    <label>復路希望</label>
    <select id="returnTrip">
      <option value="○">○</option>
      <option value="×">×</option>
    </select>
  </div>
</div>

<div id="driveWrap">

  <div class="form-group">
    <label>送迎可能</label>
    <select id="canDrive">
      <option value="×">×</option>
      <option value="○">○</option>
    </select>
  </div>

  <div class="form-group">
    <label>乗車人数</label>
    <input
      id="capacity"
      type="number"
      min="0"
      value="0">
  </div>

</div>

      <div class="form-group">
        <label>備考</label>
        <input id="note" type="text">
      </div>

      <button id="saveBtn" class="save-btn">
        回答する
      </button>

    </div>
  `;

  const attendanceEl = document.getElementById("attendance");
  const meetingWrap = document.getElementById("meetingWrap");
const returnTripWrap = document.getElementById("returnTripWrap");

function updateUI() {
  if (attendanceEl.value === "欠席") {
    meetingWrap.style.display = "none";
    returnTripWrap.style.display = "none";
  } else {
    meetingWrap.style.display = "block";
    returnTripWrap.style.display = "block";
  }
}

  attendanceEl.addEventListener("change", updateUI);
  updateUI();

  document
    .getElementById("saveBtn")
    .addEventListener("click", saveAnswer);
}

// =========================
// 保存処理
// =========================
async function saveAnswer() {

const playerName = document.getElementById("player").value;
const attendance = document.getElementById("attendance").value;
const note = document.getElementById("note").value;

let meetingType = "";
let returnTrip = "";
let canDrive = "";
let capacity = 0;
  
// 欠席なら送らない
if (attendance === "参加") {
  meetingType = document.getElementById("meetingType").value;
  returnTrip = document.getElementById("returnTrip").value;
  canDrive = document.getElementById("canDrive").value;
  capacity = Number(document.getElementById("capacity").value);
}

const answer = {
  eventId,
  playerName,
  attendance,
  note,
  meetingType,
  returnTrip,
  canDrive,
  capacity,
  createdAt: Date.now()
};

  const answerRef = doc(
    db,
    "parent_answers",
    `${eventId}_${playerName}`
  );

  const existing = await getDoc(answerRef);

  if (existing.exists()) {
    const ok = confirm("既に回答済みです。\n更新しますか？");
    if (!ok) return;
  }

  try {
await setDoc(answerRef, answer);

alert("回答を保存しました");

// 状態付きで戻る
    window.location.href = `./event.html?id=${eventId}`;
    
  } catch (e) {
    console.error(e);
    alert("保存に失敗しました");
  }
}
