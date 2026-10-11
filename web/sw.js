// Minimal service worker so the browser can install Eventique as an app.
// It always uses the network, so users never see stale data.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
