import { db } from "./firebase.js";

import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const params =
  new URLSearchParams(
    window.location.search
  );

const id =
  params.get("id");

const eventSnap =
  await getDoc(
    doc(
      db,
      "car_dispatch_events",
      id
    )
  );

if (!eventSnap.exists()) {

  document.getElementById(
    "dispatchArea"
  ).innerHTML =
    "イベントが見つかりません";

}
else {

  const eventData =
    eventSnap.data();

  // =========================
  // 保護者回答
  // =========================
  const parentSnap =
    await getDocs(
      query(
        collection(db, "parent_answers"),
        where("eventId", "==", id)
      )
    );

  // =========================
  // コーチ回答
  // =========================
  const coachSnap =
    await getDocs(
      query(
        collection(db, "coach_answers"),
        where("eventId", "==", id)
      )
    );

  // =========================
  // 試合当番回答
  // =========================
  const dutySnap =
    await getDocs(
      query(
        collection(db, "duty_answers"),
        where("eventId", "==", id)
      )
    );

  // =========================
  // 配車対象選手
  // =========================
  const targetPlayers = [];

  parentSnap.forEach((docSnap) => {

    const a =
      docSnap.data();

    if (
      a.attendance === "参加" &&
      a.meetingType === "pickup"
    ) {

      targetPlayers.push(
        a.playerName
      );

    }

  });

  const needCount =
    targetPlayers.length;

  // =========================
  // ドライバー一覧
  // =========================
  const drivers = [];

    // コーチ
  coachSnap.forEach((docSnap) => {

    const a =
      docSnap.data();

    if (
      a.attendance === "参加" &&
      a.meetingType === "集合場所集合" &&
      (
        a.canDrive === "○" ||
        a.canDrive === "◯"
      )
    ) {

      const seats =
        Math.max(
          Number(a.capacity || 0) - 1,
          0
        );

      drivers.push({
        priority: 1,
        name: a.coachName,
        seats
      });

    }

  });

  // 試合当番
  dutySnap.forEach((docSnap) => {

    const a =
      docSnap.data();

    if (
      a.canDrive === "○" ||
      a.canDrive === "◯"
    ) {

      const seats =
        Math.max(
          Number(a.capacity || 0) - 1,
          0
        );

      const family =
        a.dutyName.split(" ")[0];

      drivers.push({
        priority: 2,
        name: `${family}さん号`,
        seats
      });

    }

  });

  drivers.sort(
    (a, b) =>
      a.priority - b.priority
  );

  // =========================
  // 総座席数
  // =========================
  let seatCount = 0;

  drivers.forEach(driver => {

    seatCount +=
      driver.seats;

  });

  // =========================
  // 配車不足判定
  // =========================
  const shortage =
    Math.max(
      needCount - seatCount,
      0
    );

  // =========================
  // 画面
  // =========================
  let html = `

    <h2>
      🚗 配車作成
    </h2>

    <h3>
      ${eventData.title}
    </h3>

    <div>
      日付：
      ${eventData.date}
    </div>

    <div>
      対象：
      ${eventData.target}
    </div>

    <hr>

    <h3>
      配車判定
    </h3>

    <div>
      配車対象：
      ${needCount}名
    </div>

    <div>
      利用可能座席：
      ${seatCount}席
    </div>

  `;

  if (shortage > 0) {

    html += `

      <div
        style="
          color:red;
          font-weight:bold;
          margin-top:20px;
        ">

        🚨 配車不足

        <br>

        不足人数：
        ${shortage}名

      </div>

    `;

  }
  else {

    html += `

      <div
        style="
          color:lime;
          font-weight:bold;
          margin-top:20px;
        ">

        ✅ 配車可能

      </div>

    `;

  }

  html += `

  <hr>

  <h3>
    ドライバー一覧
  </h3>

`;


// =========================
// 自動配車
// =========================
let playerIndex = 0;

drivers.forEach(driver => {

  driver.players = [];

  for (
    let i = 0;
    i < driver.seats;
    i++
  ) {

    if (
      playerIndex >=
      targetPlayers.length
    ) {
      break;
    }

    driver.players.push(
      targetPlayers[playerIndex]
    );

    playerIndex++;

  }

});

html += `

  <hr>

  <h3>
    配車表
  </h3>

`;

drivers.forEach(driver => {

  html += `

    <div
      style="
        border:1px solid #555;
        padding:10px;
        margin-bottom:15px;
      ">

      <div>
        🚗 ${driver.name}
      </div>

  `;

  if (
    driver.players.length === 0
  ) {

    html += `
      <div>
        配車なし
      </div>
    `;
  }
  else {

    driver.players.forEach(player => {

      html += `
        <div>
          ・${player}
        </div>
      `;

    });

  }

  html += `
    </div>
  `;

});

const remainPlayers =
  targetPlayers.slice(
    playerIndex
  );

if (
  remainPlayers.length > 0
) {

  html += `

    <hr>

    <h3>
      🚨 配車できなかった選手
    </h3>

  `;

  remainPlayers.forEach(player => {

    html += `
      <div>
        ${player}
      </div>
    `;

  });

}

  document.getElementById(
    "dispatchArea"
  ).innerHTML =
    html;

}
