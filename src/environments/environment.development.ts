/** Development overrides. Swapped in by `fileReplacements` in `angular.json`. */
export const environment = {
  production: false,
  googleMaps: {
    // Public by nature — the browser sends it in the clear. It is protected by
    // HTTP-referrer and API restrictions in the Google Cloud console, not by
    // being secret. Needs Maps JavaScript API, Places API (New) and Geocoding
    // API enabled.
    apiKey: 'AIzaSyBphWmQx2xyTrzr0Y-xR-yDaCzM0Ay_nY8',
    mapId: 'DEMO_MAP_ID',
    region: 'IE',
    language: 'en-IE',
    defaultCenter: { lat: 53.4, lng: -7.9 },
    defaultZoom: 6,
  },
};
