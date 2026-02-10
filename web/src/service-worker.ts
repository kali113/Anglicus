/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const CACHE = `cache-${version}`;

const ASSETS = [
  ...build,
  ...files,
];
const APP_BASE = new URL(self.location.href).pathname.replace(/\/service-worker\.js$/, "");
const FALLBACK_PAGE = APP_BASE ? `${APP_BASE}/index.html` : "/index.html";

self.addEventListener('install', (event) => {
  async function addFilesToCache() {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
  }

  (event as ExtendableEvent).waitUntil(addFilesToCache());
});

self.addEventListener('activate', (event) => {
  async function deleteOldCaches() {
    for (const key of await caches.keys()) {
      if (key !== CACHE) await caches.delete(key);
    }
  }

  (event as ExtendableEvent).waitUntil(deleteOldCaches());
});

self.addEventListener('fetch', (event) => {
  const fetchEvent = event as FetchEvent;
  
  if (fetchEvent.request.method !== 'GET') return;

  async function respond() {
    const url = new URL(fetchEvent.request.url);
    const cache = await caches.open(CACHE);

    // Try cache first for assets
    if (ASSETS.includes(url.pathname)) {
      const cachedResponse = await cache.match(fetchEvent.request);
      if (cachedResponse) return cachedResponse;
    }

    // Network first for other requests
    try {
      const response = await fetch(fetchEvent.request);
      
      if (response.status === 200) {
        cache.put(fetchEvent.request, response.clone());
      }
      
      return response;
    } catch {
      const cachedResponse = await cache.match(fetchEvent.request);
      if (cachedResponse) return cachedResponse;
      
      // Return fallback for navigation requests
      if (fetchEvent.request.mode === 'navigate') {
        return cache.match(FALLBACK_PAGE) as Promise<Response>;
      }
      
      throw new Error('Network error and no cache');
    }
  }

  fetchEvent.respondWith(respond());
});

self.addEventListener('notificationclick', (event) => {
  const notificationEvent = event as NotificationEvent;
  notificationEvent.notification.close();

  notificationEvent.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((allClients) => {
      const client = allClients.find((clientItem) => 'focus' in clientItem);
      if (client) {
        return (client as WindowClient).focus();
      }
      return clients.openWindow(APP_BASE || '/');
    })
  );
});
