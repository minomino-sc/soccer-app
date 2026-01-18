import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
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
const evMsg = document.getElementById("evMsg");
const plMsg = document.getElementById("plMsg");
const list  = document.getElementById("playerList");

/* =========================
   イベント登録
   ========================= */
document.getElementById("saveEvent").onclick = async () => {
  const date  = evDate.value;
  const type  = evType.value;
  const title = evTitle.value;

  const teamValue =
    document.querySelector('input[name="team"]:checked')?.value;

  if(!date){
    evMsg.textContent = "日付は必須です";
    return;
  }
  if(!teamValue){
    evMsg.textContent = "対象チームを選択してください";
    return;
  }

  let targetTeams = [];
  if(teamValue === "A")  targetTeams = ["A"];
  if(teamValue === "B")  targetTeams = ["B"];
  if(teamValue === "AB") targetTeams = ["A","B"];

  await addDoc(collection(db,"events_attendance"),{
    date,
    type,
    title: title || "",
    targetTeams,
    createdAt: serverTimestamp()
  });

  evMsg.textContent = "イベントを登録しました";

  evDate.value = "";
  evTitle.value = "";
  document
    .querySelectorAll('input[name="team"]')
    .forEach(r => r.checked = false);
};

/* =========================
   部員登録
   ========================= */
document.getElementById("savePlayer").onclick = async () => {
  const name   = plName.value.trim();
  const number = Number(plNumber.value);

  if(!name || !number){
    plMsg.textContent = "背番号と名前を入力してください";
    return;
  }

  await addDoc(collection(db,"players_attendance"),{
    name,
    number,
    createdAt: serverTimestamp()
  });

  plMsg.textContent = "部員を登録しました";
  plName.value = "";
  plNumber.value = "";

  loadPlayers();
};

/* =========================
   部員一覧
   ========================= */
async function loadPlayers(){
  list.innerHTML = "";
  const snap = await getDocs(
    query(collection(db,"players_attendance"), orderBy("number","asc"))
  );

  snap.forEach(d=>{
    const p = d.data();
    list.innerHTML += `
      <tr>
        <td>${p.number}</td>
        <td>${p.name}</td>
      </tr>
    `;
  });
}

loadPlayers();
