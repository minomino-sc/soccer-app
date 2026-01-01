import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  query,
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

/* state */
let current = new Date();
let latest = {};
let rendering = false;

/* 月切替 */
document.getElementById("prevMonth").onclick = () => { if(rendering) return; current.setDate(1); current.setMonth(current.getMonth()-1); render(); };
document.getElementById("nextMonth").onclick = () => { if(rendering) return; current.setDate(1); current.setMonth(current.getMonth()+1); render(); };

render();

/* utils */
function toDate(v){ if(!v) return null; if(typeof v==="string"){ const [y,m,d]=v.split("-").map(Number); return new Date(y,m-1,d);} if(v instanceof Timestamp) return v.toDate(); return null;}
function monthIdOf(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
function symbol(s){ return s==="present"?"○":s==="absent"?"×":"－"; }

/* render */
async function render(){
  rendering=true;
  table.innerHTML="";
  stats.innerHTML="";
  monthLabel.textContent=`${current.getFullYear()}年 ${current.getMonth()+1}月`;

  const monthId=monthIdOf(current);
  const playersSnap=await getDocs(collection(db,"players_attendance"));
  const eventsSnap=await getDocs(collection(db,"events_attendance"));
  const logsSnap=await getDocs(query(collection(db,"attendance_logs"),where("monthId","==",monthId)));

  const players=playersSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.number??999)-(b.number??999));
  const events=eventsSnap.docs.map(d=>{const data=d.data(); return {id:d.id,...data,_date:toDate(data.date)}})
                    .filter(e=>e.type!=="holiday" && e._date && e._date.getFullYear()===current.getFullYear() && e._date.getMonth()===current.getMonth())
                    .sort((a,b)=>a._date-b._date);

  latest={}; const latestTime={};
  logsSnap.forEach(l=>{const d=l.data(); const key=`${d.eventId}_${d.playerId}`; const t=d.createdAt?.toMillis?.()??0; if(!latestTime[key]||t>latestTime[key]){latestTime[key]=t; latest[key]=d.status;} });

  /* header */
  const trH=document.createElement("tr");
  trH.innerHTML="<th class='no'>背</th><th class='name'>名前</th>"+
    events.map(e=>`<th class="${e.type}">${e._date.getDate()}<br>${e.type==="match"?"試合":"練習"}</th>`).join("");
  table.appendChild(trH);

  /* body */
  players.forEach(p=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td class="no">${p.number??""}</td><td class="name">${p.name}</td>`;
    events.forEach(e=>{
      const key=`${e.id}_${p.id}`;
      const td=document.createElement("td");
      td.className=e.type;
      td.textContent=symbol(latest[key]||"skip");
      td.onclick=async ()=>{
        if(rendering) return;
        rendering=true;
        const cur=latest[key]||"skip";
        const next=cur==="skip"?"present":cur==="present"?"absent":"skip";
        latest[key]=next;
        td.textContent=symbol(next);
        await addDoc(collection(db,"attendance_logs"),{eventId:e.id,playerId:p.id,status:next,monthId,createdAt:serverTimestamp()});
        await render();
      };
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });

  /* stats（分母付き） */
  players.forEach(p=>{
    let prH=0,prT=0,maH=0,maT=0;
    events.forEach(e=>{const s=latest[`${e.id}_${p.id}`]; if(!s||s==="skip")return; if(e.type==="practice"){prT++; if(s==="present") prH++;} if(e.type==="match"){maT++; if(s==="present") maH++;}});
    const tot=prT+maT,hit=prH+maH;
    stats.innerHTML+=`<div class="statsCard"><strong>${p.name}</strong><br>
      練習：${prH}/${prT}（${prT?Math.round(prH/prT*100):0}%）<br>
      試合：${maH}/${maT}（${maT?Math.round(maH/maT*100):0}%）<br>
      合計：${hit}/${tot}（${tot?Math.round(hit/tot*100):0}%）</div>`;
  });

  rendering=false;
}

/* CSV 出力 */
window.exportCSV = function(){
  const lines=[];
  const headers=["背番号","名前"];
  document.querySelectorAll("th:not(.no):not(.name)").forEach(h=>headers.push(h.innerText.replace(/\n/g,"")));
  lines.push(headers.join(","));
  document.querySelectorAll("#table tr").forEach((tr,i)=>{if(i===0) return; const row=[]; tr.querySelectorAll("td").forEach(td=>row.push(`"${td.innerText.replace(/"/g,'""')}"`)); lines.push(row.join(",")); });
  const csv="\uFEFF"+lines.join("\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=`${monthIdOf(current)}_attendance.csv`; a.click();
  URL.revokeObjectURL(url);
};

/* PDF 出力（タイトル＋月ラベル＋テーブル＋出席率カード） */
window.exportPDF = async function(){
  const pdfCapture = document.createElement("div");
  pdfCapture.style.padding="10px";
  pdfCapture.style.background="#fff";

  // タイトル
  const title = document.createElement("h1");
  title.textContent = `⚽ 出欠管理 ${current.getFullYear()}年${current.getMonth()+1}月`;
  title.style.fontSize="16px";
  pdfCapture.appendChild(title);

  // テーブルと出席率を追加
  pdfCapture.appendChild(document.querySelector(".tableWrap").cloneNode(true));
  pdfCapture.appendChild(document.getElementById("stats").cloneNode(true));

  // html2canvas でキャプチャ
  const canvas = await html2canvas(pdfCapture, { scale: 2 });
  const imgData = canvas.toDataURL("image/png");

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF("l","pt","a4"); // 横向き
  const pageWidth = pdf.internal.pageSize.getWidth();
  const imgWidth = pageWidth - 20;
  const imgHeight = (canvas.height*imgWidth)/canvas.width;
  pdf.addImage(imgData,"PNG",10,10,imgWidth,imgHeight);
  pdf.save(`${monthIdOf(current)}_attendance.pdf`);
};
