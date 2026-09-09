import { Page, PageRequest } from './page.model';

/**
 * What a member of a vendor's team may do. Mirrors the backend's
 * `VendorMemberRole` (`../backend/src/common/enums/vendor-member-role.enum.ts`):
 * an OWNER runs the business across every market, a STAFF member is pinned to
 * one market by `VendorMember.marketId`.
 */
export enum VendorMemberRole {
  Owner = 'OWNER',
  Staff = 'STAFF',
}

/**
 * How a vendor reads at a glance in the directory (design 1a).
 *
 * `pending` and `invited` are not the same thing: a pending vendor applied and
 * is waiting on a decision, an invited one was asked in by an admin and has not
 * signed up yet. Only the first is something to review.
 */
export type VendorStanding = 'trading' | 'fee-unpaid' | 'paused' | 'pending' | 'invited';

/** A badge beside a name — reused for the directory, the header and memberships. */
export type BadgeTone = 'positive' | 'warn' | 'muted';

export interface VendorBadge {
  label: string;
  tone: BadgeTone;
}

/** One row of the platform directory (design 1a). */
export interface VendorSummary {
  id: string;
  /** URL segment — `/vendors/mcnally-family-farm`. */
  slug: string;
  name: string;
  /** "Vegetables & eggs · since 2021". */
  meta: string;
  /** Markets the vendor trades at, by short name. */
  markets: readonly string[];
  /** Pending-application chip — "+1 applied", "Temple Bar · applied". */
  appliedLabel: string | null;
  /**
   * Staff names, for the face pile. Empty on the real-API directory path — the
   * list query (`adminVendors`) carries the team's size, not its roster — where
   * {@link staffCount} still drives the "N staff" label and the face-pile discs.
   */
  staff: readonly string[];
  /** How many people hold a seat — the authoritative team size, whether or not
   *  {@link staff} names are loaded (`VendorModel.memberCount`). */
  staffCount: number;
  standing: VendorStanding;
  /** "Trading", "Fee unpaid ×1", "Paused". `null` while pending — the row
   *  offers a Review button in place of a badge. */
  standingLabel: string | null;
}

/** Directory filters. Each one is a query param (§7). */
export interface VendorFilters {
  q: string;
  /** Short market name, or `null` for any. */
  market: string | null;
  /** Only vendors with an application waiting on a decision. */
  applications: boolean;
  /** Only vendors trading at two or more markets. */
  multiMarket: boolean;
  feeUnpaid: boolean;
  paused: boolean;
}

export const EMPTY_VENDOR_FILTERS: VendorFilters = {
  q: '',
  market: null,
  applications: false,
  multiMarket: false,
  feeUnpaid: false,
  paused: false,
};

/**
 * What the directory asks its repository for: one page of rows, narrowed.
 *
 * Filters and paging travel together because they cannot be applied apart —
 * narrowing after the server sliced would filter one page rather than the
 * directory, which is exactly the bug this shape exists to prevent.
 */
export interface VendorListQuery {
  filters: VendorFilters;
  page: PageRequest;
}

/**
 * Directory-wide facts a single page cannot carry. The header line and the
 * "Market: any" menu describe the whole directory rather than the rows on
 * screen, so the repository — the only party that can still see all of it —
 * hands them back alongside the page.
 */
export interface VendorDirectoryFacets {
  /** Every market the directory can be narrowed to, for the market menu. */
  markets: readonly string[];
  /** Applications waiting on a decision, across the whole directory. */
  applicationCount: number;
  /** Vendors on the platform before any filter — the header's count. */
  vendorCount: number;
}

export interface VendorDirectoryPage extends Page<VendorSummary> {
  facets: VendorDirectoryFacets;
}

/**
 * Whether one row survives the directory filters, written once so every
 * repository narrows the same way — the fixtures over their whole collection,
 * and `GraphqlVendorRepository` over the rows it had to read because
 * `adminVendors` cannot express the filter (see its `list`).
 *
 * The four toggles narrow together (a vendor must satisfy every one that is
 * on), which is what makes "Applications" plus "At 2+ markets" mean "existing
 * multi-market vendors who want another".
 */
export function matchesVendorFilters(vendor: VendorSummary, filters: VendorFilters): boolean {
  const { q, market, applications, multiMarket, feeUnpaid, paused } = filters;
  if (market !== null && !vendor.markets.includes(market)) return false;
  if (applications && vendor.appliedLabel === null) return false;
  if (multiMarket && vendor.markets.length < 2) return false;
  if (feeUnpaid && vendor.standing !== 'fee-unpaid') return false;
  if (paused && vendor.standing !== 'paused') return false;

  const needle = q.trim().toLowerCase();
  if (needle === '') return true;
  return (
    vendor.name.toLowerCase().includes(needle) ||
    vendor.meta.toLowerCase().includes(needle) ||
    vendor.markets.some((label) => label.toLowerCase().includes(needle)) ||
    // The design's placeholder promises staff search, so honour it.
    vendor.staff.some((name) => name.toLowerCase().includes(needle))
  );
}

/** Whether any filter is on — the "Clear filters" button, and the empty state. */
export function hasVendorFilters(filters: VendorFilters): boolean {
  const { q, market, applications, multiMarket, feeUnpaid, paused } = filters;
  return q.trim() !== '' || market !== null || applications || multiMarket || feeUnpaid || paused;
}

/** The toggle chips above the directory table, in the design's order. */
export type VendorToggle = 'applications' | 'multiMarket' | 'feeUnpaid' | 'paused';

export const VENDOR_TOGGLES: readonly { value: VendorToggle; label: string }[] = [
  { value: 'applications', label: 'Applications' },
  { value: 'multiMarket', label: 'At 2+ markets' },
  { value: 'feeUnpaid', label: 'Fee unpaid' },
  { value: 'paused', label: 'Paused' },
];

/** A fact chip under a membership — "Fee paid · €35 · 12 Aug". */
export interface MembershipFact {
  label: string;
  /** Amber rather than neutral: money owed, something to act on. */
  emphasis: boolean;
}

/** One market a vendor belongs to, with its own status (design 1b). */
export interface VendorMembership {
  id: string;
  market: string;
  /** Links the card through to the market's own screens. */
  marketSlug: string;
  badges: readonly VendorBadge[];
  /** "Saturdays 09:00–14:30 · Stall A7 · member since March 2021". */
  detail: string;
  facts: readonly MembershipFact[];
  /** A paused membership is drawn back, like the design's grey tile. */
  paused: boolean;
}

/** An application waiting on a decision, shown as a banner above the list. */
export interface VendorApplication {
  id: string;
  title: string;
  body: string;
}

export interface VendorStat {
  label: string;
  value: string;
}

/** "Sat 22 Aug · Temple Bar A7" plus the line under it. */
export interface VendorTradingDay {
  id: string;
  when: string;
  note: string;
}

/**
 * One person on a vendor's team (design 1c). They sign in to the vendor app
 * with their own account and see only the markets they are scoped to.
 *
 * Note for the GraphQL swap: the backend pins a `STAFF` member to a single
 * market via `VendorMember.marketId`, so a person who works two markets is two
 * rows there and one row with two entries in `markets` here. The adapter folds
 * them; nothing above `core/` should see the difference.
 */
export interface VendorStaffMember {
  id: string;
  name: string;
  /** "Owner · account holder", "Stallholder · invited 2 days ago". */
  role: string;
  memberRole: VendorMemberRole;
  email: string;
  /** "No phone yet" until they add one. */
  phone: string;
  /** Scoped to the whole vendor rather than a list of markets. */
  allMarkets: boolean;
  /** Market short labels this person can work at. Empty when `allMarkets`. */
  markets: readonly string[];
  /** Can add, remove and re-scope other staff from the vendor app. */
  managesStaff: boolean;
  /** Invited, but the invitation has not been accepted yet. */
  pending: boolean;
}

/** A note under the staff table — guidance that depends on this vendor. */
export interface VendorStaffNote {
  id: string;
  title: string;
  body: string;
}

export type DocumentState = 'valid' | 'expiring';

export interface VendorDocument {
  id: string;
  label: string;
  state: DocumentState;
}

/** Everything the vendor detail screens render (design 1b). */
export interface VendorDetail {
  id: string;
  slug: string;
  name: string;
  /** "Vegetables & eggs · Ballyboughal, Co. Dublin · Tom McNally · …". */
  meta: string;
  badges: readonly VendorBadge[];
  marketCount: number;
  staffCount: number;
  /** Counts the Markets tab shows — memberships plus any application. */
  membershipCount: number;
  /** Products on the vendor's list, across every market (design 3a). */
  productCount: number;
  pendingApplication: VendorApplication | null;
  memberships: readonly VendorMembership[];
  staff: readonly VendorStaffMember[];
  staffNotes: readonly VendorStaffNote[];
  stats: readonly VendorStat[];
  nextDays: readonly VendorTradingDay[];
  documents: readonly VendorDocument[];
  /** "Removes them from all 3 markets and signs out all 5 staff accounts." */
  suspendNote: string;
}

/* ────────────────────────────────────────────────────────────────────────────
   Profile (design 2a) — the record every market they join reads from.
──────────────────────────────────────────────────────────────────────────── */

/** How long a stall description may run, in characters. */
export const VENDOR_DESCRIPTION_LIMIT = 400;

/**
 * The editable half of a vendor record (design 2a). One vendor, one profile:
 * the description, tags and photo belong to the business rather than to any
 * one market, so saving publishes to every market page at once.
 *
 * What the API stores: `UpdateVendorInput` carries only `name`, `slug`,
 * `category`, `description` and `imageUrl`. The rest — registered name, VAT,
 * contact, website, address and tags — have **no column server-side** yet, the
 * way `county` and `eircode` don't on a market. They are console fields until
 * the API grows them, and the adapter simply does not send them.
 */
export interface VendorProfile {
  /** "v_1042" — the reference support quotes, not the routing slug. */
  reference: string;
  /**
   * The vendor's backend id, for the photo presign — `createVendorImageUploadUrl`
   * signs a `vendors/<vendorId>/…` key and an admin holds no seat it could be
   * inferred from. Separate from {@link reference}, which is a label the console
   * prints. `null` on the fixture path, where nothing is presigned.
   */
  vendorId: string | null;
  tradingName: string;
  /** The name on the company filings, when it differs from the stall's. */
  registeredName: string;
  /** What they trade as. One of {@link VENDOR_TRADES}, or a legacy value. */
  category: string;
  vatNumber: string;
  /** Shown to shoppers on every market page this vendor trades at. */
  description: string;
  produceTags: readonly string[];
  contactName: string;
  phone: string;
  email: string;
  /** Bare host — "mcnallyfarm.ie". Empty when they have no site. */
  website: string;
  /** Where the produce comes from. Held for the organiser, never published. */
  address: string;
  /**
   * The one photo shoppers see beside this vendor, or `null` for a tinted
   * placeholder. Singular because `Vendor.imageUrl` is: the design's gallery of
   * stall pictures has no column behind it, so offering more slots than the
   * backend keeps would drop every photo past the first on save.
   */
  imageUrl: string | null;
  /** "Created 14 March 2021 by Gráinne Doyle". */
  created: string;
  /** "Last edited 6 days ago". */
  lastEdited: string;
  /** "by Tom McNally, in the vendor app". Empty on the real-API path, which
   *  records *when* a vendor changed but never *who* changed it. */
  lastEditedBy: string;
}

/**
 * What the Profile tab sends back — everything on it an admin can change.
 * `vendorId` is omitted with the rest of the identity: it is what the screen
 * uploads *against*, never something the form edits.
 */
export type VendorProfilePatch = Omit<
  VendorProfile,
  'reference' | 'vendorId' | 'created' | 'lastEdited' | 'lastEditedBy'
>;

/* ────────────────────────────────────────────────────────────────────────────
   Invite vendor (design 1n).
──────────────────────────────────────────────────────────────────────────── */

/** What a vendor sells, for the "Trades as" select. */
export const VENDOR_TRADES: readonly string[] = [
  'Bakery',
  'Cheese & dairy',
  'Coffee & drinks',
  'Fish & shellfish',
  'Fruit & vegetables',
  'Honey & preserves',
  'Meat & charcuterie',
  'Pantry & dry goods',
  'Prepared food',
  'Craft & other',
];

/** The form design 1n fills in. */
export interface VendorInvite {
  businessName: string;
  /**
   * The person who will own the business. Not a preference — `createVendor`
   * seats them as the vendor's `OWNER`, finding their MarketDay account by
   * {@link VendorInvite.email} or creating one, so there is no role to choose:
   * whoever is named here holds the business.
   */
  contactName: string;
  email: string;
  /** Optional; empty string when not given. */
  phone: string;
  trade: string;
  /** Slugs of the markets they may apply to. Empty means every market. */
  marketSlugs: readonly string[];
  /** On, they can book a stall the moment they sign up. */
  skipApplicationReview: boolean;
  /** Shown above the sign-up button in the invitation email. */
  note: string;
}

/**
 * Invitation policy and the running count, in one call. These are the
 * backend's rules rather than the console's — how long a link lives, when the
 * reminder goes — so the screen reads them rather than restating them.
 */
export interface VendorInviteSummary {
  sentThisMonth: number;
  linkValidDays: number;
  reminderAfterDays: number;
}
