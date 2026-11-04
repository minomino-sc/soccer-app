
const admin = require("firebase-admin");
const webpush = require("web-push");
const crypto = require("crypto");

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const publicKey = "BAS6fTexJ54TUfONNslPJZkPADvkUTcME9Tw3vxhJEgyCmUBjOveS-OQZkJNy9cs3PLZbAgcxGjh0vBAEOK3gLc";
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT;

if (!privateKey || !subject) {
  throw new Error("VAPIDの環境変数が設定されていません。");
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

webpush.setVapidDetails(subject, publicKey, privateKey);

const EVENTS = "family_calendar_events";
const SUBSCRIPTIONS = "family_push_subscriptions";
const LOGS = "family_calendar_notification_logs";

function jstDateTime(date, hour, minute) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(hour).padStart(2, "0");
  const min = String(minute).padStart(2, "0");

  return new Date(`${y}-${m}-${d}T${h}:${min}:00+09:00`);
}

function getTargetTime(event) {
  if (!event.date) return null;

  const [year, month, day] = event.date.split("-").map(Number);
  const eventDate = new Date(year, month - 1, day);

  if (event.notifyTiming === "dayBefore") {
    eventDate.setDate(eventDate.getDate() - 1);
    return jstDateTime(eventDate, 18, 0);
  }

  if (event.notifyTiming === "morning") {
    return jstDateTime(eventDate, 6, 0);
  }

if (event.notifyTiming === "twoHours") {
  if (!event.time) return null;

  const [hour, minute] = event.time.split(":").map(Number);
  const eventStart = jstDateTime(
    new Date(year, month - 1, day),
    hour,
    minute
  );

  return new Date(eventStart.getTime() - 2 * 60 * 60 * 1000);
}

  return null;
}

function makeLogId(value) {
  return crypto.createHash("sha256")
    .update(value)
    .digest("hex");
}

async function main() {
  const now = new Date();

  const [eventSnapshot, subscriptionSnapshot] = await Promise.all([
    db.collection(EVENTS).get(),
    db.collection(SUBSCRIPTIONS).get()
  ]);

  const subscriptions = subscriptionSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  if (!subscriptions.length) {
    console.log("通知登録された端末はありません。");
    return;
  }

  let sentCount = 0;

  for (const eventDoc of eventSnapshot.docs) {
    const event = eventDoc.data();
    const target = getTargetTime(event);

    if (!target) continue;

    // 実行遅延を考慮し、予定時刻から6時間以内は送信対象とする
    const elapsed = now.getTime() - target.getTime();

    if (elapsed < 0 || elapsed > 6 * 60 * 60 * 1000) {
      continue;
    }

    const eventId = eventDoc.id;
    const timing = event.notifyTiming;

    const timingLabel = {
      dayBefore: "明日の予定",
      morning: "今日の予定",
      twoHours: "まもなく始まる予定"
    }[timing];

    const bodyParts = [
      event.title || "予定のお知らせ",
      event.time ? `時間：${event.time}` : "",
      event.place ? `場所：${event.place}` : ""
    ].filter(Boolean);

    const payload = JSON.stringify({
      title: `🏠 年間スケジュール｜${timingLabel}`,
      body: bodyParts.join("\n"),
      url: "./"
    });

    for (const sub of subscriptions) {
      const endpoint = sub.subscription?.endpoint;
      if (!endpoint) continue;

      const logId = makeLogId(
        `${eventId}|${timing}|${target.toISOString()}|${endpoint}`
      );

      const logRef = db.collection(LOGS).doc(logId);
      const existingLog = await logRef.get();

      if (existingLog.exists) continue;

      try {
        await webpush.sendNotification(
          sub.subscription,
          payload,
          { TTL: 60 * 60 * 24 }
        );

        await logRef.set({
          eventId,
          timing,
          targetTime: target.toISOString(),
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          subscriptionId: sub.id
        });

        sentCount++;
        console.log(`通知送信成功：${event.title} / ${sub.member || "端末"}`);

      } catch (error) {
        console.error("通知送信エラー:", error.statusCode, error.message);

        // 期限切れ・無効な購読情報を削除
        if (error.statusCode === 404 || error.statusCode === 410) {
          await db.collection(SUBSCRIPTIONS).doc(sub.id).delete();
        }
      }
    }
  }

  console.log(`通知処理終了：送信 ${sentCount} 件`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
