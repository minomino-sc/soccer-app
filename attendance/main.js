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
const bar = document.getElementById("actionBar");
const label = document.getElementById("monthLabel");

/* 状態 */
let current = new Date();
let selected = null;
let selectedCell = null;

/* ★ ここが重要：最新状態を保持する */
let latestStatus = {};

/* 月切替 */
document.getElementById("prev").onclick = () => {
  current.setMonth(current.getMonth() - 1);
  render();
};
document.getElementById("next").onclick = () => {
  current.setMonth(current.getMonth() + 1);
  render();
};

/* 操作バー */
bar.querySelectorAll("button").forEach(btn=>{
  btn.onclick = ()=>saveStatus(btn.dataset.status);
});

render();

async function render(){
  label.textContent = `${current.getFullYear()}年 ${current.getMonth()+1}月`;
  table.innerHTML="";
  stats.innerHTML="";
  bar.style.display = selected ? "flex" : "none";

  const playersSnap = await getDocs(collection(db,"players_attendance"));
  const eventsSnap = await getDocs(
    query(collection(db,"events_attendance"),orderBy("date"))
  );
  const logsSnap = await getDocs(
    query(collection(db,"attendance_logs"),orderBy("createdAt"))
  );

  const players = playersSnap.docs.map(d=>({id:d.id,...d.data()}));

  const events = eventsSnap.docs
    .map(d=>({id:d.id,...d.data()}))
    .filter(e=>{
      const d=new Date(e.date);
      return d.getFullYear()===current.getFullYear() &&
             d.getMonth()===current.getMonth();
    });

  /* ★ 最新状態を再構築 */
  latestStatus = {};
  logsSnap.forEach(l=>{
    const d=l.data();
    latestStatus[`${d.eventId}_${d.playerId}`] = d.status;
  });

  /* ヘッダ */
  const trH=document.createElement("tr");
  trH.innerHTML="<th>名前</th>"+events.map(e=>{
    const d=new Date(e.date);
    const cls = e.type==="match" ? "match" : "practice";
    return `<th class="${cls}">${d.getDate()}</th>`;
  }).join("");
  table.appendChild(trH);

  /* 本体 */
  players.forEach(p=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td class="name">${p.name}</td>`;

    events.forEach(e=>{
      const key=`${e.id}_${p.id}`;
      const status=latestStatus[key] || "unset";
      const td=document.createElement("td");

      td.dataset.key = key;
      td.className = status;
      td.textContent =
        status==="present"?"○":
        status==="absent"?"×":
        status==="skip"?"－":"";

      td.onclick=()=>{
        if(selectedCell) selectedCell.classList.remove("selected");
        td.classList.add("selected");
        selectedCell = td;
        selected = { eventId:e.id, playerId:p.id, key };
        bar.style.display="flex";
      };

      tr.appendChild(td);
    });
    table.appendChild(tr);
  });

  /* 集計（－除外） */
  players.forEach(p=>{
    let hit=0, tot=0;
    events.forEach(e=>{
      const s=latestStatus[`${e.id}_${p.id}`];
      if(!s || s==="skip") return;
      tot++;
      if(s==="present") hit++;
    });
    stats.innerHTML += `
      <div class="statsCard">
        <strong>${p.name}</strong>
        <div class="statsRow">
          <span>出席率</span>
          <span>${tot?Math.round(hit/tot*100):0}%</span>
        </div>
      </div>`;
  });
}

/* ★ 保存＋ローカル即更新 */
async function saveStatus(status){
  if(!selected) return;

  await addDoc(collection(db,"attendance_logs"),{
    eventId: selected.eventId,
    playerId: selected.playerId,
    status,
    createdAt:serverTimestamp()
  });

  /* ★ ここが肝：即反映 */
  latestStatus[selected.key] = status;

  selected = null;
  selectedCell = null;
  bar.style.display = "none";

  render();
}
