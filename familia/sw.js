/* Service worker mínimo: con él, el teléfono ofrece instalar el Recreo. (Sin avisos push por ahora.) */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
