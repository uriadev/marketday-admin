import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthRepository, SignInOutcome } from '../ports/auth-repository';
import { AdminUser } from '../../models/admin-user.model';
import { TokenStore } from '../../auth/token-store';
import { GraphqlClient } from './graphql-client';
import { LOGIN, LOGOUT } from './operations/auth';
import { LoginMutation, LoginMutationVariables, LogoutMutation, UserRole } from './generated';

function toAdminUser(user: LoginMutation['login']['user']): AdminUser {
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

  override signIn(email: string, password: string): Observable<SignInOutcome> {
    const vars: LoginMutationVariables = { input: { email, password } };
    return this.client.request<LoginMutation, LoginMutationVariables>(LOGIN, vars).pipe(
      map(({ login }) => {
        // Checked before any token is stored — a rejected sign-in leaves
        // nothing behind for this device to still be signed in with.
        if (login.user.role !== UserRole.Admin) {
          throw new Error('This account does not have admin access.');
        }
        this.tokens.set(login.accessToken, login.refreshToken);
        return { kind: 'signed-in' as const, user: toAdminUser(login.user) };
      }),
    );
  }

  override verifyCode(): Observable<AdminUser> {
    return throwError(() => new Error('This account does not use a verification code.'));
  }

  override signOut(): Observable<void> {
    return this.client.request<LogoutMutation>(LOGOUT).pipe(map(() => undefined));
  }
}
