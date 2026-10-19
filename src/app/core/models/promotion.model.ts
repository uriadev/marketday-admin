import { Page, PageRequest } from './page.model';

/**
 * Promotions in the What's On context (`../backend/specs/market-events-proposal.md`
 * Part 2). A promotion is *distribution*: it puts a subject — an event, a
 * market, a vendor, a product or an outside link — into one app slot for a
 * fixed period, labelled as sponsored. Booked and invoiced off the platform;
 * only an admin ever schedules one.
 */

/** What a tap opens. Create-only — another subject is another booking. */
export type PromotionTargetKind = 'event' | 'market' | 'vendor' | 'product' | 'link';

export const PROMOTION_TARGET_KIND_LABELS: Record<PromotionTargetKind, string> = {
  event: 'Event',
  market: 'Market',
  vendor: 'Vendor',
  product: 'Product',
  link: 'Outside link',
};

export const PROMOTION_TARGET_KINDS: readonly PromotionTargetKind[] = [
  'event',
  'market',
  'vendor',
  'product',
  'link',
];

export type PromotionPlacement = 'home-feed' | 'market-page' | 'events-feed' | 'search';

export const PROMOTION_PLACEMENT_LABELS: Record<PromotionPlacement, string> = {
  'home-feed': 'Home feed',
  'market-page': 'Market page',
  'events-feed': 'Events feed',
  search: 'Search',
};

/**
 * Each slot's inventory, as the backend's `PlacementRule` record holds it.
 * `available: false` is `SEARCH`, which is phase 2 — a promotion can be booked
 * there, but nothing serves it yet.
 */
export const PLACEMENT_RULES: Record<
  PromotionPlacement,
  { cap: number; where: string; available: boolean }
> = {
  'home-feed': {
    cap: 2,
    where: 'Interleaved in the home feed, never as the first card.',
    available: true,
  },
  'market-page': { cap: 1, where: 'One banner below the market header.', available: true },
  'events-feed': { cap: 2, where: 'Interleaved in the upcoming-events feed.', available: true },
  search: {
    cap: 1,
    where: 'Above search results that match the subject — not served until search ships.',
    available: false,
  },
};

export const PROMOTION_PLACEMENTS: readonly PromotionPlacement[] = [
  'home-feed',
  'market-page',
  'events-feed',
  'search',
];

/**
 * What is stored. There is no "active" or "ended": those come from the clock
 * ({@link PromotionServingState}). `paused` is the kill switch mid-flight.
 */
export type PromotionStatus = 'draft' | 'scheduled' | 'paused';

export const PROMOTION_STATUS_LABELS: Record<PromotionStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  paused: 'Paused',
};

export const PROMOTION_STATUSES: readonly PromotionStatus[] = ['draft', 'scheduled', 'paused'];

/**
 * Derived server-side from the status, the clock and the subject.
 * `subject-hidden` is the one an admin needs most: booked, but the subject is
 * not publicly visible (a vendor went inactive, an event was unpublished), so
 * nothing serves — which would otherwise look like a bug in the app.
 */
export type PromotionServingState =
  | 'draft'
  | 'upcoming'
  | 'live'
  | 'paused'
  | 'ended'
  | 'subject-hidden';

export const PROMOTION_SERVING_STATE_LABELS: Record<PromotionServingState, string> = {
  draft: 'Draft',
  upcoming: 'Upcoming',
  live: 'Live',
  paused: 'Paused',
  ended: 'Ended',
  'subject-hidden': 'Subject hidden',
};

export const PROMOTION_SERVING_STATE_HINTS: Record<PromotionServingState, string> = {
  draft: 'Not scheduled — it will not serve until an admin schedules it.',
  upcoming: 'Scheduled; it starts serving when its period begins.',
  live: 'Serving now.',
  paused: 'Paused by an admin. Resume it to serve again within its period.',
  ended: 'Its period is over.',
  'subject-hidden':
    "Booked, but its subject isn't publicly visible — a draft, an ended event or an inactive vendor — so nothing serves.",
};

/** The default reach around a subject's point, per the spec. */
export const DEFAULT_REACH_RADIUS_KM = 30;
/** The widest reach the backend accepts, in whole kilometres. */
export const MAX_REACH_RADIUS_KM = 500;
export const MAX_HEADLINE_LENGTH = 60;
export const MAX_BODY_LENGTH = 140;
export const MAX_CTA_LENGTH = 20;

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** What a promotion points at — the kind and the record behind it. */
export interface PromotionSubject {
  kind: PromotionTargetKind;
  /** The event, market, vendor or product id; `null` for a link. */
  id: string | null;
  /** The record's own name or title, or the URL for a link. */
  name: string;
  /** The console page for the subject, or `null` (a product or a link). */
  link: string | null;
  /** The subject's own image — what the card falls back to. */
  imageUrl: string | null;
  /** For a product: the vendor it belongs to. */
  vendorId: string | null;
}

/** One promotion as the console holds it — list row and form record alike. */
export interface PromotionRecord {
  id: string;
  subject: PromotionSubject;
  linkUrl: string | null;
  placement: PromotionPlacement;
  status: PromotionStatus;
  servingState: PromotionServingState;
  startsAt: Date;
  endsAt: Date;
  priority: number;
  /** The creative's own, as stored — `null` falls back to the subject's. */
  headline: string | null;
  /** What the card shows: the creative's headline, else the subject's name. */
  displayHeadline: string;
  body: string | null;
  /** The creative's own image, as stored. */
  imageUrl: string | null;
  /** What the card shows: the creative's image, else the subject's. */
  displayImageUrl: string | null;
  ctaLabel: string | null;
  sponsorName: string;
  sponsorVendorId: string | null;
  isHouse: boolean;
  /** Server-authored: "Sponsored" or "From MarketDay". */
  disclosure: string;
  isNationwide: boolean;
  reach: (LatLng & { radiusKm: number }) | null;
  /** Market pages and narrowed feeds it is scoped to; empty means wherever its reach covers. */
  marketIds: readonly string[];
}

/**
 * What a save sends. `subject` is read on create only. `status` too: on create
 * it is draft or scheduled (a new promotion cannot start paused); after that
 * the status only moves through `setStatus`, so a form save can never resume a
 * promotion someone just paused over a complaint.
 */
export interface PromotionDraft {
  subject: { kind: PromotionTargetKind; id: string | null };
  linkUrl: string;
  placement: PromotionPlacement;
  status: 'draft' | 'scheduled';
  startsAt: Date;
  endsAt: Date;
  priority: number;
  headline: string;
  body: string;
  imageUrl: string | null;
  ctaLabel: string;
  sponsorName: string;
  sponsorVendorId: string | null;
  isHouse: boolean;
  isNationwide: boolean;
  reach: (LatLng & { radiusKm: number }) | null;
  marketIds: readonly string[];
}

export type SponsorFilter = 'any' | 'house' | 'sponsored';

export const SPONSOR_FILTER_LABELS: Record<SponsorFilter, string> = {
  any: 'Any sponsor',
  house: 'House (MarketDay)',
  sponsored: 'Paid sponsors',
};

/** List filters, in query params (§7). */
export interface PromotionFilters {
  /** Matches the sponsor's name. */
  q: string;
  placement: PromotionPlacement | null;
  status: PromotionStatus | null;
  targetKind: PromotionTargetKind | null;
  sponsor: SponsorFilter;
}

export const EMPTY_PROMOTION_FILTERS: PromotionFilters = {
  q: '',
  placement: null,
  status: null,
  targetKind: null,
  sponsor: 'any',
};

export function hasPromotionFilters(filters: PromotionFilters): boolean {
  return (
    filters.q.trim() !== '' ||
    filters.placement !== null ||
    filters.status !== null ||
    filters.targetKind !== null ||
    filters.sponsor !== 'any'
  );
}

export interface PromotionListQuery {
  filters: PromotionFilters;
  page: PageRequest;
}

export interface PromotionDirectoryFacets {
  promotionCount: number;
  statusCounts: Record<PromotionStatus, number>;
}

export const EMPTY_PROMOTION_FACETS: PromotionDirectoryFacets = {
  promotionCount: 0,
  statusCounts: { draft: 0, scheduled: 0, paused: 0 },
};

export interface PromotionDirectoryPage extends Page<PromotionRecord> {
  facets: PromotionDirectoryFacets;
}

/** A market a promotion can be scoped to, or promote. */
export interface PromotionMarketOption {
  id: string;
  name: string;
  isDraft: boolean;
  /** The market's exact point — the default reach centre for a market subject. */
  location: LatLng | null;
}

/** A subject the `?eventId=` (or `marketId`, `vendorId`) link pre-picks. */
export interface PromotionPrefill {
  kind: 'event' | 'market' | 'vendor';
  id: string;
}

/** Everything the promotion form needs, for either of its addresses. */
export interface PromotionForm {
  /** `null` on `/promotions/new`. */
  promotion: PromotionRecord | null;
  markets: readonly PromotionMarketOption[];
  /** The subject a prefill link named, resolved — `null` without one. */
  prefilled: PromotionSubject | null;
}
