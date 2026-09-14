const CACHE = 'reader-studio-v16';
const LOCAL = ['./','./index.html','./styles.css?v=1.2.10','./app.js?v=1.2.10','./config.js?v=1.2.10','./vendor/jszip.min.js','./manifest.webmanifest?v=1.2.10'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(c => c.addAll(LOCAL)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith('reader-studio-') && key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim())
));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Never cache Supabase, translation services, CDN responses, or any other
  // cross-origin request. Cloud data must always reflect the latest version.
  if (url.origin !== self.location.origin) return;
  const freshFiles = ['/index.html', '/app.js', '/styles.css', '/config.js'];
  if (event.request.mode === 'navigate' || (url.origin === self.location.origin && freshFiles.some(name => url.pathname.endsWith(name)))) {
    event.respondWith(fetch(event.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(event.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(res => {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(event.request, copy)).catch(() => {});
    return res;
  }).catch(() => hit)));
});
