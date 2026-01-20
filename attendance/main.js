import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  query,
  where,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* Firebase 設定 */
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

/* state */
let current = new Date();
let rendering = false;

/* キャッシュ */
let players = [];
let events = [];
let logsCacheByMonth = {};

/* 月切替 */
document.getElementById("prevMonth").onclick = () => {
  if (rendering) return;
  current.setDate(1);
  current.setMonth(current.getMonth() - 1);
  render();
};
document.getElementById("nextMonth").onclick = () => {
  if (rendering) return;
  current.setDate(1);
  current.setMonth(current.getMonth() + 1);
  render();
};

render();

/* utils */
function toDate(v) {
  if (!v) return null;
  if (typeof v === "string") {
    const [y, m, d] = v.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  if (v instanceof Timestamp) return v.toDate();
  return null;
}
function monthIdOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* 表示記号 */
function symbol(s) {
  if (s === "present") return "○";
  if (s === "absent") return "×";
  if (s === "special") return "※";   // トレセン
  if (s === "school") return "◻︎";    // 学校行事
  return "－";
}

/* ===============================
   出席率描画
   ※ ※・◻︎は対象外
   =============================== */
function renderStats(players, monthEvents, logsCache) {
  stats.innerHTML = "";

  players.forEach(p => {
    let prH = 0, prT = 0, maH = 0, maT = 0;

    monthEvents.forEach(e => {
      const s = logsCache[`${e.id}_${p.id}`]?.status;
      if (!s || s === "skip") return;

      const isCount = (s === "present");

      if (e.type === "practice") {
        if (s !== "special" && s !== "school") prT++;
        if (isCount) prH++;
      }
      if (e.type === "match") {
        if (s !== "special" && s !== "school") maT++;
        if (isCount) maH++;
      }
    });

    const tot = prT + maT;
    const hit = prH + maH;

    stats.innerHTML +=
      "<div class='statsCard'>" +
        "<strong>" + p.name + "</strong><br>" +
        "練習：" + prH + "/" + prT + "（" + (prT ? Math.round(prH / prT * 100) : 0) + "%）<br>" +
        "試合：" + maH + "/" + maT + "（" + (maT ? Math.round(maH / maT * 100) : 0) + "%）<br>" +
        "合計：" + hit + "/" + tot + "（" + (tot ? Math.round(hit / tot * 100) : 0) + "%）" +
      "</div>";
  });
}

/* ===============================
   ★ A / B 別 イベント回数集計
   events_attendance だけで判断
   =============================== */
function countEventsByTeam(monthEvents) {
  const result = {
    A: { practice: 0, match: 0 },
    B: { practice: 0, match: 0 }
  };

  monthEvents.forEach(e => {
    let teams = [];

    // 配列・単数・未定義すべて対応
    if (Array.isArray(e.targetTeams)) {
      teams = e.targetTeams;
    } else if (typeof e.targetTeam === "string") {
      teams = [e.targetTeam];
    } else {
      return;
    }

    teams.forEach(t => {
      if (!result[t]) return;
      if (e.type === "practice") result[t].practice++;
      if (e.type === "match") result[t].match++;
    });
  });

  return result;
}

/* ===============================
   メイン描画
   =============================== */
async function render() {
  rendering = true;
  table.innerHTML = "";
  stats.innerHTML = "";
  monthLabel.textContent = `${current.getFullYear()}年 ${current.getMonth() + 1}月`;

  const monthId = monthIdOf(current);

  if (players.length === 0) {
    const snap = await getDocs(collection(db, "players_attendance"));
    players = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.number ?? 999) - (b.number ?? 999));
  }

  if (events.length === 0) {
    const snap = await getDocs(collection(db, "events_attendance"));
    events = snap.docs
      .map(d => {
        const data = d.data();
        return { id: d.id, ...data, _date: toDate(data.date) };
      })
      .filter(e => e.type !== "holiday")
      .sort((a, b) => a._date - b._date);
  }

  const monthEvents = events.filter(
    e =>
      e._date &&
      e._date.getFullYear() === current.getFullYear() &&
      e._date.getMonth() === current.getMonth()
  );

  if (!logsCacheByMonth[monthId]) {
    logsCacheByMonth[monthId] = {};
    const snap = await getDocs(
      query(collection(db, "attendance_logs"), where("monthId", "==", monthId))
    );

    snap.forEach(doc => {
      const d = doc.data();
      const key = `${d.eventId}_${d.playerId}`;
      const t = d.createdAt?.toMillis?.() ?? 0;
      if (
        !logsCacheByMonth[monthId][key] ||
        t > logsCacheByMonth[monthId][key].time
      ) {
        logsCacheByMonth[monthId][key] = { status: d.status, time: t };
      }
    });
  }

  const logsCache = logsCacheByMonth[monthId];

  /* ヘッダー */
  const trH = document.createElement("tr");
  trH.innerHTML =
    "<th class='no'>背</th><th class='name'>名前</th>" +
    monthEvents.map(e =>
      "<th class='" + e.type + "'>" +
        e._date.getDate() + "<br>" +
        (e.type === "match" ? "試合" : "練習") +
      "</th>"
    ).join("");
  table.appendChild(trH);

  /* 行 */
  players.forEach(p => {
    const tr = document.createElement("tr");

    // ★ Safari対策：改行を絶対に入れない
    tr.innerHTML =
      "<td class='no'>" + (p.number ?? "") + "</td>" +
      "<td class='name'>" + p.name + "</td>";

    monthEvents.forEach(e => {
      const key = `${e.id}_${p.id}`;
      const td = document.createElement("td");
      td.className = e.type;
      td.textContent = symbol(logsCache[key]?.status || "skip");

      td.onclick = async () => {
        if (rendering) return;

        const today = new Date();
        today.setHours(0,0,0,0);
        const target = new Date(e._date);
        target.setHours(0,0,0,0);
        if (target < today) {
          if (!confirm("過去の日付の出欠を変更しますか？")) return;
        }

        rendering = true;

        const cur = logsCache[key]?.status || "skip";
        const next =
          cur === "skip" ? "present" :
          cur === "present" ? "absent" :
          cur === "absent" ? "special" :
          cur === "special" ? "school" :
          "skip";

        await addDoc(collection(db, "attendance_logs"), {
          eventId: e.id,
          playerId: p.id,
          status: next,
          monthId,
          createdAt: serverTimestamp()
        });

        logsCache[key] = { status: next, time: Date.now() };
        td.textContent = symbol(next);

        renderStats(players, monthEvents, logsCache);
        rendering = false;
      };

      tr.appendChild(td);
    });

    table.appendChild(tr);
  });

  renderStats(players, monthEvents, logsCache);
  rendering = false;
}

/* ===============================
   CSV 出力（変更なし）
   =============================== */
window.exportCSV = function () {
  const lines = [];

  lines.push(["⚽ 出欠管理"]);
  lines.push([`${current.getFullYear()}年${current.getMonth() + 1}月`]);
  lines.push([]);

  const headers = ["背番号", "名前"];
  document.querySelectorAll("th:not(.no):not(.name)").forEach(h => {
    headers.push(h.innerText.replace(/\n/g, ""));
  });
  lines.push(headers);

  document.querySelectorAll("#table tr").forEach((tr, i) => {
    if (i === 0) return;
    const row = [];
    tr.querySelectorAll("td").forEach(td => row.push(td.innerText));
    lines.push(row);
  });

  lines.push([]);
  lines.push(["📊 出席率"]);
  document.querySelectorAll(".statsCard").forEach(card => {
    lines.push([card.innerText.replace(/\n/g, " ")]);
  });

  const csv =
    "\uFEFF" +
    lines.map(r =>
      r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")
    ).join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${monthIdOf(current)}_attendance.csv`;
  a.click();
  URL.revokeObjectURL(url);
};
