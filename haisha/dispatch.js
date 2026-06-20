import { db } from "./firebase.js";

// ★ここに追加（グローバル変数）
let latestPdfUrl = "";

import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

import { storage } from "./firebase.js";

const params =
  new URLSearchParams(
    window.location.search
  );

const id =
  params.get("id");

// ★★★ デバッグ表示（ここに追加）★★★
function debug(msg) {
  const el = document.getElementById("dispatchArea");
  if (el) {
    el.innerHTML += `<div style="color:yellow;font-size:12px;">${msg}</div>`;
  }
}

debug("① スクリプト開始");

debug("② URL = " + window.location.href);
debug("③ id = " + id);
// ★★★ デバッグ表示（ここに追加）★★★


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

drivers.forEach(driver => {

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
drivers.forEach(driver => {
  driver.players = [];
});

let playerIndex = 0;

while (
  playerIndex < targetPlayers.length
) {

  let assigned = false;

  drivers.forEach(driver => {

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
drivers.forEach(driver => {

  if (!driver.players) {
    driver.players = [];
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

    const original =
      document.getElementById("dispatchArea");

    const pdfArea =
      document.getElementById("pdfArea");

    pdfArea.innerHTML = original.innerHTML;
    pdfArea.style.display = "block";

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

    pdf.addImage(imgData, "PNG", 0, position, pdfWidth, pdfHeight);

    heightLeft -= 297;

    while (heightLeft > 0) {
      position = heightLeft - pdfHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, pdfWidth, pdfHeight);
      heightLeft -= 297;
    }

    // =========================
    // 🔥 Firebase Storageアップロード（ここが正しい位置）
    // =========================
    const fileName =
      `car_dispatch_${id}_${Date.now()}.pdf`;

    const pdfBlob =
      pdf.output("blob");

    const storageRef =
      ref(storage, `dispatch_pdf/${fileName}`);

    await uploadBytes(storageRef, pdfBlob);

    latestPdfUrl =
      await getDownloadURL(storageRef);

// ★追加
document.getElementById("lineBtn").disabled = false;

    pdf.save(
      `配車表_${new Date().toISOString().slice(0,10)}.pdf`
    );

  });

document
  .getElementById("lineBtn")
  .addEventListener("click", () => {

    if (!latestPdfUrl) {
      alert("先にPDFを作成してください");
      return;
    }

    const text =
      `🚗 配車表はこちら\n${latestPdfUrl}`;

    const url =
      `https://line.me/R/msg/text/?${encodeURIComponent(text)}`;

    window.open(url, "_blank");

  });
