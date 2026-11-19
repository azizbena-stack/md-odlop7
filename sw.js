// Hors ligne : tout est mis en cache à l'installation, puis servi sans réseau.
const V = 'repere-v39', TUILES = 'repere-tuiles', ZONES = 'repere-zones';
const FICHIERS = ['./', 'index.html', 'legal.html', 'style.css', 'app.js', 'geo.js', 'guide.js', 'i18n.js', 'data/pays.json', 'radios/bfm.svg', 'radios/europe1.png', 'radios/fip.svg', 'radios/franceculture.svg', 'radios/franceinfo.svg', 'radios/franceinter.svg', 'radios/francemusique.svg', 'radios/mouv.svg', 'radios/rfi.svg', 'radios/rmc.svg', 'radios/rtl.svg', 'radios/sud.svg', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png',
  'data/communes.json', 'data/points.json', 'data/wiki.json', 'vendor/maplibre-gl.js', 'vendor/maplibre-gl.css', 'vendor/wllama.js', 'vendor/wllama.wasm', 'vendor/wllama-mt.wasm'];
// La météo (api.open-meteo.com) n'est pas mise en cache ici : l'app la garde elle-même dans le téléphone.

// cache: 'reload' : jamais la copie du cache HTTP (GitHub dit « garde 10 min »), sinon la nouvelle version pouvait contenir d'anciens fichiers
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(FICHIERS.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => ![V, TUILES, ZONES].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim())));

// Isolation cross-origin (COOP/COEP) ajoutée par le service worker, GitHub Pages ne sachant pas le faire :
// elle débloque l'IA sur plusieurs cœurs (SharedArrayBuffer). « credentialless » laisse passer les contenus des autres sites ;
// Safari ne le connaît pas et « require-corp » y laissait la carte grise (morceaux de carte bloqués) : pas d'isolation sur Safari (IA sur 1 cœur).
const SAFARI = /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|CriOS|FxiOS|Android|Edg/.test(navigator.userAgent);
const isoler = res => {
  if (SAFARI || !res || res.type === 'opaque' || res.status === 0) return res;
  const h = new Headers(res.headers);
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  h.set('Cross-Origin-Embedder-Policy', 'credentialless');
  h.set('Cross-Origin-Resource-Policy', 'same-origin');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
};

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
  // Réseau d'abord (toujours la dernière version, vérifiée auprès du serveur), la copie du téléphone si pas de réseau
  // ou s'il ne répond pas en 3 s : l'app reste utilisable hors ligne
  const reseau = fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then(res => {
    if (res.ok) { const copie = res.clone(); e.waitUntil(caches.open(V).then(c => c.put(e.request, copie))); }
    return res;
  });
  const copie = () => caches.match(e.request, { ignoreSearch: true }).then(r => r || (e.request.mode === 'navigate' ? caches.match('index.html') : undefined));
  e.respondWith(Promise.race([reseau.catch(() => null), new Promise(r => setTimeout(r, 3000))])
    .then(res => res?.ok ? res : copie().then(r => r || reseau))
    .catch(() => copie().then(r => r || Response.error()))
    .then(isoler));
});
