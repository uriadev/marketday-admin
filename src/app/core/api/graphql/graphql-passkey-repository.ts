import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser';
import { PasskeyRepository } from '../ports/passkey-repository';
import { Passkey } from '../../models/passkey.model';
import { WebAuthn } from '../../auth/webauthn';
import { GraphqlClient } from './graphql-client';
import {
  DELETE_PASSKEY,
  MY_PASSKEYS,
  PASSKEY_REGISTRATION_OPTIONS,
  RENAME_PASSKEY,
  VERIFY_PASSKEY_REGISTRATION,
} from './operations/passkey';
import {
  DeletePasskeyMutation,
  DeletePasskeyMutationVariables,
  MyPasskeysQuery,
  PasskeyFieldsFragment,
  PasskeyRegistrationOptionsMutation,
  RenamePasskeyMutation,
  RenamePasskeyMutationVariables,
  VerifyPasskeyRegistrationMutation,
  VerifyPasskeyRegistrationMutationVariables,
} from './generated';

function toPasskey(row: PasskeyFieldsFragment): Passkey {
  return {
    id: row.id,
    name: row.name,
    synced: row.backedUp,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}

/**
 * `myPasskeys` and the passkey mutations on `../backend`'s `PasskeyResolver`,
 * every one scoped server-side to the caller — there is no way to name another
 * admin's passkey from here.
 */
@Injectable()
export class GraphqlPasskeyRepository extends PasskeyRepository {
  private readonly client = inject(GraphqlClient);
  private readonly webAuthn = inject(WebAuthn);

  override list(): Observable<Passkey[]> {
    return this.client
      .request<MyPasskeysQuery>(MY_PASSKEYS)
      .pipe(map(({ myPasskeys }) => myPasskeys.map(toPasskey)));
  }

  /**
   * Two round trips around the browser's prompt: fetch the options and the
   * challenge they carry, let the authenticator make a key pair, then hand the
   * backend the public half to verify and store. No name is sent — the backend
   * calls it "Passkey", and the Security page asks for a better one after.
   */
  override register(): Observable<Passkey> {
    return this.client
      .request<PasskeyRegistrationOptionsMutation>(PASSKEY_REGISTRATION_OPTIONS)
      .pipe(
        switchMap(({ passkeyRegistrationOptions: { challengeId, options } }) =>
          this.webAuthn
            .create(options as PublicKeyCredentialCreationOptionsJSON)
            .pipe(
              switchMap((response) =>
                this.client.request<
                  VerifyPasskeyRegistrationMutation,
                  VerifyPasskeyRegistrationMutationVariables
                >(VERIFY_PASSKEY_REGISTRATION, { input: { challengeId, response } }),
              ),
            ),
        ),
        map(({ verifyPasskeyRegistration }) => toPasskey(verifyPasskeyRegistration)),
      );
  }

  override rename(id: string, name: string): Observable<Passkey> {
    return this.client
      .request<RenamePasskeyMutation, RenamePasskeyMutationVariables>(RENAME_PASSKEY, {
        input: { id, name },
      })
      .pipe(map(({ renamePasskey }) => toPasskey(renamePasskey)));
  }

  override remove(id: string): Observable<void> {
    return this.client
      .request<DeletePasskeyMutation, DeletePasskeyMutationVariables>(DELETE_PASSKEY, { id })
      .pipe(map(() => undefined));
  }
}
