import { gql } from '../gql-tag';

export const ME = gql`
  query Me {
    me {
      id
      fullName
      email
      phone
      avatarUrl
      role
      hasPassword
    }
  }
`;

/** `updateMe` returns `UserModel!`, not `UserProfileModel!` — same fields we need. */
export const UPDATE_ME = gql`
  mutation UpdateMe($input: UpdateUserInput!) {
    updateMe(input: $input) {
      id
      fullName
      email
      phone
      avatarUrl
      role
      hasPassword
    }
  }
`;

export const REQUEST_PASSWORD_RESET = gql`
  mutation RequestPasswordReset($input: RequestPasswordResetInput!) {
    requestPasswordReset(input: $input)
  }
`;
