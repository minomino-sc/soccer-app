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

targetPlayers.push({
  name: a.playerName,
  role: "選手",
  returnTrip: a.returnTrip === "○"
});

    }

  });

// =========================
// 配車対象コーチ
// =========================

coachSnap.forEach((docSnap) => {

  const a =
    docSnap.data();

if (
  a.attendance === "参加" &&
  a.meetingType === "集合場所集合" &&
  (
    a.canDrive !== "○" &&
    a.canDrive !== "◯"
  )
) {

targetPlayers.push({
  name: a.coachName,
  role: "コーチ",
  returnTrip: false
});

  }

});

// =========================
// 配車対象試合当番
// =========================

dutySnap.forEach((docSnap) => {

  const a =
    docSnap.data();

  if (
    a.canDrive !== "○" &&
    a.canDrive !== "◯"
  ) {

    const family =
      a.dutyName
        .replace(/　/g, " ")
        .trim()
        .split(" ")[0];

targetPlayers.push({
  name: `${family}さん`,
  role: "試合当番",
  returnTrip: false
});

  }

});
    
const returnTripTargets = [];

// 保護者
parentSnap.forEach((docSnap) => {

  const a = docSnap.data();

  if (
    a.attendance === "参加" &&
    a.returnTrip === "○"
  ) {

    returnTripTargets.push({
      type: "player",
      name: a.playerName
    });

  }

});

// コーチ
coachSnap.forEach((docSnap) => {

  const a = docSnap.data();

  if (
    a.attendance === "参加" &&
    a.returnTrip === "○"
  ) {

    returnTripTargets.push({
      type: "coach",
      name: a.coachName
    });

  }

});

// 試合当番
dutySnap.forEach((docSnap) => {

  const a = docSnap.data();

  if (
    a.returnTrip === "○"
  ) {

    const family =
      a.dutyName
        .replace(/　/g, " ")
        .trim()
        .split(" ")[0];

    returnTripTargets.push({
      type: "duty",

      // 内部判定用
      dutyName: a.dutyName,

      // 画面表示用
      displayName: `${family}さん`
    });

  }

});

  const needCount =
    targetPlayers.length;  

const absentPlayers = [];

parentSnap.forEach((docSnap) => {

  const a = docSnap.data();

  if (a.attendance !== "参加") {
    absentPlayers.push(a.playerName);
  }

});

const dutyList = [];

dutySnap.forEach((docSnap) => {

  const a = docSnap.data();

  if (a.dutyName) {

const name =
  a.dutyName
    .replace(/　/g, " ")
    .trim()
    .split(" ")[0];

dutyList.push(`${name}さん`);
    
  }

});  
  
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

<h2>🚗 配車表</h2>

<table
style="
width:100%;
border-collapse:collapse;
margin-bottom:20px;
">

<tr>
<td>試合名</td>
<td>${eventData.title}</td>
</tr>

<tr>
<td>対象</td>
<td>${eventData.target}</td>
</tr>

<tr>
<td>開催日</td>
<td>${eventData.date}</td>
</tr>

<tr>
<td>集合時間</td>
<td>${eventData.meetingTime || "未設定"}</td>
</tr>

<tr>
<td>集合場所</td>
<td>${eventData.meetingPlace || "未設定"}</td>
</tr>

<tr>
<td>試合当番</td>
<td>${dutyList.join("・") || "未設定"}</td>
</tr>

<tr>
<td>配車対象</td>
<td>${needCount}名</td>
</tr>

<tr>
<td>利用可能座席</td>
<td>${seatCount}席</td>
</tr>

<tr>
<td>復路希望</td>
<td>${returnTripTargets.length}名</td>
</tr>

</table>

<hr>

  <h3>欠席者</h3>
  ${absentPlayers.length === 0
    ? "<div>なし</div>"
    : absentPlayers.map(n => `<div>❌ ${n}</div>`).join("")
  }

  <hr>

  <h3>試合当番</h3>
  ${dutyList.length === 0
    ? "<div>未設定</div>"
    : dutyList.map(n => `<div>🧑‍✈️ ${n}</div>`).join("")
  }

  <hr>

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
  
// =========================
// 自動配車（均等割り）
// =========================
activeDrivers.forEach(driver => {
  driver.players = [];
});

activeDrivers.forEach(driver => {
  driver.returnPlayers = [];
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
// 復路配車
// =========================

returnTripTargets.forEach(person => {

  // コーチ
  if (person.type === "coach") {

    const coachCar =
      activeDrivers.find(
        d => d.priority === 1
      );

    if (coachCar) {
      coachCar.returnPlayers.push(person.name);
    }

  }

  // 試合当番
else if (person.type === "duty") {

  const dutyCar =
    activeDrivers.find(
      d =>
        d.priority === 2 &&
        d.dutyName === person.dutyName
    );

  if (dutyCar) {

    dutyCar.returnPlayers.push(
      person.displayName
    );

  } else {

    const coachCar =
      activeDrivers.find(
        d => d.priority === 1
      );

    if (coachCar) {

      coachCar.returnPlayers.push(
        person.displayName
      );

    }

  }

}

  // 部員
  else if (person.type === "player") {

    const dutyCar =
      activeDrivers.find(
        d => d.priority === 2
      );

    if (
      dutyCar &&
      dutyCar.returnPlayers.length <
      dutyCar.seats
    ) {

      dutyCar.returnPlayers.push(person.name);

    } else {

      const coachCar =
        activeDrivers.find(
          d => d.priority === 1
        );

      if (coachCar) {
        coachCar.returnPlayers.push(person.name);
      }

    }

  }

});

  
  
// =========================
// 試合道具割当
// =========================
activeDrivers.forEach(driver => {
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

<h3>配車表</h3>

<table
style="
width:100%;
border-collapse:collapse;
">

<tr>
<th>号車</th>
<th>定員</th>
<th>乗車</th>
<th>空席</th>
<th>試合道具</th>
</tr>

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

<tr>
<td>${driver.name}</td>
<td>${driver.seats}</td>
<td>${driver.players.length}</td>
<td>${driver.seats - driver.players.length}</td>
<td>
${driver.equipment
  ? driver.equipment.join("・")
  : ""}
</td>
</tr>

`;

if (driver.players.length > 0) {

  html += `

<tr>
<td colspan="5">

<table
style="
width:100%;
margin-top:5px;
border-collapse:collapse;
">

<tr>
<th>No</th>
<th>氏名</th>
<th>役割</th>
<th>復路</th>
</tr>

`;

driver.players.forEach(
  (player, index) => {

    html += `

<tr
style="
${player.returnTrip
  ? "background:#fff3a0;"
  : ""}
"
>
<td>${index + 1}</td>
<td>${player.name}</td>
<td>${player.role}</td>
<td>
${player.returnTrip ? "復路" : ""}
</td>
</tr>

`;

  }
);

  html += `

</table>

</td>
</tr>

`;

}
  
});

// ←ここ追加

html += `

</table>

`;

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
        ${player.name}
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

    const pdfArea =
      document.getElementById("pdfArea");

    const original =
      document.getElementById("dispatchArea");

    pdfArea.innerHTML = original.innerHTML;

    pdfArea.style.display = "block";

    pdfArea.querySelectorAll("*").forEach(el => {
      el.style.color = "#000000";
    });

const canvas = await html2canvas(pdfArea, {
  scale: 2,
  backgroundColor: "#ffffff",
  useCORS: true,
  windowWidth: pdfArea.scrollWidth,
  windowHeight: pdfArea.scrollHeight
});

pdfArea.style.display = "none";

const imgData = canvas.toDataURL("image/png");

const { jsPDF } = window.jspdf;

const pdf = new jsPDF("p", "mm", "a4");

const pageWidth = pdf.internal.pageSize.getWidth();
const pageHeight = pdf.internal.pageSize.getHeight();

const margin = 10;

const usableWidth = pageWidth - margin * 2;
const usableHeight = pageHeight - margin * 2;

const scale = Math.min(
  usableWidth / canvas.width,
  usableHeight / canvas.height
);

const imgWidth = canvas.width * scale;
const imgHeight = canvas.height * scale;

const x = (pageWidth - imgWidth) / 2;
const y = margin;

pdf.addImage(imgData, "PNG", x, y, imgWidth, imgHeight);

pdf.save(`配車表_${new Date().toISOString().slice(0,10)}.pdf`);
       
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
