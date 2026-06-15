import { db } from "./firebase.js";
import { TEAM_A, TEAM_B } from "./players.js";

import {
  collection,
  addDoc,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const eventId = params.get("id");

if (!eventId) {

  document.getElementById("parentForm").innerHTML =
    "イベントIDがありません";

} else {

  loadForm();

}

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

async function saveAnswer() {

  const answer = {
    eventId,
    playerName: document.getElementById("player").value,
    attendance: document.getElementById("attendance").value,
    note: document.getElementById("note").value,
    createdAt: Date.now()
  };

  try {

    await addDoc(
      collection(db, "parent_answers"),
      answer
    );

    alert("回答を保存しました");

    window.history.back();

  } catch (e) {

    console.error(e);
    alert("保存に失敗しました");

  }
}
