import { Injectable, inject, signal } from '@angular/core';
import { SESSION_STORAGE } from './session-storage';

const ACCESS_KEY = 'marketday.admin.accessToken';
const REFRESH_KEY = 'marketday.admin.refreshToken';

/**
 * Holds the JWT pair the GraphQL backend issues. Deliberately separate from
 * {@link AuthStore}: the HTTP interceptor needs to read and rotate these tokens,
 * and `AuthStore` → `AuthRepository` → `GraphqlClient` → `HttpClient` →
 * interceptor would close a DI cycle if the interceptor depended on `AuthStore`
 * instead. Persists through {@link SESSION_STORAGE} — localStorage in the
 * browser, a no-op on the server — the same strategy `AuthStore` uses for the
 * signed-in user.
 */
@Injectable({ providedIn: 'root' })
export class TokenStore {
  private readonly storage = inject(SESSION_STORAGE);

  private readonly _accessToken = signal<string | null>(this.read(ACCESS_KEY));
  private readonly _refreshToken = signal<string | null>(this.read(REFRESH_KEY));

  readonly accessToken = this._accessToken.asReadonly();
  readonly refreshToken = this._refreshToken.asReadonly();

  set(accessToken: string, refreshToken: string): void {
    this._accessToken.set(accessToken);
    this._refreshToken.set(refreshToken);
    this.storage?.setItem(ACCESS_KEY, accessToken);
    this.storage?.setItem(REFRESH_KEY, refreshToken);
  }

  clear(): void {
    this._accessToken.set(null);
    this._refreshToken.set(null);
    this.storage?.removeItem(ACCESS_KEY);
    this.storage?.removeItem(REFRESH_KEY);
  }

  private read(key: string): string | null {
    return this.storage?.getItem(key) ?? null;
  }
}
