import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Observable, of, throwError } from 'rxjs';
import { MarketRepository } from '../../core/api/ports/market-repository';
import { IRISH_COUNTIES } from '../../core/models/location.model';
import { TEMPLE_BAR_DETAIL } from '../../core/api/in-memory/in-memory-market-repository';
import {
  MARKETS_FIXTURE,
  MARKET_SCHEDULES,
  MARKET_SETTINGS,
} from '../../core/api/in-memory/market-fixture';
import {
  MarketDetail as MarketDetailModel,
  MarketDraft,
  MarketRoster,
  MarketSchedulePatch,
  MarketSettingsPatch,
  MarketSummary,
} from '../../core/models/market.model';
import { MarketDetail } from './market-detail';
import { MarketDetailFacade } from './market-detail-facade';

class StubMarketRepository extends MarketRepository {
  override list(): Observable<readonly MarketSummary[]> {
    return of(MARKETS_FIXTURE);
  }
  override detail(slug: string): Observable<MarketDetailModel> {
    if (slug !== 'temple-bar') {
      return throwError(() => new Error(`No market matches “${slug}”.`));
    }
    return of(TEMPLE_BAR_DETAIL);
  }
  override roster(): Observable<MarketRoster> {
    return of({ vendors: [], applications: [], feesOutstanding: 0 });
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

describe('MarketDetail', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MarketDetail],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        MarketDetailFacade,
        { provide: MarketRepository, useClass: StubMarketRepository },
      ],
    }).compileComponents();
  });

  it('loads the market named by the route and renders its identity strip', () => {
    const fixture = TestBed.createComponent(MarketDetail);
    fixture.componentRef.setInput('slug', 'temple-bar');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const text = host.textContent ?? '';
    expect(text).toContain('Temple Bar Food Market');
    expect(text).toContain('Trading');
    expect(text).toContain('Meeting House Square, Dublin 2');
    expect(text).toContain('next market day Sat 22 August');
  });

  it('offers a breadcrumb and a back arrow to the directory', () => {
    const fixture = TestBed.createComponent(MarketDetail);
    fixture.componentRef.setInput('slug', 'temple-bar');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const toMarkets = Array.from(host.querySelectorAll('a[href="/markets"]'));
    // The back arrow and the "Markets" crumb.
    expect(toMarkets.length).toBe(2);
    expect(toMarkets.some((a) => a.textContent?.trim() === 'Markets')).toBe(true);
  });

  it('shows the tab bar with only Stalls still to come', () => {
    const fixture = TestBed.createComponent(MarketDetail);
    fixture.componentRef.setInput('slug', 'temple-bar');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const tabs = Array.from(host.querySelectorAll('[mat-tab-link]'));
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual([
      'Overview',
      'Stalls',
      'Vendors9',
      'Schedule',
      'Settings',
    ]);
    expect(tabs.filter((tab) => tab.getAttribute('aria-disabled') === 'true').length).toBe(1);
  });

  it('explains a market that does not exist instead of rendering an empty shell', () => {
    const fixture = TestBed.createComponent(MarketDetail);
    fixture.componentRef.setInput('slug', 'not-a-market');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('No market matches “not-a-market”.');
    expect(host.querySelector('[mat-tab-link]')).toBeNull();
  });
});
