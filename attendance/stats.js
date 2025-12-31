import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, getDocs, query, orderBy, Timestamp
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
const label = document.getElementById("monthLabel");
const csvBtn = document.getElementById("csvBtn");
const ctx = document.getElementById("chart");

let current = new Date();
let chart;

/* 日付変換 */
function toDate(v){
  if(typeof v==="string"){
    const [y,m,d]=v.split("-").map(Number);
    return new Date(y,m-1,d);
  }
  if(v instanceof Timestamp) return v.toDate();
  return null;
}

document.getElementById("prevMonth").onclick=()=>{
  current.setMonth(current.getMonth()-1);
  render();
};
document.getElementById("nextMonth").onclick=()=>{
  current.setMonth(current.getMonth()+1);
  render();
};

csvBtn.onclick=exportCSV;

render();

async function render(){
  label.textContent=`${current.getFullYear()}年 ${current.getMonth()+1}月`;
  body.innerHTML="";

  const playersSnap = await getDocs(collection(db,"players_attendance"));
  const eventsSnap = await getDocs(collection(db,"events_attendance"));
  const logsSnap = await getDocs(
    query(collection(db,"attendance_logs"),orderBy("createdAt"))
  );

  const players = playersSnap.docs
    .map(d=>({id:d.id,...d.data()}))
    .sort((a,b)=>(a.number??999)-(b.number??999));

  const events = eventsSnap.docs
    .map(d=>({id:d.id,...d.data(),date:toDate(d.data().date)}))
    .filter(e=>e.date &&
      e.date.getFullYear()===current.getFullYear() &&
      e.date.getMonth()===current.getMonth()
    );

  const latest={};
  logsSnap.forEach(l=>{
    const d=l.data();
    latest[`${d.playerId}_${d.eventId}`]=d.status;
  });

  const chartLabels=[];
  const chartData=[];

  players.forEach(p=>{
    let prH=0,prT=0,maH=0,maT=0;

    events.forEach(e=>{
      const s=latest[`${p.id}_${e.id}`];
      if(s==="skip"||!s) return;

      if(e.type==="practice"){
        prT++; if(s==="present") prH++;
      }
      if(e.type==="match"){
        maT++; if(s==="present") maH++;
      }
    });

    const totH=prH+maH, totT=prT+maT;

    body.innerHTML+=`
      <tr>
        <td>${p.number??""}</td>
        <td>${p.name}</td>
        <td>${prT?Math.round(prH/prT*100):0}%</td>
        <td>${maT?Math.round(maH/maT*100):0}%</td>
        <td>${totT?Math.round(totH/totT*100):0}%</td>
      </tr>
    `;

    chartLabels.push(p.name);
    chartData.push(totT?Math.round(totH/totT*100):0);
  });

  drawChart(chartLabels,chartData);
}

function drawChart(labels,data){
  if(chart) chart.destroy();
  chart=new Chart(ctx,{
    type:"bar",
    data:{
      labels,
      datasets:[{
        label:"出席率（%）",
        data,
        backgroundColor:"#1976d2"
      }]
    },
    options:{
      scales:{y:{beginAtZero:true,max:100}}
    }
  });
}

function exportCSV(){
  let csv="背番号,名前,練習%,試合%,合計%\n";
  document.querySelectorAll("#statsBody tr").forEach(tr=>{
    csv += [...tr.children].map(td=>td.textContent).join(",")+"\n";
  });

  const blob=new Blob([csv],{type:"text/csv"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=`attendance_${current.getFullYear()}_${current.getMonth()+1}.csv`;
  a.click();
}
