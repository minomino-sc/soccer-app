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

  /* 最新出欠 */
  const latest = {};
  logsSnap.forEach(l => {
    const d = l.data();
    latest[`${d.playerId}_${d.eventId}`] = d;
  });

  /* 今月＋種別 */
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

  /* 表ヘッダ */
  let html = "<tr><th>部員</th>";
  events.forEach(e => {
    const bg = e.type === "match" ? "#ffe4e6" : "#eef2ff";
    html += `<th style="background:${bg}">${e.date}</th>`;
  });
  html += "</tr>";

  /* 表本体 */
  playersSnap.forEach(p => {
    html += `<tr><td>${p.data().name}</td>`;
    events.forEach(e => {
      const key = `${p.id}_${e.id}`;
      const s = latest[key]?.status;
      let mark = "－";
      let bg = "#f3f4f6"; // 未入力グレー

      if (s === "present") {
        mark = "○";
        bg = "#dcfce7";
      }
      if (s === "absent") {
        mark = "×";
        bg = "#fee2e2";
      }

      html += `
        <td style="background:${bg}"
            data-p="${p.id}" data-e="${e.id}">
          ${mark}
        </td>`;
    });
    html += "</tr>";
  });

  table.innerHTML = html;

  /* タップで切替 */
  table.querySelectorAll("td[data-p]").forEach(td => {
    td.onclick = async () => {
      const next = td.textContent === "○" ? "×" : "○";
      td.textContent = next;
      td.style.background = next === "○" ? "#dcfce7" : "#fee2e2";

      await addDoc(collection(db, "attendance_logs"), {
        playerId: td.dataset.p,
        eventId: td.dataset.e,
        status: next === "○" ? "present" : "absent",
        createdAt: serverTimestamp()
      });
    };
  });
}
