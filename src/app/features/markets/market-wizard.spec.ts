import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { NEVER, of } from 'rxjs';
import { API_PROVIDERS } from '../../core/api/api.providers';
import { GOOGLE_MAPS_CONFIG } from '../../core/maps/google-maps-config';
import { MarketDraft, MarketStatus, MarketType } from '../../core/models/market.model';
import { MarketRepository } from '../../core/api/ports/market-repository';
import { parseTimeOfDay } from '../../core/scheduling/recurrence';
import { MarketWizard } from './market-wizard';

/**
 * An empty API key keeps the maps loader inert, so no test appends a Maps
 * script or depends on which build configuration the test builder picked up.
 * The location step's own behaviour — validation, what reaches the draft — is
 * what these tests are about, not Google's.
 */
const NO_MAPS = {
  provide: GOOGLE_MAPS_CONFIG,
  useValue: {
    apiKey: '',
    mapId: 'DEMO_MAP_ID',
    region: 'IE',
    language: 'en-IE',
    defaultCenter: { lat: 53.4, lng: -7.9 },
    defaultZoom: 6,
  },
};

/**
 * The schedule step's own behaviour — composing the RRULE, the four controls'
 * validators, the dev rule panel — is covered by `schedule-form.spec.ts`
 * against `MarketScheduleForm` directly. What belongs here is the integration
 * point: that the wizard sends the composed rule and duration to the
 * repository, not the raw controls.
 */
describe('MarketWizard · schedule step', () => {
  let fixture: ComponentFixture<MarketWizard>;
  let wizard: MarketWizard;

  /** Saturday 5 September 2026 — the first Saturday of that month. */
  const SATURDAY = new Date(2026, 8, 5);

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MarketWizard],
      providers: [provideRouter([]), ...API_PROVIDERS, NO_MAPS],
    });
    fixture = TestBed.createComponent(MarketWizard);
    wizard = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('sends the rule and the duration, not the controls, to the repository', () => {
    const repository = TestBed.inject(MarketRepository);
    let saved: MarketDraft | undefined;
    vi.spyOn(repository, 'saveDraft').mockImplementation((draft) => {
      saved = draft;
      return NEVER;
    });

    wizard['scheduleForm'].patchValue({
      frequency: 'WEEKLY',
      tradingDays: [6],
      startsOn: SATURDAY,
      opensAt: parseTimeOfDay('09:00'),
      closesAt: parseTimeOfDay('14:30'),
    });
    fixture.detectChanges();
    wizard['saveDraft']();

    expect(saved?.schedule).toBe('DTSTART:20260905T090000Z\nRRULE:FREQ=WEEKLY;BYDAY=SA');
    expect(saved?.duration).toBe(330);
    expect(saved).not.toHaveProperty('season');
    expect(saved).not.toHaveProperty('repeatsWeekly');
    expect(saved).not.toHaveProperty('firstMarketDay');
  });
});

/**
 * The location step's own behaviour — required fields, the missing-pin
 * message, what a pin move writes — is covered by `location-form.spec.ts`
 * against `MarketLocationForm` directly. What belongs here is the
 * integration point: that the wizard sends the location fields and the pin
 * to the repository, and counts them into the publish checklist.
 */
describe('MarketWizard · location step', () => {
  let fixture: ComponentFixture<MarketWizard>;
  let wizard: MarketWizard;

  const locationForm = () => fixture.componentInstance['locationForm'];

  function fillLocation(overrides: Record<string, unknown> = {}): void {
    locationForm().patchValue({
      address: 'Meeting House Square, Dublin 2',
      city: 'Dublin',
      county: 'Dublin',
      latitude: 53.34473,
      longitude: -6.26379,
      ...overrides,
    });
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MarketWizard],
      providers: [provideRouter([]), ...API_PROVIDERS, NO_MAPS],
    });
    fixture = TestBed.createComponent(MarketWizard);
    wizard = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('sends the city and the pin to the repository, not a guess made from the address', () => {
    const repository = TestBed.inject(MarketRepository);
    let saved: MarketDraft | undefined;
    vi.spyOn(repository, 'saveDraft').mockImplementation((draft) => {
      saved = draft;
      return NEVER;
    });

    fillLocation({ eircode: 'D02 X235' });
    wizard['saveDraft']();

    // The four fields `CreateMarketInput` requires.
    expect(saved?.address).toBe('Meeting House Square, Dublin 2');
    expect(saved?.city).toBe('Dublin');
    expect(saved?.latitude).toBe(53.34473);
    expect(saved?.longitude).toBe(-6.26379);
    // County and eircode have no column server-side, but the console keeps them.
    expect(saved?.county).toBe('Dublin');
    expect(saved?.eircode).toBe('D02 X235');
  });

  it('counts the pin as part of being ready to publish', () => {
    fixture.componentInstance['detailsForm'].patchValue({ name: 'Temple Bar Food Market' });

    const addressItem = () =>
      wizard['checklist']().find((item) => item.label === 'Name, address and hours');
    expect(addressItem()?.done).toBe(false);

    fillLocation();

    expect(addressItem()?.done).toBe(true);
  });
});

/**
 * The shell around the three steps: the footer's step counter and buttons, the
 * listing preview, and where a publish lands. The steps' own behaviour is
 * covered against their components directly.
 */
describe('MarketWizard · shell', () => {
  let fixture: ComponentFixture<MarketWizard>;
  let wizard: MarketWizard;
  let router: Router;

  /** Everything the three steps need to be valid at once. */
  function fillEverything(): void {
    wizard['detailsForm'].patchValue({
      name: 'Bantry Friday Market',
      slug: 'bantry-friday',
      marketType: MarketType.FoodProduce,
      stallCount: 40,
      stallFeePerDay: 35,
    });
    wizard['scheduleForm'].patchValue({
      tradingDays: [5],
      startsOn: new Date(2026, 8, 4),
      opensAt: parseTimeOfDay('09:00'),
      closesAt: parseTimeOfDay('15:00'),
    });
    wizard['locationForm'].patchValue({
      address: 'Wolfe Tone Square, Bantry, Co. Cork',
      city: 'Bantry',
      county: 'Cork',
      latitude: 51.6812,
      longitude: -9.4531,
    });
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MarketWizard],
      providers: [provideRouter([]), ...API_PROVIDERS, NO_MAPS],
    });
    fixture = TestBed.createComponent(MarketWizard);
    wizard = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  it('opens on the first step and says where you are', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Add market');
    expect(text).toContain('Three steps. Vendors can apply as soon as it is published.');
    expect(text).toContain('Step 1 of 3 · Details');
    // Step one offers Cancel rather than Back.
    expect(text).toContain('Cancel');
    expect(text).not.toContain('Back');
  });

  it('refuses to advance past a step that is not filled in', () => {
    wizard['goNext']();
    fixture.detectChanges();

    expect(wizard['stepIndex']()).toBe(0);
    expect(wizard['detailsForm'].touched).toBe(true);
  });

  it('advances once the step is valid, and swaps Cancel for Back', () => {
    fillEverything();

    wizard['goNext']();
    fixture.detectChanges();

    expect(wizard['stepIndex']()).toBe(1);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Step 2 of 3 · Schedule');
    expect(text).toContain('Back');
  });

  it('builds the listing preview from the steps as they are filled in', () => {
    fillEverything();

    expect(wizard['preview']().name).toBe('Bantry Friday Market');
    expect(wizard['preview']().stalls).toBe('0/40');
    expect(wizard['preview']().fee).toBe('€35');
    // Location and hours, composed from the schedule rule rather than typed.
    expect(wizard['preview']().location).toContain('Bantry');
    expect(wizard['preview']().location).toContain('09:00–15:00');
  });

  it('will not publish a half-filled market', () => {
    const repository = TestBed.inject(MarketRepository);
    const publish = vi.spyOn(repository, 'publish');

    wizard['publish']();

    expect(publish).not.toHaveBeenCalled();
  });

  it('publishes the whole draft and opens the new market', async () => {
    const repository = TestBed.inject(MarketRepository);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fillEverything();

    let published: MarketDraft | undefined;
    vi.spyOn(repository, 'publish').mockImplementation((draft) => {
      published = draft;
      return of({
        id: 'mkt-bantry-friday',
        slug: 'bantry-friday',
        name: 'Bantry Friday Market',
        county: 'Cork',
        when: 'Bantry · Fridays 09:00–15:00',
        days: ['Friday'] as const,
        status: MarketStatus.Published,
        tradingToday: false,
        badgeLabel: 'Not trading yet',
        nextMarketDay: '2026-09-04',
        metrics: { stallsFilled: 0, stallsTotal: 40, preorders: 0, enquiries: 0 },
      });
    });

    wizard['publish']();

    expect(published?.name).toBe('Bantry Friday Market');
    // The composed rule, not the raw controls.
    expect(published?.schedule).toContain('RRULE:');
    expect(published?.duration).toBe(360);
    expect(navigate).toHaveBeenCalledWith(['/markets', 'bantry-friday']);
  });
});
