import { HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, TimeoutError, of, throwError } from 'rxjs';
import { catchError, map, retry, switchMap, timeout } from 'rxjs/operators';
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { AuthRepository, SignInOutcome } from '../ports/auth-repository';
import { AdminUser } from '../../models/admin-user.model';
import { SIGN_IN } from '../../auth/auth-interceptor';
import { TokenStore } from '../../auth/token-store';
import { WebAuthn } from '../../auth/webauthn';
import { GraphqlClient } from './graphql-client';
import { LOGIN, LOGOUT, PASSKEY_AUTH, PASSKEY_AUTHENTICATION_OPTIONS } from './operations/auth';
import {
  LoginMutation,
  LoginMutationVariables,
  LogoutMutation,
  PasskeyAuthMutation,
  PasskeyAuthMutationVariables,
  PasskeyAuthenticationOptionsMutation,
  UserRole,
} from './generated';

type AuthPayload = LoginMutation['login'] | PasskeyAuthMutation['passkeyAuth'];

/** See `SIGN_IN`: an unauthorised answer to these is the answer, not an expired session. */
const SIGN_IN_CALL = new HttpContext().set(SIGN_IN, true);

/**
 * The backend spends a passkey challenge after five minutes
 * (`CHALLENGE_TTL_MS` in `../backend/src/auth/passkey.service.ts`). An autofill
 * offer can sit in the email field far longer, so it is renewed — fresh
 * challenge, fresh offer — a little before that.
 */
const AUTOFILL_RENEW_MS = 4.5 * 60 * 1000;

function toAdminUser(user: AuthPayload['user']): AdminUser {
  return { id: user.id, name: user.fullName, email: user.email, role: 'Admin' };
}

/**
 * `login` completes in one step — there is no code-challenge endpoint, so
 * `signIn` always resolves `{ kind: 'signed-in' }` or throws; `verifyCode`
 * exists only to satisfy the port and is never reached (`codeChallengeGuard`
 * never opens `/login/verify` when `AuthStore.awaitingCode()` stays false).
 */
@Injectable()
export class GraphqlAuthRepository extends AuthRepository {
  private readonly client = inject(GraphqlClient);
  private readonly tokens = inject(TokenStore);
  private readonly webAuthn = inject(WebAuthn);

  override signIn(email: string, password: string): Observable<SignInOutcome> {
    const vars: LoginMutationVariables = { input: { email, password } };
    return this.client
      .request<LoginMutation, LoginMutationVariables>(LOGIN, vars, SIGN_IN_CALL)
      .pipe(map(({ login }) => ({ kind: 'signed-in' as const, user: this.startSession(login) })));
  }

  override verifyCode(): Observable<AdminUser> {
    return throwError(() => new Error('This account does not use a verification code.'));
  }

  /**
   * Two round trips around the browser's prompt: fetch the options and the
   * challenge they carry, let the authenticator sign it, then trade the
   * signature for the same tokens `login` returns.
   */
  override signInWithPasskey({ autofill = false } = {}): Observable<AdminUser> {
    const picked = this.client
      .request<PasskeyAuthenticationOptionsMutation>(
        PASSKEY_AUTHENTICATION_OPTIONS,
        undefined,
        SIGN_IN_CALL,
      )
      .pipe(
        switchMap(({ passkeyAuthenticationOptions: { challengeId, options } }) =>
          this.webAuthn
            .get(options as PublicKeyCredentialRequestOptionsJSON, { autofill })
            .pipe(map((response) => ({ challengeId, response }))),
        ),
      );

    // Renewal wraps only the wait for a pick, never the verification after it —
    // a renewal landing mid-request would otherwise cancel a real sign-in.
    const offered = autofill
      ? picked.pipe(
          timeout(AUTOFILL_RENEW_MS),
          retry({
            delay: (err: unknown) =>
              err instanceof TimeoutError ? of(true) : throwError(() => err),
          }),
          // The port's contract for an offer that cannot be made or is
          // withdrawn: end quietly. There is no one to tell.
          catchError(() => EMPTY),
        )
      : picked;

    return offered.pipe(
      switchMap(({ challengeId, response }) =>
        this.client.request<PasskeyAuthMutation, PasskeyAuthMutationVariables>(
          PASSKEY_AUTH,
          { input: { challengeId, response } },
          SIGN_IN_CALL,
        ),
      ),
      map(({ passkeyAuth }) => this.startSession(passkeyAuth)),
    );
  }

  override signOut(): Observable<void> {
    return this.client.request<LogoutMutation>(LOGOUT).pipe(map(() => undefined));
  }

  /**
   * Checked before any token is stored — a rejected sign-in leaves nothing
   * behind for this device to still be signed in with. The backend issues
   * tokens to any role; only an admin may keep them here.
   */
  private startSession({ accessToken, refreshToken, user }: AuthPayload): AdminUser {
    if (user.role !== UserRole.Admin) {
      throw new Error('This account does not have admin access.');
    }
    this.tokens.set(accessToken, refreshToken);
    return toAdminUser(user);
  }
}
