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
function showCalendar() {
  loginPanel.hidden = true;
  calendarPanel.hidden = false;
  loadEvents();
}
$("loginForm").addEventListener("submit", e => {
  e.preventDefault();
  if ($("passwordInput").value === FAMILY_PASSWORD) {
    sessionStorage.setItem(AUTH_KEY, "1");
    $("loginError").textContent = "";
    showCalendar();
  } else {
    $("loginError").textContent = "パスワードが違います。もう一度入力してください。";
  }
});
$("logoutButton").addEventListener("click", () => {
  sessionStorage.removeItem(AUTH_KEY);
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
  const grid=$("calendarGrid"); grid.innerHTML="";
  for(let i=0;i<42;i++){
    const d=new Date(start); d.setDate(start.getDate()+i);
    const key=dateKey(d), dayEvents=events.filter(x=>x.date===key);
    const b=document.createElement("button");
    b.type="button"; b.className="day"+(d.getMonth()!==m?" outside":"")+(key===today?" today":"")+(key===selectedDate?" selected":"");
    b.innerHTML=`<span class="num">${d.getDate()}</span><span class="dots">${dayEvents.slice(0,4).map(()=>'<i class="dot"></i>').join("")}</span>`;
    b.addEventListener("click",()=>{selectedDate=key;renderCalendar();renderEvents();});
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
    const name=document.createElement("div"); name.className="event-name"; name.textContent=(ev.time?ev.time+" ":"")+ev.title;
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
    createdBy: $("eventId").value ? (events.find(x=>x.id===$("eventId").value)?.createdBy||member) : member,
    updatedBy:member, updatedAt:new Date().toISOString()
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

if(sessionStorage.getItem(AUTH_KEY)==="1") showCalendar();
else { loginPanel.hidden=false; calendarPanel.hidden=true; }
