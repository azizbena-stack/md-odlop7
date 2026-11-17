// Hors ligne : tout est mis en cache à l'installation, puis servi sans réseau.
const V = 'repere-v3', TUILES = 'repere-tuiles';
const FICHIERS = ['./', 'index.html', 'style.css', 'app.js', 'geo.js', 'guide.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png',
  'data/communes.json', 'data/points.json', 'vendor/leaflet.js', 'vendor/leaflet.css'];
// La météo (api.open-meteo.com) n'est pas mise en cache ici : l'app la garde elle-même dans le téléphone.

self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(FICHIERS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== TUILES).map(k => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  // Tuiles de carte : servies depuis le téléphone si déjà vues (hors ligne), sinon téléchargées et gardées.
  // ponytail: plafond simple de 4 000 tuiles (≈ 80 Mo), on efface les plus anciennes au-delà
  if (/tile\.(openstreetmap|opentopomap)\.org$/.test(u.hostname)) {
    e.respondWith(caches.open(TUILES).then(c => c.match(e.request).then(r => r || fetch(e.request).then(res => {
      if (res.ok) { c.put(e.request, res.clone()); c.keys().then(k => k.length > 4000 && Promise.all(k.slice(0, 500).map(x => c.delete(x)))); }
      return res;
    }))));
    return;
  }
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
