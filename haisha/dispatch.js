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
        collection(
          db,
          "parent_answers"
        ),
        where(
          "eventId",
          "==",
          id
        )
      )
    );

  // =========================
  // コーチ回答
  // =========================
  const coachSnap =
    await getDocs(
      query(
        collection(
          db,
          "coach_answers"
        ),
        where(
          "eventId",
          "==",
          id
        )
      )
    );

  // =========================
  // 試合当番回答
  // =========================
  const dutySnap =
    await getDocs(
      query(
        collection(
          db,
          "duty_answers"
        ),
        where(
          "eventId",
          "==",
          id
        )
      )
    );

dutySnap.forEach((docSnap) => {

  alert(
    "DUTY\n\n" +
    JSON.stringify(
      docSnap.data(),
      null,
      2
    )
  );

});

coachSnap.forEach((docSnap) => {

  alert(
    "COACH\n\n" +
    JSON.stringify(
      docSnap.data(),
      null,
      2
    )
  );

});

  
parentSnap.forEach((docSnap) => {

  alert(
    "PARENT\n\n" +
    JSON.stringify(
      docSnap.data(),
      null,
      2
    )
  );

});
  
  // =========================
  // 配車対象人数
  // 参加 ＋ 集合場所集合
  // =========================
  let needCount = 0;

  parentSnap.forEach((docSnap) => {

    const a =
      docSnap.data();

    if (
      a.attendance === "参加" &&
      a.meetingType === "pickup"
    ) {

      needCount++;

    }

  });

  // =========================
  // 利用可能座席
  // capacityは運転手含む
  // =========================
  let seatCount = 0;

  dutySnap.forEach((docSnap) => {

    const a =
      docSnap.data();

    if (
      a.canDrive === "○" ||
      a.canDrive === "◯"
    ) {

      seatCount +=
        Math.max(
          Number(
            a.capacity || 0
          ) - 1,
          0
        );

    }

  });

  coachSnap.forEach((docSnap) => {

    const a =
      docSnap.data();

    if (
      a.canDrive === "○" ||
      a.canDrive === "◯"
    ) {

      seatCount +=
        Math.max(
          Number(
            a.capacity || 0
          ) - 1,
          0
        );

    }

  });

  const shortage =
    Math.max(
      needCount -
      seatCount,
      0
    );

  // =========================
  // 画面表示
  // =========================
  let html = `

    <h2>
      ${eventData.title}
    </h2>

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

  if (
    shortage > 0
  ) {

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

    <div>
      保護者回答：
      ${parentSnap.size}
    </div>

    <div>
      コーチ回答：
      ${coachSnap.size}
    </div>

    <div>
      試合当番回答：
      ${dutySnap.size}
    </div>

  `;

  document.getElementById(
    "dispatchArea"
  ).innerHTML =
    html;

}
