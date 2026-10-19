import { gql } from '../gql-tag';

/**
 * Every field `promotion-mapper.ts` reads, for the list and the form alike.
 *
 * The subject is one of `event`/`market`/`vendor`/`product` (or `linkUrl`),
 * each with what the console shows of it: a name, an image, and enough to
 * link to its page. `headline`/`imageUrl` come back already falling back to
 * the subject's own; the mapper tells the creative's apart by comparing.
 */
const ADMIN_PROMOTION_FIELDS = gql`
  fragment AdminPromotionFields on AdminPromotionModel {
    id
    targetKind
    event {
      id
      title
      imageUrl
    }
    market {
      id
      slug
      name
      imageUrl
    }
    vendor {
      id
      slug
      name
      imageUrl
    }
    product {
      id
      name
      imageUrl
      vendorId
      vendor {
        slug
      }
    }
    linkUrl
    placement
    status
    servingState
    startsAt
    endsAt
    priority
    headline
    body
    imageUrl
    ctaLabel
    sponsorName
    sponsorVendorId
    isHouse
    disclosure
    isNationwide
    reachLatitude
    reachLongitude
    reachRadiusKm
    marketIds
  }
`;

/**
 * The Promotions list — `@Roles(ADMIN)`, one page at a time. The aliases are
 * the header's and the Status menu's counts. `servingState` is derived, not a
 * column, so it cannot be filtered on; the list filters on stored `status`.
 */
export const ADMIN_PROMOTIONS = gql`
  ${ADMIN_PROMOTION_FIELDS}
  query AdminPromotions($criteria: CriteriaInput) {
    adminPromotions(criteria: $criteria) {
      totalCount
      items {
        ...AdminPromotionFields
      }
    }
    everyPromotion: adminPromotions(criteria: { limit: 1 }) {
      totalCount
    }
    draftPromotions: adminPromotions(
      criteria: { limit: 1, filters: [{ field: "status", operator: EQUAL, value: "DRAFT" }] }
    ) {
      totalCount
    }
    scheduledPromotions: adminPromotions(
      criteria: { limit: 1, filters: [{ field: "status", operator: EQUAL, value: "SCHEDULED" }] }
    ) {
      totalCount
    }
    pausedPromotions: adminPromotions(
      criteria: { limit: 1, filters: [{ field: "status", operator: EQUAL, value: "PAUSED" }] }
    ) {
      totalCount
    }
  }
`;

/**
 * One promotion for the form, and every public market — what a promotion can
 * be scoped to or promote. A food-truck stop is never a market here: it is
 * advertised through its vendor, for the reason stops are kept out of every
 * public market list.
 */
export const PROMOTION_FORM = gql`
  ${ADMIN_PROMOTION_FIELDS}
  query PromotionForm($id: ID!, $withPromotion: Boolean!) {
    adminPromotion(id: $id) @include(if: $withPromotion) {
      ...AdminPromotionFields
    }
    adminMarkets(
      criteria: {
        limit: 500
        orderBy: "name"
        orderDir: ASC
        filters: [{ field: "kind", operator: EQUAL, value: "PUBLIC_MARKET" }]
      }
    ) {
      id
      name
      status
      location
    }
  }
`;

export const CREATE_PROMOTION = gql`
  ${ADMIN_PROMOTION_FIELDS}
  mutation CreatePromotion($input: CreatePromotionInput!) {
    createPromotion(input: $input) {
      ...AdminPromotionFields
    }
  }
`;

/** `marketIds`, when present, is the whole list (end-state, not a patch). */
export const UPDATE_PROMOTION = gql`
  ${ADMIN_PROMOTION_FIELDS}
  mutation UpdatePromotion($id: ID!, $input: UpdatePromotionInput!) {
    updatePromotion(id: $id, input: $input) {
      ...AdminPromotionFields
    }
  }
`;

/** Schedule, pause, resume — the operational switch, apart from the form. */
export const SET_PROMOTION_STATUS = gql`
  ${ADMIN_PROMOTION_FIELDS}
  mutation SetPromotionStatus($id: ID!, $status: PromotionStatus!) {
    setPromotionStatus(id: $id, status: $status) {
      ...AdminPromotionFields
    }
  }
`;

export const DELETE_PROMOTION = gql`
  mutation DeletePromotion($id: ID!) {
    deletePromotion(id: $id)
  }
`;

/**
 * Events by title for the subject picker. Status-blind, like every admin
 * read: a draft event can be booked ahead and serves once it is published.
 */
export const PROMOTION_EVENT_OPTIONS = gql`
  query PromotionEventOptions($criteria: CriteriaInput) {
    adminEvents(criteria: $criteria) {
      items {
        id
        title
        status
        startsAt
        endsAt
        areaName
      }
    }
  }
`;

/** Vendors by name — for a vendor subject, a product's vendor, or the sponsor. */
export const PROMOTION_VENDOR_OPTIONS = gql`
  query PromotionVendorOptions($criteria: CriteriaInput) {
    adminVendors(criteria: $criteria) {
      items {
        id
        name
        category
        isActive
      }
    }
  }
`;

/** One vendor's products, for a product subject. */
export const PROMOTION_PRODUCT_OPTIONS = gql`
  query PromotionProductOptions($vendorId: ID!) {
    products(vendorId: $vendorId, criteria: { limit: 500, orderBy: "name", orderDir: ASC }) {
      items {
        id
        name
        isAvailable
      }
    }
  }
`;

/** Where the subjects sit, for the default reach centre. */
export const PROMOTION_EVENT_POINT = gql`
  query PromotionEventPoint($id: ID!) {
    adminEvent(id: $id) {
      latitude
      longitude
    }
  }
`;

export const PROMOTION_VENDOR_POINTS = gql`
  query PromotionVendorPoints($id: ID!) {
    vendor(id: $id) {
      markets {
        kind
        location
      }
    }
  }
`;

/** A product's vendor, then that vendor's markets — one read of `product(id)`. */
export const PROMOTION_PRODUCT_POINTS = gql`
  query PromotionProductPoints($id: ID!) {
    product(id: $id) {
      vendor {
        markets {
          kind
          location
        }
      }
    }
  }
`;

/** A prefill link's subject, resolved to a name and an image. */
export const PROMOTION_PREFILL_EVENT = gql`
  query PromotionPrefillEvent($id: ID!) {
    adminEvent(id: $id) {
      id
      title
      imageUrl
    }
  }
`;

export const PROMOTION_PREFILL_VENDOR = gql`
  query PromotionPrefillVendor($id: ID!) {
    vendor(id: $id) {
      id
      slug
      name
      imageUrl
    }
  }
`;
