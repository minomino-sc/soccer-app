import { db } from "./firebase.js";

import {
  collection,
  setDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  COACH_A,
  COACH_B,
  TEAM_A,
  TEAM_B
} from "./players.js";

const allDrivers = [
  ...COACH_A,
  ...COACH_B,
  ...TEAM_A,
  ...TEAM_B
];

// 重複削除
const drivers =
  [...new Set(allDrivers)];

for (const name of drivers) {

  await setDoc(
    doc(
      db,
      "driver_counts",
      name
    ),
    {
      count: 0
    }
  );

}

alert("初期登録完了");
