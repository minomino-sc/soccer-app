import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, getDocs, addDoc,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* Firebase設定（既存と同じ） */
const firebaseConfig = {
  apiKey: "★★★★★",
  authDomain: "★★★★★",
  projectId: "minotani-sc-app",
  storageBucket: "★★★★★",
  messagingSenderId: "★★★★★",
  appId: "★★★★★"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* ---------- 出欠入力 ---------- */
const eventList = document.getElementById("eventList");
let selectedType = "practice"; // 初期：練習

if (eventList) init();

async function init() {
  const events = await getDocs(query(
    collection(db, "events_attendance"),
    orderBy("date", "desc")
  ));
  const players = await getDocs(
    query(collection(db, "players_attendance"), orderBy("name"))
  );

  // 種別切替UI
  const switcher = document.createElement("div");
  switcher.innerHTML = `
    <button id="btnPractice">練習</button>
    <button id="btnMatch">試合</button>
    <hr>
  `;
  eventList.appendChild(switcher);

  document.getElementById("btnPractice").onclick = () => {
    selectedType = "practice";
    render(events, players);
  };
  document.getElementById("btnMatch").onclick = () => {
    selectedType = "match";
    render(events, players);
  };

  render(events, players);
}

function render(events, players) {
  // 既存表示削除
  document.querySelectorAll(".event").forEach(e => e.remove());

  events.forEach(evDoc => {
    const ev = evDoc.data();
    if (ev.type !== selectedType) return;

    const box = document.createElement("div");
    box.className = "event";
    box.innerHTML = `<strong>${ev.date} ${ev.title}</strong>`;

    players.forEach(plDoc => {
      const pl = plDoc.data();
      const row = document.createElement("div");
      row.className = "player";

      row.innerHTML = `
        <div class="row">
          <span>${pl.name}</span>
          <span>
            <button class="present">出席</button>
            <button class="absent">欠席</button>
          </span>
        </div>
        <textarea placeholder="欠席理由" style="display:none"></textarea>
      `;

      const presentBtn = row.querySelector(".present");
      const absentBtn = row.querySelector(".absent");
      const reason = row.querySelector("textarea");

      presentBtn.onclick = async () => {
        presentBtn.style.opacity = "1";
        absentBtn.style.opacity = "0.3";
        reason.style.display = "none";
        await save(evDoc.id, plDoc.id, "present", "");
      };

      absentBtn.onclick = async () => {
        absentBtn.style.opacity = "1";
        presentBtn.style.opacity = "0.3";
        reason.style.display = "block";
        await save(evDoc.id, plDoc.id, "absent", reason.value);
      };

      box.appendChild(row);
    });

    eventList.appendChild(box);
  });
}

async function save(eventId, playerId, status, reason) {
  await addDoc(collection(db, "attendance_logs"), {
    eventId,
    playerId,
    status,
    reason,
    createdAt: serverTimestamp()
  });
}
