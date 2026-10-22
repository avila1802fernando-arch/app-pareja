/* Service worker: recibe las notificaciones push y las muestra */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = { title: "Nosotros", body: "Te extraño ❤️" };
  try { data = Object.assign(data, event.data.json()); } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag || "nosotros",
      renotify: true,
      vibrate: data.vibrate || [120, 60, 120],
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          // la app ya está abierta: le decimos a qué pestaña ir
          c.postMessage({ url });
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
