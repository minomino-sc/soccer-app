import { db } from "./firebase.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDocs,
  query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 家族カレンダー専用の簡易パスワード。変更するときはここを書き換えます。
const FAMILY_PASSWORD = "2no38ie";
const AUTH_KEY = "ninomiya_family_calendar_unlocked";
const COLLECTION = "family_calendar_events";

const $ = id => document.getElementById(id);
const loginPanel = $("loginPanel");
const calendarPanel = $("calendarPanel");
const dialog = $("eventDialog");
let currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedDate = dateKey(new Date());
let events = [];

function dateKey(d) {
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function nthWeekdayOfMonth(year, month, weekday, nth) {
  const first = new Date(year, month - 1, 1);
  return 1 + ((weekday - first.getDay() + 7) % 7) + (nth - 1) * 7;
}
function vernalEquinoxDay(year) {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}
function autumnalEquinoxDay(year) {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}
function japaneseHolidays(year) {
  const map = new Map();
  const add = (month, day, name) => {
    const key = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    map.set(key, name);
  };

  add(1,1,"元日");
  add(2,11,"建国記念の日");
  if (year >= 2020) add(2,23,"天皇誕生日");
  if (year >= 1989 && year <= 2018) add(12,23,"天皇誕生日");
  add(4,29,"昭和の日");
  add(5,3,"憲法記念日");
  add(5,4,"みどりの日");
  add(5,5,"こどもの日");
  add(8,11,"山の日");
  add(11,3,"文化の日");
  add(11,23,"勤労感謝の日");

  // ハッピーマンデー
  add(1,nthWeekdayOfMonth(year,1,1,2),"成人の日");
  add(7,nthWeekdayOfMonth(year,7,1,3),"海の日");
  add(9,nthWeekdayOfMonth(year,9,1,3),"敬老の日");
  add(10,nthWeekdayOfMonth(year,10,1,2),"スポーツの日");

  add(3,vernalEquinoxDay(year),"春分の日");
  add(9,autumnalEquinoxDay(year),"秋分の日");

  // 国民の休日（祝日に挟まれた平日）
  const base = [...map.keys()].sort();
  for (let i=0;i<base.length-1;i++) {
    const a = new Date(`${base[i]}T00:00:00`);
    const b = new Date(`${base[i+1]}T00:00:00`);
    const between = new Date(a); between.setDate(a.getDate()+2);
    if (b.getTime()-a.getTime()===2*86400000 &&
        between.getDay()!==0 && between.getDay()!==6) {
      map.set(dateKey(between),"国民の休日");
    }
  }

  // 振替休日（日曜と祝日が重なった場合、次の祝日でない日）
  const original = [...map.keys()].sort();
  for (const key of original) {
    const d = new Date(`${key}T00:00:00`);
    if (d.getDay() !== 0) continue;
    const substitute = new Date(d);
    do { substitute.setDate(substitute.getDate()+1); }
    while (map.has(dateKey(substitute)));
    map.set(dateKey(substitute),"振替休日");
  }
  return map;
}
function showCalendar() {
  loginPanel.hidden = true;
  calendarPanel.hidden = false;
  loadEvents();
}
$("loginForm").addEventListener("submit", e => {
  e.preventDefault();
  if ($("passwordInput").value === FAMILY_PASSWORD) {
    localStorage.setItem(AUTH_KEY, "1");
    $("loginError").textContent = "";
    showCalendar();
  } else {
    $("loginError").textContent = "パスワードが違います。もう一度入力してください。";
  }
});
$("logoutButton").addEventListener("click", () => {
  localStorage.removeItem(AUTH_KEY);
  calendarPanel.hidden = true;
  loginPanel.hidden = false;
  $("passwordInput").value = "";
});
$("prevMonth").addEventListener("click", () => { currentMonth.setMonth(currentMonth.getMonth()-1); renderCalendar(); });
$("nextMonth").addEventListener("click", () => { currentMonth.setMonth(currentMonth.getMonth()+1); renderCalendar(); });
$("addEventButton").addEventListener("click", () => openEventForm());
$("closeDialog").addEventListener("click", () => dialog.close());

async function loadEvents() {
  $("eventList").innerHTML = '<p class="muted">予定を読み込んでいます…</p>';
  try {
    const snap = await getDocs(query(collection(db,COLLECTION),orderBy("date")));
    events = snap.docs.map(d => ({id:d.id,...d.data()}));
    renderCalendar();
    renderEvents();
    $("statusMessage").textContent = "";
  } catch (err) {
    console.error(err);
    $("eventList").innerHTML = '<p class="error">予定を読み込めません。Firebase設定とFirestoreルールを確認してください。</p>';
    $("statusMessage").textContent = err.message;
  }
}


function renderCalendar() {
  const y=currentMonth.getFullYear(), m=currentMonth.getMonth();
  $("monthLabel").textContent = `${y}年 ${m+1}月`;
  const first=new Date(y,m,1), start=new Date(y,m,1-first.getDay());
  const today=dateKey(new Date());
  const grid=$("calendarGrid");
  grid.innerHTML="";

  const categoryClasses = {
    "家族": "family",
    "サッカー": "soccer",
    "学校": "school",
    "通院・整体": "medical",
    "食事・飲み会": "food",
    "旅行": "travel",
    "その他": "other"
  };

  for(let i=0;i<42;i++){
    const d=new Date(start);
    d.setDate(start.getDate()+i);

    const key=dateKey(d);
    const dayEvents=events.filter(x=>x.date===key);
    const holidayName=japaneseHolidays(d.getFullYear()).get(key);

    // 同じカテゴリーの予定は1つのドットにまとめる
    const categories = [...new Set(
      dayEvents.map(ev => ev.category || "家族")
    )];

    const dotsHTML = categories.map(category => {
      const colorClass = categoryClasses[category] || "other";
      return `<i class="dot dot-${colorClass}"></i>`;
    }).join("");

    const b=document.createElement("button");
    b.type="button";

    b.className="day"+
      (d.getMonth()!==m?" outside":"")+
      (key===today?" today":"")+
      (key===selectedDate?" selected":"")+
      (holidayName?" holiday":"")+
      (d.getDay()===0?" sunday":"")+
      (d.getDay()===6?" saturday":"");

    b.innerHTML=
      `<span class="num">${d.getDate()}</span>`+
      (holidayName?`<span class="holiday-name">${holidayName}</span>`:"")+
      `<span class="dots">${dotsHTML}</span>`;

    b.addEventListener("click",()=>{
      selectedDate=key;
      renderCalendar();
      renderEvents();
    });

    grid.appendChild(b);
  }
}


function renderEvents() {
  $("selectedDateLabel").textContent = `${selectedDate.replaceAll("-","/")} の予定`;
  const list=events.filter(x=>x.date===selectedDate).sort((a,b)=>(a.time||"").localeCompare(b.time||""));
  const root=$("eventList"); root.innerHTML="";
  if(!list.length){root.innerHTML='<p class="muted">この日の予定はありません。</p>';return;}
  list.forEach(ev=>{
    const card=document.createElement("article"); card.className="event-card";
    const top=document.createElement("div"); top.className="event-top";
    const name=document.createElement("div"); name.className="event-name";
    const timeText = ev.time
      ? ev.time + (ev.endTime ? "〜" + ev.endTime : "") + " "
      : (ev.endTime ? "終了 " + ev.endTime + " " : "");
    name.textContent=timeText+ev.title;
    const cat=document.createElement("span"); cat.className="category"; cat.textContent=ev.category||"家族";
    top.append(name,cat); card.append(top);
    const meta=document.createElement("div"); meta.className="event-meta";
    meta.textContent=[ev.place,ev.memo,`登録者：${ev.createdBy||"未設定"}`].filter(Boolean).join(" ／ ");
    card.append(meta);
    const actions=document.createElement("div"); actions.className="event-actions";
    const edit=document.createElement("button"); edit.textContent="編集"; edit.addEventListener("click",()=>openEventForm(ev));
    actions.append(edit); card.append(actions); root.append(card);
  });
}
function openEventForm(ev=null) {
  $("eventForm").reset();
  $("eventId").value=ev?.id||"";
  $("dialogTitle").textContent=ev?"予定を編集":"予定を追加";
  $("eventTitle").value=ev?.title||"";
  $("eventDate").value=ev?.date||selectedDate;
  $("memberSelect").value=ev?.updatedBy||ev?.createdBy||"";
  $("eventTime").value=ev?.time||"";
  $("eventEndTime").value=ev?.endTime||"";
  $("eventCategory").value=ev?.category||"家族";
  $("eventPlace").value=ev?.place||"";
  $("eventMemo").value=ev?.memo||"";
  $("deleteEventButton").hidden=!ev;
  $("eventError").textContent="";
  dialog.showModal();
}
$("eventForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const member=$("memberSelect").value;
  if(!member){$("eventError").textContent="先に利用者の名前を選択してください。";return;}
  const data={
    title:$("eventTitle").value.trim(), date:$("eventDate").value,
    time:$("eventTime").value, endTime:$("eventEndTime").value,
    category:$("eventCategory").value,
    place:$("eventPlace").value.trim(), memo:$("eventMemo").value.trim(),
    // 編集時も、フォームで選び直した登録者を現在の登録者として保存する
    createdBy:member,
    updatedBy:member,
    updatedAt:new Date().toISOString()
  };
  if(!data.title||!data.date)return;
  try{
    if($("eventId").value) await updateDoc(doc(db,COLLECTION,$("eventId").value),data);
    else await addDoc(collection(db,COLLECTION),{...data,createdAt:new Date().toISOString()});
    selectedDate=data.date; currentMonth=new Date(data.date+"T00:00:00"); dialog.close(); await loadEvents();
  }catch(err){console.error(err);$("eventError").textContent="保存できませんでした。Firebase設定・ルールを確認してください。";}
});
$("deleteEventButton").addEventListener("click",async()=>{
  const id=$("eventId").value;
  if(!id||!confirm("この予定を削除しますか？"))return;
  try{await deleteDoc(doc(db,COLLECTION,id));dialog.close();await loadEvents();}
  catch(err){console.error(err);$("eventError").textContent="削除できませんでした。";}
});

if(localStorage.getItem(AUTH_KEY)==="1") showCalendar();
else { loginPanel.hidden=false; calendarPanel.hidden=true; }
