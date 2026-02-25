const year = 2026;
const container = document.getElementById("calendarContainer");
const detail = document.getElementById("eventDetail");

// サンプルデータ（あとでFirestoreやJSONに変更可）
const events = {
  "2026-04-05": { type: "practice", text: "練習 9:00〜12:00" },
  "2026-04-12": { type: "official", text: "公式戦 vs ○○FC" },
  "2026-05-03": { type: "cup", text: "カップ戦 1回戦" },
  "2026-05-10": { type: "friendly", text: "交流戦 vs △△SC" }
};

function createMonth(month) {
  const monthDiv = document.createElement("div");
  monthDiv.className = "month";

  const title = document.createElement("h2");
  title.textContent = `${month}月`;
  monthDiv.appendChild(title);

  const calendar = document.createElement("div");
  calendar.className = "calendar";

  const daysInMonth = new Date(year, month, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;

    const dayDiv = document.createElement("div");
    dayDiv.className = "day";
    dayDiv.textContent = day;

    if (events[dateStr]) {
      const label = document.createElement("div");
      label.className = `label ${events[dateStr].type}`;
      label.textContent = events[dateStr].type;
      dayDiv.appendChild(label);

      dayDiv.addEventListener("click", () => {
        detail.textContent = events[dateStr].text;
      });
    }

    calendar.appendChild(dayDiv);
  }

  monthDiv.appendChild(calendar);
  container.appendChild(monthDiv);
}

// 4月〜3月
for (let m = 4; m <= 12; m++) createMonth(m);
for (let m = 1; m <= 3; m++) createMonth(m);
