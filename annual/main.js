// 祝日リスト
const holidays = [
  "2026-04-29","2026-05-03","2026-05-04","2026-05-05",
  "2026-07-20","2026-08-11","2026-09-21","2026-09-22",
  "2026-09-23","2026-10-12","2026-11-03","2026-11-23",
  "2027-01-01","2027-01-11","2027-02-11","2027-02-23",
  "2027-03-21","2027-03-22"
];

const year = 2026;
const container = document.getElementById("calendarContainer");
const popup = document.getElementById("eventPopup");

// typeMap：絵文字とラベル
const typeMap = {
  practice: { emoji: "🟢", label: "練習" },
  official: { emoji: "🔵", label: "公式戦" },
  cup: { emoji: "🟡", label: "カップ戦" },
  friendly: { emoji: "🟣", label: "交流戦" }
};

// events をチーム別に管理
let events = {
  "2026-04-05": { "A":[{type:"practice", text:"練習 9:00〜12:00"}], "B":[{type:"official", text:"公式戦 vs ○○FC"}] },
  "2026-05-03": { "A":[{type:"cup", text:"カップ戦 1回戦"}] }
};

function createMonth(month, y) {
  const monthDiv = document.createElement("div");
  monthDiv.className = "month";

  const title = document.createElement("h2");
  title.textContent = `${y}年 ${month}月`;
  monthDiv.appendChild(title);

  const calendar = document.createElement("div");
  calendar.className = "calendar";

  const weekDays = ["日","月","火","水","木","金","土"];
  weekDays.forEach((day,index)=>{
    const header = document.createElement("div");
    header.textContent = day;
    header.className = "weekday-header";
    if(index===0) header.classList.add("sunday");
    if(index===6) header.classList.add("saturday");
    calendar.appendChild(header);
  });

  const firstDay = new Date(y, month-1, 1).getDay();
  const daysInMonth = new Date(y, month, 0).getDate();
  for(let i=0;i<firstDay;i++) calendar.appendChild(document.createElement("div"));

  for(let day=1; day<=daysInMonth; day++){
    const date = new Date(y, month-1, day);
    const dayOfWeek = date.getDay();
    const dateStr = `${y}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;

    const dayDiv = document.createElement("div");
    dayDiv.className = "day";
    if(dayOfWeek===0) dayDiv.classList.add("sunday");
    if(dayOfWeek===6) dayDiv.classList.add("saturday");
    if(holidays.includes(dateStr)) dayDiv.classList.add("holiday");
    dayDiv.innerHTML = `<div>${day}</div>`;

    // チーム別に絵文字を表示
    if(events[dateStr]){
      Object.keys(events[dateStr]).forEach(team=>{
        events[dateStr][team].forEach(ev=>{
          const label = document.createElement("div");
          label.className = "label";
          label.textContent = typeMap[ev.type].emoji; // 絵文字のみ
          dayDiv.appendChild(label);
        });
      });

      // ポップアップ
      dayDiv.addEventListener("click", ()=>{
        showPopup(date);
      });
    }

    calendar.appendChild(dayDiv);
  }

  monthDiv.appendChild(calendar);
  container.appendChild(monthDiv);
}

// 4月〜12月 2026年
for(let m=4; m<=12; m++) createMonth(m, year);
// 1月〜3月 2027年
for(let m=1; m<=3; m++) createMonth(m, year+1);

document.addEventListener("click", ()=>{ popup.style.display="none"; });

function toggleAdmin(){
  const panel = document.getElementById("adminPanel");
  panel.style.display = panel.style.display==="none"?"block":"none";
}

// 管理者モードでチーム別に追加
function addEvent(){
  const date = document.getElementById("adminDate").value;
  const team = document.getElementById("adminTeam").value;
  const type = document.getElementById("adminType").value;
  const text = document.getElementById("adminText").value;

  if(!date){ alert("日付を選択してください"); return; }
  if(!text){ alert("内容を入力してください"); return; }

  if(!events[date]) events[date] = {};
  if(!events[date][team]) events[date][team] = [];
  events[date][team].push({type,text});

  renderDay(date);
  document.getElementById("adminDate").value = "";
  document.getElementById("adminText").value = "";
  alert("イベントを追加しました");
}

// 日付セル再描画
function renderDay(date){
  const dayNumber = new Date(date).getDate();
  document.querySelectorAll(".day").forEach(dayDiv=>{
    if(dayDiv.querySelector("div")?.textContent === String(dayNumber)){
      // 既存の絵文字を削除
      dayDiv.querySelectorAll(".label").forEach(l=>l.remove());
      if(events[date]){
        Object.keys(events[date]).forEach(team=>{
          events[date][team].forEach(ev=>{
            const label = document.createElement("div");
            label.className = "label";
            label.textContent = typeMap[ev.type].emoji;
            dayDiv.appendChild(label);
          });
        });
      }
    }
  });
}

// ポップアップ表示
function showPopup(date){
  let html = "";
  Object.keys(events[date]||{}).forEach(team=>{
    events[date][team].forEach((ev,index)=>{
      html += `<div>
        チーム${team} ${typeMap[ev.type].emoji} ${typeMap[ev.type].label} ${ev.text}
        <button onclick="editEvent('${date}','${team}',${index})">編集</button>
        <button onclick="deleteEvent('${date}','${team}',${index})">削除</button>
      </div>`;
    });
  });
  popup.innerHTML = html;
  popup.style.display = "block";
}

// 編集
function editEvent(date, team, index){
  const ev = events[date][team][index];
  const newText = prompt(`イベントを編集（${typeMap[ev.type].label}）`, ev.text);
  if(newText !== null){
    events[date][team][index].text = newText;
    renderDay(date);
    showPopup(date);
  }
}

// 削除
function deleteEvent(date, team, index){
  if(confirm("本当に削除しますか？")){
    events[date][team].splice(index,1);
    if(events[date][team].length===0) delete events[date][team];
    if(Object.keys(events[date]).length===0) delete events[date];
    renderDay(date);
    popup.style.display="none";
  }
}
