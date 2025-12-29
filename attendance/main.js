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
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* 状態 */
let current = new Date();
let filterType = "all";

/* DOM */
const table = document.getElementById("attendanceTable");
const label = document.getElementById("currentMonth");

if (table) init();

async function init() {
  document.getElementById("prevMonth").onclick = () => {
    current.setMonth(current.getMonth() - 1);
    render();
  };
  document.getElementById("nextMonth").onclick = () => {
    current.setMonth(current.getMonth() + 1);
    render();
  };

  document.querySelectorAll("#controls button[data-type]").forEach(btn => {
    btn.onclick = () => {
      filterType = btn.dataset.type;
      render();
    };
  });

  render();
}

async function render() {
  label.textContent = `${current.getFullYear()}年 ${current.getMonth() + 1}月`;

  const playersSnap = await getDocs(
    query(collection(db, "players_attendance"), orderBy("name"))
  );
  const eventsSnap = await getDocs(
    query(collection(db, "events_attendance"), orderBy("date"))
  );
  const logsSnap = await getDocs(
    query(collection(db, "attendance_logs"), orderBy("createdAt"))
  );

  const latest = {};
  logsSnap.forEach(l => {
    const d = l.data();
    latest[`${d.playerId}_${d.eventId}`] = d;
  });

  const events = [];
  eventsSnap.forEach(e => {
    const ev = e.data();
    const d = new Date(ev.date);
    if (
      d.getFullYear() === current.getFullYear() &&
      d.getMonth() === current.getMonth() &&
      (filterType === "all" || ev.type === filterType)
    ) {
      events.push({ id: e.id, ...ev });
    }
  });

  /* 表描画 */
  let html = "<tr><th>部員</th>";
  events.forEach(e => html += `<th>${e.date}</th>`);
  html += "</tr>";

  playersSnap.forEach(p => {
    html += `<tr><td>${p.data().name}</td>`;
    events.forEach(e => {
      const key = `${p.id}_${e.id}`;
      const s = latest[key]?.status;
      const mark = s === "present" ? "○" : s === "absent" ? "×" : "－";
      html += `
        <td style="text-align:center;font-size:20px"
            data-p="${p.id}" data-e="${e.id}">
          ${mark}
        </td>`;
    });
    html += "</tr>";
  });

  table.innerHTML = html;

  /* クリック保存 */
  table.querySelectorAll("td[data-p]").forEach(td => {
    td.onclick = async () => {
      const next = td.textContent === "○" ? "×" : "○";
      td.textContent = next;

      await addDoc(collection(db, "attendance_logs"), {
        playerId: td.dataset.p,
        eventId: td.dataset.e,
        status: next === "○" ? "present" : "absent",
        createdAt: serverTimestamp()
      });
    };
  });
}
