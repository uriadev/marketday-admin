# Backend API gaps

What `../backend` (`marketday-api`) still owes the admin console, found while wiring
`core/api/graphql/` against `schema.gql`. Each gap names the port it blocks and the console
screen it's holding back; `core/api/api.providers.ts` keeps that port bound to its
`InMemory*Repository` fixture until the gap closes. Two backend bugs are filed at the end,
found while reading the same code, unrelated to what's missing.

## Missing queries and mutations

1. **No `adminUsers` (or equivalent) query.** `me: UserProfileModel!` is the only user query in
   the schema. `setRole(userId, role)` is `@Roles(ADMIN)` and functional, but nothing in the API
   can tell an admin what a `userId` is — there is no way to list users or look one up. Blocks
   `AccountRepository`, the Users screen.

2. ~~**No global vendor list.**~~ **Closed.** `adminVendors(criteria: CriteriaInput): VendorsPage!`
   (`@Roles(ADMIN)`, `src/vendors/vendors.resolver.ts`) lists every vendor on the platform,
   including one that trades nowhere yet, and `VendorModel.slug` is now a real field — so
   `/vendors/:slug` links resolve without the client-side derivation gap 10 called out.
   `GraphqlVendorRepository` wires `list()` to it and `detail()` / the Profile tab's read to
   `vendor(id)`. `VendorModel.memberCount` is now a real field (batch-hydrated on the list, so
   free per row) and `adminVendorMembers(criteria:)` (`@Roles(ADMIN)`) exposes the roster:
   `detail()` folds it in — filtered `{ field: "vendorId", operator: EQUAL }` — so the Staff
   tab (design 1c) and the detail's Staff badge/stat run on real data. The directory list does
   **not** fan out to `adminVendorMembers`, so the face pile there still draws faceless discs
   and `staff` names stay empty on the list read. What is still missing on
   `VendorModel` keeps the vendor **write** paths and the richer detail tabs on session-local
   data — see gaps 6–9 and the `GraphqlVendorRepository` class doc: no per-market
   fee/standing, no application or document model, and `updateVendor` is owner-only so an
   admin cannot persist a profile edit.

3. **No support-message listing, thread, reply, or assignment model.**
   `src/support/support.resolver.ts` has two mutations and **no `@Query` at all** — the inbox is
   write-only. `submitContactMessage` (public) and `submitSupportMessage` (authenticated) create
   rows nothing can read back. Blocks `SupportRepository`, the whole Support screen.

4. **No stall/pitch model.** Nothing server-side represents a market's stall layout or who is
   placed where — `Market` has no `stallCount`/pitch relation. Blocks `MarketRepository.stallPlan`
   / `saveStallPlan`, delegated to `InMemoryMarketRepository` in
   `graphql-market-repository.ts` — which only has data for the fixture's own market slugs, so a
   market created through the real wizard has no stall map at all yet. Blocks the Stalls tab.

5. **No invoice or ledger model.** Only `Market.stallFeePerDay` exists — nothing records a charge,
   a payment, a waiver, or a reminder. Blocks `PaymentRepository`, the Payments tab.

6. **No vendor audit log.** The closest thing is `OrderStatusEventModel`, which is order-specific.
   Blocks `ActivityRepository`, the Activity tab.

7. **No admin-scoped _vendor_ mutations.** `updateVendor` throws `ForbiddenException`
   unless the caller _is_ the vendor being edited (`assertOwner`). An admin cannot edit a
   vendor through the API today. Blocks the Vendors screen's write path — with `adminVendors`
   now serving the directory read (gap 2), `GraphqlVendorRepository.saveProfile` holds an edit
   in memory for the session and layers it over the real `vendor(id)` read, the same way
   `GraphqlProfileRepository` treats its uncovered fields.

   ~~**…or product mutations.**~~ **Closed.** `createProduct`, `updateProduct`, `toggleProduct`
   and `createProductImageUploadUrl` are now `@Roles(VENDOR, ADMIN)`, and `setProductListing` /
   `removeProductListing` too; for an ADMIN caller the resolver takes the target vendor from a
   `vendorId` argument (`createProduct` / `createProductImageUploadUrl`) or from the product
   being changed, and skips `assertOwner` / `assertMarketInScope` — `@Roles(ADMIN)` is the
   whole gate. `GraphqlProductRepository` runs the Products grid (design 3a) and the product
   form (design 4a) end-to-end on these. One seam is still open: the console's `MediaRepository`
   port has no vendor argument, so `createProductImageUploadUrl` from an admin (product-photo
   upload on design 4a) has no `vendorId` to send and stays non-functional until the media
   port grows one.

8. **No `deleteProduct` mutation.** `src/products/products.service.ts` stops at
   `removeListing` (`removeProductListing`) — there is no way to delete a product outright.
   `GraphqlProductRepository.remove` stands in by unlisting the product at every market and
   toggling it hidden — as gone as the schema allows, but a full reload still shows it as a
   "Not carried" row. A real `deleteProduct` would let that row disappear.

9. **No vendor application/approval concept.** `Market.reviewApplications` is a real NOT NULL
   column but nothing acts on it — no `approveVendor`/`declineVendor`, no pending/approved/
   declined state on `Vendor` (only `isActive` and `isAcceptingOrders`). Blocks the "needs a
   decision" flows on the Markets and Vendors screens, and the vendor-invite flow (design 1n):
   `GraphqlVendorRepository.invite` adds a row to this session's directory and calls no
   endpoint. A vendor read from `adminVendors` is therefore only ever `trading` or `paused` —
   never `pending`/`fee-unpaid`/`invited`.

10. ~~**`VendorModel` has no `slug`.**~~ **Closed.** `VendorModel.slug` is a real `String!`
    field and `Create`/`UpdateVendorInput` both accept `slug`. `market-mapper.ts`'s
    `toMarketRoster` still derives a slug client-side for the per-market roster rows because
    that query (`vendors(marketId)`) selects a narrower projection — widen its selection to
    `slug` to drop the derivation there too.

11. **No `totalCount` on `adminMarkets`.** `MarketsService.filter` applies neither a `totalCount`
    nor a default `limit` — an omitted `criteria` is an unbounded scan. `vendors`/`products`
    already return `{ items, totalCount }` via `Paginated<T>`; `adminMarkets` should too.

## Deployment precondition

12. **No CORS configuration**, and the global `ApiKeyGuard` requires `x-api-key` on every
    request. The admin console is a browser SPA, not a backend-for-frontend, so it must send the
    key itself. In dev `proxy.conf.mjs` injects it and makes the call same-origin; **production
    has no proxy** — `pnpm run build` bakes `MARKETDAY_API_KEY` into `environment.api.key` via
    `ng build --define` and `authInterceptor` sends it on every GraphQL call. Two consequences:

    - The key is **public** — it ships in the bundle and anyone can read it. It is an
      identifier for this client, not a secret; issue the console its own and rotate it there.
    - Serving the API on a **different origin still needs CORS** on the backend
      (`../backend/src/main.ts` never calls `enableCors`), and `x-api-key` is not a
      CORS-safelisted header, so the preflight must allow it: `origin` = the console's origin,
      `allowedHeaders` including `x-api-key`, `authorization`, `content-type`. Until that
      exists, production must serve console and API from **one origin** — leave
      `MARKETDAY_API_URL` unset at build time and `graphqlUrl` stays the relative `/graphql`.

## Bugs found while reading (not missing features)

- **Every `CriteriaInput` filter is a silent no-op.** `FilterInput.value` in
  `src/common/criteria/inputs/criteria.input.ts` has no `@Allow()`/`@IsDefined()`, and
  `main.ts` installs `new ValidationPipe({ whitelist: true, transform: true })`, which strips
  `value` before the resolver ever sees it. `CONTAINS` becomes `ILIKE '%undefined%'` (0 rows);
  `NOT_CONTAINS` becomes `NOT ILIKE '%undefined%'` (**every row**). `typeorm-criteria.converter.spec.ts`
  passes because it bypasses the pipe. One-line fix (`@Allow()` on `value`). This is why the
  admin console sends no server-side filters via `CriteriaInput` and keeps `CollectionStore`'s
  client-side narrowing exactly as it was under fixtures.

- **`generateOccurrences` is `@Public()`.** It sits between two `@Roles(ADMIN)` mutations
  (`updateMarket`, and `createMarket`/`createMarketImageUploadUrl` above it) in
  `src/markets/markets.resolver.ts`, with no `@Roles` of its own. Anyone holding the API key —
  not necessarily a signed-in admin — can trigger occurrence generation for any market. Looks
  unintentional given its neighbours.
