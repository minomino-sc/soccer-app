// 戻るボタン
const backBtn = document.getElementById("backBtn");

// URL パラメータ取得
const params = new URLSearchParams(window.location.search);

// パラメータがあればボタンを表示
if (params.get("from") === "video") {
  backBtn.style.display = "inline-block";

  // 戻るボタンクリック時の挙動
  backBtn.addEventListener("click", () => {
    // GitHub Pages 上の動画共有システムのURLに戻す
    window.location.href = "https://minomino-sc.github.io/soccer-app/";
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

// 🔥 Firestoreリアルタイム同期
db.collection("calendar_events")
  //.orderBy("createdAt","asc")
  .onSnapshot(snapshot => {
    events = {};
    snapshot.forEach(doc => {
      const data = doc.data();
      const {date, team, type, text, location, time, driveUrls} = data; // ← location と time を追加

      if (!events[date]) events[date] = {};
      if (!events[date][team]) events[date][team] = [];

      // 既存の type/text に加えて location/time も格納
      events[date][team].push({
        type,
        text,
        location,
        time,
        driveUrls, // ←追加
        id: doc.id
      });
    });

    renderCalendar();
  });

function renderCalendar(){
  container.innerHTML="";
  for(let m=4;m<=12;m++) createMonth(m,year);
  for(let m=1;m<=3;m++) createMonth(m,year+1);
}

function createMonth(month,y){
  const monthDiv=document.createElement("div");
  const title=document.createElement("h2");
  title.textContent=`${y}年 ${month}月`;
  monthDiv.appendChild(title);

  const calendar=document.createElement("div");
  calendar.className="calendar";

  ["日","月","火","水","木","金","土"].forEach((d,i)=>{
    const h=document.createElement("div");
    h.textContent=d;
    h.className="weekday-header";
    if(i===0)h.classList.add("sunday");
    if(i===6)h.classList.add("saturday");
    calendar.appendChild(h);
  });

  const firstDay=new Date(y,month-1,1).getDay();
  const days=new Date(y,month,0).getDate();
  for(let i=0;i<firstDay;i++)calendar.appendChild(document.createElement("div"));

  for(let day=1;day<=days;day++){
    const dateStr=`${y}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const dateObj=new Date(dateStr);
    const dDiv=document.createElement("div");
    dDiv.className="day";

    if(dateObj.getDay()===0)dDiv.classList.add("sunday");
    if(dateObj.getDay()===6)dDiv.classList.add("saturday");
    if(holidays.includes(dateStr))dDiv.classList.add("holiday");

    dDiv.innerHTML=`<div>${day}</div>`;

    if(events[dateStr]){

Object.values(events[dateStr]).forEach(teamEvents=>{
  teamEvents.forEach(ev=>{
    const l=document.createElement("div");
    l.className="label";
    l.textContent = typeMap[ev.type].emoji;
    dDiv.appendChild(l);
  });
});
      
    }

    dDiv.addEventListener("click",e=>{
      e.stopPropagation();
      showPopup(dateStr);
    });

    calendar.appendChild(dDiv);
  }

  monthDiv.appendChild(calendar);
  container.appendChild(monthDiv);
}

document.addEventListener("click", (e) => {
  // popupの外 かつ dayセルでもない場合のみ閉じる
  if (!popup.contains(e.target) && !e.target.closest(".day")) {
    popup.style.display = "none";
  }
});

function toggleAdmin(){
  const p=document.getElementById("adminPanel");
  p.style.display=p.style.display==="none"?"block":"none";
}

async function addEvent(){
  const date = document.getElementById("adminDate").value;
  const team = document.getElementById("adminTeam").value;
  const type = document.getElementById("adminType").value;
  const text = document.getElementById("adminText").value;
  const location = document.getElementById("adminLocation").value;
  const time = document.getElementById("adminTime").value;
  const driveUrls = document.getElementById("adminFileUrl").value
  .split("\n")
  .map(v => v.trim())
  .filter(v => v !== "");

  if (!date || !text) {
    alert("日付と内容は必須です");
    return;
  }

await db.collection("calendar_events").add({
  date: date,
  team: team,
  type: type,
  text: text,
  location: location,
  time: time,
  driveUrls: driveUrls, // ←明示する
  createdAt: firebase.firestore.FieldValue.serverTimestamp()
});
  
// リセット（これが正解）
document.getElementById("adminDate").value = "";
document.getElementById("adminText").value = "";
document.getElementById("adminLocation").value = "";
document.getElementById("adminTime").value = "";
document.getElementById("adminFileUrl").value = "";
}

function showPopup(date){
  let html = "";
  if(events[date]){
    Object.keys(events[date]).forEach(team => {
      events[date][team].forEach((ev,i) => {

        // チームごとの背景色
        let bgColor = "#f0f0f0"; // デフォルト
        if(team === "A") bgColor = "#d6e4ff"; // 薄青
        if(team === "B") bgColor = "#d4f4dd"; // 薄緑
        if(team === "AB") bgColor = "#e8d6f0"; // 薄紫
        if(team === "Z") bgColor = "#ffe0e0"; // ← 追加

        html += `
        <div style="
          display:flex;
          justify-content:space-between;
          align-items:flex-start;
          padding:10px;
          border-radius:6px;
          margin-bottom:6px;
          background:${bgColor};   /* ← 背景色を付ける */
        ">
          <div style="flex:1; line-height:1.4; min-width:0;">
            <span style="color:#000; font-weight:bold;">
  ${team === "A" ? "チームA"
    : team === "B" ? "チームB"
    : team === "AB" ? "チームA/B"
    : team === "Z" ? "その他"
    : `チーム${team}`}
</span>      
            ${typeMap[ev.type].emoji} ${typeMap[ev.type].label}<br>
            <strong>内容:</strong> ${ev.text}<br>
            <strong>場所:</strong> ${ev.location || "未設定"}<br>
            <strong>時間:</strong> ${ev.time || "未設定"}<br>

${(ev.driveUrls || (ev.driveUrl ? [ev.driveUrl] : [])).map(url => `
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
`).join("")}
            
          </div>
          <div style="flex-shrink:0; display:flex; flex-direction:column; gap:4px; margin-left:8px;">
            <button style="
              width:28px; height:28px; border-radius:50%; border:none; background:#fff;
              box-shadow:0 1px 3px rgba(0,0,0,0.2); cursor:pointer;"
              onclick="editEvent(event,'${date}','${team}',${i})">✏️</button>
            <button style="
              width:28px; height:28px; border-radius:50%; border:none; background:#fff;
              box-shadow:0 1px 3px rgba(0,0,0,0.2); cursor:pointer;"
              onclick="deleteEvent(event,'${date}','${team}',${i})">🗑️</button>
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

async function editEvent(e, date, team, index){
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

<label>資料URL</label>
<textarea id="editDriveUrls">${(ev.driveUrls || []).join("\n")}</textarea>

      <div class="edit-buttons">
        <button class="save-btn" onclick="saveEdit('${ev.id}')">保存</button>
        <button class="cancel-btn" onclick="popup.style.display='none'">キャンセル</button>
      </div>
    </div>
  `;

  popup.style.display = "block";

  document.getElementById("editTeam").value = team;
  document.getElementById("editType").value = ev.type;
}

async function saveEdit(id){
  const newTeam = document.getElementById("editTeam").value;
  const newType = document.getElementById("editType").value;
  const newText = document.getElementById("editText").value;
  const newLocation = document.getElementById("editLocation").value;
  const newTime = document.getElementById("editTime").value;
  const newDriveUrls = document.getElementById("editDriveUrls").value
  .split("\n")
  .map(v => v.trim())
  .filter(v => v !== "");

  await db.collection("calendar_events").doc(id).update({
    team: newTeam,
    type: newType,
    text: newText,
    location: newLocation,
    time: newTime,
    driveUrls: newDriveUrls
  });

  popup.style.display = "none";
}

async function deleteEvent(e, date, team, index){
  e.stopPropagation();

  const ev = events[date][team][index];

  if(confirm("削除しますか？")){
    await db.collection("calendar_events").doc(ev.id).delete();

    // 🔥 削除後にポップアップを再描画
    showPopup(date);
  }
}
