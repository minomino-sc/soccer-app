import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, getDocs,
  addDoc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* Firebase設定（admin.jsと完全一致させる） */
const firebaseConfig = {
  apiKey: "★★★★★",
  authDomain: "★★★★★",
  projectId: "minotani-sc-app",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const table = document.getElementById("table");

await render();

async function render(){
  table.innerHTML = "";

  const playersSnap = await getDocs(collection(db,"players_attendance"));
  const eventsSnap = await getDocs(
    query(collection(db,"events_attendance"), orderBy("date"))
  );
  const logsSnap = await getDocs(collection(db,"attendance_logs"));

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

  /* 本体 */
  players.forEach(p=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="name">${p.name}</td>`;

    events.forEach(e=>{
      const key = `${e.id}_${p.id}`;
      const status = latest[key];

      const td = document.createElement("td");
      td.classList.add("unset");

      if(status==="present"){
        td.textContent="○";
        td.className="present";
      }
      if(status==="absent"){
        td.textContent="×";
        td.className="absent";
      }
      if(status==="skip"){
        td.textContent="－";
        td.className="skip";
      }

      td.onclick = ()=>showSelector(td, e.id, p.id);

      tr.appendChild(td);
    });

    table.appendChild(tr);
  });
}

/* 選択UI */
function showSelector(td, eventId, playerId){
  td.innerHTML = `
    <button data-v="present">○</button>
    <button data-v="absent">×</button>
    <button data-v="skip">－</button>
  `;
  td.querySelectorAll("button").forEach(btn=>{
    btn.onclick = async (e)=>{
      e.stopPropagation();
      await addDoc(collection(db,"attendance_logs"),{
        eventId,
        playerId,
        status: btn.dataset.v,
        createdAt: serverTimestamp()
      });
      await render();
    };
  });
}
