import {
  MarketSchedulePatch,
  MarketSettingsPatch,
  MarketStatus,
  MarketSummary,
  MarketType,
} from '../../models/market.model';

/** Stall fee per vendor per market day, in euro. */
export const STALL_FEE = 35;

/**
 * The market reference data every in-memory adapter reads.
 *
 * It sits in its own module rather than inside `InMemoryMarketRepository`
 * because both aggregates need it: the vendor fixtures name the markets their
 * vendors trade at, and the market fixtures count the vendors trading at them.
 * With the data here, neither adapter has to import the other.
 */

/**
 * The market directory (design 1f). Seven markets, of which three trade today
 * and one is still a draft — which is exactly what the screen's summary line
 * claims. Exported so tests assert against the same rows the screen renders.
 */
export const MARKETS_FIXTURE: readonly MarketSummary[] = [
  {
    id: 'mkt-temple-bar',
    slug: 'temple-bar',
    name: 'Temple Bar Food Market',
    county: 'Dublin',
    when: 'Dublin 2 · Saturdays 09:00–14:30',
    days: ['Saturday'],
    status: MarketStatus.Published,
    tradingToday: true,
    badgeLabel: 'Trading',
    nextMarketDay: '2026-08-22',
    metrics: { stallsFilled: 18, stallsTotal: 20, preorders: 147, enquiries: 3 },
  },
  {
    id: 'mkt-marlay-park',
    slug: 'marlay-park',
    name: 'Marlay Park Market',
    county: 'Dublin',
    when: 'Rathfarnham · Saturdays 10:00–16:00',
    days: ['Saturday'],
    status: MarketStatus.Published,
    tradingToday: true,
    badgeLabel: 'Trading',
    nextMarketDay: '2026-08-22',
    metrics: { stallsFilled: 11, stallsTotal: 16, preorders: 62, enquiries: 1 },
  },
  {
    id: 'mkt-howth',
    slug: 'howth-harbour',
    name: 'Howth Harbour Market',
    county: 'Dublin',
    when: 'Howth · Sat–Sun 09:00–17:00',
    days: ['Saturday', 'Sunday'],
    status: MarketStatus.Published,
    tradingToday: true,
    badgeLabel: 'Opens 09:00',
    nextMarketDay: '2026-08-22',
    metrics: { stallsFilled: 6, stallsTotal: 12, preorders: 24, enquiries: 0 },
  },
  {
    id: 'mkt-douglas',
    slug: 'douglas-village',
    name: 'Douglas Village Market',
    county: 'Cork',
    when: 'Douglas · Sundays 11:00–16:00',
    days: ['Sunday'],
    status: MarketStatus.Published,
    tradingToday: false,
    badgeLabel: 'Opens Sunday',
    nextMarketDay: '2026-08-23',
    metrics: { stallsFilled: 9, stallsTotal: 14, preorders: 38, enquiries: 2 },
  },
  {
    id: 'mkt-kinsale',
    slug: 'kinsale-harbour',
    name: 'Kinsale Harbour Market',
    county: 'Cork',
    when: 'Kinsale · Wednesdays 10:00–15:00',
    days: ['Wednesday'],
    status: MarketStatus.Published,
    tradingToday: false,
    badgeLabel: 'Opens Wednesday',
    nextMarketDay: '2026-08-26',
    metrics: { stallsFilled: 12, stallsTotal: 12, preorders: 44, enquiries: 1 },
  },
  {
    id: 'mkt-midleton',
    slug: 'midleton-farmers',
    name: 'Midleton Farmers Market',
    county: 'Cork',
    when: 'Midleton · Thursdays 09:00–14:00',
    days: ['Thursday'],
    status: MarketStatus.Published,
    tradingToday: false,
    badgeLabel: 'Opens Thursday',
    nextMarketDay: '2026-08-27',
    metrics: { stallsFilled: 14, stallsTotal: 18, preorders: 51, enquiries: 0 },
  },
  {
    id: 'mkt-bantry',
    slug: 'bantry-friday',
    name: 'Bantry Friday Market',
    county: 'Cork',
    when: 'Bantry · Fridays 09:00–15:00',
    days: ['Friday'],
    status: MarketStatus.Draft,
    tradingToday: false,
    badgeLabel: 'Draft',
    nextMarketDay: '2026-08-28',
    metrics: null,
  },
];

/**
 * Short market labels, keyed by the slug in {@link MARKETS_FIXTURE}. The vendor
 * directory's chips are too narrow for "Temple Bar Food Market", and a chip that
 * named a market the console can't open would be a lie — so the label and the
 * link come from the same place.
 */
export const MARKET_LABELS: Record<string, string> = {
  'temple-bar': 'Temple Bar',
  'marlay-park': 'Marlay Park',
  'howth-harbour': 'Howth',
  'douglas-village': 'Douglas',
  'kinsale-harbour': 'Kinsale',
  'midleton-farmers': 'Midleton',
  'bantry-friday': 'Bantry',
};

const SLUG_BY_LABEL = new Map(
  Object.entries(MARKET_LABELS).map(([slug, label]) => [label, slug] as const),
);

/** "Temple Bar" → "temple-bar". `undefined` for a label no market carries. */
export function slugForLabel(label: string): string | undefined {
  return SLUG_BY_LABEL.get(label);
}

/* ────────────────────────────────────────────────────────────────────────────
   Trading patterns, for the manage screen's Schedule tab.

   Each rule is written out rather than composed by `core/scheduling`, because
   every in-memory adapter is provided eagerly in `app.config.ts` — importing
   `composeSchedule` here would drag `rrule` out of the lazy feature chunks and
   into the initial bundle, past its budget. `market-fixture.spec.ts` composes
   each one from the facts below and asserts it matches, so the strings are
   checked by the same code path that writes them rather than trusted.
──────────────────────────────────────────────────────────────────────────── */

/** The human-readable half of a pattern — what the spec composes its rule from. */
export interface ScheduleSeed {
  /** ISO weekdays, 1 = Monday … 7 = Sunday. Matches the row's `days`. */
  readonly tradingDays: readonly number[];
  /** `YYYY-MM-DD`, on one of the market's own trading days. */
  readonly startsOn: string;
  readonly opensAt: string;
  readonly closesAt: string;
}

/**
 * One seed per market in {@link MARKETS_FIXTURE}, saying what its `when` line
 * says: Temple Bar really does trade Saturdays 09:00–14:30. The start dates are
 * the first week of January 2024 — a settled pattern, not one that begins after
 * the fixture's "today".
 */
export const SCHEDULE_SEEDS: Record<string, ScheduleSeed> = {
  'temple-bar': { tradingDays: [6], startsOn: '2024-01-06', opensAt: '09:00', closesAt: '14:30' },
  'marlay-park': { tradingDays: [6], startsOn: '2024-01-06', opensAt: '10:00', closesAt: '16:00' },
  'howth-harbour': {
    tradingDays: [6, 7],
    startsOn: '2024-01-06',
    opensAt: '09:00',
    closesAt: '17:00',
  },
  'douglas-village': {
    tradingDays: [7],
    startsOn: '2024-01-07',
    opensAt: '11:00',
    closesAt: '16:00',
  },
  'kinsale-harbour': {
    tradingDays: [3],
    startsOn: '2024-01-03',
    opensAt: '10:00',
    closesAt: '15:00',
  },
  'midleton-farmers': {
    tradingDays: [4],
    startsOn: '2024-01-04',
    opensAt: '09:00',
    closesAt: '14:00',
  },
  'bantry-friday': {
    tradingDays: [5],
    startsOn: '2024-01-05',
    opensAt: '09:00',
    closesAt: '15:00',
  },
};

/** Each market's stored pattern, keyed by slug. Nobody types these by hand. */
export const MARKET_SCHEDULES: Record<string, MarketSchedulePatch> = {
  'temple-bar': {
    schedule: 'DTSTART:20240106T090000Z\nRRULE:FREQ=WEEKLY;BYDAY=SA',
    duration: 330,
    tradingDays: [6],
    opensAt: '09:00',
    closesAt: '14:30',
    bookingDeadlineHours: 48,
  },
  'marlay-park': {
    schedule: 'DTSTART:20240106T100000Z\nRRULE:FREQ=WEEKLY;BYDAY=SA',
    duration: 360,
    tradingDays: [6],
    opensAt: '10:00',
    closesAt: '16:00',
    bookingDeadlineHours: 48,
  },
  'howth-harbour': {
    schedule: 'DTSTART:20240106T090000Z\nRRULE:FREQ=WEEKLY;BYDAY=SA,SU',
    duration: 480,
    tradingDays: [6, 7],
    opensAt: '09:00',
    closesAt: '17:00',
    bookingDeadlineHours: 48,
  },
  'douglas-village': {
    schedule: 'DTSTART:20240107T110000Z\nRRULE:FREQ=WEEKLY;BYDAY=SU',
    duration: 300,
    tradingDays: [7],
    opensAt: '11:00',
    closesAt: '16:00',
    bookingDeadlineHours: 48,
  },
  'kinsale-harbour': {
    schedule: 'DTSTART:20240103T100000Z\nRRULE:FREQ=WEEKLY;BYDAY=WE',
    duration: 300,
    tradingDays: [3],
    opensAt: '10:00',
    closesAt: '15:00',
    bookingDeadlineHours: 48,
  },
  'midleton-farmers': {
    schedule: 'DTSTART:20240104T090000Z\nRRULE:FREQ=WEEKLY;BYDAY=TH',
    duration: 300,
    tradingDays: [4],
    opensAt: '09:00',
    closesAt: '14:00',
    bookingDeadlineHours: 48,
  },
  'bantry-friday': {
    schedule: 'DTSTART:20240105T090000Z\nRRULE:FREQ=WEEKLY;BYDAY=FR',
    duration: 360,
    tradingDays: [5],
    opensAt: '09:00',
    closesAt: '15:00',
    bookingDeadlineHours: 48,
  },
};

/* ────────────────────────────────────────────────────────────────────────────
   Everything else a market carries, for the manage screen's Settings tab.
──────────────────────────────────────────────────────────────────────────── */

/**
 * The half of a market's settings that its directory row does not already
 * carry. Name, slug, county and stall count are derived from the row itself, so
 * the tab and the card cannot disagree about them.
 */
interface SettingsSeed {
  readonly marketType: MarketType;
  readonly description: string;
  readonly address: string;
  readonly city: string;
  readonly eircode: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly accessNotes: string;
  readonly organiserName: string;
  readonly organiserPhone: string;
  /** Only for a draft, whose row carries no metrics to take it from. */
  readonly stallCount?: number;
  readonly reviewApplications?: boolean;
  readonly acceptsPreOrders?: boolean;
}

const SETTINGS_SEEDS: Record<string, SettingsSeed> = {
  'temple-bar': {
    marketType: MarketType.FoodProduce,
    description:
      'Dublin’s Saturday food market in Meeting House Square — thirty years of cheese, bread, oysters and coffee under the awnings.',
    address: 'Meeting House Square, Temple Bar',
    city: 'Dublin 2',
    eircode: 'D02 X406',
    latitude: 53.3448,
    longitude: -6.2649,
    accessNotes: 'Van access from Essex Street East before 08:00. No vehicles in the square after.',
    organiserName: 'Áine Ní Bhriain',
    organiserPhone: '01 677 2255',
  },
  'marlay-park': {
    marketType: MarketType.Mixed,
    description:
      'Food, crafts and plants beside the courtyard at Marlay Park, with the walled garden open alongside.',
    address: 'Marlay Park, Grange Road, Rathfarnham',
    city: 'Dublin 16',
    eircode: 'D16 XY95',
    latitude: 53.2758,
    longitude: -6.2647,
    accessNotes: 'Load in through the Grange Road gate. Park staff open the bollards at 08:30.',
    organiserName: 'Cormac Doyle',
    organiserPhone: '01 493 1611',
  },
  'howth-harbour': {
    marketType: MarketType.FoodProduce,
    description:
      'A weekend harbour market on the West Pier — landed fish, smokehouse produce and hot food, facing the boats.',
    address: 'West Pier, Howth',
    city: 'Howth',
    eircode: 'D13 KX26',
    latitude: 53.3906,
    longitude: -6.0664,
    accessNotes: 'Pier is shared with working boats. Keep the slipway clear at all times.',
    organiserName: 'Maeve Kavanagh',
    organiserPhone: '01 832 0400',
  },
  'douglas-village': {
    marketType: MarketType.Mixed,
    description:
      'Sunday market on the green at Douglas, mixing growers and makers from across the harbour side of the city.',
    address: 'Douglas Village Green, Douglas',
    city: 'Cork',
    eircode: 'T12 X289',
    latitude: 51.8746,
    longitude: -8.431,
    accessNotes: 'Pitches are on grass — bring boards in winter. Power from the community centre.',
    organiserName: 'Sinéad Murphy',
    organiserPhone: '021 436 7788',
  },
  'kinsale-harbour': {
    marketType: MarketType.CraftArtisan,
    description:
      'Makers and small producers on Pier Road, midweek, the length of the Kinsale season.',
    address: 'Pier Road, Kinsale',
    city: 'Kinsale',
    eircode: 'P17 XW62',
    latitude: 51.7059,
    longitude: -8.5222,
    accessNotes: 'Road closes to traffic 09:00–16:00. Unload before the barriers go up.',
    organiserName: 'Deirdre O’Sullivan',
    organiserPhone: '021 477 2234',
  },
  'midleton-farmers': {
    marketType: MarketType.Farmers,
    description:
      'East Cork’s farmers market on Main Street — growers, dairy and butchers, most of them within twenty miles.',
    address: 'Main Street, Midleton',
    city: 'Midleton',
    eircode: 'P25 E438',
    latitude: 51.915,
    longitude: -8.175,
    accessNotes: 'Set up from 07:00 in the Hospital Road car park end.',
    organiserName: 'Pádraig Walsh',
    organiserPhone: '021 463 1900',
  },
  'bantry-friday': {
    marketType: MarketType.Farmers,
    description:
      'The Friday market on Wolfe Tone Square, being rebuilt for the coming season around a smaller core of growers.',
    address: 'Wolfe Tone Square, Bantry',
    city: 'Bantry',
    eircode: 'P75 VH49',
    latitude: 51.6812,
    longitude: -9.452,
    accessNotes: 'Square is shared with the Friday fair. Confirm pitch lines with the council.',
    organiserName: 'Nuala Crowley',
    organiserPhone: '027 501 22',
    stallCount: 10,
    acceptsPreOrders: false,
  },
};

function buildSettings(market: MarketSummary, seed: SettingsSeed): MarketSettingsPatch {
  return {
    name: market.name,
    slug: market.slug,
    marketType: seed.marketType,
    description: seed.description,
    // No fixture ships a picture: `InMemoryMediaRepository` makes data URLs, so
    // an uploaded image is real without anything being fetched over the wire.
    imageUrl: null,
    bannerUrl: null,
    stallCount: market.metrics?.stallsTotal ?? seed.stallCount ?? null,
    stallFeePerDay: STALL_FEE,
    reviewApplications: seed.reviewApplications ?? true,
    acceptsPreOrders: seed.acceptsPreOrders ?? true,
    address: seed.address,
    city: seed.city,
    county: market.county,
    eircode: seed.eircode,
    latitude: seed.latitude,
    longitude: seed.longitude,
    accessNotes: seed.accessNotes,
    organiserName: seed.organiserName,
    organiserPhone: seed.organiserPhone,
  };
}

/** Each market's settings, keyed by slug. */
export const MARKET_SETTINGS: Record<string, MarketSettingsPatch> = Object.fromEntries(
  MARKETS_FIXTURE.map(
    (market) => [market.slug, buildSettings(market, SETTINGS_SEEDS[market.slug]!)] as const,
  ),
);
