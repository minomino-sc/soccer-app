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

  const year = current.getFullYear();
  const month = String(current.getMonth() + 1).padStart(2, "0");
  monthLabel.textContent = `${year}年 ${Number(month)}月`;

  /* データ取得 */
  const playersSnap = await getDocs(collection(db, "players_attendance"));
  const eventsSnap = await getDocs(
    query(collection(db, "events_attendance"), orderBy("date"))
  );
  const logsSnap = await getDocs(
    query(collection(db, "attendance_logs"), orderBy("createdAt"))
  );

  /* 部員（背番号順） */
  const players = playersSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.number ?? 999) - (b.number ?? 999));

  /* ★ 月別イベント（文字列で比較） */
  const events = eventsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(e => e.date?.startsWith(`${year}-${month}`));

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
      const day = e.date.slice(8, 10);
      const type = e.type === "match" ? "試合" : "練習";
      return `<th>${day}<br>${type}</th>`;
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
