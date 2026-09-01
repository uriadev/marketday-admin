import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AdminUser } from '../models/admin-user.model';
import { AuthRepository, SignInChallenge, SignInOutcome } from '../api/ports/auth-repository';
import { SessionExpiry } from './session-expiry';
import { SESSION_STORAGE } from './session-storage';
import { TokenStore } from './token-store';

const USER_KEY = 'marketday.admin.user';

/**
 * The one true session singleton. Orchestrates {@link AuthRepository} and
 * persists the signed-in user to {@link SESSION_STORAGE} (localStorage in the
 * browser, a no-op on the server). Everything is a signal; nothing here renders.
 *
 * Token storage lives in {@link TokenStore}, not here — the HTTP interceptor
 * reads it, and `AuthStore` → `AuthRepository` → `GraphqlClient` → `HttpClient`
 * → interceptor → `AuthStore` would be a DI cycle if the interceptor depended
 * on this service instead.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly repo = inject(AuthRepository);
  private readonly storage = inject(SESSION_STORAGE);
  private readonly tokens = inject(TokenStore);
  private readonly router = inject(Router);

  private readonly _user = signal<AdminUser | null>(this.restore());
  /** Set on a `'challenge'` outcome; cleared once a code is verified. */
  private readonly _challenge = signal<SignInChallenge | null>(null);

  readonly user = this._user.asReadonly();
  readonly challenge = this._challenge.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);
  readonly awaitingCode = computed(() => this._challenge() !== null);

  constructor() {
    // The interceptor fires this when the backend rejects the session and a
    // token refresh could not recover it — end the session here (so the guards
    // stop admitting the console) and send the user to sign in again.
    inject(SessionExpiry)
      .expired.pipe(takeUntilDestroyed())
      .subscribe(() => this.onSessionExpired());
  }

  /**
   * Exchanges credentials for either a completed sign-in or a code challenge.
   * The fixture backend always challenges; the real backend's `login`
   * mutation completes in one step — both are valid {@link SignInOutcome}s.
   */
  signIn(email: string, password: string): Observable<SignInOutcome> {
    return this.repo.signIn(email, password).pipe(
      tap((outcome) => {
        if (outcome.kind === 'signed-in') {
          this._user.set(outcome.user);
          this._challenge.set(null);
          this.persist(outcome.user);
        } else {
          this._challenge.set(outcome.challenge);
        }
      }),
    );
  }

  /** Step 2 of sign-in: trade the code for the authenticated user. */
  verifyCode(code: string): Observable<AdminUser> {
    const email = this._challenge()?.email ?? '';
    return this.repo.verifyCode(email, code).pipe(
      tap((user) => {
        this._user.set(user);
        this._challenge.set(null);
        this.persist(user);
      }),
    );
  }

  signOut(): void {
    // Best-effort: the session is cleared locally either way, so a failed or
    // slow logout call never leaves someone stuck signed in on this device.
    this.repo.signOut().subscribe({ error: () => {} });
    this.clearSession();
  }

  /** Drops every trace of the session on this device. No navigation — the
   *  caller decides where to go next (the sign-out button, {@link onSessionExpired}). */
  private clearSession(): void {
    this._user.set(null);
    this._challenge.set(null);
    this.storage?.removeItem(USER_KEY);
    this.tokens.clear();
  }

  private onSessionExpired(): void {
    // Concurrent 401s each fire the signal; once the session is gone there is
    // nothing left to tear down, so ignore the rest.
    if (this._user() === null) return;
    this.clearSession();
    void this.router.navigateByUrl('/login');
  }

  private persist(user: AdminUser): void {
    this.storage?.setItem(USER_KEY, JSON.stringify(user));
  }

  private restore(): AdminUser | null {
    const raw = this.storage?.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AdminUser;
    } catch {
      return null;
    }
  }
}
