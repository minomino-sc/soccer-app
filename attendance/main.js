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
const stats = document.getElementById("stats");

/* 状態 */
let current = new Date();
let latestStatus = {};

/* 日付変換 */
function toDate(v){
  if(!v) return null;
  if(typeof v === "string"){
    const [y,m,d] = v.split("-").map(Number);
    return new Date(y, m-1, d);
  }
  if(v instanceof Timestamp){
    return v.toDate();
  }
  return null;
}

render();

async function render(){
  table.innerHTML="";
  stats.innerHTML="";
  monthLabel.textContent =
    `${current.getFullYear()}年 ${current.getMonth()+1}月`;

  const playersSnap = await getDocs(collection(db,"players_attendance"));
  const eventsSnap = await getDocs(
    query(collection(db,"events_attendance"), orderBy("date"))
  );
  const logsSnap = await getDocs(
    query(collection(db,"attendance_logs"), orderBy("createdAt"))
  );

  /* 背番号順 */
  const players = playersSnap.docs
    .map(d=>({id:d.id, ...d.data()}))
    .sort((a,b)=>(a.number ?? 999)-(b.number ?? 999));

  /* 月イベント */
  const events = eventsSnap.docs
    .map(d=>{
      const data = d.data();
      return { id:d.id, ...data, _date:toDate(data.date) };
    })
    .filter(e =>
      e._date &&
      e._date.getFullYear()===current.getFullYear() &&
      e._date.getMonth()===current.getMonth()
    );

  /* 最新出欠 */
  latestStatus = {};
  logsSnap.forEach(l=>{
    const d=l.data();
    latestStatus[`${d.eventId}_${d.playerId}`]=d.status;
  });

  /* ヘッダ */
  const trH=document.createElement("tr");
  trH.innerHTML =
    "<th>背</th><th>名前</th>" +
    events.map(e=>{
      const cls = e.type;
      return `<th class="${cls}">
        ${e._date.getDate()}<br>${e.type==="match"?"試合":"練習"}
      </th>`;
    }).join("");
  table.appendChild(trH);

  /* 行 */
  players.forEach(p=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${p.number ?? ""}</td><td class="name">${p.name}</td>`;

    events.forEach(e=>{
      const key=`${e.id}_${p.id}`;
      const status=latestStatus[key] || "skip";

      const td=document.createElement("td");
      td.textContent =
        status==="present"?"○":
        status==="absent"?"×":"－";

      td.onclick=async()=>{
        const next =
          status==="skip"?"present":
          status==="present"?"absent":"skip";

        await addDoc(collection(db,"attendance_logs"),{
          eventId:e.id,
          playerId:p.id,
          status:next,
          createdAt:serverTimestamp()
        });

        latestStatus[key]=next;
        render();
      };

      tr.appendChild(td);
    });

    table.appendChild(tr);
  });

  /* 出席率（－除外・練習/試合別） */
  players.forEach(p=>{
    let prHit=0, prTot=0, maHit=0, maTot=0;

    events.forEach(e=>{
      const s = latestStatus[`${e.id}_${p.id}`];
      if(!s || s==="skip") return;

      if(e.type==="practice"){
        prTot++; if(s==="present") prHit++;
      }
      if(e.type==="match"){
        maTot++; if(s==="present") maHit++;
      }
    });

    const totHit = prHit + maHit;
    const totTot = prTot + maTot;

    stats.innerHTML += `
      <div class="statsCard">
        <strong>${p.number ?? ""} ${p.name}</strong>
        <div class="statsRow"><span>練習</span><span>${prTot?Math.round(prHit/prTot*100):0}%</span></div>
        <div class="statsRow"><span>試合</span><span>${maTot?Math.round(maHit/maTot*100):0}%</span></div>
        <div class="statsRow"><span>合計</span><span>${totTot?Math.round(totHit/totTot*100):0}%</span></div>
      </div>
    `;
  });
}
