/**
 * What part of the vendor record a change touched (design 2c). These are the
 * five chips above the feed, and the five things the log accepts: sign-ins and
 * page views are deliberately not among them.
 */
export type ActivityKind = 'membership' | 'staff' | 'payment' | 'profile' | 'document';

export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  membership: 'Membership',
  staff: 'Staff',
  payment: 'Payment',
  profile: 'Profile',
  document: 'Document',
};

/** The chip row's order, as the design lists it. */
export const ACTIVITY_KINDS: readonly ActivityKind[] = [
  'membership',
  'staff',
  'payment',
  'profile',
  'document',
];

/**
 * Where a change came from. `automatic` is the platform acting on its own — a
 * scheduled card run, a flag clearing at midnight — and reads differently from
 * a person doing something, which is why it is a source rather than an actor.
 */
export type ActivitySource = 'vendor app' | 'admin console' | 'support console' | 'automatic';

/**
 * One entry in the vendor's audit log (design 2c).
 *
 * Note for the GraphQL swap: the backend has an `OrderEventModel` for order
 * history and nothing else — there is **no vendor audit log type** yet, so this
 * is a console model waiting on real server work, like the fee ledger.
 */
export interface ActivityEvent {
  id: string;
  /** "Tom McNally", or "MarketDay" when the platform acted on its own. */
  who: string;
  /** "Owner · vendor app" — how the actor reads in the "Most active" rail. */
  whoRole: string;
  /** "applied to Dún Laoghaire Sunday Market". */
  what: string;
  /** The line under it. Empty when the headline says everything. */
  detail: string;
  kind: ActivityKind;
  /** Short market label this touched, or empty when it touched none. */
  market: string;
  /** Links the market chip through, when the market is one we know. */
  marketSlug: string | null;
  source: ActivitySource;
  /** "07:02". */
  time: string;
  /** "Today · Thursday 20 August" — the heading this entry files under. */
  day: string;
  /** Groups and orders without parsing `day`. Larger is more recent. */
  sortKey: number;
}

/** One line of the "Most active" rail. */
export interface ActivityActor {
  name: string;
  /** "Owner · vendor app". */
  role: string;
  count: number;
}

/**
 * The rail's figures. Counted over the whole log rather than the page on
 * screen, so "Load older activity" never moves them.
 */
export interface ActivitySummary {
  /** Changes in the last 30 days. */
  changes: number;
  /** How many of those came from the admin or support console. */
  byAdmins: number;
  mostActive: readonly ActivityActor[];
  /** Everyone who appears in the log, for the "Anyone" menu. */
  actors: readonly string[];
}

/** One page of the feed, oldest-last. */
export interface ActivityFeed {
  events: readonly ActivityEvent[];
  /** Whether "Load older activity" has anything left to fetch. */
  hasMore: boolean;
  summary: ActivitySummary;
}

/** Feed filters. Each one is a query param (§7). */
export interface ActivityFilters {
  /** `null` is the design's "Everything" chip. */
  kind: ActivityKind | null;
  /** Actor name, or `null` for the design's "Anyone". */
  actor: string | null;
}

export const EMPTY_ACTIVITY_FILTERS: ActivityFilters = {
  kind: null,
  actor: null,
};

/** A day's worth of entries, as the feed renders them. */
export interface ActivityDay {
  /** "Today · Thursday 20 August". */
  label: string;
  events: readonly ActivityEvent[];
}
