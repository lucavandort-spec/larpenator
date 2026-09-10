/* The Larpenator 3000 — offline cache.
   Only registers over http(s); on file:// the app runs normally without it. */
const CACHE = 'larpenator-v2';
const ASSETS = [
  './',
  'index.html',
  'index_33.html',
  'manifest.webmanifest',
  'icon.svg',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // One missing asset must not fail the whole install, so each is added alone.
      .then((c) => Promise.all(ASSETS.map((a) => c.add(a).catch(() => {}))))
      .then(() => self.skipWaiting())
      .catch(() => {})
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const isHTML = (req) =>
  req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

function put(req, res) {
  const copy = res.clone();
  // Opaque and error responses are rejected by the Cache API; ignore those.
  caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // The app *is* the HTML file and it gets edited often, so ask the network
  // first: a new build shows up on the next reload, and the cached copy takes
  // over the moment there is no signal.
  if (isHTML(req)) {
    e.respondWith(
      fetch(req)
        .then((res) => put(req, res))
        .catch(() => caches.match(req).then((hit) => hit || caches.match('index_33.html')))
    );
    return;
  }

  // Google Fonts answers a plain <link> with an opaque response the Cache API
  // refuses to store, so re-request it with CORS and keep that copy instead.
  if (/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.host)) {
    e.respondWith(
      caches.match(req).then((hit) => hit ||
        fetch(req.url, { mode: 'cors' }).then((res) => put(req, res)))
    );
    return;
  }

  // Everything else is static: cache first, fill on the way past.
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => put(req, res)))
  );
});
