/* ===== Firebase SDK ===== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ===== Firebase設定（既存と同じに）===== */
const firebaseConfig = {
  apiKey: "★★★★★既存のもの★★★★★",
  authDomain: "★★★★★既存のもの★★★★★",
  projectId: "minotani-sc-app",
  storageBucket: "★★★★★",
  messagingSenderId: "★★★★★",
  appId: "★★★★★"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* ===== 強制デバッグ ===== */
const eventList = document.getElementById("eventList");

if (eventList) {
  debugInit();
}

async function debugInit() {
  try {
    eventList.innerHTML = "<p>JS 起動 OK</p>";

    const eventsSnap = await getDocs(collection(db, "events_attendance"));
    eventList.innerHTML += `<p>events_attendance: ${eventsSnap.size} 件</p>`;

    const playersSnap = await getDocs(collection(db, "players_attendance"));
    eventList.innerHTML += `<p>players_attendance: ${playersSnap.size} 件</p>`;

  } catch (e) {
    eventList.innerHTML = `
      <p style="color:red">
        エラー発生:<br>${e.message}
      </p>
    `;
  }
}
