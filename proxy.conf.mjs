/**
 * Dev-server proxy for the GraphQL API.
 *
 * Two problems this solves at once:
 *
 * 1. The backend registers no CORS config at all (`../backend/src/main.ts` never
 *    calls `enableCors`), so a direct browser → API call dies on the preflight.
 *    Proxying makes `/graphql` same-origin, so there is no preflight to fail.
 *
 * 2. `ApiKeyGuard` is a global `APP_GUARD` — every request needs `x-api-key`,
 *    including `@Public()` ones. Injecting it here keeps it out of the browser
 *    bundle; a key shipped to the client would be public and the guard pointless.
 *
 * Run the dev server with the key in the environment:
 *
 *   MARKETDAY_API_KEY=… pnpm start
 *
 * This is a **dev-only** arrangement. Production has no proxy: the built bundle
 * sends `x-api-key` itself, from `environment.api.key` (injected by `pnpm run
 * build` — see `src/environments/environment.ts`), and the API needs CORS of
 * its own if it is served from another origin — see `docs/backend-api-gaps.md`.
 */
export default {
  '/graphql': {
    target: process.env.MARKETDAY_API_URL ?? 'http://localhost:3000',
    changeOrigin: true,
    headers: { 'x-api-key': process.env.MARKETDAY_API_KEY ?? '' },
  },
};
