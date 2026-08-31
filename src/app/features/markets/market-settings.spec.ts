import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Observable, of, throwError } from 'rxjs';
import { API_PROVIDERS } from '../../core/api/api.providers';
import { MarketRepository } from '../../core/api/ports/market-repository';
import { MARKETS_FIXTURE, MARKET_SETTINGS } from '../../core/api/in-memory/market-fixture';
import { TEMPLE_BAR_DETAIL } from '../../core/api/in-memory/in-memory-market-repository';
import { GOOGLE_MAPS_CONFIG } from '../../core/maps/google-maps-config';
import { IRISH_COUNTIES } from '../../core/models/location.model';
import {
  MarketDetail,
  MarketDraft,
  MarketRoster,
  MarketSchedulePatch,
  MarketSettingsPatch,
  MarketSummary,
  MarketType,
} from '../../core/models/market.model';
import { MarketDetailFacade } from './market-detail-facade';
import { MarketSettings } from './market-settings';
import { MarketSettingsFacade } from './market-settings-facade';

/** What the last save posted, so a test reads the payload rather than a mock. */
let saved: MarketSettingsPatch | null = null;

/** No API key, so the maps loader stays inert and the picker renders its fallback. */
const NO_MAPS = {
  provide: GOOGLE_MAPS_CONFIG,
  useValue: {
    apiKey: '',
    mapId: 'DEMO_MAP_ID',
    region: 'IE',
    language: 'en-IE',
    defaultCenter: { lat: 53.5, lng: -8 },
    defaultZoom: 6,
  },
};

class StubMarketRepository extends MarketRepository {
  override settings(slug: string): Observable<MarketSettingsPatch> {
    const stored = MARKET_SETTINGS[slug];
    if (!stored) return throwError(() => new Error(`No market matches “${slug}”.`));
    return of(stored);
  }
  override saveSettings(
    _slug: string,
    patch: MarketSettingsPatch,
  ): Observable<MarketSettingsPatch> {
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
  override schedule(): Observable<MarketSchedulePatch> {
    throw new Error('The Settings tab does not read the pattern.');
  }
  override saveSchedule(): Observable<MarketSchedulePatch> {
    throw new Error('The Settings tab does not write the pattern.');
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

async function open(slug = 'temple-bar'): Promise<ComponentFixture<MarketSettings>> {
  const fixture = TestBed.createComponent(MarketSettings);
  fixture.componentRef.setInput('slug', slug);
  fixture.detectChanges();
  // `MatAutocompleteTrigger` writes the address to its input on a microtask,
  // the way `MatSelect` matches its value to an option.
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function host(fixture: ComponentFixture<MarketSettings>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function text(fixture: ComponentFixture<MarketSettings>): string {
  return host(fixture).textContent ?? '';
}

/** The input under a `mat-form-field` whose label reads `label`. */
function field(fixture: ComponentFixture<MarketSettings>, label: string): HTMLInputElement {
  const match = Array.from(host(fixture).querySelectorAll('mat-form-field')).find((wrapper) =>
    wrapper.querySelector('mat-label')?.textContent?.trim().startsWith(label),
  );
  expect(match).toBeDefined();
  return match!.querySelector('input, textarea') as HTMLInputElement;
}

function type(fixture: ComponentFixture<MarketSettings>, label: string, value: string): void {
  const input = field(fixture, label);
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

function button(fixture: ComponentFixture<MarketSettings>, label: string): HTMLButtonElement {
  const match = Array.from(host(fixture).querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.trim().startsWith(label),
  );
  expect(match).toBeDefined();
  return match as HTMLButtonElement;
}

/**
 * The Settings tab hosts the wizard's Details and Location steps over one
 * record. What matters is that it opens on what is stored, saves both halves at
 * once, and never quietly moves the market's public address.
 */
describe('MarketSettings', () => {
  beforeEach(async () => {
    saved = null;
    await TestBed.configureTestingModule({
      imports: [MarketSettings],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        API_PROVIDERS,
        NO_MAPS,
        MarketDetailFacade,
        MarketSettingsFacade,
        // After API_PROVIDERS, so this wins over the in-memory binding.
        { provide: MarketRepository, useClass: StubMarketRepository },
      ],
    }).compileComponents();
  });

  it('fills both editors from the stored record', async () => {
    const fixture = await open();

    expect(field(fixture, 'Market name').value).toBe('Temple Bar Food Market');
    expect(field(fixture, 'Public URL').value).toBe('temple-bar');
    expect(field(fixture, 'Address').value).toBe('Meeting House Square, Temple Bar');
    expect(field(fixture, 'Town or city').value).toBe('Dublin 2');
    expect(field(fixture, 'Number of stalls').value).toBe('20');
    expect(field(fixture, 'Eircode').value).toBe('D02 X406');
  });

  it('treats the loaded record as the baseline, not as an edit', async () => {
    const fixture = await open();

    expect(button(fixture, 'Discard changes').disabled).toBe(true);
  });

  it('saves the two halves as one payload', async () => {
    const fixture = await open();
    type(fixture, 'Market name', 'Temple Bar Saturday Market');
    type(fixture, 'Eircode', 'D02 XY01');

    button(fixture, 'Save settings').click();

    expect(saved).not.toBeNull();
    // One patch, carrying details and location together.
    expect(saved!.name).toBe('Temple Bar Saturday Market');
    expect(saved!.eircode).toBe('D02 XY01');
    expect(saved!.latitude).toBe(MARKET_SETTINGS['temple-bar']!.latitude);
    expect(saved!.stallCount).toBe(20);
  });

  it('keeps the public address a rename would otherwise move', async () => {
    const fixture = await open();
    expect(field(fixture, 'Public URL').disabled).toBe(true);
    expect(text(fixture)).toContain('A market keeps the address it was published at');

    type(fixture, 'Market name', 'Something Else Entirely');
    button(fixture, 'Save settings').click();

    // The slug rides along in the payload, unchanged — `getRawValue()` reads
    // disabled controls, so a locked field is still a saved one.
    expect(saved!.slug).toBe('temple-bar');
  });

  it('posts nothing when nothing has changed', async () => {
    const fixture = await open();

    button(fixture, 'Save settings').click();

    expect(saved).toBeNull();
  });

  it('refuses an incomplete record instead of saving one', async () => {
    const fixture = await open();
    type(fixture, 'Market name', '');

    button(fixture, 'Save settings').click();
    fixture.detectChanges();

    expect(saved).toBeNull();
  });

  it('explains a market that does not exist instead of rendering empty forms', async () => {
    const fixture = await open('not-a-market');

    expect(text(fixture)).toContain('No market matches “not-a-market”.');
    expect(host(fixture).querySelector('md-market-details-form')).toBeNull();
    expect(host(fixture).querySelector('md-market-location-form')).toBeNull();
  });
});
