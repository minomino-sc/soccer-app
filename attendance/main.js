import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, collection, getDocs,
  setDoc, doc, getDoc,
  query, orderBy, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* Firebase */
const firebaseConfig = {
  apiKey: "★★★★★",
  authDomain: "★★★★★",
  projectId: "minotani-sc-app",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* DOM */
const table = document.getElementById("table");
const stats = document.getElementById("stats");
const monthLabel = document.getElementById("monthLabel");

/* 状態 */
let current = new Date(); // 今日を基準に初期化
let latest = {};

/* 月切替 */
document.getElementById("prevMonth").onclick = () => {
  current.setDate(1); // 日を1日にリセット
  current.setMonth(current.getMonth() - 1);
  render();
};
document.getElementById("nextMonth").onclick = () => {
  current.setDate(1); // 日を1日にリセット
  current.setMonth(current.getMonth() + 1);
  render();
};

render();

/* date → Date */
function toDate(v){
  if(!v) return null;
  if(typeof v === "string"){
    const [y,m,d]=v.split("-").map(Number);
    return new Date(y,m-1,d);
  }
  if(v instanceof Timestamp) return v.toDate();
  return null;
}

async function render(){
  table.innerHTML="";
  stats.innerHTML="";

  const monthId = `${current.getFullYear()}-${String(current.getMonth()+1).padStart(2,'0')}`;
  monthLabel.textContent =
    `${current.getFullYear()}年 ${current.getMonth()+1}月`;

  // players
  const playersSnap = await getDocs(collection(db,"players_attendance"));
  const players = playersSnap.docs
    .map(d=>({id:d.id,...d.data()}))
    .sort((a,b)=>(a.number??999)-(b.number??999));

  // events
  const eventsSnap = await getDocs(
    query(collection(db,"events_attendance"),orderBy("date"))
  );
  const events = eventsSnap.docs
    .map(d=>({id:d.id,...d.data(),_date:toDate(d.data().date)}))
    .filter(e =>
      e._date &&
      e._date.getFullYear()===current.getFullYear() &&
      e._date.getMonth()===current.getMonth()
    );

  // attendance_summary
  const summaryRef = doc(db,"attendance_summary",monthId);
  const summarySnap = await getDoc(summaryRef);
  latest = summarySnap.exists() ? summarySnap.data() : {};

  /* ヘッダ */
  const trH=document.createElement("tr");
  trH.innerHTML =
    "<th>背</th><th>名前</th>" +
    events.map(e=>{
      return `<th class="${e.type}">
        ${e._date.getDate()}<br>${e.type==="match"?"試合":"練習"}
      </th>`;
    }).join("");
  table.appendChild(trH);

  /* 本体 */
  players.forEach(p=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${p.number??""}</td><td class="name">${p.name}</td>`;

    events.forEach(e=>{
      const key=`${e.id}_${p.id}`;
      const status=latest[key]||"skip";
      const td=document.createElement("td");
      td.classList.add(e.type);
      td.textContent =
        status==="present"?"○":
        status==="absent"?"×":"－";

      td.onclick=async()=>{
        const next =
          status==="skip"?"present":
          status==="present"?"absent":"skip";

        // attendance_summary に反映
        await setDoc(summaryRef,{
          [`${key}`]: next
        },{merge:true});

        render(); // クリック後に即時更新
      };
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });

  /* 出席率（％＋回数表示） */
  players.forEach(p=>{
    let prHit=0,prTot=0,maHit=0,maTot=0;

    events.forEach(e=>{
      const s=latest[`${e.id}_${p.id}`];
      if(!s||s==="skip") return;
      if(e.type==="practice"){
        prTot++; if(s==="present") prHit++;
      }
      if(e.type==="match"){
        maTot++; if(s==="present") maHit++;
      }
    });

    const tot=prTot+maTot;
    const hit=prHit+maHit;

    stats.innerHTML+=`
      <div class="statsCard">
        <strong>${p.name}</strong><br>
        練習：${prTot?Math.round(prHit/prTot*100):0}%（${prHit}回）<br>
        試合：${maTot?Math.round(maHit/maTot*100):0}%（${maHit}回）<br>
        合計：${tot?Math.round(hit/tot*100):0}%（${hit}回）
      </div>
    `;
  });
}
