/* Bonito service worker: push notifications and an offline page.
 * Security: nothing signed-in (pages, API responses, chat) is ever cached here.
 * Only the static offline page and app icons are stored. */
const CACHE = "bonito-static-v1";
const STATIC = ["/offline.html", "/icons/icon-192.png", "/icons/badge-72.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Page navigations: always from the network; the offline page only when there's no connection
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;
  event.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Bonito", body: event.data ? event.data.text() : "" };
  }
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      // Already looking at the app: the in-app toast/popup is enough
      if (wins.some((w) => w.focused && w.visibilityState === "visible")) return;
      return self.registration.showNotification(data.title || "Bonito", {
        body: data.body || "",
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-72.png",
        tag: data.tag || undefined,
        renotify: Boolean(data.tag),
        data: { url }
      });
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const same = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (same) return same.focus().then(() => same.navigate(url));
      return self.clients.openWindow(url);
    })
  );
});
