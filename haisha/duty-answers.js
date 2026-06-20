import { db } from "./firebase.js";

import {
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const params =
  new URLSearchParams(
    window.location.search
  );

const eventId =
  params.get("id");

if (!eventId) {

  document.getElementById("answerList").innerHTML =
    "イベントIDがありません";

} else {

  loadAnswers();

}

function formatDutyName(name) {

  if (!name) return "";

  const parts =
    name.trim().split(/\s+/);

  return parts[0] + "さん";

}

async function loadAnswers() {

  const list =
    document.getElementById("answerList");

  const q = query(
    collection(db, "duty_answers"),
    where("eventId", "==", eventId)
  );

  const snap =
    await getDocs(q);

  let driveYes = 0;
  let driveNo = 0;
  let totalSeats = 0;

  let equipmentYes = 0;
  let equipmentNo = 0;

  let html = "";

  snap.forEach(docSnap => {

    const data =
      docSnap.data();

    // 送迎集計
    if (data.canDrive === "○") {

      driveYes++;

      totalSeats +=
        Number(data.capacity || 0);

    } else {

      driveNo++;

    }

    // 試合道具集計
    if (data.canCarryEquipment === "○") {

      equipmentYes++;

    } else {

      equipmentNo++;

    }

    html += `
      <div class="event-card">

        <div class="event-title">
          ${formatDutyName(data.dutyName)}
        </div>

        <div class="event-meta">
          送迎：${data.canDrive}
        </div>

        <div class="event-meta">
          乗車人数：${data.capacity || 0}
        </div>

        <div class="event-meta">
          🎒試合道具：${data.canCarryEquipment || "×"}
        </div>

        <div class="event-meta">
          備考：${data.note || "なし"}
        </div>

        <div class="event-meta">
          時刻：${new Date(
            data.createdAt
          ).toLocaleString()}
        </div>

      </div>
    `;

  });

  list.innerHTML = `

    <div class="event-card">

      <div class="event-title">
        📊 集計
      </div>

      <div class="event-meta">
        🚗送迎可能 ${driveYes}
      </div>

      <div class="event-meta">
        ❌送迎不可 ${driveNo}
      </div>

      <div class="event-meta">
        🪑総乗車可能人数 ${totalSeats}
      </div>

      <div class="event-meta">
        🎒試合道具積載可能 ${equipmentYes}
      </div>

      <div class="event-meta">
        ❌試合道具積載不可 ${equipmentNo}
      </div>

    </div>

    ${html}

  `;

}
