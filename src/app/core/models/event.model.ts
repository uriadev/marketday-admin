import { Page, PageRequest } from './page.model';

/**
 * Events in the What's On context (`../backend/specs/market-events-proposal.md`).
 * An event is *content*: a band at a market, a farm open day at a vendor's
 * place, a festival in a town square. Only admins author them, always.
 *
 * The unions mirror the backend enums (`EventVenueKind`, `EventCategory`,
 * `EventStatus`) in the console's kebab-case; `event-mapper.ts` converts.
 */

/**
 * Where an event happens. Immutable once created — moving an event to another
 * venue owner is a different event, so the edit form shows it as text.
 *
 * - `market`: at one of the platform's markets; its point is the market's.
 * - `vendor`: at a vendor's own premises (often someone's home).
 * - `place`: free-standing, owned by nobody on the platform.
 */
export type EventVenueKind = 'market' | 'vendor' | 'place';

export const EVENT_VENUE_KIND_LABELS: Record<EventVenueKind, string> = {
  market: 'At a market',
  vendor: "At a vendor's place",
  place: 'Somewhere else',
};

export const EVENT_VENUE_KINDS: readonly EventVenueKind[] = ['market', 'vendor', 'place'];

/** An icon per venue kind, for the list's venue column. */
export const EVENT_VENUE_KIND_ICONS: Record<EventVenueKind, string> = {
  market: 'storefront',
  vendor: 'agriculture',
  place: 'location_on',
};

/** Only so the app can pick an icon and the website a filter chip. Append-only server-side. */
export type EventCategory =
  | 'music'
  | 'festival'
  | 'workshop'
  | 'tasting'
  | 'kids'
  | 'farm-open-day'
  | 'community'
  | 'other';

export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  music: 'Music',
  festival: 'Festival',
  workshop: 'Workshop',
  tasting: 'Tasting',
  kids: 'Kids',
  'farm-open-day': 'Farm open day',
  community: 'Community',
  other: 'Other',
};

export const EVENT_CATEGORIES = Object.keys(EVENT_CATEGORY_LABELS) as readonly EventCategory[];

export type EventStatus = 'draft' | 'published';

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: 'Draft',
  published: 'Published',
};

export const EVENT_STATUSES: readonly EventStatus[] = ['draft', 'published'];

/** Derived from the clock against the event's bounds — never stored. */
export type EventTiming = 'upcoming' | 'ongoing' | 'ended';

/** The app draws a circle of this radius around an event's point, never a pin. */
export const EVENT_LOCATION_ACCURACY_M = 1000;

/** The backend refuses more than this many sessions on one event. */
export const MAX_EVENT_SESSIONS = 20;
export const MAX_EVENT_TITLE_LENGTH = 120;

/** One `[startsAt, endsAt)` span of an event — "Set 1", "Day 2". */
export interface EventSession {
  startsAt: Date;
  endsAt: Date;
  label: string | null;
}

export interface EventVenue {
  kind: EventVenueKind;
  marketId: string | null;
  vendorId: string | null;
  /** The market's or vendor's name; `null` for a `place`. */
  name: string | null;
  /** The console page for that market or vendor, or `null`. */
  link: string | null;
}

/**
 * One event as the console holds it — the list's row and the form's record
 * alike, since `adminEvents` and `adminEvent` select the same fields.
 */
export interface EventRecord {
  id: string;
  title: string;
  description: string | null;
  category: EventCategory;
  imageUrl: string | null;
  externalUrl: string | null;
  status: EventStatus;
  /** Editorial and unpaid: the only thing that picks a market-day reminder's headline. */
  isFeatured: boolean;
  venue: EventVenue;
  /** "Ballincollig, Co. Cork" — what a card shows when there is no address. */
  areaName: string;
  /** Published verbatim when set; empty for most vendor events on purpose. */
  address: string | null;
  /** Approximate — snapped server-side to a ~1 km grid. Never a pin. */
  latitude: number;
  longitude: number;
  /** Ordered by `startsAt`; never empty. */
  sessions: readonly EventSession[];
  /** The earliest session start and the latest session end. */
  startsAt: Date;
  endsAt: Date;
  timing: EventTiming;
}

/**
 * What a save sends. `sessions` is the whole list the event ends up with,
 * never a patch. `venueKind`, `marketId` and `vendorId` are read on create
 * only. `latitude`/`longitude` are ignored for a `market` event, whose point
 * is always its market's.
 */
export interface EventDraft {
  title: string;
  description: string;
  category: EventCategory;
  imageUrl: string | null;
  externalUrl: string;
  status: EventStatus;
  isFeatured: boolean;
  venueKind: EventVenueKind;
  marketId: string | null;
  vendorId: string | null;
  areaName: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  sessions: readonly EventSession[];
}

/** "Upcoming & ongoing" is the default: an ended event is history, not work. */
export type EventWhen = 'current' | 'past' | 'all';

export const EVENT_WHEN_LABELS: Record<EventWhen, string> = {
  current: 'Upcoming & ongoing',
  past: 'Past',
  all: 'Any time',
};

export const EVENT_WHENS: readonly EventWhen[] = ['current', 'past', 'all'];

/** List filters. Every one of these lives in a query param (§7). */
export interface EventFilters {
  /** Matches the title. */
  q: string;
  when: EventWhen;
  status: EventStatus | null;
  venueKind: EventVenueKind | null;
  category: EventCategory | null;
}

export const EMPTY_EVENT_FILTERS: EventFilters = {
  q: '',
  when: 'current',
  status: null,
  venueKind: null,
  category: null,
};

export function hasEventFilters(filters: EventFilters): boolean {
  return (
    filters.q.trim() !== '' ||
    filters.when !== 'current' ||
    filters.status !== null ||
    filters.venueKind !== null ||
    filters.category !== null
  );
}

export interface EventListQuery {
  filters: EventFilters;
  page: PageRequest;
}

/** Counts across every event, whatever the filters — the header's numbers. */
export interface EventDirectoryFacets {
  eventCount: number;
  /** Not yet ended. */
  currentCount: number;
  draftCount: number;
}

export const EMPTY_EVENT_FACETS: EventDirectoryFacets = {
  eventCount: 0,
  currentCount: 0,
  draftCount: 0,
};

export interface EventDirectoryPage extends Page<EventRecord> {
  facets: EventDirectoryFacets;
}

/** One stretch of time a market trades, as instants. */
export interface MarketDayWindow {
  startsAt: Date;
  endsAt: Date;
}

/** A market an event can be held at — the venue select's option. */
export interface EventMarketOption {
  id: string;
  name: string;
  /** What a market event's area name defaults to server-side. */
  town: string;
  isDraft: boolean;
  /** Its upcoming market days, for the "no market that day" warning. */
  days: readonly MarketDayWindow[];
}

/** Everything the event form needs, for either of its addresses. */
export interface EventForm {
  /** `null` on `/events/new`. */
  event: EventRecord | null;
  markets: readonly EventMarketOption[];
}

export function eventTiming(startsAt: Date, endsAt: Date, now: Date): EventTiming {
  if (endsAt.getTime() <= now.getTime()) return 'ended';
  return startsAt.getTime() <= now.getTime() ? 'ongoing' : 'upcoming';
}

/**
 * Sessions of a market event that overlap none of the market's trading days.
 * Nothing server-side flags this — an event is pinned to instants, not to
 * occurrence rows, so it keeps its time when a schedule moves — and the spec
 * leaves the warning to the console.
 *
 * Only sessions inside the span the market's days cover are judged: a market's
 * occurrences are generated a few weeks ahead and past ones are not read, so a
 * session outside that span is unknown, not unmatched.
 */
export function sessionsOffMarketDays(
  sessions: readonly EventSession[],
  days: readonly MarketDayWindow[],
): EventSession[] {
  if (days.length === 0) return [];
  const from = Math.min(...days.map((day) => day.startsAt.getTime()));
  const until = Math.max(...days.map((day) => day.endsAt.getTime()));
  return sessions.filter(
    (session) =>
      session.endsAt.getTime() > from &&
      session.startsAt.getTime() < until &&
      !days.some(
        (day) =>
          session.startsAt.getTime() < day.endsAt.getTime() &&
          session.endsAt.getTime() > day.startsAt.getTime(),
      ),
  );
}
