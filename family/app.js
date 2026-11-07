
import { db } from "./firebase.js";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDocs,
  query, orderBy, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 現在設定しているパスワードを、この行にそのまま残してください。
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

const TIMING_IDS = {
  dayBefore: "notifyTimingDayBefore",
  morning: "notifyTimingMorning",
  twoHours: "notifyTimingTwoHours"
};

const MEMBER_IDS = {
  "父": "notifyMemberFather",
  "母": "notifyMemberMother",
  "息子": "notifyMemberSon"
};

const ALL_MEMBERS = ["父", "母", "息子"];

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

  add(1,nthWeekdayOfMonth(year,1,1,2),"成人の日");
  add(7,nthWeekdayOfMonth(year,7,1,3),"海の日");
  add(9,nthWeekdayOfMonth(year,9,1,3),"敬老の日");
  add(10,nthWeekdayOfMonth(year,10,1,2),"スポーツの日");

  add(3,vernalEquinoxDay(year),"春分の日");
  add(9,autumnalEquinoxDay(year),"秋分の日");

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
  if (!confirm("ログアウトしますか？")) return;
  localStorage.removeItem(AUTH_KEY);
  calendarPanel.hidden = true;
  loginPanel.hidden = false;
  $("passwordInput").value = "";
  document.querySelector(".settings-menu").open = false;
});

// =========================================================
// Web Push 通知登録
// =========================================================

const VAPID_PUBLIC_KEY =
  "BAS6fTexJ54TUfONNslPJZkPADvkUTcME9Tw3vxhJEgyCmUBjOveS-OQZkJNy9cs3PLZbAgcxGjh0vBAEOK3gLc";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

async function enableNotifications() {
  const button = $("notificationButton");

  try {
    if (!("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)) {
      alert("この端末・ブラウザはWeb Push通知に対応していません。");
      return;
    }

    const member = prompt(
      "この端末を使用する人の名前を入力してください。\n「父」「母」「息子」のいずれかを入力してください。"
    );

    if (!member || !member.trim()) return;

    const memberName = member.trim();
    if (!ALL_MEMBERS.includes(memberName) &&
        memberName !== "一颯") {
      alert("名前は「父」「母」「息子」のいずれかで登録してください。");
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      alert("通知が許可されていません。端末の設定を確認してください。");
      return;
    }

    const registration = await navigator.serviceWorker.register("./service-worker.js");
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    const endpoint = subscription.endpoint;
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(endpoint)
    );
    const subscriptionId = Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    await setDoc(doc(db, "family_push_subscriptions", subscriptionId), {
      member: memberName === "一颯" ? "息子" : memberName,
      subscription: subscription.toJSON(),
      updatedAt: new Date().toISOString()
    });

    button.textContent = "🔔 通知は有効です";
    alert(memberName + "の端末を通知登録しました。");

  } catch (error) {
    console.error("通知登録エラー:", error);
    alert("通知登録に失敗しました。\n" + error.message);
  }
}

$("notificationButton").addEventListener("click", enableNotifications);

// 家族メンバー表示
const familyMembersDialog = $("familyMembersDialog");

$("familyMembersButton").addEventListener("click", () => {
  document.querySelector(".settings-menu").open = false;
  familyMembersDialog.showModal();
});

$("closeFamilyMembers").addEventListener("click", () => {
  familyMembersDialog.close();
});

$("prevMonth").addEventListener("click", () => {
  currentMonth.setMonth(currentMonth.getMonth()-1);
  renderCalendar();
});
$("nextMonth").addEventListener("click", () => {
  currentMonth.setMonth(currentMonth.getMonth()+1);
  renderCalendar();
});

$("todayButton").addEventListener("click", () => {
  const today = new Date();
  currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  selectedDate = dateKey(today);
  renderCalendar();
  renderEvents();
});

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
  const first = new Date(y, m, 1);
  const start = new Date(y, m, 1 - first.getDay());
  const totalDays = Math.ceil(
    (first.getDay() + new Date(y, m + 1, 0).getDate()) / 7
  ) * 7;
  const today = dateKey(new Date());
  const grid = $("calendarGrid");
  grid.innerHTML = "";

  const categoryClasses = {
    "家族": "family", "サッカー": "soccer", "学校": "school",
    "通院・整体": "medical", "食事・飲み会": "food",
    "旅行": "travel", "その他": "other"
  };

  for (let i = 0; i < totalDays; i++) {
    const d=new Date(start);
    d.setDate(start.getDate()+i);
    const key=dateKey(d);
    const dayEvents=events.filter(x=>x.date===key);
    const holidayName=japaneseHolidays(d.getFullYear()).get(key);

    const categories = [...new Set(dayEvents.map(ev => ev.category || "家族"))];
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
  $("selectedDateLabel").textContent =
    `${selectedDate.replaceAll("-", "/")} の予定`;

  const list = events
    .filter(x => x.date === selectedDate)
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  const root = $("eventList");
  root.innerHTML = "";

  if (!list.length) {
    root.innerHTML = '<p class="muted">この日の予定はありません。</p>';
    return;
  }

  const categoryClasses = {
    "家族": "family", "サッカー": "soccer", "学校": "school",
    "通院・整体": "medical", "食事・飲み会": "food",
    "旅行": "travel", "その他": "other"
  };

  list.forEach(ev => {
    const category = ev.category || "家族";
    const colorClass = categoryClasses[category] || "other";
    const card = document.createElement("article");
    card.className = `event-card event-${colorClass}`;

    const top = document.createElement("div");
    top.className = "event-top";
    const name = document.createElement("div");
    name.className = "event-name";
    name.textContent = ev.title;
    const cat = document.createElement("span");
    cat.className = `category cat-${colorClass}`;
    cat.textContent = category;
    top.append(name, cat);
    card.append(top);

    const meta = document.createElement("div");
    meta.className = "event-meta-details";

    const addDetail = (label, value, extraClass = "") => {
      if (!value) return;
      const row = document.createElement("div");
      row.className = `event-detail ${extraClass}`;
      const heading = document.createElement("span");
      heading.className = "event-detail-label";
      heading.textContent = label;
      const content = document.createElement("span");
      content.className = "event-detail-value";
      content.textContent = value;
      row.append(heading, content);
      meta.append(row);
    };

    const timeText = ev.time
      ? ev.time + (ev.endTime ? " ～ " + ev.endTime : "")
      : (ev.endTime ? "終了 " + ev.endTime : "");

    addDetail("時間", timeText, "event-time-detail");
    addDetail("場所", ev.place);
    addDetail("メモ", ev.memo);
    addDetail("登録者", ev.createdBy || "未設定");

    if (meta.children.length) card.append(meta);

    const actions = document.createElement("div");
    actions.className = "event-actions";
    const edit = document.createElement("button");
    edit.textContent = "編集";
    edit.addEventListener("click", () => openEventForm(ev));
    actions.append(edit);
    card.append(actions);
    root.append(card);
  });
}

function getEventTimings(ev) {
  if (Array.isArray(ev?.notifyTimings)) return ev.notifyTimings;
  if (ev?.notifyTiming && ev.notifyTiming !== "none") return [ev.notifyTiming];
  return [];
}

function getEventMembers(ev) {
  if (!Array.isArray(ev?.notifyMembers)) return [];
  return ev.notifyMembers;
}

function setChecks(map, values) {
  for (const [value, id] of Object.entries(map)) {
    $(id).checked = values.includes(value);
  }
}

function getCheckedValues(map) {
  return Object.entries(map)
    .filter(([, id]) => $(id).checked)
    .map(([value]) => value);
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

  setChecks(TIMING_IDS, ev ? getEventTimings(ev) : []);
  setChecks(MEMBER_IDS, ev ? getEventMembers(ev) : []);

  $("deleteEventButton").hidden=!ev;
  $("eventError").textContent="";
  dialog.showModal();
}

$("eventForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const member=$("memberSelect").value;
  if(!member){
    $("eventError").textContent="先に利用者の名前を選択してください。";
    return;
  }

  const notifyTimings = getCheckedValues(TIMING_IDS);
  const notifyMembers = getCheckedValues(MEMBER_IDS);

  const data={
    title:$("eventTitle").value.trim(),
    date:$("eventDate").value,
    time:$("eventTime").value,
    endTime:$("eventEndTime").value,
    category:$("eventCategory").value,
    place:$("eventPlace").value.trim(),
    memo:$("eventMemo").value.trim(),
    notifyTimings,
    notifyMembers,
    createdBy:member,
    updatedBy:member,
    updatedAt:new Date().toISOString()
  };

  if(!data.title||!data.date)return;

  try{
    if($("eventId").value) {
      await updateDoc(doc(db,COLLECTION,$("eventId").value),data);
    } else {
      await addDoc(collection(db,COLLECTION),{
        ...data,
        createdAt:new Date().toISOString()
      });
    }
    selectedDate=data.date;
    currentMonth=new Date(data.date+"T00:00:00");
    dialog.close();
    await loadEvents();
  }catch(err){
    console.error(err);
    $("eventError").textContent="保存できませんでした。Firebase設定・ルールを確認してください。";
  }
});

$("deleteEventButton").addEventListener("click",async()=>{
  const id=$("eventId").value;
  if(!id||!confirm("この予定を削除しますか？"))return;
  try{
    await deleteDoc(doc(db,COLLECTION,id));
    dialog.close();
    await loadEvents();
  }catch(err){
    console.error(err);
    $("eventError").textContent="削除できませんでした。";
  }
});

if(localStorage.getItem(AUTH_KEY)==="1") showCalendar();
else {
  loginPanel.hidden=false;
  calendarPanel.hidden=true;
}
