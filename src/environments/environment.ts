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

declare const MARKETDAY_API_URL: string;
declare const MARKETDAY_API_KEY: string;

/**
 * Substituted at build time by `ng build --define` — see the `build` script in
 * `package.json`, which forwards the same two environment variables the dev
 * proxy reads:
 *
 *   MARKETDAY_API_URL=https://api.marketday.ie MARKETDAY_API_KEY=… pnpm run build
 *
 * `--define` only replaces identifiers it was given a value for, so a bare
 * `ng build` would leave these as free variables and throw `ReferenceError` in
 * the browser. `typeof` is the one operator that tolerates an undeclared
 * identifier, so an un-injected build reads as an empty string instead and
 * falls back to the same-origin defaults below.
 */
const apiOrigin = typeof MARKETDAY_API_URL === 'string' ? MARKETDAY_API_URL : '';
const apiKey = typeof MARKETDAY_API_KEY === 'string' ? MARKETDAY_API_KEY : '';

export const environment = {
  production: true,
  api: {
    /**
     * Absolute when `MARKETDAY_API_URL` is injected — production has no reverse
     * proxy, so the browser calls the backend directly and the API can live on
     * its own origin (which then needs CORS: `../backend/src/main.ts` calls no
     * `enableCors`, see `docs/backend-api-gaps.md` §12). Left relative when it
     * isn't, for a deploy that serves console and API from one origin.
     */
    graphqlUrl: apiOrigin ? `${apiOrigin.replace(/\/+$/, '')}/graphql` : '/graphql',
    /**
     * Sent as `x-api-key` on every GraphQL call by `authInterceptor`, because
     * the backend's global `ApiKeyGuard` requires it even on `@Public()`
     * operations. With no proxy to inject it server-side, the key ships in the
     * browser bundle and is therefore public — scope it to this console and
     * treat it as an identifier, not a secret.
     */
    key: apiKey,
  },
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
