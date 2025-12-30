import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  query,
  orderBy,
  serverTimestamp
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
const actionBar = document.getElementById("actionBar");

/* 状態 */
let current = new Date();
let selected = null;
let latest = {};

/* 月切替 */
prevBtn.onclick = () => {
  current.setMonth(current.getMonth() - 1);
  render();
};
nextBtn.onclick = () => {
  current.setMonth(current.getMonth() + 1);
  render();
};

/* 操作バー */
actionBar.querySelectorAll("button").forEach(btn=>{
  btn.onclick = ()=>save(btn.dataset.status);
});

render();

async function render(){
  monthLabel.textContent =
    `${current.getFullYear()}年 ${current.getMonth()+1}月`;
  table.innerHTML="";
  actionBar.style.display="none";

  /* ★ 背番号順で部員取得 */
  const playersSnap = await getDocs(
    query(
      collection(db,"players_attendance"),
      orderBy("number","asc")
    )
  );

  const eventsSnap = await getDocs(
    query(collection(db,"events_attendanceattendance"),orderBy("date"))
  );

  const logsSnap = await getDocs(
    query(collection(db,"attendance_logs"),orderBy("createdAt"))
  );

  const players = playersSnap.docs.map(d=>({
    id:d.id,
    ...d.data()
  }));

  const events = eventsSnap.docs
    .map(d=>({id:d.id,...d.data()}))
    .filter(e=>{
      const d=new Date(e.date);
      return d.getFullYear()===current.getFullYear() &&
             d.getMonth()===current.getMonth();
    });

  /* 最新状態 */
  latest = {};
  logsSnap.forEach(l=>{
    const d=l.data();
    latest[`${d.eventId}_${d.playerId}`]=d.status;
  });

  /* ヘッダ */
  const trH=document.createElement("tr");
  trH.innerHTML =
    `<th>背</th><th>名前</th>` +
    events.map(e=>{
      const d=new Date(e.date);
      const cls=e.type==="match"?"match":"practice";
      return `<th class="${cls}">${d.getDate()}</th>`;
    }).join("");
  table.appendChild(trH);

  /* 行 */
  players.forEach(p=>{
    const tr=document.createElement("tr");
    tr.innerHTML=
      `<td>${p.number}</td><td class="name">${p.name}</td>`;

    events.forEach(e=>{
      const key=`${e.id}_${p.id}`;
      const status=latest[key]||"unset";

      const td=document.createElement("td");
      td.textContent =
        status==="present"?"○":
        status==="absent"?"×":
        status==="skip"?"－":"";

      td.onclick=()=>{
        selected={eventId:e.id,playerId:p.id,key};
        actionBar.style.display="flex";
      };

      tr.appendChild(td);
    });

    table.appendChild(tr);
  });
}

async function save(status){
  if(!selected) return;

  await addDoc(collection(db,"attendance_logs"),{
    eventId:selected.eventId,
    playerId:selected.playerId,
    status,
    createdAt:serverTimestamp()
  });

  latest[selected.key]=status;
  selected=null;
  actionBar.style.display="none";
  render();
}
