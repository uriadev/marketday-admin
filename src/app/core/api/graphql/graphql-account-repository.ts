import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { map } from 'rxjs/operators';
import { AccountRepository } from '../ports/account-repository';
import {
  Account,
  AccountDirectoryPage,
  AccountListQuery,
  SignUpFilter,
} from '../../models/account.model';
import { GraphqlClient } from './graphql-client';
import { ADMIN_USERS, RESTORE_USER, SUSPEND_USER } from './operations/account';
import { REQUEST_PASSWORD_RESET } from './operations/profile';
import { GQL_ROLE, GQL_STATUS, toAccount } from './mappers/account-mapper';
import {
  AdminUsersQuery,
  AdminUsersQueryVariables,
  FilterInput,
  FilterOperator,
  RequestPasswordResetMutation,
  RequestPasswordResetMutationVariables,
  RestoreUserMutation,
  RestoreUserMutationVariables,
  SuspendUserMutation,
  SuspendUserMutationVariables,
} from './generated';

const DAY = 24 * 60 * 60_000;

/**
 * The "Signed up" menu as `createdAt` filters. "This year" starts at
 * 1 January in the admin's own time zone — the year they are looking at —
 * and "Before this year" is its complement, so the three never overlap
 * except where the menu says they do (the last 30 days are also this year).
 */
function signedUpCriteria(signedUp: SignUpFilter, now: Date): FilterInput[] {
  const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();
  switch (signedUp) {
    case 'any':
      return [];
    case 'last30':
      return [
        {
          field: 'createdAt',
          operator: FilterOperator.Gte,
          value: new Date(now.getTime() - 30 * DAY).toISOString(),
        },
      ];
    case 'thisYear':
      return [{ field: 'createdAt', operator: FilterOperator.Gte, value: yearStart }];
    case 'earlier':
      return [{ field: 'createdAt', operator: FilterOperator.Lt, value: yearStart }];
  }
}

/**
 * `adminUsers`, `suspendUser` and `restoreUser` — all `@Roles(ADMIN)`, added
 * server-side to close `docs/backend-api-gaps.md` #1 — are the whole of this
 * adapter, plus the public `requestPasswordReset` the Forgot password screen
 * already uses.
 *
 * `list()` pages **server-side** and pushes every filter down: the search as
 * `search` (name or email, the one question two columns answer), the status as
 * `status` (derived by the backend from `suspendedAt` and the credential
 * columns), the role and the sign-up window as `CriteriaInput` filters. The
 * header's count and the menus' counts ride in the same document as aliases,
 * so the screen never holds more than a page.
 *
 * Two roles have no column behind them. Nothing server-side records which
 * admins organise a market or answer support, so every `ADMIN` reads as a
 * platform admin and "Organiser" / "Support agent" match nothing — the call
 * still goes out, because the counts have to, but its page is discarded.
 *
 * What the screen still cannot do against this backend: invite a team member
 * (no admin-scoped invite endpoint), change a role from the console (`setRole`
 * exists but is left unwired on purpose — see the gaps doc), or export.
 */
@Injectable()
export class GraphqlAccountRepository extends AccountRepository {
  private readonly client = inject(GraphqlClient);

  override list(query: AccountListQuery): Observable<AccountDirectoryPage> {
    const { filters, page } = query;
    const role = filters.role === null ? null : GQL_ROLE[filters.role];
    // A role the backend has no value for matches nothing; don't ask for rows.
    const unbacked = filters.role !== null && role === undefined;
    const now = new Date();

    const variables: AdminUsersQueryVariables = {
      search: filters.q.trim() || null,
      status: filters.status === null ? null : GQL_STATUS[filters.status],
      criteria: unbacked
        ? { limit: 1 }
        : {
            filters: [
              ...(role ? [{ field: 'role', operator: FilterOperator.Equal, value: role }] : []),
              ...signedUpCriteria(filters.signedUp, now),
            ],
            limit: page.size,
            offset: page.index * page.size,
          },
    };

    return this.client
      .request<AdminUsersQuery, AdminUsersQueryVariables>(ADMIN_USERS, variables)
      .pipe(
        map((result) => {
          const suspended = result.suspended.totalCount;
          const invited = result.invited.totalCount;
          return {
            items: unbacked ? [] : result.adminUsers.items.map((user) => toAccount(user, now)),
            total: unbacked ? 0 : result.adminUsers.totalCount,
            facets: {
              accountCount: result.everyone.totalCount,
              roleCounts: {
                shopper: result.shoppers.totalCount,
                'vendor-staff': result.vendorStaff.totalCount,
                organiser: 0,
                support: 0,
                admin: result.admins.totalCount,
              },
              statusCounts: {
                // Six counts are six statements; one that moved between them
                // must not make this one negative.
                active: Math.max(0, result.everyone.totalCount - suspended - invited),
                invited,
                suspended,
              },
            },
          };
        }),
      );
  }

  /**
   * The backend refuses an empty reason, the calling admin's own account and
   * an account already suspended, each with its own sentence — which is what
   * the screen shows. The empty reason is caught here too, so the fixture's
   * message and this one agree without a round trip.
   */
  override suspend(id: string, reason: string): Observable<Account> {
    if (reason.trim() === '') {
      return throwError(() => new Error('A suspension needs a reason.'));
    }
    return this.client
      .request<SuspendUserMutation, SuspendUserMutationVariables>(SUSPEND_USER, {
        input: { userId: id, reason: reason.trim() },
      })
      .pipe(map((result) => toAccount(result.suspendUser)));
  }

  override restore(id: string): Observable<Account> {
    return this.client
      .request<RestoreUserMutation, RestoreUserMutationVariables>(RESTORE_USER, { userId: id })
      .pipe(map((result) => toAccount(result.restoreUser)));
  }

  /**
   * `requestPasswordReset` is public and always answers `true`, whether or not
   * the address has an account — so a success here means "sent if it exists",
   * which for an address read off this list is "sent". A Google- or
   * Apple-only account gets a "use the button you signed up with" mail instead
   * of a code, which is the backend's call and the right one.
   */
  override sendPasswordReset(email: string): Observable<void> {
    return this.client
      .request<RequestPasswordResetMutation, RequestPasswordResetMutationVariables>(
        REQUEST_PASSWORD_RESET,
        { input: { email } },
      )
      .pipe(map(() => undefined));
  }
}
