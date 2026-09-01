import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Observable, of, throwError } from 'rxjs';
import { MarketRepository } from '../../../core/api/ports/market-repository';
import {
  TEMPLE_BAR_DETAIL,
  buildMarketRoster,
  buildMarketStallPlan,
} from '../../../core/api/in-memory/in-memory-market-repository';
import { MARKETS_FIXTURE } from '../../../core/api/in-memory/market-fixture';
import { IRISH_COUNTIES } from '../../../core/models/location.model';
import {
  MarketDetail,
  MarketDraft,
  MarketRoster,
  MarketSchedulePatch,
  MarketSettingsPatch,
  MarketStallPlan,
  MarketSummary,
} from '../../../core/models/market.model';
import { MarketDetailFacade } from '../market-detail-facade';
import { MarketStalls } from './market-stalls';
import { MarketStallsStore } from '../market-stalls-store';

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
    return of(TEMPLE_BAR_DETAIL);
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

function open(slug = 'temple-bar'): ComponentFixture<MarketStalls> {
  const fixture = TestBed.createComponent(MarketStalls);
  fixture.componentRef.setInput('slug', slug);
  fixture.detectChanges();
  return fixture;
}

function host(fixture: ComponentFixture<MarketStalls>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function text(fixture: ComponentFixture<MarketStalls>): string {
  return host(fixture).textContent ?? '';
}

/** The rendered pitch whose reference reads `id`. */
function stall(fixture: ComponentFixture<MarketStalls>, id: string): HTMLElement {
  const match = Array.from(host(fixture).querySelectorAll('.stall')).find(
    (pitch) => pitch.querySelector('.stall-id')?.textContent?.trim() === id,
  );
  expect(match).toBeDefined();
  return match as HTMLElement;
}

function button(fixture: ComponentFixture<MarketStalls>, label: string): HTMLButtonElement {
  // Buttons carry a leading `mat-icon` ligature in their text, so match inside.
  const match = Array.from(host(fixture).querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(label),
  );
  expect(match).toBeDefined();
  return match as HTMLButtonElement;
}

/**
 * The items of the menu that opened last. Menus render in overlays on the
 * document, and a submenu leaves its parent's panel open beside it — so this
 * reads the newest panel rather than everything on the page.
 */
function menuItems(): HTMLButtonElement[] {
  const panels = Array.from(document.querySelectorAll('.mat-mdc-menu-panel'));
  const panel = panels[panels.length - 1];
  return panel ? Array.from(panel.querySelectorAll('button.mat-mdc-menu-item')) : [];
}

function clickMenuItem(label: string): void {
  const match = menuItems().find((item) => item.textContent?.includes(label));
  expect(match).toBeDefined();
  match!.click();
}

/**
 * The tab offers every move twice — by drag and by menu — so these drive the
 * menus, which are both the accessible path and the one a test can click.
 */
describe('MarketStalls', () => {
  beforeEach(async () => {
    saved = null;
    await TestBed.configureTestingModule({
      imports: [MarketStalls],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        MarketDetailFacade,
        MarketStallsStore,
        { provide: MarketRepository, useClass: StubMarketRepository },
      ],
    }).compileComponents();
  });

  it('draws the market’s own map, row by row', () => {
    const fixture = open();

    expect(host(fixture).querySelectorAll('.stall').length).toBe(10);
    expect(stall(fixture, 'A1').textContent).toContain('Sheridans Cheese');
    expect(stall(fixture, 'A5').textContent).toContain('Free');
    expect(text(fixture)).toContain('8 of 10 pitches assigned');
  });

  it('names each pitch and its occupant for a screen reader', () => {
    const fixture = open();

    const labels = Array.from(host(fixture).querySelectorAll('.stall-menu')).map((menu) =>
      menu.getAttribute('aria-label'),
    );
    expect(labels).toContain('Pitch A1, Sheridans Cheese — actions');
    expect(labels).toContain('Pitch A5, free — actions');
  });

  it('lists the vendors still waiting on a pitch', () => {
    const fixture = open();
    const queue = host(fixture).querySelector('.queue')!;

    expect(queue.textContent).toContain('Waiting for a pitch');
    expect(queue.querySelectorAll('.waiting').length).toBeGreaterThan(0);
  });

  it('assigns a waiting vendor to a free pitch from the pitch’s own menu', () => {
    const fixture = open();
    (stall(fixture, 'A5').querySelector('.stall-menu') as HTMLElement).click();
    fixture.detectChanges();

    clickMenuItem('Assign vendor');
    fixture.detectChanges();
    const first = menuItems()[0]!.textContent!.trim();
    menuItems()[0]!.click();
    fixture.detectChanges();

    expect(stall(fixture, 'A5').textContent).toContain(first);
    expect(text(fixture)).toContain('9 of 10 pitches assigned');
  });

  it('clears a pitch and puts its vendor back in the queue', () => {
    const fixture = open();
    (stall(fixture, 'A1').querySelector('.stall-menu') as HTMLElement).click();
    fixture.detectChanges();

    clickMenuItem('Clear pitch');
    fixture.detectChanges();

    expect(stall(fixture, 'A1').textContent).toContain('Free');
    expect(host(fixture).querySelector('.queue')!.textContent).toContain('Sheridans Cheese');
  });

  it('adds a row on request', () => {
    const fixture = open();

    button(fixture, 'Add a row').click();
    fixture.detectChanges();

    expect(host(fixture).querySelectorAll('.stall').length).toBe(11);
    expect(stall(fixture, 'C1')).toBeDefined();
  });

  it('keeps Save and Discard inert until the map actually changes', () => {
    const fixture = open();
    expect(button(fixture, 'Save stall map').disabled).toBe(true);
    expect(button(fixture, 'Discard changes').disabled).toBe(true);

    button(fixture, 'Add a row').click();
    fixture.detectChanges();
    expect(button(fixture, 'Save stall map').disabled).toBe(false);

    button(fixture, 'Discard changes').click();
    fixture.detectChanges();
    expect(button(fixture, 'Save stall map').disabled).toBe(true);
    expect(host(fixture).querySelectorAll('.stall').length).toBe(10);
  });

  it('posts the whole plan on save', () => {
    const fixture = open();
    button(fixture, 'Add a row').click();
    fixture.detectChanges();

    button(fixture, 'Save stall map').click();

    expect(saved).not.toBeNull();
    expect(saved!.length).toBe(11);
    expect(saved!.some((pitch) => pitch.id === 'C1')).toBe(true);
  });

  it('explains a market that does not exist instead of drawing an empty map', () => {
    const fixture = open('not-a-market');

    expect(text(fixture)).toContain('No market matches “not-a-market”.');
    expect(host(fixture).querySelector('.stall')).toBeNull();
  });
});
