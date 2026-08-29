# MarketDay Admin — Architecture

The admin console is a signals-first, standalone-components Angular 22 app. This
document is the contract the feature code follows: what each layer may know
about, which direction dependencies point, and which pattern solves which
problem.

## 1. Layering

Dependencies point **inward only**. A layer may import from the layers below it
in this list, never from the ones above.

```
features/   screens, feature state, feature routes        (may use shared, core)
layouts/    console shell + auth shell                     (may use shared, core)
shared/     presentational components, pipes, directives   (may use core/models)
core/       domain models, ports, adapters, app services   (imports nothing app-level)
```

- `core/` holds **no UI**. It is the domain and the plumbing.
- `shared/` holds **no business logic**. Every component there is driven purely
  by `input()`/`output()` and is safe to drop anywhere. It may inject a `core/`
  _infrastructure_ service — `GoogleMapsLoader`, in the same spirit as
  `Notifications` wrapping `MatSnackBar` — but never a repository or a store.
- `features/` is the only place that composes the two.

Enforcement is by convention and review; there is no lint rule yet.

## 2. SOLID, concretely

| Principle                 | How it lands in this codebase                                                                                                                                                                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S**ingle responsibility | Four distinct roles, never merged: a **repository** does I/O and nothing else; a **store** holds state and nothing else; a **facade** orchestrates the two and exposes an intent-shaped API; a **component** renders and emits.                                                                                |
| **O**pen/closed           | `CollectionStore<T>` (`core/state/collection-store.ts`) is written once and _extended_ per feature — `MarketsStore`, `VendorsStore`, `UsersStore` add domain-specific selectors without editing the base. New backends are added as new `*Repository` implementations, not by editing existing ones.           |
| **L**iskov substitution   | Every repository is declared as an `abstract class` port. `InMemory*Repository` and (later) `Graphql*Repository` are drop-in substitutes: same signatures, same `Observable` contract, same error semantics. Swapping them changes one line in `app.config.ts`.                                                |
| **I**nterface segregation | One narrow port per aggregate — `MarketRepository`, `VendorRepository`, `UserRepository`, `SupportRepository`, `AuthRepository`, `AccountRepository`. There is deliberately no `ApiService` god object; the dashboard depends only on `DashboardRepository`, so a change to support ticketing cannot break it. |
| **D**ependency inversion  | Components and facades inject the **abstract class**, never a concrete one. Angular DI binds the implementation in `core/api/api.providers.ts`. Nothing above `core/` knows whether data comes from HTTP, GraphQL, or an in-memory fixture.                                                                    |

## 3. Patterns in use

- **Repository** (`core/api/ports/*.ts`) — abstract classes as DI tokens. Angular
  resolves `abstract class` tokens structurally, so no `InjectionToken` +
  interface pairing is needed and the type stays checkable.
- **Adapter** (`core/api/in-memory/*.ts`) — the fixture backend that satisfies
  every port today. A `core/api/graphql/` sibling can be added later without a
  single change above `core/`.
- **Facade** (`features/*/*-facade.ts`) — one injectable per feature exposing
  read-only signals plus intent methods (`load()`, `approve(id)`,
  `applyFilters(f)`). Components never touch a repository directly.
- **Generic store / template method** (`core/state/collection-store.ts`) —
  loading, error, entity and filter state written once; subclasses supply only
  the fetch call and any derived selectors.
- **Strategy** — `SESSION_STORAGE` and the repository bindings are strategies
  chosen at bootstrap. SSR gets a no-op storage strategy; the browser gets
  `localStorage`. This is what keeps auth SSR-safe.
- **Observer** — Angular signals throughout. `computed()` for derived state,
  `resource`-free explicit loads so retries and optimistic updates stay obvious.
- **Presentational / container split** — `shared/components/*` are presentational;
  feature roots are containers.
- **Command** — the market wizard models each step as a route (`?step=`), so
  Back/Continue are navigations, not hidden component state.

## 4. State

Signals only; no NgRx. The rule of thumb:

- **Server data** → feature store extending `CollectionStore<T>`, provided at the
  route level so it dies with the route.
- **Session/auth** → `AuthStore`, `providedIn: 'root'`, the one true singleton.
- **Ephemeral UI** (open drawer, selected row, active tab) → `signal()` on the
  component.

`CollectionStore<T>` exposes `items()`, `status()`, `error()`, `filters()`,
`isLoading()`, `isEmpty()` and a `load()` template method. Every list screen in
the app gets its loading, empty and error states from that one base.

## 5. UI: Angular Material first

**Every control is an Angular Material component.**

`shared/components/*` exist only to _compose_ Material pieces that repeat
verbatim across screens (page header, stat card, status chip, empty state). None
of them re-implement a control Material already ships.

**Use Material components as-is — no personalization layer that changes their
structure.** No `::ng-deep`, no reaching into internal DOM or `.mdc-*` classes,
no overriding a component's own layout, padding or template. If a screen needs
something a Material component cannot express through its documented inputs, the
answer is a different Material component or a `shared/` wrapper _around_ it —
never a restyled internal. Component styles only do layout and chrome _around_
Material elements, with Tailwind utilities and the theme tokens.

## 6. Theming

No hex literals in component styles. `src/theme/theme.scss` runs `mat.core()`
then `mat.theme(...)` with the MarketDay palettes and emits the full set of
`--mat-sys-*` system tokens — colour roles, `corner-*` radii, `level0`–`level5`
elevations, the M3 type scale, `body-large-font` / `display-large-font` — light
by default and redefined under `@media (prefers-color-scheme: dark)`, over a
cream / ink page ground.

**The Tailwind theme _is_ those Material variables — it defines no values of its
own.** `src/styles.css` does `@import 'tailwindcss'` then one `@theme inline`
block that re-exports every `--mat-sys-*` token into Tailwind's own theme
namespaces, so utilities are generated straight from the live theme:

| Tailwind namespace                             | Inherits from                                               | Generated utilities                                                             |
| ---------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `--color-*`                                    | `--mat-sys-*` colour roles                                  | `bg-primary`, `text-on-surface-variant`, `border-outline-variant`, `fill-error` |
| `--radius-*`                                   | `--mat-sys-corner-*`                                        | `rounded-large`, `rounded-full`                                                 |
| `--shadow-elevation-0`–`5`                     | `--mat-sys-level0`–`level5`                                 | `shadow-elevation-2`                                                            |
| `--text-*` (+ line-height / tracking / weight) | `--mat-sys-<role>-*`                                        | `text-headline-large`, `text-label-medium`                                      |
| `--font-plain`, `--font-brand`                 | `--mat-sys-body-large-font`, `--mat-sys-display-large-font` | `font-plain`, `font-brand`                                                      |

`inline` is deliberate, not cosmetic: the `--mat-sys-*` values are swapped at
runtime for dark mode, and `inline` keeps each generated utility pointing at the
live `var(--mat-sys-*)` instead of a light value frozen at build time.

There is therefore no parallel Tailwind colour palette, radius, elevation or type
config that could drift from the theme. `--mat-sys-*` is the single source of
colour, shape, elevation and type; Tailwind supplies only layout and spacing. A
component styles itself with these utilities (`bg-surface`,
`text-on-surface-variant`, `rounded-large`, `shadow-elevation-2`) or by reading
`--mat-sys-*` directly — never a hex literal.

## 7. Routing

```
/login, /login/verify, /forgot-password     authLayout   (guest guard)
/                                           consoleLayout (auth guard)
  ''            → dashboard
  markets       → list · new (wizard) · :id (routed tabs)
  vendors       → list · new · :id (routed tabs)
  users         → list
  support       → inbox, :enquiryId child route (list stays mounted)
  account       → profile / security / notifications
```

Every feature route is `loadComponent`/`loadChildren` lazy. Filters live in query
params so a filtered list is linkable, exactly as the design specifies.

## 8. Swapping in the real backend

The sibling `../backend` repo is NestJS + GraphQL. When it is wired up:

1. Add `core/api/graphql/` with one class per port.
2. Change the `useClass` bindings in `core/api/api.providers.ts`.
3. Delete nothing else.

`core/models/*.model.ts` already mirrors the backend enums (`MarketStatus`,
`MarketType`, `UserRole`, `VendorMemberRole`, `SupportCategory`) so the mapping
layer stays thin.

`MarketDraft` is already shaped for `CreateMarketInput`: `address`, `city`,
`latitude` and `longitude` are the four location fields the API requires
(`markets.location` is a NOT NULL PostGIS point, and the service rejects a
latitude sent without its longitude). `county` and `eircode` have **no column
server-side** — they are console fields, used for the market-list filter, and the
GraphQL adapter simply will not send them.

## 9. Maps and geocoding

`core/maps/` is the adapter for Google Maps, and the only place a `google.maps`
type appears:

- `GOOGLE_MAPS_CONFIG` — key, map ID, region and default view, defaulted from
  `src/environments/environment.ts` through a root factory so every `TestBed`
  resolves it without a provider.
- `GoogleMapsLoader` — injects the Maps script once, on demand. It stays inert
  on the server and whenever the key is empty, so a build without a key is a
  degraded map rather than a broken screen.
- `Places` — `suggest`, `resolve` and `reverseGeocode`, returning
  `PlaceSuggestion` / `ResolvedPlace`. It uses the **Places API (New)** data
  layer (`AutocompleteSuggestion`), not the `Autocomplete` widget, which has been
  closed to new customers since March 2025 and cannot live inside a
  `mat-form-field`. Autocomplete is rendered with `mat-autocomplete`, per §5.

The UI half is `shared/components/location-picker.ts` — a map with one draggable
pin that emits coordinates and never writes to a control. It has a fallback
panel for every way the map can be absent (server, no key, key rejected), which
is what keeps the Google key an optional dependency of the market wizard.

The key lives in `src/environments/environment.development.ts`, swapped in by
`fileReplacements`. It needs **Maps JavaScript API**, **Places API (New)** and
**Geocoding API** enabled and billed on its Cloud project.
