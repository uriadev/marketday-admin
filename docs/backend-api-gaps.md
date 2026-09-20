# Backend API gaps

What `../backend` (`marketday-api`) still owes the admin console, found while wiring
`core/api/graphql/` against `schema.gql`. Each gap names the port it blocks and the console
screen it's holding back; `core/api/api.providers.ts` keeps that port bound to its
`InMemory*Repository` fixture until the gap closes. Two backend bugs are filed at the end,
found while reading the same code, unrelated to what's missing.

## Missing queries and mutations

1. ~~**No `adminUsers` (or equivalent) query.**~~ **Closed.** `me` used to be the only user query,
   and `User` had no notion of suspension or of when someone was last active. Closing it took
   **backend** changes, made here:

   - `adminUsers(search: String, status: AdminUserStatus, criteria: CriteriaInput): AdminUsersPage!`
     (`@Roles(ADMIN)`, `UsersResolver`) lists every account, one page at a time, as the admin-only
     `AdminUserModel` rather than more fields on `UserModel` (which is what `me` and
     `AuthResponse.user` hand the account holder). `search` matches name **or** email and `status`
     is derived — both are arguments of their own because a `CriteriaInput` filter can neither OR
     two columns nor test `IS NULL`. `criteria` carries the page, `role` and the `createdAt`
     window; `FILTERABLE_FIELDS` is `role`, `email`, `fullName`, `createdAt`, `lastSeenAt` and
     nothing credential-shaped. The default order is most recently active first, never-seen last,
     `id` as the tiebreak.
   - `AdminUserStatus` is `SUSPENDED` (an admin set `suspendedAt`), `INVITED` (no password, no
     Google id, no Apple id — the passwordless owner `createVendor` seats, who gets in through
     Forgot password), else `ACTIVE`.
   - `users.lastSeenAt` (migration `AddUserSuspension`) is stamped by `AuthService.issueTokens` —
     every sign-in and every refresh — so "Last active" is accurate to one access-token lifetime
     for anyone using the app. No backfill: an account reads "Never" until its next refresh.
   - `suspendUser(input: { userId, reason })` / `restoreUser(userId)` (`@Roles(ADMIN)`) set and
     clear `suspendedAt` / `suspensionReason` / `suspendedById`. A suspension clears the refresh
     and push tokens; `issueTokens` then refuses new tokens with a 403 "This account has been
     suspended." (only after the credential checks out), and `JwtStrategy` rejects the live access
     tokens on their next request. An admin cannot suspend themselves, and a second admin
     suspending the same account is told rather than overwriting the first one's reason.

   `GraphqlAccountRepository` pushes every filter down and reads the header's and menus' counts as
   aliases in the same document, so the screen pages server-side like the vendor directory.
   "Send password reset" is wired too, to the public `requestPasswordReset` the Forgot password
   screen already uses — for an `INVITED` owner it is how they get in.

   **Still open on this screen:**

   - **Organiser and support agent have no column.** Nothing server-side records which admins run
     a market or answer support, so every `ADMIN` reads as a platform admin and those two Role
     menu entries match nothing (the call still goes out, because the counts must).
   - **"Invite team member"** has no endpoint: nothing lets an admin create another admin's
     account, or invite one.
   - **"Change role" is unwired on purpose.** `setRole(userId, role)` exists and is
     `@Roles(ADMIN)`, but it has sharp edges that want their own design first: demoting a seated
     `VENDOR` to `BUYER` locks them out of their vendor dashboard (the vendor resolvers gate on the
     role, not the seat), and promoting to `ADMIN` is a privilege grant with no audit trail.
   - **Export CSV** has no endpoint, and there is no audit log to write suspensions to beyond the
     reason and author the row itself keeps (#6).

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
   `isActive`). Blocks the "needs a decision" flows on the Markets and Vendors screens. A vendor
   read from `adminVendors` is therefore only ever `trading` or `paused` (deactivated) — never
   `pending`/`fee-unpaid`/`invited`.

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

   **Closed: skipping application review.** Design 1n's toggle used to land on
   `CreateVendorInput.isAcceptingOrders` — review required → created paused. The backend
   replaced that vendor-wide flag with per-(vendor, market) order windows
   (`../backend/specs/per-market-order-windows.md`): `orderLeadHours` per stall and a manual
   pause that **clears itself** at the end of the market day it was tapped on, so nothing was
   left that could hold "not approved yet". `vendors.isActive` can, and it needed two **backend**
   changes, made here:

   - `CreateVendorInput` grew `isActive` (nullable, default live — so a self-signup and any
     client that never heard of it create vendors exactly as before). The toggle sends it
     straight through: skip review → `true`, keep review → `false`. A vendor created `false` is
     still seated and joined to the markets the admin picked; it is refused at
     checkout (`VENDOR_UNAVAILABLE`) and dropped from search until it is switched on. Its stalls
     stay on their market rosters, which the mobile app already shows as "No longer available" —
     `vendors(marketId:)` does not filter `isActive`, since it relied on account deletion removing
     the stall rows. Hiding an inactive vendor from the roster too is one `andWhere` in
     `pageByMarket`, but the admin console reads the same query for its market roster. That also answers the
     old objection to creating it with no `marketIds` — that `joinMarket` used to be owner-only, so the
     owner would approve themselves by joining: approval is `isActive`, not a join, which is what
     made it safe to open the join to admins too (below).
   - `updateVendor` refuses `isActive` from a vendor member (`VendorAccessDenied`), where it
     used to accept it from an owner. `UpdateVendorInput.isActive` already existed, but with
     `updateVendor` open to `@Roles(VENDOR)` an owner could have reopened a business an admin
     had closed — approving themselves. ADMIN is the only caller that may send it. The mobile app
     never sends `isActive`, so nothing there changes.

   The directory switches it from each row's ⋮ menu (**Activate vendor** / **Deactivate
   vendor**), one `updateVendor(id, { isActive })` and nothing else. What is still not modelled
   is an application itself — a submitted form, a decline, a reason — which is also what
   `Market.reviewApplications` is waiting for; "Applications" in the directory stays empty.

   **Closed: putting an existing vendor on a market.** `createVendor(input: { marketIds })`
   could only write a membership at creation time, so a business already on MarketDay could not
   be added to another market from the console at all: `joinMarket(marketId:)` resolved the
   vendor from the caller's **seat**, which an admin holds none of, and `UpdateVendorInput` has
   no `marketIds`. One **backend** change closed it, made here:

   - `joinMarket` and `leaveMarket` grew a nullable `vendorId: ID` argument and
     `@Roles(ADMIN, VENDOR)` — the treatment `updateVendor` and `createVendorImageUploadUrl`
     already had. A VENDOR caller omits it and reaches their own business, which they must still
     own; an ADMIN names the vendor and the role guard is the whole gate. An id a member points
     at another business is `Forbidden` rather than silently redirected to their own
     (`targetVendorForStall` in `domain/seat.ts`), and an admin who names none is refused rather
     than defaulted. The argument is nullable, so the mobile app calls both exactly as before —
     the one behaviour change is that a BUYER is now refused by the guard rather than by the seat
     lookup a step later, which is `Forbidden` either way.

   The market's Vendors tab drives it with **Add existing vendor** and a row's **Remove from this
   market**; the vendor's Markets tab does the same from the other end (**Add to a market**, and
   a remove on each membership card). Removing is destructive server-side — the stall row carries
   that market's order lead time and any live pause, and `LeaveMarket` drops the vendor's product
   listings at that market in the same transaction — so both screens confirm first and say so.
   Joining is idempotent (`INSERT … ON CONFLICT DO NOTHING`), so re-adding a vendor already on a
   roster keeps any live pause rather than reopening a sold-out stall.

   The console reads the order windows but still cannot write them. `vendorOrderWindow(vendorId:,
marketId:)` (`@Public()`) backs each membership's status on the Markets tab, one call per
   market because `vendor(id)` leaves `orderWindow` null; `vendors(marketId:)` hydrates
   `orderWindow` for the market roster. Both `setVendorMarketAcceptingOrders` and
   `setVendorMarketOrderLeadHours` resolve the vendor from the caller's seat, so an admin can
   neither pause a stall nor change its lead time — the market roster's "Pause at this market"
   stays disabled. An `adminVendorMarkets(vendorId:)` read and ADMIN branches on those two
   mutations (the same treatment join and leave have now had) would close it.

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
    field and `Create`/`UpdateVendorInput` both accept `slug`. `vendors(marketId:)` selects it
    too, so `market-mapper.ts`'s `toMarketRoster` carries the server's own slug rather than
    deriving one — which is what lets a roster row address its vendor for *Remove from this
    market*.

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

## Paging and filtering

13. **The vendor directory can only push half its filters down.** `adminVendors` pages for
    real — `limit`/`offset` and `totalCount` are honoured, and the console asks for the page it
    is showing — but `VendorsService.FILTERABLE_FIELDS` is `name`, `category`, `isActive`,
    `createdAt`, so of design 1a's filters only the search (as `name CONTAINS`) and "Paused" (as
    `isActive = false`, the rows the directory pills Paused) can travel in a `CriteriaInput`.
    A stall paused at one market is not a directory-level fact any more — the pause is per
    market and per market day — so that filter cannot find one; see #9.

    - **Market** and **At 2+ markets** ask about the `vendor_markets` relation.
      `TypeOrmCriteriaConverter` can filter on a joined alias, but `VendorsService.filter`
      passes it no `relations` map, and "belongs to two or more markets" is a `HAVING COUNT`
      no filter list can spell. Allowing `markets.marketId` (with `relations`) would close the
      first; the second needs a field of its own — a `marketCount` select, or a
      `minMarkets` argument.
    - **Applications** and **Fee unpaid** have no model at all (#5, #9), so they match nothing
      whatever the query says.

    Until then `GraphqlVendorRepository.list` reads the directory whole and narrows those four
    in the browser (re-reading at `totalCount` if the first read was truncated), which is
    correct but is the one query on this screen that does not scale. The search is also
    narrower against the API than against the fixtures — names only, where the console's own
    search reads the trade line, the market chips and the staff names — because `name` is the
    only text column allowed and a paged screen cannot search rows it never fetched. A
    `search`-vector-backed filter, or `description`/`category` in `FILTERABLE_FIELDS`, would
    widen it.

14. **The products grid cannot page against the API, and it is not only about `products`.**
    `products(vendorId:, criteria:)` pages perfectly well — `limit`/`offset`, `totalCount`, and
    filters on `name`, `price`, `unit`, `category`, `isAvailable` — so the grid's search, its
    category menu and "Hidden from shoppers" could all be server-side. What keeps the whole
    catalogue client-side is everything _around_ the grid (design 3a):

    - **The two chips that ask about listings.** "Sold out somewhere" and "Not carried
      everywhere" are questions about the `product_market_listings` relation, which is not in
      `ProductsService.FILTERABLE_FIELDS` and has no `relations` map to reach through — the same
      shape as #13's Market filter.
    - **The rails and the header.** "3 sold out today", "Sold out right now" and
      "11 of 12 carried products available" are aggregates over every listing this vendor has.
      Nothing server-side computes them, so a page cannot carry them.
    - **The two bulk commands.** "Mark everything sold out at this market" and "Reset sold-out
      flags" fan out one `setProductListing` per carried product, because there is no mutation
      that takes a market (or a vendor) and does it in one statement. A console that only
      fetched a page could only act on a page.

    So `GraphqlProductRepository` reads the catalogue once (`criteria: { limit: 500 }`, re-read
    at `totalCount` when that was short) and `ProductRepository` pages it in the adapter: the
    port takes a `ProductListQuery` and answers with a `VendorProductBoardPage`, so the day the
    backend grows the three things above, only that adapter changes. What would close it: a
    listing filter (or `soldOut` / `carriedAt` arguments on `products`), a stock-summary query
    per vendor, and `setVendorMarketListings`-style bulk mutations.

## Bugs found while reading (not missing features)

- ~~**Every `CriteriaInput` filter is a silent no-op.**~~ **Fixed.** `FilterInput.value` now
  carries `@Allow()`, so `main.ts`'s `ValidationPipe({ whitelist: true })` no longer strips it
  before the resolver sees it. Server-side filters work, and the vendor directory sends them
  (see #13); every other list screen still narrows client-side because it still fits in one
  read.

- **A missing `criteria` is a silent 20-row cap, and it reads as an empty result.**
  `VendorsService` and `ProductsService` both `take(DEFAULT_LIMIT)` when no `criteria` arrives,
  which is defensible — but nothing in the response says the answer was truncated except a
  `totalCount` a caller has to think to compare. It cost this console three real bugs: the
  vendor directory showed 20 vendors of any number, the Products tab's slug → id map never saw
  the 21st vendor (so that vendor's tab answered "That vendor could not be found"), and a
  catalogue over the read's own limit would have been silently short. All three are fixed
  client-side by asking for a size and re-asking at `totalCount`; a `hasMore` field, or a
  documented maximum, would make the trap visible instead.

- **`generateOccurrences` is `@Public()`.** It sits between two `@Roles(ADMIN)` mutations
  (`updateMarket`, and `createMarket`/`createMarketImageUploadUrl` above it) in
  `src/markets/markets.resolver.ts`, with no `@Roles` of its own. Anyone holding the API key —
  not necessarily a signed-in admin — can trigger occurrence generation for any market. Looks
  unintentional given its neighbours.
