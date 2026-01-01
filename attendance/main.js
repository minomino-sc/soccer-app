import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  query,
  orderBy,
  where,
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
const stats = document.getElementById("stats");
const monthLabel = document.getElementById("monthLabel");

/* 状態 */
let current = new Date();
let latest = {};

/* 月切替 */
document.getElementById("prevMonth").onclick = () => {
  current.setDate(1);
  current.setMonth(current.getMonth() - 1);
  render();
};
document.getElementById("nextMonth").onclick = () => {
  current.setDate(1);
  current.setMonth(current.getMonth() + 1);
  render();
};

render();

/* util */
function toDate(v){
  if (!v) return null;
  if (typeof v === "string") {
    const [y,m,d] = v.split("-").map(Number);
    return new Date(y, m-1, d);
  }
  if (v instanceof Timestamp) return v.toDate();
  return null;
}

function monthIdOf(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}

/* render */
async function render(){
  table.innerHTML = "";
  stats.innerHTML = "";

  monthLabel.textContent =
    `${current.getFullYear()}年 ${current.getMonth()+1}月`;

  const monthId = monthIdOf(current);

  /* Firestore 読み込み */
  const playersSnap = await getDocs(collection(db,"players_attendance"));
  const eventsSnap  = await getDocs(
    query(collection(db,"events_attendance"), orderBy("date"))
  );

  /* ★ 今月分だけ attendance_logs を読む（激減ポイント） */
  const logsSnap = await getDocs(
    query(
      collection(db,"attendance_logs"),
      where("monthId","==",monthId),
      orderBy("createdAt")
    )
  );

  /* players */
  const players = playersSnap.docs
    .map(d => ({ id:d.id, ...d.data() }))
    .sort((a,b) => (a.number ?? 999) - (b.number ?? 999));

  /* events */
  const events = eventsSnap.docs
    .map(d => ({ id:d.id, ...d.data(), _date: toDate(d.data().date) }))
    .filter(e =>
      e._date &&
      e._date.getFullYear() === current.getFullYear() &&
      e._date.getMonth() === current.getMonth()
    );

  /* logs → latest */
  latest = {};
  logsSnap.forEach(l=>{
    const d = l.data();
    latest[`${d.eventId}_${d.playerId}`] = d.status;
  });

  /* header */
  const trH = document.createElement("tr");
  trH.innerHTML =
    "<th>背</th><th>名前</th>" +
    events.map(e => `
      <th class="${e.type}">
        ${e._date.getDate()}<br>${e.type==="match"?"試合":"練習"}
      </th>
    `).join("");
  table.appendChild(trH);

  /* body */
  players.forEach(p=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${p.number ?? ""}</td><td class="name">${p.name}</td>`;

    events.forEach(e=>{
      const key = `${e.id}_${p.id}`;
      const status = latest[key] || "skip";

      const td = document.createElement("td");
      td.className = e.type;
      td.textContent =
        status==="present"?"○":
        status==="absent" ?"×":"－";

      td.onclick = async ()=>{
        const next =
          status==="skip"?"present":
          status==="present"?"absent":"skip";

        await addDoc(collection(db,"attendance_logs"),{
          eventId: e.id,
          playerId: p.id,
          status: next,
          monthId,                 // ★ 追加
          createdAt: serverTimestamp()
        });

        render();
      };

      tr.appendChild(td);
    });

    table.appendChild(tr);
  });

  /* stats */
  players.forEach(p=>{
    let prH=0, prT=0, maH=0, maT=0;

    events.forEach(e=>{
      const s = latest[`${e.id}_${p.id}`];
      if (!s || s==="skip") return;
      if (e.type==="practice"){ prT++; if(s==="present") prH++; }
      if (e.type==="match"){ maT++; if(s==="present") maH++; }
    });

    const tot = prT + maT;
    const hit = prH + maH;

    stats.innerHTML += `
      <div class="statsCard">
        <strong>${p.name}</strong><br>
        練習：${prT ? Math.round(prH/prT*100) : 0}%（${prH}回）<br>
        試合：${maT ? Math.round(maH/maT*100) : 0}%（${maH}回）<br>
        合計：${tot ? Math.round(hit/tot*100) : 0}%（${hit}回）
      </div>
    `;
  });
}
