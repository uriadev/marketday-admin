import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Observable, of, throwError } from 'rxjs';
import { MarketRepository } from '../../core/api/ports/market-repository';
import { buildMarketRoster } from '../../core/api/in-memory/in-memory-market-repository';
import {
  MARKETS_FIXTURE,
  MARKET_SCHEDULES,
  MARKET_SETTINGS,
} from '../../core/api/in-memory/market-fixture';
import { IRISH_COUNTIES } from '../../core/models/location.model';
import {
  MarketDetail,
  MarketDraft,
  MarketRoster,
  MarketSchedulePatch,
  MarketSettingsPatch,
  MarketSummary,
} from '../../core/models/market.model';
import { MarketVendors } from './market-vendors';
import { MarketVendorsStore } from './market-vendors-store';

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
  override counties(): Observable<readonly string[]> {
    return of(IRISH_COUNTIES);
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
        { provide: MarketRepository, useClass: StubMarketRepository },
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
});
