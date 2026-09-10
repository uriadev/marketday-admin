import { gql } from '../gql-tag';

/** Every field `GraphqlPasskeyRepository` reads, so the operations below can't drift. */
const PASSKEY_FIELDS = gql`
  fragment PasskeyFields on PasskeyModel {
    id
    name
    backedUp
    createdAt
    lastUsedAt
  }
`;

export const MY_PASSKEYS = gql`
  query MyPasskeys {
    myPasskeys {
      ...PasskeyFields
    }
  }
  ${PASSKEY_FIELDS}
`;

/**
 * Step 1 of adding a passkey: the options `startRegistration` takes. A mutation
 * because the backend records the challenge it is about to check against.
 */
export const PASSKEY_REGISTRATION_OPTIONS = gql`
  mutation PasskeyRegistrationOptions {
    passkeyRegistrationOptions {
      challengeId
      options
    }
  }
`;

/** Step 2: the new credential, which the backend verifies before storing it. */
export const VERIFY_PASSKEY_REGISTRATION = gql`
  mutation VerifyPasskeyRegistration($input: VerifyPasskeyRegistrationInput!) {
    verifyPasskeyRegistration(input: $input) {
      ...PasskeyFields
    }
  }
  ${PASSKEY_FIELDS}
`;

export const RENAME_PASSKEY = gql`
  mutation RenamePasskey($input: RenamePasskeyInput!) {
    renamePasskey(input: $input) {
      ...PasskeyFields
    }
  }
  ${PASSKEY_FIELDS}
`;

export const DELETE_PASSKEY = gql`
  mutation DeletePasskey($id: ID!) {
    deletePasskey(id: $id)
  }
`;
