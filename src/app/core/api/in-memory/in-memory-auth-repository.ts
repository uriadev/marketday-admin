import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { delay, mergeMap } from 'rxjs/operators';
import { AdminUser } from '../../models/admin-user.model';
import { AuthRepository, SignInOutcome } from '../ports/auth-repository';

/** The single seat that can sign in against the fixture backend. */
const FIXTURE_EMAIL = 'aine@marketday.ie';

const FIXTURE_USER: AdminUser = {
  id: 'usr_aine',
  name: 'Áine Ryan',
  email: FIXTURE_EMAIL,
  role: 'Super admin',
};

/** Rough network latency so loading states are visible in the console. */
const LATENCY_MS = 450;

function fail(message: string): Observable<never> {
  return of(null).pipe(
    delay(LATENCY_MS),
    mergeMap(() => throwError(() => new Error(message))),
  );
}

/**
 * Fixture auth. `aine@marketday.ie` + any 6+ character password reaches the
 * verification step; any 6-digit code other than `000000` completes sign-in.
 */
@Injectable()
export class InMemoryAuthRepository extends AuthRepository {
  override signIn(email: string, password: string): Observable<SignInOutcome> {
    const normalised = email.trim().toLowerCase();
    if (normalised !== FIXTURE_EMAIL || password.length < 6) {
      return fail("That email and password don't match an account.");
    }
    return of<SignInOutcome>({
      kind: 'challenge',
      challenge: { email: FIXTURE_EMAIL, sentTo: 'number ending 4471' },
    }).pipe(delay(LATENCY_MS));
  }

  override verifyCode(email: string, code: string): Observable<AdminUser> {
    const digitsOnly = /^\d{6}$/.test(code);
    if (!digitsOnly || code === '000000') {
      return fail('That code has expired or is incorrect.');
    }
    return of(FIXTURE_USER).pipe(delay(LATENCY_MS));
  }

  override signOut(): Observable<void> {
    return of(undefined).pipe(delay(LATENCY_MS));
  }
}
