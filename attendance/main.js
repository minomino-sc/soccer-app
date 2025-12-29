import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, getDocs,
  addDoc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

  // 🔴 イベントが0件なら原因が即わかる
  if(events.length === 0){
    table.innerHTML = "<tr><td>イベントがありません</td></tr>";
    return;
  }

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
      const typeLabel = e.type==="match" ? "試合" : "練習";
      return `<th>${e.date.slice(5)}<br>${typeLabel}</th>`;
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
      if(!status) td.className="unset";
      if(status==="present") td.className="present";
      if(status==="absent") td.className="absent";

      td.textContent = status==="present"?"○":status==="absent"?"×":"";

      td.onclick = async ()=>{
        const next = status==="present" ? "absent" : "present";
        await addDoc(collection(db,"attendance_logs"),{
          eventId: e.id,
          playerId: p.id,
          status: next,
          createdAt: serverTimestamp()
        });
        await render();
      };

      tr.appendChild(td);
    });

    table.appendChild(tr);
  });
}
