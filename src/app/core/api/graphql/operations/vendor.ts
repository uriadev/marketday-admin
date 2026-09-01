import { gql } from '../gql-tag';

/**
 * Every field `vendor-mapper.ts` reads, in one place so the operations below
 * can't drift. `VendorModel` is still a thin record: no per-market
 * fee/standing, no application or document model (`docs/backend-api-gaps.md`
 * #5, #9), so the directory row and the detail shell are built from identity,
 * status, the `markets` relation and `memberCount`. The roster itself is not on
 * this type — it lives on the admin-only `adminVendorMembers` query
 * ({@link ADMIN_VENDOR_MEMBERS}), which `detail()` folds in for the Staff tab;
 * the directory does not fan out to it, so `staff` names stay empty on the list
 * read. `slug` is server-issued (gap #10 closed).
 */
const VENDOR_FIELDS = gql`
  fragment VendorFields on VendorModel {
    id
    slug
    name
    category
    description
    imageUrl
    isActive
    isAcceptingOrders
    memberCount
    createdAt
    markets {
      id
      slug
      name
      city
      schedule
    }
  }
`;

/** The admin directory list (design 1a) — `@Roles(ADMIN)`, every vendor on the platform. */
export const ADMIN_VENDORS = gql`
  ${VENDOR_FIELDS}
  query AdminVendors($criteria: CriteriaInput) {
    adminVendors(criteria: $criteria) {
      totalCount
      items {
        ...VendorFields
      }
    }
  }
`;

/** One vendor for the detail shell and Profile tab. The console routes by
 *  slug; `GraphqlVendorRepository` maps slug → id from `adminVendors` first. */
export const VENDOR_BY_ID = gql`
  ${VENDOR_FIELDS}
  query VendorById($id: ID!) {
    vendor(id: $id) {
      ...VendorFields
    }
  }
`;

/**
 * One vendor's team (design 1c) — `@Roles(ADMIN)`, and the only path to the
 * roster: it is deliberately not a field on `VendorModel`, so the public
 * `vendor(id)` query never hands out every staff member's email. One vendor's
 * seats are `{ field: "vendorId", operator: EQUAL, value: id }`; the backend
 * returns one row per seat, so a stallholder at two markets is two rows that
 * `toVendorStaff` folds into one person. `VendorMemberModel` carries no phone
 * and no invitation state — a seat exists only once the invite is accepted.
 */
export const ADMIN_VENDOR_MEMBERS = gql`
  query AdminVendorMembers($criteria: CriteriaInput) {
    adminVendorMembers(criteria: $criteria) {
      totalCount
      items {
        id
        userId
        fullName
        email
        role
        market {
          id
          name
        }
      }
    }
  }
`;
