import { TestBed } from '@angular/core/testing';
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
  MarketDetail,
  MarketDraft,
  MarketRoster,
  MarketSchedulePatch,
  MarketSettingsPatch,
  MarketStatus,
  MarketSummary,
} from '../../core/models/market.model';
import { MarketsStore } from './markets-store';

/** The fixture directory, delivered synchronously. */
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

class FailingMarketRepository extends MarketRepository {
  override list(): Observable<readonly MarketSummary[]> {
    return throwError(() => new Error('The directory is unavailable.'));
  }
  override detail(): Observable<MarketDetail> {
    return throwError(() => new Error('nope'));
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

function storeWith(repo: typeof StubMarketRepository): MarketsStore {
  TestBed.configureTestingModule({
    providers: [MarketsStore, { provide: MarketRepository, useClass: repo }],
  });
  return TestBed.inject(MarketsStore);
}

describe('MarketsStore', () => {
  it('reports the directory totals independently of the filters', () => {
    const store = storeWith(StubMarketRepository);
    store.load();

    expect(store.items().length).toBe(7);
    expect(store.tradingTodayCount()).toBe(3);
    expect(store.draftCount()).toBe(1);
    expect(store.summary()).toBe('3 trading today · 1 draft waiting on organiser details');

    store.setFilters({ county: 'Cork' });
    expect(store.visible().length).toBe(4);
    // Totals are the whole directory, not the filtered slice.
    expect(store.items().length).toBe(7);
    expect(store.summary()).toBe('3 trading today · 1 draft waiting on organiser details');
  });

  it('derives its filter options from the data', () => {
    const store = storeWith(StubMarketRepository);
    store.load();

    expect(store.counties()).toEqual(['Cork', 'Dublin']);
    // In calendar order, and only days something actually trades on.
    expect(store.days()).toEqual(['Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
  });

  it('narrows by search, day and status', () => {
    const store = storeWith(StubMarketRepository);
    store.load();

    store.setFilters({ q: 'harbour' });
    expect(store.visible().map((m) => m.slug)).toEqual(['howth-harbour', 'kinsale-harbour']);

    store.resetFilters();
    store.setFilters({ day: 'Sunday' });
    // Howth trades Sat–Sun, so it matches on its second day.
    expect(store.visible().map((m) => m.slug)).toEqual(['howth-harbour', 'douglas-village']);

    store.resetFilters();
    store.setFilters({ status: MarketStatus.Draft });
    expect(store.visible().map((m) => m.slug)).toEqual(['bantry-friday']);
  });

  it('sorts by next market day, name and fill rate', () => {
    const store = storeWith(StubMarketRepository);
    store.load();

    // Three markets share 22 August, so the name breaks the tie; Bantry is furthest out.
    expect(
      store
        .visible()
        .slice(0, 3)
        .map((m) => m.slug),
    ).toEqual(['howth-harbour', 'marlay-park', 'temple-bar']);
    expect(store.visible().at(-1)?.slug).toBe('bantry-friday');

    store.setFilters({ sort: 'name' });
    expect(store.visible()[0]?.name).toBe('Bantry Friday Market');

    store.setFilters({ sort: 'stalls' });
    // Kinsale is the only market at 12/12; the draft has no stalls, so it sorts last.
    expect(store.visible()[0]?.slug).toBe('kinsale-harbour');
    expect(store.visible().at(-1)?.slug).toBe('bantry-friday');
  });

  it('distinguishes a filtered-empty result from an empty directory', () => {
    const store = storeWith(StubMarketRepository);
    store.load();

    expect(store.isEmpty()).toBe(false);
    expect(store.isFilteredEmpty()).toBe(false);

    store.setFilters({ q: 'no such market' });
    expect(store.visible()).toEqual([]);
    expect(store.isFilteredEmpty()).toBe(true);
    expect(store.isEmpty()).toBe(false);
  });

  it('surfaces a failed load as an error rather than an empty list', () => {
    const store = storeWith(FailingMarketRepository);
    store.load();

    expect(store.hasError()).toBe(true);
    expect(store.error()).toBe('The directory is unavailable.');
    expect(store.isEmpty()).toBe(false);
  });
});
