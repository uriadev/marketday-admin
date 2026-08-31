import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import {
  MarketApplication,
  MarketDetail,
  MarketDraft,
  MarketRoster,
  MarketSchedulePatch,
  MarketSettingsPatch,
  MarketStatus,
  MarketSummary,
  MarketVendor,
  MarketVendorStanding,
  Stall,
  StallFeeStatus,
  TradingDay,
  WeekVendor,
} from '../../models/market.model';
import { IRISH_COUNTIES } from '../../models/location.model';
import { VendorSummary } from '../../models/vendor.model';
import { MarketRepository } from '../ports/market-repository';
import {
  MARKETS_FIXTURE,
  MARKET_LABELS,
  MARKET_SCHEDULES,
  MARKET_SETTINGS,
  STALL_FEE,
} from './market-fixture';
import { VENDORS_FIXTURE } from './in-memory-vendor-repository';

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

/* ────────────────────────────────────────────────────────────────────────────
   The Vendors tab's roster. Built from the vendor directory rather than from
   the stall map: memberships are what the console actually knows, and the
   design's hand-written map for Temple Bar names vendors the directory puts at
   other markets. Where the two *do* overlap the map wins on pitch and fee, so
   a vendor never reads one way on the Overview and another way here.
──────────────────────────────────────────────────────────────────────────── */

/** Directory vendors who list this market among their memberships. */
function membersOf(market: MarketSummary): readonly VendorSummary[] {
  const label = MARKET_LABELS[market.slug];
  return label ? VENDORS_FIXTURE.filter((vendor) => vendor.markets.includes(label)) : [];
}

/** Directory vendors whose pending application names this market. */
function applicantsOf(market: MarketSummary): readonly VendorSummary[] {
  const label = MARKET_LABELS[market.slug];
  return label
    ? VENDORS_FIXTURE.filter((vendor) => vendor.appliedLabel === `${label} · applied`)
    : [];
}

/** Pitch first, then members still waiting on one, then paused members. */
function rosterOrder(a: MarketVendor, b: MarketVendor): number {
  const rank = (vendor: MarketVendor) =>
    vendor.standing === 'paused' ? 2 : vendor.stall === null ? 1 : 0;
  const byRank = rank(a) - rank(b);
  if (byRank !== 0) return byRank;
  if (a.stall && b.stall) return a.stall.localeCompare(b.stall);
  return a.name.localeCompare(b.name);
}

/**
 * The roster for one market, or `undefined` when no fixture market matches.
 * Exported so a spec asserts against the shipped fixture without waiting on
 * the adapter's `delay` — there is no zone.js here to fake.
 */
export function buildMarketRoster(slug: string): MarketRoster | undefined {
  const market = MARKETS_FIXTURE.find((candidate) => candidate.slug === slug);
  if (!market) return undefined;
  const stalls =
    slug === TEMPLE_BAR_DETAIL.slug ? TEMPLE_BAR_DETAIL.stalls : buildDetail(market).stalls;
  return buildRoster(market, stalls);
}

function buildRoster(market: MarketSummary, stalls: readonly Stall[]): MarketRoster {
  const label = MARKET_LABELS[market.slug] ?? market.name;
  const total = market.metrics?.stallsTotal ?? 0;

  const assigned = stalls.filter((stall) => stall.state !== 'free');
  const byVendor = new Map(assigned.map((stall) => [stall.vendor, stall] as const));
  const takenIds = new Set(assigned.map((stall) => stall.id));
  const spare = stallRefs(total).filter((id) => !takenIds.has(id));
  let nextSpare = 0;

  const vendors = membersOf(market)
    .map<MarketVendor>((vendor) => {
      const paused = vendor.standing === 'paused';
      const pitch = byVendor.get(vendor.name);
      let stall: string | null = null;
      if (!paused) {
        stall = pitch?.id ?? spare[nextSpare++] ?? null;
      }
      // "Fee unpaid ×1" is one market's fee, not every market's: the first
      // market they joined is the one the fixture charges it to.
      const owes =
        !paused &&
        (pitch?.state === 'unpaid' ||
          (vendor.standing === 'fee-unpaid' && vendor.markets[0] === label));
      const standing: MarketVendorStanding = paused ? 'paused' : owes ? 'fee-unpaid' : 'trading';
      const fee: StallFeeStatus = owes ? 'unpaid' : 'paid';
      return {
        id: `${market.slug}-${vendor.slug}`,
        slug: vendor.slug,
        name: vendor.name,
        meta: vendor.meta,
        stall,
        standing,
        standingLabel: paused ? 'Paused' : owes ? 'Fee unpaid' : 'Trading',
        fee,
        feeLabel: paused
          ? 'No fee while paused'
          : owes
            ? `€${STALL_FEE} due`
            : `€${STALL_FEE} paid`,
        staff: vendor.staff,
      };
    })
    .sort(rosterOrder);

  return {
    vendors,
    applications: applicantsOf(market).map<MarketApplication>((vendor) => ({
      id: `app-${market.slug}-${vendor.slug}`,
      vendorSlug: vendor.slug,
      name: vendor.name,
      meta: vendor.meta,
      staff: vendor.staff,
    })),
    feesOutstanding: vendors.filter((vendor) => vendor.fee === 'unpaid').length * STALL_FEE,
  };
}

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
    vendorCount: membersOf(market).length,
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

/** The trading days of a pattern, as directory labels. */
function patternDays(tradingDays: readonly number[]): TradingDay[] {
  return [...tradingDays]
    .sort((a, b) => a - b)
    .map((iso) => DAY_BY_ISO[iso - 1])
    .filter((day): day is TradingDay => !!day);
}

/**
 * "Bantry · Fridays 09:00–15:00" — the directory card's second line. Takes the
 * place separately from the pattern because the two have different owners: the
 * wizard writes both, the Schedule tab only ever rewrites the pattern half.
 */
function summariseWhen(place: string, pattern: MarketSchedulePatch): string {
  const days = patternDays(pattern.tradingDays);
  const when = days.length
    ? `${days.map((day) => `${day}s`).join(', ')} ${pattern.opensAt}–${pattern.closesAt}`
    : 'Schedule to be confirmed';
  return [place, when].filter(Boolean).join(' · ');
}

/** "Dublin 2 · Saturdays 09:00–14:30" → "Dublin 2" — the half a schedule edit keeps. */
function placeOf(when: string): string {
  return when.split(' · ')[0] ?? '';
}

/** The settings half of the wizard's payload, on its own. */
function draftSettings(draft: MarketDraft): MarketSettingsPatch {
  const {
    schedule: _schedule,
    duration: _duration,
    tradingDays: _tradingDays,
    opensAt: _opensAt,
    closesAt: _closesAt,
    bookingDeadlineHours: _bookingDeadlineHours,
    ...settings
  } = draft;
  return settings;
}

/** The pattern half of the wizard's payload, on its own. */
function draftSchedule(draft: MarketDraft): MarketSchedulePatch {
  return {
    schedule: draft.schedule,
    duration: draft.duration,
    tradingDays: [...draft.tradingDays],
    opensAt: draft.opensAt,
    closesAt: draft.closesAt,
    bookingDeadlineHours: draft.bookingDeadlineHours,
  };
}

/** A market with no settings recorded — only its row is known. */
function blankSettings(market: MarketSummary): MarketSettingsPatch {
  return {
    name: market.name,
    slug: market.slug,
    marketType: null,
    description: '',
    imageUrl: null,
    bannerUrl: null,
    stallCount: market.metrics?.stallsTotal ?? null,
    stallFeePerDay: STALL_FEE,
    reviewApplications: true,
    acceptsPreOrders: true,
    address: '',
    city: '',
    county: market.county || null,
    eircode: '',
    latitude: null,
    longitude: null,
    accessNotes: '',
    organiserName: '',
    organiserPhone: '',
  };
}

/** A market with no pattern recorded — the tab opens on the form's own defaults. */
const NO_SCHEDULE: MarketSchedulePatch = {
  schedule: '',
  duration: 0,
  tradingDays: [],
  opensAt: '09:00',
  closesAt: '15:00',
  bookingDeadlineHours: 48,
};

/** Turns the wizard's payload into the row the directory renders. */
function draftToSummary(draft: MarketDraft, status: MarketStatus): MarketSummary {
  const published = status === MarketStatus.Published;
  return {
    id: `mkt-${draft.slug}`,
    slug: draft.slug,
    name: draft.name,
    county: draft.county ?? '',
    when: summariseWhen(draft.city || draft.county || '', draft),
    days: patternDays(draft.tradingDays),
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

  /** Patterns edited this session, layered over {@link MARKET_SCHEDULES}. */
  private readonly schedules = new Map<string, MarketSchedulePatch>();

  /** Settings edited this session, layered over {@link MARKET_SETTINGS}. */
  private readonly editedSettings = new Map<string, MarketSettingsPatch>();

  /**
   * Rows whose `when` line a schedule edit has rewritten. The fixture markets
   * are module constants, so a saved pattern needs somewhere else to live —
   * without this the Schedule tab would say one thing and the card next to it
   * another, which is exactly the bug a fixture is supposed to rule out.
   */
  private readonly summaryOverrides = new Map<string, MarketSummary>();

  override list(): Observable<readonly MarketSummary[]> {
    const rows = [...MARKETS_FIXTURE, ...this.created.values()].map((market) =>
      this.rowFor(market),
    );
    return of(rows).pipe(delay(300));
  }

  override detail(slug: string): Observable<MarketDetail> {
    const market = this.find(slug);
    if (!market) {
      return throwError(() => new Error(`No market matches “${slug}”.`)).pipe(delay(300));
    }
    return of(this.detailFor(market)).pipe(delay(300));
  }

  override schedule(slug: string): Observable<MarketSchedulePatch> {
    if (!this.find(slug)) {
      return throwError(() => new Error(`No market matches “${slug}”.`)).pipe(delay(300));
    }
    return of(this.scheduleFor(slug)).pipe(delay(300));
  }

  override saveSchedule(slug: string, patch: MarketSchedulePatch): Observable<MarketSchedulePatch> {
    const market = this.find(slug);
    if (!market) {
      return throwError(() => new Error(`No market matches “${slug}”.`)).pipe(delay(300));
    }
    const stored: MarketSchedulePatch = { ...patch, tradingDays: [...patch.tradingDays] };
    this.schedules.set(slug, stored);
    // The pattern is half of what the card says; the place is the other half
    // and this save has no business touching it.
    this.summaryOverrides.set(slug, {
      ...market,
      when: summariseWhen(this.placeFor(market), stored),
      days: patternDays(stored.tradingDays),
    });
    return of(stored).pipe(delay(300));
  }

  override settings(slug: string): Observable<MarketSettingsPatch> {
    const market = this.find(slug);
    if (!market) {
      return throwError(() => new Error(`No market matches “${slug}”.`)).pipe(delay(300));
    }
    return of(this.settingsFor(market)).pipe(delay(300));
  }

  override saveSettings(slug: string, patch: MarketSettingsPatch): Observable<MarketSettingsPatch> {
    const market = this.find(slug);
    if (!market) {
      return throwError(() => new Error(`No market matches “${slug}”.`)).pipe(delay(300));
    }
    const stored: MarketSettingsPatch = { ...patch };
    this.editedSettings.set(slug, stored);
    // Name, county, town and stall count are all on the card too. The pattern
    // is the Schedule tab's to write, so it is read here and put back unchanged.
    this.summaryOverrides.set(slug, {
      ...market,
      name: stored.name,
      county: stored.county ?? market.county,
      when: summariseWhen(stored.city || stored.county || '', this.scheduleFor(slug)),
      metrics: market.metrics
        ? { ...market.metrics, stallsTotal: stored.stallCount ?? market.metrics.stallsTotal }
        : market.metrics,
    });
    return of(stored).pipe(delay(300));
  }

  override roster(slug: string): Observable<MarketRoster> {
    const market = this.find(slug);
    if (!market) {
      return throwError(() => new Error(`No market matches “${slug}”.`)).pipe(delay(300));
    }
    // A market the wizard published this session has no vendors yet.
    return of(
      buildMarketRoster(market.slug) ?? { vendors: [], applications: [], feesOutstanding: 0 },
    ).pipe(delay(300));
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
    // The draft carries its own pattern, so its Schedule tab opens filled in
    // and the row it just wrote is the current one.
    this.schedules.set(summary.slug, draftSchedule(draft));
    this.editedSettings.set(summary.slug, draftSettings(draft));
    this.summaryOverrides.delete(summary.slug);
    return of(summary).pipe(delay(300));
  }

  /** A fixture market, or one the wizard published this session — as it stands now. */
  private find(slug: string): MarketSummary | undefined {
    const market =
      MARKETS_FIXTURE.find((candidate) => candidate.slug === slug) ?? this.created.get(slug);
    return market && this.rowFor(market);
  }

  /** The market's pattern as it stands now. */
  private scheduleFor(slug: string): MarketSchedulePatch {
    return this.schedules.get(slug) ?? MARKET_SCHEDULES[slug] ?? NO_SCHEDULE;
  }

  /**
   * The market's settings as they stand now. A market the wizard created has an
   * entry from the moment it was saved, so only a slug with neither is blank.
   */
  private settingsFor(market: MarketSummary): MarketSettingsPatch {
    return (
      this.editedSettings.get(market.slug) ?? MARKET_SETTINGS[market.slug] ?? blankSettings(market)
    );
  }

  /** The town a `when` line leads with — from the settings, which own it. */
  private placeFor(market: MarketSummary): string {
    const settings = this.editedSettings.get(market.slug) ?? MARKET_SETTINGS[market.slug];
    return settings ? settings.city || settings.county || '' : placeOf(market.when);
  }

  /** The row with any schedule edit from this session applied. */
  private rowFor(market: MarketSummary): MarketSummary {
    return this.summaryOverrides.get(market.slug) ?? market;
  }

  /**
   * The management screen for a market. Once a pattern has been saved the
   * design's hand-written meta line is out of date, so the row's refreshed
   * `when` writes it instead — everything else about the screen is unchanged.
   */
  private detailFor(market: MarketSummary): MarketDetail {
    if (!this.summaryOverrides.has(market.slug)) {
      return market.slug === TEMPLE_BAR_DETAIL.slug ? TEMPLE_BAR_DETAIL : buildDetail(market);
    }
    const design = market.slug === TEMPLE_BAR_DETAIL.slug ? TEMPLE_BAR_OVERRIDES : {};
    return buildDetail(market, { ...design, meta: undefined });
  }
}
