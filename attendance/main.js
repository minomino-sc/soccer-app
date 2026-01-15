/***********************
 * Firebase 初期化（Compat）
 ***********************/
firebase.initializeApp({
  apiKey: "AIzaSyA-u--fB_d8W6zRTJYj4PLyHc61pNQpKjQ",
  authDomain: "dog-family-videos.firebaseapp.com",
  projectId: "dog-family-videos"
});
const db = firebase.firestore();

/***********************
 * 定数・ユーティリティ
 ***********************/
const STATUS_ORDER = ["skip", "present", "absent", "special", "school"];
const STATUS_SYMBOL = {
  skip: "－",
  present: "○",
  absent: "×",
  special: "※",   // トレセン
  school: "◻︎"     // 学校行事
};

function symbol(s){
  return STATUS_SYMBOL[s] || "－";
}

// ★ 過去日判定（追加機能・ここだけ）
function isPastDate(dateStr){
  if (!dateStr) return false;
  const today = new Date();
  today.setHours(0,0,0,0);
  const target = new Date(dateStr);
  if (isNaN(target)) return false;
  target.setHours(0,0,0,0);
  return target < today;
}

/***********************
 * グローバル
 ***********************/
let rendering = false;
let logsCache = {};
let monthId = "";

/***********************
 * 出欠テーブル描画
 ***********************/
async function renderAttendance(players, events){
  const table = document.getElementById("table");
  table.innerHTML = "";

  /* ヘッダー */
  const trH = document.createElement("tr");
  trH.innerHTML =
    "<th class='no'>背</th><th class='name'>名前</th>" +
    events.map(e => `<th>${e.date}</th>`).join("");
  table.appendChild(trH);

  /* 本体 */
  for(const p of players){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td class="no">${p.number || ""}</td><td class="name">${p.name}</td>`;

    for(const e of events){
      const td = document.createElement("td");
      const key = `${p.id}_${e.id}`;
      const cur = logsCache[key]?.status || "skip";
      td.textContent = symbol(cur);

      td.onclick = async () => {
        if (rendering) return;

        // ★ 過去日の注意喚起（唯一の追加点）
        if (isPastDate(e.date)) {
          const ok = confirm(
            "過去の日付の出欠を変更しようとしています。\n本当に修正しますか？"
          );
          if (!ok) return;
        }

        rendering = true;

        const idx = STATUS_ORDER.indexOf(cur);
        const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];

        await db.collection("attendance_logs").add({
          playerId: p.id,
          eventId: e.id,
          status: next,
          monthId,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        logsCache[key] = { status: next };
        td.textContent = symbol(next);

        renderStats(players, events, logsCache);
        rendering = false;
      };

      tr.appendChild(td);
    }

    table.appendChild(tr);
  }
}

/***********************
 * 出席率計算
 ***********************/
function renderStats(players, events, logs){
  players.forEach(p => {
    let attend = 0;
    let total = 0;

    events.forEach(e => {
      const key = `${p.id}_${e.id}`;
      const st = logs[key]?.status;

      // トレセン・学校行事は対象外
      if (st === "special" || st === "school") return;

      if (st && st !== "skip") {
        total++;
        if (st === "present") attend++;
      }
    });

    const rate = total ? Math.round(attend / total * 100) : 0;
    const el = document.getElementById(`rate-${p.id}`);
    if (el) el.textContent = `${rate}%`;
  });
}

/***********************
 * 初期ロード
 ***********************/
async function loadMonth(targetMonth){
  monthId = targetMonth;

  const playersSnap = await db.collection("players").get();
  const players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const eventsSnap = await db.collection("events")
    .where("monthId", "==", monthId)
    .orderBy("date")
    .get();
  const events = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const logsSnap = await db.collection("attendance_logs")
    .where("monthId", "==", monthId)
    .get();

  logsCache = {};
  logsSnap.forEach(d => {
    const v = d.data();
    logsCache[`${v.playerId}_${v.eventId}`] = v;
  });

  renderAttendance(players, events);
  renderStats(players, events, logsCache);
}
