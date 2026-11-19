// Calculs hors ligne : distances, caps, soleil, format des coordonnées.
const rad = Math.PI / 180, R = 6371000;

export function distance(a, b) { // mètres, [lat, lon]
  const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bearing(a, b) { // degrés depuis le nord
  const y = Math.sin((b[1] - a[1]) * rad) * Math.cos(b[0] * rad);
  const x = Math.cos(a[0] * rad) * Math.sin(b[0] * rad) - Math.sin(a[0] * rad) * Math.cos(b[0] * rad) * Math.cos((b[1] - a[1]) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

// ponytail: scan linéaire (~35 000 points, quelques ms) ; grille spatiale si ça rame sur vieux téléphones
export function nearest(list, here, k = 1, getLL = p => [p[1], p[2]]) {
  const kx = Math.cos(here[0] * rad);
  const scored = [];
  for (const p of list) {
    const ll = getLL(p), dx = (ll[1] - here[1]) * kx, dy = ll[0] - here[0];
    scored.push([dx * dx + dy * dy, p]);
  }
  scored.sort((x, y) => x[0] - y[0]);
  return scored.slice(0, k).map(([, p]) => ({ p, d: distance(here, getLL(p)), cap: bearing(here, getLL(p)) }));
}

export const CARDINAUX = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
export const FMT = { dec: ',' }; // séparateur décimal (« . » en anglais), réglé par app.js
export const cardinal = deg => CARDINAUX[Math.round(deg / 45) % 8];

export function fmtDist(m) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', FMT.dec)} km`;
}

export function dms(v, pos, neg) {
  const s = v >= 0 ? pos : neg; v = Math.abs(v);
  const d = Math.floor(v), m = Math.floor((v - d) * 60), sec = ((v - d - m / 60) * 3600).toFixed(1);
  return `${d}°${String(m).padStart(2, '0')}′${sec.padStart(4, '0')}″${s}`;
}

// Lever / coucher du soleil (formules SunCalc), précision ~1-2 min
export function sunTimes(date, lat, lon) {
  const J2000 = 2451545, e = rad * 23.4397;
  const d = date.valueOf() / 864e5 - 0.5 + 2440588 - J2000;
  const lw = -lon * rad, phi = lat * rad;
  const n = Math.round(d - 0.0009 - lw / (2 * Math.PI));
  const transit = (ht) => 0.0009 + (ht + lw) / (2 * Math.PI) + n;
  const ds = transit(0);
  const M = rad * (357.5291 + 0.98560028 * ds);
  const L = M + rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + rad * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(L) * Math.sin(e));
  const Jt = (x) => J2000 + x + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const toDate = j => new Date((j + 0.5 - 2440588) * 864e5);
  const noon = Jt(ds);
  const w = Math.acos((Math.sin(-0.833 * rad) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));
  if (isNaN(w)) return { noon: toDate(noon), rise: null, set: null };
  const set = Jt(transit(w));
  return { noon: toDate(noon), rise: toDate(noon - (set - noon)), set: toDate(set) };
}

// Écart entre deux caps, en degrés (0 à 180) : 359° et 1° sont à 2° l'un de l'autre
export const ecartAngle = (a, b) => Math.abs(((b - a) % 360 + 540) % 360 - 180);

// « Devant moi » : les lieux (déjà munis de d et cap, comme ceux de nearest) à moins de demi° du cap visé, du plus proche au plus loin.
// garder : clés déjà affichées, qui restent tant qu'elles sont à moins de demi + marge° (la liste ne clignote pas au bord du cône)
export function devant(lieux, cap, demi = 30, garder = new Set(), marge = 8, cle = n => n.cle) {
  return lieux.filter(n => ecartAngle(cap, n.cap) <= (garder.has(cle(n)) ? demi + marge : demi)).sort((a, b) => a.d - b.d);
}
