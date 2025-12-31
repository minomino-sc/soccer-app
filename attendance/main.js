import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, getDocs,
  addDoc, serverTimestamp, Timestamp
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

/* date → Date（絶対に落ちない版） */
function toDate(v){
  if(!v) return null;
  if(typeof v === "string"){
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m) return null;
    return new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
  }
  if(v instanceof Timestamp) return v.toDate();
  return null;
}

async function render(){
  table.innerHTML="";
  stats.innerHTML="";
  monthLabel.textContent =
    `${current.getFullYear()}年 ${current.getMonth()+1}月`;

  /* 🔒 orderBy を使わない（事故防止） */
  const playersSnap = await getDocs(collection(db,"players_attendance"));
  const eventsSnap  = await getDocs(collection(db,"events_attendance"));
  const logsSnap    = await getDocs(collection(db,"attendance_logs"));

  const players = playersSnap.docs
    .map(d=>({id:d.id,...d.data()}))
    .sort((a,b)=>(a.number??999)-(b.number??999));

  const events = eventsSnap.docs
    .map(d=>{
      const data = d.data();
      const date = toDate(data.date);
      return {
        id: d.id,
        ...data,
        _date: date
      };
    })
    .filter(e =>
      e.type !== "holiday" &&   // ★ 休祝日は完全除外
      e._date &&
      e._date.getFullYear() === current.getFullYear() &&
      e._date.getMonth() === current.getMonth()
    );

  /* 最新状態 */
  latest = {};
  logsSnap.forEach(l=>{
    const d = l.data();
    latest[`${d.eventId}_${d.playerId}`] = d.status;
  });

  /* ヘッダ */
  const trH = document.createElement("tr");
  trH.innerHTML =
    "<th>背</th><th>名前</th>" +
    events.map(e=>`
      <th class="${e.type}">
        ${e._date.getDate()}<br>${e.type==="match"?"試合":"練習"}
      </th>
    `).join("");
  table.appendChild(trH);

  /* 本体 */
  players.forEach(p=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${p.number??""}</td><td class="name">${p.name}</td>`;

    events.forEach(e=>{
      const key = `${e.id}_${p.id}`;
      const status = latest[key] || "skip";

      const td = document.createElement("td");
      td.className = e.type;
      td.textContent =
        status==="present"?"○":
        status==="absent"?"×":"－";

      td.onclick = async()=>{
        const next =
          status==="skip"?"present":
          status==="present"?"absent":"skip";

        await addDoc(collection(db,"attendance_logs"),{
          eventId:e.id,
          playerId:p.id,
          status:next,
          createdAt:serverTimestamp()
        });
        render();
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

      if(e.type==="practice"){ prTot++; if(s==="present") prHit++; }
      if(e.type==="match"){ maTot++; if(s==="present") maHit++; }
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
