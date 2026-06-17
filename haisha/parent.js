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

// =========================
// IDチェック
// =========================
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

  if (eventData.target === "箕谷A") {
    players = TEAM_A;
  }

  if (eventData.target === "箕谷B") {
    players = TEAM_B;
  }

  if (eventData.target === "箕谷A/B") {
    players = [...TEAM_A, ...TEAM_B];
  }

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

      <div class="form-group">
        <label>備考</label>
        <input id="note" type="text">
      </div>

      <button id="saveBtn" class="save-btn">
        回答する
      </button>

    </div>
  `;

  document
    .getElementById("saveBtn")
    .addEventListener("click", saveAnswer);
}

// =========================
// 保存処理（ここが最重要修正部分）
// =========================
async function saveAnswer() {

  const playerName = document.getElementById("player").value;
const attendance = document.getElementById("attendance").value;
const note = document.getElementById("note").value;
const meetingType = document.getElementById("meetingType").value;
  
  const answer = {
    eventId,
    playerName,
    attendance,
    note,
    createdAt: Date.now()
  };

const answerRef =
  doc(
    db,
    "parent_answers",
    `${eventId}_${playerName}`
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

    // ⭐1人1回答（上書き保存）
await setDoc(
  answerRef,
  answer
);
  
    alert("回答を保存しました");

    window.history.back();

  } catch (e) {

    console.error(e);
    alert("保存に失敗しました");

  }
}
