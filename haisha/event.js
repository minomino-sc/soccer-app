import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { TEAM_A, TEAM_B } from "./players.js";

console.log("event loaded");

// =========================
// 日時フォーマット
// =========================
function formatDateTime(value) {
  if (!value) return "";
  return value.replace("T", " ");
}

// =========================
// 回答数取得
// =========================
async function getAnswerCount(eventId) {
  const q = query(
    collection(db, "parent_answers"),
    where("eventId", "==", eventId)
  );

  const snap = await getDocs(q);
  return snap.size;
}

// =========================
// 対象人数取得（改善ポイント）
// =========================
function getTotalPlayers(target) {
  if (target === "箕谷A") return TEAM_A.length;
  if (target === "箕谷B") return TEAM_B.length;
  if (target === "箕谷A/B") return TEAM_A.length + TEAM_B.length;
  return 0;
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

  // =========================
  // 回答数取得
  // =========================
  const answered = await getAnswerCount(id);

  // =========================
  // 分母（改善版：固定廃止）
  // =========================
  const total = getTotalPlayers(data.target);

  // =========================
  // 画面描画
  // =========================
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

    <div class="event-card menu-card" id="parentMenu">
      <div class="event-title">👨‍👩‍👧‍👦 保護者回答</div>
      <div class="event-meta" id="answerCount">
        回答数 ${answered} / ${total}
      </div>
    </div>

<div class="event-card menu-card" id="coachMenu">
  <div class="event-title">🧑‍🏫 コーチ回答</div>
  <div class="event-meta">回答する</div>
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

  // =========================
  // 保護者回答へ遷移
  // =========================
  document
    .getElementById("parentMenu")
    .addEventListener("click", () => {

      window.location.href =
        `parent.html?id=${id}`;

    });

// =========================
// コーチ回答へ遷移
// =========================
document
  .getElementById("coachMenu")
  .addEventListener("click", () => {

    window.location.href =
      `coach.html?id=${id}`;

  });
  
  // =========================
  // 回答一覧へ遷移
  // =========================
  const answerListBtn =
    document.getElementById("answerListBtn");

  if (answerListBtn) {

    answerListBtn.addEventListener("click", () => {

      window.location.href =
        `answers.html?id=${id}`;

    });

  }

}
