import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { map } from 'rxjs/operators';
import { ProfileRepository } from '../ports/profile-repository';
import { AdminProfile, AdminProfilePatch } from '../../models/admin-user.model';
import { GraphqlClient } from './graphql-client';
import { ME, REQUEST_PASSWORD_RESET, UPDATE_ME } from './operations/profile';
import { defaultLocalOnly, joinName, toAdminProfile } from './mappers/profile-mapper';
import {
  MeQuery,
  MeQueryVariables,
  RequestPasswordResetMutation,
  RequestPasswordResetMutationVariables,
  UpdateMeMutation,
  UpdateMeMutationVariables,
} from './generated';

/**
 * `me`, `updateMe` and `requestPasswordReset` are all real and unguarded
 * beyond a valid session. `twoFactor`/notification prefs have no column —
 * see `mappers/profile-mapper.ts` — so this instance keeps them in memory for
 * the session rather than pretending they persisted or silently dropping
 * whatever the person just set.
 */
@Injectable()
export class GraphqlProfileRepository extends ProfileRepository {
  private readonly client = inject(GraphqlClient);

  private localOnly = defaultLocalOnly();
  /** The signed-in admin's own email, learned from `me`; `sendPasswordReset` needs it. */
  private email = '';

  override profile(): Observable<AdminProfile> {
    return this.client.request<MeQuery, MeQueryVariables>(ME, {}).pipe(
      map((result) => {
        this.email = result.me.email;
        return toAdminProfile(result.me, this.localOnly);
      }),
    );
  }

  override save(patch: AdminProfilePatch): Observable<AdminProfile> {
    this.localOnly = {
      twoFactor: patch.twoFactor,
      twoFactorHint: this.localOnly.twoFactorHint,
      notifications: patch.notifications,
    };
    const vars: UpdateMeMutationVariables = {
      input: {
        fullName: joinName(patch.firstName, patch.lastName),
        phone: patch.phone || undefined,
        avatarUrl: patch.avatarUrl ?? undefined,
      },
    };
    return this.client.request<UpdateMeMutation, UpdateMeMutationVariables>(UPDATE_ME, vars).pipe(
      map((result) => {
        this.email = result.updateMe.email;
        return toAdminProfile(result.updateMe, this.localOnly);
      }),
    );
  }

  override sendPasswordReset(): Observable<void> {
    if (!this.email) {
      return throwError(() => new Error('Load your profile before requesting a reset.'));
    }
    const vars: RequestPasswordResetMutationVariables = { input: { email: this.email } };
    return this.client
      .request<RequestPasswordResetMutation, RequestPasswordResetMutationVariables>(
        REQUEST_PASSWORD_RESET,
        vars,
      )
      .pipe(map(() => undefined));
  }
}
