import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Observable, of, throwError } from 'rxjs';
import { MarketRepository } from '../../../core/api/ports/market-repository';
import {
  buildMarketRoster,
  buildMarketStallPlan,
} from '../../../core/api/in-memory/in-memory-market-repository';
import {
  MARKETS_FIXTURE,
  MARKET_SCHEDULES,
  MARKET_SETTINGS,
} from '../../../core/api/in-memory/market-fixture';
import { IRISH_COUNTIES } from '../../../core/models/location.model';
import {
  MarketDetail,
  MarketDraft,
  MarketRoster,
  MarketVendor,
  MarketSchedulePatch,
  MarketSettingsPatch,
  MarketStallPlan,
  MarketSummary,
} from '../../../core/models/market.model';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { VendorRepository } from '../../../core/api/ports/vendor-repository';
import {
  VendorDirectoryPage,
  VendorInvite,
  VendorInviteSummary,
  VendorProfile,
  VendorProfilePatch,
  VendorSummary,
} from '../../../core/models/vendor.model';
import { VendorDetail as VendorDetailModel } from '../../../core/models/vendor.model';
import { MarketDetailFacade } from '../market-detail-facade';
import { MarketVendors } from './market-vendors';
import { MarketVendorsStore } from '../market-vendors-store';

/** A vendor not on Temple Bar's roster, as the picker hands one back. */
const OUTSIDER: VendorSummary = {
  id: 'vnd-outsider',
  slug: 'nine-bean-rows',
  name: 'Nine Bean Rows',
  meta: 'Bakery · since 2019',
  markets: [],
  appliedLabel: null,
  staff: [],
  staffCount: 1,
  isActive: true,
  standing: 'trading',
  standingLabel: 'Trading',
};

/** Records the membership writes; nothing else on this port is reached here. */
class StubVendorRepository extends VendorRepository {
  readonly added: [string, string][] = [];
  readonly removed: [string, string][] = [];
  /** Set to make the next write fail, the way a refusal arrives. */
  refuse: string | null = null;

  override addToMarket(vendorSlug: string, marketSlug: string): Observable<void> {
    if (this.refuse) return throwError(() => new Error(this.refuse!));
    this.added.push([vendorSlug, marketSlug]);
    return of(undefined);
  }

  override removeFromMarket(vendorSlug: string, marketSlug: string): Observable<void> {
    if (this.refuse) return throwError(() => new Error(this.refuse!));
    this.removed.push([vendorSlug, marketSlug]);
    return of(undefined);
  }

  override list(): Observable<VendorDirectoryPage> {
    return of({
      items: [OUTSIDER],
      total: 1,
      facets: { markets: [], applicationCount: 0, vendorCount: 1 },
    });
  }
  override detail(): Observable<VendorDetailModel> {
    return of({} as VendorDetailModel);
  }
  override profile(): Observable<VendorProfile> {
    return of({} as VendorProfile);
  }
  override saveProfile(_slug: string, _patch: VendorProfilePatch): Observable<VendorProfile> {
    return of({} as VendorProfile);
  }
  override setActive(): Observable<VendorSummary> {
    return of(OUTSIDER);
  }
  override inviteSummary(): Observable<VendorInviteSummary> {
    return of({} as VendorInviteSummary);
  }
  override invite(_invite: VendorInvite): Observable<VendorSummary> {
    return of(OUTSIDER);
  }
}

/** Stands in for the picker, so the screen's own write path is what is tested. */
function pick<T>(value: T | undefined): void {
  vi.spyOn(MatDialog.prototype, 'open').mockReturnValue({
    afterClosed: () => of(value),
  } as MatDialogRef<unknown, T>);
}

/**
 * The shipped fixture, answered synchronously — the specs assert on Temple
 * Bar's real roster, and nothing here waits on a timer (there is no zone.js).
 */
class StubMarketRepository extends MarketRepository {
  override roster(slug: string): Observable<MarketRoster> {
    const roster = buildMarketRoster(slug);
    if (!roster) return throwError(() => new Error(`No market matches “${slug}”.`));
    return of(roster);
  }
  override list(): Observable<readonly MarketSummary[]> {
    return of(MARKETS_FIXTURE);
  }
  override detail(): Observable<MarketDetail> {
    return of({} as MarketDetail);
  }
  override schedule(slug: string): Observable<MarketSchedulePatch> {
    return of(MARKET_SCHEDULES[slug]);
  }
  override saveSchedule(
    _slug: string,
    patch: MarketSchedulePatch,
  ): Observable<MarketSchedulePatch> {
    return of(patch);
  }
  override settings(slug: string): Observable<MarketSettingsPatch> {
    return of(MARKET_SETTINGS[slug]);
  }
  override saveSettings(
    _slug: string,
    patch: MarketSettingsPatch,
  ): Observable<MarketSettingsPatch> {
    return of(patch);
  }
  override stallPlan(slug: string): Observable<MarketStallPlan> {
    return of(buildMarketStallPlan(slug) ?? []);
  }
  override saveStallPlan(_slug: string, plan: MarketStallPlan): Observable<MarketStallPlan> {
    return of(plan);
  }
  override counties(): Observable<readonly string[]> {
    return of(IRISH_COUNTIES);
  }
  /** Not a screen this stub stands in for. */
  override draft(slug: string): Observable<MarketDraft> {
    return throwError(() => new Error(`No market matches “${slug}”.`));
  }
  override saveDraft(draft: MarketDraft): Observable<MarketSummary> {
    return of({ ...MARKETS_FIXTURE[0]!, slug: draft.slug, name: draft.name });
  }
  override publish(draft: MarketDraft): Observable<MarketSummary> {
    return of({ ...MARKETS_FIXTURE[0]!, slug: draft.slug, name: draft.name });
  }
}

function open(slug = 'temple-bar') {
  const fixture = TestBed.createComponent(MarketVendors);
  fixture.componentRef.setInput('slug', slug);
  fixture.detectChanges();
  return fixture;
}

function text(fixture: { nativeElement: unknown }): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function buttons(fixture: { nativeElement: unknown }): HTMLButtonElement[] {
  return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
}

function click(fixture: { nativeElement: unknown; detectChanges(): void }, label: string): void {
  const button = buttons(fixture).find((candidate) => candidate.textContent?.includes(label));
  if (!button) throw new Error(`No button labelled \u201c${label}\u201d.`);
  button.click();
  fixture.detectChanges();
}

/**
 * The row menu lives in a `mat-menu` template, so its items only exist once it
 * is opened — more machinery than this is worth. The command behind the item
 * is what the tests are about, so they call it the way the menu does.
 */
function remove(
  fixture: { componentInstance: unknown; detectChanges(): void },
  vendor: MarketVendor,
): void {
  (fixture.componentInstance as { removeVendor(v: MarketVendor): void }).removeVendor(vendor);
  fixture.detectChanges();
}

function rowNames(fixture: { nativeElement: unknown }): string[] {
  const host = fixture.nativeElement as HTMLElement;
  return Array.from(host.querySelectorAll('.vendor-name')).map(
    (cell) => cell.textContent?.trim() ?? '',
  );
}

describe('MarketVendors', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MarketVendors],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        MarketVendorsStore,
        MarketDetailFacade,
        { provide: MarketRepository, useClass: StubMarketRepository },
        { provide: VendorRepository, useClass: StubVendorRepository },
      ],
    }).compileComponents();
  });

  it('lists the market’s members, pitch first and paused members last', () => {
    const fixture = open();

    expect(rowNames(fixture)).toEqual([
      'Sheridans Cheese',
      'Ballymaloe Relish',
      'McNally Family Farm',
      'Kish Fish',
      'Arun Spice Kitchen',
      'Coolea Cheese Co.',
      'Ballyhoura Mushrooms',
      'Highbank Orchards',
      'The Chocolate Garden',
    ]);
    expect(text(fixture)).toContain('9 vendors at this market');
  });

  it('summarises the roster with numbers it can account for', () => {
    const fixture = open();

    // Eight trading, one paused, one unpaid fee, and Nine Bean Rows waiting.
    expect(text(fixture)).toContain(
      '8 trading · 1 paused · €35 to collect · 1 application waiting',
    );
  });

  it('agrees with the Overview’s stall map about a pitch and a fee', () => {
    const fixture = open();
    const host = fixture.nativeElement as HTMLElement;
    const row = Array.from(host.querySelectorAll('tr')).find((tr) =>
      tr.textContent?.includes('Ballymaloe Relish'),
    );

    // The design's map puts Ballymaloe on A3 with the fee unpaid.
    expect(row?.textContent).toContain('A3');
    expect(row?.textContent).toContain('€35 due');
    expect(row?.textContent).toContain('Fee unpaid');
  });

  it('shows the application waiting on a decision above the roster', () => {
    const fixture = open();
    const host = fixture.nativeElement as HTMLElement;
    const banner = host.querySelector('.applications');

    expect(banner?.textContent).toContain('1 waiting on your decision');
    expect(banner?.textContent).toContain('Nine Bean Rows');
    // Reviewing an application is design 1d, which does not exist yet.
    expect(banner?.querySelector('button[disabled]')).not.toBeNull();
  });

  it('narrows the roster with the toggles, together rather than separately', () => {
    const fixture = open();
    const store = TestBed.inject(MarketVendorsStore);

    store.setFilters({ feeUnpaid: true });
    fixture.detectChanges();
    expect(rowNames(fixture)).toEqual(['Ballymaloe Relish']);

    store.resetFilters();
    store.setFilters({ paused: true });
    fixture.detectChanges();
    expect(rowNames(fixture)).toEqual(['The Chocolate Garden']);

    // A paused member owes nothing, so the two together match nobody.
    store.setFilters({ feeUnpaid: true });
    fixture.detectChanges();
    expect(text(fixture)).toContain('No vendors match those filters');
  });

  it('searches names, trades and staff', () => {
    const fixture = open();
    const store = TestBed.inject(MarketVendorsStore);

    store.setFilters({ q: 'cheese' });
    fixture.detectChanges();
    expect(rowNames(fixture)).toEqual(['Sheridans Cheese', 'Coolea Cheese Co.']);

    store.setFilters({ q: 'Tom McNally' });
    fixture.detectChanges();
    expect(rowNames(fixture)).toEqual(['McNally Family Farm']);
  });

  it('marks members with no pitch left, and counts them', () => {
    // Kinsale is full: every pitch is taken before its members are seated.
    const fixture = open('kinsale-harbour');
    const store = TestBed.inject(MarketVendorsStore);

    expect(store.noStallCount()).toBeGreaterThan(0);
    expect(text(fixture)).toContain('Not assigned');

    store.setFilters({ noStall: true });
    fixture.detectChanges();
    expect(rowNames(fixture).length).toBe(store.noStallCount());
  });

  it('explains a market that does not exist instead of rendering an empty table', () => {
    const fixture = open('not-a-market');

    expect(text(fixture)).toContain('No market matches “not-a-market”.');
    expect((fixture.nativeElement as HTMLElement).querySelector('table')).toBeNull();
  });

  it('carries this market into "Invite vendor", so it is pre-picked there', () => {
    const fixture = open('temple-bar');
    const host = fixture.nativeElement as HTMLElement;
    const invite = host.querySelector('a[href^="/vendors/invite"]');

    expect(invite?.getAttribute('href')).toBe('/vendors/invite?market=temple-bar');
  });

  it('offers adding a vendor that already exists, beside inviting a new one', () => {
    const fixture = open('temple-bar');
    const labels = buttons(fixture).map((button) => button.textContent ?? '');

    expect(labels.some((label) => label.includes('Add existing vendor'))).toBe(true);
  });

  it('adds the picked vendor to this market, and re-reads both screens', () => {
    const fixture = open('temple-bar');
    const vendors = TestBed.inject(VendorRepository) as StubVendorRepository;
    const roster = vi.spyOn(TestBed.inject(MarketVendorsStore), 'load');
    // The tab badge counts members off the shell's read, not the roster's.
    const shell = vi.spyOn(TestBed.inject(MarketDetailFacade), 'load');
    pick(OUTSIDER);

    click(fixture, 'Add existing vendor');

    expect(vendors.added).toEqual([['nine-bean-rows', 'temple-bar']]);
    expect(roster).toHaveBeenCalled();
    expect(shell).toHaveBeenCalledWith('temple-bar');
  });

  it('writes nothing when the picker is dismissed', () => {
    const fixture = open('temple-bar');
    const vendors = TestBed.inject(VendorRepository) as StubVendorRepository;
    pick(undefined);

    click(fixture, 'Add existing vendor');

    expect(vendors.added).toEqual([]);
  });

  it('leaves the roster alone when the write is refused', () => {
    const fixture = open('temple-bar');
    const vendors = TestBed.inject(VendorRepository) as StubVendorRepository;
    vendors.refuse = 'Forbidden';
    const roster = vi.spyOn(TestBed.inject(MarketVendorsStore), 'load');
    pick(OUTSIDER);

    click(fixture, 'Add existing vendor');

    expect(vendors.added).toEqual([]);
    expect(roster).not.toHaveBeenCalled();
  });

  it('removes a member from this market once the removal is confirmed', () => {
    const fixture = open('temple-bar');
    const vendors = TestBed.inject(VendorRepository) as StubVendorRepository;
    const member = TestBed.inject(MarketVendorsStore).items()[0]!;
    pick(true);

    remove(fixture, member);

    expect(vendors.removed).toEqual([[member.slug, 'temple-bar']]);
  });

  it('keeps the member when the removal is not confirmed', () => {
    const fixture = open('temple-bar');
    const vendors = TestBed.inject(VendorRepository) as StubVendorRepository;
    const member = TestBed.inject(MarketVendorsStore).items()[0]!;
    pick(false);

    remove(fixture, member);

    expect(vendors.removed).toEqual([]);
  });
});
