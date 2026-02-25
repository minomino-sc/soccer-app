// =============================
// 祝日リスト
// =============================
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

// typeMapを絵文字と文字ラベルで分離
const typeMap = {
  practice: { emoji: "🟢", label: "練習" },
  official: { emoji: "🔵", label: "公式戦" },
  cup: { emoji: "🟡", label: "カップ戦" },
  friendly: { emoji: "🟣", label: "交流戦" }
};

// イベント例（複数対応）
let events = {
  "2026-04-05":[
    {type:"practice", text:"練習 9:00〜12:00"},
    {type:"official", text:"公式戦 vs ○○FC"}
  ],
  "2026-05-03":[
    {type:"cup", text:"カップ戦 1回戦"}
  ]
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

    // 日付セルに絵文字のみ表示
    if(events[dateStr]){
      events[dateStr].forEach(ev=>{
        const label = document.createElement("div");
        label.className = "label";
        label.textContent = typeMap[ev.type].emoji; // 絵文字のみ
        dayDiv.appendChild(label);
      });

      // ポップアップ表示
      dayDiv.addEventListener("click", (e)=>{
        e.stopPropagation();
        const eventsHtml = events[dateStr]
          .map(ev => `<div>${typeMap[ev.type].emoji} ${typeMap[ev.type].label} ${ev.text}</div>`)
          .join("");
        popup.innerHTML = eventsHtml;
        popup.style.display = "block";
        popup.style.top = (e.pageY + 10) + "px";
        popup.style.left = (e.pageX + 10) + "px";
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

// ポップアップを画面クリックで閉じる
document.addEventListener("click", ()=>{
  popup.style.display = "none";
});

function toggleAdmin(){
  const panel = document.getElementById("adminPanel");
  panel.style.display = panel.style.display==="none"?"block":"none";
}

function addEvent(){
  const date = document.getElementById("adminDate").value;
  const type = document.getElementById("adminType").value;
  const text = document.getElementById("adminText").value;
  if(!events[date]) events[date]=[];
  events[date].push({type,text});
  location.reload();
}
