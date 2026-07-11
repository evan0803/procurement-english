// ══ 採購英文複習 App — Service Worker ═══════════════════════════════════════
// 目的：手機加到主畫面後可離線開啟外殼（shell），且不干擾 Supabase 資料存取。
const VERSION = 'v1';
const CACHE_NAME = 'prcmt-shell-' + VERSION;

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;

  // 非 GET（POST/PATCH/DELETE…）一律不攔截，交給瀏覽器原生處理
  // 例如 Supabase 的寫入請求絕不能被 SW 攔下。
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 跨網域（Supabase 等）一律不攔截，直接放行，確保雲端讀寫永遠即時。
  if (url.origin !== self.location.origin) return;

  // Navigation（整頁載入）：network-first，失敗才 fallback 快取，
  // 這樣未來部署新版 index.html 不會被舊快取卡死。
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  // 同網域靜態資源（manifest、icons…）：cache-first，快取沒有才發網路請求並補快取。
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
      return res;
    }))
  );
});
