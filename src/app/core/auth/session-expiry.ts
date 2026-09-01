import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

/**
 * Fires once when the backend rejects the session as unauthenticated and a
 * token refresh cannot recover it. {@link authInterceptor} is the only
 * producer, {@link AuthStore} the only consumer.
 *
 * It exists purely to break a DI cycle: the interceptor must end the session
 * (clear the user, route to `/login`) but cannot depend on `AuthStore` —
 * `AuthStore` → `AuthRepository` → `GraphqlClient` → `HttpClient` →
 * interceptor would close the loop (the same reason {@link TokenStore} is
 * separate). This service has no dependencies, so either side can inject it.
 */
@Injectable({ providedIn: 'root' })
export class SessionExpiry {
  private readonly _expired = new Subject<void>();

  /** Emits every time {@link expire} is called. */
  readonly expired: Observable<void> = this._expired.asObservable();

  expire(): void {
    this._expired.next();
  }
}
