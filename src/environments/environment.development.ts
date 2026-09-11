/** Development overrides. Swapped in by `fileReplacements` in `angular.json`. */

/** Injected by `--define` in the `start` / `watch` scripts — see `environment.ts`. */
declare const MARKETDAY_GOOGLE_MAPS_API_KEY: string;

export const environment = {
  production: false,
  api: {
    /** Served by `proxy.conf.mjs`, which adds `x-api-key` and dodges CORS. */
    graphqlUrl: '/graphql',
    /** Empty on purpose: the dev proxy injects the key, so the app must not. */
    key: '',
  },
  googleMaps: {
    // Public by nature — the browser sends it in the clear. It is protected by
    // HTTP-referrer and API restrictions in the Google Cloud console, not by
    // being secret. Needs Maps JavaScript API, Places API (New) and Geocoding
    // API enabled. Unset, it reads as empty and the maps degrade (`typeof`
    // tolerates the undeclared identifier — see `environment.ts`).
    apiKey: typeof MARKETDAY_GOOGLE_MAPS_API_KEY === 'string' ? MARKETDAY_GOOGLE_MAPS_API_KEY : '',
    mapId: 'DEMO_MAP_ID',
    region: 'IE',
    language: 'en-IE',
    defaultCenter: { lat: 53.4, lng: -7.9 },
    defaultZoom: 6,
  },
};
