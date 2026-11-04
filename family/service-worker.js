
/* =========================================
   NINOMIYA FAMILY CALENDAR
   WEB PUSH SERVICE WORKER
========================================= */

self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    self.clients.claim()
  );
});

/*
  プッシュ通知を受信
*/
self.addEventListener("push", event => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    data = {
      title: "🏠 年間スケジュール",
      body: event.data ? event.data.text() : "予定のお知らせです。"
    };
  }

  const title = data.title || "🏠 年間スケジュール";

  const options = {
    body: data.body || "予定のお知らせです。",
    icon: "../36DFB140-A00A-4A74-8352-88AB4126CB2E.png",
    badge: "../36DFB140-A00A-4A74-8352-88AB4126CB2E.png",
    data: {
      url: data.url || "./"
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

/*
  通知をタップしたとき
*/
self.addEventListener("notificationclick", event => {
  event.notification.close();

  const targetUrl = new URL(
    event.notification.data?.url || "./",
    self.location.origin
  ).href;

  event.waitUntil(
    self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then(clients => {
      for (const client of clients) {
        if (client.url === targetUrl && "focus" in client) {
          return client.focus();
        }
      }

      return self.clients.openWindow(targetUrl);
    })
  );
});
