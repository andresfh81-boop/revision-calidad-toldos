/* Service worker de "Control de Calidad · Toldos"
 * Estrategia:
 *  - Navegación / HTML  -> RED PRIMERO (los cambios que subas se ven al instante),
 *    con la copia en caché como respaldo si no hay conexión o la red tarda más de 4 s.
 *  - Resto de recursos (iconos, manifiesto, librerías CDN) -> CACHÉ PRIMERO y
 *    se actualiza en segundo plano.
 * Sube una versión nueva de este archivo (cambia VERSION) para forzar limpieza de caché.
 */
const VERSION = 'cct-v6-20261101';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './vendor/html2canvas.min.js', './vendor/jspdf.umd.min.js'];
// Librerías de internet que la página carga al abrir: se guardan al instalar para que, con la red colgada, no frenen el arranque.
const CDN = ['tesseract.js/5.0.4/tesseract.min.js', 'heic2any/0.0.4/heic2any.min.js', 'pdf.js/3.11.174/pdf.min.js', 'pdf.js/3.11.174/pdf.worker.min.js']
  .map((f) => 'https://cdnjs.cloudflare.com/ajax/libs/' + f);
// Con wifi sin internet o mala señal la red no falla, se queda esperando: pasado este tiempo se usa la copia guardada.
const NET_TIMEOUT = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      // cache: 'reload' para no guardar una copia vieja que tenga el navegador o GitHub Pages.
      .then((cache) => cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))
        .then(() => cache.addAll(CDN.map((u) => new Request(u, { mode: 'cors', cache: 'reload' }))).catch(() => {})))
      .then(() => self.skipWaiting())
  );
});

// Solo borra copias viejas de esta app: todas las apps de andresfh81-boop.github.io comparten las copias guardadas.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('cct-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    const red = fetch(req).then((res) => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(VERSION).then((cache) => cache.put('./index.html', clone));
      }
      return res;
    });
    event.waitUntil(red.catch(() => {}));
    const copia = async () => (await caches.match('./index.html')) || (await caches.match('./'));
    event.respondWith(new Promise((resolve) => {
      let hecho = false;
      const dar = (r) => { if (!hecho && r) { hecho = true; resolve(r); } };
      const timer = setTimeout(() => copia().then(dar), NET_TIMEOUT);
      red.then((r) => { clearTimeout(timer); dar(r); })
        .catch(() => { clearTimeout(timer); copia().then((c) => { dar(c); if (!hecho) resolve(Response.error()); }); });
    }));
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(req);
    const network = fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});
