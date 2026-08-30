import { geocoderResultToResolvedPlace, toResolvedPlace } from './address-components';

/**
 * Google's address components are the only thing standing between a picked
 * suggestion and the four fields the market form stores, and Irish addresses
 * are exactly where the naive mapping falls over — rural places with no
 * `locality`, and a county that arrives as "County Cork".
 */
describe('toResolvedPlace', () => {
  const location = { lat: () => 51.88883, lng: () => -8.59183 };

  function component(longText: string, ...types: string[]) {
    return { longText, shortText: longText, types };
  }

  it('flattens a town address onto the fields the form stores', () => {
    const place = toResolvedPlace({
      formattedAddress: 'Main St, Ballincollig, Co. Cork, P31 X284, Ireland',
      location,
      addressComponents: [
        component('Main Street', 'route'),
        component('Ballincollig', 'locality', 'political'),
        component('County Cork', 'administrative_area_level_1', 'political'),
        component('P31 X284', 'postal_code'),
        component('Ireland', 'country', 'political'),
      ],
    });

    expect(place).toEqual({
      address: 'Main St, Ballincollig, Co. Cork, P31 X284, Ireland',
      city: 'Ballincollig',
      county: 'Cork',
      eircode: 'P31 X284',
      latitude: 51.88883,
      longitude: -8.59183,
    });
  });

  it('strips the "County" and "Co." Google puts in front of a county', () => {
    const county = (value: string) =>
      toResolvedPlace({
        location,
        addressComponents: [component(value, 'administrative_area_level_1')],
      })?.county;

    expect(county('County Cork')).toBe('Cork');
    expect(county('Co. Kerry')).toBe('Kerry');
    expect(county('Dublin')).toBe('Dublin');
  });

  it('leaves the county unset rather than guessing at one off the list', () => {
    // Northern Irish and mis-parsed values must not silently become a county.
    const place = toResolvedPlace({
      location,
      addressComponents: [component('County Antrim', 'administrative_area_level_1')],
    });

    expect(place?.county).toBeNull();
  });

  it('falls back to postal_town, then sublocality, for the city', () => {
    const city = (...components: { longText: string; shortText: string; types: string[] }[]) =>
      toResolvedPlace({ location, addressComponents: components })?.city;

    expect(city(component('Skibbereen', 'postal_town'))).toBe('Skibbereen');
    expect(city(component('Rathfarnham', 'sublocality'))).toBe('Rathfarnham');
    // A locality always wins over the fallbacks.
    expect(city(component('Rathfarnham', 'sublocality'), component('Dublin', 'locality'))).toBe(
      'Dublin',
    );
    expect(city()).toBe('');
  });

  it('returns null without a location, because a place with no point is unusable', () => {
    expect(toResolvedPlace({ formattedAddress: 'Somewhere', location: null })).toBeNull();
  });
});

describe('geocoderResultToResolvedPlace', () => {
  it('reads the geocoder’s snake_case shape as the same place', () => {
    const place = geocoderResultToResolvedPlace({
      formatted_address: 'Short Quay, Kinsale, Co. Cork, Ireland',
      geometry: { location: { lat: () => 51.70638, lng: () => -8.52215 } },
      address_components: [
        { long_name: 'Kinsale', short_name: 'Kinsale', types: ['locality'] },
        { long_name: 'County Cork', short_name: 'Cork', types: ['administrative_area_level_1'] },
        { long_name: 'P17 CX50', short_name: 'P17 CX50', types: ['postal_code'] },
      ],
    });

    expect(place).toEqual({
      address: 'Short Quay, Kinsale, Co. Cork, Ireland',
      city: 'Kinsale',
      county: 'Cork',
      eircode: 'P17 CX50',
      latitude: 51.70638,
      longitude: -8.52215,
    });
  });
});
