
/* =========================================
   KOBE SANNOMIYA FC
   MAIN MENU SERVICE WORKER
========================================= */

self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    self.clients.claim()
  );
});
