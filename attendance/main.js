import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, getDocs,
  addDoc, query, orderBy, serverTimestamp
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
const label = document.getElementById("monthLabel");

let current = new Date();
let latest = {};

/* 月切替 */
document.getElementById("prev").onclick = () => {
  current.setMonth(current.getMonth() - 1);
  render();
};
document.getElementById("next").onclick = () => {
  current.setMonth(current.getMonth() + 1);
  render();
};

render();

/* YYYY-MM-DD → Date */
function toDate(s){
  const [y,m,d]=s.split("-").map(Number);
  return new Date(y,m-1,d);
}

async function render(){
  table.innerHTML="";
  stats.innerHTML="";
  label.textContent=`${current.getFullYear()}年 ${current.getMonth()+1}月`;

  const playersSnap = await getDocs(collection(db,"players_attendance"));
  const eventsSnap = await getDocs(
    query(collection(db,"events_attendance"),orderBy("date"))
  );
  const logsSnap = await getDocs(
    query(collection(db,"attendance_logs"),orderBy("createdAt"))
  );

  /* 背番号順 */
  const players = playersSnap.docs
    .map(d=>({id:d.id,...d.data()}))
    .sort((a,b)=>(a.number??999)-(b.number??999));

  const events = eventsSnap.docs
    .map(d=>({id:d.id,...d.data(),_d:toDate(d.data().date)}))
    .filter(e =>
      e._d.getFullYear()===current.getFullYear() &&
      e._d.getMonth()===current.getMonth()
    );

  latest={};
  logsSnap.forEach(l=>{
    const d=l.data();
    latest[`${d.eventId}_${d.playerId}`]=d.status;
  });

  /* ヘッダ */
  const trH=document.createElement("tr");
  trH.innerHTML="<th>背</th><th>名前</th>"+
    events.map(e=>{
      const cls=e.type;
      return `<th class="${cls}">${e._d.getDate()}</th>`;
    }).join("");
  table.appendChild(trH);

  /* 本体 */
  players.forEach(p=>{
    let prHit=0,prTot=0,maHit=0,maTot=0;

    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${p.number??""}</td><td class="name">${p.name}</td>`;

    events.forEach(e=>{
      const key=`${e.id}_${p.id}`;
      const s=latest[key]||"skip";

      if(s!=="skip"){
        if(e.type==="practice"){prTot++; if(s==="present") prHit++;}
        if(e.type==="match"){maTot++; if(s==="present") maHit++;}
      }

      const td=document.createElement("td");
      td.textContent=s==="present"?"○":s==="absent"?"×":"－";
      td.onclick=async()=>{
        const next=s==="skip"?"present":s==="present"?"absent":"skip";
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

    /* 出席率表示 */
    const tot=prTot+maTot, hit=prHit+maHit;
    stats.innerHTML+=`
      <div class="statsCard">
        <strong>${p.name}</strong><br>
        練習 ${prTot?Math.round(prHit/prTot*100):0}%<br>
        試合 ${maTot?Math.round(maHit/maTot*100):0}%<br>
        合計 ${tot?Math.round(hit/tot*100):0}%
      </div>`;
  });
}
