import { db } from "./firebase.js";

import {
  TEAM_A,
  TEAM_B,
  COACH_A,
  COACH_B
} from "./players.js";

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
        Number(a.capacity || 0) - 2,
        0
      );

    let team = "";

    if (
      COACH_A.includes(
        a.coachName
      )
    ) {
      team = "箕谷A";
    }

    if (
      COACH_B.includes(
        a.coachName
      )
    ) {
      team = "箕谷B";
    }

    drivers.push({
      priority: 1,
      team,
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
        Number(a.capacity || 0) - 2,
        0
      );

    const family =
      a.dutyName.split(" ")[0];

    let team = "";

    if (
      eventData.target === "箕谷A"
    ) {
      team = "箕谷A";
    }
    else if (
      eventData.target === "箕谷B"
    ) {
      team = "箕谷B";
    }
    else {

      if (
        TEAM_A.includes(
          a.dutyName
        )
      ) {
        team = "箕谷A";
      }

      if (
        TEAM_B.includes(
          a.dutyName
        )
      ) {
        team = "箕谷B";
      }

    }

    drivers.push({
      priority: 2,
      team,
      dutyName: a.dutyName,
      canCarryEquipment:
        a.canCarryEquipment || "×",
      name: `${family}さん号`,
      seats
    });

  }

});
  
  drivers.sort(
    (a, b) =>
      a.priority - b.priority
  );

const activeDrivers = [];

// 試合当番を先に採用
const dutyDrivers =
  drivers.filter(
    d => d.priority === 2
  );

activeDrivers.push(
  ...dutyDrivers
);

// コーチを座席数順で並べる
const coachDrivers =
  drivers
    .filter(
      d => d.priority === 1
    )
    .sort(
      (a, b) =>
        b.seats - a.seats
    );

let capacity =
  dutyDrivers.reduce(
    (sum, d) =>
      sum + d.seats,
    0
  );

// =========================
// A/B別コーチ最低1台保証
// =========================

// Aチーム
const coachesA =
  coachDrivers.filter(d => d.team === "箕谷A");

if (coachesA.length > 0) {
  activeDrivers.push(coachesA[0]);
  capacity += coachesA[0].seats;
}

// Bチーム
const coachesB =
  coachDrivers.filter(d => d.team === "箕谷B");

if (coachesB.length > 0) {
  activeDrivers.push(coachesB[0]);
  capacity += coachesB[0].seats;
}

// =========================
// 残りコーチ（A/Bで使ってない分）
// =========================

// すでに使ったコーチを記録
const usedCoaches = new Set([
  ...(coachesA[0] ? [coachesA[0]] : []),
  ...(coachesB[0] ? [coachesB[0]] : [])
]);

for (const coach of coachDrivers) {

  if (usedCoaches.has(coach)) continue;

  if (capacity >= needCount) break;

  activeDrivers.push(coach);
  capacity += coach.seats;

}

  // =========================
  // 総座席数
  // =========================
  let seatCount = 0;

  activeDrivers.forEach(driver => {

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
    配車可能一覧
  </h3>

`;
  
activeDrivers.forEach(driver => {

  if (
    driver.players &&
    driver.players.length === 0
  ) {
    return;
  }

  html += `
    <div>
      🚗 ${driver.name}
      （${driver.seats}席）
    </div>
  `;

});

// =========================
// 自動配車（均等割り）
// =========================
activeDrivers.forEach(driver => {
  driver.players = [];
});

const assignDrivers =
  [...activeDrivers].sort(
    (a, b) =>
      b.priority - a.priority
  );

let playerIndex = 0;

while (
  playerIndex < targetPlayers.length
) {

  let assigned = false;

  assignDrivers.forEach(driver => {

    if (
      playerIndex >=
      targetPlayers.length
    ) {
      return;
    }

    if (
      driver.players.length <
      driver.seats
    ) {

      driver.players.push(
        targetPlayers[playerIndex]
      );

      playerIndex++;
      assigned = true;

    }

  });

  if (!assigned) {
    break;
  }

}

// 配車なしドライバー対策
activeDrivers.forEach(driver => {

  if (!driver.players) {
    driver.players = [];
  }

});
  
// =========================
// 試合道具割当
// =========================
drivers.forEach(driver => {
  driver.equipment = [];
});

// A
const dutyA =
  activeDrivers.find(
    d =>
      d.priority === 2 &&
      d.team === "箕谷A"
  );

if (dutyA) {

  if (
    dutyA.canCarryEquipment === "○"
  ) {

    dutyA.equipment.push("A");

  } else {

const aCoaches =
  activeDrivers.filter(
          d =>
            d.priority === 1 &&
            d.team === "箕谷A"
        )
        .sort(
          (a, b) =>
            a.players.length -
            b.players.length
        );

    if (aCoaches.length) {
      aCoaches[0]
        .equipment
        .push("A");
    }

  }

}

// B
const dutyB =
  activeDrivers.find(
    d =>
      d.priority === 2 &&
      d.team === "箕谷B"
  );

if (dutyB) {

  if (
    dutyB.canCarryEquipment === "○"
  ) {

    dutyB.equipment.push("B");

  } else {

const bCoaches =
  activeDrivers.filter(
          d =>
            d.priority === 1 &&
            d.team === "箕谷B"
        )
        .sort(
          (a, b) =>
            a.players.length -
            b.players.length
        );

    if (bCoaches.length) {
      bCoaches[0]
        .equipment
        .push("B");
    }

  }

}  
  
html += `

  <hr>

  <h3>
    配車表
  </h3>

`;
  
activeDrivers.forEach(driver => {

  if (
    driver.players.length === 0 &&
    (
      !driver.equipment ||
      driver.equipment.length === 0
    )
  ) {
    return;
  }
    
  html += `

    <div
      style="
        border:1px solid #555;
        padding:10px;
        margin-bottom:15px;
      ">

<div
  style="
    font-weight:bold;
    margin-bottom:8px;
  ">
  🚗 ${driver.name}
</div>

<div>
  定員：${driver.seats}名
</div>

<div>
  乗車：${driver.players.length}名
</div>

<div>
  空席：
  ${driver.seats - driver.players.length}席
</div>

<hr>

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

  driver.players.forEach(
    (player, index) => {

      html += `
        <div>
          ${index + 1}．${player}
        </div>
      `;

    }
  );

}

if (
  driver.equipment &&
  driver.equipment.length
) {

  html += `

    <hr>

    <div
      style="
        font-weight:bold;
      ">

      ※試合道具
      （${driver.equipment.join("・")}）

    </div>

  `;

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

document
  .getElementById("pdfBtn")
  .addEventListener("click", async () => {

    // PDF用エリアにコピー
    const original =
      document.getElementById("dispatchArea");

    const pdfArea =
      document.getElementById("pdfArea");

    pdfArea.innerHTML = original.innerHTML;

    // 一時的に表示（重要）
    pdfArea.style.display = "block";
   
// ★追加（これが今回の修正）

pdfArea.querySelectorAll("*").forEach(el => {

  el.style.color = "#000000";

});

    const canvas =
      await html2canvas(pdfArea, {
        scale: 2,
        backgroundColor: "#ffffff"
      });

    pdfArea.style.display = "none";

    const imgData =
      canvas.toDataURL("image/png");

    const { jsPDF } = window.jspdf;

    const pdf =
      new jsPDF("p", "mm", "a4");

    const pdfWidth =
      pdf.internal.pageSize.getWidth();

    const pdfHeight =
      (canvas.height * pdfWidth) / canvas.width;

    let heightLeft = pdfHeight;
    let position = 0;

    pdf.addImage(
      imgData,
      "PNG",
      0,
      position,
      pdfWidth,
      pdfHeight
    );

    heightLeft -= 297;

    // 🔥 ページ分割
    while (heightLeft > 0) {

      position = heightLeft - pdfHeight;

      pdf.addPage();

      pdf.addImage(
        imgData,
        "PNG",
        0,
        position,
        pdfWidth,
        pdfHeight
      );

      heightLeft -= 297;
    }

    pdf.save(
      `配車表_${new Date().toISOString().slice(0,10)}.pdf`
    );

  });

document
  .getElementById("lineBtn")
  .addEventListener("click", () => {

    const text =
      document.getElementById("dispatchArea").innerText;

    const encoded =
      encodeURIComponent(text);

    const url =
      `https://line.me/R/msg/text/?${encoded}`;

    window.open(url, "_blank");

  });
