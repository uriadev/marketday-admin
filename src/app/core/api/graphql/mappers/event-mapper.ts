import {
  EventCategory,
  EventDraft,
  EventMarketOption,
  EventRecord,
  EventStatus,
  EventVenueKind,
  MarketDayWindow,
  eventTiming,
} from '../../../models/event.model';
import { fromMarketWallClock } from '../../../time/market-time';
import {
  CreateEventInput,
  EventCategory as GqlEventCategory,
  EventFieldsFragment,
  EventFormQuery,
  EventSessionInput,
  EventStatus as GqlEventStatus,
  EventVenueKind as GqlEventVenueKind,
  MarketStatus,
  UpdateEventInput,
} from '../generated';
import { blankToNull } from './nullable';

export type GqlEvent = EventFieldsFragment;
export type GqlEventFormMarket = EventFormQuery['adminMarkets'][number];

const VENUE_KIND: Record<GqlEventVenueKind, EventVenueKind> = {
  [GqlEventVenueKind.Market]: 'market',
  [GqlEventVenueKind.Vendor]: 'vendor',
  [GqlEventVenueKind.Place]: 'place',
};

const GQL_VENUE_KIND: Record<EventVenueKind, GqlEventVenueKind> = {
  market: GqlEventVenueKind.Market,
  vendor: GqlEventVenueKind.Vendor,
  place: GqlEventVenueKind.Place,
};

const CATEGORY: Record<GqlEventCategory, EventCategory> = {
  [GqlEventCategory.Music]: 'music',
  [GqlEventCategory.Festival]: 'festival',
  [GqlEventCategory.Workshop]: 'workshop',
  [GqlEventCategory.Tasting]: 'tasting',
  [GqlEventCategory.Kids]: 'kids',
  [GqlEventCategory.FarmOpenDay]: 'farm-open-day',
  [GqlEventCategory.Community]: 'community',
  [GqlEventCategory.Other]: 'other',
};

export const GQL_CATEGORY: Record<EventCategory, GqlEventCategory> = {
  music: GqlEventCategory.Music,
  festival: GqlEventCategory.Festival,
  workshop: GqlEventCategory.Workshop,
  tasting: GqlEventCategory.Tasting,
  kids: GqlEventCategory.Kids,
  'farm-open-day': GqlEventCategory.FarmOpenDay,
  community: GqlEventCategory.Community,
  other: GqlEventCategory.Other,
};

export const GQL_EVENT_STATUS: Record<EventStatus, GqlEventStatus> = {
  draft: GqlEventStatus.Draft,
  published: GqlEventStatus.Published,
};

export { GQL_VENUE_KIND };

export function toEventRecord(event: GqlEvent, now: Date = new Date()): EventRecord {
  const startsAt = new Date(event.startsAt);
  const endsAt = new Date(event.endsAt);
  const kind = VENUE_KIND[event.venueKind];
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    // An enum member this build does not know reads as "other", so the
    // append-only enum can grow server-first without breaking the list.
    category: CATEGORY[event.category] ?? 'other',
    imageUrl: event.imageUrl,
    externalUrl: event.externalUrl,
    status: event.status === GqlEventStatus.Published ? 'published' : 'draft',
    isFeatured: event.isFeatured,
    venue: {
      kind,
      marketId: event.market?.id ?? null,
      vendorId: event.vendor?.id ?? null,
      name: event.market?.name ?? event.vendor?.name ?? null,
      link: event.market
        ? `/markets/${event.market.slug}`
        : event.vendor
          ? `/vendors/${event.vendor.slug}`
          : null,
    },
    areaName: event.areaName,
    address: event.address,
    latitude: event.latitude,
    longitude: event.longitude,
    sessions: event.sessions.map((session) => ({
      startsAt: new Date(session.startsAt),
      endsAt: new Date(session.endsAt),
      label: session.label,
    })),
    startsAt,
    endsAt,
    timing: eventTiming(startsAt, endsAt, now),
  };
}

/**
 * A market occurrence's `occursOn`/`endsOn` are zoneless numerals holding
 * Irish wall-clock time (`../backend/src/markets/domain/market-time-zone.ts`),
 * serialised with a misleading `Z`. The first 16 characters are the reading;
 * the zone they mean is the market's.
 */
function wallClockInstant(numerals: string): Date {
  const [date, time = '00:00'] = numerals.slice(0, 16).split('T');
  const [year, month, day] = date!.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return fromMarketWallClock({
    year: year!,
    month: month!,
    day: day!,
    hour: hour!,
    minute: minute!,
  });
}

/** An occurrence with no end runs to the end of its day. */
function toMarketDay(occurrence: { occursOn: string; endsOn: string | null }): MarketDayWindow {
  const startsAt = wallClockInstant(occurrence.occursOn);
  const endsAt = occurrence.endsOn
    ? wallClockInstant(occurrence.endsOn)
    : wallClockInstant(`${occurrence.occursOn.slice(0, 10)}T23:59`);
  return { startsAt, endsAt };
}

export function toEventMarketOption(market: GqlEventFormMarket): EventMarketOption {
  return {
    id: market.id,
    name: market.name,
    town: market.city,
    isDraft: market.status !== MarketStatus.Published,
    days: (market.occurrences ?? []).map(toMarketDay),
  };
}

function toSessionInputs(draft: EventDraft): EventSessionInput[] {
  return draft.sessions.map((session) => ({
    startsAt: session.startsAt.toISOString(),
    endsAt: session.endsAt.toISOString(),
    label: blankToNull(session.label),
  }));
}

/**
 * The point, or nothing at all. A market event's point is always its
 * market's, and the backend refuses *any* coordinate on one — `null`
 * included, since it checks `!== undefined` — so the keys are left out
 * rather than sent empty. This is the one exception to `blankToNull`'s rule.
 */
function pointOf(draft: EventDraft): Pick<CreateEventInput, 'latitude' | 'longitude'> {
  if (draft.venueKind === 'market' || draft.latitude === null || draft.longitude === null) {
    return {};
  }
  return { latitude: draft.latitude, longitude: draft.longitude };
}

export function toCreateEventInput(draft: EventDraft): CreateEventInput {
  return {
    venueKind: GQL_VENUE_KIND[draft.venueKind],
    marketId: draft.venueKind === 'market' ? draft.marketId : null,
    vendorId: draft.venueKind === 'vendor' ? draft.vendorId : null,
    title: draft.title.trim(),
    description: blankToNull(draft.description),
    category: GQL_CATEGORY[draft.category],
    imageUrl: draft.imageUrl,
    externalUrl: blankToNull(draft.externalUrl),
    status: GQL_EVENT_STATUS[draft.status],
    isFeatured: draft.isFeatured,
    // A market event's area defaults to the market's town when this is null.
    areaName: blankToNull(draft.areaName),
    address: blankToNull(draft.address),
    ...pointOf(draft),
    sessions: toSessionInputs(draft),
  };
}

/**
 * `areaName` is the second exception: the update path trims whatever it is
 * given, so `null` would fail server-side rather than clear it — and an event
 * always has an area. It is sent as the string the form holds, or left out
 * when the form has none (a market event whose admin cleared the field keeps
 * the area it has).
 */
export function toUpdateEventInput(draft: EventDraft): UpdateEventInput {
  const areaName = draft.areaName.trim();
  return {
    title: draft.title.trim(),
    description: blankToNull(draft.description),
    category: GQL_CATEGORY[draft.category],
    imageUrl: draft.imageUrl,
    externalUrl: blankToNull(draft.externalUrl),
    status: GQL_EVENT_STATUS[draft.status],
    isFeatured: draft.isFeatured,
    ...(areaName ? { areaName } : {}),
    address: blankToNull(draft.address),
    ...pointOf(draft),
    sessions: toSessionInputs(draft),
  };
}
