import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AdminUser } from '../models/admin-user.model';
import { AuthRepository, SignInChallenge } from '../api/ports/auth-repository';
import { SESSION_STORAGE } from './session-storage';

const USER_KEY = 'marketday.admin.user';

/**
 * The one true session singleton. Orchestrates {@link AuthRepository} and
 * persists the signed-in user to {@link SESSION_STORAGE} (localStorage in the
 * browser, a no-op on the server). Everything is a signal; nothing here renders.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly repo = inject(AuthRepository);
  private readonly storage = inject(SESSION_STORAGE);

  private readonly _user = signal<AdminUser | null>(this.restore());
  /** Set once email + password are accepted; cleared when a code is verified. */
  private readonly _challenge = signal<SignInChallenge | null>(null);

  readonly user = this._user.asReadonly();
  readonly challenge = this._challenge.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);
  readonly awaitingCode = computed(() => this._challenge() !== null);

  /** Step 1 of sign-in: trade credentials for a verification challenge. */
  requestCode(email: string, password: string): Observable<SignInChallenge> {
    return this.repo
      .signIn(email, password)
      .pipe(tap((challenge) => this._challenge.set(challenge)));
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
    this._user.set(null);
    this._challenge.set(null);
    this.storage?.removeItem(USER_KEY);
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
