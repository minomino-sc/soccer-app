import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  doc,
  getDoc,
  setDoc,
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

/* date → Date（安全版） */
function toDate(v){
  if(!v) return null;

  if(typeof v === "string"){
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m) return null;
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3])
    );
  }

  if(v instanceof Timestamp) return v.toDate();
  return null;
}

/* YYYY-MM */
function monthIdOf(date){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;
}

async function render(){
  table.innerHTML = "";
  stats.innerHTML = "";
  monthLabel.textContent =
    `${current.getFullYear()}年 ${current.getMonth()+1}月`;

  const monthId = monthIdOf(current);

  /* Firestore 読み取り（最小限） */
  const playersSnap = await getDocs(collection(db,"players_attendance"));
  const eventsSnap  = await getDocs(collection(db,"events_attendance"));

  /* 🔥 月別 summary（1ドキュメントのみ） */
  const summaryRef  = doc(db,"attendance_summary",monthId);
  const summarySnap = await getDoc(summaryRef);
  latest = summarySnap.exists() ? summarySnap.data() : {};

  /* 部員 */
  const players = playersSnap.docs
    .map(d => ({ id:d.id, ...d.data() }))
    .sort((a,b)=>(a.number??999)-(b.number??999));

  /* イベント（今月・日付順） */
  const events = eventsSnap.docs
    .map(d=>{
      const data = d.data();
      return {
        id: d.id,
        ...data,
        _date: toDate(data.date)
      };
    })
    .filter(e =>
      e.type !== "holiday" &&
      e._date &&
      e._date.getFullYear() === current.getFullYear() &&
      e._date.getMonth() === current.getMonth()
    )
    .sort((a,b)=>a._date - b._date);

  /* ヘッダ */
  const trH = document.createElement("tr");
  trH.innerHTML =
    "<th>背</th><th>名前</th>" +
    events.map(e=>`
      <th class="${e.type}">
        ${e._date.getDate()}<br>
        ${e.type==="match"?"試合":"練習"}
      </th>
    `).join("");
  table.appendChild(trH);

  /* 本体 */
  players.forEach(p=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.number ?? ""}</td>
      <td class="name">${p.name}</td>
    `;

    events.forEach(e=>{
      const key = `${e.id}_${p.id}`;
      const status = latest[key] || "skip";

      const td = document.createElement("td");
      td.className = e.type;
      td.textContent =
        status==="present" ? "○" :
        status==="absent"  ? "×" : "－";

      td.onclick = async()=>{
        const currentStatus = latest[key] || "skip";
        const next =
          currentStatus==="skip"    ? "present" :
          currentStatus==="present" ? "absent"  : "skip";

        td.onclick = null; // 二重クリック防止

        /* 🔥 summary 更新（本体） */
        await setDoc(
          summaryRef,
          {
            [key]: next,
            updatedAt: serverTimestamp()
          },
          { merge:true }
        );

        /* 🧾 履歴（任意） */
        await addDoc(collection(db,"attendance_logs"),{
          eventId: e.id,
          playerId: p.id,
          status: next,
          createdAt: serverTimestamp()
        });

        await render();
      };

      tr.appendChild(td);
    });

    table.appendChild(tr);
  });

  /* 出席率 */
  players.forEach(p=>{
    let prHit=0,prTot=0,maHit=0,maTot=0;

    events.forEach(e=>{
      const s = latest[`${e.id}_${p.id}`];
      if(!s || s==="skip") return;

      if(e.type==="practice"){
        prTot++; if(s==="present") prHit++;
      }
      if(e.type==="match"){
        maTot++; if(s==="present") maHit++;
      }
    });

    const tot = prTot + maTot;
    const hit = prHit + maHit;

    stats.innerHTML += `
      <div class="statsCard">
        <strong>${p.name}</strong><br>
        練習：${prTot?Math.round(prHit/prTot*100):0}%（${prHit}回）<br>
        試合：${maTot?Math.round(maHit/maTot*100):0}%（${maHit}回）<br>
        合計：${tot?Math.round(hit/tot*100):0}%（${hit}回）
      </div>
    `;
  });
}
