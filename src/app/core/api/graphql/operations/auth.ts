import { gql } from '../gql-tag';

export const LOGIN = gql`
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      accessToken
      refreshToken
      user {
        id
        fullName
        email
        role
      }
    }
  }
`;

/**
 * Aliases the mutation's own `refreshToken: String!` field to `session` so it
 * doesn't collide with the mutation name `refreshToken` in the response path.
 * Shared by `core/auth/auth-interceptor.ts` (which cannot depend on
 * `GraphqlAuthRepository` — see that file) and `GraphqlAuthRepository.signOut`'s
 * sibling, so both send exactly the same document.
 */
export const REFRESH_SESSION = gql`
  mutation RefreshSession($input: RefreshTokenInput!) {
    session: refreshToken(input: $input) {
      accessToken
      refreshToken
    }
  }
`;

export const LOGOUT = gql`
  mutation Logout {
    logout
  }
`;
