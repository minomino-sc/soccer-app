/* ===============================
   Firebase SDK（GitHub Pages対応）
================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ===============================
   Firebase 設定（既存 箕谷システムと同じ）
================================ */
const firebaseConfig = {
  apiKey: "★★★★★ 既存の値 ★★★★★",
  authDomain: "★★★★★ 既存の値 ★★★★★",
  projectId: "minotani-sc-app",
  storageBucket: "★★★★★",
  messagingSenderId: "★★★★★",
  appId: "★★★★★"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* ===============================
   出欠入力画面（attendance/index.html）
================================ */
const eventList = document.getElementById("eventList");

if (eventList) {
  initAttendance();
}

async function initAttendance() {
  eventList.innerHTML = "<p>読み込み中...</p>";

  const eventsSnap = await getDocs(
    query(collection(db, "events_attendance"), orderBy("date", "asc"))
  );
  const playersSnap = await getDocs(
    query(collection(db, "players_attendance"), orderBy("name", "asc"))
  );

  eventList.innerHTML = "";

  if (eventsSnap.empty || playersSnap.empty) {
    eventList.innerHTML = "<p>イベントまたは部員が登録されていません</p>";
    return;
  }

  eventsSnap.forEach(evDoc => {
    const ev = evDoc.data();

    const box = document.createElement("div");
    box.className = "event";
    box.innerHTML = `
      <strong>
        ${ev.date} ${ev.title}
        （${ev.type === "practice" ? "練習" : "試合"}）
      </strong>
    `;

    playersSnap.forEach(plDoc => {
      const pl = plDoc.data();

      const wrap = document.createElement("div");
      wrap.className = "player";

      wrap.innerHTML = `
        <div class="row">
          <span>${pl.name}</span>
          <span>
            <button class="present">出席</button>
            <button class="absent">欠席</button>
          </span>
        </div>
        <textarea
          placeholder="欠席理由（任意）"
          style="display:none"
        ></textarea>
      `;

      const reason = wrap.querySelector("textarea");

      wrap.querySelector(".present").onclick = async () => {
        await saveAttendance(evDoc.id, plDoc.id, "present", "");
        alert(`${pl.name}：出席で保存しました`);
      };

      wrap.querySelector(".absent").onclick = async () => {
        reason.style.display = "block";
        await saveAttendance(evDoc.id, plDoc.id, "absent", reason.value);
        alert(`${pl.name}：欠席で保存しました`);
      };

      box.appendChild(wrap);
    });

    eventList.appendChild(box);
  });
}

async function saveAttendance(eventId, playerId, status, reason) {
  await addDoc(collection(db, "attendance_logs"), {
    eventId,
    playerId,
    status,
    reason,
    createdAt: serverTimestamp()
  });
}

/* ===============================
   出席率表示（attendance/stats.html）
================================ */
const table = document.getElementById("statsTable");

if (table) {
  initStats();
}

async function initStats() {
  const players = await getDocs(
    query(collection(db, "players_attendance"), orderBy("name", "asc"))
  );
  const events = await getDocs(collection(db, "events_attendance"));
  const logs = await getDocs(
    query(collection(db, "attendance_logs"), orderBy("createdAt", "asc"))
  );

  // 最新の出欠だけを保持
  const latest = {};
  logs.forEach(l => {
    const d = l.data();
    latest[`${d.eventId}_${d.playerId}`] = d;
  });

  players.forEach(p => {
    let pHit = 0, pTotal = 0;
    let mHit = 0, mTotal = 0;

    events.forEach(e => {
      const ev = e.data();
      const key = `${e.id}_${p.id}`;
      const hit = latest[key]?.status === "present";

      if (ev.type === "practice") {
        pTotal++;
        if (hit) pHit++;
      }
      if (ev.type === "match") {
        mTotal++;
        if (hit) mHit++;
      }
    });

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.data().name}</td>
      <td>${pTotal ? Math.round(pHit / pTotal * 100) : 0}%</td>
      <td>${mTotal ? Math.round(mHit / mTotal * 100) : 0}%</td>
      <td>${(pTotal + mTotal)
        ? Math.round((pHit + mHit) / (pTotal + mTotal) * 100)
        : 0}%</td>
    `;
    table.appendChild(tr);
  });
}
