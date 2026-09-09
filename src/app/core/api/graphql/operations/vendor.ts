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
    isAcceptingOrders
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
 * `FILTERABLE_FIELDS` allows (`name`, `category`, `isActive`,
 * `isAcceptingOrders`, `createdAt`). `totalCount` is the count *behind* those
 * filters, which is what the paginator's length must be.
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
 * One vendor's team (design 1c) — `@Roles(ADMIN)`, and the only path to the
 * roster: it is deliberately not a field on `VendorModel`, so the public
 * `vendor(id)` query never hands out every staff member's email. One vendor's
 * seats are `{ field: "vendorId", operator: EQUAL, value: id }`; the backend
 * returns one row per seat, so a stallholder at two markets is two rows that
 * `toVendorStaff` folds into one person. `VendorMemberModel` carries no phone
 * and no invitation state — a seat exists only once the invite is accepted.
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
          name
        }
      }
    }
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
 * `CreateVendorInput` covers those plus `name`, `slug`, `category`,
 * `description`, `imageUrl` and `marketIds` and nothing else, so the
 * invitation's own half (the note, the phone, skipping application review) has
 * nowhere to go and no mutation to send it; see `docs/backend-api-gaps.md` #9.
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
 * link already shared. `isAcceptingOrders` is not on this input at all
 * (`setVendorAcceptingOrders` owns it), which is what stops a profile save from
 * un-pausing a stall as a side effect.
 */
export const UPDATE_VENDOR = gql`
  ${VENDOR_FIELDS}
  mutation UpdateVendor($id: ID!, $input: UpdateVendorInput!) {
    updateVendor(id: $id, input: $input) {
      ...VendorFields
    }
  }
`;
