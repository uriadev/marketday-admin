import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Observable, of, throwError } from 'rxjs';
import { MarketRepository } from '../../../core/api/ports/market-repository';
import { IRISH_COUNTIES } from '../../../core/models/location.model';
import {
  TEMPLE_BAR_DETAIL,
  buildMarketStallPlan,
} from '../../../core/api/in-memory/in-memory-market-repository';
import {
  MARKETS_FIXTURE,
  MARKET_SCHEDULES,
  MARKET_SETTINGS,
} from '../../../core/api/in-memory/market-fixture';
import {
  MarketDetail,
  MarketDraft,
  MarketRoster,
  MarketSchedulePatch,
  MarketSettingsPatch,
  MarketStallPlan,
  MarketSummary,
} from '../../../core/models/market.model';
import { ConsoleChrome } from '../../../layouts/console-layout/console-chrome';
import { Markets } from './markets';
import { MarketsStore } from '../markets-store';

class StubMarketRepository extends MarketRepository {
  override list(): Observable<readonly MarketSummary[]> {
    return of(MARKETS_FIXTURE);
  }
  override detail(): Observable<MarketDetail> {
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

describe('Markets', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Markets],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        ConsoleChrome,
        MarketsStore,
        { provide: MarketRepository, useClass: StubMarketRepository },
      ],
    }).compileComponents();
  });

  it('renders the directory as cards, with the design’s summary line', () => {
    const fixture = TestBed.createComponent(Markets);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('7 markets');
    expect(text).toContain('3 trading today · 1 draft waiting on organiser details');
    expect(text).toContain('Temple Bar Food Market');
    expect(text).toContain('Dublin 2 · Saturdays 09:00–14:30');
    expect(text).toContain('Showing 7 of 7');
  });

  it('shows metrics and a Manage link for a live market, and setup copy for a draft', () => {
    const fixture = TestBed.createComponent(Markets);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const manage = Array.from(host.querySelectorAll('a')).filter(
      (a) => a.textContent?.trim() === 'Manage',
    );
    // Six live markets, one draft — the draft offers setup instead.
    expect(manage.length).toBe(6);
    expect(manage[0]?.getAttribute('href')).toMatch(/^\/markets\//);
    expect(host.textContent).toContain('Awaiting organiser details and stall map');
  });

  it('narrows the grid when the URL carries a filter', () => {
    const fixture = TestBed.createComponent(Markets);
    fixture.componentRef.setInput('county', 'Cork');
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Showing 4 of 7');
    expect(text).not.toContain('Temple Bar Food Market');
    // The header still counts the whole directory.
    expect(text).toContain('7 markets');
  });

  it('offers a way out when the filters match nothing', () => {
    const fixture = TestBed.createComponent(Markets);
    fixture.componentRef.setInput('q', 'no such market');
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('No markets match those filters');
    expect(text).toContain('Clear filters');
  });
});
