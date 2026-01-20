import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  orderBy,
  where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* Firebase */
const firebaseConfig = {
  apiKey: "★★★★★",
  authDomain: "★★★★★",
  projectId: "minotani-sc-app"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* ====== 日付管理 ====== */
let current = new Date();
current.setDate(1);

const monthLabel = document.getElementById("monthLabel");
const table = document.getElementById("table");
const stats = document.getElementById("stats");

document.getElementById("prevMonth").onclick = () => {
  current.setMonth(current.getMonth() - 1);
  loadAll();
};
document.getElementById("nextMonth").onclick = () => {
  current.setMonth(current.getMonth() + 1);
  loadAll();
};

/* ====== メイン処理 ====== */
async function loadAll() {
  monthLabel.textContent =
    `${current.getFullYear()}年 ${current.getMonth() + 1}月`;

  const [players, events, attendance] = await Promise.all([
    loadPlayers(),
    loadEvents(),
    loadAttendance()
  ]);

  renderTable(players, events, attendance);
  renderStats(players, events, attendance);
}

/* ====== データ取得 ====== */
async function loadPlayers() {
  const snap = await getDocs(
    query(collection(db, "players_attendance"), orderBy("number", "asc"))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function loadEvents() {
  const y = current.getFullYear();
  const m = current.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0);

  const snap = await getDocs(
    query(
      collection(db, "events_attendance"),
      where("date", ">=", start.toISOString().slice(0,10)),
      where("date", "<=", end.toISOString().slice(0,10)),
      orderBy("date", "asc")
    )
  );

  const events = snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));

  /* 🔴 重要：イベントID → 対象チーム を保持 */
  window.eventTeams = {};
  events.forEach(ev => {
    window.eventTeams[ev.id] =
      ev.teams && ev.teams.length ? ev.teams : ["A","B"];
  });

  return events;
}

async function loadAttendance() {
  const snap = await getDocs(collection(db, "attendance_records"));
  return snap.docs.map(d => d.data());
}

/* ====== テーブル描画 ====== */
function renderTable(players, events, attendance) {
  table.innerHTML = "";

  const head = document.createElement("tr");
  head.innerHTML = `
    <th class="no">No</th>
    <th class="name">名前</th>
  `;

  events.forEach(ev => {
    const th = document.createElement("th");
    th.textContent = ev.title || ev.date.slice(5);
    th.dataset.eventId = ev.id;
    th.classList.add(ev.type); // practice / match
    head.appendChild(th);
  });
  table.appendChild(head);

  players.forEach(p => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="no">${p.number}</td>
      <td class="name">${p.name}</td>
    `;

    events.forEach(ev => {
      const td = document.createElement("td");
      const rec = attendance.find(a =>
        a.playerId === p.id && a.eventId === ev.id
      );

      td.textContent = rec ? rec.status : "－";
      td.classList.add(ev.type);
      tr.appendChild(td);
    });

    table.appendChild(tr);
  });
}

/* ====== 出席率カード ====== */
function renderStats(players, events, attendance) {
  stats.innerHTML = "";

  players.forEach(p => {
    let attend = 0;
    let target = 0;

    events.forEach(ev => {
      const teams = window.eventTeams[ev.id] || ["A","B"];
      if (!teams.includes(p.team)) return;

      target++;
      const rec = attendance.find(a =>
        a.playerId === p.id && a.eventId === ev.id
      );
      if (rec && rec.status === "○") attend++;
    });

    const rate = target ? Math.round(attend / target * 100) : 0;

    const card = document.createElement("div");
    card.className = "statsCard";
    card.innerHTML = `
      <strong>${p.name}</strong><br>
      出席率：${rate}%（${attend}/${target}）
    `;
    stats.appendChild(card);
  });
}

/* 初期表示 */
loadAll();
