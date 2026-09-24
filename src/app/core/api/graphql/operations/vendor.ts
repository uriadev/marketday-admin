import { gql } from '../gql-tag';

/**
 * Every field `vendor-mapper.ts` reads, in one place so the operations below
 * can't drift. `VendorModel` is still a thin record: no per-market
 * fee/standing, no application or document model (`docs/backend-api-gaps.md`
 * #5, #9), so the directory row and the detail shell are built from identity,
 * status, the `markets` relation and `memberCount`. The roster itself is not on
 * this type — it lives on the admin-only `adminVendorMembers` query
 * ({@link ADMIN_VENDOR_MEMBERS}), which `detail()` folds in for the Staff tab;
 * the directory does not fan out to it, so `staff` names stay empty on the list
 * read. `slug` is server-issued (gap #10 closed). `updatedAt` is the only thing
 * behind the Profile tab's "Last edited" line — `VendorModel` records *when* a
 * record changed but not *who* changed it, so that half stays blank.
 *
 * There is no vendor-wide "accepting orders" flag any more: whether a stall
 * takes orders is a fact about one vendor at one market
 * (`../backend/specs/per-market-order-windows.md`), and `VendorModel.orderWindow`
 * is null on every read here because none of them is scoped to a market. The
 * detail read asks {@link VENDOR_ORDER_WINDOW} once per membership instead.
 */
const VENDOR_FIELDS = gql`
  fragment VendorFields on VendorModel {
    id
    slug
    name
    category
    description
    imageUrl
    isActive
    memberCount
    createdAt
    updatedAt
    markets {
      id
      slug
      name
      city
      schedule
    }
  }
`;

/**
 * The admin directory list (design 1a) — `@Roles(ADMIN)`, every vendor on the
 * platform, one page at a time.
 *
 * `CriteriaInput` carries the whole request: `limit`/`offset` for the page,
 * `orderBy` so the pages are a stable cut of a sorted list rather than
 * whatever order Postgres felt like, and the filters `VendorsService`'s
 * `FILTERABLE_FIELDS` allows (`name`, `category`, `isActive`, `createdAt`).
 * `totalCount` is the count *behind* those filters, which is what the
 * paginator's length must be.
 *
 * The `directory` alias is the same query asked a second question in the same
 * round trip: how many vendors there are before any filter — the header's
 * count and, with `markets` from `MARKET_IDS`, all the console needs to keep
 * describing the whole directory while showing one page of it. `limit: 1`
 * because only the count is selected.
 */
export const ADMIN_VENDORS = gql`
  ${VENDOR_FIELDS}
  query AdminVendors($criteria: CriteriaInput) {
    adminVendors(criteria: $criteria) {
      totalCount
      items {
        ...VendorFields
      }
    }
    directory: adminVendors(criteria: { limit: 1 }) {
      totalCount
    }
  }
`;

/** One vendor for the detail shell and Profile tab. The console routes by
 *  slug; `GraphqlVendorRepository` maps slug → id from `adminVendors` first. */
export const VENDOR_BY_ID = gql`
  ${VENDOR_FIELDS}
  query VendorById($id: ID!) {
    vendor(id: $id) {
      ...VendorFields
    }
  }
`;

/**
 * The detail shell's Products badge: how many products the vendor has, the
 * same `products(vendorId:)` count the Products tab reads. `limit: 1` keeps
 * the row payload to one — `totalCount` counts past it (`getManyAndCount`).
 */
export const VENDOR_PRODUCT_COUNT = gql`
  query VendorProductCount($vendorId: ID!) {
    products(vendorId: $vendorId, criteria: { limit: 1 }) {
      totalCount
    }
  }
`;

/**
 * When one stall takes orders at one market — the Markets tab's per-membership
 * status (design 1b). `@Public()`, and the same `getOrderGate` checkout calls,
 * so what the console shows is what a shopper's cart is refused with.
 *
 * One pair per call: `vendor(id)` leaves `orderWindow` null (a market-blind
 * parent has no truthful answer), so `detail()` asks this once per market the
 * vendor trades at. A vendor trades at a handful, never a page's worth.
 *
 * The admin can read the pause but not set it — `setVendorMarketAcceptingOrders`
 * resolves the vendor from the caller's seat, and an admin holds none.
 */
export const VENDOR_ORDER_WINDOW = gql`
  query VendorOrderWindow($vendorId: ID!, $marketId: ID!) {
    vendorOrderWindow(vendorId: $vendorId, marketId: $marketId) {
      marketId
      state
      occursOn
      opensAt
      closesAt
      pausedUntil
      orderLeadHours
    }
  }
`;

/**
 * One vendor's team (design 1c) — `@Roles(ADMIN)`, and the only path to the
 * roster: it is deliberately not a field on `VendorModel`, so the public
 * `vendor(id)` query never hands out every staff member's email. One vendor's
 * seats are `{ field: "vendorId", operator: EQUAL, value: id }`; the backend
 * returns one row per seat, and `toVendorStaff` keys them by person — one seat
 * each, since `vendor_members.userId` is a `@OneToOne`, so a stallholder mans
 * one market at a time and moving them is a re-scope rather than an addition.
 * `VendorMemberModel` carries no phone, and no invitation state — a seat
 * exists only once the invite is accepted, so the pending half of the tab is
 * {@link PENDING_VENDOR_INVITES} instead.
 *
 * `market { slug }` is selected for the writes rather than the reads: the
 * console routes and addresses markets by slug, and the Staff tab's *Change
 * market* has to know which stall a person is already on without matching on
 * the label it prints.
 */
export const ADMIN_VENDOR_MEMBERS = gql`
  query AdminVendorMembers($criteria: CriteriaInput) {
    adminVendorMembers(criteria: $criteria) {
      totalCount
      items {
        id
        userId
        fullName
        email
        role
        market {
          id
          slug
          name
        }
      }
    }
  }
`;

/**
 * The invitations a vendor has out (design 1c's *Invitation pending* rows) —
 * the half of the team that has no seat yet.
 *
 * `vendorId` is the argument that opens this to an admin: like every operation
 * on `VendorMembersResolver`, it used to resolve the vendor from the caller's
 * seat, and an admin holds none. Nullable server-side — a vendor owner omits
 * it and reads their own, an admin names the vendor and `targetVendorForTeam`
 * is the gate. Owner-only for a member either way: the list is a set of
 * addresses that have been offered a seat.
 *
 * `expiresAt` is the backend's own 15-minute code TTL rather than a policy the
 * console restates, and `createdAt` is what the row's "invited 2 days ago"
 * line is built from.
 */
export const PENDING_VENDOR_INVITES = gql`
  query PendingVendorInvites($vendorId: ID!) {
    pendingVendorInvites(vendorId: $vendorId) {
      id
      email
      createdAt
      expiresAt
      market {
        id
        slug
        name
      }
    }
  }
`;

/**
 * Writing a vendor's team (design 1c) — invite, withdraw, move, remove.
 *
 * All four grew the same nullable `vendorId` as `joinMarket` / `leaveMarket`
 * and for the same reason: they resolved the vendor from the caller's seat, so
 * there was no roster an admin could write at all. It is **always sent** from
 * here — the console only ever manages somebody else's team, and an admin who
 * omits it is refused rather than defaulted, which is what stops an invitation
 * going out on behalf of a business nobody named.
 *
 * `inviteVendorMember` mails a 6-digit code and answers `Boolean`; the person
 * has no seat, and so no row on the roster, until they redeem it. Sending to
 * the same address again supersedes the outstanding code rather than minting a
 * second, which is what *Resend* relies on. Throttled server-side per vendor
 * and per mailbox, the admin path included.
 *
 * `updateVendorMember` is a **move**, not an addition: one person holds one
 * seat, and the owner has no market scope to set (`OwnerHasNoMarketScope`).
 * `removeVendorMember` drops the seat and demotes the account to buyer in one
 * transaction, and refuses the owner's seat whoever asks — it is the only
 * route back into the business.
 *
 * Nothing is read back: the tab reloads `detail()`, which is what folds seats,
 * invitations and the vendor's markets into the rows it draws.
 */
export const INVITE_VENDOR_MEMBER = gql`
  mutation InviteVendorMember($input: InviteVendorMemberInput!) {
    inviteVendorMember(input: $input)
  }
`;

export const REVOKE_VENDOR_INVITE = gql`
  mutation RevokeVendorInvite($id: ID!, $vendorId: ID!) {
    revokeVendorInvite(id: $id, vendorId: $vendorId)
  }
`;

export const UPDATE_VENDOR_MEMBER = gql`
  mutation UpdateVendorMember($input: UpdateVendorMemberInput!) {
    updateVendorMember(input: $input) {
      id
      userId
    }
  }
`;

export const REMOVE_VENDOR_MEMBER = gql`
  mutation RemoveVendorMember($userId: ID!, $vendorId: ID!) {
    removeVendorMember(userId: $userId, vendorId: $vendorId)
  }
`;

/**
 * Creating a vendor from the invite screen (design 1n) — `@Roles(ADMIN)`.
 *
 * Selects the same fragment the reads do, so the created row is mapped by
 * `toVendorSummary` and lands in the directory looking exactly like one that
 * came back from `adminVendors`. `ownerEmail`/`ownerName` are **required for an
 * admin caller** — the backend seats that person as the vendor's `OWNER`,
 * reusing their account or creating a passwordless one — and refusing without
 * them is what stops the calling admin being made the owner by default.
 *
 * `isActive` is design 1n's "Skip application review": true opens the vendor
 * live, false creates it held back until an admin switches it on
 * ({@link UPDATE_VENDOR}). It is always sent — omitting it would mean live.
 *
 * `CreateVendorInput` covers those plus `name`, `slug`, `category`,
 * `description`, `imageUrl`, `marketIds` and `orderLeadHours` and nothing else,
 * so the invitation's own half (the note, the phone) has nowhere to go and no
 * mutation to send it; see `docs/backend-api-gaps.md` #9. `orderLeadHours` is
 * left to its default (48).
 */
export const CREATE_VENDOR = gql`
  ${VENDOR_FIELDS}
  mutation CreateVendor($input: CreateVendorInput!) {
    createVendor(input: $input) {
      ...VendorFields
    }
  }
`;

/**
 * The market index the vendor screens need, in one cached read: slug → id for
 * the markets an invitee may apply to (`CreateVendorInput` takes `marketIds`
 * and the console picks markets by slug), and the names the directory's
 * "Market: any" menu offers.
 *
 * The menu cannot be built from the vendors any more — a page of them knows
 * only its own markets — so it is built from the markets themselves, which
 * also means it offers a market no vendor has joined yet. Deliberately a
 * three-field projection rather than a reuse of `operations/market.ts`'s fat
 * `MarketFields`, since nothing else on a market is wanted.
 */
export const MARKET_IDS = gql`
  query MarketIds {
    adminMarkets {
      id
      slug
      name
    }
  }
`;

/**
 * Saving the Profile tab (design 2a) — `@Roles(ADMIN, VENDOR)`.
 *
 * An ADMIN caller edits the vendor named in `id`: they hold no seat for the
 * backend to infer one from, so the argument is the target and the role guard
 * is the whole gate — the same shape `updateProduct` has, and the change that
 * closed the write half of `docs/backend-api-gaps.md` #7. A VENDOR caller
 * still reaches only their own business.
 *
 * `UpdateVendorInput` carries `name`, `slug`, `category`, `description`,
 * `imageUrl` and `isActive` and nothing else, so the Profile tab's registered
 * name, VAT, produce tags, contact block and address have no field to travel
 * in — they are disabled on the screen rather than collected and dropped.
 * `slug` is deliberately never sent: the backend never re-derives it from a
 * changed `name`, so a rename keeps the URL the console routes by and every
 * link already shared. The per-market pause is not on this input at all
 * (`setVendorMarketAcceptingOrders` owns it), which is what stops a profile
 * save from un-pausing a stall as a side effect.
 *
 * The directory's row menu sends `{ isActive }` alone through the same
 * mutation. `isActive` is **admin-only** server-side — a vendor owner who sends
 * it is refused — so the Profile tab, which never sends it, stays safe to
 * share with an owner-facing client.
 */
export const UPDATE_VENDOR = gql`
  ${VENDOR_FIELDS}
  mutation UpdateVendor($id: ID!, $input: UpdateVendorInput!) {
    updateVendor(id: $id, input: $input) {
      ...VendorFields
    }
  }
`;

/**
 * Putting an existing vendor on a market's roster, and taking it off again —
 * `@Roles(ADMIN, VENDOR)`.
 *
 * `vendorId` is what makes these usable here at all. Both mutations used to
 * resolve the vendor from the caller's **seat**, and an admin holds none, so
 * there was no way to write a membership for a business that already existed —
 * `createVendor(input: { marketIds })` could only do it at creation time
 * (`docs/backend-api-gaps.md` #9). The argument is nullable server-side: a
 * vendor owner omits it and reaches their own business, an admin names the
 * vendor and `@Roles` is the whole gate — the same shape `updateVendor` has.
 *
 * `joinMarket` is idempotent (the insert ignores a conflict), so re-adding a
 * vendor already on the roster is a no-op that keeps any live pause rather
 * than reopening a sold-out stall. `leaveMarket` is not reversible in kind:
 * it deletes the stall's lead time, its pause and the vendor's product
 * listings **at that market**, which is why both callers confirm first.
 *
 * A two-field projection: the console reloads its own screen afterwards (see
 * `VendorRepository.addToMarket`), so nothing here is read back.
 */
export const JOIN_MARKET = gql`
  mutation JoinMarket($vendorId: ID!, $marketId: ID!) {
    joinMarket(vendorId: $vendorId, marketId: $marketId) {
      id
      slug
    }
  }
`;

export const LEAVE_MARKET = gql`
  mutation LeaveMarket($vendorId: ID!, $marketId: ID!) {
    leaveMarket(vendorId: $vendorId, marketId: $marketId) {
      id
      slug
    }
  }
`;
