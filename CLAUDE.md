# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

`marketday-admin` is the Angular admin console for the MarketDay platform (a farmer-market
pre-order system) — Angular 22, standalone, zoneless, SSR, Angular Material + Tailwind v4.
The console from `../design/` ("MarketDay Admin Material.dc.html") is implemented: an auth
flow (`/login`, `/login/verify`, `/forgot-password`) and a console shell over Overview,
Markets (list / manage / add-market wizard), Vendors (directory / detail tabs / application
dialog), Users, Support inbox and Account.

Data is a **hybrid**: Auth, Passkeys, Markets, Profile, Media, Vendors, Products and Users are wired to
`../backend`'s real GraphQL API (`core/api/graphql/`) — the ports the schema genuinely covers
for an admin. Vendors is partial: `adminVendors` + `vendor(id)` back the directory list, the
detail shell and the Profile tab's read — the directory **pages server-side** (`limit`/`offset`
/`totalCount`, with the search and the Paused toggle sent as `CriteriaInput` filters), and
falls back to reading the directory whole only for the filters `adminVendors` cannot express:
Market, At 2+ markets, Applications, Fee unpaid (`docs/backend-api-gaps.md` §13) — `updateVendor` (widened server-side to take an ADMIN
branch before its owner-only seat lookup) backs that tab's save, and `createVendor`
(`@Roles(ADMIN)`) makes the invite screen (design 1n) create the business for real — name,
trade, the picked markets, and an owner: the contact name and email seat that person as the
vendor's `OWNER`, reusing their MarketDay account or creating a passwordless one. "Skip
application review" is `CreateVendorInput.isActive`: on, the vendor trades at once; off (the
default), it is created **inactive** — owned and joined to its markets, but refused at checkout
and dropped from search (its stalls stay on their market rosters, which clients show as "no
longer available") — until an admin chooses **Activate vendor** in that row's ⋮ menu on the
directory, which sends `updateVendor(id, { isActive })` alone (**Deactivate vendor** is the same
call the other way). `isActive` is admin-only on `updateVendor` server-side, so an owner cannot
reopen what an admin closed. What the invite screen still has no endpoint for is the invitation
itself (no email is sent; the owner gets in via Forgot password); there is still no application
*model* (no submitted form, no decline). Taking orders is **per (vendor, market)**
now (`../backend/specs/per-market-order-windows.md`): the Markets tab reads each membership's
`vendorOrderWindow` (one call per market) and the market roster reads the `orderWindow` that
`vendors(marketId:)` hydrates, so "paused" there means paused *at that market*; the directory's
Paused pill and filter mean `isActive = false`. An admin can read a stall's pause but not set it
— `setVendorMarketAcceptingOrders` resolves the vendor from the caller's seat. `saveProfile` is bounded by `UpdateVendorInput` rather than by the form — the
registered name, VAT, produce tags, contact block and address have no column at all, so the tab
disables them and the adapter drops them. Products runs end-to-end — `products(vendorId:)`
and `vendor(id)` for the grid, the product mutations (widened to `@Roles(VENDOR, ADMIN)`
server-side) for every write; `GraphqlProductRepository` keeps a private
`InMemoryProductRepository` primed from the real read to reconstruct the shapes the port hands
back, and `remove()` unlists everywhere and hides since there is no `deleteProduct`. The
products grid pages in that adapter rather than against the API — the catalogue is read once
(and re-read at `totalCount` if the first ask was short) because design 3a's rails, header and
two bulk commands all need it whole (`docs/backend-api-gaps.md` §14) — but the port is the same
`Page`-shaped one the vendor directory uses, so only the adapter changes if the backend grows
listing filters and aggregates. Users runs end-to-end on `adminUsers` (server-side paging, every
filter pushed down, the header's and menus' counts as aliases in the same document) and
`suspendUser` / `restoreUser`, all `@Roles(ADMIN)` and added server-side for this screen — a
suspension signs the account out and is enforced at `AuthService.issueTokens` and `JwtStrategy`;
"Send password reset" is the public `requestPasswordReset`. Organiser / support agent have no
column behind them (every `ADMIN` reads as a platform admin), and Change role, Invite team
member and Export stay disabled (`docs/backend-api-gaps.md` §1). The other
four ports (Payments, Activity, Support, Dashboard) still run on the
`InMemory*Repository` fixtures under `core/api/in-memory/`, bound in
`core/api/api.providers.ts`. See `docs/backend-api-gaps.md` for exactly what's missing
server-side and why each port landed where it did.

Two documents outside this repo drive the work:

- **`../docs/ARCHITECTURE.md`** — the design contract the feature code follows:
  inward-only layering (`features` → `layouts` → `shared` → `core`), the
  repository / facade / generic-`CollectionStore<T>` patterns, signals-only state,
  Angular Material-first UI, lazy feature routes with filters in query params, and a
  Google Maps adapter under `core/maps/`.
- **`../backend`** (package `marketday-api`) — the API this console calls: NestJS + GraphQL
  (Apollo over Fastify), TypeORM / PostgreSQL / PostGIS, JWT + Google OAuth.
  `core/api/ports/*` are abstract-class ports; `core/api/graphql/*` implements the eight the
  schema covers (Vendors partially), `core/api/in-memory/*` the rest — see
  `core/api/api.providers.ts` for the `useClass` bindings. `core/models/*.model.ts` mirrors
  the backend enums.

## Running against the real backend

The GraphQL client (`core/api/graphql/graphql-client.ts`) posts to `environment.api.graphqlUrl`.
The backend's global `ApiKeyGuard` requires an `x-api-key` header on every request, including
`@Public()` ones, and the backend registers no CORS at all — how those two are handled differs
by build.

**Dev** is proxied by `proxy.conf.mjs`, wired into `angular.json` →
`architect.serve.configurations.development.proxyConfig`: it makes `/graphql` same-origin (so
there is no preflight to fail) and injects the key, keeping it out of the bundle. Run:

```sh
MARKETDAY_API_KEY=… pnpm start           # backend on localhost:3000 by default
MARKETDAY_API_URL=http://localhost:PORT MARKETDAY_API_KEY=… pnpm start   # different port
```

The access/refresh token pair lives in `core/auth/token-store.ts` (not `AuthStore`, to avoid a
DI cycle through the interceptor); `core/auth/auth-interceptor.ts` attaches the bearer token to
GraphQL calls only — never to the presigned-upload `PUT`s, which go straight to R2/LocalStack —
and refreshes once, single-flight, on an unauthenticated response. The sign-in calls (`login`
and both halves of a passkey sign-in) are marked with its `SIGN_IN` context instead: they carry
no bearer, and their 401 is the answer ("Invalid credentials", "Invalid passkey") rather than an
expired session to refresh.

**Passkeys** are checked by the backend against the origin the browser signs into every
response, so its `WEBAUTHN_ORIGINS` must list the console's origin and `WEBAUTHN_RP_ID` must be
that origin's domain — in dev the defaults, `http://localhost:4200` and `localhost`, which the
proxy makes true. Browsers only expose WebAuthn in a secure context: open dev at
`localhost:4200`, not a LAN IP. In Chrome, DevTools → WebAuthn → "Enable virtual authenticator
environment" (ctap2, resident keys, user verification) stands in for Touch ID.

Types for every operation under `core/api/graphql/operations/*.ts` are generated from the
checked-in `schema.gql` via `pnpm gql:generate` (`codegen.ts`) into
`core/api/graphql/generated.ts`, which is committed. Regenerate and rebuild after changing an
operation document or pulling a new `schema.gql`.

**Production has no proxy** — the bundle sends `x-api-key` itself. `pnpm run build` forwards
`MARKETDAY_API_URL` / `MARKETDAY_API_KEY` into the bundle through `ng build --define`, where
`src/environments/environment.ts` reads them into `api.graphqlUrl` and `api.key`, and
`core/auth/auth-interceptor.ts` attaches the key alongside the bearer token — on GraphQL calls
only, never on the presigned `PUT`s:

```sh
MARKETDAY_API_KEY=… pnpm run build                                  # console and API same origin
MARKETDAY_API_URL=https://api.marketday.ie MARKETDAY_API_KEY=… pnpm run build   # API elsewhere
```

Two things follow. The key is **public** — it is in the shipped JS, so it identifies this
client rather than authenticating it; give the console its own and rotate it there. And a
cross-origin `MARKETDAY_API_URL` **needs CORS on the backend** (`x-api-key` is not a safelisted
header, so it must be named in `allowedHeaders`); without it, serve console and API from one
origin and leave `MARKETDAY_API_URL` unset so `graphqlUrl` stays relative. See
`docs/backend-api-gaps.md` §12.

**Google Maps** takes its browser key from `MARKETDAY_GOOGLE_MAPS_API_KEY`, in dev and
production alike: `start`, `watch`, `build` and `build:vercel` all forward it with `--define`
into `googleMaps.apiKey` in both environment files, so no key is committed. Unset, the key is
empty and `core/maps/` stays inert — the location picker degrades rather than breaks. It ships
in the bundle too, so restrict it by HTTP referrer and API (Maps JavaScript API, Places API
(New), Geocoding API) in the Cloud console, and set it in Vercel's project environment.

## Commands

Package manager is **pnpm** (pinned via `packageManager`, pnpm@11.5.0) — not npm/yarn.

- Install: `pnpm install`
- Dev server: `pnpm start` (`ng serve`, http://localhost:4200)
- Production build: `pnpm run build` (SSR build → `dist/marketday-admin/`)
- Static build for Vercel: `pnpm run build:vercel` (`production,vercel` — `outputMode: static`,
  no server bundle → `dist/marketday-admin/browser/index.html`)
- Watch build (dev config): `pnpm run watch`
- Serve the SSR build: `pnpm run serve:ssr:marketday-admin` (`node dist/marketday-admin/server/server.mjs`, listens on `PORT`, default 4000)
- All unit tests: `pnpm test` (`ng test` → `@angular/build:unit-test` builder, Vitest + jsdom)
- Single test file: `pnpm test -- --include=src/app/app.spec.ts`
- CI-style (no watch): `pnpm test -- --watch=false`
- Regenerate GraphQL operation types from `schema.gql`: `pnpm gql:generate`
- Format: `npx prettier --write .` (no npm script defined for it)

There is no lint (no ESLint) and no e2e tooling configured. `ng generate` uses the `md`
selector prefix (`angular.json` → `projects.marketday-admin.prefix`); every component
selector is `md-*`.

## Architecture (current state)

- **Standalone components only**, no NgModules. Browser bootstrap in `src/main.ts`;
  providers in `src/app/app.config.ts` — `provideZonelessChangeDetection()`,
  `provideRouter` (with `withComponentInputBinding()`), `provideClientHydration()`,
  `provideAnimationsAsync()`, `provideHttpClient(withFetch(), withInterceptors([authInterceptor]))`,
  `API_PROVIDERS`, and `MAT_ICON_DEFAULT_OPTIONS` / `MAT_FORM_FIELD_DEFAULT_OPTIONS`
  (Material Symbols Rounded icons, `fill` form fields).
- **Zoneless.** Change detection is signal-driven; anything that must re-render lives in
  `signal()` / `computed()`. `MatTableDataSource` is synced from a store signal via an
  `effect`.
- **SSR** (`outputMode: "server"`): `src/app/app.routes.server.ts` server-renders the
  public auth pages and marks the console `RenderMode.Client` — the auth guard only reads
  client storage, so server-rendering it would just bounce to `/login`.
- **Layers** (`../docs/ARCHITECTURE.md` §1): `src/app/core/` (models, `state/collection-store.ts`,
  `api/ports` + `api/in-memory`, `auth`, `notifications`), `src/app/shared/components`
  (presentational: page-header, stat-tile, status-pill, avatar, face-pile, empty-state),
  `src/app/layouts` (`console-layout` = `mat-sidenav` shell, `auth-layout` = split panel),
  `src/app/features/*` (each with a facade and/or a `CollectionStore` subclass, lazy routes).
- **Auth** is `AuthStore` (`providedIn: 'root'`) over `SESSION_STORAGE` (localStorage in the
  browser, no-op on the server). Guards in `core/auth/auth-guards.ts`. Sign-in is a
  `SignInOutcome` union (`'signed-in' | 'challenge'`): the fixture backend challenges
  (`aine@marketday.ie` + any 6+ char password → `/login/verify` → any 6-digit code, not
  `000000`); the real `GraphqlAuthRepository` completes in one step and rejects non-`ADMIN`
  roles, so `/login/verify` stays routed but unreached against it. JWTs live in
  `core/auth/token-store.ts`, separate from `AuthStore` — see "Running against the real
  backend" above. **Passkeys** sit beside the password, never replacing it: `/login` has a
  "Sign in with a passkey" button and offers passkeys in the email field's autofill
  (`autocomplete="username webauthn"`), both through `AuthStore.signInWithPasskey`;
  Settings → Security (`features/account/security`) adds, renames and removes them through
  `PasskeyRepository`. `core/auth/webauthn.ts` is the one seam over `navigator.credentials`
  (`@simplewebauthn/browser`, lazy-loaded, never on the server); a dismissed prompt is a
  `PasskeyCancelledError`, which the UI stays quiet about.
- No state library (no NgRx). Server data → feature `CollectionStore<T,F>` subclass provided
  at the route; session → `AuthStore`; ephemeral UI → component `signal()`. A screen whose
  backend pages extends **`PagedCollectionStore<T,F>`** instead (`core/state/`): `items()` is
  one page, `total()` the rows behind the filters, and `setPage()` / `setFilters()` each go
  back to the repository — the port takes a `PageRequest` and answers with a `Page<T>`
  (`core/models/page.model.ts`). `VendorsStore`, `VendorProductsStore` and `AccountsStore` are
  the three so far; whether the page comes from the server (vendors, accounts) or is cut by the adapter from what it holds
  (products) is the repository's business, not the store's. A screen whose header or rails
  describe the whole collection reads them from facets the repository sends beside the page —
  a page cannot restate a total it does not contain.

## Styling

- **Angular Material** (M3) + **Tailwind CSS v4**. `src/theme/theme.scss` runs `mat.core()`
  then `mat.theme(...)` with the MarketDay tonal palettes from
  `src/theme/_marketday-palette.scss` (Hanken Grotesk / Bricolage Grotesque type, cream/ink
  page ground, `prefers-color-scheme` dark). Both `src/theme/theme.scss` and
  `src/styles.css` are in `angular.json` → `styles`.
- **No hex literals in component styles** (`../docs/ARCHITECTURE.md` §6): components read
  `--mat-sys-*` tokens plus the `--md-admin-*` console-chrome aliases defined once in
  `src/styles.css`. Use Material components **as-is** — no `::ng-deep` / internal restyling;
  do layout and chrome around them with Tailwind + the tokens.

## Code style

- **Prettier** (`.prettierrc`): 100-char print width, single quotes, `angular` parser for
  `*.html`.
- **`.editorconfig`**: 2-space indent, UTF-8, final newline; single quotes in `*.ts`.
- **TypeScript** (`~6.0.2`) enables `noImplicitOverride`,
  `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `noFallthroughCasesInSwitch`,
  `isolatedModules`; Angular compiler options add `strictInjectionParameters` and
  `strictInputAccessModifiers`. Note `strict` / `strictTemplates` are **not** on.
- **Angular naming** follows the modern v20+ style — no `.component` / `.service` suffix
  (`app.ts` exports class `App`). See
  `.claude/skills/angular-developer/references/naming-conventions.md`.
- **One folder per component.** Every component lives in its own directory named after it,
  holding its `.ts` plus whatever of `.html` / `.css` / `.spec.ts` it has (inline
  `template` / `styles` stay inline — the folder just holds the `.ts` then). Non-component
  siblings — `*-facade.ts`, `*-store.ts`, `*.routes.ts`, shared stylesheets — stay at the
  feature-folder root. `shared/components/*` and `layouts/*` already follow this.

## Bundled Angular reference skills

`.agents/skills/` (symlinked into `.claude/skills/`) vendors two skills from
`angular/skills`, tracked in `skills-lock.json`:

- **`angular-developer`** — architectural guidance plus a `references/` library covering
  signals, `linkedSignal`, `resource`, `effect`, DI, routing, signal/reactive/template
  forms, `HttpClient` + `httpResource`, testing with Vitest, Tailwind, ARIA, and naming.
  Consult these for idiomatic Angular 22 since this repo has no conventions of its own yet.
- **`angular-new-app`** — the CLI-driven new-app workflow.

Per `angular-developer`, run `pnpm run build` after generating code and fix any errors
before moving on.
