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
   Add market (design 1h). The wizard's three steps each own one patch; the
   draft is the three of them together, shaped for the backend's
   `CreateMarketInput`.
──────────────────────────────────────────────────────────────────────────── */

/** What the Details step writes — also the settings tab's save, later. */
export interface MarketDetailsPatch {
  readonly name: string;
  readonly slug: string;
  readonly marketType: MarketType | null;
  readonly description: string;
  readonly imageUrl: string | null;
  readonly bannerUrl: string | null;
  readonly stallCount: number | null;
  readonly stallFeePerDay: number | null;
  readonly reviewApplications: boolean;
  readonly acceptsPreOrders: boolean;
}

/** What the Schedule step writes. */
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
  readonly bookingDeadlineHours: number;
}

/** What the Location step writes. */
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

/** The whole payload for the three-step create wizard. */
export type MarketDraft = MarketDetailsPatch & MarketSchedulePatch & MarketLocationPatch;
