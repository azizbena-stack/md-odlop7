// Hors ligne : tout est mis en cache à l'installation, puis servi sans réseau.
const V = 'repere-v1';
const FICHIERS = ['./', 'index.html', 'style.css', 'app.js', 'geo.js', 'guide.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png',
  'data/communes.json', 'data/points.json', 'vendor/web-llm.js'];

self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(FICHIERS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  const police = /fonts\.(googleapis|gstatic)\.com$/.test(u.hostname);
  if (e.request.method !== 'GET' || (u.origin !== location.origin && !police)) return; // l'IA gère son propre cache
  // Réponse immédiate depuis le cache, mise à jour en arrière-plan (visible au prochain lancement)
  const reseau = fetch(e.request).then(res => {
    if (res.ok || res.type === 'opaque') { const copie = res.clone(); caches.open(V).then(c => c.put(e.request, copie)); }
    return res;
  });
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => {
    if (r) { e.waitUntil(reseau.catch(() => {})); return r; }
    return reseau.catch(() => e.request.mode === 'navigate' ? caches.match('index.html') : Response.error());
  }));
});
