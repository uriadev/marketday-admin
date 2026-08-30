import { ComponentFixture, TestBed } from '@angular/core/testing';
import { API_PROVIDERS } from '../../core/api/api.providers';
import { GOOGLE_MAPS_CONFIG } from '../../core/maps/google-maps-config';
import {
  LocationFormGroup,
  MarketLocationForm,
  createLocationForm,
  locationFields,
} from './location-form';

/**
 * An empty API key keeps the maps loader inert, so no test appends a Maps
 * script or depends on which build configuration the test builder picked up.
 * The form's own behaviour — validation, what a pin move writes — is what
 * these tests are about, not Google's.
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
 * The location form's job is to produce a payload the API would accept: an
 * address, the town it is in, and a point. Coordinates have no field to type
 * into, so these tests drive the picker's output rather than a control.
 */
describe('MarketLocationForm', () => {
  let fixture: ComponentFixture<MarketLocationForm>;
  let group: LocationFormGroup;

  function fillLocation(overrides: Record<string, unknown> = {}): void {
    group.patchValue({
      address: 'Meeting House Square, Dublin 2',
      city: 'Dublin',
      county: 'Dublin',
      ...overrides,
    });
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MarketLocationForm],
      providers: [API_PROVIDERS, NO_MAPS],
    });
    group = TestBed.runInInjectionContext(() => createLocationForm());
    fixture = TestBed.createComponent(MarketLocationForm);
    fixture.componentRef.setInput('form', group);
    fixture.detectChanges();
  });

  it('asks for a town as well as an address', () => {
    expect(group.controls.city.hasError('required')).toBe(true);
    fillLocation();
    expect(group.controls.city.valid).toBe(true);
  });

  it('stays invalid until the pin is dropped, however complete the text is', () => {
    fillLocation();
    expect(group.valid).toBe(false);
    expect(group.controls.latitude.hasError('required')).toBe(true);

    fixture.componentInstance['onPinMoved']({ lat: 53.34473, lng: -6.26379 });
    fixture.detectChanges();

    expect(group.valid).toBe(true);
  });

  it('puts the missing-pin error on the map, where there is no field to hold it', () => {
    fillLocation();
    expect(fixture.componentInstance['pinError']()).toBeNull();

    // The host calls this — Continue/Publish/Save — since `markAllAsTouched()`
    // emits no value change for the component to react to on its own.
    fixture.componentInstance.flagMissingPin();
    expect(fixture.componentInstance['pinError']()).toBe('Drop the pin on the market entrance.');

    fixture.componentInstance['onPinMoved']({ lat: 53.34473, lng: -6.26379 });
    expect(fixture.componentInstance['pinError']()).toBeNull();
  });

  it('marks the coordinates dirty when the pin moves, so a save actually persists them', () => {
    fixture.componentInstance['onPinMoved']({ lat: 53.34473, lng: -6.26379 });

    expect(group.controls.latitude.value).toBe(53.34473);
    expect(group.controls.longitude.value).toBe(-6.26379);
    expect(group.controls.latitude.dirty).toBe(true);
  });
});

describe('locationFields', () => {
  it('maps the raw form value onto the patch the repository expects', () => {
    const form = TestBed.runInInjectionContext(() => createLocationForm());
    form.patchValue({
      address: 'Meeting House Square, Dublin 2',
      city: 'Dublin',
      county: 'Dublin',
      eircode: 'D02 X235',
      latitude: 53.34473,
      longitude: -6.26379,
    });

    expect(locationFields(form.getRawValue())).toEqual({
      address: 'Meeting House Square, Dublin 2',
      city: 'Dublin',
      county: 'Dublin',
      eircode: 'D02 X235',
      latitude: 53.34473,
      longitude: -6.26379,
      accessNotes: '',
      organiserName: '',
      organiserPhone: '',
    });
  });
});
