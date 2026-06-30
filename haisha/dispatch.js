import { db } from "./firebase.js";

document.body.classList.add(
  "dispatch-page"
);

import {
  TEAM_A,
  TEAM_B,
  COACH_A,
  COACH_B,
  COACH_CHILD,
  PARENT_CHILD
} from "./players.js";

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
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

let activeDrivers = [];

  const usedNames = new Set();

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

const dispatchConfirmed =
  eventData.dispatchConfirmed === true;

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
  returnTrip: a.returnTrip === "○"
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
  (a.parentName || "")
    .replace(/　/g, " ")
    .trim()
    .split(" ")[0];

if (usedNames.has(family)) return;
usedNames.add(family);    

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

let needCount =
  targetPlayers.length;

  const playerCount =
  targetPlayers.filter(
    p => p.role === "選手"
  ).length;

const coachCount =
  targetPlayers.filter(
    p => p.role === "コーチ"
  ).length;

const dutyCount =
  targetPlayers.filter(
    p => p.role === "試合当番"
  ).length;

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

// =========================
// 配車回数取得
// =========================
const driverCounts = {};

const countSnap =
  await getDocs(
    collection(db, "driver_counts")
  );

countSnap.forEach(docSnap => {
  
 driverCounts[docSnap.id] =
  docSnap.data().count || 0;
  
  });
  
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

if (usedNames.has(a.coachName)) return;
usedNames.add(a.coachName);
    
drivers.push({
  priority: 1,
  team,
name: a.coachName,
  seats,
  count: driverCounts[a.coachName] || 0
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

// ★ここに追加（重要）
if (usedNames.has(family)) return;
usedNames.add(family);

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
  seats,
  count: driverCounts[family] || 0
});
    
  }

});

// 保護者
parentSnap.forEach((docSnap) => {

  const a = docSnap.data();

  if (
    a.attendance === "参加" &&
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

const family =
  a.playerName
    .replace(/　/g, " ")
    .trim()
    .split(" ")[0];

if (usedNames.has(family)) return;
usedNames.add(family);
    
    let team = "";

    if (TEAM_A.includes(a.playerName)) {
      team = "箕谷A";
    }

    if (TEAM_B.includes(a.playerName)) {
      team = "箕谷B";
    }

drivers.push({
  priority: 3,
  team,
  playerName: a.playerName,
  name: `${family}さん号`,
  seats,
  count: driverCounts[family] || 0
});

  }

});
  
  drivers.sort(
    (a, b) =>
      a.priority - b.priority
  );

activeDrivers = [];

// 試合当番を先に採用
const dutyDrivers =
  drivers
    .filter(d => d.priority === 2)
    .sort((a, b) => {

      if (a.count !== b.count) {
        return a.count - b.count;
      }

      return b.seats - a.seats;

    });

activeDrivers.push(
  ...dutyDrivers
);

// コーチを座席数順で並べる
const coachDrivers =
  drivers
    .filter(
      d => d.priority === 1
    )
    .sort((a, b) => {

      // ① 配車回数が少ない人を優先
      if (a.count !== b.count) {
        return a.count - b.count;
      }

      // ② 同じ回数なら座席数が多い人を優先
      return b.seats - a.seats;

    });

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
// 保護者追加
// =========================

const parentDrivers =
  drivers
    .filter(d => d.priority === 3)
    .sort((a, b) => {

      if (a.count !== b.count) {
        return a.count - b.count;
      }

      return b.seats - a.seats;

    });

// 保護者は「コーチで足りない時だけ」使う
if (capacity < needCount) {

  for (const parent of parentDrivers) {

    if (capacity >= needCount) break;

    activeDrivers.push(parent);
    capacity += parent.seats;

  }

}

  // =========================
  // 総座席数
  // =========================
  let seatCount = 0;

// =========================
// 採用されなかったドライバーを乗車対象へ追加
// =========================

drivers.forEach(driver => {

  // 保護者だけは除外する
if (driver.priority === 3) return;

  const isDriving =
    activeDrivers.includes(driver);

  if (isDriving) return;

  targetPlayers.push({

name: driver.priority === 1
  ? driver.name.replace("号", "")
  : driver.name.replace("号", ""),

role:
  driver.priority === 1
    ? "コーチ"
    : driver.priority === 2
      ? "試合当番"
      : "保護者",

    returnTrip: false

  });

});

  needCount = targetPlayers.length;

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
<td>利用可能座席</td>
<td>${seatCount}席（運転手含まず、2席分を除外して算出）</td>
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

// =========================
// ドライバーの子どもを先に自分の車へ乗せる
// =========================
activeDrivers.forEach(driver => {

  let children = [];

  // コーチ
  if (driver.priority === 1) {

    children =
      COACH_CHILD[driver.name] || [];

  }

// 試合当番
else if (driver.priority === 2) {

  const parent =
    driver.name.replace("号", "");

  children =
    PARENT_CHILD[parent] || [];

}

// 保護者
else {

  children = [
    driver.playerName
  ];

}
  
  children.forEach(childName => {

    const index =
      targetPlayers.findIndex(
        p => p.name === childName
      );

    if (
      index >= 0 &&
      driver.players.length < driver.seats
    ) {

      driver.players.push(
        targetPlayers[index]
      );

      targetPlayers.splice(index, 1);

    }

  });

});
  
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
display:flex;
align-items:center;
margin-top:20px;
margin-bottom:10px;
"
>

<div
style="
width:220px;
font-size:20px;
font-weight:bold;
flex-shrink:0;
"
>
🚗 ${driver.name.endsWith("号") ? driver.name : driver.name + "号"}
</div>

<div
style="
flex:1;
font-weight:bold;
text-align:right;
"
>
定員：${driver.seats}名 ／
乗車：${driver.players.length}名 ／
空席：${driver.seats - driver.players.length}名 ／
試合道具：${
  driver.equipment.length
    ? driver.equipment
        .map(e =>
          e === "A"
            ? "◎（箕谷A）"
            : "◎（箕谷B）"
        )
        .join("・")
    : "－"
}

</div>

</div>




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
table-layout:fixed;
"
>

<tr>

<th
style="
border:1px solid #ccc;
padding:4px;
background:#f5f5f5;
"
>
No
</th>

<th
style="
border:1px solid #ccc;
padding:4px;
background:#f5f5f5;
"
>
氏名
</th>

<th
style="
border:1px solid #ccc;
padding:4px;
background:#f5f5f5;
"
>
役割
</th>

<th
style="
border:1px solid #ccc;
padding:4px;
background:#f5f5f5;
"
>
復路
</th>

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

<td
style="
border:1px solid #ccc;
padding:4px;
text-align:center;
"
>
${index + 1}
</td>

<td
style="
border:1px solid #ccc;
padding:4px;
"
>
${player.name}
</td>

<td
style="
border:1px solid #ccc;
padding:4px;
text-align:center;
"
>
${player.role}
</td>

<td
style="
border:1px solid #ccc;
padding:4px;
text-align:center;
font-weight:bold;
"
>
${player.returnTrip ? "◎" : ""}
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

html += `

<hr>

<h3>
復路配車一覧
</h3>

`;

 // 往路ドライバー一覧
const outwardDrivers =
  activeDrivers.map(driver => {

    if (driver.priority === 2) {

      return driver.name.replace("号", "");

    }

    return driver.name;

  }); 

activeDrivers.forEach(driver => {

  if (
    !driver.returnPlayers ||
    driver.returnPlayers.length === 0
  ) {
    return;
  }

const members =
  driver.returnPlayers.filter(name => {

    return !outwardDrivers.includes(name);

  });

if (members.length === 0) {
  return;
}
  
  html += `

<div>
🚗 ${driver.name.endsWith("号") ? driver.name : driver.name + "号"}：
${members.join("／")}
</div>

`;

});

document.getElementById(
  "dispatchArea"
).innerHTML =
  html;

document.getElementById("buttonArea").innerHTML =
dispatchConfirmed
? `
<div style="margin-top:30px;text-align:center;">

<button id="cancelBtn">
❌ 配車確定取消
</button>

</div>
`
: `
<div style="margin-top:30px;text-align:center;">

<button id="confirmBtn">
🚗 配車確定
</button>

</div>
`;

 } 

const confirmBtn =
  document.getElementById("confirmBtn");

if (confirmBtn) {

  confirmBtn.addEventListener(
    "click",
    async () => {

if (!confirm("配車を確定しますか？")) {
  return;
}
      
      for (const driver of activeDrivers) {

let key;

if (driver.priority === 1) {

  key = driver.name;

}
else if (driver.priority === 2) {

  key = driver.dutyName;

}
else {

  key =
    driver.playerName
      .replace(/　/g, " ")
      .trim()
      .split(" ")[0];

}

await updateDoc(
  doc(
    db,
    "driver_counts",
    key
  ),
  {
    count: increment(1)
  }
);        

      }

await updateDoc(
  doc(
    db,
    "car_dispatch_events",
    id
  ),
  {
    dispatchConfirmed: true
  }
);

alert("配車を確定しました。");

location.reload();

    }
  );

}

const cancelBtn =
  document.getElementById("cancelBtn");

if (cancelBtn) {

  cancelBtn.addEventListener(
    "click",
    async () => {

      if (!confirm("配車確定を取り消しますか？")) {
        return;
      }

      for (const driver of activeDrivers) {

let key;

if (driver.priority === 1) {

  key = driver.name;

}
else if (driver.priority === 2) {

  key = driver.dutyName;

}
else {

  key =
    driver.playerName
      .replace(/　/g, " ")
      .trim()
      .split(" ")[0];

}

        await updateDoc(
          doc(db, "driver_counts", key),
          {
            count: increment(-1)
          }
        );

      }

      await updateDoc(
        doc(db, "car_dispatch_events", id),
        {
          dispatchConfirmed: false
        }
      );

      alert("配車確定を取り消しました。");
      location.reload();

    }
  );

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

// =========================
// 配車確定
// =========================   
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
