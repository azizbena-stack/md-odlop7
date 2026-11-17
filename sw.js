// Hors ligne : tout est mis en cache à l'installation, puis servi sans réseau.
const V = 'repere-v7', TUILES = 'repere-tuiles', ZONES = 'repere-zones';
const FICHIERS = ['./', 'index.html', 'style.css', 'app.js', 'geo.js', 'guide.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png',
  'data/communes.json', 'data/points.json', 'data/wiki.json', 'vendor/maplibre-gl.js', 'vendor/maplibre-gl.css'];
// La météo (api.open-meteo.com) n'est pas mise en cache ici : l'app la garde elle-même dans le téléphone.

self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(FICHIERS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => ![V, TUILES, ZONES].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim())));

let ajouts = 0;
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.hostname === 'tiles.openfreemap.org' || u.href.startsWith('https://s3.amazonaws.com/elevation-tiles-prod/')) {
    if (e.request.cache === 'no-store') return; // téléchargement d'une zone : la page range elle-même dans repere-zones
    // Style et index des tuiles : réseau d'abord (ils changent), sinon la copie gardée
    if (/^\/(styles\/|planet$)/.test(u.pathname)) {
      e.respondWith(fetch(e.request).then(res => {
        if (res.ok) { const cp = res.clone(); caches.open(TUILES).then(c => c.put(e.request, cp)); }
        return res;
      }).catch(() => caches.match(e.request).then(r => r || Response.error())));
      return;
    }
    // Morceaux de carte, relief, polices : depuis le téléphone si déjà vus ou téléchargés, sinon réseau et on garde.
    // La version dans l'adresse des tuiles change chaque semaine : on la retire de la clé (même règle que app.js).
    const cle = u.href.replace(/\/planet\/[^/]+\/(\d+\/\d+\/\d+\.pbf)$/, '/planet/$1');
    e.respondWith(caches.match(cle).then(r => r || fetch(e.request).then(res => {
      if (res.ok) {
        const cp = res.clone();
        // ponytail: plafond simple de 6 000 morceaux vus en passant (les zones téléchargées ne sont jamais effacées)
        caches.open(TUILES).then(c => c.put(cle, cp).then(() => ++ajouts % 200 === 0 && c.keys().then(k => k.length > 6000 && Promise.all(k.slice(0, 1000).map(x => c.delete(x))))));
      }
      return res;
    })));
    return;
  }
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // l'IA gère son propre cache
  // Réponse immédiate depuis le cache, mise à jour en arrière-plan (visible au prochain lancement)
  const reseau = fetch(e.request).then(res => {
    if (res.ok) { const copie = res.clone(); caches.open(V).then(c => c.put(e.request, copie)); }
    return res;
  });
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => {
    if (r) { e.waitUntil(reseau.catch(() => {})); return r; }
    return reseau.catch(() => e.request.mode === 'navigate' ? caches.match('index.html') : Response.error());
  }));
});
