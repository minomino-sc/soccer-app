import { db } from "./firebase.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

console.log("event loaded");

// =========================
// 日時フォーマット
// =========================
function formatDateTime(value) {
  if (!value) return "";
  return value.replace("T", " ");
}

// URLの ?id= を取得
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

  const ref = doc(db, "car_dispatch_events", id);
  const snap = await getDoc(ref);

  if (!snap.exists()) {

    document.getElementById("eventDetail").innerHTML = `
      <div class="event-card">
        予定が見つかりません
      </div>
    `;

    return;
  }

  const data = snap.data();

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

    <div class="event-card menu-card">
      <div class="event-title">👨‍👩‍👧‍👦 保護者回答</div>
      <div class="event-meta">回答数 0 / 0</div>
    </div>

    <div class="event-card menu-card">
      <div class="event-title">🧑‍🏫 コーチ回答</div>
      <div class="event-meta">回答数 0 / 0</div>
    </div>

    <div class="event-card menu-card">
      <div class="event-title">🧑 試合当番</div>
      <div class="event-meta">未設定</div>
    </div>

    <div class="event-card menu-card">
      <div class="event-title">🚗 配車作成</div>
      <div class="event-meta">未作成</div>
    </div>

  `;
}
