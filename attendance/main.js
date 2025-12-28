import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, getDocs, addDoc,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* Firebase設定（差し替え） */
const firebaseConfig = {
  apiKey: "YOUR_KEY",
  authDomain: "YOUR_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* ---------- 出欠入力 ---------- */
const eventList = document.getElementById("eventList");

if (eventList) {
  const eventsSnap = await getDocs(collection(db, "events_attendance"));
  const playersSnap = await getDocs(collection(db, "players_attendance"));

  eventsSnap.forEach(evDoc => {
    const ev = evDoc.data();
    const box = document.createElement("div");
    box.className = "event";
    box.innerHTML = `<strong>${ev.date} ${ev.title}（${ev.type}）</strong>`;

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
        <textarea placeholder="欠席理由（任意）" style="display:none"></textarea>
      `;

      const reason = wrap.querySelector("textarea");

      wrap.querySelector(".present").onclick = () =>
        save(evDoc.id, plDoc.id, "present");

      wrap.querySelector(".absent").onclick = () => {
        reason.style.display = "block";
        save(evDoc.id, plDoc.id, "absent", reason.value);
      };

      box.appendChild(wrap);
    });

    eventList.appendChild(box);
  });
}

async function save(eventId, playerId, status, reason = "") {
  await addDoc(collection(db, "attendance_logs"), {
    eventId,
    playerId,
    status,
    reason,
    createdAt: serverTimestamp()
  });
  alert("保存しました");
}

/* ---------- 出席率集計（最新のみ） ---------- */
const table = document.getElementById("statsTable");

if (table) {
  const players = await getDocs(collection(db, "players_attendance"));
  const events = await getDocs(collection(db, "events_attendance"));
  const logs = await getDocs(
    query(collection(db, "attendance_logs"), orderBy("createdAt", "asc"))
  );

  // 最新ログ抽出
  const latest = {};
  logs.forEach(l => {
    const d = l.data();
    latest[`${d.eventId}_${d.playerId}`] = d;
  });

  players.forEach(p => {
    let pHit = 0, pTotal = 0, mHit = 0, mTotal = 0;

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
      <td>${Math.round((pHit + mHit) / (pTotal + mTotal || 1) * 100)}%</td>
    `;
    table.appendChild(tr);
  });
}
