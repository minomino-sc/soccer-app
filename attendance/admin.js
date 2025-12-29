import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, addDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* Firebase設定（既存と同じ） */
const firebaseConfig = {
  apiKey: "★★★★★",
  authDomain: "★★★★★",
  projectId: "minotani-sc-app",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

document.getElementById("save").onclick = async () => {
  const date = document.getElementById("date").value;
  const type = document.getElementById("type").value;
  const title = document.getElementById("title").value;
  const msg = document.getElementById("msg");

  if (!date || !title) {
    msg.textContent = "日付とタイトルは必須です";
    return;
  }

  await addDoc(collection(db, "events_attendance"), {
    date,          // YYYY-MM-DD
    type,          // practice / match / holiday
    title
  });

  msg.textContent = "登録しました";
  document.getElementById("title").value = "";
};
