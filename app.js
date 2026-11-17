import { distance, bearing, nearest, cardinal, fmtDist, dms, sunTimes } from './geo.js';
import { FICHES, CATS, risquesLocaux } from './guide.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- Mémoire locale ----------
let S = { profil: 'rando', fiche: {}, contacts: [], points: [], trace: [], sac: [], plan: {}, theme: '', ia: false, cible: null };
try { Object.assign(S, JSON.parse(localStorage.getItem('repere') || '{}')); } catch {}
const save = () => { try { localStorage.setItem('repere', JSON.stringify(S)); } catch {} };

// ---------- Hors ligne ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
const majReseau = () => {
  const el = $('#etatReseau');
  el.textContent = navigator.onLine ? 'Prêt hors réseau' : 'Hors réseau · tout marche';
};
addEventListener('online', majReseau); addEventListener('offline', majReseau); majReseau();

// ---------- Navigation ----------
function ouvrir(vue) {
  $$('.vue').forEach(v => v.classList.toggle('active', v.id === 'v-' + vue));
  $$('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.vue === vue || (b.dataset.vue === 'carte' && vue === 'boussole')));
  $$('[data-seg]').forEach(b => b.classList.toggle('on', b.dataset.seg === vue));
  scrollTo({ top: 0 });
  if (vue === 'carte') setTimeout(initPlan); // Leaflet a besoin d'un conteneur visible
}
$$('.tabs button').forEach(b => b.onclick = () => ouvrir(b.dataset.vue));
$$('[data-seg]').forEach(b => b.onclick = () => ouvrir(b.dataset.seg));

const modal = $('#modal');
function popup(html) { $('#modalBody').innerHTML = html; modal.showModal(); }
$('#modalFermer').onclick = () => { stopMetro(); modal.close(); };
modal.addEventListener('close', stopMetro);

// ---------- Données France ----------
let COMMUNES = [], POINTS = [];
Promise.all([fetch('data/communes.json').then(r => r.json()), fetch('data/points.json').then(r => r.json())])
  .then(([c, p]) => { COMMUNES = c; POINTS = p; if (pos) majSituation(); });

// ---------- GPS ----------
let pos = null, watchId = null, heading = null, villageHist = [];
const ici = () => [pos.coords.latitude, pos.coords.longitude];

function demarrerGps() {
  if (!navigator.geolocation) return popup('<h2>GPS indisponible</h2><p>Ce navigateur ne donne pas accès à la position.</p>');
  $('#posMeta').textContent = 'Recherche des satellites…';
  watchId = navigator.geolocation.watchPosition(onPos, e => {
    const ios = /iPhone|iPad/.test(navigator.userAgent);
    $('#posMeta').textContent = e.code !== 1 ? 'Signal GPS faible : va dans un endroit dégagé.'
      : ios ? 'Localisation refusée. Réglages › Confidentialité et sécurité › Service de localisation › Sites web Safari : « Lorsque l\'app est active ». Puis Réglages › Apps › Safari › Localisation : « Demander ». Ferme et rouvre Repère.'
      : 'Localisation refusée : Paramètres › Applications › Chrome › Autorisations › Position : « Autoriser ».';
    $('#btnGps').hidden = false;
  }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 });
  $('#btnGps').hidden = true;
}
$('#btnGps').onclick = demarrerGps;

function onPos(p) {
  pos = p;
  const [la, lo] = ici();
  $('#coords').textContent = `${la.toFixed(5)}, ${lo.toFixed(5)}`;
  const alt = p.coords.altitude != null ? ` · altitude ${Math.round(p.coords.altitude)} m` : '';
  $('#posMeta').textContent = `Précision ±${Math.round(p.coords.accuracy)} m${alt}`;
  $('#sosCoords').textContent = `${la.toFixed(5)}, ${lo.toFixed(5)}`;
  $('#sosDms').textContent = `${dms(la, 'N', 'S')}  ${dms(lo, 'E', 'O')}`;
  enregistrerTrace();
  majSituation();
  majBoussole();
  majMer();
  meteoAuto();
  majMoiPlan();
}

// ---------- Situation ----------
const TYPES = {
  eau: ['💧', "Point d'eau"], cabane: ['🛖', 'Cabane non gardée'], refuge: ['🏔', 'Refuge gardé'], gite: ['🏠', "Gîte d'étape"],
  abri: ['⛰', 'Abri naturel'], hopital: ['✚', 'Hôpital · urgences'], danger: ['⚠', 'Passage délicat'],
  port: ['⚓', 'Port · marina'], snsm: ['🛟', 'Station de sauvetage'],
};
let dernierVillage = null, depActuel = null;

function rot(el, cap) { if (el) el.style.transform = `rotate(${cap - (heading ?? 0)}deg)`; }

function majSituation() {
  if (!pos || !COMMUNES.length) return;
  const here = ici();
  const [v] = nearest(COMMUNES, here);
  dernierVillage = v;
  $('#villageNom').textContent = v.p[0];
  $('#villageInfo').textContent = `${fmtDist(v.d)} · ${cardinal(v.cap)} (${Math.round(v.cap)}°)${v.p[3] ? ' · ' + v.p[3].toLocaleString('fr-FR') + ' hab.' : ''}`;
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
  $('#proches').innerHTML = lignes.map(n => `<li><span class="pastille">${TYPES[n.p[0]][0]}</span>
    <span class="nom"><b>${esc(n.p[1])}</b><span>${TYPES[n.p[0]][1]}${n.p[4] ? ' · ' + n.p[4] + ' m' : ''}</span></span>
    <span class="dist"><svg data-cap="${n.cap}" style="transform:rotate(${n.cap - (heading ?? 0)}deg)"><use href="#i-fleche"/></svg> ${fmtDist(n.d)}<br><small class="meta">${cardinal(n.cap)}</small></span></li>`).join('')
    || '<li class="meta">Aucun refuge ni point d\'eau répertorié à moins de 60 km.</li>';
  dessinerRadar(here);

  // Risques du secteur (département de la commune la plus proche)
  const dep = v.p[4];
  if (dep !== depActuel) {
    depActuel = dep;
    $('#risques').innerHTML = risquesLocaux(dep).map(r => `<li>${r}</li>`).join('');
    $('#risquesCarte').hidden = false;
  }
  $('#sosLieu').textContent = `Près de ${v.p[0]} (${fmtDist(v.d)} ${cardinal(v.cap)})`;
  majSmsProches();
}

function dessinerRadar(here) {
  const R = 5000, svg = $('#radar');
  const pts = nearest(POINTS, here, 40, p => [p[2], p[3]]).filter(n => n.d < R);
  const vil = nearest(COMMUNES, here, 12).filter(n => n.d < R);
  const rotH = -(heading ?? 0);
  const xy = (n) => { const a = (n.cap + rotH) * Math.PI / 180, r = n.d / R * 100; return [Math.sin(a) * r, -Math.cos(a) * r]; };
  svg.innerHTML = `
    <circle class="anneau" r="100"/><circle class="anneau" r="66" stroke-dasharray="2 3"/><circle class="anneau" r="33" stroke-dasharray="2 3"/>
    <text x="3" y="-68">3,3 km</text><text x="3" y="-35">1,7 km</text>
    <g transform="rotate(${rotH})"><text x="-4" y="-103" style="fill:var(--accent);font-size:10px">N</text></g>
    ${vil.map(n => { const [x, y] = xy(n); return `<rect x="${x - 4}" y="${y - 4}" width="8" height="8" rx="2" fill="var(--txt)"/><text x="${x + 7}" y="${y + 3}" style="fill:var(--txt2)">${esc(n.p[0].slice(0, 14))}</text>`; }).join('')}
    ${pts.map(n => { const [x, y] = xy(n); const c = n.p[0] === 'eau' ? '#5BB8FF' : n.p[0] === 'danger' ? 'var(--danger)' : n.p[0] === 'hopital' ? '#FF2D55' : 'var(--ambre)'; return `<circle cx="${x}" cy="${y}" r="3.5" fill="${c}"/>`; }).join('')}
    <circle r="6" fill="var(--accent)"/><circle r="12" fill="none" stroke="var(--accent)" opacity=".4"/>`;
}

// ---------- Soleil ----------
function majSoleil() {
  const here = pos ? ici() : [46.6, 2.4]; // centre de la France par défaut
  const now = new Date(), s = sunTimes(now, ...here);
  const hm = d => d ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—';
  $('#soleilHeures').innerHTML = `☀ ${hm(s.rise)}<br>☾ ${hm(s.set)}`;
  const carte = $('.soleil');
  let txt, frac;
  if (now < s.rise) { txt = `Jour dans ${duree(s.rise - now)}`; frac = 0; }
  else if (now > s.set) { const demain = sunTimes(new Date(now.getTime() + 864e5), ...here); txt = `Jour dans ${duree(demain.rise - now)}`; frac = 1; }
  else { txt = `Nuit dans ${duree(s.set - now)}`; frac = (now - s.rise) / (s.set - s.rise); }
  $('#nuitDans').textContent = txt;
  carte.classList.toggle('urgent', now < s.set && s.set - now < 90 * 60e3 && now > s.rise);
  $('#arcFill').style.width = frac * 100 + '%'; $('#arcSun').style.left = frac * 100 + '%';
  return s;
}
const duree = ms => { const m = Math.round(ms / 60e3); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
majSoleil(); setInterval(majSoleil, 60e3);

// ---------- Météo (téléchargée quand il y a du réseau, lisible hors ligne) ----------
const WMO = c => c == null ? ['', '—'] : c === 0 ? ['☀️', 'Ciel clair'] : c <= 2 ? ['🌤', 'Peu nuageux'] : c === 3 ? ['☁️', 'Couvert'] : c <= 48 ? ['🌫', 'Brouillard']
  : c <= 57 ? ['🌦', 'Bruine'] : c <= 67 ? ['🌧', 'Pluie'] : c <= 77 ? ['🌨', 'Neige'] : c <= 82 ? ['🌦', 'Averses'] : c <= 86 ? ['🌨', 'Averses de neige'] : ['⛈', 'Orage'];
const beaufort = kn => [1, 4, 7, 11, 17, 22, 28, 34, 41, 48, 56, 64].findIndex(s => kn < s) === -1 ? 12 : [1, 4, 7, 11, 17, 22, 28, 34, 41, 48, 56, 64].findIndex(s => kn < s);
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
let meteoEnCours = false;

async function telechargerMeteo() {
  if (!pos) { demarrerGps(); return popup('<h2>Position inconnue</h2><p>Active le GPS : la météo est téléchargée pour l\'endroit où tu es.</p>'); }
  if (!navigator.onLine) return popup('<h2>Pas de réseau</h2><p>Il faut du réseau pour télécharger la météo. Ensuite, elle reste lisible hors ligne pendant 7 jours.</p>');
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
  if (orage >= 0) a.push(`⛈ Orage prévu ${orage === 0 ? 'maintenant' : `dans ${orage} h`}`);
  if (raf >= 34 || vent >= 34) a.push(`💨 Coup de vent : rafales jusqu'à ${Math.round(raf)} nœuds dans les ${heures} h`);
  else if (vent >= 22) a.push(`💨 Vent frais (force ${beaufort(vent)}) dans les ${heures} h : prudence en mer et en crête`);
  const p = M.h.pressure_msl, d3 = p[Math.min(i + 3, p.length - 1)] - p[i];
  if (d3 <= -3) a.push(`↘ La pression va chuter de ${Math.abs(d3).toFixed(0)} hPa en 3 h : dégradation rapide`);
  return a;
}
function afficherMeteo() {
  const M = S.meteo; if (!M) return;
  const age = Date.now() - M.t, i = indexHeure(M);
  $('#meteoAge').textContent = `Téléchargée il y a ${duree(age)}`;
  $('#btnMeteo').textContent = 'Mettre à jour la météo';
  if (i < 0) { $('#meteoNow').innerHTML = '<p class="meta" style="margin:0">Prévisions trop anciennes : mets-les à jour dès que tu as du réseau.</p>'; $('#meteoJours').innerHTML = ''; $('#meteoAlerte').innerHTML = ''; return; }
  const h = M.h, [ico, lib] = WMO(h.weather_code[i]), vent = h.wind_speed_10m[i];
  const sol = sunTimes(new Date(), M.lat, M.lon), nuit = sol.rise && (Date.now() < sol.rise || Date.now() > sol.set), c = h.weather_code[i];
  $('#meteoCarte').className = 'carte meteo ' + (c >= 95 ? 'orage' : nuit ? 'nuit' : c >= 3 ? 'gris' : 'jour');
  const tend = h.pressure_msl[Math.min(i + 6, h.pressure_msl.length - 1)] - h.pressure_msl[i];
  const chips = [
    `Vent ${Math.round(vent)} nd du ${cardinal(h.wind_direction_10m[i])} · force ${beaufort(vent)}`,
    `Rafales ${Math.round(h.wind_gusts_10m[i])} nd`,
    `${Math.round(h.pressure_msl[i])} hPa ${tend > 1 ? '↗' : tend < -1 ? '↘' : '→'}`,
    `Pluie ${h.precipitation_probability[i] ?? 0} %`,
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
  $('#meteoJours').innerHTML = d.time.map((t, k) => `<div><b>${k === 0 ? 'auj.' : JOURS[new Date(t + 'T12:00').getDay()]}</b><i>${WMO(d.weather_code[k])[0]}</i>${Math.round(d.temperature_2m_max[k])}° / ${Math.round(d.temperature_2m_min[k])}°<br>${Math.round(d.wind_speed_10m_max[k])} nd</div>`).join('');
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
    $('#merPort').innerHTML = [p && `⚓ Abri le plus proche : <b>${esc(p.p[1])}</b> · ${fmtMilles(p.d)} au ${Math.round(p.cap)}°`, s && `🛟 Sauvetage SNSM : ${esc(s.p[1])} · ${fmtMilles(s.d)}`].filter(Boolean).join('<br>');
  }
}

function hommeALaMer() {
  if (!pos) { demarrerGps(); return popup('<h2>Position en cours</h2><p>Le GPS cherche ta position. Réappuie dans quelques secondes. En attendant : crie « Un homme à la mer ! », lance une bouée, ne le quitte pas des yeux.</p>'); }
  const h = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
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
  try { if (typeof DeviceOrientationEvent?.requestPermission === 'function' && await DeviceOrientationEvent.requestPermission() !== 'granted') throw 0; } catch { return popup('<h2>Boussole refusée</h2><p>Autorise l\'accès aux capteurs de mouvement pour utiliser la boussole.</p>'); }
  const onOri = e => {
    let h = e.webkitCompassHeading ?? (e.absolute && e.alpha != null ? 360 - e.alpha : null);
    if (h == null) return;
    heading = (h + DECLINAISON + 360) % 360;
    majBoussole();
  };
  addEventListener('deviceorientationabsolute', onOri);
  addEventListener('deviceorientation', onOri);
  $('#btnCompas').hidden = true;
  setTimeout(() => { if (heading == null) $('#cibleInfo').textContent = 'Pas de capteur de boussole sur cet appareil. Les flèches pointent avec le nord en haut.'; }, 3000);
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
  $('#mesPoints').innerHTML = S.points.map(p => `<li data-id="${p.id}" class="${p.id === S.cible ? 'sel' : ''}"><span><b>${esc(p.nom)}</b><br><small class="meta">${p.lat.toFixed(4)}, ${p.lon.toFixed(4)} · ${new Date(p.t).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></span><button data-suppr="${p.id}" aria-label="Supprimer">×</button></li>`).join('')
    || '<li class="meta" style="cursor:default">Marque ton camp, ta voiture ou une source pour pouvoir y revenir.</li>';
}
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
majTrace();

// ---------- Carte et itinéraire ----------
// Fonds OpenStreetMap (plan) et OpenTopoMap (relief) : les tuiles déjà vues restent dans le téléphone (voir sw.js).
// Itinéraire : serveurs OSRM publics de FOSSGIS (à pied, vélo, voiture). Il faut du réseau pour le calculer,
// ensuite il est gardé dans le téléphone et la boussole peut prendre le relais en ligne droite.
const FONDS = {
  plan: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, crossOrigin: true, attribution: '© OpenStreetMap' }],
  topo: ['https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, subdomains: 'abc', crossOrigin: true, attribution: '© OpenStreetMap, SRTM · OpenTopoMap' }],
};
const MODES = { foot: ['routed-foot', 'à pied'], bike: ['routed-bike', 'à vélo'], car: ['routed-car', 'en voiture'] };
let plan = null, fondLy = null, moiMk = null, routeLy = null, destMk = null, pointsLy = null, suivre = true;
let destination = S.route?.dest || null, modeIti = S.route?.mode || 'foot';

function initPlan() {
  if (!window.L) return $('#itiRes').textContent = 'La carte n\'a pas pu se charger.';
  if (plan) return plan.invalidateSize();
  plan = L.map('plan', { zoomControl: false, attributionControl: true }).setView(pos ? ici() : [46.6, 2.4], pos ? 14 : 6);
  plan.attributionControl.setPrefix(false);
  pointsLy = L.layerGroup().addTo(plan);
  changerFond(S.fond || 'plan');
  plan.on('click', e => choisirDest([e.latlng.lat, e.latlng.lng], 'Point sur la carte'));
  plan.on('dragstart', () => { suivre = false; });
  plan.on('moveend', majPointsPlan);
  if (S.route) dessinerRoute(S.route, false);
  majMoiPlan(); majPointsPlan(); majModes();
}
function changerFond(f) {
  S.fond = f; save();
  fondLy?.remove(); fondLy = L.tileLayer(...FONDS[f]).addTo(plan);
  $('#btnFond').textContent = f === 'plan' ? 'Relief' : 'Plan';
}
$('#btnFond').onclick = () => plan && changerFond(S.fond === 'plan' ? 'topo' : 'plan');
$('#btnCentrer').onclick = () => { suivre = true; if (!pos) return demarrerGps(); plan?.setView(ici(), Math.max(plan.getZoom(), 15)); };

function majMoiPlan() {
  if (!plan || !pos) return;
  if (!moiMk) moiMk = L.circleMarker(ici(), { radius: 8, color: '#fff', weight: 3, fillColor: '#007AFF', fillOpacity: 1 }).addTo(plan);
  else moiMk.setLatLng(ici());
  if (suivre && !routeLy) plan.setView(ici(), Math.max(plan.getZoom(), 14));
}

// Refuges, points d'eau, hôpitaux… et mes points, quand on zoome assez
function majPointsPlan() {
  if (!plan) return;
  pointsLy.clearLayers();
  const b = plan.getBounds();
  S.points.forEach(p => L.circleMarker([p.lat, p.lon], { radius: 6, color: '#fff', weight: 2, fillColor: '#34C759', fillOpacity: 1 }).bindPopup(esc(p.nom)).addTo(pointsLy));
  if (plan.getZoom() < 11) return;
  POINTS.filter(p => b.contains([p[2], p[3]])).slice(0, 300).forEach(p => {
    const [ico, lib] = TYPES[p[0]] || ['•', p[0]];
    L.marker([p[2], p[3]], { icon: L.divIcon({ className: 'plan-pt', html: ico, iconSize: [26, 26] }) })
      .bindPopup(`<b>${esc(p[1])}</b><br>${lib}${p[4] ? ' · ' + p[4] + ' m' : ''}`).addTo(pointsLy);
  });
}

// Recherche d'une commune dans la liste hors ligne
const nomCommune = c => `${c[0]} (${c[4]})`;
// Les communes proches passent devant, puis les plus peuplées
const rang = c => Math.log(c[3] + 1) - (pos ? distance(ici(), [c[1], c[2]]) / 30000 : 0);
$('#dest').oninput = () => {
  const q = norm($('#dest').value.trim()); if (q.length < 2) return;
  $('#destListe').innerHTML = COMMUNES.filter(c => norm(c[0]).startsWith(q)).sort((a, b) => rang(b) - rang(a)).slice(0, 8)
    .map(c => `<option value="${esc(nomCommune(c))}">`).join('');
};
$('#dest').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btnIti').click(); });
$('#btnIti').onclick = () => {
  const v = $('#dest').value.trim(), q = norm(v.replace(/\s*\(\w+\)$/, ''));
  if (!v) return destination ? calculerIti() : $('#dest').focus();
  const c = COMMUNES.find(c => nomCommune(c) === v) || COMMUNES.filter(c => norm(c[0]) === q).sort((a, b) => rang(b) - rang(a))[0]
    || COMMUNES.filter(c => norm(c[0]).startsWith(q)).sort((a, b) => rang(b) - rang(a))[0];
  if (!c) return $('#itiRes').textContent = 'Commune introuvable. Vérifie l\'orthographe ou touche la carte.';
  choisirDest([c[1], c[2]], c[0]);
};
function majModes() { $$('#modes .chip').forEach(c => c.classList.toggle('on', c.dataset.mode === modeIti)); }
$('#modes').onclick = e => { const b = e.target.closest('[data-mode]'); if (!b) return; modeIti = b.dataset.mode; majModes(); if (destination) calculerIti(); };

function choisirDest(ll, nom) {
  destination = { ll: ll.map(x => +x.toFixed(5)), nom };
  if (plan) { destMk?.remove(); destMk = L.marker(ll, { icon: L.divIcon({ className: 'plan-dest', html: '', iconSize: [26, 34], iconAnchor: [13, 34] }) }).addTo(plan); }
  calculerIti();
}

const SENS = { left: 'à gauche', right: 'à droite', 'slight left': 'légèrement à gauche', 'slight right': 'légèrement à droite', 'sharp left': 'franchement à gauche', 'sharp right': 'franchement à droite', straight: 'tout droit', uturn: 'demi-tour' };
function consigne(s) {
  const m = s.maneuver, sens = SENS[m.modifier] || '', rue = s.name ? ` sur ${s.name}` : '';
  if (m.type === 'depart') return `Pars${rue}`;
  if (m.type === 'arrive') return 'Tu es arrivé';
  if (m.type === 'roundabout' || m.type === 'rotary') return `Au rond-point, prends la ${m.exit || 1}ᵉ sortie${rue}`;
  if (m.type === 'fork') return `À la fourche, prends ${sens}${rue}`;
  if (m.modifier === 'uturn') return `Fais demi-tour${rue}`;
  if (m.modifier === 'straight' || !sens) return `Continue tout droit${rue}`;
  return `Tourne ${sens}${rue}`;
}

async function calculerIti() {
  if (!destination) return;
  const dep = pos ? ici() : plan ? [plan.getCenter().lat, plan.getCenter().lng] : null;
  if (!dep) return $('#itiRes').textContent = 'Position inconnue : active le GPS.';
  $('#itiRes').textContent = `Calcul de l'itinéraire ${MODES[modeIti][1]} vers ${destination.nom}…`;
  $('#btnItiBoussole').hidden = false;
  try {
    const u = `https://routing.openstreetmap.de/${MODES[modeIti][0]}/route/v1/driving/${dep[1]},${dep[0]};${destination.ll[1]},${destination.ll[0]}?overview=full&geometries=geojson&steps=true`;
    const r = await fetch(u).then(r => r.json());
    if (r.code !== 'Ok' || !r.routes?.length) throw new Error(r.message || 'aucun chemin trouvé');
    const rt = r.routes[0];
    S.route = {
      dest: destination, mode: modeIti, d: rt.distance, t: rt.duration,
      geo: rt.geometry.coordinates.map(([lo, la]) => [+la.toFixed(5), +lo.toFixed(5)]),
      etapes: rt.legs[0].steps.map(s => [consigne(s), Math.round(s.distance)]),
    };
    save(); dessinerRoute(S.route, true);
  } catch (e) {
    const d = distance(dep, destination.ll);
    $('#itiRes').innerHTML = (navigator.onLine ? `Itinéraire impossible (${esc(e.message)}).` : 'Pas de réseau : l\'itinéraire se calcule en ligne.')
      + ` ${esc(destination.nom)} est à ${fmtDist(d)} à vol d'oiseau, direction ${cardinal(bearing(dep, destination.ll))}. La boussole peut t'y guider en ligne droite.`;
  }
}
function dessinerRoute(R, cadrer) {
  $('#itiRes').innerHTML = `<b>${esc(R.dest.nom)}</b> · ${fmtDist(R.d)} · ${duree(R.t * 1000)} ${MODES[R.mode][1]}`;
  $('#etapes').innerHTML = R.etapes.map(([t, d]) => `<li><span>${esc(t)}</span>${d ? `<small>${fmtDist(d)}</small>` : ''}</li>`).join('');
  $('#btnItiBoussole').hidden = false;
  if (!plan) return;
  routeLy?.remove(); routeLy = L.polyline(R.geo, { color: '#007AFF', weight: 6, opacity: .85 }).addTo(plan);
  destMk?.remove(); destMk = L.marker(R.dest.ll, { icon: L.divIcon({ className: 'plan-dest', html: '', iconSize: [26, 34], iconAnchor: [13, 34] }) }).addTo(plan);
  if (cadrer) { suivre = false; plan.fitBounds(routeLy.getBounds(), { padding: [30, 30] }); }
}
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
  popup(`<h2>Chute détectée</h2><p class="big" id="chuteN">60</p><p>Tout va bien ? Sans réponse, Repère déclenche le sifflet et le SOS lumineux.</p><button class="btn primaire" id="chuteOk">Je vais bien</button>`);
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
$('#cats').innerHTML = `<button class="chip on" data-cat="">Tout</button>` + Object.entries(CATS).map(([k, v]) => `<button class="chip" data-cat="${k}">${v}</button>`).join('');
$('#cats').onclick = e => { const c = e.target.closest('.chip'); if (!c) return; catSel = c.dataset.cat || null; $$('#cats .chip').forEach(x => x.classList.toggle('on', x === c)); majFiches(); };
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const texte = f => norm(f.titre + ' ' + f.mots + ' ' + f.corps.replace(/<[^>]+>/g, ' '));
function chercher(q) {
  const VIDES = new Set('les des une est suis pour dans avec que qui quoi comment faire fait mon mes ton tes son ses sur pas plus tres trop elle ils nous vous mais car donc etre avoir quand'.split(' '));
  const mots = norm(q).split(/[^a-z0-9]+/).filter(m => m.length > 2 && !VIDES.has(m)).map(m => m.slice(0, Math.max(4, m.length - 2)));
  return FICHES.map(f => { const t = texte(f), tm = norm(f.titre + ' ' + f.mots); return { f, s: mots.reduce((a, m) => a + (tm.includes(m) ? 3 : 0) + (t.includes(m) ? 1 : 0), 0) }; })
    .filter(x => x.s > 0).sort((a, b) => b.s - a.s).map(x => x.f);
}
function majFiches() {
  const q = $('#question').value.trim();
  const liste = q ? chercher(q) : FICHES.filter(f => !catSel || f.cat === catSel);
  $('#fiches').innerHTML = liste.map(f => `<li data-fiche="${f.id}"><span><small>${CATS[f.cat]}</small><b>${f.titre}</b></span></li>`).join('') || '<li class="meta">Aucune fiche. Essaie avec d\'autres mots.</li>';
}
$('#question').oninput = majFiches;
$('#fiches').onclick = e => { const li = e.target.closest('[data-fiche]'); if (li) ouvrirFiche(li.dataset.fiche); };
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
// ponytail: petit modèle sur téléphone (rapide sur le processeur, peu de mémoire), plus gros sur ordinateur (meilleures réponses)
const HF = 'https://huggingface.co/Qwen/';
const MODELE = MOBILE ? HF + 'Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf'
  : HF + 'Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf';
const TAILLE_IA = MOBILE ? '490 Mo' : '1,1 Go';
let moteur = null, iaEnCours = null;
const iaInstallee = () => S.ia === MODELE;
function iaEtat(t) { $('#iaEtat').textContent = t; }
if (iaInstallee()) { $('#btnIA').textContent = 'Démarrer'; iaEtat('Installée · appuie pour la démarrer'); }

function chargerIA() { return iaEnCours ??= demarrerIA().finally(() => { iaEnCours = null; }); }
async function demarrerIA() {
  if (moteur) return moteur;
  const prog = $('#iaProg'); prog.hidden = false; $('#btnIA').disabled = true;
  iaEtat(iaInstallee() ? 'Démarrage…' : 'Préparation…');
  try {
    const { Wllama } = await import('./vendor/wllama.js');
    // wllama 2.3.7 : dernière version en mémoire 32 bits (Safari sur iPhone ne gère pas la mémoire 64 bits des versions suivantes)
    const w = new Wllama({ 'single-thread/wllama.wasm': new URL('vendor/wllama.wasm', location.href).href },
      { allowOffline: true, suppressNativeLog: true, logger: { debug() {}, log() {}, warn: console.warn, error: console.error } });
    await w.loadModelFromUrl(MODELE, {
      n_ctx: 2048, n_threads: 1,
      progressCallback: ({ loaded, total }) => {
        const p = total ? Math.round(loaded / total * 100) : 0;
        prog.firstElementChild.style.width = p + '%';
        iaEtat(p < 100 ? `Téléchargement… ${p} %` : 'Démarrage…');
      },
    });
    moteur = w; S.ia = MODELE; save();
    iaEtat('Prête · fonctionne sans internet'); $('#btnIA').hidden = true; prog.hidden = true;
    return moteur;
  } catch (e) {
    console.error(e);
    iaEtat(navigator.onLine || iaInstallee() ? 'Échec : ' + (e.message || e) : 'Il faut internet pour l\'installer la première fois.');
    $('#btnIA').disabled = false; prog.hidden = true; return null;
  }
}
$('#btnIA').onclick = () => {
  if (!iaInstallee() && !confirm(`Télécharger l'assistant IA (environ ${TAILLE_IA}) ? Fais-le en Wi-Fi, avant de partir.`)) return;
  chargerIA();
};

function contexteSituation() {
  const c = [];
  const p = { rando: 'randonneur', alpi: 'alpiniste', voyage: 'voyageur', survie: 'en situation de survie', mer: 'marin, en mer' }[S.profil] || 'randonneur';
  c.push(`Utilisateur : ${p}.`);
  if (pos) c.push(`Position : ${ici()[0].toFixed(4)}, ${ici()[1].toFixed(4)}${pos.coords.altitude != null ? ', altitude ' + Math.round(pos.coords.altitude) + ' m' : ''}.`);
  if (dernierVillage) c.push(`Lieu habité le plus proche : ${dernierVillage.p[0]} à ${fmtDist(dernierVillage.d)} direction ${cardinal(dernierVillage.cap)}.`);
  c.push(`Lumière : ${$('#nuitDans').textContent}. Heure : ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.`);
  return c.join(' ');
}

$('#btnDemander').onclick = async () => {
  const q = $('#question').value.trim(); if (!q) return $('#question').focus();
  const sources = chercher(q).slice(0, 3), rep = $('#reponse');
  rep.hidden = false;
  const liens = `<div class="src">${sources.map(f => `<button class="chip" data-ouvre="${f.id}">${f.titre}</button>`).join('')}</div>`;
  if (!moteur) {
    if (iaInstallee()) { rep.textContent = 'Démarrage de l\'IA…'; await chargerIA(); }
    if (!moteur) { rep.innerHTML = (sources.length ? '<b>Fiches qui répondent à ta question :</b>' : 'Aucune fiche ne correspond. Essaie avec d\'autres mots.') + liens; return; }
  }
  if (iaOccupee) return;
  // ponytail: une seule fiche coupée à 900 caractères : sur le processeur d'un téléphone, chaque mot lu coûte du temps
  const f = sources[0];
  const base = f ? `${f.titre}\n${f.corps.replace(/<li>/g, '- ').replace(/<[^>]+>/g, '').replace(/\n+/g, '\n').slice(0, 900)}` : '(aucune fiche)';
  const msgs = [
    // ponytail: consignes réduites au minimum, le petit modèle (0,5B) recopie mot pour mot les règles qu'on lui donne
    { role: 'system', content: 'Tu es un guide de survie. Réponds en français par 3 à 5 étapes numérotées, d\'après la fiche.' },
    { role: 'user', content: `Fiche :\n${base}\n\n${contexteSituation()}\n\nQuestion : ${q}` },
  ];
  // Les fiches s'affichent tout de suite, la réponse de l'IA s'écrit au-dessus au fur et à mesure
  rep.innerHTML = `<div id="iaTexte" class="meta">Repère lit la fiche…</div>${liens}`;
  iaOccupee = true; $('#btnDemander').disabled = true;
  try {
    await moteur.createChatCompletion(msgs, {
      nPredict: 300, sampling: { temp: .3, top_p: .9, penalty_repeat: 1.1 },
      onNewToken: (t, p, texte) => { const el = $('#iaTexte'); if (el) { el.className = ''; el.textContent = texte; } },
    });
  } catch (e) { $('#iaTexte').textContent = 'Erreur de l\'IA : ' + (e.message || e); }
  iaOccupee = false; $('#btnDemander').disabled = false;
};
let iaOccupee = false;
$('#question').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btnDemander').click(); });
$('#reponse').onclick = e => { const b = e.target.closest('[data-ouvre]'); if (b) ouvrirFiche(b.dataset.ouvre); };

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
    ${auto.length ? '<div class="k" style="margin-top:14px">Repère a aussi vérifié</div><ul class="liste">' + auto.map(a => `<li>${a[1]}</li>`).join('') + '</ul>' : ''}`);
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
const PROFILS = { rando: 'Randonneur', alpi: 'Alpiniste', mer: 'Marin', voyage: 'Voyageur', survie: 'Survie' };
const SACS = {
  base: ['Eau 2 L', 'Couverture de survie', 'Sifflet', 'Lampe frontale', 'Batterie externe', 'Trousse de secours', 'Couteau', 'Briquet', 'Coupe-vent', 'Couche chaude', 'En-cas', 'Carte papier'],
  alpi: ['DVA, pelle, sonde', 'Casque', 'Crampons', 'Lunettes catégorie 4', 'Crème solaire'],
  voyage: ['Copie du passeport', 'Carte bancaire de secours', 'Adaptateur prise', 'Médicaments habituels'],
  survie: ['Pastilles de purification', 'Bâche', 'Corde 10 m', 'Hameçons et fil', 'Allume-feu'],
  rando: ['Bâtons', 'Chapeau', 'Pansements ampoules'],
  mer: ['Gilet de sauvetage', 'VHF portable étanche', 'Balise de détresse (PLB)', 'Feux à main et fumigène', 'Sac étanche', 'Lampe étanche', 'Compas de relèvement', 'Carte marine papier'],
};
function majProfil() {
  $('#profils').innerHTML = Object.entries(PROFILS).map(([k, v]) => `<button class="chip ${S.profil === k ? 'on' : ''}" data-p="${k}">${v}</button>`).join('');
  const items = [...SACS.base, ...(SACS[S.profil] || [])];
  $('#sac').innerHTML = items.map(i => `<li class="${S.sac.includes(i) ? 'ok' : ''}">${i}</li>`).join('');
  $('#sacScore').textContent = `${items.filter(i => S.sac.includes(i)).length} / ${items.length}`;
  $('#merCarte').hidden = S.profil !== 'mer';
}
$('#profils').onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; S.profil = b.dataset.p; save(); majProfil(); if (pos) { majSituation(); majMer(); } };
$('#sac').onclick = e => { const li = e.target.closest('li'); if (!li) return; const i = li.textContent; S.sac = S.sac.includes(i) ? S.sac.filter(x => x !== i) : [...S.sac, i]; save(); majProfil(); };
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

// Thème nuit rouge
const appliquerTheme = () => { document.documentElement.dataset.theme = S.theme; $('#btnRouge').setAttribute('aria-pressed', S.theme === 'rouge'); };
$('#btnRouge').onclick = () => { S.theme = S.theme === 'rouge' ? '' : 'rouge'; save(); appliquerTheme(); };
appliquerTheme();

// ---------- Repère à proximité : Bluetooth (application Android) ou réseau cellulaire (version web, iPhone) ----------
// Par le réseau, les positions passent par le relais public ntfy.sh, chiffrées avec le code du groupe :
// le relais ne voit qu'un message illisible. ponytail: relais gratuit à débit limité, serveur ntfy à soi si l'app grossit.
const RELAIS = 'https://ntfy.sh/';
const b64 = u => btoa(String.fromCharCode(...u)), deb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
function proxiReseau() {
  const ecoute = {}, enc = new TextEncoder();
  let es = null, cle = null, sujet = null, derniere = 0, derniereCharge = null, attente = null;
  const emettre = (nom, v) => ecoute[nom]?.(v);
  async function envoyer(c) {
    derniereCharge = c; attente = null; derniere = Date.now();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ch = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cle, enc.encode(JSON.stringify(c))));
    fetch(RELAIS + sujet, { method: 'POST', body: b64(iv) + '.' + b64(ch) })
      .then(r => { if (!r.ok) emettre('etat', { erreur: r.status === 429 ? 'Relais saturé : nouvel essai bientôt' : 'Relais indisponible' }); })
      .catch(() => { attente = c; emettre('etat', { erreur: 'Pas de réseau : position en attente' }); });
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
          if (typeof v.id === 'number') emettre('trouve', { ...v, reseau: true, vu: m.time * 1000 });
        } catch {} // message d'un autre groupe ou abîmé
      };
      await envoyer(c);
      return { emission: true };
    },
    maj(c, force) { if (force) envoyer(c); else attente = c; },
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
  }).join('') : `<li class="meta">${proxiOn ? `Recherche… Les autres doivent avoir Repère ouvert avec « Repérer les autres » activé${NATIF ? '' : ' et le même code de groupe'}.`
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
// Radio France en qualité basse (32 kbit/s ≈ 15 Mo/h) ; les autres sont en 64 à 128 kbit/s (30 à 60 Mo/h).
const RF = s => `https://icecast.radiofrance.fr/${s}-lofi.mp3`;
const RADIOS = {
  info: ['Infos', {
    franceinfo: ['franceinfo', RF('franceinfo'), 15], franceinter: ['France Inter', RF('franceinter'), 15],
    rfi: ['RFI', 'https://rfimonde64k.ice.infomaniak.ch/rfimonde-64.mp3', 30], europe1: ['Europe 1', 'https://stream.europe1.fr/europe1.mp3', 60],
    rtl: ['RTL', 'https://icecast.rtl.fr/rtl-1-44-128', 60], rmc: ['RMC', 'https://audio.bfmtv.com/rmcradio_128.mp3', 60],
    bfm: ['BFM Business', 'https://audio.bfmtv.com/bfmbusiness_128.mp3', 60], sud: ['Sud Radio', 'https://start-sud.ice.infomaniak.ch/start-sud-high.mp3', 60],
  }],
  autres: ['Musique et culture', {
    fip: ['FIP', RF('fip'), 15], franceculture: ['France Culture', RF('franceculture'), 15], mouv: ['Mouv\'', RF('mouv'), 15], francemusique: ['France Musique', RF('francemusique'), 15],
  }],
};
const STATIONS = Object.assign({}, ...Object.values(RADIOS).map(g => g[1]));
const lecteur = new Audio();
let radioOn = null;
$('#radios').innerHTML = Object.values(RADIOS).map(([titre, st]) => `<div class="meta radio-groupe">${titre}</div>
  <div class="chips">${Object.entries(st).map(([k, v]) => `<button class="chip" data-r="${k}">${v[0]}</button>`).join('')}</div>`).join('');
function majRadio(t) {
  $$('#radios .chip').forEach(c => c.classList.toggle('on', c.dataset.r === radioOn));
  $('#radioEtat').textContent = t || (radioOn ? `● En direct · ~${STATIONS[radioOn][2]} Mo/h` : 'Par les données cellulaires');
}
$('#radios').onclick = e => {
  const b = e.target.closest('[data-r]'); if (!b) return;
  if (radioOn === b.dataset.r) { radioOn = null; lecteur.pause(); lecteur.removeAttribute('src'); }
  else {
    radioOn = b.dataset.r;
    lecteur.src = STATIONS[radioOn][1];
    lecteur.play().catch(() => majRadio('Lecture refusée : touche à nouveau la station'));
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: STATIONS[radioOn][0], artist: 'Repère · radio' });
  }
  majRadio();
};
lecteur.onwaiting = () => radioOn && majRadio('Chargement…');
lecteur.onplaying = () => majRadio();
lecteur.onerror = () => radioOn && majRadio('Pas de réseau : radio indisponible');

// ---------- Mode survie : Repère prend les choses en main ----------
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
  if (!pos) c.push(['gps', 'Active ta position : sors à découvert et attends le signal GPS.', [['Activer le GPS', demarrerGps]]]);
  if (!S.points.length && pos) c.push(['camp', 'Marque ta position actuelle : tu pourras toujours y revenir.', [['Marquer ce point', () => $('#btnMarquer').click()]]]);
  if (batterie && !batterie.charging && batterie.level < .2) c.push(['bat', `Batterie à ${Math.round(batterie.level * 100)} %. Mode avion, luminosité au minimum, téléphone contre toi.`, []]);
  if (s.set && now < s.set && s.set - now < 90 * 60e3) c.push(['nuit', `La nuit tombe dans ${duree(s.set - now)}. Commence ton abri maintenant.`, [['Comment faire un abri', () => ouvrirFiche('abri')], ['Vérifier l\'emplacement', () => $('#btnBivouac').click()]]]);
  const M = S.meteo, mi = M ? indexHeure(M) : -1;
  if (mi >= 0) for (const a of alertesMeteo(M, mi, 6)) c.push(['meteo' + a.slice(0, 3), a + '. Mets-toi à l\'abri à temps.', [['Orage et foudre', () => ouvrirFiche('orage')]]]);
  if (s.set && now > s.set) c.push(['dort', 'Il fait nuit. Reste à l\'abri, isolé du sol. Ne marche pas dans le noir.', [['Où ne pas dormir', () => ouvrirFiche('bivouac')]]]);
  if (now - derniereGorgee > 2 * 3600e3) c.push(['eau', 'Ça fait 2 heures. Bois quelques gorgées.', [['J\'ai bu', () => { derniereGorgee = Date.now(); refusConsignes.delete('eau'); coach(); }], ['Trouver de l\'eau', () => ouvrirFiche('eau-trouver')]]]);
  const tdn = $('#tendance');
  if (tdn.classList.contains('mal')) c.push(['loin', `Tu t'éloignes de ${dernierVillage?.p[0] || 'la civilisation'}. Arrête-toi et regarde la flèche.`, [['Je suis perdu', () => ouvrirFiche('perdu')]]]);
  if (dernierVillage) c.push(['civi', `${dernierVillage.p[0]} est à ${fmtDist(dernierVillage.d)} vers le ${cardinal(dernierVillage.cap)}. Si quelqu'un sait où tu es, reste visible sur place.`, [['Signaux de détresse', () => ouvrirFiche('signaux')]]]);
  c.push(['stop', 'Respire. Fais le point : eau, nourriture, chaleur, blessures.', [['Les priorités', () => ouvrirFiche('priorites')]]]);
  return c.filter(x => !refusConsignes.has(x[0]));
}
function coach() {
  if (!survie) return;
  const [cur] = consignes();
  if (!cur) return;
  const [id, msg, actions] = cur;
  $('#coachMsg').textContent = msg;
  const box = $('#coachActions'); box.innerHTML = '';
  [...actions, ['Compris', () => { refusConsignes.add(id); coach(); }]].forEach(([t, fn], i) => {
    const b = document.createElement('button'); b.className = 'btn petit' + (i === 0 ? ' primaire' : ''); b.textContent = t; b.onclick = fn; box.append(b);
  });
  if (['nuit', 'bat', 'loin'].includes(id) && !coach.vu?.has(id)) { (coach.vu ??= new Set()).add(id); navigator.vibrate?.([200, 100, 200]); }
}
