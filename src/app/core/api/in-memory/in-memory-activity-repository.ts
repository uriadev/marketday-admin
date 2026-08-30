import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import {
  ActivityActor,
  ActivityEvent,
  ActivityFeed,
  ActivityFilters,
  ActivityKind,
  ActivitySource,
} from '../../models/activity.model';
import { ActivityRepository } from '../ports/activity-repository';
import { MCNALLY_DETAIL, VENDORS_FIXTURE } from './in-memory-vendor-repository';

/** How many entries one page of the feed carries. */
const PAGE_SIZE = 10;

/** Everything inside this many entries counts towards the rail's 30 days. */
const LAST_30_DAYS = 41;

type Seed = {
  who: string;
  what: string;
  detail?: string;
  kind: ActivityKind;
  market?: string;
  source: ActivitySource;
  time: string;
  day: string;
};

/** How each actor reads in the "Most active" rail. */
const ACTOR_ROLES: Record<string, string> = {
  'Tom McNally': 'Owner · vendor app',
  'Bríd McNally': 'Manager · vendor app',
  'Gráinne Doyle': 'Organiser · Temple Bar',
  'Áine Ryan': 'Super admin · MarketDay',
  'Dara Kelly': 'Support agent · MarketDay',
  'Cathal Byrne': 'Stallholder · vendor app',
  'Lucia Marín': 'Stallholder · vendor app',
  MarketDay: 'The platform, acting on its own',
};

/**
 * The eight entries design 2c draws, newest first, with the market names taken
 * from McNally's real memberships rather than the design's third market.
 */
const DESIGNED: readonly Seed[] = [
  {
    who: 'MarketDay',
    what: 'could not take the Marlay Park fee',
    detail:
      'Card ···· 4417 declined — insufficient funds. Tom was emailed and the invoice left open.',
    kind: 'payment',
    market: 'Marlay Park',
    source: 'automatic',
    time: '07:02',
    day: 'Today · Thursday 20 August',
  },
  {
    who: 'Tom McNally',
    what: 'applied to Douglas Village Market',
    detail: 'Asked for a 3m pitch with power, fortnightly from 6 September.',
    kind: 'membership',
    market: 'Douglas',
    source: 'vendor app',
    time: '06:41',
    day: 'Today · Thursday 20 August',
  },
  {
    who: 'Bríd McNally',
    what: 'invited Sam Okafor as a stallholder',
    detail: 'Scoped to Temple Bar only. Invitation still unaccepted.',
    kind: 'staff',
    market: 'Temple Bar',
    source: 'vendor app',
    time: '16:20',
    day: 'Yesterday · Wednesday 19 August',
  },
  {
    who: 'Dara Kelly',
    what: 'replied to the stall hours enquiry',
    kind: 'profile',
    source: 'support console',
    time: '11:05',
    day: 'Yesterday · Wednesday 19 August',
  },
  {
    who: 'Tom McNally',
    what: 'changed the stall description',
    detail: 'Added the polytunnel jams line; removed “new potatoes from June”.',
    kind: 'profile',
    source: 'vendor app',
    time: '09:12',
    day: 'Yesterday · Wednesday 19 August',
  },
  {
    who: 'Gráinne Doyle',
    what: 'waived the August fee for Howth Harbour',
    detail: 'Reason given: market paused for the month, agreed with the organiser.',
    kind: 'payment',
    market: 'Howth',
    source: 'admin console',
    time: '14:48',
    day: 'Monday 17 August',
  },
  {
    who: 'Tom McNally',
    what: 'uploaded a renewed organic certificate',
    detail: 'Expires 30 September 2026. Shared with all 3 markets.',
    kind: 'document',
    source: 'vendor app',
    time: '10:30',
    day: 'Monday 17 August',
  },
  {
    who: 'Áine Ryan',
    what: 'moved the Temple Bar stall from A9 to A7',
    kind: 'membership',
    market: 'Temple Bar',
    source: 'admin console',
    time: '08:55',
    day: 'Monday 17 August',
  },
];

/**
 * The weeks behind them, so "Load older activity" has somewhere to go and the
 * rail's 41 changes are 41 real entries rather than a number in a tile.
 */
const OLDER: readonly Seed[] = [
  {
    who: 'MarketDay',
    what: 'took the Temple Bar fee',
    detail: 'Card ···· 4417 · €35 · ch_7K21QF.',
    kind: 'payment',
    market: 'Temple Bar',
    source: 'automatic',
    time: '07:00',
    day: 'Tuesday 18 August',
  },
  {
    who: 'Cathal Byrne',
    what: 'marked cherry tomatoes sold out at Marlay Park',
    kind: 'profile',
    market: 'Marlay Park',
    source: 'vendor app',
    time: '09:40',
    day: 'Saturday 15 August',
  },
  {
    who: 'MarketDay',
    what: 'cleared every sold-out flag',
    detail: 'Runs at midnight for every vendor trading the next day.',
    kind: 'profile',
    source: 'automatic',
    time: '00:00',
    day: 'Saturday 15 August',
  },
  {
    who: 'Tom McNally',
    what: 'added rhubarb & ginger jam to the product list',
    detail: 'Carried at Temple Bar and Marlay Park.',
    kind: 'profile',
    source: 'vendor app',
    time: '19:22',
    day: 'Friday 14 August',
  },
  {
    who: 'Bríd McNally',
    what: 'gave Lucia Marín access to Marlay Park',
    kind: 'staff',
    market: 'Marlay Park',
    source: 'vendor app',
    time: '12:05',
    day: 'Friday 14 August',
  },
  {
    who: 'MarketDay',
    what: 'took the Marlay Park fee',
    detail: 'Card ···· 4417 · €35 · ch_7J03PA.',
    kind: 'payment',
    market: 'Marlay Park',
    source: 'automatic',
    time: '07:00',
    day: 'Tuesday 11 August',
  },
  {
    who: 'Gráinne Doyle',
    what: 'approved the Howth Harbour pause for August',
    detail: 'Returns 6 September. No fee is charged while paused.',
    kind: 'membership',
    market: 'Howth',
    source: 'admin console',
    time: '15:30',
    day: 'Monday 10 August',
  },
  {
    who: 'Tom McNally',
    what: 'asked to pause Howth Harbour for August',
    kind: 'membership',
    market: 'Howth',
    source: 'vendor app',
    time: '08:14',
    day: 'Monday 10 August',
  },
  {
    who: 'Tom McNally',
    what: 'updated the farm address',
    detail: 'Eircode corrected to A41 KV62. Not shown publicly.',
    kind: 'profile',
    source: 'vendor app',
    time: '17:48',
    day: 'Friday 7 August',
  },
  {
    who: 'MarketDay',
    what: 'refunded the Temple Bar fee',
    detail: 'Market cancelled for weather · €35 · re_7H88DR.',
    kind: 'payment',
    market: 'Temple Bar',
    source: 'automatic',
    time: '11:12',
    day: 'Sunday 2 August',
  },
  {
    who: 'Áine Ryan',
    what: 'cancelled the Temple Bar market day',
    detail: 'Storm Bettina. Every vendor was refunded and emailed.',
    kind: 'membership',
    market: 'Temple Bar',
    source: 'admin console',
    time: '10:58',
    day: 'Sunday 2 August',
  },
  {
    who: 'Bríd McNally',
    what: 'removed Ruairí Behan from the team',
    detail: 'Left the business. Access ended the same day.',
    kind: 'staff',
    source: 'vendor app',
    time: '13:40',
    day: 'Thursday 30 July',
  },
  {
    who: 'Tom McNally',
    what: 'replaced the public liability certificate',
    detail: 'Expires February 2027. Shared with all 3 markets.',
    kind: 'document',
    source: 'vendor app',
    time: '09:05',
    day: 'Tuesday 28 July',
  },
  {
    who: 'Dara Kelly',
    what: 'corrected the trading name spelling',
    detail: 'From “McNally Family Farms” after the vendor wrote in.',
    kind: 'profile',
    source: 'support console',
    time: '14:15',
    day: 'Monday 27 July',
  },
  {
    who: 'Gráinne Doyle',
    what: 'set the Temple Bar stall fee to €35 a day',
    kind: 'payment',
    market: 'Temple Bar',
    source: 'admin console',
    time: '11:30',
    day: 'Monday 27 July',
  },
  {
    who: 'Tom McNally',
    what: 'added free-range eggs in two sizes',
    kind: 'profile',
    source: 'vendor app',
    time: '20:10',
    day: 'Sunday 26 July',
  },
  {
    who: 'Bríd McNally',
    what: 'gave Cathal Byrne access to Temple Bar',
    kind: 'staff',
    market: 'Temple Bar',
    source: 'vendor app',
    time: '10:02',
    day: 'Friday 24 July',
  },
  {
    who: 'MarketDay',
    what: 'took the Temple Bar fee',
    detail: 'Card ···· 4417 · €35 · ch_7H61WQ.',
    kind: 'payment',
    market: 'Temple Bar',
    source: 'automatic',
    time: '07:00',
    day: 'Tuesday 21 July',
  },
  {
    who: 'Tom McNally',
    what: 'uploaded the food safety certificate',
    detail: 'Expires January 2027.',
    kind: 'document',
    source: 'vendor app',
    time: '16:44',
    day: 'Monday 20 July',
  },
  {
    who: 'Áine Ryan',
    what: 'approved the Marlay Park membership',
    detail: 'Stall 12, Saturdays. First market day 6 July.',
    kind: 'membership',
    market: 'Marlay Park',
    source: 'admin console',
    time: '09:20',
    day: 'Wednesday 1 July',
  },
];

/** Short market label → the slug its chip links to. */
const MARKET_SLUGS: Record<string, string> = {
  'Temple Bar': 'temple-bar',
  'Marlay Park': 'marlay-park',
  Howth: 'howth-harbour',
  Douglas: 'douglas-village',
};

function toEvent(seed: Seed, index: number, total: number, slug: string): ActivityEvent {
  return {
    id: `act-${slug}-${index}`,
    who: seed.who,
    whoRole: ACTOR_ROLES[seed.who] ?? 'On the vendor record',
    what: seed.what,
    detail: seed.detail ?? '',
    kind: seed.kind,
    market: seed.market ?? '',
    marketSlug: seed.market ? (MARKET_SLUGS[seed.market] ?? null) : null,
    source: seed.source,
    time: seed.time,
    day: seed.day,
    // Seeds are written newest-first, so the index counts down from the top.
    sortKey: total - index,
  };
}

/**
 * A short log for any other vendor, so every Activity tab opens. Derived from
 * what the directory already knows about them rather than invented.
 */
function genericSeeds(slug: string): Seed[] {
  const vendor = VENDORS_FIXTURE.find((candidate) => candidate.slug === slug);
  if (!vendor) return [];
  const owner = vendor.staff[0] ?? 'The owner';
  return [
    ...(vendor.appliedLabel
      ? [
          {
            who: owner,
            what: `applied to ${vendor.appliedLabel.split(' · ')[0] ?? 'a market'}`,
            kind: 'membership' as const,
            source: 'vendor app' as const,
            time: '09:15',
            day: 'Today · Thursday 20 August',
          },
        ]
      : []),
    ...vendor.markets.map<Seed>((market, i) => ({
      who: 'MarketDay',
      what: `took the ${market} fee`,
      detail: 'Card on file · €35.',
      kind: 'payment',
      market,
      source: 'automatic',
      time: '07:00',
      day: i === 0 ? 'Tuesday 18 August' : 'Tuesday 11 August',
    })),
    {
      who: owner,
      what: 'changed the stall description',
      kind: 'profile',
      source: 'vendor app',
      time: '18:30',
      day: 'Monday 17 August',
    },
    {
      who: 'Áine Ryan',
      what: `approved the ${vendor.markets[0] ?? 'market'} membership`,
      kind: 'membership',
      market: vendor.markets[0],
      source: 'admin console',
      time: '09:20',
      day: 'Wednesday 1 July',
    },
  ];
}

/** The whole log for a vendor, newest first. */
function buildLog(slug: string): ActivityEvent[] | null {
  const vendor = VENDORS_FIXTURE.find((candidate) => candidate.slug === slug);
  if (!vendor) return null;
  const seeds = slug === MCNALLY_DETAIL.slug ? [...DESIGNED, ...OLDER] : genericSeeds(slug);
  return seeds.map((seed, i) => toEvent(seed, i, seeds.length, slug));
}

/** Who changed the most in the window, most first. */
function mostActive(events: readonly ActivityEvent[]): ActivityActor[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    // The platform is not a person; it does not compete for "most active".
    if (event.who === 'MarketDay') continue;
    counts.set(event.who, (counts.get(event.who) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({
      name,
      role: ACTOR_ROLES[name] ?? 'On the vendor record',
      count,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 3);
}

/** Built once per vendor and kept, so paging through it stays consistent. */
const LOGS = new Map<string, readonly ActivityEvent[]>();

/**
 * One page of a vendor's log, or `null` when no vendor has that slug. Exported
 * so tests can stand a synchronous repository on the very fixture the app
 * ships, rather than a second set of made-up entries.
 */
export function buildFeed(
  vendorSlug: string,
  filters: ActivityFilters,
  before?: number,
): ActivityFeed | null {
  const log = LOGS.get(vendorSlug) ?? buildLog(vendorSlug);
  if (!log) return null;
  LOGS.set(vendorSlug, log);

  const matching = log.filter((event) => {
    if (filters.kind !== null && event.kind !== filters.kind) return false;
    if (filters.actor !== null && event.who !== filters.actor) return false;
    return true;
  });
  // `before` is the oldest key on screen, so the next page starts under it.
  const remaining =
    before === undefined ? matching : matching.filter((event) => event.sortKey < before);
  const page = remaining.slice(0, PAGE_SIZE);

  // The rail counts the whole window, unfiltered — the chips narrow the feed,
  // not the facts about it.
  const window = log.slice(0, LAST_30_DAYS);
  return {
    events: page,
    hasMore: remaining.length > page.length,
    summary: {
      changes: window.length,
      byAdmins: window.filter(
        (event) => event.source === 'admin console' || event.source === 'support console',
      ).length,
      mostActive: mostActive(window),
      actors: [...new Set(log.map((event) => event.who))].sort((a, b) => a.localeCompare(b)),
    },
  };
}

@Injectable()
export class InMemoryActivityRepository extends ActivityRepository {
  override feed(
    vendorSlug: string,
    filters: ActivityFilters,
    before?: number,
  ): Observable<ActivityFeed> {
    const feed = buildFeed(vendorSlug, filters, before);
    if (!feed) {
      return throwError(() => new Error(`No vendor matches “${vendorSlug}”.`)).pipe(delay(300));
    }
    return of(feed).pipe(delay(300));
  }
}
