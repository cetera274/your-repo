// File: sw.js
// アプリのファイルを変更して公開するときは、CACHE_VERSION を必ず変更してください。
// 変更すると利用者の画面に「新しいバージョンがあります」と表示されます。
const CACHE_VERSION = "v4";
const CACHE_PREFIX = "habit-planner-";
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;

const CORE_ASSETS = [
  "./",
  "index.html",
  "style.css",
  "manifest.json",
  "vendor/chart.umd.js",
  "js/main.js",
  "js/state.js",
  "js/store.js",
  "js/actions.js",
  "js/ui.js",
  "js/sync.js",
  "js/reminders.js",
  "js/pwa.js",
  "js/core/date.js",
  "js/core/sleep.js",
  "js/core/habits.js",
  "js/core/data.js",
  "js/core/schedules.js",
  "js/core/csv.js",
  "js/core/sync-logic.js",
  "js/core/planner.js",
  "js/pages/today.js",
  "js/pages/planner.js",
  "js/pages/calendar.js",
  "js/pages/schedule.js",
  "js/pages/schedule-ui.js",
  "js/pages/habits.js",
  "js/pages/habit-ui.js",
  "js/pages/sleep.js",
  "js/pages/review.js",
  "js/pages/settings.js",
];

// 無くてもアプリは動作するファイル（取得に失敗してもインストールを続ける）
const OPTIONAL_ASSETS = ["icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // HTTPキャッシュを使わず、サーバーから最新のファイルを取得する
      await cache.addAll(CORE_ASSETS.map((url) => new Request(url, { cache: "reload" })));
      await Promise.all(
        OPTIONAL_ASSETS.map((url) => cache.add(new Request(url, { cache: "reload" })).catch(() => undefined))
      );
    })()
  );
  // 自動では切り替えない（画面の「更新する」ボタンで SKIP_WAITING を受け取ってから切り替える）
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

function isAppPage(url) {
  const scope = new URL(self.registration.scope);
  return url.pathname === scope.pathname || url.pathname === `${scope.pathname}index.html`;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") {
    return;
  }
  const url = new URL(req.url);
  // GitHubのAPIなど、他のサイトへの通信はそのまま通す
  if (url.origin !== self.location.origin) {
    return;
  }

  // 画面とスクリプトの組み合わせがずれないよう、すべてキャッシュを優先する
  if (req.mode === "navigate" && isAppPage(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = (await cache.match("index.html")) || (await cache.match("./"));
        return cached || fetch(req);
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) {
        return cached;
      }
      const res = await fetch(req);
      if (res.ok && res.type === "basic") {
        cache.put(req, res.clone());
      }
      return res;
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of list) {
        if ("focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow("./");
    })()
  );
});