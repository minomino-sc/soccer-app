import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* Firebase */
const firebaseConfig = {
  apiKey: "★★★★★",
  authDomain: "★★★★★",
  projectId: "minotani-sc-app",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* ===== イベント登録 ===== */
document.getElementById("saveEvent").onclick = async () => {
  const date  = document.getElementById("eventDate").value;
  const type  = document.getElementById("eventType").value;
  const title = document.getElementById("eventTitle").value;
  const msg   = document.getElementById("eventMsg");

  if(!date){
    msg.textContent = "日付は必須です";
    return;
  }

  try{
    await addDoc(collection(db,"events_attendance"),{
      date,
      type,
      title: title || "",
      createdAt: serverTimestamp()
    });
    msg.textContent = "イベントを登録しました";
    document.getElementById("eventTitle").value = "";
  }catch(e){
    console.error(e);
    msg.textContent = "登録に失敗しました";
  }
};

/* ===== 部員登録 ===== */
document.getElementById("savePlayer").onclick = async () => {
  const name = document.getElementById("playerName").value.trim();
  const team = document.getElementById("playerTeam").value;
  const msg  = document.getElementById("playerMsg");

  if(!name){
    msg.textContent = "名前を入力してください";
    return;
  }

  try{
    await addDoc(collection(db,"players_attendance"),{
      name,
      team,
      createdAt: serverTimestamp()
    });
    msg.textContent = "部員を登録しました";
    document.getElementById("playerName").value = "";
  }catch(e){
    console.error(e);
    msg.textContent = "登録に失敗しました";
  }
};
