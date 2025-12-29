import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, getDocs,
  addDoc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* Firebase設定（差し替え） */
const firebaseConfig = {
  apiKey: "YOUR_KEY",
  authDomain: "YOUR_DOMAIN",
  projectId: "YOUR_PROJECT_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const table = document.getElementById("table");
let currentTeam = "A";

document.getElementById("btnA").onclick = () => switchTeam("A");
document.getElementById("btnB").onclick = () => switchTeam("B");

await render();

async function switchTeam(team){
  currentTeam = team;
  document.getElementById("btnA").classList.toggle("active", team==="A");
  document.getElementById("btnB").classList.toggle("active", team==="B");
  await render();
}

async function render(){
  table.innerHTML = "";

  const playersSnap = await getDocs(collection(db,"players_attendance"));
  const eventsSnap = await getDocs(
    query(collection(db,"events_attendance"), orderBy("date","asc"))
  );
  const logsSnap = await getDocs(collection(db,"attendance_logs"));

  const players = playersSnap.docs.map(d=>({id:d.id,...d.data()}));
  const events = eventsSnap.docs
    .map(d=>({id:d.id,...d.data()}))
    .filter(e => e.team === currentTeam || e.team === "ALL");

  // 最新の出欠状況をキーで保持
  const latest = {};
  logsSnap.forEach(l=>{
    const d = l.data();
    latest[`${d.eventId}_${d.playerId}`] = d.status;
  });

  // ヘッダ
  const trH = document.createElement("tr");
  trH.innerHTML = `<th>名前</th>` +
    events.map(e=>`<th class="${e.type==="match"?"match":""}">
      ${e.date.slice(5)}
    </th>`).join("");
  table.appendChild(trH);

  // 行
  players.forEach(p=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="name">${p.name}</td>`;

    events.forEach(e=>{
      const key = `${e.id}_${p.id}`;
      const status = latest[key];

      const td = document.createElement("td");
      if(e.type==="match") td.classList.add("match");
      if(!status) td.classList.add("unset");
      if(status==="present") td.classList.add("present");
      if(status==="absent") td.classList.add("absent");

      td.textContent = status==="present"?"○":status==="absent"?"×":"";

      // クリック時に最新の状態を取得して更新
      td.onclick = async () => {
        const currentStatus = latest[key];
        const nextStatus = currentStatus === "present" ? "absent" : "present";

        await addDoc(collection(db,"attendance_logs"), {
          eventId: e.id,
          playerId: p.id,
          status: nextStatus,
          createdAt: serverTimestamp()
        });

        await render();
      };

      tr.appendChild(td);
    });

    table.appendChild(tr);
  });
}
