# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

`marketday-admin` is the Angular admin console for the MarketDay platform (a farmer-market
pre-order system) — Angular 22, standalone, zoneless, SSR, Angular Material + Tailwind v4.
The console from `../design/` ("MarketDay Admin Material.dc.html") is implemented: an auth
flow (`/login`, `/login/verify`, `/forgot-password`) and a console shell over Overview,
Markets (list / manage / add-market wizard), Vendors (directory / detail tabs / application
dialog), Users, Support inbox and Account. All data is served by an in-memory fixture
backend under `core/api/in-memory/`.

Two documents outside this repo drive the work:

- **`../docs/ARCHITECTURE.md`** — the design contract the feature code follows:
  inward-only layering (`features` → `layouts` → `shared` → `core`), the
  repository / facade / generic-`CollectionStore<T>` patterns, signals-only state,
  Angular Material-first UI, lazy feature routes with filters in query params, and a
  Google Maps adapter under `core/maps/`.
- **`../backend`** (package `marketday-api`) — the API this console will call: NestJS +
  GraphQL (Apollo over Fastify), TypeORM / PostgreSQL / PostGIS, JWT + Google OAuth. No
  client is wired up yet; `core/api/ports/*` are abstract-class ports bound to
  `InMemory*Repository` in `core/api/api.providers.ts`. `../docs/ARCHITECTURE.md` §8
  describes the `core/api/graphql/` swap — add the classes, change the `useClass` lines,
  delete nothing else. `core/models/*.model.ts` already mirrors the backend enums.

## Commands

Package manager is **pnpm** (pinned via `packageManager`, pnpm@11.5.0) — not npm/yarn.

- Install: `pnpm install`
- Dev server: `pnpm start` (`ng serve`, http://localhost:4200)
- Production build: `pnpm run build` (SSR build → `dist/marketday-admin/`)
- Watch build (dev config): `pnpm run watch`
- Serve the SSR build: `pnpm run serve:ssr:marketday-admin` (`node dist/marketday-admin/server/server.mjs`, listens on `PORT`, default 4000)
- All unit tests: `pnpm test` (`ng test` → `@angular/build:unit-test` builder, Vitest + jsdom)
- Single test file: `pnpm test -- --include=src/app/app.spec.ts`
- CI-style (no watch): `pnpm test -- --watch=false`
- Format: `npx prettier --write .` (no npm script defined for it)

There is no lint (no ESLint) and no e2e tooling configured. `ng generate` uses the `md`
selector prefix (`angular.json` → `projects.marketday-admin.prefix`); every component
selector is `md-*`.

## Architecture (current state)

- **Standalone components only**, no NgModules. Browser bootstrap in `src/main.ts`;
  providers in `src/app/app.config.ts` — `provideZonelessChangeDetection()`,
  `provideRouter` (with `withComponentInputBinding()`), `provideClientHydration()`,
  `provideAnimationsAsync()`, `API_PROVIDERS`, and `MAT_ICON_DEFAULT_OPTIONS` /
  `MAT_FORM_FIELD_DEFAULT_OPTIONS` (Material Symbols Rounded icons, `fill` form fields).
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
  browser, no-op on the server). Guards in `core/auth/auth-guards.ts`. Fixture login:
  `aine@marketday.ie` + any 6+ char password → `/login/verify` → any 6-digit code (not
  `000000`).
- No state library (no NgRx). Server data → feature `CollectionStore<T,F>` subclass provided
  at the route; session → `AuthStore`; ephemeral UI → component `signal()`.

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
