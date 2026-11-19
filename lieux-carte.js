import { VectorTile, Pbf } from './vendor/lecture-tuiles.js';

const ADRESSE = 'https://tiles.openfreemap.org/planet';
const cache = new Map();
let modeleTuile;

async function modele() {
  if (!modeleTuile) {
    modeleTuile = fetch(ADRESSE, { signal: AbortSignal.timeout?.(8000) }).then(r => {
      if (!r.ok) throw new Error('Index de carte indisponible');
      return r.json();
    }).then(declaration => {
      const url = declaration.tiles?.[0];
      if (!url?.startsWith(ADRESSE + '/')) throw new Error('Index de carte incomplet');
      return url;
    }).catch(e => { modeleTuile = null; throw e; });
  }
  return modeleTuile;
}

export function tuilesLieux(cadre, zoom) {
  if (zoom < 11) return [];
  const z = Math.min(14, Math.floor(zoom)), cote = 2 ** z;
  const colonne = lon => Math.floor((lon + 180) / 360 * cote);
  const ligne = lat => {
    const r = Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI / 180;
    return Math.max(0, Math.min(cote - 1, Math.floor((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2 * cote)));
  };
  const gauche = colonne(cadre.getWest()), droite = colonne(cadre.getEast());
  const haut = ligne(cadre.getNorth()), bas = ligne(cadre.getSouth());
  const tuiles = [];
  for (let x = gauche; x <= droite; x++) {
    for (let y = haut; y <= bas; y++) tuiles.push([z, ((x % cote) + cote) % cote, y]);
  }
  return tuiles;
}

function categorie(p, couche) {
  if (couche === 'aerodrome_label' || p.class === 'airport') return 'aeroport';
  if (p.class === 'lodging' && (!p.subclass || p.subclass === 'hotel' || p.subclass === 'motel')) return 'hotel';
  if (p.class === 'restaurant' || p.class === 'fast_food') return 'restaurant';
  if (p.class === 'campsite' || p.subclass === 'camp_site' || p.subclass === 'caravan_site') return 'camping';
  return p.class === 'parking' ? 'parking' : null;
}

function lireTuile(donnees, [z, x, y]) {
  const couches = new VectorTile(new Pbf(donnees)).layers, lieux = [];
  for (const nom of ['poi', 'aerodrome_label']) {
    const couche = couches[nom];
    if (!couche) continue;
    for (let i = 0; i < couche.length; i++) {
      const objet = couche.feature(i), p = objet.properties, type = categorie(p, nom);
      if (!type || objet.type !== 1) continue;
      const geom = objet.toGeoJSON(x, y, z).geometry;
      const points = geom.type === 'MultiPoint' ? geom.coordinates : [geom.coordinates];
      for (const [lon, lat] of points) {
        lieux.push({ type, lon, lat, nom: p.name || p['name:latin'] || p['name_en'] || p.iata || '' });
      }
    }
  }
  return lieux;
}

async function lieuxTuile(tuile) {
  const [z, x, y] = tuile, cle = tuile.join('/');
  if (!cache.has(cle)) {
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    cache.set(cle, modele().then(url => fetch(url.replace('{z}', z).replace('{x}', x).replace('{y}', y), {
      signal: AbortSignal.timeout?.(8000),
    })).then(r => {
      if (!r.ok) throw new Error('Tuile indisponible');
      return r.arrayBuffer();
    }).then(buf => lireTuile(new Uint8Array(buf), tuile)).catch(() => {
      cache.delete(cle);
      return [];
    }));
  }
  return cache.get(cle);
}

export async function lieuxDesTuiles(tuiles) {
  return (await Promise.all(tuiles.map(lieuxTuile))).flat();
}
