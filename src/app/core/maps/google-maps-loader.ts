import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { GOOGLE_MAPS_CONFIG } from './google-maps-config';

/** Global the Maps script calls back into once it has finished booting. */
const CALLBACK = '__mdGoogleMapsReady';

/**
 * Loads the Google Maps JavaScript API on demand, exactly once.
 *
 * The script is injected here rather than sat in `index.html` so the key comes
 * from configuration and so nothing is fetched on screens that have no map. Two
 * conditions leave the loader permanently inert — the server (there is no
 * `document` to append to, and SSR renders the picker's loading state) and a
 * missing key. Neither is an error: `ready()` simply never turns true, and the
 * picker shows a fallback panel.
 */
@Injectable({ providedIn: 'root' })
export class GoogleMapsLoader {
  private readonly config = inject(GOOGLE_MAPS_CONFIG);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly loaded = signal(false);
  private readonly errored = signal(false);
  private started = false;

  /** True once `google.maps` is on the window and safe to touch. */
  readonly ready = this.loaded.asReadonly();
  /** True when the script was requested and did not arrive. */
  readonly failed = this.errored.asReadonly();

  /** Whether a map can ever appear, so the picker can explain itself early. */
  get available(): boolean {
    return this.isBrowser && !!this.config.apiKey;
  }

  /** Idempotent: repeated calls from several pickers load one script. */
  load(): void {
    if (this.started) return;
    this.started = true;

    if (!this.available) {
      this.errored.set(!this.config.apiKey && this.isBrowser);
      return;
    }

    // Already present, e.g. a second app bootstrap in the same document.
    if (typeof google !== 'undefined' && google.maps) {
      this.loaded.set(true);
      return;
    }

    const params = new URLSearchParams({
      key: this.config.apiKey,
      v: 'weekly',
      loading: 'async',
      language: this.config.language,
      region: this.config.region,
      callback: CALLBACK,
    });

    // `loading=async` requires a callback rather than `onload`; the global is
    // removed as soon as it fires so nothing lingers on `window`.
    (window as unknown as Record<string, () => void>)[CALLBACK] = () => {
      delete (window as unknown as Record<string, unknown>)[CALLBACK];
      this.loaded.set(true);
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () => this.errored.set(true);
    document.head.appendChild(script);
  }
}
