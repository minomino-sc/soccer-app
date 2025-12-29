import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, getDocs,
  addDoc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* Firebase設定 */
const firebaseConfig = {
  apiKey: "★★★★★",
  authDomain: "★★★★★",
  projectId: "minotani-sc-app",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* DOM */
const attTable = document.getElementById("attendanceTable");
const statsBody = document.getElementById("statsBody");
const label = document.getElementById("monthLabel");
const bar = document.getElementById("actionBar");

let selected = null;
let current = new Date();

/* 月切替 */
document.getElementById("prevMonth").onclick = ()=>{
  current.setMonth(current.getMonth()-1);
  renderStats();
};
document.getElementById("nextMonth").onclick = ()=>{
  current.setMonth(current.getMonth()+1);
  renderStats();
};

await renderAttendance();
await renderStats();

/* ---------- 出欠入力 ---------- */
async function renderAttendance(){
  attTable.innerHTML="";

  const playersSnap = await getDocs(collection(db,"players_attendance"));
  const eventsSnap = await getDocs(
    query(collection(db,"events_attendance"), orderBy("date"))
  );
  const logsSnap = await getDocs(
    query(collection(db,"attendance_logs"), orderBy("createdAt"))
  );

  const latest = {};
  logsSnap.forEach(l=>{
    const d=l.data();
    latest[`${d.eventId}_${d.playerId}`]=d.status;
  });

  const players = playersSnap.docs.map(d=>({id:d.id,...d.data()}));
  const events  = eventsSnap.docs.map(d=>({id:d.id,...d.data()}));

  const trH=document.createElement("tr");
  trH.innerHTML=`<th>名前</th>`+
    events.map(e=>`<th>${e.date.slice(5)}</th>`).join("");
  attTable.appendChild(trH);

  players.forEach(p=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td class="name">${p.name}</td>`;

    events.forEach(e=>{
      const td=document.createElement("td");
      setState(td, latest[`${e.id}_${p.id}`]);

      td.onclick=()=>{
        selected={eventId:e.id,playerId:p.id};
        bar.style.display="flex";
      };

      tr.appendChild(td);
    });
    attTable.appendChild(tr);
  });
}

/* ---------- 月別集計 ---------- */
async function renderStats(){
  label.textContent=`${current.getFullYear()}年 ${current.getMonth()+1}月`;
  statsBody.innerHTML="";

  const playersSnap = await getDocs(collection(db,"players_attendance"));
  const eventsSnap  = await getDocs(collection(db,"events_attendance"));
  const logsSnap    = await getDocs(
    query(collection(db,"attendance_logs"), orderBy("createdAt"))
  );

  const latest={};
  logsSnap.forEach(l=>{
    const d=l.data();
    latest[`${d.eventId}_${d.playerId}`]=d.status;
  });

  playersSnap.forEach(p=>{
    let prHit=0,prTot=0,maHit=0,maTot=0;

    eventsSnap.forEach(e=>{
      const ev=e.data();
      const d=new Date(ev.date+"T00:00:00");
      if(d.getFullYear()!==current.getFullYear()||
         d.getMonth()!==current.getMonth()) return;

      const s=latest[`${e.id}_${p.id}`];
      if(s!=="present"&&s!=="absent") return;

      if(ev.type==="practice"){
        prTot++; if(s==="present") prHit++;
      }
      if(ev.type==="match"){
        maTot++; if(s==="present") maHit++;
      }
    });

    const tot=prTot+maTot;
    const hit=prHit+maHit;

    statsBody.innerHTML+=`
      <tr>
        <td>${p.data().name}</td>
        <td>${prTot?Math.round(prHit/prTot*100):"-"}%</td>
        <td>${maTot?Math.round(maHit/maTot*100):"-"}%</td>
        <td>${tot?Math.round(hit/tot*100):"-"}%</td>
      </tr>`;
  });
}

/* ---------- 保存 ---------- */
function setState(td,status){
  td.className="";
  if(status==="present"){td.textContent="○";td.classList.add("present")}
  else if(status==="absent"){td.textContent="×";td.classList.add("absent")}
  else if(status==="skip"){td.textContent="－";td.classList.add("skip")}
  else{td.textContent="";td.classList.add("unset")}
}

bar.querySelector(".btn-present").onclick=()=>save("present");
bar.querySelector(".btn-absent").onclick =()=>save("absent");
bar.querySelector(".btn-skip").onclick   =()=>save("skip");

async function save(status){
  if(!selected) return;
  await addDoc(collection(db,"attendance_logs"),{
    ...selected,
    status,
    createdAt:serverTimestamp()
  });
  bar.style.display="none";
  selected=null;
  await renderAttendance();
  await renderStats();
}
