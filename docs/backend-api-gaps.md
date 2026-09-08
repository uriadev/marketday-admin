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
   and `staff` names stay empty on the list read. Creating a vendor is a real write too —
   `createVendor` is `@Roles(ADMIN)` and now seats a named owner, see gap 9. What is still
   missing on `VendorModel` keeps the _other_ vendor write paths and the richer detail tabs on
   session-local data — see gaps 6–9 and the `GraphqlVendorRepository` class doc: no
   per-market fee/standing, no application or document model, and no way to email the owner
   you just created. `updateVendor` was owner-only too; gap 7 closed that, so the Profile tab
   now writes through.

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

7. ~~**No admin-scoped _vendor_ mutations.**~~ **Closed.** `updateVendor` now branches on the
   caller's role _before_ the seat lookup: an ADMIN edits the vendor named in `id` and
   `@Roles(ADMIN)` is the whole gate, while a VENDOR caller still reaches only their own
   business (`id` is re-checked against `ctx.vendor.id`) — verbatim the treatment the product
   mutations and `createVendorImageUploadUrl` got. `@Roles` already listed ADMIN before this,
   but every path ran through `requireContext`, so an admin was refused one line later by a
   seat they do not hold: the decorator promised an access the method did not give.
   `GraphqlVendorRepository.saveProfile` calls it, so the Profile tab's write **persists** and
   maps the stored row back through `toVendorProfile` rather than holding an edit in memory
   for the session.

   **`UpdateVendorInput` is still narrow** — `name`, `slug`, `description`, `category`,
   `imageUrl`, `isActive` — so the Profile tab **disables** the registered name, VAT, produce
   tags, contact block and address, which have no column at all. They show what the record
   holds and the adapter drops them rather than posting them where nothing would read them;
   re-enabling one is a one-word change when its column lands. `slug` is deliberately never
   sent either: the backend never re-derives it from a changed `name`, so a rename keeps the
   URL the console routes by and every link already shared. `VendorModel.updatedAt` is now
   selected and drives the tab's "Last edited" line — there is no author column, so the
   "by …" half of it stays blank.

   ~~`createVendorImageUploadUrl` is `assertOwner`-gated the same way…~~ **Closed.** It is now
   `@Roles(ADMIN, VENDOR)` and takes an optional `vendorId`, verbatim the treatment the product
   presign got: an admin names the vendor, a vendor caller's own seat wins and the argument is
   ignored, and an admin naming none is refused rather than defaulted (the key is
   `vendors/{vendorId}/…`, the prefix the account purge deletes by). `VendorProfile.vendorId`
   carries the id from the `vendor(id)` read to the Profile tab, so the photo upload works.

   ~~**…or product mutations.**~~ **Closed.** `createProduct`, `updateProduct`, `toggleProduct`
   and `createProductImageUploadUrl` are now `@Roles(VENDOR, ADMIN)`, and `setProductListing` /
   `removeProductListing` too; for an ADMIN caller the resolver takes the target vendor from a
   `vendorId` argument (`createProduct` / `createProductImageUploadUrl`) or from the product
   being changed, and skips `assertOwner` / `assertMarketInScope` — `@Roles(ADMIN)` is the
   whole gate. `GraphqlProductRepository` runs the Products grid (design 3a) and the product
   form (design 4a) end-to-end on these, product photo included: `MediaRepository.upload` takes
   an optional `vendorId`, `GraphqlProductRepository` primes the fixture with the id it resolved
   for the read, and `ProductForm.vendorId` carries it to the form — without it
   `createProductImageUploadUrl` answers `Specify the vendor this product belongs to.`, since an
   admin holds no seat the resolver could infer one from.

8. **No `deleteProduct` mutation.** `src/products/products.service.ts` stops at
   `removeListing` (`removeProductListing`) — there is no way to delete a product outright.
   `GraphqlProductRepository.remove` stands in by unlisting the product at every market and
   toggling it hidden — as gone as the schema allows, but a full reload still shows it as a
   "Not carried" row. A real `deleteProduct` would let that row disappear.

9. **No vendor application/approval concept, and no way to invite a vendor.**
   `Market.reviewApplications` is a real NOT NULL column but nothing acts on it — no
   `approveVendor`/`declineVendor`, no pending/approved/declined state on `Vendor` (only
   `isActive` and `isAcceptingOrders`). Blocks the "needs a decision" flows on the Markets and
   Vendors screens. A vendor read from `adminVendors` is therefore only ever `trading` or
   `paused` — never `pending`/`fee-unpaid`/`invited`.

   ~~**…and no way to create a vendor, or its owner, as an admin.**~~ **Closed.**
   `createVendor(input: CreateVendorInput!)` is `@Roles(ADMIN)` and
   `GraphqlVendorRepository.invite` calls it, so design 1n records the business for real —
   `name`, `category`, the picked markets (`marketIds`, resolved from slug by a lean
   `adminMarkets { id slug }` query, since the criteria filters are a no-op; see the bugs
   below) **and its owner**. The backend derives the slug and suffixes `-2`/`-3` past a
   collision, so the row comes back through the same `VendorFields` fragment the reads use and
   is in the directory on the next load.

   Closing it needed two **backend** changes, made here:

   - `CreateVendorInput` grew `ownerEmail` / `ownerName`, and `VendorsService.create` now
     takes a `VendorOwner` — `{ userId }` for a self-signup, `{ email, fullName }` for an
     admin acting for someone else. On the admin path it finds that person's account by
     address (case-insensitively, since nothing upstream normalises `users.email`) or creates
     a **passwordless** one, then seats them as `OWNER` in the same transaction as the vendor.
     A passwordless account is an existing, working state — a Google/Apple user has none — and
     `requestPasswordReset` only diverts to "use the button you signed up with" for an account
     with a social id, so the new owner gets in through Forgot password.
   - `VendorsResolver.createVendor` refuses an ADMIN caller that names no owner rather than
     defaulting to one. Before this, `create` seated the _caller_, which for an admin meant
     holding a business they do not run and — because `vendor_members.userId` is UNIQUE —
     getting `BadRequestException('You already belong to a vendor')` on their second create.
     The role is read from the caller, so re-opening the mutation to self-signup is a change
     to the `@Roles` line alone.

   One person holds at most one seat, so naming someone who already owns a vendor is refused,
   naming them: `dervla@… already belongs to a vendor`.

   `CreateVendorInput` also grew `isAcceptingOrders`, which is where design 1n's "skip
   application review" toggle now lands. There is still no application model to hold "approved
   yet?", so the flag the schema _does_ have carries it: review required → the stall is created
   with `isAcceptingOrders: false` and reads `Paused` in the directory until someone turns it
   on. A real approval model would replace this — the toggle is standing in for one, not
   describing one.

   **Still open: the invitation itself.** There is no way to _tell_ the new owner. No endpoint
   emails a would-be owner — `inviteVendorMember` resolves the vendor from the caller
   (`VendorMembersResolver` is deliberately argument-free, so one owner can never address
   another vendor's roster) and only ever mints a `STAFF` seat, so an admin cannot use it. So
   design 1n's phone and personal note are **disabled on the screen** rather than collected and
   dropped, and the admin has to tell the owner themselves; the screen says so rather than
   implying a message went out. What would close it: an admin-scoped
   `inviteVendorOwner(vendorId:, email:)`, or `createVendor` sending a set-your-password mail
   through `MailSender` the way `VendorInvitesService.invite` already does.
   `VendorInviteSummary`'s two policy windows would come from the same place; today they are
   constants in `GraphqlVendorRepository`, and `sentThisMonth` counts only this session's own
   creates.

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
