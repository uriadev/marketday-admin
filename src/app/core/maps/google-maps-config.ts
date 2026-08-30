import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface GoogleMapsConfig {
  /** Empty disables maps entirely — the picker degrades instead of failing. */
  readonly apiKey: string;
  /** Required by advanced markers; `DEMO_MAP_ID` works for development. */
  readonly mapId: string;
  /** Biases geocoding and autocomplete, e.g. `'IE'`. */
  readonly region: string;
  readonly language: string;
  readonly defaultCenter: { readonly lat: number; readonly lng: number };
  readonly defaultZoom: number;
}

/**
 * Maps configuration, defaulted from the environment file rather than provided
 * in `app.config.ts` — that way every existing `TestBed` resolves it without a
 * provider, while a spec that cares can still override it.
 */
export const GOOGLE_MAPS_CONFIG = new InjectionToken<GoogleMapsConfig>('GOOGLE_MAPS_CONFIG', {
  providedIn: 'root',
  factory: () => environment.googleMaps,
});
