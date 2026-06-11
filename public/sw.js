const CACHE = 'health-v1'
const PRECACHE = ['/', '/index.html']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/') || e.request.url.includes('fitbit.com') || e.request.url.includes('googleapis.com')) return
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request).then(r => r || caches.match('/')))
  )
})
