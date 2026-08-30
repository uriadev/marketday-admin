import { normaliseCounty } from '../models/location.model';
import { ResolvedPlace } from './place.model';

/** The subset of `google.maps.Place` this mapping reads. */
export interface PlaceLike {
  readonly formattedAddress?: string | null;
  readonly addressComponents?: readonly AddressComponentLike[] | null;
  readonly location?: { lat(): number; lng(): number } | null;
}

export interface AddressComponentLike {
  readonly longText?: string | null;
  readonly shortText?: string | null;
  readonly types: readonly string[];
}

/** Same idea for a `google.maps.GeocoderResult`, which uses the older names. */
export interface GeocoderResultLike {
  readonly formatted_address?: string;
  readonly address_components?: readonly {
    readonly long_name: string;
    readonly short_name: string;
    readonly types: readonly string[];
  }[];
  readonly geometry?: { readonly location?: { lat(): number; lng(): number } };
}

function pick(
  components: readonly AddressComponentLike[],
  ...types: readonly string[]
): string | null {
  for (const type of types) {
    const match = components.find((component) => component.types.includes(type));
    if (match?.longText) return match.longText;
  }
  return null;
}

/**
 * Google's address components, flattened onto the fields the market form
 * stores.
 *
 * Ireland is the reason for each fallback. Google returns no `locality` at all
 * for a great many Irish addresses — "Meeting House Square, Dublin" has only
 * `postal_town: Dublin 8`, and "Short Quay, Kinsale" only `postal_town:
 * Kinsale` — so the chain walks down to whatever the place actually carries.
 * The county always arrives as "County Cork" and is normalised on the way in.
 */
export function toResolvedPlace(place: PlaceLike): ResolvedPlace | null {
  const location = place.location;
  if (!location) return null;

  const components = place.addressComponents ?? [];
  return {
    address: place.formattedAddress ?? '',
    city:
      pick(
        components,
        'locality',
        'postal_town',
        'sublocality',
        'sublocality_level_1',
        'neighborhood',
      ) ?? '',
    county: normaliseCounty(pick(components, 'administrative_area_level_1')),
    eircode: pick(components, 'postal_code') ?? '',
    latitude: location.lat(),
    longitude: location.lng(),
  };
}

/** The same mapping for a geocoder result, whose fields are snake_case. */
export function geocoderResultToResolvedPlace(result: GeocoderResultLike): ResolvedPlace | null {
  return toResolvedPlace({
    formattedAddress: result.formatted_address,
    addressComponents: (result.address_components ?? []).map((component) => ({
      longText: component.long_name,
      shortText: component.short_name,
      types: component.types,
    })),
    location: result.geometry?.location,
  });
}
