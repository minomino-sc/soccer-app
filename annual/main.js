
// =========================
// 年間スケジュール
// 当日・未来：リアルタイム同期
// 過去：月単位で必要なときだけ読み込み
// =========================

// 戻るボタン
const backBtn = document.getElementById("backBtn");

const params = new URLSearchParams(window.location.search);

if (params.get("from") === "video") {
  backBtn.style.display = "inline-block";

  backBtn.addEventListener("click", () => {
    window.location.href =
      "https://minomino-sc.github.io/soccer-app/";
  });
}

const holidays = [
  "2026-04-29","2026-05-03","2026-05-04","2026-05-05",
  "2026-07-20","2026-08-11","2026-09-21","2026-09-22",
  "2026-09-23","2026-10-12","2026-11-03","2026-11-23",
  "2027-01-01","2027-01-11","2027-02-11","2027-02-23",
  "2027-03-21","2027-03-22","2026-05-06"
];

const year = 2026;
const container = document.getElementById("calendarContainer");
const popup = document.getElementById("eventPopup");

const typeMap = {
  practice:{emoji:"🟢",label:"練習"},
  official:{emoji:"🔵",label:"公式戦"},
  cup:{emoji:"🟡",label:"カップ戦"},
  friendly:{emoji:"🟣",label:"交流戦"},
  etc:{emoji:"🔴",label:"その他"}
};

let events = {};

// 当日・未来の予定
let futureEvents = {};

// 過去の月別読み込みデータ
const pastMonthCache = {};

// 現在選択中の過去の月
let selectedPastMonthKey = "";

// =========================
// 日付関連
// =========================

function getTodayString() {

  const now = new Date();

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");

}

function getMonthKey(y, m) {
  return `${y}-${String(m).padStart(2, "0")}`;
}

function getMonthStart(key) {
  return `${key}-01`;
}

function getMonthEnd(y, m) {

  const lastDay = new Date(y, m, 0).getDate();

  return `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

}

// =========================
// Firestoreデータを画面用データに変換
// =========================

function snapshotToEvents(snapshot) {

  const result = {};

  snapshot.forEach(doc => {

    const data = doc.data();

    const {
      date,
      team,
      type,
      text,
      location,
      time,
      driveUrls,
      practiceDuty
    } = data;

    if (!date || !team) return;

    if (!result[date]) result[date] = {};
    if (!result[date][team]) result[date][team] = [];

    result[date][team].push({
      type,
      text,
      location,
      time,
      driveUrls,
      practiceDuty,
      id: doc.id
    });

  });

  return result;

}

// =========================
// データを統合
// =========================

function rebuildEvents() {

  events = {};

  mergeEventData(futureEvents);

  if (
    selectedPastMonthKey &&
    pastMonthCache[selectedPastMonthKey]
  ) {
    mergeEventData(
      pastMonthCache[selectedPastMonthKey]
    );
  }

  renderCalendar();
  renderMonthList();

}

function mergeEventData(source) {

  Object.keys(source).forEach(date => {

    if (!events[date]) events[date] = {};

    Object.keys(source[date]).forEach(team => {

      if (!events[date][team]) {
        events[date][team] = [];
      }

      source[date][team].forEach(ev => {

        const exists = events[date][team]
          .some(item => item.id === ev.id);

        if (!exists) {
          events[date][team].push(ev);
        }

      });

    });

  });

}

// =========================
// 当日・未来の予定を監視
// =========================

db.collection("calendar_events")
  .where("date", ">=", getTodayString())
  .onSnapshot(snapshot => {

    futureEvents = snapshotToEvents(snapshot);

    rebuildEvents();

  }, error => {

    console.error("未来の予定の読み込みエラー:", error);

    alert("予定の読み込みに失敗しました。");

  });

// =========================
// 過去の月を選択するプルダウン
// =========================

function initializePastMonthSelect() {

  const select =
    document.getElementById("pastMonthSelect");

  if (!select) return;

  select.innerHTML = "";

  const now = new Date();

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const firstYear = 2026;
  const firstMonth = 4;

  for (
    let y = firstYear, m = firstMonth;
    y < currentYear ||
    (y === currentYear && m <= currentMonth);
  ) {

    const option = document.createElement("option");

    option.value = getMonthKey(y, m);
    option.textContent = `${y}年 ${m}月`;

    select.appendChild(option);

    m++;

    if (m > 12) {
      m = 1;
      y++;
    }

  }

  if (select.options.length > 0) {
    select.value = getMonthKey(currentYear, currentMonth);
  }

}

initializePastMonthSelect();

// =========================
// 選択した過去の月を読み込む
// =========================

async function loadSelectedPastMonth() {

  const select =
    document.getElementById("pastMonthSelect");

  const status =
    document.getElementById("pastMonthStatus");

  if (!select || !select.value) return;

  const key = select.value;

  const [y, m] = key.split("-").map(Number);

  const today = getTodayString();

  const startDate = getMonthStart(key);

  // 当月の場合は昨日まで
  let endDate = getMonthEnd(y, m);

  if (key === today.slice(0, 7)) {

    const yesterday = new Date();

    yesterday.setDate(yesterday.getDate() - 1);

    endDate = [
      yesterday.getFullYear(),
      String(yesterday.getMonth() + 1).padStart(2, "0"),
      String(yesterday.getDate()).padStart(2, "0")
    ].join("-");

  }

  if (endDate < startDate) {

    selectedPastMonthKey = key;

    pastMonthCache[key] = {};

    rebuildEvents();

    status.textContent =
      "この月には過去の予定はありません。";

    return;

  }

  selectedPastMonthKey = key;

  // すでに読み込んだ月は再利用
  if (pastMonthCache[key]) {

    rebuildEvents();

    status.textContent =
      `${y}年${m}月の予定を表示しています。`;

    return;

  }

  status.textContent = "予定を読み込んでいます...";

  try {

    const snapshot = await db
      .collection("calendar_events")
      .where("date", ">=", startDate)
      .where("date", "<=", endDate)
      .get();

    pastMonthCache[key] =
      snapshotToEvents(snapshot);

    rebuildEvents();

    status.textContent =
      `${y}年${m}月の予定を表示しています。`;

  } catch (error) {

    console.error("過去の予定の読み込みエラー:", error);

    status.textContent =
      "読み込みに失敗しました。もう一度お試しください。";

  }

}

// HTMLのボタンから呼び出すためにグローバル登録
window.loadSelectedPastMonth = loadSelectedPastMonth;

// =========================
// 過去の月のキャッシュを更新
// =========================

async function refreshPastMonth(date) {

  if (!date) return;

  const key = date.slice(0, 7);

  delete pastMonthCache[key];

  if (selectedPastMonthKey === key) {

    await loadSelectedPastMonth();

  }

}

// =========================
// カレンダー描画
// =========================

function renderCalendar() {

  container.innerHTML = "";

  for (let m = 4; m <= 12; m++) {
    createMonth(m, year);
  }

  for (let m = 1; m <= 3; m++) {
    createMonth(m, year + 1);
  }

  scrollToCurrentMonth();

}

// =========================
// 月別一覧
// =========================

function renderMonthList() {

  const listContainer =
    document.getElementById("monthListContainer");

  if (!listContainer) return;

  listContainer.innerHTML = "";

  const months = [];

  for (let m = 4; m <= 12; m++) {
    months.push({year:2026, month:m});
  }

  for (let m = 1; m <= 3; m++) {
    months.push({year:2027, month:m});
  }

  months.forEach(({year, month}) => {

    const monthEvents = Object.keys(events)
      .filter(date => {

        const [y, m] = date.split("-").map(Number);

        return y === year && m === month;

      })
      .sort();

    if (monthEvents.length === 0) return;

    const section = document.createElement("details");

    section.className = "list-month";
    section.id = `list-month-${year}-${month}`;

    const now = new Date();

    if (
      year > now.getFullYear() ||
      (year === now.getFullYear() &&
       month >= now.getMonth() + 1)
    ) {
      section.open = true;
    }

    const title = document.createElement("summary");

    title.className = "list-month-title";
    title.textContent = `${year}年 ${month}月`;

    section.appendChild(title);

    monthEvents.forEach(date => {

      const dateObj = new Date(date + "T00:00:00");

      const weekdays = [
        "日","月","火","水","木","金","土"
      ];

      const dateLabel =
        `${month}/${Number(date.slice(8,10))}（${weekdays[dateObj.getDay()]}）`;

      const row = document.createElement("div");
      row.className = "list-row";

      const dateCell = document.createElement("div");
      dateCell.className = "list-date";
      dateCell.textContent = dateLabel;

      const contentCell = document.createElement("div");
      contentCell.className = "list-content";

      Object.keys(events[date]).forEach(team => {

        events[date][team].forEach(ev => {

          const typeInfo =
            typeMap[ev.type] || {
              emoji:"🔴",
              label:"その他"
            };

          const teamLabel =
            team === "A" ? "A"
            : team === "B" ? "B"
            : team === "AB" ? "A/B"
            : "その他";

          const item = document.createElement("div");
          item.className = "list-event";

          const teamTag = document.createElement("span");
          teamTag.className = `list-team team-${team}`;
          teamTag.textContent = teamLabel;

          const eventText = document.createElement("span");
          eventText.className = "list-event-text";
          eventText.textContent =
            `${typeInfo.emoji} ${ev.text}`;

          item.appendChild(teamTag);
          item.appendChild(eventText);

          contentCell.appendChild(item);

        });

      });

      row.appendChild(dateCell);
      row.appendChild(contentCell);

      row.addEventListener("click", () => {
        showPopup(date);
      });

      section.appendChild(row);

    });

    listContainer.appendChild(section);

  });

}

// =========================
// 表示切替
// =========================

function switchView(view) {

  const calendar =
    document.getElementById("calendarContainer");

  const list =
    document.getElementById("monthListContainer");

  const calendarBtn =
    document.getElementById("calendarViewBtn");

  const listBtn =
    document.getElementById("listViewBtn");

  if (view === "calendar") {

    calendar.style.display = "block";
    list.style.display = "none";

    calendarBtn.classList.add("active");
    listBtn.classList.remove("active");

  } else {

    calendar.style.display = "none";
    list.style.display = "block";

    calendarBtn.classList.remove("active");
    listBtn.classList.add("active");

    const now = new Date();

    const target = document.getElementById(
      `list-month-${now.getFullYear()}-${now.getMonth() + 1}`
    );

    if (target) {
      target.scrollIntoView({
        behavior: "auto",
        block: "start"
      });
    }

  }

}

window.switchView = switchView;

// =========================
// カレンダーの月を作成
// =========================

function createMonth(month, y) {

  const monthDiv = document.createElement("div");

  monthDiv.id = `month-${y}-${month}`;

  const title = document.createElement("h2");

  title.textContent = `${y}年 ${month}月`;

  monthDiv.appendChild(title);

  const calendar = document.createElement("div");

  calendar.className = "calendar";

  ["日","月","火","水","木","金","土"].forEach((d, i) => {

    const h = document.createElement("div");

    h.textContent = d;
    h.className = "weekday-header";

    if (i === 0) h.classList.add("sunday");
    if (i === 6) h.classList.add("saturday");

    calendar.appendChild(h);

  });

  const firstDay = new Date(y, month - 1, 1).getDay();

  const days = new Date(y, month, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    calendar.appendChild(document.createElement("div"));
  }

  for (let day = 1; day <= days; day++) {

    const dateStr =
      `${y}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;

    const dateObj = new Date(y, month - 1, day);

    const dDiv = document.createElement("div");

    dDiv.className = "day";

    if (dateObj.getDay() === 0) dDiv.classList.add("sunday");
    if (dateObj.getDay() === 6) dDiv.classList.add("saturday");
    if (holidays.includes(dateStr)) dDiv.classList.add("holiday");

    dDiv.innerHTML = `<div>${day}</div>`;

    if (events[dateStr]) {

      Object.values(events[dateStr]).forEach(teamEvents => {

        teamEvents.forEach(ev => {

          const l = document.createElement("div");

          l.className = "label";

          l.textContent =
            typeMap[ev.type]
              ? typeMap[ev.type].emoji
              : "🔴";

          dDiv.appendChild(l);

        });

      });

    }

    dDiv.addEventListener("click", e => {

      e.stopPropagation();

      showPopup(dateStr);

    });

    calendar.appendChild(dDiv);

  }

  monthDiv.appendChild(calendar);

  container.appendChild(monthDiv);

}

// =========================
// ポップアップ外をクリックしたとき閉じる
// =========================

document.addEventListener("click", e => {

  if (
    !popup.contains(e.target) &&
    !e.target.closest(".day")
  ) {
    popup.style.display = "none";
  }

});

// =========================
// 管理者モード
// =========================

function toggleAdmin() {

  const p = document.getElementById("adminPanel");

  p.style.display =
    p.style.display === "none"
      ? "block"
      : "none";

}

window.toggleAdmin = toggleAdmin;

// =========================
// 予定追加
// =========================

async function addEvent() {

  const date =
    document.getElementById("adminDate").value;

  const team =
    document.getElementById("adminTeam").value;

  const type =
    document.getElementById("adminType").value;

  const text =
    document.getElementById("adminText").value;

  const location =
    document.getElementById("adminLocation").value;

  const time =
    document.getElementById("adminTime").value;

  const practiceDutyInput =
    document.getElementById("adminPracticeDuty");

  const practiceDuty =
    practiceDutyInput
      ? practiceDutyInput.value.trim()
      : "";

  const raw =
    document.getElementById("adminFileUrl").value || "";

  const driveUrls =
    raw.split("\n")
      .map(v => v.trim())
      .filter(v => v !== "");

  if (!date || !text) {

    alert("日付と内容は必須です");

    return;

  }

  await db.collection("calendar_events").add({

    date,
    team,
    type,
    text,
    location,
    time,

    practiceDuty:
      type === "practice"
        ? practiceDuty
        : "",

    driveUrls,

    createdAt:
      firebase.firestore.FieldValue.serverTimestamp()

  });

  document.getElementById("adminDate").value = "";
  document.getElementById("adminText").value = "";
  document.getElementById("adminLocation").value = "";
  document.getElementById("adminTime").value = "";
  document.getElementById("adminFileUrl").value = "";

  if (practiceDutyInput) {
    practiceDutyInput.value = "";
  }

  // 過去の日付に追加した場合は対象月を更新
  if (date < getTodayString()) {
    await refreshPastMonth(date);
  }

}

window.addEvent = addEvent;

// =========================
// 予定詳細ポップアップ
// =========================

function showPopup(date) {

  let html = "";

  if (events[date]) {

    Object.keys(events[date]).forEach(team => {

      events[date][team].forEach((ev, i) => {

        let bgColor = "#f0f0f0";

        if (team === "A") bgColor = "#d6e4ff";
        if (team === "B") bgColor = "#d4f4dd";
        if (team === "AB") bgColor = "#e8d6f0";
        if (team === "Z") bgColor = "#ffe0e0";

        const typeInfo =
          typeMap[ev.type] || {
            emoji:"🔴",
            label:"その他"
          };

        html += `
        <div style="
          display:flex;
          justify-content:space-between;
          align-items:flex-start;
          padding:10px;
          border-radius:6px;
          margin-bottom:6px;
          background:${bgColor};
        ">

          <div style="
            flex:1;
            line-height:1.4;
            min-width:0;
          ">

            <span style="color:#000;font-weight:bold;">
              ${
                team === "A" ? "チームA"
                : team === "B" ? "チームB"
                : team === "AB" ? "チームA/B"
                : team === "Z" ? "その他"
                : `チーム${team}`
              }
            </span>

            ${typeInfo.emoji}
            ${typeInfo.label}<br>

            <strong>内容:</strong>
            ${ev.text}<br>

            <strong>場所:</strong>
            ${ev.location || "未設定"}<br>

            <strong>時間:</strong>
            ${ev.time || "未設定"}<br>

            ${
              ev.type === "practice" && ev.practiceDuty
                ? `<strong>練習当番:</strong>${ev.practiceDuty}<br>`
                : ""
            }

            ${
              (
                ev.driveUrls ||
                (ev.driveUrl ? [ev.driveUrl] : [])
              )
              .map(url => `
                <a href="${url}" target="_blank"
                  style="
                    display:block;
                    margin-top:6px;
                    padding:4px 8px;
                    background:#2a8cff;
                    color:#fff;
                    border-radius:4px;
                    text-decoration:none;
                    font-size:12px;
                  ">
                  📄 資料を見る
                </a>
              `)
              .join("")
            }

          </div>

          <div style="
            flex-shrink:0;
            display:flex;
            flex-direction:column;
            gap:4px;
            margin-left:8px;
          ">

            <button style="
              width:28px;
              height:28px;
              border-radius:50%;
              border:none;
              background:#fff;
              box-shadow:0 1px 3px rgba(0,0,0,0.2);
              cursor:pointer;
            "
            onclick="editEvent(event,'${date}','${team}',${i})">
              ✏️
            </button>

            <button style="
              width:28px;
              height:28px;
              border-radius:50%;
              border:none;
              background:#fff;
              box-shadow:0 1px 3px rgba(0,0,0,0.2);
              cursor:pointer;
            "
            onclick="deleteEvent(event,'${date}','${team}',${i})">
              🗑️
            </button>

          </div>

        </div>`;

      });

    });

  } else {

    html = "<div>イベントはありません</div>";

  }

  popup.innerHTML = html;

  popup.style.display = "block";

  Object.assign(popup.style, {

    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    background: "#fff",
    borderRadius: "10px",
    padding: "16px",
    boxShadow: "0 5px 15px rgba(0,0,0,0.3)",
    maxWidth: "90%",
    width: "500px",
    maxHeight: "80%",
    overflowY: "auto",
    overflowX: "hidden",
    zIndex: "1000",
    wordBreak: "break-word"

  });

}

window.showPopup = showPopup;

// =========================
// 予定編集
// =========================

async function editEvent(e, date, team, index) {

  e.stopPropagation();

  const ev = events[date][team][index];

  popup.innerHTML = `

    <div class="edit-box">

      <h3>✏️ イベント編集</h3>

      <label>チーム</label>

      <select id="editTeam">
        <option value="A">チームA</option>
        <option value="B">チームB</option>
        <option value="AB">チームA/B</option>
        <option value="Z">その他</option>
      </select>

      <label>種別</label>

      <select id="editType">
        <option value="practice">練習</option>
        <option value="official">公式戦</option>
        <option value="cup">カップ戦</option>
        <option value="friendly">交流戦</option>
        <option value="etc">その他</option>
      </select>

      <label>内容</label>

      <input type="text" id="editText" value="${ev.text}">

      <label>場所</label>

      <input type="text" id="editLocation" value="${ev.location || ""}">

      <label>時間</label>

      <input type="text" id="editTime" value="${ev.time || ""}">

      ${
        ev.type === "practice"
          ? `
            <label>練習当番</label>
            <input
              type="text"
              id="editPracticeDuty"
              value="${ev.practiceDuty || ""}"
              placeholder="練習当番（例：松岡さん）"
            >
          `
          : ""
      }

      <label>資料URL</label>

      <textarea id="editDriveUrls">${(
        ev.driveUrls || []
      ).join("\n")}</textarea>

      <div class="edit-buttons">

        <button
          class="save-btn"
          onclick="saveEdit('${ev.id}','${date}')">
          保存
        </button>

        <button
          class="cancel-btn"
          onclick="popup.style.display='none'">
          キャンセル
        </button>

      </div>

    </div>
  `;

  popup.style.display = "block";

  document.getElementById("editTeam").value = team;

  document.getElementById("editType").value = ev.type;

}

window.editEvent = editEvent;

// =========================
// 編集保存
// =========================

async function saveEdit(id, originalDate) {

  const newTeam =
    document.getElementById("editTeam").value;

  const newType =
    document.getElementById("editType").value;

  const newText =
    document.getElementById("editText").value;

  const newLocation =
    document.getElementById("editLocation").value;

  const newTime =
    document.getElementById("editTime").value;

  let newPracticeDuty = "";

  const practiceDutyInput =
    document.getElementById("editPracticeDuty");

  if (practiceDutyInput) {
    newPracticeDuty = practiceDutyInput.value.trim();
  }

  const newDriveUrls =
    document.getElementById("editDriveUrls").value
      .split("\n")
      .map(v => v.trim())
      .filter(v => v !== "");

  await db.collection("calendar_events")
    .doc(id)
    .update({

      team: newTeam,
      type: newType,
      text: newText,
      location: newLocation,
      time: newTime,

      practiceDuty:
        newType === "practice"
          ? newPracticeDuty
          : "",

      driveUrls: newDriveUrls

    });

  popup.style.display = "none";

  if (originalDate < getTodayString()) {
    await refreshPastMonth(originalDate);
  }

}

window.saveEdit = saveEdit;

// =========================
// 予定削除
// =========================

async function deleteEvent(e, date, team, index) {

  e.stopPropagation();

  const ev = events[date][team][index];

  if (confirm("削除しますか？")) {

    await db.collection("calendar_events")
      .doc(ev.id)
      .delete();

    popup.style.display = "none";

    if (date < getTodayString()) {
      await refreshPastMonth(date);
    }

  }

}

window.deleteEvent = deleteEvent;

// =========================
// 現在の月までスクロール
// =========================

function scrollToCurrentMonth() {

  const now = new Date();

  const target = document.getElementById(
    `month-${now.getFullYear()}-${now.getMonth() + 1}`
  );

  if (target) {

    target.scrollIntoView({
      behavior: "auto",
      block: "start"
    });

  }

}

// =========================
// 凡例
// =========================

function toggleLegend() {

  const box = document.getElementById("legendBox");

  box.style.display =
    box.style.display === "none"
      ? "block"
      : "none";

}

window.toggleLegend = toggleLegend;
