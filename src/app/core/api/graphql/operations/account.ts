import { gql } from '../gql-tag';

/**
 * Every field `account-mapper.ts` reads, in one place so the operations below
 * can't drift. `AdminUserModel` is the admin-only projection of a user: the
 * status is derived server-side (suspended / no way to sign in yet / active),
 * `lastSeenAt` is the last sign-in or session refresh, and the vendor is the
 * one this person holds a seat at — three fields of it, which is all "Attached
 * to" links with.
 */
const ADMIN_USER_FIELDS = gql`
  fragment AdminUserFields on AdminUserModel {
    id
    email
    fullName
    role
    status
    createdAt
    lastSeenAt
    vendor {
      id
      slug
      name
    }
    suspensionReason
    suspendedByName
  }
`;

/**
 * The Users screen (design 1i) — `@Roles(ADMIN)`, every account on the
 * platform, one page at a time.
 *
 * `search` matches name **or** email and `status` is the derived one; both sit
 * beside `criteria` because neither can be spelled as a `CriteriaInput`
 * filter. `criteria` carries the page (`limit`/`offset`), the role and the
 * sign-up window. No `orderBy`: the backend's default — most recently active
 * first, never-seen last, id as the tiebreak — is the order the design wants,
 * and one `CriteriaInput` sort field could not say "NULLS LAST".
 *
 * The aliases are the same query asked six more questions in the same round
 * trip — the header's count and the Role and Status menus' counts, which
 * describe every account rather than the page. Each is literally the
 * `totalCount` picking that menu entry would produce, so a menu can never
 * promise a number its filter then fails to show. `limit: 1` because only the
 * count is selected; `limit: 0` would read as "no limit" server-side.
 */
export const ADMIN_USERS = gql`
  ${ADMIN_USER_FIELDS}
  query AdminUsers($search: String, $status: AdminUserStatus, $criteria: CriteriaInput) {
    adminUsers(search: $search, status: $status, criteria: $criteria) {
      totalCount
      items {
        ...AdminUserFields
      }
    }
    everyone: adminUsers(criteria: { limit: 1 }) {
      totalCount
    }
    shoppers: adminUsers(
      criteria: { limit: 1, filters: [{ field: "role", operator: EQUAL, value: "BUYER" }] }
    ) {
      totalCount
    }
    vendorStaff: adminUsers(
      criteria: { limit: 1, filters: [{ field: "role", operator: EQUAL, value: "VENDOR" }] }
    ) {
      totalCount
    }
    admins: adminUsers(
      criteria: { limit: 1, filters: [{ field: "role", operator: EQUAL, value: "ADMIN" }] }
    ) {
      totalCount
    }
    suspended: adminUsers(status: SUSPENDED, criteria: { limit: 1 }) {
      totalCount
    }
    invited: adminUsers(status: INVITED, criteria: { limit: 1 }) {
      totalCount
    }
  }
`;

/**
 * Suspends an account — `@Roles(ADMIN)`. The backend signs it out everywhere
 * (refresh and push tokens cleared, live access tokens refused on their next
 * request) and refuses new sign-ins until `restoreUser`. It will not suspend
 * the calling admin, and tells a second admin the account already is.
 */
export const SUSPEND_USER = gql`
  ${ADMIN_USER_FIELDS}
  mutation SuspendUser($input: SuspendUserInput!) {
    suspendUser(input: $input) {
      ...AdminUserFields
    }
  }
`;

/** Re-opens a suspended account — `@Roles(ADMIN)`. Nothing was removed. */
export const RESTORE_USER = gql`
  ${ADMIN_USER_FIELDS}
  mutation RestoreUser($userId: ID!) {
    restoreUser(userId: $userId) {
      ...AdminUserFields
    }
  }
`;
