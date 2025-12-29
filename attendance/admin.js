import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

console.log("admin.js 起動 OK");

/* Firebase設定（既存と同じ） */
const firebaseConfig = {
  apiKey: "★★★★★",
  authDomain: "★★★★★",
  projectId: "minotani-sc-app",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const btn = document.getElementById("save");
const msg = document.getElementById("msg");

btn.onclick = async () => {
  const date  = document.getElementById("date").value;
  const type  = document.getElementById("type").value;
  const title = document.getElementById("title").value;

  if (!date) {
    msg.textContent = "日付は必須です";
    return;
  }

  try {
    await addDoc(collection(db, "events_attendance"), {
      date,                 // YYYY-MM-DD
      type,                 // practice / match / holiday
      title: title || "",   // 空OK
      createdAt: serverTimestamp()
    });

    msg.textContent = "登録しました";
    document.getElementById("title").value = "";
  } catch (e) {
    console.error(e);
    msg.textContent = "登録に失敗しました";
  }
};
