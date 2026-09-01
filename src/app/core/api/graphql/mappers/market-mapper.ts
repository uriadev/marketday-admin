import {
  ChecklistItem,
  MarketDetail,
  MarketDraft,
  MarketRoster,
  MarketSchedulePatch,
  MarketSettingsPatch,
  MarketStatus,
  MarketSummary,
  MarketType,
  MarketVendor,
  MarketVendorStanding,
  StallFeeStatus,
  TradingDay,
  TRADING_DAYS,
} from '../../../models/market.model';
import { normaliseCounty } from '../../../models/location.model';
import {
  describeSchedule,
  formatTimeOfDay,
  nextOccurrence,
  expandSchedule,
  parseTimeOfDay,
} from '../../../scheduling/recurrence';
import {
  CreateMarketInput as GqlCreateMarketInput,
  MarketFieldsFragment,
  MarketStatus as GqlMarketStatus,
  MarketType as GqlMarketType,
  MarketVendorsForRosterQuery,
  UpdateMarketInput as GqlUpdateMarketInput,
} from '../generated';

/**
 * Ties every read below to the schema via codegen: a field renamed or
 * removed from `MarketModel` in `schema.gql` breaks `pnpm gql:generate`'s
 * output, which breaks this file at compile time — see `operations/market.ts`.
 */
export type GqlMarket = MarketFieldsFragment;
export type GqlMarketOccurrence = NonNullable<MarketFieldsFragment['occurrences']>[number];
export type GqlMarketVendorRow = MarketVendorsForRosterQuery['vendors']['items'][number];

/* ────────────────────────────────────────────────────────────────────────────
   Reads
──────────────────────────────────────────────────────────────────────────── */

function tradingDaysOf(market: GqlMarket): readonly TradingDay[] {
  const expanded = expandSchedule(market.schedule);
  if (!expanded) return [];
  return TRADING_DAYS.filter((_, i) => expanded.recurrence.tradingDays.includes(i + 1));
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Prefers the server's own generated occurrences over recomputing from the rule. */
function isTradingToday(market: GqlMarket): boolean {
  const today = todayIso();
  if (market.occurrences?.length) {
    return market.occurrences.some((o) => o.occursOn.slice(0, 10) === today);
  }
  return (
    tradingDaysOf(market).length > 0 &&
    nextOccurrence(market.schedule)?.toISOString().slice(0, 10) === today
  );
}

/** ISO date of the next market day — from real occurrences first, the rule otherwise. */
function nextMarketDay(market: GqlMarket): string {
  const today = todayIso();
  const upcoming = (market.occurrences ?? [])
    .map((o) => o.occursOn.slice(0, 10))
    .filter((date) => date >= today)
    .sort();
  if (upcoming.length) return upcoming[0];
  return nextOccurrence(market.schedule)?.toISOString().slice(0, 10) ?? '';
}

function badgeLabel(market: GqlMarket, tradingToday: boolean): string {
  if (market.status === 'DRAFT') return 'Draft';
  if (tradingToday) return 'Trading';
  const opensAt = expandSchedule(market.schedule)?.recurrence.opensAt;
  return opensAt ? `Opens ${opensAt}` : 'Scheduled';
}

/** "Saturdays" for one day, "Wed, Sat" for several. */
function daysLabel(days: readonly TradingDay[]): string {
  if (days.length === 0) return 'No trading days set';
  if (days.length === 1) return `${days[0]}s`;
  return days.map((day) => day.slice(0, 3)).join(', ');
}

function whenLabel(market: GqlMarket, days: readonly TradingDay[]): string {
  const opensAt = expandSchedule(market.schedule)?.recurrence.opensAt ?? '';
  const closesAt = opensAt ? formatTimeOfDay(closeTime(opensAt, market.duration)) : '';
  const time = opensAt && closesAt ? ` ${opensAt}–${closesAt}` : '';
  return `${market.city} · ${daysLabel(days)}${time}`;
}

function closeTime(opensAt: string, duration: number): Date | null {
  const opened = parseTimeOfDay(opensAt);
  if (!opened) return null;
  return new Date(opened.getTime() + duration * 60_000);
}

export function toMarketSummary(market: GqlMarket): MarketSummary {
  const days = tradingDaysOf(market);
  const tradingToday = isTradingToday(market);
  return {
    id: market.id,
    slug: market.slug,
    name: market.name,
    // No column server-side; `city` is the closest real signal to filter by.
    county: normaliseCounty(market.city) ?? market.city,
    when: whenLabel(market, days),
    days,
    status: market.status === 'PUBLISHED' ? MarketStatus.Published : MarketStatus.Draft,
    tradingToday,
    badgeLabel: badgeLabel(market, tradingToday),
    nextMarketDay: nextMarketDay(market),
    // stallsFilled/preorders/enquiries have no source — see docs/backend-api-gaps.md.
    metrics: null,
  };
}

/**
 * Thin but honest: everything the API can answer for real
 * (name/status/trading pattern/vendor count) is real; everything it cannot
 * (decisions, checklist, activity, the stall map, most of `stats`) is an
 * empty array rather than invented data. See docs/backend-api-gaps.md.
 */
export function toMarketDetail(market: GqlMarket, vendorCount: number): MarketDetail {
  const summary = toMarketSummary(market);
  const checklist: readonly ChecklistItem[] = [
    { id: 'location', label: 'Location set', done: Boolean(market.location) },
    {
      id: 'schedule',
      label: 'Trading pattern set',
      done: Boolean(expandSchedule(market.schedule)),
    },
    { id: 'published', label: 'Published', done: market.status === 'PUBLISHED' },
  ];
  return {
    id: market.id,
    slug: market.slug,
    name: market.name,
    status: summary.status,
    tradingToday: summary.tradingToday,
    badgeLabel: summary.badgeLabel,
    meta: `${market.address}, ${market.city} · ${daysLabel(summary.days)}`,
    marketDayLabel: describeSchedule(market.schedule),
    vendorCount,
    stats: [
      { label: 'Vendors', value: String(vendorCount), tone: 'neutral' },
      {
        label: 'Status',
        value: market.status === 'PUBLISHED' ? 'Published' : 'Draft',
        tone: 'neutral',
      },
    ],
    stalls: [],
    stallMapHint: 'The stall map has no backend model yet — see docs/backend-api-gaps.md.',
    weekVendors: [],
    decisions: [],
    checklist,
    activity: [],
  };
}

/**
 * `vendors(marketId)` real rows, with `applications: []` and
 * `feesOutstanding: 0` — no application or invoice model server-side
 * (`docs/backend-api-gaps.md` #9, #5). `slug` is the server's own now (gap #10
 * closed), so the `/vendors/:slug` link resolves against `GraphqlVendorRepository`.
 * `standing`/`fee`/`stall`/`staff` have no per-market signal to draw on,
 * so every row reads as a plain "trading" member.
 */
export function toMarketRoster(rows: readonly GqlMarketVendorRow[]): MarketRoster {
  const vendors: readonly MarketVendor[] = rows.map((row) => {
    const standing: MarketVendorStanding =
      row.isActive && row.isAcceptingOrders ? 'trading' : 'paused';
    const fee: StallFeeStatus = 'paid';
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      meta: row.category,
      stall: null,
      standing,
      standingLabel: standing === 'trading' ? 'Trading' : 'Paused',
      fee,
      feeLabel: '—',
      staff: [],
    };
  });
  return { vendors, applications: [], feesOutstanding: 0 };
}

export function toSchedulePatch(market: GqlMarket): MarketSchedulePatch {
  const expanded = expandSchedule(market.schedule);
  const opensAt = expanded?.recurrence.opensAt ?? '';
  const closes = opensAt ? closeTime(opensAt, market.duration) : null;
  return {
    schedule: market.schedule,
    duration: market.duration,
    tradingDays: expanded?.recurrence.tradingDays ?? [],
    opensAt,
    closesAt: formatTimeOfDay(closes),
  };
}

export function toSettingsPatch(market: GqlMarket): MarketSettingsPatch {
  const [lng, lat] = market.location?.coordinates ?? [];
  return {
    name: market.name,
    slug: market.slug,
    marketType: (market.marketType as MarketType | null) ?? null,
    description: market.description ?? '',
    imageUrl: market.imageUrl,
    bannerUrl: market.bannerImageUrl,
    stallFeePerDay: market.stallFeePerDay,
    reviewApplications: market.reviewApplications,
    address: market.address,
    city: market.city,
    county: normaliseCounty(market.city),
    // No column server-side.
    eircode: '',
    latitude: lat ?? null,
    longitude: lng ?? null,
    accessNotes: '',
    organiserName: market.organiserName ?? '',
    organiserPhone: market.organiserPhone ?? '',
  };
}

/* ────────────────────────────────────────────────────────────────────────────
   Writes
──────────────────────────────────────────────────────────────────────────── */

export interface CreateMarketVariables {
  readonly input: GqlCreateMarketInput;
}
export interface UpdateMarketVariables {
  readonly id: string;
  readonly input: GqlUpdateMarketInput;
}

/**
 * The console's own `MarketType` (`core/models/market.model.ts`) and the
 * generated, schema-derived one are separate TypeScript enums with identical
 * string members — a deliberate mirror (`../docs/ARCHITECTURE.md` §8), not
 * the same type. Both are string enums over the same value domain, so the
 * member itself casts straight across.
 */
function toGqlMarketType(type: MarketType | null): GqlMarketType | undefined {
  return type ? (type as unknown as GqlMarketType) : undefined;
}

/**
 * `markets.location` is a NOT NULL PostGIS point, so `createMarket` needs a
 * pin — the wizard's Location step is what supplies one. `county` and
 * `eircode` are never sent — no column (`../docs/ARCHITECTURE.md` §8).
 */
export function toCreateVariables(draft: MarketDraft, publish: boolean): CreateMarketVariables {
  return {
    input: {
      name: draft.name,
      slug: draft.slug,
      address: draft.address,
      city: draft.city,
      latitude: draft.latitude ?? 0,
      longitude: draft.longitude ?? 0,
      schedule: draft.schedule,
      duration: draft.duration,
      description: draft.description,
      imageUrl: draft.imageUrl,
      bannerImageUrl: draft.bannerUrl,
      marketType: toGqlMarketType(draft.marketType),
      organiserName: draft.organiserName,
      organiserPhone: draft.organiserPhone,
      stallFeePerDay: draft.stallFeePerDay,
      reviewApplications: draft.reviewApplications,
      status: publish ? GqlMarketStatus.Published : GqlMarketStatus.Draft,
    },
  };
}

export function toUpdateVariablesFromDraft(
  id: string,
  draft: MarketDraft,
  publish: boolean,
): UpdateMarketVariables {
  return { id, input: toCreateVariables(draft, publish).input };
}

export function toUpdateVariablesFromSettings(
  id: string,
  patch: MarketSettingsPatch,
): UpdateMarketVariables {
  return {
    id,
    input: {
      name: patch.name,
      slug: patch.slug,
      address: patch.address,
      city: patch.city,
      latitude: patch.latitude ?? undefined,
      longitude: patch.longitude ?? undefined,
      description: patch.description,
      imageUrl: patch.imageUrl,
      bannerImageUrl: patch.bannerUrl,
      marketType: toGqlMarketType(patch.marketType),
      organiserName: patch.organiserName,
      organiserPhone: patch.organiserPhone,
      stallFeePerDay: patch.stallFeePerDay,
      reviewApplications: patch.reviewApplications,
    },
  };
}

export function toUpdateVariablesFromSchedule(
  id: string,
  patch: MarketSchedulePatch,
): UpdateMarketVariables {
  return { id, input: { schedule: patch.schedule, duration: patch.duration } };
}
