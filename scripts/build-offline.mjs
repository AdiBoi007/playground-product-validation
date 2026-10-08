import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    return entry.isDirectory() ? files(path) : [path.replace(/^dist/, "")];
  });
}
const assets = files("dist").filter((path) => path !== "/sw.js");
const revision = createHash("sha256")
  .update(assets.map((path) => readFileSync(`dist${path}`)).join(""))
  .digest("hex")
  .slice(0, 12);
const worker = `const CACHE = 'playground-${revision}';
const ASSETS = ${JSON.stringify(assets)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('playground-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/index.html', { ignoreVary: true })));
    return;
  }
  event.respondWith(caches.match(event.request, { ignoreVary: true }).then(cached => cached || fetch(event.request)));
});
`;
writeFileSync("dist/sw.js", worker);
console.log(`Offline shell prepared: ${assets.length} local assets.`);
