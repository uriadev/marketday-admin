import { StatTone } from './overview.model';

/**
 * Whether a market is visible outside the console. Mirrors the backend's
 * `MarketStatus` (`../backend/src/common/enums/market-status.enum.ts`) so the
 * GraphQL adapter maps one-to-one.
 */
export enum MarketStatus {
  Draft = 'DRAFT',
  Published = 'PUBLISHED',
}

/** Mirrors the backend's `MarketType`. */
export enum MarketType {
  FoodProduce = 'FOOD_PRODUCE',
  CraftArtisan = 'CRAFT_ARTISAN',
  Farmers = 'FARMERS',
  Vintage = 'VINTAGE',
  Mixed = 'MIXED',
}

/** Human labels for {@link MarketType}, for the wizard's select. */
export const MARKET_TYPE_LABELS: Record<MarketType, string> = {
  [MarketType.FoodProduce]: 'Food & produce',
  [MarketType.CraftArtisan]: 'Craft & artisan',
  [MarketType.Farmers]: 'Farmers',
  [MarketType.Vintage]: 'Vintage',
  [MarketType.Mixed]: 'Mixed',
};

export type TradingDay =
  'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

export const TRADING_DAYS: readonly TradingDay[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/** The four numbers a live market's card shows (design 1f). A draft has none. */
export interface MarketMetrics {
  stallsFilled: number;
  stallsTotal: number;
  preorders: number;
  enquiries: number;
}

/** One card in the markets directory (design 1f). */
export interface MarketSummary {
  id: string;
  /** URL segment — `/markets/temple-bar`. */
  slug: string;
  name: string;
  county: string;
  /** Place and schedule as one line: "Dublin 2 · Saturdays 09:00–14:30". */
  when: string;
  days: readonly TradingDay[];
  status: MarketStatus;
  /** True when one of this market's trading days is today. */
  tradingToday: boolean;
  /** Badge copy — "Trading", "Opens 09:00", "Draft". */
  badgeLabel: string;
  /** ISO date of the next market day; the default sort key. */
  nextMarketDay: string;
  /** `null` for a draft, which has no stalls, pre-orders or enquiries yet. */
  metrics: MarketMetrics | null;
}

/** Directory filters. Every one of these lives in a query param (§7). */
export interface MarketFilters {
  q: string;
  county: string | null;
  day: TradingDay | null;
  status: MarketStatus | null;
  sort: MarketSort;
}

export type MarketSort = 'next' | 'name' | 'stalls';

export const MARKET_SORTS: readonly { value: MarketSort; label: string }[] = [
  { value: 'next', label: 'Next market day' },
  { value: 'name', label: 'Name' },
  { value: 'stalls', label: 'Stalls filled' },
];

export const EMPTY_MARKET_FILTERS: MarketFilters = {
  q: '',
  county: null,
  day: null,
  status: null,
  sort: 'next',
};

/** A pitch on the stall map (design 1g). */
export type StallState = 'confirmed' | 'unpaid' | 'free';

export interface Stall {
  /** Pitch reference — "A1", "B4". */
  id: string;
  /** Vendor trading there, or "Free". */
  vendor: string;
  state: StallState;
}

export type StallFeeStatus = 'paid' | 'unpaid';

/**
 * One pitch as the Stalls tab edits it — the layout and the placement, without
 * the derived bits {@link Stall} carries for display. The vendor is held by
 * slug rather than by name so that renaming a market's vendor on their profile
 * cannot quietly empty a pitch.
 */
export interface StallPitch {
  /** Pitch reference — "A1", "B4". Unique within a market, and painted on the ground. */
  readonly id: string;
  /** The row it stands in — "A", "B". Rows are how the map is laid out. */
  readonly row: string;
  /** Whoever stands here, or `null` for a free pitch. */
  readonly vendorSlug: string | null;
}

/**
 * A market's pitch layout and who is on it. The Stalls tab owns this outright:
 * the stall map on the Overview is drawn from it, and so is the stall count the
 * Settings tab shows, which is why neither of those can edit it.
 */
export type MarketStallPlan = readonly StallPitch[];

/** A row of "Vendors this week" (design 1g). */
export interface WeekVendor {
  id: string;
  name: string;
  /** "Stall A3 · preserves". */
  meta: string;
  fee: StallFeeStatus;
}

/** A card in the "Needs a decision" rail. */
export interface MarketDecision {
  id: string;
  title: string;
  body: string;
  /** The affirmative action, when the card has one. */
  primaryAction: string | null;
  /** Always present — the dismiss or alternative action. */
  secondaryAction: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export interface ActivityEntry {
  id: string;
  /** One line: "Coolea Cheese Co. paid €35 · 2h ago". */
  text: string;
}

/** One KPI above the stall map. `suffix` carries the "/20" in "18/20". */
export interface MarketStat {
  label: string;
  value: string;
  suffix?: string;
  tone: StatTone;
}

/** Everything the Manage market · overview screen (design 1g) renders. */
export interface MarketDetail {
  id: string;
  slug: string;
  name: string;
  status: MarketStatus;
  tradingToday: boolean;
  badgeLabel: string;
  /** "Meeting House Square, Dublin 2 · Saturdays 09:00–14:30 · next market day Sat 22 August". */
  meta: string;
  /** The day the stall map is for — "Sat 22 August". */
  marketDayLabel: string;
  /** Approved vendors, for the Vendors tab count and "See all". */
  vendorCount: number;
  stats: readonly MarketStat[];
  stalls: readonly Stall[];
  /** One line under the stall map heading. */
  stallMapHint: string;
  weekVendors: readonly WeekVendor[];
  decisions: readonly MarketDecision[];
  checklist: readonly ChecklistItem[];
  activity: readonly ActivityEntry[];
}

/* ────────────────────────────────────────────────────────────────────────────
   Vendors tab (design 1g). The design names this tab and its count but draws
   no body for it, so the roster follows the vendor directory (design 1a): the
   same row anatomy, narrowed to one market and answering the organiser's
   question — who is trading here, who owes a fee, who is waiting on a decision.
──────────────────────────────────────────────────────────────────────────── */

/**
 * How a vendor stands at *this* market. Deliberately not `VendorStanding`: a
 * vendor paused at one market can be trading at another, so the platform-wide
 * standing is the wrong answer to a per-market question.
 */
export type MarketVendorStanding = 'trading' | 'fee-unpaid' | 'paused';

/** One row of a market's vendor roster. */
export interface MarketVendor {
  id: string;
  /** The vendor's own slug — every row opens `/vendors/:slug`. */
  slug: string;
  name: string;
  /** "Cheese · since 2018" — the directory's own line, unchanged. */
  meta: string;
  /** Pitch on the next market day. `null` while a member holds none. */
  stall: string | null;
  standing: MarketVendorStanding;
  /** "Trading", "Fee unpaid", "Paused". */
  standingLabel: string;
  fee: StallFeeStatus;
  /** "€35 paid", "€35 due", "No fee while paused". */
  feeLabel: string;
  /** Staff who can work this market, for the face pile. */
  staff: readonly string[];
}

/** A vendor waiting on this market's decision — design 1a's "applied" chip. */
export interface MarketApplication {
  id: string;
  /** They already have a directory record, so the name links to it. */
  vendorSlug: string;
  name: string;
  /** "Bakery · applied 2 days ago". */
  meta: string;
  staff: readonly string[];
}

/**
 * Everything the Vendors tab renders. It counts nothing the stall map counts —
 * pitches are the market day's business, membership is this screen's — so the
 * two never contradict each other.
 */
export interface MarketRoster {
  vendors: readonly MarketVendor[];
  applications: readonly MarketApplication[];
  /** Stall fees still to collect for the next market day, in euro. */
  feesOutstanding: number;
}

/** The toggle chips above the roster, in the order they read. */
export type MarketVendorToggle = 'feeUnpaid' | 'paused' | 'noStall';

export const MARKET_VENDOR_TOGGLES: readonly { value: MarketVendorToggle; label: string }[] = [
  { value: 'feeUnpaid', label: 'Fee unpaid' },
  { value: 'paused', label: 'Paused' },
  { value: 'noStall', label: 'No pitch yet' },
];

/** Roster filters. Each one is a query param (§7). */
export interface MarketVendorFilters {
  q: string;
  feeUnpaid: boolean;
  paused: boolean;
  noStall: boolean;
}

export const EMPTY_MARKET_VENDOR_FILTERS: MarketVendorFilters = {
  q: '',
  feeUnpaid: false,
  paused: false,
  noStall: false,
};

/* ────────────────────────────────────────────────────────────────────────────
   Add market (design 1h). The wizard's three steps each own one patch; the
   draft is the three of them together, shaped for the backend's
   `CreateMarketInput`.
──────────────────────────────────────────────────────────────────────────── */

/** What the Details step writes — and half of what the Settings tab saves. */
export interface MarketDetailsPatch {
  readonly name: string;
  readonly slug: string;
  readonly marketType: MarketType | null;
  readonly description: string;
  readonly imageUrl: string | null;
  readonly bannerUrl: string | null;
  readonly stallFeePerDay: number | null;
  readonly reviewApplications: boolean;
}

/**
 * What the Schedule step writes — and what the manage screen's Schedule tab
 * reads and writes back, which is why it carries the whole pattern rather than
 * only the fields that changed: the rule and the four controls behind it
 * always travel together.
 */
export interface MarketSchedulePatch {
  /**
   * The trading pattern as RFC 5545 text — `DTSTART:…\nRRULE:…` — composed by
   * `core/scheduling`. Goes straight into `markets.schedule`, which is what the
   * API parses to generate occurrences. Nobody types this.
   */
  readonly schedule: string;
  /** Minutes a market is open, derived from `opensAt`/`closesAt`. */
  readonly duration: number;
  readonly tradingDays: readonly number[];
  readonly opensAt: string;
  readonly closesAt: string;
}

/** What the Location step writes — and the other half of the Settings tab's save. */
export interface MarketLocationPatch {
  readonly address: string;
  readonly city: string;
  readonly county: string | null;
  readonly eircode: string;
  /**
   * Where the pin is. Required by `CreateMarketInput` — `markets.location` is a
   * NOT NULL PostGIS point — and only ever written by the map picker, never
   * typed. `county` and `eircode` have **no column server-side**: they are
   * console fields the list filters by, and the GraphQL adapter won't send them.
   */
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly accessNotes: string;
  readonly organiserName: string;
  readonly organiserPhone: string;
}

/**
 * What the manage screen's Settings tab reads and writes: everything about a
 * market except its trading pattern, which the Schedule tab owns. The two tabs
 * split the wizard's payload between them rather than overlapping, so neither
 * can overwrite the other's fields with a stale copy.
 */
export type MarketSettingsPatch = MarketDetailsPatch & MarketLocationPatch;

/** The whole payload for the three-step create wizard. */
export type MarketDraft = MarketDetailsPatch & MarketSchedulePatch & MarketLocationPatch;
