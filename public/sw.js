// عامل خدمة بسيط: يخزّن الأصول الثابتة (الرسوم والأصوات) للعمل السريع، ولا يخزّن واجهات API
const CACHE = 'aswar-v2';
const PRECACHE = ['/', '/assets/logo.svg', '/assets/tile.svg', '/assets/tile-hit.svg', '/assets/tower.svg', '/assets/flag.svg',
  '/assets/king.svg', '/assets/knight.svg', '/assets/cannon.svg', '/assets/guard.svg', '/assets/market.svg', '/assets/trap.svg', '/assets/empty.svg',
  '/sfx/launch.wav', '/sfx/boom.wav', '/sfx/coin.wav', '/sfx/fanfare.wav', '/sfx/fail.wav', '/sfx/thud.wav', '/sfx/tick.wav', '/sfx/click.wav', '/sfx/correct.wav'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/sfx/') || url.pathname.startsWith('/_next/static/')) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); return r; })));
    return;
  }
  // الصفحات: الشبكة أولًا ثم النسخة المخزنة عند انقطاع الاتصال
  if (e.request.mode === 'navigate') e.respondWith(fetch(e.request).catch(() => caches.match(e.request).then((r) => r || caches.match('/'))));
});
