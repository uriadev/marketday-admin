import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { MarketRepository } from '../../core/api/ports/market-repository';
import {
  buildMarketRoster,
  buildMarketStallPlan,
} from '../../core/api/in-memory/in-memory-market-repository';
import { MARKETS_FIXTURE } from '../../core/api/in-memory/market-fixture';
import { IRISH_COUNTIES } from '../../core/models/location.model';
import {
  MarketDetail,
  MarketDraft,
  MarketRoster,
  MarketSchedulePatch,
  MarketSettingsPatch,
  MarketStallPlan,
  MarketSummary,
} from '../../core/models/market.model';
import { MarketStallsStore } from './market-stalls-store';

let saved: MarketStallPlan | null = null;

class StubMarketRepository extends MarketRepository {
  override stallPlan(slug: string): Observable<MarketStallPlan> {
    const plan = buildMarketStallPlan(slug);
    if (!plan) return throwError(() => new Error(`No market matches “${slug}”.`));
    return of(plan);
  }
  override saveStallPlan(_slug: string, plan: MarketStallPlan): Observable<MarketStallPlan> {
    saved = plan;
    return of(plan);
  }
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
  override schedule(): Observable<MarketSchedulePatch> {
    return of({} as MarketSchedulePatch);
  }
  override saveSchedule(): Observable<MarketSchedulePatch> {
    return of({} as MarketSchedulePatch);
  }
  override settings(): Observable<MarketSettingsPatch> {
    return of({} as MarketSettingsPatch);
  }
  override saveSettings(): Observable<MarketSettingsPatch> {
    return of({} as MarketSettingsPatch);
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

/**
 * The store is where a stall map is actually rearranged. These drive it the way
 * the tab does — by vendor slug and pitch reference — and read the plan back.
 */
describe('MarketStallsStore', () => {
  let store: MarketStallsStore;

  const at = (id: string) => store.pitches().find((pitch) => pitch.id === id);
  const occupant = (id: string) => at(id)?.vendorSlug ?? null;

  beforeEach(() => {
    saved = null;
    TestBed.configureTestingModule({
      providers: [MarketStallsStore, { provide: MarketRepository, useClass: StubMarketRepository }],
    });
    store = TestBed.inject(MarketStallsStore);
    store.loadFor('temple-bar');
  });

  it('loads the design’s own map', () => {
    // Design 1g: ten pitches across two rows, two of them free.
    expect(store.pitches().length).toBe(10);
    expect(store.rows().map((row) => row.row)).toEqual(['A', 'B']);
    expect(store.filled()).toBe(8);
    expect(occupant('A1')).toBe('sheridans-cheese');
    expect(occupant('A5')).toBeNull();
    expect(store.isDirty()).toBe(false);
  });

  it('moves a vendor onto a free pitch, leaving the one they left', () => {
    store.assign('sheridans-cheese', 'A5');

    expect(occupant('A5')).toBe('sheridans-cheese');
    expect(occupant('A1')).toBeNull();
    expect(store.isDirty()).toBe(true);
  });

  it('swaps two vendors rather than dropping one off the map', () => {
    store.assign('sheridans-cheese', 'A2');

    expect(occupant('A2')).toBe('sheridans-cheese');
    expect(occupant('A1')).toBe('toonsbridge-dairy');
    // Nobody was displaced into thin air.
    expect(store.filled()).toBe(8);
  });

  it('sends the vendor a newcomer displaces back to the queue', () => {
    const waiting = store.unassigned()[0]!;
    store.assign(waiting.slug, 'A1');

    expect(occupant('A1')).toBe(waiting.slug);
    expect(store.unassigned().map((vendor) => vendor.slug)).toContain('sheridans-cheese');
  });

  it('keeps a vendor on one pitch at a time', () => {
    store.assign('sheridans-cheese', 'A5');
    store.assign('sheridans-cheese', 'B4');

    expect(store.pitches().filter((pitch) => pitch.vendorSlug === 'sheridans-cheese').length).toBe(
      1,
    );
    expect(occupant('B4')).toBe('sheridans-cheese');
  });

  it('frees a pitch and queues whoever was on it', () => {
    store.clear('A1');

    expect(occupant('A1')).toBeNull();
    expect(store.unassigned().map((vendor) => vendor.slug)).toContain('sheridans-cheese');
  });

  it('adds a pitch at the lowest free number in its row', () => {
    store.addPitch('A');
    expect(at('A6')).toBeDefined();

    store.removePitch('A3');
    store.addPitch('A');
    // A3 came free, so the next pitch fills the gap rather than becoming A7.
    expect(at('A3')).toBeDefined();
    expect(at('A7')).toBeUndefined();
  });

  it('keeps the references of the pitches around a removed one', () => {
    store.removePitch('A3');

    // A4 is painted on the ground as A4; closing the gap would move it.
    expect(store.rows()[0]!.pitches.map((pitch) => pitch.id)).toEqual(['A1', 'A2', 'A4', 'A5']);
  });

  it('queues the vendor standing on a pitch that is removed', () => {
    store.removePitch('A1');

    expect(store.pitches().length).toBe(9);
    expect(store.unassigned().map((vendor) => vendor.slug)).toContain('sheridans-cheese');
  });

  it('starts the next lettered row', () => {
    store.addRow();

    expect(store.rows().map((row) => row.row)).toEqual(['A', 'B', 'C']);
    expect(at('C1')).toBeDefined();
  });

  it('never offers a paused member a pitch', () => {
    const paused = buildMarketRoster('temple-bar')!.vendors.filter(
      (vendor) => vendor.standing === 'paused',
    );
    expect(paused.length).toBeGreaterThan(0);

    const waiting = store.unassigned().map((vendor) => vendor.slug);
    for (const vendor of paused) expect(waiting).not.toContain(vendor.slug);
  });

  it('goes back to the saved map on discard', () => {
    store.assign('sheridans-cheese', 'A5');
    store.addRow();
    store.reset();

    expect(store.isDirty()).toBe(false);
    expect(occupant('A1')).toBe('sheridans-cheese');
    expect(store.rows().length).toBe(2);
  });

  it('posts the whole plan and takes the answer as the new baseline', () => {
    store.assign('sheridans-cheese', 'A5');
    let announced = false;
    store.save(() => (announced = true));

    expect(announced).toBe(true);
    expect(saved!.find((pitch) => pitch.id === 'A5')?.vendorSlug).toBe('sheridans-cheese');
    expect(store.isDirty()).toBe(false);
  });

  it('explains a market that does not exist', () => {
    store.loadFor('not-a-market');

    expect(store.hasError()).toBe(true);
    expect(store.error()).toContain('No market matches “not-a-market”.');
    expect(store.pitches()).toEqual([]);
  });

  it('reports an empty map once the last pitch is gone', () => {
    for (const pitch of [...store.pitches()]) store.removePitch(pitch.id);

    expect(store.isEmpty()).toBe(true);
    // Nobody was lost with the pitches — they are all waiting again.
    expect(store.unassigned().length).toBeGreaterThan(0);
  });
});
