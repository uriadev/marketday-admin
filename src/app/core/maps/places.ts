import { Injectable, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { MapGeocoder } from '@angular/google-maps';
import { EMPTY, Observable, defer, filter, from, map, of, switchMap, take } from 'rxjs';
import { GOOGLE_MAPS_CONFIG } from './google-maps-config';
import { GoogleMapsLoader } from './google-maps-loader';
import { geocoderResultToResolvedPlace, toResolvedPlace } from './address-components';
import { PlaceSuggestion, ResolvedPlace } from './place.model';

/** What `fetchFields` needs to fill a `ResolvedPlace`, and nothing more. */
const PLACE_FIELDS = ['formattedAddress', 'location', 'addressComponents'];

/**
 * Address lookup, in the console's own vocabulary.
 *
 * This is the adapter for Google's Places and Geocoding APIs: it speaks
 * `PlaceSuggestion` and `ResolvedPlace` outwards and keeps every `google.maps`
 * type inside. It uses the **Places API (New)** data layer —
 * `AutocompleteSuggestion` — rather than the `Autocomplete` widget, which has
 * been closed to new customers since March 2025 and could not live inside a
 * `mat-form-field` anyway.
 *
 * Every call is inert when maps are unavailable (server render, or no API key),
 * completing without a value so callers degrade rather than hang.
 */
@Injectable({ providedIn: 'root' })
export class Places {
  private readonly config = inject(GOOGLE_MAPS_CONFIG);
  private readonly loader = inject(GoogleMapsLoader);
  private readonly geocoder = inject(MapGeocoder);
  private readonly ready$ = toObservable(this.loader.ready);

  /**
   * Predictions from the last `suggest()`, by place ID. Resolving through the
   * prediction rather than a fresh `Place` is what carries the session token
   * into `fetchFields`, so a whole typing session bills as one autocomplete
   * request instead of one per keystroke.
   */
  private predictions = new Map<string, google.maps.places.PlacePrediction>();

  /** One token per typing session; replaced once a place is resolved. */
  private sessionToken?: google.maps.places.AutocompleteSessionToken;

  /** Irish address predictions for what the organiser has typed so far. */
  suggest(query: string): Observable<PlaceSuggestion[]> {
    const input = query.trim();
    if (!input) return of([]);

    return this.whenReady(async () => {
      const { AutocompleteSessionToken, AutocompleteSuggestion } = (await google.maps.importLibrary(
        'places',
      )) as google.maps.PlacesLibrary;

      this.sessionToken ??= new AutocompleteSessionToken();
      const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        sessionToken: this.sessionToken,
        includedRegionCodes: [this.config.region.toLowerCase()],
        language: this.config.language,
        region: this.config.region,
      });

      this.predictions = new Map();
      const rows: PlaceSuggestion[] = [];
      for (const suggestion of suggestions) {
        const prediction = suggestion.placePrediction;
        if (!prediction) continue;
        this.predictions.set(prediction.placeId, prediction);
        rows.push({
          id: prediction.placeId,
          primaryText: prediction.mainText?.toString() ?? prediction.text.toString(),
          secondaryText: prediction.secondaryText?.toString() ?? '',
          description: prediction.text.toString(),
        });
      }
      return rows;
    });
  }

  /** Full details — address, city, county, eircode, coordinates — for a pick. */
  resolve(placeId: string): Observable<ResolvedPlace | null> {
    return this.whenReady(async () => {
      const prediction = this.predictions.get(placeId);
      const place = prediction
        ? prediction.toPlace()
        : new ((await google.maps.importLibrary('places')) as google.maps.PlacesLibrary).Place({
            id: placeId,
          });

      await place.fetchFields({ fields: PLACE_FIELDS });
      // `fetchFields` ends the autocomplete session; the next one needs its own.
      this.sessionToken = undefined;
      return toResolvedPlace({
        formattedAddress: place.formattedAddress,
        addressComponents: place.addressComponents,
        location: place.location,
      });
    });
  }

  /** The address a dropped pin sits on, so the fields can follow the map. */
  reverseGeocode(latitude: number, longitude: number): Observable<ResolvedPlace | null> {
    if (!this.loader.available) return EMPTY;
    this.loader.load();

    return this.ready$.pipe(
      filter(Boolean),
      take(1),
      switchMap(() =>
        this.geocoder.geocode({
          location: { lat: latitude, lng: longitude },
          language: this.config.language,
          region: this.config.region,
        }),
      ),
      map(({ results }) => {
        const first = results[0];
        return first ? geocoderResultToResolvedPlace(first) : null;
      }),
    );
  }

  /** Run `work` once the Maps API is up; complete empty if it never will be. */
  private whenReady<T>(work: () => Promise<T>): Observable<T> {
    if (!this.loader.available) return EMPTY;
    this.loader.load();

    return this.ready$.pipe(
      filter(Boolean),
      take(1),
      switchMap(() => defer(() => from(work()))),
    );
  }
}
