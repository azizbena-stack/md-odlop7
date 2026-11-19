import { distance, bearing, nearest, cardinal, fmtDist, dms, sunTimes, ecartAngle, devant, CARDINAUX, FMT } from './geo.js';
import { DICT, CARDINAUX as CARDS } from './i18n.js';
import { FICHES, CATS, risquesLocaux } from './guide.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
// Icônes dessinées (jeu d'icônes en haut d'index.html), à la place des émojis
const pic = (n, c = '') => `<svg class="ic${c ? ' ' + c : ''}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- Mémoire locale ----------
let S = { profil: 'rando', fiche: {}, contacts: [], points: [], trace: [], sac: [], plan: {}, theme: '', ia: false, cible: null };
try { Object.assign(S, JSON.parse(localStorage.getItem('repere') || '{}')); } catch {}
delete S.route; // à chaque ouverture : pas d'ancien itinéraire, juste ma position (il reste dans « Mes trajets »)
const save = () => { try { localStorage.setItem('repere', JSON.stringify(S)); } catch {} };

// ---------- Langue : français, anglais, espagnol ----------
// Les textes restent écrits en français dans le code ; i18n.js donne leur traduction. Changer de langue recharge l'app.
const LANGUES = ['fr', 'en', 'es'], nav2 = (navigator.language || 'en').slice(0, 2);
const LANGUE = LANGUES.includes(S.langue) ? S.langue : LANGUES.includes(nav2) ? nav2 : 'en';
const LOC = { fr: 'fr-FR', en: 'en-GB', es: 'es-ES' }[LANGUE], D = DICT[LANGUE] || {};
const t = (fr, v = {}) => (D[fr] ?? fr).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
CARDINAUX.splice(0, 8, ...CARDS[LANGUE]); FMT.dec = LANGUE === 'en' ? '.' : ','; FMT.imperial = S.unites === 'imperial';
document.documentElement.lang = LANGUE;
// Textes fixes de la page et des fenêtres : traduits à l'affichage (texte exact, espaces ignorés)
const cleT = x => x.replace(/\s+/g, ' ').trim();
function traduire(racine) {
  if (LANGUE === 'fr') return;
  if (racine.nodeType === 3) { const k = cleT(racine.data); if (D[k] && D[k] !== k) racine.data = racine.data.replace(racine.data.trim(), D[k]); return; }
  if (racine.nodeType !== 1 || racine.closest?.('script,style,.fiche-texte')) return;
  for (const el of [racine, ...racine.querySelectorAll('*')]) {
    for (const a of ['placeholder', 'aria-label', 'title']) {
      const v = el.getAttribute?.(a), traduction = v && D[cleT(v)];
      if (traduction && traduction !== v) el.setAttribute(a, traduction);
    }
    const html = el.children.length && el.innerHTML, traduction = html && D[cleT(html)];
    if (traduction && traduction !== html) el.innerHTML = traduction; // phrase avec <b>, <a>…
  }
  const w = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode());) traduire(n);
}
if (LANGUE !== 'fr') {
  traduire(document.body);
  new MutationObserver(ms => ms.forEach(m => m.type === 'childList' ? m.addedNodes.forEach(traduire) : traduire(m.target)))
    .observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'aria-label', 'title'] });
}

// ---------- Hors ligne ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  // La page n'est isolée (IA multi-cœurs) qu'une fois servie par le service worker : on recharge une seule fois pour ça
  const isoler = () => { if (!self.crossOriginIsolated && navigator.serviceWorker.controller) try { if (!sessionStorage.coi) { sessionStorage.coi = 1; location.reload(); } } catch {} };
  // Nouvelle version installée pendant que l'app est ouverte : on recharge une fois pour l'afficher tout de suite
  const avaitSW = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => avaitSW ? location.reload() : isoler()); isoler();
}
const majReseau = () => {
  const el = $('#etatReseau');
  el.textContent = navigator.onLine ? 'Prêt hors réseau' : 'Hors réseau · tout marche';
};
// Numéro de version (onglet Moi) : le nom du cache du service worker, pour savoir quelle version tourne
window.caches?.keys().then(k => { const v = k.filter(x => /^repere-v\d+$/.test(x)).sort((a, b) => b.slice(8) - a.slice(8))[0]; if (v) $('#version').textContent = 'Version ' + v.slice(8); }).catch(() => {});
addEventListener('online', majReseau); addEventListener('offline', majReseau); majReseau();

// ---------- Navigation ----------
function ouvrir(vue) {
  if (vue !== 'carte') {
    fermerChoixIti();
    pleinEcranCarte(false);
  }
  $$('.vue').forEach(v => v.classList.toggle('active', v.id === 'v-' + vue));
  $$('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.vue === vue || (b.dataset.vue === 'carte' && vue === 'boussole')));
  $$('[data-seg]').forEach(b => b.classList.toggle('on', b.dataset.seg === vue));
  scrollTo({ top: 0 });
  if (vue === 'carte') {
    if (guidage) pleinEcranCarte(true);
    setTimeout(initPlan);
  }
  majVerrouillage(); // la carte a besoin d'un conteneur visible
  if (document.documentElement.classList.contains('survie')) coach();
}
$$('.tabs button').forEach(b => b.onclick = () => ouvrir(b.dataset.vue));
$$('[data-seg]').forEach(b => b.onclick = () => ouvrir(b.dataset.seg));

const modal = $('#modal');
function popup(html) { $('#modalBody').innerHTML = html; modal.showModal(); }
$('#modalFermer').onclick = $('#modalX').onclick = () => { stopMetro(); modal.close(); };
modal.addEventListener('close', stopMetro);

// ---------- Données France ----------
let COMMUNES = [], POINTS = [];
Promise.all([fetch('data/communes.json').then(r => r.json()), fetch('data/points.json').then(r => r.json())])
  .then(([c, p]) => { COMMUNES = c; POINTS = p; if (pos) majSituation(); majPointsPlan(); });

// ---------- GPS ----------
let pos = null, watchId = null, heading = null, villageHist = [];
const ici = () => [pos.coords.latitude, pos.coords.longitude];

function demarrerGps() {
  if (!navigator.geolocation) return popup('<h2>GPS indisponible</h2><p>Ce navigateur ne donne pas accès à la position.</p>');
  $('#posMeta').textContent = 'Recherche des satellites…';
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = navigator.geolocation.watchPosition(onPos, e => {
    if (e.code === 1) {
      navigator.geolocation.clearWatch(watchId); watchId = null;
      if (guidageEnAttente) {
        guidageEnAttente = false;
        $('#itiGo').textContent = 'Activer le GPS';
        afficherCalculCarte(t('Autorise la position dans ton navigateur pour démarrer le guidage.'));
      }
    }
    const ios = /iPhone|iPad/.test(navigator.userAgent);
    $('#posMeta').textContent = e.code !== 1 ? 'Signal GPS faible : va dans un endroit dégagé.'
      : ios ? 'Localisation refusée. Réglages › Confidentialité et sécurité › Service de localisation › Sites web Safari : « Lorsque l\'app est active ». Puis Réglages › Apps › Safari › Localisation : « Demander ». Ferme et rouvre T’es où ?'
      : 'Localisation refusée : Paramètres › Applications › Chrome › Autorisations › Position : « Autoriser ».';
    $('#btnGps').hidden = false;
  }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 });
  $('#btnGps').hidden = true;
}
$('#btnGps').onclick = demarrerGps;

function onPos(p) {
  const premier = !pos; pos = p;
  if (premier && document.documentElement.classList.contains('survie')) setTimeout(coach); // la carte rouge passe tout de suite au conseil suivant
  const [la, lo] = ici();
  $('#coords').textContent = `${la.toFixed(5)}, ${lo.toFixed(5)}`;
  const alt = p.coords.altitude != null ? t(' · altitude {n} m', { n: Math.round(p.coords.altitude) }) : '';
  $('#posMeta').textContent = t('Précision ±{n} m', { n: Math.round(p.coords.accuracy) }) + alt;
  $('#sosCoords').textContent = `${la.toFixed(5)}, ${lo.toFixed(5)}`;
  $('#sosDms').textContent = `${dms(la, 'N', 'S')}  ${dms(lo, 'E', 'O')}`;
  enregistrerTrace();
  majSituation();
  majBoussole();
  majMer();
  meteoAuto();
  majMoiPlan();
  verifierDangers();
  if (guidageEnAttente) { guidageEnAttente = false; demarrerGuidage(); }
}

// ---------- Situation ----------
const TYPES = {
  eau: [pic('goutte', 'c-eau'), "Point d'eau"], cabane: [pic('cabane', 'c-refuge'), 'Cabane non gardée'], refuge: [pic('refuge', 'c-refuge'), 'Refuge gardé'], gite: [pic('gite', 'c-gite'), "Gîte d'étape"],
  abri: [pic('abri', 'c-abri'), 'Abri naturel'], hopital: [pic('hopital', 'c-hopital'), 'Hôpital · urgences'], danger: [pic('danger', 'c-danger'), 'Passage délicat'],
  port: [pic('ancre', 'c-port'), 'Port · marina'], snsm: [pic('bouee', 'c-hopital'), 'Station de sauvetage'],
};
let dernierVillage = null, depActuel = null;

function rot(el, cap) { if (el) el.style.transform = `rotate(${cap - (heading ?? 0)}deg)`; }

function majSituation() {
  if (!pos || !COMMUNES.length) return;
  const here = ici();
  const [v] = nearest(COMMUNES, here);
  dernierVillage = v;
  $('#villageNom').textContent = v.p[0];
  $('#villageInfo').textContent = `${fmtDist(v.d)} · ${cardinal(v.cap)} (${Math.round(v.cap)}°)${v.p[3] ? ' · ' + v.p[3].toLocaleString(LOC) + ' hab.' : ''}`;
  $('#flecheVillage').dataset.cap = v.cap; rot($('#flecheVillage'), v.cap);

  // Tendance : se rapproche-t-on de ce village ?
  const now = Date.now();
  villageHist.push({ t: now, nom: v.p[0], d: v.d });
  villageHist = villageHist.filter(h => now - h.t < 30 * 60e3);
  const ref = villageHist.find(h => h.nom === v.p[0] && now - h.t > 5 * 60e3);
  const tdn = $('#tendance');
  if (ref) {
    const delta = v.d - ref.d, min = Math.round((now - ref.t) / 60e3);
    tdn.className = 'tendance ' + (delta < -50 ? 'bien' : delta > 50 ? 'mal' : '');
    tdn.textContent = delta < -50 ? `↘ Tu te rapproches : −${fmtDist(-delta)} en ${min} min` : delta > 50 ? `↗ Tu t'éloignes : +${fmtDist(delta)} en ${min} min` : `Tu restes à la même distance depuis ${min} min`;
  } else tdn.textContent = 'La tendance s\'affiche après quelques minutes de marche.';

  // Points proches par type
  const voulus = S.profil === 'mer' ? ['port', 'snsm', 'hopital', 'eau'] : ['eau', 'cabane', 'refuge', 'gite', 'hopital'];
  const lignes = [];
  for (const t of voulus) {
    const list = POINTS.filter(p => p[0] === t || (t === 'cabane' && p[0] === 'abri'));
    const [n] = nearest(list, here, 1, p => [p[2], p[3]]);
    if (n && n.d < 60000) lignes.push(n);
  }
  lignes.sort((a, b) => a.d - b.d);
  $('#proches').innerHTML = lignes.map(n => `<li data-ll="${n.p[2]},${n.p[3]}" data-nom="${esc(n.p[1])}"><span class="pastille">${TYPES[n.p[0]][0]}</span>
    <span class="nom"><b>${esc(n.p[1])}</b><span>${TYPES[n.p[0]][1]}${n.p[4] ? ' · ' + n.p[4] + ' m' : ''}</span></span>
    <span class="dist"><svg data-cap="${n.cap}" style="transform:rotate(${n.cap - (heading ?? 0)}deg)"><use href="#i-fleche"/></svg> ${fmtDist(n.d)}<br><small class="meta">${cardinal(n.cap)}</small></span></li>`).join('')
    || '<li class="meta">Aucun refuge ni point d\'eau répertorié à moins de 60 km.</li>';
  dessinerRadar(here); majDevant();

  // Risques du secteur (département de la commune la plus proche)
  const dep = v.p[4];
  if (dep !== depActuel) {
    depActuel = dep;
    $('#risques').innerHTML = risquesLocaux(dep).map(r => `<li>${r}</li>`).join('');
    $('#risquesCarte').hidden = false;
  }
  $('#sosLieu').textContent = t('Près de {v}', { v: `${v.p[0]} (${fmtDist(v.d)} ${cardinal(v.cap)})` });
  majSmsProches();
}

function dessinerRadar(here) {
  const R = 5000, svg = $('#radar');
  const pts = nearest(POINTS, here, 40, p => [p[2], p[3]]).filter(n => n.d < R);
  const vil = nearest(COMMUNES, here, 12).filter(n => n.d < R);
  const rotH = -(heading ?? 0);
  const xy = (n) => { const a = (n.cap + rotH) * Math.PI / 180, r = n.d / R * 100; return [Math.sin(a) * r, -Math.cos(a) * r]; };
  const a = DEMI_CONE * Math.PI / 180, cone = modeDevant && heading != null
    ? `<path d="M0 0 L${(-Math.sin(a) * 100).toFixed(1)} ${(-Math.cos(a) * 100).toFixed(1)} A100 100 0 0 1 ${(Math.sin(a) * 100).toFixed(1)} ${(-Math.cos(a) * 100).toFixed(1)}Z" fill="var(--accent)" opacity=".16"/>` : '';
  svg.innerHTML = `${cone}
    <circle class="anneau" r="100"/><circle class="anneau" r="66" stroke-dasharray="2 3"/><circle class="anneau" r="33" stroke-dasharray="2 3"/>
    <text x="3" y="-68">3,3 km</text><text x="3" y="-35">1,7 km</text>
    <g transform="rotate(${rotH})"><text x="-4" y="-103" style="fill:var(--accent);font-size:10px">N</text></g>
    ${vil.map(n => { const [x, y] = xy(n); return `<g data-ll="${n.p[1]},${n.p[2]}" data-nom="${esc(n.p[0])}"><rect x="${x - 4}" y="${y - 4}" width="8" height="8" rx="2" fill="var(--txt)"/><text x="${x + 7}" y="${y + 3}" style="fill:var(--txt2)">${esc(n.p[0].slice(0, 14))}</text></g>`; }).join('')}
    ${pts.map(n => { const [x, y] = xy(n); const c = n.p[0] === 'eau' ? '#5BB8FF' : n.p[0] === 'danger' ? 'var(--danger)' : n.p[0] === 'hopital' ? '#FF2D55' : 'var(--vert)'; return `<g data-ll="${n.p[2]},${n.p[3]}" data-nom="${esc(n.p[1])}"><circle cx="${x}" cy="${y}" r="9" fill="transparent"/><circle cx="${x}" cy="${y}" r="3.5" fill="${c}"/></g>`; }).join('')}
    <circle r="6" fill="var(--accent)"/><circle r="12" fill="none" stroke="var(--accent)" opacity=".4"/>`;
}

// ---------- Devant moi : ce qu'il y a du côté où pointe le haut du téléphone (à une bifurcation) ----------
const DEMI_CONE = 30; // ponytail: ±30° réglage de départ ; à élargir si on rate des lieux dehors
const TYPES_DEVANT = ['eau', 'refuge', 'cabane', 'gite', 'abri'];
let modeDevant = false, compasMuet = false, devantLieux = [], devantPour = null, devantRendu = null, devantVus = new Set(), devantDoigt = 0;
function lieuxAutour(here) { // les candidats dans le rayon du radar, recherchés une fois tous les 25 m
  if (devantPour && distance(devantPour, here) < 25) return devantLieux;
  const pts = nearest(POINTS.filter(p => TYPES_DEVANT.includes(p[0])), here, 80, p => [p[2], p[3]]).filter(n => n.d < 5000)
    .map(n => ({ cle: 'p' + n.p[2] + ',' + n.p[3], ll: [n.p[2], n.p[3]], nom: n.p[1], type: TYPES[n.p[0]] }));
  const vil = nearest(COMMUNES, here, 25).filter(n => n.d < 5000)
    .map(n => ({ cle: 'c' + n.p[1] + ',' + n.p[2], ll: [n.p[1], n.p[2]], nom: n.p[0], type: [pic('village', 'c-village'), 'Village'] }));
  devantPour = here; return devantLieux = [...pts, ...vil];
}
function majDevant() {
  if (!modeDevant) return;
  const info = $('#devantInfo'), ul = $('#devantListe'), vide = t => { info.textContent = t; ul.innerHTML = ''; devantRendu = null; };
  if (!pos) return vide('Position inconnue : active le GPS en haut de l\'onglet. Sans position, T’es où ? ne sait pas ce qui est devant toi.');
  if (heading == null) return vide(compasMuet ? 'Ton téléphone ne donne pas de direction (pas de boussole, ou accès aux capteurs refusé). Repasse sur « Tout autour » : le radar marche avec le nord en haut.'
    : 'Attente de la boussole… tiens le téléphone à plat, le haut vers le chemin.');
  if (devantDoigt) return; // doigt posé sur la liste : rien ne bouge sous le doigt
  const here = ici();
  // Stabilité : on ne refait la liste que si l'on a tourné de plus de 8° ou marché plus de 15 m
  if (devantRendu && ecartAngle(devantRendu.cap, heading) < 8 && distance(devantRendu.ll, here) < 15) return;
  const lieux = lieuxAutour(here).map(n => ({ ...n, d: distance(here, n.ll), cap: bearing(here, n.ll) })).filter(n => n.d > 80); // à moins de 80 m : on y est, la direction ne veut rien dire
  const res = devant(lieux, heading, DEMI_CONE, devantVus).slice(0, 12);
  devantVus = new Set(res.map(n => n.cle)); devantRendu = { cap: heading, ll: here };
  info.innerHTML = t('Tu vises <b>{c}</b> · lieux à ±{a}° jusqu\'à 5 km', { c: `${Math.round(heading)}° · ${cardinal(heading)}`, a: DEMI_CONE });
  ul.innerHTML = res.map(n => `<li data-ll="${n.ll}" data-nom="${esc(n.nom)}"><span class="pastille">${n.type[0]}</span>
    <span class="nom"><b>${esc(n.nom)}</b><span>${n.type[1]}</span></span><span class="dist">${fmtDist(n.d)}<br><small class="meta">${t('à vol d\'oiseau')}</small></span></li>`).join('')
    || '<li class="meta">Aucun refuge, village ni point d\'eau de ce côté à moins de 5 km. Tourne-toi doucement ou repasse sur « Tout autour ».</li>';
}
$('#btnDevant').onclick = () => {
  modeDevant = !modeDevant;
  const b = $('#btnDevant'); b.classList.toggle('on', modeDevant); b.setAttribute('aria-pressed', modeDevant); b.textContent = modeDevant ? 'Tout autour' : 'Devant moi';
  $('#radarTitre').textContent = modeDevant ? 'Devant moi' : 'Autour de toi';
  $('#proches').hidden = modeDevant; $('#devantListe').hidden = $('#devantInfo').hidden = !modeDevant;
  if (modeDevant && heading == null && !$('#btnCompas').hidden) demarrerCompas(); // le toucher sert d'autorisation sur iPhone
  devantRendu = null; devantVus = new Set(); majDevant(); if (pos) dessinerRadar(ici());
};
// Doigt sur la liste : on la fige, et un peu après l'avoir levé (le temps que le toucher arrive)
$('#devantListe').addEventListener('pointerdown', () => { clearTimeout(devantDoigt); devantDoigt = -1; });
['pointerup', 'pointercancel'].forEach(t => $('#devantListe').addEventListener(t, () => { devantDoigt = setTimeout(() => { devantDoigt = 0; majDevant(); }, 600); }));

// Toucher un repère (liste ou radar) : la carte s'ouvre dessus avec l'itinéraire ; sans réseau, « Suivre à la boussole »
$('#proches').onclick = $('#radar').onclick = $('#devantListe').onclick = e => {
  const el = e.target.closest('[data-ll]'); if (!el) return;
  const ll = el.dataset.ll.split(',').map(Number);
  ouvrir('carte'); initPlan(); // tout de suite (pas au tour suivant) pour poser le repère
  if (plan) { // moi et le repère dans le cadre (la route recadrera si elle arrive)
    suivre = false;
    plan.fitBounds(new maplibregl.LngLatBounds(lnglat(ll), lnglat(ll)).extend(lnglat(pos ? ici() : ll)), { padding: 60, maxZoom: 15, duration: 0 });
  }
  choisirDest(ll, el.dataset.nom);
};

// ---------- Soleil ----------
function majSoleil() {
  const here = pos ? ici() : [46.6, 2.4]; // centre de la France par défaut
  const now = new Date(), s = sunTimes(now, ...here);
  const hm = d => d ? d.toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' }) : '—';
  $('#soleilHeures').innerHTML = `${pic('soleil')} ${hm(s.rise)}<br>${pic('lune')} ${hm(s.set)}`;
  const carte = $('.soleil');
  let txt, frac;
  if (now < s.rise) { txt = t('Jour dans {d}', { d: duree(s.rise - now) }); frac = 0; }
  else if (now > s.set) { const demain = sunTimes(new Date(now.getTime() + 864e5), ...here); txt = t('Jour dans {d}', { d: duree(demain.rise - now) }); frac = 1; }
  else { txt = t('Nuit dans {d}', { d: duree(s.set - now) }); frac = (now - s.rise) / (s.set - s.rise); }
  $('#nuitDans').textContent = txt;
  carte.classList.toggle('urgent', now < s.set && s.set - now < 90 * 60e3 && now > s.rise);
  $('#arcFill').style.width = frac * 100 + '%'; $('#arcSun').style.left = frac * 100 + '%';
  return s;
}
const duree = ms => { const m = Math.round(ms / 60e3); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
majSoleil(); setInterval(majSoleil, 60e3);

// ---------- Météo (téléchargée quand il y a du réseau, lisible hors ligne) ----------
const picMeteo = nom => pic(nom, 'meteo-ic meteo-ic-' + nom);
const WMO = c => c == null ? ['', '—'] : c === 0 ? [picMeteo('soleil'), 'Ciel clair'] : c <= 2 ? [picMeteo('eclaircie'), 'Peu nuageux'] : c === 3 ? [picMeteo('nuage'), 'Couvert'] : c <= 48 ? [picMeteo('brouillard'), 'Brouillard']
  : c <= 57 ? [picMeteo('pluie'), 'Bruine'] : c <= 67 ? [picMeteo('pluie'), 'Pluie'] : c <= 77 ? [picMeteo('neige'), 'Neige'] : c <= 82 ? [picMeteo('pluie'), 'Averses'] : c <= 86 ? [picMeteo('neige'), 'Averses de neige'] : [picMeteo('orage'), 'Orage'];
const beaufort = kn => [1, 4, 7, 11, 17, 22, 28, 34, 41, 48, 56, 64].findIndex(s => kn < s) === -1 ? 12 : [1, 4, 7, 11, 17, 22, 28, 34, 41, 48, 56, 64].findIndex(s => kn < s);
let meteoEnCours = false;

async function telechargerMeteo() {
  if (!pos) { demarrerGps(); return popup('<h2>Position inconnue</h2><p>Active le GPS : la météo est téléchargée pour l\'endroit où tu es.</p>'); }
  if (!navigator.onLine) return popup('<h2>Pas de réseau</h2><p>La météo ne se met pas à jour hors connexion : il faut du réseau (wifi ou 4G/5G). Pense à la mettre à jour avant le départ ; ensuite, elle reste lisible hors ligne pendant 7 jours.</p>');
  if (meteoEnCours) return; meteoEnCours = true; $('#btnMeteo').textContent = 'Téléchargement…';
  const [la, lo] = ici().map(v => v.toFixed(2)); // ~1 km : suffisant pour la météo, ne partage pas la position exacte
  try {
    const f = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&hourly=temperature_2m,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,pressure_msl,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant&wind_speed_unit=kn&timezone=auto&forecast_days=7`).then(r => r.json());
    const m = await fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${la}&longitude=${lo}&hourly=wave_height,wave_period,sea_surface_temperature&timezone=auto&forecast_days=7`).then(r => r.ok ? r.json() : null).catch(() => null);
    if (!f.hourly) throw new Error(f.reason || 'réponse vide');
    S.meteo = { t: Date.now(), lat: +la, lon: +lo, h: f.hourly, d: f.daily, m: m?.hourly?.wave_height?.some(v => v != null) ? m.hourly : null };
    save(); afficherMeteo();
  } catch (e) { popup(`<h2>Météo indisponible</h2><p>${esc(e.message || e)}</p>`); }
  meteoEnCours = false; $('#btnMeteo').textContent = 'Mettre à jour la météo';
}
$('#btnMeteo').onclick = telechargerMeteo;
function meteoAuto() {
  if (!navigator.onLine || meteoEnCours) return;
  const M = S.meteo;
  if (!M || Date.now() - M.t > 3 * 3600e3 || distance([M.lat, M.lon], ici()) > 30000) telechargerMeteo();
}

function indexHeure(M) { // heure de prévision la plus proche de maintenant
  const now = Date.now();
  let best = 0, bd = Infinity;
  M.h.time.forEach((t, i) => { const d = Math.abs(new Date(t).getTime() - now); if (d < bd) { bd = d; best = i; } });
  return bd > 3 * 3600e3 ? -1 : best;
}
function alertesMeteo(M, i, heures = 12) {
  const a = [], fin = Math.min(M.h.time.length, i + heures);
  const raf = Math.max(...M.h.wind_gusts_10m.slice(i, fin)), vent = Math.max(...M.h.wind_speed_10m.slice(i, fin));
  const orage = M.h.weather_code.slice(i, fin).findIndex(c => c >= 95);
  if (orage >= 0) a.push(t('Orage prévu {q}', { q: orage === 0 ? t('maintenant') : t('dans {n} h', { n: orage }) }));
  if (raf >= 34 || vent >= 34) a.push(t('Coup de vent : rafales jusqu\'à {n} nœuds dans les {h} h', { n: Math.round(raf), h: heures }));
  else if (vent >= 22) a.push(t('Vent frais (force {f}) dans les {h} h : prudence en mer et en crête', { f: beaufort(vent), h: heures }));
  const p = M.h.pressure_msl, d3 = p[Math.min(i + 3, p.length - 1)] - p[i];
  if (d3 <= -3) a.push(t('↘ La pression va chuter de {n} hPa en 3 h : dégradation rapide', { n: Math.abs(d3).toFixed(0) }));
  return a;
}
function afficherMeteo() {
  const M = S.meteo; if (!M) return;
  const age = Date.now() - M.t, i = indexHeure(M);
  $('#meteoAge').textContent = t('Téléchargée il y a {d}', { d: duree(age) });
  $('#btnMeteo').textContent = 'Mettre à jour la météo';
  if (i < 0) { $('#meteoNow').innerHTML = '<p class="meta" style="margin:0">Prévisions trop anciennes : mets-les à jour dès que tu as du réseau.</p>'; $('#meteoJours').innerHTML = ''; $('#meteoAlerte').innerHTML = ''; return; }
  const h = M.h, [ico, lib] = WMO(h.weather_code[i]), vent = h.wind_speed_10m[i];
  const sol = sunTimes(new Date(), M.lat, M.lon), nuit = sol.rise && (Date.now() < sol.rise || Date.now() > sol.set), c = h.weather_code[i];
  $('#meteoCarte').className = 'carte meteo ' + (c >= 95 ? 'orage' : nuit ? 'nuit' : c >= 3 ? 'gris' : 'jour');
  const tend = h.pressure_msl[Math.min(i + 6, h.pressure_msl.length - 1)] - h.pressure_msl[i];
  const chips = [
    picMeteo('vent') + t('Vent {v} nd du {c} · force {f}', { v: Math.round(vent), c: cardinal(h.wind_direction_10m[i]), f: beaufort(vent) }),
    picMeteo('vent') + t('Rafales {n} nd', { n: Math.round(h.wind_gusts_10m[i]) }),
    `${Math.round(h.pressure_msl[i])} hPa ${tend > 1 ? '↗' : tend < -1 ? '↘' : '→'}`,
    picMeteo('pluie') + t('Pluie {n} %', { n: h.precipitation_probability[i] ?? 0 }),
  ];
  if (M.m) {
    const j = M.m.time.indexOf(h.time[i]);
    if (j >= 0 && M.m.wave_height[j] != null) chips.push(`Vagues ${M.m.wave_height[j].toFixed(1).replace('.', ',')} m · ${Math.round(M.m.wave_period[j])} s`, `Eau ${Math.round(M.m.sea_surface_temperature[j])} °C`);
  }
  $('#meteoNow').innerHTML = `<span class="ico">${ico}</span><span class="temp">${Math.round(h.temperature_2m[i])}°</span><span class="det">${lib}</span>
    <div class="meteo-chips">${chips.map(c => `<span>${c}</span>`).join('')}</div>`;
  const al = alertesMeteo(M, i);
  $('#meteoAlerte').innerHTML = al.map(x => `<div class="meteo-alerte">${x}</div>`).join('');
  const d = M.d;
  $('#meteoJours').innerHTML = d.time.map((jr, k) => {
    const jour = k === 0 ? t('auj.') : new Date(jr + 'T12:00').toLocaleDateString(LOC, { weekday: 'short' });
    const [icoJour, condition] = WMO(d.weather_code[k]);
    const icone = icoJour ? `<span role="img" aria-label="${esc(t(condition))}">${icoJour}</span>` : '';
    return `<div><b>${jour}</b><i>${icone}</i>
      ${Math.round(d.temperature_2m_max[k])}° / ${Math.round(d.temperature_2m_min[k])}°<br>
      <span class="meteo-vitesse">${Math.round(d.wind_speed_10m_max[k])} ${t('nd')}</span></div>`;
  }).join('');
  $('#merBft').textContent = beaufort(vent);
}
afficherMeteo(); setInterval(afficherMeteo, 10 * 60e3);
addEventListener('online', () => pos && meteoAuto());

// ---------- Mer : vitesse, cap, homme à la mer, ports ----------
const fmtMilles = m => `${(m / 1852).toFixed(m < 18520 ? 1 : 0).replace('.', ',')} M`;
let fixPrec = null;
function majMer() {
  if (!pos) return;
  const now = Date.now(), here = ici();
  let sog = pos.coords.speed, cog = pos.coords.heading;
  if (fixPrec && now - fixPrec.t > 3000 && (sog == null || cog == null || isNaN(cog))) {
    const d = distance(fixPrec.ll, here);
    sog = d / ((now - fixPrec.t) / 1000); cog = d > 5 ? bearing(fixPrec.ll, here) : null;
  }
  if (!fixPrec || now - fixPrec.t > 3000) fixPrec = { t: now, ll: here };
  if (sog != null) $('#merSog').textContent = (sog * 1.94384).toFixed(1).replace('.', ',');
  $('#merCog').textContent = cog != null && !isNaN(cog) && sog > 0.3 ? Math.round(cog) + '°' : '—';
  if (S.profil === 'mer' && POINTS.length) {
    const [p] = nearest(POINTS.filter(x => x[0] === 'port'), here, 1, x => [x[2], x[3]]);
    const [s] = nearest(POINTS.filter(x => x[0] === 'snsm'), here, 1, x => [x[2], x[3]]);
    $('#merPort').innerHTML = [p && `${pic('ancre')} Abri le plus proche : <b>${esc(p.p[1])}</b> · ${fmtMilles(p.d)} au ${Math.round(p.cap)}°`, s && `${pic('bouee')} Sauvetage SNSM : ${esc(s.p[1])} · ${fmtMilles(s.d)}`].filter(Boolean).join('<br>');
  }
}

function hommeALaMer() {
  if (!pos) { demarrerGps(); return popup('<h2>Position en cours</h2><p>Le GPS cherche ta position. Réappuie dans quelques secondes. En attendant : crie « Un homme à la mer ! », lance une bouée, ne le quitte pas des yeux.</p>'); }
  const h = new Date().toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' });
  const p = { id: Date.now().toString(36), nom: `Homme à la mer ${h}`, lat: ici()[0], lon: ici()[1], t: Date.now() };
  S.points.unshift(p); S.cible = p.id; save(); majPoints(); majBoussole();
  navigator.vibrate?.([300, 100, 300, 100, 300]);
  ouvrir('boussole');
  popup(`<div class="k">Position enregistrée à ${h}</div><h2>Homme à la mer</h2>
    <p class="coords xl" style="font-size:22px">${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</p>
    <ol><li>Quelqu'un le <b>montre du doigt</b> sans le quitter des yeux.</li><li><b>Lance</b> une bouée.</li>
    <li><b>VHF canal 16 : MAYDAY</b>, ou bouton rouge ASN.</li><li>La flèche verte de la boussole te ramène au point.</li></ol>
    <div class="grille2" style="margin:0"><a class="btn primaire" href="tel:196" style="margin:0">Appeler le CROSS 196</a><button class="btn" style="margin:0" data-ouvre-fiche="mayday">Message MAYDAY</button></div>`);
}
document.addEventListener('click', e => {
  if (e.target.closest('[data-hom]')) hommeALaMer();
  const f = e.target.closest('[data-ouvre-fiche]'); if (f) ouvrirFiche(f.dataset.ouvreFiche);
});

// ---------- Boussole ----------
const DECLINAISON = 2; // ponytail: déclinaison magnétique moyenne en France (~+1° à +3° E en 2026), à ajuster par région
function construireRose() {
  const rose = $('#rose');
  rose.innerHTML = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'].map((l, i) => {
    const a = i * 45 * Math.PI / 180, r = i % 2 ? 31 : 32;
    return `<span class="${l === 'N' ? 'n' : ''}${i % 2 ? ' inter' : ''}" style="left:${50 + r * Math.sin(a)}%;top:${50 - r * Math.cos(a)}%;transform:translate(-50%,-50%) rotate(${i * 45}deg)">${l}</span>`;
  }).join('');
}
construireRose();

async function demarrerCompas() {
  try { if (typeof DeviceOrientationEvent?.requestPermission === 'function' && await DeviceOrientationEvent.requestPermission() !== 'granted') throw 0; } catch { compasMuet = true; majDevant(); return popup('<h2>Boussole refusée</h2><p>Autorise l\'accès aux capteurs de mouvement pour utiliser la boussole.</p>'); }
  const onOri = e => {
    let h = e.webkitCompassHeading ?? (e.absolute && e.alpha != null ? 360 - e.alpha : null);
    if (h == null) return;
    heading = (h + DECLINAISON + 360) % 360;
    majBoussole();
  };
  addEventListener('deviceorientationabsolute', onOri);
  addEventListener('deviceorientation', onOri);
  $('#btnCompas').hidden = true;
  setTimeout(() => { if (heading == null) { compasMuet = true; majDevant(); $('#cibleInfo').textContent = 'Pas de capteur de boussole sur cet appareil. Les flèches pointent avec le nord en haut.'; } }, 3000);
}
$('#btnCompas').onclick = demarrerCompas;

let rafCompas = 0;
function majBoussole() {
  cancelAnimationFrame(rafCompas);
  rafCompas = requestAnimationFrame(() => {
    if (heading != null) {
      $('#capNum').textContent = Math.round(heading) + '°'; $('#capCard').textContent = cardinal(heading);
      $('#rose').style.transform = `rotate(${-heading}deg)`;
      $$('[data-cap]').forEach(el => rot(el, +el.dataset.cap));
      if (pos) dessinerRadar(ici());
      majDevant();
    }
    const c = S.points.find(p => p.id === S.cible), f = $('#cibleFleche');
    if (c && pos) {
      const d = distance(ici(), [c.lat, c.lon]), cap = bearing(ici(), [c.lat, c.lon]);
      f.hidden = false; f.style.transform = `rotate(${cap - (heading ?? 0)}deg)`;
      $('#cibleInfo').innerHTML = `<b>${esc(c.nom)}</b> · ${fmtDist(d)} · ${cardinal(cap)} (${Math.round(cap)}°)${d < 30 ? ' · Tu y es !' : ''}`;
    } else f.hidden = true;
  });
}

function majPoints() {
  $('#mesPoints').innerHTML = S.points.map(p => `<li data-id="${p.id}" class="${p.id === S.cible ? 'sel' : ''}"><span><b>${esc(p.nom)}</b><br><small class="meta">${p.lat.toFixed(4)}, ${p.lon.toFixed(4)} · ${new Date(p.t).toLocaleString(LOC, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></span><button data-suppr="${p.id}" aria-label="Supprimer">×</button></li>`).join('')
    || '<li class="meta" style="cursor:default">Marque ton camp, ta voiture ou une source pour pouvoir y revenir.</li>';
  // Moi › Mon point de retour : le point choisi (ou le dernier marqué)
  const p = S.points.find(x => x.id === S.cible) || S.points[0];
  $('#retourInfo').textContent = p ? t('Point de retour : {n}, marqué le {d}.', { n: p.nom, d: new Date(p.t).toLocaleString(LOC, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })
    : t('Marque ton camp, ta voiture ou une source : la boussole t\'y ramènera, même sans réseau.');
  $('#btnRevenir').disabled = !p;
}
$('#btnMarquerMoi').onclick = () => {
  if (pos) return $('#btnMarquer').click();
  if (!watchId) demarrerGps();
  $('#retourInfo').textContent = t('Recherche du GPS… touche à nouveau « Marquer ce point » dans quelques secondes.');
};
// Revenir : la boussole pointe vers le point (sans réseau), avec la distance
$('#btnRevenir').onclick = () => {
  const p = S.points.find(x => x.id === S.cible) || S.points[0]; if (!p) return;
  S.cible = p.id; save(); majPoints(); majBoussole(); if (!watchId) demarrerGps(); ouvrir('boussole');
};
$('#mesPoints').onclick = e => {
  const sup = e.target.dataset.suppr;
  if (sup) { S.points = S.points.filter(p => p.id !== sup); if (S.cible === sup) S.cible = null; }
  else { const li = e.target.closest('li[data-id]'); if (!li) return; S.cible = S.cible === li.dataset.id ? null : li.dataset.id; }
  save(); majPoints(); majBoussole();
};
$('#btnMarquer').onclick = () => {
  if (!pos) return popup('<h2>Position inconnue</h2><p>Active d\'abord le GPS dans l\'onglet Situation.</p>');
  const nom = prompt('Nom de ce point', S.points.length ? 'Point ' + (S.points.length + 1) : 'Camp');
  if (nom === null) return;
  const p = { id: Date.now().toString(36), nom: nom || 'Point', lat: ici()[0], lon: ici()[1], t: Date.now() };
  S.points.unshift(p); S.cible = p.id; save(); majPoints(); majBoussole();
};
majPoints();

// ---------- Parcours ----------
let enreg = false;
$('#btnTrace').onclick = () => {
  enreg = !enreg;
  if (enreg && !watchId) demarrerGps();
  if (enreg && S.trace.length && confirm('Effacer le parcours précédent ?')) S.trace = [];
  $('#btnTrace').textContent = enreg ? 'Arrêter' : 'Enregistrer';
  $('#btnTrace').classList.toggle('primaire', enreg);
  save();
};
function enregistrerTrace() {
  if (!enreg) return;
  const here = ici(), last = S.trace.at(-1);
  if (pos.coords.accuracy > 60) return;
  if (!last || distance([last[0], last[1]], here) > 15) { S.trace.push([+here[0].toFixed(6), +here[1].toFixed(6), Date.now()]); save(); majTrace(); }
}
function majTrace() {
  majTraceCarte();
  const t = S.trace;
  let d = 0; for (let i = 1; i < t.length; i++) d += distance(t[i - 1], t[i]);
  $('#traceDist').textContent = fmtDist(d); $('#tracePts').textContent = t.length;
  $('#traceDuree').textContent = t.length > 1 ? duree(t.at(-1)[2] - t[0][2]) : '0 min';
  if (t.length < 2) return $('#traceSvg').innerHTML = '<text x="150" y="84" text-anchor="middle" fill="currentColor" style="fill:var(--txt3);font-size:12px">Ton parcours s\'affichera ici</text>';
  const las = t.map(p => p[0]), los = t.map(p => p[1]);
  const [a, b, c, e] = [Math.min(...las), Math.max(...las), Math.min(...los), Math.max(...los)];
  const kx = Math.cos(a * Math.PI / 180), sc = 140 / Math.max((b - a) || 1e-5, ((e - c) * kx) || 1e-5);
  const P = t.map(p => [150 + ((p[1] - (c + e) / 2) * kx) * sc, 80 - (p[0] - (a + b) / 2) * sc]);
  $('#traceSvg').innerHTML = `<polyline points="${P.map(p => p.join(',')).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${P[0][0]}" cy="${P[0][1]}" r="5" fill="var(--ok)"/><circle cx="${P.at(-1)[0]}" cy="${P.at(-1)[1]}" r="6" fill="var(--accent)" stroke="var(--bg)" stroke-width="2"/>`;
}

// ---------- Carte et itinéraire ----------
// MapLibre + tuiles vectorielles OpenFreeMap (gratuites, sans clé) : vue du dessus (2D) ou 3D avec relief et bâtiments.
// Altitudes : AWS Terrain Tiles (Mapzen). Les morceaux de carte vus ou téléchargés restent dans le téléphone (voir sw.js).
// Itinéraire : serveurs OSRM publics de FOSSGIS (à pied, vélo, voiture). Il faut du réseau pour le calculer,
// ensuite il est gardé dans le téléphone et la boussole peut prendre le relais en ligne droite.
const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
// Styles de carte (demande d'Aziz : la carte claire éblouit) : mêmes morceaux, polices et pictos chez OpenFreeMap, donc la carte téléchargée marche avec tous
const STYLES = [['auto', 'Auto'], ['liberty', 'Clair'], ['positron', 'Doux'], ['dark', 'Sombre'], ['fiord', 'Nuit']];
const styleCarte = () => STYLES.find(x => x[0] === S.styleCarte) || STYLES[0];
const nomStyle = () => styleCarte()[0] === 'auto' ? (document.documentElement.dataset.theme === 'nuit' ? 'dark' : 'liberty') : styleCarte()[0]; // Auto : carte sombre la nuit, comme Waze
const urlStyle = () => `https://tiles.openfreemap.org/styles/${nomStyle()}`;
const DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const MODES = { foot: ['routed-foot', t('à pied')], bike: ['routed-bike', t('à vélo')], car: ['routed-car', t('en voiture')] };
let plan = null, moiMk = null, destMk = null, suivre = true, en3D = false, carteManipulee = false;
const ptsMk = new Map();
const modeParDefaut = profil => profil === 'velo' ? 'bike' : 'car';
let destination = S.route?.dest || null, modeIti = S.route?.mode || modeParDefaut(S.profil);
const carteVisible = () => $('#v-carte').classList.contains('active');
let largeurPlan = 0, hauteurPlan = 0;
function redimensionnerPlan() {
  if (!plan || !carteVisible()) return;
  const { clientWidth, clientHeight } = plan.getContainer();
  if (!clientWidth || !clientHeight || (largeurPlan === clientWidth && hauteurPlan === clientHeight)) return;
  largeurPlan = clientWidth; hauteurPlan = clientHeight;
  plan.resize();
}
const lnglat = ([la, lo]) => [lo, la];
const traceGeoJSON = () => ({ type: 'FeatureCollection', features: S.traceCarte && S.trace.length > 1
  ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: S.trace.map(lnglat) } }] : [] });
function majTraceCarte() {
  plan?.getSource('trace-personnelle')?.setData(traceGeoJSON());
}
majTrace();
const couchesLieux = ['poi_r1', 'poi_r7', 'poi_r20'];
function majLieuxCarte() {
  couchesLieux.forEach(id => {
    if (plan?.getLayer(id)) plan.setLayoutProperty(id, 'visibility', S.lieuxCarte === false ? 'none' : 'visible');
  });
}
let textesCarte = [];
function majLangueCarte() {
  const langue = S.langueCarte;
  for (const { id, texte } of textesCarte) {
    if (!plan?.getLayer(id) || !/"(?:name|name_en|name:latin)"/.test(JSON.stringify(texte))) continue;
    const nomLocal = ['get', 'name'];
    const traduction = langue === 'local' ? nomLocal
      : ['coalesce', ['get', 'name:' + langue], ['get', 'name_' + langue], nomLocal];
    plan.setLayoutProperty(id, 'text-field', langue ? ['coalesce', traduction, texte] : texte);
  }
}
function majPoliceCarte() {
  const facteur = S.tailleCarte || 1;
  const agrandir = base => typeof base === 'number' ? base * facteur : ['*', base, facteur];
  for (const { id, taille: base } of textesCarte) {
    if (!plan?.getLayer(id)) continue;
    let valeur = base;
    if (facteur !== 1) {
      if (Array.isArray(base) && (base[0] === 'interpolate' || base[0] === 'step')) {
        const premier = base[0] === 'step' ? 2 : 4;
        valeur = base.map((val, i) => i >= premier && (i - premier) % 2 === 0 ? agrandir(val) : val);
      } else valeur = agrandir(base);
    }
    plan.setLayoutProperty(id, 'text-size', valeur);
  }
}
// Itinéraires : le choisi en violet foncé, les autres en violet clair (cachés pendant le guidage)
const geoRoute = R => ({ type: 'FeatureCollection', features: !R ? [] : (guidage || !R.alts ? [{ geo: R.geo, i: R.choix || 0 }] : R.alts.map((a, i) => ({ geo: a.geo, i })))
  .map(a => ({ type: 'Feature', properties: { i: a.i, sel: a.i === (R.choix || 0) }, geometry: { type: 'LineString', coordinates: a.geo.map(lnglat) } })) });
function marqueur(ll, cls, html = '', anchor = 'center') {
  const el = document.createElement('div'); el.className = cls; el.innerHTML = html;
  return new maplibregl.Marker({ element: el, anchor }).setLngLat(lnglat(ll)).addTo(plan);
}
const marqueurDest = ll => marqueur(ll, 'plan-cible', '<div class="plan-dest-arrivee"></div>');

function initPlan() {
  if (!carteVisible()) return;
  if (!window.maplibregl) return $('#itiRes').textContent = 'La carte n\'a pas pu se charger.';
  if (plan) { redimensionnerPlan(); majMoiPlan(); majPointsPlan(); return; }
  try {
    plan = new maplibregl.Map({ container: 'plan', style: urlStyle(), center: pos ? lnglat(ici()) : [2.4, 46.6], zoom: pos ? 14 : 5, maxPitch: 60, attributionControl: { compact: true },
      trackResize: !window.ResizeObserver,
      // Carte dans la page : un doigt fait défiler la page, deux doigts bougent la carte (en plein écran : un doigt suffit)
      cooperativeGestures: !$('.plan-wrap').classList.contains('plein'), locale: { 'CooperativeGesturesHandler.MobileHelpText': 'Deux doigts pour bouger la carte · un doigt pour faire défiler', 'CooperativeGesturesHandler.WindowsHelpText': 'Ctrl + molette pour zoomer', 'CooperativeGesturesHandler.MacHelpText': '⌘ + molette pour zoomer' } }); // 60° au plus : au-delà on voit le ciel en haut de l’écran (Aziz veut la carte sur tout l’écran)
  } catch {
    // Vu le 17/11 : Chrome met sur liste noire les cartes graphiques des vieux Mac (Iris Pro, GT 750M) ; Safari, lui, affiche la carte
    $('.plan-btns').hidden = true;
    return $('#plan').innerHTML = `<div class="meta" style="padding:24px;line-height:1.5"><b style="color:var(--txt)">Ce navigateur refuse d'afficher la carte</b><br>
      Il a coupé le WebGL, souvent sur les ordinateurs anciens. Ouvre T’es où ? dans <b>Safari</b> ou sur ton téléphone : la carte s'y affiche.<br><br>
      Dans Chrome, tu peux essayer : tape <code>chrome://flags/#ignore-gpu-blocklist</code> dans la barre d'adresse, choisis « Enabled », puis relance Chrome.<br><br>
      La boussole et l'itinéraire restent disponibles ici.</div>`;
  }
  plan.on('style.load', () => { // à chaque style : on remet relief, itinéraire et réglages
    // Carte épurée (demande d'Aziz) : pas de bâtiments ni d'arrêts de transport ; seuls points affichés : essence, hôtels,
    // restaurants, hôpitaux (la classe « hospital » d'OpenMapTiles comprend les cliniques)
    // Ciel peint (sinon transparent = bande grise au-dessus de l'horizon en vue inclinée) : la carte remplit tout l'écran
    const sombre = ['dark', 'fiord'].includes(nomStyle());
    plan.setSky(sombre ? { 'sky-color': '#0B1220', 'horizon-color': '#1C2533', 'fog-color': '#1C2533', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.5, 'fog-ground-blend': 0.6 }
      : { 'sky-color': '#DCEAF5', 'horizon-color': '#EEF3F6', 'fog-color': '#F2EFE9', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.5, 'fog-ground-blend': 0.6 });
    // Fond plus clair et eau plus bleue, façon GPS de voiture (2D comme 3D), seulement sur le style clair
    if (nomStyle() === 'liberty') plan.getLayer('background') && plan.setPaintProperty('background', 'background-color', '#F4F2EE');
    if (nomStyle() === 'liberty') plan.getLayer('water') && plan.setPaintProperty('water', 'fill-color', '#9DCFF2');
    ['building', 'building-3d', 'poi_transit'].forEach(id => plan.getLayer(id) && plan.setLayoutProperty(id, 'visibility', 'none'));
    couchesLieux.forEach(id => {
      if (!plan.getLayer(id)) return;
      const filtre = ['match', ['get', 'class'], ['fuel', 'lodging', 'restaurant', 'fast_food', 'hospital'], true, false];
      const existant = plan.getFilter(id);
      plan.setFilter(id, existant ? ['all', existant, filtre] : filtre);
      plan.setLayerZoomRange(id, 13, 24); // ils sont peu nombreux : on peut les montrer plus tôt
    });
    majLieuxCarte();
    const couchesFond = plan.getStyle().layers;
    textesCarte = couchesFond.filter(c => c.type === 'symbol' && c.layout?.['text-field'])
      .map(c => ({ id: c.id, texte: c.layout['text-field'], taille: c.layout['text-size'] ?? 16 }));
    const avantRoutes = plan.getLayer('aeroway_fill') ? 'aeroway_fill' : couchesFond.find(c => c.type === 'line' || c.type === 'symbol')?.id;
    if (S.tailleCarte && S.tailleCarte !== 1) majPoliceCarte();
    if (S.langueCarte) majLangueCarte();
    const src = { type: 'raster-dem', tiles: [DEM], encoding: 'terrarium', tileSize: 256, maxzoom: 12 };
    plan.addSource('dem', { ...src, attribution: 'Relief © Mapzen, AWS Terrain Tiles' });
    plan.addSource('dem-ombre', src); // MapLibre conseille une source à part pour l'ombrage
    plan.addLayer({ id: 'ombrage', type: 'hillshade', source: 'dem-ombre', layout: { visibility: S.relief === false ? 'none' : 'visible' }, paint: { 'hillshade-exaggeration': .35 } }, avantRoutes);
    plan.addSource('trace-personnelle', { type: 'geojson', data: traceGeoJSON() });
    plan.addLayer({ id: 'trace-personnelle', type: 'line', source: 'trace-personnelle', layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#17A8AF', 'line-width': 4, 'line-dasharray': [2, 1] } });
    plan.addSource('route', { type: 'geojson', data: geoRoute(null) });
    const rond = { 'line-cap': 'round', 'line-join': 'round' }, largeur = (a, b) => ['interpolate', ['linear'], ['zoom'], 8, a, 16, b];
    plan.addLayer({ id: 'route-alt', type: 'line', source: 'route', filter: ['!=', ['get', 'sel'], true], layout: rond, paint: { 'line-color': '#C3A6F7', 'line-width': largeur(5, 10) } });
    plan.addLayer({ id: 'route-bord', type: 'line', source: 'route', filter: ['==', ['get', 'sel'], true], layout: rond, paint: { 'line-color': '#3B0E9E', 'line-width': largeur(8, 15) } });
    plan.addLayer({ id: 'route', type: 'line', source: 'route', filter: ['==', ['get', 'sel'], true], layout: rond, paint: { 'line-color': '#7B2FF7', 'line-width': largeur(5, 10) } });
    if (S.route) dessinerRoute(S.route, false);
    if (en3D) vue3D(true);
  });
  plan.on('error', e => console.warn('carte', e.error?.message)); // hors ligne : morceaux manquants, la carte reste utilisable
  plan.on('click', e => {
    if (guidage || e.originalEvent.target.closest?.('.maplibregl-marker')) return;
    const { x, y } = e.point, alt = plan.getLayer('route-alt') && plan.queryRenderedFeatures([[x - 10, y - 10], [x + 10, y + 10]], { layers: ['route-alt'] })[0];
    if (alt) return choisirIti(alt.properties.i); // toucher un autre itinéraire le choisit, comme dans les GPS
    const ll = [e.lngLat.lat, e.lngLat.lng], [v] = COMMUNES.length ? nearest(COMMUNES, ll) : [];
    choisirDest(ll, v ? t('Près de {v}', { v: `${v.p[0]} (${v.p[4]})` }) : t('Point sur la carte'));
  });
  plan.on('movestart', e => {
    if (e.originalEvent) { suivre = false; carteManipulee = true; }
  });
  plan.on('moveend', programmerPointsPlan);
  plan.on('resize', () => {
    if (!$('.plan-wrap').classList.contains('plein')) return;
    if (guidage && suivre) plan.setPadding(margeGuidage());
    else if (S.route && !carteManipulee && !$('#itiChoix').hidden) cadrerRoute(S.route);
  });
  if (window.ResizeObserver) new ResizeObserver(redimensionnerPlan).observe(plan.getContainer());
  majMoiPlan(); majPointsPlan(); majModes(); majRelief(); majZones();
}
$('#btnStyle').textContent = t(styleCarte()[1]);
function changerStyleCarte(style) {
  S.styleCarte = style; save();
  $('#btnStyle').textContent = t(styleCarte()[1]); plan?.setStyle(urlStyle());
}
$('#btnStyle').onclick = () => changerStyleCarte(STYLES[(STYLES.indexOf(styleCarte()) + 1) % STYLES.length][0]);
function pleinEcranCarte(actif) {
  const wrap = $('.plan-wrap'), bouton = $('#btnPlein');
  if (wrap.classList.contains('plein') === actif) return;
  wrap.classList.toggle('plein', actif);
  document.documentElement.classList.toggle('carte-plein-ecran', actif);
  bouton.textContent = actif ? '✕' : '⤢';
  bouton.setAttribute('aria-label', t(actif ? 'Quitter le plein écran' : 'Carte en plein écran'));
  bouton.setAttribute('aria-pressed', actif);
  if (actif) plan?.cooperativeGestures.disable();
  else plan?.cooperativeGestures.enable();
  redimensionnerPlan();
}
$('#btnPlein').onclick = () => {
  if (guidage) return;
  const actif = !$('.plan-wrap').classList.contains('plein');
  if (!actif) fermerChoixIti();
  pleinEcranCarte(actif);
};
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('dialog[open]') || !$('.plan-wrap').classList.contains('plein')) return;
  if (guidage) arreterGuidage();
  else $('#btnPlein').click();
});
$('#planSuite').onclick = () => $('#planSuite').nextElementSibling.scrollIntoView({ behavior: 'smooth', block: 'start' });
// 2D = vue du dessus (à vol d'oiseau) ; 3D = carte inclinée avec le relief en volume et les bâtiments
function vue3D(on) {
  en3D = on; $('#btn3D').textContent = on ? '2D' : '3D'; $('#btn3D').classList.toggle('on', on);
  if (!plan?.getSource('dem')) return;
  if (!on) { plan.setTerrain(null); return guidage || plan.easeTo({ pitch: 0, bearing: 0 }); }
  // Relief d'abord, inclinaison ensuite : sinon la caméra reste à l'altitude 0, « sous » la montagne, le temps que les altitudes arrivent
  plan.setTerrain({ source: 'dem', exaggeration: 1.8 });
  // ponytail: 3D ouverte au zoom 11 à 13,5 : plus près, beaucoup de morceaux à dessiner (testé seulement en rendu logiciel, à vérifier sur téléphone)
  plan.once('idle', () => en3D && !guidage && plan.easeTo({ pitch: 60, zoom: Math.min(Math.max(plan.getZoom(), 11), 14) }));
}
$('#btn3D').onclick = () => vue3D(!en3D);
function majRelief() {
  $('#btnRelief').classList.toggle('on', S.relief !== false);
  if (plan?.getLayer('ombrage')) plan.setLayoutProperty('ombrage', 'visibility', S.relief === false ? 'none' : 'visible');
}
$('#btnRelief').onclick = () => { S.relief = S.relief === false; save(); majRelief(); };
$('#btnCentrer').onclick = () => { suivre = true; if (!pos) return demarrerGps(); if (guidage) return cadrerGuidage(); plan?.easeTo({ center: lnglat(ici()), zoom: Math.max(plan.getZoom(), 15) }); };

function majMoiPlan() {
  if (!plan || !pos) return;
  if (guidage) return majGuidage();
  if (!carteVisible()) return;
  const position = ici();
  if (!moiMk) moiMk = marqueur(position, 'plan-moi'); else moiMk.setLngLat(lnglat(position));
  if (suivre && !S.route) {
    const { lng, lat } = plan.getCenter(), zoom = plan.getZoom();
    if (zoom < 14 || distance([lat, lng], position) > 2) plan.easeTo({ center: lnglat(position), zoom: Math.max(zoom, 14) });
  }
}

// ---------- Guidage façon GPS de voiture ----------
// Flèche couchée sur la route, caméra inclinée qui suit avec la route vers le haut, prochaine consigne dans un bandeau.
const heureTrajet = new Intl.DateTimeFormat(LOC, { hour: '2-digit', minute: '2-digit' });
const dateTrajet = new Intl.DateTimeFormat(LOC, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
let departGuidage = null, resteGuidage = null;
function majHoraires() {
  const R = S.route;
  $('#itiHoraires').hidden = !R || !Number.isFinite(R.t) || !$('#planCalcul').hidden;
  if ($('#itiHoraires').hidden) return;
  const maintenant = Date.now(), depart = new Date(departGuidage ?? maintenant);
  const arrivee = new Date(maintenant + (resteGuidage ?? R.t) * 1000);
  const formateur = depart.toDateString() === arrivee.toDateString() ? heureTrajet : dateTrajet;
  for (const [el, date] of [[$('#itiDepart'), depart], [$('#itiArrivee'), arrivee]]) {
    el.dateTime = date.toISOString();
    const texte = formateur.format(date);
    if (texte !== el.textContent) el.textContent = texte;
  }
}
setInterval(majHoraires, 30000);

let guidage = false, navMk = null, cumul = [], cumulPour = null, idxEtapes = [], dernierI = 0;
// Caméra du guidage : inclinée, route vers le haut ; ensuite elle suit la flèche image par image (boucleNav)
const margeGuidage = () => ({ top: Math.round(plan.getContainer().clientHeight * .45), bottom: 0, left: 0, right: 0 });
function cadrerGuidage() {
  suivre = true;
  plan.easeTo({ center: lnglat(affiche?.ll || ici()), bearing: affiche?.cap ?? plan.getBearing(), pitch: 58, zoom: 17, duration: 800,
    padding: margeGuidage() });
}
function demarrerGuidage() {
  initPlan();
  if (!plan || !pos || !S.route?.geo?.length || guidage) return;
  guidage = true; departGuidage = Date.now(); resteGuidage = null; suivre = true; moiMk?.remove(); moiMk = null; anim = affiche = null;
  const el = document.createElement('div'); el.className = 'plan-nav';
  el.innerHTML = '<svg viewBox="0 0 40 40"><path d="M20 3 L35 35 L20 27 L5 35Z"/></svg>';
  navMk = new maplibregl.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat(lnglat(ici())).addTo(plan);
  $('#navBandeau').hidden = false; $('#itiChoix').hidden = true; $('#btnPlein').hidden = true; // pendant le guidage : toujours plein écran, on arrête avec la croix du bandeau vert
  pleinEcranCarte(true); afficherCalculCarte('');
  voixEtape = { depart: true }; horsRoute = false; dire(t('C\'est parti vers {n}.', { n: S.route.dest.nom }), true);
  dessinerRoute(S.route, false); majGuidage();
  if (guidage) cadrerGuidage();
}
function arreterGuidage(msg) {
  if (!msg) stopperVoix();
  guidage = false; departGuidage = resteGuidage = null; navMk?.remove(); navMk = null; anim = affiche = null; cancelAnimationFrame(rafNav); rafNav = 0;
  $('#navBandeau').hidden = true; $('#btnPlein').hidden = false; if (S.route) dessinerRoute(S.route, false);
  pleinEcranCarte(false);
  plan?.easeTo({ pitch: en3D ? 60 : 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 } });
  majMoiPlan(); if (msg) { $('#itiRes').textContent = msg; afficherCalculCarte(msg); }
}
// Une fois par itinéraire : distances cumulées et place de chaque manœuvre sur le tracé
// (avant, recalculé à chaque position GPS : très lourd sur un long trajet, d'où les saccades)
function preparerRoute(R) {
  if (R.geo === cumulPour) return;
  cumulPour = R.geo; dernierI = 0; cumul = [0];
  for (let i = 1; i < R.geo.length; i++) cumul.push(cumul[i - 1] + distance(R.geo[i - 1], R.geo[i]));
  let k = 0;
  idxEtapes = (R.etapes || []).filter(e => e[2]).map(e => {
    let b = k, db = Infinity;
    for (let i = k; i < R.geo.length; i++) { const d = distance(e[2], R.geo[i]); if (d < db) { db = d; b = i; } if (db < 5) break; }
    k = b; return { t: e[0], i: b };
  });
}
// Projection d'un point sur un segment (repère plat local, suffisant à cette échelle)
const projeter = (p, a, b) => {
  const c = Math.cos(a[0] * Math.PI / 180), dx = (b[1] - a[1]) * c, dy = b[0] - a[0], L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, (((p[1] - a[1]) * c) * dx + (p[0] - a[0]) * dy) / L)) : 0;
  return [a[0] + t * dy, a[1] + t * dx / c];
};
// Point le plus proche sur le tracé (cherché autour du dernier, tout le tracé seulement si on est loin),
// puis direction de la route ~30 m plus loin (marche même à l'arrêt, sans boussole)
function suiviRoute(R, me) {
  const n = R.geo.length; let i0 = 0, dmin = Infinity;
  const scan = (a, b) => { for (let i = Math.max(0, a); i < Math.min(n, b); i++) { const d = distance(me, R.geo[i]); if (d < dmin) { dmin = d; i0 = i; } } };
  scan(dernierI - 50, dernierI + 400); if (dmin > 150) scan(0, n); dernierI = i0;
  let proj = R.geo[i0], progression = cumul[i0];
  for (const j of [i0 - 1, i0]) {
    if (j < 0 || j + 1 >= n) continue;
    const p = projeter(me, R.geo[j], R.geo[j + 1]), d = distance(me, p);
    if (d < dmin) { dmin = d; proj = p; progression = cumul[j] + distance(R.geo[j], p); }
  }
  let j = i0; while (j < n - 1 && cumul[j] < progression + 30) j++;
  return { dmin, proj, progression, cap: bearing(proj, R.geo[j]) };
}
function majGuidage() {
  const R = S.route, me = ici(); if (!R || !navMk) return;
  preparerRoute(R);
  const { progression, dmin, proj, cap: capRoute } = suiviRoute(R, me);
  // En roulant, le cap du GPS est plus fiable ; à pied ou à l'arrêt, la direction de la route
  const v = pos.coords.speed, cap = v > 2 && pos.coords.heading != null && !isNaN(pos.coords.heading) ? pos.coords.heading : capRoute;
  // Sur la route, la flèche est posée sur le tracé (comme un GPS de voiture) : elle ne tremble plus à côté
  if (carteVisible()) allerVers(dmin < 25 ? proj : me, cap);
  if (distance(me, R.dest.ll) < 30) { const a = t('Tu es arrivé : {n}.', { n: R.dest.nom }); dire(a, true); return arreterGuidage(a); }
  const total = cumul.at(-1), fin = Math.max(0, total - progression) + dmin;
  resteGuidage = total ? R.t * Math.min(1, Math.max(0, fin / total)) : R.t;
  majHoraires();
  const prochaine = idxEtapes.find(e => cumul[e.i] > progression + 2);
  const dEtape = prochaine ? cumul[prochaine.i] - progression + dmin : fin;
  $('#navConsigne').textContent = dmin > 60 ? 'Tu t\'écartes de l\'itinéraire : rejoins la ligne violette' : prochaine ? prochaine.t : 'Tout droit jusqu\'à l\'arrivée';
  $('#navDist').textContent = t('Dans {d} · arrivée à {f}', { d: fmtDist(dEtape), f: fmtDist(fin) });
  annoncer(prochaine, dEtape, dmin);
}
// Voix du guidage : une annonce « Dans 300 mètres, … » puis la consigne au moment de tourner (distances plus longues en voiture)
let voixEtape = {}, horsRoute = false;
const minuscule = t => t[0].toLowerCase() + t.slice(1);
function annoncer(prochaine, dEtape, dmin) {
  if (dmin > 60) { instructionAttente = null; if (!horsRoute) dire('Tu t\'écartes de l\'itinéraire. Rejoins la ligne violette.'); horsRoute = true; return; }
  horsRoute = false;
  if (!prochaine) return;
  const vite = (pos.coords.speed || 0) > 8, proche = vite ? 200 : 40, loin = vite ? 1500 : 300;
  if (voixEtape.i !== prochaine.i) {
    instructionAttente = null;
    voixEtape = { i: prochaine.i };
  }
  if (prochaine.t === t('Tu es arrivé') || prochaine.t === 'Tu es arrivé') { if (!voixEtape.loin && dEtape <= loin) { voixEtape.loin = true; dire(t('Arrivée dans {d}.', { d: parleDist(dEtape) }), false, true); } return; } // « Tu es arrivé » est dit une seule fois, à l'arrivée
  if (!voixEtape.proche && dEtape <= proche) { voixEtape.proche = voixEtape.loin = true; dire(prochaine.t, false, true); }
  else if (!voixEtape.loin && (dEtape <= loin || voixEtape.depart)) { voixEtape.loin = true; dire(t('Dans {d}, {c}.', { d: parleDist(dEtape), c: minuscule(prochaine.t) }), false, true); }
}
// Flèche continue : entre deux positions GPS (environ 1 par seconde), elle glisse et tourne image par image,
// et la caméra la suit au même rythme (plus de sauts)
let anim = null, affiche = null, rafNav = 0;
function allerVers(ll, cap) {
  const t = performance.now();
  if (!affiche) affiche = { ll, cap };
  anim = { de: { ...affiche }, vers: { ll, cap }, t0: t, dur: anim ? Math.min(1500, Math.max(300, t - anim.t0)) : 0 };
  if (!rafNav) rafNav = requestAnimationFrame(boucleNav);
}
function boucleNav(t) {
  rafNav = 0; if (!guidage || !anim || !navMk || !carteVisible()) return;
  const k = anim.dur ? Math.min(1, (t - anim.t0) / anim.dur) : 1, { de, vers } = anim;
  const dCap = ((vers.cap - de.cap + 540) % 360) - 180; // par le plus court
  affiche = { ll: [de.ll[0] + (vers.ll[0] - de.ll[0]) * k, de.ll[1] + (vers.ll[1] - de.ll[1]) * k], cap: (de.cap + dCap * k + 360) % 360 };
  navMk.setLngLat(lnglat(affiche.ll)).setRotation(affiche.cap);
  if (suivre && !plan.isEasing()) plan.jumpTo({ center: lnglat(affiche.ll), bearing: affiche.cap });
  if (k < 1) rafNav = requestAnimationFrame(boucleNav);
}
$('#navStop').onclick = () => arreterGuidage();
$('#navVoix').onclick = () => { S.voix = !S.voix; save(); majVoix(); if (!S.voix) stopperVoix(); else dire('Voix activée.'); };
$('#navDanger').onclick = () => signalerDanger();

// Refuges, points d'eau, hôpitaux… et mes points, quand on zoome assez
let minuteriePoints = 0;
function programmerPointsPlan() {
  if (minuteriePoints || !carteVisible()) return;
  // La caméra du guidage émet « moveend » à chaque image.
  minuteriePoints = setTimeout(() => {
    minuteriePoints = 0;
    majPointsPlan();
  }, 200);
}
function majPointsPlan() {
  if (!plan || !carteVisible()) return;
  const gardes = new Set();
  const garder = (point, creer) => {
    gardes.add(point);
    if (!ptsMk.has(point)) ptsMk.set(point, creer());
  };
  if (S.pointsCarte !== false) {
    for (const p of S.points) garder(p, () => marqueur([p.lat, p.lon], 'plan-mien')
      .setPopup(new maplibregl.Popup({ offset: 10 }).setText(p.nom)));
  }
  for (const d of dangersActifs()) garder(d, () => {
    const popup = new maplibregl.Popup({ offset: 14 });
    popup.on('open', () => popup.setHTML(`<b>${SIGNALES[d.type][1]}</b><br>${t('Signalé {q} il y a {d}', { q: d.moi ? t('par toi') : d.par ? t('par {n}', { n: esc(d.par) }) : t('par ton groupe'), d: depuis(Date.now() - d.t) })}<br><button class="btn petit" data-suppr-danger="${esc(d.id)}">Plus là : retirer</button>`));
    return marqueur([d.lat, d.lon], 'plan-pt plan-danger', SIGNALES[d.type][0]).setPopup(popup.setText(SIGNALES[d.type][1]));
  });
  if (plan.getZoom() >= 11 && S.lieuxCarte !== false) {
    const b = plan.getBounds();
    let n = 0;
    for (const p of POINTS) {
      if (!b.contains([p[3], p[2]])) continue;
      garder(p, () => {
        const [ico, lib] = TYPES[p[0]] || ['•', p[0]];
        const popup = new maplibregl.Popup({ offset: 14 }).setHTML(`<b>${esc(p[1])}</b><br>${lib}${p[4] ? ' · ' + p[4] + ' m' : ''}`);
        return marqueur([p[2], p[3]], 'plan-pt', ico).setPopup(popup);
      });
      if (++n === 300) break;
    }
  }
  for (const [point, repere] of ptsMk) {
    if (!gardes.has(point)) { repere.remove(); ptsMk.delete(point); }
  }
}

// ---------- Carte hors ligne : télécharger la zone affichée ----------
// ponytail: tout jusqu'au zoom 14 (au-delà MapLibre agrandit les tuiles vectorielles), relief jusqu'au zoom 12 (maxzoom de la source) ; plafond 8 000 morceaux
const ZONES = 'repere-zones';
const cleTuile = u => u.replace(/\/planet\/[^/]+\/(\d+\/\d+\/\d+\.pbf)$/, '/planet/$1'); // même règle que sw.js (la version change chaque semaine)
function tuilesZone(b, zmax, zmin = 0) {
  const l = [];
  for (let z = zmin; z <= zmax; z++) {
    const n = 2 ** z, X = lo => Math.min(n - 1, Math.floor((lo + 180) / 360 * n));
    const Y = la => { const r = la * Math.PI / 180; return Math.min(n - 1, Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n)); };
    for (let x = X(b.getWest()); x <= X(b.getEast()); x++) for (let y = Y(b.getNorth()); y <= Y(b.getSouth()); y++) l.push([z, x, y]);
  }
  return l;
}
const marge = (b, d) => new maplibregl.LngLatBounds([b.getWest() - d, Math.max(-85, b.getSouth() - d)], [b.getEast() + d, Math.min(85, b.getNorth() + d)]);
const remplir = (t, [z, x, y]) => t.replace('{z}', z).replace('{x}', x).replace('{y}', y);
function majZones() {
  const z = S.zones || [];
  $('#btnZoneSuppr').hidden = !z.length;
  if (z.length) $('#zoneInfo').textContent = t('Gardé dans le téléphone : {z}. Cadre une autre zone pour l\'ajouter.', { z: z.map(x => x.nom).join(', ') });
}
$('#btnZone').onclick = async () => {
  if (!plan) return;
  const info = $('#zoneInfo'), btn = $('#btnZone');
  if (btn.disabled || $('#btnPays').disabled) return;
  if (!navigator.onLine) return info.textContent = t('Il faut du réseau pour télécharger la carte.');
  // En 3D la vue va jusqu'à l'horizon : on prend la zone vue du dessus
  const vue = { pitch: plan.getPitch(), bearing: plan.getBearing() };
  plan.jumpTo({ pitch: 0, bearing: 0 }); const b = plan.getBounds(); plan.jumpTo(vue);
  const vec = tuilesZone(b, 14);
  if (vec.length > 8000) return info.textContent = t('Zone trop grande pour le détail ({n} morceaux) : zoome sur ton massif, ou prends la carte du pays entier.', { n: vec.length });
  const ctr = b.getCenter(), [v, dv] = COMMUNES.reduce((m, x) => { const d = distance([ctr.lat, ctr.lng], [x[1], x[2]]); return d < m[1] ? [x, d] : m; }, [null, Infinity]);
  await garderCarte(btn, v && dv < 30000 ? t('autour de {v}', { v: v[0] }) : `${ctr.lat.toFixed(2)}, ${ctr.lng.toFixed(2)}`, (tj, style) => [
    ...vec.map(t => remplir(tj.tiles[0], t)),
    // Relief avec une marge : en 3D on voit jusqu'à l'horizon et une altitude manquante est prise pour 0 m (« murs » à l'écran)
    ...tuilesZone(marge(b, 1), 9).map(t => remplir(DEM, t)), ...tuilesZone(marge(b, .3), 10, 10).map(t => remplir(DEM, t)),
    ...tuilesZone(marge(b, .1), 12, 11).map(t => remplir(DEM, t)),
    ...tuilesZone(b, 6).map(t => remplir(style.sources.ne2_shaded.tiles[0], t))]);
};
// Carte d'un pays entier (data/pays.json : cadre [ouest, sud, est, nord] de 203 pays), au détail le plus fin qui tienne dans ~3 000 morceaux.
// ponytail: France au zoom 10 ≈ 2 600 morceaux, ~300 Mo (mesuré le 17/11) → ~0,11 Mo le morceau ; les grands pays n'ont que les grandes routes (zone affichée pour le détail).
// ponytail: cadre rectangulaire (États-Unis = 48 États contigus, sans Alaska ni Hawaï) ; un contour exact par pays si ça gêne.
let PAYS = {};
const nomsPays = (() => { try { return new Intl.DisplayNames([LANGUE], { type: 'region' }); } catch { return null; } })();
const nomPays = c => { try { return nomsPays?.of(c) || c; } catch { return c; } };
const cadre = c => { const [w, s, e, n] = PAYS[c]; return new maplibregl.LngLatBounds([w, Math.max(-85, s)], [e, Math.min(85, n)]); };
const nbTuiles = (b, z) => { let n = 0; for (let k = 0; k <= z; k++) { const m = 2 ** k, X = lo => Math.min(m - 1, Math.floor((lo + 180) / 360 * m)), Y = la => { const r = la * Math.PI / 180; return Math.min(m - 1, Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * m)); }; n += (X(b.getEast()) - X(b.getWest()) + 1) * (Y(b.getSouth()) - Y(b.getNorth()) + 1); } return n; };
function zoomPays(c) { let z = 6; while (z < 13 && nbTuiles(cadre(c), z + 1) <= 3000) z++; return z; }
function majPays() {
  const c = $('#paysChoix').value; if (!PAYS[c] || !window.maplibregl) return;
  const z = zoomPays(c), mo = Math.max(1, Math.round(nbTuiles(cadre(c), z) * .11));
  $('#btnPays').textContent = t('Télécharger la carte : {p} · {q} · ~{n} Mo', { p: nomPays(c), q: t(z >= 12 ? 'détail fin' : z >= 9 ? 'détail moyen' : 'grandes routes'), n: mo });
}
fetch('data/pays.json').then(r => r.json()).then(p => {
  PAYS = p;
  const ll = pos && ici(), dedans = c => ll && ll[0] >= p[c][1] && ll[0] <= p[c][3] && ll[1] >= p[c][0] && ll[1] <= p[c][2];
  const aire = c => (p[c][2] - p[c][0]) * (p[c][3] - p[c][1]);
  const ici_ = Object.keys(p).filter(dedans).sort((a, b) => aire(a) - aire(b))[0]; // plus petit pays qui contient ma position
  const reg = (navigator.language.split('-')[1] || '').toUpperCase();
  const choix = S.pays || ici_ || (p[reg] ? reg : 'FR');
  $('#paysChoix').innerHTML = Object.keys(p).map(c => [c, nomPays(c)]).sort((a, b) => a[1].localeCompare(b[1], LOC))
    .map(([c, n]) => `<option value="${c}"${c === choix ? ' selected' : ''}>${esc(n)}</option>`).join('');
  majPays();
}).catch(() => {});
$('#paysChoix').onchange = () => { S.pays = $('#paysChoix').value; save(); majPays(); };
$('#btnPays').onclick = () => {
  const c = $('#paysChoix').value; if (!PAYS[c]) return;
  if (!navigator.onLine) return $('#zoneInfo').textContent = t('Il faut du réseau pour télécharger la carte.');
  const z = zoomPays(c), b = cadre(c), mo = Math.max(1, Math.round(nbTuiles(b, z) * .11));
  if (!confirm(t('Télécharger la carte de {p} (environ {n} Mo, quelques minutes) ? Mieux vaut être en wifi.', { p: nomPays(c), n: mo }))) return;
  garderCarte($('#btnPays'), nomPays(c), (tj, style) => [
    ...tuilesZone(b, z).map(x => remplir(tj.tiles[0], x)),
    ...tuilesZone(b, Math.min(z - 2, 10)).map(x => remplir(DEM, x)),
    ...tuilesZone(b, Math.min(6, z)).map(x => remplir(style.sources.ne2_shaded.tiles[0], x))]).then(majPays);
};
async function garderCarte(btn, nom, morceaux) {
  const info = $('#zoneInfo');
  btn.disabled = true; info.textContent = 'Préparation…';
  try {
    const [tj, style] = await Promise.all([fetch('https://tiles.openfreemap.org/planet').then(r => r.json()), fetch(STYLE).then(r => r.json())]);
    const polices = ['Noto Sans Regular', 'Noto Sans Bold', 'Noto Sans Italic'].flatMap(f => ['0-255', '256-511', '512-767', '768-1023', '1024-1279', '1280-1535', '1536-1791', '3584-3839', '8192-8447'].map(r => `https://tiles.openfreemap.org/fonts/${encodeURIComponent(f)}/${r}.pbf`));
    const urls = [...STYLES.filter(([k]) => k !== 'auto').map(([k]) => `https://tiles.openfreemap.org/styles/${k}`), 'https://tiles.openfreemap.org/planet', ...polices, ...['.json', '.png', '@2x.json', '@2x.png'].map(x => style.sprite + x), ...morceaux(tj, style)];
    await navigator.storage?.persist?.(); // demande au téléphone de ne pas effacer ces cartes
    const c = await caches.open(ZONES), file = [...urls];
    let fait = 0, rate = 0;
    await Promise.all(Array.from({ length: 6 }, async () => {
      for (let u; (u = file.shift());) {
        try {
          const k = cleTuile(u);
          if (!(await c.match(k))) { const r = await fetch(u, { cache: 'no-store' }); if (r.ok) await c.put(k, r); else if (r.status !== 404) rate++; }
        } catch { rate++; }
        if (++fait % 25 === 0) info.textContent = t('Téléchargement de la carte… {n} %', { n: Math.round(fait / urls.length * 100) });
      }
    }));
    S.zones = [...(S.zones || []).filter(z => z.nom !== nom), { nom, t: Date.now() }]; save(); majZones();
    const est = await navigator.storage?.estimate?.();
    info.textContent += t(' ✓ Carte prête hors ligne') + (est ? t(' ({n} Mo utilisés par T’es où ?)', { n: Math.round(est.usage / 1e6) }) : '') + (rate ? t(' · {n} morceaux manquants, relance pour compléter', { n: rate }) : '') + '.';
  } catch (e) { info.textContent = t('Téléchargement interrompu : ') + e.message; }
  btn.disabled = false;
}
$('#btnZoneSuppr').onclick = async () => {
  if (!confirm('Effacer toutes les cartes téléchargées ? Il faudra du réseau pour les retrouver.')) return;
  await caches.delete(ZONES); S.zones = []; save(); majZones();
  $('#zoneInfo').textContent = 'Cartes effacées.';
};

// Recherche d'une commune dans la liste hors ligne
const nomCommune = c => `${c[0]} (${c[4]})`;
// Les communes proches passent devant, puis les plus peuplées
const rang = c => Math.log(c[3] + 1) - (pos ? distance(ici(), [c[1], c[2]]) / 30000 : 0);
// Mes trajets : sous la petite flèche du champ, chaque lieu (ville, refuge, point touché) avec le kilométrage du trajet choisi.
// Les anciennes recherches (S.recents, noms seuls) sont reprises : leur kilométrage s'ajoute au prochain calcul.
if (S.recents && !S.trajets) { S.trajets = S.recents.map(nom => ({ nom })); delete S.recents; save(); }
function noterTrajet(R) {
  const e = { nom: R.dest.nom, ll: R.dest.ll, d: R.d, t: R.t, mode: R.mode, date: Date.now() };
  S.trajets = [e, ...(S.trajets || []).filter(x => x.nom !== e.nom)].slice(0, 10); save();
}
const jour = t => new Date(t).toLocaleDateString(LOC, { day: 'numeric', month: 'short' });
const sousTrajet = x => x.d ? `${fmtDist(x.d)} ${MODES[x.mode]?.[1] || ''} · ${duree(x.t * 1000)} · ${jour(x.date)}` : 'Kilométrage au prochain calcul';
let menuItems = [], menuHist = false;
function montrerMenu(items, hist, vide) {
  menuItems = items; menuHist = hist;
  $('#destMenu').innerHTML = items.map((x, i) => `<li data-i="${i}"><b>${esc(x.nom)}</b><small>${esc(x.sous)}</small></li>`).join('') || (vide ? `<li class="meta">${vide}</li>` : '');
  $('#destMenu').hidden = !$('#destMenu').innerHTML; $('#destHist').setAttribute('aria-expanded', hist && !$('#destMenu').hidden);
}
const fermerMenu = () => montrerMenu([], false);
const menuTrajets = () => montrerMenu((S.trajets || []).map(x => ({ ...x, sous: sousTrajet(x) })), true, 'Pas encore de trajet. Cherche une ville ou touche la carte.');
$('#destHist').onclick = e => { e.stopPropagation(); menuHist ? fermerMenu() : menuTrajets(); };
const sousLieu = (ll, sinon) => pos ? `${fmtDist(distance(ici(), ll))} ${t('à vol d\'oiseau')}` : sinon;
// Lieux du monde entier quand il y a du réseau (Photon, données OpenStreetMap, sans compte) ; sans réseau, les communes françaises gardées dans l'app
async function lieuxMonde(v, n = 6) {
  if (!navigator.onLine) return [];
  const u = new URL('https://photon.komoot.io/api/'); u.searchParams.set('q', v); u.searchParams.set('limit', n);
  u.searchParams.set('lang', LANGUE === 'es' ? 'default' : LANGUE); // Photon parle fr, en, de ; en espagnol : noms locaux
  if (pos) { u.searchParams.set('lat', ici()[0].toFixed(2)); u.searchParams.set('lon', ici()[1].toFixed(2)); }
  try {
    const j = await fetch(u, { signal: AbortSignal.timeout(6000) }).then(r => r.json());
    return j.features.map(f => { const p = f.properties, ll = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
      const lieu = [p.city !== p.name && p.city, p.state, p.country].filter(Boolean).join(', ');
      return { nom: p.name + (p.country && p.country !== p.name ? ` (${p.countrycode || p.country})` : ''), ll, sous: sousLieu(ll, lieu) + (pos && lieu ? ' · ' + lieu : '') }; });
  } catch { return []; }
}
let rechercheId = 0;
$('#dest').oninput = () => {
  const v = $('#dest').value.trim(), q = norm(v); if (q.length < 2) return fermerMenu();
  const communes = COMMUNES.filter(c => norm(c[0]).startsWith(q)).sort((a, b) => rang(b) - rang(a)).slice(0, 8)
    .map(c => ({ nom: nomCommune(c), ll: [c[1], c[2]], sous: sousLieu([c[1], c[2]], `${c[3].toLocaleString(LOC)} hab.`) }));
  montrerMenu(communes, false);
  const id = ++rechercheId;
  if (q.length >= 3) setTimeout(async () => {
    if (id !== rechercheId) return; // on tape encore
    const monde = await lieuxMonde(v);
    if (id === rechercheId && monde.length && $('#dest').value.trim() === v) montrerMenu([...monde, ...communes.filter(c => !monde.some(m => distance(m.ll, c.ll) < 2000))].slice(0, 8), false);
  }, 350);
};
// pointerdown sans effet par défaut : le champ garde le focus, le premier toucher choisit bien la ligne (sur iPhone il fallait parfois toucher deux fois)
$('#destMenu').addEventListener('pointerdown', e => e.preventDefault());
$('#destMenu').onclick = e => {
  const x = menuItems[e.target.closest('[data-i]')?.dataset.i]; if (!x) return;
  $('#dest').value = x.nom; fermerMenu(); $('#dest').blur();
  x.ll ? choisirDest(x.ll, x.nom) : $('#btnIti').click();
};
document.addEventListener('click', e => { if (!e.target.closest('.dest-champ')) fermerMenu(); });
$('#dest').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#btnIti').click(); } });
$('#btnIti').onclick = () => {
  fermerMenu(); $('#dest').blur();
  const v = $('#dest').value.trim(), q = norm(v.replace(/\s*\(\w+\)$/, ''));
  if (!v) return destination ? calculerIti() : menuTrajets();
  const h = (S.trajets || []).find(x => x.nom === v && x.ll); if (h) return choisirDest(h.ll, h.nom); // refuge, point touché… déjà fait
  const c = COMMUNES.find(c => nomCommune(c) === v) || COMMUNES.filter(c => norm(c[0]) === q).sort((a, b) => rang(b) - rang(a))[0]
    || COMMUNES.filter(c => norm(c[0]).startsWith(q)).sort((a, b) => rang(b) - rang(a))[0];
  if (!c) { // pas une commune française : on cherche dans le monde (avec du réseau)
    $('#itiRes').textContent = t('Recherche du lieu…');
    return lieuxMonde(v, 1).then(([m]) => m ? choisirDest(m.ll, m.nom) : $('#itiRes').textContent = t('Lieu introuvable. Vérifie l\'orthographe ou touche la carte.'));
  }
  $('#dest').value = nomCommune(c);
  choisirDest([c[1], c[2]], nomCommune(c));
};
function majModes() { $$('#modes .chip').forEach(c => c.classList.toggle('on', c.dataset.mode === modeIti)); }
$('#modes').onclick = e => { const b = e.target.closest('[data-mode]'); if (!b) return; modeIti = b.dataset.mode; majModes(); if (destination) calculerIti(); };

function choisirDest(ll, nom) {
  if (guidage) arreterGuidage();
  $('#dest').value = ''; // le champ se vide pour la prochaine recherche ; le lieu reste dans « Mes trajets » (flèche ⌄)
  destination = { ll: ll.map(x => +x.toFixed(5)), nom };
  if (plan) { destMk?.remove(); destMk = marqueurDest(ll); }
  calculerIti();
}

const SENS = { left: 'à gauche', right: 'à droite', 'slight left': 'légèrement à gauche', 'slight right': 'légèrement à droite', 'sharp left': 'franchement à gauche', 'sharp right': 'franchement à droite', straight: 'tout droit', uturn: 'demi-tour' };
function consigne(s) {
  const m = s.maneuver, sens = SENS[m.modifier] ? t(SENS[m.modifier]) : '', r = s.name ? t(' sur {n}', { n: s.name }) : '';
  const n = m.exit || 1, e = LANGUE === 'en' ? n + ([, 'st', 'nd', 'rd'][n] || 'th') : LANGUE === 'es' ? n + 'ª' : n === 1 ? '1ʳᵉ' : n + 'ᵉ';
  if (m.type === 'depart') return t('Pars{r}', { r });
  if (m.type === 'arrive') return t('Tu es arrivé');
  if (m.type === 'roundabout' || m.type === 'rotary') return t('Au rond-point, prends la {e} sortie{r}', { e, r });
  if (m.type === 'fork') return t('À la fourche, prends {s}{r}', { s: sens, r });
  if (m.modifier === 'uturn') return t('Fais demi-tour{r}', { r });
  if (m.modifier === 'straight' || !sens) return t('Continue tout droit{r}', { r });
  return t('Tourne {s}{r}', { s: sens, r });
}

// « Y aller » qui bloquait : pas de délai max (une demande pouvait pendre longtemps), 3 demandes d'un coup au serveur gratuit
// (refus fréquents), et une réponse lente pouvait écraser un trajet demandé après. Maintenant : 15 s max, 2e essai,
// trajet principal affiché tout de suite, variantes ensuite, réponses périmées ignorées.
// ---------- Itinéraire sans réseau : calculé sur les routes de la carte téléchargée ----------
// Les morceaux de carte gardés dans le téléphone contiennent le tracé des routes (couche « transportation »).
// On cadre départ + arrivée, on lit les routes chargées, on en fait un réseau et on cherche le plus court (A*).
// ponytail: réseau lu sur les morceaux affichés (détail selon le zoom du cadrage : grandes routes seulement pour un long trajet,
// et seulement là où la carte a été téléchargée) ; pas de sens interdits fins ni de restrictions de virage.
const VIT = { car: { motorway: 115, trunk: 95, primary: 75, secondary: 65, tertiary: 55, minor: 40, service: 20, raceway: 0, track: 0, path: 0, busway: 0 },
  bike: { motorway: 0, trunk: 0, primary: 16, secondary: 16, tertiary: 16, minor: 15, service: 14, track: 12, path: 12 },
  foot: { motorway: 0, trunk: 0, primary: 4.5, secondary: 4.5, tertiary: 4.8, minor: 4.8, service: 4.8, track: 4.8, path: 4.5 } };
const attendreCarte = ms => new Promise(ok => { let fini = false; const f = () => { if (!fini) { fini = true; ok(); } }; plan.once('idle', f); setTimeout(f, ms); });
async function itiHorsLigne(dep, arr, mode) {
  initPlan(); if (!plan) throw new Error('carte indisponible');
  if (!plan.isStyleLoaded()) await new Promise(ok => { plan.once('style.load', ok); setTimeout(ok, 6000); });
  const src = Object.entries(plan.getStyle().sources).find(([, v]) => v.type === 'vector')?.[0];
  if (!src) throw new Error('carte non téléchargée');
  const b = new maplibregl.LngLatBounds(lnglat(dep), lnglat(dep)).extend(lnglat(arr));
  plan.fitBounds(b, { padding: 40, maxZoom: 14, duration: 0, bearing: 0, pitch: 0 });
  await attendreCarte(7000);
  const vit = VIT[mode] || VIT.car, cle = ([lo, la]) => Math.round(lo * 1e5) + ',' + Math.round(la * 1e5);
  const noeuds = new Map(); // clé → { ll:[la,lo], v: [[clé voisin, secondes, mètres]] }
  const noeud = c => { const k = cle(c); let n = noeuds.get(k); if (!n) noeuds.set(k, n = { k, ll: [c[1], c[0]], v: [] }); return n; };
  const relier = (a, b, kmh, sens) => { const d = distance(a.ll, b.ll), s = d / (kmh / 3.6); if (sens >= 0) a.v.push([b, s, d]); if (sens <= 0) b.v.push([a, s, d]); };
  const lignes = g => g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
  for (const f of plan.querySourceFeatures(src, { sourceLayer: 'transportation' })) {
    const kmh = vit[f.properties.class]; if (!kmh) continue;
    const sens = mode === 'car' ? (+f.properties.oneway || 0) : 0;
    for (const l of lignes(f.geometry)) for (let i = 1; i < l.length; i++) { const a = noeud(l[i - 1]), c = noeud(l[i]); if (a !== c) relier(a, c, kmh, sens); }
  }
  const noms = new Map(); // nom des rues, lu sur la couche des noms (mêmes sommets)
  for (const f of plan.querySourceFeatures(src, { sourceLayer: 'transportation_name' })) {
    const n = f.properties['name:' + LANGUE] || f.properties.name || f.properties.ref; if (!n) continue;
    for (const l of lignes(f.geometry)) for (const c of l) noms.set(cle(c), n);
  }
  if (noeuds.size < 2) throw new Error('pas de routes dans la carte téléchargée ici');
  // Raccords : bouts de route à moins de 20 m d'une autre route (coutures entre morceaux de carte, carrefours mal dessinés)
  const grille = new Map(), cel = ([la, lo]) => Math.floor(la / .0004) + ':' + Math.floor(lo / .0004);
  for (const n of noeuds.values()) { const c = cel(n.ll); (grille.get(c) || grille.set(c, []).get(c)).push(n); }
  const autour = (ll, r) => { const [i, j] = cel(ll).split(':').map(Number), out = [];
    for (let a = -r; a <= r; a++) for (let o = -r; o <= r; o++) out.push(...(grille.get((i + a) + ':' + (j + o)) || [])); return out; };
  for (const n of noeuds.values()) if (n.v.length <= 1) {
    let m = null, dm = 20; for (const x of autour(n.ll, 1)) { if (x === n || n.v.some(e => e[0] === x)) continue; const d = distance(n.ll, x.ll); if (d < dm) { dm = d; m = x; } }
    if (m) relier(n, m, 10, 0);
  }
  const proche = ll => { let m = null, dm = Infinity; for (const n of noeuds.values()) { const d = distance(ll, n.ll); if (d < dm) { dm = d; m = n; } } return [m, dm]; };
  const [n0, d0] = proche(dep), [n1, d1] = proche(arr);
  if (d0 > 3000 || d1 > 3000) throw new Error('la carte téléchargée ne couvre pas ce trajet');
  // A* : estimation = vol d'oiseau à la vitesse max
  const vmax = Math.max(...Object.values(vit)) / 3.6, h = n => distance(n.ll, n1.ll) / vmax;
  const g = new Map([[n0, 0]]), de = new Map(), tas = [[h(n0), n0]], fermes = new Set();
  const pousser = x => { tas.push(x); let i = tas.length - 1; while (i) { const p = (i - 1) >> 1; if (tas[p][0] <= tas[i][0]) break; [tas[p], tas[i]] = [tas[i], tas[p]]; i = p; } };
  const tirer = () => { const top = tas[0], last = tas.pop(); if (tas.length) { tas[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
    if (l < tas.length && tas[l][0] < tas[m][0]) m = l; if (r < tas.length && tas[r][0] < tas[m][0]) m = r; if (m === i) break; [tas[m], tas[i]] = [tas[i], tas[m]]; i = m; } } return top; };
  while (tas.length) {
    const [, n] = tirer(); if (fermes.has(n)) continue; if (n === n1) break; fermes.add(n);
    for (const [x, s] of n.v) { const gx = g.get(n) + s; if (gx < (g.get(x) ?? Infinity)) { g.set(x, gx); de.set(x, n); pousser([gx + h(x), x]); } }
  }
  if (!g.has(n1)) throw new Error('aucun chemin trouvé sur la carte téléchargée');
  const chemin = [n1]; while (chemin[0] !== n0) chemin.unshift(de.get(chemin[0]));
  const geo = chemin.map(n => n.ll.map(x => +x.toFixed(5)));
  let d = 0; for (let i = 1; i < geo.length; i++) d += distance(geo[i - 1], geo[i]);
  // Consignes : aux carrefours où l'on tourne de plus de 30°
  const cap = (i, sens) => { let j = i, dd = 0; while (j + sens >= 0 && j + sens < geo.length && dd < 25) { dd += distance(geo[j], geo[j + sens]); j += sens; } return j === i ? null : bearing(sens < 0 ? geo[j] : geo[i], sens < 0 ? geo[i] : geo[j]); };
  const nom = i => noms.get(chemin[i].k) || noms.get(chemin[Math.min(i + 1, chemin.length - 1)].k) || '';
  const etapes = [], mk = (i, type, modifier) => ({ i, s: { maneuver: { type, modifier }, name: nom(i) } });
  const virages = [mk(0, 'depart')];
  for (let i = 1; i < chemin.length - 1; i++) {
    if (chemin[i].v.length < 3) continue; // pas un carrefour
    const a = cap(i, -1), c = cap(i, 1); if (a == null || c == null) continue;
    const dv = ((c - a + 540) % 360) - 180, ad = Math.abs(dv); if (ad < 30) continue;
    const cote = dv < 0 ? 'left' : 'right';
    virages.push(mk(i, 'turn', ad > 150 ? 'uturn' : ad > 110 ? 'sharp ' + cote : ad > 55 ? cote : 'slight ' + cote));
  }
  virages.push(mk(chemin.length - 1, 'arrive'));
  const cum = [0]; for (let i = 1; i < geo.length; i++) cum.push(cum[i - 1] + distance(geo[i - 1], geo[i]));
  virages.forEach((v, k) => etapes.push([consigne(v.s), Math.round((virages[k + 1] ? cum[virages[k + 1].i] : cum[v.i]) - cum[v.i]), geo[v.i]]));
  // Le tracé part de ma position et finit à l'arrivée (sinon « Tu t'écartes » dès le départ si la route la plus proche est à 100 m)
  const r5 = ll => ll.map(x => +x.toFixed(5)), vol = (vit.minor || 40) / 3.6;
  return { d: d + d0 + d1, t: g.get(n1) + (d0 + d1) / Math.min(vol, 5), via: t('carte téléchargée, sans réseau'), geo: [r5(dep), ...geo, r5(arr)], etapes, horsLigne: true };
}

function afficherCalculCarte(message) {
  $('#planCalcul').textContent = message;
  $('#planCalcul').hidden = !message;
  majHoraires();
}
let calcId = 0, choixMasquePour = -1;
async function calculerIti() {
  if (!destination) return;
  const id = ++calcId, dest = destination, mode = modeIti;
  const dep = pos ? ici() : plan ? [plan.getCenter().lat, plan.getCenter().lng] : null;
  if (!dep) return $('#itiRes').textContent = 'Position inconnue : active le GPS.';
  carteManipulee = false;
  $('#itiGo').disabled = true;
  $('#itiRes').textContent = t('Calcul de l\'itinéraire {m} vers {d}…', { m: MODES[mode][1], d: dest.nom });
  afficherCalculCarte($('#itiRes').textContent);
  $('#btnItiBoussole').hidden = false;
  // Sans réseau (ou serveur injoignable) : itinéraire calculé sur la carte téléchargée
  const sansReseau = async raison => {
    $('#itiRes').textContent = t('Pas de réseau : calcul sur la carte téléchargée…');
    afficherCalculCarte($('#itiRes').textContent);
    try {
      const a = await itiHorsLigne(dep, dest.ll, mode); if (id !== calcId) return true;
      $('#itiGo').disabled = false;
      S.route = { dest, mode, alts: [a], choix: 0, ...a }; noterTrajet(S.route); afficherCalculCarte(''); proposerItis(); dessinerRoute(S.route, !carteManipulee); return true;
    } catch (e) { if (id === calcId) console.warn('itinéraire hors ligne', e); return false; }
  };
  if (!navigator.onLine && await sansReseau()) return;
  try {
    // Le serveur gratuit ne propose qu'un trajet : on en demande deux autres qui passent par un point à gauche
    // et à droite de la ligne droite, et on garde ceux qui sont vraiment différents et pas trop longs (comme un GPS)
    // ponytail: variantes par point de passage, pas de vrais « alternatives » ; un serveur OSRM à nous si ça ne suffit pas
    const [la1, lo1] = dep, [la2, lo2] = dest.ll, ml = (la1 + la2) / 2, c = Math.cos(ml * Math.PI / 180);
    const cote = k => [ml + k * .3 * (lo2 - lo1) * c, (lo1 + lo2) / 2 - k * .3 * (la2 - la1) / c];
    const url = pts => `https://routing.openstreetmap.de/${MODES[mode][0]}/route/v1/driving/${pts.map(p => `${p[1]},${p[0]}`).join(';')}?overview=full&geometries=geojson&steps=true&continue_straight=true`;
    const lire = pts => fetch(url(pts), { signal: AbortSignal.timeout?.(15000) }).then(r => r.json())
      .then(r => r?.code === 'Ok' && r.routes?.[0] ? r.routes[0] : Promise.reject(new Error(r?.message || 'aucun chemin trouvé')));
    let r0;
    try { r0 = await lire([dep, dest.ll]); } catch { if (id !== calcId) return; await new Promise(f => setTimeout(f, 1200)); r0 = await lire([dep, dest.ll]); }
    if (id !== calcId) return;
    const enAlt = rt => ({
      d: rt.distance, t: rt.duration, via: [...new Set(rt.legs.flatMap(l => l.summary.split(', ')).filter(Boolean))].slice(0, 2).join(', '),
      geo: rt.geometry.coordinates.map(([lo, la]) => [+la.toFixed(5), +lo.toFixed(5)]),
      etapes: rt.legs.flatMap((l, k) => l.steps.filter(s => !(s.maneuver.type === 'arrive' && k < rt.legs.length - 1) && !(s.maneuver.type === 'depart' && k > 0)))
        .map(s => [consigne(s), Math.round(s.distance), [+s.maneuver.location[1].toFixed(5), +s.maneuver.location[0].toFixed(5)]]),
    });
    const alts = [enAlt(r0)];
    $('#itiGo').disabled = false;
    S.route = { dest, mode, alts, choix: 0, ...alts[0] };
    noterTrajet(S.route); afficherCalculCarte(''); proposerItis(); dessinerRoute(S.route, !carteManipulee);
    // Variantes à gauche / à droite, sans faire attendre le trajet principal
    const rv = await Promise.all([1, -1].map(k => lire([dep, cote(k), dest.ll]).catch(() => null)));
    if (id !== calcId || guidage || S.route?.alts !== alts) return;
    const commun = (a, b) => { let n = 0, k = 0; for (; k < a.length; k += 5) if (b.some((q, j) => j % 3 === 0 && distance(a[k], q) < 40)) n++; return n / Math.ceil(a.length / 5); };
    rv.filter(Boolean).map(enAlt).sort((a, b) => a.t - b.t)
      .forEach(a => { if (a.t < alts[0].t * 1.5 && alts.every(b => commun(a.geo, b.geo) < .8)) alts.push(a); });
    if (alts.length < 2) return;
    const choixVisible = !$('#itiChoix').hidden;
    if (choixVisible) proposerItis();
    save(); dessinerRoute(S.route, choixVisible && !carteManipulee && S.route.choix === 0);
  } catch (e) {
    if (id !== calcId) return;
    if (navigator.onLine && e.name !== 'AbortError' && await sansReseau()) return; // réseau trop faible : on tente la carte gardée
    if (id !== calcId) return;
    $('#itiGo').disabled = false;
    const d = distance(dep, dest.ll), raison = e.name === 'TimeoutError' ? 'le serveur ne répond pas, retouche « Y aller »' : e.message;
    afficherCalculCarte(navigator.onLine ? t('Itinéraire impossible ({r}).', { r: t(raison) }) : t('Trajet non couvert par la carte téléchargée.'));
    $('#itiRes').innerHTML = (navigator.onLine ? t('Itinéraire impossible ({r}).', { r: esc(t(raison)) }) : t('Pas de réseau, et la carte téléchargée ne couvre pas ce trajet (télécharge la zone dans l\'onglet Carte).'))
      + t(' {n} est à {d} à vol d\'oiseau, direction {c}. La boussole peut t\'y guider en ligne droite.', { n: esc(dest.nom), d: fmtDist(d), c: cardinal(bearing(dep, dest.ll)) });
  }
}
function dessinerRoute(R, cadrer) {
  majHoraires();
  $('#itiRes').innerHTML = `<b>${esc(R.dest.nom)}</b> · ${fmtDist(R.d)} · ${duree(R.t * 1000)} ${MODES[R.mode][1]}`;
  $('#etapes').innerHTML = R.etapes.map(([t, d]) => `<li><span>${esc(t)}</span>${d ? `<small>${fmtDist(d)}</small>` : ''}</li>`).join('');
  $('#btnItiBoussole').hidden = false;
  if (!plan?.getSource('route')) return; // la carte n'est pas prête : elle dessinera S.route en se chargeant
  plan.getSource('route').setData(geoRoute(R));
  destMk?.remove(); destMk = marqueurDest(R.dest.ll);
  majBulles(R);
  if (cadrer) cadrerRoute(R);
}
const cartePaysage = matchMedia('(orientation: landscape) and (max-height: 500px)');
function cadrerRoute(R) {
  const { clientHeight: hauteur, clientWidth: largeur } = plan.getContainer();
  if (!hauteur || !largeur) return;
  suivre = false;
  const cadre = new maplibregl.LngLatBounds();
  (R.alts || [R]).forEach(a => a.geo.forEach(p => cadre.extend(lnglat(p))));
  const choix = $('#itiChoix'), lateral = cartePaysage.matches && $('.plan-wrap').classList.contains('plein') && !choix.hidden;
  const haut = $('.plan-haut').offsetHeight + 28;
  const bas = lateral ? $('.plan-btns').offsetHeight + 44 : $('.plan-bas').offsetHeight + 17;
  const droite = lateral ? Math.min(choix.offsetWidth + 30, largeur * .6) : 24;
  plan.fitBounds(cadre, { padding: { top: Math.min(haut, hauteur * .3), bottom: Math.min(bas, hauteur * .6), left: 24, right: droite }, duration: 0 });
}
// Bulles de durée posées sur chaque itinéraire, à l'endroit où il s'écarte le plus de l'autre
let bulles = [];
const pointEcarte = (a, b) => { let best = a[a.length >> 1], dm = -1;
  for (let k = 0; k < a.length; k += 6) { let m = Infinity; for (let j = 0; j < b.length; j += 6) m = Math.min(m, distance(a[k], b[j])); if (m > dm) { dm = m; best = a[k]; } }
  return best; };
function majBulles(R) {
  bulles.forEach(m => m.remove()); bulles = [];
  if (!plan || guidage || !(R?.alts?.length > 1)) return;
  R.alts.forEach((a, i) => {
    const el = document.createElement('div'); el.className = 'iti-bulle' + (i === R.choix ? ' on' : '');
    el.innerHTML = duree(a.t * 1000) + (i === 0 ? '<small>Le plus rapide</small>' : '');
    el.onclick = ev => { ev.stopPropagation(); choisirIti(i); };
    bulles.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(lnglat(pointEcarte(a.geo, R.alts[i ? 0 : 1].geo))).addTo(plan));
  });
}
function choisirIti(i) {
  const R = S.route; if (!R?.alts?.[i] || guidage) return;
  Object.assign(R, R.alts[i], { choix: i }); noterTrajet(R); dessinerRoute(R, false);
  if (!$('#itiChoix').hidden) proposerItis();
}
// Feuille du bas : les itinéraires (durée, distance, par où), puis « Y aller »
function proposerItis() {
  const R = S.route; if (!R?.alts || calcId === choixMasquePour || !$('#v-carte').classList.contains('active')) return;
  const LIB = { foot: 'À pied', bike: 'À vélo', car: 'En voiture' };
  $('#itiListe').innerHTML = `<div class="chips iti-modes">${Object.keys(MODES).map(k => `<button class="chip${k === R.mode ? ' on' : ''}" data-mode2="${k}">${LIB[k]}</button>`).join('')}</div>` + R.alts.map((a, i) => `<button class="iti-option${i === R.choix ? ' on' : ''}" data-iti="${i}">
    <span><b>${duree(a.t * 1000)}</b><small>${a.via ? t('Via {v}', { v: esc(a.via) }) : MODES[R.mode][1]}${i === 0 && R.alts.length > 1 ? t(' · le plus rapide') : ''}</small></span><small>${fmtDist(a.d)}</small></button>`).join('');
  $('#itiGo').textContent = pos ? 'Y aller' : 'Activer le GPS';
  $('#itiChoix').hidden = false;
  pleinEcranCarte(true);
}
$('#itiListe').onclick = e => {
  const m = e.target.closest('[data-mode2]'); if (m) { modeIti = m.dataset.mode2; majModes(); return calculerIti(); }
  const b = e.target.closest('[data-iti]'); if (b) choisirIti(+b.dataset.iti);
};
let guidageEnAttente = false;
$('#itiGo').onclick = () => {
  debloquerSon(); // iPhone : la voix et les bips ne marchent qu'après un toucher
  if (!pos) {
    guidageEnAttente = true;
    afficherCalculCarte('');
    $('#itiGo').textContent = 'Recherche du GPS… le guidage partira tout seul';
    if (watchId == null) demarrerGps();
    return;
  }
  demarrerGuidage();
};
function fermerChoixIti() {
  choixMasquePour = calcId;
  $('#itiChoix').hidden = true;
  guidageEnAttente = false;
}
$('#itiFermer').onclick = fermerChoixIti;
// Sans réseau : la destination devient un point suivi par la flèche de la boussole
$('#btnItiBoussole').onclick = () => {
  if (!destination) return;
  const p = { id: Date.now().toString(36), nom: 'Destination : ' + destination.nom, lat: destination.ll[0], lon: destination.ll[1], t: Date.now() };
  S.points.unshift(p); S.cible = p.id; save(); majPoints(); majBoussole(); ouvrir('boussole');
};

// ---------- SOS : lumière (flash arrière, l'écran en secours) ----------
// Le flash = la caméra arrière avec la contrainte « torch » : Android (Chrome) et iPhone depuis iOS 18.
let lumTimer = 0, flash = null;
const lum = $('#lum');
async function allumerFlash() {
  if (flash) return true;
  let s = null;
  try {
    s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
    const t = s.getVideoTracks()[0];
    if (t.getCapabilities && !t.getCapabilities().torch) throw new Error('pas de flash');
    await t.applyConstraints({ advanced: [{ torch: true }] });
    $('#lumVideo').srcObject = s; // iPhone : le flux doit rester actif pour garder le flash allumé
    flash = t; return true;
  } catch { s?.getTracks().forEach(t => t.stop()); return false; }
}
const torche = on => flash?.applyConstraints({ advanced: [{ torch: on }] }).catch(() => {});
function eteindreFlash() { flash?.stop(); flash = null; $('#lumVideo').srcObject = null; }

async function lumiere(mode) {
  clearTimeout(lumTimer); lum.hidden = false; lum.className = 'lum' + (mode === 'rouge' ? ' rouge' : '');
  const viaFlash = mode !== 'rouge' && await allumerFlash();
  const nom = { sos: 'SOS', montagne: 'Signal montagne', lampe: 'Lampe' }[mode] || '';
  $('#lumTxt').textContent = mode === 'sos' && !viaFlash ? 'SOS' : '';
  $('#lumInfo').textContent = mode === 'rouge' ? '' : viaFlash ? `${nom} · flash arrière allumé` : `${nom} · flash indisponible, l'écran prend le relais`;
  lum.classList.toggle('flash', viaFlash);
  if (mode === 'lampe' || mode === 'rouge') { lum.classList.add(viaFlash ? 'eclat' : 'on'); return; }
  // Morse SOS : · · · — — — · · ·  (unité 250 ms)  |  Montagne : 6 éclats/min puis 1 min de pause
  const u = 250, seq = mode === 'sos'
    ? [1, 1, 1, 1, 1, 3, 3, 1, 3, 1, 3, 3, 1, 1, 1, 1, 1, 7].map(x => x * u)
    : [...Array(6)].flatMap(() => [1500, 8500]).concat([60000]);
  let i = 0;
  const step = () => {
    const on = i % 2 === 0;
    if (viaFlash) { torche(on); lum.classList.toggle('eclat', on); } else lum.classList.toggle('on', on);
    lumTimer = setTimeout(step, seq[i % seq.length]); i++;
  };
  step();
}
$$('[data-lum]').forEach(b => b.onclick = () => lumiere(b.dataset.lum));
$('#lumStop').onclick = () => { clearTimeout(lumTimer); eteindreFlash(); lum.hidden = true; };

// ---------- SOS : sifflet ----------
let ctx, siffle = false, siffleT = 0;
function bip(dur, freq = 3150) {
  ctx ??= new AudioContext();
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'square'; o.frequency.value = freq; g.gain.value = .9;
  o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + dur / 1000);
}
$('#btnSifflet').onclick = () => {
  siffle = !siffle; $('#btnSifflet').classList.toggle('actif', siffle);
  clearTimeout(siffleT);
  const cycle = () => { if (!siffle) return; [0, 1500, 3000].forEach(t => setTimeout(() => siffle && bip(900), t)); siffleT = setTimeout(cycle, 8000); };
  cycle();
};

// ---------- Voix (synthèse vocale du téléphone, hors ligne sur iPhone et la plupart des Android) ----------
S.voix ??= true; S.alerteDanger ??= true;
let instructionAttente = null;
const voixPourLangue = () => (window.speechSynthesis?.getVoices() || [])
  .filter(v => v.lang.toLowerCase().split(/[-_]/)[0] === LANGUE);
function voixGuidage() {
  const voix = voixPourLangue(), exacte = v => v.lang.toLowerCase().replace('_', '-') === LOC.toLowerCase();
  const amelioree = v => /enhanced|premium|améliorée|mejorada|natural/i.test(v.name);
  return voix.find(v => v.voiceURI === S.voixChoisie?.[LANGUE])
    || voix.find(v => exacte(v) && v.localService && amelioree(v))
    || voix.find(v => exacte(v) && v.localService)
    || voix.find(exacte) || voix.find(v => v.localService) || voix[0];
}
function majListeVoix() {
  const el = $('#regVoixChoix');
  el.replaceChildren(new Option(t('Voix automatique'), ''));
  for (const v of voixPourLangue()) el.append(new Option(v.name + ' · ' + v.lang, v.voiceURI));
  const choix = S.voixChoisie?.[LANGUE];
  if (choix && [...el.options].some(o => o.value === choix)) el.value = choix;
  el.disabled = !window.speechSynthesis;
  $('#regDebit').disabled = $('#regVoixEcouter').disabled = el.disabled;
}
function stopperVoix() {
  instructionAttente = null;
  window.speechSynthesis?.cancel();
}
function reprendreInstruction() {
  setTimeout(() => {
    const synth = window.speechSynthesis;
    if (!instructionAttente || !guidage || synth.speaking || synth.pending) return;
    const instruction = instructionAttente;
    instructionAttente = null;
    dire(instruction, false, true);
  }, 0);
}
function prononcer(texte) {
  const synth = window.speechSynthesis;
  if (!synth) return;
  const voix = voixGuidage(), u = new SpeechSynthesisUtterance(texte);
  u.lang = voix?.lang || LOC; if (voix) u.voice = voix;
  u.rate = S.debitVoix || .95;
  u.onend = u.onerror = reprendreInstruction;
  synth.speak(u);
}
function dire(texte, urgent = false, navigation = false) {
  const synth = window.speechSynthesis;
  if (!S.voix || !synth) return;
  if (urgent) stopperVoix();
  const message = D[texte] ?? texte;
  if (navigation && !urgent && (synth.speaking || synth.pending)) {
    instructionAttente = message;
    return;
  }
  prononcer(message);
}
const parleDist = m => {
  const arrondi = n => n.toFixed(n < 10 ? 1 : 0).replace('.', FMT.dec);
  if (FMT.imperial) return m < 321.8688 ? t('{n} pieds', { n: Math.max(20, Math.round(m / .3048 / 10) * 10) })
    : t('{n} miles', { n: arrondi(m / 1609.344) });
  return m < 1000 ? t('{n} mètres', { n: Math.max(10, Math.round(m / 10) * 10) }) : t('{n} kilomètres', { n: arrondi(m / 1000) });
};
function debloquerSon() {
  try { (ctx ??= new AudioContext()).resume(); } catch {}
  if (S.voix && window.speechSynthesis && !debloquerSon.fait) { debloquerSon.fait = true; const u = new SpeechSynthesisUtterance(' '); u.volume = 0;
    u.onend = u.onerror = reprendreInstruction;
    speechSynthesis.speak(u); }
}
addEventListener('pointerdown', debloquerSon, { once: true });
function majVoix() {
  $('#navVoix').innerHTML = pic(S.voix ? 'son' : 'muet'); $('#navVoix').setAttribute('aria-label', S.voix ? 'Couper la voix' : 'Activer la voix');
  $('#btnVoixPlan').innerHTML = pic(S.voix ? 'son' : 'muet'); $('#btnVoixPlan').setAttribute('aria-label', S.voix ? 'Couper la voix' : 'Activer la voix'); $('#btnVoixPlan').classList.toggle('coupe', !S.voix);
  $('#regVoix').checked = S.voix; $('#regDangers').checked = S.alerteDanger;
  $('#btnVoixGps').setAttribute('aria-pressed', S.voix); $('#btnAlerteDanger').setAttribute('aria-pressed', S.alerteDanger);
}
majVoix();
$('#btnVoixPlan').onclick = () => $('#btnVoixGps').click();
$('#btnVoixGps').onclick = () => { S.voix = !S.voix; save(); majVoix(); if (S.voix) dire('Voix du guidage activée.'); else stopperVoix(); };
$('#btnAlerteDanger').onclick = () => { S.alerteDanger = !S.alerteDanger; save(); majVoix(); if (S.alerteDanger) sonnerieDanger(); };

// ---------- Dangers signalés : arbre tombé, trou, obstacle… (par moi ou mon groupe), sonnerie en approchant ----------
const SIGNALES = { arbre: [pic('arbre'), 'Arbre tombé'], trou: [pic('trou'), 'Trou'], obstacle: [pic('obstacle'), 'Obstacle'], eboul: [pic('rochers'), 'Éboulement'], eau: [pic('vagues'), 'Passage inondé'], glace: [pic('flocon'), 'Verglas · neige'], animal: [pic('patte'), 'Animal dangereux'], autre: [pic('danger'), 'Autre danger'] };
const VIE_DANGER = 7 * 864e5; // ponytail: un signalement compte 7 jours, ensuite on le croit réglé
S.dangers ??= [];
const dangersActifs = () => S.dangers.filter(d => Date.now() - d.t < VIE_DANGER);
function signalerDanger() {
  if (!pos) return popup('<h2>Position inconnue</h2><p>Active le GPS : le danger est posé à l\'endroit où tu te trouves.</p>');
  popup(`<div class="k">Signaler un danger ici</div><h2>Qu'est-ce qu'il y a ?</h2>
    <div class="grille-danger">${Object.entries(SIGNALES).map(([k, [i, l]]) => `<button class="tuile" data-signal="${k}"><b>${i}</b><span>${l}</span></button>`).join('')}</div>
    <p class="note">Gardé 7 jours dans ton téléphone, envoyé à ton groupe s'il est connecté par le réseau. Ceux qui approchent entendent une alerte. Ne signale que ce que tu as vu : un faux signalement peut mettre des gens en danger.</p>`);
}
$('#btnDanger').onclick = signalerDanger;
document.addEventListener('click', e => {
  const b = e.target.closest('[data-signal]');
  if (b && pos) {
    const [la, lo] = ici(), d = { id: S.idProxi + '-' + Date.now().toString(36), type: b.dataset.signal, lat: +la.toFixed(5), lon: +lo.toFixed(5), t: Date.now(),
      par: (S.fiche.surnom || S.fiche.nom || '').slice(0, 12), moi: true };
    S.dangers = [d, ...S.dangers].slice(0, 300); save(); dangersVus.add(d.id); // pas d'alerte pour celui qu'on vient de poser
    if (!NATIF && proxiOn) Proxi.danger(d); // ponytail: l'APK (Bluetooth, 13 octets) ne transmet pas encore les dangers
    modal.close(); majPointsPlan(); dire(t('{l} signalé.', { l: t(SIGNALES[d.type][1]) }));
  }
  const s = e.target.closest('[data-suppr-danger]');
  if (s) { S.dangers = S.dangers.filter(d => d.id !== s.dataset.supprDanger); save(); majPointsPlan(); }
});
function recevoirDanger(d) {
  if (!d || !SIGNALES[d.type] || !isFinite(d.lat) || !isFinite(d.lon) || !isFinite(d.t) || S.dangers.some(x => x.id === d.id)) return;
  S.dangers = [{ id: String(d.id).slice(0, 40), type: d.type, lat: +d.lat, lon: +d.lon, t: Math.min(+d.t, Date.now()), par: String(d.par || '').slice(0, 12) }, ...S.dangers].slice(0, 300);
  save(); majPointsPlan(); verifierDangers();
}
function sonnerieDanger() { [0, 300, 600].forEach(t => setTimeout(() => bip(180, 1500), t)); setTimeout(() => bip(450, 1000), 900); }
let dangersVus = new Set(), dangersFiches = null, alerteT = 0;
function verifierDangers() {
  if (!S.alerteDanger || !pos) return;
  const me = ici(), v = pos.coords.speed || 0, seuil = v > 8 ? 500 : 150; // à pied 150 m, en voiture 500 m
  const capGps = v > 1 && pos.coords.heading != null && !isNaN(pos.coords.heading) ? pos.coords.heading : null;
  dangersFiches ??= POINTS.length ? POINTS.filter(p => p[0] === 'danger') : null; // passages délicats de refuges.info
  const liste = [...dangersActifs().map(d => ({ id: d.id, ll: [d.lat, d.lon], lib: t(SIGNALES[d.type][1]), ico: SIGNALES[d.type][0], qui: d.moi ? t('par toi') : d.par ? t('par {n}', { n: d.par }) : t('par ton groupe'), t: d.t })),
    ...(dangersFiches || []).map(p => ({ id: 'ri' + p[2] + ',' + p[3], ll: [p[2], p[3]], lib: t('Passage délicat : {n}', { n: p[1] }), ico: pic('danger'), qui: t('sur refuges.info') }))];
  for (const x of liste) {
    const d = distance(me, x.ll);
    if (d > seuil * 2) { dangersVus.delete(x.id); continue; } // réarmée une fois loin
    if (d > seuil || dangersVus.has(x.id)) continue;
    if (capGps != null && d > 30 && ecartAngle(capGps, bearing(me, x.ll)) > 70) continue; // derrière moi : pas d'alerte
    dangersVus.add(x.id);
    sonnerieDanger(); navigator.vibrate?.([300, 120, 300, 120, 600]);
    dire(t('Attention : {l} signalé à {d}.', { l: x.lib.replace(/ :.*/, ''), d: parleDist(d) }), true);
    const el = $('#alerteDanger');
    el.innerHTML = `<span class="ico">${x.ico}</span><span><b>${esc(x.lib)}</b><small>${t('À {d} · signalé {q}', { d: fmtDist(d), q: esc(x.qui) })}${x.t ? t(' il y a {d}', { d: depuis(Date.now() - x.t) }) : ''}</small></span><button aria-label="Fermer">✕</button>`;
    el.hidden = false; clearTimeout(alerteT); alerteT = setTimeout(() => { el.hidden = true; }, 15000);
    break;
  }
}
$('#alerteDanger').onclick = () => { $('#alerteDanger').hidden = true; };

// ---------- SOS : message vocal en boucle ----------
let voixUrl = null, voixLoop = 0, rec = null;
$('#btnVoix').onclick = async () => {
  const etat = $('#voixEtat'), b = $('#btnVoix');
  if (voixLoop) { clearInterval(voixLoop); voixLoop = 0; b.classList.remove('actif'); etat.textContent = 'Répétition arrêtée · appuie pour réécouter'; return; }
  if (rec) { rec.stop(); return; }
  if (voixUrl) {
    const jouer = () => { const a = new Audio(voixUrl); a.volume = 1; a.play(); };
    jouer(); voixLoop = setInterval(jouer, 30000); b.classList.add('actif'); etat.textContent = 'Répété toutes les 30 s · appuie pour arrêter'; return;
  }
  try {
    const flux = await navigator.mediaDevices.getUserMedia({ audio: true });
    const morceaux = []; rec = new MediaRecorder(flux);
    rec.ondataavailable = e => morceaux.push(e.data);
    rec.onstop = () => { flux.getTracks().forEach(t => t.stop()); voixUrl = URL.createObjectURL(new Blob(morceaux, { type: rec.mimeType })); rec = null; b.classList.remove('actif'); etat.textContent = 'Enregistré · appuie pour lancer la répétition'; };
    rec.start(); b.classList.add('actif'); etat.textContent = '● Parle… appuie pour terminer';
    setTimeout(() => rec?.state === 'recording' && rec.stop(), 15000);
  } catch { popup('<h2>Micro indisponible</h2><p>Autorise le micro pour enregistrer un message.</p>'); }
};

// ---------- SOS : détection de chute ----------
const SEUIL_CHUTE = 30; // m/s² (~3 g). ponytail: à calibrer sur le téléphone réel (trop bas = fausses alertes en courant)
let chuteOn = false, chuteCand = 0, calme = [];
async function basculerChute() {
  if (!chuteOn) {
    try { if (typeof DeviceMotionEvent?.requestPermission === 'function' && await DeviceMotionEvent.requestPermission() !== 'granted') throw 0; } catch { return popup('<h2>Capteurs refusés</h2><p>Autorise les capteurs de mouvement pour la détection de chute.</p>'); }
  }
  chuteOn = !chuteOn; $('#btnChute').setAttribute('aria-pressed', chuteOn);
}
$('#btnChute').onclick = basculerChute;
addEventListener('devicemotion', e => {
  if (!chuteOn || modal.open) return;
  const a = e.accelerationIncludingGravity; if (!a) return;
  const m = Math.hypot(a.x || 0, a.y || 0, a.z || 0), now = Date.now();
  if (m > SEUIL_CHUTE) { chuteCand = now; calme = []; return; }
  if (chuteCand && now - chuteCand > 2000) {
    calme.push(Math.abs(m - 9.81));
    if (now - chuteCand > 10000) {
      const immobile = calme.filter(x => x < 1.2).length / calme.length > .85;
      chuteCand = 0;
      if (immobile) alarmeChute();
    }
  }
});
function alarmeChute() {
  let n = 60;
  popup(`<h2>Chute détectée</h2><p class="big" id="chuteN">60</p><p>Tout va bien ? Sans réponse, T’es où ? déclenche le sifflet et le SOS lumineux.</p><button class="btn primaire" id="chuteOk">Je vais bien</button>`);
  const t = setInterval(() => { n--; const el = $('#chuteN'); if (el) el.textContent = n; if (n % 10 === 0) bip(300, 2000); if (n <= 0) { clearInterval(t); modal.close(); ouvrir('sos'); if (!siffle) $('#btnSifflet').click(); lumiere('sos'); } }, 1000);
  $('#chuteOk').onclick = () => { clearInterval(t); modal.close(); };
  modal.addEventListener('close', () => clearInterval(t), { once: true });
}

// ---------- Proches : SMS ----------
const smsLien = (num, txt) => `sms:${encodeURIComponent(num)}${/iPhone|iPad/.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent(txt)}`;
function texteSos() {
  if (!pos) return 'URGENCE : j\'ai besoin d\'aide. Position GPS inconnue pour l\'instant.';
  const [la, lo] = ici();
  return `URGENCE : j'ai besoin d'aide. Ma position GPS : ${la.toFixed(5)}, ${lo.toFixed(5)}${dernierVillage ? ` (près de ${dernierVillage.p[0]}, ${fmtDist(dernierVillage.d)} ${cardinal(dernierVillage.cap)})` : ''}. Si tu ne peux pas me joindre, appelle le 112 et donne-leur ces coordonnées.`;
}
function majSmsProches() {
  const cs = S.contacts.filter(c => c.tel);
  $('#smsProches').innerHTML = cs.length ? cs.map(c => `<a class="btn" style="margin:0" href="${smsLien(c.tel, texteSos())}">SMS à ${esc(c.nom || c.tel)} avec ma position</a>`).join('')
    : '<p class="meta" style="margin:0">Ajoute des contacts dans l\'onglet <b>Moi</b> pour leur envoyer ta position en un appui.</p>';
}
majSmsProches();

// ---------- Guide ----------
let catSel = null;
const ICO_CAT = { urgence: 'sos', nuit: 'tente', eau: 'goutte', feu: 'flamme', manger: 'couverts', soins: 'croix', montagne: 'montagne', orient: 'comp', signal: 'drapeau', animaux: 'patte', potager: 'pousse', voyage: 'valise', mer: 'ancre', meteo: 'eclaircie' };
// Couleur de chaque icône (blanche quand la puce est choisie)
const COUL_CAT = { tout: '#0A84FF', urgence: '#FF3B30', nuit: '#5E5CE6', eau: '#0A84FF', feu: '#FF453A', manger: '#FFD60A', soins: '#FF2D55', montagne: '#A2845E', orient: '#30B0C7', signal: '#FF375F', animaux: '#AC8E68', potager: '#34C759', voyage: '#BF5AF2', mer: '#64D2FF', meteo: '#FFD60A', wiki: '#8E8E93' };
const picC = (n, col) => pic(n).replace('<svg ', `<svg style="color:${col}" `);
$('#cats').innerHTML = `<button class="chip on" data-cat="">${picC('grille', COUL_CAT.tout)} Tout</button>` + Object.entries(CATS).map(([k, v]) => `<button class="chip" data-cat="${k}">${picC(ICO_CAT[k] || 'book', COUL_CAT[k] || '#8E8E93')} ${v}</button>`).join('')
  + `<button class="chip" data-cat="wiki">${picC('globe', COUL_CAT.wiki)} Wikipédia</button>`;
$('#cats').onclick = e => { const c = e.target.closest('.chip'); if (!c) return; catSel = c.dataset.cat || null; $$('#cats .chip').forEach(x => x.classList.toggle('on', x === c)); majFiches(); };
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const texte = f => norm(f.titre + ' ' + f.mots + ' ' + f.corps.replace(/<[^>]+>/g, ' '));
const VIDES = new Set('les des une est suis pour dans avec que qui quoi comment faire fait mon mes ton tes son ses sur pas plus tres trop elle ils nous vous mais car donc etre avoir quand peux peut dire dis combien quel quelle quels quelles sais faut veux moi toi cela ceci comme bien tout aussi parce pourquoi'.split(' '));
// Un mot de la question doit commencer un mot du texte : « eau » trouve « eaux » mais plus « bateau » ni « peau »
const contient = (t, m) => new RegExp('(^|[^a-z0-9])' + m).test(t);
const motsCle = q => norm(q).split(/[^a-z0-9]+/).filter(m => m.length > 2 && !VIDES.has(m)).map(m => m.slice(0, Math.max(4, m.length - 2)));
function chercher(q) {
  const mots = motsCle(q);
  return FICHES.map(f => { const t = texte(f), tm = norm(f.titre + ' ' + f.mots); return { f, s: mots.reduce((a, m) => a + (contient(tm, m) ? 3 : 0) + (contient(t, m) ? 1 : 0), 0) }; })
    .filter(x => x.s > 0).sort((a, b) => b.s - a.s).map(x => x.f);
}

// Wikipédia hors ligne : ~300 articles utiles en survie (data/wiki.json, fabriqué par wiki.mjs), gardés dans le téléphone
let WIKI = [];
fetch('data/wiki.json').then(r => r.json()).then(d => { WIKI = d.articles.map(a => ({ ...a, n: norm(a.t), nx: norm(a.x) })); majFiches(); }).catch(() => {});
function chercherWiki(q, n = 6) {
  const mots = motsCle(q); if (!mots.length) return [];
  // ponytail: le titre compte beaucoup plus que le texte, sinon les longs articles gagnent toujours
  return WIKI.map(a => ({ a, s: mots.reduce((s, m) => s + (contient(a.n, m) ? 6 : 0) + (contient(a.nx, m) ? 1 : 0), 0) }))
    .filter(x => x.s > 1).sort((x, y) => y.s - x.s).slice(0, n).map(x => x.a);
}
const ligneWiki = a => `<li data-wiki="${esc(a.t)}"><span><small>Wikipédia · ${esc(a.th)}</small><b>${esc(a.t)}</b></span></li>`;
function ouvrirWiki(t) {
  const a = WIKI.find(x => x.t === t); if (!a) return;
  const corps = esc(a.x).replace(/^(=+.*=+)$/gm, '\n\n$1\n\n').split(/\n{2,}/).filter(p => p.trim()).map(p => { const h = p.match(/^=+\s*(.+?)\s*=+$/); return h ? `<h3>${h[1]}</h3>` : `<p>${p.replace(/\n/g, '<br>')}</p>`; }).join('');
  popup(`<div class="k">Wikipédia · ${esc(a.th)}</div><h2>${esc(a.t)}</h2><div class="wiki">${corps}</div>
    <p class="credits">Article « ${esc(a.t)} » de Wikipédia en français, licence CC BY-SA 4.0, auteurs : voir l'historique de l'article. Texte seul, raccourci. Ne remplace pas un avis médical.</p>`);
}

function majFiches() {
  const q = $('#question').value.trim();
  if (!q && catSel === 'wiki') return $('#fiches').innerHTML = WIKI.length ? WIKI.map(ligneWiki).join('') : '<li class="meta">Wikipédia hors ligne en cours de chargement…</li>';
  const liste = q ? chercher(q) : FICHES.filter(f => !catSel || f.cat === catSel);
  const wiki = q ? chercherWiki(q) : [];
  $('#fiches').innerHTML = (liste.map(f => `<li data-fiche="${f.id}"><span><small>${CATS[f.cat]}</small><b>${f.titre}</b></span></li>`).join('') || (wiki.length ? '' : '<li class="meta">Aucune fiche. Essaie avec d\'autres mots.</li>'))
    + wiki.map(ligneWiki).join('');
}
$('#question').oninput = majFiches;
$('#fiches').onclick = e => { const li = e.target.closest('[data-fiche],[data-wiki]'); if (!li) return; li.dataset.fiche ? ouvrirFiche(li.dataset.fiche) : ouvrirWiki(li.dataset.wiki); };
function ouvrirFiche(id) {
  const f = FICHES.find(x => x.id === id);
  popup(`<div class="k">${CATS[f.cat]}</div><h2>${f.titre}</h2>${f.corps}${outil(f.outil)}`);
  if (f.outil === 'metronome') $('#metroBtn').onclick = basculerMetro;
  if (f.outil === 'orage') orageOutil();
}
function outil(o) {
  if (o === 'metronome') return `<div class="metro" id="metro">110</div><button class="btn primaire" id="metroBtn">Lancer le rythme (110 / min)</button>`;
  if (o === 'orage') return `<div class="metro" id="orageVal">—</div><button class="btn primaire" id="orageBtn">Appuie à l'éclair</button>`;
  return '';
}
let metroT = 0;
function basculerMetro() {
  if (metroT) return stopMetro();
  $('#metroBtn').textContent = 'Arrêter';
  let n = 0;
  metroT = setInterval(() => { bip(60, 880); n++; const m = $('#metro'); if (m) { m.textContent = n % 30 || 30; m.classList.add('bat'); setTimeout(() => m.classList.remove('bat'), 120); } }, 60000 / 110);
}
function stopMetro() { clearInterval(metroT); metroT = 0; const b = $('#metroBtn'); if (b) b.textContent = 'Lancer le rythme (110 / min)'; }
function orageOutil() {
  let t0 = 0; const b = $('#orageBtn'), v = $('#orageVal');
  b.onclick = () => {
    if (!t0) { t0 = Date.now(); b.textContent = 'Appuie au tonnerre'; v.textContent = '…'; return; }
    const s = (Date.now() - t0) / 1000, km = s / 3; t0 = 0; b.textContent = 'Appuie à l\'éclair';
    v.textContent = km.toFixed(1).replace('.', ',') + ' km';
    v.style.color = s < 30 ? 'var(--danger)' : 'var(--ok)';
  };
}
majFiches();

// ---------- IA hors ligne ----------
// wllama = llama.cpp dans le navigateur : carte graphique (WebGPU) si le navigateur la donne, sinon le processeur.
// Marche donc sur tous les iPhone. Le modèle est téléchargé une fois depuis Hugging Face puis gardé dans le téléphone.
const MOBILE = /iPhone|iPad|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
// Deux IA au choix : la rapide par défaut sur téléphone, la plus intelligente par défaut sur ordinateur
const HF = 'https://huggingface.co/Qwen/';
const MODELES = {
  rapide: [HF + 'Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf', '490 Mo'],
  precis: [HF + 'Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf', '1,1 Go'],
};
let choixIA = MODELES[S.modele] ? S.modele : MOBILE ? 'rapide' : 'precis';
let moteur = null, iaEnCours = null, wllamaCls = null;
const MODELE = () => MODELES[choixIA][0];
const iaInstallee = () => S.ia === MODELE();
function iaEtat(t) { $('#iaEtat').textContent = t; }
function majIA() {
  $$('#iaModeles .chip').forEach(c => c.classList.toggle('on', c.dataset.m === choixIA));
  if (moteur) return;
  $('#btnIA').hidden = false; $('#btnIA').textContent = iaInstallee() ? 'Démarrer' : 'Installer';
  iaEtat(iaInstallee() ? t('Installée · appuie pour la démarrer') : t('Répond à partir du guide, sans internet · {m} à télécharger une fois', { m: MODELES[choixIA][1] }));
}
majIA();
const nouvelleIA = async () => new (wllamaCls ??= (await import('./vendor/wllama.js')).Wllama)(
  { 'single-thread/wllama.wasm': new URL('vendor/wllama.wasm', location.href).href, 'multi-thread/wllama.wasm': new URL('vendor/wllama-mt.wasm', location.href).href },
  { allowOffline: true, suppressNativeLog: true, logger: { debug() {}, log() {}, warn: console.warn, error: console.error } });
$('#iaModeles').onclick = async e => {
  const m = e.target.closest('[data-m]')?.dataset.m;
  if (!m || m === choixIA || iaEnCours || iaOccupee) return;
  const ancien = S.ia;
  if (ancien && !confirm(`Changer d'IA ? L'actuelle sera effacée du téléphone pour libérer la place, la nouvelle (${MODELES[m][1]}) sera à télécharger.`)) return;
  choixIA = S.modele = m; save();
  if (ancien) { try { await (moteur || await nouvelleIA()).cacheManager.delete(ancien); } catch (err) { console.warn(err); } }
  await moteur?.exit?.(); moteur = null; S.ia = false; save(); majIA();
};

function chargerIA() { return iaEnCours ??= demarrerIA().finally(() => { iaEnCours = null; }); }
async function demarrerIA() {
  if (moteur) return moteur;
  const prog = $('#iaProg'); prog.hidden = false; $('#btnIA').disabled = true;
  iaEtat(iaInstallee() ? 'Démarrage…' : 'Préparation…');
  try {
    // wllama 2.3.7 : dernière version en mémoire 32 bits (Safari sur iPhone ne gère pas la mémoire 64 bits des versions suivantes)
    const w = await nouvelleIA();
    await w.loadModelFromUrl(MODELE(), {
      n_ctx: 2048,
      // Page isolée : tous les cœurs sauf un (garde l'écran fluide), 4 au plus ; sinon 1 seul possible
      n_threads: self.crossOriginIsolated ? Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 2) - 1)) : 1,
      progressCallback: ({ loaded, total }) => {
        const p = total ? Math.round(loaded / total * 100) : 0;
        prog.firstElementChild.style.width = p + '%';
        iaEtat(p < 100 ? `Téléchargement… ${p} %` : 'Démarrage…');
      },
    });
    moteur = w; S.ia = MODELE(); save();
    iaEtat(`Prête · fonctionne sans internet · ${self.crossOriginIsolated ? 'plusieurs cœurs' : '1 cœur'}`); $('#btnIA').hidden = true; prog.hidden = true;
    return moteur;
  } catch (e) {
    console.error(e);
    iaEtat(navigator.onLine || iaInstallee() ? 'Échec : ' + (e.message || e) : 'Il faut internet pour l\'installer la première fois.');
    $('#btnIA').disabled = false; prog.hidden = true; return null;
  }
}
$('#btnIA').onclick = () => {
  if (!iaInstallee() && !confirm(`Télécharger l'assistant IA (environ ${MODELES[choixIA][1]}) ? Fais-le en Wi-Fi, avant de partir.`)) return;
  chargerIA();
};

function contexteSituation() {
  const c = [];
  const p = { rando: 'randonneur', velo: 'cycliste', alpi: 'alpiniste', voyage: 'voyageur', survie: 'en situation de survie', mer: 'marin, en mer' }[S.profil] || 'randonneur';
  c.push(`Utilisateur : ${p}.`);
  if (pos) c.push(`Position : ${ici()[0].toFixed(4)}, ${ici()[1].toFixed(4)}${pos.coords.altitude != null ? ', altitude ' + Math.round(pos.coords.altitude) + ' m' : ''}.`);
  if (dernierVillage) c.push(`Lieu habité le plus proche : ${dernierVillage.p[0]} à ${fmtDist(dernierVillage.d)} direction ${cardinal(dernierVillage.cap)}.`);
  c.push(`Lumière : ${$('#nuitDans').textContent}. Heure : ${new Date().toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' })}.`);
  return c.join(' ');
}

// Discussion : chaque question s'ajoute sous les précédentes, l'IA garde en tête les 2 derniers échanges
// Pas gardée : à chaque ouverture de l'app, le Guide repart sur « Demander » (demande d'Aziz)
let fil = []; if (S.fil) { delete S.fil; save(); } // efface l'ancienne discussion gardée par les versions d'avant
const bulleIA = (x, enCours) => `<div class="bulle ia">${enCours ? `<div id="iaTexte" class="meta">${x.attente}</div>` : x.r ? `<div class="txt">${esc(x.r)}</div>` : ''}${x.extra || ''}</div>`;
function afficherFil(enCours) {
  $('#reponse').hidden = !fil.length; $('#filVider').hidden = !fil.length;
  $('#reponse').innerHTML = fil.map((x, i) => `<div class="bulle moi">${esc(x.q)}</div>${bulleIA(x, enCours && i === fil.length - 1)}`).join('');
}
const garderFil = () => {}; // la discussion reste seulement tant que l'app est ouverte
afficherFil();
$('#filVider').onclick = () => { fil = []; garderFil(); afficherFil(); $('#question').focus(); };

$('#btnDemander').onclick = async () => {
  const q = $('#question').value.trim(); if (!q) return $('#question').focus();
  if (iaOccupee) return;
  $('#question').value = ''; $('#question').blur();
  // Question de suite (« et sans citron ? ») : on cherche aussi avec la question d'avant
  const prec = fil[fil.length - 1], qCherche = prec && motsCle(q).length < 3 ? prec.q + ' ' + q : q;
  const sources = chercher(qCherche).slice(0, 3), wiki = chercherWiki(qCherche, 2);
  const liens = sources.length || wiki.length ? `<div class="src">${sources.map(f => `<button class="chip" data-ouvre="${f.id}">${f.titre}</button>`).join('')}${wiki.map(a => `<button class="chip" data-wiki="${esc(a.t)}">Wikipédia : ${esc(a.t)}</button>`).join('')}</div>` : '';
  // Solution immédiate : les gestes de la fiche la plus liée, sans attendre l'IA
  const mots = motsCle(qCherche), titreLie = t => mots.length && mots.filter(m => contient(norm(t), m)).length > mots.length / 2;
  const f = sources.find(x => titreLie(x.titre + ' ' + x.mots)), w = wiki.find(a => titreLie(a.t));
  const gestes = f ? (f.corps.match(/<(ol|ul)>[\s\S]*?<\/\1>/) || [''])[0] : '';
  const rapide = gestes ? `<div class="fiche-rapide"><div class="k">${f.titre} · à faire tout de suite</div>${gestes}</div>` : '';
  const x = { q, r: '', extra: rapide + liens, attente: 'Démarrage de l\'IA…' };
  fil.push(x); afficherFil(true);
  const montrer = () => $('#reponse').lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  montrer();
  if (!moteur && iaInstallee()) await chargerIA();
  if (!moteur) {
    x.r = rapide || liens ? '' : 'Rien ne correspond. Essaie avec d\'autres mots, ou installe l\'assistant IA ci-dessous.';
    if (!rapide && liens) x.extra = '<b>Ce qui répond à ta question :</b>' + liens;
    garderFil(); afficherFil(); return;
  }
  // ponytail: une seule source coupée à 600 caractères (la fiche, sinon l'article Wikipédia) : sur le processeur d'un téléphone, chaque mot lu coûte du temps
  // L'IA ne reçoit que la source vraiment liée (f ou w ci-dessus) : une fiche hors sujet l'égare et la ralentit
  const base = f ? `${f.titre}\n${f.corps.replace(/<li>/g, '- ').replace(/<[^>]+>/g, '').replace(/\n+/g, '\n').slice(0, 600)}`
    : w ? `${w.t}\n${w.x.replace(/^=+.*=+$/gm, '').replace(/\n+/g, '\n').slice(0, 600)}` : '';
  // Les 2 échanges précédents, raccourcis : l'IA comprend « et si… », « pourquoi ? »
  const hist = fil.slice(-3, -1).filter(e => e.r).map(e => `<|im_start|>user\n${e.q}<|im_end|>\n<|im_start|>assistant\n${e.r.slice(0, 300)}<|im_end|>\n`).join('');
  // ponytail: prompt Qwen (ChatML) écrit à la main. Avec une fiche, réponse amorcée par « 1. » : sans ça le petit modèle (0,5B)
  // recopie les consignes ou pose des questions au lieu de donner les gestes. Sans fiche : réponse courte de lui-même.
  const amorce = base ? '1.' : '';
  const prompt = base
    ? `<|im_start|>system\nTu es un guide de survie. Tu donnes les gestes à faire, en français, en 3 à 5 étapes numérotées, d'après la fiche.<|im_end|>\n${hist}<|im_start|>user\nFiche :\n${base}\n\n${contexteSituation()}\n\nQuestion : ${q}<|im_end|>\n<|im_start|>assistant\n1.`
    : `<|im_start|>system\nTu es un guide de survie. Réponds en français, en 2 ou 3 phrases courtes, concrètes et exactes. Si tu ne sais pas, dis-le.<|im_end|>\n${hist}<|im_start|>user\n${q}<|im_end|>\n<|im_start|>assistant\n`;
  // Avant le premier mot, l'IA lit (sur le processeur, ça peut prendre une minute) : un compteur montre qu'elle travaille.
  x.attente = `${base ? 'T’es où ? lit la fiche' : 'T’es où ? réfléchit'}…`; afficherFil(true);
  iaOccupee = true; $('#btnDemander').disabled = true;
  const t0 = Date.now(), chrono = setInterval(() => {
    const el = $('#iaTexte'), s = Math.round((Date.now() - t0) / 1000);
    if (el?.classList.contains('meta')) el.textContent = `${x.attente} ${s} s${s > 10 ? ' · sans internet, l\'IA travaille sur le processeur : patiente' : ''}`;
  }, 1000);
  try {
    await moteur.createCompletion(prompt, {
      nPredict: base ? 200 : 120, // assez pour 5 étapes : au-delà le petit modèle brode
      sampling: { temp: .3, top_p: .9, penalty_repeat: 1.1 }, // peu d'invention (ce réglage était resté coincé dans le commentaire au-dessus)
      useCache: true, // reprend ce que l'IA a déjà lu (consigne, échanges précédents) : les questions de suite démarrent plus vite
      onNewToken: (t, p, texte) => { x.r = (amorce + texte).replace(/\*\*/g, '').trim(); const el = $('#iaTexte'); if (el) { el.className = ''; el.textContent = x.r; } },
    });
  } catch (e) { x.r = 'Erreur de l\'IA : ' + (e.message || e); }
  clearInterval(chrono);
  if (!x.r) x.r = 'L\'IA n\'a rien répondu. Reformule ta question, ou ouvre les fiches ci-dessous.';
  iaOccupee = false; $('#btnDemander').disabled = false;
  garderFil(); afficherFil(); montrer();
};
let iaOccupee = false;
$('#question').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btnDemander').click(); });
$('#reponse').onclick = e => { const b = e.target.closest('[data-ouvre],[data-wiki]'); if (!b) return; b.dataset.ouvre ? ouvrirFiche(b.dataset.ouvre) : ouvrirWiki(b.dataset.wiki); };

// ---------- Bivouac ----------
const DANGERS = [
  ['riviere', 'Dans un lit de rivière, un ravin ou près d\'un ruisseau à sec', 2],
  ['arbres', 'Sous des arbres ou branches mortes', 2],
  ['falaise', 'Au pied d\'une falaise ou d\'un éboulis', 2],
  ['neige', 'Sur ou sous une pente enneigée', 2],
  ['crete', 'Sur une crête ou un sommet exposé', 1],
  ['creux', 'Dans un creux où l\'eau peut s\'accumuler', 1],
  ['insectes', 'Près d\'une fourmilière, d\'un nid ou de traces fraîches d\'animaux', 1],
  ['sol', 'Rien pour s\'isoler du sol', 1],
];
$('#btnBivouac').onclick = () => {
  const auto = [];
  if (pos && POINTS.length) {
    const [d] = nearest(POINTS.filter(p => p[0] === 'danger'), ici(), 1, p => [p[2], p[3]]);
    if (d && d.d < 400) auto.push([2, `Passage délicat répertorié à ${fmtDist(d.d)} : « ${esc(d.p[1])} »`]);
    if ((pos.coords.altitude ?? 0) > 2500) auto.push([1, `Altitude ${Math.round(pos.coords.altitude)} m : nuit froide, risque de mal des montagnes`]);
    const [eau] = nearest(POINTS.filter(p => p[0] === 'eau'), ici(), 1, p => [p[2], p[3]]);
    if (eau && eau.d < 1500) auto.push([0, `Point d'eau à ${fmtDist(eau.d)} ${cardinal(eau.cap)}`]);
  }
  const s = sunTimes(new Date(), ...(pos ? ici() : [46.6, 2.4]));
  if (s.set && s.set - Date.now() > 0 && s.set - Date.now() < 90 * 60e3) auto.push([1, `Nuit dans ${duree(s.set - Date.now())} : installe-toi maintenant`]);
  popup(`<div class="k">Analyse du bivouac</div><h2>Où je dors, c'est sûr&nbsp;?</h2>
    <div id="verdict"></div>
    <p class="meta">Coche ce qui correspond à ton emplacement.</p>
    ${DANGERS.map(([k, t]) => `<div class="qr"><span>${t}</span><button class="switch" data-danger="${k}" aria-pressed="false"></button></div>`).join('')}
    ${auto.length ? '<div class="k" style="margin-top:14px">T’es où ? a aussi vérifié</div><ul class="liste">' + auto.map(a => `<li>${a[1]}</li>`).join('') + '</ul>' : ''}`);
  const calc = () => {
    const on = $$('[data-danger][aria-pressed="true"]').map(b => DANGERS.find(d => d[0] === b.dataset.danger));
    const max = Math.max(0, ...on.map(d => d[2]), ...auto.map(a => a[0]));
    const [cl, titre, txt] = max >= 2 ? ['rouge', 'Change d\'endroit', 'Danger sérieux pour la nuit. Cherche un emplacement plus sûr avant la nuit.'] : max === 1 ? ['orange', 'Possible, avec précautions', 'Corrige ce qui est coché si tu peux (isole le sol, abrite-toi du vent).'] : ['vert', 'Bon emplacement', 'Isole-toi bien du sol et coupe le vent.'];
    $('#verdict').innerHTML = `<div class="verdict ${cl}"><b>${titre}</b>${txt}</div>`;
  };
  $$('[data-danger]').forEach(b => b.onclick = () => { b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'); calc(); });
  calc();
};
$('#btnPerdu').onclick = () => ouvrirFiche('perdu');

// ---------- Moi : profil, fiche, contacts, plan, sac ----------
const PROFILS = { rando: 'Randonneur', alpi: 'Alpiniste', mer: 'Marin', voyage: 'Voyageur', survie: 'Survie', velo: 'Cycliste' };
const SACS = {
  base: ['Eau 2 L', 'Couverture de survie', 'Sifflet', 'Lampe frontale', 'Batterie externe', 'Trousse de secours', 'Couteau', 'Briquet', 'Coupe-vent', 'Couche chaude', 'En-cas', 'Carte papier'],
  alpi: ['DVA, pelle, sonde', 'Casque', 'Crampons', 'Lunettes catégorie 4', 'Crème solaire'],
  voyage: ['Copie du passeport', 'Carte bancaire de secours', 'Adaptateur prise', 'Médicaments habituels'],
  survie: ['Pastilles de purification', 'Bâche', 'Corde 10 m', 'Hameçons et fil', 'Allume-feu'],
  rando: ['Bâtons', 'Chapeau', 'Pansements ampoules'],
  velo: ['Casque de vélo', 'Pompe et kit de réparation', 'Éclairage avant et arrière'],
  mer: ['Gilet de sauvetage', 'VHF portable étanche', 'Balise de détresse (PLB)', 'Feux à main et fumigène', 'Sac étanche', 'Lampe étanche', 'Compas de relèvement', 'Carte marine papier'],
};
const sacCoche = i => S.sac.includes(i) || S.sac.includes(t(i));
function majProfil() {
  $('#profils').innerHTML = Object.entries(PROFILS).map(([k, v]) => `<button class="chip ${S.profil === k ? 'on' : ''}" data-p="${k}" aria-pressed="${S.profil === k}">${t(v)}</button>`).join('');
  const items = [...SACS.base, ...(SACS[S.profil] || [])];
  $('#sac').innerHTML = items.map(i => `<li data-sac="${esc(i)}" class="${sacCoche(i) ? 'ok' : ''}">${esc(t(i))}</li>`).join('');
  $('#sacScore').textContent = `${items.filter(sacCoche).length} / ${items.length}`;
  $('#merCarte').hidden = $('#sosMer').hidden = S.profil !== 'mer'; // Homme à la mer : seulement avec le profil Marin
}
$('#profils').onclick = e => {
  const profil = e.target.closest('[data-p]')?.dataset.p;
  if (!profil || profil === S.profil) return;
  if (modeIti === modeParDefaut(S.profil)) { modeIti = modeParDefaut(profil); majModes(); }
  S.profil = profil; save(); majProfil();
  if (pos) { majSituation(); majMer(); }
};
$('#sac').onclick = e => {
  const i = e.target.closest('[data-sac]')?.dataset.sac;
  if (!i) return;
  S.sac = sacCoche(i) ? S.sac.filter(x => x !== i && x !== t(i)) : [...S.sac, i];
  save(); majProfil();
};
majProfil();

$$('[data-fiche]').forEach(inp => { if (inp.tagName !== 'INPUT') return; inp.value = S.fiche[inp.dataset.fiche] || ''; inp.oninput = () => { S.fiche[inp.dataset.fiche] = inp.value; save(); }; });

function majContacts() {
  $('#contacts').innerHTML = S.contacts.map((c, i) => `<div class="contact"><input placeholder="Nom" value="${esc(c.nom)}" data-c="${i}" data-k="nom"><input placeholder="Téléphone" type="tel" value="${esc(c.tel)}" data-c="${i}" data-k="tel"><button data-csup="${i}" aria-label="Supprimer">×</button></div>`).join('');
  majPlan(); majSmsProches();
}
$('#contacts').oninput = e => { const t = e.target; if (t.dataset.c == null) return; S.contacts[t.dataset.c][t.dataset.k] = t.value; save(); majPlan(); majSmsProches(); };
$('#contacts').onclick = e => { const i = e.target.dataset.csup; if (i == null) return; S.contacts.splice(i, 1); save(); majContacts(); };
$('#btnContact').onclick = () => { S.contacts.push({ nom: '', tel: '' }); save(); majContacts(); };

$('#planIti').value = S.plan.iti || ''; $('#planRetour').value = S.plan.retour || '';
$('#planIti').oninput = $('#planRetour').oninput = () => { S.plan = { iti: $('#planIti').value, retour: $('#planRetour').value }; save(); majPlan(); };
function majPlan() {
  const cs = S.contacts.filter(c => c.tel);
  const txt = `Je pars en sortie : ${S.plan.iti || '(itinéraire)'}. Retour prévu à ${S.plan.retour || '(heure)'}.${pos ? ` Départ : ${ici()[0].toFixed(5)}, ${ici()[1].toFixed(5)}.` : ''} Si tu n'as pas de nouvelles 2 h après, appelle le 112 et donne-leur cet itinéraire.`;
  $('#planBtns').innerHTML = cs.length ? cs.map(c => `<a class="btn" href="${smsLien(c.tel, txt)}">Envoyer à ${esc(c.nom || c.tel)}</a>`).join('') : '<p class="meta" style="margin:8px 0 0">Ajoute un contact d\'urgence ci-dessous pour envoyer ton plan.</p>';
}
majContacts();

// Fond d'écran de secours (pour l'écran verrouillé)
$('#btnFond').onclick = () => {
  const f = S.fiche, c = document.createElement('canvas'); c.width = 1170; c.height = 2532;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 2532); grad.addColorStop(0, '#0B110E'); grad.addColorStop(1, '#141E19');
  g.fillStyle = grad; g.fillRect(0, 0, 1170, 2532);
  g.strokeStyle = 'rgba(160,210,180,.06)'; g.lineWidth = 2;
  for (let r = 60; r < 1600; r += 60) { g.beginPath(); g.ellipse(200, 300, r * 1.3, r, 0, 0, 7); g.stroke(); }
  g.fillStyle = '#FF3B30'; g.fillRect(90, 1150, 990, 10);
  g.font = '800 64px -apple-system, system-ui, sans-serif'; g.fillText('EN CAS D\'URGENCE', 90, 1260);
  const lignes = [['Nom', f.nom], ['Groupe sanguin', f.sang], ['Allergies', f.allergies], ['Traitements', f.traitements], ...S.contacts.filter(x => x.tel).slice(0, 2).map(x => ['Prévenir', `${x.nom} · ${x.tel}`])].filter(l => l[1]);
  let y = 1380;
  for (const [k, v] of lignes) { g.fillStyle = '#9AAEA2'; g.font = '600 40px -apple-system, system-ui, sans-serif'; g.fillText(k.toUpperCase(), 90, y); g.fillStyle = '#ECF2EA'; g.font = '700 60px -apple-system, system-ui, sans-serif'; g.fillText(String(v).slice(0, 30), 90, y + 72); y += 175; }
  g.fillStyle = '#FF3B30'; g.font = '800 120px -apple-system, system-ui, sans-serif'; g.fillText('112', 90, Math.max(y + 80, 2250));
  const a = document.createElement('a'); a.download = 'fond-ecran-secours.png'; a.href = c.toDataURL('image/png'); a.click();
  popup('<h2>Fond d\'écran créé</h2><p>Mets cette image en <b>fond d\'écran verrouillé</b> (Photos › Partager › Utiliser en fond d\'écran). Un secouriste verra tes infos sans déverrouiller le téléphone.</p>');
};

// Jour / nuit automatique, comme Waze : sombre du coucher au lever du soleil (à ta position, sinon centre de la France)
const estNuit = () => { const s = sunTimes(new Date(), ...(pos ? ici() : [46.6, 2.4])), n = Date.now(); return !s.rise || n < s.rise || n > s.set; };
if (S.theme) { delete S.theme; save(); } // l'ancien mode nuit rouge est retiré
const themeSysteme = matchMedia('(prefers-color-scheme: dark)');
const appliquerTheme = () => {
  const systeme = S.ambiance === 'systeme', nuit = systeme ? themeSysteme.matches : estNuit();
  const avant = document.documentElement.dataset.theme;
  document.documentElement.dataset.theme = nuit ? 'nuit' : 'jour';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', S.ambiance && !systeme ? '#1C1C1E' : nuit ? '#000000' : '#DCE7F3');
  if (avant && avant !== document.documentElement.dataset.theme && styleCarte()[0] === 'auto') plan?.setStyle?.(urlStyle());
  // Styles Studio : même mise en page sombre, couleurs différentes (graphite = l'ancien interrupteur « Style Studio »)
  if (S.studio) { S.ambiance = 'graphite'; delete S.studio; save(); }
  document.documentElement.classList.toggle('studio', !!S.ambiance && !systeme); document.documentElement.dataset.ambiance = S.ambiance || '';
  document.querySelectorAll('#ambiances [data-a]').forEach(b => b.classList.toggle('on', b.dataset.a === (S.ambiance || '')));
};
function choisirAmbiance(ambiance) {
  S.ambiance = ambiance; save(); appliquerTheme();
}
$('#ambiances').onclick = e => { const b = e.target.closest('[data-a]'); if (b) choisirAmbiance(b.dataset.a); };
themeSysteme.addEventListener('change', appliquerTheme);
setInterval(appliquerTheme, 60e3);
appliquerTheme();

// ---------- Réglages de la carte ----------
const reglagesCarte = $('#reglagesCarte'), cartesHorsLigne = $('#cartesHorsLigne');
const ancreCartesHorsLigne = document.createComment('Téléchargements de la carte');
cartesHorsLigne.before(ancreCartesHorsLigne);
$('#btnReglagesCarte').onclick = () => {
  $('#regCartesHorsLigne').append(cartesHorsLigne);
  $('#regStyle').value = styleCarte()[0];
  $('#regLangue').value = LANGUE;
  $('#regLangueCarte').value = S.langueCarte || '';
  $('#regTheme').value = S.ambiance || '';
  $('#regAccueil').value = S.accueil || 'situation';
  $('#regPolice').value = String(S.tailleCarte || 1);
  $('#regRelief').checked = S.relief !== false;
  $('#regLieux').checked = S.lieuxCarte !== false;
  $('#regTrace').checked = !!S.traceCarte;
  $('#regPoints').checked = S.pointsCarte !== false;
  $('#regVerrouillage').checked = S.verrouillageCarte !== false;
  $('#regDebit').value = String(S.debitVoix || .95);
  $('#regUnites').value = FMT.imperial ? 'imperial' : 'metrique';
  majListeVoix();
  majVoix();
  reglagesCarte.showModal();
  if ($('#regCache').open) majCacheCarte();
};
$('#fermerReglagesCarte').onclick = () => reglagesCarte.close();
reglagesCarte.addEventListener('close', () => {
  ancreCartesHorsLigne.after(cartesHorsLigne);
  $('#btnReglagesCarte').focus({ preventScroll: true });
});
$('#regStyle').onchange = e => changerStyleCarte(e.target.value);
$('#regLangue').onchange = e => { $('#langue').value = e.target.value; $('#langue').onchange(); };
$('#regLangueCarte').onchange = e => { S.langueCarte = e.target.value; save(); majLangueCarte(); };
$('#regTheme').onchange = e => choisirAmbiance(e.target.value);
$('#regAccueil').onchange = e => { S.accueil = e.target.value; save(); };
$('#regPolice').onchange = e => { S.tailleCarte = Number(e.target.value); save(); majPoliceCarte(); };
$('#regRelief').onchange = () => $('#btnRelief').click();
$('#regLieux').onchange = e => { S.lieuxCarte = e.target.checked; save(); majLieuxCarte(); majPointsPlan(); };
$('#regTrace').onchange = e => { S.traceCarte = e.target.checked; save(); majTraceCarte(); };
$('#regPoints').onchange = e => { S.pointsCarte = e.target.checked; save(); majPointsPlan(); };
$('#regVerrouillage').onchange = e => { S.verrouillageCarte = e.target.checked; save(); majVerrouillage(); };
$('#regVoix').onchange = () => $('#btnVoixGps').click();
$('#regDangers').onchange = () => $('#btnAlerteDanger').click();
$('#regVoixChoix').onchange = e => {
  S.voixChoisie ??= {};
  S.voixChoisie[LANGUE] = e.target.value;
  save();
};
$('#regDebit').onchange = e => { S.debitVoix = Number(e.target.value); save(); };
$('#regVoixEcouter').onclick = () => {
  stopperVoix();
  prononcer(t('Dans trois cents mètres, tourne à droite. Puis continue tout droit.'));
};
window.speechSynthesis?.addEventListener('voiceschanged', majListeVoix);
$('#regUnites').onchange = e => {
  S.unites = e.target.value; FMT.imperial = S.unites === 'imperial'; save();
  majTrace(); majBoussole();
  if (pos) majSituation();
  if (S.route) dessinerRoute(S.route, false);
  if (guidage) majGuidage();
  if (!$('#itiChoix').hidden) proposerItis();
};

async function majCacheCarte(vide = false) {
  const info = $('#regCacheInfo'), bouton = $('#regCacheVider');
  bouton.disabled = true;
  try {
    if (vide) await caches.delete('repere-tuiles');
    const cache = await caches.open('repere-tuiles'), n = (await cache.keys()).length;
    info.textContent = t('{n} fichiers vus en naviguant. Tes zones téléchargées sont gardées à part.', { n });
    bouton.disabled = !n;
  } catch {
    info.textContent = t('Cache indisponible dans ce navigateur.');
  }
}
$('#regCache').addEventListener('toggle', () => { if ($('#regCache').open) majCacheCarte(); });
$('#regCacheVider').onclick = () => majCacheCarte(true);

let verrouCarte = null, demandeVerrou = false;
async function majVerrouillage() {
  const garder = () => S.verrouillageCarte === false && !document.hidden && $('#v-carte').classList.contains('active');
  const info = $('#regVerrouillageInfo');
  if (!navigator.wakeLock) {
    $('#regVerrouillage').disabled = true;
    info.textContent = t('Le navigateur gère le verrouillage de l’écran.');
    return;
  }
  if (!garder()) {
    info.textContent = '';
    if (verrouCarte) {
      const verrou = verrouCarte;
      verrouCarte = null;
      await verrou.release().catch(() => {});
    }
    return;
  }
  if (verrouCarte || demandeVerrou) return;
  demandeVerrou = true;
  try {
    const verrou = await navigator.wakeLock.request('screen');
    if (!garder()) { await verrou.release(); return; }
    verrouCarte = verrou;
    info.textContent = t('L’écran reste allumé tant que la carte est visible.');
    verrou.addEventListener('release', () => {
      if (verrouCarte !== verrou) return;
      verrouCarte = null;
      info.textContent = garder() ? t('Le verrouillage est de nouveau géré par le navigateur.') : '';
    });
  } catch {
    info.textContent = t('Le navigateur gère le verrouillage de l’écran.');
  } finally {
    demandeVerrou = false;
  }
}
document.addEventListener('visibilitychange', majVerrouillage);

$('#regExporter').onclick = () => {
  const contenu = JSON.stringify({ format: 'tes-ou-carte', version: 1, points: S.points, trace: S.trace }, null, 2);
  const url = URL.createObjectURL(new Blob([contenu], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'tes-ou-points-et-parcours.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('#regImportBouton').onclick = () => $('#regImporter').click();
$('#regImporter').onchange = async e => {
  const input = e.target, f = input.files[0], info = $('#regImportInfo');
  if (!f) return;
  input.value = '';
  try {
    if (f.size > 10 * 1024 * 1024) throw new Error('taille');
    const { format, version, points, trace } = JSON.parse(await f.text());
    const coord = (lat, lon) => Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180;
    const dateValide = n => Number.isFinite(n) && n >= 0 && n <= 8.64e15;
    const pointValide = p => p && typeof p.id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(p.id) && typeof p.nom === 'string' &&
      p.nom.length <= 1024 && coord(p.lat, p.lon) && dateValide(p.t);
    const traceValide = p => Array.isArray(p) && p.length === 3 && coord(p[0], p[1]) && dateValide(p[2]);
    if (format !== 'tes-ou-carte' || version !== 1 || !Array.isArray(points) || !Array.isArray(trace) ||
        !points.every(pointValide) || !trace.every(traceValide)) throw new Error('format');
    const ids = new Set(S.points.map(p => p.id)), releves = new Set(S.trace.map(p => p.join(',')));
    for (const { id, nom, lat, lon, t } of points) {
      if (!ids.has(id)) { ids.add(id); S.points.push({ id, nom, lat, lon, t }); }
    }
    const parcours = [];
    for (const point of trace) {
      const cle = point.join(',');
      if (!releves.has(cle)) { releves.add(cle); parcours.push(point); }
    }
    if (parcours.length) S.trace = S.trace.concat(parcours).sort((a, b) => a[2] - b[2]);
    save(); majPoints(); majPointsPlan(); majTrace();
    info.textContent = t('Sauvegarde importée.');
  } catch {
    info.textContent = t('Fichier illisible ou format de sauvegarde incorrect.');
  }
};


// ---------- T’es où ? à proximité : Bluetooth (application Android) ou réseau cellulaire (version web, iPhone) ----------
// Par le réseau, les positions passent par le relais public ntfy.sh, chiffrées avec le code du groupe :
// le relais ne voit qu'un message illisible. ponytail: relais gratuit à débit limité, serveur ntfy à soi si l'app grossit.
const RELAIS = 'https://ntfy.sh/';
const b64 = u => btoa(String.fromCharCode(...u)), deb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
function proxiReseau() {
  const ecoute = {}, enc = new TextEncoder();
  let es = null, cle = null, sujet = null, derniere = 0, derniereCharge = null, attente = null;
  const emettre = (nom, v) => ecoute[nom]?.(v);
  async function publier(c, siEchec) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ch = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cle, enc.encode(JSON.stringify(c))));
    fetch(RELAIS + sujet, { method: 'POST', body: b64(iv) + '.' + b64(ch) })
      .then(r => { if (!r.ok) emettre('etat', { erreur: r.status === 429 ? 'Relais saturé : nouvel essai bientôt' : 'Relais indisponible' }); })
      .catch(siEchec);
  }
  function envoyer(c) {
    derniereCharge = c; attente = null; derniere = Date.now();
    return publier(c, () => { attente = c; emettre('etat', { erreur: 'Pas de réseau : position en attente' }); });
  }
  // Toutes les 15 s : envoie si on a bougé (au plus toutes les 2 min), sinon un signe de vie toutes les 10 min
  setInterval(() => {
    if (!es) return;
    const dt = Date.now() - derniere;
    if ((attente && dt > 120000) || dt > 600000) envoyer(attente || derniereCharge);
  }, 15000);
  return {
    addListener: (nom, f) => { ecoute[nom] = f; },
    async demarrer(c, code) {
      const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode('sujet:' + code)));
      sujet = 'repere-' + [...h.slice(0, 12)].map(x => x.toString(16).padStart(2, '0')).join('');
      const base = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveKey']);
      cle = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: enc.encode('repere-groupe'), iterations: 100000, hash: 'SHA-256' },
        base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      es = new EventSource(RELAIS + sujet + '/sse?since=15m');
      es.onopen = () => emettre('etat', { erreur: '● Groupe connecté · réseau' });
      es.onerror = () => emettre('etat', { erreur: 'Réseau coupé : reconnexion…' });
      es.onmessage = async e => {
        try {
          const m = JSON.parse(e.data);
          if (m.event !== 'message') return;
          const [iv, ch] = m.message.split('.').map(deb64);
          const v = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cle, ch)));
          if (v.danger) emettre('danger', v.danger);
          else if (typeof v.id === 'number') emettre('trouve', { ...v, reseau: true, vu: m.time * 1000 });
        } catch {} // message d'un autre groupe ou abîmé
      };
      await envoyer(c);
      return { emission: true };
    },
    maj(c, force) { if (force) envoyer(c); else attente = c; },
    danger(d) { if (es) publier({ danger: d }, () => emettre('etat', { erreur: 'Pas de réseau : danger gardé dans ton téléphone seulement' })); },
    async arreter() { es?.close(); es = null; },
  };
}
const NATIF = window.Capacitor?.isNativePlatform?.();
const Proxi = NATIF ? window.Capacitor.registerPlugin('Proximite') : proxiReseau();
const ETAT0 = NATIF ? 'Sans réseau · Bluetooth' : 'Par le réseau · code de groupe';
$('#proxiEtat').textContent = ETAT0;
const TX_1M = -59, N_ENV = 2.5; // ponytail: estimation de distance par le signal, à calibrer en vrai (forêt ≈ 3, terrain dégagé ≈ 2)
S.idProxi ??= Math.floor(Math.random() * 65536); save();
let proxiOn = false, proxiSos = false, voisins = new Map(), alertesVues = new Set(), proxiDernierePos = null;

const chargeProxi = () => ({
  id: S.idProxi, statut: proxiSos ? 1 : 0,
  nom: (S.fiche.surnom || S.fiche.nom || 'ANON').normalize('NFD').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4),
  ...(pos ? { lat: ici()[0], lon: ici()[1] } : {}),
});

{
  Proxi.addListener('trouve', v => {
    if (v.id === S.idProxi) return;
    voisins.set(v.id, { ...v, vu: v.vu ?? Date.now() });
    if (v.statut === 1 && !alertesVues.has(v.id)) {
      alertesVues.add(v.id); navigator.vibrate?.([400, 150, 400, 150, 400]); bip(500, 1800);
      popup(`<div class="k">Alerte à proximité</div><h2>${esc(v.nom || 'Quelqu\'un')} demande de l'aide</h2><p>${decrireVoisin(v)}</p><p class="note">Approche-toi prudemment, appelle le 112 si tu peux, et donne ses coordonnées.</p>`);
    }
    majVoisins();
  });
  Proxi.addListener('etat', e => { $('#proxiEtat').textContent = e.erreur; });
  if (!NATIF) Proxi.addListener('danger', recevoirDanger);
  setInterval(majVoisins, 5000);
  setTimeout(majVoisins);
}

function decrireVoisin(v) {
  if (v.lat != null && pos) {
    const d = distance(ici(), [v.lat, v.lon]), cap = bearing(ici(), [v.lat, v.lon]);
    return `${fmtDist(d)} · ${cardinal(cap)} (${Math.round(cap)}°) · position GPS ${v.lat.toFixed(4)}, ${v.lon.toFixed(4)}`;
  }
  if (v.rssi == null) return 'position GPS pas encore connue';
  const d = 10 ** ((TX_1M - v.rssi) / (10 * N_ENV));
  return `environ ${fmtDist(d)} (selon le signal)`;
}

function majVoisins() {
  const now = Date.now();
  for (const [id, v] of voisins) if (now - v.vu > (v.reseau ? 900000 : 30000)) voisins.delete(id);
  const loin = v => v.lat != null && pos ? distance(ici(), [v.lat, v.lon]) : -(v.rssi ?? -999);
  const liste = [...voisins.values()].sort((a, b) => b.statut - a.statut || loin(a) - loin(b));
  $('#proxiListe').innerHTML = liste.length ? liste.map(v => {
    const cap = v.lat != null && pos ? bearing(ici(), [v.lat, v.lon]) : null;
    return `<li class="${v.statut === 1 ? 'alerte' : ''}"><span class="pastille">${v.statut === 1 ? 'SOS' : esc((v.nom || '?').slice(0, 2))}</span>
      <span class="nom"><b>${esc(v.nom || 'Anonyme')}${v.statut === 1 ? ' · demande de l\'aide' : ''}</b><span>${decrireVoisin(v)}</span></span>
      <span class="dist">${cap != null ? `<svg data-cap="${cap}" style="transform:rotate(${cap - (heading ?? 0)}deg)"><use href="#i-fleche"/></svg>` : ''}<br><small class="meta">il y a ${depuis(now - v.vu)}</small></span></li>`;
  }).join('') : `<li class="meta">${proxiOn ? `Recherche… Les autres doivent avoir T’es où ? ouvert avec « Repérer les autres » activé${NATIF ? '' : ' et le même code de groupe'}.`
    : NATIF ? 'Personne pour l\'instant.' : 'Avec les données cellulaires : choisis un code de groupe et donne-le à tes proches. Vous vous voyez à n\'importe quelle distance, positions chiffrées.'}</li>`;
}
function depuis(ms) {
  const s = Math.round(ms / 1000);
  return s < 60 ? s + ' s' : s < 3600 ? Math.round(s / 60) + ' min' : Math.round(s / 3600) + ' h';
}

$('#btnProxi').onclick = async () => {
  const b = $('#btnProxi');
  if (proxiOn) {
    await Proxi.arreter(); proxiOn = false; proxiSos = false; voisins.clear();
    b.textContent = 'Repérer les autres'; b.classList.add('primaire'); $('#btnProxiSos').disabled = true; $('#btnProxiSos').classList.remove('sos-on');
    $('#proxiEtat').textContent = ETAT0; majVoisins(); return;
  }
  if (!NATIF) {
    const code = prompt('Code du groupe (6 caractères minimum). Donne le même code à tes proches : seuls ceux qui l\'ont te voient.', S.groupe || '');
    if (!code || code.trim().length < 6) return code != null && popup('<h2>Code trop court</h2><p>Choisis au moins 6 caractères, par exemple « aziz2026 ».</p>');
    S.groupe = code.trim().toLowerCase(); save();
  }
  if (!watchId) demarrerGps();
  try {
    const r = await Proxi.demarrer(chargeProxi(), S.groupe);
    proxiOn = true; b.textContent = 'Arrêter'; b.classList.remove('primaire'); $('#btnProxiSos').disabled = false;
    $('#proxiEtat').textContent = r.emission ? '● Visible et à l\'écoute' : '● À l\'écoute (ce téléphone ne peut pas émettre)';
    majVoisins();
  } catch (e) { popup(`<h2>${NATIF ? 'Bluetooth' : 'Réseau'}</h2><p>${esc(e.message || e)}</p>`); }
};
$('#btnProxiSos').onclick = () => {
  proxiSos = !proxiSos;
  $('#btnProxiSos').classList.toggle('sos-on', proxiSos);
  $('#btnProxiSos').textContent = proxiSos ? 'SOS envoyé · arrêter' : 'Envoyer un SOS';
  Proxi.maj(chargeProxi(), true);
};
// Position partagée : mise à jour quand on a bougé de plus de 20 m
setInterval(() => {
  if (!proxiOn || !pos) return;
  if (!proxiDernierePos || distance(proxiDernierePos, ici()) > 20) { proxiDernierePos = ici(); Proxi.maj(chargeProxi()); }
}, 15000);

// ---------- Radio en direct (Radio France, par les données cellulaires) ----------
// Radio France en 128 kbit/s (≈ 60 Mo/h, bonne qualité) ; RFI en 64 kbit/s, les autres en 128 kbit/s.
const RF = s => `https://icecast.radiofrance.fr/${s}-midfi.mp3`;
const RADIOS = {
  info: ['Infos', {
    franceinfo: ['franceinfo', RF('franceinfo'), 60], franceinter: ['France Inter', RF('franceinter'), 60],
    rfi: ['RFI', 'https://rfimonde64k.ice.infomaniak.ch/rfimonde-64.mp3', 30], europe1: ['Europe 1', 'https://stream.europe1.fr/europe1.mp3', 60],
    rtl: ['RTL', 'https://icecast.rtl.fr/rtl-1-44-128', 60], rmc: ['RMC', 'https://audio.bfmtv.com/rmcradio_128.mp3', 60],
    bfm: ['BFM Business', 'https://audio.bfmtv.com/bfmbusiness_128.mp3', 60], sud: ['Sud Radio', 'https://start-sud.ice.infomaniak.ch/start-sud-high.mp3', 60],
  }],
  autres: ['Musique et culture', {
    fip: ['FIP', RF('fip'), 60], franceculture: ['France Culture', RF('franceculture'), 60], mouv: ['Mouv\'', RF('mouv'), 60], francemusique: ['France Musique', RF('francemusique'), 60],
  }],
};
const STATIONS = Object.assign({}, ...Object.values(RADIOS).map(g => g[1]));
// Icônes maison (pas les logos des radios, qui sont des marques)
// Vrais logos des radios (Wikimedia Commons, domaine public), gardés dans l'app pour marcher hors ligne
const LOGO_RADIO = k => `radios/${k}.${k === 'europe1' ? 'png' : 'svg'}`;
let lecteur = null;
let radioOn = null;
$('#radios').innerHTML = Object.values(RADIOS).map(([titre, st]) => `<div class="meta radio-groupe">${titre}</div>
  <div class="chips">${Object.entries(st).map(([k, v]) => `<button class="chip chip-radio" data-r="${k}"><img class="logo-radio" src="${LOGO_RADIO(k)}" alt=""> ${v[0]}</button>`).join('')}</div>`).join('');
function majRadio(t) {
  $$('#radios .chip').forEach(c => c.classList.toggle('on', c.dataset.r === radioOn));
  $('#radioEtat').textContent = t || (radioOn ? `● En direct · ~${STATIONS[radioOn][2]} Mo/h` : 'Par les données cellulaires');
}
$('#radios').onclick = e => {
  const b = e.target.closest('[data-r]'); if (!b) return;
  if (radioOn === b.dataset.r) { radioOn = null; couperRadio(); }
  else {
    radioOn = b.dataset.r; relances = 0; ecouter();
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: STATIONS[radioOn][0], artist: 'T’es où ? · radio' });
  }
  majRadio();
};
function couperRadio() { if (!lecteur) return; lecteur.onerror = lecteur.onended = null; lecteur.pause(); lecteur.removeAttribute('src'); lecteur.load(); lecteur = null; }
// Un lecteur neuf et une adresse unique à chaque écoute : sinon Safari rejouait un morceau déjà entendu
// (« ça se répète », « toutes les radios disent la même chose ») au lieu du direct
let relances = 0;
function ecouter() {
  couperRadio(); const a = lecteur = new Audio();
  // ponytail: Europe 1 n'autorise pas les autres sites (pas de CORS) : sans crossOrigin elle passe partout sauf Safari isolé
  a.crossOrigin = radioOn === 'europe1' ? null : 'anonymous';
  a.preload = 'none';
  a.src = STATIONS[radioOn][1] + '?direct=' + Date.now();
  a.onwaiting = () => radioOn && majRadio('Chargement…');
  a.onplaying = () => { relances = 0; majRadio(); };
  // Un direct ne s'arrête jamais : coupure de réseau → on se reconnecte au direct (3 essais)
  a.onended = a.onerror = () => { if (!radioOn || a !== lecteur) return; if (relances++ < 3) setTimeout(() => a === lecteur && ecouter(), 1500); else majRadio('Pas de réseau : radio indisponible'); };
  a.play().catch(() => majRadio('Lecture refusée : touche à nouveau la station'));
}

// ---------- Mode survie : T’es où ? prend les choses en main ----------
let survie = false, coachT = 0, derniereGorgee = Date.now(), refusConsignes = new Set();
let batterie = null;
navigator.getBattery?.().then(b => batterie = b).catch(() => {});

$('#btnSurvie').onclick = () => {
  survie = !survie;
  document.documentElement.classList.toggle('survie', survie);
  $('#btnSurvie').setAttribute('aria-pressed', survie);
  $('#coach').hidden = !survie;
  clearInterval(coachT);
  if (survie) {
    if (!watchId) demarrerGps();
    S.profil = 'survie'; save(); majProfil();
    ouvrir('situation'); refusConsignes.clear(); derniereGorgee = Date.now();
    coach(); coachT = setInterval(coach, 60e3);
  }
};

function consignes() {
  const c = [], now = Date.now();
  const s = majSoleil();
  // Alertes météo (orage, chute de pression, coup de vent) en premier : ce sont les plus urgentes
  const M = S.meteo, mi = M ? indexHeure(M) : -1;
  if (mi >= 0) for (const a of alertesMeteo(M, mi, 6)) c.push(['meteo' + a.slice(0, 3), a + t('. Mets-toi à l\'abri à temps.'), [['Orage et foudre', () => ouvrirFiche('orage')]]]);
  if (!pos) c.push(['gps', 'Active ta position : sors à découvert et attends le signal GPS.', [['Activer le GPS', demarrerGps]]]);
  if (!S.points.length && pos) c.push(['camp', 'Marque ta position actuelle : tu pourras toujours y revenir.', [['Marquer ce point', () => $('#btnMarquer').click()]]]);
  if (batterie && !batterie.charging && batterie.level < .2) c.push(['bat', `Batterie à ${Math.round(batterie.level * 100)} %. Mode avion, luminosité au minimum, téléphone contre toi.`, []]);
  if (s.set && now < s.set && s.set - now < 90 * 60e3) c.push(['nuit', `La nuit tombe dans ${duree(s.set - now)}. Commence ton abri maintenant.`, [['Comment faire un abri', () => ouvrirFiche('abri')], ['Vérifier l\'emplacement', () => $('#btnBivouac').click()]]]);
  if (s.set && now > s.set) c.push(['dort', 'Il fait nuit. Reste à l\'abri, isolé du sol. Ne marche pas dans le noir.', [['Où ne pas dormir', () => ouvrirFiche('bivouac')]]]);
  if (now - derniereGorgee > 2 * 3600e3) c.push(['eau', 'Ça fait 2 heures. Bois quelques gorgées.', [['J\'ai bu', () => { derniereGorgee = Date.now(); refusConsignes.delete('eau'); coach(); }], ['Trouver de l\'eau', () => ouvrirFiche('eau-trouver')]]]);
  const tdn = $('#tendance');
  if (tdn.classList.contains('mal')) c.push(['loin', `Tu t'éloignes de ${dernierVillage?.p[0] || 'la civilisation'}. Arrête-toi et regarde la flèche.`, [['Je suis perdu', () => ouvrirFiche('perdu')]]]);
  if (dernierVillage) c.push(['civi', t('{v} est à {d} vers le {c}. Si quelqu\'un sait où tu es, reste visible sur place.', { v: dernierVillage.p[0], d: fmtDist(dernierVillage.d), c: cardinal(dernierVillage.cap) }), [['Signaux de détresse', () => ouvrirFiche('signaux')]]]);
  c.push(['stop', 'Respire. Fais le point : eau, nourriture, chaleur, blessures.', [['Les priorités', () => ouvrirFiche('priorites')]]]);
  return c.filter(x => !refusConsignes.has(x[0]));
}
function coach() {
  if (!survie) return;
  $('#coach').classList.toggle('panique', $('#v-guide')?.classList.contains('active')); // onglet Guide : juste « Pas de panique », en gros
  const [cur] = consignes();
  if (!cur) return;
  const [id, msg, actions] = cur;
  if (coach.dernier !== msg) { coach.dernier = msg; const m = $('#coachMsg'); m.textContent = msg; m.classList.remove('neuf'); void m.offsetWidth; m.classList.add('neuf'); }
  const box = $('#coachActions'); box.innerHTML = '';
  [...actions, ['Compris', () => { refusConsignes.add(id); coach(); }]].forEach(([t, fn], i) => {
    const b = document.createElement('button'); b.className = 'btn petit' + (i === 0 ? ' primaire' : ''); b.textContent = t; b.onclick = fn; box.append(b);
  });
  if (['nuit', 'bat', 'loin'].includes(id) && !coach.vu?.has(id)) { (coach.vu ??= new Set()).add(id); navigator.vibrate?.([200, 100, 200]); }
}

// ---------- Premier lancement : avertissement de sécurité, âge et conditions (une fois) ----------
// Page d'accueil à chaque ouverture (demande d'Aziz) : choix de la langue, avertissement, conditions
{
  popup(`<div class="chips langues" style="margin-bottom:14px">${[['fr', 'Français'], ['en', 'English'], ['es', 'Español']].map(([l, n]) => `<button class="chip${l === LANGUE ? ' on' : ''}" data-l="${l}">${n}</button>`).join('')}</div><div class="k">Avant de commencer</div><h2>L'application. T'es ou ? Mais ne te sauve PAS</h2>
    <p><b>En danger, appelle le 112.</b> T’es où ? ne prévient pas les secours à ta place. Les refuges, dangers, itinéraires, la météo et les réponses de l'IA peuvent être faux ou anciens : vérifie sur place et garde une carte et une boussole.</p>
    <p>Utilisation seul à partir de 15 ans ; avant, avec l'accord d'un parent. Ne touche pas ton téléphone en conduisant.</p>
    <p class="note">En continuant, tu acceptes les <a href="legal.html#cgu" target="_blank" rel="noopener">conditions d'utilisation</a>. Tes données restent dans ton téléphone : <a href="legal.html#confidentialite" target="_blank" rel="noopener">confidentialité</a>.</p>
    <button class="btn primaire large" id="btnAverti">J'ai compris</button>
    <p class="note" style="text-align:center;margin-top:12px"><a href="legal.html" target="_blank" rel="noopener">Mentions légales</a></p>`);
  $('#btnAverti').onclick = () => { S.averti = '2026-11-19'; save(); modal.close(); };
  $('#modalBody .langues').onclick = e => { const l = e.target.closest('[data-l]')?.dataset.l; if (l && l !== LANGUE) { S.langue = l; save(); location.reload(); } };
}

// Choix de la langue (onglet Moi) : l'app se recharge dans la nouvelle langue
$('#langue').value = LANGUE;
$('#langue').onchange = () => { S.langue = $('#langue').value; save(); location.reload(); };

if (S.accueil === 'carte') ouvrir('carte');
