import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, getDocs, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "★★★★★",
  authDomain: "★★★★★",
  projectId: "minotani-sc-app",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let current = new Date();
const body = document.getElementById("statsBody");
const label = document.getElementById("monthLabel");

document.getElementById("prevMonth").onclick = () => {
  current.setMonth(current.getMonth() - 1);
  render();
};
document.getElementById("nextMonth").onclick = () => {
  current.setMonth(current.getMonth() + 1);
  render();
};

render();

async function render() {
  label.textContent = `${current.getFullYear()}年 ${current.getMonth() + 1}月`;
  body.innerHTML = "";

  const players = await getDocs(collection(db, "players_attendance"));
  const events = await getDocs(collection(db, "events_attendance"));
  const logs = await getDocs(
    query(collection(db, "attendance_logs"), orderBy("createdAt"))
  );

  const latest = {};
  logs.forEach(l => {
    const d = l.data();
    latest[`${d.playerId}_${d.eventId}`] = d;
  });

  players.forEach(p => {
    let prHit=0, prTot=0, maHit=0, maTot=0;

    events.forEach(e => {
      const ev = e.data();
      const d = new Date(ev.date);
      if (
        d.getFullYear() !== current.getFullYear() ||
        d.getMonth() !== current.getMonth()
      ) return;

      const s = latest[`${p.id}_${e.id}`]?.status;
      if (ev.type === "practice") {
        prTot++;
        if (s === "present") prHit++;
      }
      if (ev.type === "match") {
        maTot++;
        if (s === "present") maHit++;
      }
    });

    const totalTot = prTot + maTot;
    const totalHit = prHit + maHit;

    body.innerHTML += `
      <tr>
        <td>${p.data().name}</td>
        <td>${prTot ? Math.round(prHit/prTot*100) : 0}%</td>
        <td>${maTot ? Math.round(maHit/maTot*100) : 0}%</td>
        <td>${totalTot ? Math.round(totalHit/totalTot*100) : 0}%</td>
      </tr>
    `;
  });
}
