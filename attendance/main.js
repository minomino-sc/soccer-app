import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, getDocs,
  addDoc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* Firebase設定 */
const firebaseConfig = {
  apiKey: "YOUR_KEY",
  authDomain: "YOUR_DOMAIN",
  projectId: "YOUR_PROJECT_ID"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const table = document.getElementById("table");

await render();

async function render() {
  table.innerHTML = "";

  // データ取得
  const playersSnap = await getDocs(collection(db,"players_attendance"));
  const eventsSnap = await getDocs(
    query(collection(db,"events_attendance"), orderBy("date"))
  );
  const logsSnap = await getDocs(collection(db,"attendance_logs"));

  const players = playersSnap.docs.map(d=>({id:d.id,...d.data()}));
  const eventsRaw = eventsSnap.docs.map(d=>({id:d.id,...d.data()}));

  // 最新ログをキーで保持
  const latest = {};
  logsSnap.forEach(l=>{
    const d = l.data();
    latest[`${d.eventId}_${d.playerId}`] = d.status;
  });

  // 日付＋チーム＋種別ごとに列を作る
  const events = [];
  eventsRaw.forEach(e=>{
    const key = `${e.date}_${e.team || "ALL"}_${e.type}`;
    events.push({...e, key});
  });

  // ヘッダ作成
  const trH = document.createElement("tr");
  trH.innerHTML = `<th>名前</th>` +
    events.map(e=>{
      const typeLabel = e.type==="match"?"試合":"練習";
      const teamLabel = e.team || "ALL";
      const typeClass = e.type==="match"?"match":"practice";
      const teamClass = e.team==="A"?"teamA": e.team==="B"?"teamB":"teamALL";
      return `<th class="${typeClass} ${teamClass}">${e.date.slice(5)}<br>${teamLabel} ${typeLabel}</th>`;
    }).join("");
  table.appendChild(trH);

  // 行作成
  players.forEach(p=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="name">${p.name}</td>`;

    events.forEach(e=>{
      const key = `${e.id}_${p.id}`;
      const status = latest[key];

      const td = document.createElement("td");
      const typeClass = e.type==="match"?"match":"practice";
      const teamClass = e.team==="A"?"teamA": e.team==="B"?"teamB":"teamALL";
      td.classList.add(typeClass, teamClass);

      if(!status) td.classList.add("unset");
      if(status==="present") td.classList.add("present");
      if(status==="absent") td.classList.add("absent");

      td.textContent = status==="present"?"○":status==="absent"?"×":"";

      // クリックで出欠切替
      td.onclick = async ()=>{
        const currentStatus = latest[key];
        const nextStatus = currentStatus==="present"?"absent":"present";

        await addDoc(collection(db,"attendance_logs"),{
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
