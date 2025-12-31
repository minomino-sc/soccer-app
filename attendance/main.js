import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, getDocs, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import Chart from "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.esm.js";

const firebaseConfig = {
  apiKey: "★★★★★",
  authDomain: "★★★★★",
  projectId: "minotani-sc-app",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const table = document.getElementById("table");
const label = document.getElementById("monthLabel");
const ctx = document.getElementById("chart");
const csvBtn = document.getElementById("exportCSV");

let current = new Date();
let chart;

/* 月切替 */
document.getElementById("prev").onclick = ()=>{
  current.setMonth(current.getMonth()-1);
  render();
};
document.getElementById("next").onclick = ()=>{
  current.setMonth(current.getMonth()+1);
  render();
};

render();

async function render(){
  table.innerHTML="";
  label.textContent = `${current.getFullYear()}年 ${current.getMonth()+1}月`;

  const playersSnap = await getDocs(
    query(collection(db,"players_attendance"), orderBy("number"))
  );
  const eventsSnap = await getDocs(
    query(collection(db,"events_attendance"), orderBy("date"))
  );
  const logsSnap = await getDocs(collection(db,"attendance_logs"));

  const players = playersSnap.docs.map(d=>({id:d.id,...d.data()}));

  const events = eventsSnap.docs
    .map(d=>({id:d.id,...d.data()}))
    .filter(e=>{
      const [y,m]=e.date.split("-").map(Number);
      return y===current.getFullYear() && (m-1)===current.getMonth();
    });

  const latest={};
  logsSnap.forEach(l=>{
    const d=l.data();
    latest[`${d.eventId}_${d.playerId}`]=d.status;
  });

  /* ヘッダ（名前横） */
  const trH=document.createElement("tr");
  trH.innerHTML="<th>日付</th>"+players.map(p=>`<th>${p.name}</th>`).join("");
  table.appendChild(trH);

  /* 本体 */
  events.forEach(e=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td class="event ${e.type}">${e.date.slice(5)}</td>`;
    players.forEach(p=>{
      const s=latest[`${e.id}_${p.id}`];
      tr.innerHTML+=`<td>${
        s==="present"?"○":s==="absent"?"×":"－"
      }</td>`;
    });
    table.appendChild(tr);
  });

  renderChart(players, events, latest);
  setupCSV(players, events, latest);
}

/* グラフ */
function renderChart(players, events, latest){
  const labels=players.map(p=>p.name);
  const data=players.map(p=>{
    let hit=0, tot=0;
    events.forEach(e=>{
      const s=latest[`${e.id}_${p.id}`];
      if(!s||s==="skip") return;
      tot++; if(s==="present") hit++;
    });
    return tot?Math.round(hit/tot*100):0;
  });

  if(chart) chart.destroy();
  chart=new Chart(ctx,{
    type:"bar",
    data:{
      labels,
      datasets:[{
        label:"出席率(%)",
        data
      }]
    },
    options:{
      responsive:true,
      scales:{y:{max:100}}
    }
  });
}

/* CSV */
function setupCSV(players, events, latest){
  csvBtn.onclick=()=>{
    let csv="日付,"+players.map(p=>p.name).join(",")+"\n";
    events.forEach(e=>{
      csv+=e.date;
      players.forEach(p=>{
        const s=latest[`${e.id}_${p.id}`];
        csv+=","+(s==="present"?"○":s==="absent"?"×":"－");
      });
      csv+="\n";
    });
    const blob=new Blob([csv],{type:"text/csv"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download="attendance.csv";
    a.click();
  };
}
