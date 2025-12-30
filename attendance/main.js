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

const table = document.getElementById("table");
const stats = document.getElementById("stats");
const bar = document.getElementById("actionBar");
const label = document.getElementById("monthLabel");

let current = new Date();
let selected = null;
let selectedCell = null;

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
  const logsSnap = await getDocs(collection(db,"attendance_logs"));

  const players = playersSnap.docs.map(d=>({id:d.id,...d.data()}));

  const events = eventsSnap.docs
    .map(d=>({id:d.id,...d.data()}))
    .filter(e=>{
      const d=new Date(e.date);
      return d.getFullYear()===current.getFullYear() &&
             d.getMonth()===current.getMonth();
    });

  const latest={};
  logsSnap.forEach(l=>{
    const d=l.data();
    latest[`${d.eventId}_${d.playerId}`]=d.status;
  });

  /* ヘッダ */
  const trH=document.createElement("tr");
  trH.innerHTML="<th>名前</th>"+events.map(e=>{
    const d=new Date(e.date);
    const cls = e.type==="match" ? "match" : "practice";
    return `<th class="${cls}"><strong>${d.getDate()}</strong></th>`;
  }).join("");
  table.appendChild(trH);

  /* 本体 */
  players.forEach(p=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td class="name">${p.name}</td>`;

    events.forEach(e=>{
      const key=`${e.id}_${p.id}`;
      const status=latest[key] || "unset";
      const td=document.createElement("td");

      td.className = status;
      td.textContent =
        status==="present"?"○":
        status==="absent"?"×":
        status==="skip"?"－":"";

      if(selected &&
         selected.eventId===e.id &&
         selected.playerId===p.id){
        td.classList.add("selected");
        selectedCell = td;
      }

      td.onclick=()=>{
        if(selectedCell) selectedCell.classList.remove("selected");
        td.classList.add("selected");
        selectedCell = td;
        selected = { eventId:e.id, playerId:p.id };
        bar.style.display="flex";
      };

      tr.appendChild(td);
    });
    table.appendChild(tr);
  });

  /* 集計（－は除外） */
  players.forEach(p=>{
    let hit=0, tot=0;
    events.forEach(e=>{
      const s=latest[`${e.id}_${p.id}`];
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

async function saveStatus(status){
  if(!selected) return;

  await addDoc(collection(db,"attendance_logs"),{
    ...selected,
    status,
    createdAt:serverTimestamp()
  });

  selected = null;
  selectedCell = null;
  bar.style.display = "none";

  await render();
}
