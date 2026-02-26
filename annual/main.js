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

const typeMap = {
  practice:{emoji:"🟢",label:"練習"},
  official:{emoji:"🔵",label:"公式戦"},
  cup:{emoji:"🟡",label:"カップ戦"},
  friendly:{emoji:"🟣",label:"交流戦"}
};

let events = {};

// 🔥 Firestoreリアルタイム同期
db.collection("calendar_events")
  .orderBy("createdAt","asc")
  .onSnapshot(snapshot=>{
    events = {};
    snapshot.forEach(doc=>{
      const data = doc.data();
      const {date,team,type,text} = data;

if(!events[date]) events[date] = {};

const teamArray = Array.isArray(team) ? team : [team];

teamArray.forEach(t=>{
  if(!events[date][t]) events[date][t] = [];
  events[date][t].push({type,text,id:doc.id});
});
      
  });

    renderCalendar();
  });   // ← ★ これが抜けてる！！

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
      Object.keys(events[dateStr]).forEach(team=>{
        events[dateStr][team].forEach(ev=>{
          const l=document.createElement("div");
          l.className="label";
          l.textContent=typeMap[ev.type].emoji;
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

document.addEventListener("click",()=>popup.style.display="none");

function toggleAdmin(){
  const p=document.getElementById("adminPanel");
  p.style.display=p.style.display==="none"?"block":"none";
}

async function addEvent(){
  const date=adminDate.value;
const teamSelect = document.getElementById("adminTeam");
const team = Array.from(teamSelect.selectedOptions).map(opt => opt.value);
  const type=adminType.value;
  const text=adminText.value;

  if(!date||!text)return alert("入力してください");

  await db.collection("calendar_events").add({
    date,team,type,text,
    createdAt:firebase.firestore.FieldValue.serverTimestamp()
  });

  adminDate.value="";
  adminText.value="";
}

function showPopup(date){
  let html="";
  if(events[date]){
    Object.keys(events[date]).forEach(team=>{
      events[date][team].forEach((ev,i)=>{
        html+=`
        <div>
          チーム${team} ${typeMap[ev.type].emoji} ${typeMap[ev.type].label} ${ev.text}
          <button onclick="editEvent('${date}','${team}',${i})">編集</button>
          <button onclick="deleteEvent('${date}','${team}',${i})">削除</button>
        </div>`;
      });
    });
  }else{
    html="イベントはありません";
  }
  popup.innerHTML=html;
  popup.style.display="block";
}

async function editEvent(date,team,index){
  const ev=events[date][team][index];
  const newText=prompt("編集",ev.text);
  if(newText!==null){
    await db.collection("calendar_events").doc(ev.id).update({text:newText});
  }
}

async function deleteEvent(date,team,index){
  const ev=events[date][team][index];
  if(confirm("削除しますか？")){
    await db.collection("calendar_events").doc(ev.id).delete();
  }
}
