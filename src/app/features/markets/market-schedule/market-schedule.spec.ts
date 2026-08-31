import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Observable, of, throwError } from 'rxjs';
import { MarketRepository } from '../../../core/api/ports/market-repository';
import {
  MARKETS_FIXTURE,
  MARKET_SCHEDULES,
  MARKET_SETTINGS,
} from '../../../core/api/in-memory/market-fixture';
import {
  TEMPLE_BAR_DETAIL,
  buildMarketStallPlan,
} from '../../../core/api/in-memory/in-memory-market-repository';
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
import { formatTimeOfDay, parseTimeOfDay } from '../../../core/scheduling/recurrence';
import { MarketDetailFacade } from '../market-detail-facade';
import { MarketSchedule } from './market-schedule';
import { MarketScheduleFacade } from '../market-schedule-facade';
import { ScheduleFormGroup } from '../schedule-form/schedule-form';

/** What the last save posted, so a test can read the payload rather than a mock. */
let saved: MarketSchedulePatch | null = null;

class StubMarketRepository extends MarketRepository {
  override schedule(slug: string): Observable<MarketSchedulePatch> {
    const stored = MARKET_SCHEDULES[slug];
    if (!stored) return throwError(() => new Error(`No market matches “${slug}”.`));
    return of(stored);
  }
  override saveSchedule(
    _slug: string,
    patch: MarketSchedulePatch,
  ): Observable<MarketSchedulePatch> {
    saved = patch;
    return of(patch);
  }
  override list(): Observable<readonly MarketSummary[]> {
    return of(MARKETS_FIXTURE);
  }
  override detail(): Observable<MarketDetail> {
    return of(TEMPLE_BAR_DETAIL);
  }
  override roster(): Observable<MarketRoster> {
    return of({ vendors: [], applications: [], feesOutstanding: 0 });
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
  override saveDraft(draft: MarketDraft): Observable<MarketSummary> {
    return of({ ...MARKETS_FIXTURE[0]!, slug: draft.slug, name: draft.name });
  }
  override publish(draft: MarketDraft): Observable<MarketSummary> {
    return of({ ...MARKETS_FIXTURE[0]!, slug: draft.slug, name: draft.name });
  }
}

function open(slug = 'temple-bar'): ComponentFixture<MarketSchedule> {
  const fixture = TestBed.createComponent(MarketSchedule);
  fixture.componentRef.setInput('slug', slug);
  fixture.detectChanges();
  return fixture;
}

function host(fixture: ComponentFixture<MarketSchedule>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function text(fixture: ComponentFixture<MarketSchedule>): string {
  return host(fixture).textContent ?? '';
}

function button(fixture: ComponentFixture<MarketSchedule>, label: string): HTMLButtonElement {
  const match = Array.from(host(fixture).querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.trim().startsWith(label),
  );
  expect(match).toBeDefined();
  return match as HTMLButtonElement;
}

/** A trading-day toggle in the editor, by the day it names. */
function dayToggle(fixture: ComponentFixture<MarketSchedule>, day: string): HTMLButtonElement {
  const match = host(fixture).querySelector(`button[aria-label="${day}"]`);
  expect(match).not.toBeNull();
  return match as HTMLButtonElement;
}

// Protected members: index access is the sanctioned way to reach them.
function form(fixture: ComponentFixture<MarketSchedule>): ScheduleFormGroup {
  return fixture.componentInstance['form'];
}

/**
 * The Schedule tab edits the rule the API turns into market days. What matters
 * is that it opens on what is stored, and that a save posts a composed RRULE
 * rather than anything anyone typed.
 */
describe('MarketSchedule', () => {
  beforeEach(async () => {
    saved = null;
    await TestBed.configureTestingModule({
      imports: [MarketSchedule],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        MarketDetailFacade,
        MarketScheduleFacade,
        { provide: MarketRepository, useClass: StubMarketRepository },
      ],
    }).compileComponents();
  });

  it('opens on the market’s stored pattern', () => {
    const fixture = open();
    const value = form(fixture).getRawValue();

    expect(value.frequency).toBe('WEEKLY');
    expect(value.tradingDays).toEqual([6]);
    expect(formatTimeOfDay(value.opensAt)).toBe('09:00');
    expect(formatTimeOfDay(value.closesAt)).toBe('14:30');
    expect(value.ends).toBe('NEVER');
    expect(value.bookingDeadlineHours).toBe(48);
    // The rule's own start date, recovered from the stored DTSTART.
    expect(value.startsOn?.getFullYear()).toBe(2024);
    expect(value.startsOn?.getMonth()).toBe(0);
    expect(value.startsOn?.getDate()).toBe(6);
  });

  it('treats the loaded pattern as the baseline, not as an edit', () => {
    const fixture = open();

    expect(form(fixture).pristine).toBe(true);
    expect(button(fixture, 'Discard changes').disabled).toBe(true);
  });

  it('offers Discard only once there is something to discard', () => {
    const fixture = open();
    expect(button(fixture, 'Discard changes').disabled).toBe(true);

    // Through the editor itself, which is the only thing that marks it dirty.
    dayToggle(fixture, 'Sunday').click();
    fixture.detectChanges();
    expect(form(fixture).getRawValue().tradingDays).toEqual([6, 7]);
    expect(button(fixture, 'Discard changes').disabled).toBe(false);

    button(fixture, 'Discard changes').click();
    fixture.detectChanges();
    expect(form(fixture).getRawValue().tradingDays).toEqual([6]);
    expect(button(fixture, 'Discard changes').disabled).toBe(true);
  });

  it('reads the stored rule back in words', () => {
    expect(text(open())).toContain('Every week on Saturday');
  });

  it('saves the composed rule rather than anything typed', () => {
    const fixture = open();
    form(fixture).controls.closesAt.setValue(parseTimeOfDay('16:00'));
    form(fixture).markAsDirty();
    fixture.detectChanges();

    button(fixture, 'Save pattern').click();

    expect(saved).not.toBeNull();
    expect(saved!.schedule).toBe('DTSTART:20240106T090000Z\nRRULE:FREQ=WEEKLY;BYDAY=SA');
    expect(saved!.closesAt).toBe('16:00');
    // Seven hours open, which is the `duration` the API stores.
    expect(saved!.duration).toBe(420);
    expect(form(fixture).pristine).toBe(true);
  });

  it('posts nothing when nothing has changed', () => {
    const fixture = open();

    button(fixture, 'Save pattern').click();

    expect(saved).toBeNull();
  });

  it('refuses a pattern with no trading days instead of saving one', () => {
    const fixture = open();
    form(fixture).controls.tradingDays.setValue([]);
    form(fixture).markAsDirty();
    fixture.detectChanges();

    button(fixture, 'Save pattern').click();
    fixture.detectChanges();

    expect(saved).toBeNull();
    expect(text(fixture)).toContain('Pick at least one trading day');
  });

  it('explains a market that does not exist instead of rendering an empty form', () => {
    const fixture = open('not-a-market');

    expect(text(fixture)).toContain('No market matches “not-a-market”.');
    expect(host(fixture).querySelector('md-market-schedule-form')).toBeNull();
  });
});
