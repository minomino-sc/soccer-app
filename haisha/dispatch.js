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

  let html = `

    <h2>
      ${eventData.title}
    </h2>

    <div>
      日付：${eventData.date}
    </div>

    <div>
      対象：${eventData.target}
    </div>

    <hr>

    <div>
      保護者回答：${parentSnap.size}
    </div>

    <div>
      コーチ回答：${coachSnap.size}
    </div>

    <div>
      試合当番回答：${dutySnap.size}
    </div>

    <hr>

    <h3>保護者回答</h3>

  `;

  parentSnap.forEach((docSnap) => {

    const a =
      docSnap.data();

    html += `
      <div>
        ${a.playerName ?? ""}
        ／送迎=${a.canDrive ?? ""}
        ／人数=${a.capacity ?? ""}
      </div>
    `;

  });

  html += `
    <hr>
    <h3>コーチ回答</h3>
  `;

  coachSnap.forEach((docSnap) => {

    const a =
      docSnap.data();

    html += `
      <div>
        ${a.name ?? ""}
        ／送迎=${a.canDrive ?? ""}
        ／人数=${a.capacity ?? ""}
      </div>
    `;

  });

  html += `
    <hr>
    <h3>試合当番回答</h3>
  `;

  dutySnap.forEach((docSnap) => {

    const a =
      docSnap.data();

    html += `
      <div>
        ${a.name ?? ""}
        ／送迎=${a.canDrive ?? ""}
        ／人数=${a.capacity ?? ""}
      </div>
    `;

  });

  document.getElementById(
    "dispatchArea"
  ).innerHTML = html;

}
