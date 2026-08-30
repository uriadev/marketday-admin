/**
 * Build-time configuration. This is the production file; the development build
 * swaps in `environment.development.ts` via `fileReplacements` in
 * `angular.json`.
 *
 * `googleMaps.apiKey` is deliberately empty here — a deploy supplies its own
 * referrer-restricted key. An empty key is not a failure state: the maps loader
 * stays inert and the location picker falls back to a panel that explains the
 * map is unavailable, so the wizard still works without one.
 */
export const environment = {
  production: true,
  googleMaps: {
    apiKey: '',
    /** Advanced markers need a map ID; replace with a Cloud-styled one. */
    mapId: 'DEMO_MAP_ID',
    region: 'IE',
    language: 'en-IE',
    /** Roughly the centre of Ireland, for a map with no pin on it yet. */
    defaultCenter: { lat: 53.4, lng: -7.9 },
    defaultZoom: 6,
  },
};
