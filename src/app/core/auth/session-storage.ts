import { InjectionToken, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * The Web Storage the console persists its session in. Resolves to `localStorage`
 * in the browser and to `null` on the server, so anything that reads it (the auth
 * store, the guards) is inherently SSR-safe — no `window` guard at every call
 * site. Swap the strategy here, not in the consumers.
 */
export const SESSION_STORAGE = new InjectionToken<Storage | null>('SESSION_STORAGE', {
  providedIn: 'root',
  factory: () => (isPlatformBrowser(inject(PLATFORM_ID)) ? window.localStorage : null),
});
