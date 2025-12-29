import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, getDocs,
  addDoc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* Firebase設定（admin.jsと完全一致） */
const firebaseConfig = {
  apiKey: "★★★★★",
  authDomain: "★★★★★",
  projectId: "minotani-sc-app",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const table = document.getElementById("table");
const bar   = document.getElementById("actionBar");

let currentCell = null;
let currentInfo = null;

await render();

async function render(){
  table.innerHTML = "";

  const playersSnap = await getDocs(collection(db,"players_attendance"));
  const eventsSnap  = await getDocs(
    query(collection(db,"events_attendance"), orderBy("date"))
  );
  const logsSnap    = await getDocs(collection(db,"attendance_logs"));

  const players = playersSnap.docs.map(d=>({id:d.id,...d.data()}));
  const events  = eventsSnap.docs.map(d=>({id:d.id,...d.data()}));

  const latest = {};
  logsSnap.forEach(l=>{
    const d = l.data();
    latest[`${d.eventId}_${d.playerId}`] = d.status;
  });

  /* ヘッダ */
  const trH = document.createElement("tr");
  trH.innerHTML =
    `<th>名前</th>` +
    events.map(e=>{
      const label = e.type==="match" ? "試合" : "練習";
      return `<th>${e.date.slice(5)}<br>${label}</th>`;
    }).join("");
  table.appendChild(trH);

  /* 行 */
  players.forEach(p=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="name">${p.name}</td>`;

    events.forEach(e=>{
      const key = `${e.id}_${p.id}`;
      const status = latest[key] || "";

      const td = document.createElement("td");
      setState(td, status);

      td.onclick = ()=>{
        currentCell = td;
        currentInfo = { eventId:e.id, playerId:p.id };
        bar.style.display="block";
      };

      tr.appendChild(td);
    });

    table.appendChild(tr);
  });
}

/* 状態表示 */
function setState(td, status){
  td.className="";
  if(status==="present"){ td.textContent="○"; td.classList.add("present"); }
  else if(status==="absent"){ td.textContent="×"; td.classList.add("absent"); }
  else if(status==="skip"){ td.textContent="－"; td.classList.add("skip"); }
  else{ td.textContent=""; td.classList.add("unset"); }
}

/* ボタン処理 */
bar.querySelector(".btn-present").onclick = ()=>save("present");
bar.querySelector(".btn-absent").onclick  = ()=>save("absent");
bar.querySelector(".btn-skip").onclick    = ()=>save("skip");

async function save(status){
  if(!currentInfo) return;

  await addDoc(collection(db,"attendance_logs"),{
    eventId: currentInfo.eventId,
    playerId: currentInfo.playerId,
    status,
    createdAt: serverTimestamp()
  });

  bar.style.display="none";
  await render();
}
