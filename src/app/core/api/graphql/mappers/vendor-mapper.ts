import {
  BadgeTone,
  VendorBadge,
  VendorDetail,
  VendorMemberRole,
  VendorMembership,
  VendorProfile,
  VendorStaffMember,
  VendorStanding,
  VendorSummary,
} from '../../../models/vendor.model';
import { describeSchedule } from '../../../scheduling/recurrence';
import {
  AdminVendorMembersQuery,
  VendorFieldsFragment,
  VendorMemberRole as GqlVendorMemberRole,
} from '../generated';

/**
 * Ties every read below to the schema via codegen — a field renamed or removed
 * from `VendorModel` in `schema.gql` breaks `pnpm gql:generate`'s output, which
 * breaks this file at compile time. See `operations/vendor.ts`.
 */
export type GqlVendor = VendorFieldsFragment;
export type GqlVendorMarket = VendorFieldsFragment['markets'][number];
export type GqlVendorMember = AdminVendorMembersQuery['adminVendorMembers']['items'][number];

/**
 * `active + accepting orders → trading`, anything else → `paused`. There is no
 * fee ledger or application model server-side (`docs/backend-api-gaps.md` #5,
 * #9), so `'fee-unpaid'` and `'pending'` never come back from the real API —
 * the same honest narrowing `market-mapper.ts`'s `toMarketRoster` makes.
 */
function standingOf(vendor: GqlVendor): VendorStanding {
  return vendor.isActive && vendor.isAcceptingOrders ? 'trading' : 'paused';
}

const STANDING_LABELS: Record<VendorStanding, string | null> = {
  trading: 'Trading',
  'fee-unpaid': 'Fee unpaid',
  paused: 'Paused',
  pending: null,
  invited: 'Invitation pending',
};

/** "14 March 2021" — the day the vendor record was created, for the meta line. */
function joinedLabel(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 'MarketDay';
  return date.toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** "Vegetables & eggs · since 2021" — category plus the year they joined. */
function metaLine(vendor: GqlVendor): string {
  const year = new Date(vendor.createdAt).getFullYear();
  return Number.isNaN(year) ? vendor.category : `${vendor.category} · since ${year}`;
}

/* ────────────────────────────────────────────────────────────────────────────
   Reads
──────────────────────────────────────────────────────────────────────────── */

export function toVendorSummary(vendor: GqlVendor): VendorSummary {
  const standing = standingOf(vendor);
  return {
    id: vendor.id,
    slug: vendor.slug,
    name: vendor.name,
    meta: metaLine(vendor),
    markets: vendor.markets.map((market) => market.name),
    // No application model server-side — docs/backend-api-gaps.md #9.
    appliedLabel: null,
    // The list carries the team's size, not its roster — the names live behind
    // the admin-only `adminVendorMembers(vendorId:)` query (gap #7), which the
    // directory does not fan out to. `staffCount` still drives the "N staff"
    // label and the face-pile discs.
    staff: [],
    staffCount: vendor.memberCount,
    standing,
    standingLabel: STANDING_LABELS[standing],
  };
}

function toMembership(market: GqlVendorMarket, paused: boolean): VendorMembership {
  const badgeTone: BadgeTone = paused ? 'muted' : 'positive';
  return {
    id: `mem-${market.id}`,
    market: market.name,
    marketSlug: market.slug,
    badges: [{ label: paused ? 'Paused' : 'Trading', tone: badgeTone }],
    detail: [describeSchedule(market.schedule), market.city].filter(Boolean).join(' · '),
    // No per-market fee or staff-scope signal server-side (gaps #5, #7).
    facts: [],
    paused,
  };
}

/**
 * Folds `adminVendorMembers` rows into design 1c's people. The backend pins a
 * `STAFF` seat to one market (`VendorMember.marketId`), so a stallholder who
 * works two markets is two rows here and one person with two `markets` entries;
 * an `OWNER` spans every market and carries none. `VendorMemberModel` has no
 * phone and no invitation state — a seat only exists once the invite is
 * accepted — so `phone` reads "No phone yet" and `pending` is always `false`,
 * the same honest narrowing the rest of this file makes.
 */
export function toVendorStaff(rows: readonly GqlVendorMember[]): VendorStaffMember[] {
  const byUser = new Map<string, { first: GqlVendorMember; markets: string[] }>();
  for (const row of rows) {
    // Only a staff seat names a market; an owner's is always null.
    const market = row.role === GqlVendorMemberRole.Staff ? row.market?.name : undefined;
    const entry = byUser.get(row.userId);
    if (entry) {
      if (market && !entry.markets.includes(market)) entry.markets.push(market);
    } else {
      byUser.set(row.userId, { first: row, markets: market ? [market] : [] });
    }
  }

  return [...byUser.values()].map(({ first, markets }) => {
    const owner = first.role === GqlVendorMemberRole.Owner;
    return {
      id: first.userId,
      name: first.fullName,
      role: owner ? 'Owner · account holder' : 'Stallholder',
      memberRole: owner ? VendorMemberRole.Owner : VendorMemberRole.Staff,
      email: first.email,
      phone: 'No phone yet',
      allMarkets: owner,
      markets: owner ? [] : markets,
      managesStaff: owner,
      pending: false,
    };
  });
}

/**
 * Thin but honest, the way `toMarketDetail` is: identity, status, the real
 * `markets` relation and the folded `adminVendorMembers` roster are filled;
 * documents, next trading days, the pending application and most of `stats`
 * have no backend source yet (`docs/backend-api-gaps.md` #5–#9) and stay empty
 * rather than invented. The detail tabs already degrade gracefully on empty
 * arrays. `members` defaults to empty so a caller that only needs identity —
 * `profile()` reads through `vendor(id)` alone — can skip the roster round trip.
 */
export function toVendorDetail(
  vendor: GqlVendor,
  members: readonly GqlVendorMember[] = [],
): VendorDetail {
  const standing = standingOf(vendor);
  const paused = standing === 'paused';
  const memberships = vendor.markets.map((market) => toMembership(market, paused));
  const staff = toVendorStaff(members);
  // Folded people (accounts), not seats: a stallholder at two markets is one
  // account. Falls back to the batch-hydrated seat count when the roster read
  // came back empty.
  const staffCount = staff.length || vendor.memberCount;

  const badges: VendorBadge[] = [];
  if (memberships.length > 0) {
    badges.push({
      label: `Trading at ${memberships.length} ${memberships.length === 1 ? 'market' : 'markets'}`,
      tone: paused ? 'muted' : 'positive',
    });
  }

  return {
    id: vendor.id,
    slug: vendor.slug,
    name: vendor.name,
    meta: `${vendor.category} · on MarketDay since ${joinedLabel(vendor.createdAt)}`,
    badges,
    marketCount: memberships.length,
    staffCount,
    membershipCount: memberships.length,
    productCount: 0,
    pendingApplication: null,
    memberships,
    staff,
    staffNotes: [],
    stats: [
      { label: 'Markets', value: String(memberships.length) },
      { label: 'Staff', value: String(staffCount) },
      { label: 'Status', value: paused ? 'Paused' : 'Trading' },
    ],
    nextDays: [],
    documents: [],
    suspendNote:
      memberships.length > 0
        ? `Removes them from ${
            memberships.length === 1 ? 'their market' : `all ${memberships.length} markets`
          } and signs out every staff account.`
        : 'Signs out every staff account for this vendor.',
  };
}

/**
 * The Profile tab's own value (design 2a). `UpdateVendorInput` carries only
 * `name`, `slug`, `category`, `description` and `imageUrl`; registered name,
 * VAT, contact, website, address and tags have no column
 * (`core/models/vendor.model.ts`'s own note), so they load blank rather than
 * faked — mirrors `toSettingsPatch` for a market.
 */
export function toVendorProfile(vendor: GqlVendor): VendorProfile {
  return {
    reference: vendor.id,
    tradingName: vendor.name,
    registeredName: '',
    category: vendor.category,
    vatNumber: '',
    description: vendor.description ?? '',
    produceTags: [],
    contactName: '',
    phone: '',
    email: '',
    website: '',
    address: '',
    photos: vendor.imageUrl ? [vendor.imageUrl] : [],
    created: `Created ${joinedLabel(vendor.createdAt)}`,
    lastEdited: 'Not edited since it was created',
    lastEditedBy: '',
  };
}
