import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, getDocs, query, orderBy
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
const body = document.getElementById("statsBody");
const graphs = document.getElementById("graphs");
const label = document.getElementById("monthLabel");

/* 状態 */
let current = new Date();
let csvRows = [];

/* 月切替 */
document.getElementById("prev").onclick = ()=>{
  current.setMonth(current.getMonth()-1);
  render();
};
document.getElementById("next").onclick = ()=>{
  current.setMonth(current.getMonth()+1);
  render();
};

/* CSV */
document.getElementById("csv").onclick = ()=>{
  const csv = csvRows.map(r=>r.join(",")).join("\n");
  const blob = new Blob([csv],{type:"text/csv"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${current.getFullYear()}-${current.getMonth()+1}_attendance.csv`;
  a.click();
};

render();

async function render(){
  body.innerHTML="";
  graphs.innerHTML="";
  csvRows = [["名前","練習","試合","合計"]];

  label.textContent = `${current.getFullYear()}年 ${current.getMonth()+1}月`;

  const playersSnap = await getDocs(collection(db,"players_attendance"));
  const eventsSnap = await getDocs(collection(db,"events_attendance"));
  const logsSnap = await getDocs(query(collection(db,"attendance_logs"),orderBy("createdAt")));

  const players = playersSnap.docs
    .map(d=>({id:d.id,...d.data()}))
    .sort((a,b)=>(a.number??999)-(b.number??999));

  const events = eventsSnap.docs.map(d=>({id:d.id,...d.data()}));

  const latest = {};
  logsSnap.forEach(l=>{
    const d=l.data();
    latest[`${d.playerId}_${d.eventId}`]=d.status;
  });

  players.forEach(p=>{
    let prHit=0,prTot=0,maHit=0,maTot=0;

    events.forEach(e=>{
      const [y,m] = e.date.split("-").map(Number);
      if(y!==current.getFullYear() || m-1!==current.getMonth()) return;

      const s = latest[`${p.id}_${e.id}`];
      if(!s || s==="skip") return;

      if(e.type==="practice"){
        prTot++; if(s==="present") prHit++;
      }
      if(e.type==="match"){
        maTot++; if(s==="present") maHit++;
      }
    });

    const pr = prTot ? Math.round(prHit/prTot*100) : 0;
    const ma = maTot ? Math.round(maHit/maTot*100) : 0;
    const ttTot = prTot+maTot;
    const ttHit = prHit+maHit;
    const tt = ttTot ? Math.round(ttHit/ttTot*100) : 0;

    body.innerHTML += `
      <tr>
        <td>${p.name}</td>
        <td>${pr}%</td>
        <td>${ma}%</td>
        <td>${tt}%</td>
      </tr>
    `;

    graphs.innerHTML += `
      <div class="graph">
        <strong>${p.name}</strong>
        <div class="bar practice" style="width:${pr}%"></div>
        <div class="bar match" style="width:${ma}%"></div>
        <div class="bar total" style="width:${tt}%"></div>
      </div>
    `;

    csvRows.push([p.name,pr,ma,tt]);
  });
}
