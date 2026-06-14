import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "★★★★★",
  authDomain: "★★★★★",
  projectId: "minotani-sc-app",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
