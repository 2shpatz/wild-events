// Minimal service worker: receives files shared from the gallery / Google Photos (Android share target).
const CACHE = "lea-share-target";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.pathname === "/share-target") {
    event.respondWith(
      (async () => {
        const form = await event.request.formData();
        const files = form.getAll("media");
        const cache = await caches.open(CACHE);
        let i = 0;
        for (const f of files) {
          if (!(f instanceof File)) continue;
          await cache.put(
            new Request(`/__shared/${Date.now()}-${i++}`),
            new Response(f, {
              headers: {
                "Content-Type": f.type || "application/octet-stream",
                "X-File-Name": encodeURIComponent(f.name),
                "X-Last-Modified": String(f.lastModified || Date.now()),
              },
            }),
          );
        }
        return Response.redirect("/share", 303);
      })(),
    );
  }
});
