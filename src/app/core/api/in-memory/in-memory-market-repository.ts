import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import {
  MarketDetail,
  MarketDraft,
  MarketStatus,
  MarketSummary,
  Stall,
  TradingDay,
  WeekVendor,
} from '../../models/market.model';
import { IRISH_COUNTIES } from '../../models/location.model';
import { MarketRepository } from '../ports/market-repository';

/** Stall fee per vendor per market day, in euro. */
const STALL_FEE = 35;

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "2026-08-22" → "Sat 22 August". Built by hand so fixtures never shift with ICU data. */
function marketDayLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return `${DAY_NAMES[date.getUTCDay()]} ${date.getUTCDate()} ${MONTH_NAMES[date.getUTCMonth()]}`;
}

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

/** Pitch references, five to a row: A1–A5, B1–B5, C1–C5… */
function stallRefs(total: number): string[] {
  const rows = 'ABCDEF';
  return Array.from({ length: total }, (_, i) => `${rows[Math.floor(i / 5)]}${(i % 5) + 1}`);
}

/** Vendors the fixture drops into any market that isn't hand-written below. */
const VENDOR_POOL = [
  'Sheridans Cheese',
  'Toonsbridge Dairy',
  'Ballymaloe Relish',
  'Wild Irish Foragers',
  'Baked in Bray',
  'Kish Fish',
  'Ballylickey Bakehouse',
  'Coolea Cheese Co.',
  'Sliabh Luachra Honey',
  'Blackwater Bakehouse',
  'McNally Family Farm',
  'Nine Bean Rows',
  'Cork Coffee Roasters',
  'Gubbeen Farmhouse',
];

const TRADE = [
  'preserves',
  'cheese',
  'bakery',
  'foraged greens',
  'fish',
  'honey',
  'coffee',
  'charcuterie',
];

/** The design's own stall map for Temple Bar (design 1g). */
const TEMPLE_BAR_STALLS: readonly Stall[] = [
  { id: 'A1', vendor: 'Sheridans Cheese', state: 'confirmed' },
  { id: 'A2', vendor: 'Toonsbridge Dairy', state: 'confirmed' },
  { id: 'A3', vendor: 'Ballymaloe Relish', state: 'unpaid' },
  { id: 'A4', vendor: 'Wild Irish Foragers', state: 'confirmed' },
  { id: 'A5', vendor: 'Free', state: 'free' },
  { id: 'B1', vendor: 'Baked in Bray', state: 'confirmed' },
  { id: 'B2', vendor: 'Kish Fish', state: 'confirmed' },
  { id: 'B3', vendor: 'Ballylickey Bakehouse', state: 'confirmed' },
  { id: 'B4', vendor: 'Free', state: 'free' },
  { id: 'B5', vendor: 'Coolea Cheese Co.', state: 'confirmed' },
];

const TEMPLE_BAR_WEEK_VENDORS: readonly WeekVendor[] = [
  {
    id: 'ballymaloe-relish',
    name: 'Ballymaloe Relish',
    meta: 'Stall A3 · preserves',
    fee: 'unpaid',
  },
  { id: 'kish-fish', name: 'Kish Fish', meta: 'Stall B2 · fish · needs power', fee: 'paid' },
  { id: 'sheridans-cheese', name: 'Sheridans Cheese', meta: 'Stall A1 · cheese', fee: 'paid' },
];

/** Anything the builder can't derive from a {@link MarketSummary}. */
interface DetailOverrides {
  meta?: string;
  stalls?: readonly Stall[];
  stallMapHint?: string;
  weekVendors?: readonly WeekVendor[];
  decisions?: MarketDetail['decisions'];
  checklist?: MarketDetail['checklist'];
  activity?: MarketDetail['activity'];
}

/**
 * Builds a management screen for any market in the directory, so every
 * "Manage" button leads somewhere. Temple Bar passes the design's own copy in
 * as overrides; the rest get a plausible map derived from their metrics.
 */
function buildDetail(market: MarketSummary, overrides: DetailOverrides = {}): MarketDetail {
  const metrics = market.metrics ?? {
    stallsFilled: 0,
    stallsTotal: 0,
    preorders: 0,
    enquiries: 0,
  };
  const dayLabel = marketDayLabel(market.nextMarketDay);

  const stalls =
    overrides.stalls ??
    stallRefs(metrics.stallsTotal).map<Stall>((id, i) => {
      if (i >= metrics.stallsFilled) {
        return { id, vendor: 'Free', state: 'free' };
      }
      // One unpaid pitch per market, so the "Fee unpaid" state is always visible.
      const vendor = VENDOR_POOL[i % VENDOR_POOL.length] ?? 'Vendor';
      return { id, vendor, state: i === 2 ? 'unpaid' : 'confirmed' };
    });

  const taken = stalls.filter((stall) => stall.state !== 'free');
  const weekVendors =
    overrides.weekVendors ??
    taken.slice(0, 3).map<WeekVendor>((stall, i) => ({
      id: `${market.slug}-${stall.id.toLowerCase()}`,
      name: stall.vendor,
      meta: `Stall ${stall.id} · ${TRADE[i % TRADE.length]}`,
      fee: stall.state === 'unpaid' ? 'unpaid' : 'paid',
    }));

  const freePitches = stalls.length - taken.length;

  return {
    id: market.id,
    slug: market.slug,
    name: market.name,
    status: market.status,
    tradingToday: market.tradingToday,
    badgeLabel: market.badgeLabel,
    meta: overrides.meta ?? `${market.when} · next market day ${dayLabel}`,
    marketDayLabel: dayLabel,
    vendorCount: metrics.stallsFilled,
    stats: [
      {
        label: 'Stalls filled',
        value: `${metrics.stallsFilled}`,
        suffix: `/${metrics.stallsTotal}`,
        tone: 'neutral',
      },
      { label: 'Pre-orders', value: `${metrics.preorders}`, tone: 'neutral' },
      { label: 'Fees due', value: `€${metrics.stallsFilled * STALL_FEE}`, tone: 'neutral' },
      {
        label: 'Open enquiries',
        value: `${metrics.enquiries}`,
        tone: metrics.enquiries > 0 ? 'alert' : 'neutral',
      },
    ],
    stalls,
    stallMapHint:
      overrides.stallMapHint ??
      (freePitches === 0
        ? 'Every pitch is assigned. Drag a vendor to move them.'
        : `${freePitches} ${freePitches === 1 ? 'pitch is' : 'pitches are'} free. Drag a vendor to move them.`),
    weekVendors,
    decisions: overrides.decisions ?? [],
    checklist: overrides.checklist ?? [
      { id: 'assignments', label: 'Stall assignments published', done: true },
      { id: 'waste', label: 'Waste collection booked', done: false },
      { id: 'fees', label: 'Collect outstanding fees', done: false },
      { id: 'insurance', label: 'Confirm insurance certs', done: false },
    ],
    activity: overrides.activity ?? [
      { id: 'act-1', text: `Stall map published for ${dayLabel} · 2h ago` },
      { id: 'act-2', text: 'Áine updated the market description · yesterday' },
    ],
  };
}

const TEMPLE_BAR_OVERRIDES: DetailOverrides = {
  meta: 'Meeting House Square, Dublin 2 · Saturdays 09:00–14:30 · next market day Sat 22 August',
  stalls: TEMPLE_BAR_STALLS,
  stallMapHint: 'Two pitches free on the north row. Drag a vendor to move them.',
  weekVendors: TEMPLE_BAR_WEEK_VENDORS,
  decisions: [
    {
      id: 'stall-a5',
      title: '2 vendors want stall A5',
      body: 'Sourdough Kevin and Nine Bean Rows both applied for the free pitch.',
      primaryAction: 'Review',
      secondaryAction: 'Later',
    },
    {
      id: 'rain',
      title: 'Rain forecast, 11:00',
      body: 'Post a notice on the market page and text all 18 vendors.',
      primaryAction: null,
      secondaryAction: 'Post a notice',
    },
  ],
  checklist: [
    { id: 'assignments', label: 'Stall assignments published', done: true },
    { id: 'waste', label: 'Waste collection booked', done: true },
    { id: 'fees', label: 'Collect 3 outstanding fees', done: false },
    { id: 'insurance', label: 'Confirm two insurance certs', done: false },
  ],
  activity: [
    { id: 'act-fee', text: 'Coolea Cheese Co. paid €35 · 2h ago' },
    { id: 'act-move', text: 'Áine moved Kish Fish to B2 · yesterday' },
    { id: 'act-cancel', text: 'Baked in Bray cancelled 29 August · Tuesday' },
  ],
};

/** The Temple Bar management screen, exactly as design 1g draws it. */
export const TEMPLE_BAR_DETAIL: MarketDetail = buildDetail(
  MARKETS_FIXTURE[0]!,
  TEMPLE_BAR_OVERRIDES,
);

/** ISO weekday (1 = Monday) → the label the directory's Day filter uses. */
const DAY_BY_ISO: readonly TradingDay[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

/** The trading days of a draft, as directory labels. */
function draftDays(draft: MarketDraft): TradingDay[] {
  return [...draft.tradingDays]
    .sort((a, b) => a - b)
    .map((iso) => DAY_BY_ISO[iso - 1])
    .filter((day): day is TradingDay => !!day);
}

/** "Bantry · Fridays 09:00–15:00" — the directory card's second line. */
function summariseWhen(draft: MarketDraft): string {
  const days = draftDays(draft);
  const pattern = days.length
    ? `${days.map((day) => `${day}s`).join(', ')} ${draft.opensAt}–${draft.closesAt}`
    : 'Schedule to be confirmed';
  return [draft.city || draft.county, pattern].filter(Boolean).join(' · ');
}

/** Turns the wizard's payload into the row the directory renders. */
function draftToSummary(draft: MarketDraft, status: MarketStatus): MarketSummary {
  const published = status === MarketStatus.Published;
  return {
    id: `mkt-${draft.slug}`,
    slug: draft.slug,
    name: draft.name,
    county: draft.county ?? '',
    when: summariseWhen(draft),
    days: draftDays(draft),
    status,
    tradingToday: false,
    badgeLabel: published ? 'Not trading yet' : 'Draft',
    // A brand-new market has no occurrence yet, so it sorts after the known ones.
    nextMarketDay: '9999-12-31',
    metrics: published
      ? { stallsFilled: 0, stallsTotal: draft.stallCount ?? 0, preorders: 0, enquiries: 0 }
      : null,
  };
}

@Injectable()
export class InMemoryMarketRepository extends MarketRepository {
  /**
   * Markets the wizard created this session, keyed by slug so re-saving a draft
   * updates it rather than adding a second row. The binding in
   * `api.providers.ts` is a singleton, so a market published in the wizard is
   * there when the directory reloads — which is what makes the flow real.
   */
  private readonly created = new Map<string, MarketSummary>();

  override list(): Observable<readonly MarketSummary[]> {
    return of([...MARKETS_FIXTURE, ...this.created.values()]).pipe(delay(300));
  }

  override detail(slug: string): Observable<MarketDetail> {
    const market =
      MARKETS_FIXTURE.find((candidate) => candidate.slug === slug) ?? this.created.get(slug);
    if (!market) {
      return throwError(() => new Error(`No market matches “${slug}”.`)).pipe(delay(300));
    }
    const detail = market.slug === TEMPLE_BAR_DETAIL.slug ? TEMPLE_BAR_DETAIL : buildDetail(market);
    return of(detail).pipe(delay(300));
  }

  override counties(): Observable<readonly string[]> {
    return of(IRISH_COUNTIES).pipe(delay(120));
  }

  override saveDraft(draft: MarketDraft): Observable<MarketSummary> {
    return this.store(draft, MarketStatus.Draft);
  }

  override publish(draft: MarketDraft): Observable<MarketSummary> {
    return this.store(draft, MarketStatus.Published);
  }

  private store(draft: MarketDraft, status: MarketStatus): Observable<MarketSummary> {
    if (!draft.slug) {
      return throwError(
        () => new Error('A market needs a public URL before it can be saved.'),
      ).pipe(delay(300));
    }
    const summary = draftToSummary(draft, status);
    this.created.set(summary.slug, summary);
    return of(summary).pipe(delay(300));
  }
}
