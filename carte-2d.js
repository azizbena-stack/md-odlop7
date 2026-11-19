// Carte raster quand le navigateur ne fournit pas WebGL. Les mêmes points,
// tracés et commandes restent utilisables avec le fond OpenStreetMap.
const latlng = ([lng, lat]) => [lat, lng];

export function creerCarte2D(conteneur, centre, zoom, { texte, choisirItineraire, etatTuiles }) {
  const L = window.L;
  const carte = L.map(conteneur, {
    zoomControl: false, scrollWheelZoom: false, maxZoom: 19,
    trackResize: !window.ResizeObserver,
  }).setView(latlng(centre), zoom);

  const zoomCtrl = L.control.zoom({
    position: 'bottomleft', zoomInTitle: texte('Zoom avant'), zoomOutTitle: texte('Zoom arrière'),
  }).addTo(carte);
  carte.attributionControl.setPrefix(texte('Carte 2D'));
  const fond = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  });
  let fondsCharges = false;
  fond.on('tileload', () => { fondsCharges = true; etatTuiles(true); });
  fond.on('tileerror', () => { if (!fondsCharges) etatTuiles(false); });
  fond.addTo(carte);

  const trace = L.geoJSON(null, { interactive: false, style: { color: '#17A8AF', weight: 4, dashArray: '8 4' } }).addTo(carte);
  const route = L.geoJSON(null, {
    style: f => ({ color: f.properties.sel ? '#7B2FF7' : '#B89AEF', weight: f.properties.sel ? 7 : 5, opacity: .95 }),
    onEachFeature: (f, ligne) => {
      if (f.properties.sel) return;
      ligne.options.bubblingMouseEvents = false;
      ligne.on('click', () => choisirItineraire(f.properties.i));
    },
  }).addTo(carte);
  const sources = {};
  for (const [nom, calque] of [['route', route], ['trace-personnelle', trace]]) {
    sources[nom] = { setData: donnees => calque.clearLayers().addData(donnees) };
  }

  function gestes(pleinEcran) {
    if (pleinEcran || !matchMedia('(pointer: coarse)').matches) carte.dragging.enable();
    else carte.dragging.disable(); // dans la page, un doigt fait défiler ; deux doigts permettent le zoom
    if (pleinEcran) carte.scrollWheelZoom.enable();
    else carte.scrollWheelZoom.disable();
  }
  function positionner(options, animer) {
    const { center, zoom = carte.getZoom() } = options;
    if (!center) return;
    carte.setView(latlng(center), zoom, { animate: animer });
  }

  return {
    raster: true,
    getContainer: () => conteneur,
    getCenter: () => carte.getCenter(),
    getZoom: () => carte.getZoom(),
    getBounds: () => {
      const cadre = carte.getBounds();
      return {
        contains: point => cadre.contains(latlng(point)),
        getWest: () => cadre.getWest(), getEast: () => cadre.getEast(),
        getSouth: () => cadre.getSouth(), getNorth: () => cadre.getNorth(),
      };
    },
    getBearing: () => 0,
    getSource: nom => sources[nom],
    resize: () => carte.invalidateSize({ animate: false, debounceMoveend: true }),
    easeTo: options => positionner(options, options.duration !== 0),
    jumpTo: options => positionner(options, false),
    fitBounds: (cadre, { padding = 0, maxZoom, duration }) => {
      const { left, right, top, bottom } = typeof padding === 'number'
        ? { left: padding, right: padding, top: padding, bottom: padding } : padding;
      carte.fitBounds([[cadre.getSouth(), cadre.getWest()], [cadre.getNorth(), cadre.getEast()]], {
        paddingTopLeft: [left, top], paddingBottomRight: [right, bottom], maxZoom,
        animate: duration !== 0,
      });
    },
    cooperativeGestures: { enable: () => gestes(false), disable: () => gestes(true) },
    on: (evenement, ecouter) => {
      if (evenement === 'click') {
        carte.on('click', e => ecouter({ originalEvent: e.originalEvent, lngLat: e.latlng }));
      } else if (evenement === 'movestart') {
        const manuel = e => ecouter({ originalEvent: e });
        carte.on('dragstart boxzoomstart', manuel);
        conteneur.addEventListener('wheel', e => { if (carte.scrollWheelZoom.enabled()) manuel(e); }, { passive: true });
        conteneur.addEventListener('touchstart', e => { if (e.touches.length > 1) manuel(e); }, { passive: true });
        zoomCtrl.getContainer().addEventListener('click', manuel);
      } else carte.on(evenement, ecouter);
    },
    marqueur: (position, element, ancre) => {
      element.classList.add('plan-2d-picto');
      if (ancre === 'bottom') element.classList.add('plan-2d-ancre-basse');
      const calque = L.marker(latlng(position), {
        icon: L.divIcon({ html: element, className: 'plan-2d-marqueur', iconSize: [0, 0], iconAnchor: [0, 0] }),
        keyboard: !element.matches('.plan-moi, .plan-nav, .plan-cible'),
      }).addTo(carte);
      const repere = {
        remove: () => calque.remove(),
        setLngLat: point => { calque.setLatLng(latlng(point)); return repere; },
        setRotation: angle => { element.style.rotate = angle + 'deg'; return repere; },
        setPopup: popup => { calque.bindPopup(popup.calque); return repere; },
      };
      return repere;
    },
    popup: decalage => {
      const calque = L.popup({ offset: [0, -decalage] });
      const popup = {
        calque,
        on: (evenement, ecouter) => { calque.on(evenement === 'open' ? 'add' : evenement, ecouter); return popup; },
        setText: texte => {
          const el = document.createElement('span');
          el.textContent = texte;
          calque.setContent(el);
          return popup;
        },
        setHTML: html => { calque.setContent(html); return popup; },
      };
      return popup;
    },
  };
}
