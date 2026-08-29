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


// ============================================================
// 練習当番入力欄の表示・非表示
// ============================================================

function updatePracticeDutyVisibility(){

  const typeSelect =
    document.getElementById("adminType");

  const dutyInput =
    document.getElementById("adminPracticeDuty");

  if(!typeSelect || !dutyInput){
    return;
  }

  if(typeSelect.value === "practice"){

    dutyInput.style.display = "block";

  }else{

    dutyInput.style.display = "none";
    dutyInput.value = "";

  }

}


// ============================================================
// 種別変更時
// ============================================================

const adminType =
  document.getElementById("adminType");

if(adminType){

  adminType.addEventListener(
    "change",
    updatePracticeDutyVisibility
  );

  updatePracticeDutyVisibility();

}


// ============================================================
// Firestoreリアルタイム同期
// ============================================================

db.collection("calendar_events")
  //.orderBy("createdAt","asc")
  .onSnapshot(snapshot => {

    events = {};

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

      if(!events[date]){
        events[date] = {};
      }

      if(!events[date][team]){
        events[date][team] = [];
      }

      events[date][team].push({

        type,
        text,
        location,
        time,
        driveUrls,

        // ★ 練習当番
        practiceDuty: practiceDuty || "",

        id: doc.id

      });

    });

    renderCalendar();

  });


// ============================================================
// カレンダー表示
// ============================================================

function renderCalendar(){

  container.innerHTML="";

  for(let m=4;m<=12;m++){
    createMonth(m,year);
  }

  for(let m=1;m<=3;m++){
    createMonth(m,year+1);
  }

  scrollToCurrentMonth();

}


// ============================================================
// 月作成
// ============================================================

function createMonth(month,y){

  const monthDiv=document.createElement("div");

  monthDiv.id = `month-${y}-${month}`;

  const title=document.createElement("h2");

  title.textContent=`${y}年 ${month}月`;

  monthDiv.appendChild(title);

  const calendar=document.createElement("div");

  calendar.className="calendar";

  ["日","月","火","水","木","金","土"].forEach((d,i)=>{

    const h=document.createElement("div");

    h.textContent=d;

    h.className="weekday-header";

    if(i===0){
      h.classList.add("sunday");
    }

    if(i===6){
      h.classList.add("saturday");
    }

    calendar.appendChild(h);

  });

  const firstDay =
    new Date(y,month-1,1).getDay();

  const days =
    new Date(y,month,0).getDate();

  for(let i=0;i<firstDay;i++){
    calendar.appendChild(
      document.createElement("div")
    );
  }

  for(let day=1;day<=days;day++){

    const dateStr =
      `${y}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;

    const dateObj=new Date(dateStr);

    const dDiv=document.createElement("div");

    dDiv.className="day";

    if(dateObj.getDay()===0){
      dDiv.classList.add("sunday");
    }

    if(dateObj.getDay()===6){
      dDiv.classList.add("saturday");
    }

    if(holidays.includes(dateStr)){
      dDiv.classList.add("holiday");
    }

    dDiv.innerHTML=`<div>${day}</div>`;

    if(events[dateStr]){

      Object.values(events[dateStr]).forEach(teamEvents=>{

        teamEvents.forEach(ev=>{

          const l=document.createElement("div");

          l.className="label";

          l.textContent =
            typeMap[ev.type]
              ? typeMap[ev.type].emoji
              : "🔴";

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


// ============================================================
// ポップアップ外クリック
// ============================================================

document.addEventListener("click",(e)=>{

  if(
    !popup.contains(e.target) &&
    !e.target.closest(".day")
  ){

    popup.style.display="none";

  }

});


// ============================================================
// 管理者モード
// ============================================================

function toggleAdmin(){

  const p =
    document.getElementById("adminPanel");

  p.style.display =
    p.style.display==="none"
      ? "block"
      : "none";

}


// ============================================================
// 新規予定追加
// ============================================================

async function addEvent(){

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


  // ★ 練習当番
  const practiceDutyInput =
    document.getElementById("adminPracticeDuty");

  const practiceDuty =
    practiceDutyInput
      ? practiceDutyInput.value.trim()
      : "";


  const raw =
    document.getElementById("adminFileUrl").value || "";

  const driveUrls =
    raw
      .split("\n")
      .map(v=>v.trim())
      .filter(v=>v!=="");


  if(!date || !text){

    alert("日付と内容は必須です");

    return;

  }


  // ★ 練習の場合だけ保存
  const savedPracticeDuty =
    type === "practice"
      ? practiceDuty
      : "";


  await db.collection("calendar_events").add({

    date: date,

    team: team,

    type: type,

    text: text,

    location: location,

    time: time,

    driveUrls: driveUrls,

    // ★ 練習当番
    practiceDuty: savedPracticeDuty,

    createdAt:
      firebase.firestore.FieldValue.serverTimestamp()

  });


  // ==========================================================
  // 入力欄リセット
  // ==========================================================

  document.getElementById("adminDate").value="";

  document.getElementById("adminText").value="";

  document.getElementById("adminLocation").value="";

  document.getElementById("adminTime").value="";

  if(practiceDutyInput){
    practiceDutyInput.value="";
  }

  document.getElementById("adminFileUrl").value="";


  // 入力欄を再表示状態に戻す
  updatePracticeDutyVisibility();

}


// ============================================================
// 予定詳細
// ============================================================

function showPopup(date){

  let html="";

  if(events[date]){

    Object.keys(events[date]).forEach(team=>{

      events[date][team].forEach((ev,i)=>{

        // チームごとの背景色
        let bgColor="#f0f0f0";

        if(team==="A"){
          bgColor="#d6e4ff";
        }

        if(team==="B"){
          bgColor="#d4f4dd";
        }

        if(team==="AB"){
          bgColor="#e8d6f0";
        }

        if(team==="Z"){
          bgColor="#ffe0e0";
        }


        const typeInfo =
          typeMap[ev.type] || {
            emoji:"🔴",
            label:"その他"
          };


        // ★ 練習当番表示
        let practiceDutyHtml="";

        if(
          ev.type==="practice" &&
          ev.practiceDuty
        ){

          practiceDutyHtml = `
            <strong>🧑‍✈️ 練習当番:</strong>
            ${ev.practiceDuty}<br>
          `;

        }


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

            <span style="
              color:#000;
              font-weight:bold;
            ">

              ${
                team==="A"
                  ? "チームA"
                  : team==="B"
                  ? "チームB"
                  : team==="AB"
                  ? "チームA/B"
                  : team==="Z"
                  ? "その他"
                  : `チーム${team}`
              }

            </span>

            ${typeInfo.emoji}
            ${typeInfo.label}
            <br>

            <strong>内容:</strong>
            ${ev.text}
            <br>

            <strong>場所:</strong>
            ${ev.location || "未設定"}
            <br>

            <strong>時間:</strong>
            ${ev.time || "未設定"}
            <br>

            ${practiceDutyHtml}

            ${
              (
                ev.driveUrls ||
                (ev.driveUrl
                  ? [ev.driveUrl]
                  : [])
              )
              .map(url=>`

                <a href="${url}"
                  target="_blank"
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

            <button
              style="
                width:28px;
                height:28px;
                border-radius:50%;
                border:none;
                background:#fff;
                box-shadow:0 1px 3px rgba(0,0,0,0.2);
                cursor:pointer;
              "
              onclick="
                editEvent(
                  event,
                  '${date}',
                  '${team}',
                  ${i}
                )
              "
            >
              ✏️
            </button>


            <button
              style="
                width:28px;
                height:28px;
                border-radius:50%;
                border:none;
                background:#fff;
                box-shadow:0 1px 3px rgba(0,0,0,0.2);
                cursor:pointer;
              "
              onclick="
                deleteEvent(
                  event,
                  '${date}',
                  '${team}',
                  ${i}
                )
              "
            >
              🗑️
            </button>

          </div>

        </div>

        `;

      });

    });

  }else{

    html="<div>イベントはありません</div>";

  }


  popup.innerHTML=html;

  popup.style.display="block";


  Object.assign(popup.style,{

    position:"fixed",

    top:"50%",

    left:"50%",

    transform:"translate(-50%,-50%)",

    background:"#fff",

    borderRadius:"10px",

    padding:"16px",

    boxShadow:
      "0 5px 15px rgba(0,0,0,0.3)",

    maxWidth:"90%",

    width:"500px",

    maxHeight:"80%",

    overflowY:"auto",

    overflowX:"hidden",

    zIndex:"1000",

    wordBreak:"break-word"

  });

}


// ============================================================
// イベント編集
// ============================================================

async function editEvent(e,date,team,index){

  e.stopPropagation();

  const ev =
    events[date][team][index];


  popup.innerHTML=`

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

      <input
        type="text"
        id="editText"
        value="${ev.text || ""}"
      >


      <label>場所</label>

      <input
        type="text"
        id="editLocation"
        value="${ev.location || ""}"
      >


      <label>時間</label>

      <input
        type="text"
        id="editTime"
        value="${ev.time || ""}"
      >


      <!-- ★ 練習当番 -->

      <div id="editPracticeDutyBox">

        <label>🧑‍✈️ 練習当番</label>

        <input
          type="text"
          id="editPracticeDuty"
          placeholder="例：松岡さん"
          value="${ev.practiceDuty || ""}"
        >

      </div>


      <label>資料URL</label>

      <textarea id="editDriveUrls">${
        (ev.driveUrls || []).join("\n")
      }</textarea>


      <div class="edit-buttons">

        <button
          class="save-btn"
          onclick="saveEdit('${ev.id}')"
        >
          保存
        </button>

        <button
          class="cancel-btn"
          onclick="popup.style.display='none'"
        >
          キャンセル
        </button>

      </div>

    </div>

  `;


  popup.style.display="block";


  document.getElementById("editTeam").value =
    team;

  document.getElementById("editType").value =
    ev.type;


  // ★ 編集画面の当番表示
  updateEditPracticeDutyVisibility();


  // ★ 種別変更
  document
    .getElementById("editType")
    .addEventListener(
      "change",
      updateEditPracticeDutyVisibility
    );

}


// ============================================================
// 編集画面：練習当番表示・非表示
// ============================================================

function updateEditPracticeDutyVisibility(){

  const typeSelect =
    document.getElementById("editType");

  const dutyBox =
    document.getElementById("editPracticeDutyBox");

  const dutyInput =
    document.getElementById("editPracticeDuty");


  if(
    !typeSelect ||
    !dutyBox ||
    !dutyInput
  ){

    return;

  }


  if(typeSelect.value==="practice"){

    dutyBox.style.display="block";

  }else{

    dutyBox.style.display="none";

    dutyInput.value="";

  }

}


// ============================================================
// イベント編集保存
// ============================================================

async function saveEdit(id){

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


  const newDriveUrls =
    document
      .getElementById("editDriveUrls")
      .value
      .split("\n")
      .map(v=>v.trim())
      .filter(v=>v!=="");


  // ★ 練習当番
  const dutyInput =
    document.getElementById("editPracticeDuty");

  const newPracticeDuty =
    newType==="practice" &&
    dutyInput
      ? dutyInput.value.trim()
      : "";


  await db
    .collection("calendar_events")
    .doc(id)
    .update({

      team:newTeam,

      type:newType,

      text:newText,

      location:newLocation,

      time:newTime,

      driveUrls:newDriveUrls,

      // ★ 練習当番
      practiceDuty:newPracticeDuty

    });


  popup.style.display="none";

}


// ============================================================
// イベント削除
// ============================================================

async function deleteEvent(e,date,team,index){

  e.stopPropagation();

  const ev =
    events[date][team][index];


  if(confirm("削除しますか？")){

    await db
      .collection("calendar_events")
      .doc(ev.id)
      .delete();


    // 削除後にポップアップを再描画
    showPopup(date);

  }

}


// ============================================================
// 現在月へスクロール
// ============================================================

function scrollToCurrentMonth(){

  const now=new Date();

  const currentYear =
    now.getFullYear();

  const currentMonth =
    now.getMonth()+1;


  const target =
    document.getElementById(
      `month-${currentYear}-${currentMonth}`
    );


  if(target){

    target.scrollIntoView({

      behavior:"auto",

      block:"start"

    });

  }

}


// ============================================================
// 凡例
// ============================================================

function toggleLegend(){

  const box =
    document.getElementById("legendBox");

  box.style.display =
    box.style.display==="none"
      ? "block"
      : "none";

}
