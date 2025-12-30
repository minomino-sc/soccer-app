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

/* Firebase */
const firebaseConfig = {
  apiKey: "★★★★★",
  authDomain: "★★★★★",
  projectId: "minotani-sc-app",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* DOM */
const table = document.getElementById("table");
const monthLabel = document.getElementById("monthLabel");

/* 状態 */
let current = new Date();
let latestStatus = {};

/* 初期表示 */
render();

/* メイン描画 */
async function render() {
  table.innerHTML = "";

  monthLabel.textContent =
    `${current.getFullYear()}年 ${current.getMonth() + 1}月`;

  /* データ取得 */
  const playersSnap = await getDocs(collection(db, "players_attendance"));
  const eventsSnap = await getDocs(
    query(collection(db, "events_attendance"), orderBy("date"))
  );
  const logsSnap = await getDocs(
    query(collection(db, "attendance_logs"), orderBy("createdAt"))
  );

  /* 部員：背番号順に並び替え */
  const players = playersSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.number ?? 999) - (b.number ?? 999));

  /* 月フィルタ */
  const events = eventsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(e => {
      const d = new Date(e.date);
      return (
        d.getFullYear() === current.getFullYear() &&
        d.getMonth() === current.getMonth()
      );
    });

  /* 最新出欠 */
  latestStatus = {};
  logsSnap.forEach(l => {
    const d = l.data();
    latestStatus[`${d.eventId}_${d.playerId}`] = d.status;
  });

  /* ヘッダ */
  const trH = document.createElement("tr");
  trH.innerHTML =
    "<th>背</th><th>名前</th>" +
    events.map(e => {
      const d = new Date(e.date);
      const type = e.type === "match" ? "試合" : "練習";
      return `<th>${d.getDate()}<br>${type}</th>`;
    }).join("");
  table.appendChild(trH);

  /* 行 */
  players.forEach(p => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${p.number ?? ""}</td><td class="name">${p.name}</td>`;

    events.forEach(e => {
      const key = `${e.id}_${p.id}`;
      const status = latestStatus[key] || "skip";

      const td = document.createElement("td");
      td.textContent =
        status === "present" ? "○" :
        status === "absent"  ? "×" : "－";

      td.onclick = async () => {
        const next =
          status === "skip" ? "present" :
          status === "present" ? "absent" : "skip";

        await addDoc(collection(db, "attendance_logs"), {
          eventId: e.id,
          playerId: p.id,
          status: next,
          createdAt: serverTimestamp()
        });

        render();
      };

      tr.appendChild(td);
    });

    table.appendChild(tr);
  });
}
