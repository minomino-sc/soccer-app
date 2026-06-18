import { db } from "./firebase.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const params =
  new URLSearchParams(
    window.location.search
  );

const id =
  params.get("id");

const snap =
  await getDoc(
    doc(
      db,
      "car_dispatch_events",
      id
    )
  );

if (!snap.exists()) {

  document.getElementById(
    "dispatchArea"
  ).innerHTML =
    "イベントが見つかりません";

}
else {

  const data =
    snap.data();

  document.getElementById(
    "dispatchArea"
  ).innerHTML = `

    <h2>${data.title}</h2>

    <div>
      日付：${data.date}
    </div>

    <div>
      対象：${data.target}
    </div>

  `;

}
