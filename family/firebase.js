// Firebase設定
// Firebase Console > プロジェクトの設定 > 全般 > マイアプリ に表示される
// Webアプリの設定値を、下の XXXXX 部分に入力してください。
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "ここにapiKey",
  authDomain: "minotani-sc-app.firebaseapp.com",
  projectId: "minotani-sc-app",
  storageBucket: "minotani-sc-app.appspot.com",
  messagingSenderId: "ここにmessagingSenderId",
  appId: "ここにappId"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
