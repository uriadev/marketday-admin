import {
  BadgeTone,
  MembershipFact,
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
  PendingVendorInvitesQuery,
  VendorFieldsFragment,
  VendorMemberRole as GqlVendorMemberRole,
  VendorOrderState,
} from '../generated';
import {
  GqlOrderWindow,
  isPausedAt,
  marketDayLabel,
  marketMomentLabel,
} from './order-window-mapper';

/**
 * Ties every read below to the schema via codegen — a field renamed or removed
 * from `VendorModel` in `schema.gql` breaks `pnpm gql:generate`'s output, which
 * breaks this file at compile time. See `operations/vendor.ts`.
 */
export type GqlVendor = VendorFieldsFragment;
export type GqlVendorMarket = VendorFieldsFragment['markets'][number];
export type GqlVendorMember = AdminVendorMembersQuery['adminVendorMembers']['items'][number];
export type GqlVendorInvite = PendingVendorInvitesQuery['pendingVendorInvites'][number];

/**
 * `active → trading`, deactivated → `paused`. The business-wide half is all a
 * vendor-level row can say: taking orders is decided per market now
 * (`../backend/specs/per-market-order-windows.md`), and a pause lasts one
 * market day, so it belongs on the membership rather than the directory row.
 * There is no fee ledger or application model server-side
 * (`docs/backend-api-gaps.md` #5, #9), so `'fee-unpaid'` and `'pending'` never
 * come back from the real API.
 */
function standingOf(vendor: GqlVendor): VendorStanding {
  return vendor.isActive ? 'trading' : 'paused';
}

const STANDING_LABELS: Record<VendorStanding, string | null> = {
  trading: 'Trading',
  'fee-unpaid': 'Fee unpaid',
  paused: 'Paused',
  pending: null,
  invited: 'Invitation pending',
};

/** "14 March 2021" — one timestamp as a day, for the meta and record lines. */
function dayLabel(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'MarketDay';
  return date.toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * "just now" · "2 days ago" — how long an invitation has been outstanding.
 * Coarse on purpose: the row is asking whether to chase or withdraw it, and
 * the exact minute is never the answer to that.
 */
function agoLabel(timestamp: string): string {
  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) return 'recently';
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/**
 * The Profile tab's "Last edited" line. `updatedAt` is what a save moves, so
 * this is how a persisted edit shows on the next read — the second of slack is
 * for a create that stamps the two columns from two separate `now()` calls, not
 * for a real edit.
 */
function editedLabel(vendor: GqlVendor): string {
  const created = new Date(vendor.createdAt).getTime();
  const updated = new Date(vendor.updatedAt).getTime();
  if (Number.isNaN(created) || Number.isNaN(updated) || updated - created < 1000) {
    return 'Not edited since it was created';
  }
  return `Last edited ${dayLabel(vendor.updatedAt)}`;
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
    isActive: vendor.isActive,
    standing,
    standingLabel: STANDING_LABELS[standing],
  };
}

/** One membership's badge, from why the stall is or is not taking orders. */
function orderBadge(window: GqlOrderWindow): VendorBadge {
  const badge = (label: string, tone: BadgeTone): VendorBadge => ({ label, tone });
  switch (window.state) {
    case VendorOrderState.Open:
      return badge('Taking orders', 'positive');
    case VendorOrderState.NotYetOpen:
      return badge('Trading', 'positive');
    case VendorOrderState.Paused:
      return badge('Paused', 'muted');
    case VendorOrderState.NoMarketDay:
      // The occurrence horizon ran out — the organiser's to fix, not the vendor's.
      return badge('No market day scheduled', 'warn');
    case VendorOrderState.MarketUnavailable:
      return badge('Market not published', 'muted');
    case VendorOrderState.VendorUnavailable:
      return badge('Paused', 'muted');
    case VendorOrderState.NotAtMarket:
      return badge('Not at this market', 'muted');
    case VendorOrderState.Closed:
      return badge('Closed', 'muted');
  }
}

/** "Orders close Sat 22 Aug, 14:30" · "Next day Sat 22 Aug" · "Orders open 48h before market". */
function orderFacts(window: GqlOrderWindow): MembershipFact[] {
  if (window.state === VendorOrderState.NotAtMarket) return [];
  const facts: MembershipFact[] = [];
  const fact = (label: string) => facts.push({ label, emphasis: false });
  if (window.state === VendorOrderState.Open && window.closesAt) {
    fact(`Orders close ${marketMomentLabel(window.closesAt)}`);
  }
  if (window.state === VendorOrderState.NotYetOpen && window.opensAt) {
    fact(`Pre-orders open ${marketMomentLabel(window.opensAt)}`);
  }
  if (window.occursOn) fact(`Next day ${marketDayLabel(window.occursOn)}`);
  fact(`Orders open ${window.orderLeadHours}h before market`);
  return facts;
}

/**
 * One market the vendor trades at (design 1b), with its own order status.
 *
 * `window` is that stall's `vendorOrderWindow`, or `null` when the read did not
 * come back — the card then says only what the vendor row itself can, rather
 * than guessing. A deactivated business is paused everywhere whatever its
 * windows say. A manual pause outranks the badge the window's `state` would
 * give: the backend ranks "not yet open" above it for shoppers, but an admin
 * looking at a stall wants to know it has stopped.
 */
function toMembership(
  market: GqlVendorMarket,
  vendorActive: boolean,
  window: GqlOrderWindow | null,
  now: Date,
): VendorMembership {
  const base = {
    id: `mem-${market.id}`,
    market: market.name,
    marketSlug: market.slug,
    detail: [describeSchedule(market.schedule), market.city].filter(Boolean).join(' · '),
  };
  if (!vendorActive) {
    return { ...base, badges: [{ label: 'Paused', tone: 'muted' }], facts: [], paused: true };
  }
  if (!window) {
    return { ...base, badges: [{ label: 'Trading', tone: 'positive' }], facts: [], paused: false };
  }
  const paused = isPausedAt(window, now);
  const badge: VendorBadge = paused
    ? { label: `Paused until ${marketMomentLabel(window.pausedUntil!)}`, tone: 'muted' }
    : orderBadge(window);
  // No per-market fee or staff-scope signal server-side (gaps #5, #7), so the
  // facts are the order window's alone.
  return { ...base, badges: [badge], facts: orderFacts(window), paused };
}

/**
 * Design 1c's roster: the seats `adminVendorMembers` returns, then the
 * invitations `pendingVendorInvites` has out, as one list of rows.
 *
 * A seat and an invitation are genuinely different things and the row says so.
 * A seat is a person — an account, a name, a market they man — and can be
 * moved or removed. An invitation is an **address that has been offered one**:
 * there is no account behind it yet, so it has no name and no id to re-scope,
 * and the only two things that can happen to it are re-sending and withdrawal.
 * `inviteId` is what tells them apart, and it is what *Cancel invite* sends.
 *
 * One seat per person, not several: `vendor_members.userId` is a `@OneToOne`,
 * so a stallholder mans one market at a time and `markets` holds at most one
 * entry. `markets` keeps the label the table prints and `marketSlugs` the key
 * the writes address, in the same order. An `OWNER` spans every market and
 * carries neither. `VendorMemberModel` has no phone column, so `phone` reads
 * "No phone yet" — the same honest narrowing the rest of this file makes.
 */
export function toVendorStaff(
  rows: readonly GqlVendorMember[],
  invites: readonly GqlVendorInvite[] = [],
): VendorStaffMember[] {
  const seated = rows.map((row): VendorStaffMember => {
    const owner = row.role === GqlVendorMemberRole.Owner;
    // Only a staff seat names a market; an owner's is always null.
    const market = owner ? null : row.market;
    return {
      id: row.userId,
      name: row.fullName,
      role: owner ? 'Owner · account holder' : 'Stallholder',
      memberRole: owner ? VendorMemberRole.Owner : VendorMemberRole.Staff,
      email: row.email,
      phone: 'No phone yet',
      allMarkets: owner,
      markets: market ? [market.name] : [],
      marketSlugs: market ? [market.slug] : [],
      managesStaff: owner,
      pending: false,
      inviteId: null,
    };
  });

  const pending = invites.map((invite): VendorStaffMember => ({
    // The address is the identity: there is no account yet, so the invite's
    // own id is all the row can be keyed and acted on by.
    id: `invite-${invite.id}`,
    name: invite.email,
    role: `Stallholder · invited ${agoLabel(invite.createdAt)}`,
    memberRole: VendorMemberRole.Staff,
    email: invite.email,
    phone: 'No phone yet',
    allMarkets: false,
    markets: invite.market ? [invite.market.name] : [],
    marketSlugs: invite.market ? [invite.market.slug] : [],
    managesStaff: false,
    pending: true,
    inviteId: invite.id,
  }));

  // Seats first: the people who actually work there are the list, and the
  // offers out are the tail of it.
  return [...seated, ...pending];
}

/**
 * Thin but honest, the way `toMarketDetail` is: identity, status, the real
 * `markets` relation and the folded `adminVendorMembers` roster are filled;
 * documents, next trading days, the pending application and most of `stats`
 * have no backend source yet (`docs/backend-api-gaps.md` #5–#9) and stay empty
 * rather than invented. The detail tabs already degrade gracefully on empty
 * arrays. `members` defaults to empty so a caller that only needs identity —
 * `profile()` reads through `vendor(id)` alone — can skip the roster round trip.
 * `windows` is each membership's `vendorOrderWindow`, keyed by market id; a
 * market missing from it gets a card with no order status.
 */
export function toVendorDetail(
  vendor: GqlVendor,
  members: readonly GqlVendorMember[] = [],
  windows: ReadonlyMap<string, GqlOrderWindow> = new Map(),
  now: Date = new Date(),
  invites: readonly GqlVendorInvite[] = [],
): VendorDetail {
  const standing = standingOf(vendor);
  const paused = standing === 'paused';
  const memberships = vendor.markets.map((market) =>
    toMembership(market, vendor.isActive, windows.get(market.id) ?? null, now),
  );
  const staff = toVendorStaff(members, invites);
  // Seated people only — an outstanding invitation is an offer, not a member
  // of the team, and counting it would have the header promise staff the
  // vendor does not have. Falls back to the batch-hydrated seat count when the
  // roster read came back empty.
  const staffCount = members.length || vendor.memberCount;

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
    meta: `${vendor.category} · on MarketDay since ${dayLabel(vendor.createdAt)}`,
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
 * The Profile tab's own value (design 2a), and what `saveProfile` maps the
 * `updateVendor` response back through — so the screen renders the row the
 * backend actually stored rather than the form's own copy of it.
 *
 * `UpdateVendorInput` carries only `name`, `slug`, `category`, `description`
 * and `imageUrl`; registered name, VAT, contact, website, address and tags have
 * no column (`core/models/vendor.model.ts`'s own note), so they load blank
 * rather than faked — mirrors `toSettingsPatch` for a market.
 */
export function toVendorProfile(vendor: GqlVendor): VendorProfile {
  return {
    reference: vendor.id,
    vendorId: vendor.id,
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
    imageUrl: vendor.imageUrl ?? null,
    created: `Created ${dayLabel(vendor.createdAt)}`,
    lastEdited: editedLabel(vendor),
    // `VendorModel` stamps *when* a record changed, never *who* changed it — an
    // admin, the owner and a staff member all leave the same mark — so the
    // second half of the line stays empty rather than naming a guess.
    lastEditedBy: '',
  };
}
