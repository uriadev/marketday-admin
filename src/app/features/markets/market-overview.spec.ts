import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Observable, of } from 'rxjs';
import { MarketRepository } from '../../core/api/ports/market-repository';
import { IRISH_COUNTIES } from '../../core/models/location.model';
import {
  MARKETS_FIXTURE,
  TEMPLE_BAR_DETAIL,
} from '../../core/api/in-memory/in-memory-market-repository';
import { MarketDetail, MarketDraft, MarketSummary } from '../../core/models/market.model';
import { MarketDetailFacade } from './market-detail-facade';
import { MarketOverview } from './market-overview';

class StubMarketRepository extends MarketRepository {
  override list(): Observable<readonly MarketSummary[]> {
    return of(MARKETS_FIXTURE);
  }
  override detail(slug: string): Observable<MarketDetail> {
    const market = MARKETS_FIXTURE.find((candidate) => candidate.slug === slug);
    if (!market) throw new Error(`No fixture for ${slug}`);
    return of(TEMPLE_BAR_DETAIL);
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

describe('MarketOverview', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MarketOverview],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        MarketDetailFacade,
        { provide: MarketRepository, useClass: StubMarketRepository },
      ],
    }).compileComponents();
  });

  it('renders the day’s numbers, the stall map and this week’s vendors', () => {
    TestBed.inject(MarketDetailFacade).load('temple-bar');

    const fixture = TestBed.createComponent(MarketOverview);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Stalls filled');
    expect(text).toContain('18');
    expect(text).toContain('/20');
    expect(text).toContain('€630');
    expect(text).toContain('Stall map · Sat 22 August');
    expect(text).toContain('Two pitches free on the north row.');
    expect(text).toContain('Sheridans Cheese');
    expect(text).toContain('Fee unpaid');
    expect(text).toContain('See all 18');
  });

  it('renders the rail: decisions, checklist, activity and the cancel card', () => {
    TestBed.inject(MarketDetailFacade).load('temple-bar');

    const fixture = TestBed.createComponent(MarketOverview);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const text = host.textContent ?? '';
    expect(text).toContain('2 vendors want stall A5');
    expect(text).toContain('Rain forecast, 11:00');
    expect(text).toContain('Stall assignments published');
    expect(text).toContain('Coolea Cheese Co. paid €35 · 2h ago');
    expect(text).toContain('Cancel this market day');

    // Ten pitches, two of them free — the design's map, unchanged.
    expect(host.querySelectorAll('.stall').length).toBe(10);
    expect(host.querySelectorAll('.stall--free').length).toBe(2);
    expect(host.querySelectorAll('.stall--unpaid').length).toBe(1);
  });
});
