/* Bongo Chee service worker: makes the app installable. It never caches API data; only
   the app shell ("/") is kept, so the installed app still opens without a connection. */
const SHELL = "bongochee-shell-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Page navigations only: network first, falling back to the last good copy when offline.
// Never intercepts API/XHR requests -- those should always hit the network or fail loudly.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) caches.open(SHELL).then((c) => c.put("/", res.clone()));
        return res;
      })
      .catch(() => caches.match("/").then((r) => r || Response.error())),
  );
});

// Not wired up to a push backend yet -- harmless no-ops until one exists, so a future
// notification feature doesn't also need a new service worker registration to land first.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Bongo Chee", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Bongo Chee", {
      body: data.body || "",
      icon: "/brand/icon-192.png",
      badge: "/brand/badge-96.png",
      tag: data.tag || "bongochee",
      renotify: true,
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      const open = clientsArr.find((c) => c.url.startsWith(self.location.origin));
      if (open) return open.focus().then((c) => (c.navigate ? c.navigate(url) : c));
      return self.clients.openWindow(url);
    }),
  );
});
