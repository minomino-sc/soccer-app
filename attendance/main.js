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
const prevBtn = document.getElementById("prev");
const nextBtn = document.getElementById("next");

/* 状態 */
let current = new Date();
let latestStatus = {};

/* 月切替 */
prevBtn.onclick = () => {
  current.setMonth(current.getMonth() - 1);
  render();
};
nextBtn.onclick = () => {
  current.setMonth(current.getMonth() + 1);
  render();
};

/* 日付変換 */
function toDate(v){
  if(!v) return null;
  if(typeof v === "string"){
    const [y,m,d] = v.split("-").map(Number);
    return new Date(y, m-1, d);
  }
  if(v instanceof Timestamp) return v.toDate();
  return null;
}

/* 初期描画 */
render();

/* メイン描画 */
async function render(){
  table.innerHTML = "";
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
    .map(d=>({id:d.id,...d.data()}))
    .sort((a,b)=>(a.number ?? 999)-(b.number ?? 999));

  /* 月イベント */
  const events = eventsSnap.docs
    .map(d=>({id:d.id,...d.data(), _date:toDate(d.data().date)}))
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
      const day=e._date.getDate();
      const cls=e.type==="match"?"match":"practice";
      const label=e.type==="match"?"試合":"練習";
      return `<th class="${cls}">${day}<br>${label}</th>`;
    }).join("");
  table.appendChild(trH);

  /* 本体 */
  players.forEach(p=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${p.number??""}</td><td class="name">${p.name}</td>`;

    events.forEach(e=>{
      const key=`${e.id}_${p.id}`;
      const status=latestStatus[key]||"skip";

      const td=document.createElement("td");
      td.className = e.type==="match"?"match":"practice";
      td.textContent =
        status==="present"?"○":
        status==="absent" ?"×":"－";

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
}
