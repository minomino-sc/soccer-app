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

// =========================
// 配車モード
// =========================
const dispatchMode =
  eventData.dispatchMode || "max";

const dispatchConfirmed =
  eventData.dispatchConfirmed === true;

  const savedDispatch =
  eventData.dispatchData || [];

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
  (a.dutyName || "")
    .replace(/　/g, " ")
    .trim()
    .split(" ")[0];

if (!family) return;

targetPlayers.push({
  name: `${family}さん`,
  role: "試合当番",
  returnTrip: a.returnTrip === "○"
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

// =========================
// 現地集合者
// =========================
const localMembers = [];

// 部員
parentSnap.forEach((docSnap) => {

  const a = docSnap.data();

  if (
    a.attendance === "参加" &&
    a.meetingType === "現地集合"
  ) {

    localMembers.push(a.playerName);

  }

});

// コーチ
coachSnap.forEach((docSnap) => {

  const a = docSnap.data();

  if (
    a.attendance === "参加" &&
    a.meetingType === "現地集合"
  ) {

    localMembers.push(a.coachName);

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

const capacity =
  Number(a.capacity || 0);

const baseSeats =
  Math.max(capacity - 1, 0);

let seats = baseSeats;

if (dispatchMode === "relaxed") {

  if (capacity >= 7) {

    // 7～8人乗りは3列目を使わない
    seats = 5;

  } else {

    // 4～6人乗りは通常どおり使用
    seats = baseSeats;

  }

}    
    
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
  capacity: Number(a.capacity || 0), // ←追加
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

const capacity =
  Number(a.capacity || 0);

const baseSeats =
  Math.max(capacity - 1, 0);

let seats = baseSeats;

if (dispatchMode === "relaxed") {

  if (capacity >= 7) {

    // 7～8人乗りは3列目を使わない
    seats = 5;

  } else {

    // 4～6人乗りは通常どおり使用
    seats = baseSeats;

  }

}

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
  capacity: Number(a.capacity || 0), // ←追加
  seats,
  count: driverCounts[family] || 0
});
    
  }

});

// =========================
// アラート開始
// =========================
  
alert(
  "試合当番ドライバー\n\n" +
  drivers
    .filter(d => d.priority === 2)
    .map(d => d.name)
    .join("\n")
);
// =========================
// アラート終了
// =========================  
 
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

const capacity =
  Number(a.capacity || 0);

const baseSeats =
  Math.max(capacity - 1, 0);

let seats = baseSeats;

if (dispatchMode === "relaxed") {

  if (capacity >= 7) {

    // 7～8人乗りは3列目を使わない
    seats = 5;

  } else {

    // 4～6人乗りは通常どおり使用
    seats = baseSeats;

  }

}

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
  capacity: Number(a.capacity || 0), // ←追加
  seats,
  count: driverCounts[family] || 0
});

  }

// =========================
// 同じ家庭のドライバー重複削除
// 優先：試合当番 → コーチ → 保護者
// =========================

const familyDriverMap = {};

drivers.forEach(driver => {

  let family = "";

  // コーチ
  if (driver.priority === 1) {

    family =
      driver.name
        .replace("コーチ","")
        .trim();

  }

  // 試合当番
  if (driver.priority === 2) {

    family =
      driver.name
        .replace("さん号","")
        .trim();

  }

  // 保護者
  if (driver.priority === 3) {

    family =
      driver.name
        .replace("さん号","")
        .trim();

  }

  if (!familyDriverMap[family]) {

    familyDriverMap[family] = [];

  }

  familyDriverMap[family].push(driver);

});

const newDrivers = [];

Object.values(familyDriverMap)
.forEach(list => {

  const selected =
    list.sort((a,b)=>{

      // 試合当番を最優先
      const rank = {
        2: 1,
        1: 2,
        3: 3
      };

      return rank[a.priority]
        -
        rank[b.priority];

    })[0];

  newDrivers.push(selected);

});

drivers.length = 0;

drivers.push(
  ...newDrivers
);
  
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

// =========================
// アラート開始
// =========================
alert(
  "試合当番ドライバー\n\n" +
  dutyDrivers.map(d => d.name).join("\n")
);
// =========================
// アラート終了
// =========================  

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

// 最終的に乗車する人数を見て判断
const finalNeedCount =
  needCount +
  coachDrivers.filter(
    coach => !usedCoaches.has(coach)
  ).length;

for (const coach of coachDrivers) {
  
  if (usedCoaches.has(coach)) continue;

  if (capacity >= finalNeedCount) break;

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

let returnTrip = false;

// コーチ
if (driver.priority === 1) {

  const coach =
    coachSnap.docs.find(doc =>
      doc.data().coachName === driver.name
    );

  returnTrip =
    coach?.data().returnTrip === "○";

}

// 試合当番
else if (driver.priority === 2) {

  const family =
    driver.name.replace("さん号", "");

  const duty =
    dutySnap.docs.find(doc => {

      const dutyFamily =
        doc.data().dutyName
          .replace(/　/g, " ")
          .trim()
          .split(" ")[0];

      return dutyFamily === family;

    });

  returnTrip =
    duty?.data().returnTrip === "○";

}

targetPlayers.push({

  name: driver.priority === 1
    ? driver.name
    : driver.name.replace("号", ""),

  role:
    driver.priority === 1
      ? "コーチ"
      : driver.priority === 2
        ? "試合当番"
        : "保護者",

  returnTrip

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
<td>${seatCount}席（運転手1席分を除外して算出）</td>
</tr>

</table>

<hr>

  <h3>欠席者</h3>
  ${absentPlayers.length === 0
    ? "<div>なし</div>"
    : absentPlayers.map(n => `<div>❌ ${n}</div>`).join("")
  }

<hr>

<h3>現地集合</h3>

${
  localMembers.length === 0
    ? "<div>なし</div>"
    : localMembers.map(n => `<div>📍 ${n}</div>`).join("")
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

let playerIndex = 0;

if (dispatchConfirmed) {

  savedDispatch.forEach(driver => {    
    
    driver.players ??= [];
    driver.returnPlayers ??= [];
    driver.equipment ??= [];

  });

  activeDrivers = savedDispatch;  

} else {
  
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
// コーチ優先割り当て（均等割り）
// =========================

const coachCars =
  activeDrivers.filter(
    d => d.priority === 1
  );

let coachCarIndex = 0;

while (
  targetPlayers.some(
    p => p.role === "コーチ"
  ) &&
  coachCars.length > 0
) {

  const idx =
    targetPlayers.findIndex(
      p => p.role === "コーチ"
    );

  if (idx === -1) break;

  let assigned = false;

  for (
    let i = 0;
    i < coachCars.length;
    i++
  ) {

    const driver =
      coachCars[
        (coachCarIndex + i) %
        coachCars.length
      ];

    if (
      driver.players.length <
      driver.seats
    ) {

      driver.players.push(
        targetPlayers[idx]
      );

      targetPlayers.splice(idx, 1);

      coachCarIndex =
        (coachCarIndex + i + 1) %
        coachCars.length;

      assigned = true;

      break;

    }

  }

  if (!assigned) break;

}
   
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

let dutyTeam = "";

if (TEAM_A.includes(person.dutyName)) {
  dutyTeam = "箕谷A";
}

if (TEAM_B.includes(person.dutyName)) {
  dutyTeam = "箕谷B";
}

let dutyCar =
  activeDrivers.find(
    d =>
      d.priority === 2 &&
      d.team === dutyTeam &&
      d.returnPlayers.length < d.seats
  );

if (!dutyCar) {

  dutyCar =
    activeDrivers.find(
      d =>
        d.priority === 2 &&
        d.returnPlayers.length < d.seats
    );

}

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

const playerTeam =
  TEAM_A.includes(person.name)
    ? "箕谷A"
    : TEAM_B.includes(person.name)
      ? "箕谷B"
      : "";

let dutyCar =
  activeDrivers.find(
    d =>
      d.priority === 2 &&
      d.team === playerTeam &&
      d.returnPlayers.length < d.seats
  );

if (!dutyCar) {

  dutyCar =
    activeDrivers.find(
      d =>
        d.priority === 2 &&
        d.returnPlayers.length < d.seats
    );

}
    
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

if (dutyA && dutyA.canCarryEquipment === "○") {

  dutyA.equipment.push("A");

} else {

  const aCoaches =
    activeDrivers
      .filter(
        d =>
          d.priority === 1 &&
          d.team === "箕谷A"
      )
      .sort(
        (a, b) =>
          a.players.length - b.players.length
      );

  if (aCoaches.length) {
    aCoaches[0].equipment.push("A");
  }
    
}

// B
const dutyB =
  activeDrivers.find(
    d =>
      d.priority === 2 &&
      d.team === "箕谷B"
  );

if (dutyB && dutyB.canCarryEquipment === "○") {

  dutyB.equipment.push("B");

} else {

  const bCoaches =
    activeDrivers
      .filter(
        d =>
          d.priority === 1 &&
          d.team === "箕谷B"
      )
      .sort(
        (a, b) =>
          a.players.length - b.players.length
      );

  if (bCoaches.length) {
    bCoaches[0].equipment.push("B");
  }  

} 

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

/*
html += `

<hr>

<h3>
復路配車一覧
</h3>

`;
*/

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

const family =
  driver.priority === 3
    ? driver.name.replace("さん号", "")
    : driver.name.replace("コーチ号", "")
        .replace("号", "")
        .trim();
  
const note = [];

// 子ども
if (PARENT_CHILD[family]) {

  PARENT_CHILD[family].forEach(name => {
    note.push(`（${name}）`);
  });

}

// コーチ本人
if (
  driver.priority === 1 &&
  COACH_CHILD[driver.name]
) {

  COACH_CHILD[driver.name].forEach(name => {
    note.push(`（${name}）`);
  });

}
 
if (members.length === 0) {
  return;
}

/*
html += `

<div>
🚗 ${driver.name.endsWith("号") ? driver.name : driver.name + "号"}：
${members.join("／")}
</div>

`;
*/
  
});

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
font-size:14px;
font-weight:bold;
text-align:right;
white-space:nowrap;
"
>
定員：${driver.capacity}名 ／
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
  
html += `

<hr>

<h3>復路配車</h3>

<div>
⭐️復路希望あり（部員）⭐️<br>
　試合当番さんで部員の復路配車対応をお願いします。<br>
　試合当番さんのみで対応不可の場合は、配車担当のコーチへ相談してください。
</div>

<br>

<div>
⭐️復路希望あり（コーチ）⭐️<br>
　復路希望のコーチを往路配車したコーチで、復路配車の対応をお願いします。
</div>

`;

if (eventData.dispatchComment) {

  html += `

<hr>

<h3>コメント</h3>

<div
style="
padding:12px;
border:1px solid #ccc;
border-radius:8px;
white-space:pre-wrap;
display:flex;
align-items:flex-start;
justify-content:flex-start;
"
>${eventData.dispatchComment}</div>

`;

}
 
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

  // =========================
  // 確認ダイアログ追加（重要）
  // =========================
  if (!confirm("配車を確定しますか？")) {
    return;
  }
      
const dispatchData =
  JSON.parse(
    JSON.stringify(activeDrivers)
  );     
     
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
      .trim();

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
    dispatchConfirmed: true,
    dispatchData
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
      .trim();

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

// const imgData = canvas.toDataURL("image/png");
const imgData = canvas.toDataURL("image/jpeg", 0.7);

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
