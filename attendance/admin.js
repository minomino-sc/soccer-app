import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs,
  query, orderBy, serverTimestamp
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
const list = document.getElementById("playerList");

/* イベント登録 */
document.getElementById("saveEvent").onclick = async () => {
  const date  = evDate.value;
  const type  = evType.value;
  const title = evTitle.value;

  if(!date){
    evMsg.textContent = "日付は必須です";
    return;
  }

  await addDoc(collection(db,"events_attendance"),{
    date, type, title: title || "",
    createdAt: serverTimestamp()
  });

  evMsg.textContent = "イベントを登録しました";
  evTitle.value = "";
};

/* 部員登録 */
document.getElementById("savePlayer").onclick = async () => {
  const name = plName.value.trim();
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

/* 部員一覧（背番号順） */
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
