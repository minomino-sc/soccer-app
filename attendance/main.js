import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp
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

/* 初期描画 */
render();

/* 🔥 日付を完全対応で Date 化 */
function toDate(v) {
  if (!v) return null;

  // Firestore Timestamp
  if (v instanceof Timestamp) {
    return v.toDate();
  }

  // "YYYY-MM-DD" or "YYYY/MM/DD"
  if (typeof v === "string") {
    const parts = v.includes("/") ? v.split("/") : v.split("-");
    if (parts.length !== 3) return null;

    const [y, m, d] = parts.map(Number);
    return new Date(y, m - 1, d);
  }

  return null;
}

/* メイン描画 */
async function render() {
  table.innerHTML = "";
  monthLabel.textContent =
    `${current.getFullYear()}年 ${current.getMonth() + 1}月`;

  const playersSnap = await getDocs(collection(db, "players_attendance"));
  const eventsSnap = await getDocs(
    query(collection(db, "events_attendance"), orderBy("date"))
  );
  const logsSnap = await getDocs(
    query(collection(db, "attendance_logs"), orderBy("createdAt"))
  );

  /* 背番号順（完全） */
  const players = playersSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.number ?? 999) - (b.number ?? 999));

  /* 月イベント抽出（形式混在対応） */
  const events = eventsSnap.docs
    .map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        _date: toDate(data.date)
      };
    })
    .filter(e =>
      e._date &&
      e._date.getFullYear() === current.getFullYear() &&
      e._date.getMonth() === current.getMonth()
    );

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
      const day = e._date.getDate();
      const type = e.type === "match" ? "試合" : "練習";
      return `<th>${day}<br>${type}</th>`;
    }).join("");
  table.appendChild(trH);

  /* 本体 */
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

        latestStatus[key] = next;
        render();
      };

      tr.appendChild(td);
    });

    table.appendChild(tr);
  });
}
