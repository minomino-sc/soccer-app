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

/* Firebase 設定 */
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
let rendering = false;

/* キャッシュ */
let players = [];
let events = [];
let logsCache = {}; // { "eventId_playerId": "status" }

/* 月切替 */
document.getElementById("prevMonth").onclick = () => { if(rendering) return; current.setDate(1); current.setMonth(current.getMonth()-1); render(); };
document.getElementById("nextMonth").onclick = () => { if(rendering) return; current.setDate(1); current.setMonth(current.getMonth()+1); render(); };

render();

/* utils */
function toDate(v){ 
  if(!v) return null; 
  if(typeof v==="string"){ 
    const [y,m,d]=v.split("-").map(Number); 
    return new Date(y,m-1,d);
  } 
  if(v instanceof Timestamp) return v.toDate(); 
  return null;
}
function monthIdOf(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
function symbol(s){ return s==="present"?"○":s==="absent"?"×":"－"; }

/* ===============================
   出欠レンダリング
   =============================== */
async function render(){
  rendering=true;
  table.innerHTML="";
  stats.innerHTML="";
  monthLabel.textContent=`${current.getFullYear()}年 ${current.getMonth()+1}月`;

  const monthId = monthIdOf(current);

  // players と events は初回または未取得時のみ取得
  if(players.length===0){
    const playersSnap = await getDocs(collection(db,"players_attendance"));
    players = playersSnap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.number??999)-(b.number??999));
  }

  if(events.length===0){
    const eventsSnap = await getDocs(collection(db,"events_attendance"));
    events = eventsSnap.docs.map(d=>{const data=d.data(); return {id:d.id,...data,_date:toDate(data.date)}})
                 .filter(e=>e.type!=="holiday")
                 .sort((a,b)=>a._date-b._date);
  }

  // 当月イベントのみ
  const monthEvents = events.filter(e=>e._date && e._date.getFullYear()===current.getFullYear() && e._date.getMonth()===current.getMonth());

  // attendance_logs は月単位で取得してキャッシュ
  logsCache = {};
  const logsSnap = await getDocs(query(collection(db,"attendance_logs"), where("monthId","==",monthId)));
  logsSnap.forEach(l=>{
    const d = l.data();
    const key = `${d.eventId}_${d.playerId}`;
    const t = d.createdAt?.toMillis?.()??0;
    if(!logsCache[key] || t > logsCache[key].time){
      logsCache[key] = {status:d.status, time:t};
    }
  });

  // ----------------------
  // table header
  const trH = document.createElement("tr");
  trH.innerHTML = "<th class='no'>背</th><th class='name'>名前</th>"+
    monthEvents.map(e=>`<th class="${e.type}">${e._date.getDate()}<br>${e.type==="match"?"試合":"練習"}</th>`).join("");
  table.appendChild(trH);

  // table body
  players.forEach(p=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="no">${p.number??""}</td><td class="name">${p.name}</td>`;
    monthEvents.forEach(e=>{
      const key = `${e.id}_${p.id}`;
      const td = document.createElement("td");
      td.className = e.type;
      td.textContent = symbol(logsCache[key]?.status || "skip");

      td.onclick = async ()=>{
        if(rendering) return;
        rendering = true;
        const cur = logsCache[key]?.status || "skip";
        const next = cur==="skip"?"present":cur==="present"?"absent":"skip";
        // Firestore に書き込み（読み取りは不要）
        await addDoc(collection(db,"attendance_logs"),{eventId:e.id,playerId:p.id,status:next,monthId,createdAt:serverTimestamp()});
        logsCache[key] = {status: next, time: Date.now()}; // キャッシュ更新
        td.textContent = symbol(next);
        rendering=false;
      };

      tr.appendChild(td);
    });
    table.appendChild(tr);
  });

  // stats（分母付き）
  players.forEach(p=>{
    let prH=0,prT=0,maH=0,maT=0;
    monthEvents.forEach(e=>{
      const s = logsCache[`${e.id}_${p.id}`]?.status;
      if(!s || s==="skip") return;
      if(e.type==="practice"){ prT++; if(s==="present") prH++; }
      if(e.type==="match"){ maT++; if(s==="present") maH++; }
    });
    const tot = prT + maT, hit = prH + maH;
    stats.innerHTML += `<div class="statsCard"><strong>${p.name}</strong><br>
      練習：${prH}/${prT}（${prT?Math.round(prH/prT*100):0}%）<br>
      試合：${maH}/${maT}（${maT?Math.round(maH/maT*100):0}%）<br>
      合計：${hit}/${tot}（${tot?Math.round(hit/tot*100):0}%）</div>`;
  });

  rendering=false;
}

/* ===============================
   CSV 出力（タイトル・年月・出席率入り）
   =============================== */
window.exportCSV = function(){
  const lines = [];

  // タイトル・年月
  lines.push(["⚽ 出欠管理"]);
  lines.push([`${current.getFullYear()}年${current.getMonth()+1}月`]);
  lines.push([]); // 空行

  // ヘッダー
  const headers = ["背番号","名前"];
  document.querySelectorAll("th:not(.no):not(.name)").forEach(h=>{
    headers.push(h.innerText.replace(/\n/g,""));
  });
  lines.push(headers);

  // 本文
  document.querySelectorAll("#table tr").forEach((tr,i)=>{
    if(i===0) return;
    const row = [];
    tr.querySelectorAll("td").forEach(td=>{
      row.push(td.innerText);
    });
    lines.push(row);
  });

  // 出席率行
  lines.push([]);
  lines.push(["📊 出席率"]);
  document.querySelectorAll(".statsCard").forEach(card=>{
    const text = card.innerText.replace(/\n/g," ");
    lines.push([text]);
  });

  // CSV文字列（BOM付きでExcel対応）
  const csv = "\uFEFF" + lines.map(r=>r.map(c=>`"${c.replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv],{type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${monthIdOf(current)}_attendance.csv`;
  a.click();
  URL.revokeObjectURL(url);
};
